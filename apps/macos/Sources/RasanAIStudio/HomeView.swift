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
    /// The prompt and the same film cards remain mounted through the whole reveal.
    @State private var browsing = false
    @State private var gate = HomeScrollGate()

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
    private var workspaceFilms: [(LocalProject, URL)] {
        Array(films.sorted { a, b in
            let first = HomeWorkspaceRules.priority(store.summary(for: a.1).phase)
            let second = HomeWorkspaceRules.priority(store.summary(for: b.1).phase)
            return first == second ? stamp(a) > stamp(b) : first < second
        }.prefix(6))
    }

    var body: some View {
        Group {
            if mode == nil { homePage } else { libraryPage }
        }
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

    /// One persistent workspace rises through a stationary soft viewport mask. No material rectangle expands, no poster
    /// changes parents or turns into a different card. The prompt remains mounted so its draft and selection survive.
    private var homePage: some View {
        let hasFilms = !workspaceFilms.isEmpty
        let showFilms = browsing && hasFilms
        return GeometryReader { viewport in
            let metrics = HomeTransitionMetrics(browsing: showFilms, reduceMotion: reduceMotion, viewportHeight: viewport.size.height, viewportWidth: viewport.size.width)
            ZStack {
                promptLayer(metrics, height: viewport.size.height)
                if hasFilms {
                    filmsLayer(metrics, height: viewport.size.height)
                        .zIndex(1)
                    HomePeekOpener(expanded: showFilms) { setBrowsing(true) }
                        .zIndex(2)
                }
            }
            .frame(width: viewport.size.width, height: viewport.size.height)
            .clipped()
            .animation(HomeTransitionMetrics.travel(reduceMotion: reduceMotion), value: showFilms)
        }
        .background(HomeScrollMonitor(gate: gate))
        .onAppear { syncGate(hasFilms: hasFilms) }
        .onChange(of: hasFilms) { _, now in syncGate(hasFilms: now); if !now { browsing = false } }
        .onChange(of: browsing) { _, _ in syncGate(hasFilms: hasFilms) }
        .onDisappear {
            gate.enabled = false
            gate.onTrigger = { _ in }
            gate.filmsScroll = nil
        }
    }

    private func syncGate(hasFilms: Bool) {
        gate.enabled = hasFilms
        gate.browsing = browsing && hasFilms
        gate.onTrigger = { direction in setBrowsing(direction == .towardFilms) }
    }

    /// Opening the films first takes the keyboard away from the (hidden, still mounted) prompt, so nothing types into it.
    private func setBrowsing(_ value: Bool) {
        guard value != browsing else { return }
        if value {
            guard !workspaceFilms.isEmpty else { return }
            NSApp.keyWindow?.makeFirstResponder(nil)
        }
        browsing = value
    }

    private func promptLayer(_ metrics: HomeTransitionMetrics, height: CGFloat) -> some View {
        // Scrolls only when the brief outgrows a short window; otherwise it is a fixed, centered page.
        ScrollView {
            VStack(spacing: 0) {
                Spacer(minLength: 24)
                composer
                Spacer(minLength: 24)
            }
            .padding(.horizontal, Self.columnInset)
            // Keep the prompt's position steady while the library loads, including an initially empty library.
            .padding(.bottom, HomeTransitionMetrics.promptClearance)
            .frame(maxWidth: Self.columnWidth + 2 * Self.columnInset, minHeight: height)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .opacity(metrics.promptOpacity).animation(HomeTransitionMetrics.promptFade, value: metrics.browsing)
        .offset(y: metrics.promptOffset)
        .allowsHitTesting(!metrics.browsing).accessibilityHidden(metrics.browsing).disabled(metrics.browsing)
    }

    private func filmsLayer(_ metrics: HomeTransitionMetrics, height: CGFloat) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HomeTransitionMetrics.workspaceGap) {
                workspaceHeader
                    .frame(height: HomeTransitionMetrics.workspaceHeaderHeight, alignment: .top)
                    .modifier(HomeWorkspaceChrome(expanded: metrics.browsing))
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16, alignment: .top), count: 3), alignment: .center, spacing: 20) {
                    ForEach(workspaceFilms, id: \.1) { project, folder in
                        let summary = store.summary(for: folder)
                        HomeWorkspaceCard(name: project.name, summary: summary, expanded: metrics.browsing) {
                            if case .queued = summary.phase { store.path = [.queue] } else { open(folder) }
                        }
                        .contextMenu { menu(project, folder) }
                        .onDeleteCommand { trashFolder = folder }
                    }
                }
            }
            .padding(.horizontal, Self.columnInset).padding(.top, HomeTransitionMetrics.workspaceTopPadding).padding(.bottom, 100)
            .frame(maxWidth: Self.columnWidth + 2 * Self.columnInset, minHeight: height, alignment: .top)
            .frame(maxWidth: .infinity)
            .background(HomeFilmsScrollProbe(gate: gate))
        }
        .scrollIndicators(.automatic)
        .scrollClipDisabled()
        .frame(height: height)
        .offset(y: metrics.workspaceOffset)
        .opacity(metrics.workspaceOpacity)
        .mask { HomeViewportFade() }
        .overlay(alignment: .top) {
            HomeReturnButton { setBrowsing(false) }.padding(.top, 12)
                .modifier(HomeWorkspaceChrome(expanded: metrics.browsing))
        }
        .allowsHitTesting(metrics.browsing).accessibilityHidden(!metrics.browsing).disabled(!metrics.browsing)
    }

    private var workspaceHeader: some View {
        let decisions = films.filter { store.summary(for: $0.1).phase.callsForYou }.count
        return HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Pick up where you left off").font(.system(size: 25, weight: .semibold)).tracking(-0.5)
                    .accessibilityAddTraits(.isHeader)
                Text(decisions > 0 ? (decisions == 1 ? "One film needs your attention." : "\(decisions) films need your attention.") : "Continue a brief, follow progress, or watch your latest work.")
                    .font(.system(size: 13)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Button("All films") { store.path = [.library(.all)] }
                .buttonStyle(.rasanSecondary).controlSize(.small)
        }
    }

    /// Library pages keep their wide layout.
    private var libraryPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                if store.isLoadingProjects {
                    PageLoadingView(title: mode?.title ?? "films", gallery: true)
                } else {
                    switch mode {
                    case nil:
                        EmptyView()
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
            }
            .pageColumn()
        }
        .scrollIndicators(.automatic)
    }

    // Home geometry: one 720pt reading column with 32pt gutters for every section.
    private static let columnWidth = HomeTransitionMetrics.columnWidth, columnInset = HomeTransitionMetrics.columnInset
    private static let bottomGap: CGFloat = 40

    // MARK: Sections

    /// Home starts with a brief; Continue carries the shared draft into a focused setup review.
    private var composer: some View {
        VStack(spacing: 28) {
            VStack(spacing: 8) {
                Text("What would you like to make?").font(.system(size: 28, weight: .regular)).tracking(-0.4).multilineTextAlignment(.center).accessibilityAddTraits(.isHeader)
                Text("An idea, a link, or a few words is enough.").font(.system(size: 14)).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            VStack(spacing: -34) {
                // The crew sit on the prompt's rim and watch the pointer, then the caret while you type. Decorative: clicks
                // and keyboard focus belong to the editor.
                // they stand on the rim: only the soles of their feet tuck behind the box
                HomeCrewLineup(isAway: browsing)
                    .frame(width: 560, height: 131, alignment: .bottom)
                    .padding(.bottom, 26)
                    .frame(maxWidth: .infinity)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                NewFilmView(store: store, project: nil, embedded: true)
            }
        }
        .frame(maxWidth: .infinity)
    }

    /// A film list with its own view and sort controls. A page that already has a title passes none.
    private func filmsSection(title: String?, items: [(LocalProject, URL)], showAll: Bool, home: Bool = false, hero: HomeHero? = nil) -> some View {
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
            .modifier(HomeReveal(hero: hero))
            if items.isEmpty {
                emptyState.frame(maxWidth: .infinity, minHeight: 320)
            } else if asList {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.0.id) { index, item in
                        if index > 0 { Divider().modifier(HomeReveal(hero: hero)) }
                        FilmListRow(name: item.0.name, summary: store.summary(for: item.1), compact: home, hero: hero, posterID: item.1) { open(item.1) } menu: { menu(item.0, item.1) }
                            .contextMenu { menu(item.0, item.1) }
                            .onDeleteCommand { trashFolder = item.1 }
                    }
                }
                .background { Rectangle().fill(.clear).workspacePanel().modifier(HomeReveal(hero: hero)) }
                .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: home ? 220 : 440), spacing: 16, alignment: .top)], spacing: 16) {
                    ForEach(items, id: \.0.id) { project, folder in
                        FilmTile(name: project.name, summary: store.summary(for: folder), stacked: home, hero: hero, posterID: folder) { open(folder) } menu: { menu(project, folder) }
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
func updatedLine(_ summary: FilmSummary) -> String? {
    guard let date = summary.updatedAt else { return nil }
    let formatter = RelativeDateTimeFormatter(); formatter.unitsStyle = .full
    return abs(date.timeIntervalSinceNow) < 45 ? "Updated just now" : "Updated " + formatter.localizedString(for: date, relativeTo: Date())
}

/// A poster with its running time in the corner.
private struct PosterWithTime: View {
    let name: String
    let summary: FilmSummary
    var hero: HomeHero? = nil
    var body: some View {
        FilmThumbnail(name: name, poster: summary.poster)
            .overlay(alignment: .bottomTrailing) {
                if let duration = summary.duration, duration > 0 {
                    Text(clockText(Double(duration))).font(.system(size: 12, weight: .semibold)).monospacedDigit().foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 3).background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                        .padding(8)
                        .modifier(HomeReveal(hero: hero))
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

/// Home's lead card: a big poster, the film's state and why it is waiting, and one clear way in.
struct FeaturedFilmCard<Menu: View>: View {
    let name: String
    let summary: FilmSummary
    /// Home passes a narrower poster so the card fits its reading column.
    var posterWidth: CGFloat = 320
    /// Home's reveal: matches the poster with the preview's and holds the card's chrome back until it lands.
    var hero: HomeHero? = nil
    var posterID: URL? = nil
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
            PosterWithTime(name: name, summary: summary, hero: hero).frame(width: posterWidth).matchedPoster(posterID, hero: hero)
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
            .modifier(HomeReveal(hero: hero))
        }
        .padding(12)
        .background { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).fill(hovering ? Workspace.raised : Workspace.panel).modifier(HomeReveal(hero: hero)) }
        .overlay { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).strokeBorder(hovering ? Color.primary.opacity(0.22) : Workspace.hairline, lineWidth: 1).modifier(HomeReveal(hero: hero)) }
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
    /// Home's narrow columns stack the poster over the details; the library keeps the poster beside them.
    var stacked = false
    var hero: HomeHero? = nil
    var posterID: URL? = nil
    let action: () -> Void
    @ViewBuilder var menu: () -> Menu
    @State private var hovering = false

    private var moreMenu: some View {
        SwiftUI.Menu { menu() } label: { Image(systemName: "ellipsis").font(.system(size: 14, weight: .semibold)).frame(width: 24, height: 20) }
            .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().help("More")
    }
    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Text(name).font(.system(size: 16, weight: .semibold)).lineLimit(2)
                Spacer(minLength: 6)
                moreMenu
            }
            FilmStatusBadge(phase: summary.phase)
            if !filmFacts(summary).isEmpty { Text(filmFacts(summary)).font(.system(size: 13)).foregroundStyle(.secondary).monospacedDigit() }
            if let updated = updatedLine(summary) { Text(updated).font(.system(size: 13)).foregroundStyle(.secondary) }
        }
    }
    @ViewBuilder private var content: some View {
        if stacked {
            VStack(alignment: .leading, spacing: 12) {
                PosterWithTime(name: name, summary: summary, hero: hero).matchedPoster(posterID, hero: hero)
                details.modifier(HomeReveal(hero: hero))
            }
        } else {
            HStack(alignment: .top, spacing: 18) {
                PosterWithTime(name: name, summary: summary, hero: hero).frame(width: 220).matchedPoster(posterID, hero: hero)
                details.modifier(HomeReveal(hero: hero))
            }
        }
    }
    var body: some View {
        content
        .padding(12)
        .background { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).fill(hovering ? Workspace.raised : Workspace.panel).modifier(HomeReveal(hero: hero)) }
        .overlay { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).strokeBorder(hovering ? Color.primary.opacity(0.22) : Workspace.hairline, lineWidth: 1).modifier(HomeReveal(hero: hero)) }
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
    /// Home's reading column drops the facts and update time to fit.
    var compact = false
    var hero: HomeHero? = nil
    var posterID: URL? = nil
    let action: () -> Void
    @ViewBuilder var menu: () -> Menu
    @State private var hovering = false
    var body: some View {
        HStack(spacing: 14) {
            PosterWithTime(name: name, summary: summary, hero: hero).frame(width: 112).matchedPoster(posterID, hero: hero)
            Group {
                Text(name).font(.system(size: 14, weight: .semibold)).lineLimit(1).frame(minWidth: compact ? 0 : 160, alignment: .leading)
                if !compact { FilmStatusBadge(phase: summary.phase) }
                Spacer(minLength: 8)
                if compact { FilmStatusBadge(phase: summary.phase) }
                else {
                    Text(filmFacts(summary)).font(.system(size: 12.5)).foregroundStyle(.secondary).monospacedDigit()
                    Text(updatedLine(summary) ?? "").font(.system(size: 12.5)).foregroundStyle(.secondary).frame(width: 170, alignment: .trailing)
                }
                SwiftUI.Menu { menu() } label: { Image(systemName: "ellipsis").frame(width: 24, height: 20) }
                    .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().help("More").accessibilityLabel("More for \(name)")
            }
            .modifier(HomeReveal(hero: hero))
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
