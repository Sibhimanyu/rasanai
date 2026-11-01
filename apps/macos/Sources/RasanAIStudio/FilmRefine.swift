import Foundation
import StudioCore

/// A refine action (Redraw with more energy, More like this, Mix two, Three more stories) that the director has not answered yet.
///
/// The engine does not always mark such an action as `sent` (a `knob` never is), so the session alone cannot say that Rasan is
/// busy. Studio keeps this record from the moment the press is written to `actions.jsonl` until the director pushes something
/// new for that step (the step's payload, or one of the picture files it names, changes), reports an error, or moves on.
struct PendingRefine: Equatable {
    var message: String
    var since: Date
    var baseline: RefineFingerprint
    /// How many of the director's chat messages the step had when the press went out.
    var replies = 0
}

/// What the step shows right now: its payload without the chat/bookkeeping keys, and the modification dates of the pictures and
/// videos it names (a poster re-rendered to the same path changes only the date).
struct RefineFingerprint: Equatable {
    var payload: JSONValue
    var stamps: [String: TimeInterval]
}

extension FilmSessionModel {
    /// A refine that never gets an answer is dropped after this long, so the step can never stay locked for good.
    private static let refineTimeout: TimeInterval = 10 * 60
    private static let volatileKeys: Set<String> = ["thread", "sent", "status", "notes", "comments", "updated"]
    private static let mediaExtensions: Set<String> = ["png", "jpg", "jpeg", "webp", "heic", "gif", "mp4", "mov", "m4v"]

    /// The director's update for this step has landed since the person last refined it: the button now reads "Push further".
    func hasRefined(_ step: String) -> Bool { refineLanded.contains(step) }
    func isRefining(_ step: String) -> Bool { pendingRefine[step] != nil }
    func refineMessage(_ step: String) -> String? { pendingRefine[step]?.message }

    /// Sends a refine action and marks the step as working until the director answers. A second press while one is pending is
    /// ignored (no double sends). Returns true when this press was written.
    @discardableResult
    func refine(step: String, type: String, value: JSONValue = .null, note: String = "", message: String) async -> Bool {
        guard pendingRefine[step] == nil, !isSending else { return false }
        refineLanded.remove(step)
        if !isFixture { pendingRefine[step] = PendingRefine(message: message, since: Date(), baseline: fingerprint(step), replies: directorReplies(step)) }
        let ok = await send(step: step, type: type, value: value, note: note)
        if !ok { pendingRefine[step] = nil }
        return ok
    }

    /// Called whenever a new session snapshot is applied: end the working state of every step the director has answered.
    func settleRefines() {
        guard !pendingRefine.isEmpty else { return }
        let now = Date()
        for (step, pending) in pendingRefine {
            // A new director message on the step also ends it, even with the payload unchanged ("this is already the punchier one").
            let answered = snapshot.currentStep == step
                && (directorReplies(step) > pending.replies || fingerprint(step) != pending.baseline)
            if answered || snapshot.currentStep != step || now.timeIntervalSince(pending.since) > Self.refineTimeout {
                pendingRefine[step] = nil
                if answered { refineLanded.insert(step) }
            }
        }
    }

    private func directorReplies(_ step: String) -> Int { snapshot.thread(for: step).filter { !$0.fromUser }.count }

    func fingerprint(_ step: String) -> RefineFingerprint {
        var payload = snapshot.step(step).object
        for key in Self.volatileKeys { payload[key] = nil }
        var stamps: [String: TimeInterval] = [:]
        collectStamps(.object(payload), into: &stamps)
        return RefineFingerprint(payload: .object(payload), stamps: stamps)
    }

    private func collectStamps(_ value: JSONValue, into stamps: inout [String: TimeInterval]) {
        switch value {
        case .object(let o): for v in o.values { collectStamps(v, into: &stamps) }
        case .array(let a): for v in a { collectStamps(v, into: &stamps) }
        case .string(let s):
            guard stamps[s] == nil, Self.mediaExtensions.contains((s as NSString).pathExtension.lowercased()),
                  let url = fileURL(s) else { return }
            stamps[s] = Self.modified(url)
        default: break
        }
    }

    /// The file's modification time (0 when it is missing). Part of every image/video load key.
    static func modified(_ url: URL) -> TimeInterval {
        ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
    }

    /// Changes whenever the director pushes a new session or the file is rewritten: the key image and video loads reload on.
    /// Reading `snapshot` makes the caller's view re-evaluate when a new session arrives.
    func loadStamp(for url: URL) -> String {
        _ = snapshot.raw["updated"]
        return "\(url.path)|\(Self.modified(url))"
    }
}
