import XCTest
@testable import StudioCore

final class MomentCatalogTests: XCTestCase {
    private func fixture() throws -> Data {
        try Data(contentsOf: Bundle.module.resourceURL!.appendingPathComponent("Fixtures/moments-manifest.json"))
    }
    private func temporaryFolder() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("moments-test-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    func testParsesRowsAndSkipsTheUnusable() throws {
        let moments = MomentCatalog.parse(try fixture())
        let ids = moments.map(\.id)
        XCTAssertFalse(ids.contains("A01"), "a-roll rows are not one of the four roles")
        for skipped in ["M900", "M901", "M902"] { XCTAssertFalse(ids.contains(skipped), skipped) }
        XCTAssertTrue(ids.contains("M903"), "unknown fields and a malformed mechanic must not drop a row")
        XCTAssertEqual(moments.count, 10)
        let hook = try XCTUnwrap(moments.first { $0.id == "M921" })
        XCTAssertEqual(hook.role, .hook)
        XCTAssertEqual(hook.clipURL.absoluteString, "https://static.heygen.ai/hyperframes-oss/desktop/moments/v3/M921/clip.mp4")
        XCTAssertEqual(hook.stillURL.lastPathComponent, "still.jpg")
        XCTAssertFalse(hook.mechanic.isEmpty)
        XCTAssertEqual(hook.creditLine, hook.creator.map { "By \($0.displayName)" })
    }

    func testCreatorCreditAndSourceLink() throws {
        let moments = MomentCatalog.parse(try fixture())
        let proof = try XCTUnwrap(moments.first { $0.id == "M913" })
        XCTAssertEqual(proof.creator?.handle, "@OpusClip")
        XCTAssertEqual(proof.creator?.displayName, "OpusClip")
        XCTAssertEqual(proof.creator?.url?.host, "x.com")
        XCTAssertEqual(proof.creator?.avatar?.lastPathComponent, "OpusClip.jpg")
        let sourced = try XCTUnwrap(moments.first { $0.id == "M975" })
        XCTAssertNotNil(sourced.creator?.url, "source_url is used when there is no X post")
        XCTAssertNil(moments.first { $0.id == "M903" }?.creator)
    }

    func testOnlyWebLinksSurviveAsCredits() {
        XCTAssertNil(MomentCatalog.postURL("file:///etc/passwd"))
        XCTAssertNil(MomentCatalog.postURL("javascript:alert(1)"))
        XCTAssertNotNil(MomentCatalog.postURL("https://x.com/a/status/1"))
    }

    func testNewestRowsAreFlaggedAndLeadTheList() throws {
        let moments = MomentCatalog.parse(try fixture())
        XCTAssertEqual(moments.first?.id, "M903", "the newest added row comes first")
        XCTAssertEqual(moments.filter(\.isNew).map(\.id).sorted(), ["M903", "M975"])
    }

    func testWithoutDatesTheLastRowsCountAsNew() throws {
        let rows = (1...30).map { #"{"id":"M\#($0)","name":"Row \#($0)","role":"hook","clip":"c.mp4","still":"s.jpg"}"# }.joined(separator: ",")
        let moments = MomentCatalog.parse(Data("[\(rows)]".utf8))
        XCTAssertEqual(moments.count, 30)
        XCTAssertEqual(moments.filter(\.isNew).count, MomentCatalog.fallbackNewCount)
        XCTAssertTrue(moments.first!.isNew)
    }

    func testGarbageParsesToNothing() {
        XCTAssertTrue(MomentCatalog.parse(Data("not json".utf8)).isEmpty)
        XCTAssertTrue(MomentCatalog.parse(Data("{}".utf8)).isEmpty)
    }

    func testCacheRoundTripAndOfflineFallback() async throws {
        let folder = temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder) }
        XCTAssertTrue(MomentCatalog.loadCached(in: folder).isEmpty)
        // No network in tests: a file:// URL stands in for the manifest.
        let manifest = folder.appendingPathComponent("remote.json")
        try fixture().write(to: manifest)
        let cache = folder.appendingPathComponent("cache")
        let first = try await MomentCatalog.load(url: manifest, cacheDirectory: cache)
        XCTAssertEqual(first.source, .network)
        XCTAssertEqual(first.moments.count, 10)
        try FileManager.default.removeItem(at: manifest)
        let offline = try await MomentCatalog.load(url: manifest, cacheDirectory: cache)
        XCTAssertEqual(offline.source, .cache)
        XCTAssertEqual(offline.moments.map(\.id), first.moments.map(\.id))
        do {
            _ = try await MomentCatalog.load(url: manifest, cacheDirectory: folder.appendingPathComponent("empty"))
            XCTFail("nothing cached and no network should throw")
        } catch { }
    }

    func testImageCachePassesFilesThroughAndNamesRemoteOnes() async throws {
        let folder = temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("a.png")
        try Data([1]).write(to: file)
        let local = await MomentImageCache.localURL(for: file)
        XCTAssertEqual(local, file)
        let missing = await MomentImageCache.localURL(for: folder.appendingPathComponent("none.png"))
        XCTAssertNil(missing)
        XCTAssertEqual(MomentImageCache.fileName(for: URL(string: "https://h.example/v3/M964/still.jpg")!), "M964-still.jpg")
    }

    func testSelectionKeepsOneMomentPerRoleInStoryOrder() throws {
        let moments = MomentCatalog.parse(try fixture())
        func moment(_ id: String) -> Moment { moments.first { $0.id == id }! }
        var selection = MomentSelection()
        selection.toggle(moment("M920"))   // cta
        selection.toggle(moment("M921"))   // hook
        selection.toggle(moment("M913"))   // proof
        XCTAssertEqual(selection.picks.map(\.role), ["hook", "proof", "cta"])
        selection.toggle(moment("M925"))   // second hook replaces the first
        XCTAssertEqual(selection.picks.filter { $0.role == "hook" }.map(\.id), ["M925"])
        selection.toggle(moment("M925"))   // toggling a pick removes it
        XCTAssertNil(selection.pick(for: .hook))
        selection.toggle(moment("M916"))
        selection.toggle(moment("M921"))
        XCTAssertEqual(selection.count, 4)
        XCTAssertEqual(MomentSelection([FilmMoment(id: "x", role: "nonsense")]).count, 0)
    }

    func testDraftCarriesMomentsAndOlderDraftsStillLoad() throws {
        var draft = FilmDraft(brief: "A launch film", duration: 30)
        draft.moments = [FilmMoment(id: "M921", role: "hook"), FilmMoment(id: "M920", role: "cta")]
        let folder = temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder) }
        try draft.save(in: folder)
        XCTAssertEqual(FilmDraft.load(in: folder)?.moments, draft.moments)
        let json = try String(contentsOf: folder.appendingPathComponent("rasanai-brief.json"), encoding: .utf8)
        XCTAssertTrue(json.contains("\"moments\""))
        let old = #"{"brief":"x","duration":30,"aspect":"16:9","agent":"claude"}"#
        try Data(old.utf8).write(to: folder.appendingPathComponent("rasanai-brief.json"))
        XCTAssertEqual(FilmDraft.load(in: folder)?.moments, [])
        XCTAssertFalse(FilmEditorDraft(name: "", film: draft, sources: []).isEmpty)
    }
}
