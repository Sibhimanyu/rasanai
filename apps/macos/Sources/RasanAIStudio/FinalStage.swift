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
    /// An earlier version being watched in the player; the film itself is unchanged.
    @State private var watching: JSONValue?
    /// Motion Studio: what is under a click, loaded from motion/element-index.json (absent for films without one).
    @State private var motionSel = MotionSelectionModel()
    @State private var motionEdits = MotionEditStatus()
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
        let shownURL = watching.flatMap { model.fileURL($0["video"].string) } ?? videoURL
        let posterPath = payload["poster"].string ?? scenes.first?.thumbnail
        let duration = payload["duration"].number ?? model.snapshot.duration(for: .final)
        let isRender = step == "render"
        let done = payload["status"].string == "done"
        // Nothing to watch yet: the first call is a quick preview, and notes open once it exists.
        let notRendered = isRender && !done && videoURL == nil

        let question = notRendered ? "Ready to render." : "Watch the final cut."
        let context = notRendered ? "Make a quick preview first, or render the full-quality final."
            : "Leave a note where something should change, or export when it feels right."
        let player = ReviewPlayerPanel(model: model, step: step, playback: playback, scenes: scenes, notes: allNotes,
                                       aspect: model.snapshot.aspectRatio, canNote: model.canNote(on: step) && playback.isReady, pinWindow: 2.5, showStrip: false,
                                       motionSel: motionSel.index != nil ? motionSel : nil) {
            FinalFrame(playback: playback, posterPath: posterPath, hasVideo: videoURL != nil, notRendered: notRendered, model: model)
        }

        GeometryReader { outer in
            let wide = outer.size.width >= reviewSplitThreshold && outer.size.height >= 500
            if wide {
                // The Look page's arrangement: the crew header and the film's details on the left, the final on the right.
                ReviewSplit(size: outer.size, question: question, context: context, step: step) {
                    VStack(spacing: 0) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 8) {
                                Text(scenes.isEmpty ? (isRender && !done ? "Ready to render" : "Your film") : "Scenes").font(.system(size: 13, weight: .semibold))
                                if !scenes.isEmpty { Text("\(scenes.count)").font(.system(size: 12)).foregroundStyle(.secondary) }
                                Spacer(minLength: 8)
                                if !open.isEmpty && canAct && isRender { renderWithoutButton }
                            }
                            FlowLayout(spacing: 8) {
                                changes(payload)
                                runChecks()
                            }
                            controls(payload, isRender: isRender, done: done, canAct: canAct, firstPass: notRendered, wrap: true)
                        }
                        .padding(.horizontal, Workspace.panelPadding).padding(.vertical, 12)
                        if !scenes.isEmpty {
                            Rectangle().fill(Workspace.hairline).frame(height: 1)
                            SceneList(playback: playback, scenes: scenes, open: open, aspect: model.snapshot.aspectRatio)
                        }
                    }
                } player: {
                    withMotionInspector(player)
                }
            } else {
                VStack(spacing: Workspace.gap) {
                    StageHeader(question: question, context: context, step: "final")
                        .padding(.bottom, 4)
                    withMotionInspector(player
                        .environment(\.reviewFrameHeight, max(200, stageHeight - 96 - 146 - (scenes.isEmpty ? 56 : 168) - Workspace.gap)))
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 10) {
                            Text(scenes.isEmpty ? (isRender && !done ? "Ready to render" : "Your film") : "Scenes").font(.system(size: 13, weight: .semibold))
                            if !scenes.isEmpty { Text("\(scenes.count)").font(.system(size: 12)).foregroundStyle(.secondary) }
                            Spacer(minLength: 8)
                            if !open.isEmpty && canAct && isRender { renderWithoutButton }
                            changes(payload)
                            runChecks()
                            controls(payload, isRender: isRender, done: done, canAct: canAct, firstPass: notRendered)
                        }
                        .padding(.horizontal, Workspace.panelPadding).padding(.top, 10).padding(.bottom, scenes.isEmpty ? 10 : 0)
                        if !scenes.isEmpty { SceneFilmstrip(playback: playback, scenes: scenes, open: open) }
                    }
                    .frame(height: scenes.isEmpty ? 56 : 168, alignment: .top)
                    .workspacePanel()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .background {
            ReviewActionBar(model: model, step: step,
                            title: applying.isEmpty ? (notRendered ? "Preview first" : isRender ? "Render the final" : "Export MP4")
                                : applying.count < open.count ? "Revise with \(applying.count) of \(open.count) notes"
                                : "Revise with \(open.count) note\(open.count == 1 ? "" : "s")",
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
        .task(id: "\(shownURL?.path ?? "")") { playback.load(url: shownURL, fallbackDuration: duration) }
        .task(id: model.snapshot.raw["updated"].string) { checks = await model.loadChecks() }
        .task(id: model.motionProject?.path) { await watchMotion() }
        .onDisappear { playback.shutdown() }
        .confirmationDialog("Render without your \(open.count) note\(open.count == 1 ? "" : "s")?", isPresented: $confirmRender, titleVisibility: .visible) {
            Button("Render Without Notes") { Task { await model.send(step: step, type: "choose", value: .string("render")) } }
        } message: { Text("Your notes stay on the film but are not applied.") }
        .confirmationDialog("Restore version \(restore?.identifier ?? "")?", isPresented: Binding(get: { restore != nil }, set: { if !$0 { restore = nil } }), titleVisibility: .visible) {
            Button("Restore version \(restore?.identifier ?? "")") {
                if let version = restore { Task { await model.send(step: step, type: "version", value: .object(["restore": version])) } }
                restore = nil
            }
        } message: { Text("\(agent) brings this version back. The other versions are kept.") }
    }

    // MARK: Motion Studio

    /// Reads the element index and the edit log; polls lightly while the film is on screen. Does nothing for a film without them.
    private func watchMotion() async {
        guard let project = model.motionProject, let run = model.motionRun else { return }
        while !Task.isCancelled {
            let loaded = await Task.detached(priority: .utility) {
                (MotionStudioStore.load(projectRoot: project).elementIndex, MotionStudioStore.loadEdits(run: run))
            }.value
            if loaded.0 != motionSel.index { motionSel.update(index: loaded.0, currentDigest: nil) }
            if loaded.1 != motionEdits { motionEdits = loaded.1 }
            try? await Task.sleep(for: .seconds(4))
        }
    }

    /// The player with a narrow inspector beside it, only when the film has an element index. Old films are unchanged.
    @ViewBuilder
    private func withMotionInspector<V: View>(_ player: V) -> some View {
        if motionSel.index == nil {
            player
        } else {
            HStack(alignment: .top, spacing: Workspace.gap) {
                player
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        MotionEditStatusChip(status: motionEdits)
                        if motionSel.state == .none {
                            Text("Click an element in the film to change it.").font(.system(size: 12)).foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        MotionInspectorPanel(selection: motionSel, filmVersion: motionSel.index?.filmVersion,
                                             existingEditIDs: motionEdits.lines.map(\.id),
                                             onAsk: { req in Task { await model.sendMotionEdit(req, step: "final") } },
                                             onNote: { text in
                                                 Task { if !(await model.sendPendingMark(text: text)) { _ = await model.tell(text, step: step) } }
                                             })
                    }
                    .padding(10)
                }
                .frame(width: 280).frame(maxHeight: .infinity, alignment: .top)
                .workspacePanel()
                .accessibilityLabel("Film element inspector")
            }
        }
    }

    private var renderWithoutButton: some View {
        Button("Render without these notes…") { confirmRender = true }
            .buttonStyle(.link).font(.system(size: 12))
    }

    // MARK: Controls under the player

    @ViewBuilder
    private func controls(_ payload: JSONValue, isRender: Bool, done: Bool, canAct: Bool, firstPass: Bool, wrap: Bool = false) -> some View {
        let versions = payload["versions"].array
        let current = payload["version"].identifier
        let layout = wrap ? AnyLayout(FlowLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
        layout {
            if versions.count > 1 {
                ReviewChip(symbol: "clock.arrow.circlepath", title: "Version", value: current.map { "Version \($0)" } ?? "Latest", enabled: true) {
                    ForEach(versions.reversed().indices, id: \.self) { index in
                        let item = versions.reversed()[index]
                        let id = item["v"].identifier ?? ""
                        Menu {
                            Button("Watch") { watching = id == current ? nil : item }
                                .disabled(id != current && model.fileURL(item["video"].string) == nil)
                            Button("Restore…") { restore = item["v"] }
                                .disabled(!canAct || id == current)
                        } label: {
                            if id == current { Label(versionTitle(item), systemImage: "checkmark") } else { Text(versionTitle(item)) }
                        }
                    }
                }
            }
            if let watching {
                HStack(spacing: 6) {
                    Text("Watching an earlier version (Version \(watching["v"].identifier ?? "?"))").font(.system(size: 12, weight: .medium)).foregroundStyle(Color.rasan)
                    Button("Back to latest") { self.watching = nil }.buttonStyle(.link).font(.system(size: 12))
                }
            }
            // Only the first pass offers skipping straight to the final. "Preview again" (another draft of the same film) is gone:
            // it spent a full draft render without changing anything.
            if isRender && !done && firstPass {
                Button { Task { await model.send(step: step, type: "choose", value: .string("render")) } } label: {
                    Label("Render the final now", systemImage: "film.fill").font(.system(size: 12))
                        .padding(.horizontal, 11).padding(.vertical, 6)
                        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: Capsule())
                        .overlay { Capsule().strokeBorder(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 0.5) }
                }
                .buttonStyle(.plain).disabled(!canAct)
                .help("Skip the preview and render the full-quality final.")
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
        FilmVersionText.line(number: item["v"].identifier ?? "?", when: item["when"].string,
                             summary: item["changes"].array.compactMap(\.string).first ?? item["summary"].string ?? item["note"].string)
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

/// The latest Motion Studio edit's state (requested, applied, rendered, failed), nothing when there are none.
private struct MotionEditStatusChip: View {
    let status: MotionEditStatus
    var body: some View {
        if let line = status.lines.last, let state = line.status {
            Label(title(state, count: status.lines.count), systemImage: symbol(state))
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(state == .failed ? Color(nsColor: .systemOrange) : state == .rendered ? Color.rasan : Color.secondary)
                .padding(.horizontal, 9).padding(.vertical, 4)
                .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: Capsule())
                .help(line.note ?? line.instruction ?? "")
                .accessibilityLabel("Latest edit: \(state.rawValue)")
        }
    }
    private func title(_ s: MotionEditState, count: Int) -> String {
        let word = s.rawValue.prefix(1).uppercased() + s.rawValue.dropFirst()
        return count > 1 ? "\(word) (\(count) edits)" : word
    }
    private func symbol(_ s: MotionEditState) -> String {
        switch s {
        case .requested, .accepted, .unknown: "clock"
        case .applied: "checkmark"
        case .rendered: "checkmark.circle.fill"
        case .failed: "exclamationmark.triangle"
        case .reverted: "arrow.uturn.backward"
        }
    }
}
