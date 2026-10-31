import StudioCore
import SwiftUI

/// Every decided step as a calm vertical timeline: grouped by the toolbar stepper's stages in film order, each group a
/// pinned, collapsible header over a thin rail with one node per call. Hollow node = Claude decided, filled = you decided,
/// small amber = open. Click a row to read why and to change it. The inspector's Decisions tab (toolbar toggle, ⌥⌘B or ⌥⌘I).
struct DecisionsInspector: View {
    let model: FilmSessionModel
    @Environment(\.agentName) private var agent
    @State private var lessons: [LessonRow] = []
    @State private var filter: DecisionFilter = .all
    @State private var query = ""
    @State private var expandedRow: String?
    /// Groups the person opened or closed by hand; every other group follows its default (the current stage open).
    @State private var toggled: [String: Bool] = [:]
    @State private var showingAll: Set<String> = []
    @State private var nowVisible = true

    private static let previewCount = 6

    private var currentStep: StudioFlowStep { StudioFlowStep(model.snapshot.stage) }
    private var finished: Bool { model.snapshot.isFinalDone }
    private var searching: Bool { filter != .all || !query.trimmingCharacters(in: .whitespaces).isEmpty }

    private func state(of step: StudioFlowStep) -> TimelineStageState {
        finished || step.rawValue < currentStep.rawValue ? .done : step == currentStep ? .current : .upcoming
    }
    private func isOpen(_ id: String, default value: Bool) -> Bool { searching ? true : (toggled[id] ?? value) }

