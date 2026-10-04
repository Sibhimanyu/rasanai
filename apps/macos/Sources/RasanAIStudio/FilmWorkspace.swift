import SwiftUI
import AVKit
import StudioCore

struct FilmWorkspace: View {
    @Bindable var store: StudioStore
    var body: some View {
        GeometryReader { geometry in
            VStack(alignment: .leading, spacing: 14) {
                ZStack {
                    Color.black.opacity(0.3)
                    if store.stage == .final, let player = store.finalPlayer {
                        NativeFilmPlayer(player: player)
                    } else if let scene = store.selectedScene {
                        if store.isSample {
                            SampleFilmFrame(scene: scene, progress: max(0, min(1, (store.playhead - scene.start) / scene.duration)))
                        } else if let url = store.asset(scene.thumbnail) {
                            LocalImage(url: url).aspectRatio(store.snapshot.aspectRatio, contentMode: .fit)
                        } else {
                            ContentUnavailableView("Waiting for a frame", systemImage: "photo", description: Text(scene.visual.isEmpty ? "Scene \(scene.id) has no key frame yet." : scene.visual))
                        }
                    } else {
                        ContentUnavailableView(store.stage == .final ? "The film is still being made" : "The animatic is not ready yet", systemImage: "film", description: Text("Frames and renders appear as the director publishes them."))
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 7))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(alignment: .topTrailing) {
                    if store.stage != .final || store.finalPlayer == nil {
                        Button { store.pause(); store.showNoteSheet = true } label: {
                            Image(systemName: "bubble.left").font(.system(size: 15)).foregroundStyle(.black).padding(10)
                                .background(StudioPalette.accent).clipShape(Circle())
                        }.buttonStyle(.plain).padding(12).disabled(!store.isSample && !store.isConnected)
                            .help("Leave a note at \(timecode(store.playhead))")
                    }
                }
                playbackControls
                FilmTimeline(store: store).frame(height: geometry.size.height > 650 ? 174 : 152)
                HStack(spacing: 10) {
                    Label(store.snapshot.musicTitle, systemImage: "music.note")
                    Label(store.snapshot.voiceName, systemImage: "waveform")
                    Spacer()
                    Text(store.isSample ? "Sample preview · silent" : "Space to play")
                        .font(.system(size: 11)).foregroundStyle(StudioPalette.muted)
                }.font(.system(size: 11)).foregroundStyle(StudioPalette.muted).padding(.bottom, 5)
            }.padding(.horizontal, 24).padding(.bottom, 18)
        }
    }
    private var playbackControls: some View {
        HStack(spacing: 18) {
            Button { store.togglePlayback() } label: { Image(systemName: store.isPlaying ? "pause.fill" : "play.fill").font(.system(size: 20)) }
                .help("Play / pause (Space)").disabled(store.duration <= 0)
            Button {
                let scenes = store.scenes
                let index = scenes.firstIndex { $0.id == store.selectedScene?.id } ?? 0
                if !scenes.isEmpty { store.seek(to: scenes[max(0, index - 1)].start) }
            } label: { Image(systemName: "backward.end.fill") }.help("Previous scene")
            Button {
                let scenes = store.scenes
                let index = scenes.firstIndex { $0.id == store.selectedScene?.id } ?? 0
                if !scenes.isEmpty { store.seek(to: scenes[min(scenes.count - 1, index + 1)].start) }
            } label: { Image(systemName: "forward.end.fill") }.help("Next scene")
            Text("\(timecode(store.playhead)) / \(timecode(store.duration))").font(.system(size: 12, design: .monospaced))
            Spacer()
            Text(store.selectedScene?.title ?? "").font(.system(size: 11)).foregroundStyle(StudioPalette.muted)
            Button { store.pause(); store.showNoteSheet = true } label: { Label("Add note", systemImage: "bubble.left.badge.plus") }
                .disabled(!store.isSample && !store.isConnected)
        }.buttonStyle(.plain).frame(height: 28)
    }
}

/// One set of playback controls owns the clock, so pinned notes use the visible frame's time.
struct NativeFilmPlayer: NSViewRepresentable {
    let player: AVPlayer
    func makeNSView(context: Context) -> AVPlayerView {
        let view = AVPlayerView()
        view.controlsStyle = .none
        view.videoGravity = .resizeAspect
        view.player = player
        return view
    }
    func updateNSView(_ view: AVPlayerView, context: Context) { view.player = player }
}

