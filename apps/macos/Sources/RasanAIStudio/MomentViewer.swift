import AVFoundation
import AppKit
import Observation
import StudioCore
import SwiftUI

/// The big player behind the expanded viewer: sound on by default, loop, scrub, play and pause. One per open viewer.
@MainActor @Observable
final class MomentViewerPlayer {
    private(set) var isPlaying = false
    private(set) var ready = false
    /// Whether the clip has a sound track at all (many reference clips are silent files); nil until known.
    private(set) var hasAudio: Bool?
    private(set) var loadedURL: URL?
    var time: Double = 0
    private(set) var duration: Double = 0
    var muted = false { didSet { player.isMuted = muted } }
    var loops = true
    let player = AVPlayer()
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var statusObserver: NSKeyValueObservation?
    @ObservationIgnored private var scrubbing = false

    init() {
        player.isMuted = false
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.05, preferredTimescale: 600), queue: .main) { [weak self] t in
            MainActor.assumeIsolated {
                guard let self, !self.scrubbing else { return }
                self.time = t.seconds.isFinite ? t.seconds : 0
                self.isPlaying = self.player.timeControlStatus != .paused
            }
        }
    }

    func load(_ url: URL?) {
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil; statusObserver = nil
        player.pause()
        ready = false; time = 0; duration = 0; hasAudio = nil; loadedURL = url
        guard let url else { player.replaceCurrentItem(with: nil); isPlaying = false; return }
        let item = AVPlayerItem(url: url)
        Task { @MainActor [weak self] in
            let tracks = try? await item.asset.loadTracks(withMediaType: .audio)
            guard let self, self.loadedURL == url else { return }
            self.hasAudio = !(tracks ?? []).isEmpty
        }
        player.replaceCurrentItem(with: item)
        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self, item.status == .readyToPlay else { return }
                self.duration = item.duration.seconds.isFinite ? item.duration.seconds : 0
                self.ready = true
            }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                if self.loops { self.player.seek(to: .zero); self.player.play() } else { self.isPlaying = false }
            }
        }
        player.play(); isPlaying = true
    }
    func toggle() {
        if isPlaying { player.pause(); isPlaying = false }
        else {
            if duration > 0, time >= duration - 0.05 { player.seek(to: .zero) }
            player.play(); isPlaying = true
        }
    }
    func scrub(to seconds: Double, editing: Bool) {
        scrubbing = editing
        time = seconds
        player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    }
    func stop() {
        player.pause(); player.replaceCurrentItem(with: nil); isPlaying = false; loadedURL = nil; hasAudio = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil; statusObserver = nil
    }
}

private struct ViewerVideo: NSViewRepresentable {
    let player: AVPlayer
    func makeNSView(context: Context) -> NSView {
        let view = NSView(); view.wantsLayer = true
        let layer = AVPlayerLayer(player: player); layer.videoGravity = .resizeAspect
        view.layer = layer
        return view
    }
    func updateNSView(_ view: NSView, context: Context) {}
}

