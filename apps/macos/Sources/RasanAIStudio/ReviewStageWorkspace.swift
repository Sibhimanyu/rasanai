import SwiftUI

/// Shared chrome for the choice-heavy review calls.  Unlike `StageScaffold`, this
/// keeps the question and action bar outside the review area's scroll regions so
/// a choice remains actionable in a short Studio window.
struct ReviewStageWorkspace<Content: View, Actions: View>: View {
    let model: FilmSessionModel
    let step: String
    let question: String
    var context: String?
    /// False when the content draws the header itself (Story's wide layout).
    var showsHeader: Bool = true
    @ViewBuilder var content: Content
    @ViewBuilder var actions: Actions

    var body: some View {
        VStack(spacing: 0) {
            if showsHeader {
                header
                Divider()
            }
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { actions }
    }

    /// The same crew header as every other stage: the character asks the question in a speech bubble.
    private var header: some View {
        StageHeader(question: question, context: context, step: step)
            .padding(.horizontal, 24).padding(.top, 18).padding(.bottom, 14)
    }
}

extension ReviewStageWorkspace where Actions == EmptyView {
    init(model: FilmSessionModel, step: String, question: String, context: String? = nil,
         showsHeader: Bool = true, @ViewBuilder content: () -> Content) {
        self.init(model: model, step: step, question: question, context: context, showsHeader: showsHeader, content: content, actions: { EmptyView() })
    }
}
