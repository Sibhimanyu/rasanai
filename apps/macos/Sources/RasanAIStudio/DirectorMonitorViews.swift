import AppKit
import StudioCore
import SwiftUI

// MARK: Look of each health state

extension DirectorHealthState {
    var tint: Color {
        switch self {
        case .working, .thinking, .finished: Color(nsColor: .systemGreen)
        case .starting, .stopped: Color(nsColor: .tertiaryLabelColor)
        case .waitingForYou, .quiet: Color(nsColor: .systemOrange)
        case .possiblyLooping, .failed: Color(nsColor: .systemRed)
        }
    }
    var tone: StatusTone {
        switch self {
        case .working, .thinking, .finished: .good
        case .waitingForYou, .quiet: .warn
        case .possiblyLooping, .failed: .bad
        case .starting, .stopped: .quiet
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
        case .stopped: "pause.circle.fill"
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
    /// "Working · 182k tokens · $1.42 est." for the film whose run is being watched; nil otherwise.
    func pillText(fallback: String, for filmRun: URL?) -> String? {
        guard let filmRun, filmRun == run, hasData, let health else { return nil }
        let label = health.state == .waitingForYou ? fallback : (isLive || health.state == .failed || health.state == .stopped ? health.label : fallback)
        var parts = [label, "\(UsageFormat.tokens(telemetry.tokens.fresh)) tokens"]
        let cost = telemetry.cost
        if cost.isIncludedInPlan { } else if cost.usd > 0 { parts.append(UsageFormat.cost(cost)) }
        return parts.joined(separator: " · ")
    }
}

// MARK: Director panel (the popover behind the pill)

struct DirectorMonitorPanel: View {
    var monitor: DirectorMonitor
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
            Text(detailText(health, now: now)).font(.system(size: 12.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
    }

    /// The health sentence, freshened to the clock so "No activity for 3 min" keeps counting between ticks.
    private func detailText(_ health: DirectorHealth?, now: Date) -> String {
        guard let health else { return "The director is getting ready." }
        if health.state == .possiblyLooping { return "It looks like it is repeating itself. Details below." }
        if health.state == .quiet, let last = monitor.telemetry.lastEventAt {
            let what = monitor.telemetry.lastToolSummary.map { " Last: \($0)." } ?? ""
            return "No activity for \(UsageFormat.span(max(0, now.timeIntervalSince(last)))).\(what)"
        }
        return health.detail
    }

    private func loopWarning(_ health: DirectorHealth) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("This may be stuck in a loop", systemImage: "exclamationmark.triangle.fill")
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(nsColor: .systemRed))
            Text(health.loopReason ?? health.detail).font(.system(size: 12.5)).fixedSize(horizontal: false, vertical: true)
            Text("If it is, it is spending tokens without making progress. Stopping keeps your files; you can resume later.")
                .font(.system(size: 11.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Stop director", role: .destructive) { monitor.actions.pause(); dismiss() }
                Button("Tell Claude…") { dismiss(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { monitor.actions.tell() } }
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
            Text("This film has used about \(UsageFormat.dollars(monitor.telemetry.cost.usd)) so far.").font(.system(size: 12.5))
            HStack {
                Button("Pause director") { monitor.actions.pause(); dismiss() }
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
            if monitor.isLive {
                Button { monitor.actions.pause(); dismiss() } label: { Label("Pause director", systemImage: "pause.fill") }
                    .help("Stops the director safely. Your files are kept and you can resume.")
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
        if let limit = monitor.budgetLimit, monitor.run == store.runURL {
            HStack(spacing: 12) {
                Image(systemName: "dollarsign.circle.fill").foregroundStyle(Color(nsColor: .systemOrange))
                VStack(alignment: .leading, spacing: 2) {
                    Text("This film is over your \(UsageFormat.dollars(limit)) budget").font(.system(size: 13, weight: .semibold))
                    Text("About \(UsageFormat.dollars(monitor.telemetry.cost.usd)) so far\(monitor.telemetry.cost.isEstimated ? " (est.)" : ""). Pause now, or let it carry on.")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Pause director") { store.pauseDirector() }.disabled(!store.runtime.isRunning)
                Button("Keep going") { monitor.dismissBudgetWarning() }
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(nsColor: .systemOrange).opacity(0.12))
            .overlay(alignment: .bottom) { Divider() }
            .transition(.move(edge: .top).combined(with: .opacity))
        }
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

struct QueueTotalsFooter: View {
    var monitor: DirectorMonitor
    var body: some View {
        if let totals = monitor.sessionTotals {
            HStack(spacing: 6) {
                Image(systemName: "sum").font(.system(size: 11)).foregroundStyle(.secondary)
                Text("This session")
                    .font(.system(size: 12, weight: .semibold))
                Text("\(totals.films) film\(totals.films == 1 ? "" : "s") · \(UsageFormat.tokens(totals.tokens)) tokens"
                     + (totals.plan ? "" : " · \(UsageFormat.dollars(totals.usd))\(totals.estimated ? " est." : "")"))
                    .font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit()
                Spacer()
            }
            .padding(.horizontal, 32).padding(.vertical, 12)
            .background(.bar)
            .overlay(alignment: .top) { Divider() }
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
        Toggle("Warn me above a spend per film", isOn: Binding(get: { settings.budgetPerFilm > 0 }, set: { settings.budgetPerFilm = $0 ? 10 : 0 }))
        if settings.budgetPerFilm > 0 {
            LabeledContent("Warn above") {
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
