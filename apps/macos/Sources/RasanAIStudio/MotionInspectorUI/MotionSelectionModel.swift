import CoreGraphics
import Foundation
import Observation
import StudioCore

// Motion Studio W10: what is under a click on the film, and the edit that follows.
// Uses the W13 types (MotionElementIndex, MotionElementResolver, MotionVideoGeometry, MotionEditRequest); nothing is copied.

extension MotionElementItem {
    /// Raster footage (or a flattened image) has no editable element: it is a frame and a region for Rasan.
    var isRasterOnly: Bool { capability == "raster" }
}

/// Why a click has no editable element behind it.
enum MotionFallbackReason: Equatable {
    case noIndex, stale, raster, noElement
}

/// What the click resolved to.
enum MotionSelectionState: Equatable {
    case none
    case candidates([MotionElementHit])
    case element(MotionElementHit)
    case fallback(MotionFallbackReason)
}

@MainActor @Observable
final class MotionSelectionModel {
    var index: MotionElementIndex?
    /// True when the index was built from different scene sources than the film on screen.
    var indexIsStale = false
    private(set) var state: MotionSelectionState = .none
    private(set) var time = 0.0
    /// The clicked point as a fraction of the film frame (nil before any click, or in a letterbox bar).
    private(set) var filmPoint: CGPoint?

    init(index: MotionElementIndex? = nil, currentDigest: String? = nil) {
        self.index = index
        self.indexIsStale = index?.isStale(currentDigest: currentDigest) ?? false
    }

    func update(index: MotionElementIndex?, currentDigest: String?) {
        self.index = index
        indexIsStale = index?.isStale(currentDigest: currentDigest) ?? false
    }

    /// Resolves a click in the player view. `fit` is how the picture sits in the view (letterbox-correct).
    func select(viewPoint: CGPoint, time: Double, viewSize: CGSize, filmSize: CGSize, fit: MotionVideoGeometry.Fit = .aspectFit) {
        self.time = time
        guard let p = MotionVideoGeometry.filmPoint(viewPoint: viewPoint, viewSize: viewSize, filmSize: filmSize, fit: fit) else {
            filmPoint = nil; state = .none; return
        }
        select(filmPoint: p, time: time)
    }

    /// Resolves a point already in film-normalised coordinates.
    func select(filmPoint p: CGPoint, time: Double) {
        self.time = time
        filmPoint = p
        state = Self.resolve(filmPoint: p, time: time, index: index, stale: indexIsStale)
    }

    func choose(_ hit: MotionElementHit) { state = .element(hit) }
    /// The person declined the candidates: send the frame and region instead.
    func useFrameAndRegion() { state = .fallback(.noElement) }
    func clear() { state = .none; filmPoint = nil }

    /// A small region around the click, for the plain frame-and-region note.
    var region: MotionNormRect? {
        guard let p = filmPoint else { return nil }
        let half = 0.1
        let x = min(max(Double(p.x) - half, 0), 1 - 2 * half), y = min(max(Double(p.y) - half, 0), 1 - 2 * half)
        return MotionNormRect(x: x, y: y, w: 2 * half, h: 2 * half)
    }

    static func resolve(filmPoint p: CGPoint, time: Double, index: MotionElementIndex?, stale: Bool) -> MotionSelectionState {
        guard let index else { return .fallback(.noIndex) }
        if stale { return .fallback(.stale) }
        let all = MotionElementResolver.candidates(at: p, time: time, in: index)
        let editable = all.filter { !$0.item.isRasterOnly }
        switch editable.count {
        case 0: return .fallback(all.isEmpty ? .noElement : .raster)
        case 1: return .element(editable[0])
        default: return .candidates(editable)
        }
    }
}

/// The quick suggestions under an element.
enum MotionQuickSuggestion: String, CaseIterable, Identifiable {
    case changeWording, tightenEntrance, moveLater, replaceMotion, keepEverythingElse
    var id: String { rawValue }

