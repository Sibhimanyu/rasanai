import AppKit
import SwiftUI

/// Observes wheel and momentum events without consuming them or changing native scrolling.
struct GalleryScrollMonitor: NSViewRepresentable {
    let gallery: MomentGallery
    func makeNSView(context: Context) -> GalleryScrollMonitorView {
        let view = GalleryScrollMonitorView()
        view.gallery = gallery
        return view
    }
    func updateNSView(_ view: GalleryScrollMonitorView, context: Context) { view.gallery = gallery }
}

final class GalleryScrollMonitorView: NSView {
    weak var gallery: MomentGallery?
    private var monitor: Any?
    override var isOpaque: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        removeMonitor()
        guard window != nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
            MainActor.assumeIsolated { self?.record(event) }
            return event
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
    private func record(_ event: NSEvent) {
        guard let window, event.window === window, window.attachedSheet == nil,
              bounds.contains(convert(event.locationInWindow, from: nil)) else { return }
        gallery?.noteScrollActivity()
    }
}
