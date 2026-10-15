import AppKit
import StudioCore
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Series list

/// Series: saved setups with memory, one folder each (`<library>/Series/<slug>`), next to Brands.
struct SeriesListView: View {
    @Bindable var store: StudioStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let columns = [GridItem(.adaptive(minimum: 240, maximum: 320), spacing: 18)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle(text: "Series")
                if store.seriesList.isEmpty { empty } else { grid }
            }
            .pageColumn()
        }
        .background(Color.appBackground)
        .navigationTitle("Series")
        .pageHeader("Series") {
            Button { store.newSeries() } label: { Label("New series", systemImage: "plus") }.help("Start a series")
        }
        .onAppear { store.reloadSeries() }
    }

    private var empty: some View {
        VStack(spacing: 14) {
            Image(systemName: SeriesSymbol.series).font(.system(size: 40, weight: .light)).foregroundStyle(.tint)
            Text("A series remembers how your films are made: the answers, the brand, the end card and the look. The next episode asks less.")
                .font(.system(size: 15)).multilineTextAlignment(.center).frame(maxWidth: 420)
            Button("Start a series") { store.newSeries() }.buttonStyle(.rasanPrimary).controlSize(.large).padding(.top, 4)
        }.frame(maxWidth: .infinity, minHeight: 320)
    }

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 18) {
            ForEach(store.seriesList) { series in
                SeriesCard(series: series) { store.openSeries(series.folder) }
            }
        }
    }
}

enum SeriesSymbol { static let series = "rectangle.stack" }

private struct SeriesCard: View {
    let series: Series
    let open: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hover = false
    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: SeriesSymbol.series).font(.system(size: 26, weight: .light)).foregroundStyle(Color.rasan)
                VStack(alignment: .leading, spacing: 3) {
                    Text(series.name).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                    Text(series.summaryLine).font(.system(size: 12)).foregroundStyle(.secondary)
                    Text(series.look != nil ? "Look locked" : "Look not locked yet").font(.system(size: 11)).foregroundStyle(.tertiary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading).padding(16)
            .workspacePanel()
            .overlay { RoundedRectangle(cornerRadius: Workspace.radius, style: .continuous).strokeBorder(Color.primary.opacity(0.22), lineWidth: 1).opacity(hover ? 1 : 0) }
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
        .animation(reduceMotion ? nil : .snappy(duration: 0.18), value: hover)
        .contextMenu { Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([series.folder]) } }
    }
}

// MARK: - Series page

/// One series: its answers (the same tiles as the setup), its rules, the end card, the look and its episodes.
struct SeriesPage: View {
    @Bindable var store: StudioStore
    let folder: URL
    @State private var series: Series?
    @State private var newRule = ""
    @State private var confirmDelete = false
    @State private var problem: String?

    private var questions: TasteQuestions? { TasteQuestions.installed }
    private var catalog: FormatCatalog? { FormatCatalog.installed }

