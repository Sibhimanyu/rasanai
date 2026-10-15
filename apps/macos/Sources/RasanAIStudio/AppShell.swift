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
enum StudioPlace: Hashable {
    case home, all, needsReview, brands, series, inspire, queue, film(URL)

    /// One symbol per place, shared by the sidebar, the Go menu and the status bar so a place always looks the same.
    static let homeSymbol = "house"
    static let allSymbol = "play.rectangle.on.rectangle"                     // a library of videos, as in the TV app
    static let needsReviewSymbol = "eye"                                     // something waiting for you to look at
    static let queueSymbol = "text.line.first.and.arrowtriangle.forward"     // Music's Up Next: what plays next
    static let brandsSymbol = "paintpalette"                                 // colours, type and a logo
    static let seriesSymbol = "rectangle.stack"                              // a show: setup and memory for every episode
    static let inspireSymbol = "rectangle.stack.badge.play"                  // a collection of clips to watch
}

struct AppSidebar: View {
    @Bindable var store: StudioStore
    @Environment(\.openSettings) private var openSettings

    private var current: StudioPlace? {
        switch store.path.last {
        case nil: .home
        case .library(.all)?: .all
        case .library(.needsReview)?: .needsReview
        case .brands?, .brand?: .brands
        case .series?, .seriesPage?: .series
        case .inspire?: .inspire
        case .queue?: .queue
        case .film(let folder)?: .film(folder)
        default: nil
        }
    }
    // Counts and recents read every film that is not archived: a search or the archive view on a library page is that page's.
    private var needsYouCount: Int { store.activeProjects.filter { store.summary(for: $0.1).phase.needsYou }.count }
    /// The latest films, newest first, so the sidebar is also the quickest way back into one.
    private var recentFilms: [(LocalProject, URL)] {
        func stamp(_ item: (LocalProject, URL)) -> Date { store.summary(for: item.1).updatedAt ?? item.0.lastOpenedAt ?? item.0.createdAt }
        return Array(store.activeProjects.sorted { stamp($0) > stamp($1) }.prefix(8))
    }

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
                Label("Home", systemImage: StudioPlace.homeSymbol).tag(StudioPlace.home)
                Label("All films", systemImage: StudioPlace.allSymbol).tag(StudioPlace.all)
                Label("Needs review", systemImage: StudioPlace.needsReviewSymbol).badge(needsYouCount).tag(StudioPlace.needsReview)
                Label("Queue", systemImage: StudioPlace.queueSymbol).badge(store.queuedCount).tag(StudioPlace.queue)
                Label("Brands", systemImage: StudioPlace.brandsSymbol).tag(StudioPlace.brands)
                Label("Series", systemImage: StudioPlace.seriesSymbol).tag(StudioPlace.series)
                Label("Inspiration", systemImage: StudioPlace.inspireSymbol).tag(StudioPlace.inspire)
            }
            if !recentFilms.isEmpty {
                Section("Recent films") {
                    ForEach(recentFilms, id: \.0.id) { project, folder in
                        SidebarFilmRow(name: project.name, phase: store.summary(for: folder).phase).tag(StudioPlace.film(folder))
                    }
                }
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
        case .series: [.series]
        case .inspire: [.inspire]
        case .queue: [.queue]
        case .film(let folder): [.film(folder)]
        }
        if store.path != target { store.path = target }
    }
}

