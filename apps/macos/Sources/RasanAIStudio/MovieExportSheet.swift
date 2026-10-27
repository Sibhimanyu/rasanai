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
    /// Plan 12 D7: what the delivery plan says about this film (profile, variants, required accessibility files, package contents). Read-only; nil for films with no plan.
    private let delivery: DeliveryPlan?
    init(source: URL, captions: URL?, delivery: DeliveryPlan? = nil) {
        _model = State(initialValue: MovieExporter(source: source, captions: captions))
        self.delivery = (delivery?.isEmpty ?? true) ? nil : delivery
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 4) {
                Text(model.completed == nil ? "Export film" : "Film exported").font(.system(size: 24, weight: .semibold))
                if model.completed == nil {
                    Text(model.source.lastPathComponent).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
                }
            }
            if let destination = model.completed {
                Label(destination.lastPathComponent, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                Text(destination.deletingLastPathComponent().path).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                if let captions = model.completedCaptions { Label(captions.lastPathComponent, systemImage: "captions.bubble").font(.caption) }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Format").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                    ForEach(DeliveryFormat.allCases) { format in formatRow(format) }
                    Text("Original keeps the rendered file unchanged. MP4 options preserve the film's shape and audio.").font(.caption).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 10) {
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
                .padding(14).frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
                if let delivery { DeliveryPanel(plan: delivery) }
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
                    Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([destination]) }.buttonStyle(.rasanPrimary)
                } else {
                    if !model.isExporting { ShareLink(item: model.source) { Label("Share…", systemImage: "square.and.arrow.up") }.help("Share the original render without exporting") }
                    Button("Choose destination…") { model.chooseDestination() }.buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction)
                        .disabled(model.isExporting || ((model.includeCaptions || model.burnCaptions) && model.captions == nil))
                }
            }
        }.padding(28).frame(width: 500)
            .interactiveDismissDisabled(model.isExporting)
    }
    private func formatRow(_ format: DeliveryFormat) -> some View {
        let on = model.format == format
        return Button { model.format = format } label: {
            HStack(spacing: 10) {
                Image(systemName: on ? "largecircle.fill.circle" : "circle").foregroundStyle(on ? Color.rasan : Color.secondary)
                Text(format.title).font(.system(size: 13, weight: on ? .semibold : .regular))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 9).contentShape(Rectangle())
            .background(on ? Color.rasan.opacity(0.10) : Color.clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(on ? Color.rasan.opacity(0.7) : Workspace.hairline, lineWidth: 1) }
        }
        .buttonStyle(.plain).disabled(model.isExporting)
        .accessibilityLabel(format.title).accessibilityAddTraits(on ? .isSelected : [])
    }
    private func chooseCaptions() {
        let panel = NSOpenPanel(); panel.title = "Choose captions"; panel.canChooseDirectories = false
        panel.allowedContentTypes = [UTType(filenameExtension: "srt"), UTType(filenameExtension: "vtt")].compactMap { $0 }
        if panel.runModal() == .OK { model.captions = panel.url }
    }
}


/// The delivery summary inside the existing export sheet: simple by default (one line about where the film is going), details one disclosure away.
/// Advanced items are explained, never advertised: a capability that is unavailable shows why, and nothing here says a destination or an editor is supported.
private struct DeliveryPanel: View {
    let plan: DeliveryPlan
    @State private var open = false
    var body: some View {
        DisclosureGroup(isExpanded: $open) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let target = plan.target { targetBlock(target) }
                    if let migration = plan.migration, migration.offer {
                        note("A newer destination record exists", migration.summary ?? "Accepting it changes this film's target; exports already made keep theirs.", symbol: "arrow.triangle.2.circlepath")
                    }
                    if !plan.variants.isEmpty { variantsBlock }
                    if !plan.requiredFiles.isEmpty { filesBlock }
                    renderLine
                    if !plan.packageContents.isEmpty {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Package folders").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                            Text(plan.packageContents.map(\.folder).joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    let unavailable = plan.capabilities.filter { !$0.isOffered }
                    if !unavailable.isEmpty { advancedBlock(unavailable) }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
            }
            .frame(maxHeight: 240)
        } label: {
            Label(summaryLine, systemImage: "shippingbox").font(.system(size: 12, weight: .medium))
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
        .accessibilityLabel("Delivery details").accessibilityHint(open ? "Expanded" : "Collapsed. Press to show the destination, variants and files")
    }
    private var summaryLine: String {
        if let target = plan.target { return "Delivery: " + (target.label ?? target.id ?? "destination") }
        return "Delivery details"
    }
    @ViewBuilder private func targetBlock(_ target: DeliveryPlan.Target) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(target.label ?? target.id ?? "Destination").font(.system(size: 13, weight: .semibold))
            Text([target.aspect, target.width.flatMap { w in target.height.map { "\(w)×\($0)" } }].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
            Label(target.stateTitle, systemImage: target.state == "verified" ? "checkmark.seal" : "exclamationmark.triangle").font(.caption)
                .foregroundStyle(target.state == "verified" || target.state == "house" ? Color.secondary : Color.orange)
            ForEach(target.warnings, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
        }
        .accessibilityElement(children: .combine)
    }
    private var variantsBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Variants").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            ForEach(plan.variants) { variant in
                HStack(spacing: 6) {
                    Text([variant.id, variant.locale].compactMap { $0 }.joined(separator: " · ")).font(.caption)
                    Spacer(minLength: 0)
                    Text(variant.statusTitle).font(.caption).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
    private var filesBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Accessibility files this film needs").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            ForEach(plan.requiredFiles) { file in
                HStack(spacing: 6) {
                    Image(systemName: file.isReady ? "checkmark.circle.fill" : "circle.dashed").foregroundStyle(file.isReady ? Color.green : Color.secondary).accessibilityHidden(true)
                    Text(file.title).font(.caption)
                    Spacer(minLength: 0)
                    Text(file.statusTitle).font(.caption).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine).help(file.why ?? "")
            }
        }
    }
    @ViewBuilder private var renderLine: some View {
        if let render = plan.render {
            Label(render.delivered ? "A delivered render exists" + (render.frames.map { " (\($0) frames)" } ?? "") : (render.note ?? "No delivered render recorded yet"), systemImage: render.delivered ? "film" : "film.stack").font(.caption).foregroundStyle(.secondary)
        }
    }
    private func advancedBlock(_ rows: [DeliveryPlan.Capability]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Not available yet").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.label ?? row.id).font(.caption)
                    if let reason = row.reason, !reason.isEmpty { Text(reason).font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
    private func note(_ title: String, _ body: String, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(title, systemImage: symbol).font(.caption.weight(.medium))
            Text(body).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}
