import Foundation

/// How much a line in the director's activity should ask of the person. The one place severity is decided.
///
/// The working screen words an `info` line as "Rasan adjusted the plan" with this sentence under it.
///
/// - `info`: a routine adjustment (a documented fallback with an `instead`, a Fast pace shortcut, a stand-in sound). Shown as a
///   quiet grey line, never a coloured card.
/// - `notice`: worth a glance, nothing to do (a check that could not run, a font stand-in).
/// - `needsYou`: something only the person can fix (a permission, a tool, a sign-in). The blocked banner handles the asking.
/// - `error`: a step failed.
public enum ActivitySeverity: String, Codable, Sendable, Comparable, CaseIterable {
    case info
    case notice
    case needsYou = "needs-you"
    case error

    private var rank: Int { Self.allCases.firstIndex(of: self) ?? 0 }
    public static func < (a: Self, b: Self) -> Bool { a.rank < b.rank }

    /// Loud enough for a visible card on the working screen.
    public var isAlerting: Bool { self == .needsYou || self == .error }

    /// The severity a `session.json` activity level or a downgrade row's `severity` field names, if it names one.
    public init?(field: String?) {
        switch field?.lowercased() {
        case "info", "adjust", "adjustment": self = .info
        case "notice": self = .notice
        case "needs-you", "needs_you", "needsyou": self = .needsYou
        case "error": self = .error
        default: return nil
        }
    }
}

/// One fallback the director recorded (`<run>/downgrades.jsonl`, merged into `session.downgrades`), with its fields verbatim.
public struct DowngradeRecord: Codable, Equatable, Sendable {
    public var time: Date?
    public var what: String
    public var instead: String
    public var why: String
    public var impact: String
    public var severity: String?
    public var kind: String?

    public init(time: Date? = nil, what: String, instead: String, why: String = "", impact: String = "", severity: String? = nil, kind: String? = nil) {
        self.time = time; self.what = what; self.instead = instead; self.why = why; self.impact = impact; self.severity = severity; self.kind = kind
    }

    /// The feed line console.mjs writes for this row (lib/downgrade.mjs downgradeFeed): `Working without X: using Y because Z`,
    /// or `Adjusted (<kind>): using Y instead of X because Z` for a routine adjustment.
    public var feedPrefix: String {
        if let kind, !kind.isEmpty { return "Adjusted (\(kind)): using \(instead) instead of \(what)" }
        return "Working without \(what): using \(instead)"
    }

    /// Whether `message` is this row's feed line (the feed cuts lines at 300 characters, so a cut line matches too).
    public func matches(_ message: String) -> Bool { message.hasPrefix(feedPrefix) || feedPrefix.hasPrefix(message) }

    /// A feed line written for a recorded fallback or adjustment.
    public static func isFeedLine(_ message: String) -> Bool { message.hasPrefix("Working without") || message.hasPrefix("Adjusted (") }

    /// Every field verbatim, for "Show original message".
    public var original: String {
        var lines = ["what: \(what)", "instead: \(instead)"]
        if !why.isEmpty { lines.append("why: \(why)") }
        if !impact.isEmpty { lines.append("impact: \(impact)") }
        if let kind, !kind.isEmpty { lines.append("kind: \(kind)") }
        if let severity, !severity.isEmpty { lines.append("severity: \(severity)") }
        if let time { lines.append("logged: \(ISO8601DateFormatter().string(from: time))") }
        return lines.joined(separator: "\n")
    }
}

/// Plain words for the director's fallbacks and warnings. Rule based, local, no network. The original text is never replaced:
/// callers keep it next to the plain sentence so the person can always open it.
public enum ActivityNotes {
    /// A known kind of message: the words to look for (lowercased, any of them), what it usually asks of the person, and the plain sentence.
    /// No file names, flags or jargon in the sentences. The first match wins, so the more specific rows come first.
    struct Pattern {
        let any: [String]
        let severity: ActivitySeverity
        let plain: String
    }

