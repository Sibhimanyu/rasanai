import AppKit
import StudioCore
import SwiftUI

/// Rasan speaks up in the chat on real transitions without being asked: a stall begins, a Retry step or Restart Rasan is pressed (and
/// whether it worked), a stall clears by itself, and, after a status question, the first meaningful change. Deterministic text from
/// real data only, no model call. Pure state: the monitor's existing 1.5 s tick feeds `Input`, the model posts what `step` returns.
struct ChatFollowUps: Equatable {
    struct Moment: Equatable { var time: Date; var title: String }
    /// What one tick knows. `moments` is the director's newest events, newest first.
    struct Input: Equatable {
        var now: Date
        var step: String
        /// The director for this film is running (a restart in progress is not).
        var live: Bool
        var stalled: Bool
        var quietFor: TimeInterval
        /// Frozen or waiting on the person: silence is expected.
        var calm: Bool
        var doing: String?
        var phase: String
        var preview: String?
        var moments: [Moment]
    }
    struct Post: Equatable { var text: String; var actions: [ChatQuickAction]? }
    enum Kind: Equatable { case retry, restart }
    struct Pending: Equatable { var kind: Kind; var at: Date }
    struct Watch: Equatable { var until: Date; var stalled: Bool; var phase: String; var preview: String? }

    /// Minimum gap between unprompted messages (the ack of a pressed button and its outcome are answers, not unprompted).
    static let minGap: TimeInterval = 45
    /// After a retry or restart, no new event for this long: say so and point at Restart Rasan.
    static let retryPatience: TimeInterval = 120
    static let watchFor: TimeInterval = 180

    private(set) var pending: Pending?
    private(set) var stallPosted = false
    private var stallAt = Date.distantPast
    private var lastPostAt = Date.distantPast
    private(set) var watch: Watch?

    /// A Retry step or Restart Rasan press: the instant line to post (nil for a repeat of the same press within seconds).
    mutating func noteAction(_ kind: Kind, now: Date) -> String? {
        if let p = pending, now.timeIntervalSince(p.at) < 5, p.kind == kind || kind == .retry { return nil }
        pending = Pending(kind: kind, at: now)
        watch = nil
        lastPostAt = now
        return kind == .restart ? "Restarting Rasan…" : "Retrying the step…"
    }

    /// The person asked how it is going: keep an eye out for ~3 min and say once when something meaningful changes.
    mutating func noteStatusQuestion(_ last: Input?, now: Date) {
        watch = Watch(until: now.addingTimeInterval(Self.watchFor), stalled: last?.stalled ?? false, phase: last?.phase ?? "", preview: last?.preview)
    }

    /// The header's words and whether it is a warning, while something is being watched; nil: just "Listening".
    func headerNote(live: Bool, now: Date) -> (text: String, warn: Bool)? {
        if let p = pending { return (p.kind == .restart ? "Watching the restart…" : "Watching the retry…", true) }
        if stallPosted, live { return ("Watching, it's stuck", true) }
        if let w = watch, now < w.until { return ("Watching for changes…", false) }
        return nil
    }

    /// Plain: "5 min", "1 h 5 min".
    static func span(_ t: TimeInterval) -> String {
        let m = max(1, Int(t / 60))
        return m < 60 ? "\(m) min" : (m % 60 == 0 ? "\(m / 60) h" : "\(m / 60) h \(m % 60) min")
    }

