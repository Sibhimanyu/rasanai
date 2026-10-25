// Level 1 tracking for hybrid films (contract C5): Apple Vision on-device, headless, no ComfyUI, no SAM, no network.
// Run by scripts/track.mjs (which compiles it with swiftc once, or falls back to /usr/bin/swift), like vision/vision.swift.
// GENERATED: the geometry and engine below are a verbatim copy of apps/macos/Sources/StudioCore/Tracking/{TrackGeometry,VisionQuadTracker}.swift
// (this script cannot import StudioCore). Edit those and re-copy; do not fork the logic.
import Foundation
import ImageIO
// ===== BEGIN copy: TrackGeometry.swift =====

// Planar-quad geometry for hybrid-film tracking (contract C5). Pure value math, no Vision, no UI.
// Quads are TL,TR,BR,BL, display-oriented, origin top-left. "Norm" means 0..1 of the display frame.

public struct TrackPoint: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double
    public init(_ x: Double, _ y: Double) { self.x = x; self.y = y }
}

public typealias TrackQuad = [TrackPoint]

public struct Homography: Equatable, Sendable {
    /// Row-major 3x3.
    public var m: [Double]
    public init(_ m: [Double]) { precondition(m.count == 9); self.m = m }
    public static let identity = Homography([1, 0, 0, 0, 1, 0, 0, 0, 1])

    public func apply(_ p: TrackPoint) -> TrackPoint {
        let w = m[6] * p.x + m[7] * p.y + m[8]
        let d = abs(w) < 1e-12 ? 1e-12 : w
        return TrackPoint((m[0] * p.x + m[1] * p.y + m[2]) / d, (m[3] * p.x + m[4] * p.y + m[5]) / d)
    }
    public func apply(_ q: TrackQuad) -> TrackQuad { q.map(apply) }

    public func inverted() -> Homography? {
        let a = m
        let det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6])
        if abs(det) < 1e-14 { return nil }
        let i = 1 / det
        return Homography([
            (a[4] * a[8] - a[5] * a[7]) * i, (a[2] * a[7] - a[1] * a[8]) * i, (a[1] * a[5] - a[2] * a[4]) * i,
            (a[5] * a[6] - a[3] * a[8]) * i, (a[0] * a[8] - a[2] * a[6]) * i, (a[2] * a[3] - a[0] * a[5]) * i,
            (a[3] * a[7] - a[4] * a[6]) * i, (a[1] * a[6] - a[0] * a[7]) * i, (a[0] * a[4] - a[1] * a[3]) * i,
        ])
    }

    /// Homography that sends four source points to four destination points (direct linear solve, h33 = 1).
    /// With the unit square as `from` this is the screen-replacement warp onto a tracked quad.
    public static func fitting(from s: TrackQuad, to d: TrackQuad) -> Homography? {
        guard s.count == 4, d.count == 4 else { return nil }
        var a = [[Double]](repeating: [Double](repeating: 0, count: 9), count: 8)
        for k in 0..<4 {
            let (x, y, u, v) = (s[k].x, s[k].y, d[k].x, d[k].y)
            a[2 * k] = [x, y, 1, 0, 0, 0, -u * x, -u * y, u]
            a[2 * k + 1] = [0, 0, 0, x, y, 1, -v * x, -v * y, v]
        }
        for c in 0..<8 {
            var piv = c
            for r in c..<8 where abs(a[r][c]) > abs(a[piv][c]) { piv = r }
            if abs(a[piv][c]) < 1e-12 { return nil }
            a.swapAt(c, piv)
            for r in 0..<8 where r != c {
                let f = a[r][c] / a[c][c]
                if f != 0 { for k in c..<9 { a[r][k] -= f * a[c][k] } }
            }
        }
        return Homography((0..<8).map { a[$0][8] / a[$0][$0] } + [1])
    }
}

public enum QuadMath {
    public static let unitSquare: TrackQuad = [TrackPoint(0, 0), TrackPoint(1, 0), TrackPoint(1, 1), TrackPoint(0, 1)]

