import AppKit
import AVFoundation
import Observation
import StudioCore
import SwiftUI

// MARK: - Minor panels B
//
// The step-specific bodies for styleframes, motion, transitions, voice, music, storyboard, keyframes, plan, direction
// and any unknown step. StepPanel wraps each with the question, context, decision line, note box and "You decide this
// step"; the choice/approve button for the call lives here, at the end of each body, because only the panel knows what
// is selected.

// MARK: Helpers

private func mpbText(_ value: JSONValue) -> String? {
    if let s = value.string, !s.isEmpty { return s }
    return value.identifier
}

private func mpbTexts(_ value: JSONValue) -> [String] {
    if let s = value.string { return s.isEmpty ? [] : [s] }
    return value.array.compactMap { item in
        if let s = item.string { return s }
        return mpbText(item["problem"]) ?? mpbText(item["text"]) ?? mpbText(item["title"]) ?? mpbText(item["label"]) ?? item.identifier
    }
}

private func mpbFirst(_ value: JSONValue, _ keys: [String]) -> String? {
    for key in keys { if let s = value[key].string, !s.isEmpty { return s } }
    return nil
}

private func mpbExt(_ path: String?) -> String {
    guard let path else { return "" }
    return (path.split(separator: "?").first.map(String.init) ?? path).split(separator: ".").last.map { $0.lowercased() } ?? ""
}
private func mpbIsVideo(_ path: String?) -> Bool { ["mp4", "mov", "m4v", "webm"].contains(mpbExt(path)) }
private func mpbIsGIF(_ path: String?) -> Bool { mpbExt(path) == "gif" }
private func mpbIsImage(_ path: String?) -> Bool { ["png", "jpg", "jpeg", "webp", "heic", "tiff", "gif"].contains(mpbExt(path)) }
private func mpbIsHTML(_ path: String?) -> Bool { ["html", "htm"].contains(mpbExt(path)) }

private func mpbSeconds(_ value: JSONValue) -> String? {
    guard let n = value.number else { return value.string }
    return clockText(n)
}

/// The id to preselect: what was already sent, else Claude's pick, else the first.
private func mpbInitial(_ payload: JSONValue, ids: [String], fallback: String? = nil) -> String? {
    if let sent = payload["sent"]["value"].identifier, ids.contains(sent) { return sent }
    if let rec = payload["recommended"].identifier, ids.contains(rec) { return rec }
    return fallback.flatMap { ids.contains($0) ? $0 : nil } ?? ids.first
}

private func mpbSend(_ model: FilmSessionModel, _ step: String, _ type: String, _ value: JSONValue = .null, note: String = "") {
    Task { await model.send(step: step, type: type, value: value, note: note) }
}

/// A stable hue from a string, for placeholder art.
private func mpbHue(_ seed: String) -> Double {
    var h: UInt64 = 1469598103934665603
    for b in seed.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
    return Double(h % 360) / 360
}

private struct PanelEmpty: View {
    let symbol: String
    let title: String
    var detail: String?
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: symbol).font(.system(size: 26, weight: .light)).foregroundStyle(.tertiary)
            Text(title).font(.system(size: 14, weight: .medium)).multilineTextAlignment(.center)
            if let detail { Text(detail).font(.system(size: 12)).foregroundStyle(.secondary).multilineTextAlignment(.center) }
        }
        .padding(28).frame(maxWidth: .infinity)
        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// The secondary controls that end a panel. The primary action registers with the frame's pinned bar (`.stepPrimary`),
/// so Return and the note box work the same on every step.
private struct PanelActions<Secondary: View>: View {
    let model: FilmSessionModel
    let step: String
    var title: String
    var symbol = "checkmark"
    var enabled = true
    var primaryVisible = true
    let action: (String) -> Void
    @ViewBuilder var secondary: Secondary

