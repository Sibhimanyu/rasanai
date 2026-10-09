import Foundation

// MARK: Tokens and events

public struct TokenTotals: Codable, Equatable, Sendable {
    public var input = 0
    public var output = 0
    public var cacheRead = 0
    public var cacheWrite = 0
    public init(input: Int = 0, output: Int = 0, cacheRead: Int = 0, cacheWrite: Int = 0) {
        self.input = input; self.output = output; self.cacheRead = cacheRead; self.cacheWrite = cacheWrite
    }
    /// Everything the model processed, cached or not.
    public var total: Int { input + output + cacheRead + cacheWrite }
    /// Tokens that were newly read or written (what actually burns budget); cache reads are cheap and excluded.
    public var fresh: Int { input + output + cacheWrite }
    public var isEmpty: Bool { total == 0 }
    public static func + (a: Self, b: Self) -> Self {
        Self(input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite)
    }
    public static func - (a: Self, b: Self) -> Self {
        Self(input: a.input - b.input, output: a.output - b.output, cacheRead: a.cacheRead - b.cacheRead, cacheWrite: a.cacheWrite - b.cacheWrite)
    }
    static func componentMax(_ a: Self, _ b: Self) -> Self {
        Self(input: max(a.input, b.input), output: max(a.output, b.output), cacheRead: max(a.cacheRead, b.cacheRead), cacheWrite: max(a.cacheWrite, b.cacheWrite))
    }
}

public struct DirectorEvent: Codable, Equatable, Identifiable, Sendable {
    public enum Kind: String, Codable, Sendable { case start, tool, message, push, ask, result, warning, error }
    public var id: Int
    public var time: Date
    public var kind: Kind
    public var text: String
}

/// What the cost number is, so the UI can label it honestly.
public struct CostSummary: Equatable, Sendable {
    public var usd: Double
    /// True when any part came from the price table rather than the CLI's own figure.
    public var isEstimated: Bool
    /// Subscription use (Codex on a ChatGPT plan): tokens are shown, no dollar figure.
    public var isIncludedInPlan: Bool
    public var reportedUSD: Double
    public var estimatedUSD: Double
}

public enum Billing: String, Codable, Sendable { case metered, includedInPlan }

// MARK: Telemetry

/// Incremental parser for the director's machine-readable output (Claude Code `--output-format stream-json`
/// and `codex exec --json`, plus Codex's own rollout file for live token counts). Pure: feed it lines, read totals.
public struct DirectorTelemetry: Codable, Equatable, Sendable {
    public var agent: String?
    public var billing: Billing = .metered
    public var currentModel: String?
    public var sessionCount = 0
    public var toolCalls: [String: Int] = [:]
    public var toolErrors = 0
    public var events: [DirectorEvent] = []
    public var firstEventAt: Date?
    public var lastEventAt: Date?
    public var lastToolName: String?
    public var lastToolSummary: String?
    public var lastToolAt: Date?
    public var lastMessage: String?
    public var lastConsoleCallAt: Date?
    public var retryNotice: String?
    public var updatedAt: Date?
    /// True while the last thing seen was a model call being made (a tool result, a prompt, a started turn).
    public var modelCallInFlight = false
    /// Name and time of a tool call that has not returned yet.
    public var toolInFlight: String?
    public var toolInFlightSince: Date?
    public var consoleWaitInFlight = false

    // Committed (finished) sessions.
    public var committedTokens = TokenTotals()
    public var committedModels: [String: TokenTotals] = [:]
    public var committedTurns = 0
    public var committedReportedCost = 0.0
    public var committedEstimatedCost = 0.0
    public var committedSeconds = 0.0

    // The session being read now.
    public var sessionID: String?
    public var sessionStartedAt: Date?
    public var liveModels: [String: TokenTotals] = [:]
    public var liveTurns = 0
    public var liveReportedCost: Double?
    public var sessionFinished = false
    public var sessionIsError = false
    public var sessionDurationMS: Double?

    // Not persisted.
    var messageUsage: [String: (TokenTotals, String)] = [:]
    var seenToolIDs: Set<String> = []
    var codexRollout = TokenTotals()
    var codexTurnSum = TokenTotals()
    var tokenSamples: [(time: Date, fresh: Int)] = []
    var recentCalls: [CallSignature] = []
    var recentMessages: [String] = []
    var nextEventID = 0

