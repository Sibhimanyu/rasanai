import SwiftUI
import StudioCore

// Native tracking surface for hybrid films (Level 0 manual corners, Level 1 Apple Vision). Pure SwiftUI, no web.
// Off unless RASANAI_HYBRID_TRACKING=1 (unset = off). NOT MOUNTED anywhere yet.
//
// HOW TO MOUNT (lead): show it in a sheet or inspector once a footage asset is selected, e.g.
//     if TrackingFeature.isEnabled {
//         TrackingPanel(film: filmURL, assetURL: filmURL.appendingPathComponent("assets/phone.mp4"), assetId: "phone", trackId: "phone-screen")
//     }
// `filmURL` is the project folder; the track lands at <film>/hybrid/tracks/<trackId>.json (contract C5).

enum TrackingFeature {
    nonisolated static var isEnabled: Bool { ProcessInfo.processInfo.environment["RASANAI_HYBRID_TRACKING"] == "1" }
}

@MainActor
final class TrackingModel: ObservableObject {
    let film: URL, assetURL: URL, assetId: String, trackId: String
    @Published var frames: TrackFrames?
    @Published var index = 0
    @Published var keyframes: [Int: TrackQuad] = [:]
    @Published var track: TrackFile?
    @Published var busy = false
    @Published var message = "Open a frame, drag the four corners onto the screen, then run Track."
    @Published var progress = 0.0

    init(film: URL, assetURL: URL, assetId: String, trackId: String) {
        self.film = film; self.assetURL = assetURL; self.assetId = assetId; self.trackId = trackId
    }

    static let defaultQuad: TrackQuad = [TrackPoint(0.35, 0.25), TrackPoint(0.65, 0.25), TrackPoint(0.65, 0.75), TrackPoint(0.35, 0.75)]

    var count: Int { frames?.images.count ?? 0 }
    var image: CGImage? { frames.flatMap { $0.images.indices.contains(index) ? $0.images[index] : nil } }

    /// The quad shown for this frame: a keyframe, else the tracked quad, else a default to start from.
    var quad: TrackQuad {
        if let k = keyframes[index] { return k }
        if let f = track?.frames.first(where: { abs($0.t_s - (frames?.times[safe: index] ?? -1)) < 1e-4 }) { return f.quad }
        return keyframes.keys.sorted().last.flatMap { keyframes[$0] } ?? Self.defaultQuad
    }

    func load() async {
        busy = true; defer { busy = false }
        do {
            let url = assetURL
            frames = try await TrackVideoReader.read(url: url)
            index = 0
            message = "\(count) frames. Place the corners (TL, TR, BR, BL) on the screen."
        } catch { message = error.localizedDescription }
    }

    func setCorner(_ k: Int, to p: TrackPoint) {
        var q = quad
        q[k] = TrackPoint(min(1, max(0, p.x)), min(1, max(0, p.y)))
        keyframes[index] = q
    }

    func clearKeyframe() { keyframes[index] = nil }

    var keyframeList: [QuadKeyframe] {
        guard let f = frames else { return [] }
        return keyframes.keys.sorted().map { QuadKeyframe(t_s: f.times[$0], quad: keyframes[$0]!) }
    }

    func runLevel0() {
        guard let f = frames else { return }
        do {
            guard QuadMath.isConvexWound(quad) else { message = "The corners must be a convex quad in TL, TR, BR, BL order."; return }
            let (url, t) = try TrackingService.level0(film: film, assetURL: assetURL, assetId: assetId, id: trackId, keyframes: keyframeList, times: f.times)
            track = t; message = "Manual track saved: \(url.lastPathComponent)"
        } catch { message = error.localizedDescription }
    }

    func runLevel1() async {
        guard let f = frames, !keyframes.isEmpty else { message = TrackError.noKeyframes.localizedDescription; return }
        busy = true; progress = 0; message = "Tracking on this Mac (Apple Vision)…"
        let (film, url, aid, id, kfs, total) = (film, assetURL, assetId, trackId, keyframeList, f.times.count)
        let box = f
        let result: Result<TrackFile, Error> = await Task.detached(priority: .userInitiated) {
            do { return .success(try TrackingService.level1(film: film, assetURL: url, assetId: aid, id: id, keyframes: kfs, frames: box).1) }
            catch { return .failure(error) }
        }.value
        busy = false; progress = 1
        switch result {
        case .success(let t):
            track = t
            let low = t.frames.filter { $0.confidence < 0.5 }.count
            message = t.status == .tracked ? "Tracked \(total) frames." : "Tracked with \(low) low-confidence frames (red). Correct them, then run Track again."
        case .failure(let e): message = "Tracking did not finish: \(e.localizedDescription). Level 0 manual keyframes still work."
        }
    }
}

private extension Array { subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil } }

