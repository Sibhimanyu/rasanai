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

    func body(content: Content) -> some View {
        content.onChange(of: heresay.isPresented) { _, shown in
            guard shown, !heresay.isDisabled else { return }
            closeOwnSheets()
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(450))
                guard heresay.isPresented, !heresay.isDisabled else { return }
                if (NSApp.keyWindow ?? NSApp.mainWindow)?.attachedSheet == nil {
                    // Still nothing on screen: close whatever is in the way and try once more.
                    closeOwnSheets()
                    heresay.isPresented = false
                    try? await Task.sleep(for: .milliseconds(250))
                    Heresay.present()
                }
            }
        }
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
