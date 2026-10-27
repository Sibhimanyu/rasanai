import AppKit
import Heresay
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

private enum SettingsSection: String, CaseIterable, Identifiable {
    case general, notifications, updates, rasan, library, about
    var id: String { rawValue }
    var title: String {
        switch self {
        case .general: "General"; case .notifications: "Notifications"; case .updates: "Updates"
        case .rasan: "Rasan"; case .library: "Library & files"; case .about: "About"
        }
    }
    var symbol: String {
        switch self {
        case .general: "slider.horizontal.3"; case .notifications: "bell.badge"; case .updates: "arrow.triangle.2.circlepath"
        case .rasan: "sparkles"; case .library: "folder"; case .about: "info.circle"
        }
    }
    var tint: Color {
        switch self {
        case .general: .rasan; case .notifications: .turmeric; case .updates: .green
        case .rasan: .pink; case .library: .blue; case .about: .gray
        }
    }
}

struct StudioSettingsView: View {
    @Bindable var settings: StudioSettings
    @ObservedObject private var updater = StudioUpdater.shared
    @State private var section: SettingsSection = .general
    @State private var showAdvanced = false
    @State private var tipsReset = false
    @State private var pageWidth: CGFloat = 1000

    private var wide: Bool { pageWidth >= 820 }
    private var gridColumns: [GridItem] { [GridItem(.adaptive(minimum: 380, maximum: 640), spacing: 16, alignment: .top)] }

    var body: some View {
        pageBody
            .preferredColorScheme(settings.colorScheme)
            .tint(Color(nsColor: .controlAccentColor))
        .alert("Settings", isPresented: Binding(get: { settings.error != nil }, set: { if !$0 { settings.error = nil } })) {
            Button("OK") { settings.error = nil }
        } message: { Text(settings.error ?? "") }
    }

