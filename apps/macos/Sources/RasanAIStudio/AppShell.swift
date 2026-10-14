import AppKit
import StudioCore
import SwiftUI

/// Which films a library page shows.
enum LibraryMode: String, Hashable {
    case all, needsReview
    var title: String { self == .all ? "All films" : "Needs review" }
}

// MARK: Sidebar

/// The places in the studio, as a native source list in the split view's sidebar. On macOS Tahoe the system draws it as the
/// floating glass sidebar, places the window buttons inside it and moves its toggle into the toolbar when it hides.
enum StudioPlace: Hashable { case home, all, needsReview, brands, templates, inspire, queue }

struct AppSidebar: View {
    @Bindable var store: StudioStore
    @Environment(\.openSettings) private var openSettings

    private var current: StudioPlace? {
        switch store.path.last {
        case nil: .home
        case .library(.all)?: .all
        case .library(.needsReview)?: .needsReview
        case .brands?, .brand?: .brands
        case .templates?: .templates
        case .inspire?: .inspire
        case .queue?: .queue
        default: nil
        }
    }
    private var needsYouCount: Int { store.visibleProjects.filter { store.summary(for: $0.1).phase.needsYou }.count }

    var body: some View {
        List(selection: Binding(get: { current }, set: { if let place = $0 { go(place) } })) {
            // The brand as the list's first line: the mark and the name at full weight, not a small grey section header.
            HStack(spacing: 10) {
                RasanMark().fill(Color.rasanInk).frame(width: 18, height: 22)
                Text("RasanAI Studio").font(.system(size: 15, weight: .semibold)).foregroundStyle(.primary)
            }
            .padding(.leading, 2).padding(.top, 2).padding(.bottom, 8)
            .listRowBackground(Color.clear)
            .selectionDisabled()
            .accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
            Section {
                Label("Home", systemImage: "house").tag(StudioPlace.home)
                Label("All films", systemImage: "film.stack").tag(StudioPlace.all)
                Label("Needs review", systemImage: "clock").badge(needsYouCount).tag(StudioPlace.needsReview)
                Label("Queue", systemImage: "list.bullet.rectangle").badge(store.settings.filmQueue.count).tag(StudioPlace.queue)
                Label("Brands", systemImage: "tag").tag(StudioPlace.brands)
                Label("Templates", systemImage: "square.grid.2x2").tag(StudioPlace.templates)
                Label("Inspiration", systemImage: "sparkles").tag(StudioPlace.inspire)
            }
        }
        .listStyle(.sidebar)
        .tint(Color.rasan)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button { openSettings() } label: { Label("Settings", systemImage: "gearshape").frame(maxWidth: .infinity, alignment: .leading) }
                .buttonStyle(.plain).foregroundStyle(.secondary)
                .padding(.horizontal, 18).padding(.vertical, 12)
        }
        .navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 300)
    }

    private func go(_ place: StudioPlace) {
        let target: [Route] = switch place {
        case .home: []
        case .all: [.library(.all)]
        case .needsReview: [.library(.needsReview)]
        case .brands: [.brands]
        case .templates: [.templates]
        case .inspire: [.inspire]
        case .queue: [.queue]
        }
        if store.path != target { store.path = target }
    }
}

// MARK: Toolbar

/// Back and forward through where the person has been, as a browser does. In the toolbar's navigation slot, so Tahoe groups
/// them into one glass capsule.
struct HistoryToolbar: ToolbarContent {
    let store: StudioStore?
    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            Button { store?.goBack() } label: { Label("Back", systemImage: "chevron.left") }
                .disabled(!(store?.canGoBack ?? false)).keyboardShortcut("[", modifiers: .command).help("Back")
            Button { store?.goForward() } label: { Label("Forward", systemImage: "chevron.right") }
                .disabled(!(store?.canGoForward ?? false)).keyboardShortcut("]", modifiers: .command).help("Forward")
        }
    }
}

private struct PageToolbar<Trailing: View>: ViewModifier {
    let title: String
    @ViewBuilder var trailing: Trailing
    @Environment(\.momentStore) private var store
    func body(content: Content) -> some View {
        content
            .buttonStyle(.rasanSecondary)   // inside the page only: toolbar items keep the system's glass
            .navigationTitle(title)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                HistoryToolbar(store: store)
                ToolbarItemGroup(placement: .primaryAction) { trailing }
            }
    }
}

extension View {
    /// The page's title and tools in the window toolbar (back and forward lead it).
    func pageHeader<Trailing: View>(_ title: String, onBack: (() -> Void)? = nil, @ViewBuilder trailing: () -> Trailing) -> some View {
        modifier(PageToolbar(title: title, trailing: trailing))
    }
    func pageHeader(_ title: String, onBack: (() -> Void)? = nil) -> some View { pageHeader(title, onBack: onBack) { EmptyView() } }
}

/// "+ New film", the studio's one prominent toolbar button: tinted glass on Tahoe.
struct NewFilmHeaderButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) { Label("New film", systemImage: "plus").labelStyle(.titleAndIcon) }
            .buttonStyle(.borderedProminent).tint(Color.rasanFill)
            .keyboardShortcut("n", modifiers: .command)
            .help("Start a new film (⌘N)")
    }
}

// MARK: Status bar

/// The studio's status bar under every page but a film's (a film page has its own action bar): whether the director can
/// take a film, which director and pace, and the queue.
struct AppStatusBar: View {
    @Bindable var store: StudioStore
    private var agent: LocalAgent { store.settings.agent }

    var body: some View {
        let ready = store.settings.isReady(agent)
        let busy = store.runtime.isRunning || store.runtime.isPreparing
        let queued = store.settings.filmQueue.count
        HStack(spacing: 12) {
            Circle().fill(busy ? Color.rasan : ready ? Color(nsColor: .systemGreen) : Color(nsColor: .systemOrange)).frame(width: 9, height: 9)
            Text(busy ? "Director working" : ready ? "Director available" : "Director not set up").font(.system(size: 13, weight: .medium))
            Rectangle().fill(Workspace.hairline).frame(width: 1, height: 14)
            Text("\(agent.title) · \(store.settings.pace.title) pace").font(.system(size: 12.5)).foregroundStyle(.secondary)
            Spacer()
            Button(queued == 0 ? "No films queued" : queued == 1 ? "1 film queued" : "\(queued) films queued") { store.path = [.queue] }
                .buttonStyle(.plain).font(.system(size: 12.5)).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 24).frame(height: 40)
        .overlay(alignment: .top) { Rectangle().fill(Workspace.hairline).frame(height: 1) }
    }
}

extension View {
    /// Liquid Glass on macOS 26 and later; a frosted material before it.
    @ViewBuilder func liquidGlass(in shape: some Shape, interactive: Bool = true) -> some View {
        if #available(macOS 26, *) { self.glassEffect(interactive ? .regular.interactive() : .regular, in: shape) }
        else { self.background(.regularMaterial, in: shape).overlay { shape.stroke(Color.primary.opacity(0.10), lineWidth: 1) } }
    }
}

