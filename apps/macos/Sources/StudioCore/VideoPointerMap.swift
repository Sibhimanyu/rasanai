import Foundation
import CoreGraphics

// Plan 10 U4: where is the pointer on the FILM, not on the view. A pure function, so it is testable without a window.
// The video is drawn inside a view with letterboxing (fit) or cropping (fill), possibly cropped to a sub-rectangle of the frame (a vertical cut of a wide
// master), possibly fullscreen (a different view size) and on a high-DPI display (backing pixels). All of that lives in `VideoViewGeometry`; the result is
// frame-normalised coordinates (0...1 of the FULL master frame), the pixel in the master, and whether the pointer is on the picture or on a bar.
// The engine side of the same idea is `letterboxToFrameNorm` in lib/element-index/core.mjs.

public enum VideoFit: String, Sendable, Equatable {
    /// The whole picture is visible; bars fill the rest (AVLayerVideoGravity.resizeAspect).
    case fit
    /// The picture fills the view and the overflow is cut (resizeAspectFill).
    case fill
}

public struct VideoViewGeometry: Equatable, Sendable {
    /// The view in points (origin top-left).
    public var viewSize: CGSize
    /// The master frame in pixels (the element index's frame_size).
    public var frameSize: CGSize
    /// The visible part of the frame, normalised to the frame (default: all of it).
    public var visibleCrop: CGRect
    public var fit: VideoFit
    /// Points of chrome over the view that are not picture (top, left, bottom, right), e.g. a fullscreen toolbar overlay.
    public var insets: Insets
    /// Backing scale of the screen (2 on Retina).
    public var backingScale: CGFloat

    public struct Insets: Equatable, Sendable {
        public var top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat
        public init(top: CGFloat = 0, left: CGFloat = 0, bottom: CGFloat = 0, right: CGFloat = 0) { self.top = top; self.left = left; self.bottom = bottom; self.right = right }
        public static let zero = Insets()
    }

    public init(viewSize: CGSize, frameSize: CGSize, visibleCrop: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1), fit: VideoFit = .fit, insets: Insets = .zero, backingScale: CGFloat = 1) {
        self.viewSize = viewSize; self.frameSize = frameSize; self.visibleCrop = visibleCrop; self.fit = fit; self.insets = insets; self.backingScale = backingScale
    }

    /// Pixel size of the visible part of the master.
    var visiblePixels: CGSize { CGSize(width: frameSize.width * visibleCrop.width, height: frameSize.height * visibleCrop.height) }
    /// The area of the view that can show picture.
    var usable: CGRect {
        CGRect(x: insets.left, y: insets.top, width: max(0, viewSize.width - insets.left - insets.right), height: max(0, viewSize.height - insets.top - insets.bottom))
    }
    var isValid: Bool {
        viewSize.width > 0 && viewSize.height > 0 && frameSize.width > 0 && frameSize.height > 0 && visibleCrop.width > 0 && visibleCrop.height > 0
            && visibleCrop.minX >= 0 && visibleCrop.minY >= 0 && visibleCrop.maxX <= 1.000001 && visibleCrop.maxY <= 1.000001 && usable.width > 0 && usable.height > 0
    }
}

public struct MappedPointer: Equatable, Sendable {
    /// On the picture (true) or on a bar / in an inset (false).
    public var onPicture: Bool
    /// 0...1 of the FULL master frame. For a pointer off the picture this is the nearest picture point (clamped), so a drag can continue past the edge.
    public var frameNorm: CGPoint
    /// The same point in master pixels.
    public var framePixel: CGPoint
    /// The pointer in the view's backing pixels (points x backing scale).
    public var backingPixel: CGPoint
}

public enum VideoPointerMap {
    /// Where the picture is drawn inside the view, in view points. nil when the geometry is not usable (a zero-sized view, a bad crop).
    public static func contentRect(_ g: VideoViewGeometry) -> CGRect? {
        guard g.isValid else { return nil }
        let area = g.usable
        let vis = g.visiblePixels
        let scale = g.fit == .fit ? min(area.width / vis.width, area.height / vis.height) : max(area.width / vis.width, area.height / vis.height)
        let w = vis.width * scale, h = vis.height * scale
        return CGRect(x: area.minX + (area.width - w) / 2, y: area.minY + (area.height - h) / 2, width: w, height: h)
    }