    private var groups: [DecisionGroup] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        var buckets: [StudioFlowStep: [DecisionRow]] = [:]
        for row in model.decisions {
            guard filter.matches(row) else { continue }
            if !needle.isEmpty, !row.label.lowercased().contains(needle), !row.decision.lowercased().contains(needle) { continue }
            buckets[StudioFlowStep(ReviewStage.consoleStep(row.step)), default: []].append(row)
        }
        let order = Dictionary(uniqueKeysWithValues: StepCatalog.order.enumerated().map { ($1, $0) })
        return StudioFlowStep.allCases.compactMap { step in
            guard var rows = buckets[step], !rows.isEmpty else { return nil }
            // Oldest first, so the rail reads top to bottom; the open call closes the group.
            rows.sort { l, r in
                if l.inProgress != r.inProgress { return r.inProgress }
                if l.updated != r.updated { return l.updated < r.updated }
                return (order[l.step] ?? 0) < (order[r.step] ?? 0)
            }
            return DecisionGroup(step: step, rows: rows)
        }
    }

    var body: some View {
        let groups = groups
        let total = model.decisions.count
        VStack(spacing: 0) {
            header(total: total)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                        if groups.isEmpty {
                            Text(total == 0 ? "Calls made for this film will gather here." : "Nothing matches.")
                                .font(.system(size: 12)).foregroundStyle(.tertiary)
                                .padding(.horizontal, 16).padding(.vertical, 8)
                        }
                        ForEach(groups) { group in groupView(group) }
                        extras
                    }
                    .padding(.bottom, 16)
                }
                .overlay(alignment: .bottom) {
                    if !nowVisible, groups.contains(where: { $0.step == currentStep }) {
                        Button { jump(proxy) } label: {
                            Label("Jump to now", systemImage: "arrow.down.to.line").font(.system(size: 11, weight: .medium))
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(.regularMaterial, in: Capsule())
                                .overlay(Capsule().strokeBorder(Color.white.opacity(0.1)))
                        }
                        .buttonStyle(.plain).padding(.bottom, 12).transition(.opacity.combined(with: .scale(scale: 0.96)))
                    }
                }
                .animation(.snappy(duration: 0.2), value: nowVisible)
                .onAppear { if !searching { DispatchQueue.main.async { proxy.scrollTo("group-\(currentStep.rawValue)", anchor: .top) } } }
            }
        }
        .accessibilityLabel("Decisions")
        .task { lessons = await Task.detached { LessonStore.load() }.value }
    }

    private func jump(_ proxy: ScrollViewProxy) {
        withAnimation(.snappy(duration: 0.28)) { proxy.scrollTo("group-\(currentStep.rawValue)", anchor: .top) }
    }

    // MARK: Header

    private func header(total: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Decisions").font(.system(size: 13, weight: .semibold))
                Text("\(total)").font(.system(size: 11)).monospacedDigit().foregroundStyle(.tertiary)
                    .accessibilityLabel("\(total) decisions")
                Spacer()
            }
            Picker("Show", selection: $filter) {
                Text("All").tag(DecisionFilter.all)
                Text("Yours").tag(DecisionFilter.yours)
                Text("\(agent)'s").tag(DecisionFilter.crew)
            }
            .pickerStyle(.segmented).labelsHidden().controlSize(.small)
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").font(.system(size: 11)).foregroundStyle(.tertiary)
                TextField("Search decisions", text: $query).textFieldStyle(.plain).font(.system(size: 12))
                if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 11)).foregroundStyle(.tertiary) }
                        .buttonStyle(.plain).accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)
    }

    // MARK: Groups

    @ViewBuilder private func groupView(_ group: DecisionGroup) -> some View {
        let st = state(of: group.step)
        let id = "group-\(group.step.rawValue)"
        let open = isOpen(id, default: st == .current)
        let yours = group.rows.filter(\.byUser).count
        Section {
            if open {
                let limit = Self.previewCount
                let expandedAll = showingAll.contains(id) || searching
                let visible = expandedAll || group.rows.count <= limit + 1 ? group.rows : Array(group.rows.prefix(limit))
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(visible.enumerated()), id: \.element.id) { index, row in
                        DecisionTimelineRow(row: row, agent: agent, expanded: expandedRow == row.id, first: index == 0,
                                            last: index == visible.count - 1 && visible.count == group.rows.count,
                                            history: expandedRow == row.id ? model.snapshot.decisionHistory(step: row.step) : [],
                                            toggle: { withAnimation(.snappy(duration: 0.22)) { expandedRow = expandedRow == row.id ? nil : row.id } },
                                            change: { model.beginTell(step: row.step, prefill: "Change the \(row.label.lowercased()): ") })
                            .equatable()
                    }
                    if visible.count < group.rows.count {
                        Button { withAnimation(.snappy(duration: 0.22)) { _ = showingAll.insert(id) } } label: {
                            Text("Show \(group.rows.count - visible.count) more").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                                .padding(.leading, 28).padding(.vertical, 6)
                        }.buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 8)
                .opacity(st == .upcoming ? 0.55 : 1)
            }
        } header: {
            TimelineGroupHeader(title: group.step.title, count: group.rows.count, dot: st, open: open,
                                summary: open ? nil : "\(group.rows.count == 1 ? "1 call" : "\(group.rows.count) calls")" + (yours > 0 ? " · \(yours) yours" : ""),
                                toggle: { withAnimation(.snappy(duration: 0.22)) { toggled[id] = !open } })
                .id(id)
                .onAppear { if st == .current { nowVisible = true } }
                .onDisappear { if st == .current { nowVisible = false } }
        }
    }

    // MARK: Beyond the calls

    @ViewBuilder private var extras: some View {
        let downgrades = model.snapshot.downgrades
        let details = Array(model.activity.prefix(40))
        if !searching {
            if !downgrades.isEmpty {
                extraSection(id: "extra-downgrades", title: "Working without", count: downgrades.count, open: true) { DowngradesSection(rows: downgrades) }
            }
            let taste = tasteApplied
            if !taste.isEmpty {
                extraSection(id: "extra-taste", title: "Your taste applied", count: taste.count, open: true) {
                    ForEach(taste, id: \.stage) { row in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(row.stage.prefix(1).uppercased() + row.stage.dropFirst()).font(.system(size: 12, weight: .semibold))
                            Text(row.used.isEmpty ? row.note : row.used.joined(separator: " · ")).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                            if !row.used.isEmpty { Text(row.note).font(.system(size: 11)).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true) }
                        }
                    }
                }
            }
            if !lessons.isEmpty {
                extraSection(id: "extra-lessons", title: "Lessons carried to every film", count: lessons.count, open: false) {
                    ForEach(lessons) { lesson in
                        LessonRowView(row: lesson, agent: agent) { Task { if await LessonStore.drop(lesson.id) { lessons = LessonStore.load() } } }
                    }
                }
            }
            if !details.isEmpty {
                extraSection(id: "extra-details", title: "Details", count: details.count, open: false) {
                    ForEach(details) { item in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            if let date = item.date {
                                Text(date, format: .dateTime.hour().minute().second()).foregroundStyle(.tertiary).monospacedDigit()
                            }
                            Text(item.message).foregroundStyle(.secondary).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                        }.font(.system(size: 11))
                    }
                }
            }
        }
    }

    /// session.taste_applied: what taste memory shaped (concept writers, jury, design desk, sound mode), written by taste.mjs.
    private var tasteApplied: [(stage: String, used: [String], note: String)] {
        model.snapshot.raw["taste_applied"].object.map { stage, value in
            (stage, value["used"].array.compactMap(\.string), value["note"].string ?? "")
        }.sorted { $0.stage < $1.stage }
    }

    private func extraSection<Content: View>(id: String, title: String, count: Int, open defaultOpen: Bool,
                                             @ViewBuilder content: () -> Content) -> some View {
        let open = toggled[id] ?? defaultOpen
        return Section {
            if open { VStack(alignment: .leading, spacing: 8) { content() }.padding(.horizontal, 16).padding(.bottom, 8) }
        } header: {
            TimelineGroupHeader(title: title, count: count, dot: nil, open: open, summary: nil,
                                toggle: { withAnimation(.snappy(duration: 0.22)) { toggled[id] = !open } })
        }
    }
}

