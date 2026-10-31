import AppKit
import SwiftUI

/// What the cards need to take part in Home's reveal: the shared namespace the posters are matched in (keyed by project
/// URL, never by index), whether this side is the matched source, and whether the late chrome has come in. Absent
/// (nil) everywhere else, so other callers of the cards are unchanged.
struct HomeHero {
    let namespace: Namespace.ID
    /// Exactly one side of each poster id is the source: the preview while resting, the films while open.
    var isSource: Bool
    var revealed: Bool
}

extension View {
    /// Matches a poster's frame with its twin on the other side of the reveal, so one picture travels and grows.
    @ViewBuilder func matchedPoster(_ id: URL?, hero: HomeHero?) -> some View {
        if let hero, let id { matchedGeometryEffect(id: id, in: hero.namespace, properties: .frame, isSource: hero.isSource) } else { self }
    }
}

/// Headings, menus and card chrome: hidden until the posters are nearly home, gone first on the way back.
struct HomeReveal: ViewModifier {
    let hero: HomeHero?
    @State private var visible = false
    @ViewBuilder func body(content: Content) -> some View {
        if let hero {
            content
                .opacity(visible ? 1 : 0)
                .animation(HomeTransitionMetrics.reveal(opening: hero.revealed), value: visible)
                .task(id: hero.revealed) {
                    guard hero.revealed else { visible = false; return }
                    // Insert hidden first, then animate: a newly mounted view has no previous opacity to interpolate.
                    do { try await Task.sleep(for: .milliseconds(24)) } catch { return }
                    guard !Task.isCancelled else { return }
                    visible = true
                }
        } else { content }
    }
}

/// The mask stays fixed to the viewport while the actual cards move through it. No moving rectangular backing surface.
struct HomeViewportFade: View {
    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom).frame(height: 56)
            Rectangle().fill(.black)
            LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: 96)
        }
        .allowsHitTesting(false)
    }
}

/// The collapsed peek has one clear keyboard/click target, independent of the permanently mounted cards underneath.
struct HomePeekOpener: View {
    let expanded: Bool
    let show: () -> Void
    var body: some View {
        Button(action: show) {
            Image(systemName: "chevron.up").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                .frame(width: HomeTransitionMetrics.columnWidth, height: 48, alignment: .top)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.bottom, HomeTransitionMetrics.dockedBottom)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .opacity(expanded ? 0 : 1)
        .animation(.easeOut(duration: 0.15), value: expanded)
        .allowsHitTesting(!expanded).accessibilityHidden(expanded).disabled(expanded)
        .help("Show your films").accessibilityLabel("Show your films")
    }
}

/// Home's complete ambient wash. StudioView hosts it once behind both split-view columns.
struct HomeAmbientGlow: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(HomeMeshClock.self) private var clock
    @State private var appHidden = false
    private var animates: Bool { !reduceMotion && !appHidden }

    var body: some View {
        HomeWindowAmbientField()
        .onAppear { appHidden = NSApp.isHidden }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didHideNotification)) { _ in appHidden = true }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didUnhideNotification)) { _ in appHidden = false }
        .task(id: animates) {
            guard animates else { return }
            await clock.run()
        }
    }
}

/// Renders one window-sized field and offsets it into each clipped column, so the sidebar and detail sample identical
/// colors at their shared edge instead of restarting the mesh at each column's local origin.
struct HomeWindowAmbientField: View {
    @Environment(HomeMeshClock.self) private var clock

    var body: some View {
        GeometryReader { geometry in
            let origin = geometry.frame(in: .named("studioBackdrop")).origin
            let size = clock.viewportSize
            ZStack(alignment: .topLeading) {
                HomeMeshWash()
                    .frame(width: size.width, height: size.height)
                    .offset(x: -origin.x, y: -origin.y)
                HomeBottomGlow(viewportHeight: size.height)
                    .frame(width: size.width, height: size.height)
                    .offset(x: -origin.x, y: -origin.y)
            }
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
            .clipped()
        }
        .allowsHitTesting(false).accessibilityHidden(true)
    }
}

/// The static low blue light at Home's foot, shared with the sidebar extension.
struct HomeBottomGlow: View {
    let viewportHeight: CGFloat
    var body: some View {
        ZStack {
            LinearGradient(stops: [.init(color: .clear, location: 0),
                                   .init(color: Color(red: 0.45, green: 0.60, blue: 0.88).opacity(0.025), location: 0.38),
                                   .init(color: Color(red: 0.45, green: 0.60, blue: 0.88).opacity(0.08), location: 1)],
                           startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Color(red: 0.45, green: 0.60, blue: 0.88).opacity(0.06), .clear],
                           center: .bottom, startRadius: 0, endRadius: max(viewportHeight * 0.55, 200))
        }
        .frame(height: viewportHeight * 0.42)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }
}

/// A quiet, phase-locked continuation of Home's wash under the floating sidebar glass.
struct HomeSidebarAmbientGlow: View {
    var body: some View { HomeWindowAmbientField() }
}

/// A quiet way back from the films to the prompt.
struct HomeReturnButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Label("New film", systemImage: "chevron.up").font(.system(size: 12.5, weight: .medium)).foregroundStyle(.secondary)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .softGlass(in: Capsule(), opacity: 0.9)
                .overlay { Capsule().strokeBorder(Color.primary.opacity(0.10), lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .help("Back to the prompt").accessibilityLabel("New film").accessibilityHint("Returns to the prompt")
    }
}
