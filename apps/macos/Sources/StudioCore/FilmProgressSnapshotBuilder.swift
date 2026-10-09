import Foundation

extension FilmProgressEngine {
    // MARK: Timeline

    struct Timeline {
        var starts: [ProgressPhase: Date] = [:]
        var frontier: ProgressPhase = .research

        func phase(at time: Date) -> ProgressPhase {
            var result: ProgressPhase = .research
            for phase in ProgressPhase.allCases { if let start = starts[phase], start <= time { result = phase } }
            return result
        }
    }

    func timeline() -> Timeline {
        var evidence = logEvidence + sessionEvidence
        evidence.sort { ($0.time, $0.phase) < ($1.time, $1.phase) }
        var line = Timeline()
        let first = [firstEventAt, evidence.first?.time].compactMap { $0 }.min()
        guard let first else { return line }
        line.starts[.research] = first
        for item in evidence where item.phase > line.frontier {
            if let required = item.requires, line.frontier < required { continue }
            line.starts[item.phase] = max(item.time, line.starts[line.frontier] ?? item.time)
            line.frontier = item.phase
        }
        return line
    }

    /// Spans (start, end) when the director was waiting for the person: from "Ready for you" or a question until their answer.
    func waitingWindows(now: Date) -> [(Date, Date)] {
        var windows: [(Date, Date)] = []
        var open: Date?
        for line in sessionLines.sorted(by: { $0.time < $1.time }) {
            if line.level == "ask", open == nil { open = line.time }
            else if line.level == "you", let start = open { windows.append((start, max(start, line.time))); open = nil }
        }
        if let open, waitingOnUser || isOpenWindowCurrent { windows.append((open, max(open, now))) }
        return windows
    }

    var isOpenWindowCurrent: Bool {
        guard let lastAsk = sessionLines.last(where: { $0.level == "ask" }) else { return false }
        return !sessionLines.contains { $0.level == "you" && $0.time >= lastAsk.time }
    }

    // MARK: Snapshot

    /// Everything at `now`.
    public func snapshot(now: Date) -> FilmProgressSnapshot {
        var s = FilmProgressSnapshot()
        s.title = title
        s.asOf = now
        let line = timeline()
        let started = ProgressPhase.allCases.filter { line.starts[$0] != nil }
        let finished = finishedAt != nil
        let windows = waitingWindows(now: now)
        let waiting = !finished && (waitingOnUser || isOpenWindowCurrent)
        s.isWaitingForYou = waiting
        s.currentPhase = line.frontier
        s.startedAt = firstEventAt ?? line.starts[.research]
        s.finishedAt = finishedAt
        s.recentTools = recentTools.map { var item = $0; item.phase = line.phase(at: $0.time); return item }

        // Phase rows.
        let costs = phaseCosts(line)
        for index in s.phases.indices {
            let phase = s.phases[index].phase
            let start = line.starts[phase]
            let nextStart = ProgressPhase.allCases.filter { $0 > phase }.compactMap { line.starts[$0] }.min()
            var row = PhaseSummary(phase: phase)
            row.startedAt = start
            row.endedAt = start == nil ? nil : (nextStart ?? (finished && phase == line.frontier ? finishedAt : nil))
            if start == nil {
                row.state = (started.contains { $0 > phase } || (finished && phase < line.frontier)) ? .skipped : .upcoming
            } else if phase < line.frontier || (finished && phase == line.frontier) {
                row.state = .done
            } else {
                row.state = waiting ? .waitingForYou : .active
            }
            if let start {
                let end = row.endedAt ?? now
                row.waitingSeconds = windows.reduce(0) { $0 + max(0, min($1.1, end).timeIntervalSince(max($1.0, start))) }
            }
            let bucket = costs.buckets[phase] ?? (TokenTotals(), 0)
            row.tokens = bucket.0
            row.costUSD = bucket.1
            row.costIsEstimated = costs.estimated
            row.isIncludedInPlan = costs.plan
            s.phases[index] = row
        }
        s.totalTokens = telemetry.tokens
        s.totalCostUSD = telemetry.cost.usd
        s.costIsEstimated = costs.estimated
        s.isIncludedInPlan = costs.plan

        // Research.
        var research = ResearchProgress()
        let researchEnd = line.starts[.script]
        let inResearch = sources.filter { researchEnd == nil || $0.time < researchEnd! }
        research.sources = inResearch
        research.pageCount = inResearch.filter { $0.kind == .page }.count
        research.searchCount = inResearch.filter { $0.kind == .search }.count
        research.findingsCount = findingsCount
        research.findingsPushedAt = findingsPushedAt
        research.budget = budget
        research.startedAt = researchStartedAt ?? line.starts[.research]
        research.endedAt = researchEnd
        research.waitingSeconds = windows.reduce(0) { total, window in
            guard let from = research.startedAt else { return total }
            return total + max(0, min(window.1, researchEnd ?? now).timeIntervalSince(max(window.0, from)))
        }
        s.research = research

        // Crew, newest first, with the phase each joined in.
        s.crew = crewOrder.compactMap { crew[$0] }.map { member in
            var m = member
            m.phase = line.phase(at: member.startedAt)
            if stoppedAt != nil, m.state == .running { m.state = .failed }
            return m
        }.sorted { $0.startedAt > $1.startedAt }

        // Plan, Build, Check, Render details.
        s.keyframes = artifacts.keyframes
        s.keyframesExpected = expectedKeyframes ?? artifacts.plannedSceneCount
        s.scenes = scenes.map { scene in
            var copy = scene
            copy.thumbnailURL = artifacts.sceneStills[scene.id] ?? artifacts.sceneStills[scene.id.replacingOccurrences(of: "s", with: "")]
            return copy
        }
        s.buildStages = stageChips
        s.newestStill = artifacts.newestStill
        s.drafts = artifacts.drafts
        s.criticFindings = criticFindings(line: line, finished: finished)
        s.render = renderProgress(line: line, now: now, finished: finished, waiting: waiting)
        let checkRounds = max(artifacts.criticReports.map(\.round).max() ?? 0, 0)
        if let index = s.phases.firstIndex(where: { $0.phase == .check }) { s.phases[index].rounds = max(checkRounds, artifacts.drafts.count > 0 && s.phases[index].startedAt != nil ? 1 : 0) }

        s.activity = activityItems(line: line)
        s.now = nowLine(&s, now: now)
        applyEstimates(&s, now: now)
        return s
    }

