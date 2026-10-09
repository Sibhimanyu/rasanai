import AppKit
import AVKit
import Combine
import StudioCore
import SwiftUI

/// One film. The engine console is the workflow while it runs; a player takes over when it's finished.
struct FilmPage: View {
    @Bindable var store: StudioStore
    let url: URL
    @Environment(\.openSettings) private var openSettings
    @State private var draft: FilmDraft?

    private var ready: Bool { store.loadedFilm == url }
    private var phase: FilmPhase { store.phase }
    private var showsFinished: Bool { if case .finished = phase { return !store.showChanges } else { return false } }
    private var isFinished: Bool { if case .finished = phase { true } else { false } }
    private var showsConsole: Bool { store.film != nil && (store.isConnected || store.runtime.isRunning || store.runtime.isPreparing) }

    /// The page itself, below the stage bar. The bar is laid out above it (not as a safe-area inset) so the stage's own
    /// scroll view starts under the bar and its first line never hides behind it.
    @ViewBuilder private var pageContent: some View {
        Group {
            if !ready {
                ProgressView().controlSize(.large).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.runURL == nil {
                if store.runtime.isPreparing || store.runtime.isRunning { StartingView(runtime: store.runtime) }
                else { DraftView(store: store, url: url, draft: draft) }
            } else if showsFinished {
                withDecisions { FinishedView(store: store) }
            } else if let film = store.film, store.isConnected || store.runtime.isRunning || store.runtime.isPreparing {
                NativeFilmView(model: film, startedAt: store.runtime.startedAt, progress: store.progress,
                               onPause: store.runtime.isRunning ? { store.pauseDirector() } : nil,
                               onShowLog: store.runtime.logURL != nil ? { store.sheet = .log } : nil,
                               pace: draft?.pace ?? store.settings.pace)
            } else if store.runtime.isRunning || store.runtime.isPreparing {
                StartingView(runtime: store.runtime)
            } else {
                withDecisions { NotRunningView(store: store) }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    /// Pages without the native stage view (finished, console not running) still get the Decisions inspector, with
    /// the same toolbar buttons (see `toolbarItems`), so a finished film's calls and the conversation stay reachable.
    @ViewBuilder private func withDecisions<Page: View>(@ViewBuilder _ page: () -> Page) -> some View {
        if let film = store.film { DecisionsHost(model: film, page: page()) } else { page() }
    }
    /// Film progress carries its own pause button and log link, so the thin banner would only repeat it.
    private var showsFilmProgress: Bool {
        guard store.progress != nil, let route = store.film?.route else { return false }
        return route == .working || route == .build
    }
    /// Claude is busy with the next call: the stage bar ticks the decided calls and marks the next one as being worked on.
    private var isWorkingOnNextCall: Bool {
        !isFinished && (showsFilmProgress || (store.runtime.isRunning && !store.hasPendingQuestion && store.phase == .working))
    }
    private var showsNativeFilm: Bool {
        ready && store.runURL != nil && !showsFinished && store.film != nil && (store.isConnected || store.runtime.isRunning || store.runtime.isPreparing)
    }

    @ViewBuilder private var topChrome: some View {
            if ready && store.runURL != nil {
                VStack(spacing: 0) {
                    FilmStageBar(current: store.snapshot.stage, finished: isFinished, viewing: store.film?.viewingStage,
                                 decided: isWorkingOnNextCall ? store.snapshot.decidedCalls : nil,
                                 canSelect: { store.film?.canView($0) ?? false }, onSelect: { store.film?.view($0) })
                    MonitorBudgetBanner(store: store)
                    if !showsFinished {
                        if showsConsole, !store.runtime.stopRequested, let recovery = store.runtime.recovery {
                            DirectorRecoveryView(store: store, recovery: recovery)
                        } else if store.runtime.isRunning && !store.hasPendingQuestion && store.phase == .working && !showsFilmProgress {
                            DirectorProgressView(store: store)
                        }
                    }
                }
            }
    }

    var body: some View {
        VStack(spacing: 0) {
            topChrome
            pageContent
        }
        .animation(.snappy, value: ready)
        .animation(.snappy, value: showsFinished)
        .navigationTitle(ready ? store.currentFilmTitle : "Film")
        .toolbar { if ready { toolbarItems } }
        .onAppear {
            store.activateFilm(url)
            if let progress = store.progress { ProgressNotifier.shared.watch(progress, settings: store.settings) }
        }
        .onChange(of: store.runURL) { _, _ in
            if let progress = store.progress { ProgressNotifier.shared.watch(progress, settings: store.settings) }
        }
        .task(id: "\(store.settings.agent.id):\(store.settings.path(for: store.settings.agent))") { await store.settings.check(store.settings.agent) }
        .task(id: store.loadedFilm) {
            guard store.loadedFilm == url else { return }
            draft = await Task.detached { [url] in FilmDraft.load(in: url) }.value
        }
        .onDisappear { store.finalPlayer?.pause() }
    }

    @ToolbarContentBuilder private var toolbarItems: some ToolbarContent {
        ToolbarItem(placement: .principal) { StatusPill(store: store) }
        if let film = store.film, store.runURL != nil, !showsNativeFilm { FilmToolbarItems(model: film) }
        ToolbarItemGroup(placement: .primaryAction) {
            if store.finalURL != nil {
                if store.showChanges, case .finished = phase {
                    Button { store.showChanges = false } label: { Label("Watch film", systemImage: "play.rectangle") }
                }
                if let video = store.finalURL {
                    ShareLink(item: video) { Label("Share", systemImage: "square.and.arrow.up") }.help("Share the finished film")
                }
            }
            Menu {
                if store.runtime.isRunning { Button("Pause Director") { store.pauseDirector() } }
                else if store.canResume { Button("Resume Director") { store.resumeDirector() } }
                if store.runtime.logURL != nil { Button("Show Log") { store.sheet = .log } }
                if store.selectedProjectURL != nil { Button("Files…") { store.reloadSources(); store.sheet = .files } }
                Button("Check readiness…") { store.showPreflight(project: store.selectedProjectURL) }
                if let project = store.selectedProjectURL { Button("Export Project…") { store.exportProject(project) } }
                Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([store.selectedProjectURL ?? store.runURL ?? url]) }
                if store.runURL != nil { Button("Reload film") { store.reloadFilm() } }
            } label: { Image(systemName: "ellipsis.circle") }
            HelpButton(title: "This film", lines: helpLines)
        }
    }

    private var helpLines: [String] {
        switch phase {
        case .draft: ["This film has not started yet. Check the brief, then press Start film."]
        case .finished: ["Your film is ready. Export it, or watch it and add notes where something should change."]
        case .yourTurn: ["RasanAI is waiting for you. Answer in the panel below, and it carries on from there.", "You can leave the app; you will be notified if that is turned on."]
        default: ["RasanAI is directing this film. Each step it needs you for shows up here.", "Pause Director in the ••• menu stops it safely. Your files are kept, and you can resume any time."]
        }
    }
}

// MARK: Status pill

struct StatusPill: View {
    @Bindable var store: StudioStore
    /// During a DEBUG replay the monitor has no telemetry for the run, so the pill reads the progress model's totals instead.
    static func replayPill(_ s: FilmProgressSnapshot?) -> String? {
        guard let s else { return nil }
        var parts = [s.currentPhase.title, "\(UsageFormat.tokens(s.totalTokens.fresh)) tokens"]
        if !s.isIncludedInPlan, s.totalCostUSD > 0 { parts.append(UsageFormat.dollars(s.totalCostUSD) + (s.costIsEstimated ? " est." : "")) }
        return parts.joined(separator: " · ")
    }
    @State private var monitorOpen = false
    var body: some View {
        let phase = store.phase
        let offline = phase == .offline && store.runURL != nil
        let monitor = store.monitor
        let replaying = store.progress.map { $0.isReplay } ?? false
        let live = offline ? nil : (replaying ? Self.replayPill(store.progress?.snapshot) : monitor.pillText(fallback: phase.pill, for: store.runURL))
        let state = monitor.health?.state
        Button { if offline { store.reloadFilm() } else if live != nil { monitorOpen.toggle() } } label: {
            HStack(spacing: 7) {
                if live != nil, let state { if state.isLive { ProgressView().controlSize(.mini) } else { StatusDot(tone: state.tone) } }
                else if phase.isBusy { ProgressView().controlSize(.mini) } else { StatusDot(tone: phase.tone) }
                Text(offline ? "Files unreadable · Reload film" : (live ?? phase.pill)).font(.system(size: 12, weight: .medium)).monospacedDigit()
                if live != nil { Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold)).foregroundStyle(.secondary) }
            }
            .padding(.horizontal, 12).padding(.vertical, 4)
            .background((state == .possiblyLooping && live != nil ? Color(nsColor: .systemRed).opacity(0.2) : Color(nsColor: .quaternaryLabelColor).opacity(0.45)), in: Capsule())
            .animation(.snappy, value: phase)
        }
        .buttonStyle(.plain).disabled(!offline && live == nil)
        .popover(isPresented: $monitorOpen, arrowEdge: .bottom) { DirectorMonitorPanel(monitor: monitor, progress: store.progress?.snapshot) { monitorOpen = false } }
        .help(live != nil ? "Director details: state, tokens, cost and recent activity" : "")
        .accessibilityLabel(offline ? "Film files unreadable. Reload film" : (live ?? phase.pill))
    }
}

// MARK: States

struct StartingView: View {
    @Bindable var runtime: DirectorRuntime
    var body: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large)
            Text(runtime.status).font(.system(size: 15, weight: .medium))
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let elapsed = context.date.timeIntervalSince(runtime.startedAt ?? context.date)
                Text("\(clockText(max(0, elapsed))) elapsed · Your existing work is kept.")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                if elapsed > 20 {
                    Text("Setup is taking longer than usual. If it fails, RasanAI will explain what to check.")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct DirectorRecoveryView: View {
    @Bindable var store: StudioStore
    let recovery: DirectorRecovery
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 4) {
                Text(recovery.title).font(.system(size: 13, weight: .semibold))
                Text(recovery.message).font(.system(size: 12)).foregroundStyle(.secondary)
                if !store.runtime.recoveryDetail.isEmpty {
                    Text(store.runtime.recoveryDetail).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary).lineLimit(4).textSelection(.enabled)
                }
            }
            Spacer(minLength: 8)
            if recovery == .signIn { Button("Sign in…") { store.settings.showWelcome = true } }
            Button("Show log") { store.sheet = .log }
            Button("Resume") { store.resumeDirector() }.disabled(!store.canResume)
        }
        .padding(14).background(Color.orange.opacity(0.08))
        .overlay(alignment: .bottom) { Divider() }
    }
}

