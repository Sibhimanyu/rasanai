import StudioCore
import SwiftUI

/// Call 04, the storyboard: a panel per scene (key frame, timing, line), playable over the music bed, with notes left on any panel.
struct AnimaticStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var playback = AnimaticPlayback()
    @State private var confirmStory = false
    @State private var confirmBuild = false
    @Environment(NoteSkips.self) private var skips: NoteSkips?
    @Environment(\.agentName) private var agent

    var body: some View {
        let payload = model.payload(step)
        let scenes = model.snapshot.scenes(for: .animatic)
        let allNotes = model.snapshot.notes.filter { $0.step == step }
        let open = allNotes.filter(\.isOpen)
        // Notes the person skipped stay on the storyboard; Apply just doesn't send them.
        let applying = open.filter { skips?.ids.contains($0.id) != true }
        let canAct = model.canAct(on: step)
        let audioPath = payload["audio"].string ?? payload["music"]["file"].string
        let audioURL = model.fileURL(audioPath)
        let duration = model.snapshot.duration(for: .animatic)
        let offset = payload["music"]["offset"].number ?? 0

        GeometryReader { outer in
            let wide = outer.size.width >= reviewSplitThreshold && outer.size.height >= 500 && !scenes.isEmpty
            if wide {
                // The Look page's arrangement: the crew header and a summary on the left, the storyboard filling the right.
                StoryboardSplit(size: outer.size, question: Self.question, context: Self.context, step: step) {
                    StoryboardSummary(playback: playback, scenes: scenes, open: open, canAct: canAct,
                                      showStory: payload["angles"] != .bool(false),
                                      onStory: { confirmStory = true }, onBuildWithout: { confirmBuild = true })
                } board: {
                    board(payload, scenes: scenes, notes: allNotes, canAct: canAct, maxColumns: 4)
                }
            } else {
                // The narrow fallback: the header on top, then the same storyboard with fewer columns.
                VStack(spacing: Workspace.gap) {
                    heading
                    if scenes.isEmpty {
                        emptyState.workspacePanel()
                    } else {
                        HStack(spacing: Workspace.columnGap) {
                            Text("\(scenes.count) scene\(scenes.count == 1 ? "" : "s") · \(reviewTime(scenes.last?.end ?? 0))")
                                .font(.system(size: 12)).monospacedDigit().foregroundStyle(.secondary)
                            Spacer(minLength: 8)
                            if payload["angles"] != .bool(false) {
                                Button("Try a different story…") { confirmStory = true }
                                    .buttonStyle(.link).font(.system(size: 12)).disabled(!canAct)
                            }
                            if !open.isEmpty && canAct { buildWithoutButton }
                        }
                        board(payload, scenes: scenes, notes: allNotes, canAct: canAct, maxColumns: 2)
                            .workspacePanel()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .background {
            ReviewActionBar(model: model, step: step,
                            title: applying.isEmpty ? "Approve & build"
                                : applying.count < open.count ? "Revise with \(applying.count) of \(open.count) notes"
                                : "Revise with \(open.count) note\(open.count == 1 ? "" : "s")",
                            symbol: applying.isEmpty ? "hammer.fill" : "checkmark.bubble.fill",
                            signature: applying.map(\.id).joined(separator: ",")) {
                Task {
                    if applying.isEmpty { await model.send(step: step, type: "approve") }
                    else { await model.send(step: step, type: "apply", value: .object(["ids": .array(applying.map { .string($0.id) })])) }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onChange(of: model.seekTick) { playback.seek(to: model.seekTime) }
        .environment(model)
        .task(id: "\(audioURL?.path ?? "")|\(duration)|\(offset)") {
            playback.configure(duration: duration, audio: audioURL, offset: offset)
        }
        .onDisappear { playback.shutdown() }
        .confirmationDialog("Try a different story?", isPresented: $confirmStory, titleVisibility: .visible) {
            Button("Ask for a different story") { Task { await model.send(step: step, type: "more", value: .object(["what": .string("angle")])) } }
        } message: { Text("\(agent) goes back to the story step and writes new ones. The look and storyboard are redone from the story you pick, which takes a while and costs another pass.") }
        .confirmationDialog("Build without your \(open.count) note\(open.count == 1 ? "" : "s")?", isPresented: $confirmBuild, titleVisibility: .visible) {
            Button("Build Without Notes") { Task { await model.send(step: step, type: "approve") } }
        } message: { Text("Your notes stay on the storyboard but are not applied.") }
    }

    private static let question = "Check the storyboard."
    private static let context = "Each panel is a key frame, timed to the music. The film moves; these are its beats. Leave a note on any panel."

    /// The step's one clear heading, spoken by the crew member. The panels are key frames at their real timing, not rendered video.
    private var heading: some View {
        StageHeader(question: Self.question, context: Self.context, step: step)
            .padding(.bottom, 4)
    }

    private var buildWithoutButton: some View {
        Button("Build without these notes…") { confirmBuild = true }
            .buttonStyle(.link).font(.system(size: 12))
            .help("Skip these notes and build the film as it is.")
    }

    private func board(_ payload: JSONValue, scenes: [FilmScene], notes: [ReviewNote], canAct: Bool, maxColumns: Int) -> some View {
        StoryboardBoard(model: model, step: step, playback: playback, scenes: scenes, notes: notes,
                        aspect: model.snapshot.aspectRatio, canNote: canAct, maxColumns: maxColumns) {
            chips(payload, canAct: canAct)
        }
    }

    private var emptyState: some View {
        ContentUnavailableView("The storyboard isn't ready yet", systemImage: "film",
                               description: Text("Panels appear here as \(agent) publishes them."))
            .frame(maxWidth: .infinity, minHeight: 300)
            .background(ReviewTheme.room, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .environment(\.colorScheme, .dark)
    }

    @ViewBuilder
    private func chips(_ payload: JSONValue, canAct: Bool) -> some View {
        let music = payload["music"]
        let voice = payload["voice"]
        let musicAlternatives = music["alternatives"].array
        let voiceAlternatives = voice["alternatives"].array
        HStack(spacing: 8) {
            if music != .null {
                ReviewChip(symbol: "music.note", title: "Music", value: music["title"].string ?? "Chosen", enabled: canAct && !musicAlternatives.isEmpty) {
                    ForEach(musicAlternatives.indices, id: \.self) { index in
                        let option = musicAlternatives[index]
                        Button {
                            Task { await model.send(step: step, type: "swap", value: .object(["chip": .string("music"), "id": option["id"]])) }
                        } label: {
                            Text([option["title"].string, option["mood"].string].compactMap { $0 }.joined(separator: " · "))
                        }
                    }
                }
            }
            if voice != .null {
                ReviewChip(symbol: "waveform", title: "Voice", value: voice["name"].string ?? "None", enabled: canAct && !voiceAlternatives.isEmpty) {
                    ForEach(voiceAlternatives.indices, id: \.self) { index in
                        let option = voiceAlternatives[index]
                        Button {
                            Task { await model.send(step: step, type: "swap", value: .object(["chip": .string("voice"), "id": option["id"]])) }
                        } label: { Text(option["name"].string ?? option["title"].string ?? "Voice") }
                    }
                }
            }
        }
    }
}
