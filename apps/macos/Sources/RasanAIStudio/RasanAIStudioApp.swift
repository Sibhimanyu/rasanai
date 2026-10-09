import SwiftUI
import StudioCore
import Heresay

@main
struct RasanAIStudioApp: App {
    @NSApplicationDelegateAdaptor(StudioAppDelegate.self) private var delegate
    @StateObject private var updater = StudioUpdater.shared
    @State private var store: StudioStore
    private let snapshotDirectory = SnapshotHarness.directory

    init() {
        if SnapshotHarness.directory != nil || SnapshotHarness.stagesDirectory != nil {
            // Screenshot mode never touches the real library, settings or runtime.
            _store = State(initialValue: StudioStore(settings: SnapshotHarness.isolatedSettings(), demo: true))
        } else {
            Heresay.configure(key: "pk_qieWNOYhIPtsSCFjfOYOLqSW", url: URL(string: "https://heresay-sibhi-42b1.web.app")!)
            _store = State(initialValue: StudioStore())
        }
    }

    private var onFilmPage: Bool { if case .film? = store.path.last { return true } else { return false } }

    var body: some Scene {
        Window("RasanAI", id: "studio") {
            Group {
                if snapshotDirectory == nil && SnapshotHarness.stagesDirectory == nil {
                    StudioView(store: store)
                        .heresay()
                        .preferredColorScheme(store.settings.colorScheme)
                        .onAppear {
                            delegate.runtime = store.runtime
                            delegate.store = store
                            delegate.configureNotifications()
                            store.restoreWorkspace()
                            #if DEBUG
                            // QA hook: `--attach-run <dir>` opens the film page on an existing run, with no director.
                            if let index = CommandLine.arguments.firstIndex(of: "--attach-run"), CommandLine.arguments.count > index + 1 {
                                NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps: true)
                                store.openRun(URL(fileURLWithPath: CommandLine.arguments[index + 1], isDirectory: true))
                            }
                            if let index = CommandLine.arguments.firstIndex(of: "--replay-run"), CommandLine.arguments.count > index + 1 {
                                func option(_ name: String) -> String? { CommandLine.arguments.firstIndex(of: name).flatMap { CommandLine.arguments.indices.contains($0 + 1) ? CommandLine.arguments[$0 + 1] : nil } }
                                ProgressReplay.launch(store: store, run: URL(fileURLWithPath: CommandLine.arguments[index + 1], isDirectory: true),
                                                      speed: option("--speed").flatMap(Double.init) ?? 60, from: option("--replay-from"))
                            }
                            if let index = CommandLine.arguments.firstIndex(of: "--qa-dir"), CommandLine.arguments.count > index + 1 {
                                QAHarness.start(store: store, dir: URL(fileURLWithPath: CommandLine.arguments[index + 1], isDirectory: true))
                            }
                            #endif
                        }
                } else {
                    Color.clear.frame(width: 1, height: 1)
                        .onAppear { delegate.runSnapshots() }
                }
            }
        }
        .defaultSize(width: 1120, height: 740)
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") { updater.check() }.disabled(!updater.canCheck)
            }
            CommandGroup(replacing: .newItem) {
                Button("New Film") { store.newFilm() }.keyboardShortcut("n")
                Button("Import Project…") { store.importProjectPanel() }.disabled(store.toolSetup.isRunning)
                Button("Open Run Folder…") { store.openPanel() }.keyboardShortcut("o")
                Menu("Open Recent") {
                    ForEach(store.recentRuns, id: \.self) { path in
                        Button(URL(fileURLWithPath: path).lastPathComponent) { store.openRun(URL(fileURLWithPath: path)) }
                    }
                    Divider()
                    Button("Clear Menu") { store.clearRecentRuns() }
                }.disabled(store.recentRuns.isEmpty)
            }
            CommandMenu("Film") {
                if store.runtime.isRunning {
                    Button("Pause Director") { store.pauseDirector() }
                } else {
                    Button("Resume Director") { store.resumeDirector() }.disabled(!onFilmPage || store.isBrowsingAnotherFilm || !store.canResume)
                }
                Button("Check Readiness…") { store.showPreflight(project: store.displayedFilmURL) }
                Button("Export Project…") { if let url = store.displayedFilmURL { store.exportProject(url) } }.disabled(!onFilmPage)
                Button("Export Video…") { store.exportVideo() }.keyboardShortcut("e").disabled(!onFilmPage || store.displayedVideo == nil)
                Button("Show in Finder") {
                    if let url = store.displayedFilmURL { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                }.disabled(!onFilmPage)
                Button("Show Log") { store.sheet = .log }.disabled(!onFilmPage || store.isBrowsingAnotherFilm || store.runtime.logURL == nil)
                Divider()
                Button("Reload Film") { store.reloadFilm() }.keyboardShortcut("r").disabled(!onFilmPage || store.isBrowsingAnotherFilm || store.runURL == nil)
            }
            CommandMenu("Navigate") {
                Button("Film Queue") { store.path.append(.queue) }.keyboardShortcut("k", modifiers: [.command, .shift])
                Button("Film Templates") { store.path.append(.templates) }.keyboardShortcut("t", modifiers: [.command, .shift])
                Button("Back") { if !store.path.isEmpty { store.path.removeLast() } }.keyboardShortcut("[", modifiers: .command).disabled(store.path.isEmpty)
                Button("Home") { store.goHome() }.keyboardShortcut("h", modifiers: [.command, .shift])
            }
            CommandGroup(replacing: .help) {
                Link("RasanAI Help", destination: guideURL)
                Button("Show Welcome…") { store.settings.showWelcome = true }.disabled(store.toolSetup.isRunning)
                Button("Prepare Rendering Tools…") { store.showPreflight() }
                Button("Explore a Sample Film") { store.exploreSample() }
            }
            if snapshotDirectory == nil && SnapshotHarness.stagesDirectory == nil { HeresayCommands() }
        }
        Settings {
            StudioSettingsView(settings: store.settings)
        }
    }
}
