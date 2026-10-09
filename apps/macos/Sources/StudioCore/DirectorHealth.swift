import Foundation

public enum DirectorHealthState: String, Codable, Sendable {
    case starting, working, thinking, waitingForYou, quiet, possiblyLooping, finished, failed, stopped
}

public struct HealthThresholds: Equatable, Sendable {
    /// A model call with no output yet reads as "Thinking" until this long, then as quiet.
    public var thinkingFor: TimeInterval = 120
    /// No events at all for this long is "Quiet".
    public var quietAfter: TimeInterval = 120
    /// A tool that has not returned (a render, an install) is trusted for this long before it counts as quiet.
    public var toolQuietAfter: TimeInterval = 600
    /// The same tool call with the same input this many times in a row.
    public var repeatedCalls = 3
    /// The same assistant message this many times in a row.
    public var repeatedMessages = 3
    /// Fresh (non-cache) tokens per minute, averaged over `burnWindow`, that count as heavy burn.
    public var burnTokensPerMinute = 100_000
    public var burnWindow: TimeInterval = 600
    /// Heavy burn only matters if the director has not pushed to the console for this long.
    public var burnNoPushAfter: TimeInterval = 600
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
    public init(now: Date = Date(), processRunning: Bool, hasStarted: Bool = true, exitCode: Int32? = nil, stopRequested: Bool = false,
                awaitingUser: Bool = false, lastConsoleUpdate: Date? = nil, endedEarlyReason: String? = nil) {
        self.endedEarlyReason = endedEarlyReason
        self.now = now; self.processRunning = processRunning; self.hasStarted = hasStarted; self.exitCode = exitCode
        self.stopRequested = stopRequested; self.awaitingUser = awaitingUser; self.lastConsoleUpdate = lastConsoleUpdate
    }
}

public struct DirectorHealth: Equatable, Sendable {
    public var state: DirectorHealthState
    /// Short label for the pill: "Working", "Thinking", "Quiet", "Possibly looping".
    public var label: String
    /// One calm sentence explaining it.
    public var detail: String
    public var quietFor: TimeInterval
    public var loopReason: String?
    public var isAlarming: Bool { state == .possiblyLooping || state == .failed }

    public static func evaluate(_ t: DirectorTelemetry, context c: HealthContext, thresholds th: HealthThresholds = HealthThresholds()) -> DirectorHealth {
        let last = t.lastEventAt ?? t.sessionStartedAt
        let quiet = last.map { max(0, c.now.timeIntervalSince($0)) } ?? 0
        func make(_ state: DirectorHealthState, _ label: String, _ detail: String, loop: String? = nil) -> DirectorHealth {
            DirectorHealth(state: state, label: label, detail: detail, quietFor: quiet, loopReason: loop)
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
        if !t.hasData { return make(.starting, "Starting", "The director is starting up. This usually takes under a minute.") }
        if c.awaitingUser {
            return make(.waitingForYou, "Waiting for you", "The director is paused until you answer. It is not using tokens while it waits.")
        }
        if let reason = loopReason(t, context: c, thresholds: th) {
            return make(.possiblyLooping, "Possibly looping", reason, loop: reason)
        }
        if t.consoleWaitInFlight && !c.awaitingUser {
            return make(.working, "Working", "The director is waiting for your reply.")
        }
        if let tool = t.toolInFlight, let since = t.toolInFlightSince {
            let running = max(0, c.now.timeIntervalSince(since))
            let what = t.lastToolSummary ?? tool
            if running < th.toolQuietAfter {
                return make(.working, "Working", running < 30 ? what : "\(what) · \(UsageFormat.span(running)) so far")
            }
            return make(.quiet, "Quiet", "No activity for \(UsageFormat.span(quiet)). Last: \(what).")
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
        let started = t.sessionStartedAt ?? t.firstEventAt ?? c.now
        let window = min(th.burnWindow, max(60, c.now.timeIntervalSince(started)))
        let sinceConsole = c.now.timeIntervalSince(max(t.lastConsoleCallAt ?? started, c.lastConsoleUpdate ?? started, started))
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
