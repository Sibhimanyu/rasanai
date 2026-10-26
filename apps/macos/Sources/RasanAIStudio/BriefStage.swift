import AppKit
import StudioCore
import SwiftUI

/// Call 01, confirm the brief: one editable sentence with inline menus, what Claude found, and what it will use.
struct BriefStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    /// The person's edits; nil until they change something, so Claude's updated push still shows through.
    @State private var draft: [String: JSONValue]?
    @State private var editingSubject = false
    /// The person's pick in the format picker; nil until they choose, so the director's own `format` shows through.
    @State private var picked: FormatPick?
    @State private var changingFormat = false
    /// With no format yet the 12-tile list stays folded behind "Choose a format" until the person asks for it.
    @State private var formatRequested = false
    @State private var showResearch = false
    @State private var selectedCapture = 0
    @FocusState private var subjectFocused: Bool

    private var payload: JSONValue { model.payload(step) }
    private var fields: [String: JSONValue] { draft ?? payload["fields"].object }
    private var choices: JSONValue { payload["choices"] }
    /// The intake box shows until there is a subject (a `needs_source` push, an empty subject, or a fresh brief).
    private var needsSource: Bool { (fields["subject"]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    /// The director asked what the video is about, so the answer also goes back as `source`.
    private var sourceWasAsked: Bool { payload["needs_source"].bool == true || (payload["fields"]["subject"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var catalog: FormatCatalog? { FormatCatalog.installed }
    /// The format in force: the person's pick, else what the brief carries (fields, then the director's push).
    private var format: FormatPick? {
        picked ?? FormatPick(json: fields["format"] ?? .null) ?? FormatPick(json: payload["format"])
    }
    private var formatOption: FormatCatalog.Option? { catalog?.option(format?.option) }
    /// The format picker replaces the old kind menu, except when the director narrowed the kinds itself and picked no format.
    private var usesFormatPicker: Bool { catalog != nil && (format != nil || choices["kind"].array.isEmpty) }
    private var subjectPlaceholder: String { formatOption.flatMap { catalog?.subjectPrompt(for: $0) } ?? "what it's about, a link or a topic" }
    private var canAct: Bool { model.canAct(on: step) && !(model.hasSent(step) && model.status(step) != "done") }

    @Environment(\.crewCharacter) private var character

    var body: some View {
        let findings = payload["findings"].array
        let captures = payload["captures"].array
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                header
                StudioAdaptiveColumns(railWidth: 348, railFirst: false, breakpoint: 1000, gap: 32, stackSpacing: 32) {
                    agreement
                    evidencePanel(captures: captures, findings: findings)
                }
                .onAppear {
                    if needsSource && model.canAct(on: step) { editingSubject = true; subjectFocused = true }
                }
            }
            .padding(.bottom, Workspace.barReserve)   // clears the floating bottom bar
            .frame(maxWidth: 1180, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BriefActions(model: model, step: step, canAct: canAct,
                         start: { submit(thenDecideRest: false) },
                         justMakeIt: { submit(thenDecideRest: true) },
                         startEnabled: !needsSource && formatOption?.status != .soon)
        }
    }

    /// A compact title row: a small crew member and the title as plain large text, left-aligned with the content below.
    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            if let character {
                CrewStage(character: character, mode: .ask, unit: 56)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Here's the film we'll make.")
                    .font(.system(size: 28, weight: .semibold)).tracking(-0.5)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let context = payload["context"].string, !context.isEmpty {
                    Text(context).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Creative agreement

    private var agreement: some View {
        VStack(alignment: .leading, spacing: 32) {
            sentenceBlock
            VStack(alignment: .leading, spacing: 16) {
                StageSectionTitle("Details")
                detailsGrid.padding(Workspace.panelPadding).frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
                if usesFormatPicker, let catalog { formatSection(catalog) }
            }
        }
    }

    private var sentenceBlock: some View {
        VStack(alignment: .leading, spacing: 16) {
            StageSectionTitle("The idea")
            BriefFlow(spacing: 0, lineSpacing: 8) { sentenceTokens }
                .frame(maxWidth: .infinity, alignment: .leading)
                .font(.system(size: 22, weight: .regular))
                .accessibilityElement(children: .contain)
            if canAct {
                Text(needsSource ? "Say what the film is about, then confirm." : "Highlighted words can be changed.")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The same brief fields as the sentence, named, so each one can be changed without reading for the highlighted word.
    private var detailsGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 16, alignment: .top)], alignment: .leading, spacing: 16) {
            if usesFormatPicker { formatField } else { fieldMenu("Format", key: "kind", fallback: .string("launch film"), options: kindOptions, display: { Self.soften($0.string ?? "launch film") }) }
            fieldMenu("Length", key: "length_s", fallback: .number(45), options: lengthOptions, display: { "\(Int($0.number ?? 45))-second" })
            fieldMenu("Shape", key: "aspect", fallback: .string("16:9"), options: shapeOptions, display: { Self.aspectLabel($0.string ?? "16:9") })
            fieldMenu("Destination", key: "destination", fallback: .string("the website"), options: destinationOptions, display: { Self.soften($0.string ?? "the website") })
            fieldMenu("Voiceover", key: "narration", fallback: .bool(true), options: narrationOptions, display: { Self.narrationText($0) })
            if let brand = fields["brand_name"]?.string, !brand.isEmpty {
                fieldMenu("Brand", key: "use_brand", fallback: .bool(true), options: brandOptions(brand),
                          display: { $0.bool == false ? "A new look" : "\(brand)'s own colours and type" })
            }
        }
    }

    private var formatField: some View {
        let text = format == nil ? "Choose a format" : (formatOption?.kind ?? fields["kind"]?.string ?? "Film")
        return BriefFieldFrame(label: "Format") {
            Button { if format == nil { formatRequested = true } else { changingFormat.toggle() } } label: {
                BriefFieldValue(text: text, enabled: canAct)
            }
            .buttonStyle(.plain).disabled(!canAct)
            .accessibilityLabel("Format: \(text)").accessibilityHint("Opens the list of formats")
        }
    }

    private func formatSection(_ catalog: FormatCatalog) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            if format == nil && !formatRequested {
                Button { formatRequested = true } label: { Label("Choose a format", systemImage: "square.grid.2x2") }
                    .controlSize(.regular).disabled(!canAct)
                    .help("Pick the kind of film. Optional: the director chooses one if you don't.")
            } else {
                FormatPickerView(catalog: catalog, pick: format, canAct: canAct,
                                 onPick: pickFormat, onScope: { scope in
                    guard var current = format else { return }
                    current.scope = scope; picked = current
                }, changing: $changingFormat)
            }
            if let option = formatOption, option.status != .soon {
                FormatInputsNote(catalog: catalog, option: option, requiredOnly: true)
                if catalog.inputSlots(for: option).contains(where: { !$0.required }) {
                    DisclosureGroup("Other useful materials") {
                        FormatInputsNote(catalog: catalog, option: option, optionalOnly: true).padding(.top, 8)
                    }
                    .font(.system(size: 12))
                }
            }
        }
    }

    // MARK: Evidence

    /// Real captures and findings from the payload. Nothing is drawn when the director has gathered nothing yet.
    private func evidencePanel(captures: [JSONValue], findings: [JSONValue]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("What we're working with").font(.system(size: 15, weight: .semibold)).accessibilityAddTraits(.isHeader)
            if captures.isEmpty && findings.isEmpty {
                Label("Nothing gathered yet. Captures and findings appear here when the director has them.", systemImage: "photo.on.rectangle")
                    .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if !captures.isEmpty { captureGallery(captures) }
            if !findings.isEmpty {
                DisclosureGroup(isExpanded: $showResearch) {
                    findingsList(findings).padding(.top, 10)
                } label: {
                    (Text("Research and sources").font(.system(size: 13, weight: .medium))
                     + Text("  \(findings.count) finding\(findings.count == 1 ? "" : "s")").font(.system(size: 12)).foregroundColor(.secondary))
                }
            }
        }
        .padding(Workspace.panelPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .workspacePanel()
    }

    @ViewBuilder private var sentenceTokens: some View {
        word("A ")
        menu("Length", key: "length_s", fallback: .number(45),
             options: lengthOptions,
             display: { "\(Int($0.number ?? 45))-second" })
        word(" ")
        if usesFormatPicker { formatToken } else {
            menu("Kind", key: "kind", fallback: .string("launch film"),
                 options: kindOptions,
                 display: { Self.soften($0.string ?? "launch film") })
        }
        word(" for ")
        subjectTokens
        word(", ")
        menu("Shape", key: "aspect", fallback: .string("16:9"),
             options: shapeOptions,
             display: { Self.aspectLabel($0.string ?? "16:9") })
        word(" for ")
        menu("Destination", key: "destination", fallback: .string("the website"),
             options: destinationOptions,
             display: { Self.soften($0.string ?? "the website") })
        word(", ")
        menu("Narration", key: "narration", fallback: .bool(true),
             options: narrationOptions, display: { Self.narrationText($0) })
        if let brand = fields["brand_name"]?.string, !brand.isEmpty {
            word(", ")
            menu("Brand", key: "use_brand", fallback: .bool(true),
                 options: brandOptions(brand),
                 display: { $0.bool == false ? "in a new look" : "in \(brand)'s own colours and type" })
        }
        word(".")
    }

    /// The kind noun in the sentence ("launch film"); pressing it opens the format list below.
    private var formatToken: some View {
        let text = Self.soften(formatOption?.kind ?? fields["kind"]?.string ?? "film")
        return Button { if format == nil { formatRequested = true } else { changingFormat.toggle() } } label: {
            Text(text).lineLimit(1).truncationMode(.tail).foregroundStyle(Color.rasan).padding(.horizontal, 8).padding(.vertical, 1)
                .frame(maxWidth: 280, alignment: .leading)
                .background(Color.rasan.opacity(canAct ? 0.10 : 0), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .help(text)
        .buttonStyle(.plain).fixedSize().disabled(!canAct)
        .accessibilityLabel("Kind: \(text)").accessibilityHint("Opens the list of formats")
    }

    /// Picks an option: its noun becomes `kind`, and length and shape move to its defaults unless already changed.
    private func pickFormat(_ option: FormatCatalog.Option) {
        guard let catalog else { return }
        var scratch = FilmDraft(duration: Int(fields["length_s"]?.number ?? 45), aspect: fields["aspect"]?.string ?? "16:9")
        catalog.pick(option, in: &scratch, previous: formatOption)
        var next = fields
        next["kind"] = .string(option.kind)
        next["length_s"] = .number(Double(scratch.duration))
        next["aspect"] = .string(scratch.aspect)
        next["format"] = scratch.format?.json
        draft = next
        picked = scratch.format
    }

    /// Plain words, one token each so the sentence wraps like text.
    @ViewBuilder private func word(_ text: String) -> some View {
        let words = text.split(separator: " ", omittingEmptySubsequences: false)
        ForEach(Array(words.enumerated()), id: \.offset) { index, piece in
            let trailing = index < words.count - 1
            if !piece.isEmpty || trailing {
                Text(String(piece) + (trailing ? " " : ""))
                    .foregroundStyle(.primary).padding(.vertical, 2).accessibilityHidden(true)
                    .layoutValue(key: BriefGlue.self, value: piece.hasPrefix(",") || piece.hasPrefix("."))
            }
        }
    }

    @ViewBuilder private var subjectTokens: some View {
        let subject = (fields["subject"]?.string ?? "")
        if editingSubject && canAct {
            TextField(subjectPlaceholder, text: Binding(get: { subject }, set: { set("subject", .string($0)) }), axis: .vertical)
                .textFieldStyle(.plain).focused($subjectFocused)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.8), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.rasan.opacity(0.7), lineWidth: 1.5) }
                .onSubmit { editingSubject = false }
                .onChange(of: subjectFocused) { _, focused in if !focused && !needsSource { editingSubject = false } }
                .padding(.vertical, 2)
                .accessibilityLabel("Subject")
        } else {
            let pieces = subject.isEmpty ? ["your", "product"] : subject.split(separator: " ").map(String.init)
            ForEach(Array(pieces.enumerated()), id: \.offset) { index, piece in
                // A button, so the subject can be reached and opened from the keyboard; only the first word takes focus.
                Button { editingSubject = true; subjectFocused = true } label: {
                    Text(piece + (index < pieces.count - 1 ? " " : ""))
                        .foregroundStyle(subject.isEmpty ? Color.secondary : Color.rasan)
                        .padding(.vertical, 2)
                        .background(alignment: .bottom) { Rectangle().fill(Color.rasan.opacity(canAct ? 0.3 : 0)).frame(height: 1).offset(y: 1) }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain).disabled(!canAct).focusable(index == 0)
                .hoverCursor(.pointingHand, enabled: canAct)
                .accessibilityHidden(index != 0)
                .accessibilityLabel("Subject: \(subject.isEmpty ? "empty" : subject)")
            }
        }
    }

    private var lengthOptions: [BriefOption] {
        options("length_s", defaults: [15, 30, 45, 60, 90, 120].map { .number(Double($0)) }) { "\($0.number.map { String(Int($0)) } ?? $0.identifier ?? "")-second" }
    }
    private var kindOptions: [BriefOption] {
        options("kind", defaults: ["launch film", "explainer", "brand film", "feature reveal", "social teaser", "product demo"].map(JSONValue.string)) { $0.string ?? "" }
    }
    private var shapeOptions: [BriefOption] {
        options("aspect", defaults: ["16:9", "9:16", "1:1"].map(JSONValue.string)) { Self.aspectLabel($0.string ?? "") }
    }
    private var destinationOptions: [BriefOption] {
        options("destination", defaults: ["the website", "X", "LinkedIn", "YouTube", "Instagram Reels", "TikTok", "a keynote"].map(JSONValue.string)) { $0.string ?? "" }
    }
    private func brandOptions(_ brand: String) -> [BriefOption] {
        [.bool(true), .bool(false)].map { BriefOption(value: $0, label: $0.bool == true ? "in \(brand)'s own colours and type" : "in a new look") }
    }

    /// The options with the current value kept in the list, and the binding that writes the pick back into the draft.
    private func resolved(key: String, fallback: JSONValue, options: [BriefOption], display: (JSONValue) -> String)
        -> (options: [BriefOption], text: String, selection: Binding<Int>) {
        let current = fields[key] ?? fallback
        var all = options
        if !all.contains(where: { $0.value == current }) { all.insert(BriefOption(value: current, label: display(current)), at: 0) }
        let selection = Binding<Int>(get: { all.firstIndex { $0.value == current } ?? 0 }, set: { set(key, all[$0].value) })
        return (all, display(current), selection)
    }

    private func menu(_ title: String, key: String, fallback: JSONValue, options: [BriefOption],
                      display: @escaping (JSONValue) -> String) -> some View {
        let r = resolved(key: key, fallback: fallback, options: options, display: display)
        return BriefMenuToken(title: title, text: r.text, enabled: canAct, options: r.options.map(\.label), selection: r.selection)
    }

    private func fieldMenu(_ title: String, key: String, fallback: JSONValue, options: [BriefOption],
                           display: @escaping (JSONValue) -> String) -> some View {
        let r = resolved(key: key, fallback: fallback, options: options, display: display)
        return BriefFieldFrame(label: title) {
            Menu {
                Picker(title, selection: r.selection) {
                    ForEach(Array(r.options.map(\.label).enumerated()), id: \.offset) { index, label in Text(label).tag(index) }
                }
                .pickerStyle(.inline).labelsHidden()
            } label: {
                BriefFieldValue(text: r.text, enabled: canAct)
            }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden)
            .disabled(!canAct)
            .help(r.text)
            .accessibilityLabel("\(title): \(r.text)")
            .accessibilityHint("Opens a menu to change it")
        }
    }


    private func options(_ key: String, defaults: [JSONValue], label: @escaping (JSONValue) -> String) -> [BriefOption] {
        let given = choices[key].array
        if given.isEmpty { return defaults.map { BriefOption(value: $0, label: label($0)) } }
        return given.map { item in
            if case .object(let o) = item, let value = o["value"] { return BriefOption(value: value, label: o["label"]?.string ?? label(value)) }
            return BriefOption(value: item, label: label(item))
        }
    }

    private var narrationOptions: [BriefOption] {
        let given = choices["narration"].array
        if given.isEmpty { return [.bool(true), .bool(false)].map { BriefOption(value: $0, label: Self.narrationText($0)) } }
        return given.map { item in
            if case .object(let o) = item, let value = o["value"] { return BriefOption(value: value, label: o["label"]?.string ?? Self.narrationText(value)) }
            return BriefOption(value: item, label: Self.narrationText(item))
        }
    }

    private func set(_ key: String, _ value: JSONValue) {
        var next = fields
        next[key] = value
        draft = next
    }

    // MARK: Findings and captures

    /// The first capture large, the rest as thumbnails that swap it in. Files and captions come from the payload.
    private func captureGallery(_ captures: [JSONValue]) -> some View {
        let index = min(max(0, selectedCapture), captures.count - 1)
        let shown = captures[index]
        let caption = shown["caption"].string ?? ""
        return VStack(alignment: .leading, spacing: 16) {
            ZStack {
                Rectangle().fill(Workspace.raised)
                PayloadImage(path: shown["image"].string ?? shown.string, contentMode: .fit, maxPixels: 1200)
            }
            .aspectRatio(16.0 / 10.0, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(caption.isEmpty ? "Capture \(index + 1) of \(captures.count)" : "Capture: \(caption)")
            if !caption.isEmpty {
                Text(caption).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
            if captures.count > 1 {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(Array(captures.enumerated()), id: \.offset) { offset, capture in
                            Button { selectedCapture = offset } label: {
                                PayloadImage(path: capture["image"].string ?? capture.string, contentMode: .fill, maxPixels: 300)
                                    .frame(width: 56, height: 56)
                                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    .overlay {
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .strokeBorder(offset == index ? Color.rasan : Workspace.hairline, lineWidth: offset == index ? 2 : 1)
                                    }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(capture["caption"].string.map { "Show capture: \($0)" } ?? "Show capture \(offset + 1)")
                            .accessibilityAddTraits(offset == index ? [.isButton, .isSelected] : .isButton)
                        }
                    }
                    .padding(2)
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private func findingsList(_ findings: [JSONValue]) -> some View {
        VStack(spacing: 0) {
            let shown = Array(findings.prefix(6).enumerated())
            ForEach(shown, id: \.offset) { index, finding in
                let text = finding["text"].string ?? finding.string ?? ""
                let source = finding["source"].string ?? ""
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(index + 1)").font(.system(size: 11, weight: .semibold, design: .rounded)).monospacedDigit()
                            .foregroundStyle(Color.rasan).frame(width: 18, height: 18)
                            .background(Color.rasan.opacity(0.12), in: Circle())
                        Text(text).font(.system(size: 13)).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if !source.isEmpty { BriefSourceChip(source: source).padding(.leading, 28) }
                }
                .padding(.vertical, 10)
                if index < shown.count - 1 { Divider().opacity(0.7) }
            }
        }
    }

    // MARK: Submit

    private func submit(thenDecideRest: Bool) {
        var value = fields
        let subject = (value["subject"]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        value["subject"] = .string(subject)
        // What the sentence shows by default is what gets sent (the director sees the same words the person read).
        for (key, fallback) in [("length_s", JSONValue.number(45)), ("kind", .string("launch film")), ("aspect", .string("16:9")),
                                ("destination", .string("the website")), ("narration", .bool(true))] where value[key] == nil || value[key] == .null {
            value[key] = fallback
        }
        if let format, let option = formatOption {
            // The pick goes back as `format`; `kind` stays for directors that read only it.
            value["format"] = format.json
            value["kind"] = .string(option.kind)
        }
        if sourceWasAsked { value["source"] = .string(subject) }
        Task {
            let ok = await model.send(step: step, type: "submit", value: .object(value))
            if ok && thenDecideRest { await model.justMakeIt() }
        }
    }

    // MARK: Wording

    /// "Product launch" reads better mid-sentence as "product launch"; "YouTube" and "X" stay as written.
    static func soften(_ text: String) -> String {
        guard let first = text.first, first.isUppercase, text.count > 1, text.dropFirst().allSatisfy({ !$0.isUppercase }) else { return text }
        return first.lowercased() + text.dropFirst()
    }
    static func aspectLabel(_ value: String) -> String {
        switch value { case "16:9": "landscape (16:9)"; case "9:16": "portrait (9:16)"; case "1:1": "square (1:1)"; case "4:5": "4:5 (feed)"; default: value }
    }
    static func narrationText(_ value: JSONValue) -> String {
        if let b = value.bool { return b ? "with voiceover" : "without voiceover" }
        let text = value.string ?? "with voiceover"
        let lower = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        // A bare "none"/"off" would read "with none".
        if ["none", "off", "no", "false", ""].contains(lower) { return "without voiceover" }
        if lower.hasPrefix("with") || lower.hasPrefix("no ") || lower.hasPrefix("without") { return lower }
        return "with " + lower
    }
}

// MARK: Pieces

private struct BriefOption { var value: JSONValue; var label: String }

/// A highlighted, tappable part of the sentence that opens a native menu.
private struct BriefMenuToken: View {
    let title: String
    let text: String
    let enabled: Bool
    let options: [String]
    @Binding var selection: Int
    @State private var hovering = false

    var body: some View {
        Menu {
            Picker(title, selection: $selection) {
                ForEach(Array(options.enumerated()), id: \.offset) { index, label in Text(label).tag(index) }
            }
            .pickerStyle(.inline).labelsHidden()
        } label: {
            Text(text)
                .lineLimit(1).truncationMode(.tail)
                .foregroundStyle(Color.rasan)
                .padding(.horizontal, 8).padding(.vertical, 1)
                .frame(maxWidth: 280, alignment: .leading)
                .background(Color.rasan.opacity(hovering && enabled ? 0.18 : (enabled ? 0.10 : 0)), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .help(text)
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden)
        .fixedSize()
        .disabled(!enabled)
        .onHover { hovering = $0 }
        .animation(.snappy(duration: 0.15), value: hovering)
        .padding(.horizontal, 1)
        .accessibilityLabel("\(title): \(text)")
        .accessibilityHint("Opens a menu to change it")
    }
}

/// A named slot above an editable value.
private struct BriefFieldFrame<Content: View>: View {
    let label: String
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The boxed value of a field; a chevron marks it as editable.
private struct BriefFieldValue: View {
    let text: String
    let enabled: Bool
    var body: some View {
        HStack(spacing: 8) {
            Text(text).font(.system(size: 14)).foregroundStyle(.primary).lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 4)
            if enabled { Image(systemName: "chevron.up.chevron.down").font(.system(size: 9, weight: .semibold)).foregroundStyle(.tertiary) }
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 36)
        .background(Workspace.raised, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
        .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// A finding's source. Links and domains open in the browser; anything else is plain text.
private struct BriefSourceChip: View {
    let source: String
    @State private var hovering = false

    private var url: URL? {
        let trimmed = source.trimmingCharacters(in: .whitespaces)
        if let u = URL(string: trimmed), ["http", "https"].contains(u.scheme?.lowercased() ?? "") { return u }
        if !trimmed.contains(" "), trimmed.contains("."), let u = URL(string: "https://" + trimmed) { return u }
        return nil
    }
    private var label: String {
        if let sourceURL = URL(string: source), ["http", "https"].contains(sourceURL.scheme?.lowercased() ?? ""), let host = sourceURL.host {
            return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        }
        return source
    }

    var body: some View {
        if let url {
            Button { SafeOpen.open(url) } label: { chip(arrow: true) }
                .buttonStyle(.plain).onHover { hovering = $0 }
                .help("Open \(url.absoluteString) in your browser")
                .accessibilityLabel("Source: \(label). Opens in browser.")
        } else {
            chip(arrow: false).accessibilityLabel("Source: \(label)")
        }
    }
    private func chip(arrow: Bool) -> some View {
        HStack(spacing: 4) {
            Text(label).lineLimit(1)
            if arrow { Image(systemName: "arrow.up.right").font(.system(size: 8, weight: .bold)) }
        }
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(hovering ? Color.rasan : Color.secondary)
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(Color(nsColor: .quaternaryLabelColor).opacity(hovering ? 0.6 : 0.35), in: Capsule())
    }
}

/// The brief's actions, published to the status bar: "Just make it" and "Confirm brief". Draws nothing itself.
private struct BriefActions: View {
    let model: FilmSessionModel
    let step: String
    let canAct: Bool
    let start: () -> Void
    let justMakeIt: () -> Void
    let startEnabled: Bool

    var body: some View {
        FilmActionsPublisher(actions: model.showsActions(for: step) ? FilmActions(
            step: step, primaryTitle: "Confirm brief", primarySymbol: "checkmark", primaryEnabled: startEnabled,
            secondaryTitle: "Decide the rest for me", secondaryHelp: "Confirm the brief and let the director pick the script, the look and the music. You'll see only the finished film.",
            secondaryEnabled: startEnabled, onPrimary: { note in model.noteThen(step: step, note, start) },
            onSecondary: { note in model.noteThen(step: step, note, justMakeIt) }) : nil)
    }
}

/// Lays tokens out like running text: left to right, wrapping at the width. Wide items (the subject field) are
/// offered the full row so they wrap inside it.
private struct BriefGlue: LayoutValueKey { static let defaultValue = false }

private struct BriefFlow: Layout {
    var spacing: CGFloat = 0
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? 700, subviews: subviews).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(width: bounds.width, subviews: subviews)
        for (index, frame) in result.frames.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                                  proposal: ProposedViewSize(width: frame.width, height: frame.height))
        }
    }
    private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        var frames: [CGRect] = []
        for view in subviews {
            var size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
            size.width = min(size.width, width)
            if x > 0 && x + size.width > width + 0.5 {
                // Punctuation stays attached to the word before it: move that word down with it.
                if view[BriefGlue.self], let last = frames.last, last.minY == y, last.minX > 0 {
                    let newY = y + rowHeight + lineSpacing
                    frames[frames.count - 1] = CGRect(origin: CGPoint(x: 0, y: newY), size: last.size)
                    x = last.width + spacing; y = newY; rowHeight = last.height
                } else { x = 0; y += rowHeight + lineSpacing; rowHeight = 0 }
            }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            x += size.width + spacing; rowHeight = max(rowHeight, size.height); maxX = max(maxX, x - spacing)
        }
        return (CGSize(width: maxX, height: y + rowHeight), frames)
    }
}
