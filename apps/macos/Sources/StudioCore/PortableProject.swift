import Foundation
import Darwin

public struct ProjectPackageSummary: Sendable {
    public let name: String
    public let files: Int
    public let bytes: Int64
}

public struct ProjectTransferProgress: Sendable {
    public let completedBytes: Int64
    public let totalBytes: Int64
    public let file: String
    public var fraction: Double { totalBytes > 0 ? min(1, Double(completedBytes) / Double(totalBytes)) : 0 }
}

/// A Finder package is a directory with a manifest and project payload. Import never executes it.
public enum PortableProject {
    public static let fileExtension = "rasanaiproject"
    private static let rootMarker = "__RASANAI_PROJECT_ROOT__"
    private struct Manifest: Codable {
        let version: Int
        let name: String
        let exportedAt: Date
    }
    private struct Entry {
        let relative: String
        let source: URL
        let bytes: Int64
    }
    private static let privateNames: Set<String> = [
        "address.json", "console.json", "actions.jsonl", "consumed.json", "director-job.json", "director.log",
        "node_modules", "dist-build", "__pycache__", "credentials.json", "auth.json"
    ]
    private static let textExtensions: Set<String> = ["json", "html", "htm", "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "md", "txt", "svg"]

    public static func inspectProject(_ project: URL, library: ProjectLibrary) throws -> ProjectPackageSummary {
        let manifest = try library.read(project)
        let entries = try collect(project)
        return ProjectPackageSummary(name: manifest.name, files: entries.count, bytes: entries.reduce(0) { $0 + $1.bytes })
    }
    public static func inspectPackage(_ package: URL) throws -> ProjectPackageSummary {
        let manifest = try readManifest(package)
        let payload = package.appendingPathComponent("Project", isDirectory: true)
        _ = try ProjectLibrary(root: package).read(payload)
        let entries = try collect(payload)
        try validateRun(payload)
        return ProjectPackageSummary(name: manifest.name, files: entries.count, bytes: entries.reduce(0) { $0 + $1.bytes })
    }
    public static func export(_ project: URL, library: ProjectLibrary, to destination: URL,
                              progress: @Sendable (ProjectTransferProgress) -> Void) throws {
        let fm = FileManager.default
        let manifest = try library.read(project)
        let entries = try collect(project)
        try validateRun(project)
        let target = destination.standardizedFileURL
        let source = project.resolvingSymlinksInPath().standardizedFileURL
        let realTarget = target.deletingLastPathComponent().resolvingSymlinksInPath().appendingPathComponent(target.lastPathComponent)
        guard target.pathExtension.lowercased() == fileExtension,
              realTarget != source, !realTarget.path.hasPrefix(source.path + "/"),
              !source.path.hasPrefix(realTarget.path + "/") else { throw TransferError.invalidDestination }
        guard !fm.fileExists(atPath: target.path) else { throw TransferError.destinationExists }
        let staging = target.deletingLastPathComponent().appendingPathComponent(".rasanai-export-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: staging, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: staging) }
        let payload = staging.appendingPathComponent("Project", isDirectory: true)
        try fm.createDirectory(at: payload, withIntermediateDirectories: false)
        let total = entries.reduce(Int64(0)) { $0 + $1.bytes }
        try ensureSpace(total, at: target.deletingLastPathComponent())
        let oldRoots = Array(Set([project.standardizedFileURL.path, project.resolvingSymlinksInPath().standardizedFileURL.path])).sorted { $0.count > $1.count }
        try copy(entries, from: source, to: payload, total: total, replacements: oldRoots.map { ($0, rootMarker) }, progress: progress)
        let metadata = Manifest(version: 1, name: manifest.name, exportedAt: Date())
        try JSONEncoder().encode(metadata).write(to: staging.appendingPathComponent("manifest.json"), options: .atomic)
        try Task.checkCancellation()
        try publish(staging, to: target)
    }
    public static func importPackage(_ package: URL, library: ProjectLibrary, name: String,
                                     progress: @Sendable (ProjectTransferProgress) -> Void) throws -> URL {
        let fm = FileManager.default
        _ = try readManifest(package)
        let payload = package.appendingPathComponent("Project", isDirectory: true)
        _ = try ProjectLibrary(root: package).read(payload)
        let entries = try collect(payload)
        try validateRun(payload)
        let total = entries.reduce(Int64(0)) { $0 + $1.bytes }
        try library.prepare()
        try ensureSpace(total, at: library.root)
        let cleanName = try ProjectLibrary.validatedName(name)
        let project = library.root.appendingPathComponent(cleanName, isDirectory: true)
        guard !fm.fileExists(atPath: project.path) else { throw TransferError.destinationExists }
        let staging = library.root.appendingPathComponent(".rasanai-import-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: staging, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: staging) }
        try copy(entries.filter { $0.relative != "rasanai-project.json" }, from: payload.resolvingSymlinksInPath().standardizedFileURL, to: staging, total: total,
                 replacements: [(rootMarker, project.standardizedFileURL.path)], progress: progress)
        for folder in ["assets", "audio", "compositions", "exports", ".rasanai"] {
            try fm.createDirectory(at: staging.appendingPathComponent(folder), withIntermediateDirectories: true)
        }
        let fresh = LocalProject(id: UUID(), name: cleanName, createdAt: Date(), lastOpenedAt: nil, archivedAt: nil)
        try JSONEncoder().encode(fresh).write(to: staging.appendingPathComponent("rasanai-project.json"), options: .atomic)
        try validateRun(staging)
        try Task.checkCancellation()
        try publish(staging, to: project)
        progress(ProjectTransferProgress(completedBytes: total, totalBytes: total, file: "Imported"))
        return project
    }
    private static func publish(_ staging: URL, to destination: URL) throws {
        // Both paths are on the same volume. An exclusive rename publishes only complete content.
        guard renamex_np(staging.path, destination.path, UInt32(RENAME_EXCL)) == 0 else {
            if errno == EEXIST { throw TransferError.destinationExists }
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }
    }
    private static func readManifest(_ package: URL) throws -> Manifest {
        let values = try package.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard package.pathExtension.lowercased() == fileExtension, values.isDirectory == true, values.isSymbolicLink != true else { throw TransferError.invalidPackage }
        let file = package.appendingPathComponent("manifest.json")
        let info = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard info.isRegularFile == true, info.isSymbolicLink != true, (info.fileSize ?? Int.max) < 1_048_576 else { throw TransferError.invalidPackage }
        let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: file))
        guard manifest.version == 1 else { throw TransferError.unsupportedVersion }
        _ = try ProjectLibrary.validatedName(manifest.name)
        return manifest
    }
    private static func collect(_ root: URL) throws -> [Entry] {
        let fm = FileManager.default
        let realRoot = root.resolvingSymlinksInPath().standardizedFileURL
        var entries: [Entry] = []
        func walk(_ folder: URL, relative: String, depth: Int) throws {
            guard depth < 64, entries.count < 100_000 else { throw TransferError.tooManyFiles }
            let folderInfo = try folder.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard folderInfo.isDirectory == true, folderInfo.isSymbolicLink != true else { throw TransferError.unsafeFile(relative) }
            for child in try fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) {
                let name = child.lastPathComponent
                if privateNames.contains(name) || name.hasPrefix(".") && !(relative.isEmpty && name == ".rasanai") && name != ".hyperframes" { continue }
                if folder.lastPathComponent == ".hyperframes" && name != "frame-packets" { continue }
                let path = relative.isEmpty ? name : relative + "/" + name
                if relative == ".rasanai" && name != "current" && name.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) == nil { continue }
                let values = try child.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey])
                guard values.isSymbolicLink != true, child.resolvingSymlinksInPath().path.hasPrefix(realRoot.path + "/") else { throw TransferError.unsafeFile(path) }
                if values.isDirectory == true { try walk(child, relative: path, depth: depth + 1) }
                else if values.isRegularFile == true {
                    guard entries.count < 100_000 else { throw TransferError.tooManyFiles }
                    entries.append(Entry(relative: path, source: child, bytes: Int64(values.fileSize ?? 0)))
                } else { throw TransferError.unsafeFile(path) }
            }
        }
        try walk(root, relative: "", depth: 0)
        return entries.sorted { $0.relative < $1.relative }
    }
    private static func copy(_ entries: [Entry], from root: URL, to destination: URL, total: Int64,
                             replacements: [(String, String)], progress: @Sendable (ProjectTransferProgress) -> Void) throws {
        let fm = FileManager.default
        var copied: Int64 = 0
        for entry in entries {
            try Task.checkCancellation()
            guard entry.source.resolvingSymlinksInPath().path.hasPrefix(root.path + "/"),
                  (try entry.source.resourceValues(forKeys: [.isSymbolicLinkKey])).isSymbolicLink != true else { throw TransferError.unsafeFile(entry.relative) }
            let target = destination.appendingPathComponent(entry.relative)
            try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            guard !fm.fileExists(atPath: target.path) else { throw TransferError.destinationExists }
            // Source assets retain their original bytes. Only project state/composition text is relocated.
            let relocate = !entry.relative.hasPrefix("assets/") && !entry.relative.hasPrefix("audio/")
                && entry.relative != "rasanai-project.json" && textExtensions.contains(entry.source.pathExtension.lowercased())
            if relocate && entry.bytes < 32_000_000, let original = try? String(contentsOf: entry.source, encoding: .utf8) {
                func relocateString(_ original: String) -> String {
                    var value = original
                    for (old, new) in replacements {
                        value = value.replacingOccurrences(of: old + "/", with: new + "/")
                        if value == old { value = new }
                        if old.hasPrefix("/") {
                            value = value.replacingOccurrences(of: URL(fileURLWithPath: old, isDirectory: true).absoluteString, with: new + "/")
                        }
                    }
                    return value
                }
                var text: String
                if entry.source.pathExtension.lowercased() == "json" {
                    let json = try JSONDecoder().decode(JSONValue.self, from: Data(original.utf8))
                    func rewrite(_ value: JSONValue) -> JSONValue {
                        switch value {
                        case .string(let string): .string(relocateString(string))
                        case .array(let values): .array(values.map(rewrite))
                        case .object(let values): .object(values.mapValues(rewrite))
                        default: value
                        }
                    }
                    let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
                    var relocated = rewrite(json)
                    if entry.source.lastPathComponent == "session.json", replacements.contains(where: { $0.0 == rootMarker }) {
                        // Transient actions are not replayed on a different Mac. Reviews can be submitted again.
                        var raw = relocated.object
                        var steps = raw["steps"]?.object ?? [:]
                        for (key, value) in steps {
                            var fields = value.object
                            fields.removeValue(forKey: "sent")
                            steps[key] = .object(fields)
                        }
                        raw["steps"] = .object(steps)
                        relocated = .object(raw)
                    }
                    text = String(decoding: try encoder.encode(relocated), as: UTF8.self)
                } else { text = relocateString(original) }
                try text.write(to: target, atomically: true, encoding: .utf8)
            } else {
                guard fm.createFile(atPath: target.path, contents: nil) else { throw TransferError.invalidDestination }
                let input = try FileHandle(forReadingFrom: entry.source)
                let output = try FileHandle(forWritingTo: target)
                defer { try? input.close(); try? output.close() }
                var withinFile: Int64 = 0
                while true {
                    try Task.checkCancellation()
                    guard let data = try input.read(upToCount: 4_194_304), !data.isEmpty else { break }
                    try output.write(contentsOf: data)
                    withinFile += Int64(data.count)
                    progress(ProjectTransferProgress(completedBytes: copied + withinFile, totalBytes: total, file: entry.relative))
                }
                if let permissions = try fm.attributesOfItem(atPath: entry.source.path)[.posixPermissions] as? NSNumber {
                    try fm.setAttributes([.posixPermissions: permissions.intValue & 0o777], ofItemAtPath: target.path)
                }
            }
            copied += entry.bytes
            progress(ProjectTransferProgress(completedBytes: copied, totalBytes: total, file: entry.relative))
        }
    }
    private static func validateRun(_ project: URL) throws {
        let file = project.appendingPathComponent(".rasanai/current")
        guard FileManager.default.fileExists(atPath: file.path) else { return }
        let info = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .fileSizeKey])
        guard info.isSymbolicLink != true, (info.fileSize ?? Int.max) < 1024 else { throw TransferError.invalidRun }
        let name = try String(contentsOf: file, encoding: .utf8)
        guard name.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) != nil else { throw TransferError.invalidRun }
        let run = project.appendingPathComponent(".rasanai/\(name)")
        let session = run.appendingPathComponent("session.json")
        let values = try session.resourceValues(forKeys: [.isSymbolicLinkKey, .fileSizeKey])
        guard values.isSymbolicLink != true, (values.fileSize ?? Int.max) < 32_000_000 else { throw TransferError.invalidRun }
        _ = try SessionSnapshot(data: Data(contentsOf: session))
    }
    private static func ensureSpace(_ bytes: Int64, at folder: URL) throws {
        if let free = try? folder.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage,
           free < bytes + 268_435_456 { throw TransferError.insufficientSpace }
    }
    public enum TransferError: LocalizedError {
        case invalidPackage, unsupportedVersion, unsafeFile(String), invalidRun, destinationExists, invalidDestination, insufficientSpace, tooManyFiles
        public var errorDescription: String? {
            switch self {
            case .invalidPackage: "Choose a valid .rasanaiproject package exported by RasanAI Studio."
            case .unsupportedVersion: "This package requires a newer version of RasanAI Studio."
            case .unsafeFile(let path): "The project contains a link or unsupported file: \(path). Copy its actual content into the project before exporting."
            case .invalidRun: "The project's current run reference or saved review state is invalid."
            case .destinationExists: "A file or project already exists at this destination. Choose another name."
            case .invalidDestination: "Save a .rasanaiproject package outside the source project."
            case .insufficientSpace: "The destination does not have enough space for this project and working files."
            case .tooManyFiles: "This project contains too many files or deeply nested folders to package. Remove dependency/cache folders and try again."
            }
        }
    }
}
