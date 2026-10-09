import Foundation

// The public model behind the Film progress screen. Pure value types: the UI reads a `FilmProgressSnapshot`,
// the engine (`FilmProgressEngine`) produces it from session.json, director.log and the project folder.

// MARK: Phases

/// The eight phases of a film, in order.
public enum ProgressPhase: String, CaseIterable, Codable, Sendable, Identifiable, Comparable {
    case research, script, look, plan, animatic, build, check, render

    public var id: String { rawValue }
    public var index: Int { Self.allCases.firstIndex(of: self) ?? 0 }
    public static func < (a: Self, b: Self) -> Bool { a.index < b.index }

    public var title: String {
        switch self {
        case .research: "Research"
        case .script: "Script"
        case .look: "Look"
        case .plan: "Plan"
        case .animatic: "Animatic"
        case .build: "Build"
        case .check: "Check"
        case .render: "Render"
        }
    }

    /// One plain sentence of what happens in this phase, for tooltips and empty states.
    public var summary: String {
        switch self {
        case .research: "Reading the product, brand and screens, and how its past films were made."
        case .script: "Three writers draft scripts, an editor reads them, you pick one."
        case .look: "Three designers each build a look for that story, you pick one."
        case .plan: "Motion, transitions, music and key frames for every scene."
        case .animatic: "The timed storyboard with the music, ready for your notes."
        case .build: "Animators build every scene on top of the shared set."
        case .check: "Gates and critics watch the built film, and fixes go back in."
        case .render: "The final film is rendered, with motion blur and grain."
        }
    }

    /// An SF Symbol for the phase rail.
    public var symbolName: String {
        switch self {
        case .research: "magnifyingglass"
        case .script: "text.alignleft"
        case .look: "paintpalette"
        case .plan: "square.grid.3x3"
        case .animatic: "play.rectangle"
        case .build: "hammer"
        case .check: "checkmark.seal"
        case .render: "film"
        }
    }

    /// Console step names that belong to this phase (see `ProgressPhaseMapper`).
    public var stepNames: [String] {
        switch self {
        case .research: ["brief", "route", "research"]
        case .script: ["story", "concept"]
        case .look: ["look", "films", "direction"]
        case .plan: ["motion", "transitions", "music", "voice", "scenes", "storyboard", "styleframes", "keyframes", "plan", "reel"]
        case .animatic: ["animatic"]
        case .build: ["build"]
        case .check: []
        case .render: ["render", "final"]
        }
    }
}

public enum PhaseState: String, Codable, Sendable {
    case upcoming, active, waitingForYou, done, skipped
}

/// A rough "about N min left" for a phase.
public struct PhaseEstimate: Codable, Equatable, Sendable {
    public enum Basis: String, Codable, Sendable {
        /// From how long this phase usually takes.
        case typical
        /// From progress that was actually measured (scenes done, frames rendered).
        case measured
    }
    public var secondsLeft: TimeInterval
    public var basis: Basis
    public init(secondsLeft: TimeInterval, basis: Basis) { self.secondsLeft = secondsLeft; self.basis = basis }
    /// "about 3 min", "under a minute", "about 1 h 10 min".
    public var text: String { FilmProgressFormat.about(secondsLeft) }
}

/// One row of the phase rail: state, wall-clock window, tokens and cost.
public struct PhaseSummary: Identifiable, Codable, Equatable, Sendable {
    public var phase: ProgressPhase
    public var state: PhaseState
    public var startedAt: Date?
    public var endedAt: Date?
    /// Seconds spent waiting on the person inside this phase's window (a question or a pick). Not work time.
    public var waitingSeconds: TimeInterval = 0
    public var tokens = TokenTotals()
    /// Dollars (reported by the CLI where known, else estimated from the price table).
    public var costUSD: Double = 0
    public var costIsEstimated = false
    /// Subscription use: tokens count, no dollar figure.
    public var isIncludedInPlan = false
    public var estimate: PhaseEstimate?
    /// Times the phase restarted its loop (critic rounds in Check, draft renders, script rewrites).
    public var rounds = 0

    public var id: String { phase.rawValue }

    public init(phase: ProgressPhase, state: PhaseState = .upcoming, startedAt: Date? = nil, endedAt: Date? = nil) {
        self.phase = phase; self.state = state; self.startedAt = startedAt; self.endedAt = endedAt
    }

    /// Wall-clock seconds from start to end (or to `now` while the phase is open).
    public func wallSeconds(now: Date) -> TimeInterval {
        guard let startedAt else { return 0 }
        return max(0, (endedAt ?? now).timeIntervalSince(startedAt))
    }
    /// Wall-clock time minus time spent waiting for the person.
    public func workSeconds(now: Date) -> TimeInterval { max(0, wallSeconds(now: now) - waitingSeconds) }

