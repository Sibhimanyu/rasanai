import Foundation

/// One screen of the New film setup. The list of screens is computed from the draft and the catalogues, so a film that needs
/// fewer questions gets a shorter walk.
public enum FlowStep: Hashable, Sendable {
    case series, kind, material, brief, shape, example
    /// A taste question (`pictures`, `captions`, ...).
    case question(String)
    case review

    public var title: String {
        switch self {
        case .series: "Series"
        case .kind: "What are you making"
        case .material: "Your material"
        case .brief: "Your brief"
        case .shape: "Length and shape"
        case .example: "Make it like this"
        case .question(let id): id.capitalized
        case .review: "Review"
        }
    }
}

/// Where an answer on the Review screen came from.
public enum AnswerSource: String, Hashable, Sendable {
    case you, clip, series, example, auto
    public var tag: String {
        switch self {
        case .you: "You"
        case .clip: "From your clip"
        case .series: "From your series"
        case .example: "From your example"
        case .auto: "RasanAI decides"
        }
    }
}

/// What the setup knows beyond the draft itself.
public struct FlowContext: Equatable, Sendable {
    /// At least one series exists, so the first screen asks.
    public var hasSeries = false
    /// A series was picked: its answers fill the draft and the walk is short.
    public var seriesChosen = false
    /// "Start a series" was picked: it is saved at Review, and the example screen is always offered.
    public var startingSeries = false
    /// The format was inferred with confidence, so it is a confirm line in the material screen instead of a screen.
    public var formatConfident = false
    /// A mark (badge, logo, watermark) was found by the example learn job, so `marks` is asked.
    public var marksFound = false
    /// Question ids a series or the example already answered.
    public var answered: Set<String> = []
    /// The brief is empty, or is only the series' standing text.
    public var briefNeedsAttention = true
    public init() {}
}

public enum NewFilmSteps {
    /// The screens for this film, in order. Series film: material, brief if empty, Review. Otherwise: series (if any exist),
    /// what are you making (unless inferred), material, brief if empty, length and shape (unless read from the clip), the
    /// example edit and the taste questions for formats that ask them, and Review.
    public static func steps(draft: FilmDraft, catalog: FormatCatalog?, questions: TasteQuestions?, context: FlowContext) -> [FlowStep] {
        var steps: [FlowStep] = []
        if context.hasSeries { steps.append(.series) }
        let option = catalog?.option(draft.format?.option)
        if context.seriesChosen {
            steps.append(.material)
            if context.briefNeedsAttention { steps.append(.brief) }
            steps.append(.review)
            return steps
        }
        if !context.formatConfident || option == nil { steps.append(.kind) }
        steps.append(.material)
        if context.briefNeedsAttention { steps.append(.brief) }
        let readsClip = option.map { catalog?.readsClip($0) ?? false } ?? false
        if !readsClip { steps.append(.shape) }
        let asked = option.flatMap { option in questions?.questions(for: option) } ?? []
        // The example comes before the questions it can answer, on a first film; a series starter always gets it.
        if !asked.isEmpty || context.startingSeries { steps.append(.example) }
        for question in asked where !context.answered.contains(question.id) {
            if question.askIf == "marks-found", !context.marksFound { continue }
            steps.append(.question(question.id))
        }
        steps.append(.review)
        return steps
    }

    public static func next(after step: FlowStep, in steps: [FlowStep]) -> FlowStep? {
        guard let index = steps.firstIndex(of: step) else { return nil }
        return steps.indices.contains(index + 1) ? steps[index + 1] : nil
    }
    public static func previous(before step: FlowStep, in steps: [FlowStep]) -> FlowStep? {
        guard let index = steps.firstIndex(of: step), index > 0 else { return nil }
        return steps[index - 1]
    }
}

/// Reading what a clip already says, so the setup never asks for it: its length and whether it is portrait, square or landscape.
public enum ClipFacts {
    public static func aspect(width: Double, height: Double) -> String {
        guard width > 0, height > 0 else { return "16:9" }
        let ratio = width / height
        if ratio < 0.85 { return "9:16" }
        if ratio < 1.18 { return "1:1" }
        return "16:9"
    }
    /// 60.07 s -> 60: the film's length in whole seconds, within what a film can be.
    public static func seconds(_ duration: Double) -> Int { min(600, max(5, Int(duration.rounded()))) }
}
