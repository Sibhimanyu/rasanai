import AppKit
import AVFoundation
import AVKit
import StudioCore
import SwiftUI

// MARK: - The detail card for one phase

/// The big card under the header: whatever is most worth looking at in the selected phase.
/// Imagery first (key frames, scenes, drafts, the render's poster); text only where text is the content.
struct PhaseDetailCard: View {
    let model: FilmSessionModel
    let snapshot: FilmProgressSnapshot
    let phase: ProgressPhase
    let now: Date

    private var summary: PhaseSummary { snapshot.summary(phase) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            heading
            content
        }
        .stageCard(padding: 20)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(phase.title) details")
    }

    private var heading: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(phase.title).font(.system(size: 18, weight: .semibold)).accessibilityAddTraits(.isHeader)
            StateBadge(state: summary.state)
            Spacer()
            HStack(spacing: 14) {
                if summary.startedAt != nil, summary.state != .upcoming {
                    stat("clock", FilmProgressFormat.duration(summary.workSeconds(now: now)))
                }
                if let cost = summary.costText { stat("dollarsign.circle", cost) }
                if summary.rounds > 1 { stat("arrow.triangle.2.circlepath", "\(summary.rounds) rounds") }
            }
            .font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit()
        }
    }

    private func stat(_ symbol: String, _ text: String) -> some View {
        Label(text, systemImage: symbol).labelStyle(.titleAndIcon)
    }

    @ViewBuilder private var content: some View {
        switch phase {
        case .research: ResearchCard(model: model, snapshot: snapshot, now: now)
        case .script: CrewCard(snapshot: snapshot, phase: .script, empty: "Three writers draft scripts side by side, then an editor reads them like a hostile reader.", images: [])
        case .look:
            CrewCard(snapshot: snapshot, phase: .look, empty: "Three designers each draw a look for the story you picked.",
                     images: snapshot.keyframes.filter { $0.kind == .specimen })
        case .plan: PlanCard(snapshot: snapshot, now: now)
        case .animatic: AnimaticCard(snapshot: snapshot, summary: summary)
        case .build: BuildCard(snapshot: snapshot, now: now)
        case .check: CheckCard(snapshot: snapshot, aspect: model.snapshot.aspectRatio)
        case .render: RenderCard(snapshot: snapshot, now: now, aspect: model.snapshot.aspectRatio)
        }
    }
}

struct StateBadge: View {
    let state: PhaseState
    var body: some View {
        let (text, tint): (String, Color) = switch state {
        case .active: ("In progress", Color.rasan)
        case .waitingForYou: ("Waiting for you", .orange)
        case .done: ("Done", Color(nsColor: .systemGreen))
        case .skipped: ("Skipped", Color.secondary)
        case .upcoming: ("Not started", Color.secondary)
        }
        Text(text).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(tint)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(tint.opacity(0.13), in: Capsule())
    }
}

/// A quiet sentence for a phase that has nothing to show yet.
private struct Placeholder: View {
    let symbol: String
    let text: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 20, weight: .light)).foregroundStyle(.tertiary).frame(width: 28)
            Text(text).font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .quaternaryLabelColor).opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// A slim progress bar drawn in SwiftUI so the accent follows light and dark exactly (the system linear bar ignores appearance changes in some hosts).
struct ThinBar: View {
    let fraction: Double
    var tint: Color = .rasan
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(nsColor: .quaternaryLabelColor).opacity(0.35))
                Capsule().fill(tint).frame(width: max(5, proxy.size.width * min(1, max(0, fraction))))
                    .animation(.smooth(duration: 0.5), value: fraction)
            }
        }
        .frame(height: 5)
        .accessibilityElement(children: .ignore)
        .accessibilityValue("\(Int((min(1, max(0, fraction)) * 100).rounded())) percent")
    }
}

// MARK: - Research

struct ResearchCard: View {
    let model: FilmSessionModel
    let snapshot: FilmProgressSnapshot
    let now: Date
    @State private var showAll = false
    @State private var wrapSent = false
    @State private var wrapFailed = false

