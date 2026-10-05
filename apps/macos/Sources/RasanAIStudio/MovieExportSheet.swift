import AppKit
@preconcurrency import AVFoundation
import Observation
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

enum DeliveryFormat: String, CaseIterable, Identifiable {
    case original, hd1080, hd720
    var id: String { rawValue }
    var title: String {
        switch self { case .original: "Original render"; case .hd1080: "MP4 · up to 1080p"; case .hd720: "MP4 · up to 720p" }
    }
    /// Frame the picture is fitted inside (never upscaled); nil for the original render.
    var limit: CGSize? {
        switch self { case .original: nil; case .hd1080: CGSize(width: 1920, height: 1080); case .hd720: CGSize(width: 1280, height: 720) }
    }
    var preset: String? {
        switch self { case .original: nil; case .hd1080: AVAssetExportPreset1920x1080; case .hd720: AVAssetExportPreset1280x720 }
    }
}

@MainActor @Observable final class MovieExporter {
    let source: URL
    var format: DeliveryFormat = .original
    var captions: URL?
    var includeCaptions = false
    var burnCaptions = false
    var isExporting = false
    var completed: URL?
    var completedCaptions: URL?
    var error: String?
    private var session: AVAssetExportSession?
    var progress: Double? { session.map { Double($0.progress) } }
    init(source: URL, captions: URL?) { self.source = source; self.captions = captions }
    func cancel() { session?.cancelExport() }
    func chooseDestination() {
        if (includeCaptions || burnCaptions), let captions, !["srt", "vtt"].contains(captions.pathExtension.lowercased()) {
            error = "Choose an SRT or VTT caption file."; return
        }
        let panel = NSSavePanel(); panel.title = "Export film"; panel.canCreateDirectories = true
        let ext = format == .original ? source.pathExtension : "mp4"
        let suffix = format == .hd1080 ? "-1080p" : format == .hd720 ? "-720p" : ""
        panel.nameFieldStringValue = source.deletingPathExtension().lastPathComponent + suffix + "." + ext
        panel.allowedContentTypes = [UTType(filenameExtension: ext) ?? .movie]
        guard panel.runModal() == .OK, let destination = panel.url else { return }
        if format != .original && destination.standardizedFileURL == source.standardizedFileURL {
            error = "Choose a different name or folder to keep your original render."; return
        }
        let format = format, caption = includeCaptions ? captions : nil
        let burn = burnCaptions && format != .original ? captions : nil
        isExporting = true; error = nil; completed = nil; completedCaptions = nil
        Task { await write(to: destination, format: format, caption: caption, burn: burn) }
    }
    private func write(to destination: URL, format: DeliveryFormat, caption: URL?, burn: URL?) async {
        let staged = destination.deletingLastPathComponent().appendingPathComponent(".rasanai-export-\(UUID().uuidString).\(destination.pathExtension)")
        defer { try? FileManager.default.removeItem(at: staged); session = nil; isExporting = false }
        do {
            if destination.standardizedFileURL != source.standardizedFileURL {
                if let preset = format.preset, let burn {
                    let cues = await Task.detached { CaptionParser.parse(contentsOf: burn) }.value
                    let exporter = try await CaptionBurner.exportSession(source: source, cues: cues, preset: preset, limit: format.limit, output: staged)
                    session = exporter
                    await exporter.export()
                    guard exporter.status == .completed else {
                        if exporter.status == .cancelled { return }
                        throw exporter.error ?? ExportError.unsupported
                    }
                } else if let preset = format.preset {
                    guard let exporter = AVAssetExportSession(asset: AVURLAsset(url: source), presetName: preset), exporter.supportedFileTypes.contains(.mp4) else {
                        throw ExportError.unsupported
                    }
                    session = exporter
                    exporter.outputURL = staged; exporter.outputFileType = .mp4; exporter.shouldOptimizeForNetworkUse = true
                    await exporter.export()
                    guard exporter.status == .completed else {
                        if exporter.status == .cancelled { return }
                        throw exporter.error ?? ExportError.unsupported
                    }
                } else {
                    let source = source
                    try await Task.detached { try FileManager.default.copyItem(at: source, to: staged) }.value
                }
                try await Task.detached {
                    let fm = FileManager.default
                    if fm.fileExists(atPath: destination.path) { _ = try fm.replaceItemAt(destination, withItemAt: staged) }
                    else { try fm.moveItem(at: staged, to: destination) }
                }.value
            }
            completed = destination
            if let caption {
                var target = destination.deletingPathExtension().appendingPathExtension(caption.pathExtension)
                if target.standardizedFileURL != caption.standardizedFileURL {
                    var index = 2
                    while FileManager.default.fileExists(atPath: target.path) {
                        target = destination.deletingLastPathComponent().appendingPathComponent(destination.deletingPathExtension().lastPathComponent + "-captions-\(index)." + caption.pathExtension)
                        index += 1
                    }
                }
                let captionTarget = target
                do {
                    try await Task.detached {
                        if captionTarget.standardizedFileURL == caption.standardizedFileURL { return }
                        let temporary = captionTarget.deletingLastPathComponent().appendingPathComponent(".captions-\(UUID().uuidString).\(captionTarget.pathExtension)")
                        defer { try? FileManager.default.removeItem(at: temporary) }
                        try FileManager.default.copyItem(at: caption, to: temporary)
                        try FileManager.default.moveItem(at: temporary, to: captionTarget)
                    }.value
                    completedCaptions = captionTarget
                } catch { self.error = "The video was exported, but captions could not be saved: \(error.localizedDescription)" }
            }
        } catch { self.error = error.localizedDescription }
    }
    enum ExportError: LocalizedError {
        case unsupported
        var errorDescription: String? { "This render can't be converted to the selected MP4 format. Export the original render instead." }
    }
}