    // MARK: Cost and tokens per phase

    struct Costs { var buckets: [ProgressPhase: (TokenTotals, Double)] = [:]; var estimated = false; var plan = false }

    func phaseCosts(_ line: Timeline) -> Costs {
        var result = Costs()
        let cost = telemetry.cost
        result.estimated = cost.isEstimated
        result.plan = cost.isIncludedInPlan
        // Provisional helper samples (a session still open) have no price yet: they get the film's average cost per token so far.
        let perToken = telemetry.tokens.total > 0 ? cost.usd / Double(telemetry.tokens.total) : 0
        func weight(_ sample: TokenSample) -> Double { sample.provisional ? Double(sample.tokens.total) * perToken : sample.estimatedUSD }
        let totalEstimate = tokenSamples.reduce(0) { $0 + weight($1) }
        let scale = totalEstimate > 0 ? cost.usd / totalEstimate : 0
        for sample in tokenSamples {
            let phase = line.phase(at: sample.time)
            let old = result.buckets[phase] ?? (TokenTotals(), 0)
            result.buckets[phase] = (old.0 + sample.tokens, old.1 + (result.plan ? 0 : weight(sample) * scale))
        }
        // Live sums can drift from the director's own totals (streamed counts); the totals win, so the rows add up.
        let raw = result.buckets.values.reduce(TokenTotals()) { $0 + $1.0 }
        let total = telemetry.tokens
        func factor(_ target: Int, _ have: Int) -> Double { have > 0 ? Double(target) / Double(have) : 1 }
        let fi = factor(total.input, raw.input), fo = factor(total.output, raw.output), fr = factor(total.cacheRead, raw.cacheRead), fw = factor(total.cacheWrite, raw.cacheWrite)
        for (phase, bucket) in result.buckets {
            let t = bucket.0
            result.buckets[phase] = (TokenTotals(input: Int(Double(t.input) * fi), output: Int(Double(t.output) * fo), cacheRead: Int(Double(t.cacheRead) * fr), cacheWrite: Int(Double(t.cacheWrite) * fw)), bucket.1)
        }
        return result
    }

    // MARK: Critics

