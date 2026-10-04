import AppKit
import SwiftUI

struct SourceAssetsView: View {
    @Bindable var store: StudioStore
    @State private var trashFile: URL?
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Project sources").font(.headline)
            if let project = store.selectedProjectURL {
                Text(project.lastPathComponent).font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button("Import Files…") { chooseFiles() }.disabled(store.isImportingSources)
                    Button("Show Sources in Finder") { NSWorkspace.shared.open(project.appendingPathComponent("assets/sources")) }
                }
                Text("Drop reference files here. Copies stay in assets/sources; originals are never changed. To use newly imported references in an existing run, tell the director in your next message.").font(.caption).foregroundStyle(.secondary)
                if store.isImportingSources { ProgressView("Copying source files…") }
                if store.projectSources.isEmpty && !store.isImportingSources {
                    ContentUnavailableView("Drop your source files", systemImage: "square.and.arrow.down", description: Text("Images, footage, audio and documents can all be reference material."))
                }
                ForEach(store.projectSources, id: \.self) { file in
                    HStack {
                        Image(systemName: "doc")
                        VStack(alignment: .leading) {
                            Text(file.lastPathComponent).lineLimit(1)
                            Text(file.pathExtension.uppercased()).font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Reveal") { NSWorkspace.shared.activateFileViewerSelecting([file]) }
                        Menu {
                            Button("Replace File…") { chooseFiles(replacing: file) }
                            Button("Move Copy to Trash…", role: .destructive) { trashFile = file }
                        } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).frame(width: 25)
                            .disabled(store.isImportingSources || store.runtime.isRunning || store.runtime.isPreparing)
                    }.padding(12).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 6))
                }
            } else {
                ContentUnavailableView("Choose a library project", systemImage: "folder", description: Text("Create or open a project from Projects to import sources. Samples and external runs are left untouched."))
                Button("Go to Projects") { store.section = .projects }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(StudioPalette.raised).clipShape(RoundedRectangle(cornerRadius: 8))
        .dropDestination(for: URL.self) { urls, _ in store.importSources(urls.filter(\.isFileURL)) }
        .onAppear { store.reloadSources() }
        .confirmationDialog("Move this project copy to Trash?", isPresented: Binding(get: { trashFile != nil }, set: { if !$0 { trashFile = nil } }), titleVisibility: .visible) {
            Button("Move to Trash", role: .destructive) { if let file = trashFile { store.trashSource(file) }; trashFile = nil }
        } message: { Text("The original file is unchanged. The director may refer to this copy, so removing it can leave a missing reference.") }
    }
    private func chooseFiles(replacing file: URL? = nil) {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = file == nil
        panel.title = file == nil ? "Import project sources" : "Choose replacement source"
        panel.message = file == nil ? "Files are copied into your project." : "Choose a file with the same extension. The existing filename is preserved, and the old copy moves to Trash after replacement."
        if panel.runModal() == .OK { store.importSources(panel.urls, replacing: file) }
    }
}
