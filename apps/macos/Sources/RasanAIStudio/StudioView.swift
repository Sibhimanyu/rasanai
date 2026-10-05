import SwiftUI
import StudioCore
import Heresay

/// The window's root: a NavigationStack with Home at the bottom. No sidebars, no inspectors.
struct StudioView: View {
    @Bindable var store: StudioStore
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        NavigationStack(path: $store.path) {
            HomeView(store: store)
                .navigationDestination(for: Route.self) { route in
                    Group { switch route {
                    case .newFilm(let project): NewFilmView(store: store, project: project)
                    case .film(let url):
                        if store.shouldBrowseSeparately(url) { LibraryFilmPage(store: store, url: url) }
                        else { FilmPage(store: store, url: url) }
                    case .brands:
                        BrandsView(store: store)
                            .toolbar { ToolbarItem(placement: .primaryAction) { HelpButton(title: "Brands", lines: [
                                "A brand keeps your colours, type and logo in one folder.",
                                "Pick a brand when you start a film and RasanAI designs in your look.",
                                "Each brand is a plain DESIGN.md file you can edit anywhere."]) } }
                    case .brand(let url):
                        BrandPage(store: store, brand: url)
                            .toolbar { ToolbarItem(placement: .primaryAction) { HelpButton(title: "This brand", lines: [
                                "These swatches and fonts are read from the brand's DESIGN.md.",
                                "Choose Edit brand to change colours, fonts and logo, with a live preview.",
                                "Deleting a brand moves its folder to the Trash. Existing films keep their copy."]) } }
                    case .queue: FilmQueueView(store: store)
                    case .templates: FilmTemplatesView(store: store)
                    case .sample: SamplePage(store: store)
                    } }
                }
        }
        .tint(.rasan)
        .frame(minWidth: 820, minHeight: 560)
        .sheet(item: $store.sheet, onDismiss: {
            if store.sheet == nil && store.settings.showWelcome { store.settings.showWelcome = false }
            introduceFeedback()
        }) { sheet in
            switch sheet {
            case .welcome: WelcomeView(store: store).tint(.rasan)
            case .log: DirectorLogSheet(runtime: store.runtime).tint(.rasan)
            case .files: FilesSheet(store: store).tint(.rasan)
            case .note: NoteSheet(store: store).tint(.rasan)
            case .preflight: PreflightView(store: store).tint(.rasan)
            case .projectTransfer: ProjectTransferView(store: store).tint(.rasan)
            case .export:
                if let source = store.exportSource { MovieExportSheet(source: source, captions: store.exportCaptions).tint(.rasan) }
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
        if store.runURL != nil && !store.isConnected { actions.append(ErrorAction(title: "Reconnect") { store.reconnectConsole() }) }
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
    return ["director", "executable", "node", "sign in", "signed in", "sign-in", "log in", "login", "library", "project folder", "claude", "codex"].contains { text.contains($0) }
}
