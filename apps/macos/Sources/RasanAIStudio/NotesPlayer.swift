import AppKit
import AVFoundation
import AVKit
import Observation
import StudioCore
import SwiftUI

// MARK: - Notes player
//
// The review room shared by the Animatic and the Final: a dark, film-forward player with a precise transport, a scrubber
// that carries scene ticks and note marks, a scene strip, marks on the frame (click, box, circle: they go to the chat with Rasan), pins and a notes list.
//
//   FilmTiming            pure timing math (which scene at time t, scene navigation), unit tested
//   FilmPlayback          the clock the panel drives: AnimaticPlayback (key frames + music bed) or VideoPlayback (AVPlayer)
//   ReviewPlayerPanel     frame + overlays, scrubber, transport, scene strip, keys (Space, arrows, C), marking
//   ReviewNotesList       open notes (numbered like their pins) and resolved ones, dimmed, with "what changed"

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
    var volume: Double { get set }
    var rate: Double { get set }
    var loops: Bool { get set }
    /// The AVPlayer behind the clock, when there is one (speed, frame stepping and full screen need it).
    var avPlayer: AVPlayer? { get }
    func play()
    func pause()
    func seek(to seconds: Double)
    func step(frames: Int)
}

extension FilmPlayback {
    func toggle() { isPlaying ? pause() : play() }
    var avPlayer: AVPlayer? { nil }
    func step(frames: Int) { seek(to: time + Double(frames) / 30) }
}

/// Key frames at their real durations, with the music bed. The film clock is the master; the audio follows it.
@MainActor @Observable
final class AnimaticPlayback: FilmPlayback {
    private(set) var time = 0.0
    private(set) var duration = 1.0
    private(set) var isPlaying = false
    var isMuted = false { didSet { audio?.isMuted = isMuted } }
    var volume = 1.0 { didSet { audio?.volume = Float(volume) } }
    var rate = 1.0
    var loops = false
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
        if t >= duration {
            if loops { seek(to: 0); return }
            time = duration; pause(); return
        }
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
    var volume = 1.0 { didSet { player.volume = Float(volume) } }
    /// 0.5...2; applied as the player's default rate so play keeps it, pitch preserved.
    var rate = 1.0 {
        didSet {
            player.defaultRate = Float(rate)
            if isPlaying { player.rate = Float(rate) }
        }
    }
    var loops = false
    @ObservationIgnored let player = AVPlayer()
    var avPlayer: AVPlayer? { player }
    @ObservationIgnored private var rateObserver: NSKeyValueObservation?
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
        // The system's own controls (full screen) can pause or play the same player; follow them.
        rateObserver = player.observe(\.rate, options: [.new]) { [weak self] player, _ in
            let playing = player.rate != 0
            Task { @MainActor in
                guard let self, self.isPlaying != playing else { return }
                if playing { self.hasStarted = true }
                self.isPlaying = playing
            }
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
        item.audioTimePitchAlgorithm = .timeDomain
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
        player.defaultRate = Float(rate)
        player.rate = Float(rate)
    }

    func step(frames: Int) {
        guard isReady, !isPlaying else { return }
        player.currentItem?.step(byCount: frames)
        hasStarted = true
        time = FilmTiming.clamp(player.currentTime().seconds + Double(frames) / 30, duration)
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
        if loops, isReady {
            time = 0
            player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                Task { @MainActor in
                    guard let self, self.loops else { return }
                    self.player.rate = Float(self.rate)
                    self.isPlaying = true
                }
            }
            return
        }
        isPlaying = false
        if duration > 0 { time = duration }
    }
}

// MARK: Notes model

extension ReviewNote {
    var isOpen: Bool { state == "open" }
    /// "on “word”" when the note is anchored to a transcript word.
    var wordLabel: String? { wordID.map { "on “\($0)”" } }
}

// MARK: Palette

enum ReviewTheme {
    static let room = Color(red: 0.070, green: 0.075, blue: 0.090)
    static let roomRaised = Color(red: 0.094, green: 0.102, blue: 0.118)
    static let hairline = Color.white.opacity(0.07)
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

