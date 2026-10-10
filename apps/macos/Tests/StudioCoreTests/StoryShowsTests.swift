import XCTest
@testable import StudioCore

final class StoryShowsTests: XCTestCase {
    private func json(_ text: String) throws -> JSONValue { try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)) }

    func testParsesRowsAndSkipsEmpty() throws {
        let beat = try json(#"""
        {"shows":[{"line":"Same songs","show":"The pill holds while the word swaps songs.","built_from":"product UI","handoff":"pill swells into rings"},
                  {},{"line":"Only a line"},5]}
        """#)
        let shows = StoryShow.parse(beat["shows"])
        XCTAssertEqual(shows.map(\.line), ["Same songs", "Only a line"])
        XCTAssertEqual(shows[0].builtFrom, "product UI")
        XCTAssertEqual(shows[0].handoff, "pill swells into rings")
        XCTAssertEqual(shows[1].show, "")
    }

    func testAbsentOrMalformedIsEmpty() throws {
        XCTAssertTrue(StoryShow.parse(try json(#"{"visual":"x"}"#)["shows"]).isEmpty)
        XCTAssertTrue(StoryShow.parse(try json(#"{"shows":"nope"}"#)["shows"]).isEmpty)
    }
}
