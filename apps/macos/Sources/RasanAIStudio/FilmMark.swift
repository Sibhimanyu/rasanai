import AppKit
import AVFoundation
import StudioCore
import SwiftUI

// MARK: - Marks on the picture
//
// A mark is where the person pointed on the film: a spot, a box, a circled area, or the whole frame, at a moment. It rides
// into the chat with Rasan as an attachment on the composer (`FilmSessionModel.pendingMark`) and goes out as the existing
// timed "comment" action when the message is sent.

extension Color {
    static let markAmber = Color(red: 1, green: 0.78, blue: 0.28)
}

enum MarkKind: String {
    case point, rect, lasso, frame

    var label: String {
        switch self {
        case .point: "spot"
        case .rect: "area"
        case .lasso: "circled"
        case .frame: "frame"
        }
    }
}

struct FilmMark: Identifiable, Equatable {
    let id = UUID()
    var step: String
    var time: Double
    var kind: MarkKind
    /// Normalised 0...1 to the displayed picture (zero-sized for a spot).
    var rect: CGRect
    /// Normalised outline of a circled area, smoothed and closed.
    var path: [CGPoint]?
    /// A small grab of the frame (or the scene's thumbnail on the storyboard).
    var snapshot: NSImage?

    static func == (lhs: FilmMark, rhs: FilmMark) -> Bool { lhs.id == rhs.id && lhs.snapshot === rhs.snapshot }

    var caption: String { reviewTime(time, tenths: true) + " · " + kind.label }
    var center: CGPoint { CGPoint(x: rect.midX, y: rect.midY) }

    static func wholeFrame(step: String, time: Double) -> FilmMark {
        FilmMark(step: step, time: time, kind: .frame, rect: CGRect(x: 0, y: 0, width: 1, height: 1), path: nil, snapshot: nil)
    }
}

// MARK: Gesture to mark

enum MarkGesture {
    /// A freehand stroke in view coordinates -> a spot (no real drag), a circled area (the stroke closes on itself: its end is
    /// within 12% of its bounding-box diagonal of its start) or a box from the start to the end of the drag.
    static func classify(_ points: [CGPoint], in content: CGRect) -> (kind: MarkKind, rect: CGRect, path: [CGPoint]?) {
        guard let first = points.first, let last = points.last, content.width > 0, content.height > 0 else {
            return (.point, CGRect(x: 0.5, y: 0.5, width: 0, height: 0), nil)
        }
        func norm(_ p: CGPoint) -> CGPoint {
            CGPoint(x: min(1, max(0, (p.x - content.minX) / content.width)), y: min(1, max(0, (p.y - content.minY) / content.height)))
        }
        let xs = points.map(\.x), ys = points.map(\.y)
        let diagonal = hypot((xs.max() ?? 0) - (xs.min() ?? 0), (ys.max() ?? 0) - (ys.min() ?? 0))
        if diagonal < 6 {
            let p = norm(first)
            return (.point, CGRect(x: p.x, y: p.y, width: 0, height: 0), nil)
        }
        if hypot(last.x - first.x, last.y - first.y) <= 0.12 * diagonal, points.count >= 6 {
            let outline = smoothed(points).map(norm)
            let nx = outline.map(\.x), ny = outline.map(\.y)
            let box = CGRect(x: nx.min() ?? 0, y: ny.min() ?? 0, width: (nx.max() ?? 0) - (nx.min() ?? 0), height: (ny.max() ?? 0) - (ny.min() ?? 0))
            return (.lasso, box, outline)
        }
        // A box start -> end, at least 14 points each way so a straight drag still marks something.
        var box = CGRect(x: min(first.x, last.x), y: min(first.y, last.y), width: abs(last.x - first.x), height: abs(last.y - first.y))
        if box.width < 14 { box = box.insetBy(dx: (box.width - 14) / 2, dy: 0) }
        if box.height < 14 { box = box.insetBy(dx: 0, dy: (box.height - 14) / 2) }
        let a = norm(CGPoint(x: box.minX, y: box.minY)), b = norm(CGPoint(x: box.maxX, y: box.maxY))
        return (.rect, CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y), nil)
    }

    /// Thin the stroke, then round it with two passes of closed Chaikin corner cutting.
    static func smoothed(_ points: [CGPoint]) -> [CGPoint] {
        var thinned: [CGPoint] = []
        for p in points {
            if let l = thinned.last, hypot(p.x - l.x, p.y - l.y) < 4 { continue }
            thinned.append(p)
        }
        guard thinned.count >= 3 else { return thinned }
        var ring = thinned
        for _ in 0..<2 {
            var next: [CGPoint] = []
            for i in 0..<ring.count {
                let a = ring[i], b = ring[(i + 1) % ring.count]
                next.append(CGPoint(x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y))
                next.append(CGPoint(x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y))
            }
            ring = next
        }
        return ring
    }
}

