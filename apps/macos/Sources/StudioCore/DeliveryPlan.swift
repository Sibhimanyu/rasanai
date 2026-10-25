import Foundation

/// Plan 12 D7: the delivery summary the Final area shows, read from `<run>/delivery/plan.json` (written by `delivery.mjs plan --write`).
/// Additive and lenient like `Contracts.swift`: snake_case on disk, every field optional, unknown keys ignored, a missing file means "nothing to show".
/// Studio only READS this file; it never runs `delivery.mjs`, never saves export choices on its own and never claims a destination or an editor works.
public struct DeliveryPlan: Decodable, Sendable, Equatable {
    public struct Target: Decodable, Sendable, Equatable {
        public var id: String?
        public var label: String?
        public var version: Int?
        public var kind: String?
        public var aspect: String?
        public var width: Int?
        public var height: Int?
        public var state: String?
        public var warnings: [String]
        public var source: String?
        public var verifiedAt: String?
        enum CodingKeys: String, CodingKey { case id, label, version, kind, aspect, width, height, state, warnings, source, verifiedAt = "verified_at" }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try? c.decodeIfPresent(String.self, forKey: .id); label = try? c.decodeIfPresent(String.self, forKey: .label)
            version = try? c.decodeIfPresent(Int.self, forKey: .version); kind = try? c.decodeIfPresent(String.self, forKey: .kind)
            aspect = try? c.decodeIfPresent(String.self, forKey: .aspect); width = try? c.decodeIfPresent(Int.self, forKey: .width)
            height = try? c.decodeIfPresent(Int.self, forKey: .height); state = try? c.decodeIfPresent(String.self, forKey: .state)
            warnings = (try? c.decodeIfPresent([String].self, forKey: .warnings)) ?? []
            source = try? c.decodeIfPresent(String.self, forKey: .source); verifiedAt = try? c.decodeIfPresent(String.self, forKey: .verifiedAt)
        }
        /// Plain words for the state; an unverified or outdated record is never shown as a platform approval.
        public var stateTitle: String {
            switch state {
            case "verified": "Requirements checked against a recorded source"
            case "house": "Your own preference"
            case "outdated": "Requirements may be out of date"
            default: "Requirements not verified"
            }
        }
    }
    public struct Migration: Decodable, Sendable, Equatable {
        public var offer: Bool
        public var summary: String?
        public var staleStages: [String]
        enum CodingKeys: String, CodingKey { case offer, summary, staleStages = "stale_stages" }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            offer = (try? c.decodeIfPresent(Bool.self, forKey: .offer)) ?? false
            summary = try? c.decodeIfPresent(String.self, forKey: .summary)
            staleStages = (try? c.decodeIfPresent([String].self, forKey: .staleStages)) ?? []
        }
    }
    public struct Variant: Decodable, Sendable, Equatable, Identifiable {
        public var id: String
        public var locale: String?
        public var status: String?
        public var approval: String?
        public var needs: [String]
        enum CodingKeys: String, CodingKey { case id, locale, status, approval, needs }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? "variant"
            locale = try? c.decodeIfPresent(String.self, forKey: .locale); status = try? c.decodeIfPresent(String.self, forKey: .status)
            approval = try? c.decodeIfPresent(String.self, forKey: .approval)
            needs = (try? c.decodeIfPresent([String].self, forKey: .needs)) ?? []
        }
        public var statusTitle: String {
            switch status {
            case "blocked_on_approval": "Waiting for the story approval"
            case "planned": "Planned"
            default: status?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Planned"
            }
        }
    }
    public struct RequiredFile: Decodable, Sendable, Equatable, Identifiable {
        public var id: String
        public var why: String?
        public var status: String?
        enum CodingKeys: String, CodingKey { case id, why, status }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? "file"
            why = try? c.decodeIfPresent(String.self, forKey: .why); status = try? c.decodeIfPresent(String.self, forKey: .status)
        }
        public var title: String { id.replacingOccurrences(of: "_", with: " ").capitalized }
        public var statusTitle: String {
            switch status {
            case "present": "Ready"
            case "not_generated": "Not made yet"
            case "needs_render_or_review": "Needs a render or a review"
            case "not_implemented": "Not available yet"
            default: "Unknown"
            }
        }
        public var isReady: Bool { status == "present" }
    }
    public struct Capability: Decodable, Sendable, Equatable, Identifiable {
        public var id: String
        public var label: String?
        public var state: String?
        public var reason: String?
        public var verification: String?
        enum CodingKeys: String, CodingKey { case id, label, state, reason, verification }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? "capability"
            label = try? c.decodeIfPresent(String.self, forKey: .label); state = try? c.decodeIfPresent(String.self, forKey: .state)
            reason = try? c.decodeIfPresent(String.self, forKey: .reason); verification = try? c.decodeIfPresent(String.self, forKey: .verification)
        }
        /// Only a row whose every gate is open is offered; an unverified one says so, an unavailable one says why.
        public var isOffered: Bool { state == "ready" || state == "experimental" }
    }
    public struct Render: Decodable, Sendable, Equatable {
        public var delivered: Bool
        public var frames: Int?
        public var revisionStage: String?
        public var note: String?
        enum CodingKeys: String, CodingKey { case delivered, revisionStage = "revision_stage", note }
        enum DeliveredKeys: String, CodingKey { case frames }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            if let nested = try? c.nestedContainer(keyedBy: DeliveredKeys.self, forKey: .delivered) { delivered = true; frames = try? nested.decodeIfPresent(Int.self, forKey: .frames) }
            else { delivered = false; frames = nil }
            revisionStage = try? c.decodeIfPresent(String.self, forKey: .revisionStage); note = try? c.decodeIfPresent(String.self, forKey: .note)
        }
    }
    public struct Folder: Decodable, Sendable, Equatable, Identifiable {
        public var role: String
        public var folder: String
        public var id: String { role }
        enum CodingKeys: String, CodingKey { case role, folder }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            role = (try? c.decodeIfPresent(String.self, forKey: .role)) ?? ""; folder = (try? c.decodeIfPresent(String.self, forKey: .folder)) ?? ""
        }
    }

    public var status: String?
    public var target: Target?
    public var migration: Migration?
    public var variants: [Variant]
    public var render: Render?
    public var requiredFiles: [RequiredFile]
    public var packageContents: [Folder]
    public var capabilities: [Capability]
    public var notes: [String]
    enum CodingKeys: String, CodingKey {
        case status, target, migration, variants, render, capabilities, notes
        case requiredFiles = "required_files", packageContents = "package_contents"
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        status = try? c.decodeIfPresent(String.self, forKey: .status)
        target = try? c.decodeIfPresent(Target.self, forKey: .target)
        migration = try? c.decodeIfPresent(Migration.self, forKey: .migration)
        variants = (try? c.decodeIfPresent([Variant].self, forKey: .variants)) ?? []
        render = try? c.decodeIfPresent(Render.self, forKey: .render)
        requiredFiles = (try? c.decodeIfPresent([RequiredFile].self, forKey: .requiredFiles)) ?? []
        packageContents = (try? c.decodeIfPresent([Folder].self, forKey: .packageContents)) ?? []
        capabilities = (try? c.decodeIfPresent([Capability].self, forKey: .capabilities)) ?? []
        notes = (try? c.decodeIfPresent([String].self, forKey: .notes)) ?? []
    }

    /// The plan for a run, or nil when none was written (old films and runs that never planned a delivery read as before).
    public static func read(run: URL?) -> DeliveryPlan? {
        guard let run, let data = try? Data(contentsOf: run.appendingPathComponent("delivery").appendingPathComponent("plan.json")) else { return nil }
        return try? JSONDecoder().decode(DeliveryPlan.self, from: data)
    }
    public var isEmpty: Bool { target == nil && variants.isEmpty && requiredFiles.isEmpty && capabilities.isEmpty }
}
