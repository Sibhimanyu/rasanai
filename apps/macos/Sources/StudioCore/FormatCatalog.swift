import Foundation

/// "What are you making?": the catalogue of formats (tiles and their options) from `skills/rasanai/library/formats.json`,
/// the one source of truth shared with the web console and the director (`scripts/formats.mjs`). Decoding is lenient:
/// fields Studio does not draw are ignored, so the skill can grow the file without breaking the app.
public struct FormatCatalog: Decodable, Equatable, Sendable {
    public var version: Int
    public var scopes: [String: String]
    public var inputs: [String: InputKind]
    public var tiles: [Tile]
    public var options: [Option]

    public struct InputKind: Decodable, Equatable, Sendable {
        public var prompt: String
        public var accepts: [String]
    }

    public struct Tile: Decodable, Equatable, Sendable, Identifiable {
        public var id: String
        public var title: String
        public var description: String
        /// A sentence describing the tile's thumbnail animation (used as the tile's tooltip and accessibility hint).
        public var thumbnail: String
        public var group: String
        public var `default`: String
        public var options: [String]
        public var keywords: [String]?
    }

    public enum Status: String, Decodable, Sendable { case ready, partial, soon }

    public struct Soon: Decodable, Equatable, Sendable {
        public var missing: String
        public var nearest: String?
    }

    public struct Scope: Decodable, Equatable, Sendable, Identifiable {
        public var scope: String
        public var label: String
        public var description: String?
        public var id: String { scope }
    }

    public struct ScopeQuestion: Decodable, Equatable, Sendable {
        public var question: String
        public var options: [Scope]
        public var unsure: String
    }

    public struct OptionInput: Decodable, Equatable, Sendable {
        public var id: String
        public var required: Bool?
        public var prompt: String?
    }

    public struct Option: Decodable, Equatable, Sendable, Identifiable {
        public var id: String
        public var tile: String
        public var title: String
        public var kind: String
        public var description: String
        public var status: Status
        public var partial: String?
        public var soon: Soon?
        public var inputs: [OptionInput]
        public var scopeDefault: String?
        public var scopeQuestion: ScopeQuestion?
        public var lengthSeconds: Int?
        public var aspect: String
        public var keywords: [String]?

        private enum CodingKeys: String, CodingKey {
            case id, tile, title, kind, description, status, partial, soon, inputs, aspect, keywords
            case scopeDefault = "scope_default", scopeQuestion = "scope_question", lengthSeconds = "length_s"
        }
    }

    /// One thing the picked option asks for (a link, a folder of clips, a script, a track), with the words to show.
    public struct InputSlot: Equatable, Sendable, Identifiable {
        public var id: String
        public var prompt: String
        public var accepts: [String]
        public var required: Bool
        public var takesFolder: Bool { accepts.contains("folder") }
        public var takesText: Bool { accepts.contains("text") || accepts.contains("url") }
    }

    // MARK: Lookup

    public func option(_ id: String?) -> Option? { id.flatMap { id in options.first { $0.id == id } } }
    public func tile(_ id: String?) -> Tile? { id.flatMap { id in tiles.first { $0.id == id } } }
    public func options(in tile: Tile) -> [Option] { tile.options.compactMap(option) }
    /// The option's nearest working neighbour when it is coming soon.
    public func nearest(of option: Option) -> Option? { self.option(option.soon?.nearest) }

    /// What the option asks the person for, required first. Its own prompt wins over the shared one for the kind.
    public func inputSlots(for option: Option) -> [InputSlot] {
        option.inputs.map { input in
            let base = inputs[input.id]
            return InputSlot(id: input.id, prompt: input.prompt ?? base?.prompt ?? "", accepts: base?.accepts ?? [], required: input.required == true)
        }
        .sorted { $0.required && !$1.required }
    }
    /// The slot that takes the place of "what it's about" (the first required input that is typed, else any typed one).
    public func subjectPrompt(for option: Option) -> String? {
        let slots = inputSlots(for: option)
        return (slots.first { $0.required && $0.takesText } ?? slots.first { $0.takesText })?.prompt
    }
    /// The prompt shown in the footage well when the option wants a folder of clips.
    public func folderPrompt(for option: Option) -> String? { inputSlots(for: option).first { $0.takesFolder }?.prompt }

    /// The "many uses or one job?" question, only for options that ask one (feature launch).
    public func scopeQuestion(for option: Option) -> ScopeQuestion? { option.scopeQuestion }

