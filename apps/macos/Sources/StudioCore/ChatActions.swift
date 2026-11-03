import Foundation

/// What Rasan's chat reply may ask Studio to do, written by the model as one machine line after its words:
/// `<<actions>>[{"type":"tell_director","text":"..."}]`. Pure: parsing only, no I/O.
public enum ChatReplyAction: Equatable, Sendable {
    /// An instruction for the director and its crew (goes into the run's queue as a revision request).
    case tellDirector(String)
    case retryStep, restartRasan, pause, resume, viewActivity
    /// Look for a tool the way its kind is found (executable on PATH, Python import, npm resolve, app folder) and report what was found where.
    case checkTool(String)
    /// Studio installs the tool (its managed setup, or pip for a Python package), streams the output into the chat, then checks it.
    case installTool(String)
    /// Answers the director's pending tool question with its skip choice (carry on without it).
    case continueWithout(String)
    /// Answers the director's pending question when the person clearly decided: one of its option ids, and/or their words.
    case answerAsk(choice: String?, text: String?)
    /// Re-evaluates an incident from real data (nil: all of them) and reports where each stands.
    case recheck(String?)
    /// Stops an install Studio is running for a tool.
    case cancelInstall

    /// The only actions that run on a turn the person did not write (a problem opened or cleared, or the results of an action): looking, never changing.
    public var readOnly: Bool { switch self { case .checkTool, .recheck: true; default: false } }

    /// These run only after the person's yes in the conversation: Rasan asks in words, the person says yes, and the next turn runs them.
    public var needsConsent: Bool {
        switch self { case .restartRasan, .pause, .installTool, .continueWithout: true; default: false }
    }
    /// What a proposal is called, so a yes can be matched with it.
    public var key: String {
        switch self {
        case .tellDirector: "tell_director"
        case .retryStep: "retry_step"
        case .restartRasan: "restart_rasan"
        case .pause: "pause"
        case .resume: "resume"
        case .viewActivity: "view_activity"
        case .checkTool(let t): "check_tool:" + ToolNeed.infer(t).name
        case .installTool(let t): "install_tool:" + ToolNeed.infer(t).name
        case .continueWithout(let t): "continue_without:" + ToolNeed.infer(t).name
        case .answerAsk(let c, let t): "answer_ask:" + (c ?? t ?? "")
        case .recheck(let id): "recheck:" + (id ?? "")
        case .cancelInstall: "cancel_install"
        }
    }
    /// The action in words, for telling Rasan what it proposed.
    public var words: String {
        switch self {
        case .restartRasan: "restart Rasan from the saved film"
        case .pause: "pause the run"
        case .installTool(let t): "install \(t)"
        case .continueWithout(let t): "carry on without \(t)"
        default: key
        }
    }
}

/// What running an action really did, in plain words, for the follow-up turn. `narrate`: Rasan should say what happened.
public struct ChatActionResult: Equatable, Sendable {
    public var text: String
    public var narrate: Bool
    public init(_ text: String, narrate: Bool = true) { self.text = text; self.narrate = narrate }
}

public enum ChatReplyParser {
    public static let marker = "<<actions>>"
    static let maxActions = 3

    /// The words to show, and the actions behind them. Safe on a half-written reply: a partial marker at the end is hidden too,
    /// so the machine line never flashes in the bubble while it types.
    public static func split(_ raw: String) -> (text: String, actions: [ChatReplyAction]) {
        guard let r = raw.range(of: marker) else { return (stripPartialMarker(raw).trimmingCharacters(in: .whitespacesAndNewlines), []) }
        let text = String(raw[..<r.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        return (text, parse(String(raw[r.upperBound...])))
    }

    /// Drops a trailing prefix of the marker ("<<", "<<act") that has not finished arriving.
    private static func stripPartialMarker(_ s: String) -> String {
        for n in stride(from: min(marker.count - 1, s.count), through: 1, by: -1) where marker.hasPrefix(String(s.suffix(n))) {
            return String(s.dropLast(n))
        }
        return s
    }

    static func parse(_ json: String) -> [ChatReplyAction] {
        var body = json.trimmingCharacters(in: .whitespacesAndNewlines)
        if let end = body.lastIndex(of: "]") { body = String(body[...end]) }
        guard let data = body.data(using: .utf8), let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        func string(_ item: [String: Any], _ keys: String...) -> String? {
            for k in keys { if let t = (item[k] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { return String(t.prefix(800)) } }
            return nil
        }
        var out: [ChatReplyAction] = []
        for item in list.prefix(maxActions) {
            let action: ChatReplyAction?
            switch item["type"] as? String {
            case "tell_director": action = string(item, "text").map(ChatReplyAction.tellDirector)
            case "retry_step": action = .retryStep
            case "restart_rasan": action = .restartRasan
            case "pause": action = .pause
            case "resume": action = .resume
            case "view_activity": action = .viewActivity
            case "check_tool": action = string(item, "name", "tool").map(ChatReplyAction.checkTool)
            case "install_tool": action = string(item, "name", "tool").map(ChatReplyAction.installTool)
            case "continue_without": action = string(item, "name", "tool").map(ChatReplyAction.continueWithout)
            case "answer_ask":
                let choice = string(item, "choice"), text = string(item, "text")
                action = choice == nil && text == nil ? nil : .answerAsk(choice: choice, text: text)
            case "recheck": action = .recheck(string(item, "id", "incident"))
            case "cancel_install": action = .cancelInstall
            default: action = nil
            }
            if let action, !out.contains(action) { out.append(action) }
        }
        return out
    }
}
