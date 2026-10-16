import AppKit
import SwiftUI

/// Where the crew look: the text caret for a moment after each keystroke, otherwise the pointer anywhere in the window.
@MainActor
final class CrewGaze {
    static let shared = CrewGaze()
    /// The caret in screen coordinates, and when typing last moved it.
    private(set) var caretOnScreen: CGPoint?
    private(set) var typedAt = Date.distantPast
    func typed(caretOnScreen point: CGPoint) { caretOnScreen = point; typedAt = Date() }
}

/// The crew as separate layers: each character is a face-less render placed where it stands in the lineup, and its eyes
/// and brows are drawn live on top from `crew-faces.json` (positions in lineup pixels), so it can look, blink, lean and breathe.
struct CrewFaces: Decodable {
    struct Eye: Decodable { let cx, cy, rx, ry: CGFloat }
    struct Brow: Decodable { let p0, c, p1: [CGFloat]; let width: CGFloat; let color: String }
    struct Member: Decodable {
        let name: String
        /// The layer's image resource, where it sits in the lineup [x, y, w, h], and the point it pivots on (its soles).
        let image: String
        let frame: [CGFloat]
        let feet: [CGFloat]
        /// Laya hovers rather than stands.
        let floats: Bool
        let eyes: [Eye]
        let brows: [Brow]
        /// How far the eyes may slide, as a share of their own size (smaller behind glasses or a lens).
        let travel: CGFloat
        let lashes: Bool
    }
    let width, height: CGFloat
    let members: [Member]

    /// The face map and every layer, each image `nil` when it is missing or unreadable. Never traps: new code draws nothing for a
    /// missing layer. `nil` when the map itself is missing.
    @MainActor static let loaded: (faces: CrewFaces, images: [NSImage?])? = {
        guard let json = StudioResources.url("crew-faces", "json"),
              let data = try? Data(contentsOf: json),
              let faces = try? JSONDecoder().decode(CrewFaces.self, from: data) else { return nil }
        let images = faces.members.map { member -> NSImage? in
            guard let url = StudioResources.url(member.image, "png"),
                  let source = NSImage(contentsOf: url),
                  let pixels = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
            return NSImage(cgImage: pixels, size: NSSize(width: pixels.width, height: pixels.height))
        }
        return (faces, images)
    }()

    /// Home's crew: the art ships with the app, so a missing file is a broken build and stops loudly.
    @MainActor static let shared: (faces: CrewFaces, images: [NSImage]) = {
        guard let loaded else { preconditionFailure("The Home crew face map must be bundled and decodable") }
        let images = zip(loaded.faces.members, loaded.images).map { member, image -> NSImage in
            guard let image else { preconditionFailure("The Home crew layer \(member.image) must be bundled and decodable") }
            return image
        }
        return (loaded.faces, images)
    }()
}

/// The crew on the prompt's rim. Decorative: it never takes clicks or focus, it only watches.
struct HomeCrewLineup: View {
    var isAway = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var rig = CrewRig()
    @State private var animationPaused = false

    var body: some View {
        let art = CrewFaces.shared
        GeometryReader { geo in
            let rect = Self.fit(CGSize(width: art.faces.width, height: art.faces.height), in: geo.size)
            TimelineView(.animation(minimumInterval: 1 / 60, paused: animationPaused || scenePhase != .active)) { timeline in
                Canvas { context, _ in
                    rig.draw(in: &context, art: rect, faces: art.faces, images: art.images, now: timeline.date, motion: !reduceMotion)
                }
            }
            .background(CrewPointerTracker(rig: rig))
        }
        .onChange(of: isAway) { _, away in
            rig.reactToScroll(away: away)
            animationPaused = false
        }
        .task(id: isAway) {
            guard isAway else { animationPaused = false; return }
            // Finish the duck, then stop drawing the invisible crew. Returning cancels this task and restarts the rig.
            do { try await Task.sleep(for: .milliseconds(400)) } catch { return }
            guard !Task.isCancelled else { return }
            animationPaused = true
        }
    }

    /// Aspect-fit, bottom-aligned, as the crew stand on the prompt's rim.
    static func fit(_ image: CGSize, in box: CGSize) -> CGRect {
        let s = min(box.width / image.width, box.height / image.height)
        let size = CGSize(width: image.width * s, height: image.height * s)
        return CGRect(x: (box.width - size.width) / 2, y: box.height - size.height, width: size.width, height: size.height)
    }
}

