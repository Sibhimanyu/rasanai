import AppKit
import Observation
import StudioCore
import SwiftUI
import UserNotifications

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
    /// Warn when one film's director spend passes this many dollars. 0 means off.
    var budgetPerFilm = UserDefaults.standard.double(forKey: "budgetPerFilm") { didSet { defaults.set(budgetPerFilm, forKey: "budgetPerFilm") } }
    /// How fast the director works (research time and build plan), for films that do not choose their own.
    var pace: FilmPace { didSet { defaults.set(pace.rawValue, forKey: "pace") } }
    /// Lets the director make images through the Codex CLI on the user's ChatGPT plan. On unless turned off.
    var generateImagesWithCodex: Bool { didSet { defaults.set(generateImagesWithCodex, forKey: "generateImagesWithCodex") } }
    /// The Codex CLI for image generation, whichever director is selected: the configured path, else discovery.
    var imageGenerationCodexURL: URL? {
        let configured = codexPath.hasPrefix("/") ? codexPath : ""
        let path = FileManager.default.isExecutableFile(atPath: configured) ? configured : LocalAgent.codex.discoveredExecutable()
        return path.flatMap { FileManager.default.isExecutableFile(atPath: $0) ? URL(fileURLWithPath: $0) : nil }
    }
    var bundledNodeURL: URL? {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("Runtime/node/bin/node"), FileManager.default.isExecutableFile(atPath: url.path) else { return nil }
        return url
    }
    var nodeURL: URL? {
        let bundled = bundledNodeURL?.path
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let paths = nodePath.isEmpty ? ([bundled, home + "/.rasanai/node/bin/node"].compactMap { $0 } + LocalAgent.searchDirectories.map { $0 + "/node" }) : [nodePath]
        return paths.first { FileManager.default.isExecutableFile(atPath: $0) }.map { URL(fileURLWithPath: $0) }
    }
    func model(for agent: LocalAgent) -> String { agent == .claude ? claudeModel : codexModel }
    var statuses: [String: String] = [:]
    var checking: Set<String> = []
    var error: String?
    var showWelcome = false
    var hasCompletedWelcome: Bool { didSet { defaults.set(hasCompletedWelcome, forKey: "hasCompletedWelcome") } }
    var reopenLastProject: Bool { didSet { defaults.set(reopenLastProject, forKey: "reopenLastProject") } }
    var notificationsEnabled: Bool { didSet { defaults.set(notificationsEnabled, forKey: "notificationsEnabled") } }
    /// Per-agent consent, given once (Welcome or the first Start). Keyed by `LocalAgent.id`.
    var agentConsent: [String: Bool] { didSet { defaults.set(agentConsent, forKey: "agentConsent") } }
    var filmQueue: [QueuedFilm] { didSet { persist(filmQueue, key: "filmQueue") } }
    var filmTemplates: [FilmTemplate] { didSet { persist(filmTemplates, key: "filmTemplates") } }
    private func persist<T: Encodable>(_ value: T, key: String) {
        do { defaults.set(try JSONEncoder().encode(value), forKey: key) }
        catch { self.error = "Could not save \(key). \(error.localizedDescription)" }
    }
    private var editorDrafts: [String: Data] { didSet { defaults.set(editorDrafts, forKey: "editorDrafts") } }
    private func editorKey(_ project: URL?) -> String { project?.standardizedFileURL.path ?? "new:\(projectRoot)" }
    func editorDraft(for project: URL?) -> FilmEditorDraft? {
        guard let data = editorDrafts[editorKey(project)] else { return nil }
        return try? JSONDecoder().decode(FilmEditorDraft.self, from: data)
    }
    func saveEditorDraft(_ draft: FilmEditorDraft, for project: URL?) {
        if draft.isEmpty { clearEditorDraft(for: project); return }
        do { editorDrafts[editorKey(project)] = try JSONEncoder().encode(draft) }
        catch { self.error = "Your draft could not be saved. \(error.localizedDescription)" }
    }
    func clearEditorDraft(for project: URL?) { editorDrafts.removeValue(forKey: editorKey(project)) }
    func hasConsent(_ agent: LocalAgent) -> Bool { agentConsent[agent.id] == true }
    func giveConsent(_ agent: LocalAgent) { agentConsent[agent.id] = true }
    private let defaults: UserDefaults
    var library: ProjectLibrary { ProjectLibrary(root: URL(fileURLWithPath: projectRoot, isDirectory: true)) }
    var colorScheme: ColorScheme? { appearance == "system" ? nil : (appearance == "light" ? .light : .dark) }
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        filmQueue = defaults.data(forKey: "filmQueue").flatMap { try? JSONDecoder().decode([QueuedFilm].self, from: $0) } ?? []
        filmTemplates = defaults.data(forKey: "filmTemplates").flatMap { try? JSONDecoder().decode([FilmTemplate].self, from: $0) } ?? []
        editorDrafts = defaults.dictionary(forKey: "editorDrafts") as? [String: Data] ?? [:]
        agentConsent = defaults.dictionary(forKey: "agentConsent") as? [String: Bool] ?? [:]
        hasCompletedWelcome = defaults.bool(forKey: "hasCompletedWelcome")
        reopenLastProject = defaults.object(forKey: "reopenLastProject") as? Bool ?? true
        notificationsEnabled = defaults.bool(forKey: "notificationsEnabled")
        showWelcome = !defaults.bool(forKey: "hasCompletedWelcome")
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
        pace = defaults.string(forKey: "pace").flatMap(FilmPace.init(rawValue:))
            ?? defaults.string(forKey: "researchDepth").flatMap(FilmPace.init(legacyResearchDepth:)) ?? .defaultForNewFilms
        generateImagesWithCodex = defaults.object(forKey: "generateImagesWithCodex") as? Bool ?? true
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
        panel.title = "Choose library folder"
        panel.message = "New films and brands go here. Existing ones are not moved or deleted."
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
        if checking.contains(agent.id) {
            while checking.contains(agent.id) {
                do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
            }
            return
        }
        if !isInstalled(agent), let discovered = agent.discoveredExecutable() { setPath(discovered, for: agent) }
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
                return "Not signed in yet. Tap Sign in to connect it."
            } catch { return "Unable to start the selected executable." }
        }.value
        guard path(for: agent) == executable else { return }
        statuses[agent.id] = result
    }
    func copyLogin(_ agent: LocalAgent) {
        let command = ([LocalAgent.shellQuote(path(for: agent))] + agent.loginArguments).joined(separator: " ")
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(command, forType: .string)
    }
    func openTerminal() {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Terminal") else { return }
        NSWorkspace.shared.openApplication(at: url, configuration: .init())
    }
    func setupCommand(for agent: LocalAgent) -> String {
        if isInstalled(agent) {
            return ([LocalAgent.shellQuote(path(for: agent))] + agent.loginArguments).joined(separator: " ")
        }
        // npm bundled with Node defaults to the signed app's runtime folder. Always install into
        // the user's discoverable CLI directory instead, without changing the app or needing sudo.
        let prefix = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".npm-global").path
        let package = agent == .claude ? "@anthropic-ai/claude-code" : "@openai/codex"
        return "npm install --global --prefix \(LocalAgent.shellQuote(prefix)) \(package) && \(agent.rawValue) \(agent.loginArguments.joined(separator: " "))"
    }
    /// Setup runs visibly in Terminal, only when the user presses the setup button.
    func setupInTerminal(_ agent: LocalAgent) {
        guard agent != .custom,
              let terminal = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Terminal") else {
            error = "Terminal could not be opened. Copy the setup command and run it in your terminal."; return
        }
        let command = setupCommand(for: agent)
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("rasanai-setup-\(UUID().uuidString).command")
        let directories = ([nodeURL?.deletingLastPathComponent().path].compactMap { $0 } + LocalAgent.searchDirectories).joined(separator: ":")
        let script = """
        #!/bin/bash
        export PATH=\(LocalAgent.shellQuote(directories))
        \(command)
        setup_result=$?
        /bin/rm -- \(LocalAgent.shellQuote(file.path))
        echo
        echo 'Return to RasanAI and press Recheck when setup is complete.'
        read -r -p 'Press Return to close this window.'
        exit "$setup_result"
        """
        do {
            try script.write(to: file, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: file.path)
            NSWorkspace.shared.open([file], withApplicationAt: terminal, configuration: .init()) { [weak self] _, error in
                if let error { Task { @MainActor in self?.error = "Could not open setup in Terminal. \(error.localizedDescription)" } }
            }
        } catch { self.error = error.localizedDescription }
    }
    func finishWelcome() { hasCompletedWelcome = true; showWelcome = false }
    /// The agent used by default, falling back to Claude Code.
    var agent: LocalAgent { LocalAgent(rawValue: defaultAgent) ?? .claude }
    /// Whether an executable is configured and present for the agent.
    func isInstalled(_ agent: LocalAgent) -> Bool {
        let p = path(for: agent)
        return p.hasPrefix("/") && FileManager.default.isExecutableFile(atPath: p)
    }
    func isReady(_ agent: LocalAgent) -> Bool {
        agent != .custom && isInstalled(agent) && !checking.contains(agent.id) && statuses[agent.id] == "CLI reports signed in"
    }
    var appVersion: String {
        "\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Development") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "local"))"
    }
    func executable(named name: String) -> String? {
        LocalAgent.searchDirectories.map { $0 + "/" + name }.first { FileManager.default.isExecutableFile(atPath: $0) }
    }
    func setNotificationsEnabled(_ enabled: Bool) async {
        if !enabled { notificationsEnabled = false; return }
        guard Bundle.main.bundleIdentifier != nil else { error = "Notifications are available when running the bundled Mac app."; return }
        do {
            notificationsEnabled = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            if !notificationsEnabled { error = "Notifications are disabled in macOS. Enable RasanAI Studio in System Settings → Notifications." }
        } catch { self.error = error.localizedDescription }
    }
}

