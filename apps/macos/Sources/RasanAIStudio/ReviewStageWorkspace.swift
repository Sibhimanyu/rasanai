import SwiftUI

/// Shared chrome for the choice-heavy review calls.  Unlike `StageScaffold`, this
/// keeps the question and action bar outside the review area's scroll regions so
/// a choice remains actionable in a short Studio window.
struct ReviewStageWorkspace<Content: View, Actions: View>: View {
    let model: FilmSessionModel
    let step: String
    let question: String
    var context: String?
    @ViewBuilder var content: Content
    @ViewBuilder var actions: Actions

    @Environment(\.crewCharacter) private var character

    var body: some View {
        GeometryReader { proxy in
            // A full ask pose gives Story and Look the same welcoming scale as
            // Brief. Short or narrow windows still reserve enough space for the
            // choice workspace by using the compact pose.
            let compactHeader = proxy.size.width < 720 || proxy.size.height < 620

            VStack(spacing: 0) {
                header(compact: compactHeader)
                Divider()
                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if let decision = model.payload(step)["decision"].string, model.status(step) == "done" {
                    DecidedLine(decision: decision, by: model.snapshot.decisions.first { $0.step == step }?.byUser)
                        .padding(.horizontal, 16).padding(.vertical, 8)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { actions }
    }

    private func header(compact: Bool) -> some View {
        let unit: CGFloat = compact ? 88 : 140

        return VStack(alignment: .leading, spacing: compact ? 6 : 8) {
            if let character {
                // Keep the prompt in the crew member's speech bubble, as it is
                // on Brief, rather than reducing her to an incidental avatar.
                CrewAskRow(character: character, text: question, unit: unit)
                Text(CrewCredit.line(step: step, character: character))
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else {
                Text(question)
                    .font(.system(size: compact ? 23 : 29, weight: .semibold))
                    .tracking(compact ? -0.3 : -0.6)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
            if let context, !context.isEmpty {
                Text(context)
                    .font(.system(size: compact ? 12 : 14))
                    .foregroundStyle(.secondary)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, compact ? 16 : 24)
        .padding(.vertical, compact ? 8 : 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension ReviewStageWorkspace where Actions == EmptyView {
    init(model: FilmSessionModel, step: String, question: String, context: String? = nil,
         @ViewBuilder content: () -> Content) {
        self.init(model: model, step: step, question: question, context: context, content: content, actions: { EmptyView() })
    }
}
