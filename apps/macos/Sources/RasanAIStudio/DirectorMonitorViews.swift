import AppKit
import StudioCore
import SwiftUI

// MARK: Look of each health state

extension DirectorHealthState {
    var tint: Color {
        switch self {
        case .working, .thinking, .finished: Color(nsColor: .systemGreen)
        case .starting, .stopped, .paused: Color(nsColor: .tertiaryLabelColor)
        case .waitingForYou, .quiet: Color(nsColor: .systemOrange)
        case .possiblyLooping, .failed: Color(nsColor: .systemRed)
        }
    }
    var tone: StatusTone {
        switch self {
        case .working, .thinking, .finished: .good
        case .waitingForYou, .quiet: .warn
        case .possiblyLooping, .failed: .bad
        case .starting, .stopped, .paused: .quiet
        }
    }
    var symbol: String {
        switch self {
        case .working: "bolt.fill"
        case .thinking: "ellipsis.circle.fill"
        case .waitingForYou: "hand.raised.fill"
        case .quiet: "moon.zzz.fill"
        case .possiblyLooping: "exclamationmark.arrow.triangle.2.circlepath"
        case .finished: "checkmark.circle.fill"
        case .failed: "xmark.octagon.fill"
        case .stopped, .paused: "pause.circle.fill"
        case .starting: "hourglass"
        }
    }
    var isLive: Bool { self == .working || self == .thinking || self == .starting }
}

extension DirectorEvent.Kind {
    var symbol: String {
        switch self {
        case .start: "play.circle"
        case .tool: "wrench.and.screwdriver"
        case .message: "text.bubble"
        case .push: "rectangle.on.rectangle"
        case .ask: "questionmark.bubble"
        case .result: "checkmark.circle"
        case .warning: "exclamationmark.triangle"
        case .error: "xmark.octagon"
        }
    }
    var tint: Color {
        switch self {
        case .push, .ask: .rasan
        case .result: Color(nsColor: .systemGreen)
        case .warning: Color(nsColor: .systemOrange)
        case .error: Color(nsColor: .systemRed)
        default: Color(nsColor: .tertiaryLabelColor)
        }
    }
}

// MARK: Toolbar pill text

extension DirectorMonitor {
    /// Cost is quiet by default: it shows on hover, and on its own once the film nears the budget the person set (80%).
    static func costVisible(usd: Double, limit: Double, includedInPlan: Bool, hovering: Bool) -> Bool {
        guard !includedInPlan, usd > 0 else { return false }
        return hovering || (limit > 0 && usd >= limit * 0.8)
    }

    /// "182k tokens" for the film whose run is being watched (with " · $1.42 est." when `showCost`); nil otherwise. State words live in `TurnLine`.
    func pillText(for filmRun: URL?, showCost: Bool = true) -> String? {
        guard let filmRun, filmRun == run, hasData else { return nil }
        var parts = ["\(UsageFormat.tokens(telemetry.tokens.fresh)) tokens"]
        let cost = telemetry.cost
        if showCost, !cost.isIncludedInPlan, cost.usd > 0 { parts.append(UsageFormat.cost(cost)) }
        return parts.joined(separator: " · ")
    }
}

// MARK: Director panel (the popover behind the pill)

