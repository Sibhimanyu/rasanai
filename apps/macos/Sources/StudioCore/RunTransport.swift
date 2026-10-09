import Foundation

/// How RasanAI Studio and the director talk: through the run folder's files, with no server.
///
///   director -> app   `console.mjs` (headless) rewrites `session.json` atomically (tmp + rename); the app watches the folder
///   app -> director   the app appends one JSON line per action to `actions.jsonl` under the shared lock; `console.mjs wait`
///                     validates it, applies its effects to `session.json`, prints it and lists it in `consumed.json`
///
/// The wire format is `skills/rasanai/references/console.md` ("Headless mode"). Nothing here opens a port.
public enum RunProtocol {
    /// Mirrors `STEPS` in `skills/rasanai/scripts/console.mjs` (a test keeps the two equal).
    public static let steps = ["brief", "research", "brand", "route", "footage", "story", "direction", "films", "concept", "scenes", "look", "motion", "styleframes", "animatic", "reel", "transitions", "voice", "music", "keyframes", "storyboard", "plan", "build", "render", "final"]
    public static let maxActionBytes = 1_000_000

    /// The same check the server did on POST: a known step (or `*`) and a type of 2-20 lowercase letters and dashes.
    public static func validate(step: String, type: String) throws {
        guard steps.contains(step) || step == "*" else { throw RunTransportError.unknownStep(step) }
        guard type.range(of: "^[a-z-]{2,20}$", options: .regularExpression) != nil else { throw RunTransportError.badType(type) }
    }
}

public enum RunTransportError: LocalizedError, Equatable {
    case unknownStep(String), badType(String), tooLarge, locked, writeFailed(String)
    public var errorDescription: String? {
        switch self {
        case .unknownStep(let step): "“\(step)” is not a step the director knows."
        case .badType(let type): "“\(type)” is not a valid action type."
        case .tooLarge: "That answer is too large to send."
        case .locked: "The run's action queue is busy. Try again in a moment."
        case .writeFailed(let reason): "Could not write your answer to the film's folder. \(reason)"
        }
    }
}

/// The lock `console.mjs` and the app share (`lib/runlock.mjs`): a file created with O_EXCL holding "<pid> <unix ms>".
/// A lock whose owner is gone, or older than 10 s, is taken over.
public enum RunLock {
    public static let staleAfter: TimeInterval = 10

    public static func withLock<T>(_ url: URL, timeout: TimeInterval = 6, _ body: () throws -> T) throws -> T {
        guard acquire(url, timeout: timeout) else { throw RunTransportError.locked }
        defer { release(url) }
        return try body()
    }

    /// For readers: take the lock when it is free, otherwise read anyway (a reader must never hang a film).
    public static func withOptionalLock<T>(_ url: URL, timeout: TimeInterval = 2, _ body: () throws -> T) rethrows -> T {
        let held = acquire(url, timeout: timeout)
        defer { if held { release(url) } }
        return try body()
    }

    static func acquire(_ url: URL, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        let path = url.path
        while true {
            let fd = open(path, O_WRONLY | O_CREAT | O_EXCL, 0o644)
            if fd >= 0 {
                let line = "\(getpid()) \(Int(Date().timeIntervalSince1970 * 1000))\n"
                _ = line.withCString { write(fd, $0, strlen($0)) }
                close(fd)
                return true
            }
            if errno != EEXIST { return false }
            if isStale(path) { unlink(path); continue }
            if Date() > deadline { return false }
            usleep(UInt32.random(in: 5_000...20_000))
        }
    }

    static func release(_ url: URL) {
        guard let text = try? String(contentsOf: url, encoding: .utf8),
              let owner = text.split(separator: " ").first.flatMap({ Int32($0) }), owner == getpid() else { return }
        unlink(url.path)
    }

    private static func isStale(_ path: String) -> Bool {
        var info = stat()
        guard stat(path, &info) == 0 else { return false }
        let modified = Double(info.st_mtimespec.tv_sec) + Double(info.st_mtimespec.tv_nsec) / 1e9
        if Date().timeIntervalSince1970 - modified > staleAfter { return true }
        guard let text = try? String(contentsOfFile: path, encoding: .utf8), let pid = text.split(separator: " ").first.flatMap({ Int32($0) }), pid > 0 else { return false }
        return kill(pid, 0) == -1 && errno == ESRCH
    }
}

/// An action the person sent that `console.mjs wait` has not consumed yet.
public struct QueuedAction: Equatable, Sendable {
    public let id: String
    public let ts: String
    public let step: String
    public let type: String
    public let value: JSONValue
    public let note: String
    public var json: JSONValue {
        .object(["id": .string(id), "ts": .string(ts), "step": .string(step), "type": .string(type), "value": value, "note": .string(note), "source": .string("console")])
    }
}

/// An action `wait` refused (invalid), with why.
public struct RejectedAction: Equatable, Sendable {
    public let id: String
    public let error: String
}

