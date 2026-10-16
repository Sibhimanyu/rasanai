import XCTest
@testable import RasanAIStudio

/// Pure rules only: no windows, no events, no app launch.
final class HomeScrollRulesTests: XCTestCase {
    private func sample(_ dy: CGFloat, dx: CGFloat = 0, at t: TimeInterval, phase: HomeScrollPhase = .changed,
                        momentum: HomeScrollPhase = .none, precise: Bool = true) -> HomeScrollSample {
        HomeScrollSample(deltaX: dx, deltaY: dy, precise: precise, phase: phase, momentum: momentum, timestamp: t)
    }

    func testDownwardGestureTriggersOnceThenConsumesGestureAndMomentum() {
        var rules = HomeScrollRules()
        XCTAssertEqual(rules.handle(sample(-10, at: 0, phase: .began), allowed: .towardFilms), .pass)
        XCTAssertEqual(rules.handle(sample(-20, at: 0.01), allowed: .towardFilms), .pass)
        XCTAssertEqual(rules.handle(sample(-20, at: 0.02), allowed: .towardFilms), .trigger(.towardFilms))
        XCTAssertEqual(rules.handle(sample(-30, at: 0.03), allowed: nil), .consume)
        XCTAssertEqual(rules.handle(sample(-30, at: 0.04, phase: .ended), allowed: nil), .consume)
        XCTAssertEqual(rules.handle(sample(-15, at: 0.05, phase: .none, momentum: .began), allowed: nil), .consume)
        XCTAssertEqual(rules.handle(sample(-5, at: 0.06, phase: .none, momentum: .ended), allowed: nil), .consume)
        XCTAssertFalse(rules.isLatched)
    }

    func testUpwardOrSmallMovementDoesNotTrigger() {
        var rules = HomeScrollRules()
        XCTAssertEqual(rules.handle(sample(30, at: 0, phase: .began), allowed: .towardFilms), .pass)
        XCTAssertEqual(rules.handle(sample(30, at: 0.01), allowed: .towardFilms), .pass)
        var small = HomeScrollRules()
        XCTAssertEqual(small.handle(sample(-8, at: 0, phase: .began), allowed: .towardFilms), .pass)
        XCTAssertEqual(small.handle(sample(-8, at: 0.01, phase: .ended), allowed: .towardFilms), .pass)
    }

    func testJitterBleedsBackAndNeverAccumulates() {
        var rules = HomeScrollRules()
        _ = rules.handle(sample(-20, at: 0, phase: .began), allowed: .towardFilms)
        for i in 1...10 {
            XCTAssertEqual(rules.handle(sample(i.isMultiple(of: 2) ? -18 : 18, at: Double(i) * 0.01), allowed: .towardFilms), .pass)
        }
    }

    func testHorizontalGestureIsNeverOurs() {
        var rules = HomeScrollRules()
        XCTAssertEqual(rules.handle(sample(-5, dx: 40, at: 0, phase: .began), allowed: .towardFilms), .pass)
        XCTAssertEqual(rules.handle(sample(-60, dx: 5, at: 0.01), allowed: .towardFilms), .pass)
    }

    func testMomentumNeverTriggersAndPassesWhenGestureWasNotLatched() {
        var rules = HomeScrollRules()
        _ = rules.handle(sample(-5, at: 0, phase: .began), allowed: .towardFilms)
        _ = rules.handle(sample(-5, at: 0.01, phase: .ended), allowed: .towardFilms)
        XCTAssertEqual(rules.handle(sample(-200, at: 0.02, phase: .none, momentum: .began), allowed: .towardFilms), .pass)
        XCTAssertEqual(rules.handle(sample(-200, at: 0.03, phase: .none, momentum: .changed), allowed: .towardFilms), .pass)
    }