/// A film in the sidebar: its name, with a small mark for its state where it says something (waiting on you, working,
/// finished); drafts and quiet films show a plain film icon.
private struct SidebarFilmRow: View {
    let name: String
    let phase: FilmPhase
    private var mark: (String, Color) {
        switch phase {
        case .yourTurn: ("eye.fill", Color(nsColor: .systemOrange))
        case .needsAttention: ("exclamationmark.triangle.fill", Color(nsColor: .systemRed))
        case .working, .starting: ("sparkles", Color(nsColor: .systemPurple))
        case .finished: ("checkmark.circle.fill", Color(nsColor: .systemGreen))
        case .queued: ("list.number", .secondary)
        case .paused: ("pause.circle", .secondary)
        case .draft, .inProgress, .offline: ("film", .secondary)
        }
    }
    var body: some View {
        let (symbol, color) = mark
        Label { Text(name).lineLimit(1).truncationMode(.tail) } icon: { Image(systemName: symbol).foregroundStyle(color) }
            .help(name)
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
                .disabled(!(store?.canGoBack ?? false)).help("Back (⌘[)")
            Button { store?.goForward() } label: { Label("Forward", systemImage: "chevron.right") }
                .disabled(!(store?.canGoForward ?? false)).help("Forward (⌘])")
        }
    }
}

/// The page's tools in the window toolbar. No title on the sidebar's own places (the sidebar already says where you are);
/// a page one level down (a brand, New film) shows a breadcrumb back to where it came from instead.
private struct PageToolbar<Trailing: View>: ViewModifier {
    let title: String
    @ViewBuilder var trailing: Trailing
    @Environment(\.momentStore) private var store
    func body(content: Content) -> some View {
        content
            .buttonStyle(.rasanSecondary)   // inside the page only: toolbar items keep the system's glass
            .navigationTitle(title)         // still names the window: the Window menu, Mission Control
            .navigationBarBackButtonHidden(true)
            .modifier(HiddenToolbarTitle())
            .toolbar {
                HistoryToolbar(store: store)
                if let store, let crumb = store.crumb { BreadcrumbToolbar(parent: crumb.title, title: title) { store.path = crumb.path } }
                ToolbarItemGroup(placement: .primaryAction) { trailing }
            }
    }
}

private struct HiddenToolbarTitle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(macOS 15, *) { content.toolbar(removing: .title) }
        else { content.toolbar { ToolbarItem(placement: .principal) { EmptyView() } } }   // macOS 14: an empty title slot
    }
}

/// The breadcrumb as a toolbar item with no glass capsule of its own: it is a line of text and a link, not a button.
private struct BreadcrumbToolbar: ToolbarContent {
    let parent: String
    let title: String
    let action: () -> Void
    var body: some ToolbarContent {
        if #available(macOS 26, *) {
            ToolbarItem(placement: .navigation) { Breadcrumb(parent: parent, title: title, action: action) }
                .sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: .navigation) { Breadcrumb(parent: parent, title: title, action: action) }
        }
    }
}

/// "Brands › Acme": the parent is a link back, the page itself is plain text.
private struct Breadcrumb: View {
    let parent: String
    let title: String
    let action: () -> Void
    @State private var hovering = false
    var body: some View {
        HStack(spacing: 6) {
            Button(parent, action: action).buttonStyle(.plain).foregroundStyle(hovering ? .primary : .secondary)
                .onHover { hovering = $0 }.hoverCursor(.pointingHand).help("Back to \(parent)")
            Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(.tertiary)
            Text(title).fontWeight(.semibold).lineLimit(1)
        }
        .font(.system(size: 13)).padding(.horizontal, 8)
        .accessibilityElement(children: .contain).accessibilityLabel("\(parent), \(title)")
    }
}

extension StudioStore {
    /// Where a breadcrumb leads back to, and what it is called. Nil on the sidebar's own places.
    var crumb: (title: String, path: [Route])? {
        guard let last = path.last else { return nil }
        if path.count == 1 {
            switch last {
            case .brand: return ("Brands", [.brands])
            case .seriesPage: return ("Series", [.series])
            case .newFilm, .film, .sample: return ("Home", [])
            default: return nil
            }
        }
        let parent = Array(path.dropLast())
        return (crumbTitle(parent.last), parent)
    }

    func crumbTitle(_ route: Route?) -> String {
        switch route {
        case nil: "Home"
        case .library(let mode)?: mode.title
        case .brands?: "Brands"
        case .brand(let url)?: url.lastPathComponent
        case .queue?: "Queue"
        case .series?: "Series"
        case .seriesPage(let url)?: SeriesLibrary.load(url)?.name ?? url.lastPathComponent
        case .inspire?: "Inspiration"
        case .sample?: "Sample film"
        case .newFilm?: "New film"
        case .film(let url)?: localProjects.first { $0.1 == url }?.0.name ?? "Film"
        }
    }
}

