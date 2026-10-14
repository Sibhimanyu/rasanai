import AppKit
import StudioCore
import SwiftUI

enum HomeSort: String, CaseIterable, Identifiable {
    case recent, name, status
    var id: String { rawValue }
    var title: String { switch self { case .recent: "Recent"; case .name: "Name"; case .status: "Status" } }
    var symbol: String { switch self { case .recent: "clock"; case .name: "textformat"; case .status: "circle.dotted" } }
}

/// Short, friendly aspect names shared by the cards.
func aspectName(_ aspect: String?) -> String? {
    guard let aspect else { return nil }
    return ["16:9": "Landscape", "9:16": "Portrait", "1:1": "Square"][aspect]
}

/// "45 s · Landscape": one way to write a film's length and shape, on every surface.
func filmFacts(duration: Int?, aspect: String?) -> String {
    [duration.flatMap { $0 > 0 ? "\($0) s" : nil }, aspect.map { aspectName($0) ?? $0 }].compactMap { $0 }.joined(separator: " · ")
}

struct HomeView: View {
    @Bindable var store: StudioStore
    /// nil is Home itself; a library mode lists every film, or the ones waiting on the person.
    var mode: LibraryMode? = nil
    @AppStorage("homeSort") private var sortRaw = HomeSort.recent.rawValue
    @AppStorage("homeLayout") private var layoutRaw = "grid"
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.undoManager) private var undoManager
    @State private var renameFolder: URL?
    @State private var renameName = ""
    @State private var trashFolder: URL?

    private var sort: HomeSort { HomeSort(rawValue: sortRaw) ?? .recent }
    private var asList: Bool { layoutRaw == "list" }
    /// The archive view is All films' own; Home and Needs review always list live films.
    private var archived: Bool { mode == .all && store.showArchivedProjects }
    private func stamp(_ item: (LocalProject, URL)) -> Date { store.summary(for: item.1).updatedAt ?? item.0.lastOpenedAt ?? item.0.createdAt }
    private func rank(_ phase: FilmPhase) -> Int {
        switch phase {
        case .yourTurn, .needsAttention, .paused: 0
        case .working, .starting: 1
        case .queued: 2
        case .inProgress, .offline: 3
        case .draft: 4
        case .finished: 5
        }
    }
    private var films: [(LocalProject, URL)] {
        store.localProjects.filter { project, _ in
            (archived ? project.archivedAt != nil : project.archivedAt == nil)
                && (store.projectSearch.isEmpty || project.name.localizedCaseInsensitiveContains(store.projectSearch))
        }.sorted { a, b in
            switch sort {
            case .recent: return stamp(a) > stamp(b)
            case .name: return a.0.name.localizedStandardCompare(b.0.name) == .orderedAscending
            case .status:
                let ra = rank(store.summary(for: a.1).phase), rb = rank(store.summary(for: b.1).phase)
                return ra == rb ? stamp(a) > stamp(b) : ra < rb
            }
        }
    }
    /// Films that are stopped until the person acts.
    private var needsYou: [(LocalProject, URL)] { films.filter { store.summary(for: $0.1).phase.needsYou } }
    /// The film Home leads with: the first one waiting on the person, else the latest one still in the works.
    private var featured: (LocalProject, URL)? {
        needsYou.first ?? films.sorted { stamp($0) > stamp($1) }.first { !store.summary(for: $0.1).isFinished }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                switch mode {
                case nil:
                    composer
                    if let featured { featuredSection(featured) }
                    if !films.isEmpty { filmsSection(title: "Recent films", items: Array(films.filter { $0.1 != featured?.1 }.prefix(6)), showAll: films.count > 7) }
                case .all?:
                    PageTitle(text: "All films").padding(.bottom, -14)
                    filmsSection(title: archived ? "Archived films" : nil, items: films, showAll: false)
                case .needsReview?:
                    PageTitle(text: "Needs review").padding(.bottom, -14)
                    if needsYou.isEmpty {
                        ContentUnavailableView("Nothing needs you", systemImage: "checkmark.circle",
                                               description: Text("When a film is waiting for one of your calls, it shows up here."))
                            .frame(maxWidth: .infinity, minHeight: 320)
                    }
                    ForEach(needsYou, id: \.0.id) { project, folder in
                        FeaturedFilmCard(name: project.name, summary: store.summary(for: folder)) { open(folder) } menu: { menu(project, folder) }
                            .contextMenu { menu(project, folder) }
                            .onDeleteCommand { trashFolder = folder }
                    }
                }
            }
            .pageColumn()
        }
        .scrollIndicators(.automatic)
        .background(Color.appBackground)
        .navigationTitle(mode?.title ?? "Home")
        .pageHeader(mode?.title ?? "Home") {
            ToolbarSearchField(text: $store.projectSearch, prompt: "Search films").frame(width: 220)
            Menu {
                Button("Check Readiness…") { store.showPreflight() }
                Button("Import Project…") { store.importProjectPanel() }
                if mode == .all {
                    Divider()
                    Toggle("Show Archived Films", isOn: $store.showArchivedProjects)
                }
            } label: { Label("More", systemImage: "ellipsis") }
                .menuIndicator(.hidden).help("More").tint(.primary)   // a toolbar tool, white like its neighbours, not the brand tint
            NewFilmHeaderButton { store.newFilm() }
        }
        .alert("Rename film", isPresented: Binding(get: { renameFolder != nil }, set: { if !$0 { renameFolder = nil } })) {
            TextField("Film name", text: $renameName)
            Button("Cancel", role: .cancel) { renameFolder = nil }
            Button("Rename") { if let folder = renameFolder { store.manageProject(folder, action: "rename", name: renameName) }; renameFolder = nil }
        } message: { Text("Only the display name changes. The folder stays where it is.") }
        .confirmationDialog("Move this film and all its files to the Trash?", isPresented: Binding(get: { trashFolder != nil }, set: { if !$0 { trashFolder = nil } }), titleVisibility: .visible) {
            Button("Move to Trash", role: .destructive) { if let folder = trashFolder { store.manageProject(folder, action: "trash") }; trashFolder = nil }
        } message: { Text("You can put it back from the Trash in Finder.") }
    }

    // MARK: Sections

    /// The prompt box, right on Home: describe it and start. The full editor (format grid, footage wells, templates) is one
    /// click away under it and keeps whatever was typed here.
    private var composer: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("What shall we make?").font(.system(size: 26, weight: .bold)).tracking(-0.4).accessibilityAddTraits(.isHeader)
            NewFilmView(store: store, project: nil, embedded: true)
            HStack(spacing: 14) {
                Button { store.newFilm() } label: { Label("More options", systemImage: "slider.horizontal.3") }
                    .buttonStyle(.link).font(.system(size: 12.5))
                    .help("Open the full editor: what you are making, footage folders, a reference video, templates")
                Button { store.path = [.inspire] } label: { Label("Inspiration", systemImage: "sparkles") }
                    .buttonStyle(.link).font(.system(size: 12.5))
                Spacer()
            }
        }
    }

    private func featuredSection(_ item: (LocalProject, URL)) -> some View {
        let waiting = needsYou.count
        return VStack(alignment: .leading, spacing: 14) {
            Text(waiting == 0 ? "Latest film" : waiting == 1 ? "Waiting for your review" : "\(waiting) films are waiting for you")
                .font(.system(size: 20, weight: .bold)).tracking(-0.3).accessibilityAddTraits(.isHeader)
            FeaturedFilmCard(name: item.0.name, summary: store.summary(for: item.1)) { open(item.1) } menu: { menu(item.0, item.1) }
                .contextMenu { menu(item.0, item.1) }
                .onDeleteCommand { trashFolder = item.1 }
        }
    }

    /// A film list with its own view and sort controls. A page that already has a title passes none.
    private func filmsSection(title: String?, items: [(LocalProject, URL)], showAll: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                if let title { Text(title).font(.system(size: 20, weight: .bold)).tracking(-0.3).accessibilityAddTraits(.isHeader) }
                if showAll {
                    Button("All films") { store.path = [.library(.all)] }.buttonStyle(.link).font(.system(size: 12.5))
                }
                Spacer()
                FlatSegmented(selection: $layoutRaw, options: [("grid", "Grid", "square.grid.2x2"), ("list", "List", "list.bullet")], iconOnly: true)
                Picker("Sort By", selection: $sortRaw) {
                    ForEach(HomeSort.allCases) { Text($0.title).tag($0.rawValue) }
                }
                .pickerStyle(.menu).fixedSize().help("Sort films")
            }
            if items.isEmpty {
                emptyState.frame(maxWidth: .infinity, minHeight: 320)
            } else if asList {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.0.id) { index, item in
                        if index > 0 { Divider() }
                        FilmListRow(name: item.0.name, summary: store.summary(for: item.1)) { open(item.1) } menu: { menu(item.0, item.1) }
                            .contextMenu { menu(item.0, item.1) }
                            .onDeleteCommand { trashFolder = item.1 }
                    }
                }
                .workspacePanel()
                .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 440), spacing: 16, alignment: .top)], spacing: 16) {
                    ForEach(items, id: \.0.id) { project, folder in
                        FilmTile(name: project.name, summary: store.summary(for: folder)) { open(folder) } menu: { menu(project, folder) }
                            .contextMenu { menu(project, folder) }
                            .onDeleteCommand { trashFolder = folder }
                            .dropDestination(for: URL.self) { urls, _ in store.importSources(urls.filter(\.isFileURL), into: folder) }
                    }
                }
                .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
            }
        }
        .animation(reduceMotion ? nil : .snappy, value: items.map(\.0.id))
        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: layoutRaw)
    }

    @ViewBuilder private var emptyState: some View {
        if !store.projectSearch.isEmpty { ContentUnavailableView.search(text: store.projectSearch) }
        else if archived { ContentUnavailableView("No archived films", systemImage: "archivebox", description: Text("Films you archive wait here.")) }
        else { ContentUnavailableView("No films yet", systemImage: StudioPlace.allSymbol, description: Text("Films you start with New film appear here.")) }
    }

    private func menu(_ project: LocalProject, _ folder: URL) -> some View {
        Group {
            Button("Open") { open(folder) }
            Button("Rename…") { renameFolder = folder; renameName = project.name }
            Button("Duplicate") { store.manageProject(folder, action: "duplicate") }
            Button("Check Readiness…") { store.showPreflight(project: folder) }
            Button("Export Project…") { store.exportProject(folder) }
            Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([folder]) }
            Button(project.archivedAt == nil ? "Archive" : "Unarchive") { archive(folder, undo: project.archivedAt == nil) }
            Divider()
            Button("Move to Trash…", role: .destructive) { trashFolder = folder }
        }
    }

    /// Archiving can be undone from Edit › Undo, so it needs no confirmation.
    private func archive(_ folder: URL, undo archiving: Bool) {
        store.manageProject(folder, action: archiving ? "archive" : "unarchive")
        undoManager?.registerUndo(withTarget: store) { store in store.manageProject(folder, action: archiving ? "unarchive" : "archive") }
        undoManager?.setActionName(archiving ? "Archive Film" : "Unarchive Film")
    }

    /// From a library page the film is pushed on top of it (the breadcrumb then reads "All films ›"); from Home it replaces Home.
    private func open(_ folder: URL) {
        if mode == nil { store.path = [.film(folder)] } else { store.path.append(.film(folder)) }
    }
}

