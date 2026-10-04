import XCTest
import StudioCore
@testable import RasanAIStudio

@MainActor final class RuntimeTests: XCTestCase {
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
    func testConsoleBootstrapsAndDirectorExitIsObservedWithoutProviderCalls() async throws {
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
        let address = try ConsoleAddress(data: Data(contentsOf: run.appendingPathComponent("address.json")))
        XCTAssertEqual(address.root.path, root.path)
        let state = try await ConsoleClient(address: address).state()
        XCTAssertEqual(state.title, root.lastPathComponent)
        for _ in 0..<100 where runtime.isRunning { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertFalse(runtime.isRunning)
        XCTAssertTrue(runtime.status.contains("finished"))
        XCTAssertEqual((try FileManager.default.attributesOfItem(atPath: run.appendingPathComponent("director-job.json").path)[.posixPermissions] as? NSNumber)?.intValue, 0o600)
        let engine = try XCTUnwrap(DirectorRuntime.engineURL)
        _ = try await DirectorRuntime.execute(node, arguments: [engine.appendingPathComponent("scripts/console.mjs").path, "stop", "--run", run.path], directory: root, environment: runtime.environment(node: node))
    }
}
