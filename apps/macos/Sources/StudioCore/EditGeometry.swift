import Foundation
import CoreGraphics

// Pure geometry for Studio direct editing (hybrid contract C6 client). No UI, no I/O.
// Chain: view point -> letterboxed film rect -> film-normalised (0...1) -> film pixels -> element box (centre, size, rotation).
// Rotation is always applied in FILM PIXEL space, so a 9:16 or 1:1 film rotates and resizes without shearing.

/// An element box in film-normalised coordinates, rotated about its centre. `rotation` is degrees, clockwise (screen space).
public struct EditBox: Sendable, Equatable {
    public var cx: Double, cy: Double, w: Double, h: Double, rotation: Double
    public init(cx: Double, cy: Double, w: Double, h: Double, rotation: Double = 0) {
        self.cx = cx; self.cy = cy; self.w = w; self.h = h; self.rotation = rotation
    }
    public init(rect: MotionNormRect, rotation: Double = 0) {
        self.init(cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, w: rect.w, h: rect.h, rotation: rotation)
    }
    public var normRect: MotionNormRect { MotionNormRect(x: cx - w / 2, y: cy - h / 2, w: w, h: h) }

    /// Equal within `eps` on every field (normalised units, degrees for rotation).
    public func isClose(to o: EditBox, eps: Double = 0.0005) -> Bool {
        abs(cx - o.cx) <= eps && abs(cy - o.cy) <= eps && abs(w - o.w) <= eps && abs(h - o.h) <= eps && abs(rotation - o.rotation) <= eps * 100
    }
}

/// The eight resize handles plus the rotate handle. `sx`/`sy` give the side each handle drags (-1 left/top, 0 none, +1 right/bottom).
public enum EditHandle: String, Sendable, CaseIterable {
    case topLeft, top, topRight, right, bottomRight, bottom, bottomLeft, left, rotate
    public var sx: Double {
        switch self { case .topLeft, .left, .bottomLeft: return -1; case .topRight, .right, .bottomRight: return 1; default: return 0 }
    }
    public var sy: Double {
        switch self { case .topLeft, .top, .topRight: return -1; case .bottomLeft, .bottom, .bottomRight: return 1; default: return 0 }
    }
    public var isCorner: Bool { sx != 0 && sy != 0 }
    public static var resizeHandles: [EditHandle] { allCases.filter { $0 != .rotate } }
}

public enum EditGeometry {
    public static let minSizeNorm = 0.01
    /// Distance of the rotate handle above the top edge, in view points.
    public static let rotateStemPoints: CGFloat = 26

    // MARK: Coordinate mapping (delegates to the shipped letterbox math)

    public static func filmRect(viewSize: CGSize, filmSize: CGSize) -> CGRect? {
        MotionVideoGeometry.filmRect(viewSize: viewSize, filmSize: filmSize, fit: .aspectFit)
    }
    /// Unclamped: a point in the bars maps outside 0...1, which drags need (a drag may leave the frame).
    public static func normPoint(viewPoint: CGPoint, viewSize: CGSize, filmSize: CGSize) -> CGPoint? {
        guard let r = filmRect(viewSize: viewSize, filmSize: filmSize) else { return nil }
        return CGPoint(x: (viewPoint.x - r.minX) / r.width, y: (viewPoint.y - r.minY) / r.height)
    }
    public static func viewPoint(norm: CGPoint, viewSize: CGSize, filmSize: CGSize) -> CGPoint? {
        guard let r = filmRect(viewSize: viewSize, filmSize: filmSize) else { return nil }
        return CGPoint(x: r.minX + norm.x * r.width, y: r.minY + norm.y * r.height)
    }

    // MARK: Pixel-space helpers

    private static func rotate(_ x: Double, _ y: Double, degrees: Double) -> (Double, Double) {
        let a = degrees * .pi / 180, c = cos(a), s = sin(a)
        return (x * c - y * s, x * s + y * c)
    }

