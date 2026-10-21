import Foundation

// Time estimates for the film working screen. Everything here is pure and deterministic: the history is handed in
// (never read inside the progress engine), so the replay harness gives the same numbers every time.
// Only `FilmTimingStore` and `FilmTimingContext.read` touch the disk, and the engine calls neither.

/// What a film is, as far as its running time goes. Recorded with every finished phase and used to scale old films onto a new one.
public struct FilmTimingContext: Codable, Equatable, Sendable {
    /// The film's route or kind (launch film, explainer, reel...). "film" when nothing says.
    public var kind = "film"
    public var route: String?
    public var lengthSeconds: Double = 30
    public var aspect = "16:9"
    /// "fast", "standard" or "thorough" (the research pace), when known.
    public var pace: String?
    /// ModelPlan raw value ("recommended", "opus", "sonnet", "settings"), when known.
    public var modelPlan: String?
    /// crew/budget.json level: "lean", "standard" or "full".
    public var crewBudget: String?
    public var sceneCount: Int?
    public var series = false
    public var footageLed = false
    /// Phases this film's route does not run (a series film's look is locked, a footage reel has no Look call).
    public var skipped: [ProgressPhase] = []
    public init() {}

    /// Reads the files that say how the run is set up: `crew/plan.json`, `crew/budget.json` and the project's `rasanai-brief.json`.
    /// Disk access: call it from the worker, never from the pure engine.
    public static func read(run: URL, project: URL?) -> FilmTimingContext {
        var c = FilmTimingContext()
        func object(_ url: URL) -> [String: Any]? {
            guard let data = try? Data(contentsOf: url) else { return nil }
            return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        }
        if let plan = object(run.appendingPathComponent("crew/plan.json")) {
            if let route = plan["route"] as? String, !route.isEmpty { c.route = route; c.kind = route }
            if plan["series"] != nil, !(plan["series"] is NSNull) { c.series = true }
            if let level = plan["budget"] as? String { c.crewBudget = level }
            let phases = (plan["phases"] as? [[String: Any]] ?? []).compactMap { $0["phase"] as? String }
            if phases.contains("look-series") { c.series = true }
            if let sources = plan["sources"], let data = try? JSONSerialization.data(withJSONObject: sources, options: [.fragmentsAllowed]),
               let text = String(data: data, encoding: .utf8)?.lowercased(), text.contains("footage") { c.footageLed = true }
            if let route = c.route?.lowercased(), route.contains("reel") || route.contains("footage") { c.footageLed = true }
        }
        if let level = (object(run.appendingPathComponent("crew/budget.json"))?["budget"] as? [String: Any])?["level"] as? String { c.crewBudget = level }
        if let project, let brief = object(project.appendingPathComponent("rasanai-brief.json")) {
            if let pace = brief["pace"] as? String { c.pace = pace }
            else if let depth = brief["researchDepth"] as? String, let pace = FilmPace(legacyResearchDepth: depth) { c.pace = pace.rawValue }
            if let plan = brief["modelPlan"] as? String { c.modelPlan = plan }
            if brief["series"] != nil, !(brief["series"] is NSNull) { c.series = true }
        }
        c.skipped = c.derivedSkips
        return c
    }

    /// Phases the route will not run, from what is known about it.
    public var derivedSkips: [ProgressPhase] { (series || footageLed) ? [.look] : [] }
}

/// One film's work time per finished phase (waiting for the person and paused time excluded), plus the features that explain it.
public struct FilmTimingRecord: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var recordedAt: Date
    /// True once the film finished; false for the partial record written when a phase ends.
    public var complete: Bool
    public var context: FilmTimingContext
    /// Phase raw value to work seconds, for the phases that ended.
    public var phaseSeconds: [String: Double]
    /// 2 once the clock leaves out the time no director ran. Older records (nil) may include plan limit waits.
    public var clock: Int?

    public init(id: String, recordedAt: Date, complete: Bool, context: FilmTimingContext, phaseSeconds: [String: Double], clock: Int? = 2) {
        self.id = id; self.recordedAt = recordedAt; self.complete = complete; self.context = context; self.phaseSeconds = phaseSeconds; self.clock = clock
    }

    /// The record for a snapshot, or nil when no phase has ended yet.
    public static func make(id: String, snapshot s: FilmProgressSnapshot) -> FilmTimingRecord? {
        var seconds: [String: Double] = [:]
        var context = s.timingContext ?? FilmTimingContext()
        var skipped = Set(context.skipped)
        for row in s.phases {
            if row.state == .skipped { skipped.insert(row.phase) }
            // A phase counts once it ended. A figure over four hours is a paused film, not work.
            if row.state == .done, row.startedAt != nil {
                let work = row.workSeconds(now: s.asOf)
                if work >= 1, work < 4 * 3_600 { seconds[row.phase.rawValue] = work }
            }
        }
        guard !seconds.isEmpty else { return nil }
        context.skipped = ProgressPhase.allCases.filter { skipped.contains($0) }
        return FilmTimingRecord(id: id, recordedAt: s.asOf, complete: s.finishedAt != nil, context: context, phaseSeconds: seconds)
    }
}

