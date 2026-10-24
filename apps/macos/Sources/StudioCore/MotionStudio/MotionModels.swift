import Foundation

/// Models for the Motion Studio file contracts A-D (docs/plans/motion-studio-contracts.md).
/// Every non-core field is optional, unknown keys are ignored, and keys are snake_case on disk.

public enum MotionStudioError: LocalizedError, Equatable {
    case unreadable(String)
    case missingSchemaVersion(String)
    case unsupportedSchema(file: String, found: Int, supported: Int)
    case malformed(file: String, reason: String)
    case pathEscapes(String)

    public var errorDescription: String? {
        switch self {
        case .unreadable(let file): "Could not read \(file)."
        case .missingSchemaVersion(let file): "\(file) has no schema_version, so Studio cannot tell how to read it."
        case .unsupportedSchema(let file, let found, let supported):
            "\(file) uses schema version \(found); this Studio reads version \(supported). Update RasanAI Studio or regenerate the file."
        case .malformed(let file, let reason): "\(file) could not be read: \(reason)"
        case .pathEscapes(let path): "“\(path)” points outside the project folder."
        }
    }
}

public enum MotionSchema {
    public static let supportedVersion = 1

    private struct Probe: Decodable { let schema_version: Int? }

    /// Decodes `type` after checking `schema_version`. Unknown keys are ignored.
    public static func decode<T: Decodable>(_ type: T.Type, from data: Data, file: String) throws -> T {
        let probe: Probe
        do { probe = try JSONDecoder().decode(Probe.self, from: data) }
        catch { throw MotionStudioError.malformed(file: file, reason: "not a JSON object with a numeric schema_version") }
        guard let found = probe.schema_version else { throw MotionStudioError.missingSchemaVersion(file) }
        guard found == supportedVersion else { throw MotionStudioError.unsupportedSchema(file: file, found: found, supported: supportedVersion) }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw MotionStudioError.malformed(file: file, reason: String(describing: error)) }
    }
}

// MARK: A. reference-motion.json

public struct MotionReferenceSummary: Codable, Sendable, Equatable {
    public var schemaVersion: Int
    public var referenceId: String?
    public var source: Source?
    public var analysis: Analysis?
    public var recipe: [RecipeStep]?
    public var use: Use?

    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", referenceId = "reference_id", source, analysis, recipe, use }

    public struct Source: Codable, Sendable, Equatable {
        public var kind: String?      // linked-file | url-notes | manual-notes
        public var sha256: String?
        public var rights: String?    // inspiration-only | owned | licensed
        public var basename: String?
    }

    public struct Shot: Codable, Sendable, Equatable {
        public var startS: Double?
        public var endS: Double?
        public var framing: String?
        public var motionRole: String?
        public var observations: [String]?
        public var confidence: String?   // high | medium | low
        enum CodingKeys: String, CodingKey { case startS = "start_s", endS = "end_s", framing, motionRole = "motion_role", observations, confidence }
    }

    public struct Analysis: Codable, Sendable, Equatable {
        public var durationS: Double?
        public var fpsObserved: Double?
        public var aspect: String?
        public var width: Int?
        public var height: Int?
        public var hasAudio: Bool?
        public var cutsS: [Double]?
        public var shots: [Shot]?
        public var paletteObserved: [String]?
        public var typeTreatment: [String]?
        public var motionPatterns: [String]?
        public var soundHitsS: [Double]?
        public var energyArc: [Double]?
        public var uncertainties: [String]?
        enum CodingKeys: String, CodingKey {
            case durationS = "duration_s", fpsObserved = "fps_observed", aspect, width, height, hasAudio = "has_audio", cutsS = "cuts_s", shots
            case paletteObserved = "palette_observed", typeTreatment = "type_treatment", motionPatterns = "motion_patterns"
            case soundHitsS = "sound_hits_s", energyArc = "energy_arc", uncertainties
        }
    }

    public struct RecipeStep: Codable, Sendable, Equatable {
        public var observation: String?
        public var viewerEffect: String?
        public var transferableMechanic: String?
        public var candidateMove: String?
        public var notTransferable: [String]?
        enum CodingKeys: String, CodingKey {
            case observation, viewerEffect = "viewer_effect", transferableMechanic = "transferable_mechanic", candidateMove = "candidate_move", notTransferable = "not_transferable"
        }
    }

