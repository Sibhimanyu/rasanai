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
    func testClaudeWithoutOptInIsScopedNotBlocked() throws {
        let launch = try make(.claude)
        let args = launch.arguments
        // Stream-json flags the Director monitor parses stay, and the prompt stays last (no variadic flag may swallow it).
        XCTAssertEqual(Array(args.prefix(6)), ["--print", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"])
        XCTAssertEqual(args.last, launch.prompt)
        let json = try XCTUnwrap(args[args.firstIndex(of: "--settings").map { $0 + 1 }!].data(using: .utf8))
        let permissions = try XCTUnwrap((try JSONSerialization.jsonObject(with: json) as? [String: Any])?["permissions"] as? [String: [String]])
        let allow = try XCTUnwrap(permissions["allow"]), deny = try XCTUnwrap(permissions["deny"])
        let dirs = try XCTUnwrap(permissions["additionalDirectories"])
        XCTAssertTrue(dirs.contains("/engine"))
        for rule in ["Bash(node *)", "Bash(npx hyperframes *)", "Bash(ffmpeg *)", "Bash(ffprobe *)", "Bash(mkdir *)", "Bash(cp *)", "Bash(ls)", "Read", "Write", "Edit", "WebSearch", "WebFetch", "Task"] {
            XCTAssertTrue(allow.contains(rule), rule)
        }
        for rule in ["Bash(sudo *)", "Bash(rm -r*)", "Bash(rm -fr*)", "Bash(curl * | *)", "Bash(npm install *)", "Bash(brew *)", "Bash(* | sh)"] {
            XCTAssertTrue(deny.contains(rule), rule)
        }
        XCTAssertFalse(allow.contains("Bash(rm -rf *)"))
        XCTAssertFalse(allow.contains("Bash(sudo *)"))
        XCTAssertFalse(args.contains("--dangerously-skip-permissions"))
        // The unrestricted opt-in drops the scoping instead of mixing the two.
        XCTAssertFalse(try make(.claude, unrestricted: true).arguments.contains("--settings"))
    }
    func testInstalledSkillStoresAndManagedToolsAreGrantedWhenPresent() throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        for sub in [".claude/skills", ".agents/skills", ".rasanai", "Tools"] { try FileManager.default.createDirectory(at: home.appendingPathComponent(sub), withIntermediateDirectories: true) }
        defer { try? FileManager.default.removeItem(at: home) }
        let permissions = DirectorPermissions(engine: URL(fileURLWithPath: "/engine"), home: home, toolsDirectory: home.appendingPathComponent("Tools"))
        for sub in [".claude/skills", ".agents/skills", ".rasanai", "Tools"] { XCTAssertTrue(permissions.additionalDirectories.contains(home.appendingPathComponent(sub).path), sub) }
        XCTAssertFalse(permissions.additionalDirectories.contains(home.appendingPathComponent(".npm").path), "absent folders are not granted")
    }
    func testCodexKeepsSandboxButGetsNetworkAndWritableRoots() throws {
        let args = try make(.codex).arguments
        XCTAssertEqual(args[args.firstIndex(of: "--sandbox")! + 1], "workspace-write")
        XCTAssertTrue(args.contains("sandbox_workspace_write.network_access=true"))
        XCTAssertTrue(args.contains("--add-dir"))
        XCTAssertFalse(args.contains("danger-full-access"))
        XCTAssertEqual(args.last, try make(.codex).prompt)
        XCTAssertFalse(try make(.codex, unrestricted: true).arguments.contains("--add-dir"))
    }
    /// Not an assertion: tooling (.context/film-test/launch.mjs) asks the real code for the settings JSON, so it never drifts.
    /// RASAN_DUMP_PERMISSIONS=<out file> RASAN_ENGINE=<engine dir> swift test --filter testDumpPermissionsForTooling
    func testDumpPermissionsForTooling() throws {
        guard let out = ProcessInfo.processInfo.environment["RASAN_DUMP_PERMISSIONS"], let engine = ProcessInfo.processInfo.environment["RASAN_ENGINE"] else { return }
        let home = FileManager.default.homeDirectoryForCurrentUser
        DirectorPermissions.prepareDataFolders(home: home, toolsDirectory: LocalAgent.managedToolsDirectory)
        let permissions = DirectorPermissions(engine: URL(fileURLWithPath: engine), home: home, toolsDirectory: LocalAgent.managedToolsDirectory)
        try permissions.claudeSettingsJSON.write(toFile: out, atomically: true, encoding: .utf8)
    }
    /// Tooling: replays a real director.log through the app's parser. RASAN_TELEMETRY_LOG=<log> RASAN_TELEMETRY_OUT=<json>
    func testReplayLogForTooling() throws {
        let env = ProcessInfo.processInfo.environment
        guard let log = env["RASAN_TELEMETRY_LOG"], let out = env["RASAN_TELEMETRY_OUT"] else { return }
        var telemetry = DirectorTelemetry()
        let lines = try String(contentsOfFile: log, encoding: .utf8).split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
        var t = Date(timeIntervalSince1970: 1_000_000)
        for line in lines { telemetry.ingest(line: line, now: t); t += 1 }
        telemetry.closeSession()
        let cost = telemetry.cost, tokens = telemetry.tokens
        var models: [String: Any] = [:]
        for (name, usage) in telemetry.models { models[name] = ["input": usage.input, "output": usage.output, "cacheRead": usage.cacheRead, "cacheWrite": usage.cacheWrite] }
        let health = DirectorHealth.evaluate(telemetry, context: HealthContext(now: t, processRunning: false, exitCode: 0))
        let report: [String: Any] = ["lines": lines.count, "usd": cost.usd, "reportedUSD": cost.reportedUSD, "estimatedUSD": cost.estimatedUSD, "isEstimated": cost.isEstimated,
            "tokens": ["input": tokens.input, "output": tokens.output, "cacheRead": tokens.cacheRead, "cacheWrite": tokens.cacheWrite], "models": models,
            "turns": telemetry.turns, "toolCalls": telemetry.totalToolCalls, "toolErrors": telemetry.toolErrors, "sessions": telemetry.sessionCount,
            "sessionFinished": telemetry.sessionFinished, "healthAfterExit0": health.state.rawValue, "events": telemetry.events.count,
            "pushes": telemetry.events.filter { $0.kind == .push }.count, "asks": telemetry.events.filter { $0.kind == .ask }.count]
        try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: out))
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