    struct CallSignature: Equatable { var name: String; var key: String; var exempt: Bool }

    enum CodingKeys: String, CodingKey {
        case agent, billing, currentModel, sessionCount, toolCalls, toolErrors, events, firstEventAt, lastEventAt, lastToolName, lastToolSummary,
             lastToolAt, lastMessage, lastConsoleCallAt, updatedAt, committedTokens, committedModels, committedTurns, committedReportedCost,
             committedEstimatedCost, committedSeconds, sessionID, sessionStartedAt, liveModels, liveTurns, liveReportedCost, sessionFinished,
             sessionIsError, sessionDurationMS
    }

    public init() {}

    public static func == (a: Self, b: Self) -> Bool {
        a.agent == b.agent && a.tokens == b.tokens && a.lastEventAt == b.lastEventAt && a.events == b.events && a.liveReportedCost == b.liveReportedCost
            && a.toolCalls == b.toolCalls && a.sessionFinished == b.sessionFinished && a.billing == b.billing && a.currentModel == b.currentModel
    }

    // MARK: Totals

    public var liveTokens: TokenTotals { liveModels.values.reduce(TokenTotals(), +) }
    public var tokens: TokenTotals { committedTokens + liveTokens }
    public var models: [String: TokenTotals] {
        var all = committedModels
        for (model, usage) in liveModels { all[model] = (all[model] ?? TokenTotals()) + usage }
        return all
    }
    public var turns: Int { committedTurns + liveTurns }
    public var totalToolCalls: Int { toolCalls.values.reduce(0, +) }
    public var hasData: Bool { firstEventAt != nil }
    public var modelNames: [String] { models.filter { !$0.value.isEmpty }.sorted { $0.value.total > $1.value.total }.map(\.key) }

    public var liveEstimatedCost: Double { liveModels.reduce(0) { $0 + ModelPricing.cost(of: $1.value, model: $1.key, agent: agent) } }

    public var cost: CostSummary {
        let liveReported = liveReportedCost ?? 0
        let liveEstimate = liveReportedCost == nil ? liveEstimatedCost : 0
        let reported = committedReportedCost + liveReported
        let estimated = committedEstimatedCost + liveEstimate
        return CostSummary(usd: reported + estimated, isEstimated: estimated > 0.0001, isIncludedInPlan: billing == .includedInPlan,
                           reportedUSD: reported, estimatedUSD: estimated)
    }

    /// Wall-clock the director has been working across every session, up to `now` while a session is open.
    public func elapsed(now: Date) -> TimeInterval {
        var seconds = committedSeconds
        if let start = sessionStartedAt, !sessionFinished { seconds += max(0, now.timeIntervalSince(start)) }
        else if let start = sessionStartedAt, let end = lastEventAt { seconds += max(0, end.timeIntervalSince(start)) }
        return seconds
    }

    /// Fresh tokens used inside the trailing window (cache reads excluded).
    public func freshTokens(since cutoff: Date) -> Int { tokenSamples.filter { $0.time >= cutoff }.reduce(0) { $0 + $1.fresh } }

    // MARK: Ingest

    /// Feed one line of output. `now` stands in for events that carry no timestamp of their own.
    public mutating func ingest(line: String, now: Date = Date()) {
        guard let first = line.first(where: { !$0.isWhitespace }), first == "{",
              let data = line.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        ingest(object: object, now: now)
    }

    /// The same, for a line the caller already parsed (so one pass over a big log can feed several readers).
    public mutating func ingest(object: [String: Any], now: Date = Date()) {
        let time = (object["timestamp"] as? String).flatMap(Self.parseDate) ?? now
        updatedAt = time
        switch object["type"] as? String {
        case "system": ingestClaudeSystem(object, time)
        case "assistant": ingestClaudeAssistant(object, time)
        case "user": ingestClaudeUser(object, time)
        case "result": ingestClaudeResult(object, time)
        case "rate_limit_event": ingestRateLimit(object, time)
        case "thread.started": ingestCodexThread(object, time)
        case "turn.started": touch(time); modelCallInFlight = true; agent = agent ?? "codex"
        case "item.started", "item.completed": ingestCodexItem(object, time)
        case "turn.completed": ingestCodexTurn(object, time)
        case "turn.failed", "error": ingestCodexFailure(object, time)
        case "event_msg", "turn_context", "session_meta": ingestCodexRollout(object, time)
        default: break
        }
    }

