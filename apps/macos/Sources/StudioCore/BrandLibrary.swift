import Foundation

/// A brand is a plain folder: `<library>/Brands/<slug>/DESIGN.md` plus an optional logo.
/// The engine already treats a project-level DESIGN.md as the film's brand.
public struct Brand: Identifiable, Hashable, Sendable {
    public var id: URL { folder }
    public let folder: URL
    public var name: String
    public var designFile: URL
    public var colors: [String]
    public var fonts: [String]
    public var logo: URL?
    public var previousNames: [String]

    public init(folder: URL, name: String, designFile: URL, colors: [String], fonts: [String], logo: URL?, previousNames: [String] = []) {
        self.folder = folder; self.name = name; self.designFile = designFile
        self.colors = colors; self.fonts = fonts; self.logo = logo
        self.previousNames = previousNames
    }
}

public enum BrandLibrary {
    static let logoExtensions = ["png", "jpg", "jpeg", "svg", "pdf", "webp", "heic"]

    public static func folder(in libraryRoot: URL) -> URL {
        let url = libraryRoot.appendingPathComponent("Brands", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    public static func list(in libraryRoot: URL) -> [Brand] {
        let root = folder(in: libraryRoot)
        let items = (try? FileManager.default.contentsOfDirectory(
            at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])) ?? []
        return items.compactMap { url in
            guard (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true else { return nil }
            return load(url)
        }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    public static func load(_ folder: URL) -> Brand? {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: folder.path, isDirectory: &isDir), isDir.boolValue else { return nil }
        let design = folder.appendingPathComponent("DESIGN.md")
        var name = folder.lastPathComponent
        var previousNames: [String] = []
        if let data = try? Data(contentsOf: folder.appendingPathComponent("brand.json")),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let n = json["name"] as? String, !n.trimmingCharacters(in: .whitespaces).isEmpty {
            name = n
            previousNames = json["previousNames"] as? [String] ?? []
        }
        let text = (try? String(contentsOf: design, encoding: .utf8)) ?? ""
        let logo = logoURL(in: folder)
        return Brand(folder: folder, name: name, designFile: design,
                     colors: parseColors(text), fonts: parseFonts(text), logo: logo, previousNames: previousNames)
    }

    public static func create(name: String, importing design: URL?, logo: URL?, in libraryRoot: URL) throws -> Brand {
        let fm = FileManager.default
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let display = clean.isEmpty ? "Untitled brand" : clean
        let root = folder(in: libraryRoot)
        let base = slug(display)
        var target = root.appendingPathComponent(base, isDirectory: true)
        var n = 2
        while fm.fileExists(atPath: target.path) {
            target = root.appendingPathComponent("\(base)-\(n)", isDirectory: true); n += 1
        }
        try fm.createDirectory(at: target, withIntermediateDirectories: true)
        let designFile = target.appendingPathComponent("DESIGN.md")
        if let design { try fm.copyItem(at: design, to: designFile) }
        else { try template(for: display).write(to: designFile, atomically: true, encoding: .utf8) }
        let meta = try JSONSerialization.data(withJSONObject: ["name": display], options: [.prettyPrinted])
        try meta.write(to: target.appendingPathComponent("brand.json"))
        if let logo { try setLogo(logo, in: target) }
        guard let brand = load(target) else { throw CocoaError(.fileReadUnknown) }
        return brand
    }

    /// Replaces the brand's logo (`logo.<ext>`).
    public static func setLogo(_ logo: URL, in folder: URL) throws {
        let fm = FileManager.default
        let ext = logo.pathExtension.lowercased()
        guard logoExtensions.contains(ext) else { throw BrandEditError.invalidLogo }
        let target = folder.appendingPathComponent("logo." + ext)
        if logo.standardizedFileURL == target.standardizedFileURL { return }
        let staged = folder.appendingPathComponent(".logo-\(UUID().uuidString).\(ext)")
        defer { try? fm.removeItem(at: staged) }
        try fm.copyItem(at: logo, to: staged)
        let old = logoURL(in: folder)
        if fm.fileExists(atPath: target.path) { _ = try fm.replaceItemAt(target, withItemAt: staged) }
        else { try fm.moveItem(at: staged, to: target) }
        if let old, old != target { try fm.removeItem(at: old) }
    }

    public static func update(_ brand: Brand, name: String, colors: [String], fonts: [String], originalText: String, logo: URL?, removeLogo: Bool) throws -> Brand {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.count <= 100, !clean.contains("\n"), !clean.contains("\r"),
              !colors.isEmpty, colors.count <= 6,
              colors.allSatisfy({ $0.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil }),
              fonts.allSatisfy({ !$0.isEmpty && $0.count <= 100 && !$0.contains("\n") && !$0.contains("\r") }) else { throw BrandEditError.invalidValues }
        guard try String(contentsOf: brand.designFile, encoding: .utf8) == originalText else { throw BrandEditError.changedOnDisk }
        var updated = originalText
        // Temporary markers allow swapping two colours without replacing the same value twice.
        let marker = UUID().uuidString
        for (index, old) in brand.colors.enumerated() where index < colors.count {
            updated = updated.replacingOccurrences(of: NSRegularExpression.escapedPattern(for: old) + "(?![0-9a-fA-F])", with: "RASAN_COLOR_\(marker)_\(index)", options: [.regularExpression, .caseInsensitive])
        }
        for index in colors.indices { updated = updated.replacingOccurrences(of: "RASAN_COLOR_\(marker)_\(index)", with: colors[index].uppercased()) }
        for (index, old) in brand.fonts.enumerated() where index < fonts.count {
            updated = updated.replacingOccurrences(of: NSRegularExpression.escapedPattern(for: old), with: "RASAN_FONT_\(marker)_\(index)", options: [.regularExpression, .caseInsensitive])
        }
        for index in fonts.indices { updated = updated.replacingOccurrences(of: "RASAN_FONT_\(marker)_\(index)", with: fonts[index]) }
        if brand.colors.isEmpty {
            let roles = ["Background", "Foreground", "Primary", "Accent", "Secondary", "Muted"]
            updated += "\n\n## Colours\n" + colors.enumerated().map { "- \(roles[$0.offset]): \($0.element.uppercased())" }.joined(separator: "\n") + "\n"
        }
        if brand.fonts.isEmpty { updated += "\n\n## Typography\n- Display: \(fonts.first ?? "Inter")\n- Body: \(fonts.last ?? "Inter")\n" }
        else if brand.fonts.count == 1, fonts.count > 1 {
            let pattern = "(?im)(^[ \\t>*\\-]*Body:[ \\t]*)([^,\\n]+)"
            if updated.range(of: pattern, options: .regularExpression) != nil {
                updated = updated.replacingOccurrences(of: pattern, with: "$1" + NSRegularExpression.escapedTemplate(for: fonts[1]), options: .regularExpression)
            } else { updated += "\n\n## Body typography\n- Body: \(fonts[1])\n" }
        }
        // Keep the prior design as a recoverable file, including all imported motion and voice notes.
        try originalText.write(to: brand.folder.appendingPathComponent("DESIGN.previous.md"), atomically: true, encoding: .utf8)
        if let logo { try setLogo(logo, in: brand.folder) }
        if removeLogo, let old = logoURL(in: brand.folder) { try FileManager.default.trashItem(at: old, resultingItemURL: nil) }
        try updated.write(to: brand.designFile, atomically: true, encoding: .utf8)
        let metaURL = brand.folder.appendingPathComponent("brand.json")
        var metadata = (try? JSONSerialization.jsonObject(with: Data(contentsOf: metaURL))) as? [String: Any] ?? [:]
        metadata["name"] = clean
        if clean != brand.name { metadata["previousNames"] = Array(Set(brand.previousNames + [brand.name])).sorted() }
        try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted]).write(to: metaURL, options: .atomic)
        guard let result = load(brand.folder) else { throw CocoaError(.fileReadUnknown) }
        return result
    }
    public enum BrandEditError: LocalizedError {
        case invalidValues, invalidLogo, changedOnDisk
        public var errorDescription: String? {
            switch self {
            case .invalidValues: "Enter a name, six-digit hex colours and font names."
            case .invalidLogo: "Choose a PNG, JPEG, SVG, PDF, WebP or HEIC logo."
            case .changedOnDisk: "This design changed outside the editor. Close and reopen Edit brand to load the latest version."
            }
        }
    }

