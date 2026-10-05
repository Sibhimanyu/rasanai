import XCTest
@testable import StudioCore

final class ModelPlanTests: XCTestCase {
    func testModelPlanChoosesModelAndDirection() throws {
        var draft = FilmDraft(brief: "x")
        XCTAssertEqual(draft.modelPlan, .recommended)
        XCTAssertEqual(draft.cliModel(settingsModel: "custom"), "claude-opus-5-5")
        XCTAssertTrue(draft.creativeDirection(sources: []).contains("Sonnet 5.5 subagents"))
        draft.modelPlan = .sonnet
        XCTAssertEqual(draft.cliModel(settingsModel: "custom"), "claude-sonnet-5-5")
        draft.modelPlan = .settings
        XCTAssertEqual(draft.cliModel(settingsModel: "custom"), "custom")
        XCTAssertFalse(draft.creativeDirection(sources: []).contains("MODEL PLAN"))
        var codex = FilmDraft(brief: "x", agent: "codex")
        XCTAssertEqual(codex.cliModel(settingsModel: "gpt-5.6-sol"), "gpt-5.6-sol")
        XCTAssertFalse(codex.creativeDirection(sources: []).contains("MODEL PLAN"))
        codex.modelPlan = .opus
        let old = try JSONSerialization.data(withJSONObject: ["brief": "b", "duration": 30, "aspect": "16:9", "agent": "claude"])
        XCTAssertEqual(try JSONDecoder().decode(FilmDraft.self, from: old).modelPlan, .recommended)
    }
}
