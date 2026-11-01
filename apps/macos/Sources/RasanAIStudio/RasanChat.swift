import Foundation
import StudioCore
import SwiftUI

/// Ask Rasan's conversation: a real model reply instead of a template. One short, non-interactive Claude Code call per message
/// (the same CLI, sign-in and environment the director uses), with a fast model, no tools and no project settings. It sees the film's
/// real state and the conversation so far, so the same question asked twice gets an answer that reflects what changed.
struct RasanChatAgent: Sendable {
    nonisolated static let model = "haiku"
    nonisolated static let timeout: TimeInterval = 75

    var claude: URL
    var environment: [String: String]

    enum Failure: Error { case notInstalled, noReply }

    nonisolated static let system = """
        You are Rasan, the friendly director character in RasanAI Studio, an app that makes a film for the person. You are chatting with them \
        in a small panel while the film is made. Rules: reply in 1 to 3 short plain sentences, warm and direct, no markdown, no lists, no \
        emoji. Be honest: use only the facts in the film state below and never invent progress, times, files or results. If the person asks \
        what is happening again and nothing changed since your last reply, say plainly that nothing has changed and what you are waiting on, \
        in different words than before. If something changed, lead with what is new. If you do not know, say so. If the film state says \
        the person's message was sent to the director as an instruction, acknowledge in your own words what you understood, and say it \
        has been passed on; never say it is already done. Do not repeat your earlier replies word for word.
        """

    /// Runs the call off the main thread and returns Rasan's words.
    func reply(prompt: String) async throws -> String {
        guard FileManager.default.isExecutableFile(atPath: claude.path) else { throw Failure.notInstalled }
        let (claude, environment) = (self.claude, self.environment)
        let text: String? = await Task.detached(priority: .userInitiated) {
            let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".rasanai/chat", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let name = "reply-\(UUID().uuidString).txt"
            defer { try? FileManager.default.removeItem(at: dir.appendingPathComponent(name)) }
            let arguments = ["--print", "--output-format", "text", "--model", Self.model, "--tools", "", "--no-session-persistence",
                             "--setting-sources", "project", "--system-prompt", Self.system, prompt]
            return await TasteLearner.Job.capture(claude, arguments, in: dir, environment: environment, timeout: Self.timeout, name: name, quiet: true)
        }.value
        guard let reply = text?.trimmingCharacters(in: .whitespacesAndNewlines), !reply.isEmpty else { throw Failure.noReply }
        return reply
    }
}

extension StudioStore {
    /// The model call for the film's chat: Claude Code as set up in Settings, with the director's environment.
    func makeChatAgent() -> RasanChatAgent {
        let node = settings.nodeURL ?? URL(fileURLWithPath: "/usr/bin/env")
        return RasanChatAgent(claude: URL(fileURLWithPath: settings.path(for: .claude)), environment: runtime.environment(node: node, settings: settings))
    }
}

extension ChatAnswerer {
    /// A plain question to Rasan (not a status question, not a change request): answered in the chat, never sent to the director.
    static func isConversational(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.hasSuffix("?") && !looksLikeChange(t)
    }

    private static let changeWords = try! NSRegularExpression(
        pattern: #"\b(can|could|would|will) (you|we|it)\b|\b(font|typeface|colou?r|music|voice|scene|shot|title|logo|caption|too (big|small|fast|slow|long|short|loud|quiet|busy|dark|bright)|instead|replace|change|remove|louder|quieter|bigger|smaller|faster|slower)\b"#,
        options: [.caseInsensitive])
    private static func looksLikeChange(_ t: String) -> Bool { changeWords.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)) != nil }
}

extension FilmSessionModel {
    private static func clip(_ s: String, _ n: Int) -> String {
        let flat = s.split(whereSeparator: \.isNewline).joined(separator: " ")
        return flat.count > n ? String(flat.prefix(n)) + "…" : flat
    }

