import Foundation

// The chat with Rasan (Notes inspector). A message is either a question, which goes to Rasan's model only (never to the director; this file
// only routes it, it writes no answers), or feedback, sent to the engine as a `revision-request` (lib/revision-intent.mjs classifies it; this
// side only carries the exact words and where the person was looking). Pure: no I/O, no clock except what is passed in.

extension ThreadMessage {
    /// A message made locally (a local answer, or the engine's interpretation), shown in the step's thread beside the saved ones.
    public static func local(step: String, fromUser: Bool, text: String, time: String, incident: String? = nil) -> ThreadMessage {
        ThreadMessage(step: step, fromUser: fromUser, text: text, time: time, incident: incident)
    }
}

public enum ChatIntent: Equatable, Sendable { case statusQuestion, feedback }

/// What the answerer may say. Every field is optional or defaulted: a missing one is stated as unknown, never invented.
public struct ChatContext: Sendable {
    public var step: String
    public var progress: FilmProgressSnapshot?
    /// `session.run_status`: state ("working", "paused", "rate_limited", "failed", "waiting_for_you", "stopped"), label and reason.
    public var runState: String?
    public var runLabel: String?
    public var runReason: String?
    public var isDone = false
    public var isWaitingOnUser = false
    public var workingMessage: String?
    public var isConnected = true
    /// When the person last sent something Rasan has not answered yet (nil: nothing pending).
    public var pendingSince: Date?
    public var now = Date()
    /// The refusal the director has not got past (nil: not blocked), and whether it came back after Fix it.
    public var blocked: DirectorBlock?
    public var blockRepeated = false
    /// The director went quiet with nothing running and nobody to wait for.
    public var stalled = false
    /// Whether the director process for this film is running (nil: unknown, e.g. a sample film).
    public var directorRunning: Bool?
    /// The monitor's one calm sentence about the director's health, and its last error line.
    public var healthDetail: String?
    public var lastError: String?
    /// The latest things that happened (activity titles), newest last. Only what the app already has.
    public var recentEvents: [String] = []
    /// What the person is looking at: the step on screen and, when it is not the live one, that it is an earlier step.
    public var lookingAt: String?
    /// What interrupts the film now and what became of it (the incident ledger), newest first.
    public var incidents: [ChatIncident] = []
    public init(step: String, progress: FilmProgressSnapshot? = nil, runState: String? = nil, runLabel: String? = nil, runReason: String? = nil,
                isDone: Bool = false, isWaitingOnUser: Bool = false, workingMessage: String? = nil, isConnected: Bool = true, pendingSince: Date? = nil, now: Date = Date()) {
        self.step = step; self.progress = progress; self.runState = runState; self.runLabel = runLabel; self.runReason = runReason
        self.isDone = isDone; self.isWaitingOnUser = isWaitingOnUser; self.workingMessage = workingMessage; self.isConnected = isConnected
        self.pendingSince = pendingSince; self.now = now
    }
}

public enum ChatAnswerer {
    // MARK: Classify