    public static func delete(_ brand: Brand) throws {
        try FileManager.default.trashItem(at: brand.folder, resultingItemURL: nil)
    }

    public static func apply(_ brand: Brand, to project: URL) throws {
        let fm = FileManager.default
        let dest = project.appendingPathComponent("DESIGN.md")
        if fm.fileExists(atPath: dest.path) {
            if fm.contentsEqual(atPath: dest.path, andPath: brand.designFile.path) {
                try fm.removeItem(at: dest)
            } else {
                let backup = project.appendingPathComponent("DESIGN.previous.md")
                if fm.fileExists(atPath: backup.path) { try fm.removeItem(at: backup) }
                try fm.moveItem(at: dest, to: backup)
            }
        }
        try fm.copyItem(at: brand.designFile, to: dest)
        if let logo = brand.logo {
            let dir = project.appendingPathComponent("assets/brand", isDirectory: true)
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            let target = dir.appendingPathComponent(logo.lastPathComponent)
            if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
            try fm.copyItem(at: logo, to: target)
        }
    }

    // MARK: Parsing

    static func logoURL(in folder: URL) -> URL? {
        logoExtensions.map { folder.appendingPathComponent("logo.\($0)") }
            .first { FileManager.default.fileExists(atPath: $0.path) }
    }