// MARK: Model

private enum DecisionFilter: Hashable {
    case all, yours, crew
    func matches(_ row: DecisionRow) -> Bool {
        switch self {
        case .all: true
        case .yours: row.byUser || (row.inProgress && row.state == "awaiting")
        case .crew: !row.byUser && !(row.inProgress && row.state == "awaiting")
        }
    }
}

private enum TimelineStageState { case done, current, upcoming }

private struct DecisionGroup: Identifiable {
    let step: StudioFlowStep
    let rows: [DecisionRow]
    var id: Int { step.rawValue }
}

// MARK: Views

/// The pinned group header: the stage's state dot as in the toolbar stepper, its name, the count, and a one-line summary when closed.
private struct TimelineGroupHeader: View {
    let title: String
    let count: Int
    let dot: TimelineStageState?
    let open: Bool
    let summary: String?
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 8) {
                Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold)).foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(open ? 90 : 0)).frame(width: 10)
                if let dot { stateDot(dot) }
                Text(title).font(.system(size: 12, weight: .semibold)).foregroundStyle(dot == .upcoming ? .secondary : .primary).lineLimit(1)
                Text("\(count)").font(.system(size: 11)).monospacedDigit().foregroundStyle(.tertiary)
                Spacer(minLength: 8)
                if let summary { Text(summary).font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(1) }
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits([.isHeader, .isButton])
        .accessibilityLabel("\(title), \(count) \(count == 1 ? "decision" : "decisions")\(dot == .current ? ", current stage" : dot == .upcoming ? ", upcoming" : "")")
        .accessibilityHint(open ? "Collapse" : "Expand")
    }

    @ViewBuilder private func stateDot(_ state: TimelineStageState) -> some View {
        switch state {
        case .done:
            ZStack {
                Circle().fill(Color.rasan).frame(width: 10, height: 10)
                Image(systemName: "checkmark").font(.system(size: 6, weight: .bold)).foregroundStyle(Color.rasanPrimaryLabel)
            }
        case .current:
            ZStack {
                Circle().fill(Color.rasan.opacity(0.18)).frame(width: 10, height: 10)
                Circle().strokeBorder(Color.rasan, lineWidth: 1).frame(width: 10, height: 10)
            }
        case .upcoming:
            Circle().fill(Color.secondary.opacity(0.45)).frame(width: 5, height: 5).frame(width: 10, height: 10)
        }
    }
}

