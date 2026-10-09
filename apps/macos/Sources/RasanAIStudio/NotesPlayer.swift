import AppKit
import AVFoundation
import Observation
import StudioCore
import SwiftUI

// MARK: - Notes player
//
// The review room shared by the Animatic and the Final: a dark, film-forward player with a precise transport, a scrubber
// that carries scene ticks and note marks, a scene strip, click-on-the-frame notes (popover), pins and a notes list.
//
//   FilmTiming            pure timing math (which scene at time t, scene navigation), unit tested
//   FilmPlayback          the clock the panel drives: AnimaticPlayback (key frames + music bed) or VideoPlayback (AVPlayer)
//   ReviewPlayerPanel     frame + overlays, scrubber, transport, scene strip, keys (Space, arrows, C), note popover
//   ReviewNotesList       open notes (numbered like their pins) and resolved ones, dimmed, with "what changed"
//   ReviewNoteComposer    the popover: text, quick notes, scope

// MARK: Timing math

enum FilmTiming {
    /// The index of the scene on screen at `t`: the last scene that has started. Clamps before the first and after the last.
    static func sceneIndex(at t: Double, starts: [Double]) -> Int? {
        guard !starts.isEmpty else { return nil }
        var found = 0
        for (index, start) in starts.enumerated() where t >= start - 0.0005 { found = index }
        return found
    }

    static func sceneIndex(at t: Double, in scenes: [FilmScene]) -> Int? {
        sceneIndex(at: t, starts: scenes.map(\.start))
    }

    /// 0...1 through the scene at `index`.
    static func progress(at t: Double, in scene: FilmScene) -> Double {
        guard scene.duration > 0 else { return 0 }
        return min(1, max(0, (t - scene.start) / scene.duration))
    }

    /// Where ←/→ go: the next scene's start, or the current scene's start (the previous one when already near it).
    static func jump(from t: Double, forward: Bool, in scenes: [FilmScene]) -> Double? {
        guard let index = sceneIndex(at: t, in: scenes) else { return nil }
        if forward { return index + 1 < scenes.count ? scenes[index + 1].start : scenes[index].start }
        if t - scenes[index].start > 1 || index == 0 { return scenes[index].start }
        return scenes[index - 1].start
    }

    /// Which scene a note belongs to: its scene id when it names one, else the scene at its time.
    static func sceneIndex(of note: ReviewNote, in scenes: [FilmScene]) -> Int? {
        if let id = note.scene, let index = scenes.firstIndex(where: { $0.id == id }) { return index }
        return sceneIndex(at: note.time, in: scenes)
    }

    static func clamp(_ t: Double, _ duration: Double) -> Double { min(max(0, t.isFinite ? t : 0), max(0, duration)) }
}

/// "0:12" or "0:12.4".
func reviewTime(_ seconds: Double, tenths: Bool = false) -> String {
    let value = max(0, seconds.isFinite ? seconds : 0)
    if tenths {
        let whole = Int(value)
        return "\(whole / 60):" + String(format: "%02d", whole % 60) + "." + String(Int((value - Double(whole)) * 10))
    }
    let whole = Int(value.rounded(.down))
    return "\(whole / 60):" + String(format: "%02d", whole % 60)
}

// MARK: Playback

@MainActor protocol FilmPlayback: AnyObject, Observable {
    var time: Double { get }
    var duration: Double { get }
    var isPlaying: Bool { get }
    var isMuted: Bool { get set }
    var isReady: Bool { get }
    func play()
    func pause()
    func seek(to seconds: Double)
}

extension FilmPlayback {
    func toggle() { isPlaying ? pause() : play() }
}

/// Key frames at their real durations, with the music bed. The film clock is the master; the audio follows it.
@MainActor @Observable
final class AnimaticPlayback: FilmPlayback {
    private(set) var time = 0.0
    private(set) var duration = 1.0
    private(set) var isPlaying = false
    var isMuted = false { didSet { audio?.isMuted = isMuted } }
    private(set) var hasAudio = false
    var isReady: Bool { duration > 0 }

    @ObservationIgnored private var audio: AVPlayer?
    @ObservationIgnored private var audioURL: URL?
    @ObservationIgnored private var offset = 0.0
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var anchorWall = 0.0
    @ObservationIgnored private var anchorTime = 0.0
    @ObservationIgnored private var lastResync = 0.0

