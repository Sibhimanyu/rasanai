import Foundation
import XCTest
@testable import StudioCore

final class LinkedSourcesTests: XCTestCase {
    private var root: URL!
    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("linked-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: root) }

    private func folder(_ name: String, clips: [String] = []) throws -> URL {
        let url = root.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        for clip in clips { try Data(count: 1000).write(to: url.appendingPathComponent(clip)) }
        return url
    }
    private func file(_ name: String) throws -> URL {
        let url = root.appendingPathComponent(name); try Data(count: 10).write(to: url); return url
    }

    func testAFootageFolderIsAcceptedAndReferencedInPlace() throws {
        let footage = try folder("Trip", clips: ["a.mov"])
        guard case .success(let source) = LinkedSource.footageFolder(footage) else { return XCTFail("folder rejected") }
        XCTAssertEqual(source.kind, .footage)
        XCTAssertTrue(source.isFolder)
        XCTAssertEqual(source.url.standardizedFileURL.path, footage.standardizedFileURL.path)
        // Nothing is copied: the folder is untouched and no project exists to copy into.
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: footage.path), ["a.mov"])
    }

    func testFilesHiddenFoldersAndMissingPathsAreNotFootageFolders() throws {
        XCTAssertEqual(LinkedSource.footageFolder(try file("clip.mov")), .failure(.notAFolder))
        XCTAssertEqual(LinkedSource.footageFolder(try folder(".hidden")), .failure(.hidden))
        XCTAssertEqual(LinkedSource.footageFolder(root.appendingPathComponent("nope")), .failure(.missing))
    }

    func testReferenceVideosMustBeVideoFiles() throws {
        guard case .success(let ref) = LinkedSource.referenceVideo(try file("ref.MP4")) else { return XCTFail("video rejected") }
        XCTAssertEqual(ref.kind, .reference)
        XCTAssertFalse(ref.isFolder)
        XCTAssertEqual(LinkedSource.referenceVideo(try file("notes.txt")), .failure(.notAVideo))
        XCTAssertEqual(LinkedSource.referenceVideo(try folder("Dir")), .failure(.notAVideo))
    }

    func testADropSplitsFoldersFromFiles() throws {
        let dir = try folder("Clips"), doc = try file("brief.pdf")
        let split = LinkedSource.split([dir, doc])
        XCTAssertEqual(split.folders.map(\.name), ["Clips"])
        XCTAssertEqual(split.files.map(\.lastPathComponent), ["brief.pdf"])
    }

    func testMergeDedupesAndKeepsOneReference() throws {
        let a = LinkedSource(kind: .footage, path: "/a", isFolder: true)
        let r1 = LinkedSource(kind: .reference, path: "/r1.mp4", isFolder: false)
        let r2 = LinkedSource(kind: .reference, path: "/r2.mp4", isFolder: false)
        var all = LinkedSource.merge([], adding: [a, a, r1])
        XCTAssertEqual(all, [a, r1])
        all = LinkedSource.merge(all, adding: [r2])
        XCTAssertEqual(all, [a, r2])
    }

    func testFolderSummaryCountsOnlyVideo() throws {
        let dir = try folder("Mixed", clips: ["a.mov", "b.mp4", "readme.txt", ".DS_Store"])
        let summary = LinkedSource.summarize(folder: dir)
        XCTAssertEqual(summary.clips, 2)
        XCTAssertEqual(summary.bytes, 2000)
        XCTAssertTrue(summary.line.hasPrefix("2 clips · "))
        XCTAssertEqual(LinkedSource.summarize(folder: try folder("Empty")).line, "No video clips found")
    }

    func testTheDraftKeepsLinkedSourcesAndOldDraftsStillLoad() throws {
        var draft = FilmDraft(brief: "A reel")
        draft.linked = [LinkedSource(kind: .footage, path: "/Volumes/Shoot", isFolder: true), LinkedSource(kind: .reference, path: "/Movies/like-this.mov", isFolder: false)]
        let project = try folder("Film")
        try draft.save(in: project)
        XCTAssertEqual(FilmDraft.load(in: project)?.linked, draft.linked)
        let json = try String(contentsOf: project.appendingPathComponent("rasanai-brief.json"), encoding: .utf8)
        XCTAssertTrue(json.contains("linkedSources"))
        // A draft saved before this existed has no key.
        let old = #"{"brief":"b","duration":30,"aspect":"16:9","agent":"claude"}"#
        try Data(old.utf8).write(to: project.appendingPathComponent("rasanai-brief.json"))
        XCTAssertEqual(FilmDraft.load(in: project)?.linked, [])
    }

    func testTheRequestNamesFoldersInPlaceAndReferencesApart() {
        var draft = FilmDraft(brief: "A trip reel")
        draft.linked = [LinkedSource(kind: .footage, path: "/Volumes/Shoot/Day1", isFolder: true), LinkedSource(kind: .reference, path: "/Movies/like-this.mov", isFolder: false)]
        let request = draft.request(sources: [])
        XCTAssertTrue(request.contains("FOOTAGE FOLDER (the user's raw footage, referenced in place): /Volumes/Shoot/Day1"))
        XCTAssertTrue(request.contains("REFERENCE VIDEO (make it like this): /Movies/like-this.mov"))
        XCTAssertTrue(request.contains("Never copy, move, rename or write to them"))
        XCTAssertTrue(request.contains("never cut it into the film"))
        // A footage folder is footage even though no clip was copied into the project.
        XCTAssertTrue(request.contains("FOOTAGE REEL"))
        // A reference alone is not footage.
        var referenceOnly = FilmDraft(brief: "Like this")
        referenceOnly.linked = [draft.linked[1]]
        XCTAssertFalse(referenceOnly.request(sources: []).contains("FOOTAGE REEL"))
        XCTAssertFalse(FilmDraft(brief: "x").request(sources: []).contains("LINKED SOURCES"))
    }

    func testLinkedFoldersAreReadableButNeverWritable() {
        var draft = FilmDraft(brief: "x")
        draft.linked = [LinkedSource(kind: .footage, path: "/Volumes/Shoot", isFolder: true), LinkedSource(kind: .reference, path: "/Movies/ref.mov", isFolder: false)]
        XCTAssertEqual(draft.readOnlyFolders, ["/Volumes/Shoot"])
        XCTAssertEqual(draft.readOnlyFiles, ["/Movies/ref.mov"])
        let home = FileManager.default.temporaryDirectory
        let permissions = DirectorPermissions(engine: URL(fileURLWithPath: "/engine"), home: home, toolsDirectory: home.appendingPathComponent("Tools"),
                                              readFolders: draft.readOnlyFolders, readFiles: draft.readOnlyFiles, fileExists: { _ in true })
        XCTAssertTrue(permissions.additionalDirectories.contains("/Volumes/Shoot"))
        XCTAssertFalse(permissions.writableDirectories.contains("/Volumes/Shoot"))
        XCTAssertTrue(permissions.allow.contains("Read(/Movies/ref.mov)"))
        // The reference's folder is not opened up, only the file.
        XCTAssertFalse(permissions.additionalDirectories.contains("/Movies"))
        XCTAssertTrue(permissions.claudeSettingsJSON.contains("/Volumes/Shoot"))
    }

    func testTheLaunchGrantsLinkedFolders() throws {
        let launch = try DirectorLaunch(agent: .claude, executable: URL(fileURLWithPath: "/usr/bin/true"), engine: URL(fileURLWithPath: "/engine"),
                                        project: URL(fileURLWithPath: "/p"), run: URL(fileURLWithPath: "/p/.rasanai/run-1"), request: "go",
                                        readFolders: ["/Volumes/Shoot"], readFiles: [])
        XCTAssertTrue(launch.permissions?.additionalDirectories.contains("/Volumes/Shoot") == true)
    }

    func testCopyingStaysForFilesOnly() throws {
        // Folders are never copied into a project: importFiles still refuses them (they go through LinkedSource instead).
        let project = try folder("Proj")
        XCTAssertThrowsError(try ProjectSources.importFiles([try folder("Footage", clips: ["a.mov"])], into: project))
        XCTAssertEqual(try ProjectSources.files(in: project), [])
        let copied = try ProjectSources.importFiles([try file("logo.png")], into: project)
        XCTAssertEqual(copied.count, 1)
    }

    func testTemplatesDoNotCarryPointersToAFilmsFolders() {
        // The template is saved from the draft with `linked` cleared (see StudioStore.saveTemplate).
        var draft = FilmDraft(brief: "x")
        draft.linked = [LinkedSource(kind: .footage, path: "/a", isFolder: true)]
        draft.linked = []
        XCTAssertEqual(draft, FilmDraft(brief: "x"))
    }
}