    private var research: ResearchProgress { snapshot.research }
    private var isActive: Bool { snapshot.summary(.research).state == .active && research.endedAt == nil }
    private var wrapStep: String? { isActive ? ResearchTimeBox.noteStep(in: model.snapshot) : nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .bottom, spacing: 22) {
                budgetMeter
                if let step = wrapStep, !research.sources.isEmpty { wrapUp(step: step) }
            }
            if isActive, let budget = research.budget, research.sourceCount > budget.sources || research.elapsed(now: now) > budget.seconds {
                Label("Past the research budget. Wrap up to move on to the brief with what has been read.", systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12)).foregroundStyle(.orange)
            }
            let crew = snapshot.crew(in: .research, running: true)
            if !crew.isEmpty { CrewRows(members: crew, now: now) }
            if research.sources.isEmpty {
                Placeholder(symbol: "magnifyingglass", text: isActive ? "Nothing read yet. Sources appear here as Claude opens them." : "No web pages were read for this film.")
            } else {
                sourceList
            }
            if let captures = capturesStrip { captures }
            footer
        }
    }

    // Sources against the budget: "4 of 6 sources", "1:12 of 2:00".
    @ViewBuilder private var budgetMeter: some View {
        let count = research.sourceCount
        HStack(spacing: 22) {
            if let budget = research.budget {
                meter("\(count) of \(budget.sources) sources", fraction: Double(count) / Double(max(1, budget.sources)), tint: count > budget.sources ? .orange : Color.rasan)
                let elapsed = research.elapsed(now: now)
                meter("\(FilmProgressFormat.duration(elapsed)) of \(FilmProgressFormat.duration(budget.seconds))",
                      fraction: elapsed / max(1, budget.seconds), tint: elapsed > budget.seconds ? .orange : Color.rasan)
            } else {
                Label("\(count) source\(count == 1 ? "" : "s") read", systemImage: "doc.text.magnifyingglass").font(.system(size: 13, weight: .medium))
                Text("No limit set for this film").font(.system(size: 12)).foregroundStyle(.secondary)
                Spacer()
            }
        }
    }

    private func meter(_ label: String, fraction: Double, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 12.5, weight: .semibold)).monospacedDigit()
            ThinBar(fraction: fraction, tint: tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private var sourceList: some View {
        let all = research.sources.sorted { $0.time > $1.time }
        let items = showAll ? all : Array(all.prefix(6))
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                StageSectionTitle("Read so far")
                Spacer()
                Text("\(research.pageCount) page\(research.pageCount == 1 ? "" : "s") · \(research.searchCount) search\(research.searchCount == 1 ? "" : "es")")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
            .padding(.bottom, 4)
            ForEach(Array(items.enumerated()), id: \.element.id) { index, source in
                ProgressSourceRow(source: source, fresh: index == 0 && isActive)
                if index < items.count - 1 { Divider().padding(.leading, 34) }
            }
            if all.count > 6 {
                Button(showAll ? "Show fewer" : "Show all \(all.count)") { withAnimation(.smooth) { showAll.toggle() } }
                    .buttonStyle(.link).font(.system(size: 12)).padding(.top, 6)
            }
        }
    }

    // Screens already captured from the brief step, if any.
    private var capturesStrip: AnyView? {
        let captures = model.payload("brief")["captures"].array
        guard !captures.isEmpty else { return nil }
        return AnyView(
            VStack(alignment: .leading, spacing: 8) {
                StageSectionTitle("Screens captured")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(captures.prefix(8).enumerated()), id: \.offset) { _, capture in
                            PayloadImage(path: capture["image"].string ?? capture.string, maxPixels: 520)
                                .frame(width: 150, height: 94)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                                .accessibilityLabel(capture["caption"].string ?? "Captured screen")
                        }
                    }
                }
            }
        )
    }

    @ViewBuilder private var footer: some View {
        if research.findingsCount > 0 {
            Label("\(research.findingsCount) finding\(research.findingsCount == 1 ? "" : "s") written into your brief", systemImage: "checkmark.circle.fill")
                .font(.system(size: 12.5)).foregroundStyle(Color(nsColor: .systemGreen))
        }
    }

    @ViewBuilder private func wrapUp(step: String) -> some View {
        if wrapSent {
            Label("Sent. Claude will wrap up.", systemImage: "paperplane.fill").font(.system(size: 12.5)).foregroundStyle(.secondary).fixedSize()
        } else {
            VStack(alignment: .trailing, spacing: 3) {
                Button {
                    Task {
                        let ok = await model.send(step: step, type: "note", note: ResearchTimeBox.noteText)
                        wrapSent = ok; wrapFailed = !ok
                    }
                } label: { Label("Wrap up research", systemImage: "checkmark.circle") }
                    .controlSize(.regular)
                    .help("Tells Claude to stop reading and go with what it has.")
                    .accessibilityHint("Tells Claude to stop researching and move on to the brief")
                if wrapFailed { Text("Couldn't send. Try again.").font(.system(size: 11)).foregroundStyle(.orange) }
            }
            .fixedSize()
        }
    }
}

