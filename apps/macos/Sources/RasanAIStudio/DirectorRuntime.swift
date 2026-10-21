import AppKit
import Observation
import StudioCore

struct AutoResumeNotice: Equatable {
    var text: String
    var since: Date
    var resumesAt: Date?
    var isLimit = false
}

@MainActor @Observable
final class DirectorRuntime {
    var isRunning = false
    var isPreparing = false
    var isFinishing = false
    var status = "Director stopped"
    var logURL: URL?
    var lastExitCode: Int32?
    var stopRequested = false
    /// The director's whole process group is frozen in place (SIGSTOP via the driver): nothing runs and no tokens are used until it thaws.
    private(set) var isFrozen = false
    private(set) var frozenAt: Date?
    var startedAt: Date?
    var recovery: DirectorRecovery?
    /// Specifics for the failure (which command was blocked, which step it stopped before).
    var recoveryDetail = ""
    /// Set when the exit was claude --print ending the session over its background-task ceiling (safe to resume once automatically).
    var endedOnBackgroundCeiling = false
    var preflightReport: PreflightReport?
    /// Set when the director stopped mid-film and Studio is about to resume it by itself, or is waiting for a plan limit to reset.
    var autoResume: AutoResumeNotice?
    /// What Studio decided to do about the last exit (see `AutoResumePolicy`).
    var autoResumeDecision: AutoResumePolicy.Decision = .none
    /// When each run was last resumed automatically, so a second stop soon after is shown as a failure.
    var lastAutoResume: [String: Date] = [:]
    var onExit: ((Int32, Bool) -> Void)?
    var projectURL: URL? { activeProject }
    var runURL: URL? { activeRun }
    private var process: Process?
    /// The driver's process id: its own child, or a director a previous Studio left running (adopted after a relaunch).
    private(set) var pid: Int32?
    /// Polls an adopted director until it is gone, then handles its exit like an own one.
    private var adoptWatch: Task<Void, Never>?
    private var activeRun: URL?
    private var activeProject: URL?
    static var engineURL: URL? {
        if let resource = Bundle.main.resourceURL?.appendingPathComponent("Engine/rasanai"),
           FileManager.default.fileExists(atPath: resource.appendingPathComponent("SKILL.md").path) { return resource }
        let source = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../..", isDirectory: true).standardizedFileURL
            .appendingPathComponent("skills/rasanai", isDirectory: true)
        return FileManager.default.fileExists(atPath: source.appendingPathComponent("SKILL.md").path) ? source : nil
    }
    static var driverURL: URL? {
        let resource = Bundle.main.resourceURL?.appendingPathComponent("Runtime/director-driver.mjs")
        if let resource, FileManager.default.fileExists(atPath: resource.path) { return resource }
        let source = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../Runtime/director-driver.mjs").standardizedFileURL
        return FileManager.default.fileExists(atPath: source.path) ? source : nil
    }
    func environment(node: URL, settings: StudioSettings? = nil) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = ([node.deletingLastPathComponent().path] + LocalAgent.searchDirectories).joined(separator: ":")
        env["RASANAI_NO_UPDATE_CHECK"] = "1"
        env["RASANAI_AUTO_UPDATE"] = "0"
        // No console server: Studio reads the run's files, and every console.mjs command the director runs is headless.
        env["RASANAI_CONSOLE_HEADLESS"] = "1"
        env.removeValue(forKey: "CLAUDECODE")
        for (key, value) in DirectorLaunch.environmentOverrides { env[key] = value }
        // Image generation goes through Codex whichever director runs the film.
        env.removeValue(forKey: "RASANAI_IMAGEGEN")
        if let settings {
            if let codex = settings.imageGenerationCodexURL { env["RASANAI_CODEX_BIN"] = codex.path }
            if !settings.generateImagesWithCodex { env["RASANAI_IMAGEGEN"] = "off" }
        }
        return env
    }
    func start(project: URL, existingRun: URL? = nil, request: String, settings: StudioSettings, agent selectedAgent: LocalAgent? = nil, model: String? = nil, unrestrictedTools: Bool? = nil) async throws -> URL {
        guard !isRunning, !isPreparing, !isFinishing else { throw RuntimeError.busy }
        guard let engine = Self.engineURL, let driver = Self.driverURL else { throw RuntimeError.missingEngine }
        guard let node = settings.nodeURL else { throw RuntimeError.missingNode }
        let agent = selectedAgent ?? LocalAgent(rawValue: settings.defaultAgent) ?? .claude
        let executable = URL(fileURLWithPath: settings.path(for: agent))
        guard FileManager.default.isExecutableFile(atPath: executable.path) else { throw RuntimeError.missingAgent }
        isPreparing = true
        adoptWatch?.cancel(); adoptWatch = nil
        startedAt = Date(); recovery = nil; recoveryDetail = ""; endedOnBackgroundCeiling = false; preflightReport = nil
        autoResume = nil; autoResumeDecision = .none
        status = "Checking director sign-in…"
        lastExitCode = nil; stopRequested = false
        defer { isPreparing = false }
        await settings.check(agent)
        guard settings.isReady(agent) else { throw RuntimeError.directorNotReady(settings.statuses[agent.id] ?? "Check sign-in in Settings → Director.") }
        status = "Checking tools, sources and free space…"
        let files = try await Task.detached { try ProjectSources.files(in: project) }.value
        let environment = environment(node: node, settings: settings)
        let report = await FilmPreflight.check(PreflightConfiguration(node: node, engine: engine, driver: driver,
            directories: [node.deletingLastPathComponent().path] + LocalAgent.searchDirectories, environment: environment,
            project: project, sources: files, existingRun: existingRun,
            codex: settings.imageGenerationCodexURL, imageGeneration: settings.generateImagesWithCodex))
        preflightReport = report
        guard report.canStart else { throw RuntimeError.preflightFailed(report.blockers) }
        status = "Preparing the film folder…"
        let run = existingRun ?? project.appendingPathComponent(".rasanai/run-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: run, withIntermediateDirectories: true)
        if existingRun == nil {
            try Data(run.lastPathComponent.utf8).write(to: project.appendingPathComponent(".rasanai/current"), options: .atomic)
        }
        let session = run.appendingPathComponent("session.json")
        // The brief was already written in the New film form: seed it so no console ever asks for it again.
        // This also covers resumed and queued runs whose session never got past the empty start.
        let seededBrief = try BriefSeed.seedFile(at: session, title: project.lastPathComponent, draft: FilmDraft.load(in: project))
        // The launch prompt only promises a brief when the session really carries one.
        let briefInSession = seededBrief || ((try? SessionSnapshot(data: Data(contentsOf: session)))?.step("brief")["fields"]["subject"].string ?? "").isEmpty == false
        status = "Starting \(agent.title)…"
        DirectorPermissions.prepareDataFolders(home: FileManager.default.homeDirectoryForCurrentUser, toolsDirectory: LocalAgent.managedToolsDirectory)
        let draft = FilmDraft.load(in: project)
        let launch = try DirectorLaunch(agent: agent, executable: executable, engine: engine, project: project, run: run,
            request: request, model: model ?? settings.model(for: agent), allowUnrestrictedTools: unrestrictedTools ?? settings.allowUnrestrictedTools, briefSeeded: briefInSession,
            pace: draft?.pace ?? settings.pace, modelPlan: draft?.modelPlan ?? .recommended,
            readFolders: draft?.readOnlyFolders ?? [], readFiles: draft?.readOnlyFiles ?? [])
        let job = JSONValue.object(["executable": .string(executable.path), "arguments": .array(launch.arguments.map(JSONValue.string)), "cwd": .string(project.path)])
        let jobURL = run.appendingPathComponent("director-job.json")
        try JSONEncoder().encode(job).write(to: jobURL, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: jobURL.path)
        let log = run.appendingPathComponent("director.log")
        if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
        let output = try FileHandle(forWritingTo: log); try output.seekToEnd()
        let process = Process()
        process.executableURL = node
        process.arguments = [driver.path, jobURL.path]
        process.currentDirectoryURL = project
        process.environment = environment
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = output; process.standardError = output
        let identity = UUID()
        self.identity = identity
        process.terminationHandler = { [weak self] finished in
            try? output.close()
            let code = finished.terminationStatus
            Task { @MainActor in await self?.handleExit(code: code, run: run, log: log, identity: identity) }
        }
        try process.run()
        self.process = process
        pid = process.processIdentifier
        // The film this app is working on: a relaunched Studio looks here first to pick it back up.
        UserDefaults.standard.set(run.path, forKey: Self.activeRunKey)
        activeRun = run; activeProject = project; logURL = log
        isRunning = true
        runningStatus = "Director running · \(agent.title)"
        status = runningStatus
        return run
    }
    private var identity = UUID()
    private var runningStatus = "Director running"
    static let activeRunKey = "activeDirectorRun"
    /// The driver's pid while it is alive: our own child, or an adopted one.
    private var livePid: Int32? {
        if let process { return process.isRunning ? process.processIdentifier : nil }
        return pid
    }
    /// The state every exit leaves behind, then what to do about it. Shared by our own director's termination and an adopted one's disappearance.
    private func handleExit(code: Int32, run: URL, log: URL, identity: UUID, autoResumable: Bool = true) async {
        guard self.identity == identity else { return }
        isFinishing = true
        defer { isFinishing = false }
        isRunning = false
        isFrozen = false; frozenAt = nil
        process = nil; pid = nil
        lastExitCode = code
        status = stopRequested ? "Director stopped · your files are preserved; resume when ready" : (code == 0 ? "Director finished" : "Director stopped (\(code)) · inspect the log, fix prerequisites or permissions, then resume")
        if !stopRequested {
            guard let finished = await classifyStop(code: code, run: run, log: log, identity: identity, limitClock: nil, autoResumable: autoResumable) else { return }
            // A real finish: nothing left for a relaunch to pick up.
            if finished, UserDefaults.standard.string(forKey: Self.activeRunKey) == run.path { UserDefaults.standard.removeObject(forKey: Self.activeRunKey) }
        } else {
            autoResumeDecision = .none
        }
        onExit?(code, stopRequested)
    }
    /// Reads how the stop went (progress, log tail), sets `recovery`, the automatic-resume decision and its notice.
    /// Returns true for a real finish, false for a failure, nil when something else took over meanwhile.
    /// `limitClock` is when the director actually stopped, for a stop found after the fact; `autoResumable` is false for runs with no event log.
    private func classifyStop(code: Int32, run: URL, log: URL, identity: UUID, limitClock: Date?, autoResumable: Bool) async -> Bool? {
        // Any exit that leaves the film unfinished is a failure, including a quiet exit 0 with nothing pushed.
        let result = await Task.detached { () -> (outcome: (recovery: DirectorRecovery, detail: String)?, progress: DirectorRecovery.Progress, tail: String, logged: Date?) in
            let progress = DirectorRecovery.Progress(session: try? SessionSnapshot(data: Data(contentsOf: run.appendingPathComponent("session.json"))))
            let tail = Self.readLogTail(log)
            return (DirectorRecovery.classify(exitCode: code, log: tail, progress: progress), progress, tail, RunEvents.lastAutoResume(RunEvents.load(run: run)))
        }.value
        guard self.identity == identity else { return nil }
        guard let outcome = result.outcome else { autoResumeDecision = .none; return true }
        recovery = outcome.recovery; recoveryDetail = outcome.detail
        endedOnBackgroundCeiling = DirectorRecovery.hitBackgroundCeiling(log: result.tail)
        if code == 0 { status = "\(outcome.recovery.title) · open the log, then resume" }
        guard autoResumable else { autoResumeDecision = .none; return false }
        let last = [lastAutoResume[run.path], result.logged].compactMap { $0 }.max()
        let decision = AutoResumePolicy.decide(outcome: result.outcome, stopRequested: false, progress: result.progress, log: result.tail,
                                               lastAutoResume: last, limitClock: limitClock)
        autoResumeDecision = decision
        switch decision {
        case .none: break
        case .resume(let delay):
            autoResume = AutoResumeNotice(text: AutoResumePolicy.resumingText, since: Date(), resumesAt: Date().addingTimeInterval(delay))
            status = AutoResumePolicy.resumingText
        case .waitForLimit(let limit):
            autoResume = AutoResumeNotice(text: limit.message, since: Date(), resumesAt: limit.resetsAt, isLimit: true)
            status = limit.message
        }
        return false
    }
    /// True when `pid` is alive and is the director driver of `run`: a pid alone could be reused by any other process.
    nonisolated static func isDriver(pid: Int32, run: URL) -> Bool {
        guard pid > 1, kill(pid, 0) == 0 else { return false }
        let ps = Process()
        ps.executableURL = URL(fileURLWithPath: "/bin/ps")
        ps.arguments = ["-ww", "-o", "command=", "-p", String(pid)]
        let pipe = Pipe()
        ps.standardOutput = pipe; ps.standardError = FileHandle.nullDevice; ps.standardInput = FileHandle.nullDevice
        guard (try? ps.run()) != nil else { return false }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        ps.waitUntilExit()
        let command = String(decoding: data, as: UTF8.self)
        let paths = Set([run.path, run.resolvingSymlinksInPath().path])
        return command.contains("director-driver.mjs") && paths.contains(where: command.contains)
    }
    /// The live director driver of `run` found from the process list, for runs started before the event log existed. Nil when none (or `ps` stalls).
    nonisolated static func findDriver(run: URL) -> Int32? {
        let ps = Process()
        ps.executableURL = URL(fileURLWithPath: "/bin/ps")
        ps.arguments = ["-axww", "-o", "pid=,command="]
        let pipe = Pipe()
        ps.standardOutput = pipe; ps.standardError = FileHandle.nullDevice; ps.standardInput = FileHandle.nullDevice
        let done = DispatchSemaphore(value: 0)
        ps.terminationHandler = { _ in done.signal() }
        guard (try? ps.run()) != nil else { return nil }
        var data = Data()
        let reader = DispatchQueue(label: "findDriver.read")
        let read = DispatchSemaphore(value: 0)
        reader.async { data = pipe.fileHandleForReading.readDataToEndOfFile(); read.signal() }
        if done.wait(timeout: .now() + 2) == .timedOut { ps.terminate(); _ = done.wait(timeout: .now() + 1); return nil }
        guard read.wait(timeout: .now() + 1) == .success else { return nil }
        let me = ProcessInfo.processInfo.processIdentifier
        let paths = Set([run.path, run.resolvingSymlinksInPath().path])
        for line in String(decoding: data, as: UTF8.self).split(whereSeparator: \.isNewline) {
            let trimmed = line.drop { $0 == " " }
            guard let space = trimmed.firstIndex(of: " "), let pid = Int32(trimmed[..<space]), pid > 1, pid != me else { continue }
            let command = trimmed[space...]
            if command.contains("director-driver.mjs"), paths.contains(where: { command.contains($0) }) { return pid }
        }
        return nil
    }
    /// Takes over a director a previous Studio left running (a quit or an update does not stop it): shows it as running and handles its exit.
    /// Returns false when no live driver belongs to the run.
    @discardableResult func adopt(run: URL, project: URL) -> Bool {
        guard !isRunning, !isPreparing, !isFinishing else { return false }
        let events = RunEvents.load(run: run)
        let open = RunEvents.openStart(events)
        let pid: Int32
        if let p = open?.pid, Self.isDriver(pid: p, run: run) { pid = p }
        else if let found = Self.findDriver(run: run) { pid = found }
        else { return false }
        let fm = FileManager.default
        let jobAttrs = try? fm.attributesOfItem(atPath: run.appendingPathComponent("director-job.json").path)
        let began = events.first { $0.event == .start }?.t ?? (jobAttrs?[.creationDate] as? Date) ?? (jobAttrs?[.modificationDate] as? Date) ?? Date()
        adoptWatch?.cancel()
        let log = run.appendingPathComponent("director.log")
        activeRun = run; activeProject = project; logURL = log
        process = nil; self.pid = pid
        let identity = UUID(); self.identity = identity
        lastExitCode = nil; stopRequested = false; recovery = nil; recoveryDetail = ""; endedOnBackgroundCeiling = false
        autoResume = nil; autoResumeDecision = .none
        startedAt = began
        runningStatus = "Director running"
        isRunning = true
        if RunEvents.isFrozen(events) {
            isFrozen = true
            frozenAt = events.last { $0.event == .freeze }?.t
            status = "Paused · nothing runs until you resume"
        } else {
            isFrozen = false; frozenAt = nil
            status = runningStatus
        }
        UserDefaults.standard.set(run.path, forKey: Self.activeRunKey)
        adoptWatch = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                guard let self, !Task.isCancelled, self.identity == identity else { return }
                guard kill(pid, 0) != 0, errno == ESRCH else { continue }
                // Gone. The driver wrote its exit before it went (a stop is marked as one); a missing exit means it died hard.
                let exit = RunEvents.load(run: run).last { $0.event == .exit && $0.t >= began }
                if exit?.stopped == true { self.stopRequested = true }
                await self.handleExit(code: exit?.code ?? 1, run: run, log: log, identity: identity, autoResumable: !RunEvents.load(run: run).isEmpty)
                return
            }
        }
        return true
    }
    /// The app did not see the director stop (it was closed or updated meanwhile): work out how it ended from the run's own files.
    /// A stop the person asked for stays paused; any other stop is classified like a live exit, with a plan limit's reset read as of the stop.
    /// Runs without an event log are classified but never resumed automatically.
    func reconcileStopped(run: URL, project: URL) async {
        guard !isRunning, !isPreparing, !isFinishing else { return }
        let events = RunEvents.load(run: run)
        let log = run.appendingPathComponent("director.log")
        activeRun = run; activeProject = project; logURL = log
        let identity = UUID(); self.identity = identity
        let open = RunEvents.openStart(events)
        let exit = RunEvents.lastExit(events)
        if open == nil, let exit, exit.stopped == true {
            stopRequested = true; lastExitCode = exit.code ?? 0
            autoResume = nil; autoResumeDecision = .none
            status = "Paused · resume when ready"
            return
        }
        // A start with no exit after it whose process is gone: it died hard (code 1), and the log's last write is when.
        let code = open == nil ? (exit?.code ?? 1) : 1
        let stoppedAt = open == nil ? exit?.t : (try? FileManager.default.attributesOfItem(atPath: log.path)[.modificationDate] as? Date) ?? open?.t
        lastExitCode = code
        stopRequested = false
        status = code == 0 ? "Director finished" : "Director stopped (\(code)) · inspect the log, fix prerequisites or permissions, then resume"
        let finished = await classifyStop(code: code, run: run, log: log, identity: identity, limitClock: stoppedAt, autoResumable: !events.isEmpty)
        if finished == true, UserDefaults.standard.string(forKey: Self.activeRunKey) == run.path { UserDefaults.standard.removeObject(forKey: Self.activeRunKey) }
    }
    /// Freezes the director and everything it started, exactly where it is. Resume with `thaw()`.
    func freeze() {
        guard isRunning, !isFrozen, let pid = livePid else { return }
        kill(pid, SIGUSR1)
        isFrozen = true; frozenAt = Date()
        status = "Paused · nothing runs until you resume"
    }
    /// Continues a frozen director mid-step.
    func thaw() {
        guard isRunning, isFrozen, let pid = livePid else { return }
        kill(pid, SIGUSR2)
        isFrozen = false; frozenAt = nil
        status = runningStatus
    }
    func clearPresentation() {
        guard !isRunning, !isPreparing, !isFinishing else { return }
        adoptWatch?.cancel(); adoptWatch = nil
        lastExitCode = nil; stopRequested = false; logURL = nil; activeRun = nil; activeProject = nil
        startedAt = nil; recovery = nil; recoveryDetail = ""; autoResume = nil; autoResumeDecision = .none
        status = "Director stopped"
    }
    func stop() {
        guard let pid = livePid else { return }
        stopRequested = true
        isFrozen = false; frozenAt = nil // The driver continues a frozen group itself so it can handle the stop.
        status = "Stopping director and its child processes…"
        kill(pid, SIGTERM)
    }
    func logTail() -> String {
        guard let logURL else { return "No director output yet." }
        return DirectorLogRenderer.readableTail(file: logURL)
    }
    nonisolated static func readLogTail(_ logURL: URL) -> String {
        guard let handle = try? FileHandle(forReadingFrom: logURL) else { return "No director output yet." }
        defer { try? handle.close() }
        let size = (try? handle.seekToEnd()) ?? 0
        try? handle.seek(toOffset: size > 65536 ? size - 65536 : 0)
        return String(decoding: (try? handle.readToEnd()) ?? Data(), as: UTF8.self)
            .replacingOccurrences(of: "[?&]t=[a-f0-9]{24}", with: "?t=[redacted]", options: .regularExpression)
    }
    nonisolated static func execute(_ executable: URL, arguments: [String], directory: URL, environment: [String: String]) async throws -> Int32 {
        try await Task.detached {
            let process = Process()
            process.executableURL = executable; process.arguments = arguments
            process.currentDirectoryURL = directory; process.environment = environment
            process.standardInput = FileHandle.nullDevice; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
            try process.run()
            let deadline = Date().addingTimeInterval(20)
            while process.isRunning && Date() < deadline { try await Task.sleep(for: .milliseconds(50)) }
            if process.isRunning { process.terminate(); throw RuntimeError.consoleFailed }
            return process.terminationStatus
        }.value
    }
    enum RuntimeError: LocalizedError {
        case busy, missingEngine, missingNode, missingAgent, consoleFailed, directorNotReady(String), preflightFailed(String)
        var errorDescription: String? {
            switch self {
            case .busy: "A director is already running. Stop it before starting another project."
            case .missingEngine: "RasanAI's bundled tools are missing. Download a fresh copy of the app. Your films remain in your library."
            case .missingNode: "Node.js 22 or newer is required. Check the Node path in Settings → Director → Advanced."
            case .missingAgent: "Your director isn't installed. Open Help → Show Welcome to install and sign in."
            case .consoleFailed: "A helper command did not finish. Check the Node installation and the selected project permissions."
            case .preflightFailed(let issues): "Resolve these items before starting:\n\(issues)"
            case .directorNotReady(let reason): "Your director isn't ready to start. \(reason) Open Help → Show Welcome to sign in and recheck."
            }
        }
    }
}
