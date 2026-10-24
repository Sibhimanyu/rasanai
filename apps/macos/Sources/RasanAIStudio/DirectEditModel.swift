import Foundation
import SwiftUI
import StudioCore

/// Hybrid contract C6 client: builds typed direct-edit ops and queues them through the existing `RunTransport`
/// as a `motion-edit` action (same envelope as `MotionEditEnvelope`, but the `edit` object may carry the new C6 operations).
struct DirectEditClient: Sendable {
    /// Queues one `edit` object. Returns the queued action id, or throws.
    var send: @Sendable (JSONValue) async throws -> String

    static func transport(_ transport: RunTransport, step: String = MotionEditEnvelope.defaultStep) -> DirectEditClient {
        DirectEditClient { edit in
            let value = JSONValue.object(["kind": .string(MotionEditEnvelope.kind), "edit": edit])
            let note = edit.object["instruction"]?.string ?? ""
            return try await Task.detached { try transport.append(step: step, type: MotionEditEnvelope.type, value: value, note: note).id }.value
        }
    }
}

/// One element's property value shown in the inspector. `nil` original means "not exposed by the element index".
struct DirectPropertyReader: Sendable {
    var read: @Sendable (_ elementID: String, _ field: String) -> JSONValue?
    static let none = DirectPropertyReader { _, _ in nil }
}

@MainActor
final class DirectEditModel: ObservableObject {
    /// Off unless `RASANAI_HYBRID_DIRECT_EDIT=1`.
    nonisolated static var isEnabled: Bool { ProcessInfo.processInfo.environment["RASANAI_HYBRID_DIRECT_EDIT"] == "1" }

    enum Gesture: Equatable { case none, move, resize(EditHandle), rotate }
    enum Banner: Equatable { case none, info(String), conflict(String), failure(String) }

    // Inputs the lead keeps current
    @Published var index: MotionElementIndex?
    @Published var time: Double = 0
    var propertyReader: DirectPropertyReader = .none
    private let client: DirectEditClient?

    // Selection and draft
    @Published private(set) var selectedID: String?
    @Published private(set) var draft: EditBox?              // live, ephemeral until commit
    @Published private(set) var gesture: Gesture = .none
    @Published private(set) var guides: (x: [Double], y: [Double]) = ([], [])
    @Published private(set) var banner: Banner = .none
    @Published private(set) var history = DirectEditHistory()
    @Published private(set) var opStates: [String: MotionEditState] = [:]
    /// Committed boxes shown until the next index rebuild reports the new bounds.
    @Published private(set) var committed: [String: EditBox] = [:]
    private var rotations: [String: Double] = [:]
    private var gestureStart: EditBox?
    private var editedVersion: (film: Int?, digest: String?) = (nil, nil)
    private var knownIDs: Set<String> = []
    private var nudgeTask: Task<Void, Never>?
    private var nudgeBase: EditBox?

    init(index: MotionElementIndex? = nil, client: DirectEditClient?) {
        self.index = index; self.client = client
    }

    // MARK: Derived

    var filmSize: CGSize {
        guard let f = index?.frameSize, f.w > 0, f.h > 0 else { return CGSize(width: 1920, height: 1080) }
        return CGSize(width: f.w, height: f.h)
    }
    var selectedItem: MotionElementItem? { selectedID.flatMap { index?.item(id: $0) } }
    var canEditTransform: Bool {
        guard let i = selectedItem else { return false }
        return (i.canEdit("position") || i.canEdit("transform")) && i.capability == "dom"
    }
    var canUndo: Bool { history.canUndo && client != nil }
    var canRedo: Bool { history.canRedo && client != nil }

    func box(for item: MotionElementItem) -> EditBox? {
        if item.elementId == selectedID, let d = draft { return d }
        if let c = committed[item.elementId] { return c }
        guard let r = index?.normalisedBounds(of: item, at: time) else { return nil }
        return EditBox(rect: r, rotation: rotations[item.elementId] ?? 0)
    }