struct DirectorMonitorPanel: View {
    var monitor: DirectorMonitor
    @Environment(\.agentName) private var agent
    /// The film's phases, for the per-phase cost table. `nil` hides the table.
    var progress: FilmProgressSnapshot?
    var dismiss: () -> Void = {}

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            content(now: context.date)
        }
        .frame(width: 408)
    }

    @ViewBuilder private func content(now: Date) -> some View {
        let t = monitor.telemetry
        let health = monitor.health
        VStack(alignment: .leading, spacing: 0) {
            header(health: health, now: now)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let health, health.state == .possiblyLooping { loopWarning(health) }
                    if let limit = monitor.budgetLimit { budgetCard(limit) }
                    usage(t)
                    cost(t)
                    if let progress { PhaseCostTable(snapshot: progress, now: now) }
                    work(t, now: now)
                    timeline(t, now: now)
                }
                .padding(16)
            }
            .frame(maxHeight: 520)
            Divider()
            footer(health)
        }
    }

    // Header: what state, what it means, how long.
    private func header(health: DirectorHealth?, now: Date) -> some View {
        let state = health?.state ?? .starting
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: state.symbol).foregroundStyle(state.tint).font(.system(size: 15, weight: .semibold))
                Text(health?.label ?? "Starting").font(.system(size: 16, weight: .semibold))
                Spacer()
                Text("\(UsageFormat.span(monitor.telemetry.elapsed(now: now))) elapsed").font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit()
            }
            Text(detailText(health, now: now)).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
    }

    /// The health sentence, freshened to the clock so "No activity for 3 min" keeps counting between ticks.
    private func detailText(_ health: DirectorHealth?, now: Date) -> String {
        guard let health else { return "The director is getting ready." }
        if health.state == .possiblyLooping { return "It looks like it is repeating itself. Details below." }
        if health.state == .quiet, monitor.telemetry.toolInFlight == nil, let last = monitor.telemetry.lastEventAt {
            let what = monitor.telemetry.lastToolSummary.map { " Last: \($0)." } ?? ""
            return "No activity for \(UsageFormat.span(max(0, now.timeIntervalSince(last)))).\(what)"
        }
        return health.detail
    }

    private func loopWarning(_ health: DirectorHealth) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("This may be stuck in a loop", systemImage: "exclamationmark.triangle.fill")
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(nsColor: .systemRed))
            Text(health.loopReason ?? health.detail).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
            Text("If it is, it is spending tokens without making progress. Stopping keeps your files; you can resume later.")
                .font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Pause") { monitor.actions.pause(); dismiss() }
                Button("Message \(agent)…") { dismiss(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { monitor.actions.tell() } }
                Spacer()
            }.controlSize(.regular)
        }
        .padding(12)
        .background(Color(nsColor: .systemRed).opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .systemRed).opacity(0.35), lineWidth: 0.5))
    }

    private func budgetCard(_ limit: Double) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Over your \(UsageFormat.dollars(limit)) budget", systemImage: "dollarsign.circle.fill")
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(nsColor: .systemOrange))
            Text("This film has used about \(UsageFormat.dollars(monitor.telemetry.cost.usd)) so far.").font(.system(size: 12))
            HStack {
                Button("Pause") { monitor.actions.pause(); dismiss() }
                Button("Keep going") { monitor.dismissBudgetWarning() }
                Spacer()
            }
        }
        .padding(12)
        .background(Color(nsColor: .systemOrange).opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // Tokens
    private func usage(_ t: DirectorTelemetry) -> some View {
        let tokens = t.tokens
        return VStack(alignment: .leading, spacing: 10) {
            StageSectionTitle("Tokens")
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(UsageFormat.tokens(tokens.fresh)).font(.system(size: 26, weight: .semibold, design: .rounded)).monospacedDigit()
                Text("used, not counting cache reads").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            if t.toolInFlight != nil, t.toolInFlightIsLocalJob {
                Text("Holding still while the render runs on your Mac. Claude is not called until it finishes.")
                    .font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 5) {
                GridRow { stat("Input", tokens.input); stat("Output", tokens.output) }
                GridRow { stat("Cache written", tokens.cacheWrite); stat("Cache read", tokens.cacheRead) }
            }
        }
    }

    private func stat(_ label: String, _ value: Int) -> some View {
        HStack(spacing: 6) {
            Text(label).font(.system(size: 12)).foregroundStyle(.secondary)
            Text(UsageFormat.tokens(value)).font(.system(size: 12, weight: .medium)).monospacedDigit()
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    // Cost
    private func cost(_ t: DirectorTelemetry) -> some View {
        let cost = t.cost
        return VStack(alignment: .leading, spacing: 8) {
            StageSectionTitle("Cost")
            if cost.isIncludedInPlan {
                Text("Included in your ChatGPT plan").font(.system(size: 15, weight: .semibold))
                Text("Codex on a ChatGPT plan has no per-token charge. Tokens still count toward your plan's limits.")
                    .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            } else {
                Text(UsageFormat.cost(cost)).font(.system(size: 26, weight: .semibold, design: .rounded)).monospacedDigit()
                Group {
                    if cost.reportedUSD > 0, cost.estimatedUSD > 0.0001 {
                        Text("\(UsageFormat.dollars(cost.reportedUSD)) reported by \(monitor.agentTitle) plus \(UsageFormat.dollars(cost.estimatedUSD)) estimated for the run in progress.")
                    } else if cost.reportedUSD > 0 {
                        Text("Reported by \(monitor.agentTitle) at API list prices. On a subscription plan this is not billed per token.")
                    } else {
                        Text("Estimated from list prices. \(monitor.agentTitle) reports the exact figure when the run ends.")
                    }
                }.font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            let models = t.modelNames
            if !models.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(models, id: \.self) { model in
                        chip(ModelPricing.displayName(model) + " · " + UsageFormat.tokens(t.models[model]?.total ?? 0))
                    }
                }
            }
        }
    }

    // Turns and tool calls
    private func work(_ t: DirectorTelemetry, now: Date) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            StageSectionTitle("Work")
            HStack(spacing: 18) {
                stat("Turns", t.turns)
                stat("Tool calls", t.totalToolCalls)
                if t.toolErrors > 0 { stat("Errors", t.toolErrors) }
            }
            let calls = t.toolCalls.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }.prefix(8)
            if !calls.isEmpty {
                FlowLayout(spacing: 6) { ForEach(Array(calls), id: \.key) { chip("\($0.key) \($0.value)") } }
            }
            if let last = t.lastToolSummary, let when = t.lastToolAt {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("Last thing it did").font(.system(size: 12)).foregroundStyle(.secondary)
                    Text("\(last) · \(UsageFormat.span(max(0, now.timeIntervalSince(when)))) ago").font(.system(size: 12)).lineLimit(2)
                }
            }
        }
    }

    private func chip(_ text: String) -> some View {
        Text(text).font(.system(size: 11)).monospacedDigit().padding(.horizontal, 9).padding(.vertical, 3)
            .background(Color(nsColor: .quaternaryLabelColor).opacity(0.4), in: Capsule())
    }

    // Timeline
    private func timeline(_ t: DirectorTelemetry, now: Date) -> some View {
        let events = Array(t.events.suffix(20).reversed())
        return VStack(alignment: .leading, spacing: 6) {
            StageSectionTitle("Recent activity")
            if events.isEmpty {
                Text("Nothing yet.").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            ForEach(events) { event in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: event.kind.symbol).font(.system(size: 10, weight: .semibold)).foregroundStyle(event.kind.tint).frame(width: 14)
                    Text(event.text).font(.system(size: 12)).foregroundStyle(event.kind == .tool || event.kind == .start ? .secondary : .primary)
                        .lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                    Text(UsageFormat.span(max(0, now.timeIntervalSince(event.time)))).font(.system(size: 11)).foregroundStyle(.tertiary).monospacedDigit()
                }
            }
        }
    }

    private func footer(_ health: DirectorHealth?) -> some View {
        HStack {
            Button { monitor.actions.showLog(); dismiss() } label: { Label("Show log", systemImage: "text.alignleft") }
            Spacer()
            if monitor.isLive, monitor.canPause {
                Button { monitor.actions.pause(); dismiss() } label: { Label("Pause", systemImage: "pause.fill") }
                    .help("Pause freezes it in place. Resume carries on exactly where it was.")
            }
        }
        .controlSize(.regular).padding(.horizontal, 16).padding(.vertical, 10)
    }
}

