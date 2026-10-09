import XCTest
@testable import StudioCore

/// Fixtures are trimmed from the real 8-hour ChatGPT for Mac run (director.log, session.json, a draft render's output).
/// Times are UTC, as the director logs them.
enum ProgressFixture {
    static func url(_ name: String) -> URL { Bundle.module.resourceURL!.appendingPathComponent("Fixtures/\(name)") }
    static func log() -> [String] { (try? String(contentsOf: url("progress-director.log"), encoding: .utf8))?.split(separator: "\n").map(String.init) ?? [] }
    static func sessionData() -> Data { (try? Data(contentsOf: url("progress-session.json"))) ?? Data() }
    static func session() -> SessionSnapshot { try! SessionSnapshot(data: sessionData()) }
    static func renderOutput() -> String { (try? String(contentsOf: url("render-output-draft.txt"), encoding: .utf8)) ?? "" }
    static func date(_ text: String) -> Date { DirectorTelemetry.parseDate("2026-10-06T\(text)Z")! }
    static let end = date("16:52:00.000")

    static func finishedEngine() -> FilmProgressEngine {
        var engine = FilmProgressEngine()
        engine.ingest(lines: log(), now: end)
        engine.update(session: session(), now: end)
        return engine
    }

    /// The log lines logged at or before `time` (the fixture lines all carry a timestamp).
    static func lines(upTo time: Date) -> [String] {
        log().filter { line in
            guard let range = line.range(of: "\"timestamp\":\""), let stamp = DirectorTelemetry.parseDate(String(line[range.upperBound...].prefix(24))) else { return true }
            return stamp <= time
        }
    }
}

final class FilmProgressRealRunTests: XCTestCase {
    private func assertTime(_ actual: Date?, _ expected: String, tolerance: TimeInterval = 90, _ message: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let actual else { return XCTFail("\(message): no time", file: file, line: line) }
        XCTAssertEqual(actual.timeIntervalSince(ProgressFixture.date(expected)), 0, accuracy: tolerance, message, file: file, line: line)
    }

    func testPhaseTimelineMatchesTheRealRun() {
        let snap = ProgressFixture.finishedEngine().snapshot(now: ProgressFixture.end)
        XCTAssertEqual(snap.phases.map(\.phase), ProgressPhase.allCases)
        XCTAssertEqual(snap.phases.map(\.state), Array(repeating: .done, count: 8))
        // Research: the director's first line (08:26) to the research decision (08:38).
        assertTime(snap.summary(.research).startedAt, "08:26:41", "research starts")
        assertTime(snap.summary(.research).endedAt, "08:38:22", "research ends")
        // Script: three writers; the person picked a story at 08:48.
        assertTime(snap.summary(.script).startedAt, "08:38:22", "script starts")
        assertTime(snap.summary(.script).endedAt, "08:48:34", "story picked")
        // Look: three designers; look picked 09:04.
        assertTime(snap.summary(.look).startedAt, "08:48:34", "look starts")
        assertTime(snap.summary(.look).endedAt, "09:04:43", "look picked")
        // Plan: motion, music and key frames, until the animatic was pushed at 11:01.
        assertTime(snap.summary(.plan).startedAt, "09:04:43", "plan starts")
        assertTime(snap.summary(.plan).endedAt, "11:01:32", "plan ends")
        // Animatic: 11:01 to the approval at 11:06.
        assertTime(snap.summary(.animatic).startedAt, "11:01:32", "animatic pushed")
        assertTime(snap.summary(.animatic).endedAt, "11:06:17", "animatic approved")
        // Build starts as soon as the animatic is approved (the first build line is 11:07, the first builder 11:09).
        let build = snap.summary(.build)
        XCTAssertGreaterThanOrEqual(build.startedAt!, ProgressFixture.date("11:06:00"))
        XCTAssertLessThanOrEqual(build.startedAt!, ProgressFixture.date("11:10:00"))
        // Check: critics and gates, from "Checking every cut" until the build was accepted; Render from there to 16:51.
        assertTime(snap.summary(.check).startedAt, "11:53:13", "check starts")
        assertTime(snap.summary(.render).startedAt, "16:31:30", "render starts")
        assertTime(snap.finishedAt, "16:51:06", "film finished")
        // Strictly ordered, no gaps.
        for (a, b) in zip(snap.phases, snap.phases.dropFirst()) { XCTAssertEqual(a.endedAt, b.startedAt, "\(a.phase) ends where \(b.phase) starts") }
    }