extension View {
    /// The page's tools in the window toolbar (back and forward lead it), and a breadcrumb when the page is a level down.
    func pageHeader<Trailing: View>(_ title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        modifier(PageToolbar(title: title, trailing: trailing))
    }
    func pageHeader(_ title: String) -> some View { pageHeader(title) { EmptyView() } }
    /// A library page's content column, as on Home: the same margins, at most 1240 wide, held to the left edge so titles
    /// line up from page to page.
    func pageColumn() -> some View {
        padding(.horizontal, 32).padding(.top, 28).padding(.bottom, 40)
            .frame(maxWidth: 1240, alignment: .leading).frame(maxWidth: .infinity)
    }
}

/// The first line of a library page, named as its sidebar row is. Home keeps its composer question at the same size.
struct PageTitle: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 26, weight: .bold)).tracking(-0.4).accessibilityAddTraits(.isHeader)
    }
}

extension StudioStore {
    /// Films waiting their turn in the queue; the sidebar badge and the status bar both say this number.
    var queuedCount: Int { settings.filmQueue.filter { $0.state != .running }.count }
}

/// The native search field as an ordinary toolbar item, so it can sit before the page's primary button. `.searchable`
/// always takes the trailing end of the toolbar, after everything else.
struct ToolbarSearchField: NSViewRepresentable {
    /// Posted by Edit › Find Films (⌘F) to put the cursor in the field.
    static let focusRequest = Notification.Name("RasanAIStudio.focusSearch")
    @Binding var text: String
    let prompt: String
    func makeNSView(context: Context) -> NSSearchField {
        let field = NSSearchField()
        field.placeholderString = prompt
        field.sendsSearchStringImmediately = true
        field.delegate = context.coordinator
        context.coordinator.observer = NotificationCenter.default.addObserver(forName: Self.focusRequest, object: nil, queue: .main) { [weak field] _ in
            field?.window?.makeFirstResponder(field)
        }
        return field
    }
    func updateNSView(_ field: NSSearchField, context: Context) { if field.stringValue != text { field.stringValue = text } }
    func makeCoordinator() -> Coordinator { Coordinator(text: $text) }
    final class Coordinator: NSObject, NSSearchFieldDelegate {
        var text: Binding<String>
        var observer: NSObjectProtocol?
        init(text: Binding<String>) { self.text = text }
        deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
        func controlTextDidChange(_ note: Notification) {
            if let field = note.object as? NSSearchField { text.wrappedValue = field.stringValue }
        }
    }
}

/// "+ New film", the studio's one prominent toolbar button: tinted glass on Tahoe.
struct NewFilmHeaderButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) { Label("New film", systemImage: "plus").labelStyle(.titleAndIcon) }
            .buttonStyle(.borderedProminent).tint(Color.rasanFill)
            .help("Start a new film (⌘N)")   // ⌘N itself is File › New Film's
    }
}

// MARK: Status bar

/// The studio's status bar under every page but a film's (a film page has its own action bar). Each part answers a
/// question and goes somewhere: what the director is doing right now (and the call it is heading for), how many films are
/// waiting on you, the queue, and what this session has used. The sidebar badges already carry the two counts, so the
/// bar repeats them only while the sidebar is hidden; counts that are zero are left out.
struct AppStatusBar: View {
    @Bindable var store: StudioStore
    /// True while the sidebar is hidden, when its badges are not on screen.
    var sidebarHidden = false
    @Environment(\.openSettings) private var openSettings
    private var agent: LocalAgent { store.settings.agent }
    private var needsYou: Int { store.activeProjects.filter { store.summary(for: $0.1).phase.needsYou }.count }

