import Foundation

/// Local previews are restricted to the selected run and the film's workspace.
public struct AssetResolver: Sendable {
    public let run: URL
    public let workspace: URL
    /// Files of a run that are plumbing, never payload assets.
    static let privateFiles: Set<String> = ["address.json", "console.json", "actions.jsonl", "consumed.json", "rejected.json",
                                            "actions.lock", "session.lock", "director-job.json", "director.log"]
    public init(run: URL, workspace: URL) { self.run = run; self.workspace = workspace }
    public func resolve(_ path: String?) -> URL? {
        guard let path, !path.isEmpty, !path.contains("\0"), !path.contains("://") else { return nil }
        let candidates = path.hasPrefix("/") ? [URL(fileURLWithPath: path)] :
            [workspace.appendingPathComponent(path), run.appendingPathComponent(path)]
        let roots = [run, workspace].map { $0.resolvingSymlinksInPath().standardizedFileURL.path }
        return candidates.compactMap { candidate -> URL? in
            let resolved = candidate.resolvingSymlinksInPath().standardizedFileURL
            guard roots.contains(where: { resolved.path.hasPrefix($0 + "/") }),
                  !Self.privateFiles.contains(resolved.lastPathComponent),
                  FileManager.default.fileExists(atPath: resolved.path) else { return nil }
            return resolved
        }.first
    }
}

/// Which folder a run's relative payload paths are read from. A run inside a project (`<project>/.rasanai/<run>`) uses the
/// project; a run opened on its own uses the workspace its console was started with (`console.json` or, for a run an
/// older Studio started, `address.json`), else the run folder itself. Only the `root` is read; no port or token ever is.
public enum RunWorkspace {
    public static func root(for run: URL) -> URL {
        if run.deletingLastPathComponent().lastPathComponent == ".rasanai" { return run.deletingLastPathComponent().deletingLastPathComponent() }
        for name in ["console.json", "address.json"] {
            if let data = try? Data(contentsOf: run.appendingPathComponent(name)),
               let value = try? JSONDecoder().decode(JSONValue.self, from: data),
               let root = value["root"].string, root.hasPrefix("/") { return URL(fileURLWithPath: root, isDirectory: true) }
        }
        return run
    }
}