    /// Elements that can be picked now: active, with bounds, DOM-backed (never a flattened raster layer).
    var pickable: [(item: MotionElementItem, box: EditBox)] {
        (index?.allItems ?? []).compactMap { i in
            guard i.isActive(at: time), i.capability != "raster", let b = box(for: i) else { return nil }
            return (i, b)
        }
    }

    // MARK: Selection

    func select(_ id: String?) {
        flushNudge()
        selectedID = id; draft = nil; gesture = .none; guides = ([], [])
        if let id, let item = index?.item(id: id), let b = box(for: item) { draft = b }
        editedVersion = (index?.filmVersion, index?.buildDigest)
        if id != nil, banner != .none, case .conflict = banner {} else if id == nil { banner = .none }
    }

    /// Picks at a film-normalised point (cycling through overlaps when clicking the already-selected spot).
    @discardableResult
    func pick(at p: CGPoint, cycle: Bool = false) -> String? {
        let cands = pickable.map { (id: $0.item.elementId, box: $0.box, z: $0.item.z ?? 0) }
        let id = EditGeometry.pick(at: p, filmSize: filmSize, candidates: cands, current: selectedID, cycle: cycle)
        select(id)
        return id
    }

    // MARK: Gestures (ephemeral until commit)

    func begin(_ g: Gesture) {
        guard let d = draft, canEditTransform else { return }
        flushNudge()
        gesture = g; gestureStart = d
        editedVersion = (index?.filmVersion, index?.buildDigest)
    }

    func drag(to pointer: CGPoint, start: CGPoint, shift: Bool, option: Bool) {
        guard let s = gestureStart else { return }
        switch gesture {
        case .none: return
        case .move:
            let moved = EditGeometry.move(s, dx: Double(pointer.x - start.x), dy: Double(pointer.y - start.y))
            let snapped = shift ? (moved, [], []) : EditGeometry.snapToGuides(moved)
            draft = snapped.0; guides = (snapped.1, snapped.2)
        case .resize(let h):
            draft = EditGeometry.resize(s, handle: h, pointer: pointer, filmSize: filmSize, keepAspect: shift, fromCenter: option)
        case .rotate:
            draft = EditGeometry.rotation(of: s, pointer: pointer, filmSize: filmSize, snap: shift ? 15 : nil)
        }
    }

    func end() async {
        defer { gesture = .none; gestureStart = nil; guides = ([], []) }
        guard let s = gestureStart, let d = draft, !d.isClose(to: s) else { return }
        await commitTransform(from: s, to: d)
    }

    func cancelGesture() {
        if let s = gestureStart { draft = s }
        gesture = .none; gestureStart = nil; guides = ([], [])
    }

