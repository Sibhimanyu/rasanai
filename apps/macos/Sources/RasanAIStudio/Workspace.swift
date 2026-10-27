import AppKit
import StudioCore
import SwiftUI

// MARK: Palette

/// The film workspace: a dark canvas with inset panels (stage, inspector, filmstrip, action bar), like an editing app.
/// Light mode keeps the same structure on a grey canvas with white panels.
enum Workspace {
    static let canvas = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x181A1E) : .rasanHex(0xF0F1F5)
    })
    static let panel = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x202328) : .rasanHex(0xFFFFFF)
    })
    static let raised = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x292D35) : .rasanHex(0xF4F4F6)
    })
    static let hairline = Color.primary.opacity(0.10)
    static let sidebar = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x181A1E) : .rasanHex(0xF3F3F6)
    })
    static let radius: CGFloat = 12
    /// The corners of the window's floating glass sidebar; the glass chrome on the film page matches them.
    static let glassRadius: CGFloat = 18
    static let gap: CGFloat = 12
    /// The one outer gutter of the film page: left, right, top and bottom of everything on the canvas. The film page applies
    /// it once around the stage, the inspector and the status bar, so no stage page adds outer padding of its own.
    /// The space between the window's sidebar and the stage, between the stage and the inspector (`columnGap`) and between
    /// the inspector and the window edge are all this one value.
    static let pageInset: CGFloat = 20
    /// Between a page's left and right columns, and between the stage and the open inspector. Equal to `pageInset`.
    static let columnGap: CGFloat = pageInset
    /// Inside a workspace panel (a card of content) that holds a page's main content.
    static let panelPadding: CGFloat = 16
    /// The one bottom bar (the shell's status bar and the film page's bar): the same minimum height, corner radius and
    /// outer inset on every page, so swapping pages changes only what is inside it.
    static let barHeight: CGFloat = 44
    static let barRadius: CGFloat = 20
    /// Distance from the bar to the left, right and bottom edges of the page (the film page's gutter).
    static let barInset: CGFloat = pageInset
    /// Room a page reserves below its content for a floating bar: the bar, its inset and the gap above it.
    static let barReserve: CGFloat = barHeight + barInset + gap
}

struct WorkspacePanel: ViewModifier {
    var padding: CGFloat = 0
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous)
        content
            .padding(padding)
            .background(Workspace.panel, in: shape)
            .clipShape(shape)
            .overlay { shape.strokeBorder(Workspace.hairline, lineWidth: 1) }
    }
}

/// The sidebar, inspector and action chrome use the shared soft glass (SoftGlass.swift).
struct GlassPanel<S: InsettableShape>: ViewModifier {
    let shape: S
    func body(content: Content) -> some View {
        content.softGlass(in: shape).clipShape(shape)
    }
}

extension Workspace {
    /// The left column of the two-column stages (crew header over a panel). At least 440 wide, so the widest character
    /// (Rasika, about 182) plus the speech bubble's minimum (240) always fits; an overflow there used to be centred and
    /// pushed the whole column into the left gutter.
    static func leftColumn(for width: CGFloat) -> CGFloat { min(480, max(440, width * 0.36)) }
}

extension View {
    func glassPanel(radius: CGFloat = Workspace.glassRadius) -> some View { modifier(GlassPanel(shape: RoundedRectangle(cornerRadius: radius, style: .continuous))) }
    func glassPanel(in shape: some InsettableShape) -> some View { modifier(GlassPanel(shape: shape)) }
    func workspacePanel(padding: CGFloat = 0) -> some View { modifier(WorkspacePanel(padding: padding)) }
    /// The shared chrome of the bottom bar: full width, same minimum height, same glass and corners, same inner left edge.
    func studioBottomBar(trailing: CGFloat = 7) -> some View {
        padding(.leading, 16).padding(.trailing, trailing).padding(.vertical, 7)
            .frame(maxWidth: .infinity, minHeight: Workspace.barHeight)
            .glassPanel(radius: Workspace.barRadius)
    }
}

// MARK: Filmstrip

/// The scenes as an editor's filmstrip: equal frames, a numbered pin above each, its start time below. The scene on the
/// playhead is outlined in the neutral highlight with a filled pin; a scene with an open note carries an amber dot.
struct SceneFilmstrip<P: FilmPlayback>: View {
    let playback: P
    let scenes: [FilmScene]
    let open: [ReviewNote]

    var body: some View {
        let current = FilmTiming.sceneIndex(at: playback.time, in: scenes)
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(Array(scenes.enumerated()), id: \.element.id) { index, scene in
                        FilmstripCell(scene: scene, number: index + 1, current: index == current,
                                      progress: index == current ? FilmTiming.progress(at: playback.time, in: scene) : 0,
                                      hasNote: open.contains { FilmTiming.sceneIndex(of: $0, in: scenes) == index }) { playback.seek(to: scene.start) }
                            .id(index)
                    }
                }
                .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 4)
            }
            .onChange(of: current) { _, index in if let index { withAnimation(.smooth) { proxy.scrollTo(index, anchor: .center) } } }
        }
    }
}

private struct FilmstripCell: View {
    let scene: FilmScene
    let number: Int
    let current: Bool
    let progress: Double
    let hasNote: Bool
    let action: () -> Void
    @State private var hovering = false
    private let size = CGSize(width: 168, height: 84)

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                ZStack {
                    Circle().fill(current ? Color.primary : Workspace.raised)
                        .overlay { Circle().strokeBorder(current ? .clear : Workspace.hairline, lineWidth: 1) }
                    Text("\(number)").font(.system(size: 11, weight: .bold)).foregroundStyle(current ? Color(nsColor: .windowBackgroundColor) : Color.primary)
                }
                .frame(width: current ? 26 : 22, height: current ? 26 : 22)
                .frame(width: size.width, height: 26)
                ZStack(alignment: .bottomLeading) {
                    if let path = scene.thumbnail { PayloadImage(path: path, contentMode: .fill, maxPixels: 420).frame(width: size.width, height: size.height).clipped() }
                    else {
                        ZStack { Workspace.raised; Image(systemName: "photo").foregroundStyle(.tertiary) }
                    }
                    if current {
                        GeometryReader { box in Rectangle().fill(Color.white.opacity(0.85)).frame(width: box.size.width * progress, height: 3).frame(maxHeight: .infinity, alignment: .bottom) }
                    }
                }
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(current ? Color.primary : Color.primary.opacity(hovering ? 0.3 : 0.06), lineWidth: current ? 2 : 1) }
                .overlay(alignment: .topTrailing) {
                    if hasNote { Circle().fill(Color.turmeric).frame(width: 9, height: 9).overlay { Circle().strokeBorder(.black.opacity(0.5), lineWidth: 1) }.padding(5) }
                }
                Text(reviewTime(scene.start)).font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.snappy(duration: 0.15), value: current)
        .help("\(number). \(scene.title) · \(Int(scene.duration.rounded())) s")
        .accessibilityLabel("Scene \(number), \(scene.title), starts at \(reviewTime(scene.start))")
        .accessibilityAddTraits(current ? [.isSelected] : [])
    }
}

/// True while the page on screen draws its own bottom bar; the shell's status bar steps aside only then.
struct PageOwnsBottomBarKey: PreferenceKey {
    static let defaultValue = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value || nextValue() }
}
