import Foundation
import XCTest
@testable import StudioCore

final class MotionStudioModelsTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures/MotionStudio"))
        return try Data(contentsOf: url)
    }
    private func tempDir() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("motion-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir
    }

    func testIndexDecodesIgnoresUnknownKeysAndResolvesHits() throws {
        let index = try MotionElementIndex.decode(try fixture("element-index"))
        XCTAssertEqual(index.allItems.count, 3)
        // t=0 the title covers the top-left quarter; the background is under it.
        let hits = MotionElementResolver.candidates(at: CGPoint(x: 0.25, y: 0.25), time: 0, in: index)
        XCTAssertEqual(hits.map(\.id), ["scene-1.hero-title", "scene-1.bg"])
        // t=2 the title has moved to the right half.
        XCTAssertEqual(MotionElementResolver.candidates(at: CGPoint(x: 0.25, y: 0.25), time: 2, in: index).map(\.id), ["scene-1.bg"])
        let mid = try XCTUnwrap(index.normalisedBounds(of: try XCTUnwrap(index.item(id: "scene-1.hero-title")), at: 1))
        XCTAssertEqual(mid.x, 0.25, accuracy: 1e-9)
        XCTAssertFalse(MotionElementResolver.candidates(at: CGPoint(x: 0.5, y: 0.5), time: 1, in: index).contains { $0.id == "scene-2.late" })
        XCTAssertTrue(MotionElementResolver.candidates(at: CGPoint(x: 0.5, y: 0.5), time: 7, in: index).contains { $0.id == "scene-2.late" })
        XCTAssertTrue(index.isStale(currentDigest: "zzz"))
        XCTAssertFalse(index.isStale(currentDigest: "abc123"))
    }

    func testSchemaVersionErrorsAreReadable() {
        XCTAssertThrowsError(try MotionElementIndex.decode(Data(#"{"schema_version":2}"#.utf8))) {
            XCTAssertTrue(($0 as? LocalizedError)?.errorDescription?.contains("version 2") ?? false)
        }
        XCTAssertThrowsError(try MotionKitCatalog.decode(Data(#"{"items":[]}"#.utf8))) {
            XCTAssertEqual($0 as? MotionStudioError, .missingSchemaVersion("motion-kit/catalog.json"))
        }
    }

    func testReferenceAndKitDecodeWithOnlyCoreFields() throws {
        let ref = try MotionReferenceSummary.decode(Data(#"{"schema_version":1,"analysis":{"shots":[{"start_s":0,"end_s":1.5}],"cuts_s":[1.5]}}"#.utf8))
        XCTAssertEqual(ref.analysis?.shots?.first?.endS, 1.5)
        XCTAssertNil(ref.recipe)
        let kit = try MotionKitCatalog.decode(Data(#"{"schema_version":1,"items":[{"id":"shape-wipe-v1","family":"shape","params":{"d":{"type":"number","default":0.4}}}]}"#.utf8))
        XCTAssertEqual(kit.items(inFamily: "shape").first?.annotation, "motion-kit:shape-wipe-v1@1")
        XCTAssertEqual(kit.item(id: "shape-wipe-v1")?.params?["d"]?.default, .number(0.4))
    }

    func testEditStatusLatestLineWinsAndEnvelopeGoesThroughTransport() throws {
        let text = """
        {"schema_version":1,"id":"edit-001","operation":"modify","instruction":"bigger","status":"requested"}
        not json
        {"schema_version":1,"id":"edit-001","status":"applied","note":"done"}
        """
        let status = MotionEditStatus.parse(text)
        XCTAssertEqual(status.lines.count, 1)
        XCTAssertEqual(status.state(of: "edit-001"), .applied)
        XCTAssertEqual(status.line(id: "edit-001")?.instruction, "bigger")
        XCTAssertEqual(status.skippedLines, 1)
        XCTAssertEqual(MotionEditRequest.nextID(after: ["edit-001", "edit-009"]), "edit-010")

        let run = try tempDir()
        let edit = MotionEditRequest(id: "edit-002", operation: .modify, timeS: 1.5, sceneId: "scene-1", elementId: "scene-1.hero-title",
                                     regionNorm: MotionNormRect(x: 0.1, y: 0.2, w: 0.3, h: 0.4), fields: ["text": .string("Hi")], instruction: "change text")
        let queued = try MotionEditEnvelope.send(edit, via: RunTransport(run: run))
        XCTAssertEqual(queued.type, "motion-edit")
        let line = try String(contentsOf: run.appendingPathComponent("actions.jsonl"), encoding: .utf8)
        let object = try JSONDecoder().decode(JSONValue.self, from: Data(line.utf8))
        XCTAssertEqual(object["value"]["kind"].string, "motion-edit")
        XCTAssertEqual(object["value"]["edit"]["element_id"].string, "scene-1.hero-title")
        XCTAssertEqual(object["value"]["edit"]["schema_version"].number, 1)
        XCTAssertEqual(object["value"]["edit"]["region_norm"]["w"].number, 0.3)
    }

    func testSafeRelativeRejectsEscapes() throws {
        let root = try tempDir(), outside = try tempDir()
        try FileManager.default.createDirectory(at: root.appendingPathComponent("motion"), withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("link"), withDestinationURL: outside)
        XCTAssertNoThrow(try MotionProjectPaths.safeRelative("motion/element-index.json", root: root))
        for bad in ["../x", "motion/../../x", "/etc/passwd", "link/secret.json", "~/x", ""] {
            XCTAssertThrowsError(try MotionProjectPaths.safeRelative(bad, root: root), bad)
        }
    }

    func testFilmPointForFitAndFill() {
        let film = CGSize(width: 1920, height: 1080)
        let view = CGSize(width: 1000, height: 1000)
        // Fit: letterboxed, the film fills only the middle band of the view.
        XCTAssertNil(MotionVideoGeometry.filmPoint(viewPoint: CGPoint(x: 500, y: 100), viewSize: view, filmSize: film, fit: .aspectFit))
        let c = MotionVideoGeometry.filmPoint(viewPoint: CGPoint(x: 500, y: 500), viewSize: view, filmSize: film, fit: .aspectFit)
        XCTAssertEqual(c?.x ?? -1, 0.5, accuracy: 1e-9)
        XCTAssertEqual(c?.y ?? -1, 0.5, accuracy: 1e-9)
        // Fill: the film is wider than the view and cropped left/right.
        let l = MotionVideoGeometry.filmPoint(viewPoint: CGPoint(x: 0, y: 0), viewSize: view, filmSize: film, fit: .aspectFill)
        XCTAssertEqual(l?.y ?? -1, 0, accuracy: 1e-9)
        XCTAssertEqual(l?.x ?? -1, (1000.0 * 16 / 9 - 1000) / 2 / (1000.0 * 16 / 9), accuracy: 1e-6)
    }

    func testStoreLoadNeverThrowsAndFlagsStale() throws {
        let root = try tempDir()
        XCTAssertFalse(MotionStudioStore.load(projectRoot: root).hasAnything)
        try FileManager.default.createDirectory(at: root.appendingPathComponent("motion"), withIntermediateDirectories: true)
        try fixture("element-index").write(to: root.appendingPathComponent("motion/element-index.json"))
        try Data(#"{"schema_version":9}"#.utf8).write(to: root.appendingPathComponent("reference-motion.json"))
        let store = MotionStudioStore.load(projectRoot: root, currentBuildDigest: "other")
        XCTAssertNotNil(store.elementIndex)
        XCTAssertTrue(store.indexIsStale)
        XCTAssertNil(store.reference)
        XCTAssertEqual(store.problems.count, 1)
    }
}
