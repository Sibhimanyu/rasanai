import AppKit
import StudioCore
import SwiftUI

/// Where the character stands on the stage: the piece's top-left, and view points per piece pixel.
struct StageLayout {
    var size: CGSize
    var s: CGFloat
    var origin: CGPoint
    var pw: CGFloat
    var ph: CGFloat
    /// The character's tallest-pose height in points (the unit the glow and the contact shadow scale with).
    var unit: CGFloat

    func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: origin.x + x * s, y: origin.y + y * s) }
    var rect: CGRect { CGRect(x: origin.x, y: origin.y, width: pw, height: ph) }

    /// `unit` points for the tallest character; ask poses stand left, work poses stand centred.
    static func make(pose: StagePose, character: CrewCharacter, mode: CrewStageArt.Mode, size: CGSize, unit: CGFloat) -> StageLayout {
        let target = mode == .ask ? unit : unit * CrewStageArt.heightShare(character)
        let s = min(target / pose.height, (mode == .ask ? size.width - 12 : size.width * 0.62) / pose.width)
        let pw = pose.width * s, ph = pose.height * s
        let bottom = size.height - (mode == .ask ? 4 : 10)
        let left = mode == .ask ? 6 : size.width / 2 - (pose.feet.first ?? pose.width / 2) * s
        return StageLayout(size: size, s: s, origin: CGPoint(x: left, y: bottom - ph), pw: pw, ph: ph, unit: unit)
    }
}

// MARK: Engine

/// The stage's clock: gaze, blinks, brows, the eyepiece focus and every bubble's position, advanced once per frame.
/// It only ever reads what the session gave it (thoughts, step counts, a preview picture).
@MainActor
final class CrewStageEngine {
    struct Vis: Identifiable {
        let id: String
        var thought: CrewThought
        var size: CGSize
        var x: CGFloat, y: CGFloat, k: CGFloat, kv: CGFloat = 0, op: CGFloat
        var born: Double
        var phase: Double
        var side: CGFloat
        var index: Int
        var leaving = false
    }

    struct Input {
        var layout: StageLayout
        var pose: StagePose
        var character: CrewCharacter
        var mode: CrewStageArt.Mode
        var thoughts: [CrewThought]
        var asleep: Bool
        var motion: Bool
        var lines: Int
        var picture: URL?
    }

    private(set) var bubbles: [Vis] = []
    private(set) var look = CGPoint.zero
    private(set) var lid: CGFloat = 1
    private(set) var focus: CGFloat = 0
    private(set) var browLift: CGFloat = 0
    private(set) var browKnit: CGFloat = 0
    /// When each desk line was first seen (a line draws itself in from then), and the preview picture's fade.
    private(set) var lineBorn: [Double] = []
    private(set) var pictureSince: Double = -1e9

    private var vis: [String: Vis] = [:]
    private var seen: [String: Double] = [:]
    private var seq: [String: Int] = [:]
    private var nextSeq = 0
    private var started = false
    private var lastT: Double = 0
    private var lastNew: Double = 0
    private var newestID: String?
    private var blinkNext: Double = 0
    private var blinkStart: Double = -1
    private var blinkDouble = false
    private var liftUntil: Double = 0
    private var focusAt: Double = -1e9
    private var nextFocus: Double = 0
    private var pictureURL: URL?
    private var idleSince: Double?
    private var firstSightDone = false
    private var startT: Double = 0

    private static func ease(_ dt: Double, _ rate: Double) -> CGFloat { CGFloat(1 - exp(-dt * rate)) }

    func born(of id: String) -> Double { seen[id] ?? 0 }

