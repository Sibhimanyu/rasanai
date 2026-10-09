import Foundation
import StudioCore

/// Owns the research time-box for the run on screen: when research runs past 1.5x its budget, one console `note`
/// goes to the director. The console itself writes "Note: ..." into the activity feed, so the person sees it there.
@MainActor
final class ResearchTimeBoxing {
    private let enforcer = ResearchEnforcer()
    private var run: URL?
    private var ticker: Task<Void, Never>?

    /// A different run (or none) is on screen: forget the latch and stop ticking.
    func reset(for run: URL?) {
        guard run != self.run else { return }
        self.run = run
        enforcer.reset()
        ticker?.cancel(); ticker = nil
    }

    /// Called with every new console state. Also starts a slow tick so a quiet console still gets checked.
    func observe(store: StudioStore) {
        reset(for: store.runURL)
        check(store: store)
        guard ticker == nil, !enforcer.hasFired else { return }
        ticker = Task { [weak self, weak store] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(10))
                guard let self, let store else { return }
                if self.enforcer.hasFired { self.ticker = nil; return }
                self.check(store: store)
            }
        }
    }

    private func check(store: StudioStore) {
        guard store.runtime.isRunning, let film = store.film, !film.isFixture, let project = store.selectedProjectURL ?? store.loadedFilm,
              let progress = store.progress else { return }
        let depth = FilmDraft.load(in: project)?.pace ?? store.settings.pace
        progress.researchBudget = ResearchBudget(depth: depth)
        let session = store.snapshot, elapsed = progress.researchElapsed
        Task { [enforcer] in
            await enforcer.check(depth: depth, researchElapsed: elapsed, session: session) { step, type, note in
                await film.send(step: step, type: type, note: note)
            }
        }
    }
}
