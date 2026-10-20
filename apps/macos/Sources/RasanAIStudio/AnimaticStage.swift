import StudioCore
import SwiftUI

/// Call 04, the timed animatic: key frames at their real durations over the music bed, with notes left on the frame.
struct AnimaticStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var playback = AnimaticPlayback()
    @State private var confirmStory = false
    @State private var confirmBuild = false
    @State private var stageHeight: CGFloat = 640
    @Environment(NoteSkips.self) private var skips: NoteSkips?
    @Environment(\.agentName) private var agent

    var body: some View {
        let payload = model.payload(step)
        let scenes = model.snapshot.scenes(for: .animatic)
        let allNotes = model.snapshot.notes.filter { $0.step == step }
        let open = allNotes.filter(\.isOpen)
        // Notes the person skipped stay on the animatic; Apply just doesn't send them.
        let applying = open.filter { skips?.ids.contains($0.id) != true }
        let canAct = model.canAct(on: step)
        let audioPath = payload["audio"].string ?? payload["music"]["file"].string
        let audioURL = model.fileURL(audioPath)
        let duration = model.snapshot.duration(for: .animatic)
        let offset = payload["music"]["offset"].number ?? 0

        // An editor's layout: the player fills the space, the scenes run as a filmstrip under it, notes live in the
        // inspector beside it, and the call's action sits in the bar at the bottom.
        VStack(spacing: Workspace.gap) {
            heading
            if scenes.isEmpty {
                emptyState.workspacePanel()
            } else {
                ReviewPlayerPanel(model: model, step: step, playback: playback, scenes: scenes, notes: allNotes,
                                  aspect: model.snapshot.aspectRatio, canNote: canAct, pinWindow: nil, showStrip: false,
                                  caption: { index in index.flatMap { scenes.indices.contains($0) ? scenes[$0].line : nil } }) {
                    AnimaticFrame(playback: playback, scenes: scenes)
                }
                .environment(\.reviewFrameHeight, max(200, stageHeight - 96 - 168 - 84 - Workspace.gap))
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 10) {
                        Text("Scenes").font(.system(size: 13, weight: .semibold))
                        Text("\(scenes.count)").font(.system(size: 12)).foregroundStyle(.secondary)
                        Spacer(minLength: 8)
                        if !open.isEmpty && canAct {
                            Button("Build without these notes…") { confirmBuild = true }
                                .buttonStyle(.link).font(.system(size: 12))
                                .help("Skip these notes and build the film as it is.")
                        }
                        chips(payload, canAct: canAct)
                    }
                    .padding(.horizontal, .filmInset).padding(.top, 10)
                    SceneFilmstrip(playback: playback, scenes: scenes, open: open)
                }
                .frame(height: 168)
                .workspacePanel()
            }
            ReviewActionBar(model: model, step: step,
                            title: applying.isEmpty ? "Approve & build"
                                : applying.count < open.count ? "Apply \(applying.count) of \(open.count) notes"
                                : "Apply \(open.count) note\(open.count == 1 ? "" : "s")",
                            symbol: applying.isEmpty ? "hammer.fill" : "checkmark.bubble.fill",
                            signature: applying.map(\.id).joined(separator: ",")) {
                Task {
                    if applying.isEmpty { await model.send(step: step, type: "approve") }
                    else { await model.send(step: step, type: "apply", value: .object(["ids": .array(applying.map { .string($0.id) })])) }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { stageHeight = $0 }
        .onChange(of: model.seekTick) { playback.seek(to: model.seekTime) }
        .environment(model)
        .task(id: "\(audioURL?.path ?? "")|\(duration)|\(offset)") {
            playback.configure(duration: duration, audio: audioURL, offset: offset)
        }
        .onDisappear { playback.shutdown() }
        .confirmationDialog("Try a different story?", isPresented: $confirmStory, titleVisibility: .visible) {
            Button("Ask for a different story") { Task { await model.send(step: step, type: "more", value: .object(["what": .string("angle")])) } }
        } message: { Text("\(agent) goes back to the story step and writes new ones. The look and animatic are redone from the story you pick, which takes a while and costs another pass.") }
        .confirmationDialog("Build without your \(open.count) note\(open.count == 1 ? "" : "s")?", isPresented: $confirmBuild, titleVisibility: .visible) {
            Button("Build Without Notes") { Task { await model.send(step: step, type: "approve") } }
        } message: { Text("Your notes stay on the animatic but are not applied.") }
    }

    /// The step's one clear heading. The picture below is key frames at their real timing, not rendered video, so it says so.
    private var heading: some View {
        VStack(alignment: .leading, spacing: 6) {
            CrewByline(step: step).padding(.bottom, 4)
            Text("Watch the first cut.").font(.system(size: 30, weight: .semibold)).tracking(-0.3)
            Text("Review the pacing, story and sound before the final build.").font(.system(size: 15)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, .filmInset).padding(.bottom, 4)
        .accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
    }

    private var emptyState: some View {
        ContentUnavailableView("The animatic isn't ready yet", systemImage: "film",
                               description: Text("Key frames appear here as \(agent) publishes them."))
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
            if payload["angles"] != .bool(false) {
                Button {
                    confirmStory = true
                } label: {
                    Label("Try a different story…", systemImage: "arrow.triangle.2.circlepath").font(.system(size: 12))
                        .padding(.horizontal, 11).padding(.vertical, 6)
                        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: Capsule())
                        .overlay { Capsule().strokeBorder(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 0.5) }
                }
                .buttonStyle(.plain).disabled(!canAct)
                .help("Go back to the story step for new stories. The look and animatic are redone, so it costs another pass.")
            }
        }
    }
}

/// The key frame for the scene on the playhead, cross-fading at each cut.
private struct AnimaticFrame: View {
    let playback: AnimaticPlayback
    let scenes: [FilmScene]
    var body: some View {
        let index = FilmTiming.sceneIndex(at: playback.time, in: scenes) ?? 0
        let scene = scenes[index]
        ZStack {
            Color.black
            if let path = scene.thumbnail {
                PayloadImage(path: path, contentMode: .fit, maxPixels: 1800)
                    .id(scene.id).transition(.opacity)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "photo").font(.system(size: 26)).foregroundStyle(.white.opacity(0.4))
                    Text(scene.visual.isEmpty ? "No key frame yet" : scene.visual).font(.system(size: 13)).foregroundStyle(.white.opacity(0.6))
                        .multilineTextAlignment(.center).padding(.horizontal, 30)
                }
            }
        }
        .overlay(alignment: .topLeading) {
            Label("Timing preview", systemImage: "timer").font(.system(size: 12, weight: .medium)).foregroundStyle(.white)
                .padding(.horizontal, 11).padding(.vertical, 6).background(.black.opacity(0.55), in: Capsule())
                .padding(12).allowsHitTesting(false)
                .help("Key frames at their real timing over the music bed. Not the rendered film.")
        }
        .animation(.easeInOut(duration: 0.18), value: scene.id)
    }
}