    public mutating func ingest(lines: [String], now: Date = Date()) { for line in lines { ingest(line: line, now: now) } }

    /// Ends the open session (the director process exited or the app relaunched) and folds it into the committed totals.
    public mutating func closeSession(at end: Date? = nil) {
        guard sessionID != nil || !liveModels.isEmpty || liveTurns > 0 else { return }
        let stop = end ?? lastEventAt
        if let start = sessionStartedAt, let stop { committedSeconds += max(0, stop.timeIntervalSince(start)) }
        committedTokens = committedTokens + liveTokens
        for (model, usage) in liveModels { committedModels[model] = (committedModels[model] ?? TokenTotals()) + usage }
        committedTurns += liveTurns
        if let reported = liveReportedCost { committedReportedCost += reported } else { committedEstimatedCost += liveEstimatedCost }
        liveModels = [:]; liveTurns = 0; liveReportedCost = nil; sessionID = nil; sessionStartedAt = nil
        sessionFinished = false; sessionIsError = false; sessionDurationMS = nil
        messageUsage = [:]; seenToolIDs = []; codexRollout = TokenTotals(); codexTurnSum = TokenTotals()
        modelCallInFlight = false; toolInFlight = nil; toolInFlightSince = nil; consoleWaitInFlight = false
    }

    mutating func beginSession(_ id: String?, _ time: Date) {
        if let id, id == sessionID { return }
        closeSession(at: lastEventAt)
        sessionID = id ?? UUID().uuidString
        sessionStartedAt = time
        sessionCount += 1
    }

    mutating func touch(_ time: Date) {
        if firstEventAt == nil { firstEventAt = time }
        if lastEventAt == nil || time > lastEventAt! { lastEventAt = time }
        retryNotice = nil
    }

    mutating func record(_ kind: DirectorEvent.Kind, _ text: String, _ time: Date) {
        nextEventID += 1
        events.append(DirectorEvent(id: nextEventID, time: time, kind: kind, text: text))
        if events.count > 40 { events.removeFirst(events.count - 40) }
    }

    mutating func addTokens(_ delta: TokenTotals, model: String, at time: Date) {
        guard !delta.isEmpty else { return }
        liveModels[model] = (liveModels[model] ?? TokenTotals()) + delta
        if delta.fresh > 0 { tokenSamples.append((time, delta.fresh)) }
        let cutoff = time.addingTimeInterval(-1_200)
        if tokenSamples.count > 64, let firstKeep = tokenSamples.firstIndex(where: { $0.time >= cutoff }), firstKeep > 0 { tokenSamples.removeFirst(firstKeep) }
    }

    // MARK: Claude Code (stream-json)

    mutating func ingestClaudeSystem(_ object: [String: Any], _ time: Date) {
        switch object["subtype"] as? String {
        case "init":
            agent = "claude"
            beginSession(object["session_id"] as? String, time)
            if let model = object["model"] as? String, !model.isEmpty { currentModel = model }
            touch(time); modelCallInFlight = true
            record(.start, "Director started", time)
        case "api_retry":
            touch(time)
            let attempt = (object["attempt"] as? Int).map { " (attempt \($0))" } ?? ""
            retryNotice = "Waiting to retry\(attempt)"
            record(.warning, "The model service asked it to retry\(attempt)", time)
        default: break
        }
    }

