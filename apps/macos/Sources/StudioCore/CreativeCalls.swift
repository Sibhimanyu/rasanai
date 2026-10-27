import Foundation

// Plan 10 U1: the five creative calls, each with a different job. Build progress between Storyboard and Final is NOT a sixth approval. Pure functions over a
// SessionSnapshot: nothing here changes the session, the stepper, or any saved series default.

public enum CreativeCall: String, CaseIterable, Sendable, Identifiable {
    case brief, story, look, storyboard, final
    public var id: String { rawValue }
    public var number: Int { (Self.allCases.firstIndex(of: self) ?? 0) + 1 }
    public var title: String {
        switch self {
        case .brief: "Brief"
        case .story: "Story"
        case .look: "Look"
        case .storyboard: "Storyboard"
        case .final: "Final"
        }
    }
    /// What is on the screen for this call.
    public var material: String {
        switch self {
        case .brief: "Your assignment: the audience, the assets and what we assumed."
        case .story: "The idea and the order it is told in, with the copy and the proof."
        case .look: "The same moment drawn in each visual language, and what each means."
        case .storyboard: "The shots, what happens in each, and how long they run, with a timed animatic."
        case .final: "The finished film, its versions and what was checked."
        }
    }
    /// What pressing the primary button means. Different for every call, on purpose.
    public var approvalMeaning: String {
        switch self {
        case .brief: "These are the inputs and the outcome you want."
        case .story: "This idea and the order of the communication are approved."
        case .look: "This visual system is approved. Individual shots are not yet."
        case .storyboard: "The detailed shots and timing are approved. The film gets built from this."
        case .final: "This film is accepted, or you list the changes you want."
        }
    }
    public var legacySteps: [String] {
        switch self {
        case .brief: ["brief"]
        case .story: ["story", "concept"]
        case .look: ["look", "films", "direction"]
        case .storyboard: ["animatic"]
        case .final: ["render", "final"]
        }
    }
    public init?(route: StageRoute) {
        switch route {
        case .brief: self = .brief
        case .story: self = .story
        case .look: self = .look
        case .animatic: self = .storyboard
        case .final: self = .final
        default: return nil
        }
    }
}

public enum ApprovalSource: Equatable, Sendable {
    case you
    case justMakeIt
    case decideRest
    case series(String?)

    /// Where the decision came from, in words.
    public var label: String {
        switch self {
        case .you: "Decided by you"
        case .justMakeIt: "Chosen for you (Just make it)"
        case .decideRest: "Chosen for you (you asked Claude to decide the rest)"
        case .series(let name): name.map { "Inherited from the series “\($0)”" } ?? "Inherited from the series"
        }
    }
    public var isInherited: Bool { self != .you }
}

public struct CallState: Equatable, Sendable, Identifiable {
    public enum Status: String, Sendable { case done, current, upcoming }
    public var id: String { call.rawValue }
    public var call: CreativeCall
    public var status: Status
    /// Present when the call is decided (or will be decided) without the person pressing its button.
    public var source: ApprovalSource?
}

public enum CallJourney {
    /// The five calls with their real status and, for an inherited or auto-approved one, where the decision came from. Revisiting one never changes saved series defaults:
    /// this only reads.
    public static func states(_ snapshot: SessionSnapshot) -> [CallState] {
        let currentCall = CreativeCall.allCases.first { $0.legacySteps.contains(snapshot.currentStep) } ?? (snapshot.currentStep == "build" ? .storyboard : nil)
        let order = CreativeCall.allCases
        let currentIndex = currentCall.flatMap { order.firstIndex(of: $0) } ?? 0
        let seriesName = snapshot.raw["series"]["name"].string ?? snapshot.raw["series"]["title"].string
        let hasSeries = snapshot.raw["series"] != .null && (snapshot.raw["series"]["inherit"] != .null || seriesName != nil)
        let decideRest = snapshot.raw["decide_rest"] != .null
        return order.enumerated().map { index, call in
            let payloads = call.legacySteps.map { snapshot.step($0) }.filter { $0 != .null }
            let done = payloads.contains { $0["status"].string == "done" } || (index < currentIndex && !payloads.isEmpty)
            let sent = payloads.compactMap { $0["sent"]["type"].string }.last
            var source: ApprovalSource?
            if sent == "decide" { source = .justMakeIt }
            else if payloads.contains(where: { $0["inherited"] != .null || $0["auto"] != .null }) { source = hasSeries ? .series(seriesName) : .justMakeIt }
            else if done, sent != nil { source = .you }
            else if decideRest && (done || index > currentIndex) && call != .final { source = .decideRest }
            let status: CallState.Status = index < currentIndex ? .done : index == currentIndex ? .current : .upcoming
            return CallState(call: call, status: status, source: source)
        }
    }

