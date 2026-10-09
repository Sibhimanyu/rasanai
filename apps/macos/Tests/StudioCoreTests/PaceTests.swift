import XCTest
@testable import StudioCore

final class PaceTests: XCTestCase {
    func testFastResearchPromptIsFirmAndSpecific() throws {
        let prompt = try launch(.fast).prompt
        XCTAssertTrue(prompt.contains("RESEARCH BUDGET: FAST PACE"))
        XCTAssertTrue(prompt.contains("at most about 2 minutes"))
        XCTAssertTrue(prompt.contains("at most 6 sources"))
        XCTAssertTrue(prompt.contains("overrides the engine's research defaults"))
        XCTAssertTrue(prompt.contains("Do not analyse other companies' launch films"))
        XCTAssertTrue(prompt.contains("Do not dispatch a parallel research crew"))
        XCTAssertTrue(prompt.contains("what the product is, its one key feature, its brand type and colours, and its exact UI"))
        XCTAssertTrue(prompt.contains("`findings`"))
        XCTAssertLessThan(try XCTUnwrap(prompt.range(of: "RESEARCH BUDGET")).lowerBound, try XCTUnwrap(prompt.range(of: "User request")).lowerBound)
    }
    func testStandardAndDeepPrompts() throws {
        let standard = try launch(.standard).prompt
        XCTAssertTrue(standard.contains("RESEARCH BUDGET: STANDARD PACE"))
        XCTAssertTrue(standard.contains("about 5 minutes"))
        XCTAssertTrue(standard.contains("at most 15 sources"))
        XCTAssertFalse(standard.contains("FAST PACE"))
        let deep = try launch(.thorough).prompt
        XCTAssertFalse(deep.contains("RESEARCH BUDGET"), "Deep adds no limit")
    }
    func testDraftPersistenceAndMigration() throws {
        XCTAssertEqual(FilmDraft().pace, .fast)
        XCTAssertEqual(FilmPace.allCases.map(\.title), ["Fast", "Standard", "Thorough"])
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try FilmDraft(brief: "b", pace: .thorough).save(in: dir)
        XCTAssertEqual(FilmDraft.load(in: dir)?.pace, .thorough)
        // A draft written before the setting existed keeps the research it always had.
        let old = #"{"brief":"b","duration":30,"aspect":"16:9","agent":"claude","motionLevel":"balanced"}"#
        try Data(old.utf8).write(to: dir.appendingPathComponent("rasanai-brief.json"))
        XCTAssertEqual(FilmDraft.load(in: dir)?.pace, .standard)
        for (old, pace) in [("quick", FilmPace.fast), ("standard", .standard), ("deep", .thorough)] {
            let json = #"{"brief":"b","duration":30,"aspect":"16:9","agent":"claude","researchDepth":"\#(old)"}"#
            try Data(json.utf8).write(to: dir.appendingPathComponent("rasanai-brief.json"))
            XCTAssertEqual(FilmDraft.load(in: dir)?.pace, pace, old)
        }
        let junk = #"{"brief":"b","duration":30,"aspect":"16:9","agent":"claude","pace":"bottomless"}"#
        try Data(junk.utf8).write(to: dir.appendingPathComponent("rasanai-brief.json"))
        XCTAssertEqual(FilmDraft.load(in: dir)?.pace, .standard)
    }
    func testEditorDraftIgnoresFilmPaceWhenEmpty() {
        XCTAssertTrue(FilmEditorDraft(name: "", film: FilmDraft(pace: .thorough), sources: []).isEmpty)
        XCTAssertFalse(FilmEditorDraft(name: "", film: FilmDraft(brief: "x", pace: .thorough), sources: []).isEmpty)
    }
    func testTimeBoxFiresAtOneAndAHalfTimesBudgetExactlyOnce() throws {
        var box = ResearchTimeBox()
        let working = try session(brief: "working")
        XCTAssertEqual(FilmPace.fast.timeBoxSeconds, 180)
        XCTAssertEqual(FilmPace.standard.timeBoxSeconds, 450)
        XCTAssertNil(FilmPace.thorough.timeBoxSeconds)
        XCTAssertNil(box.due(depth: .fast, researchElapsed: 179, session: working))
        XCTAssertNil(box.due(depth: .fast, researchElapsed: nil, session: working))
        XCTAssertNil(box.due(depth: .thorough, researchElapsed: 99_999, session: working))
        XCTAssertEqual(box.due(depth: .fast, researchElapsed: 181, session: working), "brief")
        box.markSent()
        XCTAssertNil(box.due(depth: .fast, researchElapsed: 600, session: working))
        box.reset()
        XCTAssertEqual(box.due(depth: .standard, researchElapsed: 451, session: working), "brief")
    }
    func testNoteTargetsOnlyStepsTheConsoleAcceptsWhileResearching() throws {
        XCTAssertEqual(ResearchTimeBox.noteStep(in: try session(brief: "working")), "brief")
        XCTAssertNil(ResearchTimeBox.noteStep(in: try session(brief: "awaiting")), "the user is reading the brief: research is over")
        XCTAssertEqual(ResearchTimeBox.noteStep(in: try session(brief: "done", research: "working")), "research")
        XCTAssertNil(ResearchTimeBox.noteStep(in: try session(brief: "done", research: "done")))
        XCTAssertTrue(ResearchTimeBox.noteText.hasPrefix("Time's up for research: go with what you have"))
    }
    // MARK: Build plan

