import AppKit
import AVKit
import Combine
import StudioCore
import SwiftUI

/// One film. The engine console is the workflow while it runs; a player takes over when it's finished.
struct FilmPage: View {
    @Bindable var store: StudioStore
    let url: URL
    @State private var draft: FilmDraft?
    @State private var savedPace: FilmPace?
    @State private var confirmJustMakeIt = false
    /// Review notes skipped for the next Apply; shared by the stage and the inspector.
    @State private var skips = NoteSkips()
    private var agent: String { store.settings.agent.shortName }
    /// A live film shows the pace it was launched with. A replay or imported run only shows one that was actually saved.
    private var shownPace: FilmPace? { savedPace ?? (store.progress?.isReplay == true ? nil : store.settings.pace) }

    private var ready: Bool { store.loadedFilm == url }
    private var phase: FilmPhase { store.phase }
    private var showsFinished: Bool { if case .finished = phase { return !store.showChanges && store.film?.isViewingPast != true } else { return false } }
    private var isFinished: Bool { if case .finished = phase { true } else { false } }
    private var showsConsole: Bool { store.film != nil && (store.isConnected || store.runtime.isRunning || store.runtime.isPreparing) }

    /// The page itself: the stage, with the status bar under it.
    @ViewBuilder private var pageContent: some View {
        Group {
            if !ready {
                PageLoadingView(title: "film")
            } else if store.runURL == nil {
                if store.runtime.isPreparing || store.runtime.isRunning { StartingView(runtime: store.runtime) }
                else { DraftView(store: store, url: url, draft: draft) }
            } else if showsFinished {
                FinishedView(store: store)
            } else if let film = store.film, store.isConnected || store.runtime.isRunning || store.runtime.isPreparing {
                NativeFilmView(model: film, startedAt: store.runtime.startedAt, progress: store.progress,
                               onPause: store.canPause ? { store.pauseDirector() } : nil,
                               onShowLog: store.runtime.logURL != nil ? { store.sheet = .log } : nil,
                               pace: shownPace, autoResume: store.runtime.autoResume, onResumeNow: store.runtime.autoResume != nil ? { store.resumeDirector() } : nil,
                               onResume: store.canResume && !store.runtime.isRunning ? { store.resumeDirector() } : nil, paused: store.runtime.isFrozen || store.runtime.stopRequested)
            } else if store.runtime.isRunning || store.runtime.isPreparing {
                StartingView(runtime: store.runtime)
            } else {
                NotRunningView(store: store)
            }
        }
    }


    /// Film progress carries its own pause button and log link, so the thin banner would only repeat it.
    private var showsFilmProgress: Bool {
        guard store.progress != nil, let route = store.film?.route else { return false }
        return route == .working || route == .build
    }
    private var showsNativeFilm: Bool {
        ready && store.runURL != nil && !showsFinished && store.film != nil && (store.isConnected || store.runtime.isRunning || store.runtime.isPreparing)
    }

    /// Real alerts only. They are rare, so they may sit above the stage; the status line is the status bar's.
    private var showsAutoResume: Bool {
        guard !showsFinished, let notice = store.runtime.autoResume else { return false }
        return !notice.isLimit && !store.runtime.isRunning
    }
    private var showsRecovery: Bool { !showsFinished && !showsAutoResume && showsConsole && !store.runtime.stopRequested && store.runtime.recovery != nil }

    @ViewBuilder private var topChrome: some View {
        if ready && store.runURL != nil {
            VStack(spacing: 0) {
                MonitorBudgetBanner(store: store)
                if !showsFinished {
                    if let notice = store.runtime.autoResume, showsAutoResume {
                        AutoResumeBanner(store: store, notice: notice)
                    } else if showsRecovery, let recovery = store.runtime.recovery {
                        DirectorRecoveryView(store: store, recovery: recovery)
                    }
                }
            }
        }
    }

    /// Whose move it is, for the status bar. Nil when a banner above or Film progress already says it.
    private var statusTurn: TurnState? {
        guard showsNativeFilm, !showsAutoResume, !showsRecovery else { return nil }
        let turn = store.turnState
        // Film progress already says it is working, but a paused or stuck film still needs the bar's Resume.
        guard showsFilmProgress else { return turn }
        switch turn { case .paused, .attention: return turn; default: return nil }
    }

