import AppKit
import SwiftUI
import StudioCore
import UserNotifications

struct DirectorLogSheet: View {
    var runtime: DirectorRuntime
    @State private var text = ""
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Director log").font(.system(size: 22, weight: .semibold))
                    Text(runtime.status).font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { text = runtime.logTail() } label: { Label("Refresh", systemImage: "arrow.clockwise") }
            }
            ScrollView {
                Text(text.isEmpty ? "No director output yet." : text)
                    .font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12)
            }
            .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5))
            HStack {
                Text("Logs can contain your project content and stay in the film's private run folder.")
                    .font(.system(size: 11)).foregroundStyle(.tertiary)
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.defaultAction)
            }
        }.padding(24).frame(width: 760, height: 520).onAppear { text = runtime.logTail() }
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
        guard running || transferring else { store?.pauseQueue(); return .terminateNow }
        let alert = NSAlert()
        alert.messageText = transferring ? "Cancel the project transfer and quit?" : "Stop the director and quit?"
        alert.informativeText = transferring
            ? "The incomplete transfer will be removed and your original files kept. Any running director will also stop."
            : "Your project files are preserved. The active agent and its child processes will be stopped. You can resume the run later."
        alert.addButton(withTitle: running ? "Stop and Quit" : "Cancel Transfer and Quit"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return .terminateCancel }
        store?.pauseQueue()
        store?.transferTask?.cancel()
        runtime?.stop()
        Task {
            while runtime?.isRunning == true || store?.isTransferringProject == true { try? await Task.sleep(for: .milliseconds(100)) }
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}
