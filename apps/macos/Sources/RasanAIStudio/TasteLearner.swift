import Foundation
import Observation
import StudioCore

/// Learns the taste answers from an edit the person likes, as one short headless job before any film starts: it asks
/// `scripts/learn.mjs` for the prompt, runs that prompt through Claude (Sonnet, no windows, no questions) and reads
/// `<dir>/taste.json`. The setup flow stays usable while it runs, and a failure just means the questions are asked.
@MainActor @Observable
final class TasteLearner {
    enum State: Equatable { case idle, running, done, failed(String) }

    private(set) var state: State = .idle
    private(set) var result: TasteResult?
    /// The job's folder (`taste.json`, the contact sheet and any end card it cut out).
    private(set) var directory: URL?
    private(set) var video: URL?
    private var task: Task<Void, Never>?

    var isRunning: Bool { state == .running }

    nonisolated static let model = "claude-sonnet-5-5"
    nonisolated static let timeout: TimeInterval = 8 * 60

    /// Starts the job for a dropped edit (and the raw clip it was cut from, when there is one). Replaces any job in progress.
    func learn(video: URL, clip: URL?, store: StudioStore) {
        cancel()
        state = .running; result = nil; self.video = video
        let settings = store.settings
        let environment = store.runtime.environment(node: settings.nodeURL ?? URL(fileURLWithPath: "/usr/bin/env"), settings: settings)
        let job = Job(video: video, clip: clip, engine: DirectorRuntime.engineURL, node: settings.nodeURL,
                      claude: URL(fileURLWithPath: settings.path(for: .claude)), environment: environment)
        task = Task {
            let outcome = await Task.detached(priority: .utility) { await job.run() }.value
            guard !Task.isCancelled else { return }
            directory = outcome.directory
            result = outcome.result
            state = outcome.result != nil ? .done : .failed(outcome.problem ?? "RasanAI could not study that video.")
        }
    }

    func cancel() { task?.cancel(); task = nil; if state == .running { state = .idle } }
    func reset() { cancel(); state = .idle; result = nil; directory = nil; video = nil }

    struct Outcome: Sendable { var directory: URL?; var result: TasteResult?; var problem: String? }

    struct Job: Sendable {
        var video: URL
        var clip: URL?
        var engine: URL?
        var node: URL?
        var claude: URL
        var environment: [String: String]

        func run() async -> Outcome {
            let fm = FileManager.default
            guard let engine, let node else { return Outcome(problem: "The skill or Node is missing.") }
            let script = engine.appendingPathComponent("scripts/learn.mjs")
            guard fm.fileExists(atPath: script.path) else { return Outcome(problem: "This version of the skill cannot study an edit yet.") }
            guard fm.isExecutableFile(atPath: claude.path) else { return Outcome(problem: "Claude Code is not set up.") }
            let home = fm.homeDirectoryForCurrentUser
            let dir = home.appendingPathComponent(".rasanai/learn/\(UUID().uuidString)", isDirectory: true)
            do { try fm.createDirectory(at: dir, withIntermediateDirectories: true) } catch { return Outcome(problem: error.localizedDescription) }

            // 1. The prompt for the headless job (the script writes nothing else).
            var arguments = [script.path, "prompt", "--video", video.path]
            if let clip { arguments += ["--clip", clip.path] }
            arguments += ["--out", dir.path]
            guard let prompt = await Self.capture(node, arguments, in: dir, environment: environment, timeout: 60, name: "prompt.txt"),
                  !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return Outcome(directory: dir, result: TasteResult.load(in: dir), problem: "The learn script gave no prompt.")
            }

            // 2. Claude runs infer, looks at the contact sheet and fills in the rest. It may read the edit and write in its folder only.
            var readable = [video.deletingLastPathComponent().path]
            if let clip { readable.append(clip.deletingLastPathComponent().path) }
            let permissions = DirectorPermissions(engine: engine, home: home, toolsDirectory: LocalAgent.managedToolsDirectory, readFolders: readable)
            let claudeArguments = ["--print", "--output-format", "text", "--permission-mode", "acceptEdits", "--settings", permissions.claudeSettingsJSON,
                                   "--model", TasteLearner.model, prompt]
            _ = await Self.capture(claude, claudeArguments, in: dir, environment: environment, timeout: TasteLearner.timeout, name: "claude.log")

            // 3. Whatever taste.json holds. "done" has the vision pass; "measured" is still the real measures, so it is used too.
            if let result = TasteResult.load(in: dir) { return Outcome(directory: dir, result: result) }
            return Outcome(directory: dir, problem: "Claude did not write taste.json.")
        }

        /// Runs a program with no window and no input; returns its output (written to a file in `dir`, never a pipe that could fill).
        static func capture(_ executable: URL, _ arguments: [String], in dir: URL, environment: [String: String], timeout: TimeInterval, name: String, quiet: Bool = false) async -> String? {
            let log = dir.appendingPathComponent(name)
            FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600])
            guard let output = try? FileHandle(forWritingTo: log) else { return nil }
            defer { try? output.close() }
            let process = Process()
            process.executableURL = executable; process.arguments = arguments
            process.currentDirectoryURL = dir; process.environment = environment
            process.standardInput = FileHandle.nullDevice; process.standardOutput = output
            process.standardError = quiet || name == "prompt.txt" ? FileHandle.nullDevice : output
            do { try process.run() } catch { return nil }
            let deadline = Date().addingTimeInterval(timeout)
            while process.isRunning {
                if Task.isCancelled || Date() > deadline { process.terminate(); break }
                try? await Task.sleep(for: .milliseconds(150))
            }
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { return nil }
            return try? String(contentsOf: log, encoding: .utf8)
        }
    }
}