    /// The four corners of a box in view space (top-left, top-right, bottom-right, bottom-left, before rotation order).
    public static func viewCorners(of box: EditBox, viewSize: CGSize, filmSize: CGSize) -> [CGPoint]? {
        guard let r = filmRect(viewSize: viewSize, filmSize: filmSize) else { return nil }
        let pw = box.w * Double(r.width), ph = box.h * Double(r.height)
        let c = CGPoint(x: r.minX + box.cx * r.width, y: r.minY + box.cy * r.height)
        return [(-1.0, -1.0), (1, -1), (1, 1), (-1, 1)].map { s in
            let (dx, dy) = rotate(s.0 * pw / 2, s.1 * ph / 2, degrees: box.rotation)
            return CGPoint(x: c.x + dx, y: c.y + dy)
        }
    }

    /// View-space position of a handle. The rotate handle sits `rotateStemPoints` beyond the top edge, along the box's own up axis.
    public static func handlePoint(_ handle: EditHandle, box: EditBox, viewSize: CGSize, filmSize: CGSize) -> CGPoint? {
        guard let r = filmRect(viewSize: viewSize, filmSize: filmSize) else { return nil }
        let pw = box.w * Double(r.width), ph = box.h * Double(r.height)
        let lx: Double, ly: Double
        if handle == .rotate { lx = 0; ly = -ph / 2 - Double(rotateStemPoints) } else { lx = handle.sx * pw / 2; ly = handle.sy * ph / 2 }
        let (dx, dy) = rotate(lx, ly, degrees: box.rotation)
        return CGPoint(x: r.minX + box.cx * r.width + dx, y: r.minY + box.cy * r.height + dy)
    }

    // MARK: Hit testing

    /// True when a film-normalised point lies inside the (rotated) box.
    public static func contains(_ box: EditBox, normPoint p: CGPoint, filmSize: CGSize) -> Bool {
        let dx = (Double(p.x) - box.cx) * Double(filmSize.width), dy = (Double(p.y) - box.cy) * Double(filmSize.height)
        let (lx, ly) = rotate(dx, dy, degrees: -box.rotation)
        return abs(lx) <= box.w * Double(filmSize.width) / 2 && abs(ly) <= box.h * Double(filmSize.height) / 2
    }

    /// The handle under a view point, within `radius` points; the rotate handle and corners win over edges.
    public static func hitHandle(viewPoint: CGPoint, box: EditBox, viewSize: CGSize, filmSize: CGSize, radius: CGFloat = 9) -> EditHandle? {
        let order: [EditHandle] = [.rotate, .topLeft, .topRight, .bottomRight, .bottomLeft, .top, .right, .bottom, .left]
        var best: (EditHandle, CGFloat)?
        for h in order {
            guard let p = handlePoint(h, box: box, viewSize: viewSize, filmSize: filmSize) else { continue }
            let d = hypot(p.x - viewPoint.x, p.y - viewPoint.y)
            if d <= radius, best == nil || d < best!.1 - 0.001 { best = (h, d) }
        }
        return best?.0
    }

    // MARK: Gestures (all take and return film-normalised values)

    /// Moves by a normalised delta, keeping the centre inside the frame.
    public static func move(_ box: EditBox, dx: Double, dy: Double) -> EditBox {
        var b = box
        b.cx = min(1, max(0, box.cx + dx)); b.cy = min(1, max(0, box.cy + dy))
        return b
    }

