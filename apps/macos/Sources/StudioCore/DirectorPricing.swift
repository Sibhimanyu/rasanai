import Foundation

/// PRICE TABLE. The one place dollar rates live. USD per million tokens.
/// Claude figures come from Anthropic's published API pricing (checked 2026-10-06; the CLI's own `total_cost_usd`
/// matches them to the cent for Haiku 4.5 with 1-hour cache writes, which Claude Code uses). Anything computed from this
/// table is an estimate and the UI always labels it "est."; the CLI's reported cost wins whenever it is available.
/// Codex rates are approximate API list prices and only matter when Codex runs on an API key; on a ChatGPT plan no dollar
/// figure is shown at all.
public struct ModelPrice: Equatable, Sendable {
    public var input: Double
    public var output: Double
    public var cacheRead: Double
    public var cacheWrite: Double
    public init(input: Double, output: Double, cacheRead: Double, cacheWrite: Double) {
        self.input = input; self.output = output; self.cacheRead = cacheRead; self.cacheWrite = cacheWrite
    }
    /// Cache write at 2x input (the 1-hour cache Claude Code uses); read at 0.1x unless stated.
    static func claude(_ input: Double, _ output: Double, read: Double? = nil) -> ModelPrice {
        ModelPrice(input: input, output: output, cacheRead: read ?? input * 0.1, cacheWrite: input * 2)
    }
}

public enum ModelPricing {
    /// Matched in order against the lowercased model id (dates and suffixes ignored). First hit wins.
    static let table: [(match: String, price: ModelPrice)] = [
        ("fable", .claude(10, 50, read: 0.25)),
        ("mythos", .claude(10, 50, read: 0.25)),
        ("opus-5-5", .claude(4, 20, read: 0.20)),
        ("opus-5", .claude(5, 25)),
        ("opus-4-8", .claude(5, 25)),
        ("opus-4-7", .claude(5, 25)),
        ("opus-4-6", .claude(5, 25)),
        ("opus-4-5", .claude(5, 25)),
        ("opus-4-1", .claude(15, 75)),
        ("opus-4", .claude(15, 75)),
        ("sonnet-5", .claude(2, 10, read: 0.20)),
        ("sonnet-4", .claude(3, 15)),
        ("sonnet-3", .claude(3, 15)),
        ("haiku-4", .claude(1, 5)),
        ("haiku-3-5", .claude(0.8, 4)),
        ("haiku", .claude(1, 5)),
        // Codex / OpenAI (approximate API list prices).
        ("gpt-5", ModelPrice(input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25)),
        ("gpt-6", ModelPrice(input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25)),
        ("codex", ModelPrice(input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25)),
        ("gpt-4", ModelPrice(input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2)),
        ("o3", ModelPrice(input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2)),
    ]
    /// Unknown Claude ids are priced like Opus 5 so an estimate errs high rather than low.
    static let claudeFallback = ModelPrice.claude(5, 25)
    static let codexFallback = ModelPrice(input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25)

    public static func price(for model: String, agent: String? = nil) -> ModelPrice {
        let id = model.lowercased()
        if let hit = table.first(where: { id.contains($0.match) }) { return hit.price }
        return agent == "codex" ? codexFallback : claudeFallback
    }

    public static func isKnown(_ model: String) -> Bool { table.contains { model.lowercased().contains($0.match) } }

    public static func cost(of tokens: TokenTotals, model: String, agent: String? = nil) -> Double {
        let p = price(for: model, agent: agent)
        return (Double(tokens.input) * p.input + Double(tokens.output) * p.output + Double(tokens.cacheRead) * p.cacheRead + Double(tokens.cacheWrite) * p.cacheWrite) / 1_000_000
    }

