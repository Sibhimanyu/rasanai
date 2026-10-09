import Foundation
import XCTest
import StudioCore
@testable import RasanAIStudio

/// FilmSessionModel over a real run folder and the real `console.mjs` (headless): no server anywhere.
@MainActor final class FileTransportTests: XCTestCase {
    private var console: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("skills/rasanai/scripts/console.mjs")
    }
    private func node() throws -> URL {
        for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", NSHomeDirectory() + "/.local/bin"] {
            let url = URL(fileURLWithPath: dir).appendingPathComponent("node")
            if FileManager.default.isExecutableFile(atPath: url.path) { return url }
        }
        throw XCTSkip("node is not installed")
    }
    @discardableResult private func run(_ node: URL, _ arguments: [String], headless: Bool = true) throws -> String {
        let process = Process(); let out = Pipe()
        process.executableURL = node; process.arguments = [console.path] + arguments
        var env = ProcessInfo.processInfo.environment; env.removeValue(forKey: "RASANAI_CONSOLE_HEADLESS")
        if headless { env["RASANAI_CONSOLE_HEADLESS"] = "1" }
        process.environment = env
        process.standardOutput = out; process.standardError = out
        try process.run()
        let data = out.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return String(decoding: data, as: UTF8.self)
    }
    private func tempRun() throws -> (root: URL, run: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("file-transport-\(UUID().uuidString)")
        let run = root.appendingPathComponent(".rasanai/run-aaaa")
        try FileManager.default.createDirectory(at: run, withIntermediateDirectories: true)
        return (root, run)
    }
    private func until(_ seconds: Double, _ condition: () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline { if condition() { return true }; try? await Task.sleep(for: .milliseconds(20)) }
        return condition()
    }
    private func expectSoon(file: StaticString = #filePath, line: UInt = #line, _ condition: () -> Bool) async {
        let reached = await until(1, condition)
        XCTAssertTrue(reached, "condition not reached within 1 s", file: file, line: line)
    }
    private func model(for run: URL, root: URL) -> FilmSessionModel {
        let snapshot = (try? RunTransport(run: run).readSession()) ?? SessionSnapshot()
        let model = FilmSessionModel(snapshot: snapshot, run: run, workspace: root)
        model.start()
        return model
    }
    private func listeningNodeServers() -> String {
        let process = Process(); let out = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof"); process.arguments = ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pc"]
        process.standardOutput = out; process.standardError = FileHandle.nullDevice
        try? process.run()
        let text = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        process.waitUntilExit()
        return text
    }

    func testDirectorPushReachesTheModelWithinOneSecondAndSendReachesWait() async throws {
        let node = try node()
        let (root, runDir) = try tempRun()
        defer { try? FileManager.default.removeItem(at: root) }
        try run(node, ["activity", "--run", runDir.path, "--message", "Reading your brief"])
        let model = model(for: runDir, root: root)
        defer { model.stop() }
        await expectSoon { model.isConnected }

        let started = Date()
        try run(node, ["push", "--run", runDir.path, "--step", "story", "--data", #"{"question":"Pick a script","stories":[{"id":"shoebox","title":"The shoebox wins","beats":[]},{"id":"b","title":"B"}],"recommended":"shoebox"}"#])
        let arrived = await until(1) { model.status("story") == "awaiting" }
        XCTAssertTrue(arrived, "a push shows up in the snapshot within 1 s (took \(Date().timeIntervalSince(started)) s)")
        XCTAssertEqual(model.currentStep, "story")
        XCTAssertTrue(model.canAct(on: "story"))

        // The app answers; the screen says "sent" at once, before the director has looked.
        let accepted = await model.send(step: "story", type: "choose", value: .string("shoebox"), note: "but shorter")
        XCTAssertTrue(accepted)
        XCTAssertTrue(model.hasSent("story"), "optimistic sent state")
        XCTAssertFalse(model.canAct(on: "story"))
        XCTAssertEqual(model.thread(for: "story").last?.text, "but shorter")

        // The director's wait returns the exact action and applies its effects; the screen follows without a duplicate.
        let waited = try run(node, ["wait", "--run", runDir.path, "--step", "story", "--timeout", "10"])
        let action = try JSONDecoder().decode(JSONValue.self, from: Data(waited.utf8))
        XCTAssertEqual(action["type"].string, "choose"); XCTAssertEqual(action["value"].string, "shoebox")
        XCTAssertEqual(action["note"].string, "but shorter"); XCTAssertEqual(action["source"].string, "console")
        let applied = await until(1) { model.snapshot.step("story")["sent"]["name"].string == "The shoebox wins" }
        XCTAssertTrue(applied, "the real effects replace the optimistic ones")
        XCTAssertEqual(model.thread(for: "story").map(\.text), ["but shorter"])
        XCTAssertTrue(model.hasSent("story"))
        XCTAssertTrue(model.activity.map(\.message).contains("You: picked the story: The shoebox wins"))

        // The director moves on: the banner clears and the person's turn is back.
        try run(node, ["push", "--run", runDir.path, "--step", "story", "--data", #"{"stories":[{"id":"shoebox","title":"The shoebox wins"}]}"#, "--status", "done"])
        try run(node, ["push", "--run", runDir.path, "--step", "look", "--data", #"{"styles":[]}"#])
        let moved = await until(1) { model.currentStep == "look" && !model.hasSent("look") }
        XCTAssertTrue(moved)
        XCTAssertFalse(FileManager.default.fileExists(atPath: runDir.appendingPathComponent("address.json").path))
        // Nothing in this run (or from these tests) is a node HTTP server.
        let listeners = listeningNodeServers()
        XCTAssertFalse(listeners.contains("cnode") && listeners.contains(runDir.path), "no console server")
    }

    func testAMissingOrHalfWrittenSessionKeepsTheLastGoodState() async throws {
        let node = try node()
        let (root, runDir) = try tempRun()
        defer { try? FileManager.default.removeItem(at: root) }
        try run(node, ["push", "--run", runDir.path, "--step", "story", "--data", #"{"stories":[]}"#])
        let model = model(for: runDir, root: root)
        defer { model.stop() }
        await expectSoon { model.isConnected }
        // A truncated write (a crash, a copy in progress) is tolerated: the screen keeps what it had.
        try Data(#"{"title":"x","current":"story","ste"#.utf8).write(to: runDir.appendingPathComponent("session.json"))
        try await Task.sleep(for: .milliseconds(400))
        XCTAssertEqual(model.status("story"), "awaiting")
        XCTAssertTrue(model.isConnected)
        // The next complete write (the copy finishing, the director's rewrite) repairs it.
        let repaired = #"{"title":"x","current":"story","steps":{"story":{"status":"awaiting"}},"activity":[{"msg":"still here","level":"info"}],"updated":"2999-01-01T00:00:00.000Z"}"#
        try Data(repaired.utf8).write(to: runDir.appendingPathComponent("session.json"), options: .atomic)
        await expectSoon { model.activity.first?.message == "still here" }
    }

    func testResumingARunStartedByVersion060OpensAndSwitchesToHeadless() async throws {
        let node = try node()
        let (root, runDir) = try tempRun()
        defer { _ = try? run(node, ["stop", "--run", runDir.path], headless: false); try? FileManager.default.removeItem(at: root) }
        // A 0.6.0 run: the web console server was started (address.json, console.json with a pid) and the film got going.
        try run(node, ["serve", "--run", runDir.path, "--root", root.path], headless: false)
        let address = try Data(contentsOf: runDir.appendingPathComponent("address.json"))
        XCTAssertNotNil(address.count > 0 ? address : nil)
        let legacy = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: runDir.appendingPathComponent("console.json")))
        let serverPID = try XCTUnwrap(legacy["pid"].number)
        try run(node, ["push", "--run", runDir.path, "--step", "story", "--data", #"{"stories":[{"id":"a","title":"A"}]}"#], headless: false)
        XCTAssertEqual(kill(pid_t(serverPID), 0), 0, "the old console server is running")

        // Opening it in the new app reads the files (the workspace comes from the project layout, no port or token is read).
        XCTAssertEqual(RunWorkspace.root(for: runDir).standardizedFileURL.path, root.standardizedFileURL.path)
        let model = model(for: runDir, root: root)
        defer { model.stop() }
        await expectSoon { model.status("story") == "awaiting" }
        // Resuming the director (headless env) stops the old server and records the run as headless.
        try run(node, ["activity", "--run", runDir.path, "--message", "Resuming"])
        try await Task.sleep(for: .milliseconds(400))
        XCTAssertNotEqual(kill(pid_t(serverPID), 0), 0, "the old server is gone")
        XCTAssertFalse(FileManager.default.fileExists(atPath: runDir.appendingPathComponent("address.json").path))
        let info = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: runDir.appendingPathComponent("console.json")))
        XCTAssertEqual(info["headless"].bool, true)
        // And the conversation works over files from then on.
        let sentOK = await model.send(step: "story", type: "choose", value: .string("a"))
        XCTAssertTrue(sentOK)
        let waited = try run(node, ["wait", "--run", runDir.path, "--timeout", "10"])
        XCTAssertTrue(waited.contains("\"choose\""))
    }

    func testRunOpenedOnItsOwnUsesTheWorkspaceFromConsoleJsonOrAddressJson() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("ws-\(UUID().uuidString)")
        let run = folder.appendingPathComponent("loose-run")
        try FileManager.default.createDirectory(at: run, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        XCTAssertEqual(RunWorkspace.root(for: run), run)
        try Data(#"{"port":1234,"token":"0123456789abcdef01234567","root":"/tmp/legacy-project"}"#.utf8).write(to: run.appendingPathComponent("address.json"))
        XCTAssertEqual(RunWorkspace.root(for: run).path, "/tmp/legacy-project")
    }

    func testTheBriefSeedStillOpensTheWorkingViewNeverAnIntake() async throws {
        let (root, runDir) = try tempRun()
        defer { try? FileManager.default.removeItem(at: root) }
        let draft = FilmDraft(brief: "A launch film for Tally.", duration: 30, aspect: "16:9", brand: nil)
        XCTAssertTrue(try BriefSeed.seedFile(at: runDir.appendingPathComponent("session.json"), title: "Tally", draft: draft))
        let model = model(for: runDir, root: root)
        defer { model.stop() }
        await expectSoon { model.isConnected }
        XCTAssertFalse(model.snapshot.isFresh)
        XCTAssertEqual(StageRouter.route(model.snapshot), .working)
        XCTAssertEqual(model.snapshot.step("brief")["fields"]["subject"].string, "A launch film for Tally.")
        XCTAssertFalse(model.canAct(on: "brief"), "the brief is being read, not asked for")
    }
}
