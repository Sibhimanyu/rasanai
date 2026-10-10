import Foundation

/// One on-screen line of a beat and the motion that means it, from a story payload's `beats[].shows`.
/// Absent or malformed `shows` is an empty list (older payloads fall back to the beat's `visual`).
public struct StoryShow: Identifiable, Equatable, Sendable {
    public var id: Int
    public var line: String, show: String
    public var builtFrom: String, handoff: String

    public init(id: Int, line: String, show: String, builtFrom: String = "", handoff: String = "") {
        self.id = id; self.line = line; self.show = show; self.builtFrom = builtFrom; self.handoff = handoff
    }

    public static func parse(_ json: JSONValue) -> [StoryShow] {
        var out: [StoryShow] = []
        for (i, row) in json.array.enumerated() {
            let line = (row["line"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let show = (row["show"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !line.isEmpty || !show.isEmpty else { continue }
            out.append(StoryShow(id: i, line: line, show: show,
                                 builtFrom: (row["built_from"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                                 handoff: (row["handoff"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)))
        }
        return out
    }
}
