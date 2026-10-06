import StudioCore
import SwiftUI

/// The build: the newest built still large, the scene strip filling in, the pipeline's stage chips and a log.
/// Nothing to decide here (the director builds; Tell Claude and Decisions live in the window chrome), so no action bar.
struct BuildStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var logOpen = false
    @State private var seenAt = Date()

    private struct BuildScene: Identifiable {
        let id: Int
        let title: String
        let duration: Double
        let state: String
        let still: String?
    }

    private static let stageOrder: [(id: String, label: String, symbol: String)] = [
        ("handoff", "Handoff", "paperplane"), ("plan", "Plan", "list.bullet.rectangle"), ("design", "Design", "paintpalette"),
        ("build", "Build", "hammer"), ("verify", "Verify", "checkmark.seal"), ("obey", "Obey", "scope"), ("render-gate", "Render gate", "film"),
    ]

    private var payload: JSONValue { model.payload("build") }

    private var scenes: [BuildScene] {
        var list = payload["scenes"].array
        if list.isEmpty { list = model.payload("animatic")["scenes"].array }
        if list.isEmpty { list = model.payload("scenes")["scenes"].array }
        let done = model.status("build") == "done"
        return list.enumerated().map { index, scene in
            let still = scene["frame"].string ?? scene["thumb"].string
            var state = scene["state"].string ?? "todo"
            if done { state = "done" }
            return BuildScene(id: index, title: scene["title"].string ?? "Scene \(index + 1)",
                              duration: max(0.5, scene["duration"].number ?? scene["duration_s"].number ?? 1),
                              state: state, still: still)
        }
    }

    private var latest: String? {
        if let value = payload["latest"].string { return value }
        if let value = payload["latest"]["frame"].string { return value }
        return scenes.last { $0.state == "done" && $0.still != nil }?.still
    }

    private var stageStates: [String: String] {
        payload["stages"].object.compactMapValues { value in value.string ?? value["status"].string }
    }

    private var log: [JSONValue] { payload["log"].array }

    private var progress: Double {
        let list = scenes
        let done = Double(list.filter { $0.state == "done" }.count)
        let working = Double(list.filter { $0.state == "working" }.count) * 0.45
        let sceneShare = list.isEmpty ? 0 : (done + working) / Double(list.count)
        let states = stageStates
        let stageShare = Double(Self.stageOrder.filter { states[$0.id] == "done" }.count) / Double(Self.stageOrder.count)
        if states["render-gate"] == "done" || model.status("build") == "done" { return 1 }
        return list.isEmpty ? stageShare : min(0.98, sceneShare * 0.85 + stageShare * 0.15)
    }

    private var isDone: Bool { model.status("build") == "done" || stageStates["render-gate"] == "done" }

    /// "About 3 min left", from real progress once there is enough to go on.
    private func remaining(now: Date) -> String? {
        let p = progress
        guard !isDone, p >= 0.12, p < 0.98 else { return nil }
        let elapsed = now.timeIntervalSince(seenAt)
        guard elapsed > 20 else { return nil }
        let seconds = elapsed * (1 - p) / p
        if seconds < 75 { return "Under a minute left" }
        return "About \(Int((seconds / 60).rounded())) min left"
    }

    private var headline: String {
        if model.status("build") == "done" || stageStates["render-gate"] == "done" { return "Built" }
        return payload["question"].string ?? "Building your film"
    }

    private var statusLine: String {
        if let message = model.workingMessage, !message.isEmpty { return message }
        let list = scenes
        if let working = list.firstIndex(where: { $0.state == "working" }) { return "Scene \(working + 1) of \(list.count): \(list[working].title)" }
        let done = list.filter { $0.state == "done" }.count
        if !list.isEmpty { return "\(done) of \(list.count) scenes built" }
        return "Getting the build ready"
    }

    var body: some View {
        let list = scenes
        let aspect = model.snapshot.aspectRatio
        StageScaffold(model: model, step: step, question: headline,
                      context: isDone ? nil : "Nothing needed from you. You can leave this window; if notifications are on, Studio tells you when it's ready to review.",
                      maxWidth: 960) {
            VStack(alignment: .leading, spacing: 20) {
                progressBlock
                stillBlock(aspect: aspect, scenes: list)
                if !list.isEmpty { stripBlock(list) }
                detailsBlock
            }
        }
        .environment(model)
    }

    // MARK: Progress

    private var progressBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(statusLine).font(.system(size: 14)).foregroundStyle(.secondary).lineLimit(2)
                    .contentTransition(.opacity).animation(.smooth, value: statusLine)
                Spacer()
                TimelineView(.periodic(from: .now, by: 5)) { context in
                    Text([remaining(now: context.date), "\(Int((progress * 100).rounded()))%"].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 13, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(.secondary)
                        .contentTransition(.numericText()).animation(.smooth, value: progress)
                }
            }
            ProgressView(value: progress).progressViewStyle(.linear).tint(Color.rasan)
                .animation(.smooth(duration: 0.6), value: progress)
                .accessibilityLabel("Build progress").accessibilityValue("\(Int((progress * 100).rounded())) percent")
        }
    }

    // MARK: Newest still

    private func stillBlock(aspect: Double, scenes: [BuildScene]) -> some View {
        let building = scenes.first { $0.state == "working" }
        return ZStack(alignment: .bottomLeading) {
            Color(nsColor: .underPageBackgroundColor)
            if let latest {
                PayloadImage(path: latest, contentMode: .fit, maxPixels: 1800)
                    .id(latest)
                    .transition(.opacity.combined(with: .scale(scale: 1.015)))
            } else {
                WaitingStill()
            }
            HStack(spacing: 8) {
                if building != nil { PulsingDot() }
                Text(latest != nil ? "Newest still" : "First still on its way")
                    .font(.system(size: 11, weight: .semibold)).tracking(0.4)
                if let building { Text("· building \(building.title)").font(.system(size: 11)).opacity(0.8) }
            }
            .padding(.horizontal, 11).padding(.vertical, 6)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(14)
        }
        .aspectRatio(aspect, contentMode: .fit)
        .frame(maxWidth: 300 * aspect)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
        .shadow(color: .black.opacity(0.22), radius: 22, y: 10)
        .animation(.smooth(duration: 0.5), value: latest)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(latest != nil ? "Newest built still" : "Waiting for the first still")
    }

    // MARK: Scene strip

    private func stripBlock(_ list: [BuildScene]) -> some View {
        let total = list.reduce(0) { $0 + $1.duration }
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                StageSectionTitle("Scenes")
                Spacer()
                Text("\(list.filter { $0.state == "done" }.count) of \(list.count) built · \(clockText(total))")
                    .font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit()
            }
            GeometryReader { proxy in
                let gap: CGFloat = 5
                let usable = max(10, proxy.size.width - gap * CGFloat(list.count - 1))
                HStack(alignment: .top, spacing: gap) {
                    ForEach(list) { scene in
                        SceneCell(scene: scene.title, index: scene.id + 1, state: scene.state, still: scene.still, duration: scene.duration)
                            .frame(width: max(44, usable * scene.duration / max(total, 0.1)))
                    }
                }
            }
            .frame(height: 104)
            .animation(.smooth(duration: 0.4), value: list.map(\.state))
        }
    }

    // MARK: Details (pipeline + log)

    private var detailsBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            logBlock
            if logOpen { stageChips }
        }
    }

    // MARK: Stage chips

    private var stageChips: some View {
        let states = stageStates
        return VStack(alignment: .leading, spacing: 8) {
            StageSectionTitle("Pipeline")
            FlowLayout(spacing: 8) {
                ForEach(Self.stageOrder, id: \.id) { stage in
                    StageChip(label: stage.label, symbol: stage.symbol, state: states[stage.id] ?? "todo")
                }
            }
        }
    }

    // MARK: Log

    private var logBlock: some View {
        DisclosureGroup(isExpanded: $logOpen) {
            if log.isEmpty {
                Text("Nothing logged yet.").font(.system(size: 12)).foregroundStyle(.secondary).padding(.top, 8)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(Array(log.suffix(200).enumerated()), id: \.offset) { _, entry in
                            LogLine(entry: entry)
                        }
                    }
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 220)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.55), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                .padding(.top, 8)
            }
        } label: {
            HStack(spacing: 8) {
                Text("Details").font(.system(size: 13, weight: .semibold))
                if let last = log.last, !logOpen {
                    Text(last["msg"].string ?? "").font(.system(size: 12, design: .monospaced)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                if warnCount > 0 {
                    Label("\(warnCount)", systemImage: "exclamationmark.triangle.fill").font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.orange).labelStyle(.titleAndIcon)
                        .accessibilityLabel("\(warnCount) warnings")
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { withAnimation(.smooth) { logOpen.toggle() } }
        }
        .accessibilityLabel("Build log")
    }

    private var warnCount: Int { log.filter { ["warn", "error"].contains($0["level"].string ?? "") }.count }
}

// MARK: - Pieces

private struct SceneCell: View {
    let scene: String
    let index: Int
    let state: String
    let still: String?
    let duration: Double
    @State private var pulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(nsColor: .quaternaryLabelColor).opacity(state == "todo" ? 0.18 : 0.35))
                if state == "done", let still {
                    PayloadImage(path: still, contentMode: .fill, maxPixels: 520).transition(.opacity)
                } else if state == "working" {
                    RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.rasan.opacity(pulse ? 0.30 : 0.10))
                    ProgressView().controlSize(.small)
                } else if state == "done" {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(.secondary)
                } else if state == "failed" {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                }
            }
            .frame(height: 70)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(state == "working" ? Color.rasan.opacity(0.8) : Color(nsColor: .separatorColor).opacity(state == "todo" ? 0.9 : 0.5),
                                  style: StrokeStyle(lineWidth: state == "working" ? 1.5 : 0.5, dash: state == "todo" ? [3, 3] : []))
            }
            HStack(spacing: 4) {
                Text("\(index)").font(.system(size: 10, weight: .semibold)).monospacedDigit().foregroundStyle(.tertiary)
                Text(scene).font(.system(size: 11)).foregroundStyle(state == "todo" ? .secondary : .primary).lineLimit(1)
            }
        }
        .onAppear {
            guard state == "working" else { return }
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { pulse = true }
        }
        .onChange(of: state) { _, new in
            if new == "working" { withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { pulse = true } }
            else { withAnimation(.default) { pulse = false } }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Scene \(index), \(scene), \(state == "done" ? "built" : state == "working" ? "building now" : state == "failed" ? "failed" : "waiting"), \(Int(duration.rounded())) seconds")
    }
}