struct ProgressSourceRow: View {
    let source: ResearchSource
    var fresh = false

    var body: some View {
        HStack(spacing: 10) {
            HostGlyph(source: source)
            VStack(alignment: .leading, spacing: 1) {
                Text(source.kind == .search ? "\u{201C}\(source.host)\u{201D}" : source.display)
                    .font(.system(size: 13, weight: fresh ? .semibold : .regular)).lineLimit(1).truncationMode(.middle)
                if let by = source.by, !by.isEmpty {
                    Text(by).font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if fresh { ProgressView().controlSize(.mini) }
            Text(source.time, format: .dateTime.hour().minute().second())
                .font(.system(size: 11)).foregroundStyle(.tertiary).monospacedDigit()
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .help(source.target)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(source.kind == .search ? "Searched for \(source.host)" : "Read \(source.display)")
    }
}

/// A site's monogram tile (no network: nothing about the film's research leaves the Mac for a favicon).
struct HostGlyph: View {
    let source: ResearchSource
    var body: some View {
        let host = source.host.replacingOccurrences(of: "www.", with: "")
        let hue = Double(abs(host.unicodeScalars.reduce(5381) { ($0 &* 33) &+ Int($1.value) }) % 360) / 360
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(source.kind == .search ? Color(nsColor: .quaternaryLabelColor).opacity(0.3) : Color(hue: hue, saturation: 0.45, brightness: 0.78))
            if source.kind == .search {
                Image(systemName: "magnifyingglass").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
            } else {
                Text(String(host.first.map { String($0) }?.uppercased() ?? "?"))
                    .font(.system(size: 11.5, weight: .bold, design: .rounded)).foregroundStyle(.white)
            }
        }
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
    }
}

// MARK: - Crew (script, look)

struct CrewCard: View {
    let snapshot: FilmProgressSnapshot
    let phase: ProgressPhase
    let empty: String
    let images: [KeyframeThumb]

    var body: some View {
        let crew = snapshot.crew(in: phase)
        let state = snapshot.summary(phase).state
        VStack(alignment: .leading, spacing: 16) {
            if !images.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    StageSectionTitle(phase == .look ? "Looks drawn so far" : "Drafts")
                    HStack(spacing: 12) {
                        ForEach(images.prefix(3)) { image in FrameTile(thumb: image, aspect: 16.0 / 9.0) }
                    }
                }
            }
            if crew.isEmpty {
                Placeholder(symbol: phase.symbolName, text: state == .upcoming ? phase.summary : empty)
            } else {
                CrewRows(members: crew, now: snapshot.asOf)
            }
        }
    }
}

struct CrewRows: View {
    let members: [CrewMember]
    let now: Date

    var body: some View {
        let running = members.filter { $0.state == .running }
        let finished = members.filter { $0.state != .running }
        VStack(alignment: .leading, spacing: 4) {
            StageSectionTitle(running.isEmpty ? "The crew" : "At work now")
                .padding(.bottom, 4)
            ForEach(running) { CrewRow(member: $0, now: now) }
            ForEach(finished.prefix(running.isEmpty ? 8 : 3)) { CrewRow(member: $0, now: now) }
            if finished.count > (running.isEmpty ? 8 : 3) {
                Text("and \(finished.count - (running.isEmpty ? 8 : 3)) more finished").font(.system(size: 11.5)).foregroundStyle(.tertiary).padding(.leading, 32)
            }
        }
    }
}

