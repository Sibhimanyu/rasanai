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
    /// Pause the director when one film's spend passes this many dollars. 0 means off.
    var budgetPerFilm = UserDefaults.standard.double(forKey: "budgetPerFilm") { didSet { defaults.set(budgetPerFilm, forKey: "budgetPerFilm") } }
    /// How fast the director works (research time and build plan), for films that do not choose their own.
    var pace: FilmPace { didSet { defaults.set(pace.rawValue, forKey: "pace") } }
    /// Keeps the Mac from idle sleep while the director is working. On unless turned off.
    var keepAwakeWhileMaking: Bool { didSet { defaults.set(keepAwakeWhileMaking, forKey: "keepAwakeWhileMaking") } }
    /// Pauses the director when it has looked stuck for a while, so a loop cannot keep spending tokens. On unless turned off.
    var pauseWhenStuck: Bool { didSet { defaults.set(pauseWhenStuck, forKey: "pauseWhenStuck") } }
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
    /// The in-app sign-in, shared by Welcome and Settings.
    let login = AgentSignIn()
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
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys   // stable bytes, so an unchanged draft compares equal
            let data = try encoder.encode(draft)
            let key = editorKey(project)
            if editorDrafts[key] != data { editorDrafts[key] = data }
        }
        catch { self.error = "Your draft could not be saved. \(error.localizedDescription)" }
    }
    func clearEditorDraft(for project: URL?) {
        let key = editorKey(project)
        if editorDrafts[key] != nil { editorDrafts.removeValue(forKey: key) }
    }
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
        // On unless turned off: a film that waits on you is useless if nobody hears about it.
        notificationsEnabled = defaults.object(forKey: "notificationsEnabled") as? Bool ?? true
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
        keepAwakeWhileMaking = defaults.object(forKey: "keepAwakeWhileMaking") as? Bool ?? true
        pauseWhenStuck = defaults.object(forKey: "pauseWhenStuck") as? Bool ?? true
        do { try library.prepare() } catch { self.error = error.localizedDescription }
        login.settings = self
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
        // An agent Studio installed is a Node script, so the bundled Node has to be on its PATH for the check to run at all.
        let nodeDirectory = nodeURL?.deletingLastPathComponent().path
        var used = executable
        var result = await Self.runStatus(executable, agent, nodeDirectory: nodeDirectory)
        // An old copy can shadow a newer one elsewhere: when this one fails, try what discovery finds.
        if result == .signedOut, let found = agent.discoveredExecutable(), found != executable,
           await Self.runStatus(found, agent, nodeDirectory: nodeDirectory) == .ready {
            setPath(found, for: agent); used = found; result = .ready
        }
        guard path(for: agent) == used else { return }
        statuses[agent.id] = result.message(for: agent)
    }

    private enum StatusResult: Sendable {
        case ready, signedOut, timedOut, failedToStart
        func message(for agent: LocalAgent) -> String {
            switch self {
            case .ready: agent == .custom ? "CLI available · authentication not checked" : "CLI reports signed in"
            case .signedOut: "Not signed in yet. Tap Sign in to connect it."
            case .timedOut: "The check timed out. Try again."
            case .failedToStart: "Unable to start the selected executable."
            }
        }
    }

    /// Asks an agent whether it is signed in. Waits up to 30 s: a freshly updated binary can start slowly under endpoint security.
    nonisolated private static func runStatus(_ executable: String, _ agent: LocalAgent, nodeDirectory: String?) async -> StatusResult {
        await Task.detached {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = agent.statusArguments
            var environment = ProcessInfo.processInfo.environment
            environment["PATH"] = ([nodeDirectory].compactMap { $0 } + LocalAgent.searchDirectories).joined(separator: ":")
            process.environment = environment
            // Never collect or display account identifiers, tokens, or CLI credential files.
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            process.standardInput = FileHandle.nullDevice
            do {
                try process.run()
                let deadline = Date().addingTimeInterval(30)
                while process.isRunning && Date() < deadline { try await Task.sleep(for: .milliseconds(50)) }
                if process.isRunning { process.terminate(); return .timedOut }
                return process.terminationStatus == 0 ? .ready : .signedOut
            } catch { return .failedToStart }
        }.value
    }

    /// Signs an agent in from inside Studio (no Terminal window): see `AgentSignIn`.
    func signIn(_ agent: LocalAgent) { login.start(agent) }
    func cancelSignIn() { login.cancel() }
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
    /// The agent Studio is installing right now, if any, and why the last install of each one failed.
    var installing: LocalAgent?
    var installErrors: [String: String] = [:]

    /// Installs an agent's CLI from inside Studio with the bundled Node's npm, into ~/.npm-global (no sudo, nothing in
    /// the app bundle), then checks it. Signing in still needs a browser and a code, so that one step opens in Terminal.
    /// Without a usable npm it falls back to the whole setup in Terminal.
    func install(_ agent: LocalAgent) async {
        guard agent != .custom, installing == nil else { return }
        let fm = FileManager.default
        guard let node = nodeURL else { setupInTerminal(agent); return }
        let npm = node.deletingLastPathComponent().appendingPathComponent("npm").resolvingSymlinksInPath()
        guard fm.fileExists(atPath: npm.path) else { setupInTerminal(agent); return }
        installing = agent
        installErrors[agent.id] = nil
        defer { installing = nil }
        let prefix = fm.homeDirectoryForCurrentUser.appendingPathComponent(".npm-global")
        let logs = LocalAgent.managedToolsDirectory.appendingPathComponent("logs")
        try? fm.createDirectory(at: logs, withIntermediateDirectories: true)
        let log = logs.appendingPathComponent("install-\(agent.rawValue).log")
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = ([node.deletingLastPathComponent().path] + LocalAgent.searchDirectories).joined(separator: ":")
        environment["npm_config_update_notifier"] = "false"
        let package = agent == .claude ? "@anthropic-ai/claude-code" : "@openai/codex"
        let code = await Self.runLogged(node, [npm.path, "install", "--global", "--prefix", prefix.path, package, "--no-audit", "--no-fund", "--progress=false"],
                                        environment: environment, log: log)
        await check(agent)
        guard code == 0, isInstalled(agent) else {
            let tail = (try? String(contentsOf: log, encoding: .utf8))?.split(whereSeparator: \.isNewline).last { $0.contains("ERR") || $0.contains("error") }
            let offline = tail?.contains("ENOTFOUND") == true || tail?.contains("ETIMEDOUT") == true || tail?.contains("EAI_AGAIN") == true
            installErrors[agent.id] = offline ? "Couldn't reach the internet to download \(agent.title). Check your connection and try again."
                : "Couldn't install \(agent.title)\(tail.map { ": " + $0.trimmingCharacters(in: .whitespaces) } ?? "."). Try again, or install in Terminal."
            return
        }
        if !isReady(agent) { signIn(agent) }
    }

    /// Runs a command to the end with its output in a log file. -1 when it could not start.
    nonisolated private static func runLogged(_ executable: URL, _ arguments: [String], environment: [String: String], log: URL) async -> Int32 {
        await Task.detached {
            FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600])
            guard let output = try? FileHandle(forWritingTo: log) else { return -1 }
            defer { try? output.close() }
            let process = Process()
            process.executableURL = executable; process.arguments = arguments; process.environment = environment
            process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
            process.standardInput = FileHandle.nullDevice; process.standardOutput = output; process.standardError = output
            guard (try? process.run()) != nil else { return -1 }
            process.waitUntilExit()
            return process.terminationStatus
        }.value
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
        echo 'Return to RasanAI when setup is complete. It checks again on its own.'
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
    /// What macOS currently allows, refreshed on launch, on return to the app and after asking.
    var notificationsAllowed: UNAuthorizationStatus = .notDetermined
    func refreshNotificationPermission() async {
        guard Bundle.main.bundleIdentifier != nil else { return }
        notificationsAllowed = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }
    /// Asks macOS once, when notifications are on and nobody has answered yet. Called after Welcome and on launch.
    func requestNotificationPermissionIfNeeded() async {
        await refreshNotificationPermission()
        guard notificationsEnabled, notificationsAllowed == .notDetermined, Bundle.main.bundleIdentifier != nil else { return }
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        await refreshNotificationPermission()
    }
    func openNotificationSettings() {
        let id = Bundle.main.bundleIdentifier ?? ""
        let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=\(id)")
            ?? URL(fileURLWithPath: "/System/Applications/System Settings.app")
        NSWorkspace.shared.open(url)
    }
    func setNotificationsEnabled(_ enabled: Bool) async {
        if !enabled { notificationsEnabled = false; return }
        guard Bundle.main.bundleIdentifier != nil else { error = "Notifications are available when running the bundled Mac app."; return }
        notificationsEnabled = true
        await requestNotificationPermissionIfNeeded()
        // Already refused in macOS: only System Settings can turn it back on.
        if notificationsAllowed == .denied { openNotificationSettings() }
    }
}

