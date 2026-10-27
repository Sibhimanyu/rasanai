import Foundation

// Plan 01 contract records (additive, not wired into views). Snake_case on disk, lenient decode:
// decodeIfPresent everywhere, unknown keys ignored, a missing schema_version means a legacy record.

public enum Contracts {
    public static let schemaVersion = 1
}

public enum LogicalStage: String, Codable, CaseIterable, Sendable {
    case brief, story, look, storyboard, build, final

    /// Tolerant mapping of a legacy console step name. Unknown -> nil. Mirrors StageRoute / ProgressPhaseMapper /
    /// Session.consoleStep / CallNotices; render and final are one stage today.
    public static func from(legacyStep step: String) -> LogicalStage? {
        switch step.lowercased() {
        case "brief", "route", "research", "brand", "footage": .brief
        case "story", "concept": .story
        case "look", "films", "direction", "motion", "transitions", "styleframes": .look
        case "animatic", "preview", "scenes", "storyboard", "keyframes", "voice", "music", "reel", "plan": .storyboard
        case "build": .build
        case "render", "final": .final
        default: nil
        }
    }

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard let value = LogicalStage(rawValue: raw) ?? LogicalStage.from(legacyStep: raw) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "unknown stage \(raw)"))
        }
        self = value
    }
}

public struct StageDependency: Codable, Equatable, Sendable {
    public var stage: LogicalStage?
    public var revision: Int?
    public var digest: String?
    enum CodingKeys: String, CodingKey { case stage, revision, digest }
    public init(stage: LogicalStage? = nil, revision: Int? = nil, digest: String? = nil) { self.stage = stage; self.revision = revision; self.digest = digest }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        stage = try? c.decodeIfPresent(LogicalStage.self, forKey: .stage)
        revision = try? c.decodeIfPresent(Int.self, forKey: .revision)
        digest = try? c.decodeIfPresent(String.self, forKey: .digest)
    }
}

public struct ApprovalRecord: Codable, Equatable, Sendable {
    public var schemaVersion: Int?
    public var stage: LogicalStage?
    public var artifactRef: String?
    public var artifactDigest: String?
    public var revision: Int?
    public var approvedBy: String?
    public var sourceActionId: String?
    public var dependsOn: [StageDependency]
    public var isLegacy: Bool { schemaVersion == nil }
    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", stage, artifactRef = "artifact_ref", artifactDigest = "artifact_digest", revision
        case approvedBy = "approved_by", sourceActionId = "source_action_id", dependsOn = "depends_on"
    }
    public init(schemaVersion: Int? = Contracts.schemaVersion, stage: LogicalStage? = nil, artifactRef: String? = nil, artifactDigest: String? = nil, revision: Int? = nil, approvedBy: String? = nil, sourceActionId: String? = nil, dependsOn: [StageDependency] = []) {
        self.schemaVersion = schemaVersion; self.stage = stage; self.artifactRef = artifactRef; self.artifactDigest = artifactDigest
        self.revision = revision; self.approvedBy = approvedBy; self.sourceActionId = sourceActionId; self.dependsOn = dependsOn
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        stage = try? c.decodeIfPresent(LogicalStage.self, forKey: .stage)
        artifactRef = try? c.decodeIfPresent(String.self, forKey: .artifactRef)
        artifactDigest = try? c.decodeIfPresent(String.self, forKey: .artifactDigest)
        revision = try? c.decodeIfPresent(Int.self, forKey: .revision)
        approvedBy = try? c.decodeIfPresent(String.self, forKey: .approvedBy)
        sourceActionId = try? c.decodeIfPresent(String.self, forKey: .sourceActionId)
        dependsOn = (try? c.decodeIfPresent([StageDependency].self, forKey: .dependsOn)) ?? []
    }
}

