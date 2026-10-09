import AppKit
import StudioCore
import SwiftUI

/// Film progress fixtures built from the real 8-hour "ChatGPT for Mac launch test 2" film: its real key frames, scene stills,
/// specimens, draft renders and the words from its activity feed. They start from the model's own `FilmProgressSnapshot.fixture`
/// and fill whatever it left empty, so they keep working as the model's fixtures get richer.
///
///     swift build --scratch-path /tmp/rasan-pui
///     /tmp/rasan-pui/debug/RasanAIStudio --snapshot-stages <out> --only progress
///
/// writes progress-<phase>[-dark].png (research, plan, build, check, render, plus script, look, animatic, render-done, over-budget and
/// the Director panel's phase cost table). Without the test film on disk the image slots fall back to generated frames.
@MainActor
enum ProgressFixtures {
    static let film = URL(fileURLWithPath: NSHomeDirectory() + "/Documents/RasanAI/ChatGPT for Mac launch test 2", isDirectory: true)
    static var video: URL { film.appendingPathComponent("videos/chatgpt-for-mac", isDirectory: true) }
    static var run: URL { film.appendingPathComponent(".rasanai/run-66DDC821-B844-4DAD-AB83-DCF906B5FCB2", isDirectory: true) }
    static let hasRealFilm = FileManager.default.fileExists(atPath: NSHomeDirectory() + "/Documents/RasanAI/ChatGPT for Mac launch test 2/videos/chatgpt-for-mac/renders")

    /// A generated stand-in image when the real file is missing.
    private static let spare: URL = {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("rasan-progress-spare.png")
        if let data = StageFixtures.labelledPNG("", hueA: 0.6, hueB: 0.75) { try? data.write(to: url) }
        return url
    }()
    private static func existing(_ url: URL) -> URL { FileManager.default.fileExists(atPath: url.path) ? url : spare }

    // MARK: Per-phase timing and cost (a believable shape for the real film; the real ones come from the engine)

    private static let plan: [(phase: ProgressPhase, minutes: Double, usd: Double, tokens: Int)] = [
        (.research, 4.2, 0.84, 410_000), (.script, 6.4, 1.31, 620_000), (.look, 9.7, 2.05, 910_000), (.plan, 18.5, 2.90, 1_450_000),
        (.animatic, 6.0, 0.62, 300_000), (.build, 42, 9.80, 4_900_000), (.check, 86, 12.40, 5_300_000), (.render, 17, 1.10, 600_000),
    ]

    static func snapshot(_ phase: ProgressPhase, now: Date = Date(), over: Bool = false, renderDone: Bool = false) -> FilmProgressSnapshot {
        var s = FilmProgressSnapshot.fixture(phase, now: now)
        s.title = "ChatGPT for Mac launch test"
        s.asOf = now
        // Timeline: phases are laid end to end; the current one has been going for a believable while.
        let into: [ProgressPhase: Double] = [.research: over ? 190 : 78, .script: 150, .look: 240, .plan: 380, .animatic: 120, .build: 1500, .check: 2100, .render: 143]
        var cursor = now.addingTimeInterval(-(plan.filter { $0.phase < phase }.reduce(0) { $0 + $1.minutes * 60 } + (into[phase] ?? 60)))
        s.startedAt = cursor
        for index in s.phases.indices {
            let p = s.phases[index].phase
            guard let row = plan.first(where: { $0.phase == p }) else { continue }
            if p < phase {
                s.phases[index].startedAt = cursor
                cursor = cursor.addingTimeInterval(row.minutes * 60)
                s.phases[index].endedAt = cursor
                s.phases[index].costUSD = row.usd; s.phases[index].tokens = TokenTotals(input: row.tokens / 6, output: row.tokens / 12, cacheRead: row.tokens, cacheWrite: row.tokens / 9)
                s.phases[index].costIsEstimated = false
            } else if p == phase {
                s.phases[index].startedAt = cursor
                s.phases[index].costUSD = row.usd * (into[p] ?? 60) / (row.minutes * 60)
                let t = Int(Double(row.tokens) * (into[p] ?? 60) / (row.minutes * 60))
                s.phases[index].tokens = TokenTotals(input: t / 6, output: t / 12, cacheRead: t, cacheWrite: t / 9)
                s.phases[index].costIsEstimated = true
                s.phases[index].state = phase == .animatic ? .waitingForYou : .active
            } else {
                s.phases[index].estimate = PhaseEstimate(secondsLeft: row.minutes * 60, basis: .typical)
            }
            if p == .check { s.phases[index].rounds = 2 }
        }
        s.totalCostUSD = s.phases.reduce(0) { $0 + $1.costUSD }
        s.totalTokens = s.phases.reduce(TokenTotals()) { $0 + $1.tokens }
        s.costIsEstimated = true
        s.isWaitingForYou = phase == .animatic
        s.currentPhase = phase
        // Overall estimate: what is typically left after this phase plus the rest of this one.
        let rest = plan.filter { $0.phase > phase }.reduce(0) { $0 + $1.minutes * 60 }
        let thisLeft = phase == .render ? 64 : max(30, (plan.first { $0.phase == phase }?.minutes ?? 1) * 60 - (into[phase] ?? 0))
        s.remaining = PhaseEstimate(secondsLeft: rest + thisLeft, basis: phase == .build || phase == .render ? .measured : .typical)
        if let index = s.phases.firstIndex(where: { $0.phase == phase }) {
            s.phases[index].estimate = PhaseEstimate(secondsLeft: thisLeft, basis: phase == .build || phase == .render ? .measured : .typical)
        }
        if phase == .render { s.remaining = s.phases.first { $0.phase == .render }?.estimate }

        fill(&s, phase: phase, now: now, over: over, renderDone: renderDone)
        s.activity = activity(upTo: phase, now: now, phaseStarts: Dictionary(uniqueKeysWithValues: s.phases.compactMap { p in p.startedAt.map { (p.phase, $0) } }))
        return s
    }