    func testResearchSourcesAreCountedFromWebFetchAndWebSearch() {
        let snap = ProgressFixture.finishedEngine().snapshot(now: ProgressFixture.end)
        XCTAssertEqual(snap.research.pageCount, 79)
        XCTAssertEqual(snap.research.searchCount, 30)
        XCTAssertEqual(snap.research.sourceCount, 109)
        XCTAssertEqual(snap.research.sources.count, 109)
        let first = snap.research.sources.first!
        XCTAssertLessThan(first.time, ProgressFixture.date("08:28:00"))
        XCTAssertTrue(snap.research.sources.contains { $0.kind == .page && $0.host.contains("openai.com") })
        XCTAssertTrue(snap.research.sources.filter { $0.kind == .page }.allSatisfy { !$0.host.isEmpty && !$0.display.isEmpty && $0.url != nil })
        XCTAssertNotNil(snap.research.sources.compactMap(\.by).first, "sources know which researcher read them")
        // All reading happened in the research window.
        XCTAssertLessThanOrEqual(snap.research.sources.last!.time, snap.summary(.research).endedAt!)
        XCTAssertEqual(snap.research.findingsCount, 5)
    }

    func testCrewMembersAreTrackedWithPhasesAndFinish() {
        let snap = ProgressFixture.finishedEngine().snapshot(now: ProgressFixture.end)
        let writers = snap.crew(in: .script)
        XCTAssertTrue(writers.contains { $0.name == "Writing the Bold script" }, "\(writers.map(\.name))")
        XCTAssertTrue(snap.crew(in: .look).contains { $0.name.contains("design system") })
        XCTAssertTrue(snap.crew(in: .plan).contains { $0.name.contains("key frames") })
        XCTAssertTrue(snap.crew(in: .check).contains { $0.name.lowercased().contains("critic") || $0.name.lowercased().contains("fresh") || $0.name.lowercased().contains("review") })
        XCTAssertTrue(snap.crew.allSatisfy { $0.state != .running }, "everything finished by the end of the film")
        XCTAssertGreaterThan(snap.crew.filter { $0.state == .done }.count, 40)
    }

    func testRenderOutputParsingMatchesWhatHyperframesPrints() {
        let result = RenderOutputParser.parse(ProgressFixture.renderOutput())
        XCTAssertEqual(result.framesTotal, 900)
        XCTAssertEqual(result.framesDone, 900)
        XCTAssertEqual(result.percent, 100)
        XCTAssertTrue(result.complete)
        let mid = RenderOutputParser.parse("  ████████████░░░░░░░░░░░░░  50%  Streaming frame 410/900 (3 workers)\n")
        XCTAssertEqual(mid.framesDone, 410); XCTAssertEqual(mid.framesTotal, 900); XCTAssertEqual(mid.percent, 50)
        XCTAssertFalse(mid.complete)
        // Colour codes and the Read tool's line numbers do not matter.
        let coloured = RenderOutputParser.parse("\u{1B}[2K  ██████░░░░  25%  Starting frame capture\u{1B}[0m\n12\t  ███████░░░░  28%  Streaming frame 45/900 (3 workers)")
        XCTAssertEqual(coloured.framesDone, 45)
        XCTAssertEqual(RenderOutputParser.parse("[INFO] [Render:trace] {\"phase\":\"browser_probe\",\"totalFrames\":900}").framesTotal, 900)
        // A quiet render prints nothing: no measurement.
        XCTAssertEqual(RenderOutputParser.parse(""), RenderOutputParser.Result())
    }

