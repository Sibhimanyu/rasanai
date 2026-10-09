import AppKit
import ImageIO
import SwiftUI

// MARK: Colour

extension NSColor {
    static func rasanHex(_ value: UInt32, alpha: CGFloat = 1) -> NSColor {
        NSColor(srgbRed: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255,
                blue: CGFloat(value & 0xFF) / 255, alpha: alpha)
    }
}

extension Color {
    /// RasanAI indigo, brightened in light mode so it works as a tint, and lifted in dark mode.
    static let rasan = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x9AA0FF) : .rasanHex(0x2A31A8)
    })
    /// The logo's ink. Light-mode headers only.
    static let rasanDeep = Color(nsColor: .rasanHex(0x1B1F5E))
    /// The mark itself: deep ink in light mode, white in dark mode.
    static let rasanInk = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .white : .rasanHex(0x1B1F5E)
    })
    static func hex(_ string: String) -> Color? {
        var text = string.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
        return Color(nsColor: .rasanHex(value))
    }
}

/// Kept so the sample-film views and older files keep compiling; every value maps onto the calm palette.
enum StudioPalette {
    static let background = Color(nsColor: .windowBackgroundColor)
    static let panel = Color(nsColor: .controlBackgroundColor)
    static let raised = Color(nsColor: .underPageBackgroundColor)
    static let ink = Color.primary
    static let muted = Color.secondary
    static let accent = Color.rasan
    static let mint = Color(nsColor: .systemGreen)
    static let divider = Color(nsColor: .separatorColor)
}

// MARK: Mark

struct RasanMark: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let sx = rect.width / 102, sy = rect.height / 126
        p.move(to: CGPoint(x: 0, y: 0))
        for point in [(102.0, 0.0), (102, 62), (38, 126), (23.858, 111.858), (82, 53.716), (82, 20), (20, 20), (20, 82), (0, 82)] {
            p.addLine(to: CGPoint(x: point.0 * sx, y: point.1 * sy))
        }
        p.closeSubpath()
        p.move(to: CGPoint(x: 36 * sx, y: 31 * sy))
        p.addLine(to: CGPoint(x: 60 * sx, y: 46 * sy))
        p.addLine(to: CGPoint(x: 36 * sx, y: 61 * sy))
        p.closeSubpath()
        return p
    }
}

// MARK: Surfaces

/// Hover feedback lives in the card's background (border and shadow) only. Moving, scaling or fading the content, or
/// shadowing it as a whole, re-rasterises its text at fractional positions and snaps it back when the pointer leaves,
/// which reads as flickering text.
struct CardSurface: ViewModifier {
    var hovering = false
    var selected = false
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        content
            .background {
                ZStack {
                    shape.fill(Color(nsColor: .controlBackgroundColor).opacity(0.6))
                    shape.fill(.regularMaterial)
                }
                .shadow(color: .black.opacity(hovering ? 0.12 : 0), radius: 12, y: 5)
                .animation(.snappy(duration: 0.18), value: hovering)
            }
            .overlay {
                shape.strokeBorder(selected || hovering ? Color.rasan.opacity(0.55) : Color(nsColor: .separatorColor), lineWidth: selected ? 1.5 : 0.5)
                    .animation(.snappy(duration: 0.18), value: hovering)
            }
    }
}

extension View {
    func cardSurface(hovering: Bool = false, selected: Bool = false) -> some View {
        modifier(CardSurface(hovering: hovering, selected: selected))
    }
}

/// A button that reads as a card, with a hover lift.
struct HoverCard<Content: View>: View {
    let action: () -> Void
    @ViewBuilder var content: (Bool) -> Content
    @State private var hovering = false
    var body: some View {
        Button(action: action) {
            content(hovering).cardSurface(hovering: hovering)
        }
        .buttonStyle(PressableStyle())
        .onHover { hovering = $0 }
    }
}

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.snappy(duration: 0.12), value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

// MARK: Cursor

