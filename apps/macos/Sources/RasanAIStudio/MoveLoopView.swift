import AVFoundation
import AppKit
import SwiftUI

/// A muted, control-less video that loops forever, for hero-move roughs. It plays only while it is in a window.
final class MoveLoopPlayerView: NSView {
    private var queue: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private let host = AVPlayerLayer()
    private var pending: URL?

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        host.videoGravity = .resizeAspectFill
        layer?.addSublayer(host)
    }
    required init?(coder: NSCoder) { fatalError() }
    override func layout() { super.layout(); host.frame = bounds }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil { stop() } else if let pending, queue == nil { load(pending) }
    }
    func load(_ url: URL) {
        pending = url
        stop()
        guard window != nil else { return }
        let player = AVQueuePlayer()
        player.isMuted = true
        looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
        host.player = player
        queue = player
        player.play()
    }
    func stop() { queue?.pause(); looper?.disableLooping(); looper = nil; host.player = nil; queue = nil }
}

struct MoveLoopingVideo: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> MoveLoopPlayerView { let v = MoveLoopPlayerView(); v.load(url); return v }
    func updateNSView(_ view: MoveLoopPlayerView, context: Context) {
        if context.coordinator.url != url { context.coordinator.url = url; view.load(url) }
    }
    static func dismantleNSView(_ view: MoveLoopPlayerView, coordinator: Coordinator) { view.stop() }
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    final class Coordinator { var url: URL; init(url: URL) { self.url = url } }
}