public struct FilmBrief: Codable, Equatable, Sendable {
    public var schemaVersion: Int?
    public var communicationKind: String?
    public var viewer: String?
    public var destination: String?
    public var scope: String?
    public var takeaway: String?
    public var durationSeconds: Double?
    public var aspect: String?
    public var mustShow: [String]
    public var evidenceRefs: [String]
    public var assumptions: [String]
    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", communicationKind = "communication_kind", viewer, destination, scope, takeaway
        case durationSeconds = "duration_seconds", aspect, mustShow = "must_show", evidenceRefs = "evidence_refs", assumptions
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        communicationKind = try? c.decodeIfPresent(String.self, forKey: .communicationKind)
        viewer = try? c.decodeIfPresent(String.self, forKey: .viewer)
        destination = try? c.decodeIfPresent(String.self, forKey: .destination)
        scope = try? c.decodeIfPresent(String.self, forKey: .scope)
        takeaway = try? c.decodeIfPresent(String.self, forKey: .takeaway)
        durationSeconds = try? c.decodeIfPresent(Double.self, forKey: .durationSeconds)
        aspect = try? c.decodeIfPresent(String.self, forKey: .aspect)
        mustShow = (try? c.decodeIfPresent([String].self, forKey: .mustShow)) ?? []
        evidenceRefs = (try? c.decodeIfPresent([String].self, forKey: .evidenceRefs)) ?? []
        assumptions = (try? c.decodeIfPresent([String].self, forKey: .assumptions)) ?? []
    }
}

public struct TreatmentBeat: Codable, Equatable, Sendable {
    public var beatId: String?
    public var line: String?
    public var buys: String?
    // Plan 03 (format-aware story): additive, lenient. `id` is the stable beat id; internalBeatLabel never reaches rendered text.
    public var id: String?
    public var internalBeatLabel: String?
    public var viewerTakeaway: String?
    public var onScreen: String?
    public var voiceover: String?
    public var evidenceRefs: [String]
    enum CodingKeys: String, CodingKey {
        case beatId = "beat_id", line, buys, id
        case internalBeatLabel = "internal_beat_label", viewerTakeaway = "viewer_takeaway", onScreen = "on_screen", voiceover, evidenceRefs = "evidence_refs"
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        beatId = try? c.decodeIfPresent(String.self, forKey: .beatId)
        line = try? c.decodeIfPresent(String.self, forKey: .line)
        buys = try? c.decodeIfPresent(String.self, forKey: .buys)
        id = try? c.decodeIfPresent(String.self, forKey: .id)
        internalBeatLabel = try? c.decodeIfPresent(String.self, forKey: .internalBeatLabel)
        viewerTakeaway = try? c.decodeIfPresent(String.self, forKey: .viewerTakeaway)
        onScreen = try? c.decodeIfPresent(String.self, forKey: .onScreen)
        voiceover = try? c.decodeIfPresent(String.self, forKey: .voiceover)
        evidenceRefs = (try? c.decodeIfPresent([String].self, forKey: .evidenceRefs)) ?? []
    }
}

public struct StoryTreatment: Codable, Equatable, Sendable {
    public var schemaVersion: Int?
    public var proposition: String?
    public var device: String?
    public var beats: [TreatmentBeat]
    public var claimRefs: [String]
    // Plan 03 (format-aware story): the card title is the premise-based treatment_title; Sure/Bold/Wild is only a secondary tag.
    public var storyFormat: String?
    public var treatmentTitle: String?
    public var premise: String?
    public var communicationKind: String?
    public var viewerTakeaway: String?
    public var tag: String?
    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", proposition, device, beats, claimRefs = "claim_refs"
        case storyFormat = "story_format", treatmentTitle = "treatment_title", premise, communicationKind = "communication_kind", viewerTakeaway = "viewer_takeaway", tag
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        storyFormat = try? c.decodeIfPresent(String.self, forKey: .storyFormat)
        treatmentTitle = try? c.decodeIfPresent(String.self, forKey: .treatmentTitle)
        premise = try? c.decodeIfPresent(String.self, forKey: .premise)
        communicationKind = try? c.decodeIfPresent(String.self, forKey: .communicationKind)
        viewerTakeaway = try? c.decodeIfPresent(String.self, forKey: .viewerTakeaway)
        tag = try? c.decodeIfPresent(String.self, forKey: .tag)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        proposition = try? c.decodeIfPresent(String.self, forKey: .proposition)
        device = try? c.decodeIfPresent(String.self, forKey: .device)
        beats = (try? c.decodeIfPresent([TreatmentBeat].self, forKey: .beats)) ?? []
        claimRefs = (try? c.decodeIfPresent([String].self, forKey: .claimRefs)) ?? []
    }
}

