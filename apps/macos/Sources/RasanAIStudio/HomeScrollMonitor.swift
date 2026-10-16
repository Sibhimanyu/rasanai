import AppKit
import SwiftUI

/// What Home's scroll monitor needs to know about the page it watches, and how it reports back.
///
/// Constraints, all deliberate:
/// - One local NSEvent monitor, never global; it exists only while the view is in a window and is removed when it
///   leaves one and on deinit.
/// - It looks only at events for its own window, with no sheet attached, whose pointer is inside its own bounds. The
///   sidebar, toolbar, other windows and sheets never reach it. (Once a transition gesture is latched, its momentum is
///   still swallowed if the pointer drifted out, so the tail never scrolls the films.)
/// - The view is transparent to hits (`hitTest` returns nil): it can never take a click or focus.
/// - In the prompt it ignores a gesture that began over a control, or over a scroll view (the brief's text area) that can
///   still scroll down. In the films it acts only for a gesture that began with the film list at its very top.
/// - It never overrides Escape or any key.
@MainActor
final class HomeScrollGate {
    var browsing = false
    /// Off for an empty library: Home is then just the prompt.
    var enabled = true
    var onTrigger: (HomeScrollDirection) -> Void = { _ in }
    /// The films layer's own NSScrollView, found by `HomeFilmsScrollProbe`. It is the hidden one in the prompt, so it must
    /// not count as "a scroll view under the pointer" there, and its offset is the truth in the films.
    weak var filmsScroll: NSScrollView?
}

/// A transparent background that watches scroll wheel events for Home. See `HomeScrollGate`.
struct HomeScrollMonitor: NSViewRepresentable {
    let gate: HomeScrollGate

    func makeNSView(context: Context) -> HomeScrollMonitorView {
        let view = HomeScrollMonitorView()
        view.gate = gate
        return view
    }
    func updateNSView(_ view: HomeScrollMonitorView, context: Context) { view.gate = gate }
}

final class HomeScrollMonitorView: NSView {
    @MainActor weak var gate: HomeScrollGate?
    private var monitor: Any?
    private var rules = HomeScrollRules()

    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override var isOpaque: Bool { false }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        removeMonitor()
        rules.reset()
        guard window != nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
            guard let self else { return event }
            let consumed = MainActor.assumeIsolated { self.handle(event) == nil }
            return consumed ? nil : event
        }
    }
    override func viewWillMove(toWindow newWindow: NSWindow?) {
        if newWindow == nil { removeMonitor() }
        super.viewWillMove(toWindow: newWindow)
    }
    isolated deinit { if let monitor { NSEvent.removeMonitor(monitor) } }

    private func removeMonitor() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }

    @MainActor private func handle(_ event: NSEvent) -> NSEvent? {
        guard let gate, gate.enabled, let window, event.window === window, window.attachedSheet == nil else { return event }
        let point = convert(event.locationInWindow, from: nil)
        let inside = bounds.contains(point)
        guard inside || rules.isLatched else { return event }

        let allowed: HomeScrollDirection? = inside ? allowedDirection(for: event, window: window, gate: gate) : nil
        let verdict = rules.handle(Self.sample(from: event), allowed: allowed)
        switch verdict {
        case .pass: return event
        case .consume: return nil
        case .trigger(let direction):
            gate.onTrigger(direction)
            return nil
        }
    }

    /// What a gesture starting here may do. Evaluated by the rules only on a gesture's first event.
    @MainActor private func allowedDirection(for event: NSEvent, window: NSWindow, gate: HomeScrollGate) -> HomeScrollDirection? {
        if gate.browsing {
            guard let films = gate.filmsScroll else { return nil }
            return Self.edges(of: films).atTop ? .towardPrompt : nil
        }
        // Prompt: look at what is under the pointer.
        guard let content = window.contentView, let host = content.superview else { return .towardFilms }
        var view = content.hitTest(host.convert(event.locationInWindow, from: nil))
        while let current = view {
            if current === gate.filmsScroll { break }
            if current is NSControl, !(current is NSTextField) { return nil }
            if let scroll = current as? NSScrollView, scroll !== gate.filmsScroll, !Self.edges(of: scroll).atBottom { return nil }
            view = current.superview
        }
        return .towardFilms
    }

    /// Whether a scroll view is at its top / bottom edge (both true when its content fits).
    static func edges(of scroll: NSScrollView) -> (atTop: Bool, atBottom: Bool) {
        guard let document = scroll.documentView else { return (true, true) }
        let visible = scroll.documentVisibleRect, bounds = document.bounds
        if bounds.height <= visible.height + 1 { return (true, true) }
        if document.isFlipped { return (visible.minY <= bounds.minY + 1, visible.maxY >= bounds.maxY - 1) }
        return (visible.maxY >= bounds.maxY - 1, visible.minY <= bounds.minY + 1)
    }

    static func sample(from event: NSEvent) -> HomeScrollSample {
        func phase(_ p: NSEvent.Phase) -> HomeScrollPhase {
            if p.contains(.began) { return .began }
            if p.contains(.ended) || p.contains(.cancelled) { return .ended }
            if p.contains(.changed) || p.contains(.stationary) || p.contains(.mayBegin) { return .changed }
            return .none
        }
        return HomeScrollSample(deltaX: event.scrollingDeltaX, deltaY: event.scrollingDeltaY, precise: event.hasPreciseScrollingDeltas,
                                phase: phase(event.phase), momentum: phase(event.momentumPhase), timestamp: event.timestamp)
    }
}

/// Placed inside the films ScrollView's content: finds the NSScrollView that hosts it and hands it to the gate.
struct HomeFilmsScrollProbe: NSViewRepresentable {
    let gate: HomeScrollGate

    func makeNSView(context: Context) -> ProbeView {
        let view = ProbeView()
        view.gate = gate
        return view
    }
    func updateNSView(_ view: ProbeView, context: Context) { view.gate = gate; view.attach() }

    final class ProbeView: NSView {
        @MainActor weak var gate: HomeScrollGate?
        override func hitTest(_ point: NSPoint) -> NSView? { nil }
        override func viewDidMoveToWindow() { super.viewDidMoveToWindow(); attach() }
        /// The enclosing scroll view may not exist at the first layout pass, so retry on the next run loop turn.
        @MainActor func attach() {
            if let scroll = enclosingScrollView { gate?.filmsScroll = scroll; return }
            DispatchQueue.main.async { [weak self] in
                MainActor.assumeIsolated { if let self, let scroll = self.enclosingScrollView { self.gate?.filmsScroll = scroll } }
            }
        }
    }
}
