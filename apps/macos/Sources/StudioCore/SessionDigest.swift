import Foundation

/// The director's steps in console order, with the plain labels the console uses.
public enum StepCatalog {
    public static let order = ["brief", "research", "brand", "route", "footage", "story", "direction", "films", "concept", "scenes", "look",
                               "motion", "styleframes", "animatic", "reel", "transitions", "voice", "music", "keyframes", "storyboard",
                               "plan", "build", "render", "final"]
    private static let labels = ["brief": "Brief", "research": "Research", "brand": "Brand", "route": "Workflow", "footage": "Footage",
                                 "story": "Story", "direction": "Style", "films": "Films", "concept": "Story", "scenes": "Scenes",
                                 "look": "Look", "motion": "Motion", "styleframes": "Key frames", "animatic": "Animatic", "reel": "Cut",
                                 "transitions": "Transitions", "voice": "Voice", "music": "Music", "keyframes": "Key poses",
                                 "storyboard": "Storyboard", "plan": "Plan", "build": "Build", "render": "Final", "final": "Final"]
    public static func label(_ step: String) -> String { labels[step] ?? step.capitalized }
    public static func index(_ step: String) -> Int { order.firstIndex(of: step) ?? order.count }
}

/// A question from Claude that is not one of the calls (`console.mjs ask`).
public struct DirectorAsk: Identifiable, Equatable, Sendable {
    public struct Option: Identifiable, Equatable, Sendable {
        public let id: String
        public let label: String
        public let detail: String
    }
    public let id: String
    public let step: String
    public let question: String
    public let context: String
    public let options: [Option]
    public let recommended: String?
    public let placeholder: String
}

/// One decided step in the Decisions inspector.
public struct DecisionRow: Identifiable, Equatable, Sendable {
    public var id: String { step }
    public let step: String
    public let label: String
    public let decision: String
    /// True when the person made the call; false when Claude did.
    public let byUser: Bool
}

public struct ThreadMessage: Identifiable, Equatable, Sendable {
    public var id: String { "\(step)|\(time)|\(fromUser ? "u" : "c")|\(text.hashValue)" }
    public let step: String
    public let fromUser: Bool
    public let text: String
    public let time: String
}

public struct ActivityItem: Identifiable, Equatable, Sendable {
    public let id: Int
    public let message: String
    /// info, ok, warn, error, ask, you or sys.
    public let level: String
    public let time: String
    public var date: Date? { ActivityItem.parse(time) }
    nonisolated(unsafe) private static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    nonisolated(unsafe) private static let plain = ISO8601DateFormatter()
    public static func parse(_ text: String) -> Date? { formatter.date(from: text) ?? plain.date(from: text) }
}

public extension SessionSnapshot {
    /// Nothing has been pushed and Claude has said nothing yet (the web console shows its intake box here; the app never does).
    var isFresh: Bool {
        let anyStep = raw["steps"].object.values.contains { $0["status"].string != nil }
        let anyActivity = raw["activity"].array.contains { $0["level"].string != "sys" }
        return !anyStep && !anyActivity
    }
    /// The pending question, if Claude has asked one and it hasn't been answered.
    var ask: DirectorAsk? {
        let value = raw["ask"]
        guard case .object = value, value["answered"] == .null, let id = value["id"].identifier,
              let question = value["question"].string else { return nil }
        let options = value["options"].array.compactMap { option -> DirectorAsk.Option? in
            guard let id = option["id"].identifier else { return nil }
            return DirectorAsk.Option(id: id, label: option["label"].string ?? id, detail: option["detail"].string ?? "")
        }
        return DirectorAsk(id: id, step: value["step"].string ?? currentStep, question: question, context: value["context"].string ?? "",
                           options: options, recommended: value["recommended"].identifier,
                           placeholder: value["placeholder"].string ?? "Or type your answer, paste text, or a link")
    }
    /// The step is the person's turn: a question is open, nothing has started, or it awaits and they haven't answered yet.
    var isWaitingOnUser: Bool {
        if ask != nil || isFresh { return true }
        let payload = step(currentStep)
        guard payload["status"].string == "awaiting" else { return false }
        let sent = payload["sent"]
        return sent == .null || sent["type"].string == "note"
    }
    var isDecideRest: Bool { raw["decide_rest"] != .null }
    var isFinalDone: Bool { final["status"].string == "done" }
    /// What Claude is doing now, newest first, without the console's own plumbing.
    var activityFeed: [ActivityItem] {
        raw["activity"].array.enumerated().compactMap { index, entry in
            guard let message = entry["msg"].string, entry["level"].string != "sys" else { return nil }
            return ActivityItem(id: index, message: message, level: entry["level"].string ?? "info", time: entry["t"].string ?? "")
        }.reversed()
    }
    /// Every decided step with its decision, in step order.
    var decisions: [DecisionRow] {
        StepCatalog.order.compactMap { name in
            let payload = step(name)
            guard payload["status"].string == "done", let decision = payload["decision"].string, !decision.isEmpty else { return nil }
            let sentType = payload["sent"]["type"].string
            let byUser = (sentType != nil && sentType != "decide") || payload["by"].string == "user"
            return DecisionRow(step: name, label: StepCatalog.label(name), decision: decision, byUser: byUser)
        }
    }
    /// The discussion on one step: the person's notes and Claude's replies, oldest first.
    func thread(for name: String) -> [ThreadMessage] {
        step(name)["thread"].array.compactMap { message in
            guard let text = message["text"].string else { return nil }
            return ThreadMessage(step: name, fromUser: message["who"].string == "you", text: text, time: message["t"].string ?? "")
        }
    }
    /// Every discussion across the film, oldest first.
    var conversation: [ThreadMessage] {
        StepCatalog.order.flatMap { thread(for: $0) }.sorted { $0.time < $1.time }
    }
    /// Notes left on the animatic or the final that Claude hasn't applied yet.
    func openNotes(step name: String? = nil) -> [ReviewNote] {
        notes.filter { $0.state == "open" && (name == nil || $0.step == name) }
    }
    /// A step the person already answered, so the console is waiting for Claude (not for them).
    func hasSent(_ name: String) -> Bool {
        let sent = step(name)["sent"]
        return sent != .null && sent["type"].string != "note"
    }
    /// Claude has been told something on this step and has not answered yet.
    func isReplyPending(for name: String) -> Bool {
        guard let last = thread(for: name).last, last.fromUser else { return false }
        return raw["working"] != .null
    }
}
