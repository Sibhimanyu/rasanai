import AppKit
import AVFoundation
import SwiftUI

/// A plain video preview with the same transport bar as the review screens (no notes): skip, 5 seconds, play, clock, speed,
/// loop, volume and full screen. Give it a file, or a player that is already loaded and shared with something else.
struct StudioVideoPlayer: View {
    enum Source: Equatable {
        case url(URL)
        case player(AVPlayer)
        static func == (a: Source, b: Source) -> Bool {
            switch (a, b) {
            case (.url(let x), .url(let y)): x == y
            case (.player(let x), .player(let y)): x === y
            default: false
            }
        }
    }

    let source: Source
    var fallbackDuration = 0.0
    var muted = false
    var loops = false
    var autoplay = false
    /// True on a page that has this one player (the Final page, a film in the library): it takes the keys when it appears,
    /// unless something is being typed. Otherwise it takes them when it is clicked, so a grid of previews never reacts together.
    var takesKeys = false
    /// nil: the picture fills the space it is given.
    var aspect: Double?
    @State private var playback: VideoPlayback?
    @State private var token = UUID()
    @FocusState private var focused: Bool

    init(url: URL, fallbackDuration: Double = 0, muted: Bool = false, loops: Bool = false, autoplay: Bool = false, takesKeys: Bool = false, aspect: Double? = nil) {
        source = .url(url); self.fallbackDuration = fallbackDuration; self.muted = muted; self.loops = loops; self.autoplay = autoplay; self.takesKeys = takesKeys; self.aspect = aspect
    }

    init(player: AVPlayer, fallbackDuration: Double = 0, muted: Bool = false, loops: Bool = false, autoplay: Bool = false, takesKeys: Bool = false, aspect: Double? = nil) {
        source = .player(player); self.fallbackDuration = fallbackDuration; self.muted = muted; self.loops = loops; self.autoplay = autoplay; self.takesKeys = takesKeys; self.aspect = aspect
    }

    var body: some View {
        VStack(spacing: 6) {
            if let playback, !VideoStageOverlay.shared.isShowing(token) {
                StudioVideoStage(playback: playback, aspect: aspect, isFullScreen: false, onFocus: { focused = true }) { VideoStageOverlay.shared.present(playback, owner: token) }
                    .playerKeys(playback: playback, focus: $focused) { VideoStageOverlay.shared.present(playback, owner: token) }
            }
            else { Color.black.aspectRatio(aspect ?? 16 / 9, contentMode: .fit) }
        }
        .environment(\.colorScheme, .dark)
        .task(id: source) { start() }
        .onDisappear { stop() }
    }

    private func start() {
        stop()
        let made: VideoPlayback
        switch source {
        case .url(let url):
            made = VideoPlayback()
            made.load(url: url, fallbackDuration: fallbackDuration)
        case .player(let player):
            made = VideoPlayback(player: player)
            made.adopt(fallbackDuration: fallbackDuration)
        }
        made.isMuted = muted
        made.loops = loops
        playback = made
        if takesKeys && PlayerKeys.canTakeFocus { focused = true }
        if autoplay {
            Task { @MainActor in
                for _ in 0..<40 where !made.isReady { try? await Task.sleep(for: .milliseconds(100)) }
                made.play()
            }
        }
    }

    private func stop() {
        VideoStageOverlay.shared.dismiss(owner: token)
        guard let playback else { return }
        if case .player = source { playback.pause(); playback.detach() } else { playback.shutdown(); playback.detach() }
        self.playback = nil
    }
}

private struct StudioVideoStage: View {
    let playback: VideoPlayback
    var aspect: Double?
    var isFullScreen: Bool
    var onFocus: () -> Void = {}
    var onFullScreen: () -> Void

    var body: some View {
        StageCardLayout {
            ZStack {
                Color.black
                if let player = playback.avPlayer { NativeFilmPlayer(player: player) }
            }
            .modifier(PictureShape(aspect: aspect ?? playback.videoSize.map { $0.height > 0 ? $0.width / $0.height : 16 / 9 }))
            .contentShape(Rectangle())
            .onTapGesture { onFocus(); playback.toggle() }
            VStack(spacing: 8) {
                TransportScrubber(playback: playback)
                ReviewTransport(playback: playback, scenes: [], canNote: false, onNote: {}, onFullScreen: onFullScreen,
                                showNote: false, isFullScreen: isFullScreen)
            }
            .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 10)
            .background(Color.black)
        }
        .clipShape(RoundedRectangle(cornerRadius: isFullScreen ? 0 : 14, style: .continuous))
    }
}

/// Picture on top, controls underneath, one card: the controls take exactly the picture's width, even when the picture is
/// letterboxed narrower than the space offered.
private struct StageCardLayout: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard subviews.count == 2 else { return .zero }
        let (picture, bar) = measure(proposal, subviews)
        return CGSize(width: picture.width, height: picture.height + bar.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 2 else { return }
        let (picture, bar) = measure(ProposedViewSize(width: bounds.width, height: bounds.height), subviews)
        subviews[0].place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(picture))
        subviews[1].place(at: CGPoint(x: bounds.minX, y: bounds.minY + picture.height), anchor: .topLeading,
                          proposal: ProposedViewSize(width: picture.width, height: bar.height))
    }

    private func measure(_ proposal: ProposedViewSize, _ subviews: Subviews) -> (picture: CGSize, bar: CGSize) {
        let width = proposal.width.map { $0.isFinite ? $0 : 640 } ?? 640
        let barHeight = subviews[1].sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        let room = proposal.height.map { max(0, $0 - barHeight) }
        let picture = subviews[0].sizeThatFits(ProposedViewSize(width: width, height: room))
        let pictureWidth = min(picture.width, width)
        let bar = subviews[1].sizeThatFits(ProposedViewSize(width: pictureWidth, height: nil))
        return (CGSize(width: pictureWidth, height: picture.height), CGSize(width: pictureWidth, height: bar.height))
    }
}

