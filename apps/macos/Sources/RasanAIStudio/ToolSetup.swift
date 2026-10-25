import AppKit
import Darwin
import Observation
import StudioCore
import SwiftUI

enum SetupTool: String, CaseIterable, Identifiable, Sendable {
    case ffmpeg, renderer, browser, skills, transcriber
    var id: String { rawValue }
    var title: String {
        switch self {
        case .ffmpeg: "Video and media tools"
        case .renderer: "HyperFrames renderer"
        case .browser: "Render browser"
        case .skills: "Design resources"
        case .transcriber: "Speech transcriber"
        }
    }
    var detail: String {
        switch self {
        case .ffmpeg: "Install FFmpeg and ffprobe for this Mac."
        case .renderer: "Install the renderer in your Studio tools folder."
        case .browser: "Find or download the browser used for rendering."
        case .skills: "Install HyperFrames resources for your directors. Requires Git."
        case .transcriber: "Install the speech transcriber (whisper) and its model, about 470 MB, then test it. Used to caption and cut footage by what is said."
        }
    }
    static func missing(in report: PreflightReport?) -> [SetupTool] {
        guard let report else { return [] }
        let ids = Set(report.items.filter { $0.level != .ready }.map(\.id))
        return allCases.filter { tool in tool == .ffmpeg ? !ids.isDisjoint(with: ["ffmpeg", "ffprobe"]) : ids.contains(tool.id) }
    }
}

@MainActor @Observable final class ToolSetup {
    var isRunning = false
    var isCancelling = false
    var isRechecking = false
    var message = ""
    var error: String?
    var completed: [String] = []
    var logURL: URL?
    var logText = ""
    var showLog = false
    private var process: Process?
    private var task: Task<Void, Never>?
    private struct Status: Decodable { let message: String; let completed: [String]; let error: String?; let cancelled: Bool }

    static var driverURL: URL? {
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("Runtime/tool-setup.mjs")
        if let bundled, FileManager.default.isReadableFile(atPath: bundled.path) { return bundled }
        let source = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../Runtime/tool-setup.mjs").standardizedFileURL
        return FileManager.default.isReadableFile(atPath: source.path) ? source : nil
    }
    func start(tools: [SetupTool], node: URL?, environment: [String: String], onComplete: @escaping @MainActor () async -> Void) {
        guard !isRunning, !tools.isEmpty else { return }
        error = nil; completed = []; logText = ""; logURL = nil; isCancelling = false
        guard let node, let driver = Self.driverURL else {
            error = "The bundled setup tools or Node are unavailable. Choose Automatic for Node in Settings, or download a fresh copy of Studio."; return
        }
        let fm = FileManager.default
        var output: FileHandle?
        var lock: FileHandle?
        do {
            let root = LocalAgent.managedToolsDirectory
            try fm.createDirectory(at: root, withIntermediateDirectories: true)
            let lockURL = root.appendingPathComponent("setup.lock")
            let descriptor = Darwin.open(lockURL.path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, 0o600)
            guard descriptor >= 0 else { throw SetupError.lock }
            lock = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
            guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else { throw SetupError.busy }
            let run = root.appendingPathComponent("logs/setup-\(UUID().uuidString)")
            try fm.createDirectory(at: run, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let job = run.appendingPathComponent("job.json")
            var jobObject: [String: Any] = ["tools": tools.map(\.rawValue)]
            if let engine = DirectorRuntime.engineURL { jobObject["engine"] = engine.path }
            try JSONSerialization.data(withJSONObject: jobObject).write(to: job, options: .atomic)
            let log = run.appendingPathComponent("setup.log")
            guard fm.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600]) else { throw SetupError.log }
            output = try FileHandle(forWritingTo: log)
            let process = Process()
            process.executableURL = node; process.arguments = [driver.path, job.path]
            process.currentDirectoryURL = root; process.environment = environment
            process.standardInput = FileHandle.nullDevice
            process.standardOutput = output; process.standardError = output
            try process.run()
            self.process = process; self.logURL = log
            isRunning = true; message = "Preparing tool setup…"
            let writer = output, heldLock = lock
            task = Task {
                defer { try? writer?.close(); try? heldLock?.close(); self.process = nil; task = nil; isRunning = false; isCancelling = false; isRechecking = false }
                let statusURL = run.appendingPathComponent("status.json")
                while process.isRunning {
                    readStatus(statusURL)
                    if showLog { refreshLog() }
                    try? await Task.sleep(for: .milliseconds(300))
                }
                readStatus(statusURL); refreshLog()
                if isCancelling || process.terminationStatus == 130 {
                    message = "Setup cancelled. Completed installations are kept."
                    error = nil
                } else if process.terminationStatus != 0 {
                    error = error ?? "Setup stopped (exit \(process.terminationStatus)). Open the log for details, then retry."
                }
                // A successful command alone does not mean a tool is ready. Always inspect it again.
                isRechecking = true
                await onComplete()
                if !isCancelling, process.terminationStatus == 0, error == nil { message = "Setup complete. Readiness refreshed below." }
            }
        } catch {
            try? output?.close(); try? lock?.close()
            self.error = error.localizedDescription
        }
    }
    private func readStatus(_ url: URL) {
        guard let data = try? Data(contentsOf: url), let status = try? JSONDecoder().decode(Status.self, from: data) else { return }
        message = status.message; completed = status.completed; error = status.error
    }
    func cancel() {
        guard isRunning, !isCancelling, !isRechecking, process?.isRunning == true else { return }
        isCancelling = true; message = "Cancelling setup…"; process?.terminate()
    }
    func refreshLog() { if let logURL { logText = DirectorRuntime.readLogTail(logURL) } }
    private enum SetupError: LocalizedError {
        case busy, lock, log
        var errorDescription: String? {
            switch self {
            case .busy: "Another Studio window is installing tools. Wait for it to finish, then recheck."
            case .lock: "The Studio tools folder cannot be locked. Check its permissions."
            case .log: "The setup log could not be created. Check the Studio tools folder permissions."
            }
        }
    }
}

