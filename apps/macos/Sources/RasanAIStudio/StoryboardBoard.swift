import StudioCore
import SwiftUI

/// The Storyboard step's main area: a play strip (play with music, volume, music chip) over a grid of panels, one per scene.
/// The grid scrolls inside; the container panel itself is fixed. The panel on the playhead is the selected one.
struct StoryboardBoard<Chips: View>: View {
    let model: FilmSessionModel
    let step: String
    let playback: AnimaticPlayback
    let scenes: [FilmScene]
    /// Every note on this step; open ones show as dots and counts.
    let notes: [ReviewNote]
    let aspect: Double
    let canNote: Bool
    var maxColumns = 4
    @ViewBuilder var chips: () -> Chips

    @FocusState private var focused: Bool

    private let gap: CGFloat = 14

    var body: some View {
        let current = FilmTiming.sceneIndex(at: playback.time, in: scenes) ?? 0
        let open = notes.filter(\.isOpen)
        VStack(spacing: 0) {
            PlayStrip(playback: playback, chips: chips)
            Rectangle().fill(Workspace.hairline).frame(height: 1)
            GeometryReader { box in
                let columns = columnCount(width: box.size.width)
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: gap, alignment: .top), count: columns), alignment: .leading, spacing: gap) {
                            ForEach(Array(scenes.enumerated()), id: \.element.id) { index, scene in
                                StoryboardCell(scene: scene, number: index + 1, selected: index == current, aspect: aspect,
                                               noteCount: open.filter { FilmTiming.sceneIndex(of: $0, in: scenes) == index }.count,
                                               canNote: canNote,
                                               onSelect: { focused = true; playback.seek(to: scene.start) },
                                               onNote: { beginNote(index) })
                                    .id(index)
                            }
                        }
                        .padding(Workspace.panelPadding)
                    }
                    .onChange(of: current) { _, index in
                        withAnimation(.smooth) { proxy.scrollTo(index, anchor: playback.isPlaying ? .center : nil) }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .onAppear { if !(NSApp.keyWindow?.firstResponder is NSTextView) { focused = true } }
        .onKeyPress(.space) { playback.toggle(); return .handled }
        .onKeyPress(.leftArrow) { step(forward: false) }
        .onKeyPress(.rightArrow) { step(forward: true) }
        .onKeyPress(KeyEquivalent("c")) {
            guard canNote else { return .ignored }
            beginNote(current)
            return .handled
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Storyboard. Space plays or pauses with the music, arrow keys step through panels, C tells Rasan about the selected panel.")
    }

    private func columnCount(width: CGFloat) -> Int {
        let fit = Int((width - 28 + gap) / (210 + gap))
        return min(maxColumns, max(maxColumns >= 3 ? 2 : 1, fit))
    }

    private func step(forward: Bool) -> KeyPress.Result {
        guard let target = FilmTiming.jump(from: playback.time, forward: forward, in: scenes) else { return .ignored }
        playback.seek(to: target)
        return .handled
    }

    /// A note on a whole panel: its start time, the panel's thumbnail, in the chat with Rasan.
    private func beginNote(_ index: Int) {
        guard canNote, scenes.indices.contains(index) else { return }
        playback.pause()
        playback.seek(to: scenes[index].start)
        model.attach(.wholeFrame(step: step, time: scenes[index].start), player: nil, thumbnail: model.fileURL(scenes[index].thumbnail))
    }
}

// MARK: Play strip

