import Foundation

public enum DirectorHealthState: String, Codable, Sendable {
    case starting, working, thinking, waitingForYou, quiet, possiblyLooping, finished, failed, stopped, paused
}

public struct HealthThresholds: Equatable, Sendable {
    /// A model call with no output yet reads as "Thinking" until this long, then as quiet.
    public var thinkingFor: TimeInterval = 120
    /// No events at all for this long is "Quiet".
    public var quietAfter: TimeInterval = 120
    /// A tool that has not returned (a render, an install) is trusted for this long before it counts as quiet.
    public var toolQuietAfter: TimeInterval = 600
    /// A render or encode on this Mac is trusted this long: a long film's final render can take most of an hour.
    public var localJobQuietAfter: TimeInterval = 5400
    /// The same tool call with the same input this many times in a row.
    public var repeatedCalls = 3
    /// The same assistant message this many times in a row.
    public var repeatedMessages = 3
    /// Fresh (non-cache) tokens per minute, averaged over `burnWindow`, that count as heavy burn.
    public var burnTokensPerMinute = 100_000
    public var burnWindow: TimeInterval = 600
    /// Heavy burn only matters if the director has not pushed to the console for this long.
    public var burnNoPushAfter: TimeInterval = 600
    /// While waiting on the person, an event this fresh (or a tool or model call in flight) means the director is still working in the background.
    public var backgroundActiveWithin: TimeInterval = 20
    public init() {}
}

public struct HealthContext: Sendable {
    public var now: Date
    public var processRunning: Bool
    public var hasStarted: Bool
    public var exitCode: Int32?
    public var stopRequested: Bool
    /// The console is waiting on the person (a step awaits a call, or a question is open).
    public var awaitingUser: Bool
    /// A fresher console update than the telemetry saw (session activity), if the caller knows one.
    public var lastConsoleUpdate: Date?
    /// Set when the process ended but the film was left unfinished (permission denials, or a quiet exit 0): shown as a failure.
    public var endedEarlyReason: String?
    /// When the Mac last woke from sleep. Time asleep is not silence: every "how long since" measure starts no earlier than this.
    public var lastWake: Date?
    /// The director is frozen in place: it is alive but nothing runs and no tokens are used.
    public var paused: Bool
    public init(now: Date = Date(), processRunning: Bool, hasStarted: Bool = true, exitCode: Int32? = nil, stopRequested: Bool = false,
                awaitingUser: Bool = false, lastConsoleUpdate: Date? = nil, endedEarlyReason: String? = nil, lastWake: Date? = nil, paused: Bool = false) {
        self.paused = paused
        self.lastWake = lastWake
        self.endedEarlyReason = endedEarlyReason
        self.now = now; self.processRunning = processRunning; self.hasStarted = hasStarted; self.exitCode = exitCode
        self.stopRequested = stopRequested; self.awaitingUser = awaitingUser; self.lastConsoleUpdate = lastConsoleUpdate
    }
}

extension HealthContext {
    /// `date`, or the last wake if that came later.
    func since(_ date: Date) -> Date { lastWake.map { max(date, $0) } ?? date }
}

public struct DirectorHealth: Equatable, Sendable {
    public var state: DirectorHealthState
    /// Short label for the pill: "Working", "Thinking", "Quiet", "Possibly looping".
    public var label: String
    /// One calm sentence explaining it.
    public var detail: String
    public var quietFor: TimeInterval
    public var loopReason: String?
    /// Set only with `.waitingForYou`: what the director is doing meanwhile (research runs in parallel with the person's call).
    public var background: String?
    public var isAlarming: Bool { state == .possiblyLooping || state == .failed }