    static let table: [Pattern] = [
        // Something only the person can fix: a sign-in, a permission, a missing tool. The blocked banner asks; this only names it.
        Pattern(any: ["not signed in", "sign in to", "permission denied", "no permission", "api key", "credential", "not authorized"],
                severity: .needsYou, plain: "Rasan needs you to sign in or give permission before it can use this."),
        // The crew planner script did not run, so the director followed the written plan by hand.
        Pattern(any: ["crew.mjs plan", "crew planner", "the planner crashes", "planner failed"],
                severity: .info, plain: "Rasan planned the crew by hand. The same steps and checks still run."),
        // Fast pace: the Motion Director wrote the score as one written contract (motion/CONTRACT.md) instead of score.json,
        // and the motion, frame and match checks ran without the score file.
        Pattern(any: ["score.json", "contract.md", "written score", "without --plan"],
                severity: .info, plain: "Rasan wrote the motion plan as one document instead of several files so all scenes could build together."),
        // The Moves pass (move inventors, a juror, rough sketches) skipped, usually at Fast pace.
        Pattern(any: ["moves pass", "move inventor", "move-inventor", "grey-box roughs", "hero-move"],
                severity: .info, plain: "Rasan skipped the separate brainstorm for motion ideas to keep the pace. The motion plan invents them instead."),
        // A separate script editor skipped: the director read the scripts itself.
        Pattern(any: ["script-editor", "script editor"],
                severity: .info, plain: "Rasan reviewed the scripts itself instead of using a separate editor."),
        // Stand-in audio while the real track or voice is not ready.
        Pattern(any: ["scratch audio", "scratch track", "scratch voice", "placeholder audio", "temp track", "is labelled"],
                severity: .info, plain: "Rasan is using stand-in sound for now. The real sound replaces it later."),
        // Music made in code because no licensed track or instrument library was available.
        Pattern(any: ["procedural", "synthesised", "synthesized", "sine, triangle"],
                severity: .info, plain: "Rasan composed the music itself. It is clean and in time, but simpler than a produced track."),
        Pattern(any: ["curated track", "no track", "licensed track"],
                severity: .info, plain: "Rasan picked a different music source than planned."),
        // Research narrowed: no brand film found, so the website and product pictures were studied instead.
        Pattern(any: ["brand-only research", "no film found", "no brand film", "website and product screenshots", "official film"],
                severity: .info, plain: "Rasan studied the brand from its website because no brand film was found."),
        Pattern(any: ["research budget", "time box", "time-box", "wrap up research"],
                severity: .info, plain: "Rasan kept the research short to stay on time."),
        // Image generation unavailable: designed or procedural backdrops instead.
        Pattern(any: ["image generation", "procedural plates", "designed backdrops", "codex"],
                severity: .info, plain: "Rasan drew the backgrounds itself because image generation wasn't available."),
        // A brand font that could not be staged.
        Pattern(any: ["font", "typeface"],
                severity: .notice, plain: "A stand-in font is used where the brand's own font wasn't available."),
        Pattern(any: ["no default voice", "voice"],
                severity: .notice, plain: "Rasan is working without the planned voice for now."),
        // A gate or check that could not run: the film was not measured on that point.
        Pattern(any: ["motion gate", "frame gate", "no motion check", "no frame check", "could not run", "not measured"],
                severity: .notice, plain: "One automatic check couldn't run, so that part wasn't measured."),
        // Generic Fast pace shortcut.
        Pattern(any: ["fast pace", "fast build plan", "--pace fast"],
                severity: .info, plain: "Rasan took a shortcut that Fast pace allows."),
    ]

    /// The plain sentence for any text (a feed line or a downgrade's fields). Unknown text gets a generic sentence.
    public static func plain(for text: String) -> String {
        match(text)?.plain ?? "Rasan took a different route here."
    }

    static func match(_ text: String) -> Pattern? {
        let lower = text.lowercased()
        return table.first { $0.any.contains(where: lower.contains) }
    }

    /// How much a `session.json` activity line asks of the person. A downgrade row's own `severity` wins; any other recorded
    /// fallback ("Working without") is `info`; other warnings are a `notice` (or `needsYou` when their words say so); errors stay errors.
    public static func severity(level: String, message: String, record: DowngradeRecord? = nil) -> ActivitySeverity? {
        if let explicit = ActivitySeverity(field: record?.severity) { return explicit }
        // A recorded fallback is a choice the director already made: never orange unless the record itself says so.
        // (The feed's level carries a row's severity: notice, error; "warn" is how older skills logged every fallback.)
        if record != nil || DowngradeRecord.isFeedLine(message) {
            return level == "notice" ? .notice : level == "error" ? .error : .info
        }
        switch level {
        case "warn":
            let found = match(message)?.severity
            if found == .needsYou { return .needsYou }
            return found == .info ? .info : .notice
        case "error":
            return .error
        case "adjust", "notice", "needs-you":
            return ActivitySeverity(field: level)
        default:
            return nil   // an ordinary line ("info", "ok", "ask", ...): not a warning of any kind
        }
    }

    /// The sentence shown on the working screen for a classified line.
    public static func title(severity: ActivitySeverity, message: String, record: DowngradeRecord?) -> String {
        let text = record.map { "\($0.what) \($0.instead) \($0.why)" } ?? message
        let known = match(text)
        switch severity {
        case .info, .notice:
            return known?.plain ?? "Rasan took a different route here."
        case .needsYou:
            if let known, known.severity == .needsYou { return known.plain }
            return "Rasan needs something from you to carry on."
        case .error:
            return "A step didn't work as planned. " + (known?.plain ?? "Rasan will try another way or tell you.")
        }
    }
}
