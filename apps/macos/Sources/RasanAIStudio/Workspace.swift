import AppKit
import StudioCore
import SwiftUI

// MARK: Palette

/// The film workspace: a dark canvas with inset panels (stage, inspector, filmstrip, action bar), like an editing app.
/// Light mode keeps the same structure on a grey canvas with white panels.
enum Workspace {
    static let canvas = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x0E0F12) : .rasanHex(0xE9E9EC)
    })
    static let panel = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x17181C) : .rasanHex(0xFFFFFF)
    })
    static let raised = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0x1F2025) : .rasanHex(0xF4F4F6)
    })
    static let hairline = Color.primary.opacity(0.08)
    /// Timestamps on notes: warm, so a note's time reads at a glance against the cool chrome.
    static let amber = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .rasanHex(0xF2B33D) : .rasanHex(0xB7791F)
    })
    static let radius: CGFloat = 12
    static let gap: CGFloat = 12
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

extension View {
    func workspacePanel(padding: CGFloat = 0) -> some View { modifier(WorkspacePanel(padding: padding)) }
}

/// Set by a stage that lays out its own panels (player, filmstrip), so the film page does not wrap it in one more.
struct StageDrawsPanelsKey: PreferenceKey {
    static var defaultValue: Bool { false }
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value || nextValue() }
}

// MARK: Header

/// The film page's header row: back, the film's name and facts, the five calls, and the inspector button. It replaces the
/// window toolbar on film pages, so there is one header and nothing above the panels repeats it.
struct FilmHeader<Trailing: View>: View {
    let title: String
    let facts: String
    var stepper: FilmStepper?
    var decisionsOn: Bool
    var onBack: () -> Void
    var onDecisions: (() -> Void)?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 16) {
            Button(action: onBack) { Image(systemName: "arrow.left").font(.system(size: 15, weight: .medium)).frame(width: 28, height: 28).contentShape(Rectangle()) }
                .buttonStyle(.plain).help("Back to your films").accessibilityLabel("Back")
                .keyboardShortcut("[", modifiers: .command)
            Text(title).font(.system(size: 22, weight: .semibold)).tracking(-0.3).lineLimit(1).truncationMode(.tail)
                .layoutPriority(1)
            if !facts.isEmpty {
                separator
                Text(facts).font(.system(size: 13)).foregroundStyle(.secondary).monospacedDigit().lineLimit(1).fixedSize()
            }
            if let stepper {
                separator
                stepper
            }
            Spacer(minLength: 12)
            if let onDecisions {
                separator
                Button(action: onDecisions) {
                    Label("Decisions", systemImage: "list.bullet").font(.system(size: 13, weight: .medium))
                        .padding(.horizontal, 12).frame(height: 32)
                        .background(decisionsOn ? Color.rasan.opacity(0.14) : Workspace.raised, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
                        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain).help("Every decision on this film (⌥⌘D)")
                .keyboardShortcut("d", modifiers: [.command, .option])
            }
            trailing
        }
        .frame(height: 44)
    }

    private var separator: some View { Rectangle().fill(Workspace.hairline).frame(width: 1, height: 22) }
}

// MARK: Stepper