    var body: some View {
        let canAct = model.canAct(on: step)
        // A real (clear) view carries `.stepPrimary`, so it registers even when `secondary` is empty.
        ZStack(alignment: .leading) {
            if primaryVisible {
                Color.clear.frame(maxWidth: .infinity, minHeight: 1, maxHeight: 1)
                    .stepPrimary(title, symbol: symbol, enabled: enabled, perform: action)
            }
            secondary.disabled(!canAct)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private extension PanelActions where Secondary == EmptyView {
    init(model: FilmSessionModel, step: String, title: String, symbol: String = "checkmark", enabled: Bool = true, action: @escaping (String) -> Void) {
        self.init(model: model, step: step, title: title, symbol: symbol, enabled: enabled, action: action, secondary: { EmptyView() })
    }
}

/// A selectable card with a radio mark, used for every "pick one" row.
private struct PickCard<Content: View>: View {
    let selected: Bool
    var padding: CGFloat = 14
    var label: String
    let select: () -> Void
    @ViewBuilder var content: Content
    @State private var hovering = false
    var body: some View {
        content
            .padding(padding).frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(hovering: hovering && !selected, selected: selected)
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .onHover { hovering = $0 }
            .onTapGesture { withAnimation(.snappy(duration: 0.18)) { select() } }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
            .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
            .accessibilityAction { select() }
    }
}

private struct RadioMark: View {
    let on: Bool
    var body: some View {
        Image(systemName: on ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 18)).foregroundStyle(on ? Color.rasan : Color(nsColor: .tertiaryLabelColor))
            .symbolRenderingMode(.hierarchical).accessibilityHidden(true)
    }
}

private struct Tag: View {
    let text: String
    var tint: Color = .secondary
    var body: some View {
        Text(text).font(.system(size: 11, weight: .medium)).foregroundStyle(tint)
            .padding(.horizontal, 7).padding(.vertical, 2.5)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

// MARK: Media

/// A muted, looping video preview.
private struct LoopingVideo: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> LoopView { LoopView(url: url) }
    func updateNSView(_ view: LoopView, context: Context) {}
    static func dismantleNSView(_ view: LoopView, coordinator: ()) { view.stop() }

    final class LoopView: NSView {
        private let player: AVQueuePlayer
        private let looper: AVPlayerLooper
        private let layerView = AVPlayerLayer()
        init(url: URL) {
            player = AVQueuePlayer()
            looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
            super.init(frame: .zero)
            wantsLayer = true
            layerView.player = player
            layerView.videoGravity = .resizeAspectFill
            layer?.addSublayer(layerView)
            player.isMuted = true
            player.play()
        }
        required init?(coder: NSCoder) { nil }
        override func layout() { super.layout(); layerView.frame = bounds }
        func stop() { player.pause(); looper.disableLooping() }
    }
}

/// A looping GIF (NSImageView animates it).
private struct AnimatedGIF: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> NSImageView {
        let view = NSImageView()
        view.image = NSImage(contentsOf: url)
        view.animates = true
        view.imageScaling = .scaleProportionallyUpOrDown
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }
    func updateNSView(_ view: NSImageView, context: Context) {}
}

/// Shows a payload file as a looping preview if it is video or GIF, else as a still. `nil` when there is nothing to show.
private struct PreviewMedia: View {
    let model: FilmSessionModel
    let path: String?
    var body: some View {
        if mpbIsVideo(path), let url = model.fileURL(path) {
            LoopingVideo(url: url).accessibilityHidden(true)
        } else if mpbIsGIF(path), let url = model.fileURL(path) {
            AnimatedGIF(url: url).accessibilityHidden(true)
        } else {
            PayloadImage(path: path, contentMode: .fill)
        }
    }
}

/// Art for a card that has no picture: a gradient from its id with a large letter.
private struct PlaceholderArt: View {
    let seed: String
    var mark: String?
    var body: some View {
        let h = mpbHue(seed)
        ZStack {
            LinearGradient(colors: [Color(hue: h, saturation: 0.5, brightness: 0.86), Color(hue: (h + 0.08).truncatingRemainder(dividingBy: 1), saturation: 0.65, brightness: 0.5)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            Circle().fill(.white.opacity(0.14)).scaleEffect(0.9).offset(x: 70, y: 18)
            if let mark { Text(mark).font(.system(size: 54, weight: .bold, design: .rounded)).foregroundStyle(.white.opacity(0.92)) }
        }
        .accessibilityHidden(true)
    }
}

/// An item with a 16:9 picture slot, rounded, with an optional corner badge.
private struct Frame16x9<Content: View>: View {
    var radius: CGFloat = 9
    @ViewBuilder var content: Content
    var body: some View {
        Color.clear.aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay { content }
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5) }
    }
}

// MARK: Audio

/// One audio preview at a time; reports progress so rows can draw a moving playhead.
@MainActor @Observable
private final class PreviewAudio {
    static let shared = PreviewAudio()
    private(set) var playingID: String?
    private(set) var progress = 0.0
    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    func toggle(id: String, url: URL) {
        if playingID == id { stop(); return }
        stop()
        AudioPreviewCenter.shared.stop()
        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        self.player = player
        playingID = id
        progress = 0
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.05, preferredTimescale: 600), queue: .main) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self, let duration = self.player?.currentItem?.duration.seconds, duration.isFinite, duration > 0 else { return }
                self.progress = min(1, max(0, time.seconds / duration))
            }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.stop() }
        }
        player.play()
    }

    func seek(id: String, to fraction: Double) {
        guard playingID == id, let player, let duration = player.currentItem?.duration.seconds, duration.isFinite else { return }
        player.seek(to: CMTime(seconds: duration * fraction, preferredTimescale: 600))
        progress = fraction
    }

    func stop() {
        if let timeObserver, let player { player.removeTimeObserver(timeObserver) }
        timeObserver = nil
        player?.pause(); player = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver); self.endObserver = nil }
        playingID = nil; progress = 0
    }
}

/// The loudness outline of a file, read once (64 peaks); a stable pseudo outline until it loads or when it cannot be read.
private enum Peaks {
    static func read(_ url: URL, buckets: Int = 64) -> [Float]? {
        guard let file = try? AVAudioFile(forReading: url), file.length > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 32768) else { return nil }
        let total = file.length
        let per = max(1, total / Int64(buckets))
        var out = [Float](repeating: 0, count: buckets)
        var position: Int64 = 0
        while position < total {
            do { try file.read(into: buffer) } catch { break }
            let count = Int(buffer.frameLength)
            if count == 0 { break }
            if let channel = buffer.floatChannelData?[0] {
                var i = 0
                while i < count {
                    let b = min(buckets - 1, Int((position + Int64(i)) / per))
                    out[b] = max(out[b], abs(channel[i]))
                    i += 8
                }
            }
            position += Int64(count)
        }
        let top = out.max() ?? 0
        guard top > 0 else { return nil }
        return out.map { max(0.06, $0 / top) }
    }

    static func pseudo(_ seed: String, buckets: Int = 64) -> [Float] {
        var h: UInt64 = 1469598103934665603
        for b in seed.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        var x = h | 1
        return (0..<buckets).map { i in
            x ^= x << 13; x ^= x >> 7; x ^= x << 17
            let r = Float(x % 1000) / 1000
            let envelope = 0.45 + 0.4 * sin(Float(i) / Float(buckets) * .pi)
            return max(0.08, min(1, envelope * (0.35 + 0.65 * r)))
        }
    }
}

private struct Waveform: View {
    let seed: String
    let url: URL?
    var progress: Double
    var height: CGFloat = 34
    var seek: ((Double) -> Void)?
    @State private var peaks: [Float]?

    var body: some View {
        let values = peaks ?? Peaks.pseudo(seed)
        Canvas { context, size in
            let n = values.count
            let slot = size.width / CGFloat(n)
            let bar = max(1.5, slot * 0.58)
            for (i, v) in values.enumerated() {
                let h = max(3, CGFloat(v) * size.height)
                let rect = CGRect(x: CGFloat(i) * slot + (slot - bar) / 2, y: (size.height - h) / 2, width: bar, height: h)
                let played = Double(i) / Double(n) < progress
                context.fill(Path(roundedRect: rect, cornerRadius: bar / 2),
                             with: .color(played ? Color.rasan : Color.primary.opacity(0.22)))
            }
        }
        .frame(height: height)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0).onEnded { _ in })
        .overlay {
            GeometryReader { geo in
                Color.clear.contentShape(Rectangle())
                    .gesture(SpatialTapGesture().onEnded { tap in seek?(min(1, max(0, tap.location.x / geo.size.width))) })
            }
        }
        .task(id: url) {
            guard let url else { peaks = nil; return }
            peaks = await Task.detached(priority: .utility) { Peaks.read(url) }.value
        }
        .accessibilityHidden(true)
    }
}

/// A round play/pause button bound to `PreviewAudio`.
private struct PlayDisc: View {
    let id: String
    let url: URL?
    let title: String
    var size: CGFloat = 38
    var body: some View {
        let audio = PreviewAudio.shared
        let playing = audio.playingID == id
        Button {
            if let url { audio.toggle(id: id, url: url) }
        } label: {
            Image(systemName: playing ? "pause.fill" : "play.fill")
                .font(.system(size: size * 0.38, weight: .semibold))
                .frame(width: size, height: size)
                .background(playing ? Color.rasan : Color(nsColor: .quaternaryLabelColor).opacity(0.55), in: Circle())
                .foregroundStyle(playing ? Color.white : Color.primary)
        }
        .buttonStyle(.plain).disabled(url == nil)
        .help(url == nil ? "No audio file for this option" : (playing ? "Pause \(title)" : "Play \(title)"))
        .accessibilityLabel(playing ? "Pause \(title)" : "Play \(title)")
        .onDisappear { if playing { audio.stop() } }
    }
}

