import StudioCore
import SwiftUI

/// The conversation on one step: the person's notes and Claude's replies, with a "Claude is replying" state.
/// `StageScaffold` includes it; custom layouts (Animatic, Final) place it themselves.
struct StepThreadView: View {
    let model: FilmSessionModel
    let step: String
    var body: some View {
        let messages = model.thread(for: step)
        let replying = model.isReplyPending(for: step)
        if !messages.isEmpty || replying {
            VStack(alignment: .leading, spacing: 10) {
                StageSectionTitle("Conversation")
                ForEach(messages) { message in
                    HStack {
                        if message.fromUser { Spacer(minLength: 60) }
                        Text(message.text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(message.fromUser ? Color.rasan.opacity(0.16) : Color(nsColor: .quaternaryLabelColor).opacity(0.4),
                                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .textSelection(.enabled)
                            .accessibilityLabel((message.fromUser ? "You: " : "Claude: ") + message.text)
                        if !message.fromUser { Spacer(minLength: 60) }
                    }
                }
                HStack(spacing: 8) {
                    if replying { ProgressView().controlSize(.small); Text("Claude is replying…").font(.system(size: 12)).foregroundStyle(.secondary) }
                    Spacer()
                    Button("Reply…") { model.beginTell(step: step) }.buttonStyle(.link).font(.system(size: 12))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Tell Claude (⌘K): a note to the step on screen, added to that step's conversation.
struct TellClaudePopover: View {
    @Bindable var model: FilmSessionModel
    @FocusState private var focused: Bool
    private var step: String { model.tellStep ?? model.shownStep }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Tell Claude").font(.system(size: 14, weight: .semibold))
                Spacer()
                Text("About: \(StepCatalog.label(step))").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            TextEditor(text: $model.tellText)
                .font(.system(size: 13)).focused($focused).scrollContentBackground(.hidden)
                .padding(6).frame(height: 96)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.7), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                .accessibilityLabel("Note for Claude")
            if model.isReplyPending(for: step) {
                HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Claude is replying…").font(.system(size: 12)).foregroundStyle(.secondary) }
            }
            if let error = model.lastError { Text(error).font(.system(size: 11)).foregroundStyle(.orange) }
            HStack {
                Text("Claude answers in the conversation under the step.").font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer()
                Button("Send") {
                    Task { if await model.tell(model.tellText, step: step) { model.tellText = ""; model.tellPresented = false } }
                }
                .buttonStyle(.borderedProminent).keyboardShortcut(.return, modifiers: .command)
                .disabled(model.tellText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isSending)
            }
        }
        .padding(16).frame(width: 360)
        .onAppear { focused = true }
    }
}

/// Toolbar items every native film page carries: Tell Claude and Decisions. "Just make it" lives in each call's action bar and the ••• menu.
struct FilmToolbarItems: ToolbarContent {
    @Bindable var model: FilmSessionModel
    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button { model.beginTell() } label: { Label("Tell Claude", systemImage: "bubble.left.and.text.bubble.right") }
                .keyboardShortcut("k", modifiers: .command)
                .help("Tell Claude something about this step (⌘K)")
                .popover(isPresented: $model.tellPresented, arrowEdge: .bottom) { TellClaudePopover(model: model) }
            Button { model.decisionsPresented.toggle() } label: { Label("Decisions", systemImage: "sidebar.right") }
                .keyboardShortcut("d", modifiers: [.command, .option])
                .help("Show every decision (⌥⌘D)")
        }
    }
}