    /// "Opus 5.5", "Sonnet 5.5", "gpt-5.5": a readable name for a model id.
    public static func displayName(_ model: String) -> String {
        let id = model.lowercased()
        for (family, label) in [("opus", "Opus"), ("sonnet", "Sonnet"), ("haiku", "Haiku"), ("fable", "Fable"), ("mythos", "Mythos")] where id.contains(family) {
            let rest = id.components(separatedBy: family).last ?? ""
            var parts: [String] = []
            for piece in rest.split(whereSeparator: { $0 == "-" || $0 == "_" }) {
                let text = String(piece)
                if text.count <= 2, text.allSatisfy(\.isNumber), parts.count < 2 { parts.append(text) } else { break }
            }
            return parts.isEmpty ? label : label + " " + parts.joined(separator: ".")
        }
        return model
    }
}

public enum UsageFormat {
    /// 842, 12.4k, 182k, 1.2M.
    public static func tokens(_ count: Int) -> String {
        switch count {
        case ..<1_000: "\(count)"
        case ..<10_000: String(format: "%.1fk", Double(count) / 1_000)
        case ..<1_000_000: "\(Int((Double(count) / 1_000).rounded()))k"
        default: String(format: "%.1fM", Double(count) / 1_000_000)
        }
    }
    public static func dollars(_ usd: Double) -> String {
        usd < 0.01 && usd > 0 ? "<$0.01" : String(format: "$%.2f", usd)
    }
    /// "$1.42 est." or "$1.42"; plan users get "Included in your ChatGPT plan".
    public static func cost(_ summary: CostSummary, plan: String = "your ChatGPT plan") -> String {
        if summary.isIncludedInPlan { return "Included in \(plan)" }
        return dollars(summary.usd) + (summary.isEstimated ? " est." : "")
    }
    /// A short span: "45s", "3 min", "1 h 12 min".
    public static func span(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds))
        if s < 60 { return "\(s)s" }
        if s < 3_600 { return "\(s / 60) min" }
        return "\(s / 3_600) h \((s % 3_600) / 60) min"
    }
}

/// Reads whether Codex is on a ChatGPT plan or an API key from its auth file.
public enum CodexBilling {
    public static func detect(authData: Data?, environmentKey: String? = nil) -> Billing {
        if let key = environmentKey, !key.isEmpty { return .metered }
        guard let authData, let object = (try? JSONSerialization.jsonObject(with: authData)) as? [String: Any] else { return .includedInPlan }
        let mode = (object["auth_mode"] as? String)?.lowercased() ?? ""
        if mode.contains("api") { return .metered }
        if let key = object["OPENAI_API_KEY"] as? String, !key.isEmpty, mode.isEmpty { return .metered }
        return .includedInPlan
    }
    public static func detect(home: URL = FileManager.default.homeDirectoryForCurrentUser, environment: [String: String] = ProcessInfo.processInfo.environment) -> Billing {
        let base = environment["CODEX_HOME"].map { URL(fileURLWithPath: $0) } ?? home.appendingPathComponent(".codex")
        return detect(authData: try? Data(contentsOf: base.appendingPathComponent("auth.json")), environmentKey: environment["OPENAI_API_KEY"])
    }
    /// Where Codex writes a thread's rollout (live token counters): `sessions/YYYY/MM/DD/rollout-<time>-<thread>.jsonl`.
    public static func rolloutFile(thread: String, near date: Date = Date(), home: URL = FileManager.default.homeDirectoryForCurrentUser,
                                   environment: [String: String] = ProcessInfo.processInfo.environment) -> URL? {
        let base = (environment["CODEX_HOME"].map { URL(fileURLWithPath: $0) } ?? home.appendingPathComponent(".codex")).appendingPathComponent("sessions")
        let calendar = Calendar.current
        for offset in 0...2 {
            guard let day = calendar.date(byAdding: .day, value: -offset, to: date) else { continue }
            let c = calendar.dateComponents([.year, .month, .day], from: day)
            let folder = base.appendingPathComponent(String(format: "%04d/%02d/%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0))
            if let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path), let hit = names.first(where: { $0.hasSuffix("\(thread).jsonl") }) {
                return folder.appendingPathComponent(hit)
            }
        }
        return nil
    }
}