/// Per-character gaze, blink and body state, advanced each frame.
@MainActor
final class CrewRig {
    /// The pointer in the lineup's own coordinates (it may be far outside the lineup), and a way to map screen points in.
    var pointer: CGPoint?
    var toLocal: ((CGPoint) -> CGPoint?)?
    private var looks: [CGPoint] = []
    private var nextBlink: [TimeInterval] = []
    private var blinkStart: [TimeInterval] = []
    private var perkStart: [TimeInterval] = []
    private var lastTyped = Date.distantPast
    private var last: TimeInterval?
    private var seed: UInt64 = 0x5EED
    private var scrollReaction: (away: Bool, started: TimeInterval)?

    func reactToScroll(away: Bool, now: Date = Date()) {
        scrollReaction = (away, now.timeIntervalSinceReferenceDate)
    }

    private func random() -> Double { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return Double(seed >> 11) / Double(1 << 53) }

    /// Body motion (lean, breath, hover, the perk when typing starts) stays off under Reduce Motion; following with the
    /// eyes and blinking stay on, because they are small and they carry meaning.
    func draw(in context: inout GraphicsContext, art: CGRect, faces: CrewFaces, images: [NSImage], now date: Date, motion: Bool) {
        let t = date.timeIntervalSinceReferenceDate
        let dt = min(0.1, max(0, t - (last ?? t))); last = t
        let n = faces.members.count
        if looks.count != n {
            looks = Array(repeating: .zero, count: n)
            nextBlink = (0..<n).map { _ in t + 1 + random() * 4 }
            blinkStart = Array(repeating: -10, count: n)
            perkStart = Array(repeating: -10, count: n)
        }
        let scale = art.width / faces.width
        let point = { (x: CGFloat, y: CGFloat) in CGPoint(x: art.minX + x * scale, y: art.minY + y * scale) }
        // the caret wins for a moment after each keystroke, then the pointer takes over again
        let gaze = CrewGaze.shared
        var target = pointer
        if Date().timeIntervalSince(gaze.typedAt) < 1.6, let caret = gaze.caretOnScreen, let local = toLocal?(caret) { target = local }
        // the first keystroke after a pause makes the crew perk up, a ripple from left to right
        if gaze.typedAt > lastTyped {
            if gaze.typedAt.timeIntervalSince(lastTyped) > 2 { for i in 0..<n { perkStart[i] = t + Double(i) * 0.06 } }
            lastTyped = gaze.typedAt
        }
        let follow = 1 - exp(-12 * dt)

        for (i, member) in faces.members.enumerated() where !member.eyes.isEmpty {
            let mid = member.eyes.reduce(CGPoint.zero) { CGPoint(x: $0.x + $1.cx / CGFloat(member.eyes.count), y: $0.y + $1.cy / CGFloat(member.eyes.count)) }
            let from = point(mid.x, mid.y)
            var want = CGPoint.zero
            if let target { want = CGPoint(x: tanh((target.x - from.x) / 240), y: tanh((target.y - from.y) / 170)) }
            looks[i].x += (want.x - looks[i].x) * follow
            looks[i].y += (want.y - looks[i].y) * follow
            if t >= nextBlink[i] {
                blinkStart[i] = t
                nextBlink[i] = t + (random() < 0.18 ? 0.26 : 2.4 + random() * 3.8)
            }
            let blink = CrewDrawing.blink(since: t - blinkStart[i])
            let look = looks[i]

            // body: lean toward the gaze, breathe out of step with the others, hover, perk up when typing starts
            var pose = CrewPose(look: look, blink: blink)
            if motion { pose.addBody(time: t, phase: Double(i) * 1.7, floats: member.floats, perkAge: t - perkStart[i]) }
            if motion, let reaction = scrollReaction {
                pose.addScrollReaction(away: reaction.away, age: t - reaction.started, index: i, count: n)
            }
            CrewDrawing.draw(member, image: images[i], pose: pose, origin: art.origin, scale: scale, in: &context)
        }
    }
}