public struct LookContract: Codable, Equatable, Sendable {
    public var schemaVersion: Int?
    public var designRef: String?
    public var motionRef: String?
    public var mode: String?
    public var palette: [String]
    public var typefaces: [String]
    public var constraints: [String]
    // Plan 04: the compact visual bible projection (look/visual-bible.json) and the digest of what it was compiled from.
    public var visualBibleRef: String?
    public var sourceDigest: String?
    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", designRef = "design_ref", motionRef = "motion_ref", mode, palette, typefaces, constraints
        case visualBibleRef = "visual_bible_ref", sourceDigest = "source_digest"
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        designRef = try? c.decodeIfPresent(String.self, forKey: .designRef)
        motionRef = try? c.decodeIfPresent(String.self, forKey: .motionRef)
        mode = try? c.decodeIfPresent(String.self, forKey: .mode)
        palette = (try? c.decodeIfPresent([String].self, forKey: .palette)) ?? []
        typefaces = (try? c.decodeIfPresent([String].self, forKey: .typefaces)) ?? []
        constraints = (try? c.decodeIfPresent([String].self, forKey: .constraints)) ?? []
        visualBibleRef = try? c.decodeIfPresent(String.self, forKey: .visualBibleRef)
        sourceDigest = try? c.decodeIfPresent(String.self, forKey: .sourceDigest)
    }
}

/// Plan 04 L6: the short card a look shows on the Look screen (`styles[].card` of the look payload). Lenient: every field optional.
public struct LookCard: Codable, Equatable, Sendable {
    public struct Difference: Codable, Equatable, Sendable {
        public var axis: String?
        public var label: String?
        public var text: String?
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            axis = try? c.decodeIfPresent(String.self, forKey: .axis)
            label = try? c.decodeIfPresent(String.self, forKey: .label)
            text = try? c.decodeIfPresent(String.self, forKey: .text)
        }
        enum CodingKeys: String, CodingKey { case axis, label, text }
    }
    public var id: String?
    public var title: String?
    public var summary: String?
    public var differences: [Difference]
    public var fixed: [String]
    enum CodingKeys: String, CodingKey { case id, title, summary, differences, fixed }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decodeIfPresent(String.self, forKey: .id)
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        summary = try? c.decodeIfPresent(String.self, forKey: .summary)
        differences = (try? c.decodeIfPresent([Difference].self, forKey: .differences)) ?? []
        fixed = (try? c.decodeIfPresent([String].self, forKey: .fixed)) ?? []
    }
}

// Plan 05 (E2): lenient shot and panel records. Every field is optional and unknown keys are ignored, so an older storyboard (panel_id/image_ref/duration_seconds
// only) and the new records (id, state, status, timing, transition_out, ...) both decode. No view reads the new fields yet.
public struct StoryboardPanel: Codable, Equatable, Sendable {
    public var panelId: String?
    public var imageRef: String?
    public var state: String?
    public var status: String?
    enum CodingKeys: String, CodingKey { case panelId = "panel_id", id, imageRef = "image_ref", state, status }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        panelId = (try? c.decodeIfPresent(String.self, forKey: .panelId)) ?? (try? c.decodeIfPresent(String.self, forKey: .id))
        imageRef = try? c.decodeIfPresent(String.self, forKey: .imageRef)
        state = try? c.decodeIfPresent(String.self, forKey: .state)
        status = try? c.decodeIfPresent(String.self, forKey: .status)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(panelId, forKey: .panelId)
        try c.encodeIfPresent(imageRef, forKey: .imageRef)
        try c.encodeIfPresent(state, forKey: .state)
        try c.encodeIfPresent(status, forKey: .status)
    }
}

public struct StoryboardTiming: Codable, Equatable, Sendable {
    public var status: String?
    public var durationSeconds: Double?
    public var startSeconds: Double?
    public var endSeconds: Double?
    public var scoreRevision: String?
    enum CodingKeys: String, CodingKey { case status, durationSeconds = "duration_s", startSeconds = "start_s", endSeconds = "end_s", scoreRevision = "score_revision" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        status = try? c.decodeIfPresent(String.self, forKey: .status)
        durationSeconds = try? c.decodeIfPresent(Double.self, forKey: .durationSeconds)
        startSeconds = try? c.decodeIfPresent(Double.self, forKey: .startSeconds)
        endSeconds = try? c.decodeIfPresent(Double.self, forKey: .endSeconds)
        scoreRevision = try? c.decodeIfPresent(String.self, forKey: .scoreRevision)
    }
}

