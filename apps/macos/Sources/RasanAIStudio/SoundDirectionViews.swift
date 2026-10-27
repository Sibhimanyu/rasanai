import AppKit
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

/// The compact Sound direction section shared by Brief and Look. A plain value plus one callback: the parent owns the state and
/// decides what an edit does (Brief writes it into its draft, Look sends one `sound-direction` action). Every control is
/// independent and may stay on "Recommend for me"; presets only fill choices the person has not made.
struct SoundDirectionSection: View {
    let sound: SoundDirection
    var enabled: Bool = true
    /// Brief already has the single Voiceover field; it passes false so there is only one voiceover control.
    var showsVoiceover: Bool = true
    let onChange: (SoundDirection) -> Void

    @State private var expanded = false
    @State private var customText = ""
    @FocusState private var customFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if expanded { details }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear { customText = sound.feelingCustom ?? "" }
    }

    // MARK: Summary row

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                StageSectionTitle("Sound direction")
                Spacer(minLength: 8)
                if enabled { presetMenu }
                Button(expanded ? "Less" : "Edit") { withAnimation(.easeOut(duration: 0.15)) { expanded.toggle() } }
                    .buttonStyle(.plain).font(.system(size: 12, weight: .medium)).foregroundStyle(Color.rasan)
                    .accessibilityHint(expanded ? "Hides the sound choices" : "Shows the sound choices")
            }
            Text(oneLine).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            if let conflict { Label(conflict, systemImage: "arrow.triangle.merge").font(.system(size: 12)).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true) }
        }
    }

    private var oneLine: String {
        if sound.isAllRecommend { return "The director recommends the sound and shows why. Change any part, or pick a starting point." }
        var parts: [String] = []
        if showsVoiceover || sound.explicit.contains(SoundDirection.Key.voiceover) { parts.append(sound.voiceover == .recommend ? "voiceover: recommended" : sound.voiceover.title.lowercased()) }
        parts.append(sound.pace == .recommend ? "pace: recommended" : "\(sound.pace.title.lowercased()) pace")
        parts.append(sound.feeling == .unset ? "feeling: recommended" : (sound.feeling == .custom ? (sound.feelingCustom ?? "custom feeling") : "\(sound.feeling.title.lowercased()) feeling"))
        parts.append(sound.effects == .unset ? "effects: recommended" : "\(sound.effects.title.lowercased()) effects")
        parts.append(sound.musicSource.title.lowercased())
        let text = parts.joined(separator: ", ")
        return text.prefix(1).uppercased() + text.dropFirst() + "."
    }

    /// One-line, plain-words resolution of choices that pull against each other. The engine resolver is the authority.
    private var conflict: String? {
        if sound.voiceover == .without && sound.musicSource == .none && sound.effects != .minimalNone && sound.effects != .unset {
            return "No voiceover and no music: the effects carry the film."
        }
        if sound.voiceover == .with && sound.pace == .fast { return "Fast pace under a voiceover: music stays under the voice and the energy comes from the cuts." }
        if sound.effects == .minimalNone, let id = sound.preset, SoundPreset.named(id)?.summary.localizedCaseInsensitiveContains("expressive") == true {
            return "You chose minimal effects, so the starting point's expressive cues are not applied."
        }
        return nil
    }

    private var presetMenu: some View {
        Menu("Starting point") {
            ForEach(SoundPreset.all) { preset in
                Button("\(preset.title): \(preset.summary)") { var next = sound; next.apply(preset); onChange(next) }
            }
        }
        .menuStyle(.button).buttonStyle(.plain).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
        .fixedSize().menuIndicator(.hidden)
        .help("Fills only what you have not chosen. Every value stays editable.")
        .accessibilityLabel("Sound starting point").accessibilityHint("Picks an editable preset that fills the choices you have not made")
    }

    // MARK: Controls

    private var details: some View {
        VStack(alignment: .leading, spacing: 12) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                if showsVoiceover {
                    field("Voiceover", text: sound.voiceover.title, options: SoundVoiceover.allCases.map(\.title),
                          selected: SoundVoiceover.allCases.firstIndex(of: sound.voiceover) ?? 0) { i in
                        let v = SoundVoiceover.allCases[i]; var n = sound
                        if v == .recommend { n.recommend(SoundDirection.Key.voiceover) } else { n.choose(voiceover: v) }
                        onChange(n)
                    }
                }
                field("Pace", text: sound.pace.title, options: SoundPace.allCases.map(\.title),
                      selected: SoundPace.allCases.firstIndex(of: sound.pace) ?? 0) { i in
                    let v = SoundPace.allCases[i]; var n = sound
                    if v == .recommend { n.recommend(SoundDirection.Key.pace) } else { n.choose(pace: v) }
                    onChange(n)
                }
                field("Feeling", text: sound.feeling == .custom ? (sound.feelingCustom ?? "Custom") : sound.feeling.title,
                      options: feelings.map(\.title), selected: feelings.firstIndex(of: sound.feeling) ?? 0) { i in
                    let v = feelings[i]; var n = sound
                    if v == .unset { n.recommend(SoundDirection.Key.feeling); customText = "" }
                    else if v == .custom { n.choose(feeling: .custom, custom: customText.isEmpty ? nil : customText); customFocused = true }
                    else { n.choose(feeling: v) }
                    onChange(n)
                }
                field("Effects", text: sound.effects.title, options: SoundEffects.allCases.map(\.title),
                      selected: SoundEffects.allCases.firstIndex(of: sound.effects) ?? 0) { i in
                    let v = SoundEffects.allCases[i]; var n = sound
                    if v == .unset { n.recommend(SoundDirection.Key.effects) } else { n.choose(effects: v) }
                    onChange(n)
                }
                field("Music", text: sound.musicSource.title, options: SoundMusicSource.allCases.map(\.title),
                      selected: SoundMusicSource.allCases.firstIndex(of: sound.musicSource) ?? 0) { i in
                    let v = SoundMusicSource.allCases[i]; var n = sound
                    if v == .userTrack {
                        guard let path = chooseTrack() else { return }
                        n.choose(musicSource: .userTrack, trackPath: path)
                    } else if v == .recommend { n.recommend(SoundDirection.Key.musicSource) } else { n.choose(musicSource: v) }
                    onChange(n)
                }
            }
            if sound.feeling == .custom { customField }
            VStack(alignment: .leading, spacing: 3) {
                ForEach(sound.resolvedSummary.filter { showsVoiceover || !$0.hasPrefix("Voiceover") }, id: \.self) { line in
                    Text(line).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var feelings: [SoundFeeling] { [.unset, .calm, .warm, .playful, .bold, .dramatic, .custom] }

    private var customField: some View {
        TextField("Describe the feeling in a few words", text: $customText)
            .textFieldStyle(.plain).font(.system(size: 13)).padding(.horizontal, 12).frame(height: 32)
            .background(Workspace.raised, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
            .focused($customFocused).disabled(!enabled)
            .onSubmit(commitCustom)
            .onChange(of: customFocused) { _, focused in if !focused { commitCustom() } }
            .accessibilityLabel("Custom sound feeling").accessibilityHint("A few words about how the sound should feel")
    }

    private func commitCustom() {
        let text = customText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard sound.feeling == .custom, text != (sound.feelingCustom ?? "") else { return }
        var n = sound
        if text.isEmpty { n.recommend(SoundDirection.Key.feeling) } else { n.choose(feeling: .custom, custom: text) }
        onChange(n)
    }

    private func field(_ title: String, text: String, options: [String], selected: Int, pick: @escaping (Int) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            Menu {
                ForEach(Array(options.enumerated()), id: \.offset) { index, label in
                    Button { pick(index) } label: { if index == selected { Label(label, systemImage: "checkmark") } else { Text(label) } }
                }
            } label: {
                HStack(spacing: 8) {
                    Text(text).font(.system(size: 13)).foregroundStyle(.primary).lineLimit(1).truncationMode(.tail)
                    Spacer(minLength: 4)
                    if enabled { Image(systemName: "chevron.up.chevron.down").font(.system(size: 9, weight: .semibold)).foregroundStyle(.tertiary) }
                }
                .padding(.horizontal, 12).frame(maxWidth: .infinity, alignment: .leading).frame(height: 32)
                .background(Workspace.raised, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
                .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).disabled(!enabled)
            .help(text)
            .accessibilityLabel("\(title): \(text)").accessibilityHint("Opens a menu to change it")
        }
    }

    /// The existing file-chooser pattern: a local audio file, nothing uploaded and no account.
    private func chooseTrack() -> String? {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.audio]
        panel.title = "Choose your track"; panel.prompt = "Use this track"
        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        return url.path
    }
}

/// One music candidate from `payload["sound"]["candidates"]`. Evidence and rights text are shown exactly as given.
struct SoundCandidate: Identifiable, Equatable {
    let id: String
    let title: String
    let reason: String?
    let family: String?
    let evidence: String?
    let rights: String?

    static func parse(_ sound: JSONValue) -> [SoundCandidate] {
        sound["candidates"].array.prefix(3).enumerated().compactMap { index, c in
            guard case .object = c, let title = c["title"].string, !title.isEmpty else { return nil }
            return SoundCandidate(id: c["id"].identifier ?? "candidate-\(index)", title: title, reason: c["reason"].string, family: c["family"].string,
                                  evidence: c["evidence_state"].string, rights: c["rights_note"].string)
        }
    }
}

/// The music shortlist in Look. Honest empty state; quick revisions go back through `onRevise(kind, candidateID)`.
struct SoundCandidatesView: View {
    let candidates: [SoundCandidate]
    var enabled: Bool = true
    let onRevise: (String, String) -> Void
    @State private var selectedID: String?

    private static let revisions: [(kind: String, title: String)] = [
        ("keep", "Keep this track"), ("more_like_this", "More like this"), ("warmer", "Warmer"),
        ("less_corporate", "Less corporate"), ("less_percussion", "Less percussion"), ("calmer_section", "Calmer section"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            StageSectionTitle("Music shortlist")
            if candidates.isEmpty {
                Text("No shortlist yet").font(.system(size: 12)).foregroundStyle(.secondary)
            } else {
                ForEach(candidates) { row($0) }
                if enabled, let id = selectedID ?? candidates.first?.id {
                    SoundChipFlow {
                        ForEach(Self.revisions, id: \.kind) { r in
                            Button(r.title) { onRevise(r.kind, id) }
                                .buttonStyle(.plain).font(.system(size: 12, weight: .medium)).foregroundStyle(Color.rasan)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Color.rasan.opacity(0.10), in: Capsule())
                                .accessibilityHint("Asks for a revised shortlist based on the selected track")
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(_ c: SoundCandidate) -> some View {
        let on = (selectedID ?? candidates.first?.id) == c.id
        return Button { selectedID = c.id } label: {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: on ? "largecircle.fill.circle" : "circle").font(.system(size: 11)).foregroundStyle(on ? Color.rasan : .secondary)
                    Text(c.title).font(.system(size: 13, weight: .medium)).foregroundStyle(.primary).lineLimit(1)
                    if let family = c.family { Text(family).font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(1) }
                }
                if let reason = c.reason { Text(reason).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                if let evidence = c.evidence { Text(evidence).font(.system(size: 11)).foregroundStyle(.tertiary) }
                if let rights = c.rights { Text(rights).font(.system(size: 11)).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true) }
            }
            .padding(.vertical, 6).padding(.horizontal, 10).frame(maxWidth: .infinity, alignment: .leading)
            .background(Workspace.raised.opacity(on ? 1 : 0.5), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(on ? Color.rasan.opacity(0.5) : Workspace.hairline, lineWidth: 1) }
            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain).disabled(!enabled)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

/// Wrapping row for the revision chips (a plain flow, so it works at the narrow rail width).
private struct SoundChipFlow: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize { place(proposal.width ?? 320, subviews, nil) }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) { _ = place(bounds.width, subviews, bounds.origin) }
    private func place(_ width: CGFloat, _ subviews: Subviews, _ origin: CGPoint?) -> CGSize {
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, maxX: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowH + spacing; rowH = 0 }
            if let origin { s.place(at: CGPoint(x: origin.x + x, y: origin.y + y), proposal: .unspecified) }
            x += size.width + spacing; rowH = max(rowH, size.height); maxX = max(maxX, x - spacing)
        }
        return CGSize(width: maxX, height: y + rowH)
    }
}
