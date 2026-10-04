import XCTest
@testable import StudioCore

final class ProjectLibraryTests: XCTestCase {
    func testCreatesIndependentProjectsAndDiscoversThem() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let library = ProjectLibrary(root: root)
        let first = try library.create(name: "First film")
        let second = try library.create(name: "Second film")
        XCTAssertNotEqual(first, second)
        for subfolder in ["assets", "audio", "compositions", "exports", ".rasanai"] {
            XCTAssertTrue(FileManager.default.fileExists(atPath: first.appendingPathComponent(subfolder).path))
        }
        XCTAssertEqual(Set(try library.projects().map { $0.0.name }), ["First film", "Second film"])
        XCTAssertFalse(FileManager.default.fileExists(atPath: first.appendingPathComponent("session.json").path))
    }
    func testRejectsUnsafeNamesAndDoesNotMergeExistingProjects() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let library = ProjectLibrary(root: root)
        for name in ["", ".", "..", "../outside", "a/b", "a:b", "a\\b", "a\nb"] {
            XCTAssertThrowsError(try library.create(name: name))
        }
        let folder = try library.create(name: "Keep me")
        let before = try Data(contentsOf: folder.appendingPathComponent("rasanai-project.json"))
        XCTAssertThrowsError(try library.create(name: "Keep me"))
        XCTAssertEqual(try Data(contentsOf: folder.appendingPathComponent("rasanai-project.json")), before)
    }
    func testIgnoresSymlinkProjects() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let library = ProjectLibrary(root: root)
        let folder = try library.create(name: "Original")
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("Alias"), withDestinationURL: folder)
        XCTAssertEqual(try library.projects().count, 1)
    }
    func testAgentArgumentsAndShellQuoting() {
        XCTAssertEqual(LocalAgent.claude.statusArguments, ["auth", "status"])
        XCTAssertEqual(LocalAgent.codex.loginArguments, ["login"])
        XCTAssertEqual(LocalAgent.shellQuote("/tmp/agent's cli"), "'/tmp/agent'\\''s cli'")
    }
}
