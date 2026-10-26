import SwiftUI

/// The floating Ask Rasan chat: a glass card that grows up out of the bottom pill at its right end. Same conversation and
/// composer as the side panel (`NotesInspector`, same model state), so sending, marks and replying behave identically.
/// Hidden while the side panel is open, in full-screen video, and when it is closed. Clicking elsewhere never closes it.
struct AskRasanChatCard: View {
    @Bindable var model: FilmSessionModel
    var maxHeight: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var visible: Bool {
        model.askCardPresented && !model.decisionsPresented && VideoStageOverlay.shared.playback == nil
    }
    private var cardHeight: CGFloat { max(220, min(460, maxHeight)) }
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 18, style: .continuous) }

    var body: some View {
        Group {
            if visible { card.transition(reduceMotion ? .opacity : .scale(scale: 0.9, anchor: .bottomTrailing).combined(with: .opacity)) }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.12) : .spring(response: 0.34, dampingFraction: 0.84), value: visible)
    }

    private var card: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(Color.rasan.opacity(0.18)).frame(height: 1)
            NotesInspector(model: model, showsHeader: false)
        }
        .frame(width: 380, height: cardHeight)
        .background {
            shape.fill(Color.black.opacity(0.55))
                .background(.ultraThickMaterial, in: shape)
                .overlay(alignment: .top) {
                    LinearGradient(colors: [Color.rasan.opacity(0.22), Color.rasan.opacity(0)], startPoint: .top, endPoint: .bottom)
                        .frame(height: 120).clipShape(shape)
                }
        }
        .overlay {
            shape.strokeBorder(LinearGradient(colors: [Color.rasan.opacity(0.75), Color.rasan.opacity(0.18), Color.rasan.opacity(0.4)],
                                              startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
        }
        .clipShape(shape)
        .shadow(color: .black.opacity(0.35), radius: 18, y: 8)
        .environment(\.colorScheme, .dark)
        .onExitCommand { model.askCardPresented = false }   // Esc tucks it back into the bar; the draft stays
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Ask Rasan chat")
    }

    private var header: some View {
        HStack(spacing: 8) {
            RasanMark().fill(Color.rasanInk).frame(width: 12, height: 15)
            Text("Ask Rasan").font(.system(size: 13, weight: .semibold))
            Spacer(minLength: 4)
            headerButton("sidebar.trailing", help: "Open in side panel") { model.decisionsPresented = true; model.askCardPresented = false }
            headerButton("chevron.down", help: "Tuck back into the bar (Esc)") { model.askCardPresented = false }
        }
        .padding(.horizontal, 14).frame(height: 44)
    }

    private func headerButton(_ symbol: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
                .frame(width: 24, height: 24).contentShape(Rectangle())
        }
        .buttonStyle(.plain).help(help).accessibilityLabel(help)
    }
}
