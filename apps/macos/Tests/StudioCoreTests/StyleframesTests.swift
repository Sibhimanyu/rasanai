import Foundation
import XCTest
@testable import StudioCore

final class StyleframesTests: XCTestCase {
    private func payload(_ json: String) throws -> JSONValue { try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8)) }

    func testNewPayloadWithReferencesShotsAndVerdicts() throws {
        let value = try payload(#"""
        {"heroes":["1","3"],"sheet":"frames/sheet.png","recommended":"1","frames":[
          {"id":"1","beat":1,"title":"Open","image":"frames/01.png","ref":{"image":"refs/a.png","source":"Brand film 0:04","why":"title vs title"},
           "shot":{"size":"CU","angle":"tilt 12","hero":"Send button","focus":"button sharp","light":"left, warm"},"caption":"Cold open","verdict":"at-par"},
          {"id":"2","beat":2,"image":"frames/02.png","ref":null,"verdict":"below","state":"working"},
          {"id":"3","image":"frames/03.png","verdict":"nonsense"}]}
        """#)
        let data = StyleframesPayload(value)
        XCTAssertFalse(data.isLegacy)
        XCTAssertEqual(data.frames.map(\.id), ["1", "2", "3"])
        XCTAssertEqual(data.heroes, ["1", "3"])
        XCTAssertEqual(data.sheet, "frames/sheet.png")
        let first = data.frames[0]
        XCTAssertEqual(first.ref, StyleframeReference(image: "refs/a.png", source: "Brand film 0:04", why: "title vs title"))
        XCTAssertEqual(first.shot?.summary, "CU · tilt 12 · Send button")
        XCTAssertEqual(first.verdict, .atPar)
        XCTAssertEqual(data.frames[1].title, "Beat 2")
        XCTAssertNil(data.frames[1].ref)
        XCTAssertTrue(data.frames[1].isWorking)
        XCTAssertNil(data.frames[2].verdict)
        XCTAssertTrue(data.hasReferences)
        XCTAssertEqual(data.belowCount, 1)
    }

    func testOldImagesAndCaptionsStillWork() throws {
        let data = StyleframesPayload(try payload(#"{"images":["a.png",{"path":"b.png","caption":"Turn"},"c.png"],"captions":["Opening",null]}"#))
        XCTAssertTrue(data.isLegacy)
        XCTAssertEqual(data.frames.map(\.image), ["a.png", "b.png", "c.png"])
        XCTAssertEqual(data.frames.map(\.id), ["1", "2", "3"])
        XCTAssertEqual(data.frames[0].title, "Opening")
        XCTAssertEqual(data.frames[1].title, "Turn")
        XCTAssertEqual(data.frames[2].title, "Frame 3")
        XCTAssertFalse(data.hasReferences)
    }

    func testFramesWithoutAnImageAreDropped() throws {
        let data = StyleframesPayload(try payload(#"{"frames":[{"id":"1","title":"no image"},{"id":"2","image":"x.png"}]}"#))
        XCTAssertEqual(data.frames.map(\.id), ["2"])
        XCTAssertTrue(StyleframesPayload(.null).frames.isEmpty)
    }

    func testRedoActionValueIsIdsAndNote() throws {
        let data = StyleframesPayload(try payload(#"{"frames":[{"id":"a","title":"One","image":"1.png"},{"id":"b","title":"Two","image":"2.png"},{"id":"c","title":"Three","image":"3.png"}]}"#))
        var review = StyleframeReview()
        review.redo = ["c", "a", "zzz"]
        review.comments = ["a": "Bigger type", "b": "ignored: not redone", "c": "  "]
        // Grid order, only frames that exist.
        XCTAssertEqual(review.redoIDs(in: data.frames), ["a", "c"])
        let note = review.redoNote(in: data.frames, overall: "More contrast overall")
        XCTAssertEqual(note, "More contrast overall\nOne: Bigger type")
        let value = review.redoValue(in: data.frames, note: note)
        XCTAssertEqual(value["ids"].strings, ["a", "c"])
        XCTAssertEqual(value["note"].string, note)
    }

    func testCommentValueUsesTheFrameAsTheScene() {
        let value = StyleframeReview.commentValue(frame: "7")
        XCTAssertEqual(value["scene"].string, "7")
        XCTAssertEqual(value["scope"].string, "scene")
    }

    func testPrimaryButtonAndCounterReadFromTheMarks() {
        var review = StyleframeReview()
        XCTAssertEqual(review.primaryTitle(frames: 8), "Approve all 8 frames")
        XCTAssertEqual(review.counter(frames: 8), "8 frames")
        review.redo = ["1", "2"]
        XCTAssertEqual(review.primaryTitle(frames: 8), "Redo 2 frames")
        XCTAssertEqual(review.counter(frames: 8), "6 to keep · 2 to redo")
        review.redo = ["1"]
        XCTAssertEqual(review.primaryTitle(frames: 8), "Redo 1 frame")
    }

    func testStyleframesBelongToTheLookCall() throws {
        XCTAssertEqual(ReviewStage.consoleStep("styleframes"), .look)
    }

    func testRedoPassesTheTransportsActionValidation() throws {
        // The action type and a note under 4000 characters are all `console.mjs wait` checks; a redo carries both.
        XCTAssertNotNil("redo".range(of: "^[a-z-]{2,20}$", options: .regularExpression))
    }

    func testPlacedMomentAndUnplacedListDecode() throws {
        let data = StyleframesPayload(try payload(#"""
        {"frames":[{"id":"1","image":"a.png","moment":{"id":"M913","name":"Checklist","still":"moments/M913.jpg","credit":"By OpusClip","why":"Opens the editor"}},
                   {"id":"2","image":"b.png","moment":{"name":"no id"}},{"id":"3","image":"c.png"}],
         "unplaced_moments":[{"id":"M921","name":"Opening claim","why":"No title beat"},{"name":"missing id"}]}
        """#))
        XCTAssertEqual(data.frames[0].moment, StyleframeMoment(id: "M913", name: "Checklist", still: "moments/M913.jpg", credit: "By OpusClip", why: "Opens the editor"))
        XCTAssertNil(data.frames[1].moment)
        XCTAssertNil(data.frames[2].moment)
        XCTAssertEqual(data.unplaced, [UnplacedMoment(id: "M921", name: "Opening claim", why: "No title beat")])
        XCTAssertTrue(StyleframesPayload(try payload(#"{"frames":[{"id":"1","image":"a.png"}]}"#)).unplaced.isEmpty)
    }

    func testSwapActionValue() {
        let value = StyleframeReview.swapValue(frame: "4", moment: "M916")
        XCTAssertEqual(value["frame"].string, "4")
        XCTAssertEqual(value["id"].string, "M916")
        let none = StyleframeReview.swapValue(frame: "4", moment: nil)
        XCTAssertEqual(none["id"], .null)
    }
}
