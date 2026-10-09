import StudioCore
import SwiftUI

/// How tall the frame in a review player may be. The stages set it from the window so the transport and scene strip stay on
/// screen in a small window, and let it grow in a large one.
private struct ReviewFrameHeightKey: EnvironmentKey { static let defaultValue: CGFloat = 340 }
extension EnvironmentValues {
    var reviewFrameHeight: CGFloat {
        get { self[ReviewFrameHeightKey.self] }
        set { self[ReviewFrameHeightKey.self] = newValue }
    }
}

extension View {
    /// Measures the page and passes the frame height the review player may use (window height minus everything around it).
    func reviewFrameFitting() -> some View { modifier(ReviewFrameFitting()) }
}

private struct ReviewFrameFitting: ViewModifier {
    @State private var height: CGFloat = 640
    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            .environment(\.reviewFrameHeight, min(480, max(180, height - 352)))
    }
}

/// The bottom bar of a review call (Animatic, Final): one primary button at the bottom right, the same place as the first
/// half's CallActions. Notes live on the frame and in the list, not here.
struct ReviewActionBar: View {
    let model: FilmSessionModel
    let step: String
    let title: String
    let symbol: String
    var hint: String?
    var onPrimary: () -> Void

    /// Only the person's turn (or looking back, or just sent) gets a bar; while Claude works there is nothing to do.
    var body: some View {
        if model.showsActions(for: step) { bar }
    }

    @ViewBuilder private var bar: some View {
        let canAct = model.canAct(on: step)
        VStack(spacing: 8) {
            if let error = model.lastError {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text(error).font(.system(size: 12)).lineLimit(2)
                    Spacer()
                    Button("Dismiss") { model.dismissError() }.buttonStyle(.link).font(.system(size: 12))
                }
            }
            HStack(spacing: 10) {
                if model.isViewingPast {
                    Label("Looking back. This step is decided.", systemImage: "clock.arrow.circlepath")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                    Spacer()
                    Button("Back to now") { model.returnToLive() }.controlSize(.large)
                } else if model.hasSent(step) && model.status(step) != "done" {
                    ProgressView().controlSize(.small)
                    Text("Sent to Claude. Waiting for the next update.").font(.system(size: 12)).foregroundStyle(.secondary)
                    Spacer()
                } else {
                    if let hint { Text(hint).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1) }
                    Spacer()
                    Button(action: onPrimary) {
                        HStack(spacing: 6) {
                            if model.isSending { ProgressView().controlSize(.small) } else { Image(systemName: symbol) }
                            Text(title)
                        }.frame(minWidth: 110)
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canAct)
                }
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 12)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
    }
}

/// A single field under the notes list for a note about the whole film (no frame needed).
struct FilmNoteField: View {
    let model: FilmSessionModel
    let step: String
    let enabled: Bool
    @State private var text = ""

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "film").foregroundStyle(.secondary).font(.system(size: 12))
            TextField("Add a note about the whole film", text: $text)
                .textFieldStyle(.plain).font(.system(size: 13))
                .onSubmit(save)
                .disabled(!enabled)
            if !trimmed.isEmpty {
                Button("Add", action: save).buttonStyle(.borderless).font(.system(size: 12, weight: .semibold))
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 0.5) }
        .opacity(enabled ? 1 : 0.5)
        .accessibilityElement(children: .contain)
    }

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func save() {
        let note = trimmed
        guard !note.isEmpty, enabled else { return }
        Task {
            let value: [String: JSONValue] = ["t": .number(0), "scope": .string("film"), "quick": .null]
            if await model.send(step: step, type: "comment", value: .object(value), note: note) { text = "" }
        }
    }
}
