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

struct HomeView: View {
    @Bindable var store: StudioStore
    /// nil is Home itself; a library mode lists every film, or the ones waiting on the person.
    var mode: LibraryMode? = nil
    @AppStorage("homeSort") private var sortRaw = HomeSort.recent.rawValue
    @AppStorage("homeLayout") private var layoutRaw = "grid"
    @State private var renameFolder: URL?
    @State private var renameName = ""
    @State private var trashFolder: URL?

    private var sort: HomeSort { HomeSort(rawValue: sortRaw) ?? .recent }
    private var asList: Bool { layoutRaw == "list" }
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
        store.visibleProjects.sorted { a, b in
            switch sort {
            case .recent: return stamp(a) > stamp(b)
            case .name: return a.0.name.localizedStandardCompare(b.0.name) == .orderedAscending
            case .status:
                let ra = rank(store.summary(for: a.1).phase), rb = rank(store.summary(for: b.1).phase)
                return ra == rb ? stamp(a) > stamp(b) : ra < rb
            }
        }
    }
    /// Films that are stopped until the person acts. Hidden while browsing the archive.
    private var needsYou: [(LocalProject, URL)] {
        store.showArchivedProjects ? [] : films.filter { store.summary(for: $0.1).phase.needsYou }
    }
    /// The film Home leads with: the first one waiting on the person, else the latest one still in the works.
    private var featured: (LocalProject, URL)? {
        needsYou.first ?? films.sorted { stamp($0) > stamp($1) }.first { !store.summary(for: $0.1).isFinished }
    }
    private var hasArchived: Bool { store.localProjects.contains { $0.0.archivedAt != nil } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                switch mode {
                case nil:
                    composer
                    if let featured { featuredSection(featured) }
                    if !films.isEmpty { filmsSection(title: "Recent films", items: Array(films.filter { $0.1 != featured?.1 }.prefix(6)), showAll: films.count > 7) }
                case .all?:
                    filmsSection(title: store.showArchivedProjects ? "Archived films" : "All films", items: films, showAll: false)
                    if hasArchived || store.showArchivedProjects {
                        Button(store.showArchivedProjects ? "Back to your films" : "Show archived") { store.showArchivedProjects.toggle() }
                            .buttonStyle(.link).font(.system(size: 12))
                    }
                case .needsReview?:
                    if needsYou.isEmpty {
                        ContentUnavailableView("Nothing needs you", systemImage: "checkmark.circle",
                                               description: Text("When a film is waiting for one of your calls, it shows up here."))
                            .frame(maxWidth: .infinity, minHeight: 320)
                    }
                    ForEach(needsYou, id: \.0.id) { project, folder in
                        FeaturedFilmCard(name: project.name, summary: store.summary(for: folder)) { open(folder) }
                            .contextMenu { menu(project, folder) }
                    }
                }
            }
            .padding(.horizontal, 32).padding(.top, 28).padding(.bottom, 40)
            .frame(maxWidth: 1240, alignment: .leading).frame(maxWidth: .infinity)
        }
        .scrollIndicators(.automatic)
        .background(Color.appBackground)
        .navigationTitle(mode?.title ?? "Home")
        .searchable(text: $store.projectSearch, placement: .toolbar, prompt: "Search films")
        .pageHeader(mode?.title ?? "Home") {
            Menu {
                Button("Check readiness…") { store.showPreflight() }
                Button("Import Project…") { store.importProjectPanel() }
            } label: { Label("More", systemImage: "ellipsis") }
                .menuIndicator(.hidden).tint(.primary)   // a toolbar tool, white like its neighbours, not the brand tint.help("More")
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
            Text("What shall we make?").font(.system(size: 30, weight: .bold)).tracking(-0.5)
            NewFilmView(store: store, project: nil, embedded: true)
            HStack(spacing: 14) {
                Button { store.newFilm() } label: { Label("More options", systemImage: "slider.horizontal.3") }
                    .buttonStyle(.link).font(.system(size: 12.5))
                    .help("Open the full editor: what you are making, footage folders, a reference video, templates")
                Button { store.path = [.inspire] } label: { Label("Get inspired", systemImage: "sparkles") }
                    .buttonStyle(.link).font(.system(size: 12.5))
                Spacer()
            }
        }
    }

    private func featuredSection(_ item: (LocalProject, URL)) -> some View {
        let waiting = needsYou.count
        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Pick up where you left off.").font(.system(size: 24, weight: .bold)).tracking(-0.4)
                Text(waiting == 0 ? "Your latest film is still in the works." : waiting == 1 ? "One film is waiting for your review." : "\(waiting) films are waiting for you.")
                    .font(.system(size: 15)).foregroundStyle(.secondary)
            }
            FeaturedFilmCard(name: item.0.name, summary: store.summary(for: item.1)) { open(item.1) }
                .contextMenu { menu(item.0, item.1) }
        }
    }

    private func filmsSection(title: String, items: [(LocalProject, URL)], showAll: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Text(title).font(.system(size: 20, weight: .bold)).tracking(-0.3)
                if showAll {
                    Button("All films") { store.path = [.library(.all)] }.buttonStyle(.link).font(.system(size: 12.5))
                }
                Spacer()
                FlatSegmented(selection: $layoutRaw, options: [("grid", "Grid", "square.grid.2x2"), ("list", "List", "list.bullet")])
                Menu {
                    Picker("Sort by", selection: $sortRaw) {
                        ForEach(HomeSort.allCases) { Label($0.title, systemImage: $0.symbol).tag($0.rawValue) }
                    }.pickerStyle(.inline)
                } label: {
                    HStack(spacing: 8) { Text(sort.title); Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold)) }
                        .font(.system(size: 12.5, weight: .medium)).padding(.horizontal, 12).frame(height: 34)
                        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.primary.opacity(0.14), lineWidth: 1) }
                        .contentShape(Rectangle())
                }
                .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Sort films")
            }
            if items.isEmpty {
                Text(store.projectSearch.isEmpty ? "Nothing here yet." : "No films match your search.")
                    .font(.system(size: 13)).foregroundStyle(.secondary).padding(.vertical, 20)
            } else if asList {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.0.id) { index, item in
                        if index > 0 { Divider() }
                        FilmListRow(name: item.0.name, summary: store.summary(for: item.1)) { open(item.1) } menu: { menu(item.0, item.1) }
                            .contextMenu { menu(item.0, item.1) }
                    }
                }
                .workspacePanel()
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 440), spacing: 16, alignment: .top)], spacing: 16) {
                    ForEach(items, id: \.0.id) { project, folder in
                        FilmTile(name: project.name, summary: store.summary(for: folder)) { open(folder) } menu: { menu(project, folder) }
                            .contextMenu { menu(project, folder) }
                            .dropDestination(for: URL.self) { urls, _ in store.importSources(urls.filter(\.isFileURL), into: folder) }
                    }
                }
            }
        }
        .animation(.snappy, value: items.map(\.0.id))
    }

    private func menu(_ project: LocalProject, _ folder: URL) -> some View {
        Group {
            Button("Open") { open(folder) }
            Button("Rename…") { renameFolder = folder; renameName = project.name }
            Button("Duplicate") { store.manageProject(folder, action: "duplicate") }
            Button("Check readiness…") { store.showPreflight(project: folder) }
            Button("Export Project…") { store.exportProject(folder) }
            Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([folder]) }
            Button(project.archivedAt == nil ? "Archive" : "Unarchive") { store.manageProject(folder, action: project.archivedAt == nil ? "archive" : "unarchive") }
            Divider()
            Button("Move to Trash…", role: .destructive) { trashFolder = folder }
        }
    }

    private func open(_ folder: URL) {
        store.path = [.film(folder)]
    }
}

