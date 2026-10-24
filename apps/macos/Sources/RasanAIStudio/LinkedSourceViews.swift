import AppKit
import StudioCore
import SwiftUI

/// One drop well in New film for sources that stay where they are: footage folders, or a reference video.
/// Two separate wells, because they mean different things to the director: footage is material to cut, a reference is
/// inspiration to study and is never cut into the film. Nothing here copies a byte.
struct LinkedSourceWell: View {
    let kind: LinkedSource.Kind
    @Binding var sources: [LinkedSource]
    var disabled = false
    /// The picked format's own words for what it wants here (a footage well only); nil keeps the default hint.
    var prompt: String?
    /// The reference well also holds the moves picked from Inspiration: their thumbnails, and the button that opens the
    /// gallery. Nil leaves the well to its sources alone.
    var moves: AnyView?
    var movesCount = 0
    var onPickMoves: (() -> Void)?
    /// Footage wells only: lets the page take brand kits out of a drop before they become footage.
    var screen: (([URL]) -> [URL])?
    @State private var targeted = false
    @State private var message: String?

    private var mine: [LinkedSource] { sources.filter { $0.kind == kind } }
    private var empty: Bool { mine.isEmpty && movesCount == 0 }
    private var title: String { kind == .footage ? "Footage folder" : "Make it like this" }
    private var symbol: String { kind == .footage ? "folder" : "film.stack" }
    private var hint: String {
        if kind == .footage, let prompt, !prompt.isEmpty {
            let sentence = prompt.last.map { ".?!".contains($0) } == true ? prompt : prompt + "."
            return sentence + " It stays where it is, and nothing is copied."
        }
        if kind == .reference, onPickMoves != nil {
            return "Drop a video to study for pace, type, colour and camera, or pick moves from Inspiration. Neither is cut into your film."
        }
        return kind == .footage ? "Drop a folder of clips. It stays where it is, and nothing is copied."
            : "Drop a video to study for pace, type, colour and camera. It is never cut into your film."
    }
    private var buttonTitle: String { kind == .footage ? "Choose folder…" : "Choose video…" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: symbol).font(.system(size: 14, weight: .medium)).foregroundStyle(empty ? Color.secondary : kind == .footage ? Color.rasan : Color.primary.opacity(0.7))
                Text(title).font(.system(size: 13, weight: .semibold))
                // Footage is cut into the film; a reference is only studied. Say which, on the well itself.
                Text(kind == .footage ? "Used in your film" : "Studied, never cut in")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            if empty {
                Text(hint).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(mine) { source in
                    LinkedSourceRow(source: source) { sources.removeAll { $0 == source } }
                }
            }
            if let message { Text(message).font(.system(size: 11.5)).foregroundStyle(Color(nsColor: .systemOrange)).fixedSize(horizontal: false, vertical: true) }
            if movesCount > 0, let moves { moves }
            HStack(spacing: 8) {
                Button(mine.isEmpty ? buttonTitle : (kind == .footage ? "Add another folder…" : "Choose another video…")) { choose() }
                if let onPickMoves {
                    Button { onPickMoves() } label: {
                        Label(movesCount == 0 ? "Pick moves from Inspiration…" : "Change moves…", systemImage: "sparkles")
                    }
                }
            }
            .buttonStyle(.rasanSecondary).controlSize(.small).disabled(disabled)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(targeted ? Color.rasan.opacity(0.10) : Workspace.panel, in: RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous)
                .strokeBorder(targeted ? Color.rasan : Workspace.hairline, style: StrokeStyle(lineWidth: targeted ? 1.5 : 1, dash: empty && !targeted ? [5, 4] : []))
        }
        .animation(.snappy(duration: 0.15), value: targeted)
        .animation(.snappy, value: mine)
        .dropDestination(for: URL.self, action: { urls, _ in take(urls.filter(\.isFileURL)) }, isTargeted: { targeted = $0 })
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private func take(_ dropped: [URL]) -> Bool {
        guard !disabled, !dropped.isEmpty else { return false }
        let urls = kind == .footage ? (screen?(dropped) ?? dropped) : dropped
        if urls.isEmpty { return true }
        var added: [LinkedSource] = [], failure: LinkedSource.Rejection?
        for url in urls {
            switch kind == .footage ? LinkedSource.footageFolder(url) : LinkedSource.referenceVideo(url) {
            case .success(let source): added.append(source)
            case .failure(let rejection): failure = rejection
            }
        }
        sources = LinkedSource.merge(sources, adding: added)
        message = added.isEmpty ? failure?.errorDescription : nil
        return !added.isEmpty
    }

    private func choose() {
        let panel = NSOpenPanel()
        if kind == .footage {
            panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.allowsMultipleSelection = true
            panel.title = "Choose a folder of footage"; panel.prompt = "Use folder"
            panel.message = "The folder stays where it is. RasanAI reads it in place and never changes it."
        } else {
            panel.canChooseDirectories = false; panel.canChooseFiles = true; panel.allowsMultipleSelection = false
            panel.allowedContentTypes = [.movie, .video]
            panel.title = "Choose a video to make yours like"; panel.prompt = "Use video"
        }
        if panel.runModal() == .OK { _ = take(panel.urls) }
    }
}

