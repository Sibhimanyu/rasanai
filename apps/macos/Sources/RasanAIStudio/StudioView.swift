import SwiftUI
import StudioCore
import Heresay

/// The window's root: a NavigationStack with Home at the bottom. No sidebars, no inspectors.
struct StudioView: View {
    @Bindable var store: StudioStore
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        content.environment(\.momentStore, store)
            .modifier(LaunchFocus(ready: !store.isLoadingProjects))
    }

    @AppStorage("studio.sidebarHidden") private var sidebarHidden = false
    /// A film (or the sample, or the film editor) brings its own bottom bar, so the studio's status bar steps aside there.
    private var showsStatusBar: Bool {
        switch store.path.last { case .film?, .sample?, .newFilm?: false; default: true }
    }

    /// The native split view: on macOS Tahoe the system draws the floating glass sidebar with the window buttons inside it,
    /// its toggle, and the toggle's move into the toolbar when the sidebar hides, with the system's own animation.
    private var content: some View {
        NavigationSplitView(columnVisibility: Binding(get: { sidebarHidden ? .detailOnly : .all },
                                                      set: { sidebarHidden = $0 == .detailOnly })) {
            AppSidebar(store: store)
        } detail: {
            VStack(spacing: 0) {
                stack
                if showsStatusBar { AppStatusBar(store: store) }
            }
            .background(Color.appBackground)
        }
    }

    private var stack: some View {
        NavigationStack(path: $store.path) {
            HomeView(store: store)
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .newFilm(let project): NewFilmView(store: store, project: project)
                    case .film(let url):
                        if store.shouldBrowseSeparately(url) { LibraryFilmPage(store: store, url: url) }
                        else { FilmPage(store: store, url: url) }
                    case .brands: BrandsView(store: store)
                    case .brand(let url): BrandPage(store: store, brand: url)
                    case .queue: FilmQueueView(store: store)
                    case .templates: FilmTemplatesView(store: store)
                    case .inspire: GetInspiredPage(store: store)
                    case .sample: SamplePage(store: store)
                    case .library(let mode): HomeView(store: store, mode: mode)
                    }
                }
        }
        .tint(.rasan)
        .frame(minWidth: 820, minHeight: 560)
        .sheet(item: $store.sheet, onDismiss: {
            if store.sheet == nil && store.settings.showWelcome { store.settings.showWelcome = false }
            introduceFeedback()
        }) { sheet in
            switch sheet {
            case .welcome: WelcomeView(store: store).tint(.rasan).buttonStyle(.rasanSecondary)
            case .log: DirectorLogSheet(runtime: store.runtime).tint(.rasan).buttonStyle(.rasanSecondary)
            case .files: FilesSheet(store: store).tint(.rasan).buttonStyle(.rasanSecondary)
            case .note: NoteSheet(store: store).tint(.rasan).buttonStyle(.rasanSecondary)
            case .preflight: PreflightView(store: store).tint(.rasan).buttonStyle(.rasanSecondary)
            case .projectTransfer: ProjectTransferView(store: store).tint(.rasan).buttonStyle(.rasanSecondary)
            case .export:
                if let source = store.exportSource { MovieExportSheet(source: source, captions: store.exportCaptions).tint(.rasan).buttonStyle(.rasanSecondary) }
            }
        }
        .onAppear { introduceFeedback() }
        .onChange(of: store.settings.showWelcome) {
            if store.settings.showWelcome { store.sheet = .welcome }
            else if store.sheet == .welcome { store.sheet = nil }
        }
        .onChange(of: store.settings.projectRoot) { store.reloadProjects() }
        .onChange(of: store.path) { store.pause() }
        .onChange(of: store.queueBlockedByFileOperations) {
            if !store.queueBlockedByFileOperations { Task { await store.startNextQueuedFilm() } }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if (store.runtime.isRunning || store.runtime.isPreparing), let active = store.activeDirectorProject,
               store.displayedFilmURL != active && store.displayedFilmURL != store.runtime.runURL {
                HStack(spacing: 10) {
                    if store.phase.isBusy { ProgressView().controlSize(.small) }
                    Text("\(store.currentFilmTitle) · \(store.phase.homeLine)").font(.system(size: 12)).lineLimit(1)
                    Spacer()
                    Button("Back to running film") { store.showFilm(active) }
                    Button("Pause") { store.pauseDirector() }.disabled(store.runtime.isPreparing)
                }.padding(.horizontal, 18).padding(.vertical, 10)
                    .background(.regularMaterial).overlay(alignment: .top) { Divider() }
            }
        }
        .alert("Start with \(store.pendingConsent?.agent.title ?? "your director")?",
               isPresented: Binding(get: { store.pendingConsent != nil }, set: { if !$0 { store.pendingConsent = nil } })) {
            Button("Start") { store.confirmConsent() }
            Button("Cancel", role: .cancel) { store.pendingConsent = nil }
        } message: { Text("RasanAI will use your \(store.pendingConsent?.agent.title ?? "agent") account to direct this film. Usage counts toward your plan.") }
        .alert("RasanAI", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) {
            ForEach(errorActions) { action in
                Button(action.title) { store.errorMessage = nil; action.run() }
            }
            Button("Dismiss", role: .cancel) { store.errorMessage = nil }
        } message: { Text(store.errorMessage ?? "") }
    }

    private struct ErrorAction: Identifiable {
        let title: String
        let run: () -> Void
        var id: String { title }
    }
    /// The most relevant two recovery actions for the current error.
    private var errorActions: [ErrorAction] {
        var actions: [ErrorAction] = []
        if errorNeedsSettings(store.errorMessage) { actions.append(ErrorAction(title: "Open Settings") { openSettings() }) }
        if store.runURL != nil && !store.isConnected { actions.append(ErrorAction(title: "Reload film") { store.reloadFilm() }) }
        if store.canResume { actions.append(ErrorAction(title: "Resume Director") { store.resumeDirector() }) }
        if store.runtime.logURL != nil { actions.append(ErrorAction(title: "Show Log") { store.sheet = .log }) }
        return Array(actions.prefix(2))
    }

    private func introduceFeedback() {
        guard !store.isDemo, store.settings.hasCompletedWelcome,
              !store.settings.showWelcome, store.sheet == nil else { return }
        Heresay.introduce()
    }
}

/// True when the message is about the director, its tools or the library folder, where Settings is the fix.
func errorNeedsSettings(_ message: String?) -> Bool {
    guard let text = message?.lowercased() else { return false }
    // "Stop the director before switching films" is about the running film, not a setting.
    if text.contains("switching films") { return false }
    return ["director", "executable", "node", "sign in", "signed in", "sign-in", "log in", "login", "library", "project folder", "claude", "codex"].contains { text.contains($0) }
}

/// The launch: the window opens frosted, its content a soft blur, and comes into focus once the library has loaded (or
/// after half a second, whichever is first), the way ChatGPT's window does. Reduce Motion gets a short fade instead.
private struct LaunchFocus: ViewModifier {
    let ready: Bool
    @State private var focused = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .blur(radius: focused || reduceMotion ? 0 : 26)
            .brightness(focused ? 0 : -0.04)
            .opacity(focused || !reduceMotion ? 1 : 0)
            .allowsHitTesting(focused)
            .onAppear { if ready { reveal(after: 0.18) } else { reveal(after: 0.5) } }
            .onChange(of: ready) { if ready { reveal(after: 0.05) } }
    }

    private func reveal(after delay: Double) {
        guard !focused else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            withAnimation(reduceMotion ? .easeOut(duration: 0.18) : .easeOut(duration: 0.6)) { focused = true }
        }
    }
}
