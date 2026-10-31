import Foundation

/// One shot of a story concept as the Story stage shows it (`boards[].shots[]` in the story payload).
public struct StoryBoardShot: Identifiable, Equatable, Sendable {
    public let id: String
    /// Seconds into the film, when the payload says.
    public var t: Double?
    /// The shot's own tile image, when one was rendered.
    public var image: String?
    public var words: String, move: String, carrierState: String, transition: String
    /// The move's human name (`move_name`), resolved by console.mjs; `move` stays the id.
    public var moveName: String = ""
    public var moveTitle: String { moveName.isEmpty ? move : moveName }
    public var see: String

    public init(id: String, t: Double? = nil, image: String? = nil, words: String = "", move: String = "", carrierState: String = "", transition: String = "", see: String = "") {
        self.id = id; self.t = t; self.image = image; self.words = words; self.move = move
        self.carrierState = carrierState; self.transition = transition; self.see = see
    }

    public init?(_ json: JSONValue, index: Int) {
        guard case .object = json else { return nil }
        func s(_ key: String) -> String { (json[key].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
        let t = json["t"].number ?? json["t"].string.flatMap(Double.init)
        let image = s("image")
        self.init(id: json["id"].identifier ?? String(format: "s%02d", index + 1), t: t, image: image.isEmpty ? nil : image,
                  words: s("words"), move: s("move"), carrierState: s("carrier_state"), transition: s("transition"), see: s("see"))
        moveName = s("move_name")
    }
}

/// One concept's full story board: the rendered board image, every shot as a tile, and the concept's visual identity as chips.
/// Payload: `boards: [{concept, image, shots: [{id, t, image?, words, move, carrier_state, transition}], style_world?, carrier?, signature_moment?, sound_mode?}]`.
public struct StoryBoard: Identifiable, Equatable, Sendable {
    public var id: String { concept }
    public let concept: String
    public var image: String?
    public var shots: [StoryBoardShot]
    public var styleWorldName: String?
    public var styleWorld: String?, carrier: String?, signatureMoment: String?, soundMode: String?

    public init(concept: String, image: String? = nil, shots: [StoryBoardShot] = [], styleWorld: String? = nil, carrier: String? = nil, signatureMoment: String? = nil, soundMode: String? = nil) {
        self.concept = concept; self.image = image; self.shots = shots
        self.styleWorld = styleWorld; self.carrier = carrier; self.signatureMoment = signatureMoment; self.soundMode = soundMode
    }

    /// The chips under the title, in reading order: style world, carrier, signature moment, sound mode.
    public var chips: [(label: String, value: String)] {
        [("Style world", styleWorldName ?? styleWorld), ("Carrier", carrier), ("Signature moment", signatureMoment), ("Sound", soundMode.map(Self.soundTitle))]
            .compactMap { label, value in value.flatMap { $0.isEmpty ? nil : (label, $0) } }
    }

    public static func soundTitle(_ mode: String) -> String {
        switch mode {
        case "vo-kinetic": "Voice and kinetic type"
        case "instrumental-arc": "Instrumental arc"
        case "sfx-led": "Sound effects lead"
        case "song-lyric": "Song and lyrics"
        default: mode.replacingOccurrences(of: "-", with: " ")
        }
    }

    /// A concept field that is either a plain string or `{what, short, kind}`.
    static func text(_ json: JSONValue) -> String? {
        if let s = json.string, !s.isEmpty { return s }
        for key in ["short", "what", "name"] { if let s = json[key].string, !s.isEmpty { return s } }
        return nil
    }

    public init?(_ json: JSONValue) {
        guard let concept = json["concept"].identifier ?? json["id"].identifier else { return nil }
        let image = (json["image"].string ?? json["board"].string ?? "")
        self.init(concept: concept, image: image.isEmpty ? nil : image,
                  shots: json["shots"].array.enumerated().compactMap { StoryBoardShot($1, index: $0) },
                  styleWorld: Self.text(json["style_world"]), carrier: Self.text(json["carrier"]),
                  signatureMoment: Self.text(json["signature_moment"]), soundMode: json["sound_mode"].string)
        styleWorldName = json["style_world_name"].string
    }

    /// Every board in a story payload, keyed by concept id. Boards with neither an image nor shots are dropped. A board missing its
    /// identity fields takes them from the matching story (`stories[].id == concept`).
    public static func parse(payload: JSONValue) -> [String: StoryBoard] {
        var out: [String: StoryBoard] = [:]
        for value in payload["boards"].array {
            guard var board = StoryBoard(value), board.image != nil || !board.shots.isEmpty else { continue }
            if let story = payload["stories"].array.first(where: { $0["id"].identifier == board.concept }) {
                board.styleWorld = board.styleWorld ?? text(story["style_world"])
                board.carrier = board.carrier ?? text(story["carrier"])
                board.signatureMoment = board.signatureMoment ?? text(story["signature_moment"])
                board.soundMode = board.soundMode ?? story["sound_mode"].string
            }
            out[board.concept] = board
        }
        return out
    }

    /// The `comment` action value for a note on one shot: the concept is the scene, the shot id travels with it.
    public static func noteValue(concept: String, shot: StoryBoardShot) -> JSONValue {
        .object(["scene": .string(concept), "concept": .string(concept), "shot_id": .string(shot.id),
                 "t": .number(shot.t ?? 0), "scope": .string("shot")])
    }
}