struct StudioSettingsView: View {
    @Bindable var settings: StudioSettings
    @ObservedObject private var updater = StudioUpdater.shared
    @State private var tab = "general"
    @State private var showAdvanced = false

    var body: some View {
        pageBody
            .preferredColorScheme(settings.colorScheme)
            .tint(Color(nsColor: .controlAccentColor))
        .alert("Settings", isPresented: Binding(get: { settings.error != nil }, set: { if !$0 { settings.error = nil } })) {
            Button("OK") { settings.error = nil }
        } message: { Text(settings.error ?? "") }
    }

    /// The page: one header (title, then the General / Director switch) on the same leading edge as the grouped forms, in a
    /// centred column. The form owns the scrolling and its own background is hidden so the canvas runs through.
    private var pageBody: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Settings")
                    .font(.system(size: 28, weight: .semibold)).tracking(-0.4)
                    .accessibilityAddTraits(.isHeader)
                Picker("Settings", selection: $tab) {
                    Text("General").tag("general")
                    Text("Director").tag("director")
                }
                .pickerStyle(.segmented).labelsHidden().fixedSize()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20).padding(.top, 32).padding(.bottom, 4)
            .frame(maxWidth: 700)
            .frame(maxWidth: .infinity)
            Group {
                if tab == "general" { general } else { director }
            }
            .scrollContentBackground(.hidden)
            .buttonStyle(.bordered).controlSize(.small)   // native buttons inside the forms, not the page's brand style
            .frame(maxWidth: 700)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.appBackground)
        .pageHeader("Settings")
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
                    get: { settings.notificationsEnabled && settings.notificationsAllowed != .denied },
                    set: { enabled in Task { await settings.setNotificationsEnabled(enabled) } }))
                if settings.notificationsEnabled && settings.notificationsAllowed == .denied {
                    HStack {
                        Text("Notifications are off for RasanAI in macOS.").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button("Open Notification Settings…") { settings.openNotificationSettings() }.controlSize(.small)
                    }
                }
            } header: { Text("Studio") } footer: {
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
            Section("About") {
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
                }.pickerStyle(.menu)
                if agent != .custom {
                    LabeledContent("Found at") {
                        HStack(spacing: 8) {
                            Text(settings.path(for: agent).isEmpty ? "Not found" : abbreviated(settings.path(for: agent)))
                                .lineLimit(1).truncationMode(.middle).foregroundStyle(.secondary)
                            Button("Choose…") { settings.chooseExecutable(for: agent) }
                        }
                    }
                    if agent == .claude {
                        // New films use the plan chosen on New film; a typed model here would silently lose to it.
                        LabeledContent("Models") { Text("Chosen for each film in New film").foregroundStyle(.secondary) }
                    } else {
                        TextField("Model", text: $settings.codexModel, prompt: Text("Default"))
                    }
                }
                statusLine(agent)
            } header: { Text("Director account") } footer: {
                Text("RasanAI directs with your \(agent.title) account. Usage counts toward your plan.")
            }
            Section {
                Picker("Pace", selection: $settings.pace) {
                    ForEach(FilmPace.allCases) { Text($0.title).tag($0) }
                }.pickerStyle(.menu)
            } header: { Text("Film defaults") } footer: {
                Text("How fast the director works. \(settings.pace.summary) You can change it for one film on the Pace button in New film.")
            }
            Section {
                Toggle("Generate images with Codex", isOn: $settings.generateImagesWithCodex)
            } footer: {
                Text("Presenter films can use generated images. Each image is a Codex run on your ChatGPT plan, about a minute and a half.")
            }
            Section {
                Toggle("Keep the Mac awake while a film is being made", isOn: $settings.keepAwakeWhileMaking)
            } footer: {
                Text("The screen can still sleep. Closing the lid on battery still sleeps the Mac; RasanAI picks the film back up when it wakes.")
            }
            Section {
                Toggle("Pause the director when it looks stuck", isOn: $settings.pauseWhenStuck)
            } footer: {
                Text("If it repeats the same step or burns tokens without showing you anything new for two minutes, RasanAI pauses it. Nothing is lost; Resume carries on where it was.")
            }
            Section {
                BudgetSetting(settings: settings)
            } header: { Text("Budget") } footer: {
                Text("RasanAI shows the director's tokens and cost for each film, and pauses it when a film passes your limit. Dollar figures marked est. are calculated from list prices.")
            }
            Section("Advanced") {
                DisclosureGroup("Developer options", isExpanded: $showAdvanced) {
                    Toggle("Allow unrestricted tools", isOn: $settings.allowUnrestrictedTools)
                    if settings.allowUnrestrictedTools {
                        Text("The director can read and change files outside the film's folder. Only use this on films you trust.")
                            .font(.caption).foregroundStyle(.red)
                    }
                    TextField("Claude model for “Same as Settings”", text: $settings.claudeModel, prompt: Text("Default"))
                    TextField("Node path", text: $settings.nodePath, prompt: Text(settings.nodeURL?.path ?? "Automatic"))
                    TextField("Custom executable", text: Binding(get: { settings.customPath }, set: { settings.setPath($0, for: .custom) }), prompt: Text("Optional"))
                }
            }
        }
        .formStyle(.grouped)
        .task(id: settings.defaultAgent) { await settings.check(agent) }
        // Back from the browser or Terminal after signing in: look again without a button press.
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            guard !settings.checking.contains(agent.id), !settings.login.isRunning else { return }
            Task { await settings.check(agent) }
        }
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
            if installed && !signedIn && !settings.checking.contains(agent.id) && !settings.login.isRunning {
                Button("Sign in…") { settings.signIn(agent) }
            }
            if settings.installing == agent { ProgressView().controlSize(.small); Text("Installing…").foregroundStyle(.secondary) }
            Button { Task { await settings.check(agent) } } label: { Image(systemName: "arrow.clockwise") }
                .buttonStyle(.borderless).help("Check again").disabled(settings.checking.contains(agent.id))
        }
        if !installed {
            HStack {
                Button("Install \(agent.title)") { Task { await settings.install(agent) } }.disabled(settings.installing != nil)
                Button("Install in Terminal…") { settings.setupInTerminal(agent) }.buttonStyle(.link)
            }
            if let error = settings.installErrors[agent.id] { Text(error).font(.caption).foregroundStyle(.orange) }
        }
        if settings.login.isRunning && settings.login.agent == agent || settings.login.error != nil {
            AgentSignInPanel(settings: settings, compact: true)
        }
        if installed && !signedIn, let status { Text(status).font(.caption).foregroundStyle(.secondary) }
    }

    private func abbreviated(_ path: String) -> String { (path as NSString).abbreviatingWithTildeInPath }
}
