import AppKit
import StudioCore
import SwiftUI

/// The conversation with Rasan, grown up out of the bottom pill above its Ask Rasan field. No frame and no header: the
/// messages float over the page on a soft scrim, newest nearest the pill, and the top of the area fades out so older
/// messages dissolve; scrolling up brings them back through the fade (or the side panel shows the lot). The pill's field is
/// the composer. Same rows and state as the side panel (`ConversationList`). Hidden while the side panel is open, in
/// full-screen video, and when closed.
struct AskRasanFloatingChat: View {
    @Bindable var model: FilmSessionModel
    var width: CGFloat
    var maxHeight: CGFloat
    /// Registers the area so a click on it never counts as a click outside.
    var zones: AskClickZones?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @State private var listHeight: CGFloat = 0
    @State private var atBottom = true
    @State private var hovering = false

    static func visible(_ model: FilmSessionModel) -> Bool {
        model.askCardPresented && !model.decisionsPresented && VideoStageOverlay.shared.playback == nil
    }
    private var visible: Bool { Self.visible(model) }

    private let restingTop: CGFloat = 30
    private let bottomPad: CGFloat = 10
    private var overflows: Bool { listHeight + restingTop + bottomPad > maxHeight }
    /// Where older messages dissolve: the top 35% once the conversation is taller than the area; otherwise just the
    /// empty strip above the oldest message, so nothing that fits is ever faded.
    private var fadeHeight: CGFloat { overflows ? maxHeight * 0.35 : restingTop }
    private var topPad: CGFloat { overflows ? fadeHeight + 8 : restingTop }
    private var height: CGFloat { max(restingTop + bottomPad + 20, min(maxHeight, listHeight + topPad + bottomPad)) }

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
        ScrollViewReader { proxy in
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 8) {
                    ConversationList(model: model) { hint }
                    if let mark = model.pendingMark { PendingMarkChip(model: model, mark: mark) }
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { listHeight = $0 }
                .padding(.top, topPad).padding(.bottom, bottomPad).padding(.horizontal, 14)
                .frame(maxWidth: .infinity, alignment: .leading)
                // Pinned to the newest unless the person scrolled up to read.
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named("askChat")).maxY } action: { maxY in
                    atBottom = maxY <= height + 28
                }
            }
            .coordinateSpace(.named("askChat"))
            .scrollIndicators(.automatic)
            .defaultScrollAnchor(.bottom)
            .frame(width: width, height: height)
            .mask(fade)
            .background(alignment: .bottom) { scrim }
            .animation(reduceMotion ? nil : .smooth(duration: 0.25), value: height)
            .onAppear { atBottom = true; proxy.scrollTo("end", anchor: .bottom) }
            .onChange(of: model.conversationSignature) {
                guard atBottom else { return }
                withAnimation(reduceMotion ? nil : .smooth) { proxy.scrollTo("end", anchor: .bottom) }
            }
            .onChange(of: model.pendingMark?.id) { withAnimation(reduceMotion ? nil : .smooth) { proxy.scrollTo("end", anchor: .bottom) } }
        }
        .overlay(alignment: .topTrailing) { controls }
        .background { if let zones { AskClickZone(zones: zones) } }
        .onHover { hovering = $0 }
        .environment(\.colorScheme, .dark)
        .onExitCommand { model.askCardPresented = false }   // Esc tucks it back into the pill; the draft stays
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Conversation with Rasan")
    }

    /// Older messages dissolve into nothing towards the top.
    private var fade: some View {
        let edge = min(0.95, fadeHeight / max(height, 1))
        return LinearGradient(stops: [.init(color: .clear, location: 0),
                                      .init(color: .black.opacity(0.35), location: edge * 0.55),
                                      .init(color: .black, location: edge),
                                      .init(color: .black, location: 1)],
                              startPoint: .top, endPoint: .bottom)
    }

    /// A soft, mostly see-through wash behind the messages so they read over any frame, with no edge of its own: it fades out
    /// at the top and the sides and runs down to meet the pill.
    private var scrim: some View {
        // The wash is fully there a little before the messages are, so a half-faded message never sits on bare page.
        let edge = min(0.9, (fadeHeight * 0.55) / max(height + 8, 1))
        return ZStack {
            Rectangle().fill(.regularMaterial)
            Color.appBackground.opacity(0.78)
        }
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: edge), .init(color: .black, location: 1)],
                             startPoint: .top, endPoint: .bottom))
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.08),
                                     .init(color: .black, location: 0.92), .init(color: .clear, location: 1)],
                             startPoint: .leading, endPoint: .trailing))
        .frame(width: width + 36, height: height + 8)
        .offset(y: 8)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
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

    /// Open in the side panel, and tuck away: shown on hover or while typing (always with VoiceOver).
    private var controls: some View {
        let shown = hovering || model.askFieldFocused || voiceOver
        return HStack(spacing: 2) {
            control("sidebar.trailing", label: "Open in side panel (⌥⌘I)") {
                model.inspectorTab = .chat
                model.askCardPresented = false
                model.decisionsPresented = true
            }
            control("chevron.down", label: "Hide the conversation (Esc)") { model.askCardPresented = false }
        }
        .padding(2)
        .softGlass(in: Capsule(), opacity: 0.8)
        .opacity(shown ? 1 : 0)
        .allowsHitTesting(shown)
        .animation(.easeOut(duration: 0.15), value: shown)
        .padding(.top, 2).padding(.trailing, 2)
    }

    private func control(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
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
