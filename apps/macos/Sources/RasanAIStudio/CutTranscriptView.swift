import AppKit
import AVFoundation
import StudioCore
import SwiftUI

// MARK: - Transcript review in the Cut stage

/// The transcript of every clip in the cut, one word chip per word, with the Director's cut proposals on top. The cut file
/// on disk is the source of truth: each edit is sent as one `cut-edit` action with stable ids (never rewritten text) and the
/// refreshed `cut` payload replaces the optimistic state shown in the meantime.
struct CutTranscriptView: View {
    let model: FilmSessionModel
    let step: String
    let cut: JSONValue
    var player: AVPlayer?
    /// Offered when the host can start a note from a word (clip id, word id, source seconds). Nil hides the button.
    var onNote: ((String, String, Double) -> Void)?

    private struct Selection: Equatable { var anchor: String; var focus: String }
    private struct FixTarget: Identifiable { let clip: String; let word: String; var text: String; var id: String { clip + "/" + word } }

    @State private var selections: [String: Selection] = [:]
    @State private var pendingWords: [String: [String: Bool]] = [:]       // clip -> word id -> removed (optimistic)
    @State private var pendingCandidates: [String: [String: String]] = [:] // clip -> candidate id -> decision (optimistic)
    @State private var fix: FixTarget?
    @State private var playhead: Double?
    @State private var observer = TimeObserver()
    @FocusState private var focusedClip: String?

