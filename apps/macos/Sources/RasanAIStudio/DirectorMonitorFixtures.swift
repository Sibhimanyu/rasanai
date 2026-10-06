import AppKit
import StudioCore
import SwiftUI

/// Offscreen renders of the Director monitor: `RasanAIStudio --snapshot-stages <dir> --only monitor` writes monitor-*.png (light and dark).
@MainActor
enum DirectorMonitorFixtures {
    /// `--snapshot-stages <dir> --only monitor` (the app's snapshot gate only knows the stages flag).
    static var directory: URL? {
        guard SnapshotHarness.onlyStages == ["monitor"] else { return nil }
        return SnapshotHarness.stagesDirectory
    }

    enum Scenario { case working, quiet, looping, codexPlan, finished }

    /// A realistic telemetry state built by feeding the parser synthetic stream lines, so fixtures exercise the real code path.
    static func telemetry(_ scenario: Scenario, now: Date = Date()) -> (DirectorTelemetry, DirectorHealth) {
        var t = DirectorTelemetry()
        let codex = scenario == .codexPlan
        let model = codex ? "gpt-5.5" : "claude-opus-5-5"
        let started = now.addingTimeInterval(-(scenario == .finished ? 3_000 : 14 * 60 + 20))
        func stamp(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }
        let tools: [(String, String)] = [
            ("Read", #"{"file_path":"/film/DESIGN.md"}"#), ("Write", #"{"file_path":"/film/scenes/scene-1.html"}"#),
            ("Bash", #"{"command":"npx hyperframes lint","description":"Lint the composition"}"#), ("Edit", #"{"file_path":"/film/scenes/scene-2.html"}"#),
            ("Task", #"{"description":"Animate scene 3 with a spring entrance"}"#), ("Bash", #"{"command":"node scripts/console.mjs push --run /r --step story --file s.json"}"#),
            ("Read", #"{"file_path":"/film/scenes/scene-3.html"}"#), ("Write", #"{"file_path":"/film/scenes/scene-4.html"}"#),
        ]
        let calls = scenario == .finished ? 150 : 47
        let span = scenario == .finished ? 2_900.0 : 14 * 60.0
        let lastAt: Date = { switch scenario { case .quiet: now.addingTimeInterval(-196); case .looping: now.addingTimeInterval(-18); default: now.addingTimeInterval(-3) } }()
        if codex {
            t.ingest(line: #"{"type":"thread.started","thread_id":"fixture-thread"}"#, now: started)
        } else {
            t.ingest(line: #"{"type":"system","subtype":"init","session_id":"fixture","model":"\#(model)","timestamp":"\#(stamp(started))"}"#, now: started)
        }
        for i in 0..<calls {
            let at = min(lastAt, started.addingTimeInterval(span * Double(i + 1) / Double(calls + 1)))
            var (name, input) = tools[i % tools.count]
            if scenario == .looping, i >= calls - 4 { (name, input) = ("Read", #"{"file_path":"/film/scenes/scene-3.html"}"#) }
            if codex {
                t.ingest(line: #"{"type":"item.completed","item":{"id":"i\#(i)","type":"command_execution","command":"/bin/bash -lc 'sed -n 1,80p scenes/scene-\#(i % 6).html'","aggregated_output":"","exit_code":0,"status":"completed"}}"#, now: at)
            } else {
                t.ingest(line: #"{"type":"assistant","timestamp":"\#(stamp(at))","message":{"model":"\#(model)","id":"m\#(i)","content":[{"type":"tool_use","id":"t\#(i)","name":"\#(name)","input":\#(input)}],"usage":{"input_tokens":1100,"output_tokens":420,"cache_creation_input_tokens":1500,"cache_read_input_tokens":88000}}}"#, now: at)
                if i < calls - 1 || scenario == .quiet { t.ingest(line: #"{"type":"user","timestamp":"\#(stamp(at.addingTimeInterval(1)))","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t\#(i)","content":"ok","is_error":false}]}}"#, now: at) }
            }
        }
        if codex {
            let total = #"{"timestamp":"\#(stamp(lastAt))","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":2400000,"cached_input_tokens":2100000,"cache_write_input_tokens":0,"output_tokens":38000,"reasoning_output_tokens":0}}}}"#
            t.ingest(line: #"{"type":"turn_context","payload":{"model":"gpt-5.5"}}"#, now: lastAt)
            t.ingest(line: total, now: lastAt)
            t.billing = .includedInPlan
        }
        if scenario == .finished {
            t.ingest(line: #"{"type":"result","subtype":"success","is_error":false,"duration_ms":2900000,"num_turns":150,"total_cost_usd":8.4,"modelUsage":{"claude-opus-5-5":{"inputTokens":165000,"outputTokens":63000,"cacheReadInputTokens":9800000,"cacheCreationInputTokens":225000,"costUSD":8.4}}}"#, now: lastAt)
            t.closeSession(at: lastAt)
        }
        let context = HealthContext(now: now, processRunning: scenario != .finished, hasStarted: true, exitCode: scenario == .finished ? 0 : nil, awaitingUser: false)
        var thresholds = HealthThresholds()
        thresholds.burnTokensPerMinute = 1_000_000_000
        return (t, DirectorHealth.evaluate(t, context: context, thresholds: thresholds))
    }

    private static func monitor(_ scenario: Scenario, run: URL? = nil, budget: Double? = nil) -> DirectorMonitor {
        let (t, health) = telemetry(scenario)
        let monitor = DirectorMonitor()
        monitor.present(run: run ?? URL(fileURLWithPath: "/tmp/fixture-run"), telemetry: t, health: health, live: scenario != .finished, budget: budget)
        return monitor
    }

    static func run(into directory: URL) async {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for dark in [false, true] {
            let suffix = dark ? "-dark" : ""
            func panel(_ name: String, _ scenario: Scenario, budget: Double? = nil, height: CGFloat = 920) async {
                let view = DirectorMonitorPanel(monitor: monitor(scenario, budget: budget)).background(Color(nsColor: .windowBackgroundColor)).tint(.rasan)
                await SnapshotHarness.capture(view, size: CGSize(width: 408, height: height), dark: dark, titled: false, to: directory.appendingPathComponent("monitor-\(name)\(suffix).png"))
            }
            await panel("working", .working)
            await panel("quiet", .quiet)
            await panel("looping", .looping)
            await panel("codex-plan", .codexPlan, height: 800)
            await panel("over-budget", .working, budget: 1.0)

            do {
                // A film window: the toolbar pill with live tokens and cost, and the budget banner.
                let seed = try SnapshotHarness.makeSeed(films: true)
                if let film = seed.films["Founder story"] {
                    let run = film.appendingPathComponent(".rasanai/run-fixture", isDirectory: true)
                    let (t, health) = telemetry(.working)
                    seed.store.monitor.present(run: run, telemetry: t, health: health, live: true, budget: 1.0)
                    seed.store.loadedFilm = film; seed.store.selectedProjectURL = film; seed.store.runURL = run
                    seed.store.runtime.isRunning = true
                    seed.store.runtime.startedAt = Date().addingTimeInterval(-860)
                    let bar = VStack(spacing: 0) {
                        HStack { Spacer(); StatusPill(store: seed.store); Spacer() }.frame(height: 44).background(.bar)
                        Divider()
                        MonitorBudgetBanner(store: seed.store)
                        Spacer()
                    }.background(Color(nsColor: .windowBackgroundColor))
                    await SnapshotHarness.capture(bar, size: CGSize(width: 760, height: 130), dark: dark, titled: false,
                                                  to: directory.appendingPathComponent("monitor-pill\(suffix).png"))
                    seed.store.runtime.isRunning = false
                }
                // The queue: running, waiting and needs-attention films, with the session total.
                let queue = try SnapshotHarness.makeSeed(films: true)
                let names = ["Founder story", "Podcast trailer", "Quarterly update"]
                let urls = names.compactMap { queue.films[$0] }
                if urls.count == 3 {
                    func entry(_ name: String, _ project: URL, _ state: QueuedFilm.State, run: URL?, message: String? = nil) -> QueuedFilm {
                        var film = QueuedFilm(project: project, libraryRoot: project.deletingLastPathComponent(), name: name,
                                              draft: FilmDraft(brief: "A calm film.", duration: 45, aspect: "16:9", agent: "claude"), model: "", unrestrictedTools: false)
                        film.state = state; film.run = run; film.message = message
                        return film
                    }
                    let runA = urls[0].appendingPathComponent(".rasanai/run-a"), runC = urls[2].appendingPathComponent(".rasanai/run-c")
                    queue.store.settings.filmQueue = [
                        entry(names[0], urls[0], .running, run: runA),
                        entry(names[1], urls[1], .waiting, run: nil),
                        entry(names[2], urls[2], .attention, run: runC, message: "Stopped. Resume the queue to continue this saved run."),
                    ]
                    let (live, health) = telemetry(.working)
                    queue.store.monitor.present(run: runA, telemetry: live, health: health, live: true)
                    let (stopped, _) = telemetry(.finished)
                    queue.store.monitor.summaries[runC] = stopped
                    queue.store.monitor.presentSession([runA: (live.tokens.fresh, live.cost.usd, true, false), runC: (stopped.tokens.fresh, stopped.cost.usd, false, false)])
                    queue.store.queuePaused = false
                    queue.store.queueMessage = "Directing Founder story."
                    await SnapshotHarness.capture(FilmQueueView(store: queue.store), size: CGSize(width: 1120, height: 560), dark: dark, titled: true, title: "Queue",
                                                  to: directory.appendingPathComponent("monitor-queue\(suffix).png"))
                }
                let done = try SnapshotHarness.makeSeed(films: true)
                if let film = done.films["Spring launch film"], let poster = done.store.summaries[film]?.poster {
                    try SnapshotHarness.loadFinished(into: done.store, film: film, poster: poster)
                    done.store.monitor.summaries[done.store.runURL!] = telemetry(.finished).0
                    await SnapshotHarness.capture(StudioView(store: done.store), size: CGSize(width: 1120, height: 740), dark: dark, titled: true,
                                                  to: directory.appendingPathComponent("monitor-finished\(suffix).png")) { done.store.path = [.film(film)] }
                }
            } catch { FileHandle.standardError.write(Data("Monitor snapshot failed: \(error)\n".utf8)) }
        }
    }
}
