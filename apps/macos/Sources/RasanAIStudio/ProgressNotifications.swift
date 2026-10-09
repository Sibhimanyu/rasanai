import AppKit
import Observation
import StudioCore
import UserNotifications

/// Tells the person, only while the app is in the background and only if notifications are on, about three moments in Film progress:
/// the build finished, the final is rendered, and research reached its time box. Each fires once per film.
///
/// It watches a `FilmProgress` with Observation, so it keeps working after the film's window is closed or another screen is showing.
/// This is the only place these notices are posted (`StudioStore.ingest` posts just the "director has a question" one).
@MainActor
final class ProgressNotifier {
    static let shared = ProgressNotifier()

    enum Event: String, CaseIterable { case buildDone, finalRendered, researchBudget }

    private var watched: Set<ObjectIdentifier> = []
    private var fired: Set<String> = []
    private var lastSeen: [ObjectIdentifier: FilmProgressSnapshot] = [:]
    /// Test seam: records instead of posting.
    var deliver: ((_ title: String, _ body: String, _ id: String, _ run: URL?) -> Void)?

    func watch(_ progress: FilmProgress, settings: StudioSettings) {
        let key = ObjectIdentifier(progress)
        guard watched.insert(key).inserted else { return }
        lastSeen[key] = progress.snapshot
        arm(progress, key: key, settings: settings)
    }

    private func arm(_ progress: FilmProgress, key: ObjectIdentifier, settings: StudioSettings) {
        withObservationTracking {
            _ = progress.snapshot
        } onChange: { [weak self, weak progress, weak settings] in
            Task { @MainActor in
                guard let self, let progress, let settings else { return }
                self.evaluate(progress, key: key, settings: settings)
                self.arm(progress, key: key, settings: settings)
            }
        }
    }

    private func evaluate(_ progress: FilmProgress, key: ObjectIdentifier, settings: StudioSettings) {
        let new = progress.snapshot
        defer { lastSeen[key] = new }
        for event in Self.events(from: lastSeen[key], to: new, now: progress.now) {
            let id = "\(progress.runURL?.path ?? "film")|\(event.rawValue)"
            guard fired.insert(id).inserted else { continue }
            let text = Self.text(for: event, snapshot: new)
            post(title: text.title, body: text.body, id: id, run: progress.runURL, settings: settings)
        }
    }

    /// Which events happened between two snapshots. Pure, so it is unit-tested.
    nonisolated static func events(from old: FilmProgressSnapshot?, to new: FilmProgressSnapshot, now: Date) -> [Event] {
        var out: [Event] = []
        let was = old.map { $0.summary(.build).state } ?? .upcoming
        if was != .done, new.summary(.build).state == .done, old != nil { out.append(.buildDone) }
        let wasFinal = old.map { $0.render.kind == .final && $0.render.state == .done } ?? false
        if !wasFinal, new.render.kind == .final, new.render.state == .done, old != nil { out.append(.finalRendered) }
        if let budget = new.research.budget, new.summary(.research).state == .active, new.research.endedAt == nil, new.research.startedAt != nil {
            let overTime = new.research.elapsed(now: now) >= budget.seconds
            let overSources = new.research.sourceCount >= budget.sources
            let alreadyOver = old.map { o in
                (o.research.budget.map { o.research.elapsed(now: o.asOf) >= $0.seconds } ?? false) || o.research.sourceCount >= budget.sources
            } ?? false
            if (overTime || overSources) && !alreadyOver { out.append(.researchBudget) }
        }
        return out
    }

    nonisolated static func text(for event: Event, snapshot: FilmProgressSnapshot) -> (title: String, body: String) {
        switch event {
        case .buildDone: ("Your film is built", "All scenes are built. The checks and a draft render are next.")
        case .finalRendered:
            ("Your film is ready to watch", snapshot.render.outputName.map { "\($0) is ready to watch in RasanAI Studio." } ?? "Open RasanAI Studio to watch it.")
        case .researchBudget:
            ("Research reached its time box", "Claude has read \(snapshot.research.sourceCount) source\(snapshot.research.sourceCount == 1 ? "" : "s"). Open RasanAI Studio to wrap up research, or let it carry on.")
        }
    }

    private func post(title: String, body: String, id: String, run: URL?, settings: StudioSettings) {
        if let deliver { deliver(title, body, id, run); return }
        guard settings.notificationsEnabled, Bundle.main.bundleIdentifier != nil, !NSApp.isActive else { return }
        let content = UNMutableNotificationContent()
        content.title = title; content.body = body; content.sound = .default
        if let run { content.userInfo = ["runPath": run.path] }
        Task { try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "progress-\(id)", content: content, trigger: nil)) }
    }
}
