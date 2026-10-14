import StudioCore
import SwiftUI

/// The film page's right inspector panel: underlined tabs (Notes with its open count, Decisions), "Message <agent>" on the
/// right, then the step's notes or every decision.
struct FilmInspector: View {
    @Bindable var model: FilmSessionModel
    @Environment(\.agentName) private var agent
    private var openNotes: Int { model.snapshot.notes.filter { $0.step == model.shownStep && $0.isOpen }.count }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 22) {
                tab(.notes, title: openNotes > 0 ? "Notes (\(openNotes))" : "Notes")
                tab(.decisions, title: "Decisions")
                Spacer(minLength: 8)
                Button { model.beginTell() } label: {
                    Label("Message \(agent)", systemImage: "plus").font(.system(size: 12, weight: .medium))
                        .padding(.horizontal, 10).frame(height: 28)
                        .overlay { RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color.primary.opacity(0.16), lineWidth: 1) }
                        .contentShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                }
                .buttonStyle(.plain).help("Write to \(agent) about this step (⌘K)")
            }
            .padding(.horizontal, .filmInset).frame(height: 52)
            .overlay(alignment: .bottom) { Rectangle().fill(Workspace.hairline).frame(height: 1) }
            switch model.inspectorTab {
            case .notes: NotesInspector(model: model)
            case .decisions: DecisionsInspector(model: model)
            }
        }
        .frame(width: 340)
        .frame(maxHeight: .infinity)
        .glassPanel()   // one glass surface under the header, Notes and Decisions alike
    }

    private func tab(_ which: InspectorTab, title: String) -> some View {
        let on = model.inspectorTab == which
        return Button { model.inspectorTab = which } label: {
            Text(title).font(.system(size: 14, weight: on ? .semibold : .regular))
                .foregroundStyle(on ? Color.primary : Color.secondary)
                .frame(maxHeight: .infinity)
                .overlay(alignment: .bottom) { Rectangle().fill(on ? Color.primary : .clear).frame(height: 2) }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// The conversation on the step on screen (the person's messages and the agent's replies) with a composer at the bottom.
/// ⌘↩ sends it as a message. An unsent message also goes with the status bar's primary or "Let <agent> decide" (`model.tellText`).
struct NotesInspector: View {
    @Bindable var model: FilmSessionModel
    @Environment(\.agentName) private var agent
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
                    InspectorReviewNotes(model: model, step: step)
                    StageSectionTitle(StepCatalog.label(step))
                    if messages.isEmpty && !replying {
                        Text("Your messages about this step, and \(agent)'s replies, appear here. \(agent) reads them before it moves on.")
                            .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(messages) { message in ThreadBubble(message: message) }
                    if replying {
                        HStack(spacing: 6) { ProgressView().controlSize(.small); Text("\(agent) is replying…").font(.system(size: 12)).foregroundStyle(.secondary) }
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
                    .accessibilityLabel("Message for \(agent)")
                if model.tellText.isEmpty {
                    Text("Message \(agent) about this step").font(.system(size: 13)).foregroundStyle(.tertiary)
                        .padding(.horizontal, 10).padding(.vertical, 6).allowsHitTesting(false)
                }
            }
            .background(Color(nsColor: .textBackgroundColor).opacity(0.7), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
            HStack {
                Text("About \(StepCatalog.label(step))").font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                Spacer()
                Button("Send") { send() }
                    .buttonStyle(.rasanSecondary).controlSize(.small)
                    .keyboardShortcut(.return, modifiers: .command)
                    .help("Send this message to \(agent) (⌘↩)")
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
    @Environment(\.agentName) private var agent
    var body: some View {
        HStack {
            if message.fromUser { Spacer(minLength: 28) }
            Text(message.text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(message.fromUser ? Color.rasan.opacity(0.16) : Color(nsColor: .quaternaryLabelColor).opacity(0.4),
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .textSelection(.enabled)
                .accessibilityLabel((message.fromUser ? "You: " : "\(agent): ") + message.text)
            if !message.fromUser { Spacer(minLength: 28) }
        }
    }
}

/// Lays the inspector panel beside the stage panel. Opens by default when the window is wide (over 1100 pt) and then
/// remembers the person's last choice. ⌘K opens it on Notes with the composer focused.
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
        HStack(spacing: Workspace.gap) {
            page.frame(maxWidth: .infinity, maxHeight: .infinity)
            if model.decisionsPresented {
                FilmInspector(model: model).transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.22), value: model.decisionsPresented)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
            guard remembersState, !configured else { return }
            configured = true
            let open = stored == 0 ? width > 1000 : stored == 1
            if open != model.decisionsPresented { applied = open; model.decisionsPresented = open }
        }
        .onChange(of: model.decisionsPresented) { _, open in
            guard remembersState, configured else { return }
            if applied == open { applied = nil; return }
            stored = open ? 1 : 2
        }
        .background {
            Button("Message the agent") { model.beginTell() }.keyboardShortcut("k", modifiers: .command)
                .opacity(0).frame(width: 0, height: 0).accessibilityHidden(true)
        }
    }
}

/// The stage panel. A stage that lays out its own panels (the animatic's player and filmstrip) says so through
/// `StageDrawsPanelsKey` and is drawn straight on the canvas instead.
struct StagePanelHost<Content: View>: View {
    @ViewBuilder var content: Content
    @State private var ownPanels = false
    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onPreferenceChange(StageDrawsPanelsKey.self) { ownPanels = $0 }
            .modifier(OptionalPanel(on: !ownPanels))
    }
}

private struct OptionalPanel: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.workspacePanel() } else { content }
    }
}


