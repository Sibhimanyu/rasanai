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
    case home, all, needsReview, brands, series, inspire, queue, settings, film(URL)

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

    private var current: StudioPlace? {
        switch store.path.last {
        case nil: .home
        case .library(.all)?: .all
        case .library(.needsReview)?: .needsReview
        case .brands?, .brand?: .brands
        case .series?, .seriesPage?: .series
        case .inspire?: .inspire
        case .queue?: .queue
        case .settings?: .settings
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

    @FocusState private var focused: StudioPlace?

    /// Every destination in on-screen order, so Up and Down walk the menu and then the recent films.
    private var order: [StudioPlace] {
        [.home, .all] + (needsYouCount > 0 ? [.needsReview] : [])
            + [.brands, .series, .inspire, .queue]
            + recentFilms.map { StudioPlace.film($0.1) } + [.settings]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    Button { store.goHome() } label: {
                        HStack(spacing: 12) {
                            RasanMark().fill(Color.rasanInk).frame(width: 22, height: 26).frame(width: 24)
                            Text("RasanAI").font(.system(size: 20, weight: .semibold)).tracking(-0.5)
                                .foregroundStyle(.primary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 14).padding(.horizontal, 6)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 8)
                    .accessibilityLabel("RasanAI Home")
                    .help("Go to Home")
                    navRow("Films", symbol: "movieclapper", place: .home)
                    navRow("All films", symbol: StudioPlace.allSymbol, place: .all)
                    if needsYouCount > 0 {
                        navRow("Needs review", symbol: StudioPlace.needsReviewSymbol, place: .needsReview, count: needsYouCount)
                    }
                    navRow("Brands", symbol: "square.3.layers.3d", place: .brands)
                    navRow("Series", symbol: StudioPlace.seriesSymbol, place: .series)
                    navRow("Inspiration", symbol: StudioPlace.inspireSymbol, place: .inspire)
                    navRow("Queue", symbol: StudioPlace.queueSymbol, place: .queue, count: store.queuedCount)
                    if !recentFilms.isEmpty {
                        Text("Recent")
                            .font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                            .padding(.horizontal, 6).padding(.top, 18).padding(.bottom, 6)
                            .accessibilityAddTraits(.isHeader)
                        ForEach(recentFilms, id: \.0.id) { project, folder in
                            let phase = store.summary(for: folder).phase
                            navRow(project.name, symbol: SidebarFilmRow.mark(for: phase).0, place: .film(folder),
                                   tint: SidebarFilmRow.mark(for: phase).1)
                                .help(project.name)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 8)
            }
            // Up and Down arrive here from whichever row has focus; they move focus only, Return or Space opens the row.
            .onMoveCommand { direction in
                let places = order
                guard !places.isEmpty, direction == .up || direction == .down else { return }
                let from = focused ?? current
                let index = from.flatMap { places.firstIndex(of: $0) }
                let next: Int
                switch (direction, index) {
                case (.down, let i?): next = min(i + 1, places.count - 1)
                case (.up, let i?): next = max(i - 1, 0)
                case (.down, nil): next = 0
                default: next = places.count - 1
                }
                focused = places[next]
                proxy.scrollTo(places[next])
            }
            .onChange(of: needsYouCount) { _, count in
                if count == 0, focused == .needsReview { focused = .all }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SidebarRowButton(selected: current == .settings, action: { go(.settings) }) {
                SidebarNavLabel(title: "Settings", symbol: "gearshape", selected: current == .settings)
            }
            .focused($focused, equals: .settings)
            .padding(.horizontal, 10).padding(.vertical, 8)
        }
        .navigationSplitViewColumnWidth(min: 180, ideal: 205, max: 280)
    }

    /// A place as a spacious, full-width button. No List selection is involved: the row is active when the path says so,
    /// and a click calls `go` directly.
    private func navRow(_ title: String, symbol: String, place: StudioPlace, count: Int = 0, tint: Color? = nil) -> some View {
        let selected = current == place
        return SidebarRowButton(selected: selected, action: { go(place) }) {
            SidebarNavLabel(title: title, symbol: symbol, selected: selected, count: count, tint: tint)
        }
        .focused($focused, equals: place)
        .id(place)
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
        case .settings: [.settings]
        case .film(let folder): [.film(folder)]
        }
        if place == .settings { store.openSettingsPage() } else if store.path != target { store.path = target }
    }
}

/// A full-width sidebar button: the whole row is the hit target, the active row gets one neutral rounded shape, hover a
/// fainter one, and keyboard focus a thin ring. Plain style, so the system never paints a blue selection.
private struct SidebarRowButton<Label: View>: View {
    let selected: Bool
    let action: () -> Void
    @ViewBuilder let label: Label
    @State private var hovering = false
    @Environment(\.isFocused) private var isFocused
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: action) {
            label
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(.return) { action(); return .handled }
        .onKeyPress(.space) { action(); return .handled }
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(selected ? Color(white: 1, opacity: 0.12) : hovering ? Color(white: 1, opacity: 0.06) : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(Color(white: 0.6, opacity: 0.55), lineWidth: 1)
                .opacity(isFocused ? 1 : 0)
        )
        .contentShape(Rectangle())
        .onHover { inside in
            if reduceMotion { hovering = inside } else { withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
        }
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The shared look of a sidebar destination: an 18pt outlined icon centred in a 24pt column, 12pt gap, a 14pt medium label,
/// 42pt tall, an optional count drawn at the trailing edge. Active is the primary label with a lilac icon; inactive is a
/// muted icon (or the film's status colour) with a secondary label.
private struct SidebarNavLabel: View {
    let title: String
    let symbol: String
    let selected: Bool
    var count: Int = 0
    var tint: Color? = nil
    private static let lilac = Color(red: 0.78, green: 0.71, blue: 1.0)

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .light))
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(selected ? Self.lilac : tint ?? Color(white: 0.58))
                .frame(width: 24)
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(selected ? Color.primary : Color.secondary)
                .lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 4)
            if count > 0 {
                Text("\(count)")
                    .font(.system(size: 11, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(selected ? Color.primary : Color.secondary)
                    .padding(.horizontal, 6)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(Color.primary.opacity(selected ? 0.16 : 0.1), in: Capsule())
            }
        }
        .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
        .padding(.horizontal, 6)
        .accessibilityElement(children: .combine)
    }
}

