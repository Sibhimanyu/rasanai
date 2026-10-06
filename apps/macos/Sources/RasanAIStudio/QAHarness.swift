#if DEBUG
import AppKit
import StudioCore

/// Debug-only live QA bot (`--attach-run <dir> --qa-dir <dir>`). It lets a script drive the real window when no
/// one can click (a locked screen): drop `<qa-dir>/req/NN.json` and the app answers with `<qa-dir>/out/NN.json`.
///   {"shot": "name"}                     renders the real window to <qa-dir>/shots/name.png (offscreen, works locked)
///   {"size": [w, h], "dark": true}       resizes the window and sets the appearance
///   {"send": {"step","type","value","note"}}  sends through the model exactly like a tapped button (and is logged)
/// Not compiled into release builds.
@MainActor enum QAHarness {
    static func start(store: StudioStore, dir: URL) {
        for sub in ["req", "out", "shots"] { try? FileManager.default.createDirectory(at: dir.appendingPathComponent(sub), withIntermediateDirectories: true) }
        Task { @MainActor in
            var done = Set<String>()
            while true {
                try? await Task.sleep(for: .milliseconds(250))
                let files = ((try? FileManager.default.contentsOfDirectory(atPath: dir.appendingPathComponent("req").path)) ?? []).sorted()
                for name in files where name.hasSuffix(".json") && !done.contains(name) {
                    done.insert(name)
                    let data = (try? Data(contentsOf: dir.appendingPathComponent("req/\(name)"))) ?? Data()
                    let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
                    var result: [String: Any] = ["ok": true]
                    if let size = object["size"] as? [Double], size.count == 2, let window = mainWindow() {
                        window.setContentSize(NSSize(width: size[0], height: size[1]))
                    }
                    if let dark = object["dark"] as? Bool, let window = mainWindow() {
                        window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua); NSApp.appearance = window.appearance
                    }
                    if let send = object["send"] as? [String: Any], let model = store.film {
                        let value = (try? JSONSerialization.data(withJSONObject: send["value"] ?? NSNull(), options: [.fragmentsAllowed]))
                            .flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) } ?? .null
                        let accepted = await model.send(step: send["step"] as? String ?? "", type: send["type"] as? String ?? "", value: value, note: send["note"] as? String ?? "")
                        result["sent"] = accepted
                    } else if object["send"] != nil { result["ok"] = false; result["error"] = "no film model" }
                    if let ui = object["ui"] as? String, let model = store.film {
                        model.decisionsPresented = ui == "decisions"
                        if ui == "tell" { model.beginTell() } else { model.tellPresented = false }
                    }
                    if object["dump"] != nil, let root = mainWindow()?.contentView {
                        var rows: [String] = []
                        @MainActor func walk(_ v: NSView) {
                            if let sv = v as? NSScrollView { rows.append("scroll frame=\(sv.frame) docOrigin=\(sv.contentView.bounds.origin) insets=\(sv.contentInsets) docH=\(sv.documentView?.frame.height ?? 0)") }
                            v.subviews.forEach(walk)
                        }
                        walk(root); result["scrolls"] = rows
                    }
                    if let shot = object["shot"] as? String {
                        try? await Task.sleep(for: .milliseconds(900))
                        result["shot"] = capture(to: dir.appendingPathComponent("shots/\(shot).png"))
                    }
                    if let model = store.film {
                        result["currentStep"] = model.currentStep; result["route"] = "\(model.route)"; result["connected"] = model.isConnected
                    }
                    try? JSONSerialization.data(withJSONObject: result).write(to: dir.appendingPathComponent("out/\(name)"))
                }
            }
        }
    }

    static func mainWindow() -> NSWindow? { NSApp.windows.first { $0.contentView != nil && $0.isVisible && $0.frame.width > 400 && $0.title != "" || ($0.contentView != nil && $0.frame.width > 700) } }

    static func capture(to url: URL) -> Bool {
        guard let window = mainWindow(), let frame = window.contentView?.superview else { return false }
        window.contentView?.layoutSubtreeIfNeeded()
        guard let rep = frame.bitmapImageRepForCachingDisplay(in: frame.bounds) else { return false }
        frame.cacheDisplay(in: frame.bounds, to: rep)
        return (try? rep.representation(using: .png, properties: [:])?.write(to: url)) != nil
    }
}
#endif