// MARK: - Styleframes

struct StyleframesPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    private struct Item: Identifiable { let id: Int; let path: String; let caption: String }

    private var items: [Item] {
        let d = model.payload(step)
        let captions = d["captions"].array
        return d["images"].array.enumerated().compactMap { i, v in
            let path = v.string ?? mpbFirst(v, ["path", "src", "file", "image"])
            guard let path else { return nil }
            let caption = (i < captions.count ? mpbText(captions[i]) : nil) ?? mpbFirst(v, ["caption", "title"]) ?? "Frame \(i + 1)"
            return Item(id: i, path: path, caption: caption)
        }
    }

    var body: some View {
        let items = items
        VStack(alignment: .leading, spacing: 20) {
            if items.isEmpty {
                PanelEmpty(symbol: "photo.on.rectangle.angled", title: "Style frames appear here",
                           detail: "Key frames of your video, designed in the chosen direction, for you to approve before anything moves.")
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 250, maximum: 420), spacing: 18, alignment: .top)], alignment: .leading, spacing: 20) {
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            Frame16x9(radius: 10) { PayloadImage(path: item.path, contentMode: .fill, maxPixels: 1400) }
                                .overlay(alignment: .topLeading) {
                                    Text("\(item.id + 1)").font(.system(size: 11, weight: .bold).monospacedDigit())
                                        .padding(.horizontal, 7).padding(.vertical, 3)
                                        .background(.ultraThinMaterial, in: Capsule()).padding(8)
                                }
                                .shadow(color: .black.opacity(0.14), radius: 10, y: 4)
                                .contextMenu {
                                    if let url = model.fileURL(item.path) {
                                        Button("Open in Preview") { SafeOpen.open(url) }
                                        Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                                    }
                                }
                                .onTapGesture(count: 2) { if let url = model.fileURL(item.path) { SafeOpen.open(url) } }
                            Text(item.caption).font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Style frame \(item.id + 1): \(item.caption)")
                    }
                }
                PanelActions(model: model, step: step, title: "These are right. Animate them", symbol: "checkmark") {
                    mpbSend(model, step, "approve", note: $0)
                }
            }
        }
    }
}

// MARK: - Motion

struct MotionPanel: View {
    let model: FilmSessionModel
    let step: String
    @State private var selection: String?
    @State private var adjectives: [String] = []
    @State private var adjustOpen = false
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    private struct Cell: Identifiable {
        let id: String, letter: String, name: String, line: String, media: String?, parent: String?
    }

    private var cells: [Cell] {
        model.payload(step)["cells"].array.enumerated().compactMap { i, c in
            guard let id = mpbText(c["id"]) ?? mpbText(c["name"]) else { return nil }
            let letter = c["letter"].string ?? String(UnicodeScalar(UInt8(65 + min(i, 25))))
            return Cell(id: id, letter: letter, name: c["name"].string ?? c["title"].string ?? id,
                        line: c["oneLiner"].string ?? c["text"].string ?? c["description"].string ?? "",
                        media: mpbFirst(c, ["video", "preview", "loop", "gif", "mp4", "image", "still", "poster", "thumb"]),
                        parent: c["parent"].string)
        }
    }

    private var adjectiveList: [(id: String, doc: String?)] {
        let a = model.payload(step)["adjectives"]
        if case .object(let dict) = a { return dict.keys.sorted().map { ($0, dict[$0]?.string) } }
        return a.array.compactMap { v in
            if let s = v.string { return (s, nil) }
            guard let id = mpbText(v["id"]) else { return nil }
            return (id, v["doc"].string)
        }
    }