    func testDraftRenderFromTheLogIsRecordedAsADoneRenderWithFrames() {
        var engine = FilmProgressEngine()
        engine.ingest(lines: ProgressFixture.log(), now: ProgressFixture.end)
        let run = engine.renders.first { $0.outputName == "draft-v1.mp4" }
        XCTAssertNotNil(run)
        XCTAssertEqual(run?.kind, .draft)
        XCTAssertEqual(run?.framesTotal, 900)
        XCTAssertEqual(run?.framesDone, 900)
        XCTAssertNotNil(run?.finishedAt)
        XCTAssertTrue(engine.renders.contains { $0.kind == .final && $0.command.contains("finish.mjs") })
    }

    func testPerPhaseCostBucketsAddUpAndEveryWorkedPhaseHasCost() {
        let engine = ProgressFixture.finishedEngine()
        let snap = engine.snapshot(now: ProgressFixture.end)
        let tokenSum = snap.phases.reduce(0) { $0 + $1.tokens.total }
        XCTAssertEqual(tokenSum, engine.telemetry.tokens.total, accuracy: 10_000, "phase tokens add up to the director's total")
        let costSum = snap.phases.reduce(0.0) { $0 + $1.costUSD }
        XCTAssertEqual(costSum, snap.totalCostUSD, accuracy: 0.05)
        XCTAssertGreaterThan(snap.totalCostUSD, 100)
        for phase in ProgressPhase.allCases { XCTAssertGreaterThan(snap.summary(phase).costUSD, 0, "\(phase) has a cost") }
        // Check was the longest and most expensive stretch of the film.
        XCTAssertGreaterThan(snap.summary(.check).costUSD, snap.summary(.research).costUSD)
        XCTAssertNotNil(snap.summary(.research).costText)
    }


    /// The real run's five sessions reported $171.45 ($34.39 research to look, $93.34 plan to build, $40.29 check, small restarts).
    /// The rows must add up to it exactly, with no helper or cache double counting, and each stretch must land in its own range.
    func testPhaseRowsMatchTheRealRunReportedTotals() {
        // `progress-cost.log` is every usage-bearing line of the real run's director.log (content stripped), so the buckets see the real flow of tokens.
        var engine = FilmProgressEngine()
        let lines = (try! String(contentsOf: ProgressFixture.url("progress-cost.log"), encoding: .utf8)).split(separator: "\n").map(String.init)
        engine.ingest(lines: lines, now: ProgressFixture.end)
        engine.update(session: ProgressFixture.session(), now: ProgressFixture.end)
        let snap = engine.snapshot(now: ProgressFixture.end)
        let reported = 34.388 + 1.97 + 93.34 + 40.29 + 1.46
        XCTAssertEqual(snap.totalCostUSD, reported, accuracy: 0.1)
        XCTAssertEqual(snap.phases.reduce(0.0) { $0 + $1.costUSD }, snap.totalCostUSD, accuracy: 0.01)
        func cost(_ phases: ProgressPhase...) -> Double { phases.reduce(0.0) { $0 + snap.summary($1).costUSD } }
        let early = cost(.research, .script, .look)
        XCTAssertTrue((22...35).contains(early), "research through look is \(early); the first session reported 34.39 including part of plan")
        XCTAssertTrue((85...100).contains(cost(.plan, .animatic, .build)), "plan through build is \(cost(.plan, .animatic, .build))")
        XCTAssertTrue((36...50).contains(cost(.check)), "check is \(cost(.check))")
        XCTAssertLessThan(cost(.render), 5)
        // Research alone: twelve minutes of reading, a fraction of the film (the real figure is about $11, never half the film).
        XCTAssertTrue((6...16).contains(cost(.research)), "research is \(cost(.research))")
        // Tokens add up to the director's total (cache reads counted once).
        XCTAssertEqual(snap.phases.reduce(0) { $0 + $1.tokens.total }, engine.telemetry.tokens.total, accuracy: 10_000)
        XCTAssertEqual(snap.phases.reduce(0) { $0 + $1.tokens.cacheRead }, engine.telemetry.tokens.cacheRead, accuracy: 10_000)
    }

