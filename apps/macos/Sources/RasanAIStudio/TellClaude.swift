import StudioCore
import SwiftUI

/// Toolbar item every native film page carries: the inspector toggle (Notes and Decisions). The note composer lives in the
/// inspector; ⌘K opens it (see `DecisionsHost`). "Just make it" lives in the brief's action bar and the ••• menu.
struct FilmToolbarItems: ToolbarContent {
    @Bindable var model: FilmSessionModel
    var body: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Button { model.decisionsPresented.toggle() } label: { Label("Inspector", systemImage: "sidebar.right") }
                .keyboardShortcut("d", modifiers: [.command, .option])
                .help("Show or hide the inspector: notes for Claude and every decision (⌥⌘D)")
        }
    }
}