    func testGestureStartingWhereNothingIsAllowedNeverTriggersLater() {
        var rules = HomeScrollRules()
        XCTAssertEqual(rules.handle(sample(-20, at: 0, phase: .began), allowed: nil), .pass)
        XCTAssertEqual(rules.handle(sample(-80, at: 0.01), allowed: .towardFilms), .pass)
    }

    func testCooldownBlocksImmediateReturnThenAllowsIt() {
        var rules = HomeScrollRules()
        _ = rules.handle(sample(-50, at: 0, phase: .began), allowed: .towardFilms)   // triggers
        _ = rules.handle(sample(0, at: 0.02, phase: .ended), allowed: nil)
        XCTAssertEqual(rules.handle(sample(80, at: 0.2, phase: .began), allowed: .towardPrompt), .pass)
        _ = rules.handle(sample(0, at: 0.25, phase: .ended), allowed: .towardPrompt)
        XCTAssertEqual(rules.handle(sample(80, at: 1.0, phase: .began), allowed: .towardPrompt), .trigger(.towardPrompt))
    }

    func testCoarseWheelNotchesAreScaledAndSeparatedByPauses() {
        var rules = HomeScrollRules()
        XCTAssertEqual(rules.handle(sample(-1, at: 0, phase: .none, precise: false), allowed: .towardFilms), .pass)
        XCTAssertEqual(rules.handle(sample(-1, at: 0.05, phase: .none, precise: false), allowed: .towardFilms), .pass)
        XCTAssertEqual(rules.handle(sample(-2, at: 0.10, phase: .none, precise: false), allowed: .towardFilms), .trigger(.towardFilms))
        // A pause starts a fresh wheel gesture, which the cooldown still holds back.
        XCTAssertEqual(rules.handle(sample(-5, at: 0.45, phase: .none, precise: false), allowed: .towardFilms), .pass)
    }

    func testCooldownOutlastsTheTransition() {
        XCTAssertGreaterThan(HomeScrollRules().cooldown, HomeTransitionMetrics.duration)
    }

    func testSameCardsStartAsASlightPeekAndTravelIntoPlace() {
        let docked = HomeTransitionMetrics(browsing: false, reduceMotion: false, viewportHeight: 800, viewportWidth: 1100)
        let open = HomeTransitionMetrics(browsing: true, reduceMotion: false, viewportHeight: 800, viewportWidth: 1100)
        XCTAssertEqual(docked.workspaceOffset + HomeTransitionMetrics.cardsTop,
                       800 - HomeTransitionMetrics.dockedBottom - HomeTransitionMetrics.peekHeight)
        XCTAssertLessThan(docked.workspaceOpacity, 0.4)
        XCTAssertEqual(open.workspaceOffset, 0)
        XCTAssertEqual(open.workspaceOpacity, 1)
        XCTAssertLessThan(open.promptOffset, 0)
        XCTAssertEqual(open.promptOpacity, 0)
    }

    func testReduceMotionOnlyFadesWithoutAnyTravel() {
        let closed = HomeTransitionMetrics(browsing: false, reduceMotion: true, viewportHeight: 800, viewportWidth: 1100)
        let open = HomeTransitionMetrics(browsing: true, reduceMotion: true, viewportHeight: 800, viewportWidth: 1100)
        XCTAssertEqual(closed.workspaceOffset, 0)
        XCTAssertEqual(open.workspaceOffset, 0)
        XCTAssertEqual(open.promptOffset, 0)
        XCTAssertEqual(closed.workspaceOpacity, 0)
        XCTAssertEqual(open.workspaceOpacity, 1)
    }

    func testPeekRemainsTheSameHeightAcrossWindowSizes() {
        for height: CGFloat in [560, 800, 1200] {
            let metrics = HomeTransitionMetrics(browsing: false, reduceMotion: false, viewportHeight: height)
            let posterTop = HomeTransitionMetrics.cardsTop + metrics.workspaceOffset
            XCTAssertEqual(height - HomeTransitionMetrics.dockedBottom - posterTop, HomeTransitionMetrics.peekHeight)
        }
    }
}
