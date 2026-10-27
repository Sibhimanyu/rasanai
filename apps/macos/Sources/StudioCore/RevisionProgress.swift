import Foundation

// Plan 10 U5/U6: what Studio shows about a revision and about the run, read from the files the ENGINE writes (R07: the engine writes live state, Studio reads it).
//   crew/revision-latest.json   newest Plan 09 revision event per revision id (docs/plans/PLAN09_REVISION_EVENTS.md)
//   motion/edits.jsonl          element edits, latest line per id (lib/editor-patch)
//   crew/jobs/*.json, crew/pause.json, crew/throttle.json, crew/schedule.json   job and queue state
// Every state has a word AND a symbol (never colour alone). A "ready" state without its receipt is shown as unconfirmed, whatever the event claims.

// MARK: Revision events

public enum RevisionStageKind: String, Sendable, Equatable {
    case sourceChanged = "source_changed", previewPending = "preview_pending", previewReady = "preview_ready", finalRendering = "final_rendering", finalReady = "final_ready"
    case failed, blocked, cancelled, stale, unknown
}

public struct StatusToken: Equatable, Sendable {
    /// The word. Always shown; colour is never the only signal.
    public var label: String
    /// SF Symbol name.
    public var symbol: String
    public var detail: String
}

public struct WorkSummary: Equatable, Sendable {
    public var reused: [String]
    public var rebuilt: [String]
    public var pending: [String]
    /// "dependency_results" (what really happened) or "plan" (what is expected). A plan is shown as expected, never as done.
    public var basis: String
    public var isExpectation: Bool { basis != "dependency_results" }
    public var lines: [String] {
        var out: [String] = []
        if isExpectation {
            if !pending.isEmpty { out.append("Expected to rebuild: \(pending.joined(separator: ", "))") }
        } else {
            if !reused.isEmpty { out.append("Reused: \(reused.joined(separator: ", "))") }
            if !rebuilt.isEmpty { out.append("Rebuilt: \(rebuilt.joined(separator: ", "))") }
            if !pending.isEmpty { out.append("Still to do: \(pending.joined(separator: ", "))") }
        }
        return out
    }
}

public struct RevisionEvent: Equatable, Sendable, Identifiable {
    public var id: String { revisionID }
    public var revisionID: String
    public var seq: Int
    public var stage: RevisionStageKind
    public var rawStage: String
    public var sourceDigest: String?
    public var editID: String?
    public var scenes: [String]
    public var previewFile: String?
    public var previewKind: String?
    public var finalFile: String?
    public var receiptChecksum: String?
    public var receiptSourceDigest: String?
    public var receiptEditID: String?
    public var queueState: String?
    public var queueReason: String?
    public var previousDeliveredFile: String?
    public var previousDeliveredExists: Bool
    public var fallbacks: [String]
    public var work: WorkSummary
    public var note: String?

    public init?(json: JSONValue) {
        guard case .object = json, let rid = json["revision_id"].string, !rid.isEmpty else { return nil }
        revisionID = rid
        seq = Int(json["seq"].number ?? 0)
        rawStage = json["stage"].string ?? ""
        stage = RevisionStageKind(rawValue: rawStage) ?? .unknown
        sourceDigest = json["source"]["source_digest"].string
        editID = json["source"]["edit_id"].string
        scenes = json["scope"]["scenes"].strings
        previewFile = json["preview"]["file"].string
        previewKind = json["preview"]["kind"].string
        finalFile = json["final"]["file"].string
        receiptChecksum = json["receipt"]["output_checksum"].string
        receiptSourceDigest = json["receipt"]["source_digest"].string
        receiptEditID = json["receipt"]["edit_id"].string
        queueState = json["queue"]["state"].string
        queueReason = json["queue"]["reason_code"].string
        previousDeliveredFile = json["previous_delivered"]["file"].string
        previousDeliveredExists = json["previous_delivered"]["exists"].bool ?? false
        fallbacks = json["path"]["units"].array.flatMap { $0["fallbacks"].array.compactMap { f in
            guard let step = f["step"].string else { return nil }
            return [step, f["why"].string].compactMap { $0 }.joined(separator: ": ")
        } }
        work = WorkSummary(reused: json["work"]["reused"].strings, rebuilt: json["work"]["rebuilt"].strings, pending: json["work"]["pending"].strings, basis: json["work"]["basis"].string ?? "plan")
        note = json["note"].string
    }