    /// Between Storyboard and Final: progress, not a call.
    public static func isBuildProgress(_ route: StageRoute) -> Bool { route == .build }
    public static let buildCaption = "Building your film. This is progress, not a call: nothing here needs your approval."
}

// MARK: Honest names for what is on screen

public enum MediaKind: String, Sendable, Equatable {
    case styleframe, animatic, slideshow, proxy, final

    /// The label that must sit next to the picture.
    public var label: String {
        switch self {
        case .styleframe: "A still picture of the look. Not the film yet."
        case .animatic: "A rough cut: stills timed to the music, to judge the pacing. Not animated yet."
        case .slideshow: "A slideshow of stills. Not animated yet."
        case .proxy: "A quick preview to check the film. The full-quality final comes next."
        case .final: "Final film."
        }
    }
    public var shortLabel: String {
        switch self {
        case .styleframe: "Still"
        case .animatic: "Rough cut"
        case .slideshow: "Slideshow"
        case .proxy: "Preview"
        case .final: "Final"
        }
    }
    /// Only a delivery-quality render may be presented as the finished film.
    public var mayBePresentedAsFinished: Bool { self == .final }

    /// `rendered` is a payload's own account of its media: kind "delivery" is final; a preview or a low-res render is a proxy; a stills-with-audio cut is an animatic.
    public static func of(payload: JSONValue, call: CreativeCall) -> MediaKind {
        let kind = (payload["kind"].string ?? payload["quality"].string ?? payload["mode"].string ?? "").lowercased()
        switch call {
        case .look: return .styleframe
        case .storyboard: return payload["video"].string != nil || payload["animatic_video"].string != nil ? .animatic : .slideshow
        case .final: return ["delivery", "final", "full"].contains(kind) || kind.isEmpty && payload["status"].string == "done" ? .final : .proxy
        default: return .styleframe
        }
    }
}

public enum AudienceTitle {
    /// A treatment's title is for the audience. Internal labels (“Story 2”, “Option A”, a beat id, the Sure/Bold/Wild angle) are never a film heading.
    public static func treatment(title: String, logline: String = "", index: Int = 0) -> String {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty, !isInternal(t) { return t }
        let words = logline.split(whereSeparator: { $0.isWhitespace }).prefix(6).map(String.init)
        let fromLine = words.joined(separator: " ").trimmingCharacters(in: CharacterSet(charactersIn: ".,;:!?—- "))
        return fromLine.isEmpty ? "Story idea \(index + 1)" : fromLine
    }
    static func isInternal(_ t: String) -> Bool {
        let lower = t.lowercased()
        if ["sure", "bold", "wild"].contains(lower) { return true }
        if lower.range(of: "^(story|option|treatment|take|angle|beat|idea|concept|b|s|t)[ _-]?[0-9a-z]?$", options: .regularExpression) != nil { return true }
        if lower.range(of: "^(story|option|treatment|take|angle|beat|idea|concept)[ _-]?[0-9]+$", options: .regularExpression) != nil { return true }
        if lower.range(of: "^[a-z]+(_[a-z0-9]+)+$", options: .regularExpression) != nil { return true }
        return false
    }
}
