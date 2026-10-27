import SwiftUI

/// The Ask Rasan field inside the film's bottom pill: the one place to type to Rasan when the side panel is closed.
/// Focusing it (click, Tab, ⌘K) opens the conversation above the pill (`AskRasanFloatingChat`). Return sends and keeps the
/// chat open, Shift-Return adds a line (the field grows to four lines, the pill with it), Esc tucks the chat away. The draft is
/// `model.tellText`, shared with the side panel's composer. When the pill is narrow the field shrinks to an icon; opening the
/// chat then adds a full-width row with the field (`mode: .row`). Hidden in full-screen video.
struct AskRasanField: View {
    enum Mode { case auto, row }
    @Bindable var model: FilmSessionModel
    var mode: Mode = .auto
    /// Set true while the pill shows the icon instead of the field (auto mode only).
    @Binding var compact: Bool
    @AppStorage("askRasanHintSeen") private var hintSeen = false
    @FocusState private var focused: Bool

    private var trimmed: String { model.tellText.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var open: Bool { model.askCardPresented && !model.decisionsPresented }
    private var placeholder: String {
        if model.pendingMark != nil { return "What should change here?" }
        return open || focused ? "Tell Rasan what to change or avoid…" : "Ask Rasan…"
    }

    var body: some View {
        if VideoStageOverlay.shared.playback == nil {
            Group {
                switch mode {
                case .row:
                    field.frame(maxWidth: .infinity)
                        .onAppear { focused = true; model.tellPresented = false }
                        .onDisappear { model.askFieldFocused = false }
                case .auto:
                    ViewThatFits(in: .horizontal) {
                        field.frame(minWidth: 160, idealWidth: 240, maxWidth: open ? 380 : 300)
                            .onAppear { compact = false }
                        iconButton.onAppear { compact = true }
                    }
                    .overlay(alignment: .topTrailing) {
                        if !hintSeen && !open { hint.fixedSize().offset(y: -46).transition(.opacity) }
                    }
                    .animation(.smooth, value: hintSeen)
                    .onAppear { model.askFieldMounted = true }
                    .onDisappear { model.askFieldMounted = false; model.askFieldFocused = false }
                }
            }
            .onChange(of: model.askCardPresented) { _, isOpen in
                if isOpen { hintSeen = true } else if focused { focused = false }
            }
            // ⌘K or a "Chat with Rasan" route asked for the composer: the side panel's takes it when the panel is open.
            .onChange(of: model.tellPresented) { _, requested in
                guard requested, !model.decisionsPresented, mode == .row || !compact else { return }
                focused = true
                model.tellPresented = false
            }
            .onChange(of: model.shownStep) { model.tellStep = nil }
        }
    }

    private var field: some View {
        HStack(alignment: .bottom, spacing: 7) {
            RasanMark().fill(Color.rasanInk.opacity(focused ? 0.95 : 0.7)).frame(width: 11, height: 14)
                .padding(.bottom, 1)
                .accessibilityHidden(true)
            TextField(placeholder, text: $model.tellText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 12.5))
                .lineLimit(1...4)
                .focused($focused)
                .onKeyPress(.return, phases: .down) { press in
                    guard press.modifiers.isEmpty else { return .ignored }   // Shift-Return: a new line
                    send()
                    return .handled
                }
                .onKeyPress(.escape) {
                    guard open else { return .ignored }
                    collapse()
                    return .handled
                }
                .onChange(of: focused) { _, on in
                    model.askFieldFocused = on
                    if on { openChat() }
                }
                .onChange(of: model.tellText) { _, new in
                    if !new.isEmpty { hintSeen = true }
                    if focused && !new.isEmpty { openChat() }
                }
                .accessibilityLabel("Message for Rasan")
                .accessibilityHint("Return sends. Shift-Return adds a line. Escape hides the conversation.")
            if !trimmed.isEmpty {
                Button(action: send) {
                    Image(systemName: "arrow.up").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 20, height: 20)
                        .background(Circle().fill(model.isSending || model.isDuplicatePending(trimmed) ? Color.secondary.opacity(0.35) : Color.rasan))
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(model.isSending || model.isDuplicatePending(trimmed))
                .help(model.isDuplicatePending(trimmed) ? "Already sent. Waiting for Rasan's answer." : "Send to Rasan (↩)")
                .accessibilityLabel("Send to Rasan")
                .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.16), value: trimmed.isEmpty)
        .padding(.leading, 10).padding(.trailing, trimmed.isEmpty ? 10 : 5).padding(.vertical, 5)
        .frame(minHeight: 30)
        .background(Color.primary.opacity(focused ? 0.11 : 0.08), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .strokeBorder(focused ? Color.rasan.opacity(0.7) : Color.primary.opacity(0.12), lineWidth: focused ? 1.2 : 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        .simultaneousGesture(TapGesture().onEnded { focused = true; openChat() })
        .background { GeometryReader { Color.clear.preference(key: AskFieldWidthKey.self, value: $0.size.width) } }
    }

    private var iconButton: some View {
        Button {
            hintSeen = true
            model.toggleAskCard()
        } label: {
            RasanMark().fill(Color.rasanInk.opacity(open ? 1 : 0.8)).frame(width: 12, height: 15).frame(width: 30, height: 30)
                .background(Color.primary.opacity(open ? 0.14 : 0.08), in: Circle())
                .overlay(Circle().strokeBorder(open ? Color.rasan.opacity(0.7) : Color.primary.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .help(open ? "Hide the conversation (Esc)" : "Ask Rasan to change anything (⌘K)")
        .accessibilityLabel(open ? "Hide the conversation with Rasan" : "Ask Rasan")
    }

    private var hint: some View {
        HStack(spacing: 10) {
            Text("Want something changed? Just tell Rasan.").font(.callout)
            Button("Got it") { hintSeen = true }.buttonStyle(.borderless).foregroundStyle(Color.rasanInk).fontWeight(.semibold)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .softGlass(in: RoundedRectangle(cornerRadius: 10, style: .continuous), opacity: 0.92)
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.primary.opacity(0.12)))
    }

    private func openChat() {
        hintSeen = true
        guard !model.decisionsPresented, !model.askCardPresented else { return }
        model.tellStep = model.tellStep ?? model.shownStep
        model.inspectorTab = .chat
        model.askCardPresented = true
    }

    private func collapse() {
        model.askCardPresented = false
        focused = false
    }

    private func send() {
        guard !trimmed.isEmpty, !model.isSending else { return }
        hintSeen = true
        if !model.decisionsPresented { model.askCardPresented = true }
        model.sendDraft()
    }
}

/// The width of the pill's Ask Rasan field, so the conversation above it can match.
struct AskFieldWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

extension FilmSessionModel {
    /// Opens the chat above the pill and focuses the pill's field, with the words (if any) in it. Nothing is sent.
    func openAskCard(prefill: String = "") {
        let words = prefill.trimmingCharacters(in: .whitespacesAndNewlines)
        tellStep = shownStep
        if !words.isEmpty || tellText.isEmpty { tellText = words }
        inspectorTab = .chat
        askCardPresented = true
        tellPresented = true
    }

    /// The pill's icon: opens the chat, or closes it when it is already open.
    func toggleAskCard() {
        if askCardPresented && !decisionsPresented { askCardPresented = false }
        else { openAskCard() }
    }

    /// ⌘K: the panel's composer when the side panel is open (or there is no pill on this page), else the pill's field.
    func askRasan() {
        if decisionsPresented || !askFieldMounted { beginTell() }
        else { openAskCard() }
    }
}
