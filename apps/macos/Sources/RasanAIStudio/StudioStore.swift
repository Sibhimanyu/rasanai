import AppKit
import AVKit
import Observation
import StudioCore
import UniformTypeIdentifiers
import UserNotifications

enum Route: Hashable {
    case newFilm(URL?)
    case film(URL)
    case brands
    case brand(URL)
    case sample
    case queue
    case series
    case seriesPage(URL)
    case inspire
    case library(LibraryMode)
    case settings
}

/// Everything the app needs to say about one film, in one place.
enum FilmPhase: Equatable, Sendable {
    case draft, queued(Int), starting, working, yourTurn(String), paused, needsAttention, finished(Double), offline, inProgress
    var homeLine: String {
        switch self {
        case .queued(let position): "Queued · \(position)"
        case .draft: "Draft"
        case .starting, .working: "Director working"
        case .yourTurn(let what): "Waiting for you · \(what)"
        case .paused: "Paused"
        case .needsAttention: "Needs attention"
        case .finished(let seconds): seconds > 0 ? "Finished · \(clockText(seconds))" : "Finished"
        case .offline: "Not running"
        case .inProgress: "In progress"
        }
    }
    var tone: StatusTone {
        switch self {
        case .working, .starting, .finished: .good
        case .yourTurn: .warn
        case .needsAttention: .bad
        default: .quiet
        }
    }
    var isBusy: Bool { self == .working || self == .starting }
    /// True when a call or a problem is waiting on the person (counts toward the Dock badge; a pause does not).
    var callsForYou: Bool {
        switch self {
        case .yourTurn, .needsAttention: true
        default: false
        }
    }
    /// True when the film is stopped until the person does something.
    var needsYou: Bool {
        switch self {
        case .yourTurn, .needsAttention, .paused: true
        default: false
        }
    }
}

/// A timed note left while watching a finished film.
struct FilmNote: Identifiable, Equatable {
    let id = UUID()
    var time: Double
    var text = ""
}