    // MARK: Detail per phase

    private static func fill(_ s: inout FilmProgressSnapshot, phase: ProgressPhase, now: Date, over: Bool, renderDone: Bool) {
        let ago = { (seconds: Double) in now.addingTimeInterval(-seconds) }
        // Research: the real sources the director read.
        if phase >= .research {
            let reads: [(ResearchSource.Kind, String, String?)] = [
                (.page, "https://openai.com/chatgpt/desktop/", nil), (.search, "ChatGPT macOS app release notes help.openai.com", nil),
                (.page, "https://help.openai.com/en/articles/9275200-using-chatgpt-desktop-app", "Researching ChatGPT for Mac: features, releases, real numbers"),
                (.page, "https://openai.com/brand/", "Finding ChatGPT for Mac's real logo, colours, type and motion"),
                (.search, "OpenAI brand guidelines ChatGPT logo download OpenAI Sans typeface", "Finding ChatGPT for Mac's real logo, colours, type and motion"),
                (.page, "https://chatgpt.com/", "Collecting real screens of ChatGPT for Mac"),
                (.page, "https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes", "Researching ChatGPT for Mac: features, releases, real numbers"),
                (.page, "https://openai.com/products/release-notes/", nil),
            ]
            let shown = phase == .research ? (over ? Array(reads.prefix(8)) : Array(reads.prefix(4))) : Array(reads.prefix(6))
            s.research.sources = shown.enumerated().map { index, item in
                let url = URL(string: item.1)
                let host = item.0 == .page ? (url?.host ?? item.1).replacingOccurrences(of: "www.", with: "") : item.1
                let display = item.0 == .page ? host + (url.map { $0.path == "/" ? "" : String($0.path.prefix(34)) } ?? "") : item.1
                return ResearchSource(id: "src\(index)", kind: item.0, target: item.1, host: host, display: display,
                                      time: ago(Double(shown.count - index) * (phase == .research ? 17 : 24) + 5), by: item.2)
            }
            s.research.pageCount = shown.filter { $0.0 == .page }.count
            s.research.searchCount = shown.filter { $0.0 == .search }.count
            s.research.budget = .quick
            s.research.startedAt = s.summary(.research).startedAt
            if phase > .research { s.research.endedAt = s.summary(.research).endedAt; s.research.findingsCount = 14; s.research.findingsPushedAt = s.research.endedAt }
        }
        let crewNames: [(ProgressPhase, String, String?)] = [
            (.research, "Collecting real screens of ChatGPT for Mac", "Reading a web page (openai.com)"),
            (.research, "Finding ChatGPT for Mac's real logo, colours, type and motion", "Searching the web"),
            (.script, "Writing the Sure script", "Writing story-sure.json"), (.script, "Writing the Bold script", "Writing story-bold.json"),
            (.script, "Writing the Wild script", "Reading the truth sheet"), (.script, "Editing the three scripts like a hostile reader", nil),
            (.look, "Designing the Sure design system for this story", "Drawing the specimen"), (.look, "Designing the Bold design system for this story", "Writing DESIGN.md"),
            (.look, "Designing the Wild design system for this story", "Reading the story's first line"),
        ]
        s.crew = crewNames.enumerated().filter { $0.element.0 <= phase }.map { index, item in
            let running = item.0 == phase && !(item.2 == nil)
            return CrewMember(id: "crew\(index)", name: item.1, phase: item.0, state: running ? .running : .done, startedAt: ago(Double(240 - index * 12)),
                              endedAt: running ? nil : ago(Double(100 - index * 5)), lastAction: running ? item.2 : nil)
        }.reversed()
        // Specimens (the look drafts).
        if phase >= .look {
            let names = ["Sure", "Bold", "Wild"]
            let count = phase == .look ? 3 : 3
            s.keyframes = names.prefix(count).enumerated().map { index, name in
                KeyframeThumb(id: "specimen-\(name)", label: "\(name) look", kind: .specimen, url: existing(run.appendingPathComponent("design/\(name)/specimen.png")), addedAt: ago(Double(900 - index * 60)))
            }
        }
        // Key frames: the real ones from assets/keyframes.
        if phase >= .plan {
            let drawn = phase == .plan ? 5 : 8
            s.keyframes += (1...drawn).map { n in
                KeyframeThumb(id: "kf\(n)", label: "Key frame \(n)", kind: .keyframe, url: existing(video.appendingPathComponent("assets/keyframes/\(n).png")),
                              addedAt: ago(Double((drawn - n) * 40 + 15)), sceneID: "\(n)")
            }
            s.keyframesExpected = 8
        }
        // Build: the real eight scenes.
        if phase >= .build {
            let titles = ["Entrance plaque", "Exhibit 1: the unfinished toast", "Exhibit 2: Command + Tab", "Exhibit 3: the long gallery", "Exhibit 4: the bell jar", "The fold into the Mac", "The press", "Fig punchline"]
            let durations = [3.5, 2.8, 2.8, 5.0, 3.0, 4.0, 4.5, 4.4]
            let builtCount = phase == .build ? 5 : 8
            s.scenes = titles.enumerated().map { index, title in
                let state: SceneProgress.State = index < builtCount ? .done : (index == builtCount && phase == .build ? .working : .todo)
                return SceneProgress(id: "s\(index + 1)", title: title, duration: durations[index], state: state,
                                     thumbnailURL: state == .todo ? nil : existing(run.appendingPathComponent("frames/\(index + 1).png")))
            }
            s.buildStages = ["Handoff", "Plan", "Shared set", "Animate scenes", phase == .build ? "Assemble" : "Assembled"]
            s.newestStill = existing(run.appendingPathComponent("frames/\(min(builtCount, 8)).png"))
        }
        // Check: real findings from the critic rounds, real draft renders.
        if phase >= .check {
            let finished = phase > .check
            s.criticFindings = [
                CriticFinding(id: "f0", round: 1, source: "Gates", summary: "Motion contract, all six 3D scenes, the slop check and HyperFrames lint came back clean.", state: .clean, time: ago(2000)),
                CriticFinding(id: "f1", round: 1, source: "Motion critic", summary: "The fold into the Mac must read as a real hinge.", state: .fixed, time: ago(1900)),
                CriticFinding(id: "f2", round: 1, source: "Motion critic", summary: "The long-gallery run needs its exhibits clear of the placard.", state: .fixed, time: ago(1850)),
                CriticFinding(id: "f3", round: 1, source: "Fact critic", summary: "The press needs a hand: a finger that visibly presses Option + Space.", state: .fixed, time: ago(1800)),
                CriticFinding(id: "f4", round: 2, source: "Gates", summary: "Draft 1 caught the new hand showing up early in the gallery.", state: .fixed, time: ago(900)),
                CriticFinding(id: "f5", round: 2, source: "Film critic", summary: "The fold needs to read as a true hinge in the final render.", state: finished ? .fixed : .fixing, time: ago(300)),
                CriticFinding(id: "f6", round: 2, source: "Film critic", summary: "The fig punchline should rest on screen before the cut.", state: finished ? .fixed : .found, time: ago(280)),
            ]
            let sizes: [(String, Int64, Double)] = [("draft-v1", 6_118_253, 4300), ("draft-v2", 6_975_932, 2500), ("draft-v3", 6_850_788, 700), ("draft-s6", 6_850_787, 1500), ("draft-fix-s5", 5_889_589, 2000)]
            s.drafts = sizes.map { name, size, secs in
                DraftRender(id: name, name: name, url: existing(video.appendingPathComponent("renders/\(name).mp4")), finishedAt: ago(secs), sizeBytes: size)
            }
        }
        // Render: the real 900 frame final.
        if phase >= .render {
            var r = RenderProgress()
            r.kind = .final; r.startedAt = ago(143); r.outputName = "final.mp4"
            r.posterURL = existing(video.appendingPathComponent("renders/poster.png"))
            r.videoURL = existing(video.appendingPathComponent("renders/final.mp4"))
            if renderDone {
                r.state = .done; r.framesDone = 900; r.framesTotal = 900; r.fraction = 1; r.finishedAt = ago(0); r.startedAt = ago(318)
            } else {
                r.state = .rendering; r.framesDone = 412; r.framesTotal = 900; r.fraction = 412.0 / 900; r.etaSeconds = 64
                r.stage = "Streaming frame 412/900 (3 workers)"
            }
            s.render = r
            if renderDone { s.finishedAt = ago(0); for index in s.phases.indices { s.phases[index].state = .done; s.phases[index].endedAt = s.phases[index].endedAt ?? ago(0) }; s.remaining = nil }
        }
        // The "now" sentence, in the voice the engine will use.
        let crewRunning = s.crew(in: phase, running: true).first?.name
        switch phase {
        case .research:
            let latest = s.research.sources.last
            s.now = NowLine(phase: .research, kind: latest?.kind == .search ? .searching : .reading,
                            text: latest.map { "\($0.kind == .search ? "Searching" : "Reading") \($0.display) (\(s.research.sourceCount) of \(s.research.budget?.sources ?? 6) sources)" } ?? "Getting started",
                            detail: "Two helpers are collecting the real screens, logo and type", since: ago(5))
        case .script: s.now = NowLine(phase: .script, kind: .writing, text: "Three writers are drafting the scripts", detail: "Writing the Bold script", since: ago(60))
        case .look: s.now = NowLine(phase: .look, kind: .drawing, text: "Three designers are drawing a look for your story", detail: "The Wild design system is on its specimen", since: ago(60))
        case .plan: s.now = NowLine(phase: .plan, kind: .drawing, text: "Drawing key frame 6 of 8", detail: "Motion, transitions and music are already decided", since: ago(30))
        case .animatic: s.now = NowLine(phase: .animatic, kind: .waiting, text: "Your turn: review the animatic", detail: "8 scenes, 30 seconds, with the music. Add notes where something should change.", since: ago(120))
        case .build: s.now = NowLine(phase: .build, kind: .building, text: "Animating scene 6 of 8: the fold into the Mac", detail: "Five scenes are built on the shared gallery set", since: ago(40))
        case .check: s.now = NowLine(phase: .check, kind: .checking, text: "Two critics are watching draft 3", detail: "Round 2 of the checks: one for how it moves, one for every word and screen", since: ago(90))
        case .render:
            s.now = renderDone ? NowLine(phase: .render, kind: .finished, text: "The final is rendered", detail: "30 seconds, motion blur and grain added, sound check clean")
                : NowLine(phase: .render, kind: .rendering, text: "Rendering 412 of 900 frames, \(FilmProgressFormat.about(64)) left", detail: "Every scene gets the same motion blur and a fine grain", since: ago(5))
        }
    }

