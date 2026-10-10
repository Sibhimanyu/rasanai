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
    @FocusState private var briefFocused: Bool

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
                    Menu("Use template") {
                        ForEach(store.settings.filmTemplates) { template in
                            Button(template.name) { proposeTemplate(template.draft) }
                        }
                        if store.settings.filmTemplates.isEmpty { Text("Save your first template below") }
                    }.fixedSize()
                    Spacer()
                    Button("Save as template…") { templateName = name.isEmpty ? autoName : name; showSaveTemplate = true }
                        .disabled(trimmedBrief.isEmpty || working)
                }
                if let templateMessage { Text(templateMessage).font(.system(size: 12)).foregroundStyle(.secondary) }
                TextField("Untitled film", text: $name)
                    .textFieldStyle(.plain).font(.system(size: 30, weight: .semibold, design: .rounded))
                    .disabled(project != nil)
                promptBox
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
            if project == nil { briefFocused = draft.brief.isEmpty }
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
    }

    // MARK: Prompt box

    /// One classic prompt box: the brief, any attached files, and every option as a chip along the bottom.
    private var promptBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .topLeading) {
                TextEditor(text: $draft.brief)
                    .focused($briefFocused)
                    .font(.system(size: 15)).scrollContentBackground(.hidden)
                    .frame(height: 112)
                if draft.brief.isEmpty {
                    Text("A 30-second launch film for my budgeting app. Calm, confident, a little playful. End on the download button.")
                        .font(.system(size: 15)).foregroundStyle(.tertiary).padding(.leading, 5).padding(.top, 8).allowsHitTesting(false)
                }
            }
            if !draft.moments.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(draft.moments, id: \.id) { pick in
                        MomentChip(pick: pick, moment: store.gallery.moment(pick.id)) { draft.moments.removeAll { $0.id == pick.id } }
                    }
                }.transition(.opacity)
            }
            if !sources.isEmpty || !existingSources.isEmpty {
                LazyVStack(spacing: 8) {
                    ForEach(existingSources, id: \.self) { chip($0, removable: false) }
                    ForEach(sources, id: \.self) { chip($0, removable: true) }
                }.transition(.opacity)
            }
            HStack(alignment: .bottom, spacing: 12) {
                FlowLayout(spacing: 8) {
                    Button { choose() } label: {
                        Image(systemName: "plus").font(.system(size: 13, weight: .medium))
                            .frame(width: 32, height: 32).background(chipFill, in: Circle())
                            .overlay(Circle().strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5))
                    }.buttonStyle(.plain).help("Add footage, images or documents (optional). You can also drop them here.")
                    inspireChip
                    lengthChip
                    shapeChip
                    motionChip
                    brandChip
                    if agent == .claude { modelChip }
                    moreChip
                }
                runButton
            }
        }
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 14)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .strokeBorder(targeted ? Color.rasan : briefFocused ? Color.rasan.opacity(0.7) : Color(nsColor: .separatorColor), lineWidth: targeted || briefFocused ? 1.5 : 0.5))
        .animation(.snappy(duration: 0.15), value: targeted)
        .animation(.snappy, value: sources)
        .animation(.snappy, value: draft.moments)
    }

    private var chipFill: Color { Color.primary.opacity(0.07) }

    private func chipLabel(_ icon: String, _ text: String, tint: Bool = false) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 12))
            Text(text).font(.system(size: 13, weight: .medium))
            Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold)).opacity(0.6)
        }
        .foregroundStyle(tint ? Color.rasan : Color.primary)
        .padding(.horizontal, 12).frame(height: 32)
        .background(tint ? Color.rasan.opacity(0.16) : chipFill, in: Capsule())
    }

    private var inspireChip: some View {
        Button { showGallery = true } label: {
            HStack(spacing: 6) {
                Image(systemName: "sparkle.magnifyingglass").font(.system(size: 12))
                Text("Get inspired").font(.system(size: 13, weight: .medium))
                if !draft.moments.isEmpty { Text("\(draft.moments.count)").font(.system(size: 11, weight: .semibold)).monospacedDigit().opacity(0.8) }
            }
            .foregroundStyle(draft.moments.isEmpty ? Color.primary : Color.rasan)
            .padding(.horizontal, 12).frame(height: 32)
            .background(draft.moments.isEmpty ? chipFill : Color.rasan.opacity(0.16), in: Capsule())
        }
        .buttonStyle(.plain).help("Pick moments from real launch films to move like (optional)")
    }

    private var lengthChip: some View {
        HStack(spacing: 6) {
            Menu {
                Picker("Length", selection: Binding(get: { customLength ? -1 : draft.duration }, set: { v in
                    if v == -1 { customLength = true } else { customLength = false; draft.duration = v } })) {
                    ForEach(Self.lengths, id: \.1) { Text($0.0).tag($0.1) }
                    Divider()
                    Text("Custom…").tag(-1)
                }.pickerStyle(.inline).labelsHidden()
            } label: { chipLabel("clock", lengthLabel) }
                .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Length")
            if customLength {
                Stepper("", value: $draft.duration, in: 5...600, step: 5).labelsHidden().controlSize(.small)
            }
        }
    }

    private var shapeChip: some View {
        let names = ["16:9": "Landscape", "9:16": "Portrait", "1:1": "Square"]
        let icons = ["16:9": "rectangle", "9:16": "rectangle.portrait", "1:1": "square"]
        return Menu {
            Picker("Shape", selection: $draft.aspect) {
                ForEach(["16:9", "9:16", "1:1"], id: \.self) { Label("\(names[$0] ?? $0) · \($0)", systemImage: icons[$0] ?? "rectangle").tag($0) }
            }.pickerStyle(.inline).labelsHidden()
        } label: { chipLabel(icons[draft.aspect] ?? "rectangle", names[draft.aspect] ?? draft.aspect) }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Shape")
    }

    private var motionChip: some View {
        Menu {
            Picker("Motion graphics", selection: $draft.motionLevel) {
                Text("Maximal").tag("maximal"); Text("Balanced").tag("balanced"); Text("Minimal").tag("minimal")
            }.pickerStyle(.inline).labelsHidden()
        } label: { chipLabel("wand.and.sparkles", "\(draft.motionLevel.capitalized) motion") }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("How much motion graphics")
    }

    /// Less common options live here so the prompt box stays clean; a non-default choice shows as its own label.
    private var moreChip: some View {
        Menu {
            Picker("Pace", selection: $draft.pace) {
                ForEach(FilmPace.allCases) { Text("\($0.title): \($0.summary)").tag($0) }
            }.pickerStyle(.inline)
        } label: {
            if draft.pace == store.settings.pace { chipLabel("ellipsis", "More") }
            else { chipLabel("hare", draft.pace.chipTitle, tint: true) }
        }
        .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("More options: how fast the director works")
    }

    private var brandChip: some View {
        Menu {
            Picker("Brand", selection: Binding(get: { draft.brand ?? "" }, set: { v in
                if v == "__new" { store.openBrands() } else { draft.brand = v.isEmpty ? nil : v } })) {
                Text("No brand").tag("")
                ForEach(brands) { Text($0.name).tag($0.name) }
            }.pickerStyle(.inline).labelsHidden()
            Divider()
            Button("New brand…") { store.openBrands() }
        } label: { chipLabel("paintpalette", draft.brand ?? "No brand") }
            .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help("Brand")
    }

    private var modelChip: some View {
        Button { showModels.toggle() } label: {
            chipLabel("sparkles", draft.modelPlan.chipTitle, tint: draft.modelPlan == .recommended)
        }
        .buttonStyle(.plain).help("Which Claude models direct this film")
        .popover(isPresented: $showModels, arrowEdge: .bottom) { modelPicker }
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
                .buttonStyle(.borderedProminent).controlSize(.large).keyboardShortcut(.return, modifiers: .command)
                .disabled(working || trimmedBrief.isEmpty)
        } else if directorReady {
            if directorBusy {
                Button { store.ensureConsent(for: agent) { save(start: false, queue: true) } } label: { Text("Start when free") }
                    .buttonStyle(.borderedProminent).controlSize(.large).keyboardShortcut(.return, modifiers: .command)
                    .disabled(working || trimmedBrief.isEmpty)
            } else {
                Button { start() } label: { runLabel }
                    .buttonStyle(.borderedProminent).controlSize(.large).keyboardShortcut(.return, modifiers: .command)
                    .disabled(working || checkingStart || trimmedBrief.isEmpty || store.toolSetup.isRunning)
            }
        } else if store.settings.checking.contains(agent.id) {
            HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Checking director…").font(.system(size: 12)).foregroundStyle(.secondary) }
        } else {
            Button("Set up a director…") { store.settings.showWelcome = true }
                .buttonStyle(.borderedProminent).controlSize(.large)
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
                    Button("Discard changes…", role: .destructive) { showDiscard = true }.disabled(working)
                }
                Spacer()
                if working || checkingStart { ProgressView().controlSize(.small) }
                if let queueNote { Text(queueNote).font(.system(size: 12)).foregroundStyle(.secondary).transition(.opacity) }
                Button("Save draft") { save(start: false) }.disabled(working || (project == nil && trimmedBrief.isEmpty && name.isEmpty))
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

    private func add(_ urls: [URL]) -> Bool {
        guard !working, !urls.isEmpty else { return false }
        sources = Array(Set(sources + urls)).sorted { $0.path < $1.path }
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
