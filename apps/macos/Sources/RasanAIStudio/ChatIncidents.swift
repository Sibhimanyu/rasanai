import StudioCore
import SwiftUI

/// Incidents for the film on screen: what interrupts it, derived from real state on every monitor tick (never from which button was pressed),
/// and what Studio does about each: Rasan speaks up in the chat when one opens or clears, and the popups are only doorways to that chat.
extension StudioStore {
    /// What is true right now, from the director's health, its refused commands, its exit, and its open question.
    func incidentSignals(_ film: FilmSessionModel) -> IncidentSignals {
        var s = IncidentSignals()
        s.brewPresent = ToolNeedCoordinator.brewPresent
        s.toolChecks = film.toolChecks
        s.toolAsk = film.ask.flatMap { ToolNeed(ask: $0) }
        s.sendError = film.lastError
        guard !isSample, let runURL, monitor.run == runURL, runtime.runURL == runURL else { return s }
        if let paused = monitor.autoPaused, paused.kind == .loop { s.loopPaused = paused.reason }
        if runtime.isRunning, let health = monitor.health {
            if health.state != .paused { s.block = health.blocked }
            s.stalled = health.stalled; s.quietFor = health.quietFor; s.healthDetail = health.detail
            if health.state == .possiblyLooping { s.loopReason = health.loopReason ?? health.detail }
        } else if !runtime.isPreparing, !runtime.stopRequested, (runtime.autoResume == nil || runtime.autoResume?.isLimit == true), !film.isDone, let recovery = runtime.recovery {
            s.failureID = recovery.rawValue; s.failureTitle = recovery.title; s.failureMessage = recovery.message
            s.failureDetail = runtime.recoveryDetail.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return s
    }

    /// One tick: derive, update the ledger, and let Rasan speak about what opened or cleared. Runs from the monitor's 1.5 s tick.
    func tickIncidents() {
        guard let film, !film.isFixture, !isSample, runURL != nil else { return }
        let signals = incidentSignals(film)
        let derived = IncidentDeriver.derive(signals)
        var working = Set<String>()
        if let tool = ToolNeedCoordinator.shared.busyTool { working.insert("tool:\(tool)") }
        if film.followUps.pending != nil || runtime.isPreparing { working.formUnion(derived.filter { [.stalled, .blocked, .failed, .looping].contains($0.kind) }.map(\.id)) }
        var ledger = film.incidents
        let change = ledger.update(derived: derived, working: working) { evidence(for: $0, film: film) }
        if ledger != film.incidents { film.incidents = ledger }
        // An incident has to last about 3 s (two ticks) before Rasan speaks, and each kind may be spoken about at most once in 45 s.
        for incident in film.incidents.unresolved where !film.announced.contains(incident.id) && Date().timeIntervalSince(incident.opened) >= 3 {
            announce(incident, film: film)
        }
        for incident in change.resolved { announceResolved(incident, film: film) }
        pollToolNeeds(film)
    }

    /// The real evidence that an incident is over, in words Rasan can say.
    private func evidence(for i: ChatIncident, film: FilmSessionModel) -> String {
        switch i.kind {
        case .toolNeed:
            if let tool = i.tool, let c = film.toolChecks[tool], c.found { return c.checked + (c.location.isEmpty ? "" : " -> \(c.location)") }
            return film.ask == nil ? "the director's question was answered" : "the director no longer needs it"
        case .blocked: return "the block cleared: the director got past it or was told another way"
        case .stalled: return "the director is moving again"
        case .looping: return "the director stopped repeating itself"
        case .failed: return runtime.isRunning ? "the director is running again" : "the director is no longer in that stopped state"
        case .error: return "the error cleared"
        }
    }

    private static let kindGap: TimeInterval = 45
    private func spokeRecently(_ kind: ChatIncident.Kind, film: FilmSessionModel) -> Bool {
        film.lastSpoke[kind].map { Date().timeIntervalSince($0) < Self.kindGap } ?? false
    }

    /// `force`: the person asked (Talk to Rasan), so no waiting.
    private func announce(_ i: ChatIncident, film: FilmSessionModel, force: Bool = false) {
        guard !film.announced.contains(i.id), force || !spokeRecently(i.kind, film: film) else { return }
        film.announced.insert(i.id); film.lastSpoke[i.kind] = Date()
        let how: String
        switch i.kind {
        case .toolNeed: how = "Explain what the tool is and why the film needs it, which kind it is (so how it is found and installed), what Studio already checked, and offer to check it, install it (needs a yes) or carry on without it (needs a yes). Ask what they would like."
        case .blocked: how = "Explain what was stopped and why, and offer to retry the step another way or restart (needs a yes). Ask what they would like."
        case .stalled: how = "Say how long it has been quiet and offer to retry the step, or restart (needs a yes). Ask what they would like."
        case .looping: how = "Say it looks like it is going in circles, and offer to pause it (needs a yes), retry, or tell the director something different."
        case .failed: how = "Say what stopped and why if known, that the film so far is saved, and offer to resume or restart (needs a yes)."
        case .error: how = "Say what did not go through and what could be done."
        }
        film.speak(event: "A problem just opened: \(i.title) (id \(i.id)). \(how)", step: film.shownStep, fallback: i.title + ". " + i.summary, incident: i.id)
    }

    private func announceResolved(_ i: ChatIncident, film: FilmSessionModel) {
        let announced = film.announced.remove(i.id) != nil, reported = film.quietResolve.remove(i.id) != nil
        // Said nothing when it opened, lasted under 30 s, Rasan already reported it in a follow-up turn, a retry's own outcome says it, or it is too soon: stay quiet.
        if !announced || reported || film.followUps.pending != nil || Date().timeIntervalSince(i.opened) < 30 || spokeRecently(i.kind, film: film) { return }
        film.lastSpoke[i.kind] = Date()
        film.speak(event: "A problem is over: \(i.title) (id \(i.id)). Because: \(i.resolvedBy ?? "its cause is gone"). Say so briefly and what happens next.",
                   step: film.shownStep, fallback: "Fixed: \(i.title). \(i.resolvedBy ?? "")")
    }

    /// While a tool need is open, look for the tool now and then (a quiet check, no popups): when the person installed it themselves, the
    /// director's question is answered the moment the tool is really there.
    private func pollToolNeeds(_ film: FilmSessionModel) {
        let coordinator = ToolNeedCoordinator.shared
        // Only a need the quiet look can settle (no readiness check behind it), never while an install or another check runs, never for an
        // ask already answered (a refused answer must not be sent again every 15 s).
        guard !coordinator.isInstalling, !coordinator.isChecking, Date().timeIntervalSince(film.lastToolPoll) > 15,
              let incident = film.incidents.unresolved.first(where: { $0.kind == .toolNeed }), let need = incident.need, need.preflightIDs.isEmpty else { return }
        let ask = film.ask.flatMap { ToolNeed(ask: $0)?.tool == need.tool ? $0 : nil }
        if let ask, film.answeredAsks.contains(ask.id) { return }
        film.lastToolPoll = Date()
        Task { _ = await coordinator.check(need, ask: ask, model: film, source: "studio-poll", consent: "none", silent: true) }
    }

    // MARK: Doorways

    /// "Talk to Rasan": opens the chat (the panel, or the pill's chat), scrolls to the message about this problem and focuses the composer.
    /// If Rasan has not posted about it yet (the chat was not reachable), he does now.
    func talkAbout(_ id: String?) {
        guard let film else { return }
        var ledger = film.incidents
        if let id { ledger.reopen(id); if ledger != film.incidents { film.incidents = ledger } }
        film.scrollToIncident = id
        film.askRasan()
        if let id, let i = film.incidents.item(id), i.isActive { announce(i, film: film, force: true) }
    }

    /// "Later": the popup or banner closes and stays closed; the problem stays in the chat and the status pill until its cause is gone.
    func laterAbout(_ id: String) {
        guard let film else { return }
        var ledger = film.incidents
        ledger.dismiss(id)
        if ledger != film.incidents { film.incidents = ledger }
        if id.hasPrefix("tool:"), let ask = film.ask { film.dismissedAsks.insert(ask.id) }
    }

    /// The doorway should show: the problem is unresolved and the person has not said Later.
    func doorwayOpen(_ id: String) -> Bool { film?.incidents.item(id).map { $0.state == .open || $0.state == .working } ?? false }

    // MARK: Rasan's actions

    /// Does one thing Rasan's reply asked for and says what really happened. Studio's consent gate has already been passed (see `runChatActions`).
    func runChatAction(_ action: ChatReplyAction, film: FilmSessionModel) async -> ChatActionResult {
        let step = film.shownStep
        let coordinator = ToolNeedCoordinator.shared
        let badName = ChatActionResult("That is not a tool name Studio will use.")
        func toolAsk(_ need: ToolNeed) -> DirectorAsk? { film.ask.flatMap { ToolNeed(ask: $0)?.tool == need.tool ? $0 : nil } }
        switch action {
        case .tellDirector(let text):
            await film.passToDirector(text, step: step); return ChatActionResult("Passed the instruction to the director.", narrate: false)
        case .retryStep:
            retryStep(); return ChatActionResult("Told Rasan to retry the step another way.", narrate: false)
        case .restartRasan:
            restartRasan(); return ChatActionResult("Restarting Rasan from the saved film.", narrate: false)
        case .pause:
            guard canPause else { return ChatActionResult("Studio could not pause: the director is not running right now.") }
            pauseDirector(); film.systemLine("Paused the run.", step: step); return ChatActionResult("Paused the run.", narrate: false)
        case .resume:
            resumeDirector(); film.systemLine("Resuming the run.", step: step); return ChatActionResult("Resuming the run.", narrate: false)
        case .viewActivity:
            film.requestActivity(); film.systemLine("Opened the activity.", step: step); return ChatActionResult("Opened the activity.", narrate: false)
        case .checkTool(let name):
            guard let need = coordinator.need(for: name, ask: film.ask, film: film) else { return badName }
            return await coordinator.check(need, ask: toolAsk(need), model: film)
        case .installTool(let name):
            guard let need = coordinator.need(for: name, ask: film.ask, film: film) else { return badName }
            return coordinator.startInstall(need, ask: toolAsk(need), model: film) { result in film.report(results: [result.text]) }
        case .cancelInstall:
            return coordinator.cancelInstall()
        case .continueWithout(let name):
            guard let need = coordinator.need(for: name, ask: film.ask, film: film) else { return badName }
            return await coordinator.skip(need, ask: toolAsk(need), model: film)
        case .answerAsk(let choice, let text):
            guard let ask = film.ask else { return ChatActionResult("No question from the director is open, so there is nothing to answer.") }
            if let choice, [ToolNeed.installPrefix, ToolNeed.skipPrefix, ToolNeed.readyPrefix].contains(where: choice.hasPrefix) {
                return ChatActionResult("A tool question is not answered with answer_ask. Use continue_without to carry on without the tool, and check_tool once it is installed.")
            }
            if let choice, !ask.options.contains(where: { $0.id == choice }) {
                return ChatActionResult("\"\(choice)\" is not one of the options. They are: " + ask.options.map { "\($0.label) [\($0.id)]" }.joined(separator: ", ") + ".")
            }
            guard film.answeredAsks.insert(ask.id).inserted else { return ChatActionResult("That question was already answered once, so it was not answered again.") }
            let words = text ?? ask.options.first { $0.id == choice }?.label ?? ""
            guard await film.answer(ask, choice: choice, text: words) else {
                film.answeredAsks.remove(ask.id)
                return ChatActionResult("Studio could not send the answer: " + (film.lastError ?? "unknown error") + ".")
            }
            // A run the person paused or stopped is left alone: it reads the answer when they resume.
            if !runtime.isRunning, !runtime.isFrozen, !runtime.stopRequested, !runtime.isPreparing { restartRasan() }
            return ChatActionResult("Sent the answer to the director" + (choice.map { " (\($0))" } ?? "") + (runtime.stopRequested || runtime.isFrozen ? ". The run is paused, so it carries on when you resume." : "."))
        case .recheck(let id):
            let targets = film.incidents.unresolved.filter { id == nil || $0.id == id }
            guard !targets.isEmpty else { return ChatActionResult(id == nil ? "No problem is open right now." : "No open problem has the id \(id ?? "").") }
            tickIncidents()
            var lines: [String] = []
            for t in targets {
                if t.kind == .toolNeed, let need = t.need {
                    lines.append(t.title + ": " + (await coordinator.check(need, ask: toolAsk(need), model: film)).text)
                } else if let now = film.incidents.item(t.id), now.isActive { lines.append("\(now.title): still \(now.stateWord.lowercased()). \(now.summary)") }
                else { lines.append("\(t.title): fixed, because \(film.incidents.item(t.id)?.resolvedBy ?? "its cause is gone").") }
            }
            return ChatActionResult(lines.joined(separator: "\n"))
        }
    }

    // MARK: When the chat can't run

    /// The chat can't run (no Claude Code, a Codex director, or the last call failed): a doorway shows the problem's real actions as quiet buttons.
    /// Normally this is empty and the doorway is just "Talk to Rasan" and "Later".
    func doorwayActions(_ id: String) -> [DoorwayAction] {
        guard let film, !film.chatUsable, let i = film.incidents.item(id), i.isActive else { return [] }
        let coordinator = ToolNeedCoordinator.shared
        let step = film.shownStep
        func say(_ text: String) { film.addLocal(step, fromUser: false, text) }
        var out: [DoorwayAction] = []
        switch i.kind {
        case .toolNeed:
            guard let need = i.need else { return [] }
            let ask = film.ask.flatMap { ToolNeed(ask: $0)?.tool == need.tool ? $0 : nil }
            if need.studioCanInstall, !coordinator.isInstalling {
                out.append(DoorwayAction("Install for me") { say(coordinator.startInstall(need, ask: ask, model: film) { say($0.text) }.text) })
            }
            out.append(DoorwayAction("Check again") { Task { say(await coordinator.check(need, ask: ask, model: film).text) } })
            if ask != nil { out.append(DoorwayAction("Continue without") { Task { say(await coordinator.skip(need, ask: ask, model: film).text) } }) }
        case .blocked, .stalled, .error: if i.kind != .error { out.append(DoorwayAction("Retry") { [weak self] in self?.retryStep() }) }
        case .looping, .failed:
            out.append(DoorwayAction("Resume") { [weak self] in self?.resumeDirector() })
            out.append(DoorwayAction("Retry") { [weak self] in self?.retryStep() })
        }
        return out
    }
}

/// One button a doorway shows when Rasan's chat can't run.
struct DoorwayAction: Identifiable {
    let id = UUID()
    let title: String
    let run: () -> Void
    init(_ title: String, run: @escaping () -> Void) { self.title = title; self.run = run }
}

/// The popup, sheet and banner body for a problem: an icon, the title, one or two plain sentences, and two buttons: "Talk to Rasan"
/// (opens the chat at the problem) and a quiet "Later". It carries no install, check, skip, retry or restart buttons: those are done in
/// the chat. Only when the chat cannot run does a quiet row of the problem's real actions (`fallback`) show beneath. Callers show it only
/// while the problem is open, so it closes itself the moment the problem is over.
struct IncidentDoorway: View {
    var symbol = "exclamationmark.bubble.fill"
    var tint = Color(nsColor: .systemOrange)
    let title: String
    let summary: String
    var fallback: [DoorwayAction] = []
    var talk: () -> Void
    var later: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol).foregroundStyle(tint).padding(.top, 1)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.system(size: 13, weight: .semibold))
                    Text(summary).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                HStack(spacing: 8) {
                    if let later { Button("Later", action: later).buttonStyle(.plain).foregroundStyle(.secondary).keyboardShortcut(.cancelAction) }
                    Button("Talk to Rasan", action: talk).buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction)
                }
            }
            if !fallback.isEmpty {
                HStack(spacing: 6) {
                    Text("Rasan's chat can't run right now:").font(.system(size: 11)).foregroundStyle(.tertiary)
                    ForEach(fallback) { a in Button(a.title, action: a.run).buttonStyle(.rasanSecondary).controlSize(.small) }
                }
            }
        }
    }
}

extension View {
    /// The doorway as a banner across the top of the film page.
    func doorwayBanner(tint: NSColor = .systemOrange) -> some View {
        padding(.horizontal, Workspace.panelPadding).padding(.vertical, 10)
            .background(Color(nsColor: tint).opacity(0.12))
            .overlay(alignment: .bottom) { Divider() }
            .padding(.bottom, Workspace.gap)
            .transition(.move(edge: .top).combined(with: .opacity))
    }
}
