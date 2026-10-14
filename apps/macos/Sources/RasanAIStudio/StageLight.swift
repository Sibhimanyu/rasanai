import AVFoundation
import CoreImage
import SwiftUI

/// The light the stage's picture throws onto the glass around it, as a lit screen does in a dark room: the colour and
/// brightness of the strip along the frame's right edge (it falls on the inspector beside it) and along its bottom edge
/// (it falls on the action bar under it). The stage samples its own picture a few times a second; the glass reads this.
@MainActor @Observable
final class StageLight {
    struct Glow: Equatable, Sendable {
        var red: Double, green: Double, blue: Double
        /// Relative luminance, 0 (black) to 1 (white): how strongly the strip lights the glass.
        var brightness: Double { 0.2126 * red + 0.7152 * green + 0.0722 * blue }
        var color: Color { Color(.sRGB, red: red, green: green, blue: blue) }
    }

    private(set) var right: Glow?
    private(set) var bottom: Glow?
    /// The stage view that set the light last. An outgoing stage clears only its own light, never the next one's.
    @ObservationIgnored private var owner: UUID?

    func update(_ glows: (right: Glow?, bottom: Glow?), from source: UUID) {
        owner = source
        guard glows.right != right || glows.bottom != bottom else { return }
        withAnimation(.easeInOut(duration: 0.6)) { right = glows.right; bottom = glows.bottom }
    }

    func clear(from source: UUID) {
        guard owner == source else { return }
        owner = nil
        withAnimation(.easeInOut(duration: 0.6)) { right = nil; bottom = nil }
    }

    // MARK: Sampling

    nonisolated private static let context = CIContext(options: [.cacheIntermediates: false])

    /// The average colour of the right and bottom strips (a third of the frame each). Downscaled first; one pixel each.
    nonisolated static func sample(_ image: CIImage) -> (right: Glow?, bottom: Glow?) {
        let extent = image.extent
        guard extent.width > 1, extent.height > 1, extent.width.isFinite else { return (nil, nil) }
        let scale = min(1, 160 / extent.width)
        let small = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let box = small.extent
        // Core Image's origin is the bottom left, so the bottom strip starts at minY.
        let rightStrip = CGRect(x: box.minX + box.width * 0.7, y: box.minY, width: box.width * 0.3, height: box.height)
        let bottomStrip = CGRect(x: box.minX, y: box.minY, width: box.width, height: box.height * 0.3)
        return (average(small, in: rightStrip), average(small, in: bottomStrip))
    }

    /// Samples a still on disk (a scene's key frame, the poster), small and off the main thread.
    nonisolated static func sample(url: URL) -> (right: Glow?, bottom: Glow?) {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                                                        kCGImageSourceCreateThumbnailWithTransform: true,
                                                                        kCGImageSourceThumbnailMaxPixelSize: 240] as CFDictionary)
        else { return (nil, nil) }
        return sample(CIImage(cgImage: cg))
    }

    nonisolated private static func average(_ image: CIImage, in rect: CGRect) -> Glow? {
        let mean = image.applyingFilter("CIAreaAverage", parameters: [kCIInputExtentKey: CIVector(cgRect: rect)])
        var pixel = [Float](repeating: 0, count: 4)
        context.render(mean, toBitmap: &pixel, rowBytes: 16, bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                       format: .RGBAf, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
        guard pixel.allSatisfy(\.isFinite) else { return nil }
        return Glow(red: Double(min(max(pixel[0], 0), 1)), green: Double(min(max(pixel[1], 0), 1)), blue: Double(min(max(pixel[2], 0), 1)))
    }
}

extension EnvironmentValues {
    @Entry var stageLight: StageLight?
}

extension View {
    /// The stage shows this still (a scene's key frame, the poster): it lights the glass around it.
    func lightsGlass(still url: URL?) -> some View { modifier(StillLight(url: url)) }
    /// The stage plays this video: its current frame lights the glass, a few times a second.
    func lightsGlass(video playback: VideoPlayback) -> some View { modifier(VideoLight(playback: playback)) }
}

private struct StillLight: ViewModifier {
    let url: URL?
    @Environment(\.stageLight) private var light
    @State private var id = UUID()
    func body(content: Content) -> some View {
        content
            .task(id: url) {
                guard let light else { return }
                guard let url else { light.clear(from: id); return }
                let glows = await Task.detached(priority: .utility) { StageLight.sample(url: url) }.value
                guard !Task.isCancelled else { return }
                light.update(glows, from: id)
            }
            .onDisappear { light?.clear(from: id) }
    }
}

private struct VideoLight: ViewModifier {
    let playback: VideoPlayback
    @Environment(\.stageLight) private var light
    @State private var id = UUID()
    func body(content: Content) -> some View {
        content
            .task {
                guard let light else { return }
                var sampledAt = -1.0
                while !Task.isCancelled {
                    // Only when the picture moved; a paused film keeps the light of its frame.
                    if playback.time != sampledAt, let frame = playback.lightFrame() {
                        sampledAt = playback.time
                        light.update(StageLight.sample(frame), from: id)
                    }
                    try? await Task.sleep(for: .milliseconds(250))
                }
            }
            .onDisappear { light?.clear(from: id) }
    }
}
