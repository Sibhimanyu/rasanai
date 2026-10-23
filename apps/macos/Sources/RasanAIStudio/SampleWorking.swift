import Foundation
import StudioCore

/// The sample film's working moment. The sample has no director, so a call made in it would otherwise go nowhere: instead the
/// crew member who owns the next step comes to the centre of the stage, the sample's scripted work appears around them in
/// bubbles, then they step aside to ask, and the sample returns to its stage. Everything here belongs to the made-up Tally film.
@MainActor @Observable
final class SampleWorking {
    let progress = FilmProgress(run: nil, replay: true)
    private(set) var isShowing = false
    @ObservationIgnored private var task: Task<Void, Never>?

    private struct Script {
        let phase: ProgressPhase
        let lines: [String]
        let question: String
    }

    /// Plays the moment that follows a call (`lastSent` is "step|type"). Pin notes wait for their Apply, so they play nothing.
    func play(after lastSent: String?) {
        guard let lastSent else { return }
        let parts = lastSent.split(separator: "|", maxSplits: 1).map(String.init)
        guard parts.count == 2, parts[1] != "comment" else { return }
        let script = Self.script(after: parts[0])
        task?.cancel()
        task = Task { @MainActor [weak self] in await self?.run(script) }
    }

    func stop() { task?.cancel(); task = nil; isShowing = false }

    private func run(_ script: Script) async {
        let start = Date()
        var s = FilmProgressSnapshot.fixture(script.phase, now: start)
        s.title = "Tally launch film"
        s.startedAt = start.addingTimeInterval(-11 * 60)
        s.now = NowLine(phase: script.phase, kind: .thinking, text: "Picking up your call", since: start)
        progress.present(s, at: start)
        isShowing = true
        for (index, line) in script.lines.enumerated() {
            guard await pause(2.4) else { return }
            let at = Date()
            s.activity.append(ProgressActivity(id: "sample-\(script.phase.rawValue)-\(index)", time: at, phase: script.phase,
                                               kind: index == script.lines.count - 1 ? .milestone : .note, title: line))
            s.now = NowLine(phase: script.phase, kind: .thinking, text: line, since: at)
            s.asOf = at
            progress.present(s, at: at)
        }
        guard await pause(2.6) else { return }
        // The same character steps to the side and asks.
        let at = Date()
        s.isWaitingForYou = true
        s.now = NowLine(phase: script.phase, kind: .waiting, text: script.question, since: at)
        if let i = s.phases.firstIndex(where: { $0.phase == script.phase }) { s.phases[i].state = .waitingForYou }
        s.asOf = at
        progress.present(s, at: at)
        guard await pause(5) else { return }
        isShowing = false
    }

    private func pause(_ seconds: Double) async -> Bool {
        try? await Task.sleep(for: .seconds(seconds))
        return !Task.isCancelled
    }

    private static func script(after step: String) -> Script {
        switch step {
        case "brief":
            Script(phase: .research, lines: ["Reading how Tally explains itself", "Collecting what people say about tax season",
                                             "Noting the receipts-in-a-shoebox habit", "Research notes are ready"],
                   question: "Here is what I found. Does the brief still look right?")
        case "story", "concept":
            Script(phase: .look, lines: ["Reading the story for its mood", "Pulling paper and print references",
                                         "Trying one mint accent on paper", "Three looks are drawn"],
                   question: "Three looks are ready. Which one feels like Tally?")
        case "look", "films", "direction", "styleframes":
            Script(phase: .animatic, lines: ["Timing seven scenes to the voiceover", "Cutting the music to 45 seconds",
                                             "Landing the receipt pile on the first beat", "The storyboard is ready"],
                   question: "The storyboard is ready. Leave notes on the timing?")
        case "animatic":
            Script(phase: .build, lines: ["Building scene 1: Tax season", "Building scene 2: The year",
                                          "Matching every scene to Paper ledger / mint", "The first cut is built"],
                   question: "The first cut is ready. Watch it?")
        default:
            Script(phase: .render, lines: ["Checking each scene against the look", "Checking the mix on the voiceover",
                                           "Rendering the final film", "The final is rendered"],
                   question: "Your film is ready. Watch it?")
        }
    }
}
