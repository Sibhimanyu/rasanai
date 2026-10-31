import Foundation

/// The juror's verdict on one concept's three hero frames (`concepts[].verdict` in the `styleframes` payload).
public struct ConceptVerdict: Equatable, Sendable {
    /// Mean score 1 to 10.
    public var score: Double?
    /// "yes", "maybe" or "no": would it sit in the reel.
    public var sitsInReel: String?
    public var missing: [String]
    public var overall: String?
    public var rework: [String]

    public var sitsTitle: String? {
        switch sitsInReel { case "yes": "Would sit in the reel"; case "maybe": "Might sit in the reel"; case "no": "Would not sit in the reel"; default: nil }
    }
    public var scoreText: String? { score.map { $0 == $0.rounded() ? String(Int($0)) : String(format: "%.1f", $0) } }
}

public struct ConceptHeroFrame: Identifiable, Equatable, Sendable {
    public let id: String
    public var image: String
    public var caption: String
    public var score: Double?
    public var sitsInReel: String?
    public var missing: [String]
}

/// One concept's style-frames review: its 3 hero frames and, once the juror has seen them, the verdict.
/// Payload: `concepts: [{id, title, style_world?, frames: [{id, image, caption?, score?, sits_in_reel?, missing?}], verdict?: {score, sits_in_reel, missing, overall, rework}, gate?: {ok, action, bar, mean, why}}]`.
public struct StyleframeConcept: Identifiable, Equatable, Sendable {
    public let id: String
    public var title: String
    public var styleWorld: String?
    public var frames: [ConceptHeroFrame]
    public var verdict: ConceptVerdict?
    /// Gate result: nil until the gate has run.
    public var gatePassed: Bool?
    public var gateWhy: [String]

    public init?(_ json: JSONValue, index: Int) {
        guard case .object = json else { return nil }
        let id = json["id"].identifier ?? json["concept"].identifier ?? "concept-\(index + 1)"
        let frames: [ConceptHeroFrame] = json["frames"].array.enumerated().compactMap { i, f in
            let image = f.string ?? f["image"].string ?? f["path"].string
            guard let image, !image.isEmpty else { return nil }
            return ConceptHeroFrame(id: f["id"].identifier ?? "hero-\(i + 1)", image: image, caption: (f["caption"].string ?? f["title"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                                    score: f["score"].number, sitsInReel: f["sits_in_reel"].string ?? f["sits"].string,
                                    missing: Self.list(f["missing"]))
        }
        guard !frames.isEmpty else { return nil }
        let v = json["verdict"]
        var verdict: ConceptVerdict?
        if case .object = v {
            let sits = v["sits_in_reel"].string ?? v["sits"].string
            let scores = frames.compactMap(\.score)
            let mean = v["score"].number ?? v["mean"].number ?? (scores.isEmpty ? nil : scores.reduce(0, +) / Double(scores.count))
            var missing = Self.list(v["missing"])
            if missing.isEmpty { missing = Array(NSOrderedSet(array: frames.flatMap(\.missing)).array.compactMap { $0 as? String }.prefix(6)) }
            verdict = ConceptVerdict(score: mean, sitsInReel: sits, missing: missing, overall: v["overall"].string, rework: Self.list(v["rework"]))
        }
        let gate = json["gate"]
        self.id = id
        self.title = json["title"].string ?? id
        self.styleWorld = json["style_world_name"].string ?? StoryBoard.text(json["style_world"])
        self.frames = Array(frames.prefix(3))
        self.verdict = verdict
        self.gatePassed = gate["ok"].bool ?? gate["action"].string.map { $0 == "build" }
        self.gateWhy = Self.list(gate["why"])
    }

    private static func list(_ json: JSONValue) -> [String] {
        if let s = json.string, !s.isEmpty { return [s] }
        return json.array.compactMap(\.string).filter { !$0.isEmpty }
    }

    /// Parses `concepts` from a styleframes payload (empty for the older per-beat `frames` form).
    public static func parse(_ payload: JSONValue) -> [StyleframeConcept] {
        payload["concepts"].array.enumerated().compactMap { StyleframeConcept($1, index: $0) }
    }

    /// The `redo` value for concepts: `{ids: [concept ids], note}`.
    public static func reworkValue(ids: [String], note: String) -> JSONValue {
        .object(["ids": .array(ids.map(JSONValue.string)), "note": .string(note)])
    }
}
