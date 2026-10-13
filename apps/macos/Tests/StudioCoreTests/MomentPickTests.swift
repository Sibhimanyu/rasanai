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
        let picks = [FilmMoment(id: "M964", place: .opening), FilmMoment(id: "M977"), FilmMoment(id: "M916", place: .peak), FilmMoment(id: "M984", place: .ending), FilmMoment(id: "M999", place: .between)]
        let draft = FilmDraft(brief: "Launch Cues", moments: picks)
        XCTAssertEqual(draft.moments.count, 4)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try draft.save(in: dir)
        let json = try String(contentsOf: dir.appendingPathComponent("rasanai-brief.json"), encoding: .utf8)
        XCTAssertTrue(json.contains(#""moments""#))
        XCTAssertTrue(json.contains(#""place":"opening""#))
        XCTAssertEqual(FilmDraft.load(in: dir)?.moments, Array(picks.prefix(4)))
        let request = draft.request(sources: [])
        XCTAssertTrue(request.contains("REFERENCE MOMENTS"))
        XCTAssertTrue(request.contains("- M964 for the opening"))
        XCTAssertTrue(request.contains("- M984 for the ending"))
        XCTAssertTrue(request.contains("- M977 (anywhere it fits)"))
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

    func testLegacyRolesMapToPlaces() throws {
        let json = #"[{"id":"A","role":"hook"},{"id":"B","role":"cta"},{"id":"C","role":"proof"},{"id":"D","role":"turn"},{"id":"E","place":"peak","role":"hook"},{"id":"F","place":"bogus"},{"id":"G"}]"#
        let moments = try JSONDecoder().decode([FilmMoment].self, from: Data(json.utf8))
        XCTAssertEqual(moments.map(\.place), [.opening, .ending, .anywhere, .anywhere, .peak, .anywhere, .anywhere])
    }

    func testPlaceRoundTripsThroughTheBriefFile() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try FilmDraft(brief: "b", moments: [FilmMoment(id: "M1", place: .between), FilmMoment(id: "M2")]).save(in: dir)
        let json = try String(contentsOf: dir.appendingPathComponent("rasanai-brief.json"), encoding: .utf8)
        XCTAssertTrue(json.contains(#""place":"between""#))
        XCTAssertFalse(json.contains(#""role""#))
        XCTAssertEqual(FilmDraft.load(in: dir)?.moments, [FilmMoment(id: "M1", place: .between), FilmMoment(id: "M2", place: .anywhere)])
    }

    func testSelectionHasNoRolesCapsAtFourAndKeepsPlaces() {
        func move(_ id: String) -> Moment { Moment(id: id, name: id, clipURL: URL(string: "https://x.test/c.mp4")!, stillURL: URL(string: "https://x.test/s.jpg")!) }
        var selection = MomentSelection()
        for id in ["A", "B", "C", "D"] { XCTAssertTrue(selection.toggle(move(id))) }
        XCTAssertFalse(selection.toggle(move("E")))
        XCTAssertEqual(selection.picks.map(\.id), ["A", "B", "C", "D"])
        selection.setPlace(.ending, for: "B")
        XCTAssertEqual(selection.pick("B")?.place, .ending)
        selection.toggle(move("A"))
        XCTAssertEqual(selection.picks.map(\.id), ["B", "C", "D"])
        XCTAssertFalse(selection.isFull)
    }

    func testTechniqueGrouping() {
        XCTAssertEqual(Technique.group(for: "kinetic_type"), .kineticType)
        XCTAssertEqual(Technique.group(for: "glyph_scramble"), .kineticType)
        XCTAssertEqual(Technique.group(for: "cursor_click"), .uiAndCursor)
        XCTAssertEqual(Technique.group(for: "ui_transition"), .uiAndCursor)
        XCTAssertEqual(Technique.group(for: "mask_reveal"), .revealsAndMasks)
        XCTAssertEqual(Technique.group(for: "hard_cut"), .transitions)
        XCTAssertEqual(Technique.group(for: "counter"), .numbers)
        XCTAssertEqual(Technique.group(for: "camera_push"), .cameraAnd3D)
        XCTAssertEqual(Technique.group(for: "photo_collage"), .collageAndPhoto)
        XCTAssertEqual(Technique.group(for: "zzz_unknown"), .other)
        XCTAssertEqual(Technique.groups(for: ["counter", "kinetic_type", "stagger"]), [.kineticType, .numbers, .layoutAndMotion])
        XCTAssertEqual(Technique.kineticType.title, "Kinetic type")
    }
}