/// "Play with music", the clock and a thin progress line, the volume, and the music and voice chips.
private struct PlayStrip<Chips: View>: View {
    let playback: AnimaticPlayback
    @ViewBuilder var chips: () -> Chips

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) { transport; Spacer(minLength: 8); chips() }
            VStack(alignment: .leading, spacing: 8) { transport; chips() }
        }
        .padding(.horizontal, Workspace.panelPadding).padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            GeometryReader { box in
                let fraction = playback.duration > 0 ? min(1, max(0, playback.time / playback.duration)) : 0
                Rectangle().fill(Color.accentColor).frame(width: box.size.width * fraction, height: 2)
                    .frame(maxHeight: .infinity, alignment: .bottom)
            }
            .frame(height: 2).allowsHitTesting(false)
        }
    }

    private var transport: some View {
        HStack(spacing: 10) {
            Button { playback.toggle() } label: {
                Label(playback.isPlaying ? "Pause" : "Play with music", systemImage: playback.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Color.primary.opacity(0.10), in: Capsule())
                    .overlay { Capsule().strokeBorder(Workspace.hairline, lineWidth: 1) }
            }
            .buttonStyle(.plain).disabled(!playback.isReady)
            .help(playback.isPlaying ? "Pause (Space)" : "Play the panels at their timing with the music (Space)")
            Text("\(reviewTime(playback.time)) / \(reviewTime(playback.duration))")
                .font(.system(size: 12)).monospacedDigit().foregroundStyle(.secondary)
            Button { playback.isMuted.toggle() } label: {
                Image(systemName: playback.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 12)).frame(width: 26, height: 26)
            }
            .buttonStyle(.plain).foregroundStyle(.secondary)
            .help(playback.isMuted ? "Unmute" : "Mute").accessibilityLabel(playback.isMuted ? "Unmute" : "Mute")
        }
    }
}

// MARK: Panel

private struct StoryboardCell: View {
    let scene: FilmScene
    let number: Int
    let selected: Bool
    let aspect: Double
    let noteCount: Int
    let canNote: Bool
    let onSelect: () -> Void
    let onNote: () -> Void
    @State private var hovering = false