struct DirectorProgressView: View {
    @Bindable var store: StudioStore
    @State private var lastActivityAt = Date()
    private var activity: String { store.snapshot.latestActivity ?? store.snapshot.workingMessage ?? "Your director is working on the film." }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let elapsed = context.date.timeIntervalSince(store.runtime.startedAt ?? context.date)
            let quiet = context.date.timeIntervalSince(lastActivityAt) > 120
            HStack(spacing: 12) {
                ProgressView().controlSize(.small)
                VStack(alignment: .leading, spacing: 3) {
                    Text(activity).font(.system(size: 12)).lineLimit(2).textSelection(.enabled)
                    if quiet {
                        Text("No new activity for two minutes. Check the log, or pause and resume if needed.")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                Text("\(clockText(max(0, elapsed))) elapsed").font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit()
                Button(quiet ? "Show log" : "Details") { store.sheet = .log }
                Button("Pause") { store.pauseDirector() }
            }.padding(.horizontal, 16).padding(.vertical, 10)
        }
        .background(.regularMaterial).overlay(alignment: .bottom) { Divider() }
        .onChange(of: store.snapshot.raw["activity"]) { lastActivityAt = Date() }
        .onChange(of: store.snapshot.workingMessage) { lastActivityAt = Date() }
    }
}

