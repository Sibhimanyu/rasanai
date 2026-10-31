import AppKit
import Observation
import SwiftUI

/// An elapsed-time clock independent of scene focus and SwiftUI's animation schedule. Its view task owns cancellation.
@MainActor @Observable
final class HomeMeshClock {
    private(set) var elapsed: Double = 0
    private(set) var viewportSize: CGSize = .zero

    func setViewportSize(_ size: CGSize) {
        guard viewportSize != size else { return }
        viewportSize = size
    }

    func run() async {
        let start = ContinuousClock.now
        let initial = elapsed
        while !Task.isCancelled {
            let duration = start.duration(to: .now).components
            elapsed = initial + Double(duration.seconds) + Double(duration.attoseconds) / 1e18
            do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
        }
    }
}

/// A low-contrast native interpretation of the flowing mesh reference. Only this decorative layer redraws on its clock.
struct HomeMeshWash: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(HomeMeshClock.self) private var clock

    var body: some View {
        HomeMeshField(phase: clock.elapsed / 5, opacity: colorScheme == .dark ? 0.14 : 0.12)
            .allowsHitTesting(false).accessibilityHidden(true)
    }

}

/// The renderable field is separate from its clock so visible color motion can be checked offscreen.
struct HomeMeshField: View {
    let phase: Double
    var opacity: Double = 0.14

    private static let blue = Color(red: 0.20, green: 0.39, blue: 0.95)
    private static let lilac = Color(red: 0.65, green: 0.35, blue: 0.95)
    private static let teal = Color(red: 0.12, green: 0.65, blue: 0.72)

    var body: some View {
        Group {
            if #available(macOS 15, *) {
                MeshGradient(width: 4, height: 4, points: Self.points(at: phase), colors: Self.colors(at: phase))
            } else {
                GeometryReader { geo in
                    let centers = Self.centers(at: phase)
                    ZStack {
                        RadialGradient(colors: [Self.blue, .clear], center: UnitPoint(x: centers[0].x, y: centers[0].y),
                                       startRadius: 0, endRadius: max(geo.size.width, geo.size.height) * 0.8)
                        RadialGradient(colors: [Self.lilac, .clear], center: UnitPoint(x: centers[1].x, y: centers[1].y),
                                       startRadius: 0, endRadius: max(geo.size.width, geo.size.height) * 0.65)
                        RadialGradient(colors: [Self.teal, .clear], center: UnitPoint(x: centers[2].x, y: centers[2].y),
                                       startRadius: 0, endRadius: max(geo.size.width, geo.size.height) * 0.7)
                    }
                }
            }
        }
        .opacity(opacity)
        .mask {
            LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.3),
                                   .init(color: .black, location: 0.85), .init(color: .clear, location: 1)],
                           startPoint: .top, endPoint: .bottom)
        }
    }

    /// The colors travel across the whole field, including its exposed edges. Moving interior geometry alone left the
    /// visible margins almost static, especially with the middle covered by the prompt.
    private static func centers(at t: Double) -> [SIMD2<Double>] {
        [SIMD2(0.5 + 0.48 * cos(t * 0.8), 0.55 + 0.4 * sin(t * 0.75)),
         SIMD2(0.5 + 0.46 * sin(t * 0.7 + 1.4), 0.55 + 0.4 * cos(t * 0.85 + 1)),
         SIMD2(0.5 + 0.48 * cos(t * 0.65 + 3), 0.55 + 0.4 * sin(t * 0.9 + 2.2))]
    }

    private static func colors(at t: Double) -> [Color] {
        let centers = centers(at: t)
        let base = SIMD3<Double>(0.04, 0.06, 0.12)
        let palette = [SIMD3<Double>(0.20, 0.39, 0.95), SIMD3<Double>(0.65, 0.35, 0.95), SIMD3<Double>(0.12, 0.65, 0.72)]
        return points(at: t).map { point in
            var rgb = base * 0.3
            var total = 0.3
            for (center, color) in zip(centers, palette) {
                let dx = Double(point.x) - center.x, dy = Double(point.y) - center.y
                let weight = exp(-(dx * dx + dy * dy) / 0.065)
                rgb += color * weight
                total += weight
            }
            rgb /= total
            return Color(red: rgb.x, green: rgb.y, blue: rgb.z)
        }
    }

    /// Border vertices stay fixed; the four interior vertices drift slowly without crossing their neighbours.
    static func points(at t: Double) -> [SIMD2<Float>] {
        [
            .init(0, 0), .init(0.33, 0), .init(0.67, 0), .init(1, 0),
            .init(0, 0.33), .init(0.33 + Float(sin(t)) * 0.12, 0.33 + Float(cos(t * 0.8)) * 0.10),
            .init(0.67 + Float(sin(t * 0.7 + 2)) * 0.10, 0.33 + Float(cos(t * 0.6 + 1)) * 0.11), .init(1, 0.33),
            .init(0, 0.67), .init(0.33 + Float(cos(t * 0.6 + 3)) * 0.11, 0.67 + Float(sin(t * 0.7)) * 0.10),
            .init(0.67 + Float(cos(t * 0.8)) * 0.10, 0.67 + Float(sin(t * 0.6 + 2)) * 0.11), .init(1, 0.67),
            .init(0, 1), .init(0.33, 1), .init(0.67, 1), .init(1, 1)
        ]
    }
}
