import AppKit
import Observation
import StudioCore
import SwiftUI

/// Signs an agent in without Terminal: runs its login command inside a pseudo-terminal (so it behaves as it would in a
/// terminal window), lets it open the browser itself, and watches for the account to report signed in.
@MainActor @Observable
final class AgentSignIn {
    var agent: LocalAgent?
    var isRunning = false
    /// The sign-in page the agent printed, as a fallback when the browser didn't open by itself.
    var url: URL?
    /// The last few KB of what the agent printed, without colour codes.
    var transcript = ""
    var error: String?
    /// Claude Code finishes on a page that shows a code to paste back.
    var asksForCode: Bool { transcript.localizedCaseInsensitiveContains("paste code") }
    @ObservationIgnored weak var settings: StudioSettings?
    @ObservationIgnored private var process: Process?
    @ObservationIgnored private var input: Pipe?
    @ObservationIgnored private var output: Pipe?
    @ObservationIgnored private var task: Task<Void, Never>?

    private static let escapes = try? NSRegularExpression(pattern: "\u{1B}\\[[0-9;?]*[ -/]*[@-~]|\u{1B}\\][^\u{07}\u{1B}]*(\u{07}|\u{1B}\\\\)|\u{1B}[()][A-Za-z0-9]|\u{1B}[=>]")
    private static let link = try? NSRegularExpression(pattern: "https://[^\\s\"'<>\\)\\]]+")

    func start(_ agent: LocalAgent) {
        guard !isRunning, agent != .custom, let settings else { return }
        error = nil; url = nil; transcript = ""
        guard settings.isInstalled(agent) else { error = "\(agent.title) isn't installed yet."; return }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/script")
        process.arguments = ["-q", "/dev/null", settings.path(for: agent)] + agent.loginArguments
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = ([settings.nodeURL?.deletingLastPathComponent().path].compactMap { $0 } + LocalAgent.searchDirectories).joined(separator: ":")
        environment["TERM"] = "xterm-256color"
        process.environment = environment
        process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
        // stdin stays open for the whole run: closing it sends end-of-file, which ends the login.
        let input = Pipe(), output = Pipe()
        process.standardInput = input; process.standardOutput = output; process.standardError = output
        output.fileHandleForReading.readabilityHandler = Self.reader(self)
        do { try process.run() } catch {
            output.fileHandleForReading.readabilityHandler = nil
            self.error = "Sign-in couldn't start. \(error.localizedDescription)"; return
        }
        self.process = process; self.input = input; self.output = output
        self.agent = agent; isRunning = true
        task = Task { [weak self] in await self?.watch(process, agent) }
    }

    nonisolated private static func reader(_ owner: AgentSignIn) -> @Sendable (FileHandle) -> Void {
        { handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            Task { @MainActor [weak owner] in owner?.append(data) }
        }
    }

    private func append(_ data: Data) {
        var text = String(decoding: data, as: UTF8.self)
        if let escapes = Self.escapes { text = escapes.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: "") }
        text = text.replacingOccurrences(of: "\r", with: "")
        transcript = String((transcript + text).suffix(4096))
        guard let link = Self.link, let match = link.firstMatch(in: transcript, range: NSRange(transcript.startIndex..., in: transcript)),
              let range = Range(match.range, in: transcript) else { return }
        let found = String(transcript[range])
        if url == nil || found.hasPrefix(url?.absoluteString ?? "") { url = URL(string: found) ?? url }
    }

    /// Waits for the login to end, asking the account every few seconds in case the agent keeps waiting after the browser step.
    private func watch(_ process: Process, _ agent: LocalAgent) async {
        let deadline = Date().addingTimeInterval(600)
        var ticks = 0, signedIn = false, timedOut = false
        while process.isRunning {
            if Task.isCancelled { return }
            if Date() > deadline { timedOut = true; break }
            try? await Task.sleep(for: .milliseconds(500)); ticks += 1
            if ticks % 8 == 0, let settings {
                await settings.check(agent)
                if Task.isCancelled { return }
                if settings.isReady(agent) { signedIn = true; break }
            }
        }
        if Task.isCancelled { return }
        if process.isRunning { process.terminate() }
        teardown()
        isRunning = false
        if !signedIn { await settings?.check(agent) }
        if settings?.isReady(agent) != true { error = timedOut ? "Sign-in took too long. Try again." : "Sign-in didn't finish. Try again." }
        self.agent = nil; url = nil; task = nil
    }

    private func teardown() {
        output?.fileHandleForReading.readabilityHandler = nil
        try? input?.fileHandleForWriting.close()
        try? output?.fileHandleForReading.close()
        process = nil; input = nil; output = nil
    }

    /// Types a code into the sign-in, for when the agent asks to paste one from the browser.
    func send(_ code: String) {
        guard isRunning, !code.isEmpty else { return }
        try? input?.fileHandleForWriting.write(contentsOf: Data((code + "\r").utf8))
    }

    func cancel() {
        task?.cancel(); task = nil
        if process?.isRunning == true { process?.terminate() }
        teardown()
        isRunning = false; agent = nil; url = nil; transcript = ""; error = nil
    }
}

/// What to show while a sign-in runs (and after one fails): the browser step, a place to paste a code, and a way out.
struct AgentSignInPanel: View {
    @Bindable var settings: StudioSettings
    var compact = false
    @State private var code = ""
    private var login: AgentSignIn { settings.login }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if login.isRunning, let agent = login.agent {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(login.asksForCode ? "Sign in in your browser, then paste the code it shows." : "Finish signing in in your browser.").font(.system(size: compact ? 12 : 13, weight: .medium))
                    Spacer()
                    Button("Cancel") { settings.cancelSignIn() }.controlSize(.small)
                }
                HStack(spacing: 8) {
                    if let url = login.url { Button("Open sign-in page") { NSWorkspace.shared.open(url) }.controlSize(.small) }
                    TextField(login.asksForCode ? "Paste the code here" : "Paste code if asked", text: $code).textFieldStyle(.roundedBorder).controlSize(.small)
                        .onSubmit(send)
                    Button("Send", action: send).controlSize(.small).disabled(code.isEmpty)
                }
                Button("Use Terminal instead") { settings.cancelSignIn(); settings.setupInTerminal(agent) }
                    .buttonStyle(.link).font(.system(size: 11))
            } else if let error = login.error {
                Text(error).font(.system(size: 12)).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func send() { guard !code.isEmpty else { return }; login.send(code); code = "" }
}
