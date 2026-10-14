import AppKit
import SwiftUI
import XCTest
@testable import RasanAIStudio

/// The brief box grows with its text up to a cap, then scrolls inside itself instead of pushing the page apart.
@MainActor
final class ComposerTextViewTests: XCTestCase {
    private func host(_ text: String, windowHeight: CGFloat = 800) -> (NSHostingView<some View>, NSWindow) {
        let box = ComposerTextView(text: .constant(text), placeholder: "Describe your film", focused: .constant(false))
            .frame(width: 520)
        let hosting = NSHostingView(rootView: box)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: windowHeight), styleMask: [.borderless], backing: .buffered, defer: true)
        window.contentView = hosting
        hosting.layoutSubtreeIfNeeded()
        return (hosting, window)
    }

    private func scrollView(in view: NSView) -> NSScrollView? {
        if let scroll = view as? NSScrollView { return scroll }
        for sub in view.subviews { if let found = scrollView(in: sub) { return found } }
        return nil
    }

    func testShortTextKeepsTheMinimumHeight() {
        let (hosting, _) = host("A launch film for our app.")
        let line = ceil(NSLayoutManager().defaultLineHeight(for: .systemFont(ofSize: 15)))
        XCTAssertEqual(hosting.fittingSize.height, line * 3 + ComposerTextView.inset.height * 2, accuracy: 1)
    }

    func testLongTextStopsAtTheCapAndScrolls() throws {
        let long = String(repeating: "A launch film that shows every feature, one after another, with music. ", count: 120)
        let (hosting, _) = host(long)
        let line = ceil(NSLayoutManager().defaultLineHeight(for: .systemFont(ofSize: 15)))
        let screen = NSScreen.main?.visibleFrame.height ?? 800
        let cap = min(line * 12, max(line * 3, screen * ComposerTextView.screenShare)) + ComposerTextView.inset.height * 2
        XCTAssertEqual(hosting.fittingSize.height, cap, accuracy: 1, "long text should fill the box up to its cap, not stay at the minimum")
        hosting.setFrameSize(hosting.fittingSize); hosting.layoutSubtreeIfNeeded()
        let scroll = try XCTUnwrap(scrollView(in: hosting))
        let document = try XCTUnwrap(scroll.documentView)
        XCTAssertGreaterThan(document.frame.height, scroll.contentView.bounds.height * 2, "the text should scroll inside the box")
        if let out = ProcessInfo.processInfo.environment["COMPOSER_SNAPSHOT"], let rep = hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds) {
            hosting.appearance = NSAppearance(named: .darkAqua); hosting.wantsLayer = true; hosting.layer?.backgroundColor = NSColor.black.cgColor
            hosting.cacheDisplay(in: hosting.bounds, to: rep)
            try rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: out))
        }
    }
}
