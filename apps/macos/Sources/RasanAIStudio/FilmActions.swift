import SwiftUI

/// What the step on screen offers the person to do: an optional secondary ("Let Claude decide", "Just make it") and the
/// primary. Stages do not draw a bar of their own; they publish this value up the view tree and the one `FilmStatusBar`
/// at the bottom of the film page shows it, so the status and the action share a single bar.
///
/// Equality ignores the closures (SwiftUI needs a cheap `==` to decide whether the preference changed), so a stage whose
/// closures capture data that can change without the titles changing passes that data's identity as `signature`.
struct FilmActions: Equatable {
    var step: String
    var primaryTitle: String?
    var primarySymbol: String?
    var primaryEnabled = true
    var secondaryTitle: String?
    var secondaryHelp: String?
    var secondaryEnabled = true
    var signature = ""
    /// Both receive the person's unsent note from the inspector composer ("" when there is none).
    var onPrimary: (String) -> Void = { _ in }
    var onSecondary: (String) -> Void = { _ in }

    static func == (a: FilmActions, b: FilmActions) -> Bool {
        a.step == b.step && a.primaryTitle == b.primaryTitle && a.primarySymbol == b.primarySymbol && a.primaryEnabled == b.primaryEnabled
            && a.secondaryTitle == b.secondaryTitle && a.secondaryEnabled == b.secondaryEnabled && a.signature == b.signature
    }
}

struct FilmActionsKey: PreferenceKey {
    static var defaultValue: FilmActions? { nil }
    static func reduce(value: inout FilmActions?, nextValue: () -> FilmActions?) { value = nextValue() ?? value }
}

/// A zero-size view that publishes the step's actions (or none) to the status bar. Stages place it where their old bar was.
struct FilmActionsPublisher: View {
    let actions: FilmActions?
    var body: some View {
        Color.clear.frame(width: 0, height: 0).preference(key: FilmActionsKey.self, value: actions).accessibilityHidden(true)
    }
}

extension FilmSessionModel {
    /// For actions that take no note themselves (the brief, the reviews): an unsent note from the composer is sent to the step
    /// first, so it is never dropped when the person presses the primary button.
    func noteThen(step: String, _ note: String, _ run: @escaping () -> Void) {
        guard !note.isEmpty else { run(); return }
        Task { if await tell(note, step: step) { run() } }
    }
}