    private var clips: [JSONValue] { cut["clips"].array }
    private var canAct: Bool { model.canAct(on: step) }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .firstTextBaseline) {
                StageSectionTitle("Transcript")
                Spacer()
                Text("Click a word to select it, shift-click for a range. Nothing is deleted from the footage.")
                    .font(.system(size: 11)).foregroundStyle(.tertiary)
            }
            ForEach(Array(clips.enumerated()), id: \.offset) { _, clip in
                clipCard(clip)
            }
            ForEach(Array(cut["notes"].array.compactMap { $0.string }.enumerated()), id: \.offset) { _, note in
                Text(note).font(.system(size: 12)).foregroundStyle(.secondary)
            }
        }
        .onChange(of: cut) { pendingWords = [:]; pendingCandidates = [:]; selections = selections.filter { sel in clips.contains { $0["clip"].string == sel.key } } }
        .onAppear { observe() }
        .onChange(of: player.map(ObjectIdentifier.init)) { observe() }
        .onDisappear { observer.stop() }
        .sheet(item: $fix) { target in
            FixSpellingSheet(word: target.text) { text in
                send(["clip": .string(target.clip), "op": .string("correct"), "ids": .array([.string(target.word)]), "text": .string(text)])
            }
        }
    }

    // MARK: Clip

    private func clipCard(_ clip: JSONValue) -> some View {
        let id = clip["clip"].string ?? ""
        let words = clip["words"].array
        let candidates = clip["candidates"].array
        let selected = selectedIDs(id, words)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: "film").foregroundStyle(Color.rasan).accessibilityHidden(true)
                Text(clip["name"].string ?? id).font(.system(size: 13, weight: .semibold))
                Text(String(format: "%.1f s source", clip["total_s"].number ?? 0)).font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit()
                Spacer()
                Button { send(["clip": .string(id), "op": .string("undo")]) } label: { Label("Undo", systemImage: "arrow.uturn.backward") }
                    .keyboardShortcut("z", modifiers: .command)
                    .disabled(!(clip["can_undo"] == .bool(true)) || !canAct)
                    .help("Undo the last cut edit")
                Button { send(["clip": .string(id), "op": .string("redo")]) } label: { Label("Redo", systemImage: "arrow.uturn.forward") }
                    .keyboardShortcut("z", modifiers: [.command, .shift])
                    .disabled(!(clip["can_redo"] == .bool(true)) || !canAct)
                    .help("Redo the cut edit you undid")
            }
            legend
            if words.isEmpty {
                Text("No transcript for this clip yet.").font(.system(size: 12)).foregroundStyle(.secondary)
            } else {
                WordFlow(hSpacing: 3, vSpacing: 5) {
                    ForEach(Array(words.enumerated()), id: \.offset) { index, word in
                        if index > 0, let gap = pause(words[index - 1], word) { pauseChip(gap) }
                        wordChip(word, clip: id, words: words, candidates: candidates, selected: selected)
                    }
                }
                .focusable()
                .focused($focusedClip, equals: id)
                .focusEffectDisabled()
                .onKeyPress(.leftArrow, phases: [.down, .repeat]) { press in move(-1, press, id, words) }
                .onKeyPress(.rightArrow, phases: [.down, .repeat]) { press in move(1, press, id, words) }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Transcript of \(clip["name"].string ?? id)")
                selectionBar(clip: id, words: words, selected: selected)
            }
            if !candidates.isEmpty { candidateList(clip: id, candidates: candidates) }
        }
        .stageCard()
    }

    private var legend: some View {
        HStack(spacing: 14) {
            legendItem("Kept") { Text("word").font(.system(size: 11)) }
            legendItem("Proposed cut") { Text("word").font(.system(size: 11)).underline(true, pattern: .dot, color: Color.rasan) }
            legendItem("Cut") { Text("word").font(.system(size: 11)).strikethrough().foregroundStyle(.secondary) }
        }
        .accessibilityHidden(true)
    }

    private func legendItem<V: View>(_ title: String, @ViewBuilder _ sample: () -> V) -> some View {
        HStack(spacing: 5) { sample(); Text(title).font(.system(size: 10.5)).foregroundStyle(.tertiary) }
    }

    // MARK: Words

    private enum WordState { case kept, proposed, cut }

    private func decision(_ clip: String, _ id: String?, in candidates: [JSONValue]) -> String {
        guard let id else { return "" }
        if let pending = pendingCandidates[clip]?[id] { return pending }
        return candidates.first { $0["id"].string == id }?["decision"].string ?? "proposed"
    }

    private func state(_ word: JSONValue, clip: String, candidates: [JSONValue]) -> WordState {
        let wid = word["id"].string ?? ""
        let cand = word["cand"].string
        let dec = decision(clip, cand, in: candidates)
        let kind = candidates.first { $0["id"].string == cand }?["kind"].string
        var removed = word["removed"] == .bool(true)
        if let pending = pendingWords[clip]?[wid] { removed = pending }
        else if cand != nil, pendingCandidates[clip]?[cand ?? ""] != nil {
            if dec == "accepted", kind != "long_pause" { removed = true }
            else if dec != "accepted", word["by"].string == cand { removed = false }
        }
        if removed { return .cut }
        if cand != nil, dec != "accepted", dec != "rejected" { return .proposed }
        return .kept
    }

    private func stateText(_ state: WordState) -> String {
        switch state { case .kept: "kept"; case .proposed: "proposed cut"; case .cut: "cut" }
    }

    private func wordChip(_ word: JSONValue, clip: String, words: [JSONValue], candidates: [JSONValue], selected: Set<String>) -> some View {
        let wid = word["id"].string ?? ""
        let shown = word["display"].string ?? word["text"].string ?? ""
        let original = word["text"].string ?? shown
        let st = state(word, clip: clip, candidates: candidates)
        let isSelected = selected.contains(wid)
        let isPlaying = playhead.map { t in (word["out_start"].number ?? .infinity) <= t && t < (word["out_end"].number ?? -.infinity) } ?? false
        return Text(shown)
            .font(.system(size: 14))
            .strikethrough(st == .cut)
            .underline(st == .proposed, pattern: .dot, color: Color.rasan)
            .foregroundStyle(st == .cut ? Color.secondary.opacity(0.7) : Color.primary)
            .padding(.horizontal, 4).padding(.vertical, 2)
            .background {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(isSelected ? Color.rasan.opacity(0.30) : isPlaying ? Color.rasan.opacity(0.18) : st == .proposed ? Color.rasan.opacity(0.07) : Color.clear)
            }
            .overlay {
                if isSelected { RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(Color.rasan.opacity(0.8), lineWidth: 1) }
            }
            .contentShape(Rectangle())
            .onTapGesture { tap(wid, clip: clip, word: word) }
            .help(shown != original ? "Corrected from “\(original)”" : "\(clockText(word["start"].number ?? 0)) in the source")
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(shown), \(stateText(st))\(shown != original ? ", corrected from \(original)" : "")")
            .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
            .accessibilityAction { tap(wid, clip: clip, word: word) }
    }

    private func pause(_ previous: JSONValue, _ next: JSONValue) -> Double? {
        guard let a = previous["end"].number, let b = next["start"].number, b - a >= 1.0 else { return nil }
        return b - a
    }

    private func pauseChip(_ seconds: Double) -> some View {
        Text("⋯ " + String(format: "%.1f s", seconds))
            .font(.system(size: 10.5, weight: .medium)).monospacedDigit().foregroundStyle(.tertiary)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Capsule().fill(Color.primary.opacity(0.06)))
            .accessibilityLabel(String(format: "pause, %.1f seconds", seconds))
    }

    // MARK: Selection

    private func tap(_ wid: String, clip: String, word: JSONValue) {
        focusedClip = clip
        if NSEvent.modifierFlags.contains(.shift), let current = selections[clip] {
            selections[clip] = Selection(anchor: current.anchor, focus: wid)
        } else {
            selections[clip] = Selection(anchor: wid, focus: wid)
        }
        if let t = word["out_start"].number, let player {
            player.seek(to: CMTime(seconds: t, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        }
    }

    private func move(_ delta: Int, _ press: KeyPress, _ clip: String, _ words: [JSONValue]) -> KeyPress.Result {
        let ids = words.compactMap { $0["id"].string }
        guard !ids.isEmpty else { return .ignored }
        let current = selections[clip]
        let from = current.flatMap { ids.firstIndex(of: $0.focus) } ?? (delta > 0 ? -1 : ids.count)
        let next = min(max(from + delta, 0), ids.count - 1)
        if press.modifiers.contains(.shift), let current { selections[clip] = Selection(anchor: current.anchor, focus: ids[next]) }
        else { selections[clip] = Selection(anchor: ids[next], focus: ids[next]) }
        return .handled
    }

    private func selectedIDs(_ clip: String, _ words: [JSONValue]) -> Set<String> {
        guard let sel = selections[clip] else { return [] }
        let ids = words.compactMap { $0["id"].string }
        guard let a = ids.firstIndex(of: sel.anchor), let b = ids.firstIndex(of: sel.focus) else { return [] }
        return Set(ids[min(a, b)...max(a, b)])
    }

    private func range(_ clip: String, _ words: [JSONValue]) -> (from: String, to: String, count: Int)? {
        let ids = words.compactMap { $0["id"].string }
        guard let sel = selections[clip], let a = ids.firstIndex(of: sel.anchor), let b = ids.firstIndex(of: sel.focus) else { return nil }
        let lo = min(a, b), hi = max(a, b)
        return (ids[lo], ids[hi], hi - lo + 1)
    }

    private func selectionBar(clip: String, words: [JSONValue], selected: Set<String>) -> some View {
        let r = range(clip, words)
        return HStack(spacing: 10) {
            Button {
                guard let r else { return }
                for id in selected { pendingWords[clip, default: [:]][id] = true }
                send(["clip": .string(clip), "op": .string("cut"), "from": .string(r.from), "to": .string(r.to)])
            } label: { Label("Cut", systemImage: "scissors") }
                .help("Remove the selected words from the cut")
            Button {
                guard let r else { return }
                for id in selected { pendingWords[clip, default: [:]][id] = false }
                send(["clip": .string(clip), "op": .string("keep"), "from": .string(r.from), "to": .string(r.to)])
            } label: { Label("Restore", systemImage: "arrow.uturn.left") }
                .help("Keep the selected words in the cut")
            Button {
                guard let r, r.count == 1, let word = words.first(where: { $0["id"].string == r.from }) else { return }
                fix = FixTarget(clip: clip, word: r.from, text: word["display"].string ?? word["text"].string ?? "")
            } label: { Label("Fix spelling…", systemImage: "character.cursor.ibeam") }
                .disabled(r?.count != 1)
                .help("Correct how this word is spelled in captions")
            if let onNote, r?.count == 1, let word = words.first(where: { $0["id"].string == r?.from }) {
                Button { onNote(clip, r?.from ?? "", word["start"].number ?? 0) } label: { Label("Note on this word", systemImage: "text.bubble") }
            }
            Spacer()
            Text(r.map { $0.count == 1 ? "1 word selected" : "\($0.count) words selected" } ?? "No selection")
                .font(.system(size: 11)).foregroundStyle(.secondary)
        }
        .disabled(r == nil || !canAct)
        .controlSize(.small)
    }

    // MARK: Candidates

    private func candidateList(clip: String, candidates: [JSONValue]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            StageSectionTitle("Proposed cuts")
            VStack(spacing: 0) {
                ForEach(Array(candidates.enumerated()), id: \.offset) { index, cand in
                    candidateRow(clip: clip, cand: cand, candidates: candidates)
                    if index < candidates.count - 1 { Divider() }
                }
            }
            .background(Color.primary.opacity(0.03), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private func candidateRow(clip: String, cand: JSONValue, candidates: [JSONValue]) -> some View {
        let id = cand["id"].string ?? ""
        let dec = decision(clip, id, in: candidates)
        let kind = (cand["kind"].string ?? "").replacingOccurrences(of: "_", with: " ")
        let start = cand["start"].number ?? 0
        return HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(kind).font(.system(size: 10.5, weight: .semibold)).padding(.horizontal, 6).padding(.vertical, 2)
                .background(Capsule().fill(Color.rasan.opacity(0.14))).frame(minWidth: 70, alignment: .leading)
            Text(clockText(start)).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(cand["text"].string ?? "").font(.system(size: 12.5)).lineLimit(2)
                if let reason = cand["reason"].string, !reason.isEmpty {
                    Text(reason).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            Text(dec == "accepted" ? "Accepted" : dec == "rejected" ? "Kept" : "Proposed")
                .font(.system(size: 10.5)).foregroundStyle(.tertiary)
            Button("Accept") { decide(clip, id, "accept", "accepted") }
                .disabled(dec == "accepted").help("Cut this from the film")
            Button("Keep it") { decide(clip, id, "reject", "rejected") }
                .disabled(dec == "rejected").help("Leave this in the film")
        }
        .controlSize(.small)
        .padding(.horizontal, 10).padding(.vertical, 7)
        .disabled(!canAct)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(kind) at \(clockText(start)), \(cand["text"].string ?? ""), \(dec == "accepted" ? "accepted" : dec == "rejected" ? "kept" : "proposed")")
    }

    private func decide(_ clip: String, _ id: String, _ op: String, _ result: String) {
        pendingCandidates[clip, default: [:]][id] = result
        send(["clip": .string(clip), "op": .string(op), "ids": .array([.string(id)])])
    }

    // MARK: Sending

    private func send(_ value: [String: JSONValue]) {
        Task {
            let ok = await model.send(step: step, type: "cut-edit", value: .object(value), note: "")
            if !ok { pendingWords = [:]; pendingCandidates = [:] }
        }
    }

    // MARK: Playhead

    private func observe() {
        observer.stop()
        guard let player, clips.contains(where: { $0["words"].array.contains { $0["out_start"].number != nil } }) else { playhead = nil; return }
        observer.start(player) { playhead = $0 }
    }
}

/// Owns one periodic time observer on the panel's draft player; no second player is created.
private final class TimeObserver {
    private weak var player: AVPlayer?
    private var token: Any?
    func start(_ player: AVPlayer, _ onTime: @escaping (Double) -> Void) {
        self.player = player
        token = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main) { time in
            onTime(time.seconds)
        }
    }
    func stop() {
        if let token, let player { player.removeTimeObserver(token) }
        token = nil; player = nil
    }
    deinit { stop() }
}

// MARK: - Fix spelling

private struct FixSpellingSheet: View {
    @State var word: String
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Fix spelling").font(.system(size: 15, weight: .semibold))
            Text("Changes how the word reads in captions. The footage and its timing stay as they are.")
                .font(.system(size: 12)).foregroundStyle(.secondary)
            TextField("Word", text: $word).textFieldStyle(.roundedBorder).onSubmit(save)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Save") { save() }.keyboardShortcut(.defaultAction)
                    .disabled(word.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20).frame(width: 340)
    }

    private func save() {
        let text = word.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        onSave(text); dismiss()
    }
}

// MARK: - Wrapping flow

/// Left-to-right wrapping layout; each child stays its own view so VoiceOver reads word by word.
private struct WordFlow: Layout {
    var hSpacing: CGFloat
    var vSpacing: CGFloat

    private func place(_ subviews: Subviews, width: CGFloat) -> (positions: [CGPoint], size: CGSize) {
        var positions: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + vSpacing; rowHeight = 0 }
            positions.append(CGPoint(x: x, y: y))
            x += size.width + hSpacing
            maxX = max(maxX, x - hSpacing)
            rowHeight = max(rowHeight, size.height)
        }
        return (positions, CGSize(width: maxX, height: y + rowHeight))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        place(subviews, width: proposal.width ?? .infinity).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = place(subviews, width: bounds.width)
        for (view, point) in zip(subviews, result.positions) {
            view.place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }
}