private struct DecisionsHost<Page: View>: View {
    @Bindable var model: FilmSessionModel
    let page: Page
    var body: some View { page.inspector(isPresented: $model.decisionsPresented) { DecisionsInspector(model: model) } }
}

struct NotRunningView: View {
    @Bindable var store: StudioStore
    var body: some View {
        VStack(spacing: 16) {
            RasanMark().fill(Color.rasanInk.opacity(0.35)).frame(width: 34, height: 42)
            Text(store.runtime.recovery?.title ?? "RasanAI isn't running for this film.").font(.system(size: 20, weight: .semibold))
            if let recovery = store.runtime.recovery {
                Text(recovery.message).font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 540)
                if !store.runtime.recoveryDetail.isEmpty {
                    Text(store.runtime.recoveryDetail).font(.system(size: 12, design: .monospaced)).foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading).lineLimit(5).textSelection(.enabled).frame(maxWidth: 540, alignment: .leading)
                }
            } else if let code = store.runtime.lastExitCode, code != 0 {
                Text("The last session stopped unexpectedly. The log shows why.").font(.system(size: 13)).foregroundStyle(.secondary)
            } else {
                Text("Your work is saved. Resume and it carries on where it left off.").font(.system(size: 13)).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                if store.runtime.recovery == .signIn {
                    Button("Sign in…") { store.settings.showWelcome = true }.buttonStyle(.borderedProminent).controlSize(.large)
                    Button("Resume") { store.resumeDirector() }.controlSize(.large).disabled(!store.canResume)
                } else {
                    Button("Resume") { store.resumeDirector() }
                        .buttonStyle(.borderedProminent).controlSize(.large).disabled(!store.canResume)
                }
                if store.runtime.recovery == nil, store.runURL != nil, !store.isConnected {
                    Button("Reload film") { store.reloadFilm() }.controlSize(.large)
                }
                if store.runtime.logURL != nil, store.runtime.recovery != nil || (store.runtime.lastExitCode ?? 0) != 0 {
                    Button("Show log") { store.sheet = .log }.controlSize(.large)
                }
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity).padding(40)
    }
}

