import AppKit
import StudioCore
import SwiftUI

/// A compact, narrow panel for one resolved element. Only the fields the index lists as `editable` get controls.
/// "Ask Rasan" builds a MotionEditRequest and calls `onAsk`; the lead wires that to MotionEditEnvelope.send.
struct MotionElementInspector: View {
    static let maxWidth: CGFloat = 300

    let hit: MotionElementHit
    var onAsk: (MotionEditRequest) -> Void
    var onClose: (() -> Void)?

    @State private var draft: MotionEditDraft

    init(hit: MotionElementHit, time: Double, filmVersion: Int?, existingEditIDs: [String],
         onAsk: @escaping (MotionEditRequest) -> Void, onClose: (() -> Void)? = nil) {
        self.hit = hit; self.onAsk = onAsk; self.onClose = onClose
        _draft = State(initialValue: MotionEditDraft(hit: hit, time: time, filmVersion: filmVersion, existingEditIDs: existingEditIDs))
    }

    private var item: MotionElementItem { hit.item }

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(ReviewTheme.hairline).frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    details
                    controls
                    suggestions
                    instruction
                }
                .padding(12)
            }
            Rectangle().fill(ReviewTheme.hairline).frame(height: 1)
            askBar
        }
        .frame(maxWidth: Self.maxWidth)
        .background(ReviewTheme.roomRaised)
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Element inspector for \(item.displayLabel)")
    }

    // MARK: Parts

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: MotionKindName.symbol(item.kind)).foregroundStyle(Color.rasan)
            Text(item.displayLabel).font(.system(size: 13, weight: .semibold)).lineLimit(1)
            Spacer(minLength: 0)
            if let onClose {
                Button(action: onClose) { Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)) }
                    .buttonStyle(.plain).accessibilityLabel("Close inspector").help("Close")
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 3) {
            detail("Kind", MotionKindName.name(item.kind))
            detail("Scene", item.sceneId ?? "unknown")
            if let a = item.activeS, a.count >= 2 { detail("On screen", String(format: "%.1f s to %.1f s", a[0], a[1])) }
        }
        .accessibilityElement(children: .combine)
    }

    private func detail(_ name: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(name).font(.system(size: 11)).foregroundStyle(.secondary).frame(width: 64, alignment: .leading)
            Text(value).font(.system(size: 12)).lineLimit(1)
        }
    }

    @ViewBuilder private var controls: some View {
        if item.canEdit("text") {
            field("Text") {
                TextField("New wording", text: $draft.text, axis: .vertical).lineLimit(1...4).textFieldStyle(.plain)
                    .padding(7).background(fieldBackground).accessibilityLabel("New text")
            }
        }
        if item.canEdit("position") {
            field("Position") {
                HStack(spacing: 10) {
                    nudge("arrow.left", "Nudge left") { draft.dx -= 0.02 }
                    VStack(spacing: 4) {
                        nudge("arrow.up", "Nudge up") { draft.dy -= 0.02 }
                        nudge("arrow.down", "Nudge down") { draft.dy += 0.02 }
                    }
                    nudge("arrow.right", "Nudge right") { draft.dx += 0.02 }
                    Spacer(minLength: 0)
                    Text(String(format: "%+.0f%%, %+.0f%%", draft.dx * 100, draft.dy * 100)).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                    Button("Reset") { draft.dx = 0; draft.dy = 0 }.buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(Color.rasan)
                        .disabled(draft.dx == 0 && draft.dy == 0).accessibilityLabel("Reset position")
                }
            }
        }
        if item.canEdit("scale") {
            field("Scale") {
                HStack {
                    Slider(value: $draft.scale, in: 0.5...2).accessibilityLabel("Scale").accessibilityValue(String(format: "%.0f percent", draft.scale * 100))
                    Text(String(format: "%.0f%%", draft.scale * 100)).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary).frame(width: 40, alignment: .trailing)
                }
            }
        }
        if item.canEdit("color") {
            field("Colour") {
                HStack(spacing: 8) {
                    ColorPicker("", selection: colorBinding, supportsOpacity: false).labelsHidden().accessibilityLabel("Colour")
                    TextField("#RRGGBB", text: hexBinding).textFieldStyle(.plain).font(.system(size: 12, design: .monospaced))
                        .padding(6).background(fieldBackground).accessibilityLabel("Colour as hex")
                    if draft.colorHex != nil {
                        Button("Reset") { draft.colorHex = nil }.buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(Color.rasan)
                    }
                }
            }
        }
        if item.canEdit("motion_preset") {
            field("Motion preset") {
                TextField("e.g. rise, wipe, pop", text: $draft.motionPreset).textFieldStyle(.plain)
                    .padding(7).background(fieldBackground).accessibilityLabel("Motion preset")
            }
        }
    }

    private var suggestions: some View {
        field("Quick suggestions") {
            FlowLayout(spacing: 6) {
                ForEach(MotionQuickSuggestion.allCases.filter { $0.isOffered(for: item) }) { s in
                    Button { draft.apply(s) } label: {
                        Text(s.title).font(.system(size: 11, weight: .medium)).padding(.horizontal, 9).padding(.vertical, 5)
                            .background(Capsule().fill(Color.white.opacity(0.08)))
                    }
                    .buttonStyle(.plain).accessibilityLabel(s.title).accessibilityHint("Fills the instruction")
                }
            }
        }
    }

    private var instruction: some View {
        field("Instruction") {
            TextField("Tell Rasan what to change", text: $draft.instruction, axis: .vertical).lineLimit(2...6).textFieldStyle(.plain)
                .padding(8).background(fieldBackground).accessibilityLabel("Instruction for Rasan")
        }
    }

    private var askBar: some View {
        Button(action: ask) {
            Text("Ask Rasan").font(.system(size: 13, weight: .semibold)).frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent).tint(.rasanFill).controlSize(.large)
        .keyboardShortcut(.return, modifiers: .command)
        .disabled(!draft.canSend)
        .padding(12)
        .accessibilityHint("Sends this change to Rasan. Shortcut Command Return.")
    }

    private func ask() {
        guard draft.canSend else { return }
        onAsk(draft.request())
    }

    // MARK: Helpers

    private var fieldBackground: some View { RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Color.white.opacity(0.06)) }

    private func field<C: View>(_ title: String, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
            content()
        }
    }

    private func nudge(_ symbol: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 10, weight: .bold)).frame(width: 24, height: 20)
                .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(Color.white.opacity(0.08)))
        }
        .buttonStyle(.plain).accessibilityLabel(label)
    }

    private var colorBinding: Binding<Color> {
        Binding(get: { draft.colorHex.flatMap(Color.hex) ?? .white },
                set: { draft.colorHex = Self.hexString($0) })
    }

    private var hexBinding: Binding<String> {
        Binding(get: { draft.colorHex ?? "" },
                set: { draft.colorHex = $0.isEmpty ? nil : $0 })
    }

    static func hexString(_ color: Color) -> String {
        let ns = NSColor(color).usingColorSpace(.sRGB) ?? .white
        func byte(_ v: CGFloat) -> Int { Int((min(max(v, 0), 1) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", byte(ns.redComponent), byte(ns.greenComponent), byte(ns.blueComponent))
    }
}

/// The single hook for the player screen: shows the chooser, the inspector or the fallback for a selection.
struct MotionInspectorPanel: View {
    let selection: MotionSelectionModel
    var filmVersion: Int?
    var existingEditIDs: [String] = []
    var onAsk: (MotionEditRequest) -> Void
    /// The plain note flow (frame and region), used by the fallback.
    var onNote: (String) -> Void

    var body: some View {
        switch selection.state {
        case .none:
            EmptyView()
        case .candidates(let hits):
            MotionElementChooser(hits: hits, onPick: { selection.choose($0) }, onDismiss: { selection.useFrameAndRegion() })
        case .element(let hit):
            MotionElementInspector(hit: hit, time: selection.time, filmVersion: filmVersion, existingEditIDs: existingEditIDs,
                                   onAsk: onAsk, onClose: { selection.clear() })
                .id(hit.id)
        case .fallback(let reason):
            MotionUnindexedFallback(reason: reason, time: selection.time, region: selection.region, onNote: onNote)
        }
    }
}