    var body: some View {
        Group {
            if let series { content(series) } else { Text("This series is no longer in your library.").foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.appBackground)
        .navigationTitle(series?.name ?? "Series")
        .onAppear(perform: reload)
        .pageHeader(series?.name ?? "Series") {
            if let series {
                Button { store.newFilm(inSeries: series.folder) } label: { Label("New episode", systemImage: "plus") }.help("Make a film in this series")
            }
            Menu {
                Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([folder]) }
                Divider()
                Button("Delete Series…", role: .destructive) { confirmDelete = true }
            } label: { Label("More", systemImage: "ellipsis") }
                .menuIndicator(.hidden).help("More").tint(.primary)
        }
        .confirmationDialog("Move \(series?.name ?? "this series") to the Trash?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Move to Trash", role: .destructive) {
                do { try FileManager.default.trashItem(at: folder, resultingItemURL: nil); store.reloadSeries(); store.path = [.series] }
                catch { problem = error.localizedDescription }
            }
        } message: { Text("Films made in it are kept.") }
        .alert("Couldn’t save the series", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK") { problem = nil }
        } message: { Text(problem ?? "") }
    }

    private func reload() { series = SeriesLibrary.load(folder) }
    private func update(_ change: (inout Series) -> Void) {
        guard var next = series else { return }
        change(&next)
        do { series = try SeriesLibrary.save(next); store.reloadSeries() } catch { problem = error.localizedDescription }
    }
    private func attempt(_ work: (Series) throws -> Series) {
        guard let current = series else { return }
        do { series = try work(current); store.reloadSeries() } catch { problem = error.localizedDescription }
    }

    private func content(_ series: Series) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(series.name).font(.system(size: 26, weight: .bold)).tracking(-0.4)
                    Text(facts(series)).font(.system(size: 13)).foregroundStyle(.secondary)
                }
                answersSection(series)
                rulesSection(series)
                endCardSection(series)
                lookSection(series)
                episodesSection(series)
            }
            .pageColumn()
        }
    }

    private func facts(_ series: Series) -> String {
        var parts: [String] = []
        if let title = catalog?.option(series.option)?.title { parts.append(title) }
        parts.append({ if case .seconds(let seconds) = series.length { return "\(seconds) seconds" } else { return "Length from the clip" } }())
        parts.append(series.aspect)
        if let brand = series.brand { parts.append(brand) }
        return parts.joined(separator: " · ")
    }

    // MARK: Answers

    private func asked(_ series: Series) -> [TasteQuestions.Question] {
        guard let questions else { return [] }
        if let option = catalog?.option(series.option) { return questions.questions(for: option).filter { $0.askIf == nil || series.preferences[$0.id] != nil || !series.marks.isEmpty } }
        return questions.questions.filter { $0.askIf == nil || series.preferences[$0.id] != nil }
    }

    private func answersSection(_ series: Series) -> some View {
        let list = asked(series)
        return VStack(alignment: .leading, spacing: 16) {
            sectionTitle("How it's made", "Every episode starts from these. Click the chosen one again to leave it to RasanAI.")
            if list.isEmpty { Text("This series has no questions to answer.").font(.system(size: 13)).foregroundStyle(.secondary) }
            ForEach(list) { question in
                VStack(alignment: .leading, spacing: 10) {
                    Text(question.question).font(.system(size: 14, weight: .semibold))
                    AnswerGrid {
                        ForEach(question.choices) { choice in
                            AnswerTile(symbol: TasteThumb.symbol(choice.thumb), title: choice.label, detail: choice.description,
                                       selected: series.preferences[question.id] == choice.id) { choose(choice, for: question) }
                        }
                    }
                }
            }
        }
    }

    private func choose(_ choice: TasteQuestions.Choice, for question: TasteQuestions.Question) {
        update { series in
            if series.preferences[question.id] == choice.id { series.preferences[question.id] = nil } else { series.preferences[question.id] = choice.id }
        }
    }

    // MARK: Rules

    private func rulesSection(_ series: Series) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Rules", "Notes you saved to this series. The director follows them in every episode.")
            if series.rules.isEmpty { Text("None yet. When you give a note on a film in this series, you can save it here.").font(.system(size: 13)).foregroundStyle(.secondary) }
            if !series.rules.isEmpty { VStack(spacing: 0) {
                ForEach(Array(series.rules.enumerated()), id: \.element.id) { index, rule in
                    if index > 0 { Divider() }
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(rule.text).font(.system(size: 13.5))
                            if !rule.fromFilm.isEmpty { Text("From \(rule.fromFilm)").font(.system(size: 11.5)).foregroundStyle(.secondary) }
                        }
                        Spacer(minLength: 8)
                        Button { attempt { try SeriesLibrary.removeRule(rule.id, from: $0) } } label: { Image(systemName: "trash") }
                            .buttonStyle(.borderless).help("Delete this rule").accessibilityLabel("Delete rule \(rule.text)")
                    }.padding(.horizontal, 14).padding(.vertical, 10)
                }
            }
            .workspacePanel() }
            HStack(spacing: 8) {
                TextField("Add a rule, e.g. “No captions”", text: $newRule).textFieldStyle(.roundedBorder).frame(maxWidth: 420)
                    .onSubmit(addRule)
                Button("Add", action: addRule).disabled(newRule.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }
    private func addRule() {
        let text = newRule
        attempt { try SeriesLibrary.addRule(text, fromFilm: "Added by hand", to: $0) }
        newRule = ""
    }

    // MARK: End card, look

    private func endCardSection(_ series: Series) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("End card", "A picture or clip added after the last word, when “How should it end?” is set to your end card.")
            if let url = series.endingURL, FileManager.default.fileExists(atPath: url.path) {
                FlowFileChip(url: url) { attempt { try SeriesLibrary.setEnding($0, from: nil) } }.frame(maxWidth: 520)
            }
            HStack(spacing: 8) {
                Button(series.endingFile == nil ? "Choose end card…" : "Replace…") { chooseEnding() }
                if series.endingFile != nil { Button("Show in Finder") { if let url = series.endingURL { NSWorkspace.shared.activateFileViewerSelecting([url]) } } }
            }
        }
    }
    private func chooseEnding() {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.image, .movie]
        panel.title = "Choose the end card"; panel.prompt = "Use as end card"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        attempt { current in
            var next = try SeriesLibrary.setEnding(current, from: url)
            if next.preferences["ending"] == nil { next.preferences["ending"] = "card"; next = try SeriesLibrary.save(next) }
            return next
        }
    }

    private func lookSection(_ series: Series) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Look", "The design every episode is made in, so the director skips the look call.")
            if let look = series.lookFile {
                HStack(spacing: 10) {
                    Label("Locked", systemImage: "lock.fill").font(.system(size: 13, weight: .medium))
                    Button("Open DESIGN.md") { NSWorkspace.shared.open(look) }.buttonStyle(.link)
                    Button("Unlock", role: .destructive) { update { $0.look = nil } }.buttonStyle(.link)
                }
            } else {
                Text("Not locked yet. When a film in this series is approved, choose “Make this the \(series.name) look” on its page.")
                    .font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if let reference = series.referenceURL {
                Label("Learned from \(reference.lastPathComponent)", systemImage: "film").font(.system(size: 12.5)).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Episodes

    private func episodesSection(_ series: Series) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Episodes", series.episodes.isEmpty ? nil : "\(series.episodes.count) so far")
            if series.episodes.isEmpty { Text("No films yet. Make the first one with New episode.").font(.system(size: 13)).foregroundStyle(.secondary) }
            if !series.episodes.isEmpty { VStack(spacing: 0) {
                ForEach(Array(series.episodes.enumerated()), id: \.offset) { index, episode in
                    if index > 0 { Divider() }
                    let url = URL(fileURLWithPath: episode)
                    let known = store.localProjects.first { $0.1.standardizedFileURL == url.standardizedFileURL }
                    Button { if known != nil { store.path = [.film(url)] } } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "film").foregroundStyle(.secondary)
                            Text(known?.0.name ?? url.lastPathComponent).font(.system(size: 13.5)).lineLimit(1)
                            Spacer(minLength: 8)
                            if known == nil { Text("Not in the library").font(.system(size: 11.5)).foregroundStyle(.tertiary) }
                            else { Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(.tertiary) }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10).contentShape(Rectangle())
                    }.buttonStyle(.plain).disabled(known == nil)
                }
            }
            .workspacePanel() }
        }
    }

    private func sectionTitle(_ title: String, _ detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.system(size: 20, weight: .bold)).tracking(-0.3).accessibilityAddTraits(.isHeader)
            if let detail { Text(detail).font(.system(size: 12.5)).foregroundStyle(.secondary) }
        }
    }
}

