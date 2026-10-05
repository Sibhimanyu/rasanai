import AppKit
import AVKit
import StudioCore
import SwiftUI

/// Browsing another film never changes the running director's snapshot, polling or media.
struct LibraryFilmPage: View {
    @Bindable var store: StudioStore
    let url: URL
    @State private var archive: FilmArchive?
    @State private var player: AVPlayer?
    @State private var error: String?
    @State private var previewURL: URL?
    @State private var previewVersion: String?
    var body: some View {
        Group {
            if let archive {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        if let player, let session = archive.session {
                            VideoPlayer(player: player).aspectRatio(session.aspectRatio, contentMode: .fit)
                                .frame(maxWidth: session.aspectRatio < 1 ? 360 : 820)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                            HStack {
                                Text(previewVersion.map { "Watching v\($0)" } ?? "Latest film").font(.headline)
                                if previewVersion != nil { Button("Watch latest") { watch(archive.video, version: nil) } }
                                Spacer()
                                Button("Export…") { store.exportVideo(source: previewURL ?? archive.video, captions: archive.captions) }.buttonStyle(.borderedProminent)
                            }
                            FilmHistoryView(snapshot: session, resolver: archive.resolver, onPreview: { version in watch(archive.resolver?.resolve(version.video), version: version.id) })
                            Text("You can review and export this film while the director works. Return here when it finishes to request a revision.")
                                .font(.system(size: 12)).foregroundStyle(.secondary)
                        } else {
                            Text("The brief").font(.system(size: 22, weight: .semibold))
                            let draft = store.settings.editorDraft(for: url)?.film ?? archive.draft
                            Text(draft?.brief.isEmpty == false ? draft!.brief : "Add a description to prepare this film.").textSelection(.enabled)
                            if let draft {
                                Text("\(draft.duration) seconds · \(draft.aspect) · \(draft.motionLevel.capitalized) motion").font(.system(size: 12)).foregroundStyle(.secondary)
                            }
                            if store.settings.filmQueue.contains(where: { $0.project == url }) {
                                Button("View queue") { store.path.append(.queue) }.buttonStyle(.borderedProminent)
                                Text("Remove this film from the queue to edit its brief or files.").font(.system(size: 12)).foregroundStyle(.secondary)
                            } else {
                                Button("Edit draft") { store.path.append(.newFilm(url)) }.buttonStyle(.borderedProminent)
                            }
                            Text("Save this draft or add it to the queue from its editor.")
                                .font(.system(size: 12)).foregroundStyle(.secondary)
                        }
                        HStack {
                            Button("Check readiness…") { store.showPreflight(project: url) }
                            Button("Export Project…") { store.exportProject(url) }
                        }
                        Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                    }.padding(32).frame(maxWidth: 820).frame(maxWidth: .infinity)
                }
            } else if let error { ContentUnavailableView("Couldn't open this film", systemImage: "film", description: Text(error)) }
            else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .navigationTitle(archive?.title ?? "Film")
        .background(Color(nsColor: .windowBackgroundColor))
        .task(id: url) {
            let library = store.projectLibrary(for: url)
            do {
                let loaded = try await Task.detached { try FilmArchive.load(url, library: library) }.value
                guard !Task.isCancelled else { return }
                archive = loaded
                if store.displayedFilmURL == url { store.browsedFilm = loaded }
                watch(loaded.video, version: nil)
            } catch { self.error = error.localizedDescription }
        }
        .onDisappear {
            player?.pause()
            if store.browsedFilm?.project == url { store.browsedFilm = nil }
            if store.previewFilm == url { store.previewFilm = nil; store.previewVideo = nil }
        }
    }
    private func watch(_ url: URL?, version: String?) {
        player?.pause(); previewURL = url; previewVersion = version
        store.previewFilm = self.url; store.previewVideo = url
        player = url.map(AVPlayer.init(url:))
    }
}

struct FilmHistoryView: View {
    let snapshot: SessionSnapshot
    let resolver: AssetResolver?
    var onPreview: ((FilmVersion) -> Void)?
    var onRestore: ((FilmVersion) -> Void)?
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !snapshot.filmChanges.isEmpty {
                Text("Changed in \(snapshot.final["version"].identifier.map { "v\($0)" } ?? "this version")").font(.headline)
                ForEach(Array(snapshot.filmChanges.enumerated()), id: \.offset) { _, change in
                    Label(change, systemImage: "checkmark").font(.system(size: 13))
                }
            }
            if !snapshot.filmVersions.isEmpty {
                Text("Versions").font(.headline)
                ForEach(snapshot.filmVersions.reversed()) { version in
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("v\(version.id)\(version.id == snapshot.final["version"].identifier ? " · Current" : "")").font(.system(size: 13, weight: .medium))
                            if let when = version.when { Text(when).font(.system(size: 11)).foregroundStyle(.secondary) }
                            if !version.changes.isEmpty { Text(version.changes.joined(separator: " · ")).font(.system(size: 12)).foregroundStyle(.secondary) }
                        }
                        Spacer()
                        if let onPreview, resolver?.resolve(version.video) != nil { Button("Preview") { onPreview(version) } }
                        if let onRestore, version.id != snapshot.final["version"].identifier { Button("Restore…") { onRestore(version) } }
                    }.padding(12).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
                }
            }
            let addressed = snapshot.notes.filter { $0.state == "resolved" }
            if !addressed.isEmpty {
                DisclosureGroup("\(addressed.count) addressed \(addressed.count == 1 ? "note" : "notes")") {
                    ForEach(addressed) { note in
                        HStack(alignment: .top) {
                            Text(timecode(note.time)).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                            Text(note.text).font(.system(size: 12)).textSelection(.enabled)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 4)
                    }
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