struct DraftView: View {
    @Bindable var store: StudioStore
    let url: URL
    let draft: FilmDraft?
    @Environment(\.openSettings) private var openSettings
    @State private var starting = false
    private var agent: LocalAgent { store.settings.agent }
    private var ready: Bool { store.settings.isReady(agent) }
    private var queued: Bool { store.settings.filmQueue.contains { $0.project == url } }
    /// Waiting films can still be edited; only a running or stuck one is locked.
    private var editable: Bool { !queued || store.isWaitingInQueue(url) }
    private var shape: String { ["16:9": "Landscape", "9:16": "Portrait", "1:1": "Square"][draft?.aspect ?? "16:9"] ?? "Landscape" }

    var body: some View {
        ScrollView {
            VStack(spacing: 26) {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Text("The brief").font(.system(size: 22, weight: .semibold))
                        Spacer()
                        Button("Edit") { store.path.append(.newFilm(url)) }.controlSize(.regular).disabled(!editable)
                    }
                    Text((draft?.brief ?? "").isEmpty ? "No description yet. Edit the brief to add one." : draft!.brief)
                        .font(.system(size: 14)).lineSpacing(3).foregroundStyle((draft?.brief ?? "").isEmpty ? .secondary : .primary)
                        .frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
                    Divider()
                    FlowLayout(spacing: 8) {
                        fact("clock", "\(draft?.duration ?? 45) seconds")
                        fact("rectangle", shape)
                        fact("sparkles", (draft?.motionLevel ?? "maximal").capitalized + " motion")
                        if let brand = draft?.brand { fact("swatchpalette", brand) }
                        Button { store.reloadSources(); store.sheet = .files } label: {
                            fact("paperclip", store.projectSources.isEmpty ? "No files" : "\(store.projectSources.count) \(store.projectSources.count == 1 ? "file" : "files")")
                        }.buttonStyle(.plain)
                    }
                }
                .padding(24).cardSurface()
                VStack(spacing: 8) {
                    if queued {
                        Button("View queue") { store.path.append(.queue) }.buttonStyle(.borderedProminent).controlSize(.large)
                        Text(editable ? "This film is waiting in the queue. You can still edit the brief; it starts when the director is free."
                                       : "This film is running from the queue. Open the queue to follow it or take it out.")
                            .font(.system(size: 12)).foregroundStyle(.secondary)
                    } else if ready {
                        Button { start() } label: {
                            HStack(spacing: 8) { if starting { ProgressView().controlSize(.small) }; Text("Start film") }.frame(minWidth: 160)
                        }
                        .buttonStyle(.borderedProminent).controlSize(.extraLarge)
                        .keyboardShortcut(.return, modifiers: .command)
                        .disabled(starting || (draft?.brief ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.runtime.isRunning || store.runtime.isPreparing)
                        HStack(spacing: 4) {
                            Text("Directed by \(agent.title) on your Mac ·")
                            Button("Change") { openSettings() }.buttonStyle(.link)
                        }.font(.system(size: 11)).foregroundStyle(.secondary)
                    } else {
                        Button("Set up a director…") { store.settings.showWelcome = true }.buttonStyle(.borderedProminent).controlSize(.extraLarge)
                    }
                }
            }
            .padding(.horizontal, 32).padding(.vertical, 32)
            .frame(maxWidth: 704).frame(maxWidth: .infinity)
        }
    }
    private func fact(_ symbol: String, _ text: String) -> some View {
        Label(text, systemImage: symbol).font(.system(size: 12))
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Color(nsColor: .quaternaryLabelColor).opacity(0.45), in: Capsule())
    }
    private func start() {
        guard let draft else { return }
        store.ensureConsent(for: agent) {
            store.startWhenReady(project: url, sources: []) {
                starting = true
                Task {
                    var d = draft; d.agent = store.settings.defaultAgent
                    _ = await store.saveFilm(name: store.currentFilmTitle, draft: d, sources: [], existing: url, start: true)
                    starting = false
                }
            }
        }
    }
}