    func advance(t: Double, _ input: Input) {
        let dt = started ? min(0.1, max(0, t - lastT)) : 0
        lastT = t
        let live = !input.asleep
        let motion = input.motion
        if !started {
            started = true
            startT = t
            lastNew = t
            blinkNext = t + 2
            nextFocus = t + 3
            if input.mode == .ask { liftUntil = t + 0.9 }
        }

        // Bubbles first seen: the ones already there when the screen opens are settled, except a line that is only seconds old.
        let firstSight = seen.isEmpty && newestID == nil
        for thought in input.thoughts.reversed() where seq[thought.id] == nil {
            seq[thought.id] = nextSeq; nextSeq += 1
            let real = thought.time.timeIntervalSinceReferenceDate
            seen[thought.id] = firstSight ? (t - real < 8 ? real : -1e6) : t
        }
        if let newest = input.thoughts.first, newest.id != newestID {
            if newestID != nil, motion {
                lastNew = t
                liftUntil = t + 0.9
                if newest.kind == .find { focusAt = t; nextFocus = t + 6 }
            }
            newestID = newest.id
        }

        // Nothing new for 20 s: only a three-dot bubble stays.
        var list = Array(input.thoughts.prefix(CrewThoughts.maxOnScreen))
        if live, input.mode == .work, t - lastNew > 20, !list.isEmpty {
            if idleSince == nil { idleSince = t }
            list = [CrewThought(id: "idle-dots", kind: .dots, time: Date(), text: "")]
            if seen["idle-dots"] == nil { seen["idle-dots"] = t; seq["idle-dots"] = nextSeq; nextSeq += 1 }
        } else { idleSince = nil; seen["idle-dots"] = nil }
        if input.mode == .ask || input.thoughts.isEmpty { list = [] }

        let layout = input.layout, pose = input.pose
        let eyeXs = pose.eyes.map(\.cx), eyeMean = eyeXs.isEmpty ? pose.width / 2 : eyeXs.reduce(0, +) / CGFloat(eyeXs.count)
        let hx = layout.origin.x + eyeMean * layout.s
        let hy = layout.origin.y + ((pose.eyes.map { $0.cy - $0.ry }.min() ?? pose.height * 0.3) - 30) * layout.s
        let tallest = list.map { BubbleMetrics.size($0).height }.max() ?? 0
        var seenNow = Set<String>()
        for (i, thought) in list.enumerated() {
            seenNow.insert(thought.id)
            let size = BubbleMetrics.size(thought)
            let side: CGFloat = (seq[thought.id] ?? 0) % 2 == 0 ? 1 : -1
            let gap = layout.pw * 0.32 + 40 + CGFloat(i) * 26
            // The newest sits beside the head; older ones step up and outward (one row up at most, so a compact stage holds them).
            let row = CGFloat(i / 2)
            var x = hx + side * gap - (side > 0 ? 0 : size.width)
            var y = hy - size.height - 10 - row * (tallest + 12) - (i % 2 == 1 ? 16 : 0)
            x = min(max(x, 12), max(12, layout.size.width - size.width - 12)); y = max(8, y)
            let op: CGFloat = live ? (i == 0 ? 1 : max(0, 0.92 - CGFloat(i) * 0.2)) : 0
            let k = 1 - CGFloat(i) * 0.1
            if var v = vis[thought.id] {
                v.thought = thought; v.size = size; v.index = i; v.side = side; v.leaving = false
                step(&v, tx: x, ty: y, tk: k, to: op, dt: dt, motion: motion && !(v.born < -1e5 && t - startT < 0.8))
                vis[thought.id] = v
            } else {
                let born = seen[thought.id] ?? t
                // Bubbles already there when the screen opens are simply in place; new ones pop in.
                let pops = motion && born > -1e5
                var v = Vis(id: thought.id, thought: thought, size: size, x: x, y: y, k: pops ? 0.3 : k, op: pops ? 0 : op, born: born, phase: Double(i) * 1.9 + Double(seq[thought.id] ?? 0), side: side, index: i)
                step(&v, tx: x, ty: y, tk: k, to: op, dt: dt, motion: motion && !(v.born < -1e5 && t - startT < 0.8))
                vis[thought.id] = v
            }
        }
        for (id, var v) in vis where !seenNow.contains(id) {
            v.leaving = true
            step(&v, tx: v.x, ty: v.y, tk: 0.6, to: 0, dt: dt, motion: motion)
            if v.op < 0.01 { vis[id] = nil } else { vis[id] = v }
        }
        bubbles = vis.values.sorted { ($0.leaving ? 1 : 0, $0.index) < ($1.leaving ? 1 : 0, $1.index) }

        // Gaze: at the newest bubble while it is live, else down at the work (Tara up and to the side).
        var target = CGPoint.zero
        let eyeY = layout.origin.y + (pose.eyes.first?.cy ?? 0) * layout.s
        if input.mode == .ask { target = CGPoint(x: 0.15, y: 0) }
        else if let top = bubbles.first(where: { $0.index == 0 && !$0.leaving }), top.thought.kind != .dots, t - top.born < 3.5, top.op > 0.3, live {
            let dx = top.x + top.size.width / 2 - hx, dy = top.y + top.size.height / 2 - eyeY
            let d = max(1, hypot(dx, dy))
            target = CGPoint(x: dx / d, y: dy / d)
        } else {
            switch input.character {
            case .kavi, .chitra, .rasika: target = CGPoint(x: 0, y: 0.8)
            case .mala: target = CGPoint(x: 0, y: 0.8)
            case .tara: target = CGPoint(x: 0.6, y: -0.6)
            default: target = .zero
            }
            if !input.thoughts.isEmpty, t - lastNew > 20 { target = .zero }
        }
        if !live { target = CGPoint(x: 0, y: 0.3) }
        let follow = Self.ease(dt, 5.2)
        look.x += (target.x - look.x) * (motion ? follow : 1); look.y += (target.y - look.y) * (motion ? follow : 1)

        // Blink every 3 to 6 s, one in five twice.
        if live, motion, blinkStart < 0, t > blinkNext { blinkStart = t; blinkDouble = Double.random(in: 0..<1) < 0.2 }
        var lidNow: CGFloat = 1
        if blinkStart >= 0 {
            let bt = t - blinkStart
            func one(_ x: Double) -> Double { x < 0.07 ? 1 - x / 0.07 : x < 0.16 ? (x - 0.07) / 0.09 : 1 }
            var l = one(bt)
            if blinkDouble, bt > 0.2 { l = one(bt - 0.2) }
            lidNow = CGFloat(l)
            if bt > (blinkDouble ? 0.38 : 0.18) { blinkStart = -1; blinkNext = t + Double.random(in: 3...6); lidNow = 1 }
        }
        lid = lidNow

        // Brows: lift when a thought starts, knit while a critic's note is live.
        let revising = bubbles.first(where: { $0.index == 0 && !$0.leaving }).map { $0.thought.revising && t - $0.born < 2.5 } ?? false
        let liftTarget: CGFloat = t < liftUntil && motion ? 1 : 0, knitTarget: CGFloat = revising && motion ? 1 : 0
        let browStep = Self.ease(dt, 7.8)
        browLift += (liftTarget - browLift) * browStep
        browKnit += (knitTarget - browKnit) * browStep

        // Tara's eyepiece focuses on every find and every 5 to 10 s.
        if pose.lens != nil, live, motion, input.mode == .work, t > nextFocus { focusAt = t; nextFocus = t + Double.random(in: 5...10) }
        let fp = min(1, max(0, (t - focusAt) / 0.65))
        focus = motion ? CGFloat(sin(fp * .pi) * (1 - fp * 0.3)) : 0

        // Work surfaces.
        while lineBorn.count < input.lines { lineBorn.append(firstSightDone ? t : -1e6) }
        if lineBorn.count > input.lines { lineBorn = Array(lineBorn.prefix(input.lines)) }
        if input.picture != pictureURL {
            pictureSince = firstSightDone ? t : -1e6
            pictureURL = input.picture
        }
        firstSightDone = true
    }