    func configure(duration: Double, audio url: URL?, offset: Double) {
        self.duration = max(duration, 0.1)
        self.offset = max(0, offset)
        time = FilmTiming.clamp(time, self.duration)
        if url != audioURL {
            audio?.pause()
            audioURL = url
            audio = url.map { AVPlayer(url: $0) }
            audio?.isMuted = isMuted
            hasAudio = url != nil
            if isPlaying { startAudio() }
        }
    }

    func play() {
        guard isReady else { return }
        if time >= duration - 0.05 { time = 0 }
        isPlaying = true
        anchorWall = CACurrentMediaTime(); anchorTime = time
        startAudio()
        timer?.invalidate()
        let timer = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func pause() {
        isPlaying = false
        timer?.invalidate(); timer = nil
        audio?.pause()
    }

    func seek(to seconds: Double) {
        time = FilmTiming.clamp(seconds, duration)
        anchorWall = CACurrentMediaTime(); anchorTime = time
        if isPlaying { startAudio() }
    }

    func shutdown() { pause(); audio = nil; audioURL = nil; hasAudio = false }

    private func startAudio() {
        guard let audio else { return }
        let target = offset + time
        audio.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        audio.play()
        lastResync = CACurrentMediaTime()
    }

    private func tick() {
        let now = CACurrentMediaTime()
        let t = anchorTime + (now - anchorWall)
        if t >= duration { time = duration; pause(); return }
        time = t
        // Keep the bed locked to the picture; at most once a second so a seek never thrashes.
        if let audio, audio.timeControlStatus == .playing, now - lastResync > 1 {
            let heard = audio.currentTime().seconds - offset
            if abs(heard - t) > 0.3 {
                audio.seek(to: CMTime(seconds: offset + t, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
                lastResync = now
            }
        }
    }
}

/// The rendered film in an AVPlayer.
@MainActor @Observable
final class VideoPlayback: FilmPlayback {
    private(set) var time = 0.0
    private(set) var duration = 0.0
    private(set) var isPlaying = false
    private(set) var hasStarted = false
    private(set) var isReady = false
    var isMuted = false { didSet { player.isMuted = isMuted } }
    @ObservationIgnored let player = AVPlayer()
    @ObservationIgnored private var url: URL?
    @ObservationIgnored private var fallbackDuration = 0.0
    @ObservationIgnored private var observer: Any?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var seeking = false
    @ObservationIgnored private var pending: Double?

    init() {
        observer = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 30), queue: .main) { [weak self] value in
            let seconds = value.seconds
            MainActor.assumeIsolated { self?.tick(seconds) }
        }
    }

    func load(url next: URL?, fallbackDuration: Double) {
        self.fallbackDuration = fallbackDuration
        guard next != url else { if duration == 0 { duration = fallbackDuration }; return }
        pause()
        url = next; time = 0; hasStarted = false; isReady = false
        duration = fallbackDuration
        if let endObserver { NotificationCenter.default.removeObserver(endObserver); self.endObserver = nil }
        guard let next else { player.replaceCurrentItem(with: nil); return }
        let item = AVPlayerItem(url: next)
        player.replaceCurrentItem(with: item)
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.finished() }
        }
        Task { [weak self] in
            let loaded = try? await item.asset.load(.duration).seconds
            let playable = (try? await item.asset.load(.isPlayable)) ?? false
            await MainActor.run {
                guard let self, self.url == next else { return }
                if let loaded, loaded.isFinite, loaded > 0 { self.duration = loaded }
                self.isReady = playable
            }
        }
    }

    func play() {
        guard isReady else { return }
        if duration > 0, time >= duration - 0.1 { seek(to: 0) }
        hasStarted = true
        isPlaying = true
        player.play()
    }

    func pause() {
        isPlaying = false
        player.pause()
    }

    func seek(to seconds: Double) {
        time = FilmTiming.clamp(seconds, duration)
        if isReady { hasStarted = hasStarted || time > 0 }
        if seeking { pending = time; return }
        issueSeek(time)
    }

    func shutdown() { pause(); player.replaceCurrentItem(with: nil); url = nil; isReady = false }

    private func issueSeek(_ seconds: Double) {
        seeking = true
        player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if let next = self.pending { self.pending = nil; self.issueSeek(next) } else { self.seeking = false }
            }
        }
    }

    private func tick(_ seconds: Double) {
        guard !seeking, seconds.isFinite else { return }
        time = seconds
    }

    private func finished() {
        isPlaying = false
        if duration > 0 { time = duration }
    }
}

// MARK: Notes model

