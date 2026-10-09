import Foundation
import Observation
import StudioCore

/// The live director session for the film on screen, read from the run folder's files and written back to them.
///
/// There is no console server. `console.mjs` (headless) rewrites `session.json` atomically; this model watches the run
/// folder (`RunTransport.changes()`, debounced, with a slow heartbeat), re-reads the session safely (a missing or
/// half-written file keeps the last good state) and shows it. Everything the person does goes through
/// `send(step:type:value:note:)`, which validates the action and appends one JSON line to `actions.jsonl` under the lock
/// shared with `console.mjs`. Until the director's `wait` consumes it (`consumed.json`) the action is shown as sent:
/// the "sent" banner, the note, the answered question (`SessionOverlay`). `console.mjs` is the only writer of `session.json`.
/// - Files named in payloads are read from disk through `fileURL(_:)` (`AssetResolver`).
///
/// One model per film connection. Stage views take `init(model:step:)` and read the accessors below.
@MainActor @Observable
final class FilmSessionModel {
    /// `live` once `session.json` has been read; `offline` when the run folder or its session is gone. (`connecting` and
    /// `polling` are kept for source compatibility; the file transport has no stream to lose.)
    enum Connection: Equatable { case connecting, live, polling, offline }

    // MARK: State

    private(set) var snapshot: SessionSnapshot
    private(set) var connection: Connection = .connecting
    /// True while an action is being written to the run's action queue.
    private(set) var isSending = false
    /// Set when the last action failed; cleared by the next successful one or `dismissError()`.
    private(set) var lastError: String?
    /// `step|type` of the last accepted action, for brief "sent" confirmations.
    private(set) var lastSent: String?
    /// Counts accepted actions, so a view can clear its draft only once a send really went through.
    private(set) var sendCount = 0
    /// A completed step pinned from the stage bar and shown read-only. `nil` follows the director.
    private(set) var viewingStep: String?
    /// When the director started working, for the elapsed clock. Set by the store from the runtime.
    var startedAt: Date?

    // Shared UI state, so any view (a decision row, a stage, a menu) can open the same popover or inspector.
    var tellPresented = false
    var tellStep: String?
    var tellText = ""
    var decisionsPresented = false
    /// Ask ids whose sheet the person dismissed; the inline card stays until it is answered.
    var dismissedAsks: Set<String> = []

    /// Called after every snapshot, so the store can keep its own phase and badge in step.
    var onSnapshot: ((SessionSnapshot) -> Void)?
    var onConnection: ((Connection) -> Void)?

    private var resolver: AssetResolver?
    private let transport: RunTransport?
    private var watchTask: Task<Void, Never>?
    /// The last `session.json` bytes and queued action ids shown, so an unchanged folder event costs nothing.
    private var lastData: Data?
    private var lastQueued: [String] = []
    /// Ids of the actions this model sent, to report one the director refused.
    private var sentIDs: Set<String> = []
    private var reportedRejections: Set<String> = []
    /// Fixture and sample models never read or write a run folder.
    let isFixture: Bool
    /// Actions a fixture model received, newest last (for tests and the sample).
    private(set) var fixtureLog: [(step: String, type: String, value: JSONValue, note: String)] = []

    init(snapshot: SessionSnapshot, run: URL, workspace: URL) {
        self.snapshot = snapshot
        self.resolver = AssetResolver(run: run, workspace: workspace)
        self.transport = RunTransport(run: run)
        self.isFixture = false
    }

    /// A model over a fixed snapshot, for the sample film, tests and the snapshot harness.
    init(fixture snapshot: SessionSnapshot, run: URL? = nil, workspace: URL? = nil) {
        self.snapshot = snapshot
        self.resolver = run.map { AssetResolver(run: $0, workspace: workspace ?? $0) }
        self.transport = nil
        self.isFixture = true
        self.connection = .live
    }

    // MARK: Connection

