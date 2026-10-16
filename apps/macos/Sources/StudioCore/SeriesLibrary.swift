import Foundation

/// A note that applies to every episode of a series ("No captions"), saved with `from_film` so the owner can see where it
/// came from. The director injects the rules into crew briefs for this series only.
public struct SeriesRule: Equatable, Hashable, Sendable, Identifiable {
    public var id: String
    public var text: String
    public var fromFilm: String
    public var at: String
    public init(id: String, text: String, fromFilm: String = "", at: String = SeriesLibrary.stamp()) {
        self.id = id; self.text = text; self.fromFilm = fromFilm; self.at = at
    }
}

/// A series is a saved setup plus memory (replaces film templates): the format, shape, taste answers, brand, end card and
/// look every episode starts from, the notes the owner said apply to all of them, and the films made so far. It is a plain
/// folder, `<library>/Series/<slug>/series.json`, like a brand, so the skill reads it too (`scripts/series.mjs`).
/// Paths inside `series.json` are relative to the folder (the reference may be an absolute link to a large file).
public struct Series: Identifiable, Equatable, Sendable {
    public enum Length: Equatable, Sendable {
        /// Taken from the clip, never asked.
        case asClip
        case seconds(Int)
    }
    public var folder: URL
    public var name: String
    public var slug: String
    public var tile: String?
    public var option: String?
    public var aspect: String
    public var length: Length
    /// A standing brief (a migrated template's text); empty for a series saved from a film.
    public var brief: String
    public var preferences: [String: String]
    public var brand: String?
    /// `DESIGN.md` once an approved film's look is locked in, else nil.
    public var look: String?
    public var endingFile: String?
    public var reference: String?
    public var marks: [TasteResult.Mark]
    public var rules: [SeriesRule]
    public var episodes: [String]
    public var created: String
    public var modified: String

