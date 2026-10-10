import AppKit
import StudioCore

/// A fixture Get inspired catalog for the offscreen snapshots: real-looking rows (names, techniques and creators follow the
/// public manifest) with generated stills on disk. Nothing here touches the network.
@MainActor
enum MomentFixtures {
    private static let rows: [(id: String, role: MomentRole, name: String, label: String, mechanic: [String], handle: String, creator: String, seconds: Double, isNew: Bool, hues: (Double, Double))] = [
        ("M975", .hook, "Headline about redefining asset management scrambles into code and collapses into a giant AI", "Scramble", ["kinetic_type", "glyph_scramble", "hard_cut"], "@OBiNStudio", "OBiN Studio", 5.6, true, (0.74, 0.82)),
        ("M921", .hook, "Opening claim and brand credentials", "Opening claim", ["text_morph", "stagger", "typewriter"], "@fomo", "fomo", 4.1, false, (0.08, 0.02)),
        ("M925", .hook, "Files organize themselves and hand off to the next scene", "Files sort", ["layout_motion", "stagger", "line_drawing"], "@thednyx", "dnyxstudios", 3.5, false, (0.35, 0.45)),
        ("M913", .proof, "Agent completes its checklist and reveals the editor", "Checklist", ["ui_transition", "stagger", "camera_push"], "@OpusClip", "OpusClip", 5.5, true, (0.58, 0.66)),
        ("M914", .proof, "Capability statement to a typed request", "Typed request", ["text_morph", "stagger", "camera_push"], "@OpusClip", "OpusClip", 4.7, false, (0.62, 0.7)),
        ("M931", .proof, "Counter ticks up while three product cards deal in", "Counter", ["counter", "stagger", "layout_motion"], "@shapelayer", "Shapelayer", 6.2, true, (0.14, 0.08)),
        ("M916", .turn, "Turn on the product mode and meet the agent", "Meet the agent", ["ui_transition", "camera_push", "mask_reveal"], "@arcads_ai", "arcads AI", 4.8, false, (0.78, 0.9)),
        ("M926", .turn, "A question transforms into the product answer", "Question to answer", ["mask_reveal", "layout_motion", "stagger"], "@thednyx", "dnyxstudios", 4.3, false, (0.5, 0.58)),
        ("M920", .cta, "Closing offer and agent sign-off", "Sign-off", ["typewriter", "text_morph", "stagger"], "@arcads_ai", "arcads AI", 5.4, false, (0.02, 0.1)),
        ("M929", .cta, "Closing claim resolves into a symbol and wordmark", "Wordmark", ["mask_reveal", "stagger", "text_morph"], "@thednyx", "dnyxstudios", 5.4, false, (0.66, 0.74)),
        ("M1014", .cta, "Fives multiply into 'Global Fortune 5 Million' and resolve on the storefront logo", "Fives", ["kinetic_type", "counter", "hard_cut"], "@az_andrian", "Andrian", 4.6, true, (0.3, 0.4)),
        ("M944", .proof, "Cursor clicks through a feature list and each row lights up", "Feature list", ["cursor_click", "stagger", "ui_transition"], "@buffetdesigns", "Buffet Designs", 5.0, false, (0.9, 0.96)),
    ]

    static let all: [Moment] = {
        let folder = SnapshotHarness.sandbox.appendingPathComponent("moments", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return rows.map { row in
            let still = folder.appendingPathComponent("\(row.id).png")
            if let data = StageFixtures.labelledPNG(row.label, hueA: row.hues.0, hueB: row.hues.1, size: CGSize(width: 640, height: 360)) { try? data.write(to: still) }
            let post = URL(string: "https://x.com/\(row.handle.dropFirst())/status/1")
            return Moment(id: row.id, name: row.name, role: row.role, mechanic: row.mechanic, swapSlot: ["text"], why: "Fixture moment.", duration: row.seconds,
                          clipURL: URL(string: "https://example.invalid/\(row.id)/clip.mp4")!, stillURL: still,
                          creator: MomentCreator(handle: row.handle, name: row.creator, url: post), isNew: row.isNew)
        }
    }()

    static func install(in gallery: MomentGallery) {
        gallery.moments = all
        gallery.state = .ready
    }
}
