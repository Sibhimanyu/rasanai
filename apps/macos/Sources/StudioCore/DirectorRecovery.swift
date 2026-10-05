import Foundation

/// Only known failure signatures produce specific advice. Unknown exits keep the log available.
public enum DirectorRecovery: String, Sendable {
    case signIn, usageLimit, permissions, missingTools, unknown

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
        case .permissions: "Your director couldn't access a file"
        case .missingTools: "A film tool is missing"
        case .unknown: "Your director stopped unexpectedly"
        }
    }
    public var message: String {
        switch self {
        case .signIn: "Sign in again, recheck your director, then resume. Your completed work is saved."
        case .usageLimit: "Check your provider's limit or wait for it to reset, then resume. Your completed work is saved."
        case .permissions: "Check the affected file in the log and its access permissions, then resume. Your completed work is saved."
        case .missingTools: "The log names the missing tool. Set it up, then resume. Your completed work is saved."
        case .unknown: "Open the log to see what happened. Your completed work is saved; resume after resolving the problem."
        }
    }
}
