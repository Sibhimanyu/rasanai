import AppKit
import SwiftUI

/// The crew stage's art: face-less cut-outs plus `stage-faces.json`, which says where the eyes, brows, lenses, head outline
/// and work surface of each pose sit (all in the piece's own pixels). Same idea as `CrewFaces` for the Home lineup.
struct StagePose: Decodable {
    struct Lens: Decodable { let cx, cy, r: CGFloat }
    /// The head's outline at brow height (`y`, `l`, `r`) and its top: thought trails end just outside it.
    struct Head: Decodable { let y, l, r, top: CGFloat }
    let size: [CGFloat]
    let feet: [CGFloat]
    let eyes: [CrewFaces.Eye]
    let brows: [CrewFaces.Brow]
    /// Quads (TL TR BR BL): `surface` is the page, canvas or frame; `lens-N` are glasses and loupe lenses.
    let rects: [String: [[CGFloat]]]?
    /// The layer drawn above the eyes and below the brows (Kavi's glasses, Tara's eyepiece), as a resource stem.
    let overlay: String?
    /// Tara's glass circle.
    let lens: Lens?
    let head: Head

    var width: CGFloat { size.first ?? 1 }
    var height: CGFloat { size.count > 1 ? size[1] : 1 }

    /// A named quad as points, nil when the pose has no such rect.
    func quad(_ name: String) -> [CGPoint]? {
        guard let raw = rects?[name], raw.count == 4, raw.allSatisfy({ $0.count >= 2 }) else { return nil }
        return raw.map { CGPoint(x: $0[0], y: $0[1]) }
    }

    /// Every lens rect (`lens-0`, `lens-1`...) as an axis-aligned box, in name order.
    var lensBoxes: [CGRect] {
        (rects ?? [:]).keys.filter { $0.hasPrefix("lens") }.sorted().compactMap { name in
            guard let q = quad(name) else { return nil }
            return CGRect(x: q[0].x, y: q[0].y, width: q[2].x - q[0].x, height: q[2].y - q[0].y)
        }
    }
}

enum CrewStageArt {
    enum Mode: String { case work, ask }

    /// The pose map, nil when the file is missing or unreadable (the stage then draws nothing).
    @MainActor static let poses: [String: StagePose] = {
        guard let url = resource("stage-faces", "json"),
              let data = try? Data(contentsOf: url),
              let poses = try? JSONDecoder().decode([String: StagePose].self, from: data) else { return [:] }
        return poses
    }()

    /// SwiftPM's resource processing flattens the folder in a `swift build` and keeps it in Xcode builds: look in both places.
    private static func resource(_ name: String, _ ext: String) -> URL? {
        StudioResources.url("crew-stage/\(name)", ext) ?? StudioResources.url(name, ext)
    }

    @MainActor private static var images: [String: NSImage] = [:]
    @MainActor private static var missing: Set<String> = []

    /// A stage image by its file stem ("kavi-work", "kavi-work-faced", "tara-work-eyepiece"), decoded once and kept.
    @MainActor static func image(_ stem: String) -> NSImage? {
        if let hit = images[stem] { return hit }
        guard !missing.contains(stem) else { return nil }
        guard let url = resource(stem, "webp"), let image = NSImage(contentsOf: url) else {
            missing.insert(stem); return nil
        }
        images[stem] = image
        return image
    }

    @MainActor static func pose(_ character: CrewCharacter, _ mode: Mode) -> StagePose? { poses["\(character.rawValue)-\(mode.rawValue)"] }

    /// How tall each character stands on the working stage, as a share of the tallest (the web playground's tuned heights).
    static func heightShare(_ character: CrewCharacter) -> CGFloat {
        switch character {
        case .kavi, .chitra, .laya: 1
        case .tara: 400 / 430
        case .mala, .ra: 420 / 430
        case .rasika: 300 / 430
        }
    }
}