struct StudioSettingsView: View {
    @Bindable var settings: StudioSettings
    @ObservedObject private var updater = StudioUpdater.shared
    @State private var tab: String
    init(settings: StudioSettings, initialTab: String = "general") { self.settings = settings; _tab = State(initialValue: initialTab) }
    @State private var showAdvanced = false

    var body: some View {
        TabView(selection: $tab) {
            general.tabItem { Label("General", systemImage: "gearshape") }.tag("general")
            director.tabItem { Label("Director", systemImage: "wand.and.stars") }.tag("director")
        }
        .frame(width: 520, height: tab == "general" ? 470 : 500)
        .animation(.snappy, value: tab)
        .preferredColorScheme(settings.colorScheme)
        .tint(.rasan)
        .alert("Settings", isPresented: Binding(get: { settings.error != nil }, set: { if !$0 { settings.error = nil } })) {
            Button("OK") { settings.error = nil }
        } message: { Text(settings.error ?? "") }
    }

    private var general: some View {
        Form {
            Section {
                LabeledContent("Library") {
                    HStack(spacing: 8) {
                        Text(abbreviated(settings.projectRoot)).lineLimit(1).truncationMode(.middle)
                            .foregroundStyle(.secondary).textSelection(.enabled)
                        Button("Change…") { settings.chooseLibrary() }
                    }
                }
                Picker("Appearance", selection: $settings.appearance) {
                    Text("System").tag("system"); Text("Light").tag("light"); Text("Dark").tag("dark")
                }
                Toggle("Notify me when RasanAI needs me", isOn: Binding(
                    get: { settings.notificationsEnabled },
                    set: { enabled in Task { await settings.setNotificationsEnabled(enabled) } }))
            } footer: {
                Text("Films and brands live in the library as ordinary folders.")
            }
            Section("Updates") {
                Toggle("Check automatically", isOn: Binding(get: { updater.automaticChecks }, set: { updater.setAutomaticChecks($0) }))
                    .disabled(!updater.isConfigured)
                LabeledContent("Last checked") {
                    HStack(spacing: 8) {
                        Text(updater.isConfigured ? updater.lastCheckedText : "Not available in this build").foregroundStyle(.secondary)
                        Button("Check now") { updater.check() }.disabled(!updater.canCheck)
                    }
                }
            }
            Section {
                LabeledContent("Version", value: settings.appVersion)
            }
        }.formStyle(.grouped)
    }

