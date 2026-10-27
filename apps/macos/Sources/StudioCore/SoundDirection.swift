import Foundation

/// Voiceover choice. Mirrors `fields.narration` (bool true / false / the string "recommend").
public enum SoundVoiceover: String, CaseIterable, Identifiable, Sendable {
    case with, without, recommend
    public var id: String { rawValue }
    public var title: String {
        switch self { case .with: "With voiceover"; case .without: "Without voiceover"; case .recommend: "Recommend for me" }
    }
    /// The Brief `fields.narration` value: a bool when explicit, the string "recommend" otherwise.
    public var narration: JSONValue {
        switch self { case .with: .bool(true); case .without: .bool(false); case .recommend: .string("recommend") }
    }
}

/// How energetic the sound should feel (perceived energy, density, development). NOT `FilmPace`, the director's working speed,
/// and not a BPM.
public enum SoundPace: String, CaseIterable, Identifiable, Sendable {
    case slow, moderate, fast, recommend
    public var id: String { rawValue }
    public var title: String {
        switch self { case .slow: "Slow"; case .moderate: "Moderate"; case .fast: "Fast"; case .recommend: "Recommend for me" }
    }
}

public enum SoundFeeling: String, CaseIterable, Identifiable, Sendable {
    case calm, warm, playful, bold, dramatic, custom, unset
    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .calm: "Calm"; case .warm: "Warm"; case .playful: "Playful"; case .bold: "Bold"
        case .dramatic: "Dramatic"; case .custom: "Custom"; case .unset: "Recommend for me"
        }
    }
}

public enum SoundEffects: String, CaseIterable, Identifiable, Sendable {
    case subtle, expressive, minimalNone = "minimal_none", unset
    public var id: String { rawValue }
    public var title: String {
        switch self { case .subtle: "Subtle"; case .expressive: "Expressive"; case .minimalNone: "Minimal/none"; case .unset: "Recommend for me" }
    }
}

public enum SoundMusicSource: String, CaseIterable, Identifiable, Sendable {
    case recommend, userTrack = "user_track", none
    public var id: String { rawValue }
    public var title: String {
        switch self { case .recommend: "Recommend music"; case .userTrack: "Use my track"; case .none: "No music" }
    }
}

/// One of the four editable starting presets. `apply(to:)` sets independent values and never overwrites an explicit key.
public struct SoundPreset: Identifiable, Equatable, Sendable {
    public let id: String
    public let title: String
    public let summary: String
    let voiceover: SoundVoiceover, pace: SoundPace, feeling: SoundFeeling, effects: SoundEffects

    public static let all: [SoundPreset] = [
        SoundPreset(id: "calm_explanation", title: "Calm explanation", summary: "Voiceover, a restrained bed, subtle cues.",
                    voiceover: .with, pace: .slow, feeling: .calm, effects: .subtle),
        SoundPreset(id: "upbeat_product_launch", title: "Upbeat product launch", summary: "Energetic music, expressive selected cues; you pick the voice.",
                    voiceover: .recommend, pace: .fast, feeling: .playful, effects: .expressive),
        SoundPreset(id: "fast_visual_showcase", title: "Fast visual showcase", summary: "No voiceover, a music-led edit.",
                    voiceover: .without, pace: .fast, feeling: .bold, effects: .subtle),
        SoundPreset(id: "cinematic_reveal", title: "Cinematic reveal", summary: "Spacious opening, developing music, selected prominent events.",
                    voiceover: .recommend, pace: .moderate, feeling: .dramatic, effects: .expressive),
    ]
    public static func named(_ id: String) -> SoundPreset? { all.first { $0.id == id } }

    /// Sets this preset's values on `sound` (keys the person set explicitly stay as they are) and records the preset id.
    public func apply(to sound: inout SoundDirection) {
        if !sound.explicit.contains(SoundDirection.Key.voiceover) { sound.voiceover = voiceover }
        if !sound.explicit.contains(SoundDirection.Key.pace) { sound.pace = pace }
        if !sound.explicit.contains(SoundDirection.Key.feeling) { sound.feeling = feeling; sound.feelingCustom = nil }
        if !sound.explicit.contains(SoundDirection.Key.effects) { sound.effects = effects }
        sound.preset = id
    }
}