    public struct Use: Codable, Sendable, Equatable {
        public var transfer: String?
        public var neverReuse: [String]?
        enum CodingKeys: String, CodingKey { case transfer, neverReuse = "never_reuse" }
    }

    public static func decode(_ data: Data, file: String = "reference-motion.json") throws -> MotionReferenceSummary {
        try MotionSchema.decode(MotionReferenceSummary.self, from: data, file: file)
    }
}

// MARK: B. motion-kit/catalog.json

public struct MotionKitCatalog: Codable, Sendable, Equatable {
    public var schemaVersion: Int
    public var items: [MotionKitItem]?
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", items }

    public var allItems: [MotionKitItem] { items ?? [] }
    public func items(inFamily family: String) -> [MotionKitItem] { allItems.filter { $0.family == family } }
    public var families: [String] { Array(Set(allItems.compactMap(\.family))).sorted() }
    public func item(id: String) -> MotionKitItem? { allItems.first { $0.id == id } }

    public static func decode(_ data: Data, file: String = "motion-kit/catalog.json") throws -> MotionKitCatalog {
        try MotionSchema.decode(MotionKitCatalog.self, from: data, file: file)
    }
}

public struct MotionKitParam: Codable, Sendable, Equatable {
    public var type: String?          // number | string | enum | boolean
    public var min: Double?
    public var max: Double?
    public var `default`: JSONValue?
    public var `enum`: [String]?
}

public struct MotionKitItem: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var version: Int?
    public var label: String?
    public var family: String?
    public var role: String?
    public var summary: String?
    public var useWhen: String?
    public var avoidWhen: String?
    public var supports: [String]?
    public var brandInputs: [String]?
    public var motionInputs: [String]?
    public var params: [String: MotionKitParam]?
    public var requiresAssets: [String]?
    public var seekSafe: Bool?
    public var reducedMotion: String?
    public var implementation: String?
    public var origin: String?
    public var license: String?
    public var credit: String?
    public var fixture: String?

    enum CodingKeys: String, CodingKey {
        case id, version, label, family, role, summary, useWhen = "use_when", avoidWhen = "avoid_when", supports
        case brandInputs = "brand_inputs", motionInputs = "motion_inputs", params, requiresAssets = "requires_assets"
        case seekSafe = "seek_safe", reducedMotion = "reduced_motion", implementation, origin, license, credit, fixture
    }

    /// The value for `data-motion-kit`, e.g. `motion-kit:kinetic-type-rise-v1@1`.
    public var annotation: String { "motion-kit:\(id)@\(version ?? 1)" }
    public var displayLabel: String { label ?? id }
}

// MARK: C. motion/element-index.json

public struct MotionBoundsSample: Codable, Sendable, Equatable {
    public var tS: Double
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double
    enum CodingKeys: String, CodingKey { case tS = "t_s", x, y, w, h }
}

public struct MotionFrameSize: Codable, Sendable, Equatable {
    public var w: Double
    public var h: Double
    public init(w: Double, h: Double) { self.w = w; self.h = h }
}

/// A rectangle in film-normalised coordinates (0...1 of the frame).
public struct MotionNormRect: Codable, Sendable, Equatable {
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double
    public init(x: Double, y: Double, w: Double, h: Double) { self.x = x; self.y = y; self.w = w; self.h = h }
    public func contains(_ p: CGPoint) -> Bool { Double(p.x) >= x && Double(p.x) <= x + w && Double(p.y) >= y && Double(p.y) <= y + h }
    public var area: Double { w * h }
}

public struct MotionElementItem: Codable, Sendable, Equatable, Identifiable {
    public var elementId: String
    public var sceneId: String?
    public var kind: String?          // text | image | shape | ui | 3d | video
    public var label: String?
    public var sourceFile: String?
    public var sourceKey: String?
    public var z: Double?
    public var activeS: [Double]?
    public var editable: [String]?
    public var boundsSamples: [MotionBoundsSample]?
    public var capability: String?    // dom | projected-3d | raster

    public var id: String { elementId }

