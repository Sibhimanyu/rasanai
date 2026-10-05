import Foundation
import Darwin

public struct LocalProject: Codable, Identifiable, Sendable {
    public let id: UUID
    public var name: String
    public let createdAt: Date
    public var lastOpenedAt: Date?
    public var archivedAt: Date?
}

public struct ProjectLibrary: Sendable {
    public let root: URL
    public init(root: URL) { self.root = root }
    public static var defaultRoot: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("RasanAI", isDirectory: true)
    }
    public func prepare() throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    public static func validatedName(_ name: String) throws -> String {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 100, name != ".", name != "..",
              !name.contains("/"), !name.contains(":"), !name.contains("\\"),
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw LibraryError.invalidName
        }
        return name
    }
    public func create(name: String) throws -> URL {
        let name = try Self.validatedName(name)
        try prepare()
        let folder = root.appendingPathComponent(name, isDirectory: true)
        // Never merge into an existing project or follow an existing symlink.
        guard mkdir(folder.path, 0o755) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        for subfolder in ["assets", "audio", "compositions", "exports", ".rasanai"] {
            try FileManager.default.createDirectory(at: folder.appendingPathComponent(subfolder), withIntermediateDirectories: false)
        }
        let project = LocalProject(id: UUID(), name: name, createdAt: Date(), lastOpenedAt: nil, archivedAt: nil)
        try JSONEncoder().encode(project).write(to: folder.appendingPathComponent("rasanai-project.json"), options: .atomic)
        return folder
    }
    public func read(_ folder: URL) throws -> LocalProject {
        guard folder.deletingLastPathComponent().resolvingSymlinksInPath().path == root.resolvingSymlinksInPath().path,
              (try folder.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey])).isSymbolicLink != true,
              (try folder.resourceValues(forKeys: [.isDirectoryKey])).isDirectory == true else { throw LibraryError.unsafeProject }
        let manifest = folder.appendingPathComponent("rasanai-project.json")
        guard (try manifest.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey])).isSymbolicLink != true,
              (try manifest.resourceValues(forKeys: [.isRegularFileKey])).isRegularFile == true else { throw LibraryError.unsafeProject }
        return try JSONDecoder().decode(LocalProject.self, from: Data(contentsOf: manifest))
    }
    public func update(_ folder: URL, name: String? = nil, archived: Bool? = nil, opened: Bool = false) throws {
        var project = try read(folder)
        if let name {
            let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty, clean.count <= 100, !clean.contains("/"), !clean.contains(":"), !clean.contains("\\"),
                  !clean.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { throw LibraryError.invalidName }
            // Rename the display name only: absolute run/source references must keep working.
            project.name = clean
        }
        if let archived { project.archivedAt = archived ? Date() : nil }
        if opened { project.lastOpenedAt = Date() }
        try JSONEncoder().encode(project).write(to: folder.appendingPathComponent("rasanai-project.json"), options: .atomic)
    }
    public func duplicateDraft(_ folder: URL) throws -> URL {
        let source = try read(folder)
        var copy: URL?
        for index in 1...100 {
            do { copy = try create(name: String(source.name.prefix(80)) + (index == 1 ? " Copy" : " Copy \(index)")); break }
            catch let error as NSError where error.domain == NSPOSIXErrorDomain && error.code == Int(EEXIST) { continue }
        }
        guard let copy else { throw LibraryError.noCopyName }
        do {
            for name in ["assets", "audio"] {
                let from = folder.appendingPathComponent(name)
                if FileManager.default.fileExists(atPath: from.path) { try copyTree(from, to: copy.appendingPathComponent(name)) }
            }
            if let draft = FilmDraft.load(in: folder) { try draft.save(in: copy) }
            return copy
        } catch { try? FileManager.default.removeItem(at: copy); throw error }
    }
    private func copyTree(_ source: URL, to destination: URL) throws {
        let values = try source.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey, .isRegularFileKey])
        guard values.isSymbolicLink != true else { throw LibraryError.unsafeProject }
        if values.isDirectory == true {
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            for child in try FileManager.default.contentsOfDirectory(at: source, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
                try copyTree(child, to: destination.appendingPathComponent(child.lastPathComponent))
            }
        } else if values.isRegularFile == true { try FileManager.default.copyItem(at: source, to: destination) }
        else { throw LibraryError.unsafeProject }
    }
    public func trash(_ folder: URL) throws {
        _ = try read(folder)
        try FileManager.default.trashItem(at: folder, resultingItemURL: nil)
    }
    public func projects() throws -> [(LocalProject, URL)] {
        try prepare()
        return try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isSymbolicLinkKey], options: [.skipsHiddenFiles])
            .compactMap { folder in
                guard (try? folder.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) != true,
                      let project = try? read(folder) else { return nil }
                return (project, folder)
            }.sorted { $0.0.createdAt > $1.0.createdAt }
    }
    public enum LibraryError: LocalizedError {
        case invalidName, unsafeProject, noCopyName
        public var errorDescription: String? {
            switch self {
            case .invalidName: "Use a project name of 1–100 characters without slashes, colons, or control characters."
            case .unsafeProject: "This is not a managed project directly inside your library, or it contains symbolic links."
            case .noCopyName: "Choose a different name before duplicating this project."
            }
        }
    }
}

public enum LocalAgent: String, CaseIterable, Identifiable, Sendable {
    case claude, codex, custom
    public var id: String { rawValue }
    public var title: String {
        switch self { case .claude: "Claude Code"; case .codex: "OpenAI Codex"; case .custom: "Other local agent" }
    }
    public var loginArguments: [String] {
        switch self { case .claude: ["auth", "login"]; case .codex: ["login"]; case .custom: [] }
    }
    public var statusArguments: [String] {
        switch self { case .claude: ["auth", "status"]; case .codex: ["login", "status"]; case .custom: ["--version"] }
    }
    public static var searchDirectories: [String] {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return [managedToolsDirectory.appendingPathComponent("bin").path, home + "/.local/bin", home + "/.npm-global/bin", "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
            + (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map(String.init)
    }
    public static var managedToolsDirectory: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/RasanAI/Tools", isDirectory: true)
    }
    public func discoveredExecutable() -> String? {
        guard self != .custom else { return nil }
        return Self.searchDirectories.map { $0 + "/" + rawValue }.first { FileManager.default.isExecutableFile(atPath: $0) }
    }
    public static func shellQuote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'" }
}