    /// The freehand stroke being drawn on the frame, in the frame's own coordinates, and the playhead when it began.
    @State private var stroke: [CGPoint] = []
    @State private var strokeTime = 0.0
    @State private var wasPlaying = false
    @FocusState private var focused: Bool
    @Environment(\.reviewFrameHeight) private var frameHeight

    private var open: [ReviewNote] { notes.filter(\.isOpen).sorted { $0.time < $1.time } }

    var body: some View {
        VStack(spacing: 0) {
            stage
            VStack(spacing: 10) {
                ReviewTimeline(playback: playback, scenes: scenes, notes: notes,
                               onPin: { model.openChat(at: $0) },
                               onBegin: { wasPlaying = playback.isPlaying; playback.pause() },
                               onEnd: { if wasPlaying { playback.play() } })
                ReviewTransport(playback: playback, scenes: scenes, canNote: canNote, onNote: { markFrame() },
                                onFullScreen: toggleFullScreen)
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
        .shadow(color: .black.opacity(0.18), radius: 14, y: 6)
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        // Take the keys only when nothing is being typed: a step that arrives while the person writes in the inspector must not steal them.
        .onAppear { if !(NSApp.keyWindow?.firstResponder is NSTextView) { focused = true } }
        .onKeyPress(phases: [.down, .repeat]) { handle($0) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Film player. Space plays or pauses, arrow keys move one second, J K L shuttle, F full screen, M mute, C leaves a note at the playhead.")
    }

    private func toggleFullScreen() {
        if let player = playback.avPlayer { FilmFullScreen.shared.toggle(player: player) }
    }

    /// Space, J/K/L, ←/→ (Shift: 5 s, Option: scenes), , and . (a frame), Home/End, F, M, C. Nothing with ⌘ or ⌃.
    private func handle(_ press: KeyPress) -> KeyPress.Result {
        guard !press.modifiers.contains(.command), !press.modifiers.contains(.control) else { return .ignored }
        switch press.key {
        case .space: playback.toggle(); return .handled
        case .leftArrow, .rightArrow:
            let forward = press.key == .rightArrow
            if press.modifiers.contains(.option) { return jump(forward: forward) }
            playback.seek(to: playback.time + (forward ? 1 : -1) * (press.modifiers.contains(.shift) ? 5 : 1))
            return .handled
        case .home: playback.seek(to: 0); return .handled
        case .end: playback.seek(to: playback.duration); return .handled
        default: break
        }
        switch press.characters.lowercased() {
        case "k": playback.pause(); return .handled
        case "j":
            guard playback.avPlayer != nil else { return .ignored }
            playback.rate = PlaybackSpeed.slower(than: playback.rate); if !playback.isPlaying { playback.play() }
            return .handled
        case "l":
            guard playback.avPlayer != nil else { playback.play(); return .handled }
            if playback.isPlaying { playback.rate = PlaybackSpeed.faster(than: playback.rate) } else { playback.play() }
            return .handled
        case ",": guard !playback.isPlaying else { return .ignored }; playback.step(frames: -1); return .handled
        case ".": guard !playback.isPlaying else { return .ignored }; playback.step(frames: 1); return .handled
        case "f": guard playback.avPlayer != nil else { return .ignored }; toggleFullScreen(); return .handled
        case "m": playback.isMuted.toggle(); return .handled
        case "c": guard canNote else { return .ignored }; markFrame(); return .handled
        default: return .ignored
        }
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
                let content = contentRect(in: size)
                ZStack {
                    frame()
                    PinsLayer(playback: playback, scenes: scenes, notes: open, window: pinWindow)
                    CaptionLayer(playback: playback, scenes: scenes, caption: caption)
                    // The mark waiting in the chat stays drawn on its frame; the one being drawn shows live.
                    if let pending = model.pendingMark, pending.step == step, abs(pending.time - playback.time) < 0.5 {
                        MarkGlyph(kind: pending.kind, rect: pending.rect, path: pending.path)
                            .frame(width: content.width, height: content.height).position(x: content.midX, y: content.midY)
                    }
                    if stroke.count > 1 {
                        let live = MarkGesture.classify(stroke, in: content)
                        MarkGlyph(kind: live.kind, rect: live.rect, path: live.path)
                            .frame(width: content.width, height: content.height).position(x: content.midX, y: content.midY)
                        Path { p in p.addLines(stroke) }
                            .stroke(Color.markAmber.opacity(0.55), style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                            .allowsHitTesting(false)
                    }
                    PlayOverlay(playback: playback)
                }
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            guard canNote else { return }
                            if stroke.isEmpty {
                                focused = true
                                playback.pause()
                                strokeTime = playback.time
                                stroke = [value.startLocation]
                            }
                            if let last = stroke.last, hypot(value.location.x - last.x, value.location.y - last.y) < 1.5 { return }
                            if stroke.count < 800 { stroke.append(value.location) }
                        }
                        .onEnded { value in
                            focused = true
                            defer { stroke = [] }
                            guard canNote, size.width > 0, size.height > 0 else {
                                // Without notes a click on the picture plays or pauses, as in every player.
                                if hypot(value.translation.width, value.translation.height) < 4 { playback.toggle() }
                                return
                            }
                            let points = stroke.isEmpty ? [value.startLocation, value.location] : stroke
                            let result = MarkGesture.classify(points, in: content)
                            attach(FilmMark(step: step, time: strokeTime, kind: result.kind, rect: result.rect, path: result.path, snapshot: nil))
                        }
                )
                .hoverCursor(.crosshair, enabled: canNote)
                .help(canNote ? "Click to point, drag to box, or circle an area to tell Rasan" : "")
                .position(x: box.size.width / 2, y: box.size.height / 2)
                .accessibilityLabel(canNote ? "Film frame. Click to point at something, drag to box it or circle it, then tell Rasan what to change." : "Film frame")
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

    // MARK: Marks

    /// Where the film is really drawn inside the fitted frame (the picture's own aspect, without letterbox bars).
    private func contentRect(in size: CGSize) -> CGRect {
        let full = CGRect(origin: .zero, size: size)
        guard let natural = playback.avPlayer?.currentItem?.presentationSize, natural.width > 0, natural.height > 0,
              size.width > 0, size.height > 0 else { return full }
        let scale = min(size.width / natural.width, size.height / natural.height)
        let fitted = CGSize(width: natural.width * scale, height: natural.height * scale)
        return CGRect(x: (size.width - fitted.width) / 2, y: (size.height - fitted.height) / 2, width: fitted.width, height: fitted.height)
    }

    /// The whole frame at the playhead (the C key and the Note button).
    private func markFrame() {
        guard canNote else { return }
        playback.pause()
        attach(.wholeFrame(step: step, time: playback.time))
    }

    /// Pauses, puts the mark in the chat composer and opens the chat. A frame grab follows once the player has one.
    private func attach(_ mark: FilmMark) {
        playback.pause()
        let index = FilmTiming.sceneIndex(at: mark.time, in: scenes)
        let thumbnail = index.flatMap { scenes[$0].thumbnail }.flatMap { model.fileURL($0) }
        model.attach(mark, player: playback.avPlayer, thumbnail: thumbnail)
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
                    PinView(number: index + 1, noteID: note.id, text: note.text, anchor: note.wordLabel)
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
    let noteID: String
    let text: String
    var anchor: String? = nil
    @Environment(NoteSkips.self) private var skips: NoteSkips?
    @Environment(FilmSessionModel.self) private var model: FilmSessionModel?
    @State private var hovering = false
    var body: some View {
        let skipped = skips?.ids.contains(noteID) == true
        let lit = model?.focusedNoteID == noteID
        ZStack {
            if lit { Circle().strokeBorder(Color.markAmber, lineWidth: 2.5).frame(width: 36, height: 36).transition(.opacity) }
            Circle().fill(Color.rasan).frame(width: 24, height: 24)
            Circle().strokeBorder(.white, lineWidth: 2).frame(width: 24, height: 24)
            Text("\(number)").font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(Color.black.opacity(0.85))
        }
        .shadow(color: .black.opacity(0.5), radius: 4, y: 2)
        .scaleEffect(hovering || lit ? 1.12 : 1)
        .animation(.snappy(duration: 0.18), value: lit)
        .overlay(alignment: .top) {
            if hovering {
                Text(anchor.map { "\($0)  " + text } ?? text).font(.system(size: 12)).foregroundStyle(.white).lineLimit(3).frame(maxWidth: 220, alignment: .leading)
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .fixedSize(horizontal: false, vertical: true)
                    .offset(y: 30).allowsHitTesting(false)
            }
        }
        .opacity(skipped ? 0.45 : 1)
        .zIndex(hovering ? 2 : 0)
        .onHover { hovering = $0 }
        .contextMenu {
            if let skips { Button(skipped ? "Include Note" : "Skip Note") { skips.toggle(noteID) } }
        }
        .animation(.snappy(duration: 0.15), value: hovering)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Note \(number): \(text)" + (skipped ? ", skipped" : ""))
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
        // Only at the very start or the very end (as a replay); the picture itself plays and pauses.
        let atEdge = playback.time < 0.05 || (playback.duration > 0 && playback.time >= playback.duration - 0.1)
        ZStack {
            if !playback.isPlaying && atEdge {
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
        .animation(.smooth(duration: 0.18), value: playback.isPlaying && atEdge)
    }
}

// MARK: Playback speeds and full screen

enum PlaybackSpeed {
    static let all: [Double] = [0.5, 0.75, 1, 1.25, 1.5, 2]
    static func label(_ rate: Double) -> String { String(format: "%g", rate) + "×" }
    static func faster(than rate: Double) -> Double { all.first { $0 > rate + 0.001 } ?? all[all.count - 1] }
    static func slower(than rate: Double) -> Double { all.last { $0 < rate - 0.001 } ?? all[0] }
}

/// The film full screen: a window with the system player (floating controls) on the same AVPlayer, so the playhead, the
/// page's clock and every control stay in sync. Esc or the green button brings the person back to the page.
@MainActor
final class FilmFullScreen: NSObject, NSWindowDelegate {
    static let shared = FilmFullScreen()
    private var window: NSWindow?

    func toggle(player: AVPlayer) {
        if let window {
            if window.styleMask.contains(.fullScreen) { window.toggleFullScreen(nil) } else { window.close() }
            return
        }
        let view = AVPlayerView()
        view.controlsStyle = .floating
        view.videoGravity = .resizeAspect
        view.allowsPictureInPicturePlayback = true
        view.player = player
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 960, height: 540),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Film"
        window.isReleasedWhenClosed = false
        window.backgroundColor = .black
        window.collectionBehavior = [.fullScreenPrimary]
        window.contentView = view
        window.delegate = self
        window.center()
        self.window = window
        window.makeKeyAndOrderFront(nil)
        window.toggleFullScreen(nil)
    }

    func windowDidExitFullScreen(_ notification: Notification) { window?.close() }

    func windowWillClose(_ notification: Notification) {
        (window?.contentView as? AVPlayerView)?.player = nil
        window?.delegate = nil
        window = nil
    }
}

// MARK: Timeline

/// The filmstrip timeline: scenes as thumbnails in proportion to their length, the playhead, note pins above the track
/// (grouped when close), a hover bubble with the time and scene, and a legend line.
struct ReviewTimeline<P: FilmPlayback>: View {
    let playback: P
    let scenes: [FilmScene]
    /// Every note on this step; open ones are amber and numbered like their pins on the frame, the rest grey.
    let notes: [ReviewNote]
    /// A pin was clicked (the first note of a group): the chat opens scrolled to it.
    var onPin: (ReviewNote) -> Void = { _ in }
    var onBegin: () -> Void = {}
    var onEnd: () -> Void = {}
    @Environment(NoteSkips.self) private var skips: NoteSkips?
    @State private var hoverX: CGFloat?
    @State private var hoverPin: String?
    @State private var dragging = false

    private let pinZone: CGFloat = 24
    private let trackHeight: CGFloat = 46

    private struct Pin: Identifiable {
        let id: String
        let x: CGFloat
        let notes: [ReviewNote]
    }

    private var sorted: [ReviewNote] { notes.sorted { $0.time < $1.time } }
    private var open: [ReviewNote] { sorted.filter(\.isOpen) }

    private func pins(width: CGFloat, duration: Double) -> [Pin] {
        var result: [(first: CGFloat, notes: [ReviewNote])] = []
        for note in sorted {
            let x = CGFloat(min(1, max(0, note.time / duration))) * width
            if let last = result.last, x - last.first < 14 { result[result.count - 1].notes.append(note) }
            else { result.append((x, [note])) }
        }
        return result.map { group in
            let xs = group.notes.map { CGFloat(min(1, max(0, $0.time / duration))) * width }
            return Pin(id: group.notes.map(\.id).joined(separator: "+"), x: xs.reduce(0, +) / CGFloat(xs.count), notes: group.notes)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            GeometryReader { box in
                let width = max(box.size.width, 1)
                let duration = max(playback.duration, 0.001)
                let x = CGFloat(min(1, max(0, playback.time / duration))) * width
                let placed = pins(width: width, duration: duration)
                ZStack(alignment: .topLeading) {
                    track(width: width, duration: duration, x: x)
                        .offset(y: pinZone)
                    // The playhead: a 2pt line across the track with a knob above it.
                    Rectangle().fill(.white).frame(width: 2, height: trackHeight)
                        .shadow(color: .black.opacity(0.5), radius: 2)
                        .offset(x: min(max(x - 1, 0), width - 2), y: pinZone)
                        .allowsHitTesting(false)
                    Circle().fill(.white).frame(width: 10, height: 10)
                        .shadow(color: .black.opacity(0.5), radius: 2)
                        .offset(x: min(max(x - 5, 0), width - 10), y: pinZone - 6)
                        .allowsHitTesting(false)
                    if let hoverX, !dragging {
                        Rectangle().fill(.white.opacity(0.45)).frame(width: 1, height: trackHeight)
                            .offset(x: min(max(hoverX, 0), width - 1), y: pinZone).allowsHitTesting(false)
                    }
                    ForEach(placed) { pin in
                        TimelinePin(notes: pin.notes, numbers: numbering(for: pin.notes), skipped: skippedIDs, hovering: hoverPin == pin.id)
                            .position(x: pin.x, y: pinZone / 2)
                            .onHover { inside in
                                if inside { hoverPin = pin.id } else if hoverPin == pin.id { hoverPin = nil }
                            }
                            .onTapGesture { if let first = pin.notes.first { onPin(first) } }
                            .zIndex(hoverPin == pin.id ? 3 : 1)
                    }
                }
                .frame(width: width, height: pinZone + trackHeight, alignment: .topLeading)
                // The hover bubble and the note card float above the timeline in an overlay, so showing them never changes
                // the timeline's own layout (inside the ZStack they grew it upward and the track jumped under the pointer).
                .overlay(alignment: .topLeading) {
                    if let id = hoverPin, let pin = placed.first(where: { $0.id == id }) {
                        PinCard(notes: pin.notes, numbers: numbering(for: pin.notes))
                            .alignmentGuide(.top) { $0[.bottom] + 4 }
                            .offset(x: min(max(pin.x - 115, 0), max(width - 230, 0)))
                            .allowsHitTesting(false)
                    } else if let hoverX, !dragging {
                        let t = Double(min(1, max(0, hoverX / width))) * duration
                        HoverBubble(text: reviewTime(t, tenths: true) + (FilmTiming.sceneIndex(at: t, in: scenes).map { " · \($0 + 1) " + scenes[$0].title } ?? ""))
                            .alignmentGuide(.top) { $0[.bottom] + 6 }
                            .offset(x: min(max(hoverX - 70, 0), max(width - 140, 0)))
                            .allowsHitTesting(false)
                    }
                }
                .animation(.snappy(duration: 0.14), value: hoverPin)
            }
            .frame(height: pinZone + trackHeight)
            .accessibilityElement()
            .accessibilityLabel("Timeline")
            .accessibilityValue("\(reviewTime(playback.time)) of \(reviewTime(playback.duration))")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: playback.seek(to: playback.time + 5)
                case .decrement: playback.seek(to: playback.time - 5)
                @unknown default: break
                }
            }
            legend
        }
    }

    private var skippedIDs: Set<String> { skips?.ids ?? [] }

    /// Open notes keep the number of their pin on the frame; resolved ones have none.
    private func numbering(for group: [ReviewNote]) -> [String: Int] {
        var map: [String: Int] = [:]
        for note in group { if let index = open.firstIndex(where: { $0.id == note.id }) { map[note.id] = index + 1 } }
        return map
    }

    private var legend: some View {
        let openCount = open.count
        return Text(notes.isEmpty ? "No notes yet · press C to leave one" : "\(notes.count) note\(notes.count == 1 ? "" : "s") · \(openCount) open")
            .font(.system(size: 11)).foregroundStyle(.white.opacity(0.5))
    }

    // MARK: Track

    private func track(width: CGFloat, duration: Double, x: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: 6, style: .continuous)
        return ZStack(alignment: .topLeading) {
            Rectangle().fill(.white.opacity(0.08))
            ForEach(Array(scenes.enumerated()), id: \.element.id) { index, scene in
                let left = CGFloat(scene.start / duration) * width
                let w = max(2, CGFloat(scene.duration / duration) * width - (index == scenes.count - 1 ? 0 : 1))
                ZStack(alignment: .topLeading) {
                    if let path = scene.thumbnail {
                        PayloadImage(path: path, contentMode: .fill, maxPixels: 240).frame(width: w, height: trackHeight).clipped()
                    }
                    Rectangle().fill(.black.opacity(0.42))
                    if w >= 36 {
                        Text("\(index + 1)").font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundStyle(.white.opacity(0.85)).shadow(color: .black.opacity(0.6), radius: 2)
                            .padding(.leading, 5).padding(.top, 3)
                    }
                }
                .frame(width: w, height: trackHeight)
                .clipped()
                .offset(x: left)
            }
            Rectangle().fill(Color.rasan.opacity(0.30)).frame(width: max(x, 0), height: trackHeight)
            Color.clear.contentShape(Rectangle())
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
        }
        .frame(width: width, height: trackHeight)
        .clipShape(shape)
        .overlay { shape.strokeBorder(.white.opacity(0.10), lineWidth: 1).allowsHitTesting(false) }
    }
}

private let noteAmber = Color(red: 1, green: 0.78, blue: 0.28)

/// A teardrop pin: its head carries the note number (or a count when notes are grouped), its stem touches the track.
private struct TimelinePin: View {
    let notes: [ReviewNote]
    let numbers: [String: Int]
    let skipped: Set<String>
    let hovering: Bool

    var body: some View {
        let active = notes.contains { $0.isOpen && !skipped.contains($0.id) }
        let color = active ? noteAmber : Color(white: 0.55)
        VStack(spacing: 0) {
            ZStack {
                Circle().fill(color)
                Circle().strokeBorder(.black.opacity(0.35), lineWidth: 1)
                if notes.count > 1 {
                    Text("\(notes.count)").font(.system(size: 10, weight: .bold, design: .rounded)).foregroundStyle(.black.opacity(0.85))
                } else if let note = notes.first, let number = numbers[note.id] {
                    Text("\(number)").font(.system(size: 10, weight: .bold, design: .rounded)).foregroundStyle(.black.opacity(0.85))
                } else {
                    Image(systemName: "checkmark").font(.system(size: 8, weight: .bold)).foregroundStyle(.black.opacity(0.7))
                }
            }
            .frame(width: 17, height: 17)
            Rectangle().fill(color).frame(width: 2, height: 7)
        }
        .frame(width: 22, height: 24)
        .scaleEffect(hovering ? 1.1 : 1, anchor: .bottom)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(notes.count > 1 ? "\(notes.count) notes near \(reviewTime(notes[0].time))" : "Note at \(reviewTime(notes.first?.time ?? 0)): \(notes.first?.text ?? "")")
        .accessibilityAddTraits(.isButton)
    }
}

private struct PinCard: View {
    let notes: [ReviewNote]
    let numbers: [String: Int]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(notes.prefix(3).enumerated()), id: \.element.id) { _, note in
                VStack(alignment: .leading, spacing: 3) {
                    Text(note.text).font(.system(size: 12)).foregroundStyle(.white).lineLimit(notes.count == 1 ? 3 : 2)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 5) {
                        if let n = numbers[note.id] { Text("#\(n)") }
                        Text(reviewTime(note.time, tenths: true))
                        Text("·")
                        Text(note.state.capitalized)
                    }
                    .font(.system(size: 10, weight: .medium)).foregroundStyle(.white.opacity(0.55))
                }
            }
            if notes.count > 3 { Text("+ \(notes.count - 3) more").font(.system(size: 10)).foregroundStyle(.white.opacity(0.55)) }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .frame(width: 230, alignment: .leading)
        .background(.black.opacity(0.88), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(.white.opacity(0.10), lineWidth: 1) }
        .shadow(color: .black.opacity(0.4), radius: 8, y: 3)
        .fixedSize(horizontal: false, vertical: true)
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

/// A quiet 30pt icon button: secondary until hovered, accent when switched on.
private struct PlayerIconButton: View {
    let symbol: String
    let help: String
    var active = false
    var disabled = false
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 13, weight: .medium))
                .foregroundStyle(active ? Color.rasan : .white.opacity(hovering ? 1 : 0.62))
                .frame(width: 30, height: 30)
                .background(.white.opacity(hovering && !disabled ? 0.08 : 0), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.35 : 1)
        .onHover { hovering = $0 }
        .help(help)
        .accessibilityLabel(help)
    }
}