/// Opens a film card on a click, Return or Space, lets Tab reach it, and shows where the keyboard is.
private struct OpensOnActivate: ViewModifier {
    let action: () -> Void
    @FocusState private var focused: Bool
    func body(content: Content) -> some View {
        // Focus goes on first and the click on top of it. A plain `.focusable()` outside the tap gesture takes the mouse
        // down for itself on macOS, so a click focused the card and never opened it; `.activate` focus is a button's kind.
        content
            .focusable(interactions: .activate).focused($focused).focusEffectDisabled()
            .onKeyPress(.return) { action(); return .handled }
            .onKeyPress(.space) { action(); return .handled }
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
            .overlay {
                RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous)
                    .strokeBorder(Color.accentColor, lineWidth: 2).opacity(focused ? 1 : 0).allowsHitTesting(false)
            }
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(.default, action)
    }
}

// MARK: Film cards

/// A film's state as a tinted capsule: "Needs review", "Finished", "Draft"…
struct FilmStatusBadge: View {
    let phase: FilmPhase
    private var look: (String, String, Color) {
        switch phase {
        case .yourTurn: ("Needs review", StudioPlace.needsReviewSymbol, Color(nsColor: .systemOrange))
        case .needsAttention: ("Needs attention", "exclamationmark.triangle", Color(nsColor: .systemRed))
        case .paused: ("Paused", "pause.circle", .secondary)
        case .finished: ("Finished", "checkmark.circle", Color(nsColor: .systemGreen))
        case .draft: ("Draft", "doc.text", Color(nsColor: .systemBlue))
        case .working, .starting: ("Director working", "sparkles", Color(nsColor: .systemPurple))
        case .queued(let n): ("Queued · \(n)", "list.number", .secondary)
        case .inProgress, .offline: ("In progress", "circle.dashed", .secondary)
        }
    }
    var body: some View {
        let (title, symbol, color) = look
        Label(title, systemImage: symbol).font(.system(size: 12.5, weight: .medium)).foregroundStyle(color)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(color.opacity(0.13), in: Capsule())
            .fixedSize()
    }
}