    /// Everything true about the film right now, one fact per line, for the model. Missing facts are left out, never guessed.
    func chatFacts(_ c: ChatContext) -> [String] {
        var lines: [String] = []
        if !snapshot.title.isEmpty { lines.append("Film: \(snapshot.title)") }
        if let subject = snapshot.step("brief")["fields"]["subject"].string, !subject.isEmpty { lines.append("Brief: \(Self.clip(subject, 220))") }
        lines.append("Current step: \(StepCatalog.label(c.step))")
        if let looking = c.lookingAt, !looking.isEmpty { lines.append("The person is looking at: \(looking)") }
        if let p = c.progress {
            lines.append("Phase: \(p.currentPhase.title)")
            if !p.now.text.isEmpty, p.now.kind != .idle { lines.append("Doing right now: \(p.now.text)") }
            if let r = p.remaining { lines.append("Time left: \(r.text)") } else if !c.isDone { lines.append("Time left: no honest estimate yet") }
            let done = p.phases.filter { $0.state == .done }.map(\.phase.title)
            if !done.isEmpty { lines.append("Finished phases: " + done.joined(separator: ", ")) }
            let crew = p.crew.filter { $0.state == .running }.prefix(4).map { $0.name + ($0.lastAction.map { " (\($0))" } ?? "") }
            if !crew.isEmpty { lines.append("Helpers working: " + crew.joined(separator: "; ")) }
            if p.directorIdle { lines.append("The director is idle (paused, waiting on a limit, or stopped)") }
        } else if let w = c.workingMessage, !w.isEmpty { lines.append("Doing right now: \(w)") }
        if let s = startedAt, !c.isDone { lines.append("Running for: \(ChatAnswerer.elapsedShort(Int(c.now.timeIntervalSince(s))))") }
        if c.isDone { lines.append("The film is finished and delivered") }
        if !c.isConnected { lines.append("Studio cannot read the film's folder right now") }
        if let state = c.runState { lines.append("Run state: \(state)" + [c.runLabel, c.runReason].compactMap { $0 }.filter { !$0.isEmpty }.map { " - \($0)" }.joined()) }
        if c.directorRunning == false && !c.isDone { lines.append("The director is not running") }
        if c.isWaitingOnUser {
            lines.append("Waiting on the person" + (ask.map { ": \($0.question)" + ($0.options.isEmpty ? "" : " (options: " + $0.options.map(\.label).joined(separator: ", ") + ")") } ?? ""))
        }
        if let b = c.blocked { lines.append("Blocked: Rasan asked to \(b.action), which is not allowed here" + (c.blockRepeated ? " (again after Fix it)" : "")) }
        if c.stalled { lines.append("The director has gone quiet" + (c.healthDetail.map { ": \($0)" } ?? "")) }
        if let e = c.lastError?.trimmingCharacters(in: .whitespacesAndNewlines), !e.isEmpty { lines.append("Last error: \(Self.clip(e, 160))") }
        if !c.recentEvents.isEmpty { lines.append("Latest events, oldest first: " + c.recentEvents.suffix(6).map { Self.clip($0, 90) }.joined(separator: " | ")) }
        let open = snapshot.notes.filter(\.isOpen).count
        if open > 0 { lines.append("Open notes from the person: \(open)") }
        return lines
    }

    /// The whole prompt for one reply: the facts now, what they were at the last reply, the conversation, and the new message.
    func chatPrompt(message: String, routedNote: String?, facts: [String], now: Date) -> String {
        var out = "FILM STATE NOW:\n" + facts.map { "- " + $0 }.joined(separator: "\n")
        if let last = lastChatReply {
            let ago = ChatAnswerer.elapsedShort(Int(now.timeIntervalSince(last.at)))
            if last.facts == facts { out += "\n\nSince your last reply (\(ago) ago): NOTHING in the film state has changed." }
            else {
                let before = Set(last.facts), after = Set(facts)
                let added = facts.filter { !before.contains($0) }, gone = last.facts.filter { !after.contains($0) }
                out += "\n\nSince your last reply (\(ago) ago) the film state changed.\nNow: " + added.joined(separator: " | ") + "\nBefore: " + gone.joined(separator: " | ")
            }
        }
        let history = conversation.filter { !$0.isStudioInstruction }.suffix(16)
        var turns = Array(history)
        if let l = turns.last, l.fromUser, Self.normalized(l.text) == Self.normalized(message) { turns.removeLast() }
        if !turns.isEmpty {
            out += "\n\nCONVERSATION SO FAR:\n" + turns.map { ($0.fromUser ? "Person: " : "Rasan: ") + Self.clip($0.text, 400) }.joined(separator: "\n")
        }
        out += "\n\nNEW MESSAGE FROM THE PERSON:\n" + message
        if let routedNote { out += "\n\nNOTE: " + routedNote }
        return out + "\n\nReply as Rasan now."
    }

    /// Queues Rasan's reply to `text` on `step`: a thinking row while the model works, then the answer. Replies go out in order. When the
    /// model can't answer (Claude Code missing, timed out), `fallback` is said instead, with a plain line on why.
    func converse(_ text: String, step: String, routedNote: String? = nil, fallback: String, actions: [ChatQuickAction]? = nil) {
        guard !isFixture else { addLocal(step, fromUser: false, fallback, after: 0.01, actions: actions); return }
        let context = chatContext()
        let facts = chatFacts(context)
        let prompt = chatPrompt(message: text, routedNote: routedNote, facts: facts, now: context.now)
        let agent = chatAgentProvider?()
        answering += 1
        let previous = chatTail
        chatTail = Task { [weak self] in
            await previous?.value
            guard let agent else { self?.finishChat(step: step, text: fallback, actions: actions, facts: facts, why: "Rasan's chat isn't set up on this Mac."); return }
            do {
                let reply = try await agent.reply(prompt: prompt)
                self?.finishChat(step: step, text: reply, actions: actions, facts: facts, why: nil)
            } catch RasanChatAgent.Failure.notInstalled {
                self?.finishChat(step: step, text: fallback, actions: actions, facts: facts, why: "Claude Code isn't set up, so I can't chat properly.")
            } catch {
                self?.finishChat(step: step, text: fallback, actions: actions, facts: facts, why: "I couldn't think that through in time.")
            }
        }
    }

    private func finishChat(step: String, text: String, actions: [ChatQuickAction]?, facts: [String], why: String?) {
        answering = max(0, answering - 1)
        if let why { addLocal(step, fromUser: false, why + " Here is what Studio can see: " + text, actions: actions) }
        else {
            lastChatReply = (Date(), facts)
            addLocal(step, fromUser: false, text, actions: actions)
        }
    }
}

/// "Rasan is thinking…" while the model writes a chat reply.
struct ChatReplyThinkingRow: View {
    var body: some View {
        HStack(spacing: 6) {
            ProgressView().controlSize(.small)
            Text("Rasan is thinking…").font(.system(size: 12)).foregroundStyle(.secondary)
        }
        .padding(.top, 4)
        .accessibilityElement(children: .combine)
    }
}
