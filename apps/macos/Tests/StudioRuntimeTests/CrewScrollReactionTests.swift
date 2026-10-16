import XCTest
@testable import RasanAIStudio

final class CrewScrollReactionTests: XCTestCase {
    func testLeavingDucksTowardThePromptAndSquints() {
        var pose = CrewPose()
        pose.addScrollReaction(away: true, age: 0.25, index: 0, count: 7)
        XCTAssertLessThan(pose.lift, 0)
        XCTAssertLessThan(pose.stretch, 0)
        XCTAssertGreaterThan(pose.look.y, 0)
        XCTAssertGreaterThan(pose.blink, 0)
    }

    func testReactionRipplesAcrossTheCrew() {
        var first = CrewPose(), last = CrewPose()
        first.addScrollReaction(away: true, age: 0.05, index: 0, count: 7)
        last.addScrollReaction(away: true, age: 0.05, index: 6, count: 7)
        XCTAssertLessThan(first.lift, 0)
        XCTAssertEqual(last.lift, 0)
    }

    func testReturnLiftsThenSettlesWithoutChangingTheIdlePose() {
        var returning = CrewPose()
        returning.addScrollReaction(away: false, age: 0.22, index: 0, count: 7)
        XCTAssertGreaterThan(returning.lift, 0)
        var settled = CrewPose(look: .init(x: 0.2, y: 0.1), blink: 0.3)
        settled.lift = 2
        settled.addScrollReaction(away: false, age: 1.1, index: 6, count: 7)
        XCTAssertEqual(settled.lift, 2)
        XCTAssertEqual(settled.look.y, 0.1)
        XCTAssertEqual(settled.blink, 0.3)
    }
}
