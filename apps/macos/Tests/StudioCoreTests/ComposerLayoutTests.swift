import XCTest
@testable import StudioCore

final class ComposerLayoutTests: XCTestCase {
    private let widths: [ComposerChip: Double] = [.length: 80, .aspect: 80, .motion: 90, .brand: 100]

    func testEverythingFitsOnAWideToolbar() {
        let result = ComposerLayout.split(available: 700, fixed: 300, widths: widths)
        XCTAssertEqual(result.inline, ComposerChip.allCases)
        XCTAssertTrue(result.overflow.isEmpty)
    }

    func testNarrowToolbarFoldsChipsFromTheEndInOrder() {
        // 300 fixed + (80+8) + (80+8) = 476; the next chip (98) would reach 574.
        let result = ComposerLayout.split(available: 500, fixed: 300, widths: widths)
        XCTAssertEqual(result.inline, [.length, .aspect])
        XCTAssertEqual(result.overflow, [.motion, .brand])
    }

    func testNothingFitsSendsAllToTheOverflow() {
        let result = ComposerLayout.split(available: 200, fixed: 300, widths: widths)
        XCTAssertTrue(result.inline.isEmpty)
        XCTAssertEqual(result.overflow, ComposerChip.allCases)
    }

    func testShortLengthLabels() {
        XCTAssertEqual(ComposerLayout.shortLength(45), "45s")
        XCTAssertEqual(ComposerLayout.shortLength(120), "2 min")
        XCTAssertEqual(ComposerLayout.shortLength(90), "1 min 30s")
    }
}
