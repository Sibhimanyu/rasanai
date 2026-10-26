import AppKit
import StudioCore
import SwiftUI

/// One thought bubble. Every word of it comes from the session (an activity title, a tool line, a source being read):
/// nothing is written here.
struct CrewThought: Identifiable, Equatable {
    enum Kind: Equatable { case say, find, dots }
    let id: String
    let kind: Kind
    let time: Date
    /// For a find: the host (or "Search"); empty for a plain thought.
    var source = ""
    let text: String
    /// A find from a page shows the site's initial; a search shows a magnifier.
    var isSearch = false
    /// A critic's note: the character knits her brows while it is live.
    var revising = false
}

enum CrewThoughts {
    static let maxOnScreen = 4

    /// The newest few real events of the phase on stage, newest first. Tara in Research shows the sources being read.
    static func make(_ s: FilmProgressSnapshot, lead: CrewCharacter) -> [CrewThought] {
        if lead == .tara, s.now.phase == .research, !s.research.sources.isEmpty {
            return s.research.sources.sorted { $0.time > $1.time }.prefix(maxOnScreen).map { source in
                let host = source.kind == .page ? source.host.replacingOccurrences(of: "www.", with: "") : "Search"
                var rest = source.kind == .page ? source.display : source.host
                if source.kind == .page, rest.hasPrefix(source.host) { rest = String(rest.dropFirst(source.host.count)) }
                if source.kind == .page, rest.hasPrefix("www.") { rest = "" }
                return CrewThought(id: "src-\(source.id)", kind: .find, time: source.time, source: host, text: rest.trimmingCharacters(in: CharacterSet(charactersIn: "/ ")),
                                   isSearch: source.kind == .search)
            }
        }
        let phase = s.now.phase
        let skipped: Set<ProgressActivity.Kind> = [.warning, .ask, .answer]
        var seen = Set<String>()
        let items = (s.activity + s.recentTools)
            .filter { $0.phase == phase && !skipped.contains($0.kind) && !$0.title.isEmpty }
            .sorted { $0.time > $1.time }
            .filter { seen.insert($0.title).inserted }
        return items.prefix(maxOnScreen).map { CrewThought(id: $0.id, kind: .say, time: $0.time, text: $0.title, revising: $0.kind == .critic) }
    }

    /// How many lines Kavi has written on his desk: one per real finished step (a helper that finished, a milestone), at most four.
    static func finishedSteps(_ s: FilmProgressSnapshot) -> Int {
        let phase = s.now.phase
        let helpers = s.crew.filter { $0.phase == phase && $0.state == .done }.count
        let milestones = s.activity.filter { $0.phase == phase && $0.kind == .milestone }.count
        return min(4, helpers + milestones)
    }

    /// The newest real preview picture, for Chitra's canvas and Rasika's frame.
    static func newestPicture(_ s: FilmProgressSnapshot) -> URL? { s.newestStill ?? s.keyframes.last?.url }
}

// MARK: Size

/// The size a bubble needs at its full text (measured with AppKit so the layout never waits on SwiftUI), and the colours.
enum BubbleMetrics {
    static var font: NSFont { .systemFont(ofSize: 16) }
        static let lineHeight: CGFloat = 16 * 1.35
    /// The font's own line height, so `lineSpacing` makes up the rest of the 1.35 and the rendered text matches the measured box.
    static var extraLeading: CGFloat { max(0, lineHeight - NSLayoutManager().defaultLineHeight(for: font)) }
    static let labelHeight: CGFloat = 14
    static let favicon: CGFloat = 34
    /// The speech card: its tail's height, the widest it grows, and its side padding.
    static let tailHeight: CGFloat = 8
    static let sayMaxWidth: CGFloat = 300
    static let sayPadX: CGFloat = 14
    /// Where the tail's centre sits, from the card's left edge.
    static let tailX: CGFloat = 28

