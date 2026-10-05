import AppKit
import StudioCore
import SwiftUI

struct QueuedFilm: Codable, Identifiable, Equatable {
    enum State: String, Codable { case waiting, running, attention }
    var id = UUID()
    let project: URL
    let libraryRoot: URL
    var name: String
    var draft: FilmDraft
    let model: String
    let unrestrictedTools: Bool
    var run: URL?
    var state: State = .waiting
    var message: String?
}

extension StudioStore {
    func enqueueFilm(_ project: URL, name: String, draft: FilmDraft) {
        guard !settings.filmQueue.contains(where: { $0.project == project }) else { errorMessage = "This film is already queued."; return }
        guard (try? String(contentsOf: project.appendingPathComponent(".rasanai/current"), encoding: .utf8)) == nil else {
            errorMessage = "This film already has a run. Open it and use Resume Director, or duplicate its draft to queue a new film."; return
        }
        let agent = LocalAgent(rawValue: draft.agent) ?? .claude
        settings.filmQueue.append(QueuedFilm(project: project, libraryRoot: URL(fileURLWithPath: settings.projectRoot), name: name,
                                               draft: draft, model: settings.model(for: agent), unrestrictedTools: settings.allowUnrestrictedTools))
        if settings.filmQueue.count == 1 {
            queuePaused = false
            queueMessage = "The next film starts when the director is free."
        }
        Task { await startNextQueuedFilm() }
    }

    func resumeQueue() {
        guard let first = settings.filmQueue.first, let agent = LocalAgent(rawValue: first.draft.agent) else { return }
        ensureConsent(for: agent) { [self] in
            queuePaused = false
            queueMessage = runtime.isRunning ? "Waiting for the running film to finish." : "Starting the next film…"
            Task { await startNextQueuedFilm() }
        }
    }

    func pauseQueue() {
        queuePaused = true
        queueMessage = "Queue paused. The current film can keep running."
    }

    func moveQueuedFilm(_ id: UUID, by offset: Int) {
        guard !queueStarting, let index = settings.filmQueue.firstIndex(where: { $0.id == id }),
              settings.filmQueue[index].state == .waiting else { return }
        let target = index + offset
        guard settings.filmQueue.indices.contains(target), settings.filmQueue[target].state == .waiting else { return }
        settings.filmQueue.swapAt(index, target)
    }

    /// Moves waiting films only (drag to reorder); running and attention entries stay put.
    func moveWaitingFilms(from source: IndexSet, to destination: Int) {
        guard !queueStarting else { return }
        let queue = settings.filmQueue
        let waiting = queue.indices.filter { queue[$0].state == .waiting }
        guard let first = waiting.first, waiting.count > 1 else { return }
        // List offsets are in whole-queue space; translate to the waiting block.
        let blockSource = IndexSet(source.compactMap { waiting.contains($0) ? $0 - first : nil })
        guard !blockSource.isEmpty else { return }
        var block = waiting.map { queue[$0] }
        block.move(fromOffsets: blockSource, toOffset: min(max(destination - first, 0), block.count))
        var next = queue
        for (slot, index) in waiting.enumerated() { next[index] = block[slot] }
        settings.filmQueue = next
    }

    func updateQueuedDraft(project: URL, name: String, draft: FilmDraft) {
        guard let index = settings.filmQueue.firstIndex(where: { $0.project == project }),
              settings.filmQueue[index].state == .waiting else { return }
        settings.filmQueue[index].name = name
        settings.filmQueue[index].draft = draft
    }

    func isWaitingInQueue(_ project: URL) -> Bool {
        settings.filmQueue.contains { $0.project == project && $0.state == .waiting }
    }

    func removeQueuedFilm(_ id: UUID) {
        guard !queueStarting, let entry = settings.filmQueue.first(where: { $0.id == id }), entry.state != .running else { return }
        settings.filmQueue.removeAll { $0.id == id }
        // Removing a blocked item never implicitly starts paid generation.
        if settings.filmQueue.isEmpty { queuePaused = true; queueMessage = "Queue is empty." }
    }

    func cancelQueuedFilm() {
        queuePaused = true
        queueMessage = "Queue paused. The stopped film and its run will be kept."
        runtime.stop()
    }