    var body: some View {
        let d = model.payload(step)
        let cells = cells
        let ids = cells.map(\.id)
        let current = selection ?? mpbInitial(d, ids: ids)
        let tasting = d["tasting"].string.map { String($0.split(separator: "?").first ?? "") }
        VStack(alignment: .leading, spacing: 20) {
            if cells.isEmpty {
                PanelEmpty(symbol: "waveform.path", title: "Claude is rendering your own lines in a few motion languages",
                           detail: "They appear here, playing.")
            } else {
                HStack(alignment: .firstTextBaseline) {
                    if d["context"].string == nil {
                        Text("Each card plays your own line the way the whole film will move. Watch a few loops, then pick one.")
                            .font(.system(size: 13)).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 12)
                    if let tasting, mpbIsHTML(tasting) { OpenInBrowserButton(path: tasting, title: "Watch them all in the browser") }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 300, maximum: 520), spacing: 18, alignment: .top)], alignment: .leading, spacing: 18) {
                    ForEach(cells) { cell in
                        let on = current == cell.id
                        let recommended = d["recommended"].identifier == cell.id
                        PickCard(selected: on, padding: 12, label: "\(cell.name). \(cell.line)\(recommended ? ". Claude's pick" : "")") {
                            selection = cell.id
                        } content: {
                            VStack(alignment: .leading, spacing: 10) {
                                Frame16x9(radius: 8) {
                                    if let media = cell.media {
                                        PreviewMedia(model: model, path: media)
                                    } else {
                                        PlaceholderArt(seed: cell.id, mark: cell.letter)
                                    }
                                }
                                .overlay(alignment: .topLeading) {
                                    Text(cell.letter).font(.system(size: 11, weight: .bold))
                                        .frame(width: 22, height: 22).background(.ultraThinMaterial, in: Circle()).padding(8)
                                }
                                HStack(alignment: .firstTextBaseline, spacing: 8) {
                                    RadioMark(on: on)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack(spacing: 8) {
                                            Text(cell.name).font(.system(size: 15, weight: .semibold))
                                            if recommended { RecommendedBadge(text: "Claude's pick") }
                                        }
                                        if !cell.line.isEmpty {
                                            Text(cell.line).font(.system(size: 12.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let adjs = adjectiveList
                if !adjs.isEmpty {
                    DisclosureGroup(isExpanded: $adjustOpen) {
                        VStack(alignment: .leading, spacing: 10) {
                            FlowLayout(spacing: 8) {
                                ForEach(adjs, id: \.id) { a in
                                    let on = adjectives.contains(a.id)
                                    Toggle(isOn: Binding(get: { on }, set: { v in
                                        if v { adjectives.append(a.id) } else { adjectives.removeAll { $0 == a.id } }
                                    })) { Text(a.id).font(.system(size: 12.5, weight: .medium)) }
                                        .toggleStyle(.button).controlSize(.regular)
                                        .tint(Color.rasan)
                                        .help(a.doc ?? a.id)
                                }
                            }
                            HStack {
                                Button {
                                    if let current { mpbSend(model, step, "adjust", .object(["id": .string(current), "adjust": .array(adjectives.map(JSONValue.string))])) }
                                } label: {
                                    Label(adjectives.isEmpty ? "Pick an adjustment above" : "See it " + adjectives.joined(separator: " and "), systemImage: "slider.horizontal.3")
                                }
                                .disabled(adjectives.isEmpty || current == nil || !model.canAct(on: step))
                            }
                        }
                        .padding(.top, 10)
                    } label: {
                        Text("Adjust the one you picked (optional)").font(.system(size: 13, weight: .medium))
                    }
                }

                PanelActions(model: model, step: step,
                             title: "Use " + (cells.first { $0.id == current }?.name ?? "this motion"), symbol: "checkmark",
                             enabled: current != nil, action: {
                    if let current { mpbSend(model, step, "choose", .string(current), note: $0) }
                }, secondary: {
                    Button { mpbSend(model, step, "more", .object(["exclude": .array(ids.map(JSONValue.string))])) } label: {
                        Label("Show others", systemImage: "arrow.triangle.2.circlepath")
                    }
                })
            }
        }
    }
}

// MARK: - Transitions

/// A small looping A to B sketch of one transition id, so the menu can be read at a glance.
private struct TransitionGlyph: View {
    let id: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion)) { context in
            let p = reduceMotion ? 0.5 : progress(context.date.timeIntervalSinceReferenceDate)
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                let key = id.lowercased()
                let vertical = key.contains("up") || key.contains("down")
                ZStack {
                    if key.contains("cut") && !key.contains("match") && !key.contains("cutout") {
                        scene(a: p < 0.5)
                    } else if key.contains("wipe") || key.contains("reveal") || key.contains("iris") {
                        scene(a: true)
                        scene(a: false).mask(alignment: vertical ? .top : .leading) {
                            Rectangle().frame(width: vertical ? w : w * p, height: vertical ? h * p : h)
                        }
                    } else if key.contains("push") || key.contains("slide") {
                        scene(a: true).offset(x: vertical ? 0 : -w * p, y: vertical ? -h * p : 0)
                        scene(a: false).offset(x: vertical ? 0 : w * (1 - p), y: vertical ? h * (1 - p) : 0)
                    } else if key.contains("zoom") || key.contains("scale") {
                        scene(a: true).scaleEffect(1 + p * 1.6).opacity(1 - p)
                        scene(a: false).scaleEffect(0.55 + 0.45 * p).opacity(p)
                    } else if key.contains("blur") {
                        scene(a: true).blur(radius: p * 10).opacity(1 - p)
                        scene(a: false).blur(radius: (1 - p) * 10).opacity(p)
                    } else {
                        scene(a: true)
                        scene(a: false).opacity(p)
                    }
                }
                .frame(width: w, height: h).clipped()
            }
        }
        .accessibilityHidden(true)
    }

    private func progress(_ t: Double) -> Double {
        let phase = (t / 2.6).truncatingRemainder(dividingBy: 1)
        func ease(_ x: Double) -> Double { x * x * (3 - 2 * x) }
        switch phase {
        case ..<0.15: return 0
        case ..<0.42: return ease((phase - 0.15) / 0.27)
        case ..<0.65: return 1
        case ..<0.92: return 1 - ease((phase - 0.65) / 0.27)
        default: return 0
        }
    }

    private func scene(a: Bool) -> some View {
        let hue = a ? 0.58 : 0.04
        return ZStack {
            LinearGradient(colors: [Color(hue: hue, saturation: 0.5, brightness: 0.9), Color(hue: hue + 0.05, saturation: 0.7, brightness: 0.5)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(a ? "A" : "B").font(.system(size: 26, weight: .bold, design: .rounded)).foregroundStyle(.white.opacity(0.9))
        }
    }
}

struct TransitionsPanel: View {
    let model: FilmSessionModel
    let step: String
    @State private var selection: String?
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    private struct Cell: Identifiable {
        let id: String, letter: String, label: String, energy: String?, duration: Double?, media: String?
    }

    private var cells: [Cell] {
        let d = model.payload(step)
        var raw = d["cells"].array
        if raw.isEmpty { raw = d["menu"].array }   // a menu given as a list instead of an html path
        return raw.enumerated().compactMap { i, c in
            guard let id = mpbText(c["id"]) else { return nil }
            return Cell(id: id, letter: c["letter"].string ?? String(UnicodeScalar(UInt8(65 + min(i, 25)))),
                        label: c["label"].string ?? c["title"].string ?? c["name"].string ?? id,
                        energy: c["energy"].string, duration: c["duration_s"].number,
                        media: mpbFirst(c, ["video", "preview", "gif", "image", "still"]))
        }
    }

    var body: some View {
        let d = model.payload(step)
        let cells = cells
        let ids = cells.map(\.id)
        let fallback = cells.count > 1 ? cells[1].id : cells.first?.id
        let current = selection ?? mpbInitial(d, ids: ids, fallback: fallback)
        let menu = d["menu"].string
        VStack(alignment: .leading, spacing: 20) {
            if cells.isEmpty {
                PanelEmpty(symbol: "rectangle.on.rectangle", title: "The transitions menu appears here",
                           detail: "Two of your scenes handing off through each transition, looping.")
            } else {
                HStack(alignment: .firstTextBaseline) {
                    Text("This becomes the default handoff between scenes. Override single scenes in Scenes.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                    Spacer(minLength: 12)
                    if mpbIsHTML(menu) { OpenInBrowserButton(path: menu, title: "See them with your scenes in the browser") }
                }
                if mpbIsImage(menu) || mpbIsVideo(menu) {
                    Frame16x9(radius: 12) { PreviewMedia(model: model, path: menu) }
                        .frame(maxWidth: 640).shadow(color: .black.opacity(0.12), radius: 10, y: 4)
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 190, maximum: 300), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                    ForEach(cells) { cell in
                        let on = current == cell.id
                        let recommended = d["recommended"].identifier == cell.id
                        PickCard(selected: on, padding: 10,
                                 label: "\(cell.label)\(cell.energy.map { ", \($0) energy" } ?? "")\(recommended ? ", Claude's pick" : "")") {
                            selection = cell.id
                        } content: {
                            VStack(alignment: .leading, spacing: 9) {
                                Frame16x9(radius: 7) {
                                    if let media = cell.media { PreviewMedia(model: model, path: media) } else { TransitionGlyph(id: cell.id) }
                                }
                                .overlay(alignment: .topLeading) {
                                    Text(cell.letter).font(.system(size: 10.5, weight: .bold))
                                        .frame(width: 20, height: 20).background(.ultraThinMaterial, in: Circle()).padding(6)
                                }
                                .overlay(alignment: .topTrailing) {
                                    if recommended {
                                        Image(systemName: "sparkles").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.rasan)
                                            .frame(width: 20, height: 20).background(.ultraThinMaterial, in: Circle()).padding(6)
                                            .accessibilityHidden(true)
                                    }
                                }
                                HStack(alignment: .firstTextBaseline, spacing: 6) {
                                    RadioMark(on: on)
                                    Text(cell.label).font(.system(size: 13.5, weight: .semibold)).lineLimit(2)
                                }
                                HStack(spacing: 6) {
                                    if let energy = cell.energy { Tag(text: energy) }
                                    if let seconds = cell.duration, seconds > 0 { Tag(text: String(format: "%.1f s", seconds)) } else if cell.duration == 0 { Tag(text: "instant") }
                                }
                            }
                        }
                    }
                }
                PanelActions(model: model, step: step,
                             title: "Use " + (cells.first { $0.id == current }?.label ?? "this") + " between scenes",
                             enabled: current != nil) {
                    if let current { mpbSend(model, step, "choose", .string(current), note: $0) }
                }
            }
        }
    }
}

// MARK: - Voice

struct VoicePanel: View {
    let model: FilmSessionModel
    let step: String
    @State private var selection: String?
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    private struct Option: Identifiable {
        let id: String, title: String, mood: String?, source: String?, file: String?, note: String?
    }

    private var options: [Option] {
        model.payload(step)["options"].array.compactMap { o in
            guard let id = mpbText(o["id"]) else { return nil }
            return Option(id: id, title: o["title"].string ?? o["name"].string ?? id, mood: o["mood"].string, source: o["source"].string,
                          file: mpbFirst(o, ["file", "sample", "audio"]), note: o["summary"].string)
        }
    }

    var body: some View {
        let d = model.payload(step)
        let options = options
        let current = selection ?? mpbInitial(d, ids: options.map(\.id))
        VStack(alignment: .leading, spacing: 16) {
            if options.isEmpty {
                PanelEmpty(symbol: "waveform.badge.mic", title: d["unavailable"].string ?? "Voice samples appear here",
                           detail: d["unavailable"].string == nil ? "Your hook line, spoken in a few voices." : "You can still make the film without a voiceover.")
                PanelActions(model: model, step: step, title: "No voiceover", symbol: "speaker.slash") { mpbSend(model, step, "choose", .string("none"), note: $0) }
            } else {
                if let note = d["unavailable"].string { Label(note, systemImage: "info.circle").font(.system(size: 12)).foregroundStyle(.secondary) }
                VStack(spacing: 10) {
                    ForEach(options) { option in
                        let on = current == option.id
                        let recommended = d["recommended"].identifier == option.id
                        let url = model.fileURL(option.file)
                        let audio = PreviewAudio.shared
                        let playing = audio.playingID == option.id
                        PickCard(selected: on, label: "\(option.title)\(option.mood.map { ", \($0)" } ?? "")\(recommended ? ", Claude's pick" : "")") {
                            selection = option.id
                        } content: {
                            HStack(spacing: 14) {
                                RadioMark(on: on)
                                PlayDisc(id: option.id, url: url, title: option.title)
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 8) {
                                        Text(option.title).font(.system(size: 15, weight: .semibold))
                                        if recommended { RecommendedBadge(text: "Claude's pick") }
                                        if url == nil { Tag(text: "No sample", tint: .orange) }
                                    }
                                    Text([option.mood, option.source].compactMap { $0 }.joined(separator: " · "))
                                        .font(.system(size: 12.5)).foregroundStyle(.secondary)
                                    if let note = option.note { Text(note).font(.system(size: 12)).foregroundStyle(.secondary) }
                                }
                                Spacer(minLength: 12)
                                Waveform(seed: option.id, url: url, progress: playing ? audio.progress : 0, height: 30) { f in
                                    audio.seek(id: option.id, to: f)
                                }
                                .frame(width: 190)
                            }
                        }
                    }
                }
                PanelActions(model: model, step: step, title: "Use " + (options.first { $0.id == current }?.title ?? "this voice"),
                             enabled: current != nil, action: {
                    if let current { mpbSend(model, step, "choose", .string(current), note: $0) }
                }, secondary: {
                    Button { mpbSend(model, step, "choose", .string("none")) } label: { Label("No voiceover", systemImage: "speaker.slash") }
                })
            }
        }
    }
}