struct ReviewTransport<P: FilmPlayback>: View {
    let playback: P
    let scenes: [FilmScene]
    var canNote: Bool
    var onNote: () -> Void
    var onFullScreen: () -> Void = {}
    @State private var showRemaining = false

    var body: some View {
        ViewThatFits(in: .horizontal) {
            row(compact: false)
            row(compact: true)
        }
        .foregroundStyle(.white)
    }

    private func row(compact: Bool) -> some View {
        let video = playback.avPlayer != nil
        return HStack(spacing: 2) {
            PlayerIconButton(symbol: "backward.end.fill", help: "Previous scene (⌥←)", disabled: scenes.isEmpty) {
                if let t = FilmTiming.jump(from: playback.time, forward: false, in: scenes) { playback.seek(to: t) }
            }
            PlayerIconButton(symbol: "gobackward.5", help: "Back 5 seconds (⇧←)") { playback.seek(to: playback.time - 5) }
            Button { playback.toggle() } label: {
                Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill").font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.black.opacity(0.85))
                    .frame(width: 36, height: 36)
                    .background(.white.opacity(playback.isReady ? 0.94 : 0.4), in: Circle())
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(PressableStyle())
            .padding(.horizontal, 3)
            .help("Play or pause (Space, K)").accessibilityLabel(playback.isPlaying ? "Pause" : "Play").disabled(!playback.isReady)
            PlayerIconButton(symbol: "goforward.5", help: "Forward 5 seconds (⇧→)") { playback.seek(to: playback.time + 5) }
            PlayerIconButton(symbol: "forward.end.fill", help: "Next scene (⌥→)", disabled: scenes.isEmpty) {
                if let t = FilmTiming.jump(from: playback.time, forward: true, in: scenes) { playback.seek(to: t) }
            }
            Button { showRemaining.toggle() } label: { TransportClock(playback: playback, remaining: showRemaining) }
                .buttonStyle(.plain).padding(.leading, 8)
                .help(showRemaining ? "Showing time remaining. Click for elapsed" : "Click to show time remaining")
            Spacer(minLength: 8)
            if video {
                Menu {
                    ForEach(PlaybackSpeed.all, id: \.self) { speed in
                        Button { playback.rate = speed } label: {
                            if abs(playback.rate - speed) < 0.001 { Label(PlaybackSpeed.label(speed), systemImage: "checkmark") } else { Text(PlaybackSpeed.label(speed)) }
                        }
                    }
                } label: {
                    Text(PlaybackSpeed.label(playback.rate)).font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(playback.rate == 1 ? .white.opacity(0.7) : Color.rasan)
                        .frame(minWidth: 34, minHeight: 30).padding(.horizontal, 4)
                        .contentShape(Rectangle())
                }
                .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
                .help("Playback speed (J slower, L faster)").accessibilityLabel("Playback speed \(PlaybackSpeed.label(playback.rate))")
                PlayerIconButton(symbol: "repeat", help: playback.loops ? "Loop on" : "Loop off", active: playback.loops) { playback.loops.toggle() }
            }
            PlayerIconButton(symbol: volumeSymbol, help: playback.isMuted ? "Unmute (M)" : "Mute (M)") { playback.isMuted.toggle() }
            if !compact {
                Slider(value: Binding(get: { playback.isMuted ? 0 : playback.volume },
                                      set: { playback.volume = $0; playback.isMuted = $0 <= 0.001 }), in: 0...1)
                    .controlSize(.mini).tint(.white.opacity(0.8)).frame(width: 70)
                    .help("Volume").accessibilityLabel("Volume")
            }
            if video { PlayerIconButton(symbol: "arrow.up.left.and.arrow.down.right", help: "Full screen (F)", action: onFullScreen) }
            Button(action: onNote) {
                Label("Note", systemImage: "plus.bubble.fill").font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10).frame(height: 28)
                    .background(Color.white.opacity(canNote ? 0.16 : 0.06), in: Capsule())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain).padding(.leading, 6)
            .disabled(!canNote)
            .help("Tell Rasan about this moment (C)").accessibilityLabel("Tell Rasan about the playhead")
        }
        .font(.system(size: 13))
    }