struct FinishedView: View {
    @Bindable var store: StudioStore
    @State private var playing = false
    @State private var previewVersion: FilmVersion?
    @State private var previewPlayer: AVPlayer?
    @State private var restoreVersion: FilmVersion?
    @FocusState private var focusedNote: UUID?
    private var filmKey: URL? { store.loadedFilm ?? store.selectedProjectURL }
    private var notes: [FilmNote] { filmKey.flatMap { store.filmNotes[$0] } ?? [] }
    private var activePlayer: AVPlayer? { previewPlayer ?? store.finalPlayer }
    private var poster: URL? { store.asset(store.snapshot.scenes(for: .final).first?.thumbnail ?? store.snapshot.scenes(for: .animatic).first?.thumbnail) }
    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                ZStack {
                    Color.black
                    if let player = previewPlayer ?? store.finalPlayer { VideoPlayer(player: player) }
                    if !playing {
                        if previewVersion == nil, let poster { PosterImage(url: poster, maxPixels: 1600).aspectRatio(contentMode: .fill) }
                        Button {
                            playing = true
                            let player = previewPlayer ?? store.finalPlayer
                            player?.seek(to: .zero); player?.play()
                        } label: {
                            Image(systemName: "play.fill").font(.system(size: 26)).foregroundStyle(.white)
                                .frame(width: 72, height: 72).background(Circle().fill(.black.opacity(0.28))).background(.ultraThinMaterial, in: Circle())
                                .shadow(color: .black.opacity(0.25), radius: 8, y: 2)
                        }.buttonStyle(PressableStyle()).accessibilityLabel("Play film")
                    }
                }
                .aspectRatio(store.snapshot.aspectRatio, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: .black.opacity(0.18), radius: 18, y: 8)
                .frame(maxWidth: store.snapshot.aspectRatio < 1 ? 360 : 820)
                VStack(spacing: 4) {
                    Text(store.currentFilmTitle).font(.system(size: 22, weight: .semibold))
                    Text("\(clockText(store.phaseDuration)) · \(store.snapshot.aspect)").font(.system(size: 12)).foregroundStyle(.secondary)
                    FinishedUsageLine(store: store)
                    if let previewVersion {
                        HStack {
                            Text("Watching v\(previewVersion.id)").font(.system(size: 12, weight: .medium))
                            Button("Watch latest") { watch(nil) }
                        }
                    }
                }
                HStack(spacing: 10) {
                    Button { store.exportVideo() } label: { Label("Export…", systemImage: "square.and.arrow.down") }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                        .keyboardShortcut("e", modifiers: .command)
                        .help("Save an MP4 you can share (⌘E)")
                    Button("Show in Finder") { if let url = store.displayedVideo { NSWorkspace.shared.activateFileViewerSelecting([url]) } }.controlSize(.large)
                }
                VStack(alignment: .leading, spacing: 18) {
                    FilmHistoryView(snapshot: store.snapshot, resolver: store.resolver, onPreview: { watch($0) }, onRestore: { restoreVersion = $0 })
                    changesSection
                }.frame(maxWidth: 820, alignment: .leading)
            }
            .padding(32).frame(maxWidth: .infinity)
        }
        .confirmationDialog("Restore v\(restoreVersion?.id ?? "")?", isPresented: Binding(get: { restoreVersion != nil }, set: { if !$0 { restoreVersion = nil } }), titleVisibility: .visible) {
            Button("Ask director to restore") { if let version = restoreVersion { store.restoreFilmVersion(version); restoreVersion = nil } }
        } message: { Text("Your director will restore this saved version. The other versions are kept.") }
        .onDisappear {
            previewPlayer?.pause()
            store.previewFilm = nil; store.previewVideo = nil
        }
    }
    // MARK: Request changes

    private var trimmedOverall: String { store.directorMessage.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var filledNotes: [FilmNote] { notes.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.sorted { $0.time < $1.time } }
    private var canSend: Bool { (!filledNotes.isEmpty || !trimmedOverall.isEmpty) && !store.isSending && !store.runtime.isPreparing }

    private func setNotes(_ value: [FilmNote]) { if let key = filmKey { store.filmNotes[key] = value.isEmpty ? nil : value } }
    private func noteBinding(_ id: UUID) -> Binding<String> {
        Binding(get: { notes.first { $0.id == id }?.text ?? "" },
                set: { text in setNotes(notes.map { var n = $0; if n.id == id { n.text = text }; return n }) })
    }
    private func addNote() {
        let player = activePlayer
        player?.pause()
        let seconds = player?.currentTime().seconds ?? 0
        let note = FilmNote(time: seconds.isFinite ? max(0, seconds) : 0)
        withAnimation(.snappy) { setNotes(notes + [note]) }
        focusedNote = note.id
    }
    private func send() {
        var lines = filledNotes.map { "At \(clockText($0.time)): \($0.text.trimmingCharacters(in: .whitespacesAndNewlines))" }
        if !trimmedOverall.isEmpty { lines.append("Overall: \(trimmedOverall)") }
        let key = filmKey
        store.requestFilmRevision(lines.joined(separator: "\n")) { if let key { store.filmNotes[key] = nil } }
    }

    private var changesSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Make changes").font(.system(size: 17, weight: .semibold))
                    Text("Pause where something should change and add a note. You get a new version; this one is kept.")
                        .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 12)
                TimelineView(.periodic(from: .now, by: 0.5)) { _ in
                    let seconds = activePlayer?.currentTime().seconds ?? 0
                    Button { addNote() } label: {
                        Label("Add note at \(clockText(seconds.isFinite ? seconds : 0))", systemImage: "plus.bubble").monospacedDigit()
                    }.controlSize(.large)
                }
            }
            if !notes.isEmpty {
                VStack(spacing: 0) {
                    ForEach(notes) { note in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Button {
                                activePlayer?.pause()
                                activePlayer?.seek(to: CMTime(seconds: note.time, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
                            } label: {
                                Text(clockText(note.time)).font(.system(size: 12, weight: .semibold, design: .rounded)).monospacedDigit()
                                    .foregroundStyle(Color.rasan).padding(.horizontal, 9).padding(.vertical, 3)
                                    .background(Color.rasan.opacity(0.13), in: Capsule())
                            }.buttonStyle(.plain).help("Jump to this moment")
                            TextField("What should change here?", text: noteBinding(note.id), axis: .vertical)
                                .textFieldStyle(.plain).font(.system(size: 13)).lineLimit(1...4)
                                .focused($focusedNote, equals: note.id)
                            Button { withAnimation(.snappy) { setNotes(notes.filter { $0.id != note.id }) } } label: {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary)
                            }.buttonStyle(.plain).help("Remove note").accessibilityLabel("Remove note at \(clockText(note.time))")
                        }
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                        if note.id != notes.last?.id { Divider().padding(.leading, 12) }
                    }
                }
                .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            TextField("Anything about the film as a whole? For example: lower the music a little.", text: $store.directorMessage, axis: .vertical)
                .textFieldStyle(.plain).font(.system(size: 13)).lineLimit(2...5)
                .padding(10)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.7), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
            HStack {
                Button("Review in studio") { store.showChanges = true }.buttonStyle(.link).font(.system(size: 12))
                Spacer()
                if !filledNotes.isEmpty {
                    Text("\(filledNotes.count) \(filledNotes.count == 1 ? "note" : "notes")").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Button { send() } label: { Text("Make a new version").frame(minWidth: 96) }
                    .buttonStyle(.borderedProminent).controlSize(.large).disabled(!canSend)
            }
        }
        .padding(20).cardSurface()
        .animation(.snappy, value: notes.count)
    }

    private func watch(_ version: FilmVersion?) {
        store.finalPlayer?.pause(); previewPlayer?.pause(); playing = false
        previewVersion = version
        previewPlayer = store.asset(version?.video).map(AVPlayer.init(url:))
        store.previewFilm = store.loadedFilm; store.previewVideo = store.asset(version?.video)
    }
}

// MARK: Sample

/// A made-up film so the studio can be explored without an agent account. The native stages read a fixed session;
/// choices are accepted but go nowhere.
struct SamplePage: View {
    @Bindable var store: StudioStore
    var body: some View {
        VStack(spacing: 0) {
            if let film = store.film {
                FilmStageBar(current: film.snapshot.stage, viewing: film.viewingStage,
                             canSelect: { _ in true }, onSelect: { film.view($0) })
                NativeFilmView(model: film)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Sample film")
        .toolbar { ToolbarItem(placement: .primaryAction) { HelpButton(title: "Sample film", lines: [
            "A made-up film so you can look around without an agent account.",
            "Nothing here is sent anywhere. Go back to start a real film."]) } }
        .onDisappear { store.pause() }
    }
}