    /// Resizes by dragging `handle` to the film-normalised `pointer`, the opposite side (or centre, with `fromCenter`) fixed.
    /// Corners keep the original aspect when `keepAspect`. Works in pixel space so rotated boxes stay rigid.
    public static func resize(_ box: EditBox, handle: EditHandle, pointer: CGPoint, filmSize: CGSize, keepAspect: Bool = false, fromCenter: Bool = false) -> EditBox {
        guard handle != .rotate, filmSize.width > 0, filmSize.height > 0 else { return box }
        let fw = Double(filmSize.width), fh = Double(filmSize.height)
        let pw = box.w * fw, ph = box.h * fh
        let (lx, ly) = rotate((Double(pointer.x) - box.cx) * fw, (Double(pointer.y) - box.cy) * fh, degrees: -box.rotation)
        let minPx = minSizeNorm * min(fw, fh)
        var newW = pw, newH = ph, shiftX = 0.0, shiftY = 0.0
        if handle.sx != 0 {
            let fixed = fromCenter ? 0 : -handle.sx * pw / 2
            newW = max(minPx, handle.sx * (lx - fixed) * (fromCenter ? 2 : 1))
            shiftX = fromCenter ? 0 : handle.sx * (newW - pw) / 2
        }
        if handle.sy != 0 {
            let fixed = fromCenter ? 0 : -handle.sy * ph / 2
            newH = max(minPx, handle.sy * (ly - fixed) * (fromCenter ? 2 : 1))
            shiftY = fromCenter ? 0 : handle.sy * (newH - ph) / 2
        }
        if keepAspect, handle.isCorner, pw > 0, ph > 0 {
            let k = max(newW / pw, newH / ph)
            newW = max(minPx, pw * k); newH = max(minPx, ph * k)
            shiftX = fromCenter ? 0 : handle.sx * (newW - pw) / 2
            shiftY = fromCenter ? 0 : handle.sy * (newH - ph) / 2
        }
        let (ox, oy) = rotate(shiftX, shiftY, degrees: box.rotation)
        return EditBox(cx: box.cx + ox / fw, cy: box.cy + oy / fh, w: newW / fw, h: newH / fh, rotation: box.rotation)
    }

    /// Rotation so the rotate handle points at `pointer`. `snap` (degrees, e.g. 15) rounds the result; angles land in (-180, 180].
    public static func rotation(of box: EditBox, pointer: CGPoint, filmSize: CGSize, snap: Double? = nil) -> EditBox {
        let dx = (Double(pointer.x) - box.cx) * Double(filmSize.width), dy = (Double(pointer.y) - box.cy) * Double(filmSize.height)
        guard dx != 0 || dy != 0 else { return box }
        var deg = atan2(dx, -dy) * 180 / .pi            // 0 = straight up, clockwise positive
        if let snap, snap > 0 { deg = (deg / snap).rounded() * snap }
        var b = box; b.rotation = normalizeDegrees(deg)
        return b
    }

    public static func normalizeDegrees(_ d: Double) -> Double {
        var r = d.truncatingRemainder(dividingBy: 360)
        if r > 180 { r -= 360 } else if r <= -180 { r += 360 }
        return r
    }

    /// Keyboard nudge: one film pixel, ten with `large` (shift).
    public static func nudge(_ box: EditBox, dxPixels: Double, dyPixels: Double, filmSize: CGSize, large: Bool = false) -> EditBox {
        let k = large ? 10.0 : 1.0
        return move(box, dx: dxPixels * k / Double(max(1, filmSize.width)), dy: dyPixels * k / Double(max(1, filmSize.height)))
    }

    /// Snaps the centre to frame centre and thirds within `tolerance` (normalised). Returns the guide lines hit.
    public static func snapToGuides(_ box: EditBox, tolerance: Double = 0.012) -> (box: EditBox, guidesX: [Double], guidesY: [Double]) {
        let lines = [0.5, 1.0 / 3.0, 2.0 / 3.0]
        var b = box, gx: [Double] = [], gy: [Double] = []
        if let l = lines.min(by: { abs($0 - box.cx) < abs($1 - box.cx) }), abs(l - box.cx) <= tolerance { b.cx = l; gx.append(l) }
        if let l = lines.min(by: { abs($0 - box.cy) < abs($1 - box.cy) }), abs(l - box.cy) <= tolerance { b.cy = l; gy.append(l) }
        return (b, gx, gy)
    }

    // MARK: Element picking

