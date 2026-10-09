import StudioCore
import SwiftUI

/// Whose move it is, as a value so the live page and the fixtures feed the same view.
enum TurnState: Equatable {
    /// The person's call. `background` is what Claude is doing meanwhile (research runs in parallel with a call), if anything.
    case yourTurn(String, background: String?)
    case working(String, since: Date?)
    case paused
    /// Stopped or stuck in a way the person should look at (red).
    case attention(String)

    /// "Reading your brief" -> "reading your brief", but "HTML pages" stays as it is.
    static func sentenceCase(_ text: String) -> String {
        let chars = Array(text)
        guard let first = chars.first, first.isUppercase, !(chars.count > 1 && chars[1].isUppercase) else { return text }
        return first.lowercased() + String(chars.dropFirst())
    }
}

extension StudioStore {
    /// The one status statement for the open film, or nil when something else already says it (a recovery banner, Film progress)
    /// or there is nothing to say (drafts, finished films).
    var turnState: TurnState? {
        let health = monitor.run == runURL && monitor.hasData ? monitor.health : nil
        switch phase {
        case .yourTurn(let what):
            return .yourTurn(what, background: health?.state == .waitingForYou ? health?.background : nil)
        case .working, .starting:
            if health?.state == .possiblyLooping { return .attention(health?.loopReason ?? "It may be stuck.") }
            // "Ready for you: the animatic" is the director's last push, stale once you've answered: never show it as work.
            let activity = snapshot.latestActivity.flatMap { $0.hasPrefix("Ready for you") ? nil : $0 }
            let reading = snapshot.workingMessage == SessionOverlay.readingMessage ? snapshot.workingMessage : nil
            return .working(reading ?? activity ?? snapshot.workingMessage ?? "Your director is working on the film.", since: runtime.startedAt)
        case .paused: return .paused
        case .needsAttention: return .attention("The last session stopped unexpectedly. The log shows why.")
        default: return nil
        }
    }
}

/// One strip under the stage bar, and the only place that states the film's state: your turn, Claude working (and, with
/// your turn, what it does meanwhile), paused, or needs attention. The usage pill and the action bar never repeat it.
struct TurnLine: View {
    let state: TurnState
    var onDetails: (() -> Void)?
    var onPause: (() -> Void)?
    var onResume: (() -> Void)?
    @State private var lastActivityAt = Date()

    var body: some View {
        content
            .padding(.horizontal, 16).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background { ZStack { Rectangle().fill(.bar); Rectangle().fill(tint) } }
            .overlay(alignment: .bottom) { Divider() }
            .accessibilityElement(children: .combine)
            .onChange(of: state) { lastActivityAt = Date() }
    }

    private var tint: Color {
        switch state {
        case .yourTurn: Color.rasan.opacity(0.10)
        case .attention: Color(nsColor: .systemRed).opacity(0.10)
        default: .clear
        }
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .yourTurn(let what, let background):
            Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 4) {
                GridRow {
                    Image(systemName: "hand.raised.fill").foregroundStyle(Color.rasan).frame(width: 16)
                    Text("Your turn · \(what)").font(.system(size: 12.5, weight: .semibold))
                }
                if let background {
                    GridRow {
                        ProgressView().controlSize(.mini).frame(width: 16)
                        Text("Claude is \(TurnState.sentenceCase(background)) meanwhile. You don't need to wait.")
                            .font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
            }
        case .working(let activity, let since):
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let quiet = context.date.timeIntervalSince(lastActivityAt) > 120
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Claude is working · \(activity)").font(.system(size: 12.5, weight: .medium)).lineLimit(2).textSelection(.enabled)
                        if quiet {
                            Text("No new activity for two minutes. Check the log, or pause and resume if needed.")
                                .font(.system(size: 11)).foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 8)
                    if let since { Text(clockText(max(0, context.date.timeIntervalSince(since)))).font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit() }
                    if let onDetails { Button(quiet ? "Show log" : "Details", action: onDetails) }
                    if let onPause { Button("Pause", action: onPause) }
                }
            }
        case .paused:
            HStack(spacing: 10) {
                Image(systemName: "pause.circle.fill").foregroundStyle(.secondary).frame(width: 16)
                Text("Paused · your files are kept. Resume when you're ready.").font(.system(size: 12.5, weight: .medium))
                Spacer(minLength: 8)
                if let onResume { Button("Resume", action: onResume) }
            }
        case .attention(let text):
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color(nsColor: .systemRed)).frame(width: 16)
                Text(text).font(.system(size: 12.5, weight: .medium)).lineLimit(2)
                Spacer(minLength: 8)
                if let onDetails { Button("Show log", action: onDetails) }
                if let onResume { Button("Resume", action: onResume) }
            }
        }
    }
}
