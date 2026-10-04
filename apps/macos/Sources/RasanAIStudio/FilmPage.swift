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

    var body: some View {
        Group {
            if !ready {
                ProgressView().controlSize(.large).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.runURL == nil {
                if store.runtime.isPreparing || store.runtime.isRunning { StartingView() }
                else { DraftView(store: store, url: url, draft: draft) }
            } else if showsFinished {
                FinishedView(store: store)
            } else if store.consoleAddress != nil && (store.isConnected || store.runtime.isRunning || store.runtime.isPreparing) {
                ConsoleWorkspace(address: store.consoleAddress!)
            } else if store.runtime.isRunning || store.runtime.isPreparing {
                StartingView()
            } else {
                NotRunningView(store: store)
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .animation(.snappy, value: ready)
        .animation(.snappy, value: showsFinished)
        .navigationTitle(ready ? store.currentFilmTitle : "Film")
        .toolbar { if ready { toolbarItems } }
        .onAppear { store.activateFilm(url) }
        .task(id: store.loadedFilm) {
            guard store.loadedFilm == url else { return }
            draft = await Task.detached { [url] in FilmDraft.load(in: url) }.value
        }
        .onDisappear { store.finalPlayer?.pause() }
    }

    @ToolbarContentBuilder private var toolbarItems: some ToolbarContent {
        ToolbarItem(placement: .principal) { StatusPill(store: store) }
        ToolbarItemGroup(placement: .primaryAction) {
            if store.finalURL != nil {
                if store.showChanges, case .finished = phase {
                    Button { store.showChanges = false } label: { Label("Watch film", systemImage: "play.rectangle") }
                }
                Button { store.exportVideo() } label: { Label("Export", systemImage: "square.and.arrow.up") }.help("Export the finished video")
            }
            Menu {
                if store.runtime.isRunning { Button("Pause Director") { store.pauseDirector() } }
                else if store.canResume { Button("Resume Director") { store.resumeDirector() } }
                if store.runtime.logURL != nil { Button("Show Log") { store.sheet = .log } }
                if store.selectedProjectURL != nil { Button("Files…") { store.reloadSources(); store.sheet = .files } }
                Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([store.selectedProjectURL ?? store.runURL ?? url]) }
                if store.finalURL != nil { Button("Export Video…") { store.exportVideo() } }
                if store.runURL != nil { Button("Reconnect") { store.reconnectConsole() }.disabled(store.isReconnecting) }
            } label: { Image(systemName: "ellipsis.circle") }
            HelpButton(title: "This film", lines: helpLines)
        }
    }

    private var helpLines: [String] {
        switch phase {
        case .draft: ["This film has not started yet. Check the brief, then press Start film."]
        case .finished: ["Your film is ready. Export it, or press Make changes to leave notes and get a new version."]
        case .yourTurn: ["RasanAI is waiting for you. Answer in the panel below, and it carries on from there.", "You can leave the app; you will be notified if that is turned on."]
        default: ["RasanAI is directing this film. Each step it needs you for shows up here.", "Pause Director in the ••• menu stops it safely. Your files are kept, and you can resume any time."]
        }
    }
}

// MARK: Status pill

struct StatusPill: View {
    @Bindable var store: StudioStore
    var body: some View {
        let phase = store.phase
        let offline = phase == .offline && store.runURL != nil
        Button { if offline { store.reconnectConsole() } } label: {
            HStack(spacing: 7) {
                if phase.isBusy { ProgressView().controlSize(.mini) } else { StatusDot(tone: phase.tone) }
                Text(offline ? "Offline · Reconnect" : phase.pill).font(.system(size: 12, weight: .medium))
            }
            .padding(.horizontal, 12).padding(.vertical, 4)
            .background(Color(nsColor: .quaternaryLabelColor).opacity(0.45), in: Capsule())
            .animation(.snappy, value: phase)
        }
        .buttonStyle(.plain).disabled(!offline || store.isReconnecting)
        .accessibilityLabel(offline ? "Offline. Reconnect" : phase.pill)
    }
}

// MARK: States

struct StartingView: View {
    var body: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large)
            Text("Starting RasanAI…").font(.system(size: 15, weight: .medium))
            Text("Your director is getting set up. This takes a few seconds.").font(.system(size: 12)).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct NotRunningView: View {
    @Bindable var store: StudioStore
    var body: some View {
        VStack(spacing: 16) {
            RasanMark().fill(Color.rasanInk.opacity(0.35)).frame(width: 34, height: 42)
            Text("RasanAI isn't running for this film.").font(.system(size: 20, weight: .semibold))
            if let code = store.runtime.lastExitCode, code != 0 {
                Text("The last session stopped unexpectedly. The log shows why.").font(.system(size: 13)).foregroundStyle(.secondary)
            } else {
                Text("Your work is saved. Resume and it carries on where it left off.").font(.system(size: 13)).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                Button("Resume") { store.resumeDirector() }
                    .buttonStyle(.borderedProminent).controlSize(.large).disabled(!store.canResume)
                Button("Reconnect") { store.reconnectConsole() }.controlSize(.large).disabled(store.isReconnecting || store.runURL == nil)
                if store.runtime.logURL != nil, let code = store.runtime.lastExitCode, code != 0 {
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
    private var ready: Bool { store.settings.isInstalled(agent) && agent != .custom }
    private var shape: String { ["16:9": "Landscape", "9:16": "Portrait", "1:1": "Square"][draft?.aspect ?? "16:9"] ?? "Landscape" }

    var body: some View {
        ScrollView {
            VStack(spacing: 26) {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Text("The brief").font(.system(size: 22, weight: .semibold))
                        Spacer()
                        Button("Edit") { store.path.append(.newFilm(url)) }.controlSize(.regular)
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
                    if ready {
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
            starting = true
            Task {
                var d = draft; d.agent = store.settings.defaultAgent
                _ = await store.saveFilm(name: store.currentFilmTitle, draft: d, sources: [], existing: url, start: true)
                starting = false
            }
        }
    }
}

struct FinishedView: View {
    @Bindable var store: StudioStore
    @State private var playing = false
    private var poster: URL? { store.asset(store.snapshot.scenes(for: .final).first?.thumbnail ?? store.snapshot.scenes(for: .animatic).first?.thumbnail) }
    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                ZStack {
                    Color.black
                    if let player = store.finalPlayer { VideoPlayer(player: player) }
                    if !playing {
                        if let poster { PosterImage(url: poster, maxPixels: 1600).aspectRatio(contentMode: .fill) }
                        Button {
                            playing = true; store.finalPlayer?.seek(to: .zero); store.finalPlayer?.play()
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
                }
                HStack(spacing: 10) {
                    Button { store.exportVideo() } label: { Label("Export…", systemImage: "square.and.arrow.up") }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                    Button("Show in Finder") { if let url = store.finalURL { NSWorkspace.shared.activateFileViewerSelecting([url]) } }.controlSize(.large)
                    Button("Make changes") { store.showChanges = true }.controlSize(.large)
                }
            }
            .padding(32).frame(maxWidth: .infinity)
        }
    }
}

// MARK: Sample

/// The old native review views, kept reachable only from Help so the studio can be explored without an agent account.
struct SamplePage: View {
    @Bindable var store: StudioStore
    private let clock = Timer.publish(every: 1.0 / 30, on: .main, in: .common).autoconnect()
    @State private var lastTick = Date()
    var body: some View {
        VStack(spacing: 0) {
            Picker("Stage", selection: Binding(get: { store.stage }, set: { store.setStage($0) })) {
                ForEach(ReviewStage.allCases) { Text($0.title).tag($0) }
            }.pickerStyle(.segmented).labelsHidden().frame(maxWidth: 460).padding(.vertical, 14)
            switch store.stage {
            case .animatic, .final: FilmWorkspace(store: store)
            case .brief: BriefView(store: store)
            case .story: ChoiceView(store: store, kind: .story)
            case .look: ChoiceView(store: store, kind: .look)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Sample film")
        .toolbar { ToolbarItem(placement: .primaryAction) { HelpButton(title: "Sample film", lines: [
            "A made-up film so you can look around without an agent account.",
            "Nothing here is sent anywhere. Go back to start a real film."]) } }
        .onReceive(clock) { now in store.advance(by: min(now.timeIntervalSince(lastTick), 0.15)); lastTick = now }
        .onDisappear { store.pause() }
    }
}
