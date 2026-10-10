import StudioCore
import SwiftUI

/// Call 02, three scripts. Three comparable cards that lead with what each story would achieve, then the chosen script's aim, approach and timed table.
struct StoryStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var selectedID: String?
    @State private var seeded = false
    @FocusState private var keysFocused: Bool

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
        HStack(alignment: .top, spacing: 12) {
            ForEach(Array(all.enumerated()), id: \.element.id) { index, script in
                StoryOptionCard(script: script, index: index, count: all.count,
                                selected: script.id == current?.id, isPick: script.id == recommendedID) {
                    withAnimation(.smooth(duration: 0.28)) { selectedID = script.id }
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
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

// MARK: Option card

private struct StoryOptionCard: View {
    let script: StoryScript
    let index: Int, count: Int
    let selected: Bool, isPick: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Text(script.angle.uppercased())
                        .font(.system(size: 10.5, weight: .bold)).tracking(0.9)
                        .foregroundStyle(selected ? Color.rasan : Color.secondary)
                    Text(script.angleMeaning)
                        .font(.system(size: 11.5)).foregroundStyle(.secondary)
                    if isPick {
                        Image(systemName: "sparkles").font(.system(size: 10, weight: .semibold)).foregroundStyle(Color.rasan)
                    }
                    Spacer(minLength: 0)
                    if count > 1 {
                        Text("\(index + 1)").font(.system(size: 10.5, weight: .medium, design: .rounded)).monospacedDigit()
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Color(nsColor: .quaternaryLabelColor).opacity(0.5), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                }
                Text(script.headline)
                    .font(.system(size: 17, weight: .semibold, design: .serif)).lineSpacing(2)
                    .foregroundStyle(.primary)
                    .lineLimit(3).multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, minHeight: 66, alignment: .topLeading)
                VStack(alignment: .leading, spacing: 5) {
                    if let feel = script.aim?.feel, !feel.isEmpty { quiet("Feel", feel) }
                    if let next = script.aim?.action, !next.isEmpty { quiet("Then", next) }
                }
                .frame(maxWidth: .infinity, minHeight: 40, alignment: .topLeading)
                Rectangle().fill(Color(nsColor: .separatorColor)).frame(height: 0.5)
                Text(script.title)
                    .font(.system(size: 12, weight: selected ? .semibold : .medium))
                    .foregroundStyle(selected ? .primary : .secondary)
                    .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .cardSurface(hovering: hovering, selected: selected)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityLabel("\(script.angle) story, \(script.angleMeaning): \(script.headline)\(isPick ? ", Claude's pick" : "")")
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }

    private func quiet(_ label: String, _ text: String) -> some View {
        (Text("\(label): ").foregroundStyle(.tertiary) + Text(text).foregroundStyle(.secondary))
            .font(.system(size: 12)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
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
                if script.aim == nil, !script.logline.isEmpty {
                    Text(script.logline)
                        .font(.system(size: 17)).foregroundStyle(.secondary).lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let aim = script.aim { achieves(aim) }
            howItGetsThere
            if !script.moves.isEmpty { StoryMoves(script: script) }
            if !script.beats.isEmpty { StoryTable(script: script) }
            if !script.lastLine.isEmpty { StoryLastLine(text: script.lastLine) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func achieves(_ aim: StoryAim) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionLabel("What it achieves", symbol: "scope")
            Text(aim.takeaway)
                .font(.system(size: 24, weight: .medium, design: .serif)).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .top, spacing: 28) {
                if !aim.feel.isEmpty { fact("Feel", aim.feel) }
                if !aim.action.isEmpty { fact("Do next", aim.action) }
                if !aim.audience.isEmpty { fact("For whom", aim.audience) }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(LinearGradient(colors: [Color.rasan.opacity(0.09), Color.rasan.opacity(0.03)], startPoint: .topLeading, endPoint: .bottomTrailing))
        }
        .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.rasan.opacity(0.18), lineWidth: 0.5) }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var howItGetsThere: some View {
        let how = script.approach.isEmpty ? script.why : script.approach
        if !how.isEmpty || !script.device.isEmpty || script.tempoLine != nil {
            VStack(alignment: .leading, spacing: 8) {
                sectionLabel(script.approach.isEmpty ? "Why this one" : "How it gets there", symbol: "arrow.triangle.turn.up.right.diamond")
                if !how.isEmpty {
                    Text(how).font(.system(size: 15)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                }
                if let tempo = script.tempoLine {
                    Label(tempo, systemImage: "metronome")
                        .font(.system(size: 12.5)).foregroundStyle(.secondary)
                }
                if !script.device.isEmpty {
                    (Text("Device: ").foregroundStyle(.tertiary) + Text(script.device).foregroundStyle(.secondary))
                        .font(.system(size: 12.5))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    private func sectionLabel(_ title: String, symbol: String) -> some View {
        Label(title.uppercased(), systemImage: symbol)
            .font(.system(size: 10.5, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
    }

    private func fact(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
            Text(text).font(.system(size: 13.5)).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: Hero moves

/// The ideas this script would be built on, each playing as a short muted loop. Absent `moves` renders nothing.
private struct StoryMoves: View {
    let script: StoryScript
    @Environment(FilmSessionModel.self) private var model: FilmSessionModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Label("HERO MOVES", systemImage: "sparkles")
                    .font(.system(size: 10.5, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
                if let carrier = script.carrier {
                    (Text("Carried by: ").foregroundStyle(.tertiary) + Text(carrier).foregroundStyle(.secondary))
                        .font(.system(size: 12.5)).fixedSize(horizontal: false, vertical: true)
                }
            }
            HStack(alignment: .top, spacing: 14) {
                ForEach(Array(script.moves.enumerated()), id: \.element.id) { index, move in
                    tile(move, lead: index == 0)
                }
                if script.moves.count < 3 {
                    ForEach(0..<(3 - script.moves.count), id: \.self) { _ in Color.clear.frame(maxWidth: .infinity) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Hero moves for \(script.title)")
    }

    private func hasMedia(_ move: StoryMove) -> Bool {
        [move.video, move.poster, move.strip].contains { model?.fileURL($0) != nil }
    }

    private func atChip(_ move: StoryMove, overMedia: Bool) -> some View {
        Group {
            if let at = script.moveTime(move) {
                if overMedia {
                    Text("at \(clockText(at))")
                        .font(.system(size: 11, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(.black.opacity(0.55), in: Capsule())
                } else {
                    Text("at \(clockText(at))")
                        .font(.system(size: 11, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(.secondary)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .overlay { Capsule().strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                }
            }
        }
    }

    /// A move with media is a clip tile; one without is a compact text tile (no empty video frame).
    @ViewBuilder private func tile(_ move: StoryMove, lead: Bool) -> some View {
        let media = hasMedia(move)
        VStack(alignment: .leading, spacing: 10) {
            if media {
                frame(move)
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(lead ? Color.rasan.opacity(0.45) : Color(nsColor: .separatorColor), lineWidth: lead ? 1 : 0.5) }
                    .overlay(alignment: .bottomLeading) { atChip(move, overMedia: true).padding(10) }
                Text(move.title)
                    .font(.system(size: 15, weight: .semibold, design: .serif)).lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(move.title)
                        .font(.system(size: 15, weight: .semibold, design: .serif)).lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                    atChip(move, overMedia: false)
                }
            }
            if !move.move.isEmpty {
                Text(move.move).font(.system(size: 12.5)).foregroundStyle(.secondary).lineSpacing(2).lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(media ? 0 : 14)
        .background {
            if !media { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(nsColor: .quaternaryLabelColor).opacity(0.12)) }
        }
        .overlay {
            if !media { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .layoutPriority(media && lead ? 1 : 0)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(move.title). \(move.move)\(script.moveTime(move).map { ". At \(clockText($0))" } ?? "")")
    }

    @ViewBuilder private func frame(_ move: StoryMove) -> some View {
        let video = model?.fileURL(move.video)
        let still = move.poster ?? move.strip
        ZStack {
            Rectangle().fill(Color(nsColor: .quaternaryLabelColor).opacity(0.3))
            if let still, model?.fileURL(still) != nil { PayloadImage(path: still, contentMode: .fill, maxPixels: 900) }
            if let video, FileManager.default.fileExists(atPath: video.path) { MoveLoopingVideo(url: video) }
        }
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

private struct StoryAim {
    var takeaway: String, feel: String, action: String, audience: String
}

private struct StoryScript: Identifiable {
    let id: String
    var angle: String, title: String, logline: String, device: String, why: String, lastLine: String, approach: String
    var aim: StoryAim?
    var tempoLine: String?
    var carrier: String?
    var moves: [StoryMove]
    var beats: [StoryBeat]
    /// What the card's headline says: the takeaway, or for older payloads the logline, then why.
    var headline: String { aim?.takeaway ?? [logline, why].first { !$0.isEmpty } ?? title }
    var angleMeaning: String {
        switch angle.lowercased() { case "sure": "Safe bet"; case "bold": "Bolder"; case "wild": "Wild card"; default: "" }
    }
    var total: Double { beats.reduce(0) { $0 + $1.duration } }
    /// When the move's beat starts in the film, if the payload names a beat this script has.
    func moveTime(_ move: StoryMove) -> Double? {
        guard let beat = move.beat, beat <= beats.count else { return nil }
        return StoryMove.start(ofBeat: beat, durations: beats.map(\.duration))
    }

    init(_ json: JSONValue, index: Int) {
        id = json["id"].identifier ?? "story-\(index + 1)"
        angle = json["angle"].string ?? ["Sure", "Bold", "Wild"][min(index, 2)]
        title = json["title"].string ?? "Story \(index + 1)"
        logline = json["logline"].string ?? ""
        device = json["device"].string ?? ""
        why = json["why"].string ?? ""
        lastLine = json["last_line"].string ?? ""
        approach = json["approach"].string ?? ""
        let a = json["aim"]
        if let take = a["takeaway"].string, !take.isEmpty {
            aim = StoryAim(takeaway: take, feel: a["feel"].string ?? "", action: a["action"].string ?? "", audience: a["audience"].string ?? "")
        } else { aim = nil }
        let t = json["tempo"]
        if let ideas = t["ideas"].number, let every = t["change_every_s"].number {
            let source = (t["source"].string ?? "").lowercased().contains("brand") ? "the brand's own film" : "RasanAI house tempo"
            let n = Int(ideas.rounded()), e = (every * 10).rounded() / 10
            let gap = e == e.rounded() ? String(Int(e)) : String(e)
            tempoLine = "\(n) ideas · a change every \(gap) s · \(source)"
        } else { tempoLine = nil }
        carrier = StoryMove.carrier(json["carrier"])
        moves = StoryMove.parse(json["moves"])
        var clock = 0.0
        beats = json["beats"].array.map { beat in
            let d = beat["duration_s"].number ?? beat["duration"].number ?? 0
            defer { clock += d }
            return StoryBeat(name: beat["name"].string ?? "", onScreen: beat["on_screen"].string ?? "", vo: beat["vo"].string ?? "",
                             visual: beat["visual"].string ?? "", duration: d, start: clock, turn: beat["turn"].bool ?? false)
        }
    }
}
