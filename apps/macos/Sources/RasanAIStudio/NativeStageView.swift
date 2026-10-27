import StudioCore
import SwiftUI

/// The router: mirrors `screenFor` in the web console through `StageRouter.route` and cross-fades between stages.
/// It also carries the shared chrome that sits on every stage: the update notice and the open question. Looking back,
/// sending and errors are the status bar's (FilmStatusBar).
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
    /// Nothing is running and nobody paused it: the person resumes it by hand.
    var onResume: (() -> Void)?
    /// The director is stopped: the working view says where it stopped and stops moving.
    var paused = false

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
            StudioUpdateBanner()
            UpdateNotice(model: model)
            RevisionStrip(model: model)    // Plan 10 U5/U6: revision progress, run state and recovery controls, only while there is something to say
            if let ask = model.ask, model.dismissedAsks.contains(ask.id) { AskCard(model: model, ask: ask) }
            ZStack {
                stage(route).id(progressShown ? AnyHashable("film-progress") : AnyHashable(route)).transition(.opacity)
            }
            .animation(.smooth, value: progressShown ? StageRoute.working : route)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .environment(model)
        .environment(\.crewCharacter, CrewCharacter(key: CrewRoles.character(forRoute: route)))
        .onReceive(NotificationCenter.default.publisher(for: .studioCloseSheets)) { _ in askBinding.wrappedValue = nil }
        .sheet(item: askBinding) { ask in AskSheet(model: model, ask: ask).tint(.rasan) }
    }

    private var askBinding: Binding<DirectorAsk?> {
        Binding(get: { model.ask.flatMap { model.dismissedAsks.contains($0.id) ? nil : $0 } },
                set: { if $0 == nil, let ask = model.ask { model.dismissedAsks.insert(ask.id) } })
    }

    @ViewBuilder private func stage(_ route: StageRoute) -> some View {
        if showsProgress, let progress {
            FilmProgressView(model: model, progress: progress, onPause: onPause, onShowLog: onShowLog, pace: pace, autoResume: autoResume, onResumeNow: onResumeNow, onResume: onResume, paused: paused)
        } else { classic(route) }
    }

    @ViewBuilder private func classic(_ route: StageRoute) -> some View {
        switch route {
        case .working: DirectorWorkingView(model: model, startedAt: startedAt, paused: paused)
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
            .padding(.horizontal, .filmInset).padding(.vertical, 6).background(.bar).overlay(alignment: .bottom) { Divider() }
        }
    }
}

/// The router plus the toolbar items. Used by FilmPage and the sample film; each wraps it and the status bar in
/// `DecisionsHost`, so the inspector runs the full window height.
struct NativeFilmView: View {
    @Bindable var model: FilmSessionModel
    var startedAt: Date?
    var progress: FilmProgress?
    var onPause: (() -> Void)?
    var onShowLog: (() -> Void)?
    var pace: FilmPace?
    var autoResume: AutoResumeNotice?
    var onResumeNow: (() -> Void)?
    var onResume: (() -> Void)?
    var paused = false
    var body: some View {
        NativeStageView(model: model, startedAt: startedAt, progress: progress, onPause: onPause, onShowLog: onShowLog, pace: pace, autoResume: autoResume, onResumeNow: onResumeNow, onResume: onResume, paused: paused)
    }
}
