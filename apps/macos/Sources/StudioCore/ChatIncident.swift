import Foundation

/// Everything that interrupts a film (a tool the director needs, a refused command, a stall, a loop, a stopped director) as one thing, derived
/// from real data on every tick. The chat is where it is talked about; popups and banners are only doorways to it. Pure: no I/O.
public struct ChatIncident: Identifiable, Equatable, Sendable {
    public enum Kind: String, Sendable { case toolNeed, blocked, stalled, looping, failed, error }
    /// open: nothing done yet. working: Studio is acting on it now (an install runs). resolved: the cause is gone (see `resolvedBy`).
    /// dismissed: the person said Later; it stays in the chat and the status pill until its cause is gone.
    public enum State: String, Sendable {
        case open, working, resolved, dismissed
        /// The chip's word.
        public var word: String { switch self { case .open: "Open"; case .working: "Fixing"; case .resolved: "Fixed"; case .dismissed: "Later" } }
    }

    /// Stable per cause (`tool:kokoro-onnx`, `block:<tool|command>`, `stalled`, `failed:signIn`).
    public var id: String
    public var kind: Kind
    /// "Rasan needs kokoro-onnx".
    public var title: String
    /// The status pill's words ("Needs kokoro-onnx", "Blocked").
    public var label: String
    /// One or two plain sentences for the doorway.
    public var summary: String
    /// What Studio knows, one fact per line, for Rasan to talk from (what, why it matters, what was checked and where).
    public var facts: [String]
    public var state: State = .open
    /// The evidence that closed it ("python3 imports kokoro_onnx", "the director is moving again").
    public var resolvedBy: String?
    public var opened: Date = Date()
    /// The tool, for a tool need: the whole need (its kind, its exact words for the director), so nothing rebuilds it from a name.
    public var need: ToolNeed?
    public var tool: String? { need?.tool }

    public var isActive: Bool { state != .resolved }
    /// The chip in the chat.
    public var stateWord: String { state.word }
}

/// What the derivation reads. Every field is what the app already has; nothing is guessed.
public struct IncidentSignals: Sendable {
    /// The tool the director asked for (an `install-tool:` question that is still open).
    public var toolAsk: ToolNeed?
    public var block: DirectorBlock?
    public var stalled = false
    public var quietFor: TimeInterval = 0
    public var healthDetail: String?
    public var loopReason: String?
    /// RasanAI paused the director because it looked stuck (and it is still paused).
    public var loopPaused: String?
    /// The director ended without finishing: what kind and in what words (nil: it is running, finished, or stopped by the person).
    public var failureID: String?
    public var failureTitle: String?
    public var failureDetail = ""
    public var failureMessage = ""
    public var sendError: String?
    public var brewPresent = false
    /// What Studio last found when it looked for each tool (by tool name).
    public var toolChecks: [String: ToolCheck] = [:]
    public init() {}
}

