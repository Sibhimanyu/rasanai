import SwiftUI
import StudioCore

/// Compact inspector for the selected element: colour, text, timing and a transform read-out.
/// A control shows only when the element declares it editable; otherwise the row says "Ask Rasan to change this".
struct DirectInspectorView: View {
    @ObservedObject var model: DirectEditModel
    var close: () -> Void
    @State private var colorHex = ""
    @State private var text = ""
    @State private var startS = ""
    @State private var endS = ""
    @State private var pickedColor = Color.white

    var body: some View {
        if let item = model.selectedItem {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.displayLabel).font(.headline).lineLimit(1)
                        Text(item.elementId).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Button(action: close) { Image(systemName: "xmark") }.buttonStyle(.plain).foregroundStyle(.secondary)
                }
                if item.capability == "raster" || (item.capability != nil && item.capability != "dom") {
                    ask("This layer is flattened footage or a 3D stage; it is edited at clip level.")
                }
                section("Position and size") {
                    if model.canEditTransform, let b = model.draft {
                        Text(String(format: "x %.1f%%   y %.1f%%   w %.1f%%   h %.1f%%   %.0f°", b.cx * 100, b.cy * 100, b.w * 100, b.h * 100, b.rotation))
                            .font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
                        Text("Drag on the film. Arrows nudge 1 px, Shift 10 px.").font(.caption2).foregroundStyle(.tertiary)
                    } else { ask() }
                }
                section("Colour") {
                    if item.canEdit("color") {
                        HStack {
                            ColorPicker("", selection: $pickedColor, supportsOpacity: false).labelsHidden()
                            TextField("#RRGGBB", text: $colorHex).textFieldStyle(.roundedBorder).font(.system(.callout, design: .monospaced))
                            Button("Apply") { Task { await model.commitColor(colorHex) } }.buttonStyle(.rasanSecondary).disabled(!validHex)
                        }
                        .onChange(of: pickedColor) { _, c in colorHex = Self.hexString(c) }
                    } else { ask() }
                }
                if item.kind == "text" || item.canEdit("text") {
                    section("Text") {
                        if item.canEdit("text") {
                            TextField("Text", text: $text, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(1...4)
                            Button("Apply") { Task { await model.commitText(text) } }.buttonStyle(.rasanSecondary).disabled(text.isEmpty)
                        } else { ask() }
                    }
                }
                section("Timing") {
                    if item.canEdit("timing") {
                        HStack {
                            TextField("in s", text: $startS).textFieldStyle(.roundedBorder)
                            TextField("out s", text: $endS).textFieldStyle(.roundedBorder)
                            Button("Apply") { if let a = Double(startS), let b = Double(endS) { Task { await model.commitTiming(start: a, end: b) } } }
                                .buttonStyle(.rasanSecondary).disabled(Double(startS) == nil || Double(endS) == nil)
                        }
                    } else { ask() }
                }
                if let last = model.history.done.last(where: { $0.elementID == item.elementId }), let st = model.opStates[last.id] {
                    Text("Last edit: \(st.rawValue)").font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(14)
            .background(Color.appBackground.opacity(0.94), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.10)))
            .onAppear { load(item) }
            .onChange(of: item.elementId) { _, _ in load(item) }
        }
    }

    private var validHex: Bool { Color.hex(colorHex) != nil }

    private func load(_ item: MotionElementItem) {
        if let c = model.propertyReader.read(item.elementId, "color")?.string { colorHex = c; if let col = Color.hex(c) { pickedColor = col } } else { colorHex = "" }
        text = model.propertyReader.read(item.elementId, "text")?.string ?? ""
        startS = item.activeS.flatMap { $0.first }.map { String(format: "%.2f", $0) } ?? ""
        endS = item.activeS.flatMap { $0.count > 1 ? $0[1] : nil }.map { String(format: "%.2f", $0) } ?? ""
    }

    @ViewBuilder private func section(_ title: String, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            content()
        }
    }
    private func ask(_ text: String = "Ask Rasan to change this") -> some View {
        Text(text).font(.callout).foregroundStyle(.secondary)
    }

    static func hexString(_ c: Color) -> String {
        let n = NSColor(c).usingColorSpace(.sRGB) ?? .white
        return String(format: "#%02X%02X%02X", Int(round(n.redComponent * 255)), Int(round(n.greenComponent * 255)), Int(round(n.blueComponent * 255)))
    }
}
