@preconcurrency import AVFoundation
import AppKit
import Foundation
import QuartzCore

/// One timed caption: plain text (markup stripped) shown from `start` to `end`, in seconds.
public struct CaptionCue: Sendable, Equatable {
    public var start: TimeInterval
    public var end: TimeInterval
    public var text: String
    public init(start: TimeInterval, end: TimeInterval, text: String) { self.start = start; self.end = end; self.text = text }
    public var duration: TimeInterval { end - start }
}

/// Small, forgiving SRT and WebVTT parser. Malformed blocks are skipped, never thrown on.
public enum CaptionParser {
    public static func parse(_ raw: String) -> [CaptionCue] {
        var text = raw
        if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
        text = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        var cues: [CaptionCue] = []
        for block in text.components(separatedBy: "\n\n") {
            let lines = block.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            guard let timingIndex = lines.firstIndex(where: { $0.contains("-->") }) else { continue }
            // NOTE / STYLE / REGION blocks never carry a timing line before their text, but guard anyway.
            if let first = lines.first?.trimmingCharacters(in: .whitespaces), first.hasPrefix("NOTE") || first.hasPrefix("STYLE") || first.hasPrefix("REGION") { continue }
            let parts = lines[timingIndex].components(separatedBy: "-->")
            guard parts.count == 2, let start = time(parts[0]),
                  let endToken = parts[1].split(whereSeparator: { $0 == " " || $0 == "\t" }).first, let end = time(String(endToken)),
                  end > start else { continue }
            let body = lines[(timingIndex + 1)...].map { clean($0) }.filter { !$0.isEmpty }.joined(separator: "\n")
            guard !body.isEmpty else { continue }
            cues.append(CaptionCue(start: start, end: end, text: body))
        }
        return cues.sorted { $0.start < $1.start }
    }

    public static func parse(contentsOf url: URL) -> [CaptionCue] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        return parse(String(decoding: data, as: UTF8.self))
    }

    /// "00:01:02,500", "01:02.500" and "1.5" style timestamps.
    static func time(_ token: String) -> TimeInterval? {
        let value = token.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        let fields = value.split(separator: ":", omittingEmptySubsequences: false)
        guard (1...3).contains(fields.count) else { return nil }
        var seconds = 0.0
        for field in fields {
            guard let number = Double(field), number >= 0, field.allSatisfy({ $0.isNumber || $0 == "." }) else { return nil }
            seconds = seconds * 60 + number
        }
        return seconds
    }

    /// Drops inline tags (<i>, <c.yellow>, <00:01.000>) and the common entities.
    static func clean(_ line: String) -> String {
        line.replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ").replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">").replacingOccurrences(of: "&amp;", with: "&")
            .trimmingCharacters(in: .whitespaces)
    }
}

/// Sizing rules for burned-in subtitles, kept pure so they are testable.
public enum CaptionLayout {
    /// About 4.6% of the picture height (33 pt at 720p, 50 pt at 1080p), narrowed for tall video so lines stay short.
    public static func fontSize(width: CGFloat, height: CGFloat) -> CGFloat {
        max(14, min(height * 0.046, width * 0.062)).rounded()
    }
    public static func bottomMargin(height: CGFloat) -> CGFloat { (height * 0.06).rounded() }
    public static func maxTextWidth(width: CGFloat) -> CGFloat { (width * 0.84).rounded() }
    /// Largest size that fits inside the preset's frame, never upscaling.
    public static func fittedSize(_ size: CGSize, within limit: CGSize?) -> CGSize {
        guard let limit else { return even(size) }
        let longSide = max(size.width, size.height), shortSide = min(size.width, size.height)
        let scale = min(1, max(limit.width, limit.height) / longSide, min(limit.width, limit.height) / shortSide)
        return even(CGSize(width: size.width * scale, height: size.height * scale))
    }
    static func even(_ size: CGSize) -> CGSize {
        CGSize(width: max(2, (size.width / 2).rounded() * 2), height: max(2, (size.height / 2).rounded() * 2))
    }
}

/// Builds an export session that draws the cues into the picture.
public enum CaptionBurner {
    public enum BurnError: LocalizedError {
        case noVideo, noCues, unsupported
        public var errorDescription: String? {
            switch self {
            case .noVideo: "This render has no picture to add captions to."
            case .noCues: "No captions could be read from that file."
            case .unsupported: "This render can't be converted to the selected MP4 format. Export the original render instead."
            }
        }
    }

