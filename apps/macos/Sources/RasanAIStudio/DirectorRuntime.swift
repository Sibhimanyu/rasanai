import AppKit
import Observation
import StudioCore

@MainActor @Observable
final class DirectorRuntime {
    var isRunning = false
    var isPreparing = false
    var status = "Director stopped"
    var logURL: URL?
    var lastExitCode: Int32?
    var stopRequested = false
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
    func environment(node: URL) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = ([node.deletingLastPathComponent().path] + LocalAgent.searchDirectories).joined(separator: ":")
        env["RASANAI_NO_UPDATE_CHECK"] = "1"
        env["RASANAI_AUTO_UPDATE"] = "0"
        env.removeValue(forKey: "CLAUDECODE")
        return env
    }
    func start(project: URL, existingRun: URL? = nil, request: String, settings: StudioSettings) async throws -> URL {
        guard !isRunning, !isPreparing else { throw RuntimeError.busy }
        guard let engine = Self.engineURL, let driver = Self.driverURL else { throw RuntimeError.missingEngine }
        guard let node = settings.nodeURL else { throw RuntimeError.missingNode }
        let agent = LocalAgent(rawValue: settings.defaultAgent) ?? .claude
        let executable = URL(fileURLWithPath: settings.path(for: agent))
        guard FileManager.default.isExecutableFile(atPath: executable.path) else { throw RuntimeError.missingAgent }
        isPreparing = true
        lastExitCode = nil; stopRequested = false
        defer { isPreparing = false }
        let run = existingRun ?? project.appendingPathComponent(".rasanai/run-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: run, withIntermediateDirectories: true)
        if existingRun == nil {
            try Data(run.lastPathComponent.utf8).write(to: project.appendingPathComponent(".rasanai/current"), options: .atomic)
        }
        let session = run.appendingPathComponent("session.json")
        if !FileManager.default.fileExists(atPath: session.path) {
            try JSONEncoder().encode(JSONValue.object(["title": .string(project.lastPathComponent), "current": .string("brief"), "steps": .object([:])]))
                .write(to: session, options: .atomic)
        }
        let environment = environment(node: node)
        guard try await Self.execute(node, arguments: ["-e", "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"], directory: project, environment: environment) == 0 else { throw RuntimeError.missingNode }
        let code = try await Self.execute(node, arguments: [engine.appendingPathComponent("scripts/console.mjs").path,
            "serve", "--run", run.path, "--root", project.path], directory: project, environment: environment)
        guard code == 0 else { throw RuntimeError.consoleFailed }
        let launch = try DirectorLaunch(agent: agent, executable: executable, engine: engine, project: project, run: run,
            request: request, model: settings.model(for: agent), allowUnrestrictedTools: settings.allowUnrestrictedTools)
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
                self.isRunning = false
                self.process = nil
                self.lastExitCode = finished.terminationStatus
                self.status = self.stopRequested ? "Director stopped · your files are preserved; resume when ready" : (finished.terminationStatus == 0 ? "Director finished · review the published result" : "Director stopped (\(finished.terminationStatus)) · inspect the log, fix prerequisites or permissions, then resume")
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
            "serve", "--run", run.path, "--root", root.path], directory: root, environment: environment(node: node))
        guard code == 0 else { throw RuntimeError.consoleFailed }
    }
    func clearPresentation() {
        guard !isRunning, !isPreparing else { return }
        lastExitCode = nil; stopRequested = false; logURL = nil; activeRun = nil; activeProject = nil
        status = "Director stopped"
    }
    func stop() {
        guard let process, process.isRunning else { return }
        stopRequested = true
        status = "Stopping director and its child processes…"
        process.terminate()
    }
    func logTail() -> String {
        guard let logURL, let handle = try? FileHandle(forReadingFrom: logURL) else { return "No director output yet." }
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
        case busy, missingEngine, missingNode, missingAgent, consoleFailed
        var errorDescription: String? {
            switch self {
            case .busy: "A director is already running. Stop it before starting another project."
            case .missingEngine: "The app bundle is missing its RasanAI engine or supervisor. Rebuild using build-app.sh."
            case .missingNode: "Node.js 20 or newer is required. Configure Node in Settings → Runtime."
            case .missingAgent: "Choose an installed, signed-in agent in Settings → Agents."
            case .consoleFailed: "The local console could not start. Check the Node installation and the selected project permissions."
            }
        }
    }
}
