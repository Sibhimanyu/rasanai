import SwiftUI

// The update window, drawn inside the main window as a sheet, plus the one-time "here's what changed" card.

private enum NoteStyle {
    static let tints: [Color] = [.rasan, .blue, .green, .orange, .pink, .teal]
    static func symbol(for note: UpdateNote) -> String {
        let t = (note.lead + " " + note.body).lowercased()
        let table: [(String, String)] = [
            ("player", "play.rectangle.fill"), ("video", "play.rectangle.fill"), ("preview", "play.rectangle.fill"),
            ("settings", "gearshape.fill"), ("ask rasan", "bubble.left.and.bubble.right.fill"), ("chat", "bubble.left.and.bubble.right.fill"),
            ("history", "clock.arrow.circlepath"), ("restore", "clock.arrow.circlepath"), ("note", "note.text"),
            ("export", "square.and.arrow.up"), ("install", "wrench.and.screwdriver.fill"), ("stepper", "circle.dotted"),
            ("word", "textformat"), ("menu", "ellipsis.circle.fill"), ("character", "face.smiling.fill"),
            ("fix", "checkmark.seal.fill"), ("faster", "bolt.fill"), ("shortcut", "command"),
        ]
        return table.first { t.contains($0.0) }?.1 ?? "sparkles"
    }
}

/// The "What's new" list: each note is a tinted symbol, a bold lead-in and the rest of the sentence.
struct UpdateNotesList: View {
    let title: String
    let notes: [UpdateNote]
    var maxHeight: CGFloat = 250
    var body: some View {
        if !notes.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(notes.enumerated()), id: \.offset) { index, note in
                            let tint = NoteStyle.tints[index % NoteStyle.tints.count]
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: NoteStyle.symbol(for: note)).font(.system(size: 13, weight: .semibold)).foregroundStyle(tint)
                                    .frame(width: 30, height: 30)
                                    .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(tint.opacity(0.16)))
                                    .accessibilityHidden(true)
                                (Text(note.lead).fontWeight(.semibold) + Text(note.body.isEmpty ? "" : " " + note.body).foregroundStyle(.secondary))
                                    .font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .padding(14)
                }
                .frame(maxHeight: maxHeight)
                .fixedSize(horizontal: false, vertical: true)
                .background(Workspace.panel, in: RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
            }
        }
    }
}

private struct UpdateHeader: View {
    let symbol: String
    let tint: Color
    let title: String
    var subtitle: String?
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol).font(.system(size: 20, weight: .semibold)).foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tint.opacity(0.16)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 18, weight: .semibold))
                if let subtitle { Text(subtitle).font(.system(size: 13)).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 0)
        }
    }
}

struct StudioUpdateView: View {
    @ObservedObject var updater: StudioUpdater
    @Environment(\.dismiss) private var dismiss

