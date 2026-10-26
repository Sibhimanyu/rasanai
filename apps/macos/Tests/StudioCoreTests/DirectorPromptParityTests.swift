import XCTest
@testable import StudioCore

/// The director's resume prompt exists twice: here (`DirectorLaunch`, `FilmDraft.creativeDirection`) and in Node
/// (`skills/rasanai/scripts/lib/director-launch.mjs`, used by `director.mjs resume` so a phone or script can resume a film
/// exactly as Studio does). Two files keep them in step:
///
/// - `Fixtures/director-prompt-golden.json`: inputs and the exact prompt Swift builds from them. This test rebuilds each one;
///   `scripts/tests/director-launch.mjs` rebuilds the same inputs in Node and compares.
/// - `skills/rasanai/scripts/lib/director-prompt-data.json`: the long texts Node reads instead of copying (level, footage and
///   presenter text, the pace and model-plan sections). This test fails when the Swift text and this file differ.
///
/// After changing any of that text, regenerate both: `RASAN_WRITE_GOLDEN=1 swift test --filter DirectorPromptParityTests`.
final class DirectorPromptParityTests: XCTestCase {
    static let resumeRequest = "Resume this existing run from its saved state. Preserve completed work and continue with the next pending step."
    static let engine = "/engine", project = "/project", run = "/project/.rasanai/run-1"

