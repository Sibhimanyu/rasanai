import AppKit
import AVKit
import StudioCore
import SwiftUI

// MARK: - Shared helpers for editable payload rows

/// One editable row of a payload list (a scene, a clip in the cut, an overlay). It keeps every field the director sent,
/// including ones this screen doesn't show, so a submit never drops anything.
struct JSONRow: Identifiable, Equatable {
    let id = UUID()
    var fields: [String: JSONValue]
    init(_ value: JSONValue) { fields = value.object }
    var value: JSONValue { .object(fields) }
    func string(_ key: String) -> String {
        switch fields[key] ?? .null {
        case .string(let text): return text
        case .number(let number): return number.rounded() == number ? String(Int(number)) : String(number)
        case .array(let items): return items.compactMap { $0.string }.joined(separator: " | ")
        default: return ""
        }
    }
    func number(_ key: String) -> Double? {
        switch fields[key] ?? .null {
        case .number(let number): return number
        case .string(let text): return Double(text)
        default: return nil
        }
    }
}

extension Binding where Value == JSONRow {
    func text(_ key: String) -> Binding<String> {
        Binding<String>(get: { wrappedValue.string(key) }, set: { text in
            if key == "text", wrappedValue.string("type") == "card", text.contains("|") {
                wrappedValue.fields[key] = .array(text.split(separator: "|").map { .string($0.trimmingCharacters(in: .whitespaces)) }.filter { $0 != .string("") })
            } else {
                wrappedValue.fields[key] = .string(text)
            }
        })
    }
    func number(_ key: String) -> Binding<Double?> {
        Binding<Double?>(get: { wrappedValue.number(key) }, set: { wrappedValue.fields[key] = $0.map { .number($0) } ?? .null })
    }
    func flag(_ key: String) -> Binding<Bool> {
        Binding<Bool>(get: { if case .bool(let on) = wrappedValue.fields[key] ?? .null { return on }; return false },
                      set: { wrappedValue.fields[key] = .bool($0) })
    }
}

/// A quiet empty state used by the panels.
/// A small preview of the brand's logo file (SVG or PNG) on a neutral tile, so a white or black logo is still seen.
private struct LogoThumb: View {
    let url: URL?
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(nsColor: .quaternaryLabelColor).opacity(0.35))
            if let url, let image = NSImage(contentsOf: url) {
                Image(nsImage: image).resizable().aspectRatio(contentMode: .fit).padding(8)
            } else {
                Image(systemName: "photo").foregroundStyle(.tertiary)
            }
        }
        .frame(width: 56, height: 56)
        .accessibilityHidden(true)
    }
}

private struct PanelEmpty: View {
    let symbol: String
    let text: String
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: symbol).font(.system(size: 28, weight: .light)).foregroundStyle(.tertiary)
            Text(text).font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 44)
        .cardSurface()
    }
}

private func secondsText(_ value: Double) -> String { String(format: "%.1f s", value) }

/// A tiny numeric field that sits in a row.
private struct NumberField: View {
    let title: String
    @Binding var value: Double?
    var width: CGFloat = 54
    var body: some View {
        TextField(title, value: $value, format: .number.precision(.fractionLength(0...2)))
            .textFieldStyle(.roundedBorder).multilineTextAlignment(.trailing).monospacedDigit()
            .frame(width: width).accessibilityLabel(title)
    }
}

// MARK: - Brand

