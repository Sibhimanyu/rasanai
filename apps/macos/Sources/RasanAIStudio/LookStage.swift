import AppKit
import AVFoundation
import StudioCore
import SwiftUI

/// Call 03, three looks (`look` with design systems, and the older `films` / `direction` with films).
/// The chosen system is the hero (its poster, or a muted looping preview video, or a recipe card drawn natively);
/// three tiles below switch it. Nothing here is a web view.
struct LookStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var selection: String?
    @State private var energy = "as is"
    @State private var showMix = false
    @State private var mixLook = ""
    @State private var mixStory = ""
    @FocusState private var keysFocused: Bool

    private var payload: JSONValue { model.payload(step) }
    private var items: [LookItem] { LookItem.parse(payload) }
    private var isFilms: Bool { !payload["films"].array.isEmpty && payload["styles"].array.isEmpty }
    private var recommendedID: String? { payload["recommended"].identifier }
    private var current: LookItem? {
        items.first { $0.id == selection } ?? items.first { $0.id == recommendedID } ?? items.first
    }
    private var aspect: CGFloat { LookItem.aspect(model.payload("brief")["fields"]["aspect"].string) }
    private var canAct: Bool { model.canAct(on: step) }

    var body: some View {
        StageScaffold(model: model, step: step,
                      question: payload["question"].string ?? (isFilms ? "Which film do you want?" : "Which look fits this story?"),
                      context: payload["context"].string ?? payload["sub"].string,
                      recommended: items.first { $0.id == recommendedID }?.name,
                      maxWidth: 1000) {
            if let current {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(alignment: .top, spacing: 26) {
                        LookHero(item: current, aspect: aspect, hook: payload["hook"].string ?? current.hook)
                        VStack(alignment: .leading, spacing: 18) {
                            LookCaption(item: current, isRecommended: current.id == recommendedID)
                            if isFilms && !current.frames.isEmpty { LookFrames(item: current, aspect: aspect) }
                            Spacer(minLength: 0)
                            controls(current)
                        }
                        .frame(width: 280)
                    }
                    LookTiles(items: items, selectedID: current.id, recommendedID: recommendedID, aspect: aspect,
                              hook: payload["hook"].string) { selection = $0 }
                }
                .animation(.smooth(duration: 0.3), value: current.id)
                .focusable()
                .focusEffectDisabled()
                .focused($keysFocused)
                .onKeyPress(characters: CharacterSet(charactersIn: "123"), phases: .down) { press in
                    guard canAct, let n = Int(press.characters), n >= 1, n <= items.count else { return .ignored }
                    selection = items[n - 1].id
                    return .handled
                }
                .onAppear { keysFocused = true }
            } else {
                Text("Claude is still drawing the looks.").foregroundStyle(.secondary)
            }
        } actions: {
            CallActions(model: model, step: step, primaryTitle: isFilms ? "Use this film" : "Use this look",
                        primarySymbol: "checkmark", primaryEnabled: current != nil) { note in
                guard let current else { return }
                Task { await model.send(step: step, type: "choose", value: .string(current.id), note: note) }
            }
        }
        .onChange(of: items.map(\.id)) { _, ids in
            if let selection, !ids.contains(selection) { self.selection = nil }
        }
    }

    // MARK: Controls

    private func controls(_ current: LookItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Energy").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                Picker("Energy", selection: $energy) {
                    Text("Calmer").tag("calmer"); Text("As is").tag("as is"); Text("Punchier").tag("punchier")
                }
                .pickerStyle(.segmented).labelsHidden()
                .disabled(!canAct)
                .help("Shift this look's motion language. The designers redraw it.")
                .accessibilityLabel("Energy")
                .onChange(of: energy) { _, value in
                    Task { await model.send(step: step, type: "knob",
                                            value: .object(["name": .string("energy"), "value": .string(value), "film": .string(current.id)])) }
                }
            }
            if isFilms && items.count > 1 {
                Button { mixLook = current.id; mixStory = items.first { $0.id != current.id }?.id ?? current.id; showMix = true } label: {
                    Label("Mix two", systemImage: "arrow.triangle.merge")
                }
                .disabled(!canAct)
                .popover(isPresented: $showMix, arrowEdge: .top) { mixPopover }
            }
            Button {
                let ids = items.map(\.id)
                Task { await model.send(step: step, type: "more",
                                        value: .object(["near": .string(current.id), "exclude": .array(ids.map { .string($0) })])) }
            } label: {
                Label(isFilms ? "More like this" : "New blends near this one", systemImage: "sparkles")
            }
            .disabled(!canAct)
            .help("Ask the design desk for new blends close to \(current.name).")
        }
        .controlSize(.regular)
    }

    private var mixPopover: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Mix two").font(.headline)
            Text("The style of one film with the story of another.").font(.system(size: 12)).foregroundStyle(.secondary)
            Picker("Look from", selection: $mixLook) { ForEach(items) { Text("\($0.label) · \($0.name)").tag($0.id) } }
            Picker("Story from", selection: $mixStory) { ForEach(items) { Text("\($0.label) · \($0.name)").tag($0.id) } }
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { showMix = false }
                Button("Mix") {
                    showMix = false
                    Task { await model.send(step: step, type: "mix", value: .object(["look": .string(mixLook), "story": .string(mixStory)])) }
                }
                .buttonStyle(.borderedProminent).disabled(mixLook == mixStory)
            }
        }
        .padding(18).frame(width: 320)
    }
}

