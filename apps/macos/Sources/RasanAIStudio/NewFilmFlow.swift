import AppKit
import AVFoundation
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

/// What the New film page owns and the setup flow borrows: attaching files, picking a format, the settings chips, the run button.
struct FlowHost {
    var addFiles: ([URL]) -> Bool
    var chooseFiles: () -> Void
    var removeSource: (URL) -> Void
    var pickOption: (FormatCatalog.Option) -> Void
    var undoAutoPick: () -> Void
    /// Runs the automatic format match now (the page debounces it while typing), so the first screen already knows.
    var settleFormat: () async -> Void
    var briefPlaceholder: String
    /// Speed, quality, motion, brand and the director, as visible controls (the "How RasanAI works" card).
    var howItWorks: AnyView = AnyView(EmptyView())
    /// The footage folder well and the "Make it like this" well, drawn inside the Ready page's cards.
    var footageWell: AnyView = AnyView(EmptyView())
    var referenceWell: AnyView = AnyView(EmptyView())
    /// Start film, Add to queue or Save changes: the page's own button, with its checks and its ⌘↩.
    var runButton: AnyView
    /// Discard, the "kept if you leave" note, and Save to Library.
    var footerActions: AnyView
}

/// Where the walk is, and what the walk has learned: provenance of every answer, the series in play, the example edit.
@MainActor @Observable
final class NewFilmFlowModel {
    var step: FlowStep = .material
    var started = false
    private(set) var history: [FlowStep] = []
    private(set) var visited: Set<FlowStep> = []
    /// A row on Review sent the person back to one screen: Continue returns to Review instead of walking on.
    var returnToReview = false
    /// "Change" on the confirm line: the format picker is a screen again.
    var forceKind = false
    var series: Series?
    var startingSeries = false
    var seriesName = ""
    var provenance: [String: AnswerSource] = [:]
    var evidence: [String: String] = [:]
    var example: URL?
    var marksFound = false
    var clipFacts: (name: String, seconds: Int, aspect: String)?
    let learner = TasteLearner()
    /// The ending card was asked for and no file is chosen yet.
    var needsEndingFile = false
    var message: String?

    func go(to next: FlowStep) {
        if next != step { history.append(step) }
        step = next; visited.insert(next)
    }
    func back() {
        guard let previous = history.popLast() else { return }
        returnToReview = false; needsEndingFile = false
        step = previous
    }
    var canGoBack: Bool { !history.isEmpty }
    func begin(at first: FlowStep) { started = true; step = first; visited = [first] }

    func source(_ key: String, default fallback: AnswerSource = .auto) -> AnswerSource { provenance[key] ?? fallback }

    /// Forgets what a series filled in, when the person picks "Just this film" after trying one.
    func clearSeriesAnswers(_ draft: inout FilmDraft) {
        guard series != nil else { return }
        for (key, source) in provenance where source == .series { provenance[key] = nil }
        draft.preferences = [:]; draft.series = nil; draft.endingFile = nil
        series = nil
    }

    /// Fills the draft from what the learn job found; an answer the person (or a series) already gave is never replaced.
    func absorb(_ result: TasteResult, questions: TasteQuestions?, draft: inout FilmDraft) {
        guard let questions else { return }
        for (id, answer) in result.confident(using: questions) {
            if let given = provenance[id], given == .you || given == .series { continue }
            draft.preferences[id] = answer.choice
            provenance[id] = .example
            evidence[id] = answer.evidence
        }
        marksFound = result.foundMarks
        if draft.preferences["ending"] == "card", draft.endingFile == nil, let file = result.endingFile(in: learner.directory ?? URL(fileURLWithPath: "/")) {
            draft.endingFile = file.path
        }
    }

    /// "Start a series" was picked and the film is starting: the series is made now, so the film's brief names it.
    func commitStartingSeries(_ draft: inout FilmDraft, store: StudioStore, catalog: FormatCatalog?, fallbackName: String) {
        guard startingSeries, draft.series == nil else { return }
        let typed = seriesName.trimmingCharacters(in: .whitespacesAndNewlines)
        _ = createSeries(named: typed.isEmpty ? fallbackName : typed, draft: &draft, store: store, catalog: catalog)
    }

    @discardableResult
    func createSeries(named title: String, draft: inout FilmDraft, store: StudioStore, catalog: FormatCatalog?) -> Series? {
        let option = catalog?.option(draft.format?.option)
        let fromClip = option.map { catalog?.readsClip($0) ?? false } ?? false
        do {
            let made = try SeriesLibrary.create(name: title, from: draft, lengthFromClip: fromClip, referenceSource: example,
                                                marks: learner.result?.marks ?? [], in: store.libraryRoot)
            draft.series = made.ref
            if draft.preferences["ending"] == "card" { draft.endingFile = made.endingURL?.path ?? draft.endingFile }
            series = made; startingSeries = false
            store.reloadSeries()
            message = "Saved as the \(made.name) series."
            return made
        } catch {
            store.errorMessage = "The series could not be saved. \(error.localizedDescription)"
            return nil
        }
    }
}

/// New film, one question per screen. The screens are computed from the draft and the catalogues (`NewFilmSteps`), each
/// answer says where it came from on Review, and every screen can be skipped: what is not answered, RasanAI decides.
struct NewFilmFlow: View {
    @Bindable var store: StudioStore
    @Bindable var model: NewFilmFlowModel
    @Binding var draft: FilmDraft
    @Binding var name: String
    let newSources: [URL]
    let existingSources: [URL]
    let catalog: FormatCatalog?
    let questions: TasteQuestions?
    /// The draft and its files are loaded: the walk can begin.
    let ready: Bool
    let editing: Bool
    let working: Bool
    let host: FlowHost
    /// False only where a view is drawn offscreen (a scroll view draws nothing there).
    var scrolls = true

    @State private var highlight: Int?
    @State private var briefFocused = false
    @State private var focusRequest = 0
    @State private var showSaveSeries = false
    @State private var seriesTitle = ""
    @State private var customLength = false
    @State private var reviewBriefFocused = false
    @State private var formatOpen = false
    @State private var pageWidth: CGFloat = 900
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var tilesFocused: Bool