struct BrandPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var mode: String?
    @State private var seeded = false

    private var payload: JSONValue { model.payload(step) }
    private var brand: JSONValue { payload["brand"] }

    private static let roleOrder = ["canvas", "ink", "accent", "surface", "muted"]

    private var roles: [(name: String, hex: String)] {
        let all = brand["roles"].object.compactMapValues { $0.string }
        let known = Self.roleOrder.compactMap { key in all[key].map { (key, $0) } }
        let rest = all.keys.filter { !Self.roleOrder.contains($0) }.sorted().map { ($0, all[$0] ?? "") }
        return known + rest
    }

    private var fonts: [(role: String, family: String)] {
        brand["fonts"].object.keys.sorted { a, b in
            let order = ["display", "body", "mono"]
            return (order.firstIndex(of: a) ?? 9, a) < (order.firstIndex(of: b) ?? 9, b)
        }.compactMap { key in
            let value = brand["fonts"][key]
            guard let family = value.string ?? value["family"].string else { return nil }
            return (key, family)
        }
    }

    private var modes: [String] { brand["modes"].array.compactMap { $0.string } }

    private var boardImage: String? {
        if let image = payload["image"].string { return image }
        if let board = payload["board"].string, ["png", "jpg", "jpeg", "webp"].contains((board as NSString).pathExtension.lowercased()) { return board }
        return nil
    }

    var body: some View {
        if brand == .null {
            PanelEmpty(symbol: "paintbrush.pointed", text: payload["unavailable"].string
                       ?? "If the project has a brand reference (DESIGN.md), it appears here: its colours by role, its type and its rules, ready to be the look.")
                .stepPrimary("Carry on without it", symbol: "arrow.right") { note in send(["use": .string("none")], note: note) }
        } else {
            content
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 22) {
            hero
            if brand["logo"] != .null { logoRow }
            if !roles.isEmpty { swatches }
            if !fonts.isEmpty { typeSpecimens }
            if !modes.isEmpty { modePicker }
            if !(brand["warnings"].array.isEmpty) { warnings }
            HStack(spacing: 14) {
                Button { send(["use": .string("remix"), "mode": modeValue], note: "") } label: {
                    Label("My brand, on a new layout", systemImage: "rectangle.3.group")
                }
                .controlSize(.large).disabled(!model.canAct(on: step))
                Button("Don't use it for this video") { send(["use": .string("none")], note: "") }
                    .buttonStyle(.link).disabled(!model.canAct(on: step))
                if boardImage == nil { OpenInBrowserButton(path: payload["board"].string, title: "Open the brand board") }
            }
        }
        .stepPrimary("Use my brand as the look", symbol: "checkmark.seal") { note in send(["use": .string("direct"), "mode": modeValue], note: note) }
        .onAppear { if !seeded { seeded = true; mode = modes.contains("dark") ? "dark" : modes.first } }
    }

    private var modeValue: JSONValue { mode.map { .string($0) } ?? .null }

    private func send(_ value: [String: JSONValue], note: String) {
        Task { await model.send(step: step, type: "choose", value: .object(value), note: note) }
    }

    // MARK: Pieces

    @ViewBuilder private var hero: some View {
        HStack(alignment: .top, spacing: 18) {
            if let board = boardImage {
                PayloadImage(path: board, contentMode: .fill, maxPixels: 1400)
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .frame(maxWidth: 440)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                    .shadow(color: .black.opacity(0.16), radius: 14, y: 6)
                    .accessibilityLabel("Brand board")
            }
            VStack(alignment: .leading, spacing: 6) {
                if let name = brand["name"].string { Text(name).font(.system(size: 22, weight: .semibold)) }
                Text("From \(brand["source"].string ?? "DESIGN.md")").font(.system(size: 12)).foregroundStyle(.secondary)
                if boardImage != nil, !roles.isEmpty {
                    Text("\(roles.count) colour roles · \(fonts.count) typefaces\(modes.isEmpty ? "" : " · " + modes.joined(separator: " + ") + " modes")")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
    }

    /// The logo file the film will place, or the plain statement that none was found (the name is then set in type).
    @ViewBuilder private var logoRow: some View {
        let logo = brand["logo"]
        HStack(spacing: 14) {
            if let file = logo["file"].string {
                LogoThumb(url: model.fileURL(file))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Logo: \((file as NSString).lastPathComponent)").font(.system(size: 13, weight: .medium))
                    Text("The official file\(logo["kind"].string.map { " (\($0))" } ?? ""), placed as it is. Never redrawn.")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
            } else {
                Image(systemName: "textformat").font(.system(size: 20)).foregroundStyle(.secondary).frame(width: 56, height: 56)
                VStack(alignment: .leading, spacing: 2) {
                    Text("No official logo found").font(.system(size: 13, weight: .medium))
                    Text("The name is set in type on the end card. Add the logo file to the project to change that.")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .stageCard()
        .accessibilityElement(children: .combine)
    }

    private var swatches: some View {
        VStack(alignment: .leading, spacing: 10) {
            StageSectionTitle("Colour by role")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150, maximum: 220), spacing: 12)], spacing: 12) {
                ForEach(roles, id: \.name) { role in
                    let color = Color.hex(role.hex) ?? .gray
                    VStack(alignment: .leading, spacing: 0) {
                        RoundedRectangle(cornerRadius: 0).fill(color).frame(height: 62)
                            .overlay(alignment: .bottomLeading) {
                                Text("Aa").font(.system(size: 18, weight: .semibold))
                                    .foregroundStyle(Self.isLight(role.hex) ? .black.opacity(0.78) : .white.opacity(0.92)).padding(10)
                            }
                        VStack(alignment: .leading, spacing: 1) {
                            Text(role.name.capitalized).font(.system(size: 12, weight: .semibold))
                            Text(role.hex.uppercased()).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(nsColor: .controlBackgroundColor).opacity(0.7))
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(role.name) \(role.hex)")
                }
            }
        }
    }

    private var typeSpecimens: some View {
        VStack(alignment: .leading, spacing: 10) {
            StageSectionTitle("Type")
            VStack(spacing: 0) {
                ForEach(Array(fonts.enumerated()), id: \.offset) { index, font in
                    let installed = NSFontManager.shared.availableFontFamilies.contains(font.family)
                    HStack(alignment: .firstTextBaseline, spacing: 16) {
                        Text(font.role.capitalized).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary).frame(width: 64, alignment: .leading)
                        Text(sample(font.role))
                            .font(installed ? .custom(font.family, size: font.role == "display" ? 30 : 17) : .system(size: font.role == "display" ? 30 : 17))
                            .lineLimit(1).minimumScaleFactor(0.6)
                        Spacer(minLength: 8)
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(font.family).font(.system(size: 12, weight: .medium))
                            if !installed { Text("Not installed here").font(.system(size: 10)).foregroundStyle(.orange) }
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    if index < fonts.count - 1 { Divider().padding(.leading, 16) }
                }
            }
            .cardSurface()
        }
    }

    private func sample(_ role: String) -> String {
        switch role {
        case "display": "Twelve small victories"
        case "mono": "0123 4567 89"
        default: "A calm confident voice, a little playful."
        }
    }

    private var modePicker: some View {
        HStack(spacing: 14) {
            Text("Your brand defines light and dark. Which one leads this video?")
                .font(.system(size: 13)).foregroundStyle(.secondary)
            Picker("Mode", selection: Binding(get: { mode ?? modes.first ?? "" }, set: { mode = $0 })) {
                ForEach(modes, id: \.self) { Text($0.capitalized).tag($0) }
            }
            .pickerStyle(.segmented).labelsHidden().frame(width: 180)
        }
        .stageCard()
    }

    private var warnings: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(brand["warnings"].array.enumerated()), id: \.offset) { _, warning in
                Label(warning.string ?? "", systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12)).foregroundStyle(Color(nsColor: .systemOrange))
                    .labelStyle(.titleAndIcon)
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    static func isLight(_ hex: String) -> Bool {
        guard let color = NSColor(Color.hex(hex) ?? .gray).usingColorSpace(.sRGB) else { return true }
        return 0.299 * color.redComponent + 0.587 * color.greenComponent + 0.114 * color.blueComponent > 0.6
    }
}

// MARK: - Research

struct ResearchPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    private var payload: JSONValue { model.payload(step) }
    private var findings: [(text: String, source: String?)] {
        let raw = payload["findings"].array.isEmpty ? payload["notes"].array : payload["findings"].array
        return raw.compactMap { item in
            if let text = item.string { return (text, nil) }
            guard let text = item["text"].string ?? item["finding"].string ?? item["title"].string else { return nil }
            return (text, item["source"].string ?? item["url"].string)
        }
    }

    var body: some View {
        if !payload["options"].array.isEmpty {
            GenericPanel(model: model, step: step)
        } else {
            VStack(alignment: .leading, spacing: 18) {
                if let decision = payload["decision"].string, model.status(step) != "done" {
                    Label(decision, systemImage: "magnifyingglass").font(.system(size: 14)).stageCard()
                }
                if findings.isEmpty {
                    PanelEmpty(symbol: "text.magnifyingglass",
                               text: payload["decision"].string == nil
                               ? "The crew's reading appears here: what it found on the web and, with your permission, in your project."
                               : "That is everything the crew reported for this step. The line above says what it read and what it found.")
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        StageSectionTitle("What the crew found")
                        VStack(spacing: 0) {
                            ForEach(Array(findings.enumerated()), id: \.offset) { index, finding in
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: "sparkle.magnifyingglass").foregroundStyle(Color.rasan).frame(width: 18)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(finding.text).font(.system(size: 14)).fixedSize(horizontal: false, vertical: true)
                                        if let source = finding.source { Text(source).font(.system(size: 11)).foregroundStyle(.secondary) }
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 12)
                                .accessibilityElement(children: .combine)
                                if index < findings.count - 1 { Divider().padding(.leading, 46) }
                            }
                        }
                        .cardSurface()
                    }
                }
            }
        }
    }
}

