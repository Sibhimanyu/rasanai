import AppKit
import AVFoundation
import AVKit
import StudioCore
import SwiftUI

/// A slim progress bar drawn in SwiftUI so the accent follows light and dark exactly (the system linear bar ignores appearance changes in some hosts).
struct ThinBar: View {
    let fraction: Double
    var tint: Color = .rasan
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(nsColor: .quaternaryLabelColor).opacity(0.35))
                Capsule().fill(tint).frame(width: max(5, proxy.size.width * min(1, max(0, fraction))))
                    .animation(.smooth(duration: 0.5), value: fraction)
            }
        }
        .frame(height: 5)
        .accessibilityElement(children: .ignore)
        .accessibilityValue("\(Int((min(1, max(0, fraction)) * 100).rounded())) percent")
    }
}

extension CrewMember {
    /// The crew character who presents this agent: its role first, else its description, else Rasan.
    var character: CrewCharacter {
        CrewCharacter(key: CrewRoles.character(forRole: role) ?? CrewRoles.character(forDescription: name)) ?? .ra
    }
}

/// Who is on the crew stage now: the first running crew member, else the owner of the phase. (The old avatar view that
/// drew this character beside the progress card is archived in archive/old-ui/studio/.)
enum NowCrewAvatar {
    static func lead(for snapshot: FilmProgressSnapshot) -> CrewCharacter {
        var seen = Set<CrewCharacter>()
        // A helper whose role the cast does not know shows as Rasan (the default); it must not hide the phase's owner
        // (the critic during Check), so only helpers with a known character take the stage.
        let running = snapshot.crew.filter { $0.state == .running }
            .filter { CrewRoles.character(forRole: $0.role) != nil || CrewRoles.character(forDescription: $0.name) != nil }
            .map(\.character).filter { seen.insert($0).inserted }
        return running.first ?? CrewCharacter(key: CrewRoles.character(forPhase: snapshot.now.phase)) ?? .ra
    }
}

// MARK: - Playable video thumbnail

extension Notification.Name { static let rasanVideoDidStart = Notification.Name("rasanai.progress.videoDidStart") }

/// A video as a poster with a play button; click and it plays right there with the system controls. One plays at a time.
struct VideoTile: View {
    let url: URL
    let title: String
    var subtitle: String?
    var aspect: Double = 16.0 / 9.0
    var width: CGFloat = 252
    var poster: URL?
    @State private var posterImage: NSImage?
    @State private var player: AVPlayer?
    @State private var hovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                Color.black
                if let player {
                    StudioVideoPlayer(player: player)
                } else {
                    if let posterImage { Image(nsImage: posterImage).resizable().scaledToFit() }
                    Button(action: play) {
                        Image(systemName: "play.fill").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 42, height: 42).background(.black.opacity(hovering ? 0.62 : 0.45), in: Circle())
                            .overlay { Circle().strokeBorder(.white.opacity(0.35), lineWidth: 0.75) }
                            .scaleEffect(hovering ? 1.06 : 1)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Play \(title)")
                }
            }
            .frame(width: width, height: width / aspect)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
            .shadow(color: .black.opacity(0.14), radius: 8, y: 4)
            .onHover { hovering = $0 }
            HStack(spacing: 6) {
                Text(title).font(.system(size: 12, weight: .medium)).lineLimit(1)
                if let subtitle { Text(subtitle).font(.system(size: 11)).foregroundStyle(.tertiary) }
            }
        }
        .frame(width: width, alignment: .leading)
        .task(id: url) { posterImage = await VideoPosters.image(for: poster ?? url, isVideo: poster == nil) }
        .onReceive(NotificationCenter.default.publisher(for: .rasanVideoDidStart)) { note in
            if (note.object as? URL) != url, player != nil { player?.pause(); player = nil }
        }
        .onDisappear { player?.pause(); player = nil }
    }

    private func play() {
        NotificationCenter.default.post(name: .rasanVideoDidStart, object: url)
        let next = AVPlayer(url: url)
        player = next
        next.play()
    }
}

/// First-frame posters for videos (and downsampled stills), cached so scrolling and re-renders stay cheap.
enum VideoPosters {
    nonisolated(unsafe) private static let cache = NSCache<NSURL, NSImage>()
    static func image(for url: URL, isVideo: Bool) async -> NSImage? {
        if let hit = cache.object(forKey: url as NSURL) { return hit }
        let made: NSImage? = await Task.detached(priority: .utility) { () -> NSImage? in
            if isVideo {
                let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
                generator.appliesPreferredTrackTransform = true
                generator.maximumSize = CGSize(width: 720, height: 720)
                // A frame from about a third of the way in reads better than the first one, which is often a title card or black.
                let length = (try? await AVURLAsset(url: url).load(.duration).seconds) ?? 3
                let at = length.isFinite && length > 3 ? length * 0.35 : 1.0
                generator.requestedTimeToleranceBefore = CMTime(seconds: 1, preferredTimescale: 600); generator.requestedTimeToleranceAfter = CMTime(seconds: 1, preferredTimescale: 600)
                guard let result = try? await generator.image(at: CMTime(seconds: at, preferredTimescale: 600)) else { return nil }
                return NSImage(cgImage: result.image, size: NSSize(width: result.image.width, height: result.image.height))
            }
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 720] as CFDictionary) else { return nil }
            return NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
        }.value
        if let made { cache.setObject(made, forKey: url as NSURL) }
        return made
    }
}

