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
                    case .film(let url): FilmPage(store: store, url: url)
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
                                "Choose Edit in TextEdit to change it; the page updates when you come back.",
                                "Deleting a brand moves its folder to the Trash. Existing films keep their copy."]) } }
                    case .sample: SamplePage(store: store)
                    } }
                    .toolbar { ToolbarItem(placement: .navigation) { BackButton(store: store) } }
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
            }
        }
        .onAppear { introduceFeedback() }
        .onChange(of: store.settings.showWelcome) {
            if store.settings.showWelcome { store.sheet = .welcome }
            else if store.sheet == .welcome { store.sheet = nil }
        }
        .onChange(of: store.settings.projectRoot) { store.reloadProjects() }
        .alert("Start with \(store.pendingConsent?.agent.title ?? "your director")?",
               isPresented: Binding(get: { store.pendingConsent != nil }, set: { if !$0 { store.pendingConsent = nil } })) {
            Button("Start") { store.confirmConsent() }
            Button("Cancel", role: .cancel) { store.pendingConsent = nil }
        } message: { Text("RasanAI will use your \(store.pendingConsent?.agent.title ?? "agent") account to direct this film. Usage counts toward your plan.") }
        .alert("RasanAI", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) {
            Button("Open Settings") { store.errorMessage = nil; openSettings() }
            if store.runURL != nil && !store.isConnected { Button("Reconnect") { store.errorMessage = nil; store.reconnectConsole() } }
            if store.canResume { Button("Resume Director") { store.errorMessage = nil; store.resumeDirector() } }
            if store.runtime.logURL != nil { Button("Show Log") { store.errorMessage = nil; store.sheet = .log } }
            Button("Dismiss", role: .cancel) { store.errorMessage = nil }
        } message: { Text(store.errorMessage ?? "") }
    }

    private func introduceFeedback() {
        guard !store.isDemo, store.settings.hasCompletedWelcome,
              !store.settings.showWelcome, store.sheet == nil else { return }
        Heresay.introduce()
    }
}

/// macOS has no automatic back button in a NavigationStack, so every pushed page gets the standard chevron.
struct BackButton: View {
    @Bindable var store: StudioStore
    var body: some View {
        Button {
            if !store.path.isEmpty { store.path.removeLast() }
            store.pause()
        } label: { Image(systemName: "chevron.left") }
            .help("Back")
            .keyboardShortcut("[", modifiers: .command)
    }
}