// MARK: - Route

struct RoutePanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var selected: String?

    private var payload: JSONValue { model.payload(step) }
    private var options: [JSONValue] { payload["options"].array }
    private var recommended: String? { payload["recommended"].identifier }
    private var chosen: String? { payload["sent"]["value"].identifier }
    private var current: String? { selected ?? recommended ?? options.first?["id"].identifier }

    var body: some View {
        if options.isEmpty {
            PanelEmpty(symbol: "point.3.connected.trianglepath.dotted",
                       text: "Claude proposes which HyperFrames workflow builds this video: a launch film, an explainer, a PR video, a music video, a footage edit.")
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                    let id = option["id"].identifier ?? ""
                    let on = current == id
                    Button { withAnimation(.snappy(duration: 0.18)) { selected = id } } label: {
                        HStack(alignment: .top, spacing: 14) {
                            Image(systemName: on ? "largecircle.fill.circle" : "circle")
                                .font(.system(size: 18)).foregroundStyle(on ? Color.rasan : Color.secondary).padding(.top, 1)
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 8) {
                                    Text(option["label"].string ?? id).font(.system(size: 16, weight: .semibold))
                                    if id == recommended { RecommendedBadge() }
                                    if id == chosen { Label("Sent", systemImage: "checkmark").font(.system(size: 11)).foregroundStyle(.secondary) }
                                }
                                if let why = option["why"].string {
                                    Text(why).font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                                }
                                Text(id).font(.system(size: 11, design: .monospaced)).foregroundStyle(.tertiary)
                            }
                            Spacer(minLength: 0)
                        }
                        .stageCard(selected: on)
                    }
                    .buttonStyle(PressableStyle())
                    .disabled(!model.canAct(on: step))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(option["label"].string ?? id). \(option["why"].string ?? "")\(id == recommended ? " Claude recommends this." : "")")
                    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                }
            }
            .stepPrimary("Build it this way", symbol: "arrow.right", enabled: current != nil) { note in
                guard let id = current else { return }
                Task { await model.send(step: step, type: "choose", value: .string(id), note: note) }
            }
        }
    }
}

// MARK: - Footage

