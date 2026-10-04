import AppKit
import SwiftUI
import StudioCore

struct WelcomeView: View {
    @Bindable var store: StudioStore
    private var settings: StudioSettings { store.settings }
    private var agent: LocalAgent { LocalAgent(rawValue: settings.defaultAgent) ?? .claude }
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Welcome to RasanAI Studio").font(.largeTitle.bold())
            Text("Set up your Mac once, then create films in your own project library.").foregroundStyle(.secondary)
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    GroupBox("1 · Your projects") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(settings.projectRoot).font(.caption).textSelection(.enabled)
                            Text("Every film gets its own folder. Existing projects are never moved when you change the library.").font(.caption).foregroundStyle(.secondary)
                            Button("Choose Library…") { settings.chooseLibrary() }
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(8)
                    }
                    GroupBox("2 · Your director") {
                        VStack(alignment: .leading, spacing: 10) {
                            Picker("Agent", selection: Binding(get: { settings.defaultAgent }, set: { settings.defaultAgent = $0 })) {
                                ForEach(LocalAgent.allCases) { Text($0.title).tag($0.id) }
                            }
                            TextField("Installed CLI executable", text: Binding(get: { settings.path(for: agent) }, set: { settings.setPath($0, for: agent) }))
                            HStack {
                                Button("Detect") { settings.setPath(agent.discoveredExecutable() ?? "", for: agent) }.disabled(agent == .custom)
                                Button("Browse…") { settings.chooseExecutable(for: agent) }
                                Button("Check Sign-in") { Task { await settings.check(agent) } }.disabled(settings.checking.contains(agent.id))
                                if settings.checking.contains(agent.id) { ProgressView().controlSize(.small) }
                            }
                            Text(settings.statuses[agent.id] ?? (settings.path(for: agent).isEmpty ? "Choose an installed agent. You can also explore the sample without one." : "CLI found. Sign-in has not been checked.")).font(.caption).foregroundStyle(.secondary)
                            if agent != .custom {
                                Button("Copy Sign-in Command and Open Terminal") { settings.copyLogin(agent); settings.openTerminal() }
                                    .disabled(settings.path(for: agent).isEmpty)
                            }
                            Text("Paste the copied command in Terminal. The provider handles login; Studio never asks for your password. Nothing runs until you start a director.").font(.caption).foregroundStyle(.secondary)
                        }.padding(8)
                    }
                    GroupBox("3 · Rendering tools") {
                        VStack(alignment: .leading, spacing: 10) {
                            tool("Node", found: settings.nodeURL != nil)
                            tool("FFmpeg", found: settings.executable(named: "ffmpeg") != nil)
                            tool("HyperFrames CLI", found: settings.executable(named: "hyperframes") != nil)
                            Text("HyperFrames workflows and browser setup are separate. A missing CLI here may also be available through npx. These are discovery hints, not an end-to-end readiness check.").font(.caption).foregroundStyle(.secondary)
                            HStack {
                                Link("FFmpeg setup", destination: URL(string: "https://ffmpeg.org/download.html")!)
                                Button("Copy HyperFrames Setup") {
                                    NSPasteboard.general.clearContents()
                                    NSPasteboard.general.setString("npx hyperframes skills update && npx hyperframes browser ensure", forType: .string)
                                    settings.openTerminal()
                                }
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(8)
                    }
                }
            }
            HStack {
                Button("Later") { settings.finishWelcome() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button("Explore Sample") { settings.finishWelcome(); store.loadSample() }
                Button("Create a Film") { settings.finishWelcome(); store.newFilm() }.buttonStyle(.borderedProminent)
            }
        }.padding(24).frame(width: 620, height: 660)
    }
    private func tool(_ title: String, found: Bool) -> some View {
        Label(found ? "\(title) found" : "\(title) not detected", systemImage: found ? "checkmark.circle" : "info.circle")
            .foregroundStyle(found ? Color.primary : Color.secondary)
    }
}