    func testCheckPhaseReadsTheCriticFindingsAndDrafts() {
        var engine = ProgressFixture.finishedEngine()
        var artifacts = FilmArtifacts()
        artifacts.criticReports = [CriticReport(lens: "motion", round: 1, verdict: "fix",
                                                findings: [.init(scene: "6", severity: "high", problem: "The signature fold reads as a crossfade, not a fold. It dissolves.", fix: "Hinge it")],
                                                time: ProgressFixture.date("15:39:00")),
                                   CriticReport(lens: "film", round: 2, verdict: "pass", findings: [], time: ProgressFixture.date("16:29:00"))]
        engine.update(artifacts: artifacts, now: ProgressFixture.end)
        let snap = engine.snapshot(now: ProgressFixture.end)
        let found = snap.criticFindings.first { $0.round == 1 }
        XCTAssertEqual(found?.state, .fixed, "a later round and the rendered film mean it was fixed")
        XCTAssertTrue(found?.summary.contains("crossfade") ?? false)
        XCTAssertTrue(snap.criticFindings.contains { $0.state == .clean })
        XCTAssertEqual(snap.summary(.check).rounds, 2)
    }

    func testActivityTimelineIsGroupedByPhaseInOrder() {
        let snap = ProgressFixture.finishedEngine().snapshot(now: ProgressFixture.end)
        let groups = snap.activityByPhase
        XCTAssertEqual(groups.map(\.phase), ProgressPhase.allCases)
        XCTAssertTrue(snap.activity(for: .script).contains { $0.title.contains("Three writers") })
        XCTAssertTrue(snap.activity(for: .animatic).contains { $0.kind == .ask })
        XCTAssertTrue(snap.activity(for: .render).contains { $0.title.contains("Done: the render") })
        XCTAssertEqual(snap.activity, snap.activity.sorted { ($0.time, $0.id) < ($1.time, $1.id) })
    }
}

final class FilmProgressLiveTests: XCTestCase {
    func testMidResearchShowsTheSourceBeingReadAndTheBudget() {
        let now = ProgressFixture.date("08:29:30.000")
        var engine = FilmProgressEngine(budget: .quick)
        engine.ingest(lines: ProgressFixture.lines(upTo: now), now: now)
        let snap = engine.snapshot(now: now)
        XCTAssertEqual(snap.currentPhase, .research)
        XCTAssertEqual(snap.summary(.research).state, .active)
        XCTAssertEqual(snap.summary(.script).state, .upcoming)
        XCTAssertGreaterThan(snap.research.sourceCount, 30)
        XCTAssertTrue(snap.now.text.contains("of 6 sources"), snap.now.text)
        XCTAssertTrue(snap.now.kind == .reading || snap.now.kind == .searching)
        XCTAssertGreaterThan(snap.crew(in: .research, running: true).count, 1)
        // The research clock for the budget runs from the first research activity (08:27:38) and is over 1.5x of 2 minutes by 08:31.
        XCTAssertEqual(snap.researchElapsed(now: now)!, 112, accuracy: 15)
        XCTAssertFalse(snap.isResearchOverBudget(now: now))
        XCTAssertTrue(snap.isResearchOverBudget(now: ProgressFixture.date("08:31:00.000")))
        XCTAssertNotNil(snap.summary(.research).estimate)
    }

    func testResearchSourcesStopCountingOnceResearchEnds() {
        var engine = FilmProgressEngine()
        engine.ingest(lines: ProgressFixture.log(), now: ProgressFixture.end)
        engine.update(session: ProgressFixture.session(), now: ProgressFixture.end)
        let snap = engine.snapshot(now: ProgressFixture.end)
        XCTAssertNotNil(snap.research.endedAt)
        XCTAssertEqual(snap.researchElapsed(now: ProgressFixture.end)!, snap.research.elapsed(now: .distantFuture), accuracy: 0.1, "a finished research phase stops its clock")
        XCTAssertFalse(snap.isResearchOverBudget(now: ProgressFixture.end), "no nag once research is over")
    }