    /// The receipt that makes a "ready" claim true: a checksum, naming the same source, and (when the edit is known) the same edit.
    public var hasMatchingReceipt: Bool {
        guard let sum = receiptChecksum, !sum.isEmpty, let rs = receiptSourceDigest, let ss = sourceDigest, rs == ss else { return false }
        if let e = editID, let re = receiptEditID, e != re { return false }
        return true
    }
    /// An overlay is ephemeral: Studio's own drag preview, never a render.
    public var isOverlayPreview: Bool { previewKind == "overlay" }

    /// What to show. A ready stage with no matching receipt (or an overlay) is shown as unconfirmed.
    public var token: StatusToken {
        switch stage {
        case .sourceChanged: return StatusToken(label: "Source changed", symbol: "pencil.circle", detail: "The change is saved in the film's source. Nothing has been rendered yet.")
        case .previewPending:
            let why = queueReason.map { " (\(RevisionEvent.reasonText($0)))" } ?? ""
            return StatusToken(label: "Preview waiting", symbol: "hourglass", detail: "A preview is queued or rendering\(why).")
        case .previewReady:
            if hasMatchingReceipt, previewFile != nil, !isOverlayPreview { return StatusToken(label: "Preview ready", symbol: "checkmark.circle", detail: "A preview was rendered from this exact source.") }
            return StatusToken(label: "Preview not confirmed", symbol: "questionmark.circle", detail: "No render receipt matches this change, so this is not shown as a finished preview.")
        case .finalRendering: return StatusToken(label: "Final rendering", symbol: "film", detail: "The delivery render is running. Your last delivered film stays available.")
        case .finalReady:
            if hasMatchingReceipt, finalFile != nil { return StatusToken(label: "Final ready", symbol: "checkmark.seal", detail: "A new film was rendered and published from this exact source.") }
            return StatusToken(label: "Final not confirmed", symbol: "questionmark.circle", detail: "No render receipt matches this change, so the delivered film is unchanged.")
        case .failed: return StatusToken(label: "Failed", symbol: "exclamationmark.triangle", detail: note.map(ErrorRedactor.redact) ?? "This revision did not finish.")
        case .blocked: return StatusToken(label: "Blocked", symbol: "pause.circle", detail: queueReason.map(RevisionEvent.reasonText) ?? "Waiting for a resource.")
        case .cancelled: return StatusToken(label: "Cancelled", symbol: "xmark.circle", detail: "This revision was cancelled.")
        case .stale: return StatusToken(label: "Out of date", symbol: "clock.badge.exclamationmark", detail: "A newer change replaced this one. Its render is not used.")
        case .unknown: return StatusToken(label: "Unknown state", symbol: "questionmark.circle", detail: "This version of Studio does not know the state “\(rawStage)”.")
        }
    }

    /// Whether the new film may replace the delivered one in the player: only a confirmed final.
    public var replacesDelivered: Bool { stage == .finalReady && hasMatchingReceipt && finalFile != nil }

    public static func reasonText(_ code: String) -> String {
        switch code {
        case "pool_full": "other renders are using the machine"
        case "fair_share_wait": "giving other films a turn"
        case "memory_pressure", "memory_pressure_timeout": "the Mac is low on memory"
        case "user_paused": "paused"
        case "provider_throttled": "the provider asked us to wait"
        case "budget_unavailable", "budget_unknown_conservative": "waiting on the budget"
        case "demand_exceeds_pool": "needs more than this Mac offers"
        case "slot_dir_unwritable": "cannot reserve a render slot"
        case "wait_timeout": "waited too long"
        case "cancelled_while_queued": "cancelled"
        default: code.replacingOccurrences(of: "_", with: " ")
        }
    }
}

