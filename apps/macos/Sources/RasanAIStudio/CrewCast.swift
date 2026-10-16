import AppKit
import StudioCore
import SwiftUI

/// The seven crew characters (see `CrewRoles` for which agent, step and phase each presents). The keys match `CrewRoles`.
enum CrewCharacter: String, CaseIterable, Identifiable {
    case tara, kavi, chitra, ra, laya, rasika, mala

    var id: String { rawValue }
    init?(key: String?) { guard let key, let found = Self(rawValue: key.lowercased()) else { return nil }; self = found }

    var displayName: String {
        switch self {
        case .tara: "Tara"
        case .kavi: "Kavi"
        case .chitra: "Chitra"
        case .ra: "Rasan"
        case .laya: "Laya"
        case .rasika: "Rasika"
        case .mala: "Mala"
        }
    }

    /// What they do on the crew.
    var roleTitle: String {
        switch self {
        case .tara: "Scout"
        case .kavi: "Writer"
        case .chitra: "Art Director"
        case .ra: "Director"
        case .laya: "Motion Director"
        case .rasika: "Critic"
        case .mala: "Editor"
        }
    }

    /// What the name means, for tooltips and the about screen.
    var meaning: String {
        switch self {
        case .tara: "Star, the one who guides"
        case .kavi: "Poet"
        case .chitra: "Picture"
        case .ra: "The first half of RasanAI"
        case .laya: "Rhythm"
        case .rasika: "One who savours, a connoisseur"
        case .mala: "Garland, things strung in order"
        }
    }

    /// The character's brand colour (DESIGN.md).
    var color: Color {
        switch self {
        case .tara: Color.hex("#2A31A8") ?? .blue
        case .kavi: Color.hex("#1B1F5E") ?? .indigo
        case .chitra: Color.hex("#B3165A") ?? .pink
        case .ra: Color.hex("#EFB21A") ?? .yellow
        case .laya: Color.hex("#1E5A3C") ?? .green
        case .rasika: Color.hex("#3F4368") ?? .gray
        case .mala: Color.hex("#DFE3EE") ?? .gray
        }
    }

    /// The position in `CrewFaces.members` (matched by name, so a reordered face map still works).
    @MainActor var index: Int? { CrewFaces.loaded?.faces.members.firstIndex { $0.name == displayName } }
}

/// The window pointer, shared by every avatar: one local event monitor for all of them, installed on first use.
@MainActor
final class CrewPointer {
    static let shared = CrewPointer()
    private(set) var screen: CGPoint?
    private(set) weak var window: NSWindow?
    private var monitor: Any?

    func start() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged, .mouseExited]) { event in
            let window = event.window
            let moved = event.type != .mouseExited
            let screen = window.map { $0.convertPoint(toScreen: event.locationInWindow) }
            MainActor.assumeIsolated { CrewPointer.shared.note(window: window, screen: moved ? screen : nil) }
            return event
        }
    }

    private func note(window: NSWindow?, screen: CGPoint?) {
        if screen == nil, window !== self.window { return }
        self.window = window; self.screen = screen
        window?.acceptsMouseMovedEvents = true
    }
}

/// One avatar's own gaze, blink and perk clock.
@MainActor
final class CrewAvatarRig {
    /// Screen point to the avatar's own coordinates, nil while it is off screen.
    var toLocal: ((CGPoint) -> CGPoint?)?
    /// The window the avatar lives in, so it ignores a pointer that is in another one.
    weak var window: NSWindow?
    private var look = CGPoint.zero
    private var nextBlink: TimeInterval?
    private var blinkStart: TimeInterval = -10
    private var perkStart: TimeInterval = -10
    private var lastTyped = Date.distantPast
    private var last: TimeInterval?
    private var seed: UInt64
    private static var made: UInt64 = 0

    init(salt: Int) { Self.made += 1; seed = 0x5EED &+ UInt64(salt + 1) &* 0x9E37_79B9 &+ Self.made &* 7919 }
    private func random() -> Double { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return Double(seed >> 11) / Double(1 << 53) }

