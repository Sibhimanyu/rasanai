import StudioCore
import SwiftUI

/// The film page's right inspector panel: a segmented control (Chat with Rasan, Decisions), then the chat or every decision.
/// Rasan appears once, in the chat header.
struct FilmInspector: View {
    @Bindable var model: FilmSessionModel
    private var openNotes: Int { model.snapshot.notes.filter { $0.isOpen }.count }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 2) {
                segment(.chat, title: "Chat", badge: openNotes)
                segment(.decisions, title: "Decisions", badge: 0)
            }
            .padding(2)
            .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .frame(height: 28)
            .padding(.horizontal, 12).frame(height: 44)
            switch model.inspectorTab {
            case .chat: NotesInspector(model: model)
            case .decisions: DecisionsInspector(model: model)
            }
        }
        .frame(width: 320)
        .frame(maxHeight: .infinity)
        .workspacePanel()   // a calm bordered panel, one surface under the header, the chat and Decisions alike
    }

    private func segment(_ which: InspectorTab, title: String, badge: Int) -> some View {
        let on = model.inspectorTab == which
        return Button { model.inspectorTab = which } label: {
            HStack(spacing: 5) {
                Text(title)
                if badge > 0 {
                    Text("\(badge)").font(.system(size: 10, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(on ? Color.primary : Color.secondary)
                        .padding(.horizontal, 5).frame(minWidth: 16, minHeight: 15)
                        .background(Color.primary.opacity(0.10), in: Capsule())
                }
            }
            .font(.system(size: 12, weight: on ? .semibold : .medium))
            .foregroundStyle(on ? Color.primary : Color.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                if on {
                    RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Workspace.raised)
                        .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
                        .shadow(color: .black.opacity(0.18), radius: 1.5, y: 1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(which == .chat ? "Chat with Rasan" : which.rawValue)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// The chat with Rasan, the director: one continuous conversation across the whole film, a header, a composer at the bottom.
/// Return sends, Shift-Return makes a new line, ⌘↩ sends. An unsent message also goes with the status bar's primary or
/// "Let <agent> decide" (`model.tellText`). The pill's Ask Rasan field types into the same draft and conversation.
struct NotesInspector: View {
    @Bindable var model: FilmSessionModel
    @FocusState private var focused: Bool
    private var step: String { model.draftStep }
    private var trimmed: String { model.tellText.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(Workspace.hairline).frame(height: 1)
            thread
            composer
        }
        .onChange(of: model.tellPresented) { _, requested in if requested { focus() } }
        .onChange(of: model.shownStep) { model.tellStep = nil }
        .onAppear { if model.tellPresented { focus() } }
    }

    private func focus() { Task { @MainActor in focused = true; model.tellPresented = false } }

    /// The one Rasan in the panel.
    private var header: some View {
        HStack(spacing: 10) {
            CrewAvatar(.ra, style: .full(height: 38))
            VStack(alignment: .leading, spacing: 1) {
                Text("Rasan").font(.system(size: 13, weight: .semibold))
                Text("Director").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            if model.isReplying || model.isConnected {
                HStack(spacing: 5) {
                    Circle().fill(model.isReplying ? Color.orange : Color.green).frame(width: 6, height: 6)
                    Text(model.isReplying ? "Thinking…" : "Listening").font(.system(size: 11)).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                ConversationList(model: model) { emptyState }
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: model.conversationSignature) { withAnimation(.smooth) { proxy.scrollTo("end") } }
            .onChange(of: model.scrollToNoteID) { _, id in scroll(to: id, proxy) }
            .onAppear {
                proxy.scrollTo("end")
                if let id = model.scrollToNoteID { Task { @MainActor in scroll(to: id, proxy) } }
            }
        }
    }

    private func scroll(to id: String?, _ proxy: ScrollViewProxy) {
        guard let id else { return }
        withAnimation(.smooth) { proxy.scrollTo("note-\(id)", anchor: .center) }
        model.scrollToNoteID = nil
    }

    /// Top-aligned, no art: a title, one line, and suggestions that prefill the composer.
    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Steer the film").font(.system(size: 15, weight: .semibold))
            Text("Tell Rasan what you want, or what to avoid. He briefs the crew before the next step.")
                .font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            FlowLayout(spacing: 6) {
                ForEach(["Don't put any text on screen", "Make it shorter", "Keep to our brand colours", "Use a calmer pace"], id: \.self) { suggestion in
                    SuggestionChip(text: suggestion) { model.tellText = suggestion; focused = true }
                }
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 4).padding(.bottom, 12)
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let mark = model.pendingMark { PendingMarkChip(model: model, mark: mark) }
            ZStack(alignment: .bottomTrailing) {
                TextField(model.pendingMark == nil ? "Tell Rasan what to change or avoid…" : "What should change here?", text: $model.tellText, axis: .vertical)
                    .textFieldStyle(.plain).font(.system(size: 13)).lineLimit(1...5)
                    .focused($focused)
                    .onKeyPress(.return, phases: .down) { press in
                        guard press.modifiers.isEmpty else { return .ignored }   // Shift-Return: a new line; ⌘↩: the send button
                        model.sendDraft()
                        return .handled
                    }
                    .accessibilityLabel("Message for Rasan")
                    .padding(.leading, 12).padding(.trailing, 44).padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button { model.sendDraft() } label: {
                    Image(systemName: "arrow.up").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(trimmed.isEmpty || model.isSending ? Color.secondary.opacity(0.35) : Color.rasan))
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(trimmed.isEmpty || model.isSending)
                .help("Send to Rasan (↩)")
                .accessibilityLabel("Send")
                .padding(.trailing, 6).padding(.bottom, 6)
            }
            .background(Color(nsColor: .textBackgroundColor).opacity(0.7), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
            HStack(spacing: 4) {
                Text("Goes with \(StepCatalog.label(step)) ·").lineLimit(1)
                Text("⌘K").font(.system(size: 10, weight: .medium, design: .rounded))
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background(Color.primary.opacity(0.07), in: Capsule())
                    .overlay { Capsule().strokeBorder(Workspace.hairline, lineWidth: 1) }
            }
            .font(.system(size: 11)).foregroundStyle(.secondary)
            .padding(.leading, 4)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Goes with \(StepCatalog.label(step)), Command K")
        }
        .padding(12)
    }
}

/// One run of the conversation on a step: Rasan's and the person's messages, then the timed notes left on that step's film.
private struct ConversationGroup: Identifiable {
    let step: String
    var messages: [ThreadMessage]
    var notes: [ReviewNote] = []
    var id: String { "\(step)|\(messages.first?.id ?? "notes")" }
}

/// The conversation rows, shared by the side panel and the chat that grows out of the pill: step dividers, Rasan's and
/// the person's messages, timed notes with their frames, the confirm card, "Rasan is thinking…", and an "end" anchor.
/// The host owns the scroll view. `empty` shows when there is nothing yet.
struct ConversationList<Empty: View>: View {
    @Bindable var model: FilmSessionModel
    @ViewBuilder var empty: Empty
    @Environment(NoteSkips.self) private var skips: NoteSkips?

    private var groups: [ConversationGroup] {
        var result: [ConversationGroup] = []
        for message in model.conversation {
            if result.last?.step == message.step { result[result.count - 1].messages.append(message) }
            else { result.append(ConversationGroup(step: message.step, messages: [message])) }
        }
        let notes = model.snapshot.notes.sorted { $0.time < $1.time }
        for name in StepCatalog.order where notes.contains(where: { $0.step == name }) {
            let mine = notes.filter { $0.step == name }
            if let index = result.lastIndex(where: { $0.step == name }) { result[index].notes = mine }
            else { result.append(ConversationGroup(step: name, messages: [], notes: mine)) }
        }
        return result
    }

    /// The scene thumbnail for a note's time, only when the file is really there.
    private func thumbnail(for note: ReviewNote, in scenes: [FilmScene]) -> String? {
        guard let path = FilmTiming.sceneIndex(of: note, in: scenes).flatMap({ scenes[$0].thumbnail }),
              let url = model.fileURL(path), FileManager.default.fileExists(atPath: url.path) else { return nil }
        return path
    }

    var body: some View {
        let groups = groups
        let replying = model.isReplying
        VStack(alignment: .leading, spacing: 6) {
            if groups.isEmpty && !replying { empty }
            ForEach(groups) { group in
                StepDivider(label: StepCatalog.label(group.step))
                ForEach(Array(group.messages.enumerated()), id: \.element.id) { index, message in
                    let previous = index > 0 ? group.messages[index - 1] : nil
                    let startsRun = previous == nil || previous?.fromUser != message.fromUser
                    let label: String? = !startsRun ? nil : message.fromUser ? (previous != nil ? "You" : nil) : "Rasan"
                    ThreadBubble(message: message, label: label)
                        .padding(.top, previous != nil && startsRun ? 6 : 0)
                }
                let scenes = model.snapshot.scenes(for: ReviewStage.consoleStep(group.step))
                ForEach(group.notes) { note in
                    let mark = model.mark(for: note)
                    ThreadNote(note: note, mark: mark, thumbnailPath: thumbnail(for: note, in: scenes),
                               lit: model.focusedNoteID == note.id,
                               skipped: skips?.ids.contains(note.id) == true,
                               onToggleSkip: note.isOpen ? skips.map { s in { s.toggle(note.id) } } : nil) {
                        model.jump(to: note)
                    }
                    .id("note-\(note.id)")
                }
            }
            if let confirm = model.pendingConfirm, confirm.step == model.draftStep { RevisionConfirmCard(model: model, confirm: confirm) }
            if replying {
                HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Rasan is thinking…").font(.system(size: 12)).foregroundStyle(.secondary) }
                    .padding(.top, 4)
                    .accessibilityElement(children: .combine)
            }
            Color.clear.frame(height: 1).id("end")
        }
    }
}

/// The attachment waiting to go with the next message: the frame with the mark on it, when and what, and an × that drops it.
struct PendingMarkChip: View {
    let model: FilmSessionModel
    let mark: FilmMark
    var body: some View {
        HStack(spacing: 10) {
            MarkThumb(image: mark.snapshot, kind: mark.kind, rect: mark.rect, path: mark.path)
            Text(mark.caption).font(.system(size: 12, weight: .medium)).monospacedDigit().foregroundStyle(.secondary)
            Spacer(minLength: 4)
            Button { model.clearMark() } label: {
                Image(systemName: "xmark").font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                    .frame(width: 22, height: 22).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Remove the mark").accessibilityLabel("Remove the mark")
        }
        .padding(6)
        .background(Workspace.raised, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Marked \(mark.caption)")
    }
}

extension FilmSessionModel {
    /// The step the draft goes with: a pending mark's, else the one the chat was opened for, else the one on screen.
    var draftStep: String { pendingMark?.step ?? tellStep ?? shownStep }
    /// Rasan owes a reply to the latest message.
    var isReplying: Bool {
        guard let last = conversation.last else { return false }
        return isReplyPending(for: last.step)
    }
    /// Changes whenever a row is added to the conversation (or Rasan starts or stops thinking), for scrolling to the end.
    var conversationSignature: String { "\(conversation.count)|\(snapshot.notes.count)|\(isReplying)" }

    /// Sends the draft (`tellText`): as a timed note when a mark is waiting, else as a message on `draftStep`. Clears it once sent.
    func sendDraft() {
        let text = tellText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        if pendingMark != nil {
            Task { if await sendPendingMark(text: text) { tellText = "" } }
        } else {
            let step = draftStep
            Task { if await tell(text, step: step) { tellText = "" } }
        }
    }
}

/// A compact suggestion: 26pt capsule, hairline border, fills on hover.
private struct SuggestionChip: View {
    let text: String
    let action: () -> Void
    @State private var hovered = false
    var body: some View {
        Button(action: action) {
            Text(text).font(.system(size: 12)).padding(.horizontal, 10).frame(height: 26)
                .background(Color.primary.opacity(hovered ? 0.08 : 0), in: Capsule())
                .overlay { Capsule().strokeBorder(Workspace.hairline, lineWidth: 1) }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .accessibilityLabel("Suggestion: \(text)")
    }
}

/// The engine's one reading of an ambiguous request, with Confirm or Change (Change puts the words back in the composer).
struct RevisionConfirmCard: View {
    let model: FilmSessionModel
    let confirm: FilmSessionModel.PendingConfirm
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Nothing changes until you confirm.").font(.system(size: 11)).foregroundStyle(.secondary)
            HStack(spacing: 8) {
                Button("Confirm") { Task { await model.resolveConfirm(accept: true) } }.buttonStyle(.rasanSecondary).controlSize(.small)
                Button("Change") { Task { await model.resolveConfirm(accept: false) } }.buttonStyle(.rasanSecondary).controlSize(.small)
            }
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.25), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// A small centered "STORY" marker, with a hairline either side, where the conversation moves to another step.
private struct StepDivider: View {
    let label: String
    var body: some View {
        HStack(spacing: 8) {
            Rectangle().fill(Workspace.hairline).frame(height: 1)
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.8).foregroundStyle(.tertiary).fixedSize()
            Rectangle().fill(Workspace.hairline).frame(height: 1)
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}

/// One message in the conversation: the person's on the right in the tint, Rasan's on the left, quiet, no avatar.
/// `label` ("Rasan" / "You") sits above the first message of a run.
struct ThreadBubble: View {
    let message: ThreadMessage
    var label: String?
    var body: some View {
        VStack(alignment: message.fromUser ? .trailing : .leading, spacing: 3) {
            if let label { Text(label).font(.system(size: 11)).foregroundStyle(.secondary).padding(.horizontal, 4) }
            HStack(spacing: 0) {
                if message.fromUser { Spacer(minLength: 36) }
                Text(message.text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(message.fromUser ? Color.rasan.opacity(0.16) : Color.primary.opacity(0.06),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .textSelection(.enabled)
                    .accessibilityLabel((message.fromUser ? "You: " : "Rasan: ") + message.text)
                if !message.fromUser { Spacer(minLength: 36) }
            }
        }
        .frame(maxWidth: .infinity, alignment: message.fromUser ? .trailing : .leading)
    }
}

extension FilmSessionModel {
    /// The toolbar's Inspector/Decisions control: opening it lands on Decisions (⌘K opens Notes instead); closing just closes.
    func toggleInspectorOnDecisions() {
        if !decisionsPresented { inspectorTab = .decisions }
        decisionsPresented.toggle()
    }
}

/// Lays the inspector panel beside the stage panel. Closed by default at any width; it remembers the person's last
/// explicit choice. ⌘K focuses the Ask Rasan field in the bottom pill (or the panel's composer when the panel is open).
struct DecisionsHost<Page: View>: View {
    @Bindable var model: FilmSessionModel
    let page: Page
    /// Set false to keep whatever state was set in code.
    var remembersState = true
    /// 0: not chosen yet (closed), 1: open, 2: closed.
    @AppStorage("studio.filmInspectorState") private var stored = 0
    @State private var configured = false
    @State private var applied: Bool?

    var body: some View {
        HStack(spacing: Workspace.columnGap) {
            page.frame(maxWidth: .infinity, maxHeight: .infinity)
            if model.decisionsPresented {
                FilmInspector(model: model).transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.22), value: model.decisionsPresented)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { _ in
            guard remembersState, !configured else { return }
            configured = true
            let open = stored == 1   // closed unless the person last left it open, whatever the window width
            if open != model.decisionsPresented { applied = open; model.decisionsPresented = open }
        }
        .onChange(of: model.decisionsPresented) { _, open in
            guard remembersState, configured else { return }
            if applied == open { applied = nil; return }
            stored = open ? 1 : 2
        }
        .background {
            Button("Chat with Rasan") { model.askRasan() }.keyboardShortcut("k", modifiers: .command)
                .opacity(0).frame(width: 0, height: 0).accessibilityHidden(true)
        }
    }
}

/// Every stage sits on the canvas and draws its own content panels.
/// Keep this wrapper stable from the first layout pass to preserve focus and player identity.
struct StagePanelHost<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}


/// A timed note in the conversation, as the person's message: the frame it was left on (with its mark), when, and the words.
/// A click on the frame jumps the player there and lights its pin. The menu skips or includes the note for the next Apply.
private struct ThreadNote: View {
    let note: ReviewNote
    let mark: FilmMark?
    let thumbnailPath: String?
    let lit: Bool
    let skipped: Bool
    var onToggleSkip: (() -> Void)?
    let seek: () -> Void

    var body: some View {
        // A note that came back from the film without a local mark still shows where it was left, as a spot.
        let region = mark.map { ($0.kind, $0.rect, $0.path) } ?? note.x.flatMap { x in note.y.map { y in (MarkKind.point, CGRect(x: x, y: y, width: 0, height: 0), nil as [CGPoint]?) } }
        HStack(spacing: 0) {
            Spacer(minLength: 36)
            VStack(alignment: .leading, spacing: 8) {
                Button(action: seek) {
                    VStack(alignment: .leading, spacing: 5) {
                        MarkFrame(image: mark?.snapshot, payloadPath: thumbnailPath, kind: region?.0, rect: region?.1 ?? .zero, path: region?.2)
                        Text(mark?.caption ?? reviewTime(note.time, tenths: true)).font(.system(size: 11, weight: .medium)).monospacedDigit()
                            .foregroundStyle(Color.turmeric)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Jump to this moment")
                Text(note.text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                    .strikethrough(!note.isOpen || skipped, color: .secondary)
                    .textSelection(.enabled)
                if !note.isOpen, let resolution = note.resolution, !resolution.isEmpty {
                    Label(resolution, systemImage: "checkmark").font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                } else if skipped {
                    Text("Skipped. Not applied next time.").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
            .padding(8)
            .background(Color.rasan.opacity(0.16), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.turmeric.opacity(lit ? 0.9 : 0), lineWidth: 1.5) }
            .opacity(note.isOpen ? (skipped ? 0.5 : 1) : 0.6)
            .animation(.snappy(duration: 0.18), value: lit)
            .contextMenu {
                if let onToggleSkip { Button(skipped ? "Include Note" : "Skip Note", action: onToggleSkip) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(note.isOpen ? (skipped ? "Skipped note" : "Note") : "Resolved note") at \(reviewTime(note.time)): \(note.text)")
    }
}
