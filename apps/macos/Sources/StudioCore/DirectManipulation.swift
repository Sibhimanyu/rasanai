import Foundation
import CoreGraphics

// Plan 10 U4/U8: direct manipulation THROUGH the engine. Studio shows an ephemeral overlay while the person drags; nothing is written until the drag ends, and then ONE
// `motion-edit` action goes through the normal action queue carrying the revision it was made against (film version, element index build digest, element digest,
// the displayed render revision). The engine (lib/editor-patch) validates and applies it, or rejects it with {conflict, current}; on rejection Studio restores the
// committed state and explains. Nothing here writes a scene file.

// MARK: The element index as Studio reads it (motion/element-index.json, written by element-index.mjs)

public struct ElementBounds: Equatable, Sendable {
    public var t: Double, x: Double, y: Double, w: Double, h: Double
}

public struct ElementIndexItem: Equatable, Sendable, Identifiable {
    public var id: String { elementID }
    public var elementID: String
    public var sceneID: String
    public var kind: String
    public var label: String?
    /// "dom" | "projected-3d" | "raster". A raster item (footage, an image) is clip-editable only: pointing at something depicted in it proves nothing.
    public var capability: String
    public var editable: [String]
    public var activeStart: Double
    public var activeEnd: Double
    public var z: Double
    public var samples: [ElementBounds]

    public var isRaster: Bool { capability == "raster" || kind == "image" || kind == "video" }
    /// What the person may do to this element directly: raster is limited to clip-level timing; everything else to the engine's declared `editable` list.
    public var directEdits: [String] { isRaster ? editable.filter { $0 == "timing" } : editable }
}

public struct ElementIndex: Equatable, Sendable {
    public var buildDigest: String?
    public var filmVersion: String?
    public var frameSize: CGSize
    public var items: [ElementIndexItem]

    public init(buildDigest: String?, filmVersion: String?, frameSize: CGSize, items: [ElementIndexItem]) {
        self.buildDigest = buildDigest; self.filmVersion = filmVersion; self.frameSize = frameSize; self.items = items
    }

    public init?(json: JSONValue) {
        guard case .object = json, let w = json["frame_size"]["w"].number, let h = json["frame_size"]["h"].number, w > 0, h > 0 else { return nil }
        buildDigest = json["build_digest"].string
        filmVersion = json["film_version"].identifier
        frameSize = CGSize(width: w, height: h)
        items = json["items"].array.compactMap { item in
            guard let id = item["element_id"].string, !id.isEmpty else { return nil }
            let active = item["active_s"].array.compactMap(\.number)
            return ElementIndexItem(
                elementID: id, sceneID: item["scene_id"].string ?? "", kind: item["kind"].string ?? "", label: item["label"].string, capability: item["capability"].string ?? "dom",
                editable: item["editable"].strings, activeStart: active.first ?? -.infinity, activeEnd: active.count > 1 ? active[1] : .infinity, z: item["z"].number ?? 0,
                samples: item["bounds_samples"].array.compactMap { s in
                    guard let t = s["t_s"].number, let x = s["x"].number, let y = s["y"].number, let w = s["w"].number, let h = s["h"].number else { return nil }
                    return ElementBounds(t: t, x: x, y: y, w: w, h: h)
                })
        }
    }

    public static func read(project: URL) -> ElementIndex? {
        let url = project.appendingPathComponent("motion").appendingPathComponent("element-index.json")
        guard let data = try? Data(contentsOf: url), let json = try? JSONDecoder().decode(JSONValue.self, from: data) else { return nil }
        return ElementIndex(json: json)
    }

    /// Interpolated bounds at time t (clamped to the first / last sample), in frame pixels. nil with no samples (a static-only index).
    public func bounds(of item: ElementIndexItem, at t: Double) -> ElementBounds? {
        let s = item.samples
        guard let first = s.first, let last = s.last else { return nil }
        if t <= first.t { return first }
        if t >= last.t { return last }
        for i in 1..<s.count where t <= s[i].t {
            let a = s[i - 1], b = s[i]
            let k = b.t == a.t ? 0 : (t - a.t) / (b.t - a.t)
            return ElementBounds(t: t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k)
        }
        return last
    }

