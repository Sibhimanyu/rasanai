import StudioCore
import SwiftUI

/// A concept's full story board in the Story stage: its identity as chips, the rendered board, then every shot as a tile
/// (time, words, move, carrier state, transition) in a horizontal scroll. A note can be left on one shot; it travels as a
/// `comment` with the concept as the scene and the shot id beside it.
struct StoryBoardView: View {
    let board: StoryBoard
    let step: String
    @Environment(FilmSessionModel.self) private var model: FilmSessionModel?
    @State private var noting: String?
    @State private var draftNote = ""
    @State private var sentShots: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            StageSectionTitle("Story board")
            if !board.chips.isEmpty { chips }
            if let image = board.image {
                PayloadImage(path: image, contentMode: .fit, maxPixels: 2000)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                    .accessibilityLabel("The whole story board")
            }
            if !board.shots.isEmpty {
                ScrollView(.horizontal, showsIndicators: true) {
                    HStack(alignment: .top, spacing: 14) {
                        ForEach(Array(board.shots.enumerated()), id: \.element.id) { index, shot in tile(shot, number: index + 1) }
                    }
                    .padding(.bottom, 10)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    private var chips: some View {
        HStack(alignment: .top, spacing: 8) {
            ForEach(board.chips, id: \.label) { chip in
                HStack(spacing: 5) {
                    Text(chip.label).foregroundStyle(.tertiary).lineLimit(1).fixedSize()
                    Text(chip.value).foregroundStyle(.primary).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
                .font(.system(size: 11.5, weight: .medium))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                .help("\(chip.label): \(chip.value)")
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func tile(_ shot: StoryBoardShot, number: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Color.primary.opacity(0.05)
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .overlay { if let image = shot.image { PayloadImage(path: image, contentMode: .fill, maxPixels: 700) } else { Text(shot.see).font(.system(size: 11)).foregroundStyle(.secondary).padding(10).lineLimit(5) } }
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay(alignment: .topLeading) {
                    Text("\(number) · \(shot.t.map(clockText) ?? "")")
                        .font(.system(size: 10.5, weight: .bold).monospacedDigit())
                        .padding(.horizontal, 7).padding(.vertical, 3).background(.ultraThinMaterial, in: Capsule()).padding(7)
                }
            if !shot.words.isEmpty { Text("\u{201C}\(shot.words)\u{201D}").font(.system(size: 13, weight: .semibold, design: .serif)).lineLimit(3).fixedSize(horizontal: false, vertical: true) }
            VStack(alignment: .leading, spacing: 3) {
                if !shot.move.isEmpty { line("Move", shot.moveTitle) }
                if !shot.carrierState.isEmpty { line("Carrier", shot.carrierState) }
                if !shot.transition.isEmpty { line("Then", shot.transition) }
            }
            noteButton(shot)
        }
        .frame(width: 230, alignment: .topLeading)
        .accessibilityElement(children: .contain)
    }

    private func line(_ label: String, _ value: String) -> some View {
        (Text(label + " ").foregroundStyle(.tertiary) + Text(value).foregroundStyle(.secondary))
            .font(.system(size: 11.5)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder private func noteButton(_ shot: StoryBoardShot) -> some View {
        let enabled = model?.canAct(on: step) ?? false
        Button {
            draftNote = ""; noting = shot.id
        } label: {
            Label(sentShots.contains(shot.id) ? "Note sent" : "Note on this shot", systemImage: sentShots.contains(shot.id) ? "checkmark" : "text.bubble")
                .font(.system(size: 11.5))
        }
        .buttonStyle(.link)
        .disabled(!enabled)
        .popover(isPresented: Binding(get: { noting == shot.id }, set: { if !$0 { noting = nil } }), arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Note on shot \(shot.id)").font(.system(size: 13, weight: .semibold))
                TextEditor(text: $draftNote).font(.system(size: 13)).frame(width: 280, height: 90)
                    .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                HStack {
                    Spacer()
                    Button("Cancel") { noting = nil }.buttonStyle(.rasanSecondary)
                    Button("Send") { send(shot) }.buttonStyle(.rasanPrimary)
                        .disabled(draftNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(14)
        }
    }

    private func send(_ shot: StoryBoardShot) {
        let text = draftNote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let model else { return }
        noting = nil
        Task {
            if await model.send(step: step, type: "comment", value: StoryBoard.noteValue(concept: board.concept, shot: shot), note: text) { sentShots.insert(shot.id) }
        }
    }
}
