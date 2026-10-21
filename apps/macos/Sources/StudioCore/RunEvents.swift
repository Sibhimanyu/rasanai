import Foundation

/// The run's own record of when its director ran: `<run>/director-events.jsonl`, one JSON object per line.
/// `Runtime/director-driver.mjs` writes `start`, `freeze`, `thaw` and `exit`; Studio adds `auto-resume` when it resumes by itself.
/// It outlives the app (an update or a quit), so a relaunched Studio can tell a director that is still working from one that
/// stopped, and the progress clock can leave out the time nothing ran (a plan limit, a pause, the app closed).
public struct RunEvent: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case start, freeze, thaw, exit, autoResume = "auto-resume" }
    public var t: Date
    public var event: Kind
    /// The driver's process id (`start`).
    public var pid: Int32?
    /// The director's exit status (`exit`).
    public var code: Int32?
    /// True when the exit was a stop: the person pressed Stop, or the app went away while the director was frozen (`exit`).
    public var stopped: Bool?

    public init(t: Date, event: Kind, pid: Int32? = nil, code: Int32? = nil, stopped: Bool? = nil) {
        self.t = t; self.event = event; self.pid = pid; self.code = code; self.stopped = stopped
    }
}

public enum RunEvents {
    public static let fileName = "director-events.jsonl"

    public static func file(run: URL) -> URL { run.appendingPathComponent(fileName) }

    /// Every readable line, oldest first. Unknown or broken lines are skipped.
    public static func parse(_ text: String) -> [RunEvent] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { d in
            let raw = try d.singleValueContainer().decode(String.self)
            guard let date = DirectorTelemetry.parseDate(raw) else { throw DecodingError.dataCorrupted(.init(codingPath: d.codingPath, debugDescription: raw)) }
            return date
        }
        return text.split(whereSeparator: \.isNewline).compactMap { try? decoder.decode(RunEvent.self, from: Data($0.utf8)) }
            .sorted { $0.t < $1.t }
    }

    /// Disk access: call it from the worker or the store, never from the pure engine.
    public static func load(run: URL) -> [RunEvent] {
        guard let text = try? String(contentsOf: file(run: run), encoding: .utf8) else { return [] }
        return parse(text)
    }

    public static func append(_ event: RunEvent, run: URL) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(event) else { return }
        let url = file(run: run)
        let fm = FileManager.default
        if !fm.fileExists(atPath: url.path) { fm.createFile(atPath: url.path, contents: nil) }
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: data + Data("\n".utf8))
    }

    /// Spans when no director was working: from an `exit` to the next `start`, and from a `freeze` to the next `thaw`/`exit`.
    /// A span still open at the end runs to `now` when `runningNow` is false (or the director is frozen).
    public static func downtime(_ events: [RunEvent], now: Date, runningNow: Bool) -> [(Date, Date)] {
        var windows: [(Date, Date)] = []
        var downSince: Date?
        var frozenSince: Date?
        for e in events {
            switch e.event {
            case .exit:
                if downSince == nil { downSince = frozenSince ?? e.t }
                frozenSince = nil
            case .freeze:
                if downSince == nil, frozenSince == nil { frozenSince = e.t }
            case .thaw:
                if let from = frozenSince { windows.append((from, max(from, e.t))); frozenSince = nil }
            case .start:
                if let from = downSince ?? frozenSince { windows.append((from, max(from, e.t))) }
                downSince = nil; frozenSince = nil
            case .autoResume:
                break
            }
        }
        if let from = downSince ?? frozenSince, !runningNow || frozenSince != nil { windows.append((from, max(from, now))) }
        return windows
    }

    /// The newest `start` with nothing after it but freezes and thaws: the director that should still be alive.
    public static func openStart(_ events: [RunEvent]) -> RunEvent? {
        for e in events.reversed() {
            switch e.event {
            case .start: return e
            case .exit: return nil
            case .freeze, .thaw, .autoResume: continue
            }
        }
        return nil
    }

    /// True when the newest freeze has no thaw after it (the director was paused when the app went away).
    public static func isFrozen(_ events: [RunEvent]) -> Bool {
        for e in events.reversed() {
            switch e.event {
            case .freeze: return true
            case .thaw, .start, .exit: return false
            case .autoResume: continue
            }
        }
        return false
    }

    public static func lastExit(_ events: [RunEvent]) -> RunEvent? { events.last { $0.event == .exit } }
    public static func lastAutoResume(_ events: [RunEvent]) -> Date? { events.last { $0.event == .autoResume }?.t }
}

/// Merges overlapping spans and returns how much of [from, to] they cover.
public enum TimeWindows {
    public static func merge(_ windows: [(Date, Date)]) -> [(Date, Date)] {
        let sorted = windows.filter { $0.1 > $0.0 }.sorted { $0.0 < $1.0 }
        var out: [(Date, Date)] = []
        for w in sorted {
            if let last = out.last, w.0 <= last.1 { out[out.count - 1].1 = max(last.1, w.1) } else { out.append(w) }
        }
        return out
    }

    public static func covered(_ windows: [(Date, Date)], from: Date, to: Date) -> TimeInterval {
        guard to > from else { return 0 }
        return merge(windows).reduce(0) { $0 + max(0, min($1.1, to).timeIntervalSince(max($1.0, from))) }
    }
}