public struct StoryboardTransition: Codable, Equatable, Sendable {
    public var relation: String?
    public var kind: String?
    public var carrier: String?
    enum CodingKeys: String, CodingKey { case relation, kind, carrier }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        relation = try? c.decodeIfPresent(String.self, forKey: .relation)
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
        carrier = try? c.decodeIfPresent(String.self, forKey: .carrier)
    }
}

public struct StoryboardShot: Codable, Equatable, Sendable {
    public var shotId: String?
    public var beatId: String?
    public var durationSeconds: Double?
    public var purpose: String?
    public var focalRead: String?
    public var copyRefs: [String]
    public var timing: StoryboardTiming?
    public var transitionOut: StoryboardTransition?
    public var panels: [StoryboardPanel]
    enum CodingKeys: String, CodingKey { case shotId = "shot_id", beatId = "beat_id", durationSeconds = "duration_seconds", purpose, focalRead = "focal_read", copyRefs = "copy_refs", timing, transitionOut = "transition_out", panels }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        shotId = try? c.decodeIfPresent(String.self, forKey: .shotId)
        beatId = try? c.decodeIfPresent(String.self, forKey: .beatId)
        timing = try? c.decodeIfPresent(StoryboardTiming.self, forKey: .timing)
        durationSeconds = (try? c.decodeIfPresent(Double.self, forKey: .durationSeconds)) ?? timing?.durationSeconds
        purpose = try? c.decodeIfPresent(String.self, forKey: .purpose)
        focalRead = try? c.decodeIfPresent(String.self, forKey: .focalRead)
        copyRefs = (try? c.decodeIfPresent([String].self, forKey: .copyRefs)) ?? []
        transitionOut = try? c.decodeIfPresent(StoryboardTransition.self, forKey: .transitionOut)
        panels = (try? c.decodeIfPresent([StoryboardPanel].self, forKey: .panels)) ?? []
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(shotId, forKey: .shotId)
        try c.encodeIfPresent(beatId, forKey: .beatId)
        try c.encodeIfPresent(durationSeconds, forKey: .durationSeconds)
        try c.encodeIfPresent(purpose, forKey: .purpose)
        try c.encodeIfPresent(focalRead, forKey: .focalRead)
        try c.encode(copyRefs, forKey: .copyRefs)
        try c.encodeIfPresent(timing, forKey: .timing)
        try c.encodeIfPresent(transitionOut, forKey: .transitionOut)
        try c.encode(panels, forKey: .panels)
    }
}

public struct Storyboard: Codable, Equatable, Sendable {
    public var schemaVersion: Int?
    public var kind: String?            // "full" | "sketch"
    public var revision: Int?
    public var status: String?          // "current" | "old"
    public var timingRevision: String?
    public var shots: [StoryboardShot]
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", kind, revision, status, timingRevision = "timing_revision", shots }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
        revision = try? c.decodeIfPresent(Int.self, forKey: .revision)
        status = try? c.decodeIfPresent(String.self, forKey: .status)
        timingRevision = try? c.decodeIfPresent(String.self, forKey: .timingRevision)
        shots = (try? c.decodeIfPresent([StoryboardShot].self, forKey: .shots)) ?? []
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(schemaVersion, forKey: .schemaVersion)
        try c.encodeIfPresent(kind, forKey: .kind)
        try c.encodeIfPresent(revision, forKey: .revision)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(timingRevision, forKey: .timingRevision)
        try c.encode(shots, forKey: .shots)
    }
}

// Plan 07 (A2, A6): lenient sound records. A cue references a stable event id; its film time is DERIVED (motion/cues.json), with picture onset, intended offset, file onset and
// measured acoustic peak as separate fields. SoundControls is the payload the Storyboard/Final sound row reads (audition, mute/solo, permitted swaps); there is no per-cue approval.
// Every field is optional and unknown keys are ignored. No view reads these yet.
public struct AudioCueTiming: Codable, Equatable, Sendable {
    public var pictureOnsetSeconds: Double?
    public var speechWordSeconds: Double?
    public var intendedOffsetSeconds: Double?
    public var sfxOnsetSeconds: Double?
    public var acousticPeakSeconds: Double?
    public var measuredOffsetSeconds: Double?
    enum CodingKeys: String, CodingKey {
        case pictureOnsetSeconds = "picture_onset_s", speechWordSeconds = "speech_word_s", intendedOffsetSeconds = "intended_offset_s"
        case sfxOnsetSeconds = "sfx_onset_s", acousticPeakSeconds = "acoustic_peak_s", measuredOffsetSeconds = "measured_offset_s"
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pictureOnsetSeconds = try? c.decodeIfPresent(Double.self, forKey: .pictureOnsetSeconds)
        speechWordSeconds = try? c.decodeIfPresent(Double.self, forKey: .speechWordSeconds)
        intendedOffsetSeconds = try? c.decodeIfPresent(Double.self, forKey: .intendedOffsetSeconds)
        sfxOnsetSeconds = try? c.decodeIfPresent(Double.self, forKey: .sfxOnsetSeconds)
        acousticPeakSeconds = try? c.decodeIfPresent(Double.self, forKey: .acousticPeakSeconds)
        measuredOffsetSeconds = try? c.decodeIfPresent(Double.self, forKey: .measuredOffsetSeconds)
    }
}