/// Where a note is being written.
struct NoteDraft: Identifiable, Equatable {
    let id = UUID()
    var sceneIndex: Int?
    var t: Double
    /// Fractions of the frame; nil when the note comes from the keyboard (no point on the frame).
    var x: Double?
    var y: Double?
}

enum NoteQuick {
    static let all = ["Slower", "Faster", "Bigger", "Simpler", "Cut it"]
}

extension ReviewNote {
    var isOpen: Bool { state == "open" }
}

// MARK: Palette

enum ReviewTheme {
    static let room = Color(red: 0.045, green: 0.047, blue: 0.060)
    static let roomRaised = Color(red: 0.085, green: 0.088, blue: 0.108)
    static let hairline = Color.white.opacity(0.09)
}

// MARK: Panel

/// The player: frame on top, then the scrubber, the transport, and the scene strip.
struct ReviewPlayerPanel<P: FilmPlayback, Frame: View>: View {
    let model: FilmSessionModel
    let step: String
    let playback: P
    let scenes: [FilmScene]
    /// Every note on this step (open and resolved); pins and marks use the open ones.
    let notes: [ReviewNote]
    let aspect: Double
    var canNote: Bool
    /// nil: a pin shows while its scene is on screen. A number: while the playhead is within that many seconds of it.
    var pinWindow: Double?
    var showStrip = true
    var caption: (Int?) -> String? = { _ in nil }
    @ViewBuilder var frame: () -> Frame

    @State private var draft: NoteDraft?
    @State private var resumeAfterNote = false
    @State private var wasPlaying = false
    @FocusState private var focused: Bool
    @Environment(\.reviewFrameHeight) private var frameHeight

    private var open: [ReviewNote] { notes.filter(\.isOpen).sorted { $0.time < $1.time } }

    var body: some View {
        VStack(spacing: 0) {
            stage
            VStack(spacing: 10) {
                ReviewScrubber(playback: playback, scenes: scenes, marks: open,
                               onBegin: { wasPlaying = playback.isPlaying; playback.pause() },
                               onEnd: { if wasPlaying { playback.play() } })
                ReviewTransport(playback: playback, scenes: scenes, canNote: canNote, onNote: { beginNote(at: nil) })
                if showStrip && !scenes.isEmpty {
                    SceneStrip(playback: playback, scenes: scenes, open: open)
                }
            }
            .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 14)
            .background(ReviewTheme.roomRaised)
            .environment(\.colorScheme, .dark)
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(ReviewTheme.hairline, lineWidth: 1) }
        .shadow(color: .black.opacity(0.28), radius: 18, y: 8)
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .onAppear { focused = true }
        .onKeyPress(.space) { playback.toggle(); return .handled }
        .onKeyPress(.leftArrow) { jump(forward: false) }
        .onKeyPress(.rightArrow) { jump(forward: true) }
        .onKeyPress(KeyEquivalent("c")) { guard canNote else { return .ignored }; beginNote(at: nil); return .handled }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Film player. Space plays or pauses, arrow keys step through scenes, C leaves a note at the playhead.")
    }

    private func jump(forward: Bool) -> KeyPress.Result {
        guard let target = FilmTiming.jump(from: playback.time, forward: forward, in: scenes) else { return .ignored }
        playback.seek(to: target)
        return .handled
    }

    // MARK: Frame

    private var stage: some View {
        ZStack {
            ReviewTheme.room
            GeometryReader { box in
                let size = fitted(in: box.size)
                ZStack {
                    frame()
                    PinsLayer(playback: playback, scenes: scenes, notes: open, window: pinWindow)
                    CaptionLayer(playback: playback, scenes: scenes, caption: caption)
                    if let draft, let x = draft.x, let y = draft.y {
                        DraftRing().position(x: x * size.width, y: y * size.height)
                    }
                    PlayOverlay(playback: playback)
                    Color.clear.frame(width: 1, height: 1)
                        .position(x: (draft?.x ?? 0.5) * size.width, y: (draft?.y ?? 0.12) * size.height)
                        .popover(isPresented: Binding(get: { draft != nil }, set: { if !$0 { closeDraft() } }), arrowEdge: .bottom) {
                            if let draft { composer(draft) }
                        }
                }
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                .contentShape(Rectangle())
                .gesture(SpatialTapGesture().onEnded { tap in
                    focused = true
                    guard canNote, size.width > 0, size.height > 0 else { playback.toggle(); return }
                    beginNote(at: CGPoint(x: min(1, max(0, tap.location.x / size.width)), y: min(1, max(0, tap.location.y / size.height))))
                })
                .onHover { inside in
                    guard canNote else { return }
                    if inside { NSCursor.crosshair.push() } else { NSCursor.pop() }
                }
                .position(x: box.size.width / 2, y: box.size.height / 2)
                .accessibilityLabel(canNote ? "Film frame. Activate to leave a note at this moment." : "Film frame")
                .accessibilityAddTraits(.isButton)
            }
            .padding(14)
        }
        .aspectRatio(min(max(aspect, 0.5), 2.4), contentMode: .fit)
        .frame(minHeight: 160, maxHeight: frameHeight)
        .frame(maxWidth: .infinity)
        .background(ReviewTheme.room)
    }

    private func fitted(in available: CGSize) -> CGSize {
        guard available.width > 0, available.height > 0 else { return .zero }
        let ratio = min(max(aspect, 0.3), 3)
        let width = min(available.width, available.height * ratio)
        return CGSize(width: width, height: width / ratio)
    }

    // MARK: Notes

    private func beginNote(at point: CGPoint?) {
        guard canNote else { return }
        resumeAfterNote = false
        playback.pause()
        let t = playback.time
        draft = NoteDraft(sceneIndex: FilmTiming.sceneIndex(at: t, in: scenes), t: t, x: point.map { Double($0.x) }, y: point.map { Double($0.y) })
    }

    private func closeDraft() { draft = nil; focused = true }

    private func composer(_ draft: NoteDraft) -> some View {
        let scene = draft.sceneIndex.flatMap { scenes.indices.contains($0) ? scenes[$0] : nil }
        let title = [scene.map { _ in "Scene \((draft.sceneIndex ?? 0) + 1)" }, scene?.title, reviewTime(draft.t)].compactMap { $0 }.joined(separator: " · ")
        return ReviewNoteComposer(title: title, hasScene: scene != nil, onCancel: closeDraft, onSave: { text, quick, scope in
            var value: [String: JSONValue] = ["t": .number((draft.t * 100).rounded() / 100), "scope": .string(scope)]
            if let scene { value["scene"] = scene.originalID }
            if let x = draft.x, let y = draft.y { value["x"] = .number((x * 1000).rounded() / 1000); value["y"] = .number((y * 1000).rounded() / 1000) }
            value["quick"] = quick.map(JSONValue.string) ?? .null
            let sent = await model.send(step: step, type: "comment", value: .object(value), note: text)
            if sent { closeDraft() }
            return sent
        })
    }
}

