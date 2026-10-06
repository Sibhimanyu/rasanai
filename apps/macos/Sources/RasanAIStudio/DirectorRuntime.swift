import AppKit
import Observation
import StudioCore

@MainActor @Observable
final class DirectorRuntime {
    var isRunning = false
    var isPreparing = false
    var isFinishing = false
    var status = "Director stopped"
    var logURL: URL?
    var lastExitCode: Int32?
    var stopRequested = false
    var startedAt: Date?
    var recovery: DirectorRecovery?
    var preflightReport: PreflightReport?
    var onExit: ((Int32, Bool) -> Void)?
    var projectURL: URL? { activeProject }
    var runURL: URL? { activeRun }
    private var process: Process?
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
        env.removeValue(forKey: "CLAUDECODE")
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
        startedAt = Date(); recovery = nil; preflightReport = nil
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
        status = "Opening the review workspace…"
        let code = try await Self.execute(node, arguments: [engine.appendingPathComponent("scripts/console.mjs").path,
            "serve", "--run", run.path, "--root", project.path], directory: project, environment: environment)
        guard code == 0 else { throw RuntimeError.consoleFailed }
        status = "Starting \(agent.title)…"
        let launch = try DirectorLaunch(agent: agent, executable: executable, engine: engine, project: project, run: run,
            request: request, model: model ?? settings.model(for: agent), allowUnrestrictedTools: unrestrictedTools ?? settings.allowUnrestrictedTools, briefSeeded: briefInSession)
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
            Task { @MainActor in
                guard let self, self.identity == identity else { return }
                self.isFinishing = true
                defer { self.isFinishing = false }
                self.isRunning = false
                self.process = nil
                self.lastExitCode = finished.terminationStatus
                self.status = self.stopRequested ? "Director stopped · your files are preserved; resume when ready" : (finished.terminationStatus == 0 ? "Director finished · review the published result" : "Director stopped (\(finished.terminationStatus)) · inspect the log, fix prerequisites or permissions, then resume")
                if !self.stopRequested && finished.terminationStatus != 0 {
                    let recovery = await Task.detached { DirectorRecovery.classify(log: Self.readLogTail(log)) }.value
                    guard self.identity == identity else { return }
                    self.recovery = recovery
                }
                self.onExit?(finished.terminationStatus, self.stopRequested)
            }
        }
        try process.run()
        self.process = process
        activeRun = run; activeProject = project; logURL = log
        isRunning = true
        status = "Director running · \(agent.title)"
        return run
    }
    private var identity = UUID()
    func reconnect(run: URL, root: URL, settings: StudioSettings) async throws {
        guard let node = settings.nodeURL else { throw RuntimeError.missingNode }
        guard let engine = Self.engineURL else { throw RuntimeError.missingEngine }
        let code = try await Self.execute(node, arguments: [engine.appendingPathComponent("scripts/console.mjs").path,
            "serve", "--run", run.path, "--root", root.path], directory: root, environment: environment(node: node, settings: settings))
        guard code == 0 else { throw RuntimeError.consoleFailed }
    }
    func clearPresentation() {
        guard !isRunning, !isPreparing, !isFinishing else { return }
        lastExitCode = nil; stopRequested = false; logURL = nil; activeRun = nil; activeProject = nil
        startedAt = nil; recovery = nil
        status = "Director stopped"
    }
    func stop() {
        guard let process, process.isRunning else { return }
        stopRequested = true
        status = "Stopping director and its child processes…"
        process.terminate()
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
            case .consoleFailed: "The local console could not start. Check the Node installation and the selected project permissions."
            case .preflightFailed(let issues): "Resolve these items before starting:\n\(issues)"
            case .directorNotReady(let reason): "Your director isn't ready to start. \(reason) Open Help → Show Welcome to sign in and recheck."
            }
        }
    }
}
