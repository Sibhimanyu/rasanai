import StudioCore
import SwiftUI

/// A short list for when several elements sit under the click: the person picks, nothing is guessed.
/// Works as popover content (`.motionElementChooser`) or inline in the inspector column.
struct MotionElementChooser: View {
    let hits: [MotionElementHit]
    var onPick: (MotionElementHit) -> Void
    var onDismiss: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Which one?").font(.system(size: 12, weight: .semibold)).padding(.horizontal, 8).padding(.top, 4)
            Text("\(hits.count) elements are under that spot.").font(.system(size: 11)).foregroundStyle(.secondary).padding(.horizontal, 8)
            ForEach(hits) { hit in
                Button { onPick(hit) } label: { row(hit) }
                    .buttonStyle(ChooserRowStyle())
                    .accessibilityLabel("\(hit.item.displayLabel), \(MotionKindName.name(hit.item.kind)), \(sceneName(hit.item))")
                    .accessibilityHint("Edit this element")
            }
            if let onDismiss {
                Button("Use this frame and region instead", action: onDismiss)
                    .buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(.secondary).padding(8)
            }
        }
        .padding(6)
        .frame(width: 260)
        .environment(\.colorScheme, .dark)
    }

    private func row(_ hit: MotionElementHit) -> some View {
        HStack(spacing: 8) {
            Image(systemName: MotionKindName.symbol(hit.item.kind)).frame(width: 18).foregroundStyle(Color.rasan)
            VStack(alignment: .leading, spacing: 1) {
                Text(hit.item.displayLabel).font(.system(size: 12, weight: .medium)).lineLimit(1)
                Text("\(MotionKindName.name(hit.item.kind)) · \(sceneName(hit.item))").font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }

    private func sceneName(_ item: MotionElementItem) -> String { item.sceneId ?? "unknown scene" }
}

private struct ChooserRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 8).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Color.white.opacity(configuration.isPressed ? 0.12 : 0.05)))
    }
}

enum MotionKindName {
    static func name(_ kind: String?) -> String {
        switch kind {
        case "text": "Text"
        case "image": "Image"
        case "shape": "Shape"
        case "ui": "Interface"
        case "3d": "3D object"
        case "video": "Video"
        default: "Element"
        }
    }
    static func symbol(_ kind: String?) -> String {
        switch kind {
        case "text": "textformat"
        case "image": "photo"
        case "shape": "square.on.circle"
        case "ui": "rectangle.3.group"
        case "3d": "cube"
        case "video": "film"
        default: "square.dashed"
        }
    }
}

extension View {
    /// Shows the chooser as a popover while `isPresented`.
    func motionElementChooser(isPresented: Binding<Bool>, hits: [MotionElementHit], onPick: @escaping (MotionElementHit) -> Void) -> some View {
        popover(isPresented: isPresented, arrowEdge: .trailing) {
            MotionElementChooser(hits: hits, onPick: { isPresented.wrappedValue = false; onPick($0) }, onDismiss: { isPresented.wrappedValue = false })
        }
    }
}