    /// Elements under a frame-normalised point at time t, topmost first.
    public func candidates(at t: Double, frameNorm p: CGPoint) -> [ElementIndexItem] {
        let px = p.x * frameSize.width, py = p.y * frameSize.height
        return items.filter { it in
            guard t >= it.activeStart, t <= it.activeEnd, let b = bounds(of: it, at: t), b.w > 0, b.h > 0 else { return false }
            return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h
        }.sorted { $0.z > $1.z }
    }

    public func normalisedRect(of item: ElementIndexItem, at t: Double) -> CGRect? {
        guard let b = bounds(of: item, at: t) else { return nil }
        return CGRect(x: b.x / frameSize.width, y: b.y / frameSize.height, width: b.w / frameSize.width, height: b.h / frameSize.height)
    }
}

// MARK: What the person was looking at (U8): an annotation or a drag binds to THIS render, THIS element index

public struct DisplayedRevision: Equatable, Sendable, Codable {
    /// The revision id of the render on screen (crew/revision-latest.json), nil for a film that predates revision events.
    public var renderRevisionID: String?
    /// sha256 of the displayed file (the receipt's output_checksum) when known.
    public var outputChecksum: String?
    /// ElementIndex.buildDigest at the moment the person pointed.
    public var indexBuildDigest: String?
    public var filmVersion: String?
    public init(renderRevisionID: String? = nil, outputChecksum: String? = nil, indexBuildDigest: String? = nil, filmVersion: String? = nil) {
        self.renderRevisionID = renderRevisionID; self.outputChecksum = outputChecksum; self.indexBuildDigest = indexBuildDigest; self.filmVersion = filmVersion
    }
    enum CodingKeys: String, CodingKey { case renderRevisionID = "render_revision_id", outputChecksum = "output_checksum", indexBuildDigest = "index_build_digest", filmVersion = "film_version" }
}

public enum PointerBinding: Equatable, Sendable {
    /// The element can be targeted: the index is the one that was current when the person pointed and the render is the displayed one.
    case element(ElementIndexItem)
    /// Only the region is trusted. The note is kept; it is NOT applied to an object (reselect first).
    case regionOnly(reason: String)
    /// Nothing under the pointer, or a raster item (only the clip can be edited).
    case none(reason: String)
}

public enum PointerResolver {
    /// Resolve a pointer against the index; never silently use a stale one. `current` = what is displayed NOW; `pointed` = what was displayed when the person pointed.
    public static func resolve(index: ElementIndex?, time t: Double, frameNorm p: CGPoint, pointed: DisplayedRevision, current: DisplayedRevision, currentSourceDigest: String? = nil) -> PointerBinding {
        guard let index else { return .regionOnly(reason: "There is no element index for this film, so the picture cannot be traced back to an element.") }
        if let a = pointed.renderRevisionID, let b = current.renderRevisionID, a != b { return .regionOnly(reason: "The picture changed since you pointed (a newer render is showing). Your note is kept; point at it again.") }
        if let a = pointed.outputChecksum, let b = current.outputChecksum, a != b { return .regionOnly(reason: "The file on screen is not the one you pointed at. Your note is kept; point at it again.") }
        if let a = pointed.indexBuildDigest, let b = index.buildDigest, a != b { return .regionOnly(reason: "The film's elements were re-read since you pointed. Point at it again so the right element is edited.") }
        if let src = currentSourceDigest, let b = index.buildDigest, src != b { return .regionOnly(reason: "The scenes changed after the element list was made. Rebuild it, then point again.") }
        guard let hit = index.candidates(at: t, frameNorm: p).first else { return .none(reason: "Nothing editable is under the pointer at this moment.") }
        if hit.isRaster { return .none(reason: "This is footage or a picture: you can retime the clip, but the objects in it are not separate layers.") }
        return .element(hit)
    }
}

