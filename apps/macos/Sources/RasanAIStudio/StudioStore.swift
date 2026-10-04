import AppKit
import AVKit
import Observation
import StudioCore
import UniformTypeIdentifiers
import UserNotifications

enum StudioSection: String, CaseIterable, Identifiable {
    case projects, assets, brandKits, scenes, direction, versions
    var id: String { rawValue }
    var title: String {
        switch self {
        case .projects: "Projects"
        case .assets: "Assets"
        case .brandKits: "Brand kits"
        case .scenes: "Scenes"
        case .direction: "Direction"
        case .versions: "Versions"
        }
    }
    var symbol: String {
        switch self {
        case .projects: "folder"
        case .assets: "photo.on.rectangle.angled"
        case .brandKits: "swatchpalette"
        case .scenes: "film"
        case .direction: "safari"
        case .versions: "clock.arrow.circlepath"
        }
    }
}

@MainActor @Observable
final class StudioStore {
    enum Sheet: String, Identifiable {
        case welcome, film, director, log, question, note, sidebar, inspector, shortcuts
        var id: String { rawValue }
    }
    var sheet: Sheet?
    private func present(_ value: Bool, _ kind: Sheet) { if value { sheet = kind } else if sheet == kind { sheet = nil } }
    let settings = StudioSettings()
    let runtime = DirectorRuntime()
    var consoleAddress: ConsoleAddress?
    var useFullConsole = true
    var showDirectorSheet: Bool { get { sheet == .director } set { present(newValue, .director) } }
    var showDirectorLog: Bool { get { sheet == .log } set { present(newValue, .log) } }
    var showQuestion: Bool { get { sheet == .question } set { present(newValue, .question) } }
    private var presentedQuestionID: String?
    var launchProject: URL?
    var localProjects: [(LocalProject, URL)] = []
    var isLoadingProjects = false
    private var libraryGeneration = UUID()
    var showNewProject: Bool { get { sheet == .film } set { present(newValue, .film) } }
    var filmDraftProject: URL?
    var selectedProjectURL: URL?
    var filmSourcesCopied = false
    var projectSearch = ""
    var projectSort = "recent"
    var showArchivedProjects = false
    var isManagingProject = false
    var projectSources: [URL] = []
    var isImportingSources = false
    var isReconnecting = false
    var isSavingFilm = false
    var sidebarVisible = UserDefaults.standard.object(forKey: "sidebarVisible") as? Bool ?? true { didSet { UserDefaults.standard.set(sidebarVisible, forKey: "sidebarVisible") } }
    var inspectorVisible = UserDefaults.standard.object(forKey: "inspectorVisible") as? Bool ?? true { didSet { UserDefaults.standard.set(inspectorVisible, forKey: "inspectorVisible") } }
    var showSidebarSheet: Bool { get { sheet == .sidebar } set { present(newValue, .sidebar) } }
    var showInspectorSheet: Bool { get { sheet == .inspector } set { present(newValue, .inspector) } }
    var showShortcuts: Bool { get { sheet == .shortcuts } set { present(newValue, .shortcuts) } }
    var windowWidth: CGFloat = 1120
    private var didRestoreWorkspace = false
    private var runOpenGeneration = UUID()
    private var sourcesGeneration = UUID()
    var visibleProjects: [(LocalProject, URL)] {
        localProjects.filter { project, _ in
            (showArchivedProjects ? project.archivedAt != nil : project.archivedAt == nil)
                && (projectSearch.isEmpty || project.name.localizedCaseInsensitiveContains(projectSearch))
        }.sorted {
            if projectSort == "name" { return $0.0.name.localizedStandardCompare($1.0.name) == .orderedAscending }
            if projectSort == "created" { return $0.0.createdAt > $1.0.createdAt }
            return ($0.0.lastOpenedAt ?? $0.0.createdAt) > ($1.0.lastOpenedAt ?? $1.0.createdAt)
        }
    }
    var snapshot: SessionSnapshot
    var stage: ReviewStage = .animatic
    var section: StudioSection = .scenes
    var playhead = 26.0
    var isPlaying = false
    var isSample = true
    var isConnected = false
    var isSending = false
    var runURL: URL?
    var workspaceURL: URL?
    var errorMessage: String?
    var statusMessage = "Sample film · explore the studio"
    var hasPendingQuestion: Bool { !isSample && snapshot.raw["ask"] != .null && snapshot.raw["ask"]["answered"] == .null }
    var activity: (title: String, symbol: String, detail: String) {
        if isSample { return ("Sample film", "play.rectangle", "Explore the studio without an agent account") }
        if runtime.isPreparing { return ("Preparing director", "hourglass", "Starting the local console") }
        if hasPendingQuestion { return ("Waiting for your answer", "questionmark.bubble", "Open the question to continue") }
        if isConnected && snapshot.step(snapshot.currentStep)["status"].string == "awaiting" && !awaitingAgent {
            return ("Ready for your review", "hand.raised", "Review \(snapshot.currentStep.replacingOccurrences(of: "_", with: " ")) and choose the next action")
        }
        if runtime.isRunning { return ("Director working", "gearshape.2", snapshot.workingMessage ?? "Working on \(snapshot.currentStep)") }
        if runtime.stopRequested { return ("Stopped", "pause.circle", "Your files are preserved. Resume when you're ready.") }
        if let code = runtime.lastExitCode {
            return code == 0 ? ("Director finished", "checkmark.circle", "Review the published result; export is available when a final video exists") : ("Needs attention", "exclamationmark.triangle", "Inspect the log for missing tools, permissions or other errors, then resume")
        }
        if !isConnected { return ("Offline", "wifi.slash", "Reconnect the local console or resume the director") }
        return ("Connected", "checkmark.circle", statusMessage)
    }
    var showNoteSheet: Bool { get { sheet == .note } set { present(newValue, .note) } }
    var showDecisions = false
    var directorMessage = ""
    var recentRuns: [String] = UserDefaults.standard.stringArray(forKey: "recentRuns") ?? []
    var finalPlayer: AVPlayer?
    var audioPlayer: AVPlayer?
    private var finalMediaURL: URL?
    private var audioMediaURL: URL?
    private var client: ConsoleClient?
    private var pollingTask: Task<Void, Never>?
    private var generation = UUID()
    private var previousCurrentStep = ""
    private var loadedVideoDuration = 0.0
    private var sampleURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("RasanAIStudio/sample-session.json")
    }

    init() {
        // A checked-in resource guarantees a usable first launch, without downloads or an agent account.
        snapshot = SessionSnapshot()
        loadSample()
        reloadProjects()
        if settings.showWelcome { sheet = .welcome }
        runtime.onExit = { [weak self] code, stopped in
            guard let self, !stopped else { return }
            self.notify(title: code == 0 ? "Director finished" : "Director needs attention", body: "Open RasanAI Studio to review the result or log.", id: "director-\(UUID().uuidString)")
        }
    }

    func reloadProjects() {
        let library = settings.library
        let identity = UUID(); libraryGeneration = identity
        isLoadingProjects = true
        Task {
            do {
                let projects = try await Task.detached { try library.projects() }.value
                guard libraryGeneration == identity else { return }
                localProjects = projects; isLoadingProjects = false
            } catch {
                guard libraryGeneration == identity else { return }
                isLoadingProjects = false; errorMessage = error.localizedDescription
            }
        }
        Task {
            try? await Task.sleep(for: .seconds(8))
            if libraryGeneration == identity && isLoadingProjects {
                statusMessage = "Project library is slow or unavailable · choose another folder in Settings if needed"
            }
        }
    }

    func createProject(_ name: String) async -> Bool {
        let library = settings.library
        do {
            let folder = try await Task.detached { try library.create(name: name) }.value
            reloadProjects()
            section = .projects
            statusMessage = "Project folder created · choose Start Film to launch its director"
            NSWorkspace.shared.activateFileViewerSelecting([folder])
            return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func openProject(_ project: URL) {
        guard !runtime.isRunning, !runtime.isPreparing, !isManagingProject, !isImportingSources, !isSavingFilm else { errorMessage = "Wait for file operations to finish and stop the director before switching films."; return }
        selectedProjectURL = project
        UserDefaults.standard.set(project.path, forKey: "lastOpenedProject")
        UserDefaults.standard.set("project", forKey: "lastWorkspaceKind")
        let library = settings.library
        isManagingProject = true
        Task { try? await Task.detached { try library.update(project, opened: true) }.value; isManagingProject = false; reloadProjects() }
        let identity = UUID(); runOpenGeneration = identity
        Task {
            let path = await Task.detached { try? String(contentsOf: project.appendingPathComponent(".rasanai/current"), encoding: .utf8) }.value
            guard runOpenGeneration == identity else { return }
            guard let path, path.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) != nil else {
                selectedProjectURL = project; filmDraftProject = project; showNewProject = true; return
            }
            openRun(project.appendingPathComponent(".rasanai/\(path)"))
        }
    }
    func manageProject(_ folder: URL, action: String, name: String? = nil) {
        guard !runtime.isRunning, !runtime.isPreparing, !isManagingProject, !isImportingSources, !isSavingFilm else {
            errorMessage = "Stop the director before modifying projects."; return
        }
        isManagingProject = true
        let library = settings.library
        Task {
            defer { isManagingProject = false }
            do {
                let newFolder: URL? = try await Task.detached {
                    switch action {
                    case "rename": try library.update(folder, name: name)
                    case "archive": try library.update(folder, archived: true)
                    case "unarchive": try library.update(folder, archived: false)
                    case "duplicate": return try library.duplicateDraft(folder)
                    case "trash": try library.trash(folder)
                    default: throw ProjectLibrary.LibraryError.unsafeProject
                    }
                    return nil
                }.value
                if action == "trash" {
                    recentRuns.removeAll { $0.hasPrefix(folder.path + "/") }
                    UserDefaults.standard.set(recentRuns, forKey: "recentRuns")
                    if UserDefaults.standard.string(forKey: "lastOpenedProject") == folder.path { UserDefaults.standard.removeObject(forKey: "lastOpenedProject") }
                    if UserDefaults.standard.string(forKey: "lastOpenedRun")?.hasPrefix(folder.path + "/") == true { UserDefaults.standard.removeObject(forKey: "lastOpenedRun") }
                    if selectedProjectURL == folder { selectedProjectURL = nil; loadSample() }
                }
                if let newFolder { showArchivedProjects = false; filmDraftProject = newFolder; selectedProjectURL = newFolder; reloadSources(); showNewProject = true }
                reloadProjects()
                statusMessage = action == "trash" ? "Project moved to Trash · restore it using Finder" : "Project library updated"
            } catch { errorMessage = error.localizedDescription }
        }
    }

    func newFilm() {
        guard !isSavingFilm else { return }
        runOpenGeneration = UUID()
        filmDraftProject = nil
        showNewProject = true
    }
    func toggleSidebar() {
        if windowWidth < 950 { showSidebarSheet.toggle() } else { sidebarVisible.toggle() }
    }
    func toggleInspector() {
        if windowWidth < 1280 || (!isSample && useFullConsole) { showInspectorSheet.toggle() } else { inspectorVisible.toggle() }
    }
    func clearRecentRuns() {
        recentRuns = []; UserDefaults.standard.removeObject(forKey: "recentRuns")
        UserDefaults.standard.removeObject(forKey: "lastOpenedRun")
    }
    func restoreWorkspace() {
        guard !didRestoreWorkspace else { return }; didRestoreWorkspace = true
        if let index = CommandLine.arguments.firstIndex(of: "--run"), CommandLine.arguments.count > index + 1 {
            settings.showWelcome = false
            openRun(URL(fileURLWithPath: CommandLine.arguments[index + 1]))
        } else if settings.hasCompletedWelcome && settings.reopenLastProject {
            if UserDefaults.standard.string(forKey: "lastWorkspaceKind") == "project",
               let path = UserDefaults.standard.string(forKey: "lastOpenedProject") { openProject(URL(fileURLWithPath: path)) }
            else if let path = UserDefaults.standard.string(forKey: "lastOpenedRun") { openRun(URL(fileURLWithPath: path)) }
        }
    }
    func reloadSources() {
        let identity = UUID(); sourcesGeneration = identity
        projectSources = []
        guard let project = selectedProjectURL else { return }
        Task {
            let files = await Task.detached { (try? ProjectSources.files(in: project)) ?? [] }.value
            guard sourcesGeneration == identity else { return }
            projectSources = files
        }
    }
    @discardableResult func importSources(_ urls: [URL], replacing old: URL? = nil, into target: URL? = nil) -> Bool {
        guard !urls.isEmpty else { return false }
        guard let project = target ?? selectedProjectURL else { errorMessage = "Create or open a project before importing source files."; return false }
        guard !isImportingSources, !isManagingProject, !isSavingFilm else { return false }
        guard old == nil || (!runtime.isRunning && !runtime.isPreparing) else {
            errorMessage = "Stop the director before replacing a file it may be using."; return false
        }
        isImportingSources = true
        let library = settings.library
        Task {
            defer { isImportingSources = false }
            do {
                let count = try await Task.detached {
                    _ = try library.read(project)
                    if let old {
                        try ProjectSources.validate(old, in: project)
                        guard urls.count == 1, urls[0].pathExtension.lowercased() == old.pathExtension.lowercased(),
                              urls[0].deletingLastPathComponent().resolvingSymlinksInPath() != old.deletingLastPathComponent().resolvingSymlinksInPath() else { throw ProjectSources.SourceError.incompatibleReplacement }
                    }
                    let added = try ProjectSources.importFiles(urls, into: project)
                    if let old, let staged = added.first {
                        var trashed: NSURL?
                        do {
                            try FileManager.default.trashItem(at: old, resultingItemURL: &trashed)
                            try FileManager.default.moveItem(at: staged, to: old)
                        } catch {
                            if let trashed, !FileManager.default.fileExists(atPath: old.path) {
                                try? FileManager.default.moveItem(at: trashed as URL, to: old)
                            }
                            // Preserve the new copy if restoration failed, so both versions remain recoverable.
                            if FileManager.default.fileExists(atPath: old.path) { for file in added { try? FileManager.default.removeItem(at: file) } }
                            throw error
                        }
                    }
                    return added.count
                }.value
                if selectedProjectURL == project { reloadSources() }
                statusMessage = count == 0 ? "These files are already attached" : "Imported \(count) source file(s) into \(project.lastPathComponent) · originals unchanged"
                if old != nil && count > 0 { statusMessage += " · existing filename preserved; previous copy moved to Trash" }
            } catch { errorMessage = error.localizedDescription }
        }
        return true
    }
    func trashSource(_ file: URL) {
        guard let project = selectedProjectURL, !isImportingSources, !isManagingProject, !runtime.isRunning, !runtime.isPreparing else { return }
        isImportingSources = true
        Task {
            defer { isImportingSources = false }
            do {
                try await Task.detached { try ProjectSources.validate(file, in: project); try FileManager.default.trashItem(at: file, resultingItemURL: nil) }.value
                reloadSources(); statusMessage = "Project source copy moved to Trash · original unchanged"
            } catch { errorMessage = error.localizedDescription }
        }
    }

    func saveFilm(name: String, draft: FilmDraft, sources: [URL], existing: URL?, start: Bool) async -> URL? {
        filmSourcesCopied = false
        guard !runtime.isRunning, !runtime.isPreparing, !isImportingSources, !isManagingProject, !isSavingFilm else {
            errorMessage = "Stop the active director before creating or changing another film."; return nil
        }
        isSavingFilm = true
        defer { isSavingFilm = false }
        do {
            let library = settings.library
            let project = try await Task.detached {
                if let existing { _ = try library.read(existing); return existing }
                return try library.create(name: name)
            }.value
            // Remember the created folder even if importing or starting fails, so retry never creates duplicates.
            filmDraftProject = project
            try await Task.detached {
                _ = try ProjectSources.importFiles(sources, into: project)
                try draft.save(in: project)
            }.value
            filmSourcesCopied = true
            selectedProjectURL = project
            UserDefaults.standard.set(project.path, forKey: "lastOpenedProject")
            UserDefaults.standard.set("project", forKey: "lastWorkspaceKind")
            reloadSources()
            reloadProjects(); section = .projects
            statusMessage = "Draft saved · start the film whenever you're ready"
            if start {
                settings.defaultAgent = draft.agent
                launchProject = project
                let files = try await Task.detached { try ProjectSources.files(in: project) }.value
                await startDirector(request: draft.request(sources: files))
                if !runtime.isRunning { return nil }
            }
            return project
        } catch { errorMessage = error.localizedDescription; return nil }
    }

    var scenes: [FilmScene] { snapshot.scenes(for: stage) }
    var duration: Double { stage == .final && loadedVideoDuration > 0 ? loadedVideoDuration : snapshot.duration(for: stage) }
    var selectedScene: FilmScene? { snapshot.scene(at: playhead, stage: stage) }
    var reviewStep: String { snapshot.actionStep(for: stage) }
    var pendingNotes: [ReviewNote] { snapshot.notes.filter { $0.state != "resolved" && $0.step == reviewStep } }
    var awaitingAgent: Bool {
        let sent = snapshot.payload(for: stage)["sent"]["type"].string
        return ["apply", "approve", "choose", "submit"].contains(sent ?? "")
    }
    var canSend: Bool {
        isConnected && !isSending && !awaitingAgent && snapshot.currentStep == reviewStep
            && snapshot.step(snapshot.currentStep)["status"].string == "awaiting"
    }
    var resolver: AssetResolver? {
        guard let runURL, let workspaceURL else { return nil }
        return AssetResolver(run: runURL, workspace: workspaceURL)
    }
    var finalURL: URL? { resolver?.resolve(snapshot.finalVideo) }
    func asset(_ path: String?) -> URL? { resolver?.resolve(path) }

    func openPanel() {
        let panel = NSOpenPanel()
        panel.title = "Open a RasanAI run"
        panel.message = "Choose a run folder containing session.json, or session.json itself."
        panel.canChooseDirectories = true
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url { openRun(url) }
    }

    func openRun(_ url: URL) {
        let run = url.lastPathComponent == "session.json" ? url.deletingLastPathComponent() : url
        guard (!runtime.isRunning && !runtime.isPreparing) || run == runtime.runURL else { errorMessage = "Stop the director before switching films."; return }
        let identity = UUID(); runOpenGeneration = identity
        Task {
        do {
            let state = try await Task.detached { try SessionSnapshot(data: Data(contentsOf: run.appendingPathComponent("session.json"))) }.value
            guard runOpenGeneration == identity else { return }
            guard (!runtime.isRunning && !runtime.isPreparing) || run == runtime.runURL else { errorMessage = "Stop the director before switching films."; return }
            if runtime.runURL != run { runtime.clearPresentation() }
            resetConnection()
            snapshot = state
            runURL = run
            workspaceURL = run
            let project = run.deletingLastPathComponent().lastPathComponent == ".rasanai" ? run.deletingLastPathComponent().deletingLastPathComponent() : nil
            selectedProjectURL = project.flatMap { (try? settings.library.read($0)) != nil ? $0 : nil }
            reloadSources()
            isSample = false
            stage = state.stage
            previousCurrentStep = state.currentStep
            section = .scenes
            playhead = 0
            recentRuns = [run.path] + recentRuns.filter { $0 != run.path }
            recentRuns = Array(recentRuns.prefix(8))
            UserDefaults.standard.set(recentRuns, forKey: "recentRuns")
            UserDefaults.standard.set(run.path, forKey: "lastOpenedRun")
            UserDefaults.standard.set("run", forKey: "lastWorkspaceKind")
            connect()
        } catch { if runOpenGeneration == identity { errorMessage = "Could not open this run. It may have been moved or removed. \(error.localizedDescription)" } }
        }
    }

    func connect() {
        guard let runURL else { return }
        pollingTask?.cancel()
        do {
            let address = try ConsoleAddress(data: Data(contentsOf: runURL.appendingPathComponent("address.json")))
            consoleAddress = address
            workspaceURL = address.root
            client = ConsoleClient(address: address)
            let identity = generation
            statusMessage = "Connecting to the local director…"
            pollingTask = Task { [weak self] in
                while !Task.isCancelled {
                    guard let self, self.generation == identity else { return }
                    await self.refresh()
                    do { try await Task.sleep(for: .seconds(2)) } catch { return }
                }
            }
            configureMedia()
        } catch {
            consoleAddress = nil
            client = nil
            isConnected = false
            statusMessage = "Offline run · reconnect after starting its console"
            configureMedia()
        }
    }
    func reconnectConsole() {
        guard let run = runURL, !isReconnecting else { return }
        isReconnecting = true
        let root = workspaceURL ?? run
        let identity = generation
        Task {
            defer { isReconnecting = false }
            do {
                try await runtime.reconnect(run: run, root: root, settings: settings)
                guard identity == generation else { return }
                connect()
            } catch { if identity == generation { errorMessage = error.localizedDescription } }
        }
    }

    func refresh() async {
        // A console may have restarted with a new port/token. Re-read its address before retrying.
        if let runURL, let data = try? Data(contentsOf: runURL.appendingPathComponent("address.json")),
           let address = try? ConsoleAddress(data: data),
           consoleAddress?.port != address.port || consoleAddress?.token != address.token {
            consoleAddress = address; workspaceURL = address.root; client = ConsoleClient(address: address)
        }
        guard let client else { return }
        let identity = generation
        do {
            let next = try await client.state()
            guard generation == identity else { return }
            snapshot = next
            if next.raw["ask"]["answered"] == .null, let id = next.raw["ask"]["id"].string, id != presentedQuestionID {
                presentedQuestionID = id; showQuestion = true
                notify(title: "Your director has a question", body: "Open RasanAI Studio to answer and continue.", id: "question-\(id)")
            }
            isConnected = true
            if previousCurrentStep != next.currentStep {
                setStage(next.stage)
                previousCurrentStep = next.currentStep
            }
            playhead = min(playhead, duration)
            statusMessage = next.workingMessage ?? (awaitingAgent ? "Sent to the director · waiting for an update" : "Connected to the local director")
            configureMedia()
        } catch {
            guard generation == identity else { return }
            isConnected = false
            statusMessage = "Console disconnected · retrying"
        }
    }

    func loadSample(reset: Bool = false) {
        guard !runtime.isRunning, !runtime.isPreparing else { errorMessage = "Stop the director before opening the sample."; return }
        runtime.clearPresentation()
        runOpenGeneration = UUID()
        resetConnection()
        let data = !reset ? (try? Data(contentsOf: sampleURL)) : nil
        do {
            snapshot = try (data.flatMap { try? SessionSnapshot(data: $0) }) ?? StudioResources.sampleSnapshot()
        } catch {
            snapshot = SessionSnapshot()
            errorMessage = "Unable to load the sample film. \(error.localizedDescription)"
        }
        isSample = true
        stage = .animatic
        section = .scenes
        playhead = 26
        runURL = nil
        workspaceURL = nil
        selectedProjectURL = nil; reloadSources()
        statusMessage = "Sample film · no agent or audio attached"
    }
    private func notify(title: String, body: String, id: String) {
        guard settings.notificationsEnabled, Bundle.main.bundleIdentifier != nil, !NSApp.isActive else { return }
        let content = UNMutableNotificationContent()
        content.title = title; content.body = body; content.sound = .default
        if let run = runtime.runURL ?? runURL { content.userInfo = ["runPath": run.path] }
        Task { try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil)) }
    }

    private func resetConnection() {
        generation = UUID()
        pollingTask?.cancel()
        pollingTask = nil
        client = nil
        consoleAddress = nil
        showQuestion = false; presentedQuestionID = nil
        isConnected = false
        isSending = false
        isPlaying = false
        audioPlayer?.pause()
        finalPlayer?.pause()
        audioPlayer = nil
        finalPlayer = nil
        audioMediaURL = nil
        finalMediaURL = nil
        loadedVideoDuration = 0
    }

    func setStage(_ next: ReviewStage) {
        pause()
        stage = next
        section = .scenes
        playhead = min(playhead, duration)
        seek(to: playhead)
    }

    func startDirector(request: String) async {
        guard let project = launchProject ?? workspaceURL else { errorMessage = "Choose a project first."; return }
        do {
            let resume = launchProject == nil ? runURL : nil
            let run = try await runtime.start(project: project, existingRun: resume, request: request, settings: settings)
            openRun(run)
            useFullConsole = true
        } catch { errorMessage = error.localizedDescription }
    }

    func seek(to time: Double) {
        playhead = min(max(0, time), max(0, duration))
        let target = CMTime(seconds: playhead, preferredTimescale: 600)
        if stage == .final { finalPlayer?.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero) }
        else {
            let offset = snapshot.animatic["music"]["offset"].number ?? 0
            audioPlayer?.seek(to: CMTime(seconds: playhead + offset, preferredTimescale: 600))
        }
    }

    func togglePlayback() {
        guard duration > 0 else { return }
        if isPlaying { pause(); return }
        if playhead >= duration { seek(to: 0) }
        isPlaying = true
        if stage == .final { finalPlayer?.play() } else { audioPlayer?.play() }
    }

    func pause() { isPlaying = false; audioPlayer?.pause(); finalPlayer?.pause() }
    func advance(by elapsed: Double) {
        guard isPlaying else { return }
        if stage == .final, let finalPlayer {
            let actual = finalPlayer.currentTime().seconds
            if actual.isFinite { playhead = actual }
        } else { playhead += elapsed }
        if playhead >= duration { playhead = duration; pause() }
    }

    private func configureMedia() {
        let audio = asset(snapshot.audioFile)
        if audioMediaURL != audio {
            audioPlayer?.pause()
            audioMediaURL = audio
            audioPlayer = audio.map { AVPlayer(url: $0) }
            seek(to: playhead)
            if isPlaying && stage != .final { audioPlayer?.play() }
        }
        if finalMediaURL != finalURL {
            finalPlayer?.pause()
            finalMediaURL = finalURL
            finalPlayer = finalURL.map { AVPlayer(url: $0) }
            loadedVideoDuration = 0
            if let url = finalURL {
                let identity = generation
                Task { [weak self] in
                    if let loaded = try? await AVURLAsset(url: url).load(.duration), loaded.seconds.isFinite,
                       let self, self.generation == identity, self.finalMediaURL == url {
                        self.loadedVideoDuration = loaded.seconds
                    }
                }
            }
        }
    }

    func addNote(text: String, scope: String) async {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        if isSample {
            var root = snapshot.raw.object
            var comments = root["comments"]?.array ?? []
            comments.append(.object([
                "id": .string(UUID().uuidString), "step": .string(reviewStep),
                "scene": selectedScene?.originalID ?? .null, "t": .number(playhead),
                "scope": .string(scope), "text": .string(text), "state": .string("open")
            ]))
            root["comments"] = .array(comments)
            saveSample(.object(root))
            statusMessage = "Sample note saved on this Mac"
        } else {
            await send(type: "comment", value: .object([
                "scene": selectedScene?.originalID ?? .null, "t": .number(playhead), "scope": .string(scope)
            ]), note: text)
        }
    }

    func send(type: String, value: JSONValue = .null, note: String = "", step explicitStep: String? = nil) async {
        guard let client, isConnected, !isSending else { return }
        let identity = generation
        let step = explicitStep ?? reviewStep
        isSending = true
        defer { if generation == identity { isSending = false } }
        do {
            try await client.send(step: step, type: type, value: value, note: note)
            guard generation == identity else { return }
            statusMessage = "Sent to the director"
            await refresh()
        } catch { if generation == identity { errorMessage = error.localizedDescription } }
    }

    func applyNotes() async {
        await send(type: "apply", value: .object(["ids": .array(pendingNotes.map { .string($0.id) })]))
    }
    func sendDirectorMessage() async {
        let text = directorMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        await send(type: "note", note: text)
        if errorMessage == nil && isConnected { directorMessage = "" }
    }

    private func saveSample(_ value: JSONValue) {
        do {
            let data = try JSONEncoder().encode(value)
            try FileManager.default.createDirectory(at: sampleURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: sampleURL, options: .atomic)
            snapshot = try SessionSnapshot(data: data)
        } catch { errorMessage = error.localizedDescription }
    }

    func exportVideo() {
        guard let finalURL else { return }
        let panel = NSSavePanel()
        panel.title = "Export finished film"
        panel.nameFieldStringValue = finalURL.lastPathComponent
        panel.allowedContentTypes = [UTType(filenameExtension: finalURL.pathExtension) ?? .movie]
        if panel.runModal() == .OK, let destination = panel.url {
            if finalURL.standardizedFileURL == destination.standardizedFileURL {
                statusMessage = "The film is already saved here"
                return
            }
            let staging = destination.deletingLastPathComponent().appendingPathComponent(".rasanai-export-\(UUID().uuidString).\(finalURL.pathExtension)")
            do {
                // Copy on disk; a delivery render can be much larger than the app's memory budget.
                try FileManager.default.copyItem(at: finalURL, to: staging)
                if FileManager.default.fileExists(atPath: destination.path) {
                    _ = try FileManager.default.replaceItemAt(destination, withItemAt: staging)
                } else { try FileManager.default.moveItem(at: staging, to: destination) }
                statusMessage = "Exported \(destination.lastPathComponent)"
            } catch {
                try? FileManager.default.removeItem(at: staging)
                errorMessage = error.localizedDescription
            }
        }
    }
}