/// One decision on the rail. Small and Equatable (closures are ignored) so a change elsewhere never re-renders the others.
private struct DecisionTimelineRow: View, Equatable {
    let row: DecisionRow
    let agent: String
    let expanded: Bool
    let first: Bool
    let last: Bool
    let history: [DecisionHistoryEntry]
    let toggle: () -> Void
    let change: () -> Void

    nonisolated static func == (l: Self, r: Self) -> Bool {
        l.row == r.row && l.agent == r.agent && l.expanded == r.expanded && l.first == r.first && l.last == r.last && l.history == r.history
    }

    private var decider: String {
        row.inProgress ? (row.state == "awaiting" ? "open, waiting for your call" : "being decided by \(agent)")
            : row.byUser ? (row.via.map { "you, from \($0)" } ?? "you") : agent
    }
    private var date: Date? { ActivityItem.parse(row.updated) }
    private let nodeY: CGFloat = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: toggle) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.label).font(.system(size: 13, weight: .medium)).lineLimit(1)
                        Text(row.decision).font(.system(size: 12)).foregroundStyle(.secondary)
                            .lineLimit(expanded ? nil : 2).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 4)
                    if let date {
                        Text(Self.short(date)).font(.system(size: 11).monospacedDigit()).foregroundStyle(.tertiary)
                    }
                }
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(row.label), \(row.decision), decided by \(decider)")
            .accessibilityHint(expanded ? "Collapse details" : "Show why")
            .accessibilityAddTraits(.isButton)
            if expanded {
                VStack(alignment: .leading, spacing: 8) {
                    Text(row.inProgress ? "Decider: " + decider : "Decided by " + decider + (date.map { " · " + $0.formatted(date: .abbreviated, time: .shortened) } ?? ""))
                        .font(.system(size: 11)).foregroundStyle(.tertiary)
                    if !history.isEmpty {
                        Text("Earlier calls").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                        DecisionHistoryView(entries: history)
                    }
                    if !row.inProgress {
                        Button("Change…", action: change).buttonStyle(.link).font(.system(size: 11))
                            .accessibilityLabel("Change \(row.label)")
                    }
                }
                .padding(.bottom, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity)
            }
        }
        .padding(.leading, 20)
        .background(alignment: .topLeading) { rail }
    }

    /// The 1 pt rail through every node, trimmed at the first and last, with the node on it.
    private var rail: some View {
        GeometryReader { g in
            Path { p in
                p.move(to: CGPoint(x: 4.5, y: first ? nodeY : 0))
                p.addLine(to: CGPoint(x: 4.5, y: last ? nodeY : g.size.height))
            }.stroke(Color.white.opacity(0.12), lineWidth: 1)
            node.offset(x: 0, y: nodeY - nodeSize / 2)
        }
        .frame(width: 9)
    }

    private var nodeSize: CGFloat { row.inProgress ? 7 : 9 }

    @ViewBuilder private var node: some View {
        if row.inProgress {
            Circle().fill(row.state == "awaiting" ? Color.orange : Color.orange.opacity(0.6)).frame(width: 7, height: 7).offset(x: 1)
        } else if row.byUser {
            Circle().fill(Color.rasan).frame(width: 9, height: 9)
        } else {
            Circle().strokeBorder(Color.secondary, lineWidth: 1.25).background(Circle().fill(Color.clear)).frame(width: 9, height: 9)
        }
    }

    private static func short(_ date: Date) -> String {
        let s = Date().timeIntervalSince(date)
        if s < 60 { return "now" }
        if s < 3600 { return "\(Int(s / 60))m" }
        if s < 86400 { return "\(Int(s / 3600))h" }
        if s < 7 * 86400 { return "\(Int(s / 86400))d" }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }
}