public struct AudioCue: Codable, Equatable, Sendable {
    public var id: String?
    public var eventId: String?
    public var role: String?
    public var intent: String?          // "on_picture" | "anticipate" | "trail" | "synchronous"
    public var synchronous: Bool?
    public var timing: AudioCueTiming?
    enum CodingKeys: String, CodingKey { case id, eventId = "event_id", role, intent, synchronous, timing }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decodeIfPresent(String.self, forKey: .id)
        eventId = try? c.decodeIfPresent(String.self, forKey: .eventId)
        role = try? c.decodeIfPresent(String.self, forKey: .role)
        intent = try? c.decodeIfPresent(String.self, forKey: .intent)
        synchronous = try? c.decodeIfPresent(Bool.self, forKey: .synchronous)
        timing = try? c.decodeIfPresent(AudioCueTiming.self, forKey: .timing)
    }
}

public struct SoundAuditionItem: Codable, Equatable, Sendable {
    public var id: String?
    public var kind: String?            // "music" | "voice" | "sfx"
    public var label: String?
    public var file: String?
    public var startSeconds: Double?
    enum CodingKeys: String, CodingKey { case id, kind, label, file, startSeconds = "start_s" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decodeIfPresent(String.self, forKey: .id)
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
        label = try? c.decodeIfPresent(String.self, forKey: .label)
        file = try? c.decodeIfPresent(String.self, forKey: .file)
        startSeconds = try? c.decodeIfPresent(Double.self, forKey: .startSeconds)
    }
}

public struct SoundControls: Codable, Equatable, Sendable {
    public var schemaVersion: Int?
    public var audioKind: String?       // "selected" | "scratch" | "none"
    public var silent: String?          // "silent_by_choice" for a recorded silent film
    public var audition: [SoundAuditionItem]
    public var approveEveryCue: Bool?   // always false: sound never adds an approval step
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", audioKind = "audio_kind", silent, audition, approveEveryCue = "approve_every_cue" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        audioKind = try? c.decodeIfPresent(String.self, forKey: .audioKind)
        silent = try? c.decodeIfPresent(String.self, forKey: .silent)
        audition = (try? c.decodeIfPresent([SoundAuditionItem].self, forKey: .audition)) ?? []
        approveEveryCue = try? c.decodeIfPresent(Bool.self, forKey: .approveEveryCue)
    }
}

public struct WorkerPacket: Codable, Equatable, Sendable {
    public var schemaVersion: Int?
    public var role: String?
    public var stage: LogicalStage?
    public var beatIds: [String]
    public var inputs: [StageDependency]
    public var inputRefs: [String]
    public var outputRefs: [String]
    public var budgetTokens: Int?
    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", role, stage, beatIds = "beat_ids", inputs, inputRefs = "input_refs", outputRefs = "output_refs", budgetTokens = "budget_tokens"
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        role = try? c.decodeIfPresent(String.self, forKey: .role)
        stage = try? c.decodeIfPresent(LogicalStage.self, forKey: .stage)
        beatIds = (try? c.decodeIfPresent([String].self, forKey: .beatIds)) ?? []
        inputs = (try? c.decodeIfPresent([StageDependency].self, forKey: .inputs)) ?? []
        inputRefs = (try? c.decodeIfPresent([String].self, forKey: .inputRefs)) ?? []
        outputRefs = (try? c.decodeIfPresent([String].self, forKey: .outputRefs)) ?? []
        budgetTokens = try? c.decodeIfPresent(Int.self, forKey: .budgetTokens)
    }
}

