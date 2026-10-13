import Foundation
import Observation
import StudioCore

/// What the Get inspired gallery shows and how it is filtered: the catalog (saved copy first, then a fresh fetch), the technique,
/// tag and New filters, and which card is playing its clip. Picks live with whoever opened the gallery.
@MainActor @Observable
final class MomentGallery {
    enum State: Equatable { case idle, loading, ready, failed }

    var moments: [Moment] = []
    var state: State = .idle
    /// True while the list on screen is the saved copy because the network was unreachable.
    var showingSavedCopy = false
    var technique: Technique?
    var mechanic: String?
    var onlyNew = false
    /// The one card that is playing its clip right now.
    private(set) var playingID: String?

    private let autoload: Bool
    private let loader: @Sendable () async throws -> MomentCatalog.Loaded
    private var refreshed = false
    private var hoverTask: Task<Void, Never>?

    init(autoload: Bool = true, loader: @escaping @Sendable () async throws -> MomentCatalog.Loaded = { try await MomentCatalog.load() }) {
        self.autoload = autoload; self.loader = loader
    }

    func moment(_ id: String) -> Moment? { moments.first { $0.id == id } }

    /// Shows the saved copy at once if there is one (no network), so credits and chips resolve instantly.
    func prime() {
        guard autoload, moments.isEmpty else { return }
        let cached = MomentCatalog.loadCached()
        if !cached.isEmpty { moments = cached; state = .ready; showingSavedCopy = true }
    }

    /// Saved copy first, then one fresh fetch per session. A failed fetch keeps whatever is on screen.
    func loadIfNeeded() async {
        guard autoload, state != .loading, !refreshed || moments.isEmpty else { return }
        prime()
        await reload()
    }
    func reload() async {
        guard autoload, state != .loading else { return }
        let hadMoments = !moments.isEmpty
        if !hadMoments { state = .loading }
        do {
            let loaded = try await loader()
            moments = loaded.moments
            showingSavedCopy = loaded.source == .cache
            state = .ready
            refreshed = true
        } catch {
            state = hadMoments ? .ready : .failed
            if hadMoments { showingSavedCopy = true }
        }
    }

    // MARK: Filters

    var filtered: [Moment] {
        moments.filter { moment in
            (technique == nil || moment.techniques.contains(technique!)) && (mechanic == nil || moment.mechanic.contains(mechanic!)) && (!onlyNew || moment.isNew)
        }
    }
    var hasFilters: Bool { technique != nil || mechanic != nil || onlyNew }
    func clearFilters() { technique = nil; mechanic = nil; onlyNew = false }
    var newCount: Int { moments.filter(\.isNew).count }
    func count(for technique: Technique?) -> Int { moments.filter { technique == nil || $0.techniques.contains(technique!) }.count }
    /// The technique groups that have at least one move, in a fixed order.
    var techniques: [Technique] { Technique.allCases.filter { count(for: $0) > 0 } }
    /// Mechanic tags in the current technique group, most used first.
    var mechanics: [String] {
        var counts: [String: Int] = [:]
        for moment in moments where technique == nil || moment.techniques.contains(technique!) { for tag in moment.mechanic { counts[tag, default: 0] += 1 } }
        return counts.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.map(\.key)
    }
    /// A calm preview for Home: the newest moves, one per technique group first so the row is varied.
    var spotlight: [Moment] {
        var seen = Set<Technique>(), out: [Moment] = []
        for m in moments { if let t = m.techniques.first, seen.insert(t).inserted { out.append(m) }; if out.count == 4 { break } }
        return out
    }

    // MARK: Expanded viewer

    /// The move open in the large viewer, if any. Neighbours follow the grid as filtered.
    var viewingID: String?
    var viewing: Moment? { viewingID.flatMap(moment) }
    func openViewer(_ id: String) { stopPlaying(); viewingID = id }
    func closeViewer() { viewingID = nil }
    func step(_ delta: Int) {
        let list = filtered
        guard !list.isEmpty else { return }
        let index = list.firstIndex { $0.id == viewingID } ?? (delta > 0 ? -1 : 0)
        viewingID = list[((index + delta) % list.count + list.count) % list.count].id
    }

    // MARK: Hover playback

    /// A short pause before playing, so sweeping the pointer across the grid does not start a clip on every card.
    func hoverBegan(_ id: String) {
        hoverTask?.cancel()
        hoverTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(260))
            guard !Task.isCancelled else { return }
            self?.playingID = id
        }
    }
    func hoverEnded(_ id: String) {
        hoverTask?.cancel()
        if playingID == id { playingID = nil }
    }
    func stopPlaying() { hoverTask?.cancel(); playingID = nil }
}
