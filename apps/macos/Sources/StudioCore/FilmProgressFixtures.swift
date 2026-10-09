import Foundation

/// Hand-built snapshots for the snapshot harness and previews, modelled on the real 8-hour ChatGPT film.
/// (Filled in with real data after the interface handoff.)
public extension FilmProgressSnapshot {
    /// A film partway through `phase`: earlier phases done, later ones upcoming.
    static func fixture(_ phase: ProgressPhase, now: Date = Date()) -> FilmProgressSnapshot {
        var s = FilmProgressSnapshot()
        s.title = "ChatGPT for Mac launch test"
        s.currentPhase = phase
        s.asOf = now
        for index in s.phases.indices {
            let p = s.phases[index].phase
            s.phases[index].state = p < phase ? .done : (p == phase ? .active : .upcoming)
        }
        s.now = NowLine(phase: phase, kind: .thinking, text: "Working on \(phase.title.lowercased())")
        return s
    }
}