// MARK: Frame layers

private struct PinsLayer<P: FilmPlayback>: View {
    let playback: P
    let scenes: [FilmScene]
    let notes: [ReviewNote]
    let window: Double?

    var body: some View {
        let t = playback.time
        let current = FilmTiming.sceneIndex(at: t, in: scenes)
        GeometryReader { box in
            ForEach(Array(notes.enumerated()), id: \.element.id) { index, note in
                if let x = note.x, let y = note.y, visible(note, t: t, current: current) {
                    PinView(number: index + 1, text: note.text)
                        .position(x: x * box.size.width, y: y * box.size.height)
                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                }
            }
        }
        .animation(.snappy(duration: 0.18), value: current)
        .allowsHitTesting(true)
    }

    private func visible(_ note: ReviewNote, t: Double, current: Int?) -> Bool {
        if let window { return abs(note.time - t) <= window }
        return FilmTiming.sceneIndex(of: note, in: scenes) == current
    }
}

private struct PinView: View {
    let number: Int
    let text: String
    @State private var hovering = false
    var body: some View {
        ZStack {
            Circle().fill(Color.rasan).frame(width: 24, height: 24)
            Circle().strokeBorder(.white, lineWidth: 2).frame(width: 24, height: 24)
            Text("\(number)").font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(Color.black.opacity(0.85))
        }
        .shadow(color: .black.opacity(0.5), radius: 4, y: 2)
        .scaleEffect(hovering ? 1.12 : 1)
        .overlay(alignment: .top) {
            if hovering {
                Text(text).font(.system(size: 12)).foregroundStyle(.white).lineLimit(3).frame(maxWidth: 220, alignment: .leading)
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .fixedSize(horizontal: false, vertical: true)
                    .offset(y: 30).allowsHitTesting(false)
            }
        }
        .zIndex(hovering ? 2 : 0)
        .onHover { hovering = $0 }
        .animation(.snappy(duration: 0.15), value: hovering)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Note \(number): \(text)")
    }
}

