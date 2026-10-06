import Foundation

/// The brief handoff. A film started from Studio already has its brief (the New film box), so the run's `session.json`
/// is seeded with `steps.brief` working, the draft's fields and one activity entry. The web console then never shows
/// its "What's the video about?" intake and the director never pushes `needs_source`.
public enum BriefSeed {
    public static let activityMessage = "Reading your brief"

    public static func fields(for draft: FilmDraft) -> JSONValue {
        var fields: [String: JSONValue] = [
            "subject": .string(draft.brief.trimmingCharacters(in: .whitespacesAndNewlines)),
            "length_s": .number(Double(draft.duration)),
            "aspect": .string(draft.aspect),
        ]
        if let brand = draft.brand, !brand.isEmpty {
            fields["brand_name"] = .string(brand)
            fields["use_brand"] = .bool(true)
        }
        return .object(fields)
    }

    /// A new session for a film that has not started.
    public static func newSession(title: String, draft: FilmDraft, now: Date = Date()) -> JSONValue {
        seeded(.object(["title": .string(title), "current": .string("brief"), "steps": .object([:])]), title: title, draft: draft, now: now)!
    }

    /// `session` with the brief seeded, or `nil` when the run is already under way (a resume must not be disturbed).
    public static func seeded(_ session: JSONValue?, title: String, draft: FilmDraft, now: Date = Date()) -> JSONValue? {
        var root = session?.object ?? ["title": .string(title), "current": .string("brief"), "steps": .object([:])]
        var steps = root["steps"]?.object ?? [:]
        let anyStep = steps.values.contains { $0["status"].string != nil }
        let anyActivity = (root["activity"]?.array ?? []).contains { $0["level"].string != "sys" }
        guard !anyStep, !anyActivity,
              !draft.brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        let stamp = iso(now)
        steps["brief"] = .object(["status": .string("working"), "fields": fields(for: draft), "updated": .string(stamp)])
        root["steps"] = .object(steps)
        root["current"] = .string("brief")
        root["activity"] = .array((root["activity"]?.array ?? []) + [.object(["t": .string(stamp), "msg": .string(activityMessage), "level": .string("info")])])
        root["working"] = .object(["msg": .string(activityMessage + "…"), "t": .string(stamp)])
        root["updated"] = .string(stamp)
        return .object(root)
    }

    /// Seeds (or leaves alone) the `session.json` of a run about to start. Returns true when it wrote the brief.
    /// A missing file is created; an unreadable one is never overwritten; a run already under way is not disturbed.
    @discardableResult
    public static func seedFile(at url: URL, title: String, draft: FilmDraft?, now: Date = Date()) throws -> Bool {
        let manager = FileManager.default
        var existing: JSONValue?
        if manager.fileExists(atPath: url.path) {
            guard let data = try? Data(contentsOf: url), let value = try? JSONDecoder().decode(JSONValue.self, from: data),
                  case .object = value else { return false }
            existing = value
        }
        guard let draft, let seeded = seeded(existing, title: title, draft: draft, now: now) else {
            if existing == nil {
                try JSONEncoder().encode(JSONValue.object(["title": .string(title), "current": .string("brief"), "steps": .object([:])]))
                    .write(to: url, options: .atomic)
            }
            return false
        }
        try JSONEncoder().encode(seeded).write(to: url, options: .atomic)
        return true
    }

    private static func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
