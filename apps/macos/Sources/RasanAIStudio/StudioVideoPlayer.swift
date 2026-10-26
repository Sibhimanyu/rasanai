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
    /// nil: the picture fills the space it is given.
    var aspect: Double?
    @State private var playback: VideoPlayback?
    @State private var token = UUID()

    init(url: URL, fallbackDuration: Double = 0, muted: Bool = false, loops: Bool = false, autoplay: Bool = false, aspect: Double? = nil) {
        source = .url(url); self.fallbackDuration = fallbackDuration; self.muted = muted; self.loops = loops; self.autoplay = autoplay; self.aspect = aspect
    }

    init(player: AVPlayer, fallbackDuration: Double = 0, muted: Bool = false, loops: Bool = false, autoplay: Bool = false, aspect: Double? = nil) {
        source = .player(player); self.fallbackDuration = fallbackDuration; self.muted = muted; self.loops = loops; self.autoplay = autoplay; self.aspect = aspect
    }

    var body: some View {
        VStack(spacing: 6) {
            if let playback, !VideoStageOverlay.shared.isShowing(token) {
                StudioVideoStage(playback: playback, aspect: aspect, isFullScreen: false) { VideoStageOverlay.shared.present(playback, owner: token) }
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
    var onFullScreen: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Color.black
                if let player = playback.avPlayer { NativeFilmPlayer(player: player) }
            }
            .modifier(PictureShape(aspect: aspect ?? playback.videoSize.map { $0.height > 0 ? $0.width / $0.height : 16 / 9 }))
            .contentShape(Rectangle())
            .onTapGesture { playback.toggle() }
            ReviewTransport(playback: playback, scenes: [], canNote: false, onNote: {}, onFullScreen: onFullScreen,
                            showNote: false, isFullScreen: isFullScreen)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color.black, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
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


/// Full screen for `StudioVideoPlayer`: the picture, with its transport bar, over the whole Studio window (sidebar and toolbar
/// band included), hosted once by `StudioView`. It is not a sheet and not another window, so it works the same when the
/// app's window already sits on its own full-screen Space. From a windowed app it also takes the window into real full
/// screen, and brings it back on exit. Esc, F or the exit button leave.
@MainActor @Observable
final class VideoStageOverlay {
    static let shared = VideoStageOverlay()
    private(set) var playback: VideoPlayback?
    private var owner: UUID?
    private var enteredFullScreen = false
    private weak var window: NSWindow?

    func isShowing(_ owner: UUID) -> Bool { playback != nil && self.owner == owner }

    func present(_ playback: VideoPlayback, owner: UUID) {
        let window = NSApp.keyWindow ?? NSApp.mainWindow
        self.window = window
        if let window, !window.styleMask.contains(.fullScreen) {
            enteredFullScreen = true
            window.toggleFullScreen(nil)
        } else { enteredFullScreen = false }
        self.owner = owner
        self.playback = playback
    }

    func dismiss(owner: UUID? = nil) {
        guard playback != nil, owner == nil || owner == self.owner else { return }
        playback = nil
        self.owner = nil
        if enteredFullScreen, let window, window.styleMask.contains(.fullScreen) { window.toggleFullScreen(nil) }
        enteredFullScreen = false
        window = nil
    }
}

struct VideoStageOverlayHost: View {
    private let overlay = VideoStageOverlay.shared
    @FocusState private var focused: Bool

    var body: some View {
        if let playback = overlay.playback {
            StudioVideoStage(playback: playback, aspect: nil, isFullScreen: true) { overlay.dismiss() }
                .padding(14)
                .background(Color.black.ignoresSafeArea())
                .environment(\.colorScheme, .dark)
                .focusable().focused($focused).focusEffectDisabled()
                .onAppear { focused = true }
                .onExitCommand { overlay.dismiss() }
                .onKeyPress("f") { overlay.dismiss(); return .handled }
                .transition(.opacity)
        }
    }
}
