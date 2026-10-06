import Foundation
import Observation
import StudioCore

/// The live director session for the film on screen, read from the console and written back through it.
///
/// - State arrives over the console's server-sent events (`/api/events`, heartbeat every 15 s). A silent stream
///   (40 s), a dropped connection or a restarted console reconnects with backoff, re-reading `address.json`, and
///   polls `api/state` every second until the stream is back.
/// - Everything the person does goes through `send(step:type:value:note:)` (the console's authenticated
///   `POST /api/action`). The app never writes `session.json` or `actions.jsonl` itself.
/// - Files named in payloads are read from disk through `fileURL(_:)` (`AssetResolver`), never over HTTP.
///
/// One model per film connection. Stage views take `init(model:step:)` and read the accessors below.
@MainActor @Observable
final class FilmSessionModel {
    enum Connection: Equatable { case connecting, live, polling, offline }

    // MARK: State

    private(set) var snapshot: SessionSnapshot
    private(set) var connection: Connection = .connecting
    /// True while an action is in flight to the console.
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
    private var client: ConsoleClient?
    private let addressProvider: (@Sendable () -> ConsoleAddress?)?
    private var streamTask: Task<Void, Never>?
    private var lastSeen = Date()
    /// Fixture and sample models never talk to a console.
    let isFixture: Bool
    /// Actions a fixture model received, newest last (for tests and the sample).
    private(set) var fixtureLog: [(step: String, type: String, value: JSONValue, note: String)] = []

    init(snapshot: SessionSnapshot, run: URL, workspace: URL, address: ConsoleAddress, addressProvider: (@Sendable () -> ConsoleAddress?)? = nil) {
        self.snapshot = snapshot
        self.resolver = AssetResolver(run: run, workspace: workspace)
        self.client = ConsoleClient(address: address)
        self.addressProvider = addressProvider
        self.isFixture = false
    }

    /// A model over a fixed snapshot, for the sample film, tests and the snapshot harness.
    init(fixture snapshot: SessionSnapshot, run: URL? = nil, workspace: URL? = nil) {
        self.snapshot = snapshot
        self.resolver = run.map { AssetResolver(run: $0, workspace: workspace ?? $0) }
        self.addressProvider = nil
        self.isFixture = true
        self.connection = .live
    }

    // MARK: Connection

    func start() {
        guard !isFixture, streamTask == nil else { return }
        streamTask = Task { [weak self] in await self?.run() }
    }

    func stop() {
        streamTask?.cancel(); streamTask = nil
    }

    /// Fetch the state once, now (after an action, or when the app returns to the foreground).
    func refresh() async {
        guard let client else { return }
        if let next = try? await client.state() { apply(next); setConnection(connection == .live ? .live : .polling) }
    }

    private func run() async {
        var delay = 1.0
        while !Task.isCancelled {
            guard let client else { break }
            lastSeen = Date()
            let healthy = await consume(client)
            if Task.isCancelled { break }
            if healthy { delay = 1 }
            // The console may have restarted on a new port or token: look again before retrying.
            if let address = addressProvider?(), address.port != client.address.port || address.token != client.address.token {
                self.client = ConsoleClient(address: address)
                resolver = resolver.map { AssetResolver(run: $0.run, workspace: address.root) }
            }
            // Poll every second while waiting out the backoff, so the screen never goes stale.
            let deadline = Date().addingTimeInterval(delay)
            while !Task.isCancelled && Date() < deadline {
                if let current = self.client {
                    do { apply(try await current.state()); setConnection(.polling) }
                    catch { setConnection(.offline) }
                }
                try? await Task.sleep(for: .seconds(1))
            }
            delay = min(delay * 2, 8)
        }
    }

    private final class Flag: @unchecked Sendable { var value = false }

    /// Reads the stream until it ends, errors, or goes quiet for 40 s (heartbeats arrive every 15 s).
    /// Returns whether anything arrived, so a healthy stream resets the backoff.
    private func consume(_ client: ConsoleClient) async -> Bool {
        let received = Flag()
        await withTaskGroup(of: Void.self) { group in
            group.addTask { [weak self] in
                do {
                    for try await event in client.events() {
                        received.value = true
                        await self?.handle(event)
                    }
                } catch {}
            }
            group.addTask { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(5))
                    let quiet = await self?.secondsSinceSeen() ?? 99
                    if quiet > 40 { return }
                }
            }
            await group.next()
            group.cancelAll()
        }
        return received.value
    }

    private func secondsSinceSeen() -> Double { Date().timeIntervalSince(lastSeen) }
    private func handle(_ event: ConsoleEvent) {
        lastSeen = Date()
        setConnection(.live)
        if case .state(let next) = event { apply(next) }
    }

    private func setConnection(_ next: Connection) {
        guard connection != next else { return }
        connection = next
        onConnection?(next)
    }

    private func apply(_ next: SessionSnapshot) {
        // A slower request (the refresh after a send, a poll) must not overwrite a newer stream state.
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

    /// Posts an action to the console. Returns true when it was accepted.
    @discardableResult
    func send(step: String, type: String, value: JSONValue = .null, note: String = "") async -> Bool {
        guard !isSending else { return false }
        if isFixture {
            fixtureLog.append((step, type, value, note))
            lastSent = "\(step)|\(type)"; sendCount += 1
            return true
        }
        guard let client else { lastError = StudioError.noConnection.localizedDescription; return false }
        isSending = true
        defer { isSending = false }
        do {
            try await client.send(step: step, type: type, value: value, note: note)
            lastError = nil
            lastSent = "\(step)|\(type)"; sendCount += 1
            await refresh()
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