// MARK: - Items

struct LookItem: Identifiable, Equatable {
    var id: String
    var label: String
    var name: String
    var blend: String
    var why: String
    var hook: String?
    var poster: String?
    var video: String?
    var specimen: String?
    var frames: [String] = []
    var beats: [String] = []
    var music: String?
    var references: [String] = []
    var recipe: Recipe?

    struct Recipe: Equatable {
        var canvas: Color, surface: Color, ink: Color, accent: Color
        var display: String, body: String, typeClass: String?
        var swatches: [Color]
    }

    static func parse(_ payload: JSONValue) -> [LookItem] {
        let styles = payload["styles"].array
        if !styles.isEmpty {
            return styles.prefix(3).enumerated().map { index, s in
                let style = s["style"]
                return LookItem(id: s["id"].identifier ?? "\(index)", label: s["label"].string ?? ["Sure", "Bold", "Wild"][min(index, 2)],
                                name: s["name"].string ?? style["name"].string ?? "Look \(index + 1)",
                                blend: s["blend"].string ?? "", why: s["why"].string ?? "", hook: s["hook"].string,
                                poster: s["poster"].string, video: video(s), specimen: s["specimen"].string,
                                references: s["references"].strings, recipe: recipe(style["recipe"]))
            }
        }
        return payload["films"].array.prefix(3).enumerated().map { index, f in
            LookItem(id: f["id"].identifier ?? "\(index)", label: f["angle"].string ?? ["Sure", "Bold", "Wild"][min(index, 2)],
                     name: f["title"].string ?? "Film \(index + 1)", blend: f["logline"].string ?? "", why: f["why"].string ?? "",
                     hook: f["hook"].string, poster: f["poster"].string ?? f["frames"].strings.first, video: video(f),
                     frames: f["frames"].strings, beats: f["beats"].strings, music: f["music"].string,
                     recipe: recipe(f["style"]["recipe"].isNull ? f["style"] : f["style"]["recipe"]))
        }
    }

    private static func video(_ v: JSONValue) -> String? {
        for key in ["video", "preview", "preview_video", "mp4"] { if let s = v[key].string, !s.isEmpty { return s } }
        return nil
    }

    private static func recipe(_ r: JSONValue) -> Recipe? {
        let p = r["palette"]
        guard let canvas = Color(hexString: p["canvas"].string) else { return nil }
        let ink = Color(hexString: p["ink"].string) ?? .primary
        let accent = Color(hexString: p["accent"].string) ?? .accentColor
        let surface = Color(hexString: p["surface"].string) ?? canvas
        let extras = p.object.keys.sorted().compactMap { Color(hexString: p[$0].string) }
        let type = r["type"]
        return Recipe(canvas: canvas, surface: surface, ink: ink, accent: accent,
                      display: type["display"]["family"].string ?? type["display"].string ?? "",
                      body: type["body"]["family"].string ?? type["body"].string ?? "", typeClass: type["class"].string,
                      swatches: Array(([canvas, surface, ink, accent] + extras).prefix(6)))
    }

    static func aspect(_ text: String?) -> CGFloat {
        guard let text else { return 16.0 / 9 }
        let parts = text.split(whereSeparator: { ":/x".contains($0) }).compactMap { Double($0) }
        guard parts.count == 2, parts[0] > 0, parts[1] > 0 else { return 16.0 / 9 }
        return CGFloat(max(0.5, min(2.4, parts[0] / parts[1])))
    }
}