    static func measure(_ text: String, width: CGFloat, font: NSFont = BubbleMetrics.font, lines: Int = 3) -> CGSize {
        guard !text.isEmpty else { return .zero }
        let style = NSMutableParagraphStyle(); style.minimumLineHeight = lineHeight; style.maximumLineHeight = lineHeight
        let rect = (text as NSString).boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin],
                                                   attributes: [.font: font, .paragraphStyle: style])
        return CGSize(width: ceil(rect.width), height: min(ceil(rect.height), lineHeight * CGFloat(lines)))
    }

    static func size(_ thought: CrewThought) -> CGSize {
        switch thought.kind {
        case .dots: return CGSize(width: 76, height: 40 + tailHeight)
        case .say:
            let font = NSFont.systemFont(ofSize: 14, weight: .medium)
            let text = measure(thought.text, width: 1000, font: font, lines: 1).width
            let caption = measure("59m ago", width: 200, font: .systemFont(ofSize: 11), lines: 1).width
            return CGSize(width: min(sayMaxWidth, max(text, caption) + 2 * sayPadX + 2), height: 12 + 14 + 3 + 19 + 12 + tailHeight)
        case .find:
            let full = thought.text.isEmpty ? thought.source : thought.source + ": " + thought.text
            // Measured in the semibold weight (the host is bold), which is the wider of the two.
            let bold = NSFont.systemFont(ofSize: 16, weight: .semibold)
            let area = min(298, max(90, measure(full, width: 298, font: bold).width + 10))
            let text = measure(full, width: area, font: bold)
            return CGSize(width: 36 + favicon + 12 + area, height: max(favicon, labelHeight + 3 + text.height) + 28)
        }
    }
}

// MARK: Shape

/// The scalloped squircle of a thought bubble: points on a squircle around the text box joined by outward arcs.
struct CloudShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        let cx = w / 2, cy = h / 2
        let perimeter = 2 * (w + h) * 0.9
        let n = max(8, Int((perimeter / 58).rounded()))
        func root(_ v: CGFloat) -> CGFloat { v < 0 ? -sqrt(-v) : sqrt(v) }
        let pts: [CGPoint] = (0..<n).map { i in
            let a = CGFloat(i) / CGFloat(n) * .pi * 2 - .pi / 2 + 0.2
            return CGPoint(x: rect.minX + cx + cx * root(cos(a)), y: rect.minY + cy + cy * root(sin(a)))
        }
        var path = Path()
        path.move(to: pts[0])
        for i in 1...n {
            let p0 = pts[i - 1], p1 = pts[i % n]
            let chord = hypot(p1.x - p0.x, p1.y - p0.y)
            guard chord > 0.01 else { continue }
            let r = chord * (0.6 + CGFloat(i % 3) * 0.05)
            // The SVG arc "A r r 0 0 1": the small arc, swept clockwise on screen (y down), bulging outward.
            let ux = (p1.x - p0.x) / chord, uy = (p1.y - p0.y) / chord
            let rise = sqrt(max(0, r * r - chord * chord / 4))
            let centre = CGPoint(x: (p0.x + p1.x) / 2 - uy * rise, y: (p0.y + p1.y) / 2 + ux * rise)
            let a0 = atan2(p0.y - centre.y, p0.x - centre.x)
            var a1 = atan2(p1.y - centre.y, p1.x - centre.x)
            while a1 <= a0 { a1 += .pi * 2 }
            let sweep = a1 - a0
            let k = 4 / 3 * tan(sweep / 4)
            let c1 = CGPoint(x: p0.x - k * r * sin(a0), y: p0.y + k * r * cos(a0))
            let c2 = CGPoint(x: p1.x + k * r * sin(a1), y: p1.y - k * r * cos(a1))
            path.addCurve(to: p1, control1: c1, control2: c2)
        }
        path.closeSubpath()
        return path
    }
}

