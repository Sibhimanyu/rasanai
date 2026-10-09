import StudioCore
import SwiftUI

/// Call 02, three scripts. A segmented choice of Sure / Bold / Wild, then the chosen script as a timed table.
struct StoryStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var selectedID: String?
    @State private var seeded = false
    @FocusState private var keysFocused: Bool
    @Namespace private var segmentSpace

    private var payload: JSONValue { model.payload(step) }
    private var scripts: [StoryScript] { payload["stories"].array.enumerated().map { StoryScript($1, index: $0) } }
    private var recommendedID: String? { payload["recommended"].identifier }
    private var current: StoryScript? {
        let all = scripts
        return all.first { $0.id == (selectedID ?? defaultID(all)) } ?? all.first
    }
    private func defaultID(_ all: [StoryScript]) -> String? {
        if let r = recommendedID, all.contains(where: { $0.id == r }) { return r }
        // a decided step lists only the chosen story
        return all.first?.id
    }

    var body: some View {
        let all = scripts
        let recTitle = all.first { $0.id == recommendedID }?.title
        StageScaffold(model: model, step: step,
                      question: payload["question"].string ?? "Which story should we tell?",
                      context: payload["context"].string,
                      recommended: recTitle,
                      maxWidth: 1000) {
            VStack(alignment: .leading, spacing: 26) {
                if all.isEmpty {
                    StoryEmpty()
                } else {
                    selector(all)
                    if let current {
                        StoryDetail(script: current, isRecommended: current.id == recommendedID)
                            .id(current.id)
                            .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 8)), removal: .opacity))
                    }
                    moreRow(all)
                }
            }
            .animation(.smooth(duration: 0.28), value: current?.id)
            .focusable()
            .focusEffectDisabled()
            .focused($keysFocused)
            .onKeyPress(characters: CharacterSet(charactersIn: "123"), phases: .down) { press in
                guard model.canAct(on: step), let n = Int(press.characters), n >= 1, n <= all.count else { return .ignored }
                selectedID = all[n - 1].id
                return .handled
            }
            .onAppear { keysFocused = true }
        } actions: {
            CallActions(model: model, step: step,
                        primaryTitle: all.isEmpty ? nil : "Use this story",
                        primarySymbol: "checkmark",
                        primaryEnabled: current != nil) { note in
                guard let current else { return }
                Task { await model.send(step: step, type: "choose", value: .string(current.id), note: note) }
            }
        }
    }

    // MARK: Selector

    private func selector(_ all: [StoryScript]) -> some View {
        HStack(spacing: 4) {
            ForEach(Array(all.enumerated()), id: \.element.id) { index, script in
                let on = script.id == current?.id
                Button {
                    withAnimation(.smooth(duration: 0.28)) { selectedID = script.id }
                } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: 6) {
                            Text(script.angle.uppercased())
                                .font(.system(size: 10.5, weight: .bold)).tracking(0.9)
                                .foregroundStyle(on ? Color.rasan : Color.secondary)
                            if script.id == recommendedID {
                                Image(systemName: "sparkles").font(.system(size: 10, weight: .semibold)).foregroundStyle(Color.rasan)
                            }
                            Spacer(minLength: 0)
                            if all.count > 1 {
                                Text("\(index + 1)").font(.system(size: 10.5, weight: .medium, design: .rounded)).monospacedDigit()
                                    .foregroundStyle(.tertiary)
                                    .padding(.horizontal, 5).padding(.vertical, 1)
                                    .background(Color(nsColor: .quaternaryLabelColor).opacity(0.5), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                            }
                        }
                        Text(script.title)
                            .font(.system(size: 14, weight: on ? .semibold : .medium))
                            .foregroundStyle(on ? .primary : .secondary)
                            .lineLimit(2).multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, minHeight: 36, alignment: .topLeading)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 11)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background {
                        if on {
                            RoundedRectangle(cornerRadius: 11, style: .continuous)
                                .fill(Color(nsColor: .controlBackgroundColor))
                                .overlay { RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(Color.rasan.opacity(0.45), lineWidth: 1) }
                                .shadow(color: .black.opacity(0.10), radius: 6, y: 2)
                                .matchedGeometryEffect(id: "segment", in: segmentSpace)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(script.angle) story: \(script.title)\(script.id == recommendedID ? ", Claude's pick" : "")")
                .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(4)
        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.28), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Stories")
    }

    private func moreRow(_ all: [StoryScript]) -> some View {
        let canAct = model.canAct(on: step) && !model.hasSent(step)
        return HStack(spacing: 12) {
            Rectangle().fill(Color(nsColor: .separatorColor)).frame(height: 0.5)
            Button {
                let near = current?.id ?? all.first?.id ?? ""
                let exclude = all.map { JSONValue.string($0.id) }
                Task { await model.send(step: step, type: "more", value: .object(["near": .string(near), "exclude": .array(exclude)])) }
            } label: {
                Label("Three more stories", systemImage: "arrow.triangle.2.circlepath")
            }
            .controlSize(.regular)
            .disabled(!canAct)
            .help("Ask Claude for three new scripts near the one you're looking at.")
            Rectangle().fill(Color(nsColor: .separatorColor)).frame(height: 0.5)
        }
    }
}

// MARK: Detail

