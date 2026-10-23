import AppKit

/// Off unless `defaults write com.rasanai.studio StudioDebugSnapshots -bool true`: then a distributed notification
/// `com.rasanai.studio.snapshot` (object = an output folder) writes each visible window as a PNG, drawn by the app itself,
/// so layout can be checked without screen-recording permission and without taking focus.
enum DebugSnapshot {
    @MainActor static func install() {
        guard UserDefaults.standard.bool(forKey: "StudioDebugSnapshots") else { return }
        DistributedNotificationCenter.default().addObserver(forName: Notification.Name("com.rasanai.studio.snapshot"), object: nil, queue: .main) { note in
            let folder = (note.object as? String) ?? NSTemporaryDirectory()
            MainActor.assumeIsolated { write(to: URL(fileURLWithPath: folder)) }
        }
    }

    @MainActor private static func write(to folder: URL) {
        for (index, window) in NSApp.windows.enumerated() where window.isVisible {
            guard let view = window.contentView?.superview ?? window.contentView,
                  let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { continue }
            view.cacheDisplay(in: view.bounds, to: rep)
            if let data = rep.representation(using: .png, properties: [:]) {
                try? data.write(to: folder.appendingPathComponent("window-\(index).png"))
            }
        }
    }
}
