import AppKit
import SwiftUI
import StudioCore

struct ProjectLibraryView: View {
    @Bindable var store: StudioStore
    @State private var renameFolder: URL?
    @State private var renameName = ""
    @State private var trashFolder: URL?
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Project library · \(store.settings.projectRoot)").font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
            HStack {
                Button("New Film…") { store.newFilm() }.buttonStyle(.borderedProminent)
                Button("Open Run…") { store.openPanel() }
                Button("Sample") { store.loadSample() }
                SettingsLink { Image(systemName: "gearshape") }
                Spacer()
            }
            HStack {
                TextField("Search projects", text: $store.projectSearch).textFieldStyle(.roundedBorder)
                Picker("Sort", selection: $store.projectSort) {
                    Text("Recently opened").tag("recent"); Text("Name").tag("name"); Text("Date created").tag("created")
                }.frame(width: 195)
                Toggle("Archived", isOn: $store.showArchivedProjects).toggleStyle(.button)
            }
            if store.isLoadingProjects || store.isManagingProject { ProgressView("Updating library…").controlSize(.small) }
            if !store.isLoadingProjects && store.visibleProjects.isEmpty {
                ContentUnavailableView(store.projectSearch.isEmpty ? "No projects here yet" : "No matching projects", systemImage: "folder", description: Text("Create a film, adjust your search, or switch the Archived filter."))
            }
            ForEach(store.visibleProjects, id: \.0.id) { project, folder in
                HStack(spacing: 14) {
                    ProjectThumbnail(folder: folder, id: project.id).frame(width: 96, height: 58).clipShape(RoundedRectangle(cornerRadius: 6))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(project.name).font(.headline).lineLimit(1)
                        Text(project.archivedAt == nil ? "Opened \((project.lastOpenedAt ?? project.createdAt).formatted(date: .abbreviated, time: .omitted))" : "Archived").font(.caption).foregroundStyle(.secondary)
                        Text(folder.lastPathComponent).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 5)
                    Button("Open") { store.openProject(folder) }.disabled(store.runtime.isRunning || store.isManagingProject)
                    Menu {
                        Button("Edit Brief…") { store.filmDraftProject = folder; store.showNewProject = true }
                        Button("Rename…") { renameFolder = folder; renameName = project.name }
                        Button("Duplicate as Draft") { store.manageProject(folder, action: "duplicate") }
                        Button(project.archivedAt == nil ? "Archive" : "Unarchive") { store.manageProject(folder, action: project.archivedAt == nil ? "archive" : "unarchive") }
                        Divider()
                        Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([folder]) }
                        Button("Move to Trash…", role: .destructive) { trashFolder = folder }
                    } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).frame(width: 25)
                        .disabled(store.runtime.isRunning || store.runtime.isPreparing || store.isManagingProject)
                }.padding(14).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 8))
                    .dropDestination(for: URL.self) { urls, _ in store.importSources(urls.filter(\.isFileURL), into: folder) }
            }
            if !store.recentRuns.isEmpty {
                Text("Recent runs").font(.headline).padding(.top, 10)
                ForEach(store.recentRuns, id: \.self) { path in
                    Button { store.openRun(URL(fileURLWithPath: path)) } label: {
                        Label(URL(fileURLWithPath: path).lastPathComponent, systemImage: "film.stack").lineLimit(1)
                    }.disabled(store.runtime.isRunning)
                }
            }
        }
        .alert("Rename project", isPresented: Binding(get: { renameFolder != nil }, set: { if !$0 { renameFolder = nil } })) {
            TextField("Project name", text: $renameName)
            Button("Cancel", role: .cancel) { renameFolder = nil }
            Button("Rename") { if let folder = renameFolder { store.manageProject(folder, action: "rename", name: renameName) }; renameFolder = nil }
        } message: { Text("Changes the display name. The folder stays in place so existing films keep working.") }
        .confirmationDialog("Move this project and all its files to Trash?", isPresented: Binding(get: { trashFolder != nil }, set: { if !$0 { trashFolder = nil } }), titleVisibility: .visible) {
            Button("Move to Trash", role: .destructive) { if let folder = trashFolder { store.manageProject(folder, action: "trash") }; trashFolder = nil }
        } message: { Text("You can restore it from Finder's Trash. Nothing is permanently deleted.") }
    }
}

private struct ProjectThumbnail: View {
    let folder: URL
    let id: UUID
    @State private var image: NSImage?
    var body: some View {
        Group {
            if let image { Image(nsImage: image).resizable().scaledToFill() }
            else { Rectangle().fill(StudioPalette.raised).overlay { Image(systemName: "film").font(.title2).foregroundStyle(.secondary) } }
        }.clipped().task(id: id) {
            let data: Data? = await Task.detached {
                let current = folder.appendingPathComponent(".rasanai/current")
                guard let run = try? String(contentsOf: current, encoding: .utf8), run.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) != nil,
                      let data = try? Data(contentsOf: folder.appendingPathComponent(".rasanai/\(run)/session.json")),
                      let state = try? SessionSnapshot(data: data),
                      let path = state.scenes.first?.thumbnail,
                      let url = AssetResolver(run: folder.appendingPathComponent(".rasanai/\(run)"), workspace: folder).resolve(path),
                      let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size < 20_000_000 else { return nil }
                return try? Data(contentsOf: url)
            }.value
            image = data.flatMap(NSImage.init(data:))
        }
    }
}
