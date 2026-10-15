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
    @Environment(\.openSettings) private var openSettings
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
    /// The previous option, so a pick only moves length and shape the person has not changed.
    @State private var lastFormatOption: String?
    @State private var changingFormat = false
    @State private var showSettings = false
    @State private var showFootage = false
    @State private var showReference = false
    @State private var editingBrief = false
    @State private var linkMessage: String?
    @FocusState private var nameFocused: Bool
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
    private var lengthLabel: String {
        if !customLength, let match = Self.lengths.first(where: { $0.1 == draft.duration }) { return match.0 }
        return "\(draft.duration) seconds"
    }

    var body: some View {
        Group {
            if embedded {
                // On Home: just the prompt box. Its Continue names the film and opens the New film page with everything
                // filled in on the same unsaved draft. Starting still requires the setup page’s explicit action.
                homeComposer
            } else { fullPage }
        }
        .dropDestination(for: URL.self, action: { urls, _ in add(urls.filter(\.isFileURL)) }, isTargeted: { targeted = $0 })
        .alert("Save as template", isPresented: $showSaveTemplate) {
            TextField("Template name", text: $templateName)
            Button("Cancel", role: .cancel) { }
            Button("Save") { store.saveTemplate(name: templateName, draft: draft); templateMessage = "Template saved. Use it for your next film." }
                .disabled(templateName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } message: { Text("Saves everything on this page except the film name and its files.") }
        .confirmationDialog("Replace your brief and film options?", isPresented: Binding(get: { replacementDraft != nil }, set: { if !$0 { replacementDraft = nil } }), titleVisibility: .visible) {
            Button("Use template") { if let next = replacementDraft { applyTemplate(next) }; replacementDraft = nil }
        } message: { Text("Your film name and attached files are kept.") }
        .sheet(isPresented: $showGallery) {
            GetInspiredSheet(gallery: store.gallery, selection: MomentSelection(draft.moments)) { picks in
                showGallery = false; edit { draft.moments = picks }
            } onCancel: { showGallery = false }
            .tint(.rasan)
        }
        .onChange(of: store.templatePrefill) { consumeTemplatePrefill() }
        .onChange(of: briefFocused) {
            // Keep an initially empty editor open as soon as typing makes the brief nonempty.
            if briefFocused { editingBrief = true }
        }
        .onChange(of: editorState) { persistEditor() }
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
            lastFormatOption = draft.format?.option
            loaded = true
            consumeTemplatePrefill()
            editingBrief = trimmedBrief.isEmpty
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

    /// A suggested format remains explainable and undoable in the setup summary.
    @ViewBuilder private var formatNotes: some View {
        if let option = pickedOption {
            VStack(alignment: .leading, spacing: 6) {
                if let why = draft.format?.why, !why.isEmpty {
                    HStack(spacing: 4) {
                        Text("Suggested from your brief").help(why)
                        Button("Undo") { undoAutoPick() }.buttonStyle(.link)
                            .help("Undo the suggested format and restore your earlier length and shape")
                    }.font(.system(size: 11.5)).foregroundStyle(.secondary)
                }
                if option.status == .soon {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("This format is coming soon. Choose another format to start.").font(.system(size: 12)).foregroundStyle(Color(nsColor: .systemOrange))
                        if let missing = option.soon?.missing {
                            Text(missing).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        if !working, let catalog, let near = catalog.nearest(of: option) {
                            Button("Use \(near.title) instead") { choose(near, in: catalog) }.controlSize(.small)
                        }
                    }
                } else if option.status == .partial, let limitation = option.partial {
                    Label(limitation, systemImage: "info.circle")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
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

    private var fullPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(project == nil ? "A good starting point." : "Edit your film")
                        .font(.system(size: 30, weight: .semibold)).tracking(-0.5)
                        .accessibilityAddTraits(.isHeader)
                    Text(project == nil ? "We’ve suggested the essentials. Adjust anything before you start."
                         : "Adjust anything, then save. You’ll review the creative choices as your film takes shape.")
                        .font(.system(size: 14)).foregroundStyle(.secondary)
                }
                projectSection
                briefSection
                materials
                settingsSection
                if let templateMessage { Text(templateMessage).font(.system(size: 12)).foregroundStyle(.secondary) }
            }
            .disabled(working)
            .task(id: matchKey) {
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                readLength()
                if let catalog { await autoMatch(catalog) }
            }
            .task(id: templateMessage) {
                guard templateMessage != nil else { return }
                try? await Task.sleep(for: .seconds(4))
                guard !Task.isCancelled else { return }
                withAnimation { templateMessage = nil }
            }
            .padding(.horizontal, 32).padding(.top, 36).padding(.bottom, 28)
            .frame(maxWidth: 850).frame(maxWidth: .infinity)
        }
        .background(Color.appBackground)
        .safeAreaInset(edge: .bottom, spacing: 0) { footer }
        .navigationTitle(project == nil ? "New film" : "Edit film")
        .pageHeader(project == nil ? "New film" : "Edit film")
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.system(size: 15, weight: .semibold)).accessibilityAddTraits(.isHeader)
    }

    /// The quiet panel every setup section sits in.
    private func sectionPanel<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16).workspacePanel()
    }

    // MARK: Project

    private var projectSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Project")
            sectionPanel {
                HStack(spacing: 12) {
                    Image(systemName: pickedOption.map { FormatPickerView.symbol($0.tile) } ?? "film")
                        .font(.system(size: 17, weight: .medium)).foregroundStyle(Color.rasan)
                        .frame(width: 44, height: 44).background(Color.rasan.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    TextField(autoName, text: $name)
                        .textFieldStyle(.plain).font(.system(size: 20, weight: .semibold))
                        .focused($nameFocused)
                        .disabled(project != nil).accessibilityLabel("Film name")
                        .help(project == nil ? "Rename your film" : "Rename this film from the Library")
                    if project == nil {
                        Button { nameFocused = true } label: { Label("Rename", systemImage: "pencil").font(.system(size: 12.5)) }
                            .buttonStyle(.plain).foregroundStyle(.secondary).help("Edit the film’s name")
                    }
                    Spacer(minLength: 0)
                }
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 14) { formatField; lengthField; shapeField }
                    VStack(alignment: .leading, spacing: 12) { formatField; HStack(alignment: .top, spacing: 14) { lengthField; shapeField } }
                }
                if pickedOption == nil {
                    Text(catalog == nil ? "Your director will work out the format from your brief." : "Choose a film type, or let your director work it out from your brief.")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
                formatNotes
                if let catalog, let option = pickedOption, option.scopeQuestion != nil {
                    FormatPickerView(catalog: catalog, pick: draft.format, canAct: !working,
                                     onPick: { choose($0, in: catalog) }, onScope: { draft.format?.scope = $0 },
                                     changing: .constant(false), showsChip: false)
                }
            }
        }
    }

    // MARK: Brief

    private var briefSection: some View {
        let expanded = editingBrief || trimmedBrief.isEmpty
        return VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Brief")
            if expanded {
                promptBox
                if trimmedBrief.isEmpty {
                    Text("Describe your film to continue. An idea, a link, or a few words is enough.").font(.system(size: 12)).foregroundStyle(.secondary)
                } else {
                    Button("Done") { toggleBriefEditing() }.buttonStyle(.link).font(.system(size: 12.5))
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    Text(trimmedBrief).font(.system(size: 14)).lineLimit(4).fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button { toggleBriefEditing() } label: { Label("Edit", systemImage: "pencil").font(.system(size: 12.5)) }
                        .buttonStyle(.plain).foregroundStyle(.secondary).help("Edit your brief")
                }
                .padding(16).workspacePanel()
            }
        }
    }

    private func toggleBriefEditing() {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { editingBrief.toggle() }
        if editingBrief { focusRequest += 1 }
    }

    /// Describe, on Home: one card holds the brief, what is attached and Continue; examples sit under it, never settings.
    private var homeComposer: some View {
        VStack(alignment: .leading, spacing: 22) {
            promptCard
            exampleStarts
        }
    }

    /// The single surface: editor, attachments and a compact toolbar. Border, focus ring and shadow are drawn on this one
    /// shape only, with fixed widths, so focus and hover change colour and never geometry.
    private var promptCard: some View {
        let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
        let hasMaterials = !sources.isEmpty || !existingSources.isEmpty || !draft.linked.isEmpty
        return VStack(alignment: .leading, spacing: 0) {
            ComposerTextView(text: $draft.brief, placeholder: briefPlaceholder, minLines: 3, maxLines: 8, focused: $briefFocused, focusRequest: focusRequest, fontSize: 16)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20).padding(.top, 18).padding(.bottom, 12)
            if !draft.moments.isEmpty {
                momentThumbs.padding(.horizontal, 20).padding(.bottom, 12).transition(.opacity)
            }
            if hasMaterials {
                VStack(spacing: 0) {
                    Divider()
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
                    .padding(.horizontal, 20).padding(.bottom, 8)
            }
            HStack(spacing: 12) {
                addMaterialsMenu(prominent: false)
                Spacer(minLength: 8)
                runButton
            }
            .padding(.horizontal, 12).padding(.bottom, 12).padding(.top, 2)
        }
        .background(Workspace.panel, in: shape)
        .overlay { shape.strokeBorder(cardBorder, lineWidth: 1) }
        // The focus ring sits just outside the border at a fixed width; only its opacity changes.
        .overlay { shape.inset(by: -2).strokeBorder(Color.rasan.opacity(targeted ? 0.55 : briefFocused ? 0.32 : 0), lineWidth: 3) }
        .shadow(color: .black.opacity(0.22), radius: 12, y: 4)
        .contentShape(shape)
        .onHover { cardHovered = $0 }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: briefFocused)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: cardHovered)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: targeted)
    }

    private var cardBorder: Color {
        if targeted { return Color.rasan }
        if briefFocused { return Color.rasan.opacity(0.75) }
        return cardHovered ? Color.primary.opacity(0.22) : Workspace.hairline
    }

    /// Optional starting points from the Inspiration gallery. Choosing one adds it as a move on this draft. Hidden when the
    /// gallery has nothing to show.
    @ViewBuilder private var exampleStarts: some View {
        let featured = store.gallery.moments.filter(\.featured)
        let examples = Array((featured.isEmpty ? store.gallery.moments : featured).prefix(3))
        if !examples.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Or start from an example").font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary)
                    Spacer()
                    Button("Browse all") { store.path = [.inspire] }.buttonStyle(.link).font(.system(size: 12.5))
                }
                // Each card is an explicit size, so a large source image can never stretch the row.
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 14) {
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
                .frame(height: ExampleCard.height + 4)
            }
        }
    }

    /// The brief box: text only. Attachments and the primary action live outside it.
    private var promptBox: some View {
        ComposerTextView(text: $draft.brief, placeholder: briefPlaceholder, minLines: embedded ? 5 : 4, maxLines: 12, focused: $briefFocused, focusRequest: focusRequest, fontSize: embedded ? 17 : 15)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 20).padding(.vertical, 18)
            .background(Workspace.panel, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(targeted ? Color.rasan : briefFocused ? Color.rasan.opacity(0.7) : Workspace.hairline, lineWidth: targeted || briefFocused ? 1.5 : 1))
            .animation(reduceMotion ? nil : .snappy(duration: 0.15), value: targeted)
    }

    private func addMaterialsMenu(prominent: Bool) -> some View {
        Menu {
            Button("Files…") { choose() }
            Button("Footage folder…") { if embedded { chooseLinked(.footage) } else { showFootage = true } }
            Button("Reference video…") { if embedded { chooseLinked(.reference) } else { showReference = true } }
            Button("Moves from Inspiration…") { showGallery = true }
        } label: { Label("Add materials", systemImage: "plus").font(.system(size: 13, weight: .medium)).padding(.horizontal, 6) }
            .menuStyle(.button).buttonStyle(.rasanSecondary).controlSize(prominent ? .large : .regular).menuIndicator(.hidden).fixedSize()
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
        for url in panel.urls {
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

    private var lengthShort: String { ComposerLayout.shortLength(draft.duration) }
    private var brandShort: String { draft.brand ?? "Brand" }
    private var motionShort: String { MotionLevel.title(draft.motionLevel) }
    private var formatLabel: String {
        if let option = pickedOption { return option.title }
        return catalog == nil ? "Automatic format" : "Choose a format"
    }

    /// A labelled, field-shaped control: the label above, the current value inside.
    private func field<Control: View>(_ title: String, @ViewBuilder _ control: () -> Control) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 12)).foregroundStyle(.secondary)
            control()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func fieldLabel(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 13)).foregroundStyle(.secondary).frame(width: 18)
            Text(text).font(.system(size: 14)).lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 4)
            Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
        }
        .foregroundStyle(Color.primary)
        .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.primary.opacity(0.14), lineWidth: 1) }
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var formatField: some View {
        field("Film type") {
            Button { changingFormat.toggle() } label: {
                fieldLabel(pickedOption.map { FormatPickerView.symbol($0.tile) } ?? "square.grid.2x2", formatLabel)
            }
            .buttonStyle(.plain).help("Optional. RasanAI picks a format from your words. Click to choose one yourself.")
            .accessibilityLabel("Film type: \(formatLabel)")
            .disabled(catalog == nil)
            // The full catalogue appears only when requested.
            .popover(isPresented: $changingFormat, arrowEdge: .bottom) {
                if let catalog {
                    ScrollView {
                        FormatPickerView(catalog: catalog, pick: draft.format, canAct: !working,
                                         onPick: { option in choose(option, in: catalog); changingFormat = false },
                                         onScope: { draft.format?.scope = $0 }, changing: $changingFormat, showsChip: false, showsScope: false)
                            .padding(16)
                    }
                    .frame(width: 740).frame(maxHeight: 560)
                }
            }
        }
    }

    private var lengthField: some View {
        field("Duration") {
            Menu { lengthMenuContent } label: { fieldLabel("clock", lengthLabel) }
                .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).help("Length: \(lengthLabel)")
                .accessibilityLabel("Length: \(lengthLabel)")
            if customLength {
                Stepper(value: $draft.duration, in: 5...600, step: 5) { Text("\(draft.duration) s").monospacedDigit().font(.system(size: 12)) }
                    .controlSize(.small).accessibilityLabel("Custom length in seconds")
            }
        }
    }

    private var shapeField: some View {
        field("Shape") {
            let name = Self.aspectNames[draft.aspect] ?? draft.aspect
            Menu { shapeMenuContent } label: { fieldLabel(Self.aspectIcons[draft.aspect] ?? "rectangle", "\(name) \(draft.aspect)") }
                .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).help("Shape: \(name)")
                .accessibilityLabel("Shape: \(name)")
        }
    }

    /// Model preferences remain available within the setup settings.
    private var modelsChip: some View {
        Button { showModels = true } label: { chipLabel("sparkles", draft.modelPlan.chipTitle) }
            .buttonStyle(.plain).help("Which Claude models make this film: \(draft.modelPlan.summary)")
            .accessibilityLabel("Models: \(draft.modelPlan.chipTitle)")
            .popover(isPresented: $showModels, arrowEdge: .bottom) { modelPicker }
    }

    private var wantsFootage: Bool {
        pickedOption.flatMap { catalog?.folderPrompt(for: $0) } != nil
    }

    private var hasAnyMaterial: Bool { !sources.isEmpty || !existingSources.isEmpty || !draft.linked.isEmpty || !draft.moments.isEmpty }

    private var materials: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Materials")
            VStack(spacing: 0) {
                if !hasAnyMaterial {
                    Text("No files attached. Add materials now or when your director asks for them.")
                        .font(.system(size: 12.5)).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 14)
                    Divider()
                }
                ForEach(existingSources, id: \.self) { sourceRow($0, removable: false); Divider() }
                ForEach(sources, id: \.self) { sourceRow($0, removable: true); Divider() }
                if !draft.moments.isEmpty {
                    momentThumbs.padding(.horizontal, 16).padding(.vertical, 10)
                    Divider()
                }
                HStack { addMaterialsMenu(prominent: false); Spacer(minLength: 0) }.padding(.horizontal, 12).padding(.vertical, 10)
            }
            .workspacePanel()
            if let catalog, let option = pickedOption, option.status != .soon {
                FormatInputsNote(catalog: catalog, option: option, requiredOnly: true)
                if catalog.inputSlots(for: option).contains(where: { !$0.required }) {
                    DisclosureGroup("Other useful materials") {
                        FormatInputsNote(catalog: catalog, option: option, optionalOnly: true).padding(.top, 8)
                    }
                    .font(.system(size: 12))
                }
            }
            if wantsFootage || showFootage || draft.linked.contains(where: { $0.kind == .footage }) {
                LinkedSourceWell(kind: .footage, sources: $draft.linked, disabled: working,
                                 prompt: pickedOption.flatMap { catalog?.folderPrompt(for: $0) })
            }
            if showReference || !draft.moments.isEmpty || draft.linked.contains(where: { $0.kind == .reference }) {
                LinkedSourceWell(kind: .reference, sources: $draft.linked, disabled: working,
                                 moves: AnyView(momentThumbs), movesCount: draft.moments.count, onPickMoves: { showGallery = true })
            }
        }
    }

    private var settingsSummary: String {
        ([draft.pace.chipTitle, motionShort, draft.brand ?? "No brand"] + (agent == .claude ? [draft.modelPlan.chipTitle] : [])).joined(separator: " · ")
    }

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { showSettings.toggle() }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
                        .rotationEffect(.degrees(showSettings ? 90 : 0)).frame(width: 14)
                    Text("Creative settings").font(.system(size: 14, weight: .medium))
                    Spacer(minLength: 12)
                    Text(settingsSummary).font(.system(size: 12.5)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.tail)
                }
                .padding(16).contentShape(Rectangle())
            }
            .buttonStyle(.plain).accessibilityValue(showSettings ? "Expanded" : "Collapsed")
            if showSettings {
                VStack(alignment: .leading, spacing: 16) {
                    settingRow("Pace") { paceChip }
                    settingRow("Motion") { motionChip }
                    settingRow("Brand") { brandChip }
                    if agent == .claude { settingRow("Models") { modelsChip } }
                }
                .padding(.horizontal, 16).padding(.bottom, 16)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
    }

    private func settingRow<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(title).font(.system(size: 13)).foregroundStyle(.secondary)
            Spacer()
            content()
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

    private static let aspectNames = ["16:9": "Landscape", "9:16": "Portrait", "1:1": "Square"]
    private static let aspectIcons = ["16:9": "rectangle", "9:16": "rectangle.portrait", "1:1": "square"]
    @ViewBuilder private var shapeMenuContent: some View {
        Picker("Shape", selection: $draft.aspect) {
            ForEach(["16:9", "9:16", "1:1"], id: \.self) { Label("\(Self.aspectNames[$0] ?? $0) · \($0)", systemImage: Self.aspectIcons[$0] ?? "rectangle").tag($0) }
        }.pickerStyle(.inline).labelsHidden()
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
        if embedded {
            Button { continueToEditor() } label: {
                HStack(spacing: 6) {
                    if working { ProgressView().controlSize(.mini) }
                    Text("Continue"); Image(systemName: "arrow.right")
                }
            }
            .buttonStyle(.rasanPrimary).controlSize(.large).keyboardShortcut(.return, modifiers: .command)
            .disabled(working || trimmedBrief.isEmpty)
            .help(trimmedBrief.isEmpty ? "Describe your film first" : "Next: check the options and start (⌘↩)")
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

    // MARK: Footer

    private var footer: some View {
        VStack(spacing: 8) {
            // The main row holds only actions, so the primary one is never squeezed.
            HStack(spacing: 12) {
                Button { if store.canGoBack { store.goBack() } else { store.goHome() } } label: { Label("Back", systemImage: "arrow.left") }
                    .buttonStyle(.plain).foregroundStyle(.secondary).disabled(working).help("Back (your draft is kept)")
                Spacer(minLength: 8)
                if working || checkingStart { ProgressView().controlSize(.small) }
                Menu {
                    Button("Save to Library") { save(start: false) }
                        .disabled(working || (project == nil && trimmedBrief.isEmpty && name.isEmpty))
                    Menu("Use template") {
                        ForEach(store.settings.filmTemplates) { template in
                            Button(template.name) { proposeTemplate(template.draft) }
                        }
                        if store.settings.filmTemplates.isEmpty { Text("No saved templates") }
                    }
                    Button("Save as template…") { templateName = name.isEmpty ? autoName : name; showSaveTemplate = true }
                        .disabled(trimmedBrief.isEmpty || working)
                    if loaded && !editorState.isEmpty {
                        Divider()
                        Button(isNewFilm ? "Discard film…" : "Discard changes…", role: .destructive) { showDiscard = true }
                    }
                } label: { Label("More", systemImage: "ellipsis") }
                    .menuStyle(.button).buttonStyle(.rasanSecondary).menuIndicator(.hidden).fixedSize().disabled(working)
                runButton.fixedSize()
            }
            // The quiet line: what is kept, who directs, and the queue's last word.
            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    if loaded && !editorState.isEmpty {
                        Image(systemName: "checkmark.circle")
                        Text("Kept if you leave ·")
                    }
                    Text(directorReady ? "Directed by \(agent.title) ·" : "No director set up yet ·")
                    Button(directorReady ? "Change" : "Set up…") { if directorReady { openSettings() } else { store.settings.showWelcome = true } }
                        .buttonStyle(.link)
                }.font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: 8)
                if let queueNote { Text(queueNote).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1).transition(.opacity) }
            }
        }
        .padding(.horizontal, 32).padding(.vertical, 12)
        .frame(maxWidth: 850 + 64).frame(maxWidth: .infinity)
        .background(Color.appBackground)
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
                templateMessage = "The template’s brand \(brandName) is unavailable. Choose a brand in Settings."
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
        edit {
            if !split.folders.isEmpty { draft.linked = LinkedSource.merge(draft.linked, adding: split.folders) }
            if !split.files.isEmpty { sources = Array(Set(sources + split.files)).sorted { $0.path < $1.path } }
        }
        return true
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
        try? await Task.sleep(for: .seconds(1.2))
        let brief = trimmedBrief
        let fresh = await FilmTitle.suggest(for: brief)
        guard !Task.isCancelled, name == made.title else { return }
        name = fresh
        suggested = (fresh, brief)
        store.suggestedFilmTitle = (fresh, brief)
    }
    /// Home’s Continue retains the draft and opens its compact setup review.
    private func continueToEditor() {
        working = true
        Task {
            if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let brief = trimmedBrief
                name = await FilmTitle.suggest(for: brief)
                store.suggestedFilmTitle = (name, brief)
            }
            working = false
            persistEditor()
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
        let submittedDraft = draft
        let submittedSources = sources
        Task {
            let title = typedName.isEmpty ? await FilmTitle.suggest(for: trimmedBrief) : name
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