    /// Signed area (shoelace); positive for TL,TR,BR,BL in a top-left-origin frame.
    public static func signedArea(_ q: TrackQuad) -> Double {
        var s = 0.0
        for k in 0..<q.count { let a = q[k], b = q[(k + 1) % q.count]; s += a.x * b.y - b.x * a.y }
        return s / 2
    }
    /// Convex, non-degenerate, and wound TL,TR,BR,BL (clockwise on screen, i.e. positive area with y down).
    public static func isConvexWound(_ q: TrackQuad) -> Bool {
        guard q.count == 4, signedArea(q) > 1e-9 else { return false }
        for k in 0..<4 {
            let a = q[k], b = q[(k + 1) % 4], c = q[(k + 2) % 4]
            if (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0 { return false }
        }
        return true
    }
    /// [x, y, w, h] bounding box, normalised like the quad.
    public static func bbox(_ q: TrackQuad) -> [Double] {
        let xs = q.map(\.x), ys = q.map(\.y)
        let x0 = xs.min() ?? 0, y0 = ys.min() ?? 0
        return [x0, y0, (xs.max() ?? 0) - x0, (ys.max() ?? 0) - y0]
    }
    public static func lerp(_ a: TrackQuad, _ b: TrackQuad, _ u: Double) -> TrackQuad {
        zip(a, b).map { TrackPoint($0.x + ($1.x - $0.x) * u, $0.y + ($1.y - $0.y) * u) }
    }
    /// Mean corner distance in pixels for a frame of w x h.
    public static func meanCornerErrorPx(_ a: TrackQuad, _ b: TrackQuad, width: Double, height: Double) -> Double {
        guard a.count == b.count, !a.isEmpty else { return .infinity }
        return zip(a, b).map { hypot(($0.x - $1.x) * width, ($0.y - $1.y) * height) }.reduce(0, +) / Double(a.count)
    }
}
// ===== BEGIN copy: VisionQuadTracker.swift =====
import Vision
import CoreGraphics
import simd

// Level 1 tracker: Apple Vision, on-device, no ComfyUI, no SAM, no network.
// Per frame step (prev -> cur):
//   1. VNTrackObjectRequest follows the quad's bounding box and gives a coarse translation (and a "lost" signal).
//   2. VNHomographicImageRegistrationRequest registers a crop around the quad (prev crop vs cur crop, aligned by that translation)
//      and the resulting homography carries the four corners. Registering the crop (not the whole frame) keeps the background
//      from winning when the object moves against it.
//   3. A reverse registration maps the new quad back; the corner distance to the old quad (px) is the forward-backward
//      reprojection error. Confidence is derived from it. Nothing is invented: a failed step keeps the last quad with confidence 0.
// Bounding-box tracking alone is never claimed to be perspective-correct; the homography is what carries the corners.
// This file is copied verbatim into skills/rasanai/scripts/vision/track.swift (the headless script cannot import StudioCore).

public struct VisionTrackSample: Sendable {
    public var index: Int
    public var quad: TrackQuad
    public var confidence: Double
    public var reprojErrPx: Double?
    public var manual: Bool
}

public enum VisionQuadTracker {
    /// `frames` are display-oriented. `seed`/`keyframes` are normalised quads (index -> quad); keyframes are correction anchors:
    /// the tracker snaps to them and continues from there. The first keyframe (or `seed`) starts the track.
    nonisolated(unsafe) public static var maxRefinePx = 4
    public static func track(frames: [CGImage], keyframes: [Int: TrackQuad], progress: ((Int, Int) -> Void)? = nil) -> [VisionTrackSample] {
        guard let startIdx = keyframes.keys.min(), startIdx < frames.count else { return [] }
        var out: [VisionTrackSample] = []
        var quad = keyframes[startIdx]!
        out.append(VisionTrackSample(index: startIdx, quad: quad, confidence: 1, reprojErrPx: nil, manual: true))
        let seq = VNSequenceRequestHandler()
        var obs = makeObs(quad)
        // Absolute prediction: quad centre = anchor quad centre + (tracker box centre - anchor box centre). A skipped (low-confidence)
        // tracker frame therefore never leaves a gap that later has to be made up in one step.
        func center(_ q: TrackQuad) -> (Double, Double) { let b = QuadMath.bbox(q); return (b[0] + b[2] / 2, b[1] + b[3] / 2) }
        var anchorQ = center(quad)
        var anchorO = (Double(obs.boundingBox.midX), 1 - Double(obs.boundingBox.midY))
        func prime(_ img: CGImage) { _ = try? seq.perform([VNTrackObjectRequest(detectedObjectObservation: obs)], on: img) }
        prime(frames[startIdx])
        var i = startIdx + 1
        while i < frames.count {
            progress?(i, frames.count)
            if let k = keyframes[i] {
                quad = k; obs = makeObs(k); anchorQ = center(k); anchorO = (Double(obs.boundingBox.midX), 1 - Double(obs.boundingBox.midY))
                out.append(VisionTrackSample(index: i, quad: k, confidence: 1, reprojErrPx: nil, manual: true))
                prime(frames[i]); i += 1; continue
            }
            let prev = frames[i - 1], cur = frames[i]
            let w = Double(cur.width), h = Double(cur.height)

            // 1. bbox translation from the object tracker (normalised, bottom-left origin in Vision)
            var dx = 0.0, dy = 0.0, trackerOK = false
            var trackerObs: VNDetectedObjectObservation? = nil
            let req = VNTrackObjectRequest(detectedObjectObservation: obs)
            req.trackingLevel = .accurate
            if (try? seq.perform([req], on: cur)) != nil, let r = req.results?.first as? VNDetectedObjectObservation, r.confidence > 0.3 {
                let c = center(quad)
                dx = (anchorQ.0 + Double(r.boundingBox.midX) - anchorO.0 - c.0) * w
                dy = (anchorQ.1 + (1 - Double(r.boundingBox.midY)) - anchorO.1 - c.1) * h
                trackerOK = true
                trackerObs = r
            }

            // 2. refine the shift with translational registration of a crop (Vision's registration only reaches ~2 px per call,
            //    so it is iterated), then register the same crop pair for a homography that carries the corners.
            let px = quad.map { TrackPoint($0.x * w, $0.y * h) }
            let bb = QuadMath.bbox(quad)
            let bw = bb[2] * w, bh = bb[3] * h
            let pad = max(12, 0.35 * max(bw, bh))
            let rect0 = CGRect(x: bb[0] * w - pad, y: bb[1] * h - pad, width: bw + 2 * pad, height: bh + 2 * pad).integral
            var sx = Int(dx.rounded()), sy = Int(dy.rounded())
            let sx0 = sx, sy0 = sy
            var refC: CGImage? = nil, tgtC: CGImage? = nil, rx0 = 0, ry0 = 0, tx0 = 0, ty0 = 0
            var converged = false
            for _ in 0..<10 {
                // reference rect R in prev; target rect is R shifted by (sx, sy); both must lie inside the frame
                let bounds = CGRect(x: 0, y: 0, width: w, height: h)
                let r = rect0.intersection(bounds).intersection(bounds.offsetBy(dx: -Double(sx), dy: -Double(sy)))
                if r.isNull || r.width < 16 || r.height < 16 { break }
                rx0 = Int(r.minX); ry0 = Int(r.minY); tx0 = rx0 + sx; ty0 = ry0 + sy
                guard let rc = prev.cropping(to: CGRect(x: rx0, y: ry0, width: Int(r.width), height: Int(r.height))),
                      let tc = cur.cropping(to: CGRect(x: tx0, y: ty0, width: Int(r.width), height: Int(r.height))) else { break }
                refC = rc; tgtC = tc
                let tr = VNTranslationalImageRegistrationRequest(targetedCGImage: tc, options: [:])
                guard (try? VNImageRequestHandler(cgImage: rc, options: [:]).perform([tr])) != nil,
                      let o = tr.results?.first as? VNImageTranslationAlignmentObservation else { break }
                let tx = Double(o.alignmentTransform.tx), ty = Double(o.alignmentTransform.ty)
                if abs(tx) < 0.75 && abs(ty) < 0.75 { converged = true; break }
                // Vision reports the shift with y up: x moves by -tx, y by +ty
                sx -= Int(tx.rounded()); sy += Int(ty.rounded())
                // registration may refine the tracker prediction by a few px, never wander off (texture-poor crops can lock onto the wrong stripe)
                if abs(sx - sx0) > maxRefinePx || abs(sy - sy0) > maxRefinePx { sx = sx0; sy = sy0; break }
            }
            _ = converged
            var next: TrackQuad? = nil, err: Double? = nil, conf = 0.0
            if let refC, let tgtC, let fwd = register(ref: refC, target: tgtC) {
                let q0 = px.map { TrackPoint($0.x - Double(rx0), $0.y - Double(ry0)) }
                var fwdM = fwd
                if mode == .translation { fwdM = Homography([1, 0, 0, 0, 1, 0, 0, 0, 1]) }
                let q1c = fwdM.apply(q0)
                let q1 = q1c.map { TrackPoint(($0.x + Double(tx0)) / w, ($0.y + Double(ty0)) / h) }
                // 3. backward check
                if let bwd = register(ref: tgtC, target: refC) {
                    let back = (mode == .translation ? Homography.identity : bwd).apply(q1c).map { TrackPoint(($0.x + Double(rx0)) / w, ($0.y + Double(ry0)) / h) }
                    let e = QuadMath.meanCornerErrorPx(back, quad, width: w, height: h)
                    err = e
                    conf = max(0, min(1, 1 - (e - 0.5) / 3.5)) * (trackerOK ? 1 : 0.7)
                }
                // sanity: a homography that sends the corners far from the plain translation is a failed estimate (texture-poor crops
                // can return anything); fall back to the translated quad and say so through the confidence
                let trans = quad.map { TrackPoint($0.x + Double(sx) / w, $0.y + Double(sy) / h) }
                let off = QuadMath.meanCornerErrorPx(q1, trans, width: w, height: h)
                if QuadMath.isConvexWound(q1), off <= max(6, 0.15 * min(bw, bh)) { next = q1 } else { next = trans; conf = min(conf, 0.2) }
            } else {
                // no registration at all: carry the tracker translation, flagged
                let sxn = Double(sx) / w, syn = Double(sy) / h
                if trackerOK { next = quad.map { TrackPoint($0.x + sxn, $0.y + syn) }; conf = 0.2 }
            }
            // 4. rectangle detection as an independent measurement near the prediction (VNDetectRectanglesRequest). When a detected
            //    rectangle agrees with the propagated quad, its corners replace it (they do not drift); the disagreement is the
            //    reprojection error. Without a close detection the propagated quad stands, with the confidence computed above.
            var snapped = false
            if useRectangleDetection {
                let pred = next ?? quad
                if let det = nearestRectangle(in: cur, to: pred) {
                    let d = QuadMath.meanCornerErrorPx(det.quad, pred, width: w, height: h)
                    let size = min(bw, bh)
                    if d < 0.25 * size, QuadMath.isConvexWound(det.quad) {
                        err = d
                        conf = max(0, min(1, 1 - (d - 0.5) / 3.5)) * Double(det.confidence)
                        next = det.quad
                        if conf == 0 { conf = 0.05 }
                        snapped = true
                    }
                }
            }
            if mode == .translation, !snapped { conf = min(conf, 0.45) } // nothing independent checked this step
            if let n = next { quad = n } else { conf = 0 }
            if snapped {
                // the detected rectangle is the best estimate: restart the object tracker from it so it cannot keep a stale lock
                obs = makeObs(quad); prime(cur)
                anchorQ = center(quad); anchorO = (Double(obs.boundingBox.midX), 1 - Double(obs.boundingBox.midY))
            } else if let t = trackerObs {
                obs = t; anchorQ = center(quad); anchorO = (Double(t.boundingBox.midX), 1 - Double(t.boundingBox.midY))
            }
            out.append(VisionTrackSample(index: i, quad: quad, confidence: conf, reprojErrPx: err, manual: false))
            i += 1
        }
        return out
    }

