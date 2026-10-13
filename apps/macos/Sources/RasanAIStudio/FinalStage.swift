import AppKit
import AVKit
import StudioCore
import SwiftUI

/// Call 05, the render and the final (until it is finished; then FinishedView takes over): the film in a native player
/// with scene markers, notes on the picture, versions and what changed.
struct FinalStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var playback = VideoPlayback()
    @State private var stageHeight: CGFloat = 640
    @State private var showChanges = false

    var body: some View {
        let payload = model.payload(step)
        let scenes = model.snapshot.scenes(for: .final)
        let allNotes = model.snapshot.notes.filter { $0.step == step }
        let open = allNotes.filter(\.isOpen)
        let canAct = model.canAct(on: step)
        let videos = payload["videos"].array.compactMap(\.string)
        let videoPath = videos.last ?? payload["video"].string
        let videoURL = model.fileURL(videoPath)
        let posterPath = payload["poster"].string ?? scenes.first?.thumbnail
        let duration = payload["duration"].number ?? model.snapshot.duration(for: .final)
        let isRender = step == "render"
        let done = payload["status"].string == "done"
        // Nothing to watch yet: the first call is a quick preview, and notes open once it exists.
        let notRendered = isRender && !done && videoURL == nil

        // The same editor layout as the animatic: the player fills the space, the scenes run as a filmstrip under it,
        // notes live in the inspector, and the call's action sits in the bar at the bottom.
        VStack(spacing: Workspace.gap) {
            ReviewPlayerPanel(model: model, step: step, playback: playback, scenes: scenes, notes: allNotes,
                              aspect: model.snapshot.aspectRatio, canNote: canAct && playback.isReady, pinWindow: 2.5, showStrip: false) {
                FinalFrame(playback: playback, posterPath: posterPath, hasVideo: videoURL != nil, notRendered: notRendered)
            }
            .environment(\.reviewFrameHeight, max(200, stageHeight - 96 - (scenes.isEmpty ? 56 : 168) - Workspace.gap))
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 10) {
                    Text(scenes.isEmpty ? (isRender && !done ? "Ready to render" : "Your film") : "Scenes").font(.system(size: 13, weight: .semibold))
                    if !scenes.isEmpty { Text("\(scenes.count)").font(.system(size: 12)).foregroundStyle(.secondary) }
                    Spacer(minLength: 8)
                    if !open.isEmpty && canAct && isRender {
                        Button("Render without these notes") { Task { await model.send(step: step, type: "choose", value: .string("render")) } }
                            .buttonStyle(.link).font(.system(size: 12))
                    }
                    changes(payload)
                    controls(payload, isRender: isRender, done: done, canAct: canAct, firstPass: notRendered)
                }
                .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, scenes.isEmpty ? 10 : 0)
                if !scenes.isEmpty { SceneFilmstrip(playback: playback, scenes: scenes, open: open) }
            }
            .frame(height: scenes.isEmpty ? 56 : 168, alignment: .top)
            .workspacePanel()
            ReviewActionBar(model: model, step: step,
                            title: open.isEmpty ? (notRendered ? "Preview first" : isRender ? "Render the final" : "Export MP4") : "Apply \(open.count) note\(open.count == 1 ? "" : "s")",
                            symbol: open.isEmpty ? (notRendered ? "eye" : isRender ? "film.fill" : "square.and.arrow.down.fill") : "checkmark.bubble.fill",
                            signature: open.map(\.id).joined(separator: ",")) {
                Task {
                    if !open.isEmpty { await model.send(step: step, type: "apply", value: .object(["ids": .array(open.map { .string($0.id) })])) }
                    else if notRendered { await model.send(step: step, type: "choose", value: .string("preview")) }
                    else if isRender { await model.send(step: step, type: "choose", value: .string("render")) }
                    else { await model.send(step: step, type: "approve") }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { stageHeight = $0 }
        .preference(key: StageDrawsPanelsKey.self, value: true)
        .onChange(of: model.seekTick) { playback.seek(to: model.seekTime) }
        .environment(model)
        .task(id: "\(videoURL?.path ?? "")") { playback.load(url: videoURL, fallbackDuration: duration) }
        .onDisappear { playback.shutdown() }
    }

    // MARK: Controls under the player

    @ViewBuilder
    private func controls(_ payload: JSONValue, isRender: Bool, done: Bool, canAct: Bool, firstPass: Bool) -> some View {
        let versions = payload["versions"].array
        let current = payload["version"].identifier
        HStack(spacing: 8) {
            if versions.count > 1 {
                ReviewChip(symbol: "clock.arrow.circlepath", title: "Version", value: current.map { "v\($0)" } ?? "Latest", enabled: canAct) {
                    ForEach(versions.reversed().indices, id: \.self) { index in
                        let item = versions.reversed()[index]
                        let id = item["v"].identifier ?? ""
                        Button {
                            if id != current { Task { await model.send(step: step, type: "version", value: .object(["restore": item["v"]])) } }
                        } label: {
                            if id == current { Label(versionTitle(item), systemImage: "checkmark") } else { Text(versionTitle(item)) }
                        }
                    }
                }
            }
            if isRender && !done {
                Button { Task { await model.send(step: step, type: "choose", value: .string(firstPass ? "render" : "preview")) } } label: {
                    Label(firstPass ? "Render the final now" : "Preview again", systemImage: firstPass ? "film.fill" : "eye").font(.system(size: 12))
                        .padding(.horizontal, 11).padding(.vertical, 6)
                        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: Capsule())
                        .overlay { Capsule().strokeBorder(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 0.5) }
                }
                .buttonStyle(.plain).disabled(!canAct)
                .help(firstPass ? "Skip the preview and render the full-quality final." : "Make another quick, lower-quality preview before the full render.")
            }
            if let studio = payload["studio"].string, let url = URL(string: studio), ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                Button { SafeOpen.open(url) } label: {
                    Label("Open live preview", systemImage: "safari").font(.system(size: 12))
                        .padding(.horizontal, 11).padding(.vertical, 6)
                        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func versionTitle(_ item: JSONValue) -> String {
        let number = "v" + (item["v"].identifier ?? "?")
        guard let when = item["when"].string, !when.isEmpty else { return number }
        if let date = ISO8601DateFormatter().date(from: when) {
            return number + " · " + date.formatted(.relative(presentation: .named))
        }
        return number + " · " + when
    }

    /// "What changed in v3" as a quiet button in the filmstrip header; the list opens in a popover.
    @ViewBuilder
    private func changes(_ payload: JSONValue) -> some View {
        let items = payload["changes"].array.compactMap(\.string)
        if !items.isEmpty {
            Button { showChanges.toggle() } label: {
                Label("What changed" + (payload["version"].identifier.map { " in v\($0)" } ?? ""), systemImage: "sparkle").font(.system(size: 12))
            }
            .buttonStyle(.bordered).controlSize(.small)
            .popover(isPresented: $showChanges, arrowEdge: .top) {
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(items.indices, id: \.self) { index in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: "sparkle").font(.system(size: 10)).foregroundStyle(Color.rasan)
                            Text(items[index]).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(16).frame(width: 340, alignment: .leading)
            }
        }
    }
}

/// The player surface: the video once it can play, the poster until the first play, a quiet note when there is no file yet.
private struct FinalFrame: View {
    let playback: VideoPlayback
    let posterPath: String?
    let hasVideo: Bool
    var notRendered = false
    var body: some View {
        ZStack {
            Color.black
            if hasVideo { NativeFilmPlayer(player: playback.player) }
            if !hasVideo || !playback.hasStarted {
                if posterPath != nil { PayloadImage(path: posterPath, contentMode: .fit, maxPixels: 1800).transition(.opacity) }
                if !hasVideo {
                    Label(notRendered ? "Poster. Not rendered yet" : "The render isn't finished yet", systemImage: notRendered ? "photo" : "hourglass").font(.system(size: 12, weight: .medium)).foregroundStyle(.white)
                        .padding(.horizontal, 12).padding(.vertical, 7).background(.black.opacity(0.65), in: Capsule())
                        .frame(maxHeight: .infinity, alignment: .top).padding(14)
                }
            }
        }
        .animation(.easeOut(duration: 0.2), value: playback.hasStarted)
    }
}

/// The video surface with no controls of its own: one set of playback controls owns the clock, so pinned notes use the visible frame's time.
struct NativeFilmPlayer: NSViewRepresentable {
    let player: AVPlayer
    func makeNSView(context: Context) -> AVPlayerView {
        let view = AVPlayerView()
        view.controlsStyle = .none
        view.videoGravity = .resizeAspect
        view.player = player
        return view
    }
    func updateNSView(_ view: AVPlayerView, context: Context) { view.player = player }
}
