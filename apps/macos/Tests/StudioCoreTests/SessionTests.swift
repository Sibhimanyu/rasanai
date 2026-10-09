import Foundation
import XCTest
@testable import StudioCore

final class SessionTests: XCTestCase {
    func snapshot(_ json: String) throws -> SessionSnapshot { try SessionSnapshot(data: Data(json.utf8)) }

    func testSceneTimingAndOriginalNumericIDs() throws {
        let film = try snapshot(#"{"title":"Film","current":"animatic","steps":{"animatic":{"scenes":[{"id":1,"title":"One","duration":6},{"id":"two","title":"Two","duration":4}]}}}"#)
        XCTAssertEqual(film.duration, 10)
        XCTAssertEqual(film.scenes[1].start, 6)
        XCTAssertEqual(film.scenes[0].originalID, .number(1))
        XCTAssertEqual(film.scene(at: 5.999)?.id, "1")
        XCTAssertEqual(film.scene(at: 6)?.id, "two")
        XCTAssertEqual(film.scene(at: 10)?.id, "two")
    }

    func testFinalMarkersInferDurations() throws {
        let film = try snapshot(#"{"steps":{"render":{"duration":20,"scenes":[{"id":"a","start":0},{"id":"b","start":12}],"videos":["old.mp4","new.mp4"]}}}"#)
        XCTAssertEqual(film.scenes.map(\.duration), [12, 8])
        XCTAssertEqual(film.finalVideo, "new.mp4")
    }

    func testPartialBuildAndLegacyStages() throws {
        let film = try snapshot(#"{"current":"build","steps":{"build":{"scenes":[{"title":"Work in progress","duration":0,"state":"working"}]}}}"#)
        XCTAssertEqual(film.stage, .animatic)
        XCTAssertEqual(film.duration, 4)
        XCTAssertEqual(film.scenes[0].id, "1")
        XCTAssertEqual(ReviewStage.consoleStep("render"), .final)
        XCTAssertEqual(ReviewStage.consoleStep("motion"), .look)
        XCTAssertEqual(ReviewStage.consoleStep("footage"), .brief)
    }

    func testBuildAndFinalUseTheirPublishedScenesInsteadOfStaleAnimatic() throws {
        let json = #"{"current":"build","steps":{"animatic":{"scenes":[{"id":1,"duration":6,"thumb":"rough.png"}]},"build":{"scenes":[{"id":1,"duration":7,"frame":"built.png","state":"done"}]},"render":{"duration":8,"scenes":[{"id":1,"start":0,"thumb":"final.png"}]}}}"#
        let building = try snapshot(json)
        XCTAssertEqual(building.scenes.first?.thumbnail, "built.png")
        XCTAssertEqual(building.duration, 7)
        let rendered = try snapshot(json.replacingOccurrences(of: #""current":"build""#, with: #""current":"render""#))
        XCTAssertEqual(rendered.scenes.first?.thumbnail, "final.png")
        XCTAssertEqual(rendered.duration, 8)
        XCTAssertEqual(rendered.scenes(for: .animatic).first?.thumbnail, "rough.png")
        XCTAssertEqual(rendered.duration(for: .animatic), 6)
        XCTAssertEqual(rendered.scene(at: 5, stage: .animatic)?.thumbnail, "rough.png")
    }

    func testNotesPreserveStepScopeAndResolution() throws {
        let film = try snapshot(#"{"steps":{},"comments":[{"id":"n1","step":"animatic","t":13,"scene":3,"text":"Slow down","state":"resolved"},{"id":"n2","step":"render","scope":"film","text":"Quieter"}]}"#)
        XCTAssertEqual(film.notes[0].scene, "3")
        XCTAssertEqual(film.notes[0].state, "resolved")
        XCTAssertEqual(film.notes[1].step, "render")
        XCTAssertEqual(film.notes[1].scope, "film")
    }

    func testMalformedSessionsFailInsteadOfBecomingEmptyProjects() {
        XCTAssertThrowsError(try snapshot("[]"))
        XCTAssertThrowsError(try snapshot(#"{"title":"Film"}"#))
        XCTAssertThrowsError(try snapshot(#"{"steps":[]}"#))
        XCTAssertThrowsError(try snapshot("broken"))
    }

    func testAspectAndTimecode() throws {
        let film = try snapshot(#"{"steps":{"brief":{"fields":{"aspect":"9:16"}}}}"#)
        XCTAssertEqual(film.aspectRatio, 9.0 / 16)
        XCTAssertEqual(timecode(125.8), "02:05")
        XCTAssertEqual(timecode(-4), "00:00")
        XCTAssertEqual(timecode(.infinity), "00:00")
    }

    func testAssetsDoNotEscapeApprovedRootsOrExposeConsoleSecrets() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder.appendingPathComponent("run"), withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        try Data("frame".utf8).write(to: folder.appendingPathComponent("frame.png"))
        try Data("secret".utf8).write(to: folder.appendingPathComponent("run/address.json"))
        try Data("[]".utf8).write(to: folder.appendingPathComponent("run/rejected.json"))
        let resolver = AssetResolver(run: folder.appendingPathComponent("run"), workspace: folder)
        XCTAssertEqual(resolver.resolve("frame.png")?.lastPathComponent, "frame.png")
        XCTAssertNil(resolver.resolve("../../etc/passwd"))
        XCTAssertNil(resolver.resolve("/etc/passwd"))
        XCTAssertNil(resolver.resolve("run/address.json"))
        XCTAssertNil(resolver.resolve("run/rejected.json"))
        XCTAssertNil(resolver.resolve("https://example.com/frame.png"))
        try FileManager.default.createSymbolicLink(at: folder.appendingPathComponent("escape"), withDestinationURL: URL(fileURLWithPath: "/etc"))
        XCTAssertNil(resolver.resolve("escape/passwd"))
    }
}