    // MARK: Activity (the real feed's wording, shortened)

    private static func activity(upTo phase: ProgressPhase, now: Date, phaseStarts: [ProgressPhase: Date]) -> [ProgressActivity] {
        typealias Item = (ProgressActivity.Kind, String, String?)
        let all: [ProgressPhase: [Item]] = [
            .research: [(.milestone, "Read your brief", nil), (.milestone, "Checked the tools", "Node, FFmpeg, HyperFrames and the headless browser are all ready."),
                        (.ask, "Asked: can I look at an earlier ChatGPT film on this Mac?", nil), (.answer, "You said yes, look at it", nil),
                        (.crew, "Dispatched 2 researchers", "Collecting real screens of ChatGPT for Mac; Finding the real logo, colours, type and motion."),
                        (.source, "Read openai.com/chatgpt/desktop", nil), (.source, "Searched \u{201C}ChatGPT macOS app release notes\u{201D}", nil),
                        (.milestone, "Product research is in", "ChatGPT's desktop app changed in July: Chat, Work and Codex in one app."),
                        (.milestone, "Brand kit is in", "The official blossom and wordmark, OpenAI Sans and the violet-to-blue product imagery.")],
            .script: [(.crew, "Three writers started", "Writing the Sure, Bold and Wild scripts from the truth sheet."), (.crew, "An editor is reading them", "Like a hostile reader."),
                      (.ask, "Ready for you: pick a script", nil), (.answer, "You picked Bold", nil)],
            .look: [(.crew, "Three designers started", "A design system each for the Bold story."), (.file, "Specimens drawn", "Sure, Bold and Wild."),
                    (.ask, "Ready for you: pick a look", nil), (.answer, "You picked the Painted Room look", nil)],
            .plan: [(.milestone, "Decided the motion", "Springy on the turn, still everywhere else."), (.milestone, "Decided the music", "A warm piano bed, the reveal on a downbeat."),
                    (.file, "Key frames drawing", "8 scenes, one per scene, on the shared gallery."), (.file, "Key frame 5 drawn", nil)],
            .animatic: [(.milestone, "Animatic is ready", "8 scenes, 30 seconds, one walk through the painted gallery."), (.ask, "Ready for you: the animatic", nil),
                        (.answer, "You approved it", "The shortcut moment held a beat longer.")],
            .build: [(.milestone, "Plan handed to HyperFrames", "With OpenAI Sans staged and the motion score in the storyboard."), (.crew, "A set builder is making the gallery once", "So the room is identical across every cut."),
                     (.crew, "Six animators started", "One per scene on top of the shared set."), (.file, "Scene 4 built", "The long gallery."), (.file, "Scene 5 built", "The bell jar exhibit.")],
            .check: [(.command, "Ran the gates", "Motion contract, 3D scenes, slop check, lint: clean."), (.critic, "Critics want more", "The fold must read as a real hinge; the long gallery needs its exhibits clear of the placard."),
                     (.file, "Four fixes in", "The room folds on real hinges and the window is rebuilt to today's ChatGPT."), (.render, "Draft 1 rendered", "30.0 s, sound check clean."),
                     (.critic, "Draft 2 passes every check", "Motion contract, 3D scenes, slop on the rendered film, sound -14.1 LUFS."), (.critic, "The film critic wants two last changes", nil)],
            .render: [(.ask, "Ready for you: the render", nil), (.answer, "You picked render", nil), (.render, "Rendering the final", "One 180-degree shutter on every scene and a fine grain.")],
        ]
        var out: [ProgressActivity] = []
        for p in ProgressPhase.allCases where p <= phase {
            let items = all[p] ?? []
            let start = phaseStarts[p] ?? now.addingTimeInterval(-600)
            let end = p == phase ? now.addingTimeInterval(-6) : (phaseStarts.values.filter { $0 > start }.min() ?? now)
            for (index, item) in items.enumerated() {
                let t = start.addingTimeInterval(end.timeIntervalSince(start) * (Double(index) + 0.6) / Double(items.count + 1))
                out.append(ProgressActivity(id: "\(p.rawValue)-\(index)", time: t, phase: p, kind: item.0, title: item.1, detail: item.2))
            }
        }
        return out
    }