    nonisolated(unsafe) public static var useRectangleDetection = true

    /// The detected rectangle closest to `pred` (normalised top-left quads), or nil.
    static func nearestRectangle(in img: CGImage, to pred: TrackQuad) -> (quad: TrackQuad, confidence: Float)? {
        let req = VNDetectRectanglesRequest()
        req.maximumObservations = 12
        req.minimumConfidence = 0.2
        req.minimumAspectRatio = 0.05
        req.minimumSize = 0.05
        req.quadratureTolerance = 30
        guard (try? VNImageRequestHandler(cgImage: img, options: [:]).perform([req])) != nil, let rs = req.results else { return nil }
        let w = Double(img.width), h = Double(img.height)
        var best: (TrackQuad, Float, Double)? = nil
        for r in rs {
            let q: TrackQuad = [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft].map { TrackPoint(Double($0.x), 1 - Double($0.y)) }
            let e = QuadMath.meanCornerErrorPx(q, pred, width: w, height: h)
            if best == nil || e < best!.2 { best = (q, r.confidence, e) }
        }
        return best.map { ($0.0, $0.1) }
    }

    /// Normalised top-left quad -> Vision observation (normalised, bottom-left).
    static func makeObs(_ q: TrackQuad) -> VNDetectedObjectObservation {
        let b = QuadMath.bbox(q)
        return VNDetectedObjectObservation(boundingBox: CGRect(x: b[0], y: 1 - b[1] - b[3], width: b[2], height: b[3]))
    }

