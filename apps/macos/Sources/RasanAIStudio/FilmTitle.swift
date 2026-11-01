import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// A short working title for a new film, from its brief: Apple's on-device model where there is one (macOS 26 with Apple
/// Intelligence on), else the brief's own subject. The person can always rename it on the New film page.
enum FilmTitle {
    static func suggest(for brief: String) async -> String {
        guard !Task.isCancelled else { return fromBrief(brief) }
        #if canImport(FoundationModels)
        if #available(macOS 26, *), SystemLanguageModel.default.isAvailable {
            let model = Task { () -> String? in
                let session = LanguageModelSession(instructions: """
                    You name short films. Reply with ONLY the title: two to five words in Title Case, no quotes, no \
                    markdown, no punctuation at the end, no words like "film", "video" or "launch". Never greet, never \
                    explain, never offer ideas or options ("Sure!", "Here are", "Title:"). Name the one film described.
                    """)
                return (try? await session.respond(to: "Brief: \(brief)")).map { clean($0.content) }
            }
            // Never hold the person up: a slow first load of the model falls back to the brief's subject.
            let timeout = Task { try? await Task.sleep(for: .seconds(3)); model.cancel() }
            let title = await withTaskCancellationHandler {
                await model.value
            } onCancel: {
                model.cancel()
            }
            timeout.cancel()
            if let title, isUsable(title) { return title }
        }
        #endif
        return fromBrief(brief)
    }

    /// "A 30-second launch film for my budgeting app. Calm…" -> "Launch film for my budgeting app".
    static func fromBrief(_ brief: String) -> String {
        var text = brief.split(whereSeparator: { ".!?\n".contains($0) }).first.map(String.init) ?? brief
        text = text.replacingOccurrences(of: #"^\s*(please\s+)?((make|create|build|i want|i need|we need)\s+)?(me\s+)?((a|an|the)\s+)?"#,
                                         with: "", options: [.regularExpression, .caseInsensitive])
        text = text.replacingOccurrences(of: #"\b\d+\s*[- ]?\s*(seconds?|secs?|s|minutes?|mins?)\b\s*"#,
                                         with: "", options: [.regularExpression, .caseInsensitive])
        var words = text.split(whereSeparator: \.isWhitespace).prefix(6).map(String.init)
        while let last = words.last, ["for", "of", "and", "with", "to", "my", "our", "a", "an", "the", "that", "about"].contains(last.lowercased()) {
            words.removeLast()
        }
        let title = words.joined(separator: " ").trimmingCharacters(in: .punctuationCharacters.union(.whitespaces))
        guard let first = title.first else { return "Untitled film" }
        return first.uppercased() + title.dropFirst()
    }

    /// A chat-reply opener or a label, never a title: "Sure! Here are some ideas…", "Title: Foo".
    private static let preamble = #"^\s*(sure|certainly|of course|absolutely|okay|ok|great|here(?:'s| is| are)|title\b|film title|name\b|i(?:'d| would| can| will)|let me|how about|some ideas)"#

    /// True when a title is a plausible name and not a chat reply (used on stored names too).
    static func isUsable(_ title: String) -> Bool {
        let words = title.split(whereSeparator: \.isWhitespace).count
        return !title.isEmpty && title.count <= 60 && words <= 8 && title.range(of: preamble, options: [.regularExpression, .caseInsensitive]) == nil
    }

    /// A stored name that is an obvious assistant preamble (so it can be replaced by the brief's subject).
    static func isChatPreamble(_ name: String) -> Bool {
        name.range(of: preamble, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Model output -> one clean title line: markdown, quotes, "Title:" labels and trailing punctuation removed.
    private static func clean(_ reply: String) -> String {
        let junk = CharacterSet(charactersIn: "\"'“”‘’*#_`.:!?-–—").union(.whitespaces)
        let lines = reply.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: junk) }.filter { !$0.isEmpty }
        for line in lines {
            var text = line.replacingOccurrences(of: #"^(film\s+)?(title|name)\s*[:\-–—]\s*"#, with: "", options: [.regularExpression, .caseInsensitive])
            text = text.trimmingCharacters(in: junk)
            if isUsable(text) { return text }
        }
        return ""
    }
}