struct FilmTimeline: View {
    @Bindable var store: StudioStore
    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let duration = max(store.duration, 1)
            VStack(spacing: 6) {
                ZStack(alignment: .topLeading) {
                    ForEach(0..<5) { index in
                        Text(timecode(duration * Double(index) / 4))
                            .font(.system(size: 10, design: .monospaced)).foregroundStyle(StudioPalette.muted)
                            .offset(x: max(0, width * Double(index) / 4 - (index == 4 ? 35 : 0)))
                    }
                    ForEach(store.pendingNotes) { note in
                        Circle().fill(StudioPalette.accent).frame(width: 7, height: 7)
                            .offset(x: min(width - 7, width * note.time / duration), y: 17)
                    }
                }.frame(width: width, height: 25, alignment: .topLeading)
                HStack(spacing: 2) {
                    ForEach(Array(store.scenes.enumerated()), id: \.element.id) { index, scene in
                        let sceneWidth = max(1, (width - Double(max(0, store.scenes.count - 1)) * 2) * scene.duration / duration)
                        VStack(alignment: .leading, spacing: 0) {
                            SceneThumbnail(scene: scene, store: store).frame(height: 48).clipped()
                            Text(String(format: "%02d  %@", index + 1, scene.title)).font(.system(size: 9)).lineLimit(1)
                                .padding(.horizontal, 4).frame(height: 19)
                        }.frame(width: sceneWidth).background(StudioPalette.panel)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                            .overlay { RoundedRectangle(cornerRadius: 4).stroke(store.selectedScene?.id == scene.id ? StudioPalette.accent : .clear, lineWidth: 2) }
                    }
                }.allowsHitTesting(false)
                audioLane("Music", subtitle: store.snapshot.musicTitle, attached: store.asset(store.snapshot.audioFile) != nil)
                audioLane("Voice", subtitle: store.snapshot.voiceName, attached: false)
            }
            .overlay(alignment: .topLeading) {
                Rectangle().fill(StudioPalette.accent).frame(width: 1, height: geometry.size.height - 14)
                    .overlay(alignment: .top) { RoundedRectangle(cornerRadius: 2).fill(StudioPalette.accent).frame(width: 7, height: 10) }
                    .offset(x: min(width - 1, width * store.playhead / duration), y: 17).allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                store.seek(to: min(max(value.location.x / width, 0), 1) * duration)
            })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Film timeline")
            .accessibilityValue(timecode(store.playhead))
            .accessibilityAdjustableAction { direction in
                store.seek(to: store.playhead + (direction == .increment ? 1 : -1))
            }
        }
    }
    private func audioLane(_ title: String, subtitle: String, attached: Bool) -> some View {
        HStack(spacing: 10) {
            Text(title).font(.system(size: 10, weight: .medium)).frame(width: 38, alignment: .leading)
            Text(attached ? subtitle : "\(subtitle) · not attached").font(.system(size: 10)).foregroundStyle(StudioPalette.muted)
            Spacer()
            if attached { Image(systemName: "speaker.wave.2").font(.system(size: 10)).foregroundStyle(StudioPalette.mint) }
        }.padding(.horizontal, 8).frame(height: 23).background(StudioPalette.panel).clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

struct LocalImage: View {
    let url: URL
    @State private var image: NSImage?
    var body: some View {
        Group {
            if let image { Image(nsImage: image).resizable().scaledToFit() }
            else { Rectangle().fill(StudioPalette.raised).overlay { Image(systemName: "photo").foregroundStyle(StudioPalette.muted) } }
        }
        .task(id: url) { image = NSImage(contentsOf: url) }
    }
}

struct SceneThumbnail: View {
    let scene: FilmScene
    let store: StudioStore
    var body: some View {
        GeometryReader { geometry in
            if store.isSample {
                SampleFilmFrame(scene: scene, progress: 0.5)
                    .frame(width: geometry.size.width, height: geometry.size.height).clipped()
            } else if let url = store.asset(scene.thumbnail) {
                LocalImage(url: url).frame(width: geometry.size.width, height: geometry.size.height)
            } else {
                StudioPalette.raised.overlay { Text(scene.id).foregroundStyle(StudioPalette.muted) }
            }
        }
    }
}

/// A deliberately labelled native sample animatic, not a claim of an engine-generated render.
struct SampleFilmFrame: View {
    let scene: FilmScene
    let progress: Double
    private let paper = Color(red: 0.96, green: 0.95, blue: 0.92)
    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height
            let scale = min(width / 960, height / 540)
            ZStack {
                paper
                HStack(spacing: 24 * scale) {
                    VStack(alignment: .leading, spacing: 18 * scale) {
                        Text(scene.line).font(.system(size: 56 * scale, weight: .bold)).tracking(-2 * scale)
                            .lineSpacing(-2 * scale).fixedSize(horizontal: false, vertical: true)
                        Text(caption).font(.system(size: 18 * scale, weight: .medium)).foregroundStyle(.black.opacity(0.6))
                    }.frame(width: 440 * scale, alignment: .leading)
                    illustration(scale: scale)
                        .frame(width: 380 * scale, height: 360 * scale)
                        .offset(y: sin(progress * .pi) * -12 * scale)
                }.padding(48 * scale).foregroundStyle(Color.black.opacity(0.92))
            }
        }.aspectRatio(16 / 9, contentMode: .fit)
    }
    private var caption: String {
        switch scene.id {
        case "1": "The paper can wait. Until it can’t."
        case "2": "Twelve months. One place."
        case "3": "Capture it while it’s there."
        case "4": "From a pile to a picture."
        case "5": "A clearer picture, every month."
        case "6": "No end-of-year surprises."
        default: "Filed. Done."
        }
    }
    @ViewBuilder private func illustration(scale: Double) -> some View {
        switch scene.id {
        case "3":
            ZStack {
                RoundedRectangle(cornerRadius: 28 * scale).fill(Color(red: 0.12, green: 0.15, blue: 0.14))
                    .frame(width: 176 * scale, height: 312 * scale).shadow(color: .black.opacity(0.12), radius: 14 * scale, y: 10 * scale)
                RoundedRectangle(cornerRadius: 18 * scale).fill(StudioPalette.mint.opacity(0.25)).frame(width: 150 * scale, height: 278 * scale)
                Image(systemName: "checkmark.circle.fill").font(.system(size: 64 * scale)).foregroundStyle(StudioPalette.mint)
            }.rotationEffect(.degrees(-5 + progress * 6))
        case "7":
            Image(systemName: "checkmark").font(.system(size: 90 * scale, weight: .medium)).foregroundStyle(paper)
                .frame(width: 190 * scale, height: 190 * scale).background(StudioPalette.mint).clipShape(Circle())
        case "1", "2", "4":
            ZStack {
                ForEach(0..<4) { index in
                    LedgerPaper(title: scene.id == "2" ? ["JAN", "MAR", "JUN", "DEC"][index] : "Receipt", scale: scale, featured: false)
                        .rotationEffect(.degrees(Double(index - 2) * 12 + progress * 3))
                        .offset(x: Double(index - 2) * 37 * scale, y: Double(index) * -12 * scale)
                }
            }
        default:
            ZStack {
                LedgerPaper(title: "Income", scale: scale, featured: false).rotationEffect(.degrees(-13))
                    .offset(x: -72 * scale, y: 15 * scale)
                LedgerPaper(title: "Expenses", scale: scale, featured: false).rotationEffect(.degrees(-4))
                LedgerPaper(title: "This month", scale: scale, featured: true).rotationEffect(.degrees(7))
                    .offset(x: 98 * scale, y: -10 * scale)
            }
        }
    }
}

