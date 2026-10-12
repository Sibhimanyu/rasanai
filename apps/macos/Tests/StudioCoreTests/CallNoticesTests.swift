import Foundation
import XCTest
@testable import StudioCore

final class CallNoticesTests: XCTestCase {
    private func snap(_ json: String) -> SessionSnapshot { try! SessionSnapshot(data: Data(json.utf8)) }
    private let stories = #"{"current":"story","steps":{"brief":{"status":"done","fields":{"subject":"x"}},"story":{"status":"awaiting","recommended":"b","stories":[{"id":"a","title":"Shoebox"},{"id":"b","title":"Twelve small victories"},{"id":"c","title":"Tax day"}]}}}"#
    private let working = #"{"current":"story","steps":{"brief":{"status":"done","fields":{"subject":"x"}},"story":{"status":"working"}}}"#

    func testStoriesReadyNamesCountFilmAndPick() throws {
        let notice = try XCTUnwrap(CallNotices.notice(from: snap(working), to: snap(stories), film: "Tally launch film"))
        XCTAssertEqual(notice.title, "Three stories are ready for Tally launch film")
        XCTAssertTrue(notice.body.contains("Claude's pick: Twelve small victories"))
        XCTAssertEqual(notice.id, "call-story")
    }

    func testOpeningAFilmIsNotNews() throws {
        XCTAssertNil(CallNotices.notice(from: nil, to: snap(stories), film: "Tally"))
    }

    func testTheSameCallStillWaitingDoesNotNotifyAgain() throws {
        XCTAssertNil(CallNotices.notice(from: snap(stories), to: snap(stories), film: "Tally"))
    }

    func testARevisedCallNotifiesAgain() throws {
        // awaiting -> working (Claude revises) -> awaiting
        XCTAssertNil(CallNotices.notice(from: snap(stories), to: snap(working), film: "Tally"))
        XCTAssertNotNil(CallNotices.notice(from: snap(working), to: snap(stories), film: "Tally"))
    }

    func testAnAnsweredCallDoesNotNotify() throws {
        let answered = #"{"current":"story","steps":{"story":{"status":"awaiting","sent":{"type":"choose","value":"a"},"stories":[{"id":"a","title":"S"}]}}}"#
        XCTAssertNil(CallNotices.notice(from: snap(working), to: snap(answered), film: "Tally"))
    }

    func testTheFinalLeavesNotificationsToTheRenderEvent() throws {
        let final = #"{"current":"render","steps":{"story":{"status":"done"},"render":{"status":"awaiting"}}}"#
        XCTAssertNil(CallNotices.notice(from: snap(working), to: snap(final), film: "Tally"))
    }

    func testOtherCallsGetTheirOwnWords() throws {
        let look = #"{"current":"look","steps":{"brief":{"status":"done","fields":{"subject":"x"}},"look":{"status":"awaiting","styles":[{"id":"1","name":"Paper"},{"id":"2","name":"Ink"},{"id":"3","name":"Glass"}]}}}"#
        XCTAssertEqual(CallNotices.notice(from: snap(stories), to: snap(look), film: "Tally")?.title, "Three looks are ready for Tally")
        let animatic = #"{"current":"animatic","steps":{"animatic":{"status":"awaiting"}}}"#
        XCTAssertEqual(CallNotices.notice(from: snap(look), to: snap(animatic), film: "Tally")?.title, "The animatic is ready for Tally")
        let music = #"{"current":"music","steps":{"music":{"status":"awaiting"}}}"#
        XCTAssertEqual(CallNotices.notice(from: snap(animatic), to: snap(music), film: "Tally")?.body, "Time to pick the music.")
    }

    func testHomeDetailSaysWhatIsWaiting() throws {
        XCTAssertEqual(CallNotices.homeDetail(snap(stories)), "3 stories ready · Claude's pick: Twelve small victories")
        XCTAssertNil(CallNotices.homeDetail(snap(working)))
    }

    func testVocabularyReplacesStepIDs() throws {
        XCTAssertEqual(CallVocabulary.turnPhrase(step: "music"), "pick the music")
        XCTAssertEqual(CallVocabulary.turnPhrase(step: "styleframes"), "approve the style frames")
        XCTAssertEqual(CallVocabulary.turnPhrase(step: "footage"), "choose the clips")
        XCTAssertEqual(CallVocabulary.turnPhrase(step: "mystery"), "decide: mystery")
        XCTAssertEqual(CallVocabulary.turnPhrase(step: "story"), "pick a story")
    }

    func testTheFinalIsRenderedBeforeItIsReviewed() throws {
        let before = snap(#"{"current":"render","steps":{"render":{"status":"awaiting"}}}"#)
        let after = snap(#"{"current":"render","steps":{"render":{"status":"awaiting","videos":["preview.mp4"]}}}"#)
        XCTAssertEqual(CallVocabulary.turnPhrase(step: "render", in: before), "render the final")
        XCTAssertEqual(CallVocabulary.turnPhrase(step: "render", in: after), "review the film")
    }

    func testNextNeededLine() throws {
        // Story is decided, Claude is drawing looks: the next call is the look.
        let drawing = snap(#"{"current":"look","steps":{"brief":{"status":"done","fields":{"subject":"x"}},"story":{"status":"done"},"look":{"status":"working"}}}"#)
        XCTAssertEqual(NextNeeded.nextCall(drawing), "look")
        XCTAssertEqual(NextNeeded.line(drawing, pace: .standard), "next: pick a look · in about 10 min")
        XCTAssertEqual(NextNeeded.line(drawing, pace: .fast), "next: pick a look · in about 6 min")
        XCTAssertEqual(NextNeeded.line(drawing, pace: .standard, elapsedInCall: 7 * 60), "next: pick a look · in about 3 min")
        // A decided look with no style frames in the film: the animatic is next.
        let decided = snap(#"{"current":"look","steps":{"brief":{"status":"done","fields":{"subject":"x"}},"look":{"status":"done"}}}"#)
        XCTAssertEqual(NextNeeded.nextCall(decided), "animatic")
        // With style frames in the session they come first.
        let withFrames = snap(#"{"current":"look","steps":{"brief":{"status":"done","fields":{"subject":"x"}},"look":{"status":"done"},"styleframes":{"status":"working"}}}"#)
        XCTAssertEqual(NextNeeded.nextCall(withFrames), "styleframes")
        // On the way to the final the call is watching the preview; after the final there is none.
        let building = snap(#"{"current":"build","steps":{"brief":{"status":"done","fields":{"subject":"x"}},"animatic":{"status":"done"},"build":{"status":"working"}}}"#)
        XCTAssertEqual(NextNeeded.nextCall(building), "final")
        XCTAssertTrue(NextNeeded.line(building)?.hasPrefix("next: watch the preview") == true)
        let rendering = snap(#"{"current":"render","steps":{"brief":{"status":"done","fields":{"subject":"x"}},"render":{"status":"done"}}}"#)
        XCTAssertNil(NextNeeded.nextCall(rendering))
    }

    func testDockBadgeCountsFilmsNeedingYou() {
        XCTAssertNil(DockBadge.label(waiting: 0))
        XCTAssertEqual(DockBadge.label(waiting: 3), "3")
    }
}