    // MARK: Harness

    /// A model for a snapshot plus the session the views also read (aspect, captures).
    static func model(_ phase: ProgressPhase = .build) -> FilmSessionModel {
        let current = [ProgressPhase.research: "brief", .script: "story", .look: "look", .plan: "motion", .animatic: "animatic", .build: "build", .check: "build", .render: "render"][phase] ?? "build"
        let json = #"{"title":"ChatGPT for Mac launch test","current":"\#(current)","steps":{"brief":{"status":"\#(phase == .research ? "working" : "done")","fields":{"aspect":"16:9","length_s":30,"subject":"A launch film for the ChatGPT desktop app on Mac"}}}}"#
        let snapshot = (try? SessionSnapshot(data: Data(json.utf8))) ?? SessionSnapshot()
        return FilmSessionModel(fixture: snapshot, run: run, workspace: film)
    }

    struct Host: View {
        let progress: FilmProgress
        let model: FilmSessionModel
        var notice: AutoResumeNotice?
        var body: some View {
            NavigationStack {
                VStack(spacing: 0) {
                    FilmStageBar(current: model.snapshot.stage, decided: model.snapshot.decidedCalls, canSelect: { _ in false }, onSelect: { _ in })
                    FilmProgressView(model: model, progress: progress, onPause: {}, onShowLog: {}, pace: .fast, autoResume: notice, onResumeNow: notice == nil ? nil : {})
                }
                .background(Color(nsColor: .windowBackgroundColor))
                .navigationTitle("ChatGPT for Mac launch test")
            }
            .tint(.rasan)
        }
    }

