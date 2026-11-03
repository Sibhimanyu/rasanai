import AppKit
import StudioCore
import SwiftUI

/// The banner at the top of the film page when Studio stopped one of Rasan's commands: a doorway to the chat. It says what happened in a
/// sentence and offers "Talk to Rasan" and "Later"; Rasan does the rest in the conversation (retry, restart, check or install a tool, carry
/// on without it). It goes away the moment the block is over.
struct BlockedBanner: View {
    var store: StudioStore
    let block: DirectorBlock

    private var id: String { block.toolNeed.map { "tool:\($0.tool)" } ?? "block:" + block.id }

    var body: some View {
        if store.doorwayOpen(id) {
            let item = store.film?.incidents.item(id)
            IncidentDoorway(symbol: block.isInstall ? "wrench.and.screwdriver.fill" : "hand.raised.fill", title: item?.title ?? "Rasan was blocked",
                            summary: item?.summary ?? block.message + " Talk to Rasan to get past it.", fallback: store.doorwayActions(id),
                            talk: { store.talkAbout(id) }, later: { store.laterAbout(id) })
                .doorwayBanner()
        }
    }
}

/// The banner at the top of the film page when Rasan closed the person's Story or Look call without them (`SessionSnapshot.unconfirmedCall`):
/// "Review the look" opens that stage (where "Change this…" redoes it), "Keep it" accepts Rasan's choice and hides the banner for that decision.
struct UnconfirmedCallBanner: View {
    var store: StudioStore
    let call: UnconfirmedCall
    @AppStorage("unconfirmedCallsKept") private var kept = ""

    private var key: String { "\(store.runURL?.path ?? "")|\(call.step)|\(call.updated)" }
    private var isKept: Bool { kept.split(separator: "\n").contains { $0 == key } }

    var body: some View {
        if !isKept {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "person.fill.questionmark").foregroundStyle(Color(nsColor: .systemOrange)).padding(.top, 1)
                VStack(alignment: .leading, spacing: 3) {
                    Text(call.title).font(.system(size: 13, weight: .semibold))
                    Text(call.decision.isEmpty ? "This was your call to make. Look at what Rasan picked and change it if it isn't right." : "Rasan picked: \(call.decision)")
                        .font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                HStack(spacing: 8) {
                    Button("Keep it") { keep() }
                        .help("Keep Rasan's choice. The film carries on as it is.")
                    Button(call.reviewLabel) { store.film?.view(call.stage) }
                        .buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction)
                        .help("Opens this step. Use Change this… there to pick it yourself.")
                }
            }
            .padding(.horizontal, Workspace.panelPadding).padding(.vertical, 10)
            .background(Color(nsColor: .systemOrange).opacity(0.12))
            .overlay(alignment: .bottom) { Divider() }
            .padding(.bottom, Workspace.gap)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private func keep() {
        withAnimation(.snappy(duration: 0.18)) {
            kept = (kept.split(separator: "\n").map(String.init).suffix(200) + [key]).joined(separator: "\n")
        }
    }
}
