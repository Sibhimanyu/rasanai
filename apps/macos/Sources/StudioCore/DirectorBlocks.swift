import Foundation

// MARK: A command the director was refused

/// One command (or file) the headless director tried and the permission layer refused. Repeats of the same one are folded into `count`.
public struct DirectorBlock: Identifiable, Equatable, Sendable {
    public var id: String
    public var tool: String
    /// The shell command, or the file path for an edit.
    public var command: String
    public var at: Date
    public var count: Int
    /// Refused inside one of Rasan's helpers (a sub-agent), not the director itself: kept for the record, but it does not stop the director.
    public var byHelper = false

    /// What Rasan asked to do, in plain words ("run `npm test`", "run a command", "change a file"). Never empty backticks.
    public var action: String {
        let c = command.trimmingCharacters(in: .whitespacesAndNewlines)
        switch tool {
        case "Bash": return c.isEmpty ? "run a command" : "run `\(c)`"
        case "Edit", "Write", "MultiEdit", "NotebookEdit": return c.isEmpty ? "change a file" : "change `\(c)`"
        case "Read", "Glob", "Grep": return c.isEmpty ? "read a file" : "read `\(c)`"
        case "WebFetch", "WebSearch": return c.isEmpty ? "go on the web" : "open `\(c)`"
        case "", "Tool": return c.isEmpty ? "run a command" : "run `\(c)`"
        default: return c.isEmpty ? "use a tool (\(tool))" : "use \(tool) on `\(c)`"
        }
    }
    /// What the person reads: what happened, in plain words. Specific and never silent.
    public var message: String {
        "Studio stopped a step because Rasan asked to \(action), which isn't allowed here."
    }
    /// What to do about it, one sentence.
    public var whatToDo: String {
        isInstall ? "Studio can install the tool for you, or you can install it yourself."
            : "Press Fix it and Rasan will try a safer way."
    }
    /// The technical reason, for the small print and for support: the tool, the exact command, how often.
    public var technical: String {
        let c = command.trimmingCharacters(in: .whitespacesAndNewlines)
        let who = byHelper ? "One of Rasan's helpers" : "The director"
        let what = c.isEmpty ? "(the command was not recorded in the log)" : c
        return "\(who) was refused permission for \(tool.isEmpty || tool == "Tool" ? "a tool call" : tool): \(what)." + (repeatNote.map { " " + $0 } ?? "")
    }
    /// True for brew, pip, npm install and the like: Studio never lets the director install software by itself.
    public var isInstall: Bool { ToolNeed.isInstallCommand(command) }
    /// The tool the command was trying to install, when Studio knows how to install it (or what to tell the person otherwise).
    public var suggestedTool: String? { isInstall ? ToolNeed.guessTool(fromCommand: command) : nil }
    /// "It tried this 3 times": the loop guard.
    public var repeatNote: String? { count >= 2 ? "It tried this \(count) times." : nil }
}

/// Reads the director's stream-json as it arrives and notices refusals live, instead of only at process exit.
/// Pure: feed it lines, read `blocks` and `open`.
public struct DirectorBlockScanner: Equatable, Sendable {
    public private(set) var blocks: [DirectorBlock] = []
    /// Non-console tool calls made since the latest block.
    private var callsSinceBlock = 0
    /// Refusals in a row with no successful tool call between them.
    private var deniedStreak = 0
    private var uses: [String: (tool: String, command: String)] = [:]
    private var useOrder: [String] = []

    public init() {}

    public static func == (a: Self, b: Self) -> Bool { a.blocks == b.blocks && a.callsSinceBlock == b.callsSinceBlock && a.deniedStreak == b.deniedStreak }

    /// The refusal the director has not got past: nothing but console calls since it, or two refusals in a row.
    public var open: DirectorBlock? {
        guard let last = blocks.filter({ !$0.byHelper }).max(by: { $0.at < $1.at }) else { return nil }
        return callsSinceBlock == 0 || deniedStreak >= 2 ? last : nil
    }

