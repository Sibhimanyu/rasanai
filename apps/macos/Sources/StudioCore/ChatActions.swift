import Foundation

/// What Rasan's chat reply may ask Studio to do, written by the model as one machine line after its words:
/// `<<actions>>[{"type":"tell_director","text":"..."}]`. Pure: parsing only, no I/O.
public enum ChatReplyAction: Equatable, Sendable {
    /// An instruction for the director and its crew (goes into the run's queue as a revision request).
    case tellDirector(String)
    case retryStep, restartRasan, pause, resume, viewActivity

    /// Restart and Pause only ever run after the person's own tap: the reply offers them as buttons instead.
    public var needsConsent: Bool { self == .restartRasan || self == .pause }

    /// The quick-action button for this action (nil: it is not a button).
    public var button: ChatQuickAction? {
        switch self {
        case .restartRasan: .restartRasan
        case .pause: .pauseRun
        case .retryStep: .retryStep
        case .resume: .resumeRun
        case .viewActivity: .viewActivity
        case .tellDirector: nil
        }
    }
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
        var out: [ChatReplyAction] = []
        for item in list.prefix(maxActions) {
            let action: ChatReplyAction?
            switch item["type"] as? String {
            case "tell_director":
                if let t = (item["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { action = .tellDirector(String(t.prefix(800))) } else { action = nil }
            case "retry_step": action = .retryStep
            case "restart_rasan": action = .restartRasan
            case "pause": action = .pause
            case "resume": action = .resume
            case "view_activity": action = .viewActivity
            default: action = nil
            }
            if let action, !out.contains(action) { out.append(action) }
        }
        return out
    }
}
