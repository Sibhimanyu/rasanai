import Foundation
import XCTest
@testable import StudioCore

/// The file transport against the real `console.mjs` (headless): what the app appends is exactly what `wait` returns, with the
/// session effects the web console's server used to apply. Skipped when node isn't on this machine.
final class ConsoleProtocolTests: XCTestCase {
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
    /// Runs `console.mjs` headless, like the director launch does.
    @discardableResult private func run(_ node: URL, _ arguments: [String], headless: Bool = true) throws -> (status: Int32, out: String) {
        let process = Process(); let out = Pipe()
        process.executableURL = node; process.arguments = [console.path] + arguments
        var env = ProcessInfo.processInfo.environment; env.removeValue(forKey: "RASANAI_CONSOLE_HEADLESS")
        if headless { env["RASANAI_CONSOLE_HEADLESS"] = "1" }
        process.environment = env
        process.standardOutput = out; process.standardError = out
        try process.run()
        let data = out.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return (process.terminationStatus, String(decoding: data, as: UTF8.self))
    }
    private func tempRun() throws -> (root: URL, run: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("console-proto-\(UUID().uuidString)")
        let run = root.appendingPathComponent(".rasanai/run-aaaa")
        try FileManager.default.createDirectory(at: run, withIntermediateDirectories: true)
        return (root, run)
    }
    private func json(_ text: String) throws -> JSONValue { try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)) }

    func testStepListMatchesTheEngine() throws {
        let source = try String(contentsOf: console, encoding: .utf8)
        let line = try XCTUnwrap(source.split(separator: "\n").first { $0.hasPrefix("export const STEPS = [") })
        let names = line.components(separatedBy: "\"").enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
        XCTAssertEqual(names, RunProtocol.steps)
    }

    func testEveryNativeActionIsWhatWaitReturnsWithTheServersSessionEffects() throws {
        let node = try node()
        let (root, runDir) = try tempRun()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = RunTransport(run: runDir)
        // The director's side: pushes and an ask, with no server.
        try run(node, ["push", "--run", runDir.path, "--step", "story", "--data", #"{"stories":[{"id":"a","title":"A"},{"id":"b","title":"B"}],"recommended":"a"}"#])
        let asked = try json(try run(node, ["ask", "--run", runDir.path, "--question", "Logo?", "--options", #"[{"id":"word","label":"Wordmark"}]"#]).out)
        let askID = try XCTUnwrap(asked["ask"].string)
        try run(node, ["push", "--run", runDir.path, "--step", "animatic", "--data", #"{"scenes":[]}"#])

        let obj: ([String: JSONValue]) -> JSONValue = { .object($0) }
        var sent: [(String, String, JSONValue, String)] = [
            ("brief", "submit", obj(["length_s": .number(30), "kind": .string("launch film"), "subject": .string("Tally"), "aspect": .string("16:9"),
                                     "destination": .string("website"), "narration": .bool(true), "use_brand": .bool(false), "source": .string("Tally")]), ""),
            ("story", "choose", .string("a"), "but shorter"),
            ("story", "more", obj(["near": .string("a"), "exclude": .array([.string("a")])]), ""),
            ("look", "choose", .string("bold"), ""),
            ("look", "more", obj(["near": .string("bold"), "exclude": .array([.string("bold")])]), ""),
            ("look", "knob", obj(["name": .string("energy"), "value": .string("punchier"), "film": .string("bold")]), ""),
            ("films", "mix", obj(["look": .string("a"), "story": .string("b")]), ""),
            ("animatic", "comment", obj(["scene": .string("s2"), "t": .number(5.5), "x": .number(0.4), "y": .number(0.6), "scope": .string("scene"), "quick": .string("Slower")]), "slow this down"),
            ("animatic", "swap", obj(["chip": .string("music"), "id": .string("m2")]), ""),
            ("animatic", "more", obj(["what": .string("angle")]), ""),
            ("animatic", "approve", .null, ""),
            ("render", "choose", .string("preview"), ""),
            ("render", "version", obj(["restore": .number(1)]), ""),
            ("footage", "submit", obj(["include": .array([.string("c1")])]), ""),
            ("reel", "submit", obj(["timeline": .object([:]), "overlays": .array([]), "captions": .array([])]), ""),
            ("scenes", "submit", obj(["scenes": .array([.object(["id": .string("s1")])])]), ""),
            ("brand", "choose", obj(["use": .string("direct"), "mode": .string("dark")]), ""),
            ("motion", "adjust", obj(["id": .string("m1"), "adjust": .array([.string("calmer")])]), ""),
            ("voice", "decide", .null, "your call"),
            ("*", "decide-rest", .null, ""),
            ("story", "note", .null, "make it punchier \"quoted\" and\nmultiline ünïcode"),
            ("render", "answer", obj(["ask": .string(askID), "choice": .string("word"), "text": .string("wordmark")]), "wordmark"),
        ]
        var commentID = ""
        for (step, type, value, note) in sent {
            let queued = try transport.append(step: step, type: type, value: value, note: note)
            XCTAssertEqual(transport.pending().last, queued)
            let result = try run(node, ["wait", "--run", runDir.path, "--timeout", "10"])
            XCTAssertEqual(result.status, 0, "\(step)/\(type): \(result.out)")
            let action = try json(result.out)
            // The exact action JSON of console.md: {id, ts, step, type, value, note, source}.
            XCTAssertEqual(action, queued.json, "\(step)/\(type)")
            XCTAssertEqual(Set(action.object.keys), ["id", "ts", "step", "type", "value", "note", "source"])
            XCTAssertEqual(action["source"].string, "console")
            XCTAssertEqual(action["value"], value); XCTAssertEqual(action["note"].string, note)
            if type == "comment" { commentID = queued.id }
        }
        // apply (needs the note's id, which only exists once the comment is consumed)
        sent.append(("animatic", "apply", obj(["ids": .array([.string(commentID)])]), ""))
        let applied = try transport.append(step: "animatic", type: "apply", value: sent.last!.2)
        let waited = try json(try run(node, ["wait", "--run", runDir.path, "--timeout", "10"]).out)
        XCTAssertEqual(waited, applied.json)
        XCTAssertTrue(transport.pending().isEmpty, "everything was consumed")
        XCTAssertTrue(transport.rejections().isEmpty)

        // The session ends up as the server would have left it.
        let snapshot = try XCTUnwrap(transport.readSession())
        let note = try XCTUnwrap(snapshot.notes.first)
        XCTAssertEqual(note.id, commentID); XCTAssertEqual(note.time, 5.5); XCTAssertEqual(note.x, 0.4); XCTAssertEqual(note.y, 0.6)
        XCTAssertEqual(note.quick, "Slower"); XCTAssertEqual(note.text, "slow this down"); XCTAssertEqual(note.state, "open")
        XCTAssertEqual(snapshot.step("story")["sent"]["type"].string, "note")
        XCTAssertEqual(snapshot.step("story")["thread"].array.last?["text"].string, "make it punchier \"quoted\" and\nmultiline ünïcode")
        XCTAssertEqual(snapshot.step("animatic")["sent"]["type"].string, "apply")
        XCTAssertTrue(snapshot.isDecideRest)
        XCTAssertNotEqual(snapshot.raw["ask"]["answered"], .null)
        XCTAssertEqual(snapshot.raw["ask"]["answered"]["label"].string, "Wordmark")
        XCTAssertTrue(snapshot.activityFeed.map(\.message).contains("You answered: Wordmark · “wordmark”"))
        XCTAssertTrue(snapshot.activityFeed.map(\.message).contains("You left a note at 0:05: slow this down"))
        // Unknown steps and malformed types are refused before anything is written.
        XCTAssertThrowsError(try transport.append(step: "nonsense", type: "choose"))
        XCTAssertThrowsError(try transport.append(step: "story", type: "Not Valid"))
        XCTAssertTrue(transport.pending().isEmpty)
    }

    func testWaitRejectsInvalidActionsWithAnErrorAndKeepsGoing() throws {
        let node = try node()
        let (root, runDir) = try tempRun()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = RunTransport(run: runDir)
        let handle = try { FileManager.default.createFile(atPath: transport.actionsURL.path, contents: nil); return try FileHandle(forWritingTo: transport.actionsURL) }()
        for line in ["not json at all", "[1,2,3]", #"{"id":"x1","step":"nonsense","type":"choose"}"#, #"{"id":"x2","step":"story","type":"BAD TYPE"}"#, #"{"step":"story","type":"choose"}"#] {
            try handle.write(contentsOf: Data((line + "\n").utf8))
        }
        try handle.close()
        let good = try transport.append(step: "story", type: "approve")
        let result = try run(node, ["wait", "--run", runDir.path, "--timeout", "10"])
        XCTAssertEqual(try json(result.out), good.json)
        let refused = transport.rejections()
        XCTAssertEqual(refused.count, 5)
        XCTAssertTrue(refused.contains { $0.id == "x1" } && refused.contains { $0.id == "x2" })
        XCTAssertTrue(transport.pending().isEmpty)
        // Nothing is left to deliver.
        XCTAssertEqual(try run(node, ["wait", "--run", runDir.path, "--timeout", "1"]).status, 2)
    }

    func testConcurrentAppendsFromThreadsAndProcessesAreSafe() throws {
        let node = try node()
        let (root, runDir) = try tempRun()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = RunTransport(run: runDir)
        // `record` (another process) takes the same lock for its append and for consumed.json while the app appends.
        let recorders = try (0..<6).map { index -> Process in
            let process = Process()
            process.executableURL = node
            process.arguments = [console.path, "record", "--run", runDir.path, "--step", "story", "--type", "choose", "--value", "\"r\(index)\""]
            var env = ProcessInfo.processInfo.environment; env["RASANAI_CONSOLE_HEADLESS"] = "1"; process.environment = env
            process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
            try process.run()
            return process
        }
        let failures = NSLock(); nonisolated(unsafe) var failed = 0
        let big = String(repeating: "x", count: 20_000)   // larger than one pipe write: interleaving would corrupt it
        DispatchQueue.concurrentPerform(iterations: 8) { worker in
            for n in 0..<25 {
                do { try transport.append(step: "story", type: "note", value: .object(["worker": .number(Double(worker)), "n": .number(Double(n))]), note: n % 5 == 0 ? big : "w\(worker)n\(n)") }
                catch { failures.lock(); failed += 1; failures.unlock() }
            }
        }
        recorders.forEach { $0.waitUntilExit() }
        XCTAssertEqual(failed, 0)
        let text = try String(contentsOf: transport.actionsURL, encoding: .utf8)
        XCTAssertTrue(text.hasSuffix("\n"))
        let lines = text.split(separator: "\n")
        XCTAssertEqual(lines.count, 200 + 6)
        var ids = Set<String>()
        for line in lines { ids.insert(try XCTUnwrap(try json(String(line))["id"].string)) }
        XCTAssertEqual(ids.count, 206, "every line is intact JSON with its own id")
        XCTAssertEqual(transport.pending().count, 200, "the 6 recorded answers are already consumed")
        XCTAssertEqual(try json(try String(contentsOf: transport.consumedURL, encoding: .utf8)).array.count, 6, "no consumed.json update was lost")
    }

    func testStaleLockFromADeadProcessIsTakenOver() throws {
        let (root, runDir) = try tempRun()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = RunTransport(run: runDir)
        try "999999 1\n".write(to: transport.actionsLockURL, atomically: true, encoding: .utf8)   // an owner that no longer exists
        let started = Date()
        try transport.append(step: "story", type: "approve")
        XCTAssertLessThan(Date().timeIntervalSince(started), 2)
        XCTAssertFalse(FileManager.default.fileExists(atPath: transport.actionsLockURL.path), "the lock is released")
    }

    func testAPartiallyWrittenLineIsNotPendingUntilComplete() throws {
        let (root, runDir) = try tempRun()
        defer { try? FileManager.default.removeItem(at: root) }
        let transport = RunTransport(run: runDir)
        try #"{"id":"p1","ts":"t","step":"story","type":"note","value":null,"note":"hel"#.write(to: transport.actionsURL, atomically: true, encoding: .utf8)
        XCTAssertTrue(transport.pending().isEmpty)
        let handle = try FileHandle(forWritingTo: transport.actionsURL); try handle.seekToEnd()
        try handle.write(contentsOf: Data("lo\",\"source\":\"console\"}\n".utf8)); try handle.close()
        XCTAssertEqual(transport.pending().map(\.note), ["hello"])
    }

    func testSessionOverlayShowsSentActionsUntilConsumedAndIsIdempotent() throws {
        let base = try SessionSnapshot(data: Data(#"{"title":"T","current":"story","steps":{"story":{"status":"awaiting","options":[]}},"ask":{"id":"q","step":"story","question":"?","options":[{"id":"y","label":"Yes"}]}}"#.utf8))
        let choose = QueuedAction(id: "a", ts: "2026-01-01T00:00:00.000Z", step: "story", type: "choose", value: .string("a"), note: "shorter")
        let comment = QueuedAction(id: "c", ts: "2026-01-01T00:00:01.000Z", step: "animatic", type: "comment", value: .object(["t": .number(3), "quick": .string("Slower")]), note: "")
        let answer = QueuedAction(id: "n", ts: "2026-01-01T00:00:02.000Z", step: "story", type: "answer", value: .object(["ask": .string("q"), "choice": .string("y"), "text": .string("")]), note: "")
        let shown = SessionOverlay.apply([choose, comment, answer], to: base)
        XCTAssertTrue(shown.hasSent("story"))
        XCTAssertNil(shown.ask, "answered")
        XCTAssertEqual(shown.notes.map(\.id), ["c"])
        XCTAssertEqual(shown.thread(for: "story").map(\.text), ["shorter"])
        // Applying again over a session the director already updated changes nothing.
        let twice = SessionOverlay.apply([choose, comment, answer], to: shown)
        XCTAssertEqual(twice.raw, shown.raw)
        XCTAssertEqual(SessionOverlay.apply([], to: base).raw, base.raw)
    }
}
