import Foundation

/// Everything Motion Studio reads from a project, loaded without ever throwing: absent or unreadable files are nil/empty
/// and the reason is kept in `problems` for the UI to show.
public struct MotionStudioStore: Sendable, Equatable {
    public var elementIndex: MotionElementIndex?
    public var reference: MotionReferenceSummary?
    public var kitCatalog: MotionKitCatalog?
    /// True when the element index's build_digest differs from the digest given to `load`.
    public var indexIsStale: Bool
    public var problems: [String]

    public static let empty = MotionStudioStore(elementIndex: nil, reference: nil, kitCatalog: nil, indexIsStale: false, problems: [])

    public var hasAnything: Bool { elementIndex != nil || reference != nil || kitCatalog != nil }

    /// - Parameter currentBuildDigest: the digest of the current scene sources, when the caller knows it, to flag a stale index.
    public static func load(projectRoot: URL, currentBuildDigest: String? = nil) -> MotionStudioStore {
        var store = MotionStudioStore.empty
        var problems: [String] = []
        func read<T>(_ relative: String, _ decode: (Data, String) throws -> T) -> T? {
            guard let url = try? MotionProjectPaths.safeRelative(relative, root: projectRoot),
                  FileManager.default.fileExists(atPath: url.path) else { return nil }
            do {
                guard let data = try? Data(contentsOf: url) else { throw MotionStudioError.unreadable(relative) }
                return try decode(data, relative)
            } catch {
                problems.append((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
                return nil
            }
        }
        store.elementIndex = read("motion/element-index.json") { try MotionElementIndex.decode($0, file: $1) }
        store.reference = read("reference-motion.json") { try MotionReferenceSummary.decode($0, file: $1) }
        store.kitCatalog = read("motion-kit/catalog.json") { try MotionKitCatalog.decode($0, file: $1) }
        store.indexIsStale = store.elementIndex?.isStale(currentDigest: currentBuildDigest) ?? false
        store.problems = problems
        return store
    }

    /// The edit statuses from `<run>/motion/edits.jsonl` (empty when absent).
    public static func loadEdits(run: URL) -> MotionEditStatus {
        let url = run.appendingPathComponent("motion/edits.jsonl")
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return MotionEditStatus() }
        return MotionEditStatus.parse(text)
    }
}