// MARK: The edit Studio sends (contract D, `motion-edit`), built once per gesture

public struct ElementReading: Equatable, Sendable {
    public var elementID: String
    public var sceneID: String
    public var time: Double
    public var filmVersion: String?
    public var buildDigest: String?
    public var elementDigest: String?
    public var renderRevisionID: String?
    public init(elementID: String, sceneID: String, time: Double, filmVersion: String? = nil, buildDigest: String? = nil, elementDigest: String? = nil, renderRevisionID: String? = nil) {
        self.elementID = elementID; self.sceneID = sceneID; self.time = time; self.filmVersion = filmVersion; self.buildDigest = buildDigest; self.elementDigest = elementDigest; self.renderRevisionID = renderRevisionID
    }
}

public enum MotionEditBuilder {
    /// A valid engine edit id: letters, digits, dot, dash, underscore; 1...64.
    public static func newID(prefix: String = "studio", now: Date = Date(), random: UInt32 = UInt32.random(in: 0...UInt32.max)) -> String {
        "\(prefix)-\(Int(now.timeIntervalSince1970 * 1000))-\(String(random, radix: 36))"
    }

    private static func base(_ r: ElementReading, id: String, operation: String, fields: [String: JSONValue]) -> [String: JSONValue] {
        var edit: [String: JSONValue] = [
            "id": .string(id), "operation": .string(operation), "scene_id": .string(r.sceneID), "element_id": .string(r.elementID), "time_s": .number(max(0, r.time)),
            "fields": .object(fields), "source": .string("studio-final"),
        ]
        if let v = r.filmVersion { edit["film_version"] = .string(v) }
        if let v = r.buildDigest { edit["build_digest"] = .string(v) }
        if let v = r.elementDigest { edit["element_digest"] = .string(v) }
        if let v = r.renderRevisionID { edit["render_revision_id"] = .string(v) }
        return edit
    }

    /// A move: `position {dx, dy}` are FRACTIONS OF THE FRAME added to the element's current position token (engine: applySimple). Coalesced from a whole drag.
    public static func move(_ r: ElementReading, dx: Double, dy: Double, id: String = newID()) -> JSONValue {
        .object(base(r, id: id, operation: "modify", fields: ["position": .object(["dx": .number(dx), "dy": .number(dy)])]))
    }
    /// A resize: `scale` is a MULTIPLIER of the current scale.
    public static func resize(_ r: ElementReading, factor: Double, id: String = newID()) -> JSONValue {
        .object(base(r, id: id, operation: "modify", fields: ["scale": .number(factor)]))
    }
    public static func text(_ r: ElementReading, to value: String, id: String = newID()) -> JSONValue {
        .object(base(r, id: id, operation: "modify", fields: ["text": .string(value)]))
    }
    public static func color(_ r: ElementReading, to value: String, id: String = newID()) -> JSONValue {
        .object(base(r, id: id, operation: "modify", fields: ["color": .string(value)]))
    }
    /// A supported timing change (the element's own start / duration inside its scene).
    public static func timing(_ r: ElementReading, start: Double?, duration: Double?, id: String = newID()) -> JSONValue {
        var f: [String: JSONValue] = [:]
        if let start { f["start"] = .number(start) }
        if let duration { f["duration"] = .number(duration) }
        return .object(base(r, id: id, operation: "retime", fields: f))
    }
    /// An undo is a NEW record naming the edit to revert; the engine uses that edit's own recorded values and refuses (conflict) when the element moved on.
    public static func revert(of target: String, _ r: ElementReading, id: String = newID(prefix: "undo")) -> JSONValue {
        .object(base(r, id: id, operation: "transform", fields: ["kind": .string("move"), "revert_of": .string(target)]))
    }
    /// The action value Studio queues: `value: { edit: {...} }` (console.mjs motionEditHook reads value.edit).
    public static func actionValue(_ edit: JSONValue) -> JSONValue { .object(["edit": edit]) }
}

