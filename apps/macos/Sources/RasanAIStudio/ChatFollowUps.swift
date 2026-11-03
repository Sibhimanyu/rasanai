import AppKit
import StudioCore
import SwiftUI

/// Rasan speaks up in the chat on real transitions without being asked: after a Retry or Restart (did it run again, or not) and, after a status
/// question, the first meaningful change. This only decides WHEN; each message is written by Rasan's model from the film's facts and the
/// transition (`FilmSessionModel.speak`), with a plain honest fallback if the model can't be reached. Problems opening and clearing are the
/// incident ledger's moments (`ChatIncidents.swift`). Pure state: the monitor's existing 1.5 s tick feeds `Input`.
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
    /// The moment for the model (`event`) and the plain line to use if the model can't be reached (`fallback`).
    struct Post: Equatable { var event: String; var fallback: String }
    enum Kind: Equatable { case retry, restart }
    struct Pending: Equatable { var kind: Kind; var at: Date }
    struct Watch: Equatable { var until: Date; var phase: String; var preview: String? }

    /// Minimum gap between unprompted messages (the ack of a pressed action and its outcome are answers, not unprompted).
    static let minGap: TimeInterval = 45
    /// After a retry or restart, no new event for this long: say so.
    static let retryPatience: TimeInterval = 120
    static let watchFor: TimeInterval = 180

    private(set) var pending: Pending?
    private var lastPostAt = Date.distantPast
    private(set) var watch: Watch?

    /// A Retry step or Restart Rasan: the instant receipt line (nil for a repeat of the same one within seconds).
    mutating func noteAction(_ kind: Kind, now: Date) -> String? {
        if let p = pending, now.timeIntervalSince(p.at) < 5, p.kind == kind || kind == .retry { return nil }
        pending = Pending(kind: kind, at: now)
        watch = nil
        lastPostAt = now
        return kind == .restart ? "Restarting Rasan…" : "Retrying the step…"
    }

    /// The person asked how it is going: keep an eye out for ~3 min and say once when something meaningful changes.
    mutating func noteStatusQuestion(_ last: Input?, now: Date) {
        watch = Watch(until: now.addingTimeInterval(Self.watchFor), phase: last?.phase ?? "", preview: last?.preview)
    }

    /// The header's words and whether it is a warning, while something is being watched; nil: just "Listening".
    func headerNote(live: Bool, now: Date) -> (text: String, warn: Bool)? {
        if let p = pending { return (p.kind == .restart ? "Watching the restart…" : "Watching the retry…", true) }
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
        func said(_ event: String, _ fallback: String) -> Post { lastPostAt = i.now; return Post(event: event, fallback: fallback) }

        // After a retry or restart: the first new event says it runs again; two minutes of nothing says it did not help.
        if let p = pending {
            let what = p.kind == .restart ? "restart" : "retry"
            if let m = i.moments.first(where: { $0.time > p.at }) {
                pending = nil; watch = nil
                return said("The \(what) worked: the first new thing after it is \"\(m.title)\". Rasan is running again.", "Running again: \(m.title)")
            }
            if i.now.timeIntervalSince(p.at) >= Self.retryPatience {
                pending = nil
                return said("The \(what) did not help: still no new activity two minutes after it. Say so honestly and say what you can do next (restart if it was a retry; look at the log or another way if it was a restart).",
                            "Still no movement after the \(what).")
            }
            return nil
        }
        guard i.live else { return nil }
        if let w = watch {
            if i.now >= w.until { watch = nil; return nil }
            guard gapOK, !i.calm else { return nil }
            if !i.phase.isEmpty, !w.phase.isEmpty, i.phase != w.phase {
                watch = nil
                return said("The film moved on to the \(i.phase) phase" + (i.doing.map { ", now \(Self.lower($0))" } ?? "") + ". The person had asked how it is going.",
                            "Moved on to the \(i.phase) phase" + (i.doing.map { ": \(Self.lower($0))" } ?? "") + ".")
            }
            if let p = i.preview, p != w.preview { watch = nil; return said("A new preview picture just came in. The person had asked how it is going.", "A new preview just came in.") }
        }
        return nil
    }
}

// MARK: Wiring

