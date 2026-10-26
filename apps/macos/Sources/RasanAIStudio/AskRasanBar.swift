import SwiftUI

/// A compact "Ask Rasan" field that lives inside the film's bottom pill, at its right end, so the chat is easy to find.
/// Pressing return opens the chat with the typed words already in the message box; nothing is sent until the person sends
/// it there. When the pill is narrow it shrinks to a chat icon that opens the chat. Hidden in full-screen video.
struct AskRasanField: View {
    @Bindable var model: FilmSessionModel
    @State private var text = ""
    @AppStorage("askRasanHintSeen") private var hintSeen = false
    @FocusState private var focused: Bool

    private var empty: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        if VideoStageOverlay.shared.playback == nil {
            ViewThatFits(in: .horizontal) {
                field.frame(minWidth: 160, idealWidth: 220, maxWidth: 300)
                iconButton
            }
            .overlay(alignment: .topTrailing) {
                if !hintSeen { hint.fixedSize().offset(y: -46).transition(.opacity) }
            }
            .animation(.smooth, value: hintSeen)
            .onChange(of: model.askCardPresented) { _, open in if open { hintSeen = true } }
            .onDisappear { hintSeen = true }   // it leaves when the chat opens, by any route
        }
    }

    private var field: some View {
        HStack(spacing: 6) {
            RasanMark().fill(Color.rasanInk.opacity(0.7)).frame(width: 11, height: 14)
            TextField("Ask Rasan…", text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 12))
                .focused($focused)
                .onSubmit(send)
                .onChange(of: focused) { _, on in
                    // Clicking the field opens the chat card, which takes over typing.
                    if on { hintSeen = true; model.openAskCard(prefill: text); text = ""; focused = false }
                }
                .onChange(of: text) { _, new in if !new.isEmpty { hintSeen = true } }
            if !empty {
                Button(action: send) { Image(systemName: "arrow.up.circle.fill").font(.system(size: 16)) }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.rasanInk)
                    .help("Open the chat with Rasan")
            }
        }
        .padding(.horizontal, 10).frame(height: 30)
        .background(Color.primary.opacity(0.08), in: Capsule())
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.12)))
    }

    private var iconButton: some View {
        Button {
            hintSeen = true
            model.toggleAskCard()
        } label: {
            RasanMark().fill(Color.rasanInk.opacity(0.8)).frame(width: 12, height: 15).frame(width: 30, height: 30)
                .background(Color.primary.opacity(0.08), in: Circle())
                .overlay(Circle().strokeBorder(Color.primary.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .help("Ask Rasan to change anything")
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

    private func send() {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return }
        hintSeen = true
        model.openAskCard(prefill: words)
        text = ""
    }
}

extension FilmSessionModel {
    /// Opens the floating chat card with the words (if any) in its composer. Nothing is sent. Expands it if it was collapsed.
    func openAskCard(prefill: String = "") {
        let words = prefill.trimmingCharacters(in: .whitespacesAndNewlines)
        tellStep = shownStep
        if !words.isEmpty || tellText.isEmpty { tellText = words }
        inspectorTab = .chat
        UserDefaults.standard.set(false, forKey: "askRasanCardCollapsed")
        askCardPresented = true
        tellPresented = true
    }

    /// The pill's icon: opens the card, or closes it when it is already open.
    func toggleAskCard() {
        if askCardPresented && !decisionsPresented && !UserDefaults.standard.bool(forKey: "askRasanCardCollapsed") { askCardPresented = false }
        else { openAskCard() }
    }
}
