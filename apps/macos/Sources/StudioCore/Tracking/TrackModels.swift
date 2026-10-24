import Foundation
import CryptoKit

// Contract C5: <film>/hybrid/tracks/<track-id>.json (docs/plans/hybrid-film-contracts.md).
// Level 0 (manual keyframes) lives here too: it needs no model, no Vision, no network.

public enum TrackType: String, Codable, Sendable { case bbox, planarQuad = "planar-quad", mask }
public enum TrackOrigin: String, Codable, Sendable { case manual, vision, sam, interpolated, corrected }
public enum TrackStatus: String, Codable, Sendable { case tracked, needsCorrection = "needs-correction", manual, failed }

public struct TrackFrame: Codable, Equatable, Sendable {
    public var t_s: Double
    public var quad_norm: [[Double]]      // TL,TR,BR,BL as [x,y]
    public var bbox_norm: [Double]        // [x,y,w,h]
    public var confidence: Double         // 0...1
    public var origin: TrackOrigin
    public var reproj_err_px: Double?     // additive: forward-backward reprojection error of the Vision step, nil when not measured

    public init(t_s: Double, quad: TrackQuad, confidence: Double, origin: TrackOrigin, reprojErrPx: Double? = nil) {
        self.t_s = t_s
        self.quad_norm = quad.map { [$0.x, $0.y] }
        self.bbox_norm = QuadMath.bbox(quad)
        self.confidence = confidence
        self.origin = origin
        self.reproj_err_px = reprojErrPx
    }
    public var quad: TrackQuad { quad_norm.map { TrackPoint($0[0], $0[1]) } }
}

public struct TrackCorrection: Codable, Equatable, Sendable {
    public var t_s: Double
    public var quad_norm: [[Double]]
    public var note: String?
    public init(t_s: Double, quad: TrackQuad, note: String? = nil) { self.t_s = t_s; self.quad_norm = quad.map { [$0.x, $0.y] }; self.note = note }
}

public struct TrackFile: Codable, Equatable, Sendable {
    public var schema_version: Int = 1
    public var id: String
    public var asset_id: String
    public var track_type: TrackType
    public var source_digest: String
    public var timebase: String = "source_pts_seconds"
    public var frames: [TrackFrame]
    public var corrections: [TrackCorrection]
    public var status: TrackStatus
    public var level: Int?                // additive: 0 manual, 1 Vision
    public var warnings: [String]?        // additive

    public init(id: String, assetId: String, type: TrackType = .planarQuad, sourceDigest: String, frames: [TrackFrame],
                corrections: [TrackCorrection] = [], status: TrackStatus, level: Int? = nil, warnings: [String]? = nil) {
        self.id = id; self.asset_id = assetId; self.track_type = type; self.source_digest = sourceDigest
        self.frames = frames; self.corrections = corrections; self.status = status; self.level = level; self.warnings = warnings
    }

    public static func digest(ofFile url: URL) throws -> String {
        var h = SHA256()
        let f = try FileHandle(forReadingFrom: url)
        defer { try? f.close() }
        while let d = try f.read(upToCount: 1 << 20), !d.isEmpty { h.update(data: d) }
        return h.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// <film>/hybrid/tracks/<id>.json, written atomically. Rejects ids that could escape the folder.
    public func write(film: URL) throws -> URL {
        guard id.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]*$", options: .regularExpression) != nil, !id.contains("..") else {
            throw TrackError.badId(id)
        }
        let dir = film.appendingPathComponent("hybrid/tracks", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let enc = JSONEncoder(); enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        let url = dir.appendingPathComponent("\(id).json")
        try enc.encode(self).write(to: url, options: .atomic)
        return url
    }

    /// C5 validation. Errors are blocking; warnings (low confidence) are never silent.
    public func validate(assetDigest: String?, assetDuration_s: Double?) -> (errors: [String], warnings: [String]) {
        var e: [String] = [], w: [String] = []
        if schema_version != 1 { e.append("unknown schema_version \(schema_version)") }
        if let d = assetDigest, d != source_digest { e.append("source_digest is stale: re-track") }
        var last = -Double.infinity
        for f in frames {
            if f.t_s <= last { e.append("t_s not strictly increasing at \(f.t_s)") }
            last = f.t_s
            if let dur = assetDuration_s, f.t_s > dur + 1e-6 { e.append("t_s \(f.t_s) beyond asset duration") }
            if track_type == .planarQuad, !QuadMath.isConvexWound(f.quad) { e.append("quad not convex TL,TR,BR,BL at t=\(f.t_s)") }
            if f.confidence < 0.5 { w.append(String(format: "low confidence %.2f at t=%.3f", f.confidence, f.t_s)) }
        }
        return (e, w)
    }
}

public enum TrackError: Error, LocalizedError {
    case badId(String), noKeyframes, noFrames, unreadable(String)
    public var errorDescription: String? {
        switch self {
        case .badId(let s): return "Unsafe track id: \(s)"
        case .noKeyframes: return "Place the four corners on at least one frame first."
        case .noFrames: return "No frames could be read from this clip."
        case .unreadable(let s): return "Could not read \(s)."
        }
    }
}

public struct QuadKeyframe: Codable, Equatable, Sendable {
    public var t_s: Double
    public var quad: TrackQuad
    public init(t_s: Double, quad: TrackQuad) { self.t_s = t_s; self.quad = quad }
}

/// Level 0: manual quad keyframes interpolated to per-frame corners. Holds before the first and after the last keyframe.
public enum ManualTrack {
    public static func interpolate(keyframes: [QuadKeyframe], times: [Double], id: String, assetId: String, sourceDigest: String) throws -> TrackFile {
        guard !keyframes.isEmpty else { throw TrackError.noKeyframes }
        guard !times.isEmpty else { throw TrackError.noFrames }
        let kf = keyframes.sorted { $0.t_s < $1.t_s }
        let frames: [TrackFrame] = times.map { t in
            if let exact = kf.first(where: { abs($0.t_s - t) < 1e-6 }) { return TrackFrame(t_s: t, quad: exact.quad, confidence: 1, origin: .manual) }
            if t <= kf[0].t_s { return TrackFrame(t_s: t, quad: kf[0].quad, confidence: 0.6, origin: .interpolated) }
            if t >= kf[kf.count - 1].t_s { return TrackFrame(t_s: t, quad: kf[kf.count - 1].quad, confidence: 0.6, origin: .interpolated) }
            let i = kf.lastIndex(where: { $0.t_s < t })!
            let a = kf[i], b = kf[i + 1]
            return TrackFrame(t_s: t, quad: QuadMath.lerp(a.quad, b.quad, (t - a.t_s) / (b.t_s - a.t_s)), confidence: 0.9, origin: .interpolated)
        }
        return TrackFile(id: id, assetId: assetId, sourceDigest: sourceDigest, frames: frames, status: .manual, level: 0)
    }
}
