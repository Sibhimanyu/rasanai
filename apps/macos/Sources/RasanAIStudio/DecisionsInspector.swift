import StudioCore
import SwiftUI

/// Every decided step: Claude's craft calls with their reasons and the person's picks, each changeable by telling
/// Claude. The inspector's Decisions tab (toolbar toggle or ⌥⌘I), with the details log. The conversation is the Notes tab.
struct DecisionsInspector: View {
    let model: FilmSessionModel
    @Environment(\.agentName) private var agent
    @State private var lessons: [LessonRow] = []

    var body: some View {
        let decisions = model.decisions
        let downgrades = model.snapshot.downgrades
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
    }
}

private struct DecisionRowView: View {
    let model: FilmSessionModel
    @Environment(\.agentName) private var agent
    let row: DecisionRow
    @State private var hovering = false
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                CrewAvatar(CrewCharacter(key: CrewRoles.character(forPanel: row.step)) ?? .ra, style: .bust(diameter: 18), watching: false)
                Text(row.label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.5).foregroundStyle(.secondary)
                Spacer()
                Text(row.byUser ? row.via.map { "You · \($0)" } ?? "You" : agent)
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background((row.byUser ? Color.rasan : Color.secondary).opacity(0.15), in: Capsule())
                    .foregroundStyle(row.byUser ? Color.rasan : Color.secondary)
            }
            Text(row.decision).font(.system(size: 12)).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
            let history = model.snapshot.decisionHistory(step: row.step)
            if !history.isEmpty { DecisionHistoryView(entries: history) }
            Button("Change…") { model.beginTell(step: row.step, prefill: "Change the \(row.label.lowercased()): ") }
                .buttonStyle(.link).font(.system(size: 11)).opacity(hovering ? 1 : 0.75)
                .accessibilityLabel("Change \(row.label)")
        }
        .padding(.vertical, 4)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .contain)
    }
}