    func start() {
        guard !isFixture, watchTask == nil, let transport else { return }
        watchTask = Task { [weak self] in
            for await _ in transport.changes() {
                if Task.isCancelled { break }
                await self?.reload()
            }
        }
    }

    func stop() {
        watchTask?.cancel(); watchTask = nil
    }

    /// Read the run folder once, now (after an action, or when the app returns to the foreground).
    func refresh() async { await reload() }

    private struct Reading: Sendable {
        var session: (data: Data, snapshot: SessionSnapshot)?
        var queued: [QueuedAction]
        var rejected: [RejectedAction]
        var runExists: Bool
    }

    private func reload() async {
        guard let transport else { return }
        let reading = await Task.detached(priority: .userInitiated) { () -> Reading in
            Reading(session: transport.readSessionData(), queued: transport.pending(), rejected: transport.rejections(),
                    runExists: FileManager.default.fileExists(atPath: transport.sessionURL.path))
        }.value
        if Task.isCancelled { return }
        guard let session = reading.session else {
            // A half-written session keeps the last good state; only a vanished file means the run is gone.
            if !reading.runExists { setConnection(.offline) }
            return
        }
        setConnection(.live)
        for refused in reading.rejected where sentIDs.contains(refused.id) && reportedRejections.insert(refused.id).inserted {
            lastError = "The director could not use that answer: \(refused.error)."
        }
        let ids = reading.queued.map(\.id)
        guard session.data != lastData || ids != lastQueued else { return }
        lastData = session.data; lastQueued = ids
        apply(SessionOverlay.apply(reading.queued, to: session.snapshot))
    }

    private func setConnection(_ next: Connection) {
        guard connection != next else { return }
        connection = next
        onConnection?(next)
    }

    private func apply(_ next: SessionSnapshot) {
        // An older state (a slow read finishing late) must not overwrite a newer one.
        if let incoming = next.raw["updated"].string, let current = snapshot.raw["updated"].string, incoming < current { return }
        let previous = snapshot.currentStep
        snapshot = next
        // The director moved on: a pinned past stage is no longer the thing to look at.
        if viewingStep != nil, previous != next.currentStep { viewingStep = nil }
        onSnapshot?(next)
    }

    /// Replace the snapshot directly (fixtures and previews).
    func setFixture(_ next: SessionSnapshot) { apply(next) }

    // MARK: Actions

