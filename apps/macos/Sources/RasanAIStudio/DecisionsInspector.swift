import StudioCore
import SwiftUI

/// Every decided step: Claude's craft calls with their reasons and the person's picks, each changeable by telling
/// Claude. Shown as the window's inspector (toolbar toggle or ⌥⌘D). Also the running conversation and the details log.
struct DecisionsInspector: View {
    let model: FilmSessionModel

    var body: some View {
        let decisions = model.decisions
        List {
            Section("Decisions") {
                if decisions.isEmpty {
                    Text("Every choice, yours and Claude's, collects here. Change any of them by telling Claude.")
                        .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        .listRowSeparator(.hidden)
                }
                ForEach(decisions) { row in DecisionRowView(model: model, row: row) }
            }
            let conversation = Array(model.conversation.suffix(12))
            if !conversation.isEmpty {
                Section("Conversation") {
                    ForEach(conversation) { message in
                        (Text(message.fromUser ? "You: " : "Claude: ").fontWeight(.semibold) + Text(message.text))
                            .font(.system(size: 12)).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
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
        .inspectorColumnWidth(min: 270, ideal: 320, max: 440)
        .accessibilityLabel("Decisions")
    }
}

private struct DecisionRowView: View {
    let model: FilmSessionModel
    let row: DecisionRow
    @State private var hovering = false
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Text(row.label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.5).foregroundStyle(.secondary)
                Spacer()
                Text(row.byUser ? "You" : "Claude")
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background((row.byUser ? Color.rasan : Color.secondary).opacity(0.15), in: Capsule())
                    .foregroundStyle(row.byUser ? Color.rasan : Color.secondary)
            }
            Text(row.decision).font(.system(size: 12.5)).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
            Button("Change…") { model.beginTell(step: row.step, prefill: "Change the \(row.label.lowercased()): ") }
                .buttonStyle(.link).font(.system(size: 11)).opacity(hovering ? 1 : 0.75)
                .accessibilityLabel("Change \(row.label)")
        }
        .padding(.vertical, 4)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .contain)
    }
}
