import XCTest
@testable import StudioCore

final class MomentPickTests: XCTestCase {
    func testMomentsDefaultEmptyAndOldBriefsStillLoad() throws {
        XCTAssertEqual(FilmDraft().moments, [])
        XCTAssertFalse(FilmDraft(brief: "b").request(sources: []).contains("REFERENCE MOMENTS"))
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let old = #"{"brief":"b","duration":30,"aspect":"16:9","agent":"claude","motionLevel":"balanced"}"#
        try Data(old.utf8).write(to: dir.appendingPathComponent("rasanai-brief.json"))
        XCTAssertEqual(FilmDraft.load(in: dir)?.moments, [])
    }

    func testPickedMomentsRoundTripCapAtFourAndReachTheRequest() throws {
        let picks = [MomentPick(id: "M964", role: "hook"), MomentPick(id: "M977", role: "proof"), MomentPick(id: "M916", role: "turn"), MomentPick(id: "M984", role: "cta"), MomentPick(id: "M999", role: "proof")]
        let draft = FilmDraft(brief: "Launch Cues", moments: picks)
        XCTAssertEqual(draft.moments.count, 4)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try draft.save(in: dir)
        let json = try String(contentsOf: dir.appendingPathComponent("rasanai-brief.json"), encoding: .utf8)
        XCTAssertTrue(json.contains(#""moments""#))
        XCTAssertTrue(json.contains(#""role":"hook""#))
        XCTAssertEqual(FilmDraft.load(in: dir)?.moments, Array(picks.prefix(4)))
        let request = draft.request(sources: [])
        XCTAssertTrue(request.contains("REFERENCE MOMENTS"))
        XCTAssertTrue(request.contains("- M964 as the hook"))
        XCTAssertTrue(request.contains("- M984 as the cta"))
        XCTAssertFalse(request.contains("M999"))
        XCTAssertTrue(request.contains("moments.mjs fetch"))
        XCTAssertTrue(request.contains("Technique only"))
    }

    func testFiveMomentsInABriefFileAreCapped() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let json = #"{"brief":"b","duration":30,"aspect":"16:9","agent":"claude","moments":[{"id":"M1","role":"hook"},{"id":"M2","role":"proof"},{"id":"M3","role":"turn"},{"id":"M4","role":"cta"},{"id":"M5","role":"proof"}]}"#
        try Data(json.utf8).write(to: dir.appendingPathComponent("rasanai-brief.json"))
        XCTAssertEqual(FilmDraft.load(in: dir)?.moments.map(\.id), ["M1", "M2", "M3", "M4"])
    }
}
