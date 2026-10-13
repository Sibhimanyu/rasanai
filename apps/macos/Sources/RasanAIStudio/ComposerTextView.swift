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
    override func becomeFirstResponder() -> Bool { let ok = super.becomeFirstResponder(); if ok { onFocusChange?(true) }; return ok }
    override func resignFirstResponder() -> Bool { let ok = super.resignFirstResponder(); if ok { onFocusChange?(false) }; return ok }
    override var string: String { didSet { needsDisplay = true } }
    override func didChangeText() { super.didChangeText(); needsDisplay = true }
}

/// The brief's text area: grows with its content (at least `minLines` lines, at most `maxLines`), one font and one line height
/// for the text and the hint. Reports focus so the box can draw its ring.
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

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> PlaceholderTextView {
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
        view.isVerticallyResizable = true; view.isHorizontallyResizable = false
        view.autoresizingMask = [.width]
        view.isAutomaticQuoteSubstitutionEnabled = false
        view.setAccessibilityLabel("Describe your film")
        view.placeholder = placeholder
        view.string = text
        return view
    }

    func updateNSView(_ view: PlaceholderTextView, context: Context) {
        context.coordinator.parent = self
        if view.string != text, !view.hasMarkedText() { view.string = text }
        view.placeholder = placeholder
        if context.coordinator.lastFocusRequest != focusRequest {
            context.coordinator.lastFocusRequest = focusRequest
            DispatchQueue.main.async { view.window?.makeFirstResponder(view) }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView view: PlaceholderTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 600
        let font = view.font ?? .systemFont(ofSize: fontSize)
        let line = ceil(NSLayoutManager().defaultLineHeight(for: font))
        guard let container = view.textContainer, let layout = view.layoutManager else { return CGSize(width: width, height: line * CGFloat(minLines)) }
        container.containerSize = NSSize(width: width, height: .greatestFiniteMagnitude)
        layout.ensureLayout(for: container)
        let used = layout.usedRect(for: container).height
        let content = max(used, view.string.isEmpty ? 0 : used)
        let lines = min(max(content, line * CGFloat(minLines)), line * CGFloat(maxLines))
        return CGSize(width: width, height: lines + Self.inset.height * 2)
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: ComposerTextView
        var lastFocusRequest = 0
        init(_ parent: ComposerTextView) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let view = notification.object as? NSTextView else { return }
            parent.text = view.string
            view.invalidateIntrinsicContentSize()
        }
    }
}
