import Foundation

/// One hero move from a story payload's `moves[]`: a short looping rough of the idea, plus the beat it lands on.
/// Every field but `title` is optional on the wire; an older payload without `moves` simply has none.
public struct StoryMove: Identifiable, Equatable, Sendable {
    public let id: String
    public var title: String, move: String, says: String
    /// 1-based beat index, when the payload names one.
    public var beat: Int?
    public var video: String?, strip: String?, poster: String?

    public init(id: String, title: String, move: String = "", says: String = "", beat: Int? = nil, video: String? = nil, strip: String? = nil, poster: String? = nil) {
        self.id = id; self.title = title; self.move = move; self.says = says; self.beat = beat
        self.video = video; self.strip = strip; self.poster = poster
    }

    public init?(_ json: JSONValue, index: Int) {
        let title = (json["title"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let move = (json["move"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty || !move.isEmpty else { return nil }
        self.init(id: json["id"].identifier ?? "move-\(index + 1)", title: title.isEmpty ? "Move \(index + 1)" : title, move: move,
                  says: json["says"].string ?? "", beat: json["beat"].number.flatMap { $0.isFinite && $0 >= 1 ? Int($0) : nil },
                  video: Self.path(json["video"]), strip: Self.path(json["strip"]), poster: Self.path(json["poster"]))
    }

    /// Up to three moves; a missing or malformed `moves` is an empty list.
    public static func parse(_ json: JSONValue) -> [StoryMove] {
        json.array.enumerated().compactMap { StoryMove($1, index: $0) }.prefix(3).map { $0 }
    }

    /// The carrier line: nil when the story names none.
    public static func carrier(_ json: JSONValue) -> String? {
        let text = (json.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    private static func path(_ json: JSONValue) -> String? {
        guard let text = json.string, !text.isEmpty else { return nil }
        return text
    }

    /// Seconds into the film at which a 1-based beat starts, given each beat's duration.
    public static func start(ofBeat beat: Int, durations: [Double]) -> Double {
        durations.prefix(max(0, beat - 1)).reduce(0, +)
    }
}
