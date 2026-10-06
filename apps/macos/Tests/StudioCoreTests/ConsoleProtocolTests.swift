import Foundation
import XCTest
@testable import StudioCore

/// Starts the real `console.mjs` on a temp run and drives it through `ConsoleClient`, the way every native screen does.
/// Skipped when node isn't on this machine.
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
    @discardableResult private func run(_ node: URL, _ arguments: [String]) throws -> String {
        let process = Process(); let out = Pipe()
        process.executableURL = node; process.arguments = [console.path] + arguments
        process.standardOutput = out; process.standardError = out
        try process.run(); process.waitUntilExit()
        return String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
    }

    func testEveryNativeActionLandsInActionsJsonlAndPushesReachTheStream() async throws {
        let node = try node()
        try XCTSkipUnless(FileManager.default.fileExists(atPath: console.path), "console.mjs not found")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("console-proto-\(UUID().uuidString)")
        let runDir = root.appendingPathComponent(".rasanai/run-aaaa")
        try FileManager.default.createDirectory(at: runDir, withIntermediateDirectories: true)
        defer { _ = try? run(node, ["stop", "--run", runDir.path]); try? FileManager.default.removeItem(at: root) }
        try run(node, ["serve", "--run", runDir.path, "--root", root.path])
        let address = try ConsoleAddress(data: Data(contentsOf: runDir.appendingPathComponent("address.json")))
        let client = ConsoleClient(address: address)

        // SSE: the first state arrives on connect, and a push reaches the stream without any reload.
        let stream = client.events()
        let seen = Task { () -> Bool in
            for try await event in stream {
                if case .state(let snapshot) = event, snapshot.step("story")["status"].string == "awaiting" { return true }
            }
            return false
        }
        try await Task.sleep(for: .milliseconds(600))
        try run(node, ["push", "--run", runDir.path, "--step", "story", "--data", #"{"stories":[{"id":"a","title":"A","beats":[]}],"recommended":"a"}"#])
        let reached = try await withThrowingTaskGroup(of: Bool.self) { group in
            group.addTask { try await seen.value }
            group.addTask { try await Task.sleep(for: .seconds(8)); return false }
            let first = try await group.next() ?? false
            group.cancelAll(); return first
        }
        XCTAssertTrue(reached, "a push must reach the live stream")

        // Every action the native screens send, with the exact shape console.md specifies.
        let obj: ([String: JSONValue]) -> JSONValue = { .object($0) }
        let sent: [(String, String, JSONValue, String)] = [
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
            ("story", "note", .null, "make it punchier"),
        ]
        for (step, type, value, note) in sent { try await client.send(step: step, type: type, value: value, note: note) }
        // The comment's id, then an apply for it, then an answer to an ask.
        let snapshot = try await client.state()
        let note = try XCTUnwrap(snapshot.notes.first)
        try await client.send(step: "animatic", type: "apply", value: obj(["ids": .array([.string(note.id)])]))
        try await client.send(step: "render", type: "answer", value: obj(["ask": .string("q1"), "choice": .string("word"), "text": .string("wordmark")]), note: "wordmark")

        let lines = try String(contentsOf: runDir.appendingPathComponent("actions.jsonl"), encoding: .utf8).split(separator: "\n")
        let actions = try lines.map { try JSONDecoder().decode(JSONValue.self, from: Data($0.utf8)) }
        XCTAssertEqual(actions.count, sent.count + 2)
        for (index, expected) in sent.enumerated() {
            let action = actions[index]
            XCTAssertEqual(action["step"].string, expected.0, "step of \(expected.1)")
            XCTAssertEqual(action["type"].string, expected.1)
            XCTAssertEqual(action["value"], expected.2, "value of \(expected.0)/\(expected.1)")
            XCTAssertEqual(action["note"].string ?? "", expected.3)
            XCTAssertEqual(action["source"].string, "console")
            XCTAssertNotNil(action["id"].string); XCTAssertNotNil(action["ts"].string)
        }
        XCTAssertEqual(actions[sent.count]["type"].string, "apply")
        XCTAssertEqual(actions[sent.count]["value"]["ids"].array.compactMap(\.string), [note.id])
        XCTAssertEqual(actions[sent.count + 1]["type"].string, "answer")
        // The comment is stored as an open note carrying its moment and point.
        XCTAssertEqual(note.time, 5.5); XCTAssertEqual(note.x, 0.4); XCTAssertEqual(note.y, 0.6); XCTAssertEqual(note.quick, "Slower")
        // A step the console doesn't know is refused, not recorded.
        do { try await client.send(step: "nonsense", type: "choose"); XCTFail("unknown step must be refused") } catch {}
    }
}