    /// The workspace: the header row, then the stage panel beside the inspector panel, then the action bar panel, all on
    /// one dark canvas. Nothing above the panels repeats the status; the bar at the bottom carries it.
    @ViewBuilder private var chromeAndContent: some View {
        VStack(spacing: 0) {
            if let film = store.film {
                FilmStatusBarHost(model: film, visible: showsNativeFilm, turn: statusTurn,
                                  stillWorking: [.working, .thinking].contains(store.monitor.health?.state),
                                  remaining: store.progress?.snapshot.remaining,
                                  onDetails: store.runtime.logURL != nil ? { store.sheet = .log } : nil,
                                  onPause: store.canPause ? { store.pauseDirector() } : nil,
                                  onResume: store.canResume ? { store.resumeDirector() } : nil,
                                  usage: { StatusPill(store: store) }) {
                    VStack(spacing: 0) {
                        topChrome
                        DecisionsHost(model: film, page: StagePanelHost { pageContent })
                    }
                }
            } else {
                VStack(spacing: 0) { topChrome; StagePanelHost { pageContent } }
            }
        }
        // Safe-area padding, not padding: the page runs under the floating sidebar, whose safe area would swallow a plain
        // leading padding (the content then touched the sidebar while the right kept its gutter).
        .safeAreaPadding(Workspace.pageInset)
        .background(Workspace.canvas)
        .environment(\.agentName, agent)
        .environment(skips)
        .confirmationDialog("Let \(agent) make every remaining call?", isPresented: $confirmJustMakeIt, titleVisibility: .visible) {
            Button("Make the Rest") { if let film = store.film { Task { await film.justMakeIt() } } }
        } message: { Text("You'll see the final film. You can still change any decision from the inspector.") }
    }

