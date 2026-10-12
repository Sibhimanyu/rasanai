import Foundation

/// The reference still shown beside a style frame: where it came from and why it is there.
public struct StyleframeReference: Equatable, Sendable {
    public let image: String
    public let source: String?
    public let why: String?
}

/// How the designer framed one beat (`shot` in the payload). Every field is optional text.
public struct StyleframeShot: Equatable, Sendable {
    public let size: String?
    public let angle: String?
    public let hero: String?
    public let focus: String?
    public let light: String?
    public var isEmpty: Bool { [size, angle, hero, focus, light].allSatisfy { $0 == nil } }
    /// "CU · tilt · the Send button", the line under a frame.
    public var summary: String { [size, angle, hero].compactMap { $0 }.joined(separator: " · ") }
}

/// The frame juror's verdict on a frame against its reference.
public enum StyleframeVerdict: String, Sendable {
    case atPar = "at-par", close, below
    public var title: String {
        switch self { case .atPar: "At par"; case .close: "Close"; case .below: "Below" }
    }
}

public struct Styleframe: Identifiable, Equatable, Sendable {
    public let id: String
    public let beat: String?
    public let title: String
    public let image: String
    public let ref: StyleframeReference?
    public let shot: StyleframeShot?
    public let caption: String?
    public let verdict: StyleframeVerdict?
    /// "working" while the designer is redrawing this frame; everything else reads as ready.
    public let state: String?
    public var isWorking: Bool { state == "working" }
}

/// The `styleframes` payload: `{frames: [...], heroes: [ids], sheet, recommended}`, or the older `images` / `captions`.
public struct StyleframesPayload: Equatable, Sendable {
    public let frames: [Styleframe]
    public let heroes: [String]
    public let sheet: String?
    public let recommended: String?
    /// True when the director sent the older `images` / `captions` form.
    public let isLegacy: Bool

    public var hasReferences: Bool { frames.contains { $0.ref != nil } }
    public var belowCount: Int { frames.filter { $0.verdict == .below }.count }

    public init(frames: [Styleframe], heroes: [String] = [], sheet: String? = nil, recommended: String? = nil, isLegacy: Bool = false) {
        self.frames = frames; self.heroes = heroes; self.sheet = sheet; self.recommended = recommended; self.isLegacy = isLegacy
    }

    public init(_ payload: JSONValue) {
        let heroes = payload["heroes"].array.compactMap(\.identifier)
        let sheet = payload["sheet"].string
        let recommended = payload["recommended"].identifier
        if !payload["frames"].array.isEmpty {
            let frames = payload["frames"].array.enumerated().compactMap { index, value in Self.frame(value, index: index) }
            self.init(frames: frames, heroes: heroes, sheet: sheet, recommended: recommended)
        } else {
            let captions = payload["captions"].array
            let frames: [Styleframe] = payload["images"].array.enumerated().compactMap { index, value in
                guard let image = value.string ?? Self.first(value, ["path", "src", "file", "image"]) else { return nil }
                let caption = index < captions.count ? Self.text(captions[index]) : nil
                let title = caption ?? Self.first(value, ["caption", "title"]) ?? "Frame \(index + 1)"
                return Styleframe(id: String(index + 1), beat: nil, title: title, image: image, ref: nil, shot: nil, caption: caption, verdict: nil, state: nil)
            }
            self.init(frames: frames, heroes: heroes, sheet: sheet, recommended: recommended, isLegacy: true)
        }
    }

    private static func frame(_ value: JSONValue, index: Int) -> Styleframe? {
        guard case .object = value, let image = first(value, ["image", "path", "src", "file"]) else { return nil }
        let id = value["id"].identifier ?? String(index + 1)
        let beat = value["beat"].identifier
        let title = first(value, ["title", "name"]) ?? beat.map { "Beat \($0)" } ?? "Frame \(index + 1)"
        var ref: StyleframeReference?
        if let refImage = value["ref"].string ?? first(value["ref"], ["image", "path", "src"]) {
            ref = StyleframeReference(image: refImage, source: first(value["ref"], ["source", "credit"]), why: first(value["ref"], ["why", "reason"]))
        }
        let shotValue = value["shot"]
        let shot = StyleframeShot(size: first(shotValue, ["size"]), angle: first(shotValue, ["angle"]), hero: first(shotValue, ["hero"]),
                                  focus: first(shotValue, ["focus"]), light: first(shotValue, ["light"]))
        return Styleframe(id: id, beat: beat, title: title, image: image, ref: ref, shot: shot.isEmpty ? nil : shot,
                          caption: first(value, ["caption"]), verdict: value["verdict"].string.flatMap(StyleframeVerdict.init(rawValue:)),
                          state: first(value, ["state"]))
    }

    private static func first(_ value: JSONValue, _ keys: [String]) -> String? {
        for key in keys { if let s = value[key].string, !s.isEmpty { return s } }
        return nil
    }
    private static func text(_ value: JSONValue) -> String? {
        if let s = value.string, !s.isEmpty { return s }
        return value.identifier
    }
}

/// What the person's choices on the style frames send to the director.
public struct StyleframeReview: Equatable, Sendable {
    /// Frames marked for a redo, in the order they appear.
    public var redo: Set<String> = []
    /// A comment per frame id.
    public var comments: [String: String] = [:]
    public init() {}

    /// The frames to redo, in grid order, and only ones that exist.
    public func redoIDs(in frames: [Styleframe]) -> [String] { frames.map(\.id).filter { redo.contains($0) } }

    /// The `redo` action value: `{ids: [...], note}`. The note joins the frames' comments so the designer sees why.
    public func redoValue(in frames: [Styleframe], note: String) -> JSONValue {
        .object(["ids": .array(redoIDs(in: frames).map(JSONValue.string)), "note": .string(note)])
    }

    /// The text that travels with a redo: the person's overall note, then each redone frame's own comment.
    public func redoNote(in frames: [Styleframe], overall: String) -> String {
        var lines: [String] = []
        let overall = overall.trimmingCharacters(in: .whitespacesAndNewlines)
        if !overall.isEmpty { lines.append(overall) }
        for frame in frames where redo.contains(frame.id) {
            if let text = comments[frame.id]?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty { lines.append("\(frame.title): \(text)") }
        }
        return lines.joined(separator: "\n")
    }

    /// The `comment` action value for one frame, in the existing shape: the frame id is the scene, the text goes in `note`.
    public static func commentValue(frame id: String) -> JSONValue {
        .object(["scene": .string(id), "frame": .string(id), "t": .number(0), "scope": .string("scene")])
    }

    /// The primary button: "Approve all 8 frames", or "Redo 2 frames".
    public func primaryTitle(frames: Int) -> String {
        let count = redo.count
        if count == 0 { return frames == 1 ? "Approve the frame" : "Approve all \(frames) frames" }
        return "Redo \(count) frame\(count == 1 ? "" : "s")"
    }

    /// "6 to keep · 2 to redo".
    public func counter(frames: Int) -> String {
        let redo = min(self.redo.count, frames)
        return redo == 0 ? "\(frames) frame\(frames == 1 ? "" : "s")" : "\(frames - redo) to keep · \(redo) to redo"
    }
}