    var body: some View {
        let queued = store.queuedCount
        HStack(spacing: 14) {
            director
            if let notice = store.notice {
                Text(notice).foregroundStyle(.secondary).transition(.opacity)
            }
            Spacer(minLength: 12)
            if sidebarHidden, needsYou > 0 {
                Button { store.path = [.library(.needsReview)] } label: {
                    Label(needsYou == 1 ? "1 film needs you" : "\(needsYou) films need you", systemImage: "eye.fill")
                }
                .foregroundStyle(Color(nsColor: .systemOrange)).help("Open Needs review")
            }
            if sidebarHidden, queued > 0 {
                Button { store.path = [.queue] } label: { Label("\(queued) queued", systemImage: StudioPlace.queueSymbol) }
                    .foregroundStyle(.secondary).help("Open the queue")
            }
            if let totals = store.monitor.sessionTotals {
                Text("\(UsageFormat.tokens(totals.tokens)) tokens" + (totals.plan ? "" : " · \(UsageFormat.dollars(totals.usd))\(totals.estimated ? " est." : "")"))
                    .foregroundStyle(.tertiary).monospacedDigit()
                    .help("Used this session, across \(totals.films) film\(totals.films == 1 ? "" : "s")")
            }
        }
        .buttonStyle(.accessoryBarAction).font(.system(size: 11.5)).lineLimit(1)
        .animation(.default, value: store.notice)
        .padding(.horizontal, 24).frame(height: 28)
        .background { GlassSurface() }   // the studio's chrome glass, as on the film page
        .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.10)).frame(height: 1) }
    }

    /// Working: the film, what it is doing and the next call, and a click goes to it. Idle: ready, with the director and
    /// pace a new film will use. Not set up: the way to set it up.
    @ViewBuilder private var director: some View {
        if (store.runtime.isRunning || store.runtime.isPreparing), let active = store.activeDirectorProject {
            HStack(spacing: 10) {
                Button { store.showFilm(active) } label: {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.mini)
                        Text(store.currentFilmTitle).font(.system(size: 12, weight: .medium))
                        if case .working(let activity, _, let next)? = store.turnState {
                            Text(TurnState.sentenceCaseFirst(activity)).foregroundStyle(.secondary).truncationMode(.tail)
                            if let next { Text(TurnState.sentenceCaseFirst(next)).foregroundStyle(.tertiary) }
                        } else {
                            Text(store.phase.homeLine).foregroundStyle(.secondary)
                        }
                    }
                }
                .help("Open the film the director is working on")
                Button { if store.runtime.isFrozen { store.resumeDirector() } else { store.pauseDirector() } } label: { Image(systemName: store.runtime.isFrozen ? "play.fill" : "pause.fill") }
                    .foregroundStyle(.secondary).disabled(store.runtime.isPreparing).help(store.runtime.isFrozen ? "Resume the director" : "Pause the director")
            }
        } else if store.settings.isReady(agent) {
            HStack(spacing: 8) {
                Circle().fill(Color(nsColor: .systemGreen)).frame(width: 8, height: 8)
                Text("Ready for a film").font(.system(size: 12, weight: .medium))
                Button { openSettings() } label: { Text("\(agent.title) · \(store.settings.pace.title) pace").foregroundStyle(.secondary) }
                    .help("Change the director or pace in Settings")
            }
        } else {
            HStack(spacing: 8) {
                Circle().fill(Color(nsColor: .systemOrange)).frame(width: 8, height: 8)
                Text("No director set up").font(.system(size: 12, weight: .medium))
                Button("Set up…") { store.settings.showWelcome = true }
            }
        }
    }
}

extension View {
    /// Liquid Glass on macOS 26 and later; a frosted material before it.
    @ViewBuilder func liquidGlass(in shape: some Shape, interactive: Bool = true) -> some View {
        if #available(macOS 26, *) { self.glassEffect(interactive ? .regular.interactive() : .regular, in: shape) }
        else { self.background(.regularMaterial, in: shape).overlay { shape.stroke(Color.primary.opacity(0.10), lineWidth: 1) } }
    }
}

