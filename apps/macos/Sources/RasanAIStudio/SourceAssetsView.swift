import AppKit
import SwiftUI

/// The film's source files: add, reveal, replace, remove. Shown as a sheet from the Film page.
struct FilesSheet: View {
    @Bindable var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var trashFile: URL?
    @State private var targeted = false
    private var locked: Bool { store.isImportingSources || store.runtime.isRunning || store.runtime.isPreparing }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Files").font(.system(size: 22, weight: .semibold))
                    Text("Copies live inside the film. Your originals are never changed.").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { chooseFiles() } label: { Label("Add…", systemImage: "plus") }.disabled(store.isImportingSources || store.selectedProjectURL == nil)
            }
            if store.projectSources.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "square.and.arrow.down").font(.system(size: 28, weight: .light)).foregroundStyle(.secondary)
                    Text("Drop footage, images or documents here").font(.system(size: 13)).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(store.projectSources, id: \.self) { file in
                            HStack(spacing: 10) {
                                Image(nsImage: NSWorkspace.shared.icon(forFile: file.path)).resizable().frame(width: 24, height: 24)
                                Text(file.lastPathComponent).lineLimit(1).truncationMode(.middle)
                                Spacer()
                                Button { NSWorkspace.shared.activateFileViewerSelecting([file]) } label: { Image(systemName: "magnifyingglass.circle") }
                                    .buttonStyle(.borderless).help("Show in Finder")
                                Menu {
                                    Button("Replace File…") { chooseFiles(replacing: file) }
                                    Button("Move Copy to Trash…", role: .destructive) { trashFile = file }
                                } label: { Image(systemName: "ellipsis.circle") }
                                    .menuStyle(.borderlessButton).frame(width: 26).disabled(locked)
                            }.padding(.horizontal, 12).padding(.vertical, 8)
                            Divider().padding(.leading, 46)
                        }
                    }
                }
            }
            if store.isImportingSources { ProgressView().controlSize(.small) }
            HStack { Spacer(); Button("Done") { dismiss() }.keyboardShortcut(.defaultAction) }
        }
        .padding(24).frame(width: 520, height: 420)
        .overlay { if targeted { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.rasan, style: StrokeStyle(lineWidth: 2, dash: [6])).padding(6) } }
        .dropDestination(for: URL.self, action: { urls, _ in store.importSources(urls.filter(\.isFileURL)) }, isTargeted: { targeted = $0 })
        .onAppear { store.reloadSources() }
        .confirmationDialog("Move this copy to Trash?", isPresented: Binding(get: { trashFile != nil }, set: { if !$0 { trashFile = nil } }), titleVisibility: .visible) {
            Button("Move to Trash", role: .destructive) { if let file = trashFile { store.trashSource(file) }; trashFile = nil }
        } message: { Text("The original is unchanged. The director may refer to this copy, so removing it can leave a missing reference.") }
    }
    private func chooseFiles(replacing file: URL? = nil) {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = file == nil
        panel.title = file == nil ? "Add files" : "Choose replacement"
        panel.message = file == nil ? "Files are copied into your film." : "Choose a file with the same extension. The old copy moves to Trash."
        if panel.runModal() == .OK { store.importSources(panel.urls, replacing: file) }
    }
}
