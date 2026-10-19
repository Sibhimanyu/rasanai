import StudioCore
import SwiftUI

/// "View activity": what has actually happened on this film, newest first. Opens as a sheet over the working screen.
struct ProgressActivitySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.agentName) private var agent
    let snapshot: FilmProgressSnapshot
    var onShowLog: (() -> Void)?

    @State private var warningsOnly = false

    private var items: [ProgressActivity] {
        let all = snapshot.activity.sorted { $0.time > $1.time }
        return warningsOnly ? all.filter { $0.kind == .warning } : all
    }
    private var warnings: Int { snapshot.activity.filter { $0.kind == .warning }.count }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("Activity").font(.system(size: 17, weight: .semibold)).accessibilityAddTraits(.isHeader)
                Text("\(snapshot.activity.count) event\(snapshot.activity.count == 1 ? "" : "s")").font(.system(size: 12)).foregroundStyle(.secondary)
                Spacer()
                if warnings > 0 {
                    Toggle(isOn: $warningsOnly) { Label("\(warnings) warning\(warnings == 1 ? "" : "s")", systemImage: "exclamationmark.triangle.fill") }
                        .toggleStyle(.button).controlSize(.small).tint(.orange)
                }
                if let onShowLog { Button("Show log", action: onShowLog).controlSize(.small).help("Open the full activity log") }
                Button("Done") { dismiss() }.keyboardShortcut(.defaultAction).controlSize(.small)
            }
            .padding(.horizontal, 20).padding(.vertical, 14)
            Divider()
            if items.isEmpty {
                Text(snapshot.activity.isEmpty ? "Nothing yet. Each step \(agent) takes shows up here." : "No warnings.")
                    .font(.system(size: 13)).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(items.prefix(500)) { item in
                            ActivityRow(item: item)
                            Divider().opacity(0.5)
                        }
                    }
                    .padding(.horizontal, 20).padding(.vertical, 6)
                }
            }
        }
        .frame(width: 620, height: 540)
        .background(Color.appBackground)
    }
}

private struct ActivityRow: View {
    let item: ProgressActivity
    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            ZStack {
                Circle().fill(item.activityTint.opacity(0.13))
                Image(systemName: item.symbolName).font(.system(size: 10, weight: .semibold)).foregroundStyle(item.activityTint)
            }
            .frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.system(size: 13, weight: item.kind == .warning ? .semibold : .regular))
                    .foregroundStyle(item.kind == .warning ? Color.orange : Color.primary).fixedSize(horizontal: false, vertical: true)
                if let detail = item.detail, !detail.isEmpty {
                    Text(detail).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(3).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 10)
            VStack(alignment: .trailing, spacing: 1) {
                Text(item.time, format: .dateTime.hour().minute().second()).monospacedDigit()
                Text(item.phase.title)
            }
            .font(.system(size: 11)).foregroundStyle(.tertiary)
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.kind == .warning ? "Warning. " : "")\(item.phase.title). \(item.title). \(item.detail ?? "")")
    }
}

/// A warning's "View details": that one event in full, with the lines logged just before it.
struct ProgressActivityDetail: View {
    let item: ProgressActivity
    let snapshot: FilmProgressSnapshot
    var onShowLog: (() -> Void)?

    private var before: [ProgressActivity] {
        Array(snapshot.activity.filter { $0.id != item.id && $0.time <= item.time }.sorted { $0.time > $1.time }.prefix(5))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Label(item.kind == .warning ? "Warning" : item.kind.rawValue.capitalized, systemImage: item.symbolName)
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(item.activityTint)
                Spacer()
                Text("\(item.phase.title) · \(item.time.formatted(date: .abbreviated, time: .standard))").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Text(item.title).font(.system(size: 13, weight: .medium)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            if let detail = item.detail, !detail.isEmpty {
                ScrollView {
                    Text(detail).font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(10)
                }
                .frame(maxHeight: 160)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.55), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
            }
            if !before.isEmpty {
                StageSectionTitle("Just before")
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(before) { prior in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(prior.time, format: .dateTime.hour().minute().second()).foregroundStyle(.tertiary).monospacedDigit()
                            Text(prior.title).lineLimit(2)
                        }
                        .font(.system(size: 11))
                    }
                }
            }
            if let onShowLog { Button("Show log", action: onShowLog).controlSize(.small) }
        }
        .padding(14)
        .frame(width: 400)
    }
}

extension ProgressActivity {
    var activityTint: Color {
        switch kind {
        case .milestone, .answer: Color(nsColor: .systemGreen)
        case .ask, .note: Color.rasan
        case .warning: .orange
        case .critic: .purple
        case .render: .pink
        default: Color.secondary
        }
    }
}
