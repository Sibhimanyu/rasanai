import StudioCore
import SwiftUI

/// Every decided step: Claude's craft calls with their reasons and the person's picks, each changeable by telling
/// Claude. The inspector's Decisions tab (toolbar toggle, ⌥⌘B or ⌥⌘I), with the details log. The conversation is the Rasan chat tab.
struct DecisionsInspector: View {
    let model: FilmSessionModel
    @Environment(\.agentName) private var agent
    @State private var lessons: [LessonRow] = []

    var body: some View {
        let decisions = model.decisions   // newest first; the open step leads, marked
        let downgrades = model.snapshot.downgrades
        ScrollViewReader { proxy in
        List {
            Section {
                if decisions.isEmpty {
                    Text("Every choice, yours and \(agent)'s, collects here. Change any of them by messaging \(agent).")
                        .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        .listRowSeparator(.hidden)
                }
                ForEach(decisions) { row in DecisionRowView(model: model, row: row) }
            } header: {
                HStack(spacing: 6) {
                    CrewAvatar(.ra, style: .bust(diameter: 22), watching: false)
                    Text("Made so far")
                }
            }
            if !downgrades.isEmpty {
                Section("Working without") { DowngradesSection(rows: downgrades) }
            }
            if !lessons.isEmpty {
                Section("Lessons carried to every film") {
                    ForEach(lessons) { lesson in
                        LessonRowView(row: lesson, agent: agent) { Task { if await LessonStore.drop(lesson.id) { lessons = LessonStore.load() } } }
                    }
                }
            }
            let details = Array(model.activity.prefix(40))
            if !details.isEmpty {
                Section("Details") {
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
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)   // the inspector's glass shows through, the same as under Notes
        .accessibilityLabel("Decisions")
        .task { lessons = await Task.detached { LessonStore.load() }.value }
        // Newest first: a new or changed top row keeps the list anchored at the top.
        .onChange(of: decisions.first) { _, first in
            if let first { withAnimation(.snappy(duration: 0.2)) { proxy.scrollTo(first.id, anchor: .top) } }
        }
        .onAppear { if let first = decisions.first { proxy.scrollTo(first.id, anchor: .top) } }
        }
    }
}

private struct DecisionRowView: View {
    let model: FilmSessionModel
    @Environment(\.agentName) private var agent
    let row: DecisionRow
    @State private var hovering = false
    static func parse(_ text: String) -> Date? {
        guard !text.isEmpty else { return nil }
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                CrewAvatar(CrewCharacter(key: CrewRoles.character(forPanel: row.step)) ?? .ra, style: .bust(diameter: 18), watching: false)
                Text(row.label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.5).foregroundStyle(.secondary)
                Spacer()
                if let date = Self.parse(row.updated) {
                    Text(date, format: .dateTime.hour().minute()).font(.system(size: 10)).foregroundStyle(.tertiary).monospacedDigit()
                }
                Text(row.inProgress ? (row.state == "awaiting" ? "Open · your call" : "In progress") : row.byUser ? row.via.map { "You · \($0)" } ?? "You" : agent)
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background((row.inProgress || row.byUser ? Color.rasan : Color.secondary).opacity(0.15), in: Capsule())
                    .foregroundStyle(row.inProgress || row.byUser ? Color.rasan : Color.secondary)
            }
            Text(row.decision).font(.system(size: 12)).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(row.inProgress && row.decision.hasSuffix(".") ? .secondary : .primary)
            let history = model.snapshot.decisionHistory(step: row.step)
            if !history.isEmpty { DecisionHistoryView(entries: history) }
            if !row.inProgress { Button("Change…") { model.beginTell(step: row.step, prefill: "Change the \(row.label.lowercased()): ") }
                .buttonStyle(.link).font(.system(size: 11)).opacity(hovering ? 1 : 0.75)
                .accessibilityLabel("Change \(row.label)") }
        }
        .padding(.vertical, 4)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .contain)
    }
}