    func startNextQueuedFilm() async {
        guard !isDemo, !queuePaused, !queueStarting, !queueHandlingExit, !runtime.isRunning, !runtime.isPreparing, !runtime.isFinishing,
              !toolSetup.isRunning, !isTransferringProject, !isSavingFilm, !isManagingProject, !isImportingSources, !isSending, let entry = settings.filmQueue.first, entry.state != .running else { return }
        guard let agent = LocalAgent(rawValue: entry.draft.agent), agent != .custom, settings.hasConsent(agent) else {
            queuePaused = true; queueMessage = "Resume the queue to confirm use of this director account."; return
        }
        queueStarting = true
        defer { queueStarting = false }
        do {
            let library = ProjectLibrary(root: entry.libraryRoot)
            let files = try await Task.detached {
                _ = try library.read(entry.project)
                return try ProjectSources.files(in: entry.project)
            }.value
            guard !queuePaused else { return }
            runtime.clearPresentation()
            prepareQueueContext(project: entry.project)
            settings.filmQueue[0].state = .running
            settings.filmQueue[0].message = nil
            queueMessage = "Directing \(entry.name)."
            var savedRun = entry.run
            if savedRun == nil, entry.state == .attention,
               let current = try? String(contentsOf: entry.project.appendingPathComponent(".rasanai/current"), encoding: .utf8),
               current.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) != nil {
                savedRun = entry.project.appendingPathComponent(".rasanai/\(current)")
            }
            let request = savedRun == nil ? entry.draft.request(sources: files)
                : "Resume this existing run from its saved state. Preserve completed work and continue with the next pending step.\n\n" + entry.draft.creativeDirection(sources: files)
            let run = try await runtime.start(project: entry.project, existingRun: savedRun, request: request, settings: settings,
                                             agent: agent, model: entry.draft.cliModel(settingsModel: entry.model), unrestrictedTools: entry.unrestrictedTools && settings.allowUnrestrictedTools)
            if let index = settings.filmQueue.firstIndex(where: { $0.id == entry.id }) { settings.filmQueue[index].run = run }
            openRun(run, navigate: false)
            if queuePaused { runtime.stop() }
        } catch {
            queuePaused = true
            queueMessage = "Queue needs attention: \(error.localizedDescription)"
            if let index = settings.filmQueue.firstIndex(where: { $0.id == entry.id }) {
                settings.filmQueue[index].state = .attention
                settings.filmQueue[index].message = error.localizedDescription
                // Setup may have created a run before a later prerequisite failed.
                if let current = try? String(contentsOf: entry.project.appendingPathComponent(".rasanai/current"), encoding: .utf8),
                   current.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) != nil {
                    settings.filmQueue[index].run = entry.project.appendingPathComponent(".rasanai/\(current)")
                }
            }
        }
    }

    func handleQueueExit(code: Int32, stopped: Bool) async {
        let run = runtime.runURL
        let project = runtime.projectURL
        let queuedID = settings.filmQueue.first(where: { $0.project == project && $0.state == .running })?.id
        let complete: Bool
        if let run, let project, code == 0, !stopped {
            complete = await Task.detached {
                guard let state = try? SessionSnapshot(data: Data(contentsOf: run.appendingPathComponent("session.json"))) else { return false }
                let status = state.final["status"].string
                return state.stage == .final && status == "done" && AssetResolver(run: run, workspace: project).resolve(state.finalVideo) != nil
                    && !(state.raw["ask"] != .null && state.raw["ask"]["answered"] == .null)
            }.value
        } else { complete = false }
        if let id = queuedID, let index = settings.filmQueue.firstIndex(where: { $0.id == id }) {
            if complete { settings.filmQueue.remove(at: index) }
            else {
                settings.filmQueue[index].state = .attention
                settings.filmQueue[index].message = stopped ? "Stopped. Resume the queue to continue this saved run." : code == 0
                    ? "The director exited before publishing a finished film. Open the film to review, then resume the queue."
                    : "The director exited with code \(code). Open the log, resolve the problem, then resume the queue."
            }
        }
        if !complete, !settings.filmQueue.isEmpty {
            queuePaused = true
            queueMessage = stopped ? "Queue paused with the director." : "Queue paused: the current film needs attention."
        }
        queueHandlingExit = false
        reloadProjects()
        if complete {
            queueMessage = settings.filmQueue.isEmpty ? "All queued films finished." : "Finished. Starting the next queued film…"
            await startNextQueuedFilm()
        }
    }
}

