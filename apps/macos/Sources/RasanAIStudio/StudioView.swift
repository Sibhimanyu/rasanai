import SwiftUI
import StudioCore
import Heresay

/// The window's root: a NavigationStack with Home at the bottom. No sidebars, no inspectors.
struct StudioView: View {
    @Bindable var store: StudioStore
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        content.environment(\.momentStore, store)
            .modifier(LaunchFocus(ready: !store.isLoadingProjects, agent: store.settings.agent.title))
    }

    @AppStorage("studio.sidebarHidden") private var sidebarHidden = false
    /// The split view's own state, so its toggle (and ⌃⌘S) runs the system's slide. Binding it straight to the stored setting
    /// dropped the animation's transaction and made the sidebar snap; the setting is only written back afterwards.
    @State private var columns: NavigationSplitViewVisibility = .all
    @State private var restored = false
    /// A film (or the sample, or the film editor) brings its own bottom bar, so the studio's status bar steps aside there.
    private var showsStatusBar: Bool {
        switch store.path.last { case .film?, .sample?, .newFilm?: false; default: true }
    }

    /// The native split view: on macOS Tahoe the system draws the floating glass sidebar with the window buttons inside it,
    /// its toggle, and the toggle's move into the toolbar when the sidebar hides, with the system's own animation.
    private var content: some View {
        NavigationSplitView(columnVisibility: $columns) {
            AppSidebar(store: store)
        } detail: {
            VStack(spacing: 0) {
                stack
                if showsStatusBar { AppStatusBar(store: store, sidebarHidden: columns == .detailOnly) }
            }
            .background(Color.appBackground)
        }
        // No toolbar band: the glass items float over the page's own colour, in a window and in full screen alike, and
        // content blurs softly under them as it scrolls (the system's scroll-edge effect).
        .modifier(NoToolbarBand())
        .onAppear {
            guard !restored else { return }
            restored = true
            var quiet = Transaction(); quiet.disablesAnimations = true
            withTransaction(quiet) { columns = sidebarHidden ? .detailOnly : .all }
        }
        .onChange(of: columns) { _, visibility in sidebarHidden = visibility == .detailOnly }
    }

    @ViewBuilder private func page(_ route: Route) -> some View {
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

    /// The page the stack stands on: the first route of the path (Home when it is empty). The stack itself only holds what
    /// is pushed on top of it, so a new place from the sidebar replaces the root instead of popping the stack to Home and
    /// pushing again; done as a pop, the stack wrote [] back into the path mid-transition and the page landed on Home.
    private var stack: some View {
        let root = store.path.first
        let pushed = Binding<[Route]>(
            get: { Array(store.path.dropFirst()) },
            // A stack that is going away (its root already replaced) still writes its path back; ignore it.
            set: { rest in
                guard store.path.first == root else { return }
                let path = (root.map { [$0] } ?? []) + rest
                if store.path != path { store.path = path }
            })
        return NavigationStack(path: pushed) {
            Group {
                if let root { page(root) } else { HomeView(store: store) }
            }
            .navigationDestination(for: Route.self) { page($0) }
        }
        .id(root)
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
        .onChange(of: store.path) { old, new in
            store.pause()
            // A search or the archive view belongs to the page it was set on; a new place starts clean.
            if old.first != new.first { store.projectSearch = ""; store.showArchivedProjects = false }
        }
        .onChange(of: store.queueBlockedByFileOperations) {
            if !store.queueBlockedByFileOperations { Task { await store.startNextQueuedFilm() } }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            // Library pages say this in the status bar; this strip is for a film page showing another film.
            if !showsStatusBar, (store.runtime.isRunning || store.runtime.isPreparing), let active = store.activeDirectorProject,
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
        // The bold title states the problem (the message's first sentence); the rest says what to do.
        .alert(errorText.title, isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) {
            ForEach(errorActions) { action in
                Button(action.title) { store.errorMessage = nil; action.run() }
            }
            Button("Dismiss", role: .cancel) { store.errorMessage = nil }
        } message: { if !errorText.detail.isEmpty { Text(errorText.detail) } }
    }

    private var errorText: (title: String, detail: String) {
        let message = (store.errorMessage ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard let end = message.range(of: ". ") ?? message.range(of: ".\n") else { return (message.hasSuffix(".") ? String(message.dropLast()) : message, "") }
        return (String(message[..<end.lowerBound]), String(message[end.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines))
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

/// The launch: the window opens on a splash, the RasanAI mark drawing itself over the frosted library, then the name.
/// It holds long enough to be seen (about 1.8 s, longer if the library is still loading), then the mark lifts away
/// and the library comes into focus under it. Reduce Motion fades the mark in and out instead of drawing it.
private struct LaunchFocus: ViewModifier {
    let ready: Bool
    /// The director's own name ("Claude", "Codex"), as Settings has it.
    let agent: String
    @State private var focused = false
    @State private var drawn: CGFloat = 0
    @State private var filled = false
    @State private var named = false
    @State private var held = false
    @State private var leaving = false
    /// `ready` as state. The hold timer's closure keeps the `ready` of the moment it was scheduled, so a library that
    /// finished loading during the hold read as still loading and the splash never left; state is always current.
    @State private var loaded = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .blur(radius: focused ? 0 : 30)
            .brightness(focused ? 0 : -0.12)
            .allowsHitTesting(focused)
            .overlay {
                if !focused || leaving {
                    splash
                        .scaleEffect(leaving && !reduceMotion ? 1.06 : 1)
                        .opacity(leaving ? 0 : 1)
                        .allowsHitTesting(false)
                }
            }
            .onAppear { loaded = ready; play() }
            .onChange(of: ready) { loaded = ready; revealIfDone() }
    }

    private var splash: some View {
        VStack(spacing: 22) {
            ZStack {
                RasanMark().trim(from: 0, to: drawn).stroke(Color.rasanInk, style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                RasanMark().fill(Color.rasanInk).opacity(filled ? 1 : 0)
            }
            .frame(width: 66, height: 81)
            VStack(spacing: 6) {
                Text("RasanAI Studio").font(.system(size: 26, weight: .semibold)).tracking(-0.4)
                Text("Films with taste, directed by \(agent)").font(.system(size: 13)).foregroundStyle(.secondary)
            }
            .opacity(named ? 1 : 0).offset(y: named ? 0 : 8)
            ProgressView().controlSize(.small).opacity(held && !loaded ? 1 : 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine).accessibilityLabel("RasanAI Studio")
    }

    private func play() {
        if reduceMotion {
            drawn = 1
            withAnimation(.easeOut(duration: 0.3)) { filled = true; named = true }
        } else {
            withAnimation(.easeInOut(duration: 0.9)) { drawn = 1 }
            withAnimation(.easeOut(duration: 0.45).delay(0.6)) { filled = true }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.85).delay(0.7)) { named = true }
        }
        // Reduce Motion holds the mark for 0.8 s, not 1.8; input waits only for the hold and the library loading.
        DispatchQueue.main.asyncAfter(deadline: .now() + (reduceMotion ? 0.8 : 1.8)) { held = true; revealIfDone() }
        // Never more than 6 s: a library that is slow to load keeps loading behind the window, not behind the splash.
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { loaded = true; revealIfDone() }
    }

    private func revealIfDone() {
        guard held, loaded, !focused else { return }
        withAnimation(.easeIn(duration: reduceMotion ? 0.2 : 0.4)) { leaving = true }
        withAnimation(.easeOut(duration: reduceMotion ? 0.2 : 0.7).delay(0.1)) { focused = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { leaving = false }
    }
}

private struct NoToolbarBand: ViewModifier {
    func body(content: Content) -> some View {
        if #available(macOS 15, *) { content.toolbarBackgroundVisibility(.hidden, for: .windowToolbar) }
        else { content.toolbarBackground(.hidden, for: .windowToolbar) }
    }
}
