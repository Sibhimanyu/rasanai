import Foundation

// The chat with Rasan (Notes inspector). A message is either a question about the film's progress, answered here from real data and never
// sent to the director, or feedback, sent to the engine as a `revision-request` (lib/revision-intent.mjs classifies it; this side only
// carries the exact words and where the person was looking). Pure: no I/O, no clock except what is passed in.

extension ThreadMessage {
    /// A message made locally (a local answer, or the engine's interpretation), shown in the step's thread beside the saved ones.
    public static func local(step: String, fromUser: Bool, text: String, time: String, quickActions: [ChatQuickAction]? = nil) -> ThreadMessage {
        ThreadMessage(step: step, fromUser: fromUser, text: text, time: time, quickActions: quickActions)
    }
}

public enum ChatIntent: Equatable, Sendable { case statusQuestion, feedback }

/// The one-tap actions a quick status offers: the same ones as the "Rasan needs permission" banner.
public enum ChatQuickAction: String, Equatable, Sendable, CaseIterable {
    case fixIt, retryStep, restartRasan, viewActivity, copyDetails
    public var title: String {
        switch self {
        case .fixIt: "Fix it"
        case .retryStep: "Retry step"
        case .restartRasan: "Restart Rasan"
        case .viewActivity: "View activity"
        case .copyDetails: "Copy details"
        }
    }
}

/// A status Studio answers itself, without waking the director: the words and the actions to offer.
public struct QuickStatus: Equatable, Sendable {
    public var text: String
    public var actions: [ChatQuickAction]
}

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

    // MARK: Quick status (answered by Studio, Rasan is not asked)

    /// Studio should answer from what it knows instead of waiting on the director: it is blocked, stalled, failed or not running.
    public static func needsLocalAnswer(_ c: ChatContext) -> Bool {
        if c.isDone || !c.isConnected { return false }
        if c.blocked != nil || c.stalled || c.runState == "failed" { return true }
        return c.directorRunning == false && !c.isWaitingOnUser
    }

    /// The reply to "what happened?" and friends: what is wrong (if anything), the last few things that happened, and "What I'd do"
    /// with the same one-tap actions as the banner. Only facts the app already has; when it has none, it says so.
    public static func quickStatus(_ question: String, _ c: ChatContext) -> QuickStatus {
        var lines: [String] = []
        var actions: [ChatQuickAction] = []
        var advice: String?
        if let b = c.blocked {
            lines.append(c.blockRepeated
                ? "Rasan is stopped again: it asked to \(b.action), which isn't allowed here, and Fix it didn't get past it."
                : "Rasan is stopped, waiting for permission: it asked to \(b.action), which isn't allowed here, so Studio stopped that step.")
            if let r = b.repeatNote, !c.blockRepeated { lines.append(r) }
            lines.append("Your film so far is saved.")
            if c.blockRepeated {
                advice = "restart Rasan. It starts fresh from your saved film."
                actions = [.restartRasan, .viewActivity, .copyDetails]
            } else {
                advice = "press Fix it. Rasan retries the step a safer way."
                actions = [.fixIt, .restartRasan, .viewActivity, .copyDetails]
            }
        } else if c.stalled {
            lines.append("Rasan has gone quiet: nothing is running and it isn't waiting for you." + (c.healthDetail.map { " \($0)" } ?? ""))
            advice = "restart Rasan. It carries on from your saved film."
            actions = [.restartRasan, .retryStep, .viewActivity]
        } else if c.runState == "failed" {
            lines.append(doingLine(c) ?? "A step failed, so the film is not moving.")
            advice = "retry the step."
            actions = [.retryStep, .restartRasan, .viewActivity]
        } else if c.directorRunning == false && !c.isDone && !c.isWaitingOnUser {
            lines.append("Rasan isn't running on this film right now, so nothing is moving.")
            advice = "restart Rasan. It carries on from your saved film."
            actions = [.restartRasan, .viewActivity]
        } else {
            lines.append(answer(question, c))
            actions = [.viewActivity]
        }
        if c.blocked == nil, let e = c.lastError?.trimmingCharacters(in: .whitespacesAndNewlines), !e.isEmpty {
            lines.append("Last error: \(clip(e, 140))")
        }
        let recent = c.recentEvents.suffix(3).map { clip($0, 80) }.filter { !$0.isEmpty }
        if !recent.isEmpty { lines.append("Last things that happened: " + recent.joined(separator: "; ") + ".") }
        if c.blocked == nil && !c.stalled && recent.isEmpty && c.lastError == nil && c.progress == nil && c.workingMessage == nil {
            lines.append("I don't have more detail yet. View activity shows everything.")
        }
        if let advice { lines.append("What I'd do: \(advice)") }
        return QuickStatus(text: lines.joined(separator: " "), actions: actions)
    }

    static func clip(_ s: String, _ n: Int) -> String {
        let flat = s.split(whereSeparator: \.isNewline).joined(separator: " ")
        return flat.count > n ? String(flat.prefix(n)) + "…" : flat
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

    /// "8 s", "1 min 05 s", "1 h 12 min": the thinking row's clock.
    public static func elapsedShort(_ seconds: Int) -> String {
        let s = max(0, seconds)
        if s < 60 { return "\(s) s" }
        if s < 3600 { return "\(s / 60) min \(String(format: "%02d", s % 60)) s" }
        return "\(s / 3600) h \(s % 3600 / 60) min"
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