/// A continuous rounded card with a small rounded tail under its bottom-left, pointing at the speaker's head.
struct SpeechCardShape: InsettableShape {
    var tail = true
    /// True for a card on the head's left: the tail sits at the bottom-right instead.
    var flip = false
    var inset: CGFloat = 0
    func inset(by amount: CGFloat) -> SpeechCardShape { var s = self; s.inset += amount; return s }
    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: inset, dy: inset)
        let th = tail ? BubbleMetrics.tailHeight : 0
        let card = CGRect(x: r.minX, y: r.minY, width: r.width, height: r.height - th)
        var p = Path(roundedRect: card, cornerRadius: 14, style: .continuous)
        if tail {
            let cx = flip ? r.maxX - BubbleMetrics.tailX : r.minX + BubbleMetrics.tailX, y = card.maxY
            var t = Path()
            let m: CGFloat = flip ? -1 : 1
            func pt(_ dx: CGFloat, _ dy: CGFloat) -> CGPoint { CGPoint(x: cx + m * dx, y: y + dy) }
            t.move(to: pt(-8, -1))
            t.addQuadCurve(to: pt(-3, th - 1), control: pt(-4, 1))
            t.addQuadCurve(to: pt(4, th * 0.55), control: pt(-1, th + 1))
            t.addQuadCurve(to: pt(8, -1), control: pt(5, 2))
            t.closeSubpath()
            p.addPath(t)
        }
        return p
    }
}

enum StageColors {
    static let accent = Color(red: 0x4B / 255, green: 0x4A / 255, blue: 0xCF / 255)
    static let accentDark = Color(red: 0xA9 / 255, green: 0xA8 / 255, blue: 1)
    static let quiet = Color(red: 0x9A / 255, green: 0x99 / 255, blue: 0xA8 / 255)
    static let ink = Color(red: 0x1D / 255, green: 0x1D / 255, blue: 0x1F / 255)
    static let darkInk = Color(red: 0xEC / 255, green: 0xEC / 255, blue: 0xF2 / 255)
    static let darkGlass = Color(red: 44 / 255, green: 44 / 255, blue: 52 / 255)

    /// A stable colour for a site's initial tile.
    static func favicon(_ host: String) -> Color {
        let palette: [UInt32] = [0x4B4ACF, 0xB3165A, 0x1E5A3C, 0xD9822B, 0x1F7A8C, 0x7A4BC4, 0x2A6FDB, 0x3F4368]
        let hash = host.unicodeScalars.reduce(UInt32(7)) { ($0 &* 31) &+ $1.value }
        return Color(nsColor: .rasanHex(palette[Int(hash % UInt32(palette.count))]))
    }
}

// MARK: Bubble view

/// A thought bubble's contents and skin at its full size. Position, scale and opacity are the stage's; this only draws.
struct CrewBubbleView: View {
    let thought: CrewThought
    let size: CGSize
    let live: Bool
    /// Seconds since the bubble first appeared (types in while it is live), and the clock for the caret and the dots.
    let age: Double
    let clock: Double
    let ago: String
    let dark: Bool
    let motion: Bool
    /// Which side of the head the card sits (1 = right: tail at its bottom-left, -1 = left: mirrored).
    var side: CGFloat = 1

    var body: some View {
        Group {
            switch thought.kind {
            case .dots: speechCard { dots }
            case .say: speechCard { sayContent }
            case .find: card
            }
        }
        .frame(width: size.width, height: size.height)
        .accessibilityHidden(true)
    }

    // The typed part of the text: dots first, then 35 characters a second (a long line never takes more than 1.5 s).
    private func typed(_ text: String, after start: Double) -> (text: String, done: Bool) {
        guard motion, live else { return (text, true) }
        let t = age - start
        if t < 0 { return ("", false) }
        let total = min(1.5, Double(text.count) / 35)
        let share = total <= 0 ? 1 : min(1, t / total)
        let count = Int((Double(text.count) * share).rounded(.down))
        return (String(text.prefix(count)), share >= 1)
    }

    private var inkColor: Color { dark ? StageColors.darkInk : StageColors.ink }
    private var labelColor: Color { live ? (dark ? StageColors.accentDark : StageColors.accent) : StageColors.quiet }
    private var caretOn: Bool { Int(clock * 2) % 2 == 0 }

    private var label: some View {
        Text(ago).font(.system(size: 11, weight: live ? .semibold : .regular)).foregroundStyle(labelColor)
    }

