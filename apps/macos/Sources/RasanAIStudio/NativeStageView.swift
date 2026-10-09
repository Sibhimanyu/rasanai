import StudioCore
import SwiftUI

/// The router: mirrors `screenFor` in the web console through `StageRouter.route` and cross-fades between stages.
/// It also carries the shared chrome that sits on every stage: the read-only banner, the open question, errors.
struct NativeStageView: View {
    let model: FilmSessionModel
    var startedAt: Date?
    /// The film's progress model. When present, "Claude is working", the build and the final render show Film progress.
    var progress: FilmProgress?
    var onPause: (() -> Void)?
    var onShowLog: (() -> Void)?
    var pace: FilmPace?
    var autoResume: AutoResumeNotice?
    var onResumeNow: (() -> Void)?

    /// True when this route is drawn by Film progress (so the stage cross-fade does not flash between working and build).
    private var showsProgress: Bool {
        guard let progress else { return false }
        switch model.route {
        case .working: return true
        case .build: return !model.isViewingPast
        case .final:
            let render = progress.snapshot.render
            return !model.isViewingPast && render.kind == .final && [.preparing, .rendering, .finishing].contains(render.state) && model.status("render") != "done"
        default: return false
        }
    }

    var body: some View {
        let route = model.route
        let progressShown = showsProgress
        VStack(spacing: 0) {
            if model.isViewingPast { ViewingBanner(model: model) }
            UpdateNotice(model: model)
            if let ask = model.ask, model.dismissedAsks.contains(ask.id) { AskCard(model: model, ask: ask) }
            ZStack {
                stage(route).id(progressShown ? AnyHashable("film-progress") : AnyHashable(route)).transition(.opacity)
            }
            .animation(.smooth, value: progressShown ? StageRoute.working : route)
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
        if showsProgress, let progress {
            FilmProgressView(model: model, progress: progress, onPause: onPause, onShowLog: onShowLog, pace: pace, autoResume: autoResume, onResumeNow: onResumeNow)
        } else { classic(route) }
    }

    @ViewBuilder private func classic(_ route: StageRoute) -> some View {
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

/// The router plus the toolbar items. Used by FilmPage, the sample and fixtures; each wraps it and the stage bar in
/// `DecisionsHost`, so the inspector runs the full window height instead of starting under the stage bar.
struct NativeFilmView: View {
    @Bindable var model: FilmSessionModel
    var startedAt: Date?
    var progress: FilmProgress?
    var onPause: (() -> Void)?
    var onShowLog: (() -> Void)?
    var pace: FilmPace?
    var autoResume: AutoResumeNotice?
    var onResumeNow: (() -> Void)?
    var body: some View {
        NativeStageView(model: model, startedAt: startedAt, progress: progress, onPause: onPause, onShowLog: onShowLog, pace: pace, autoResume: autoResume, onResumeNow: onResumeNow)
            .toolbar { FilmToolbarItems(model: model) }
    }
}
