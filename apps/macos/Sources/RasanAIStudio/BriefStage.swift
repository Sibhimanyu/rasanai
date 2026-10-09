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
    @State private var appeared = false
    @FocusState private var subjectFocused: Bool

    private var payload: JSONValue { model.payload(step) }
    private var fields: [String: JSONValue] { draft ?? payload["fields"].object }
    private var choices: JSONValue { payload["choices"] }
    /// The intake box shows until there is a subject (a `needs_source` push, an empty subject, or a fresh brief).
    private var needsSource: Bool { (fields["subject"]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    /// The director asked what the video is about, so the answer also goes back as `source`.
    private var sourceWasAsked: Bool { payload["needs_source"].bool == true || (payload["fields"]["subject"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var canAct: Bool { model.canAct(on: step) && !(model.hasSent(step) && model.status(step) != "done") }

    var body: some View {
        StageScaffold(model: model, step: step,
                      question: payload["question"].string ?? "Here's what we're making",
                      context: payload["context"].string,
                      maxWidth: 1000) {
            VStack(alignment: .leading, spacing: 24) {
                sentenceCard
                    .opacity(appeared ? 1 : 0).offset(y: appeared ? 0 : 10)
                let findings = payload["findings"].array
                let captures = payload["captures"].array
                if !captures.isEmpty {
                    captureStrip(captures)
                        .opacity(appeared ? 1 : 0).offset(y: appeared ? 0 : 14)
                        .animation(.smooth(duration: 0.5).delay(0.08), value: appeared)
                }
                if !findings.isEmpty {
                    findingsList(findings)
                        .opacity(appeared ? 1 : 0).offset(y: appeared ? 0 : 14)
                        .animation(.smooth(duration: 0.5).delay(0.16), value: appeared)
                }
            }
            .animation(.smooth(duration: 0.45), value: appeared)
            .onAppear {
                appeared = true
                if needsSource && model.canAct(on: step) { editingSubject = true; subjectFocused = true }
            }
        } actions: {
            BriefActions(model: model, step: step, canAct: canAct,
                         start: { submit(thenDecideRest: false) },
                         justMakeIt: { submit(thenDecideRest: true) },
                         startEnabled: !needsSource)
        }
    }

    // MARK: Sentence

    private var sentenceCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            BriefFlow(spacing: 0, lineSpacing: 6) { sentenceTokens }
                .font(.system(size: 28, weight: .regular, design: .serif))
                .lineSpacing(4)
                .accessibilityElement(children: .contain)
            if canAct {
                Label(needsSource ? "Say what the film is about, then start." : "Click any highlighted part to change it.", systemImage: "hand.tap")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 28).padding(.vertical, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.regularMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(LinearGradient(colors: [Color.rasan.opacity(0.10), .clear], startPoint: .topLeading, endPoint: .bottomTrailing))
                }
        }
        .overlay { RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
        .shadow(color: .black.opacity(0.08), radius: 18, y: 8)
    }

    @ViewBuilder private var sentenceTokens: some View {
        word("A ")
        menu("Length", key: "length_s", fallback: .number(45),
             options: options("length_s", defaults: [15, 30, 45, 60, 90].map { .number(Double($0)) }) { "\($0.number.map { String(Int($0)) } ?? $0.identifier ?? "")-second" },
             display: { "\(Int($0.number ?? 45))-second" })
        word(" ")
        menu("Kind", key: "kind", fallback: .string("launch film"),
             options: options("kind", defaults: ["launch film", "explainer", "brand film", "feature reveal", "social teaser", "product demo"].map(JSONValue.string)) { $0.string ?? "" },
             display: { Self.soften($0.string ?? "launch film") })
        word(" for ")
        subjectTokens
        word(", ")
        menu("Aspect ratio", key: "aspect", fallback: .string("16:9"),
             options: options("aspect", defaults: ["16:9", "9:16", "1:1", "4:5"].map(JSONValue.string)) { Self.aspectLabel($0.string ?? "") },
             display: { $0.string ?? "16:9" })
        word(" for ")
        menu("Destination", key: "destination", fallback: .string("the website"),
             options: options("destination", defaults: ["the website", "X", "LinkedIn", "YouTube", "Instagram Reels", "TikTok", "a keynote"].map(JSONValue.string)) { $0.string ?? "" },
             display: { Self.soften($0.string ?? "the website") })
        word(", ")
        menu("Narration", key: "narration", fallback: .bool(true),
             options: narrationOptions, display: { Self.narrationText($0) })
        if let brand = fields["brand_name"]?.string, !brand.isEmpty {
            word(", ")
            menu("Brand", key: "use_brand", fallback: .bool(true),
                 options: [.bool(true), .bool(false)].map { BriefOption(value: $0, label: $0.bool == true ? "in \(brand)'s own colours and type" : "in a new look") },
                 display: { $0.bool == false ? "in a new look" : "in \(brand)'s own colours and type" })
        }
        word(".")
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
            TextField("what it's about, a link or a topic", text: Binding(get: { subject }, set: { set("subject", .string($0)) }), axis: .vertical)
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
                Text(piece + (index < pieces.count - 1 ? " " : ""))
                    .foregroundStyle(subject.isEmpty ? Color.secondary : Color.rasan)
                    .padding(.vertical, 2)
                    .background(alignment: .bottom) { Rectangle().fill(Color.rasan.opacity(canAct ? 0.45 : 0)).frame(height: 1.5).offset(y: 1) }
                    .contentShape(Rectangle())
                    .onTapGesture { if canAct { editingSubject = true; subjectFocused = true } }
                    .hoverCursor(.pointingHand, enabled: canAct)
                    .accessibilityHidden(index != 0)
                    .accessibilityLabel("Subject: \(subject.isEmpty ? "empty" : subject)")
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction { if canAct { editingSubject = true; subjectFocused = true } }
            }
        }
    }

    private func menu(_ title: String, key: String, fallback: JSONValue, options: [BriefOption],
                      display: @escaping (JSONValue) -> String) -> some View {
        let current = fields[key] ?? fallback
        var all = options
        if !all.contains(where: { $0.value == current }) { all.insert(BriefOption(value: current, label: display(current)), at: 0) }
        let selection = Binding<Int>(get: { all.firstIndex { $0.value == current } ?? 0 }, set: { set(key, all[$0].value) })
        return BriefMenuToken(title: title, text: display(current), enabled: canAct, options: all.map(\.label), selection: selection)
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

    private func captureStrip(_ captures: [JSONValue]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BriefSectionTitle("What I'll use", detail: "\(captures.count) capture\(captures.count == 1 ? "" : "s")")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 16) {
                    ForEach(Array(captures.enumerated()), id: \.offset) { _, capture in
                        let path = capture["image"].string ?? capture.string
                        let caption = capture["caption"].string ?? ""
                        VStack(alignment: .leading, spacing: 8) {
                            PayloadImage(path: path, contentMode: .fill, maxPixels: 900)
                                .frame(width: 208, height: 130)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.10), lineWidth: 0.5) }
                                .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.black.opacity(0.12), lineWidth: 0.5) }
                                .shadow(color: .black.opacity(0.16), radius: 10, y: 5)
                            if !caption.isEmpty {
                                Text(caption).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
                                    .frame(width: 208, alignment: .leading)
                            }
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(caption.isEmpty ? "Capture" : "Capture: \(caption)")
                    }
                }
                .padding(.vertical, 6).padding(.horizontal, 2)
            }
            .scrollClipDisabled()
        }
    }

    private func findingsList(_ findings: [JSONValue]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BriefSectionTitle("What I found")
            VStack(spacing: 0) {
                let shown = Array(findings.prefix(6).enumerated())
                ForEach(shown, id: \.offset) { index, finding in
                    let text = finding["text"].string ?? finding.string ?? ""
                    let source = finding["source"].string ?? ""
                    HStack(alignment: .firstTextBaseline, spacing: 14) {
                        Text("\(index + 1)").font(.system(size: 12, weight: .semibold, design: .rounded)).monospacedDigit()
                            .foregroundStyle(Color.rasan).frame(width: 20, height: 20)
                            .background(Color.rasan.opacity(0.12), in: Circle())
                        Text(text).font(.system(size: 14.5)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if !source.isEmpty { BriefSourceChip(source: source) }
                    }
                    .padding(.vertical, 12)
                    if index < shown.count - 1 { Divider().opacity(0.7) }
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 4)
            .background(Color(nsColor: .controlBackgroundColor).opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
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
        switch value { case "16:9": "16:9 (widescreen)"; case "9:16": "9:16 (vertical)"; case "1:1": "1:1 (square)"; case "4:5": "4:5 (feed)"; default: value }
    }
    static func narrationText(_ value: JSONValue) -> String {
        if let b = value.bool { return b ? "with voiceover" : "without voiceover" }
        let text = value.string ?? "with voiceover"
        let lower = text.lowercased()
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
                .foregroundStyle(Color.rasan)
                .padding(.horizontal, 7).padding(.vertical, 1)
                .background(Color.rasan.opacity(hovering && enabled ? 0.20 : (enabled ? 0.11 : 0)), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(alignment: .bottom) { Rectangle().fill(Color.rasan.opacity(enabled ? 0.5 : 0)).frame(height: 1.5).padding(.horizontal, 7).offset(y: 0) }
        }
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

private struct BriefSectionTitle: View {
    let text: String
    var detail: String?
    init(_ text: String, detail: String? = nil) { self.text = text; self.detail = detail }
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(text).font(.system(size: 17, weight: .semibold)).accessibilityAddTraits(.isHeader)
            if let detail { Text(detail).font(.system(size: 12)).foregroundStyle(.tertiary) }
        }
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

/// The bottom bar of the brief: Start and "Just make it".
private struct BriefActions: View {
    let model: FilmSessionModel
    let step: String
    let canAct: Bool
    let start: () -> Void
    let justMakeIt: () -> Void
    let startEnabled: Bool

    var body: some View {
        VStack(spacing: 8) {
            if let error = model.lastError {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text(error).font(.system(size: 12)).lineLimit(2)
                    Spacer()
                    Button("Dismiss") { model.dismissError() }.buttonStyle(.link).font(.system(size: 12))
                }
            }
            HStack(spacing: 10) {
                if model.isViewingPast {
                    Label("Looking back. This step is decided.", systemImage: "clock.arrow.circlepath")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                    Spacer()
                    Button("Back to now") { model.returnToLive() }.controlSize(.large)
                } else if model.hasSent(step) && model.status(step) != "done" {
                    ProgressView().controlSize(.small)
                    Text("Sent to Claude. Waiting for the next update.").font(.system(size: 12)).foregroundStyle(.secondary)
                    Spacer()
                } else {
                    Spacer()
                    Button("Just make it", action: justMakeIt)
                        .controlSize(.large).disabled(!canAct || !startEnabled)
                        .help("Confirm the brief and let Claude make every remaining call. You'll see the final.")
                    Button {
                        start()
                    } label: {
                        HStack(spacing: 6) {
                            if model.isSending { ProgressView().controlSize(.small) } else { Image(systemName: "checkmark") }
                            Text("Looks right")
                        }.frame(minWidth: 110)
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canAct || !startEnabled)
                }
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 12)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
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