    func testWaitingForYouIsAStateOfTheActivePhase() throws {
        let json = """
        {"title":"T","current":"story","steps":{"brief":{"status":"done","updated":"2026-10-06T08:31:13.687Z"},"research":{"status":"done","updated":"2026-10-06T08:38:22.877Z"},"story":{"status":"awaiting","updated":"2026-10-06T08:48:18.000Z"}},
         "activity":[{"t":"2026-10-06T08:38:22.877Z","msg":"Decided research: read things","level":"ok"},{"t":"2026-10-06T08:48:19.000Z","msg":"Ready for you: the story","level":"ask"}]}
        """
        var engine = FilmProgressEngine()
        let now = ProgressFixture.date("08:50:00.000")
        engine.update(session: try SessionSnapshot(data: Data(json.utf8)), now: now)
        let snap = engine.snapshot(now: now)
        XCTAssertEqual(snap.currentPhase, .script)
        XCTAssertEqual(snap.summary(.script).state, .waitingForYou)
        XCTAssertTrue(snap.isWaitingForYou)
        XCTAssertEqual(snap.now.kind, .waiting)
        XCTAssertTrue(snap.now.text.hasPrefix("Waiting for you"))
        XCTAssertGreaterThan(snap.summary(.script).waitingSeconds, 90)
        XCTAssertEqual(snap.summary(.script).workSeconds(now: now), snap.summary(.script).wallSeconds(now: now) - snap.summary(.script).waitingSeconds, accuracy: 0.01)
        XCTAssertNil(snap.summary(.script).estimate, "no estimate while waiting for you")
    }

    func testRenderingAFinalFilmIsIndeterminateBecauseFinishRunsHyperframesQuiet() throws {
        var engine = FilmProgressEngine()
        let start = ProgressFixture.date("16:45:25.000")
        // The build was accepted, so the film is in Render.
        engine.update(session: ProgressFixture.session(), now: start)
        let line = #"{"type":"assistant","timestamp":"2026-10-06T16:45:25.953Z","message":{"id":"m1","model":"claude-opus-5-5","content":[{"type":"tool_use","id":"toolu_final","name":"Bash","input":{"command":"node /x/skills/rasanai/scripts/finish.mjs all --project /p --out /p/renders/final.mp4 --samples 8","description":"Render the final film with motion blur and grain"}}],"usage":{"input_tokens":1,"output_tokens":1}}}"#
        engine.ingest(lines: [line], now: start)
        // The film is not finished yet in this moment: take the finished flag away.
        engine.finishedAt = nil
        let snap = engine.snapshot(now: start.addingTimeInterval(95))
        XCTAssertEqual(snap.currentPhase, .render)
        XCTAssertEqual(snap.render.kind, .final)
        XCTAssertEqual(snap.render.state, .rendering)
        XCTAssertNil(snap.render.fraction, "finish.mjs runs hyperframes with --quiet, so nothing can be measured")
        XCTAssertFalse(snap.render.isMeasured)
        XCTAssertNil(snap.render.etaSeconds)
        XCTAssertEqual(snap.render.elapsed(now: start.addingTimeInterval(95)), 95, accuracy: 1, "an honest elapsed clock instead")
        XCTAssertTrue(snap.now.text.contains("1m 3"), snap.now.text)
        // Phase-level estimate stays a typical-time guess, labelled as such.
        XCTAssertEqual(snap.summary(.render).estimate?.basis, .typical)
    }