private extension Color {
    init?(hexString: String?) {
        guard var s = hexString?.trimmingCharacters(in: .whitespaces), s.hasPrefix("#") else { return nil }
        s.removeFirst()
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(.sRGB, red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
    }
}

// MARK: - Media

/// The look as a picture: video if there is one on disk, else the poster, else a card drawn from the recipe.
private struct LookMedia: View {
    let item: LookItem
    var hook: String?
    var playVideo = true
    var compact = false
    @Environment(FilmSessionModel.self) private var model: FilmSessionModel?

    var body: some View {
        let posterURL = model?.fileURL(item.poster)
        let videoURL = playVideo ? model?.fileURL(item.video) : nil
        ZStack {
            if let posterURL, FileManager.default.fileExists(atPath: posterURL.path) {
                PayloadImage(path: item.poster, contentMode: .fill, maxPixels: compact ? 640 : 1800)
            } else {
                LookFallbackCard(item: item, hook: hook ?? item.hook, compact: compact)
            }
            if let videoURL, FileManager.default.fileExists(atPath: videoURL.path) {
                LookLoopingVideo(url: videoURL).transition(.opacity)
            }
        }
    }
}

private final class LookPlayerView: NSView {
    private var queue: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private let layerHost = AVPlayerLayer()
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layerHost.videoGravity = .resizeAspectFill
        layer?.addSublayer(layerHost)
    }
    required init?(coder: NSCoder) { fatalError() }
    override func layout() { super.layout(); layerHost.frame = bounds }
    private var pending: URL?
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil { stop() } else if let pending, queue == nil { load(pending) }
    }
    func load(_ url: URL) {
        pending = url
        stop()
        guard window != nil else { return }
        let player = AVQueuePlayer()
        player.isMuted = true
        looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
        layerHost.player = player
        queue = player
        player.play()
    }
    func stop() { queue?.pause(); looper?.disableLooping(); looper = nil; layerHost.player = nil; queue = nil }
}

private struct LookLoopingVideo: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> LookPlayerView { let v = LookPlayerView(); v.load(url); return v }
    func updateNSView(_ view: LookPlayerView, context: Context) {
        if context.coordinator.url != url { context.coordinator.url = url; view.load(url) }
    }
    static func dismantleNSView(_ view: LookPlayerView, coordinator: Coordinator) { view.stop() }
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    final class Coordinator { var url: URL; init(url: URL) { self.url = url } }
}

/// A recipe drawn natively: its canvas, the hook line in its display face, swatches and its type names.
private struct LookFallbackCard: View {
    let item: LookItem
    var hook: String?
    var compact = false

    var body: some View {
        let r = item.recipe
        let canvas = r?.canvas ?? Color(hue: hue, saturation: 0.35, brightness: 0.22)
        let ink = r?.ink ?? .white
        let accent = r?.accent ?? Color(hue: hue, saturation: 0.7, brightness: 0.95)
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .topLeading) {
                canvas
                Circle().fill(RadialGradient(colors: [accent.opacity(0.35), .clear], center: .center, startRadius: 0, endRadius: w * 0.45))
                    .frame(width: w * 0.9).offset(x: w * 0.45, y: -w * 0.2)
                VStack(alignment: .leading, spacing: w * 0.02) {
                    Spacer(minLength: 0)
                    Rectangle().fill(accent).frame(width: w * 0.07, height: max(2, w * 0.006))
                    Text(hook ?? item.name)
                        .font(display(size: w * (compact ? 0.11 : 0.085)))
                        .foregroundStyle(ink).lineLimit(3).minimumScaleFactor(0.5)
                        .fixedSize(horizontal: false, vertical: true)
                    if !compact {
                        HStack(spacing: w * 0.012) {
                            ForEach(Array((r?.swatches ?? []).enumerated()), id: \.offset) { _, c in
                                RoundedRectangle(cornerRadius: w * 0.006, style: .continuous).fill(c)
                                    .frame(width: w * 0.03, height: w * 0.03)
                                    .overlay { RoundedRectangle(cornerRadius: w * 0.006, style: .continuous).strokeBorder(ink.opacity(0.2), lineWidth: 0.5) }
                            }
                            Spacer()
                            if let r, !r.display.isEmpty {
                                Text([r.display, r.body].filter { !$0.isEmpty }.joined(separator: " / ") + (r.typeClass.map { " · \($0)" } ?? ""))
                                    .font(.system(size: w * 0.014, design: .monospaced)).foregroundStyle(ink.opacity(0.6))
                            }
                        }
                    }
                }
                .padding(w * (compact ? 0.08 : 0.055))
            }
        }
    }
    private var hue: Double { Double(abs(item.id.hashValue % 360)) / 360 }
    private func display(size: CGFloat) -> Font {
        if let family = item.recipe?.display, !family.isEmpty, NSFontManager.shared.availableFontFamilies.contains(family) {
            return .custom(family, size: size)
        }
        return .system(size: size, weight: .bold, design: .serif)
    }
}

