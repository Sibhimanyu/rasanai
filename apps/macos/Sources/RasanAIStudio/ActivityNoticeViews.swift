import AppKit
import StudioCore
import SwiftUI

/// The small adjustments Rasan made along the way (ActivitySeverity.info): one quiet grey line on the working screen, collapsed
/// by default. Opening it lists each one in plain words, with the original message one click away. Nothing here scrolls,
/// pops or animates by itself.
struct QuietAdjustmentsRow: View {
    let items: [ProgressActivity]
    @State private var open = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var label: String {
        items.count == 1 ? "Rasan adjusted the plan" : "\(items.count) small adjustments"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                if reduceMotion { open.toggle() } else { withAnimation(.snappy(duration: 0.2)) { open.toggle() } }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "info.circle").font(.system(size: 11))
                    Text(label).font(.system(size: 12))
                    if items.count == 1, let only = items.first, !open {
                        Text(only.title).font(.system(size: 12)).foregroundStyle(.tertiary).lineLimit(1).truncationMode(.tail)
                    }
                    Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold))
                        .rotationEffect(.degrees(open ? 90 : 0))
                    Spacer(minLength: 0)
                }
                .foregroundStyle(.secondary)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Routine changes Rasan made to keep the film moving. Nothing for you to do.")
            .accessibilityLabel(items.count == 1 ? "Rasan adjusted the plan: \(items[0].title)" : "\(items.count) small adjustments. Nothing for you to do.")
            .accessibilityHint(open ? "Hides the list" : "Shows the list")
            if open {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(items.sorted { $0.time > $1.time }) { AdjustmentLine(item: $0) }
                }
                .padding(.leading, 17)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One adjustment: the time, the plain sentence and the original message behind a disclosure.
private struct AdjustmentLine: View {
    let item: ProgressActivity
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(item.time.formatted(date: .omitted, time: .shortened)).font(.system(size: 11)).foregroundStyle(.tertiary).monospacedDigit()
                Text(item.title).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if let original = item.original { OriginalMessageDisclosure(text: original) }
        }
    }
}

/// "Show original message": the text exactly as the director logged it, monospaced, selectable, with a Copy button. Closed by default.
struct OriginalMessageDisclosure: View {
    let text: String
    @State private var open = false
    @State private var copied = false

    var body: some View {
        DisclosureGroup(isExpanded: $open) {
            VStack(alignment: .trailing, spacing: 4) {
                ScrollView {
                    Text(text).font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(8)
                }
                .frame(maxHeight: 140)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.45), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                Button(copied ? "Copied" : "Copy") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(text, forType: .string)
                    copied = true
                }
                .controlSize(.mini)
                .accessibilityLabel("Copy the original message")
            }
            .padding(.top, 4)
        } label: {
            Text("Show original message").font(.system(size: 11)).foregroundStyle(.tertiary)
        }
        .onChange(of: open) { copied = false }
    }
}

/// A line worth a glance (notice) or one that needs the person or failed (needs-you, error). A notice is a muted neutral card;
/// the others keep a visible card, in plain words. Both carry the original message and "View details".
struct ActivityNoticeCard: View {
    let item: ProgressActivity
    let snapshot: FilmProgressSnapshot
    var onShowLog: (() -> Void)?
    @State private var detailItem: ProgressActivity?

    private var severity: ActivitySeverity { item.severity ?? .error }
    private var heading: String {
        switch severity {
        case .info, .notice: "Worth knowing"
        case .needsYou: "Needs you"
        case .error: "Something didn't work"
        }
    }
    private var tint: Color {
        switch severity {
        case .info, .notice: .secondary
        case .needsYou: .orange
        case .error: Color(nsColor: .systemRed)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Label(heading, systemImage: severity.isAlerting ? "exclamationmark.triangle.fill" : "info.circle")
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(tint)
                Text(item.time.formatted(date: .omitted, time: .shortened)).font(.system(size: 11)).foregroundStyle(.tertiary)
                Spacer(minLength: 8)
                Button("View details") { detailItem = item }
                    .controlSize(.small)
                    .popover(item: $detailItem, arrowEdge: .bottom) { ProgressActivityDetail(item: $0, snapshot: snapshot, onShowLog: onShowLog) }
            }
            Text(item.title).font(.system(size: 12)).foregroundStyle(severity.isAlerting ? .primary : .secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let original = item.original { OriginalMessageDisclosure(text: original) }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(severity.isAlerting ? tint.opacity(0.08) : Color(nsColor: .quaternaryLabelColor).opacity(0.18),
                    in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(heading). \(item.title)")
    }
}
