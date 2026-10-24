import Foundation
import CoreGraphics

/// Sends a Motion Studio edit to the director through the EXISTING `RunTransport.append` (one writer, shared lock).
/// The action is `step: "final"`, `type: "motion-edit"`, and its value is `{"kind":"motion-edit","edit":{...contract D...}}`.
public enum MotionEditEnvelope {
    public static let type = "motion-edit"
    public static let kind = "motion-edit"
    public static let defaultStep = "final"

    /// The `value` of the action: `{kind, edit}` with the edit object in snake_case.
    public static func value(for edit: MotionEditRequest) throws -> JSONValue {
        let data = try JSONEncoder().encode(edit)
        let payload = try JSONDecoder().decode(JSONValue.self, from: data)
        return .object(["kind": .string(kind), "edit": payload])
    }

    /// The pieces of the actions.jsonl line, before the transport adds id/ts/source.
    public static func action(_ edit: MotionEditRequest, step: String = defaultStep) throws -> (step: String, type: String, value: JSONValue, note: String) {
        (step, type, try value(for: edit), String((edit.instruction ?? "").prefix(4000)))
    }

    /// Appends the action to `actions.jsonl` under the lock via `transport.append`.
    @discardableResult
    public static func send(_ edit: MotionEditRequest, via transport: RunTransport, step: String = defaultStep, now: Date = Date()) throws -> QueuedAction {
        let a = try action(edit, step: step)
        return try transport.append(step: a.step, type: a.type, value: a.value, note: a.note, now: now)
    }
}

/// Project-relative paths that stay inside the project.
public enum MotionProjectPaths {
    /// Resolves `relative` under `root`, or throws `pathEscapes` for absolute paths, `..` parts, NULs, or a symlink that leaves `root`.
    public static func safeRelative(_ relative: String, root: URL) throws -> URL {
        guard !relative.isEmpty, !relative.hasPrefix("/"), !relative.hasPrefix("~"), !relative.contains("\0") else { throw MotionStudioError.pathEscapes(relative) }
        let parts = relative.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard !parts.contains(".."), !parts.isEmpty else { throw MotionStudioError.pathEscapes(relative) }
        let realRoot = root.resolvingSymlinksInPath().standardizedFileURL
        var url = realRoot
        for part in parts where part != "." { url.appendPathComponent(part) }
        // Resolve the deepest existing ancestor so a symlinked folder cannot lead out of root.
        var probe = url
        while !FileManager.default.fileExists(atPath: probe.path), probe.path != realRoot.path { probe.deleteLastPathComponent() }
        let resolved = probe.resolvingSymlinksInPath().standardizedFileURL.path
        let rootPath = realRoot.path.hasSuffix("/") ? realRoot.path : realRoot.path + "/"
        guard resolved == realRoot.path || (resolved + "/").hasPrefix(rootPath) else { throw MotionStudioError.pathEscapes(relative) }
        return url
    }
}

/// Maps points in a player view to film-normalised (0...1) coordinates.
public enum MotionVideoGeometry {
    public enum Fit: Sendable, Equatable { case aspectFit, aspectFill }

    /// Where the film is drawn inside the view (may extend past the view when filling).
    public static func filmRect(viewSize: CGSize, filmSize: CGSize, fit: Fit) -> CGRect? {
        guard viewSize.width > 0, viewSize.height > 0, filmSize.width > 0, filmSize.height > 0 else { return nil }
        let sx = viewSize.width / filmSize.width, sy = viewSize.height / filmSize.height
        let scale = fit == .aspectFit ? min(sx, sy) : max(sx, sy)
        let w = filmSize.width * scale, h = filmSize.height * scale
        return CGRect(x: (viewSize.width - w) / 2, y: (viewSize.height - h) / 2, width: w, height: h)
    }

    /// The film-normalised point under `viewPoint`, or nil in the letterbox/pillarbox bars (fit) or outside the view.
    public static func filmPoint(viewPoint: CGPoint, viewSize: CGSize, filmSize: CGSize, fit: Fit) -> CGPoint? {
        guard let rect = filmRect(viewSize: viewSize, filmSize: filmSize, fit: fit) else { return nil }
        let nx = (viewPoint.x - rect.minX) / rect.width, ny = (viewPoint.y - rect.minY) / rect.height
        guard nx >= 0, nx <= 1, ny >= 0, ny <= 1 else { return nil }
        return CGPoint(x: nx, y: ny)
    }

    /// The inverse: a film-normalised point back to a point in the view.
    public static func viewPoint(filmPoint: CGPoint, viewSize: CGSize, filmSize: CGSize, fit: Fit) -> CGPoint? {
        guard let rect = filmRect(viewSize: viewSize, filmSize: filmSize, fit: fit) else { return nil }
        return CGPoint(x: rect.minX + filmPoint.x * rect.width, y: rect.minY + filmPoint.y * rect.height)
    }
}

/// Finds the elements under a film-normalised point at a time.
public enum MotionElementResolver {
    /// Every active item whose bounds at `time` contain `point`, topmost first: higher `z` first, then smaller area
    /// (the more specific element), then id for a stable order. Items without bounds samples never match.
    public static func candidates(at point: CGPoint, time: Double, in index: MotionElementIndex) -> [MotionElementHit] {
        index.allItems.compactMap { item -> MotionElementHit? in
            guard item.isActive(at: time), let rect = index.normalisedBounds(of: item, at: time), rect.contains(point) else { return nil }
            return MotionElementHit(item: item, boundsNorm: rect)
        }.sorted { a, b in
            let za = a.item.z ?? 0, zb = b.item.z ?? 0
            if za != zb { return za > zb }
            if a.boundsNorm.area != b.boundsNorm.area { return a.boundsNorm.area < b.boundsNorm.area }
            return a.item.elementId < b.item.elementId
        }
    }
}
