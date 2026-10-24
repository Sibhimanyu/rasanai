import Foundation
import StudioCore

/// Looks up a local one-short-clip preview for a motion at `motion/previews/<id>.mp4` inside the project.
/// It never renders: with no clip it returns nil and the card keeps its placeholder.
actor MotionPreviewCache {
    private let projectRoot: URL?
    private var hits: [String: URL] = [:]
    private var misses: Set<String> = []

    init(projectRoot: URL?) { self.projectRoot = projectRoot }

    func previewURL(for id: String) -> URL? {
        if let url = hits[id] { return url }
        if misses.contains(id) { return nil }
        guard let projectRoot, !id.contains("/"), !id.contains("\\"),
              let url = try? MotionProjectPaths.safeRelative("motion/previews/\(id).mp4", root: projectRoot),
              FileManager.default.fileExists(atPath: url.path) else { misses.insert(id); return nil }
        hits[id] = url
        return url
    }

    /// Forget misses, for when previews were rendered since.
    func refresh() { misses.removeAll(); hits.removeAll() }
}