    func criticFindings(line: Timeline, finished: Bool) -> [CriticFinding] {
        var items: [CriticFinding] = []
        let reports = artifacts.criticReports
        let fixNotes = sessionLines.filter { l in
            let t = l.message.lowercased()
            return (t.contains("fix") && (t.contains(" in") || t.contains("fixed") || t.contains("are in"))) || t.contains("rebuilt")
        }
        let maxRound = reports.map(\.round).max() ?? 0
        for report in reports {
            let source = report.lens.capitalized + " critic"
            let later = report.round < maxRound || line.frontier >= .render || fixNotes.contains { $0.time > report.time }
            if report.findings.isEmpty || report.verdict == "pass" {
                items.append(CriticFinding(id: "critic-\(report.lens)-\(report.round)-clean", round: report.round, source: source, summary: "No issues", state: .clean, time: report.time))
                continue
            }
            for (index, finding) in report.findings.enumerated() {
                let sentence = finding.problem.split(separator: ".", maxSplits: 1).first.map(String.init) ?? finding.problem
                let scene = finding.scene.map { "Scene \($0): " } ?? ""
                items.append(CriticFinding(id: "critic-\(report.lens)-\(report.round)-\(index)", round: report.round, source: source,
                                           summary: DirectorSnip.clip(scene + sentence, 170), state: later ? .fixed : .found, time: report.time))
            }
        }
        // Gates and checks the director reported in plain words.
        let checkStart = line.starts[.check]
        for entry in sessionLines {
            guard let checkStart, entry.time >= checkStart, line.starts[.render].map({ entry.time < $0 }) ?? true else { continue }
            let t = entry.message.lowercased()
            if t.contains("came back clean") || (t.contains("passes every check")) || t.contains("every gate clean") {
                items.append(CriticFinding(id: "gates-\(Int(entry.time.timeIntervalSince1970))", round: 0, source: "Checks", summary: DirectorSnip.clip(entry.message, 170), state: .clean, time: entry.time))
            }
        }
        return items.sorted { ($0.time, $0.id) < ($1.time, $1.id) }
    }

    // MARK: Render

    func renderProgress(line: Timeline, now: Date, finished: Bool, waiting: Bool) -> RenderProgress {
        var r = RenderProgress()
        let running = stoppedAt == nil
        let active = renders.last { $0.finishedAt == nil } .flatMap { running ? $0 : nil }
        let run: RenderRun? = active ?? (line.frontier >= .render ? renders.last { $0.kind == .final } : renders.last)
        if let run {
            r.kind = run.kind
            r.outputName = run.outputName
            r.startedAt = run.startedAt
            r.finishedAt = run.finishedAt
            r.framesTotal = run.framesTotal
            r.framesDone = run.framesDone
            r.stage = run.stage
            if let done = run.framesDone, let total = run.framesTotal, total > 0 {
                r.fraction = min(1, Double(done) / Double(total))
            } else if let percent = run.percent {
                r.fraction = Double(percent) / 100
            }
            if run.finishedAt != nil, !run.failed { r.state = .done; r.fraction = 1 }
            else if run.finishedAt != nil { r.state = .notStarted }
            else if !running { r.state = .notStarted }
            else if let percent = run.percent, percent >= 90 { r.state = .finishing }
            else if run.framesDone != nil { r.state = .rendering }
            else { r.state = now.timeIntervalSince(run.startedAt) < 5 ? .preparing : .rendering }
            if r.state == .rendering || r.state == .preparing {
                r.etaSeconds = renderETA(run, now: now, fraction: r.fraction)
                if run.framesDone == nil && run.percent == nil {
                    r.stage = r.stage ?? (run.kind == .final ? "Rendering with motion blur and grain" : "Rendering a draft")
                }
            }
        } else if finished {
            r.kind = .final; r.state = .done; r.fraction = 1
        }
        if finished || (r.kind == .final && r.state == .done) {
            r.videoURL = artifacts.finalVideo
            r.posterURL = artifacts.poster
            if r.state == .notStarted { r.state = .done; r.fraction = 1; r.kind = .final }
        }
        return r
    }

    func renderETA(_ run: RenderRun, now: Date, fraction: Double?) -> TimeInterval? {
        if let done = run.framesDone, let total = run.framesTotal, let first = run.samples.first, let last = run.samples.last,
           last.time.timeIntervalSince(first.time) >= 3, last.frames > first.frames {
            let rate = Double(last.frames - first.frames) / last.time.timeIntervalSince(first.time)
            return Double(total - done) / rate
        }
        if let fraction, fraction > 0.05, fraction < 1 {
            let elapsed = now.timeIntervalSince(run.startedAt)
            return elapsed * (1 - fraction) / fraction
        }
        return nil
    }

    // MARK: Activity

