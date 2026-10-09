import AppKit
import SwiftUI
import StudioCore
import UserNotifications

/// One readable line of progress, distilled from the raw director log.
struct ActivityEntry: Identifiable, Equatable {
    enum Tone { case info, done, warning, problem }
    let id: Int
    let text: String
    let tone: Tone

    /// Turns the raw log tail into a calm feed: no blanks, colour codes, JSON, stack frames or repeats. Newest last.
    static func feed(from log: String, limit: Int = 200) -> [ActivityEntry] {
        var lines: [(String, Tone)] = []
        for raw in log.split(whereSeparator: \.isNewline) {
            guard var line = clean(String(raw)) else { continue }
            if line.count > 220 { line = String(line.prefix(217)) + "…" }
            if let last = lines.last, last.0 == line { continue }
            lines.append((line, tone(of: line)))
        }
        return lines.suffix(limit).enumerated().map { ActivityEntry(id: $0.offset, text: $0.element.0, tone: $0.element.1) }
    }

    private static func clean(_ raw: String) -> String? {
        var line = raw.replacingOccurrences(of: "\u{1B}\\[[0-9;?]*[ -/]*[@-~]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        // Leading timestamps such as "[12:04:11]" or "2026-10-05T12:04:11Z".
        line = line.replacingOccurrences(of: "^\\[?\\d{4}-\\d\\d-\\d\\d[T ][\\d:.]+Z?\\]?\\s*", with: "", options: .regularExpression)
            .replacingOccurrences(of: "^\\[\\d{1,2}:\\d\\d(:\\d\\d)?(\\.\\d+)?\\]\\s*", with: "", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-•*> ").union(.whitespaces))
        guard line.count >= 4, line.contains(where: \.isLetter) else { return nil }
        // JSON blobs, stack frames and tool plumbing.
        if let first = line.first, "{[".contains(first), line.contains("\":") || line.hasSuffix("}") || line.hasSuffix("]") { return nil }
        if line.hasPrefix("at ") && line.contains(":") && (line.contains("(") || line.contains("/")) { return nil }
        if line.contains("node:internal") || line.contains("node_modules/") || line.hasPrefix("Node.js v") { return nil }
        if line.range(of: "^\\s*[\\^~\\-=_|+.]{4,}", options: .regularExpression) != nil { return nil }
        if line.range(of: "^\"?[A-Za-z_]+\"?\\s*:\\s*[\\[{\"\\d]", options: .regularExpression) != nil, line.contains("\"") { return nil }
        if line.range(of: "^[A-Za-z0-9+/=_-]{60,}$", options: .regularExpression) != nil { return nil }
        return line
    }

    private static func tone(of line: String) -> Tone {
        let lower = line.lowercased()
        if ["error", "failed", "fatal", "exception", "could not", "cannot", "unable to"].contains(where: lower.contains) { return .problem }
        if ["warn", "retry", "retrying", "timed out", "slow"].contains(where: lower.contains) { return .warning }
        if line.hasPrefix("✓") || line.hasPrefix("✔") || ["done", "finished", "complete", "published", "rendered", "saved", "passed", "ready"].contains(where: lower.contains) { return .done }
        return .info
    }
}

struct DirectorLogSheet: View {
    var runtime: DirectorRuntime
    private enum Mode: String, CaseIterable, Identifiable { case activity = "Activity", full = "Full log"; var id: String { rawValue } }
    @State private var text = ""
    @State private var entries: [ActivityEntry] = []
    @State private var mode: Mode = .activity
    @State private var following = true
    @State private var settling = false
    @State private var copied = false
    @Environment(\.dismiss) private var dismiss
    private let bottom = "log-bottom"
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Director log").font(.system(size: 22, weight: .semibold))
                    HStack(spacing: 6) {
                        if runtime.isRunning { Circle().fill(Color.rasan).frame(width: 7, height: 7) }
                        Text(runtime.status).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer()
                Picker("View", selection: $mode.animation(.snappy)) { ForEach(Mode.allCases) { Text($0.rawValue).tag($0) } }
                    .pickerStyle(.segmented).labelsHidden().frame(width: 190)
                Button {
                    NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string)
                    withAnimation(.snappy) { copied = true }
                    Task { try? await Task.sleep(for: .seconds(1.5)); withAnimation(.snappy) { copied = false } }
                } label: { Label(copied ? "Copied" : "Copy log", systemImage: copied ? "checkmark" : "doc.on.doc") }
                    .disabled(text.isEmpty)
            }
            ZStack(alignment: .bottom) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            switch mode {
                            case .activity: activityList
                            case .full:
                                Text(text.isEmpty ? "No director output yet." : text)
                                    .font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading).padding(12)
                            }
                            Color.clear.frame(height: 1).id(bottom)
                                .onAppear { if !settling { following = true } }
                                .onDisappear { if !settling { following = false } }
                        }
                    }
                    .onChange(of: text) { if following { scroll(proxy, animated: false) } }
                    .onChange(of: mode) { following = true; scroll(proxy, animated: false) }
                    .onAppear { scroll(proxy, animated: false) }
                    .overlay(alignment: .bottom) {
                        if !following {
                            Button { following = true; scroll(proxy, animated: true) } label: { Label("Jump to latest", systemImage: "arrow.down") }
                                .buttonStyle(.borderedProminent).controlSize(.small).clipShape(Capsule()).padding(.bottom, 12)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    .animation(.snappy, value: following)
                }
            }
            .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5))
            HStack {
                Text("Logs can contain your project content and stay in the film's private run folder.")
                    .font(.system(size: 11)).foregroundStyle(.tertiary)
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.defaultAction)
            }
        }.padding(24).frame(width: 760, height: 520)
            .task {
                // Follow the director live while the sheet is open.
                while !Task.isCancelled {
                    let latest = runtime.logTail()
                    if latest != text { text = latest; entries = ActivityEntry.feed(from: latest) }
                    try? await Task.sleep(for: .seconds(1))
                }
            }
    }
    @ViewBuilder private var activityList: some View {
        if entries.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: runtime.isRunning ? "hourglass" : "text.alignleft").font(.system(size: 26, weight: .light)).foregroundStyle(.tertiary)
                Text(runtime.isRunning ? "Waiting for the director's first update…" : "No director activity yet.").font(.system(size: 13)).foregroundStyle(.secondary)
                Text("Switch to Full log to see everything.").font(.system(size: 11)).foregroundStyle(.tertiary)
            }.frame(maxWidth: .infinity).padding(.vertical, 90)
        } else {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(entries) { entry in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: icon(entry.tone)).font(.system(size: 10, weight: .semibold)).foregroundStyle(tint(entry.tone)).frame(width: 14)
                        Text(entry.text).font(.system(size: 12.5)).foregroundStyle(entry.tone == .info ? Color.primary.opacity(0.85) : tint(entry.tone))
                            .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                    }.padding(.vertical, 4).padding(.horizontal, 14)
                }
            }.padding(.vertical, 8)
        }
    }
    private func icon(_ tone: ActivityEntry.Tone) -> String {
        switch tone { case .info: "circle.fill"; case .done: "checkmark"; case .warning: "exclamationmark.triangle.fill"; case .problem: "xmark.octagon.fill" }
    }
    private func tint(_ tone: ActivityEntry.Tone) -> Color {
        switch tone { case .info: Color.secondary.opacity(0.5); case .done: .green; case .warning: .orange; case .problem: .red }
    }
    private func scroll(_ proxy: ScrollViewProxy, animated: Bool) {
        settling = true
        DispatchQueue.main.async {
            if animated { withAnimation(.snappy) { proxy.scrollTo(bottom, anchor: .bottom) } } else { proxy.scrollTo(bottom, anchor: .bottom) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { settling = false }
        }
    }
}