    func testBackgroundRenderOutputIsTailedForFramesAndEta() {
        var engine = FilmProgressEngine()
        let t0 = ProgressFixture.date("16:06:13.000")
        let call = #"{"type":"assistant","timestamp":"2026-10-06T16:06:13.000Z","message":{"id":"m1","model":"claude-opus-5-5","content":[{"type":"tool_use","id":"toolu_draft","name":"Bash","input":{"command":"npx --no-install hyperframes render videos/f --quality draft --output videos/f/renders/draft-v1.mp4","description":"Render draft 1"}}],"usage":{"input_tokens":1,"output_tokens":1}}}"#
        let launched = #"{"type":"user","timestamp":"2026-10-06T16:06:14.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_draft","content":"Command running in background with ID: bxyz. Output is being written to: /private/tmp/claude-502/x/tasks/bxyz.output. You will be notified when it completes."}]}}"#
        engine.ingest(lines: [call, launched], now: t0)
        XCTAssertEqual(engine.renderOutputFiles, ["/private/tmp/claude-502/x/tasks/bxyz.output"])
        engine.ingest(renderOutput: "[INFO] {\"totalFrames\":900}\n  ██░░  26%  Streaming frame 16/900 (3 workers)", file: "/private/tmp/claude-502/x/tasks/bxyz.output", now: t0.addingTimeInterval(10))
        engine.ingest(renderOutput: "  ███░  44%  Streaming frame 304/900 (3 workers)", file: "/private/tmp/claude-502/x/tasks/bxyz.output", now: t0.addingTimeInterval(20))
        let snap = engine.snapshot(now: t0.addingTimeInterval(20))
        XCTAssertEqual(snap.render.kind, .draft)
        XCTAssertEqual(snap.render.framesDone, 304)
        XCTAssertEqual(snap.render.framesTotal, 900)
        XCTAssertEqual(snap.render.fraction!, 304.0 / 900.0, accuracy: 0.001)
        XCTAssertTrue(snap.render.isMeasured)
        // 288 frames in 10 s: 596 left is about 21 s.
        XCTAssertEqual(snap.render.etaSeconds!, 596.0 / 28.8, accuracy: 1)
    }

    func testPhaseMapperIgnoresCheckAndRenderWordingBeforeBuild() {
        XCTAssertEqual(ProgressPhaseMapper.verdict(forActivity: "Two critics are watching the built film")?.requires, .build)
        XCTAssertEqual(ProgressPhaseMapper.verdict(forActivity: "Rendering the final: motion blur and grain")?.phase, .render)
        XCTAssertEqual(ProgressPhaseMapper.verdict(forAgent: "Reviewing the frames with fresh eyes")?.phase, .check)
        XCTAssertEqual(ProgressPhaseMapper.verdict(forAgent: "Designing key frames 3-4")?.phase, .plan)
        XCTAssertEqual(ProgressPhaseMapper.verdict(forAgent: "Designing the Bold design system for this story")?.phase, .look)
        XCTAssertEqual(ProgressPhaseMapper.verdict(forAgent: "Writing the Sure script")?.phase, .script)
        XCTAssertEqual(ProgressPhaseMapper.verdict(forAgent: "Motion Director: score the film")?.phase, .plan)
        XCTAssertEqual(ProgressPhaseMapper.verdict(forRenderCommand: "npx hyperframes render p --quality draft -o x/draft-v1.mp4")?.kind, .draft)
        XCTAssertEqual(ProgressPhaseMapper.verdict(forRenderCommand: "node finish.mjs all --out f.mp4")?.kind, .final)
        XCTAssertNil(ProgressPhaseMapper.verdict(forRenderCommand: "npx hyperframes render --help"))
        XCTAssertEqual(ProgressPhaseMapper.phase(forStep: "keyframes"), .plan)
        XCTAssertEqual(ProgressPhaseMapper.phase(forStep: "final"), .render)
        XCTAssertEqual(ProgressPhaseMapper.phase(forStep: "story"), .script)
        XCTAssertEqual(ProgressPhaseMapper.phaseStarted(whenDone: "animatic"), .build)
        // A check in the middle of Research never starts Check.
        var engine = FilmProgressEngine()
        let line = #"{"type":"assistant","timestamp":"2026-10-06T08:33:00.000Z","message":{"id":"m","model":"x","content":[{"type":"tool_use","id":"t1","name":"Agent","input":{"description":"Reviewing the frames with fresh eyes"}}],"usage":{"input_tokens":1}}}"#
        engine.ingest(lines: [line], now: ProgressFixture.date("08:33:00.000"))
        XCTAssertEqual(engine.snapshot(now: ProgressFixture.date("08:34:00.000")).currentPhase, .research)
    }
}

