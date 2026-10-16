import Foundation

/// The manifest's story-role tag. Moves have no fixed roles any more: it survives only as a search hint and for reading old briefs.
public enum MomentRole: String, CaseIterable, Identifiable, Codable, Sendable {
    case hook, proof, turn, cta
    public var id: String { rawValue }
    public var title: String {
        switch self { case .hook: "Hook"; case .proof: "Proof"; case .turn: "Turn"; case .cta: "Call to action" }
    }
    /// The short form used on chips and badges.
    public var shortTitle: String { self == .cta ? "CTA" : title }
}

public struct MomentCreator: Equatable, Hashable, Sendable {
    public var handle: String
    public var name: String
    /// The original post (X, YouTube or Instagram), when the manifest gives one.
    public var url: URL?
    public var avatar: URL?
    public init(handle: String, name: String, url: URL? = nil, avatar: URL? = nil) {
        self.handle = handle; self.name = name; self.url = url; self.avatar = avatar
    }
    /// "OpusClip" for a row credited to "@OpusClip".
    public var displayName: String { name.isEmpty ? handle.trimmingCharacters(in: CharacterSet(charactersIn: "@")) : name }
}

/// One short slice of someone else's launch film, shown in the Get inspired gallery.
public struct Moment: Identifiable, Equatable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var role: MomentRole?
    public var mechanic: [String]
    public var swapSlot: [String]
    public var why: String
    public var duration: Double
    public var clipURL: URL
    public var stillURL: URL
    public var creator: MomentCreator?
    /// The manifest's `added` date (yyyy-MM-dd), when it has one.
    public var added: String?
    public var isNew: Bool
    public var featured: Bool

    public init(id: String, name: String, role: MomentRole? = nil, mechanic: [String] = [], swapSlot: [String] = [], why: String = "", duration: Double = 0,
                clipURL: URL, stillURL: URL, creator: MomentCreator? = nil, added: String? = nil, isNew: Bool = false, featured: Bool = false) {
        self.id = id; self.name = name; self.role = role; self.mechanic = mechanic; self.swapSlot = swapSlot; self.why = why; self.duration = duration
        self.clipURL = clipURL; self.stillURL = stillURL; self.creator = creator; self.added = added; self.isNew = isNew; self.featured = featured
    }
    /// "By OpusClip", or nil when nobody is credited.
    public var creditLine: String? { creator.map { "By \($0.displayName)" } }
    public func asFilmMoment(place: MomentPlace = .anywhere) -> FilmMoment { FilmMoment(id: id, place: place) }
    /// The technique groups this move belongs to, in a stable order.
    public var techniques: [Technique] { Technique.groups(for: mechanic) }
    /// Everything a search box should match: name, why, tags, technique names, creator and the role hint.
    public var searchText: String {
        ([name, why, creator?.displayName ?? "", creator?.handle ?? "", role?.title ?? ""] + mechanic.map(Moment.mechanicTitle) + techniques.map(\.title)).joined(separator: " ").lowercased()
    }
    /// "Mask reveal" for `mask_reveal`.
    public static func mechanicTitle(_ tag: String) -> String {
        let words = tag.replacingOccurrences(of: "_", with: " ").trimmingCharacters(in: .whitespaces)
        let titled = words.prefix(1).uppercased() + words.dropFirst()
        return titled.replacingOccurrences(of: "Ui ", with: "UI ").replacingOccurrences(of: "Cta", with: "CTA")
    }
}

/// Plain-named technique groups over the manifest's `mechanic` tags, for the gallery's filters.
public enum Technique: String, CaseIterable, Identifiable, Sendable {
    case kineticType, uiAndCursor, revealsAndMasks, transitions, numbers, cameraAnd3D, collageAndPhoto, layoutAndMotion, lineAndShape, other
    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .kineticType: "Kinetic type"; case .uiAndCursor: "UI and cursor"; case .revealsAndMasks: "Reveals and masks"
        case .transitions: "Transitions"; case .numbers: "Numbers and counters"; case .cameraAnd3D: "Camera and 3D"
        case .collageAndPhoto: "Collage and photo"; case .layoutAndMotion: "Layout and motion"; case .lineAndShape: "Line and shape"; case .other: "More"
        }
    }
    /// The first matching group for a tag; unknown tags land in More.
    public static func group(for tag: String) -> Technique {
        let t = tag.lowercased()
        func has(_ words: [String]) -> Bool { words.contains { t.contains($0) } }
        if has(["counter", "number", "stat", "odometer", "ticker", "count"]) { return .numbers }
        if has(["cursor", "click", "ui_", "ui-", "interface", "screen", "app_", "dashboard", "chat"]) || t == "ui" { return .uiAndCursor }
        if has(["mask", "reveal", "wipe", "clip_path", "unveil"]) { return .revealsAndMasks }
        if has(["transition", "hard_cut", "cut", "whip", "morph_cut", "match", "dissolve", "zoom_through"]) { return .transitions }
        if has(["camera", "3d", "orbit", "dolly", "parallax", "depth", "perspective", "push", "pan"]) { return .cameraAnd3D }
        if has(["collage", "photo", "image", "cutout", "scrapbook", "sticker", "polaroid", "footage", "video"]) { return .collageAndPhoto }
        if has(["type", "text", "glyph", "scramble", "typewriter", "headline", "word", "letter", "caption", "font"]) { return .kineticType }
        if has(["line", "draw", "stroke", "path", "shape", "icon", "svg", "logo"]) { return .lineAndShape }
        if has(["layout", "stagger", "grid", "card", "deal", "stack", "motion"]) { return .layoutAndMotion }
        return .other
    }
    public static func groups(for tags: [String]) -> [Technique] {
        let found = Set(tags.map(group(for:)))
        return allCases.filter { found.contains($0) }
    }
}

