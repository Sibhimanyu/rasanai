import AppKit
import StudioCore
import SwiftUI

extension StudioStore {
    func showPreflight(project: URL? = nil, sources: [URL] = []) {
        preflightProject = project
        preflightSources = sources
        preflightReport = nil
        sheet = .preflight
        Task { await checkPreflight() }
    }
    func checkPreflight() async {
        let identity = UUID(); preflightGeneration = identity
        isCheckingPreflight = true
        defer { if preflightGeneration == identity { isCheckingPreflight = false } }
        let project = preflightProject ?? URL(fileURLWithPath: settings.projectRoot)
        let selectedSources = preflightSources
        let hasProject = preflightProject != nil && FileManager.default.fileExists(atPath: project.appendingPathComponent("rasanai-project.json").path)
        let node = settings.nodeURL
        let queued = settings.filmQueue.first { $0.project == project }
        let agent = queued.flatMap { LocalAgent(rawValue: $0.draft.agent) } ?? settings.agent
        await settings.check(agent)
        let agentReady = settings.isReady(agent)
        let status = settings.statuses[agent.id] ?? "Set up your director in Help → Show Welcome."
        let signIn = PreflightItem("account", agent.title, agentReady ? "The CLI reports signed in." : status, agentReady ? .ready : .blocked)
        let savedFiles = hasProject ? await Task.detached { (try? ProjectSources.files(in: project)) ?? [] }.value : []
        let env = node.map { runtime.environment(node: $0) } ?? ProcessInfo.processInfo.environment
        let directories = [node?.deletingLastPathComponent().path].compactMap { $0 } + LocalAgent.searchDirectories
        let currentRun = queued?.run ?? (project == selectedProjectURL ? runURL : nil)
        let report = await FilmPreflight.check(PreflightConfiguration(node: node, engine: DirectorRuntime.engineURL, driver: DirectorRuntime.driverURL,
            directories: directories, environment: env, project: project, sources: Array(Set(savedFiles + selectedSources)), existingRun: currentRun))
        guard preflightGeneration == identity else { return }
        preflightReport = PreflightReport(items: [signIn] + report.items)
    }
}

struct PreflightView: View {
    @Bindable var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openSettings) private var openSettings
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Ready to make a film?").font(.system(size: 23, weight: .semibold))
                    Text("Check local tools, files and space before starting.").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            if store.isCheckingPreflight { HStack { ProgressView().controlSize(.small); Text("Checking this Mac…").font(.system(size: 13)) } }
            if let report = store.preflightReport {
                Text(report.canStart ? "Required checks passed. Review any preparation notes below." : "Resolve the items marked in red, then recheck.")
                    .font(.system(size: 13, weight: .medium))
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(report.items) { item in
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: item.level == .ready ? "checkmark.circle.fill" : item.level == .warning ? "exclamationmark.triangle.fill" : "xmark.circle.fill")
                                    .foregroundStyle(item.level == .ready ? Color.green : item.level == .warning ? .orange : .red)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(item.title).font(.system(size: 13, weight: .semibold))
                                    Text(item.detail).font(.system(size: 12)).foregroundStyle(.secondary).textSelection(.enabled)
                                    if let command = item.command {
                                        Button("Copy setup command") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(command, forType: .string) }
                                            .controlSize(.small).help(command)
                                    }
                                }
                            }
                        }
                    }.padding(.vertical, 6).frame(maxWidth: .infinity, alignment: .leading)
                }
                Text("Checked \(report.checkedAt.formatted(date: .omitted, time: .shortened)). Availability can change; launch checks run again automatically.")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            } else { Spacer() }
            HStack {
                Button("Director setup…") { store.sheet = .welcome; store.settings.showWelcome = true }
                Button("Settings…") { openSettings() }
                Spacer()
                Button("Recheck") { Task { await store.checkPreflight() } }.disabled(store.isCheckingPreflight)
            }
        }.padding(24).frame(width: 650, height: 600)
    }
}