    private func step(_ v: inout Vis, tx: CGFloat, ty: CGFloat, tk: CGFloat, to: CGFloat, dt: Double, motion: Bool) {
        guard motion else { v.x = tx; v.y = ty; v.k = tk; v.op = to; v.kv = 0; return }
        let a = Self.ease(dt, 7)
        v.x += (tx - v.x) * a
        // A bubble that leaves fades while it floats up.
        if v.leaving { v.y -= CGFloat(dt) * 45 } else { v.y += (ty - v.y) * a }
        v.op += (to - v.op) * Self.ease(dt, 6)
        // A softly under-damped spring for the scale, so a new bubble pops in with a small overshoot.
        let acc = (tk - v.k) * 160 - v.kv * 18
        v.kv += acc * CGFloat(dt); v.k += v.kv * CGFloat(dt)
    }
}

// MARK: Drawing

/// Everything one frame of the character needs, a plain value so the Canvas never touches the engine.
struct StageFrame {
    var layout: StageLayout
    var pose: StagePose
    var character: CrewCharacter
    var mode: CrewStageArt.Mode
    var t: Double
    var dark: Bool
    var asleep: Bool
    var motion: Bool
    var look: CGPoint
    var lid: CGFloat
    var focus: CGFloat
    var browLift: CGFloat
    var browKnit: CGFloat
    var lineBorn: [Double]
    var picture: NSImage?
    var pictureAlpha: CGFloat
    var trails: [(origin: CGPoint, side: CGFloat, index: Int, op: CGFloat)]

    private var s: CGFloat { layout.s }

    // The one entry point: the stage floor, the character with her live parts, then the trails and the snoozing z's.
    func draw(_ context: inout GraphicsContext, body: NSImage?, overlay: NSImage?) {
        if mode == .work { drawGlow(&context) }
        drawShadow(&context)
        drawFigure(&context, body: body, overlay: overlay)
        drawTrails(&context)
        if asleep { drawSnooze(&context) }
    }