struct TrackingPanel: View {
    @StateObject private var model: TrackingModel
    init(film: URL, assetURL: URL, assetId: String, trackId: String) {
        _model = StateObject(wrappedValue: TrackingModel(film: film, assetURL: assetURL, assetId: assetId, trackId: trackId))
    }

    var body: some View {
        if !TrackingFeature.isEnabled { EmptyView() } else {
            VStack(alignment: .leading, spacing: 10) {
                TrackingQuadCanvas(model: model)
                    .frame(minHeight: 260)
                    .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
                if model.count > 1 {
                    Slider(value: Binding(get: { Double(model.index) }, set: { model.index = Int($0.rounded()) }), in: 0...Double(model.count - 1))
                    TrackingConfidenceStrip(track: model.track, times: model.frames?.times ?? [], keyframes: Set(model.keyframes.keys), current: model.index)
                        .frame(height: 10)
                }
                HStack {
                    Button("Clear corners here") { model.clearKeyframe() }.disabled(model.keyframes[model.index] == nil)
                    Spacer()
                    Button("Level 0: save manual track") { model.runLevel0() }.disabled(model.keyframes.isEmpty || model.busy)
                    Button("Level 1: Track") { Task { await model.runLevel1() } }
                        .buttonStyle(.borderedProminent).disabled(model.keyframes.isEmpty || model.busy)
                }
                HStack(spacing: 6) {
                    if model.busy { ProgressView().controlSize(.small) }
                    Text(model.message).font(.callout).foregroundStyle(.secondary)
                }
            }
            .padding(12)
            .task { if model.frames == nil { await model.load() } }
        }
    }
}

/// Frame image with four draggable corners. Coordinates are normalised to the image (display orientation), origin top-left.
struct TrackingQuadCanvas: View {
    @ObservedObject var model: TrackingModel
    var body: some View {
        GeometryReader { geo in
            let fit = imageRect(in: geo.size)
            ZStack(alignment: .topLeading) {
                if let img = model.image {
                    Image(decorative: img, scale: 1).resizable().frame(width: fit.width, height: fit.height).offset(x: fit.minX, y: fit.minY)
                }
                let q = model.quad
                Path { p in
                    p.move(to: pt(q[0], fit))
                    for k in 1..<4 { p.addLine(to: pt(q[k], fit)) }
                    p.closeSubpath()
                }
                .stroke(model.keyframes[model.index] != nil ? Color.yellow : Color.cyan, lineWidth: 2)
                ForEach(0..<4, id: \.self) { k in
                    Circle().fill(Color.white).overlay(Circle().stroke(Color.black, lineWidth: 1))
                        .overlay(Text(["TL", "TR", "BR", "BL"][k]).font(.system(size: 8, weight: .bold)).foregroundStyle(.black))
                        .frame(width: 20, height: 20)
                        .position(pt(q[k], fit))
                        .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("trackCanvas")).onChanged { v in
                            model.setCorner(k, to: TrackPoint((v.location.x - fit.minX) / fit.width, (v.location.y - fit.minY) / fit.height))
                        })
                }
            }
            .coordinateSpace(name: "trackCanvas")
        }
    }
    private func imageRect(in size: CGSize) -> CGRect {
        guard let img = model.image, img.width > 0, img.height > 0 else { return CGRect(origin: .zero, size: size) }
        let s = min(size.width / CGFloat(img.width), size.height / CGFloat(img.height))
        let w = CGFloat(img.width) * s, h = CGFloat(img.height) * s
        return CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h)
    }
    private func pt(_ p: TrackPoint, _ r: CGRect) -> CGPoint { CGPoint(x: r.minX + p.x * r.width, y: r.minY + p.y * r.height) }
}

/// Scrub strip: one cell per frame, red under confidence 0.5, grey with no track, a marker on keyframes and the current frame.
struct TrackingConfidenceStrip: View {
    let track: TrackFile?, times: [Double], keyframes: Set<Int>, current: Int
    var body: some View {
        Canvas { ctx, size in
            guard !times.isEmpty else { return }
            let w = size.width / CGFloat(times.count)
            let byTime = Dictionary(uniqueKeysWithValues: (track?.frames ?? []).map { (Int(($0.t_s * 1000).rounded()), $0.confidence) })
            for i in times.indices {
                let c = byTime[Int((times[i] * 1000).rounded())]
                let color: Color = c == nil ? .gray.opacity(0.4) : (c! < 0.5 ? .red : .green.opacity(0.7))
                ctx.fill(Path(CGRect(x: CGFloat(i) * w, y: 0, width: max(1, w), height: size.height)), with: .color(color))
                if keyframes.contains(i) { ctx.fill(Path(CGRect(x: CGFloat(i) * w, y: 0, width: max(2, w), height: size.height)), with: .color(.yellow)) }
            }
            ctx.fill(Path(CGRect(x: CGFloat(current) * w, y: 0, width: 2, height: size.height)), with: .color(.white))
        }
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}