// MARK: Budget banner (top of the film page)

struct MonitorBudgetBanner: View {
    var store: StudioStore
    var body: some View {
        let monitor = store.monitor
        if monitor.run == store.runURL, let paused = monitor.autoPaused, paused.kind == .loop {
            banner(symbol: "exclamationmark.arrow.triangle.2.circlepath", tint: .systemRed,
                   title: "Paused: the director looked stuck",
                   detail: paused.reason + " Nothing is lost. Resume to let it carry on, or tell it what to do.") {
                Button("Show log") { store.sheet = .log }
                Button("Message \(monitor.agentTitle)…") { store.film?.beginTell() }
                Button("Resume") { store.resumeDirector() }.keyboardShortcut(.defaultAction)
            }
        } else if let limit = monitor.budgetLimit, monitor.run == store.runURL {
            let spent = "About \(UsageFormat.dollars(monitor.telemetry.cost.usd)) so far\(monitor.telemetry.cost.isEstimated ? " (est.)" : "")."
            if monitor.autoPaused?.kind == .budget {
                banner(symbol: "dollarsign.circle.fill", tint: .systemOrange, title: "Paused at your \(UsageFormat.dollars(limit)) budget",
                       detail: spent + " Keep going to resume, or raise the limit.") {
                    Button("Raise by $10") { monitor.raiseBudget(by: 10) }
                    Button("Keep going") { monitor.dismissBudgetWarning() }
                }
            } else {
                banner(symbol: "dollarsign.circle.fill", tint: .systemOrange, title: "This film is over your \(UsageFormat.dollars(limit)) budget",
                       detail: spent + " Pause now, or let it carry on.") {
                    Button("Pause") { store.pauseDirector() }.disabled(!store.canPause)
                    Button("Keep going") { monitor.dismissBudgetWarning() }
                }
            }
        }
    }

