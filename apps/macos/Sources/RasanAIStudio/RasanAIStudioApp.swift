import SwiftUI
import StudioCore

@main
struct RasanAIStudioApp: App {
    @NSApplicationDelegateAdaptor(StudioAppDelegate.self) private var delegate
    @StateObject private var updater = StudioUpdater.shared
    @State private var store = StudioStore()
    var body: some Scene {
        Window("RasanAI Studio", id: "studio") {
            StudioView(store: store)
                .preferredColorScheme(store.settings.colorScheme)
                .frame(minWidth: 820, minHeight: 560)
                .onAppear {
                    delegate.runtime = store.runtime
                    delegate.store = store
                    delegate.configureNotifications()
                    store.restoreWorkspace()
                }
        }
        .defaultSize(width: 1120, height: 740)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") { updater.check() }.disabled(!updater.canCheck)
            }
            CommandGroup(replacing: .newItem) {
                Button("New Film…") { store.newFilm() }.keyboardShortcut("n")
                Button("Open RasanAI Run…") { store.openPanel() }.keyboardShortcut("o")
                Button("Show Sample Film") { store.loadSample() }.keyboardShortcut("d", modifiers: [.command, .shift])
            }
            CommandMenu("Film") {
                Button(store.isPlaying ? "Pause" : "Play") { store.togglePlayback() }.keyboardShortcut(.space, modifiers: [])
                Button("Add Note at Playhead…") { store.pause(); store.showNoteSheet = true }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
                    .disabled(![.animatic, .final].contains(store.stage) || (!store.isSample && !store.isConnected))
                Button("Reconnect Console") { store.reconnectConsole() }.keyboardShortcut("r").disabled(store.isSample || store.isReconnecting)
                Divider()
                Button("Export Film…") { store.exportVideo() }.keyboardShortcut("e").disabled(store.finalURL == nil)
            }
            CommandGroup(after: .newItem) {
                Menu("Open Recent") {
                    ForEach(store.recentRuns, id: \.self) { path in
                        Button(URL(fileURLWithPath: path).lastPathComponent) { store.openRun(URL(fileURLWithPath: path)) }
                    }
                    Divider()
                    Button("Clear Recent Runs") { store.clearRecentRuns() }
                }.disabled(store.recentRuns.isEmpty)
            }
            CommandGroup(after: .sidebar) {
                Button("Toggle Sidebar") { store.toggleSidebar() }.keyboardShortcut("s", modifiers: [.control, .command])
                Button("Toggle Director Inspector") { store.toggleInspector() }.keyboardShortcut("0", modifiers: [.option, .command])
            }
            CommandGroup(replacing: .help) {
                Button("Welcome and Setup…") { store.settings.showWelcome = true }
                Button("Keyboard Shortcuts…") { store.showShortcuts = true }
                Link("RasanAI Studio Help", destination: URL(string: "https://github.com/Sibhimanyu/rasanai/tree/master/apps/macos")!)
            }
        }
        Settings {
            StudioSettingsView(settings: store.settings)
        }
    }
}