    /// Resolves a pick, validating it against this catalogue (an unknown option is dropped; a scope the option does
    /// not ask about is kept only when it is one of the known scopes).
    public func validated(_ pick: FormatPick?) -> FormatPick? {
        guard var pick, let option = option(pick.option) else { return nil }
        pick.tile = option.tile
        pick.kind = option.kind
        if let scope = pick.scope, scopes[scope] == nil { pick.scope = nil }
        return pick
    }

    /// Picks an option: sets `kind`, and moves length and shape to the option's defaults unless the person already
    /// changed them (a value still equal to the previous option's default, or to the New film default, is untouched).
    public func pick(_ option: Option, in draft: inout FilmDraft, previous: Option? = nil, why: String? = nil) {
        let scope = option.scopeQuestion == nil ? option.scopeDefault : nil
        draft.format = FormatPick(tile: option.tile, option: option.id, scope: scope, kind: option.kind, why: why)
        if let length = option.lengthSeconds, draft.duration == (previous?.lengthSeconds ?? 45) { draft.duration = length }
        let shapes = ["16:9", "9:16", "1:1"]
        let before = previous.flatMap { shapes.contains($0.aspect) ? $0.aspect : nil } ?? "16:9"
        if shapes.contains(option.aspect), draft.aspect == before { draft.aspect = option.aspect }
    }

    // MARK: Loading

    public static func decode(_ data: Data) throws -> FormatCatalog { try JSONDecoder().decode(FormatCatalog.self, from: data) }

    /// The installed skill's `library/formats.json` (the same folder the app finds the rest of the skill in), else
    /// the fallback file, else nil (the old kind menu then stays).
    public static func load(engine: URL?, fallback: URL? = nil) -> FormatCatalog? {
        let candidates = [engine?.appendingPathComponent("library/formats.json"), fallback].compactMap { $0 }
        for url in candidates {
            if let data = try? Data(contentsOf: url), let catalog = try? decode(data), !catalog.tiles.isEmpty { return catalog }
        }
        return nil
    }
}

/// The format picked for a film: `format: {tile, option, scope?}` in `rasanai-brief.json` and in the brief submit.
/// `kind` (the option's noun) is kept for back-compat with directors that read only `kind`. `why` is the reason a
/// pre-selected chip shows; it is not written to the brief file.
public struct FormatPick: Codable, Equatable, Hashable, Sendable {
    public var tile: String
    public var option: String
    public var scope: String?
    public var kind: String?
    public var why: String?

    public init(tile: String, option: String, scope: String? = nil, kind: String? = nil, why: String? = nil) {
        self.tile = tile; self.option = option; self.scope = scope; self.kind = kind; self.why = why
    }
    private enum CodingKeys: String, CodingKey { case tile, option, scope, kind }

    /// From a brief payload or submit value (`{tile, option, why?, scope?}`).
    public init?(json: JSONValue) {
        guard let tile = json["tile"].string, let option = json["option"].string, !tile.isEmpty, !option.isEmpty else { return nil }
        self.init(tile: tile, option: option, scope: json["scope"].string, kind: json["kind"].string, why: json["why"].string)
    }
    /// What the brief submit and the brief file carry: `{tile, option, scope?}`.
    public var json: JSONValue {
        var out: [String: JSONValue] = ["tile": .string(tile), "option": .string(option)]
        if let scope { out["scope"] = .string(scope) }
        return .object(out)
    }
}

// MARK: Matching

/// Pre-selects a tile and option from the person's words and what they dropped. The same rules as
/// `matchFormat` in `skills/rasanai/scripts/lib/formats.mjs`: an option's own keywords score more than its tile's,
/// a link is a launch unless it is a pull request, and a dropped folder or file is read by name and by the kinds of
/// files inside (never their contents).
public extension FormatCatalog {
    struct Match: Equatable, Sendable {
        public var tile: String
        public var option: String
        public var why: String
        public var confident: Bool
    }

