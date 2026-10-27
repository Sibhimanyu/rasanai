import AVKit
import SwiftUI

/// A gray-box stand-in for a motion: a pure function of a looping time `t` in 0..<1. No state, no timers of its own.
struct MotionPlaceholderFrame: View {
    var role: String
    var t: Double   // 0..<1

    private func ease(_ x: Double) -> Double { let c = min(max(x, 0), 1); return c * c * (3 - 2 * c) }

    var body: some View {
        Canvas { ctx, size in
            let box = CGSize(width: size.width * 0.28, height: size.height * 0.34)
            let mid = CGPoint(x: size.width / 2, y: size.height / 2)
            let gray = GraphicsContext.Shading.color(.white.opacity(0.55))
            func draw(_ center: CGPoint, scale: Double = 1, alpha: Double = 1, size s: CGSize? = nil) {
                let b = s ?? box
                let r = CGRect(x: center.x - b.width * scale / 2, y: center.y - b.height * scale / 2, width: b.width * scale, height: b.height * scale)
                var c = ctx; c.opacity = alpha
                c.fill(Path(roundedRect: r, cornerRadius: 6), with: gray)
            }
            let hold = 0.25
            let p = ease(min(t / (1 - hold), 1)), out = ease((t - (1 - hold)) / hold)
            switch role {
            case "entry": draw(CGPoint(x: mid.x, y: mid.y + (1 - p) * size.height * 0.3), alpha: p)
            case "exit": draw(CGPoint(x: mid.x, y: mid.y - p * size.height * 0.3), alpha: 1 - p)
            case "emphasis": draw(mid, scale: 1 + 0.35 * sin(p * .pi))
            case "transition":
                draw(CGPoint(x: mid.x - p * size.width * 0.6, y: mid.y), size: CGSize(width: size.width * 0.5, height: box.height))
                draw(CGPoint(x: mid.x + (1 - p) * size.width * 0.6, y: mid.y), size: CGSize(width: size.width * 0.5, height: box.height))
            case "background":
                for i in 0..<4 {
                    let x = (Double(i) / 4 + t).truncatingRemainder(dividingBy: 1) * size.width
                    draw(CGPoint(x: x, y: size.height * (0.25 + 0.17 * Double(i))), size: CGSize(width: size.width * 0.14, height: size.height * 0.1))
                }
            case "scene":
                draw(CGPoint(x: mid.x - size.width * 0.12, y: mid.y), scale: 0.8, alpha: p)
                draw(CGPoint(x: mid.x + size.width * 0.12, y: mid.y + (1 - p) * 20), scale: 0.6, alpha: p)
            case "ending":
                draw(mid, scale: 1 + 0.6 * (1 - p), alpha: 1 - out * 0.4)
            default: draw(mid, scale: 0.8 + 0.2 * p)
            }
        }
        .background(Workspace.canvas)
    }
}

/// The card's preview slot: a placeholder that animates only while the card is on screen, or a local clip when one exists.
struct MotionPreviewSlot: View {
    var item: String
    var role: String
    var cache: MotionPreviewCache
    var reduceMotion: Bool

    @State private var onScreen = false
    @State private var clip: URL?
    private let period = 2.4

    var body: some View {
        ZStack {
            if let clip {
                LoopingClip(url: clip)
            } else if onScreen && !reduceMotion {
                TimelineView(.animation) { tl in
                    MotionPlaceholderFrame(role: role, t: tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period)
                }
            } else {
                MotionPlaceholderFrame(role: role, t: 0.55)
            }
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Workspace.hairline))
        .overlay(alignment: .bottomLeading) {
            if clip == nil {
                Text("Placeholder preview").font(.caption2).foregroundStyle(.secondary).padding(6)
            }
        }
        .onAppear { onScreen = true }
        .onDisappear { onScreen = false }
        .task(id: item) { clip = await cache.previewURL(for: item) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(clip == nil ? "Placeholder preview of a \(role) motion" : "Preview clip of this motion")
    }
}

private struct LoopingClip: View {
    var url: URL
    var body: some View { StudioVideoPlayer(url: url, muted: true, loops: true, autoplay: true) }
}
