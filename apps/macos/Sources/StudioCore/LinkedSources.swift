import Foundation

/// A folder or video the film uses where it already lives. It is never copied into the project (footage can be tens of
/// gigabytes) and never written to: the director reads it in place, and the launch grants it read-only.
public struct LinkedSource: Codable, Equatable, Hashable, Sendable, Identifiable {
    public enum Kind: String, Codable, Sendable {
        /// Raw footage to cut: a folder of clips or a single clip.
        case footage
        /// "Make it like this": a finished video to study for pace, type, colour and camera. Never cut into the film.
        case reference
    }
    public var kind: Kind
    /// Absolute path on this Mac.
    public var path: String
    public var isFolder: Bool
    public var id: String { "\(kind.rawValue):\(path)" }
    public var url: URL { URL(fileURLWithPath: path, isDirectory: isFolder) }
    public var name: String { url.lastPathComponent }

    public init(kind: Kind, path: String, isFolder: Bool) { self.kind = kind; self.path = path; self.isFolder = isFolder }

    /// Where one is dropped or chosen: a footage drop takes folders and clips, a reference takes one video.
    public enum Rejection: LocalizedError, Equatable {
        case notAFolder, notAVideo, hidden, missing
        public var errorDescription: String? {
            switch self {
            case .notAFolder: "Drop a folder here. For single files use the + button."
            case .notAVideo: "Choose a video file (mp4, mov, m4v, webm, mkv, avi or mts)."
            case .hidden: "Choose a visible folder or file, not a hidden one."
            case .missing: "That item is no longer there."
            }
        }
    }

    /// A footage folder, referenced in place. Packages (.app, .photoslibrary) and hidden folders are not footage folders.
    public static func footageFolder(_ url: URL) -> Result<LinkedSource, Rejection> {
        guard !url.lastPathComponent.hasPrefix(".") else { return .failure(.hidden) }
        guard let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .isPackageKey]) else { return .failure(.missing) }
        guard values.isDirectory == true, values.isPackage != true else { return .failure(.notAFolder) }
        return .success(LinkedSource(kind: .footage, path: url.standardizedFileURL.path, isFolder: true))
    }

    /// A reference video, referenced in place.
    public static func referenceVideo(_ url: URL) -> Result<LinkedSource, Rejection> {
        guard !url.lastPathComponent.hasPrefix(".") else { return .failure(.hidden) }
        guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey]) else { return .failure(.missing) }
        guard values.isRegularFile == true, FilmDraft.videoExtensions.contains(url.pathExtension.lowercased()) else { return .failure(.notAVideo) }
        return .success(LinkedSource(kind: .reference, path: url.standardizedFileURL.path, isFolder: false))
    }

    /// Splits a drop on the whole window: folders become footage folders (referenced in place), everything else stays
    /// a file to copy into the project the way it always was.
    public static func split(_ urls: [URL]) -> (folders: [LinkedSource], files: [URL]) {
        var folders: [LinkedSource] = [], files: [URL] = []
        for url in urls where url.isFileURL {
            if case .success(let source) = footageFolder(url) { folders.append(source) } else { files.append(url) }
        }
        return (folders, files)
    }

    /// Adds sources without duplicates, one reference video at a time (a second reference replaces the first).
    public static func merge(_ current: [LinkedSource], adding added: [LinkedSource]) -> [LinkedSource] {
        var out = current
        for source in added where !out.contains(source) {
            if source.kind == .reference { out.removeAll { $0.kind == .reference } }
            out.append(source)
        }
        return out
    }

    /// A short summary of a footage folder, read off the main thread: clip count and total size. Never loads the clips.
    public struct FolderSummary: Equatable, Sendable {
        public var clips: Int
        public var bytes: Int64
        public var line: String {
            let size = ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
            return clips == 0 ? "No video clips found" : "\(clips) clip\(clips == 1 ? "" : "s") · \(size)"
        }
    }
    public static func summarize(folder: URL, limit: Int = 5000) -> FolderSummary {
        var clips = 0, bytes: Int64 = 0, seen = 0
        let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey]
        guard let walker = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles, .skipsPackageDescendants]) else {
            return FolderSummary(clips: 0, bytes: 0)
        }
        for case let url as URL in walker {
            seen += 1
            if seen > limit { break }
            guard FilmDraft.videoExtensions.contains(url.pathExtension.lowercased()),
                  let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true else { continue }
            clips += 1; bytes += Int64(values.fileSize ?? 0)
        }
        return FolderSummary(clips: clips, bytes: bytes)
    }
}
