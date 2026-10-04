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
        if SnapshotHarness.directory != nil {
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
                if snapshotDirectory == nil {
                    StudioView(store: store)
                        .heresay()
                        .preferredColorScheme(store.settings.colorScheme)
                        .onAppear {
                            delegate.runtime = store.runtime
                            delegate.store = store
                            delegate.configureNotifications()
                            store.restoreWorkspace()
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
                    Button("Resume Director") { store.resumeDirector() }.disabled(!onFilmPage || !store.canResume)
                }
                Button("Export Video…") { store.exportVideo() }.keyboardShortcut("e").disabled(!onFilmPage || store.finalURL == nil)
                Button("Show in Finder") {
                    if let url = store.selectedProjectURL ?? store.runURL { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                }.disabled(!onFilmPage)
                Button("Show Log") { store.sheet = .log }.disabled(!onFilmPage || store.runtime.logURL == nil)
                Divider()
                Button("Reconnect") { store.reconnectConsole() }.keyboardShortcut("r").disabled(!onFilmPage || store.runURL == nil || store.isReconnecting)
            }
            CommandGroup(replacing: .help) {
                Link("RasanAI Help", destination: guideURL)
                Button("Show Welcome…") { store.settings.showWelcome = true }
                Button("Explore a Sample Film") { store.exploreSample() }
            }
            if snapshotDirectory == nil { HeresayCommands() }
        }
        Settings {
            StudioSettingsView(settings: store.settings)
        }
    }
}