    /// The film's toolbar: back and forward, the seven-step rail in the centre, then the inspector toggle and the film's tools.
    @ToolbarContentBuilder private var filmToolbar: some ToolbarContent {
        HistoryToolbar(store: store)
        // The seven-step rail stays through working and review; the progress view's phase list no longer competes with it.
        if ready && store.runURL != nil && store.film != nil {
            if #available(macOS 26, *) {
                ToolbarItem(placement: .principal) { stepper.padding(.horizontal, 8).padding(.vertical, 2) }
                    .sharedBackgroundVisibility(.hidden)
            } else {
                ToolbarItem(placement: .principal) { stepper }
            }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            if let film = store.film {
                // ⌥⌘I (Apple's inspector key) is in the View menu; ⌥⌘B, the VS Code key, also works.
                Button { film.decisionsPresented.toggle() } label: { Label("Ask Rasan", systemImage: "sidebar.trailing") }
                    .help("Ask Rasan (⌥⌘I)")
                    .background {
                        Button("Toggle Ask Rasan Panel") { film.decisionsPresented.toggle() }
                            .keyboardShortcut("b", modifiers: [.command, .option])
                            .opacity(0).frame(width: 0, height: 0).accessibilityHidden(true)
                    }
            }
            if showsFinished, store.snapshot.filmVersions.count > 1 {
                Button { NotificationCenter.default.post(name: .rasanScrollToFilmHistory, object: nil) } label: {
                    Label("History", systemImage: "clock.arrow.circlepath")
                }
                .help("See and watch earlier versions")
            }
            headerTools
        }
    }

    private var stepper: some View {
        StudioFlowProgress(current: StudioFlowStep(store.snapshot.stage),
                           viewing: store.film?.viewingStage.map { StudioFlowStep($0) },
                           finished: isFinished,
                           canSelect: { step in step.reviewStage.map { store.film?.canView($0) ?? false } ?? false },
                           onSelect: { step in
                               guard let stage = step.reviewStage else { return }
                               if stage == .final { store.showChanges = false }
                               store.film?.view(stage)
                           })
    }

    @ViewBuilder private var headerTools: some View {
        if ready {
            Group {
                if store.finalURL != nil {
                    if store.showChanges, case .finished = phase {
                        Button { store.showChanges = false } label: { Label("Watch film", systemImage: "play.rectangle") }
                    }
                    if let video = store.finalURL {
                        ShareLink(item: video) { Label("Share", systemImage: "square.and.arrow.up") }.help("Share the finished film")
                    }
                }
                Menu {
                    // What Rasan is doing, then the film's files, then housekeeping. Icons first, plain words.
                    if let film = store.film, showsNativeFilm, !film.isDone, !film.isDecideRest, film.route != .working {
                        Button { confirmJustMakeIt = true } label: { Label("Let \(agent) finish it", systemImage: "wand.and.stars") }
                            .disabled(!film.isConnected || film.isSending)
                    }
                    if store.canPause { Button { store.pauseDirector() } label: { Label("Pause", systemImage: "pause.circle") }.keyboardShortcut(".", modifiers: .command) }
                    else if store.canResume { Button { store.resumeDirector() } label: { Label("Keep going", systemImage: "play.circle") } }
                    Divider()
                    if store.selectedProjectURL != nil { Button { store.reloadSources(); store.sheet = .files } label: { Label("Your files", systemImage: "photo.on.rectangle") } }
                    Button { store.showPreflight(project: store.selectedProjectURL) } label: { Label("Is everything ready?", systemImage: "checkmark.seal") }
                    if let project = store.selectedProjectURL { Button { store.exportProject(project) } label: { Label("Save a copy of this project…", systemImage: "square.and.arrow.down") } }
                    Button { NSWorkspace.shared.activateFileViewerSelecting([store.selectedProjectURL ?? store.runURL ?? url]) } label: { Label("Show in Finder", systemImage: "folder") }
                    Divider()
                    if store.runtime.logURL != nil { Button { store.sheet = .log } label: { Label("What happened", systemImage: "list.bullet.rectangle") } }
                    if store.runURL != nil { Button { store.reloadFilm() } label: { Label("Refresh", systemImage: "arrow.clockwise") } }
                } label: { Label("More", systemImage: "ellipsis") }
                .menuIndicator(.hidden).tint(.primary).help("More")   // a toolbar tool, white like its neighbours, not the brand tint
                HelpButton(title: "This film", lines: helpLines)
            }
        }
    }

    /// "45 s · 16:9": what the film is, under its title in the window header.
    private var filmFacts: String {
        var parts: [String] = []
        if let seconds = draft?.duration, seconds > 0 { parts.append("\(seconds)s") }
        if let aspect = draft?.aspect ?? (store.runURL != nil ? store.snapshot.aspect : nil), !aspect.isEmpty { parts.append(aspect) }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        chromeAndContent
        .buttonStyle(.rasanSecondary)   // inside the page only: toolbar items keep the system's glass
        .navigationTitle(ready ? store.currentFilmTitle : "Film")
        .navigationSubtitle(ready ? filmFacts : "")
        .navigationBarBackButtonHidden(true)
        .toolbar { filmToolbar }
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
            savedPace = await Task.detached { [url] in FilmDraft.savedPace(in: url) }.value
        }
        .onDisappear { store.finalPlayer?.pause() }
    }

    private var helpLines: [String] {
        switch phase {
        case .draft: ["This film has not started yet. Check the brief, then press Start film."]
        case .finished: ["Your film is ready. Export it, or watch it and add notes where something should change."]
        case .yourTurn: ["RasanAI is waiting for you. Answer on the page, then press the button at the bottom right, and it carries on from there.", "You can leave the app; you will be notified if that is turned on."]
        default: ["\(agent) is making this film. Each step it needs you for shows up here.", "Pause in the ••• menu freezes it in place. Resume carries on exactly where it was."]
        }
    }
}

// MARK: Status pill

