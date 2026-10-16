import AppKit
import StudioCore
import SwiftUI

/// Call 02, three scripts. A list of stories on the left; the chosen script's aim, key moments, timeline and full table on the right.
struct StoryStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var selectedID: String?
    @State private var seeded = false
    @FocusState private var keysFocused: Bool
    @Environment(\.agentName) private var agent

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
        StageScaffold(model: model, step: step,
                      question: payload["question"].string ?? "Choose the story.",
                      context: payload["context"].string,
                      maxWidth: 1240) {
            VStack(alignment: .leading, spacing: 26) {
                if all.isEmpty {
                    StoryEmpty()
                } else {
                    StudioAdaptiveColumns(railWidth: 260, railFirst: true, breakpoint: 760, gap: 24, stackSpacing: 20) {
                        if let current {
                            StoryDetail(script: current, isRecommended: current.id == recommendedID)
                                .id(current.id)
                        } else {
                            Color.clear.frame(height: 0)
                        }
                        storyList(all)
                    }
                }
            }
            .focusable()
            .focusEffectDisabled()
            .focused($keysFocused)
            .onKeyPress(characters: CharacterSet(charactersIn: "123"), phases: .down) { press in
                guard model.canAct(on: step), let n = Int(press.characters), n >= 1, n <= all.count else { return .ignored }
                selectedID = all[n - 1].id
                return .handled
            }
            // Keys only when nothing is being typed: a step arriving while the person writes must not steal them.
            .onAppear { if !(NSApp.keyWindow?.firstResponder is NSTextView) { keysFocused = true } }
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

    // MARK: List

    private func storyList(_ all: [StoryScript]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(spacing: 8) {
                ForEach(Array(all.enumerated()), id: \.element.id) { index, script in
                    StoryListRow(script: script, index: index, count: all.count,
                                 selected: script.id == current?.id, isPick: script.id == recommendedID) {
                        selectedID = script.id
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Stories")
            moreButton(all)
        }
    }

    private func moreButton(_ all: [StoryScript]) -> some View {
        let canAct = model.canAct(on: step) && !model.hasSent(step)
        return Button {
            let near = current?.id ?? all.first?.id ?? ""
            let exclude = all.map { JSONValue.string($0.id) }
            Task { await model.send(step: step, type: "more", value: .object(["near": .string(near), "exclude": .array(exclude)])) }
        } label: {
            Label("Three more stories", systemImage: "arrow.triangle.2.circlepath")
        }
        .controlSize(.regular)
        .disabled(!canAct)
        .help("Ask \(agent) for three new scripts near the one you're looking at.")
    }
}

// MARK: List row

private struct StoryListRow: View {
    let script: StoryScript
    let index: Int, count: Int
    let selected: Bool, isPick: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                Text(String(format: "%02d", index + 1))
                    .font(.system(size: 12, weight: .medium)).monospacedDigit()
                    .foregroundStyle(selected ? Color.rasan : Color.secondary)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 5) {
                    Text(script.title).font(.system(size: 14, weight: .semibold))
                        .lineLimit(2).multilineTextAlignment(.leading)
                    if isPick { RecommendedBadge(text: "Recommended") }
                    Text(script.headline).font(.system(size: 12)).foregroundStyle(.secondary)
                        .lineLimit(3).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    if !script.angleMeaning.isEmpty {
                        Text("\(script.angle) · \(script.angleMeaning)").font(.system(size: 11)).foregroundStyle(.tertiary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 16)).foregroundStyle(selected ? Color.rasan : Color.secondary.opacity(0.6))
                    .padding(.top, 1)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .background(selected ? Color.rasan.opacity(0.10) : (hovering ? Workspace.hairline : Color.clear),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(selected ? Color.rasan.opacity(0.8) : Workspace.hairline, lineWidth: selected ? 1.5 : 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help("Press \(index + 1) to show this one")
        .accessibilityLabel("\(script.angle) story, \(script.angleMeaning): \(script.headline)\(isPick ? ", Claude's pick" : "")")
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: Detail

private struct StoryDetail: View {
    let script: StoryScript
    let isRecommended: Bool
    @State private var showBeats = false

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            header
            if let aim = script.aim { facts(aim) }
            if !script.moves.isEmpty { StoryMoves(script: script) }
            if !script.beats.isEmpty { timeline }
            howItGetsThere
            if !script.beats.isEmpty {
                DisclosureGroup("Full script and scene details (\(script.beats.count))", isExpanded: $showBeats) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        StoryTable(script: script).frame(minWidth: 720)
                    }
                    .padding(.top, 10)
                }
                .font(.system(size: 13, weight: .semibold))
            }
            if !script.lastLine.isEmpty { StoryLastLine(text: script.lastLine) }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .workspacePanel()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text(script.angle.uppercased())
                    .font(.system(size: 11, weight: .bold)).tracking(1.2).foregroundStyle(Color.rasan)
                if isRecommended { RecommendedBadge() }
            }
            Text(script.title)
                .font(.system(size: 30, weight: .semibold)).tracking(-0.4)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            let subtitle = script.aim?.takeaway ?? script.logline
            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 18)).foregroundStyle(.secondary).lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func facts(_ aim: StoryAim) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 24, alignment: .top)], alignment: .leading, spacing: 16) {
            if !aim.feel.isEmpty { fact("Feel", aim.feel) }
            if !aim.action.isEmpty { fact("Do next", aim.action) }
            if !aim.audience.isEmpty { fact("For whom", aim.audience) }
        }
        .accessibilityElement(children: .combine)
    }

    /// The beats in order, each with when it runs and its on-screen line; the full table stays folded below.
    private var timeline: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(script.beats.enumerated()), id: \.offset) { index, beat in
                HStack(alignment: .firstTextBaseline, spacing: 18) {
                    Text(clockText(beat.start) + (beat.duration > 0 ? " – " + clockText(beat.start + beat.duration) : ""))
                        .font(.system(size: 13)).monospacedDigit().foregroundStyle(.secondary)
                        .frame(width: 96, alignment: .leading)
                    Text(beat.onScreen.isEmpty ? beat.name : beat.onScreen)
                        .font(.system(size: 15)).fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.vertical, 12)
                .accessibilityElement(children: .combine)
                if index < script.beats.count - 1 { Divider().opacity(0.7) }
            }
        }
    }

    @ViewBuilder private var howItGetsThere: some View {
        let how = script.approach.isEmpty ? script.why : script.approach
        if !how.isEmpty || !script.device.isEmpty || script.tempoLine != nil {
            VStack(alignment: .leading, spacing: 8) {
                StageSectionTitle(script.approach.isEmpty ? "Why this one" : "How it gets there")
                if !how.isEmpty {
                    Text(how).font(.system(size: 14)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                }
                if let tempo = script.tempoLine {
                    Label(tempo, systemImage: "metronome")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
                if !script.device.isEmpty {
                    (Text("Idea: ").foregroundStyle(.tertiary) + Text(script.device).foregroundStyle(.secondary))
                        .font(.system(size: 12))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    private func fact(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
            Text(text).font(.system(size: 13)).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
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
                StageSectionTitle("Key moments")
                if let carrier = script.carrier {
                    (Text("Held together by: ").foregroundStyle(.tertiary) + Text(carrier).foregroundStyle(.secondary))
                        .font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
                }
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), spacing: 14, alignment: .top)], alignment: .leading, spacing: 18) {
                ForEach(Array(script.moves.enumerated()), id: \.element.id) { index, move in
                    tile(move, lead: index == 0)
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
                Text(move.move).font(.system(size: 12)).foregroundStyle(.secondary).lineSpacing(2).lineLimit(3)
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
            head("What the motion does").frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.18))
        .accessibilityHidden(true)
    }
    private func head(_ text: String) -> some View {
        Text(text.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
    }

    /// Each show row: the line in bold, what the motion does under it; the beat's visual when it has no shows.
    @ViewBuilder private func motionColumn(_ beat: StoryBeat) -> some View {
        Group {
            if beat.shows.isEmpty {
                Text(beat.visual).font(.system(size: 13)).foregroundStyle(.secondary).lineSpacing(3)
            } else {
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(beat.shows) { s in
                        VStack(alignment: .leading, spacing: 2) {
                            if !s.line.isEmpty { Text(s.line).font(.system(size: 13, weight: .semibold)) }
                            if !s.show.isEmpty { Text(s.show).font(.system(size: 13)).foregroundStyle(.secondary).lineSpacing(3) }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
    }

    private func row(_ beat: StoryBeat) -> some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(clockText(beat.start)).font(.system(size: 14, weight: .semibold, design: .rounded)).monospacedDigit()
                if !beat.name.isEmpty {
                    Text(beat.turn ? "TURNING POINT" : beat.name.uppercased())
                        .font(.system(size: 9.5, weight: .bold)).tracking(0.6)
                        .foregroundStyle(beat.turn ? Color.rasan : Color.secondary)
                }
                if beat.duration > 0 {
                    Text("\(Int(beat.duration.rounded())) s").font(.system(size: 10)).foregroundStyle(.tertiary).monospacedDigit()
                }
            }
            .frame(width: timeWidth, alignment: .leading)
            Text(beat.onScreen).font(.system(size: 15, weight: .semibold)).lineSpacing(2)
                .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            Text(beat.vo).font(.system(size: 13, design: .serif)).italic().lineSpacing(3)
                .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            motionColumn(beat)
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
            Text("THE LAST LINE").font(.system(size: 10, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary)
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
    @Environment(\.agentName) private var agent
    var body: some View {
        StageCard {
            Label("No scripts yet. \(agent) is still writing them.", systemImage: "text.alignleft")
                .font(.system(size: 13)).foregroundStyle(.secondary)
        }
    }
}

// MARK: Model

private struct StoryBeat {
    var name: String, onScreen: String, vo: String, visual: String
    var shows: [StoryShow] = []
    var duration: Double, start: Double
    var turn: Bool
    var spoken: String {
        var parts = ["At \(clockText(start))"]
        if turn { parts.append("the turn") }
        if !onScreen.isEmpty { parts.append("on screen: \(onScreen)") }
        if !vo.isEmpty { parts.append("voiceover: \(vo)") }
        if !shows.isEmpty { parts.append("the motion: " + shows.map { [$0.line, $0.show].filter { !$0.isEmpty }.joined(separator: ", ") }.joined(separator: "; ")) }
        else if !visual.isEmpty { parts.append("we see: \(visual)") }
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
            let source = (t["source"].string ?? "").lowercased().contains("brand") ? "the brand's own film" : "RasanAI's default pace"
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
                             visual: beat["visual"].string ?? "", shows: StoryShow.parse(beat["shows"]), duration: d, start: clock, turn: beat["turn"].bool ?? false)
        }
    }
}
