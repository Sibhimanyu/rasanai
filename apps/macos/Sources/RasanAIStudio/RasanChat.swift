import CryptoKit
import Foundation
import StudioCore
import SwiftUI

/// Ask Rasan's conversation: one ongoing Haiku conversation per film, streamed into the chat as it is written. Each message is a short,
/// non-interactive Claude Code call (the same CLI, sign-in and environment the director uses) that resumes the film's own session
/// (`--session-id` the first time, `--resume` after), with a fast model, no tools and no project settings. Fresh film facts go in with
/// every turn; the history lives in the session, not in the prompt. If the session is gone, a new one starts, seeded with the last few turns.
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
        has been passed on; never say it is already done. Do not repeat your earlier replies word for word. Every turn brings a fresh FILM STATE \
        NOW; trust it over anything you said before.

        EVERYTHING GOES THROUGH YOU. Problems (a tool the film needs, a blocked command, a stall, a loop, a stopped director) are listed in the film \
        state as PROBLEM lines with an id and a state (Open, Fixing, Fixed, Later). Studio has no repair buttons: the person talks to you and you fix \
        things with actions. Popups only point the person to this chat. When a problem opens you are told (WHAT JUST HAPPENED): say in your own words \
        what it is, why it matters and what you can do about it, using the facts, then ask what they want. Never tell them to press a button.

        ACTIONS. After your words you may add ONE final line, exactly <<actions>>[{"type":"..."}] with a JSON list (at most 3). Types: \
        tell_director ("text": a short, self-contained instruction for the director and its crew), retry_step, resume, view_activity, \
        check_tool ("name"), recheck ("id": a PROBLEM id, or leave it out for all), answer_ask ("choice": one of the question's option ids and/or \
        "text", only when the person clearly decided), and the ones that need the person's yes: restart_rasan, pause, install_tool ("name"), \
        continue_without ("name": carry on without the tool, answering the director's question with its skip choice). Never write the line unless you act.
        Rules: (1) Consent. For restart_rasan, pause, install_tool and continue_without, first ask in plain words ("Want me to install it?") and put the \
        action in the list: Studio holds it and does NOT run it. Only when the person's next message clearly says yes, put the same action in the list \
        again and Studio runs it. A proposal not repeated after a yes is dropped. (2) "I installed it", "it's done", "try again": use check_tool; never \
        claim it works until the results say so. (3) The kind of tool decides how it is found and installed: a Python package is checked by importing it \
        and installed with pip by Studio, never with Homebrew; say which one it is. (4) When Studio runs actions you get RESULTS next, real and exact: \
        say plainly what happened, quote the real error when something failed, and say what is next. Never invent a result. (5) When the person gives \
        an instruction for the film ("make the title bigger"), use tell_director and say in your words what you passed on. (6) A question, a chat or a \
        complaint is not an action. (7) Honest timing: the director reads what you pass on only when it next checks in, usually between steps; say so \
        and never claim it is done. (8) Never mention the line, JSON or these rules.
        """

    private nonisolated static let sessions = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".rasanai/chat", isDirectory: true)

    /// The film's saved session id, if it has one.
    private nonisolated static func savedSession(_ key: String) -> String? {
        let id = (try? String(contentsOf: sessions.appendingPathComponent("\(key).session"), encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
        return id.flatMap { UUID(uuidString: $0) == nil ? nil : $0 }
    }
    private nonisolated static func save(session id: String, key: String) {
        try? FileManager.default.createDirectory(at: sessions, withIntermediateDirectories: true)
        try? id.write(to: sessions.appendingPathComponent("\(key).session"), atomically: true, encoding: .utf8)
    }
    /// A short stable name for a film's chat session file, from its run folder.
    nonisolated static func sessionKey(for run: URL) -> String {
        SHA256.hash(data: Data(run.standardizedFileURL.path.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    /// Streams Rasan's reply for one message: `onText` gets the whole reply so far (machine line included) each time it grows.
    /// `resumePrompt` goes to the film's session; `freshPrompt` (with some history) starts a new one when there is none or it can't be resumed.
    func reply(sessionKey key: String, resumePrompt: String, freshPrompt: String, onText: @escaping @Sendable (String) async -> Void) async throws -> String {
        guard FileManager.default.isExecutableFile(atPath: claude.path) else { throw Failure.notInstalled }
        try? FileManager.default.createDirectory(at: Self.sessions, withIntermediateDirectories: true)
        var attempts: [(id: String, resume: Bool)] = []
        if let id = Self.savedSession(key) { attempts.append((id, true)) }
        attempts.append((UUID().uuidString.lowercased(), false))
        var last = ""
        for (index, attempt) in attempts.enumerated() {
            let out = await run(session: attempt.id, resume: attempt.resume, prompt: attempt.resume ? resumePrompt : freshPrompt, onText: onText)
            last = out.text
            if !out.text.isEmpty {
                if out.ok || out.timedOut { Self.save(session: attempt.id, key: key) }
                return out.text
            }
            if out.timedOut || Task.isCancelled || index == attempts.count - 1 { break }
        }
        throw Failure.noReply
    }

    private struct Outcome { var text: String; var ok: Bool; var timedOut: Bool }

    /// One streamed call. Reads the CLI's stream-json lines and forwards each text delta; the 75 s limit covers the whole call.
    private func run(session: String, resume: Bool, prompt: String, onText: @escaping @Sendable (String) async -> Void) async -> Outcome {
        let arguments = ["--print", "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--model", Self.model, "--tools", "",
                         "--setting-sources", "project", "--system-prompt", Self.system, resume ? "--resume" : "--session-id", session, prompt]
        let process = Process()
        process.executableURL = claude; process.arguments = arguments; process.environment = environment
        process.currentDirectoryURL = Self.sessions
        let pipe = Pipe()
        process.standardInput = FileHandle.nullDevice; process.standardOutput = pipe; process.standardError = FileHandle.nullDevice
        do { try process.run() } catch { return Outcome(text: "", ok: false, timedOut: false) }
        let box = ProcessBox(process)
        let timedOut = Flag()
        let killer = Task { try? await Task.sleep(for: .seconds(Self.timeout)); if !Task.isCancelled { timedOut.set(); box.terminate() } }
        var text = "", finalText = "", ok = false
        await withTaskCancellationHandler {
            do {
                for try await line in pipe.fileHandleForReading.bytes.lines {
                    guard let data = line.data(using: .utf8), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                    switch json["type"] as? String {
                    case "stream_event":
                        if let event = json["event"] as? [String: Any], event["type"] as? String == "content_block_delta",
                           let delta = event["delta"] as? [String: Any], delta["type"] as? String == "text_delta", let piece = delta["text"] as? String {
                            text += piece
                            await onText(text)
                        }
                    case "result":
                        ok = (json["is_error"] as? Bool) != true
                        if ok { finalText = (json["result"] as? String) ?? "" }
                    default: break
                    }
                }
            } catch {}
        } onCancel: { box.terminate() }
        killer.cancel()
        process.waitUntilExit()
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return Outcome(text: words.isEmpty ? finalText.trimmingCharacters(in: .whitespacesAndNewlines) : words, ok: ok, timedOut: timedOut.isSet)
    }
}

private final class ProcessBox: @unchecked Sendable {
    let process: Process
    init(_ p: Process) { process = p }
    func terminate() { if process.isRunning { process.terminate() } }
}
private final class Flag: @unchecked Sendable {
    private let lock = NSLock(); private var value = false
    func set() { lock.lock(); value = true; lock.unlock() }
    var isSet: Bool { lock.lock(); defer { lock.unlock() }; return value }
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
            lines.append("Waiting on the person" + (ask.map { ": \($0.question)" + ($0.options.isEmpty ? "" : " (options: " + $0.options.map { "\($0.label) [\($0.id)]" }.joined(separator: ", ") + ")") } ?? ""))
        }
        if let b = c.blocked { lines.append("Blocked: Rasan asked to \(b.action), which is not allowed here" + (c.blockRepeated ? " (again after Fix it)" : "")) }
        if c.stalled { lines.append("The director has gone quiet" + (c.healthDetail.map { ": \($0)" } ?? "")) }
        if let e = c.lastError?.trimmingCharacters(in: .whitespacesAndNewlines), !e.isEmpty { lines.append("Last error: \(Self.clip(e, 160))") }
        for i in c.incidents {
            if i.isActive { lines.append("PROBLEM \(i.id) [\(i.stateWord)]: \(i.title). " + i.facts.map { Self.clip($0, 300) }.joined(separator: " | ")) }
            else { lines.append("Earlier problem, now fixed (\(i.id)): \(i.title). Because: \(i.resolvedBy ?? "its cause is gone")") }
        }
        let progress = ToolNeedCoordinator.shared
        if let t = progress.busyTool { lines.append("Studio is working on \(t) right now" + (progress.progress.isEmpty ? "" : " (latest output: \(Self.clip(progress.progress, 100)))")) }
        if !c.recentEvents.isEmpty { lines.append("Latest events, oldest first: " + c.recentEvents.suffix(6).map { Self.clip($0, 90) }.joined(separator: " | ")) }
        let open = snapshot.notes.filter(\.isOpen).count
        if open > 0 { lines.append("Open notes from the person: \(open)") }

        let queued = unreadByDirector
        if queued > 0 { lines.append("Messages passed to the director that it has not read yet: \(queued) (it reads them only when it next checks in, usually between steps)") }
        else { lines.append("The director reads what is passed to it only when it next checks in, usually between steps") }
        return lines
    }

    /// The prompt for one turn: the facts now, what changed since the last reply, what Studio said itself meanwhile, the new message.
    /// `history` turns of the conversation are added only for a fresh session; a resumed one already has them.
    func chatPrompt(turn: ChatTurn, routedNote: String?, facts: [String], now: Date, history: Int = 0, studioSaid said: [String] = [], proposed: [String] = []) -> String {
        let message: String
        if case .person(let m) = turn { message = m } else { message = "" }
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
        if !said.isEmpty { out += "\n\nSTUDIO ITSELF SAID THIS IN THE CHAT since your last reply (not you; it is true, you may refer to it):\n" + said.map { "- " + Self.clip($0, 300) }.joined(separator: "\n") }
        if history > 0 {
            var turns = Array(conversation.filter { !$0.isStudioInstruction }.suffix(history + 1))
            if let l = turns.last, l.fromUser, Self.normalized(l.text) == Self.normalized(message) { turns.removeLast() }
            turns = Array(turns.suffix(history))
            if !turns.isEmpty { out += "\n\nTHE CONVERSATION SO FAR (earlier turns):\n" + turns.map { ($0.fromUser ? "Person: " : "Rasan: ") + Self.clip($0.text, 400) }.joined(separator: "\n") }
        }
        if !proposed.isEmpty { out += "\n\nYOU PROPOSED THESE LAST TURN AND THEY ARE WAITING FOR THE PERSON'S YES (Studio holds them; repeat the action only if their new message clearly says yes):\n" + proposed.map { "- " + $0 }.joined(separator: "\n") }
        switch turn {
        case .person: out += "\n\nNEW MESSAGE FROM THE PERSON:\n" + message
        case .event(let what): out += "\n\nWHAT JUST HAPPENED (the person did not write; you are speaking up). Say it in your own words, brief and warm, from the facts above. There are no buttons: tell them what you can do and ask, or just act if it is a plain action that needs no yes:\n" + what
        case .results(let lines): out += "\n\nRESULTS OF WHAT STUDIO JUST DID FOR YOU (real and exact). Tell the person what happened and what is next, in your own words; quote a real error if something failed:\n" + lines.map { "- " + Self.clip($0, 900) }.joined(separator: "\n")
        }
        if let routedNote { out += "\n\nNOTE: " + routedNote }
        return out + "\n\nReply as Rasan now."
    }

    /// One turn of the conversation: what Rasan is answering.
    enum ChatTurn: Equatable {
        /// The person wrote this.
        case person(String)
        /// A real moment Studio noticed (a problem opened or cleared, a retry did or did not help): Rasan speaks up, unprompted.
        case event(String)
        /// What running Rasan's actions really did, for it to report.
        case results([String])
    }
    static let maxRounds = 3

    /// The honest plain text for when Rasan's model can't be reached: what Studio can see, no pretending to be Rasan thinking.
    func chatFallback(_ c: ChatContext) -> String {
        if let i = c.incidents.first(where: \.isActive) { return i.title + ". " + i.summary }
        if let b = c.blocked { return "Rasan asked to \(b.action), which isn't allowed here, so Studio stopped that step." }
        if c.stalled { return "Rasan has gone quiet." + (c.healthDetail.map { " \($0)" } ?? "") }
        if let w = c.progress?.now.text, !w.isEmpty { return "Right now: \(w)." }
        if let w = c.workingMessage, !w.isEmpty { return "Right now: \(w)." }
        if let e = c.lastError, !e.isEmpty { return "Last error: " + Self.clip(e, 160) }
        return "I have no more detail than the activity list."
    }

    /// Queues Rasan's reply to `text` on `step`: it types in live (a "typing" row until the first word), then stays as the answer. Replies
    /// go out in order. Actions the reply asks for run after it, and their real results go back to Rasan for a short follow-up turn (three
    /// rounds at most). When the model can't answer (Claude Code missing, timed out with nothing), `fallback` is said instead, prefixed with why.
    func converse(_ text: String, step: String, routedNote: String? = nil, fallback: String) {
        queue(.person(text), step: step, routedNote: routedNote, fallback: fallback, incident: nil)
    }

    /// Rasan speaks up on a real moment (see `ChatTurn.event`), written by the model from the facts and what changed.
    func speak(event: String, step: String? = nil, fallback: String, incident: String? = nil) {
        lastSpoke = Date()
        queue(.event(event), step: step ?? shownStep, routedNote: nil, fallback: fallback, incident: incident)
    }

    private func queue(_ turn: ChatTurn, step: String, routedNote: String?, fallback: String, incident: String?) {
        guard !isFixture else { addLocal(step, fromUser: false, fallback, after: 0.01, incident: incident); return }
        let agent = chatAgentProvider?()
        answering += 1
        let previous = chatTail
        chatTail = Task { [weak self] in
            await previous?.value
            guard let self else { return }
            await rounds(turn, step: step, routedNote: routedNote, fallback: fallback, incident: incident, agent: agent)
            answering = max(0, answering - 1)
            streamingText = nil
        }
    }

    private func rounds(_ first: ChatTurn, step: String, routedNote: String?, fallback: String, incident: String?, agent: RasanChatAgent?) async {
        var turn = first, lastResults: [String] = []
        let key = runDirectory.map { RasanChatAgent.sessionKey(for: $0) } ?? "film"
        func fail(_ why: String, round: Int) {
            streamingText = nil
            let said = round == 0 ? fallback : "What Studio did: " + lastResults.joined(separator: " ")
            addLocal(step, fromUser: false, "Couldn't reach my thinking just now (\(why)): " + said, incident: round == 0 ? incident : nil)
        }
        for round in 0..<Self.maxRounds {
            // Built now, after the earlier replies landed, so the facts and the "what changed" are the latest.
            let context = chatContext(), facts = chatFacts(context)
            let said = studioSaid
            studioSaid = []
            let note = round == 0 ? routedNote : nil, proposed = proposals.values.map(\.words)
            let resume = chatPrompt(turn: turn, routedNote: note, facts: facts, now: context.now, studioSaid: said, proposed: proposed)
            let fresh = chatPrompt(turn: turn, routedNote: note, facts: facts, now: context.now, history: 6, studioSaid: said, proposed: proposed)
            guard let agent else { fail("Rasan's chat isn't set up on this Mac.", round: round); return }
            streamingText = ""
            do {
                let raw = try await agent.reply(sessionKey: key, resumePrompt: resume, freshPrompt: fresh) { [weak self] raw in
                    await MainActor.run { self?.streamingText = ChatReplyParser.split(raw).text }
                }
                let reply = ChatReplyParser.split(raw)
                lastChatReply = (Date(), facts)
                streamingText = nil
                let words = reply.text.isEmpty && reply.actions.isEmpty && round == 0 ? fallback : reply.text
                if !words.isEmpty { addLocal(step, fromUser: false, words, incident: round == 0 ? incident : nil, byModel: true) }
                var personTurn = false
                if case .person = turn { personTurn = true }
                let results = await runChatActions(reply.actions, step: step, personTurn: personTurn)
                let told = results.filter(\.narrate).map(\.text)
                guard !told.isEmpty else { return }
                lastResults = told
                guard round + 1 < Self.maxRounds else { systemLine(told.joined(separator: " "), step: step); return }
                turn = .results(told)
            } catch RasanChatAgent.Failure.notInstalled {
                fail("Claude Code isn't set up, so I can't chat properly.", round: round); return
            } catch {
                fail("I couldn't think that through in time.", round: round); return
            }
        }
    }
}

extension FilmSessionModel {
    /// A small centered system line in the chat ("Sent to the director: …"), also told to Rasan on its next turn.
    func systemLine(_ text: String, step: String? = nil) {
        let full = ThreadMessage.studioPrefix + text
        studioLines[Self.normalized(full)] = text
        addLocal(step ?? shownStep, fromUser: true, full)
        studioSaid = Array((studioSaid + ["Studio: " + text]).suffix(8))
    }

    /// Runs what Rasan's reply asked for and returns what really happened. The ones that need the person's yes run only on a turn the person
    /// wrote, and only if Rasan proposed the same action on the turn before; otherwise they are held as proposals (Rasan has asked in words).
    func runChatActions(_ actions: [ChatReplyAction], step: String, personTurn: Bool) async -> [ChatActionResult] {
        var results: [ChatActionResult] = []
        var held: [String: ChatReplyAction] = [:]
        for action in actions {
            if action.needsConsent {
                if personTurn, proposals[action.key] != nil { results.append(await actionRunner(action)) } else { held[action.key] = action }
            } else { results.append(await actionRunner(action)) }
        }
        // A turn the person wrote renews or drops the proposals; a trigger or follow-up turn only adds to them.
        if personTurn { proposals = held } else { proposals.merge(held) { _, new in new } }
        return results
    }

    /// Rasan's `tell_director`: the instruction goes into the run's queue as a `revision-request` (the engine reads its scope; the director
    /// picks it up at its next `console.mjs wait`), plus a plain system line, and a word on why it may sit there when nothing is reading.
    func passToDirector(_ text: String, step: String) async {
        guard isFixture || isConnected else { systemLine("Not sent: this film's folder can't be read right now.", step: step); return }
        let value = ChatAnswerer.revisionValue(text: text, step: step, film: snapshot.title.isEmpty ? nil : snapshot.title, playhead: playhead?.time, shotID: playhead?.shotID)
        guard await send(step: step, type: "revision-request", value: value, note: text) else { systemLine("I couldn't send that to the director.", step: step); return }
        var line = "Sent to the director: " + Self.clip(text, 160)
        if ["paused", "failed", "stopped"].contains(snapshot.raw["run_status"]["state"].string ?? "") { line += ". " + transportLine() }
        systemLine(line, step: step)
    }
}

/// The reply as it types: "Rasan is typing…" until the first word, then the words with a blinking caret, in the same bubble the answer keeps.
struct ChatReplyStreamRow: View {
    let model: FilmSessionModel
    var body: some View {
        if let text = model.streamingText, !text.isEmpty {
            HStack(spacing: 0) {
                TimelineView(.periodic(from: .now, by: 0.5)) { context in
                    let on = Int(context.date.timeIntervalSinceReferenceDate * 2) % 2 == 0
                    (Text(text) + Text("▍").foregroundColor(on ? .secondary : .clear)).font(.system(size: 13))
                }
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                Spacer(minLength: 36)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Rasan is writing: " + text)
        } else {
            HStack(spacing: 6) {
                ProgressView().controlSize(.small)
                Text("Rasan is typing…").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            .padding(.top, 4)
            .accessibilityElement(children: .combine)
        }
    }
}
