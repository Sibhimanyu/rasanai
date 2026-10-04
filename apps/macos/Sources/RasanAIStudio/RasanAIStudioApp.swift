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
                .frame(minWidth: 1180, minHeight: 780)
                .onAppear {
                    delegate.runtime = store.runtime
                    if let index = CommandLine.arguments.firstIndex(of: "--run"), CommandLine.arguments.count > index + 1 {
                        store.openRun(URL(fileURLWithPath: CommandLine.arguments[index + 1]))
                    }
                }
        }
        .defaultSize(width: 1510, height: 960)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") { updater.check() }.disabled(!updater.canCheck)
            }
            CommandGroup(replacing: .newItem) {
                Button("New Project Folder…") { store.showNewProject = true }.keyboardShortcut("n")
                Button("Open RasanAI Run…") { store.openPanel() }.keyboardShortcut("o")
                Button("Show Sample Film") { store.loadSample() }.keyboardShortcut("d", modifiers: [.command, .shift])
            }
            CommandMenu("Film") {
                Button(store.isPlaying ? "Pause" : "Play") { store.togglePlayback() }.keyboardShortcut(.space, modifiers: [])
                Button("Add Note at Playhead…") { store.pause(); store.showNoteSheet = true }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
                    .disabled(![.animatic, .final].contains(store.stage) || (!store.isSample && !store.isConnected))
                Button("Reconnect Console") { store.connect() }.keyboardShortcut("r").disabled(store.isSample)
                Divider()
                Button("Export Film…") { store.exportVideo() }.keyboardShortcut("e").disabled(store.finalURL == nil)
            }
        }
        Settings {
            StudioSettingsView(settings: store.settings)
        }
    }
}