    mutating func ingestClaudeAssistant(_ object: [String: Any], _ time: Date) {
        agent = "claude"
        guard let message = object["message"] as? [String: Any] else { return }
        if sessionID == nil { beginSession(object["session_id"] as? String, time) }
        touch(time)
        modelCallInFlight = false
        let model = (message["model"] as? String).flatMap { $0 == "<synthetic>" ? nil : $0 } ?? currentModel ?? "claude"
        if message["model"] is String, model != "claude" { currentModel = model }
        let isSub = object["parent_tool_use_id"] is String
        let blocks = message["content"] as? [[String: Any]] ?? []
        if let usage = message["usage"] as? [String: Any], let id = message["id"] as? String {
            var now = TokenTotals(input: usage["input_tokens"] as? Int ?? 0, output: usage["output_tokens"] as? Int ?? 0,
                                  cacheRead: usage["cache_read_input_tokens"] as? Int ?? 0, cacheWrite: usage["cache_creation_input_tokens"] as? Int ?? 0)
            // Streamed messages carry a stale output count; the text and tool input already written give a floor.
            now.output = max(now.output, Self.estimatedOutputTokens(blocks))
            let (old, oldModel) = messageUsage[id] ?? (TokenTotals(), model)
            let merged = TokenTotals.componentMax(old, now)
            if oldModel == model, !sessionFinished { addTokens(merged - old, model: model, at: time) }
            if messageUsage[id] == nil { liveTurns += 1 }
            messageUsage[id] = (merged, model)
        }
        for block in blocks {
            switch block["type"] as? String {
            case "tool_use": ingestToolUse(block, time, subagent: isSub)
            case "text":
                if let text = block["text"] as? String { noteMessage(text, time) }
            default: break
            }
        }
    }

    mutating func ingestToolUse(_ block: [String: Any], _ time: Date, subagent: Bool) {
        let id = block["id"] as? String ?? UUID().uuidString
        guard seenToolIDs.insert(id).inserted else { return }
        let name = block["name"] as? String ?? "Tool"
        let input = block["input"] as? [String: Any] ?? [:]
        let described = ToolDescription.describe(name: name, input: input)
        registerCall(name: name, summary: described.summary, key: ToolDescription.key(name: name, input: input), kind: described.kind,
                     exempt: described.exempt, time, subagent: subagent)
    }

    mutating func registerCall(name: String, summary: String, key: String, kind: DirectorEvent.Kind, exempt: Bool, _ time: Date, subagent: Bool) {
        toolCalls[name, default: 0] += 1
        lastToolName = name; lastToolSummary = summary; lastToolAt = time
        toolInFlight = name; toolInFlightSince = time; consoleWaitInFlight = exempt && kind == .ask
        if kind == .push || kind == .ask { lastConsoleCallAt = time }
        record(kind, (subagent ? "Helper · " : "") + summary, time)
        recentCalls.append(CallSignature(name: name, key: key, exempt: exempt))
        if recentCalls.count > 12 { recentCalls.removeFirst(recentCalls.count - 12) }
    }

    mutating func noteMessage(_ text: String, _ time: Date) {
        let line = text.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.first(where: { !$0.isEmpty }) ?? ""
        guard !line.isEmpty else { return }
        lastMessage = line
        record(.message, String(line.prefix(180)), time)
        recentMessages.append(Self.normalized(text))
        if recentMessages.count > 6 { recentMessages.removeFirst(recentMessages.count - 6) }
    }

    mutating func ingestClaudeUser(_ object: [String: Any], _ time: Date) {
        touch(time)
        guard let message = object["message"] as? [String: Any], let blocks = message["content"] as? [[String: Any]] else { modelCallInFlight = true; return }
        var sawResult = false
        for block in blocks where block["type"] as? String == "tool_result" {
            sawResult = true
            if block["is_error"] as? Bool == true { toolErrors += 1 }
        }
        if sawResult { toolInFlight = nil; toolInFlightSince = nil; consoleWaitInFlight = false }
        modelCallInFlight = true
    }

    mutating func ingestClaudeResult(_ object: [String: Any], _ time: Date) {
        touch(time)
        if sessionID == nil { beginSession(object["session_id"] as? String, time) }
        modelCallInFlight = false; toolInFlight = nil; toolInFlightSince = nil
        sessionFinished = true
        sessionIsError = object["is_error"] as? Bool ?? false
        sessionDurationMS = object["duration_ms"] as? Double
        if let turns = object["num_turns"] as? Int { liveTurns = max(liveTurns, turns) }
        if let reported = object["total_cost_usd"] as? Double { liveReportedCost = reported }
        // The result totals are authoritative: replace what was summed live.
        if let modelUsage = object["modelUsage"] as? [String: [String: Any]], !modelUsage.isEmpty {
            var replaced: [String: TokenTotals] = [:]
            for (model, usage) in modelUsage {
                replaced[model] = TokenTotals(input: usage["inputTokens"] as? Int ?? 0, output: usage["outputTokens"] as? Int ?? 0,
                                              cacheRead: usage["cacheReadInputTokens"] as? Int ?? 0, cacheWrite: usage["cacheCreationInputTokens"] as? Int ?? 0)
            }
            liveModels = replaced
        } else if let usage = object["usage"] as? [String: Any] {
            let model = currentModel ?? "claude"
            liveModels = [model: TokenTotals(input: usage["input_tokens"] as? Int ?? 0, output: usage["output_tokens"] as? Int ?? 0,
                                             cacheRead: usage["cache_read_input_tokens"] as? Int ?? 0, cacheWrite: usage["cache_creation_input_tokens"] as? Int ?? 0)]
        }
        let isError = sessionIsError
        record(isError ? .error : .result, isError ? "The director stopped with an error" : "The director finished its run", time)
    }