/// Quiet usage text for the status bar: tokens and cost only. Whose move it is lives in the bar's status line, so no state words here.
struct StatusPill: View {
    @Bindable var store: StudioStore
    /// During a DEBUG replay the monitor has no telemetry for the run, so the pill reads the progress model's totals instead.
    static func replayPill(_ s: FilmProgressSnapshot?) -> String? {
        guard let s else { return nil }
        var parts = ["\(UsageFormat.tokens(s.totalTokens.fresh)) tokens"]
        if !s.isIncludedInPlan, s.totalCostUSD > 0 { parts.append(UsageFormat.dollars(s.totalCostUSD) + (s.costIsEstimated ? " est." : "")) }
        return parts.joined(separator: " · ")
    }
    @State private var monitorOpen = false
    @State private var hovering = false
    var body: some View {
        let offline = store.phase == .offline && store.runURL != nil
        let monitor = store.monitor
        let replaying = store.progress.map { $0.isReplay } ?? false
        let live = offline ? nil : (replaying ? Self.replayPill(store.progress?.snapshot) : monitor.pillText(for: store.runURL, showCost: DirectorMonitor.costVisible(usd: monitor.telemetry.cost.usd, limit: store.settings.budgetPerFilm, includedInPlan: monitor.telemetry.cost.isIncludedInPlan, hovering: hovering || monitorOpen)))
        let looping = monitor.health?.state == .possiblyLooping && live != nil
        if offline || live != nil {
            Button { if offline { store.reloadFilm() } else { monitorOpen.toggle() } } label: {
                HStack(spacing: 6) {
                    Text(offline ? "Files unreadable · Reload film" : (live ?? "")).font(.system(size: 11)).monospacedDigit()
                        .foregroundStyle(looping ? Color(nsColor: .systemRed) : .secondary)
                    if live != nil { Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold)).foregroundStyle(.tertiary) }
                }
                .padding(.horizontal, looping ? 10 : 0).padding(.vertical, 3)
                .background(looping ? Color(nsColor: .systemRed).opacity(0.2) : Color.clear, in: Capsule())
            }
            .buttonStyle(.plain)
            .onHover { hovering = $0 }
            .popover(isPresented: $monitorOpen, arrowEdge: .top) { DirectorMonitorPanel(monitor: monitor, progress: store.progress?.snapshot) { monitorOpen = false } }
            .help(live != nil ? "Director details: state, tokens, cost and recent activity" : "")
            .accessibilityLabel(offline ? "Film files unreadable. Reload film" : "Usage: \(live ?? "")")
        }
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