    func activityItems(line: Timeline) -> [ProgressActivity] {
        var items: [ProgressActivity] = []
        for (index, entry) in sessionLines.enumerated() {
            let kind: ProgressActivity.Kind = switch entry.level {
            case "ask": .ask
            case "you": .answer
            case "ok": .milestone
            case "warn", "error": .warning
            default: .note
            }
            items.append(ProgressActivity(id: "session-\(index)", time: entry.time, phase: line.phase(at: entry.time), kind: kind, title: entry.message))
        }
        for id in crewOrder {
            guard let member = crew[id] else { continue }
            items.append(ProgressActivity(id: "crew-start-\(id)", time: member.startedAt, phase: line.phase(at: member.startedAt), kind: .crew, title: "Started: \(member.name)"))
            if let end = member.endedAt, member.state == .done {
                items.append(ProgressActivity(id: "crew-end-\(id)", time: end, phase: line.phase(at: end), kind: .crew, title: "Finished: \(member.name)"))
            }
        }
        for run in renders {
            guard let end = run.finishedAt, !run.failed else { continue }
            let name = run.outputName ?? (run.kind == .final ? "the final film" : "a draft")
            items.append(ProgressActivity(id: "render-\(run.id)", time: end, phase: line.phase(at: end), kind: .render, title: "Rendered \(name)"))
        }
        for report in artifacts.criticReports {
            let phase = line.phase(at: report.time)
            let title = report.findings.isEmpty || report.verdict == "pass" ? "\(report.lens.capitalized) critic: no issues"
                : "\(report.lens.capitalized) critic found \(report.findings.count) \(report.findings.count == 1 ? "issue" : "issues")"
            items.append(ProgressActivity(id: "critic-\(report.lens)-\(report.round)", time: report.time, phase: phase, kind: .critic, title: title))
        }
        return items.sorted { ($0.time, $0.id) < ($1.time, $1.id) }
    }

    // MARK: Now

    func nowLine(_ s: inout FilmProgressSnapshot, now: Date) -> NowLine {
        let phase = s.currentPhase
        if let finished = s.finishedAt { return NowLine(phase: phase, kind: .finished, text: "Your film is ready", detail: nil, since: finished) }
        if s.isWaitingForYou {
            let text = askQuestion.map { "Waiting for you: \($0)" } ?? "Waiting for you: \(waitingLabel())"
            return NowLine(phase: phase, kind: .waiting, text: text, since: sessionLines.last { $0.level == "ask" }?.time)
        }
        let runningCrew = s.crew(in: phase, running: true)
        let crewDetail: String? = runningCrew.isEmpty ? nil : (runningCrew.count == 1 ? runningCrew[0].name : "\(runningCrew.count) helpers at work: " + runningCrew.prefix(2).map(\.name).joined(separator: "; "))
        switch phase {
        case .research:
            if let source = sources.last(where: { now.timeIntervalSince($0.time) < 30 }), s.research.endedAt == nil {
                let count = s.research.sourceCount
                let tail = budget.map { "(\(count) of \($0.sources) sources)" } ?? "(\(count) sources so far)"
                let verb = source.kind == .page ? "Reading" : "Searching for"
                return NowLine(phase: phase, kind: source.kind == .page ? .reading : .searching, text: "\(verb) \(source.display) \(tail)",
                               detail: crewDetail, since: source.time)
            }
        case .plan:
            if let expected = s.keyframesExpected, expected > 0, runningCrew.contains(where: { $0.name.lowercased().contains("key frame") }) {
                // The same slot the Plan card pulses: the first scene slot with no key frame yet.
                let drawn = s.keyframes.filter { $0.kind == .keyframe }
                let taken = Set(drawn.compactMap(\.sceneID))
                let slot = (1...expected).first { !taken.contains(String($0)) } ?? min(drawn.count + 1, expected)
                return NowLine(phase: phase, kind: .drawing, text: "Drawing key frame \(slot) of \(expected)", detail: crewDetail)
            }
        case .build:
            let total = s.scenes.count
            if total > 0 {
                let done = s.scenes.filter { $0.state == .done }.count
                if let working = s.scenes.first(where: { $0.state == .working }) {
                    return NowLine(phase: phase, kind: .building, text: "Building \(working.title) (\(done) of \(total) scenes done)", detail: crewDetail)
                }
                return NowLine(phase: phase, kind: .building, text: "Building the film: \(done) of \(total) scenes done", detail: crewDetail)
            }
        case .check:
            if let critic = runningCrew.first { return NowLine(phase: phase, kind: .checking, text: critic.name, detail: crewDetail, since: critic.startedAt) }
        case .render:
            let r = s.render
            if r.state == .rendering || r.state == .preparing || r.state == .finishing {
                let label = r.kind == .draft ? "a draft" : "the final film"
                if let done = r.framesDone, let total = r.framesTotal {
                    let eta = r.etaSeconds.map { ", \(FilmProgressFormat.about($0)) left" } ?? ""
                    return NowLine(phase: phase, kind: .rendering, text: "Rendering \(done) of \(total) frames\(eta)", since: r.startedAt)
                }
                if r.state == .finishing { return NowLine(phase: phase, kind: .rendering, text: "Finishing \(label): joining picture and sound", since: r.startedAt) }
                return NowLine(phase: phase, kind: .rendering, text: "Rendering \(label) (\(FilmProgressFormat.duration(r.elapsed(now: now))) so far)", since: r.startedAt)
            }
        default: break
        }
        // Fallback: the director's latest plain-words status, else its latest tool call.
        if let working = workingMessage, !working.isEmpty { return NowLine(phase: phase, kind: kindFor(phase), text: DirectorSnip.clip(working, 140), detail: crewDetail) }
        if let latest = sessionLines.last(where: { $0.level == "info" || $0.level == "ok" }), now.timeIntervalSince(latest.time) < 900 {
            return NowLine(phase: phase, kind: kindFor(phase), text: DirectorSnip.clip(latest.message, 140), detail: crewDetail, since: latest.time)
        }
        if let tool = recentTools.last(where: { $0.kind == .command }) { return NowLine(phase: phase, kind: .thinking, text: tool.title, detail: crewDetail, since: tool.time) }
        return NowLine(phase: phase, kind: .thinking, text: runningCrew.first?.name ?? "Getting started", detail: crewDetail)
    }

