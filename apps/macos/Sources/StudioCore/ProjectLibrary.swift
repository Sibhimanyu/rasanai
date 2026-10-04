import Foundation
import Darwin

public struct LocalProject: Codable, Identifiable, Sendable {
    public let id: UUID
    public let name: String
    public let createdAt: Date
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
    public func create(name: String) throws -> URL {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 100, name != ".", name != "..",
              !name.contains("/"), !name.contains(":"), !name.contains("\\"),
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw LibraryError.invalidName
        }
        try prepare()
        let folder = root.appendingPathComponent(name, isDirectory: true)
        // Never merge into an existing project or follow an existing symlink.
        guard mkdir(folder.path, 0o755) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        for subfolder in ["assets", "audio", "compositions", "exports", ".rasanai"] {
            try FileManager.default.createDirectory(at: folder.appendingPathComponent(subfolder), withIntermediateDirectories: false)
        }
        let project = LocalProject(id: UUID(), name: name, createdAt: Date())
        try JSONEncoder().encode(project).write(to: folder.appendingPathComponent("rasanai-project.json"), options: .atomic)
        return folder
    }
    public func projects() throws -> [(LocalProject, URL)] {
        try prepare()
        return try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isSymbolicLinkKey], options: [.skipsHiddenFiles])
            .compactMap { folder in
                guard (try? folder.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) != true,
                      let data = try? Data(contentsOf: folder.appendingPathComponent("rasanai-project.json")),
                      let project = try? JSONDecoder().decode(LocalProject.self, from: data) else { return nil }
                return (project, folder)
            }.sorted { $0.0.createdAt > $1.0.createdAt }
    }
    public enum LibraryError: LocalizedError {
        case invalidName
        public var errorDescription: String? { "Use a project name of 1–100 characters without slashes, colons, or control characters." }
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
        return [home + "/.local/bin", home + "/.npm-global/bin", "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
            + (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map(String.init)
    }
    public func discoveredExecutable() -> String? {
        guard self != .custom else { return nil }
        return Self.searchDirectories.map { $0 + "/" + rawValue }.first { FileManager.default.isExecutableFile(atPath: $0) }
    }
    public static func shellQuote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'" }
}