    private var director: some View {
        let agent = settings.agent
        return Form {
            Section {
                Picker("Director", selection: $settings.defaultAgent) {
                    Text("Claude Code").tag(LocalAgent.claude.id)
                    Text("Codex").tag(LocalAgent.codex.id)
                }.pickerStyle(.segmented)
                if agent != .custom {
                    LabeledContent("Found at") {
                        HStack(spacing: 8) {
                            Text(settings.path(for: agent).isEmpty ? "Not found" : abbreviated(settings.path(for: agent)))
                                .lineLimit(1).truncationMode(.middle).foregroundStyle(.secondary)
                            Button("Choose…") { settings.chooseExecutable(for: agent) }
                        }
                    }
                    TextField("Model", text: agent == .claude ? $settings.claudeModel : $settings.codexModel, prompt: Text("Default"))
                }
                statusLine(agent)
            } footer: {
                Text("RasanAI directs with your \(agent.title) account. Usage counts toward your plan.")
            }
            Section {
                Picker("Pace", selection: $settings.pace) {
                    ForEach(FilmPace.allCases) { Text($0.title).tag($0) }
                }.pickerStyle(.segmented)
            } footer: {
                Text("How fast the director works. \(settings.pace.summary) Each film can override this under More in New film.")
            }
            Section {
                Toggle("Generate images with Codex", isOn: $settings.generateImagesWithCodex)
            } footer: {
                Text("Presenter films can use generated images. Each image is a Codex run on your ChatGPT plan, about a minute and a half.")
            }
            Section {
                BudgetSetting(settings: settings)
            } footer: {
                Text("RasanAI shows the director's tokens and cost for each film. Dollar figures marked est. are calculated from list prices.")
            }
            Section {
                DisclosureGroup("Advanced", isExpanded: $showAdvanced) {
                    Toggle("Allow unrestricted tools", isOn: $settings.allowUnrestrictedTools)
                    if settings.allowUnrestrictedTools {
                        Text("The director can read and change files outside the film's folder. Only use this on films you trust.")
                            .font(.caption).foregroundStyle(.red)
                    }
                    TextField("Node path", text: $settings.nodePath, prompt: Text(settings.nodeURL?.path ?? "Automatic"))
                    TextField("Custom executable", text: Binding(get: { settings.customPath }, set: { settings.setPath($0, for: .custom) }), prompt: Text("Optional"))
                }
            }
        }
        .formStyle(.grouped)
        .task(id: settings.defaultAgent) { if settings.isInstalled(agent) { await settings.check(agent) } }
    }