    /// "Research · 1m 52s · $0.84" for rail rows and VoiceOver. Costless and timeless phases drop those parts.
    public func railText(now: Date) -> String {
        var parts = [phase.title]
        if startedAt != nil, state != .upcoming, state != .skipped { parts.append(FilmProgressFormat.duration(workSeconds(now: now))) }
        if let cost = costText { parts.append(cost) }
        return parts.joined(separator: " · ")
    }

    public var costText: String? {
        if tokens.isEmpty && costUSD == 0 { return nil }
        if isIncludedInPlan { return FilmProgressFormat.tokens(tokens.fresh) }
        return (costIsEstimated ? "est. " : "") + UsageFormat.dollars(costUSD)
    }
}

// MARK: The "now" sentence

public struct NowLine: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case reading, searching, writing, drawing, building, checking, rendering, thinking, waiting, finished, idle }
    public var phase: ProgressPhase
    public var kind: Kind
    /// One plain line: "Reading openai.com/chatgpt/desktop (4 of 6 sources)", "Drawing key frame 3 of 8",
    /// "Rendering 412 of 900 frames, about 1 min left".
    public var text: String
    /// Optional second line for the header (what the crew is doing).
    public var detail: String?
    public var since: Date?
    public init(phase: ProgressPhase, kind: Kind, text: String, detail: String? = nil, since: Date? = nil) {
        self.phase = phase; self.kind = kind; self.text = text; self.detail = detail; self.since = since
    }
}

// MARK: Per-phase details

public struct ResearchSource: Identifiable, Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case page, search }
    public var id: String
    public var kind: Kind
    /// The URL for a page (absolute string); the query text for a search.
    public var target: String
    /// "openai.com" for a page, the query for a search.
    public var host: String
    /// "openai.com/chatgpt/desktop": host plus a trimmed path, for the list.
    public var display: String
    public var time: Date
    /// The crew member that read it (a researcher's description), if a helper did.
    public var by: String?
    public init(id: String, kind: Kind, target: String, host: String, display: String, time: Date, by: String? = nil) {
        self.id = id; self.kind = kind; self.target = target; self.host = host; self.display = display; self.time = time; self.by = by
    }
    public var url: URL? { kind == .page ? URL(string: target) : nil }
    /// A favicon URL the UI may fetch (google s2 style); `nil` for searches.
    public var faviconHost: String? { kind == .page ? host : nil }
}

/// What Research has read so far, against the budget.
public struct ResearchProgress: Codable, Equatable, Sendable {
    public var sources: [ResearchSource] = []
    /// Pages read (WebFetch).
    public var pageCount = 0
    /// Searches made (WebSearch).
    public var searchCount = 0
    /// Findings pushed to the brief (count of `findings` entries), once the brief step shows them.
    public var findingsCount = 0
    public var findingsPushedAt: Date?
    public var budget: ResearchBudget?
    public var startedAt: Date?
    public var endedAt: Date?
    /// Seconds the person kept the director waiting during research (not counted as research time).
    public var waitingSeconds: TimeInterval = 0
    public init() {}
    /// Every source, pages and searches. This is the number "4 of 6 sources" counts.
    public var sourceCount: Int { pageCount + searchCount }
    public func elapsed(now: Date) -> TimeInterval {
        guard let startedAt else { return 0 }
        return max(0, (endedAt ?? now).timeIntervalSince(startedAt) - waitingSeconds)
    }
    /// True when elapsed time has passed `factor` times the budget (1.5 for the "time's up" note).
    public func isOver(budgetFactor factor: Double, now: Date) -> Bool {
        guard let budget, endedAt == nil, startedAt != nil else { return false }
        return elapsed(now: now) > budget.seconds * factor
    }
}

/// The research budget the budget agent sets (Quick 2 min / 6 sources, Standard 5 / 15, Deep none).
public struct ResearchBudget: Codable, Equatable, Sendable {
    public var seconds: TimeInterval
    public var sources: Int
    public init(seconds: TimeInterval, sources: Int) { self.seconds = seconds; self.sources = sources }
    public static let quick = ResearchBudget(seconds: 120, sources: 6)
    public static let standard = ResearchBudget(seconds: 300, sources: 15)
}

/// A crew member (a subagent the director dispatched): researchers, writers, designers, animators, critics.
public struct CrewMember: Identifiable, Codable, Equatable, Sendable {
    public enum State: String, Codable, Sendable { case running, done, failed }
    public var id: String
    /// The Agent call's description: "Writing the Bold script", "Designing key frames 3-4".
    public var name: String
    /// The Agent call's subagent type, when it has one.
    public var role: String?
    public var phase: ProgressPhase
    public var state: State
    public var startedAt: Date
    public var endedAt: Date?
    /// The helper's latest tool, in plain words ("Read a web page (openai.com)").
    public var lastAction: String?
    public init(id: String, name: String, role: String? = nil, phase: ProgressPhase, state: State = .running, startedAt: Date, endedAt: Date? = nil, lastAction: String? = nil) {
        self.id = id; self.name = name; self.role = role; self.phase = phase; self.state = state; self.startedAt = startedAt; self.endedAt = endedAt; self.lastAction = lastAction
    }
}

