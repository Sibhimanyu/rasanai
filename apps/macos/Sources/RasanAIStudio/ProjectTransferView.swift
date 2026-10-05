import AppKit
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static let rasanaiProject = UTType(exportedAs: "com.rasanai.studio.project", conformingTo: .package)
}

enum ProjectTransferRequest: Sendable {
    case export(URL), importPackage(URL)
    var isImport: Bool { if case .importPackage = self { return true }; return false }
    var url: URL { switch self { case .export(let url), .importPackage(let url): url } }
}

extension StudioStore {
    func exportProject(_ project: URL) {
        guard !isTransferringProject, !isSavingFilm, !isImportingSources, !isManagingProject, !queueStarting,
              !((runtime.isRunning || runtime.isPreparing || runtime.isFinishing) && activeDirectorProject == project) else {
            errorMessage = "Pause this film and wait for file operations to finish before packaging it."; return
        }
        projectTransfer = .export(project)
        transferResult = nil; transferProgress = nil; transferError = nil
        sheet = .projectTransfer
    }
    func importProjectPanel() {
        guard !isTransferringProject else { return }
        let panel = NSOpenPanel()
        panel.title = "Import a film project"
        panel.message = "Choose a .rasanaiproject package. A new copy is added to your library."
        panel.allowedContentTypes = [.rasanaiProject]
        panel.canChooseFiles = true; panel.canChooseDirectories = true; panel.treatsFilePackagesAsDirectories = false
        if panel.runModal() == .OK, let url = panel.url { importProjectPackage(url) }
    }
    func importProjectPackage(_ url: URL) {
        guard !isTransferringProject, !isSavingFilm else { errorMessage = "Wait for the current file operation to finish before importing."; return }
        projectTransfer = .importPackage(url)
        transferResult = nil; transferProgress = nil; transferError = nil
        sheet = .projectTransfer
    }
    func startProjectTransfer(name: String, destination: URL?) {
        guard let request = projectTransfer, !isTransferringProject, !queueStarting, !queueHandlingExit,
              !isSavingFilm, !isImportingSources, !isManagingProject else { transferError = "Wait for file operations to finish."; return }
        if !request.isImport, (runtime.isRunning || runtime.isPreparing || runtime.isFinishing) && activeDirectorProject == request.url {
            transferError = "Pause this film before exporting its project."; return
        }
        if !request.isImport && destination == nil { return }
        isTransferringProject = true
        transferError = nil; transferResult = nil; transferProgress = nil
        let operation = UUID(); transferOperation = operation
        let library = request.isImport ? settings.library : projectLibrary(for: request.url)
        let report: @Sendable (ProjectTransferProgress) -> Void = { [weak self] value in
            Task { @MainActor in
                guard let self, self.transferOperation == operation, self.isTransferringProject else { return }
                self.transferProgress = value
            }
        }
        let worker = Task.detached { () throws -> URL in
            if request.isImport { return try PortableProject.importPackage(request.url, library: library, name: name, progress: report) }
            guard let destination else { throw PortableProject.TransferError.invalidDestination }
            try PortableProject.export(request.url, library: library, to: destination, progress: report)
            return destination
        }
        transferTask = Task {
            defer { isTransferringProject = false; transferTask = nil }
            do {
                let result = try await withTaskCancellationHandler(operation: { try await worker.value }, onCancel: { worker.cancel() })
                transferResult = result
                statusMessage = request.isImport ? "Project imported into your library" : "Portable project saved"
                if request.isImport { reloadProjects() }
            } catch is CancellationError { transferError = "Transfer cancelled. Your original project and package are kept." }
            catch { transferError = error.localizedDescription }
        }
    }
}

struct ProjectTransferView: View {
    @Bindable var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var summary: ProjectPackageSummary?
    @State private var name = ""
    @State private var loading = true
    private var request: ProjectTransferRequest? { store.projectTransfer }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text(request?.isImport == true ? "Import film project" : "Export film project").font(.system(size: 23, weight: .semibold))
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.cancelAction).disabled(store.isTransferringProject)
            }
            Text(request?.isImport == true
                 ? "Add a new film to your library. Your existing films are kept. Review it first, then resume with your own director account."
                 : "Save a portable package with source files, compositions, renders and saved review state. Copy it to another Mac and choose Import Project there.")
                .font(.system(size: 13)).foregroundStyle(.secondary)
            if loading { ProgressView().controlSize(.small) }
            if let summary {
                Label(summary.name, systemImage: "film").font(.headline)
                Text("\(summary.files) files · \(ByteCountFormatter.string(fromByteCount: summary.bytes, countStyle: .file))")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                if request?.isImport == true {
                    TextField("Film name", text: $name).textFieldStyle(.roundedBorder).disabled(store.isTransferringProject || store.transferResult != nil)
                    Text("Destination: \(store.settings.projectRoot)").font(.system(size: 11)).foregroundStyle(.secondary).textSelection(.enabled)
                }
            }
            Text("Local connection tokens, director launch jobs/logs, action queues, hidden configuration and dependency caches are excluded. Files referenced outside the project must be attached before export.")
                .font(.system(size: 12)).foregroundStyle(.secondary)
            if store.isTransferringProject {
                ProgressView(value: store.transferProgress?.fraction ?? 0)
                Text(store.transferProgress?.file ?? "Preparing files…").font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
            }
            if let error = store.transferError { Text(error).font(.system(size: 12)).foregroundStyle(.red).textSelection(.enabled) }
            if let result = store.transferResult {
                Label(request?.isImport == true ? "Film imported" : "Package saved", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                Text(result.path).font(.system(size: 11)).foregroundStyle(.secondary).textSelection(.enabled)
                HStack {
                    Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([result]) }
                    if request?.isImport == true { Button("Open film") { dismiss(); store.showFilm(result) } }
                }
            }
            Spacer(minLength: 0)
            HStack {
                Spacer()
                if store.isTransferringProject {
                    Button("Cancel transfer", role: .destructive) { store.transferTask?.cancel() }
                } else if store.transferResult == nil {
                    Button(request?.isImport == true ? "Import film" : "Save package…") { begin() }
                        .buttonStyle(.borderedProminent).disabled(loading || summary == nil || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }.padding(24).frame(width: 620, height: 440).interactiveDismissDisabled(store.isTransferringProject)
            .task(id: request?.url) {
                loading = true; summary = nil
                guard let request else { loading = false; return }
                let library = store.projectLibrary(for: request.url)
                do {
                    let info = try await Task.detached {
                        if request.isImport { return try PortableProject.inspectPackage(request.url) }
                        return try PortableProject.inspectProject(request.url, library: library)
                    }.value
                    guard !Task.isCancelled else { return }
                    summary = info; name = info.name
                    if request.isImport {
                        var suffix = 1
                        while FileManager.default.fileExists(atPath: URL(fileURLWithPath: store.settings.projectRoot).appendingPathComponent(name).path), suffix < 100 {
                            name = String(info.name.prefix(80)) + " Imported" + (suffix == 1 ? "" : " \(suffix)")
                            suffix += 1
                        }
                    }
                } catch { store.transferError = error.localizedDescription }
                loading = false
            }
    }
    private func begin() {
        if request?.isImport == true { store.startProjectTransfer(name: name, destination: nil); return }
        let panel = NSSavePanel()
        panel.title = "Save portable film project"
        panel.allowedContentTypes = [.rasanaiProject]
        panel.nameFieldStringValue = name + ".rasanaiproject"
        panel.message = "Save outside the project folder. Choose a new filename to keep an existing package."
        if panel.runModal() == .OK { store.startProjectTransfer(name: name, destination: panel.url) }
    }
}