struct CrewRow: View {
    let member: CrewMember
    let now: Date
    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(tint.opacity(0.14))
                switch member.state {
                case .running: ProgressView().controlSize(.mini).scaleEffect(0.7)
                case .done: Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundStyle(tint)
                case .failed: Image(systemName: "exclamationmark").font(.system(size: 10, weight: .bold)).foregroundStyle(tint)
                }
            }
            .frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(member.name).font(.system(size: 13, weight: member.state == .running ? .medium : .regular))
                    .foregroundStyle(member.state == .running ? .primary : .secondary).lineLimit(1)
                if member.state == .running, let action = member.lastAction, !action.isEmpty {
                    Text(action).font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text(FilmProgressFormat.duration((member.endedAt ?? now).timeIntervalSince(member.startedAt)))
                .font(.system(size: 11)).foregroundStyle(.tertiary).monospacedDigit()
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(member.name), \(member.state == .running ? "working" : member.state == .done ? "finished" : "failed")")
    }
    private var tint: Color {
        switch member.state {
        case .running: Color.rasan
        case .done: Color(nsColor: .systemGreen)
        case .failed: .orange
        }
    }
}

// MARK: - Plan: key frames filling in

struct PlanCard: View {
    let snapshot: FilmProgressSnapshot
    let now: Date

    var body: some View {
        let frames = snapshot.keyframes.filter { $0.kind != .specimen }
        let expected = max(snapshot.keyframesExpected ?? 0, frames.filter { $0.kind == .keyframe }.count)
        let drawn = frames.filter { $0.kind == .keyframe }.count
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                StageSectionTitle(expected > 0 ? "Key frames · \(drawn) of \(expected)" : "Key frames")
                Spacer()
                if expected > 0 { ThinBar(fraction: Double(drawn) / Double(expected), tint: Color.rasan).frame(width: 140) }
            }
            if frames.isEmpty && expected == 0 {
                Placeholder(symbol: "square.grid.3x3", text: "Motion, transitions and music come first. Key frames start appearing here as they are drawn.")
            } else {
                let columns = [GridItem(.adaptive(minimum: 150, maximum: 220), spacing: 12, alignment: .top)]
                LazyVGrid(columns: columns, alignment: .leading, spacing: 14) {
                    let newest = frames.last?.id
                    let active = snapshot.summary(.plan).state == .active
                    let byScene = Dictionary(frames.compactMap { f in f.sceneID.map { ($0, f) } }, uniquingKeysWith: { $1 })
                    let slots = (1...max(expected, 1)).map(String.init)
                    // Key frames sit in their scene's slot (scene 1 first); slots not drawn yet are empty, the next one pulses.
                    ForEach(frames.filter { $0.sceneID == nil || !slots.contains($0.sceneID!) }) { frame in
                        FrameTile(thumb: frame, aspect: 16.0 / 9.0, isNewest: frame.id == newest && active)
                    }
                    if expected > 0 {
                        let firstEmpty = slots.first { byScene[$0] == nil }
                        ForEach(slots, id: \.self) { scene in
                            if let frame = byScene[scene] { FrameTile(thumb: frame, aspect: 16.0 / 9.0, isNewest: frame.id == newest && active) }
                            else { EmptyFrameTile(label: "Key frame \(scene)", active: scene == firstEmpty && active) }
                        }
                    }
                }
            }
        }
    }
}

/// One image tile with a caption. Click to open it full size.
struct FrameTile: View {
    let thumb: KeyframeThumb
    var aspect: Double = 16.0 / 9.0
    var isNewest = false
    @State private var hovering = false