    /// Keyboard nudge: draft moves now, one op is queued after the keys go quiet.
    func nudge(dxPixels: Double, dyPixels: Double, large: Bool) {
        guard canEditTransform, let d = draft else { return }
        if nudgeBase == nil { nudgeBase = d; editedVersion = (index?.filmVersion, index?.buildDigest) }
        draft = EditGeometry.nudge(d, dxPixels: dxPixels, dyPixels: dyPixels, filmSize: filmSize, large: large)
        nudgeTask?.cancel()
        nudgeTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 450_000_000)
            guard !Task.isCancelled else { return }
            await self?.commitNudge()
        }
    }
    private func flushNudge() {
        guard nudgeBase != nil else { nudgeTask?.cancel(); return }
        nudgeTask?.cancel()
        Task { await self.commitNudge() }
    }
    private func commitNudge() async {
        guard let base = nudgeBase, let d = draft else { nudgeBase = nil; return }
        nudgeBase = nil
        if !d.isClose(to: base) { await commitTransform(from: base, to: d) }
    }

    // MARK: Index refresh, stale handling

    /// Call when `motion/element-index.json` reloads. Rebases or rejects an in-flight draft, and drops optimistic boxes once bounds are re-measured.
    func refresh(index new: MotionElementIndex) {
        let digestChanged = new.buildDigest != index?.buildDigest || new.filmVersion != index?.filmVersion
        let old = index
        index = new
        if digestChanged { committed.removeAll() }
        guard digestChanged, let id = selectedID else { return }
        guard let item = old?.item(id: id) ?? new.item(id: id), let start = gestureStart ?? nudgeBase else {
            if new.item(id: id) == nil { select(nil); banner = .conflict("The selected element is gone after the film rebuilt. Pick it again.") }
            else if let item = new.item(id: id), let b = box(for: item) { draft = b }
            return
        }
        switch DirectVersion.check(editing: item, original: start, editedVersion: editedVersion, latest: new, time: time) {
        case .current: break
        case .rebasable:
            editedVersion = (new.filmVersion, new.buildDigest)
            banner = .info("The film changed while you were editing; your change was kept.")
        case .conflict(let why):
            cancelGesture(); nudgeTask?.cancel(); nudgeBase = nil
            draft = new.item(id: id).flatMap { box(for: $0) }
            banner = .conflict(why + " Your unsaved change was dropped.")
        }
    }

    /// Call when the director reports `{ok:false, conflict:true, current}` for an op (it appended nothing).
    func reportConflict(opID: String, current: MotionElementIndex?) {
        opStates[opID] = .failed
        if let cur = current { index = cur; committed.removeAll() }
        banner = .conflict("The film changed under that edit. It was not applied; review the new version and try again.")
        if let id = selectedID, let item = index?.item(id: id) { draft = box(for: item) } else { select(nil) }
    }

    /// Call with the parsed `edits.jsonl` so op states (and restart persistence) follow the director.
    func observe(_ status: MotionEditStatus) {
        for l in status.lines {
            knownIDs.insert(l.id)
            if let s = l.status, opStates[l.id] != nil || l.source == "studio-direct" { opStates[l.id] = s }
        }
    }

    // MARK: Property edits

    func commitColor(_ hex: String) async {
        guard let id = selectedID, let item = selectedItem, item.canEdit("color") else { return }
        await commitProperty(item, field: "color", new: .string(hex.uppercased()), summary: "Set colour of \(item.displayLabel) to \(hex.uppercased())")
        _ = id
    }
    func commitText(_ text: String) async {
        guard let item = selectedItem, item.canEdit("text") else { return }
        await commitProperty(item, field: "text", new: .string(text), summary: "Change text of \(item.displayLabel)")
    }
    func commitTiming(start: Double, end: Double) async {
        guard let item = selectedItem, item.canEdit("timing"), end > start else { return }
        await commitProperty(item, field: "active_s", new: .array([.number(start), .number(end)]), summary: "Retime \(item.displayLabel) to \(String(format: "%.2f", start))s-\(String(format: "%.2f", end))s")
    }

    private func commitProperty(_ item: MotionElementItem, field: String, new: JSONValue, summary: String) async {
        let orig = field == "active_s" ? item.activeS.map { JSONValue.array($0.map(JSONValue.number)) } : propertyReader.read(item.elementId, field)
        var original: [String: JSONValue] = [:]
        if let orig { original[field] = orig }
        let entry = DirectEditEntry(id: "", elementID: item.elementId, operation: "property", original: original, proposed: [field: new], summary: summary)
        await dispatch(entry, item: item, revertOf: nil)
    }

    // MARK: Transform commit

    private func commitTransform(from a: EditBox, to b: EditBox) async {
        guard let item = selectedItem else { return }
        if let idx = index, case .conflict(let why) = DirectVersion.check(editing: item, original: a, editedVersion: editedVersion, latest: idx, time: time) {
            draft = a; banner = .conflict(why); return
        }
        let entry = DirectEditEntry(id: "", elementID: item.elementId, operation: "transform", original: Self.values(a), proposed: Self.values(b),
                                    summary: "Transform \(item.displayLabel)")
        committed[item.elementId] = b; rotations[item.elementId] = b.rotation
        if await dispatch(entry, item: item, revertOf: nil) == false { committed[item.elementId] = nil; rotations[item.elementId] = a.rotation; draft = a }
    }

    static func values(_ b: EditBox) -> [String: JSONValue] {
        ["center_x_norm": .number(b.cx), "center_y_norm": .number(b.cy), "width_norm": .number(b.w), "height_norm": .number(b.h), "rotation_deg": .number(b.rotation)]
    }
    static func box(from v: [String: JSONValue], fallback: EditBox) -> EditBox {
        EditBox(cx: v["center_x_norm"]?.number ?? fallback.cx, cy: v["center_y_norm"]?.number ?? fallback.cy,
                w: v["width_norm"]?.number ?? fallback.w, h: v["height_norm"]?.number ?? fallback.h, rotation: v["rotation_deg"]?.number ?? fallback.rotation)
    }

    // MARK: Undo / redo (each is a NEW op id; redo after undo is never a re-used id)

    func undo() async {
        guard let e = history.popUndo(), let item = index?.item(id: e.elementID) else { banner = .conflict("That element is no longer in the film; undo skipped."); return }
        let rev = DirectEditEntry(id: "", elementID: e.elementID, operation: e.operation, original: e.proposed, proposed: e.original, summary: "Undo: " + e.summary)
        if await dispatch(rev, item: item, revertOf: e.id, record: false) == false { history.restoreUndo(e) }
        else if e.operation == "transform" { let b = Self.box(from: e.original, fallback: draft ?? EditBox(cx: 0.5, cy: 0.5, w: 0.1, h: 0.1)); committed[e.elementID] = b; rotations[e.elementID] = b.rotation; if selectedID == e.elementID { draft = b } }
    }
    func redo() async {
        guard let e = history.popRedo(), let item = index?.item(id: e.elementID) else { banner = .conflict("That element is no longer in the film; redo skipped."); return }
        let again = DirectEditEntry(id: "", elementID: e.elementID, operation: e.operation, original: e.original, proposed: e.proposed, summary: e.summary)
        if await dispatch(again, item: item, revertOf: nil, record: false) == false { history.restoreRedo(e) }
        else if e.operation == "transform" { let b = Self.box(from: e.proposed, fallback: draft ?? EditBox(cx: 0.5, cy: 0.5, w: 0.1, h: 0.1)); committed[e.elementID] = b; rotations[e.elementID] = b.rotation; if selectedID == e.elementID { draft = b } }
    }

    // MARK: Sending

    @discardableResult
    private func dispatch(_ entry: DirectEditEntry, item: MotionElementItem, revertOf: String?, record: Bool = true) async -> Bool {
        guard let client else { banner = .failure("Not connected to a run; nothing was sent."); return false }
        let id = MotionEditRequest.nextID(after: Array(knownIDs))
        knownIDs.insert(id)
        let edit = Self.editJSON(id: id, entry: entry, item: item, index: index, time: time, revertOf: revertOf)
        do {
            _ = try await client.send(edit)
            opStates[id] = .requested
            var e = entry; e.id = id
            if record { history.record(e) }   // undo/redo already moved their entry between the stacks
            if case .failure = banner { banner = .none }
            return true
        } catch {
            banner = .failure((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
            return false
        }
    }

    /// The C6 `edit` object. Pure and testable: only the fields the contract names.
    static func editJSON(id: String, entry: DirectEditEntry, item: MotionElementItem, index: MotionElementIndex?, time: Double, revertOf: String?) -> JSONValue {
        var o: [String: JSONValue] = [
            "schema_version": .number(Double(MotionSchema.supportedVersion)),
            "id": .string(id),
            "operation": .string(entry.operation),
            "element_id": .string(item.elementId),
            "time_s": .number(time),
            "original": .object(entry.original),
            "proposed": .object(entry.proposed),
            "instruction": .string(String(entry.summary.prefix(300))),
            "source": .string("studio-direct"),
            "status": .string("requested")
        ]
        if let s = item.sceneId { o["scene_id"] = .string(s) }
        if let v = index?.filmVersion { o["film_version"] = .number(Double(v)) }
        if let d = index?.buildDigest { o["build_digest"] = .string(d) }
        if let r = revertOf { o["fields"] = .object(["revert_of": .string(r)]) }
        return .object(o)
    }

    func dismissBanner() { banner = .none }
}
