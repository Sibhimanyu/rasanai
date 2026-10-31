import AppKit
import StudioCore
import SwiftUI

/// Setup screen: "Any reference films you love?" Takes file and folder drops, a file picker and pasted links.
/// The entries land in `FilmDraft.referenceFilms` (`reference_films` in the brief). Optional: Skip or Continue with none.
struct ReferenceFilmsScreen<Header: View>: View {
    @Binding var films: [String]
    let header: Header
    @State private var pasted = ""
    @State private var note: String?
    @FocusState private var linkFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            header
            FlowDropZone(symbol: "film.stack", title: "Drop films or a folder of them",
                         detail: "Optional. A few films you wish yours felt like: launch films, trailers, anything.",
                         buttons: [("Choose files or folders…", { choose() })], onDrop: { take($0) })
            linkField
            if let note { Label(note, systemImage: "info.circle").font(.system(size: 12)).foregroundStyle(.secondary) }
            if !films.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(films.count) reference film\(films.count == 1 ? "" : "s")").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                    ForEach(films, id: \.self) { entry in row(entry) }
                }
            }
        }
    }

    private var linkField: some View {
        HStack(spacing: 8) {
            Image(systemName: "link").foregroundStyle(.secondary)
            TextField("Paste a YouTube or Vimeo link, then press Return", text: $pasted)
                .textFieldStyle(.plain).font(.system(size: 13)).focused($linkFocused)
                .onSubmit { addLinks() }
                .accessibilityLabel("Reference film link")
            Button("Add") { addLinks() }.buttonStyle(.rasanSecondary).disabled(ReferenceFilms.links(in: pasted).isEmpty)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
    }

    private func row(_ entry: String) -> some View {
        let isFile = ReferenceFilms.isFilePath(entry)
        return HStack(spacing: 10) {
            if isFile {
                Image(nsImage: NSWorkspace.shared.icon(forFile: entry)).resizable().frame(width: 28, height: 28)
            } else {
                Image(systemName: "play.rectangle").font(.system(size: 18)).foregroundStyle(Color.rasan).frame(width: 28, height: 28)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(ReferenceFilms.title(entry)).font(.system(size: 13, weight: .medium)).lineLimit(1).truncationMode(.middle)
                Text(entry).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
            }
            Spacer(minLength: 4)
            Button { films.removeAll { $0 == entry } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                .buttonStyle(.plain).help("Remove (nothing on disk changes)").accessibilityLabel("Remove \(ReferenceFilms.title(entry))")
        }
        .padding(10).background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func addLinks() {
        let found = ReferenceFilms.links(in: pasted)
        if found.isEmpty {
            note = pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : "That is not a web link. Paste one that starts with https://"
            return
        }
        films = ReferenceFilms.merge(films, adding: found)
        pasted = ""; note = nil
    }

    private func choose() {
        let panel = NSOpenPanel(); panel.canChooseFiles = true; panel.canChooseDirectories = true; panel.allowsMultipleSelection = true
        panel.allowedContentTypes = [.movie, .video, .folder]
        panel.title = "Choose reference films"; panel.prompt = "Use these"
        if panel.runModal() == .OK { _ = take(panel.urls) }
    }

    private func take(_ urls: [URL]) -> Bool {
        let paths = urls.compactMap(ReferenceFilms.path(for:))
        guard !paths.isEmpty else { note = "Drop video files (mp4, mov, m4v, webm, mkv, avi or mts) or a folder of them."; return false }
        let before = films.count
        films = ReferenceFilms.merge(films, adding: paths)
        note = films.count - before < paths.count ? "Up to \(ReferenceFilms.limit) films, and each only once." : nil
        return true
    }
}