extension StudioStore {
    var canInstallTools: Bool { !isDemo && !toolSetup.isRunning && !isCheckingPreflight && !isSavingFilm && !runtime.isRunning && !runtime.isPreparing && !runtime.isFinishing && !queueStarting && !queueHandlingExit }
    func installTools(_ tools: [SetupTool]) {
        guard canInstallTools else { return }
        pauseQueue()
        let node = settings.nodeURL
        toolSetup.start(tools: tools, node: node, environment: node.map { runtime.environment(node: $0) } ?? ProcessInfo.processInfo.environment) { [weak self] in
            guard let self else { return }
            await checkPreflight()
            if toolSetup.error == nil, !toolSetup.isCancelling {
                let remaining = SetupTool.missing(in: preflightReport).filter { tools.contains($0) }
                if !remaining.isEmpty {
                    toolSetup.message = "Setup needs attention."
                    toolSetup.error = "These tools still need setup: \(remaining.map(\.title).joined(separator: ", ")). Review the checks below, then retry."
                }
            }
        }
    }
}

struct ToolSetupProgress: View {
    @Bindable var setup: ToolSetup
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                if setup.isRunning { ProgressView().controlSize(.small) }
                Text(setup.message).font(.system(size: 13, weight: .medium))
                Spacer()
                if setup.isRunning { Button("Cancel setup") { setup.cancel() }.disabled(setup.isCancelling || setup.isRechecking).controlSize(.small) }
            }
            if let error = setup.error { Text(error).font(.system(size: 12)).foregroundStyle(.red).textSelection(.enabled) }
            if !setup.completed.isEmpty {
                Text("Completed: " + setup.completed.compactMap { SetupTool(rawValue: $0)?.title }.joined(separator: ", "))
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
            if setup.logURL != nil {
                DisclosureGroup("Setup log", isExpanded: $setup.showLog) {
                    ScrollView {
                        Text(setup.logText).font(.system(size: 10, design: .monospaced)).textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(8)
                    }.frame(height: 110).background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
                    Button("Show log in Finder") { if let url = setup.logURL { NSWorkspace.shared.activateFileViewerSelecting([url]) } }.controlSize(.small)
                }.font(.system(size: 12)).onChange(of: setup.showLog) { if setup.showLog { setup.refreshLog() } }
            }
        }.padding(12).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }
}