/// One character's pose for one frame: where the eyes look, how closed they are, and the body's lean, breath, hover and perk.
struct CrewPose {
    var look: CGPoint = .zero
    /// 0 open, 1 shut.
    var blink: CGFloat = 0
    var lean = 0.0, breath = 0.0, hover = 0.0, lift = 0.0, stretch = 0.0

    init(look: CGPoint = .zero, blink: CGFloat = 0) { self.look = look; self.blink = blink }

    /// Body motion (lean toward the gaze, breath, hover, the perk when typing starts); left out under Reduce Motion.
    /// `perkAge` is the seconds since the perk began (negative before it starts).
    mutating func addBody(time t: Double, phase: Double, floats: Bool, perkAge p: Double) {
        lean = Double(look.x) * 1.8 * .pi / 180
        breath = sin(2 * .pi * t / 3.6 + phase)
        if floats { hover = 6 * sin(2 * .pi * t / 2.6 + phase) }
        if p >= 0 && p < 0.6 {
            let k = p < 0.12 ? sin(.pi / 2 * p / 0.12) : exp(-7 * (p - 0.12)) * cos(15 * (p - 0.12))
            lift = 8 * k; stretch = 0.02 * max(0, k)
        }
    }

    /// A short stagger travels through the cast. All changes are drawing transforms around the feet, never layout.
    mutating func addScrollReaction(away: Bool, age: Double, index: Int, count: Int) {
        guard age >= 0 else { return }
        let local = age - Double(index) * 0.018
        let side = count > 1 ? Double(index) / Double(count - 1) * 2 - 1 : 0
        if away {
            guard local >= 0 else { return }
            let p = min(local / 0.2, 1)
            let duck = 1 - pow(1 - p, 3)
            lift -= 30 * duck
            stretch -= 0.055 * duck
            lean += side * 0.045 * duck
            look.y += (0.8 - look.y) * duck
            blink = max(blink, CGFloat(0.4 * duck))
        } else {
            let t = max(0, local)
            guard t < 0.9 else { return }
            // A damped lift out of the duck, one small overshoot, then an exact return to the normal gaze/idle pose.
            let envelope = exp(-9 * t)
            lift -= 28 * envelope * cos(14 * t)
            stretch += -0.04 * envelope * cos(14 * t)
            lean += side * 0.045 * envelope * cos(12 * t)
            look.y += (-0.75 - look.y) * envelope
            blink = max(blink, CGFloat(0.35 * envelope))
        }
    }
}

/// The drawing of one character (its layer, brows, eyes and lashes), shared by the Home lineup and `CrewAvatar`.
enum CrewDrawing {
    /// How shut the eyes are, `seconds` after a blink began (a blink lasts 0.17 s).
    static func blink(since seconds: Double) -> CGFloat {
        let bp = seconds / 0.17
        return bp < 0 || bp > 1 ? 0 : CGFloat(bp < 0.4 ? pow(bp / 0.4, 3) : 1 - (1 - pow(1 - (bp - 0.4) / 0.6, 3)))
    }

