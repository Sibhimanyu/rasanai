import AppKit
import SwiftUI
import StudioCore

/// First-launch setup. One calm screen: three tiles (Claude, Codex, Tools), each one click to the next step.
struct WelcomeView: View {
    @Bindable var store: StudioStore
    @State private var selected: LocalAgent = .claude
    @State private var checkedTools = false
    private var settings: StudioSettings { store.settings }
    private var login: AgentSignIn { settings.login }
    private var agents: [LocalAgent] { [.claude, .codex] }
    private var missingTools: [SetupTool] { SetupTool.missing(in: store.preflightReport) }
    private var toolsChecking: Bool { !store.isDemo && (store.isCheckingPreflight || (!checkedTools && store.preflightReport == nil)) }
    /// The account item belongs to the director tiles, so tools are ready when no tool is missing.
    private var toolsReady: Bool { store.isDemo || (store.preflightReport != nil && missingTools.isEmpty) }
    private var needsGitSetup: Bool { store.preflightReport?.items.contains { $0.id == "git" && $0.level != .ready } == true }
    private var anyReady: Bool { agents.contains { settings.isReady($0) } }
    private var readyIDs: [String] { agents.filter { settings.isReady($0) }.map(\.id) }
    private var agentBusy: Bool { settings.installing != nil || login.isRunning }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 8)
            RasanMark().fill(Color.rasanInk).frame(width: 40, height: 48)
                .padding(.bottom, 18)
            Text("Welcome to RasanAI")
                .font(.system(size: 30, weight: .semibold, design: .rounded))
            Text("Describe a film. RasanAI directs it, start to finish.")
                .font(.system(size: 14)).foregroundStyle(.secondary).padding(.top, 6)

            HStack(spacing: 10) {
                agentTile(.claude)
                agentTile(.codex)
                toolsTile
            }
            .padding(.top, 28)
            .animation(.snappy, value: readyIDs)

            detail.frame(maxWidth: .infinity, minHeight: 130, alignment: .top).padding(.top, 18)
                .animation(.snappy, value: login.isRunning)

            Spacer(minLength: 16)
            Button {
                if settings.isReady(selected) { settings.giveConsent(selected); settings.defaultAgent = selected.id }
                settings.finishWelcome()
                Task { await settings.requestNotificationPermissionIfNeeded() }
            } label: {
                Group {
                    if settings.isReady(selected) { Label("Get started", systemImage: "checkmark.circle.fill") } else { Text("Explore the studio") }
                }.frame(width: 180)
            }
            .buttonStyle(.rasanPrimary).controlSize(.large)
            .keyboardShortcut(.defaultAction)
            if !anyReady {
                Text("You can look around now and set up a director later.")
                    .font(.system(size: 11)).foregroundStyle(.tertiary).padding(.top, 8)
            }
        }
        .padding(.horizontal, 36).padding(.vertical, 28)
        .frame(width: 480, height: 640)
        .tint(.rasan)
        .alert("Director setup", isPresented: Binding(get: { settings.error != nil }, set: { if !$0 { settings.error = nil } })) {
            Button("OK") { settings.error = nil }
        } message: { Text(settings.error ?? "") }
        // Coming back from the browser after signing in: look again without a button press.
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            guard settings.checking.isEmpty, !login.isRunning else { return }
            Task { await recheck() }
        }
        .onChange(of: readyIDs) { pickDirector() }
        .task {
            selected = settings.agent
            async let tools: Void = checkTools()
            await recheck()
            await tools
        }
    }

    /// What matters right now, in one place: the sign-in, the tool install, a problem, or a calm line.
    @ViewBuilder private var detail: some View {
        let problem = agents.compactMap { settings.installErrors[$0.id] }.first
        VStack(alignment: .leading, spacing: 10) {
            if login.isRunning {
                AgentSignInPanel(settings: settings)
            } else {
                if login.error != nil { AgentSignInPanel(settings: settings) }
                if let problem { Text(problem).font(.system(size: 12)).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true) }
                if store.toolSetup.isRunning || store.toolSetup.error != nil { ToolSetupProgress(setup: store.toolSetup) }
                if needsGitSetup && !store.toolSetup.isRunning { DeveloperToolsSetup(store: store) }
                if login.error == nil && problem == nil && !store.toolSetup.isRunning && store.toolSetup.error == nil && !needsGitSetup {
                    Text("Pick Claude or Codex to direct your films. Usage counts toward your plan.")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center).frame(maxWidth: .infinity)
                        .padding(.horizontal, 12)
                }
            }
        }
    }

    /// Runs the readiness check silently so the Tools tile can say what is missing.
    private func checkTools() async {
        guard !store.isDemo else { checkedTools = true; return }
        if store.toolSetup.isRunning { checkedTools = true; return }
        store.preflightProject = nil; store.preflightSources = []
        await store.checkPreflight()
        checkedTools = true
    }

    private func recheck() async {
        for agent in agents { await settings.check(agent) }
        pickDirector()
    }

    /// One ready director is chosen for you; with two, your choice stays unless it stopped being ready.
    private func pickDirector() {
        let ready = agents.filter { settings.isReady($0) }
        if ready.count == 1 { selected = ready[0] }
        else if !settings.isReady(selected) {
            selected = settings.isReady(settings.agent) ? settings.agent : (ready.first ?? agents.first { settings.isInstalled($0) } ?? .claude)
        }
    }

    // MARK: Tiles

    private func agentTile(_ agent: LocalAgent) -> some View {
        let installed = settings.isInstalled(agent)
        let checking = settings.checking.contains(agent.id) || (installed && settings.statuses[agent.id] == nil)
        let installing = settings.installing == agent
        let signing = login.isRunning && login.agent == agent
        let ready = settings.isReady(agent)
        let caption = installing ? "Installing…" : signing ? "Signing in…" : checking ? "Checking…" : ready ? "Ready" : installed ? "Sign in" : "Install"
        return tile(agent == .claude ? "Claude" : "Codex", symbol: agent == .claude ? "sparkle" : "chevron.left.forwardslash.chevron.right",
                    caption: caption, busy: installing || signing || checking, ready: ready, active: ready && selected == agent, badge: ready && selected == agent,
                    enabled: !checking && !installing && !agentBusy || ready && !agentBusy) {
            if !installed { Task { await settings.install(agent) } }
            else if !ready { settings.signIn(agent) }
            else { withAnimation(.snappy) { selected = agent } }
        }
        .contextMenu {
            Button("Use Terminal instead…") { settings.cancelSignIn(); settings.setupInTerminal(agent) }
            Button("Copy setup command") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(settings.setupCommand(for: agent), forType: .string)
            }
        }
    }

    private var toolsTile: some View {
        let running = store.toolSetup.isRunning
        let caption = running ? "Installing…" : toolsChecking ? "Checking…" : toolsReady ? "Ready"
            : missingTools.isEmpty ? "Set up" : missingTools.count == 1 ? "1 to install" : "\(missingTools.count) to install"
        return tile("Tools", symbol: "wrench.and.screwdriver", caption: caption, busy: running || toolsChecking, ready: toolsReady && !running, active: running,
                    badge: false, enabled: !running && !toolsChecking && !toolsReady && store.canInstallTools) {
            // Git comes first: design resources need it, and Apple's installer is shown below the tiles.
            let todo = missingTools.filter { !(needsGitSetup && $0 == .skills) }
            if !todo.isEmpty { store.installTools(todo) }
        }
    }

    private func tile(_ title: String, symbol: String, caption: String, busy: Bool, ready: Bool, active: Bool, badge: Bool, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Group {
                    if busy { ProgressView().controlSize(.regular) }
                    else if ready { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.green) }
                    else { Image(systemName: symbol).foregroundStyle(.secondary) }
                }.font(.system(size: 28)).frame(height: 34)
                Text(title).font(.system(size: 15, weight: .semibold))
                Text(caption).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity, minHeight: 120)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(active ? AnyShapeStyle(.tint) : AnyShapeStyle(Color(nsColor: .separatorColor)), lineWidth: active ? 2 : 1))
            .overlay(alignment: .top) {
                if badge {
                    Text("Director").font(.system(size: 9, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 2).background(Capsule().fill(Color.rasan)).offset(y: -8)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain).disabled(!enabled)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(caption)")
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}