struct FootagePanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var included: Set<String> = []
    @State private var seeded: JSONValue?

    private var payload: JSONValue { model.payload(step) }
    private var clips: [JSONValue] { payload["clips"].array }
    private func key(_ clip: JSONValue) -> String { clip["id"].identifier ?? clip["name"].string ?? "" }

    var body: some View {
        if clips.isEmpty {
            PanelEmpty(symbol: "film.stack", text: "Every clip in your footage folder appears here: a contact sheet, its length, format, sound and what is said in it.")
        } else {
            let usable = clips.filter { $0["error"].string == nil }
            let total = clips.filter { included.contains(key($0)) }.reduce(0.0) { $0 + ($1["duration"].number ?? 0) }
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("\(included.count) of \(clips.count) clips · \(clockText(total)) of footage").font(.system(size: 13)).foregroundStyle(.secondary)
                        .monospacedDigit()
                    Spacer()
                    Button("All") { included = Set(usable.map(key)) }.buttonStyle(.link)
                    Button("None") { included = [] }.buttonStyle(.link)
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 16, alignment: .top)], spacing: 16) {
                    ForEach(Array(clips.enumerated()), id: \.offset) { _, clip in card(clip) }
                }
            }
            .stepPrimary(included.count == 1 ? "Use the 1 ticked clip" : "Use the \(included.count) ticked clips", symbol: "film", enabled: !included.isEmpty) { note in
                let ids = clips.filter { included.contains(key($0)) }.map { $0["id"] != .null ? $0["id"] : JSONValue.string(key($0)) }
                Task { await model.send(step: step, type: "submit", value: .object(["include": .array(ids)]), note: note) }
            }
            .onAppear { seed() }
            .onChange(of: payload) { seed() }
        }
    }

    private func seed() {
        guard seeded != payload else { return }
        seeded = payload
        if let sent = payload["sent"]["value"]["include"].array as [JSONValue]?, !sent.isEmpty {
            included = Set(sent.compactMap { $0.identifier })
        } else {
            included = Set(clips.filter { $0["error"].string == nil }.map(key))
        }
    }

    private func card(_ clip: JSONValue) -> some View {
        let id = key(clip)
        let error = clip["error"].string
        let transcript = clip["text"].string ?? clip["transcript"].string ?? ""
        let on = included.contains(id) && error == nil
        return VStack(alignment: .leading, spacing: 0) {
            ZStack {
                Color.black.opacity(0.9)
                PayloadImage(path: clip["sheet"].string ?? clip["contact"].string, contentMode: .fit, maxPixels: 1200)
                if error != nil {
                    Color.black.opacity(0.55)
                    Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 24)).foregroundStyle(.orange)
                }
            }
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .opacity(on ? 1 : 0.55)
            VStack(alignment: .leading, spacing: 8) {
                Toggle(isOn: Binding(get: { on }, set: { value in if value { included.insert(id) } else { included.remove(id) } })) {
                    Text(clip["name"].string ?? id).font(.system(size: 13, weight: .semibold)).lineLimit(1).truncationMode(.middle)
                }
                .toggleStyle(.checkbox).disabled(error != nil || !model.canAct(on: step))
                Text(facts(clip)).font(.system(size: 11.5)).foregroundStyle(error == nil ? Color.secondary : Color.red).monospacedDigit()
                if !transcript.isEmpty {
                    DisclosureGroup {
                        Text(transcript).font(.system(size: 12)).foregroundStyle(.secondary).textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                    } label: { Text("What is said").font(.system(size: 12, weight: .medium)) }
                }
            }
            .padding(12)
        }
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(on ? Color.rasan.opacity(0.7) : Color(nsColor: .separatorColor), lineWidth: on ? 1.5 : 0.5) }
        .animation(.snappy(duration: 0.18), value: on)
        .accessibilityElement(children: .contain)
    }

    private func facts(_ clip: JSONValue) -> String {
        if let error = clip["error"].string { return error }
        if let facts = clip["facts"].string { return [clip["duration"].number.map { clockText($0) }, facts].compactMap { $0 }.joined(separator: " · ") }
        var parts: [String?] = [clip["duration"].number.map { clockText($0) }]
        if let w = clip["width"].number, let h = clip["height"].number { parts.append("\(Int(w))×\(Int(h))") }
        if let fps = clip["fps"].number { parts.append("\(fps.rounded() == fps ? String(Int(fps)) : String(format: "%.2f", fps))\u{202F}fps") }
        if case .bool(let audio) = clip["has_audio"] {
            if audio { parts.append(clip["words"].number.map { "\(Int($0)) words" } ?? "sound, no speech") } else { parts.append("no sound") }
        }
        let shots = clip["scenes"].array.count
        if shots > 0 { parts.append("\(shots) shot changes") }
        return parts.compactMap { $0 }.joined(separator: " · ")
    }
}

// MARK: - Reel