struct MovieExportSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: MovieExporter
    init(source: URL, captions: URL?) { _model = State(initialValue: MovieExporter(source: source, captions: captions)) }
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(model.completed == nil ? "Export film" : "Film exported").font(.system(size: 24, weight: .semibold))
            if let destination = model.completed {
                Label(destination.lastPathComponent, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                Text(destination.deletingLastPathComponent().path).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                if let captions = model.completedCaptions { Label(captions.lastPathComponent, systemImage: "captions.bubble").font(.caption) }
            } else {
                Text(model.source.lastPathComponent).font(.system(size: 13)).foregroundStyle(.secondary)
                Picker("Delivery", selection: $model.format) { ForEach(DeliveryFormat.allCases) { Text($0.title).tag($0) } }.disabled(model.isExporting)
                Text("Original keeps the rendered file unchanged. MP4 options preserve the film's shape and audio.").font(.caption).foregroundStyle(.secondary)
                Toggle("Include a separate caption file", isOn: $model.includeCaptions).disabled(model.isExporting)
                if model.includeCaptions {
                    HStack {
                        Text(model.captions?.lastPathComponent ?? "Choose an SRT or VTT file").font(.caption).lineLimit(1)
                        Spacer()
                        Button("Choose…") { chooseCaptions() }.disabled(model.isExporting)
                    }
                    Text("Captions are saved alongside the video as a separate file.").font(.caption).foregroundStyle(.secondary)
                }
                if model.captions != nil || model.includeCaptions {
                    Toggle("Burn captions into the picture", isOn: $model.burnCaptions)
                        .disabled(model.isExporting || model.format == .original || model.captions == nil)
                    Text(model.format == .original ? "Choose an MP4 option above to burn captions in. The original render is never changed."
                         : "Captions are drawn on the video itself, so they show in every player and on social apps.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            if model.isExporting {
                TimelineView(.periodic(from: .now, by: 0.25)) { _ in
                    if let progress = model.progress { ProgressView(value: progress) }
                    else { ProgressView(model.burnCaptions && model.format != .original ? "Adding captions…" : "Copying the original render…") }
                }
            }
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red).textSelection(.enabled) }
            HStack {
                if model.isExporting {
                    if model.progress != nil { Button("Stop export") { model.cancel() } }
                } else { Button(model.completed == nil ? "Cancel" : "Done") { dismiss() }.keyboardShortcut(.cancelAction) }
                Spacer()
                if let destination = model.completed {
                    ShareLink(item: destination) { Label("Share…", systemImage: "square.and.arrow.up") }
                    Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([destination]) }.buttonStyle(.borderedProminent)
                } else {
                    if !model.isExporting { ShareLink(item: model.source) { Label("Share…", systemImage: "square.and.arrow.up") }.help("Share the original render without exporting") }
                    Button("Choose destination…") { model.chooseDestination() }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                        .disabled(model.isExporting || ((model.includeCaptions || model.burnCaptions) && model.captions == nil))
                }
            }
        }.padding(28).frame(width: 500)
            .interactiveDismissDisabled(model.isExporting)
    }
    private func chooseCaptions() {
        let panel = NSOpenPanel(); panel.title = "Choose captions"; panel.canChooseDirectories = false
        panel.allowedContentTypes = [UTType(filenameExtension: "srt"), UTType(filenameExtension: "vtt")].compactMap { $0 }
        if panel.runModal() == .OK { model.captions = panel.url }
    }
}