// MARK: One gesture = one transaction (no hundreds of messages)

public struct DragTransaction: Equatable, Sendable {
    public var reading: ElementReading
    public var dx: Double
    public var dy: Double
    public var editID: String
}

public struct DragCoalescer: Sendable {
    public private(set) var reading: ElementReading?
    private var start: CGPoint?
    private var latest: CGPoint?
    /// Fraction of the frame below which a drag is a click, not an edit.
    public var threshold: Double

    public init(threshold: Double = 0.004) { self.threshold = threshold }

    public var isDragging: Bool { reading != nil }
    /// The ephemeral overlay offset, as fractions of the frame. Never persisted.
    public var previewOffset: CGVector {
        guard let s = start, let l = latest else { return .zero }
        return CGVector(dx: l.x - s.x, dy: l.y - s.y)
    }

    public mutating func begin(_ reading: ElementReading, at frameNorm: CGPoint) { self.reading = reading; start = frameNorm; latest = frameNorm }
    /// Hundreds of these may arrive; only the latest matters.
    public mutating func update(to frameNorm: CGPoint) { if reading != nil { latest = frameNorm } }
    public mutating func cancel() { reading = nil; start = nil; latest = nil }
    /// The single transaction for the whole drag, or nil when the pointer barely moved. Resets the coalescer.
    public mutating func commit(id: String = MotionEditBuilder.newID()) -> DragTransaction? {
        defer { cancel() }
        guard let reading, let s = start, let l = latest else { return nil }
        let dx = Double(l.x - s.x), dy = Double(l.y - s.y)
        guard abs(dx) >= threshold || abs(dy) >= threshold else { return nil }
        return DragTransaction(reading: reading, dx: dx, dy: dy, editID: id)
    }
}

// MARK: The engine's answer (session.edit_results), shown plainly

public struct EditOutcome: Equatable, Sendable {
    public var id: String
    public var ok: Bool
    public var conflict: Bool
    public var duplicate: Bool
    public var needsReselect: Bool
    public var message: String?

    /// What to tell the person. A rejection restores the committed state (the overlay is dropped) and says why in plain words; no paths or credentials.
    public var explanation: String? {
        if ok { return duplicate ? "That edit was already applied." : nil }
        if conflict { return "The film changed since you picked this. Nothing was changed, and the picture shows the saved version. " + (needsReselect ? "Pick the element again." : "Try the edit again.") }
        return "The edit was not applied (\(ErrorRedactor.redact(message ?? "refused"))). The picture shows the saved version."
    }
    public var restoresCommittedState: Bool { !ok }

    public static func read(_ session: JSONValue) -> [EditOutcome] {
        session["edit_results"].array.compactMap { r in
            guard let id = r["id"].string else { return nil }
            return EditOutcome(id: id, ok: r["ok"].bool ?? false, conflict: r["conflict"].bool ?? false, duplicate: r["duplicate"].bool ?? false, needsReselect: r["needs_reselect"].bool ?? false, message: r["error"].string)
        }
    }
}

/// No credentials or private paths in anything the UI prints. Mirrors `redact` in lib/job-control.mjs.
public enum ErrorRedactor {
    public static func redact(_ text: String) -> String {
        var out = text
        let rules: [(String, String)] = [
            ("\\b(sk|pk|rk|ghp|gho|xox[abp]|AIza)[-_A-Za-z0-9]{12,}", "[key]"),
            ("(?i)\\b(authorization|api[-_ ]?key|token|secret|password|bearer)\\b\\s*[:=]?\\s*[\"']?[^\\s\"',;]{6,}", "$1 [hidden]"),
            ("https?://[^\\s/@]+:[^\\s/@]+@", "https://[hidden]@"),
            ("(?:/Users|/home|/private|/var/folders)[^\\s\"'`)\\]]*", "a file on this Mac"),
        ]
        for (pattern, template) in rules {
            guard let re = try? NSRegularExpression(pattern: pattern) else { continue }
            out = re.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out), withTemplate: template)
        }
        return out
    }
}
