import Foundation

/// The words Studio uses for "your move", in one place: the turn line, Home, the Dock badge and notifications all read it.
public enum CallVocabulary {
    /// Steps that are one of the person's calls (or its twin step names).
    static let mainSteps: Set<String> = ["brief", "story", "concept", "look", "films", "animatic", "render", "final"]

    /// "pick a story", "approve the style frames"… for a step awaiting the person. `renderedPreview` tells the final's two
    /// moments apart: before there is anything to watch the call is to render it.
    public static func turnPhrase(step: String, hasPreview: Bool = true) -> String {
        switch step {
        case "brief": "confirm the brief"
        case "story", "concept": "pick a story"
        case "look", "films": "pick a look"
        case "direction": "pick a direction"
        case "styleframes": "approve the style frames"
        case "keyframes": "check the key poses"
        case "animatic": "review the storyboard"
        case "render", "final": hasPreview ? "review the film" : "render the final"
        case "footage": "choose the clips"
        case "reel": "check the cut"
        case "scenes": "check the scenes"
        case "storyboard": "approve the storyboard"
        case "music": "pick the music"
        case "voice": "pick the voice"
        case "motion": "pick the motion"
        case "transitions": "pick the transitions"
        case "brand": "check the brand"
        case "route": "pick the workflow"
        case "plan": "approve the plan"
        default: "decide: \(StepCatalog.label(step).lowercased())"
        }
    }

    /// The same, from a session: the final reads "render the final" until a video exists.
    public static func turnPhrase(step: String, in snapshot: SessionSnapshot) -> String {
        guard step == "render" || step == "final" else { return turnPhrase(step: step) }
        let payload = snapshot.step(step)
        let hasVideo = payload["video"].string != nil || !payload["videos"].array.isEmpty
        return turnPhrase(step: step, hasPreview: hasVideo)
    }

    /// The option titles of whichever list a call's payload carries.
    static let optionKeys = ["stories", "styles", "films", "options", "looks", "cells", "frames"]

    public static func options(_ payload: JSONValue) -> [JSONValue] {
        for key in optionKeys where !payload[key].array.isEmpty { return payload[key].array }
        return []
    }

    /// The title of the option Claude recommends, when the payload names one.
    public static func pickTitle(_ payload: JSONValue) -> String? {
        guard let id = payload["recommended"].identifier, !id.isEmpty else { return nil }
        for item in options(payload) where item["id"].identifier == id {
            if let name = item["title"].string ?? item["name"].string ?? item["label"].string { return name }
        }
        return nil
    }
}

/// What a call waiting for the person looks like from outside the film: one line for Home and one notification.
public struct CallNotice: Equatable, Sendable {
    public let id: String
    public let title: String
    public let body: String
}

public enum CallNotices {
    /// The step the person is being asked about, or nil when nothing is waiting. The final is left out: the render
    /// notification already says it is ready, and a second one would only repeat it.
    public static func waitingStep(_ snapshot: SessionSnapshot) -> String? {
        let step = snapshot.currentStep
        guard !["render", "final", "build"].contains(step) else { return nil }
        guard !snapshot.isFresh, snapshot.step(step)["status"].string == "awaiting", !snapshot.hasSent(step) else { return nil }
        return step
    }

    /// The notification to post when `new` moved into a call that `old` was not already waiting on. Nil on the first
    /// snapshot (opening a film is not news) and while the same call is still waiting.
    public static func notice(from old: SessionSnapshot?, to new: SessionSnapshot, film: String) -> CallNotice? {
        guard let old, let step = waitingStep(new), waitingStep(old) != step else { return nil }
        let payload = new.step(step)
        let pick = CallVocabulary.pickTitle(payload)
        let count = CallVocabulary.options(payload).count
        let title: String
        var body: String
        switch step {
        case "brief":
            title = "Tara wrote your brief"; body = "\(film): see what Claude understood and found."
        case "story", "concept":
            title = count == 1 ? "Kavi has a script for you" : count > 1 ? "Kavi has \(countWord(count)) scripts for you" : "Kavi has scripts for you"
            body = "\(film): pick the one worth telling."
        case "look", "films", "direction":
            title = count == 1 ? "Chitra has a look ready" : count > 1 ? "Chitra has \(countWord(count)) looks ready" : "Chitra has looks ready"
            body = "\(film): pick the visual world for this story."
        case "styleframes":
            title = "Chitra's style frames are ready"
            body = count > 0 ? "\(film): \(count) frames to look over before anything moves." : "\(film): look them over before anything moves."
        case "animatic":
            title = "Laya's storyboard is ready"; body = "\(film): check it with the music and leave notes."
        case "footage", "reel":
            title = "Mala logged your clips"; body = "\(film): look over the selects."
        default:
            title = "\(film) needs your call"; body = "Time to \(CallVocabulary.turnPhrase(step: step, in: new))."
        }
        if let pick { body += " Claude's pick: \(pick)." }
        return CallNotice(id: "call-\(step)", title: title, body: body)
    }

