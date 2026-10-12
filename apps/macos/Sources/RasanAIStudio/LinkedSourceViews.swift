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
    @State private var targeted = false
    @State private var message: String?

    private var mine: [LinkedSource] { sources.filter { $0.kind == kind } }
    private var title: String { kind == .footage ? "Footage folder" : "Make it like this" }
    private var symbol: String { kind == .footage ? "folder" : "film.stack" }
    private var hint: String {
        if kind == .footage, let prompt, !prompt.isEmpty { return prompt + " It stays where it is, and nothing is copied." }
        return kind == .footage ? "Drop a folder of clips. It stays where it is, and nothing is copied."
            : "Drop a video to study for pace, type, colour and camera. It is never cut into your film."
    }
    private var buttonTitle: String { kind == .footage ? "Choose folder…" : "Choose video…" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: symbol).font(.system(size: 14, weight: .medium)).foregroundStyle(mine.isEmpty ? Color.secondary : Color.rasan)
                Text(title).font(.system(size: 13, weight: .semibold))
                Spacer(minLength: 0)
            }
            if mine.isEmpty {
                Text(hint).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(mine) { source in
                    LinkedSourceRow(source: source) { sources.removeAll { $0 == source } }
                }
            }
            if let message { Text(message).font(.system(size: 11.5)).foregroundStyle(Color(nsColor: .systemOrange)).fixedSize(horizontal: false, vertical: true) }
            Button(mine.isEmpty ? buttonTitle : (kind == .footage ? "Add another folder…" : "Choose another video…")) { choose() }
                .controlSize(.small).disabled(disabled)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(targeted ? Color.rasan.opacity(0.10) : Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(targeted ? Color.rasan : Color(nsColor: .separatorColor), style: StrokeStyle(lineWidth: targeted ? 1.5 : 0.8, dash: mine.isEmpty ? [5, 4] : []))
        }
        .animation(.snappy(duration: 0.15), value: targeted)
        .animation(.snappy, value: mine)
        .dropDestination(for: URL.self, action: { urls, _ in take(urls.filter(\.isFileURL)) }, isTargeted: { targeted = $0 })
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private func take(_ urls: [URL]) -> Bool {
        guard !disabled, !urls.isEmpty else { return false }
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
    @State private var summary: String?

    private var exists: Bool { FileManager.default.fileExists(atPath: source.path) }

    var body: some View {
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
                Button(action: onRemove) { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
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
