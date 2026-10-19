import Foundation

// A brand is DESIGN.md plus a managed set of assets: `<brand>/assets/{logos,fonts,media}/` and a manifest
// `assets/brand-assets.json` (see .context/brand-assets/SPEC.md). This file is the native side: the manifest model,
// the check.json cache, file operations and `apply` (the same project-side format as `brand-assets.mjs apply`).

// MARK: - Tolerant JSON helpers

struct DynamicKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(_ s: String) { stringValue = s }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

private struct Lossy<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

private extension KeyedDecodingContainer where K == DynamicKey {
    func string(_ key: String) -> String? { try? decodeIfPresent(String.self, forKey: DynamicKey(key)) }
    func int(_ key: String) -> Int? {
        if let v = try? decodeIfPresent(Int.self, forKey: DynamicKey(key)) { return v }
        if let v = try? decodeIfPresent(Double.self, forKey: DynamicKey(key)) { return Int(v) }
        if let s = string(key) { return Int(s) }
        return nil
    }
    func bool(_ key: String) -> Bool? { try? decodeIfPresent(Bool.self, forKey: DynamicKey(key)) }
    func strings(_ key: String) -> [String]? { try? decodeIfPresent([String].self, forKey: DynamicKey(key)) }
    func list<T: Decodable>(_ key: String, as: T.Type) -> [T] {
        ((try? decodeIfPresent([Lossy<T>].self, forKey: DynamicKey(key))) ?? nil)?.compactMap(\.value) ?? []
    }
    func extras(excluding known: Set<String>) -> [String: JSONValue] {
        var out: [String: JSONValue] = [:]
        for key in allKeys where !known.contains(key.stringValue) {
            if let v = try? decode(JSONValue.self, forKey: key) { out[key.stringValue] = v }
        }
        return out
    }
}

private extension KeyedEncodingContainer where K == DynamicKey {
    mutating func put<T: Encodable>(_ key: String, _ value: T?) throws { if let value { try encode(value, forKey: DynamicKey(key)) } }
    mutating func putExtras(_ extra: [String: JSONValue]) throws { for (k, v) in extra { try encode(v, forKey: DynamicKey(k)) } }
}

// MARK: - Manifest (brand-assets.json, version 1)

public struct BrandAssetSource: Codable, Equatable, Sendable {
    public var file: String?
    public var page: String?
    public init(file: String? = nil, page: String? = nil) { self.file = file; self.page = page }
}

public struct BrandLogo: Codable, Equatable, Identifiable, Sendable {
    public var id: String { file }
    public var file: String
    public var kind: String
    public var colourVersions: [String]
    public var primary: Bool
    public var source: BrandAssetSource?
    public var extra: [String: JSONValue] = [:]
    static let keys: Set<String> = ["file", "kind", "colour_versions", "primary", "source"]
    public init(file: String, kind: String = "mark", colourVersions: [String] = [], primary: Bool = false, source: BrandAssetSource? = nil) {
        self.file = file; self.kind = kind; self.colourVersions = colourVersions; self.primary = primary; self.source = source
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicKey.self)
        guard let file = c.string("file") else { throw DecodingError.dataCorruptedError(forKey: DynamicKey("file"), in: c, debugDescription: "logo without file") }
        self.file = file
        kind = c.string("kind") ?? "mark"
        colourVersions = c.strings("colour_versions") ?? []
        primary = c.bool("primary") ?? false
        source = (try? c.decodeIfPresent(BrandAssetSource.self, forKey: DynamicKey("source"))) ?? nil
        extra = c.extras(excluding: Self.keys)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: DynamicKey.self)
        try c.put("file", file); try c.put("kind", kind); try c.put("colour_versions", colourVersions)
        try c.put("primary", primary); try c.put("source", source); try c.putExtras(extra)
    }
}

public struct BrandFont: Codable, Equatable, Identifiable, Sendable {
    public var id: String { file }
    public var file: String
    public var family: String
    public var weight: Int
    public var style: String
    public var extra: [String: JSONValue] = [:]
    static let keys: Set<String> = ["file", "family", "weight", "style"]
    public init(file: String, family: String, weight: Int = 400, style: String = "normal") {
        self.file = file; self.family = family; self.weight = weight; self.style = style
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicKey.self)
        guard let file = c.string("file") else { throw DecodingError.dataCorruptedError(forKey: DynamicKey("file"), in: c, debugDescription: "font without file") }
        self.file = file
        family = c.string("family") ?? BrandAssets.guessFont(file).family
        weight = c.int("weight") ?? 400
        style = c.string("style") ?? "normal"
        extra = c.extras(excluding: Self.keys)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: DynamicKey.self)
        try c.put("file", file); try c.put("family", family); try c.put("weight", weight); try c.put("style", style); try c.putExtras(extra)
    }
}

