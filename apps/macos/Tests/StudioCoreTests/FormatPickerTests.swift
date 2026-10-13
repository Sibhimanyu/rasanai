import Foundation
import XCTest
@testable import StudioCore

final class FormatPickerTests: XCTestCase {
    private var root: URL!
    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("formats-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: root) }

    /// The bundled fallback copy (so tests do not depend on the skill being installed).
    private func bundled() throws -> FormatCatalog {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "formats", withExtension: "json", subdirectory: "Fixtures"))
        return try FormatCatalog.decode(Data(contentsOf: url))
    }
    private func folder(_ name: String, files: [String]) throws -> URL {
        let url = root.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        for file in files { try Data(count: 10).write(to: url.appendingPathComponent(file)) }
        return url
    }

    func testDecodesTheCatalogue() throws {
        let catalog = try bundled()
        XCTAssertEqual(catalog.tiles.count, 12)
        XCTAssertEqual(catalog.options.count, 62)
        for tile in catalog.tiles {
            XCTAssertTrue(tile.options.contains(tile.default), tile.id)
            for id in tile.options { XCTAssertEqual(catalog.option(id)?.tile, tile.id, id) }
        }
        let launch = try XCTUnwrap(catalog.option("feature-reveal"))
        XCTAssertEqual(launch.title, "Feature launch")
        XCTAssertEqual(launch.kind, "feature launch")
        XCTAssertEqual(launch.lengthSeconds, 30)
        XCTAssertEqual(launch.status, .ready)
        let soon = try XCTUnwrap(catalog.option("app-store-preview"))
        XCTAssertEqual(soon.status, .soon)
        XCTAssertEqual(catalog.nearest(of: soon)?.id, "product-tour")
        XCTAssertEqual(catalog.options.filter { $0.status == .soon }.count, 14)
        XCTAssertTrue(catalog.options.filter { $0.status == .soon }.allSatisfy { catalog.nearest(of: $0)?.status != .soon })
    }

    func testBundledCopyMatchesTheSkillWhenItIsInTheCheckout() throws {
        let skill = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("skills/rasanai/library/formats.json")
        guard let data = try? Data(contentsOf: skill) else { throw XCTSkip("no skill checkout beside the app") }
        XCTAssertEqual(try FormatCatalog.decode(data), try bundled(), "Tests/StudioCoreTests/Fixtures/formats.json is stale: copy library/formats.json over it")
    }

    func testLoadsFromTheInstalledSkillThenTheFallback() throws {
        let engine = root.appendingPathComponent("engine/library", isDirectory: true)
        try FileManager.default.createDirectory(at: engine, withIntermediateDirectories: true)
        let fallback = try XCTUnwrap(Bundle.module.url(forResource: "formats", withExtension: "json", subdirectory: "Fixtures"))
        XCTAssertNil(FormatCatalog.load(engine: root.appendingPathComponent("engine")), "no file, no fallback")
        XCTAssertNotNil(FormatCatalog.load(engine: root.appendingPathComponent("engine"), fallback: fallback))
        try FileManager.default.copyItem(at: fallback, to: engine.appendingPathComponent("formats.json"))
        XCTAssertEqual(FormatCatalog.load(engine: root.appendingPathComponent("engine"))?.tiles.count, 12)
        try Data("not json".utf8).write(to: engine.appendingPathComponent("formats.json"))
        XCTAssertEqual(FormatCatalog.load(engine: root.appendingPathComponent("engine"), fallback: fallback)?.tiles.count, 12, "a broken file falls back")
    }

    func testADroppedFootageFolderPreselectsTheReelTile() throws {
        let catalog = try bundled()
        let clips = try folder("Trip", files: ["a.mov", "b.mp4", "c.mov"])
        let match = try XCTUnwrap(catalog.match(request: "", paths: [clips]))
        XCTAssertEqual(match.option, "social-reel")
        XCTAssertEqual(match.tile, "reel")
        XCTAssertTrue(match.why.contains("Trip"), match.why)
        // The words still win when they name something else, and a folder of customer clips is a customer story.
        let customers = try folder("customer-calls", files: ["a.mov", "b.mov"])
        XCTAssertEqual(catalog.match(request: "", paths: [customers])?.option, "customer-story")
        let green = try folder("shoot", files: ["green-1.mov", "green-2.mov"])
        XCTAssertEqual(catalog.match(request: "", paths: [green])?.option, "presenter")
    }

    func testWordsAndLinksMatchLikeTheDirector() throws {
        let catalog = try bundled()
        XCTAssertEqual(catalog.match(request: "A 30 second feature launch for our new feature")?.option, "feature-reveal")
        XCTAssertEqual(catalog.match(request: "https://github.com/acme/app/pull/12")?.option, "whats-new")
        XCTAssertEqual(catalog.match(request: "https://acme.com")?.option, "launch-film")
        XCTAssertNil(catalog.match(request: "zzzz qqqq"))
        let song = root.appendingPathComponent("anthem.mp3"); try Data(count: 4).write(to: song)
        XCTAssertEqual(catalog.match(request: "", paths: [song])?.option, "lyric-video")
    }

    func testPickingSetsKindAndMovesOnlyUntouchedLengthAndShape() throws {
        let catalog = try bundled()
        let feature = try XCTUnwrap(catalog.option("feature-reveal"))
        var draft = FilmDraft(brief: "x")
        catalog.pick(feature, in: &draft)
        XCTAssertEqual(draft.format, FormatPick(tile: "launch", option: "feature-reveal", scope: nil, kind: "feature launch"))
        XCTAssertEqual(draft.duration, 30, "an untouched length follows the option")
        // A person's own change survives the next pick.
        draft.duration = 75
        let tour = try XCTUnwrap(catalog.option("product-tour"))
        catalog.pick(tour, in: &draft, previous: feature)
        XCTAssertEqual(draft.duration, 75)
        XCTAssertEqual(draft.format?.option, "product-tour")
        // A default scope applies when the option does not ask.
        XCTAssertEqual(draft.format?.scope, tour.scopeDefault)
    }

    func testTheFeatureLaunchScopeQuestion() throws {
        let catalog = try bundled()
        let feature = try XCTUnwrap(catalog.option("feature-reveal"))
        let question = try XCTUnwrap(catalog.scopeQuestion(for: feature))
        XCTAssertEqual(question.question, "Is this feature for many kinds of uses, or one job?")
        XCTAssertEqual(question.options.map(\.scope), ["universal", "category", "single-task"])
        XCTAssertTrue(question.unsure.hasPrefix("Not sure"))
        XCTAssertNil(feature.scopeDefault, "the answer is asked, never assumed")
        XCTAssertNil(catalog.scopeQuestion(for: try XCTUnwrap(catalog.option("launch-film"))))
        // The answer goes into format.scope; "not sure" leaves it out.
        var draft = FilmDraft(brief: "x")
        catalog.pick(feature, in: &draft)
        XCTAssertNil(draft.format?.scope)
        draft.format?.scope = "single-task"
        XCTAssertEqual(draft.format?.json, .object(["tile": .string("launch"), "option": .string("feature-reveal"), "scope": .string("single-task")]))
        draft.format?.scope = nil
        XCTAssertEqual(draft.format?.json["scope"], .null)
        XCTAssertNil(catalog.validated(FormatPick(tile: "x", option: "nope")))
        XCTAssertNil(catalog.validated(FormatPick(tile: "x", option: "feature-reveal", scope: "weird"))?.scope)
    }

    func testEachOptionShowsItsOwnInputPrompts() throws {
        let catalog = try bundled()
        let feature = try XCTUnwrap(catalog.option("feature-reveal"))
        XCTAssertEqual(catalog.subjectPrompt(for: feature), "Your product's website or app link")
        XCTAssertEqual(catalog.inputSlots(for: feature).map(\.id), ["url", "feature"])
        let reel = try XCTUnwrap(catalog.option("social-reel"))
        XCTAssertTrue(catalog.folderPrompt(for: reel)?.contains("folder with your clips") == true)
        // A brand kit is a folder, but not footage: it must not speak for the footage well.
        XCTAssertNil(catalog.folderPrompt(for: try XCTUnwrap(catalog.option("launch-film"))))
        let song = try XCTUnwrap(catalog.option("lyric-video"))
        XCTAssertTrue(catalog.inputSlots(for: song).contains { $0.id == "song" && $0.accepts.contains("file") })
    }

    func testTheBriefFileRoundTripsTheFormat() throws {
        let catalog = try bundled()
        var draft = FilmDraft(brief: "A launch film")
        catalog.pick(try XCTUnwrap(catalog.option("feature-reveal")), in: &draft, why: "You said \"new feature\"")
        draft.format?.scope = "universal"
        try draft.save(in: root)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("rasanai-brief.json"))) as? [String: Any])
        let written = try XCTUnwrap(object["format"] as? [String: Any])
        XCTAssertEqual(written["tile"] as? String, "launch")
        XCTAssertEqual(written["option"] as? String, "feature-reveal")
        XCTAssertEqual(written["scope"] as? String, "universal")
        XCTAssertNil(written["why"], "the reason is shown, not written")
        let loaded = try XCTUnwrap(FilmDraft.load(in: root))
        XCTAssertEqual(loaded.format?.option, "feature-reveal")
        XCTAssertEqual(loaded.format?.scope, "universal")
        // Older briefs have no format and still load.
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("rasanai-brief.json"))) as? [String: Any])
        legacy.removeValue(forKey: "format")
        try JSONSerialization.data(withJSONObject: legacy).write(to: root.appendingPathComponent("rasanai-brief.json"))
        XCTAssertNil(FilmDraft.load(in: root)?.format)
        // The director's request names the pick; the seeded brief carries format and the back-compat kind.
        XCTAssertTrue(draft.request(sources: []).contains("option feature-reveal on tile launch, scope universal"))
        let fields = BriefSeed.fields(for: draft)
        XCTAssertEqual(fields["kind"].string, "feature launch")
        XCTAssertEqual(FormatPick(json: fields["format"])?.option, "feature-reveal")
        XCTAssertEqual(BriefSeed.fields(for: FilmDraft(brief: "x"))["format"], .null)
    }

    func testABriefPayloadFormatBecomesAPickWithItsReason() throws {
        let payload = JSONValue.object(["tile": .string("launch"), "option": .string("feature-reveal"), "why": .string("You said \"new feature\""), "scope": .string("category")])
        let pick = try XCTUnwrap(FormatPick(json: payload))
        XCTAssertEqual(pick.why, "You said \"new feature\"")
        XCTAssertEqual(pick.scope, "category")
        XCTAssertNil(FormatPick(json: .object(["tile": .string("launch")])))
        XCTAssertNil(FormatPick(json: .null))
    }
}