    /// The part of the frame (frame-normalised) that is actually on screen. Under .fit this is the visible crop; under .fill the overflow is cut as well.
    public static func shownFrame(_ g: VideoViewGeometry) -> CGRect? {
        guard let content = contentRect(g) else { return nil }
        let area = g.usable
        let l = max(content.minX, area.minX), r = min(content.maxX, area.maxX), t = max(content.minY, area.minY), b = min(content.maxY, area.maxY)
        let u0 = (l - content.minX) / content.width, u1 = (r - content.minX) / content.width
        let v0 = (t - content.minY) / content.height, v1 = (b - content.minY) / content.height
        return CGRect(x: g.visibleCrop.minX + u0 * g.visibleCrop.width, y: g.visibleCrop.minY + v0 * g.visibleCrop.height,
                      width: (u1 - u0) * g.visibleCrop.width, height: (v1 - v0) * g.visibleCrop.height)
    }

    /// A pointer in view points (origin top-left) -> the film. nil only when the geometry is unusable.
    public static func map(_ point: CGPoint, in g: VideoViewGeometry) -> MappedPointer? {
        guard let content = contentRect(g) else { return nil }
        let area = g.usable
        let u = (point.x - content.minX) / content.width
        let v = (point.y - content.minY) / content.height
        // On the picture: inside the drawn rect AND inside the area that can show picture (under .fill the rect overflows the view).
        let onPicture = u >= 0 && u <= 1 && v >= 0 && v <= 1 && area.contains(point)
        let cu = min(1, max(0, u)), cv = min(1, max(0, v))
        var fx = g.visibleCrop.minX + cu * g.visibleCrop.width
        var fy = g.visibleCrop.minY + cv * g.visibleCrop.height
        if g.fit == .fill, let shown = shownFrame(g) { fx = min(shown.maxX, max(shown.minX, fx)); fy = min(shown.maxY, max(shown.minY, fy)) }
        let norm = CGPoint(x: fx, y: fy)
        return MappedPointer(onPicture: onPicture, frameNorm: norm, framePixel: CGPoint(x: norm.x * g.frameSize.width, y: norm.y * g.frameSize.height),
                             backingPixel: CGPoint(x: point.x * g.backingScale, y: point.y * g.backingScale))
    }

    /// The inverse, for drawing an overlay: a frame-normalised point -> view points. nil when it is outside the visible crop or the geometry is unusable.
    public static func viewPoint(forFrameNorm n: CGPoint, in g: VideoViewGeometry) -> CGPoint? {
        guard let content = contentRect(g) else { return nil }
        let u = (n.x - g.visibleCrop.minX) / g.visibleCrop.width
        let v = (n.y - g.visibleCrop.minY) / g.visibleCrop.height
        guard u >= -0.000001, u <= 1.000001, v >= -0.000001, v <= 1.000001 else { return nil }
        return CGPoint(x: content.minX + u * content.width, y: content.minY + v * content.height)
    }

    /// A frame-normalised rect (an element's bounds) -> view points, clipped to the visible crop. nil when it is entirely outside.
    public static func viewRect(forFrameNorm r: CGRect, in g: VideoViewGeometry) -> CGRect? {
        guard let content = contentRect(g) else { return nil }
        let clipped = r.intersection(g.visibleCrop)
        guard !clipped.isNull, clipped.width > 0, clipped.height > 0 else { return nil }
        let u0 = (clipped.minX - g.visibleCrop.minX) / g.visibleCrop.width, u1 = (clipped.maxX - g.visibleCrop.minX) / g.visibleCrop.width
        let v0 = (clipped.minY - g.visibleCrop.minY) / g.visibleCrop.height, v1 = (clipped.maxY - g.visibleCrop.minY) / g.visibleCrop.height
        return CGRect(x: content.minX + u0 * content.width, y: content.minY + v0 * content.height, width: (u1 - u0) * content.width, height: (v1 - v0) * content.height)
    }

    /// The movement between two view points as FRACTIONS OF THE FRAME (what the engine's `fields.position {dx, dy}` means). Uses the clamped mapped points, so
    /// dragging past the edge of the picture stops at the edge.
    public static func frameDelta(from a: CGPoint, to b: CGPoint, in g: VideoViewGeometry) -> CGVector? {
        guard let p = map(a, in: g), let q = map(b, in: g) else { return nil }
        return CGVector(dx: q.frameNorm.x - p.frameNorm.x, dy: q.frameNorm.y - p.frameNorm.y)
    }
}
