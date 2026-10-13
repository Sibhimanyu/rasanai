import AppKit
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

/// One calm page for starting (or editing) a film.
struct NewFilmView: View {
    @Bindable var store: StudioStore
    let project: URL?
    @Environment(\.openSettings) private var openSettings
    @State private var name = ""
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
    @State private var showSaveTemplate = false
    @State private var templateName = ""
    @State private var replacementDraft: FilmDraft?
    @State private var templateMessage: String?
    @State private var queueNote: String?
    @State private var showModels = false
    @State private var showGallery = false
    @State private var briefFocused = false
    @State private var focusRequest = 0
    @State private var toolbarWidth: Double = 640
    /// The previous option, so a pick only moves length and shape the person has not changed.
    @State private var lastFormatOption: String?
    @State private var changingFormat = false

    private static let lengths: [(String, Int)] = [("15 seconds", 15), ("30 seconds", 30), ("45 seconds", 45), ("60 seconds", 60), ("90 seconds", 90), ("2 minutes", 120)]
    private var trimmedBrief: String { draft.brief.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var agent: LocalAgent { store.settings.agent }
    private var directorReady: Bool { store.settings.isReady(agent) }
    private var directorBusy: Bool { store.runtime.isRunning || store.runtime.isPreparing }
    private var editingQueued: Bool { project.map { store.isWaitingInQueue($0) } ?? false }
    private var checkingStart: Bool { StartGate.shared.isChecking }
    private var editorState: FilmEditorDraft { FilmEditorDraft(name: name, film: draft, sources: sources, project: recoveryProject) }
    private var autoName: String {
        let words = trimmedBrief.split(whereSeparator: \.isWhitespace).prefix(5).joined(separator: " ")
        return words.isEmpty ? "Untitled film" : String(words.prefix(60))
    }
    private var lengthLabel: String {
        if !customLength, let match = Self.lengths.first(where: { $0.1 == draft.duration }) { return match.0 }
        return "\(draft.duration) seconds"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                HStack {
                    Menu {
                        ForEach(store.settings.filmTemplates) { template in
                            Button(template.name) { proposeTemplate(template.draft) }
                        }
                        if store.settings.filmTemplates.isEmpty { Text("Save your first template below") }
                    } label: {
                        HStack(spacing: 5) { Text("Use template"); Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold)) }
                    }.menuStyle(.button).menuIndicator(.hidden).buttonStyle(StudioSecondaryButtonStyle()).fixedSize()
                    Spacer()
                    Button("Save as template…") { templateName = name.isEmpty ? autoName : name; showSaveTemplate = true }
                        .buttonStyle(StudioSecondaryButtonStyle())
                        .disabled(trimmedBrief.isEmpty || working)
                }
                if let templateMessage { Text(templateMessage).font(.system(size: 12)).foregroundStyle(.secondary) }
                TextField("Untitled film", text: $name)
                    .textFieldStyle(.plain).font(.system(size: 30, weight: .semibold, design: .rounded))
                    .disabled(project != nil)
                formatPicker
                promptBox
                linkedWells
            }
            .disabled(working)
            .padding(.horizontal, 32).padding(.top, 24).padding(.bottom, 28)
            .frame(maxWidth: 704).frame(maxWidth: .infinity)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .safeAreaInset(edge: .bottom, spacing: 0) { footer }
        .navigationTitle(project == nil ? "New film" : "Edit film")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HelpButton(title: "New film", lines: [
                    "Say what the film is about in your own words. A sentence is enough.",
                    "Get inspired adds moments from real launch films, so your film moves like them. Each one is credited to its creator.",
                    "Add footage, images or documents if you have them. Copies go into the film; originals stay put.",
                    "Pick the options under the prompt. The sparkle chip chooses which Claude models direct the film; the recommended mix has Opus direct and Sonnet handle research, routine jobs and, at Fast pace, the key frames and animation.",
                    "Start film hands it to your director. You will be asked when it needs you."])
            }
        }
        .dropDestination(for: URL.self, action: { urls, _ in add(urls.filter(\.isFileURL)) }, isTargeted: { targeted = $0 })
        .alert("Save as template", isPresented: $showSaveTemplate) {
            TextField("Template name", text: $templateName)
            Button("Cancel", role: .cancel) { }
            Button("Save") { store.saveTemplate(name: templateName, draft: draft); templateMessage = "Template saved. Use it for your next film." }
                .disabled(templateName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } message: { Text("Saves the brief, brand, length, shape and motion level. Source files stay with this film.") }
        .confirmationDialog("Replace your brief and film options?", isPresented: Binding(get: { replacementDraft != nil }, set: { if !$0 { replacementDraft = nil } }), titleVisibility: .visible) {
            Button("Use template") { if let next = replacementDraft { applyTemplate(next) }; replacementDraft = nil }
        } message: { Text("Your film name and attached files are kept.") }
        .sheet(isPresented: $showGallery) {
            GetInspiredSheet(gallery: store.gallery, selection: MomentSelection(draft.moments)) { picks in
                draft.moments = picks; showGallery = false
            } onCancel: { showGallery = false }
            .tint(.rasan)
        }
        .onChange(of: store.templatePrefill) { consumeTemplatePrefill() }
        .onChange(of: editorState) { persistEditor() }
        .onDisappear { persistEditor() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in persistEditor() }
        .task(id: "\(agent.id):\(store.settings.path(for: agent))") { await store.settings.check(agent) }
        .confirmationDialog("Discard unsaved changes?", isPresented: $showDiscard, titleVisibility: .visible) {
            Button("Discard", role: .destructive) {
                committed = true
                store.settings.clearEditorDraft(for: project)
                if let project { store.showFilm(project) } else { store.goHome() }
            }
        } message: { Text("Your saved project and original files are kept.") }
        .task {
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
            if let name = draft.brand, let brand = brands.first(where: { $0.name == name }) ?? brands.first(where: { $0.previousNames.contains(name) }) { draft.brand = brand.name }
            if project == nil, !store.newFilmPrefillMoments.isEmpty { draft.moments = MomentSelection(store.newFilmPrefillMoments).picks; store.newFilmPrefillMoments = [] }
            if !draft.moments.isEmpty { store.gallery.prime(); Task { await store.gallery.loadIfNeeded() } }
            loaded = true
            consumeTemplatePrefill()
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
        return "A 30-second launch film for my budgeting app. Calm, confident, a little playful. End on the download button."
    }
    /// Words and dropped files that can pre-select a format; changes re-run the match (debounced) while the pick is still automatic.
    private var matchKey: String {
        ([draft.brief] + draft.linked.map(\.path) + sources.map(\.path)).joined(separator: "\u{1}") + (loaded ? "|loaded" : "")
    }

    @ViewBuilder private var formatPicker: some View {
        if let catalog {
            VStack(alignment: .leading, spacing: 10) {
                FormatPickerView(catalog: catalog, pick: draft.format, canAct: !working,
                                 onPick: { option in choose(option, in: catalog) },
                                 onScope: { draft.format?.scope = $0 }, changing: $changingFormat, showsChip: false)
                if let option = pickedOption, option.status != .soon { FormatInputsNote(catalog: catalog, option: option) }
            }
            .task(id: matchKey) { await autoMatch(catalog) }
        }
    }

    private func choose(_ option: FormatCatalog.Option, in catalog: FormatCatalog, why: String? = nil) {
        catalog.pick(option, in: &draft, previous: catalog.option(lastFormatOption), why: why)
        lastFormatOption = option.id
        customLength = !Self.lengths.contains { $0.1 == draft.duration }
    }

    /// Pre-selects a format from the brief's words and any dropped folder or files, until the person picks one themselves.
    private func autoMatch(_ catalog: FormatCatalog) async {
        guard loaded, draft.format == nil || draft.format?.why != nil else { return }
        let request = draft.brief
        let paths = draft.linked.map(\.url) + sources + existingSources
        guard !request.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !paths.isEmpty else { return }
        try? await Task.sleep(for: .milliseconds(400))
        guard !Task.isCancelled else { return }
        let found = await Task.detached { catalog.match(request: request, paths: paths) }.value
        guard !Task.isCancelled, let found, found.option != draft.format?.option, let option = catalog.option(found.option),
              draft.format == nil || draft.format?.why != nil else { return }
        choose(option, in: catalog, why: found.why)
    }

    // MARK: Prompt box

    /// One classic prompt box: the brief, the moves I like as thumbnails, any attached files, and one toolbar row pinned to the
    /// bottom: attach and format on the left, settings chips in the middle (folding into the overflow when narrow), Start film on the right.
    private var promptBox: some View {
        VStack(alignment: .leading, spacing: 12) {
            ComposerTextView(text: $draft.brief, placeholder: briefPlaceholder, minLines: 3, maxLines: 12, focused: $briefFocused, focusRequest: focusRequest)
                .frame(maxWidth: .infinity)
            if !draft.moments.isEmpty { momentThumbs.transition(.opacity) }
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

    /// "Moves I like" as a small row of thumbnails. Each opens a menu: where it should land, or remove.
    private var momentThumbs: some View {
        HStack(spacing: ComposerLayout.gap) {
            Text("Moves I like").font(.system(size: 11.5, weight: .medium)).foregroundStyle(.secondary)
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

    private var lengthShort: String { ComposerLayout.shortLength(draft.duration) }
    private var brandShort: String { draft.brand ?? "Brand" }
    private var motionShort: String { draft.motionLevel.capitalized }
    private var formatLabel: String {
        if let option = pickedOption { return option.title }
        return "What are you making?"
    }

    private func chipWidth(_ chip: ComposerChip) -> Double {
        switch chip {
        case .length: ComposerLayout.estimatedWidth(label: lengthShort)
        case .aspect: ComposerLayout.estimatedWidth(label: draft.aspect)
        case .motion: ComposerLayout.estimatedWidth(label: motionShort)
        case .brand: ComposerLayout.estimatedWidth(label: brandShort)
        }
    }

    private var toolbarSplit: (inline: [ComposerChip], overflow: [ComposerChip]) {
        // Left group (+ and the format chip), the overflow button and Start film take what they need first.
        let fixed = 28 + 8 + min(ComposerLayout.estimatedWidth(label: formatLabel), 230) + 8 + 28 + 8 + 150
        let widths = Dictionary(uniqueKeysWithValues: ComposerChip.allCases.map { ($0, chipWidth($0)) })
        return ComposerLayout.split(available: toolbarWidth, fixed: fixed, widths: widths)
    }

    private var toolbar: some View {
        let split = toolbarSplit
        return HStack(spacing: ComposerLayout.gap) {
            Button { choose() } label: {
                Image(systemName: "plus").font(.system(size: 13, weight: .medium))
                    .frame(width: 28, height: 28).background(chipFill, in: Circle())
                    .overlay(Circle().strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5))
            }.buttonStyle(.plain).help("Add footage, images or documents (optional). You can also drop them here.")
                .accessibilityLabel("Attach files")
            formatChip
            ForEach(split.inline, id: \.self) { settingsChip($0) }
            overflowMenu(split.overflow)
            Spacer(minLength: 8)
            runButton.controlSize(.regular)
        }
        .frame(height: 32)
        .background(GeometryReader { proxy in Color.clear.onChange(of: proxy.size.width, initial: true) { _, width in toolbarWidth = width } })
    }

    @ViewBuilder private func settingsChip(_ chip: ComposerChip) -> some View {
        switch chip {
        case .length: lengthChip
        case .aspect: shapeChip
        case .motion: motionChip
        case .brand: brandChip
        }
    }

    private var formatChip: some View {
        Button { changingFormat.toggle() } label: {
            HStack(spacing: 6) {
                Image(systemName: pickedOption.map { FormatPickerView.symbol($0.tile) } ?? "square.grid.2x2").font(.system(size: 12))
                Text(formatLabel).font(.system(size: 13, weight: .medium)).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold)).opacity(0.6)
            }
            .foregroundStyle(pickedOption == nil ? Color.primary : Color.rasan)
            .padding(.horizontal, 10).frame(height: ComposerLayout.chipHeight)
            .background(pickedOption == nil ? chipFill : Color.rasan.opacity(0.16), in: Capsule())
            .frame(maxWidth: 230)
        }
        .buttonStyle(.plain).help("What are you making? Opens the format list")
        .accessibilityLabel("Format: \(formatLabel)")
    }

    /// Everything that does not fit on the row, plus the quieter options: the model choice and Get inspired.
    private func overflowMenu(_ folded: [ComposerChip]) -> some View {
        Menu {
            ForEach(folded, id: \.self) { chip in
                switch chip {
                case .length: Menu("Length: \(lengthShort)") { lengthMenuContent }
                case .aspect: Menu("Shape: \(draft.aspect)") { shapeMenuContent }
                case .motion: Menu("Motion: \(motionShort)") { motionMenuContent }
                case .brand: Menu("Brand: \(draft.brand ?? "none")") { brandMenuContent }
                }
            }
            if !folded.isEmpty { Divider() }
            Button { showGallery = true } label: {
                Label(draft.moments.isEmpty ? "Get inspired…" : "Get inspired (\(draft.moments.count) picked)…", systemImage: "sparkle.magnifyingglass")
            }
            if agent == .claude { Button { showModels = true } label: { Label("Models: \(draft.modelPlan.chipTitle)…", systemImage: "sparkles") } }
            Menu("Pace: \(draft.pace.chipTitle)") {
                Picker("Pace", selection: $draft.pace) {
                    ForEach(FilmPace.allCases) { Text("\($0.title): \($0.summary)").tag($0) }
                }.pickerStyle(.inline).labelsHidden()
            }
        } label: {
            Image(systemName: "ellipsis").font(.system(size: 13, weight: .medium)).frame(width: 28, height: 28)
                .foregroundStyle(draft.pace == store.settings.pace && draft.modelPlan == .recommended ? Color.primary : Color.rasan)
                .background(chipFill, in: Circle())
        }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
        .help("More: Get inspired, models, pace and any settings that do not fit")
        .accessibilityLabel("More options")
        .popover(isPresented: $showModels, arrowEdge: .bottom) { modelPicker }
    }

    /// Footage folders and a reference video, used where they are. Separate wells: footage is cut, a reference is only studied.
    private var linkedWells: some View {
        HStack(alignment: .top, spacing: 14) {
            LinkedSourceWell(kind: .footage, sources: $draft.linked, disabled: working, prompt: pickedOption.flatMap { catalog?.folderPrompt(for: $0) })
            LinkedSourceWell(kind: .reference, sources: $draft.linked, disabled: working)
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

    @ViewBuilder private var lengthMenuContent: some View {
        Picker("Length", selection: Binding(get: { customLength ? -1 : draft.duration }, set: { v in
            if v == -1 { customLength = true } else { customLength = false; draft.duration = v } })) {
            ForEach(Self.lengths, id: \.1) { Text($0.0).tag($0.1) }
            Divider()
            Text("Custom…").tag(-1)
        }.pickerStyle(.inline).labelsHidden()
    }
    private var lengthChip: some View {
        HStack(spacing: 6) {
            Menu { lengthMenuContent } label: { chipLabel("clock", lengthShort) }
                .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Length: \(lengthLabel)")
                .accessibilityLabel("Length: \(lengthLabel)")
            if customLength {
                Stepper("", value: $draft.duration, in: 5...600, step: 5).labelsHidden().controlSize(.small)
            }
        }
    }

    private static let aspectNames = ["16:9": "Landscape", "9:16": "Portrait", "1:1": "Square"]
    private static let aspectIcons = ["16:9": "rectangle", "9:16": "rectangle.portrait", "1:1": "square"]
    @ViewBuilder private var shapeMenuContent: some View {
        Picker("Shape", selection: $draft.aspect) {
            ForEach(["16:9", "9:16", "1:1"], id: \.self) { Label("\(Self.aspectNames[$0] ?? $0) · \($0)", systemImage: Self.aspectIcons[$0] ?? "rectangle").tag($0) }
        }.pickerStyle(.inline).labelsHidden()
    }
    private var shapeChip: some View {
        Menu { shapeMenuContent } label: { chipLabel(Self.aspectIcons[draft.aspect] ?? "rectangle", draft.aspect) }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Shape: \(Self.aspectNames[draft.aspect] ?? draft.aspect)")
            .accessibilityLabel("Shape: \(Self.aspectNames[draft.aspect] ?? draft.aspect)")
    }

    @ViewBuilder private var motionMenuContent: some View {
        Picker("Motion graphics", selection: $draft.motionLevel) {
            Text("Maximal").tag("maximal"); Text("Balanced").tag("balanced"); Text("Minimal").tag("minimal")
        }.pickerStyle(.inline).labelsHidden()
    }
    private var motionChip: some View {
        Menu { motionMenuContent } label: { chipLabel("wand.and.sparkles", motionShort) }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize()
            .help("Motion: how ambitious it is, how many designed elements and how intricate their movement")
            .accessibilityLabel("Motion: \(motionShort)")
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
            Text("Models").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary).padding(.horizontal, 10).padding(.top, 4)
            ForEach(ModelPlan.allCases) { plan in
                Button { draft.modelPlan = plan; showModels = false } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: draft.modelPlan == plan ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(draft.modelPlan == plan ? Color.rasan : .secondary).padding(.top, 1)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(plan.title).font(.system(size: 13, weight: .semibold))
                                if plan == .recommended {
                                    Text("Recommended").font(.system(size: 10, weight: .semibold)).foregroundStyle(Color.rasan)
                                        .padding(.horizontal, 6).padding(.vertical, 2).background(Color.rasan.opacity(0.16), in: Capsule())
                                }
                            }
                            Text(plan.summary).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(10).contentShape(Rectangle())
                    .background(draft.modelPlan == plan ? Color.rasan.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
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

    private var runLabel: some View {
        HStack(spacing: 6) {
            Text("Start film")
            Image(systemName: "command").font(.system(size: 11)); Image(systemName: "return").font(.system(size: 11))
        }
    }

    @ViewBuilder private var runButton: some View {
        if editingQueued {
            Button { saveQueuedChanges() } label: { Text("Save changes") }
                .buttonStyle(.borderedProminent).controlSize(.regular).keyboardShortcut(.return, modifiers: .command)
                .disabled(working || trimmedBrief.isEmpty)
        } else if directorReady {
            if directorBusy {
                Button { store.ensureConsent(for: agent) { save(start: false, queue: true) } } label: { Text("Start when free") }
                    .buttonStyle(.borderedProminent).controlSize(.regular).keyboardShortcut(.return, modifiers: .command)
                    .disabled(working || trimmedBrief.isEmpty)
            } else {
                Button { start() } label: { runLabel }
                    .buttonStyle(.borderedProminent).controlSize(.regular).keyboardShortcut(.return, modifiers: .command)
                    .disabled(working || checkingStart || trimmedBrief.isEmpty || store.toolSetup.isRunning)
            }
        } else if store.settings.checking.contains(agent.id) {
            HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Checking director…").font(.system(size: 12)).foregroundStyle(.secondary) }
        } else {
            Button("Set up a director…") { store.settings.showWelcome = true }
                .buttonStyle(.borderedProminent).controlSize(.regular)
        }
    }

    // MARK: Footer

    private var footer: some View {
        VStack(spacing: 8) {
            if loaded && !editorState.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle")
                    Text("Draft saved automatically")
                }.font(.system(size: 11)).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                if loaded && !editorState.isEmpty {
                    Button("Discard changes…", role: .destructive) { showDiscard = true }.buttonStyle(StudioSecondaryButtonStyle()).disabled(working)
                }
                Spacer()
                if working || checkingStart { ProgressView().controlSize(.small) }
                if let queueNote { Text(queueNote).font(.system(size: 12)).foregroundStyle(.secondary).transition(.opacity) }
                Button("Save draft") { save(start: false) }.buttonStyle(StudioSecondaryButtonStyle()).disabled(working || (project == nil && trimmedBrief.isEmpty && name.isEmpty))
            }
            HStack(spacing: 4) {
                Spacer()
                Text(directorReady ? "Start film: \(agent.title) reads your brief, then asks you to confirm it ·" : "Set up and sign in to your director before starting.")
                Button("Change") { openSettings() }.buttonStyle(.link)
            }.font(.system(size: 11)).foregroundStyle(.secondary)
            if directorBusy && !editingQueued {
                Text("Starts automatically when the current film finishes.")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 32).padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .overlay(alignment: .top) { Divider() }
    }

    // MARK: Actions

    private func consumeTemplatePrefill() {
        guard loaded, let next = store.templatePrefill else { return }
        store.templatePrefill = nil
        proposeTemplate(next)
    }
    private func proposeTemplate(_ next: FilmDraft) {
        if draft != FilmDraft(agent: draft.agent, pace: draft.pace) { replacementDraft = next } else { applyTemplate(next) }
    }
    private func applyTemplate(_ next: FilmDraft) {
        draft = next
        draft.agent = store.settings.defaultAgent
        customLength = !Self.lengths.contains { $0.1 == draft.duration }
        templateMessage = nil
        if let brandName = draft.brand {
            if let brand = brands.first(where: { $0.name == brandName }) ?? brands.first(where: { $0.previousNames.contains(brandName) }) {
                draft.brand = brand.name
            } else {
                draft.brand = nil
                templateMessage = "The template’s brand \(brandName) is unavailable. Choose a brand below."
            }
        }
    }

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
        let title = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? autoName : name
        let brand = brands.first { $0.name == draft.brand } ?? brands.first { $0.previousNames.contains(draft.brand ?? "") }
        let submittedDraft = draft
        let submittedSources = sources
        Task {
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
        let title = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? autoName : name
        let brand = brands.first { $0.name == draft.brand } ?? brands.first { $0.previousNames.contains(draft.brand ?? "") }
        let submittedDraft = draft
        let submittedSources = sources
        Task {
            let saved = await store.saveFilm(name: title, draft: submittedDraft, sources: submittedSources, existing: project ?? store.filmDraftProject, brand: brand, start: start)
            working = false
            if let saved {
                if queue { store.enqueueFilm(saved, name: title, draft: submittedDraft) }
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