/// A key frame, specimen or storyboard image that appeared in the project folder.
public struct KeyframeThumb: Identifiable, Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case keyframe, specimen, storyboard, still }
    public var id: String
    public var label: String
    public var kind: Kind
    public var url: URL
    public var addedAt: Date
    /// The scene this belongs to ("s3" or "3"), when the name says so.
    public var sceneID: String?
    public init(id: String, label: String, kind: Kind, url: URL, addedAt: Date, sceneID: String? = nil) {
        self.id = id; self.label = label; self.kind = kind; self.url = url; self.addedAt = addedAt; self.sceneID = sceneID
    }
}

public struct SceneProgress: Identifiable, Codable, Equatable, Sendable {
    public enum State: String, Codable, Sendable { case todo, working, done }
    public var id: String
    public var title: String
    public var duration: Double
    public var state: State
    public var thumbnailURL: URL?
    public init(id: String, title: String, duration: Double, state: State, thumbnailURL: URL? = nil) {
        self.id = id; self.title = title; self.duration = duration; self.state = state; self.thumbnailURL = thumbnailURL
    }
}

/// A critic round's finding and what became of it.
public struct CriticFinding: Identifiable, Codable, Equatable, Sendable {
    public enum State: String, Codable, Sendable { case found, fixing, fixed, clean }
    public var id: String
    /// 1-based round within the Check phase.
    public var round: Int
    /// "Motion critic", "Fresh-eyed film critic", "Gates".
    public var source: String
    public var summary: String
    public var state: State
    public var time: Date
    public init(id: String, round: Int, source: String, summary: String, state: State, time: Date) {
        self.id = id; self.round = round; self.source = source; self.summary = summary; self.state = state; self.time = time
    }
}

public struct DraftRender: Identifiable, Codable, Equatable, Sendable {
    public var id: String
    /// "draft-v2" from `draft-v2.mp4`.
    public var name: String
    public var url: URL
    public var finishedAt: Date
    public var sizeBytes: Int64
    public init(id: String, name: String, url: URL, finishedAt: Date, sizeBytes: Int64) {
        self.id = id; self.name = name; self.url = url; self.finishedAt = finishedAt; self.sizeBytes = sizeBytes
    }
}

public struct RenderProgress: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case none, draft, final }
    public enum State: String, Codable, Sendable { case notStarted, preparing, rendering, finishing, done }
    public var kind: Kind = .none
    public var state: State = .notStarted
    public var framesDone: Int?
    public var framesTotal: Int?
    /// 0...1 when it can be measured (frames, or the tool's own percent); nil means show an indeterminate bar.
    public var fraction: Double?
    public var etaSeconds: TimeInterval?
    public var startedAt: Date?
    public var finishedAt: Date?
    /// The render tool's own stage line: "Streaming frame 412/900 (3 workers)", "Assembling final video".
    public var stage: String?
    public var outputName: String?
    public var posterURL: URL?
    public var videoURL: URL?
    /// False when only elapsed time is known.
    public var isMeasured: Bool { fraction != nil }
    public init() {}
    public func elapsed(now: Date) -> TimeInterval {
        guard let startedAt else { return 0 }
        return max(0, (finishedAt ?? now).timeIntervalSince(startedAt))
    }
}

// MARK: Activity timeline

public struct ProgressActivity: Identifiable, Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case milestone, source, crew, file, command, note, ask, answer, critic, render, warning }
    public var id: String
    public var time: Date
    public var phase: ProgressPhase
    public var kind: Kind
    public var title: String
    public var detail: String?
    public var symbolName: String {
        switch kind {
        case .milestone: "flag.fill"
        case .source: "globe"
        case .crew: "person.2"
        case .file: "doc"
        case .command: "terminal"
        case .note: "text.bubble"
        case .ask: "questionmark.bubble"
        case .answer: "checkmark.bubble"
        case .critic: "eye"
        case .render: "film"
        case .warning: "exclamationmark.triangle"
        }
    }
    public init(id: String, time: Date, phase: ProgressPhase, kind: Kind, title: String, detail: String? = nil) {
        self.id = id; self.time = time; self.phase = phase; self.kind = kind; self.title = title; self.detail = detail
    }
}

// MARK: Snapshot

