import Foundation

/// Only known failure signatures produce specific advice. Unknown exits keep the log available.
public enum DirectorRecovery: String, Sendable {
    case signIn, usageLimit, toolPermissions, permissions, missingTools, stoppedEarly, unknown

    /// Where the film stood when the director process ended.
    public struct Progress: Equatable, Sendable {
        public var pushedAnyStep: Bool
        public var currentStep: String
        public var finished: Bool
        public init(pushedAnyStep: Bool = false, currentStep: String = "brief", finished: Bool = false) {
            self.pushedAnyStep = pushedAnyStep; self.currentStep = currentStep; self.finished = finished
        }
        public init(session: SessionSnapshot?) {
            guard let session else { self.init(); return }
            let steps = session.raw["steps"].object
            let pushed = steps.values.contains { ($0["status"].string ?? "working") != "working" }
            let done = session.stage == .final && session.final["status"].string == "done"
            self.init(pushedAnyStep: pushed, currentStep: session.currentStep, finished: done)
        }
    }

    /// An exit is a failure when the process failed, or when it ended cleanly while the film was still unfinished
    /// (the director must keep waiting on the console, so a quiet exit 0 means it gave up). Returns nil for a real finish.
    public static func classify(exitCode: Int32, log: String, progress: Progress) -> (recovery: Self, detail: String)? {
        if exitCode == 0 && progress.finished { return nil }
        let denied = permissionDenials(in: log)
        if !denied.isEmpty {
            let list = denied.prefix(3).map { "• " + $0 }.joined(separator: "\n")
            return (.toolPermissions, "Blocked: \n\(list)")
        }
        if exitCode != 0 {
            let known = classify(log: log)
            return (known, "")
        }
        if hitBackgroundCeiling(log: log) {
            return (.stoppedEarly, "The director's helpers were still running when its session timed out, so it ended early. Resume continues from the saved state.")
        }
        let step = FilmStepName.friendly(progress.currentStep)
        let detail = progress.pushedAnyStep ? "The director stopped before the \(step) step was finished." : "The director stopped before it pushed anything to the console."
        return (.stoppedEarly, detail)
    }

    /// claude --print terminates unfinished background agents after its ceiling and exits 0.
    public static func hitBackgroundCeiling(log: String) -> Bool { log.contains("Background tasks still running after") }

    /// Commands and files the director was refused, from stream-json `permission_denials` and from refusal messages in tool results.
    public static func permissionDenials(in log: String) -> [String] {
        var found: [String] = []
        func add(_ text: String) { let t = String(text.prefix(140)); if !found.contains(t) { found.append(t) } }
        for line in log.split(separator: "\n") where line.contains("permission_denials") || line.contains("haven't granted") || line.contains("requires approval") || line.contains("was blocked") {
            guard let data = line.data(using: .utf8), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            if let denials = object["permission_denials"] as? [[String: Any]] {
                for denial in denials {
                    let input = denial["tool_input"] as? [String: Any] ?? [:]
                    let what = (input["command"] as? String) ?? (input["file_path"] as? String) ?? (input["path"] as? String) ?? ""
                    add("\(denial["tool_name"] as? String ?? "Tool") \(what)".trimmingCharacters(in: .whitespaces))
                }
            }
        }
        if found.isEmpty, log.contains("haven't granted it yet") || log.contains("requires approval") { add("a tool call needed approval") }
        return found
    }

    public static func classify(log: String) -> Self {
        let text = log.lowercased()
        if ["not logged in", "not signed in", "authentication failed", "invalid api key", "invalid_api_key", "token expired", "token has expired", "unauthorized", "authentication_error"].contains(where: text.contains) { return .signIn }
        if ["rate limit exceeded", "rate_limit_exceeded", "usage limit", "quota exceeded", "insufficient_quota", "exceeded your current quota", "too many requests"].contains(where: text.contains) { return .usageLimit }
        if ["permission denied", "operation not permitted", "eacces", "eperm"].contains(where: text.contains) { return .permissions }
        if ["ffmpeg: command not found", "hyperframes: command not found", "node: command not found", "ffmpeg is not installed", "browser executable doesn't exist", "could not find chrome"].contains(where: text.contains) { return .missingTools }
        return .unknown
    }
    public var title: String {
        switch self {
        case .signIn: "Your director needs you to sign in"
        case .usageLimit: "Your director reached a usage limit"
        case .toolPermissions: "RasanAI needs permission to run its tools"
        case .stoppedEarly: "The director stopped before finishing"
        case .permissions: "Your director couldn't access a file"
        case .missingTools: "A film tool is missing"
        case .unknown: "Your director stopped unexpectedly"
        }
    }
    public var message: String {
        switch self {
        case .signIn: "Sign in again, recheck your director, then resume. Your completed work is saved."
        case .usageLimit: "Check your provider's limit or wait for it to reset, then resume. Your completed work is saved."
        case .toolPermissions: "Your director was blocked from running a command or reading a file it needs, so it stopped. Update RasanAI, or turn on Settings → Director → Allow unrestricted tools, then resume. Your completed work is saved."
        case .stoppedEarly: "Open the log to see why it stopped, then resume. Your completed work is saved."
        case .permissions: "Check the affected file in the log and its access permissions, then resume. Your completed work is saved."
        case .missingTools: "The log names the missing tool. Set it up, then resume. Your completed work is saved."
        case .unknown: "Open the log to see what happened. Your completed work is saved; resume after resolving the problem."
        }
    }
}

/// Console step ids in plain words for messages.
public enum FilmStepName {
    public static func friendly(_ step: String) -> String {
        switch ReviewStage.consoleStep(step) {
        case .brief: "brief"
        case .story: "story"
        case .look: "look"
        case .animatic: "animatic"
        case .final: "final cut"
        }
    }
}
