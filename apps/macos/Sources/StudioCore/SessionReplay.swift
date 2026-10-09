import Foundation

/// Rebuilds what the console's session.json looked like at an earlier moment of a finished run, so a run can be replayed
/// "as if live". Pure: it only cuts and re-labels the final session by the timestamps it carries.
///
/// Rules: activity lines after `time` are dropped. A step is present once decided (`updated <= time`); before that, if the director had
/// pushed it ("Ready for you: the story") it is shown `awaiting` until the person answered, then `working` until the decision.
/// The build step exists from the animatic's approval; its scenes turn done as their animator stills appear on disk.
public enum SessionReplay {
    public static func snapshot(at time: Date, final: SessionSnapshot, projectRoot: URL?) -> SessionSnapshot {
        let raw = final.raw
        let lines = raw["activity"].array.compactMap { entry -> (Date, String, String, JSONValue)? in
            guard let message = entry["msg"].string, let t = entry["t"].string.flatMap(DirectorTelemetry.parseDate) else { return nil }
            return (t, message, entry["level"].string ?? "info", entry)
        }
        // For each step: its pushes and the person's answers, from the activity lines.
        var pushes: [String: [Date]] = [:]
        var answers: [Date] = lines.filter { $0.2 == "you" }.map { $0.0 }
        answers.sort()
        for (t, message, _, _) in lines {
            if let (step, kind) = FilmProgressEngine.stepMention(message), kind == .pushed { pushes[step, default: []].append(t) }
        }

        var steps: [String: JSONValue] = [:]
        var newest: (String, Date)?
        for (name, payload) in raw["steps"].object {
            let updated = payload["updated"].string.flatMap(DirectorTelemetry.parseDate)
            var visible: JSONValue?
            if let updated, updated <= time { visible = payload }
            else if let push = pushes[name]?.filter({ $0 <= time }).max(), updated == nil || push < updated! {
                var object = payload.object
                let answered = answers.contains { $0 > push && $0 <= time }
                object["status"] = .string(answered ? "working" : "awaiting")
                object["updated"] = .string(iso(push))
                for key in ["decision", "by", "sent"] { object[key] = nil }
                visible = .object(object)
            } else if name == "build", let animatic = raw["steps"]["animatic"]["updated"].string.flatMap(DirectorTelemetry.parseDate), animatic <= time {
                var object = payload.object
                object["status"] = .string("working")
                object["updated"] = .string(iso(animatic))
                for key in ["decision", "by"] { object[key] = nil }
                visible = .object(object)
            }
            guard var value = visible else { continue }
            if name == "build" { value = buildStep(value, finalUpdated: updated, time: time, projectRoot: projectRoot) }
            if name == "brief", let push = pushes["brief"]?.min(), push > time {
                var object = value.object; object["findings"] = nil; value = .object(object)
            }
            steps[name] = value
            let stamp = value["updated"].string.flatMap(DirectorTelemetry.parseDate) ?? time
            if newest == nil || stamp >= newest!.1 { newest = (name, stamp) }
        }
        let awaiting = steps.first { $0.value["status"].string == "awaiting" }?.key
        let visibleLines = lines.filter { $0.0 <= time }
        var out: [String: JSONValue] = [:]
        out["title"] = raw["title"]
        out["current"] = .string(awaiting ?? newest?.0 ?? "brief")
        out["steps"] = .object(steps)
        out["activity"] = .array(visibleLines.map(\.3))
        out["updated"] = .string(iso(time))
        if awaiting == nil, let last = visibleLines.last(where: { $0.2 == "info" || $0.2 == "ok" }) {
            out["working"] = .object(["msg": .string(last.1), "t": .string(iso(last.0))])
        }
        out["app"] = raw["app"]
        let data = (try? JSONEncoder().encode(JSONValue.object(out))) ?? Data()
        return (try? SessionSnapshot(data: data)) ?? SessionSnapshot()
    }

    /// Start of a replay: the first moment the run has anything to show.
    public static func firstEvent(of session: SessionSnapshot) -> Date? {
        session.raw["activity"].array.compactMap { $0["t"].string.flatMap(DirectorTelemetry.parseDate) }.min()
    }
    public static func lastEvent(of session: SessionSnapshot) -> Date? {
        session.raw["activity"].array.compactMap { $0["t"].string.flatMap(DirectorTelemetry.parseDate) }.max()
    }