/// The JSONL history of past films: pure parsing and capping (see `FilmTimingStore` for the file).
public enum FilmTimingHistory {
    public static let capFilms = 200

    /// Newest line per film id, oldest film first, capped at the last 200 films.
    public static func compact(_ records: [FilmTimingRecord]) -> [FilmTimingRecord] {
        var latest: [String: FilmTimingRecord] = [:]
        for record in records { latest[record.id] = record }
        let ordered = latest.values.sorted { ($0.recordedAt, $0.id) < ($1.recordedAt, $1.id) }
        return Array(ordered.suffix(capFilms))
    }

    public static func parse(_ text: String) -> [FilmTimingRecord] {
        let decoder = decoder()
        return text.split(whereSeparator: \.isNewline).compactMap { try? decoder.decode(FilmTimingRecord.self, from: Data($0.utf8)) }
    }

    public static func line(_ record: FilmTimingRecord) -> String? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return (try? encoder.encode(record)).flatMap { String(data: $0, encoding: .utf8) }
    }

    static func decoder() -> JSONDecoder { let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d }
}

/// The history file in the Studio's per-user data folder: `~/Library/Application Support/RasanAI/timing/film-timing.jsonl`.
public struct FilmTimingStore: Sendable {
    public let file: URL
    public init(file: URL = FilmTimingStore.defaultFile) { self.file = file }

    public static var defaultFile: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/RasanAI/timing/film-timing.jsonl")
    }

    public func load() -> [FilmTimingRecord] {
        guard let text = try? String(contentsOf: file, encoding: .utf8) else { return [] }
        return FilmTimingHistory.compact(FilmTimingHistory.parse(text))
    }

    /// Appends a line unless this film's newest record already says the same; compacts the file when it grows past the cap.
    public func append(_ record: FilmTimingRecord, existing: [FilmTimingRecord]? = nil) {
        let known = existing ?? load()
        if let old = known.first(where: { $0.id == record.id }), old.phaseSeconds.count == record.phaseSeconds.count, old.complete == record.complete { return }
        guard let line = FilmTimingHistory.line(record) else { return }
        let fm = FileManager.default
        try? fm.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let ids = Set(known.map(\.id)).union([record.id])
        if ids.count > FilmTimingHistory.capFilms {
            let rows = (FilmTimingHistory.compact(known + [record])).compactMap(FilmTimingHistory.line)
            try? (rows.joined(separator: "\n") + "\n").write(to: file, atomically: true, encoding: .utf8)
            return
        }
        if !fm.fileExists(atPath: file.path) { fm.createFile(atPath: file.path, contents: nil) }
        guard let handle = try? FileHandle(forWritingTo: file) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: Data((line + "\n").utf8))
    }
}

// MARK: Estimator

public enum FilmTimeEstimator {
    /// A phase's expected work seconds with a plausible spread.
    public struct Guess: Equatable, Sendable {
        public var seconds: TimeInterval
        public var low: TimeInterval
        public var high: TimeInterval
        /// Past films this rests on.
        public var samples: Int
    }

    // MARK: Prior