    private func caret(_ done: Bool) -> Text {
        guard live, motion, !done || age < 3 else { return Text("") }
        return Text("\u{258F}").foregroundColor(caretOn || !done ? (dark ? StageColors.accentDark : StageColors.accent) : .clear)
    }

    private var sayContent: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(ago).font(.system(size: 11)).foregroundStyle(StageColors.quiet).lineLimit(1)
            Text(thought.text).font(.system(size: 14, weight: .medium)).foregroundStyle(inkColor)
                .lineLimit(1).truncationMode(.tail)
        }
        .padding(.horizontal, BubbleMetrics.sayPadX)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var dots: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { i in
                let phase = motion ? (clock * 1.0 / 1.1 * 2 * .pi - Double(i) * 0.9) : 0
                let hop = motion ? max(0, sin(phase)) : 0
                Circle().fill(Color(red: 0xB9 / 255, green: 0xB8 / 255, blue: 0xC6 / 255)).frame(width: 7, height: 7)
                    .offset(y: -5 * hop).opacity(0.5 + 0.5 * hop)
            }
        }
        .padding(.vertical, 4)
    }

    /// The clean speech card: the app's glass in a continuous rounded shape, a hairline edge, a soft shadow, and a small tail
    /// (only on the live one) toward the speaker's head.
    private func speechCard<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        let shape = SpeechCardShape(tail: true, flip: side < 0)
        return content()
            .padding(.bottom, BubbleMetrics.tailHeight)
            .frame(width: size.width, height: size.height)
            .glassPanel(in: shape)
            .overlay { shape.strokeBorder(Color.white.opacity(dark ? 0.08 : 0.5), lineWidth: 0.5) }
            .shadow(color: .black.opacity(dark ? 0.35 : 0.12), radius: 10, y: 4)
            .frame(width: size.width, height: size.height, alignment: .top)
    }

    private var card: some View {
        let full = thought.text.isEmpty ? thought.source : thought.source + ": " + thought.text
        let t = typed(full, after: 0.12)
        let shown = t.text
        let head = String(shown.prefix(thought.source.count + (thought.text.isEmpty ? 0 : 1)))
        let tail = String(shown.dropFirst(head.count))
        return HStack(spacing: 12) {
            favicon
            VStack(alignment: .leading, spacing: 3) {
                label
                (Text(head).fontWeight(.semibold) + Text(tail) + caret(t.done))
                    .font(.system(size: 16)).lineSpacing(BubbleMetrics.extraLeading).lineLimit(3).multilineTextAlignment(.leading).foregroundStyle(inkColor)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .frame(width: size.width, height: size.height)
        .background {
            let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
            shape.fill(dark ? Color(red: 40 / 255, green: 40 / 255, blue: 48 / 255).opacity(0.85) : .white)
                .overlay { shape.strokeBorder(dark ? (live ? Color(red: 130 / 255, green: 128 / 255, blue: 1).opacity(0.55) : .white.opacity(0.1)) : .clear, lineWidth: 1) }
                .shadow(color: dark ? (live ? Color(red: 110 / 255, green: 108 / 255, blue: 1).opacity(0.4) : .black.opacity(0.5)) : Color(red: 60 / 255, green: 50 / 255, blue: 110 / 255).opacity(0.14),
                        radius: dark ? 12 : 9, y: dark && live ? 0 : 5)
        }
    }

    private var favicon: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(thought.isSearch ? Color(red: 0x3F / 255, green: 0x43 / 255, blue: 0x68 / 255) : StageColors.favicon(thought.source))
            if thought.isSearch {
                Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
            } else {
                Text(String(thought.source.first.map { String($0).uppercased() } ?? "?")).font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
            }
        }
        .frame(width: BubbleMetrics.favicon, height: BubbleMetrics.favicon)
    }
}

// MARK: Speech bubble (asking)

/// The asking character's speech bubble ("Gradient Pill"): a large-radius dark body with a short tail on the left edge at mouth height, a gradient outline
/// from the speaker's colour to the brand violet with a soft glow, the question (its last word tinted) and the context line inside.
struct CrewSpeechBubble: View {
    let text: String
    var subtitle: String?
    /// The speaker's colour; nil falls back to the brand violet.
    var tint: Color?
    /// Where the tail meets the bubble, from its vertical centre; nil keeps the tail near the top.
    var tailFromCenter: CGFloat?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    @State private var twinkle = false