    /// The person has seen the block (or fixed its cause, or restarted the director): it stops counting as open.
    public mutating func acknowledge() { callsSinceBlock = max(callsSinceBlock, 1); deniedStreak = 0 }

    static let phrases = ["requested permissions", "haven't granted", "hasn't been granted", "requires approval", "require approval", "was blocked",
                          "not allowed to use", "permission to use", "auto-denied", "denied by", "not permitted by"]

    public static func isDenialText(_ text: String) -> Bool {
        let t = text.lowercased()
        return phrases.contains(where: t.contains)
    }

    public mutating func ingest(lines: [String], now: Date = Date()) {
        for line in lines where line.contains("tool_use") || line.contains("tool_result") || line.contains("permission_denials") {
            guard let data = line.data(using: .utf8), let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            ingest(object: object, now: now)
        }
    }

    public mutating func ingest(object: [String: Any], now: Date = Date()) {
        let time = (object["timestamp"] as? String).flatMap(DirectorTelemetry.parseDate) ?? now
        switch object["type"] as? String {
        case "assistant":
            // A helper's (sub-agent's) calls are remembered too, so a refusal inside a helper is named, never shown as an empty command.
            let helper = Self.isHelper(object)
            guard let blocks = (object["message"] as? [String: Any])?["content"] as? [[String: Any]] else { return }
            for block in blocks where block["type"] as? String == "tool_use" {
                let name = block["name"] as? String ?? "Tool"
                let input = block["input"] as? [String: Any] ?? [:]
                let what = (input["command"] as? String) ?? (input["file_path"] as? String) ?? (input["path"] as? String) ?? ""
                if let id = block["id"] as? String {
                    uses[id] = (name, what); useOrder.append(id)
                    if useOrder.count > 200 { for old in useOrder.prefix(100) { uses[old] = nil }; useOrder.removeFirst(100) }
                }
                if !helper && !(name == "Bash" && what.contains("console.mjs")) && name != "ScheduleWakeup" { callsSinceBlock += 1 }
            }
        case "user":
            let helper = Self.isHelper(object)
            guard let blocks = (object["message"] as? [String: Any])?["content"] as? [[String: Any]] else { return }
            for block in blocks where block["type"] as? String == "tool_result" {
                let use = (block["tool_use_id"] as? String).flatMap { uses[$0] }
                let isError = block["is_error"] as? Bool == true
                if isError, Self.isDenialText(Self.text(of: block["content"])) {
                    record(tool: use?.tool ?? "Tool", command: use?.command ?? "", at: time, helper: helper)
                } else if !helper && !(use?.tool == "Bash" && use?.command.contains("console.mjs") == true) { deniedStreak = 0 }
            }
        case "result":
            for denial in object["permission_denials"] as? [[String: Any]] ?? [] {
                let input = denial["tool_input"] as? [String: Any] ?? [:]
                let what = (input["command"] as? String) ?? (input["file_path"] as? String) ?? (input["path"] as? String) ?? ""
                if !blocks.contains(where: { $0.id == Self.key(denial["tool_name"] as? String ?? "Tool", what) }) {
                    record(tool: denial["tool_name"] as? String ?? "Tool", command: what, at: time)
                }
            }
        default: break
        }
    }

    private mutating func record(tool: String, command: String, at time: Date, helper: Bool = false) {
        let key = Self.key(tool, command)
        let shown = Self.tidy(command)
        if let index = blocks.firstIndex(where: { $0.id == key }) {
            blocks[index].count += 1; blocks[index].at = time; blocks[index].byHelper = blocks[index].byHelper && helper
        } else {
            blocks.append(DirectorBlock(id: key, tool: tool, command: shown, at: time, count: 1, byHelper: helper)); if blocks.count > 20 { blocks.removeFirst() }
        }
        // A helper's refusal does not stop the director: it is waiting on the helper, which reports back and carries on another way.
        if !helper { callsSinceBlock = 0; deniedStreak += 1 }
    }

    /// Stream-json lines from a sub-agent carry the id of the director's tool call that started it.
    static func isHelper(_ object: [String: Any]) -> Bool {
        guard let parent = object["parent_tool_use_id"] else { return false }
        return !(parent is NSNull)
    }