/// A linked folder or video: its name, where it is, and what is inside, read off the main thread.
struct LinkedSourceRow: View {
    let source: LinkedSource
    var onRemove: (() -> Void)?
    /// Where the director writes reference-motion.json once it has studied the reference (nil before the film has a folder).
    var motionRoot: URL?
    @State private var summary: String?

    private var exists: Bool { FileManager.default.fileExists(atPath: source.path) }

    var body: some View {
        if source.kind == .reference && !source.isFolder {
            LinkedReferenceMotionChip(source: source, root: motionRoot, onRemove: onRemove)
        } else {
            plainRow
        }
    }

    private var plainRow: some View {
        HStack(spacing: 10) {
            Image(systemName: source.isFolder ? "folder.fill" : "play.rectangle.fill").foregroundStyle(exists ? Color.rasan : Color(nsColor: .systemOrange)).frame(width: 18)
            VStack(alignment: .leading, spacing: 2) {
                Text(source.name).font(.system(size: 13, weight: .medium)).lineLimit(1).truncationMode(.middle)
                Text(exists ? (summary ?? source.path) : "Not found. It may have moved.")
                    .font(.system(size: 11)).foregroundStyle(exists ? Color.secondary : Color(nsColor: .systemOrange))
                    .lineLimit(1).truncationMode(.middle).help(source.path)
            }
            Spacer(minLength: 4)
            if let onRemove {
                Button(action: onRemove) { Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Remove (nothing on disk changes)").accessibilityLabel("Remove \(source.name)")
            }
        }
        .task(id: source.path) {
            guard exists else { summary = nil; return }
            let source = source
            summary = await Task.detached(priority: .utility) { () -> String in
                if source.isFolder { return LinkedSource.summarize(folder: source.url).line }
                let size = (try? source.url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                return ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)
            }.value
        }
    }
}

/// A linked reference video as a Motion Studio chip: analyzing, ready or cannot analyze. The director runs the analysis;
/// this only watches for reference-motion.json to appear.
private struct LinkedReferenceMotionChip: View {
    let source: LinkedSource
    var root: URL?
    var onRemove: (() -> Void)?
    @State private var model = MotionReferenceModel()

    var body: some View {
        MotionReferenceChip(title: source.name, fileURL: source.url, durationS: model.durationS, rights: model.summary?.source?.rights,
                            status: model.status, onRemove: onRemove)
            .task(id: "\(source.path)|\(root?.path ?? "")") {
                model.markAnalyzing()
                guard let root else { return }
                // Light poll, stopped when the view goes away or the file has appeared (up to about ten minutes).
                for _ in 0..<200 {
                    await model.load(projectRoot: root)
                    if model.summary != nil || Task.isCancelled { return }
                    model.markAnalyzing()
                    try? await Task.sleep(for: .seconds(3))
                    if Task.isCancelled { return }
                }
            }
    }
}
