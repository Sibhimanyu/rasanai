import StudioCore
import SwiftUI

/// Style-frames review, concept by concept: each concept's 3 hero frames large, then the blind juror's verdict (score,
/// would it sit in the reel, what is missing). Actions: Approve, or Rework with a note (tick the concepts to rework).
///
/// This is an optional review. When the gate passed (`gate.ok`), the film carries on by itself and the step arrives `done`:
/// the frames and verdicts stay readable here and nothing is asked. Only a failed gate waits for a call.
struct StyleframeConceptsView: View {
    let model: FilmSessionModel
    let step: String
    let concepts: [StyleframeConcept]
    @State private var rework: Set<String> = []

    private var canAct: Bool { model.canAct(on: step) }
    private var allPassed: Bool { concepts.allSatisfy { $0.gatePassed == true } }
    private var aspect: CGFloat { CGFloat(model.snapshot.aspectRatio) }

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            banner
            ForEach(concepts) { concept in section(concept) }
            Color.clear.frame(maxWidth: .infinity, minHeight: 1, maxHeight: 1)
                .stepPrimary(rework.isEmpty ? (concepts.count == 1 ? "Approve frames" : "Approve frames") : "Rework \(rework.count) concept\(rework.count == 1 ? "" : "s")",
                             symbol: rework.isEmpty ? "checkmark" : "arrow.triangle.2.circlepath", enabled: canAct) { note in submit(note) }
        }
        .padding(.bottom, 110)
        .onChange(of: concepts.map(\.id)) { _, ids in rework = rework.intersection(ids) }
    }

    @ViewBuilder private var banner: some View {
        if allPassed {
            Label(canAct ? "The frames passed the gate. Approve to carry on, or rework one." : "The frames passed the gate, so the film carried on. This review is optional.", systemImage: "checkmark.seal")
                .font(.system(size: 13, weight: .medium)).foregroundStyle(Color(nsColor: .systemGreen))
        } else if concepts.contains(where: { $0.gatePassed == false }) {
            let failed = concepts.filter { $0.gatePassed == false }.map(\.title)
            Label("The gate held back \(failed.joined(separator: ", ")). Rework \(failed.count == 1 ? "it" : "them"), or approve anyway.", systemImage: "exclamationmark.triangle")
                .font(.system(size: 13, weight: .medium)).foregroundStyle(Color(nsColor: .systemOrange))
        } else if concepts.contains(where: { $0.verdict == nil }) {
            Label("The juror has not seen these yet. Frames first, then the verdict.", systemImage: "hourglass")
                .font(.system(size: 13)).foregroundStyle(.secondary)
        }
    }

    private func section(_ concept: StyleframeConcept) -> some View {
        let marked = rework.contains(concept.id)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(concept.title).font(.system(size: 20, weight: .semibold)).accessibilityAddTraits(.isHeader)
                if let world = concept.styleWorld {
                    Text(world).font(.system(size: 11.5, weight: .medium)).padding(.horizontal, 9).padding(.vertical, 3)
                        .background(Color.primary.opacity(0.06), in: Capsule())
                }
                Spacer()
                if canAct {
                    Toggle(isOn: Binding(get: { marked }, set: { on in if on { rework.insert(concept.id) } else { rework.remove(concept.id) } })) {
                        Label("Rework", systemImage: "arrow.triangle.2.circlepath").font(.system(size: 12))
                    }
                    .toggleStyle(.button).controlSize(.small)
                    .accessibilityLabel("Rework \(concept.title)")
                }
            }
            HStack(alignment: .top, spacing: 16) {
                ForEach(concept.frames) { frame in heroTile(frame) }
            }
            if let verdict = concept.verdict { verdictBox(verdict, concept: concept) }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.primary.opacity(0.035)))
        .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(marked ? Color.rasan.opacity(0.6) : Color(nsColor: .separatorColor), lineWidth: marked ? 1.5 : 0.5) }
    }

    private func heroTile(_ frame: ConceptHeroFrame) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Color.clear.aspectRatio(aspect, contentMode: .fit)
                .overlay { PayloadImage(path: frame.image, contentMode: .fill, maxPixels: 1600) }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5) }
                .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
                .onTapGesture(count: 2) { if let url = model.fileURL(frame.image) { SafeOpen.open(url) } }
            HStack(spacing: 6) {
                if !frame.caption.isEmpty { Text(frame.caption).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2) }
                Spacer(minLength: 0)
                if let score = frame.score { Text(score == score.rounded() ? "\(Int(score))/10" : String(format: "%.1f/10", score)).font(.system(size: 11, weight: .semibold).monospacedDigit()).foregroundStyle(.secondary) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func verdictBox(_ verdict: ConceptVerdict, concept: StyleframeConcept) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                if let score = verdict.scoreText {
                    Text("\(score) / 10").font(.system(size: 15, weight: .bold, design: .rounded).monospacedDigit())
                }
                if let sits = verdict.sitsTitle {
                    let good = verdict.sitsInReel == "yes"
                    Text(sits).font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(good ? Color(nsColor: .systemGreen) : verdict.sitsInReel == "maybe" ? Color(nsColor: .systemOrange) : Color(nsColor: .systemRed))
                }
                if let ok = concept.gatePassed {
                    Text(ok ? "Gate passed" : "Gate: rework").font(.system(size: 11.5)).foregroundStyle(.secondary)
                }
            }
            if let overall = verdict.overall, !overall.isEmpty { Text(overall).font(.system(size: 13)).foregroundStyle(.primary.opacity(0.85)).fixedSize(horizontal: false, vertical: true) }
            if !verdict.missing.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("What is missing").font(.system(size: 11, weight: .semibold)).foregroundStyle(.tertiary)
                    ForEach(verdict.missing, id: \.self) { Text("\u{2022} \($0)").font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                }
            }
            if !verdict.rework.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Suggested changes").font(.system(size: 11, weight: .semibold)).foregroundStyle(.tertiary)
                    ForEach(Array(verdict.rework.enumerated()), id: \.offset) { Text("\($0 + 1). \($1)").font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                }
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func submit(_ note: String) {
        let chosen = concepts.map(\.id).filter { rework.contains($0) }
        Task {
            if chosen.isEmpty { await model.send(step: step, type: "approve", note: note) }
            else if await model.send(step: step, type: "redo", value: StyleframeConcept.reworkValue(ids: chosen, note: note), note: note) { rework = [] }
        }
    }
}
