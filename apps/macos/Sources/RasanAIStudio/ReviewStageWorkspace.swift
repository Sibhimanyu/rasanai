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
        VStack(spacing: 0) {
            header
            Divider()
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            if let decision = model.payload(step)["decision"].string, model.status(step) == "done" {
                DecidedLine(decision: decision, by: model.snapshot.decisions.first { $0.step == step }?.byUser)
                    .padding(.horizontal, 16).padding(.vertical, 8)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { actions }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            if let character {
                CrewAvatar(character, style: .bust(diameter: 30), watching: false)
                Text(CrewCredit.line(step: step, character: character))
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                    .frame(width: 150, alignment: .leading)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(question)
                    .font(.system(size: 20, weight: .semibold)).tracking(-0.25)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let context, !context.isEmpty {
                    Text(context).font(.system(size: 12)).foregroundStyle(.secondary)
                        .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension ReviewStageWorkspace where Actions == EmptyView {
    init(model: FilmSessionModel, step: String, question: String, context: String? = nil,
         @ViewBuilder content: () -> Content) {
        self.init(model: model, step: step, question: question, context: context, content: content, actions: { EmptyView() })
    }
}