/// Plan 10 U3: where a revision was pinned. `render_revision_id` names the render on screen when the person gave feedback.
public struct RevisionPins: Codable, Equatable, Sendable {
    public var film: String?
    public var approvalRevision: Int?
    public var buildRevision: Int?
    public var renderRevisionID: String?
    public var sourceDigest: String?
    enum CodingKeys: String, CodingKey { case film, approvalRevision = "approval_revision", buildRevision = "build_revision", renderRevisionID = "render_revision_id", sourceDigest = "source_digest" }
    public init(film: String? = nil, approvalRevision: Int? = nil, buildRevision: Int? = nil, renderRevisionID: String? = nil, sourceDigest: String? = nil) {
        self.film = film; self.approvalRevision = approvalRevision; self.buildRevision = buildRevision; self.renderRevisionID = renderRevisionID; self.sourceDigest = sourceDigest
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        film = try? c.decodeIfPresent(String.self, forKey: .film)
        approvalRevision = try? c.decodeIfPresent(Int.self, forKey: .approvalRevision)
        buildRevision = try? c.decodeIfPresent(Int.self, forKey: .buildRevision)
        renderRevisionID = try? c.decodeIfPresent(String.self, forKey: .renderRevisionID)
        sourceDigest = try? c.decodeIfPresent(String.self, forKey: .sourceDigest)
    }
}

/// The part of the film the note is about: a beat, a shot, a semantic element (`data-el`) and / or a time range in the displayed render.
public struct RevisionTarget: Codable, Equatable, Sendable {
    public var beatID: String?
    public var shotID: String?
    public var elementID: String?
    public var timeRange: [Double]?
    enum CodingKeys: String, CodingKey { case beatID = "beat_id", shotID = "shot_id", elementID = "element_id", timeRange = "time_range" }
    public init(beatID: String? = nil, shotID: String? = nil, elementID: String? = nil, timeRange: [Double]? = nil) { self.beatID = beatID; self.shotID = shotID; self.elementID = elementID; self.timeRange = timeRange }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        beatID = try? c.decodeIfPresent(String.self, forKey: .beatID)
        shotID = try? c.decodeIfPresent(String.self, forKey: .shotID)
        elementID = try? c.decodeIfPresent(String.self, forKey: .elementID)
        timeRange = try? c.decodeIfPresent([Double].self, forKey: .timeRange)
    }
}

/// A region the person marked on a frame, bound to the render and element index they were looking at.
public struct RevisionAnnotation: Codable, Equatable, Sendable {
    public var x: Double?, y: Double?, w: Double?, h: Double?
    public var frameRef: String?
    public var renderRevisionID: String?
    public var indexBuildDigest: String?
    public var timeSeconds: Double?
    enum CodingKeys: String, CodingKey { case regionNorm = "region_norm", frameRef = "frame_ref", renderRevisionID = "render_revision_id", indexBuildDigest = "index_build_digest", timeSeconds = "time_s" }
    private enum RegionKeys: String, CodingKey { case x, y, w, h }
    public init(x: Double? = nil, y: Double? = nil, w: Double? = nil, h: Double? = nil, frameRef: String? = nil, renderRevisionID: String? = nil, indexBuildDigest: String? = nil, timeSeconds: Double? = nil) {
        self.x = x; self.y = y; self.w = w; self.h = h; self.frameRef = frameRef; self.renderRevisionID = renderRevisionID; self.indexBuildDigest = indexBuildDigest; self.timeSeconds = timeSeconds
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let r = try? c.nestedContainer(keyedBy: RegionKeys.self, forKey: .regionNorm) {
            x = try? r.decodeIfPresent(Double.self, forKey: .x); y = try? r.decodeIfPresent(Double.self, forKey: .y)
            w = try? r.decodeIfPresent(Double.self, forKey: .w); h = try? r.decodeIfPresent(Double.self, forKey: .h)
        }
        frameRef = try? c.decodeIfPresent(String.self, forKey: .frameRef)
        renderRevisionID = try? c.decodeIfPresent(String.self, forKey: .renderRevisionID)
        indexBuildDigest = try? c.decodeIfPresent(String.self, forKey: .indexBuildDigest)
        timeSeconds = try? c.decodeIfPresent(Double.self, forKey: .timeSeconds)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let x, let y, let w, let h {
            var r = c.nestedContainer(keyedBy: RegionKeys.self, forKey: .regionNorm)
            try r.encode(x, forKey: .x); try r.encode(y, forKey: .y); try r.encode(w, forKey: .w); try r.encode(h, forKey: .h)
        }
        try c.encodeIfPresent(frameRef, forKey: .frameRef); try c.encodeIfPresent(renderRevisionID, forKey: .renderRevisionID)
        try c.encodeIfPresent(indexBuildDigest, forKey: .indexBuildDigest); try c.encodeIfPresent(timeSeconds, forKey: .timeSeconds)
    }
}

