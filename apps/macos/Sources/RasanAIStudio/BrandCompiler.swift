import Foundation
import Observation
import StudioCore

/// Turns a dropped brand kit into a finished brand: the engine's `inventory` copies the files and sorts them, then one
/// headless Claude job (the way TasteLearner runs one) reads the guidelines and writes DESIGN.md, the logo roles and the
/// rules, then `check` runs. One job per brand folder, held by the store so leaving the brand page does not stop it.
/// If Claude is not set up or fails, the inventory result stays (the files are already in the brand) and the state says why.
@MainActor @Observable
final class BrandCompiler {
    enum State: Equatable, Sendable { case idle, reading, compiling, checking, done, failed(String) }

    private(set) var state: State = .idle
    private var task: Task<Void, Never>?

    var isRunning: Bool { state == .reading || state == .compiling || state == .checking }

    nonisolated static let model = "claude-sonnet-5-5"
    nonisolated static let timeout: TimeInterval = 15 * 60
    /// What the compiler prompt runs besides the commands every director may (PDF text and pages, font facts, SVG from .ai).
    nonisolated static let commands = ["pdftotext", "pdftoppm", "pdfimages", "pdftocairo", "fc-scan",
                                       "*/bin/pdftotext", "*/bin/pdftoppm", "*/bin/pdfimages", "*/bin/pdftocairo", "*/bin/fc-scan"]

    func cancel() { task?.cancel(); task = nil; if isRunning { state = .idle } }
    /// Clears a finished or failed state (the card on the brand page).
    func dismiss() { if !isRunning { state = .idle } }

    /// Starts (or restarts) the job for `brand`'s folder with `kit` (a folder or .zip). `name` is only passed when the person typed one.
    func start(kit: URL, brand: URL, name: String?, store: StudioStore) {
        cancel()
        state = .reading
        // The last run's answers would read as this run's if it fails early.
        try? FileManager.default.removeItem(at: brand.appendingPathComponent("assets/compile.json"))
        let settings = store.settings
        let node = settings.nodeURL ?? LessonStore.node
        let environment = store.runtime.environment(node: node ?? URL(fileURLWithPath: "/usr/bin/env"), settings: settings)
        let job = Job(kit: kit, brand: brand, name: name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty, engine: DirectorRuntime.engineURL, node: node,
                      claude: URL(fileURLWithPath: settings.path(for: .claude)), environment: environment)
        task = Task { [weak self] in
            let work = Task.detached(priority: .utility) { await job.run { step in await MainActor.run { if self?.task != nil { self?.state = step } } } }
            let outcome = await withTaskCancellationHandler { await work.value } onCancel: { work.cancel() }
            guard !Task.isCancelled, let self else { return }
            if let problem = outcome.problem { state = .failed(problem) } else { state = .done }
        }
    }

    struct Outcome: Sendable { var problem: String? }

    struct Job: Sendable {
        var kit: URL
        var brand: URL
        var name: String?
        var engine: URL?
        var node: URL?
        var claude: URL
        var environment: [String: String]

        func run(progress: @Sendable (State) async -> Void) async -> Outcome {
            let fm = FileManager.default
            guard let engine, let node else { return Outcome(problem: "The skill or Node is missing.") }
            let script = engine.appendingPathComponent("scripts/brand-assets.mjs")
            guard fm.fileExists(atPath: script.path) else { return Outcome(problem: "This version of the skill cannot read a brand kit yet.") }
            let assets = brand.appendingPathComponent("assets", isDirectory: true)
            do { try fm.createDirectory(at: assets, withIntermediateDirectories: true) } catch { return Outcome(problem: error.localizedDescription) }

            // 1. Copy and sort the kit's files (no Claude, no network).
            await progress(.reading)
            var arguments = [script.path, "inventory", "--kit", kit.path, "--brand", brand.path]
            if let name { arguments += ["--name", name] }
            let inventory = await run(node, arguments, "assets/inventory.log", 10 * 60)
            guard let inventory, Self.ok(inventory) else {
                return Outcome(problem: "RasanAI could not read that kit. Check that the folder or zip is complete, then try again.")
            }
            if Task.isCancelled { return Outcome(problem: "Stopped.") }

            // 2. The prompt, with the kit's, the brand's and the skill's paths filled in.
            var problem: String?
            let prompt = await run(node, [script.path, "compile-prompt", "--kit", kit.path, "--brand", brand.path], "assets/compile-prompt.txt", 60)
            if !fm.isExecutableFile(atPath: claude.path) {
                problem = "Claude Code is not set up, so the brand has the kit’s files but no written design system yet."
            } else if let prompt, !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                // 3. Claude reads the kit (never writes to it) and writes in the brand folder, its working folder.
                await progress(.compiling)
                let home = fm.homeDirectoryForCurrentUser
                var isDirectory: ObjCBool = false
                let isFolder = fm.fileExists(atPath: kit.path, isDirectory: &isDirectory) && isDirectory.boolValue
                let permissions = DirectorPermissions(engine: engine, home: home, toolsDirectory: LocalAgent.managedToolsDirectory,
                                                      readFolders: isFolder ? [kit.path] : [], readFiles: isFolder ? [] : [kit.path],
                                                      extraCommands: BrandCompiler.commands)
                let claudeArguments = ["--print", "--output-format", "text", "--permission-mode", "acceptEdits", "--settings", permissions.claudeSettingsJSON,
                                       "--model", BrandCompiler.model, prompt]
                let ran = await TasteLearner.Job.capture(claude, claudeArguments, in: brand, environment: environment, timeout: BrandCompiler.timeout, name: "assets/compile.log")
                if ran == nil && !fm.fileExists(atPath: assets.appendingPathComponent("compile.json").path) {
                    problem = Task.isCancelled ? "Stopped."
                        : "Claude did not finish reading the kit. The brand has the kit’s files; use Recompile from kit to try again (assets/compile.log has the details)."
                }
            } else {
                problem = "The skill gave no compile prompt, so the brand has the kit’s files but no written design system yet."
            }
            if Task.isCancelled { return Outcome(problem: "Stopped.") }

            // 4. Check the result either way, so the brand page shows what is still missing.
            await progress(.checking)
            _ = await run(node, [script.path, "check", "--brand", brand.path], "assets/check.log", 120)
            return Outcome(problem: problem)
        }

        /// A node script run in the brand folder with stderr dropped, so the output is only the script's JSON (or prompt).
        private func run(_ node: URL, _ arguments: [String], _ log: String, _ timeout: TimeInterval) async -> String? {
            await TasteLearner.Job.capture(node, arguments, in: brand, environment: environment, timeout: timeout, name: log, quiet: true)
        }

        /// `{ "ok": true ... }` anywhere in the output's JSON.
        static func ok(_ output: String) -> Bool {
            guard let data = output.data(using: .utf8), let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return false }
            return (object["ok"] as? Bool) == true
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