    /// Picks the element to select at a film-normalised point from `(id, box, z)` candidates: higher z first, then the smaller area, then id.
    /// If `current` is under the point and several overlap, a second click cycles to the next one underneath.
    public static func pick(at p: CGPoint, filmSize: CGSize, candidates: [(id: String, box: EditBox, z: Double)], current: String? = nil, cycle: Bool = false) -> String? {
        let hits = candidates.filter { contains($0.box, normPoint: p, filmSize: filmSize) }.sorted { a, b in
            if a.z != b.z { return a.z > b.z }
            if a.box.w * a.box.h != b.box.w * b.box.h { return a.box.w * a.box.h < b.box.w * b.box.h }
            return a.id < b.id
        }
        guard !hits.isEmpty else { return nil }
        if cycle, let current, let i = hits.firstIndex(where: { $0.id == current }) { return hits[(i + 1) % hits.count].id }
        return hits[0].id
    }
}

// MARK: Undo / redo

/// A reversible edit: the element, what it was and what it became (exact values, JSON-shaped).
public struct DirectEditEntry: Sendable, Equatable, Identifiable {
    public var id: String                       // id of the op that applied it
    public var elementID: String
    public var operation: String                // transform | property
    public var original: [String: JSONValue]
    public var proposed: [String: JSONValue]
    public var summary: String
    public init(id: String, elementID: String, operation: String, original: [String: JSONValue], proposed: [String: JSONValue], summary: String) {
        self.id = id; self.elementID = elementID; self.operation = operation; self.original = original; self.proposed = proposed; self.summary = summary
    }
}

/// Undo and redo stacks. A new commit clears redo. Popping returns the entry to reverse (undo) or re-apply (redo).
public struct DirectEditHistory: Sendable, Equatable {
    public private(set) var done: [DirectEditEntry] = []
    public private(set) var undone: [DirectEditEntry] = []
    public init() {}
    public var canUndo: Bool { !done.isEmpty }
    public var canRedo: Bool { !undone.isEmpty }
    public mutating func record(_ e: DirectEditEntry) { done.append(e); undone.removeAll() }
    public mutating func popUndo() -> DirectEditEntry? { guard let e = done.popLast() else { return nil }; undone.append(e); return e }
    public mutating func popRedo() -> DirectEditEntry? { guard let e = undone.popLast() else { return nil }; done.append(e); return e }
    /// Puts an entry back after a failed send so the stacks match what is on disk.
    public mutating func restoreUndo(_ e: DirectEditEntry) { if undone.last == e { undone.removeLast() }; done.append(e) }
    public mutating func restoreRedo(_ e: DirectEditEntry) { if done.last == e { done.removeLast() }; undone.append(e) }
    public mutating func removeAll(for elementID: String) {
        done.removeAll { $0.elementID == elementID }; undone.removeAll { $0.elementID == elementID }
    }
}

// MARK: Versions and conflicts

public enum DirectVersionCheck: Sendable, Equatable {
    case current
    /// Index or film changed; the element is still there with the same box, so the edit can be rebased onto the new version.
    case rebasable
    /// Index or film changed and the element moved, vanished or changed scene: refuse, never apply to a different element.
    case conflict(String)
}

public enum DirectVersion {
    public static func check(editing item: MotionElementItem, original: EditBox, editedVersion: (film: Int?, digest: String?),
                             latest: MotionElementIndex, time: Double) -> DirectVersionCheck {
        let same = editedVersion.film == latest.filmVersion && editedVersion.digest == latest.buildDigest
        if same { return .current }
        guard let now = latest.item(id: item.elementId) else { return .conflict("\(item.displayLabel) is no longer in the film.") }
        if now.sceneId != item.sceneId { return .conflict("\(item.displayLabel) moved to another scene.") }
        guard let r = latest.normalisedBounds(of: now, at: time) else { return .conflict("\(item.displayLabel) has no measured bounds in the new version.") }
        let nowBox = EditBox(rect: r, rotation: original.rotation)
        return nowBox.isClose(to: original, eps: 0.002) ? .rebasable : .conflict("\(item.displayLabel) changed since you started editing.")
    }
}
