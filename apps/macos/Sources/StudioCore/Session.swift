import Foundation

/// Preserve the existing console's payloads without inventing a second project format.
public enum JSONValue: Codable, Sendable, Equatable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null

    public init(from decoder: Decoder) throws {
        let box = try decoder.singleValueContainer()
        if box.decodeNil() { self = .null }
        else if let value = try? box.decode(Bool.self) { self = .bool(value) }
        else if let value = try? box.decode(Double.self) { self = .number(value) }
        else if let value = try? box.decode(String.self) { self = .string(value) }
        else if let value = try? box.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try box.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var box = encoder.singleValueContainer()
        switch self {
        case .object(let value): try box.encode(value)
        case .array(let value): try box.encode(value)
        case .string(let value): try box.encode(value)
        case .number(let value): try box.encode(value)
        case .bool(let value): try box.encode(value)
        case .null: try box.encodeNil()
        }
    }

    public subscript(_ key: String) -> JSONValue { object[key] ?? .null }
    public var object: [String: JSONValue] { if case .object(let value) = self { return value }; return [:] }
    public var array: [JSONValue] { if case .array(let value) = self { return value }; return [] }
    public var string: String? { if case .string(let value) = self { return value }; return nil }
    public var number: Double? { if case .number(let value) = self { return value }; return nil }
    public var identifier: String? {
        if let string { return string }
        if let number, number.isFinite { return number.rounded() == number ? String(format: "%.0f", number) : String(number) }
        return nil
    }
}

public enum ReviewStage: String, CaseIterable, Identifiable, Sendable {
    case brief, story, look, animatic, final
    public var id: String { rawValue }
    public var title: String { rawValue.capitalized }
    public var subtitle: String {
        switch self {
        case .brief: "Give the film a clear starting point."
        case .story: "Choose the story worth telling."
        case .look: "Choose a visual world for this story."
        case .animatic: "Review the rhythm before we build."
        case .final: "Watch the cut. Leave the finishing notes."
        }
    }
    public static func consoleStep(_ step: String) -> Self {
        switch step {
        case "story", "concept": .story
        case "look", "films", "direction", "motion", "transitions": .look
        case "animatic", "scenes", "styleframes", "storyboard", "keyframes", "voice", "music", "reel", "plan", "build": .animatic
        case "render", "final": .final
        default: .brief
        }
    }
}

public struct FilmScene: Identifiable, Sendable, Equatable {
    public let id: String
    public let originalID: JSONValue
    public let title: String
    public let line: String
    public let visual: String
    public let duration: Double
    public let start: Double
    public let thumbnail: String?
    public let state: String?
    public var end: Double { start + duration }
}

public struct ReviewNote: Identifiable, Sendable, Equatable {
    public let id: String
    public let text: String
    public let time: Double
    public let scene: String?
    public let step: String
    public let scope: String
    public let state: String
}