    /// `limit` is the preset's frame (for example 1920x1080); the picture is only ever scaled down to fit it.
    public static func exportSession(source: URL, cues: [CaptionCue], preset: String, limit: CGSize?, output: URL) async throws -> AVAssetExportSession {
        guard !cues.isEmpty else { throw BurnError.noCues }
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw BurnError.noVideo }
        let (natural, transform, duration, rate) = try await (track.load(.naturalSize), track.load(.preferredTransform), asset.load(.duration), track.load(.nominalFrameRate))
        let upright = CGRect(origin: .zero, size: natural).applying(transform)
        let render = CaptionLayout.fittedSize(upright.size, within: limit)
        let scale = render.width / upright.width
        let placed = transform.concatenating(CGAffineTransform(translationX: -upright.minX, y: -upright.minY)).concatenating(CGAffineTransform(scaleX: scale, y: render.height / upright.height))

        let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
        layerInstruction.setTransform(placed, at: .zero)
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
        instruction.layerInstructions = [layerInstruction]
        let composition = AVMutableVideoComposition()
        composition.renderSize = render
        composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(rate > 1 ? min(60, rate.rounded()) : 30))
        composition.instructions = [instruction]

        let videoLayer = CALayer(), parent = CALayer()
        parent.frame = CGRect(origin: .zero, size: render); videoLayer.frame = parent.frame
        parent.addSublayer(videoLayer)
        let overlay = CALayer(); overlay.frame = parent.frame
        for cue in cues { if let layer = cueLayer(cue, in: render, total: duration.seconds) { overlay.addSublayer(layer) } }
        parent.addSublayer(overlay)
        composition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

        guard let session = AVAssetExportSession(asset: asset, presetName: preset), session.supportedFileTypes.contains(.mp4) else { throw BurnError.unsupported }
        session.videoComposition = composition
        session.outputURL = output; session.outputFileType = .mp4; session.shouldOptimizeForNetworkUse = true
        return session
    }

    /// Bottom-centred white semibold text on a soft dark plate, visible only during the cue.
    static func cueLayer(_ cue: CaptionCue, in size: CGSize, total: TimeInterval) -> CALayer? {
        let start = max(0, cue.start), end = min(cue.end, total)
        guard end - start > 0.01 else { return nil }
        let fontSize = CaptionLayout.fontSize(width: size.width, height: size.height)
        let font = NSFont.systemFont(ofSize: fontSize, weight: .semibold)
        let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center; paragraph.lineBreakMode = .byWordWrapping
        paragraph.lineHeightMultiple = 1.08
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white, .paragraphStyle: paragraph]
        let padX = (fontSize * 0.55).rounded(), padY = (fontSize * 0.28).rounded()
        let maxWidth = CaptionLayout.maxTextWidth(width: size.width) - padX * 2
        let bounds = NSAttributedString(string: cue.text, attributes: attributes)
            .boundingRect(with: CGSize(width: maxWidth, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading])
        let textSize = CGSize(width: min(maxWidth, ceil(bounds.width) + 4), height: ceil(bounds.height) + 2)
        let plate = CALayer()
        plate.bounds = CGRect(x: 0, y: 0, width: textSize.width + padX * 2, height: textSize.height + padY * 2)
        plate.position = CGPoint(x: size.width / 2, y: CaptionLayout.bottomMargin(height: size.height) + plate.bounds.height / 2)
        plate.cornerRadius = (fontSize * 0.3).rounded(); plate.cornerCurve = .continuous
        plate.opacity = 0
        // Text is drawn into the plate's bitmap: CATextLayer children can vanish in AVFoundation's offline renderer.
        let scale: CGFloat = 2, pixels = CGSize(width: plate.bounds.width * scale, height: plate.bounds.height * scale)
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        if let context = CGContext(data: nil, width: Int(pixels.width), height: Int(pixels.height), bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
            context.scaleBy(x: scale, y: scale)
            let radius = plate.cornerRadius
            context.setFillColor(NSColor.black.withAlphaComponent(0.62).cgColor)
            context.addPath(CGPath(roundedRect: plate.bounds, cornerWidth: radius, cornerHeight: radius, transform: nil)); context.fillPath()
            let graphics = NSGraphicsContext(cgContext: context, flipped: false)
            NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = graphics
            NSAttributedString(string: cue.text, attributes: attributes).draw(with: CGRect(x: padX, y: padY, width: textSize.width, height: textSize.height), options: [.usesLineFragmentOrigin, .usesFontLeading])
            NSGraphicsContext.restoreGraphicsState()
            plate.contents = context.makeImage(); plate.contentsScale = scale
            plate.cornerRadius = 0
        }

        let show = CAKeyframeAnimation(keyPath: "opacity")
        show.values = [1, 1]; show.keyTimes = [0, 1]; show.calculationMode = .discrete
        show.beginTime = AVCoreAnimationBeginTimeAtZero + start
        show.duration = end - start
        show.isRemovedOnCompletion = false; show.fillMode = .removed
        plate.add(show, forKey: "cue")
        return plate
    }
}
