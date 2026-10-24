import StudioCore
import SwiftUI

/// A collapsed-by-default disclosure for the Look stage: what the film borrows from a motion reference.
/// Never a required decision: the influence field is optional and nothing here blocks the primary action.
struct MotionInspirationSummary: View {
    let summary: MotionReferenceSummary
    var onChangeInfluence: ((String) -> Void)?

    @State private var expanded = false
    @State private var influence = ""

    private var mechanics: [MotionReferenceSummary.RecipeStep] {
        Array((summary.recipe ?? []).filter { $0.transferableMechanic?.isEmpty == false }.prefix(5))
    }

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    cadenceStrip
                    if !mechanics.isEmpty { mechanicsList }
                    if let notes = summary.analysis?.uncertainties, !notes.isEmpty { uncertainty(notes) }
                    if onChangeInfluence != nil { influenceField }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 10)
            }
            .frame(maxHeight: 320)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("Motion inspiration").font(.callout.weight(.semibold))
                Text(creditLine).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .padding(12)
        .cardSurface()
        .accessibilityLabel("Motion inspiration, \(expanded ? "expanded" : "collapsed")")
    }

    private var creditLine: String {
        let name = summary.source?.basename ?? "your reference"
        return "Inspired by \(name) (\(MotionRights.label(summary.source?.rights).lowercased())). Rhythm and mechanics only."
    }

    private var cadenceStrip: some View {
        let bars = MotionCadence.bars(from: summary)
        return VStack(alignment: .leading, spacing: 4) {
            Text("Cadence").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            if bars.isEmpty {
                Text("No shot lengths were found.").font(.caption).foregroundStyle(.secondary)
            } else {
                HStack(alignment: .bottom, spacing: 3) {
                    ForEach(Array(bars.enumerated()), id: \.offset) { _, h in
                        RoundedRectangle(cornerRadius: 2).fill(Color.rasan.opacity(0.35 + 0.65 * h)).frame(width: 8, height: 4 + 28 * h)
                    }
                }
                .frame(height: 32, alignment: .bottom)
                .accessibilityElement()
                .accessibilityLabel("Cadence: \(bars.count) shots, longest shot \(Self.longest(summary)) seconds")
            }
        }
    }

    private var mechanicsList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("What carries over").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ForEach(Array(mechanics.enumerated()), id: \.offset) { _, step in
                VStack(alignment: .leading, spacing: 2) {
                    if let o = step.observation { Text(o).font(.caption).foregroundStyle(.secondary) }
                    Text(step.transferableMechanic ?? "").font(.callout)
                    if let m = step.candidateMove { Text("Used in: \(m)").font(.caption).foregroundStyle(Color.rasan) }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func uncertainty(_ notes: [String]) -> some View {
        Text("Not sure about: " + notes.prefix(3).joined(separator: "; "))
            .font(.caption).foregroundStyle(.secondary)
            .accessibilityLabel("Uncertainty. " + notes.prefix(3).joined(separator: ". "))
    }

    private var influenceField: some View {
        TextField("Change the motion influence", text: $influence)
            .textFieldStyle(.roundedBorder)
            .onSubmit {
                let text = influence.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { return }
                onChangeInfluence?(text)
                influence = ""
            }
            .accessibilityLabel("Change the motion influence")
            .accessibilityHint("Optional. Press Return to send.")
    }

    private static func longest(_ s: MotionReferenceSummary) -> String {
        let l = (s.analysis?.shots ?? []).compactMap { sh -> Double? in
            guard let a = sh.startS, let b = sh.endS else { return nil }
            return b - a
        }.max() ?? 0
        return String(format: "%.1f", l)
    }
}

#Preview("Inspiration summary") {
    let json = """
    {"schema_version":1,"reference_id":"ref-1",
     "source":{"kind":"linked-file","rights":"inspiration-only","basename":"launch-reel.mp4"},
     "analysis":{"duration_s":20,"shots":[
       {"start_s":0,"end_s":2.4},{"start_s":2.4,"end_s":3.2},{"start_s":3.2,"end_s":4},{"start_s":4,"end_s":9},
       {"start_s":9,"end_s":10.5},{"start_s":10.5,"end_s":14},{"start_s":14,"end_s":20}],
       "uncertainties":["Audio hits were estimated from the picture only"]},
     "recipe":[
       {"observation":"Hard cut on every beat","transferable_mechanic":"Cut on the downbeat, hold one beat longer on the product","candidate_move":"scene 2"},
       {"observation":"Type slams in then settles","transferable_mechanic":"Overshoot, then a 6 frame settle","candidate_move":"title card"},
       {"observation":"Slow push on the hero shot","transferable_mechanic":"A 4% scale push across the whole shot","candidate_move":"ending"}]}
    """
    let summary = try! MotionReferenceSummary.decode(Data(json.utf8))
    return ScrollView {
        VStack(spacing: 16) {
            MotionInspirationSummary(summary: summary, onChangeInfluence: { _ in })
            MotionInspirationSummary(summary: summary)
        }.padding(20)
    }
    .frame(width: 460, height: 420).background(Workspace.canvas).preferredColorScheme(.dark)
}
