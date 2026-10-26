import StudioCore
import SwiftUI

/// Plan 10 U1, folded into the bottom pill: which call this is, what its button means, and what kind of media is on screen. The pill (FilmStatusBar) reads these.
/// Build progress is labelled as progress, never as a sixth call. Everything here reads the session; nothing is written.
extension FilmSessionModel {
    /// What the picture or film on screen honestly is, on the calls that show one (Look, Storyboard, Final); nil elsewhere.
    func mediaKind(for call: CreativeCall) -> MediaKind? {
        switch call {
        case .look: .styleframe
        case .storyboard: MediaKind.of(payload: payload("animatic"), call: .storyboard)
        case .final: MediaKind.of(payload: payload(payload("render") != .null ? "render" : "final"), call: .final)
        default: nil
        }
    }
}

enum CallInheritedNote {
    static let help = "This call was decided without you pressing its button. You can still open it and change it; the series' saved defaults stay as they are."
}

/// The honest name of what is on screen: a styleframe is a still, an animatic is timed stills, a proxy is not the delivered film. Word and symbol, never colour alone.
struct MediaKindBadge: View {
    let kind: MediaKind
    /// Icon only (narrow pill); the word stays in the tooltip and the accessibility label.
    var iconOnly = false
    var body: some View {
        Group {
            if iconOnly { Image(systemName: symbol) } else { Label(kind.shortLabel, systemImage: symbol) }
        }
        .font(.system(size: 11, weight: .medium)).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: Capsule())
            .help(kind.label).accessibilityLabel(kind.label)
    }
    private var symbol: String {
        switch kind {
        case .styleframe: "photo"
        case .animatic: "film.stack"
        case .slideshow: "rectangle.on.rectangle"
        case .proxy: "eye"
        case .final: "checkmark.seal"
        }
    }
}
