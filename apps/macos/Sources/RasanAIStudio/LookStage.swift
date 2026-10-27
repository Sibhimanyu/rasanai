import AppKit
import AVFoundation
import StudioCore
import SwiftUI

/// Call 03, three looks (`look` with design systems, and the older `films` / `direction` with films).
/// The chosen system is the hero (its poster, or a muted looping preview video, or a recipe card drawn natively);
/// three tiles below switch it, and a rail names its colours and type. Nothing here is a web view.
struct LookStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var selection: String?
    @Environment(\.agentName) private var agent
    @State private var showMix = false
    @State private var showRefine = false
    @State private var showMotion = false
    @State private var soundDraft: SoundDirection?
    @State private var mixLook = ""
    @State private var mixStory = ""
    @FocusState private var keysFocused: Bool
    /// Motion Studio: the reference summary and the kit catalog, each shown only when its file exists.
    @State private var motionStore = MotionStudioStore.empty
    @State private var showMotionLibrary = false

    private var payload: JSONValue { model.payload(step) }
    private var items: [LookItem] { LookItem.parse(payload) }
    private var isFilms: Bool { !payload["films"].array.isEmpty && payload["styles"].array.isEmpty }
    private var recommendedID: String? { payload["recommended"].identifier }
    private var current: LookItem? {
        items.first { $0.id == selection } ?? items.first { $0.id == recommendedID } ?? items.first
    }
    private var aspect: CGFloat { LookItem.aspect(model.payload("brief")["fields"]["aspect"].string) }
    private var canAct: Bool { model.canAct(on: step) }

    /// Windows at least this wide put the crew header, tiles and inspector on the left and the preview on the right.
    private static let wideThreshold: CGFloat = 1000
    private var question: String { payload["question"].string ?? (isFilms ? "Which film do you want?" : "Find the right feeling.") }
    private var context: String? { payload["context"].string ?? payload["sub"].string }

    var body: some View {
        GeometryReader { outer in
            let wide = outer.size.width >= Self.wideThreshold && outer.size.height >= 500 && current != nil
            stage(wide: wide)
        }
    }

    private func stage(wide: Bool) -> some View {
        ReviewStageWorkspace(model: model, step: step, question: question, context: context, showsHeader: !wide) {
            if let current {
                reviewWorkspace(current)
            } else {
                Text("\(agent) is still drawing the looks.").foregroundStyle(.secondary)
            }
        } actions: {
            CallActions(model: model, step: step, primaryTitle: isFilms ? "Use this film" : "Use this look",
                        primarySymbol: "checkmark", primaryEnabled: current != nil) { note in
                guard let current else { return }
                Task { await model.send(step: step, type: "choose", value: .string(current.id), note: note) }
            }
        }
        .onChange(of: payload["sound"]) { _, _ in soundDraft = nil }
        .onChange(of: items.map(\.id)) { _, ids in
            if let selection, !ids.contains(selection) { self.selection = nil }
        }
    }

    /// The compact choices stay in view above the chosen look.  The inspector owns its
    /// own scroll area so a long recipe cannot push the decision surface or footer away.
    @ViewBuilder private func reviewWorkspace(_ current: LookItem) -> some View {
        GeometryReader { proxy in
            let tinyWindow = proxy.size.width < 820 || proxy.size.height < 500
            if tinyWindow {
                // A real scroll view remains usable with large type, Split View, and very small windows.
                ScrollView {
                    fallbackWorkspace(current)
                }
            } else if proxy.size.width >= Self.wideThreshold {
                wideWorkspace(current, available: proxy.size)
            } else {
                boundedWorkspace(current, available: proxy.size)
            }
        }
        .focusable()
        .focusEffectDisabled()
        .focused($keysFocused)
        .onKeyPress(characters: CharacterSet(charactersIn: "123"), phases: .down) { press in
            guard canAct, let n = Int(press.characters), n >= 1, n <= items.count else { return .ignored }
            selection = items[n - 1].id
            return .handled
        }
        // Keys only when nothing is being typed: a step arriving while the person writes must not steal them.
        .onAppear { if !(NSApp.keyWindow?.firstResponder is NSTextView) { keysFocused = true } }
    }

    /// Wide windows: the crew header, compact tiles and the selected look's inspector share the left column;
    /// the preview runs from the top of the page on the right.  Everything stays inside the safe area, above the bottom bar.
    private func wideWorkspace(_ current: LookItem, available: CGSize) -> some View {
        let left = Workspace.leftColumn(for: available.width)
        return HStack(alignment: .top, spacing: Workspace.columnGap) {
            VStack(alignment: .leading, spacing: 0) {
                StageHeader(question: question, context: context, step: step)
                    .padding(.bottom, 12)
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        rail(current)
                        if isFilms && !current.frames.isEmpty { LookFrames(item: current, aspect: aspect) }
                    }
                    .padding(.bottom, 4)
                }
                // The panel holds still; only the details scroll inside it.
                .workspacePanel()
                .accessibilityLabel("Selected look details")
            }
            .frame(width: left, alignment: .leading)
            .frame(maxHeight: .infinity, alignment: .top)

            // The options sit above the preview, so the selected look's details get the whole left column.
            VStack(alignment: .leading, spacing: 16) {
                LookTiles(items: items, selectedID: current.id, recommendedID: recommendedID, aspect: aspect,
                          hook: payload["hook"].string, compact: true) { selection = $0 }
                LookHero(item: current, aspect: aspect, hook: payload["hook"].string ?? current.hook, maxHeight: .infinity)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .frame(width: available.width, height: available.height, alignment: .topLeading)
    }

    private func boundedWorkspace(_ current: LookItem, available: CGSize) -> some View {
        let inspectorWidth = min(320, max(250, available.width * 0.27))
        let heroHeight = min(560, max(250, available.height - 170))

        return HStack(alignment: .top, spacing: Workspace.columnGap) {
            VStack(alignment: .leading, spacing: 16) {
                LookTiles(items: items, selectedID: current.id, recommendedID: recommendedID, aspect: aspect,
                          hook: payload["hook"].string) { selection = $0 }
                    .frame(maxHeight: 142, alignment: .top)
                LookHero(item: current, aspect: aspect, hook: payload["hook"].string ?? current.hook)
                    .frame(maxHeight: heroHeight, alignment: .top)
                if isFilms && !current.frames.isEmpty {
                    LookFrames(item: current, aspect: aspect)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            ScrollView {
                rail(current)
            }
            .workspacePanel()
            .frame(width: inspectorWidth, height: available.height, alignment: .top)
            .accessibilityLabel("Selected look details")
        }
        .frame(width: available.width, height: available.height, alignment: .topLeading)
    }

    private func fallbackWorkspace(_ current: LookItem) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            LookTiles(items: items, selectedID: current.id, recommendedID: recommendedID, aspect: aspect,
                      hook: payload["hook"].string) { selection = $0 }
            LookHero(item: current, aspect: aspect, hook: payload["hook"].string ?? current.hook)
            if isFilms && !current.frames.isEmpty { LookFrames(item: current, aspect: aspect) }
            rail(current).workspacePanel()
        }
    }

    // MARK: Rail

    /// The selected look's caption and what it is made of, with the deeper controls folded away.
    private func rail(_ current: LookItem) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            LookCaption(item: current, isRecommended: current.id == recommendedID)
            if let recipe = current.recipe {
                Rectangle().fill(Workspace.hairline).frame(height: 1)
                LookPalette(recipe: recipe)
                if !recipe.display.isEmpty { LookTypeStyle(recipe: recipe) }
            }
            Rectangle().fill(Workspace.hairline).frame(height: 1)
            DisclosureGroup("Refine direction", isExpanded: $showRefine) { controls(current).padding(.top, 10) }
                .font(.system(size: 13, weight: .medium))
            DisclosureGroup("Motion and sound", isExpanded: $showMotion) { motionAndSound(current).padding(.top, 10) }
                .font(.system(size: 13, weight: .medium))
            motionExtras
        }
        .padding(Workspace.panelPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: model.motionRun?.path) { await loadMotionStore() }
    }

    // MARK: Motion Studio (only when its files exist; both collapsed, neither blocks the call)

    private func loadMotionStore() async {
        guard let run = model.motionRun else { return }
        let project = model.motionProject
        motionStore = await Task.detached(priority: .utility) {
            var store = MotionStudioStore.load(projectRoot: run)
            if store.kitCatalog == nil, let project, project != run { store.kitCatalog = MotionStudioStore.load(projectRoot: project).kitCatalog }
            return store
        }.value
    }

    @ViewBuilder private var motionExtras: some View {
        if let reference = motionStore.reference {
            Rectangle().fill(Workspace.hairline).frame(height: 1)
            MotionInspirationSummary(summary: reference, onChangeInfluence: canAct ? { text in
                Task { await model.send(step: step, type: "note", value: .object(["kind": .string("motion-influence")]), note: text) }
            } : nil)
        }
        if let catalog = motionStore.kitCatalog, !catalog.allItems.isEmpty {
            DisclosureGroup("Motion library", isExpanded: $showMotionLibrary) {
                MotionLibraryView(catalog: catalog, projectRoot: model.motionProject ?? model.motionRun) { req in
                    guard canAct else { return }
                    Task {
                        await model.send(step: step, type: "note",
                                         value: .object(["kind": .string("motion-kit"), "item": .string(req.itemID), "annotation": .string(req.annotation),
                                                         "params": .object(req.params)]),
                                         note: req.instruction)
                    }
                }
                .frame(height: 420).padding(.top, 10)
            }
            .font(.system(size: 13, weight: .medium))
        }
    }

    /// Saved choices: this step's `sound` record, else what the brief carried; unset reads as Recommend for me.
    private var soundValue: SoundDirection {
        soundDraft ?? SoundDirection(json: payload["sound"]) ?? SoundDirection(json: model.payload("brief")["fields"]["sound"]) ?? SoundDirection()
    }

    /// ONE `sound-direction` action: the choices (SoundDirection.json), plus `revision_request` for a shortlist quick revision.
    private func sendSound(_ sound: SoundDirection, revision: (kind: String, candidate: String)? = nil) {
        guard canAct else { return }
        soundDraft = sound
        var value = sound.json.object
        if let revision { value["revision_request"] = .object(["kind": .string(revision.kind), "candidate": .string(revision.candidate)]) }
        Task { await model.send(step: step, type: "sound-direction", value: .object(value)) }
    }

    @ViewBuilder private func motionAndSound(_ current: LookItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SoundDirectionSection(sound: soundValue, enabled: canAct) { sendSound($0) }
            SoundCandidatesView(candidates: SoundCandidate.parse(payload["sound"]), enabled: canAct) { kind, id in
                sendSound(soundValue, revision: (kind, id))
            }
            if current.video != nil {
                Label("The picture above plays this look's motion preview.", systemImage: "play.rectangle")
                    .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if let music = current.music {
                Label(music, systemImage: "music.note").font(.system(size: 12)).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !current.beats.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(current.beats.enumerated()), id: \.offset) { index, beat in
                        Text("\(index + 1). \(beat)").font(.system(size: 12)).foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Controls

    /// The same `knob` message the old Energy control sent; "as is" is gone because it is not a change.
    private func sendEnergy(_ value: String, for current: LookItem) {
        Task { await model.send(step: step, type: "knob", value: .object(["name": .string("energy"), "value": .string(value), "film": .string(current.id)])) }
    }

    private func controls(_ current: LookItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Actions, not a segmented control: each choice starts a redraw, so none of them shows as a state that is "on".
            Menu {
                Button("Redraw with More Energy") { sendEnergy("punchier", for: current) }
                Button("Redraw with Less Energy") { sendEnergy("calmer", for: current) }
            } label: {
                Label("Redraw with more or less energy", systemImage: "dial.medium")
            }
            .menuStyle(.button).fixedSize()
            .disabled(!canAct)
            .help("\(agent) redraws this look's motion language. It takes a few minutes.")
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
                Label("More like this", systemImage: "sparkles")
            }
            .disabled(!canAct)
            .help("Ask \(agent) for new looks close to \(current.name).")
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
                .buttonStyle(.rasanPrimary).disabled(mixLook == mixStory)
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

// MARK: - Hero, caption, palette, frames, tiles

private struct LookHero: View {
    let item: LookItem
    let aspect: CGFloat
    var hook: String?
    var maxHeight: CGFloat = 560

    var body: some View {
        LookMedia(item: item, hook: hook)
            .aspectRatio(aspect, contentMode: .fit)
            .frame(maxHeight: maxHeight)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
            .frame(maxWidth: .infinity)
            .id(item.id)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(item.label) look, \(item.name). \(item.blend)")
            .accessibilityAddTraits(.isImage)
    }
}

private struct LookCaption: View {
    let item: LookItem
    var isRecommended: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            StageSectionTitle("Selected look")
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(item.name).font(.system(size: 20, weight: .semibold)).tracking(-0.2).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                Text(item.label).font(.system(size: 11, weight: .bold)).tracking(1.0).foregroundStyle(.secondary)
                if isRecommended { RecommendedBadge(text: "Recommended") }
            }
            if !item.blend.isEmpty { Text(item.blend).font(.system(size: 13, weight: .medium)).foregroundStyle(.primary.opacity(0.85)).fixedSize(horizontal: false, vertical: true) }
            if !item.why.isEmpty { Text(item.why).font(.system(size: 13)).foregroundStyle(.secondary).lineSpacing(2).fixedSize(horizontal: false, vertical: true) }
            if item.specimen != nil { OpenInBrowserButton(path: item.specimen, title: "Open type and colour sheet").padding(.top, 2) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// The recipe's own colours, as drawn swatches.
private struct LookPalette: View {
    let recipe: LookItem.Recipe
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Colour palette").font(.system(size: 13, weight: .medium))
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 32, maximum: 40), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(Array(recipe.swatches.enumerated()), id: \.offset) { _, color in
                    RoundedRectangle(cornerRadius: 8, style: .continuous).fill(color)
                        .aspectRatio(1, contentMode: .fit)
                        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.primary.opacity(0.18), lineWidth: 1) }
                }
            }
            .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Colour palette, \(recipe.swatches.count) colours")
    }
}