/// The status mark of a film in the sidebar's Recent list: a symbol and colour for where it says something (waiting on you,
/// working, finished); drafts and quiet films show a plain film icon.
private enum SidebarFilmRow {
    static func mark(for phase: FilmPhase) -> (String, Color) {
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
                if let creationStep {
                    if #available(macOS 26, *) {
                        ToolbarItem(placement: .principal) { StudioFlowProgress(current: creationStep).padding(.vertical, 3) }
                            .sharedBackgroundVisibility(.hidden)
                    } else {
                        ToolbarItem(placement: .principal) { StudioFlowProgress(current: creationStep) }
                    }
                }
                ToolbarItemGroup(placement: .primaryAction) { trailing }
            }
    }

    private var creationStep: StudioFlowStep? {
        guard let store else { return nil }
        switch store.path.last {
        case nil: return .describe
        case .newFilm?: return .setup
        default: return nil
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
            case .newFilm, .film, .sample: return ("Films", [])
            default: return nil
            }
        }
        let parent = Array(path.dropLast())
        return (crumbTitle(parent.last), parent)
    }

    func crumbTitle(_ route: Route?) -> String {
        switch route {
        case nil: "Films"
        case .library(let mode)?: mode.title
        case .brands?: "Brands"
        case .brand(let url)?: url.lastPathComponent
        case .queue?: "Queue"
        case .settings?: "Settings"
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
        padding(.horizontal, 36).padding(.top, 36).padding(.bottom, 40)
            .frame(maxWidth: 1240, alignment: .leading).frame(maxWidth: .infinity)
    }
}

/// The first line of a library page, named as its sidebar row is. Home keeps its composer question at the same size.
struct PageTitle: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 30, weight: .semibold)).tracking(-0.7).accessibilityAddTraits(.isHeader)
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

// MARK: Status bar

/// The studio's status bar under every page but a film's (a film page has its own action bar). Each part answers a
/// question and goes somewhere: what the director is doing right now (and the call it is heading for), how many films are
/// waiting on you, the queue, and what this session has used. The sidebar badges already carry the two counts, so the
/// bar repeats them only while the sidebar is hidden; counts that are zero are left out.
struct AppStatusBar: View {
    @Bindable var store: StudioStore
    /// True while the sidebar is hidden, when its badges are not on screen.
    var sidebarHidden = false
    private var agent: LocalAgent { store.settings.agent }
    private var needsYou: Int { store.activeProjects.filter { store.summary(for: $0.1).phase.needsYou }.count }

    var body: some View {
        let queued = store.queuedCount
        HStack(spacing: 14) {
            director.layoutPriority(1)   // readiness and the running film line give way last
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
        .padding(.horizontal, 16).frame(minHeight: 36)
        // A floating bar of the system's own untinted glass, like the sidebar's: it samples what is behind it, with no
        // gradient, solid fill or highlight line of ours on top. The bar itself is not interactive; its buttons are.
        .liquidGlass(in: Capsule(), interactive: false)
        .padding(.horizontal, Workspace.gap).padding(.top, 4).padding(.bottom, 10)
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
                Button { store.openSettingsPage() } label: { Text("\(agent.title) · \(store.settings.pace.title) pace").foregroundStyle(.secondary) }
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