    private func radial(_ context: inout GraphicsContext, center: CGPoint, rx: CGFloat, ry: CGFloat, color: Color) {
        context.drawLayer { g in
            g.translateBy(x: center.x, y: center.y)
            g.scaleBy(x: rx, y: ry)
            g.fill(Path(ellipseIn: CGRect(x: -1, y: -1, width: 2, height: 2)),
                   with: .radialGradient(Gradient(colors: [color, color.opacity(0)]), center: .zero, startRadius: 0, endRadius: 1))
        }
    }

    private func drawGlow(_ context: inout GraphicsContext) {
        let k = layout.unit / 430
        let c = CGPoint(x: layout.origin.x + layout.pw / 2, y: layout.origin.y + layout.ph * 0.5)
        let ry = min(280 * k, c.y, layout.size.height - c.y)
        let color = dark ? Color(red: 1, green: 190 / 255, blue: 110 / 255).opacity(0.32) : Color(red: 1, green: 226 / 255, blue: 170 / 255).opacity(0.55)
        radial(&context, center: c, rx: 380 * k, ry: ry, color: color)
    }

    private func drawShadow(_ context: inout GraphicsContext) {
        let k = layout.unit / 430
        let c = CGPoint(x: layout.origin.x + (pose.feet.first ?? pose.width / 2) * s, y: layout.origin.y + layout.ph - 3 * k)
        radial(&context, center: c, rx: layout.pw * 0.31, ry: 13 * k * 1.2, color: dark ? .black.opacity(0.6) : Color(red: 40 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.28))
    }

    private func drawFigure(_ context: inout GraphicsContext, body: NSImage?, overlay: NSImage?) {
        let rect = layout.rect
        context.drawLayer { l in
            // Only Laya moves her body: breathing, a float and a nod on the beat. Everyone else stands still.
            if character == .laya, motion, !asleep {
                let br = 1 + 0.012 * sin(t / 3.6 * 2 * .pi)
                let nod = mode == .work ? 2.2 * sin(t * 2 * .pi * 96 / 60) : 0
                let float = 6 * sin(t / 2.4 * 2 * .pi)
                let pivot = CGPoint(x: rect.midX, y: rect.maxY)
                l.translateBy(x: pivot.x, y: pivot.y)
                l.translateBy(x: 0, y: -float)
                l.rotate(by: .degrees(nod))
                l.scaleBy(x: 2 - br, y: br)
                l.translateBy(x: -pivot.x, y: -pivot.y)
            }
            if let body { l.draw(Image(nsImage: body).interpolation(.high), in: rect) }
            drawSurface(&l)
            guard motion else { return }
            for (k, eye) in pose.eyes.enumerated() { drawEye(&l, eye, k: k) }
            if let overlay {
                l.drawLayer { o in
                    if let lens = pose.lens {
                        let c = layout.pt(lens.cx, lens.cy)
                        o.translateBy(x: c.x, y: c.y)
                        o.rotate(by: .degrees(Double(focus) * 6))
                        o.scaleBy(x: 1 + 0.06 * focus, y: 1 + 0.06 * focus)
                        o.translateBy(x: -c.x, y: -c.y)
                    }
                    o.draw(Image(nsImage: overlay).interpolation(.high), in: rect)
                }
            }
            drawBrows(&l)
            drawGlints(&l)
        }
    }

    // MARK: Eyes (drawn like the Home lineup: soft shadow, glossy black, catchlight; Chitra gets lashes)

