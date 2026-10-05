import AppKit
import Darwin
import Observation
import StudioCore
import SwiftUI

enum SetupTool: String, CaseIterable, Identifiable, Sendable {
    case ffmpeg, renderer, browser, skills
    var id: String { rawValue }
    var title: String {
        switch self {
        case .ffmpeg: "Video and media tools"
        case .renderer: "HyperFrames renderer"
        case .browser: "Render browser"
        case .skills: "Design resources"
        }
    }
    var detail: String {
        switch self {
        case .ffmpeg: "Install FFmpeg and ffprobe for this Mac."
        case .renderer: "Install the renderer in your Studio tools folder."
        case .browser: "Find or download the browser used for rendering."
        case .skills: "Install HyperFrames resources for your directors. Requires Git."
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
            try JSONEncoder().encode(["tools": tools.map(\.rawValue)]).write(to: job, options: .atomic)
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
