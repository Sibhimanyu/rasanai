import StudioCore
import SwiftUI

/// The one bar at the bottom of the film page. Left: the single status line (whose turn it is, "Sent to <agent>", looking back,
/// an error row above it). Right: usage, then the step's actions ("Let <agent> decide", the primary), which the stage publishes through
/// `FilmActionsKey`; when the film is paused or stuck, the right side is Resume instead. Nothing else on the page repeats the status.
struct FilmStatusBar<Usage: View>: View {
    let model: FilmSessionModel
    var turn: TurnState?
    var actions: FilmActions?
    var onDetails: (() -> Void)?
    var onPause: (() -> Void)?
    var onResume: (() -> Void)?
    @ViewBuilder var usage: Usage
    /// The monitor sees a tool or model call still running (a render can go most of an hour), so silence is not "no activity".
    var stillWorking = false
    /// The film progress snapshot's overall estimate; nil when there is none yet.
    var remaining: PhaseEstimate?
    @Environment(\.agentName) private var agent
    @State private var lastActivityAt = Date()
    @State private var sentSeenAt = Date()

    private var step: String { model.shownStep }
    private var sent: Bool { model.hasSent(step) && model.status(step) != "done" }
    private var hasNote: Bool { !model.tellText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    /// Paused or stuck: no call is waiting, so the bar's right side offers the way on.
    private var needsResume: Bool {
        guard actions == nil, onResume != nil, let turn else { return false }
        switch turn { case .paused, .attention: return true; default: return false }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // An error sits above the status instead of replacing it, so whose turn it is (and Pause) stay visible.
            if let error = model.lastError { errorRow(error) }
            HStack(spacing: 12) {
                status
                Spacer(minLength: 8)
                usage.fixedSize().padding(.trailing, 4)
                if let actions, !model.isViewingPast, !sent, model.showsActions(for: actions.step) { buttons(actions) }
                else if needsResume { resumeSlot }
                AskRasanField(model: model)
            }
        }
        .padding(.leading, 16).padding(.trailing, 7).padding(.vertical, model.lastError == nil ? 7 : 9)
        .frame(maxWidth: .infinity, minHeight: 44)
        // A floating full-width pill of the same glass as the sidebar; content scrolls underneath it.
        .glassPanel(radius: 20)
        .onChange(of: turn) { lastActivityAt = Date() }
    }

    // MARK: Status

