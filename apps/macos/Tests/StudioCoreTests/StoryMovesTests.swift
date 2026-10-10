import XCTest
@testable import StudioCore

final class StoryMovesTests: XCTestCase {
    private func json(_ text: String) throws -> JSONValue { try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)) }

    func testParsesMovesAndCarrier() throws {
        let story = try json(#"""
        {"id":"bold","carrier":"a circle","moves":[
          {"id":"m3","title":"The o becomes an eye","move":"The o fills orange, grows a pupil.","says":"seeing","beat":2,"video":"story/moves/Bold-m3/rough.mp4","strip":"story/moves/Bold-m3/strip.png","poster":"story/moves/Bold-m3/poster.png"},
          {"id":"m1","title":"Second","move":"x"},{"id":"m2","title":"Third"},{"id":"m9","title":"Fourth is dropped"}]}
        """#)
        XCTAssertEqual(StoryMove.carrier(story["carrier"]), "a circle")
        let moves = StoryMove.parse(story["moves"])
        XCTAssertEqual(moves.map(\.id), ["m3", "m1", "m2"])
        XCTAssertEqual(moves[0].beat, 2)
        XCTAssertEqual(moves[0].video, "story/moves/Bold-m3/rough.mp4")
        XCTAssertNil(moves[1].beat); XCTAssertNil(moves[1].video); XCTAssertNil(moves[1].poster)
    }

    func testAbsentOrMalformedMovesAreEmpty() throws {
        let old = try json(#"{"id":"a","title":"A","beats":[]}"#)
        XCTAssertTrue(StoryMove.parse(old["moves"]).isEmpty)
        XCTAssertNil(StoryMove.carrier(old["carrier"]))
        XCTAssertNil(StoryMove.carrier(.string("  ")))
        XCTAssertTrue(StoryMove.parse(try json(#"{"moves":"nope"}"#)["moves"]).isEmpty)
        let odd = StoryMove.parse(try json(#"[{}, {"id":7,"title":"Seven","beat":0}, 5]"#))
        XCTAssertEqual(odd.map(\.id), ["7"])
        XCTAssertNil(odd[0].beat)
    }

    func testBeatStartTime() {
        XCTAssertEqual(StoryMove.start(ofBeat: 1, durations: [2.4, 3, 4]), 0)
        XCTAssertEqual(StoryMove.start(ofBeat: 3, durations: [2.4, 3, 4]), 5.4, accuracy: 0.001)
    }
}