public enum RevisionLog {
    /// Newest event per revision, newest first. Empty for a run without Plan 09 events (an old run).
    public static func read(run: URL) -> [RevisionEvent] {
        let url = run.appendingPathComponent("crew").appendingPathComponent("revision-latest.json")
        guard let data = try? Data(contentsOf: url), let json = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [] }
        return json["revisions"].object.values.compactMap(RevisionEvent.init(json:)).sorted { $0.seq > $1.seq }
    }
}

// MARK: Edit lifecycle (motion/edits.jsonl)

public enum EditLifecycle: String, Sendable, Equatable, CaseIterable {
    case requested, accepted, applied, previewReady = "preview_ready", rendered, failed, reverted, stale, conflicted

    public var token: StatusToken {
        switch self {
        case .requested: StatusToken(label: "Requested", symbol: "paperplane", detail: "Sent to the engine; not applied yet.")
        case .accepted: StatusToken(label: "Accepted", symbol: "checkmark", detail: "The engine accepted it.")
        case .applied: StatusToken(label: "Applied to source", symbol: "pencil.circle", detail: "The film's source changed. It has not been rendered.")
        case .previewReady: StatusToken(label: "Preview ready", symbol: "eye", detail: "A preview matching this edit was rendered.")
        case .rendered: StatusToken(label: "Rendered", symbol: "checkmark.seal", detail: "A render matching this edit exists.")
        case .failed: StatusToken(label: "Failed", symbol: "exclamationmark.triangle", detail: "The edit did not apply.")
        case .reverted: StatusToken(label: "Undone", symbol: "arrow.uturn.backward", detail: "This edit was undone.")
        case .stale: StatusToken(label: "Out of date", symbol: "clock.badge.exclamationmark", detail: "The film changed after this edit.")
        case .conflicted: StatusToken(label: "Conflict", symbol: "exclamationmark.octagon", detail: "Something changed since this edit, so it cannot be undone safely.")
        }
    }
}

public struct EditLine: Equatable, Sendable, Identifiable {
    public var id: String
    public var lifecycle: EditLifecycle
    public var elementID: String?
    public var instruction: String
    public var conflictReason: String?
    /// A render receipt was recorded (older runs have none; they are shown without a verified mark).
    public var hasReceipt: Bool
    /// Undo can be offered as a restore-as-new-version when the plain undo conflicts.
    public var offersRestoreAsNewVersion: Bool { lifecycle == .conflicted }
}

public enum EditLog {
    public static func read(run: URL) -> [EditLine] {
        let url = run.appendingPathComponent("motion").appendingPathComponent("edits.jsonl")
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return [] }
        var latest: [String: JSONValue] = [:], order: [String] = []
        for line in text.split(separator: "\n") {
            guard let data = line.data(using: .utf8), let json = try? JSONDecoder().decode(JSONValue.self, from: data), let id = json["id"].string else { continue }
            if latest[id] == nil { order.append(id) }
            latest[id] = json
        }
        return order.compactMap { id in
            guard let j = latest[id] else { return nil }
            let conflict = j["conflict"]["reason"].string
            let raw = j["status"].string ?? "requested"
            let life = conflict != nil ? EditLifecycle.conflicted : (EditLifecycle(rawValue: raw) ?? .requested)
            return EditLine(id: id, lifecycle: life, elementID: j["element_id"].string, instruction: j["instruction"].string ?? "", conflictReason: conflict.map(ErrorRedactor.redact), hasReceipt: j["receipt"] != .null)
        }
    }
}

// MARK: The run's state from actual jobs

public enum RunActivityState: String, Sendable, Equatable {
    case working, waitingForYou = "waiting_for_you", paused, rateLimited = "rate_limited", stopped, failed

    public var token: StatusToken {
        switch self {
        case .working: StatusToken(label: "Working", symbol: "gearshape.2", detail: "Steps are running.")
        case .waitingForYou: StatusToken(label: "Waiting for you", symbol: "person.crop.circle.badge.questionmark", detail: "A call is waiting for your decision.")
        case .paused: StatusToken(label: "Paused", symbol: "pause.circle", detail: "Nothing new starts. Work already running finishes.")
        case .rateLimited: StatusToken(label: "Rate-limited", symbol: "speedometer", detail: "The provider asked us to wait.")
        case .stopped: StatusToken(label: "Stopped", symbol: "stop.circle", detail: "No step is running.")
        case .failed: StatusToken(label: "Failed", symbol: "exclamationmark.triangle", detail: "A step failed. You can retry it.")
        }
    }
}

