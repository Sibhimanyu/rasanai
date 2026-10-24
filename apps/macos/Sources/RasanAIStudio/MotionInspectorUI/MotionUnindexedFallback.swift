import StudioCore
import SwiftUI

/// The plain frame-and-region state: the index is missing or stale, or the area is raster footage.
/// It never blocks a note: the person can always write one, and `onNote` hands the text to the ordinary note flow.
struct MotionUnindexedFallback: View {
    static let honestText = "No editable element here; Rasan will use this frame and region"

    let reason: MotionFallbackReason
    let time: Double
    var region: MotionNormRect?
    var onNote: (String) -> Void

    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(Self.honestText, systemImage: "scope").font(.system(size: 12, weight: .semibold))
            Text(detail).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Text("Frame at \(String(format: "%.1f", time)) s" + (region.map { String(format: ", region %.0f%% across, %.0f%% down", $0.x * 100, $0.y * 100) } ?? ""))
                .font(.system(size: 11)).foregroundStyle(Color.turmeric)
            TextField("Tell Rasan what to change", text: $text, axis: .vertical)
                .lineLimit(2...5).textFieldStyle(.plain).focused($focused)
                .padding(8).background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(0.06)))
                .accessibilityLabel("Note for Rasan")
                .onSubmit(send)
            Button(action: send) { Text("Send note").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(.rasanFill)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityHint("Sends this frame and region with your words")
        }
        .padding(12)
        .frame(maxWidth: 300, alignment: .leading)
        .environment(\.colorScheme, .dark)
    }

    private var detail: String {
        switch reason {
        case .noIndex: "This film has no element map yet, so Rasan reads the picture."
        case .stale: "The element map is out of date after a rebuild, so Rasan reads the picture."
        case .raster: "This area is footage or a flattened image."
        case .noElement: "Nothing editable sits under that spot."
        }
    }

    private func send() {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        onNote(t); text = ""
    }
}
