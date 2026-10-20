import StudioCore
import SwiftUI

/// Whose move it is, as a value so the live page and the sample film feed the same view.
enum TurnState: Equatable {
    /// The person's call. `background` is what Claude is doing meanwhile (research runs in parallel with a call), if anything.
    case yourTurn(String, background: String?)
    case working(String, since: Date?, next: String? = nil)
    case paused
    /// Stopped or stuck in a way the person should look at (red).
    case attention(String)

    /// "Reading your brief" -> "reading your brief", but "HTML pages" stays as it is.
    /// "next: pick a look" -> "Next: pick a look".
    static func sentenceCaseFirst(_ text: String) -> String { text.prefix(1).uppercased() + text.dropFirst() }

    static func sentenceCase(_ text: String) -> String {
        let chars = Array(text)
        guard let first = chars.first, first.isUppercase, !(chars.count > 1 && chars[1].isUppercase) else { return text }
        return first.lowercased() + String(chars.dropFirst())
    }
}

extension TurnState {
    /// The one line that says whose move it is. The status bar and `TurnLine` both read it, so the wording lives here.
    func headline(agent: String = "Claude") -> String {
        switch self {
        case .yourTurn(let what, _): "Your turn · \(what)"
        case .working(let activity, _, _): "\(agent) is working · \(activity)"
        case .paused: "Paused · your files are kept. Resume when you're ready."
        case .attention(let text): text
        }
    }
    /// What goes with the headline: what Claude does meanwhile (your turn), or the next call (working).
    func secondary(agent: String = "Claude") -> String? {
        switch self {
        case .yourTurn(_, let background): background.map { "\(agent) is \(TurnState.sentenceCase($0)) meanwhile. You don't need to wait." }
        case .working(_, _, let next): next.map(TurnState.sentenceCaseFirst)
        default: nil
        }
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
            return .working(reading ?? activity ?? snapshot.workingMessage ?? "\(settings.agent.shortName) is working on your film.", since: runtime.startedAt,
                            next: NextNeeded.line(snapshot, pace: settings.pace))
        case .paused: return .paused
        case .needsAttention: return .attention("The last session stopped unexpectedly. The log shows why.")
        default: return nil
        }
    }
}

/// One strip above the status bar, and the only place that states the film's state: your turn, Claude working (and, with
/// your turn, what it does meanwhile), paused, or needs attention. The usage pill and the action bar never repeat it.
struct TurnLine: View {
    let state: TurnState
    @Environment(\.agentName) private var agent
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
        case .yourTurn: Color(nsColor: .systemOrange).opacity(0.10)
        case .attention: Color(nsColor: .systemRed).opacity(0.10)
        default: .clear
        }
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .yourTurn:
            Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 4) {
                GridRow {
                    Image(systemName: "hand.raised.fill").foregroundStyle(Color(nsColor: .systemOrange)).frame(width: 16)
                    Text(state.headline(agent: agent)).font(.system(size: 12, weight: .semibold))
                }
                if state.secondary(agent: agent) != nil {
                    GridRow {
                        ProgressView().controlSize(.mini).frame(width: 16)
                        Text(state.secondary(agent: agent) ?? "")
                            .font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
            }
        case .working(_, let since, _):
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let quiet = context.date.timeIntervalSince(lastActivityAt) > 120
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(state.headline(agent: agent)).font(.system(size: 12, weight: .medium)).lineLimit(2).textSelection(.enabled)
                        if let next = state.secondary(agent: agent) { Text(next).font(.system(size: 12)).foregroundStyle(Color.rasan) }
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
                Text(state.headline(agent: agent)).font(.system(size: 12, weight: .medium))
                Spacer(minLength: 8)
                if let onResume { Button("Resume", action: onResume) }
            }
        case .attention(let text):
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color(nsColor: .systemRed)).frame(width: 16)
                Text(text).font(.system(size: 12, weight: .medium)).lineLimit(2)
                Spacer(minLength: 8)
                if let onDetails { Button("Show log", action: onDetails) }
                if let onResume { Button("Resume", action: onResume) }
            }
        }
    }
}
