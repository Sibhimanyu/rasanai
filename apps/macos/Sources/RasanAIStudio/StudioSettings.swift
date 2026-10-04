import AppKit
import Observation
import StudioCore
import SwiftUI

@MainActor @Observable
final class StudioSettings {
    var projectRoot: String { didSet { defaults.set(projectRoot, forKey: "projectRoot") } }
    var appearance: String { didSet { defaults.set(appearance, forKey: "appearance") } }
    var defaultAgent: String { didSet { defaults.set(defaultAgent, forKey: "defaultAgent") } }
    var claudePath: String { didSet { defaults.set(claudePath, forKey: "claudePath") } }
    var codexPath: String { didSet { defaults.set(codexPath, forKey: "codexPath") } }
    var customPath: String { didSet { defaults.set(customPath, forKey: "customPath") } }
    var claudeModel = UserDefaults.standard.string(forKey: "claudeModel") ?? "" { didSet { defaults.set(claudeModel, forKey: "claudeModel") } }
    var codexModel = UserDefaults.standard.string(forKey: "codexModel") ?? "" { didSet { defaults.set(codexModel, forKey: "codexModel") } }
    var nodePath = UserDefaults.standard.string(forKey: "nodePath") ?? "" { didSet { defaults.set(nodePath, forKey: "nodePath") } }
    var allowUnrestrictedTools = UserDefaults.standard.bool(forKey: "allowUnrestrictedTools") { didSet { defaults.set(allowUnrestrictedTools, forKey: "allowUnrestrictedTools") } }
    var nodeURL: URL? {
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("Runtime/node/bin/node").path
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let paths = nodePath.isEmpty ? ([bundled, home + "/.rasanai/node/bin/node"].compactMap { $0 } + LocalAgent.searchDirectories.map { $0 + "/node" }) : [nodePath]
        return paths.first { FileManager.default.isExecutableFile(atPath: $0) }.map { URL(fileURLWithPath: $0) }
    }
    func model(for agent: LocalAgent) -> String { agent == .claude ? claudeModel : codexModel }
    var statuses: [String: String] = [:]
    var checking: Set<String> = []
    var error: String?
    private let defaults: UserDefaults
    var library: ProjectLibrary { ProjectLibrary(root: URL(fileURLWithPath: projectRoot, isDirectory: true)) }
    var colorScheme: ColorScheme? { appearance == "system" ? nil : (appearance == "light" ? .light : .dark) }
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        projectRoot = defaults.string(forKey: "projectRoot") ?? ProjectLibrary.defaultRoot.path
        appearance = defaults.string(forKey: "appearance") ?? "system"
        defaultAgent = defaults.string(forKey: "defaultAgent") ?? "claude"
        claudePath = defaults.string(forKey: "claudePath") ?? LocalAgent.claude.discoveredExecutable() ?? ""
        codexPath = defaults.string(forKey: "codexPath") ?? LocalAgent.codex.discoveredExecutable() ?? ""
        customPath = defaults.string(forKey: "customPath") ?? ""
        claudeModel = defaults.string(forKey: "claudeModel") ?? ""
        codexModel = defaults.string(forKey: "codexModel") ?? ""
        nodePath = defaults.string(forKey: "nodePath") ?? ""
        allowUnrestrictedTools = defaults.bool(forKey: "allowUnrestrictedTools")
        do { try library.prepare() } catch { self.error = error.localizedDescription }
    }
    func path(for agent: LocalAgent) -> String {
        switch agent { case .claude: claudePath; case .codex: codexPath; case .custom: customPath }
    }
    func setPath(_ path: String, for agent: LocalAgent) {
        switch agent { case .claude: claudePath = path; case .codex: codexPath = path; case .custom: customPath = path }
        statuses.removeValue(forKey: agent.id)
    }
    func chooseLibrary() {
        let panel = NSOpenPanel()
        panel.title = "Choose project library"
        panel.message = "New projects go here. Existing projects are not moved or deleted."
        panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do { try ProjectLibrary(root: url).prepare(); projectRoot = url.path }
        catch { self.error = error.localizedDescription }
    }
    func chooseExecutable(for agent: LocalAgent) {
        let panel = NSOpenPanel(); panel.title = "Choose \(agent.title) executable"
        panel.showsHiddenFiles = true; panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url { setPath(url.path, for: agent) }
    }
    func check(_ agent: LocalAgent) async {
        let executable = path(for: agent)
        guard executable.hasPrefix("/"), FileManager.default.isExecutableFile(atPath: executable) else {
            statuses[agent.id] = "Executable not found. Choose an installed CLI."; return
        }
        checking.insert(agent.id)
        defer { checking.remove(agent.id) }
        let result = await Task.detached {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = agent.statusArguments
            var environment = ProcessInfo.processInfo.environment
            environment["PATH"] = LocalAgent.searchDirectories.joined(separator: ":")
            process.environment = environment
            // Never collect or display account identifiers, tokens, or CLI credential files.
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            process.standardInput = FileHandle.nullDevice
            do {
                try process.run()
                let deadline = Date().addingTimeInterval(15)
                while process.isRunning && Date() < deadline { try await Task.sleep(for: .milliseconds(50)) }
                if process.isRunning { process.terminate(); return "Check timed out. Try the CLI in Terminal." }
                if process.terminationStatus == 0 {
                    return agent == .custom ? "CLI available · authentication not checked" : "CLI reports signed in"
                }
                return "Not signed in, or CLI status check failed. Sign in using the CLI."
            } catch { return "Unable to start the selected executable." }
        }.value
        guard path(for: agent) == executable else { return }
        statuses[agent.id] = result
    }
    func copyLogin(_ agent: LocalAgent) {
        let command = ([LocalAgent.shellQuote(path(for: agent))] + agent.loginArguments).joined(separator: " ")
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(command, forType: .string)
    }
}

