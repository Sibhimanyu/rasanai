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
        /// Stops the director and starts it again from the run's saved state (never two directors for one run).
        var restart: () -> Void = {}
        /// Nudges the step again: a note when Rasan is alive, a restart when it is not.
        var retry: () -> Void = {}
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
    /// Why RasanAI paused the director by itself (a loop or the budget), while it stays paused.
    struct AutoPause: Equatable { enum Kind { case loop, budget }; var kind: Kind; var reason: String; var at: Date }
    private(set) var autoPaused: AutoPause?
    /// Commands the director was refused, read live from its output; `openBlock` is the one it has not got past.
    private(set) var scanner = DirectorBlockScanner()
    var openBlock: DirectorBlock? { scanner.open }
    private var notifiedBlock: String?
    /// How long the director must keep looking stuck before it is paused: long enough to ride out a retry that recovers.
    static let loopGrace: TimeInterval = 120
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
    private var loopSince: Date?
    /// Set on Resume: the repeat that triggered a pause is still in the history, so only events after this count.
    private var resumedAt: Date?
    private var lastBeat = Date.distantPast
    private var awaitingUser = false
    private var lastConsoleUpdate: Date?
    private var task: Task<Void, Never>?
    private var activity: NSObjectProtocol?
    private var lastWake: Date?
    private var wakeObservers: [NSObjectProtocol] = []

    var hasData: Bool { telemetry.hasData }
    var canPause: Bool { store?.canPause ?? false }
    var agentTitle: String { telemetry.agent == "codex" ? "OpenAI Codex" : "Claude Code" }
    var isPlanBilled: Bool { telemetry.billing == .includedInPlan }

    func attach(_ store: StudioStore) {
        guard task == nil else { return }
        self.store = store
        actions = Actions(pause: { [weak store] in store?.pauseDirector() },
                          showLog: { [weak store] in store?.sheet = .log },
                          tell: { [weak store] in store?.film?.beginTell() },
                          restart: { [weak store] in store?.restartRasan() },
                          retry: { [weak store] in store?.retryStep() })
        ToolNeedCoordinator.shared.attach(store)
        let center = NSWorkspace.shared.notificationCenter
        wakeObservers = [center.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.macDidWake() }
        }]
        task = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.tick()
                try? await Task.sleep(for: .seconds(self.isLive ? 1.5 : 4))
            }
        }
    }

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

    /// Keep going: drops the warning, and wakes the director if the budget is what paused it.
    func dismissBudgetWarning() {
        if let run { dismissedBudget.insert(run) }
        budgetLimit = nil
        if autoPaused?.kind == .budget { store?.resumeDirector() }
    }
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
        var scanner = DirectorBlockScanner()
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
                                    lastConsoleUpdate: lastConsoleUpdate,
                                    endedEarlyReason: runtime.recovery.map { [$0.title, runtime.recoveryDetail].filter { !$0.isEmpty }.joined(separator: ". ") },
                                    lastWake: lastWake, paused: runtime.isFrozen || runtime.stopRequested, blocked: scanner.open)
        health = DirectorHealth.evaluate(telemetry, context: context)
        if autoPaused != nil, !runtime.isFrozen, !runtime.stopRequested { autoPaused = nil }
        updateKeepAwake(running: running, store: store)
        if running, !runtime.stopRequested, let live = runtime.runURL, now.timeIntervalSince(lastBeat) > 5 { lastBeat = now; Self.beat(run: live) }
        store.thawIfSentWhileFrozen()
        updateLedger()
        checkBudget(store: store)
        checkLoop(store: store)
        checkBlock(store: store)
        if dirty, now.timeIntervalSince(lastSave) > 8 || !running { save() }
    }

    /// Holds one power assertion while the director is really working, so the Mac does not idle-sleep under it; the screen may still sleep.
    private func updateKeepAwake(running: Bool, store: StudioStore) {
        let hold = KeepAwakePolicy.shouldHold(enabled: store.settings.keepAwakeWhileMaking, processRunning: running, health: health)
        if hold, activity == nil {
            activity = ProcessInfo.processInfo.beginActivity(options: [.idleSystemSleepDisabled, .suddenTerminationDisabled], reason: "RasanAI is making a film")
        } else if !hold, let token = activity {
            ProcessInfo.processInfo.endActivity(token); activity = nil
        }
    }

    /// Time asleep is not silence: remember the wake so health measures from it, then let the store re-check any pending automatic resume.
    /// A frozen director was just thawed: the time it sat frozen is not silence, so health measures from now.
    /// Tells the director's driver this app is watching, even when another launch started it: the driver then leaves a paused
    /// director paused and leaves loop checks to the app.
    nonisolated static func beat(run: URL) {
        _ = FileManager.default.createFile(atPath: run.appendingPathComponent("director-watch").path, contents: Data())
    }

    func noteResumed() { lastWake = Date(); resumedAt = lastWake; autoPaused = nil; loopSince = nil }
    /// The person saw the refusal, fixed its cause or restarted the director: it no longer holds the film's state.
    func acknowledgeBlock() { scanner.acknowledge(); notifiedBlock = nil }

    /// When the person last pressed Fix it, per block: a block seen again after that is a repeat, and Fix it becomes Restart Rasan.
    private(set) var fixAttempts: [String: Date] = [:]
    func noteFixAttempt(_ block: DirectorBlock) { fixAttempts[block.id] = Date() }
    func blockRepeatedAfterFix(_ block: DirectorBlock) -> Bool {
        guard let tried = fixAttempts[block.id] else { return false }
        return block.at > tried
    }

    private func macDidWake() {
        lastWake = Date()
        store?.handleWake()
    }

    private func advance(run: URL, log: URL?, final: Bool) async {
        var input = Advance(telemetry: telemetry, logOffset: logOffset, rolloutPath: rolloutPath, rolloutOffset: rolloutOffset,
                            billing: billingResolved ? nil : (telemetry.agent == "codex" ? CodexBilling.detect() : (telemetry.agent == "claude" ? .metered : nil)))
        input.awaitingUser = awaitingUser
        input.scanner = scanner
        let result = await Task.detached { Self.advance(input, run: run, log: log, final: final) }.value
        if result.telemetry != telemetry || result.logOffset != logOffset || result.telemetry.updatedAt != telemetry.updatedAt { dirty = true }
        telemetry = result.telemetry
        logOffset = result.logOffset; rolloutPath = result.rolloutPath; rolloutOffset = result.rolloutOffset
        awaitingUser = result.awaitingUser; lastConsoleUpdate = result.lastConsoleUpdate
        scanner = result.scanner
        if result.billing != nil { billingResolved = true }
        if final { save() }
    }

    nonisolated private static func advance(_ input: Advance, run: URL, log: URL?, final: Bool) -> Advance {
        var state = input
        let file = log ?? run.appendingPathComponent("director.log")
        let read = DirectorUsageStore.readLines(file: file, from: state.logOffset)
        state.logOffset = read.offset
        if !read.lines.isEmpty { state.telemetry.ingest(lines: read.lines, now: Date()); state.scanner.ingest(lines: read.lines, now: Date()) }
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
        if let data = try? Data(contentsOf: run.appendingPathComponent("session.json")), let raw = try? SessionSnapshot(data: data) {
            // Read it as the screen does: an answer the director hasn't consumed yet already counts, so the panel never says
            // "Waiting for you" next to "Sent to Claude".
            let snapshot = SessionOverlay.apply(RunTransport(run: run).pending(), to: raw)
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
        loopSince = nil; resumedAt = nil; autoPaused = nil
        scanner = DirectorBlockScanner(); notifiedBlock = nil
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
                budgetLimit = limit
                let spent = "\(UsageFormat.dollars(telemetry.cost.usd)) so far, above your \(UsageFormat.dollars(limit)) limit."
                if pause(.budget, reason: spent, store: store) {
                    notify(store, title: "Paused at your budget for this film", body: spent + " Keep going in RasanAI Studio to carry on.")
                } else {
                    notify(store, title: "Over your budget for this film", body: spent)
                }
            }
            budgetLimit = limit
        } else { budgetLimit = nil }
    }

    /// Warns once when the director looks stuck, then pauses it if it is still stuck after `loopGrace`, so a loop stops spending tokens.
    private func checkLoop(store: StudioStore) {
        let freshSinceResume = resumedAt.map { (telemetry.lastEventAt ?? .distantPast) > $0 } ?? true
        guard health?.state == .possiblyLooping, freshSinceResume else { loopAlerted = false; loopSince = nil; return }
        let reason = health?.loopReason ?? health?.detail ?? "It looks like it is repeating itself."
        if loopSince == nil { loopSince = now }
        if store.settings.pauseWhenStuck, let since = loopSince, now.timeIntervalSince(since) >= Self.loopGrace {
            if pause(.loop, reason: reason, store: store) {
                notify(store, title: "Paused: the director looked stuck", body: reason + " Resume or message it in RasanAI Studio.")
                loopAlerted = true
                return
            }
        }
        if !loopAlerted {
            loopAlerted = true
            let soon = store.settings.pauseWhenStuck ? " RasanAI pauses it in two minutes if it stays stuck." : ""
            notify(store, title: "The director may be stuck", body: reason + soon)
        }
    }

    /// Tells the person once, even from another app or window, that the director was refused a command and is waiting on them.
    private func checkBlock(store: StudioStore) {
        guard let block = scanner.open, store.runtime.isRunning else { if scanner.open == nil { notifiedBlock = nil }; return }
        guard notifiedBlock != block.id else { return }
        notifiedBlock = block.id
        notify(store, title: "Rasan was blocked", body: block.message + " Open RasanAI Studio to decide.")
    }

    /// Pauses (really stops) the director on RasanAI's own call. Returns false when there was nothing to pause.
    private func pause(_ kind: AutoPause.Kind, reason: String, store: StudioStore) -> Bool {
        guard autoPaused == nil, store.canPause else { return false }
        store.pauseDirector()
        guard store.runtime.stopRequested else { return false }
        autoPaused = AutoPause(kind: kind, reason: reason, at: now)
        loopSince = nil
        return true
    }

    private func notify(_ store: StudioStore, title: String, body: String) {
        guard store.settings.notificationsEnabled, Bundle.main.bundleIdentifier != nil, !NSApp.isActive else { return }
        let content = UNMutableNotificationContent()
        content.title = title; content.body = body; content.sound = .default
        if let run { content.userInfo = ["runPath": run.path] }
        Task { try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "monitor-\(UUID().uuidString)", content: content, trigger: nil)) }
    }
}
