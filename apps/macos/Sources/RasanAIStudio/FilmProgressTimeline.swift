import StudioCore
import SwiftUI

/// What has happened, grouped by phase, newest phase first. Icons and plain sentences; the raw lines sit behind "Details".
struct ProgressTimeline: View {
    let snapshot: FilmProgressSnapshot
    let now: Date
    let shown: ProgressPhase
    var onShowLog: (() -> Void)?

    /// Groups the person flipped away from their default (the live and the shown phase start open).
    @State private var flipped: Set<ProgressPhase> = []
    @State private var detailsOpen = false
    @State private var expandedAll: Set<ProgressPhase> = []

    private func isOpen(_ phase: ProgressPhase) -> Bool {
        let byDefault = phase == snapshot.currentPhase || phase == shown
        return byDefault != flipped.contains(phase)
    }

    var body: some View {
        let groups = Array(snapshot.activityByPhase.reversed())
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                StageSectionTitle("What has happened")
                Spacer()
                Text("\(snapshot.activity.count) event\(snapshot.activity.count == 1 ? "" : "s")").font(.system(size: 11)).foregroundStyle(.tertiary)
            }
            if groups.isEmpty {
                Text("Nothing yet. Each step Claude takes shows up here.").font(.system(size: 13)).foregroundStyle(.secondary)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(groups, id: \.phase) { group in
                        TimelineGroup(group: group, summary: snapshot.summary(group.phase), now: now, open: isOpen(group.phase), showAll: expandedAll.contains(group.phase),
                                      toggle: { withAnimation(.smooth(duration: 0.25)) { flip(group.phase) } },
                                      more: { expandedAll.insert(group.phase) })
                    }
                }
            }
            rawDetails
        }
    }

    private func flip(_ phase: ProgressPhase) {
        if flipped.contains(phase) { flipped.remove(phase) } else { flipped.insert(phase) }
    }

    // MARK: Raw details

    private var rawDetails: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.smooth(duration: 0.25)) { detailsOpen.toggle() } } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary).rotationEffect(.degrees(detailsOpen ? 90 : 0))
                    Text("Details").font(.system(size: 13, weight: .semibold))
                    if !detailsOpen, let last = snapshot.activity.last {
                        Text(last.title).font(.system(size: 12, design: .monospaced)).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    if warnings > 0 {
                        Label("\(warnings)", systemImage: "exclamationmark.triangle.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(.orange)
                            .accessibilityLabel("\(warnings) warnings")
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Details, the raw log")
            .accessibilityValue(detailsOpen ? "expanded" : "collapsed")
            if detailsOpen {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 3) {
                        ForEach(snapshot.activity.suffix(300).reversed()) { item in RawLine(item: item) }
                    }
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 240)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.55), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                .padding(.top, 10)
                if let onShowLog {
                    Button("Open the full director log", action: onShowLog).buttonStyle(.link).font(.system(size: 12)).padding(.top, 8)
                }
            }
        }
        .padding(.top, 8)
    }

    private var warnings: Int { snapshot.activity.filter { $0.kind == .warning }.count }
}

private struct TimelineGroup: View {
    let group: (phase: ProgressPhase, items: [ProgressActivity])
    let summary: PhaseSummary
    let now: Date
    let open: Bool
    let showAll: Bool
    let toggle: () -> Void
    let more: () -> Void
    private let limit = 24

    var body: some View {
        let items = Array(group.items.reversed())
        let visible = showAll ? items : Array(items.prefix(limit))
        VStack(alignment: .leading, spacing: 0) {
            Button(action: toggle) {
                HStack(spacing: 9) {
                    Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(open ? 90 : 0)).frame(width: 10)
                    Image(systemName: group.phase.symbolName).font(.system(size: 12)).foregroundStyle(summary.state == .active ? Color.rasan : Color.secondary).frame(width: 16)
                    Text(group.phase.title).font(.system(size: 13, weight: .semibold))
                    Text("\(items.count)").font(.system(size: 11)).foregroundStyle(.tertiary).monospacedDigit()
                    Spacer()
                    if summary.startedAt != nil {
                        Text(FilmProgressFormat.duration(summary.workSeconds(now: now))).font(.system(size: 11.5)).foregroundStyle(.secondary).monospacedDigit()
                    }
                }
                .padding(.vertical, 8).padding(.horizontal, 4)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(group.phase.title), \(items.count) events")
            .accessibilityValue(open ? "expanded" : "collapsed")
            if open {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(visible) { item in TimelineRow(item: item) }
                    if items.count > visible.count {
                        Button("Show \(items.count - visible.count) earlier", action: more).buttonStyle(.link).font(.system(size: 12)).padding(.leading, 34).padding(.vertical, 6)
                    }
                }
                .padding(.leading, 6)
                .transition(.opacity)
            }
            Divider().opacity(0.6)
        }
    }
}

private struct TimelineRow: View {
    let item: ProgressActivity
    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            ZStack {
                Circle().fill(tint.opacity(0.13))
                Image(systemName: item.symbolName).font(.system(size: 10, weight: .semibold)).foregroundStyle(tint)
            }
            .frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                if let detail = item.detail, !detail.isEmpty {
                    Text(detail).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 10)
            Text(item.time, format: .dateTime.hour().minute()).font(.system(size: 11)).foregroundStyle(.tertiary).monospacedDigit()
        }
        .padding(.vertical, 6).padding(.horizontal, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.title). \(item.detail ?? "")")
    }
    private var tint: Color {
        switch item.kind {
        case .milestone, .answer: Color(nsColor: .systemGreen)
        case .ask, .note: Color.rasan
        case .warning: .orange
        case .critic: .purple
        case .render: .pink
        default: Color.secondary
        }
    }
}

private struct RawLine: View {
    let item: ProgressActivity
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(item.time, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute().second()).foregroundStyle(.tertiary)
            Text(item.kind.rawValue.uppercased()).fontWeight(.semibold).foregroundStyle(item.kind == .warning ? Color.orange : Color.secondary).frame(width: 66, alignment: .leading)
            Text([item.title, item.detail].compactMap { $0 }.joined(separator: "  ")).textSelection(.enabled)
        }
        .font(.system(size: 11.5, design: .monospaced))
        .accessibilityElement(children: .combine)
    }
}