struct StudioSettingsView: View {
    @Bindable var settings: StudioSettings
    var body: some View {
        TabView {
            Form {
                Section("Project storage") {
                    LabeledContent("Library") { Text(settings.projectRoot).textSelection(.enabled).lineLimit(3) }
                    HStack {
                        Button("Choose Folder…") { settings.chooseLibrary() }
                        Button("Show in Finder") { NSWorkspace.shared.open(settings.library.root) }
                    }
                    Text("Each project has its own assets, audio, compositions, exports, and .rasanai run folders. Changing the library never moves existing projects.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Appearance") {
                    Picker("Appearance", selection: $settings.appearance) {
                        Text("System").tag("system"); Text("Light").tag("light"); Text("Dark").tag("dark")
                    }
                }
            }.formStyle(.grouped).tabItem { Label("General", systemImage: "gearshape") }
            Form {
                Section {
                    Picker("Preferred agent", selection: $settings.defaultAgent) {
                        ForEach(LocalAgent.allCases) { Text($0.title).tag($0.id) }
                    }
                    Text("The app launches your installed agent as its director. The CLI owns sign-in and credentials. Changes apply to the next launch, not an already running director.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(LocalAgent.allCases) { agent in
                    Section(agent.title) {
                        TextField("Executable", text: Binding(get: { settings.path(for: agent) }, set: { settings.setPath($0, for: agent) }))
                        if agent != .custom {
                            TextField("Model (empty = CLI default)", text: agent == .claude ? $settings.claudeModel : $settings.codexModel)
                        }
                        HStack {
                            Button("Browse…") { settings.chooseExecutable(for: agent) }
                            if agent != .custom {
                                Button("Detect") { settings.setPath(agent.discoveredExecutable() ?? "", for: agent) }
                                Button("Copy Sign-in Command") { settings.copyLogin(agent) }.disabled(settings.path(for: agent).isEmpty)
                            }
                            Button("Check Status") { Task { await settings.check(agent) } }.disabled(settings.checking.contains(agent.id))
                            if settings.checking.contains(agent.id) { ProgressView().controlSize(.small) }
                        }
                        Text(settings.statuses[agent.id] ?? "Not checked").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Text("Paste the sign-in command in Terminal to complete the provider's browser login, then check status. No API keys are stored in app preferences.")
                    .font(.caption).foregroundStyle(.secondary)
                Section("Execution permissions") {
                    Toggle("Allow unrestricted agent tools", isOn: $settings.allowUnrestrictedTools)
                    Text("Off by default. Codex uses workspace-write; Claude uses acceptEdits. Some browser/render commands may be blocked. Enabling this removes the CLI sandbox/approval protections and can let the agent read or change files outside the project. Only enable it for trusted projects. Agent use may incur provider charges.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.formStyle(.grouped).tabItem { Label("Agents", systemImage: "person.badge.key") }
            Form {
                Section("Engine") {
                    LabeledContent("RasanAI engine", value: DirectorRuntime.engineURL?.path ?? "Not found")
                    LabeledContent("Active Node", value: settings.nodeURL?.path ?? "Not found")
                    TextField("Node executable override (optional)", text: $settings.nodePath)
                    Text("Node ≥20, FFmpeg, HyperFrames workflows and its browser must be available to the director. The release bundles Node and the RasanAI engine, not provider agents or every external rendering dependency.")
                        .font(.caption).foregroundStyle(.secondary)
                    Button("Copy HyperFrames setup command") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString("npx hyperframes skills update && npx hyperframes browser ensure", forType: .string)
                    }
                    Link("FFmpeg installation", destination: URL(string: "https://ffmpeg.org/download.html")!)
                }
                UpdateSettingsView()
            }.formStyle(.grouped).tabItem { Label("Runtime", systemImage: "cpu") }
            Form {
                Section("Community beta") {
                    LabeledContent("Version", value: "\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Development") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "local"))")
                    Text("Community distribution uses an ad-hoc Apple signature and Sparkle EdDSA update signatures. It is not Apple-notarized; first installation is subject to Gatekeeper. Local builds without an update public key cannot check for updates.")
                        .foregroundStyle(.secondary)
                    Link("Release readiness and source", destination: URL(string: "https://github.com/Sibhimanyu/rasanai/tree/master/apps/macos")!)
                }
            }.formStyle(.grouped).tabItem { Label("About", systemImage: "info.circle") }
        }
        .frame(width: 660, height: 620)
        .preferredColorScheme(settings.colorScheme)
        .alert("Settings", isPresented: Binding(get: { settings.error != nil }, set: { if !$0 { settings.error = nil } })) {
            Button("OK") { settings.error = nil }
        } message: { Text(settings.error ?? "") }
    }
}
