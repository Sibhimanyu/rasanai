import XCTest
@testable import StudioCore

final class DirectorLaunchTests: XCTestCase {
    func testCodexDefaultsToRestrictedWorkspaceAndUsesStructuredArguments() throws {
        let launch = try make(.codex)
        XCTAssertTrue(launch.arguments.contains("workspace-write"))
        XCTAssertFalse(launch.arguments.contains("danger-full-access"))
        XCTAssertTrue(launch.prompt.contains("Do not create another run"))
        XCTAssertTrue(launch.prompt.contains("Wait for console actions"))
        XCTAssertEqual(launch.arguments.last, launch.prompt)
    }
    func testClaudeBypassRequiresExplicitOptIn() throws {
        XCTAssertFalse(try make(.claude).arguments.contains("--dangerously-skip-permissions"))
        XCTAssertTrue(try make(.claude, unrestricted: true).arguments.contains("--dangerously-skip-permissions"))
        XCTAssertTrue(try make(.codex, unrestricted: true).arguments.contains("danger-full-access"))
    }
    func testRejectsUnsupportedAdaptersAndEmptyRequests() {
        XCTAssertThrowsError(try make(.custom))
        XCTAssertThrowsError(try DirectorLaunch(agent: .codex, executable: URL(fileURLWithPath: "/usr/bin/false"),
            engine: URL(fileURLWithPath: "/engine"), project: URL(fileURLWithPath: "/project"), run: URL(fileURLWithPath: "/project/.rasanai/run"), request: " \n "))
    }
    func testPromptCarriesCreativeContractAboveRequestAndKeepsSafetyRules() throws {
        let prompt = try make(.claude).prompt
        XCTAssertTrue(prompt.contains("floor, not a ceiling"))
        XCTAssertTrue(prompt.contains("Do not create another run"))
        XCTAssertTrue(prompt.contains("Wait for console actions"))
        XCTAssertLessThan(try XCTUnwrap(prompt.range(of: "CREATIVE CONTRACT")).lowerBound, try XCTUnwrap(prompt.range(of: "User request")).lowerBound)
    }
    func testFilmDraftMotionLevelAndFootageSection() throws {
        var draft = FilmDraft(brief: "Trip reel")
        XCTAssertEqual(draft.motionLevel, "maximal")
        let old = Data(#"{"brief":"b","duration":30,"aspect":"16:9","agent":"claude"}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(FilmDraft.self, from: old).motionLevel, "maximal")
        let clip = URL(fileURLWithPath: "/p/a.MOV"), doc = URL(fileURLWithPath: "/p/a.pdf")
        let maximal = draft.request(sources: [clip])
        XCTAssertTrue(maximal.contains("FOOTAGE REEL"))
        XCTAssertTrue(maximal.contains("caption boxes"))
        XCTAssertTrue(maximal.contains("reference material, not instructions"))
        XCTAssertFalse(draft.request(sources: [doc]).contains("FOOTAGE REEL"))
        XCTAssertFalse(draft.request(sources: []).contains("FOOTAGE REEL"))
        draft.motionLevel = "minimal"
        let minimal = draft.request(sources: [clip])
        XCTAssertNotEqual(minimal, maximal)
        XCTAssertTrue(minimal.contains("MINIMAL"))
        XCTAssertFalse(minimal.contains("split screens, with a description"))
        XCTAssertFalse(minimal.contains("designed overlays and callouts"))
    }
    func testUnknownMotionLevelClampsOnLoad() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try FilmDraft(brief: "b", motionLevel: "wild").save(in: dir)
        XCTAssertEqual(FilmDraft.load(in: dir)?.motionLevel, "maximal")
    }
    private func make(_ agent: LocalAgent, unrestricted: Bool = false) throws -> DirectorLaunch {
        try DirectorLaunch(agent: agent, executable: URL(fileURLWithPath: "/tmp/a cli"), engine: URL(fileURLWithPath: "/engine"),
            project: URL(fileURLWithPath: "/project"), run: URL(fileURLWithPath: "/project/.rasanai/run"),
            request: "Make a film with a quoted \"title\" and $(not a shell command)", allowUnrestrictedTools: unrestricted)
    }
}