    /// Today's table, scaled by what is known about this film. 0 for a phase the route skips.
    public static func prior(_ phase: ProgressPhase, _ c: FilmTimingContext) -> TimeInterval {
        if c.skipped.contains(phase) { return 0 }
        let pace = c.pace.flatMap(FilmPace.init(rawValue:))
        let base: TimeInterval
        switch phase {
        case .research:
            switch pace { case .fast?: base = 150; case .standard?: base = 330; case .thorough?: base = 600; case nil: base = 360 }
        case .render: base = max(300, c.lengthSeconds * 40)
        default: base = ProgressPhaseMapper.typicalSeconds(phase)
        }
        // Render is linear in length; build, plan, animatic and check grow with length and scene count, but less than linearly.
        let exponent: Double
        switch phase {
        case .build: exponent = 0.85
        case .plan: exponent = 0.6
        case .animatic, .check: exponent = 0.5
        case .script: exponent = 0.3
        default: exponent = 0
        }
        let size = exponent == 0 ? 1 : pow(sizeRatio(c, over: baselineContext), exponent)
        var seconds = base * size
        switch c.crewBudget {
        case "lean":
            switch phase { case .script: seconds *= 0.7; case .look: seconds *= 0.5; case .plan: seconds *= 0.75; case .build: seconds *= 0.9; case .check: seconds *= 0.55; default: break }
        case "full":
            switch phase { case .look: seconds *= 1.1; case .plan: seconds *= 1.15; case .build: seconds *= 1.1; case .check: seconds *= 1.4; default: break }
        default: break
        }
        switch (c.modelPlan, phase) {
        case ("sonnet", .build), ("sonnet", .plan), ("sonnet", .check): seconds *= 0.8
        case ("opus", .build), ("opus", .plan), ("opus", .check): seconds *= 1.1
        default: break
        }
        return seconds
    }

    /// The film the old constants were measured on: 30 s, about six scenes.
    static let baselineContext: FilmTimingContext = { var c = FilmTimingContext(); c.sceneCount = 6; return c }()

    static func sizeRatio(_ a: FilmTimingContext, over b: FilmTimingContext) -> Double {
        let length = a.lengthSeconds / max(b.lengthSeconds, 1)
        var ratio = length
        if let x = a.sceneCount, let y = b.sceneCount, y > 0 { ratio = 0.5 * length + 0.5 * Double(x) / Double(y) }
        return min(4, max(0.25, ratio))
    }

    // MARK: Learned

    /// Past durations for a phase, each scaled onto this film. Films of the same kind when there are any, else every film.
    public static func scaledHistory(_ phase: ProgressPhase, _ c: FilmTimingContext, _ history: [FilmTimingRecord]) -> [TimeInterval] {
        guard !c.skipped.contains(phase) else { return [] }
        let having = history.filter { $0.phaseSeconds[phase.rawValue] != nil }
        let same = having.filter { $0.context.kind == c.kind }
        let pool = same.isEmpty ? having : same
        let target = prior(phase, c)
        return pool.compactMap { record -> TimeInterval? in
            guard let seconds = record.phaseSeconds[phase.rawValue], seconds > 0 else { return nil }
            // Before the clock left out downtime, a phase over an hour is a limit wait, not work.
            if record.clock == nil, seconds > 3_600 { return nil }
            let theirs = prior(phase, record.context)
            let ratio = theirs > 0 && target > 0 ? min(4, max(0.25, target / theirs)) : 1
            return seconds * ratio
        }.sorted()
    }