public struct SessionSnapshot: Sendable {
    public let raw: JSONValue
    /// A safe initial UI state when installation resources cannot be read.
    public init() {
        raw = .object(["title": .string("New film"), "current": .string("brief"), "steps": .object([:])])
    }
    public init(data: Data) throws {
        let raw = try JSONDecoder().decode(JSONValue.self, from: data)
        guard case .object = raw, case .object = raw["steps"] else { throw StudioError.invalidSession }
        self.raw = raw
    }
    public var title: String { raw["title"].string ?? "Untitled film" }
    public var currentStep: String { raw["current"].string ?? "brief" }
    public var stage: ReviewStage { .consoleStep(currentStep) }
    public func step(_ name: String) -> JSONValue { raw["steps"][name] }
    public var workingMessage: String? { raw["working"]["msg"].string }
    public var latestActivity: String? { raw["activity"].array.last?["msg"].string }
    public var aspect: String { step("brief")["fields"]["aspect"].string ?? "16:9" }
    public var aspectRatio: Double {
        let parts = aspect.split(separator: ":").compactMap { Double($0) }
        guard parts.count == 2, parts[0] > 0, parts[1] > 0 else { return 16 / 9 }
        return parts[0] / parts[1]
    }
    public var animatic: JSONValue { step("animatic") }
    public var final: JSONValue { step("render") != .null ? step("render") : step("final") }
    public var finalVideo: String? { final["video"].string ?? final["videos"].array.last?.string }
    public var audioFile: String? { animatic["audio"].string ?? animatic["music"]["file"].string }
    public var musicTitle: String { animatic["music"]["title"].string ?? "No music" }
    public var voiceName: String { animatic["voice"]["name"].string ?? "No narration" }
    public var scenes: [FilmScene] { scenes(for: stage) }
    public func scenes(for reviewStage: ReviewStage) -> [FilmScene] {
        let candidates: [JSONValue]
        if reviewStage == .final {
            candidates = [final["scenes"], animatic["scenes"], step("build")["scenes"], step("scenes")["scenes"]]
        } else if currentStep == "build" {
            candidates = [step("build")["scenes"], animatic["scenes"], step("scenes")["scenes"], final["scenes"]]
        } else {
            candidates = [animatic["scenes"], step("build")["scenes"], step("scenes")["scenes"], final["scenes"]]
        }
        let values = candidates.first { !$0.array.isEmpty }?.array ?? []
        var cursor = 0.0
        return values.enumerated().compactMap { index, value in
            guard case .object = value else { return nil }
            let start = value["start"].number.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil } ?? cursor
            let nextStart = index + 1 < values.count ? values[index + 1]["start"].number : nil
            let proposed = value["duration"].number ?? value["duration_s"].number ?? nextStart.map { $0 - start }
                ?? final["duration"].number.map { $0 - start } ?? 4
            let duration = proposed.isFinite && proposed > 0 ? proposed : 4
            let originalID = value["id"] == .null ? JSONValue.number(Double(index + 1)) : value["id"]
            cursor = start + duration
            return FilmScene(id: originalID.identifier ?? String(index + 1), originalID: originalID,
                             title: value["title"].string ?? "Scene \(index + 1)",
                             line: value["line"].string ?? value["on_screen"].string ?? "",
                             visual: value["visual"].string ?? "", duration: duration, start: start,
                             thumbnail: value["frame"].string ?? value["thumb"].string, state: value["state"].string)
        }
    }
    public var duration: Double { duration(for: stage) }
    public func duration(for reviewStage: ReviewStage) -> Double {
        let fallback = reviewStage == .final ? final["duration"].number : nil
        let value = scenes(for: reviewStage).map(\.end).max() ?? fallback ?? step("brief")["fields"]["length_s"].number ?? 0
        return value.isFinite && value > 0 ? value : 0
    }
    public func scene(at time: Double, stage: ReviewStage? = nil) -> FilmScene? {
        let stage = stage ?? self.stage
        let scenes = scenes(for: stage)
        return scenes.first { time >= $0.start && time < $0.end } ?? (time >= duration(for: stage) ? scenes.last : scenes.first)
    }
    public var notes: [ReviewNote] {
        raw["comments"].array.compactMap { value in
            guard let id = value["id"].identifier else { return nil }
            return ReviewNote(id: id, text: value["text"].string ?? "", time: value["t"].number ?? 0,
                              scene: value["scene"].identifier, step: value["step"].string ?? "animatic",
                              scope: value["scope"].string ?? "scene", state: value["state"].string ?? "open")
        }
    }
    public func payload(for stage: ReviewStage) -> JSONValue {
        switch stage {
        case .brief: step("brief")
        case .story: step("story") != .null ? step("story") : step("concept")
        case .look: step("look") != .null ? step("look") : step("films")
        case .animatic: animatic != .null ? animatic : step("build")
        case .final: final
        }
    }
    public func actionStep(for stage: ReviewStage) -> String {
        switch stage {
        case .story: step("story") != .null ? "story" : "concept"
        case .look: step("look") != .null ? "look" : "films"
        case .final: step("render") != .null ? "render" : "final"
        default: stage.rawValue
        }
    }
}

public enum StudioError: LocalizedError {
    case invalidSession, invalidAddress, unavailable(Int), noConnection
    public var errorDescription: String? {
        switch self {
        case .invalidSession: "Choose a RasanAI run containing a valid session.json with a steps object."
        case .invalidAddress: "The run's local console address is invalid. Restart its console and open the run again."
        case .unavailable(let status): "The local console returned HTTP \(status). Restart its console and reconnect."
        case .noConnection: "This run has no active console. Start the RasanAI workflow, then reconnect."
        }
    }
}

public func timecode(_ seconds: Double) -> String {
    let total = Int(max(0, seconds.isFinite ? seconds : 0))
    return String(format: "%02d:%02d", total / 60, total % 60)
}
