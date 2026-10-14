import StudioCore
import SwiftUI

/// How tall the frame in a review player may be. The stages set it from the window so the transport and scene strip stay on
/// screen in a small window, and let it grow in a large one.
private struct ReviewFrameHeightKey: EnvironmentKey { static let defaultValue: CGFloat = 340 }
extension EnvironmentValues {
    var reviewFrameHeight: CGFloat {
        get { self[ReviewFrameHeightKey.self] }
        set { self[ReviewFrameHeightKey.self] = newValue }
    }
}

extension View {
    /// Measures the page and passes the frame height the review player may use (window height minus everything around it).
    func reviewFrameFitting() -> some View { modifier(ReviewFrameFitting()) }
}

private struct ReviewFrameFitting: ViewModifier {
    @State private var height: CGFloat = 640
    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            .environment(\.reviewFrameHeight, min(480, max(180, height - 352)))
    }
}

/// Review notes the person chose not to apply this time. Only the ids Apply sends change: nothing goes to the director when a
/// note is skipped, and a skipped note stays on the animatic. Held by the film page so the inspector and the stage share it.
@MainActor @Observable
final class NoteSkips {
    var ids: Set<String> = []
    func toggle(_ id: String) { if ids.contains(id) { ids.remove(id) } else { ids.insert(id) } }
}

/// The primary action of a review call (Animatic, Final), published to the status bar at the bottom right, the same place as
/// the first half's CallActions. Notes live on the frame and in the list. Draws nothing itself.
struct ReviewActionBar: View {
    let model: FilmSessionModel
    let step: String
    let title: String
    let symbol: String
    var hint: String?
    /// What the closure captures (the open note ids), so the bar re-publishes when it changes without the title changing.
    var signature = ""
    var onPrimary: () -> Void

    var body: some View {
        FilmActionsPublisher(actions: model.showsActions(for: step) ? FilmActions(
            step: step, primaryTitle: title, primarySymbol: symbol, signature: signature,
            onPrimary: { note in model.noteThen(step: step, note, onPrimary) }) : nil)
    }
}

