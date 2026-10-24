import Foundation
import AVFoundation
import CoreGraphics

// Native glue for tracking: read frames at their source PTS (AVFoundation, display orientation, no ffmpeg) and build C5 track files.
// Mirrors scripts/track.mjs so the Studio and the headless CLI write the same document.

public struct TrackFrames: @unchecked Sendable {
    public var images: [CGImage]
    public var times: [Double]
    public init(images: [CGImage], times: [Double]) { self.images = images; self.times = times }
}

public enum TrackVideoReader {
    /// Source presentation timestamps, sorted. Reads sample metadata only (no decode).
    public static func presentationTimes(of url: URL) async throws -> [Double] {
        let asset = AVURLAsset(url: url)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw TrackError.unreadable(url.lastPathComponent) }
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
        reader.add(output)
        guard reader.startReading() else { throw TrackError.unreadable(url.lastPathComponent) }
        var times: [Double] = []
        while let sb = output.copyNextSampleBuffer() {
            let t = CMSampleBufferGetPresentationTimeStamp(sb).seconds
            if t.isFinite { times.append(t) }
        }
        return times.sorted()
    }

    /// Frames at every source PTS, rotated to display orientation (preferred transform applied), width capped at `maxWidth`.
    public static func read(url: URL, maxWidth: Int = 960, progress: (@Sendable (Int, Int) -> Void)? = nil) async throws -> TrackFrames {
        let times = try await presentationTimes(of: url)
        guard !times.isEmpty else { throw TrackError.noFrames }
        let gen = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        gen.appliesPreferredTrackTransform = true
        gen.requestedTimeToleranceBefore = .zero
        gen.requestedTimeToleranceAfter = .zero
        gen.maximumSize = CGSize(width: maxWidth, height: maxWidth)
        var images: [CGImage] = []
        for (i, t) in times.enumerated() {
            let (img, _) = try await gen.image(at: CMTime(seconds: t, preferredTimescale: 60000))
            images.append(img)
            progress?(i + 1, times.count)
        }
        return TrackFrames(images: images, times: times)
    }
}

public enum TrackingService {
    public static func nearestIndex(_ times: [Double], _ t: Double) -> Int {
        var best = 0
        for (i, v) in times.enumerated() where abs(v - t) < abs(times[best] - t) { best = i }
        return best
    }

    /// Level 0: manual keyframes interpolated at every frame time.
    public static func level0(film: URL, assetURL: URL, assetId: String, id: String, keyframes: [QuadKeyframe], times: [Double]) throws -> (URL, TrackFile) {
        let digest = try TrackFile.digest(ofFile: assetURL)
        let track = try ManualTrack.interpolate(keyframes: keyframes, times: times, id: id, assetId: assetId, sourceDigest: digest)
        return (try track.write(film: film), track)
    }

    /// Level 1: Vision from the first keyframe forwards and backwards; later keyframes are correction anchors.
    /// Heavy: call off the main actor. Works with no ComfyUI and no SAM.
    public static func level1(film: URL, assetURL: URL, assetId: String, id: String, keyframes: [QuadKeyframe], frames: TrackFrames,
                              progress: ((Int, Int) -> Void)? = nil) throws -> (URL, TrackFile) {
        guard !keyframes.isEmpty else { throw TrackError.noKeyframes }
        guard !frames.images.isEmpty, frames.images.count == frames.times.count else { throw TrackError.noFrames }
        let kf = keyframes.sorted { $0.t_s < $1.t_s }
        var anchors: [Int: TrackQuad] = [:]
        for k in kf { anchors[nearestIndex(frames.times, k.t_s)] = k.quad }
        let first = anchors.keys.min()!
        var samples: [Int: VisionTrackSample] = [:]
        for s in VisionQuadTracker.track(frames: frames.images, keyframes: anchors, progress: progress) { samples[s.index] = s }
        if first > 0 {
            let n = frames.images.count
            let rev = Array(frames.images.reversed())
            for s in VisionQuadTracker.track(frames: rev, keyframes: [n - 1 - first: anchors[first]!]) {
                let idx = n - 1 - s.index
                if samples[idx] == nil { var c = s; c.index = idx; samples[idx] = c }
            }
        }
        var rows: [TrackFrame] = []
        for i in 0..<frames.times.count {
            guard let s = samples[i], QuadMath.isConvexWound(s.quad) else { continue }
            rows.append(TrackFrame(t_s: frames.times[i], quad: s.quad, confidence: s.manual ? 1 : s.confidence, origin: s.manual ? .manual : .vision, reprojErrPx: s.reprojErrPx))
        }
        let tracked = rows.filter { $0.origin == .vision }
        let low = tracked.filter { $0.confidence < 0.5 }.count
        let status: TrackStatus = tracked.isEmpty || tracked.allSatisfy({ $0.confidence < 0.2 }) ? .failed : (low > 0 ? .needsCorrection : .tracked)
        var warnings: [String] = []
        if low > 0 { warnings.append("\(low) of \(tracked.count) tracked frames below confidence 0.5: review or correct them") }
        if rows.count < frames.times.count { warnings.append("\(frames.times.count - rows.count) frames had no valid quad and were left out") }
        let corrections = kf.dropFirst().map { TrackCorrection(t_s: frames.times[nearestIndex(frames.times, $0.t_s)], quad: $0.quad, note: "manual keyframe anchor") }
        let digest = try TrackFile.digest(ofFile: assetURL)
        let track = TrackFile(id: id, assetId: assetId, sourceDigest: digest, frames: rows, corrections: corrections, status: status, level: 1, warnings: warnings)
        let v = track.validate(assetDigest: digest, assetDuration_s: nil)
        if let e = v.errors.first { throw TrackError.unreadable("tracker output (\(e))") }
        return (try track.write(film: film), track)
    }
}
