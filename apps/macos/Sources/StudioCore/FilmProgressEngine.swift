import Foundation

/// The pure engine behind Film progress. Feed it what the director wrote (director.log lines), what the console
/// shows (session.json) and what the project folder holds (artifacts); read a `FilmProgressSnapshot` back.
/// It owns no timers and no I/O, so tests and the DEBUG replay drive it with a simulated clock.
///
/// The phase rules are in `ProgressPhaseMapper`. Render progress is in `RenderOutputParser`.
public struct FilmProgressEngine: Sendable {
    public var budget: ResearchBudget?

    // MARK: Stored inputs

    struct Evidence: Sendable {
        var time: Date
        var phase: ProgressPhase
        var requires: ProgressPhase?
    }
    struct TokenSample: Sendable {
        var time: Date
        var tokens: TokenTotals
        var estimatedUSD: Double
        /// A helper's running token count, seen before the session's authoritative totals arrive.
        /// Replaced by an even share of the session's real total when its `result` line lands.
        var provisional = false
    }
    struct ToolCall: Sendable {
        var name: String
        var description: String
        var command: String
        var time: Date
        var parent: String?
    }
    struct RenderRun: Sendable {
        var id: String
        var kind: RenderProgress.Kind
        var command: String
        var outputName: String?
        var startedAt: Date
        var finishedAt: Date?
        var failed = false
        var framesDone: Int?
        var framesTotal: Int?
        var percent: Int?
        var stage: String?
        var outputFile: String?
        var samples: [(time: Date, frames: Int)] = []
    }
    struct StepFact: Sendable {
        var status: String
        var updated: Date?
        var decision: String?
    }
    struct SessionLine: Sendable {
        var time: Date
        var message: String
        var level: String
    }

    var telemetry = DirectorTelemetry()
    var lastModels: [String: TokenTotals] = [:]
    var taskTokens: [String: Int] = [:]
    var tokenSamples: [TokenSample] = []
    var logEvidence: [Evidence] = []
    var sources: [ResearchSource] = []
    var crew: [String: CrewMember] = [:]
    var crewOrder: [String] = []
    var taskToTool: [String: String] = [:]
    var backgroundTasks: Set<String> = []
    /// Render calls whose results we still want to read (only those: every other tool result is skipped without parsing).
    var pending: [String: ToolCall] = [:]
    var foregroundCrew: Set<String> = []
    var renders: [RenderRun] = []
    var recentTools: [ProgressActivity] = []
    var logWarnings: [ProgressActivity] = []
    var firstEventAt: Date?
    var lastEventAt: Date?
    var lastLineTime: Date?
    var stoppedAt: Date?
    var researchStartedAt: Date?

    var title = ""
    var sessionLines: [SessionLine] = []
    var steps: [String: StepFact] = [:]
    var sessionEvidence: [Evidence] = []
    var currentStep = "brief"
    var waitingOnUser = false
    var askQuestion: String?
    var scenes: [SceneProgress] = []
    var stageChips: [String] = []
    var findingsCount = 0
    var findingsPushedAt: Date?
    var expectedKeyframes: Int?
    var filmSeconds: Double = 30
    var finishedAt: Date?
    var workingMessage: String?
    var finalVideoPath: String?
    var posterPath: String?
    var artifacts = FilmArtifacts()

    public init(budget: ResearchBudget? = nil) { self.budget = budget }

    // MARK: Log

    /// Complete lines of director.log (stream-json), oldest first. `now` stands in for lines with no timestamp.
    public mutating func ingest(lines: [String], now: Date) {
        for line in lines { ingest(line: line, now: now) }
    }

    mutating func ingest(line: String, now: Date) {
        guard line.first == "{" else { return }
        let kind = Self.sniff(line)
        switch kind {
        case .skip: return
        case .user:
            // Tool results are only read when they answer a call we are waiting on (render output, a helper's reply).
            guard !pending.isEmpty || !foregroundCrew.isEmpty,
                  pending.keys.contains(where: { line.contains($0) }) || foregroundCrew.contains(where: { line.contains($0) }) else { return }
        case .parse: break
        }
        guard let data = line.data(using: .utf8), let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        let time = (object["timestamp"] as? String).flatMap(DirectorTelemetry.parseDate) ?? lastLineTime ?? now
        lastLineTime = time
        switch object["type"] as? String {
        case "assistant": ingestAssistant(object, time)
        case "user": ingestUser(object, time)
        case "system": ingestSystem(object, time)
        case "result": telemetryIngest(object, time); redistributeHelperTokens(); touch(time)
        default: break
        }
    }