/// Everything the Film progress screen needs, at one moment. Build one with `FilmProgressEngine`, or take a fixture.
public struct FilmProgressSnapshot: Codable, Equatable, Sendable {
    public var title = ""
    /// One summary per phase, always all eight, in order.
    public var phases: [PhaseSummary] = ProgressPhase.allCases.map { PhaseSummary(phase: $0) }
    /// The phase the director is in, or the last one reached.
    public var currentPhase: ProgressPhase = .research
    public var now = NowLine(phase: .research, kind: .idle, text: "Getting ready")
    public var startedAt: Date?
    public var finishedAt: Date?
    /// The clock the snapshot was made at (so views can compute durations without `Date()`).
    public var asOf = Date()
    /// Overall "about N min left" across the remaining phases; nil when the film is done or nothing is known.
    public var remaining: PhaseEstimate?
    public var isWaitingForYou = false
    /// The director's latest plain-words tool calls (commands run, files written), newest last, capped at 80. For the "Details" disclosure.
    public var recentTools: [ProgressActivity] = []

    public var research = ResearchProgress()
    /// Crew members seen, newest first. Filter by `phase` and `state` for the active row of avatars.
    public var crew: [CrewMember] = []
    /// Key frames, specimens and storyboard images, in the order they appeared.
    public var keyframes: [KeyframeThumb] = []
    /// Key frames expected in total (from the plan's scene count), for "3 of 8".
    public var keyframesExpected: Int?
    public var scenes: [SceneProgress] = []
    public var buildStages: [String] = []
    public var newestStill: URL?
    public var criticFindings: [CriticFinding] = []
    public var drafts: [DraftRender] = []
    public var render = RenderProgress()
    /// Newest last.
    public var activity: [ProgressActivity] = []
    public var totalTokens = TokenTotals()
    public var totalCostUSD: Double = 0
    public var costIsEstimated = false
    public var isIncludedInPlan = false

    public init() {}

    public func summary(_ phase: ProgressPhase) -> PhaseSummary { phases.first { $0.phase == phase } ?? PhaseSummary(phase: phase) }
    public func activity(for phase: ProgressPhase) -> [ProgressActivity] { activity.filter { $0.phase == phase } }
    /// Activity grouped by phase in phase order, skipping empty phases; items inside a group are oldest first.
    public var activityByPhase: [(phase: ProgressPhase, items: [ProgressActivity])] {
        ProgressPhase.allCases.compactMap { phase in
            let items = activity(for: phase)
            return items.isEmpty ? nil : (phase, items)
        }
    }
    public func crew(in phase: ProgressPhase, running: Bool? = nil) -> [CrewMember] {
        crew.filter { $0.phase == phase && (running == nil || ($0.state == .running) == running!) }
    }
    public func elapsed(now: Date) -> TimeInterval {
        guard let startedAt else { return 0 }
        return max(0, (finishedAt ?? now).timeIntervalSince(startedAt))
    }
    /// Research elapsed time against the budget (for the budget agent): nil before research starts.
    public func researchElapsed(now: Date) -> TimeInterval? { research.startedAt == nil ? nil : research.elapsed(now: now) }
    public func isResearchOverBudget(factor: Double = 1.5, now: Date) -> Bool { research.isOver(budgetFactor: factor, now: now) }
    public func equalsIgnoringClock(_ other: Self) -> Bool { var a = self, b = other; a.asOf = b.asOf; return a == b }
}

// MARK: Formatting

public enum FilmProgressFormat {
    /// "1m 52s", "8s", "2h 14m".
    public static func duration(_ seconds: TimeInterval) -> String {
        let total = Int(max(0, seconds.rounded()))
        if total < 60 { return "\(total)s" }
        if total < 3_600 { return "\(total / 60)m \(String(format: "%02d", total % 60))s" }
        return "\(total / 3_600)h \(String(format: "%02d", (total % 3_600) / 60))m"
    }
    /// "about 3 min", "under a minute", "about 1 h 10 min".
    public static func about(_ seconds: TimeInterval) -> String {
        let minutes = Int((max(0, seconds) / 60).rounded(.up))
        if seconds < 45 { return "under a minute" }
        if minutes < 60 { return "about \(minutes) min" }
        let rest = (minutes % 60 / 5) * 5
        return rest == 0 ? "about \(minutes / 60) h" : "about \(minutes / 60) h \(rest) min"
    }
    public static func tokens(_ count: Int) -> String {
        UsageFormat.tokens(count) + " tokens"
    }
}

public extension ResearchBudget {
    /// The progress budget for a research depth; `nil` for Deep (no limit).
    init?(depth: FilmPace) {
        guard let minutes = depth.budgetMinutes, let sources = depth.sourceLimit else { return nil }
        self.init(seconds: minutes * 60, sources: sources)
    }
}
