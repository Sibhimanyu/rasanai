import AppKit
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

/// One calm page for starting (or editing) a film.
struct NewFilmView: View {
    @Bindable var store: StudioStore
    let project: URL?
    /// Home shows only the prompt box (no title, format grid, wells or footer).
    var embedded = false
    @Environment(\.openSettings) private var openSettings
    @State private var name = ""
    /// The title made from the brief and the brief it was made from. While the name still equals it, the title follows the
    /// brief: cleared with it, and made again when the brief changes. A name the person types is never touched.
    @State private var suggested: (title: String, brief: String)?
    @State private var draft = FilmDraft()
    @State private var sources: [URL] = []
    @State private var existingSources: [URL] = []
    @State private var brands: [Brand] = []
    @State private var customLength = false
    @State private var working = false
    @State private var targeted = false
    @State private var loaded = false
    @State private var committed = false
    @State private var recoveryProject: URL?
    @State private var showDiscard = false
    /// The setup walk: where it is, what it learned, which series is in play.
    @State private var flow = NewFilmFlowModel()
    @State private var queueNote: String?
    @State private var showModels = false
    @State private var showGallery = false
    @State private var briefFocused = false
    @State private var focusRequest = 0
    /// The previous option, so a pick only moves length and shape the person has not changed.
    @State private var lastFormatOption: String?
    @State private var changingFormat = false
    /// What an automatic format pick replaced, so "Undo" puts length and shape back; and the format the person undid.
    @State private var beforeAutoPick: (duration: Int, aspect: String, option: String?)?
    @State private var declinedOption: String?