/// The person's compact sound choices (Brief and Look). Independent of `FilmPace`, the model plan and provider setup.
/// JSON record (`fields.sound`, `audio/sound-choices.json`): `{version, revision, source, choices:{voiceover, pace, feeling,
/// feeling_custom, effects, music_source, user_track}, preset, explicit:[keys]}`; snake_case in JSON, camelCase here.
public struct SoundDirection: Codable, Equatable, Sendable {
    public enum Key {
        public static let voiceover = "voiceover", pace = "pace", feeling = "feeling", effects = "effects", musicSource = "music_source"
        public static let all: [String] = [voiceover, pace, feeling, effects, musicSource]
    }
    public var voiceover: SoundVoiceover
    public var pace: SoundPace
    public var feeling: SoundFeeling
    public var feelingCustom: String?
    public var effects: SoundEffects
    public var musicSource: SoundMusicSource
    public var userTrackPath: String?
    public var preset: String?
    /// Which of `Key.all` the person set themselves. Presets and recommendations never add to or overwrite these.
    public var explicit: Set<String>
    public var revision: Int
    public var source: String

    public init(voiceover: SoundVoiceover = .recommend, pace: SoundPace = .recommend, feeling: SoundFeeling = .unset, feelingCustom: String? = nil,
                effects: SoundEffects = .unset, musicSource: SoundMusicSource = .recommend, userTrackPath: String? = nil,
                preset: String? = nil, explicit: Set<String> = [], revision: Int = 0, source: String = "studio") {
        self.voiceover = voiceover; self.pace = pace; self.feeling = feeling; self.feelingCustom = feelingCustom
        self.effects = effects; self.musicSource = musicSource; self.userTrackPath = userTrackPath
        self.preset = preset; self.explicit = explicit.intersection(Key.all); self.revision = revision; self.source = source
    }

    /// Sets one choice as the person's own (adds it to `explicit`). Use these from the UI instead of assigning directly.
    public mutating func choose(voiceover value: SoundVoiceover) { voiceover = value; explicit.insert(Key.voiceover) }
    public mutating func choose(pace value: SoundPace) { pace = value; explicit.insert(Key.pace) }
    public mutating func choose(feeling value: SoundFeeling, custom: String? = nil) {
        feeling = value; feelingCustom = value == .custom ? custom : nil; explicit.insert(Key.feeling)
    }
    public mutating func choose(effects value: SoundEffects) { effects = value; explicit.insert(Key.effects) }
    public mutating func choose(musicSource value: SoundMusicSource, trackPath: String? = nil) {
        musicSource = value; userTrackPath = value == .userTrack ? trackPath : nil; explicit.insert(Key.musicSource)
    }
    /// Hands a choice back to "Recommend for me" (and drops it from `explicit`).
    public mutating func recommend(_ key: String) {
        switch key {
        case Key.voiceover: voiceover = .recommend
        case Key.pace: pace = .recommend
        case Key.feeling: feeling = .unset; feelingCustom = nil
        case Key.effects: effects = .unset
        case Key.musicSource: musicSource = .recommend; userTrackPath = nil
        default: return
        }
        explicit.remove(key)
    }
    public mutating func apply(_ preset: SoundPreset) { preset.apply(to: &self) }

    /// True when every choice is still "recommend": nothing the person has said.
    public var isAllRecommend: Bool {
        voiceover == .recommend && pace == .recommend && feeling == .unset && effects == .unset && musicSource == .recommend && explicit.isEmpty
    }

    // MARK: JSON bridge

