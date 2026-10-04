import AppKit
import SwiftUI
import StudioCore
import UserNotifications

struct DirectorQuestionSheet: View {
    @Bindable var store: StudioStore
    @State private var choice = ""
    @State private var answer = ""
    @Environment(\.dismiss) private var dismiss
    private var question: JSONValue { store.snapshot.raw["ask"] }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(question["question"].string ?? "The director needs your answer").font(.title2)
            if let context = question["context"].string, !context.isEmpty { Text(context).foregroundStyle(.secondary) }
            if !question["options"].array.isEmpty {
                Picker("Your choice", selection: $choice) {
                    Text("Choose an option").tag("")
                    ForEach(Array(question["options"].array.enumerated()), id: \.offset) { _, option in
                        Text(option["label"].string ?? "Option").tag(option["id"].string ?? "")
                    }
                }
            }
            TextField(question["placeholder"].string ?? "Your answer", text: $answer, axis: .vertical).lineLimit(3...8)
            HStack {
                Spacer()
                Button("Later") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Send Answer") {
                    Task {
                        await store.send(type: "answer", value: .object(["choice": choice.isEmpty ? .null : .string(choice), "text": .string(answer)]),
                            step: question["step"].string ?? store.snapshot.currentStep)
                        if store.snapshot.raw["ask"]["answered"] != .null { dismiss() }
                    }
                }.keyboardShortcut(.defaultAction).disabled(!store.isConnected || store.isSending || (choice.isEmpty && answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            }
        }.padding(24).frame(width: 570)
    }
}

struct DirectorSheet: View {
    @Bindable var store: StudioStore
    @State private var request = ""
    @State private var confirmed = false
    @State private var starting = false
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(store.launchProject == nil ? "Resume Director" : "Start Film").font(.title2)
            Text(store.launchProject?.path ?? store.workspaceURL?.path ?? "Choose a project").font(.caption).textSelection(.enabled)
            TextEditor(text: $request).frame(height: 120).border(.secondary.opacity(0.3))
            Text("Describe the film, sources, or revision. The director uses the existing RasanAI workflow and asks questions in the full console.")
                .font(.caption).foregroundStyle(.secondary)
            Toggle("I authorize my selected agent to work on this project and use its provider account", isOn: $confirmed)
            Text(store.settings.allowUnrestrictedTools ? "Unrestricted tools are enabled: this agent can operate outside the project. Provider charges may apply." : "Provider charges may apply. Permission-restricted tools may block browser/render work; inspect the log if the director stops.")
                .font(.caption).foregroundStyle(store.settings.allowUnrestrictedTools ? Color.red : Color.secondary)
            HStack {
                SettingsLink { Text("Agent settings…") }
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction).disabled(starting)
                Button("Start Director") {
                    starting = true
                    Task {
                        await store.startDirector(request: request)
                        starting = false
                        if store.runtime.isRunning { dismiss() }
                    }
                }.keyboardShortcut(.defaultAction).disabled(!confirmed || request.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || starting)
                if starting { ProgressView().controlSize(.small) }
            }
        }.padding(24).frame(width: 590)
            .onAppear {
                if store.launchProject == nil { request = "Resume this existing run from its saved state. Preserve completed work and continue with the next pending step." }
            }
    }
}

struct DirectorLogSheet: View {
    var runtime: DirectorRuntime
    @State private var text = ""
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(runtime.status).font(.headline)
            Text("Logs can contain your project content. They stay in the project's private run folder.").font(.caption).foregroundStyle(.secondary)
            ScrollView { Text(text).font(.system(.caption, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
            HStack { Button("Refresh") { text = runtime.logTail() }; Spacer(); Button("Done") { dismiss() }.keyboardShortcut(.cancelAction) }
        }.padding(24).frame(width: 800, height: 520).onAppear { text = runtime.logTail() }
    }
}

@MainActor final class StudioAppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    var runtime: DirectorRuntime?
    weak var store: StudioStore?
    func configureNotifications() {
        if Bundle.main.bundleIdentifier != nil { UNUserNotificationCenter.current().delegate = self }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let path = response.notification.request.content.userInfo["runPath"] as? String else { return }
        await MainActor.run { self.store?.openRun(URL(fileURLWithPath: path)) }
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let runtime, runtime.isRunning else { return .terminateNow }
        let alert = NSAlert()
        alert.messageText = "Stop the director and quit?"
        alert.informativeText = "Your project files are preserved. The active agent and its child processes will be stopped. You can resume the run later."
        alert.addButton(withTitle: "Stop and Quit"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return .terminateCancel }
        runtime.stop()
        Task {
            while runtime.isRunning { try? await Task.sleep(for: .milliseconds(100)) }
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}
