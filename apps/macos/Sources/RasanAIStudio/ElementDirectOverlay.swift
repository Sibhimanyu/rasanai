import AppKit
import StudioCore
import SwiftUI

/// Plan 10 U4/U8: point at an element of the film and change it directly, through the engine. Off by default ("Edit elements" turns it on). While you drag,
/// Studio draws an EPHEMERAL outline (nothing is written); when you let go ONE `motion-edit` action goes through the normal queue carrying the revision you were
/// looking at, and the engine validates and applies it or rejects it. A rejection leaves the picture as saved and says why (RevisionStrip). The pointer goes through
/// the real picture rectangle (`VideoPointerMap`); a stale element index or a different render is never used silently (`PointerResolver`); footage is clip-editable only.
struct ElementDirectOverlay: View {
    let model: FilmSessionModel
    let playback: VideoPlayback

    @State private var editing = false
    @State private var index: ElementIndex?
    @State private var hover: ElementIndexItem?
    @State private var selected: ElementIndexItem?
    @State private var coalescer = DragCoalescer()
    @State private var dragStart: CGPoint?
    @State private var pointedAt = DisplayedRevision()
    @State private var message: String?
    @State private var lastEditID: String?
    @State private var textDraft = ""
    @State private var colorDraft = ""

    /// A render whose picture shape differs from the element index's frame cannot be traced to elements.
    private var shapeMatches: Bool {
        guard let index, let v = playback.videoSize, v.width > 0, v.height > 0 else { return true }
        return abs(v.width / v.height - index.frameSize.width / index.frameSize.height) < 0.01
    }

    var body: some View {
        GeometryReader { box in
            ZStack(alignment: .topLeading) {
                if editing, let index, shapeMatches {
                    layer(index, size: box.size)
                }
                chrome
            }
            .frame(width: box.size.width, height: box.size.height, alignment: .topLeading)
        }
        .task(id: model.runDirectory?.path) { reloadIndex() }
        .onChange(of: model.sendCount) { reloadIndex() }
    }

    // MARK: Controls (buttons: reachable by keyboard, labelled)