    public static func evaluate(_ t: DirectorTelemetry, context c: HealthContext, thresholds th: HealthThresholds = HealthThresholds()) -> DirectorHealth {
        let last = (t.lastEventAt ?? t.sessionStartedAt).map { c.since($0) }
        let quiet = last.map { max(0, c.now.timeIntervalSince($0)) } ?? 0
        func make(_ state: DirectorHealthState, _ label: String, _ detail: String, loop: String? = nil, background: String? = nil) -> DirectorHealth {
            DirectorHealth(state: state, label: label, detail: detail, quietFor: quiet, loopReason: loop, background: background)
        }
        if !c.processRunning {
            if c.hasStarted == false { return make(.starting, "Starting", "The director is getting ready.") }
            if c.stopRequested { return make(.stopped, "Stopped", "You stopped the director. Your files are kept; resume when ready.") }
            if let code = c.exitCode {
                if let reason = c.endedEarlyReason { return make(.failed, "Failed", reason) }
                return code == 0 && !t.sessionIsError ? make(.finished, "Finished", "The director has finished its run.")
                    : make(.failed, "Failed", t.events.last(where: { $0.kind == .error })?.text ?? "The director stopped with an error (code \(code)).")
            }
            return make(.stopped, "Not running", "The director is not running.")
        }
        if c.paused { return make(.paused, "Paused", "Paused. Nothing runs and no tokens are used until you resume.") }
        if !t.hasData { return make(.starting, "Starting", "The director is starting up. This usually takes under a minute.") }
        if c.awaitingUser {
            if let work = backgroundWork(t, quiet: quiet, now: c.now, wake: c.lastWake, thresholds: th) {
                return make(.waitingForYou, "Waiting for you", "Waiting for your call. Claude keeps working in the background meanwhile.", background: work)
            }
            return make(.waitingForYou, "Waiting for you", "The director is paused until you answer. It is not using tokens while it waits.")
        }
        if let reason = loopReason(t, context: c, thresholds: th) {
            return make(.possiblyLooping, "Possibly looping", reason, loop: reason)
        }
        if t.consoleWaitInFlight && !c.awaitingUser {
            return make(.working, "Working", "The director is waiting for your reply.")
        }
        if let tool = t.toolInFlight, let since = t.toolInFlightSince {
            let running = max(0, c.now.timeIntervalSince(c.since(since)))
            let what = t.lastToolSummary ?? tool
            if t.toolInFlightIsLocalJob, running < th.localJobQuietAfter {
                return make(.working, "Rendering", running < 30 ? what
                    : "\(what) · \(UsageFormat.span(running)) so far. This runs on your Mac, so tokens and cost hold still until it finishes.")
            }
            if running < th.toolQuietAfter {
                return make(.working, "Working", running < 30 ? what : "\(what) · \(UsageFormat.span(running)) so far")
            }
            return make(.quiet, "Quiet", "One step has run for \(UsageFormat.span(running)) without finishing: \(what).")
        }
        if t.modelCallInFlight, quiet < th.thinkingFor {
            return quiet < 6 ? make(.working, "Working", "The director is working.")
                : make(.thinking, "Thinking", "Waiting on the model for \(UsageFormat.span(quiet)). Long thinking is normal on big steps.")
        }
        if quiet >= th.quietAfter {
            let what = t.lastToolSummary.map { " Last: \($0)." } ?? ""
            return make(.quiet, "Quiet", "No activity for \(UsageFormat.span(quiet)).\(what)")
        }
        return make(.working, "Working", t.lastToolSummary ?? "The director is working.")
    }

    /// What the director is doing while it waits for the person, else nil. Its own console `wait` call and the push that
    /// opened the question are not work.
    static func backgroundWork(_ t: DirectorTelemetry, quiet: TimeInterval, now: Date, wake: Date? = nil, thresholds th: HealthThresholds) -> String? {
        if t.consoleWaitInFlight { return nil }
        let what = t.lastToolSummary ?? "Working"
        if t.toolInFlight != nil, let since = t.toolInFlightSince, now.timeIntervalSince(wake.map { max(since, $0) } ?? since) < th.toolQuietAfter { return what }
        if t.modelCallInFlight, quiet < th.backgroundActiveWithin { return what }
        if quiet < th.backgroundActiveWithin, let kind = t.events.last?.kind, kind != .push, kind != .ask { return what }
        return nil
    }

    /// The explanation when the run looks stuck, else nil. Console `wait` calls are exempt: repeating them is how it waits for you.
    public static func loopReason(_ t: DirectorTelemetry, context c: HealthContext, thresholds th: HealthThresholds) -> String? {
        if let last = t.recentCalls.last, !last.exempt {
            var run = 0
            for call in t.recentCalls.reversed() { if call == last { run += 1 } else { break } }
            if run >= th.repeatedCalls {
                let what = t.lastToolSummary ?? last.name
                return "It has made the same call \(run) times in a row (\(what)). It may be stuck retrying."
            }
        }
        if let last = t.recentMessages.last, last.count >= 12 {
            var run = 0
            for message in t.recentMessages.reversed() { if message == last { run += 1 } else { break } }
            if run >= th.repeatedMessages { return "It has said the same thing \(run) times in a row. It may be stuck." }
        }
        let started = c.since(t.sessionStartedAt ?? t.firstEventAt ?? c.now)
        let window = min(th.burnWindow, max(60, c.now.timeIntervalSince(started)))
        let sinceConsole = c.now.timeIntervalSince(max(c.since(t.lastConsoleCallAt ?? started), c.since(c.lastConsoleUpdate ?? started), started))
        if sinceConsole >= th.burnNoPushAfter, c.now.timeIntervalSince(started) >= th.burnWindow {
            let used = t.freshTokens(since: c.now.addingTimeInterval(-window))
            let perMinute = Double(used) / (window / 60)
            if perMinute > Double(th.burnTokensPerMinute) {
                return "It has used about \(UsageFormat.tokens(Int(perMinute))) tokens a minute for \(UsageFormat.span(window)) without showing you anything new."
            }
        }
        return nil
    }
}
