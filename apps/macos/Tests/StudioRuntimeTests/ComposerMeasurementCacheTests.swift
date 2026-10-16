import AppKit
import SwiftUI
import XCTest
@testable import RasanAIStudio

final class ComposerMeasurementCacheTests: XCTestCase {
    @MainActor func testCachedHeightUpdatesForWidthFontAndText() {
        let parent = ComposerTextView(text: .constant(""), placeholder: "", focused: .constant(false))
        let cache = ComposerTextView.Coordinator(parent)
        func height(_ text: String, width: CGFloat = 400, size: CGFloat = 15) -> CGFloat {
            let font = NSFont.systemFont(ofSize: size)
            let line = ceil(NSLayoutManager().defaultLineHeight(for: font))
            return cache.contentHeight(text: text, width: width, fontSize: size, font: font, line: line)
        }
        let text = String(repeating: "A film about thoughtful design. ", count: 12)
        let wide = height(text, width: 600)
        XCTAssertGreaterThan(height(text, width: 120), wide)
        XCTAssertEqual(height(text, width: 600), wide)
        XCTAssertGreaterThan(height(text, width: 600, size: 30), wide)
        let plain = height("Hello")
        XCTAssertGreaterThan(height("Hello\n"), plain)
        XCTAssertEqual(height("Hello"), plain)
        XCTAssertLessThan(height(""), wide)
    }

    @MainActor func testRepeatedMeasurementTiming() {
        let parent = ComposerTextView(text: .constant(""), placeholder: "", focused: .constant(false))
        let font = NSFont.systemFont(ofSize: 16)
        let line = ceil(NSLayoutManager().defaultLineHeight(for: font))
        let text = String(repeating: "A film about thoughtful design. ", count: 30)
        let rounds = 300
        let start = Date()
        for _ in 0..<rounds {
            _ = ComposerTextView.Coordinator(parent).contentHeight(text: text, width: 600, fontSize: 16, font: font, line: line)
        }
        let uncached = Date().timeIntervalSince(start)
        let cache = ComposerTextView.Coordinator(parent)
        _ = cache.contentHeight(text: text, width: 600, fontSize: 16, font: font, line: line)
        let cachedStart = Date()
        for _ in 0..<rounds {
            _ = cache.contentHeight(text: text, width: 600, fontSize: 16, font: font, line: line)
        }
        print("COMPOSER_BENCHMARK rounds=\(rounds) layout_ms=\(uncached * 1000) cached_ms=\(Date().timeIntervalSince(cachedStart) * 1000)")
    }
}