/// Design resources need Git, and on a Mac without developer tools Git comes with Apple's command line tools. This starts
/// Apple's installer, then watches for the tools to arrive (the installer runs on its own for several minutes) and
/// rechecks readiness by itself, so nobody has to remember to press Recheck.
struct DeveloperToolsSetup: View {
    let store: StudioStore
    @State private var note: String?
    @State private var waiting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Design resources need Git, which comes with Apple's free command line tools.")
                .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button("Install Command Line Tools…") { Task { await install() } }
                    .controlSize(.small).disabled(waiting || !store.canInstallTools)
                if waiting { ProgressView().controlSize(.small) }
            }
            if let note { Text(note).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
        }
    }

    private func install() async {
        let home = FileManager.default.homeDirectoryForCurrentUser, environment = ProcessInfo.processInfo.environment
        let selector = URL(fileURLWithPath: "/usr/bin/xcode-select")
        guard let code = try? await DirectorRuntime.execute(selector, arguments: ["--install"], directory: home, environment: environment), code == 0 else {
            note = "macOS couldn't start the installer. Open System Settings › General › Software Update, then come back."
            return
        }
        waiting = true
        note = "Finish Apple's installer. Studio carries on by itself when it's done."
        // Up to 30 minutes: the download and install are Apple's, and can be slow.
        for _ in 0..<360 {
            try? await Task.sleep(for: .seconds(5))
            if (try? await DirectorRuntime.execute(selector, arguments: ["-p"], directory: home, environment: environment)) == 0 {
                await store.checkPreflight()
                note = "Command line tools installed."
                waiting = false
                return
            }
        }
        waiting = false
        note = "Still waiting for the installer. Recheck when it's finished."
    }
}

// MARK: A tool the director asked for (or was refused while trying to install)

/// Runs the approved install path. The director can never run brew, sudo or an installer itself; when it needs a tool it asks
/// (`console.mjs ask` with an `install-tool:<tool>` option, see `ToolNeed`), Studio shows a card, and "Install for me" runs the same
/// managed, no-password setup as Settings. Success is only believed after the tool is seen on the PATH the director gets, and
/// then the answer that wakes the director is sent (or the director is restarted if it already exited).
@MainActor @Observable final class ToolNeedCoordinator {
    static let shared = ToolNeedCoordinator()
    enum Phase: Equatable { case idle, installing, verifying, failed(String), manual(String), ready }
    private(set) var phase: Phase = .idle
    private(set) var tool: String?
    private weak var store: StudioStore?
    func attach(_ store: StudioStore) { self.store = store }
    var setup: ToolSetup? { store?.toolSetup }
    var isBusy: Bool { phase == .installing || phase == .verifying }
    func reset() { if !isBusy { phase = .idle; tool = nil } }