struct FilmSummary: Equatable, Sendable {
    var phase: FilmPhase
    var poster: URL?
    var stage: ReviewStage?
    var updatedAt: Date?
    var duration: Int?
    var aspect: String?
    /// What is waiting, for Home: "3 stories ready · Claude's pick: Twelve small victories".
    var detail: String? = nil
    static let draft = FilmSummary(phase: .draft, poster: nil)
    /// What the person is asked to do, in plain verbs (see `CallVocabulary`); the final reads "render the final" until there is a video.
    static func friendlyStep(_ step: String, in snapshot: SessionSnapshot? = nil) -> String {
        snapshot.map { CallVocabulary.turnPhrase(step: step, in: $0) } ?? CallVocabulary.turnPhrase(step: step)
    }
    /// Reads a film's state from disk, for films that are not the one currently open.
    static func load(project: URL) -> FilmSummary {
        var base = FilmSummary.draft
        base.updatedAt = (try? project.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        if let draft = FilmDraft.load(in: project) { base.duration = draft.duration; base.aspect = draft.aspect }
        guard let current = try? String(contentsOf: project.appendingPathComponent(".rasanai/current"), encoding: .utf8),
              current.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) != nil else { return base }
        let run = project.appendingPathComponent(".rasanai/\(current)")
        let sessionFile = run.appendingPathComponent("session.json")
        base.updatedAt = (try? sessionFile.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? base.updatedAt
        guard let data = try? Data(contentsOf: sessionFile),
              let state = try? SessionSnapshot(data: data) else { base.phase = .inProgress; return base }
        let resolver = AssetResolver(run: run, workspace: project)
        var poster: URL?
        if let path = state.scenes(for: .animatic).first?.thumbnail ?? state.scenes(for: .final).first?.thumbnail,
           let url = resolver.resolve(path), let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size < 20_000_000 { poster = url }
        let status = state.step(state.currentStep)["status"].string
        base.poster = poster; base.stage = state.stage
        if state.raw["ask"] != .null, state.raw["ask"]["answered"] == .null { base.phase = .yourTurn("answer a question"); return base }
        if state.stage == .final, resolver.resolve(state.finalVideo) != nil, status == "done" {
            let seconds = state.duration(for: .final)
            base.phase = .finished(seconds)
            if seconds > 0 { base.duration = Int(seconds.rounded()) }
            return base
        }
        if status == "awaiting" { base.phase = .yourTurn(friendlyStep(state.currentStep, in: state)); base.detail = CallNotices.homeDetail(state); return base }
        base.phase = .inProgress
        return base
    }
}

@MainActor @Observable
final class StudioStore {
    enum Sheet: String, Identifiable {
        case welcome, log, files, note, export, preflight, projectTransfer
        var id: String { rawValue }
    }
    var preflightReport: PreflightReport?
    var preflightProject: URL?
    var preflightSources: [URL] = []
    var isCheckingPreflight = false
    var preflightGeneration = UUID()
    let toolSetup = ToolSetup()
    var projectTransfer: ProjectTransferRequest?
    var isTransferringProject = false
    var transferProgress: ProjectTransferProgress?
    var transferTask: Task<Void, Never>?
    var transferOperation = UUID()
    var transferResult: URL?
    var transferError: String?
    var sheet: Sheet?
    private func present(_ value: Bool, _ kind: Sheet) { if value { sheet = kind } else if sheet == kind { sheet = nil } }
    /// The navigation stack: Home is the root, everything else is pushed on top of it.
    var path: [Route] = [] {
        didSet {
            if !steppingHistory && oldValue != path {
                backHistory.append(oldValue); if backHistory.count > 60 { backHistory.removeFirst() }
                forwardHistory.removeAll()
            }
            guard !isDemo else { return }
            if case .film? = path.last { UserDefaults.standard.set(true, forKey: "reopenFilmOnLaunch") } else { UserDefaults.standard.set(false, forKey: "reopenFilmOnLaunch") }
        }
    }
    /// Back and forward, like a browser: every place the person went, so the header's ‹ › can step through them.
    private(set) var backHistory: [[Route]] = []
    private(set) var forwardHistory: [[Route]] = []
    private var steppingHistory = false
    var canGoBack: Bool { !backHistory.isEmpty }
    var canGoForward: Bool { !forwardHistory.isEmpty }
    func goBack() {
        guard let previous = backHistory.popLast() else { return }
        forwardHistory.append(path); steppingHistory = true; path = previous; steppingHistory = false
    }
    func goForward() {
        guard let next = forwardHistory.popLast() else { return }
        backHistory.append(path); steppingHistory = true; path = next; steppingHistory = false
    }
    /// Whether the last session ended on a film page; read once at init, before any navigation can rewrite it.
    private let reopenFilmAtLaunch = UserDefaults.standard.bool(forKey: "reopenFilmOnLaunch")
    /// The series the person has saved (folders next to Brands), newest data from disk; reloaded when a page changes one.
    var seriesList: [Series] = []
    /// Home's Start button: the next New film opens on Review, with the box's words and everything else decided.
    var newFilmStartsAtReview = false
    /// Set by a series page: the next New film is an episode of this series (its folder) or starts a new one.
    var newFilmSeries: URL?
    var newFilmStartsSeries = false
    var queuePaused = true
    var queueMessage = ""
    var queueStarting = false
    var queueHandlingExit = false
    var queueBlockedByFileOperations: Bool { isSavingFilm || isManagingProject || isImportingSources || isSending || isTransferringProject || toolSetup.isRunning }
    var newFilmPrefill = ""
    /// The title Home's Continue made up from the brief, so New film knows the name is a suggestion it may redo, not
    /// something the person typed.
    var suggestedFilmTitle: (title: String, brief: String)?
    var newFilmPrefillFiles: [URL] = []
    /// Moments picked in Get inspired and waiting to be attached to the next New film.
    var newFilmPrefillMoments: [FilmMoment] = []
    /// The Get inspired catalog and its filters; the page keeps its picks here so they survive leaving and coming back.
    var gallery = MomentGallery(autoload: true)
    var inspirePicks = MomentSelection()
    let settings: StudioSettings
    let runtime = DirectorRuntime()
    let monitor = DirectorMonitor()
    /// Brand kit compile jobs, one per brand folder; held here so leaving the brand page does not stop one.
    @ObservationIgnored private var brandCompilers: [URL: BrandCompiler] = [:]
    func brandCompiler(for folder: URL) -> BrandCompiler {
        let key = folder.standardizedFileURL
        if let existing = brandCompilers[key] { return existing }
        let created = BrandCompiler(); brandCompilers[key] = created; return created
    }
    /// Film progress models, one per run, created on first use (see FilmProgress.swift).
    @ObservationIgnored var progressModels: [URL: FilmProgress] = [:]
    /// Set by the DEBUG replay: while non-nil nothing may attach to a run folder (no transport, no live read).
    @ObservationIgnored var replayRun: URL?
    /// Enters replay mode: cancels any run open in flight and detaches the live film model and progress models.
    func enterReplay(run: URL) {
        replayRun = run
        runOpenGeneration = UUID()
        film?.stop(); film = nil
        for model in progressModels.values { model.stop() }
        progressModels.removeAll()
    }
    @ObservationIgnored let researchTimeBoxing = ResearchTimeBoxing()
    /// When true, the film page shows the console even for a finished film ("Make changes").
    var showChanges = false
    /// The film (project or external run folder) whose state is currently loaded.
    var loadedFilm: URL?
    var summaries: [URL: FilmSummary] = [:]
    var browsedFilm: FilmArchive?
    var exportSource: URL?
    var exportCaptions: URL?
    var previewFilm: URL?
    var previewVideo: URL?
    var displayedFilmURL: URL? { if case .film(let url)? = path.last { return url }; return nil }
    var isBrowsingAnotherFilm: Bool { displayedFilmURL != nil && displayedFilmURL != loadedFilm }
    var displayedVideo: URL? {
        if previewFilm == displayedFilmURL, let previewVideo { return previewVideo }
        return isBrowsingAnotherFilm ? (browsedFilm?.project == displayedFilmURL ? browsedFilm?.video : nil) : finalURL
    }
    var activeDirectorProject: URL? { runtime.projectURL ?? (runtime.isPreparing ? selectedProjectURL : nil) }
    func shouldBrowseSeparately(_ url: URL) -> Bool {
        (runtime.isRunning || runtime.isPreparing || runtime.isFinishing || queueStarting || queueHandlingExit) && url != activeDirectorProject && url != runtime.runURL
    }
    struct PendingConsent: Identifiable { let id = UUID(); let agent: LocalAgent; let proceed: () -> Void }
    var pendingConsent: PendingConsent?
    var isDemo = false
    var showDirectorLog: Bool { get { sheet == .log } set { present(newValue, .log) } }
    var showFiles: Bool { get { sheet == .files } set { present(newValue, .files) } }
    private var presentedQuestionID: String?
    /// The last snapshot of the open film, to tell a call that just became ready from one that was already waiting.
    private var noticeBaseline: SessionSnapshot?
    var launchProject: URL?
    var localProjects: [(LocalProject, URL)] = []
    var isLoadingProjects = false
    private var libraryGeneration = UUID()
    var filmDraftProject: URL?
    var selectedProjectURL: URL?
    var filmSourcesCopied = false
    var projectSearch = ""
    var showArchivedProjects = false
    var isManagingProject = false
    var projectSources: [URL] = []
    var isImportingSources = false
    var isSavingFilm = false
    private var didRestoreWorkspace = false
    private var runOpenGeneration = UUID()
    private var sourcesGeneration = UUID()
    /// The films that are not archived. The sidebar, its badge and the status bar count these, so a search or the archive
    /// view on a library page never changes them.
    var activeProjects: [(LocalProject, URL)] { localProjects.filter { $0.0.archivedAt == nil } }
    /// What a library page lists: the search and the archive view apply to the page that set them, nowhere else.
    var visibleProjects: [(LocalProject, URL)] {
        localProjects.filter { project, _ in
            (showArchivedProjects ? project.archivedAt != nil : project.archivedAt == nil)
                && (projectSearch.isEmpty || project.name.localizedCaseInsensitiveContains(projectSearch))
        }.sorted {
            return ($0.0.lastOpenedAt ?? $0.0.createdAt) > ($1.0.lastOpenedAt ?? $1.0.createdAt)
        }
    }
    /// A short line about what a library action just did ("Archived Founder story"), shown in the status bar for a few
    /// seconds; reversible actions say so.
    var notice: String?
    private var noticeGeneration = UUID()
    func announce(_ text: String) {
        notice = text
        let generation = UUID(); noticeGeneration = generation
        Task {
            try? await Task.sleep(for: .seconds(4))
            if noticeGeneration == generation { notice = nil }
        }
    }
    var snapshot: SessionSnapshot
    var stage: ReviewStage = .animatic
    var playhead = 26.0
    var isPlaying = false
    var isSample = false
    var isConnected = false
    var isSending = false
    var runURL: URL?
    var workspaceURL: URL?
    var errorMessage: String?
    var statusMessage = "Sample film · explore the studio"
    var hasPendingQuestion: Bool { !isSample && snapshot.raw["ask"] != .null && snapshot.raw["ask"]["answered"] == .null }
    /// Where the open film stands right now, from live runtime and console state.
    var phase: FilmPhase {
        guard !isSample else { return .inProgress }
        guard runURL != nil else { return runtime.isPreparing || runtime.isRunning ? .starting : .draft }
        let status = snapshot.step(snapshot.currentStep)["status"].string
        if hasPendingQuestion { return .yourTurn("answer a question") }
        if snapshot.stage == .final, finalURL != nil, status == "done", !runtime.isPreparing { return .finished(loadedVideoDuration > 0 ? loadedVideoDuration : snapshot.duration(for: .final)) }
        if isConnected && snapshot.isFresh && !runtime.isRunning && !runtime.isPreparing { return .yourTurn("say what the film is about") }
        if isConnected && status == "awaiting" && !snapshot.hasSent(snapshot.currentStep) { return .yourTurn(FilmSummary.friendlyStep(snapshot.currentStep, in: snapshot)) }
        if runtime.isPreparing { return .starting }
        if runtime.isFrozen { return .paused }
        if runtime.isRunning { return .working }
        if runtime.stopRequested { return .paused }
        if let code = runtime.lastExitCode, code != 0 || runtime.recovery != nil { return .needsAttention }
        if !isConnected { return .offline }
        return .working
    }
    var phaseDuration: Double { loadedVideoDuration > 0 ? loadedVideoDuration : snapshot.duration(for: .final) }
    var currentFilmTitle: String {
        if let entry = settings.filmQueue.first(where: { $0.project == selectedProjectURL }) { return entry.name }
        // the film's own name (session.title, set by `console.mjs push --title`) before the folder's; the session's default "RasanAI" is no name
        if let name = specificFilmName { return name }
        if let url = selectedProjectURL, let project = localProjects.first(where: { $0.1 == url }) { return project.0.name }
        // the brief's brand, else the first words of its subject; never the app's own name
        let fields = snapshot.step("brief")["fields"]
        if let brand = fields["brand_name"].string?.trimmingCharacters(in: .whitespaces), !brand.isEmpty { return brand }
        if let subject = fields["subject"].string, !subject.isEmpty { return FilmTitle.fromBrief(subject) }
        return "Untitled film"
    }
    private var specificFilmName: String? {
        guard let title = snapshot.raw["title"].string?.trimmingCharacters(in: .whitespaces), !title.isEmpty,
              !["rasanai", "new film", "untitled film"].contains(title.lowercased()) else { return nil }
        return title
    }
    /// Home-card status for a library project: live for the open film, from disk for the rest.
    func summary(for folder: URL) -> FilmSummary {
        if let index = settings.filmQueue.firstIndex(where: { $0.project == folder }), settings.filmQueue[index].state != .running {
            var queued = summaries[folder] ?? .draft
            queued.phase = settings.filmQueue[index].state == .attention ? .needsAttention : .queued(index + 1)
            return queued
        }
        if loadedFilm == folder, !isSample {
            var live = summaries[folder] ?? .draft
            live.phase = phase
            live.detail = CallNotices.homeDetail(snapshot)
            live.stage = runURL == nil ? nil : snapshot.stage
            if runURL == nil { live.phase = activeDirectorProject == folder && (runtime.isRunning || runtime.isPreparing) ? .working : .draft }
            if case .finished(let seconds) = live.phase, seconds > 0 { live.duration = Int(seconds.rounded()) }
            return live
        }
        return summaries[folder] ?? .draft
    }
    var showNoteSheet: Bool { get { sheet == .note } set { present(newValue, .note) } }
    var showDecisions = false
    var directorMessage = ""
    /// Timed notes drafted on a finished film, kept per film so they survive navigating away.
    var filmNotes: [URL: [FilmNote]] = [:]
    var recentRuns: [String] = UserDefaults.standard.stringArray(forKey: "recentRuns") ?? []
    var finalPlayer: AVPlayer?
    var audioPlayer: AVPlayer?
    private var finalMediaURL: URL?
    private var audioMediaURL: URL?
    /// The live director session for the open film (native stage views read and write through it).
    var film: FilmSessionModel?
    private var generation = UUID()
    private var previousCurrentStep = ""
    private var loadedVideoDuration = 0.0
    private var sampleURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("RasanAIStudio/sample-session.json")
    }

