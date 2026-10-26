import Foundation

/// A Story or Look call that was closed without the person: Rasan decided it although they never chose it, did not press
/// "Just make it" and did not ask Claude to decide the rest. `console.mjs push` marks such a step `unconfirmed: true` (and
/// `by: "director"`); a run from before that flag is detected by a done step with no `by: "user"` and no answer of theirs.
public struct UnconfirmedCall: Equatable, Sendable {
    public let step: String
    public let stage: ReviewStage
    public let decision: String
    /// When the step was closed (identifies this decision, so "Keep it" is remembered for it and not for a later one).
    public let updated: String

    public var title: String { stage == .look ? "Rasan chose the look without asking you. Review it" : "Rasan chose the story without asking you. Review it" }
    public var reviewLabel: String { stage == .look ? "Review the look" : "Review the story" }
}

public extension SessionSnapshot {
    /// The first Story or Look decided without the person, or nil. Series defaults, answered preferences, "Just make it" and
    /// decide-the-rest are their own choices and never count; a branded look counts until they approve its styleframes call.
    var unconfirmedCall: UnconfirmedCall? {
        guard raw["decide_rest"] == .null else { return nil }
        let hasSeries = raw["series"] != .null
        for (name, stage) in [("story", ReviewStage.story), ("look", ReviewStage.look)] {
            let payload = step(name)
            guard payload["status"].string == "done" else { continue }
            let sentType = payload["sent"]["type"].string
            if payload["by"].string == "user" || sentType == "decide" || sentType == "decide-rest" { continue }
            if sentType != nil && sentType != "note" { continue }
            if payload["decided_for_you"].bool == true { continue }
            let auto = payload["auto"].string
            if payload["unconfirmed"].bool != true {
                if auto == "series" || auto == "prefs" || payload["inherited"] != .null || hasSeries { continue }
                if (payload["decision"].string ?? "").lowercased().hasPrefix("from your series") { continue }
            }
            // a branded direct film: the styleframes call is its Look call, so the person approving it confirms the look
            if name == "look" {
                let frames = step("styleframes")
                let framesType = frames["sent"]["type"].string
                if frames["status"].string == "done", frames["by"].string == "user" || (framesType != nil && framesType != "note") { continue }
            }
            return UnconfirmedCall(step: name, stage: stage, decision: payload["decision"].string ?? "", updated: payload["updated"].string ?? "")
        }
        return nil
    }
}
