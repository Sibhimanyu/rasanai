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
                DisclosureGroup("The full storyline, beat by beat (\(script.beats.count))", isExpanded: $showBeats) {
                    StoryLine(script: script).padding(.top, 12)
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

/// The deep read: the story's argument, then every beat in full. Shows only what the payload carries.
private struct StoryLine: View {
    let script: StoryScript

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let line = script.storyline, !line.isEmpty { StoryArgument(line: line, beats: script.beats) }
            ForEach(Array(script.beats.enumerated()), id: \.offset) { index, beat in
                StoryBeatCard(beat: beat, number: index + 1)
            }
            if script.total > 0 {
                HStack {
                    Text("RUNS").font(.system(size: 10, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
                    Spacer()
                    Text(clockText(script.total)).monospacedDigit().font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Full storyline for \(script.title)")
    }
}

private struct StoryLabeled: View {
    let label: String
    let text: String
    var serif = false
    var emphasis = false
    init(_ label: String, _ text: String, serif: Bool = false, emphasis: Bool = false) { self.label = label; self.text = text; self.serif = serif; self.emphasis = emphasis }
    var body: some View {
        if !text.isEmpty {
            VStack(alignment: .leading, spacing: 3) {
                Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
                if serif {
                    Text(text).font(.system(size: 14, design: .serif)).italic().lineSpacing(3)
                } else {
                    Text(text).font(.system(size: emphasis ? 15 : 13, weight: emphasis ? .semibold : .regular)).lineSpacing(3)
                        .foregroundStyle(emphasis ? Color.primary : Color.primary.opacity(0.85))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
        }
    }
}

/// Above the beats: the argument, the problem, the turn, the ending and what the film covers or leaves out.
private struct StoryArgument: View {
    let line: StoryLineInfo
    let beats: [StoryBeat]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            StageSectionTitle("The argument")
            StoryLabeled("It argues", line.proposition, emphasis: true)
            StoryLabeled("The problem", line.problem)
            if !line.villainWhat.isEmpty || !line.villainPicture.isEmpty {
                StoryLabeled("What we blame", [line.villainWhat, line.villainPicture].filter { !$0.isEmpty }.joined(separator: ": "))
            }
            if !line.numbers.isEmpty {
                StoryLabeled("Its numbers", line.numbers.map { $0.source.isEmpty ? $0.value : "\($0.value) (\($0.source))" }.joined(separator: " · "))
            }
            StoryLabeled("From", line.emotion)
            StoryLabeled("The first seconds", line.first4s)
            if !line.turnLine.isEmpty {
                StoryLabeled("The turn", line.turnLine, emphasis: true)
                StoryLabeled("It reverses", line.turnReverses)
                StoryLabeled("Which pays off as", line.turnPayoff)
            }
            if !line.endingLine.isEmpty || !line.endingFrame.isEmpty {
                StoryLabeled("The ending", line.endingLine, emphasis: true)
                StoryLabeled("The last frame", line.endingFrame)
                StoryLabeled("It answers", line.endingEcho)
            }
            StoryLabeled("The image to remember", line.signatureImage)
            if !line.coverage.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("COVERS AND CUTS").font(.system(size: 10, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
                    ForEach(Array(line.coverage.enumerated()), id: \.offset) { _, c in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: c.cut.isEmpty ? "checkmark.circle" : "minus.circle")
                                .font(.system(size: 12)).foregroundStyle(c.cut.isEmpty ? Color.rasan : Color.secondary)
                            Text(c.text).font(.system(size: 13)).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.65), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
    }
}

private struct StoryBeatCard: View {
    let beat: StoryBeat
    let number: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(number)").font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(.secondary).monospacedDigit()
                Text(clockText(beat.start)).font(.system(size: 14, weight: .semibold, design: .rounded)).monospacedDigit()
                if beat.duration > 0 { Text("\(Int(beat.duration.rounded())) s").font(.system(size: 11)).foregroundStyle(.tertiary).monospacedDigit() }
                if !beat.name.isEmpty { Text(beat.name).font(.system(size: 15, weight: .semibold)) }
                Spacer(minLength: 8)
                ForEach(markers, id: \.self) { m in
                    Text(m.uppercased()).font(.system(size: 9.5, weight: .bold)).tracking(0.6)
                        .foregroundStyle(m == "Turning point" || m == "Peak" ? Color.rasan : Color.secondary)
                }
            }
            StoryLabeled("What we see", seen)
            if !beat.shows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("MOTION AND TRANSITION").font(.system(size: 10, weight: .semibold)).tracking(0.7).foregroundStyle(.secondary)
                    ForEach(beat.shows) { s in
                        VStack(alignment: .leading, spacing: 2) {
                            if !s.line.isEmpty { Text(s.line).font(.system(size: 13, weight: .semibold)) }
                            if !s.show.isEmpty { Text(s.show).font(.system(size: 13)).foregroundStyle(.secondary).lineSpacing(3) }
                            if !s.handoff.isEmpty { Text("Hands off: \(s.handoff)").font(.system(size: 12)).foregroundStyle(.secondary) }
                        }
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            StoryLabeled("On screen", beat.onScreen, emphasis: true)
            StoryLabeled("Voiceover", beat.vo, serif: true)
            StoryLabeled("Sound", beat.sound)
            if !beat.claimText.isEmpty {
                StoryLabeled("What it proves", beat.claimSource.isEmpty ? beat.claimText : "\(beat.claimText) (\(beat.claimSource))")
            }
            if !beat.buys.isEmpty || !beat.relation.isEmpty {
                StoryLabeled("Why it is here", whyHere)
            }
            if !beat.before.isEmpty || !beat.after.isEmpty {
                StoryLabeled("The viewer goes from", [beat.before, beat.after].filter { !$0.isEmpty }.joined(separator: " to "))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            if beat.turn || beat.peak {
                ZStack(alignment: .leading) {
                    Color.rasan.opacity(0.07)
                    Rectangle().fill(Color.rasan).frame(width: 3)
                }
            } else {
                Color(nsColor: .controlBackgroundColor).opacity(0.65)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
        .accessibilityElement(children: .contain)
    }

    private var markers: [String] {
        var m: [String] = []
        if beat.turn { m.append("Turning point") }
        if beat.peak { m.append("Peak") }
        if !beat.role.isEmpty { m.append(beat.role) }
        if beat.importance == 3 { m.append("Key beat") }
        return m
    }

    /// Setting, who or what, props and the shot, in one read; the beat's `visual` stays the spine.
    private var seen: String {
        var parts: [String] = []
        let spine = beat.visual.isEmpty ? beat.picture : beat.visual
        if !spine.isEmpty { parts.append(spine) }
        if !beat.picture.isEmpty && !beat.visual.isEmpty && !beat.visual.contains(beat.picture) { parts.append(beat.picture) }
        var extra: [String] = []
        if !beat.actor.isEmpty { extra.append("Who or what: \(beat.actor)") }
        if !beat.domain.isEmpty { extra.append("Setting: \(beat.domain)") }
        if !beat.props.isEmpty { extra.append("Props: \(beat.props.joined(separator: ", "))") }
        return (parts + extra).joined(separator: "\n")
    }

    private var whyHere: String {
        let word = beat.relation.isEmpty || beat.relation == "open" ? "" : beat.relation.prefix(1).uppercased() + beat.relation.dropFirst()
        if !word.isEmpty && !beat.buys.isEmpty { return "\(word): \(beat.buys)" }
        return beat.buys.isEmpty ? word : beat.buys
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
    // Richer fields from the pitch and the intent; empty on older payloads.
    var role = "", actor = "", domain = "", picture = "", sound = "", buys = "", before = "", after = "", relation = "", read = ""
    var props: [String] = []
    var peak = false
    var importance = 0
    var claimText = "", claimSource = ""
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

private struct StoryLineInfo {
    var proposition = "", problem = "", emotion = "", first4s = "", signatureImage = ""
    var villainWhat = "", villainPicture = ""
    var numbers: [(value: String, source: String)] = []
    var turnLine = "", turnReverses = "", turnPayoff = ""
    var endingLine = "", endingFrame = "", endingEcho = ""
    var coverage: [(text: String, cut: String)] = []
    var isEmpty: Bool {
        proposition.isEmpty && problem.isEmpty && villainWhat.isEmpty && villainPicture.isEmpty && numbers.isEmpty && turnLine.isEmpty
            && endingLine.isEmpty && endingFrame.isEmpty && coverage.isEmpty && emotion.isEmpty && first4s.isEmpty && signatureImage.isEmpty
    }

    init(_ json: JSONValue, beats: Int) {
        func s(_ v: JSONValue) -> String { (v.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
        proposition = s(json["proposition"]); problem = s(json["problem"]); emotion = s(json["emotion"])
        first4s = s(json["first_4s"]); signatureImage = s(json["signature_image"])
        villainWhat = s(json["villain"]["what"]); villainPicture = s(json["villain"]["picture"])
        numbers = json["villain"]["numbers"].array.compactMap { n in
            let v = s(n["value"]); return v.isEmpty ? nil : (v, s(n["source"]))
        }
        turnLine = s(json["turn"]["line"]); turnReverses = s(json["turn"]["reverses"]); turnPayoff = s(json["turn"]["payoff"])
        endingLine = s(json["ending"]["line"]); endingFrame = s(json["ending"]["last_frame"]); endingEcho = s(json["ending"]["echo"])
        coverage = json["coverage"].array.compactMap { c in
            let what = [s(c["claim"]), s(c["feature"])].first { !$0.isEmpty } ?? ""
            guard !what.isEmpty else { return nil }
            let cut = s(c["cut"])
            if !cut.isEmpty { return ("\(what), left out: \(cut)", cut) }
            if let b = c["beat"].number, Int(b) >= 1, Int(b) <= max(beats, Int(b)) { return ("\(what), shown in beat \(Int(b))", "") }
            return (what, "")
        }
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
    var storyline: StoryLineInfo?
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
            var b = StoryBeat(name: beat["name"].string ?? "", onScreen: beat["on_screen"].string ?? "", vo: beat["vo"].string ?? "",
                              visual: beat["visual"].string ?? "", shows: StoryShow.parse(beat["shows"]), duration: d, start: clock, turn: beat["turn"].bool ?? false)
            func s(_ k: String) -> String { (beat[k].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
            b.role = s("role"); b.actor = s("actor"); b.domain = s("domain"); b.picture = s("picture"); b.sound = s("sound")
            b.buys = s("buys"); b.before = s("viewer_before"); b.after = s("viewer_after"); b.relation = s("relation")
            b.read = (beat["read"].string ?? beat["read"]["text"].string ?? "")
            b.props = beat["props"].array.compactMap { $0.string }.filter { !$0.isEmpty }
            b.peak = beat["peak"].bool ?? false
            b.importance = Int(beat["importance"].number ?? 0)
            b.claimText = (beat["claim"]["text"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            b.claimSource = (beat["claim"]["source"].string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return b
        }
        let line = StoryLineInfo(json["storyline"], beats: beats.count)
        storyline = line.isEmpty ? nil : line
    }
}