    mutating func ingestRateLimit(_ object: [String: Any], _ time: Date) {
        guard let info = object["rate_limit_info"] as? [String: Any], let status = info["status"] as? String, status != "allowed", status != "allowed_warning" else { return }
        touch(time)
        retryNotice = "Rate limited"
        record(.warning, "Your plan's usage limit slowed the director (\(status))", time)
    }

    // MARK: Codex (exec --json and rollout)

    mutating func ingestCodexThread(_ object: [String: Any], _ time: Date) {
        agent = "codex"
        beginSession(object["thread_id"] as? String, time)
        touch(time); modelCallInFlight = true
        record(.start, "Director started", time)
    }

    mutating func ingestCodexItem(_ object: [String: Any], _ time: Date) {
        agent = "codex"
        guard let item = object["item"] as? [String: Any], let type = item["type"] as? String else { return }
        let started = object["type"] as? String == "item.started"
        let id = item["id"] as? String ?? UUID().uuidString
        touch(time)
        switch type {
        case "command_execution", "mcp_tool_call", "file_change", "web_search":
            let described = ToolDescription.describeCodex(type: type, item: item)
            if seenToolIDs.insert(id).inserted {
                registerCall(name: described.name, summary: described.summary, key: described.key, kind: described.kind, exempt: described.exempt, time, subagent: false)
            }
            if !started { toolInFlight = nil; toolInFlightSince = nil; consoleWaitInFlight = false; modelCallInFlight = true
                if let code = item["exit_code"] as? Int, code != 0 { toolErrors += 1 }
            } else { modelCallInFlight = false }
        case "agent_message":
            if !started, let text = item["text"] as? String { noteMessage(text, time) }
            modelCallInFlight = started
        case "reasoning": modelCallInFlight = true
        case "error": break
        default: break
        }
    }

    mutating func ingestCodexTurn(_ object: [String: Any], _ time: Date) {
        agent = "codex"
        touch(time)
        modelCallInFlight = false; toolInFlight = nil; toolInFlightSince = nil
        liveTurns += 1
        if let usage = object["usage"] as? [String: Any] {
            codexTurnSum = codexTurnSum + Self.codexTokens(usage)
            applyCodexTotals(time)
        }
        sessionFinished = true
        record(.result, "The director finished its run", time)
    }

    mutating func ingestCodexFailure(_ object: [String: Any], _ time: Date) {
        touch(time)
        let raw = (object["message"] as? String) ?? ((object["error"] as? [String: Any])?["message"] as? String) ?? "The director reported an error"
        // Errors are often a JSON string; keep the readable part.
        var text = raw
        if let data = raw.data(using: .utf8), let nested = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           let message = (nested["error"] as? [String: Any])?["message"] as? String { text = message }
        if object["type"] as? String == "turn.failed" { sessionFinished = true; sessionIsError = true; modelCallInFlight = false }
        record(.error, String(text.prefix(200)), time)
    }

    mutating func ingestCodexRollout(_ object: [String: Any], _ time: Date) {
        guard let payload = object["payload"] as? [String: Any] else { return }
        switch (object["type"] as? String, payload["type"] as? String) {
        case ("event_msg", "token_count"):
            guard let info = payload["info"] as? [String: Any], let total = info["total_token_usage"] as? [String: Any] else { return }
            agent = agent ?? "codex"
            if sessionID == nil { beginSession(nil, time) }
            touch(time)
            codexRollout = TokenTotals.componentMax(codexRollout, Self.codexTokens(total))
            applyCodexTotals(time)
        case ("turn_context", _):
            if let model = payload["model"] as? String, !model.isEmpty { currentModel = model; applyCodexTotals(time) }
        default: break
        }
    }