/// The shape on a card (the length is on the poster), and "Updated 12 min ago" on its own.
private func filmFacts(_ summary: FilmSummary) -> String { filmFacts(duration: nil, aspect: summary.aspect) }
private func updatedLine(_ summary: FilmSummary) -> String? {
    guard let date = summary.updatedAt else { return nil }
    let formatter = RelativeDateTimeFormatter(); formatter.unitsStyle = .full
    return abs(date.timeIntervalSinceNow) < 45 ? "Updated just now" : "Updated " + formatter.localizedString(for: date, relativeTo: Date())
}

/// A poster with its running time in the corner.
private struct PosterWithTime: View {
    let name: String
    let summary: FilmSummary
    var body: some View {
        FilmThumbnail(name: name, poster: summary.poster)
            .overlay(alignment: .bottomTrailing) {
                if let duration = summary.duration, duration > 0 {
                    Text(clockText(Double(duration))).font(.system(size: 12, weight: .semibold)).monospacedDigit().foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 3).background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                        .padding(8)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

/// Home's lead card: a big poster, the film's state and why it is waiting, and one clear way in.
struct FeaturedFilmCard<Menu: View>: View {
    let name: String
    let summary: FilmSummary
    let action: () -> Void
    @ViewBuilder var menu: () -> Menu
    @State private var hovering = false
    private var reason: String {
        switch summary.phase {
        case .yourTurn(let what): "Waiting for you to \(what)."
        case .paused: "Paused. Your work is saved; resume whenever you like."
        case .needsAttention: "Something needs a look. Open it to see why."
        case .draft: "A draft. Check the brief, then start it."
        case .working, .starting: "The director is working on it."
        default: summary.detail ?? ""
        }
    }
    private var verb: String {
        switch summary.phase {
        case .yourTurn: "Review film"
        case .paused: "Resume"
        case .draft: "Open draft"
        default: "Open film"
        }
    }
    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            PosterWithTime(name: name, summary: summary).frame(width: 320)
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    Text(name).font(.system(size: 20, weight: .semibold)).tracking(-0.2).lineLimit(2)
                    Spacer(minLength: 6)
                    SwiftUI.Menu { menu() } label: { Image(systemName: "ellipsis").font(.system(size: 14, weight: .semibold)).frame(width: 24, height: 20) }
                        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().help("More")
                }
                FilmStatusBadge(phase: summary.phase)
                HStack(spacing: 6) {
                    if !filmFacts(summary).isEmpty { Text(filmFacts(summary)) }
                    if let updated = updatedLine(summary) { if !filmFacts(summary).isEmpty { Text("·") }; Text(updated) }
                }
                .font(.system(size: 13)).foregroundStyle(.secondary).monospacedDigit()
                if !reason.isEmpty { Text(reason).font(.system(size: 14)).fixedSize(horizontal: false, vertical: true).padding(.top, 2) }
                Button(action: action) { Text(verb).padding(.horizontal, 6) }
                    .buttonStyle(.rasanSecondary).controlSize(.large).padding(.top, 6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(hovering ? Workspace.raised : Workspace.panel, in: RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).strokeBorder(hovering ? Color.primary.opacity(0.22) : Workspace.hairline, lineWidth: 1) }
        .modifier(OpensOnActivate(action: action))
        .onHover { hovering = $0 }
        .animation(.snappy(duration: 0.15), value: hovering)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(name), \(reason)")
    }
}

/// A film in the grid: poster on the left, its name, state, facts and a ••• menu on the right.
struct FilmTile<Menu: View>: View {
    let name: String
    let summary: FilmSummary
    let action: () -> Void
    @ViewBuilder var menu: () -> Menu
    @State private var hovering = false
    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            PosterWithTime(name: name, summary: summary).frame(width: 220)
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    Text(name).font(.system(size: 16, weight: .semibold)).lineLimit(2)
                    Spacer(minLength: 6)
                    SwiftUI.Menu { menu() } label: { Image(systemName: "ellipsis").font(.system(size: 14, weight: .semibold)).frame(width: 24, height: 20) }
                        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().help("More")
                }
                FilmStatusBadge(phase: summary.phase)
                if !filmFacts(summary).isEmpty { Text(filmFacts(summary)).font(.system(size: 13)).foregroundStyle(.secondary).monospacedDigit() }
                if let updated = updatedLine(summary) { Text(updated).font(.system(size: 13)).foregroundStyle(.secondary) }
            }
        }
        .padding(12)
        .background(hovering ? Workspace.raised : Workspace.panel, in: RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).strokeBorder(hovering ? Color.primary.opacity(0.22) : Workspace.hairline, lineWidth: 1) }
        .modifier(OpensOnActivate(action: action))
        .onHover { hovering = $0 }
        .animation(.snappy(duration: 0.15), value: hovering)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(.isButton)
    }
}

