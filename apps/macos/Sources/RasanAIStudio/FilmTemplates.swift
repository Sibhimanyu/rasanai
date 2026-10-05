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
        settings.filmTemplates.append(FilmTemplate(name: title, draft: draft))
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
                Text("Film templates").font(.system(size: 28, weight: .semibold))
                Text("Reuse a brief, brand, length, shape and motion level. Save a template from the film editor. Each new film gets its own source files.")
                    .font(.system(size: 13)).foregroundStyle(.secondary)
                if store.settings.filmTemplates.isEmpty {
                    ContentUnavailableView("No templates yet", systemImage: "doc.on.doc", description: Text("Write a reusable brief in New film, then choose Save as template."))
                }
                ForEach(store.settings.filmTemplates) { template in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(template.name).font(.headline)
                            Spacer()
                            Button("Use template") { store.useTemplate(template) }.buttonStyle(.borderedProminent)
                            Menu {
                                Button("Rename…") { renameID = template.id; name = template.name }
                                Button("Delete…", role: .destructive) { deleteID = template.id }
                            } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).frame(width: 24)
                        }
                        Text(template.draft.brief).lineLimit(3).font(.system(size: 13)).foregroundStyle(.secondary)
                        Text("\(template.draft.duration) seconds · \(template.draft.aspect) · \(template.draft.motionLevel.capitalized)\(template.draft.brand.map { " · " + $0 } ?? "")")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                    }.padding(18).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
                }
            }.padding(32).frame(maxWidth: 850).frame(maxWidth: .infinity)
        }.navigationTitle("Templates")
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