private struct DraftRing: View {
    @State private var pulse = false
    var body: some View {
        ZStack {
            Circle().strokeBorder(Color.rasan, lineWidth: 2).frame(width: 26, height: 26)
            Circle().fill(Color.rasan).frame(width: 8, height: 8)
            Circle().strokeBorder(Color.rasan.opacity(0.5), lineWidth: 1.5).frame(width: 26, height: 26)
                .scaleEffect(pulse ? 1.9 : 1).opacity(pulse ? 0 : 1)
                .animation(.easeOut(duration: 1.1).repeatForever(autoreverses: false), value: pulse)
        }
        .shadow(color: .black.opacity(0.5), radius: 3)
        .allowsHitTesting(false)
        .onAppear { pulse = true }
    }
}

private struct CaptionLayer<P: FilmPlayback>: View {
    let playback: P
    let scenes: [FilmScene]
    let caption: (Int?) -> String?
    var body: some View {
        let index = FilmTiming.sceneIndex(at: playback.time, in: scenes)
        VStack {
            Spacer()
            if let text = caption(index), !text.isEmpty {
                Text(text)
                    .font(.system(size: 16, weight: .medium)).foregroundStyle(.white).multilineTextAlignment(.center)
                    .shadow(color: .black.opacity(0.7), radius: 6, y: 1)
                    .padding(.horizontal, 28).padding(.top, 36).padding(.bottom, 16)
                    .frame(maxWidth: .infinity)
                    .background(LinearGradient(colors: [.clear, .black.opacity(0.62)], startPoint: .top, endPoint: .bottom))
                    .id(index)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: index)
        .allowsHitTesting(false)
    }
}

private struct PlayOverlay<P: FilmPlayback>: View {
    let playback: P
    var body: some View {
        ZStack {
            if !playback.isPlaying {
                Button { playback.play() } label: {
                    Image(systemName: "play.fill").font(.system(size: 24, weight: .semibold)).foregroundStyle(.white)
                        .offset(x: 2).frame(width: 66, height: 66)
                        .background(.ultraThinMaterial, in: Circle())
                        .overlay { Circle().strokeBorder(.white.opacity(0.28), lineWidth: 1) }
                        .shadow(color: .black.opacity(0.4), radius: 12, y: 4)
                }
                .buttonStyle(PressableStyle())
                .disabled(!playback.isReady)
                .opacity(playback.isReady ? 1 : 0.4)
                .transition(.scale(scale: 0.85).combined(with: .opacity))
                .accessibilityLabel("Play")
            }
        }
        .animation(.smooth(duration: 0.18), value: playback.isPlaying)
    }
}

// MARK: Scrubber

struct ReviewScrubber<P: FilmPlayback>: View {
    let playback: P
    let scenes: [FilmScene]
    let marks: [ReviewNote]
    var onBegin: () -> Void = {}
    var onEnd: () -> Void = {}
    @State private var hoverX: CGFloat?
    @State private var dragging = false

    var body: some View {
        GeometryReader { box in
            let width = max(box.size.width, 1)
            let duration = max(playback.duration, 0.001)
            let x = CGFloat(min(1, max(0, playback.time / duration))) * width
            let active = dragging || hoverX != nil
            let trackHeight: CGFloat = active ? 8 : 5
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.16)).frame(height: trackHeight)
                Capsule().fill(Color.rasan).frame(width: max(x, 0), height: trackHeight)
                ForEach(Array(scenes.enumerated()), id: \.element.id) { index, scene in
                    if index > 0 {
                        Rectangle().fill(ReviewTheme.roomRaised).frame(width: 2, height: trackHeight)
                            .offset(x: CGFloat(scene.start / duration) * width - 1)
                    }
                }
                ForEach(marks) { note in
                    Circle().fill(Color(red: 1, green: 0.78, blue: 0.28)).frame(width: 9, height: 9)
                        .overlay { Circle().strokeBorder(ReviewTheme.roomRaised, lineWidth: 1.5) }
                        .offset(x: CGFloat(min(1, max(0, note.time / duration))) * width - 4.5, y: -(trackHeight / 2 + 6))
                        .allowsHitTesting(false)
                }
                RoundedRectangle(cornerRadius: 2, style: .continuous).fill(.white)
                    .frame(width: 4, height: active ? 22 : 18)
                    .shadow(color: .black.opacity(0.5), radius: 3)
                    .offset(x: min(max(x - 2, 0), width - 4))
                if let hoverX, !dragging {
                    let t = Double(min(1, max(0, hoverX / width))) * duration
                    HoverBubble(text: reviewTime(t) + (FilmTiming.sceneIndex(at: t, in: scenes).map { " · " + scenes[$0].title } ?? ""))
                        .offset(x: min(max(hoverX - 60, 0), max(width - 120, 0)), y: -34)
                        .allowsHitTesting(false)
                }
            }
            .frame(height: box.size.height)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { value in
                    if !dragging { dragging = true; onBegin() }
                    playback.seek(to: Double(min(1, max(0, value.location.x / width))) * duration)
                }
                .onEnded { _ in dragging = false; onEnd() })
            .onContinuousHover { phase in
                switch phase {
                case .active(let point): hoverX = point.x
                case .ended: hoverX = nil
                }
            }
            .animation(.snappy(duration: 0.14), value: active)
        }
        .frame(height: 24)
        .accessibilityElement()
        .accessibilityLabel("Scrubber")
        .accessibilityValue("\(reviewTime(playback.time)) of \(reviewTime(playback.duration))")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: playback.seek(to: playback.time + 5)
            case .decrement: playback.seek(to: playback.time - 5)
            @unknown default: break
            }
        }
    }
}