private struct StageChip: View {
    let label: String
    let symbol: String
    let state: String
    var body: some View {
        HStack(spacing: 6) {
            switch state {
            case "done": Image(systemName: "checkmark.circle.fill").foregroundStyle(Color(nsColor: .systemGreen))
            case "failed": Image(systemName: "xmark.octagon.fill").foregroundStyle(Color(nsColor: .systemRed))
            case "working": ProgressView().controlSize(.mini).scaleEffect(0.8).frame(width: 14, height: 14)
            default: Image(systemName: symbol).foregroundStyle(.tertiary)
            }
            Text(label).font(.system(size: 12, weight: state == "working" ? .semibold : .regular))
                .foregroundStyle(state == "todo" ? .secondary : .primary)
        }
        .padding(.horizontal, 11).padding(.vertical, 6)
        .background(tint.opacity(state == "todo" ? 0 : 0.12), in: Capsule())
        .overlay { Capsule().strokeBorder(state == "todo" ? Color(nsColor: .separatorColor) : tint.opacity(0.45), lineWidth: 0.75) }
        .animation(.smooth, value: state)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(state == "done" ? "done" : state == "working" ? "in progress" : state == "failed" ? "failed" : "waiting")")
    }
    private var tint: Color {
        switch state {
        case "done": Color(nsColor: .systemGreen)
        case "failed": Color(nsColor: .systemRed)
        case "working": Color.rasan
        default: Color.secondary
        }
    }
}

