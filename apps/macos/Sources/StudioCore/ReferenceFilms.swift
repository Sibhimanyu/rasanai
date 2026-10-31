import Foundation

/// "Any reference films you love?": video files, folders of them and pasted links, kept as plain strings (absolute paths or
/// http(s) URLs) in `reference_films` of rasanai-brief.json. The skill's refs.mjs measures them; nothing from them is copied in.
public enum ReferenceFilms {
    public static let limit = 12

    public static func isLink(_ entry: String) -> Bool {
        guard let url = URL(string: entry), let scheme = url.scheme?.lowercased() else { return false }
        return ["http", "https"].contains(scheme) && url.host?.isEmpty == false
    }

    /// Splits pasted text (spaces, commas or lines) into the links in it. Anything that is not an http(s) link is dropped.
    public static func links(in text: String) -> [String] {
        let parts = text.components(separatedBy: CharacterSet(charactersIn: " \t\r\n,;"))
        return parts.map { $0.trimmingCharacters(in: CharacterSet(charactersIn: "<>\"'()")) }.filter(isLink)
    }

    /// A dropped or chosen file or folder: a video, or a folder (refs.mjs reads the videos in it). Hidden items are refused.
    public static func path(for url: URL) -> String? {
        guard url.isFileURL, !url.lastPathComponent.hasPrefix(".") else { return nil }
        guard let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .isPackageKey, .isRegularFileKey]) else { return nil }
        if values.isDirectory == true, values.isPackage != true { return url.standardizedFileURL.path }
        if values.isRegularFile == true, FilmDraft.videoExtensions.contains(url.pathExtension.lowercased()) { return url.standardizedFileURL.path }
        return nil
    }

    /// Adds entries without duplicates, up to the limit.
    public static func merge(_ current: [String], adding added: [String]) -> [String] {
        var out = current
        for entry in added where !out.contains(entry) && out.count < limit { out.append(entry) }
        return out
    }

    public static func isFilePath(_ entry: String) -> Bool { entry.hasPrefix("/") }
    public static func title(_ entry: String) -> String {
        if let url = URL(string: entry), isLink(entry) { return (url.host ?? entry).replacingOccurrences(of: "www.", with: "") }
        return URL(fileURLWithPath: entry).lastPathComponent
    }
}