    private var speaker: Color { tint ?? .rasan }
    /// The colour drawn on screen: on the dark bubble the character's colour is lifted until it reads (Kavi's indigo would vanish);
    /// on white the original, darker colour keeps its contrast.
    private var display: Color { scheme == .dark ? speaker.readableOnDark() : speaker }
    private var subtitleText: String? { (subtitle?.isEmpty ?? true) ? nil : subtitle }

    var body: some View {
        let dark = scheme == .dark
        let shape = SpeechShape(tailFromCenter: tailFromCenter)
        let ring = LinearGradient(colors: [display, .rasan], startPoint: .leading, endPoint: .trailing)
        HugWidthLayout(cap: 520 - 48 - SpeechShape.tailOut) {
            VStack(alignment: .leading, spacing: 5) {
                title(dark: dark)
                if let subtitleText {
                    Text(subtitleText)
                        .font(.system(size: 14))
                        .lineSpacing(2)
                        .foregroundStyle(dark ? Color.white.opacity(0.6) : Color.black.opacity(0.6))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 18)
        .padding(.leading, SpeechShape.tailOut)
        .background {
            ZStack {
                shape.stroke(ring, lineWidth: 3).blur(radius: 11).opacity(dark ? 0.4 : 0.22)
                shape.fill(dark
                           ? LinearGradient(colors: [Color(red: 0x20 / 255, green: 0x20 / 255, blue: 0x2A / 255), Color(red: 0x1B / 255, green: 0x1B / 255, blue: 0x24 / 255)], startPoint: .top, endPoint: .bottom)
                           : LinearGradient(colors: [.white, .white], startPoint: .top, endPoint: .bottom))
                shape.stroke(ring, lineWidth: 1.5)
            }
        }
        .overlay(alignment: .topLeading) {
            Image(systemName: "sparkle")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(display)
                .scaleEffect(reduceMotion ? 1 : (twinkle ? 1.12 : 0.82))
                .opacity(reduceMotion ? 1 : (twinkle ? 1 : 0.55))
                .offset(x: SpeechShape.tailOut - 12, y: -14)
                .accessibilityHidden(true)
        }
        .scaleEffect(reduceMotion ? 1 : (shown ? 1 : 0.9), anchor: .topLeading)
        .opacity(shown ? 1 : 0)
        .onAppear {
            pop()
            if !reduceMotion { withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) { twinkle = true } }
        }
        .onChange(of: text) { shown = false; pop() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(subtitleText.map { "\(text). \($0)" } ?? text)
        .accessibilityAddTraits(.isHeader)
    }

    /// The question with its last word (and trailing punctuation) in the speaker-to-violet gradient; a single word is all gradient.
    private func title(dark: Bool) -> some View {
        let ink = dark ? Color(red: 0xF4 / 255, green: 0xF4 / 255, blue: 0xF8 / 255) : StageColors.ink
        let accent = LinearGradient(colors: [display, .rasan], startPoint: .leading, endPoint: .trailing)
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let split = trimmed.lastIndex(of: " ")
        let head = split.map { String(trimmed[..<$0]) + " " } ?? ""
        let last = split.map { String(trimmed[trimmed.index(after: $0)...]) } ?? trimmed
        return (Text(head).foregroundColor(ink) + Text(last).foregroundStyle(accent))
            .font(.system(size: 22, weight: .semibold, design: .rounded))
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func pop() {
        DispatchQueue.main.async {
            if reduceMotion { withAnimation(.easeOut(duration: 0.2)) { shown = true } }
            else { withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { shown = true } }
        }
    }
}

/// Sizes its one child to its own tight width, capped: short text gives a short bubble, long text wraps at the cap.
private struct HugWidthLayout: Layout {
    var cap: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        return child.sizeThatFits(ProposedViewSize(width: min(proposal.width ?? cap, cap), height: nil))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let child = subviews.first else { return }
        let size = child.sizeThatFits(ProposedViewSize(width: min(bounds.width, cap), height: nil))
        child.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: size.width, height: size.height))
    }
}