    /// The page: a big title, a navigation on the left and the section's cards on the right, centred at a sensible width.
    /// On a narrow window the navigation becomes a row of chips above the cards.
    private var pageBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Settings")
                    .font(.system(size: 34, weight: .bold)).tracking(-0.6)
                    .accessibilityAddTraits(.isHeader)
                Text("Make RasanAI yours.").font(.system(size: 15)).foregroundStyle(.secondary)
            }
            .padding(.bottom, 24)
            if wide {
                HStack(alignment: .top, spacing: 32) {
                    VStack(spacing: 2) { ForEach(SettingsSection.allCases) { navRow($0) } }
                        .frame(width: 210)
                    sectionScroll
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) { ForEach(SettingsSection.allCases) { navChip($0) } }
                }
                .padding(.bottom, 16)
                sectionScroll
            }
        }
        .padding(.horizontal, wide ? 40 : 20).padding(.top, 32).padding(.bottom, 8)
        .frame(maxWidth: 1200, maxHeight: .infinity, alignment: .topLeading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.appBackground)
        .background(GeometryReader { proxy in Color.clear.onChange(of: proxy.size.width, initial: true) { _, width in pageWidth = width } })
        .buttonStyle(.bordered).controlSize(.small)   // native buttons inside the cards, not the page's brand style
        .pageHeader("Settings")
    }

    private var sectionScroll: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                sectionContent
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .padding(.bottom, 32)
            .id(section)
            .transition(.opacity)
        }
        .scrollIndicators(.never)
        .animation(.easeOut(duration: 0.18), value: section)
    }

    private func navRow(_ item: SettingsSection) -> some View {
        SettingsNavRow(item: item, selected: section == item) { section = item }
    }

    private func navChip(_ item: SettingsSection) -> some View {
        Button { section = item } label: {
            Label(item.title, systemImage: item.symbol).font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Capsule().fill(section == item ? item.tint.opacity(0.22) : Color.primary.opacity(0.06)))
                .foregroundStyle(section == item ? Color.primary : Color.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title).accessibilityAddTraits(section == item ? .isSelected : [])
    }

    @ViewBuilder private var sectionContent: some View {
        switch section {
        case .general: generalCards
        case .notifications: notificationCards
        case .updates: updateCards
        case .rasan: rasanCards
        case .library: libraryCards
        case .about: aboutCards
        }
    }

    // MARK: Sections

    private var generalCards: some View {
        LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 16) {
            SettingsCard(symbol: "circle.lefthalf.filled", tint: .rasan, title: "Appearance", detail: "Choose how RasanAI looks.") {
                Picker("Appearance", selection: $settings.appearance) {
                    Text("System").tag("system"); Text("Light").tag("light"); Text("Dark").tag("dark")
                }.pickerStyle(.segmented).labelsHidden()
            }
            SettingsCard(symbol: "lightbulb", tint: .turmeric, title: "Tips", detail: "Bring back the little hints that show you around.") {
                HStack {
                    Button("Show tips again") {
                        UserDefaults.standard.removeObject(forKey: "askRasanHintSeen"); tipsReset = true
                    }
                    if tipsReset { Label("Done. You will see them again.", systemImage: "checkmark").font(.caption).foregroundStyle(.secondary) }
                }
            }
            SettingsCard(symbol: "questionmark.bubble", tint: .blue, title: "Help", detail: "Learn how it works, or tell us what to fix.") {
                VStack(spacing: 2) {
                    SettingsActionRow(symbol: "book", title: "Open the guide", detail: "How RasanAI makes a film") { NSWorkspace.shared.open(guideURL) }
                    SettingsActionRow(symbol: "exclamationmark.bubble", title: "Send feedback or report a problem", detail: "Tell the team what is broken or could be better") { StudioFeedback.present() }
                }
            }
        }
    }

    private var notificationCards: some View {
        LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 16) {
            SettingsCard(symbol: "bell.badge", tint: .turmeric, title: "Notify me when RasanAI needs me", detail: "A film that is waiting on you should not wait quietly.") {
                Toggle("Notify me when RasanAI needs me", isOn: Binding(
                    get: { settings.notificationsEnabled && settings.notificationsAllowed != .denied },
                    set: { enabled in Task { await settings.setNotificationsEnabled(enabled) } }))
                    .toggleStyle(.switch).labelsHidden()
                    .accessibilityLabel("Notify me when RasanAI needs me")
                if settings.notificationsEnabled && settings.notificationsAllowed == .denied {
                    HStack {
                        Text("Notifications are off for RasanAI in macOS.").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button("Open Notification Settings…") { settings.openNotificationSettings() }
                    }
                }
            }
        }
    }

    private var updateCards: some View {
        LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 16) {
            SettingsCard(symbol: "arrow.triangle.2.circlepath", tint: .green, title: "Keep RasanAI up to date", detail: "New features and fixes arrive on their own.") {
                Toggle("Check automatically", isOn: Binding(get: { updater.automaticChecks }, set: { updater.setAutomaticChecks($0) }))
                    .toggleStyle(.switch).disabled(!updater.isConfigured)
            }
            SettingsCard(symbol: "clock", tint: .green, title: "Last checked", detail: "See if a newer version is ready.") {
                HStack(spacing: 10) {
                    Text(updater.isConfigured ? updater.lastCheckedText : "Not available in this build").foregroundStyle(.secondary)
                    Spacer()
                    Button("Check now") { updater.check() }.disabled(!updater.canCheck)
                }
            }
        }
    }

    private var libraryCards: some View {
        LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 16) {
            SettingsCard(symbol: "folder.fill", tint: .blue, title: "Library folder", detail: "Films and brands live here as ordinary folders.") {
                HStack(spacing: 10) {
                    Image(systemName: "folder.fill").font(.system(size: 20)).foregroundStyle(Color.blue)
                    Text(abbreviated(settings.projectRoot)).lineLimit(1).truncationMode(.middle)
                        .textSelection(.enabled).accessibilityLabel("Library folder, \(abbreviated(settings.projectRoot))")
                }
                .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.05)))
                HStack(spacing: 8) {
                    Button("Show in Finder") {
                        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: settings.projectRoot, isDirectory: true)])
                    }
                    Button("Change…") { settings.chooseLibrary() }
                }
                Text("Changing it does not move or delete your existing films.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var aboutCards: some View {
        LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 16) {
            SettingsCard(symbol: "info.circle", tint: .gray, title: "RasanAI Studio", detail: "The version you are using.") {
                HStack {
                    Text("Version").foregroundStyle(.secondary)
                    Spacer()
                    Text(settings.appVersion).textSelection(.enabled)
                }
            }
            SettingsCard(symbol: "questionmark.bubble", tint: .blue, title: "Help", detail: "Learn how it works, or tell us what to fix.") {
                VStack(spacing: 2) {
                    SettingsActionRow(symbol: "book", title: "Open the guide", detail: "How RasanAI makes a film") { NSWorkspace.shared.open(guideURL) }
                    SettingsActionRow(symbol: "exclamationmark.bubble", title: "Send feedback or report a problem", detail: "Tell the team what is broken or could be better") { StudioFeedback.present() }
                }
            }
        }
    }

    private var rasanCards: some View {
        let agent = settings.agent
        return VStack(alignment: .leading, spacing: 16) {
            LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 16) {
                SettingsCard(symbol: "person.crop.circle", tint: .pink, title: "Who directs your films", detail: "RasanAI directs with your \(agent.title) account. Usage counts toward your plan.") {
                    Picker("Director", selection: $settings.defaultAgent) {
                        Text("Claude Code").tag(LocalAgent.claude.id)
                        Text("Codex").tag(LocalAgent.codex.id)
                    }.pickerStyle(.segmented).labelsHidden().accessibilityLabel("Director")
                    if agent != .custom {
                        HStack(spacing: 8) {
                            Text("Found at").foregroundStyle(.secondary)
                            Text(settings.path(for: agent).isEmpty ? "Not found" : abbreviated(settings.path(for: agent)))
                                .lineLimit(1).truncationMode(.middle)
                            Spacer()
                            Button("Choose…") { settings.chooseExecutable(for: agent) }
                        }
                        if agent == .claude {
                            // New films use the plan chosen on New film; a typed model here would silently lose to it.
                            Text("The model is chosen for each film in New film.").font(.caption).foregroundStyle(.secondary)
                        } else {
                            TextField("Model", text: $settings.codexModel, prompt: Text("Default"))
                        }
                    }
                    statusLine(agent)
                }
                SettingsCard(symbol: "speedometer", tint: .rasan, title: "Pace", detail: "How fast the director works. \(settings.pace.summary) You can change it for one film in New film.") {
                    Picker("Pace", selection: $settings.pace) {
                        ForEach(FilmPace.allCases) { Text($0.title).tag($0) }
                    }.pickerStyle(.menu).labelsHidden().accessibilityLabel("Pace")
                }
                SettingsCard(symbol: "photo.on.rectangle.angled", tint: .purple, title: "Generated images", detail: "Presenter films can use images made with Codex on your ChatGPT plan, about a minute and a half each.") {
                    Toggle("Generate images with Codex", isOn: $settings.generateImagesWithCodex).toggleStyle(.switch)
                }
                SettingsCard(symbol: "moon.zzz", tint: .teal, title: "Stay awake while working", detail: "The screen can still sleep. If the Mac sleeps, RasanAI picks the film back up when it wakes.") {
                    Toggle("Keep the Mac awake while a film is being made", isOn: $settings.keepAwakeWhileMaking).toggleStyle(.switch)
                }
                SettingsCard(symbol: "pause.circle", tint: .orange, title: "Pause when stuck", detail: "If it repeats a step or shows nothing new for two minutes, RasanAI pauses it. Nothing is lost.") {
                    Toggle("Pause the director when it looks stuck", isOn: $settings.pauseWhenStuck).toggleStyle(.switch)
                }
                SettingsCard(symbol: "dollarsign.circle", tint: .green, title: "Budget", detail: "RasanAI shows tokens and cost for each film, and pauses it when a film passes your limit. Figures marked est. use list prices.") {
                    BudgetSetting(settings: settings)
                }
            }
            SettingsCard(symbol: "wrench.and.screwdriver", tint: .gray, title: "Advanced", detail: "For people who know their way around. Safe to leave alone.") {
                DisclosureGroup("Developer options", isExpanded: $showAdvanced) {
                    VStack(alignment: .leading, spacing: 10) {
                        Toggle("Allow unrestricted tools", isOn: $settings.allowUnrestrictedTools).toggleStyle(.switch)
                        if settings.allowUnrestrictedTools {
                            Text("The director can read and change files outside the film's folder. Only use this on films you trust.")
                                .font(.caption).foregroundStyle(.red)
                        }
                        TextField("Claude model for “Same as Settings”", text: $settings.claudeModel, prompt: Text("Default"))
                        TextField("Node path", text: $settings.nodePath, prompt: Text(settings.nodeURL?.path ?? "Automatic"))
                        TextField("Custom executable", text: Binding(get: { settings.customPath }, set: { settings.setPath($0, for: .custom) }), prompt: Text("Optional"))
                    }.padding(.top, 8)
                }
            }
        }
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

