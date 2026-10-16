import StudioCore
import SwiftUI

/// Home is a short list of next actions; the full library owns sorting, layout and archive controls.
enum HomeWorkspaceRules {
    static func priority(_ phase: FilmPhase) -> Int {
        switch phase {
        case .needsAttention: 0
        case .yourTurn: 1
        case .paused: 2
        case .working, .starting: 3
        case .draft: 4
        case .inProgress, .offline: 5
        case .queued: 6
        case .finished: 7
        }
    }

    static func action(for summary: FilmSummary) -> String {
        switch summary.phase {
        case .yourTurn(let request):
            if summary.stage == .final, request.localizedStandardContains("render") { return "Render final" }
            switch summary.stage {
            case .brief: return "Confirm brief"
            case .story: return "Choose story"
            case .look: return "Choose look"
            case .animatic: return "Review preview"
            case .final: return "Review final"
            case nil: return "Review film"
            }
        case .needsAttention: return "Resolve issue"
        case .paused: return "Continue film"
        case .draft: return "Continue brief"
        case .working, .starting: return "View progress"
        case .queued: return "View queue"
        case .finished: return "Watch film"
        case .inProgress, .offline: return "Continue film"
        }
    }

    static func detail(for summary: FilmSummary) -> String {
        if let detail = summary.detail, !detail.isEmpty { return detail }
        switch summary.phase {
        case .yourTurn: return summary.stage?.subtitle ?? "Your next decision is ready."
        case .needsAttention: return "Open the film to see what needs attention."
        case .paused: return "Your progress is saved. Continue when you're ready."
        case .draft: return "Finish your brief and start making your film."
        case .working, .starting: return "Your director is working on this film."
        case .queued(let position): return "Waiting in the queue · Position \(position)"
        case .finished: return filmFacts(duration: summary.duration, aspect: summary.aspect)
        case .inProgress, .offline: return "Pick up from the last saved step."
        }
    }
}

/// The actual Home card, visible both in the bottom peek and in the expanded workspace. No duplicate or matched twin.
struct HomeWorkspaceCard: View {
    let name: String
    let summary: FilmSummary
    let expanded: Bool
    let open: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 0) {
                FilmThumbnail(name: name, poster: summary.poster)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 8) {
                    Text(summary.phase.homeLine).font(.system(size: 11, weight: .medium))
                        .foregroundStyle(summary.phase.callsForYou ? Color(nsColor: .systemOrange) : .secondary)
                        .lineLimit(1)
                    Text(name).font(.system(size: 15, weight: .semibold)).lineLimit(2, reservesSpace: true)
                        .foregroundStyle(.primary)
                    Text(HomeWorkspaceRules.detail(for: summary)).font(.system(size: 12)).foregroundStyle(.secondary)
                        .lineLimit(2, reservesSpace: true)
                    if let updated = updatedLine(summary) {
                        Text(updated).font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(1)
                    }
                    HStack {
                        Text(HomeWorkspaceRules.action(for: summary))
                        Spacer(minLength: 4)
                        Image(systemName: summary.isFinished ? "play.fill" : "arrow.right").font(.system(size: 10, weight: .semibold))
                    }
                    .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Color.primary)
                    .padding(.top, 8)
                }
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .modifier(HomeWorkspaceChrome(expanded: expanded))
            }
            .background {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.primary.opacity(hovering ? 0.065 : 0.025))
                    .modifier(HomeWorkspaceChrome(expanded: expanded))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Color.primary.opacity(hovering ? 0.18 : 0.065), lineWidth: 1)
                    .modifier(HomeWorkspaceChrome(expanded: expanded))
            }
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name). \(summary.phase.homeLine). \(HomeWorkspaceRules.action(for: summary))")
    }
}

struct HomeWorkspaceChrome: ViewModifier {
    let expanded: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content.opacity(expanded ? 1 : 0)
            .animation(reduceMotion ? .easeOut(duration: 0.15) : HomeTransitionMetrics.reveal(opening: expanded), value: expanded)
    }
}