public final class RunTransport: Sendable {
    public let run: URL
    public init(run: URL) { self.run = run }

    public var sessionURL: URL { run.appendingPathComponent("session.json") }
    public var actionsURL: URL { run.appendingPathComponent("actions.jsonl") }
    public var consumedURL: URL { run.appendingPathComponent("consumed.json") }
    public var rejectedURL: URL { run.appendingPathComponent("rejected.json") }
    public var consoleURL: URL { run.appendingPathComponent("console.json") }
    public var actionsLockURL: URL { run.appendingPathComponent("actions.lock") }

    // MARK: Reading

    /// The raw bytes of `session.json` once they parse as a session. A missing file is nil at once; a half-written or
    /// momentarily unreadable one is retried briefly (the engine writes by rename, so it normally never is).
    public func readSessionData(attempts: Int = 4) -> (data: Data, snapshot: SessionSnapshot)? {
        for attempt in 0..<attempts {
            if let data = try? Data(contentsOf: sessionURL), !data.isEmpty, let snapshot = try? SessionSnapshot(data: data) { return (data, snapshot) }
            if !FileManager.default.fileExists(atPath: sessionURL.path) { return nil }
            if attempt + 1 < attempts { usleep(30_000) }
        }
        return nil
    }
    public func readSession() -> SessionSnapshot? { readSessionData()?.snapshot }

    /// Actions in `actions.jsonl` that `wait` has neither consumed nor rejected, oldest first. Lines that are not complete,
    /// valid actions are ignored here (the engine's `wait` is what rejects them).
    public func pending() -> [QueuedAction] {
        let text: String = RunLock.withOptionalLock(actionsLockURL) {
            (try? String(contentsOf: actionsURL, encoding: .utf8)) ?? ""
        }
        guard !text.isEmpty else { return [] }
        var lines = text.components(separatedBy: "\n")
        lines.removeLast()   // the text after the last newline: empty, or a line still being written
        let consumed = Set(readIDs(consumedURL))
        var seen = Set<String>()
        return lines.compactMap { line -> QueuedAction? in
            guard !line.isEmpty, let value = try? JSONDecoder().decode(JSONValue.self, from: Data(line.utf8)), case .object = value,
                  let id = value["id"].string, !consumed.contains(id), !seen.contains(id),
                  let step = value["step"].string, let type = value["type"].string,
                  (try? RunProtocol.validate(step: step, type: type)) != nil else { return nil }
            seen.insert(id)
            return QueuedAction(id: id, ts: value["ts"].string ?? "", step: step, type: type, value: value["value"],
                                note: String((value["note"].string ?? "").prefix(4000)))
        }
    }

    public func rejections() -> [RejectedAction] {
        guard let data = try? Data(contentsOf: rejectedURL), let value = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [] }
        return value.array.compactMap { entry in
            guard let id = entry["id"].string else { return nil }
            return RejectedAction(id: id, error: entry["error"].string ?? "refused")
        }
    }

    private func readIDs(_ url: URL) -> [String] {
        guard let data = try? Data(contentsOf: url), let value = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [] }
        return value.array.compactMap(\.string)
    }

    // MARK: Writing

    /// Validates an action like the engine does and appends it as one JSON line under the shared lock.
    @discardableResult
    public func append(step: String, type: String, value: JSONValue = .null, note: String = "", now: Date = Date()) throws -> QueuedAction {
        try RunProtocol.validate(step: step, type: type)
        let action = QueuedAction(id: Self.newID(), ts: Self.iso(now), step: step, type: type, value: value, note: String(note.prefix(4000)))
        var line = try JSONEncoder().encode(action.json)
        guard line.count < RunProtocol.maxActionBytes else { throw RunTransportError.tooLarge }
        line.append(0x0A)
        try RunLock.withLock(actionsLockURL) {
            let fd = open(actionsURL.path, O_WRONLY | O_CREAT | O_APPEND, 0o644)
            guard fd >= 0 else { throw RunTransportError.writeFailed(String(cString: strerror(errno))) }
            defer { close(fd) }
            let written = line.withUnsafeBytes { write(fd, $0.baseAddress, $0.count) }
            guard written == line.count else { throw RunTransportError.writeFailed(String(cString: strerror(errno))) }
        }
        return action
    }

    static func newID() -> String { (0..<5).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined() }
    static func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    // MARK: Watching

    /// Yields when something in the run folder may have changed (the director rewrote `session.json`, `wait` consumed an
    /// action). Debounced; a slow heartbeat covers a missed event. Yields once straight away.
    public func changes(debounce: TimeInterval = 0.06, heartbeat: TimeInterval = 2) -> AsyncStream<Void> {
        let watcher = RunWatcher(directory: run, debounce: debounce, heartbeat: heartbeat)
        return AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            watcher.start { continuation.yield() }
            continuation.yield()
            continuation.onTermination = { _ in watcher.stop() }
        }
    }
}

