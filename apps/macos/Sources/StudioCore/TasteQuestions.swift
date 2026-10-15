import Foundation

/// The taste questions from `skills/rasanai/library/questions.json`: the few choices that decide a film and that RasanAI
/// cannot infer. The setup flow asks them one per screen; the skill reads the same file. A format option lists the ids it
/// asks in formats.json (`questions`). Decoding is lenient so the skill can grow the file without breaking the app.
public struct TasteQuestions: Decodable, Equatable, Sendable {
    public var version: Int
    public var questions: [Question]

    public struct Choice: Decodable, Equatable, Sendable, Identifiable {
        public var id: String
        public var label: String
        public var description: String
        /// The name of the picture for this choice (an SF Symbol stands in for it until the illustrations ship).
        public var thumb: String?
        /// Picking it asks for a file (the series end card).
        public var needsFile: Bool

        private enum CodingKeys: String, CodingKey { case id, label, description, thumb, needsFile = "needs_file" }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            label = try c.decode(String.self, forKey: .label)
            description = try c.decodeIfPresent(String.self, forKey: .description) ?? ""
            thumb = try c.decodeIfPresent(String.self, forKey: .thumb)
            needsFile = try c.decodeIfPresent(Bool.self, forKey: .needsFile) ?? false
        }
        public init(id: String, label: String, description: String = "", thumb: String? = nil, needsFile: Bool = false) {
            self.id = id; self.label = label; self.description = description; self.thumb = thumb; self.needsFile = needsFile
        }
    }

    public struct Question: Decodable, Equatable, Sendable, Identifiable {
        public var id: String
        public var question: String
        public var choices: [Choice]
        /// The "hand it to RasanAI" answer ("You decide").
        public var unsure: String
        /// Limits the question to films where it means something (`marks-found`).
        public var askIf: String?

        private enum CodingKeys: String, CodingKey { case id, question, choices, unsure, askIf = "ask_if" }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            question = try c.decode(String.self, forKey: .question)
            choices = try c.decode([Choice].self, forKey: .choices)
            unsure = try c.decodeIfPresent(String.self, forKey: .unsure) ?? "You decide"
            askIf = try c.decodeIfPresent(String.self, forKey: .askIf)
        }
        public init(id: String, question: String, choices: [Choice], unsure: String = "You decide", askIf: String? = nil) {
            self.id = id; self.question = question; self.choices = choices; self.unsure = unsure; self.askIf = askIf
        }
        public func choice(_ id: String?) -> Choice? { id.flatMap { id in choices.first { $0.id == id } } }
    }

    public init(version: Int = 1, questions: [Question]) { self.version = version; self.questions = questions }

    // MARK: Lookup

    public func question(_ id: String) -> Question? { questions.first { $0.id == id } }
    /// The questions an option asks, in the order formats.json lists them (an id this file does not define is dropped).
    public func questions(for option: FormatCatalog.Option) -> [Question] { (option.questions ?? []).compactMap(question) }
    /// "Plain and literal" for `pictures` = `literal`; nil when either is unknown.
    public func label(question: String, choice: String) -> String? { self.question(question)?.choice(choice)?.label }
    /// Keeps only answers that name a real question and one of its choices.
    public func validated(_ preferences: [String: String]) -> [String: String] {
        preferences.filter { id, choice in question(id)?.choice(choice) != nil }
    }

    // MARK: Loading

    public static func decode(_ data: Data) throws -> TasteQuestions { try JSONDecoder().decode(TasteQuestions.self, from: data) }

    /// The installed skill's `library/questions.json` (next to formats.json), else the fallback file, else nil.
    public static func load(engine: URL?, fallback: URL? = nil) -> TasteQuestions? {
        let candidates = [engine?.appendingPathComponent("library/questions.json"), fallback].compactMap { $0 }
        for url in candidates {
            if let data = try? Data(contentsOf: url), let found = try? decode(data), !found.questions.isEmpty { return found }
        }
        return nil
    }

    /// Set once by the app at launch from the installed skill, so a brief written anywhere (a resumed run, the queue) can name
    /// the choices in the owner's words. Without it the request lists the plain ids.
    nonisolated(unsafe) public static var installed: TasteQuestions?
}

/// What a learn job found out about an edit the person likes (`<dir>/taste.json`, written by `scripts/learn.mjs`): an
/// answer for each question it could tell, with the evidence, plus the marks and the ending it saw.
public struct TasteResult: Decodable, Equatable, Sendable {
    public struct Answer: Decodable, Equatable, Sendable {
        public var choice: String
        public var confidence: Double
        public var evidence: String
        private enum CodingKeys: String, CodingKey { case choice, confidence, evidence }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            choice = try c.decode(String.self, forKey: .choice)
            confidence = try c.decodeIfPresent(Double.self, forKey: .confidence) ?? 0.5
            evidence = try c.decodeIfPresent(String.self, forKey: .evidence) ?? ""
        }
        public init(choice: String, confidence: Double = 0.8, evidence: String = "") { self.choice = choice; self.confidence = confidence; self.evidence = evidence }
    }
    /// A static mark (badge, logo, watermark) as a box on the frame, 0 to 1.
    public struct Mark: Codable, Equatable, Sendable {
        public var x: Double, y: Double, w: Double, h: Double, presence: Double
    }
    public struct Ending: Decodable, Equatable, Sendable {
        public var startSeconds: Double?
        public var file: String?
        private enum CodingKeys: String, CodingKey { case startSeconds = "start_s", file }
    }

    public var answers: [String: Answer]
    public var marks: [Mark]
    public var ending: Ending?
    public var durationSeconds: Double?
    /// "measured" (the deterministic pass) or "done" (the vision pass has filled in the rest).
    public var status: String

    private enum CodingKeys: String, CodingKey { case answers, marks, ending, status, durationSeconds = "duration_s" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // `null` answers (pictures before the vision pass) decode as absent.
        let raw = (try? c.decodeIfPresent([String: Answer?].self, forKey: .answers)) ?? nil ?? [:]
        answers = raw.compactMapValues { $0 }
        marks = (try? c.decodeIfPresent([Mark].self, forKey: .marks)) ?? nil ?? []
        ending = (try? c.decodeIfPresent(Ending.self, forKey: .ending)) ?? nil
        durationSeconds = try? c.decodeIfPresent(Double.self, forKey: .durationSeconds)
        status = (try? c.decodeIfPresent(String.self, forKey: .status)) ?? "measured"
    }
    public init(answers: [String: Answer] = [:], marks: [Mark] = [], ending: Ending? = nil, status: String = "done") {
        self.answers = answers; self.marks = marks; self.ending = ending; self.status = status; durationSeconds = nil
    }

    public static func load(in directory: URL) -> TasteResult? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent("taste.json")) else { return nil }
        return try? JSONDecoder().decode(TasteResult.self, from: data)
    }
    /// The answers sure enough to prefill a question, and only ones that name a real choice.
    public func confident(using questions: TasteQuestions, atLeast floor: Double = 0.5) -> [String: Answer] {
        answers.filter { id, answer in answer.confidence >= floor && questions.question(id)?.choice(answer.choice) != nil }
    }
    public var foundMarks: Bool { !marks.isEmpty }
    /// The ending segment as a file next to taste.json, when the job extracted one and it is there.
    public func endingFile(in directory: URL) -> URL? {
        guard let name = ending?.file, !name.isEmpty else { return nil }
        let url = name.hasPrefix("/") ? URL(fileURLWithPath: name) : directory.appendingPathComponent(name)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }
}
