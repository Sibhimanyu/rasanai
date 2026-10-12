import XCTest
import StudioCore
@testable import RasanAIStudio

/// The one-night usability bundle, on the parts that need the app target: wording, the quiet cost pill and the styleframes fixture.
final class StudioFlowTests: XCTestCase {
    func testFriendlyStepsUsePlainVerbs() {
        XCTAssertEqual(FilmSummary.friendlyStep("music"), "pick the music")
        XCTAssertEqual(FilmSummary.friendlyStep("styleframes"), "approve the style frames")
        XCTAssertEqual(FilmSummary.friendlyStep("story"), "pick a story")
        XCTAssertEqual(FilmSummary.friendlyStep("render"), "review the film")
        let unrendered = try! SessionSnapshot(data: Data(#"{"current":"render","steps":{"render":{"status":"awaiting"}}}"#.utf8))
        XCTAssertEqual(FilmSummary.friendlyStep("render", in: unrendered), "render the final")
    }

    func testTheBarSaysStoryNotScript() {
        XCTAssertEqual(ReviewStage.story.stepTitle, "Story")
        XCTAssertEqual(ProgressPhase.script.title, "Story")
    }

    @MainActor func testCostIsQuietUntilHoverOrBudget() {
        XCTAssertFalse(DirectorMonitor.costVisible(usd: 1.4, limit: 10, includedInPlan: false, hovering: false))
        XCTAssertTrue(DirectorMonitor.costVisible(usd: 1.4, limit: 10, includedInPlan: false, hovering: true))
        XCTAssertTrue(DirectorMonitor.costVisible(usd: 8.2, limit: 10, includedInPlan: false, hovering: false))
        XCTAssertFalse(DirectorMonitor.costVisible(usd: 8.2, limit: 0, includedInPlan: false, hovering: false))
        XCTAssertFalse(DirectorMonitor.costVisible(usd: 8.2, limit: 10, includedInPlan: true, hovering: true))
        XCTAssertFalse(DirectorMonitor.costVisible(usd: 0, limit: 10, includedInPlan: false, hovering: true))
    }

    func testTheWorkingTurnLineCarriesTheNextCall() {
        let state = TurnState.working("Drawing key frames", since: nil, next: "next: pick a look · in about 8 min")
        if case .working(_, _, let next) = state { XCTAssertEqual(next.map(TurnState.sentenceCaseFirst), "Next: pick a look · in about 8 min") } else { XCTFail() }
        XCTAssertEqual(TurnState.working("a", since: nil), TurnState.working("a", since: nil, next: nil))
    }

    @MainActor func testTheStyleframesFixtureDecodesWithReferences() throws {
        let session = try SessionSnapshot(data: Data(StageFixtures.json("panel-styleframes").utf8))
        let data = StyleframesPayload(session.step("styleframes"))
        XCTAssertEqual(data.frames.count, 3)
        XCTAssertFalse(data.isLegacy)
        XCTAssertTrue(data.hasReferences)
        XCTAssertEqual(data.heroes, ["1", "3"])
        XCTAssertEqual(session.stage, .look)
    }
}
