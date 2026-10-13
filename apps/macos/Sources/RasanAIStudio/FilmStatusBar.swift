import StudioCore
import SwiftUI

/// The one bar at the bottom of the film page. Left: the single status line (whose turn it is, "Sent to Claude", looking back,
/// an error). Right: usage, then the step's actions ("Let Claude decide", the primary), which the stage publishes through
/// `FilmActionsKey`. Nothing else on the page repeats the status.
struct FilmStatusBar<Usage: View>: View {
    let model: FilmSessionModel
    var turn: TurnState?
    var actions: FilmActions?
    var onDetails: (() -> Void)?
    var onPause: (() -> Void)?
    var onResume: (() -> Void)?
    @ViewBuilder var usage: Usage
    @State private var lastActivityAt = Date()

    private var step: String { model.shownStep }
    private var sent: Bool { model.hasSent(step) && model.status(step) != "done" }
    private var hasNote: Bool { !model.tellText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        HStack(spacing: 12) {
            status
            Spacer(minLength: 8)
            usage.fixedSize()
            if let actions, !model.isViewingPast, !sent, model.showsActions(for: actions.step) { buttons(actions) }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
        .onChange(of: turn) { lastActivityAt = Date() }
    }

    // MARK: Status

    @ViewBuilder private var status: some View {
        if let error = model.lastError {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                Text(error).font(.system(size: 12)).lineLimit(2).help(error)
                Button("Dismiss") { model.dismissError() }.buttonStyle(.borderless).controlSize(.small)
            }
        } else if model.isViewingPast {
            HStack(spacing: 8) {
                Image(systemName: "clock.arrow.circlepath").foregroundStyle(.secondary)
                Text("Looking back at \(StepCatalog.label(model.shownStep))").font(.system(size: 12.5, weight: .medium)).lineLimit(1)
                Button("Back to now") { model.returnToLive() }.buttonStyle(.bordered).controlSize(.small)
            }
        } else if sent {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Sent to Claude. Waiting for the next update.").font(.system(size: 12.5)).foregroundStyle(.secondary).lineLimit(1)
            }
        } else if let turn {
            turnStatus(turn)
        }
    }

    @ViewBuilder private func turnStatus(_ turn: TurnState) -> some View {
        let full = [turn.headline, turn.secondary].compactMap { $0 }.joined(separator: ". ")
        switch turn {
        case .yourTurn:
            HStack(spacing: 8) {
                Circle().fill(Color.rasan).frame(width: 8, height: 8)
                Text(turn.headline).font(.system(size: 12.5, weight: .semibold)).lineLimit(1)
                if let secondary = turn.secondary {
                    Text(secondary).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1).layoutPriority(-1)
                }
            }.help(full)
        case .working(_, let since, _):
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let quiet = context.date.timeIntervalSince(lastActivityAt) > 120
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(turn.headline).font(.system(size: 12.5, weight: .medium)).lineLimit(1)
                    if quiet {
                        Text("No new activity for two minutes").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1).layoutPriority(-1)
                    } else if let secondary = turn.secondary {
                        Text(secondary).font(.system(size: 12)).foregroundStyle(Color.rasan).lineLimit(1).layoutPriority(-1)
                    }
                    if let since {
                        Text(clockText(max(0, context.date.timeIntervalSince(since)))).font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit()
                    }
                    if let onDetails { Button(quiet ? "Show log" : "Details", action: onDetails).buttonStyle(.borderless).controlSize(.small) }
                    if let onPause { Button("Pause", action: onPause).buttonStyle(.borderless).controlSize(.small) }
                }.help(full)
            }
        case .paused:
            HStack(spacing: 8) {
                Image(systemName: "pause.circle.fill").foregroundStyle(.secondary)
                Text(turn.headline).font(.system(size: 12.5, weight: .medium)).lineLimit(1)
                if let onResume { Button("Resume", action: onResume).buttonStyle(.borderless).controlSize(.small) }
            }
        case .attention:
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color(nsColor: .systemRed))
                Text(turn.headline).font(.system(size: 12.5, weight: .medium)).lineLimit(1).help(turn.headline)
                if let onDetails { Button("Show log", action: onDetails).buttonStyle(.borderless).controlSize(.small) }
                if let onResume { Button("Resume", action: onResume).buttonStyle(.borderless).controlSize(.small) }
            }
        }
    }

    // MARK: Actions

    @ViewBuilder private func buttons(_ actions: FilmActions) -> some View {
        let canAct = model.canAct(on: actions.step)
        let note = model.tellText.trimmingCharacters(in: .whitespacesAndNewlines)
        HStack(spacing: 10) {
            Divider().frame(height: 22)
            if hasNote {
                Label("With your note", systemImage: "text.bubble").font(.system(size: 11)).foregroundStyle(.secondary).labelStyle(.titleAndIcon)
                    .help("The note in the inspector goes to Claude with this.")
            }
            if let title = actions.secondaryTitle {
                Button(title) { actions.onSecondary(note) }
                    .buttonStyle(.bordered).controlSize(.large)
                    .disabled(!canAct || !actions.secondaryEnabled)
                    .help(actions.secondaryHelp ?? "")
            }
            if let title = actions.primaryTitle {
                Button { actions.onPrimary(note) } label: {
                    HStack(spacing: 6) {
                        if model.isSending { ProgressView().controlSize(.small) }
                        else if let symbol = actions.primarySymbol { Image(systemName: symbol) }
                        Text(title)
                    }.frame(minWidth: 96)
                }
                .buttonStyle(.borderedProminent).controlSize(.large)
                .keyboardShortcut(.defaultAction)
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
    var onDetails: (() -> Void)?
    var onPause: (() -> Void)?
    var onResume: (() -> Void)?
    @ViewBuilder var usage: Usage
    @ViewBuilder var content: Content
    @State private var actions: FilmActions?

    var body: some View {
        VStack(spacing: 0) {
            content.onPreferenceChange(FilmActionsKey.self) { actions = $0 }
            if visible {
                FilmStatusBar(model: model, turn: turn, actions: actions, onDetails: onDetails, onPause: onPause, onResume: onResume) { usage }
            }
        }
        // A note goes out with whatever was accepted (the note itself, or the call it rode along with).
        .onChange(of: model.sendCount) { model.tellText = "" }
    }
}
