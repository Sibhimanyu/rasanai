import Foundation

public struct ConsoleAddress: Sendable {
    public let port: Int
    public let token: String
    public let root: URL
    public init(data: Data) throws {
        let value = try JSONDecoder().decode(JSONValue.self, from: data)
        guard let port = value["port"].number, port.isFinite, port.rounded() == port, (1...65535).contains(port),
              let token = value["token"].string, token.range(of: "^[a-f0-9]{24}$", options: .regularExpression) != nil,
              let root = value["root"].string, root.hasPrefix("/") else { throw StudioError.invalidAddress }
        self.port = Int(port)
        self.token = token
        self.root = URL(fileURLWithPath: root, isDirectory: true)
    }
    public var baseURL: URL { URL(string: "http://127.0.0.1:\(port)")! }
    public func request(path: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.timeoutInterval = 5
        request.setValue("rasa_\(token.prefix(6))=\(token)", forHTTPHeaderField: "Cookie")
        request.setValue(token, forHTTPHeaderField: "x-rasa-token")
        return request
    }
}

/// Uses the console's authenticated API; never writes the engine's session or action queue directly.
public final class ConsoleClient: Sendable {
    public let address: ConsoleAddress
    private let session: URLSession
    public init(address: ConsoleAddress) {
        self.address = address
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        self.session = URLSession(configuration: configuration)
    }
    public func state() async throws -> SessionSnapshot {
        let data = try await perform(address.request(path: "api/state"))
        return try SessionSnapshot(data: data)
    }
    public func send(step: String, type: String, value: JSONValue = .null, note: String = "") async throws {
        var request = address.request(path: "api/action")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(JSONValue.object([
            "step": .string(step), "type": .string(type), "value": value, "note": .string(note)
        ]))
        _ = try await perform(request)
    }
    /// The console's live stream (`/api/events`): a full state on connect and on every change, plus a `ping` heartbeat
    /// every 15 s. The stream ends (throws) when the connection drops; the caller reconnects with backoff.
    public func events() -> AsyncThrowingStream<ConsoleEvent, Error> {
        let address = address
        let session = session
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = address.request(path: "api/events")
                    request.timeoutInterval = 90
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else { throw StudioError.noConnection }
                    guard (200..<300).contains(http.statusCode) else { throw StudioError.unavailable(http.statusCode) }
                    var parser = SSEParser()
                    for try await line in bytes.lines {
                        guard let event = parser.feed(line: line) else { continue }
                        switch event.name {
                        case "state":
                            if let snapshot = try? SessionSnapshot(data: Data(event.data.utf8)) { continuation.yield(.state(snapshot)) }
                        case "ping": continuation.yield(.ping)
                        default: break
                        }
                    }
                    continuation.finish()
                } catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
    private func perform(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw StudioError.noConnection }
        guard (200..<300).contains(response.statusCode) else { throw StudioError.unavailable(response.statusCode) }
        return data
    }
}

/// Local previews are restricted to the selected run and the console's declared workspace.
public struct AssetResolver: Sendable {
    public let run: URL
    public let workspace: URL
    public init(run: URL, workspace: URL) { self.run = run; self.workspace = workspace }
    public func resolve(_ path: String?) -> URL? {
        guard let path, !path.isEmpty, !path.contains("\0"), !path.contains("://") else { return nil }
        let candidates = path.hasPrefix("/") ? [URL(fileURLWithPath: path)] :
            [workspace.appendingPathComponent(path), run.appendingPathComponent(path)]
        let roots = [run, workspace].map { $0.resolvingSymlinksInPath().standardizedFileURL.path }
        return candidates.compactMap { candidate -> URL? in
            let resolved = candidate.resolvingSymlinksInPath().standardizedFileURL
            guard roots.contains(where: { resolved.path.hasPrefix($0 + "/") }),
                  !["address.json", "console.json", "actions.jsonl", "consumed.json", "director-job.json", "director.log"].contains(resolved.lastPathComponent),
                  FileManager.default.fileExists(atPath: resolved.path) else { return nil }
            return resolved
        }.first
    }
}


public enum ConsoleEvent: Sendable {
    case state(SessionSnapshot)
    case ping
}

public struct SSEEvent: Equatable, Sendable {
    public let name: String
    public let data: String
}

/// Line-based server-sent-events parsing. The console writes each event as `event: x` + one `data:` line. Foundation's
/// `lines` drops blank lines, so an event is emitted when its `data:` line arrives rather than at the blank separator.
public struct SSEParser: Sendable {
    private var name = "message"
    public init() {}
    public mutating func feed(line: String) -> SSEEvent? {
        if line.isEmpty { name = "message"; return nil }
        if line.hasPrefix(":") { return nil }
        let field: Substring, value: Substring
        if let colon = line.firstIndex(of: ":") {
            field = line[..<colon]
            var rest = line[line.index(after: colon)...]
            if rest.hasPrefix(" ") { rest = rest.dropFirst() }
            value = rest
        } else { field = Substring(line); value = "" }
        switch field {
        case "event": name = String(value); return nil
        case "data":
            defer { name = "message" }
            return SSEEvent(name: name, data: String(value))
        default: return nil
        }
    }
}
