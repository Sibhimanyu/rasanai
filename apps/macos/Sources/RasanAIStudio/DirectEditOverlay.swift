import SwiftUI
import StudioCore

/// Selection overlay for the film frame: pick, move, resize and rotate semantic elements, with a compact inspector.
/// Mount: `if DirectEditModel.isEnabled { DirectEditOverlay(model: model) }` in a ZStack directly over the film player (same frame).
/// Drives `model.time` from the player and calls `model.refresh(index:)` when the element index reloads.
struct DirectEditOverlay: View {
    @ObservedObject var model: DirectEditModel
    @State private var dragStart: CGPoint?
    @State private var inspectorOpen = true
    @FocusState private var focused: Bool

    private let accent = Color.rasan

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            ZStack(alignment: .topLeading) {
                canvas(size: size)
                    .contentShape(Rectangle())
                    .gesture(dragGesture(size: size))
                    .focusable()
                    .focused($focused)
                    .focusEffectDisabled()
                    .onKeyPress(phases: [.down, .repeat]) { press in handleKey(press) }
                VStack(alignment: .leading, spacing: 8) {
                    if model.banner != .none { bannerView }
                    Spacer(minLength: 0)
                    toolbar
                }
                .padding(10)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                if model.selectedItem != nil, inspectorOpen {
                    DirectInspectorView(model: model, close: { inspectorOpen = false })
                        .frame(width: 248)
                        .padding(10)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Direct edit overlay")
    }

    // MARK: Drawing

    private func canvas(size: CGSize) -> some View {
        let film = model.filmSize
        return Canvas { ctx, _ in
            for entry in model.pickable where entry.item.elementId != model.selectedID {
                guard let c = EditGeometry.viewCorners(of: entry.box, viewSize: size, filmSize: film) else { continue }
                ctx.stroke(polygon(c), with: .color(.white.opacity(0.28)), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
            for g in model.guides.x { line(&ctx, from: CGPoint(x: g, y: 0), to: CGPoint(x: g, y: 1), size: size, film: film) }
            for g in model.guides.y { line(&ctx, from: CGPoint(x: 0, y: g), to: CGPoint(x: 1, y: g), size: size, film: film) }
            guard let box = model.draft, model.selectedItem != nil, let c = EditGeometry.viewCorners(of: box, viewSize: size, filmSize: film) else { return }
            let editable = model.canEditTransform
            ctx.stroke(polygon(c), with: .color(accent), style: StrokeStyle(lineWidth: 1.5, dash: editable ? [] : [5, 4]))
            guard editable else { return }
            if let top = EditGeometry.handlePoint(.top, box: box, viewSize: size, filmSize: film),
               let rot = EditGeometry.handlePoint(.rotate, box: box, viewSize: size, filmSize: film) {
                var stem = Path(); stem.move(to: top); stem.addLine(to: rot)
                ctx.stroke(stem, with: .color(accent), lineWidth: 1)
                ctx.fill(Path(ellipseIn: CGRect(x: rot.x - 5, y: rot.y - 5, width: 10, height: 10)), with: .color(accent))
            }
            for h in EditHandle.resizeHandles {
                guard let p = EditGeometry.handlePoint(h, box: box, viewSize: size, filmSize: film) else { continue }
                let r = CGRect(x: p.x - 4.5, y: p.y - 4.5, width: 9, height: 9)
                ctx.fill(Path(roundedRect: r, cornerRadius: 2), with: .color(.white))
                ctx.stroke(Path(roundedRect: r, cornerRadius: 2), with: .color(accent), lineWidth: 1.5)
            }
        }
        .allowsHitTesting(false)
    }

    private func polygon(_ pts: [CGPoint]) -> Path {
        var p = Path(); guard let f = pts.first else { return p }
        p.move(to: f); pts.dropFirst().forEach { p.addLine(to: $0) }; p.closeSubpath(); return p
    }
    private func line(_ ctx: inout GraphicsContext, from a: CGPoint, to b: CGPoint, size: CGSize, film: CGSize) {
        guard let p = EditGeometry.viewPoint(norm: a, viewSize: size, filmSize: film), let q = EditGeometry.viewPoint(norm: b, viewSize: size, filmSize: film) else { return }
        var path = Path(); path.move(to: p); path.addLine(to: q)
        ctx.stroke(path, with: .color(Color.turmeric.opacity(0.9)), lineWidth: 1)
    }

    // MARK: Gestures

    private func dragGesture(size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                let film = model.filmSize
                guard let n = EditGeometry.normPoint(viewPoint: v.location, viewSize: size, filmSize: film) else { return }
                if dragStart == nil {
                    focused = true
                    guard let s = EditGeometry.normPoint(viewPoint: v.startLocation, viewSize: size, filmSize: film) else { return }
                    dragStart = s
                    if let box = model.draft, model.canEditTransform,
                       let h = EditGeometry.hitHandle(viewPoint: v.startLocation, box: box, viewSize: size, filmSize: film) {
                        model.begin(h == .rotate ? .rotate : .resize(h))
                    } else if let box = model.draft, EditGeometry.contains(box, normPoint: s, filmSize: film) {
                        if NSEvent.modifierFlags.contains(.command) { model.pick(at: s, cycle: true) }
                        model.begin(.move)
                    } else if model.pick(at: s) != nil {
                        model.begin(.move)
                    }
                }
                if let s = dragStart {
                    let mods = NSEvent.modifierFlags
                    model.drag(to: n, start: s, shift: mods.contains(.shift), option: mods.contains(.option))
                }
            }
            .onEnded { _ in
                dragStart = nil
                if model.gesture != .none { Task { await model.end() } }   // a plain click only selected; nothing to commit
            }
    }

    private func handleKey(_ press: KeyPress) -> KeyPress.Result {
        let large = press.modifiers.contains(.shift)
        switch press.key {
        case .leftArrow:  model.nudge(dxPixels: -1, dyPixels: 0, large: large)
        case .rightArrow: model.nudge(dxPixels: 1, dyPixels: 0, large: large)
        case .upArrow:    model.nudge(dxPixels: 0, dyPixels: -1, large: large)
        case .downArrow:  model.nudge(dxPixels: 0, dyPixels: 1, large: large)
        case .escape:
            if model.gesture != .none { model.cancelGesture() } else { model.select(nil) }
        default: return .ignored
        }
        return .handled
    }

    // MARK: Chrome

    private var toolbar: some View {
        HStack(spacing: 6) {
            Button { Task { await model.undo() } } label: { Image(systemName: "arrow.uturn.backward") }
                .disabled(!model.canUndo).keyboardShortcut("z", modifiers: .command).help("Undo")
            Button { Task { await model.redo() } } label: { Image(systemName: "arrow.uturn.forward") }
                .disabled(!model.canRedo).keyboardShortcut("z", modifiers: [.command, .shift]).help("Redo")
            if model.selectedItem != nil, !inspectorOpen {
                Button { inspectorOpen = true } label: { Image(systemName: "slider.horizontal.3") }.help("Show inspector")
            }
            if let e = model.history.done.last { Text(e.summary).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
        }
        .buttonStyle(.plain).foregroundStyle(.primary)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.12)))
    }

    private var bannerView: some View {
        let (text, tint): (String, Color) = {
            switch model.banner {
            case .conflict(let t): return (t, .turmeric)
            case .failure(let t): return (t, .red)
            case .info(let t): return (t, .rasan)
            case .none: return ("", .clear)
            }
        }()
        return HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(tint)
            Text(text).font(.callout).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            Button("Dismiss") { model.dismissBanner() }.buttonStyle(.plain).foregroundStyle(.secondary)
        }
        .padding(10).frame(maxWidth: 420, alignment: .leading)
        .background(Color.appBackground.opacity(0.92), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(tint.opacity(0.6)))
    }
}