struct LedgerPaper: View {
    let title: String
    let scale: Double
    let featured: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 14 * scale) {
            Text(title).font(.system(size: 13 * scale, weight: .semibold))
            if featured {
                Text("$12,480").font(.system(size: 30 * scale, weight: .semibold)).tracking(-scale)
                Text("↗ +12%").font(.system(size: 10 * scale, weight: .medium)).foregroundStyle(StudioPalette.mint)
            } else {
                ForEach(0..<3) { index in Rectangle().fill(.black.opacity(0.12)).frame(width: Double(90 - index * 13) * scale, height: 4 * scale) }
            }
            HStack(alignment: .bottom, spacing: 6 * scale) {
                ForEach(0..<6) { index in
                    Rectangle().fill(StudioPalette.mint.opacity(0.8 + Double(index % 2) * 0.15))
                        .frame(width: 13 * scale, height: Double(18 + index * 12) * scale)
                }
            }.frame(height: 90 * scale, alignment: .bottom)
            ForEach(0..<3) { index in Rectangle().fill(.black.opacity(0.10)).frame(width: Double(118 - index * 20) * scale, height: 3 * scale) }
            Spacer(minLength: 0)
        }.foregroundStyle(.black).padding(19 * scale).frame(width: 184 * scale, height: 285 * scale)
            .background(Color(red: 0.99, green: 0.985, blue: 0.96))
            .shadow(color: .black.opacity(0.13), radius: 12 * scale, x: 2 * scale, y: 16 * scale)
    }
}