    public var id: URL { folder }
    public var ref: SeriesRef { SeriesRef(name: name, slug: slug, path: folder.path) }
    public var file: URL { folder.appendingPathComponent("series.json") }
    /// The locked look, when `DESIGN.md` is there.
    public var lookFile: URL? { look.map(resolve).flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0 : nil } }
    public var endingURL: URL? { endingFile.flatMap { $0.isEmpty ? nil : resolve($0) } }
    public var referenceURL: URL? { reference.flatMap { $0.isEmpty ? nil : resolve($0) } }
    /// A path stored in the file, made absolute against the series folder.
    public func resolve(_ path: String) -> URL {
        path.hasPrefix("/") ? URL(fileURLWithPath: path) : folder.appendingPathComponent(path)
    }

    /// One line for a card: what the series makes and how many episodes it has.
    public var summaryLine: String {
        let count = episodes.count
        return count == 0 ? "No episodes yet" : "\(count) episode\(count == 1 ? "" : "s")"
    }

    // MARK: Reading and writing series.json

    init?(folder: URL, object: [String: Any]) {
        guard let name = (object["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty else { return nil }
        self.folder = folder
        self.name = name
        slug = (object["slug"] as? String) ?? folder.lastPathComponent
        let format = object["format"] as? [String: Any]
        tile = format?["tile"] as? String
        option = format?["option"] as? String
        aspect = (object["aspect"] as? String) ?? "16:9"
        if let seconds = object["length"] as? Int { length = .seconds(seconds) }
        else if let seconds = object["length"] as? Double { length = .seconds(Int(seconds)) }
        else { length = .asClip }
        brief = (object["brief"] as? String) ?? ""
        preferences = (object["preferences"] as? [String: String]) ?? [:]
        brand = object["brand"] as? String
        look = object["look"] as? String
        endingFile = object["ending_file"] as? String
        reference = object["reference"] as? String
        marks = ((object["marks"] as? [[String: Any]]) ?? []).compactMap { box in
            func number(_ key: String) -> Double? { (box[key] as? NSNumber)?.doubleValue }
            guard let x = number("x"), let y = number("y"), let w = number("w"), let h = number("h") else { return nil }
            return TasteResult.Mark(x: x, y: y, w: w, h: h, presence: number("presence") ?? 1)
        }
        rules = ((object["rules"] as? [[String: Any]]) ?? []).compactMap { rule in
            guard let text = rule["text"] as? String else { return nil }
            return SeriesRule(id: (rule["id"] as? String) ?? UUID().uuidString, text: text, fromFilm: (rule["from_film"] as? String) ?? "", at: (rule["at"] as? String) ?? "")
        }
        episodes = (object["episodes"] as? [String]) ?? []
        created = (object["created"] as? String) ?? SeriesLibrary.stamp()
        modified = (object["modified"] as? String) ?? created
    }

    private func orNull(_ text: String?) -> Any { text.map { $0 as Any } ?? NSNull() }

    /// The JSON this series writes: every key the contract names (`null` where empty), in the contract's names.
    var object: [String: Any] {
        var format: [String: Any] = [:]
        if let tile { format["tile"] = tile }
        if let option { format["option"] = option }
        return [
            "version": 1, "name": name, "slug": slug, "format": format, "aspect": aspect,
            "length": { () -> Any in if case .seconds(let seconds) = length { return seconds } else { return "as-clip" } }(),
            "brief": brief, "preferences": preferences,
            "brand": orNull(brand), "look": orNull(look), "ending_file": orNull(endingFile), "reference": orNull(reference),
            "marks": marks.map { ["x": $0.x, "y": $0.y, "w": $0.w, "h": $0.h, "presence": $0.presence] },
            "rules": rules.map { ["id": $0.id, "text": $0.text, "from_film": $0.fromFilm, "at": $0.at] },
            "episodes": episodes, "created": created, "modified": modified,
        ]
    }
}

public enum SeriesLibrary {
    /// Above this a reference video is linked by its path instead of copied into the series folder.
    public static let copyLimit: Int64 = 200_000_000
    static let shapes = ["16:9", "9:16", "1:1"]

    public static func stamp(_ date: Date = Date()) -> String { ISO8601DateFormatter().string(from: date) }

    /// `<library root>/Series`, next to Brands, made when first needed.
    public static func folder(in libraryRoot: URL) -> URL {
        let url = libraryRoot.appendingPathComponent("Series", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    public static func list(in libraryRoot: URL) -> [Series] {
        let root = folder(in: libraryRoot)
        let items = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])) ?? []
        return items.compactMap { url in
            guard (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true else { return nil }
            return load(url)
        }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    public static func load(_ folder: URL) -> Series? {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent("series.json")),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        return Series(folder: folder, object: object)
    }

    /// Writes series.json, keeping any key this app does not know (the skill's scripts may add some). Stamps `modified`.
    @discardableResult
    public static func save(_ series: Series) throws -> Series {
        var series = series
        series.modified = stamp()
        try FileManager.default.createDirectory(at: series.folder, withIntermediateDirectories: true)
        var merged = (try? Data(contentsOf: series.file)).flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] } ?? [:]
        for (key, value) in series.object { merged[key] = value }
        let data = try JSONSerialization.data(withJSONObject: merged, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        try data.write(to: series.file, options: .atomic)
        return series
    }

    /// Makes a series from what is on the film's setup: the answers, brand, format, shape and length. Files are copied in.
    public static func create(name: String, format: FormatPick?, aspect: String, length: Series.Length, brief: String = "",
                              preferences: [String: String] = [:], brand: String? = nil, endingSource: URL? = nil,
                              referenceSource: URL? = nil, marks: [TasteResult.Mark] = [], in libraryRoot: URL) throws -> Series {
        let fm = FileManager.default
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let display = clean.isEmpty ? "Untitled series" : clean
        let root = folder(in: libraryRoot)
        let base = BrandLibrary.slug(display)
        var slug = base, n = 2
        while fm.fileExists(atPath: root.appendingPathComponent(slug).path) { slug = "\(base)-\(n)"; n += 1 }
        let target = root.appendingPathComponent(slug, isDirectory: true)
        try fm.createDirectory(at: target, withIntermediateDirectories: true)
        let now = stamp()
        var series = Series(folder: target, object: [
            "name": display, "slug": slug, "aspect": shapes.contains(aspect) ? aspect : "16:9", "created": now, "modified": now,
        ])!
        series.tile = format?.tile; series.option = format?.option
        if case .seconds(let seconds) = length { series.length = .seconds(min(600, max(5, seconds))) } else { series.length = .asClip }
        series.brief = brief.trimmingCharacters(in: .whitespacesAndNewlines)
        series.preferences = preferences
        series.brand = brand
        series.marks = marks
        if let endingSource { series.endingFile = try copy(endingSource, as: "end-card", into: target) }
        if let referenceSource { series.reference = try keepReference(referenceSource, in: target) }
        return try save(series)
    }

    /// Makes a series from a film's draft: "as-clip" length when the format is cut from one clip.
    public static func create(name: String, from draft: FilmDraft, lengthFromClip: Bool, referenceSource: URL? = nil,
                              marks: [TasteResult.Mark] = [], in libraryRoot: URL) throws -> Series {
        let ending = draft.preferences["ending"] == "card" ? draft.endingFile.map { URL(fileURLWithPath: $0) } : nil
        return try create(name: name, format: draft.format, aspect: draft.aspect, length: lengthFromClip ? .asClip : .seconds(draft.duration),
                          preferences: draft.preferences, brand: draft.brand, endingSource: ending, referenceSource: referenceSource,
                          marks: marks, in: libraryRoot)
    }

    public static func delete(_ series: Series) throws { try FileManager.default.removeItem(at: series.folder) }

    /// Copies a picked file into the folder as `<stem>.<ext>`, replacing an earlier one; returns the relative name.
    @discardableResult
    public static func copy(_ source: URL, as stem: String, into folder: URL) throws -> String {
        let fm = FileManager.default
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let name = source.pathExtension.isEmpty ? stem : "\(stem).\(source.pathExtension.lowercased())"
        let target = folder.appendingPathComponent(name)
        if source.standardizedFileURL == target.standardizedFileURL { return name }
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        for old in (try? fm.contentsOfDirectory(atPath: folder.path)) ?? [] where old.hasPrefix(stem + ".") { try? fm.removeItem(at: folder.appendingPathComponent(old)) }
        try fm.copyItem(at: source, to: target)
        return name
    }

    /// The reference edit: a copy in the folder, or a link by absolute path when it is larger than `copyLimit`.
    static func keepReference(_ source: URL, in folder: URL) throws -> String {
        let size = Int64((try? source.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        if size > copyLimit { return source.standardizedFileURL.path }
        return try copy(source, as: "reference", into: folder)
    }

    public static func setEnding(_ series: Series, from source: URL?) throws -> Series {
        var series = series
        series.endingFile = try source.map { try copy($0, as: "end-card", into: series.folder) }
        return try save(series)
    }
    public static func setReference(_ series: Series, from source: URL?) throws -> Series {
        var series = series
        series.reference = try source.map { try keepReference($0, in: series.folder) }
        return try save(series)
    }

    /// Records a film as an episode (its project path), once.
    @discardableResult
    public static func appendEpisode(_ episode: String, to series: Series) throws -> Series {
        guard !series.episodes.contains(episode) else { return series }
        var series = series
        series.episodes.append(episode)
        return try save(series)
    }
    /// Same, from a series reference on a draft (a series deleted since is ignored).
    public static func appendEpisode(_ episode: URL, to ref: SeriesRef) {
        guard let series = load(URL(fileURLWithPath: ref.path, isDirectory: true)) else { return }
        _ = try? appendEpisode(episode.path, to: series)
    }

    /// Locks the look: copies an approved film's DESIGN.md into the series.
    public static func setLook(_ series: Series, from design: URL) throws -> Series {
        guard FileManager.default.fileExists(atPath: design.path) else { throw CocoaError(.fileNoSuchFile) }
        var series = series
        let target = series.folder.appendingPathComponent("DESIGN.md")
        if design.standardizedFileURL != target.standardizedFileURL {
            try? FileManager.default.removeItem(at: target)
            try FileManager.default.copyItem(at: design, to: target)
        }
        series.look = "DESIGN.md"
        return try save(series)
    }

    /// A film in a series starts from its locked look: the series' DESIGN.md becomes the project's, the way a brand does. A
    /// project that already has a design of its own keeps it.
    public static func applyLook(of ref: SeriesRef, to project: URL) throws {
        guard let series = load(URL(fileURLWithPath: ref.path, isDirectory: true)), let look = series.lookFile else { return }
        let target = project.appendingPathComponent("DESIGN.md")
        guard !FileManager.default.fileExists(atPath: target.path) else { return }
        try FileManager.default.copyItem(at: look, to: target)
    }

    public static func addRule(_ text: String, fromFilm: String = "", to series: Series) throws -> Series {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return series }
        var series = series
        let next = (series.rules.compactMap { Int($0.id.dropFirst()) }.max() ?? 0) + 1
        series.rules.append(SeriesRule(id: "r\(next)", text: clean, fromFilm: fromFilm))
        return try save(series)
    }
    public static func removeRule(_ id: String, from series: Series) throws -> Series {
        var series = series
        series.rules.removeAll { $0.id == id }
        return try save(series)
    }

    // MARK: Templates

    /// Film templates become series with no episodes: name, brief, format, length, shape and brand are kept. A name that is
    /// already a series is left alone, so running this twice never doubles anything.
    @discardableResult
    public static func migrate(templates: [(name: String, draft: FilmDraft)], in libraryRoot: URL) -> [Series] {
        let existing = Set(list(in: libraryRoot).map { $0.name.lowercased() })
        var made: [Series] = []
        for template in templates where !existing.contains(template.name.lowercased()) {
            let draft = template.draft
            if let series = try? create(name: template.name, format: draft.format, aspect: draft.aspect, length: .seconds(draft.duration),
                                        brief: draft.brief, preferences: draft.preferences, brand: draft.brand, in: libraryRoot) { made.append(series) }
        }
        return made
    }
}

extension FilmDraft {
    /// Fills the draft from a series: format, shape, length (unless it comes from the clip), the standing brief (only into an
    /// empty brief), the taste answers, brand, end card and the series itself. The catalogue completes the format's noun.
    public mutating func apply(_ series: Series, catalog: FormatCatalog? = nil) {
        if let tile = series.tile, let option = series.option {
            let pick = FormatPick(tile: tile, option: option)
            format = catalog?.validated(pick) ?? pick
        }
        if SeriesLibrary.shapes.contains(series.aspect) { aspect = series.aspect }
        if case .seconds(let seconds) = series.length { duration = seconds }
        if brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { brief = series.brief }
        preferences = series.preferences
        brand = series.brand
        endingFile = series.preferences["ending"] == "card" ? series.endingURL?.path : nil
        self.series = series.ref
    }
}