    static func tidy(_ command: String) -> String {
        let flat = command.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return flat.count > 140 ? String(flat.prefix(140)) + "…" : flat
    }
    static func key(_ tool: String, _ command: String) -> String { tool + "|" + tidy(command) }
    static func text(of content: Any?) -> String {
        if let s = content as? String { return s }
        if let parts = content as? [[String: Any]] { return parts.compactMap { $0["text"] as? String }.joined(separator: " ") }
        return ""
    }

    /// Every block a whole log holds (for an exit that was already over when Studio looked).
    public static func blocks(in log: String) -> [DirectorBlock] {
        var scanner = DirectorBlockScanner()
        scanner.ingest(lines: log.split(separator: "\n").map(String.init))
        return scanner.blocks
    }
}

// MARK: A tool the film needs

/// A structured "tool-needed" question from the director, carried by `console.mjs ask` with no engine change: an option whose id is
/// `install-tool:<tool>`. Studio answers `tool-ready:<tool>` (installed and seen on the director's PATH) or `skip-tool:<tool>`.
public struct ToolNeed: Equatable, Sendable {
    public static let installPrefix = "install-tool:"
    public static let readyPrefix = "tool-ready:"
    public static let skipPrefix = "skip-tool:"

    public let askID: String
    public let step: String
    public let tool: String
    public let why: String