    /// True when Homebrew exists on this Mac (a manual `brew install` is only worth suggesting then).
    static var brewPresent: Bool { ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"].contains { FileManager.default.isExecutableFile(atPath: $0) } }

    private func record(_ need: ToolNeed, source: String, consent: String, result: String, detail: String = "") {
        guard let run = store?.runURL else { return }
        let entry = InstallConsent(tool: need.tool, source: source, consent: consent, result: result, detail: detail)
        Task.detached { entry.append(run: run) }
    }
    private func directorEnvironment() -> [String: String] {
        guard let store else { return ProcessInfo.processInfo.environment }
        return store.settings.nodeURL.map { store.runtime.environment(node: $0, settings: store.settings) } ?? ProcessInfo.processInfo.environment
    }

    /// "Install for me": the person's yes. Studio's own setup, no sudo, no brew.
    func installForMe(_ need: ToolNeed, ask: DirectorAsk?, model: FilmSessionModel?) {
        guard let store, !isBusy, !store.toolSetup.isRunning else { return }
        guard let key = need.managedKey, let kind = SetupTool(rawValue: key) else {
            phase = .manual(need.manualSteps(brewPresent: Self.brewPresent)); tool = need.tool
            record(need, source: "studio-managed", consent: "approved", result: "failed", detail: "Studio cannot install \(need.tool) by itself")
            return
        }
        guard store.settings.nodeURL != nil else {
            phase = .failed("Node.js is not set up, so Studio cannot run its installer. Choose Automatic for Node in Settings → Director → Advanced, then try again."); tool = need.tool
            return
        }
        tool = need.tool; phase = .installing
        record(need, source: "studio-managed", consent: "approved", result: "started", detail: kind.title)
        store.toolSetup.start(tools: [kind], node: store.settings.nodeURL, environment: directorEnvironment()) { [weak self] in
            await self?.setupEnded(need, ask: ask, model: model)
        }
        if !store.toolSetup.isRunning, let error = store.toolSetup.error {
            phase = .failed(error)
            record(need, source: "studio-managed", consent: "approved", result: "failed", detail: error)
        }
    }

    private func setupEnded(_ need: ToolNeed, ask: DirectorAsk?, model: FilmSessionModel?) async {
        guard let setup else { return }
        if setup.isCancelling { phase = .idle; record(need, source: "studio-managed", consent: "approved", result: "failed", detail: "cancelled"); return }
        if let error = setup.error {
            phase = .failed(error + " " + need.manualSteps(brewPresent: Self.brewPresent))
            record(need, source: "studio-managed", consent: "approved", result: "failed", detail: error)
            return
        }
        record(need, source: "studio-managed", consent: "approved", result: "installed")
        await verifyAndResume(need, ask: ask, model: model, source: "studio-managed", consent: "approved")
    }

    /// "I installed it - check again": the person did it themselves.
    func checkAgain(_ need: ToolNeed, ask: DirectorAsk?, model: FilmSessionModel?) {
        guard !isBusy else { return }
        tool = need.tool
        Task { await verifyAndResume(need, ask: ask, model: model, source: "user-manual", consent: "checked-manually") }
    }

    func skip(_ need: ToolNeed, ask: DirectorAsk?, model: FilmSessionModel?) {
        guard let ask, let model else { return }
        record(need, source: "none", consent: "declined", result: "skipped")
        Task {
            if await model.answer(ask, choice: need.skipChoice, text: "Continue without \(need.title).") { phase = .idle; store?.monitor.acknowledgeBlock(); await wake() }
        }
    }

    /// Looks for the tool where the director would, and resumes only when it is really there.
    private func verifyAndResume(_ need: ToolNeed, ask: DirectorAsk?, model: FilmSessionModel?, source: String, consent: String) async {
        guard let store else { return }
        phase = .verifying
        let found = await FilmPreflight.visibleOnPath(need.executables, environment: directorEnvironment())
        let absent = need.executables.filter { found[$0] == nil }
        if !need.preflightIDs.isEmpty { await store.checkPreflight() }
        let notReady = (store.preflightReport?.items ?? []).filter { need.preflightIDs.contains($0.id) && $0.level != .ready }
        if !absent.isEmpty || !notReady.isEmpty {
            let what = (absent + notReady.map(\.title)).joined(separator: ", ")
            phase = .manual("Studio looked where Rasan looks and could not find: \(what). " + need.manualSteps(brewPresent: Self.brewPresent))
            record(need, source: source, consent: consent, result: "not-visible", detail: what)
            return
        }
        let where_ = found.values.map(\.path).sorted().joined(separator: ", ")
        record(need, source: source, consent: consent, result: "visible-on-path", detail: where_)
        let words = "\(need.title) is installed and Studio found it on your PATH\(where_.isEmpty ? "" : " (\(where_))"). Check with which and carry on."
        if let ask, let model {
            guard await model.answer(ask, choice: need.readyChoice, text: words) else { phase = .failed(model.lastError ?? "Studio could not send the answer. Try again."); return }
        } else if let model, store.runtime.isRunning {
            _ = await model.tell("Studio: " + words + " The command that was blocked is not needed any more.")
        }
        phase = .ready
        store.monitor.acknowledgeBlock()
        await wake()
    }

    /// The answer is queued. A live director reads it on its next wait; one that already exited is restarted from the saved run.
    private func wake() async {
        guard let store, !store.runtime.isRunning, !store.runtime.isFrozen else { return }
        store.restartRasan()
    }
}

extension StudioStore {
    /// "Restart Rasan": stops the director if one is alive, then starts it again from the run's saved state. Never two directors for
    /// one run: the start path reuses `adoptLiveDirector` and the runtime's own guard.
    func restartRasan() {
        cancelAutoResume()
        guard runURL != nil, !isSample, !runtime.isPreparing else { return }
        Task { @MainActor in
            if runtime.isRunning {
                runtime.stop()
                for _ in 0..<40 where runtime.isRunning || runtime.isFinishing { try? await Task.sleep(for: .milliseconds(250)) }
            }
            guard !runtime.isRunning else { errorMessage = "Rasan has not stopped yet. Wait a moment and press Restart Rasan again."; return }
            monitor.acknowledgeBlock(); monitor.noteResumed()
            resumeDirector()
        }
    }