    enum CodingKeys: String, CodingKey {
        case elementId = "element_id", sceneId = "scene_id", kind, label, sourceFile = "source_file", sourceKey = "source_key", z
        case activeS = "active_s", editable, boundsSamples = "bounds_samples", capability
    }

    public var displayLabel: String { label ?? elementId }
    public func canEdit(_ field: String) -> Bool { editable?.contains(field) ?? false }

    public func isActive(at time: Double) -> Bool {
        guard let a = activeS, a.count >= 2 else { return true }
        return time >= a[0] && time <= a[1]
    }

    /// Pixel bounds at `time`: linear between samples, clamped to the first/last sample outside them.
    public func pixelBounds(at time: Double) -> MotionBoundsSample? {
        guard let samples = boundsSamples?.sorted(by: { $0.tS < $1.tS }), let first = samples.first, let last = samples.last else { return nil }
        if time <= first.tS { return first }
        if time >= last.tS { return last }
        for i in 1..<samples.count where time <= samples[i].tS {
            let a = samples[i - 1], b = samples[i]
            let span = b.tS - a.tS
            let f = span > 0 ? (time - a.tS) / span : 0
            return MotionBoundsSample(tS: time, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f, h: a.h + (b.h - a.h) * f)
        }
        return last
    }
}

public struct MotionElementIndex: Codable, Sendable, Equatable {
    public var schemaVersion: Int
    public var buildDigest: String?
    public var filmVersion: Int?
    public var frameSize: MotionFrameSize?
    public var items: [MotionElementItem]?
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", buildDigest = "build_digest", filmVersion = "film_version", frameSize = "frame_size", items }

    public var allItems: [MotionElementItem] { items ?? [] }
    public func item(id: String) -> MotionElementItem? { allItems.first { $0.elementId == id } }

    /// Bounds at `time` as fractions of the frame; nil without samples or a frame size.
    public func normalisedBounds(of item: MotionElementItem, at time: Double) -> MotionNormRect? {
        guard let size = frameSize, size.w > 0, size.h > 0, let b = item.pixelBounds(at: time) else { return nil }
        return MotionNormRect(x: b.x / size.w, y: b.y / size.h, w: b.w / size.w, h: b.h / size.h)
    }

    /// True when the index was built from different scene sources than `currentDigest`.
    public func isStale(currentDigest: String?) -> Bool {
        guard let currentDigest, !currentDigest.isEmpty else { return false }
        return buildDigest != currentDigest
    }

    public static func decode(_ data: Data, file: String = "motion/element-index.json") throws -> MotionElementIndex {
        try MotionSchema.decode(MotionElementIndex.self, from: data, file: file)
    }
}

/// One element found under a point.
public struct MotionElementHit: Sendable, Equatable, Identifiable {
    public var item: MotionElementItem
    public var boundsNorm: MotionNormRect
    public var id: String { item.elementId }
}

// MARK: D. motion/edits.jsonl

public enum MotionEditOperation: String, Codable, Sendable, Equatable {
    case modify, retime, reorder, replace, remove
}

public enum MotionEditState: String, Codable, Sendable, Equatable {
    case requested, accepted, applied, rendered, failed, reverted, unknown
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = MotionEditState(rawValue: raw) ?? .unknown
    }
    public var isTerminal: Bool { self == .rendered || self == .failed || self == .reverted }
}

public struct MotionPatchSummary: Codable, Sendable, Equatable {
    public var files: [String]?
    public var digest: String?
}

