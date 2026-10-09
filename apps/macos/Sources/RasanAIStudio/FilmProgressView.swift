import AppKit
import StudioCore
import SwiftUI

/// Film progress: what the director is doing right now, in eight phases. Replaces the old single "Director working" line.
///
/// Layout (fits 1000x700): a header with one large "now" sentence, elapsed and an honest estimate; a vertical phase rail with
/// durations and cost; the selected phase's detail card (sources, key frames, scenes, drafts, render); then the activity
/// timeline grouped by phase, with the raw details one click away. Everything reads `FilmProgress.snapshot` and nothing is
/// invented here: where the model cannot measure something, the view says so.
struct FilmProgressView: View {
    let model: FilmSessionModel
    let progress: FilmProgress
    var onPause: (() -> Void)?
    var onShowLog: (() -> Void)?
    var pace: FilmPace?

    /// The phase the person clicked, or `nil` to follow the live one.
    @State private var selected: ProgressPhase?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var snapshot: FilmProgressSnapshot { progress.snapshot }
    private var shown: ProgressPhase { selected ?? snapshot.currentPhase }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let now = progress.isReplay ? progress.now : (progress.isLive ? context.date : progress.now)
            VStack(spacing: 0) {
                header(now: now)
                Divider()
                HStack(spacing: 0) {
                    PhaseRail(snapshot: snapshot, now: now, shown: shown, onSelect: choose)
                        .frame(width: 244)
                    Divider()
                    ScrollView {
                        VStack(alignment: .leading, spacing: 26) {
                            if shown != snapshot.currentPhase { lookingBack }
                            PhaseDetailCard(model: model, snapshot: snapshot, phase: shown, now: now)
                                .id(shown)
                                .transition(.opacity)
                            ProgressTimeline(snapshot: snapshot, now: now, shown: shown, onShowLog: onShowLog)
                        }
                        .padding(.horizontal, 28).padding(.top, 22).padding(.bottom, 32)
                        .frame(maxWidth: 860, alignment: .leading)
                        .frame(maxWidth: .infinity)
                        .animation(reduceMotion ? nil : .smooth(duration: 0.3), value: shown)
                    }
                }
            }
        }
        .environment(model)
        .accessibilityElement(children: .contain)
    }

    private func choose(_ phase: ProgressPhase) {
        selected = phase == snapshot.currentPhase ? nil : phase
    }

    private var lookingBack: some View {
        HStack(spacing: 10) {
            Image(systemName: "clock.arrow.circlepath").foregroundStyle(.secondary)
            Text("Looking back at \(shown.title). The film is on \(snapshot.currentPhase.title).").font(.system(size: 12.5))
            Spacer()
            Button("Back to now") { selected = nil }.controlSize(.small)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .background(Color.rasan.opacity(0.09), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    // MARK: Header

    private func header(now: Date) -> some View {
        let s = snapshot
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: s.now.phase.symbolName).font(.system(size: 11, weight: .semibold))
                Text("\(s.now.phase.title) · step \(s.now.phase.index + 1) of \(ProgressPhase.allCases.count)".uppercased())
                    .font(.system(size: 11, weight: .semibold)).tracking(0.6)
                if let pace {
                    Text("\(pace.title) pace").font(.system(size: 10.5, weight: .medium)).foregroundStyle(.secondary)
                        .padding(.horizontal, 7).padding(.vertical, 2).background(Color(nsColor: .quaternaryLabelColor).opacity(0.3), in: Capsule())
                        .help("How much research and checking this film was set up for. Change it in Settings or New film.")
                }
                Spacer()
                if let onShowLog { Button("Log", action: onShowLog).controlSize(.small).help("Open the director's full log") }
                if let onPause { Button("Pause", action: onPause).controlSize(.small).help("Stops the director safely. Your work is kept, and you can resume.") }
            }
            .foregroundStyle(s.isWaitingForYou ? Color.orange : Color.rasan)
            .padding(.bottom, 6)
            HStack(alignment: .firstTextBaseline, spacing: 28) {
                Text(s.now.text)
                    .font(.system(size: 28, weight: .semibold)).tracking(-0.3)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    .contentTransition(.opacity).animation(reduceMotion ? nil : .smooth, value: s.now.text)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(Self.clock(s.elapsed(now: now)))
                        .font(.system(size: 22, weight: .semibold, design: .rounded)).monospacedDigit()
                        .accessibilityLabel("Elapsed \(FilmProgressFormat.duration(s.elapsed(now: now)))")
                    Text("elapsed").font(.system(size: 11)).foregroundStyle(.secondary)
                }
                .fixedSize()
            }
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                if let detail = s.now.detail, !detail.isEmpty {
                    Text(detail).font(.system(size: 14)).foregroundStyle(.secondary).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 12)
                estimate(s)
            }
            .padding(.top, 6)
        }
        .padding(.horizontal, 28).padding(.top, 14).padding(.bottom, 16)
    }

    @ViewBuilder private func estimate(_ s: FilmProgressSnapshot) -> some View {
        if s.isWaitingForYou {
            Label("Waiting for you", systemImage: "person.fill.questionmark").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(.orange)
        } else if let remaining = s.remaining {
            HStack(spacing: 5) {
                Text(Self.estimateText(remaining)).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Color.rasan)
                Text(remaining.basis == .measured ? "· from progress so far" : "· based on typical films").font(.system(size: 11.5)).foregroundStyle(.tertiary)
            }
            .help(remaining.basis == .measured ? "Worked out from what has been built or rendered so far." : "A typical figure for these stages. It firms up once there is progress to measure.")
            .accessibilityElement(children: .combine)
        }
    }

    /// A measured estimate is quoted as the model gives it; one that only rests on how long films usually take is rounded coarsely,
    /// because "2 h 55 min" would promise more than anyone knows.
    nonisolated static func estimateText(_ estimate: PhaseEstimate) -> String {
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

// MARK: - Phase rail

struct PhaseRail: View {
    let snapshot: FilmProgressSnapshot
    let now: Date
    let shown: ProgressPhase
    let onSelect: (ProgressPhase) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(Array(snapshot.phases.enumerated()), id: \.element.id) { index, item in
                    PhaseRailRow(item: item, now: now, selected: item.phase == shown, isLast: index == snapshot.phases.count - 1,
                                 nextDone: index + 1 < snapshot.phases.count && snapshot.phases[index + 1].state != .upcoming) {
                        onSelect(item.phase)
                    }
                }
                if snapshot.totalCostUSD > 0 || snapshot.totalTokens.fresh > 0 {
                    Divider().padding(.vertical, 10)
                    totals
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 14)
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.5))
        .accessibilityLabel("Phases")
    }

    private var totals: some View {
        HStack {
            Text("So far").font(.system(size: 11.5)).foregroundStyle(.secondary)
            Spacer()
            Text(snapshot.isIncludedInPlan ? FilmProgressFormat.tokens(snapshot.totalTokens.fresh)
                 : (snapshot.costIsEstimated ? "est. " : "") + UsageFormat.dollars(snapshot.totalCostUSD))
                .font(.system(size: 12, weight: .semibold)).monospacedDigit()
        }
        .padding(.horizontal, 10)
        .accessibilityElement(children: .combine)
    }
}

