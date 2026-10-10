import Foundation
import Observation
import StudioCore

/// What the Get inspired gallery shows and how it is filtered: the catalog (saved copy first, then a fresh fetch), the role,
/// mechanic and New filters, and which card is playing its clip. Picks live with whoever opened the gallery.
@MainActor @Observable
final class MomentGallery {
    enum State: Equatable { case idle, loading, ready, failed }

    var moments: [Moment] = []
    var state: State = .idle
    /// True while the list on screen is the saved copy because the network was unreachable.
    var showingSavedCopy = false
    var role: MomentRole?
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
            (role == nil || moment.role == role) && (mechanic == nil || moment.mechanic.contains(mechanic!)) && (!onlyNew || moment.isNew)
        }
    }
    var hasFilters: Bool { role != nil || mechanic != nil || onlyNew }
    func clearFilters() { role = nil; mechanic = nil; onlyNew = false }
    var newCount: Int { moments.filter(\.isNew).count }
    func count(for role: MomentRole?) -> Int { moments.filter { role == nil || $0.role == role }.count }
    /// Mechanic tags in the current role, most used first.
    var mechanics: [String] {
        var counts: [String: Int] = [:]
        for moment in moments where role == nil || moment.role == role { for tag in moment.mechanic { counts[tag, default: 0] += 1 } }
        return counts.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.map(\.key)
    }
    /// One moment per role, newest first: a calm way to preview the gallery on Home.
    var spotlight: [Moment] { MomentRole.allCases.compactMap { role in moments.first { $0.role == role } } }

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
