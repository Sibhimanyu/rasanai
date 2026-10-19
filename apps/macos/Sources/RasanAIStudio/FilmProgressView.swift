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

    /// "View activity" opens the list of what has happened as a sheet; a warning's "View details" opens that one event.
    @State private var showActivity = false
    @State private var detailItem: ProgressActivity?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.agentName) private var agent
    @State private var wrapSent = false
    @State private var wrapFailed = false

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
        return s
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let now = progress.isReplay ? progress.now : (progress.isLive ? context.date : progress.now)
            focused(now: now)
        }
        .environment(model)
        .sheet(isPresented: $showActivity) {
            ProgressActivitySheet(snapshot: snapshot, onShowLog: onShowLog).tint(.rasan)
        }
        .accessibilityElement(children: .contain)
    }

    private var activityToggle: some View {
        Button { showActivity = true } label: { Label("View activity", systemImage: "list.bullet.rectangle") }
            .controlSize(.small)
            .help("See what has happened so far, newest first")
    }

    // MARK: Focused working screen

    private func focused(now: Date) -> some View {
        let s = snapshot
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
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
                HStack(alignment: .center, spacing: 18) {
                    NowCrewAvatar(snapshot: s)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(s.now.text)
                            .font(.system(size: 24, weight: .semibold)).tracking(-0.2)
                            .lineLimit(3).fixedSize(horizontal: false, vertical: true)
                            .contentTransition(.opacity).animation(reduceMotion ? nil : .smooth, value: s.now.text)
                            .accessibilityAddTraits(.isHeader)
                        if let detail = s.now.detail, !detail.isEmpty {
                            Text(detail).font(.system(size: 14)).foregroundStyle(.secondary).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                        }
                        HStack(spacing: 14) {
                            Text(Self.clock(s.elapsed(now: now)) + " elapsed").font(.system(size: 13, weight: .semibold, design: .rounded)).monospacedDigit()
                                .accessibilityLabel("Elapsed \(FilmProgressFormat.duration(s.elapsed(now: now)))")
                            estimate(s)
                        }
                        .padding(.top, 2)
                    }
                }
                researchNotice(s, now: now)
                activityWarning(s)
                ProgressRenderStrip(render: s.render, now: now)
                ProgressPreviewPane(snapshot: s, aspect: model.snapshot.aspectRatio)
                nextRow(s)
            }
            .padding(.horizontal, 28).padding(.top, 14).padding(.bottom, 28)
            .frame(maxWidth: 860, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
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

    /// The latest warning logged in the current phase, as the log words it. It is a note, not a claim that anything is still
    /// blocked. The automatic-resume line has its own banner, so it is left out here.
    @ViewBuilder private func activityWarning(_ s: FilmProgressSnapshot) -> some View {
        let latest = s.activity
            .filter { $0.kind == .warning && $0.phase == s.currentPhase && !$0.id.hasPrefix("auto-resume-") }
            .max { $0.time < $1.time }
        if let latest {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Label("Activity warning", systemImage: "exclamationmark.triangle.fill").font(.system(size: 12, weight: .semibold))
                    Text(latest.time.formatted(date: .omitted, time: .shortened)).font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Text(latest.title).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
                Button("View details") { detailItem = latest }
                    .controlSize(.small)
                    .popover(item: $detailItem, arrowEdge: .bottom) { item in
                        ProgressActivityDetail(item: item, snapshot: snapshot, onShowLog: onShowLog)
                    }
            }
            .foregroundStyle(.orange)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .accessibilityElement(children: .combine)
        }
    }

    /// The research budget warning, kept visible while the research card is folded away. Wrap up is right here, so the person
    /// never has to leave the working screen for the phase rail to act on it.
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

    @ViewBuilder private func estimate(_ s: FilmProgressSnapshot) -> some View {
        if s.isWaitingForYou {
            Label("Waiting for you", systemImage: "person.fill.questionmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(.orange)
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
        let calls = " It leaves out the time you spend on your calls (picking a script or look, reviewing the animatic)."
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
    /// The person's call this phase ends in, if any: the five calls live on this list while Claude works.
    var yourCall: String? {
        switch self {
        case .script: "pick a story"
        case .look: "pick a look"
        case .animatic: "notes on the animatic"
        case .render: "review the final"
        default: nil
        }
    }
}