private struct HoverBubble: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.white).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(.black.opacity(0.85), in: Capsule())
            .fixedSize()
    }
}

// MARK: Transport

struct ReviewTransport<P: FilmPlayback>: View {
    let playback: P
    let scenes: [FilmScene]
    var canNote: Bool
    var onNote: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Button { if let t = FilmTiming.jump(from: playback.time, forward: false, in: scenes) { playback.seek(to: t) } } label: {
                Image(systemName: "backward.end.fill").frame(width: 28, height: 28)
            }
            .help("Previous scene (←)").accessibilityLabel("Previous scene").disabled(scenes.isEmpty)
            Button { playback.toggle() } label: {
                Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill").font(.system(size: 14, weight: .semibold))
                    .frame(width: 36, height: 36)
                    .background(.white.opacity(0.14), in: Circle())
                    .contentTransition(.symbolEffect(.replace))
            }
            .help("Play or pause (Space)").accessibilityLabel(playback.isPlaying ? "Pause" : "Play").disabled(!playback.isReady)
            Button { if let t = FilmTiming.jump(from: playback.time, forward: true, in: scenes) { playback.seek(to: t) } } label: {
                Image(systemName: "forward.end.fill").frame(width: 28, height: 28)
            }
            .help("Next scene (→)").accessibilityLabel("Next scene").disabled(scenes.isEmpty)
            TransportClock(playback: playback).padding(.leading, 8)
            Spacer(minLength: 8)
            Button { playback.isMuted.toggle() } label: {
                Image(systemName: playback.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill").frame(width: 28, height: 28)
            }
            .help(playback.isMuted ? "Unmute" : "Mute").accessibilityLabel(playback.isMuted ? "Unmute" : "Mute")
            Button(action: onNote) {
                Label("Note", systemImage: "plus.bubble.fill").font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10).frame(height: 28)
                    .background(Color.rasan.opacity(canNote ? 0.9 : 0.25), in: Capsule())
                    .foregroundStyle(Color.black.opacity(0.88))
            }
            .disabled(!canNote)
            .help("Leave a note at the playhead (C)").accessibilityLabel("Add a note at the playhead")
        }
        .buttonStyle(.plain).foregroundStyle(.white)
        .font(.system(size: 13))
    }
}

private struct TransportClock<P: FilmPlayback>: View {
    let playback: P
    var body: some View {
        HStack(spacing: 4) {
            Text(reviewTime(playback.time, tenths: true)).foregroundStyle(.white)
            Text("/").foregroundStyle(.white.opacity(0.35))
            Text(reviewTime(playback.duration)).foregroundStyle(.white.opacity(0.55))
        }
        .font(.system(size: 13, weight: .medium, design: .monospaced))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(reviewTime(playback.time)) of \(reviewTime(playback.duration))")
    }
}

// MARK: Scene strip

struct SceneStrip<P: FilmPlayback>: View {
    let playback: P
    let scenes: [FilmScene]
    let open: [ReviewNote]