    static func run(into directory: URL) async {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let size = CGSize(width: Double(ProcessInfo.processInfo.environment["RASAN_SNAP_W"] ?? "") ?? 1000, height: Double(ProcessInfo.processInfo.environment["RASAN_SNAP_H"] ?? "") ?? 700)
        let now = Date()
        let cases: [(String, FilmProgressSnapshot)] = [
            ("research", snapshot(.research, now: now)), ("research-over", snapshot(.research, now: now, over: true)), ("script", snapshot(.script, now: now)),
            ("look", snapshot(.look, now: now)), ("plan", snapshot(.plan, now: now)), ("animatic", snapshot(.animatic, now: now)), ("build", snapshot(.build, now: now)),
            ("check", snapshot(.check, now: now)), ("render", snapshot(.render, now: now)), ("render-done", snapshot(.render, now: now, renderDone: true)),
        ]
        let notices: [String: AutoResumeNotice] = [
            "resume-notice": AutoResumeNotice(text: AutoResumePolicy.resumingText, since: now.addingTimeInterval(-4), resumesAt: now.addingTimeInterval(6)),
            "limit-notice": AutoResumeNotice(text: SessionLimit(resetText: "3pm", resetsAt: now.addingTimeInterval(7200)).message, since: now.addingTimeInterval(-30), resumesAt: now.addingTimeInterval(7200), isLimit: true),
        ]
        let only = ProcessInfo.processInfo.environment["RASAN_PROGRESS_ONLY"].map { Set($0.split(separator: ",").map(String.init)) }
        for dark in [false, true] {
            let all = cases + [("resume-notice", snapshot(.build, now: now)), ("limit-notice", snapshot(.plan, now: now))]
            for (name, snap) in all where only == nil || only!.contains(name) {
                let host = Host(progress: FilmProgress.fixture(snap), model: model(snap.currentPhase), notice: notices[name])
                await SnapshotHarness.capture(host, size: size, dark: dark, titled: true, title: "ChatGPT for Mac launch test",
                                              to: directory.appendingPathComponent("progress-\(name)\(dark ? "-dark" : "").png"))
            }
            // The Director panel with the per-phase cost table.
            let monitor = DirectorMonitor()
            let (t, health) = DirectorMonitorFixtures.telemetry(.working)
            monitor.present(run: URL(fileURLWithPath: "/tmp/fixture-run"), telemetry: t, health: health, live: true, budget: nil)
            let panel = DirectorMonitorPanel(monitor: monitor, progress: snapshot(.check, now: now)).background(Color(nsColor: .windowBackgroundColor)).tint(.rasan)
            await SnapshotHarness.capture(panel, size: CGSize(width: 408, height: 980), dark: dark, titled: false, to: directory.appendingPathComponent("progress-director-panel\(dark ? "-dark" : "").png"))
        }
    }
}