    /// Queues an action for the director (one line appended to `actions.jsonl`). Returns true when it was written.
    @discardableResult
    func send(step: String, type: String, value: JSONValue = .null, note: String = "") async -> Bool {
        guard !isSending else { return false }
        if isFixture {
            fixtureLog.append((step, type, value, note))
            lastSent = "\(step)|\(type)"; sendCount += 1
            return true
        }
        guard let transport else { lastError = StudioError.noConnection.localizedDescription; return false }
        isSending = true
        defer { isSending = false }
        do {
            let queued = try await Task.detached { try transport.append(step: step, type: type, value: value, note: note) }.value
            sentIDs.insert(queued.id)
            lastError = nil
            lastSent = "\(step)|\(type)"; sendCount += 1
            await reload()
            return true
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    func dismissError() { lastError = nil }

    /// "You decide this step": Claude makes this call.
    @discardableResult func decide(step: String, note: String = "") async -> Bool { await send(step: step, type: "decide", note: note) }
    /// "Just make it": Claude decides every remaining call and stops only at the final.
    @discardableResult func justMakeIt() async -> Bool { await send(step: "*", type: "decide-rest") }
    /// Answers Claude's question.
    func answer(_ ask: DirectorAsk, choice: String?, text: String) async -> Bool {
        await send(step: ask.step, type: "answer", value: .object(["ask": .string(ask.id), "choice": choice.map(JSONValue.string) ?? .null, "text": .string(text)]), note: text)
    }
    /// Sends a note to a step's discussion (Tell Claude).
    func tell(_ text: String, step: String? = nil) async -> Bool {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return false }
        return await send(step: step ?? shownStep, type: "note", note: text)
    }
    /// Opens Tell Claude on a step, optionally with text already in the box.
    func beginTell(step: String? = nil, prefill: String = "") {
        tellStep = step ?? shownStep
        if !prefill.isEmpty || tellText.isEmpty { tellText = prefill }
        tellPresented = true
    }

    // MARK: Files

    /// A payload path (workspace-relative or absolute) as a local file, or nil when it isn't one of this film's files.
    func fileURL(_ path: String?) -> URL? { resolver?.resolve(path) }

    // MARK: Reading the session

    var title: String { snapshot.title }
    var currentStep: String { snapshot.currentStep }
    /// The step on screen: a pinned past step, else the director's current one.
    var shownStep: String { viewingStep ?? snapshot.currentStep }
    var isViewingPast: Bool { viewingStep != nil }
    var viewingStage: ReviewStage? { viewingStep.map { ReviewStage.consoleStep($0) } }
    var route: StageRoute { StageRouter.route(snapshot, viewing: viewingStep) }
    var isConnected: Bool { connection == .live || connection == .polling }

    func payload(_ step: String) -> JSONValue { snapshot.step(step) }
    func status(_ step: String) -> String? { snapshot.step(step)["status"].string }
    /// The payload of the step on screen.
    var shownPayload: JSONValue { payload(route.step ?? shownStep) }
    var activity: [ActivityItem] { snapshot.activityFeed }
    var workingMessage: String? { snapshot.workingMessage }
    var ask: DirectorAsk? { snapshot.ask }
    var decisions: [DecisionRow] { snapshot.decisions }
    func thread(for step: String) -> [ThreadMessage] { snapshot.thread(for: step) }
    var conversation: [ThreadMessage] { snapshot.conversation }
    /// Open (unapplied) notes, optionally for one step.
    func comments(step: String? = nil) -> [ReviewNote] { snapshot.openNotes(step: step) }
    var isDecideRest: Bool { snapshot.isDecideRest }
    var isDone: Bool { snapshot.isFinalDone }
    var isWaitingOnUser: Bool { snapshot.isWaitingOnUser }
    func isReplyPending(for step: String) -> Bool { snapshot.isReplyPending(for: step) }
    /// A hint that the person has answered this step and Claude is processing it.
    func hasSent(_ step: String) -> Bool { snapshot.hasSent(step) }

    /// The person can act on this step now: it is the director's current, awaiting step, not a pinned past one.
    func canAct(on step: String) -> Bool {
        guard !isViewingPast && isConnected && !isSending && snapshot.currentStep == step && !hasSent(step) else { return false }
        if step == "brief" && snapshot.isFresh { return true }
        // A delivered film (Final "done") still takes notes, Apply and versions, as the web console did.
        return status(step) == "awaiting" || (["render", "final"].contains(step) && status(step) == "done")
    }

    /// The bottom action bar shows only when it is the person's move on this step, while looking back, or just after sending.
    func showsActions(for step: String) -> Bool {
        isViewingPast || isSending || canAct(on: step) || (hasSent(step) && status(step) != "done")
    }

    // MARK: Stage bar

    /// A stage can be opened read-only once the film is past it (or finished) and it has something to show.
    func canView(_ stage: ReviewStage) -> Bool {
        guard StageRouter.pinStep(for: stage, in: snapshot) != nil else { return false }
        let all = ReviewStage.allCases
        let past = (all.firstIndex(of: stage) ?? 0) < (all.firstIndex(of: snapshot.stage) ?? 0)
        return past || isDone || isFixture
    }

    /// Show a completed stage read-only. Selecting the live stage returns to following the director.
    func view(_ stage: ReviewStage) {
        if stage == snapshot.stage { viewingStep = nil; return }
        guard let step = StageRouter.pinStep(for: stage, in: snapshot) else { return }
        viewingStep = step
    }
    func returnToLive() { viewingStep = nil }
}