// MARK: Film cards

/// A film's state as a tinted capsule: "Needs review", "Finished", "Draft"…
struct FilmStatusBadge: View {
    let phase: FilmPhase
    private var look: (String, String, Color) {
        switch phase {
        case .yourTurn: ("Needs review", "clock", Color(nsColor: .systemOrange))
        case .needsAttention: ("Needs attention", "exclamationmark.triangle", Color(nsColor: .systemRed))
        case .paused: ("Paused", "pause.circle", .secondary)
        case .finished: ("Finished", "checkmark.circle", Color(nsColor: .systemGreen))
        case .draft: ("Draft", "doc.text", Color(nsColor: .systemBlue))
        case .working, .starting: ("Director working", "sparkles", Color.rasan)
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

/// "45s · 16:9", and "Updated 12 min ago" on its own.
private func filmFacts(_ summary: FilmSummary) -> String {
    [summary.duration.flatMap { $0 > 0 ? "\($0)s" : nil }, summary.aspect].compactMap { $0 }.joined(separator: " · ")
}
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
struct FeaturedFilmCard: View {
    let name: String
    let summary: FilmSummary
    let action: () -> Void
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
        HStack(alignment: .center, spacing: 28) {
            PosterWithTime(name: name, summary: summary).frame(width: 380)
            VStack(alignment: .leading, spacing: 10) {
                Text(name).font(.system(size: 24, weight: .bold)).tracking(-0.3).lineLimit(2)
                FilmStatusBadge(phase: summary.phase)
                HStack(spacing: 8) {
                    if !filmFacts(summary).isEmpty { Text(filmFacts(summary)) }
                    if let updated = updatedLine(summary) { Text("·"); Text(updated) }
                }
                .font(.system(size: 13.5)).foregroundStyle(.secondary).monospacedDigit()
                if !reason.isEmpty { Text(reason).font(.system(size: 14.5)).fixedSize(horizontal: false, vertical: true).padding(.top, 4) }
            }
            Spacer(minLength: 12)
            Button(action: action) { Text(verb).padding(.horizontal, 10) }
                .buttonStyle(.rasanPrimary).controlSize(.large)
        }
        .padding(16)
        .workspacePanel()
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
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
        .overlay { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).strokeBorder(hovering ? Color.rasan.opacity(0.45) : Workspace.hairline, lineWidth: 1) }
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
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
                .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(hovering ? Workspace.raised : .clear)
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(.isButton)
    }
}

/// "30 s · Landscape · 2 h ago"
func filmDetailLine(_ summary: FilmSummary) -> String? {
    var parts: [String] = []
    if let duration = summary.duration, duration > 0 { parts.append("\(duration) s") }
    if let shape = aspectName(summary.aspect) { parts.append(shape) }
    if let date = summary.updatedAt {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        parts.append(abs(date.timeIntervalSinceNow) < 45 ? "just now" : formatter.localizedString(for: date, relativeTo: Date()))
    }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
}

extension FilmSummary {
    var isFinished: Bool { if case .finished = phase { true } else { false } }
}

struct FilmCard: View {
    let name: String
    let summary: FilmSummary
    let action: () -> Void
    var body: some View {
        HoverCard(action: action) { _ in
            VStack(alignment: .leading, spacing: 0) {
                FilmThumbnail(name: name, poster: summary.poster)
                VStack(alignment: .leading, spacing: 4) {
                    Text(name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    HStack(spacing: 6) {
                        StatusDot(tone: summary.phase.tone, pulsing: summary.phase.isBusy)
                        Text(summary.phase.homeLine).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                        Spacer(minLength: 4)
                        if summary.stage != nil || summary.isFinished { FilmStageDots(current: summary.stage, finished: summary.isFinished) }
                    }
                    if let line = filmDetailLine(summary) {
                        Text(line).font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(1)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .accessibilityLabel("\(name), \(summary.phase.homeLine)")
    }
}

/// One film that is waiting on the person: thumbnail, what it needs, and a clear way in.
struct NeedsYouRow: View {
    let name: String
    let summary: FilmSummary
    let action: () -> Void
    private var verb: String {
        switch summary.phase {
        case .yourTurn: "Review"
        case .paused: "Resume"
        default: "Open"
        }
    }
    private var reason: String {
        switch summary.phase {
        case .yourTurn(let what): "Waiting for you to \(what)"
        case .paused: "Paused. Your work is saved."
        default: "Needs attention. Open it to see why."
        }
    }
    var body: some View {
        HoverCard(action: action) { hovering in
            HStack(spacing: 14) {
                FilmThumbnail(name: name, poster: summary.poster)
                    .frame(width: 112)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5) }
                VStack(alignment: .leading, spacing: 5) {
                    Text(name).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                    HStack(spacing: 6) {
                        StatusDot(tone: summary.phase.tone)
                        Text(reason).font(.system(size: 12.5)).foregroundStyle(.secondary).lineLimit(1)
                    }
                    if let detail = summary.detail {
                        Text(detail).font(.system(size: 12, weight: .medium)).foregroundStyle(Color.rasan).lineLimit(1)
                    }
                    HStack(spacing: 8) {
                        if summary.stage != nil { FilmStageDots(current: summary.stage) }
                        if let line = filmDetailLine(summary) { Text(line).font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(1) }
                    }
                }
                Spacer(minLength: 12)
                // Quiet on purpose: the whole row is the button, and New film above stays the loudest thing on Home.
                HStack(spacing: 4) {
                    Text(verb)
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
                }
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.rasan)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Color.rasan.opacity(hovering ? 0.16 : 0.08), in: Capsule())
            }
            .padding(10).padding(.trailing, 6)
        }
        .accessibilityLabel("\(name), \(reason)")
        .accessibilityHint("\(verb) this film")
    }
}