    init(settings: StudioSettings = StudioSettings(), demo: Bool = false) {
        self.settings = settings
        isDemo = demo
        gallery = MomentGallery(autoload: !demo)
        // A checked-in resource guarantees a usable sample, without downloads or an agent account.
        snapshot = SessionSnapshot()
        isSample = false
        if demo { return }
        for index in settings.filmQueue.indices where settings.filmQueue[index].state == .running {
            settings.filmQueue[index].state = .attention
            settings.filmQueue[index].message = "Interrupted when the app closed. Resume the queue to continue the saved run."
        }
        TasteQuestions.installed = TasteQuestions.load(engine: DirectorRuntime.engineURL)
        migrateTemplatesIfNeeded()
        reloadSeries()
        reloadProjects()
        if settings.showWelcome { sheet = .welcome }
        runtime.onExit = { [weak self] code, stopped in
            guard let self else { return }
            self.queueHandlingExit = true
            Task { await self.handleQueueExit(code: code, stopped: stopped) }
            guard !stopped else { return }
            switch self.runtime.autoResumeDecision {
            case .resume(let delay):
                // The director stopped mid-film with nothing for the person to do: pick the run back up once, quietly.
                self.scheduleAutoResume(after: delay)
                return
            case .waitForLimit(let limit):
                // Claude's plan limit resets on its own: resume then, if the app is still open.
                if let resetsAt = limit.resetsAt { self.scheduleAutoResume(after: max(AutoResumePolicy.delay, resetsAt.timeIntervalSinceNow + 30), isLimit: true) }
                self.notify(title: "Your Claude plan's limit was reached", body: limit.message, id: "director-\(UUID().uuidString)")
                return
            case .none: break
            }
            self.notify(title: code == 0 && self.runtime.recovery == nil ? "Director finished" : "Director needs attention", body: "Open RasanAI Studio to review the result or log.", id: "director-\(UUID().uuidString)")
        }
        monitor.attach(self)
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
                let folders = projects.map(\.1)
                let loaded = await Task.detached { folders.map { ($0, FilmSummary.load(project: $0)) } }.value
                guard libraryGeneration == identity else { return }
                summaries = Dictionary(uniqueKeysWithValues: loaded)
                refreshDockBadge()
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

    /// Makes sure the film behind a Film page is loaded. Called when the page appears.
    func activateFilm(_ url: URL) {
        if loadedFilm == url { return }
        guard openFilm(url) else { path.removeAll { $0 == .film(url) } ; return }
    }
    func projectLibrary(for project: URL) -> ProjectLibrary {
        if let entry = settings.filmQueue.first(where: { $0.project == project }) { return ProjectLibrary(root: entry.libraryRoot) }
        if runtime.projectURL == project { return ProjectLibrary(root: project.deletingLastPathComponent()) }
        return settings.library
    }

    @discardableResult func openFilm(_ project: URL) -> Bool {
        // Opening the film the director is working on is not a switch: attach to its run. Refusing it showed
        // "stop the director before switching films" on the running film's own page and closed the page.
        if project.standardizedFileURL == runtime.projectURL?.standardizedFileURL, runtime.isRunning || runtime.isPreparing || runtime.isFinishing {
            selectedProjectURL = project
            if let run = runtime.runURL, runURL != run || loadedFilm != project { openRun(run, navigate: false) }
            return true
        }
        guard !isTransferringProject, !runtime.isRunning, !runtime.isPreparing, !runtime.isFinishing, !queueStarting, !queueHandlingExit, !isManagingProject, !isImportingSources, !isSavingFilm else {
            errorMessage = "Wait for file operations to finish and stop the director before switching films."; return false
        }
        selectedProjectURL = project
        showChanges = false
        UserDefaults.standard.set(project.path, forKey: "lastOpenedProject")
        UserDefaults.standard.set("project", forKey: "lastWorkspaceKind")
        let library = projectLibrary(for: project)
        isManagingProject = true
        Task { try? await Task.detached { try library.update(project, opened: true) }.value; isManagingProject = false; reloadProjects() }
        let identity = UUID(); runOpenGeneration = identity
        Task {
            let path = await Task.detached { try? String(contentsOf: project.appendingPathComponent(".rasanai/current"), encoding: .utf8) }.value
            guard runOpenGeneration == identity else { return }
            guard let path, path.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) != nil else {
                showDraft(project); return
            }
            openRun(project.appendingPathComponent(".rasanai/\(path)"))
        }
        return true
    }
    /// A film that was never started: no run, no console.
    private func showDraft(_ project: URL) {
        runtime.clearPresentation()
        resetConnection()
        snapshot = SessionSnapshot()
        runURL = nil; workspaceURL = nil
        isSample = false
        selectedProjectURL = project; filmDraftProject = project
        loadedFilm = project
        reloadSources()
    }
    func showFilm(_ target: URL) {
        if path.last != .film(target) { path = [.film(target)] }
    }
    func manageProject(_ folder: URL, action: String, name: String? = nil) {
        guard !isTransferringProject, !queueStarting, !queueHandlingExit, !isManagingProject, !isImportingSources, !isSavingFilm,
              !settings.filmQueue.contains(where: { $0.project == folder }),
              !((runtime.isRunning || runtime.isPreparing) && folder == activeDirectorProject) else {
            errorMessage = "Remove this film from the queue and wait for file operations to finish before changing it."; return
        }
        isManagingProject = true
        let library = settings.library
        let film = name ?? localProjects.first { $0.1 == folder }?.0.name ?? "the film"
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
                    if selectedProjectURL == folder { selectedProjectURL = nil; loadedFilm = nil }
                path.removeAll { $0 == .film(folder) }
                }
                if let newFolder {
                    showArchivedProjects = false; filmDraftProject = newFolder
                    if !runtime.isRunning && !runtime.isPreparing { selectedProjectURL = newFolder; reloadSources() }
                    path.append(.newFilm(newFolder))
                }
                reloadProjects()
                statusMessage = action == "trash" ? "Project moved to Trash · restore it using Finder" : "Project library updated"
                let done: String = switch action {
                case "rename": "Renamed to \(film)"
                case "duplicate": "Duplicated \(film)"
                case "archive": "Archived \(film) · Edit › Undo brings it back"
                case "unarchive": "Moved \(film) back to your films"
                default: "Moved \(film) to the Trash · restore it from Finder"
                }
                announce(done)
            } catch { errorMessage = error.localizedDescription }
        }
    }

    func newFilm(prefill: String = "", moments: [FilmMoment] = []) {
        guard !isSavingFilm else { return }
        newFilmPrefillMoments = moments
        if !runtime.isRunning && !runtime.isPreparing { runOpenGeneration = UUID() }
        filmDraftProject = nil
        newFilmPrefill = prefill
        if case .newFilm(nil)? = path.last { return }
        path = [.newFilm(nil)]
    }
    /// Opens the Get inspired page, optionally with one moment already picked (from a card on Home).
    func openGallery(selecting moment: Moment? = nil) {
        if let moment, !inspirePicks.contains(moment.id) { inspirePicks.toggle(moment) }
        if path.last != .inspire { path.append(.inspire) }
    }
    func openBrands() { if path.last != .brands { path.append(.brands) } }
    var libraryRoot: URL { URL(fileURLWithPath: settings.projectRoot, isDirectory: true) }
    func reloadSeries() { seriesList = SeriesLibrary.list(in: libraryRoot) }
    func openSeries(_ folder: URL? = nil) { path = folder.map { [.series, .seriesPage($0)] } ?? [.series] }
    func goHome() { path = [] }
    /// Settings is a page like the others: a sheet over the window (Readiness) steps aside, and the page replaces the
    /// current one through `path`, so it lands in the same back/forward history. The director is not touched.
    func openSettingsPage() {
        if sheet != nil { sheet = nil }
        if path != [.settings] { path = [.settings] }
    }
    func exploreSample() { loadSample(); if path.last != .sample { path = [.sample] } }
    func clearRecentRuns() {
        recentRuns = []; UserDefaults.standard.removeObject(forKey: "recentRuns")
        UserDefaults.standard.removeObject(forKey: "lastOpenedRun")
    }
    func restoreWorkspace() {
        guard !didRestoreWorkspace, !isDemo, replayRun == nil else { return }; didRestoreWorkspace = true
        if let index = CommandLine.arguments.firstIndex(of: "--run"), CommandLine.arguments.count > index + 1 {
            settings.showWelcome = false
            openRun(URL(fileURLWithPath: CommandLine.arguments[index + 1]))
        } else if settings.hasCompletedWelcome && settings.reopenLastProject && reopenFilmAtLaunch {
            if UserDefaults.standard.string(forKey: "lastWorkspaceKind") == "project",
               let path = UserDefaults.standard.string(forKey: "lastOpenedProject") { openFilm(URL(fileURLWithPath: path)) }
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
        guard !isTransferringProject, !queueStarting, !queueHandlingExit, !isImportingSources, !isManagingProject, !isSavingFilm, !settings.filmQueue.contains(where: { $0.project == project }) else { errorMessage = "Remove this film from the queue before changing its source files."; return false }
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
                announce(count == 0 ? "Those files are already attached" : "Added \(count) file\(count == 1 ? "" : "s") to \(project.lastPathComponent) · originals unchanged")
            } catch { errorMessage = error.localizedDescription }
        }
        return true
    }
    func trashSource(_ file: URL) {
        guard !isTransferringProject, let project = selectedProjectURL, !settings.filmQueue.contains(where: { $0.project == project }), !isImportingSources, !isManagingProject, !runtime.isRunning, !runtime.isPreparing else { return }
        isImportingSources = true
        Task {
            defer { isImportingSources = false }
            do {
                try await Task.detached { try ProjectSources.validate(file, in: project); try FileManager.default.trashItem(at: file, resultingItemURL: nil) }.value
                reloadSources(); statusMessage = "Project source copy moved to Trash · original unchanged"
            } catch { errorMessage = error.localizedDescription }
        }
    }

    func saveFilm(name: String, draft: FilmDraft, sources: [URL], existing: URL?, brand: Brand? = nil, start: Bool) async -> URL? {
        filmSourcesCopied = false
        let busy = runtime.isRunning || runtime.isPreparing
        if settings.filmQueue.contains(where: { $0.project == existing }) {
            errorMessage = "Remove this film from the queue before editing or starting it separately."; return nil
        }
        guard !isTransferringProject, !queueStarting, !queueHandlingExit, !isImportingSources, !isManagingProject, !isSavingFilm,
              !(busy && (start || existing == activeDirectorProject)) else {
            errorMessage = "Wait for file operations to finish. Save another draft while the director works; pause it before starting a second film or changing its active project."; return nil
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
                if let brand { try BrandLibrary.apply(brand, to: project) }
                if brand == nil, let ref = draft.series { try SeriesLibrary.applyLook(of: ref, to: project) }
                try draft.save(in: project)
            }.value
            filmSourcesCopied = true
            if !busy {
                selectedProjectURL = project
                if runURL == nil || loadedFilm != project { loadedFilm = nil }
                reloadSources()
                UserDefaults.standard.set(project.path, forKey: "lastOpenedProject")
                UserDefaults.standard.set("project", forKey: "lastWorkspaceKind")
            }
            reloadProjects()
            statusMessage = "Draft saved · start the film whenever you're ready"
            if start {
                settings.defaultAgent = draft.agent
                launchProject = project
                let files = try await Task.detached { try ProjectSources.files(in: project) }.value
                await startDirector(request: draft.request(sources: files), includeDirection: false)
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

    func openRun(_ url: URL, navigate: Bool = true) {
        guard replayRun == nil else { return }
        let run = url.lastPathComponent == "session.json" ? url.deletingLastPathComponent() : url
        guard (!runtime.isRunning && !runtime.isPreparing && !runtime.isFinishing && !queueStarting) || run == runtime.runURL else { errorMessage = "Stop the director before switching films."; return }
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
            selectedProjectURL = project.flatMap { (try? projectLibrary(for: $0).read($0)) != nil ? $0 : nil }
            reloadSources()
            isSample = false
            loadedFilm = selectedProjectURL ?? run
            if navigate { showFilm(loadedFilm ?? run) }
            stage = state.stage
            previousCurrentStep = state.currentStep
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

    /// Attaches to the open run's files (no server): a model that watches its folder and queues the person's actions.
    func connect() {
        guard let runURL, replayRun == nil else { return }
        film?.stop()
        let workspace = RunWorkspace.root(for: runURL)
        workspaceURL = workspace
        let model = FilmSessionModel(snapshot: snapshot, run: runURL, workspace: workspace)
        model.startedAt = runtime.startedAt
        model.onSnapshot = { [weak self, weak model] next in
            guard let self, let model, self.film === model else { return }
            self.ingest(next)
        }
        model.onConnection = { [weak self, weak model] connection in
            guard let self, let model, self.film === model else { return }
            let connected = connection == .live || connection == .polling
            if connected != self.isConnected {
                self.isConnected = connected
                if !connected { self.statusMessage = "This film's folder is not readable" }
            }
        }
        film = model
        statusMessage = "Opening the film's files…"
        model.start()
        configureMedia()
    }
    /// "Reload film": read the run's folder again from scratch.
    func reloadFilm() {
        guard runURL != nil else { return }
        connect()
    }

    func refresh() async { await film?.refresh() }

    /// Every new state from the console, whether it came over the stream or from polling.
    private func ingest(_ next: SessionSnapshot) {
        snapshot = next
        // A call that just became ready is news; the film that was already open when the app started is not.
        if !isSample, let notice = CallNotices.notice(from: noticeBaseline, to: next, film: currentFilmTitle) {
            notify(title: notice.title, body: notice.body, id: "\(notice.id)-\(runURL?.lastPathComponent ?? "film")")
        }
        noticeBaseline = next
        if next.raw["ask"]["answered"] == .null, let id = next.raw["ask"]["id"].string, id != presentedQuestionID {
            presentedQuestionID = id
            notify(title: "Your director has a question", body: "Open RasanAI Studio to answer and continue.", id: "question-\(id)")
        }
        isConnected = true
        if previousCurrentStep == "build", next.currentStep != "build", ["render", "final"].contains(next.currentStep) {
            // "Your film is built" is posted once per film by `ProgressNotifier`, keyed to the progress model's Build phase.
        }
        if previousCurrentStep != next.currentStep {
            setStage(next.stage)
            previousCurrentStep = next.currentStep
        }
        researchTimeBoxing.observe(store: self)
        playhead = min(playhead, duration)
        refreshDockBadge()
        statusMessage = next.workingMessage ?? (awaitingAgent ? "Sent to the director · waiting for an update" : "Connected to the local director")
        film?.startedAt = runtime.startedAt
        configureMedia()
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
        film = FilmSessionModel(fixture: snapshot)
        loadedFilm = nil
        stage = .animatic
        playhead = 26
        runURL = nil
        workspaceURL = nil
        selectedProjectURL = nil; reloadSources()
        statusMessage = "Sample film · no agent or audio attached"
    }
    /// How many films are waiting on a call or need attention: the Dock badge and the Home heading read it.
    var filmsNeedingYou: Int {
        guard !isDemo else { return 0 }
        let urls = Set(localProjects.filter { $0.0.archivedAt == nil }.map(\.1))
        var count = urls.filter { summary(for: $0).phase.callsForYou }.count
        if let loaded = loadedFilm, !urls.contains(loaded), !isSample, phase.callsForYou { count += 1 }
        return count
    }
    func refreshDockBadge() { NSApp?.dockTile.badgeLabel = DockBadge.label(waiting: filmsNeedingYou) }

    private func notify(title: String, body: String, id: String) {
        guard settings.notificationsEnabled, Bundle.main.bundleIdentifier != nil, !NSApp.isActive else { return }
        let content = UNMutableNotificationContent()
        content.title = title; content.body = body; content.sound = .default
        if let run = runtime.runURL ?? runURL { content.userInfo = ["runPath": run.path] }
        Task { try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil)) }
    }

    private func resetConnection() {
        generation = UUID()
        film?.stop()
        film = nil
        presentedQuestionID = nil
        noticeBaseline = nil
        refreshDockBadge()
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
        playhead = min(playhead, duration)
        seek(to: playhead)
    }

    func prepareQueueContext(project: URL) {
        runOpenGeneration = UUID()
        resetConnection()
        snapshot = SessionSnapshot()
        runURL = nil; workspaceURL = nil
        selectedProjectURL = project; loadedFilm = project
        launchProject = nil; showChanges = false; isSample = false
        reloadSources()
    }

    func startDirector(request: String, includeDirection: Bool = true) async {
        guard !isTransferringProject, !toolSetup.isRunning, !queueStarting, !queueHandlingExit else { errorMessage = "Wait for tool setup, project transfer or the queue to finish switching films."; return }
        guard let project = launchProject ?? selectedProjectURL ?? workspaceURL else { errorMessage = "Choose a project first."; return }
        var request = request
        let draft = FilmDraft.load(in: project)
        if includeDirection, let draft {
            request += "\n\n" + draft.creativeDirection(sources: (try? ProjectSources.files(in: project)) ?? []) + draft.linkedText
        }
        do {
            let resume = launchProject == nil ? runURL : nil
            let run = try await runtime.start(project: project, existingRun: resume, request: request, settings: settings,
                                              model: draft?.cliModel(settingsModel: settings.model(for: draft?.agent == "codex" ? .codex : .claude)))
            openRun(run)
            showChanges = false
        } catch {
            if let report = runtime.preflightReport, !report.canStart {
                preflightReport = report; preflightProject = project; preflightSources = []
                sheet = .preflight
            } else { errorMessage = error.localizedDescription }
        }
    }

    /// Asks once per agent, then remembers. `proceed` runs immediately when consent already exists.
    func ensureConsent(for agent: LocalAgent, proceed: @escaping () -> Void) {
        if settings.hasConsent(agent) { proceed() } else { pendingConsent = PendingConsent(agent: agent, proceed: proceed) }
    }
    func confirmConsent() {
        guard let pending = pendingConsent else { return }
        pendingConsent = nil
        settings.giveConsent(pending.agent)
        pending.proceed()
    }
    /// Freezes the director in place: nothing is stopped or redone, and Resume carries on mid-step.
    func pauseDirector() {
        cancelAutoResume()
        guard runtime.isRunning, !runtime.isFrozen else { return }
        if queuePausedBeforeFreeze == nil { queuePausedBeforeFreeze = queuePaused }
        queuePaused = true; queueMessage = "Queue paused with the director."
        sendCountAtFreeze = film?.sendCount
        runtime.freeze()
    }
    /// The film's send count when it was frozen: anything the person sends while paused (an answer, a note) needs the director awake to read it.
    @ObservationIgnored private var sendCountAtFreeze: Int?
    /// Called by the monitor's tick: the person sent something while the director was frozen, so carry on.
    func thawIfSentWhileFrozen() {
        guard runtime.isFrozen, let before = sendCountAtFreeze, let now = film?.sendCount, now > before else { return }
        resumeDirector()
    }
    /// Whether the queue was already paused when the director was frozen, so Resume restores it and not more.
    @ObservationIgnored private var queuePausedBeforeFreeze: Bool?
    var canPause: Bool { runtime.isRunning && !runtime.isFrozen }
    @ObservationIgnored private var autoResumeTask: Task<Void, Never>?
    /// Resumes the run that just stopped, once, unless the person got there first or did something else meanwhile.
    func scheduleAutoResume(after delay: TimeInterval, isLimit: Bool = false) {
        autoResumeTask?.cancel()
        guard let run = runtime.runURL else { return }
        autoResumeTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !Task.isCancelled, self.runtime.autoResume != nil, self.runtime.runURL == run,
                  !self.runtime.stopRequested, !self.runtime.isFrozen, self.canResume else { return }
            if !isLimit { self.runtime.lastAutoResume[run.path] = Date() }
            self.resumeDirector()
        }
    }
    /// After the Mac wakes, checks a pending automatic resume against the wall clock: due now means resume shortly, else wait only the time left.
    func handleWake() {
        guard let notice = runtime.autoResume, let due = notice.resumesAt, !runtime.isRunning, !runtime.isFrozen, !runtime.stopRequested, canResume else { return }
        let left = due.timeIntervalSinceNow + (notice.isLimit ? 30 : 0)
        scheduleAutoResume(after: max(AutoResumePolicy.delay, left), isLimit: notice.isLimit)
    }
    /// Resume now (the button), or Pause: either way the pending automatic resume is dropped.
    func cancelAutoResume() { autoResumeTask?.cancel(); autoResumeTask = nil }
    func resumeDirector() {
        cancelAutoResume()
        if runtime.isFrozen {
            runtime.thaw()
            if let before = queuePausedBeforeFreeze { queuePaused = before; if !before { queueMessage = "Directing the current film." } }
            queuePausedBeforeFreeze = nil; sendCountAtFreeze = nil
            monitor.noteResumed()
            return
        }
        queuePausedBeforeFreeze = nil
        if settings.filmQueue.contains(where: { $0.project == selectedProjectURL }) { resumeQueue(); return }
        guard !runtime.isRunning, !runtime.isPreparing, !isSavingFilm, !isManagingProject, !isImportingSources, runURL != nil else { return }
        ensureConsent(for: settings.agent) { [self] in
            launchProject = nil
            Task { await startDirector(request: "Resume this existing run from its saved state. Preserve completed work and continue with the next pending step.") }
        }
    }
    var canResume: Bool { !toolSetup.isRunning && !isTransferringProject && !queueStarting && !queueHandlingExit && !isSample && runURL != nil && (!runtime.isRunning || runtime.isFrozen) && !runtime.isPreparing && !isSavingFilm && !isManagingProject && !isImportingSources }

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
        guard let film, isConnected, !isSending else { return }
        let identity = generation
        let step = explicitStep ?? reviewStep
        isSending = true
        defer { if generation == identity { isSending = false } }
        if await film.send(step: step, type: type, value: value, note: note) {
            guard generation == identity else { return }
            statusMessage = "Sent to the director"
        } else if generation == identity { errorMessage = film.lastError }
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

    func exportVideo(source: URL? = nil, captions: URL? = nil) {
        guard let video = source ?? displayedVideo else { return }
        exportSource = video
        exportCaptions = captions ?? (isBrowsingAnotherFilm ? browsedFilm?.captions : asset(snapshot.captionFile))
        sheet = .export
    }

    func requestFilmRevision(_ text: String, onSent: (() -> Void)? = nil) {
        let request = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !request.isEmpty else { return }
        performFilmRequest("Revise this existing film: \(request). Preserve the rest of the film and publish a new version with a list of changes.", action: "note", value: .null, note: request, onSent: onSent)
    }
    func restoreFilmVersion(_ version: FilmVersion) {
        performFilmRequest("Restore version \(version.id) of this existing film using its saved artifacts. Preserve the other versions and publish the restored result through the film files.", action: "version", value: .object(["restore": version.number]), note: "")
    }
    private func performFilmRequest(_ request: String, action: String, value: JSONValue, note: String, onSent: (() -> Void)? = nil) {
        guard !queueStarting, !queueHandlingExit, !isBrowsingAnotherFilm, !isSending, !runtime.isPreparing, !isSavingFilm, runURL != nil else { return }
        if !runtime.isRunning, settings.filmQueue.contains(where: { $0.project == selectedProjectURL }) {
            errorMessage = "Resume this film through the queue, or remove it from the queue before requesting a revision."; return
        }
        ensureConsent(for: settings.agent) { [self] in
            showChanges = true
            Task {
                if runtime.isRunning {
                    guard isConnected else { errorMessage = "This film's folder is not readable. Reopen the film before sending changes."; return }
                    await send(type: action, value: value, note: note, step: snapshot.actionStep(for: .final))
                    if errorMessage == nil && action == "note" { directorMessage = ""; onSent?() }
                } else {
                    launchProject = nil
                    await startDirector(request: request)
                    showChanges = true
                    if runtime.isRunning && action == "note" { directorMessage = ""; onSent?() }
                }
            }
        }
    }
}