    /// A Codex session's usage is the larger of its rollout counter and the sum of completed turns; both are cumulative.
    mutating func applyCodexTotals(_ time: Date) {
        let target = TokenTotals.componentMax(codexRollout, codexTurnSum)
        let model = currentModel ?? "codex"
        let current = liveModels.values.reduce(TokenTotals(), +)
        let delta = target - current
        guard delta.input > 0 || delta.output > 0 || delta.cacheRead > 0 || delta.cacheWrite > 0 else { return }
        // Keep one entry for the session; earlier tokens stay attributed to whichever model was current when they arrived.
        addTokens(TokenTotals(input: max(0, delta.input), output: max(0, delta.output), cacheRead: max(0, delta.cacheRead), cacheWrite: max(0, delta.cacheWrite)), model: model, at: time)
    }

    static func codexTokens(_ usage: [String: Any]) -> TokenTotals {
        let input = usage["input_tokens"] as? Int ?? 0
        let cached = usage["cached_input_tokens"] as? Int ?? 0
        // Codex counts cached tokens inside input_tokens.
        return TokenTotals(input: max(0, input - cached), output: usage["output_tokens"] as? Int ?? 0, cacheRead: cached, cacheWrite: usage["cache_write_input_tokens"] as? Int ?? 0)
    }

    // MARK: Helpers

    static func estimatedOutputTokens(_ blocks: [[String: Any]]) -> Int {
        var characters = 0
        for block in blocks {
            switch block["type"] as? String {
            case "text": characters += (block["text"] as? String)?.count ?? 0
            case "thinking": characters += (block["thinking"] as? String)?.count ?? 0
            case "tool_use":
                if let input = block["input"], JSONSerialization.isValidJSONObject(input), let data = try? JSONSerialization.data(withJSONObject: input) { characters += data.count }
            default: break
            }
        }
        return characters / 4
    }

    static func normalized(_ text: String) -> String {
        text.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    nonisolated(unsafe) private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    nonisolated(unsafe) private static let isoPlain = ISO8601DateFormatter()
    public static func parseDate(_ text: String) -> Date? { isoFractional.date(from: text) ?? isoPlain.date(from: text) }
}

// MARK: Tool descriptions

enum ToolDescription {
    struct Result { var summary: String; var kind: DirectorEvent.Kind; var exempt: Bool }

    static func key(name: String, input: [String: Any]) -> String {
        guard JSONSerialization.isValidJSONObject(input), let data = try? JSONSerialization.data(withJSONObject: input, options: [.sortedKeys]) else { return name }
        return String(decoding: data, as: UTF8.self)
    }