/// The review notes on the step (the animatic's or the final's), as cards: the frame at that moment, the time in amber,
/// the note. A click jumps the player there; the note on the scene being played is outlined. A note can be skipped for the
/// next Apply (it stays on the film); skipping sends nothing to the director.
private struct InspectorReviewNotes: View {
    let model: FilmSessionModel
    let step: String
    @Environment(NoteSkips.self) private var skips: NoteSkips?
    private var stage: ReviewStage? { step == "animatic" ? .animatic : ["final", "render"].contains(step) ? .final : nil }

    var body: some View {
        let notes = model.snapshot.notes.filter { $0.step == step }.sorted { ($0.isOpen ? 0 : 1, $0.time) < ($1.isOpen ? 0 : 1, $1.time) }
        if let stage, !notes.isEmpty {
            let scenes = model.snapshot.scenes(for: stage)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(notes) { note in
                    let index = FilmTiming.sceneIndex(of: note, in: scenes)
                    InspectorNoteCard(note: note, thumbnail: index.flatMap { scenes[$0].thumbnail }, current: model.seekTick > 0 && abs(model.seekTime - note.time) < 0.05,
                                      skipped: skips?.ids.contains(note.id) == true, onToggleSkip: note.isOpen ? skips.map { s in { s.toggle(note.id) } } : nil) {
                        model.requestSeek(note.time)
                    }
                }
            }
            .padding(.bottom, 6)
        }
    }
}

private struct InspectorNoteCard: View {
    let note: ReviewNote
    let thumbnail: String?
    let current: Bool
    var skipped = false
    /// Nil when the note can't be skipped (already resolved, or no shared state).
    var onToggleSkip: (() -> Void)?
    let seek: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: seek) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    Workspace.raised
                    if let thumbnail { PayloadImage(path: thumbnail, contentMode: .fill, maxPixels: 300) }
                    else { Image(systemName: note.scope == "film" ? "film" : "photo").foregroundStyle(.tertiary) }
                }
                .frame(width: 96, height: 60).clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text(reviewTime(note.time)).font(.system(size: 12, weight: .semibold)).monospacedDigit().foregroundStyle(Color.turmeric)
                    Text(note.text).font(.system(size: 13)).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
                        .strikethrough(!note.isOpen || skipped, color: .secondary)
                    if !note.isOpen, let resolution = note.resolution, !resolution.isEmpty {
                        Label(resolution, systemImage: "checkmark").font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    } else if skipped {
                        Text("Skipped. Not applied next time.").font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: onToggleSkip == nil ? 0 : 22)
            }
            .padding(10)
            .background(hovering ? Workspace.raised : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(current ? Color.turmeric.opacity(0.8) : Workspace.hairline, lineWidth: current ? 1.5 : 1) }
            .opacity(note.isOpen ? (skipped ? 0.5 : 1) : 0.6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .topTrailing) {
            if let onToggleSkip {
                Button(action: onToggleSkip) {
                    Image(systemName: skipped ? "arrow.uturn.backward" : "xmark").font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                        .frame(width: 22, height: 22).contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .help(skipped ? "Include this note" : "Skip this note")
                .accessibilityLabel(skipped ? "Include note at \(reviewTime(note.time))" : "Skip note at \(reviewTime(note.time))")
                .padding(6)
            }
        }
        .contextMenu {
            if let onToggleSkip { Button(skipped ? "Include Note" : "Skip Note", action: onToggleSkip) }
        }
        .onHover { hovering = $0 }
        .accessibilityLabel("\(note.isOpen ? (skipped ? "Skipped note" : "Note") : "Resolved note") at \(reviewTime(note.time)): \(note.text)")
        .accessibilityHint("Jumps the player to this moment")
    }
}
