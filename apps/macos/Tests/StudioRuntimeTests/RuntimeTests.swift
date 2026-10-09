import XCTest
import StudioCore
@testable import RasanAIStudio

@MainActor final class RuntimeTests: XCTestCase {
    func testUnfinishedEditorsSurviveRelaunchAndStaySeparateFromSavedBriefs() throws {
        let suite = "rasanai-editor-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        defaults.set(root.path, forKey: "projectRoot")
        let settings = StudioSettings(defaults: defaults)
        settings.setPath("", for: .claude)
        let prefix = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".npm-global").path
        XCTAssertTrue(settings.setupCommand(for: .claude).contains("--prefix \(LocalAgent.shellQuote(prefix))"))
        XCTAssertFalse(settings.setupCommand(for: .claude).contains("sudo"))
        let project = try settings.library.create(name: "Saved film")
        let original = FilmDraft(brief: "Saved brief")
        try original.save(in: project)
        let source = root.appendingPathComponent("footage.mov")
        try Data("original footage".utf8).write(to: source)
        let unfinished = FilmEditorDraft(name: "New title", film: FilmDraft(brief: "Unfinished brief", duration: 30, aspect: "9:16", motionLevel: "minimal", brand: "Northwind"), sources: [source], project: project)
        settings.saveEditorDraft(unfinished, for: nil)
        settings.saveEditorDraft(FilmEditorDraft(name: "Saved film", film: FilmDraft(brief: "Unsaved edit"), sources: []), for: project)
        let relaunched = StudioSettings(defaults: defaults)
        XCTAssertEqual(relaunched.editorDraft(for: nil), unfinished)
        XCTAssertEqual(relaunched.editorDraft(for: project)?.film.brief, "Unsaved edit")
        XCTAssertEqual(FilmDraft.load(in: project), original)
        XCTAssertEqual(try Data(contentsOf: source), Data("original footage".utf8))
        relaunched.projectRoot = root.appendingPathComponent("Other library").path
        XCTAssertNil(relaunched.editorDraft(for: nil))
        relaunched.projectRoot = root.path
        relaunched.clearEditorDraft(for: nil)
        XCTAssertNil(StudioSettings(defaults: defaults).editorDraft(for: nil))
        XCTAssertNotNil(relaunched.editorDraft(for: project))
    }

    func testInstalledDirectorMustPassSignInBeforeStarting() async throws {
        let suite = "rasanai-readiness-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        defaults.set(root.path, forKey: "projectRoot")
        defaults.set("codex", forKey: "defaultAgent")
        defaults.set("/usr/bin/true", forKey: "codexPath")
        let settings = StudioSettings(defaults: defaults)
        XCTAssertTrue(settings.isInstalled(.codex))
        XCTAssertFalse(settings.isReady(.codex))
        await settings.check(.codex)
        XCTAssertTrue(settings.isReady(.codex))
        settings.setPath("/usr/bin/false", for: .codex)
        XCTAssertFalse(settings.isReady(.codex))
        // Even a stale successful UI check must not permit a director launch.
        settings.statuses[LocalAgent.codex.id] = "CLI reports signed in"
        let runtime = DirectorRuntime()
        guard settings.nodeURL != nil else { throw XCTSkip("Node is required for runtime integration") }
        do {
            _ = try await runtime.start(project: root, request: "Fixture only", settings: settings)
            XCTFail("An unsigned-in fixture must not launch")
        } catch DirectorRuntime.RuntimeError.directorNotReady { }
        XCTAssertFalse(runtime.isRunning)
        XCTAssertFalse(runtime.isPreparing)
        XCTAssertFalse(settings.isReady(.codex))
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent(".rasanai/current").path))
    }

    func testFailureRecoveryIsShownWithoutCallingAProvider() async throws {
        let suite = "rasanai-failure-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        defaults.set(root.path, forKey: "projectRoot")
        defaults.set("codex", forKey: "defaultAgent")
        let settings = StudioSettings(defaults: defaults)
        let fixture = root.appendingPathComponent("fixture-agent")
        try "#!/bin/sh\nif [ \"$1\" = \"login\" ]; then exit 0; fi\necho 'authentication failed' >&2\nexit 1\n".write(to: fixture, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: fixture.path)
        settings.setPath(fixture.path, for: .codex)
        let runtime = DirectorRuntime()
        guard let node = settings.nodeURL else { throw XCTSkip("Node is required for runtime integration") }
        let run = try await runtime.start(project: root, request: "Fixture only", settings: settings)
        for _ in 0..<100 where runtime.recovery == nil { try await Task.sleep(for: .milliseconds(50)) }
        let engine = try XCTUnwrap(DirectorRuntime.engineURL)
        _ = try await DirectorRuntime.execute(node, arguments: [engine.appendingPathComponent("scripts/console.mjs").path, "stop", "--run", run.path], directory: root, environment: runtime.environment(node: node))
        XCTAssertEqual(runtime.lastExitCode, 1)
        XCTAssertEqual(runtime.recovery, .signIn)
        XCTAssertFalse(runtime.isRunning)
        XCTAssertTrue(FileManager.default.fileExists(atPath: run.appendingPathComponent("session.json").path))
    }

    func testSettingsPersistInAnIsolatedSuite() throws {
        let suite = "rasanai-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        defaults.set(root.path, forKey: "projectRoot")
        let settings = StudioSettings(defaults: defaults)
        settings.codexModel = "test-model"; settings.appearance = "light"
        settings.defaultAgent = "codex"
        let reloaded = StudioSettings(defaults: defaults)
        XCTAssertEqual(reloaded.model(for: .codex), "test-model")
        XCTAssertEqual(reloaded.appearance, "light")
        XCTAssertEqual(reloaded.defaultAgent, "codex")
        XCTAssertFalse(reloaded.allowUnrestrictedTools)
    }
    func testRunIsFileOnlyAndDirectorExitIsObservedWithoutProviderCalls() async throws {
        let suite = "rasanai-runtime-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        defaults.set(root.path, forKey: "projectRoot")
        defaults.set("codex", forKey: "defaultAgent")
        defaults.set("/usr/bin/true", forKey: "codexPath") // No model/provider invocation.
        let settings = StudioSettings(defaults: defaults)
        guard let node = settings.nodeURL else { throw XCTSkip("Node is required for runtime integration") }
        let runtime = DirectorRuntime()
        let run = try await runtime.start(project: root, request: "Fixture test only", settings: settings)
        // No console server: no address file, the director's environment is headless, and the seeded session is readable as is.
        XCTAssertFalse(FileManager.default.fileExists(atPath: run.appendingPathComponent("address.json").path))
        XCTAssertEqual(runtime.environment(node: node)["RASANAI_CONSOLE_HEADLESS"], "1")
        XCTAssertEqual(RunWorkspace.root(for: run).standardizedFileURL.path, root.standardizedFileURL.path)
        let state = try XCTUnwrap(RunTransport(run: run).readSession())
        XCTAssertEqual(state.title, root.lastPathComponent)
        for _ in 0..<100 where runtime.isRunning { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertFalse(runtime.isRunning)
        // A stub director that exits 0 having pushed nothing is a quiet stop, not a finished film.
        XCTAssertEqual(runtime.recovery, .stoppedEarly, runtime.status)
        XCTAssertEqual((try FileManager.default.attributesOfItem(atPath: run.appendingPathComponent("director-job.json").path)[.posixPermissions] as? NSNumber)?.intValue, 0o600)
        let engine = try XCTUnwrap(DirectorRuntime.engineURL)
        _ = try await DirectorRuntime.execute(node, arguments: [engine.appendingPathComponent("scripts/console.mjs").path, "stop", "--run", run.path], directory: root, environment: runtime.environment(node: node))
    }

    func testDirectorEnvironmentCarriesCodexPathAndImageGenerationSwitchForEveryDirector() throws {
        let suite = "rasanai-imagegen-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { defaults.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: root) }
        let codex = root.appendingPathComponent("codex")
        try "#!/bin/sh\nexit 0\n".write(to: codex, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: codex.path)
        defaults.set(root.path, forKey: "projectRoot")
        defaults.set(codex.path, forKey: "codexPath")
        defaults.set("/usr/bin/true", forKey: "claudePath")
        defaults.set("claude", forKey: "defaultAgent")
        let settings = StudioSettings(defaults: defaults)
        XCTAssertTrue(settings.generateImagesWithCodex)
        let runtime = DirectorRuntime()
        let node = URL(fileURLWithPath: "/usr/bin/true")
        var env = runtime.environment(node: node, settings: settings)
        XCTAssertEqual(env["RASANAI_CODEX_BIN"], codex.path)
        XCTAssertNil(env["RASANAI_IMAGEGEN"])
        settings.generateImagesWithCodex = false
        env = runtime.environment(node: node, settings: settings)
        XCTAssertEqual(env["RASANAI_IMAGEGEN"], "off")
        XCTAssertFalse(StudioSettings(defaults: defaults).generateImagesWithCodex)
        settings.defaultAgent = "codex"
        XCTAssertEqual(runtime.environment(node: node, settings: settings)["RASANAI_IMAGEGEN"], "off")
    }
}