    enum Sniffed { case skip, user, parse }
    static func sniff(_ line: String) -> Sniffed {
        if line.hasPrefix("{\"type\":\"assistant\"") || line.hasPrefix("{\"type\":\"result\"") { return .parse }
        if line.hasPrefix("{\"type\":\"user\"") { return .user }
        if line.hasPrefix("{\"type\":\"system\"") {
            for subtype in ["task_started", "task_progress", "task_notification", "task_updated", "\"init\"", "api_retry"] where line.contains(subtype) { return .parse }
            return .skip
        }
        if line.hasPrefix("{\"type\":") { return .skip }
        // Other shapes (Codex): let the telemetry see them, the progress model does not read them.
        return .parse
    }

    mutating func touch(_ time: Date) {
        if firstEventAt == nil || time < firstEventAt! { firstEventAt = time }
        if lastEventAt == nil || time > lastEventAt! { lastEventAt = time }
        stoppedAt = nil
    }

    mutating func telemetryIngest(_ object: [String: Any], _ time: Date) {
        telemetry.ingest(object: object, now: time)
        let models = telemetry.models
        var delta = TokenTotals()
        var usd = 0.0
        for (model, total) in models {
            let before = lastModels[model] ?? TokenTotals()
            let d = TokenTotals(input: max(0, total.input - before.input), output: max(0, total.output - before.output),
                                cacheRead: max(0, total.cacheRead - before.cacheRead), cacheWrite: max(0, total.cacheWrite - before.cacheWrite))
            if !d.isEmpty { delta = delta + d; usd += ModelPricing.cost(of: d, model: model, agent: telemetry.agent) }
        }
        lastModels = models
        if !delta.isEmpty { tokenSamples.append(TokenSample(time: time, tokens: delta, estimatedUSD: usd)) }
    }

    mutating func ingestAssistant(_ object: [String: Any], _ time: Date) {
        telemetryIngest(object, time)
        touch(time)
        let parent = object["parent_tool_use_id"] as? String
        let blocks = (object["message"] as? [String: Any])?["content"] as? [[String: Any]] ?? []
        for block in blocks where block["type"] as? String == "tool_use" {
            guard let id = block["id"] as? String, let name = block["name"] as? String else { continue }
            let input = block["input"] as? [String: Any] ?? [:]
            ingestToolUse(id: id, name: name, input: input, parent: parent, time)
        }
    }

