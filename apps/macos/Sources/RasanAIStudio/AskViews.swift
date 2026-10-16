import StudioCore
import SwiftUI

/// Claude's question when it isn't one of the five calls (`console.mjs ask`): options with its pick preselected, plus
/// a free-text answer. Sends `answer {ask, choice, text}` on the question's step.
struct AskSheet: View {
    @Environment(\.agentName) private var agent
    let model: FilmSessionModel
    let ask: DirectorAsk
    @State private var choice: String?
    @State private var text = ""
    @Environment(\.dismiss) private var dismiss

    init(model: FilmSessionModel, ask: DirectorAsk) {
        self.model = model; self.ask = ask
        _choice = State(initialValue: ask.recommended ?? ask.options.first?.id)
    }

    private var canSend: Bool { (choice != nil || !trimmed.isEmpty) && !model.isSending }
    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                CrewAvatar(.ra, style: .full(height: 52), watching: true)
                Text(AskTitle.text(agent)).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(ask.question).font(.system(size: 20, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if !ask.context.isEmpty {
                    Text(ask.context).font(.system(size: 13)).foregroundStyle(.secondary).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                }
            }
            if !ask.options.isEmpty {
                VStack(spacing: 8) {
                    ForEach(ask.options) { option in optionRow(option) }
                }
                .accessibilityElement(children: .contain).accessibilityLabel("Answers")
            }
            TextField(ask.placeholder, text: $text, axis: .vertical)
                .textFieldStyle(.plain).font(.system(size: 13)).lineLimit(2...5)
                .padding(10)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.7), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                .accessibilityLabel("Your answer in words")
            if let error = model.lastError {
                Label(error, systemImage: "exclamationmark.triangle.fill").font(.system(size: 12)).foregroundStyle(.orange)
            }
            HStack {
                Button("Answer later") { model.dismissedAsks.insert(ask.id); dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button {
                    Task {
                        let sent = await model.answer(ask, choice: choice, text: trimmed)
                        if sent { dismiss() }
                    }
                } label: {
                    HStack(spacing: 6) { if model.isSending { ProgressView().controlSize(.small) }; Text("Send") }.frame(minWidth: 80)
                }
                .buttonStyle(.rasanPrimary).controlSize(.large).keyboardShortcut(.defaultAction).disabled(!canSend)
            }
        }
        .padding(26).frame(width: 520)
    }

    private func optionRow(_ option: DirectorAsk.Option) -> some View {
        let selected = choice == option.id
        return Button { choice = option.id } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 15)).foregroundStyle(selected ? Color.rasan : Color.secondary)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text(option.label).font(.system(size: 13, weight: .medium))
                        if ask.recommended == option.id { RecommendedBadge() }
                    }
                    if !option.detail.isEmpty {
                        Text(option.detail).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(selected: selected)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(option.label + (ask.recommended == option.id ? ", \(agent)'s pick" : ""))
        .accessibilityValue(option.detail)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// The inline reminder above the stage when a question is open but its sheet was put away.
struct AskCard: View {
    @Environment(\.agentName) private var agent
    let model: FilmSessionModel
    let ask: DirectorAsk
    var body: some View {
        HStack(spacing: 12) {
            CrewAvatar(.ra, style: .full(height: 32), watching: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(AskTitle.text(agent)).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
                Text(ask.question).font(.system(size: 13, weight: .medium)).lineLimit(2)
            }
            Spacer(minLength: 8)
            Button("Answer…") { model.dismissedAsks.remove(ask.id) }.buttonStyle(.rasanPrimary)
        }
        .padding(.horizontal, 20).padding(.vertical, 10)
        .background(Color.rasan.opacity(0.10))
        .overlay(alignment: .bottom) { Divider() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(agent) has a question: \(ask.question)")
    }
}

/// "Rasan needs your call": Rasan is the Director, so the default agent name is Rasan; a customised name is used as typed.
private enum AskTitle {
    static func text(_ agent: String) -> String { "\(agent.isEmpty || agent == "Claude" ? "Rasan" : agent) needs your call" }
}