// MARK: - Make this the look

/// On a finished film of a series: "Make this the Quotidian look" copies the film's DESIGN.md into the series, so every
/// next episode is made in it.
struct SeriesLookButton: View {
    @Bindable var store: StudioStore
    let project: URL?
    @State private var series: Series?
    @State private var isLook = false
    @State private var failed: String?

    private var design: URL? { project?.appendingPathComponent("DESIGN.md") }

    var body: some View {
        Group {
            if let series, let design, FileManager.default.fileExists(atPath: design.path) {
                if isLook {
                    Label("This is the \(series.name) look", systemImage: "lock.fill").font(.system(size: 12.5)).foregroundStyle(.secondary)
                } else {
                    Button { lock(series, from: design) } label: { Label("Make this the \(series.name) look", systemImage: "lock") }
                        .help("Every next episode of \(series.name) is made in this film's design")
                }
                if let failed { Text(failed).font(.system(size: 11.5)).foregroundStyle(Color(nsColor: .systemOrange)) }
            }
        }
        .task(id: project) { await load() }
    }

    private func load() async {
        guard let project else { series = nil; return }
        let found = await Task.detached { () -> (Series?, Bool) in
            guard let ref = FilmDraft.load(in: project)?.series, let series = SeriesLibrary.load(URL(fileURLWithPath: ref.path, isDirectory: true)) else { return (nil, false) }
            let locked = series.lookFile.map { FileManager.default.contentsEqual(atPath: $0.path, andPath: project.appendingPathComponent("DESIGN.md").path) } ?? false
            return (series, locked)
        }.value
        series = found.0; isLook = found.1
    }

    private func lock(_ series: Series, from design: URL) {
        do {
            self.series = try SeriesLibrary.setLook(series, from: design)
            isLook = true; failed = nil
            store.reloadSeries()
        } catch { failed = "The look could not be saved. \(error.localizedDescription)" }
    }
}

extension StudioStore {
    /// "New series": the setup, already on "Start a series".
    func newSeries() {
        newFilmStartsSeries = true
        newFilm()
    }
    /// "New episode": the setup with this series picked, so it asks for the material, the brief if empty, and Review.
    func newFilm(inSeries folder: URL) {
        newFilmSeries = folder
        newFilm()
    }
}