    static func describe(name: String, input: [String: Any]) -> Result {
        func str(_ key: String) -> String? { (input[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
        func file(_ key: String = "file_path") -> String { str(key).map { ($0 as NSString).lastPathComponent } ?? "a file" }
        switch name {
        case "Bash":
            let command = str("command") ?? ""
            if let console = consoleCall(command) { return console }
            let text = str("description") ?? command.split(whereSeparator: \.isNewline).first.map(String.init) ?? "Ran a command"
            return Result(summary: clip(text), kind: .tool, exempt: false)
        case "Read": return Result(summary: "Read \(file())", kind: .tool, exempt: false)
        case "Write": return Result(summary: "Wrote \(file())", kind: .tool, exempt: false)
        case "Edit", "MultiEdit": return Result(summary: "Edited \(file())", kind: .tool, exempt: false)
        case "NotebookEdit": return Result(summary: "Edited \(file("notebook_path"))", kind: .tool, exempt: false)
        case "Grep", "Glob": return Result(summary: "Searched for \(clip(str("pattern") ?? "files", 60))", kind: .tool, exempt: false)
        case "Task", "Agent": return Result(summary: "Helper: " + clip(str("description") ?? "working on a task", 90), kind: .tool, exempt: false)
        case "WebFetch": return Result(summary: "Read a web page" + (str("url").flatMap { URL(string: $0)?.host }.map { " (\($0))" } ?? ""), kind: .tool, exempt: false)
        case "WebSearch": return Result(summary: "Searched the web for " + clip(str("query") ?? "something", 70), kind: .tool, exempt: false)
        case "Skill": return Result(summary: "Used skill " + (str("skill") ?? "a skill"), kind: .tool, exempt: false)
        case "TodoWrite", "TaskCreate", "TaskUpdate": return Result(summary: "Updated its plan", kind: .tool, exempt: false)
        case "ScheduleWakeup": return Result(summary: "Scheduled a wake-up", kind: .tool, exempt: true)
        default:
            let readable = name.replacingOccurrences(of: "mcp__", with: "").replacingOccurrences(of: "__", with: " · ").replacingOccurrences(of: "_", with: " ")
            return Result(summary: clip(readable, 80), kind: .tool, exempt: false)
        }
    }

    static func describeCodex(type: String, item: [String: Any]) -> (name: String, summary: String, key: String, kind: DirectorEvent.Kind, exempt: Bool) {
        switch type {
        case "command_execution":
            var command = (item["command"] as? String) ?? ""
            for prefix in ["/bin/bash -lc ", "/bin/zsh -lc ", "bash -lc ", "zsh -lc ", "/bin/sh -c ", "sh -c "] where command.hasPrefix(prefix) {
                command = String(command.dropFirst(prefix.count)); break
            }
            if command.count >= 2, let f = command.first, let l = command.last, (f == "'" && l == "'") || (f == "\"" && l == "\"") { command = String(command.dropFirst().dropLast()) }
            if let console = consoleCall(command) { return ("Shell", console.summary, command, console.kind, console.exempt) }
            return ("Shell", clip(command.split(whereSeparator: \.isNewline).first.map(String.init) ?? "Ran a command"), command, .tool, false)
        case "mcp_tool_call":
            let tool = [item["server"] as? String, item["tool"] as? String].compactMap { $0 }.joined(separator: " · ")
            return ("Tool", clip(tool.isEmpty ? "Used a tool" : tool, 80), tool + String(describing: item["arguments"] ?? ""), .tool, false)
        case "file_change":
            let changes = item["changes"] as? [[String: Any]] ?? []
            let names = changes.compactMap { ($0["path"] as? String).map { ($0 as NSString).lastPathComponent } }
            return ("Edit", names.isEmpty ? "Edited files" : "Edited " + names.prefix(3).joined(separator: ", "), names.joined(separator: ","), .tool, false)
        default:
            let query = (item["query"] as? String) ?? "something"
            return ("Web", "Searched the web for " + clip(query, 70), query, .tool, false)
        }
    }

    /// Calls to the console script are how the director talks to the person: pushes, questions and waiting.
    static func consoleCall(_ command: String) -> Result? {
        guard command.contains("console.mjs") else { return nil }
        guard let range = command.range(of: "console.mjs") else { return nil }
        let words = command[range.upperBound...].split(whereSeparator: \.isWhitespace).map(String.init)
        guard let verb = words.first else { return nil }
        func option(_ name: String) -> String? {
            guard let index = words.firstIndex(of: name), words.indices.contains(index + 1) else { return nil }
            return words[index + 1].trimmingCharacters(in: CharacterSet(charactersIn: "'\""))
        }
        switch verb {
        case "push":
            let step = option("--step").map { StepNames.label($0) } ?? "a step"
            return Result(summary: "Showed \(step) for your review", kind: .push, exempt: false)
        case "ask": return Result(summary: "Asked you a question", kind: .ask, exempt: false)
        case "wait": return Result(summary: "Waiting for your next action", kind: .ask, exempt: true)
        case "activity", "log": return Result(summary: "Posted a progress note", kind: .push, exempt: false)
        default: return Result(summary: "Updated the film's status", kind: .tool, exempt: false)
        }
    }

    static func clip(_ text: String, _ limit: Int = 100) -> String { text.count > limit ? String(text.prefix(limit - 1)) + "…" : text }
}

enum StepNames {
    static func label(_ step: String) -> String {
        let name = step.trimmingCharacters(in: CharacterSet(charactersIn: "'\""))
        return name.isEmpty ? "a step" : "the " + name.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ") + " step"
    }
}