/// The large viewer for one move: plays with sound, then the details and the Add / Remove button. Keys: Space plays or
/// pauses, left and right step through the gallery, Esc closes.
struct MomentViewer: View {
    @Bindable var gallery: MomentGallery
    /// Nil hides the add button (when opened from a place that does not edit the user's moves).
    var selection: Binding<MomentSelection>?
    /// The gallery's one shared player (never a player per view: see MomentGallery.viewerPlayer).
    private var player: MomentViewerPlayer { gallery.viewerPlayer }
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea().onTapGesture { close() }
            if let moment = gallery.viewing { card(moment) }
        }
        .transition(.opacity)
        // a viewer opened without openViewer (an older call site) still gets its clip, once
        .onAppear { if gallery.viewing != nil, player.loadedURL != gallery.viewing?.clipURL { player.load(gallery.viewing?.clipURL) } }
    }

    private func card(_ moment: Moment) -> some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 0) {
                ZStack {
                    Color.black
                    MomentStill(url: moment.stillURL, maxPixels: 1280).opacity(player.ready ? 0 : 1)
                    ViewerVideo(player: player.player).opacity(player.ready ? 1 : 0)
                }
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .contentShape(Rectangle()).onTapGesture { player.toggle() }
                controls
            }
            .frame(minWidth: 520)
            details(moment).frame(width: 300)
        }
        .background(Color(nsColor: .windowBackgroundColor), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.4), radius: 30, y: 10)
        .padding(28)
        .frame(maxWidth: 1100)
        .focusable().focused($focused).focusEffectDisabled()
        .onAppear { focused = true }
        .onKeyPress(.space) { player.toggle(); return .handled }
        .onKeyPress(.leftArrow) { gallery.step(-1); return .handled }
        .onKeyPress(.rightArrow) { gallery.step(1); return .handled }
        .onKeyPress(.escape) { close(); return .handled }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Move viewer: \(moment.name)")
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button { player.toggle() } label: { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").frame(width: 18) }
                .buttonStyle(.plain).help(player.isPlaying ? "Pause (Space)" : "Play (Space)")
                .accessibilityLabel(player.isPlaying ? "Pause" : "Play")
            Slider(value: Binding(get: { player.time }, set: { player.scrub(to: $0, editing: true) }),
                   in: 0...max(player.duration, 0.1), onEditingChanged: { editing in if !editing { player.scrub(to: player.time, editing: false) } })
                .controlSize(.small).accessibilityLabel("Scrub")
            Text(String(format: "%.1f / %.1f s", player.time, player.duration)).font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
            if player.hasAudio == false {
                Label("No sound in this clip", systemImage: "speaker.slash").font(.system(size: 11)).foregroundStyle(.secondary)
                    .help("This reference clip was published without a sound track")
            } else {
                Button { player.muted.toggle() } label: { Image(systemName: player.muted ? "speaker.slash.fill" : "speaker.wave.2.fill").frame(width: 18) }
                    .buttonStyle(.plain).help(player.muted ? "Sound off. Click to turn it on" : "Sound on. Click to mute")
                    .accessibilityLabel(player.muted ? "Unmute" : "Mute")
            }
            Button { player.loops.toggle() } label: { Image(systemName: "repeat").foregroundStyle(player.loops ? Color.rasan : Color.secondary).frame(width: 18) }
                .buttonStyle(.plain).help(player.loops ? "Loop is on" : "Loop is off")
                .accessibilityLabel(player.loops ? "Loop on" : "Loop off")
        }
        .padding(.horizontal, 14).frame(height: 40)
    }

    private func details(_ moment: Moment) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Text(moment.name).font(.system(size: 15, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Button { close() } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 17)).foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Close (Esc)").accessibilityLabel("Close")
            }
            if !moment.mechanic.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(moment.mechanic, id: \.self) { tag in
                        Text(Moment.mechanicTitle(tag)).font(.system(size: 11)).padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Color.primary.opacity(0.07), in: Capsule())
                    }
                }
            }
            if !moment.why.isEmpty { Text(moment.why).font(.system(size: 12.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 6) {
                if moment.duration > 0 { Label(String(format: "%.1f seconds", moment.duration), systemImage: "clock").font(.system(size: 11.5)).foregroundStyle(.secondary) }
                if let creator = moment.creator {
                    if let url = creator.url {
                        Button { SafeOpen.open(url) } label: {
                            Label("By \(creator.displayName), original post", systemImage: "arrow.up.right.square").font(.system(size: 11.5))
                        }.buttonStyle(.link).help("Open the original post")
                    } else {
                        Label("By \(creator.displayName)", systemImage: "person").font(.system(size: 11.5)).foregroundStyle(.secondary)
                    }
                }
                Text("Clips belong to their creators. RasanAI borrows how it moves, never the words, brand or footage.").font(.system(size: 10.5)).foregroundStyle(.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let selection { addButton(moment, selection) }
            HStack {
                Button { gallery.step(-1) } label: { Image(systemName: "chevron.left") }.help("Previous (left arrow)").accessibilityLabel("Previous move")
                Button { gallery.step(1) } label: { Image(systemName: "chevron.right") }.help("Next (right arrow)").accessibilityLabel("Next move")
                Spacer()
                Text("Space plays · Esc closes").font(.system(size: 10.5)).foregroundStyle(.tertiary)
            }
        }
        .padding(16).frame(maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder private func addButton(_ moment: Moment, _ selection: Binding<MomentSelection>) -> some View {
        let picked = selection.wrappedValue.contains(moment.id)
        let full = selection.wrappedValue.isFull
        Button {
            withAnimation(.snappy(duration: 0.2)) { _ = selection.wrappedValue.toggle(moment) }
        } label: {
            Text(picked ? "Remove from Moves I like" : full ? "Moves I like is full (4)" : "Add to Moves I like").frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent).controlSize(.large).tint(picked ? .gray : Color.rasan).disabled(!picked && full)
    }

    private func close() { withAnimation(.easeOut(duration: 0.15)) { gallery.closeViewer() } }
}

extension View {
    /// Lays the expanded move viewer over this view whenever the gallery has one open.
    func momentViewer(gallery: MomentGallery, selection: Binding<MomentSelection>?) -> some View {
        overlay { if gallery.viewingID != nil { MomentViewer(gallery: gallery, selection: selection) } }
            .animation(.easeOut(duration: 0.18), value: gallery.viewingID)
    }
}

// MARK: Reaching the gallery from stages

private struct MomentGalleryKey: EnvironmentKey { nonisolated(unsafe) static var defaultValue: StudioStore? = nil }
extension EnvironmentValues {
    /// The studio store, for stages that show or swap the user's moves. Nil in previews.
    var momentStore: StudioStore? {
        get { self[MomentGalleryKey.self] }
        set { self[MomentGalleryKey.self] = newValue }
    }
}

/// Picks a gallery move for a frame: the user's own moves first, then everything else, searchable.
struct MomentPickerSheet: View {
    let gallery: MomentGallery
    let mine: [FilmMoment]
    let onPick: (Moment) -> Void
    let onCancel: () -> Void
    @State private var query = ""

    private var matches: [Moment] {
        let words = query.lowercased().split(separator: " ").map(String.init)
        let all = gallery.moments.filter { m in words.allSatisfy { m.searchText.contains($0) } }
        let ids = mine.map(\.id)
        return all.filter { ids.contains($0.id) } + all.filter { !ids.contains($0.id) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Swap the move").font(.system(size: 15, weight: .semibold))
                Spacer()
                Button("Cancel", action: onCancel).keyboardShortcut(.cancelAction)
            }.padding(16)
            TextField("Search by name, technique or creator", text: $query).textFieldStyle(.roundedBorder).padding(.horizontal, 16).padding(.bottom, 10)
            Divider()
            List(matches) { moment in
                Button { onPick(moment) } label: {
                    HStack(spacing: 10) {
                        MomentStill(url: moment.stillURL, maxPixels: 160).frame(width: 64, height: 36).clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(moment.name).font(.system(size: 12.5, weight: .medium)).lineLimit(1)
                            Text(moment.techniques.map(\.title).joined(separator: " · ")).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        if mine.contains(where: { $0.id == moment.id }) { Text("Moves I like").font(.system(size: 10.5, weight: .semibold)).foregroundStyle(Color.rasan) }
                    }.contentShape(Rectangle())
                }.buttonStyle(.plain)
            }
        }
        .frame(width: 520, height: 520)
    }
}