// MARK: - Music

struct MusicPanel: View {
    let model: FilmSessionModel
    let step: String
    @State private var selection: String?
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    private struct Track: Identifiable {
        let id: String, title: String, mood: String?, duration: Double?, bpm: Double?, summary: String?, ending: String?,
            fit: String?, license: String?, attribution: String?, source: String?, audio: String?, fitted: Bool
    }

    private var tracks: [Track] {
        model.payload(step)["options"].array.compactMap { o in
            guard let id = mpbText(o["id"]) else { return nil }
            let preview = o["preview"].string
            return Track(id: id, title: o["title"].string ?? id, mood: o["mood"].string, duration: o["duration"].number, bpm: o["bpm"].number,
                         summary: o["summary"].string, ending: o["ending"].string, fit: o["fit"].string, license: o["license"].string,
                         attribution: o["attribution"].string, source: o["source"].string,
                         audio: (preview?.isEmpty == false ? preview : nil) ?? o["file"].string, fitted: preview?.isEmpty == false)
        }
    }

    var body: some View {
        let d = model.payload(step)
        let tracks = tracks
        let current = selection ?? mpbInitial(d, ids: tracks.map(\.id))
        VStack(alignment: .leading, spacing: 16) {
            if tracks.isEmpty {
                PanelEmpty(symbol: "music.note.list", title: d["unavailable"].string ?? "Music candidates appear here",
                           detail: "Each one plays right here. Or keep the film silent, or bring your own track.")
            } else {
                if let note = d["unavailable"].string { Label(note, systemImage: "info.circle").font(.system(size: 12)).foregroundStyle(.secondary) }
                VStack(spacing: 12) {
                    ForEach(tracks) { track in
                        let on = current == track.id
                        let recommended = d["recommended"].identifier == track.id
                        let url = model.fileURL(track.audio)
                        let audio = PreviewAudio.shared
                        let playing = audio.playingID == track.id
                        PickCard(selected: on, label: "\(track.title)\(track.mood.map { ", \($0)" } ?? "")\(recommended ? ", Claude's pick" : "")") {
                            selection = track.id
                        } content: {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack(alignment: .top, spacing: 14) {
                                    RadioMark(on: on).padding(.top, 8)
                                    PlayDisc(id: track.id, url: url, title: track.title, size: 42)
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack(spacing: 8) {
                                            Text(track.title).font(.system(size: 16, weight: .semibold))
                                            if recommended { RecommendedBadge(text: "Claude's pick") }
                                        }
                                        Text([track.mood, track.summary].compactMap { $0 }.joined(separator: " · "))
                                            .font(.system(size: 12.5)).foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 10)
                                    VStack(alignment: .trailing, spacing: 5) {
                                        HStack(spacing: 6) {
                                            if let seconds = track.duration { Tag(text: clockText(seconds)) }
                                            if let bpm = track.bpm { Tag(text: "\(Int(bpm)) bpm") }
                                        }
                                        if track.fitted { Tag(text: "Edited to fit", tint: Color.rasan) }
                                    }
                                }
                                Waveform(seed: track.id, url: url, progress: playing ? audio.progress : 0, height: 40) { f in
                                    audio.seek(id: track.id, to: f)
                                }
                                if track.fit != nil || track.ending != nil {
                                    VStack(alignment: .leading, spacing: 3) {
                                        if let fit = track.fit { Label(fit, systemImage: "scope").font(.system(size: 12.5)) }
                                        if let ending = track.ending { Label(ending, systemImage: "flag.checkered").font(.system(size: 12.5)).foregroundStyle(.secondary) }
                                    }
                                }
                                HStack(spacing: 6) {
                                    if let license = track.license, !license.isEmpty { Tag(text: license) }
                                    if let source = track.source, !source.isEmpty { Text(source).font(.system(size: 11.5)).foregroundStyle(.tertiary) }
                                    if let credit = track.attribution, !credit.isEmpty {
                                        Text("Credit: \(credit)").font(.system(size: 11.5)).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            PanelActions(model: model, step: step, title: "Use " + (tracks.first { $0.id == current }?.title ?? "this track"),
                         enabled: current != nil && !tracks.isEmpty, primaryVisible: !tracks.isEmpty, action: {
                if let current { mpbSend(model, step, "choose", .string(current), note: $0) }
            }, secondary: {
                HStack(spacing: 14) {
                    Button { mpbSend(model, step, "choose", .string("none")) } label: { Label("No music", systemImage: "speaker.slash") }
                    Button(action: pickOwnTrack) { Label("Use my track…", systemImage: "folder") }
                }
            })
        }
    }

    private func pickOwnTrack() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.audio]
        panel.allowsMultipleSelection = false
        panel.message = "Choose a track for the film"
        if panel.runModal() == .OK, let url = panel.url {
            mpbSend(model, step, "choose", .object(["file": .string(url.path)]))
        }
    }
}

// MARK: - Storyboard

struct StoryboardPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    private struct SceneRow: Identifiable {
        let id: Int, n: String, title: String, duration: Double, transition: String?, line: String?
    }

    private var rows: [SceneRow] {
        model.payload(step)["timeline"]["scenes"].array.enumerated().map { i, s in
            SceneRow(id: i, n: mpbText(s["n"]) ?? String(i + 1), title: s["title"].string ?? "Scene \(i + 1)",
                     duration: s["duration_s"].number ?? s["duration"].number ?? 1,
                     transition: s["transition_in"].string ?? s["transition"].string,
                     line: s["on_screen"].string ?? s["voiceover"].string)
        }
    }

    var body: some View {
        let d = model.payload(step)
        let rows = rows
        let sheet = d["sheet"].string
        let total = d["timeline"]["total_s"].number ?? rows.reduce(0) { $0 + $1.duration }
        VStack(alignment: .leading, spacing: 20) {
            if !rows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    GeometryReader { geo in
                        let sum = max(0.1, rows.reduce(0) { $0 + $1.duration })
                        let usable = geo.size.width - 3 * CGFloat(rows.count - 1)
                        HStack(spacing: 3) {
                            ForEach(rows) { r in
                                let h = mpbHue(r.title)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.n).font(.system(size: 10.5, weight: .bold).monospacedDigit())
                                    Text(r.title).font(.system(size: 11)).lineLimit(1)
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8).frame(width: max(24, usable * r.duration / sum), height: 50, alignment: .leading)
                                .background(LinearGradient(colors: [Color(hue: h, saturation: 0.5, brightness: 0.75), Color(hue: h, saturation: 0.6, brightness: 0.52)],
                                                           startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                                .help("\(r.title) · \(String(format: "%.1f", r.duration)) s")
                            }
                        }
                    }
                    .frame(height: 50)
                    .accessibilityHidden(true)
                    Text(metaLine(rows.count, total, d["timeline"]))
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
                VStack(spacing: 0) {
                    ForEach(rows) { r in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(r.n).font(.system(size: 12, weight: .semibold).monospacedDigit()).foregroundStyle(.tertiary).frame(width: 22, alignment: .trailing)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.title).font(.system(size: 13.5, weight: .medium))
                                if let line = r.line, !line.isEmpty { Text(line).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2) }
                            }
                            Spacer(minLength: 10)
                            if let t = r.transition, !t.isEmpty { Tag(text: t) }
                            Text(String(format: "%.1f s", r.duration)).font(.system(size: 12).monospacedDigit()).foregroundStyle(.secondary).frame(width: 46, alignment: .trailing)
                        }
                        .padding(.vertical, 9).padding(.horizontal, 12)
                        .accessibilityElement(children: .combine)
                        if r.id != rows.last?.id { Divider().padding(.leading, 46) }
                    }
                }
                .cardSurface()
            }
            if mpbIsImage(sheet) {
                PayloadImage(path: sheet, contentMode: .fit, maxPixels: 2000)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
            } else if sheet != nil {
                HStack(spacing: 10) {
                    Image(systemName: "rectangle.split.3x3").foregroundStyle(.secondary)
                    Text("The storyboard sheet draws every scene's layout in your look.").font(.system(size: 13)).foregroundStyle(.secondary)
                    Spacer()
                    OpenInBrowserButton(path: sheet, title: "Open the sheet in the browser")
                }
                .padding(12).cardSurface()
            } else if rows.isEmpty {
                PanelEmpty(symbol: "rectangle.split.3x3", title: "The storyboard appears here",
                           detail: "Every scene's layout, drawn in your look, once the workflow sketches it.")
            }
            if sheet != nil || !rows.isEmpty {
                PanelActions(model: model, step: step, title: "Approve the storyboard") { mpbSend(model, step, "approve", note: $0) }
            }
        }
    }

    private func metaLine(_ count: Int, _ total: Double, _ t: JSONValue) -> String {
        var parts = ["\(count) scenes", String(format: "%.0f s", total)]
        if let n = t["narrated"].bool { parts.append(n ? "narrated" : "no narration") }
        if let m = t["music"].string, !m.isEmpty { parts.append("music: \(m)") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Keyframes

struct KeyframesPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    var body: some View {
        let d = model.payload(step)
        let board = d["board"].string
        let issues = mpbTexts(d["issues"])
        VStack(alignment: .leading, spacing: 18) {
            if board == nil {
                PanelEmpty(symbol: "figure.pose", title: "Look at the key poses first?",
                           detail: "Claude can draw each scene's key pose for you to check before the build, or go straight to building.")
                PanelActions(model: model, step: step, title: "Show me the key poses first", symbol: "figure.pose", action: {
                    mpbSend(model, step, "choose", .string("poses"), note: $0)
                }, secondary: {
                    Button { mpbSend(model, step, "choose", .string("skip")) } label: { Label("Go straight to the build", systemImage: "forward.end") }
                })
            } else {
                if !issues.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("\(issues.count) \(issues.count == 1 ? "problem" : "problems") against the motion contract", systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(nsColor: .systemOrange))
                        ForEach(Array(issues.enumerated()), id: \.offset) { _, issue in
                            Text(issue).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                                .padding(.leading, 22)
                        }
                        Text("Tell Claude what to change and it will redraw the poses.").font(.system(size: 12)).foregroundStyle(.secondary).padding(.leading, 22)
                    }
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(nsColor: .systemOrange).opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityElement(children: .combine)
                }
                if mpbIsImage(board) {
                    PayloadImage(path: board, contentMode: .fit, maxPixels: 2400)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .shadow(color: .black.opacity(0.14), radius: 12, y: 5)
                        .onTapGesture(count: 2) { if let url = model.fileURL(board) { SafeOpen.open(url) } }
                        .accessibilityLabel("Key poses board")
                        .accessibilityHint("Double-click to open in Preview")
                } else {
                    HStack(spacing: 10) {
                        Image(systemName: "square.grid.3x3").foregroundStyle(.secondary)
                        Text("The key poses board is a web page.").font(.system(size: 13)).foregroundStyle(.secondary)
                        Spacer()
                        OpenInBrowserButton(path: board, title: "Open the board in the browser")
                    }
                    .padding(12).cardSurface()
                }
                PanelActions(model: model, step: step, title: "Approve these poses", enabled: issues.isEmpty, action: {
                    mpbSend(model, step, "approve", note: $0)
                }, secondary: {
                    Button { mpbSend(model, step, "choose", .string("skip")) } label: { Label("Skip keyframes", systemImage: "forward.end") }
                })
            }
        }
    }
}