private struct LogLine: View {
    let entry: JSONValue
    var body: some View {
        let level = entry["level"].string ?? "info"
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(Self.clock(entry["t"].string)).foregroundStyle(.tertiary)
            Text(tag(level)).fontWeight(.semibold).foregroundStyle(color(level)).frame(width: 34, alignment: .leading)
            Text(entry["msg"].string ?? "").foregroundStyle(level == "info" ? Color.primary : color(level)).textSelection(.enabled)
        }
        .font(.system(size: 11.5, design: .monospaced))
        .accessibilityElement(children: .combine)
    }
    private func tag(_ level: String) -> String {
        switch level { case "ok": "OK"; case "warn": "WARN"; case "error": "ERR"; default: "INFO" }
    }
    private func color(_ level: String) -> Color {
        switch level {
        case "ok": Color(nsColor: .systemGreen)
        case "warn": Color(nsColor: .systemOrange)
        case "error": Color(nsColor: .systemRed)
        default: Color.secondary
        }
    }
    static func clock(_ iso: String?) -> String {
        guard let iso else { return "--:--:--" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return String(iso.suffix(8)) }
        let out = DateFormatter(); out.dateFormat = "HH:mm:ss"
        return out.string(from: date)
    }
}

private struct PulsingDot: View {
    @State private var on = false
    var body: some View {
        Circle().fill(Color.rasan).frame(width: 7, height: 7)
            .opacity(on ? 0.35 : 1)
            .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { on = true } }
            .accessibilityHidden(true)
    }
}

private struct WaitingStill: View {
    @State private var phase = false
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.rasan.opacity(phase ? 0.20 : 0.06), Color(nsColor: .underPageBackgroundColor)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            Image(systemName: "film.stack").font(.system(size: 34, weight: .light)).foregroundStyle(.tertiary)
        }
        .onAppear { withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) { phase = true } }
    }
}
