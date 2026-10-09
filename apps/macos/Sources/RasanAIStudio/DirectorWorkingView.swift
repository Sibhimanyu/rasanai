import StudioCore
import SwiftUI

/// What Claude is doing right now. The state and the clock live in the turn line above; this is the detail. This is what shows right after Start film and between calls: the current line,
/// a calm progress bar, what the person asked for, and the feed of what has been done. Never an intake box.
struct DirectorWorkingView: View {
    let model: FilmSessionModel
    var startedAt: Date?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var headline: String { model.workingMessage ?? model.activity.first?.message ?? "Getting started…" }
    private var brief: JSONValue { model.payload("brief") }
    private var captures: [JSONValue] { brief["captures"].array }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(headline)
                        .font(.system(size: 28, weight: .semibold)).tracking(-0.3)
                        .fixedSize(horizontal: false, vertical: true)
                        .contentTransition(.opacity).animation(.smooth, value: headline)
                        .accessibilityAddTraits(.isHeader)
                    ProgressView().progressViewStyle(.linear).tint(.rasan).frame(maxWidth: 260)
                        .accessibilityLabel("Claude is working")
                }
                if brief["fields"]["subject"].string != nil { briefCard }
                if !captures.isEmpty { captureStrip }
                feed
            }
            .padding(.horizontal, 32).padding(.vertical, 40)
            .frame(maxWidth: 680, alignment: .leading).frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .contain)
    }

    private var briefCard: some View {
        let fields = brief["fields"]
        return VStack(alignment: .leading, spacing: 10) {
            StageSectionTitle("Your brief")
            Text(fields["subject"].string ?? "").font(.system(size: 14)).lineSpacing(3).lineLimit(5)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                if let length = fields["length_s"].number { chip("clock", "\(Int(length)) seconds") }
                if let aspect = fields["aspect"].string { chip("rectangle", aspect) }
                if let brand = fields["brand_name"].string { chip("swatchpalette", brand) }
            }
        }
        .stageCard()
    }

    private func chip(_ symbol: String, _ text: String) -> some View {
        Label(text, systemImage: symbol).font(.system(size: 11)).padding(.horizontal, 9).padding(.vertical, 4)
            .background(Color(nsColor: .quaternaryLabelColor).opacity(0.4), in: Capsule())
    }

    private var captureStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(Array(captures.prefix(6).enumerated()), id: \.offset) { _, capture in
                    VStack(alignment: .leading, spacing: 5) {
                        PayloadImage(path: capture["image"].string ?? capture.string, maxPixels: 640)
                            .frame(width: 168, height: 105)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                        if let caption = capture["caption"].string {
                            Text(caption).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(2).frame(width: 168, alignment: .leading)
                        }
                    }
                }
            }
        }
    }

    private var feed: some View {
        let items = Array(model.activity.prefix(14))
        return VStack(alignment: .leading, spacing: 0) {
            if !items.isEmpty { StageSectionTitle("What's happened").padding(.bottom, 10) }
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    icon(for: item, current: index == 0)
                        .frame(width: 16)
                    Text(item.message)
                        .font(.system(size: 13)).foregroundStyle(index == 0 ? .primary : .secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    if let date = item.date {
                        Text(date, format: .dateTime.hour().minute()).font(.system(size: 11)).foregroundStyle(.tertiary).monospacedDigit()
                    }
                }
                .padding(.vertical, 7)
                .opacity(max(0.45, 1 - Double(index) * 0.05))
                if index < items.count - 1 { Divider() }
            }
        }
        .animation(.smooth, value: items.map(\.id))
    }

    @ViewBuilder private func icon(for item: ActivityItem, current: Bool) -> some View {
        switch item.level {
        case "warn": Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.system(size: 11))
        case "error": Image(systemName: "xmark.octagon.fill").foregroundStyle(.red).font(.system(size: 11))
        case "you": Image(systemName: "person.fill").foregroundStyle(Color.rasan).font(.system(size: 11))
        case "ask": Image(systemName: "questionmark.bubble.fill").foregroundStyle(Color.rasan).font(.system(size: 11))
        default:
            if current { ProgressView().controlSize(.mini) }
            else { Image(systemName: "checkmark").foregroundStyle(item.level == "ok" ? Color(nsColor: .systemGreen) : Color(nsColor: .tertiaryLabelColor)).font(.system(size: 10, weight: .bold)) }
        }
    }
}