    private func drawEye(_ context: inout GraphicsContext, _ e: CrewFaces.Eye, k: Int) {
        let c = layout.pt(e.cx, e.cy)
        let rx = e.rx * s, ry = e.ry * s
        var clip: Path?
        var mag: CGFloat = 1
        if let lens = pose.lens, hypot(e.cx - lens.cx, e.cy - lens.cy) < lens.r {
            let lc = layout.pt(lens.cx, lens.cy), r = lens.r * 0.98 * s
            clip = Path(ellipseIn: CGRect(x: lc.x - r, y: lc.y - r, width: r * 2, height: r * 2))
            mag = 1.22 + 0.18 * focus
        } else if let box = pose.lensBoxes.first(where: { e.cx > $0.minX && e.cx < $0.maxX && e.cy > $0.minY && e.cy < $0.maxY }) {
            // Behind a lens the eye is clipped to the inside of the rim (a glasses layer's own rim covers the edge).
            let rim = pose.overlay != nil ? 2 : min(box.width, box.height) * 0.11
            let inner = box.insetBy(dx: rim, dy: rim)
            let a = layout.pt(inner.minX, inner.minY), b = layout.pt(inner.maxX, inner.maxY)
            clip = Path(ellipseIn: CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y))
        }
        context.drawLayer { layer in
            if let clip { layer.clip(to: clip) }
            if asleep {
                // Closed lids: a downward curve where each eye was.
                var lid = Path()
                lid.move(to: CGPoint(x: c.x - rx * 1.05, y: c.y + ry * 0.1))
                lid.addQuadCurve(to: CGPoint(x: c.x + rx * 1.05, y: c.y + ry * 0.1), control: CGPoint(x: c.x, y: c.y + ry * 0.55))
                layer.stroke(lid, with: .color(Color(red: 0x0D / 255, green: 0x0D / 255, blue: 0x12 / 255)), style: StrokeStyle(lineWidth: max(1.2, rx * 0.32), lineCap: .round))
                return
            }
            let shift = CGPoint(x: look.x * rx * 0.35 * 2.2, y: look.y * ry * 0.35 * 0.9)
            layer.drawLayer { g in
                g.translateBy(x: c.x + shift.x, y: c.y + shift.y)
                g.scaleBy(x: mag, y: mag * max(0.06, lid))
                g.translateBy(x: -c.x, y: -c.y)
                g.drawLayer { shade in
                    shade.addFilter(.blur(radius: max(0.5, rx * 0.25)))
                    shade.fill(Path(ellipseIn: CGRect(x: c.x - rx * 1.12, y: c.y + ry * 0.05 - ry * 1.08, width: rx * 2.24, height: ry * 2.16)), with: .color(.black.opacity(0.22)))
                }
                let stops = Gradient(stops: [.init(color: Color(white: 0x36 / 255), location: 0), .init(color: Color(white: 0x12 / 255), location: 0.5), .init(color: Color(white: 0x05 / 255), location: 1)])
                g.fill(Path(ellipseIn: CGRect(x: c.x - rx, y: c.y - ry, width: rx * 2, height: ry * 2)),
                       with: .radialGradient(stops, center: CGPoint(x: c.x - rx * 0.3, y: c.y - ry * 0.4), startRadius: 0, endRadius: max(rx, ry) * 1.2))
                if lid > 0.35 {
                    g.fill(Path(ellipseIn: CGRect(x: c.x - rx * 0.32 - rx * 0.28, y: c.y - ry * 0.52 - ry * 0.2, width: rx * 0.56, height: ry * 0.4)), with: .color(.white.opacity(0.9)))
                }
                if character == .chitra, lid > 0.3 {
                    let side: CGFloat = k == 0 ? -1 : 1
                    var lash = Path()
                    lash.move(to: CGPoint(x: c.x + side * rx * 0.75, y: c.y - ry * 0.62))
                    lash.addQuadCurve(to: CGPoint(x: c.x + side * rx * 1.45, y: c.y - ry * 0.95), control: CGPoint(x: c.x + side * rx * 1.2, y: c.y - ry * 0.6))
                    g.stroke(lash, with: .color(Color(white: 0x0F / 255)), style: StrokeStyle(lineWidth: max(1, rx * 0.3), lineCap: .round))
                }
            }
        }
    }

    // MARK: Brows

    private func drawBrows(_ context: inout GraphicsContext) {
        for (i, b) in pose.brows.enumerated() where b.p0.count >= 2 && b.p1.count >= 2 && b.c.count >= 2 {
            let p0 = layout.pt(b.p0[0], b.p0[1]), c = layout.pt(b.c[0], b.c[1]), p1 = layout.pt(b.p1[0], b.p1[1])
            let mid = CGPoint(x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2)
            let dir: CGFloat = i == 0 ? 1 : -1
            let dx = look.x * 4 * s
            let dy = -browLift * 2.5 + (browKnit * 3 + look.y * 3) * s
            var path = Path()
            path.move(to: p0); path.addQuadCurve(to: p1, control: c)
            context.drawLayer { l in
                l.translateBy(x: dx, y: dy)
                l.translateBy(x: mid.x, y: mid.y)
                l.rotate(by: .degrees(Double(dir * browKnit * 7)))
                l.translateBy(x: -mid.x, y: -mid.y)
                l.stroke(path, with: .color(Color.hex(b.color) ?? .black), style: StrokeStyle(lineWidth: b.width * s, lineCap: .round))
            }
        }
    }

    // MARK: Glints

    /// A soft white skewed band sweeps across each lens every 7 s, clipped to the lens ellipse.
    private func drawGlints(_ context: inout GraphicsContext) {
        guard !asleep else { return }
        for (i, box) in pose.lensBoxes.enumerated() {
            let ph = ((t + Double(i) * 0.12).truncatingRemainder(dividingBy: 7)) / 7
            let sweep = min(1, max(0, (ph - 0.82) / 0.12))
            guard sweep > 0, sweep < 1 else { continue }
            let a = layout.pt(box.minX + 2, box.minY + 2), b = layout.pt(box.maxX - 2, box.maxY - 2)
            let w = box.width * 0.35 * s
            let x = a.x - w + (b.x + 2 * s - (a.x - w)) * CGFloat(sweep)
            context.drawLayer { g in
                g.clip(to: Path(ellipseIn: CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y)))
                g.opacity = 0.55
                let cy = (a.y + b.y) / 2
                g.translateBy(x: x + w / 2, y: cy)
                g.concatenate(CGAffineTransform(a: 1, b: 0, c: tan(-20 * .pi / 180), d: 1, tx: 0, ty: 0))
                g.translateBy(x: -(x + w / 2), y: -cy)
                let band = CGRect(x: x, y: a.y - 20 * s, width: w, height: b.y - a.y + 40 * s)
                g.fill(Path(band), with: .linearGradient(Gradient(colors: [.white.opacity(0), .white, .white.opacity(0)]), startPoint: CGPoint(x: x, y: 0), endPoint: CGPoint(x: x + w, y: 0)))
            }
        }
    }

    // MARK: Work surfaces (real content only)

    private func drawSurface(_ context: inout GraphicsContext) {
        guard let q = pose.quad("surface") else { return }
        if character == .kavi {
            // One handwriting line per real finished step, each drawing itself in.
            let (tl, tr, br, bl) = (q[0], q[1], q[2], q[3])
            for (i, born) in lineBorn.enumerated() where i < 4 {
                let progress = motion ? min(1, max(0, (t - born) / 1.4)) : 1
                guard progress > 0 else { continue }
                let eased = 1 - pow(1 - progress, 2)
                let f = (CGFloat(i) + 0.7) / 4.6
                let y = tl.y + (bl.y - tl.y) * f
                let x0 = tl.x + (bl.x - tl.x) * f + 14
                let x1 = tr.x + (br.x - tr.x) * f - 22 - CGFloat(abs(sin(Double(i) * 12.9898) * 43758.5453).truncatingRemainder(dividingBy: 1)) * 40
                var d = Path(); d.move(to: layout.pt(x0, y))
                var x = x0, n = 0
                while x < x1 {
                    let lift = 3 + CGFloat(abs(sin(Double(i * 31 + n) * 78.233) * 4375.5).truncatingRemainder(dividingBy: 1)) * 2
                    d.addQuadCurve(to: layout.pt(x + 9, y), control: layout.pt(x + 4.5, y - lift * 1.3))
                    x += 9; n += 1
                }
                context.stroke(d.trimmedPath(from: 0, to: eased), with: .color(Color(red: 0x5A / 255, green: 0x5A / 255, blue: 0x70 / 255).opacity(0.8)),
                               style: StrokeStyle(lineWidth: max(1, 1.6 * s * 1.8), lineCap: .round, lineJoin: .round))
            }
        } else if (character == .chitra || character == .rasika), let picture, pictureAlpha > 0 {
            var poly = Path()
            poly.move(to: layout.pt(q[0].x, q[0].y))
            for p in q.dropFirst() { poly.addLine(to: layout.pt(p.x, p.y)) }
            poly.closeSubpath()
            let box = poly.boundingRect
            let size = picture.size
            guard size.width > 0, size.height > 0 else { return }
            let cover = max(box.width / size.width, box.height / size.height)
            let drawn = CGRect(x: box.midX - size.width * cover / 2, y: box.midY - size.height * cover / 2, width: size.width * cover, height: size.height * cover)
            context.drawLayer { g in
                g.clip(to: poly)
                g.opacity = pictureAlpha
                g.draw(Image(nsImage: picture).interpolation(.high), in: drawn)
            }
        }
    }

    // MARK: Trails and snooze

    /// Three dots from the bubble's bottom corner to just outside the head outline at brow height, never on the body.
    private func drawTrails(_ context: inout GraphicsContext) {
        let head = pose.head
        for trail in trails where trail.op > 0.02 {
            let end = CGPoint(x: layout.origin.x + (trail.side > 0 ? head.r + 16 : head.l - 16) * s, y: layout.origin.y + head.y * s - 6)
            for (j, f) in [0.22, 0.52, 0.86].enumerated() {
                let d = (14 - CGFloat(j) * 4) * (trail.index == 0 ? 1 : 0.8)
                let p = CGPoint(x: trail.origin.x + (end.x - trail.origin.x) * f, y: trail.origin.y + (end.y - trail.origin.y) * f)
                let dot = Path(ellipseIn: CGRect(x: p.x - d / 2, y: p.y - d / 2, width: d, height: d))
                let alpha = trail.op * (trail.index == 0 ? 1 : 0.5)
                context.drawLayer { g in
                    g.opacity = alpha
                    if dark {
                        g.fill(dot, with: .color(StageColors.darkGlass.opacity(0.9)))
                        g.stroke(dot, with: .color(.white.opacity(0.12)), lineWidth: 1)
                    } else {
                        g.addFilter(.shadow(color: Color(red: 60 / 255, green: 50 / 255, blue: 110 / 255).opacity(0.14), radius: 3, x: 0, y: 2))
                        g.fill(dot, with: .color(.white))
                    }
                }
            }
        }
    }

    /// "z z Z" drifting up and to the right from just off the top-right of the head, 3.6 s loop, staggered 1.2 s.
    private func drawSnooze(_ context: inout GraphicsContext) {
        let head = pose.head
        let base = CGPoint(x: layout.origin.x + head.r * s + 6, y: layout.origin.y + head.top * s + 10)
        let color = dark ? Color(red: 0xA9 / 255, green: 0xA8 / 255, blue: 0xC8 / 255) : Color(red: 0x6D / 255, green: 0x6C / 255, blue: 0x8A / 255)
        for (i, size) in [18, 24, 32].enumerated() {
            let raw = ((t - Double(i) * 1.2).truncatingRemainder(dividingBy: 3.6) + 3.6).truncatingRemainder(dividingBy: 3.6) / 3.6
            let travel = 1 - pow(1 - raw, 2)
            let opacity = raw < 0.2 ? raw / 0.2 : 1 - (raw - 0.2) / 0.8
            let at = CGPoint(x: base.x + 46 * travel, y: base.y + 10 - 80 * travel)
            context.drawLayer { g in
                g.opacity = max(0, opacity)
                g.translateBy(x: at.x, y: at.y)
                g.rotate(by: .degrees(-8 + 16 * travel))
                g.draw(Text(i == 2 ? "Z" : "z").font(.system(size: CGFloat(size), weight: .heavy)).foregroundColor(color), at: .zero, anchor: .topLeading)
            }
        }
    }
}