/// One continuous outline: a large-radius body whose bottom-left corner sweeps down and left into a short curved tail.
struct SpeechShape: Shape {
    /// How far the tail reaches left of the body.
    static let tailOut: CGFloat = 14
    /// Where the tail meets the left edge, from the top: level with the speaker's mouth, not down at the feet.
    static let tailY: CGFloat = 38
    /// When set, the tail meets the left edge this far from the bubble's vertical centre (negative = above), instead of `tailY` from the top.
    var tailFromCenter: CGFloat?
    func path(in rect: CGRect) -> Path {
        let l = rect.minX + Self.tailOut, rt = rect.maxX, t = rect.minY, b = rect.maxY
        let r = max(10, min(28, (b - t) / 2))
        let k: CGFloat = 0.5523 * r
        let half: CGFloat = 9
        // Keep the tail on the straight run of the left edge, clear of both corners.
        let cy = min(max(tailFromCenter.map { (t + b) / 2 + $0 } ?? t + Self.tailY, t + r + half), max(t + r + half, b - r - half))
        var p = Path()
        p.move(to: CGPoint(x: l + r, y: t))
        p.addLine(to: CGPoint(x: rt - r, y: t))
        p.addCurve(to: CGPoint(x: rt, y: t + r), control1: CGPoint(x: rt - r + k, y: t), control2: CGPoint(x: rt, y: t + r - k))
        p.addLine(to: CGPoint(x: rt, y: b - r))
        p.addCurve(to: CGPoint(x: rt - r, y: b), control1: CGPoint(x: rt, y: b - r + k), control2: CGPoint(x: rt - r + k, y: b))
        p.addLine(to: CGPoint(x: l + r, y: b))
        p.addCurve(to: CGPoint(x: l, y: b - r), control1: CGPoint(x: l + r - k, y: b), control2: CGPoint(x: l, y: b - r + k))
        // Up the left edge to the tail root, sweep out to a tip that dips a little toward the speaker, and curl back in.
        p.addLine(to: CGPoint(x: l, y: cy + half))
        p.addCurve(to: CGPoint(x: rect.minX, y: cy + half + 4),
                   control1: CGPoint(x: l - 2, y: cy + half - 1), control2: CGPoint(x: rect.minX + 5, y: cy + half + 3))
        p.addCurve(to: CGPoint(x: l, y: cy - half),
                   control1: CGPoint(x: rect.minX + 7, y: cy + 2), control2: CGPoint(x: l - 2, y: cy - half + 3))
        p.addLine(to: CGPoint(x: l, y: t + r))
        p.addCurve(to: CGPoint(x: l + r, y: t), control1: CGPoint(x: l, y: t + r - k), control2: CGPoint(x: l + r - k, y: t))
        p.closeSubpath()
        return p
    }
}


extension Color {
    /// A display tint that always reads on a dark fill: brightness raised to at least 0.92, saturation capped at 0.75, then mixed
    /// toward white until the relative luminance reaches about 0.4 (so deep indigo, navy and forest green all become legible).
    func readableOnDark() -> Color {
        guard let rgb = NSColor(self).usingColorSpace(.sRGB) else { return self }
        var h: CGFloat = 0, sat: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        rgb.getHue(&h, saturation: &sat, brightness: &b, alpha: &a)
        var color = NSColor(hue: h, saturation: min(sat, 0.75), brightness: max(b, 0.92), alpha: a)
        func luminance(_ c: NSColor) -> CGFloat {
            func lin(_ v: CGFloat) -> CGFloat { v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
            return 0.2126 * lin(c.redComponent) + 0.7152 * lin(c.greenComponent) + 0.0722 * lin(c.blueComponent)
        }
        var steps = 0
        while luminance(color) < 0.4, steps < 20, let mixed = color.blended(withFraction: 0.08, of: .white) {
            color = mixed.usingColorSpace(.sRGB) ?? mixed
            steps += 1
        }
        return Color(nsColor: color)
    }
}