    static func slug(_ name: String) -> String {
        let lowered = name.lowercased()
        let mapped = lowered.map { $0.isLetter || $0.isNumber ? String($0) : "-" }.joined()
        let parts = mapped.split(separator: "-").map(String.init)
        return parts.isEmpty ? "brand" : parts.joined(separator: "-")
    }

    public static func parseColors(_ text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: "#([0-9A-Fa-f]{6})(?![0-9A-Fa-f])") else { return [] }
        var seen = Set<String>(), out: [String] = []
        for m in regex.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            guard let r = Range(m.range, in: text) else { continue }
            let hex = String(text[r]).uppercased()
            if seen.insert(hex).inserted { out.append(hex) }
            if out.count == 6 { break }
        }
        return out
    }

    public static func parseFonts(_ text: String) -> [String] {
        let patterns = [
            "font-family\\s*:\\s*([^;\\n]+)",
            "(?im)^[\\s>*\\-#|]*\\**\\s*(?:fonts?|typeface|display|headings?|headline|body|text|mono)\\b[^:\\n]{0,12}:\\**\\s*([^\\n]+)"
        ]
        var out: [String] = []
        for p in patterns {
            guard let regex = try? NSRegularExpression(pattern: p, options: [.caseInsensitive]) else { continue }
            for m in regex.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                guard m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text) else { continue }
                var raw = String(text[r])
                if let paren = raw.firstIndex(of: "(") { raw = String(raw[..<paren]) }
                let first = raw.split(separator: ",").first.map(String.init) ?? raw
                let name = first.trimmingCharacters(in: CharacterSet(charactersIn: " \t\"'`*_|.;"))
                let generic = ["serif", "sans-serif", "monospace", "system-ui", "inherit", "cursive"]
                guard name.count >= 2, name.count <= 40, !name.contains("#"), !name.contains("{"),
                      !generic.contains(name.lowercased()), !out.contains(name) else { continue }
                out.append(name)
                if out.count == 2 { return out }
            }
        }
        return out
    }

    static func template(for name: String) -> String {
        """
        # \(name) design system

        ## Colours
        - Background: #0B0B12
        - Foreground: #F5F5FA
        - Primary: #4F46E5
        - Accent: #F59E0B

        ## Typography
        - Display: Inter, bold, tight tracking
        - Body: Inter, regular

        ## Motion
        - Confident and smooth. Ease out, no bounce.
        - Cuts land on the beat; transitions under 0.5 s.

        ## Voice and logo
        - Tone: clear, warm, direct.
        - Logo: keep clear space equal to the mark's height.
        """
    }
}
