import AppKit
import SwiftUI

/// Reports whether the window this view sits in is in full screen. It only reads: the window is never changed, so the
/// native split view keeps owning the window's chrome. The state starts from the window's `.fullScreen` style mask and
/// follows that window's own enter and exit notifications, and the observers go when the view leaves the window.
struct FullScreenState: NSViewRepresentable {
    @Binding var isFullScreen: Bool

    func makeNSView(context: Context) -> StateView { StateView(report: { isFullScreen = $0 }) }
    func updateNSView(_ view: StateView, context: Context) { view.report = { isFullScreen = $0 } }

    final class StateView: NSView {
        var report: (Bool) -> Void

        init(report: @escaping (Bool) -> Void) {
            self.report = report
            super.init(frame: .zero)
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

        override func viewWillMove(toWindow newWindow: NSWindow?) {
            super.viewWillMove(toWindow: newWindow)
            NotificationCenter.default.removeObserver(self)
            guard let newWindow else { return }
            // Full screen stays "on" through the exit transition and goes off only at didExit.
            for name in [NSWindow.willEnterFullScreenNotification, NSWindow.didEnterFullScreenNotification,
                         NSWindow.didExitFullScreenNotification] {
                NotificationCenter.default.addObserver(self, selector: #selector(fullScreenChanged), name: name, object: newWindow)
            }
        }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            guard let window else { return }
            publish(window.styleMask.contains(.fullScreen), from: window)
        }

        deinit { NotificationCenter.default.removeObserver(self) }

        @objc private func fullScreenChanged(_ note: Notification) {
            guard let source = note.object as? NSWindow, source === window else { return }
            publish(note.name != NSWindow.didExitFullScreenNotification, from: source)
        }

        /// Published on the next turn, never inside a view update, and dropped if the view has moved to another window.
        private func publish(_ value: Bool, from source: NSWindow) {
            DispatchQueue.main.async { [weak self] in
                guard let self, self.window === source else { return }
                self.report(value)
            }
        }
    }
}