/// A film in the list: a small poster, name, state, facts, and when it last changed.
struct FilmListRow<Menu: View>: View {
    let name: String
    let summary: FilmSummary
    let action: () -> Void
    @ViewBuilder var menu: () -> Menu
    @State private var hovering = false
    var body: some View {
        HStack(spacing: 14) {
            PosterWithTime(name: name, summary: summary).frame(width: 112)
            Text(name).font(.system(size: 14, weight: .semibold)).lineLimit(1).frame(minWidth: 160, alignment: .leading)
            FilmStatusBadge(phase: summary.phase)
            Spacer(minLength: 8)
            Text(filmFacts(summary)).font(.system(size: 12.5)).foregroundStyle(.secondary).monospacedDigit()
            Text(updatedLine(summary) ?? "").font(.system(size: 12.5)).foregroundStyle(.secondary).frame(width: 170, alignment: .trailing)
            SwiftUI.Menu { menu() } label: { Image(systemName: "ellipsis").frame(width: 24, height: 20) }
                .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().help("More").accessibilityLabel("More for \(name)")
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(hovering ? Workspace.raised : .clear)
        .modifier(OpensOnActivate(action: action))
        .onHover { hovering = $0 }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(.isButton)
    }
}

extension FilmSummary {
    var isFinished: Bool { if case .finished = phase { true } else { false } }
}
