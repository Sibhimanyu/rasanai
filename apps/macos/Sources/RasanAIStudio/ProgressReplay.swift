#if DEBUG
import AppKit
import StudioCore

/// DEBUG replay (`--replay-run <runDir> --speed 60 [--replay-from 11:00]`): plays a finished run's real director.log and session
/// timeline into FilmSessionModel and FilmProgress as if live, scaled in time, with no director and no console.
///  - log lines reach FilmProgress as the simulated clock passes their timestamps (one forward pass, `ReplayLogReader`);
///  - the session at that moment is rebuilt by `SessionReplay` and given to a fixture FilmSessionModel through its public `setFixture`;
///  - the project folder is scanned "as of" the clock (file times are real), and render progress is interpolated between a render's
///    command and its result (the real tool prints its progress only when it ends).
/// QA bot (`--qa-dir`): `{"replay": {"seek": "11:30", "speed": 60, "paused": false}}` (UTC times of the run's day).
@MainActor final class ProgressReplay {
    static var current: ProgressReplay?
    let run: URL
    private(set) var speed: Double
    private(set) var paused = false
    private(set) var clock: Date
    private weak var store: StudioStore?
    private let final: SessionSnapshot
    private let project: URL?
    private let reader: ReplayLogReader
    private var schedule: [ReplayRenderSchedule.Segment] = []
    private var progress: FilmProgress?
    private var model: FilmSessionModel?
    private var task: Task<Void, Never>?
    private var generation = 0
    private let first: Date
    private let last: Date

    static func launch(store: StudioStore, run: URL, speed: Double, from: String?) {
        guard let session = (try? Data(contentsOf: run.appendingPathComponent("session.json"))).flatMap({ try? SessionSnapshot(data: $0) }) else {
            store.errorMessage = "Replay: no readable session.json in \(run.path)"; return
        }
        NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps: true)
        let replay = ProgressReplay(store: store, run: run, session: session, speed: speed)
        current = replay
        replay.begin(from: from)
    }

    private init(store: StudioStore, run: URL, session: SessionSnapshot, speed: Double) {
        self.store = store; self.run = run; final = session; self.speed = max(1, speed)
        project = FilmArtifactScanner.project(forRun: run)
        reader = ReplayLogReader(file: run.appendingPathComponent("director.log"))
        first = SessionReplay.firstEvent(of: session) ?? Date()
        last = SessionReplay.lastEvent(of: session) ?? Date()
        clock = first
    }

    private func begin(from: String?) {
        guard let store else { return }
        store.enterReplay(run: run)
        let progress = store.progress(for: run)
        progress.beginReplay()
        self.progress = progress
        // The film page on this run, with no console behind it.
        store.runURL = run; store.workspaceURL = project ?? run; store.loadedFilm = project ?? run; store.isSample = false
        store.selectedProjectURL = project
        store.showFilm(project ?? run)
        Task.detached { [run] in
            let segments = ReplayRenderSchedule.scan(file: run.appendingPathComponent("director.log"))
            await MainActor.run { ProgressReplay.current?.schedule = segments }
        }
        let start = from.flatMap(Self.time(of:)) ?? first
        seek(to: start)
        task = Task { @MainActor [weak self] in
            let tick = 0.5
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self else { return }
                if self.paused || self.clock > self.last.addingTimeInterval(120) { continue }
                await self.step(to: self.clock.addingTimeInterval(tick * self.speed), generation: self.generation)
            }
        }
    }

    func control(seek: String?, speed: Double?, paused: Bool?) {
        if let speed { self.speed = max(1, speed) }
        if let paused { self.paused = paused }
        if let seek, let target = Self.time(of: seek) { self.seek(to: target) }
    }

    private func seek(to target: Date) {
        generation += 1
        let id = generation
        clock = first
        reader.rewind()
        Task { @MainActor in
            await progress?.resetForReplay()
            await step(to: target, generation: id, fresh: true)
        }
    }

    private func step(to time: Date, generation id: Int, fresh: Bool = false) async {
        guard let store, let progress, id == generation else { return }
        let lines = reader.lines(upTo: time)
        let session = SessionReplay.snapshot(at: time, final: final, projectRoot: project)
        let artifacts = FilmArtifactScanner.scan(project: project, run: run, asOf: time)
        let chunks = schedule.filter { $0.start <= time && time < $0.end }.map {
            ($0.toolID, ReplayRenderSchedule.text(totalFrames: $0.totalFrames, fraction: time.timeIntervalSince($0.start) / max(1, $0.end.timeIntervalSince($0.start))))
        }
        await progress.feed(lines: lines, session: session, artifacts: artifacts, renderChunks: chunks, at: time)
        guard id == generation else { return }
        clock = time
        if fresh || model == nil {
            let next = FilmSessionModel(fixture: session, run: run, workspace: project ?? run)
            next.startedAt = first
            next.onSnapshot = { [weak store] snapshot in store?.snapshot = snapshot; store?.stage = snapshot.stage }
            model = next
            store.film = next
            store.snapshot = session
            store.isConnected = true
        } else {
            model?.setFixture(session)
        }
        store.stage = session.stage
        store.statusMessage = "Replay \(Self.label(time)) UTC · \(Int(speed))x"
    }

    static func time(of text: String) -> Date? {
        let day = "2026-10-06"
        let stamp = text.contains("T") ? text : "\(day)T\(text.count <= 5 ? text + ":00" : text)Z"
        return DirectorTelemetry.parseDate(stamp)
    }
    static func label(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "HH:mm:ss"; f.timeZone = TimeZone(identifier: "UTC"); return f.string(from: date)
    }
}
#endif
