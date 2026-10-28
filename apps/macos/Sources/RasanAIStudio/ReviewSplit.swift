import StudioCore
import SwiftUI

/// Windows at least this wide use the split layout.
let reviewSplitThreshold: CGFloat = 1000

/// The Look page's wide arrangement for the review players (Preview, Final): the crew header and a fixed panel on the left,
/// the player filling the right column. Everything sits inside the safe area, above the floating bottom bar.
struct ReviewSplit<Panel: View, Player: View>: View {

    let size: CGSize
    let question: String
    var context: String?
    let step: String
    var compactHeader = false
    @ViewBuilder var panel: Panel
    @ViewBuilder var player: Player

    var body: some View {
        let left = Workspace.leftColumn(for: size.width)
        HStack(alignment: .top, spacing: Workspace.columnGap) {
            VStack(alignment: .leading, spacing: 0) {
                StageHeader(question: question, context: context, step: step, compact: compactHeader)
                    .padding(.bottom, 12)
                panel
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .workspacePanel()
            }
            .frame(width: left, alignment: .leading)
            .frame(maxHeight: .infinity, alignment: .top)

            // The frame gets the column's height minus the scrubber and transport underneath it.
            player
                .environment(\.reviewFrameHeight, max(200, size.height - 174))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
    }
}

/// The Storyboard step's wide arrangement: the crew header and a fixed summary panel on the left, the storyboard board filling
/// the right in its own fixed panel (the board scrolls inside).
struct StoryboardSplit<Panel: View, Board: View>: View {
    let size: CGSize
    let question: String
    var context: String?
    let step: String
    @ViewBuilder var panel: Panel
    @ViewBuilder var board: Board

    var body: some View {
        let left = Workspace.leftColumn(for: size.width)
        HStack(alignment: .top, spacing: Workspace.columnGap) {
            VStack(alignment: .leading, spacing: 0) {
                StageHeader(question: question, context: context, step: step)
                    .padding(.bottom, 12)
                panel
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .workspacePanel()
            }
            .frame(width: left, alignment: .leading)
            .frame(maxHeight: .infinity, alignment: .top)

            board
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .workspacePanel()
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
    }
}

/// The scenes as a vertical list: number, thumbnail at the film's aspect, time range, and the line. The scene on the playhead is
/// highlighted; a click seeks the player. Scrolls inside its panel.
struct SceneList<P: FilmPlayback>: View {
    let playback: P
    let scenes: [FilmScene]
    let open: [ReviewNote]
    let aspect: Double

    var body: some View {
        let current = FilmTiming.sceneIndex(at: playback.time, in: scenes)
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(Array(scenes.enumerated()), id: \.element.id) { index, scene in
                        SceneListRow(scene: scene, number: index + 1, current: index == current, aspect: aspect,
                                     progress: index == current ? FilmTiming.progress(at: playback.time, in: scene) : 0,
                                     hasNote: open.contains { FilmTiming.sceneIndex(of: $0, in: scenes) == index }) {
                            playback.seek(to: scene.start)
                        }
                        .id(index)
                    }
                }
                .padding(10)
            }
            .onChange(of: current) { _, index in if let index { withAnimation(.smooth) { proxy.scrollTo(index, anchor: .center) } } }
        }
        .accessibilityLabel("Scenes")
    }
}

private struct SceneListRow: View {
    let scene: FilmScene
    let number: Int
    let current: Bool
    let aspect: Double
    let progress: Double
    let hasNote: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        let ratio = min(max(aspect, 0.5), 2.4)
        let width: CGFloat = 96
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        Button(action: action) {
            HStack(alignment: .top, spacing: 10) {
                Text("\(number)").font(.system(size: 11, weight: .bold)).monospacedDigit()
                    .foregroundStyle(current ? Color(nsColor: .windowBackgroundColor) : Color.primary)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(current ? Color.primary : Workspace.raised))
                    .overlay { Circle().strokeBorder(current ? .clear : Workspace.hairline, lineWidth: 1) }
                ZStack(alignment: .bottomLeading) {
                    if let path = scene.thumbnail { PayloadImage(path: path, contentMode: .fill, maxPixels: 420) }
                    else { ZStack { Workspace.raised; Image(systemName: "photo").foregroundStyle(.tertiary) } }
                    if current {
                        GeometryReader { box in
                            Rectangle().fill(Color.white.opacity(0.85)).frame(width: box.size.width * progress, height: 3)
                                .frame(maxHeight: .infinity, alignment: .bottom)
                        }
                    }
                }
                .frame(width: width, height: width / ratio)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    if hasNote { Circle().fill(Color.turmeric).frame(width: 9, height: 9).overlay { Circle().strokeBorder(.black.opacity(0.5), lineWidth: 1) }.padding(4) }
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(reviewTime(scene.start) + " – " + reviewTime(scene.end))
                        .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
                    Text(scene.title.isEmpty ? "Scene \(number)" : scene.title)
                        .font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    if !scene.line.isEmpty {
                        Text(scene.line).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(8)
            .background(shape.fill(current ? Color.primary.opacity(0.08) : hovering ? Color.primary.opacity(0.04) : .clear))
            .overlay { shape.strokeBorder(current ? Color.primary.opacity(0.35) : .clear, lineWidth: 1) }
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.snappy(duration: 0.15), value: current)
        .help("\(number). \(scene.title) · \(Int(scene.duration.rounded())) s")
        .accessibilityLabel("Scene \(number), \(scene.title), starts at \(reviewTime(scene.start))")
        .accessibilityAddTraits(current ? [.isSelected] : [])
    }
}