    /// Draws `member` with the art's top-left at `origin` and `scale` view points per art pixel. A missing image draws nothing.
    static func draw(_ member: CrewFaces.Member, image: NSImage?, pose: CrewPose, origin: CGPoint, scale: CGFloat, in context: inout GraphicsContext) {
        guard let image, member.frame.count >= 4, member.feet.count >= 2 else { return }
        let point = { (x: CGFloat, y: CGFloat) in CGPoint(x: origin.x + x * scale, y: origin.y + y * scale) }
        let look = pose.look, blink = pose.blink
        let feet = point(member.feet[0], member.feet[1])
        context.drawLayer { layer in
            layer.translateBy(x: 0, y: -CGFloat(pose.lift + pose.hover) * scale)
            layer.translateBy(x: feet.x, y: feet.y)
            layer.rotate(by: .radians(pose.lean))
            layer.scaleBy(x: CGFloat(1 - 0.004 * pose.breath), y: CGFloat(1 + 0.008 * pose.breath + pose.stretch))
            layer.translateBy(x: -feet.x, y: -feet.y)

            let f = member.frame
            layer.draw(Image(nsImage: image).interpolation(.high), in: CGRect(origin: point(f[0], f[1]), size: CGSize(width: f[2] * scale, height: f[3] * scale)))

            for brow in member.brows where brow.p0.count >= 2 && brow.p1.count >= 2 && brow.c.count >= 2 {
                let dx = look.x * 2.5 * scale, dy = (look.y * 3 + blink * 3) * scale
                let shift = CGAffineTransform(translationX: dx, y: dy)
                var path = Path()
                path.move(to: point(brow.p0[0], brow.p0[1]).applying(shift))
                path.addQuadCurve(to: point(brow.p1[0], brow.p1[1]).applying(shift), control: point(brow.c[0], brow.c[1]).applying(shift))
                layer.stroke(path, with: .color(Color.hex(brow.color) ?? .black), style: StrokeStyle(lineWidth: brow.width * scale, lineCap: .round))
            }
            for (k, eye) in member.eyes.enumerated() {
                let rx = eye.rx * scale, ry = eye.ry * scale
                let open = max(0.06, 1 - 0.94 * blink)
                let c = point(eye.cx, eye.cy).applying(.init(translationX: look.x * rx * member.travel * 1.1, y: look.y * ry * member.travel * 0.6))
                let rect = CGRect(x: c.x - rx, y: c.y - ry * open, width: rx * 2, height: ry * 2 * open)
                // a soft shadow under the eye, the glossy black, then the catchlight
                layer.drawLayer { shade in
                    shade.addFilter(.blur(radius: max(0.5, rx * 0.25)))
                    shade.fill(Path(ellipseIn: rect.insetBy(dx: -rx * 0.12, dy: -ry * 0.08 * open).offsetBy(dx: 0, dy: ry * 0.05)), with: .color(.black.opacity(0.22)))
                }
                layer.fill(Path(ellipseIn: rect), with: .radialGradient(Gradient(colors: [Color(white: 0.21), Color(white: 0.07), Color(white: 0.02)]),
                                                                        center: CGPoint(x: c.x - rx * 0.3, y: c.y - ry * 0.4 * open), startRadius: 0, endRadius: max(rx, ry) * 1.2))
                if open > 0.35 {
                    layer.fill(Path(ellipseIn: CGRect(x: c.x - rx * 0.6, y: c.y - ry * 0.72 * open, width: rx * 0.56, height: ry * 0.4 * open)), with: .color(.white.opacity(0.9)))
                }
                if member.lashes, open > 0.3 {
                    let side: CGFloat = k == 0 ? -1 : 1
                    var lash = Path()
                    lash.move(to: CGPoint(x: c.x + side * rx * 0.75, y: c.y - ry * 0.62 * open))
                    lash.addQuadCurve(to: CGPoint(x: c.x + side * rx * 1.45, y: c.y - ry * 0.95 * open), control: CGPoint(x: c.x + side * rx * 1.2, y: c.y - ry * 0.6 * open))
                    layer.stroke(lash, with: .color(Color(white: 0.06)), style: StrokeStyle(lineWidth: max(1, rx * 0.3), lineCap: .round))
                }
            }
        }
    }
}

/// Reports the pointer anywhere in the window, in the lineup's coordinates, without taking any clicks.
private struct CrewPointerTracker: NSViewRepresentable {
    let rig: CrewRig
    func makeNSView(context: Context) -> TrackerView { let v = TrackerView(); v.rig = rig; return v }
    func updateNSView(_ view: TrackerView, context: Context) { view.rig = rig }

    final class TrackerView: NSView {
        weak var rig: CrewRig?
        nonisolated(unsafe) private var monitor: Any?
        override var isFlipped: Bool { true }
        override func hitTest(_ point: NSPoint) -> NSView? { nil }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let monitor { NSEvent.removeMonitor(monitor); self.monitor = nil }
            guard let window else { return }
            window.acceptsMouseMovedEvents = true
            rig?.toLocal = { [weak self] screen in
                guard let self, let window = self.window else { return nil }
                return self.convert(window.convertPoint(fromScreen: screen), from: nil)
            }
            monitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged, .mouseExited]) { [weak self] event in
                guard let self, event.window === self.window else { return event }
                self.rig?.pointer = event.type == .mouseExited ? nil : self.convert(event.locationInWindow, from: nil)
                return event
            }
        }
        deinit { if let monitor { NSEvent.removeMonitor(monitor) } }
    }
}
