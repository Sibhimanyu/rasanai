import AppKit
import QuartzCore
import SwiftUI

/// A hidden check for scrolling: `--autoscroll-inspiration` opens Inspiration and scrolls it by itself at a steady speed
/// (about 1,400 pt/s, up and down) while counting frames the main thread missed. The summary goes to stderr and to
/// /tmp/rasan-autoscroll.log every 5 s. It does nothing unless the launch argument is given.
enum AutoScrollProbe {
    static var enabled: Bool { CommandLine.arguments.contains("--autoscroll-inspiration") }

    /// `--probe-launch`: counts the frames the main thread missed during the first 4 s after launch (the splash), the frames
    /// a SwiftUI-driven animation would have dropped. Logged like the scroll summary. Does nothing without the argument.
    @MainActor static func probeLaunchIfAsked() {
        guard CommandLine.arguments.contains("--probe-launch"), let window = NSApp.windows.first(where: { $0.canBecomeMain }) ?? NSApp.windows.first else { return }
        let sampler = LaunchSampler()
        sampler.link = window.displayLink(target: sampler, selector: #selector(LaunchSampler.tick(_:)))
        sampler.link?.add(to: .main, forMode: .common)
        launchSampler = sampler
    }
    @MainActor private static var launchSampler: LaunchSampler?

    @MainActor private final class LaunchSampler: NSObject {
        var link: CADisplayLink?
        private var times: [Double] = []
        @objc func tick(_ link: CADisplayLink) {
            times.append(link.timestamp)
            guard let first = times.first, link.timestamp - first >= 4 else { return }
            link.invalidate()
            var deltas = zip(times.dropFirst(), times).map { $0 - $1 }
            let interval = deltas.sorted()[deltas.count / 2]
            let late = deltas.filter { $0 > interval * 1.5 }
            deltas.sort(by: >)
            let line = String(format: "launch: %d frames in 4 s, interval %.1f ms, %d late (>1.5x), %d lost, worst gaps ms: %@\n", times.count, interval * 1000, late.count,
                              Int(late.reduce(0) { $0 + ($1 / interval).rounded() - 1 }), deltas.prefix(6).map { String(format: "%.0f", $0 * 1000) }.joined(separator: " "))
            FileHandle.standardError.write(Data(line.utf8))
            let path = "/tmp/rasan-autoscroll.log"
            if !FileManager.default.fileExists(atPath: path) { FileManager.default.createFile(atPath: path, contents: nil) }
            if let handle = FileHandle(forWritingAtPath: path) { handle.seekToEndOfFile(); handle.write(Data(line.utf8)); try? handle.close() }
        }
    }

    /// `--probe-onscreen`: a window restored onto a display that is no longer there is moved onto the main display, without
    /// activating the app, so a recording of it shows the real launch. Does nothing without the argument.
    @MainActor static func placeOnScreenIfAsked() {
        guard CommandLine.arguments.contains("--probe-onscreen"), let screen = NSScreen.main ?? NSScreen.screens.first else { return }
        NSApp.unhideWithoutActivation()
        for window in NSApp.windows where window.canBecomeMain {
            let frame = screen.visibleFrame
            window.setFrame(NSRect(x: frame.minX + 60, y: frame.maxY - 800 - 40, width: 1240, height: 800), display: false)
            window.level = .floating   // above other apps without taking focus
            window.orderFrontRegardless()
        }
    }
}

struct AutoScrollProbeView: NSViewRepresentable {
    func makeNSView(context: Context) -> Probe { Probe() }
    func updateNSView(_ view: Probe, context: Context) {}

    final class Probe: NSView {
        private var link: CADisplayLink?
        private var direction = 1.0
        private var last = 0.0
        private var deltas: [Double] = []
        private var windowStart = 0.0
        private weak var scrollView: NSScrollView?
        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            link?.invalidate(); link = nil
            guard AutoScrollProbe.enabled, window != nil else { return }
            // Let the grid fill in first, then start.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.start() }
        }

        private func start() {
            guard link == nil, let window, let root = window.contentView else { return }
            scrollView = Self.largestScrollView(in: root)
            let link = displayLink(target: self, selector: #selector(tick(_:)))
            link.add(to: .main, forMode: .common)
            self.link = link
            last = 0; windowStart = CACurrentMediaTime()
        }

        private static func largestScrollView(in view: NSView) -> NSScrollView? {
            var best: NSScrollView?
            func walk(_ v: NSView) {
                if let s = v as? NSScrollView, s.documentView.map({ $0.frame.height > s.contentView.bounds.height + 200 }) == true,
                   (best?.frame.size.width ?? 0) * (best?.frame.size.height ?? 0) < s.frame.width * s.frame.height { best = s }
                v.subviews.forEach(walk)
            }
            walk(view)
            return best
        }

        @objc private func tick(_ link: CADisplayLink) {
            let now = link.timestamp
            if last > 0 { deltas.append(now - last) }
            last = now
            if let scrollView, let document = scrollView.documentView {
                let clip = scrollView.contentView
                let maxY = max(0, document.frame.height - clip.bounds.height)
                var y = clip.bounds.origin.y + direction * 1400 * (link.targetTimestamp - link.timestamp)
                if y >= maxY { y = maxY; direction = -1 } else if y <= 0 { y = 0; direction = 1 }
                clip.scroll(to: NSPoint(x: 0, y: y))
                scrollView.reflectScrolledClipView(clip)
            }
            if now - windowStart >= 5 { report(); deltas.removeAll(); windowStart = now }
        }

        private func report() {
            guard !deltas.isEmpty else { return }
            let interval = deltas.sorted()[deltas.count / 2]
            let hitches = deltas.filter { $0 > interval * 1.5 }.count
            let worst = (deltas.max() ?? 0) * 1000
            let line = String(format: "autoscroll: %d frames, interval %.1f ms, %d hitched (>1.5x), worst %.0f ms, achieved %.1f fps\n",
                              deltas.count, interval * 1000, hitches, worst, Double(deltas.count) / deltas.reduce(0, +))
            FileHandle.standardError.write(Data(line.utf8))
            let path = "/tmp/rasan-autoscroll.log"
            if !FileManager.default.fileExists(atPath: path) { FileManager.default.createFile(atPath: path, contents: nil) }
            if let handle = FileHandle(forWritingAtPath: path) {
                handle.seekToEndOfFile(); handle.write(Data(line.utf8)); try? handle.close()
            }
        }
        isolated deinit { link?.invalidate() }
    }
}