/// Opt-in: `RASAN_REAL_RUN=<run dir> swift test --filter FilmProgressRealLogTests` reads the real (huge) log and session.
final class FilmProgressRealLogTests: XCTestCase {
    func testRealRunDirectory() throws {
        guard let path = ProcessInfo.processInfo.environment["RASAN_REAL_RUN"] else { throw XCTSkip("set RASAN_REAL_RUN to a run folder") }
        let run = URL(fileURLWithPath: path, isDirectory: true)
        let started = Date()
        var engine = FilmProgressEngine()
        var offset: UInt64 = 0
        while true {
            let read = DirectorUsageStore.readLines(file: run.appendingPathComponent("director.log"), from: offset)
            if read.lines.isEmpty && read.offset == offset { break }
            offset = read.offset
            engine.ingest(lines: read.lines, now: Date())
        }
        engine.update(session: try SessionSnapshot(data: Data(contentsOf: run.appendingPathComponent("session.json"))), now: Date())
        engine.update(artifacts: FilmArtifactScanner.scan(project: FilmArtifactScanner.project(forRun: run), run: run), now: Date())
        let snap = engine.snapshot(now: ProgressFixture.end)
        print("REALLOG seconds", Date().timeIntervalSince(started), "bytes", offset)
        for p in snap.phases { print("REALLOG", p.phase, p.state, p.startedAt.map { "\($0)" } ?? "-", p.costText ?? "-", p.rounds) }
        print("REALLOG sources", snap.research.pageCount, snap.research.searchCount, "crew", snap.crew.count, "kf", snap.keyframes.count, "drafts", snap.drafts.map(\.name), "critics", snap.criticFindings.count, "total", snap.totalCostUSD)
        print("REALLOG render", snap.render.kind, snap.render.state, snap.render.framesDone ?? -1, snap.render.framesTotal ?? -1)
        XCTAssertEqual(snap.research.pageCount, 79)
        XCTAssertEqual(snap.research.searchCount, 30)
    }

    /// Cost checkpoints from the real run's own `result` lines (cumulative per session): the film total on screen must stay near what Claude reported.
    func testRealRunCostCheckpoints() throws {
        guard let path = ProcessInfo.processInfo.environment["RASAN_REAL_RUN"] else { throw XCTSkip("set RASAN_REAL_RUN to a run folder") }
        let run = URL(fileURLWithPath: path, isDirectory: true)
        let reader = ReplayLogReader(file: run.appendingPathComponent("director.log"))
        var engine = FilmProgressEngine()
        let session = try SessionSnapshot(data: Data(contentsOf: run.appendingPathComponent("session.json")))
        for time in ["08:30:00", "08:38:00", "08:48:20", "09:05:00", "09:07:50", "10:30:00", "11:02:00", "11:30:00", "12:31:20", "14:00:00", "16:10:00", "16:40:00", "16:52:00"] {
            let at = ProgressFixture.date(time + ".000")
            engine.ingest(lines: reader.lines(upTo: at), now: at)
            engine.update(session: SessionReplay.snapshot(at: at, final: session, projectRoot: nil), now: at)
            let snap = engine.snapshot(now: at)
            print("REALCOST", time, "total", snap.totalCostUSD, snap.phases.map { "\($0.phase.rawValue)=\(String(format: "%.2f", $0.costUSD))" }.joined(separator: " "))
        }
    }
}