// MARK: Drawing

/// A mark drawn in amber over whatever frame it fills (normalised to its own size): a ring, a box, an outline with a faint fill.
struct MarkGlyph: View {
    let kind: MarkKind
    let rect: CGRect
    var path: [CGPoint]?
    var line: CGFloat = 2
    var ring: CGFloat = 16

    var body: some View {
        GeometryReader { box in
            let w = box.size.width, h = box.size.height
            ZStack {
                switch kind {
                case .point:
                    Circle().strokeBorder(Color.markAmber, lineWidth: line).frame(width: ring, height: ring)
                        .shadow(color: .black.opacity(0.5), radius: 2)
                        .position(x: rect.midX * w, y: rect.midY * h)
                case .rect:
                    let frame = CGRect(x: rect.minX * w, y: rect.minY * h, width: rect.width * w, height: rect.height * h)
                    RoundedRectangle(cornerRadius: 3, style: .continuous).fill(Color.markAmber.opacity(0.14))
                        .overlay { RoundedRectangle(cornerRadius: 3, style: .continuous).strokeBorder(Color.markAmber, lineWidth: line) }
                        .shadow(color: .black.opacity(0.4), radius: 2)
                        .frame(width: frame.width, height: frame.height)
                        .position(x: frame.midX, y: frame.midY)
                case .lasso:
                    let outline = Path { p in
                        guard let first = path?.first else { return }
                        p.move(to: CGPoint(x: first.x * w, y: first.y * h))
                        for point in path?.dropFirst() ?? [] { p.addLine(to: CGPoint(x: point.x * w, y: point.y * h)) }
                        p.closeSubpath()
                    }
                    outline.fill(Color.markAmber.opacity(0.14))
                    outline.stroke(Color.markAmber, style: StrokeStyle(lineWidth: line, lineCap: .round, lineJoin: .round))
                        .shadow(color: .black.opacity(0.4), radius: 2)
                case .frame:
                    Rectangle().strokeBorder(Color.markAmber.opacity(0.75), lineWidth: line)
                }
            }
            .frame(width: w, height: h)
        }
        .allowsHitTesting(false)
    }
}

/// A small frame with the mark drawn on it: the composer's attachment and the chip on a note in the chat.
struct MarkThumb: View {
    var image: NSImage?
    var payloadPath: String?
    var kind: MarkKind?
    var rect: CGRect = .zero
    var path: [CGPoint]?
    var size = CGSize(width: 64, height: 36)

    var body: some View {
        ZStack {
            Workspace.raised
            if let image { Image(nsImage: image).resizable().aspectRatio(contentMode: .fill) }
            else if let payloadPath { PayloadImage(path: payloadPath, contentMode: .fill, maxPixels: 300) }
            else { Image(systemName: "film").font(.system(size: 11)).foregroundStyle(.tertiary) }
            if let kind { MarkGlyph(kind: kind, rect: rect, path: path, line: 1.2, ring: 8) }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
    }
}

// MARK: Frame grab

enum FrameGrabber {
    /// A small grab of the player's film at `time`, or nil when there is no film in it.
    @MainActor
    static func image(from player: AVPlayer?, at time: Double) async -> NSImage? {
        guard let asset = player?.currentItem?.asset else { return nil }
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 480, height: 480)
        let slack = CMTime(seconds: 0.05, preferredTimescale: 600)
        generator.requestedTimeToleranceBefore = slack
        generator.requestedTimeToleranceAfter = slack
        guard let result = try? await generator.image(at: CMTime(seconds: max(0, time), preferredTimescale: 600)) else { return nil }
        return NSImage(cgImage: result.image, size: .zero)
    }
}

