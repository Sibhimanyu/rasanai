import SwiftUI

/// Soft glass: a heavy blur on a mostly opaque base, with only a faint colour wash and a glare sheen. It never shows a
/// readable (or blob-like) image of what lies behind it, unlike the system's Liquid Glass, which lenses its surroundings.
struct SoftGlassFill<S: InsettableShape>: View {
    let shape: S
    var opacity: Double = 0.86
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let dark = scheme == .dark
        shape
            .fill(Color.appBackground.opacity(opacity))
            .background(.ultraThickMaterial, in: shape)
            .overlay {
                // The colour absorbed from the surroundings: a whisper of brand colour, brightest at the top-left like a glare.
                shape.fill(LinearGradient(
                    colors: [Color.rasan.opacity(dark ? 0.12 : 0.08), Color.rasan.opacity(dark ? 0.03 : 0.02), .clear],
                    startPoint: .topLeading, endPoint: .bottomTrailing))
            }
            .overlay {
                shape.strokeBorder(LinearGradient(
                    colors: [Color.white.opacity(dark ? 0.22 : 0.55), Color.white.opacity(dark ? 0.05 : 0.12)],
                    startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
            }
    }
}

extension View {
    /// Soft glass behind this view, in the given shape.
    func softGlass(in shape: some InsettableShape, opacity: Double = 0.86) -> some View {
        background { SoftGlassFill(shape: shape, opacity: opacity) }
    }
}