    /// Advances the clock to `date` and returns the pose to draw. `eyes` is where the eyes sit in view points.
    func pose(at date: Date, eyes: CGPoint, member: CrewFaces.Member, index: Int, watching: Bool, hint: CGPoint?, motion: Bool) -> CrewPose {
        let t = date.timeIntervalSinceReferenceDate
        let dt = min(0.1, max(0, t - (last ?? t))); last = t
        var want = hint ?? .zero
        if watching {
            let gaze = CrewGaze.shared
            var target: CGPoint?
            if Date().timeIntervalSince(gaze.typedAt) < 1.6, let caret = gaze.caretOnScreen { target = toLocal?(caret) }
            if target == nil, let screen = CrewPointer.shared.screen, CrewPointer.shared.window === window { target = toLocal?(screen) }
            if let target { want = CGPoint(x: tanh((target.x - eyes.x) / 240), y: tanh((target.y - eyes.y) / 170)) }
        }
        let follow = 1 - exp(-12 * dt)
        look.x += (want.x - look.x) * follow
        look.y += (want.y - look.y) * follow

        let due = nextBlink ?? (t + 0.6 + random() * 3)
        nextBlink = due
        if t >= due { blinkStart = t; nextBlink = t + (random() < 0.18 ? 0.26 : 2.4 + random() * 3.8) }
        var pose = CrewPose(look: look, blink: CrewDrawing.blink(since: t - blinkStart))
        if watching {
            let typed = CrewGaze.shared.typedAt
            if typed > lastTyped { if typed.timeIntervalSince(lastTyped) > 2 { perkStart = t }; lastTyped = typed }
        }
        if motion { pose.addBody(time: t, phase: Double(index) * 1.7, floats: member.floats, perkAge: t - perkStart) }
        return pose
    }
}

/// A crew character with live eyes: `.full` is the whole character standing, `.bust` a round portrait for small spots.
/// Decorative (hidden from accessibility), never takes clicks, and draws nothing if the art is missing.
struct CrewAvatar: View {
    enum Style: Equatable {
        /// The whole character, `height` points tall. Leans, breathes and hovers (not under Reduce Motion).
        case full(height: CGFloat)
        /// A circular portrait on a tint of the character's colour. Eyes and blinks only: no body motion.
        case bust(diameter: CGFloat)
    }

    let character: CrewCharacter
    let style: Style
    /// Whether the eyes follow the pointer (and the caret while typing). Defaults to on from 40 pt up, where it reads.
    let watching: Bool
    /// Where to look when not watching, each axis -1 to 1 (nil looks straight ahead).
    let look: CGPoint?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var rig: CrewAvatarRig
    @State private var visible = true

    init(_ character: CrewCharacter, style: Style, watching: Bool? = nil, look: CGPoint? = nil) {
        self.character = character
        self.style = style
        switch style {
        case .full(let height): self.watching = watching ?? (height >= 40)
        case .bust(let diameter): self.watching = watching ?? (diameter >= 40)
        }
        self.look = look
        _rig = State(initialValue: CrewAvatarRig(salt: CrewCharacter.allCases.firstIndex(of: character) ?? 0))
    }