/// A native note on a sample-film moment. Live films take notes in the console.
struct NoteSheet: View {
    @Bindable var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var scope = "scene"
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Note at \(timecode(store.playhead))").font(.system(size: 20, weight: .semibold))
                Text(store.selectedScene?.title ?? "Whole film").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            TextField("What would make this moment better?", text: $text, axis: .vertical).lineLimit(4...6).textFieldStyle(.roundedBorder)
            Picker("Applies to", selection: $scope) { Text("This scene").tag("scene"); Text("Whole film").tag("film") }.pickerStyle(.segmented)
            HStack {
                Button("Cancel", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button(store.isSample ? "Save sample note" : "Send note") {
                    Task {
                        await store.addNote(text: text, scope: scope)
                        if store.errorMessage == nil { dismiss() }
                    }
                }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isSending)
            }
        }.padding(28).frame(width: 470)
    }
}

@MainActor final class StudioAppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    var runtime: DirectorRuntime?
    weak var store: StudioStore?
    private var pendingPackage: URL?
    func runSnapshots() {
        if let monitorShots = DirectorMonitorFixtures.directory {
            Task { @MainActor in await DirectorMonitorFixtures.run(into: monitorShots); exit(0) }
            return
        }
        if let shots = SnapshotHarness.stagesDirectory, SnapshotHarness.onlyStages == ["progress"] {
            Task { @MainActor in await ProgressFixtures.run(into: shots); exit(0) }
            return
        }
        if let stages = SnapshotHarness.stagesDirectory {
            Task { @MainActor in
                await StageFixtures.run(into: stages, only: SnapshotHarness.onlyStages)
                exit(0)
            }
            return
        }
        guard let directory = SnapshotHarness.directory else { return }
        Task { @MainActor in
            await SnapshotHarness.run(into: directory)
            exit(0)
        }
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let package = urls.first(where: { $0.pathExtension.lowercased() == PortableProject.fileExtension }) else { return }
        if let store { store.importProjectPackage(package) } else { pendingPackage = package }
    }
    func configureNotifications() {
        if let pendingPackage { store?.importProjectPackage(pendingPackage); self.pendingPackage = nil }
        if Bundle.main.bundleIdentifier != nil { UNUserNotificationCenter.current().delegate = self }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let path = response.notification.request.content.userInfo["runPath"] as? String else { return }
        await MainActor.run { self.store?.openRun(URL(fileURLWithPath: path)) }
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let running = runtime?.isRunning == true
        let transferring = store?.isTransferringProject == true
        let installing = store?.toolSetup.isRunning == true
        guard running || transferring || installing else { store?.pauseQueue(); return .terminateNow }
        let alert = NSAlert()
        alert.messageText = installing ? "Cancel tool setup and quit?" : transferring ? "Cancel the project transfer and quit?" : "Stop the director and quit?"
        alert.informativeText = installing ? "Setup will stop and completed installations will be kept. Any project transfer and running director will also stop." : transferring
            ? "The incomplete transfer will be removed and your original files kept. Any running director will also stop."
            : "Your project files are preserved. The active agent and its child processes will be stopped. You can resume the run later."
        alert.addButton(withTitle: running ? "Stop and Quit" : installing ? "Cancel Setup and Quit" : "Cancel Transfer and Quit"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return .terminateCancel }
        store?.pauseQueue()
        store?.transferTask?.cancel()
        store?.toolSetup.cancel()
        runtime?.stop()
        Task {
            while runtime?.isRunning == true || store?.isTransferringProject == true || store?.toolSetup.isRunning == true { try? await Task.sleep(for: .milliseconds(100)) }
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}