    static func buildStep(_ value: JSONValue, finalUpdated: Date?, time: Date, projectRoot: URL?) -> JSONValue {
        guard let finalUpdated, time < finalUpdated else { return value }
        var object = value.object
        object["status"] = .string("working")
        object["scenes"] = .array(value["scenes"].array.map { scene in
            var s = scene.object
            var done = false
            if let frame = scene["frame"].string, let root = projectRoot {
                let url = root.appendingPathComponent(frame)
                if let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate { done = date <= time }
            }
            s["state"] = .string(done ? "done" : "working")
            return .object(s)
        })
        return .object(object)
    }

    static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}

/// Reads a (huge) director.log forward in simulated time, for the DEBUG replay: `lines(upTo:)` returns every complete line stamped at or
/// before the replay clock. Lines without a timestamp inherit the last one seen. One pass, bounded memory.
public final class ReplayLogReader {
    private let file: URL
    private var offset: UInt64 = 0
    private var buffered: [(time: Date, line: String)] = []
    private var lastTime: Date?
    private var exhausted = false

    public init(file: URL) { self.file = file }

    public var isAtEnd: Bool { exhausted && buffered.isEmpty }
    public func rewind() { offset = 0; buffered = []; lastTime = nil; exhausted = false }

    public func lines(upTo time: Date) -> [String] {
        var out: [String] = []
        while true {
            if buffered.isEmpty && !exhausted { fill() }
            guard let first = buffered.first, first.time <= time else { break }
            out.append(first.line)
            buffered.removeFirst()
        }
        return out
    }

    private func fill() {
        let read = DirectorUsageStore.readLines(file: file, from: offset, maxBytes: 4_000_000)
        if read.lines.isEmpty && read.offset == offset { exhausted = true; return }
        offset = read.offset
        var batch: [(Date, String)] = []
        for line in read.lines {
            if let range = line.range(of: "\"timestamp\":\""), let stamp = DirectorTelemetry.parseDate(String(line[range.upperBound...].prefix(24))) { lastTime = stamp }
            guard let lastTime else { continue }
            batch.append((lastTime, line))
        }
        buffered = batch.map { (time: $0.0, line: $0.1) }
    }
}

/// Where renders ran in a finished log, so a replay can animate their progress (the real tool result only appears when the render ends).
public enum ReplayRenderSchedule {
    public struct Segment: Equatable, Sendable {
        public var toolID: String
        public var start: Date
        public var end: Date
        public var totalFrames: Int
    }

    /// One pass over director.log: render commands (start) and tool results that carry "Streaming frame N/TOTAL" (end).
    public static func scan(file: URL) -> [Segment] {
        var starts: [String: Date] = [:]
        var segments: [Segment] = []
        var offset: UInt64 = 0
        var lastTime: Date?
        while true {
            let read = DirectorUsageStore.readLines(file: file, from: offset)
            if read.lines.isEmpty && read.offset == offset { break }
            offset = read.offset
            for line in read.lines {
                if let r = line.range(of: "\"timestamp\":\""), let t = DirectorTelemetry.parseDate(String(line[r.upperBound...].prefix(24))) { lastTime = t }
                guard let time = lastTime else { continue }
                if line.hasPrefix("{\"type\":\"assistant\""), line.contains("hyperframes render") || line.contains("finish.mjs"), !line.contains("--help"),
                   let id = firstMatch(#""id":"(toolu_[A-Za-z0-9]+)","name":"Bash""#, in: line) { starts[id] = time }
                else if line.hasPrefix("{\"type\":\"user\""), line.contains("Streaming frame") || line.contains("Render complete"),
                        let id = firstMatch(#""tool_use_id":"(toolu_[A-Za-z0-9]+)""#, in: line), let start = starts[id] {
                    let total = firstMatch(#"\\"?totalFrames\\"?:(\d+)"#, in: line).flatMap(Int.init) ?? 900
                    segments.append(Segment(toolID: id, start: start, end: time, totalFrames: total))
                    starts[id] = nil
                }
            }
        }
        return segments
    }

    /// Progress text as the tool would print it `fraction` of the way through.
    public static func text(totalFrames: Int, fraction: Double) -> String {
        let f = min(1, max(0, fraction))
        let done = max(1, Int(Double(totalFrames) * f))
        return "[INFO] {\"totalFrames\":\(totalFrames)}\n  ████  \(25 + Int(f * 55))%  Streaming frame \(done)/\(totalFrames) (3 workers)"
    }

    static func firstMatch(_ pattern: String, in text: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern), let m = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text) else { return nil }
        return String(text[r])
    }
}