// MARK: Model

extension FilmSessionModel {
    /// "step|time×100|text": how a sent note finds the mark it went out with (the wire note carries only the centre).
    static func markKey(step: String, time: Double, text: String) -> String {
        "\(step)|\(Int((time * 100).rounded()))|\(text.trimmingCharacters(in: .whitespacesAndNewlines))"
    }

    func mark(for note: ReviewNote) -> FilmMark? { sentMarks[Self.markKey(step: note.step, time: note.time, text: note.text)] }

    /// Attaches a mark to the chat composer, opens the chat on its step, and fills in the frame grab when it is ready.
    func attach(_ mark: FilmMark, player: AVPlayer?, thumbnail: URL?) {
        pendingMark = mark
        beginTell(step: mark.step)
        let id = mark.id, time = mark.time
        Task { @MainActor in
            var image = await FrameGrabber.image(from: player, at: time)
            if image == nil, let thumbnail { image = NSImage(contentsOf: thumbnail) }
            if pendingMark?.id == id { pendingMark?.snapshot = image }
        }
    }

    func clearMark() { pendingMark = nil }

    /// Sends the pending mark with the person's words as the timed note (the same "comment" action the note popover sent), then clears it.
    func sendPendingMark(text: String) async -> Bool {
        guard let mark = pendingMark else { return false }
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return false }
        let scenes = snapshot.scenes(for: ReviewStage.consoleStep(mark.step))
        let scene = FilmTiming.sceneIndex(at: mark.time, in: scenes).map { scenes[$0] }
        var value: [String: JSONValue] = ["t": .number((mark.time * 100).rounded() / 100), "scope": .string(scene != nil ? "scene" : "film")]
        if let scene { value["scene"] = scene.originalID }
        if mark.kind != .frame {
            value["x"] = .number((Double(mark.center.x) * 1000).rounded() / 1000)
            value["y"] = .number((Double(mark.center.y) * 1000).rounded() / 1000)
        }
        value["quick"] = .null
        let sent = await send(step: mark.step, type: "comment", value: .object(value), note: text)
        if sent {
            sentMarks[Self.markKey(step: mark.step, time: mark.time, text: text)] = mark
            if pendingMark?.id == mark.id { pendingMark = nil }
        }
        return sent
    }

    /// A note's chip was clicked: jump the player there and light up its pin for a moment.
    func jump(to note: ReviewNote) {
        requestSeek(note.time)
        focusedNoteID = note.id
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.5))
            if focusedNoteID == note.id { focusedNoteID = nil }
        }
    }

    /// A pin or chip asks the chat to scroll to a note.
    func openChat(at note: ReviewNote) {
        scrollToNoteID = note.id
        jump(to: note)
        beginTell(step: note.step)
    }
}

/// A 16:9 frame at the full width of its container with the mark drawn on it: the grabbed frame, else the scene's thumbnail,
/// else a neutral placeholder (never a broken-image icon).
struct MarkFrame: View {
    var image: NSImage?
    var payloadPath: String?
    var kind: MarkKind?
    var rect: CGRect = .zero
    var path: [CGPoint]?

    var body: some View {
        Color.clear.aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay {
                ZStack {
                    Workspace.raised
                    if let image { Image(nsImage: image).resizable().aspectRatio(contentMode: .fill) }
                    else if let payloadPath { PayloadImage(path: payloadPath, contentMode: .fill, maxPixels: 600) }
                    else { Image(systemName: "film").font(.system(size: 16)).foregroundStyle(.tertiary) }
                    if let kind { MarkGlyph(kind: kind, rect: rect, path: path, line: 1.5, ring: 14) }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
    }
}
