import Foundation

/// Claude's "session limit · resets 3pm" stop. The limit resets on its own, so the film can be resumed then.
public struct SessionLimit: Equatable, Sendable {
    /// The reset time as the director printed it ("3pm", "Oct 10, 3:30am"), for messages.
    public var resetText: String?
    /// The reset as a moment, when it could be read.
    public var resetsAt: Date?
    public init(resetText: String?, resetsAt: Date?) { self.resetText = resetText; self.resetsAt = resetsAt }
    public var message: String {
        guard let resetText else { return "Your Claude plan's limit was reached. Resume once it resets." }
        return "Your Claude plan's limit was reached; it resets at \(resetText)."
    }

    public static func detect(in log: String, now: Date = Date(), calendar: Calendar = .current) -> SessionLimit? {
        let text = log.replacingOccurrences(of: "\\n", with: "\n")
        let window = text.index(text.endIndex, offsetBy: -min(text.count, 8000))..<text.endIndex
        var found: SessionLimit?
        // Several lines can match; the last one is the current state.
        var cursor = window
        while let match = text.range(of: #"(?i)\b(session|usage|weekly|opus|\d+-hour)\s+limit[^\n]{0,60}?resets?\s+(?:at\s+)?([^\n"\\]{2,48})"#, options: .regularExpression, range: cursor) {
            let line = String(text[match])
            let raw = line.range(of: #"(?i)resets?\s+(?:at\s+)?"#, options: .regularExpression).map { String(line[$0.upperBound...]) } ?? ""
            let clean = raw.trimmingCharacters(in: CharacterSet(charactersIn: " .·\t\r}]\""))
            found = SessionLimit(resetText: clean.isEmpty ? nil : clean, resetsAt: parseReset(clean, now: now, calendar: calendar))
            cursor = match.upperBound..<window.upperBound
        }
        if found != nil { return found }
        // The older form: "Claude AI usage limit reached|1760000000".
        if let match = text.range(of: #"(?i)limit reached\|(\d{9,11})"#, options: .regularExpression),
           let epoch = Double(text[match].split(separator: "|").last ?? "") {
            let date = Date(timeIntervalSince1970: epoch)
            let f = DateFormatter(); f.calendar = calendar; f.timeZone = calendar.timeZone; f.dateFormat = "h:mm a"
            return SessionLimit(resetText: f.string(from: date).lowercased(), resetsAt: date)
        }
        return nil
    }

    /// "3pm", "3:30pm", "3pm (Asia/Kolkata)", "Oct 10, 3pm": the next such moment after `now`.
    public static func parseReset(_ text: String, now: Date, calendar: Calendar = .current) -> Date? {
        var calendar = calendar
        if let zone = text.range(of: #"\(([A-Za-z_]+/[A-Za-z_/]+|UTC|GMT)\)"#, options: .regularExpression),
           let tz = TimeZone(identifier: String(text[zone].dropFirst().dropLast())) { calendar.timeZone = tz }
        guard let time = text.range(of: #"(?i)(\d{1,2})(?::(\d{2}))?\s*(am|pm)"#, options: .regularExpression) else { return nil }
        let parts = String(text[time]).lowercased().replacingOccurrences(of: " ", with: "")
        let pm = parts.hasSuffix("pm")
        let digits = parts.dropLast(2).split(separator: ":").compactMap { Int($0) }
        guard var hour = digits.first, (1...12).contains(hour) else { return nil }
        let minute = digits.count > 1 ? digits[1] : 0
        guard minute < 60 else { return nil }
        hour = hour % 12 + (pm ? 12 : 0)
        var target = calendar.dateComponents([.year, .month, .day], from: now)
        target.hour = hour; target.minute = minute; target.second = 0
        let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        if let dated = text.range(of: #"(?i)\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b"#, options: .regularExpression) {
            let pieces = String(text[dated]).lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            if pieces.count >= 2, let month = months.firstIndex(of: String(pieces[0].prefix(3))), let day = Int(pieces[1]) {
                target.month = month + 1; target.day = day
                guard var date = calendar.date(from: target) else { return nil }
                if date < now { target.year = (target.year ?? 0) + 1; date = calendar.date(from: target) ?? date }
                return date
            }
        }
        guard let date = calendar.date(from: target) else { return nil }
        return date > now ? date : calendar.date(byAdding: .day, value: 1, to: date)
    }
}

/// What Studio does when the director process ends before the film is done. Pure, so every branch is testable.
public enum AutoResumePolicy {
    /// How long after a stop before Studio resumes by itself.
    public static let delay: TimeInterval = 10
    /// A second stop this soon after an automatic resume is shown as a real failure.
    public static let cooldown: TimeInterval = 600
    public static let resumingText = "The director stopped mid-film; resuming once automatically."

    public enum Decision: Equatable, Sendable {
        /// Show the normal state (finished, failed with Resume, or waiting on the person).
        case none
        /// Resume once automatically after `delay` seconds.
        case resume(after: TimeInterval)
        /// The plan's limit was reached: offer Resume now, and resume by itself at `resetsAt` when that is known.
        case waitForLimit(SessionLimit)
    }

    public static func decide(outcome: (recovery: DirectorRecovery, detail: String)?, stopRequested: Bool, progress: DirectorRecovery.Progress,
                              log: String, lastAutoResume: Date?, now: Date = Date()) -> Decision {
        if stopRequested { return .none }          // a person pressed Stop or Pause: never undo that
        guard let outcome else { return .none }    // a real finish
        if progress.awaitingUser { return .none }  // it is the person's turn, not a stop
        switch outcome.recovery {
        case .usageLimit:
            if let limit = SessionLimit.detect(in: log, now: now) { return .waitForLimit(limit) }
            return .none
        case .stoppedEarly, .unknown:
            if let last = lastAutoResume, now.timeIntervalSince(last) < cooldown { return .none }
            return .resume(after: delay)
        case .signIn, .toolPermissions, .permissions, .missingTools:
            return .none
        }
    }
}
