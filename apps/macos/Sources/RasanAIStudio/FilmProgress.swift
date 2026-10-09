import Foundation
import Observation
import StudioCore

/// Runs the pure engine off the main actor: reads director.log forward from its own cursor (the same `DirectorUsageStore.readLines`
/// tail reader the monitor uses, one pass, never re-reading), reads session.json, scans the project folder and tails running render output.
actor FilmProgressWorker {
    private var engine = FilmProgressEngine()
    private var offset: UInt64 = 0
    private var lastScan = Date.distantPast
    private var sessionStamp: Date?

    func reset() { engine = FilmProgressEngine(); offset = 0; lastScan = .distantPast; sessionStamp = nil }

    /// One live step: new log lines, the session, artifacts (every 2 s) and render output.
    func advance(run: URL, project: URL?, budget: ResearchBudget?, now: Date, running: Bool, wasRunning: Bool) -> FilmProgressSnapshot {
        engine.budget = budget
        let log = run.appendingPathComponent("director.log")
        while true {
            let read = DirectorUsageStore.readLines(file: log, from: offset)
            if read.lines.isEmpty && read.offset == offset { break }
            offset = read.offset
            engine.ingest(lines: read.lines, now: now)
            if read.lines.count < 20 { break }
        }
        let sessionURL = run.appendingPathComponent("session.json")
        let modified = (try? sessionURL.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        if modified != sessionStamp || running, let data = try? Data(contentsOf: sessionURL), let session = try? SessionSnapshot(data: data) {
            sessionStamp = modified
            engine.update(session: session, now: now)
        }
        if now.timeIntervalSince(lastScan) >= 2 {
            lastScan = now
            engine.update(artifacts: FilmArtifactScanner.scan(project: project, run: run), now: now)
        }
        for file in engine.renderOutputFiles {
            if let handle = try? FileHandle(forReadingFrom: URL(fileURLWithPath: file)) {
                defer { try? handle.close() }
                let size = (try? handle.seekToEnd()) ?? 0
                try? handle.seek(toOffset: size > 65_536 ? size - 65_536 : 0)
                if let data = try? handle.readToEnd() { engine.ingest(renderOutput: String(decoding: data, as: UTF8.self), file: file, now: now) }
            }
        }
        if wasRunning && !running { engine.directorStopped(at: now) }
        return engine.snapshot(now: now)
    }

    /// Replay step: the caller supplies everything for the simulated clock.
    func feed(lines: [String], session: SessionSnapshot?, artifacts: FilmArtifacts?, renderChunks: [(String, String)], budget: ResearchBudget?, now: Date) -> FilmProgressSnapshot {
        engine.budget = budget
        engine.ingest(lines: lines, now: now)
        if let session { engine.update(session: session, now: now) }
        if let artifacts { engine.update(artifacts: artifacts, now: now) }
        for (toolID, text) in renderChunks { engine.ingest(renderOutput: text, toolID: toolID, now: now) }
        return engine.snapshot(now: now)
    }

    func telemetry() -> DirectorTelemetry { engine.telemetrySnapshot }
}

/// The live progress model for one film. `StudioStore` owns one per run: `store.progress` (the displayed film)
/// or `store.progress(for: runURL)`. Views read `snapshot`; nothing here draws.
@MainActor @Observable
final class FilmProgress {
    let runURL: URL?
    private(set) var snapshot: FilmProgressSnapshot
    /// The clock the snapshot is current at. Real time while live, simulated time during a DEBUG replay.
    private(set) var now: Date
    private(set) var isLive = false
    /// Set by the research-budget code from the film's setting. `nil` means no budget (Deep).
    var researchBudget: ResearchBudget? { didSet { snapshot.research.budget = researchBudget } }
    /// True while a DEBUG replay drives this model (the live loop is off).
    private(set) var isReplay = false

    @ObservationIgnored private let worker = FilmProgressWorker()
    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private var wasRunning = false
    /// Whether the director is running this film now (set by the store).
    @ObservationIgnored var runningProvider: @MainActor () -> Bool = { false }
    @ObservationIgnored var projectProvider: @MainActor () -> URL? = { nil }

    init(run: URL?, snapshot: FilmProgressSnapshot = FilmProgressSnapshot(), now: Date = Date(), replay: Bool = false) {
        runURL = run; self.snapshot = snapshot; self.now = now; isReplay = replay
    }

    /// A model over a fixed snapshot, for the snapshot harness and previews.
    static func fixture(_ snapshot: FilmProgressSnapshot) -> FilmProgress { FilmProgress(run: nil, snapshot: snapshot, now: snapshot.asOf) }

    // Convenience reads.
    var currentPhase: ProgressPhase { snapshot.currentPhase }
    /// Research elapsed time (wall clock from the first research activity), nil before research starts.
    var researchElapsed: TimeInterval? { snapshot.researchElapsed(now: now) }
    func isResearchOverBudget(factor: Double = 1.5) -> Bool { snapshot.isResearchOverBudget(factor: factor, now: now) }

    // MARK: Live loop

    /// Starts reading the run (idempotent). The first pass catches up on the whole log in the background.
    func start() {
        guard loop == nil, !isReplay, let run = runURL else { return }
        loop = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.tick(run: run)
                try? await Task.sleep(for: .milliseconds(self.isLive ? 1_500 : 4_000))
            }
        }
    }

    func stop() { loop?.cancel(); loop = nil }

    private func tick(run: URL) async {
        guard !isReplay else { return }
        let running = runningProvider()
        let project = projectProvider() ?? FilmArtifactScanner.project(forRun: run)
        let at = Date()
        let result = await worker.advance(run: run, project: project, budget: researchBudget, now: at, running: running, wasRunning: wasRunning)
        // A replay may have begun while the read was in flight: nothing live may touch a replaying model.
        guard !isReplay, !Task.isCancelled else { return }
        wasRunning = running
        isLive = running
        now = at
        if !result.equalsIgnoringClock(snapshot) || result.asOf != snapshot.asOf { snapshot = result }
    }

    // MARK: Replay (the DEBUG replay and tests drive the same model)

    func beginReplay() { stop(); isReplay = true; isLive = false }
    func endReplay() { isLive = false }
    func resetForReplay() async { await worker.reset() }
    func feed(lines: [String], session: SessionSnapshot?, artifacts: FilmArtifacts?, renderChunks: [(String, String)], at time: Date) async {
        let result = await worker.feed(lines: lines, session: session, artifacts: artifacts, renderChunks: renderChunks, budget: researchBudget, now: time)
        now = time
        snapshot = result
    }
    func replayTelemetry() async -> DirectorTelemetry { await worker.telemetry() }
}

extension StudioStore {
    /// The progress model for a run, created on first use and started (it reads the run's own files, so it works for finished films too).
    func progress(for run: URL) -> FilmProgress {
        if let existing = progressModels[run] { return existing }
        if replayRun != nil {
            let model = FilmProgress(run: run, replay: true)
            progressModels[run] = model
            return model
        }
        for (url, other) in progressModels where url != runtime.runURL { other.stop(); progressModels[url] = nil }
        let model = FilmProgress(run: run)
        model.runningProvider = { [weak self] in self?.runtime.isRunning == true && self?.runtime.runURL == run }
        model.projectProvider = { [weak self] in self?.selectedProjectURL }
        progressModels[run] = model
        model.start()
        return model
    }
    /// The progress model for the film on screen (the director's run, else the opened run). `nil` before a run exists.
    var progress: FilmProgress? { (runtime.runURL ?? runURL).map { progress(for: $0) } }
}
