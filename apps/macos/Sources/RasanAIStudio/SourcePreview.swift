import AppKit
import AVKit
import ImageIO
import QuickLookThumbnailing
import QuickLookUI
import SwiftUI
import UniformTypeIdentifiers

struct SourceInfo: Sendable {
    var detail: String
    var isMedia: Bool
    static func load(_ url: URL) async -> Self {
        let type = UTType(filenameExtension: url.pathExtension)
        let isMedia = type?.conforms(to: .audiovisualContent) == true
        var parts: [String] = []
        if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize {
            parts.append(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
        }
        if isMedia {
            let asset = AVURLAsset(url: url)
            if let duration = try? await asset.load(.duration), duration.seconds.isFinite, duration.seconds > 0 {
                let seconds = Int(duration.seconds.rounded())
                parts.append(String(format: "%d:%02d", seconds / 60, seconds % 60))
            }
            if let track = try? await asset.loadTracks(withMediaType: .video).first,
               let size = try? await track.load(.naturalSize), let transform = try? await track.load(.preferredTransform) {
                let actual = size.applying(transform)
                parts.append("\(Int(abs(actual.width))) × \(Int(abs(actual.height)))")
            }
        } else if type?.conforms(to: .image) == true,
                  let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                  let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int {
            parts.append("\(width) × \(height)")
        }
        if parts.isEmpty { parts.append(type?.localizedDescription ?? url.pathExtension.uppercased()) }
        return Self(detail: parts.joined(separator: " · "), isMedia: isMedia)
    }
}

/// Small, lazy native previews are shared by the editor and the project's Files sheet.
struct SourceRow: View {
    let url: URL
    @State private var thumbnail: NSImage?
    @State private var info: SourceInfo?
    @State private var showPreview = false
    var body: some View {
        HStack(spacing: 12) {
            Button { showPreview = true } label: {
                Image(nsImage: thumbnail ?? NSWorkspace.shared.icon(forFile: url.path))
                    .resizable().scaledToFit().frame(width: 66, height: 46)
                    .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
            }.buttonStyle(.plain).help("Preview \(url.lastPathComponent)")
            VStack(alignment: .leading, spacing: 4) {
                Button(url.lastPathComponent) { showPreview = true }.buttonStyle(.plain)
                    .font(.system(size: 12, weight: .medium)).lineLimit(1).truncationMode(.middle)
                Text(info?.detail ?? "Reading file…").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Button { showPreview = true } label: { Image(systemName: "eye") }.buttonStyle(.borderless).help("Preview")
        }.frame(maxWidth: .infinity, alignment: .leading)
            .task(id: url) {
                info = await SourceInfo.load(url)
                let request = QLThumbnailGenerator.Request(fileAt: url, size: CGSize(width: 132, height: 92), scale: 2, representationTypes: .thumbnail)
                if let representation = try? await QLThumbnailGenerator.shared.generateBestRepresentation(for: request), !Task.isCancelled {
                    thumbnail = representation.nsImage
                }
            }
            .sheet(isPresented: $showPreview) { SourcePreviewSheet(url: url) }
    }
}

struct SourcePreviewSheet: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    @State private var info: SourceInfo?
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(url.lastPathComponent).font(.headline).lineLimit(1).truncationMode(.middle)
                    if let info { Text(info.detail).font(.system(size: 12)).foregroundStyle(.secondary) }
                }
                Spacer()
                Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                Button("Done") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            if let player { VideoPlayer(player: player).frame(maxWidth: .infinity, maxHeight: .infinity) }
            else { NativeSourcePreview(url: url).frame(maxWidth: .infinity, maxHeight: .infinity) }
        }.padding(20).frame(width: 760, height: 520)
            .task(id: url) {
                info = await SourceInfo.load(url)
                if info?.isMedia == true { player = AVPlayer(url: url) }
            }
            .onDisappear { player?.pause() }
    }
}

private struct NativeSourcePreview: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> QLPreviewView {
        let view = QLPreviewView(frame: .zero, style: .normal)!
        view.autostarts = false
        view.previewItem = url as NSURL
        return view
    }
    func updateNSView(_ view: QLPreviewView, context: Context) { view.previewItem = url as NSURL }
    static func dismantleNSView(_ view: QLPreviewView, coordinator: ()) { view.close() }
}
