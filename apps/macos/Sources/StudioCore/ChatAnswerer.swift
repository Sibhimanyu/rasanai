import Foundation

// The chat with Rasan (Notes inspector). A message is either a question about the film's progress, answered here from real data and never
// sent to the director, or feedback, sent to the engine as a `revision-request` (lib/revision-intent.mjs classifies it; this side only
// carries the exact words and where the person was looking). Pure: no I/O, no clock except what is passed in.

extension ThreadMessage {
    /// A message made locally (a local answer, or the engine's interpretation), shown in the step's thread beside the saved ones.
    public static func local(step: String, fromUser: Bool, text: String, time: String) -> ThreadMessage {
        ThreadMessage(step: step, fromUser: fromUser, text: text, time: time)
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
    private static let feedbackWords = try! NSRegularExpression(pattern: #"\b(font|typeface|colou?r|music|voice|scene|shot|title|logo|caption|too (big|small|fast|slow|long|short|loud|quiet|busy|dark|bright)|instead|replace|change|remove|louder|quieter|bigger|smaller|faster|slower)\b"#, options: [.caseInsensitive])

    private static func matches(_ r: NSRegularExpression, _ s: String) -> Bool { r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil }

    public static func classify(_ text: String) -> ChatIntent {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return .feedback }
        if matches(imperativeStart, t) { return .feedback }
        if matches(strongStatus, t) { return .statusQuestion }
        if t.hasSuffix("?"), matches(weakStatus, t), !matches(feedbackWords, t) { return .statusQuestion }
        return .feedback
    }

    private enum Ask { case time, what, both }
    private static func ask(_ text: String) -> Ask {
        let t = text.lowercased()
        let time = ["how long", "how much", "eta", "when", "how soon", "time left", "time remaining", "done yet", "finished yet", "ready yet", "how many"].contains { t.contains($0) }
        let what = ["what", "progress", "status", "how's it going", "how is it going", "doing", "stuck", "working", "next", "update"].contains { t.contains($0) }
        return time && !what ? .time : what && !time ? .what : .both
    }

    // MARK: Answer

    /// The reply to a status question, from the progress snapshot and the run's own state. No estimate means "no estimate yet".
    public static func answer(_ question: String, _ c: ChatContext) -> String {
        let kind = ask(question)
        let doingNow = doingLine(c), timing = timingLine(c), next = nextLine(c)
        var parts: [String?] = []
        switch kind {
        case .time: parts = [timing, doingNow]
        case .what: parts = [doingNow, next, timing]
        case .both: parts = [timing, doingNow, next]
        }
        parts.append(pendingLine(c))
        var seen = Set<String>()
        return parts.compactMap { $0 }.filter { seen.insert($0).inserted }.joined(separator: " ")
    }

    private static func phaseTitle(_ c: ChatContext) -> String? { c.progress.map { $0.currentPhase.title } }

    private static func doingLine(_ c: ChatContext) -> String? {
        if !c.isConnected { return "I can't read this film's folder right now, so I can't tell what is happening." }
        if c.isDone { return "The film is finished and delivered." }
        if c.isWaitingOnUser { return "Nothing is running: I'm waiting on your call at \(StepCatalog.label(c.step))." }
        switch c.runState {
        case "paused": return "The run is paused: nothing new starts until you resume it. Work already running finishes."
        case "rate_limited": return c.runReason.map { "Rasan is waiting out a provider limit. \($0)" } ?? "Rasan is waiting out a provider limit."
        case "failed": return "A step failed, so the film is not moving. \(c.runReason ?? "You can retry it from the run controls.")"
        case "stopped": return "Nothing is running right now. \(c.runReason ?? "")".trimmingCharacters(in: .whitespaces)
        default: break
        }
        if c.progress?.directorIdle == true { return "The director is not working at the moment (paused, waiting on a plan limit or stopped)." }
        if let now = c.progress?.now, !now.text.isEmpty, now.kind != .idle {
            let phase = phaseTitle(c).map { " (\($0) phase)" } ?? ""
            return "Right now: \(sentence(now.text))\(phase)."
        }
        if let w = c.workingMessage, !w.isEmpty { return "Right now: \(sentence(w))." }
        if let p = phaseTitle(c) { return "I'm in the \(p) phase." }
        return "I don't have a live status for this film yet."
    }

    private static func timingLine(_ c: ChatContext) -> String? {
        if c.isDone { return nil }
        if c.isWaitingOnUser { return "The clock isn't ticking while I wait for you." }
        if ["paused", "failed", "stopped"].contains(c.runState ?? "") { return "I can't give a time while it isn't moving." }
        guard let r = c.progress?.remaining else { return "No estimate yet: there isn't enough measured progress to give an honest time." }
        let basis: String
        switch r.basis {
        case .measured: basis = "from progress measured so far"
        case .learned: basis = "from how long your past films took"
        case .typical: basis = "a typical figure, not measured on this film yet"
        }
        return "About \(r.text.replacingOccurrences(of: "about ", with: "")) left (\(basis))."
    }

    private static func nextLine(_ c: ChatContext) -> String? {
        if c.isDone { return nil }
        if c.isWaitingOnUser { return "After you decide, I carry on with the next step." }
        guard let p = c.progress else { return nil }
        let next = p.phases.first { $0.phase > p.currentPhase && $0.state != .skipped && $0.state != .done }
        return next.map { "Next up: \($0.phase.title)." }
    }

    private static func pendingLine(_ c: ChatContext) -> String? {
        guard let since = c.pendingSince else { return nil }
        let s = Int(c.now.timeIntervalSince(since))
        guard s >= 20 else { return nil }
        return "Your last message went in \(elapsed(s)) ago and hasn't been answered yet."
    }

    static func elapsed(_ seconds: Int) -> String {
        if seconds < 90 { return "\(max(seconds, 1)) seconds" }
        if seconds < 5400 { return "\(Int((Double(seconds) / 60).rounded())) min" }
        return String(format: "%.1f h", Double(seconds) / 3600)
    }

    private static func sentence(_ s: String) -> String {
        var t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        while let last = t.last, ".…!".contains(last) { t.removeLast() }
        guard let first = t.first else { return t }
        return first.lowercased() + t.dropFirst()
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
