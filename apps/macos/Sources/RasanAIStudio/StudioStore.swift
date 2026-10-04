import AppKit
import AVKit
import Observation
import StudioCore
import UniformTypeIdentifiers

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
    let settings = StudioSettings()
    let runtime = DirectorRuntime()
    var consoleAddress: ConsoleAddress?
    var useFullConsole = true
    var showDirectorSheet = false
    var showDirectorLog = false
    var showQuestion = false
    private var presentedQuestionID: String?
    var launchProject: URL?
    var localProjects: [(LocalProject, URL)] = []
    var isLoadingProjects = false
    private var libraryGeneration = UUID()
    var showNewProject = false
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
    var showNoteSheet = false
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
        let bundled = Bundle.module.url(forResource: "sample-session", withExtension: "json")!
        snapshot = try! SessionSnapshot(data: Data(contentsOf: bundled))
        loadSample()
        reloadProjects()
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
        Task {
            let path = await Task.detached { try? String(contentsOf: project.appendingPathComponent(".rasanai/current"), encoding: .utf8) }.value
            guard let path, path.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) != nil else {
                launchProject = project; showDirectorSheet = true; return
            }
            openRun(project.appendingPathComponent(".rasanai/\(path)"))
        }
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
        do {
            let state = try SessionSnapshot(data: Data(contentsOf: run.appendingPathComponent("session.json")))
            resetConnection()
            snapshot = state
            runURL = run
            workspaceURL = run
            isSample = false
            stage = state.stage
            previousCurrentStep = state.currentStep
            section = .scenes
            playhead = 0
            recentRuns = [run.path] + recentRuns.filter { $0 != run.path }
            recentRuns = Array(recentRuns.prefix(8))
            UserDefaults.standard.set(recentRuns, forKey: "recentRuns")
            connect()
        } catch { errorMessage = error.localizedDescription }
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
        resetConnection()
        let bundled = Bundle.module.url(forResource: "sample-session", withExtension: "json")!
        let data = !reset ? (try? Data(contentsOf: sampleURL)) : nil
        snapshot = (data.flatMap { try? SessionSnapshot(data: $0) }) ?? (try! SessionSnapshot(data: Data(contentsOf: bundled)))
        isSample = true
        stage = .animatic
        section = .scenes
        playhead = 26
        runURL = nil
        workspaceURL = nil
        statusMessage = "Sample film · no agent or audio attached"
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
