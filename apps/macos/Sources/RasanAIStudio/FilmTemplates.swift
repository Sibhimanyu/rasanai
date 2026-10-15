import StudioCore
import SwiftUI

/// What the "Use template" menu used to save. Templates are now series (see `SeriesLibrary.migrate`); this type is only
/// kept to read the old data once, on first launch.
struct FilmTemplate: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    var draft: FilmDraft
}

extension StudioStore {
    private static let templatesMigratedKey = "seriesMigratedFromTemplates"

    /// The first launch with series: each saved film template becomes a series with no episodes. The old data stays in
    /// UserDefaults (nothing is deleted) and a flag keeps this from running again.
    func migrateTemplatesIfNeeded() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: Self.templatesMigratedKey) else { return }
        defaults.set(true, forKey: Self.templatesMigratedKey)
        let templates = settings.filmTemplates.map { (name: $0.name, draft: $0.draft) }
        guard !templates.isEmpty else { return }
        SeriesLibrary.migrate(templates: templates, in: libraryRoot)
        reloadSeries()
    }
}