    var body: some View {
        let layout = Layout(character: character, style: style)
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !visible)) { timeline in
            Canvas { context, _ in
                guard let art = CrewFaces.loaded, let index = character.index, art.faces.members.indices.contains(index) else { return }
                let member = art.faces.members[index]
                guard member.frame.count >= 4, let (origin, scale) = layout.placement(for: member), !member.eyes.isEmpty else { return }
                let n = CGFloat(member.eyes.count)
                let mid = member.eyes.reduce(CGPoint.zero) { CGPoint(x: $0.x + $1.cx / n, y: $0.y + $1.cy / n) }
                let eyes = CGPoint(x: origin.x + mid.x * scale, y: origin.y + mid.y * scale)
                let pose = rig.pose(at: timeline.date, eyes: eyes, member: member, index: index, watching: watching, hint: look,
                                    motion: layout.motion && !reduceMotion)
                if layout.round { context.clip(to: Path(ellipseIn: CGRect(origin: .zero, size: layout.size))) }
                CrewDrawing.draw(member, image: art.images[index], pose: pose, origin: origin, scale: scale, in: &context)
            }
            .frame(width: layout.size.width, height: layout.size.height)
        }
        .frame(width: layout.size.width, height: layout.size.height)
        .background(CrewAvatarAnchor(rig: rig, watching: watching))
        .background { if layout.round { Circle().fill(character.color.opacity(0.16)) } }
        .onAppear { visible = true }
        .onDisappear { visible = false }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Where the art goes inside the view, for each style.
    struct Layout {
        let character: CrewCharacter
        let style: Style

        var round: Bool { if case .bust = style { true } else { false } }
        var motion: Bool { if case .full = style { true } else { false } }

        /// The view's size. The full style takes the layer's own proportions.
        @MainActor var size: CGSize {
            switch style {
            case .bust(let d): return CGSize(width: d, height: d)
            case .full(let h):
                guard let art = CrewFaces.loaded, let i = character.index, art.faces.members.indices.contains(i),
                      art.faces.members[i].frame.count >= 4, art.faces.members[i].frame[3] > 0 else { return CGSize(width: h * 0.6, height: h) }
                let f = art.faces.members[i].frame
                return CGSize(width: h * f[2] / f[3], height: h)
            }
        }

        /// The art's top-left in view points and the view points per art pixel.
        @MainActor func placement(for member: CrewFaces.Member) -> (CGPoint, CGFloat)? {
            let f = member.frame
            switch style {
            case .full(let h):
                guard f[3] > 0 else { return nil }
                let s = h / f[3]
                return (CGPoint(x: -f[0] * s, y: -f[1] * s), s)
            case .bust(let d):
                guard !member.eyes.isEmpty else { return nil }
                let n = CGFloat(member.eyes.count)
                let mx = member.eyes.reduce(0) { $0 + $1.cx / n }, my = member.eyes.reduce(0) { $0 + $1.cy / n }
                let spread = (member.eyes.map(\.cx).max() ?? 0) - (member.eyes.map(\.cx).min() ?? 0)
                let eyeWidth = member.eyes.reduce(0) { $0 + $1.rx * 2 / n }
                // the same crop for every character, in units of the face (eye span plus one eye): centred on the midpoint
                // between the eyes, and a little lower so the face and a bit of body fill the disc
                let side = max(spread + eyeWidth, 40) * 2.9
                let cx = mx, cy = my + side * 0.12
                let s = d / side
                return (CGPoint(x: -(cx - side / 2) * s, y: -(cy - side / 2) * s), s)
            }
        }
    }
}

/// Gives an avatar its coordinate mapping and starts the shared pointer monitor, without taking any clicks.
private struct CrewAvatarAnchor: NSViewRepresentable {
    let rig: CrewAvatarRig
    let watching: Bool
    func makeNSView(context: Context) -> Anchor { let v = Anchor(); v.rig = rig; v.watching = watching; return v }
    func updateNSView(_ view: Anchor, context: Context) { view.rig = rig; view.watching = watching }

    final class Anchor: NSView {
        weak var rig: CrewAvatarRig?
        var watching = false { didSet { if watching { MainActor.assumeIsolated { CrewPointer.shared.start() } } } }
        override var isFlipped: Bool { true }
        override func hitTest(_ point: NSPoint) -> NSView? { nil }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            rig?.window = window
            rig?.toLocal = { [weak self] screen in
                guard let self, let window = self.window else { return nil }
                return self.convert(window.convertPoint(fromScreen: screen), from: nil)
            }
            if watching { MainActor.assumeIsolated { CrewPointer.shared.start() } }
        }
    }
}