/// Where a revision stands. `preview_ready`, `stale` and `conflicted` are compatible additions to the older requested ... reverted line.
public enum RevisionStatus: String, Codable, Equatable, Sendable, CaseIterable {
    case requested, accepted, applied, previewReady = "preview_ready", rendered, failed, reverted, stale, conflicted
}

public struct RevisionRequest: Codable, Equatable, Sendable {
    public var schemaVersion: Int?
    public var idempotencyKey: String?
    public var stage: LogicalStage?
    public var targetIds: [String]
    /// The person's exact words (older records call this `note`).
    public var note: String?
    public var instruction: String?
    public var baseRevision: Int?
    // Plan 10 U3 (all optional: an older record without them still decodes)
    public var pinned: RevisionPins?
    public var target: RevisionTarget?
    public var annotation: RevisionAnnotation?
    public var intentCategory: String?
    public var route: String?
    public var interpretation: String?
    public var ambiguous: Bool?
    public var needsConfirmation: Bool?
    public var status: RevisionStatus?
    /// The stages this would make stale (lib/impact.mjs), for the preview shown before anything changes.
    public var staleStages: [LogicalStage]
    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", idempotencyKey = "idempotency_key", stage, targetIds = "target_ids", note, instruction, baseRevision = "base_revision"
        case pinned, target, annotation, intentCategory = "intent_category", route, interpretation, ambiguous, needsConfirmation = "needs_confirmation", status, impact
    }
    private enum ImpactKeys: String, CodingKey { case stale }
    public init(schemaVersion: Int? = Contracts.schemaVersion, idempotencyKey: String? = nil, stage: LogicalStage? = nil, targetIds: [String] = [], note: String? = nil, instruction: String? = nil, baseRevision: Int? = nil,
                pinned: RevisionPins? = nil, target: RevisionTarget? = nil, annotation: RevisionAnnotation? = nil, intentCategory: String? = nil, route: String? = nil, interpretation: String? = nil,
                ambiguous: Bool? = nil, needsConfirmation: Bool? = nil, status: RevisionStatus? = .requested, staleStages: [LogicalStage] = []) {
        self.schemaVersion = schemaVersion; self.idempotencyKey = idempotencyKey; self.stage = stage; self.targetIds = targetIds; self.note = note; self.instruction = instruction; self.baseRevision = baseRevision
        self.pinned = pinned; self.target = target; self.annotation = annotation; self.intentCategory = intentCategory; self.route = route; self.interpretation = interpretation
        self.ambiguous = ambiguous; self.needsConfirmation = needsConfirmation; self.status = status; self.staleStages = staleStages
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        idempotencyKey = try? c.decodeIfPresent(String.self, forKey: .idempotencyKey)
        stage = try? c.decodeIfPresent(LogicalStage.self, forKey: .stage)
        targetIds = (try? c.decodeIfPresent([String].self, forKey: .targetIds)) ?? []
        note = try? c.decodeIfPresent(String.self, forKey: .note)
        instruction = try? c.decodeIfPresent(String.self, forKey: .instruction)
        baseRevision = try? c.decodeIfPresent(Int.self, forKey: .baseRevision)
        pinned = try? c.decodeIfPresent(RevisionPins.self, forKey: .pinned)
        target = try? c.decodeIfPresent(RevisionTarget.self, forKey: .target)
        annotation = try? c.decodeIfPresent(RevisionAnnotation.self, forKey: .annotation)
        intentCategory = try? c.decodeIfPresent(String.self, forKey: .intentCategory)
        route = try? c.decodeIfPresent(String.self, forKey: .route)
        interpretation = try? c.decodeIfPresent(String.self, forKey: .interpretation)
        ambiguous = try? c.decodeIfPresent(Bool.self, forKey: .ambiguous)
        needsConfirmation = try? c.decodeIfPresent(Bool.self, forKey: .needsConfirmation)
        status = (try? c.decodeIfPresent(RevisionStatus.self, forKey: .status)) ?? nil
        if let i = try? c.nestedContainer(keyedBy: ImpactKeys.self, forKey: .impact) { staleStages = (try? i.decodeIfPresent([LogicalStage].self, forKey: .stale)) ?? [] } else { staleStages = [] }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(schemaVersion, forKey: .schemaVersion); try c.encodeIfPresent(idempotencyKey, forKey: .idempotencyKey); try c.encodeIfPresent(stage?.rawValue, forKey: .stage)
        try c.encode(targetIds, forKey: .targetIds); try c.encodeIfPresent(note, forKey: .note); try c.encodeIfPresent(instruction ?? note, forKey: .instruction); try c.encodeIfPresent(baseRevision, forKey: .baseRevision)
        try c.encodeIfPresent(pinned, forKey: .pinned); try c.encodeIfPresent(target, forKey: .target); try c.encodeIfPresent(annotation, forKey: .annotation)
        try c.encodeIfPresent(intentCategory, forKey: .intentCategory); try c.encodeIfPresent(route, forKey: .route); try c.encodeIfPresent(interpretation, forKey: .interpretation)
        try c.encodeIfPresent(ambiguous, forKey: .ambiguous); try c.encodeIfPresent(needsConfirmation, forKey: .needsConfirmation); try c.encodeIfPresent(status, forKey: .status)
    }

    /// The action Studio queues for this request (`type: "revision-request"`): the same payload the browser console sends. The engine classifies it again
    /// (lib/revision-intent.mjs), so a client cannot widen the scope by what it claims.
    public func actionValue() -> JSONValue {
        var anchor: [String: JSONValue] = [:]
        if let t = target {
            if let v = t.beatID { anchor["beat_id"] = .string(v) }
            if let v = t.shotID { anchor["shot_id"] = .string(v) }
            if let v = t.elementID { anchor["element_id"] = .string(v) }
            if let r = t.timeRange, r.count == 2 { anchor["time_range"] = .array(r.map { .number($0) }); anchor["t"] = .number(r[0]) }
        }
        if let a = annotation {
            if let x = a.x, let y = a.y, let w = a.w, let h = a.h { anchor["region_norm"] = .object(["x": .number(x), "y": .number(y), "w": .number(w), "h": .number(h)]) }
            if let v = a.frameRef { anchor["frame_ref"] = .string(v) }
            if let v = a.renderRevisionID { anchor["render_revision_id"] = .string(v) }
            if let v = a.indexBuildDigest { anchor["index_build_digest"] = .string(v) }
        }
        var pins: [String: JSONValue] = [:]
        if let p = pinned {
            if let v = p.film { pins["film"] = .string(v) }
            if let v = p.approvalRevision { pins["approval_revision"] = .number(Double(v)) }
            if let v = p.buildRevision { pins["build_revision"] = .number(Double(v)) }
            if let v = p.renderRevisionID { pins["render_revision_id"] = .string(v) }
            if let v = p.sourceDigest { pins["source_digest"] = .string(v) }
        }
        return .object(["anchor": .object(anchor), "pinned": .object(pins)])
    }
}

/// One capability axis: a boolean with the reason it is that way.
public struct CapabilityState: Codable, Equatable, Sendable {
    public var value: Bool
    public var reason: String?
    enum CodingKeys: String, CodingKey { case value, reason }
    public init(value: Bool = false, reason: String? = nil) { self.value = value; self.reason = reason }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        value = (try? c.decodeIfPresent(Bool.self, forKey: .value)) ?? false
        reason = try? c.decodeIfPresent(String.self, forKey: .reason)
    }
}

/// Five separate states; none implies another.
public struct Capability: Codable, Equatable, Sendable {
    public var schemaVersion: Int?
    public var id: String?
    public var implemented: CapabilityState
    public var available: CapabilityState
    public var enabled: CapabilityState
    public var permitted: CapabilityState
    public var verified: CapabilityState
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", id, implemented, available, enabled, permitted, verified }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        id = try? c.decodeIfPresent(String.self, forKey: .id)
        func state(_ k: CodingKeys) -> CapabilityState { ((try? c.decodeIfPresent(CapabilityState.self, forKey: k)) ?? nil) ?? CapabilityState() }
        implemented = state(.implemented); available = state(.available); enabled = state(.enabled)
        permitted = state(.permitted); verified = state(.verified)
    }
}