private struct LookTypeStyle: View {
    let recipe: LookItem.Recipe
    private var font: Font {
        if NSFontManager.shared.availableFontFamilies.contains(recipe.display) { return .custom(recipe.display, size: 38) }
        return .system(size: 38, weight: .semibold, design: .serif)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Type style").font(.system(size: 13, weight: .medium))
            HStack(alignment: .center, spacing: 12) {
                Text("Aa").font(font).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(recipe.display).font(.system(size: 13, weight: .medium))
                    if !recipe.body.isEmpty { Text(recipe.body).font(.system(size: 12)).foregroundStyle(.secondary) }
                    if let typeClass = recipe.typeClass, !typeClass.isEmpty { Text(typeClass).font(.system(size: 12)).foregroundStyle(.secondary) }
                }
            }
        }
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
                        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
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
    var compact = false
    let pick: (String) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: compact ? 8 : 14) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                LookTile(item: item, index: index, selected: item.id == selectedID, recommended: item.id == recommendedID,
                         aspect: min(aspect, 1.8), hook: hook, compact: compact) { pick(item.id) }
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
    var compact = false
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: compact ? 5 : 8) {
                LookMedia(item: item, hook: hook, playVideo: false, compact: true)
                    .aspectRatio(aspect, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(selected ? Color.rasan : (hovering ? Color.primary.opacity(0.25) : Workspace.hairline), lineWidth: selected ? 2 : 1)
                    }
                if compact {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.name).font(.system(size: 12, weight: selected ? .semibold : .regular)).lineLimit(1)
                        if recommended { RecommendedBadge(text: "Recommended") }
                    }
                } else {
                    HStack(spacing: 6) {
                        Text(item.name).font(.system(size: 13, weight: selected ? .semibold : .regular)).lineLimit(1)
                        if recommended { RecommendedBadge(text: "Recommended") }
                        Spacer(minLength: 0)
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .frame(maxWidth: .infinity)
        .accessibilityLabel("\(item.label), \(item.name)\(recommended ? ", Claude's pick" : "")")
        .help("Press \(index + 1) to show this one")
        .accessibilityHint("Shows this look large. Shortcut \(index + 1).")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}
