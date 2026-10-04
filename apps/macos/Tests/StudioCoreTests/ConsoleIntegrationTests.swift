import Foundation
import XCTest
@testable import StudioCore

@MainActor
final class ConsoleIntegrationTests: XCTestCase {
    /// Opt-in: point only at a disposable console run, never a working film.
    func testNativeActionsReachTheExistingConsole() async throws {
        guard let path = ProcessInfo.processInfo.environment["RASANAI_TEST_RUN"] else {
            throw XCTSkip("Set RASANAI_TEST_RUN to a disposable running console to exercise the HTTP bridge.")
        }
        let folder = URL(fileURLWithPath: path)
        let address = try ConsoleAddress(data: Data(contentsOf: folder.appendingPathComponent("address.json")))
        let client = ConsoleClient(address: address)
        let initial = try await client.state()
        XCTAssertFalse(initial.title.isEmpty)
        let noteText = "Native bridge test \(UUID().uuidString)"
        try await client.send(step: "animatic", type: "comment", value: .object([
            "scene": .number(3), "t": .number(13), "scope": .string("scene")
        ]), note: noteText)
        let commented = try await client.state()
        let note = try XCTUnwrap(commented.notes.first { $0.text == noteText })
        XCTAssertEqual(note.scene, "3")
        XCTAssertEqual(note.time, 13)
        XCTAssertEqual(note.state, "open")

        try await client.send(step: "animatic", type: "apply", value: .object(["ids": .array([.string(note.id)])]))
        let applied = try await client.state()
        XCTAssertEqual(applied.animatic["sent"]["type"].string, "apply")
        // Submitting an apply request must not falsely claim that the director has resolved it.
        XCTAssertEqual(applied.notes.first { $0.id == note.id }?.state, "open")

        try await client.send(step: "animatic", type: "approve")
        let approved = try await client.state()
        XCTAssertEqual(approved.animatic["sent"]["type"].string, "approve")
        let actions = try String(contentsOf: folder.appendingPathComponent("actions.jsonl"), encoding: .utf8)
            .split(separator: "\n").map { try JSONDecoder().decode(JSONValue.self, from: Data($0.utf8)) }
        XCTAssertEqual(actions.suffix(3).map { $0["type"].string }, ["comment", "apply", "approve"])
        XCTAssertTrue(actions.suffix(3).allSatisfy { $0["source"].string == "console" })
    }
}