private struct PhaseRailRow: View {
    let item: PhaseSummary
    let now: Date
    let selected: Bool
    let isLast: Bool
    let nextDone: Bool
    let action: () -> Void
    @State private var hovering = false

    private var enabled: Bool { item.state != .upcoming }

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 11) {
                VStack(spacing: 0) {
                    PhaseGlyph(phase: item.phase, state: item.state)
                    if !isLast {
                        Rectangle()
                            .fill(nextDone && item.state == .done ? Color(nsColor: .systemGreen).opacity(0.5) : Color(nsColor: .separatorColor))
                            .frame(width: 1.5).frame(maxHeight: .infinity)
                            .padding(.vertical, 3)
                    }
                }
                .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.phase.title)
                        .font(.system(size: 13.5, weight: item.state == .active || item.state == .waitingForYou ? .semibold : .medium))
                        .foregroundStyle(item.state == .upcoming || item.state == .skipped ? .secondary : .primary)
                    Text(subtitle).font(.system(size: 11.5)).foregroundStyle(subtitleColor).monospacedDigit().lineLimit(1)
                }
                .padding(.top, 3)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8).padding(.top, 5).padding(.bottom, 4)
            .frame(height: isLast ? 46 : 54, alignment: .top)
            .background(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(selected ? Color.rasan.opacity(0.13) : (hovering && enabled ? Color(nsColor: .quaternaryLabelColor).opacity(0.25) : .clear))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .onHover { hovering = $0 }
        .help(item.phase.summary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.railText(now: now)), \(stateWord)")
        .accessibilityHint(enabled ? "Shows this phase's details" : "")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    private var stateWord: String {
        switch item.state {
        case .done: "finished"
        case .active: "in progress"
        case .waitingForYou: "waiting for you"
        case .skipped: "skipped"
        case .upcoming: "not started"
        }
    }

    private var subtitle: String {
        switch item.state {
        case .upcoming:
            return item.estimate.map { "Later · \($0.text)" } ?? "Up next"
        case .skipped: return "Skipped"
        case .waitingForYou: return "Waiting for you"
        case .active, .done:
            var parts: [String] = []
            if item.startedAt != nil { parts.append(FilmProgressFormat.duration(item.workSeconds(now: now))) }
            if let cost = item.costText { parts.append(item.costIsEstimated && !item.isIncludedInPlan ? cost.replacingOccurrences(of: "est. ", with: "~") : cost) }
            return parts.isEmpty ? "Starting" : parts.joined(separator: " · ")
        }
    }

    private var subtitleColor: Color {
        switch item.state {
        case .waitingForYou: .orange
        case .active: Color.rasan
        default: Color(nsColor: .secondaryLabelColor)
        }
    }
}

/// The state icon on the rail: a green check, a spinning ring, a waiting person, or the phase's own symbol, dimmed.
struct PhaseGlyph: View {
    let phase: ProgressPhase
    let state: PhaseState
    var size: CGFloat = 24

    var body: some View {
        ZStack {
            switch state {
            case .done:
                Circle().fill(Color(nsColor: .systemGreen).opacity(0.9))
                Image(systemName: "checkmark").font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(.white)
            case .active:
                Circle().fill(Color.rasan.opacity(0.16))
                Circle().strokeBorder(Color.rasan.opacity(0.6), lineWidth: 1.5)
                ProgressView().controlSize(.mini).scaleEffect(0.75)
            case .waitingForYou:
                Circle().fill(Color.orange.opacity(0.18))
                Circle().strokeBorder(Color.orange.opacity(0.7), lineWidth: 1.5)
                Image(systemName: "person.fill").font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(.orange)
            case .skipped:
                Circle().strokeBorder(Color(nsColor: .tertiaryLabelColor), style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
                Image(systemName: "minus").font(.system(size: size * 0.4, weight: .semibold)).foregroundStyle(.tertiary)
            case .upcoming:
                Circle().strokeBorder(Color(nsColor: .separatorColor), lineWidth: 1.25)
                Image(systemName: phase.symbolName).font(.system(size: size * 0.4)).foregroundStyle(.tertiary)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
