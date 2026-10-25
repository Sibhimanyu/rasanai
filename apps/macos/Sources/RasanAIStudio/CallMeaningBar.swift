import StudioCore
import SwiftUI

/// Plan 10 U1: one quiet line over the stage saying which of the five calls this is and what pressing its button means. It sits in the stage area (under the
/// update notice); the sidebar, toolbar, splash and the Describe...Final stepper are not touched. Build progress is labelled as progress, never as a sixth call.
/// Everything here reads the session; nothing is written, and revisiting a call never changes saved series defaults.
struct CallMeaningBar: View {
    let model: FilmSessionModel

    var body: some View {
        let route = model.route
        if let call = CreativeCall(route: route) {
            let state = CallJourney.states(model.snapshot).first { $0.call == call }
            bar {
                Text("Call \(call.number) of \(CreativeCall.allCases.count)").font(.system(size: 12, weight: .semibold))
                Text(call.title).font(.system(size: 12, weight: .semibold))
                Text(model.isViewingPast ? "You are looking back at this call." : call.approvalMeaning).font(.system(size: 12)).foregroundStyle(.secondary)
                Spacer(minLength: 8)
                if let kind = mediaKind(for: call) { MediaKindBadge(kind: kind) }
                if let source = state?.source, source.isInherited {
                    Label(source.label, systemImage: "arrow.triangle.branch").font(.system(size: 11)).foregroundStyle(.secondary)
                        .help("This call was decided without you pressing its button. You can still open it and change it; the series' saved defaults stay as they are.")
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Call \(call.number) of \(CreativeCall.allCases.count), \(call.title). \(call.approvalMeaning)\(state?.source?.isInherited == true ? " " + (state?.source?.label ?? "") : "")")
        } else if CallJourney.isBuildProgress(route) {
            bar {
                Image(systemName: "hammer").font(.system(size: 12)).foregroundStyle(.secondary)
                Text(CallJourney.buildCaption).font(.system(size: 12)).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func mediaKind(for call: CreativeCall) -> MediaKind? {
        switch call {
        case .look: .styleframe
        case .storyboard: MediaKind.of(payload: model.payload("animatic"), call: .storyboard)
        case .final: MediaKind.of(payload: model.payload(model.payload("render") != .null ? "render" : "final"), call: .final)
        default: nil
        }
    }

    private func bar<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) { content() }
            .lineLimit(2).fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, .filmInset).padding(.vertical, 5)
            .background(.bar).overlay(alignment: .bottom) { Divider() }
    }
}

/// The honest name of what is on screen: a styleframe is a still, an animatic is timed stills, a proxy is not the delivered film. Word and symbol, never colour alone.
struct MediaKindBadge: View {
    let kind: MediaKind
    var body: some View {
        Label(kind.shortLabel, systemImage: symbol).font(.system(size: 11, weight: .medium))
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