/// A slim timeline above the transport row: drag or click anywhere on it to scrub.
private struct TransportScrubber: View {
    let playback: VideoPlayback
    @State private var hovering = false
    @State private var dragging = false
    @State private var wasPlaying = false

    var body: some View {
        GeometryReader { geo in
            let width = max(1, geo.size.width)
            let duration = max(0, playback.duration)
            let fraction = duration > 0 ? min(1, max(0, playback.time / duration)) : 0
            let big = hovering || dragging
            let trackHeight: CGFloat = big ? 6 : 4
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.18)).frame(height: trackHeight)
                Capsule().fill(.white.opacity(0.9)).frame(width: width * fraction, height: trackHeight)
                Circle().fill(.white).frame(width: 12, height: 12)
                    .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
                    .offset(x: min(max(0, width * fraction - 6), width - 12))
                    .opacity(big ? 1 : 0)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { value in
                    guard duration > 0 else { return }
                    if !dragging { dragging = true; wasPlaying = playback.isPlaying; playback.pause() }
                    playback.scrub(to: min(max(0, value.location.x / width), 1) * duration)
                }
                .onEnded { value in
                    guard dragging else { return }
                    dragging = false
                    if duration > 0 { playback.seek(to: min(max(0, value.location.x / width), 1) * duration) }
                    if wasPlaying { playback.play() }
                })
            .animation(.easeOut(duration: 0.12), value: big)
        }
        .frame(height: 20)
        .onHover { hovering = $0 }
        .accessibilityElement()
        .accessibilityLabel("Playback position")
        .accessibilityValue("\(reviewTime(playback.time)) of \(reviewTime(playback.duration))")
        .accessibilityAdjustableAction { direction in
            let step: Double = direction == .increment ? 5 : -5
            playback.seek(to: min(max(0, playback.time + step), max(0, playback.duration)))
        }
    }
}

private struct PictureShape: ViewModifier {
    var aspect: Double?
    func body(content: Content) -> some View {
        if let aspect { content.aspectRatio(aspect, contentMode: .fit) }
        else { content.frame(maxWidth: .infinity, maxHeight: .infinity) }
    }
}


/// Full screen for `StudioVideoPlayer`: the same window as the review screens' full screen (`FilmTheater`: its own borderless-
/// looking window on its own Space, no toolbar, sidebar or title bar), showing the picture edge to edge with the scrubber and
/// transport over a dark gradient. Esc, F or the exit button leave and put the person back on the page.
@MainActor @Observable
final class VideoStageOverlay {
    static let shared = VideoStageOverlay()
    private(set) var playback: VideoPlayback?
    private var owner: UUID?

    func isShowing(_ owner: UUID) -> Bool { playback != nil && self.owner == owner }

    func present(_ playback: VideoPlayback, owner: UUID) {
        guard !FilmTheater.shared.isOpen else { return }
        self.owner = owner
        self.playback = playback
        FilmTheater.shared.open(title: "Preview", onClose: { [weak self] in
            self?.playback = nil
            self?.owner = nil
        }) {
            StudioTheaterView(playback: playback)
        }
    }

    func dismiss(owner: UUID? = nil) {
        guard playback != nil, owner == nil || owner == self.owner else { return }
        FilmTheater.shared.close()
    }
}

/// The full-screen layout for a plain preview: the picture aspect-fit on black, and a bar of scrubber and transport that fades
/// away while it plays and the pointer rests, like the review screens' full screen.
private struct StudioTheaterView: View {
    let playback: VideoPlayback
    @State private var chrome = true
    @State private var idle = IdleClock()
    @FocusState private var focused: Bool

    private final class IdleClock { var last = Date() }
    private var showsChrome: Bool { chrome || !playback.isPlaying }
    private func close() { VideoStageOverlay.shared.dismiss() }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black
            ZStack {
                if let player = playback.avPlayer { NativeFilmPlayer(player: player) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .onTapGesture { playback.toggle() }
            VStack(spacing: 10) {
                TransportScrubber(playback: playback)
                ReviewTransport(playback: playback, scenes: [], canNote: false, onNote: {}, onFullScreen: close,
                                showNote: false, isFullScreen: true)
            }
            .padding(.horizontal, 40).padding(.top, 70).padding(.bottom, 26)
            .background(LinearGradient(colors: [.clear, .black.opacity(0.88)], startPoint: .top, endPoint: .bottom).allowsHitTesting(false))
            .opacity(showsChrome ? 1 : 0)
            .animation(.easeOut(duration: showsChrome ? 0.15 : 0.35), value: showsChrome)
        }
        .ignoresSafeArea()
        .environment(\.colorScheme, .dark)
        .onContinuousHover { phase in if case .active = phase { poke() } }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(400))
                if chrome, playback.isPlaying, Date().timeIntervalSince(idle.last) > 2.5 {
                    chrome = false
                    NSCursor.setHiddenUntilMouseMoves(true)
                }
            }
        }
        .playerKeys(playback: playback, focus: $focused, onFullScreen: close, onEscape: close, onKey: poke)
        .onAppear { focused = true }
    }

    private func poke() {
        idle.last = Date()
        if !chrome { chrome = true }
    }
}
