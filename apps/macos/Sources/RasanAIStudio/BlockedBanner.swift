import AppKit
import StudioCore
import SwiftUI

/// The banner at the top of the film page when Studio stopped one of Rasan's commands: what happened and what to do, in plain words,
/// one primary action (Fix it, or Install for me, or Restart Rasan when the block came back), "Ask Rasan why", and "More" with every
/// other action. The technical reason sits in small print under "What happened".
struct BlockedBanner: View {
    var store: StudioStore
    let block: DirectorBlock
    @State private var showsReason = false

    private var monitor: DirectorMonitor { store.monitor }
    private var installing: Bool { ToolNeedCoordinator.shared.isBusy }
    private var repeated: Bool { monitor.blockRepeatedAfterFix(block) }
    private var installTool: String? {
        guard let tool = block.suggestedTool, ToolNeed(tool: tool, why: "").managedKey != nil else { return nil }
        return tool
    }

    private var title: String { repeated ? "The same block came back" : "Rasan needs permission to continue" }
    private var detail: String {
        if installing { return store.toolSetup.message.isEmpty ? "Installing…" : store.toolSetup.message }
        if repeated { return "Fix it didn't get past it. Restart Rasan to start fresh from your saved film. Nothing is lost." }
        return block.message + " " + (installTool != nil ? "Studio can install the tool for you." : block.whatToDo)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "hand.raised.fill").foregroundStyle(Color(nsColor: .systemOrange)).padding(.top, 1)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 13, weight: .semibold))
                Text(detail).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Button { withAnimation(.snappy(duration: 0.18)) { showsReason.toggle() } } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "chevron.right").font(.system(size: 8, weight: .semibold)).rotationEffect(.degrees(showsReason ? 90 : 0))
                        Text("What happened")
                    }
                    .font(.system(size: 11)).foregroundStyle(.tertiary).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(showsReason ? "Hide what happened" : "Show what happened")
                if showsReason {
                    Text(block.technical).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                        .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            HStack(spacing: 8) {
                Button("Ask Rasan why") { store.film?.askWhyBlocked() }
                    .help("Opens the chat. Studio answers right away from what it can see, without interrupting Rasan.")
                more
                primary
            }
        }
        .padding(.horizontal, Workspace.panelPadding).padding(.vertical, 10)
        .background(Color(nsColor: .systemOrange).opacity(0.12))
        .overlay(alignment: .bottom) { Divider() }
        .padding(.bottom, Workspace.gap)
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    @ViewBuilder private var primary: some View {
        if let tool = installTool, !repeated {
            Button("Install for me") {
                ToolNeedCoordinator.shared.installForMe(ToolNeed(tool: tool, why: "Rasan tried to \(block.action)."), ask: nil, model: store.film)
            }
            .buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction).disabled(installing)
        } else if store.fixRestarts {
            Button("Restart Rasan") { monitor.actions.restart() }
                .buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction)
                .help("Stops Rasan and starts it again from your saved film. Nothing is lost.")
        } else {
            Button("Fix it") { store.fixBlock() }
                .buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction)
                .help("Rasan retries this step a safer way, without the command that was stopped.")
        }
    }

    private var more: some View {
        Menu("More") {
            if installTool != nil { Button("Fix it without installing") { store.fixBlock() } }
            Button("Retry step") { monitor.actions.retry() }
            Button("Restart Rasan") { monitor.actions.restart() }
            Divider()
            Button("View activity") { store.film?.requestActivity() }
            Button("Show log") { monitor.actions.showLog() }
            Button("Chat with Rasan…") { store.film?.beginTell() }
            Divider()
            Button("Copy details") { store.copyBlockDetails() }
            Button("Report a problem…") { StudioFeedback.present() }
        }
        .menuStyle(.borderlessButton).fixedSize()
        .help("Every other way to get past this")
    }
}