    private func megabytes(_ n: UInt64) -> String { ByteCountFormatter.string(fromByteCount: Int64(n), countStyle: .file) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            switch updater.state {
            case .idle, .checking:
                UpdateHeader(symbol: "arrow.triangle.2.circlepath", tint: .rasan, title: "Looking for updates…")
                ProgressView().controlSize(.small)
                buttons { Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction) }
            case .upToDate:
                UpdateHeader(symbol: "checkmark.circle.fill", tint: .green, title: "You're on the latest version", subtitle: "RasanAI \(StudioUpdater.currentVersion)")
                buttons { Button("Done") { dismiss() }.buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction) }
            case .available(let info):
                UpdateHeader(symbol: "arrow.down.circle.fill", tint: .rasan, title: "RasanAI \(info.version) is ready",
                             subtitle: "You're on \(StudioUpdater.currentVersion)" + (info.size > 0 ? " · \(megabytes(info.size)) download" : ""))
                UpdateNotesList(title: "What's new in \(info.version)", notes: info.notes)
                buttons {
                    Button("Skip this version") { updater.skipThisVersion(); dismiss() }
                    Button("Remind me later") { dismiss() }.keyboardShortcut(.cancelAction)
                    Button("Update now") { updater.updateNow() }.buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction)
                }
            case .downloading(let info, let received, let total):
                UpdateHeader(symbol: "arrow.down.circle.fill", tint: .rasan, title: "Downloading RasanAI \(info.version)", subtitle: "You can keep working while this finishes.")
                VStack(alignment: .leading, spacing: 6) {
                    if total > 0 { ProgressView(value: Double(min(received, total)), total: Double(total)) } else { ProgressView() }
                    Text(total > 0 ? "\(megabytes(received)) of \(megabytes(total))" : megabytes(received))
                        .font(.system(size: 12)).monospacedDigit().foregroundStyle(.secondary)
                }
                UpdateNotesList(title: "What's new in \(info.version)", notes: info.notes)
                buttons {
                    Button("Cancel download") { updater.cancelDownloading(); dismiss() }
                    Button("Hide") { dismiss() }.keyboardShortcut(.cancelAction)
                }
            case .extracting(let info, let progress):
                UpdateHeader(symbol: "shippingbox.fill", tint: .rasan, title: "Installing…", subtitle: "Getting RasanAI \(info.version) ready.")
                ProgressView(value: min(max(progress, 0), 1))
                UpdateNotesList(title: "What's new in \(info.version)", notes: info.notes)
                buttons { Button("Hide") { dismiss() }.keyboardShortcut(.cancelAction) }
            case .ready(let info):
                UpdateHeader(symbol: "checkmark.circle.fill", tint: .green, title: "Restart to finish", subtitle: "RasanAI \(info.version) is ready. Your films are saved.")
                UpdateNotesList(title: "What's new in \(info.version)", notes: info.notes)
                buttons {
                    Button("Later") { dismiss() }.keyboardShortcut(.cancelAction)
                    Button("Restart now") { updater.restartToFinish() }.buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction)
                }
            case .installing:
                UpdateHeader(symbol: "shippingbox.fill", tint: .rasan, title: "Installing…", subtitle: "RasanAI will restart in a moment.")
                ProgressView().controlSize(.small)
            case .error(let message, let detail):
                UpdateHeader(symbol: "exclamationmark.triangle.fill", tint: .orange, title: "Couldn't update", subtitle: message)
                Text(detail).font(.system(size: 11)).foregroundStyle(.tertiary).textSelection(.enabled).lineLimit(3)
                buttons {
                    Button("Close") { dismiss() }.keyboardShortcut(.cancelAction)
                    Button("Try again") { updater.tryAgain() }.buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction)
                }
            }
        }
        .padding(24)
        .frame(width: 520)
        .background(Color.appBackground)
        .animation(.smooth(duration: 0.2), value: updater.state.isBusy)
        .onAppear { updater.windowOpened() }
        .onDisappear { updater.windowClosed() }
        .onChange(of: updater.state) { _, new in if new == .idle { dismiss() } }
    }

    private func buttons<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        HStack(spacing: 10) { Spacer(minLength: 0); content() }
    }
}

/// After an update: a one-time "You're now on X" card with what changed.
struct WhatsNewCard: View {
    @ObservedObject var updater: StudioUpdater
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        if let whatsNew = updater.whatsNew {
            VStack(alignment: .leading, spacing: 18) {
                UpdateHeader(symbol: "sparkles", tint: .rasan, title: "You're now on \(whatsNew.version)", subtitle: "Here's what changed.")
                UpdateNotesList(title: "What's new in \(whatsNew.version)", notes: whatsNew.notes, maxHeight: 320)
                HStack { Spacer(); Button("Got it") { dismiss() }.buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction) }
            }
            .padding(24).frame(width: 520).background(Color.appBackground)
            .onDisappear { updater.dismissWhatsNew() }
        }
    }
}

/// A quiet bar for when an update was found in the background: opens the window instead of popping one up.
struct StudioUpdateBanner: View {
    @ObservedObject private var updater = StudioUpdater.shared
    var body: some View {
        if updater.hasUpdateWaiting, let version = updater.waitingVersion {
            HStack(spacing: 10) {
                Image(systemName: "arrow.down.circle").foregroundStyle(Color.rasan)
                Text("RasanAI \(version) is ready to update.").font(.system(size: 12))
                Spacer()
                Button("See what's new") { updater.present() }.buttonStyle(.link).font(.system(size: 12))
            }
            .padding(.horizontal, .filmInset).padding(.vertical, 6).background(.bar).overlay(alignment: .bottom) { Divider() }
        }
    }
}
