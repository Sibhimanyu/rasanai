import AppKit
import ImageIO
import SwiftUI
import Heresay

// MARK: Colour

extension NSColor {
    static func rasanHex(_ value: UInt32, alpha: CGFloat = 1) -> NSColor {
        NSColor(srgbRed: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255,
                blue: CGFloat(value & 0xFF) / 255, alpha: alpha)
    }
}

extension Color {
    /// A restrained periwinkle accent, with a stronger shade for contrast on light surfaces.
    static let rasan = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0xA0A8FF) : .rasanHex(0x454DCE)
    })
    /// Primary controls use lilac with ink text in dark mode and indigo with white text in light mode.
    static let rasanFill = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x969EFF) : .rasanHex(0x454DCE)
    })
    static let rasanPrimaryLabel = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x141627) : .white
    })
    /// The reference design's charcoal canvas, with the system window surface in light mode.
    static let appBackground = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x181A1E) : .windowBackgroundColor
    })
    /// Turmeric, the brand's warm accent: note times, a waiting badge.
    static let turmeric = Color(nsColor: .rasanHex(0xEFB21A))
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
                // The same surface as every other library card; hover raises it, selection is drawn by the outline.
                shape.fill(hovering && !selected ? Workspace.raised : Workspace.panel)
                .background {
                    // Only the hovered card carries a blurred shadow; the rest of the grid has none to render while scrolling.
                    if hovering { shape.fill(Workspace.raised).shadow(color: .black.opacity(0.12), radius: 12, y: 5).transition(.opacity) }
                }
                .animation(.snappy(duration: 0.18), value: hovering)
            }
            .overlay {
                // Hover is a neutral raise with a faint edge, selection a firm neutral outline: brand blue is for the one primary action.
                shape.strokeBorder(selected ? Color.primary.opacity(0.85) : hovering ? Color.primary.opacity(0.22) : Workspace.hairline, lineWidth: selected ? 2 : 1)
                    .animation(.snappy(duration: 0.18), value: hovering)
            }
    }
}

extension View {
    func cardSurface(hovering: Bool = false, selected: Bool = false) -> some View {
        modifier(CardSurface(hovering: hovering, selected: selected))
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

// MARK: Buttons

/// Flat buttons drawn by the app: no gradient, no bevel, no inner shadow (the system bordered styles carry all three).
/// Sizes follow `controlSize`: small 26 pt, regular 32 pt, large 38 pt.
private func buttonMetrics(_ size: ControlSize) -> (height: CGFloat, font: CGFloat, padding: CGFloat) {
    switch size {
    case .mini, .small: (26, 12, 10)
    case .large, .extraLarge: (42, 14, 19)
    default: (36, 13, 15)
    }
}

/// The primary action: a lilac fill with an ink label in the dark workspace.
struct RasanPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.controlSize) private var controlSize
    func makeBody(configuration: Configuration) -> some View { FlatButton(configuration: configuration, enabled: isEnabled, size: controlSize) }
    private struct FlatButton: View {
        let configuration: Configuration
        let enabled: Bool
        let size: ControlSize
        @State private var hovering = false
        var body: some View {
            let m = buttonMetrics(size)
            configuration.label
                .font(.system(size: m.font, weight: .semibold))
                .foregroundStyle(Color.rasanPrimaryLabel.opacity(enabled ? 1 : 0.7))
                .padding(.horizontal, m.padding).frame(minHeight: m.height)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.rasanFill)
                    .brightness(configuration.isPressed ? -0.06 : hovering && enabled ? 0.06 : 0))
                .opacity(enabled ? 1 : 0.45)
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .onHover { hovering = $0 }
                .animation(.easeOut(duration: 0.12), value: hovering)
        }
    }
}

/// Everything else: a quiet outlined button that fills slightly on hover. Destructive roles read red.
struct RasanSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.controlSize) private var controlSize
    func makeBody(configuration: Configuration) -> some View { FlatButton(configuration: configuration, enabled: isEnabled, size: controlSize) }
    private struct FlatButton: View {
        let configuration: Configuration
        let enabled: Bool
        let size: ControlSize
        @State private var hovering = false
        var body: some View {
            let m = buttonMetrics(size)
            let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
            configuration.label
                .font(.system(size: m.font, weight: .medium))
                .foregroundStyle(!enabled ? Color.secondary : configuration.role == .destructive ? Color(nsColor: .systemRed) : Color.primary)
                .padding(.horizontal, m.padding).frame(minHeight: m.height)
                .background(shape.fill(Color.primary.opacity(configuration.isPressed ? 0.10 : hovering && enabled ? 0.06 : 0.0)))
                .overlay { shape.strokeBorder(Color.primary.opacity(enabled ? 0.16 : 0.08), lineWidth: 1) }
                .contentShape(shape)
                .onHover { hovering = $0 }
                .animation(.easeOut(duration: 0.12), value: hovering)
        }
    }
}

