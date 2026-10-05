import AppKit
import StudioCore
import SwiftUI

struct HomeView: View {
    @Bindable var store: StudioStore
    @State private var renameFolder: URL?
    @State private var renameName = ""
    @State private var trashFolder: URL?

    private var films: [(LocalProject, URL)] { store.visibleProjects }
    private var hasAny: Bool { !store.localProjects.isEmpty }
    private var hasArchived: Bool { store.localProjects.contains { $0.0.archivedAt != nil } }
    private let columns = [GridItem(.adaptive(minimum: 220, maximum: 300), spacing: 18, alignment: .top)]

    var body: some View {
        ScrollView {
            VStack(spacing: 34) {
                greeting
                newFilmTile
                if !hasAny && !store.isLoadingProjects && store.settings.editorDraft(for: nil) == nil { examples }
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
                    "Brands keep your colours, type and logo so every film looks like you."])
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

    private var library: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(store.showArchivedProjects ? "Archived films" : "Your films").font(.system(size: 22, weight: .semibold))
            if films.isEmpty {
                Text(store.projectSearch.isEmpty ? "Nothing here yet." : "No films match your search.")
                    .font(.system(size: 13)).foregroundStyle(.secondary).padding(.vertical, 20)
            }
            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(films, id: \.0.id) { project, folder in
                    FilmCard(name: project.name, summary: store.summary(for: folder)) { open(folder) }
                        .contextMenu {
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
                        .dropDestination(for: URL.self) { urls, _ in store.importSources(urls.filter(\.isFileURL), into: folder) }
                }
            }
            if hasArchived || store.showArchivedProjects {
                Button(store.showArchivedProjects ? "Back to your films" : "Show archived") { store.showArchivedProjects.toggle() }
                    .buttonStyle(.link).font(.system(size: 12)).padding(.top, 6)
            }
        }
        .animation(.snappy, value: films.map(\.0.id))
    }

    private func open(_ folder: URL) {
        store.path = [.film(folder)]
    }
}

struct FilmCard: View {
    let name: String
    let summary: FilmSummary
    let action: () -> Void
    var body: some View {
        HoverCard(action: action) { _ in
            VStack(alignment: .leading, spacing: 0) {
                FilmThumbnail(name: name, poster: summary.poster)
                VStack(alignment: .leading, spacing: 5) {
                    Text(name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    HStack(spacing: 6) {
                        StatusDot(tone: summary.phase.tone, pulsing: summary.phase.isBusy)
                        Text(summary.phase.homeLine).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .accessibilityLabel("\(name), \(summary.phase.homeLine)")
    }
}
