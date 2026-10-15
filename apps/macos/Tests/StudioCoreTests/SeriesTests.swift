import Foundation
import XCTest
@testable import StudioCore

final class SeriesTests: XCTestCase {
    private var root: URL!
    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("series-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: root) }

    private func questions() throws -> TasteQuestions {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "questions", withExtension: "json", subdirectory: "Fixtures"))
        return try TasteQuestions.decode(Data(contentsOf: url))
    }
    /// The bundled catalogue with the question lists formats.json now carries on the footage options.
    private func catalog() throws -> FormatCatalog {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "formats", withExtension: "json", subdirectory: "Fixtures"))
        var catalog = try FormatCatalog.decode(Data(contentsOf: url))
        let asked = ["presenter": ["pictures", "speaker", "text", "captions", "marks", "ending"], "captions-only": ["captions", "marks", "ending"], "social-reel": ["text", "captions", "ending"]]
        for index in catalog.options.indices { catalog.options[index].questions = asked[catalog.options[index].id] }
        return catalog
    }
    private func draft(_ option: String, in catalog: FormatCatalog) -> FilmDraft {
        var draft = FilmDraft(brief: "Sunday talk")
        catalog.pick(catalog.option(option)!, in: &draft)
        return draft
    }

    // MARK: Questions

    func testQuestionsDecodeAndLabel() throws {
        let questions = try questions()
        XCTAssertEqual(questions.questions.map(\.id), ["pictures", "speaker", "text", "captions", "marks", "ending"])
        XCTAssertEqual(questions.label(question: "pictures", choice: "literal"), "Plain and literal")
        XCTAssertEqual(questions.question("marks")?.askIf, "marks-found")
        XCTAssertTrue(questions.question("ending")?.choice("card")?.needsFile == true)
        XCTAssertEqual(questions.validated(["pictures": "literal", "pictures2": "x", "captions": "loud"]), ["pictures": "literal"])
    }

    // MARK: Draft

    func testPreferencesAndSeriesReachTheRequestAndTheBriefFile() throws {
        let questions = try questions()
        var draft = FilmDraft(brief: "A talk", preferences: ["captions": "off", "pictures": "literal"],
                              series: SeriesRef(name: "Quotidian", slug: "quotidian", path: "/lib/Series/quotidian"), endingFile: "/lib/Series/quotidian/end-card.mp4")
        let text = draft.tasteText(using: questions)
        XCTAssertEqual(text, """


        PREFERENCES (the owner's choices; obey them, never reinterpret; read library/questions.json for meanings):
        - pictures = literal (Plain and literal)
        - captions = off (No captions)
        ENDING CARD FILE: /lib/Series/quotidian/end-card.mp4
        SERIES: Quotidian (/lib/Series/quotidian). Read series.json there: its look (DESIGN.md) is locked, so skip the Look call, write one Story option within its rules, and auto-choose it; obey its `rules`.
        """)
        TasteQuestions.installed = questions
        defer { TasteQuestions.installed = nil }
        XCTAssertTrue(draft.creativeDirection(sources: []).contains("- captions = off (No captions)"), "the block travels in the creative direction, so a resume keeps it")
        XCTAssertTrue(draft.request(sources: []).contains("ENDING CARD FILE:"))
        XCTAssertEqual(draft.readOnlyFolders, ["/lib/Series/quotidian"])
        XCTAssertEqual(draft.readOnlyFiles, ["/lib/Series/quotidian/end-card.mp4"])

        let project = root.appendingPathComponent("film")
        try FileManager.default.createDirectory(at: project, withIntermediateDirectories: true)
        try draft.save(in: project)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: project.appendingPathComponent("rasanai-brief.json"))) as? [String: Any])
        XCTAssertEqual(object["preferences"] as? [String: String], ["captions": "off", "pictures": "literal"])
        XCTAssertEqual((object["series"] as? [String: String])?["slug"], "quotidian")
        XCTAssertEqual(object["ending_file"] as? String, "/lib/Series/quotidian/end-card.mp4")
        XCTAssertEqual(FilmDraft.load(in: project), draft)

        draft.preferences = [:]; draft.series = nil; draft.endingFile = nil
        XCTAssertEqual(draft.tasteText(using: questions), "", "an unanswered film adds nothing")
    }

    func testAnOldBriefFileStillLoads() throws {
        let project = root.appendingPathComponent("old")
        try FileManager.default.createDirectory(at: project, withIntermediateDirectories: true)
        try Data(#"{"brief":"x","duration":30,"aspect":"9:16","agent":"claude"}"#.utf8).write(to: project.appendingPathComponent("rasanai-brief.json"))
        let draft = try XCTUnwrap(FilmDraft.load(in: project))
        XCTAssertEqual(draft.preferences, [:])
        XCTAssertNil(draft.series)
        XCTAssertNil(draft.endingFile)
    }

    // MARK: Library

    func testSeriesRoundTrip() throws {
        let card = root.appendingPathComponent("my card.MP4")
        try Data(count: 64).write(to: card)
        var made = try SeriesLibrary.create(name: "Quotidian", format: FormatPick(tile: "talking", option: "presenter"), aspect: "9:16", length: .asClip,
                                            preferences: ["captions": "off", "ending": "card"], brand: "Acme", endingSource: card,
                                            marks: [TasteResult.Mark(x: 0.38, y: 0.94, w: 0.24, h: 0.04, presence: 0.98)], in: root)
        XCTAssertEqual(made.slug, "quotidian")
        XCTAssertEqual(made.endingFile, "end-card.mp4")
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent("Series/quotidian/end-card.mp4").path))
        made = try SeriesLibrary.addRule("No captions", fromFilm: "Episode 1", to: made)
        made = try SeriesLibrary.appendEpisode("/films/ep1", to: made)
        made = try SeriesLibrary.appendEpisode("/films/ep1", to: made)
        XCTAssertEqual(made.episodes, ["/films/ep1"])

        let loaded = try XCTUnwrap(SeriesLibrary.list(in: root).first)
        XCTAssertEqual(loaded.name, "Quotidian")
        XCTAssertEqual(loaded.tile, "talking"); XCTAssertEqual(loaded.option, "presenter")
        XCTAssertEqual(loaded.length, .asClip)
        XCTAssertEqual(loaded.preferences["captions"], "off")
        XCTAssertEqual(loaded.brand, "Acme")
        XCTAssertEqual(loaded.rules.map(\.text), ["No captions"])
        XCTAssertEqual(loaded.rules.first?.id, "r1")
        XCTAssertEqual(loaded.marks.first?.presence, 0.98)
        XCTAssertNil(loaded.look)

        // The contract's keys, on disk.
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: loaded.file)) as? [String: Any])
        XCTAssertEqual(object["version"] as? Int, 1)
        XCTAssertEqual(object["length"] as? String, "as-clip")
        XCTAssertEqual(object["ending_file"] as? String, "end-card.mp4")
        XCTAssertEqual((object["format"] as? [String: String])?["option"], "presenter")
        XCTAssertTrue(object["look"] is NSNull)
        XCTAssertEqual((object["rules"] as? [[String: Any]])?.first?["from_film"] as? String, "Episode 1")

        // A key the skill's scripts add survives a save.
        var edited = object; edited["extra"] = "kept"
        try JSONSerialization.data(withJSONObject: edited).write(to: loaded.file)
        _ = try SeriesLibrary.save(loaded)
        let again = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: loaded.file)) as? [String: Any])
        XCTAssertEqual(again["extra"] as? String, "kept")

        // A second series with the same name gets its own folder; deleting removes it.
        let twin = try SeriesLibrary.create(name: "Quotidian", format: nil, aspect: "16:9", length: .seconds(45), in: root)
        XCTAssertEqual(twin.slug, "quotidian-2")
        XCTAssertEqual(twin.length, .seconds(45))
        try SeriesLibrary.delete(twin)
        XCTAssertEqual(SeriesLibrary.list(in: root).count, 1)
    }

    func testLookIsCopiedFromAnApprovedFilm() throws {
        let series = try SeriesLibrary.create(name: "Quotidian", format: nil, aspect: "9:16", length: .asClip, in: root)
        let design = root.appendingPathComponent("DESIGN.md")
        try "# Look".write(to: design, atomically: true, encoding: .utf8)
        let locked = try SeriesLibrary.setLook(series, from: design)
        XCTAssertEqual(locked.look, "DESIGN.md")
        XCTAssertEqual(try String(contentsOf: try XCTUnwrap(locked.lookFile)), "# Look")
        XCTAssertEqual(SeriesLibrary.load(series.folder)?.look, "DESIGN.md")
    }

    func testUsingASeriesFillsTheDraft() throws {
        let catalog = try catalog()
        let card = root.appendingPathComponent("card.png")
        try Data(count: 8).write(to: card)
        let series = try SeriesLibrary.create(name: "Quotidian", format: FormatPick(tile: "talking", option: "presenter"), aspect: "9:16", length: .asClip,
                                              brief: "Weekly talk", preferences: ["ending": "card", "captions": "off"], brand: "Acme", endingSource: card, in: root)
        var draft = FilmDraft()
        draft.apply(series, catalog: catalog)
        XCTAssertEqual(draft.format?.option, "presenter")
        XCTAssertEqual(draft.format?.kind, catalog.option("presenter")?.kind)
        XCTAssertEqual(draft.aspect, "9:16")
        XCTAssertEqual(draft.duration, 45, "a length taken from the clip leaves the draft's own")
        XCTAssertEqual(draft.brief, "Weekly talk")
        XCTAssertEqual(draft.preferences["captions"], "off")
        XCTAssertEqual(draft.brand, "Acme")
        XCTAssertEqual(draft.endingFile, series.folder.appendingPathComponent("end-card.png").path)
        XCTAssertEqual(draft.series, series.ref)
        var typed = FilmDraft(brief: "This week's talk")
        typed.apply(series, catalog: catalog)
        XCTAssertEqual(typed.brief, "This week's talk", "a brief the person wrote is never replaced by the standing one")
    }

    func testTemplatesBecomeSeriesOnce() throws {
        var template = FilmDraft(brief: "A calm launch film", duration: 30, aspect: "9:16", brand: "Acme", format: FormatPick(tile: "launch", option: "launch-film"))
        template.linked = []
        let made = SeriesLibrary.migrate(templates: [("Spring launch", template), ("Weekly", FilmDraft(brief: "Weekly"))], in: root)
        XCTAssertEqual(made.map(\.name), ["Spring launch", "Weekly"])
        let spring = try XCTUnwrap(SeriesLibrary.list(in: root).first { $0.name == "Spring launch" })
        XCTAssertEqual(spring.brief, "A calm launch film")
        XCTAssertEqual(spring.length, .seconds(30))
        XCTAssertEqual(spring.aspect, "9:16")
        XCTAssertEqual(spring.brand, "Acme")
        XCTAssertEqual(spring.option, "launch-film")
        XCTAssertTrue(spring.episodes.isEmpty)
        XCTAssertTrue(SeriesLibrary.migrate(templates: [("Spring launch", template)], in: root).isEmpty, "a name that is already a series is left alone")
        XCTAssertEqual(SeriesLibrary.list(in: root).count, 2)
    }

    // MARK: Steps

    func testStepsForAPresenterFilm() throws {
        let catalog = try catalog(), questions = try questions()
        let film = draft("presenter", in: catalog)
        var context = FlowContext()
        context.briefNeedsAttention = false
        // Footage format: length and shape are read from the clip; the example comes before the questions; marks only if found.
        XCTAssertEqual(NewFilmSteps.steps(draft: film, catalog: catalog, questions: questions, context: context),
                       [.kind, .material, .example, .question("pictures"), .question("speaker"), .question("text"), .question("captions"), .question("ending"), .review])
        context.marksFound = true
        XCTAssertTrue(NewFilmSteps.steps(draft: film, catalog: catalog, questions: questions, context: context).contains(.question("marks")))
        // A confident inference replaces the picker screen; an empty brief adds one; a series adds its question.
        context.formatConfident = true; context.briefNeedsAttention = true; context.hasSeries = true
        XCTAssertEqual(NewFilmSteps.steps(draft: film, catalog: catalog, questions: questions, context: context).prefix(3), [.series, .material, .brief])
    }

    func testAnswersFromAnExampleOrASeriesAreNotAskedAgain() throws {
        let catalog = try catalog(), questions = try questions()
        var context = FlowContext()
        context.briefNeedsAttention = false
        context.answered = ["pictures", "captions"]
        let steps = NewFilmSteps.steps(draft: draft("presenter", in: catalog), catalog: catalog, questions: questions, context: context)
        XCTAssertFalse(steps.contains(.question("pictures")))
        XCTAssertFalse(steps.contains(.question("captions")))
        XCTAssertTrue(steps.contains(.question("speaker")))
    }

    func testASeriesFilmIsShort() throws {
        let catalog = try catalog(), questions = try questions()
        var context = FlowContext()
        context.hasSeries = true; context.seriesChosen = true; context.briefNeedsAttention = true
        XCTAssertEqual(NewFilmSteps.steps(draft: draft("presenter", in: catalog), catalog: catalog, questions: questions, context: context), [.series, .material, .brief, .review])
        context.briefNeedsAttention = false
        XCTAssertEqual(NewFilmSteps.steps(draft: draft("presenter", in: catalog), catalog: catalog, questions: questions, context: context), [.series, .material, .review])
    }

    func testAFormatWithNoQuestionsHasAShortWalk() throws {
        let catalog = try catalog(), questions = try questions()
        var context = FlowContext()
        context.briefNeedsAttention = false
        XCTAssertEqual(NewFilmSteps.steps(draft: draft("launch-film", in: catalog), catalog: catalog, questions: questions, context: context), [.kind, .material, .shape, .review])
        context.startingSeries = true
        XCTAssertTrue(NewFilmSteps.steps(draft: draft("launch-film", in: catalog), catalog: catalog, questions: questions, context: context).contains(.example), "a series started from a video always offers the example")
        // A reel is cut from a folder: its length is the film's to choose.
        XCTAssertTrue(NewFilmSteps.steps(draft: draft("social-reel", in: catalog), catalog: catalog, questions: questions, context: FlowContext()).contains(.shape))
    }

    func testClipFacts() {
        XCTAssertEqual(ClipFacts.aspect(width: 1080, height: 1920), "9:16")
        XCTAssertEqual(ClipFacts.aspect(width: 1920, height: 1080), "16:9")
        XCTAssertEqual(ClipFacts.aspect(width: 1080, height: 1080), "1:1")
        XCTAssertEqual(ClipFacts.seconds(60.07), 60)
        XCTAssertEqual(ClipFacts.seconds(2), 5)
    }

    // MARK: Learn result

    func testTasteResultPrefillsOnlyRealConfidentAnswers() throws {
        let questions = try questions()
        let json = """
        {"version":1,"video":"edit.mp4","duration_s":60.07,
         "answers":{"captions":{"choice":"off","confidence":0.9,"evidence":"no steady text band in 0 of 30 frames"},
                    "text":{"choice":"key","confidence":0.3,"evidence":"unsure"},
                    "speaker":{"choice":"floating","confidence":0.9,"evidence":"not a choice"},
                    "pictures":null},
         "cuts":[5.9,20.7],"marks":[{"x":0.38,"y":0.94,"w":0.24,"h":0.04,"presence":0.98}],
         "ending":{"start_s":57.2,"file":"end-card.mp4"},"status":"done"}
        """
        let result = try JSONDecoder().decode(TasteResult.self, from: Data(json.utf8))
        XCTAssertEqual(result.status, "done")
        XCTAssertTrue(result.foundMarks)
        XCTAssertEqual(result.ending?.startSeconds, 57.2)
        let sure = result.confident(using: questions)
        XCTAssertEqual(sure.keys.sorted(), ["captions"])
        XCTAssertEqual(sure["captions"]?.evidence, "no steady text band in 0 of 30 frames")
        XCTAssertNil(result.answers["pictures"])
        XCTAssertNil(result.endingFile(in: root), "no file, no end card")
    }
}