    mutating func ingestToolUse(id: String, name: String, input: [String: Any], parent: String?, _ time: Date) {
        func string(_ key: String) -> String { (input[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
        let byCrew = parent.flatMap { crew[$0]?.name }
        switch name {
        case "WebFetch":
            let url = string("url")
            guard !url.isEmpty else { return }
            let (host, display) = Self.describe(url: url)
            sources.append(ResearchSource(id: id, kind: .page, target: url, host: host, display: display, time: time, by: byCrew))
            researchStartedAt = researchStartedAt ?? time
            note(id: id, time: time, kind: .source, title: "Read \(display)", crewID: parent)
        case "WebSearch":
            let query = string("query")
            guard !query.isEmpty else { return }
            sources.append(ResearchSource(id: id, kind: .search, target: query, host: query, display: query, time: time, by: byCrew))
            researchStartedAt = researchStartedAt ?? time
            note(id: id, time: time, kind: .source, title: "Searched \(DirectorSnip.clip(query, 80))", crewID: parent)
        case "Agent", "Task":
            let description = string("description").isEmpty ? "A helper" : string("description")
            if crew[id] == nil {
                crew[id] = CrewMember(id: id, name: description, role: input["subagent_type"] as? String, phase: .research, startedAt: time)
                crewOrder.append(id)
            }
            if let verdict = ProgressPhaseMapper.verdict(forAgent: description) {
                logEvidence.append(Evidence(time: time, phase: verdict.phase, requires: verdict.requires))
                if verdict.phase == .research { researchStartedAt = researchStartedAt ?? time }
            }
        case "Bash":
            let command = string("command")
            let description = string("description")
            if let render = ProgressPhaseMapper.verdict(forRenderCommand: command) {
                pending[id] = ToolCall(name: name, description: description, command: command, time: time, parent: parent)
                logEvidence.append(Evidence(time: time, phase: render.verdict.phase, requires: render.verdict.requires))
                let output = Self.outputName(in: command)
                renders.append(RenderRun(id: id, kind: render.kind, command: command, outputName: output, startedAt: time))
            }
            if let step = Self.consolePush(command), let phase = ProgressPhaseMapper.phase(forStep: step) {
                logEvidence.append(Evidence(time: time, phase: phase, requires: nil))
            }
            let text = description.isEmpty ? (command.split(whereSeparator: \.isNewline).first.map(String.init) ?? "Ran a command") : description
            if parent == nil { note(id: id, time: time, kind: .command, title: DirectorSnip.clip(text, 110), crewID: nil, recent: true) }
            else { note(id: id, time: time, kind: .command, title: DirectorSnip.clip(text, 110), crewID: parent, recent: true) }
        case "Write", "Edit", "MultiEdit":
            let file = (string("file_path") as NSString).lastPathComponent
            note(id: id, time: time, kind: .file, title: (name == "Write" ? "Wrote " : "Edited ") + (file.isEmpty ? "a file" : file), crewID: parent, recent: true)
        default: break
        }
    }

    mutating func note(id: String, time: Date, kind: ProgressActivity.Kind, title: String, crewID: String?, recent: Bool = false) {
        guard recent || kind == .source else { return }
        var by: String?
        if let crewID { by = crew[crewID]?.name }
        let item = ProgressActivity(id: "log-\(id)", time: time, phase: .research, kind: kind, title: title, detail: by)
        recentTools.append(item)
        if recentTools.count > 80 { recentTools.removeFirst(recentTools.count - 80) }
    }

    mutating func ingestUser(_ object: [String: Any], _ time: Date) {
        touch(time)
        let blocks = (object["message"] as? [String: Any])?["content"] as? [[String: Any]] ?? []
        for block in blocks where block["type"] as? String == "tool_result" {
            guard let id = block["tool_use_id"] as? String else { continue }
            let text = Self.text(of: block["content"])
            if let call = pending[id] {
                if let index = renders.firstIndex(where: { $0.id == id }) {
                    if let path = Self.backgroundOutputPath(text) {
                        renders[index].outputFile = path
                    } else {
                        applyRender(text, toRun: index, time: time, finished: true)
                        renders[index].failed = block["is_error"] as? Bool ?? false
                    }
                }
                _ = call
                if renders.contains(where: { $0.id == id && $0.outputFile != nil && $0.finishedAt == nil }) == false { pending[id] = nil }
            }
            // A foreground helper's reply: it is finished (a backgrounded one is closed by task_notification).
            if foregroundCrew.remove(id) != nil, let member = crew[id], member.state == .running {
                crew[id]?.state = block["is_error"] as? Bool == true ? .failed : .done
                crew[id]?.endedAt = time
            }
        }
    }

    mutating func ingestSystem(_ object: [String: Any], _ time: Date) {
        switch object["subtype"] as? String {
        case "init", "api_retry":
            telemetryIngest(object, time); touch(time)
        case "task_started":
            touch(time)
            guard let toolID = object["tool_use_id"] as? String else { return }
            if let task = object["task_id"] as? String { taskToTool[task] = toolID }
            if object["task_type"] as? String == "local_agent" {
                if object["is_backgrounded"] as? Bool == true { backgroundTasks.insert(toolID) } else { foregroundCrew.insert(toolID) }
                let description = object["description"] as? String ?? crew[toolID]?.name ?? "A helper"
                if var member = crew[toolID] { member.name = description; member.role = object["subagent_type"] as? String ?? member.role; crew[toolID] = member }
                else {
                    crew[toolID] = CrewMember(id: toolID, name: description, role: object["subagent_type"] as? String, phase: .research, startedAt: time)
                    crewOrder.append(toolID)
                }
            }
        case "task_progress":
            noteHelperUsage(object, time)
            guard let toolID = object["tool_use_id"] as? String, crew[toolID] != nil else { return }
            if let action = object["description"] as? String { crew[toolID]?.lastAction = DirectorSnip.clip(action, 100) }
        case "task_notification":
            touch(time)
            noteHelperUsage(object, time)
            guard let toolID = object["tool_use_id"] as? String else { return }
            let status = object["status"] as? String ?? "completed"
            if crew[toolID] != nil, crew[toolID]?.state == .running {
                crew[toolID]?.state = status == "completed" ? .done : .failed
                crew[toolID]?.endedAt = time
            }
            if let index = renders.firstIndex(where: { $0.id == toolID }) {
                if let file = object["output_file"] as? String, !file.isEmpty { renders[index].outputFile = file }
                if renders[index].finishedAt == nil { renders[index].finishedAt = time }
                renders[index].failed = status != "completed"
            }
        case "task_updated":
            guard let task = object["task_id"] as? String, let toolID = taskToTool[task],
                  let patch = object["patch"] as? [String: Any], let status = patch["status"] as? String else { return }
            if crew[toolID]?.state == .running, status == "completed" || status == "failed" || status == "killed" {
                crew[toolID]?.state = status == "completed" ? .done : .failed
                crew[toolID]?.endedAt = time
            }
        default: break
        }
    }

    // MARK: Helper tokens

    /// A helper's progress lines carry its running token total. Helpers' usage is not in the assistant lines, only in the session's
    /// final `result`, so these give the *shape* in time: the session total is spread over them when it arrives.
    mutating func noteHelperUsage(_ object: [String: Any], _ time: Date) {
        guard let task = object["task_id"] as? String ?? object["tool_use_id"] as? String,
              let usage = object["usage"] as? [String: Any], let total = usage["total_tokens"] as? Int else { return }
        let delta = total - (taskTokens[task] ?? 0)
        taskTokens[task] = max(taskTokens[task] ?? 0, total)
        guard delta > 0 else { return }
        tokenSamples.append(TokenSample(time: time, tokens: TokenTotals(input: delta), estimatedUSD: 0, provisional: true))
    }

    /// At a session's end: the unaccounted part of its totals (helpers' work) replaces the provisional samples, spread by their weight.
    mutating func redistributeHelperTokens() {
        let provisional = tokenSamples.filter(\.provisional)
        guard !provisional.isEmpty else { return }
        tokenSamples.removeAll(where: \.provisional)
        // The lump the result line just added is the last real sample, stamped at the result's time.
        guard let lumpIndex = tokenSamples.indices.last, tokenSamples[lumpIndex].time >= (lastLineTime ?? .distantPast) else { return }
        let lump = tokenSamples.remove(at: lumpIndex)
        let weight = Double(provisional.reduce(0) { $0 + $1.tokens.input })
        guard weight > 0 else { tokenSamples.append(lump); return }
        func share(_ value: Int, _ fraction: Double) -> Int { Int((Double(value) * fraction).rounded()) }
        for sample in provisional {
            let fraction = Double(sample.tokens.input) / weight
            let t = TokenTotals(input: share(lump.tokens.input, fraction), output: share(lump.tokens.output, fraction),
                                cacheRead: share(lump.tokens.cacheRead, fraction), cacheWrite: share(lump.tokens.cacheWrite, fraction))
            tokenSamples.append(TokenSample(time: sample.time, tokens: t, estimatedUSD: lump.estimatedUSD * fraction))
        }
        tokenSamples.sort { $0.time < $1.time }
    }

    // MARK: Render output

    /// Output text of a render the director started in the background (the file named in its tool result), read while it runs.
    public mutating func ingest(renderOutput text: String, file: String, now: Date) {
        guard let index = renders.lastIndex(where: { $0.outputFile == file }) else { return }
        applyRender(text, toRun: index, time: now, finished: false)
    }

    /// Output text for a render call known by its tool id (the DEBUG replay feeds interpolated progress this way).
    public mutating func ingest(renderOutput text: String, toolID: String, now: Date) {
        guard let index = renders.lastIndex(where: { $0.id == toolID }) else { return }
        applyRender(text, toRun: index, time: now, finished: false)
    }

    /// The director's telemetry as the engine has read it (tokens, cost, models), for the monitor and replays.
    public var telemetrySnapshot: DirectorTelemetry { telemetry }

    /// Output files of renders still running, for the app to tail every couple of seconds.
    public var renderOutputFiles: [String] { renders.filter { $0.finishedAt == nil && $0.outputFile != nil }.compactMap(\.outputFile) }

    mutating func applyRender(_ text: String, toRun index: Int, time: Date, finished: Bool) {
        let parsed = RenderOutputParser.parse(text)
        if let total = parsed.framesTotal { renders[index].framesTotal = total }
        if let done = parsed.framesDone {
            renders[index].framesDone = done
            if renders[index].samples.last?.frames != done { renders[index].samples.append((time, done)) }
            if renders[index].samples.count > 40 { renders[index].samples.removeFirst(renders[index].samples.count - 40) }
        }
        if let percent = parsed.percent { renders[index].percent = percent }
        if let stage = parsed.stage { renders[index].stage = stage }
        if parsed.complete || (finished && renders[index].finishedAt == nil) {
            if renders[index].finishedAt == nil { renders[index].finishedAt = time }
        }
        if parsed.complete, let total = renders[index].framesTotal { renders[index].framesDone = total }
    }

    // MARK: Session and artifacts

    /// The console's session, whenever it changes.
    public mutating func update(session: SessionSnapshot, now: Date) {
        title = session.title
        currentStep = session.currentStep
        waitingOnUser = session.isWaitingOnUser
        askQuestion = session.ask?.question
        workingMessage = session.workingMessage
        filmSeconds = session.duration(for: session.stage) > 0 ? session.duration(for: session.stage) : (session.step("brief")["fields"]["length_s"].number ?? 30)

        var facts: [String: StepFact] = [:]
        var evidence: [Evidence] = []
        for (name, payload) in session.raw["steps"].object {
            let status = payload["status"].string ?? ""
            let updated = payload["updated"].string.flatMap(DirectorTelemetry.parseDate)
            facts[name] = StepFact(status: status, updated: updated, decision: payload["decision"].string)
            guard let updated else { continue }
            if let phase = ProgressPhaseMapper.phase(forStep: name) { evidence.append(Evidence(time: updated, phase: phase, requires: nil)) }
            if status == "done", let next = ProgressPhaseMapper.phaseStarted(whenDone: name) { evidence.append(Evidence(time: updated, phase: next, requires: nil)) }
        }
        steps = facts

        var lines: [SessionLine] = []
        for entry in session.raw["activity"].array {
            guard let message = entry["msg"].string, let time = entry["t"].string.flatMap(DirectorTelemetry.parseDate) else { continue }
            let level = entry["level"].string ?? "info"
            if level == "sys" { continue }
            lines.append(SessionLine(time: time, message: message, level: level))
            if let (step, kind) = Self.stepMention(message) {
                if let phase = ProgressPhaseMapper.phase(forStep: step) { evidence.append(Evidence(time: time, phase: phase, requires: nil)) }
                if kind == .done, let next = ProgressPhaseMapper.phaseStarted(whenDone: step) { evidence.append(Evidence(time: time, phase: next, requires: nil)) }
            } else if let verdict = ProgressPhaseMapper.verdict(forActivity: message) {
                evidence.append(Evidence(time: time, phase: verdict.phase, requires: verdict.requires))
            }
        }
        sessionLines = lines
        sessionEvidence = evidence
        if let first = lines.first?.time { firstEventAt = min(firstEventAt ?? first, first) }

        let brief = session.step("brief")
        findingsCount = brief["findings"].array.count
        findingsPushedAt = findingsCount == 0 ? nil
            : (lines.first { $0.level == "ask" && $0.message.lowercased().contains("brief") }?.time ?? brief["updated"].string.flatMap(DirectorTelemetry.parseDate))

        let planned = session.scenes(for: .animatic)
        scenes = Self.sceneProgress(session)
        expectedKeyframes = planned.isEmpty ? (scenes.isEmpty ? nil : scenes.count) : planned.count
        if expectedKeyframes == nil {
            // A scenes / keyframes / plan step payload that lists the film's scenes (or frames) says how many key frames to expect.
            for name in ["keyframes", "scenes", "plan", "storyboard"] {
                let payload = session.step(name)
                let count = ["keyframes", "frames", "scenes"].map { payload[$0].array.count }.max() ?? 0
                if count > 0 { expectedKeyframes = count; break }
            }
        }

        var chips: [String] = []
        for (name, status) in session.step("build")["stages"].object.sorted(by: { $0.key < $1.key }) {
            chips.append(StepNames.label(name).replacingOccurrences(of: "the ", with: "").capitalized + (status.string.map { $0 == "done" ? "" : " · \($0)" } ?? ""))
        }
        stageChips = chips

        let render = session.final
        finalVideoPath = session.finalVideo
        posterPath = render["poster"].string
        let renderStep = steps["render"] ?? steps["final"]
        if renderStep?.status == "done", let updated = renderStep?.updated { finishedAt = updated } else { finishedAt = nil }
    }

    /// The project folder scan (`FilmArtifactScanner`).
    public mutating func update(artifacts: FilmArtifacts, now: Date) { self.artifacts = artifacts }

    /// The director process ended (or the app relaunched): closes any open helper and tool state.
    public mutating func directorStopped(at time: Date) {
        stoppedAt = time
        telemetry.closeSession(at: time)
        for key in crew.keys where crew[key]?.state == .running { crew[key]?.state = .failed; crew[key]?.endedAt = time }
        pending = [:]; foregroundCrew = []
    }

    // MARK: Helpers

    static func sceneProgress(_ session: SessionSnapshot) -> [SceneProgress] {
        let build = session.scenes(for: .animatic)
        let buildScenes = session.step("build")["scenes"].array
        guard !buildScenes.isEmpty else {
            return build.map { SceneProgress(id: $0.id, title: $0.title, duration: $0.duration, state: .todo) }
        }
        return buildScenes.enumerated().compactMap { index, value in
            guard case .object = value else { return nil }
            let id = value["id"].identifier ?? String(index + 1)
            let state: SceneProgress.State = switch value["state"].string {
            case "done": .done
            case "working", "building", "active": .working
            default: .todo
            }
            return SceneProgress(id: id, title: value["title"].string ?? "Scene \(index + 1)",
                                 duration: value["duration"].number ?? 0, state: state, thumbnailURL: nil)
        }
    }

    /// "Ready for you: the story" / "Decided the look: ..." / "Done: the render" -> (step, kind).
    enum MentionKind { case pushed, done }
    static func stepMention(_ message: String) -> (String, MentionKind)? {
        let lower = message.lowercased()
        func step(from rest: Substring) -> String? {
            var word = rest.trimmingCharacters(in: .whitespaces)
            if word.hasPrefix("the ") { word.removeFirst(4) }
            let candidate = word.prefix { $0.isLetter || $0 == "-" || $0 == " " }.trimmingCharacters(in: .whitespaces)
            let flat = candidate.replacingOccurrences(of: " ", with: "")
            for name in StepCatalog.order where name == flat || StepCatalog.label(name).lowercased() == candidate { return name }
            // "story" may carry trailing words ("the story step"); try the first word.
            if let first = candidate.split(separator: " ").first {
                for name in StepCatalog.order where name == String(first) || StepCatalog.label(name).lowercased() == String(first) { return name }
            }
            return nil
        }
        if lower.hasPrefix("ready for you:"), let name = step(from: lower.dropFirst("ready for you:".count)) { return (name, .pushed) }
        if lower.hasPrefix("decided "), let name = step(from: lower.dropFirst("decided ".count)) { return (name, .done) }
        if lower.hasPrefix("done:"), let name = step(from: lower.dropFirst("done:".count)) { return (name, .done) }
        return nil
    }

    static func describe(url: String) -> (host: String, display: String) {
        guard let parsed = URL(string: url), var host = parsed.host else { return (url, DirectorSnip.clip(url, 70)) }
        if host.hasPrefix("www.") { host.removeFirst(4) }
        var path = parsed.path
        if path == "/" { path = "" }
        return (host, DirectorSnip.clip(host + path, 70))
    }

    /// The path after `-o`, `--output` or `--out` in a render command; its file name only.
    static func outputName(in command: String) -> String? {
        let words = command.split(whereSeparator: \.isWhitespace).map { $0.trimmingCharacters(in: CharacterSet(charactersIn: "\"';")) }
        for flag in ["-o", "--output", "--out"] {
            if let index = words.firstIndex(of: flag), words.indices.contains(index + 1) { return (words[index + 1] as NSString).lastPathComponent }
        }
        return nil
    }

    static func consolePush(_ command: String) -> String? {
        guard command.contains("console.mjs"), let range = command.range(of: "console.mjs") else { return nil }
        let words = command[range.upperBound...].split(whereSeparator: \.isWhitespace).map(String.init)
        guard words.first == "push", let index = words.firstIndex(of: "--step"), words.indices.contains(index + 1) else { return nil }
        return words[index + 1].trimmingCharacters(in: CharacterSet(charactersIn: "'\""))
    }

    static func backgroundOutputPath(_ text: String) -> String? {
        guard text.contains("running in background"), let range = text.range(of: "Output is being written to: ") else { return nil }
        let line = String(text[range.upperBound...].split(whereSeparator: \.isNewline).first ?? "")
        if let end = line.range(of: ".output") { return String(line[..<end.upperBound]) }
        return line.split(separator: " ").first.map(String.init)
    }

    static func text(of content: Any?) -> String {
        if let string = content as? String { return string }
        if let blocks = content as? [[String: Any]] { return blocks.compactMap { $0["text"] as? String }.joined(separator: "\n") }
        return ""
    }
}

enum DirectorSnip {
    static func clip(_ text: String, _ limit: Int) -> String { text.count > limit ? String(text.prefix(limit - 1)) + "…" : text }
}

// MARK: Render output parsing

/// What `hyperframes render` prints (verified against the real run's tool results):
///   `  ████░░░░░░  25%  Streaming frame 1/900 (3 workers)`   progress line: percent, stage, frames done/total
///   `  ██████████  100%  Render complete`
///   `[INFO] [Render:trace] {... "totalFrames":900 ...}`      total frames before capture starts
/// With `--quiet` (as `finish.mjs` runs it) nothing is printed, so those renders stay indeterminate.
public enum RenderOutputParser {
    public struct Result: Equatable, Sendable {
        public var framesDone: Int?
        public var framesTotal: Int?
        public var percent: Int?
        public var stage: String?
        public var complete = false
    }

    public static func parse(_ text: String) -> Result {
        var result = Result()
        let clean = text.replacingOccurrences(of: "\u{1B}\\[[0-9;?]*[A-Za-z]", with: "", options: .regularExpression)
        for raw in clean.split(whereSeparator: \.isNewline) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            // Tool results from the Read tool prefix lines with "12\t".
            let body = line.drop { $0.isNumber }.first == "\t" ? String(line.drop { $0.isNumber }.dropFirst()).trimmingCharacters(in: .whitespaces) : line
            if body.contains("\"totalFrames\":"), let total = firstInt(after: "\"totalFrames\":", in: body) { result.framesTotal = total }
            if let progress = progressLine(body) {
                result.percent = progress.percent
                result.stage = progress.stage
                if let (done, total) = frames(in: progress.stage) { result.framesDone = done; result.framesTotal = total }
                if progress.percent >= 100 || progress.stage.lowercased().contains("render complete") { result.complete = true }
            }
        }
        return result
    }

    static func progressLine(_ line: String) -> (percent: Int, stage: String)? {
        // "████░░░  25%  Streaming frame 1/900 (3 workers)"
        guard let percentRange = line.range(of: #"\b(\d{1,3})%\s+"#, options: .regularExpression) else { return nil }
        let before = line[..<percentRange.lowerBound]
        guard before.isEmpty || before.allSatisfy({ "█░▒▓ ".contains($0) }) else { return nil }
        let digits = line[percentRange].filter(\.isNumber)
        guard let percent = Int(digits) else { return nil }
        let stage = line[percentRange.upperBound...].trimmingCharacters(in: .whitespaces)
        return stage.isEmpty ? nil : (percent, stage)
    }

    static func frames(in stage: String) -> (Int, Int)? {
        guard let range = stage.range(of: #"(\d+)\s*/\s*(\d+)"#, options: .regularExpression) else { return nil }
        let parts = stage[range].split(separator: "/").map { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard parts.count == 2, let a = parts[0], let b = parts[1], b > 0 else { return nil }
        return (a, b)
    }

    static func firstInt(after key: String, in text: String) -> Int? {
        guard let range = text.range(of: key) else { return nil }
        return Int(text[range.upperBound...].prefix { $0.isNumber })
    }
}