    func kindFor(_ phase: ProgressPhase) -> NowLine.Kind {
        switch phase {
        case .research: .reading
        case .script: .writing
        case .look, .plan: .drawing
        case .animatic: .thinking
        case .build: .building
        case .check: .checking
        case .render: .rendering
        }
    }

    func waitingLabel() -> String {
        switch currentStep {
        case "brief": "check the brief"
        case "story", "concept": "pick a script"
        case "look", "films", "direction": "pick a look"
        case "animatic": "review the animatic"
        case "render", "final": "press Render"
        default: "your call on the \(StepCatalog.label(currentStep).lowercased()) step"
        }
    }

    // MARK: Estimates

    func applyEstimates(_ s: inout FilmProgressSnapshot, now: Date) {
        let quick = (budget?.seconds ?? 9_999) <= 150
        var total: TimeInterval = 0
        var any = false
        for index in s.phases.indices {
            let row = s.phases[index]
            let typical = ProgressPhaseMapper.typicalSeconds(row.phase, quickResearch: quick, filmSeconds: filmSeconds)
            switch row.state {
            case .upcoming:
                s.phases[index].estimate = PhaseEstimate(secondsLeft: typical, basis: .typical)
            case .active:
                s.phases[index].estimate = activeEstimate(row, typical: typical, snapshot: s, now: now)
            case .waitingForYou, .done, .skipped:
                s.phases[index].estimate = nil
            }
            if let estimate = s.phases[index].estimate { total += estimate.secondsLeft; any = true }
        }
        s.remaining = (s.finishedAt == nil && any) ? PhaseEstimate(secondsLeft: total, basis: .typical) : nil
    }

    func activeEstimate(_ row: PhaseSummary, typical: TimeInterval, snapshot s: FilmProgressSnapshot, now: Date) -> PhaseEstimate {
        let worked = row.workSeconds(now: now)
        switch row.phase {
        case .research:
            if let budget { return PhaseEstimate(secondsLeft: max(20, budget.seconds - s.research.elapsed(now: now)), basis: .typical) }
        case .build:
            let done = s.scenes.filter { $0.state == .done }.count
            if !s.scenes.isEmpty, done > 0 {
                let fraction = Double(done) / Double(s.scenes.count)
                return PhaseEstimate(secondsLeft: worked * (1 - fraction) / fraction, basis: .measured)
            }
        case .plan:
            let frames = s.keyframes.filter { $0.kind == .keyframe }
            if let expected = s.keyframesExpected, frames.count >= 2, frames.count < expected, let first = frames.first?.addedAt {
                let per = max(30, now.timeIntervalSince(first) / Double(frames.count))
                return PhaseEstimate(secondsLeft: per * Double(expected - frames.count), basis: .measured)
            }
        case .render:
            if let eta = s.render.etaSeconds { return PhaseEstimate(secondsLeft: eta, basis: .measured) }
            if s.render.isMeasured, s.render.fraction == 1 { return PhaseEstimate(secondsLeft: 20, basis: .measured) }
        default: break
        }
        return PhaseEstimate(secondsLeft: max(typical * 0.2, typical - worked), basis: .typical)
    }
}