public struct BrandMedia: Codable, Equatable, Identifiable, Sendable {
    public var id: String { file }
    public var file: String
    public var kind: String
    public var tags: [String]
    public var note: String
    public var extra: [String: JSONValue] = [:]
    static let keys: Set<String> = ["file", "kind", "tags", "note"]
    public init(file: String, kind: String = "image", tags: [String] = [], note: String = "") {
        self.file = file; self.kind = kind; self.tags = tags; self.note = note
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicKey.self)
        guard let file = c.string("file") else { throw DecodingError.dataCorruptedError(forKey: DynamicKey("file"), in: c, debugDescription: "media without file") }
        self.file = file
        kind = c.string("kind") ?? "image"
        tags = c.strings("tags") ?? []
        note = c.string("note") ?? ""
        extra = c.extras(excluding: Self.keys)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: DynamicKey.self)
        try c.put("file", file); try c.put("kind", kind); try c.put("tags", tags); try c.put("note", note); try c.putExtras(extra)
    }
}

/// A reference found in DESIGN.md that could not be resolved.
public struct BrandMissing: Codable, Equatable, Identifiable, Sendable {
    public var id: String { ref + "|" + `where` }
    public var ref: String
    public var `where`: String
    /// "logo", "font" or "media".
    public var `as`: String
    public var why: String
    public var extra: [String: JSONValue] = [:]
    static let keys: Set<String> = ["ref", "where", "as", "why"]
    public init(ref: String, where: String = "", as: String = "media", why: String = "") {
        self.ref = ref; self.where = `where`; self.as = `as`; self.why = why
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicKey.self)
        guard let ref = c.string("ref") else { throw DecodingError.dataCorruptedError(forKey: DynamicKey("ref"), in: c, debugDescription: "missing without ref") }
        self.ref = ref
        `where` = c.string("where") ?? ""
        `as` = c.string("as") ?? "media"
        why = c.string("why") ?? ""
        extra = c.extras(excluding: Self.keys)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: DynamicKey.self)
        try c.put("ref", ref); try c.put("where", `where`); try c.put("as", `as`); try c.put("why", why); try c.putExtras(extra)
    }
}

public struct BrandAssetManifest: Codable, Equatable, Sendable {
    public var version = 1
    public var logos: [BrandLogo] = []
    public var fonts: [BrandFont] = []
    public var media: [BrandMedia] = []
    public var missing: [BrandMissing] = []
    public var extra: [String: JSONValue] = [:]
    static let keys: Set<String> = ["version", "logos", "fonts", "media", "missing"]
    public init() {}
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicKey.self)
        version = c.int("version") ?? 1
        logos = c.list("logos", as: BrandLogo.self)
        fonts = c.list("fonts", as: BrandFont.self)
        media = c.list("media", as: BrandMedia.self)
        missing = c.list("missing", as: BrandMissing.self)
        extra = c.extras(excluding: Self.keys)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: DynamicKey.self)
        try c.put("version", version); try c.put("logos", logos); try c.put("fonts", fonts)
        try c.put("media", media); try c.put("missing", missing); try c.putExtras(extra)
    }
    public var isEmpty: Bool { logos.isEmpty && fonts.isEmpty && media.isEmpty && missing.isEmpty }
    /// The logo marked primary, else the first one.
    public var primaryLogo: BrandLogo? { logos.first { $0.primary } ?? logos.first }
    /// Exactly one primary when there are logos: the first marked one, else the first logo.
    mutating func normalizePrimary() {
        guard !logos.isEmpty else { return }
        let first = logos.firstIndex { $0.primary } ?? 0
        for i in logos.indices { logos[i].primary = i == first }
    }
}

public enum BrandAssetEntry: Equatable, Sendable {
    case logo(BrandLogo), font(BrandFont), media(BrandMedia)
    public var file: String {
        switch self { case .logo(let e): e.file; case .font(let e): e.file; case .media(let e): e.file }
    }
}

