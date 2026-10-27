import AppKit
import AVFoundation
import SwiftUI

/// Off-main, cached poster frames for a linked reference file. Only a local file is ever opened.
actor MotionReferenceThumbnails {
    static let shared = MotionReferenceThumbnails()
    private let cache = NSCache<NSURL, NSImage>()

    func thumbnail(for url: URL, maxSize: CGFloat = 320) async -> NSImage? {
        guard url.isFileURL else { return nil }
        if let hit = cache.object(forKey: url as NSURL) { return hit }
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: maxSize, height: maxSize)
        guard let cg = try? await generator.image(at: CMTime(seconds: 0.5, preferredTimescale: 600)).image else { return nil }
        let image = NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
        cache.setObject(image, forKey: url as NSURL)
        return image
    }
}

/// A compact row for a motion reference on New Film or Get Inspired: thumbnail, name, length, rights and status.
struct MotionReferenceChip: View {
    let title: String
    var fileURL: URL?
    var durationS: Double?
    var rights: String?
    var status: MotionReferenceStatus
    var onRemove: (() -> Void)?

    @State private var thumbnail: NSImage?

    var body: some View {
        HStack(spacing: 10) {
            thumb
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.callout.weight(.medium)).lineLimit(1).truncationMode(.middle)
                HStack(spacing: 6) {
                    if let durationS { Text(Self.duration(durationS)).monospacedDigit() }
                    Text(MotionRights.label(rights))
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            statusBadge
            if let onRemove {
                Button(action: onRemove) { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain)
                    .hoverCursor(.pointingHand)
                    .help("Remove this reference")
                    .accessibilityLabel("Remove motion reference \(title)")
            }
        }
        .padding(8)
        .cardSurface()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Motion reference \(title), \(status.label)")
        .task(id: fileURL) {
            guard let fileURL else { thumbnail = nil; return }
            thumbnail = await MotionReferenceThumbnails.shared.thumbnail(for: fileURL)
        }
    }

    private var thumb: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Workspace.raised)
            if let thumbnail {
                Image(nsImage: thumbnail).resizable().scaledToFill()
            } else {
                Image(systemName: "film").foregroundStyle(.secondary)
            }
        }
        .frame(width: 56, height: 36)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .accessibilityHidden(true)
    }

    private var statusBadge: some View {
        HStack(spacing: 5) {
            if status == .analyzing { ProgressView().controlSize(.mini) }
            else { Circle().fill(tint).frame(width: 6, height: 6) }
            Text(status.label).font(.caption.weight(.medium)).foregroundStyle(status == .cannotAnalyze ? Color.turmeric : .secondary)
        }
    }

    private var tint: Color { status == .ready ? .green : .turmeric }

    static func duration(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

#Preview("Chips") {
    VStack(spacing: 8) {
        MotionReferenceChip(title: "brand-reel.mp4", durationS: 42, rights: "owned", status: .ready, onRemove: {})
        MotionReferenceChip(title: "competitor-launch.mov", durationS: 75, rights: "inspiration-only", status: .analyzing, onRemove: {})
        MotionReferenceChip(title: "notes.txt", rights: nil, status: .cannotAnalyze)
    }
    .padding(20).frame(width: 420).background(Workspace.canvas).preferredColorScheme(.dark)
}
