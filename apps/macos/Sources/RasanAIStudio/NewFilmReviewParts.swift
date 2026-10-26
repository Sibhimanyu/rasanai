import StudioCore
import SwiftUI

/// The tag that says who made an answer: you, your clip, your series, your example, or RasanAI.
struct SourceTag: View {
    let source: AnswerSource
    private var tint: Color { source == .you ? Color.primary : source == .auto ? Color.secondary : Color.rasan }
    var body: some View {
        Text(source.tag).font(.system(size: 11, weight: .semibold)).foregroundStyle(tint)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(tint.opacity(source == .auto ? 0.08 : 0.13), in: Capsule())
            .fixedSize()
            .accessibilityLabel(source == .auto ? "RasanAI decides" : "Chosen by \(source.tag.lowercased())")
    }
}

/// One part of the film on the Ready page: a symbol, a title, who decided it, and the controls right inside.
struct ReviewCard<Content: View>: View {
    let title: String
    let symbol: String
    var subtitle: String?
    var source: AnswerSource?
    /// "Let RasanAI decide": nil hides it, and it is hidden while RasanAI already decides.
    var decide: (() -> Void)?
    @ViewBuilder var content: Content
    @State private var hovering = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: symbol).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.rasan)
                    .frame(width: 26, height: 26).background(Color.rasan.opacity(0.12), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 14, weight: .semibold)).accessibilityAddTraits(.isHeader)
                    if let subtitle { Text(subtitle).font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(2) }
                }
                Spacer(minLength: 8)
                if let source { SourceTag(source: source) }
                if let decide, source != .auto {
                    Button("Let RasanAI decide", action: decide).buttonStyle(.link).font(.system(size: 12)).fixedSize()
                        .accessibilityLabel("Let RasanAI decide \(title)")
                }
            }
            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Workspace.panel, in: shape)
        .overlay { shape.strokeBorder(Color.primary.opacity(hovering ? 0.16 : 0.09), lineWidth: 1) }
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.15), value: hovering)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }
}

/// A small heading inside a card, with who decided it and its own "Let RasanAI decide".
struct ReviewFieldHeader: View {
    let title: String
    var source: AnswerSource?
    var decide: (() -> Void)?
    var body: some View {
        HStack(spacing: 8) {
            Text(title).font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
            if let source { SourceTag(source: source) }
            Spacer(minLength: 8)
            if let decide, source != .auto {
                Button("Let RasanAI decide", action: decide).buttonStyle(.link).font(.system(size: 12))
                    .fixedSize().accessibilityLabel("Let RasanAI decide \(title)")
            }
        }
    }
}

/// A pill for one choice (a length, a series, an answer). Selected is filled and outlined.
struct ChoicePill: View {
    let title: String
    var symbol: String?
    var selected = false
    var help: String?
    var action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let symbol { Image(systemName: symbol).font(.system(size: 11.5, weight: .medium)) }
                Text(title).font(.system(size: 13, weight: .medium)).lineLimit(1)
            }
            .foregroundStyle(selected ? Color.primary : Color.primary.opacity(0.85))
            .padding(.horizontal, 13).frame(height: 32)
            .background(selected ? Color.rasan.opacity(0.18) : Color.primary.opacity(hovering ? 0.10 : 0.06), in: Capsule())
            .overlay { Capsule().strokeBorder(selected ? Color.rasan.opacity(0.75) : .clear, lineWidth: 1) }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain).hoverCursor(.pointingHand)
        .onHover { hovering = $0 }
        .help(help ?? title)
        .accessibilityLabel(help.map { "\(title). \($0)" } ?? title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A shape choice drawn as its own frame: wide, tall or square.
struct ShapePill: View {
    let id: String
    let title: String
    let detail: String
    let selected: Bool
    var action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                let size = FilmShapePreview.size(id: id, height: 30)
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(selected ? Color.rasan.opacity(0.35) : Color.primary.opacity(0.10))
                    .overlay { RoundedRectangle(cornerRadius: 3, style: .continuous).strokeBorder(selected ? Color.rasan : Color.primary.opacity(0.25), lineWidth: 1) }
                    .frame(width: size.width, height: size.height)
                    .frame(height: 34)
                Text(title).font(.system(size: 12.5, weight: .medium))
            }
            .frame(maxWidth: .infinity).padding(.vertical, 10)
            .background(selected ? Color.rasan.opacity(0.10) : Color.primary.opacity(hovering ? 0.08 : 0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(selected ? Color.rasan.opacity(0.7) : .clear, lineWidth: 1) }
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain).hoverCursor(.pointingHand)
        .onHover { hovering = $0 }
        .help(detail)
        .accessibilityLabel("\(title). \(detail)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The film's shape at a glance: a frame in its aspect with the name inside, and a strip as long as the film.
struct FilmShapePreview: View {
    let aspect: String
    let seconds: Int
    let title: String
    var reduceMotion = false

    static func size(id: String, height: CGFloat) -> CGSize {
        switch id {
        case "9:16": CGSize(width: height * 9 / 16, height: height)
        case "1:1": CGSize(width: height, height: height)
        default: CGSize(width: height * 16 / 9, height: height)
        }
    }
    private var frame: CGSize {
        // Landscape fills the width; tall and square keep the same height so the switch reads as a change of shape.
        let byHeight = Self.size(id: aspect, height: 112)
        return byHeight.width > 200 ? Self.size(id: aspect, height: 200 * 9 / 16) : byHeight
    }
    private var ticks: Int { max(3, min(40, seconds / 5)) }
    private func clock(_ s: Int) -> String { String(format: "%d:%02d", s / 60, s % 60) }

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(LinearGradient(colors: [Color.rasan.opacity(0.32), Color.rasan.opacity(0.08), Color.black.opacity(0.25)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.white.opacity(0.18), lineWidth: 1) }
                VStack(spacing: 4) {
                    Text(title).font(.system(size: 13, weight: .semibold, design: .rounded)).multilineTextAlignment(.center)
                        .lineLimit(3).minimumScaleFactor(0.7)
                    Text(aspect).font(.system(size: 10.5, weight: .medium)).monospacedDigit().foregroundStyle(.secondary)
                }
                .padding(10)
            }
            .frame(width: frame.width, height: frame.height)
            .frame(width: 210, height: 116)
            VStack(spacing: 5) {
                HStack(spacing: 2) {
                    ForEach(0..<ticks, id: \.self) { index in
                        RoundedRectangle(cornerRadius: 1.5).fill(Color.rasan.opacity(index % 3 == 0 ? 0.75 : 0.35))
                    }
                }
                .frame(width: 200, height: 8)
                HStack {
                    Text("0:00"); Spacer(); Text(ComposerLayout.shortLength(seconds)).foregroundStyle(.primary); Spacer(); Text(clock(seconds))
                }
                .font(.system(size: 10.5, weight: .medium)).monospacedDigit().foregroundStyle(.secondary).frame(width: 200)
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.8), value: aspect)
        .animation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.85), value: seconds)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Preview: \(ComposerLayout.shortLength(seconds)), \(aspect)")
    }
}
