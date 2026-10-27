import StudioCore
import XCTest
@testable import RasanAIStudio

final class HomeWorkspaceTests: XCTestCase {
    func testWorkNeedingADecisionPrecedesDraftsAndFinishedFilms() {
        let phases: [FilmPhase] = [.finished(30), .draft, .working, .yourTurn("choose a story"), .needsAttention, .paused]
        let ranked = phases.sorted { HomeWorkspaceRules.priority($0) < HomeWorkspaceRules.priority($1) }
        XCTAssertTrue(ranked.prefix(2).allSatisfy(\.callsForYou))
        XCTAssertEqual(ranked.last, .finished(30))
        XCTAssertLessThan(HomeWorkspaceRules.priority(.paused), HomeWorkspaceRules.priority(.draft))
    }

    func testReviewActionNamesTheActualDecision() {
        let actions: [(ReviewStage, String)] = [(.brief, "Confirm brief"), (.story, "Choose story"), (.look, "Choose look"),
                                              (.animatic, "Review storyboard"), (.final, "Review final")]
        for (stage, action) in actions {
            let summary = FilmSummary(phase: .yourTurn("review"), stage: stage)
            XCTAssertEqual(HomeWorkspaceRules.action(for: summary), action)
        }
        XCTAssertEqual(HomeWorkspaceRules.action(for: FilmSummary(phase: .yourTurn("render the final"), stage: .final)), "Render final")
    }

    func testCardsUseTheSavedContextAndKeepTheirActionsHonest() {
        let summary = FilmSummary(phase: .yourTurn("choose"), stage: .story, detail: "Three stories ready")
        XCTAssertEqual(HomeWorkspaceRules.detail(for: summary), "Three stories ready")
        XCTAssertEqual(HomeWorkspaceRules.action(for: .draft), "Continue brief")
        XCTAssertEqual(HomeWorkspaceRules.action(for: FilmSummary(phase: .finished(30))), "Watch film")
        XCTAssertEqual(HomeWorkspaceRules.action(for: FilmSummary(phase: .queued(2))), "View queue")
    }
}