    private func errorRow(_ error: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            Text("Couldn't send: \(error)").font(.system(size: 12)).lineLimit(2).help(error)
            Button("Dismiss") { model.dismissError() }.buttonStyle(.borderless).controlSize(.small)
        }
    }

    @ViewBuilder private var status: some View {
        if model.isViewingPast {
            LookingBackControls(model: model)
        } else if sent, let onResume {
            // Sent, but no director is running to pick it up (quit, crashed or paused): say so and offer the way on.
            HStack(spacing: 8) {
                Image(systemName: "pause.circle.fill").foregroundStyle(Color(nsColor: .systemOrange))
                Text("Sent to Rasan, but the director is stopped.").font(.system(size: 12, weight: .medium)).lineLimit(1)
                Button("Resume", action: onResume).buttonStyle(.rasanSecondary).controlSize(.small)
                    .help("Start the director again. It picks up your message where it left off.")
            }
        } else if sent {
            sentStatus
        } else if let turn {
            turnStatus(turn)
        }
    }

    /// When the action went out: the engine's timestamp on the step's `sent`, else when this bar first saw it.
    private var sentAt: Date {
        guard let ts = model.snapshot.step(step)["sent"]["ts"].string else { return sentSeenAt }
        let plain = ISO8601DateFormatter()
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: ts) ?? plain.date(from: ts) ?? sentSeenAt
    }

    /// An action is queued: say whether the engine has picked it up, how long it has been, and the ETA when one exists.
    private var sentStatus: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let elapsed = max(0, context.date.timeIntervalSince(sentAt))
            let label = StepCatalog.label(step)
            let quiet = stillWorking ? false : elapsed > 120
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                if stillWorking {
                    Text("\(agent) is working · \(label)").font(.system(size: 12, weight: .medium)).lineLimit(1)
                    if let remaining {
                        Text(FilmProgressView.estimateText(remaining)).font(.system(size: 12)).foregroundStyle(Color.rasan).lineLimit(1).layoutPriority(-1)
                    } else {
                        Text("No estimate yet").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1).layoutPriority(-1)
                    }
                } else {
                    Text("Waiting for \(agent) to pick this up").font(.system(size: 12, weight: .medium)).lineLimit(1)
                    Text(quiet ? "Nothing yet after two minutes" : "\(label) sent").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1).layoutPriority(-1)
                }
                Text(clockText(elapsed)).font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit()
                if let onDetails { Button(quiet ? "Show log" : "Details", action: onDetails).buttonStyle(.borderless).controlSize(.small) }
                // The director is running here too, so the way to stop it stays in reach (⌘.).
                if let onPause {
                    Button("Pause", action: onPause).buttonStyle(.borderless).controlSize(.small)
                        .help("Pause the director. Your files are kept; Resume carries on (⌘.)")
                }
            }
        }
        .onAppear { sentSeenAt = Date() }
        .onChange(of: step) { sentSeenAt = Date() }
    }

    @ViewBuilder private func turnStatus(_ turn: TurnState) -> some View {
        let headline = turn.headline(agent: agent)
        let secondary = turn.secondary(agent: agent)
        let full = [headline, secondary].compactMap { $0 }.joined(separator: ". ")
        switch turn {
        case .yourTurn:
            HStack(spacing: 8) {
                Circle().fill(Color(nsColor: .systemOrange)).frame(width: 8, height: 8)
                Text(headline).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                if let secondary {
                    Text(secondary).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1).layoutPriority(-1)
                }
            }.help(full)
        case .working(_, let since, _):
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let quiet = !stillWorking && context.date.timeIntervalSince(lastActivityAt) > 120
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(headline).font(.system(size: 12, weight: .medium)).lineLimit(1)
                    if quiet {
                        Text("No new activity for two minutes").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1).layoutPriority(-1)
                    } else if let secondary {
                        Text(secondary).font(.system(size: 12)).foregroundStyle(Color.rasan).lineLimit(1).layoutPriority(-1)
                    }
                    if let since {
                        Text(clockText(max(0, context.date.timeIntervalSince(since)))).font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit()
                    }
                    if let onDetails { Button(quiet ? "Show log" : "Details", action: onDetails).buttonStyle(.borderless).controlSize(.small) }
                    if let onPause { Button("Pause", action: onPause).buttonStyle(.borderless).controlSize(.small).help("Pause the director. Your files are kept; Resume carries on (⌘.)") }
                }.help(quiet ? "No new activity for two minutes. Check the log, or pause and resume if needed." : full)
            }
        case .paused:
            HStack(spacing: 8) {
                Image(systemName: "pause.circle.fill").foregroundStyle(.secondary)
                Text(headline).font(.system(size: 12, weight: .medium)).lineLimit(1)
            }
        case .attention:
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color(nsColor: .systemRed))
                Text(headline).font(.system(size: 12, weight: .medium)).lineLimit(1).help(headline)
            }
        }
    }

    // MARK: Actions

    /// Paused or stuck: Resume is the bar's primary, where every other state puts its own.
    @ViewBuilder private var resumeSlot: some View {
        HStack(spacing: 10) {
            if case .attention = turn, let onDetails { Button("Show log", action: onDetails).buttonStyle(.rasanSecondary).controlSize(.large) }
            Button { onResume?() } label: { Label("Resume", systemImage: "play.fill").font(.system(size: 13, weight: .semibold)).padding(.horizontal, 4).frame(minHeight: 24) }
                .buttonStyle(.rasanPrimary).controlSize(.large)
                .keyboardShortcut(.return, modifiers: [.command, .shift])
                .help("Resume (⇧⌘↩)")
        }
    }

    @ViewBuilder private func buttons(_ actions: FilmActions) -> some View {
        let canAct = model.canAct(on: actions.step)
        let note = model.tellText.trimmingCharacters(in: .whitespacesAndNewlines)
        HStack(spacing: 10) {
            if hasNote {
                Label("Your message goes too", systemImage: "text.bubble").font(.system(size: 11)).foregroundStyle(.secondary).labelStyle(.titleAndIcon)
                    .help("The message in the inspector is sent with this.")
            }
            if let title = actions.secondaryTitle {
                Button(title) { actions.onSecondary(note) }
                    .buttonStyle(.rasanSecondary).controlSize(.large)
                    .disabled(!canAct || !actions.secondaryEnabled)
                    .help(actions.secondaryHelp ?? "")
            }
            if let title = actions.primaryTitle {
                Button { actions.onPrimary(note) } label: {
                    HStack(spacing: 8) {
                        Text(title)
                        if model.isSending { ProgressView().controlSize(.small) }
                        else { Image(systemName: "arrow.right") }
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .padding(.horizontal, 4).frame(minWidth: 110, minHeight: 24)
                }
                // ⇧⌘↩, not plain Return: Return while typing a message must never approve a call by accident.
                .buttonStyle(.rasanPrimary).controlSize(.regular)
                .keyboardShortcut(.return, modifiers: [.command, .shift])
                .help("\(title) (⇧⌘↩)")
                .disabled(!canAct || !actions.primaryEnabled)
            }
        }
    }
}


/// Lays the film page's content above the one status bar and collects the actions the stage publishes for it.
struct FilmStatusBarHost<Content: View, Usage: View>: View {
    let model: FilmSessionModel
    /// False on pages with nothing to say or do at the bottom (drafts, the starting screen).
    var visible = true
    var turn: TurnState?
    var stillWorking = false
    var remaining: PhaseEstimate?
    var onDetails: (() -> Void)?
    var onPause: (() -> Void)?
    var onResume: (() -> Void)?
    @ViewBuilder var usage: Usage
    @ViewBuilder var content: Content
    @State private var actions: FilmActions?
    @State private var stageHeight: CGFloat = 800

    var body: some View {
        content.onPreferenceChange(FilmActionsKey.self) { actions = $0 }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { stageHeight = $0 }
            // A floating glass pill over the page: content scrolls underneath and can still scroll clear of it.
            // A clear gap above the bar so the panels never butt against it.
            .safeAreaInset(edge: .bottom, spacing: Workspace.gap) {
                if visible {
                    FilmStatusBar(model: model, turn: turn, actions: actions, onDetails: onDetails, onPause: onPause, onResume: onResume, usage: { usage }, stillWorking: stillWorking, remaining: remaining)
                        // The chat card grows up out of the pill, anchored at its right end, floating over the page.
                        .overlay(alignment: .topTrailing) {
                            AskRasanChatCard(model: model, maxHeight: stageHeight * 0.6)
                                .alignmentGuide(.top) { $0[.bottom] + 8 }
                                .padding(.trailing, 7)
                        }
                }
            }
        // A note goes out with whatever was accepted (the note itself, or the call it rode along with).
        .onChange(of: model.sendCount) { model.tellText = "" }
    }
}