// MARK: - Hero, caption, frames, tiles

private struct LookHero: View {
    let item: LookItem
    let aspect: CGFloat
    var hook: String?

    var body: some View {
        LookMedia(item: item, hook: hook)
            .aspectRatio(aspect, contentMode: .fit)
            .frame(maxHeight: 340)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.primary.opacity(0.1), lineWidth: 0.5) }
            .shadow(color: .black.opacity(0.28), radius: 28, y: 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .id(item.id)
            .transition(.opacity.combined(with: .scale(scale: 0.99)))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(item.label) look, \(item.name). \(item.blend)")
            .accessibilityAddTraits(.isImage)
    }
}

private struct LookCaption: View {
    let item: LookItem
    var isRecommended: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(item.label.uppercased()).font(.system(size: 11, weight: .bold)).tracking(1.2).foregroundStyle(.secondary)
                if isRecommended { RecommendedBadge(text: "Claude's pick") }
            }
            Text(item.name).font(.system(size: 26, weight: .semibold)).tracking(-0.4).fixedSize(horizontal: false, vertical: true)
            if !item.blend.isEmpty { Text(item.blend).font(.system(size: 14, weight: .medium)).foregroundStyle(.primary.opacity(0.85)) }
            if !item.why.isEmpty { Text(item.why).font(.system(size: 14)).foregroundStyle(.secondary).lineSpacing(2).fixedSize(horizontal: false, vertical: true) }
            if item.specimen != nil { OpenInBrowserButton(path: item.specimen, title: "Open specimen").padding(.top, 2) }
            if let music = item.music { Label(music, systemImage: "music.note").font(.system(size: 12)).foregroundStyle(.secondary).padding(.top, 2) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .id(item.id)
        .transition(.opacity)
        .accessibilityElement(children: .combine)
    }
}

private struct LookFrames: View {
    let item: LookItem
    let aspect: CGFloat
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(Array(item.frames.prefix(3).enumerated()), id: \.offset) { index, frame in
                VStack(alignment: .leading, spacing: 6) {
                    PayloadImage(path: frame, contentMode: .fill, maxPixels: 700)
                        .aspectRatio(aspect, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(.primary.opacity(0.1), lineWidth: 0.5) }
                    if index < item.beats.count {
                        Text(item.beats[index]).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .id(item.id)
    }
}

private struct LookTiles: View {
    let items: [LookItem]
    let selectedID: String
    let recommendedID: String?
    let aspect: CGFloat
    var hook: String?
    let pick: (String) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                LookTile(item: item, index: index, selected: item.id == selectedID, recommended: item.id == recommendedID,
                         aspect: min(aspect, 1.8), hook: hook) { pick(item.id) }
            }
        }
    }
}

private struct LookTile: View {
    let item: LookItem
    let index: Int
    let selected: Bool
    let recommended: Bool
    let aspect: CGFloat
    var hook: String?
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                LookMedia(item: item, hook: hook, playVideo: false, compact: true)
                    .frame(maxWidth: .infinity).frame(height: 112)
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .strokeBorder(selected ? Color.rasan : .primary.opacity(0.1), lineWidth: selected ? 2.5 : 0.5)
                    }
                    .shadow(color: .black.opacity(hovering ? 0.28 : 0.12), radius: hovering ? 14 : 5, y: hovering ? 8 : 2)
                HStack(spacing: 6) {
                    Text("\(index + 1)").font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                        .frame(width: 16, height: 16).background(.quaternary, in: RoundedRectangle(cornerRadius: 4))
                    Text(item.name).font(.system(size: 13, weight: selected ? .semibold : .medium)).lineLimit(1)
                    if recommended { Image(systemName: "sparkles").font(.system(size: 10)).foregroundStyle(Color.rasan) }
                    Spacer(minLength: 0)
                    Text(item.label).font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
            .opacity(selected || hovering ? 1 : 0.82)
            .offset(y: hovering && !selected ? -3 : 0)
            .animation(.smooth(duration: 0.2), value: hovering)
            .animation(.smooth(duration: 0.2), value: selected)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .onHover { hovering = $0 }
        .frame(maxWidth: .infinity)
        .accessibilityLabel("\(item.label), \(item.name)\(recommended ? ", Claude's pick" : "")")
        .accessibilityHint("Shows this look large. Shortcut \(index + 1).")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}
