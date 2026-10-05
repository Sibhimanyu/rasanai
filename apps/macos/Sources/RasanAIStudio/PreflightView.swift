import AppKit
import StudioCore
import SwiftUI

extension StudioStore {
    func showPreflight(project: URL? = nil, sources: [URL] = []) {
        if toolSetup.isRunning { sheet = .preflight; return }
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
    @State private var selectedTools: Set<SetupTool> = []
    @State private var developerToolsNotice: String?
    private var gate: StartGate { StartGate.shared }
    private var missingTools: [SetupTool] { SetupTool.missing(in: store.preflightReport) }
    private var needsGitSetup: Bool { store.preflightReport?.items.contains(where: { $0.id == "git" && $0.level != .ready }) == true }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Ready to make a film?").font(.system(size: 23, weight: .semibold))
                    Text(gate.pending != nil ? "A few things need attention before this film can start." : "Check local tools, files and space before starting.").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.cancelAction).disabled(store.toolSetup.isRunning)
            }
            if store.isCheckingPreflight { HStack { ProgressView().controlSize(.small); Text("Checking this Mac…").font(.system(size: 13)) } }
            if let report = store.preflightReport {
                Text(store.toolSetup.isRunning ? "Tool setup is in progress. Readiness will be checked again when it finishes." : report.canStart ? "Required checks passed. Review any preparation notes below." : "Resolve the items marked in red, then recheck.")
                    .font(.system(size: 13, weight: .medium))
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if !missingTools.isEmpty && !store.toolSetup.isRunning { installPlan }
                        if !store.toolSetup.message.isEmpty || store.toolSetup.error != nil {
                            ToolSetupProgress(setup: store.toolSetup)
                        }
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
                                    if ["node", "npx"].contains(item.id), item.level == .blocked,
                                       !store.settings.nodePath.isEmpty, store.settings.bundledNodeURL != nil {
                                        Button("Use bundled Node") { store.settings.nodePath = ""; Task { await store.checkPreflight() } }
                                            .controlSize(.small).disabled(store.isCheckingPreflight || store.toolSetup.isRunning)
                                    }
                                }
                            }
                        }
                    }.padding(.vertical, 6).frame(maxWidth: .infinity, alignment: .leading)
                }
                Text("Checked \(report.checkedAt.formatted(date: .omitted, time: .shortened)). Availability can change; launch checks run again automatically.")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                if store.runtime.isRunning || store.runtime.isPreparing {
                    Text("Pause the director before installing tools.").font(.system(size: 12)).foregroundStyle(.secondary)
                }
            } else { Spacer() }
            HStack {
                Button("Director setup…") { store.sheet = .welcome; store.settings.showWelcome = true }.disabled(store.toolSetup.isRunning)
                Button("Settings…") { openSettings() }.disabled(store.toolSetup.isRunning)
                Spacer()
                if gate.pending != nil {
                    Button("Recheck") { Task { await store.checkPreflight() } }.disabled(store.isCheckingPreflight || store.toolSetup.isRunning)
                    Button("Recheck and start") { Task { await store.recheckAndStart() } }
                        .buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                        .disabled(store.isCheckingPreflight || store.toolSetup.isRunning)
                } else {
                    Button("Recheck") { Task { await store.checkPreflight() } }.disabled(store.isCheckingPreflight || store.toolSetup.isRunning)
                }
            }
        }.padding(24).frame(width: 650, height: 600)
            .interactiveDismissDisabled(store.toolSetup.isRunning)
            .onDisappear { StartGate.shared.pending = nil }
            .onChange(of: missingTools, initial: true) { selectedTools = Set(missingTools.filter { $0 != .skills || !needsGitSetup }) }
            .onChange(of: needsGitSetup) {
                if needsGitSetup { selectedTools.remove(.skills) }
                else if missingTools.contains(.skills) { selectedTools.insert(.skills) }
            }
    }

    private var installPlan: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Prepare your rendering tools").font(.system(size: 15, weight: .semibold))
            Text("Choose what to download. Setup runs here and rechecks readiness when it finishes.")
                .font(.system(size: 12)).foregroundStyle(.secondary)
            ForEach(missingTools) { tool in
                Toggle(isOn: Binding(get: { selectedTools.contains(tool) }, set: { if $0 { selectedTools.insert(tool) } else { selectedTools.remove(tool) } })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tool.title).font(.system(size: 13, weight: .medium))
                        Text(tool.detail).font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                }.toggleStyle(.checkbox).disabled(tool == .skills && needsGitSetup)
            }
            if needsGitSetup {
                Text("Design resources need Git first. Install Apple's command line tools, finish the macOS installer, then Recheck.")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                Button("Install Apple command line tools…") {
                    Task {
                        do {
                            let code = try await DirectorRuntime.execute(URL(fileURLWithPath: "/usr/bin/xcode-select"), arguments: ["--install"], directory: FileManager.default.homeDirectoryForCurrentUser, environment: ProcessInfo.processInfo.environment)
                            developerToolsNotice = code == 0 ? "Finish the macOS installer, then press Recheck." : "macOS could not start the installer. Check System Settings → General → Software Update, then Recheck."
                        } catch { developerToolsNotice = error.localizedDescription }
                    }
                }.disabled(!store.canInstallTools)
                if let developerToolsNotice { Text(developerToolsNotice).font(.system(size: 11)).foregroundStyle(.secondary) }
            }
            Text("An internet connection is needed. Tools stay in your user account; design resources are shared with your directors. If needed, setup also installs HyperFrames for the browser and resources.")
                .font(.system(size: 11)).foregroundStyle(.secondary)
            HStack {
                Button("Install selected tools") { store.installTools(missingTools.filter { selectedTools.contains($0) }) }
                    .buttonStyle(.borderedProminent).disabled(selectedTools.isEmpty || !store.canInstallTools)
            }
        }.padding(14).background(Color.rasan.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
    }
}
