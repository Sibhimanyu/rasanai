import Foundation

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