    var body: some View {
        let ratio = min(max(aspect, 0.5), 2.4)
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        let primary = scene.line.isEmpty ? scene.title : scene.line
        VStack(alignment: .leading, spacing: 8) {
            Color.clear
                .aspectRatio(ratio, contentMode: .fit)
                .overlay {
                    if let path = scene.thumbnail { PayloadImage(path: path, contentMode: .fill, maxPixels: 900) }
                    else { ZStack { Workspace.raised; Image(systemName: "photo").font(.system(size: 20)).foregroundStyle(.tertiary) } }
                }
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
                .overlay(alignment: .topLeading) {
                    Text("\(number)").font(.system(size: 11, weight: .bold)).monospacedDigit()
                        .foregroundStyle(.white).frame(minWidth: 22, minHeight: 22).padding(.horizontal, 2)
                        .background(.black.opacity(0.62), in: Capsule()).padding(7)
                }
                .overlay(alignment: .topTrailing) {
                    if hovering && canNote {
                        Button(action: onNote) {
                            Label("Add note", systemImage: "plus.bubble.fill").font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.white).padding(.horizontal, 9).padding(.vertical, 5)
                                .background(.black.opacity(0.62), in: Capsule())
                        }
                        .buttonStyle(.plain).padding(7).transition(.opacity)
                        .help("Tell Rasan about this panel (C)")
                    }
                }
            HStack(spacing: 6) {
                Text(reviewTime(scene.start) + "–" + reviewTime(scene.end))
                    .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
                Text(Self.length(scene.duration)).font(.system(size: 11, weight: .medium)).monospacedDigit().foregroundStyle(.secondary)
                    .padding(.horizontal, 6).padding(.vertical, 1.5).background(Color.primary.opacity(0.08), in: Capsule())
                Spacer(minLength: 4)
                if noteCount > 0 {
                    HStack(spacing: 4) {
                        Circle().fill(Color.turmeric).frame(width: 8, height: 8)
                        Text("\(noteCount)").font(.system(size: 11, weight: .medium)).monospacedDigit().foregroundStyle(.secondary)
                    }
                    .help("\(noteCount) open note\(noteCount == 1 ? "" : "s") on this panel")
                }
            }
            Text(primary).font(.system(size: 13, weight: .semibold)).lineLimit(2, reservesSpace: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !scene.visual.isEmpty {
                Text(scene.visual).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !scene.vo.isEmpty {
                Text("“\(scene.vo)”").font(.system(size: 12)).italic().foregroundStyle(.secondary).lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(8)
        .background(shape.fill(selected ? Color.primary.opacity(0.06) : hovering ? Color.primary.opacity(0.04) : Color.clear))
        .overlay { shape.strokeBorder(selected ? Color.accentColor : Workspace.hairline, lineWidth: selected ? 2 : 1) }
        .contentShape(shape)
        .onTapGesture(perform: onSelect)
        .onHover { hovering = $0 }
        .animation(.snappy(duration: 0.15), value: hovering)
        .animation(.snappy(duration: 0.15), value: selected)
        .help("\(number). \(scene.title) · \(Self.length(scene.duration))")
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Panel \(number), \(primary), \(reviewTime(scene.start)) to \(reviewTime(scene.end))" + (noteCount > 0 ? ", \(noteCount) open notes" : ""))
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : [.isButton])
        .accessibilityAction(named: "Add note") { if canNote { onNote() } }
    }

    static func length(_ seconds: Double) -> String {
        let value = (seconds * 10).rounded() / 10
        return value == value.rounded() || value >= 10 ? "\(Int(value.rounded()))s" : String(format: "%.1fs", value)
    }
}

// MARK: Summary

/// The left panel: how many panels and how long, the step's actions, and the open notes (a tap selects the panel).
struct StoryboardSummary: View {
    let playback: AnimaticPlayback
    let scenes: [FilmScene]
    let open: [ReviewNote]
    let canAct: Bool
    let showStory: Bool
    let onStory: () -> Void
    let onBuildWithout: () -> Void
    @Environment(NoteSkips.self) private var skips: NoteSkips?

    var body: some View {
        let total = scenes.last?.end ?? 0
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(scenes.count) scene\(scenes.count == 1 ? "" : "s")").font(.system(size: 15, weight: .semibold))
                    Text(reviewTime(total) + " long").font(.system(size: 12)).monospacedDigit().foregroundStyle(.secondary)
                }
                if showStory {
                    Button(action: onStory) { Label("Try a different story…", systemImage: "arrow.triangle.2.circlepath").font(.system(size: 12)) }
                        .buttonStyle(.link).disabled(!canAct)
                        .help("Go back to the story step for new stories. The look and storyboard are redone, so it costs another pass.")
                }
                if !open.isEmpty && canAct {
                    Button("Build without these notes…", action: onBuildWithout)
                        .buttonStyle(.link).font(.system(size: 12))
                        .help("Skip these notes and build the film as it is.")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Workspace.panelPadding).padding(.vertical, 12)
            Rectangle().fill(Workspace.hairline).frame(height: 1)
            if open.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "bubble.left").font(.system(size: 20)).foregroundStyle(.tertiary)
                    Text("No notes yet").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                    Text("Hover a panel and choose Add note, or press C.").font(.system(size: 12)).foregroundStyle(.tertiary).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity).padding(Workspace.panelPadding)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Open notes").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
                            .padding(.horizontal, 6).padding(.bottom, 2)
                        ForEach(open.sorted { $0.time < $1.time }) { note in
                            let index = FilmTiming.sceneIndex(of: note, in: scenes)
                            let skipped = skips?.ids.contains(note.id) == true
                            Button {
                                if let index { playback.seek(to: scenes[index].start) }
                            } label: {
                                HStack(alignment: .top, spacing: 8) {
                                    Circle().fill(Color.turmeric).frame(width: 8, height: 8).padding(.top, 5)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(index.map { "Panel \($0 + 1) · " + reviewTime(note.time) } ?? "Whole film")
                                            .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
                                        Text(note.text).font(.system(size: 12)).lineLimit(3).multilineTextAlignment(.leading)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .padding(8).opacity(skipped ? 0.45 : 1)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                if let skips { Button(skipped ? "Include Note" : "Skip Note") { skips.toggle(note.id) } }
                            }
                            .accessibilityLabel("Note: \(note.text)" + (skipped ? ", skipped" : ""))
                        }
                    }
                    .padding(8)
                }
            }
        }
    }
}