    func match(request: String, paths: [URL] = []) -> Match? {
        let text = " " + request.lowercased() + " "
        var score: [String: (score: Int, why: [String])] = [:]
        let known = Set(options.map(\.id))
        func bump(_ id: String, _ n: Int, _ why: String) {
            guard known.contains(id) else { return }
            var entry = score[id] ?? (0, [])
            entry.score += n
            if !entry.why.contains(why) { entry.why.append(why) }
            score[id] = entry
        }
        for option in options { for key in option.keywords ?? [] where Self.phrase(key, in: text) { bump(option.id, 3 + Self.words(key), "you said \"\(key)\"") } }
        for tile in tiles { for key in tile.keywords ?? [] where Self.phrase(key, in: text) { bump(tile.default, 1 + Self.words(key), "you said \"\(key)\"") } }
        let urls = request.split(whereSeparator: { $0.isWhitespace }).map(String.init).filter { $0.lowercased().hasPrefix("http://") || $0.lowercased().hasPrefix("https://") }
        for url in urls {
            let lower = url.lowercased()
            if lower.range(of: #"github\.com/[^/\s]+/[^/\s]+/pull/\d+"#, options: .regularExpression) != nil { bump("whats-new", 7, "a pull request link") }
            else if lower.range(of: #"(youtube\.com|youtu\.be|vimeo\.com)/"#, options: .regularExpression) != nil { bump("shorter-versions", 2, "a video link") }
            else if lower.range(of: #"(twitter\.com|x\.com)/[^/\s]+/status/"#, options: .regularExpression) != nil { bump("animated-post", 5, "a link to a post") }
            else { bump("launch-film", 3, "a website link") }
        }
        let hints = Self.pathHints(paths)
        for hint in hints { bump(hint.option, hint.score, hint.why) }
        let has = (folder: hints.contains { $0.why.contains("folder") }, clip: hints.contains { $0.why.contains("single clip") || $0.why.contains("one clip") },
                   url: !urls.isEmpty, song: hints.contains { $0.why.contains("a song") || $0.why.contains("holds audio") })
        for (id, entry) in score {
            let ins = option(id)?.inputs.map(\.id) ?? []
            var bonus = 0
            if has.folder, !Set(ins).isDisjoint(with: ["clips", "interviews", "takes", "product-footage"]) { bonus += 1 }
            if has.url, ins.contains("url") { bonus += 1 }
            if has.song, ins.contains("song") { bonus += 1 }
            if has.clip, ins.contains("one-clip") { bonus += 1 }
            score[id] = (entry.score + bonus, entry.why)
        }
        if has.song && has.folder && (text.contains("music video") || text.contains("performance")) { bump("performance-mv", 4, "a song and a folder of takes") }
        let order = Dictionary(uniqueKeysWithValues: options.enumerated().map { ($1.id, $0) })
        let ranked = score.map { (id: $0.key, score: $0.value.score, why: $0.value.why) }
            .sorted { $0.score != $1.score ? $0.score > $1.score : (order[$0.id] ?? 0) < (order[$1.id] ?? 0) }
        guard let top = ranked.first, let option = option(top.id) else { return nil }
        let said = top.why.filter { $0.hasPrefix("you said") }.prefix(2).map { String($0.dropFirst(9)) }
        let other = top.why.first { !$0.hasPrefix("you said") }
        let reason = [said.isEmpty ? nil : "you said " + said.joined(separator: " and "), other].compactMap { $0 }.joined(separator: "; ")
        let low = ranked.count > 1 && ranked[1].score >= top.score - 1
        return Match(tile: option.tile, option: option.id, why: reason.prefix(1).uppercased() + reason.dropFirst(), confident: !low && top.score >= 5)
    }

    private static func words(_ phrase: String) -> Int { phrase.split(whereSeparator: { $0.isWhitespace }).count }
    private static func phrase(_ key: String, in text: String) -> Bool {
        let pattern = "(^|[^a-z0-9])" + NSRegularExpression.escapedPattern(for: key.lowercased()) + "($|[^a-z0-9])"
        return text.range(of: pattern, options: .regularExpression) != nil
    }

    private struct Hint { var option: String; var score: Int; var why: String }
    private struct Scan { var videos: [String] = []; var audio = 0, images = 0, pdf = 0, sheets = 0, fonts = 0, vector = 0; var code = false; var seen = 0 }
    private static let video: Set<String> = ["mp4", "mov", "m4v", "mkv", "avi", "webm", "mts", "m2ts", "3gp", "mxf"]
    private static let audioExt: Set<String> = ["mp3", "wav", "m4a", "aac", "flac", "aif", "aiff", "ogg"]
    private static let imageExt: Set<String> = ["jpg", "jpeg", "png", "heic", "webp", "tif", "tiff", "gif"]
    private static let sheetExt: Set<String> = ["csv", "xls", "xlsx", "numbers", "tsv"]
    private static let textExt: Set<String> = ["md", "txt", "doc", "docx", "rtf", "pages"]
    private static let vectorExt: Set<String> = ["svg", "ai", "eps"]
    private static let codeMarkers: Set<String> = ["package.json", ".git", "Cargo.toml", "go.mod", "pyproject.toml", "Package.swift", "Gemfile", "pom.xml", "build.gradle"]

    private static func scan(_ dir: URL, depth: Int = 2, into acc: inout Scan) {
        guard let entries = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.isDirectoryKey], options: []) else { return }
        for entry in entries {
            acc.seen += 1
            if acc.seen > 3000 { return }
            let name = entry.lastPathComponent, ext = entry.pathExtension.lowercased()
            if codeMarkers.contains(name) || ext == "xcodeproj" { acc.code = true }
            if name.hasPrefix(".") || name == "node_modules" { continue }
            if (try? entry.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true { if depth > 0 { scan(entry, depth: depth - 1, into: &acc) }; continue }
            if video.contains(ext) { acc.videos.append(name) } else if audioExt.contains(ext) { acc.audio += 1 }
            else if imageExt.contains(ext) { acc.images += 1 } else if ext == "pdf" { acc.pdf += 1 } else if sheetExt.contains(ext) { acc.sheets += 1 }
            else if ["otf", "ttf", "woff", "woff2"].contains(ext) { acc.fonts += 1 } else if vectorExt.contains(ext) { acc.vector += 1 }
        }
    }
    private static func has(_ pattern: String, _ s: String) -> Bool { s.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil }

    private static func pathHints(_ paths: [URL]) -> [Hint] {
        var out: [Hint] = []
        func hint(_ option: String, _ score: Int, _ why: String) { out.append(Hint(option: option, score: score, why: why)) }
        for url in paths {
            let b = url.lastPathComponent, ext = url.pathExtension.lowercased()
            var isDir: ObjCBool = false
            if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), isDir.boolValue {
                var a = Scan(); scan(url, into: &a)
                let names = (b + " " + a.videos.joined(separator: " ")).lowercased()
                if a.code { hint("launch-film", 4, "\"\(b)\" is a code folder") }
                else if a.videos.count >= 2 || (!a.videos.isEmpty && a.images > 3) {
                    if has("green|chroma|keyed", names) { hint("presenter", 5, "\"\(b)\" holds green-screen clips") }
                    else if has("customer|testimon|client", names) { hint("customer-story", 5, "\"\(b)\" holds customer interview clips") }
                    else if has("founder|ceo", names) { hint("founder-interview", 5, "\"\(b)\" holds founder interview clips") }
                    else if has("interview", names) { hint("founder-interview", 4, "\"\(b)\" holds interview clips") }
                    else if has(#"screen ?(recording|shot)|screencast"#, names) { hint("screen-demo", 5, "\"\(b)\" holds screen recordings") }
                    else { hint("social-reel", 4, "\"\(b)\" is a folder of \(a.videos.count) clips") }
                } else if a.videos.count == 1 { hint("talking-graphics", 3, "\"\(b)\" holds one clip") }
                else if a.audio > 0 && a.images == 0 { hint("lyric-video", 4, "\"\(b)\" holds audio") }
                else if a.fonts > 0 || a.vector > 0 { hint("brand-film", 3, "\"\(b)\" looks like a brand kit") }
                else if a.images > 3 { hint("social-reel", 3, "\"\(b)\" is a folder of photos") }
                else if a.sheets > 0 { hint("data-story", 3, "\"\(b)\" holds spreadsheets") }
                else if a.pdf > 0 { hint("explainer", 2, "\"\(b)\" holds documents") }
                continue
            }
            if video.contains(ext) {
                if has("green|chroma|keyed", b) { hint("presenter", 5, "\"\(b)\" is a green-screen clip") }
                else if has(#"screen ?recording|screencast|screen ?shot"#, b) { hint("screen-demo", 5, "\"\(b)\" is a screen recording") }
                else if has(#"final|master|export|render|v\d+\b"#, b) { hint("shorter-versions", 4, "\"\(b)\" looks like a finished video") }
                else if has("podcast|episode", b) { hint("podcast-clips", 4, "\"\(b)\" looks like a podcast episode") }
                else { hint("talking-graphics", 3, "\"\(b)\" is a single clip") }
            } else if audioExt.contains(ext) {
                let pod = has("podcast|episode", b)
                hint(pod ? "podcast-clips" : "lyric-video", 4, "\"\(b)\" is \(pod ? "a podcast episode" : "a song")")
            } else if sheetExt.contains(ext) { hint("data-story", 4, "\"\(b)\" is a spreadsheet") }
            else if ext == "pdf" { hint(has("brand|guideline|identity", b) ? "brand-film" : has("report|survey|annual", b) ? "data-story" : "explainer", 3, "\"\(b)\" is a document") }
            else if vectorExt.contains(ext) || (imageExt.contains(ext) && has("logo", b)) { hint("logo-sting", 4, "\"\(b)\" is a logo") }
            else if textExt.contains(ext) { hint("explainer", 2, "\"\(b)\" is a text document") }
        }
        return out
    }
}