    var body: some View {
        Button { NSWorkspace.shared.open(thumb.url) } label: {
            VStack(alignment: .leading, spacing: 6) {
                ZStack(alignment: .topLeading) {
                    Color(nsColor: .underPageBackgroundColor)
                    PosterImage(url: thumb.url, maxPixels: 640).transition(.opacity)
                    if isNewest {
                        Text("NEW").font(.system(size: 9, weight: .bold)).tracking(0.5).foregroundStyle(.white)
                            .padding(.horizontal, 6).padding(.vertical, 2.5).background(Color.rasan, in: Capsule()).padding(7)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .aspectRatioBox(aspect)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(isNewest ? Color.rasan.opacity(0.8) : Color(nsColor: .separatorColor), lineWidth: isNewest ? 1.5 : 0.5) }
                .shadow(color: .black.opacity(hovering ? 0.2 : 0.08), radius: hovering ? 10 : 4, y: hovering ? 5 : 2)
                Text(thumb.label).font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(1)
            }
            .scaleEffect(hovering ? 1.012 : 1)
            .animation(.snappy(duration: 0.16), value: hovering)
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help("Open \(thumb.label)")
        .accessibilityLabel(thumb.label)
        .accessibilityHint("Opens the image")
    }
}

struct EmptyFrameTile: View {
    let label: String
    var active = false
    @State private var pulse = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(active ? Color.rasan.opacity(pulse ? 0.14 : 0.05) : Color.clear)
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .strokeBorder(active ? Color.rasan.opacity(0.6) : Color(nsColor: .separatorColor), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                if active { ProgressView().controlSize(.small) } else { Image(systemName: "photo").foregroundStyle(.quaternary) }
            }
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            Text(label).font(.system(size: 11.5)).foregroundStyle(.tertiary).lineLimit(1)
        }
        .onAppear { if active { withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { pulse = true } } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(active ? "being drawn" : "waiting")")
    }
}

// MARK: - Animatic

struct AnimaticCard: View {
    let snapshot: FilmProgressSnapshot
    let summary: PhaseSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if summary.state == .waitingForYou {
                Placeholder(symbol: "person.fill.questionmark", text: "The timed storyboard is ready for your notes. Open it from the stage bar above to review, then approve.")
            } else if summary.state == .done {
                Placeholder(symbol: "checkmark.circle", text: "You approved the animatic. It is the plan the build follows, scene by scene.")
            } else {
                Placeholder(symbol: "play.rectangle", text: "Putting the scenes on a timeline with the music. It will ask for your notes next.")
            }
            let frames = snapshot.keyframes.filter { $0.kind == .keyframe || $0.kind == .storyboard }
            if !frames.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(frames) { frame in
                            PosterImage(url: frame.url, maxPixels: 360).frame(width: 120, height: 68)
                                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                                .overlay { RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                                .accessibilityLabel(frame.label)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Build: scenes filling in

struct BuildCard: View {
    let snapshot: FilmProgressSnapshot
    let now: Date

    var body: some View {
        let scenes = snapshot.scenes
        let done = scenes.filter { $0.state == .done }.count
        let working = scenes.filter { $0.state == .working }
        VStack(alignment: .leading, spacing: 16) {
            if scenes.isEmpty {
                Placeholder(symbol: "hammer", text: "The set builder is making the shared room first. Scenes appear here as the animators start.")
            } else {
                HStack(alignment: .top, spacing: 20) {
                    VStack(alignment: .leading, spacing: 14) {
                        newest(scenes: scenes, working: working.first)
                        if !snapshot.buildStages.isEmpty { stages }
                    }
                    .frame(width: 300)
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            StageSectionTitle("Scenes · \(done) of \(scenes.count) built")
                            Spacer()
                            Text("\(Int(scenes.reduce(0) { $0 + $1.duration }.rounded())) s film").font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit()
                        }
                        ThinBar(fraction: (Double(done) + Double(working.count) * 0.4) / Double(scenes.count), tint: Color.rasan)
                        let columns = [GridItem(.adaptive(minimum: 104, maximum: 150), spacing: 10, alignment: .top)]
                        LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
                            ForEach(Array(scenes.enumerated()), id: \.element.id) { index, scene in SceneTile(scene: scene, index: index + 1) }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func newest(scenes: [SceneProgress], working: SceneProgress?) -> some View {
        if let still = snapshot.newestStill {
            VStack(alignment: .leading, spacing: 6) {
                ZStack(alignment: .bottomLeading) {
                    Color(nsColor: .underPageBackgroundColor)
                    PosterImage(url: still, maxPixels: 1100).id(still).transition(.opacity)
                    HStack(spacing: 6) {
                        if working != nil { Circle().fill(Color.rasan).frame(width: 6, height: 6) }
                        Text("Newest still").font(.system(size: 10.5, weight: .semibold)).tracking(0.3)
                    }
                    .padding(.horizontal, 9).padding(.vertical, 5).background(.ultraThinMaterial, in: Capsule()).padding(10)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .aspectRatioBox(16.0 / 9.0)
                .frame(width: 300)
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                .shadow(color: .black.opacity(0.22), radius: 16, y: 8)
                .animation(.smooth(duration: 0.5), value: still)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Newest built still")
            }
        }
    }

    private var stages: some View {
        FlowLayout(spacing: 8) {
            ForEach(Array(snapshot.buildStages.enumerated()), id: \.offset) { _, stage in
                Text(stage).font(.system(size: 11.5)).padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Color(nsColor: .quaternaryLabelColor).opacity(0.22), in: Capsule())
            }
        }
    }
}

struct SceneTile: View {
    let scene: SceneProgress
    let index: Int
    @State private var pulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(nsColor: .quaternaryLabelColor).opacity(scene.state == .todo ? 0.14 : 0.3))
                switch scene.state {
                case .done:
                    if let url = scene.thumbnailURL { PosterImage(url: url, maxPixels: 420).transition(.opacity) }
                    else { Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(.secondary) }
                case .working:
                    if let url = scene.thumbnailURL { PosterImage(url: url, maxPixels: 420).opacity(0.55) }
                    RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.rasan.opacity(pulse ? 0.26 : 0.08))
                    ProgressView().controlSize(.small)
                case .todo: EmptyView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.clear)
            .aspectRatioBox(16.0 / 9.0)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(scene.state == .working ? Color.rasan.opacity(0.85) : Color(nsColor: .separatorColor).opacity(scene.state == .todo ? 0.9 : 0.5),
                                  style: StrokeStyle(lineWidth: scene.state == .working ? 1.5 : 0.5, dash: scene.state == .todo ? [3, 3] : []))
            }
            HStack(spacing: 4) {
                Text("\(index)").font(.system(size: 10, weight: .semibold)).monospacedDigit().foregroundStyle(.tertiary)
                Text(scene.title).font(.system(size: 11)).foregroundStyle(scene.state == .todo ? .secondary : .primary).lineLimit(1)
            }
        }
        .onAppear {
            guard scene.state == .working else { return }
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { pulse = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Scene \(index), \(scene.title), \(scene.state == .done ? "built" : scene.state == .working ? "building now" : "waiting"), \(Int(scene.duration.rounded())) seconds")
    }
}

// MARK: - Check: critic findings and draft renders

struct CheckCard: View {
    let snapshot: FilmProgressSnapshot
    let aspect: Double

    var body: some View {
        let findings = snapshot.criticFindings
        let drafts = snapshot.drafts
        VStack(alignment: .leading, spacing: 20) {
            if !drafts.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    StageSectionTitle("Draft renders · \(drafts.count)")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 14) {
                            ForEach(drafts.sorted { $0.finishedAt > $1.finishedAt }) { draft in
                                VideoTile(url: draft.url, title: draft.name, subtitle: ByteCountFormatter.string(fromByteCount: draft.sizeBytes, countStyle: .file), aspect: aspect, width: 252)
                            }
                        }
                        .padding(.vertical, 6).padding(.horizontal, 2)
                    }
                }
            }
            if findings.isEmpty {
                Placeholder(symbol: "checkmark.seal", text: drafts.isEmpty ? "The gates and the critics look at the built film next. What they find shows up here, with what was fixed." : "No findings yet.")
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    let rounds = Dictionary(grouping: findings, by: \.round).keys.sorted()
                    ForEach(rounds, id: \.self) { round in
                        VStack(alignment: .leading, spacing: 4) {
                            StageSectionTitle(round <= 0 ? "Automatic checks" : "Round \(round)")
                            ForEach(findings.filter { $0.round == round }) { FindingRow(finding: $0) }
                        }
                    }
                }
            }
        }
    }
}

