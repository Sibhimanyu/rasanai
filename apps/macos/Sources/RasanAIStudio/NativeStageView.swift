import StudioCore
import SwiftUI

/// The router: mirrors `screenFor` in the web console through `StageRouter.route` and cross-fades between stages.
/// It also carries the shared chrome that sits on every stage: the read-only banner, the open question, errors.
struct NativeStageView: View {
    let model: FilmSessionModel
    var startedAt: Date?

    var body: some View {
        let route = model.route
        VStack(spacing: 0) {
            if model.isViewingPast { ViewingBanner(model: model) }
            UpdateNotice(model: model)
            if let ask = model.ask, model.dismissedAsks.contains(ask.id) { AskCard(model: model, ask: ask) }
            ZStack {
                stage(route).id(route).transition(.opacity)
            }
            .animation(.smooth, value: route)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .environment(model)
        .sheet(item: askBinding) { ask in AskSheet(model: model, ask: ask).tint(.rasan) }
    }

    private var askBinding: Binding<DirectorAsk?> {
        Binding(get: { model.ask.flatMap { model.dismissedAsks.contains($0.id) ? nil : $0 } },
                set: { if $0 == nil, let ask = model.ask { model.dismissedAsks.insert(ask.id) } })
    }

    @ViewBuilder private func stage(_ route: StageRoute) -> some View {
        switch route {
        case .working: DirectorWorkingView(model: model, startedAt: startedAt)
        case .brief: BriefStage(model: model, step: "brief")
        case .story: StoryStage(model: model, step: "story")
        case .look: LookStage(model: model, step: model.shownStep == "films" || model.shownStep == "direction" ? model.shownStep : (model.payload("look") != .null ? "look" : "films"))
        case .animatic: AnimaticStage(model: model, step: "animatic")
        case .build: BuildStage(model: model, step: "build")
        case .final: FinalStage(model: model, step: model.payload("render") != .null ? "render" : "final")
        case .panel(let step): StepPanel(model: model, step: step)
        }
    }
}

/// The console's "a newer version is available" notice (`session.app`), shown natively with a way to check for it.
private struct UpdateNotice: View {
    let model: FilmSessionModel
    @State private var dismissed = false
    private var versions: (current: String, latest: String)? {
        guard let latest = model.snapshot.raw["app"]["latest"].string, let current = model.snapshot.raw["app"]["version"].string,
              latest.compare(current, options: .numeric) == .orderedDescending else { return nil }
        return (current, latest)
    }
    var body: some View {
        if let versions, !dismissed {
            HStack(spacing: 10) {
                Image(systemName: "arrow.down.circle").foregroundStyle(Color.rasan)
                Text("RasanAI \(versions.latest) is available (this film is using \(versions.current)).").font(.system(size: 12))
                Spacer()
                Button("Check for Updates") { StudioUpdater.shared.check() }.buttonStyle(.link).font(.system(size: 12))
                Button { dismissed = true } label: { Image(systemName: "xmark") }.buttonStyle(.plain).foregroundStyle(.secondary)
                    .accessibilityLabel("Dismiss update notice")
            }
            .padding(.horizontal, 20).padding(.vertical, 6).background(.bar).overlay(alignment: .bottom) { Divider() }
        }
    }
}

private struct ViewingBanner: View {
    let model: FilmSessionModel
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "clock.arrow.circlepath").foregroundStyle(.secondary)
            Text("Looking back at \(StepCatalog.label(model.shownStep)). Nothing here can change.").font(.system(size: 12))
            Spacer()
            Button("Back to now") { model.returnToLive() }
        }
        .padding(.horizontal, 20).padding(.vertical, 8).background(.bar).overlay(alignment: .bottom) { Divider() }
    }
}

/// The router plus the window chrome (Decisions inspector, toolbar items). Used by FilmPage, the sample and fixtures.
struct NativeFilmView: View {
    @Bindable var model: FilmSessionModel
    var startedAt: Date?
    var body: some View {
        NativeStageView(model: model, startedAt: startedAt)
            .inspector(isPresented: $model.decisionsPresented) { DecisionsInspector(model: model) }
            .toolbar { FilmToolbarItems(model: model) }
    }
}