    var body: some View {
        let current = FilmTiming.sceneIndex(at: playback.time, in: scenes)
        GeometryReader { box in
            let total = max(scenes.map(\.end).max() ?? 1, 0.001)
            let gaps = CGFloat(max(scenes.count - 1, 0)) * 4
            HStack(spacing: 4) {
                ForEach(Array(scenes.enumerated()), id: \.element.id) { index, scene in
                    let width = max(30, (box.size.width - gaps) * CGFloat(scene.duration / total))
                    SceneCell(scene: scene, number: index + 1, current: index == current, width: width,
                              progress: index == current ? FilmTiming.progress(at: playback.time, in: scene) : 0,
                              hasNote: open.contains { FilmTiming.sceneIndex(of: $0, in: scenes) == index }) {
                        playback.seek(to: scene.start)
                    }
                    .frame(width: width)
                }
            }
        }
        .frame(height: 52)
    }
}

private struct SceneCell: View {
    let scene: FilmScene
    let number: Int
    let current: Bool
    let width: CGFloat
    let progress: Double
    let hasNote: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .bottomLeading) {
                if let path = scene.thumbnail { PayloadImage(path: path, contentMode: .fill, maxPixels: 360).frame(height: 52) }
                else { Rectangle().fill(.white.opacity(0.07)) }
                LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .center, endPoint: .bottom)
                if width > 64 {
                    Text("\(number)  \(scene.title)").font(.system(size: 10, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                        .padding(.horizontal, 6).padding(.bottom, 5)
                } else {
                    Text("\(number)").font(.system(size: 10, weight: .bold, design: .rounded)).foregroundStyle(.white).padding(.horizontal, 6).padding(.bottom, 5)
                }
                if current {
                    GeometryReader { box in
                        Rectangle().fill(Color.rasan).frame(width: box.size.width * progress, height: 3)
                            .frame(maxHeight: .infinity, alignment: .bottom)
                    }
                }
            }
            .frame(height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(current ? Color.rasan : .white.opacity(hovering ? 0.35 : 0.08), lineWidth: current ? 2 : 1) }
            .overlay(alignment: .topTrailing) {
                if hasNote {
                    Circle().fill(Color(red: 1, green: 0.78, blue: 0.28)).frame(width: 8, height: 8)
                        .overlay { Circle().strokeBorder(.black.opacity(0.6), lineWidth: 1) }.padding(4)
                }
            }
            .opacity(current || hovering ? 1 : 0.7)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.snappy(duration: 0.15), value: current)
        .help("\(scene.title) · \(Int(scene.duration.rounded())) s")
        .accessibilityLabel("Scene \(number), \(scene.title), \(Int(scene.duration.rounded())) seconds")
        .accessibilityAddTraits(current ? [.isSelected] : [])
    }
}

// MARK: Composer

struct ReviewNoteComposer: View {
    let title: String
    let hasScene: Bool
    let onCancel: () -> Void
    /// (text, quick, scope) -> accepted
    let onSave: (String, String?, String) async -> Bool
    @State private var text = ""
    @State private var quick: String?
    @State private var scope = "scene"
    @State private var saving = false
    @State private var failed = false
    @FocusState private var focused: Bool

    private var canSave: Bool { !saving && (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || quick != nil) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "mappin.circle.fill").foregroundStyle(Color.rasan)
                Text(title).font(.system(size: 12, weight: .semibold)).lineLimit(1)
            }
            TextField("What should change here?", text: $text, axis: .vertical)
                .textFieldStyle(.plain).font(.system(size: 13)).lineLimit(2...5)
                .padding(9)
                .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                .focused($focused)
                .onSubmit { save() }
                .accessibilityLabel("Note text")
            FlowLayout(spacing: 6) {
                ForEach(NoteQuick.all, id: \.self) { label in
                    Button { quick = quick == label ? nil : label } label: {
                        Text(label).font(.system(size: 12, weight: .medium)).padding(.horizontal, 10).padding(.vertical, 5)
                            .background(quick == label ? Color.rasan.opacity(0.22) : Color(nsColor: .quaternaryLabelColor).opacity(0.35), in: Capsule())
                            .overlay { Capsule().strokeBorder(quick == label ? Color.rasan : .clear, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Quick note: \(label)").accessibilityAddTraits(quick == label ? [.isSelected] : [])
                }
            }
            if hasScene {
                Picker("Applies to", selection: $scope) {
                    Text("This scene").tag("scene")
                    Text("Whole film").tag("film")
                }
                .pickerStyle(.segmented).labelsHidden()
                .accessibilityLabel("Applies to")
            }
            if failed { Text("Couldn't send the note. Try again.").font(.system(size: 11)).foregroundStyle(.orange) }
            HStack {
                Button("Cancel", action: onCancel).keyboardShortcut(.cancelAction)
                Spacer()
                Button { save() } label: {
                    HStack(spacing: 6) { if saving { ProgressView().controlSize(.small) }; Text("Add note") }
                }
                .buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction).disabled(!canSave)
            }
        }
        .padding(16).frame(width: 320)
        .onAppear { focused = true }
    }

    private func save() {
        guard canSave else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        saving = true; failed = false
        Task {
            let ok = await onSave(trimmed.isEmpty ? (quick ?? "") : trimmed, quick, hasScene ? scope : "film")
            saving = false
            if !ok { failed = true }
        }
    }
}