    func testFastBuildPlanIsFirmAndParallel() throws {
        let prompt = try launch(.fast).prompt
        XCTAssertTrue(prompt.contains("BUILD PLAN: FAST PACE"))
        XCTAssertTrue(prompt.contains("overrides the engine's crew defaults"))
        XCTAssertTrue(prompt.contains("at most about 10 minutes"))
        XCTAssertTrue(prompt.contains("written contract"))
        XCTAssertTrue(prompt.contains("one agent per scene, all launched at once in the background (cap 10"))
        XCTAssertTrue(prompt.contains("No animator waits for a shared-world build"))
        XCTAssertTrue(prompt.contains("placeholders"))
        XCTAssertTrue(prompt.contains("Sonnet 5.5 subagents for key frames, scene animators, fix agents, gate checks and renders"))
        XCTAssertTrue(prompt.contains("ONE final fresh-eyes review"))
        XCTAssertTrue(prompt.contains("Exactly one critic round"))
        XCTAssertTrue(prompt.contains("one draft render"))
    }
    func testStandardBuildPlanAllowsTwoRoundsAndOpusKeyFrames() throws {
        let prompt = try launch(.standard).prompt
        XCTAssertTrue(prompt.contains("BUILD PLAN: STANDARD PACE"))
        XCTAssertTrue(prompt.contains("all launched at once in the background"))
        XCTAssertTrue(prompt.contains("At most two critic rounds"))
        XCTAssertTrue(prompt.contains("at most two draft renders"))
        XCTAssertTrue(prompt.contains("Opus 5.5 for the director, the script and design desks, the Motion Director's score, key frames and the critic rounds"))
        XCTAssertFalse(prompt.contains("Exactly one critic round"))
    }
    func testThoroughKeepsEngineDefaults() throws {
        let prompt = try launch(.thorough).prompt
        XCTAssertFalse(prompt.contains("BUILD PLAN"))
        XCTAssertFalse(prompt.contains("RESEARCH BUDGET"))
    }
    func testSingleModelPlansBeatThePaceSplit() throws {
        let opus = try launch(.fast, plan: .opus).prompt
        XCTAssertTrue(opus.contains("chose Opus 5.5 for every role"))
        XCTAssertTrue(opus.contains("wins over any Sonnet assignment"))
        XCTAssertFalse(opus.contains("Sonnet 5.5 subagents for key frames"))
        let sonnet = try launch(.standard, plan: .sonnet).prompt
        XCTAssertTrue(sonnet.contains("chose Sonnet 5.5 for every role"))
        XCTAssertFalse(sonnet.contains("Opus 5.5 for the director, the script"))
        XCTAssertTrue(try launch(.fast, plan: .settings).prompt.contains("left the model to Settings"))
    }
    func testModelPlanDirectionMatchesPace() {
        var draft = FilmDraft(brief: "x", pace: .fast)
        let fast = draft.creativeDirection(sources: [])
        XCTAssertTrue(fast.contains("MODEL PLAN: RECOMMENDED (FAST PACE)"))
        XCTAssertTrue(fast.contains("key frames, scene animators, fix agents"))
        XCTAssertFalse(fast.contains("the scene animators and the critics"), "must not contradict the BUILD PLAN")
        draft.pace = .standard
        XCTAssertTrue(draft.creativeDirection(sources: []).contains("STANDARD PACE"))
        draft.pace = .thorough
        XCTAssertTrue(draft.creativeDirection(sources: []).contains("the scene animators and the critics"))
        draft.modelPlan = .opus
        XCTAssertTrue(draft.creativeDirection(sources: []).contains("OPUS EVERYWHERE"))
    }
    func testCodexGetsNoModelSplit() throws {
        let prompt = try DirectorLaunch(agent: .codex, executable: URL(fileURLWithPath: "/tmp/cli"), engine: URL(fileURLWithPath: "/engine"),
            project: URL(fileURLWithPath: "/project"), run: URL(fileURLWithPath: "/project/.rasanai/run"), request: "Make a film", pace: .fast).prompt
        XCTAssertTrue(prompt.contains("BUILD PLAN: FAST PACE"))
        XCTAssertFalse(prompt.contains("Sonnet"))
    }
    private func session(brief: String, research: String? = nil) throws -> SessionSnapshot {
        let r = research.map { #","research":{"status":"\#($0)"}"# } ?? ""
        return try SessionSnapshot(data: Data(#"{"current":"brief","steps":{"brief":{"status":"\#(brief)"}\#(r)}}"#.utf8))
    }
    private func launch(_ pace: FilmPace, plan: ModelPlan = .recommended) throws -> DirectorLaunch {
        try DirectorLaunch(agent: .claude, executable: URL(fileURLWithPath: "/tmp/cli"), engine: URL(fileURLWithPath: "/engine"),
            project: URL(fileURLWithPath: "/project"), run: URL(fileURLWithPath: "/project/.rasanai/run"),
            request: "Make a film", pace: pace, modelPlan: plan)
    }
}

@MainActor
final class ResearchEnforcerTests: XCTestCase {
    private func working() throws -> SessionSnapshot {
        try SessionSnapshot(data: Data(#"{"current":"brief","steps":{"brief":{"status":"working"}}}"#.utf8))
    }
    func testSendsOneNoteOnTheBriefStepAndNeverAgain() async throws {
        let enforcer = ResearchEnforcer()
        var sent: [(String, String, String)] = []
        let session = try working()
        for elapsed in [60.0, 170, 181, 200, 900] {
            await enforcer.check(depth: .fast, researchElapsed: elapsed, session: session) { sent.append(($0, $1, $2)); return true }
        }
        XCTAssertEqual(sent.count, 1)
        XCTAssertEqual(sent.first?.0, "brief")
        XCTAssertEqual(sent.first?.1, "note")
        XCTAssertEqual(sent.first?.2, ResearchTimeBox.noteText)
        XCTAssertTrue(enforcer.hasFired)
    }
    func testRefusedSendIsRetriedThenLatches() async throws {
        let enforcer = ResearchEnforcer()
        var attempts = 0
        let session = try working()
        let first = await enforcer.check(depth: .fast, researchElapsed: 200, session: session) { _, _, _ in attempts += 1; return false }
        XCTAssertFalse(first)
        XCTAssertFalse(enforcer.hasFired)
        let second = await enforcer.check(depth: .fast, researchElapsed: 210, session: session) { _, _, _ in attempts += 1; return true }
        XCTAssertTrue(second)
        let third = await enforcer.check(depth: .fast, researchElapsed: 220, session: session) { _, _, _ in attempts += 1; return true }
        XCTAssertFalse(third)
        XCTAssertEqual(attempts, 2)
    }
    func testDeepNeverFiresAndResetAllowsANewRun() async throws {
        let enforcer = ResearchEnforcer()
        let session = try working()
        let deep = await enforcer.check(depth: .thorough, researchElapsed: 10_000, session: session) { _, _, _ in true }
        XCTAssertFalse(deep)
        _ = await enforcer.check(depth: .standard, researchElapsed: 500, session: session) { _, _, _ in true }
        XCTAssertTrue(enforcer.hasFired)
        enforcer.reset()
        let again = await enforcer.check(depth: .standard, researchElapsed: 500, session: session) { _, _, _ in true }
        XCTAssertTrue(again)
    }
}