    private static let lengths: [(String, Int)] = [("15 seconds", 15), ("30 seconds", 30), ("45 seconds", 45), ("60 seconds", 60), ("90 seconds", 90), ("2 minutes", 120)]
    private var trimmedBrief: String { draft.brief.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var agent: LocalAgent { store.settings.agent }
    private var directorReady: Bool { store.settings.isReady(agent) }
    private var directorBusy: Bool { store.runtime.isRunning || store.runtime.isPreparing }
    private var editingQueued: Bool { project.map { store.isWaitingInQueue($0) } ?? false }
    private var checkingStart: Bool { StartGate.shared.isChecking }
    private var editorState: FilmEditorDraft { FilmEditorDraft(name: name, film: draft, sources: sources, project: recoveryProject) }
    /// Nothing is saved yet: discarding wipes the brief and options instead of going back to a saved film.
    private var isNewFilm: Bool { project == nil && recoveryProject == nil }
    private var autoName: String {
        trimmedBrief.isEmpty ? "Untitled film" : String(FilmTitle.fromBrief(trimmedBrief).prefix(60))
    }

    var body: some View {
        Group {
            if embedded {
                // On Home: just the prompt box. Start goes straight to Review; Set it up opens the step-by-step setup. Both carry this
                // same unsaved draft, so nothing starts until the person has seen it.
                promptBox
            } else { setup }
        }
        .dropDestination(for: URL.self, action: { urls, _ in add(urls.filter(\.isFileURL)) }, isTargeted: { targeted = $0 })
        .sheet(isPresented: $showGallery) {
            GetInspiredSheet(gallery: store.gallery, selection: MomentSelection(draft.moments)) { picks in
                draft.moments = picks; showGallery = false
            } onCancel: { showGallery = false }
            .tint(.rasan)
        }
        .onChange(of: editorState) { persistEditor() }
        .onDisappear { persistEditor() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in persistEditor() }
        .task(id: "\(agent.id):\(store.settings.path(for: agent))") { await store.settings.check(agent) }
        .task(id: trimmedBrief) { await retitle() }
        .confirmationDialog(isNewFilm ? "Discard this new film?" : "Discard unsaved changes?", isPresented: $showDiscard, titleVisibility: .visible) {
            Button("Discard", role: .destructive) {
                committed = true
                store.settings.clearEditorDraft(for: project)
                if let project { store.showFilm(project) } else { store.goHome() }
            }
        } message: {
            Text(isNewFilm ? "Your brief and options are cleared. Files you added stay where they are on your Mac."
                 : "The film goes back to its last saved version. Your original files are kept.")
        }
        .task {
            // Home's box stays alive under pushed pages: start each visit from the shared draft, never from what it held
            // before the full editor started or discarded that draft.
            if embedded { name = ""; draft = FilmDraft(); sources = []; recoveryProject = nil }
            draft.agent = store.settings.defaultAgent
            draft.pace = store.settings.pace
            brands = BrandLibrary.list(in: URL(fileURLWithPath: store.settings.projectRoot))
            if let project {
                let library = store.settings.library
                let loaded = await Task.detached {
                    ((try? library.read(project).name) ?? project.lastPathComponent, FilmDraft.load(in: project), (try? ProjectSources.files(in: project)) ?? [])
                }.value
                guard !Task.isCancelled else { return }
                name = loaded.0; if let saved = loaded.1 { draft = saved }; existingSources = loaded.2
                customLength = !Self.lengths.contains { $0.1 == draft.duration }
            } else if !store.newFilmPrefill.isEmpty {
                draft.brief = store.newFilmPrefill; store.newFilmPrefill = ""
            }
            if project == nil, !store.newFilmPrefillFiles.isEmpty { sources = store.newFilmPrefillFiles; store.newFilmPrefillFiles = [] }
            if let recovered = store.settings.editorDraft(for: project) {
                // Reopening the editor always retains unsaved work, including selected source references.
                name = recovered.name; draft = recovered.film; sources = recovered.sources
                recoveryProject = recovered.project
                if project == nil { store.filmDraftProject = recovered.project }
                if let folder = recovered.project {
                    existingSources = await Task.detached { (try? ProjectSources.files(in: folder)) ?? [] }.value
                }
                customLength = !Self.lengths.contains { $0.1 == draft.duration }
            }
            if !embedded, let made = store.suggestedFilmTitle, made.title == name { suggested = made }
            if let name = draft.brand, let brand = brands.first(where: { $0.name == name }) ?? brands.first(where: { $0.previousNames.contains(name) }) { draft.brand = brand.name }
            if project == nil, !store.newFilmPrefillMoments.isEmpty { draft.moments = MomentSelection(store.newFilmPrefillMoments).picks; store.newFilmPrefillMoments = [] }
            if !draft.moments.isEmpty { store.gallery.prime(); Task { await store.gallery.loadIfNeeded() } }
            loaded = true
            if project == nil, draft.brief.isEmpty { focusRequest += 1 }
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
    }

    // MARK: What are you making?

    private var catalog: FormatCatalog? { FormatCatalog.installed }
    private var pickedOption: FormatCatalog.Option? { catalog?.option(draft.format?.option) }
    private var briefPlaceholder: String {
        if let option = pickedOption, let prompt = catalog?.subjectPrompt(for: option) { return prompt }
        return "A launch film for my budgeting app. Calm, confident, a little playful. End on the download button."
    }
    /// Words and dropped files that can pre-select a format; changes re-run the match (debounced) while the pick is still automatic.
    private var matchKey: String {
        ([draft.brief] + draft.linked.map(\.path) + sources.map(\.path)).joined(separator: "\u{1}") + (loaded ? "|loaded" : "")
    }

    /// The tile grid, always on the full page (just under the prompt); the format chip scrolls to it.
    @ViewBuilder private var formatPicker: some View {
        if let catalog {
            FormatPickerView(catalog: catalog, pick: draft.format, canAct: !working,
                             onPick: { option in choose(option, in: catalog) },
                             onScope: { draft.format?.scope = $0 }, changing: $changingFormat, showsChip: false, alwaysGrid: true)
                .id("formatGrid")
        }
    }

    /// Under the prompt box: what the picked format asks for, and, when the system picked it, why (with a way back).
    @ViewBuilder private var formatNotes: some View {
        if let catalog, let option = pickedOption {
            VStack(alignment: .leading, spacing: 6) {
                if let why = draft.format?.why, !why.isEmpty {
                    HStack(spacing: 4) {
                        Text("Picked \(option.title): \(why.hasSuffix(".") ? why : why + ".")")
                        Button("Undo") { undoAutoPick() }.buttonStyle(.link)
                    }.font(.system(size: 11.5)).foregroundStyle(.secondary)
                }
                if option.status == .soon {
                    Text("This format is coming soon. Choose another below.").font(.system(size: 12)).foregroundStyle(Color(nsColor: .systemOrange))
                } else { FormatInputsNote(catalog: catalog, option: option) }
            }
            .padding(.horizontal, 4)
        }
    }

    private func choose(_ option: FormatCatalog.Option, in catalog: FormatCatalog, why: String? = nil) {
        // Only a pick the system made can be undone, and it remembers what it replaced.
        beforeAutoPick = why == nil ? nil : (draft.duration, draft.aspect, lastFormatOption)
        catalog.pick(option, in: &draft, previous: catalog.option(lastFormatOption), why: why)
        lastFormatOption = option.id
        customLength = !Self.lengths.contains { $0.1 == draft.duration }
    }

    private func undoAutoPick() {
        declinedOption = draft.format?.option
        draft.format = nil
        if let before = beforeAutoPick { draft.duration = before.duration; draft.aspect = before.aspect; lastFormatOption = before.option }
        beforeAutoPick = nil
        customLength = !Self.lengths.contains { $0.1 == draft.duration }
    }

    /// Reads a length the person wrote ("a 30-second film", "2 minutes") unless Length was already chosen, so the brief and the
    /// chip never disagree.
    private func readLength() {
        guard loaded, project == nil, draft.duration == FilmDraft().duration, !customLength else { return }
        let pattern = #"\b(\d+)\s*[- ]?\s*(seconds?|secs?|minutes?|mins?)\b|\b(\d+)s\b"#
        guard let match = draft.brief.range(of: pattern, options: [.regularExpression, .caseInsensitive]) else { return }
        let text = draft.brief[match].lowercased()
        guard let value = Int(text.prefix { $0.isNumber }) else { return }
        let seconds = text.contains("min") ? value * 60 : value
        guard (5...600).contains(seconds), seconds != draft.duration else { return }
        draft.duration = seconds
        customLength = !Self.lengths.contains { $0.1 == seconds }
    }

    /// Pre-selects a format from the brief's words and any dropped folder or files, until the person picks one themselves.
    /// Only a confident match that can be made today is applied; a guess is worse than no pick.
    private func autoMatch(_ catalog: FormatCatalog) async {
        guard loaded, draft.format == nil || draft.format?.why != nil else { return }
        let request = draft.brief
        let paths = draft.linked.map(\.url) + sources + existingSources
        guard !request.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !paths.isEmpty else { return }
        let found = await Task.detached { catalog.match(request: request, paths: paths) }.value
        guard !Task.isCancelled, let found, found.confident, found.option != draft.format?.option, found.option != declinedOption,
              let option = catalog.option(found.option), option.status != .soon,
              draft.format == nil || draft.format?.why != nil else { return }
        choose(option, in: catalog, why: found.why)
    }

    // MARK: Prompt box

    /// New film on its own page: the step-by-step setup. It edits the same draft the Home box does, so saving, the queue and
    /// the request are unchanged. A film being edited opens on Review.
    private var setup: some View {
        NewFilmFlow(store: store, model: flow, draft: $draft, name: $name, newSources: sources, existingSources: existingSources,
                    catalog: catalog, questions: TasteQuestions.installed, ready: loaded, editing: project != nil, working: working, host: flowHost)
            .task(id: matchKey) {
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                await settleFormat()
            }
            .navigationTitle(project == nil ? "New film" : "Edit film")
            .pageHeader(project == nil ? "New film" : "Edit film") {
                HelpButton(title: "New film", lines: [
                    "One question at a time. Skip any of them: what you leave, RasanAI decides.",
                    "Add footage, images or documents on the material screen, or drop them anywhere on the page. Copies go into the film; originals stay put.",
                    "Drop an edit you like and RasanAI studies it, so the questions about captions, writing and layout are answered for you.",
                    "Review shows every answer and where it came from. More settings holds pace, models, motion design, brand and Inspiration moves.",
                    "Save as series… keeps the answers, brand and end card so the next episode asks less."])
            }
    }

    /// Reads a length written in the brief and pre-selects a format from the words and files, right now.
    private func settleFormat() async {
        readLength()
        if let catalog { await autoMatch(catalog) }
    }

    private var flowHost: FlowHost {
        FlowHost(addFiles: { add($0) }, chooseFiles: { choose() }, removeSource: { url in sources.removeAll { $0 == url } },
                 pickOption: { option in if let catalog { choose(option, in: catalog) } }, undoAutoPick: { undoAutoPick() },
                 settleFormat: { await settleFormat() }, briefPlaceholder: briefPlaceholder,
                 moreSettings: AnyView(moreSettings), runButton: AnyView(runButton), footerActions: AnyView(reviewFooterActions))
    }

    /// Everything that used to sit on the prompt box's chips and in the wells, behind "More settings" on Review.
    private var moreSettings: some View {
        VStack(alignment: .leading, spacing: 16) {
            FlowLayout(spacing: ComposerLayout.gap) {
                paceChip
                if agent == .claude { modelsChip }
                motionChip
                brandChip
            }
            HStack(spacing: 4) {
                Text(directorReady ? "Directed by \(agent.title) ·" : "No director set up yet ·")
                Button(directorReady ? "Change" : "Set up…") { if directorReady { openSettings() } else { store.settings.showWelcome = true } }
                    .buttonStyle(.link)
            }.font(.system(size: 12)).foregroundStyle(.secondary)
            linkedWells
        }
    }

    /// Beside the run button on Review: discard, the note that the draft is kept, and Save to Library.
    private var reviewFooterActions: some View {
        HStack(spacing: 10) {
            if loaded && !editorState.isEmpty {
                Button(isNewFilm ? "Discard film…" : "Discard changes…", role: .destructive) { showDiscard = true }.buttonStyle(.rasanSecondary).disabled(working)
            }
            if working || checkingStart { ProgressView().controlSize(.small) }
            if let queueNote { Text(queueNote).font(.system(size: 12)).foregroundStyle(.secondary).transition(.opacity) }
            Button("Save to Library") { save(start: false) }.buttonStyle(.rasanSecondary).disabled(working || (project == nil && trimmedBrief.isEmpty && name.isEmpty))
                .help("Adds this film to your Library without starting it")
        }
    }

    /// One classic prompt box: the brief, the moves I like as thumbnails, any attached files, and one toolbar row pinned to the
    /// bottom: attach and format on the left, settings chips in the middle (folding into the overflow when narrow), Start film on the right.
    private var promptBox: some View {
        VStack(alignment: .leading, spacing: 12) {
            ComposerTextView(text: $draft.brief, placeholder: briefPlaceholder, minLines: 3, maxLines: 12, focused: $briefFocused, focusRequest: focusRequest)
                .frame(maxWidth: .infinity)
            // On the New film page the moves live in the Make it like this well; Home has no wells, so they show here.
            if embedded, !draft.moments.isEmpty { momentThumbs.transition(.opacity) }
            if !sources.isEmpty || !existingSources.isEmpty {
                LazyVStack(spacing: 8) {
                    ForEach(existingSources, id: \.self) { chip($0, removable: false) }
                    ForEach(sources, id: \.self) { chip($0, removable: true) }
                }.transition(.opacity)
            }
            toolbar
        }
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .strokeBorder(targeted ? Color.rasan : briefFocused ? Color.rasan.opacity(0.7) : Color(nsColor: .separatorColor), lineWidth: targeted || briefFocused ? 1.5 : 0.5))
        .animation(.snappy(duration: 0.15), value: targeted)
        .animation(.snappy, value: sources)
        .animation(.snappy, value: draft.moments)
    }

    /// The picked moves as a small row of thumbnails. Each opens a menu: where it should land, or remove.
    private var momentThumbs: some View {
        HStack(spacing: ComposerLayout.gap) {
            Text("Moves").font(.system(size: 11.5, weight: .medium)).foregroundStyle(.secondary)
            ForEach(draft.moments, id: \.id) { pick in
                let moment = store.gallery.moment(pick.id)
                Menu {
                    Picker("Where", selection: Binding(get: { pick.place }, set: { place in
                        if let i = draft.moments.firstIndex(where: { $0.id == pick.id }) { draft.moments[i].place = place } })) {
                        ForEach(MomentPlace.allCases) { Text($0.title).tag($0) }
                    }.pickerStyle(.inline)
                    Divider()
                    Button("Remove", role: .destructive) { draft.moments.removeAll { $0.id == pick.id } }
                } label: {
                    ZStack {
                        if let moment { MomentStill(url: moment.stillURL, maxPixels: 120) } else { Color.primary.opacity(0.08) }
                    }
                    .frame(width: 48, height: 27).clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                    .overlay(alignment: .bottomLeading) {
                        if pick.place != .anywhere {
                            Text(pick.place.title).font(.system(size: 8.5, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                                .padding(.horizontal, 3).background(.black.opacity(0.6), in: Capsule()).padding(2)
                        }
                    }
                }
                .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
                .help("\(moment?.name ?? pick.id): \(pick.place.title). Click to change where it lands or remove it")
                .accessibilityLabel("Move \(moment?.name ?? pick.id), place \(pick.place.title)")
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: Toolbar

    private var brandShort: String { draft.brand ?? "Brand" }
    private var motionShort: String { MotionLevel.title(draft.motionLevel) }
    private var formatLabel: String {
        if let option = pickedOption { return option.title }
        return "What are you making?"
    }

    private var toolbar: some View {
        // Home asks for words only: the settings live in the setup, behind Review's More settings.
        HStack(spacing: ComposerLayout.gap) {
            Button { choose() } label: {
                Image(systemName: "plus").font(.system(size: 13, weight: .medium))
                    .frame(width: 28, height: 28).background(chipFill, in: Circle())
                    .overlay(Circle().strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5))
            }.buttonStyle(.plain).help("Add footage, images or documents (optional). You can also drop them here.")
                .accessibilityLabel("Attach files")
            formatChip
            Spacer(minLength: 8)
            runButton.controlSize(.regular)
        }
        .frame(height: 32)
    }

    private var formatChip: some View {
        Button { changingFormat.toggle() } label: {
            HStack(spacing: 6) {
                Image(systemName: pickedOption.map { FormatPickerView.symbol($0.tile) } ?? "square.grid.2x2").font(.system(size: 12))
                Text(formatLabel).font(.system(size: 13, weight: .medium)).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold)).opacity(0.6)
            }
            .foregroundStyle(Color.primary)
            .padding(.horizontal, 10).frame(height: ComposerLayout.chipHeight)
            .background(pickedOption == nil ? chipFill : Color.primary.opacity(0.12), in: Capsule())
            .overlay { if pickedOption != nil { Capsule().strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) } }
            .frame(maxWidth: 230)
        }
        .buttonStyle(.plain).help("Optional. RasanAI picks a format from your words. Click to choose one yourself.")
        .accessibilityLabel("Format: \(formatLabel)")
        // Home has no format grid on the page, so the chip opens it here.
        .popover(isPresented: $changingFormat, arrowEdge: .bottom) {
            if let catalog {
                ScrollView {
                    FormatPickerView(catalog: catalog, pick: draft.format, canAct: !working,
                                     onPick: { option in choose(option, in: catalog) },
                                     onScope: { draft.format?.scope = $0 }, changing: $changingFormat, showsChip: false)
                        .padding(16)
                }
                .frame(width: 740).frame(maxHeight: 560)
            }
        }
    }

    /// Which Claude models make the film: a use-of-plan choice, so it sits on the row rather than behind •••.
    private var modelsChip: some View {
        Button { showModels = true } label: { chipLabel("sparkles", draft.modelPlan.chipTitle) }
            .buttonStyle(.plain).help("Which Claude models make this film: \(draft.modelPlan.summary)")
            .accessibilityLabel("Models: \(draft.modelPlan.chipTitle)")
            .popover(isPresented: $showModels, arrowEdge: .bottom) { modelPicker }
    }

    /// Footage folders and a reference video, used where they are. Separate wells: footage is cut, a reference is only studied.
    private var linkedWells: some View {
        HStack(alignment: .top, spacing: 14) {
            LinkedSourceWell(kind: .footage, sources: $draft.linked, disabled: working, prompt: pickedOption.flatMap { catalog?.folderPrompt(for: $0) })
            LinkedSourceWell(kind: .reference, sources: $draft.linked, disabled: working,
                             moves: AnyView(momentThumbs), movesCount: draft.moments.count, onPickMoves: { showGallery = true })
        }
    }

    private var chipFill: Color { Color.primary.opacity(0.07) }

    private func chipLabel(_ icon: String, _ text: String, tint: Bool = false) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 12))
            Text(text).font(.system(size: 13, weight: .medium)).lineLimit(1)
            Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold)).opacity(0.6)
        }
        .foregroundStyle(tint ? Color.rasan : Color.primary)
        .padding(.horizontal, 10).frame(height: ComposerLayout.chipHeight)
        .background(tint ? Color.rasan.opacity(0.16) : chipFill, in: Capsule())
    }

    @ViewBuilder private var paceMenuContent: some View {
        Picker("Pace", selection: $draft.pace) {
            ForEach(FilmPace.allCases) { Text("\($0.title): \($0.summary)").tag($0) }
        }.pickerStyle(.inline).labelsHidden()
    }
    private var paceChip: some View {
        Menu { paceMenuContent } label: { chipLabel("gauge.with.dots.needle.33percent", draft.pace.chipTitle) }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
            .help("Pace: \(draft.pace.summary)")
            .accessibilityLabel("Pace: \(draft.pace.title)")
    }

    @ViewBuilder private var motionMenuContent: some View {
        Section("How much motion design") {
            Picker("Motion design", selection: $draft.motionLevel) {
                ForEach(MotionLevel.all, id: \.id) { level in Text("\(level.title) · \(level.summary)").tag(level.id) }
            }.pickerStyle(.inline).labelsHidden()
        }
    }
    private var motionChip: some View {
        Menu { motionMenuContent } label: { chipLabel("wand.and.sparkles", motionShort) }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
            .help("How much motion design: \(MotionLevel.summary(draft.motionLevel))")
            .accessibilityLabel("Motion design: \(motionShort)")
    }

    @ViewBuilder private var brandMenuContent: some View {
        Picker("Brand", selection: Binding(get: { draft.brand ?? "" }, set: { v in
            if v == "__new" { store.openBrands() } else { draft.brand = v.isEmpty ? nil : v } })) {
            Text("No brand").tag("")
            ForEach(brands) { Text($0.name).tag($0.name) }
        }.pickerStyle(.inline).labelsHidden()
        Divider()
        Button("New brand…") { store.openBrands() }
    }
    private var brandChip: some View {
        Menu { brandMenuContent } label: { chipLabel("paintpalette", brandShort) }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Brand: \(draft.brand ?? "none")")
            .accessibilityLabel("Brand: \(draft.brand ?? "none")")
    }

    private var modelPicker: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Which Claude models make this film").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary).padding(.horizontal, 10).padding(.top, 4)
            ForEach(ModelPlan.allCases) { plan in
                Button { draft.modelPlan = plan; showModels = false } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: draft.modelPlan == plan ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(draft.modelPlan == plan ? Color.primary : .secondary).padding(.top, 1)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(plan.title).font(.system(size: 13, weight: .semibold))
                                if plan == .recommended {
                                    Text("Recommended").font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                                        .padding(.horizontal, 6).padding(.vertical, 2).background(Color.primary.opacity(0.08), in: Capsule())
                                }
                            }
                            Text(plan.summary).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(10).contentShape(Rectangle())
                    .background(draft.modelPlan == plan ? Color.primary.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }.buttonStyle(.plain)
            }
        }.padding(8).frame(width: 340)
    }

    private func chip(_ url: URL, removable: Bool) -> some View {
        HStack(spacing: 10) {
            SourceRow(url: url)
            if removable {
                Button { sources.removeAll { $0 == url } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Remove")
            }
        }.padding(10).background(chipFill, in: RoundedRectangle(cornerRadius: 10))
    }

    /// Why the run button is grey, in its tooltip; the shortcut goes here too, not in the label.
    private func runHelp(_ action: String) -> String {
        if trimmedBrief.isEmpty { return "Describe your film first" }
        if store.toolSetup.isRunning { return "Waiting for tool setup to finish" }
        if checkingStart { return "Checking this Mac…" }
        if pickedOption?.status == .soon { return "This format is coming soon. Choose another in the format list." }
        return "\(action) (⌘↩)"
    }

    @ViewBuilder private var runButton: some View {
        if embedded {
            // Home asks for words only: Start goes straight to Review (everything else decided), Set it up walks through the questions.
            HStack(spacing: 8) {
                if working { ProgressView().controlSize(.mini) }
                Button("Set it up") { continueToEditor(atReview: false) }
                    .buttonStyle(.rasanSecondary).controlSize(.regular)
                    .disabled(working || trimmedBrief.isEmpty)
                    .help(trimmedBrief.isEmpty ? "Describe your film first" : "Answer a few questions about the film, one at a time")
                Button("Start") { continueToEditor(atReview: true) }
                    .buttonStyle(.rasanPrimary).controlSize(.regular).keyboardShortcut(.return, modifiers: .command)
                    .disabled(working || trimmedBrief.isEmpty)
                    .help(trimmedBrief.isEmpty ? "Describe your film first" : "Check what RasanAI will do and start the film (⌘↩)")
            }
        } else if editingQueued {
            Button { saveQueuedChanges() } label: { Text("Save changes") }
                .buttonStyle(.rasanPrimary).controlSize(.regular).keyboardShortcut(.return, modifiers: .command)
                .disabled(working || trimmedBrief.isEmpty)
                .help(trimmedBrief.isEmpty ? "Describe your film first" : "Save changes (⌘↩)")
        } else if directorReady {
            if directorBusy {
                Button { store.ensureConsent(for: agent) { save(start: false, queue: true) } } label: { Text("Add to queue") }
                    .buttonStyle(.rasanPrimary).controlSize(.regular).keyboardShortcut(.return, modifiers: .command)
                    .disabled(working || trimmedBrief.isEmpty || pickedOption?.status == .soon)
                    .help(trimmedBrief.isEmpty ? "Describe your film first" : "Starts automatically when the current film finishes (⌘↩)")
            } else {
                Button { start() } label: { Text("Start film") }
                    .buttonStyle(.rasanPrimary).controlSize(.regular).keyboardShortcut(.return, modifiers: .command)
                    .disabled(working || checkingStart || trimmedBrief.isEmpty || store.toolSetup.isRunning || pickedOption?.status == .soon)
                    .help(runHelp("Start film"))
            }
        } else if store.settings.checking.contains(agent.id) {
            HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Checking director…").font(.system(size: 12)).foregroundStyle(.secondary) }
        } else {
            Button("Set up a director…") { store.settings.showWelcome = true }
                .buttonStyle(.rasanPrimary).controlSize(.regular)
        }
    }

    // MARK: Actions

    private func persistEditor() {
        guard loaded, !committed else { return }
        store.settings.saveEditorDraft(editorState, for: project)
    }

    /// A drop anywhere on the page: a folder is footage and stays where it is; files are copied into the film as before.
    private func add(_ urls: [URL]) -> Bool {
        guard !working, !urls.isEmpty else { return false }
        let split = LinkedSource.split(urls)
        if !split.folders.isEmpty { draft.linked = LinkedSource.merge(draft.linked, adding: split.folders) }
        if !split.files.isEmpty { sources = Array(Set(sources + split.files)).sorted { $0.path < $1.path } }
        return true
    }
    private func choose() {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = true; panel.canChooseDirectories = false
        panel.title = "Add footage, images or documents"
        if panel.runModal() == .OK { _ = add(panel.urls) }
    }
    /// Keeps a suggested title in step with the brief: empty brief, no title; a rewritten brief, a new title once typing
    /// pauses. Stops for good as soon as the name is the person's own.
    private func retitle() async {
        guard let made = suggested, name == made.title, trimmedBrief != made.brief else { return }
        if trimmedBrief.isEmpty { name = ""; suggested = nil; store.suggestedFilmTitle = nil; return }
        try? await Task.sleep(for: .seconds(1.2))
        let brief = trimmedBrief
        let fresh = await FilmTitle.suggest(for: brief)
        guard !Task.isCancelled, name == made.title else { return }
        name = fresh
        suggested = (fresh, brief)
        store.suggestedFilmTitle = (fresh, brief)
    }
    /// Home's Start and Set it up: a working title from the brief (unless one is typed), then the setup on this draft, on Review or at its first question.
    private func continueToEditor(atReview: Bool) {
        working = true
        Task {
            if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let brief = trimmedBrief
                name = await FilmTitle.suggest(for: brief)
                store.suggestedFilmTitle = (name, brief)
            }
            working = false
            persistEditor()
            store.newFilmStartsAtReview = atReview
            store.path = [.newFilm(nil)]
        }
    }
    private func start() {
        store.ensureConsent(for: agent) {
            store.startWhenReady(project: project ?? recoveryProject ?? store.filmDraftProject, sources: sources + existingSources) { save(start: true) }
        }
    }
    /// Saves edits to a film that is waiting in the queue, then refreshes the queued copy instead of starting.
    private func saveQueuedChanges() {
        guard let project else { return }
        working = true
        draft.agent = store.settings.defaultAgent
        let typedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let brand = brands.first { $0.name == draft.brand } ?? brands.first { $0.previousNames.contains(draft.brand ?? "") }
        let submittedDraft = draft
        let submittedSources = sources
        Task {
            let title = typedName.isEmpty ? await FilmTitle.suggest(for: trimmedBrief) : name
            let saved = await store.saveFilm(name: title, draft: submittedDraft, sources: submittedSources, existing: project, brand: brand, start: false)
            working = false
            guard let saved else { persistEditor(); return }
            store.updateQueuedDraft(project: saved, name: title, draft: submittedDraft)
            committed = true
            store.settings.clearEditorDraft(for: project)
            withAnimation(.snappy) { queueNote = "Queue updated" }
            try? await Task.sleep(for: .milliseconds(700))
            store.path = [.queue]
        }
    }
    private func save(start: Bool, queue: Bool = false) {
        working = true
        draft.agent = store.settings.defaultAgent
        let typedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let brand = brands.first { $0.name == draft.brand } ?? brands.first { $0.previousNames.contains(draft.brand ?? "") }
        // "Start a series" was picked: the series is made as the film starts, so its brief already names it.
        if start || queue { flow.commitStartingSeries(&draft, store: store, catalog: catalog, fallbackName: typedName.isEmpty ? autoName : typedName) }
        let submittedDraft = draft
        let submittedSources = sources
        Task {
            let title = typedName.isEmpty ? await FilmTitle.suggest(for: trimmedBrief) : name
            let saved = await store.saveFilm(name: title, draft: submittedDraft, sources: submittedSources, existing: project ?? store.filmDraftProject, brand: brand, start: start)
            working = false
            if let saved {
                if queue { store.enqueueFilm(saved, name: title, draft: submittedDraft) }
                if start || queue, let ref = submittedDraft.series { SeriesLibrary.appendEpisode(saved, to: ref); store.reloadSeries() }
                committed = true
                store.settings.clearEditorDraft(for: project)
                if queue { store.path = [.queue] } else { store.showFilm(saved) }
            } else {
                recoveryProject = store.filmDraftProject
                if store.filmSourcesCopied {
                    sources = []
                    if let folder = store.filmDraftProject {
                        existingSources = await Task.detached { (try? ProjectSources.files(in: folder)) ?? [] }.value
                    }
                }
                persistEditor()
            }
        }
    }
}

/// Wraps chips onto as many lines as they need.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? 600, subviews: subviews).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(width: bounds.width, subviews: subviews)
        for (index, origin) in result.origins.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), proposal: .unspecified)
        }
    }
    private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        var origins: [CGPoint] = []
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing; rowHeight = max(rowHeight, size.height); maxX = max(maxX, x - spacing)
        }
        return (CGSize(width: maxX, height: y + rowHeight), origins)
    }
}

/// The film's motion level in words people use. The brief keeps "maximal", "balanced" or "minimal"; the director reads
/// those (`FilmDraft`), and the app only ever shows these titles.
enum MotionLevel {
    static let all: [(id: String, title: String, summary: String)] = [
        ("maximal", "Full motion", "graphics on every scene and intricate, layered moves"),
        ("balanced", "Some motion", "graphics on most scenes, with room to breathe"),
        ("minimal", "Clean cut", "simple titles and captions, little decoration"),
    ]
    static func title(_ id: String) -> String { all.first { $0.id == id }?.title ?? id.capitalized }
    static func summary(_ id: String) -> String { all.first { $0.id == id }?.summary ?? "" }
}