/// Up to four moves the user likes, in the order they were added, each with an optional place.
public struct MomentSelection: Equatable, Sendable {
    public private(set) var picks: [FilmMoment]
    public init(_ moments: [FilmMoment] = []) {
        picks = []
        for moment in moments { _ = set(moment) }
    }
    public var count: Int { picks.count }
    public var isEmpty: Bool { picks.isEmpty }
    public var isFull: Bool { picks.count >= FilmDraft.maxMoments }
    public func contains(_ id: String) -> Bool { picks.contains { $0.id == id } }
    public func pick(_ id: String) -> FilmMoment? { picks.first { $0.id == id } }
    /// Adds the moment, or removes it when it is already picked. Returns false when a fifth was refused.
    @discardableResult public mutating func toggle(_ moment: Moment) -> Bool {
        if contains(moment.id) { remove(moment.id); return true }
        return set(moment.asFilmMoment())
    }
    /// Adds (or updates) a pick; refuses a new one beyond four.
    @discardableResult public mutating func set(_ moment: FilmMoment) -> Bool {
        if let index = picks.firstIndex(where: { $0.id == moment.id }) { picks[index] = moment; return true }
        guard !isFull else { return false }
        picks.append(moment)
        return true
    }
    public mutating func setPlace(_ place: MomentPlace, for id: String) {
        if let index = picks.firstIndex(where: { $0.id == id }) { picks[index].place = place }
    }
    public mutating func remove(_ id: String) { picks.removeAll { $0.id == id } }
    public mutating func clear() { picks = [] }
}

public enum MomentCatalog {
    public static let manifestURL = URL(string: "https://static.heygen.ai/hyperframes-oss/desktop/moments/v3/manifest.json")!
    /// Without a newness signal in the manifest, the newest this many rows (by manifest order) count as new.
    static let fallbackNewCount = 12
    /// Rows added within this many days of the newest row count as new.
    static let newWindowDays = 2

