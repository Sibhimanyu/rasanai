import StudioCore
import SwiftUI

/// The film page's right inspector, full window height: a segmented switch at the top, then the step's notes or every decision.
struct FilmInspector: View {
    @Bindable var model: FilmSessionModel
    var body: some View {
        VStack(spacing: 0) {
            Picker("Inspector", selection: $model.inspectorTab) {
                ForEach(InspectorTab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented).labelsHidden()
            .padding(.horizontal, 12).padding(.vertical, 10)
            Divider()
            switch model.inspectorTab {
            case .notes: NotesInspector(model: model)
            case .decisions: DecisionsInspector(model: model)
            }
        }
        .inspectorColumnWidth(min: 280, ideal: 330, max: 440)
    }
}

/// The conversation on the step on screen (the person's notes and Claude's replies) with a composer at the bottom.
/// ⌘↩ sends it as a note. An unsent note also goes with the status bar's primary or "Let Claude decide" (`model.tellText`).
struct NotesInspector: View {
    @Bindable var model: FilmSessionModel
    @FocusState private var focused: Bool
    private var step: String { model.tellStep ?? model.shownStep }
    private var trimmed: String { model.tellText.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            thread
            Divider()
            composer
        }
        .onChange(of: model.tellPresented) { _, requested in if requested { focus() } }
        .onChange(of: model.shownStep) { model.tellStep = nil }
        .onAppear { if model.tellPresented { focus() } }
    }

    private func focus() { Task { @MainActor in focused = true; model.tellPresented = false } }

    private var thread: some View {
        let messages = model.thread(for: step)
        let replying = model.isReplyPending(for: step)
        return ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    StageSectionTitle(StepCatalog.label(step))
                    if messages.isEmpty && !replying {
                        Text("Notes you leave on this step, and Claude's replies, appear here. Claude reads a note before it moves on.")
                            .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(messages) { message in ThreadBubble(message: message) }
                    if replying {
                        HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Claude is replying…").font(.system(size: 12)).foregroundStyle(.secondary) }
                    }
                    Color.clear.frame(height: 1).id("end")
                }
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: messages.count) { withAnimation(.smooth) { proxy.scrollTo("end") } }
            .onAppear { proxy.scrollTo("end") }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                TextEditor(text: $model.tellText)
                    .font(.system(size: 13)).focused($focused).scrollContentBackground(.hidden)
                    .padding(.horizontal, 5).padding(.vertical, 6).frame(height: 76)
                    .accessibilityLabel("Note for Claude")
                if model.tellText.isEmpty {
                    Text("Add a note for Claude").font(.system(size: 13)).foregroundStyle(.tertiary)
                        .padding(.horizontal, 10).padding(.vertical, 6).allowsHitTesting(false)
                }
            }
            .background(Color(nsColor: .textBackgroundColor).opacity(0.7), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
            HStack {
                Text("About \(StepCatalog.label(step))").font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                Spacer()
                Button("Send") { send() }
                    .buttonStyle(.bordered).controlSize(.small)
                    .keyboardShortcut(.return, modifiers: .command)
                    .help("Send this note to Claude (⌘↩)")
                    .disabled(trimmed.isEmpty || model.isSending)
            }
        }
        .padding(12)
    }

    private func send() {
        let text = trimmed
        Task { if await model.tell(text, step: step) { model.tellText = "" } }
    }
}

/// One message in a step's conversation: the person's on the right in the tint, Claude's on the left, quiet.
struct ThreadBubble: View {
    let message: ThreadMessage
    var body: some View {
        HStack {
            if message.fromUser { Spacer(minLength: 28) }
            Text(message.text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(message.fromUser ? Color.rasan.opacity(0.16) : Color(nsColor: .quaternaryLabelColor).opacity(0.4),
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .textSelection(.enabled)
                .accessibilityLabel((message.fromUser ? "You: " : "Claude: ") + message.text)
            if !message.fromUser { Spacer(minLength: 28) }
        }
    }
}

/// Wraps a film page so the inspector runs the window's full height beside it. Opens by default when the window is wide
/// (over 1100 pt) and then remembers the person's last choice. ⌘K opens it on Notes with the composer focused.
struct DecisionsHost<Page: View>: View {
    @Bindable var model: FilmSessionModel
    let page: Page
    /// Fixtures keep whatever state they set themselves.
    var remembersState = true
    /// 0: not chosen yet (follow the window width), 1: open, 2: closed.
    @AppStorage("studio.filmInspectorState") private var stored = 0
    @State private var configured = false
    @State private var applied: Bool?

    var body: some View {
        page
            .inspector(isPresented: $model.decisionsPresented) { FilmInspector(model: model) }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
                guard remembersState, !configured else { return }
                configured = true
                let open = stored == 0 ? width > 1100 : stored == 1
                if open != model.decisionsPresented { applied = open; model.decisionsPresented = open }
            }
            .onChange(of: model.decisionsPresented) { _, open in
                guard remembersState, configured else { return }
                if applied == open { applied = nil; return }
                stored = open ? 1 : 2
            }
            .background {
                Button("Tell Claude") { model.beginTell() }.keyboardShortcut("k", modifiers: .command)
                    .opacity(0).frame(width: 0, height: 0).accessibilityHidden(true)
            }
    }
}