struct FilmQueueView: View {
    @Bindable var store: StudioStore
    private var queue: [QueuedFilm] { store.settings.filmQueue }

    var body: some View {
        VStack(spacing: 0) {
            header.padding(.horizontal, 32).padding(.top, 28).padding(.bottom, 14)
            if queue.isEmpty {
                ContentUnavailableView("No films queued", systemImage: "list.number",
                                       description: Text("Choose Start when free or Add to queue in a new film’s editor."))
                    .frame(maxHeight: .infinity)
            } else {
                List {
                    ForEach(Array(queue.enumerated()), id: \.element.id) { index, entry in
                        row(index, entry)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 5, leading: 32, bottom: 5, trailing: 32))
                            .listRowBackground(Color.clear)
                            .moveDisabled(entry.state != .waiting)
                    }
                    .onMove { store.moveWaitingFilms(from: $0, to: $1) }
                }
                .listStyle(.plain).scrollContentBackground(.hidden)
                .animation(.snappy, value: queue.map(\.id))
                .disabled(store.queueStarting)
            }
        }
        .frame(maxWidth: 940).frame(maxWidth: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle("Queue")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Film queue").font(.system(size: 28, weight: .semibold))
                    Text(store.queueMessage).font(.system(size: 13)).foregroundStyle(.secondary)
                }
                Spacer()
                if !queue.isEmpty {
                    Button(store.queuePaused ? "Resume queue" : "Pause queue") { if store.queuePaused { store.resumeQueue() } else { store.pauseQueue() } }
                        .buttonStyle(.borderedProminent).disabled(store.queueStarting || store.queueHandlingExit)
                }
            }
            Text("Films run one at a time. Drag waiting films to reorder them. Review steps wait for you; failures pause the queue. Keep the app open. After relaunch, resume when ready.")
                .font(.system(size: 12)).foregroundStyle(.secondary)
        }
    }

    private func row(_ index: Int, _ entry: QueuedFilm) -> some View {
        let waiting = entry.state == .waiting
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: waiting ? "line.3.horizontal" : "circle.fill")
                    .font(.system(size: waiting ? 12 : 6, weight: .medium)).foregroundStyle(waiting ? Color(nsColor: .tertiaryLabelColor) : (entry.state == .attention ? Color.orange : Color.rasan))
                    .frame(width: 16).help(waiting ? "Drag to reorder" : "")
                Text("\(index + 1)").font(.system(size: 17, weight: .medium, design: .rounded)).foregroundStyle(.secondary).frame(width: 22)
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.name).font(.headline).lineLimit(1)
                    Text(entry.state == .running ? store.phase.homeLine : entry.state == .attention ? "Needs attention" : "Waiting")
                        .font(.system(size: 12)).foregroundStyle(entry.state == .attention ? Color.orange : .secondary)
                }
                Spacer(minLength: 12)
                Button("Readiness") { store.showPreflight(project: entry.project) }
                Button("Open") { store.showFilm(entry.project) }
                if entry.state == .running {
                    Button("Stop film") { store.cancelQueuedFilm() }.disabled(store.runtime.isPreparing)
                } else {
                    if waiting { Button("Edit") { store.path.append(.newFilm(entry.project)) } }
                    Button { withAnimation(.snappy) { store.moveQueuedFilm(entry.id, by: -1) } } label: { Image(systemName: "arrow.up") }.help("Move earlier")
                        .accessibilityLabel("Move earlier")
                        .disabled(!waiting || index == 0 || queue[index - 1].state != .waiting)
                    Button { withAnimation(.snappy) { store.moveQueuedFilm(entry.id, by: 1) } } label: { Image(systemName: "arrow.down") }.help("Move later")
                        .accessibilityLabel("Move later")
                        .disabled(!waiting || index + 1 >= queue.count || queue[index + 1].state != .waiting)
                    Button("Remove") { withAnimation(.snappy) { store.removeQueuedFilm(entry.id) } }
                }
            }
            Text("\(entry.draft.duration) seconds · \(entry.draft.aspect) · \(LocalAgent(rawValue: entry.draft.agent)?.title ?? entry.draft.agent)")
                .font(.system(size: 12)).foregroundStyle(.secondary).padding(.leading, 66)
            if let message = entry.message { Text(message).font(.system(size: 12)).foregroundStyle(.secondary).padding(.leading, 66) }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 0.5))
    }
}
