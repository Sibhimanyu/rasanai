import AppKit
import StudioCore
import SwiftUI

/// The pictures on the answer tiles. Until the illustrations ship (each choice names one in `thumb`), an SF Symbol stands in.
enum TasteThumb {
    static func symbol(_ thumb: String?) -> String {
        switch thumb {
        case "pictures-literal": "photo"
        case "pictures-world": "mountain.2"
        case "pictures-concept": "lightbulb"
        case "speaker-fixed": "person.crop.rectangle"
        case "speaker-moving": "rectangle.lefthalf.inset.filled"
        case "speaker-cutaways": "rectangle.on.rectangle"
        case "text-none": "text.badge.xmark"
        case "text-key": "textformat"
        case "text-full": "text.justify.left"
        case "captions-off": "captions.bubble"
        case "captions-plain": "text.bubble"
        case "captions-styled": "text.bubble.fill"
        case "marks-keep": "checkmark.seal"
        case "marks-cover": "eye.slash"
        case "ending-card": "photo.on.rectangle"
        case "ending-make": "wand.and.stars"
        case "ending-none": "stop.circle"
        default: "square.grid.2x2"
        }
    }
}

/// One big answer: a picture on top, the choice and what it means under it. Clicking answers; the highlight is the keyboard's
/// (arrow keys move it, Return takes it).
struct AnswerTile: View {
    let symbol: String
    let title: String
    var detail = ""
    var selected = false
    var highlighted = false
    var badge: String?
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(selected ? Color.rasan.opacity(0.12) : Color.primary.opacity(0.05))
                    Image(systemName: symbol).font(.system(size: 34, weight: .light)).foregroundStyle(selected ? Color.rasan : Color.secondary)
                }
                .frame(height: 96)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(.primary).lineLimit(2).multilineTextAlignment(.leading)
                        if let badge { Text(badge).font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                            .padding(.horizontal, 6).padding(.vertical, 2).background(Color.primary.opacity(0.08), in: Capsule()) }
                    }
                    if !detail.isEmpty {
                        Text(detail).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(4).multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(10)
            .frame(maxWidth: .infinity, minHeight: 196, alignment: .topLeading)
            .background(selected ? Color.primary.opacity(0.08) : Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(highlighted ? Color.rasan : selected ? Color.primary.opacity(0.4) : Color(nsColor: .separatorColor), lineWidth: highlighted ? 2 : selected ? 1.2 : 0.5)
            }
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .hoverCursor(.pointingHand)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(detail)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The tiles in a grid that fills the width: three across on a wide window, fewer on a narrow one.
struct AnswerGrid<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200, maximum: 300), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) { content }
    }
}

/// A dashed well that takes a drop and a click: a clip, an end card, an edit to learn from.
struct FlowDropZone: View {
    let symbol: String
    let title: String
    var detail: String?
    var buttons: [(title: String, action: () -> Void)] = []
    var onDrop: ([URL]) -> Bool
    @State private var targeted = false

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 30, weight: .light)).foregroundStyle(targeted ? Color.rasan : Color.secondary)
            Text(title).font(.system(size: 15, weight: .semibold)).multilineTextAlignment(.center)
            if let detail { Text(detail).font(.system(size: 12.5)).foregroundStyle(.secondary).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true) }
            HStack(spacing: 8) { ForEach(buttons.indices, id: \.self) { Button(buttons[$0].title, action: buttons[$0].action) } }
        }
        .padding(26)
        .frame(maxWidth: .infinity, minHeight: 190)
        .background(targeted ? Color.rasan.opacity(0.10) : Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(targeted ? Color.rasan : Color(nsColor: .separatorColor), style: StrokeStyle(lineWidth: targeted ? 1.5 : 0.8, dash: [6, 5])) }
        .animation(.snappy(duration: 0.15), value: targeted)
        .dropDestination(for: URL.self, action: { urls, _ in onDrop(urls.filter(\.isFileURL)) }, isTargeted: { targeted = $0 })
    }
}

/// A file the person picked, with a way to take it back.
struct FlowFileChip: View {
    let url: URL
    var symbol = "doc"
    var onRemove: (() -> Void)?
    var body: some View {
        HStack(spacing: 10) {
            Image(nsImage: NSWorkspace.shared.icon(forFile: url.path)).resizable().frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 1) {
                Text(url.lastPathComponent).font(.system(size: 13, weight: .medium)).lineLimit(1).truncationMode(.middle)
                Text(url.deletingLastPathComponent().path).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.head)
            }
            Spacer(minLength: 4)
            if let onRemove {
                Button(action: onRemove) { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Remove (nothing on disk changes)").accessibilityLabel("Remove \(url.lastPathComponent)")
            }
        }
        .padding(10).background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

