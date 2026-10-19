import Foundation

/// A cheap look inside a folder to tell a brand kit from footage. Mirrors the brand-kit signals in the engine's
/// `lib/sources.mjs` (brand-ish names, DESIGN.md/BRAND.md, fonts, guideline PDFs); a shallow walk, capped.
enum BrandKitSniffer {
    private static let video = Set(["mp4", "mov", "m4v", "webm", "mkv", "avi", "mts", "mxf", "r3d", "braw"])
    private static let font = Set(["otf", "ttf", "woff", "woff2", "ttc"])
    private static let skip = Set(["node_modules", ".git", "Pods", "DerivedData", "__pycache__", ".venv", "venv", ".cache"])
    private static let brandish = try! NSRegularExpression(pattern: "brand|logo|identity|guideline|style-?guide|wordmark", options: .caseInsensitive)
    private static let cap = 500, maxDepth = 3

    private static func isBrandish(_ name: String) -> Bool {
        brandish.firstMatch(in: name, range: NSRange(name.startIndex..., in: name)) != nil
    }

    /// A folder or a .zip that looks like a brand kit; anything else does not.
    static func isKit(_ url: URL) -> Bool {
        if url.pathExtension.lowercased() == "zip" { return zipLooksLikeKit(url) }
        let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
        return isDir && looksLikeKit(url)
    }

    /// A .zip: the same signals from its entry names (listed with zipinfo, nothing extracted).
    static func zipLooksLikeKit(_ zip: URL) -> Bool {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/zipinfo")
        p.arguments = ["-1", zip.path]
        let out = Pipe()
        p.standardOutput = out; p.standardError = FileHandle.nullDevice
        guard (try? p.run()) != nil else { return false }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        guard p.terminationStatus == 0 else { return false }
        var videos = 0, signal = false
        for entry in String(decoding: data, as: UTF8.self).split(separator: "\n").prefix(cap) {
            let path = String(entry)
            if path.hasPrefix("__MACOSX/") || path.contains("/.") { continue }
            let parts = path.split(separator: "/").map(String.init)
            guard let name = parts.last else { continue }
            if parts.dropLast().contains(where: { isBrandish($0) }) { signal = true }
            if path.hasSuffix("/") { continue }
            let ext = (name as NSString).pathExtension.lowercased()
            if video.contains(ext) { videos += 1; continue }
            let upper = name.uppercased()
            if upper == "DESIGN.MD" || upper == "BRAND.MD" || font.contains(ext) || isBrandish(name) { signal = true }
        }
        return videos <= 1 && signal
    }

    /// True when the folder has no (or almost no) video and carries brand-kit signals.
    static func looksLikeKit(_ folder: URL) -> Bool {
        let fm = FileManager.default
        var videos = 0, seen = 0, signal = false
        var queue: [(URL, Int)] = [(folder, 0)]
        while !queue.isEmpty, seen < cap {
            let (dir, depth) = queue.removeFirst()
            guard let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) else { continue }
            for url in items {
                seen += 1
                if seen > cap { break }
                let name = url.lastPathComponent
                let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
                if isDir {
                    if skip.contains(name) { continue }
                    if isBrandish(name) { signal = true }
                    if depth + 1 < maxDepth { queue.append((url, depth + 1)) }
                    continue
                }
                let ext = url.pathExtension.lowercased()
                if video.contains(ext) { videos += 1; continue }
                let upper = name.uppercased()
                if upper == "DESIGN.MD" || upper == "BRAND.MD" { signal = true }
                else if font.contains(ext) { signal = true }
                else if ext == "pdf", isBrandish(name) { signal = true }
                else if ext != "pdf", isBrandish(name) { signal = true }
            }
        }
        return videos <= 1 && signal
    }
}