    /// `~/Library/Caches/<bundle id>/moments`.
    public static var defaultCacheDirectory: URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent(Bundle.main.bundleIdentifier ?? "ai.rasan.studio", isDirectory: true).appendingPathComponent("moments", isDirectory: true)
    }

    /// Reads the manifest tolerantly: unknown fields are ignored; rows with no clip or still, or hidden
    /// by `on_page: "no…"` are skipped. Returns the moments newest first (featured rows lead).
    public static func parse(_ data: Data, baseURL: URL = manifestURL) -> [Moment] {
        guard let root = try? JSONSerialization.jsonObject(with: data) else { return [] }
        let rows: [Any]
        if let list = root as? [Any] { rows = list }
        else if let object = root as? [String: Any], let list = (object["moments"] ?? object["items"]) as? [Any] { rows = list }
        else { return [] }
        var moments: [Moment] = []
        var seen = Set<String>()
        for case let row as [String: Any] in rows {
            guard let id = (row["id"] as? String)?.trimmingCharacters(in: .whitespaces), !id.isEmpty, !seen.contains(id),
                  let clip = (row["clip"] as? String).flatMap({ resolve($0, base: baseURL) }),
                  let still = (row["still"] as? String).flatMap({ resolve($0, base: baseURL) }) else { continue }
            if let onPage = (row["on_page"] as? String)?.lowercased(), onPage.hasPrefix("no") { continue }
            let roleText = (row["role"] as? String)?.lowercased()
            let role = roleText.flatMap { MomentRole(rawValue: $0) }
            if roleText != nil, role == nil { continue }   // a-roll and other non-moment rows
            let name = (row["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !name.isEmpty else { continue }
            seen.insert(id)
            let handle = (row["author_handle"] as? String) ?? ""
            let authorName = (row["x_author_name"] as? String) ?? ""
            let post = ((row["x_url"] as? String) ?? (row["source_url"] as? String)).flatMap { postURL($0) }
            let creator: MomentCreator? = (handle.isEmpty && authorName.isEmpty) ? nil
                : MomentCreator(handle: handle, name: authorName, url: post, avatar: (row["x_avatar"] as? String).flatMap { resolve($0, base: baseURL) })
            moments.append(Moment(id: id, name: name, role: role, mechanic: strings(row["mechanic"]), swapSlot: strings(row["swap_slot"]),
                                  why: (row["why"] as? String) ?? "", duration: (row["duration_s"] as? NSNumber)?.doubleValue ?? 0,
                                  clipURL: clip, stillURL: still, creator: creator, added: (row["added"] as? String).flatMap { $0.isEmpty ? nil : $0 },
                                  featured: (row["featured"] as? NSNumber)?.boolValue ?? false))
        }
        return markNew(moments)
    }

    /// Flags the newest rows and returns the moments newest first (featured lead); the manifest's own order breaks ties.
    static func markNew(_ input: [Moment]) -> [Moment] {
        var moments = input
        // Parse each date once. Creating formatters inside the sort comparator made a large gallery expensive to open.
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(identifier: "UTC"); formatter.dateFormat = "yyyy-MM-dd"
        let dates = moments.map { moment in
            moment.added.flatMap { formatter.date(from: String($0.prefix(10))) }
        }
        if let newest = dates.compactMap({ $0 }).max() {
            let cutoff = newest.addingTimeInterval(-Double(newWindowDays) * 86_400)
            for index in moments.indices { moments[index].isNew = dates[index].map { $0 >= cutoff } ?? false }
        } else {
            for index in moments.indices.suffix(fallbackNewCount) { moments[index].isNew = true }
        }
        let indexed = Array(moments.enumerated())
        return indexed.sorted { a, b in
            if a.element.featured != b.element.featured { return a.element.featured }
            let da = dates[a.offset], db = dates[b.offset]
            if let da, let db, da != db { return da > db }
            if (da == nil) != (db == nil) { return da != nil }
            return da == nil ? a.offset > b.offset : a.offset < b.offset
        }.map(\.element)
    }

    private static func strings(_ value: Any?) -> [String] { (value as? [Any])?.compactMap { $0 as? String } ?? [] }
    /// Paths in the manifest are relative to the manifest URL; only http(s) and file URLs are accepted.
    static func resolve(_ path: String, base: URL) -> URL? {
        let text = path.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty, let url = URL(string: text, relativeTo: base)?.absoluteURL else { return nil }
        let scheme = url.scheme?.lowercased()
        return scheme == "https" || scheme == "http" || scheme == "file" ? url : nil
    }
    /// Only web links to a post are kept, so a credit can never open anything else.
    static func postURL(_ text: String) -> URL? {
        guard let url = URL(string: text.trimmingCharacters(in: .whitespaces)), let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http", url.host != nil else { return nil }
        return url
    }

    // MARK: Loading

    public enum Source: Equatable, Sendable { case network, cache }
    public struct Loaded: Sendable { public var moments: [Moment]; public var source: Source }

    /// The saved manifest, parsed. Empty when nothing is saved yet.
    public static func loadCached(in directory: URL = defaultCacheDirectory) -> [Moment] {
        (try? Data(contentsOf: directory.appendingPathComponent("manifest.json"))).map { parse($0) } ?? []
    }
    /// Fetches the manifest (about 100 KB) and saves it for offline use. When the network fails, falls back to the saved copy;
    /// throws only when there is nothing to show.
    public static func load(session: URLSession = .shared, url: URL = manifestURL, cacheDirectory: URL = defaultCacheDirectory) async throws -> Loaded {
        do {
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await session.data(for: request)
            guard (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true else { throw URLError(.badServerResponse) }
            let moments = parse(data, baseURL: url)
            guard !moments.isEmpty else { throw URLError(.cannotParseResponse) }
            try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
            try? data.write(to: cacheDirectory.appendingPathComponent("manifest.json"), options: .atomic)
            return Loaded(moments: moments, source: .network)
        } catch {
            let cached = loadCached(in: cacheDirectory)
            if !cached.isEmpty { return Loaded(moments: cached, source: .cache) }
            throw error
        }
    }
}

/// Stills and avatars: web images are saved under the cache folder the first time they are shown, so the gallery opens fast
/// and works offline afterwards. File URLs pass straight through.
public enum MomentImageCache {
    public static let defaultDirectory = MomentCatalog.defaultCacheDirectory.appendingPathComponent("images", isDirectory: true)

    public static func localURL(for remote: URL, session: URLSession = .shared, directory: URL = defaultDirectory) async -> URL? {
        if remote.isFileURL { return FileManager.default.fileExists(atPath: remote.path) ? remote : nil }
        guard let scheme = remote.scheme?.lowercased(), scheme == "https" || scheme == "http" else { return nil }
        let target = directory.appendingPathComponent(fileName(for: remote))
        if FileManager.default.fileExists(atPath: target.path) { return target }
        do {
            var request = URLRequest(url: remote, timeoutInterval: 15)
            request.setValue("image/*", forHTTPHeaderField: "Accept")
            let (data, response) = try await session.data(for: request)
            guard (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true, !data.isEmpty else { return nil }
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: target, options: .atomic)
            return target
        } catch { return nil }
    }
    /// A readable file name: "M964-still.jpg" from ".../M964/still.jpg".
    static func fileName(for url: URL) -> String {
        url.pathComponents.filter { $0 != "/" }.suffix(2)
            .map { $0.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "_", options: .regularExpression) }
            .joined(separator: "-")
    }
}
