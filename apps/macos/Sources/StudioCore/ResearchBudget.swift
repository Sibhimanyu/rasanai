import Foundation

/// How fast the director works: the research budget and how the build is planned. Chosen in Settings → Director and per film.
public enum FilmPace: String, CaseIterable, Codable, Identifiable, Sendable {
    case fast, standard, thorough
    public var id: String { rawValue }
    /// What a film gets when nobody chose: new films start here.
    public static let defaultForNewFilms: FilmPace = .fast
    /// What a draft saved before this setting existed gets, so those films keep the research they always had.
    public static let legacy: FilmPace = .standard
    /// Maps the first version of this setting ("Research depth": quick, standard, deep) to its pace.
    public init?(legacyResearchDepth raw: String) {
        switch raw { case "quick": self = .fast; case "standard": self = .standard; case "deep": self = .thorough; default: return nil }
    }
    public var title: String {
        switch self { case .fast: "Fast"; case .standard: "Standard"; case .thorough: "Thorough" }
    }
    public var chipTitle: String { "\(title) pace" }
    public var summary: String {
        switch self {
        case .fast: "About 2 minutes of research, every scene built at once, Sonnet on the busywork and one review round. The fastest film."
        case .standard: "About 5 minutes of research, every scene built at once, up to two review rounds and two draft renders."
        case .thorough: "The engine's full process: deep research, its whole crew and every review round. Slowest, most thorough."
        }
    }
    /// Minutes of research the director is asked to stay within. nil means no limit.
    public var budgetMinutes: Double? {
        switch self { case .fast: 2; case .standard: 5; case .thorough: nil }
    }
    public var sourceLimit: Int? {
        switch self { case .fast: 6; case .standard: 15; case .thorough: nil }
    }
    /// Studio sends the "time's up" note once research has run this many times its budget.
    public static let overrunFactor = 1.5
    /// Seconds of research after which Studio steps in. nil for Thorough.
    public var timeBoxSeconds: TimeInterval? { budgetMinutes.map { $0 * 60 * Self.overrunFactor } }

    /// The research section of the launch prompt. It sits above the engine's own research rules (SKILL.md rule 13, `crew.mjs plan`).
    var launchSection: String? {
        switch self {
        case .fast: """
            RESEARCH BUDGET: FAST PACE. This is a hard limit the user chose, and it overrides the engine's research defaults (SKILL.md rule 13, the crew plan, the precedent researcher). Research for at most about 2 minutes and read at most 6 sources in total, counting every WebFetch and WebSearch.
            - Start with the product's own site and its help or docs pages. Only go elsewhere if those leave a gap.
            - Do not analyse other companies' launch films or past promo videos. Do not run the precedent researcher and do not pass --public to crew.mjs plan.
            - Do not dispatch a parallel research crew. Do the research yourself or with one single researcher subagent. Skip any research member you do not strictly need.
            - Stop the moment the essentials are known: what the product is, its one key feature, its brand type and colours, and its exact UI. Do not keep reading for completeness.
            - The files later steps need (research/design.md, research/design-refs.json, the truth sheet) must still exist. Write them short, from what you already read, in the same pass.
            - Still report what you found: push the brief step with `findings` as usual.
            """
        case .standard: """
            RESEARCH BUDGET: STANDARD PACE. This is a limit the user chose, and it overrides the engine's research defaults (SKILL.md rule 13, the crew plan). Research for about 5 minutes and read at most 15 sources in total, counting every WebFetch and WebSearch.
            - Start with the product's own site and help or docs pages, then its brand pages and one or two trusted third-party sources.
            - Do not do shot-by-shot analysis of other companies' launch films. Do not pass --public to crew.mjs plan.
            - Keep the crew small: at most two researchers in parallel. Stop when the essentials are known: what it is, its key features, brand type and colours, and the exact UI.
            - Still report what you found: push the brief step with `findings` as usual.
            """
        case .thorough: nil
        }
    }