    @ViewBuilder private func statusLine(_ agent: LocalAgent) -> some View {
        let installed = settings.isInstalled(agent)
        let status = settings.statuses[agent.id]
        let signedIn = status?.contains("signed in") == true && status?.hasPrefix("CLI") == true
        HStack(spacing: 8) {
            if settings.checking.contains(agent.id) {
                ProgressView().controlSize(.small)
                Text("Checking…").foregroundStyle(.secondary)
            } else {
                Image(systemName: installed ? (signedIn ? "checkmark.circle.fill" : "exclamationmark.circle.fill") : "xmark.circle.fill")
                    .foregroundStyle(installed ? (signedIn ? Color.green : Color.orange) : Color.red)
                Text(!installed ? "\(agent.title) isn't installed" : (signedIn ? "Found and signed in" : "Found, but not signed in"))
            }
            Spacer()
            if installed && !signedIn && !settings.checking.contains(agent.id) {
                Button("Sign in…") { settings.setupInTerminal(agent) }
            }
            Button { Task { await settings.check(agent) } } label: { Image(systemName: "arrow.clockwise") }
                .buttonStyle(.borderless).help("Check again").disabled(settings.checking.contains(agent.id))
        }
        if !installed { Button("Install in Terminal…") { settings.setupInTerminal(agent) } }
        if installed && !signedIn, let status { Text(status).font(.caption).foregroundStyle(.secondary) }
    }

    private func abbreviated(_ path: String) -> String { (path as NSString).abbreviatingWithTildeInPath }
}