    struct Case {
        var name: String, agent: String, draft: String?, sources: [String] = [], briefSeeded = true, questions: String? = nil
    }
    static let questionsJSON = #"{"version":1,"questions":[{"id":"pictures","question":"Pictures?","choices":[{"id":"real","label":"Real screens"},{"id":"drawn","label":"Drawn"}]},{"id":"captions","question":"Captions?","choices":[{"id":"always","label":"Always"}]}]}"#
    static let cases: [Case] = [
        Case(name: "claude-no-draft", agent: "claude", draft: nil),
        Case(name: "claude-minimal-draft-unseeded", agent: "claude", draft: #"{"brief":"b","duration":30,"aspect":"16:9","agent":"claude"}"#, briefSeeded: false),
        Case(name: "claude-full", agent: "claude", draft: #"{"brief":"A launch","duration":45,"aspect":"9:16","agent":"claude","motionLevel":"balanced","pace":"standard","modelPlan":"opus","linkedSources":[{"kind":"footage","path":"/Users/x/Clips","isFolder":true},{"kind":"reference","path":"/Users/x/ref.mov","isFolder":false}],"preferences":{"zz-unknown":"x","captions":"always","pictures":"real"},"series":{"name":"Weekly","slug":"weekly","path":"/lib/Series/weekly"},"ending_file":"/Users/x/end.png"}"#, sources: ["notes.pdf", "take1.MOV"], questions: questionsJSON),
        Case(name: "codex-thorough-minimal", agent: "codex", draft: #"{"brief":"b","duration":20,"aspect":"1:1","agent":"codex","motionLevel":"minimal","pace":"thorough","modelPlan":"sonnet"}"#, sources: ["clip.mp4"]),
        Case(name: "claude-legacy-depth-settings-plan", agent: "claude", draft: #"{"brief":"b","duration":60,"aspect":"16:9","agent":"claude","researchDepth":"deep","modelPlan":"settings"}"#),
        Case(name: "claude-thorough-recommended", agent: "claude", draft: #"{"brief":"b","duration":60,"aspect":"16:9","agent":"claude","pace":"thorough"}"#),
        Case(name: "claude-fast-recommended-unknown-level", agent: "claude", draft: #"{"brief":"b","duration":60,"aspect":"16:9","agent":"claude","pace":"fast","motionLevel":"wild"}"#),
        Case(name: "claude-old-draft-no-pace", agent: "claude", draft: #"{"brief":"b","duration":60,"aspect":"16:9","agent":"claude"}"#, sources: ["a.pdf"]),
        Case(name: "claude-broken-draft", agent: "claude", draft: #"{"brief":"b"}"#),
    ]

    static func prompt(for c: Case, questions: String?) throws -> String {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("prompt-parity-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        if let draftText = c.draft { try Data(draftText.utf8).write(to: dir.appendingPathComponent("rasanai-brief.json")) }
        let draft = FilmDraft.load(in: dir)
        let saved = TasteQuestions.installed
        TasteQuestions.installed = try questions.map { try TasteQuestions.decode(Data($0.utf8)) }
        defer { TasteQuestions.installed = saved }
        var request = resumeRequest
        if let draft { request += "\n\n" + draft.creativeDirection(sources: c.sources.map { URL(fileURLWithPath: "/project/assets/sources/" + $0) }) + draft.linkedText }
        let agent = LocalAgent(rawValue: c.agent)!
        let launch = try DirectorLaunch(agent: agent, executable: URL(fileURLWithPath: "/usr/bin/agent"), engine: URL(fileURLWithPath: engine),
            project: URL(fileURLWithPath: project), run: URL(fileURLWithPath: run), request: request, briefSeeded: c.briefSeeded,
            pace: draft?.pace ?? .defaultForNewFilms, modelPlan: draft?.modelPlan ?? .recommended)
        return launch.prompt
    }

    /// The launch prompt around the variable parts, as Swift builds it: the engine, project and run paths, the brief paragraph and the request
    /// are replaced by markers, and the pace sections (which sit just above the creative contract) are left out. Node fills them back in.
    static func template() -> (head: String, tail: String) {
        let launch = try! DirectorLaunch(agent: .claude, executable: URL(fileURLWithPath: "/usr/bin/agent"), engine: URL(fileURLWithPath: "/@@ENGINE@@"),
            project: URL(fileURLWithPath: "/@@PROJECT@@"), run: URL(fileURLWithPath: "/@@RUN@@"), request: "@@REQUEST@@", briefSeeded: true, pace: .thorough)
        let text = launch.prompt.replacingOccurrences(of: DirectorLaunch.seededBriefParagraph, with: "@@BRIEF@@")
            .replacingOccurrences(of: "/@@ENGINE@@", with: "@@ENGINE@@").replacingOccurrences(of: "/@@PROJECT@@", with: "@@PROJECT@@").replacingOccurrences(of: "/@@RUN@@", with: "@@RUN@@")
        let marker = text.range(of: "CREATIVE CONTRACT (")!
        return (String(text[..<marker.lowerBound]), String(text[marker.lowerBound...]))
    }

    static func parts() -> [String: Any] {
        var launch: [String: Any] = [:], build: [String: Any] = [:], direction: [String: Any] = [:]
        for pace in FilmPace.allCases {
            launch[pace.rawValue] = pace.launchSection ?? NSNull()
            for agent in ["claude", "codex"] { for plan in ModelPlan.allCases { build["\(pace.rawValue)|\(agent)|\(plan.rawValue)"] = pace.buildSection(agent: agent, modelPlan: plan) ?? NSNull() } }
            for plan in ModelPlan.allCases { direction["\(plan.rawValue)|\(pace.rawValue)"] = plan.direction(pace: pace) ?? NSNull() }
        }
        return ["version": 1, "seededBrief": DirectorLaunch.seededBriefParagraph, "missingBrief": DirectorLaunch.missingBriefParagraph,
                "resumeRequest": resumeRequest, "head": template().head, "tail": template().tail, "launch": launch, "build": build, "direction": direction,
                "level": FilmDraft.levelText, "footage": FilmDraft.footageText, "presenter": FilmDraft.presenterText]
    }

    static let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../..").standardizedFileURL
    static var partsURL: URL { repo.appendingPathComponent("skills/rasanai/scripts/lib/director-prompt-data.json") }
    static var goldenURL: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures/director-prompt-golden.json") }
    static func json(_ object: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]) + Data("\n".utf8)
    }

    func testGoldenPromptsAndSharedTextMatchWhatNodeReads() throws {
        if ProcessInfo.processInfo.environment["RASAN_WRITE_GOLDEN"] == "1" {
            try Self.json(Self.parts()).write(to: Self.partsURL)
            var out: [[String: Any]] = []
            for c in Self.cases {
                var input: [String: Any] = ["agent": c.agent, "sources": c.sources, "briefSeeded": c.briefSeeded]
                input["draft"] = c.draft.map { (try? JSONSerialization.jsonObject(with: Data($0.utf8))) ?? NSNull() } ?? NSNull()
                input["questions"] = c.questions.map { (try? JSONSerialization.jsonObject(with: Data($0.utf8))) ?? NSNull() } ?? NSNull()
                out.append(["name": c.name, "input": input, "prompt": try Self.prompt(for: c, questions: c.questions)])
            }
            try Self.json(["engine": Self.engine, "project": Self.project, "run": Self.run, "cases": out]).write(to: Self.goldenURL)
        }
        let shared = try JSONSerialization.jsonObject(with: Data(contentsOf: Self.partsURL)) as? NSDictionary
        XCTAssertEqual(shared, Self.parts() as NSDictionary, "director-prompt-data.json is stale: RASAN_WRITE_GOLDEN=1 swift test --filter DirectorPromptParityTests")
        let golden = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: Self.goldenURL)) as? [String: Any])
        let cases = try XCTUnwrap(golden["cases"] as? [[String: Any]])
        XCTAssertEqual(cases.count, Self.cases.count)
        for stored in cases {
            let name = try XCTUnwrap(stored["name"] as? String)
            let c = try XCTUnwrap(Self.cases.first { $0.name == name }, name)
            XCTAssertEqual(try Self.prompt(for: c, questions: c.questions), stored["prompt"] as? String, "golden prompt for \(name) is stale")
        }
    }
}
