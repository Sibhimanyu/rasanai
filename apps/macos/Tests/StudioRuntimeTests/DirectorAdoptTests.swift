import XCTest
import StudioCore
@testable import RasanAIStudio

/// A director started from outside Studio (`skills/rasanai/scripts/director.mjs resume`, which a phone uses) is found and taken over
/// by Studio exactly like one a previous Studio left running, and a stop from outside is read as a stop.
@MainActor final class DirectorAdoptTests: XCTestCase {
    func testStudioAdoptsADirectorStartedByDirectorMjs() async throws {
        let suite = "rasanai-adopt-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        guard let node = StudioSettings(defaults: defaults).nodeURL else { throw XCTSkip("Node is required for runtime integration") }
        let engine = try XCTUnwrap(DirectorRuntime.engineURL)
        let script = engine.appendingPathComponent("scripts/director.mjs")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: script.path), "this engine has no director.mjs")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("adopt-" + UUID().uuidString)
        let home = root.appendingPathComponent("home")
        let project = root.appendingPathComponent("film")
        let run = project.appendingPathComponent(".rasanai/run-1")
        try FileManager.default.createDirectory(at: run, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data("run-1".utf8).write(to: project.appendingPathComponent(".rasanai/current"))
        let agent = root.appendingPathComponent("fake-agent")
        try "#!/bin/sh\ntrap 'exit 0' TERM\nwhile true; do sleep 1; done\n".write(to: agent, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: agent.path)
        let job: [String: Any] = ["executable": agent.path, "arguments": ["--print", "OLD PROMPT"], "cwd": project.path]
        try JSONSerialization.data(withJSONObject: job).write(to: run.appendingPathComponent("director-job.json"))

        func director(_ arguments: [String]) throws -> [String: Any] {
            let process = Process(), pipe = Pipe()
            process.executableURL = node
            process.arguments = [script.path] + arguments
            process.environment = ProcessInfo.processInfo.environment.merging(["HOME": home.path]) { $0 + $1 }
            process.standardOutput = pipe; process.standardError = FileHandle.nullDevice; process.standardInput = FileHandle.nullDevice
            try process.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        }
        let started = try director(["resume", project.path, "--source", "squeak-phone"])
        XCTAssertEqual(started["ok"] as? Bool, true, "\(started)")
        let pid = try XCTUnwrap(started["pid"] as? Int)
        defer { kill(Int32(pid), SIGTERM) }

        XCTAssertTrue(DirectorRuntime.isDriver(pid: Int32(pid), run: run))
        XCTAssertEqual(DirectorRuntime.findDriver(run: run), Int32(pid))
        let runtime = DirectorRuntime()
        XCTAssertTrue(runtime.adopt(run: run, project: project), "Studio must take over a director that director.mjs started")
        XCTAssertTrue(runtime.isRunning)
        XCTAssertFalse(runtime.isFrozen)
        XCTAssertEqual(runtime.projectURL?.standardizedFileURL.resolvingSymlinksInPath(), project.standardizedFileURL.resolvingSymlinksInPath())
        XCTAssertEqual(runtime.runURL?.resolvingSymlinksInPath(), run.resolvingSymlinksInPath())

        let stopped = try director(["stop", project.path])
        XCTAssertEqual(stopped["ok"] as? Bool, true, "\(stopped)")
        for _ in 0..<80 where runtime.isRunning { try await Task.sleep(for: .milliseconds(100)) }
        XCTAssertFalse(runtime.isRunning, "an adopted director that was stopped from outside is no longer running")
        XCTAssertTrue(runtime.stopRequested, "its exit was a stop, so Studio keeps it paused instead of restarting it")
        UserDefaults.standard.removeObject(forKey: DirectorRuntime.activeRunKey)
    }
}
