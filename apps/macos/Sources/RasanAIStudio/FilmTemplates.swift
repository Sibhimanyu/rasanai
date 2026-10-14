import StudioCore
import SwiftUI

struct FilmTemplate: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    var draft: FilmDraft
}

extension StudioStore {
    func useTemplate(_ template: FilmTemplate) {
        // Open a fresh editor, keeping a recovered draft intact until the user decides to replace it.
        templatePrefill = template.draft
        newFilm()
    }
    func saveTemplate(name: String, draft: FilmDraft) {
        let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        var saved = draft
        saved.linked = [] // a template is a style, not a pointer at this film's folders
        settings.filmTemplates.append(FilmTemplate(name: title, draft: saved))
    }
}

struct FilmTemplatesView: View {
    @Bindable var store: StudioStore
    @State private var renameID: UUID?
    @State private var name = ""
    @State private var deleteID: UUID?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(text: "Templates")
                if store.settings.filmTemplates.isEmpty {
                    ContentUnavailableView("No templates yet", systemImage: "doc.on.doc", description: Text("Write a reusable brief in New film, then choose Save as template."))
                        .frame(maxWidth: .infinity, minHeight: 320)
                }
                ForEach(store.settings.filmTemplates) { template in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(template.name).font(.headline)
                            Spacer()
                            Button("Use template") { store.useTemplate(template) }.buttonStyle(.rasanSecondary)
                            Menu {
                                Button("Rename…") { renameID = template.id; name = template.name }
                                Button("Delete…", role: .destructive) { deleteID = template.id }
                            } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).frame(width: 24)
                                .help("More").accessibilityLabel("More for \(template.name)")
                        }
                        Text(template.draft.brief).lineLimit(3).font(.system(size: 13)).foregroundStyle(.secondary)
                        Text("\(filmFacts(duration: template.draft.duration, aspect: template.draft.aspect)) · \(MotionLevel.title(template.draft.motionLevel))\(template.draft.brand.map { " · " + $0 } ?? "")")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                    }.workspacePanel(padding: 14)
                }
            }.pageColumn()
        }.navigationTitle("Templates")
            .pageHeader("Templates")
            .alert("Rename template", isPresented: Binding(get: { renameID != nil }, set: { if !$0 { renameID = nil } })) {
                TextField("Template name", text: $name)
                Button("Cancel", role: .cancel) { renameID = nil }
                Button("Save") {
                    if let index = store.settings.filmTemplates.firstIndex(where: { $0.id == renameID }), !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        store.settings.filmTemplates[index].name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    }
                    renameID = nil
                }
            }
            .confirmationDialog("Delete this template?", isPresented: Binding(get: { deleteID != nil }, set: { if !$0 { deleteID = nil } }), titleVisibility: .visible) {
                Button("Delete", role: .destructive) { store.settings.filmTemplates.removeAll { $0.id == deleteID }; deleteID = nil }
            } message: { Text("Films created from this template are kept.") }
    }
}