struct FindingRow: View {
    let finding: CriticFinding
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            icon.frame(width: 18, height: 18).padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(finding.summary).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                Text("\(finding.source) · \(label)").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(finding.source), \(label): \(finding.summary)")
    }
    private var label: String {
        switch finding.state { case .found: "found"; case .fixing: "fixing"; case .fixed: "fixed"; case .clean: "clean" }
    }
    @ViewBuilder private var icon: some View {
        switch finding.state {
        case .found: Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange)
        case .fixing: ProgressView().controlSize(.mini)
        case .fixed: Image(systemName: "checkmark.circle.fill").foregroundStyle(Color(nsColor: .systemGreen))
        case .clean: Image(systemName: "checkmark.seal.fill").foregroundStyle(Color(nsColor: .systemGreen))
        }
    }
}

// MARK: - Render

struct RenderCard: View {
    let snapshot: FilmProgressSnapshot
    let now: Date
    let aspect: Double

    var body: some View {
        let r = snapshot.render
        VStack(alignment: .leading, spacing: 16) {
            if r.kind == .none || r.state == .notStarted {
                Placeholder(symbol: "film", text: "The final renders once the checks pass, with real motion blur and a fine grain. Progress shows here.")
            } else {
                HStack(alignment: .center, spacing: 24) {
                    ProgressRing(render: r)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(headline(r)).font(.system(size: 16, weight: .semibold)).monospacedDigit()
                        if let eta = r.etaSeconds, r.state == .rendering {
                            Text("\(FilmProgressFormat.about(eta)) left").font(.system(size: 13)).foregroundStyle(Color.rasan).fontWeight(.medium)
                        } else if !r.isMeasured, r.state != .done {
                            Text("Progress isn't reported for this render. Elapsed time is exact.").font(.system(size: 12.5)).foregroundStyle(.secondary)
                        }
                        if let stage = r.stage, !stage.isEmpty, r.state != .done {
                            Text(stage).font(.system(size: 11.5, design: .monospaced)).foregroundStyle(.secondary).lineLimit(2)
                        }
                        Text("\(FilmProgressFormat.duration(r.elapsed(now: now))) \(r.state == .done ? "to render" : "elapsed")")
                            .font(.system(size: 12)).foregroundStyle(.tertiary).monospacedDigit()
                        if r.state == .done, let video = r.videoURL {
                            Button { NSWorkspace.shared.activateFileViewerSelecting([video]) } label: { Label("Show in Finder", systemImage: "folder") }
                                .controlSize(.small).padding(.top, 4)
                        }
                    }
                    Spacer(minLength: 0)
                    poster(r)
                }
            }
        }
    }

    private func headline(_ r: RenderProgress) -> String {
        let kind = r.kind == .final ? "Final" : "Draft"
        switch r.state {
        case .notStarted: return ""
        case .preparing: return "Getting the \(kind.lowercased()) ready"
        case .rendering:
            if let done = r.framesDone, let total = r.framesTotal { return "\(done.formatted()) of \(total.formatted()) frames" }
            return "Rendering the \(kind.lowercased())"
        case .finishing: return "Assembling the video"
        case .done: return r.kind == .final ? "The final is rendered" : "The draft is rendered"
        }
    }

    @ViewBuilder private func poster(_ r: RenderProgress) -> some View {
        if r.state == .done, let video = r.videoURL {
            VideoTile(url: video, title: r.outputName ?? "final", subtitle: nil, aspect: aspect, width: 300, poster: r.posterURL)
        } else if let poster = r.posterURL {
            ZStack { Color.black; PosterImage(url: poster, maxPixels: 700) }
                .frame(width: 280, height: 280 / aspect)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                .accessibilityLabel("Poster frame")
        }
    }
}

