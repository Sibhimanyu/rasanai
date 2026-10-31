import AppKit
import SwiftUI
import Heresay

extension Notification.Name {
    /// Posted before Heresay's report sheet opens: every sheet a view owns itself closes, because SwiftUI cannot present
    /// a window-level sheet while a child's sheet is up and the report would silently never appear.
    static let studioCloseSheets = Notification.Name("studio.closeSheets")
}

enum StudioFeedback {
    /// Opens Heresay's report sheet from our own buttons. The coordinator below does the rest, so the menu command
    /// (which calls `Heresay.present()` itself) behaves the same.
    @MainActor static func present() {
        if Heresay.shared.isPresented { Heresay.shared.isPresented = false }
        Heresay.present()
    }
}

/// Watches `Heresay.shared.isPresented`: when it turns on, closes Studio's own sheets and alerts first, then makes sure the
/// report sheet really appeared; a flag left on with no sheet (swallowed by a modal) is flipped off and on once more.
struct HeresayCoordinator: ViewModifier {
    @Bindable var store: StudioStore
    @ObservedObject private var heresay = Heresay.shared
    /// The retry runs at most once per user request; reset when the report is dismissed.
    @State private var retried = false
    /// True while our own retry flips the flag off, so that does not count as the person dismissing the report.
    @State private var retrying = false

    func body(content: Content) -> some View {
        content.onChange(of: heresay.isPresented) { _, shown in
            guard shown else { if !retrying { retried = false }; return }
            guard !heresay.isDisabled else { return }
            closeOwnSheets()
            guard !retried else { return }
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(450))
                guard heresay.isPresented, !heresay.isDisabled else { return }
                if !reportSheetIsShowing() {
                    // Still nothing on screen: close whatever is in the way and try once more.
                    retried = true; retrying = true
                    closeOwnSheets()
                    heresay.isPresented = false
                    try? await Task.sleep(for: .milliseconds(250))
                    retrying = false
                    Heresay.present()
                }
            }
        }
    }

    /// The report sheet may be the key window itself (no attached sheet of its own), so look at every window.
    @MainActor private func reportSheetIsShowing() -> Bool {
        NSApp.windows.contains { $0.isVisible && ($0.isSheet || $0.attachedSheet != nil) }
    }

    @MainActor private func closeOwnSheets() {
        if store.sheet != nil {
            if store.sheet == .welcome, store.settings.showWelcome { store.settings.showWelcome = false }
            store.sheet = nil
        }
        store.errorMessage = nil
        NotificationCenter.default.post(name: .studioCloseSheets, object: nil)
    }
}

extension View {
    func heresayCoordinated(store: StudioStore) -> some View { modifier(HeresayCoordinator(store: store)) }
}
