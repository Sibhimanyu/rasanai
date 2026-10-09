import XCTest
import StudioCore
@testable import RasanAIStudio

final class ProgressUITests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func snapshot(_ phase: ProgressPhase) -> FilmProgressSnapshot { FilmProgressSnapshot.fixture(phase, now: now) }

    /// In a replay nothing live may touch the model: no loop, and a read that was already in flight when the replay began is dropped.
    @MainActor func testReplayModelIgnoresTheLiveRunFolder() async throws {
        let run = FileManager.default.temporaryDirectory.appendingPathComponent("replay-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: run, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: run) }
        try Data(#"{"title":"Live","current":"build","steps":{}}"#.utf8).write(to: run.appendingPathComponent("session.json"))
        try Data(#"{"type":"assistant","timestamp":"2026-10-06T11:05:00.000Z","message":{"id":"m","content":[],"usage":{"input_tokens":1,"output_tokens":1}}}"#.utf8 + [10]).write(to: run.appendingPathComponent("director.log"))
        let replay = FilmProgress(run: run, replay: true)
        let before = replay.snapshot
        replay.start()
        try await Task.sleep(for: .milliseconds(400))
        XCTAssertEqual(replay.snapshot, before, "a replay model never starts its live loop")
        // A live model that is switched to replay mid-flight keeps the replay state.
        let live = FilmProgress(run: run)
        live.start()
        live.beginReplay()
        await live.feed(lines: [], session: nil, artifacts: nil, renderChunks: [], at: Date(timeIntervalSince1970: 1_790_000_000))
        try await Task.sleep(for: .milliseconds(600))
        XCTAssertEqual(live.now, Date(timeIntervalSince1970: 1_790_000_000), "the replay clock is not replaced by real time")
    }

    func testBuildDoneFiresOnceWhenBuildFinishes() {
        let before = snapshot(.build)
        var after = before
        after.phases[ProgressPhase.build.index].state = .done
        XCTAssertEqual(ProgressNotifier.events(from: before, to: after, now: now), [.buildDone])
        XCTAssertEqual(ProgressNotifier.events(from: after, to: after, now: now), [])
        // The first look at a film that is already past Build is not news.
        XCTAssertEqual(ProgressNotifier.events(from: nil, to: after, now: now), [])
    }

    func testFinalRenderedFiresOnlyForTheFinal() {
        var draft = snapshot(.check)
        draft.render.kind = .draft; draft.render.state = .done
        XCTAssertEqual(ProgressNotifier.events(from: snapshot(.check), to: draft, now: now), [])
        var rendering = snapshot(.render)
        rendering.render.kind = .final; rendering.render.state = .rendering
        var done = rendering
        done.render.state = .done
        XCTAssertEqual(ProgressNotifier.events(from: rendering, to: done, now: now), [.finalRendered])
    }

    func testResearchBudgetFiresWhenTimeOrSourcesAreUsedUp() {
        var research = snapshot(.research)
        research.research.budget = .quick
        research.research.startedAt = now.addingTimeInterval(-60)
        research.research.sourceCount(pages: 3, searches: 1)
        XCTAssertEqual(ProgressNotifier.events(from: research, to: research, now: now), [])
        // Time: the same snapshot, two minutes on.
        let later = now.addingTimeInterval(65)
        var over = research
        over.asOf = later
        XCTAssertEqual(ProgressNotifier.events(from: research, to: over, now: later), [.researchBudget])
        // Sources: the sixth read.
        var sixth = research
        sixth.research.sourceCount(pages: 5, searches: 1)
        XCTAssertEqual(ProgressNotifier.events(from: research, to: sixth, now: now), [.researchBudget])
        // Already over on the previous snapshot: no repeat.
        XCTAssertEqual(ProgressNotifier.events(from: over, to: over, now: later), [])
        // No budget (Deep): never.
        var deep = sixth
        deep.research.budget = nil
        XCTAssertEqual(ProgressNotifier.events(from: research, to: deep, now: later), [])
    }

    func testNotificationText() {
        var s = snapshot(.research)
        s.research.sourceCount(pages: 5, searches: 1)
        XCTAssertEqual(ProgressNotifier.text(for: .researchBudget, snapshot: s).title, "Research reached its time box")
        XCTAssertTrue(ProgressNotifier.text(for: .researchBudget, snapshot: s).body.contains("6 sources"))
        XCTAssertEqual(ProgressNotifier.text(for: .finalRendered, snapshot: s).title, "Your film is ready to watch")
    }

    func testEstimateWordingStaysHonest() {
        XCTAssertEqual(FilmProgressView.estimateText(PhaseEstimate(secondsLeft: 64, basis: .measured)), "About 2 min left")
        XCTAssertEqual(FilmProgressView.estimateText(PhaseEstimate(secondsLeft: 2 * 3600 + 55 * 60, basis: .typical)), "Roughly 3 h left")
        XCTAssertEqual(FilmProgressView.estimateText(PhaseEstimate(secondsLeft: 37 * 60, basis: .typical)), "Roughly 35 min left")
        XCTAssertEqual(FilmProgressView.estimateText(PhaseEstimate(secondsLeft: 20, basis: .typical)), "Under a minute left")
    }

    func testClockFormat() {
        XCTAssertEqual(FilmProgressView.clock(78), "1:18")
        XCTAssertEqual(FilmProgressView.clock(3 * 3600 + 5 * 60 + 9), "3:05:09")
    }

    @MainActor func testFixturesCoverEveryPhaseWithRealShapes() {
        for phase in ProgressPhase.allCases {
            let s = ProgressFixtures.snapshot(phase, now: now)
            XCTAssertEqual(s.currentPhase, phase)
            XCTAssertEqual(s.phases.count, 8)
            XCTAssertFalse(s.now.text.isEmpty)
            XCTAssertFalse(s.activity.isEmpty)
        }
        XCTAssertGreaterThan(ProgressFixtures.snapshot(.plan, now: now).keyframes.count, 3)
        XCTAssertEqual(ProgressFixtures.snapshot(.build, now: now).scenes.count, 8)
        XCTAssertEqual(ProgressFixtures.snapshot(.render, now: now).render.framesTotal, 900)
    }
}

private extension ResearchProgress {
    mutating func sourceCount(pages: Int, searches: Int) { pageCount = pages; searchCount = searches }
}