    private static func countWord(_ count: Int) -> String {
        [2: "two", 3: "three", 4: "four", 5: "five", 6: "six"][count] ?? String(count)
    }

    /// Home's context line for a film waiting on a call: "3 stories ready · Claude's pick: Twelve small victories".
    public static func homeDetail(_ snapshot: SessionSnapshot) -> String? {
        guard let step = waitingStep(snapshot) else { return nil }
        let payload = snapshot.step(step)
        let count = CallVocabulary.options(payload).count
        var parts: [String] = []
        switch step {
        case "story", "concept": if count > 0 { parts.append("\(count) \(count == 1 ? "story" : "stories") ready") }
        case "look", "films": if count > 0 { parts.append("\(count) \(count == 1 ? "look" : "looks") ready") }
        case "styleframes": if count > 0 { parts.append("\(count) style frames ready") }
        case "animatic": parts.append("Storyboard ready")
        default: break
        }
        if let pick = CallVocabulary.pickTitle(payload) { parts.append("Claude's pick: \(pick)") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// "Next: pick a look · in about 8 min": when the person is needed next, from where the director is now.
public enum NextNeeded {
    /// The calls in order. The style frames only count when the film has them.
    static let order = ["brief", "story", "look", "styleframes", "animatic", "final"]

    /// Typical minutes from the start of a call's preparation to the call, at Standard pace. Fast runs faster, Thorough slower.
    static let typicalMinutes: [String: Double] = ["brief": 3, "story": 8, "look": 10, "styleframes": 12, "animatic": 15, "final": 30]

    public static func call(forStep step: String) -> String? {
        switch step {
        case "brief", "route", "research", "brand", "footage": "brief"
        case "story", "concept": "story"
        case "look", "films", "direction", "motion", "transitions": "look"
        case "styleframes": "styleframes"
        case "animatic", "scenes", "storyboard", "keyframes", "voice", "music", "reel", "plan": "animatic"
        case "build", "render", "final": "final"
        default: nil
        }
    }

    /// The call the person is needed for next while Claude works. A decided call means the following one; a call
    /// Claude is still preparing is the one it is preparing. Nil once the film is on its final or nothing is known.
    public static func nextCall(_ snapshot: SessionSnapshot) -> String? {
        guard !snapshot.isFresh, let current = call(forStep: snapshot.currentStep) else { return nil }
        let status = snapshot.step(snapshot.currentStep)["status"].string
        var index = order.firstIndex(of: current) ?? 0
        if status == "done" || status == "awaiting" { index += 1 }
        guard index < order.count else { return nil }
        if order[index] == "styleframes", snapshot.step("styleframes") == .null { index += 1 }
        return index < order.count ? order[index] : nil
    }

    static func phrase(forCall call: String) -> String {
        switch call {
        case "final": "watch the preview"
        default: CallVocabulary.turnPhrase(step: call)
        }
    }

    /// Minutes to the next call, scaled to the pace and what has already elapsed. At least 1.
    public static func minutes(call: String, pace: FilmPace?, elapsedInCall: TimeInterval = 0) -> Int {
        let base = typicalMinutes[call] ?? 10
        let scale: Double
        switch pace { case .fast?: scale = 0.6; case .thorough?: scale = 1.6; default: scale = 1 }
        return max(1, Int((base * scale - elapsedInCall / 60).rounded()))
    }

    /// "next: pick a look · in about 8 min", or nil when there is nothing to say.
    public static func line(_ snapshot: SessionSnapshot, pace: FilmPace? = nil, elapsedInCall: TimeInterval = 0) -> String? {
        guard let call = nextCall(snapshot) else { return nil }
        let minutes = minutes(call: call, pace: pace, elapsedInCall: elapsedInCall)
        return "next: \(phrase(forCall: call)) · in about \(minutes) min"
    }
}

/// The Dock badge: how many films are waiting on the person.
public enum DockBadge {
    public static func label(waiting: Int) -> String? { waiting > 0 ? String(waiting) : nil }
}
