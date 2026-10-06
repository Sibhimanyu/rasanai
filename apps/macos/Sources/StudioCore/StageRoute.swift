import Foundation

/// Which native screen a step of the director's session is drawn with. A pure mapping, mirroring `screenFor` in the
/// web console (`skills/rasanai/console/index.html`) so the native flow and the browser console agree.
public enum StageRoute: Hashable, Sendable {
    /// Claude is working (or nothing has been pushed yet): the activity feed, never an intake box.
    case working
    /// Call 01: confirm the brief.
    case brief
    /// Call 02: choose one of three scripts.
    case story
    /// Call 03: choose a look (`look` with `styles`, or the older `films`).
    case look
    /// Call 04: the timed animatic with the music.
    case animatic
    /// The build: newest still and the scene strip filling in.
    case build
    /// Call 05: the final (`render` / `final`).
    case final
    /// Every other step (brand, route, footage, reel, concept, scenes…), drawn by `StepPanel`.
    case panel(String)

    /// The step a stage view reads. `nil` for `.working`.
    public var step: String? {
        switch self {
        case .working: nil
        case .brief: "brief"
        case .story: "story"
        case .look: "look"
        case .animatic: "animatic"
        case .build: "build"
        case .final: "render"
        case .panel(let step): step
        }
    }
}

public enum StageRouter {
    /// `viewing` is a completed step pinned from the stage bar: it is shown as it was decided, not as "working".
    public static func route(_ snapshot: SessionSnapshot, viewing: String? = nil) -> StageRoute {
        let step = viewing ?? snapshot.currentStep
        let payload = snapshot.step(step)
        // A brand-new console (nothing pushed, nothing said): the person says what the video is about, like the web intake box.
        if step == "brief", viewing == nil, snapshot.isFresh { return .brief }
        guard case .object = payload else { return .working }
        let pinned = viewing != nil
        let status = payload["status"].string
        let busy = !pinned && !snapshot.isWaitingOnUser && status != "done" && step != "build" && step != "render" && step != "final"
        switch step {
        case "brief":
            return pinned || status == "awaiting" ? .brief : .working
        case "story":
            return busy ? .working : .story
        case "look":
            if payload["styles"] != .null { return busy ? .working : .look }
            return busy && status != "awaiting" ? .working : .panel("look")
        case "films":
            return busy ? .working : .look
        case "direction":
            if payload["films"] != .null { return busy ? .working : .look }
            return busy && status != "awaiting" ? .working : .panel("direction")
        case "animatic": return .animatic
        case "build": return .build
        case "render", "final": return .final
        default:
            return busy && status != "awaiting" ? .working : .panel(step)
        }
    }

    /// The step to pin when the person clicks a stage in the bar, if that stage has something to show.
    public static func pinStep(for stage: ReviewStage, in snapshot: SessionSnapshot) -> String? {
        let candidates: [String]
        switch stage {
        case .brief: candidates = ["brief"]
        case .story: candidates = ["story", "concept"]
        case .look: candidates = ["look", "films", "direction"]
        case .animatic: candidates = ["animatic", "build"]
        case .final: candidates = ["render", "final"]
        }
        return candidates.first { snapshot.step($0) != .null }
    }
}