// MARK: - Plan

struct PlanPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    var body: some View {
        let d = model.payload(step)
        let shape = d["shape"]
        let stated = mpbTexts(d["stated"])
        let agent = mpbTexts(d["agent"])
        let shapeItems: [(String, String)] = {
            if case .object(let dict) = shape {
                return dict.keys.sorted().compactMap { k in mpbText(dict[k] ?? .null).map { (k.replacingOccurrences(of: "_", with: " "), $0) } }
            }
            return []
        }()
        VStack(alignment: .leading, spacing: 20) {
            if !shapeItems.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150, maximum: 260), spacing: 12, alignment: .top)], alignment: .leading, spacing: 12) {
                    ForEach(shapeItems, id: \.0) { item in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.0.capitalized).font(.system(size: 11, weight: .semibold)).tracking(0.4).foregroundStyle(.secondary)
                            Text(item.1).font(.system(size: 16, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                        }
                        .stageCard(padding: 12)
                        .accessibilityElement(children: .combine)
                    }
                }
            } else if let sentence = shape.string, !sentence.isEmpty {
                Label(sentence, systemImage: "square.stack.3d.up").font(.system(size: 15, weight: .medium))
                    .stageCard(padding: 14)
            }
            if stated.isEmpty && agent.isEmpty {
                PanelEmpty(symbol: "list.clipboard", title: "The full plan appears here",
                           detail: "What you chose and what the agent decided, with the reasons, before anything is built.")
            } else {
                HStack(alignment: .top, spacing: 18) {
                    PlanColumn(title: "You chose", symbol: "person.fill", items: stated, tint: Color.rasan)
                    PlanColumn(title: "Claude decided", symbol: "sparkles", items: agent, tint: Color(nsColor: .systemIndigo))
                }
                PanelActions(model: model, step: step, title: "Looks right. Build it", symbol: "hammer") { mpbSend(model, step, "approve", note: $0) }
            }
        }
    }
}

