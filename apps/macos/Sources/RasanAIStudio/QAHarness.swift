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
                    if let replay = object["replay"] as? [String: Any] {
                        ProgressReplay.current?.control(seek: replay["seek"] as? String, speed: replay["speed"] as? Double, paused: replay["paused"] as? Bool)
                    }
                    if let ui = object["ui"] as? String, let model = store.film {
                        model.decisionsPresented = ui == "decisions"
                        if ui == "tell" { model.beginTell() } else { model.tellPresented = false }
                    }
                    if let key = object["key"] as? String { result["key"] = post(key: key, mods: object["mods"] as? [String] ?? []) }
                    if let text = object["type"] as? String { for ch in text { _ = post(key: String(ch), mods: []) }; result["typed"] = text.count }
                    if let point = object["click"] as? [Double], point.count == 2 { result["click"] = click(x: point[0], y: point[1], count: object["count"] as? Int ?? 1) }
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

    /// A real key event through the app's own event path (menu key equivalents, then the first responder), no global input.
    static func post(key: String, mods: [String]) -> Bool {
        guard let window = mainWindow() else { return false }
        let named: [String: (UInt16, String)] = ["return": (36, "\r"), "escape": (53, "\u{1b}"), "space": (49, " "), "left": (123, "\u{F702}"), "right": (124, "\u{F703}"),
                                                "up": (126, "\u{F700}"), "down": (125, "\u{F701}"), "tab": (48, "\t"), "delete": (51, "\u{7f}")]
        let codes: [Character: UInt16] = ["a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
                                          "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29, "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46]
        let (code, chars): (UInt16, String)
        if let n = named[key] { (code, chars) = n } else if let c = key.lowercased().first, let k = codes[c] { (code, chars) = (k, key) } else { (code, chars) = (0, key) }
        var flags: NSEvent.ModifierFlags = []
        for m in mods { switch m { case "cmd": flags.insert(.command); case "opt": flags.insert(.option); case "shift": flags.insert(.shift); case "ctrl": flags.insert(.control); default: break } }
        for down in [true, false] {
            guard let event = NSEvent.keyEvent(with: down ? .keyDown : .keyUp, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime,
                                               windowNumber: window.windowNumber, context: nil, characters: chars, charactersIgnoringModifiers: chars.lowercased(), isARepeat: false, keyCode: code) else { return false }
            NSApp.sendEvent(event)
        }
        return true
    }
    /// A click at (x, y) in window-content points from the top-left.
    static func click(x: Double, y: Double, count: Int) -> Bool {
        guard let window = mainWindow(), let content = window.contentView else { return false }
        let point = NSPoint(x: x, y: content.frame.height - y)
        for n in 1...max(1, count) {
            func event(_ type: NSEvent.EventType) -> NSEvent? {
                NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                   windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: n, pressure: 1)
            }
            guard let down = event(.leftMouseDown), let up = event(.leftMouseUp) else { return false }
            // AppKit controls track the mouse in a nested loop until the button comes up: queue the release first.
            NSApp.postEvent(up, atStart: false)
            window.sendEvent(down)
        }
        return true
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
