import Foundation

/// The rules that put the director's work into the eight phases. Everything here is pure and unit-tested against the
/// real ChatGPT run; every rule is listed in `ProgressPhaseMapper.rules` so the UI and the tests describe one thing.
///
/// A film moves through the phases once, forward only (the "frontier"). Evidence that the film has reached a phase comes from:
///  1. **Console steps** (`session.json`): a step pushed or decided belongs to a phase (`phase(forStep:)`). A step being
///     *done* also proves the *next* phase has begun at that moment (research done: Script begins; story done: Look; look done: Plan;
///     animatic done: Build; build done: Render).
///  2. **Console activity lines** (`activity[]` with timestamps), where a few wordings carry meaning once a build has started:
///     critic / fresh-eyes / gate / check wording means Check; "Rendering the final" means Render; "Building" means Build.
///  3. **Director log**: Agent descriptions (writers: Script; design-system designers: Look; key-frame designers or the Motion Director: Plan;
///     critics after a build: Check) and render commands (`hyperframes render --quality draft`: Check; `finish.mjs` or a delivery render: Render).
/// Evidence that needs an earlier phase first (Check, Render, Build) is ignored until the film has reached it, so a "check the researcher's
/// work" in Research never starts Check. Phases that never get evidence while a later one does are `skipped`.
public enum ProgressPhaseMapper {
    public static let rules: [String] = [
        "Step names: brief, route, research, brand, footage map to Research; story, concept to Script; look, films, direction to Look; motion, transitions, music, voice, scenes, storyboard, styleframes, keyframes, plan, reel to Plan; animatic to Animatic; build to Build; render, final to Render.",
        "A step that is done starts the next phase at its update time: research done starts Script, story done starts Look, look done starts Plan, animatic done starts Build, build done starts Render (the person's turn to press Render).",
        "A step the console pushed (\"Ready for you: the story\") puts the film in that step's phase, waiting for the person until they answer.",
        "Agent descriptions: 'script' writers or editors mean Script; 'design system' designers mean Look; 'key frames', 'Motion Director', 'score' mean Plan; critics, 'fresh eyes', 'grounding' after a build mean Check.",
        "Once Build has begun: critic, fresh-eyes, gate, 'checking every', 'checks came back' wording or a draft render means Check. A render that is not a draft (finish.mjs, delivery quality) or 'Rendering the final' means Render.",
        "Evidence for Build (from wording), Check or Render is ignored until the film has reached Animatic, Build or Build respectively.",
        "The film is finished when the render (or final) step is done. A phase with no evidence while a later phase started is skipped.",
        "Work is attributed to the phase the film was in at the time: sources, crew, tokens and cost are bucketed by phase window."
    ]

    /// Phase of a console step name; nil for steps that do not map (so the engine ignores them).
    public static func phase(forStep step: String) -> ProgressPhase? {
        let name = step.lowercased()
        for phase in ProgressPhase.allCases where phase.stepNames.contains(name) { return phase }
        switch name {
        case "brand", "footage": return .research
        default: return nil
        }
    }

    /// The phase that begins when `step` is done, if any.
    public static func phaseStarted(whenDone step: String) -> ProgressPhase? {
        switch step.lowercased() {
        case "research": .script
        case "story", "concept": .look
        case "look", "films", "direction": .plan
        case "animatic": .build
        case "build": .render
        default: nil
        }
    }

    /// What a piece of evidence says, and what it needs first.
    public struct Verdict: Equatable, Sendable {
        public var phase: ProgressPhase
        /// The phase the film must already have reached for this evidence to count.
        public var requires: ProgressPhase?
    }

    /// An Agent (crew) description.
    public static func verdict(forAgent description: String) -> Verdict? {
        let text = description.lowercased()
        if text.contains("script") && !text.contains("score") { return Verdict(phase: .script, requires: nil) }
        if text.contains("design system") || text.contains("design-system") { return Verdict(phase: .look, requires: nil) }
        if text.contains("key frame") || text.contains("keyframe") || text.contains("motion director") || text.contains("scoring")
            || text.contains("frame designer") { return Verdict(phase: .plan, requires: nil) }
        if text.contains("critic") || text.contains("fresh eyes") || text.contains("fresh-eyed") || text.contains("grounding")
            || text.contains("hostile") && !text.contains("script") { return Verdict(phase: .check, requires: .build) }
        if text.contains("render") && (text.contains("delivery") || text.contains("finish")) { return Verdict(phase: .render, requires: .build) }
        if text.contains("research") || text.contains("collecting") || text.contains("finding") || text.contains("studying") || text.contains("reading the earlier") {
            return Verdict(phase: .research, requires: nil)
        }
        return nil
    }

    /// A console activity message (`activity[].msg`) with its level. Step-keyed messages ("Ready for you: the story") are handled by the engine.
    public static func verdict(forActivity message: String) -> Verdict? {
        let text = message.lowercased()
        if text.hasPrefix("rendering the final") || text.contains("picking the final render") || text.contains("final render") && text.contains("start") {
            return Verdict(phase: .render, requires: .build)
        }
        if text.contains("critic") || text.contains("fresh-eyed") || text.contains("fresh eyes") || text.hasPrefix("checking every")
            || text.contains("checks came back") || text.contains("re-running every check") || text.contains("running the film's checks")
            || text.contains("first draft rendered") || text.contains("draft 2") || text.contains("slop check") || text.contains(" gate") {
            return Verdict(phase: .check, requires: .build)
        }
        if text.hasPrefix("building") || text.hasPrefix("working on the build") || text.contains("scene builder") || text.contains("animators are now") {
            return Verdict(phase: .build, requires: .animatic)
        }
        return nil
    }

    /// A render command: draft renders are Check, anything else is the Render phase.
    public static func verdict(forRenderCommand command: String) -> (kind: RenderProgress.Kind, verdict: Verdict)? {
        let lower = command.lowercased()
        if lower.contains("finish.mjs") { return (.final, Verdict(phase: .render, requires: .build)) }
        guard lower.contains("hyperframes render") || lower.contains("hyperframes\" render") else { return nil }
        if lower.contains("--help") { return nil }
        let draft = lower.contains("--quality draft") || lower.contains("-q draft") || lower.contains("renders/draft")
        return draft ? (.draft, Verdict(phase: .check, requires: .build)) : (.final, Verdict(phase: .render, requires: .build))
    }

    /// Typical working minutes per phase, from the real ChatGPT film (used for "about N min left" until progress can be measured).
    public static func typicalSeconds(_ phase: ProgressPhase, quickResearch: Bool = false, filmSeconds: Double = 30) -> TimeInterval {
        switch phase {
        case .research: quickResearch ? 150 : 420
        case .script: 600
        case .look: 900
        case .plan: 1_800
        case .animatic: 180
        case .build: 2_400
        case .check: 1_800
        case .render: max(180, filmSeconds * 10)
        }
    }
}