/// A ring with the percent in the middle; a quiet sweeping arc when nothing can be measured.
struct ProgressRing: View {
    let render: RenderProgress
    @State private var spin = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle().stroke(Color(nsColor: .quaternaryLabelColor).opacity(0.35), lineWidth: 9)
            if render.state == .done {
                Circle().trim(from: 0, to: 1).stroke(Color(nsColor: .systemGreen), style: StrokeStyle(lineWidth: 9, lineCap: .round)).rotationEffect(.degrees(-90))
                Image(systemName: "checkmark").font(.system(size: 28, weight: .semibold)).foregroundStyle(Color(nsColor: .systemGreen))
            } else if let fraction = render.fraction {
                Circle().trim(from: 0, to: max(0.012, min(1, fraction)))
                    .stroke(Color.rasan, style: StrokeStyle(lineWidth: 9, lineCap: .round)).rotationEffect(.degrees(-90))
                    .animation(.smooth(duration: 0.6), value: fraction)
                Text("\(Int((fraction * 100).rounded()))%").font(.system(size: 26, weight: .semibold, design: .rounded)).monospacedDigit()
            } else {
                Circle().trim(from: 0, to: 0.28).stroke(Color.rasan, style: StrokeStyle(lineWidth: 9, lineCap: .round))
                    .rotationEffect(.degrees(spin ? 270 : -90))
                Image(systemName: "film").font(.system(size: 24, weight: .light)).foregroundStyle(.secondary)
            }
        }
        .frame(width: 116, height: 116)
        .onAppear {
            guard !reduceMotion, render.fraction == nil else { return }
            withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) { spin = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Render progress")
        .accessibilityValue(render.state == .done ? "Finished" : render.fraction.map { "\(Int(($0 * 100).rounded())) percent" } ?? "Not measurable, in progress")
    }
}

