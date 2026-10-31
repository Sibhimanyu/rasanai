import AppKit
import StudioCore
import SwiftUI

/// The style frames call: "Do these frames look like the film?" A grid of frames in story order, each with the reference
/// still it was measured against beside it (when the director sent one), a comment, and a redo mark. The primary button
/// reads from what is marked: "Approve all 8 frames", or "Redo 2 frames" with the comments as the note.
///
/// Reads the `styleframes` payload (`StyleframesPayload`): `frames` with `ref` and `shot`, or the older `images` / `captions`.
/// Actions: `approve`, `redo {ids, note}`, and one `comment` per commented frame (the frame id is the comment's scene).
struct StyleframesStage: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var review = StyleframeReview()
    @Environment(\.momentStore) private var store
    /// The frame whose move is being swapped from the gallery picker.
    @State private var swapping: String?

    private var data: StyleframesPayload { StyleframesPayload(model.payload(step)) }
    private var aspect: CGFloat { CGFloat(model.snapshot.aspectRatio) }
    private var canAct: Bool { model.canAct(on: step) }

    var body: some View {
        let concepts = StyleframeConcept.parse(model.payload(step))
        if !concepts.isEmpty {
            StyleframeConceptsView(model: model, step: step, concepts: concepts)
        } else {
            framesBody
        }
    }

    @ViewBuilder private var framesBody: some View {
        let data = data
        let frames = data.frames
        VStack(alignment: .leading, spacing: 22) {
            if frames.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "photo.on.rectangle.angled").font(.system(size: 26, weight: .light)).foregroundStyle(.tertiary)
                    Text("Style frames appear here").font(.system(size: 14, weight: .medium))
                    Text("Key frames of your film, designed in the chosen look, for you to approve before anything moves.")
                        .font(.system(size: 12)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                .padding(28).frame(maxWidth: .infinity)
                .background(Color(nsColor: .quaternaryLabelColor).opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                header(data)
                let heroes = frames.filter { data.heroes.contains($0.id) }
                let rest = frames.filter { !data.heroes.contains($0.id) }
                if !heroes.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        StageSectionTitle("Key frames")
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 460, maximum: 800), spacing: 20, alignment: .top)], alignment: .leading, spacing: 22) {
                            ForEach(heroes) { tile($0, number: number(of: $0, in: frames), large: true) }
                        }
                    }
                }
                if !rest.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        if !heroes.isEmpty { StageSectionTitle("Other frames") }
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 340, maximum: 560), spacing: 20, alignment: .top)], alignment: .leading, spacing: 22) {
                            ForEach(rest) { tile($0, number: number(of: $0, in: frames), large: false) }
                        }
                    }
                }
                if !data.unplaced.isEmpty { unplacedList(data.unplaced) }
                // Registers the pinned primary button: it reads from what is marked.
                Color.clear.frame(maxWidth: .infinity, minHeight: 1, maxHeight: 1)
                    .stepPrimary(review.primaryTitle(frames: frames.count), symbol: review.redo.isEmpty ? "checkmark" : "arrow.triangle.2.circlepath", enabled: canAct) { note in
                        submit(frames: frames, note: note)
                    }
            }
        }
        .sheet(isPresented: Binding(get: { store?.gallery.viewingID != nil }, set: { if !$0 { store?.gallery.closeViewer() } })) {
            if let store {
                MomentViewer(gallery: store.gallery, selection: Binding(get: { store.inspirePicks }, set: { store.inspirePicks = $0 })).frame(minWidth: 980, minHeight: 560)
            }
        }
        .sheet(isPresented: Binding(get: { swapping != nil }, set: { if !$0 { swapping = nil } })) {
            if let store, let frameID = swapping {
                MomentPickerSheet(gallery: store.gallery, mine: store.inspirePicks.picks, onPick: { moment in swap(frame: frameID, to: moment.id); swapping = nil }, onCancel: { swapping = nil })
            }
        }
        .task { if let store { store.gallery.prime(); await store.gallery.loadIfNeeded() } }
        .onChange(of: frames.map(\.id)) { _, ids in
            // A redo came back with new frames: forget marks and comments for frames that are gone.
            review.redo = review.redo.intersection(ids)
            review.comments = review.comments.filter { ids.contains($0.key) }
        }
    }

    private func number(of frame: Styleframe, in frames: [Styleframe]) -> Int { (frames.firstIndex { $0.id == frame.id } ?? 0) + 1 }

    // MARK: Header

    private func header(_ data: StyleframesPayload) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(review.counter(frames: data.frames.count)).font(.system(size: 13, weight: .semibold))
            if data.belowCount > 0 {
                Label("\(data.belowCount) not as good as their reference", systemImage: "exclamationmark.circle")
                    .font(.system(size: 12)).foregroundStyle(Color(nsColor: .systemOrange))
            }
            if data.hasReferences {
                Text("Each frame sits next to the reference still it was measured against.").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            Spacer()
            if let sheet = data.sheet, let url = model.fileURL(sheet) {
                Button { SafeOpen.open(url) } label: { Label("Open the comparison sheet", systemImage: "rectangle.split.2x1") }
                    .buttonStyle(.link).font(.system(size: 12))
            }
        }
    }

    // MARK: Tiles

    private func tile(_ frame: Styleframe, number: Int, large: Bool) -> some View {
        let marked = review.redo.contains(frame.id)
        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 10) {
                image(frame.image, ratio: aspect, radius: 10, maxPixels: 1600)
                    .overlay(alignment: .topLeading) {
                        Text("\(number)").font(.system(size: 11, weight: .bold).monospacedDigit())
                            .padding(.horizontal, 7).padding(.vertical, 3).background(.ultraThinMaterial, in: Capsule()).padding(8)
                    }
                    .overlay { if frame.isWorking { redrawing } }
                    .shadow(color: .black.opacity(0.14), radius: 10, y: 4)
                    .contextMenu {
                        if let url = model.fileURL(frame.image) {
                            Button("Open in Preview") { SafeOpen.open(url) }
                            Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                        }
                    }
                    .onTapGesture(count: 2) { if let url = model.fileURL(frame.image) { SafeOpen.open(url) } }
                if let ref = frame.ref {
                    VStack(alignment: .leading, spacing: 4) {
                        image(ref.image, ratio: aspect, radius: 7, maxPixels: 700)
                        Text("Reference").font(.system(size: 10, weight: .semibold)).tracking(0.4).foregroundStyle(.secondary).textCase(.uppercase)
                        if let source = ref.source { Text(source).font(.system(size: 10)).foregroundStyle(.tertiary).lineLimit(2) }
                    }
                    .frame(width: large ? 170 : 112)
                    .help(ref.why ?? "The reference still this frame is judged against.")
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Reference for \(frame.title)\(ref.source.map { ", from \($0)" } ?? "")")
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(frame.title).font(.system(size: 13, weight: .semibold)).lineLimit(2)
                if let verdict = frame.verdict { verdictBadge(verdict) }
                Spacer(minLength: 0)
            }
            if let shot = frame.shot, !shot.summary.isEmpty {
                Text(shot.summary).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
            }
            if let caption = frame.caption, !caption.isEmpty, caption != frame.title {
                Text(caption).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if let why = frame.ref?.why, !why.isEmpty {
                Text(why).font(.system(size: 11)).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true)
            }
            momentRow(frame)
            HStack(spacing: 8) {
                // A checkbox states a per-frame mark; the old Keep/Redo button showed the state but its click did the opposite.
                Toggle("Redo this frame", isOn: Binding(get: { marked }, set: { _ in toggleRedo(frame.id) }))
                    .toggleStyle(.checkbox).font(.system(size: 12, weight: .medium)).disabled(!canAct)
                    .help(marked ? "This frame will be redrawn. Untick to keep it." : "Tick to have this frame redrawn.")
                TextField("Comment", text: Binding(get: { review.comments[frame.id] ?? "" }, set: { review.comments[frame.id] = $0 }))
                    .textFieldStyle(.plain).font(.system(size: 12)).disabled(!canAct)
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(Color(nsColor: .textBackgroundColor).opacity(0.7), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                    .accessibilityLabel("Comment on \(frame.title)")
            }
        }
        .padding(12)
        .cardSurface(selected: marked)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Style frame \(number): \(frame.title)")
    }

    // MARK: Moves on the boards

    /// The move placed on this frame (still, name, why; opens the viewer) with Swap, or just Swap when none is placed.
    @ViewBuilder private func momentRow(_ frame: Styleframe) -> some View {
        if frame.moment != nil || store != nil {
            HStack(alignment: .top, spacing: 10) {
                if let moment = frame.moment {
                    let known = store?.gallery.moment(moment.id)
                    Button { if known != nil { store?.gallery.openViewer(moment.id) } } label: {
                        HStack(alignment: .top, spacing: 8) {
                            Group {
                                if let known { MomentStill(url: known.stillURL, maxPixels: 200) }
                                else if let still = moment.still { PayloadImage(path: still, contentMode: .fill, maxPixels: 200) }
                                else { Color.primary.opacity(0.06) }
                            }
                            .frame(width: 64, height: 36).clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(moment.name).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                                if let why = moment.why, !why.isEmpty { Text(why).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.leading) }
                                if let credit = moment.credit, !credit.isEmpty { Text(credit).font(.system(size: 10)).foregroundStyle(.tertiary).lineLimit(1) }
                            }
                        }
                    }
                    .buttonStyle(.plain).help(known != nil ? "Watch this move, with sound" : moment.why ?? moment.name)
                    .accessibilityLabel("Move on this frame: \(moment.name)")
                } else {
                    Text("No move on this frame").font(.system(size: 11)).foregroundStyle(.tertiary)
                }
                Spacer(minLength: 0)
                if store != nil { swapMenu(frame) }
            }
        }
    }

    private func swapMenu(_ frame: Styleframe) -> some View {
        Menu {
            if let store {
                let mine = store.inspirePicks.picks.compactMap { store.gallery.moment($0.id) }.filter { $0.id != frame.moment?.id }
                if !mine.isEmpty {
                    Section("Your moves") { ForEach(mine) { moment in Button(moment.name) { swap(frame: frame.id, to: moment.id) } } }
                }
                Button("Choose from the gallery…") { swapping = frame.id }
                if frame.moment != nil { Divider(); Button("None") { swap(frame: frame.id, to: nil) } }
            }
        } label: { Label("Swap", systemImage: "arrow.left.arrow.right").font(.system(size: 11, weight: .medium)) }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().disabled(!canAct)
        .foregroundStyle(.secondary).help("Put a different move on this frame, or none")
    }

    private func unplacedList(_ items: [UnplacedMoment]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            StageSectionTitle("Not used yet")
            Text("These moves did not fit any frame. Swap one onto a frame above if you want it used.").font(.system(size: 12)).foregroundStyle(.secondary)
            ForEach(items) { item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.name).font(.system(size: 12, weight: .semibold))
                    if let why = item.why, !why.isEmpty { Text(why).font(.system(size: 11)).foregroundStyle(.secondary) }
                }
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
        .accessibilityElement(children: .combine)
    }

    private func swap(frame: String, to id: String?) {
        Task { await model.send(step: step, type: "swap-moment", value: StyleframeReview.swapValue(frame: frame, moment: id)) }
    }

    private func image(_ path: String, ratio: CGFloat, radius: CGFloat, maxPixels: CGFloat) -> some View {
        Color.clear.aspectRatio(ratio, contentMode: .fit)
            .overlay { PayloadImage(path: path, contentMode: .fill, maxPixels: maxPixels) }
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5) }
    }

    private var redrawing: some View {
        ZStack {
            Color.black.opacity(0.35)
            Label("Redrawing…", systemImage: "arrow.triangle.2.circlepath").font(.system(size: 12, weight: .medium)).foregroundStyle(.white)
                .padding(.horizontal, 12).padding(.vertical, 6).background(.black.opacity(0.55), in: Capsule())
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func verdictBadge(_ verdict: StyleframeVerdict) -> some View {
        let tint: Color = switch verdict {
        case .atPar: Color(nsColor: .systemGreen)
        case .close: Color(nsColor: .systemOrange)
        case .below: Color(nsColor: .systemRed)
        }
        return Text(verdict.title).font(.system(size: 10, weight: .semibold)).foregroundStyle(tint)
            .padding(.horizontal, 7).padding(.vertical, 2).background(tint.opacity(0.14), in: Capsule())
            .accessibilityLabel("Against the reference: \(verdict.title)")
    }

    // MARK: Actions

    private func toggleRedo(_ id: String) {
        if review.redo.contains(id) { review.redo.remove(id) } else { review.redo.insert(id) }
    }

    /// Redo what is marked (the comments on those frames travel in the note), or approve all, sending any other comments first.
    private func submit(frames: [Styleframe], note: String) {
        let snapshot = review
        Task {
            if snapshot.redo.isEmpty {
                for frame in frames {
                    guard let text = snapshot.comments[frame.id]?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { continue }
                    await model.send(step: step, type: "comment", value: StyleframeReview.commentValue(frame: frame.id), note: text)
                }
                await model.send(step: step, type: "approve", note: note)
            } else {
                let text = snapshot.redoNote(in: frames, overall: note)
                if await model.send(step: step, type: "redo", value: snapshot.redoValue(in: frames, note: text), note: text) { review = StyleframeReview() }
            }
        }
    }
}
