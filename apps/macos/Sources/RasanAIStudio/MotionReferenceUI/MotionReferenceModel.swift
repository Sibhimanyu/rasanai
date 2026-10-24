import Foundation
import Observation
import StudioCore

/// What the reference is doing right now, for the chip.
enum MotionReferenceStatus: Equatable {
    case analyzing
    case ready
    case cannotAnalyze

    var label: String {
        switch self {
        case .analyzing: "Analyzing motion"
        case .ready: "Ready"
        case .cannotAnalyze: "Cannot analyze"
        }
    }
}

/// Plain-language labels for the rights field of a reference.
enum MotionRights {
    static func label(_ raw: String?) -> String {
        switch raw {
        case "owned": "Owned"
        case "licensed": "Licensed"
        case "inspiration-only": "Inspiration only"
        default: "Inspiration only"
        }
    }
}

/// Little bars for the cadence strip: one per shot, as a fraction (0.12...1) of the longest shot.
enum MotionCadence {
    static func bars(from summary: MotionReferenceSummary) -> [Double] {
        var lengths: [Double] = (summary.analysis?.shots ?? []).compactMap { shot in
            guard let a = shot.startS, let b = shot.endS, b > a else { return nil }
            return b - a
        }
        if lengths.isEmpty, let analysis = summary.analysis, let cuts = analysis.cutsS, !cuts.isEmpty {
            let edges = ([0.0] + cuts.sorted() + [analysis.durationS ?? cuts.max() ?? 0]).filter { $0 >= 0 }
            lengths = zip(edges, edges.dropFirst()).map { $1 - $0 }.filter { $0 > 0 }
        }
        return bars(fromLengths: lengths)
    }

    static func bars(fromLengths lengths: [Double]) -> [Double] {
        guard let longest = lengths.max(), longest > 0 else { return [] }
        return lengths.map { min(1, max(0.12, $0 / longest)) }
    }
}

/// Loads a project's reference-motion.json through MotionStudioStore and exposes status and summary to the views.
@MainActor @Observable
final class MotionReferenceModel {
    private(set) var summary: MotionReferenceSummary?
    private(set) var problems: [String] = []
    private(set) var isLoading = false
    /// Set by the owner while the director is still analysing a freshly added reference.
    private(set) var analysisInFlight = false

    var status: MotionReferenceStatus {
        if summary != nil { return .ready }
        if !problems.isEmpty { return .cannotAnalyze }
        return analysisInFlight || isLoading ? .analyzing : .cannotAnalyze
    }

    var durationS: Double? { summary?.analysis?.durationS }
    var rightsLabel: String { MotionRights.label(summary?.source?.rights) }
    var basename: String? { summary?.source?.basename }

    func markAnalyzing() { analysisInFlight = true }

    /// Reads the project off the main actor; safe to call again when the file may have appeared.
    func load(projectRoot: URL) async {
        isLoading = true
        let store = await Task.detached(priority: .utility) { MotionStudioStore.load(projectRoot: projectRoot) }.value
        summary = store.reference
        problems = store.problems
        if store.reference != nil { analysisInFlight = false }
        isLoading = false
    }

    func apply(_ summary: MotionReferenceSummary?) {
        self.summary = summary
        if summary != nil { analysisInFlight = false }
    }
}