// MARK: - Playable video thumbnail

extension Notification.Name { static let rasanVideoDidStart = Notification.Name("rasanai.progress.videoDidStart") }

/// A video as a poster with a play button; click and it plays right there with the system controls. One plays at a time.
struct VideoTile: View {
    let url: URL
    let title: String
    var subtitle: String?
    var aspect: Double = 16.0 / 9.0
    var width: CGFloat = 252
    var poster: URL?
    @State private var posterImage: NSImage?
    @State private var player: AVPlayer?
    @State private var hovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                Color.black
                if let player {
                    VideoPlayer(player: player)
                } else {
                    if let posterImage { Image(nsImage: posterImage).resizable().scaledToFit() }
                    Button(action: play) {
                        Image(systemName: "play.fill").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 42, height: 42).background(.black.opacity(hovering ? 0.62 : 0.45), in: Circle())
                            .overlay { Circle().strokeBorder(.white.opacity(0.35), lineWidth: 0.75) }
                            .scaleEffect(hovering ? 1.06 : 1)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Play \(title)")
                }
            }
            .frame(width: width, height: width / aspect)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
            .shadow(color: .black.opacity(0.14), radius: 8, y: 4)
            .onHover { hovering = $0 }
            HStack(spacing: 6) {
                Text(title).font(.system(size: 12, weight: .medium)).lineLimit(1)
                if let subtitle { Text(subtitle).font(.system(size: 11)).foregroundStyle(.tertiary) }
            }
        }
        .frame(width: width, alignment: .leading)
        .task(id: url) { posterImage = await VideoPosters.image(for: poster ?? url, isVideo: poster == nil) }
        .onReceive(NotificationCenter.default.publisher(for: .rasanVideoDidStart)) { note in
            if (note.object as? URL) != url, player != nil { player?.pause(); player = nil }
        }
        .onDisappear { player?.pause(); player = nil }
    }

    private func play() {
        NotificationCenter.default.post(name: .rasanVideoDidStart, object: url)
        let next = AVPlayer(url: url)
        player = next
        next.play()
    }
}

/// First-frame posters for videos (and downsampled stills), cached so scrolling and re-renders stay cheap.
enum VideoPosters {
    nonisolated(unsafe) private static let cache = NSCache<NSURL, NSImage>()
    static func image(for url: URL, isVideo: Bool) async -> NSImage? {
        if let hit = cache.object(forKey: url as NSURL) { return hit }
        let made: NSImage? = await Task.detached(priority: .utility) { () -> NSImage? in
            if isVideo {
                let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
                generator.appliesPreferredTrackTransform = true
                generator.maximumSize = CGSize(width: 720, height: 720)
                // A frame from about a third of the way in reads better than the first one, which is often a title card or black.
                let length = (try? await AVURLAsset(url: url).load(.duration).seconds) ?? 3
                let at = length.isFinite && length > 3 ? length * 0.35 : 1.0
                generator.requestedTimeToleranceBefore = CMTime(seconds: 1, preferredTimescale: 600); generator.requestedTimeToleranceAfter = CMTime(seconds: 1, preferredTimescale: 600)
                guard let result = try? await generator.image(at: CMTime(seconds: at, preferredTimescale: 600)) else { return nil }
                return NSImage(cgImage: result.image, size: NSSize(width: result.image.width, height: result.image.height))
            }
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 720] as CFDictionary) else { return nil }
            return NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
        }.value
        if let made { cache.setObject(made, forKey: url as NSURL) }
        return made
    }
}


extension View {
    /// Gives the view an exact aspect box that its content (a filled image) can never grow beyond, then clips to it.
    func aspectRatioBox(_ ratio: Double) -> some View {
        Color.clear.aspectRatio(ratio, contentMode: .fit).overlay { self }.clipped()
    }
}