    private var volumeSymbol: String {
        if playback.isMuted || playback.volume <= 0.001 { return "speaker.slash.fill" }
        return playback.volume < 0.4 ? "speaker.wave.1.fill" : playback.volume < 0.75 ? "speaker.wave.2.fill" : "speaker.wave.3.fill"
    }
}

private struct TransportClock<P: FilmPlayback>: View {
    let playback: P
    var remaining = false
    var body: some View {
        HStack(spacing: 4) {
            Text(reviewTime(playback.time, tenths: true)).foregroundStyle(.white)
            Text("/").foregroundStyle(.white.opacity(0.35))
            Text(remaining ? "−" + reviewTime(max(0, playback.duration - playback.time)) : reviewTime(playback.duration)).foregroundStyle(.white.opacity(0.55))
        }
        .font(.system(size: 13, weight: .medium, design: .monospaced))
        .fixedSize()
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
                if let path = scene.thumbnail { PayloadImage(path: path, contentMode: .fill, maxPixels: 360).frame(width: width, height: 52).clipped() }
                else { Rectangle().fill(.white.opacity(0.07)) }
                LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .center, endPoint: .bottom)
                // Other scenes are dimmed under the label, not by fading the whole cell, so the title never flickers.
                Rectangle().fill(.black.opacity(current || hovering ? 0 : 0.3))
                if width > 64 {
                    Text("\(number)  \(scene.title)").font(.system(size: 10, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                        .padding(.horizontal, 6).padding(.bottom, 5)
                } else {
                    Text("\(number)").font(.system(size: 10, weight: .bold, design: .rounded)).foregroundStyle(.white).padding(.horizontal, 6).padding(.bottom, 5)
                }
                if current {
                    GeometryReader { box in
                        Rectangle().fill(Color.white.opacity(0.85)).frame(width: box.size.width * progress, height: 3)
                            .frame(maxHeight: .infinity, alignment: .bottom)
                    }
                }
            }
            .frame(width: width, height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(current ? Color.white : .white.opacity(hovering ? 0.35 : 0.08), lineWidth: current ? 2 : 1) }
            .overlay(alignment: .topTrailing) {
                if hasNote {
                    Circle().fill(Color(red: 1, green: 0.78, blue: 0.28)).frame(width: 8, height: 8)
                        .overlay { Circle().strokeBorder(.black.opacity(0.6), lineWidth: 1) }.padding(4)
                }
            }
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
