import AppKit
import StudioCore
import SwiftUI

/// A contained, scrollable conversation panel with its composer inside the panel. The draft is shared with the bottom-bar
/// entry field and side panel (`ConversationList`). Hidden while the side panel is open, in full-screen video, and when closed.
struct AskRasanFloatingChat: View {
    @Bindable var model: FilmSessionModel
    var width: CGFloat
    var maxHeight: CGFloat
    /// Registers the area so a click on it never counts as a click outside.
    var zones: AskClickZones?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var listHeight: CGFloat = 0
    @State private var composerHeight: CGFloat = 44
    @State private var atBottom = true

    static func visible(_ model: FilmSessionModel) -> Bool {
        model.askCardPresented && !model.decisionsPresented && VideoStageOverlay.shared.playback == nil
    }
    private var visible: Bool { Self.visible(model) }

    private let headerHeight: CGFloat = 38
    private var height: CGFloat { min(maxHeight, max(120, listHeight + headerHeight + composerHeight + 16)) }
    private var scrollHeight: CGFloat { max(32, height - headerHeight - composerHeight) }

    var body: some View {
        Group {
            if visible {
                area.transition(reduceMotion ? .opacity
                                : .scale(scale: 0.94, anchor: .bottomTrailing).combined(with: .opacity).combined(with: .offset(y: 10)))
            }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.12) : .spring(response: 0.36, dampingFraction: 0.86), value: visible)
    }

    private var area: some View {
        VStack(spacing: 0) {
            header.frame(height: headerHeight)
            Divider().opacity(0.65)
            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 8) {
                        ConversationList(model: model) { hint }
                        if let mark = model.pendingMark { PendingMarkChip(model: model, mark: mark) }
                    }
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { listHeight = $0 }
                    .padding(.vertical, 8).padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // Pinned to the newest unless the person scrolled up to read.
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named("askChat")).maxY } action: { maxY in
                        atBottom = maxY <= scrollHeight + 28
                    }
                }
                .coordinateSpace(.named("askChat"))
                .scrollIndicators(.automatic)
                .defaultScrollAnchor(.bottom)
                .frame(width: width, height: scrollHeight)
                .animation(reduceMotion ? nil : .smooth(duration: 0.25), value: scrollHeight)
                .onAppear { atBottom = true; proxy.scrollTo("end", anchor: .bottom) }
                .onChange(of: model.conversationSignature) {
                    guard atBottom else { return }
                    withAnimation(reduceMotion ? nil : .smooth) { proxy.scrollTo("end", anchor: .bottom) }
                }
                .onChange(of: model.pendingMark?.id) { withAnimation(reduceMotion ? nil : .smooth) { proxy.scrollTo("end", anchor: .bottom) } }
            }
            Divider().opacity(0.65)
            AskRasanField(model: model, mode: .row, compact: .constant(false))
                .padding(.horizontal, 10).padding(.vertical, 7)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { measured in
                    guard abs(composerHeight - measured) > 1 else { return }
                    composerHeight = measured
                }
        }
        .frame(width: width, height: height)
        .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.white.opacity(0.13), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.28), radius: 18, x: 0, y: 8)
        .animation(reduceMotion ? nil : .smooth(duration: 0.25), value: height)
        .background { if let zones { AskClickZone(zones: zones) } }
        .environment(\.colorScheme, .dark)
        .onExitCommand { model.askCardPresented = false }   // Esc tucks it back into the pill; the draft stays
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Conversation with Rasan")
    }

    /// Empty: one friendly line, as Rasan.
    private var hint: some View {
        HStack(spacing: 8) {
            RasanMark().fill(Color.rasanInk.opacity(0.85)).frame(width: 11, height: 14).accessibilityHidden(true)
            Text("Tell me what to change. I'll keep it with the \(StepCatalog.label(model.draftStep)).")
                .font(.system(size: 12.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 4)
    }

    /// A visible title and close action keep the panel's purpose and dismissal discoverable.
    private var header: some View {
        HStack(spacing: 8) {
            RasanMark().fill(Color.rasanInk.opacity(0.9)).frame(width: 11, height: 14).accessibilityHidden(true)
            Text("Ask Rasan").font(.system(size: 12, weight: .semibold))
            Spacer(minLength: 4)
            control("sidebar.trailing", label: "Open in side panel (⌥⌘I)") {
                model.inspectorTab = .chat
                model.askCardPresented = false
                model.decisionsPresented = true
            }
            control("xmark", label: "Close conversation (Esc)") { model.askCardPresented = false }
        }
        .padding(.horizontal, 12)
        .accessibilityElement(children: .contain)
    }

    private func control(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                .frame(width: 24, height: 22).contentShape(Rectangle())
        }
        .buttonStyle(.plain).help(label).accessibilityLabel(label)
    }
}

// MARK: Click outside

/// The places a click keeps the chat open (the pill and the conversation), and what to do on a click anywhere else.
@MainActor final class AskClickZones {
    let views = NSHashTable<NSView>.weakObjects()
    var onOutside: (() -> Void)?
}

/// Marks its frame as part of the Ask Rasan chat; with `watches`, also watches clicks in the window without consuming them.
struct AskClickZone: NSViewRepresentable {
    let zones: AskClickZones
    var watches = false
    func makeNSView(context: Context) -> AskClickZoneView {
        let view = AskClickZoneView()
        view.zones = zones
        view.watches = watches
        return view
    }
    func updateNSView(_ view: AskClickZoneView, context: Context) { view.zones = zones }
}

final class AskClickZoneView: NSView {
    weak var zones: AskClickZones?
    var watches = false
    private var monitor: Any?
    override var isOpaque: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        removeMonitor()
        guard window != nil else { return }
        zones?.views.add(self)
        guard watches else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            MainActor.assumeIsolated { self?.check(event) }
            return event
        }
    }
    override func viewWillMove(toWindow newWindow: NSWindow?) {
        if newWindow == nil { removeMonitor(); zones?.views.remove(self) }
        super.viewWillMove(toWindow: newWindow)
    }
    isolated deinit { if let monitor { NSEvent.removeMonitor(monitor) } }
    private func removeMonitor() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }
    private func check(_ event: NSEvent) {
        guard let window, event.window === window, window.attachedSheet == nil, let zones else { return }
        let inside = zones.views.allObjects.contains { view in
            view.window === window && !view.isHiddenOrHasHiddenAncestor && view.bounds.contains(view.convert(event.locationInWindow, from: nil))
        }
        if !inside { zones.onOutside?() }
    }
}