struct ReelPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var rows: [JSONRow] = []
    @State private var overlays: [JSONRow] = []
    @State private var captionsOn = false
    @State private var captionStyle = "bold"
    @State private var captionsValue: JSONValue = .null
    @State private var seeded: JSONValue?
    @State private var player: AVPlayer?

    private static let rowHeight: CGFloat = 58
    private var payload: JSONValue { model.payload(step) }
    private var clipsCatalog: [(name: String, duration: Double)] {
        payload["clips"].array.compactMap { clip in clip["name"].string.map { ($0, clip["duration"].number ?? 0) } }
    }
    private var transitions: [String] { payload["transitions"].array.compactMap { $0.string }.nonEmpty ?? ["auto", "cut", "dissolve", "wipe"] }

    private func length(_ row: JSONRow) -> Double {
        if row.string("type") == "card" { return row.number("duration") ?? 0 }
        let rate = row.number("rate") ?? 1
        return max(0, ((row.number("out") ?? 0) - (row.number("in") ?? 0)) / (rate > 0 ? rate : 1))
    }
    private var total: Double { rows.reduce(0) { $0 + length($1) } }
    private var captionsEditable: Bool { if case .array = captionsValue { return false }; return true }

    var body: some View {
        if payload["timeline"].array.isEmpty && rows.isEmpty {
            PanelEmpty(symbol: "scissors", text: "The cut appears here: every clip with its in and out points, the cards between them, overlays on top and captions, editable before the build.")
        } else {
            VStack(alignment: .leading, spacing: 24) {
                if let player { draft(player) }
                cutSection
                overlaySection
                captionSection
            }
            .stepPrimary("Build this cut", symbol: "hammer", enabled: !rows.isEmpty) { note in submit(note) }
            .onAppear { seed(); loadVideo() }
            .onChange(of: payload) { seed(); loadVideo() }
        }
    }

    // MARK: Seed / submit

    private func seed() {
        guard seeded != payload else { return }
        seeded = payload
        rows = payload["timeline"].array.map(JSONRow.init)
        overlays = payload["overlays"].array.map(JSONRow.init)
        captionsValue = payload["captions"]
        if case .object(let object) = captionsValue {
            if case .bool(let on) = object["on"] ?? .null { captionsOn = on } else { captionsOn = false }
            captionStyle = object["style"]?.string ?? "bold"
        } else if case .array(let cues) = captionsValue { captionsOn = !cues.isEmpty }
        else { captionsOn = false; captionStyle = "bold" }
    }

    private func loadVideo() {
        guard let url = model.fileURL(payload["video"].string) else { player = nil; return }
        if (player?.currentItem?.asset as? AVURLAsset)?.url != url { player = AVPlayer(url: url) }
    }

    private func numbered(_ row: JSONRow, keys: [String]) -> JSONValue {
        var fields = row.fields
        for key in keys { if let number = row.number(key) { fields[key] = .number(number) } }
        return .object(fields)
    }

    private func submit(_ note: String) {
        let timeline = rows.map { numbered($0, keys: ["in", "out", "duration", "rate"]) }
        let ov = overlays.map { numbered($0, keys: ["start", "duration"]) }
        var captions = captionsValue
        if case .object(var object) = captionsValue {
            object["on"] = .bool(captionsOn); object["style"] = .string(captionStyle); captions = .object(object)
        } else if captionsValue == .null {
            captions = .object(["on": .bool(captionsOn), "style": .string(captionStyle)])
        }
        let value = JSONValue.object(["timeline": .array(timeline), "overlays": .array(ov), "captions": captions])
        Task { await model.send(step: step, type: "submit", value: value, note: note) }
    }

    // MARK: Sections

    private func draft(_ player: AVPlayer) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            StageSectionTitle("Draft render")
            VideoPlayer(player: player)
                .aspectRatio(model.snapshot.aspectRatio, contentMode: .fit)
                .frame(maxWidth: 560)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .shadow(color: .black.opacity(0.2), radius: 14, y: 6)
                .accessibilityLabel("Draft of the cut")
        }
    }

    private var cutSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                StageSectionTitle("The cut")
                Spacer()
                Text("\(rows.count) items · \(secondsText(total))").font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit()
            }
            timelineStrip
            List {
                ForEach($rows) { $row in
                    cutRow($row).listRowSeparator(.visible).frame(height: Self.rowHeight)
                }
                .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
            }
            .listStyle(.inset(alternatesRowBackgrounds: true))
            .scrollDisabled(true).scrollContentBackground(.hidden)
            .frame(height: CGFloat(max(rows.count, 1)) * (Self.rowHeight + 9) + 20)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            HStack(spacing: 10) {
                Button {
                    let first = clipsCatalog.first
                    var fields: [String: JSONValue] = ["type": .string("clip"), "clip": .string(first?.name ?? ""), "in": .number(0), "out": .number(min(3, first?.duration ?? 3))]
                    fields["transition_in"] = .string("auto")
                    rows.append(JSONRow(.object(fields)))
                } label: { Label("Clip", systemImage: "plus") }
                Button { rows.append(JSONRow(.object(["type": .string("card"), "text": .string("New card"), "sub": .string(""), "duration": .number(3)]))) }
                label: { Label("Card between", systemImage: "rectangle.on.rectangle") }
                Spacer()
                Text("Drag a row to reorder").font(.system(size: 11)).foregroundStyle(.tertiary)
            }
            .disabled(!model.canAct(on: step))
        }
    }

    private var timelineStrip: some View {
        GeometryReader { proxy in
            let gap: CGFloat = 3
            let usable = max(10, proxy.size.width - gap * CGFloat(max(rows.count - 1, 0)))
            let sum = max(total, 0.1)
            HStack(spacing: gap) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    let isCard = row.string("type") == "card"
                    let seconds = length(row)
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(isCard ? Color.purple.opacity(0.30) : Color.rasan.opacity(0.30))
                        .overlay(alignment: .topLeading) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("\(index + 1) \(isCard ? "▣ " : "")\(label(row))").font(.system(size: 10, weight: .semibold)).lineLimit(1)
                                Text(secondsText(seconds)).font(.system(size: 9.5)).foregroundStyle(.secondary).monospacedDigit()
                            }
                            .padding(.horizontal, 6).padding(.top, 4)
                        }
                        .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder((isCard ? Color.purple : Color.rasan).opacity(0.5), lineWidth: 0.75) }
                        .frame(width: max(18, usable * max(seconds, 0.1) / sum))
                }
            }
        }
        .frame(height: 44)
        .animation(.smooth(duration: 0.25), value: rows.map { $0.id })
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cut timeline, \(rows.count) items, \(secondsText(total))")
    }

    private func label(_ row: JSONRow) -> String {
        if row.string("type") == "card" { return row.string("text") }
        let label = row.string("label")
        return label.isEmpty ? row.string("clip") : label
    }

    @ViewBuilder private func cutRow(_ row: Binding<JSONRow>) -> some View {
        let value = row.wrappedValue
        let index = (rows.firstIndex { $0.id == value.id } ?? 0)
        let isCard = value.string("type") == "card"
        HStack(spacing: 12) {
            Image(systemName: "line.3.horizontal").foregroundStyle(.tertiary).accessibilityHidden(true)
            Text(String(format: "%02d", index + 1)).font(.system(size: 12, weight: .semibold, design: .monospaced)).foregroundStyle(.secondary)
            Image(systemName: isCard ? "rectangle.on.rectangle" : "film").foregroundStyle(isCard ? Color.purple : Color.rasan).frame(width: 18)
            if isCard {
                TextField("Card text (use | for a second line)", text: row.text("text")).textFieldStyle(.roundedBorder).frame(minWidth: 180)
                HStack(spacing: 6) { NumberField(title: "Card seconds \(index + 1)", value: row.number("duration")); Text("s").foregroundStyle(.secondary) }
            } else {
                Picker("Clip", selection: row.text("clip")) {
                    if !clipsCatalog.contains(where: { $0.name == value.string("clip") }) { Text(value.string("clip")).tag(value.string("clip")) }
                    ForEach(clipsCatalog, id: \.name) { Text("\($0.name) (\(Int($0.duration.rounded())) s)").tag($0.name) }
                }
                .labelsHidden().frame(minWidth: 170, maxWidth: 240)
                HStack(spacing: 5) {
                    NumberField(title: "In point \(index + 1)", value: row.number("in"))
                    Image(systemName: "arrow.right").font(.system(size: 10)).foregroundStyle(.tertiary)
                    NumberField(title: "Out point \(index + 1)", value: row.number("out"))
                }
            }
            Text(secondsText(length(value))).font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit().frame(width: 52, alignment: .trailing)
            Spacer(minLength: 4)
            if index > 0 {
                Picker("Transition into \(index + 1)", selection: Binding(get: { value.string("transition_in").isEmpty ? "auto" : value.string("transition_in") },
                                                                        set: { row.wrappedValue.fields["transition_in"] = .string($0) })) {
                    ForEach(transitions + (transitions.contains(value.string("transition_in")) || value.string("transition_in").isEmpty ? [] : [value.string("transition_in")]), id: \.self) { Text($0).tag($0) }
                }
                .labelsHidden().frame(width: 100).help("Transition into this item")
            } else {
                Text("opens").font(.system(size: 11)).foregroundStyle(.tertiary).frame(width: 100)
            }
            if !isCard { Toggle("Mute", isOn: row.flag("mute")).toggleStyle(.checkbox).font(.system(size: 12)) }
            Button(role: .destructive) { rows.removeAll { $0.id == value.id } } label: { Image(systemName: "minus.circle") }
                .buttonStyle(.borderless).disabled(rows.count <= 1).help("Remove").accessibilityLabel("Remove item \(index + 1)")
        }
        .disabled(!model.canAct(on: step))
    }

    private var overlaySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                StageSectionTitle("On top")
                Spacer()
                Button { overlays.append(JSONRow(.object(["text": .string("Name"), "sub": .string("Role"), "zone": .string("lower-third"), "start": .number(1), "duration": .number(3), "style": .string("plate")]))) }
                label: { Label("Overlay", systemImage: "plus") }.disabled(!model.canAct(on: step))
            }
            if overlays.isEmpty {
                Text("No overlays. Add a name plate or a title over the footage.").font(.system(size: 12)).foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach($overlays) { $overlay in
                        let n = (overlays.firstIndex { $0.id == overlay.id } ?? 0) + 1
                        HStack(spacing: 10) {
                            Image(systemName: "text.below.photo").foregroundStyle(.secondary).frame(width: 18)
                            TextField("Overlay text", text: $overlay.text("text")).textFieldStyle(.roundedBorder)
                            TextField("Second line", text: $overlay.text("sub")).textFieldStyle(.roundedBorder)
                            Text("at").font(.system(size: 11)).foregroundStyle(.secondary)
                            NumberField(title: "Overlay start \(n)", value: $overlay.number("start"))
                            Text("for").font(.system(size: 11)).foregroundStyle(.secondary)
                            NumberField(title: "Overlay seconds \(n)", value: $overlay.number("duration"))
                            Picker("Zone", selection: Binding(get: { overlay.string("zone").isEmpty ? "lower-third" : overlay.string("zone") }, set: { overlay.fields["zone"] = .string($0) })) {
                                ForEach(["lower-third", "top", "center"], id: \.self) { Text($0).tag($0) }
                            }.pickerStyle(.menu).labelsHidden().frame(width: 120)
                            Picker("Style", selection: Binding(get: { overlay.string("style").isEmpty ? "plate" : overlay.string("style") }, set: { overlay.fields["style"] = .string($0) })) {
                                ForEach(["plate", "clear"], id: \.self) { Text($0).tag($0) }
                            }.pickerStyle(.menu).labelsHidden().frame(width: 90)
                            Button(role: .destructive) { overlays.removeAll { $0.id == overlay.id } } label: { Image(systemName: "minus.circle") }
                                .buttonStyle(.borderless).accessibilityLabel("Remove overlay \(n)")
                        }
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .disabled(!model.canAct(on: step))
                        if overlay.id != overlays.last?.id { Divider() }
                    }
                }
                .cardSurface()
            }
        }
    }

    private var captionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            StageSectionTitle("Captions")
            if captionsEditable {
                HStack(spacing: 16) {
                    Toggle("Captions from what is said", isOn: $captionsOn).toggleStyle(.switch)
                    Picker("Style", selection: $captionStyle) {
                        Text("Bold, word by word").tag("bold"); Text("Clean, on a plate").tag("clean")
                    }
                    .pickerStyle(.segmented).labelsHidden().frame(width: 280).disabled(!captionsOn)
                    Spacer()
                }
                .stageCard().disabled(!model.canAct(on: step))
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(captionsValue.array.enumerated()), id: \.offset) { _, cue in
                        HStack(spacing: 10) {
                            Text(clockText(cue["at"].number ?? cue["start"].number ?? 0)).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                            Text(cue["text"].string ?? cue.string ?? "").font(.system(size: 13))
                        }
                    }
                }.stageCard()
            }
        }
    }
}

