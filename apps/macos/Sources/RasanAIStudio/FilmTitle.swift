import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// A short working title for a new film, from its brief: Apple's on-device model where there is one (macOS 26 with Apple
/// Intelligence on), else the brief's own subject. The person can always rename it on the New film page.
enum FilmTitle {
    static func suggest(for brief: String) async -> String {
        #if canImport(FoundationModels)
        if #available(macOS 26, *), SystemLanguageModel.default.isAvailable {
            let model = Task { () -> String? in
                let session = LanguageModelSession(instructions: """
                    You name short films. Reply with only a title of two to five words in Title Case: no quotes, no \
                    punctuation at the end, no words like "film", "video" or "launch".
                    """)
                return (try? await session.respond(to: "Brief: \(brief)")).map { clean($0.content) }
            }
            // Never hold the person up: a slow first load of the model falls back to the brief's subject.
            let timeout = Task { try? await Task.sleep(for: .seconds(3)); model.cancel() }
            let title = await model.value
            timeout.cancel()
            if let title, !title.isEmpty, title.count <= 60 { return title }
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

    private static func clean(_ reply: String) -> String {
        let line = reply.split(whereSeparator: \.isNewline).first.map(String.init) ?? reply
        return line.trimmingCharacters(in: CharacterSet(charactersIn: "\"'“”‘’*#.:").union(.whitespaces))
    }
}
