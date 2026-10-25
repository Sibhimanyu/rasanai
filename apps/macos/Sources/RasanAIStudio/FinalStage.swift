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
    @State private var showChecks = false
    @State private var checks: RunChecks?
    @State private var confirmRender = false
    /// The version the person picked in the menu, until they confirm bringing it back.
    @State private var restore: JSONValue?
    @Environment(NoteSkips.self) private var skips: NoteSkips?
    @Environment(\.agentName) private var agent

    var body: some View {
        let payload = model.payload(step)
        let scenes = model.snapshot.scenes(for: .final)
        let allNotes = model.snapshot.notes.filter { $0.step == step }
        let open = allNotes.filter(\.isOpen)
        let applying = open.filter { skips?.ids.contains($0.id) != true }
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
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    CrewByline(step: "final").padding(.bottom, 4)
                    Text(notRendered ? "Ready to render." : "Watch the final cut.").font(.system(size: 30, weight: .semibold)).tracking(-0.3)
                    Text(notRendered ? "Make a quick preview first, or render the full-quality final."
                         : "Leave a note where something should change, or export when it feels right.")
                        .font(.system(size: 15)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, .filmInset).padding(.top, 10).padding(.bottom, 4)
            .accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
            ReviewPlayerPanel(model: model, step: step, playback: playback, scenes: scenes, notes: allNotes,
                              aspect: model.snapshot.aspectRatio, canNote: canAct && playback.isReady, pinWindow: 2.5, showStrip: false) {
                FinalFrame(playback: playback, posterPath: posterPath, hasVideo: videoURL != nil, notRendered: notRendered, model: model)
            }
            .environment(\.reviewFrameHeight, max(200, stageHeight - 96 - 84 - (scenes.isEmpty ? 56 : 168) - Workspace.gap))
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 10) {
                    Text(scenes.isEmpty ? (isRender && !done ? "Ready to render" : "Your film") : "Scenes").font(.system(size: 13, weight: .semibold))
                    if !scenes.isEmpty { Text("\(scenes.count)").font(.system(size: 12)).foregroundStyle(.secondary) }
                    Spacer(minLength: 8)
                    if !open.isEmpty && canAct && isRender {
                        Button("Render without these notes…") { confirmRender = true }
                            .buttonStyle(.link).font(.system(size: 12))
                    }
                    changes(payload)
                    runChecks()
                    controls(payload, isRender: isRender, done: done, canAct: canAct, firstPass: notRendered)
                }
                .padding(.horizontal, .filmInset).padding(.top, 10).padding(.bottom, scenes.isEmpty ? 10 : 0)
                if !scenes.isEmpty { SceneFilmstrip(playback: playback, scenes: scenes, open: open) }
            }
            .frame(height: scenes.isEmpty ? 56 : 168, alignment: .top)
            .workspacePanel()
            ReviewActionBar(model: model, step: step,
                            title: applying.isEmpty ? (notRendered ? "Preview first" : isRender ? "Render the final" : "Export MP4")
                                : applying.count < open.count ? "Apply \(applying.count) of \(open.count) notes"
                                : "Apply \(open.count) note\(open.count == 1 ? "" : "s")",
                            symbol: applying.isEmpty ? (notRendered ? "eye" : isRender ? "film.fill" : "square.and.arrow.down.fill") : "checkmark.bubble.fill",
                            signature: applying.map(\.id).joined(separator: ",")) {
                Task {
                    if !applying.isEmpty { await model.send(step: step, type: "apply", value: .object(["ids": .array(applying.map { .string($0.id) })])) }
                    else if notRendered { await model.send(step: step, type: "choose", value: .string("preview")) }
                    else if isRender { await model.send(step: step, type: "choose", value: .string("render")) }
                    else { await model.send(step: step, type: "approve") }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { stageHeight = $0 }
        .onChange(of: model.seekTick) { playback.seek(to: model.seekTime) }
        .environment(model)
        .task(id: "\(videoURL?.path ?? "")") { playback.load(url: videoURL, fallbackDuration: duration) }
        .task(id: model.snapshot.raw["updated"].string) { checks = await model.loadChecks() }
        .onDisappear { playback.shutdown() }
        .confirmationDialog("Render without your \(open.count) note\(open.count == 1 ? "" : "s")?", isPresented: $confirmRender, titleVisibility: .visible) {
            Button("Render Without Notes") { Task { await model.send(step: step, type: "choose", value: .string("render")) } }
        } message: { Text("Your notes stay on the film but are not applied.") }
        .confirmationDialog("Restore v\(restore?.identifier ?? "")?", isPresented: Binding(get: { restore != nil }, set: { if !$0 { restore = nil } }), titleVisibility: .visible) {
            Button("Restore v\(restore?.identifier ?? "")") {
                if let version = restore { Task { await model.send(step: step, type: "version", value: .object(["restore": version])) } }
                restore = nil
            }
        } message: { Text("\(agent) brings this version back. The other versions are kept.") }
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
                            if id != current { restore = item["v"] }
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

    /// The blind A/B verdicts and the gate numbers, one quiet button beside "What changed"; absent when the run holds neither.
    @ViewBuilder
    private func runChecks() -> some View {
        if let checks, !checks.isEmpty {
            Button { showChecks.toggle() } label: { Label("Checks", systemImage: "checklist").font(.system(size: 12)) }
                .buttonStyle(.rasanSecondary).controlSize(.small)
                .popover(isPresented: $showChecks, arrowEdge: .top) { ScrollView { RunChecksView(checks: checks) }.frame(maxHeight: 460) }
        }
    }

    /// "What changed in v3" as a quiet button in the filmstrip header; the list opens in a popover.
    @ViewBuilder
    private func changes(_ payload: JSONValue) -> some View {
        let items = payload["changes"].array.compactMap(\.string)
        if !items.isEmpty {
            Button { showChanges.toggle() } label: {
                Label("What changed" + (payload["version"].identifier.map { " in v\($0)" } ?? ""), systemImage: "sparkle").font(.system(size: 12))
            }
            .buttonStyle(.rasanSecondary).controlSize(.small)
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
    var model: FilmSessionModel?
    var body: some View {
        ZStack {
            Color.black
            if hasVideo { NativeFilmPlayer(player: playback.player) }
            if hasVideo, let model { ElementDirectOverlay(model: model, playback: playback) }   // Plan 10 U4: edit elements through the engine (off until "Edit elements")
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
