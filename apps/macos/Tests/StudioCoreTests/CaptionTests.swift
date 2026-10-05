import Foundation
import XCTest
@testable import StudioCore

final class CaptionTests: XCTestCase {
    func testParsesSRT() {
        let srt = "\u{FEFF}1\r\n00:00:01,000 --> 00:00:02,500\r\nHello there\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n<i>Two</i>\r\nlines\r\n\r\n3\r\n01:00:00,250 --> 01:00:01,000\r\nLate\r\n"
        let cues = CaptionParser.parse(srt)
        XCTAssertEqual(cues.count, 3)
        XCTAssertTrue(cues[0] == CaptionCue(start: 1, end: 2.5, text: "Hello there"))
        XCTAssertTrue(cues[1].text == "Two\nlines")
        XCTAssertTrue(cues[2].start == 3600.25)
    }
    func testParsesVTTWithHeaderSettingsAndMultilineText() {
        let vtt = """
        WEBVTT - demo

        NOTE a comment
        that spans lines

        STYLE
        ::cue { color: red }

        intro
        00:01.000 --> 00:03.500 align:middle line:90%
        First <c.yellow>line</c>
        Second &amp; last

        00:00:04.000 --> 00:00:05.000
        <v Ann>Voiced</v>
        """
        let cues = CaptionParser.parse(vtt)
        XCTAssertEqual(cues.count, 2)
        XCTAssertTrue(cues[0].start == 1 && cues[0].end == 3.5)
        XCTAssertTrue(cues[0].text == "First line\nSecond & last")
        XCTAssertEqual(cues[1].text, "Voiced")
    }
    func testSkipsMalformedInputAndSortsCues() {
        let messy = """
        1
        garbage --> nonsense
        text

        2
        00:00:05,000 --> 00:00:04,000
        backwards

        3
        00:00:02,000 --> 00:00:03,000

        4
        00:00:09,000 --> 00:00:10,000
        Later

        5
        00:00:01,000 --> 00:00:02,000
        Earlier
        """
        let cues = CaptionParser.parse(messy)
        XCTAssertTrue(cues.map(\.text) == ["Earlier", "Later"])
        XCTAssertTrue(CaptionParser.parse("").isEmpty)
        XCTAssertTrue(CaptionParser.parse("not a caption file at all").isEmpty)
    }
    func testLayoutScalesWithPicture() {
        XCTAssertTrue(CaptionLayout.fontSize(width: 1280, height: 720) == 33)
        XCTAssertTrue(CaptionLayout.fontSize(width: 1920, height: 1080) == 50)
        XCTAssertTrue(CaptionLayout.fontSize(width: 1080, height: 1920) < 70)
        XCTAssertTrue(CaptionLayout.fittedSize(CGSize(width: 3840, height: 2160), within: CGSize(width: 1920, height: 1080)) == CGSize(width: 1920, height: 1080))
        XCTAssertTrue(CaptionLayout.fittedSize(CGSize(width: 1280, height: 720), within: CGSize(width: 1920, height: 1080)) == CGSize(width: 1280, height: 720))
        XCTAssertTrue(CaptionLayout.fittedSize(CGSize(width: 1080, height: 1920), within: CGSize(width: 1280, height: 720)) == CGSize(width: 720, height: 1280))
    }
}