    /// "Retry step": a note to a live director to try its current step again (and not to repeat a refused command); a restart if it is gone.
    func retryStep() {
        guard let film, runURL != nil else { return }
        guard runtime.isRunning, !runtime.isFrozen else { restartRasan(); return }
        let blocked = monitor.openBlock.map { " The command `\($0.command)` was refused: do not run it again. If a program is missing, stop and ask with console.mjs ask using an install-tool:<tool> option." } ?? ""
        monitor.acknowledgeBlock()
        Task { _ = await film.tell("Studio: please retry the step you are on.\(blocked)") }
    }
}

/// The card for a tool the film needs: what it is, "Install for me" (Studio's managed setup), and a manual path that is checked
/// against the same PATH the director gets. Used for the director's own request and for a refused install command.
struct ToolNeedCard: View {
    let need: ToolNeed
    var ask: DirectorAsk?
    var model: FilmSessionModel?
    var coordinator = ToolNeedCoordinator.shared
    var onLater: (() -> Void)?

    var body: some View {
        let active = coordinator.tool == need.tool
        let phase = active ? coordinator.phase : .idle
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Label("Rasan needs \(need.title)", systemImage: "wrench.and.screwdriver.fill").font(.system(size: 14, weight: .semibold))
                Text(need.why).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Text(need.whatItDoes).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
                if need.managedKey != nil {
                    Text("Studio installs it in its own folder. No password and no Homebrew.").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
            if let setup = coordinator.setup, active, phase != .idle || setup.isRunning { ToolSetupProgress(setup: setup) }
            switch phase {
            case .verifying: Label("Checking that Rasan can find it…", systemImage: "magnifyingglass").font(.system(size: 12)).foregroundStyle(.secondary)
            case .failed(let reason): Text(reason).font(.system(size: 12)).foregroundStyle(.red).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            case .manual(let steps): Text(steps).font(.system(size: 12)).foregroundStyle(.orange).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            case .ready: Label("Found. Rasan carries on.", systemImage: "checkmark.circle.fill").font(.system(size: 12)).foregroundStyle(.green)
            default:
                if need.managedKey == nil { Text(need.manualSteps(brewPresent: ToolNeedCoordinator.brewPresent)).font(.system(size: 12)).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true) }
            }
            HStack {
                if let onLater { Button("Answer later", action: onLater).keyboardShortcut(.cancelAction) }
                if ask != nil { Button("Continue without it") { coordinator.skip(need, ask: ask, model: model) }.disabled(coordinator.isBusy) }
                Spacer()
                Button("I installed it - check again") { coordinator.checkAgain(need, ask: ask, model: model) }.disabled(coordinator.isBusy)
                if need.managedKey != nil {
                    Button(phase == .idle || phase == .ready ? "Install for me" : "Try again") { coordinator.installForMe(need, ask: ask, model: model) }
                        .buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction).disabled(coordinator.isBusy || phase == .ready)
                }
            }
        }
        .padding(16)
        .onDisappear { coordinator.reset() }
    }
}
