import XCTest
@testable import StudioCore

final class ImageGenerationTests: XCTestCase {
    private func fakeCodex(in folder: URL, loginExit: Int) throws -> URL {
        let script = folder.appendingPathComponent("codex-\(loginExit)")
        try "#!/bin/sh\n[ \"$1 $2\" = \"login status\" ] && { echo 'Logged in using ChatGPT'; exit \(loginExit); }\nexit 9\n".write(to: script, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: script.path)
        return script
    }
    private func row(codex: URL?, enabled: Bool = true) async throws -> PreflightItem {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let report = await FilmPreflight.check(PreflightConfiguration(node: nil, engine: nil, driver: nil, directories: [], environment: [:],
            project: folder, sources: [], codex: codex, imageGeneration: enabled))
        return try XCTUnwrap(report.items.first { $0.id == "imagegen" })
    }
    func testImageGenerationIsReadyWhenCodexIsSignedIn() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let item = try await row(codex: fakeCodex(in: folder, loginExit: 0))
        XCTAssertEqual(item.level, .ready)
        XCTAssertEqual(item.title, "Image generation")
        XCTAssertNil(item.command)
    }
    func testImageGenerationWarnsWhenSignedOutMissingOrOffAndNeverBlocks() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let signedOut = try await row(codex: fakeCodex(in: folder, loginExit: 1))
        XCTAssertEqual(signedOut.level, .warning)
        XCTAssertEqual(signedOut.command, "codex login")
        let missing = try await row(codex: nil)
        XCTAssertEqual(missing.level, .warning)
        XCTAssertEqual(missing.command, "npm install -g @openai/codex && codex login")
        let off = try await row(codex: fakeCodex(in: folder, loginExit: 0), enabled: false)
        XCTAssertEqual(off.level, .warning)
        XCTAssertNil(off.command)
        XCTAssertTrue(off.detail.contains("turned off"))
    }
    func testPresenterDirectionAppearsOnlyForVideoSourcesAtEveryMotionLevel() {
        let video = [URL(fileURLWithPath: "/tmp/talk.MOV")]
        let image = [URL(fileURLWithPath: "/tmp/logo.png")]
        var texts: [String] = []
        for level in FilmDraft.motionLevels {
            let draft = FilmDraft(brief: "x", motionLevel: level)
            let withVideo = draft.creativeDirection(sources: video)
            XCTAssertTrue(withVideo.contains("PRESENTER FILMS"), level)
            XCTAssertTrue(withVideo.contains("green or blue screen"), level)
            XCTAssertTrue(withVideo.contains("Ask nothing in chat"), level)
            XCTAssertFalse(draft.creativeDirection(sources: image).contains("PRESENTER FILMS"), level)
            XCTAssertFalse(draft.creativeDirection(sources: []).contains("PRESENTER FILMS"), level)
            texts.append(withVideo)
        }
        XCTAssertEqual(Set(texts).count, 3)
        XCTAssertTrue(texts[2].contains("fewer image plates"))
    }
}
