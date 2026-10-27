import Foundation

/// How deep a chat message to the director may go and what it should bring back. The one place this wording lives.
///
/// A chat message reaches the director as a console `note`; the person's words stay in `note` (that is what the thread shows), and
/// `value.chat` carries these rules plus a small, bounded context packet, so Rasan knows why the person is asking without digging.
/// There is no engine-side cap on tool calls per reply, so the limit is stated here, the way `ResearchBudget` states the research cap.
public enum DirectorChatRules {
    /// Sentences in a reply, unless the person asked for detail.
    public static let maxSentences = 3
    /// Tool calls Rasan may spend finding the answer before it replies.
    public static let maxToolCalls = 3
    /// Recent events carried in the packet, and the longest line kept from each.
    public static let maxEvents = 5
    static let maxLine = 160

    /// The standing instruction sent with every chat message.
    public static let instruction = """
        This is a chat message from the person in RasanAI Studio. Answer it with console.mjs reply on the same step, \
        in at most \(maxSentences) short sentences, unless they clearly asked for detail. Answer only what they asked, \
        using the context packet first. Never recap the whole film or its history. Use at most \(maxToolCalls) tool calls \
        to find the answer before you reply; if that is not enough, say what you know and what you would check next. \
        Then go back to the step you were on.
        """

    /// The `value` of the chat `note`: `{chat: {rules, max_sentences, max_tool_calls, context: {step, looking_at, blocked, last_error, recent_events}}}`.
    public static func packet(step: String, lookingAt: String?, blocked: DirectorBlock?, lastError: String?, recentEvents: [String]) -> JSONValue {
        func clip(_ s: String) -> String { ChatAnswerer.clip(s, maxLine) }
        var context: [String: JSONValue] = ["step": .string(step)]
        if let lookingAt, !lookingAt.isEmpty { context["looking_at"] = .string(clip(lookingAt)) }
        if let blocked { context["blocked"] = .string(clip(blocked.message + " " + blocked.technical)) }
        if let lastError, !lastError.isEmpty { context["last_error"] = .string(clip(lastError)) }
        let events = recentEvents.suffix(maxEvents).map { JSONValue.string(clip($0)) }
        if !events.isEmpty { context["recent_events"] = .array(events) }
        return .object(["chat": .object([
            "rules": .string(instruction),
            "max_sentences": .number(Double(maxSentences)),
            "max_tool_calls": .number(Double(maxToolCalls)),
            "context": .object(context),
        ])])
    }
}