/// The five calls, as in an editor's header: done calls are ticked outlines, the current one is a filled number, the rest are
/// quiet outlined numbers. A done call can be opened read-only.
struct FilmStepper: View {
    let current: ReviewStage?
    var finished = false
    var viewing: ReviewStage?
    /// While Claude works: how many calls are decided (the next one shows a quiet ring, none is "current").
    var decided: Int?
    var canSelect: ((ReviewStage) -> Bool)?
    var onSelect: ((ReviewStage) -> Void)?
    private var stages: [ReviewStage] { ReviewStage.allCases }
    private var working: Bool { decided != nil && !finished }
    private var currentIndex: Int {
        if finished { return stages.count }
        if let decided { return decided }
        return current.flatMap { stages.firstIndex(of: $0) } ?? -1
    }

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Array(stages.enumerated()), id: \.offset) { index, stage in
                item(index, stage)
                if index < stages.count - 1 {
                    Rectangle().fill(index < currentIndex ? Color.secondary.opacity(0.6) : Workspace.hairline).frame(width: 18, height: 1)
                }
            }
        }
        .fixedSize()
        .animation(.snappy, value: currentIndex)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(finished ? "All five calls done" : currentIndex >= 0 && currentIndex < stages.count ? "Call \(currentIndex + 1) of 5, \(stages[currentIndex].stepTitle)" : "Not started")
    }

    @ViewBuilder private func item(_ index: Int, _ stage: ReviewStage) -> some View {
        let selectable = onSelect != nil && ((canSelect?(stage) ?? false) || (stage == current && viewing != nil))
        if selectable {
            Button { onSelect?(stage) } label: { label(index, stage) }.buttonStyle(.plain)
                .help(stage == current ? "Back to \(stage.stepTitle)" : "Look back at \(stage.stepTitle)")
        } else { label(index, stage) }
    }

    private func label(_ index: Int, _ stage: ReviewStage) -> some View {
        let done = index < currentIndex, active = index == currentIndex && !working, next = working && index == currentIndex
        let looking = viewing == stage && viewing != current
        return HStack(spacing: 8) {
            ZStack {
                if active { Circle().fill(Color.rasan) }
                else { Circle().strokeBorder(next ? Color.rasan.opacity(0.7) : done ? Color.secondary.opacity(0.55) : Workspace.hairline.opacity(2.2), lineWidth: 1.2) }
                if done { Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary) }
                else { Text("\(index + 1)").font(.system(size: 11.5, weight: .semibold)).foregroundStyle(active ? Color.white : Color.secondary) }
            }
            .frame(width: 26, height: 26)
            Text(stage.stepTitle).font(.system(size: 13, weight: active ? .semibold : .regular))
                .foregroundStyle(active || looking ? Color.primary : Color.secondary).fixedSize()
        }
        .padding(.horizontal, looking ? 8 : 0).padding(.vertical, looking ? 3 : 0)
        .background(looking ? Color.rasan.opacity(0.14) : .clear, in: Capsule())
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(stage.stepTitle)\(done ? ", done" : active ? ", current" : "")")
    }
}

// MARK: Filmstrip

/// The scenes as an editor's filmstrip: equal frames, a numbered pin above each, its start time below. The scene on the
/// playhead is outlined in the tint with a filled pin; a scene with an open note carries an amber dot.
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
                    Circle().fill(current ? Color.rasan : Workspace.raised)
                        .overlay { Circle().strokeBorder(current ? .clear : Workspace.hairline, lineWidth: 1) }
                    Text("\(number)").font(.system(size: 11, weight: .bold)).foregroundStyle(current ? Color.white : Color.primary)
                }
                .frame(width: current ? 26 : 22, height: current ? 26 : 22)
                .frame(width: size.width, height: 26)
                ZStack(alignment: .bottomLeading) {
                    if let path = scene.thumbnail { PayloadImage(path: path, contentMode: .fill, maxPixels: 420).frame(width: size.width, height: size.height).clipped() }
                    else {
                        ZStack { Workspace.raised; Image(systemName: "photo").foregroundStyle(.tertiary) }
                    }
                    if current {
                        GeometryReader { box in Rectangle().fill(Color.rasan).frame(width: box.size.width * progress, height: 3).frame(maxHeight: .infinity, alignment: .bottom) }
                    }
                }
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(current ? Color.rasan : Color.primary.opacity(hovering ? 0.3 : 0.06), lineWidth: current ? 2 : 1) }
                .overlay(alignment: .topTrailing) {
                    if hasNote { Circle().fill(Workspace.amber).frame(width: 9, height: 9).overlay { Circle().strokeBorder(.black.opacity(0.5), lineWidth: 1) }.padding(5) }
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
