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
    @FocusState private var briefFocused: Bool

    private static let lengths: [(String, Int)] = [("15 seconds", 15), ("30 seconds", 30), ("45 seconds", 45), ("60 seconds", 60), ("90 seconds", 90), ("2 minutes", 120)]
    private var trimmedBrief: String { draft.brief.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var agent: LocalAgent { store.settings.agent }
    private var directorReady: Bool { store.settings.isReady(agent) }
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
                    }
                    Spacer()
                    Button("Save as template…") { templateName = name.isEmpty ? autoName : name; showSaveTemplate = true }
                        .disabled(trimmedBrief.isEmpty || working)
                }
                if let templateMessage { Text(templateMessage).font(.system(size: 12)).foregroundStyle(.secondary) }
                TextField("Untitled film", text: $name)
                    .textFieldStyle(.plain).font(.system(size: 30, weight: .semibold, design: .rounded))
                    .disabled(project != nil)
                VStack(alignment: .leading, spacing: 8) {
                    label("What's it about?")
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $draft.brief)
                            .focused($briefFocused)
                            .font(.system(size: 14)).scrollContentBackground(.hidden)
                            .padding(.horizontal, 8).padding(.vertical, 8).frame(height: 150)
                        if draft.brief.isEmpty {
                            Text("A 30-second launch film for my budgeting app. Calm, confident, a little playful. End on the download button.")
                                .font(.system(size: 14)).foregroundStyle(.tertiary).padding(.horizontal, 13).padding(.vertical, 16).allowsHitTesting(false)
                        }
                    }
                    .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(briefFocused ? Color.rasan.opacity(0.7) : Color(nsColor: .separatorColor), lineWidth: briefFocused ? 1.5 : 0.5))
                }
                dropZone
                options
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
                Button("Check readiness…") { store.showPreflight(project: project ?? recoveryProject, sources: sources + existingSources) }
                    .disabled(working)
            }
            ToolbarItem(placement: .primaryAction) {
                HelpButton(title: "New film", lines: [
                    "Say what the film is about in your own words. A sentence is enough.",
                    "Add footage, images or documents if you have them. Copies go into the film; originals stay put.",
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
            loaded = true
            consumeTemplatePrefill()
            if project == nil { briefFocused = draft.brief.isEmpty }
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
    }

    // MARK: Drop zone

    private var dropZone: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(spacing: 8) {
                Image(systemName: "square.and.arrow.down").font(.system(size: 20, weight: .light)).foregroundStyle(targeted ? Color.rasan : .secondary)
                Text("Add footage, images or documents (optional)").font(.system(size: 13)).foregroundStyle(.secondary)
                Button("Choose…") { choose() }.controlSize(.small)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 18)
            .background(targeted ? Color.rasan.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(targeted ? Color.rasan : Color(nsColor: .tertiaryLabelColor), style: StrokeStyle(lineWidth: 1.2, dash: [6, 4])))
            .animation(.snappy(duration: 0.15), value: targeted)
            if !sources.isEmpty || !existingSources.isEmpty {
                LazyVStack(spacing: 8) {
                    ForEach(existingSources, id: \.self) { chip($0, removable: false) }
                    ForEach(sources, id: \.self) { chip($0, removable: true) }
                }.transition(.opacity)
            }
        }.animation(.snappy, value: sources)
    }

    private func chip(_ url: URL, removable: Bool) -> some View {
        HStack(spacing: 10) {
            SourceRow(url: url)
            if removable {
                Button { sources.removeAll { $0 == url } } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain).help("Remove")
            }
        }.padding(10).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Options

    private var options: some View {
        HStack(alignment: .top, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                label("Length")
                Picker("Length", selection: Binding(get: { customLength ? -1 : draft.duration }, set: { v in
                    if v == -1 { customLength = true } else { customLength = false; draft.duration = v } })) {
                    ForEach(Self.lengths, id: \.1) { Text($0.0).tag($0.1) }
                    Divider()
                    Text("Custom…").tag(-1)
                }.pickerStyle(.menu).labelsHidden().fixedSize()
                if customLength {
                    Stepper("\(draft.duration) s", value: $draft.duration, in: 5...600, step: 5).font(.system(size: 12))
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                label("Shape")
                Picker("Shape", selection: $draft.aspect) {
                    Image(systemName: "rectangle").tag("16:9").help("Landscape")
                    Image(systemName: "rectangle.portrait").tag("9:16").help("Portrait")
                    Image(systemName: "square").tag("1:1").help("Square")
                }.pickerStyle(.segmented).labelsHidden().fixedSize()
                Text(["16:9": "Landscape", "9:16": "Portrait", "1:1": "Square"][draft.aspect] ?? "").font(.system(size: 11)).foregroundStyle(.tertiary)
            }
            VStack(alignment: .leading, spacing: 6) {
                label("Motion graphics")
                Picker("Motion graphics", selection: $draft.motionLevel) {
                    Text("Maximal").tag("maximal"); Text("Balanced").tag("balanced"); Text("Minimal").tag("minimal")
                }.pickerStyle(.segmented).labelsHidden().fixedSize()
            }
            VStack(alignment: .leading, spacing: 6) {
                label("Brand")
                Picker("Brand", selection: Binding(get: { draft.brand ?? "" }, set: { v in
                    if v == "__new" { store.openBrands() } else { draft.brand = v.isEmpty ? nil : v } })) {
                    Text("None").tag("")
                    ForEach(brands) { Text($0.name).tag($0.name) }
                    Divider()
                    Text("New brand…").tag("__new")
                }.pickerStyle(.menu).labelsHidden().fixedSize()
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: Footer

    private var footer: some View {
        VStack(spacing: 8) {
            if loaded && !editorState.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle")
                    Text("Draft saved automatically · files are copied when you save, start or queue")
                }.font(.system(size: 11)).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                if loaded && !editorState.isEmpty {
                    Button("Discard changes…", role: .destructive) { showDiscard = true }.disabled(working)
                }
                Spacer()
                if working { ProgressView().controlSize(.small) }
                Button("Save draft") { save(start: false) }.disabled(working || (project == nil && trimmedBrief.isEmpty && name.isEmpty))
                if directorReady {
                    Button("Add to queue") { store.ensureConsent(for: agent) { save(start: false, queue: true) } }
                        .disabled(working || trimmedBrief.isEmpty)
                    Button("Start film") { start() }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                        .keyboardShortcut(.return, modifiers: .command)
                        .disabled(working || trimmedBrief.isEmpty || store.toolSetup.isRunning || store.runtime.isRunning || store.runtime.isPreparing)
                } else if store.settings.checking.contains(agent.id) {
                    ProgressView().controlSize(.small)
                    Text("Checking director…").font(.system(size: 12)).foregroundStyle(.secondary)
                } else {
                    Button("Set up a director…") { store.settings.showWelcome = true }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                }
            }
            HStack(spacing: 4) {
                Spacer()
                Text(directorReady ? "Directed by \(agent.title) on your Mac ·" : "Set up and sign in to your director before starting.")
                Button("Change") { openSettings() }.buttonStyle(.link)
            }.font(.system(size: 11)).foregroundStyle(.secondary)
            if store.runtime.isRunning || store.runtime.isPreparing {
                Text("A film is running. Add this film to the queue to start automatically when it finishes.")
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
        if draft != FilmDraft(agent: draft.agent) { replacementDraft = next } else { applyTemplate(next) }
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
        store.ensureConsent(for: agent) { save(start: true) }
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