    static func quantile(_ sorted: [Double], _ q: Double) -> Double {
        guard !sorted.isEmpty else { return 0 }
        let position = q * Double(sorted.count - 1)
        let lower = Int(position.rounded(.down)), upper = Int(position.rounded(.up))
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - Double(lower))
    }

    static func weight(_ n: Int) -> Double { Double(n) / (Double(n) + 3) }

    /// Work seconds a phase is expected to take from the start: the prior blended with the median of past films, w = n / (n + 3).
    public static func expected(_ phase: ProgressPhase, _ c: FilmTimingContext, _ history: [FilmTimingRecord]) -> Guess? {
        let prior = prior(phase, c)
        guard prior > 0 else { return nil }
        let past = scaledHistory(phase, c, history)
        let n = past.count
        guard n > 0 else { return Guess(seconds: prior, low: prior * 0.7, high: prior * 1.4, samples: 0) }
        let w = weight(n)
        let seconds = w * quantile(past, 0.5) + (1 - w) * prior
        if n >= 3 {
            return Guess(seconds: seconds, low: w * quantile(past, 0.25) + (1 - w) * prior * 0.7, high: w * quantile(past, 0.75) + (1 - w) * prior * 1.4, samples: n)
        }
        return Guess(seconds: seconds, low: seconds * 0.7, high: seconds * 1.4, samples: n)
    }

    /// What is left of a phase that has run `worked` seconds and has no progress signal.
    /// Past films longer than `worked` give median minus worked; if none are longer, a quarter of the time so far (at least a minute).
    public static func conditionalRemaining(_ phase: ProgressPhase, worked: TimeInterval, _ c: FilmTimingContext, _ history: [FilmTimingRecord]) -> Guess {
        let prior = prior(phase, c)
        let priorLeft = prior > worked ? prior - worked : max(60, 0.25 * worked)
        let past = scaledHistory(phase, c, history)
        let n = past.count
        guard n > 0 else { return Guess(seconds: priorLeft, low: priorLeft * 0.5, high: priorLeft * 1.75, samples: 0) }
        let longer = past.filter { $0 > worked }
        let historyLeft = longer.isEmpty ? max(60, 0.25 * worked) : quantile(longer, 0.5) - worked
        let w = weight(n)
        let seconds = max(30, w * historyLeft + (1 - w) * priorLeft)
        let spread = n >= 3 ? 0.35 : 0.5
        return Guess(seconds: seconds, low: seconds * (1 - spread), high: seconds * (1 + spread * 1.5), samples: n)
    }

    /// Sums guesses into one figure. The range is reported only when the spread is wide (few past films or a large IQR).
    public static func total(_ parts: [(guess: Guess, measured: Bool)], basisMeasured: Bool) -> PhaseEstimate? {
        guard !parts.isEmpty else { return nil }
        let seconds = parts.reduce(0) { $0 + $1.guess.seconds }
        let down = sqrt(parts.reduce(0) { $0 + pow($1.guess.seconds - $1.guess.low, 2) })
        let up = sqrt(parts.reduce(0) { $0 + pow($1.guess.high - $1.guess.seconds, 2) })
        let big = parts.filter { $0.guess.seconds >= 120 && !$0.measured }
        let fewFilms = big.contains { $0.guess.samples < 3 }
        let wide = fewFilms || (up + down) / max(seconds, 1) > 0.5
        let learned = parts.contains { $0.guess.samples > 0 }
        let basis: PhaseEstimate.Basis = basisMeasured ? .measured : (learned ? .learned : .typical)
        var estimate = PhaseEstimate(secondsLeft: seconds, basis: basis)
        if wide { estimate.lowSeconds = max(0, seconds - down); estimate.highSeconds = seconds + up }
        return estimate
    }
}

// MARK: Smoothing

/// Keeps the displayed total from jumping. Feed it each raw total with the clock; it counts down with time, eases toward the raw figure
/// (60 s time constant) and rises at most 10% a minute, unless the raw figure comes from a measured signal.
public struct EstimateSmoother: Sendable, Equatable {
    var shown: TimeInterval?
    var at: Date?
    public init() {}

    /// `hold`: nothing is running or it is the person's turn. The shown figure stays put (no countdown) instead of ticking through the pause.
    public mutating func apply(_ raw: PhaseEstimate?, now: Date, hold: Bool = false) -> PhaseEstimate? {
        guard let raw else { shown = nil; at = nil; return nil }
        guard let last = shown, let lastAt = at else {
            shown = raw.secondsLeft; at = now
            return raw
        }
        if hold {
            at = now
            return Self.shifted(raw, to: last)
        }
        let dt = min(900, max(0, now.timeIntervalSince(lastAt)))
        let expected = max(0, last - dt)
        var next = expected
        let alpha = raw.basis == .measured ? max(0.5, 1 - exp(-dt / 60)) : 1 - exp(-dt / 60)
        next = expected + alpha * (raw.secondsLeft - expected)
        if raw.basis != .measured { next = min(next, expected + 0.10 * last * dt / 60) }
        next = max(0, next)
        shown = next; at = now
        return Self.shifted(raw, to: next)
    }

    private static func shifted(_ raw: PhaseEstimate, to value: TimeInterval) -> PhaseEstimate {
        var out = raw
        let shift = value - raw.secondsLeft
        out.secondsLeft = value
        out.lowSeconds = raw.lowSeconds.map { max(0, $0 + shift) }
        out.highSeconds = raw.highSeconds.map { max(value, $0 + shift) }
        return out
    }
}
