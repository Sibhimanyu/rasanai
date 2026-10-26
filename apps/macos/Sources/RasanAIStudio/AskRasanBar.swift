import SwiftUI

/// A slim "Ask Rasan" field at the bottom of the film stage, so the chat is easy to find. Pressing return opens the chat
/// with the typed words already in the message box; nothing is sent until the person sends it there.
struct AskRasanBar: View {
    @Bindable var model: FilmSessionModel
    @State private var text = ""
    @AppStorage("askRasanHintSeen") private var hintSeen = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            if !hintSeen { hint.transition(.opacity.combined(with: .move(edge: .bottom))) }
            HStack(spacing: 8) {
                RasanMark().fill(Color.rasanInk.opacity(0.7)).frame(width: 12, height: 15)
                TextField("Ask Rasan to change anything…", text: $text)
                    .textFieldStyle(.plain)
                    .focused($focused)
                    .onSubmit(send)
                    .onChange(of: text) { _, new in if !new.isEmpty { hintSeen = true } }
                Button(action: send) { Image(systemName: "arrow.up.circle.fill").font(.title3) }
                    .buttonStyle(.plain)
                    .foregroundStyle(text.trimmingCharacters(in: .whitespaces).isEmpty ? Color.secondary : Color.rasanInk)
                    .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                    .help("Open the chat with Rasan")
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(.regularMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.primary.opacity(0.12)))
        }
        .frame(maxWidth: 560)
        .padding(.horizontal, 16).padding(.bottom, 10).padding(.top, 4)
        .frame(maxWidth: .infinity)
        .animation(.smooth, value: hintSeen)
        .onDisappear { hintSeen = true }   // it leaves when the chat opens, by any route
    }

    private var hint: some View {
        HStack(spacing: 10) {
            Text("Want something changed? Just tell Rasan.").font(.callout)
            Button("Got it") { hintSeen = true }.buttonStyle(.borderless).foregroundStyle(Color.rasanInk).fontWeight(.semibold)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.primary.opacity(0.12)))
    }

    private func send() {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return }
        hintSeen = true
        model.beginTell(step: model.shownStep, prefill: words)
        text = ""
    }
}
