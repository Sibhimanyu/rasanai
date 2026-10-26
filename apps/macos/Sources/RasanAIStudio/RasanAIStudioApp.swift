import SwiftUI
import StudioCore
import Heresay

@main
struct RasanAIStudioApp: App {
    @NSApplicationDelegateAdaptor(StudioAppDelegate.self) private var delegate
    @StateObject private var updater = StudioUpdater.shared
    @State private var store: StudioStore
    @Environment(\.openWindow) private var openWindow

    init() {
        Heresay.configure(key: "pk_qieWNOYhIPtsSCFjfOYOLqSW", url: URL(string: "https://heresay-sibhi.web.app")!)
        _store = State(initialValue: StudioStore())
    }

    @AppStorage("homeLayout") private var layoutRaw = "grid"
    @AppStorage("homeSort") private var sortRaw = HomeSort.recent.rawValue

    private var onFilmPage: Bool { if case .film? = store.path.last { return true } else { return false } }

    /// A recent film by its name in the library, not the run folder's.
    private func recentTitle(_ path: String) -> String {
        store.localProjects.first { path.hasPrefix($0.1.path + "/") }?.0.name ?? URL(fileURLWithPath: path).lastPathComponent
    }

    var body: some Scene {
        Window("RasanAI", id: "studio") {
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
        }
        .defaultSize(width: 1240, height: 800)
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(replacing: .sidebar) {
                Button("Toggle Sidebar") {
                    NSApp.sendAction(#selector(NSSplitViewController.toggleSidebar(_:)), to: nil, from: nil)
                }
                .keyboardShortcut("b", modifiers: .command)
                // The right-hand panel is Apple's inspector: ⌥⌘I, shown here in the View menu like Pages, Keynote and Xcode.
                Button(store.film?.decisionsPresented == true ? "Hide Ask Rasan Panel" : "Show Ask Rasan Panel", systemImage: "sidebar.trailing") {
                    store.film?.decisionsPresented.toggle()
                }
                .keyboardShortcut("i", modifiers: [.command, .option])
                .disabled(!onFilmPage || store.film == nil)
            }
            // Settings is a page in the main window, so ⌘, brings that window forward and goes there.
            CommandGroup(replacing: .appSettings) {
                Button("Settings…") {
                    store.openSettingsPage()
                    if let window = NSApp.windows.first(where: { $0.canBecomeMain }) {
                        if window.isMiniaturized { window.deminiaturize(nil) }
                        window.makeKeyAndOrderFront(nil)
                    } else {
                        openWindow(id: "studio")
                    }
                    NSApp.activate(ignoringOtherApps: true)
                }.keyboardShortcut(",")
            }
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") { updater.check() }.disabled(!updater.canCheck)
            }
            CommandGroup(replacing: .newItem) {
                Button("New Film") { store.newFilm() }.keyboardShortcut("n")
                Button("Import Project…") { store.importProjectPanel() }.disabled(store.toolSetup.isRunning)
                Button("Open Film…") { store.openPanel() }.keyboardShortcut("o")
                Menu("Open Recent") {
                    ForEach(store.recentRuns, id: \.self) { path in
                        Button(recentTitle(path)) { store.openRun(URL(fileURLWithPath: path)) }
                    }
                    Divider()
                    Button("Clear Menu") { store.clearRecentRuns() }
                }.disabled(store.recentRuns.isEmpty)
            }
            CommandMenu("Film") {
                if store.canPause {
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
            CommandGroup(after: .textEditing) {
                Button("Find Films") {
                    // Search lives on Home and the film lists; from anywhere else, go Home first.
                    switch store.path.last { case nil, .library?: break; default: store.goHome() }
                    DispatchQueue.main.async { NotificationCenter.default.post(name: ToolbarSearchField.focusRequest, object: nil) }
                }.keyboardShortcut("f", modifiers: .command)
                // ⌘K jumps to search too, everywhere but a film page, where ⌘K writes to the agent (a disabled item leaves the key to it).
                Button("Jump to Search") {
                    switch store.path.last { case nil, .library?: break; default: store.goHome() }
                    DispatchQueue.main.async { NotificationCenter.default.post(name: ToolbarSearchField.focusRequest, object: nil) }
                }.keyboardShortcut("k", modifiers: .command).disabled(onFilmPage)
            }
            CommandGroup(before: .sidebar) {
                Picker("View", selection: $layoutRaw) {
                    Text("as Grid").tag("grid")
                    Text("as List").tag("list")
                }
                Picker("Sort By", selection: $sortRaw) { ForEach(HomeSort.allCases) { Text($0.title).tag($0.rawValue) } }
                Toggle("Show Archived Films", isOn: $store.showArchivedProjects).disabled(store.path.last != .library(.all))
                Divider()
            }
            CommandMenu("Go") {
                // The sidebar's places, in its order and by its names; they replace the page, as clicking them does.
                // Tahoe shows menu icons; each place wears its sidebar symbol.
                Button("Home", systemImage: StudioPlace.homeSymbol) { store.goHome() }.keyboardShortcut("1")
                Button("All films", systemImage: StudioPlace.allSymbol) { store.path = [.library(.all)] }.keyboardShortcut("2")
                Button("Needs review", systemImage: StudioPlace.needsReviewSymbol) { store.path = [.library(.needsReview)] }.keyboardShortcut("3")
                Button("Queue", systemImage: StudioPlace.queueSymbol) { store.path = [.queue] }.keyboardShortcut("4")
                Button("Brands", systemImage: StudioPlace.brandsSymbol) { store.path = [.brands] }.keyboardShortcut("5")
                Button("Series", systemImage: StudioPlace.seriesSymbol) { store.path = [.series] }.keyboardShortcut("6")
                Button("Inspiration", systemImage: StudioPlace.inspireSymbol) { store.path = [.inspire] }.keyboardShortcut("7")
                Divider()
                // The same history as the toolbar's ‹ ›.
                Button("Back") { store.goBack() }.keyboardShortcut("[", modifiers: .command).disabled(!store.canGoBack)
                Button("Forward") { store.goForward() }.keyboardShortcut("]", modifiers: .command).disabled(!store.canGoForward)
            }
            CommandGroup(replacing: .help) {
                Link("RasanAI Help", destination: guideURL)
                Button("Show Welcome…") { store.settings.showWelcome = true }.disabled(store.toolSetup.isRunning)
                Button("Explore a Sample Film") { store.exploreSample() }
            }
            HeresayCommands()
        }
    }
}