private struct StoryDetail: View {
    let script: StoryScript
    let isRecommended: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Text(script.angle.uppercased())
                        .font(.system(size: 11, weight: .bold)).tracking(1.2).foregroundStyle(Color.rasan)
                    if isRecommended { RecommendedBadge(text: "Claude's pick") }
                }
                Text(script.title)
                    .font(.system(size: 34, weight: .semibold, design: .serif)).tracking(-0.4)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if !script.logline.isEmpty {
                    Text(script.logline)
                        .font(.system(size: 17)).foregroundStyle(.secondary).lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if !script.device.isEmpty || !script.why.isEmpty {
                HStack(alignment: .top, spacing: 28) {
                    if !script.device.isEmpty { fact("The device", script.device, symbol: "wand.and.stars") }
                    if !script.why.isEmpty { fact("Why this one", script.why, symbol: "lightbulb") }
                }
            }
            if !script.beats.isEmpty { StoryTable(script: script) }
            if !script.lastLine.isEmpty { StoryLastLine(text: script.lastLine) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func fact(_ title: String, _ text: String, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title.uppercased(), systemImage: symbol)
                .font(.system(size: 10.5, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
            Text(text).font(.system(size: 14)).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct StoryTable: View {
    let script: StoryScript
    private let timeWidth: CGFloat = 92

    var body: some View {
        VStack(spacing: 0) {
            headerRow
            Divider()
            ForEach(Array(script.beats.enumerated()), id: \.offset) { index, beat in
                row(beat)
                if index < script.beats.count - 1 { Divider().opacity(0.6) }
            }
            if script.total > 0 {
                Divider()
                HStack {
                    Text("Runs").font(.system(size: 11, weight: .semibold)).tracking(0.5).foregroundStyle(.secondary)
                    Spacer()
                    Text(clockText(script.total)).monospacedDigit().font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16).padding(.vertical, 9)
                .accessibilityElement(children: .combine)
            }
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.65), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Script for \(script.title)")
    }

    private var headerRow: some View {
        HStack(alignment: .firstTextBaseline, spacing: 16) {
            head("Time").frame(width: timeWidth, alignment: .leading)
            head("On screen").frame(maxWidth: .infinity, alignment: .leading)
            head("Voiceover").frame(maxWidth: .infinity, alignment: .leading)
            head("What we see").frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.18))
        .accessibilityHidden(true)
    }
    private func head(_ text: String) -> some View {
        Text(text.uppercased()).font(.system(size: 10.5, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
    }

    private func row(_ beat: StoryBeat) -> some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(clockText(beat.start)).font(.system(size: 14, weight: .semibold, design: .rounded)).monospacedDigit()
                if !beat.name.isEmpty {
                    Text(beat.turn ? "THE TURN" : beat.name.uppercased())
                        .font(.system(size: 9.5, weight: .bold)).tracking(0.6)
                        .foregroundStyle(beat.turn ? Color.rasan : Color.secondary)
                }
                if beat.duration > 0 {
                    Text("\(Int(beat.duration.rounded())) s").font(.system(size: 10.5)).foregroundStyle(.tertiary).monospacedDigit()
                }
            }
            .frame(width: timeWidth, alignment: .leading)
            Text(beat.onScreen).font(.system(size: 15, weight: .semibold)).lineSpacing(2)
                .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            Text(beat.vo).font(.system(size: 13.5, design: .serif)).italic().lineSpacing(3)
                .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            Text(beat.visual).font(.system(size: 13)).foregroundStyle(.secondary).lineSpacing(3)
                .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .background {
            if beat.turn {
                ZStack(alignment: .leading) {
                    Color.rasan.opacity(0.09)
                    Rectangle().fill(Color.rasan).frame(width: 3)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(beat.spoken)
    }
}

private struct StoryLastLine: View {
    let text: String
    var body: some View {
        VStack(spacing: 10) {
            Text("THE LAST LINE").font(.system(size: 10.5, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary)
            Text(text)
                .font(.system(size: 26, weight: .medium, design: .serif)).italic()
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28).padding(.horizontal, 24)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(LinearGradient(colors: [Color.rasan.opacity(0.10), Color.rasan.opacity(0.03)], startPoint: .topLeading, endPoint: .bottomTrailing))
        }
        .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.rasan.opacity(0.18), lineWidth: 0.5) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Last line: \(text)")
    }
}

private struct StoryEmpty: View {
    var body: some View {
        StageCard {
            Label("No scripts yet. Claude is still writing them.", systemImage: "text.alignleft")
                .font(.system(size: 13)).foregroundStyle(.secondary)
        }
    }
}

// MARK: Model

private struct StoryBeat {
    var name: String, onScreen: String, vo: String, visual: String
    var duration: Double, start: Double
    var turn: Bool
    var spoken: String {
        var parts = ["At \(clockText(start))"]
        if turn { parts.append("the turn") }
        if !onScreen.isEmpty { parts.append("on screen: \(onScreen)") }
        if !vo.isEmpty { parts.append("voiceover: \(vo)") }
        if !visual.isEmpty { parts.append("we see: \(visual)") }
        return parts.joined(separator: ". ")
    }
}

private struct StoryScript: Identifiable {
    let id: String
    var angle: String, title: String, logline: String, device: String, why: String, lastLine: String
    var beats: [StoryBeat]
    var total: Double { beats.reduce(0) { $0 + $1.duration } }

    init(_ json: JSONValue, index: Int) {
        id = json["id"].identifier ?? "story-\(index + 1)"
        angle = json["angle"].string ?? ["Sure", "Bold", "Wild"][min(index, 2)]
        title = json["title"].string ?? "Story \(index + 1)"
        logline = json["logline"].string ?? ""
        device = json["device"].string ?? ""
        why = json["why"].string ?? ""
        lastLine = json["last_line"].string ?? ""
        var clock = 0.0
        beats = json["beats"].array.map { beat in
            let d = beat["duration_s"].number ?? beat["duration"].number ?? 0
            defer { clock += d }
            return StoryBeat(name: beat["name"].string ?? "", onScreen: beat["on_screen"].string ?? "", vo: beat["vo"].string ?? "",
                             visual: beat["visual"].string ?? "", duration: d, start: clock, turn: beat["turn"].bool ?? false)
        }
    }
}
