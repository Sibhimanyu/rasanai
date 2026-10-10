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
    @AppStorage("homeSort") private var sortRaw = HomeSort.recent.rawValue
    @State private var renameFolder: URL?
    @State private var renameName = ""
    @State private var trashFolder: URL?

    private var sort: HomeSort { HomeSort(rawValue: sortRaw) ?? .recent }
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
    private var gridFilms: [(LocalProject, URL)] {
        store.showArchivedProjects ? films : films.filter { !store.summary(for: $0.1).phase.needsYou }
    }
    private var hasAny: Bool { !store.localProjects.isEmpty }
    private var hasArchived: Bool { store.localProjects.contains { $0.0.archivedAt != nil } }
    private let columns = [GridItem(.adaptive(minimum: 220, maximum: 300), spacing: 18, alignment: .top)]

    var body: some View {
        ScrollView {
            VStack(spacing: 34) {
                greeting
                newFilmTile
                if !hasAny && !store.isLoadingProjects && store.settings.editorDraft(for: nil) == nil { examples }
                GetInspiredHomeSection(store: store)
                if !needsYou.isEmpty { needsYouSection }
                if hasAny { library }
            }
            .padding(.horizontal, 32).padding(.top, 28).padding(.bottom, 40)
            .frame(maxWidth: 980).frame(maxWidth: .infinity)
        }
        .scrollIndicators(.automatic)
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle("RasanAI")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                if store.localProjects.count >= 6 {
                    HStack(spacing: 5) {
                        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                        TextField("Search", text: $store.projectSearch).textFieldStyle(.plain).frame(width: 130)
                    }
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color(nsColor: .quaternaryLabelColor).opacity(0.5), in: Capsule())
                }
                Button { store.path.append(.queue) } label: { Label("Queue" + (store.settings.filmQueue.isEmpty ? "" : " (\(store.settings.filmQueue.count))"), systemImage: "list.number") }
                Button { store.path.append(.templates) } label: { Label("Templates", systemImage: "doc.on.doc") }
                Button { store.openBrands() } label: { Label("Brands", systemImage: "swatchpalette").labelStyle(.titleAndIcon) }
                    .help("Your colours, type and logos")
                Menu {
                    Button("Check readiness…") { store.showPreflight() }
                    Button("Import Project…") { store.importProjectPanel() }
                } label: { Image(systemName: "ellipsis.circle") }
                HelpButton(title: "Home", lines: [
                    "Start a new film with the big button, or open one of your films below.",
                    "Right-click a film to rename, duplicate, archive or delete it.",
                    "Brands keep your colours, type and logo so every film looks like you.",
                    "Get inspired shows real motion from real launch films. Pick a few and they come with you into a new film."])
            }
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

    private var greeting: some View {
        VStack(spacing: 14) {
            RasanMark().fill(Color.rasanInk).frame(width: 30, height: 37)
            Text("What shall we make today?")
                .font(.system(size: 34, weight: .semibold, design: .rounded)).multilineTextAlignment(.center)
            Text(hasAny ? "Pick up a film, or start a new one." : "Tell RasanAI what you have in mind. It handles the rest.")
                .font(.system(size: 14)).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity)
    }

    private var newFilmTile: some View {
        HoverCard { store.newFilm() } content: { hovering in
            HStack(spacing: 18) {
                ZStack {
                    Circle().fill(Color.rasan.opacity(hovering ? 0.22 : 0.14))
                    Image(systemName: "plus").font(.system(size: 22, weight: .medium)).foregroundStyle(Color.rasan)
                }.frame(width: 56, height: 56)
                VStack(alignment: .leading, spacing: 4) {
                    Text(store.settings.editorDraft(for: nil) == nil ? "New film" : "Continue draft").font(.system(size: 18, weight: .semibold))
                    Text(store.settings.editorDraft(for: nil) == nil ? "Describe it, add footage if you have some, and RasanAI directs it." : "Your unfinished brief and selected files are saved. Pick up where you left off.")
                        .font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.right").foregroundStyle(Color.rasan).opacity(hovering ? 1 : 0.5)
            }
            .padding(.horizontal, 24).padding(.vertical, 22).frame(maxWidth: 640, alignment: .leading)
        }
        .frame(maxWidth: 640)
        .keyboardShortcut("n", modifiers: .command)
    }

    private var examples: some View {
        HStack(spacing: 10) {
            ForEach(["A 30-second launch film for my app", "A reel from my trip footage"], id: \.self) { text in
                Button { store.newFilm(prefill: text) } label: {
                    Text(text).font(.system(size: 12)).padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.45), in: Capsule())
                }.buttonStyle(.plain)
            }
        }
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

    private var needsYouSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("Needs you").font(.system(size: 22, weight: .semibold))
                Text("\(needsYou.count)").font(.system(size: 12, weight: .semibold, design: .rounded)).monospacedDigit()
                    .foregroundStyle(Color(nsColor: .systemOrange)).padding(.horizontal, 8).padding(.vertical, 2)
                    .background(Color(nsColor: .systemOrange).opacity(0.16), in: Capsule())
                Spacer()
            }
            VStack(spacing: 10) {
                ForEach(needsYou, id: \.0.id) { project, folder in
                    NeedsYouRow(name: project.name, summary: store.summary(for: folder)) { open(folder) }
                        .contextMenu { menu(project, folder) }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
        .animation(.snappy, value: needsYou.map(\.0.id))
    }

    private var library: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                if !(gridFilms.isEmpty && !needsYou.isEmpty) {
                    Text(store.showArchivedProjects ? "Archived films" : needsYou.isEmpty ? "Your films" : "Other films").font(.system(size: 22, weight: .semibold))
                }
                Spacer()
                Menu {
                    Picker("Sort by", selection: $sortRaw) {
                        ForEach(HomeSort.allCases) { Label($0.title, systemImage: $0.symbol).tag($0.rawValue) }
                    }.pickerStyle(.inline)
                } label: {
                    Label(sort.title, systemImage: "arrow.up.arrow.down").font(.system(size: 12)).labelStyle(.titleAndIcon)
                }
                .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                .help("Sort films")
            }
            if films.isEmpty {
                Text(store.projectSearch.isEmpty ? "Nothing here yet." : "No films match your search.")
                    .font(.system(size: 13)).foregroundStyle(.secondary).padding(.vertical, 20)
            }
            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(gridFilms, id: \.0.id) { project, folder in
                    FilmCard(name: project.name, summary: store.summary(for: folder)) { open(folder) }
                        .contextMenu { menu(project, folder) }
                        .dropDestination(for: URL.self) { urls, _ in store.importSources(urls.filter(\.isFileURL), into: folder) }
                }
            }
            if hasArchived || store.showArchivedProjects {
                Button(store.showArchivedProjects ? "Back to your films" : "Show archived") { store.showArchivedProjects.toggle() }
                    .buttonStyle(.link).font(.system(size: 12)).padding(.top, 6)
            }
        }
        .animation(.snappy, value: gridFilms.map(\.0.id))
    }

    private func open(_ folder: URL) {
        store.path = [.film(folder)]
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
                    HStack(spacing: 8) {
                        if summary.stage != nil { FilmStageDots(current: summary.stage) }
                        if let line = filmDetailLine(summary) { Text(line).font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(1) }
                    }
                }
                Spacer(minLength: 12)
                Text(verb)
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(nsColor: .windowBackgroundColor))
                    .padding(.horizontal, 16).padding(.vertical, 6)
                    .background(Color.rasan.opacity(hovering ? 1 : 0.92), in: Capsule())
            }
            .padding(10).padding(.trailing, 6)
        }
        .accessibilityLabel("\(name), \(reason)")
        .accessibilityHint("\(verb) this film")
    }
}