private extension Array {
    var nonEmpty: Self? { isEmpty ? nil : self }
}

// MARK: - Concept

struct ConceptPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var selected: String?

    private var payload: JSONValue { model.payload(step) }
    private var options: [JSONValue] { payload["options"].array }
    private var recommended: String? { payload["recommended"].identifier }
    private var chosen: String? { payload["sent"]["value"].identifier }
    private var current: String? { selected ?? recommended ?? options.first?["id"].identifier }

    var body: some View {
        if options.isEmpty {
            PanelEmpty(symbol: "text.book.closed", text: "Claude is writing story pitches for this video. They appear here.")
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 380), spacing: 16, alignment: .top)], spacing: 16) {
                ForEach(Array(options.enumerated()), id: \.offset) { _, option in card(option) }
            }
            .stepPrimary("Use this story", symbol: "checkmark", enabled: current != nil) { note in
                guard let id = current else { return }
                Task { await model.send(step: step, type: "choose", value: .string(id), note: note) }
            }
        }
    }

    private func card(_ option: JSONValue) -> some View {
        let id = option["id"].identifier ?? ""
        let on = current == id
        let frames = option["frames"].array.compactMap { $0.string }
        let beats = option["beats"].array.compactMap { $0.string }
        return Button { withAnimation(.snappy(duration: 0.18)) { selected = id } } label: {
            VStack(alignment: .leading, spacing: 0) {
                if !frames.isEmpty {
                    HStack(spacing: 2) {
                        ForEach(Array(frames.prefix(3).enumerated()), id: \.offset) { _, frame in
                            PayloadImage(path: frame, contentMode: .fill, maxPixels: 700).frame(height: 140)
                        }
                    }
                    .frame(height: 140).clipped()
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Color.rasan : Color.secondary)
                        Text(option["title"].string ?? id).font(.system(size: 17, weight: .semibold)).multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                        if id == recommended { RecommendedBadge() }
                        if option["rare"] == .bool(true) { Label("Rare", systemImage: "diamond.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(.purple) }
                    }
                    if let text = option["logline"].string ?? option["world"].string {
                        Text(text).font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    }
                    if frames.isEmpty, let hook = option["hook"].string {
                        Text("Opens: \(hook)").font(.system(size: 12)).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                    }
                    if !beats.isEmpty {
                        FlowLayout(spacing: 6) {
                            ForEach(Array(beats.enumerated()), id: \.offset) { index, beat in
                                Text("\(index + 1) \(beat)").font(.system(size: 11)).padding(.horizontal, 8).padding(.vertical, 3)
                                    .background(Color(nsColor: .quaternaryLabelColor).opacity(0.35), in: Capsule())
                            }
                        }
                    }
                    if id == chosen { Label("Sent", systemImage: "checkmark").font(.system(size: 11)).foregroundStyle(.secondary) }
                }
                .padding(14)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(on ? Color.rasan : Color(nsColor: .separatorColor), lineWidth: on ? 2 : 0.5) }
        }
        .buttonStyle(PressableStyle())
        .disabled(!model.canAct(on: step))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(option["title"].string ?? id). \(option["logline"].string ?? "")\(id == recommended ? " Claude recommends this." : "")")
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - Scenes

struct ScenesPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var rows: [JSONRow] = []
    @State private var seeded: JSONValue?

    private static let rowHeight: CGFloat = 104
    private var payload: JSONValue { model.payload(step) }
    private var transitions: [String] {
        payload["transitions"].array.compactMap { $0.string }.nonEmpty
            ?? ["cut", "crossfade", "blur-crossfade", "push-slide LEFT", "push-slide UP", "zoom-through", "squeeze"]
    }
    private var defaultTransition: String { payload["transition_default"].string ?? "cut" }
    private var narrated: Bool { if case .bool(let value) = payload["narrated"] { return value }; return true }
    private var total: Double { rows.reduce(0) { $0 + ($1.number("duration") ?? 0) } }
    private var target: Double? { payload["target_s"].number }

    var body: some View {
        if payload["scenes"].array.isEmpty && rows.isEmpty {
            PanelEmpty(symbol: "list.number", text: "The scene list appears here: every scene's on-screen text, voiceover, length, transition and intensity, editable before anything is built.")
        } else {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    StageSectionTitle("Timeline")
                    Spacer()
                    Text("\(rows.count) scenes · \(secondsText(total))" + (target.map { " (target \(Int($0)) s)" } ?? ""))
                        .font(.system(size: 12, weight: off ? .semibold : .regular)).foregroundStyle(off ? Color.orange : Color.secondary).monospacedDigit()
                }
                strip
                headerRow
                List {
                    ForEach($rows) { $row in
                        sceneRow($row).listRowSeparator(.visible).frame(height: Self.rowHeight)
                    }
                    .onMove { rows.move(fromOffsets: $0, toOffset: $1) }
                }
                .listStyle(.inset(alternatesRowBackgrounds: true))
                .scrollDisabled(true).scrollContentBackground(.hidden)
                .frame(height: CGFloat(max(rows.count, 1)) * (Self.rowHeight + 9) + 20)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                HStack {
                    Button { rows.append(JSONRow(.object(["title": .string("New scene"), "on_screen": .string(""), "visual": .string(""), "voiceover": .string(""),
                                                           "duration": .number(3), "transition_in": .string(defaultTransition == "cut" ? "crossfade" : defaultTransition), "intensity": .string("")]))) }
                    label: { Label("Add scene", systemImage: "plus") }.disabled(!model.canAct(on: step))
                    Spacer()
                    Text("Drag a row to reorder").font(.system(size: 11)).foregroundStyle(.tertiary)
                }
            }
            .stepPrimary("Approve this scene list", symbol: "checkmark", enabled: !rows.isEmpty) { note in
                let scenes = rows.map { row -> JSONValue in
                    var fields = row.fields
                    fields["duration"] = .number(row.number("duration") ?? 0)
                    return .object(fields)
                }
                Task { await model.send(step: step, type: "submit", value: .object(["scenes": .array(scenes)]), note: note) }
            }
            .onAppear { seed() }
            .onChange(of: payload) { seed() }
        }
    }

    private var off: Bool { if let target { abs(total - target) > max(1, target * 0.05) } else { false } }

    private func seed() {
        guard seeded != payload else { return }
        seeded = payload
        rows = payload["scenes"].array.enumerated().map { index, scene in
            var row = JSONRow(scene)
            if index > 0, row.string("transition_in").isEmpty { row.fields["transition_in"] = .string(defaultTransition) }
            return row
        }
    }

    // MARK: Strip

    private var strip: some View {
        GeometryReader { proxy in
            let gap: CGFloat = 3
            let usable = max(10, proxy.size.width - gap * CGFloat(max(rows.count - 1, 0)))
            let sum = max(total, 0.1)
            HStack(spacing: gap) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    let seconds = row.number("duration") ?? 0
                    ZStack(alignment: .topLeading) {
                        RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color.rasan.opacity(0.22 + 0.08 * Double(index % 3)))
                        if let thumb = row.fields["thumb"]?.string {
                            Color.clear.overlay { PayloadImage(path: thumb, contentMode: .fill, maxPixels: 400).opacity(0.45) }.clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(index + 1) \(row.string("title"))").font(.system(size: 10, weight: .semibold)).lineLimit(1)
                            Text("\(seconds.rounded() == seconds ? String(Int(seconds)) : String(format: "%.1f", seconds)) s").font(.system(size: 9.5)).foregroundStyle(.secondary).monospacedDigit()
                        }
                        .padding(.horizontal, 6).padding(.top, 4)
                        if index > 0, row.string("transition_in") != "cut" {
                            Image(systemName: "diamond.fill").font(.system(size: 7)).foregroundStyle(Color.rasan)
                                .offset(x: -5, y: 34).help(row.string("transition_in"))
                        }
                    }
                    .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color.rasan.opacity(0.45), lineWidth: 0.75) }
                    .frame(width: max(22, usable * max(seconds, 0.1) / sum), height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
        }
        .frame(height: 50)
        .animation(.smooth(duration: 0.25), value: rows.map { $0.number("duration") })
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Timeline, \(rows.count) scenes, \(secondsText(total))")
    }

    private var headerRow: some View {
        HStack(spacing: 12) {
            Color.clear.frame(width: 50)
            Text("Scene").frame(width: 190, alignment: .leading)
            Text("On screen and what we see").frame(maxWidth: .infinity, alignment: .leading)
            Text("Voiceover").frame(maxWidth: .infinity, alignment: .leading)
            Text("Sec").frame(width: 56, alignment: .leading)
            Color.clear.frame(width: 26)
        }
        .font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
        .padding(.horizontal, 20)
    }

    private func sceneRow(_ row: Binding<JSONRow>) -> some View {
        let value = row.wrappedValue
        let index = rows.firstIndex { $0.id == value.id } ?? 0
        return HStack(alignment: .center, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "line.3.horizontal").foregroundStyle(.tertiary).accessibilityHidden(true)
                Text(String(format: "%02d", index + 1)).font(.system(size: 12, weight: .semibold, design: .monospaced)).foregroundStyle(.secondary)
            }.frame(width: 50, alignment: .leading)
            VStack(alignment: .leading, spacing: 6) {
                TextField("Scene name", text: row.text("title")).textFieldStyle(.roundedBorder).font(.system(size: 13, weight: .semibold))
                    .accessibilityLabel("Title of scene \(index + 1)")
                HStack(spacing: 6) {
                    if index > 0 {
                        Picker("Transition into scene \(index + 1)", selection: Binding(get: { value.string("transition_in").isEmpty ? defaultTransition : value.string("transition_in") },
                                                                                    set: { row.wrappedValue.fields["transition_in"] = .string($0) })) {
                            ForEach(transitions + (transitions.contains(value.string("transition_in")) || value.string("transition_in").isEmpty ? [] : [value.string("transition_in")]), id: \.self) { Text($0).tag($0) }
                        }.labelsHidden().controlSize(.small).help("Transition into this scene")
                    } else {
                        Text("Opens the film").font(.system(size: 11)).foregroundStyle(.tertiary)
                    }
                    Picker("Intensity", selection: row.text("intensity")) {
                        Text("Intensity").tag(""); Text("Low").tag("low"); Text("Medium").tag("medium"); Text("High").tag("high")
                    }.labelsHidden().controlSize(.small).frame(width: 84).help("Intensity")
                }
            }.frame(width: 190)
            VStack(spacing: 6) {
                TextField("On-screen text", text: row.text("on_screen"), axis: .vertical).lineLimit(1...2).textFieldStyle(.roundedBorder)
                    .accessibilityLabel("On-screen text of scene \(index + 1)")
                TextField("What we see", text: row.text("visual"), axis: .vertical).lineLimit(1...2).textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Visual of scene \(index + 1)")
            }.frame(maxWidth: .infinity)
            TextField(narrated ? "Voiceover line" : "(no narration)", text: row.text("voiceover"), axis: .vertical)
                .lineLimit(2...4).textFieldStyle(.roundedBorder).disabled(!narrated).frame(maxWidth: .infinity)
                .accessibilityLabel("Voiceover of scene \(index + 1)")
            NumberField(title: "Seconds for scene \(index + 1)", value: row.number("duration"), width: 56)
            Button(role: .destructive) { rows.removeAll { $0.id == value.id } } label: { Image(systemName: "minus.circle") }
                .buttonStyle(.borderless).disabled(rows.count <= 2).help("Remove scene").accessibilityLabel("Remove scene \(index + 1)")
        }
        .disabled(!model.canAct(on: step))
    }
}
