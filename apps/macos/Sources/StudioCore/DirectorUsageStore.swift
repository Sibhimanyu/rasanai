import Foundation

/// Reads the director's output incrementally and keeps `<run>/studio-usage.json` so totals survive relaunch.
public enum DirectorUsageStore {
    public static let fileName = "studio-usage.json"

    public struct Stored: Codable, Sendable {
        public var telemetry: DirectorTelemetry
        /// Byte offset into director.log already parsed.
        public var logOffset: UInt64
        public var rolloutPath: String?
        public var rolloutOffset: UInt64
        public init(telemetry: DirectorTelemetry, logOffset: UInt64, rolloutPath: String?, rolloutOffset: UInt64) {
            self.telemetry = telemetry; self.logOffset = logOffset; self.rolloutPath = rolloutPath; self.rolloutOffset = rolloutOffset
        }
    }

    public static func url(run: URL) -> URL { run.appendingPathComponent(fileName) }

    public static func load(run: URL) -> Stored? {
        guard let data = try? Data(contentsOf: url(run: run)) else { return nil }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(Stored.self, from: data)
    }

    public static func save(_ stored: Stored, run: URL) {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(stored) else { return }
        try? data.write(to: url(run: run), options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url(run: run).path)
    }

    /// Totals only (no log parsing): what a queue row or the finished screen shows.
    public static func summary(run: URL) -> DirectorTelemetry? {
        guard var telemetry = load(run: run)?.telemetry else { return nil }
        telemetry.closeSession()
        return telemetry
    }

    /// Complete lines appended to `file` after `offset`. A trailing partial line is left for the next read.
    public static func readLines(file: URL, from offset: UInt64, maxBytes: Int = 8_000_000) -> (lines: [String], offset: UInt64) {
        guard let handle = try? FileHandle(forReadingFrom: file) else { return ([], offset) }
        defer { try? handle.close() }
        let size = (try? handle.seekToEnd()) ?? 0
        var start = offset
        if size < start { start = 0 } // the file was replaced
        guard size > start else { return ([], start) }
        try? handle.seek(toOffset: start)
        guard let data = try? handle.read(upToCount: maxBytes), !data.isEmpty else { return ([], start) }
        guard let lastNewline = data.lastIndex(of: 0x0A) else {
            // No newline yet: wait, unless the chunk is huge (a very long line), then skip it.
            return data.count >= maxBytes ? ([], start + UInt64(data.count)) : ([], start)
        }
        let complete = data[data.startIndex...lastNewline]
        let text = String(decoding: complete, as: UTF8.self)
        let lines = text.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
        return (lines, start + UInt64(complete.count))
    }
}

/// Turns the raw JSON stream in director.log into the readable lines the log sheet has always shown.
public enum DirectorLogRenderer {
    public static func readable(_ raw: String) -> String {
        var out: [String] = []
        for line in raw.split(separator: "\n", omittingEmptySubsequences: true) {
            if let rendered = render(String(line)) { out.append(contentsOf: rendered) }
        }
        return out.joined(separator: "\n")
    }

    /// The tail of the log, rendered. Drops a first line cut in half by the tail.
    public static func readableTail(file: URL, maxBytes: Int = 400_000) -> String {
        guard let handle = try? FileHandle(forReadingFrom: file) else { return "No director output yet." }
        defer { try? handle.close() }
        let size = (try? handle.seekToEnd()) ?? 0
        let cut = size > UInt64(maxBytes)
        try? handle.seek(toOffset: cut ? size - UInt64(maxBytes) : 0)
        var text = String(decoding: (try? handle.readToEnd()) ?? Data(), as: UTF8.self)
        if cut, let newline = text.firstIndex(of: "\n") { text = String(text[text.index(after: newline)...]) }
        return readable(text).replacingOccurrences(of: "[?&]t=[a-f0-9]{24}", with: "?t=[redacted]", options: .regularExpression)
    }

    static func render(_ line: String) -> [String]? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.first == "{" else { return trimmed.isEmpty ? nil : [line] }
        guard let data = trimmed.data(using: .utf8), let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return [line] }
        switch object["type"] as? String {
        case "assistant":
            guard let blocks = (object["message"] as? [String: Any])?["content"] as? [[String: Any]] else { return nil }
            var lines: [String] = []
            for block in blocks {
                if block["type"] as? String == "text", let text = block["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { lines.append(text) }
                if block["type"] as? String == "tool_use" {
                    let result = ToolDescription.describe(name: block["name"] as? String ?? "Tool", input: block["input"] as? [String: Any] ?? [:])
                    lines.append("→ \(block["name"] as? String ?? "Tool"): \(result.summary)")
                }
            }
            return lines.isEmpty ? nil : lines
        case "user":
            guard let blocks = (object["message"] as? [String: Any])?["content"] as? [[String: Any]] else { return nil }
            let errors = blocks.filter { $0["type"] as? String == "tool_result" && $0["is_error"] as? Bool == true }
            return errors.compactMap { block -> String? in
                let content = (block["content"] as? String) ?? ((block["content"] as? [[String: Any]])?.compactMap { $0["text"] as? String }.joined(separator: " ")) ?? ""
                return "  tool error: " + String(content.split(whereSeparator: \.isNewline).first.map(String.init)?.prefix(200) ?? "")
            }
        case "result":
            let turns = (object["num_turns"] as? Int).map { "\($0) turns" } ?? ""
            let cost = (object["total_cost_usd"] as? Double).map { UsageFormat.dollars($0) } ?? ""
            return ["Director finished" + [turns, cost].filter { !$0.isEmpty }.map { " · " + $0 }.joined()]
        case "system":
            if object["subtype"] as? String == "api_retry" { return ["Retrying after a service error"] }
            return nil
        case "rate_limit_event", "turn.started", "thread.started", "turn.completed": return nil
        case "item.completed":
            guard let item = object["item"] as? [String: Any] else { return nil }
            switch item["type"] as? String {
            case "agent_message": return (item["text"] as? String).map { [$0] }
            case "command_execution":
                let d = ToolDescription.describeCodex(type: "command_execution", item: item)
                let failed = (item["exit_code"] as? Int).map { $0 != 0 } ?? false
                return ["→ \(d.summary)" + (failed ? " (failed)" : "")]
            case "mcp_tool_call", "file_change", "web_search":
                return ["→ " + ToolDescription.describeCodex(type: item["type"] as? String ?? "", item: item).summary]
            default: return nil
            }
        case "turn.failed", "error": return ["Error: " + String(((object["message"] as? String) ?? ((object["error"] as? [String: Any])?["message"] as? String) ?? "the director reported an error").prefix(300))]
        case "event_msg", "item.started": return nil
        default: return nil
        }
    }
}