// MARK: - check.json (output of `brand-assets.mjs check`)

public struct BrandCheck: Decodable, Equatable, Sendable {
    public struct Colour: Equatable, Sendable { public var role: String; public var hex: String }
    public struct Fonts: Equatable, Sendable { public var display: String?; public var body: String?; public var mono: String? }
    public struct FontFile: Equatable, Sendable { public var weights: [Int]; public var local: Bool }
    public struct Logos: Equatable, Sendable { public var count: Int; public var primary: String?; public var problems: [String] }
    public var ok: Bool
    public var colors: [Colour]
    public var fonts: Fonts
    public var fontFiles: [String: FontFile]
    public var logos: Logos
    public var problems: [String]
    public var warnings: [String]
    public var isClean: Bool { problems.isEmpty && warnings.isEmpty }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicKey.self)
        ok = c.bool("ok") ?? false
        colors = ((try? c.decodeIfPresent([Lossy<Raw>].self, forKey: DynamicKey("colors"))) ?? nil)?.compactMap(\.value)
            .compactMap { r in r.hex.map { Colour(role: r.role ?? "", hex: $0) } } ?? []
        if let f = try? c.nestedContainer(keyedBy: DynamicKey.self, forKey: DynamicKey("fonts")) {
            func name(_ k: String) -> String? { f.string(k).flatMap { $0.isEmpty ? nil : $0 } }
            fonts = Fonts(display: name("display"), body: name("body"), mono: name("mono"))
        } else { fonts = Fonts() }
        var files: [String: FontFile] = [:]
        if let f = try? c.nestedContainer(keyedBy: DynamicKey.self, forKey: DynamicKey("font_files")) {
            for key in f.allKeys {
                guard let one = try? f.nestedContainer(keyedBy: DynamicKey.self, forKey: key) else { continue }
                files[key.stringValue] = FontFile(weights: one.list("weights", as: Int.self), local: one.bool("local") ?? false)
            }
        }
        fontFiles = files
        if let l = try? c.nestedContainer(keyedBy: DynamicKey.self, forKey: DynamicKey("logos")) {
            logos = Logos(count: l.int("count") ?? 0, primary: l.string("primary"), problems: l.strings("problems") ?? [])
        } else { logos = Logos(count: 0, primary: nil, problems: []) }
        problems = c.strings("problems") ?? []
        warnings = c.strings("warnings") ?? []
    }
    private struct Raw: Decodable {
        let role: String?; let hex: String?
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: DynamicKey.self)
            role = c.string("role"); hex = c.string("hex")
        }
    }
}

// MARK: - Operations

public enum BrandAssetError: LocalizedError {
    case unsupported(String), notInManifest, copyFailed(String)
    public var errorDescription: String? {
        switch self {
        case .unsupported(let what): what
        case .notInManifest: "That asset is no longer in the brand."
        case .copyFailed(let name): "Couldn’t copy \(name) into the brand."
        }
    }
}

public enum BrandAssets {
    public static let logoKinds = ["mark", "wordmark", "lockup", "app-icon"]
    public static let colourVersions = ["on-light", "on-dark", "mono", "reversed"]
    public static let mediaKinds = ["screenshot", "image", "icon", "video", "guideline"]
    public static let logoExtensions = ["svg", "png", "pdf", "webp", "jpg", "jpeg", "heic"]
    public static let fontExtensions = ["woff2", "woff", "ttf", "otf"]
    public static let mediaExtensions = ["png", "jpg", "jpeg", "webp", "gif", "heic", "svg", "ico", "mp4", "mov", "m4v", "webm", "pdf"]
    private static let lock = NSLock()

    public static func assetsDir(_ folder: URL) -> URL { folder.appendingPathComponent("assets", isDirectory: true) }
    public static func manifestURL(_ folder: URL) -> URL { assetsDir(folder).appendingPathComponent("brand-assets.json") }
    public static func checkURL(_ folder: URL) -> URL { assetsDir(folder).appendingPathComponent("check.json") }
    /// A manifest `file` ("logos/x.svg") as a file URL inside the brand.
    public static func url(_ file: String, in folder: URL) -> URL { assetsDir(folder).appendingPathComponent(file) }