    private static func lower(_ s: String) -> String {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: ".…"))
        guard t.count > 1, t.first!.isUppercase, t.dropFirst().first!.isLowercase else { return t }
        return t.prefix(1).lowercased() + t.dropFirst()
    }

    mutating func step(_ i: Input) -> Post? {
        let gapOK = i.now.timeIntervalSince(lastPostAt) >= Self.minGap
        func said(_ text: String, _ actions: [ChatQuickAction]? = nil) -> Post { lastPostAt = i.now; return Post(text: text, actions: actions) }

        // After a button: the first new event says it runs again; two minutes of nothing says the retry did not help.
        if let p = pending {
            if let m = i.moments.first(where: { $0.time > p.at }) {
                pending = nil; stallPosted = false; watch = nil
                return said("Running again: \(m.title)")
            }
            if i.now.timeIntervalSince(p.at) >= Self.retryPatience {
                pending = nil; stallPosted = i.stalled; stallAt = i.now
                return said("Still no movement after the retry. Restart Rasan usually fixes this.", [.restartRasan, .viewActivity])
            }
            return nil
        }
        guard i.live else { return nil }
        if stallPosted {
            if i.stalled || i.calm { return nil }
            stallPosted = false
            if let m = i.moments.first(where: { $0.time > stallAt }) { return said("Moving again: \(m.title).") }
            return nil
        }
        if i.stalled, gapOK {
            stallPosted = true; stallAt = i.now
            let on = i.doing.map { " on \(Self.lower($0))" } ?? ""
            return said("I've had no progress for \(Self.span(i.quietFor))\(on). I can retry the step or restart.", [.retryStep, .restartRasan, .viewActivity])
        }
        if let w = watch {
            if i.now >= w.until { watch = nil; return nil }
            guard gapOK, !i.calm else { return nil }
            if w.stalled, !i.stalled, let m = i.moments.first { watch = nil; return said("Moving again: \(m.title).") }
            if !i.phase.isEmpty, !w.phase.isEmpty, i.phase != w.phase {
                watch = nil
                return said("Moved on to the \(i.phase) phase" + (i.doing.map { ": \(Self.lower($0))" } ?? "") + ".")
            }
            if let p = i.preview, p != w.preview { watch = nil; return said("A new preview just came in.") }
        }
        return nil
    }
}

// MARK: Wiring

extension FilmSessionModel {
    /// One monitor tick: posts what the watcher has to say, if anything.
    func followUpTick(_ input: ChatFollowUps.Input) {
        guard !isFixture else { return }
        followUpLast = input
        var next = followUps
        let post = next.step(input)
        if next != followUps { followUps = next }
        if let post { addLocal(input.step, fromUser: false, post.text, actions: post.actions) }
    }

    /// Retry step or Restart Rasan was pressed (anywhere): say so at once, then watch for the first new event.
    func followUpAction(_ kind: ChatFollowUps.Kind) {
        guard !isFixture else { return }
        var next = followUps
        let line = next.noteAction(kind, now: Date())
        followUps = next
        if let line { addLocal(snapshot.currentStep, fromUser: false, line) }
    }

    /// The person asked a status question: watch for the first meaningful change for a few minutes.
    func followUpStatusAsked() {
        guard !isFixture else { return }
        var next = followUps
        next.noteStatusQuestion(followUpLast, now: Date())
        followUps = next
    }

    /// What the chat header says instead of "Listening", with whether it is a warning.
    var followUpNote: (text: String, warn: Bool)? {
        followUps.headerNote(live: followUpLast?.live ?? false, now: followUpLast?.now ?? Date())
    }
}

extension StudioStore {
    /// The monitor's tick for the film on screen, as the watcher reads it. nil: no live film to talk about.
    func followUpInput() -> ChatFollowUps.Input? {
        guard !isSample, let runURL, let film, monitor.run == runURL, runtime.runURL == runURL else { return nil }
        let health = monitor.health
        let live = runtime.isRunning
        let s = progress?.snapshot
        var moments: [ChatFollowUps.Moment] = (s?.activity.suffix(3) ?? []).map { .init(time: $0.time, title: Self.clipTitle($0.title)) }
        moments += monitor.telemetry.events.suffix(3).filter { $0.kind != .start }.map { .init(time: $0.time, title: Self.clipTitle($0.text)) }
        moments.sort { $0.time > $1.time }
        let doing = s.flatMap { $0.now.kind == .idle || $0.now.text.isEmpty ? nil : $0.now.text } ?? monitor.telemetry.lastToolSummary
        return .init(now: Date(), step: film.snapshot.currentStep, live: live, stalled: live && health?.stalled == true, quietFor: health?.quietFor ?? 0,
                     calm: runtime.isFrozen || health?.state == .paused || health?.state == .waitingForYou || film.isWaitingOnUser,
                     doing: doing, phase: s?.currentPhase.title ?? "", preview: s.flatMap { CrewThoughts.newestPicture($0)?.path }, moments: moments)
    }

    private static func clipTitle(_ s: String) -> String {
        let flat = s.split(whereSeparator: \.isNewline).joined(separator: " ").trimmingCharacters(in: .whitespaces)
        return flat.count > 90 ? String(flat.prefix(90)) + "…" : flat
    }