extension ButtonStyle where Self == RasanPrimaryButtonStyle { static var rasanPrimary: RasanPrimaryButtonStyle { .init() } }
extension ButtonStyle where Self == RasanSecondaryButtonStyle { static var rasanSecondary: RasanSecondaryButtonStyle { .init() } }

/// Kept for call sites that predate the flat styles.
typealias StudioSecondaryButtonStyle = RasanSecondaryButtonStyle

/// A flat two-to-four-way switch (Grid | List), drawn instead of the system segmented control. The selection is one pill
/// that slides to the option you pick on a soft spring, the labels cross-fading as it passes; Reduce Motion just swaps it.
/// A two- or three-way switch for how something is shown. The selected segment is a raised neutral, as in Finder's view
/// switch: the brand blue belongs to the page's one primary action, and a switch is never that.
struct FlatSegmented<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(Value, String, String?)]
    /// Symbols only, with the titles as tooltips and accessibility labels.
    var iconOnly = false
    @Namespace private var pill
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The pill's own copy of the selection. A binding into @AppStorage updates without the tap's animation, so the
    /// pill would jump; this one always moves with the spring.
    @State private var shown: Value?
    private var spring: Animation? { reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.86) }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options.indices, id: \.self) { index in
                let (value, title, symbol) = options[index]
                let on = value == (shown ?? selection)
                Button {
                    withAnimation(spring) { shown = value; selection = value }
                } label: {
                    HStack(spacing: 6) {
                        if let symbol { Image(systemName: symbol) }
                        if !iconOnly || symbol == nil { Text(title) }
                    }
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(on ? Color.primary : Color.secondary)
                    .padding(.horizontal, iconOnly ? 9 : 12).frame(height: 26)
                    .background {
                        if on {
                            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color.primary.opacity(0.12))
                                .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color.primary.opacity(0.10), lineWidth: 0.5) }
                                .matchedGeometryEffect(id: "selection", in: pill)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(title)
                .accessibilityLabel(title)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .onChange(of: selection) { _, value in if value != shown { withAnimation(spring) { shown = value } } }
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

// MARK: Help

let guideURL = URL(string: "https://sibhimanyu.github.io/rasanai/how-it-works.html")!

/// The `?` in every toolbar: two to four friendly lines about this screen, plus a link to the guide.
struct HelpButton: View {
    let title: String
    let lines: [String]
    /// A menu, not a popover: a popover anchored in a toolbar item has no anchor once the item collapses into the toolbar's
    /// overflow, and the button then does nothing. A menu always opens, and carries the way to tell the team (Heresay).
    var body: some View {
        Menu {
            Section(title) {
                ForEach(lines, id: \.self) { line in Text(line) }
            }
            Divider()
            Link(destination: guideURL) { Label("Open the guide", systemImage: "arrow.up.right.square") }
            Button { StudioFeedback.present() } label: { Label("Report a Problem…", systemImage: "exclamationmark.bubble") }
        } label: { Label("Help", systemImage: "questionmark.circle") }
        .menuIndicator(.hidden)
        .help("Help for this screen")
    }
}

// MARK: Images

/// Loads and downsamples a local image off the main thread.
struct PosterImage: View {
    let url: URL
    var maxPixels: CGFloat = 720
    @State private var image: NSImage?
    private struct Request: Hashable { let url: URL; let maxPixels: CGFloat }
    var body: some View {
        Group {
            if let image { Image(nsImage: image).resizable().scaledToFill() } else { Color.clear }
        }
        .task(id: Request(url: url, maxPixels: maxPixels)) {
            let thumbnail = await PosterThumbnailCache.shared.image(at: url, maxPixels: maxPixels)
            guard !Task.isCancelled else { return }
            image = thumbnail
        }
    }
}

/// 16:9 film thumbnail: the poster if the film has one, otherwise a soft indigo gradient with the film's initial.
/// The box is always 16:9; a portrait or square poster is cropped to fill it, never allowed to make the card taller.
struct FilmThumbnail: View {
    let name: String
    let poster: URL?
    var body: some View {
        Color.clear
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay {
                ZStack {
                    LinearGradient(colors: [Color.rasan.opacity(0.30), Color.rasan.opacity(0.10)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Text(String(name.trimmingCharacters(in: .whitespaces).first.map(String.init)?.uppercased() ?? "R"))
                        .font(.system(size: 38, weight: .semibold, design: .rounded)).foregroundStyle(Color.rasan.opacity(0.75))
                    if let poster { PosterImage(url: poster) }
                }
            }
            .clipped()
    }
}

/// m:ss, or h:mm:ss from an hour on, so a long-running film reads "73:02:34 elapsed", not "4382:34".
func clockText(_ seconds: Double) -> String {
    let total = Int(max(0, seconds.isFinite ? seconds : 0).rounded())
    if total >= 3600 { return "\(total / 3600):" + String(format: "%02d:%02d", total / 60 % 60, total % 60) }
    return "\(total / 60):" + String(format: "%02d", total % 60)
}