final class FilmArtifactScannerStillTests: XCTestCase {
    func testNewestStillIsARealSceneFrameNeverAContactSheet() throws {
        let fm = FileManager.default
        let project = fm.temporaryDirectory.appendingPathComponent("scan-\(UUID().uuidString)")
        let run = project.appendingPathComponent(".rasanai/run-X")
        for dir in ["frames", "crew/animators", "crew/animators/1-move", "design"] { try fm.createDirectory(at: run.appendingPathComponent(dir), withIntermediateDirectories: true) }
        defer { try? fm.removeItem(at: project) }
        func touch(_ path: String, age: TimeInterval) throws {
            let url = run.appendingPathComponent(path)
            try Data([0]).write(to: url)
            try fm.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -age)], ofItemAtPath: url.path)
        }
        try touch("frames/1.png", age: 300); try touch("frames/2.png", age: 200)
        // Newer files that are not scene frames: animator contact sheets, debug and check images.
        try touch("crew/animators/2-overview.png", age: 10); try touch("crew/animators/2-move.png", age: 5)
        try touch("frames/debug-2.png", age: 4); try touch("frames/2-check.png", age: 3); try touch("frames/contact-sheet.png", age: 2)
        try Data(#"{"scenes":8}"#.utf8).write(to: run.appendingPathComponent("crew/plan.json"))
        let found = FilmArtifactScanner.scan(project: project, run: run)
        XCTAssertEqual(found.newestStill?.lastPathComponent, "2.png")
        XCTAssertEqual(found.sceneStills.keys.sorted(), ["1", "2"])
        XCTAssertEqual(found.keyframes.filter { $0.kind == .keyframe }.count, 2)
        XCTAssertEqual(found.plannedSceneCount, 8, "the plan says how many key frames to expect")
        var engine = FilmProgressEngine()
        engine.update(artifacts: found, now: Date())
        XCTAssertEqual(engine.snapshot(now: Date()).keyframesExpected, 8, "the Plan card shows 2 of 8, not 2 of 2")
    }
}

final class SessionReplayTests: XCTestCase {
    func testReplayedSessionShowsStepsAsTheyWereAtThatMoment() {
        let final = ProgressFixture.session()
        // 08:48:20: the story was pushed ("Ready for you") and not answered yet.
        let waiting = SessionReplay.snapshot(at: ProgressFixture.date("08:48:20.000"), final: final, projectRoot: nil)
        XCTAssertEqual(waiting.currentStep, "story")
        XCTAssertEqual(waiting.step("story")["status"].string, "awaiting")
        XCTAssertTrue(waiting.step("story")["decision"].isNull)
        XCTAssertTrue(waiting.isWaitingOnUser)
        XCTAssertTrue(waiting.step("look").isNull)
        XCTAssertEqual(waiting.step("research")["status"].string, "done")
        // 08:48:30: answered, the decision not written yet.
        XCTAssertEqual(SessionReplay.snapshot(at: ProgressFixture.date("08:48:30.000"), final: final, projectRoot: nil).step("story")["status"].string, "working")
        // 11:37: building. The build step exists, working, with its scenes.
        let build = SessionReplay.snapshot(at: ProgressFixture.date("11:37:00.000"), final: final, projectRoot: nil)
        XCTAssertEqual(build.step("build")["status"].string, "working")
        XCTAssertEqual(build.step("build")["scenes"].array.count, 8)
        XCTAssertTrue(build.step("render").isNull)
        // The engine reads the same phase from it.
        var engine = FilmProgressEngine()
        engine.update(session: build, now: ProgressFixture.date("11:37:00.000"))
        XCTAssertEqual(engine.snapshot(now: ProgressFixture.date("11:37:00.000")).currentPhase, .build)
        XCTAssertEqual(engine.snapshot(now: ProgressFixture.date("11:37:00.000")).scenes.count, 8)
        XCTAssertGreaterThan(SessionReplay.lastEvent(of: final)!, SessionReplay.firstEvent(of: final)!)
    }

    func testReplayLogReaderReleasesLinesByTimestamp() throws {
        let reader = ReplayLogReader(file: ProgressFixture.url("progress-director.log"))
        let early = reader.lines(upTo: ProgressFixture.date("08:30:00.000"))
        let later = reader.lines(upTo: ProgressFixture.date("08:40:00.000"))
        XCTAssertFalse(early.isEmpty); XCTAssertFalse(later.isEmpty)
        XCTAssertEqual(early.count + later.count, ProgressFixture.lines(upTo: ProgressFixture.date("08:40:00.000")).count, accuracy: 25)
        reader.rewind()
        XCTAssertEqual(reader.lines(upTo: ProgressFixture.date("08:30:00.000")).count, early.count)
    }
}