    private func banner<Buttons: View>(symbol: String, tint: NSColor, title: String, detail: String, @ViewBuilder buttons: () -> Buttons) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).foregroundStyle(Color(nsColor: tint))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .semibold))
                Text(detail).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            buttons()
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color(nsColor: tint).opacity(0.12))
        .overlay(alignment: .bottom) { Divider() }
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

// MARK: Queue rows and totals

struct QueueUsageLine: View {
    var monitor: DirectorMonitor
    let run: URL?
    let live: Bool
    var body: some View {
        let t = monitor.usage(for: run)
        let health = live && run == monitor.run ? monitor.health : nil
        if t != nil || health != nil {
            TimelineView(.periodic(from: .now, by: live ? 1 : 3600)) { context in
                HStack(spacing: 8) {
                    if let health {
                        HStack(spacing: 5) {
                            Image(systemName: health.state.symbol).font(.system(size: 10, weight: .semibold))
                            Text(health.label).font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundStyle(health.state.tint).padding(.horizontal, 8).padding(.vertical, 3)
                        .background(health.state.tint.opacity(0.14), in: Capsule())
                    }
                    if let t, t.hasData {
                        let cost = t.cost
                        Text([live ? UsageFormat.span(t.elapsed(now: context.date)) : nil,
                              "\(UsageFormat.tokens(t.tokens.fresh)) tokens",
                              cost.isIncludedInPlan ? nil : (cost.usd > 0 ? UsageFormat.cost(cost) : nil)].compactMap { $0 }.joined(separator: " · "))
                            .font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit()
                        if live, let last = t.lastToolSummary {
                            Text("· \(last)").font(.system(size: 12)).foregroundStyle(.tertiary).lineLimit(1).truncationMode(.tail)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

// MARK: Finished film

struct FinishedUsageLine: View {
    var store: StudioStore
    var body: some View {
        let t = store.monitor.usage(for: store.runURL)
        Group {
            if let t, t.hasData, t.tokens.total > 0 {
                let cost = t.cost
                Text("Made with \(UsageFormat.tokens(t.tokens.fresh)) tokens"
                     + (cost.isIncludedInPlan ? "" : (cost.usd > 0 ? " · \(UsageFormat.cost(cost))" : "")))
                    .font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit()
                    .help("Tokens the director used, not counting cache reads. Totals across every run on this film.")
            }
        }
        .task(id: store.runURL) { if let run = store.runURL { await store.monitor.loadSummary(for: run) } }
    }
}

// MARK: Settings

struct BudgetSetting: View {
    @Bindable var settings: StudioSettings
    var body: some View {
        Toggle("Pause above a spend per film", isOn: Binding(get: { settings.budgetPerFilm > 0 }, set: { settings.budgetPerFilm = $0 ? 10 : 0 }))
        if settings.budgetPerFilm > 0 {
            LabeledContent("Pause above") {
                HStack(spacing: 4) {
                    Text("$")
                    TextField("", value: $settings.budgetPerFilm, format: .number.precision(.fractionLength(0...2)))
                        .multilineTextAlignment(.trailing).frame(width: 70)
                    Text("per film").foregroundStyle(.secondary)
                }
            }
        }
    }
}


// MARK: Cost by phase

/// "Where the money went": one row per phase that has run, with time, tokens and cost, and a bar scaled to the costliest phase.
struct PhaseCostTable: View {
    let snapshot: FilmProgressSnapshot
    let now: Date

    var body: some View {
        let rows = snapshot.phases.filter { $0.startedAt != nil && $0.state != .upcoming && $0.state != .skipped }
        if !rows.isEmpty {
            let top = max(rows.map { snapshot.isIncludedInPlan ? Double($0.tokens.fresh) : $0.costUSD }.max() ?? 0, 0.000_001)
            VStack(alignment: .leading, spacing: 8) {
                StageSectionTitle("Cost by phase")
                VStack(spacing: 0) {
                    ForEach(rows) { row in
                        let weight = snapshot.isIncludedInPlan ? Double(row.tokens.fresh) : row.costUSD
                        HStack(spacing: 10) {
                            Image(systemName: row.phase.symbolName).font(.system(size: 11)).foregroundStyle(row.state == .active ? Color.rasan : Color.secondary).frame(width: 16)
                            Text(row.phase.title).font(.system(size: 12, weight: row.state == .active ? .semibold : .regular)).frame(width: 66, alignment: .leading)
                            GeometryReader { proxy in
                                Capsule().fill(Color.rasan.opacity(0.55)).frame(width: max(2, proxy.size.width * weight / top))
                                    .frame(maxHeight: .infinity, alignment: .center).frame(height: 5)
                                    .frame(maxHeight: .infinity)
                            }
                            .frame(height: 14)
                            Text(FilmProgressFormat.duration(row.workSeconds(now: now))).font(.system(size: 11)).foregroundStyle(.secondary).monospacedDigit().frame(width: 52, alignment: .trailing)
                            Text(row.costText ?? "–").font(.system(size: 12, weight: .medium)).monospacedDigit().frame(width: 74, alignment: .trailing)
                        }
                        .padding(.vertical, 5)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(row.railText(now: now))")
                        if row.id != rows.last?.id { Divider() }
                    }
                    Divider().padding(.top, 2)
                    HStack {
                        Text("Total").font(.system(size: 12, weight: .semibold))
                        Spacer()
                        Text(snapshot.isIncludedInPlan ? FilmProgressFormat.tokens(snapshot.totalTokens.fresh)
                             : (snapshot.costIsEstimated ? "est. " : "") + UsageFormat.dollars(snapshot.totalCostUSD))
                            .font(.system(size: 12, weight: .semibold)).monospacedDigit()
                    }
                    .padding(.top, 6)
                }
                if snapshot.costIsEstimated && !snapshot.isIncludedInPlan {
                    Text("Phases are split by when the work happened, so a phase's figure is an estimate.").font(.system(size: 11)).foregroundStyle(.tertiary)
                }
            }
        }
    }
}
