import AppKit
import Observation
import StudioCore
import UserNotifications

/// Watches the running director: reads its machine-readable output, keeps tokens, cost and health up to date,
/// persists per-film totals in the run folder, and raises a budget warning. All UI reads this; nothing here draws.
@MainActor @Observable
final class DirectorMonitor {
    struct Actions {
        var pause: () -> Void = {}
        var showLog: () -> Void = {}
        var tell: () -> Void = {}
    }

    /// The film the director is working on (the runtime's run), with its totals.
    private(set) var run: URL?
    private(set) var telemetry = DirectorTelemetry()
    private(set) var health: DirectorHealth?
    private(set) var now = Date()
    private(set) var isLive = false
    /// Cached totals for films other than the live one (queue rows, finished films).
    var summaries: [URL: DirectorTelemetry] = [:]
    /// Usage this app launch has added, per film, for the queue's session total.
    private(set) var ledger: [URL: (tokens: Int, usd: Double, estimated: Bool, plan: Bool)] = [:]
    /// Set when the live film passes the budget the person chose and they have not dismissed the warning.
    private(set) var budgetLimit: Double?
    var actions = Actions()

    private weak var store: StudioStore?
    private var baseline: [URL: (tokens: Int, usd: Double)] = [:]
    private var logOffset: UInt64 = 0
    private var rolloutPath: String?
    private var rolloutOffset: UInt64 = 0
    private var billingResolved = false
    private var wasRunning = false
    private var ticking = false
    private var lastSave = Date.distantPast
    private var dirty = false
    private var dismissedBudget: Set<URL> = []
    private var loopAlerted = false
    private var awaitingUser = false
    private var lastConsoleUpdate: Date?
    private var task: Task<Void, Never>?

    var hasData: Bool { telemetry.hasData }
    var agentTitle: String { telemetry.agent == "codex" ? "OpenAI Codex" : "Claude Code" }
    var isPlanBilled: Bool { telemetry.billing == .includedInPlan }

