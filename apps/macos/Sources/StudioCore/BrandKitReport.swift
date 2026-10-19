import Foundation

/// What a kit compile left in a brand folder: `assets/compile.json` (Claude's summary and questions), the files the
/// inventory could not use (`assets/kit-inventory.json`) and `assets/KIT.md` (the guidelines' rules in plain words).
/// Everything is optional and decoded loosely: the files are written by a model and an engine that may change.
public struct BrandKitReport: Equatable, Sendable {
    public struct Unusable: Equatable, Sendable, Identifiable {
        public var id: String { path }
        public var path: String
        public var why: String
    }
    public var summary: String?
    public var partial = false
    public var needsFromUser: [String] = []
    public var unsure: [String] = []
    public var unusable: [Unusable] = []
    /// KIT.md, when present.
    public var rules: String?

    public init() {}
    public var isEmpty: Bool { summary == nil && needsFromUser.isEmpty && unsure.isEmpty && unusable.isEmpty && rules == nil }

    public static func load(_ folder: URL) -> BrandKitReport {
        var report = BrandKitReport()
        let assets = BrandAssets.assetsDir(folder)
        func json(_ name: String) -> [String: Any]? {
            (try? Data(contentsOf: assets.appendingPathComponent(name))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        }
        /// Lines may be plain strings or small objects ({token, why}); either reads as one sentence.
        func lines(_ value: Any?) -> [String] {
            guard let list = value as? [Any] else { return [] }
            return list.compactMap { item in
                if let s = item as? String { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
                if let d = item as? [String: Any] {
                    return d.keys.sorted().compactMap { d[$0] as? String }.joined(separator: ": ")
                }
                return nil
            }.filter { !$0.isEmpty }
        }
        if let compile = json("compile.json") {
            report.summary = (compile["summary"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            report.partial = (compile["status"] as? String) == "partial"
            report.needsFromUser = lines(compile["needs_from_user"])
            report.unsure = lines(compile["unsure"])
        }
        if let inventory = json("kit-inventory.json"), let files = inventory["files"] as? [[String: Any]] {
            report.unusable = files.compactMap { f in
                guard (f["as"] as? String) == "unusable", let path = f["path"] as? String else { return nil }
                return Unusable(path: path, why: (f["why"] as? String) ?? "")
            }
        }
        report.rules = (try? String(contentsOf: assets.appendingPathComponent("KIT.md"), encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        return report
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