public struct RunJob: Equatable, Sendable, Identifiable {
    public var id: String
    public var node: String
    public var state: String
    public var attempt: Int
    /// A job of this film in a state that can be cancelled. A job on a shared external queue is marked, never interrupted.
    public var canCancel: Bool { ["pending", "leased", "running", "retry_wait"].contains(state) }
    public var canRetry: Bool { ["failed", "retry_wait"].contains(state) }
    /// An unknown outcome may already be running at the provider: retrying needs the person's explicit approval of a possible duplicate.
    public var needsDuplicateApproval: Bool { state == "unknown_outcome" }
}

public struct RunActivity: Equatable, Sendable {
    public var state: RunActivityState
    public var reason: String
    public var jobs: [RunJob]
    public var retryAfterSeconds: Int?
    public var waitingOn: [String]
}

public enum RunActivityReader {
    /// Mirrors `runStatus` in lib/job-control.mjs: Failed (nothing active) > Paused > Rate-limited > Working > Waiting for you > Stopped.
    public static func read(run: URL, now: Date = Date()) -> RunActivity {
        let crew = run.appendingPathComponent("crew")
        let fm = FileManager.default
        let files = ((try? fm.contentsOfDirectory(at: crew.appendingPathComponent("jobs"), includingPropertiesForKeys: nil)) ?? []).filter { $0.pathExtension == "json" }
        let jobs: [RunJob] = files.compactMap { url in
            guard let data = try? Data(contentsOf: url), let j = try? JSONDecoder().decode(JSONValue.self, from: data), let id = j["job_id"].string else { return nil }
            return RunJob(id: id, node: j["node_id"].string ?? "", state: j["state"].string ?? "", attempt: Int(j["attempt"].number ?? 1))
        }.sorted { $0.id < $1.id }
        func json(_ name: String) -> JSONValue? { (try? Data(contentsOf: crew.appendingPathComponent(name))).flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) } }
        let paused = json("pause.json")?["paused"].bool == true
        var retryAfter: Int?
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        for (_, entry) in json("throttle.json")?.object ?? [:] {
            guard let until = entry["until"].string, let date = iso.date(from: until) ?? plain.date(from: until), date > now else { continue }
            retryAfter = max(retryAfter ?? 0, Int(date.timeIntervalSince(now).rounded(.up)))
        }
        let waits = (json("schedule.json")?["user_waits"].array ?? []).compactMap { $0["call"].string ?? $0.string }
        let active = jobs.filter { $0.state == "leased" || $0.state == "running" }
        let failed = jobs.filter { $0.state == "failed" || $0.state == "unknown_outcome" }
        let state: RunActivityState, reason: String
        if !failed.isEmpty, active.isEmpty { state = .failed; reason = failed.contains { $0.state == "unknown_outcome" } ? "A request may or may not have reached the provider. Check it before trying again." : RunActivityState.failed.token.detail }
        else if paused { state = .paused; reason = RunActivityState.paused.token.detail }
        else if let retryAfter { state = .rateLimited; reason = "The provider asked us to wait about \(retryAfter)s." }
        else if !active.isEmpty { state = .working; reason = "\(active.count) step\(active.count == 1 ? "" : "s") running." }
        else if !waits.isEmpty { state = .waitingForYou; reason = RunActivityState.waitingForYou.token.detail }
        else { state = .stopped; reason = jobs.isEmpty ? "Nothing is scheduled." : RunActivityState.stopped.token.detail }
        return RunActivity(state: state, reason: reason, jobs: jobs, retryAfterSeconds: retryAfter, waitingOn: waits)
    }

    /// The `job-control` action value (console.mjs jobControlHook). Never a provider interrupt: a shared queue's job is only marked.
    public static func control(_ op: String, job: String? = nil, approveDuplicate: Bool = false) -> JSONValue {
        var v: [String: JSONValue] = ["op": .string(op)]
        if let job { v["job_id"] = .string(job) }
        if approveDuplicate { v["approve_duplicate"] = .bool(true) }
        return .object(v)
    }
}