    /// The build section of the launch prompt: how the plan is made and how the crew is run. It overrides the engine's crew
    /// defaults (key frames in batches, animators waiting on a shared build, several review rounds). `modelPlan` is the
    /// user's choice on the New film chip: a single-model plan wins over this section's Opus/Sonnet split.
    func buildSection(agent: String, modelPlan: ModelPlan) -> String? {
        guard self != .thorough else { return nil }
        let fast = self == .fast
        var lines = [
            "BUILD PLAN: \(title.uppercased()) PACE. This is a hard limit the user chose, and it overrides the engine's crew defaults (SKILL.md's phases, crew.mjs batching, the number of review rounds). The user wants this film built quickly.",
            fast
                ? "- The Motion Director's score takes at most about 10 minutes. It must fix every shared element (the world or set, palette, type, camera rail, transitions) as a written contract in the plan, so no scene depends on another being built first."
                : "- The Motion Director's score takes at most about 20 minutes. It must fix every shared element (the world or set, palette, type, camera rail, transitions) as a written contract in the plan, so no scene depends on another being built first.",
            "- Key frames: one agent per scene, all launched at once in the background (cap 10 at a time; with more scenes launch the rest as soon as one finishes). Never two scenes to one agent and never a sequential batch.",
            "- Animation: one agent per scene, all launched at once, starting immediately from the contract. No animator waits for a shared-world build. If a shared asset is needed, one extra agent builds it at the same time while the scenes use the contract's placeholders, and it is swapped in afterwards.",
        ]
        if fast {
            lines.append("- Exactly one critic round (one fresh-eyes review of the whole film). All its fixes run in parallel. Then one draft render, and push the Final call. No second or third review round and no second draft render unless a quality gate fails.")
        } else {
            lines.append("- At most two critic rounds (the second only if the first found real problems), with every round's fixes run in parallel, and at most two draft renders. Then push the Final call. No third round unless a quality gate fails.")
        }
        guard agent == "claude" else { return lines.joined(separator: "\n") }
        switch modelPlan {
        case .recommended:
            lines.append(fast
                ? "- Models (the user's Recommended plan): use Sonnet 5.5 subagents for key frames, scene animators, fix agents, gate checks and renders. Keep Opus 5.5 for the director itself, the script and design desks, the Motion Director's score and the ONE final fresh-eyes review. This split replaces the model assignments in the engine's crew files."
                : "- Models (the user's Recommended plan): use Opus 5.5 for the director, the script and design desks, the Motion Director's score, key frames and the critic rounds. Use Sonnet 5.5 subagents for scene animators, fix agents, gate checks and renders. This split replaces the model assignments in the engine's crew files.")
        case .opus:
            lines.append("- Models: the user chose Opus 5.5 for every role in the MODEL PLAN below, and that choice wins over any Sonnet assignment here. Keep Opus on every agent; only the structure above applies.")
        case .sonnet:
            lines.append("- Models: the user chose Sonnet 5.5 for every role in the MODEL PLAN below, and that choice wins over any Opus assignment here. Keep Sonnet on every agent; only the structure above applies.")
        case .settings:
            lines.append("- Models: the user left the model to Settings, so do not choose models per role; only the structure above applies.")
        }
        return lines.joined(separator: "\n")
    }
}

/// Whether Studio should step in on research that has run too long, and where the console accepts the note.
public struct ResearchTimeBox: Sendable {
    public static let noteText = "Time's up for research: go with what you have, and move on to the brief."
    public static let activityText = "Research ran past its time budget, so Studio asked the director to wrap up."
    /// Latched once the note went out (or was refused as not needed), so it is never sent twice for a run.
    public private(set) var fired = false
    public init() {}
    public mutating func reset() { fired = false }

    /// The step to send the note on, or nil when research is not what the director is doing.
    /// The console rejects unknown steps and stores `sent` only on steps present in session.json. Research happens
    /// while `brief` is still working (the seeded brief is pushed for confirmation only after it), so that is the
    /// step the director is waiting and polling on; `research` is used once the brief has been confirmed.
    public static func noteStep(in session: SessionSnapshot) -> String? {
        let brief = session.step("brief")["status"].string
        if brief == "awaiting" { return nil }                    // research is over: the user is reading the brief
        if brief != "done" { return "brief" }
        let research = session.step("research")["status"].string
        return research == "working" ? "research" : nil
    }

    /// Returns the step to send on when the note is due now. Call `markSent()` once the console accepted it.
    public func due(depth: FilmPace, researchElapsed: TimeInterval?, session: SessionSnapshot) -> String? {
        guard !fired, let limit = depth.timeBoxSeconds, let elapsed = researchElapsed, elapsed >= limit else { return nil }
        return Self.noteStep(in: session)
    }
    public mutating func markSent() { fired = true }
}

/// Applies `ResearchTimeBox` to a live run: sends the note at most once, even when checks overlap or the send is slow.
@MainActor
public final class ResearchEnforcer {
    private var box = ResearchTimeBox()
    private var sending = false
    public init() {}
    public var hasFired: Bool { box.fired }
    /// Forget the latch when a different run starts.
    public func reset() { box.reset(); sending = false }
    /// `send(step, type, note)` posts a console action and returns whether it was accepted; a refused send is retried on the next check.
    /// Returns true when the note went out on this call.
    @discardableResult
    public func check(depth: FilmPace, researchElapsed: TimeInterval?, session: SessionSnapshot,
                      send: (_ step: String, _ type: String, _ note: String) async -> Bool) async -> Bool {
        guard !sending, let step = box.due(depth: depth, researchElapsed: researchElapsed, session: session) else { return false }
        sending = true
        defer { sending = false }
        guard await send(step, "note", ResearchTimeBox.noteText) else { return false }
        box.markSent()
        return true
    }
}