// MARK: Settings pieces

/// One row of the left navigation: icon in a tinted square, label, a soft highlight on hover and when selected.
private struct SettingsNavRow: View {
    let item: SettingsSection
    let selected: Bool
    let action: () -> Void
    @State private var hovering = false
    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: item.symbol).font(.system(size: 12, weight: .semibold)).foregroundStyle(item.tint)
                    .frame(width: 26, height: 26)
                    .background(RoundedRectangle(cornerRadius: 7).fill(item.tint.opacity(0.16)))
                Text(item.title).font(.system(size: 13, weight: selected ? .semibold : .regular))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(selected ? 0.10 : (hovering ? 0.05 : 0))))
            .contentShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A rounded card: tinted icon, short title, one plain line, then the controls.
private struct SettingsCard<Content: View>: View {
    let symbol: String
    let tint: Color
    let title: String
    let detail: String
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol).font(.system(size: 15, weight: .semibold)).foregroundStyle(tint)
                    .frame(width: 34, height: 34)
                    .background(RoundedRectangle(cornerRadius: 9).fill(tint.opacity(0.16)))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.system(size: 15, weight: .semibold)).accessibilityAddTraits(.isHeader)
                    Text(detail).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.primary.opacity(0.045)))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.primary.opacity(0.08)))
        .accessibilityElement(children: .contain)
    }
}

/// A tappable row inside a card, with a hover highlight.
private struct SettingsActionRow: View {
    let symbol: String
    let title: String
    let detail: String
    let action: () -> Void
    @State private var hovering = false
    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: symbol).font(.system(size: 13)).foregroundStyle(Color.rasan).frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 13, weight: .medium))
                    Text(detail).font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 8).padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 9).fill(Color.primary.opacity(hovering ? 0.07 : 0)))
            .contentShape(RoundedRectangle(cornerRadius: 9))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityLabel(title).accessibilityHint(detail)
    }
}
