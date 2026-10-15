import AppKit
import SwiftUI

/// An NSTextView that draws its placeholder with the same font, inset and line-fragment padding as the typed text, so the
/// caret and the hint start at exactly the same point.
final class PlaceholderTextView: NSTextView {
    var placeholder = "" { didSet { needsDisplay = true } }
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard string.isEmpty, !placeholder.isEmpty, let container = textContainer else { return }
        let origin = NSPoint(x: textContainerInset.width + container.lineFragmentPadding, y: textContainerInset.height)
        let width = bounds.width - textContainerInset.width * 2 - container.lineFragmentPadding * 2
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byWordWrapping
        if let current = defaultParagraphStyle { style.setParagraphStyle(current) }
        let attrs: [NSAttributedString.Key: Any] = [.font: font ?? NSFont.systemFont(ofSize: 15), .foregroundColor: NSColor.tertiaryLabelColor, .paragraphStyle: style]
        (placeholder as NSString).draw(with: NSRect(x: origin.x, y: origin.y, width: max(width, 40), height: bounds.height), options: [.usesLineFragmentOrigin], attributes: attrs)
    }
    var onFocusChange: ((Bool) -> Void)?
    /// Set when focus was asked for before the view had a window; granted once it is attached.
    var wantsFocus = false
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if wantsFocus, window != nil { grabFocus() }
    }
    /// Lays the window out first so the caret's scroll-to-visible works on final geometry, not the first pass.
    func grabFocus() {
        guard let expectedWindow = window else { wantsFocus = true; return }
        wantsFocus = false
        DispatchQueue.main.async { [weak self] in
            guard let self, self.window === expectedWindow else { return }
            expectedWindow.layoutIfNeeded()
            expectedWindow.makeFirstResponder(self)
        }
    }
    override func becomeFirstResponder() -> Bool { let ok = super.becomeFirstResponder(); if ok { onFocusChange?(true) }; return ok }
    override func resignFirstResponder() -> Bool { let ok = super.resignFirstResponder(); if ok { onFocusChange?(false) }; return ok }
    override var string: String { didSet { needsDisplay = true } }
    override func didChangeText() { super.didChangeText(); needsDisplay = true }
}

/// The brief's text area: grows with its content (at least `minLines` lines, at most `maxLines`, and never more than 30% of
/// the screen), then scrolls inside itself. One font and one line height for the text and the hint. Reports focus so the
/// box can draw its ring.
struct ComposerTextView: NSViewRepresentable {
    @Binding var text: String
    var placeholder: String
    var minLines = 3
    var maxLines = 12
    @Binding var focused: Bool
    /// Bumped by the parent to ask for focus.
    var focusRequest = 0
    var fontSize: CGFloat = 15

    static let inset = NSSize(width: 0, height: 2)
    /// The box never takes more than this share of the screen's height, so the toolbar and the page stay in view.
    static let screenShare: CGFloat = 0.3

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.borderType = .noBorder
        scroll.hasVerticalScroller = true; scroll.hasHorizontalScroller = false
        scroll.autohidesScrollers = true
        scroll.scrollerStyle = .overlay
        scroll.contentView.drawsBackground = false

        let view = PlaceholderTextView()
        view.delegate = context.coordinator
        let coordinator = context.coordinator
        view.onFocusChange = { focus in DispatchQueue.main.async { coordinator.parent.focused = focus } }
        view.isRichText = false; view.allowsUndo = true
        view.drawsBackground = false
        view.font = .systemFont(ofSize: fontSize)
        view.textContainerInset = Self.inset
        view.textContainer?.lineFragmentPadding = 0
        view.textContainer?.widthTracksTextView = true
        view.textContainer?.containerSize = NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
        view.minSize = .zero
        view.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        view.isVerticallyResizable = true; view.isHorizontallyResizable = false
        view.autoresizingMask = [.width]
        view.isAutomaticQuoteSubstitutionEnabled = false
        view.setAccessibilityLabel("Describe your film")
        view.placeholder = placeholder
        view.string = text
        scroll.documentView = view
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let view = scroll.documentView as? PlaceholderTextView else { return }
        if view.string != text, !view.hasMarkedText() { view.string = text }
        view.placeholder = placeholder
        if context.coordinator.lastFocusRequest != focusRequest {
            context.coordinator.lastFocusRequest = focusRequest
            view.grabFocus()
        }
    }

    /// Measures the text at the proposed width on its own layout, so sizing never disturbs the live view, then clamps it
    /// between `minLines` and the cap. Past the cap the scroll view takes over.
    func sizeThatFits(_ proposal: ProposedViewSize, nsView scroll: NSScrollView, context: Context) -> CGSize? {
        let width = proposal.width ?? 600
        let font = NSFont.systemFont(ofSize: fontSize)
        let line = ceil(NSLayoutManager().defaultLineHeight(for: font))
        let storage = NSTextStorage(string: text, attributes: [.font: font])
        let layout = NSLayoutManager()
        let container = NSTextContainer(size: NSSize(width: max(width, 1), height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        layout.ensureLayout(for: container)
        var content = layout.usedRect(for: container).height
        if text.hasSuffix("\n") { content += line }   // a trailing newline puts the caret on a line of its own
        var cap = line * CGFloat(maxLines)
        // The screen, not the window: a window that fits its content would shrink the cap every pass.
        if let screen = scroll.window?.screen ?? NSScreen.main { cap = min(cap, max(line * CGFloat(minLines), screen.visibleFrame.height * Self.screenShare)) }
        let height = min(max(content, line * CGFloat(minLines)), cap)
        return CGSize(width: width, height: height + Self.inset.height * 2)
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: ComposerTextView
        var lastFocusRequest = 0
        init(_ parent: ComposerTextView) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let view = notification.object as? NSTextView else { return }
            parent.text = view.string
        }
    }
}
