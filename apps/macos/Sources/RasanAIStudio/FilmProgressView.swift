import AppKit
import StudioCore
import SwiftUI

/// Film progress: the focused working screen. A header with the live phase, one large "now" sentence, elapsed and an honest
/// estimate, the render strip and latest preview. "View activity" opens the event list as a sheet. Everything reads
/// `FilmProgress.snapshot` and nothing is invented here: where the model cannot measure something, the view says so.
struct FilmProgressView: View {
    let model: FilmSessionModel
    let progress: FilmProgress
    var onPause: (() -> Void)?
    var onShowLog: (() -> Void)?
    var pace: FilmPace?
    /// The director stopped mid-film and Studio will resume it by itself (or when a plan limit resets).
    var autoResume: AutoResumeNotice?
    var onResumeNow: (() -> Void)?
    /// Nothing is running and nobody paused it: the person resumes it by hand.
    var onResume: (() -> Void)?
    /// The director is stopped by the person: the crew on stage snooze (as they do while a usage limit is waited out).
    var paused = false

    /// "View activity" opens the list of what has happened as a sheet; a card's "View details" opens that one event.
    @State private var showActivity = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.agentName) private var agent
    @State private var wrapSent = false
    @State private var wrapFailed = false
    /// Measured: the whole column and its crew stage, so the rows that need their natural height are known (column minus stage).
    @State private var columnHeight: CGFloat = 0
    @State private var stageHeight: CGFloat = 0

    /// The film is unfinished, nothing runs, and the person did not pause it: the director stopped and waits for Resume.
    private var stalled: Bool { progress.snapshot.directorIdle && !paused && autoResume == nil && !progress.isReplay }

    private var snapshot: FilmProgressSnapshot {
        var s = progress.snapshot
        // The person already answered (the app has it queued for the director) but session.json still says awaiting:
        // the header must agree with the status pill and stop asking.
        if s.isWaitingForYou, !progress.isReplay, !model.isFixture, !model.isWaitingOnUser {
            s.isWaitingForYou = false
            s.now = NowLine(phase: s.now.phase, kind: .thinking, text: "Sent to \(agent). Picking it up now", detail: nil, since: nil)
            for i in s.phases.indices where s.phases[i].state == .waitingForYou { s.phases[i].state = .active }
        }
        // The automatic resume is a line in the activity timeline too.
        if let notice = autoResume {
            s.activity.append(ProgressActivity(id: "auto-resume-\(Int(notice.since.timeIntervalSince1970))", time: notice.since, phase: s.currentPhase, kind: .warning, title: notice.text))
        }
        if stalled {
            s.now = NowLine(phase: s.now.phase, kind: .thinking, text: "\(agent) isn't working on this film right now", detail: nil, since: nil)
        }
        return s
    }

    var body: some View {
        GeometryReader { geo in
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let now = progress.isReplay ? progress.now : (progress.isLive ? context.date : progress.now)
                focused(now: now, visibleHeight: geo.size.height)
            }
        }
        .environment(model)
        .sheet(isPresented: $showActivity) {
            ProgressActivitySheet(snapshot: snapshot, onShowLog: onShowLog).tint(.rasan)
        }
        .onReceive(NotificationCenter.default.publisher(for: .studioCloseSheets)) { _ in showActivity = false }
        .onChange(of: model.activityRequest) { showActivity = true }   // "View activity" from the chat or the blocked banner
        .accessibilityElement(children: .contain)
    }

    private var activityToggle: some View {
        Button { showActivity = true } label: { Label("View activity", systemImage: "list.bullet.rectangle") }
            .controlSize(.small)
            .help("See what has happened so far, newest first")
    }

    // MARK: Focused working screen

    private func focused(now: Date, visibleHeight: CGFloat) -> some View {
        let s = snapshot
        // The screen is laid out to the height it has: the crew stage takes what the fixed rows leave. Only a really short
        // window falls back to scrolling.
        // Scrolling only when the measured fixed rows plus the stage's 180pt minimum no longer fit.
        let fixedRows = max(0, columnHeight - stageHeight) + 8
        let flexible = fixedRows + 180 <= visibleHeight
        let previewMax = min(300, max(80, visibleHeight * 0.2))
        return Group {
            if flexible {
                column(s, now: now, flexible: true, previewMax: previewMax)
                    .padding(.bottom, 8)
                    .frame(maxWidth: 860, alignment: .leading)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else {
                ScrollView {
                    column(s, now: now, flexible: false, previewMax: previewMax)
                        .padding(.bottom, 24)
                        .frame(maxWidth: 860, alignment: .leading)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func column(_ s: FilmProgressSnapshot, now: Date, flexible: Bool, previewMax: CGFloat) -> some View {
        column2(s, now: now, flexible: flexible, previewMax: previewMax)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { columnHeight = $0 }
    }

    private func column2(_ s: FilmProgressSnapshot, now: Date, flexible: Bool, previewMax: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 6) {
                Image(systemName: s.now.phase.symbolName).font(.system(size: 11, weight: .semibold))
                Text(s.now.phase.title.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(0.6)
                if let pace {
                    Text("\(pace.title) pace").font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
                        .padding(.horizontal, 7).padding(.vertical, 2).background(Color(nsColor: .quaternaryLabelColor).opacity(0.3), in: Capsule())
                }
                Spacer()
                activityToggle
                if let onPause { Button("Pause", action: onPause).controlSize(.small).help("Pause (⌘.). Your work is kept, and you can resume.") }
            }
            .foregroundStyle(s.isWaitingForYou ? Color.orange : Color.rasan)
            if let notice = autoResume { resumeBanner(notice, now: now) }
            if stalled { stalledBanner }
            crewStage(s, now: now, flexible: flexible)
            researchNotice(s, now: now)
            activityWarning(s)
            ProgressRenderStrip(render: s.render, now: now)
            ProgressPreviewPane(snapshot: s, aspect: model.snapshot.aspectRatio, maxMediaHeight: previewMax)
            nextRow(s)
        }
    }

    /// The crew member on stage with the real work around them, and under it the one line of what is happening. While a decision
    /// waits, the same character stands to the side and asks it in one speech bubble. The stage is the flexible part: it takes the
    /// height the other rows leave and the character and bubbles scale to it.
    @ViewBuilder private func crewStage(_ s: FilmProgressSnapshot, now: Date, flexible: Bool) -> some View {
        let lead = NowCrewAvatar.lead(for: s)
        let asleep = paused || stalled || autoResume?.isLimit == true
        let timing = HStack(spacing: 14) {
            Text(Self.clock(s.elapsed(now: now)) + " elapsed").font(.system(size: 13, weight: .semibold, design: .rounded)).monospacedDigit()
                .help("Working time. Time the director was not running (a plan limit, a pause, the app closed) and your calls are left out.")
                .accessibilityLabel("Elapsed \(FilmProgressFormat.duration(s.elapsed(now: now)))")
            estimate(s)
        }
        if s.isWaitingForYou {
            VStack(alignment: .leading, spacing: 8) {
                CrewAskRow(character: lead, text: s.now.text)
                    .contentTransition(.opacity).animation(reduceMotion ? nil : .smooth, value: s.now.text)
                timing
            }
            .onAppear { stageHeight = 0 }
        } else {
            VStack(spacing: 8) {
                if flexible {
                    GeometryReader { geo in stageArt(s, lead: lead, asleep: asleep, height: geo.size.height).frame(width: geo.size.width, height: geo.size.height, alignment: .bottom) }
                        .frame(minHeight: 180, maxHeight: .infinity)
                        .layoutPriority(-1)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { stageHeight = $0 }
                } else {
                    stageArt(s, lead: lead, asleep: asleep, height: 300)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { stageHeight = $0 }
                }
                VStack(spacing: 4) {
                    Text(Self.crewLine(lead, s)).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1).multilineTextAlignment(.center)
                    Text(s.now.text)
                        .font(.system(size: 26, weight: .semibold)).tracking(-0.3)
                        .lineLimit(2).minimumScaleFactor(0.8).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        .contentTransition(.opacity).animation(reduceMotion ? nil : .smooth, value: s.now.text)
                        .accessibilityAddTraits(.isHeader)
                    timing
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    /// The character and bubbles at `height`: bubble room above the head shrinks with the stage, the character keeps its design size at most.
    private func stageArt(_ s: FilmProgressSnapshot, lead: CrewCharacter, asleep: Bool, height h: CGFloat) -> some View {
        let headroom = min(150, h * 0.32)
        let unit = max(40, min(320, h - headroom))
        return CrewStage(character: lead, thoughts: CrewThoughts.make(s, lead: lead), asleep: asleep,
                         lines: lead == .kavi ? CrewThoughts.finishedSteps(s) : 0,
                         picture: lead == .chitra || lead == .rasika ? CrewThoughts.newestPicture(s) : nil, unit: unit,
                         stageHeight: min(h, unit + headroom))
            .id(lead)
            .frame(maxWidth: .infinity)
            .help("\(lead.displayName), \(lead.roleTitle)")
    }

    /// "Kavi · 3 writers drafting": the character, then what the crew is doing as the model words it, else their role.
    private static func crewLine(_ lead: CrewCharacter, _ s: FilmProgressSnapshot) -> String {
        if let detail = s.now.detail, !detail.isEmpty { return "\(lead.displayName) · \(detail)" }
        let running = s.crew.filter { $0.state == .running && $0.character == lead }.count
        return running > 1 ? "\(lead.displayName) · \(running) helpers working" : "\(lead.displayName) · \(lead.roleTitle)"
    }

    @ViewBuilder private func nextRow(_ s: FilmProgressSnapshot) -> some View {
        let needed = s.isWaitingForYou ? nil : NextNeeded.line(model.snapshot, pace: pace)
        if needed != nil || s.nextCheckpoint != nil {
            VStack(alignment: .leading, spacing: 4) {
                if let needed {
                    Label(TurnState.sentenceCaseFirst(needed), systemImage: "hand.raised").font(.system(size: 13, weight: .medium)).foregroundStyle(Color.rasan)
                        .accessibilityLabel("You are needed next: \(needed)")
                } else if let checkpoint = s.nextCheckpoint {
                    Text(checkpoint).font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
        }
    }

    /// What the director logged beyond the plan, by how much it asks of the person (ActivityNotes decides). Small adjustments
    /// (info) are one quiet grey line for the whole film; the latest notice, or the latest line that needs the person or failed,
    /// in the current phase gets a card in plain words. Every one keeps its original message behind "Show original message".
    /// The automatic-resume line has its own banner, so it is left out here.
    @ViewBuilder private func activityWarning(_ s: FilmProgressSnapshot) -> some View {
        let adjustments = s.activity.filter { $0.severity == .info }
        let latest = s.activity
            .filter { ($0.severity.map { $0 >= .notice } ?? ($0.kind == .warning)) && $0.phase == s.currentPhase && !$0.id.hasPrefix("auto-resume-") }
            .max { ($0.severity ?? .error, $0.time) < ($1.severity ?? .error, $1.time) }
        if let latest {
            ActivityNoticeCard(item: latest, snapshot: snapshot, onShowLog: onShowLog)
        }
        if !adjustments.isEmpty {
            QuietAdjustmentsRow(items: adjustments)
        }
    }

    /// The research budget warning, kept visible while the research card is folded away. Wrap up is right here, so the person
    /// never has to leave the working screen for the progress list to act on it.
    @ViewBuilder private func researchNotice(_ s: FilmProgressSnapshot, now: Date) -> some View {
        let research = s.research
        if s.summary(.research).state == .active, research.endedAt == nil, let budget = research.budget,
           research.sourceCount > budget.sources || research.elapsed(now: now) > budget.seconds {
            VStack(alignment: .leading, spacing: 8) {
                Label("Past the research budget. You can wrap up research to move on with what has been read.",
                      systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
                if wrapSent {
                    Label("Sent. \(agent) will wrap up.", systemImage: "paperplane.fill").font(.system(size: 12)).foregroundStyle(.secondary)
                } else if let step = ResearchTimeBox.noteStep(in: model.snapshot) {
                    HStack(spacing: 10) {
                        Button {
                            Task {
                                let ok = await model.send(step: step, type: "note", note: ResearchTimeBox.noteText)
                                wrapSent = ok; wrapFailed = !ok
                            }
                        } label: { Label("Wrap up research", systemImage: "checkmark.circle") }
                            .controlSize(.small)
                            .help("Tells \(agent) to stop reading and go with what it has.")
                        if wrapFailed { Text("Couldn't send. Try again.").font(.system(size: 11)) }
                    }
                }
            }
            .foregroundStyle(.orange)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
    }

    private func resumeBanner(_ notice: AutoResumeNotice, now: Date) -> some View {
        HStack(spacing: 8) {
            Image(systemName: notice.isLimit ? "hourglass" : "arrow.clockwise.circle.fill").font(.system(size: 13, weight: .semibold))
            Text(notice.text).font(.system(size: 12, weight: .medium)).fixedSize(horizontal: false, vertical: true)
            if let at = notice.resumesAt, at > now, notice.isLimit {
                Text("Resumes by itself at \(at.formatted(date: .omitted, time: .shortened)) while RasanAI is open.").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if let onResumeNow { Button("Resume now", action: onResumeNow).controlSize(.small) }
        }
        .foregroundStyle(Color.orange)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .padding(.bottom, 10)
        .accessibilityElement(children: .combine)
    }

    /// Nothing runs and nobody paused it: say the director stopped, and offer Resume as the one action.
    private var stalledBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "pause.circle.fill").font(.system(size: 13, weight: .semibold))
            VStack(alignment: .leading, spacing: 2) {
                Text("\(agent) stopped working on this film").font(.system(size: 13, weight: .semibold))
                Text("Your work is saved. Press Resume and it carries on from where it left off.").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if let onResume { Button("Resume", action: onResume).buttonStyle(.rasanPrimary).controlSize(.regular) }
        }
        .foregroundStyle(Color.orange)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .padding(.bottom, 10)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func estimate(_ s: FilmProgressSnapshot) -> some View {
        if s.isWaitingForYou {
            Label("Waiting for you", systemImage: "person.fill.questionmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(.orange)
        } else if s.directorIdle {
            if paused {
                Label("Paused", systemImage: "pause.circle").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
            } else if autoResume?.isLimit == true {
                Label("Waiting for your plan limit to reset", systemImage: "hourglass").font(.system(size: 12, weight: .semibold)).foregroundStyle(.orange)
            } else {
                Label("Not running", systemImage: "stop.circle").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
            }
        } else if let remaining = s.remaining {
            HStack(spacing: 5) {
                Text(Self.estimateText(remaining)).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.rasan)
                Text(Self.basisNote(remaining)).font(.system(size: 11)).foregroundStyle(.tertiary)
            }
            .help(Self.basisHelp(remaining))
            .accessibilityElement(children: .combine)
        }
    }

    /// A measured estimate is quoted as the model gives it; one that only rests on how long films usually take is rounded coarsely,
    /// because "2 h 55 min" would promise more than anyone knows.
    nonisolated static func basisNote(_ e: PhaseEstimate) -> String {
        switch e.basis {
        case .measured: "· from progress so far, not counting your calls"
        case .learned: "· from your past films, not counting your calls"
        case .typical: "· based on typical films, not counting your calls"
        }
    }

    nonisolated static func basisHelp(_ e: PhaseEstimate) -> String {
        let calls = " It leaves out the time you spend on your calls (picking a script or look, reviewing the storyboard)."
        switch e.basis {
        case .measured: return "Worked out from what has been built or rendered so far." + calls
        case .learned: return "Worked out from how long your earlier films took, scaled to this one. A range means there is not enough history to be sure." + calls
        case .typical: return "A typical figure for these stages. It firms up once there is progress to measure or past films to learn from." + calls
        }
    }

    nonisolated static func estimateText(_ estimate: PhaseEstimate) -> String {
        if estimate.isRange, let low = estimate.lowSeconds, let high = estimate.highSeconds {
            let text = FilmProgressFormat.aboutRange(low, high)
            return "Roughly " + text.dropFirst("about ".count) + " left"
        }
        if estimate.basis == .measured {
            let text = estimate.text
            return text.prefix(1).uppercased() + text.dropFirst() + " left"
        }
        let seconds = estimate.secondsLeft
        let minutes = Int((seconds / 60).rounded())
        let rounded: Int
        switch minutes {
        case ..<1: return "Under a minute left"
        case 1..<10: rounded = minutes
        case 10..<60: rounded = Int((Double(minutes) / 5).rounded()) * 5
        default: rounded = Int((Double(minutes) / 15).rounded()) * 15
        }
        let text = rounded < 60 ? "\(rounded) min" : (rounded % 60 == 0 ? "\(rounded / 60) h" : "\(rounded / 60) h \(rounded % 60) min")
        return "Roughly \(text) left"
    }

    nonisolated static func clock(_ seconds: TimeInterval) -> String {
        let total = Int(max(0, seconds).rounded())
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}

extension ProgressPhase {
    /// The person's call this phase ends in, if any: the calls live on this list while Claude works.
    var yourCall: String? {
        switch self {
        case .script: "pick a story"
        case .look: "pick a look"
        case .animatic: "notes on the storyboard"
        case .render: "review the final"
        default: nil
        }
    }
}