// MARK: View

/// The crew stage: one character on a soft stage, her eyes and brows drawn live over the face-less cut-out, with thought bubbles
/// from real session data. `.ask` is the small version that stands beside a decision. No web views, no bundled animation.
struct CrewStage: View {
    let character: CrewCharacter
    var mode: CrewStageArt.Mode = .work
    var thoughts: [CrewThought] = []
    /// The director is paused or waiting out a usage limit: everyone snoozes.
    var asleep = false
    /// How many lines of handwriting Kavi's page carries.
    var lines = 0
    var picture: URL?
    /// Points the tallest character stands (work) or the ask pose stands (ask).
    var unit: CGFloat = 320

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var engine = CrewStageEngine()
    @State private var pictureImage: NSImage?

    /// The stage's height: room above the head for bubbles when working, just the figure when asking.
    static func height(mode: CrewStageArt.Mode, unit: CGFloat) -> CGFloat { mode == .ask ? unit + 8 : unit + 150 }

    var body: some View {
        if let pose = CrewStageArt.pose(character, mode) {
            let height = Self.height(mode: mode, unit: unit)
            Group {
                if mode == .ask {
                    stage(pose: pose, size: CGSize(width: askWidth(pose), height: height)).frame(width: askWidth(pose), height: height)
                } else {
                    GeometryReader { geo in stage(pose: pose, size: geo.size) }.frame(height: height)
                }
            }
            .task(id: picture) { pictureImage = await loadPicture(picture) }
            .accessibilityHidden(true)
        }
    }