/// A DispatchSource on the run folder (every `session.json` rewrite is a rename inside it) plus a heartbeat timer.
final class RunWatcher: @unchecked Sendable {
    private let queue = DispatchQueue(label: "rasanai.run-watcher")
    private let directory: URL
    private let debounce: TimeInterval
    private let heartbeat: TimeInterval
    private var source: DispatchSourceFileSystemObject?
    private var timer: DispatchSourceTimer?
    private var pending: DispatchWorkItem?

    init(directory: URL, debounce: TimeInterval, heartbeat: TimeInterval) {
        self.directory = directory; self.debounce = debounce; self.heartbeat = heartbeat
    }

    func start(_ fire: @escaping @Sendable () -> Void) {
        queue.async { [self] in
            let fd = open(directory.path, O_EVTONLY)
            if fd >= 0 {
                let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: [.write, .extend, .rename, .delete, .link, .attrib], queue: queue)
                source.setEventHandler { [weak self] in self?.schedule(fire) }
                source.setCancelHandler { close(fd) }
                source.resume()
                self.source = source
            }
            let timer = DispatchSource.makeTimerSource(queue: queue)
            timer.schedule(deadline: .now() + heartbeat, repeating: heartbeat)
            timer.setEventHandler { fire() }
            timer.resume()
            self.timer = timer
        }
    }

    private func schedule(_ fire: @escaping @Sendable () -> Void) {
        pending?.cancel()
        let item = DispatchWorkItem { fire() }
        pending = item
        queue.asyncAfter(deadline: .now() + debounce, execute: item)
    }

    func stop() {
        queue.async { [self] in
            pending?.cancel(); pending = nil
            source?.cancel(); source = nil
            timer?.cancel(); timer = nil
        }
    }
}

/// What the screen should show before the director has consumed the person's actions: the "sent" banner, the note they just
/// left, their thread message, the answered question. Every effect is idempotent, so once `wait` has applied the real
/// ones (a moment before it lists the action as consumed) the two agree.
public enum SessionOverlay {
    public static let readingMessage = "Claude is reading your answer…"

    public static func apply(_ queued: [QueuedAction], to snapshot: SessionSnapshot) -> SessionSnapshot {
        guard !queued.isEmpty else { return snapshot }
        var root = snapshot.raw.object
        var steps = root["steps"]?.object ?? [:]
        for action in queued {
            if action.step == "*" {
                if root["decide_rest"] == nil || root["decide_rest"] == .null { root["decide_rest"] = .object(["ts": .string(action.ts)]) }
                continue
            }
            if var step = steps[action.step]?.object {
                if !["comment", "knob"].contains(action.type) {
                    step["sent"] = .object(["type": .string(action.type), "value": action.value, "note": .string(action.note), "ts": .string(action.ts)])
                }
                if action.type != "comment", !action.note.isEmpty {
                    var thread = step["thread"]?.array ?? []
                    if !thread.contains(where: { $0["who"].string == "you" && $0["t"].string == action.ts && $0["text"].string == action.note }) {
                        thread.append(.object(["who": .string("you"), "text": .string(action.note), "t": .string(action.ts)]))
                    }
                    step["thread"] = .array(thread)
                }
                steps[action.step] = .object(step)
            }
            if action.type == "answer", var ask = root["ask"]?.object, ask["answered"] == nil || ask["answered"] == .null {
                let choice = action.value["choice"].string
                let label = (ask["options"]?.array ?? []).first { $0["id"].string == choice }?["label"].string
                ask["answered"] = .object(["choice": choice.map(JSONValue.string) ?? .null, "label": label.map(JSONValue.string) ?? .null,
                                           "text": .string(action.value["text"].string ?? ""), "t": .string(action.ts)])
                root["ask"] = .object(ask)
            } else if action.type == "comment" {
                var comments = root["comments"]?.array ?? []
                if !comments.contains(where: { $0["id"].string == action.id }) {
                    let v = action.value
                    comments.append(.object([
                        "id": .string(action.id), "step": .string(action.step), "scene": v["scene"], "t": v["t"].number.map(JSONValue.number) ?? .null,
                        "x": v["x"].number.map(JSONValue.number) ?? .null, "y": v["y"].number.map(JSONValue.number) ?? .null,
                        "scope": .string(v["scope"].string ?? "scene"), "quick": v["quick"], "text": .string(action.note.isEmpty ? (v["quick"].string ?? "") : action.note),
                        "state": .string("open"), "ts": .string(action.ts)]))
                }
                root["comments"] = .array(comments)
            } else if root["working"] == nil || root["working"] == .null {
                root["working"] = .object(["msg": .string(readingMessage), "t": .string(action.ts)])
            }
        }
        root["steps"] = .object(steps)
        return SessionSnapshot(raw: .object(root))
    }
}

public extension SessionSnapshot {
    init(raw: JSONValue) { self.raw = raw }
}