    private static let lengths = [15, 30, 45, 60, 90, 120]
    private static let reviewWidth: CGFloat = 1100
    private static let shapes: [(id: String, title: String, symbol: String, detail: String)] = [
        ("16:9", "Landscape", "rectangle", "Wide, for YouTube, sites and slides."),
        ("9:16", "Portrait", "rectangle.portrait", "Tall, for Reels, Shorts and TikTok."),
        ("1:1", "Square", "square", "For feeds."),
    ]

    private var option: FormatCatalog.Option? { catalog?.option(draft.format?.option) }
    private var readsClip: Bool { option.map { catalog?.readsClip($0) ?? false } ?? false }
    private var trimmedBrief: String { draft.brief.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var asked: [TasteQuestions.Question] { option.flatMap { questions?.questions(for: $0) } ?? [] }

    // MARK: Steps

    private var context: FlowContext {
        var c = FlowContext()
        c.hasSeries = !store.seriesList.isEmpty
        c.seriesChosen = model.series != nil
        c.startingSeries = model.startingSeries
        c.formatConfident = draft.format?.why != nil && !model.forceKind && !model.visited.contains(.kind)
        c.marksFound = model.marksFound
        let ids = Set(asked.map(\.id))
        c.answered = Set(model.provenance.filter { ids.contains($0.key) && ($0.value == .series || $0.value == .example) }.keys)
            .filter { !model.visited.contains(.question($0)) }
        let standing = model.series.map { !$0.brief.isEmpty && trimmedBrief == $0.brief } ?? false
        c.briefNeedsAttention = trimmedBrief.isEmpty || standing || model.visited.contains(.brief)
        return c
    }
    private var steps: [FlowStep] { NewFilmSteps.steps(draft: draft, catalog: catalog, questions: questions, context: context) }

    /// The walk goes on from here: the next screen in the list, or, when this screen left the list (its answer arrived from
    /// the example), the first one not seen yet.
    private func nextStep() -> FlowStep {
        let list = steps
        if let next = NewFilmSteps.next(after: model.step, in: list) { return next }
        return list.first { !model.visited.contains($0) && $0 != model.step } ?? .review
    }
    private func advance() {
        commitHighlight()
        if model.needsEndingFile, draft.preferences["ending"] == "card", draft.endingFile == nil { return }
        if model.returnToReview { model.returnToReview = false; model.go(to: .review); return }
        model.go(to: nextStep())
    }

    // MARK: Body

    var body: some View {
        VStack(spacing: 0) {
            if scrolls { ScrollView { page }} else { page.frame(maxHeight: .infinity, alignment: .top) }
            if model.step != .review { footer }
        }
        .overlay(alignment: .bottom) { if model.step == .review { reviewBar.transition(.move(edge: .bottom).combined(with: .opacity)) } }
        .background(Color.appBackground)
        .animation(.snappy(duration: 0.2), value: model.step)
        .task(id: ready) {
            guard ready, !model.started else { return }
            await host.settleFormat()
            // A series page opens this with its series picked, or with "Start a series" already chosen: the first screen is then answered.
            var skipSeriesScreen = false
            if let folder = store.newFilmSeries {
                store.newFilmSeries = nil
                if let picked = store.seriesList.first(where: { $0.folder.standardizedFileURL == folder.standardizedFileURL }) { fill(picked); skipSeriesScreen = true }
            }
            if store.newFilmStartsSeries { store.newFilmStartsSeries = false; model.startingSeries = true; skipSeriesScreen = true }
            if store.newFilmStartsAtReview || editing {
                store.newFilmStartsAtReview = false
                model.begin(at: .review)
            } else { model.begin(at: steps.first { !skipSeriesScreen || $0 != .series } ?? .material) }
            customLength = !Self.lengths.contains(draft.duration)
        }
        .task(id: clipKey) { await readClip() }
        .onChange(of: model.step) { _, step in
            highlight = nil
            if case .question = step { tilesFocused = true } else if step == .series { tilesFocused = true }
            if step == .brief { focusRequest += 1 }
        }
        .onChange(of: model.learner.state) { _, state in
            if state == .done, let result = model.learner.result { model.absorb(result, questions: questions, draft: &draft) }
        }
        .onDisappear { model.learner.cancel() }
        .alert("Save as series", isPresented: $showSaveSeries) {
            TextField("Series name", text: $seriesTitle)
            Button("Cancel", role: .cancel) { }
            Button("Save") { model.createSeries(named: seriesTitle, draft: &draft, store: store, catalog: catalog) }
                .disabled(seriesTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } message: { Text("Saves these answers, the brand, the end card and the format, so the next episode starts from them. It also keeps what you tell RasanAI about this series from now on.") }
    }

    private var page: some View {
        VStack(alignment: .leading, spacing: 22) {
            content
        }
        .disabled(working)
        .padding(.horizontal, 32).padding(.top, 28).padding(.bottom, model.step == .review ? 110 : 28)
        .frame(maxWidth: model.step == .review ? Self.reviewWidth + 64 : 940, alignment: .leading).frame(maxWidth: .infinity)
        .id(model.step)
    }

    @ViewBuilder private var content: some View {
        switch model.step {
        case .series: seriesScreen
        case .kind: kindScreen
        case .material: materialScreen
        case .brief: briefScreen
        case .shape: shapeScreen
        case .example: exampleScreen
        case .question(let id): questionScreen(id)
        case .review: reviewScreen
        }
    }

    private func header(_ title: String, _ detail: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 28, weight: .semibold, design: .rounded)).accessibilityAddTraits(.isHeader)
            if let detail { Text(detail).font(.system(size: 14)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
        }
    }

    // MARK: 1 Series

    private var seriesScreen: some View {
        VStack(alignment: .leading, spacing: 20) {
            header("Is this part of a series?", "A series remembers the answers, the brand, the end card and the look, so each episode asks less.")
            AnswerGrid {
                ForEach(Array(store.seriesList.enumerated()), id: \.element.id) { index, series in
                    AnswerTile(symbol: "rectangle.stack", title: series.name, detail: series.summaryLine,
                               selected: model.series?.id == series.id, highlighted: highlight == index) { choose(series) }
                }
                AnswerTile(symbol: "film", title: "Just this film", detail: "Nothing is remembered for next time.",
                           selected: model.series == nil && !model.startingSeries, highlighted: highlight == store.seriesList.count) { chooseJustThisFilm() }
                AnswerTile(symbol: "plus.rectangle.on.rectangle", title: "Start a series", detail: "Saved when you start this film. Drop an edit you like to learn its style.",
                           selected: model.startingSeries, highlighted: highlight == store.seriesList.count + 1) { startSeries() }
            }
            .focusable().focused($tilesFocused).focusEffectDisabled()
            .onKeyPress(.leftArrow) { moveHighlight(-1, count: store.seriesList.count + 2) }
            .onKeyPress(.rightArrow) { moveHighlight(1, count: store.seriesList.count + 2) }
        }
    }

    private func choose(_ series: Series) {
        fill(series)
        model.go(to: nextStep())
    }
    private func fill(_ series: Series) {
        model.clearSeriesAnswers(&draft)
        model.series = series; model.startingSeries = false
        draft.apply(series, catalog: catalog)
        model.provenance["format"] = .series
        model.provenance["shape"] = .series
        if case .seconds = series.length { model.provenance["length"] = .series }
        for id in series.preferences.keys { model.provenance[id] = .series }
        if series.brand != nil { model.provenance["brand"] = .series }
        if !series.brief.isEmpty { model.provenance["brief"] = .series }
        customLength = !Self.lengths.contains(draft.duration)
    }
    private func chooseJustThisFilm() {
        model.clearSeriesAnswers(&draft)
        model.startingSeries = false
        model.go(to: nextStep())
    }
    private func startSeries() {
        model.clearSeriesAnswers(&draft)
        model.startingSeries = true
        model.go(to: nextStep())
    }

    // MARK: 2 What are you making

    private var kindScreen: some View {
        VStack(alignment: .leading, spacing: 16) {
            header("What are you making?", "Optional. RasanAI picks one from your words if you don't.")
            if let catalog {
                FormatPickerView(catalog: catalog, pick: draft.format, canAct: !working,
                                 onPick: { host.pickOption($0) },
                                 onScope: { draft.format?.scope = $0 }, changing: .constant(true), showsChip: false, alwaysGrid: true, showsHeading: false)
                if option?.status == .soon {
                    Text("This format is coming soon. Choose another above.").font(.system(size: 12)).foregroundStyle(Color(nsColor: .systemOrange))
                }
            } else {
                Text("The list of formats is not available. RasanAI will choose from your words.").font(.system(size: 13)).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: 3 Your material

    private var materialScreen: some View {
        let slots = option.flatMap { catalog?.inputSlots(for: $0) } ?? []
        let fileSlot = slots.first { ($0.accepts.contains("file") || $0.accepts.contains("folder")) && $0.required } ?? slots.first { $0.accepts.contains("file") || $0.accepts.contains("folder") }
        let takesFolder = option.flatMap { catalog?.folderPrompt(for: $0) } != nil
        return VStack(alignment: .leading, spacing: 18) {
            header(fileSlot.map { _ in "Your material" } ?? "Anything to start from?",
                   fileSlot == nil ? "Footage, images or documents are optional. Words are enough." : nil)
            if let catalog, let option, draft.format?.why != nil, !model.forceKind { formatConfirm(option, catalog: catalog) }
            if let option, let catalog, fileSlot == nil || slots.count > 1 { FormatInputsNote(catalog: catalog, option: option) }
            FlowDropZone(symbol: takesFolder ? "folder" : "square.and.arrow.down.on.square",
                         title: fileSlot?.prompt ?? "Drop footage, images or documents here",
                         detail: takesFolder ? "A folder stays where it is and nothing is copied. Single files are copied into the film."
                             : "Copies go into the film; your originals stay put.",
                         buttons: [("Choose files…", { host.chooseFiles() })] + (takesFolder ? [("Choose folder…", { chooseFolder() })] : []),
                         onDrop: { host.addFiles($0) })
            if !newSources.isEmpty || !existingSources.isEmpty || !draft.linked.filter({ $0.kind == .footage }).isEmpty {
                VStack(spacing: 8) {
                    ForEach(existingSources, id: \.self) { FlowFileChip(url: $0) }
                    ForEach(newSources, id: \.self) { url in FlowFileChip(url: url) { host.removeSource(url) } }
                    ForEach(draft.linked.filter { $0.kind == .footage }) { source in
                        LinkedSourceRow(source: source) { draft.linked.removeAll { $0 == source } }
                            .padding(10).background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
            }
            if let facts = model.clipFacts, readsClip {
                Label("\(facts.seconds) seconds, \(Self.shapeName(facts.aspect).lowercased()), read from \(facts.name). Length and shape are never asked.", systemImage: "waveform.badge.magnifyingglass")
                    .font(.system(size: 12.5)).foregroundStyle(.secondary)
            }
            Text("No files? That's fine. RasanAI can start from your words.").font(.system(size: 12.5)).foregroundStyle(.tertiary)
        }
    }

    private func formatConfirm(_ option: FormatCatalog.Option, catalog: FormatCatalog) -> some View {
        HStack(spacing: 10) {
            Image(systemName: FormatPickerView.symbol(option.tile)).foregroundStyle(Color.rasan)
            VStack(alignment: .leading, spacing: 2) {
                Text("Making: \(option.title)").font(.system(size: 13.5, weight: .semibold))
                if let why = draft.format?.why, !why.isEmpty { Text(why.hasSuffix(".") ? why : why + ".").font(.system(size: 12)).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 8)
            Button("Change") { model.forceKind = true; model.go(to: .kind) }.controlSize(.small)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Color.rasan.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.rasan.opacity(0.35), lineWidth: 0.8) }
    }

    private func chooseFolder() {
        let panel = NSOpenPanel(); panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.allowsMultipleSelection = true
        panel.title = "Choose a folder of footage"; panel.prompt = "Use folder"
        panel.message = "The folder stays where it is. RasanAI reads it in place and never changes it."
        if panel.runModal() == .OK { _ = host.addFiles(panel.urls) }
    }

    // MARK: 4 Brief

    private var briefScreen: some View {
        VStack(alignment: .leading, spacing: 18) {
            header("Tell RasanAI about it", "A sentence is enough. What is it, who is it for, how should it feel?")
            ComposerTextView(text: $draft.brief, placeholder: host.briefPlaceholder, minLines: 5, maxLines: 14, focused: $briefFocused, focusRequest: focusRequest)
                .frame(maxWidth: .infinity)
                .padding(16)
                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(briefFocused ? Color.rasan.opacity(0.7) : Color(nsColor: .separatorColor), lineWidth: briefFocused ? 1.5 : 0.5))
            if model.series != nil, model.source("brief") == .series {
                Text("This is the standing brief from your series. Say what is different about this episode.").font(.system(size: 12.5)).foregroundStyle(.secondary)
            }
        }
        .onChange(of: draft.brief) { if model.provenance["brief"] == .series, trimmedBrief != model.series?.brief { model.provenance["brief"] = nil } }
    }

    // MARK: 5 Length and shape

    private var shapeScreen: some View {
        VStack(alignment: .leading, spacing: 22) {
            header("Length and shape", model.clipFacts != nil ? "Read from your clip. Change it only if you want something different." : nil)
            VStack(alignment: .leading, spacing: 10) {
                Text("How long").font(.system(size: 13, weight: .semibold))
                FlowLayout(spacing: 10) {
                    ForEach(Self.lengths, id: \.self) { seconds in
                        lengthChip(ComposerLayout.shortLength(seconds), selected: !customLength && draft.duration == seconds) {
                            customLength = false; draft.duration = seconds; model.provenance["length"] = .you
                        }
                    }
                    lengthChip("Custom", selected: customLength) { customLength = true; model.provenance["length"] = .you }
                    if customLength {
                        Stepper(value: Binding(get: { draft.duration }, set: { draft.duration = $0; model.provenance["length"] = .you }), in: 5...600, step: 5) {
                            Text("\(draft.duration) s").monospacedDigit().font(.system(size: 13))
                        }.fixedSize()
                    }
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("What shape").font(.system(size: 13, weight: .semibold))
                AnswerGrid {
                    ForEach(Self.shapes, id: \.id) { shape in
                        AnswerTile(symbol: shape.symbol, title: shape.title, detail: shape.detail, selected: draft.aspect == shape.id) {
                            draft.aspect = shape.id; model.provenance["shape"] = .you
                        }
                    }
                }
            }
        }
    }

    private func lengthChip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 14, weight: .medium)).foregroundStyle(.primary)
                .padding(.horizontal, 16).frame(height: 36)
                .background(selected ? Color.primary.opacity(0.14) : Color.primary.opacity(0.06), in: Capsule())
                .overlay { if selected { Capsule().strokeBorder(Color.primary.opacity(0.3), lineWidth: 0.8) } }
        }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
    }

    private static func shapeName(_ aspect: String) -> String { shapes.first { $0.id == aspect }?.title ?? aspect }

    // MARK: 7 Make it like this

    private var exampleScreen: some View {
        VStack(alignment: .leading, spacing: 18) {
            header("Make it like this?", "Drop an edit you like. RasanAI studies its captions, writing, layout and ending, so the next questions are already answered. It is never cut into your film.")
            if let example = model.example {
                FlowFileChip(url: example, symbol: "film") { model.learner.reset(); model.example = nil; draft.linked.removeAll { $0.kind == .reference } }
                learnStatus
            } else {
                FlowDropZone(symbol: "film.stack", title: "Drop an edit you like",
                             detail: "A finished video, from you or from anyone. Optional: skip it and you'll just be asked.",
                             buttons: [("Choose video…", { chooseExample() })], onDrop: { takeExample($0) })
            }
        }
    }

    @ViewBuilder private var learnStatus: some View {
        switch model.learner.state {
        case .running:
            HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Studying your example…").font(.system(size: 13)).foregroundStyle(.secondary) }
            Text("You can carry on. The answers arrive while you go through the rest.").font(.system(size: 12)).foregroundStyle(.tertiary)
        case .done:
            let found = model.evidence.filter { model.provenance[$0.key] == .example }
            VStack(alignment: .leading, spacing: 6) {
                Label(found.isEmpty ? "Studied it, but nothing was clear enough to decide for you." : "Found \(found.count) answer\(found.count == 1 ? "" : "s"):", systemImage: "checkmark.circle")
                    .font(.system(size: 13, weight: .medium))
                ForEach(found.keys.sorted(), id: \.self) { id in
                    Text("\(questions?.question(id)?.question.trimmingCharacters(in: CharacterSet(charactersIn: "?")) ?? id): \(label(id, draft.preferences[id])). \(found[id] ?? "")")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
        case .failed:
            Label("RasanAI couldn't study that one, so it will ask you instead.", systemImage: "info.circle").font(.system(size: 12.5)).foregroundStyle(.secondary)
        case .idle: EmptyView()
        }
    }

    private func chooseExample() {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.canChooseFiles = true; panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.movie, .video]
        panel.title = "Choose a video to make yours like"; panel.prompt = "Use video"
        if panel.runModal() == .OK { _ = takeExample(panel.urls) }
    }
    private func takeExample(_ urls: [URL]) -> Bool {
        guard let url = urls.first(where: { FilmDraft.videoExtensions.contains($0.pathExtension.lowercased()) }) else { return false }
        model.example = url
        if case .success(let reference) = LinkedSource.referenceVideo(url) { draft.linked = LinkedSource.merge(draft.linked, adding: [reference]) }
        model.learner.learn(video: url, clip: readsClip ? clipURL : nil, store: store)
        return true
    }

    // MARK: 6 Taste questions

    private func questionScreen(_ id: String) -> some View {
        let question = questions?.question(id)
        let current = draft.preferences[id]
        return VStack(alignment: .leading, spacing: 20) {
            if let question {
                header(question.question, questionNote(id))
                AnswerGrid {
                    ForEach(Array(question.choices.enumerated()), id: \.element.id) { index, choice in
                        AnswerTile(symbol: TasteThumb.symbol(choice.thumb), title: choice.label, detail: choice.description,
                                   selected: current == choice.id, highlighted: highlight == index) { answer(question, choice) }
                    }
                    AnswerTile(symbol: "sparkles", title: question.unsure, detail: "RasanAI chooses, the way it does today.",
                               selected: current == nil, highlighted: highlight == question.choices.count) { decide(question) }
                }
                .focusable().focused($tilesFocused).focusEffectDisabled()
                .onKeyPress(.leftArrow) { moveHighlight(-1, count: question.choices.count + 1) }
                .onKeyPress(.rightArrow) { moveHighlight(1, count: question.choices.count + 1) }
                if id == "ending", current == "card" { endingCardPicker }
            } else {
                header("One more thing", "This question isn't available in this version of RasanAI.")
            }
        }
        .onAppear { highlight = question?.choices.firstIndex { $0.id == current } }
    }

    private func questionNote(_ id: String) -> String? {
        switch model.provenance[id] {
        case .example?: "From your example: \(model.evidence[id] ?? "")"
        case .series?: "From your series. Change it for this film if you like."
        default: nil
        }
    }

    private func answer(_ question: TasteQuestions.Question, _ choice: TasteQuestions.Choice) {
        draft.preferences[question.id] = choice.id
        model.provenance[question.id] = .you
        model.evidence[question.id] = nil
        if question.id == "ending", choice.id != "card" { draft.endingFile = nil }
        if choice.needsFile, draft.endingFile == nil { model.needsEndingFile = true; return }
        model.needsEndingFile = false
        advance()
    }
    private func decide(_ question: TasteQuestions.Question) {
        draft.preferences[question.id] = nil
        model.provenance[question.id] = nil
        model.evidence[question.id] = nil
        if question.id == "ending" { draft.endingFile = nil }
        model.needsEndingFile = false
        advance()
    }

    @ViewBuilder private var endingCardPicker: some View {
        if let file = draft.endingFile {
            FlowFileChip(url: URL(fileURLWithPath: file)) { draft.endingFile = nil; model.needsEndingFile = true }
        } else {
            FlowDropZone(symbol: "photo.on.rectangle", title: "Choose your end card", detail: "A picture or a video. It is added after the last word.",
                         buttons: [("Choose file…", { chooseEnding() })], onDrop: { takeEnding($0) })
        }
    }
    private func chooseEnding() {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.image, .movie]
        panel.title = "Choose your end card"; panel.prompt = "Use as end card"
        if panel.runModal() == .OK { _ = takeEnding(panel.urls) }
    }
    private func takeEnding(_ urls: [URL]) -> Bool {
        guard let url = urls.first else { return false }
        draft.endingFile = url.path
        model.needsEndingFile = false
        return true
    }

    private func moveHighlight(_ delta: Int, count: Int) -> KeyPress.Result {
        let start = highlight ?? (delta > 0 ? -1 : count)
        highlight = min(count - 1, max(0, start + delta))
        return .handled
    }
    /// Return takes the highlighted tile (arrow keys put it there) before the screen moves on.
    private func commitHighlight() {
        guard let index = highlight else { return }
        highlight = nil
        switch model.step {
        case .question(let id):
            guard let question = questions?.question(id) else { return }
            if index < question.choices.count {
                draft.preferences[id] = question.choices[index].id; model.provenance[id] = .you; model.evidence[id] = nil
                if id == "ending", question.choices[index].id != "card" { draft.endingFile = nil }
                model.needsEndingFile = question.choices[index].needsFile && draft.endingFile == nil
            } else {
                draft.preferences[id] = nil; model.provenance[id] = nil; model.evidence[id] = nil
                if id == "ending" { draft.endingFile = nil }
                model.needsEndingFile = false
            }
        case .series:
            if index < store.seriesList.count { choose(store.seriesList[index]) }
            else if index == store.seriesList.count { chooseJustThisFilm() } else { startSeries() }
        default: break
        }
    }

    // MARK: 8 Review: the film on one page

    /// Every part of the film is on this page and is changed right where it is: no sheet, nothing behind "more".
    private var spring: Animation? { reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.86) }

    private func label(_ question: String, _ choice: String?) -> String {
        guard let choice else { return "Not chosen" }
        return questions?.label(question: question, choice: choice) ?? choice
    }

    private var fileCount: Int { newSources.count + existingSources.count }
    private var footageFolders: [LinkedSource] { draft.linked.filter { $0.kind == .footage } }
    private var displayName: String {
        let typed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !typed.isEmpty { return typed }
        return trimmedBrief.isEmpty ? "Your film" : FilmTitle.fromBrief(trimmedBrief)
    }

    /// The film in one sentence, from what is chosen right now.
    private var summaryLine: String {
        let length = draft.duration >= 60 && draft.duration % 60 == 0 ? "\(draft.duration / 60)-minute" : "\(draft.duration)-second"
        let article = ["8", "11", "18"].contains(where: { length.hasPrefix($0 + "-") }) || length.hasPrefix("8") ? "an" : "a"
        let from = !footageFolders.isEmpty ? "cut from your footage" : fileCount > 0 ? "from your words and \(fileCount) file\(fileCount == 1 ? "" : "s")" : "from your words"
        let core = "\(length) \(Self.shapeName(draft.aspect).lowercased()) film \(from)"
        if let option { return "\(option.title): \(article) \(core)." }
        return "\(article.capitalized) \(core). RasanAI picks what kind."
    }

    private var visibleQuestions: [TasteQuestions.Question] {
        asked.filter { !($0.askIf == "marks-found" && !model.marksFound && draft.preferences[$0.id] == nil) }
    }

    private var reviewScreen: some View {
        VStack(alignment: .leading, spacing: 16) {
            hero
            if model.learner.isRunning {
                HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Still studying your example. Its answers will appear below.").font(.system(size: 12.5)).foregroundStyle(.secondary) }
            }
            cardGrid
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { pageWidth = $0 }
        .animation(spring, value: formatOpen)
        .animation(spring, value: customLength)
        .animation(spring, value: model.startingSeries)
    }

    // MARK: Hero

    private var hero: some View {
        let wide = pageWidth >= 720
        let layout = wide ? AnyLayout(HStackLayout(alignment: .center, spacing: 28)) : AnyLayout(VStackLayout(alignment: .leading, spacing: 20))
        let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)
        return layout {
            VStack(alignment: .leading, spacing: 10) {
                Text("Ready when you are").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.rasan)
                    .accessibilityAddTraits(.isHeader)
                TextField("Name your film", text: $name, prompt: Text(trimmedBrief.isEmpty ? "Name your film" : FilmTitle.fromBrief(trimmedBrief)))
                    .textFieldStyle(.plain).font(.system(size: 30, weight: .semibold, design: .rounded))
                    .disabled(editing)
                    .help(editing ? "Rename this film from the Library" : "Click to rename your film")
                    .accessibilityLabel("Film name")
                Text(summaryLine).font(.system(size: 15)).foregroundStyle(.primary.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
                    .contentTransition(.opacity)
                    .animation(spring, value: summaryLine)
                    .accessibilityLabel("Summary: \(summaryLine)")
                Text("Change anything below, right where it is. What you leave, RasanAI decides.")
                    .font(.system(size: 12.5)).foregroundStyle(.secondary)
                if model.startingSeries {
                    HStack(spacing: 10) {
                        Image(systemName: "rectangle.stack").foregroundStyle(Color.rasan)
                        TextField("Name the new series", text: $model.seriesName).textFieldStyle(.roundedBorder).frame(maxWidth: 300)
                        Text("Saved when you start this film.").font(.system(size: 12)).foregroundStyle(.secondary)
                    }
                    .padding(.top, 4)
                }
                if let message = model.message { Label(message, systemImage: "checkmark.circle").font(.system(size: 12.5)).foregroundStyle(.secondary) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            FilmShapePreview(aspect: draft.aspect, seconds: draft.duration, title: displayName, reduceMotion: reduceMotion)
                .frame(maxWidth: wide ? nil : .infinity)
        }
        .padding(.horizontal, 26).padding(.vertical, 22)
        .background {
            shape.fill(Workspace.panel)
                .overlay { shape.fill(RadialGradient(colors: [Color.rasan.opacity(0.16), .clear], center: .topTrailing, startRadius: 10, endRadius: 520)) }
        }
        .overlay { shape.strokeBorder(Color.primary.opacity(0.09), lineWidth: 1) }
    }

    // MARK: Cards

    private struct Slot: Identifiable { let id: String; let wide: Bool; let view: AnyView }
    private struct SlotRow: Identifiable { let slots: [Slot]; var id: String { slots.map(\.id).joined(separator: "+") } }

    private var slots: [Slot] {
        var out: [Slot] = [
            Slot(id: "format", wide: formatOpen, view: AnyView(formatCard)),
            Slot(id: "shape", wide: false, view: AnyView(shapeCard)),
            Slot(id: "brief", wide: false, view: AnyView(briefCard)),
            Slot(id: "material", wide: false, view: AnyView(materialCard)),
            Slot(id: "reference", wide: false, view: AnyView(referenceCard)),
        ]
        if !store.seriesList.isEmpty || model.series != nil || model.startingSeries { out.append(Slot(id: "series", wide: false, view: AnyView(seriesCard))) }
        out.append(Slot(id: "how", wide: true, view: AnyView(howCard)))
        if !visibleQuestions.isEmpty { out.append(Slot(id: "style", wide: true, view: AnyView(styleCard))) }
        return out
    }

    /// Two columns when there is room, one when there is not. Between wide cards, the others alternate left and right and
    /// each column keeps its own heights, so no card is stretched into empty space. A wide card takes the whole row.
    private var rows: [SlotRow] {
        let columns = pageWidth >= 760 ? 2 : 1
        var out: [SlotRow] = [], run: [Slot] = []
        func flush() { if !run.isEmpty { out.append(SlotRow(slots: run)); run = [] } }
        for slot in slots {
            if slot.wide || columns == 1 { flush(); out.append(SlotRow(slots: [slot])) } else { run.append(slot) }
        }
        flush()
        return out
    }

    private var cardGrid: some View {
        VStack(spacing: 16) {
            ForEach(rows) { row in
                if row.slots.count > 1 {
                    let left = row.slots.enumerated().filter { $0.offset % 2 == 0 }.map(\.element)
                    let right = row.slots.enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
                    HStack(alignment: .top, spacing: 16) {
                        VStack(spacing: 16) { ForEach(left) { $0.view.fixedSize(horizontal: false, vertical: true) } }
                        VStack(spacing: 16) { ForEach(right) { $0.view.fixedSize(horizontal: false, vertical: true) } }
                    }
                } else if let slot = row.slots.first { slot.view }
            }
        }
    }

    private var formatSource: AnswerSource {
        guard option != nil else { return .auto }
        return model.provenance["format"] ?? (draft.format?.why != nil ? .auto : .you)
    }
    private var lengthSource: AnswerSource { readsClip && model.clipFacts != nil ? .clip : model.provenance["length"] ?? .auto }
    private var shapeSource: AnswerSource { readsClip && model.clipFacts != nil ? .clip : model.provenance["shape"] ?? .auto }
    private var briefSource: AnswerSource { model.provenance["brief"] == .series ? .series : trimmedBrief.isEmpty ? .auto : .you }

    private var formatCard: some View {
        ReviewCard(title: "What you're making", symbol: "film", source: formatSource,
                   decide: draft.format == nil ? nil : { withAnimation(spring) { model.provenance["format"] = nil; host.undoAutoPick() } }) {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: option.map { FormatPickerView.symbol($0.tile) } ?? "sparkles")
                    .font(.system(size: 22, weight: .light)).foregroundStyle(Color.rasan)
                    .frame(width: 52, height: 52).background(Color.rasan.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(option?.title ?? "RasanAI picks from your words").font(.system(size: 17, weight: .semibold))
                    if let why = draft.format?.why, !why.isEmpty {
                        Text(why.hasSuffix(".") ? why : why + ".").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
                    } else if option == nil {
                        Text("Or choose one yourself.").font(.system(size: 12)).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                Button { formatOpen.toggle() } label: {
                    Label(formatOpen ? "Done" : "Change", systemImage: formatOpen ? "chevron.up" : "chevron.down")
                }
                .buttonStyle(.rasanSecondary).controlSize(.small).disabled(working || catalog == nil)
                .accessibilityLabel(formatOpen ? "Close the list of formats" : "Change what you're making")
            }
            if option?.status == .soon {
                Text("This format is coming soon. Choose another.").font(.system(size: 12)).foregroundStyle(Color(nsColor: .systemOrange))
            }
            if formatOpen, let catalog {
                FormatPickerView(catalog: catalog, pick: draft.format, canAct: !working,
                                 onPick: { picked in host.pickOption(picked); if picked.status != .soon { formatOpen = false } },
                                 onScope: { draft.format?.scope = $0 }, changing: .constant(true), showsChip: false, alwaysGrid: true, showsHeading: false)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private var shapeCard: some View {
        ReviewCard(title: "Length and shape", symbol: "rectangle.ratio.16.to.9",
                   subtitle: model.clipFacts != nil ? "Read from your clip. Change it only if you want something different." : nil) {
            VStack(alignment: .leading, spacing: 10) {
                ReviewFieldHeader(title: "How long", source: lengthSource, decide: { model.provenance["length"] = nil })
                FlowLayout(spacing: 8) {
                    ForEach(Self.lengths, id: \.self) { seconds in
                        ChoicePill(title: ComposerLayout.shortLength(seconds), selected: !customLength && draft.duration == seconds) {
                            customLength = false; draft.duration = seconds; model.provenance["length"] = .you
                        }
                    }
                    ChoicePill(title: "Custom", selected: customLength) { customLength = true; model.provenance["length"] = .you }
                    if customLength {
                        Stepper(value: Binding(get: { draft.duration }, set: { draft.duration = $0; model.provenance["length"] = .you }), in: 5...600, step: 5) {
                            Text("\(draft.duration) s").monospacedDigit().font(.system(size: 13))
                        }
                        .fixedSize().frame(height: 32)
                        .accessibilityLabel("Length in seconds")
                    }
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                ReviewFieldHeader(title: "What shape", source: shapeSource, decide: { model.provenance["shape"] = nil })
                HStack(spacing: 8) {
                    ForEach(Self.shapes, id: \.id) { shape in
                        ShapePill(id: shape.id, title: shape.title, detail: shape.detail, selected: draft.aspect == shape.id) {
                            draft.aspect = shape.id; model.provenance["shape"] = .you
                        }
                    }
                }
            }
        }
    }

    private var briefCard: some View {
        ReviewCard(title: "Your words", symbol: "text.quote", subtitle: "What it is, who it is for, how it should feel.", source: briefSource) {
            ComposerTextView(text: $draft.brief, placeholder: host.briefPlaceholder, minLines: 4, maxLines: 10, focused: $reviewBriefFocused, focusRequest: 0)
                .frame(maxWidth: .infinity).padding(12)
                .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(reviewBriefFocused ? Color.rasan.opacity(0.7) : Color.primary.opacity(0.10), lineWidth: reviewBriefFocused ? 1.5 : 1))
                .animation(.easeOut(duration: 0.15), value: reviewBriefFocused)
                .accessibilityLabel("Brief")
            HStack(spacing: 10) {
                Button { addLink() } label: { Label("Add a link", systemImage: "link") }.buttonStyle(.rasanSecondary).controlSize(.small)
                    .help("Adds the link on your clipboard, or a blank one to fill in")
                if model.series != nil, model.source("brief") == .series {
                    Text("This is the standing brief from your series. Say what is different about this episode.").font(.system(size: 11.5)).foregroundStyle(.secondary)
                } else if trimmedBrief.isEmpty {
                    Text("A sentence is enough. The film can't start without one.").font(.system(size: 11.5)).foregroundStyle(.secondary)
                }
            }
        }
        .onChange(of: draft.brief) { if model.provenance["brief"] == .series, trimmedBrief != model.series?.brief { model.provenance["brief"] = nil } }
    }

    private var materialCard: some View {
        ReviewCard(title: "Your material", symbol: "folder", subtitle: "Used in your film. Optional: words are enough.") {
            host.footageWell
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(fileCount == 0 ? "No files" : "\(fileCount) file\(fileCount == 1 ? "" : "s")").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
                    Spacer()
                    Button("Add files…") { host.chooseFiles() }.buttonStyle(.rasanSecondary).controlSize(.small).disabled(working)
                        .help("Footage, images or documents. Copies go into the film; your originals stay put.")
                }
                ForEach(existingSources, id: \.self) { FlowFileChip(url: $0) }
                ForEach(newSources, id: \.self) { url in FlowFileChip(url: url) { host.removeSource(url) } }
            }
            if let facts = model.clipFacts, readsClip {
                Label("\(facts.seconds) seconds, \(Self.shapeName(facts.aspect).lowercased()), read from \(facts.name).", systemImage: "waveform.badge.magnifyingglass")
                    .font(.system(size: 11.5)).foregroundStyle(.secondary)
            }
        }
    }

    private var referenceCard: some View {
        ReviewCard(title: "Make it like this", symbol: "film.stack", subtitle: "Studied for pace, type, colour and camera. Never cut in.") {
            host.referenceWell
            if model.example != nil { learnStatus }
        }
    }

    private var seriesCard: some View {
        ReviewCard(title: "Series", symbol: "rectangle.stack", subtitle: "A series remembers the answers, the brand and the end card.",
                   source: model.series != nil ? .series : .you) {
            FlowLayout(spacing: 8) {
                ForEach(store.seriesList, id: \.id) { series in
                    ChoicePill(title: series.name, symbol: "rectangle.stack", selected: model.series?.id == series.id, help: series.summaryLine) {
                        withAnimation(spring) { fill(series) }
                    }
                }
                ChoicePill(title: "Just this film", selected: model.series == nil && !model.startingSeries, help: "Nothing is remembered for next time.") {
                    withAnimation(spring) { model.clearSeriesAnswers(&draft); model.startingSeries = false }
                }
                ChoicePill(title: "Start a series", symbol: "plus", selected: model.startingSeries, help: "Saved when you start this film.") {
                    withAnimation(spring) { model.clearSeriesAnswers(&draft); model.startingSeries = true }
                }
            }
        }
    }

    private var howCard: some View {
        ReviewCard(title: "How RasanAI works", symbol: "slider.horizontal.3",
                   subtitle: "How long it takes, what it costs and how it looks. Each choice says what it means.") {
            host.howItWorks
        }
    }

    private var styleCard: some View {
        ReviewCard(title: "Your style", symbol: "paintbrush.pointed",
                   subtitle: "The questions RasanAI would ask on the way. Answer any here, or leave them to RasanAI.") {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(visibleQuestions.enumerated()), id: \.element.id) { index, question in
                    if index > 0 { Divider().padding(.vertical, 12) }
                    styleRow(question)
                }
            }
        }
    }

    private func styleRow(_ question: TasteQuestions.Question) -> some View {
        let current = draft.preferences[question.id]
        let source: AnswerSource = current == nil ? .auto : model.provenance[question.id] ?? .you
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(question.question).font(.system(size: 13, weight: .semibold))
                SourceTag(source: source)
                Spacer(minLength: 0)
            }
            if let evidence = model.evidence[question.id], !evidence.isEmpty {
                Text(evidence).font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(2)
            }
            FlowLayout(spacing: 8) {
                ForEach(question.choices) { choice in
                    ChoicePill(title: choice.label, symbol: TasteThumb.symbol(choice.thumb), selected: current == choice.id, help: choice.description) {
                        setAnswer(question, choice)
                    }
                }
                ChoicePill(title: question.unsure, symbol: "sparkles", selected: current == nil, help: "RasanAI chooses, the way it does today.") {
                    setAnswer(question, nil)
                }
            }
            if question.id == "ending", current == "card" { endingCardPicker.transition(.opacity) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(question.question)
    }

    /// The same rules as the question screens, without walking on.
    private func setAnswer(_ question: TasteQuestions.Question, _ choice: TasteQuestions.Choice?) {
        withAnimation(spring) {
            if let choice {
                draft.preferences[question.id] = choice.id
                model.provenance[question.id] = .you
                model.evidence[question.id] = nil
                if question.id == "ending", choice.id != "card" { draft.endingFile = nil }
                model.needsEndingFile = choice.needsFile && draft.endingFile == nil
            } else {
                draft.preferences[question.id] = nil
                model.provenance[question.id] = nil
                model.evidence[question.id] = nil
                if question.id == "ending" { draft.endingFile = nil }
                model.needsEndingFile = false
            }
        }
    }

    private func addLink() {
        let clip = NSPasteboard.general.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let link = clip.flatMap { URL(string: $0) }.flatMap { ["http", "https"].contains($0.scheme?.lowercased() ?? "") ? $0.absoluteString : nil } ?? "https://"
        draft.brief += (trimmedBrief.isEmpty ? "" : "\n") + link
        reviewBriefFocused = true
    }

    // MARK: Ready bar

    /// The bar that floats over the bottom of the Ready page: what you are about to start, and the buttons to start it.
    private var reviewBar: some View {
        let compact = pageWidth < 760
        return HStack(spacing: 12) {
            Button { model.back() } label: { Image(systemName: "chevron.left").frame(width: 12) }
                .buttonStyle(.rasanSecondary).disabled(!model.canGoBack || working)
                .keyboardShortcut("[", modifiers: .command)
                .help("Back (⌘[)").accessibilityLabel("Back")
            if !compact {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(ComposerLayout.shortLength(draft.duration)) · \(Self.shapeName(draft.aspect))\(option.map { " · \($0.title)" } ?? "")")
                        .font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    Text("You check the brief, story, look, storyboard and final as it goes.")
                        .font(.system(size: 11.5)).foregroundStyle(.secondary).lineLimit(1)
                }
                .frame(minWidth: 0, alignment: .leading).layoutPriority(-1)
            }
            Spacer(minLength: 8)
            host.footerActions
            if draft.series == nil, !model.startingSeries {
                Button("Save as series…") { seriesTitle = name; showSaveSeries = true }
                    .buttonStyle(.rasanSecondary).disabled(working || trimmedBrief.isEmpty && draft.format == nil)
                    .help("Keep these answers, the brand and the end card for the next episode")
            }
            host.runButton
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .glassPanel()
        .shadow(color: .black.opacity(0.25), radius: 18, y: 6)
        .frame(maxWidth: Self.reviewWidth)
        .padding(.horizontal, 24).padding(.bottom, 16)
    }

    // MARK: Footer

    private var footer: some View {
        let list = steps
        let index = list.firstIndex(of: model.step)
        return HStack(spacing: 14) {
            Button { model.back() } label: { Label("Back", systemImage: "chevron.left") }
                .buttonStyle(.rasanSecondary).disabled(!model.canGoBack || working)
                .keyboardShortcut("[", modifiers: .command)
            HStack(spacing: 6) {
                ForEach(Array(list.enumerated()), id: \.offset) { position, step in
                    Circle().fill(step == model.step ? Color.rasan : Color.primary.opacity(position < (index ?? list.count) ? 0.35 : 0.15))
                        .frame(width: step == model.step ? 8 : 6, height: step == model.step ? 8 : 6)
                        .help(step.title)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Step \((index ?? 0) + 1) of \(list.count)")
            if model.learner.isRunning, model.step != .example {
                HStack(spacing: 6) { ProgressView().controlSize(.mini); Text("Studying your example…").font(.system(size: 11.5)).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 8)
            if working { ProgressView().controlSize(.small) }
            Text("⌘↩ starts now").font(.system(size: 11)).foregroundStyle(.tertiary)
            if model.step == .example || model.step == .material || isQuestion {
                Button(skipTitle) { skip() }.buttonStyle(.rasanSecondary).disabled(working)
            }
            Button { advance() } label: { Text("Continue") }
                .buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction).disabled(working)
                .help("Next (Return)")
            // ⌘↩ starts the film from any screen: the page's own button, kept off screen until Review shows it.
            host.runButton.frame(width: 0, height: 0).clipped().opacity(0).accessibilityHidden(true)
        }
        .padding(.horizontal, 32).padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(Color.appBackground)
        .overlay(alignment: .top) { Divider() }
    }

    private var isQuestion: Bool { if case .question = model.step { true } else { false } }
    private var skipTitle: String {
        switch model.step {
        case .example: "Skip"
        case .material: "Nothing, start from words"
        default: "You decide"
        }
    }
    private func skip() {
        if case .question(let id) = model.step, let question = questions?.question(id) { decide(question); return }
        advance()
    }

    // MARK: What the clip says

    private var clipURL: URL? {
        let linked = draft.linked.filter { $0.kind == .footage && !$0.isFolder }.map(\.url)
        return (newSources + existingSources + linked).first { FilmDraft.videoExtensions.contains($0.pathExtension.lowercased()) }
    }
    private var clipKey: String { "\(readsClip)|\(clipURL?.path ?? "")" }

    /// A film cut from one clip never asks for what the clip already says: its length and whether it is tall, square or wide.
    private func readClip() async {
        guard readsClip, let url = clipURL else {
            if model.clipFacts != nil { model.clipFacts = nil; for key in ["length", "shape"] where model.provenance[key] == .clip { model.provenance[key] = nil } }
            return
        }
        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration).seconds, duration.isFinite, duration > 0 else { return }
        var aspect = draft.aspect
        if let track = try? await asset.loadTracks(withMediaType: .video).first,
           let size = try? await track.load(.naturalSize), let transform = try? await track.load(.preferredTransform) {
            let box = size.applying(transform)
            aspect = ClipFacts.aspect(width: abs(box.width), height: abs(box.height))
        }
        guard !Task.isCancelled else { return }
        let seconds = ClipFacts.seconds(duration)
        draft.duration = seconds; draft.aspect = aspect
        customLength = !Self.lengths.contains(seconds)
        model.provenance["length"] = .clip; model.provenance["shape"] = .clip
        model.clipFacts = (url.lastPathComponent, seconds, aspect)
    }
}
