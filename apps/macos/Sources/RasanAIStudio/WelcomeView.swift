import AppKit
import SwiftUI
import StudioCore

/// First-launch setup. One calm screen: it finds your director, then you are in.
struct WelcomeView: View {
    @Bindable var store: StudioStore
    @State private var selected: LocalAgent = .claude
    private var settings: StudioSettings { store.settings }
    private var agents: [LocalAgent] { [.claude, .codex] }
    private var anyReady: Bool { agents.contains { settings.isReady($0) } }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 8)
            RasanMark().fill(Color.rasanInk).frame(width: 40, height: 48)
                .padding(.bottom, 18)
            Text("Welcome to RasanAI")
                .font(.system(size: 30, weight: .semibold, design: .rounded))
            Text("Describe a film. RasanAI directs it, start to finish.")
                .font(.system(size: 14)).foregroundStyle(.secondary).padding(.top, 6)

            VStack(spacing: 0) {
                row(.claude, optional: false)
                Divider().padding(.leading, 52)
                row(.codex, optional: true)
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(nsColor: .separatorColor)))
            .padding(.top, 28)

            Text("RasanAI directs films with your Claude Code or Codex account. Usage counts toward your plan.")
                .font(.system(size: 12)).foregroundStyle(.secondary)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 16).padding(.horizontal, 12)
            HStack {
                Button("Recheck") { Task { await recheck() } }
                    .disabled(!settings.checking.isEmpty)
                if settings.isReady(selected) {
                    Label("Ready to make films", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                } else {
                    Text("Set up either director, then recheck.").foregroundStyle(.secondary)
                }
            }.font(.system(size: 12)).padding(.top, 12)

            Spacer(minLength: 16)
            Button {
                if settings.isReady(selected) { settings.giveConsent(selected); settings.defaultAgent = selected.id }
                settings.finishWelcome()
            } label: {
                Text(settings.isReady(selected) ? "Get started" : "Explore the studio").frame(width: 180)
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            .keyboardShortcut(.defaultAction)
            if !anyReady {
                Text("You can look around now and set up a director later.")
                    .font(.system(size: 11)).foregroundStyle(.tertiary).padding(.top, 8)
            }
        }
        .padding(.horizontal, 36).padding(.vertical, 28)
        .frame(width: 480, height: 540)
        .tint(.rasan)
        .alert("Director setup", isPresented: Binding(get: { settings.error != nil }, set: { if !$0 { settings.error = nil } })) {
            Button("OK") { settings.error = nil }
        } message: { Text(settings.error ?? "") }
        .task {
            selected = settings.agent
            await recheck()
        }
    }

    private func recheck() async {
        for agent in agents { await settings.check(agent) }
        if !settings.isReady(selected) {
            selected = settings.isReady(settings.agent) ? settings.agent : (agents.first { settings.isReady($0) } ?? agents.first { settings.isInstalled($0) } ?? .claude)
        }
    }

    private func signedIn(_ agent: LocalAgent) -> Bool {
        settings.isReady(agent)
    }

    private func row(_ agent: LocalAgent, optional: Bool) -> some View {
        let installed = settings.isInstalled(agent)
        let checking = settings.checking.contains(agent.id)
        let choosable = installed
        return HStack(spacing: 12) {
            Group {
                if checking { ProgressView().controlSize(.small) }
                else if installed {
                    Image(systemName: signedIn(agent) ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        .foregroundStyle(signedIn(agent) ? Color.green : Color.orange)
                } else {
                    Image(systemName: "circle.dashed").foregroundStyle(.tertiary)
                }
            }.font(.system(size: 18)).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(agent == .claude ? "Claude Code" : "Codex").font(.system(size: 13, weight: .medium))
                Text(subtitle(agent, installed: installed, checking: checking, optional: optional))
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Spacer()
            if installed && !checking && !signedIn(agent) {
                Button("Sign in…") { settings.setupInTerminal(agent) }
                    .controlSize(.small)
            } else if !installed {
                Button("Install…") { settings.setupInTerminal(agent) }.controlSize(.small)
            } else if choosable {
                Image(systemName: selected == agent ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected == agent ? AnyShapeStyle(.tint) : AnyShapeStyle(.tertiary))
                    .font(.system(size: 16))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
        .onTapGesture { if choosable { withAnimation(.snappy) { selected = agent } } }
        .contextMenu {
            Button("Copy setup command") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(settings.setupCommand(for: agent), forType: .string)
            }
        }
    }

    private func subtitle(_ agent: LocalAgent, installed: Bool, checking: Bool, optional: Bool) -> String {
        if checking { return "Checking…" }
        if !installed { return optional ? "Optional · not found" : "Not found" }
        return signedIn(agent) ? "Found · signed in" : (settings.statuses[agent.id] ?? "Found · recheck sign-in")
    }
}