    func attach(_ store: StudioStore) {
        guard task == nil else { return }
        self.store = store
        actions = Actions(pause: { [weak store] in store?.pauseDirector() },
                          showLog: { [weak store] in store?.sheet = .log },
                          tell: { [weak store] in store?.film?.beginTell() })
        task = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.tick()
                try? await Task.sleep(for: .seconds(self.isLive ? 1.5 : 4))
            }
        }
    }

    /// Fixture entry point: a monitor showing a given state with no runtime behind it.
    func present(run: URL?, telemetry: DirectorTelemetry, health: DirectorHealth, live: Bool, now: Date = Date(), budget: Double? = nil) {
        self.run = run; self.telemetry = telemetry; self.health = health; self.isLive = live; self.now = now; self.budgetLimit = budget
    }

    func presentSession(_ entries: [URL: (tokens: Int, usd: Double, estimated: Bool, plan: Bool)]) { ledger = entries }

    /// Totals for any film: the live one, else what was saved in its run folder.
    func usage(for run: URL?) -> DirectorTelemetry? {
        guard let run else { return nil }
        if run == self.run, telemetry.hasData { return telemetry }
        return summaries[run]
    }

    func loadSummary(for run: URL) async {
        if run == self.run { return }
        let loaded = await Task.detached { DirectorUsageStore.summary(run: run) }.value
        if let loaded { summaries[run] = loaded }
    }

    func dismissBudgetWarning() { if let run { dismissedBudget.insert(run) }; budgetLimit = nil }
    func raiseBudget(by amount: Double) {
        guard let store else { return }
        store.settings.budgetPerFilm = max(store.settings.budgetPerFilm, ceil(telemetry.cost.usd)) + amount
        dismissBudgetWarning()
    }

    /// Session total across the films the director worked on during this launch.
    var sessionTotals: (tokens: Int, usd: Double, estimated: Bool, plan: Bool, films: Int)? {
        let entries = ledger.values.filter { $0.tokens > 0 }
        guard !entries.isEmpty else { return nil }
        return (entries.reduce(0) { $0 + $1.tokens }, entries.reduce(0) { $0 + $1.usd }, entries.contains { $0.estimated }, entries.allSatisfy { $0.plan }, entries.count)
    }

    // MARK: Loop

    private struct Advance: Sendable {
        var telemetry: DirectorTelemetry
        var logOffset: UInt64
        var rolloutPath: String?
        var rolloutOffset: UInt64
        var billing: Billing?
        var awaitingUser = false
        var lastConsoleUpdate: Date?
    }

    private func tick() async {
        guard !ticking, let store else { return }
        ticking = true; defer { ticking = false }
        let runtime = store.runtime
        let target = runtime.runURL
        if target != run { await switchRun(to: target, store: store) }
        let running = runtime.isRunning
        isLive = running
        now = Date()
        if let run, running || wasRunning {
            await advance(run: run, log: runtime.logURL, final: !running && wasRunning)
        }
        wasRunning = running
        guard run != nil else { health = nil; return }
        let context = HealthContext(now: now, processRunning: running, hasStarted: runtime.startedAt != nil || telemetry.hasData,
                                    exitCode: runtime.lastExitCode, stopRequested: runtime.stopRequested, awaitingUser: running && awaitingUser,
                                    lastConsoleUpdate: lastConsoleUpdate)
        health = DirectorHealth.evaluate(telemetry, context: context)
        updateLedger()
        checkBudget(store: store)
        checkLoop(store: store)
        if dirty, now.timeIntervalSince(lastSave) > 8 || !running { save() }
    }

    private func advance(run: URL, log: URL?, final: Bool) async {
        var input = Advance(telemetry: telemetry, logOffset: logOffset, rolloutPath: rolloutPath, rolloutOffset: rolloutOffset,
                            billing: billingResolved ? nil : (telemetry.agent == "codex" ? CodexBilling.detect() : (telemetry.agent == "claude" ? .metered : nil)))
        input.awaitingUser = awaitingUser
        let result = await Task.detached { Self.advance(input, run: run, log: log, final: final) }.value
        if result.telemetry != telemetry || result.logOffset != logOffset || result.telemetry.updatedAt != telemetry.updatedAt { dirty = true }
        telemetry = result.telemetry
        logOffset = result.logOffset; rolloutPath = result.rolloutPath; rolloutOffset = result.rolloutOffset
        awaitingUser = result.awaitingUser; lastConsoleUpdate = result.lastConsoleUpdate
        if result.billing != nil { billingResolved = true }
        if final { save() }
    }

    nonisolated private static func advance(_ input: Advance, run: URL, log: URL?, final: Bool) -> Advance {
        var state = input
        let file = log ?? run.appendingPathComponent("director.log")
        let read = DirectorUsageStore.readLines(file: file, from: state.logOffset)
        state.logOffset = read.offset
        if !read.lines.isEmpty { state.telemetry.ingest(lines: read.lines, now: Date()) }
        if let billing = state.billing { state.telemetry.billing = billing }
        // Codex only reports final usage on the exec stream; its rollout file carries the live counters.
        if state.telemetry.agent == "codex", let thread = state.telemetry.sessionID {
            if state.rolloutPath == nil { state.rolloutPath = CodexBilling.rolloutFile(thread: thread)?.path; state.rolloutOffset = 0 }
            if let path = state.rolloutPath {
                let rollout = DirectorUsageStore.readLines(file: URL(fileURLWithPath: path), from: state.rolloutOffset)
                state.rolloutOffset = rollout.offset
                state.telemetry.ingest(lines: rollout.lines.filter { $0.contains("token_count") || $0.contains("turn_context") }, now: Date())
            }
        }
        if let data = try? Data(contentsOf: run.appendingPathComponent("session.json")), let snapshot = try? SessionSnapshot(data: data) {
            state.awaitingUser = snapshot.isWaitingOnUser
            state.lastConsoleUpdate = snapshot.activityFeed.first?.date
        }
        if final { state.telemetry.closeSession(at: Date()) }
        return state
    }

    private func switchRun(to target: URL?, store: StudioStore) async {
        if let old = run {
            if wasRunning || telemetry.sessionID != nil { await advance(run: old, log: old.appendingPathComponent("director.log"), final: true) }
            save()
            summaries[old] = telemetry
        }
        run = target
        telemetry = DirectorTelemetry(); health = nil
        logOffset = 0; rolloutPath = nil; rolloutOffset = 0; billingResolved = false; wasRunning = false
        awaitingUser = false; lastConsoleUpdate = nil; loopAlerted = false; budgetLimit = nil; dirty = false
        guard let target else { return }
        if let stored = await Task.detached(operation: { DirectorUsageStore.load(run: target) }).value {
            telemetry = stored.telemetry
            telemetry.closeSession()
            logOffset = stored.logOffset; rolloutPath = stored.rolloutPath; rolloutOffset = stored.rolloutOffset
            if telemetry.agent == "codex" { telemetry.billing = CodexBilling.detect(); billingResolved = true }
        }
        baseline[target] = (telemetry.tokens.fresh, telemetry.cost.usd)
        // A run with no saved totals (made before this feature, or by another launch): read what its log already holds.
        if !telemetry.hasData, store.runtime.logURL != nil || FileManager.default.fileExists(atPath: target.appendingPathComponent("director.log").path) {
            await advance(run: target, log: store.runtime.logURL, final: false)
            if !store.runtime.isRunning { telemetry.closeSession(); dirty = true }
        }
    }

    private func save() {
        guard let run, telemetry.hasData else { return }
        let stored = DirectorUsageStore.Stored(telemetry: telemetry, logOffset: logOffset, rolloutPath: rolloutPath, rolloutOffset: rolloutOffset)
        Task.detached { DirectorUsageStore.save(stored, run: run) }
        lastSave = Date(); dirty = false
    }

    private func updateLedger() {
        guard let run, telemetry.hasData else { return }
        let base = baseline[run] ?? (0, 0)
        let cost = telemetry.cost
        ledger[run] = (max(0, telemetry.tokens.fresh - base.tokens), max(0, cost.usd - base.usd), cost.isEstimated, cost.isIncludedInPlan)
    }

    // MARK: Alerts

    private func checkBudget(store: StudioStore) {
        let limit = store.settings.budgetPerFilm
        guard limit > 0, let run, !isPlanBilled, !dismissedBudget.contains(run) else { budgetLimit = nil; return }
        if telemetry.cost.usd > limit {
            if budgetLimit == nil {
                notify(store, title: "Over your budget for this film", body: "\(UsageFormat.dollars(telemetry.cost.usd)) so far, above your \(UsageFormat.dollars(limit)) limit.")
            }
            budgetLimit = limit
        } else { budgetLimit = nil }
    }

    private func checkLoop(store: StudioStore) {
        if health?.state == .possiblyLooping {
            if !loopAlerted { loopAlerted = true; notify(store, title: "The director may be stuck", body: health?.detail ?? "Open RasanAI Studio to check.") }
        } else { loopAlerted = false }
    }

    private func notify(_ store: StudioStore, title: String, body: String) {
        guard store.settings.notificationsEnabled, Bundle.main.bundleIdentifier != nil, !NSApp.isActive else { return }
        let content = UNMutableNotificationContent()
        content.title = title; content.body = body; content.sound = .default
        if let run { content.userInfo = ["runPath": run.path] }
        Task { try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "monitor-\(UUID().uuidString)", content: content, trigger: nil)) }
    }
}
