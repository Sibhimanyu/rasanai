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
        if runtime.isRunning, let health = monitor.health {
            if health.state != .paused { s.block = health.blocked }
            s.stalled = health.stalled; s.quietFor = health.quietFor; s.healthDetail = health.detail
            if health.state == .possiblyLooping { s.loopReason = health.loopReason ?? health.detail }
        } else if !runtime.isPreparing, !runtime.stopRequested, runtime.autoResume == nil, !film.isDone, let recovery = runtime.recovery {
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
        for incident in change.opened { announce(incident, film: film) }
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

    private func announce(_ i: ChatIncident, film: FilmSessionModel) {
        guard film.announced.insert(i.id).inserted else { return }
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
        film.announced.remove(i.id)
        // Rasan already reported it in a follow-up turn, or a retry's own outcome says it: do not say it twice.
        if film.quietResolve.remove(i.id) != nil || film.followUps.pending != nil { return }
        film.speak(event: "A problem is over: \(i.title) (id \(i.id)). Because: \(i.resolvedBy ?? "its cause is gone"). Say so briefly and what happens next.",
                   step: film.shownStep, fallback: "Fixed: \(i.title). \(i.resolvedBy ?? "")")
    }

    /// While a tool need is open, look for the tool now and then (a quiet check, no popups): when the person installed it themselves, the
    /// director's question is answered the moment the tool is really there.
    private func pollToolNeeds(_ film: FilmSessionModel) {
        let coordinator = ToolNeedCoordinator.shared
        guard !coordinator.isBusy, Date().timeIntervalSince(film.lastToolPoll) > 15,
              let incident = film.incidents.unresolved.first(where: { $0.kind == .toolNeed }), let tool = incident.tool else { return }
        film.lastToolPoll = Date()
        let need = coordinator.need(for: tool, ask: film.ask)
        let ask = film.ask.flatMap { ToolNeed(ask: $0)?.tool == need.tool ? $0 : nil }
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
        if let id, let i = film.incidents.item(id), i.isActive { announce(i, film: film) }
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
            let need = coordinator.need(for: name, ask: film.ask)
            return await coordinator.check(need, ask: toolAsk(need), model: film)
        case .installTool(let name):
            let need = coordinator.need(for: name, ask: film.ask)
            return await coordinator.install(need, ask: toolAsk(need), model: film)
        case .continueWithout(let name):
            let need = coordinator.need(for: name, ask: film.ask)
            return await coordinator.skip(need, ask: toolAsk(need), model: film)
        case .answerAsk(let choice, let text):
            guard let ask = film.ask else { return ChatActionResult("No question from the director is open, so there is nothing to answer.") }
            if let choice, !ask.options.contains(where: { $0.id == choice }) {
                return ChatActionResult("\"\(choice)\" is not one of the options. They are: " + ask.options.map { "\($0.label) [\($0.id)]" }.joined(separator: ", ") + ".")
            }
            let words = text ?? ask.options.first { $0.id == choice }?.label ?? ""
            guard await film.answer(ask, choice: choice, text: words) else { return ChatActionResult("Studio could not send the answer: " + (film.lastError ?? "unknown error") + ".") }
            if !runtime.isRunning, !runtime.isFrozen { restartRasan() }
            return ChatActionResult("Sent the answer to the director" + (choice.map { " (\($0))" } ?? "") + ".")
        case .recheck(let id):
            let targets = film.incidents.unresolved.filter { id == nil || $0.id == id }
            guard !targets.isEmpty else { return ChatActionResult(id == nil ? "No problem is open right now." : "No open problem has the id \(id ?? "").") }
            tickIncidents()
            var lines: [String] = []
            for t in targets {
                if t.kind == .toolNeed, let tool = t.tool {
                    let need = coordinator.need(for: tool, ask: film.ask)
                    lines.append(t.title + ": " + (await coordinator.check(need, ask: toolAsk(need), model: film)).text)
                } else if let now = film.incidents.item(t.id), now.isActive { lines.append("\(now.title): still \(now.stateWord.lowercased()). \(now.summary)") }
                else { lines.append("\(t.title): fixed, because \(film.incidents.item(t.id)?.resolvedBy ?? "its cause is gone").") }
            }
            return ChatActionResult(lines.joined(separator: "\n"))
        }
    }
}

/// The popup, sheet and banner body for a problem: an icon, the title, one or two plain sentences, and two buttons: "Talk to Rasan"
/// (opens the chat at the problem) and a quiet "Later". It carries no install, check, skip, retry or restart buttons: those are done in
/// the chat. Callers show it only while the problem is open, so it closes itself the moment the problem is over.
struct IncidentDoorway: View {
    var symbol = "exclamationmark.bubble.fill"
    var tint = Color(nsColor: .systemOrange)
    let title: String
    let summary: String
    var talk: () -> Void
    var later: (() -> Void)?

    var body: some View {
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