public struct MotionEditRequest: Codable, Sendable, Equatable, Identifiable {
    public var schemaVersion: Int
    public var id: String
    public var filmVersion: Int?
    public var timeS: Double?
    public var sceneId: String?
    public var elementId: String?
    public var regionNorm: MotionNormRect?
    public var operation: MotionEditOperation
    public var fields: [String: JSONValue]?
    public var instruction: String?
    public var source: String?
    public var status: MotionEditState?
    public var statusAt: String?

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", id, filmVersion = "film_version", timeS = "time_s", sceneId = "scene_id", elementId = "element_id"
        case regionNorm = "region_norm", operation, fields, instruction, source, status, statusAt = "status_at"
    }

    public init(id: String, operation: MotionEditOperation, filmVersion: Int? = nil, timeS: Double? = nil, sceneId: String? = nil,
                elementId: String? = nil, regionNorm: MotionNormRect? = nil, fields: [String: JSONValue]? = nil,
                instruction: String? = nil, source: String = "studio-final", status: MotionEditState = .requested, statusAt: String? = nil) {
        self.schemaVersion = MotionSchema.supportedVersion
        self.id = id; self.operation = operation; self.filmVersion = filmVersion; self.timeS = timeS; self.sceneId = sceneId
        self.elementId = elementId; self.regionNorm = regionNorm; self.fields = fields; self.instruction = instruction
        self.source = source; self.status = status; self.statusAt = statusAt
    }

    /// `edit-001`, `edit-002`...: the next id after the ones already in use.
    public static func nextID(after existing: [String]) -> String {
        let highest = existing.compactMap { $0.hasPrefix("edit-") ? Int($0.dropFirst(5)) : nil }.max() ?? 0
        return String(format: "edit-%03d", highest + 1)
    }
}

/// One line of edits.jsonl written by the director or CLI (a status line carries the id, the status and a note).
public struct MotionEditStatusLine: Codable, Sendable, Equatable, Identifiable {
    public var schemaVersion: Int?
    public var id: String
    public var filmVersion: Int?
    public var timeS: Double?
    public var sceneId: String?
    public var elementId: String?
    public var regionNorm: MotionNormRect?
    public var operation: MotionEditOperation?
    public var fields: [String: JSONValue]?
    public var instruction: String?
    public var source: String?
    public var status: MotionEditState?
    public var statusAt: String?
    public var note: String?
    public var patch: MotionPatchSummary?

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", id, filmVersion = "film_version", timeS = "time_s", sceneId = "scene_id", elementId = "element_id"
        case regionNorm = "region_norm", operation, fields, instruction, source, status, statusAt = "status_at", note, patch
    }
}

/// The current state of every edit: the latest line per id wins.
public struct MotionEditStatus: Sendable, Equatable {
    public var lines: [MotionEditStatusLine]      // one per id, in first-seen order
    public var skippedLines: Int                  // lines that were not valid JSON or had a newer schema
    public init(lines: [MotionEditStatusLine] = [], skippedLines: Int = 0) { self.lines = lines; self.skippedLines = skippedLines }

    public func line(id: String) -> MotionEditStatusLine? { lines.first { $0.id == id } }
    public func state(of id: String) -> MotionEditState? { line(id: id)?.status }
    public var pending: [MotionEditStatusLine] { lines.filter { !($0.status?.isTerminal ?? false) } }

    /// Parses an edits.jsonl text. A half-written or invalid line is skipped, never an error.
    public static func parse(_ text: String) -> MotionEditStatus {
        var order: [String] = [], latest: [String: MotionEditStatusLine] = [:], skipped = 0
        let decoder = JSONDecoder()
        for raw in text.split(separator: "\n", omittingEmptySubsequences: true) {
            guard let line = try? decoder.decode(MotionEditStatusLine.self, from: Data(raw.utf8)),
                  (line.schemaVersion ?? MotionSchema.supportedVersion) <= MotionSchema.supportedVersion else { skipped += 1; continue }
            guard var merged = latest[line.id] else { order.append(line.id); latest[line.id] = line; continue }
            // A status line may carry only id/status/note: keep earlier request fields it leaves out.
            merged.schemaVersion = line.schemaVersion ?? merged.schemaVersion
            merged.filmVersion = line.filmVersion ?? merged.filmVersion; merged.timeS = line.timeS ?? merged.timeS
            merged.sceneId = line.sceneId ?? merged.sceneId; merged.elementId = line.elementId ?? merged.elementId
            merged.regionNorm = line.regionNorm ?? merged.regionNorm; merged.operation = line.operation ?? merged.operation
            merged.fields = line.fields ?? merged.fields; merged.instruction = line.instruction ?? merged.instruction
            merged.source = line.source ?? merged.source; merged.status = line.status ?? merged.status
            merged.statusAt = line.statusAt ?? merged.statusAt; merged.note = line.note ?? merged.note; merged.patch = line.patch ?? merged.patch
            latest[line.id] = merged
        }
        return MotionEditStatus(lines: order.compactMap { latest[$0] }, skippedLines: skipped)
    }
}