private struct PlanColumn: View {
    let title: String
    let symbol: String
    let items: [String]
    let tint: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: symbol).font(.system(size: 13, weight: .semibold)).foregroundStyle(tint)
            if items.isEmpty {
                Text("Nothing here yet.").font(.system(size: 13)).foregroundStyle(.tertiary)
            } else {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 9) {
                        Circle().fill(tint.opacity(0.7)).frame(width: 5, height: 5).offset(y: -2)
                        Text(item).font(.system(size: 13.5)).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .stageCard(padding: 16)
        .frame(maxHeight: .infinity, alignment: .top)
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Direction (legacy)

struct DirectionPanel: View {
    let model: FilmSessionModel
    let step: String
    @State private var selection: String?
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    private struct Suggestion: Identifiable {
        let id: String, title: String, why: String?, image: String?, terms: [String]
    }

    private var suggestions: [Suggestion] {
        let d = model.payload(step)
        let raw = d["suggestions"].array.isEmpty ? d["options"].array : d["suggestions"].array
        return raw.prefix(3).compactMap { s in
            if let plain = s.string { return Suggestion(id: plain, title: plain, why: nil, image: nil, terms: []) }
            guard let id = mpbText(s["id"]) ?? mpbText(s["name"]) else { return nil }
            return Suggestion(id: id, title: s["title"].string ?? s["name"].string ?? id,
                              why: s["why"].string ?? s["description"].string ?? s["blend"].string,
                              image: mpbFirst(s, ["image", "poster", "specimen", "preview"]),
                              terms: mpbTexts(s["terms"]))
        }
    }

    var body: some View {
        let d = model.payload(step)
        let items = suggestions
        let current = selection ?? mpbInitial(d, ids: items.map(\.id))
        VStack(alignment: .leading, spacing: 16) {
            if items.isEmpty {
                PanelEmpty(symbol: "paintpalette", title: "Design directions appear here",
                           detail: "Complete looks, with palette, type, shape and texture, shown on your own words.")
            } else {
                VStack(spacing: 10) {
                    ForEach(items) { item in
                        let on = current == item.id
                        let recommended = d["recommended"].identifier == item.id
                        PickCard(selected: on, label: "\(item.title)\(item.why.map { ". \($0)" } ?? "")\(recommended ? ". Claude's pick" : "")") {
                            selection = item.id
                        } content: {
                            HStack(alignment: .center, spacing: 14) {
                                RadioMark(on: on)
                                Frame16x9(radius: 7) {
                                    if let image = item.image { PayloadImage(path: image, contentMode: .fill) } else { PlaceholderArt(seed: item.id) }
                                }
                                .frame(width: 120)
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 8) {
                                        Text(item.title).font(.system(size: 15, weight: .semibold))
                                        if recommended { RecommendedBadge(text: "Claude's pick") }
                                    }
                                    if let why = item.why { Text(why).font(.system(size: 12.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                                    if !item.terms.isEmpty {
                                        FlowLayout(spacing: 5) { ForEach(item.terms, id: \.self) { Tag(text: $0) } }
                                    }
                                }
                            }
                        }
                    }
                }
                PanelActions(model: model, step: step, title: "Use " + (items.first { $0.id == current }?.title ?? "this direction"),
                             enabled: current != nil) {
                    if let current { mpbSend(model, step, "choose", .string(current), note: $0) }
                }
            }
        }
    }
}

// MARK: - Generic

/// Any step the app has no screen for: the common fields, `options` when present, and every picture in the payload.
struct GenericPanel: View {
    let model: FilmSessionModel
    let step: String
    @State private var selection: String?
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    private static let hidden: Set<String> = ["status", "question", "context", "decision", "by", "sent", "recommended", "options", "thread", "ts",
                                              "note", "notes", "images", "image", "board", "sheet"]

    private struct Option: Identifiable { let id: String, label: String, why: String?, image: String? }

    private var options: [Option] {
        model.payload(step)["options"].array.compactMap { o in
            if let plain = o.string { return Option(id: plain, label: plain, why: nil, image: nil) }
            guard let id = mpbText(o["id"]) ?? mpbText(o["label"]) else { return nil }
            return Option(id: id, label: o["label"].string ?? o["title"].string ?? o["name"].string ?? id,
                          why: o["why"].string ?? o["description"].string ?? o["summary"].string, image: mpbFirst(o, ["image", "poster", "preview"]))
        }
    }

    private func images(in value: JSONValue, depth: Int = 0, into out: inout [String]) {
        guard depth < 5, out.count < 12 else { return }
        switch value {
        case .string(let s): if mpbIsImage(s), !out.contains(s) { out.append(s) }
        case .array(let items): for item in items { images(in: item, depth: depth + 1, into: &out) }
        case .object(let dict): for key in dict.keys.sorted() where key != "thread" { images(in: dict[key] ?? .null, depth: depth + 1, into: &out) }
        default: break
        }
    }

    var body: some View {
        let d = model.payload(step)
        let options = options
        let current = selection ?? mpbInitial(d, ids: options.map(\.id))
        var pictures: [String] = []
        let _ = images(in: d, into: &pictures)
        let facts: [(String, String)] = d.object.keys.sorted().compactMap { key in
            guard !Self.hidden.contains(key), let value = d[key].string ?? d[key].number.map({ String($0) }) ?? d[key].bool.map({ $0 ? "Yes" : "No" }),
                  !value.isEmpty, !mpbIsImage(value) else { return nil }
            return (key.replacingOccurrences(of: "_", with: " ").capitalized, value)
        }
        let pages = ["board", "sheet"].compactMap { d[$0].string }.filter(mpbIsHTML)
        VStack(alignment: .leading, spacing: 18) {
            if !facts.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(facts.enumerated()), id: \.offset) { i, f in
                        HStack(alignment: .firstTextBaseline, spacing: 14) {
                            Text(f.0).font(.system(size: 12.5, weight: .medium)).foregroundStyle(.secondary).frame(width: 140, alignment: .leading)
                            Text(f.1).font(.system(size: 13)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 8).padding(.horizontal, 14)
                        .accessibilityElement(children: .combine)
                        if i < facts.count - 1 { Divider().padding(.leading, 14) }
                    }
                }
                .cardSurface()
            }
            if !pictures.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 220, maximum: 420), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                    ForEach(pictures, id: \.self) { path in
                        Frame16x9(radius: 9) { PayloadImage(path: path, contentMode: .fill, maxPixels: 1200) }
                            .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
                    }
                }
            }
            ForEach(pages, id: \.self) { page in OpenInBrowserButton(path: page, title: "Open \(URL(fileURLWithPath: page).lastPathComponent) in the browser") }
            if !options.isEmpty {
                VStack(spacing: 10) {
                    ForEach(options) { option in
                        let on = current == option.id
                        let recommended = d["recommended"].identifier == option.id
                        PickCard(selected: on, label: "\(option.label)\(option.why.map { ". \($0)" } ?? "")\(recommended ? ". Claude's pick" : "")") {
                            selection = option.id
                        } content: {
                            HStack(alignment: .center, spacing: 12) {
                                RadioMark(on: on)
                                if let image = option.image { Frame16x9(radius: 6) { PayloadImage(path: image, contentMode: .fill) }.frame(width: 96) }
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 8) {
                                        Text(option.label).font(.system(size: 14.5, weight: .semibold))
                                        if recommended { RecommendedBadge(text: "Claude's pick") }
                                    }
                                    if let why = option.why { Text(why).font(.system(size: 12.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                                }
                            }
                        }
                    }
                }
                PanelActions(model: model, step: step, title: "Use " + (options.first { $0.id == current }?.label ?? "this"),
                             enabled: current != nil) {
                    if let current { mpbSend(model, step, "choose", .string(current), note: $0) }
                }
            } else if facts.isEmpty && pictures.isEmpty && pages.isEmpty {
                PanelEmpty(symbol: "ellipsis.rectangle", title: "Nothing to show for this step yet",
                           detail: "Claude is working on it. You can leave a note below.")
            }
        }
    }
}