    public init?(ask: DirectorAsk) {
        guard let option = ask.options.first(where: { $0.id.hasPrefix(Self.installPrefix) }) else { return nil }
        let name = String(option.id.dropFirst(Self.installPrefix.count)).trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return nil }
        askID = ask.id; step = ask.step; tool = name.lowercased()
        why = ask.context.isEmpty ? ask.question : ask.context
    }
    public init(tool: String, why: String) { askID = ""; step = ""; self.tool = tool.lowercased(); self.why = why }

    public var readyChoice: String { Self.readyPrefix + tool }
    public var skipChoice: String { Self.skipPrefix + tool }

    /// The key Studio's managed setup (`Runtime/tool-setup.mjs`) installs this tool under, or nil when only the person can install it.
    public var managedKey: String? {
        switch tool {
        case "ffmpeg", "ffprobe": "ffmpeg"
        case "hyperframes", "renderer": "renderer"
        case "browser", "chrome", "chromium", "chrome-headless-shell": "browser"
        case "skills", "design-resources": "skills"
        case "whisper", "whisper-cli", "transcriber", "whisper.cpp": "transcriber"
        default: nil
        }
    }
    /// Programs that must be found on the director's PATH before it may carry on (empty: checked by Studio's readiness row instead).
    public var executables: [String] {
        switch managedKey {
        case "ffmpeg": ["ffmpeg", "ffprobe"]
        case "renderer": ["hyperframes"]
        case "transcriber": ["whisper-cli"]
        case nil: [tool]
        default: []
        }
    }
    /// The readiness row (`FilmPreflight`) that must be ready too.
    public var preflightIDs: [String] {
        switch managedKey {
        case "ffmpeg": ["ffmpeg", "ffprobe"]
        case "renderer": ["renderer"]
        case "browser": ["browser"]
        case "skills": ["skills"]
        case "transcriber": ["transcriber"]
        default: []
        }
    }
    public var title: String {
        switch managedKey {
        case "ffmpeg": "FFmpeg and ffprobe"
        case "renderer": "The HyperFrames renderer"
        case "browser": "The render browser"
        case "skills": "HyperFrames design resources"
        case "transcriber": "The speech transcriber"
        default: tool
        }
    }
    /// What it is and how big, so the person can say yes knowing.
    public var whatItDoes: String {
        switch managedKey {
        case "ffmpeg": "About 80 MB. Cuts, converts and encodes the film's video and audio."
        case "renderer": "About 150 MB. Turns the film's scenes into video."
        case "browser": "About 150 MB, downloaded by HyperFrames. Draws each frame when the film renders."
        case "skills": "A small download that needs Git. Design helpers the crew reads."
        case "transcriber": "About 470 MB (whisper and its model). Captions and cuts footage by what is said."
        default: "Studio cannot install this one for you."
        }
    }
    /// Plain steps for a tool Studio cannot install, or whose install failed. Names what is absent instead of assuming Homebrew.
    public func manualSteps(brewPresent: Bool) -> String {
        let finish = " Then press “I installed it - check again”: Studio looks for it on the same PATH Rasan uses before carrying on."
        switch tool {
        case "git", "xcode-select", "xcode", "command-line-tools":
            return "Open Terminal and run `xcode-select --install`, then finish Apple's installer." + finish
        case "chrome", "browser", "chromium":
            return "Install Google Chrome from google.com/chrome, or open Terminal and run `npx --yes hyperframes browser ensure`." + finish
        default:
            let program = tool.contains(" ") ? "the tool" : "`\(tool)`"
            return brewPresent
                ? "Open Terminal and run `brew install \(tool)`. Rasan's own shell is not allowed to run brew, so this one is yours to run." + finish
                : "Homebrew is not installed on this Mac, so `brew install \(tool)` will not work. Install Homebrew from brew.sh, or download \(program) from its website, then run its installer yourself." + finish
        }
    }

    // MARK: Reading commands

    public static func isInstallCommand(_ command: String) -> Bool {
        let c = command.lowercased()
        return c.range(of: #"(^|[\s;&|/])(brew|pip3?|pipx|conda|gem|cargo|wget|apt|apt-get|port)\b"#, options: .regularExpression) != nil
            || c.range(of: #"\b(npm|npx|pnpm|yarn)\b.*\b(install|i|add|-g)\b"#, options: .regularExpression) != nil
            || c.contains("sudo ") || c.hasPrefix("curl ") && c.contains("| ")
    }

    /// The tool an install command was after, when it names one Studio knows (else the last word that is not a flag).
    public static func guessTool(fromCommand command: String) -> String? {
        let c = command.lowercased()
        for (needle, tool) in [("ffprobe", "ffmpeg"), ("ffmpeg", "ffmpeg"), ("hyperframes", "hyperframes"), ("whisper", "transcriber"),
                               ("puppeteer", "browser"), ("chromium", "browser"), ("chrome", "browser"), ("yt-dlp", "yt-dlp")] where c.contains(needle) { return tool }
        let words = c.split(whereSeparator: \.isWhitespace).map(String.init).filter { !$0.hasPrefix("-") }
        let verbs: Set<String> = ["brew", "pip", "pip3", "pipx", "npm", "npx", "install", "i", "add", "sudo", "cargo", "gem", "-g", "global", "--global", "python3", "-m", "uv", "conda"]
        return words.last { !verbs.contains($0) && !$0.contains("/") }
    }
}

// MARK: Install consent record

/// What the person agreed to, and what happened, written to `<run>/install-consent.jsonl` (Studio's file; the engine never reads it).
public struct InstallConsent: Codable, Equatable, Sendable {
    public var t: Date
    public var tool: String
    /// `studio-managed` (Studio's own no-sudo setup) or `user-manual` (the person installed it and asked Studio to check).
    public var source: String
    /// `approved` (pressed Install for me), `checked-manually`, or `declined`.
    public var consent: String
    /// `started`, `installed`, `failed`, `visible-on-path`, `not-visible`, `skipped`.
    public var result: String
    public var detail: String

    public init(t: Date = Date(), tool: String, source: String, consent: String, result: String, detail: String = "") {
        self.t = t; self.tool = tool; self.source = source; self.consent = consent; self.result = result; self.detail = detail
    }

    public static let fileName = "install-consent.jsonl"

    public func append(run: URL) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(self) else { return }
        let url = run.appendingPathComponent(Self.fileName)
        let fm = FileManager.default
        if !fm.fileExists(atPath: url.path) { fm.createFile(atPath: url.path, contents: nil) }
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: data + Data("\n".utf8))
    }
}