    /// Lenient: unknown values read as recommend/unset, a missing `choices` reads as all-recommend, a non-object is nil.
    public init?(json: JSONValue) {
        guard case .object = json else { return nil }
        let c = json["choices"]
        func text(_ key: String) -> String? { c[key].string?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty }
        let voice: SoundVoiceover
        switch c[Key.voiceover] {
        case .bool(true): voice = .with
        case .bool(false): voice = .without
        default: voice = text(Key.voiceover).flatMap(SoundVoiceover.init(rawValue:)) ?? .recommend
        }
        let feelingValue = text(Key.feeling).flatMap(SoundFeeling.init(rawValue:)) ?? .unset
        let custom = text("feeling_custom")
        self.init(voiceover: voice,
                  pace: text(Key.pace).flatMap(SoundPace.init(rawValue:)) ?? .recommend,
                  feeling: feelingValue == .custom && custom == nil ? .unset : feelingValue,
                  feelingCustom: feelingValue == .custom ? custom : nil,
                  effects: text(Key.effects).flatMap(SoundEffects.init(rawValue:)) ?? .unset,
                  musicSource: text(Key.musicSource).flatMap(SoundMusicSource.init(rawValue:)) ?? .recommend,
                  userTrackPath: text("user_track"),
                  preset: json["preset"].string.flatMap { SoundPreset.named($0) }?.id,
                  explicit: Set(json["explicit"].array.compactMap(\.string)),
                  revision: json["revision"].number.map { max(0, Int($0)) } ?? 0,
                  source: json["source"].string ?? "studio")
        if musicSource != .userTrack { userTrackPath = nil }
    }

    public var json: JSONValue {
        var choices: [String: JSONValue] = [
            Key.voiceover: .string(voiceover.rawValue), Key.pace: .string(pace.rawValue), Key.feeling: .string(feeling.rawValue),
            Key.effects: .string(effects.rawValue), Key.musicSource: .string(musicSource.rawValue),
        ]
        if feeling == .custom, let feelingCustom, !feelingCustom.isEmpty { choices["feeling_custom"] = .string(feelingCustom) }
        if musicSource == .userTrack, let userTrackPath, !userTrackPath.isEmpty { choices["user_track"] = .string(userTrackPath) }
        var root: [String: JSONValue] = [
            "version": .number(1), "revision": .number(Double(revision)), "source": .string(source),
            "choices": .object(choices), "explicit": .array(explicit.sorted().map { .string($0) }),
        ]
        if let preset { root["preset"] = .string(preset) }
        return .object(root)
    }

    public init(from decoder: Decoder) throws {
        let value = try JSONValue(from: decoder)
        guard let parsed = SoundDirection(json: value) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "sound is not an object"))
        }
        self = parsed
    }
    public func encode(to encoder: Encoder) throws { try json.encode(to: encoder) }

    // MARK: Compact text for the UI

    /// What the choices resolve to, one short line each, for the compact Sound section. The Node resolver
    /// (`resolveSound`) is the authority; this is the plain-words preview of the documented mapping.
    public var resolvedSummary: [String] {
        var lines: [String] = []
        switch voiceover {
        case .with: lines.append("Voiceover: yes. Music sits under the voice.")
        case .without: lines.append("Voiceover: none. Music and effects carry the film.")
        case .recommend: lines.append("Voiceover: the director recommends one and shows why.")
        }
        lines.append(pace == .recommend
            ? "Pace: the director picks the sound energy to fit the story."
            : "Pace: \(pace.title.lowercased()) energy, density and development. Separate from tempo and from director speed.")
        switch feeling {
        case .unset: lines.append("Feeling: the director recommends one.")
        case .custom: lines.append("Feeling: \(feelingCustom ?? "custom").")
        default: lines.append("Feeling: \(feeling.title.lowercased()).")
        }
        lines.append("Effects: \(effectsResolution)")
        switch musicSource {
        case .recommend: lines.append("Music: recommended from licensed or local tracks; nothing is generated or spent without your OK.")
        case .userTrack: lines.append(userTrackPath.map { "Music: your track, \(($0 as NSString).lastPathComponent)." } ?? "Music: your track (choose a file).")
        case .none: lines.append("Music: none.")
        }
        return lines
    }

    /// The effect role the Effects choice resolves to, in words.
    public var effectsResolution: String {
        switch effects {
        case .subtle: "Subtle, sparse cues only where they help."
        case .expressive: "Expressive, a cue for each real action, selected prominent hits allowed."
        case .minimalNone:
            voiceover == .without && musicSource == .none
                ? "Minimal/none, no effects (fully silent film)."
                : "Minimal, only a signature moment or two (capped)."
        case .unset: "the director recommends a level and shows it."
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