extension FilmSessionModel {
    /// One monitor tick: Rasan speaks up if the watcher has a moment to mention.
    func followUpTick(_ input: ChatFollowUps.Input) {
        guard !isFixture else { return }
        followUpLast = input
        var next = followUps
        let post = next.step(input)
        if next != followUps { followUps = next }
        if let post { speak(event: post.event, step: input.step, fallback: post.fallback) }
    }

    /// Retry step or Restart Rasan ran (from the chat or anywhere): a small receipt line at once, then watch for the first new event.
    func followUpAction(_ kind: ChatFollowUps.Kind) {
        guard !isFixture else { return }
        var next = followUps
        let line = next.noteAction(kind, now: Date())
        followUps = next
        if let line { systemLine(line, step: snapshot.currentStep) }
    }

    /// The person asked a question: watch for the first meaningful change for a few minutes.
    func followUpStatusAsked() {
        guard !isFixture else { return }
        var next = followUps
        next.noteStatusQuestion(followUpLast, now: Date())
        followUps = next
    }

    /// What the chat header says instead of "Listening", with whether it is a warning: the headline problem, else what is being watched.
    var followUpNote: (text: String, warn: Bool)? {
        if let i = incidents.headline { return (i.label, i.state != .working) }
        return followUps.headerNote(live: followUpLast?.live ?? false, now: followUpLast?.now ?? Date())
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

    /// The stuck state as the working screen gets it: how long, and the doorway to the chat. nil once the person said Later (the pill stays).
    var stuckNotice: StuckNotice? {
        guard let quiet = stuckFor, film?.incidents.item("stalled")?.state != .dismissed else { return nil }
        return StuckNotice(quietFor: quiet, onTalk: { [weak self] in self?.talkAbout("stalled") }, onLater: { [weak self] in self?.laterAbout("stalled") },
                           fallback: doorwayActions("stalled"))
    }
}

/// The stuck state as the working screen gets it: how long, and the doorway to the chat.
struct StuckNotice {
    var quietFor: TimeInterval
    var onTalk: () -> Void
    var onLater: () -> Void
    /// Real actions as buttons, only when Rasan's chat can't run.
    var fallback: [DoorwayAction] = []
}

// MARK: Bottom bar pill

/// A compact state pill left of the tokens: a dot and one word for what the director is doing, from the same health the chat reads. A problem
/// (a tool the film needs, blocked, stuck, stopped) shows in orange as its short label and opens the chat at that problem.
struct DirectorStatePill: View {
    @Bindable var store: StudioStore

    private struct Look { var text: String; var color: Color; var incident: String? = nil; var help: String }

    private var look: Look? {
        guard !store.isSample, let run = store.runURL, !(store.progress?.isReplay ?? false), store.monitor.run == run, store.runtime.runURL == run else { return nil }
        let rt = store.runtime
        if let p = store.film?.followUps.pending {
            return Look(text: p.kind == .restart ? "Restarting…" : "Retrying…", color: .rasan, help: "Waiting for Rasan's first new step.")
        }
        if let i = store.film?.incidents.headline {
            return Look(text: i.label, color: i.state == .working ? .rasan : Color(nsColor: .systemOrange), incident: i.id, help: i.summary)
        }
        if rt.isPreparing { return Look(text: "Restarting…", color: .rasan, help: "Rasan is starting up.") }
        guard rt.isRunning, let h = store.monitor.health else { return nil }
        if rt.isFrozen || h.state == .paused { return Look(text: "Paused", color: Color(nsColor: .secondaryLabelColor), help: h.detail) }
        switch h.state {
        case .waitingForYou: return Look(text: "Waiting on you", color: Color(nsColor: .systemOrange), help: h.detail)
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
            let warn = s.incident != nil
            let pill = HStack(spacing: 5) {
                Circle().fill(s.color).frame(width: 6, height: 6)
                Text(s.text).font(.system(size: 11, weight: .medium)).monospacedDigit().foregroundStyle(warn ? s.color : .secondary)
            }
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(s.color.opacity(warn ? 0.18 : 0.10), in: Capsule())
            .fixedSize()
            if let id = s.incident {
                Button { store.talkAbout(id) } label: { pill }.buttonStyle(.plain).help(s.help)
                    .accessibilityLabel("\(s.text). Talk to Rasan about it")
            } else {
                pill.help(s.help).accessibilityElement(children: .combine)
            }
        }
    }
}
