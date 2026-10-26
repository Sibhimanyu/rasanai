import AppKit
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

/// Describe on Home, then review a compact setup before starting the existing film workflow.
struct NewFilmView: View {
    @Bindable var store: StudioStore
    let project: URL?
    /// Home shows only the prompt box (no title, format grid, wells or footer).
    var embedded = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
    @State private var cardHovered = false
    @State private var materialsHovered = false
    @State private var showExamples = false
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
    @State private var waitingForBrand = false
    @State private var brandWait: Task<Void, Never>?
    @State private var showFootage = false
    @State private var showReference = false
    @State private var linkMessage: String?
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
                // On Home: just the prompt box, with Start (straight to Review) and Set it up (the step-by-step setup). Both carry
                // this same unsaved draft, so nothing starts until the person has seen it.
                homeComposer
            } else { setup }
        }
        .dropDestination(for: URL.self, action: { urls, _ in add(urls.filter(\.isFileURL)) }, isTargeted: { targeted = $0 })
        .sheet(isPresented: $showGallery) {
            GetInspiredSheet(gallery: store.gallery, selection: MomentSelection(draft.moments)) { picks in
                showGallery = false; edit { draft.moments = picks }
            } onCancel: { showGallery = false }
            .tint(.rasan)
        }
        // Typing saves once it pauses; a newer edit cancels the wait. Leaving, Start, saving and quitting flush below.
        .task(id: editorState) {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            persistEditor()
        }
        .onDisappear { persistEditor() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in persistEditor() }
        .task(id: "\(agent.id):\(store.settings.path(for: agent))") { await store.settings.check(agent) }
        .task(id: trimmedBrief) { await retitle() }
        .task(id: embedded) {
            guard embedded else { return }
            store.gallery.prime()
            await store.gallery.loadIfNeeded()
        }
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
            let brandRoot = URL(fileURLWithPath: store.settings.projectRoot)
            let listed = await Task.detached { BrandLibrary.list(in: brandRoot) }.value
            guard !Task.isCancelled else { return }
            brands = listed
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
            lastFormatOption = draft.format?.option
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
        if embedded { return "Describe your video, or paste a link…" }
        if let option = pickedOption, let prompt = catalog?.subjectPrompt(for: option) { return prompt }
        return "A launch film for my budgeting app. Calm, confident, a little playful. End on the download button."
    }
    /// Words and dropped files that can pre-select a format; changes re-run the match (debounced) while the pick is still automatic.
    private var matchKey: String {
        ([draft.brief] + draft.linked.map(\.path) + sources.map(\.path)).joined(separator: "\u{1}") + (loaded ? "|loaded" : "")
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
                    "The last page shows your whole film. Change anything right where it is; each part says whether you chose it or RasanAI decides.",
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
                 howItWorks: AnyView(howItWorks), footageWell: AnyView(footageWell), referenceWell: AnyView(referenceWell),
                 runButton: AnyView(runButton), footerActions: AnyView(reviewFooterActions))
    }

    private var directorLine: some View {
        HStack(spacing: 4) {
            Text(directorReady ? "Directed by \(agent.title) ·" : "No director set up yet ·")
            Button(directorReady ? "Change" : "Set up…") { if directorReady { store.openSettingsPage() } else { store.settings.showWelcome = true } }
                .buttonStyle(.link)
        }.font(.system(size: 12)).foregroundStyle(.secondary)
    }

    /// One setting in "How RasanAI works": its name, the control, and what the choice means for time, cost or look.
    private func settingTile<Control: View>(_ title: String, _ symbol: String, _ note: String, @ViewBuilder control: () -> Control) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: symbol).font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
            control()
            Text(Self.sentence(note)).font(.system(size: 11.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                .contentTransition(.opacity)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    /// A note as a sentence: a capital first letter and a full stop.
    private static func sentence(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard let first = trimmed.first else { return trimmed }
        let capped = first.uppercased() + trimmed.dropFirst()
        return ".?!".contains(capped.last ?? ".") ? capped : capped + "."
    }

    /// The "How RasanAI works" card on the Ready page: every pick on show, the same bindings the old chips used.
    private var howItWorks: some View {
        VStack(alignment: .leading, spacing: 12) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 360), spacing: 12, alignment: .top)], alignment: .leading, spacing: 12) {
                settingTile("Speed", "gauge.with.dots.needle.33percent", draft.pace.summary) {
                    Picker("Speed", selection: $draft.pace) { ForEach(FilmPace.allCases) { Text($0.title).tag($0) } }
                        .pickerStyle(.segmented).labelsHidden()
                }
                if agent == .claude {
                    settingTile("Quality", "sparkles", draft.modelPlan.summary) {
                        Picker("Quality", selection: $draft.modelPlan) { ForEach(ModelPlan.allCases) { Text($0.title).tag($0) } }
                            .pickerStyle(.segmented).labelsHidden()
                    }
                }
                settingTile("Motion", "wand.and.sparkles", MotionLevel.summary(draft.motionLevel)) {
                    Picker("Motion", selection: $draft.motionLevel) { ForEach(MotionLevel.all, id: \.id) { Text($0.title).tag($0.id) } }
                        .pickerStyle(.segmented).labelsHidden()
                }
                settingTile("Brand", "paintpalette", draft.brand == nil ? "No brand: RasanAI designs the look from your brief." : "Colours, type and logo come from this brand.") {
                    HStack(spacing: 8) {
                        Picker("Brand", selection: Binding(get: { draft.brand ?? "" }, set: { draft.brand = $0.isEmpty ? nil : $0 })) {
                            Text("No brand").tag("")
                            ForEach(brands) { Text($0.name).tag($0.name) }
                        }.labelsHidden().pickerStyle(.menu).fixedSize()
                        Button("New brand…") { store.openBrands() }.buttonStyle(.rasanSecondary).controlSize(.small)
                        Spacer(minLength: 0)
                    }
                }
            }
            HStack(spacing: 8) {
                Image(systemName: "person.crop.circle.badge.checkmark").foregroundStyle(.secondary).accessibilityHidden(true)
                directorLine
                Text("The assistant on your Mac that makes the film.").font(.system(size: 11.5)).foregroundStyle(.tertiary)
            }
        }
    }

    private var footageWell: some View {
        LinkedSourceWell(kind: .footage, sources: $draft.linked, disabled: working, bare: true, prompt: pickedOption.flatMap { catalog?.folderPrompt(for: $0) }, screen: screenForBrandKits)
    }
    private var referenceWell: some View {
        LinkedSourceWell(kind: .reference, sources: $draft.linked, disabled: working, bare: true,
                         moves: AnyView(momentThumbs), movesCount: draft.moments.count, onPickMoves: { showGallery = true })
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

    /// Describe, on Home: one card holds the brief, what is attached and Continue; examples sit under it, never settings.
    private var homeComposer: some View {
        promptCard
    }

    /// The input card carries only the text and its tools. Attachments, picked moves and errors sit in a darker tray tucked
    /// under it. Borders are 1pt and change colour only, so focus and hover never move anything.
    private var promptCard: some View {
        let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
        let trayShape = UnevenRoundedRectangle(bottomLeadingRadius: 18, bottomTrailingRadius: 18, style: .continuous)
        let hasMaterials = !sources.isEmpty || !existingSources.isEmpty || !draft.linked.isEmpty
        return VStack(spacing: -Self.trayTuck) {
            VStack(alignment: .leading, spacing: 0) {
                ComposerTextView(text: $draft.brief, placeholder: briefPlaceholder, minLines: 3, maxLines: 8, focused: $briefFocused, focusRequest: focusRequest, fontSize: 16, placeholderColor: .secondaryLabelColor)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 10)
                HStack(spacing: 12) {
                    addMaterialsMenu(prominent: false)
                    Spacer(minLength: 8)
                    homeStartButtons
                }
                .padding(.horizontal, 12).padding(.bottom, 12)
            }
            .background(Self.cardSurface, in: shape)
            .overlay { shape.strokeBorder(cardBorder, lineWidth: 1) }
            .contentShape(shape)
            .onHover { cardHovered = $0 }
            .zIndex(1)
            VStack(alignment: .leading, spacing: 0) {
                if !draft.moments.isEmpty {
                    momentThumbs.padding(.horizontal, 18).padding(.vertical, 10).transition(.opacity)
                }
                if hasMaterials {
                    VStack(spacing: 0) {
                        ForEach(existingSources, id: \.self) { sourceRow($0, removable: false) }
                        ForEach(sources, id: \.self) { sourceRow($0, removable: true) }
                        ForEach(draft.linked) { source in
                            LinkedSourceRow(source: source) { edit { draft.linked.removeAll { $0 == source } } }.padding(.horizontal, 12).padding(.vertical, 8)
                            if source != draft.linked.last { Divider() }
                        }
                    }
                    .padding(.horizontal, 8).transition(.opacity)
                }
                if let linkMessage {
                    Text(linkMessage).font(.system(size: 12)).foregroundStyle(Color(nsColor: .systemOrange))
                        .padding(.horizontal, 18).padding(.vertical, 10)
                }
                exploreRow
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, Self.trayTuck).padding(.bottom, 4)
            .background(Self.traySurface, in: trayShape)
            .overlay { trayShape.strokeBorder(Workspace.hairline, lineWidth: 1) }
            .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: briefFocused)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: cardHovered)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: targeted)
    }

    private static let trayTuck: CGFloat = 24
    /// Neutral charcoal (about 0.19) in dark mode, white in light mode.
    private static let cardSurface = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? NSColor(white: 0.19, alpha: 1) : .white
    })
    private static let traySurface = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? NSColor(white: 0.14, alpha: 1) : NSColor(white: 0.95, alpha: 1)
    })

    /// Home's two ways on: Start goes straight to Review with everything else decided (a lilac circle with a forward arrow), and
    /// Set it up walks through the questions one at a time. Both carry this same unsaved draft, so nothing starts unseen.
    private var homeStartButtons: some View {
        let enabled = !(working || trimmedBrief.isEmpty)
        return HStack(spacing: 10) {
            Button("Set it up") { continueToEditor(atReview: false) }
                .buttonStyle(.plain).font(.system(size: 13)).foregroundStyle(.secondary)
                .disabled(!enabled)
                .help(trimmedBrief.isEmpty ? "Describe your film first" : "Answer a few questions about the film, one at a time")
            Button { continueToEditor(atReview: true) } label: {
                HStack(spacing: 8) {
                    Text("Start").font(.system(size: 13, weight: .medium)).foregroundStyle(enabled ? Color.primary : Color.secondary)
                    ZStack {
                        Circle().fill(enabled ? Color.rasanFill : Color.primary.opacity(0.12))
                        if working { ProgressView().controlSize(.small) }
                        else { Image(systemName: "arrow.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(enabled ? Color.rasanPrimaryLabel : Color.secondary) }
                    }
                    .frame(width: 36, height: 36)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain).keyboardShortcut(.return, modifiers: .command)
            .disabled(!enabled)
            .accessibilityLabel("Start")
            .help(trimmedBrief.isEmpty ? "Describe your film first" : "Check what RasanAI will do and start the film (⌘↩)")
        }
    }

    private var cardBorder: Color {
        if targeted { return Color.rasan.opacity(0.6) }
        if briefFocused { return Color.primary.opacity(0.28) }
        return cardHovered ? Color.primary.opacity(0.18) : Color.primary.opacity(0.12)
    }

    /// One optional drawer attached to the prompt; examples stay out of the way until requested.
    private var exploreRow: some View {
        let featured = store.gallery.moments.filter(\.featured)
        let remaining = store.gallery.moments.filter { !$0.featured }
        let examples = Array((featured + remaining).prefix(4))
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.22)) { showExamples.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "play.rectangle").font(.system(size: 14))
                    Text("Inspiration").font(.system(size: 13, weight: .medium))
                    Text("Optional").font(.system(size: 11)).foregroundStyle(.tertiary)
                    Spacer(minLength: 8)
                    Image(systemName: showExamples ? "chevron.up" : "chevron.down").font(.system(size: 10, weight: .semibold))
                }
                .foregroundStyle(.secondary)
                .padding(.horizontal, 18).frame(minHeight: 42)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Inspiration, optional")
            .accessibilityValue(showExamples ? "Expanded" : "Collapsed")
            if showExamples {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Choose a starting move.").font(.system(size: 12)).foregroundStyle(.secondary)
                        Spacer()
                        Button("Browse all") { showGallery = true }.buttonStyle(.link).font(.system(size: 12))
                    }
                    if !examples.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) { exampleCards(examples) }
                            .frame(height: ExampleCard.height + 4)
                    } else {
                        Text("Browse Inspiration to find a move for your film.")
                            .font(.system(size: 12)).foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 18).padding(.bottom, 14)
                .transition(.opacity)
            }
        }
    }

    private func exampleCards(_ examples: [Moment]) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(examples) { moment in
                ExampleCard(moment: moment, picked: draft.moments.contains { $0.id == moment.id }, reduceMotion: reduceMotion) {
                    edit {
                        var selection = MomentSelection(draft.moments)
                        selection.toggle(moment)
                        draft.moments = selection.picks
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func addMaterialsMenu(prominent: Bool) -> some View {
        Menu {
            Button("Files…") { choose() }
            Button("Footage folder…") { if embedded { chooseLinked(.footage) } else { showFootage = true } }
            Button("Reference video…") { if embedded { chooseLinked(.reference) } else { showReference = true } }
            Button("Moves from Inspiration…") { showGallery = true }
            Divider()
            Menu("Brand") {
                Picker("Brand", selection: Binding(get: { draft.brand ?? "" }, set: { draft.brand = $0.isEmpty ? nil : $0 })) {
                    Text("No brand").tag("")
                    ForEach(brands) { Text($0.name).tag($0.name) }
                }.pickerStyle(.inline).labelsHidden()
                Divider()
                Button("Brand kit folder or .zip…") { chooseBrandKit() }
                Button("Manage brands…") { store.openBrands() }
            }
        } label: {
            if embedded {
                Image(systemName: "plus").font(.system(size: 16, weight: .regular)).frame(width: 32, height: 32).contentShape(Circle())
                    .background(Circle().fill(Color.primary.opacity(materialsHovered ? 0.1 : 0)))
                    .onHover { materialsHovered = $0 }
                    .accessibilityLabel("Add materials")
            } else {
                Label("Add materials", systemImage: "plus").font(.system(size: 13, weight: .medium)).padding(.horizontal, 6)
            }
        }
        .modifier(AddMaterialsStyle(embedded: embedded, prominent: prominent))
        .help("Add footage, images, documents or a reference video. You can also drop files or folders here.")
    }

    private func sourceRow(_ url: URL, removable: Bool) -> some View {
        HStack(spacing: 10) {
            SourceRow(url: url)
            if removable {
                Button { edit { sources.removeAll { $0 == url } } } label: { Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Remove").accessibilityLabel("Remove \(url.lastPathComponent)")
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
    }

    /// Footage folders and reference videos stay where they are; Home has no wells, so the menu picks them directly.
    private func chooseLinked(_ kind: LinkedSource.Kind) {
        let panel = NSOpenPanel()
        if kind == .footage {
            panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.allowsMultipleSelection = true
            panel.title = "Choose a folder of footage"; panel.prompt = "Use folder"
            panel.message = "The folder stays where it is. RasanAI reads it in place and never changes it."
        } else {
            panel.canChooseDirectories = false; panel.canChooseFiles = true; panel.allowsMultipleSelection = false
            panel.allowedContentTypes = [.movie, .video]
            panel.title = "Choose a video to make yours like"; panel.prompt = "Use video"
        }
        guard panel.runModal() == .OK else { return }
        var added: [LinkedSource] = [], failure: LinkedSource.Rejection?
        for url in kind == .footage ? screenForBrandKits(panel.urls) : panel.urls {
            switch kind == .footage ? LinkedSource.footageFolder(url) : LinkedSource.referenceVideo(url) {
            case .success(let source): added.append(source)
            case .failure(let rejection): failure = rejection
            }
        }
        edit { draft.linked = LinkedSource.merge(draft.linked, adding: added) }
        linkMessage = added.isEmpty ? failure?.errorDescription : nil
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
                    Button("Remove", role: .destructive) { edit { draft.moments.removeAll { $0.id == pick.id } } }
                } label: {
                    Color.primary.opacity(0.08)
                        .overlay { if let moment { MomentStill(url: moment.stillURL, maxPixels: 120) } }
                        .frame(width: 48, height: 27).clipped().clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
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

    private var brandShort: String {
        guard let name = draft.brand else { return "Brand" }
        if let brand = brands.first(where: { $0.name == name }), store.brandCompiler(for: brand.folder).isRunning { return "\(name) · Compiling…" }
        return name
    }
    private var motionShort: String { MotionLevel.title(draft.motionLevel) }

    /// Model preferences remain available within the setup settings.
    private var modelsChip: some View {
        Button { showModels = true } label: { chipLabel("sparkles", draft.modelPlan.chipTitle) }
            .buttonStyle(.plain).help("Which Claude models make this film: \(draft.modelPlan.summary)")
            .accessibilityLabel("Models: \(draft.modelPlan.chipTitle)")
            .popover(isPresented: $showModels, arrowEdge: .bottom) { modelPicker }
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

    /// Why the run button is grey, in its tooltip; the shortcut goes here too, not in the label.
    private func runHelp(_ action: String) -> String {
        if trimmedBrief.isEmpty { return "Describe your film first" }
        if store.toolSetup.isRunning { return "Waiting for tool setup to finish" }
        if checkingStart { return "Checking this Mac…" }
        if pickedOption?.status == .soon { return "This format is coming soon. Choose another in the format list." }
        return "\(action) (⌘↩)"
    }

    @ViewBuilder private var runButton: some View {
        if waitingForBrand {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Waiting for the brand to compile…").font(.system(size: 12)).foregroundStyle(.secondary)
                Button("Cancel") { brandWait?.cancel() }.buttonStyle(.rasanSecondary).controlSize(.regular)
            }
        } else { runButtonBase }
    }
    /// A film never gets a half-written brand: saving waits here while that brand's compile job runs. A failed compile
    /// still continues (the files are already in the brand). Returns false when the person cancelled.
    private func awaitBrandCompile(_ brand: Brand?) async -> Bool {
        guard let brand else { return true }
        let compiler = store.brandCompiler(for: brand.folder)
        guard compiler.isRunning else { return true }
        waitingForBrand = true
        defer { waitingForBrand = false }
        while compiler.isRunning {
            if Task.isCancelled { return false }
            try? await Task.sleep(for: .milliseconds(300))
        }
        return !Task.isCancelled
    }
    @ViewBuilder private var runButtonBase: some View {
        if embedded {
            homeStartButtons
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
        var split = LinkedSource.split(urls)
        let kept = Set(screenForBrandKits(split.folders.map(\.url)).map(\.path))
        split.folders = split.folders.filter { kept.contains($0.url.path) }
        split.files = screenForBrandKits(split.files)
        edit {
            if !split.folders.isEmpty { draft.linked = LinkedSource.merge(draft.linked, adding: split.folders) }
            if !split.files.isEmpty { sources = Array(Set(sources + split.files)).sorted { $0.path < $1.path } }
        }
        return true
    }
    /// Folders that look like a brand kit rather than footage get a question; "Use as the film's brand" takes them out of the list.
    private func screenForBrandKits(_ folders: [URL]) -> [URL] {
        folders.filter { folder in
            guard BrandKitSniffer.isKit(folder) else { return true }
            let alert = NSAlert()
            alert.messageText = "This looks like a brand kit"
            alert.informativeText = "\(folder.lastPathComponent) has brand files (logos, fonts or guidelines) and almost no video. Brand kits work best as the film's brand, not as footage."
            alert.addButton(withTitle: "Use as the film's brand")
            alert.addButton(withTitle: "Add as footage anyway")
            if alert.runModal() == .alertFirstButtonReturn { useAsBrand(kit: folder); return false }
            return true
        }
    }
    private func chooseBrandKit() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true; panel.canChooseFiles = true; panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.folder, .zip]
        panel.title = "Choose a brand kit"; panel.prompt = "Use as brand"
        panel.message = "A folder or .zip with the brand's logos, fonts and guidelines. Claude reads it and writes the brand."
        if panel.runModal() == .OK, let url = panel.url { useAsBrand(kit: url) }
    }
    /// Makes a brand from the kit (the files are copied in, Claude compiles the design system in the background) and picks it for this film.
    private func useAsBrand(kit: URL) {
        let root = URL(fileURLWithPath: store.settings.projectRoot)
        Task {
            do {
                let brand = try await Task.detached { try BrandLibrary.createFromKit(kit, name: "", in: root) }.value
                brands = await Task.detached { BrandLibrary.list(in: root) }.value
                if !brands.contains(where: { $0.folder == brand.folder }) { brands.append(brand) }
                edit { draft.brand = brand.name }
                store.brandCompiler(for: brand.folder).start(kit: kit, brand: brand.folder, name: nil, store: store)
            } catch { linkMessage = error.localizedDescription }
        }
    }
    /// The person's own attachment edits animate; hydration in `.task` mutates the same state without a transaction.
    private func edit(_ change: () -> Void) {
        withAnimation(reduceMotion ? nil : .snappy, change)
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
        do { try await Task.sleep(for: .seconds(1.2)) } catch { return }
        guard !Task.isCancelled, name == made.title else { return }
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
        brandWait = Task {
            guard await awaitBrandCompile(brand) else { working = false; return }
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
        brandWait = Task {
            guard await awaitBrandCompile(brand) else { working = false; return }
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

/// One Home example: a fixed 156x88 thumbnail and a 12pt caption. The still sits in an overlay of a fixed-size clear view, so
/// the bitmap's own size never reaches layout.
private struct ExampleCard: View {
    static let width: CGFloat = 156, thumbHeight: CGFloat = 88, height: CGFloat = 88 + 6 + 16
    let moment: Moment
    let picked: Bool
    let reduceMotion: Bool
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                Color.clear
                    .frame(width: Self.width, height: Self.thumbHeight)
                    .overlay { MomentStill(url: moment.stillURL, maxPixels: 320) }
                    .clipShape(shape)
                    .overlay { shape.strokeBorder(picked ? Color.rasan : hovered ? Color.primary.opacity(0.28) : Workspace.hairline, lineWidth: picked ? 1.5 : 1) }
                    .overlay(alignment: .topTrailing) {
                        if picked { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.rasan, .white).font(.system(size: 15)).padding(6) }
                    }
                Text(moment.name).font(.system(size: 12)).lineLimit(1).foregroundStyle(.primary)
                    .frame(width: Self.width, height: 16, alignment: .leading)
            }
            .frame(width: Self.width, height: Self.height, alignment: .topLeading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: hovered)
        .help(picked ? "Remove this example from your film" : "Use \(moment.name) as a starting move")
        .accessibilityLabel("\(moment.name)\(picked ? ", added" : "")")
        .accessibilityAddTraits(picked ? .isSelected : [])
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

/// Home's menu is a quiet borderless control; the setup page keeps its secondary button.
private struct AddMaterialsStyle: ViewModifier {
    let embedded: Bool
    let prominent: Bool
    func body(content: Content) -> some View {
        if embedded {
            content.menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().foregroundStyle(.secondary)
        } else {
            content.menuStyle(.button).buttonStyle(.rasanSecondary).controlSize(prominent ? .large : .regular).menuIndicator(.hidden).fixedSize()
        }
    }
}
