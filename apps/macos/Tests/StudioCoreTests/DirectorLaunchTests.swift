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
    private func make(_ agent: LocalAgent, unrestricted: Bool = false) throws -> DirectorLaunch {
        try DirectorLaunch(agent: agent, executable: URL(fileURLWithPath: "/tmp/a cli"), engine: URL(fileURLWithPath: "/engine"),
            project: URL(fileURLWithPath: "/project"), run: URL(fileURLWithPath: "/project/.rasanai/run"),
            request: "Make a film with a quoted \"title\" and $(not a shell command)", allowUnrestrictedTools: unrestricted)
    }
}
