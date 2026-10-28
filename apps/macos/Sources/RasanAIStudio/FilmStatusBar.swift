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
    @State private var askCompact = false

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
                callChips
                status
                Spacer(minLength: 8)
                usage.fixedSize().padding(.trailing, 4)
                // The chat owns its composer while open; this field is the entry point when it is closed.
                if !model.decisionsPresented && !AskRasanFloatingChat.visible(model) {
                    AskRasanField(model: model, compact: $askCompact)
                }
                if let actions, !model.isViewingPast, !sent, model.showsActions(for: actions.step) { buttons(actions) }
                else if needsResume { resumeSlot }
            }
        }
        .animation(.snappy(duration: 0.2), value: AskRasanFloatingChat.visible(model))
        // A floating full-width pill of the same glass as the sidebar; content scrolls underneath it.
        .studioBottomBar()
        .onChange(of: turn) { lastActivityAt = Date() }
    }

    // MARK: Call chips

    /// What used to be the strip above the stage: the kind of media on screen, the "decided for you" mark, and build progress.
    @ViewBuilder private var callChips: some View {
        let route = model.route
        if let call = CreativeCall(route: route) {
            let kind = model.mediaKind(for: call)
            let inherited = CallJourney.states(model.snapshot).first { $0.call == call }?.source.flatMap { $0.isInherited ? $0 : nil }
            if kind != nil || inherited != nil {
                HStack(spacing: 6) {
                    if let kind {
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 6) {
                                MediaKindBadge(kind: kind)
                                if kind == .proxy { Text("The full-quality film comes next.").font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1) }
                            }
                            MediaKindBadge(kind: kind)
                            MediaKindBadge(kind: kind, iconOnly: true)
                        }
                    }
                    if let inherited {
                        Image(systemName: "arrow.triangle.branch").font(.system(size: 11)).foregroundStyle(.secondary)
                            .help("\(inherited.label). \(CallInheritedNote.help)").accessibilityLabel("\(inherited.label). \(CallInheritedNote.help)")
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(-1)
            }
        } else if CallJourney.isBuildProgress(route) && !model.isViewingPast {
            Image(systemName: "hammer").font(.system(size: 12)).foregroundStyle(.secondary)
                .help(CallJourney.buildCaption).accessibilityLabel(CallJourney.buildCaption)
        }
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

    /// The sentence for pressing the primary: what the call means, with the shortcut.
    private func primaryHelp(_ title: String) -> String {
        guard let call = CreativeCall(route: model.route) else { return "\(title) (⇧⌘↩)" }
        return "\(call.approvalMeaning) (⇧⌘↩)"
    }

    private var primaryHint: String {
        guard let call = CreativeCall(route: model.route) else { return "" }
        return "Call \(call.number) of \(CreativeCall.allCases.count), \(call.title). \(call.approvalMeaning)"
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
                .help(primaryHelp(title))
                .accessibilityHint(primaryHint)
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
    @State private var stageWidth: CGFloat = 1000
    @State private var askFieldWidth: CGFloat = 300
    @State private var askZones = AskClickZones()

    /// The conversation is as wide as the field row it grows from: at least 380pt, at most 560pt, never wider than the page.
    private var askWidth: CGFloat { min(max(askFieldWidth, 380), 560, max(240, stageWidth - 32)) }

    var body: some View {
        content.onPreferenceChange(FilmActionsKey.self) { actions = $0 }
            .preference(key: PageOwnsBottomBarKey.self, value: visible)
            .onGeometryChange(for: CGSize.self) { $0.size } action: { stageHeight = $0.height; stageWidth = $0.width }
            // A floating glass pill over the page: content scrolls underneath and can still scroll clear of it.
            // A clear gap above the bar so the panels never butt against it.
            .safeAreaInset(edge: .bottom, spacing: Workspace.gap) {
                if visible {
                    FilmStatusBar(model: model, turn: turn, actions: actions, onDetails: onDetails, onPause: onPause, onResume: onResume, usage: { usage }, stillWorking: stillWorking, remaining: remaining)
                        .onPreferenceChange(AskFieldWidthKey.self) { askFieldWidth = $0 }
                        .background { AskClickZone(zones: askZones, watches: true) }
                        // The conversation grows up out of the pill above its field, floating over the page.
                        .overlay(alignment: .topTrailing) {
                            AskRasanFloatingChat(model: model, width: askWidth, maxHeight: stageHeight * 0.55, zones: askZones)
                                .alignmentGuide(.top) { $0[.bottom] + 10 }
                                .padding(.trailing, 7)
                        }
                        .onAppear {
                            // A click anywhere else tucks the chat away, unless a draft is being typed.
                            askZones.onOutside = { [model] in
                                guard AskRasanFloatingChat.visible(model) else { return }
                                let typing = model.askFieldFocused && !model.tellText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                if !typing { model.askCardPresented = false }
                            }
                        }
                }
            }
        .onAppear { model.askComposerAvailable = visible }
        .onChange(of: visible) { _, shown in model.askComposerAvailable = shown }
        .onDisappear { model.askComposerAvailable = false }
        // A note goes out with whatever was accepted (the note itself, or the call it rode along with).
        .onChange(of: model.sendCount) { model.tellText = "" }
    }
}