    /// Homography taking ref pixel coordinates (top-left origin) to target pixel coordinates, or nil.
    static func register(ref: CGImage, target: CGImage) -> Homography? {
        let req = VNHomographicImageRegistrationRequest(targetedCGImage: target, options: [:])
        let handler = VNImageRequestHandler(cgImage: ref, options: [:])
        guard (try? handler.perform([req])) != nil, let o = req.results?.first as? VNImageHomographicAlignmentObservation else { return nil }
        let m = o.warpTransform
        let raw = Homography([Double(m[0][0]), Double(m[1][0]), Double(m[2][0]),
                              Double(m[0][1]), Double(m[1][1]), Double(m[2][1]),
                              Double(m[0][2]), Double(m[1][2]), Double(m[2][2])])
        return convention(raw, height: Double(ref.height))
    }

    // Vision's warpTransform convention (direction and y origin) is resolved empirically; see TRACKING NOTES in track.mjs.
    public enum Model: String, Sendable { case homography, translation }
    nonisolated(unsafe) public static var mode: Model = .homography
    nonisolated(unsafe) static var invertRaw = true
    nonisolated(unsafe) static var flipY = true
    static func convention(_ raw: Homography, height: Double) -> Homography? {
        var h = raw
        if invertRaw { guard let i = raw.inverted() else { return nil }; h = i }
        if flipY {
            let f = Homography([1, 0, 0, 0, -1, height, 0, 0, 1])
            // top-left -> bottom-left, apply, back
            let a = compose(h, f), b = compose(f, a)
            h = b
        }
        return h
    }
    static func compose(_ a: Homography, _ b: Homography) -> Homography { // a * b
        var r = [Double](repeating: 0, count: 9)
        for i in 0..<3 { for j in 0..<3 { for k in 0..<3 { r[i * 3 + j] += a.m[i * 3 + k] * b.m[k * 3 + j] } } }
        return Homography(r)
    }
}

// ---- headless CLI -------------------------------------------------------------------------------------------------
// swift track.swift --frames <dir of PNG/JPG frames, sorted> --keyframes <json> [--convention invert|raw,flip|noflip]
//   keyframes.json: [{ "index": 0, "quad_norm": [[x,y],[x,y],[x,y],[x,y]] }, ...]   (TL,TR,BR,BL, normalised, top-left origin)
//   stdout: { "ok": true, "width": W, "height": H, "samples": [{ index, quad_norm, confidence, reproj_err_px|null, manual }] }
//   exit 0 ok, 1 unable (no frames, bad keyframes, Vision failed), 2 usage.
func fail(_ msg: String, _ code: Int32) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  print("{\"ok\": false, \"error\": \"\(msg.replacingOccurrences(of: "\"", with: "'"))\"}")
  exit(code)
}
let argv = Array(CommandLine.arguments.dropFirst())
func opt(_ name: String) -> String? { if let i = argv.firstIndex(of: name), i + 1 < argv.count { return argv[i + 1] }; return nil }
guard let framesDir = opt("--frames"), let kfPath = opt("--keyframes") else { fail("usage: track.swift --frames <dir> --keyframes <json>", 2) }
if argv.contains("--no-detect") { VisionQuadTracker.useRectangleDetection = false }
if let m = opt("--model"), let mm = VisionQuadTracker.Model(rawValue: m) { VisionQuadTracker.mode = mm }
if let c = opt("--convention") { VisionQuadTracker.invertRaw = c.contains("invert"); VisionQuadTracker.flipY = !c.contains("noflip") }
let names = ((try? FileManager.default.contentsOfDirectory(atPath: framesDir)) ?? []).filter { $0.hasSuffix(".png") || $0.hasSuffix(".jpg") }.sorted()
if names.isEmpty { fail("no frames in \(framesDir)", 1) }
var imgs: [CGImage] = []
for n in names {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: framesDir + "/" + n) as CFURL, nil), let im = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("unreadable frame \(n)", 1) }
  imgs.append(im)
}
guard let kd = FileManager.default.contents(atPath: kfPath), let kj = try? JSONSerialization.jsonObject(with: kd) as? [[String: Any]] else { fail("bad keyframes json", 2) }
var kfs: [Int: TrackQuad] = [:]
for k in kj {
  guard let i = k["index"] as? Int, let q = k["quad_norm"] as? [[Double]], q.count == 4, i >= 0, i < imgs.count else { fail("bad keyframe entry", 2) }
  kfs[i] = q.map { TrackPoint($0[0], $0[1]) }
}
if kfs.isEmpty { fail("no keyframes", 2) }
let samples = VisionQuadTracker.track(frames: imgs, keyframes: kfs)
if samples.isEmpty { fail("tracker produced nothing", 1) }
let js: [[String: Any]] = samples.map { s in
  ["index": s.index, "quad_norm": s.quad.map { [$0.x, $0.y] }, "confidence": s.confidence,
   "reproj_err_px": s.reprojErrPx.map { $0 as Any } ?? NSNull(), "manual": s.manual]
}
let outObj: [String: Any] = ["ok": true, "width": imgs[0].width, "height": imgs[0].height, "samples": js]
if let d = try? JSONSerialization.data(withJSONObject: outObj), let s = String(data: d, encoding: .utf8) { print(s) }