    /// An ask pose stands `unit` tall, but never wider than 220 pt (Rasika's is a wide piece).
    private func askUnit(_ pose: StagePose) -> CGFloat { min(unit, 220 * pose.height / pose.width) }
    private func askWidth(_ pose: StagePose) -> CGFloat { 12 + pose.width * askUnit(pose) / pose.height }

    @ViewBuilder private func stage(pose: StagePose, size: CGSize) -> some View {
        let layout = StageLayout.make(pose: pose, character: character, mode: mode, size: size, unit: mode == .ask ? askUnit(pose) : unit)
        let motion = !reduceMotion
        let dark = scheme == .dark
        TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion || scenePhase != .active)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let _ = engine.advance(t: t, .init(layout: layout, pose: pose, character: character, mode: mode, thoughts: thoughts, asleep: asleep,
                                              motion: motion, lines: lines, picture: picture))
            let body = CrewStageArt.image(motion ? "\(character.rawValue)-\(mode.rawValue)" : "\(character.rawValue)-\(mode.rawValue)-faced")
                ?? CrewStageArt.image("\(character.rawValue)-\(mode.rawValue)-faced")
            let overlay = pose.overlay.flatMap { CrewStageArt.image($0) }
            let bubbles = engine.bubbles
            let frame = StageFrame(layout: layout, pose: pose, character: character, mode: mode, t: t, dark: dark, asleep: asleep, motion: motion,
                                   look: engine.look, lid: engine.lid, focus: engine.focus, browLift: engine.browLift, browKnit: engine.browKnit,
                                   lineBorn: engine.lineBorn, picture: pictureImage,
                                   pictureAlpha: motion ? CGFloat(min(1, max(0, (t - engine.pictureSince) / 1.2))) : 1,
                                   trails: bubbles.filter { $0.index < 2 && !$0.leaving && $0.thought.kind == .say }.map {
                                       (CGPoint(x: $0.side > 0 ? $0.x + $0.size.width * 0.2 : $0.x + $0.size.width * 0.8, y: $0.y + $0.size.height + 8), $0.side, $0.index, $0.op)
                                   })
            ZStack(alignment: .topLeading) {
                Canvas { context, _ in frame.draw(&context, body: body, overlay: overlay) }
                    .frame(width: size.width, height: size.height)
                ForEach(bubbles) { b in
                    CrewBubbleView(thought: b.thought, size: b.size, live: b.index == 0 && !b.leaving, age: t - b.born, clock: t,
                                   ago: Self.ago(b.thought, index: b.index, now: Date()), dark: dark, motion: motion)
                        .scaleEffect(max(0.01, b.k), anchor: .bottom)
                        .opacity(Double(max(0, min(1, b.op))))
                        .zIndex(Double(-b.index))
                        .position(x: b.x + b.size.width / 2, y: b.y + b.size.height / 2 + (motion && !asleep ? CGFloat(sin(t * 1.6 + b.phase)) * 3 : 0))
                }
            }
            .frame(width: size.width, height: size.height)
        }
    }

    private static func ago(_ thought: CrewThought, index: Int, now: Date) -> String {
        if thought.kind == .dots { return "" }
        let secs = Int(max(0, now.timeIntervalSince(thought.time)))
        if index == 0, secs < 10 { return "now" }
        return secs < 60 ? "\(secs)s ago" : secs < 3600 ? "\(secs / 60)m ago" : "\(secs / 3600)h ago"
    }

    private func loadPicture(_ url: URL?) async -> NSImage? {
        guard let url else { return nil }
        return await VideoPosters.image(for: url, isVideo: false)
    }
}

/// An asking character beside one speech bubble: the `-ask` pose, with the bubble level with her eyes and its tail toward her.
struct CrewAskRow: View {
    let character: CrewCharacter
    let text: String
    var unit: CGFloat = 150

    /// How far down the drawn pose its eyes sit, in points; split up so the release compiler type-checks it quickly.
    private static func eyeLine(_ pose: StagePose?, unit: CGFloat) -> CGFloat {
        guard let pose else { return 40 }
        let sum: CGFloat = pose.eyes.reduce(0) { $0 + $1.cy }
        let mean: CGFloat = sum / CGFloat(max(1, pose.eyes.count))
        let drawnHeight: CGFloat = min(unit, 220 * pose.height / pose.width)
        return mean * drawnHeight / pose.height
    }

    var body: some View {
        let eyeY = Self.eyeLine(CrewStageArt.pose(character, .ask), unit: unit)
        HStack(alignment: .top, spacing: 0) {
            CrewStage(character: character, mode: .ask, unit: unit)
            CrewSpeechBubble(text: text)
                .frame(maxWidth: 480, alignment: .leading)
                .alignmentGuide(.top) { d in min(0, d.height / 2 - eyeY) }
            Spacer(minLength: 0)
        }
    }
}
