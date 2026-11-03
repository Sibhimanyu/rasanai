import AppKit
import StudioCore

/// What Rasan's chat knows about the director. Only data the app already has.
extension StudioStore {
    /// Fills the chat context with the live director's state for the film on screen: blocked, stalled, running, last error, recent events.
    func fillChatContext(_ c: inout ChatContext) {
        guard !isSample, let runURL else { return }
        let live = monitor.run == runURL && runtime.runURL == runURL
        c.directorRunning = live ? runtime.isRunning : false
        guard live, let health = monitor.health else { return }
        if runtime.isRunning, health.state != .paused, let block = health.blocked {
            c.blocked = block
            c.blockRepeated = monitor.blockRepeatedAfterFix(block)
        }
        c.stalled = runtime.isRunning && health.stalled
        c.healthDetail = health.detail
        c.lastError = monitor.telemetry.events.last(where: { $0.kind == .error })?.text
        if c.recentEvents.isEmpty {
            c.recentEvents = monitor.telemetry.events.suffix(DirectorChatRules.maxEvents).filter { $0.kind != .start }.map(\.text)
        }
    }

    /// Live evidence for "Rasan is thinking": is the director for this film running, paused or blocked, and when did it last do anything.
    func chatLiveness() -> FilmSessionModel.DirectorLiveness? {
        guard !isSample, let runURL else { return nil }
        guard monitor.run == runURL, runtime.runURL == runURL, runtime.isRunning else { return .init(running: false) }
        let health = monitor.health
        return .init(running: true, paused: runtime.isFrozen || health?.state == .paused, blocked: health?.blocked != nil,
                     lastActivity: monitor.telemetry.lastEventAt)
    }
}