    public static func loadManifest(_ folder: URL) -> BrandAssetManifest {
        guard let data = try? Data(contentsOf: manifestURL(folder)),
              var m = try? JSONDecoder().decode(BrandAssetManifest.self, from: data) else { return BrandAssetManifest() }
        m.normalizePrimary()
        return m
    }

    public static func saveManifest(_ manifest: BrandAssetManifest, in folder: URL) throws {
        var m = manifest; m.normalizePrimary()
        try FileManager.default.createDirectory(at: assetsDir(folder), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(m).write(to: manifestURL(folder), options: .atomic)
    }

    public static func loadCheck(_ folder: URL) -> BrandCheck? {
        guard let data = try? Data(contentsOf: checkURL(folder)) else { return nil }
        return try? JSONDecoder().decode(BrandCheck.self, from: data)
    }

    /// True when check.json exists and is not older than DESIGN.md (an edit in TextEdit makes it stale).
    public static func checkIsFresh(_ folder: URL) -> Bool {
        let fm = FileManager.default
        guard let c = (try? fm.attributesOfItem(atPath: checkURL(folder).path))?[.modificationDate] as? Date else { return false }
        guard let d = (try? fm.attributesOfItem(atPath: folder.appendingPathComponent("DESIGN.md").path))?[.modificationDate] as? Date else { return true }
        return c >= d.addingTimeInterval(-1)
    }

    /// Legacy `logo.<ext>` at the brand root becomes the primary mark in assets/logos/.
    public static func migrateLegacyLogo(in folder: URL) {
        lock.lock(); defer { lock.unlock() }
        let fm = FileManager.default
        guard let legacy = BrandLibrary.logoURL(in: folder) else { return }
        let dir = assetsDir(folder).appendingPathComponent("logos", isDirectory: true)
        guard (try? fm.createDirectory(at: dir, withIntermediateDirectories: true)) != nil else { return }
        let ext = legacy.pathExtension.lowercased()
        let name = uniqueName(base: "logo", ext: ext, in: dir)
        guard (try? fm.moveItem(at: legacy, to: dir.appendingPathComponent(name))) != nil else { return }
        var m = loadManifest(folder)
        for i in m.logos.indices { m.logos[i].primary = false }
        m.logos.insert(BrandLogo(file: "logos/" + name, kind: "mark", colourVersions: [], primary: true, source: BrandAssetSource(file: legacy.path, page: "legacy logo")), at: 0)
        try? saveManifest(m, in: folder)
    }

    // MARK: Adding

    @discardableResult
    public static func addLogo(_ file: URL, kind: String? = nil, colourVersions: [String]? = nil, primary: Bool? = nil, to folder: URL) throws -> BrandLogo {
        migrateLegacyLogo(in: folder)
        guard logoExtensions.contains(file.pathExtension.lowercased()) else { throw BrandAssetError.unsupported("Choose an SVG, PNG, PDF, WebP or JPEG logo.") }
        lock.lock(); defer { lock.unlock() }
        let name = try copyIn(file, subfolder: "logos", folder: folder)
        var m = loadManifest(folder)
        let entry = BrandLogo(file: "logos/" + name, kind: kind ?? guessLogoKind(name), colourVersions: colourVersions ?? guessColourVersions(name),
                              primary: primary ?? m.logos.isEmpty, source: BrandAssetSource(file: file.path, page: "added in Studio"))
        if entry.primary { for i in m.logos.indices { m.logos[i].primary = false } }
        m.logos.append(entry)
        try saveManifest(m, in: folder)
        return entry
    }

    @discardableResult
    public static func addFont(_ file: URL, to folder: URL) throws -> BrandFont {
        guard fontExtensions.contains(file.pathExtension.lowercased()) else { throw BrandAssetError.unsupported("Choose a WOFF2, WOFF, TTF or OTF font file.") }
        lock.lock(); defer { lock.unlock() }
        let name = try copyIn(file, subfolder: "fonts", folder: folder)
        let guess = guessFont(name)
        let entry = BrandFont(file: "fonts/" + name, family: guess.family, weight: guess.weight, style: guess.style)
        var m = loadManifest(folder)
        m.fonts.append(entry)
        try saveManifest(m, in: folder)
        return entry
    }

    @discardableResult
    public static func addMedia(_ file: URL, to folder: URL) throws -> BrandMedia {
        guard mediaExtensions.contains(file.pathExtension.lowercased()) else { throw BrandAssetError.unsupported("Choose an image, video or PDF.") }
        lock.lock(); defer { lock.unlock() }
        let name = try copyIn(file, subfolder: "media", folder: folder)
        let entry = BrandMedia(file: "media/" + name, kind: guessMediaKind(name))
        var m = loadManifest(folder)
        m.media.append(entry)
        try saveManifest(m, in: folder)
        return entry
    }

    // MARK: Changing

    public static func remove(_ entry: BrandAssetEntry, in folder: URL) throws {
        lock.lock(); defer { lock.unlock() }
        var m = loadManifest(folder)
        let before = m.logos.count + m.fonts.count + m.media.count
        switch entry {
        case .logo(let e): m.logos.removeAll { $0.file == e.file }
        case .font(let e): m.fonts.removeAll { $0.file == e.file }
        case .media(let e): m.media.removeAll { $0.file == e.file }
        }
        guard m.logos.count + m.fonts.count + m.media.count < before else { throw BrandAssetError.notInManifest }
        try saveManifest(m, in: folder)
        trash(url(entry.file, in: folder))
    }

    /// Writes the entry's editable fields (kind, colour versions, primary, family, weight, style, tags, note) by its file.
    public static func update(_ entry: BrandAssetEntry, in folder: URL) throws {
        lock.lock(); defer { lock.unlock() }
        var m = loadManifest(folder)
        switch entry {
        case .logo(let e):
            guard let i = m.logos.firstIndex(where: { $0.file == e.file }) else { throw BrandAssetError.notInManifest }
            var e = e
            if !logoKinds.contains(e.kind) { e.kind = m.logos[i].kind }
            if e.primary { for j in m.logos.indices { m.logos[j].primary = false } }
            m.logos[i] = e
        case .font(let e):
            guard let i = m.fonts.firstIndex(where: { $0.file == e.file }) else { throw BrandAssetError.notInManifest }
            var e = e
            e.family = e.family.trimmingCharacters(in: .whitespacesAndNewlines)
            if e.family.isEmpty { e.family = m.fonts[i].family }
            e.weight = min(900, max(100, e.weight)); if e.style != "italic" { e.style = "normal" }
            m.fonts[i] = e
        case .media(let e):
            guard let i = m.media.firstIndex(where: { $0.file == e.file }) else { throw BrandAssetError.notInManifest }
            var e = e
            if !mediaKinds.contains(e.kind) { e.kind = m.media[i].kind }
            m.media[i] = e
        }
        try saveManifest(m, in: folder)
    }

    /// Swaps the file behind an entry for another one (same entry, same settings), trashing the old file.
    public static func replace(_ entry: BrandAssetEntry, with file: URL, in folder: URL) throws {
        let ext = file.pathExtension.lowercased()
        let sub: String
        switch entry {
        case .logo: sub = "logos"; guard logoExtensions.contains(ext) else { throw BrandAssetError.unsupported("Choose an SVG, PNG, PDF, WebP or JPEG logo.") }
        case .font: sub = "fonts"; guard fontExtensions.contains(ext) else { throw BrandAssetError.unsupported("Choose a WOFF2, WOFF, TTF or OTF font file.") }
        case .media: sub = "media"; guard mediaExtensions.contains(ext) else { throw BrandAssetError.unsupported("Choose an image, video or PDF.") }
        }
        lock.lock(); defer { lock.unlock() }
        var m = loadManifest(folder)
        let name = try copyIn(file, subfolder: sub, folder: folder)
        let new = sub + "/" + name
        switch entry {
        case .logo(let e): guard let i = m.logos.firstIndex(where: { $0.file == e.file }) else { trash(url(new, in: folder)); throw BrandAssetError.notInManifest }; m.logos[i].file = new
        case .font(let e): guard let i = m.fonts.firstIndex(where: { $0.file == e.file }) else { trash(url(new, in: folder)); throw BrandAssetError.notInManifest }; m.fonts[i].file = new
        case .media(let e): guard let i = m.media.firstIndex(where: { $0.file == e.file }) else { trash(url(new, in: folder)); throw BrandAssetError.notInManifest }; m.media[i].file = new
        }
        try saveManifest(m, in: folder)
        trash(url(entry.file, in: folder))
    }

    /// Adds `file` as what the missing reference asked for, and drops that missing entry.
    @discardableResult
    public static func locate(missing: BrandMissing, with file: URL, in folder: URL) throws -> BrandAssetEntry {
        let entry: BrandAssetEntry
        switch missing.as {
        case "logo": entry = .logo(try addLogo(file, kind: guessLogoKind(missing.ref + " " + file.lastPathComponent), to: folder))
        case "font": entry = .font(try addFont(file, to: folder))
        default: entry = .media(try addMedia(file, to: folder))
        }
        lock.lock(); defer { lock.unlock() }
        var m = loadManifest(folder)
        m.missing.removeAll { $0.ref == missing.ref && $0.where == missing.where }
        try saveManifest(m, in: folder)
        return entry
    }

    /// Adds one file by what it is (used when a file is dropped on the page): fonts, logos or media by extension.
    @discardableResult
    public static func addAny(_ file: URL, to folder: URL) throws -> BrandAssetEntry {
        let ext = file.pathExtension.lowercased()
        if fontExtensions.contains(ext) { return .font(try addFont(file, to: folder)) }
        return .media(try addMedia(file, to: folder))
    }

    // MARK: Guessing

    /// Words of a file name: split on separators, camelCase and letter/digit edges ("IBMPlexSans-BoldItalic" -> IBM Plex Sans Bold Italic).
    static func words(_ name: String) -> [String] {
        var out: [String] = [], cur = ""
        let chars = Array(name)
        for (i, ch) in chars.enumerated() {
            guard ch.isLetter || ch.isNumber else { if !cur.isEmpty { out.append(cur); cur = "" }; continue }
            if let last = cur.last {
                let next = i + 1 < chars.count ? chars[i + 1] : nil
                let lowerToUpper = last.isLowercase && ch.isUppercase
                let acronymEnd = last.isUppercase && ch.isUppercase && (next?.isLowercase ?? false)
                let digitEdge = last.isNumber != ch.isNumber
                if lowerToUpper || acronymEnd || digitEdge { out.append(cur); cur = "" }
            }
            cur.append(ch)
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    static let weightWords: [String: Int] = [
        "thin": 100, "hairline": 100, "extralight": 200, "ultralight": 200, "light": 300, "regular": 400, "book": 400, "normal": 400,
        "roman": 400, "medium": 500, "semibold": 600, "demibold": 600, "bold": 700, "extrabold": 800, "ultrabold": 800, "black": 900, "heavy": 900]

    /// Family, weight and style from a font file name: "AcmeSans-BoldItalic.otf" -> ("Acme Sans", 700, "italic").
    public static func guessFont(_ fileName: String) -> (family: String, weight: Int, style: String) {
        let base = ((fileName as NSString).lastPathComponent as NSString).deletingPathExtension
        var w = words(base)
        let all = w
        var weight: Int?, italic = false
        while let last = w.last, w.count > 1 {
            let l = last.lowercased()
            if l == "italic" || l == "oblique" || l == "it" { italic = true; w.removeLast(); continue }
            if let n = Int(l), (100...900).contains(n), n % 100 == 0 { weight = weight ?? n; w.removeLast(); continue }
            var found = weightWords[l]
            var take = 1
            if w.count > 2, ["extra", "ultra", "semi", "demi"].contains(w[w.count - 2].lowercased()), let combo = weightWords[w[w.count - 2].lowercased() + l] { found = combo; take = 2 }
            if let found { weight = weight ?? found; w.removeLast(take); continue }
            if l == "variable" || l == "vf" { w.removeLast(); continue }
            break
        }
        if w.isEmpty { w = all }
        return (w.joined(separator: " "), weight ?? 400, italic ? "italic" : "normal")
    }

    public static func guessLogoKind(_ name: String) -> String {
        let lower = name.lowercased(), flat = lower.filter { $0.isLetter }
        if flat.contains("wordmark") || flat.contains("logotype") { return "wordmark" }
        if flat.contains("lockup") { return "lockup" }
        if flat.contains("appicon") || words(name).contains(where: { $0.lowercased() == "icon" }) { return "app-icon" }
        return "mark"
    }

    public static func guessColourVersions(_ name: String) -> [String] {
        let w = Set(words(name).map { $0.lowercased() })
        var out: [String] = []
        if w.contains("dark") { out.append("on-dark") }
        if w.contains("light") { out.append("on-light") }
        if w.contains("white") || w.contains("reversed") { out.append("reversed") }
        if w.contains("black") || w.contains("mono") { out.append("mono") }
        return out
    }

    public static func guessMediaKind(_ name: String) -> String {
        let ext = (name as NSString).pathExtension.lowercased(), lower = name.lowercased()
        if ext == "pdf" { return "guideline" }
        if ["mp4", "mov", "m4v", "webm"].contains(ext) { return "video" }
        if ext == "svg" || ext == "ico" || lower.contains("icon") { return "icon" }
        if lower.contains("screen") || lower.contains("shot") || words(name).contains(where: { $0.lowercased() == "ui" }) { return "screenshot" }
        return "image"
    }

    // MARK: Files

    static func sanitize(_ name: String) -> (base: String, ext: String) {
        let ns = name as NSString
        let ext = ns.pathExtension.lowercased().filter { $0.isLetter || $0.isNumber }
        var base = ""
        for ch in ns.deletingPathExtension {
            let ok = ch.isASCII && (ch.isLetter || ch.isNumber || ch == "." || ch == "_" || ch == "-")
            let c: Character = ok ? ch : "-"
            if c == "-", base.last == "-" { continue }
            base.append(c)
        }
        base = base.trimmingCharacters(in: CharacterSet(charactersIn: "-._"))
        return (base.isEmpty ? "file" : base, ext)
    }

    static func uniqueName(base: String, ext: String, in dir: URL, taken: Set<String> = []) -> String {
        let fm = FileManager.default
        func name(_ n: Int) -> String { (n == 1 ? base : "\(base)-\(n)") + (ext.isEmpty ? "" : "." + ext) }
        var n = 1
        while fm.fileExists(atPath: dir.appendingPathComponent(name(n)).path) || taken.contains(name(n).lowercased()) { n += 1 }
        return name(n)
    }

    /// Copies `file` into assets/<subfolder>/ under a sanitized, non-clashing name; returns that name.
    private static func copyIn(_ file: URL, subfolder: String, folder: URL) throws -> String {
        let fm = FileManager.default
        let dir = assetsDir(folder).appendingPathComponent(subfolder, isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        if file.deletingLastPathComponent().standardizedFileURL == dir.standardizedFileURL { return file.lastPathComponent }
        let s = sanitize(file.lastPathComponent)
        let name = uniqueName(base: s.base, ext: s.ext, in: dir)
        do { try fm.copyItem(at: file, to: dir.appendingPathComponent(name)) } catch { throw BrandAssetError.copyFailed(file.lastPathComponent) }
        return name
    }

    private static func trash(_ url: URL) {
        let fm = FileManager.default
        guard fm.fileExists(atPath: url.path) else { return }
        if (try? fm.trashItem(at: url, resultingItemURL: nil)) == nil { try? fm.removeItem(at: url) }
    }

    // MARK: Apply to a film project (same format as `brand-assets.mjs apply`)

    @discardableResult
    public static func apply(_ brand: Brand, to project: URL) throws -> (files: [String], removed: [String]) {
        let fm = FileManager.default
        let brandDir = project.appendingPathComponent("assets/brand", isDirectory: true)
        let fontsDir = project.appendingPathComponent("assets/fonts", isDirectory: true)
        let projectManifest = brandDir.appendingPathComponent("brand-assets.json")
        func inside(_ url: URL) -> Bool {
            let p = url.standardizedFileURL.path
            return p.hasPrefix(brandDir.standardizedFileURL.path + "/") || p.hasPrefix(fontsDir.standardizedFileURL.path + "/")
        }

        // 1. DESIGN.md (a different one already there is kept as DESIGN.previous[-n].md).
        let dest = project.appendingPathComponent("DESIGN.md")
        if fm.fileExists(atPath: dest.path) {
            if fm.contentsEqual(atPath: dest.path, andPath: brand.designFile.path) { try fm.removeItem(at: dest) }
            else {
                var n = 1
                func backup(_ n: Int) -> URL { project.appendingPathComponent(n == 1 ? "DESIGN.previous.md" : "DESIGN.previous-\(n).md") }
                while fm.fileExists(atPath: backup(n).path) { n += 1 }
                try fm.moveItem(at: dest, to: backup(n))
            }
        }
        try fm.copyItem(at: brand.designFile, to: dest)

        // 2. Stale cleanup: exactly the files a previous apply listed under assets/brand and assets/fonts.
        var removed: [String] = []
        if let data = try? Data(contentsOf: projectManifest),
           let old = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           let listed = old["applied_files"] as? [String] {
            for rel in listed {
                let url = project.appendingPathComponent(rel)
                guard inside(url), fm.fileExists(atPath: url.path) else { continue }
                if (try? fm.removeItem(at: url)) != nil { removed.append(rel) }
            }
        }

        let manifest = loadManifest(brand.folder)
        var files: [String] = []
        var out = manifest
        try fm.createDirectory(at: brandDir, withIntermediateDirectories: true)

        // 3. Logos (primary first) and logos.json.
        let logos = manifest.logos.sorted { $0.primary && !$1.primary }
        var logoRows: [[String: Any]] = []
        out.logos = []
        for logo in logos {
            let src = url(logo.file, in: brand.folder)
            guard fm.fileExists(atPath: src.path) else { continue }
            let base = src.lastPathComponent
            let target = brandDir.appendingPathComponent(base)
            if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
            try fm.copyItem(at: src, to: target)
            files.append("assets/brand/" + base)
            logoRows.append(["file": base, "kind": logo.kind, "colour_versions": logo.colourVersions, "primary": logo.primary,
                             "source": ["file": src.path, "page": "user brand kit"]])
            var e = logo; e.file = "assets/brand/" + base; out.logos.append(e)
        }
        let logosJSON: Any = logoRows.isEmpty
            ? ["none": true, "why": "the user's brand has no logo file", "searched": [String]()] as [String: Any] : logoRows
        try writeJSON(logosJSON, to: brandDir.appendingPathComponent("logos.json"))
        files.append("assets/brand/logos.json")

        // 4. Fonts as <Compact>-<weight>[-italic].<ext> and fonts.json.
        var fontRows: [[String: Any]] = []
        out.fonts = []
        var used = Set<String>()
        for font in manifest.fonts {
            let src = url(font.file, in: brand.folder)
            guard fm.fileExists(atPath: src.path) else { continue }
            if fontRows.isEmpty { try fm.createDirectory(at: fontsDir, withIntermediateDirectories: true) }
            let compact = String(font.family.filter { $0.isLetter || $0.isNumber })
            let stem = "\(compact.isEmpty ? "Font" : compact)-\(font.weight)" + (font.style == "italic" ? "-italic" : "")
            let name = uniqueName(base: stem, ext: src.pathExtension.lowercased(), in: URL(fileURLWithPath: "/nonexistent"), taken: used)
            used.insert(name.lowercased())
            let target = fontsDir.appendingPathComponent(name)
            if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
            try fm.copyItem(at: src, to: target)
            files.append("assets/fonts/" + name)
            fontRows.append(["family": font.family, "weight": font.weight, "style": font.style, "file": name])
            var e = font; e.file = "assets/fonts/" + name; out.fonts.append(e)
        }
        if !fontRows.isEmpty {
            try writeJSON(fontRows, to: fontsDir.appendingPathComponent("fonts.json"))
            files.append("assets/fonts/fonts.json")
        }

        // 5. Media.
        out.media = []
        for item in manifest.media {
            let src = url(item.file, in: brand.folder)
            guard fm.fileExists(atPath: src.path) else { continue }
            let mediaDir = brandDir.appendingPathComponent("media", isDirectory: true)
            try fm.createDirectory(at: mediaDir, withIntermediateDirectories: true)
            let target = mediaDir.appendingPathComponent(src.lastPathComponent)
            if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
            try fm.copyItem(at: src, to: target)
            files.append("assets/brand/media/" + src.lastPathComponent)
            var e = item; e.file = "assets/brand/media/" + src.lastPathComponent; out.media.append(e)
        }

        // 6. The project's manifest: the brand's, with project-relative paths, origin and everything written.
        out.extra["origin"] = .string("user")
        out.extra["brand"] = .string(brand.name)
        out.extra["applied_files"] = .array(files.map { .string($0) })
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(out).write(to: projectManifest, options: .atomic)
        return (files, removed)
    }

    private static func writeJSON(_ object: Any, to url: URL) throws {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        try data.write(to: url, options: .atomic)
    }
}
