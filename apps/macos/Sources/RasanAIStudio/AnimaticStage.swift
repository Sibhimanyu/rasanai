import StudioCore
import SwiftUI

/// Call 04, the timed animatic: key frames at their real durations over the music bed, with notes left on the frame.
struct AnimaticStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var playback = AnimaticPlayback()

    var body: some View {
        let payload = model.payload(step)
        let scenes = model.snapshot.scenes(for: .animatic)
        let allNotes = model.snapshot.notes.filter { $0.step == step }
        let open = allNotes.filter(\.isOpen)
        let canAct = model.canAct(on: step)
        let audioPath = payload["audio"].string ?? payload["music"]["file"].string
        let audioURL = model.fileURL(audioPath)
        let duration = model.snapshot.duration(for: .animatic)
        let offset = payload["music"]["offset"].number ?? 0

        StageScaffold(model: model, step: step,
                      question: payload["question"].string ?? "Here's the whole film, rough",
                      context: payload["context"].string,
                      maxWidth: 1180) {
            HStack(alignment: .top, spacing: 24) {
                VStack(alignment: .leading, spacing: 14) {
                    if scenes.isEmpty {
                        emptyState
                    } else {
                        ReviewPlayerPanel(model: model, step: step, playback: playback, scenes: scenes, notes: allNotes,
                                          aspect: model.snapshot.aspectRatio, canNote: canAct, pinWindow: nil,
                                          caption: { index in index.flatMap { scenes.indices.contains($0) ? scenes[$0].line : nil } }) {
                            AnimaticFrame(playback: playback, scenes: scenes)
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                VStack(alignment: .leading, spacing: 14) {
                    NowShowing(playback: playback, scenes: scenes)
                    chips(payload, canAct: canAct)
                    HStack {
                        StageSectionTitle(open.isEmpty ? "Notes" : "Notes · \(open.count) open")
                        Spacer()
                        if !open.isEmpty && canAct {
                            Button("Build without these notes") { Task { await model.send(step: step, type: "approve") } }
                                .buttonStyle(.link).font(.system(size: 12))
                                .help("Skip these notes and build the film as it is.")
                        }
                    }
                    ReviewNotesList(notes: allNotes, scenes: scenes) { playback.seek(to: $0) }
                    FilmNoteField(model: model, step: step, enabled: canAct)
                    if !open.isEmpty && canAct {
                        Label("Claude revises the animatic and shows it again. Nothing is built until you say it looks right.", systemImage: "arrow.triangle.2.circlepath")
                            .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(width: 290)
            }
        } actions: {
            ReviewActionBar(model: model, step: step,
                            title: open.isEmpty ? "Looks right, build it" : "Apply \(open.count) note\(open.count == 1 ? "" : "s")",
                            symbol: open.isEmpty ? "hammer.fill" : "checkmark.bubble.fill") {
                Task {
                    if open.isEmpty { await model.send(step: step, type: "approve") }
                    else { await model.send(step: step, type: "apply", value: .object(["ids": .array(open.map { .string($0.id) })])) }
                }
            }
        }
        .reviewFrameFitting()
        .environment(model)
        .task(id: "\(audioURL?.path ?? "")|\(duration)|\(offset)") {
            playback.configure(duration: duration, audio: audioURL, offset: offset)
        }
        .onDisappear { playback.shutdown() }
    }

    private var emptyState: some View {
        ContentUnavailableView("The animatic isn't ready yet", systemImage: "film",
                               description: Text("Key frames appear here as Claude publishes them."))
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
        FlowLayout(spacing: 8) {
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
                    Task { await model.send(step: step, type: "more", value: .object(["what": .string("angle")])) }
                } label: {
                    Label("Try another angle", systemImage: "arrow.triangle.2.circlepath").font(.system(size: 12))
                        .padding(.horizontal, 11).padding(.vertical, 6)
                        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: Capsule())
                        .overlay { Capsule().strokeBorder(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 0.5) }
                }
                .buttonStyle(.plain).disabled(!canAct)
                .help("Ask Claude for a different way into the same story.")
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
        .animation(.easeInOut(duration: 0.18), value: scene.id)
    }
}

/// What is on screen right now: the scene, its line and what we see.
private struct NowShowing: View {
    let playback: AnimaticPlayback
    let scenes: [FilmScene]
    var body: some View {
        if let index = FilmTiming.sceneIndex(at: playback.time, in: scenes) {
            let scene = scenes[index]
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    StageSectionTitle("Scene \(index + 1) of \(scenes.count)")
                    Spacer()
                    Text("\(reviewTime(scene.start)) – \(reviewTime(scene.end))").font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                }
                Text(scene.title).font(.system(size: 15, weight: .semibold))
                if !scene.line.isEmpty {
                    Text("“\(scene.line)”").font(.system(size: 13)).foregroundStyle(.primary.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
                }
                if !scene.visual.isEmpty {
                    Label(scene.visual, systemImage: "eye").font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            .stageCard(padding: 14)
            .animation(.smooth(duration: 0.2), value: index)
            .accessibilityElement(children: .combine)
        }
    }
}