// MARK: Capabilities (crew/capabilities.json, written by job-control `capabilities`)

public struct CapabilityListing: Equatable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var state: String
    public var explanation: String
    public var alternative: String?
    /// Only a usable adapter is shown as ready.
    public var isReady: Bool { state == "ready" }
    public var isUsable: Bool { state == "ready" || state == "experimental" }
}

public enum CapabilityReader {
    public static func read(run: URL) -> [CapabilityListing] {
        let url = run.appendingPathComponent("crew").appendingPathComponent("capabilities.json")
        guard let data = try? Data(contentsOf: url), let json = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [] }
        return json["items"].array.compactMap { i in
            guard let id = i["id"].string else { return nil }
            return CapabilityListing(id: id, label: ErrorRedactor.redact(i["label"].string ?? id), state: i["state"].string ?? "unavailable", explanation: ErrorRedactor.redact(i["explanation"].string ?? ""), alternative: i["alternative"].string)
        }
    }
}

// MARK: Usage honesty

public struct UsageDisplay: Equatable, Sendable {
    public var measured: Double?
    public var estimated: Double?
    public init(measured: Double? = nil, estimated: Double? = nil) { self.measured = measured; self.estimated = estimated }
    /// A measurement is shown as one; an estimate says "estimated"; neither says "unavailable" (never a zero).
    public var text: String {
        if let measured { return "\(Self.format(measured)) tokens" }
        if let estimated { return "About \(Self.format(estimated)) tokens (estimated)" }
        return "Usage unavailable"
    }
    static func format(_ n: Double) -> String { n >= 10_000 ? String(format: "%.0fk", n / 1000) : n >= 1000 ? String(format: "%.1fk", n / 1000) : String(format: "%.0f", n) }
}

// MARK: Original / Updated correspondence (retimed versions)

public struct TimelineBeat: Equatable, Sendable { public var id: String, start: Double, end: Double
    public init(id: String, start: Double, end: Double) { self.id = id; self.start = start; self.end = end } }

public struct TimelineCorrespondence: Equatable, Sendable {
    public struct Segment: Equatable, Sendable { public var beatID: String, original: ClosedRange<Double>, updated: ClosedRange<Double>
        public var retimed: Bool { abs(original.lowerBound - updated.lowerBound) > 1e-6 || abs(original.upperBound - updated.upperBound) > 1e-6 } }
    public var segments: [Segment]
    public var added: [String]
    public var removed: [String]
    /// True only when every beat sits at the same time in both: only then may "the same timestamp" mean "the same moment".
    public var isIdentical: Bool { added.isEmpty && removed.isEmpty && !segments.contains { $0.retimed } }

    public init(original: [TimelineBeat], updated: [TimelineBeat]) {
        let u = Dictionary(updated.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var segs: [Segment] = [], gone: [String] = []
        for b in original {
            guard let m = u[b.id], b.end >= b.start, m.end >= m.start else { gone.append(b.id); continue }
            segs.append(Segment(beatID: b.id, original: b.start...b.end, updated: m.start...m.end))
        }
        let known = Set(original.map(\.id))
        segments = segs; removed = gone; added = updated.map(\.id).filter { !known.contains($0) }
    }

    /// The matching moment on the other side, through the beat it falls in (linear inside the beat); nil when that moment has no counterpart.
    public func map(_ t: Double, originalToUpdated: Bool = true) -> (time: Double, beat: String)? {
        for (i, s) in segments.enumerated() {
            let from = originalToUpdated ? s.original : s.updated, to = originalToUpdated ? s.updated : s.original
            guard t >= from.lowerBound, t < from.upperBound || (t == from.upperBound && i == segments.count - 1) else { continue }
            let span = from.upperBound - from.lowerBound
            let f = span > 0 ? (t - from.lowerBound) / span : 0
            return (to.lowerBound + f * (to.upperBound - to.lowerBound), s.beatID)
        }
        return nil
    }
}