    func tickFollowUps() {
        guard let film, let input = followUpInput() else { return }
        film.followUpTick(input)
    }

    /// The working screen's single stuck signal: the director runs, nothing has moved for `stalledAfter`, nobody is awaited.
    var stuckFor: TimeInterval? {
        guard !isSample, let runURL, monitor.run == runURL, runtime.runURL == runURL, runtime.isRunning, !runtime.isFrozen,
              let h = monitor.health, h.stalled else { return nil }
        return h.quietFor
    }

    var stuckNotice: StuckNotice? {
        stuckFor.map { StuckNotice(quietFor: $0, onRetry: { [weak self] in self?.retryStep() }, onRestart: { [weak self] in self?.restartRasan() }) }
    }

    /// The bar pill's click when stuck: opens the chat with the stuck status and its Retry step / Restart Rasan buttons.
    func openStuckChat() {
        guard let film else { return }
        film.beginTell()
        let quick = ChatAnswerer.quickStatus("Is it stuck?", film.chatContext())
        film.addLocal(film.shownStep, fromUser: false, quick.text, actions: quick.actions)
    }
}

/// The stuck state as the working screen gets it: how long, and the two ways out.
struct StuckNotice {
    var quietFor: TimeInterval
    var onRetry: () -> Void
    var onRestart: () -> Void
}

// MARK: Bottom bar pill

/// A compact state pill left of the tokens: a dot and one word for what the director is doing, from the same health the chat reads.
/// Stuck is orange and opens the chat with the stuck status.
struct DirectorStatePill: View {
    @Bindable var store: StudioStore

    private struct Look { var text: String; var color: Color; var stuck = false; var help: String }

    private var look: Look? {
        guard !store.isSample, let run = store.runURL, !(store.progress?.isReplay ?? false), store.monitor.run == run, store.runtime.runURL == run else { return nil }
        let rt = store.runtime
        if let p = store.film?.followUps.pending {
            return Look(text: p.kind == .restart ? "Restarting…" : "Retrying…", color: .rasan, help: "Waiting for Rasan's first new step.")
        }
        if rt.isPreparing { return Look(text: "Restarting…", color: .rasan, help: "Rasan is starting up.") }
        guard rt.isRunning, let h = store.monitor.health else { return nil }
        if rt.isFrozen || h.state == .paused { return Look(text: "Paused", color: Color(nsColor: .secondaryLabelColor), help: h.detail) }
        if h.stalled {
            return Look(text: "Stuck · \(ChatFollowUps.span(h.quietFor))", color: Color(nsColor: .systemOrange), stuck: true,
                        help: "No progress for \(ChatFollowUps.span(h.quietFor)). Click for Retry step or Restart Rasan.")
        }
        switch h.state {
        case .waitingForYou: return Look(text: h.blocked != nil ? "Blocked" : "Waiting on you", color: Color(nsColor: .systemOrange), help: h.detail)
        case .thinking: return Look(text: "Thinking", color: .rasan, help: h.detail)
        case .possiblyLooping: return Look(text: "Looping?", color: Color(nsColor: .systemRed), help: h.detail)
        case .quiet: return Look(text: "Quiet", color: Color(nsColor: .secondaryLabelColor), help: h.detail)
        case .starting: return Look(text: "Starting", color: .rasan, help: h.detail)
        case .working: return Look(text: "Working", color: .rasan, help: h.detail)
        default: return nil
        }
    }

    var body: some View {
        if let s = look {
            let pill = HStack(spacing: 5) {
                Circle().fill(s.color).frame(width: 6, height: 6)
                Text(s.text).font(.system(size: 11, weight: .medium)).monospacedDigit().foregroundStyle(s.stuck ? s.color : .secondary)
            }
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(s.color.opacity(s.stuck ? 0.18 : 0.10), in: Capsule())
            .fixedSize()
            if s.stuck {
                Button { store.openStuckChat() } label: { pill }.buttonStyle(.plain).help(s.help)
                    .accessibilityLabel("\(s.text). Open the chat")
            } else {
                pill.help(s.help).accessibilityElement(children: .combine)
            }
        }
    }
}