/// Shows `cursor` while the pointer is over the view. It balances its own push and pop, including when the view goes
/// away under the pointer (clicking a brief token swaps it for a field) or stops being clickable, so the cursor never
/// sticks after the pointer leaves.
struct HoverCursor: ViewModifier {
    let cursor: NSCursor
    var enabled = true
    @State private var pushed = false
    func body(content: Content) -> some View {
        content
            .onHover { inside in update(inside && enabled) }
            .onChange(of: enabled) { _, on in if !on { update(false) } }
            .onDisappear { update(false) }
    }
    private func update(_ want: Bool) {
        if want, !pushed { cursor.push(); pushed = true } else if !want, pushed { NSCursor.pop(); pushed = false }
    }
}

extension View {
    func hoverCursor(_ cursor: NSCursor, enabled: Bool = true) -> some View { modifier(HoverCursor(cursor: cursor, enabled: enabled)) }
}

// MARK: Status

enum StatusTone { case good, warn, bad, quiet }

struct StatusDot: View {
    let tone: StatusTone
    var pulsing = false
    @State private var pulse = false
    var color: Color {
        switch tone {
        case .good: Color(nsColor: .systemGreen)
        case .warn: Color(nsColor: .systemOrange)
        case .bad: Color(nsColor: .systemRed)
        case .quiet: Color(nsColor: .tertiaryLabelColor)
        }
    }
    var body: some View {
        // The repeating animation is scoped to the dot's opacity. Started with `withAnimation` in `onAppear`, it would
        // also repeat whatever else changed in that update (the row's layout and text).
        Circle().fill(color).frame(width: 7, height: 7)
            .opacity(pulsing && pulse ? 0.35 : 1)
            .animation(pulsing ? .easeInOut(duration: 0.9).repeatForever(autoreverses: true) : .default, value: pulse)
            .onAppear { pulse = pulsing }
            .onChange(of: pulsing) { _, now in pulse = now }
    }
}

// MARK: Help

let guideURL = URL(string: "https://sibhimanyu.github.io/rasanai/guide.html")!

/// The `?` in every toolbar: two to four friendly lines about this screen, plus a link to the guide.
struct HelpButton: View {
    let title: String
    let lines: [String]
    @State private var shown = false
    var body: some View {
        Button { shown.toggle() } label: { Image(systemName: "questionmark.circle") }
            .help("Help for this screen")
            .popover(isPresented: $shown, arrowEdge: .bottom) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(title).font(.system(size: 13, weight: .semibold))
                    ForEach(lines, id: \.self) { line in
                        Text(line).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    Divider()
                    Link(destination: guideURL) { Label("Open the guide", systemImage: "arrow.up.right.square") }
                        .font(.system(size: 12))
                }
                .padding(16).frame(width: 280, alignment: .leading)
            }
    }
}

// MARK: Images

/// Loads and downsamples a local image off the main thread.
struct PosterImage: View {
    let url: URL
    var maxPixels: CGFloat = 720
    @State private var image: NSImage?
    var body: some View {
        Group {
            if let image { Image(nsImage: image).resizable().scaledToFill() } else { Color.clear }
        }
        .task(id: url) {
            let size = maxPixels
            image = await Task.detached(priority: .utility) { () -> NSImage? in
                guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
                let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                                kCGImageSourceCreateThumbnailWithTransform: true,
                                                kCGImageSourceThumbnailMaxPixelSize: size]
                guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
                return NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
            }.value
        }
    }
}

/// 16:9 film thumbnail: the poster if the film has one, otherwise a soft indigo gradient with the film's initial.
struct FilmThumbnail: View {
    let name: String
    let poster: URL?
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.rasan.opacity(0.30), Color.rasan.opacity(0.10)], startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(String(name.trimmingCharacters(in: .whitespaces).first.map(String.init)?.uppercased() ?? "R"))
                .font(.system(size: 38, weight: .semibold, design: .rounded)).foregroundStyle(Color.rasan.opacity(0.75))
            if let poster { PosterImage(url: poster) }
        }
        .aspectRatio(16.0 / 9.0, contentMode: .fit)
        .clipped()
    }
}

/// m:ss, or h:mm:ss from an hour on, so a long-running film reads "73:02:34 elapsed", not "4382:34".
func clockText(_ seconds: Double) -> String {
    let total = Int(max(0, seconds.isFinite ? seconds : 0).rounded())
    if total >= 3600 { return "\(total / 3600):" + String(format: "%02d:%02d", total / 60 % 60, total % 60) }
    return "\(total / 60):" + String(format: "%02d", total % 60)
}