    private static let imperativeStart = try! NSRegularExpression(pattern: #"^\s*(please\s+)?(don'?t|do not|never|stop|change|make|use|remove|replace|swap|add|fix|move|increase|decrease|reduce|drop|keep|avoid|try|set|cut|shorten|lengthen|rename|i (want|need|would like|'d like|don'?t)|can you (change|make|use|remove|replace|add|fix|move)|could you (change|make|use|remove|replace|add|fix|move))\b"#, options: [.caseInsensitive])
    private static let strongStatus = try! NSRegularExpression(pattern: #"\b(how long|how much (longer|more time)|how far|how'?s it going|how is it going|eta\b|time (left|remaining)|(is it|are you|is (rasan|the film|this)) (done|finished|ready|stuck|working|running|frozen|still)|done yet|finished yet|ready yet|what('?s| is| are) (happening|going on|the (status|progress)|rasan doing|you doing|it doing|the crew doing)|what are you (doing|up to)|status\b|progress\b|still working|any (update|progress))"#, options: [.caseInsensitive])
    private static let weakStatus = try! NSRegularExpression(pattern: #"^\s*(when|how soon|how many (more )?(minutes|steps)|what('?s| is) next|what happens next)\b"#, options: [.caseInsensitive])
    /// "what happened", "what happend", "what just hapened", "what went wrong", "why did it stop", "is it stuck", "what's the error".
    private static let troubleQuestion = try! NSRegularExpression(pattern: #"\b(wh?at|wht)\s*('?s|\s+is|\s+has|\s+just|\s+did|\s+was)?\s*(just\s+)?(ha+p+e*n+(e?d|ing|in|s)?\b|hap+ned|went wrong|wrong\b|the (problem|issue|error|matter|holdup|hold-up)|the (block|banner)|this (block|banner|error)|does (this|that|it) mean)|\bwhy\b.{0,40}\b(stop|stopped|block|blocked|fail|failed|stuck|error|waiting|slow|taking so long|not (moving|working|doing)|isn'?t|didn'?t|can'?t|won'?t)|\b(is|are) (it|rasan|this|the film|you|he) (stuck|broken|frozen|dead|hung|blocked|okay|ok|alive)|\bwhat now\b|\bwhat do i do\b|\bwhat should i do\b"#, options: [.caseInsensitive])
    private static let feedbackWords = try! NSRegularExpression(pattern: #"\b(font|typeface|colou?r|music|voice|scene|shot|title|logo|caption|too (big|small|fast|slow|long|short|loud|quiet|busy|dark|bright)|instead|replace|change|remove|louder|quieter|bigger|smaller|faster|slower)\b"#, options: [.caseInsensitive])

    private static func matches(_ r: NSRegularExpression, _ s: String) -> Bool { r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil }

    public static func classify(_ text: String) -> ChatIntent {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return .feedback }
        if matches(imperativeStart, t) { return .feedback }
        if matches(strongStatus, t) { return .statusQuestion }
        if matches(troubleQuestion, t), !matches(feedbackWords, t) { return .statusQuestion }
        if t.hasSuffix("?"), matches(weakStatus, t), !matches(feedbackWords, t) { return .statusQuestion }
        return .feedback
    }

    private static let problemReply = try! NSRegularExpression(
        pattern: #"^\s*(please\s+)?(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|no|nope|not now|later|skip( it)?|continue without( it)?|installed( it)?|i('?ve| have)? ?(just )?installed( it)?|it'?s (installed|done|there|ready)|done|check( it)?( again)?|install( it)?( for me)?|try again|retry|restart( it)?|resume|pause|stop( the install)?|cancel( the install)?)\s*(please|thanks|thank you)?\s*[.!]*\s*$"#,
        options: [.caseInsensitive])
    /// A message that is entirely a short answer to an open problem or a proposal ("yes", "installed", "skip it", "install it for me", "check again").
    /// Anything with more in it, such as a real instruction for the film ("yes, and make the logo blue"), is not.
    public static func isReplyToProblem(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, t.count <= 40 else { return false }
        return matches(problemReply, t)
    }

    // MARK: When the director cannot read a message

    /// The director is blocked, stalled, failed or not running: it will not read a message until it carries on (Rasan says so).
    public static func needsLocalAnswer(_ c: ChatContext) -> Bool {
        if c.isDone || !c.isConnected { return false }
        if c.blocked != nil || c.stalled || c.runState == "failed" { return true }
        return c.directorRunning == false && !c.isWaitingOnUser
    }

    static func clip(_ s: String, _ n: Int) -> String {
        let flat = s.split(whereSeparator: \.isNewline).joined(separator: " ")
        return flat.count > n ? String(flat.prefix(n)) + "…" : flat
    }

    /// "8 s", "1 min 05 s", "1 h 12 min": the thinking row's clock.
    public static func elapsedShort(_ seconds: Int) -> String {
        let s = max(0, seconds)
        if s < 60 { return "\(s) s" }
        if s < 3600 { return "\(s / 60) min \(String(format: "%02d", s % 60)) s" }
        return "\(s / 3600) h \(s % 3600 / 60) min"
    }

    // MARK: Revision request (feedback)

    /// The `value` of a `revision-request` action: the person's exact words plus where they were looking. The engine classifies the intent and
    /// scope itself (classifyFeedback), so nothing here claims one. `playhead` is nil when no player has a position (whole step / whole film).
    public static func revisionValue(text: String, step: String, film: String?, playhead: Double?, shotID: String?) -> JSONValue {
        let target = RevisionTarget(shotID: shotID)
        let request = RevisionRequest(stage: LogicalStage.from(legacyStep: step), note: text, pinned: RevisionPins(film: film), target: target)
        guard case .object(var value) = request.actionValue() else { return .null }
        var anchor: [String: JSONValue] = [:]
        if case .object(let a)? = value["anchor"] { anchor = a }
        if let playhead { anchor["t"] = .number((playhead * 100).rounded() / 100) }
        anchor["step"] = .string(step)
        value["anchor"] = .object(anchor)
        value["text"] = .string(text)
        value["source"] = .string("rasan-chat")
        return .object(value)
    }

    /// The `value` of a `revision-confirm` action.
    public static func confirmValue(key: String, accept: Bool) -> JSONValue {
        .object(["idempotency_key": .string(key), "accept": .bool(accept)])
    }
}

/// One revision request as the engine reports it in `session.revision_requests` (console.mjs revisionHook).
public struct EngineRevision: Equatable, Sendable {
    public var key: String
    public var status: String
    public var interpretation: String
    public var scope: String?
    public var needsConfirmation: Bool
    /// A signature that changes when the request does (key + status), to show each state once.
    public var signature: String { "\(key)|\(status)" }

    public static func read(_ raw: JSONValue) -> [EngineRevision] {
        raw["revision_requests"].array.compactMap { e in
            guard let key = e["idempotency_key"].string else { return nil }
            return EngineRevision(key: key, status: e["status"].string ?? "requested", interpretation: e["interpretation"].string ?? "", scope: e["scope"].string,
                                  needsConfirmation: e["needs_confirmation"].bool ?? false)
        }
    }

    /// What Rasan says when this arrives: the engine's own reading of the scope, or the one interpretation to confirm.
    public var message: String {
        let reading = interpretation.trimmingCharacters(in: .whitespacesAndNewlines)
        if needsConfirmation && status == "requested" {
            return (reading.isEmpty ? "I want to check what you mean before I change anything." : reading) + " Is that right?"
        }
        switch status {
        case "reverted": return "Okay, I won't change that. Tell me what you meant."
        case "failed": return "That change didn't go through." + (reading.isEmpty ? "" : " \(reading)")
        default: return reading.isEmpty ? "Got it. I'll make that change." : reading
        }
    }
}