// MARK: Notes list

struct ReviewNotesList: View {
    let notes: [ReviewNote]
    let scenes: [FilmScene]
    var onSeek: (Double) -> Void
    private var open: [ReviewNote] { notes.filter(\.isOpen).sorted { $0.time < $1.time } }
    private var resolved: [ReviewNote] { notes.filter { !$0.isOpen }.sorted { $0.time < $1.time } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if open.isEmpty && resolved.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Label("No notes yet", systemImage: "bubble.left").font(.system(size: 13, weight: .semibold))
                    Text("Click the frame to leave a note on that exact moment, or press C at the playhead.")
                        .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(nsColor: .quaternaryLabelColor).opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            ForEach(Array(open.enumerated()), id: \.element.id) { index, note in
                NoteRow(note: note, number: index + 1, sceneTitle: sceneTitle(note)) { onSeek(note.time) }
            }
            ForEach(resolved) { note in
                NoteRow(note: note, number: nil, sceneTitle: sceneTitle(note)) { onSeek(note.time) }
            }
        }
    }

    private func sceneTitle(_ note: ReviewNote) -> String? {
        FilmTiming.sceneIndex(of: note, in: scenes).map { scenes[$0].title }
    }
}

private struct NoteRow: View {
    let note: ReviewNote
    let number: Int?
    let sceneTitle: String?
    let seek: () -> Void
    @State private var hovering = false

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(number != nil ? Color.rasan : Color(nsColor: .tertiaryLabelColor)).frame(width: 22, height: 22)
                if let number { Text("\(number)").font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(Color.black.opacity(0.85)) }
                else { Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Color(nsColor: .windowBackgroundColor)) }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(note.text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                    .strikethrough(number == nil, color: .secondary)
                HStack(spacing: 6) {
                    Text(reviewTime(note.time)).monospacedDigit()
                    if let sceneTitle { Text("· \(sceneTitle)").lineLimit(1) }
                    if note.scope == "film" { Label("Whole film", systemImage: "film").labelStyle(.titleOnly).padding(.horizontal, 6).padding(.vertical, 1).background(.quaternary, in: Capsule()) }
                    if let quick = note.quick, !quick.isEmpty, quick != note.text { Text(quick).padding(.horizontal, 6).padding(.vertical, 1).background(Color.rasan.opacity(0.16), in: Capsule()) }
                }
                .font(.system(size: 11)).foregroundStyle(.secondary)
                if number == nil, let resolution = note.resolution, !resolution.isEmpty {
                    Label(resolution, systemImage: "sparkles").font(.system(size: 11)).foregroundStyle(Color(nsColor: .systemGreen))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(Color(nsColor: .quaternaryLabelColor).opacity(hovering && number != nil ? 0.22 : 0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .opacity(number == nil ? 0.62 : 1)
        .contentShape(Rectangle())
        .onTapGesture(perform: seek)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(number == nil ? "Resolved note" : "Note \(number ?? 0)") at \(reviewTime(note.time)): \(note.text)")
        .accessibilityHint("Jumps the player to this moment")
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: Chips

/// A pill that shows a current choice and, when there are alternatives, opens a menu of them.
struct ReviewChip<MenuContent: View>: View {
    let symbol: String
    let title: String
    let value: String
    var enabled = true
    @ViewBuilder var menu: MenuContent

    var body: some View {
        Menu {
            menu
        } label: {
            HStack(spacing: 6) {
                Image(systemName: symbol).foregroundStyle(Color.rasan)
                Text(title).foregroundStyle(.secondary)
                Text(value).fontWeight(.semibold).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(.tertiary)
            }
            .font(.system(size: 12))
            .padding(.horizontal, 11).padding(.vertical, 6)
            .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: Capsule())
            .overlay { Capsule().strokeBorder(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 0.5) }
        }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
        .disabled(!enabled)
        .accessibilityLabel("\(title): \(value)")
    }
}