    var title: String {
        switch self {
        case .changeWording: "Change wording"
        case .tightenEntrance: "Tighten entrance"
        case .moveLater: "Move later"
        case .replaceMotion: "Replace this motion"
        case .keepEverythingElse: "Keep everything else"
        }
    }

    var instruction: String {
        switch self {
        case .changeWording: "Change the wording of this text to: "
        case .tightenEntrance: "Make this element's entrance tighter and snappier."
        case .moveLater: "Move this element's entrance a little later."
        case .replaceMotion: "Replace this element's motion with a different move."
        case .keepEverythingElse: "Keep everything else exactly as it is."
        }
    }

    var operation: MotionEditOperation? {
        switch self {
        case .changeWording, .tightenEntrance: .modify
        case .moveLater: .retime
        case .replaceMotion: .replace
        case .keepEverythingElse: nil
        }
    }

    /// Hidden when the element cannot take it.
    func isOffered(for item: MotionElementItem) -> Bool {
        switch self {
        case .changeWording: item.canEdit("text")
        case .moveLater: item.canEdit("timing")
        case .tightenEntrance, .replaceMotion: item.canEdit("motion_preset") || item.canEdit("timing")
        case .keepEverythingElse: true
        }
    }
}

/// The person's pending change to one element. `request()` turns it into a contract-D edit.
struct MotionEditDraft: Equatable {
    var elementId: String?
    var sceneId: String?
    var time: Double
    var filmVersion: Int?
    var region: MotionNormRect?
    var existingEditIDs: [String]

    var instruction = ""
    var operation: MotionEditOperation = .modify
    var text = ""
    /// Nudge as a fraction of the frame (0.02 = 2%).
    var dx = 0.0
    var dy = 0.0
    var scale = 1.0
    var colorHex: String?
    var motionPreset = ""

    init(hit: MotionElementHit, time: Double, filmVersion: Int?, existingEditIDs: [String]) {
        elementId = hit.item.elementId; sceneId = hit.item.sceneId; self.time = time; self.filmVersion = filmVersion
        region = hit.boundsNorm; self.existingEditIDs = existingEditIDs
    }

    /// The plain frame-and-region note: no element.
    init(region: MotionNormRect?, time: Double, filmVersion: Int?, existingEditIDs: [String]) {
        self.time = time; self.filmVersion = filmVersion; self.region = region; self.existingEditIDs = existingEditIDs
    }

    mutating func apply(_ suggestion: MotionQuickSuggestion) {
        if suggestion == .keepEverythingElse {
            if !instruction.contains(suggestion.instruction) {
                instruction += (instruction.isEmpty || instruction.hasSuffix(" ") ? "" : " ") + suggestion.instruction
            }
        } else {
            instruction = suggestion.instruction
        }
        if let op = suggestion.operation { operation = op }
    }

    /// Only the fields the person changed.
    var fields: [String: JSONValue] {
        var out: [String: JSONValue] = [:]
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { out["text"] = .string(t) }
        if dx != 0 || dy != 0 { out["position"] = .object(["dx": .number(dx), "dy": .number(dy)]) }
        if abs(scale - 1) > 0.001 { out["scale"] = .number(scale) }
        if let colorHex, !colorHex.isEmpty { out["color"] = .string(colorHex) }
        let p = motionPreset.trimmingCharacters(in: .whitespacesAndNewlines)
        if !p.isEmpty { out["motion_preset"] = .string(p) }
        return out
    }

    var trimmedInstruction: String { instruction.trimmingCharacters(in: .whitespacesAndNewlines) }
    var canSend: Bool { !trimmedInstruction.isEmpty || !fields.isEmpty }

    func request() -> MotionEditRequest {
        let f = fields
        return MotionEditRequest(id: MotionEditRequest.nextID(after: existingEditIDs), operation: operation, filmVersion: filmVersion,
                                 timeS: time, sceneId: sceneId, elementId: elementId, regionNorm: region,
                                 fields: f.isEmpty ? nil : f, instruction: trimmedInstruction.isEmpty ? nil : trimmedInstruction)
    }
}