public enum IncidentDeriver {
    public static func derive(_ s: IncidentSignals) -> [ChatIncident] {
        var out: [ChatIncident] = []
        var needs: [ToolNeed] = []
        if let need = s.toolAsk { needs.append(need) }
        if let block = s.block, let need = block.toolNeed, !needs.contains(where: { $0.tool == need.tool }) { needs.append(need) }
        for need in needs {
            var facts = ["Tool: \(need.tool) (\(need.title))", "Kind: \(kindWords(need))", "Why it is needed: \(need.why)", need.whatItDoes]
            if let m = need.module { facts.append("Python import name: \(m)") }
            facts.append("To do it by hand: " + need.manualSteps(brewPresent: s.brewPresent))
            facts.append("Homebrew on this Mac: \(s.brewPresent ? "present" : "not installed")")
            if let c = s.toolChecks[need.tool] { facts.append("Last check: " + c.summary) } else { facts.append("Not checked yet.") }
            if s.toolAsk?.tool == need.tool { facts.append("The director asked and is waiting: Studio answers it with ready (found) or skip (carry on without \(need.tool)).") }
            else { facts.append("The director tried to install it itself and was refused (\(s.block?.command ?? "a command")).") }
            out.append(ChatIncident(id: "tool:\(need.tool)", kind: .toolNeed, title: "Rasan needs \(need.title)", label: "Needs \(need.tool)",
                                    summary: "\(need.title) is needed to carry on. Rasan can check for it, install it or carry on without it, with you in the chat.",
                                    facts: facts, need: need))
        }
        if let block = s.block, block.toolNeed == nil || !needs.contains(where: { $0.tool == block.toolNeed?.tool }) {
            out.append(ChatIncident(id: "block:" + block.id, kind: .blocked, title: "Rasan was blocked", label: "Blocked",
                                    summary: block.message + " Talk to Rasan to get past it.",
                                    facts: ["Studio stopped a step: Rasan asked to \(block.action), which is not allowed here.", block.technical, "The film so far is saved."]))
        }
        if s.stalled {
            let mins = max(1, Int(s.quietFor / 60))
            out.append(ChatIncident(id: "stalled", kind: .stalled, title: "Rasan has gone quiet", label: "Stuck · \(mins) min",
                                    summary: "Nothing has moved for \(mins) min and nothing is waiting on you. Rasan can retry the step or restart with you in the chat.",
                                    facts: ["The director is running but has made no progress for \(mins) min, with no step running and nobody to wait for.", s.healthDetail ?? "", "The film so far is saved."].filter { !$0.isEmpty }))
        }
        if let reason = s.loopPaused ?? s.loopReason {
            let paused = s.loopPaused != nil
            out.append(ChatIncident(id: "looping", kind: .looping, title: paused ? "Paused: Rasan looked stuck" : "Rasan may be going in circles", label: paused ? "Paused" : "Looping?",
                                    summary: reason + (paused ? " Nothing is lost. Talk to Rasan to resume it or tell it what to do." : " Talk to Rasan to decide what to do."),
                                    facts: [(paused ? "RasanAI paused the director because it looked stuck in a loop: " : "The director looks stuck in a loop: ") + reason,
                                            paused ? "It is paused now and uses no tokens; the resume action carries on from the saved film." : "It spends tokens without making progress; pausing keeps the files."]))
        }
        if let id = s.failureID, let title = s.failureTitle {
            out.append(ChatIncident(id: "failed:" + id, kind: .failed, title: title, label: "Stopped",
                                    summary: (s.failureMessage.isEmpty ? "Rasan stopped before the film was finished." : s.failureMessage) + " Talk to Rasan to carry on.",
                                    facts: ["The director stopped before finishing: \(title).", s.failureDetail, s.failureMessage, "The film so far is saved."].filter { !$0.isEmpty }))
        }
        if let e = s.sendError, !e.isEmpty {
            out.append(ChatIncident(id: "error:" + String(e.prefix(60)), kind: .error, title: "Something didn't go through", label: "Error",
                                    summary: e, facts: ["Studio could not do something: " + e]))
        }
        return out
    }

    private static func kindWords(_ need: ToolNeed) -> String {
        switch need.kind {
        case .executable: "a program, found on the director's PATH"
        case .pythonModule: "a Python package, found by importing it with the director's python3 (Homebrew cannot install it; pip does)"
        case .npmPackage: "an npm package, found through the director's node"
        case .app: "an app, found in the Applications folders"
        }
    }
}

/// The incidents seen so far and what became of each. Updated once per tick from what the derivation says is open right now.
public struct IncidentLedger: Equatable, Sendable {
    public private(set) var items: [ChatIncident] = []
    public struct Change: Equatable, Sendable { public var opened: [ChatIncident] = []; public var resolved: [ChatIncident] = [] }
    public init() {}

    public func item(_ id: String?) -> ChatIncident? { id.flatMap { id in items.last { $0.id == id } } }
    /// Open, working or dismissed: the ones still unresolved, newest first.
    public var unresolved: [ChatIncident] { items.filter(\.isActive).reversed() }
    /// The one the pill and header speak of: working first, then open, then dismissed.
    public var headline: ChatIncident? {
        unresolved.first { $0.state == .working } ?? unresolved.first { $0.state == .open } ?? unresolved.first
    }

    /// `derived`: what is open now. `working`: ids Studio is acting on. `evidence`: why an incident that is no longer derived is over.
    public mutating func update(derived: [ChatIncident], working: Set<String>, evidence: (ChatIncident) -> String, now: Date = Date()) -> Change {
        var change = Change()
        let live = Set(derived.map(\.id))
        for d in derived {
            if let i = items.lastIndex(where: { $0.id == d.id && $0.isActive }) {
                var kept = d
                kept.opened = items[i].opened
                kept.state = working.contains(d.id) ? .working : (items[i].state == .dismissed ? .dismissed : .open)
                if kept != items[i] { items[i] = kept }
            } else {
                var fresh = d; fresh.opened = now; fresh.state = working.contains(d.id) ? .working : .open
                items.append(fresh); change.opened.append(fresh)
            }
        }
        for i in items.indices where items[i].isActive && !live.contains(items[i].id) {
            items[i].state = .resolved; items[i].resolvedBy = evidence(items[i]); change.resolved.append(items[i])
        }
        while items.count > 40, let i = items.firstIndex(where: { !$0.isActive }) { items.remove(at: i) }
        return change
    }

    /// "Later": the popup stays closed; the incident stays in the chat and the pill.
    public mutating func dismiss(_ id: String) {
        if let i = items.lastIndex(where: { $0.id == id && $0.state == .open }) { items[i].state = .dismissed }
    }
    /// Bring a dismissed one back (the person asked about it again).
    public mutating func reopen(_ id: String) {
        if let i = items.lastIndex(where: { $0.id == id && $0.state == .dismissed }) { items[i].state = .open }
    }
}