/// Shown for the ten seconds before Studio resumes a director that stopped mid-film. The film-progress header says the same.
struct AutoResumeBanner: View {
    @Bindable var store: StudioStore
    let notice: AutoResumeNotice
    var body: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text(notice.text).font(.system(size: 12, weight: .medium))
            Spacer(minLength: 8)
            Button("Resume now") { store.resumeDirector() }.disabled(!store.canResume)
        }
        .padding(.horizontal, Workspace.panelPadding).padding(.vertical, 10).background(Color.orange.opacity(0.08))
        .overlay(alignment: .bottom) { Divider() }
        .padding(.bottom, Workspace.gap)
        .accessibilityElement(children: .combine)
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
                if let at = store.runtime.autoResume?.resumesAt, store.runtime.autoResume?.isLimit == true {
                    Text("Resumes by itself at \(at.formatted(date: .omitted, time: .shortened)) while RasanAI is open, or press Resume.").font(.system(size: 12, weight: .medium))
                }
            }
            Spacer(minLength: 8)
            Button("Show log") { store.sheet = .log }
            if recovery == .signIn {
                Button("Sign in…") { store.settings.showWelcome = true }.buttonStyle(.rasanPrimary)
                Button("Resume") { store.resumeDirector() }.disabled(!store.canResume)
            } else {
                Button("Resume") { store.resumeDirector() }.buttonStyle(.rasanPrimary).disabled(!store.canResume)
            }
        }
        .padding(Workspace.panelPadding).background(Color.orange.opacity(0.08))
        .overlay(alignment: .bottom) { Divider() }
        .padding(.bottom, Workspace.gap)
    }
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
                    Button("Sign in…") { store.settings.showWelcome = true }.buttonStyle(.rasanPrimary).controlSize(.large)
                    Button("Resume") { store.resumeDirector() }.controlSize(.large).disabled(!store.canResume)
                } else {
                    Button("Resume") { store.resumeDirector() }
                        .buttonStyle(.rasanPrimary).controlSize(.large).disabled(!store.canResume)
                }
                if store.runtime.recovery == nil, store.runURL != nil, !store.isConnected {
                    Button("Reload film") { store.reloadFilm() }.controlSize(.large)
                }
                if store.runtime.logURL != nil, store.runtime.recovery != nil || (store.runtime.lastExitCode ?? 0) != 0 {
                    Button("Show log") { store.sheet = .log }.controlSize(.large)
                }
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct DraftView: View {
    @Bindable var store: StudioStore
    let url: URL
    let draft: FilmDraft?
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
                .padding(Workspace.panelPadding).cardSurface()
                VStack(spacing: 8) {
                    if queued {
                        Button("View queue") { store.path.append(.queue) }.buttonStyle(.rasanPrimary).controlSize(.large)
                        Text(editable ? "This film is waiting in the queue. You can still edit the brief; it starts when the director is free."
                                       : "This film is running from the queue. Open the queue to follow it or take it out.")
                            .font(.system(size: 12)).foregroundStyle(.secondary)
                    } else if ready {
                        Button { start() } label: {
                            HStack(spacing: 8) { if starting { ProgressView().controlSize(.small) }; Text("Start film") }.frame(minWidth: 160)
                        }
                        .buttonStyle(.rasanPrimary).controlSize(.extraLarge)
                        .keyboardShortcut(.return, modifiers: .command)
                        .disabled(starting || (draft?.brief ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.runtime.isRunning || store.runtime.isPreparing)
                        HStack(spacing: 4) {
                            Text("Directed by \(agent.title) on your Mac ·")
                            Button("Change") { store.openSettingsPage() }.buttonStyle(.link)
                        }.font(.system(size: 11)).foregroundStyle(.secondary)
                    } else {
                        Button("Set up a director…") { store.settings.showWelcome = true }.buttonStyle(.rasanPrimary).controlSize(.extraLarge)
                    }
                }
            }
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

extension Notification.Name { static let rasanScrollToFilmHistory = Notification.Name("rasanScrollToFilmHistory") }

struct FinishedView: View {
    @Bindable var store: StudioStore
    @State private var previewVersion: FilmVersion?
    @State private var previewPlayer: AVPlayer?
    @State private var restoreVersion: FilmVersion?
    @FocusState private var focusedNote: UUID?
    @Environment(\.undoManager) private var undo
    @State private var references: [FilmMoment] = []
    private var filmKey: URL? { store.loadedFilm ?? store.selectedProjectURL }
    private var notes: [FilmNote] { filmKey.flatMap { store.filmNotes[$0] } ?? [] }
    private var activePlayer: AVPlayer? { previewPlayer ?? store.finalPlayer }
    private var poster: URL? { store.asset(store.snapshot.scenes(for: .final).first?.thumbnail ?? store.snapshot.scenes(for: .animatic).first?.thumbnail) }
    /// What the exporter can actually do with this render, read from the file itself.
    @State private var facts = DeliveryFacts()

    struct DeliveryFacts: Equatable { var pixels: String?; var bytes: Int64? }

    private var portrait: Bool { store.snapshot.aspectRatio < 1 }

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                heading
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 24) {
                        playerColumn.frame(maxWidth: .infinity)
                        deliveryPanel.frame(width: 300)
                    }
                    .frame(minWidth: 840)
                    VStack(alignment: .leading, spacing: 20) {
                        playerColumn
                        deliveryPanel
                    }
                }
                VStack(alignment: .leading, spacing: 22) {
                    changesSection
                    FilmHistoryView(snapshot: store.snapshot, resolver: store.resolver, onPreview: { watch($0) }, onRestore: { restoreVersion = $0 }).id("film-history")
                }
            }
            .padding(.bottom, 32)
            .frame(maxWidth: 1240, alignment: .leading).frame(maxWidth: .infinity)
        }
        .onReceive(NotificationCenter.default.publisher(for: .rasanScrollToFilmHistory)) { _ in
            withAnimation(.smooth) { proxy.scrollTo("film-history", anchor: .top) }
        }
        }
        .confirmationDialog("Restore v\(restoreVersion?.id ?? "")?", isPresented: Binding(get: { restoreVersion != nil }, set: { if !$0 { restoreVersion = nil } }), titleVisibility: .visible) {
            Button("Restore v\(restoreVersion?.id ?? "")") { if let version = restoreVersion { store.restoreFilmVersion(version); restoreVersion = nil } }
        } message: { Text("\(store.settings.agent.shortName) restores this version. The other versions are kept.") }
        .task(id: filmKey) {
            guard let folder = filmKey else { references = []; return }
            references = await Task.detached { FilmDraft.load(in: folder)?.moments ?? [] }.value
            if !references.isEmpty { store.gallery.prime(); await store.gallery.loadIfNeeded() }
        }
        .task(id: store.displayedVideo) { facts = await Self.loadFacts(store.displayedVideo) }
        .onDisappear {
            previewPlayer?.pause()
            store.previewFilm = nil; store.previewVideo = nil
        }
    }

    // MARK: Layout

    private var heading: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Ready for the world.").font(.system(size: 34, weight: .semibold)).tracking(-0.4)
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Color(nsColor: .systemGreen))
                Text("\(store.currentFilmTitle) · Final film").font(.system(size: 15)).foregroundStyle(.secondary).lineLimit(1)
                if let previewVersion {
                    Text("Watching version \(previewVersion.id)").font(.system(size: 12, weight: .medium)).foregroundStyle(Color.rasan)
                    Button("Watch latest") { watch(nil) }.buttonStyle(.link).font(.system(size: 12))
                }
            }
        }
    }

    private var playerColumn: some View {
        VStack(alignment: .leading, spacing: 14) {
            Group {
                if let player = previewPlayer ?? store.finalPlayer {
                    StudioVideoPlayer(player: player, takesKeys: true, aspect: store.snapshot.aspectRatio)
                } else {
                    ZStack {
                        Color.black
                        if let poster, previewVersion == nil { PosterImage(url: poster, maxPixels: 1600).aspectRatio(contentMode: .fill) }
                        else if poster == nil { Label("No video file for this film", systemImage: "film").font(.system(size: 12)).foregroundStyle(.white.opacity(0.6)) }
                    }
                    .aspectRatio(store.snapshot.aspectRatio, contentMode: .fit)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
            .shadow(color: .black.opacity(0.18), radius: 18, y: 8)
            .frame(maxWidth: portrait ? 360 : .infinity)
            .frame(maxHeight: portrait ? 640 : nil)
            MomentReferencesLine(references: references, gallery: store.gallery)
        }
    }

    private var deliveryPanel: some View {
        let video = store.displayedVideo
        let hasCaptions = store.exportCaptions != nil || store.asset(store.snapshot.captionFile) != nil
        return VStack(alignment: .leading, spacing: 18) {
            Text("Export film").font(.system(size: 20, weight: .semibold))
            VStack(alignment: .leading, spacing: 11) {
                fact("Length", clockText(store.phaseDuration))
                fact("Shape", store.snapshot.aspect)
                if let pixels = facts.pixels { fact("Picture", pixels) }
                if let video { fact("Format", video.pathExtension.uppercased()) }
                if let bytes = facts.bytes { fact("Size", ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)) }
            }
            Divider().overlay(Workspace.hairline)
            VStack(alignment: .leading, spacing: 6) {
                Text("You can save").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                ForEach(DeliveryFormat.allCases) { format in
                    Label(format.title, systemImage: "checkmark").font(.system(size: 12)).labelStyle(.titleAndIcon)
                }
                if hasCaptions { Label("Captions as a separate file, or burned in", systemImage: "captions.bubble").font(.system(size: 12)) }
            }
            FinishedUsageLine(store: store)
            VStack(spacing: 8) {
                Button { store.exportVideo() } label: {
                    Label("Export film…", systemImage: "square.and.arrow.down").font(.system(size: 14, weight: .semibold)).frame(maxWidth: .infinity, minHeight: 30)
                }
                .rasanButton(primary: !canSend).controlSize(.large)
                .keyboardShortcut("e", modifiers: .command)
                .disabled(video == nil)
                .help("Choose a format and save a copy you can share (⌘E)")
                Button { if let url = video { NSWorkspace.shared.activateFileViewerSelecting([url]) } } label: {
                    Text("Show in Finder").frame(maxWidth: .infinity, minHeight: 26)
                }.controlSize(.large).disabled(video == nil)
            }
            SeriesLookButton(store: store, project: filmKey)
        }
        .padding(Workspace.panelPadding).frame(maxWidth: .infinity, alignment: .leading)
        .workspacePanel()
    }

    private func fact(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.system(size: 12)).foregroundStyle(.secondary)
            Spacer(minLength: 10)
            Text(value).font(.system(size: 13, weight: .medium)).monospacedDigit().lineLimit(1)
        }
    }

    private static func loadFacts(_ url: URL?) async -> DeliveryFacts {
        guard let url else { return DeliveryFacts() }
        var result = DeliveryFacts()
        result.bytes = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize.map { Int64($0) }
        let asset = AVURLAsset(url: url)
        if let track = try? await asset.loadTracks(withMediaType: .video).first,
           let natural = try? await track.load(.naturalSize), natural.width > 0, natural.height > 0 {
            result.pixels = "\(Int(natural.width.rounded())) × \(Int(natural.height.rounded()))"
        }
        return result
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
    /// Removing a note can be undone with ⌘Z: a typed note is easy to lose by one stray click.
    private func removeNote(_ id: UUID) {
        let before = notes
        withAnimation(.snappy) { setNotes(before.filter { $0.id != id }) }
        let restore: () -> Void = { withAnimation(.snappy) { setNotes(before) } }
        undo?.registerUndo(withTarget: store) { _ in MainActor.assumeIsolated { restore() } }
        undo?.setActionName("Remove Note")
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
                    Text("Request a change").font(.system(size: 17, weight: .semibold))
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
                            Button { removeNote(note.id) } label: {
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
                Button("Review scene by scene") { store.showChanges = true }.buttonStyle(.link).font(.system(size: 12))
                Spacer()
                if !filledNotes.isEmpty {
                    Text("\(filledNotes.count) \(filledNotes.count == 1 ? "note" : "notes")").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Button { send() } label: { Text("Make a new version").frame(minWidth: 96) }
                    .rasanButton(primary: canSend).controlSize(.large).disabled(!canSend)
            }
        }
        .padding(Workspace.panelPadding).frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
        .animation(.snappy, value: notes.count)
    }

    private func watch(_ version: FilmVersion?) {
        store.finalPlayer?.pause(); previewPlayer?.pause()
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
    /// After a call, the crew stage plays the sample's working moment, as a real film shows while its director works.
    @State private var working = SampleWorking()
    var body: some View {
        VStack(spacing: 0) {
            if let film = store.film {
                FilmStatusBarHost(model: film, turn: Self.turn(film), usage: { EmptyView() }) {
                    DecisionsHost(model: film, page: StagePanelHost {
                        ZStack {
                            if working.isShowing { FilmProgressView(model: film, progress: working.progress).transition(.opacity) }
                            else { NativeFilmView(model: film).transition(.opacity) }
                        }
                        .animation(.smooth, value: working.isShowing)
                    })
                }
                .onChange(of: film.sendCount) { working.play(after: film.lastSent) }
            }
        }
        // Safe-area padding, not padding: the page runs under the floating sidebar, whose safe area would swallow a plain
        // leading padding (the content then touched the sidebar while the right kept its gutter).
        .safeAreaPadding(Workspace.pageInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Workspace.canvas)
        .buttonStyle(.rasanSecondary)
        .navigationTitle("Sample film")
        .navigationBarBackButtonHidden(true)
        .toolbar {
            HistoryToolbar(store: store)
            if let film = store.film {
                ToolbarItem(placement: .principal) {
                    StudioFlowProgress(current: StudioFlowStep(film.snapshot.stage), viewing: film.viewingStage.map { StudioFlowStep($0) },
                                       canSelect: { $0.reviewStage != nil }, onSelect: { step in if let stage = step.reviewStage { film.view(stage) } })
                }
            }
            ToolbarItem(placement: .primaryAction) {
                HelpButton(title: "Sample film", lines: [
                    "A made-up film so you can look around without an agent account.",
                    "Nothing here is sent anywhere. Go back to start a real film."])
            }
        }
        .onDisappear { store.pause(); working.stop() }
    }
    /// The sample has no director, so its status line is whose call the fixed session is waiting on.
    private static func turn(_ film: FilmSessionModel) -> TurnState? {
        film.isWaitingOnUser ? .yourTurn(FilmSummary.friendlyStep(film.snapshot.currentStep, in: film.snapshot), background: nil) : nil
    }
}