    @ViewBuilder private var chrome: some View {
        if let index, index.items.contains(where: { !$0.directEdits.isEmpty }), model.canAct(on: model.shownStep) || model.isDone {
            VStack(alignment: .leading, spacing: 6) {
                Button { editing.toggle(); if !editing { selected = nil; hover = nil; coalescer.cancel(); message = nil } } label: {
                    Label(editing ? "Done editing" : "Edit elements", systemImage: editing ? "checkmark" : "cursorarrow.motionlines").font(.system(size: 11, weight: .medium))
                        .padding(.horizontal, 9).padding(.vertical, 5).background(.black.opacity(0.65), in: Capsule()).foregroundStyle(.white)
                }
                .buttonStyle(.plain).keyboardShortcut("e", modifiers: [.command, .option])
                .help("Point at a title, shape or UI piece and move, resize, recolour or retype it. Footage can only be retimed.")
                .accessibilityLabel(editing ? "Stop editing elements" : "Edit elements on the picture")
                if editing && !shapeMatches {
                    Text("This render is a different shape from the film, so its elements can't be traced. Render again to edit.").font(.system(size: 11)).padding(6).background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 6)).foregroundStyle(.white)
                }
                if editing, let message { Text(message).font(.system(size: 11)).fixedSize(horizontal: false, vertical: true).padding(6).frame(maxWidth: 280, alignment: .leading).background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 6)).foregroundStyle(.white) }
                if editing, let selected { inspector(selected) }
            }
            .padding(10)
        }
    }

    private func inspector(_ item: ElementIndexItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(item.label ?? item.elementID).font(.system(size: 12, weight: .semibold)).lineLimit(1)
            if item.isRaster {
                Text("Footage or a picture: the clip can be retimed, but what is shown inside it is not a separate layer.").font(.system(size: 11))
            } else {
                if item.directEdits.contains("text") {
                    HStack { TextField("Text", text: $textDraft).textFieldStyle(.roundedBorder).font(.system(size: 11)).accessibilityLabel("New text")
                        Button("Apply") { send(MotionEditBuilder.text(reading(item), to: textDraft)) }.disabled(textDraft.isEmpty).controlSize(.small) }
                }
                if item.directEdits.contains("color") {
                    HStack { TextField("#RRGGBB", text: $colorDraft).textFieldStyle(.roundedBorder).font(.system(size: 11)).accessibilityLabel("New colour")
                        Button("Apply") { send(MotionEditBuilder.color(reading(item), to: colorDraft)) }.disabled(colorDraft.isEmpty).controlSize(.small) }
                }
                if item.directEdits.contains("scale") {
                    HStack { Button("Smaller") { send(MotionEditBuilder.resize(reading(item), factor: 0.9)) }; Button("Bigger") { send(MotionEditBuilder.resize(reading(item), factor: 1.1)) } }.controlSize(.small)
                }
                if item.directEdits.contains("position") {
                    HStack(spacing: 4) {
                        ForEach([("arrow.left", -0.01, 0.0, "Nudge left"), ("arrow.right", 0.01, 0.0, "Nudge right"), ("arrow.up", 0.0, -0.01, "Nudge up"), ("arrow.down", 0.0, 0.01, "Nudge down")], id: \.3) { symbol, dx, dy, label in
                            Button { send(MotionEditBuilder.move(reading(item), dx: dx, dy: dy)) } label: { Image(systemName: symbol) }.accessibilityLabel(label).help(label)
                        }
                    }.controlSize(.small)
                }
            }
            if let lastEditID {
                Button("Undo last edit") { send(MotionEditBuilder.revert(of: lastEditID, reading(item)), remember: false) }.controlSize(.small)
                    .help("Undoes your last edit if nothing else changed that element since; otherwise it tells you and offers a safe alternative.")
            }
        }
        .padding(8).frame(maxWidth: 280, alignment: .leading).background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 8)).foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
    }

    // MARK: The pointer layer

    private func geometry(_ index: ElementIndex, _ size: CGSize) -> VideoViewGeometry {
        VideoViewGeometry(viewSize: size, frameSize: index.frameSize, fit: .fit, backingScale: NSScreen.main?.backingScaleFactor ?? 2)
    }

    private func layer(_ index: ElementIndex, size: CGSize) -> some View {
        let g = geometry(index, size)
        let t = playback.time
        let live = coalescer.isDragging ? selected ?? hover : hover
        return ZStack(alignment: .topLeading) {
            Color.clear.contentShape(Rectangle())
                .onContinuousHover { phase in
                    guard !coalescer.isDragging else { return }
                    switch phase {
                    case .active(let p):
                        if let m = VideoPointerMap.map(p, in: g), m.onPicture { hover = index.candidates(at: t, frameNorm: m.frameNorm).first } else { hover = nil }
                    case .ended: hover = nil
                    }
                }
                .gesture(DragGesture(minimumDistance: 0).onChanged { value in dragChanged(value, index, g) }.onEnded { value in dragEnded(value, index, g) })
            if let live, let rect = index.normalisedRect(of: live, at: t), let box = VideoPointerMap.viewRect(forFrameNorm: rect, in: g) {
                let o = coalescer.previewOffset
                let moved = coalescer.isDragging ? CGRect(x: box.minX + o.dx * g.frameSize.width * scaleOf(g), y: box.minY + o.dy * g.frameSize.height * scaleOf(g), width: box.width, height: box.height) : box
                RoundedRectangle(cornerRadius: 2).strokeBorder(style: StrokeStyle(lineWidth: 2, dash: coalescer.isDragging ? [6, 3] : [])).foregroundStyle(Color.rasan)
                    .frame(width: moved.width, height: moved.height).offset(x: moved.minX, y: moved.minY).allowsHitTesting(false)
                Text(coalescer.isDragging ? "Moving \(live.label ?? live.elementID): release to apply" : (live.label ?? live.elementID))
                    .font(.system(size: 10, weight: .semibold)).padding(.horizontal, 5).padding(.vertical, 2).background(.black.opacity(0.75), in: Capsule()).foregroundStyle(.white)
                    .offset(x: moved.minX, y: max(0, moved.minY - 18)).allowsHitTesting(false)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Film picture in edit mode. Click an element to select it, drag to move it. Use the buttons for exact changes.")
        .accessibilityAddTraits(.allowsDirectInteraction)
    }

    /// view points per frame pixel (the picture's drawn scale)
    private func scaleOf(_ g: VideoViewGeometry) -> CGFloat {
        guard let c = VideoPointerMap.contentRect(g) else { return 1 }
        return c.width / (g.frameSize.width * g.visibleCrop.width)
    }

    private func dragChanged(_ value: DragGesture.Value, _ index: ElementIndex, _ g: VideoViewGeometry) {
        guard let m = VideoPointerMap.map(value.location, in: g) else { return }
        if !coalescer.isDragging {
            guard m.onPicture else { return }
            pointedAt = displayed(index)
            let now = displayed(index)
            switch PointerResolver.resolve(index: index, time: playback.time, frameNorm: m.frameNorm, pointed: pointedAt, current: now) {
            case .element(let item):
                // only elements that can be moved start a drag; the click still selects
                selected = item; message = nil
                textDraft = ""; colorDraft = ""
                if item.directEdits.contains("position") { coalescer.begin(reading(item), at: m.frameNorm) }
            case .regionOnly(let reason), .none(let reason): selected = nil; message = reason
            }
        } else { coalescer.update(to: m.frameNorm) }
    }

    private func dragEnded(_ value: DragGesture.Value, _ index: ElementIndex, _ g: VideoViewGeometry) {
        guard coalescer.isDragging, let item = selected else { coalescer.cancel(); return }
        if let m = VideoPointerMap.map(value.location, in: g) { coalescer.update(to: m.frameNorm) }
        // the revision must still be the one the person was looking at when they grabbed it
        let current = displayed(index)
        if pointedAt.renderRevisionID != current.renderRevisionID || pointedAt.indexBuildDigest != current.indexBuildDigest {
            coalescer.cancel(); message = "The picture changed while you were dragging, so nothing was changed. Pick the element again."; return
        }
        guard let tx = coalescer.commit() else { return } // a click, not a drag
        send(MotionEditBuilder.move(tx.reading, dx: tx.dx, dy: tx.dy, id: tx.editID), item: item)
    }

    // MARK: Sending (one transaction per gesture)

    private func displayed(_ index: ElementIndex) -> DisplayedRevision {
        let latest = model.runDirectory.flatMap { RevisionLog.read(run: $0).first { $0.stage == .finalReady || $0.stage == .previewReady } }
        return DisplayedRevision(renderRevisionID: latest?.revisionID, outputChecksum: latest?.receiptChecksum, indexBuildDigest: index.buildDigest, filmVersion: index.filmVersion)
    }

    private func reading(_ item: ElementIndexItem) -> ElementReading {
        let d = index.map(displayed) ?? DisplayedRevision()
        return ElementReading(elementID: item.elementID, sceneID: item.sceneID, time: playback.time, filmVersion: d.filmVersion, buildDigest: d.indexBuildDigest, elementDigest: nil, renderRevisionID: d.renderRevisionID)
    }

    private func send(_ edit: JSONValue, item: ElementIndexItem? = nil, remember: Bool = true) {
        let id = edit.object["id"]?.string
        Task {
            let ok = await model.send(step: "render", type: "motion-edit", value: MotionEditBuilder.actionValue(edit))
            if ok { if remember { lastEditID = id }; message = "Sent. The engine will apply it to the source; the picture changes after a new preview renders." }
            else { message = model.lastError ?? "Could not send the edit." }
        }
    }

    private func reloadIndex() {
        guard let run = model.runDirectory else { return }
        let roots = [model.workspaceDirectory, run.deletingLastPathComponent().deletingLastPathComponent()].compactMap { $0 }
        for root in roots { if let found = ElementIndex.read(project: root) { index = found; return } }
        index = nil
    }
}
