import AppKit
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
    private(set) var isRefreshing = false
    var technique: Technique?
    var mechanic: String?
    var onlyNew = false
    var searchQuery = ""
    /// The one card that is playing its clip right now.
    private(set) var playingID: String?

    private let autoload: Bool
    private let loader: @Sendable () async throws -> MomentCatalog.Loaded
    private let cachedLoader: @Sendable () -> [Moment]
    @ObservationIgnored private var cacheTask: Task<[Moment], Never>?
    private var refreshed = false
    @ObservationIgnored private var hoverTask: Task<Void, Never>?
    @ObservationIgnored private var scrollTask: Task<Void, Never>?
    @ObservationIgnored private var hoveredID: String?
    @ObservationIgnored private var lastScroll = ContinuousClock.now
    @ObservationIgnored private var scrolling = false
    private let hoverDelay: Duration
    private let scrollIdle: Duration
    private let allowsHoverMotion: @MainActor () -> Bool

    init(autoload: Bool = true, loader: @escaping @Sendable () async throws -> MomentCatalog.Loaded = { try await MomentCatalog.load() },
         cachedLoader: @escaping @Sendable () -> [Moment] = { MomentCatalog.loadCached() },
         hoverDelay: Duration = .milliseconds(260), scrollIdle: Duration = .milliseconds(220),
         allowsHoverMotion: @escaping @MainActor () -> Bool = { !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }) {
        self.autoload = autoload; self.loader = loader; self.cachedLoader = cachedLoader
        self.hoverDelay = hoverDelay; self.scrollIdle = scrollIdle; self.allowsHoverMotion = allowsHoverMotion
    }

    func moment(_ id: String) -> Moment? { moments.first { $0.id == id } }

    /// Read and parse the saved copy off the UI thread. Callers can request priming without blocking navigation.
    func prime() {
        guard autoload, moments.isEmpty, cacheTask == nil else { return }
        let load = cachedLoader
        let task = Task.detached(priority: .userInitiated) { load() }
        cacheTask = task
        Task { [weak self] in
            let cached = await task.value
            self?.publishCached(cached)
        }
    }

    private func publishCached(_ cached: [Moment]) {
        guard moments.isEmpty, !cached.isEmpty else { return }
        moments = cached; state = .ready; showingSavedCopy = true
    }

    /// Saved copy first, then one fresh fetch per session. A failed fetch keeps whatever is on screen.
    func loadIfNeeded() async {
        guard autoload, !isRefreshing, !refreshed || moments.isEmpty else { return }
        prime()
        if let cacheTask { publishCached(await cacheTask.value) }
        guard !Task.isCancelled, !isRefreshing, !refreshed || moments.isEmpty else { return }
        await reload()
    }
    func reload() async {
        guard autoload, !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        let hadMoments = !moments.isEmpty
        if !hadMoments { state = .loading }
        let load = loader
        let worker = Task.detached(priority: .userInitiated) { try await load() }
        do {
            let loaded = try await withTaskCancellationHandler { try await worker.value } onCancel: { worker.cancel() }
            guard !Task.isCancelled else { state = moments.isEmpty ? .idle : .ready; return }
            moments = loaded.moments
            showingSavedCopy = loaded.source == .cache
            state = .ready
            refreshed = true
        } catch {
            state = moments.isEmpty ? (Task.isCancelled ? .idle : .failed) : .ready
            if !moments.isEmpty { showingSavedCopy = true }
        }
    }

    // MARK: Filters

    var filtered: [Moment] {
        let terms = searchQuery.split(whereSeparator: \.isWhitespace).map(String.init)
        return moments.filter { moment in
            (technique == nil || moment.techniques.contains(technique!)) && (mechanic == nil || moment.mechanic.contains(mechanic!)) && (!onlyNew || moment.isNew)
                && terms.allSatisfy { moment.searchText.localizedStandardContains($0) }
        }
    }
    var hasFilters: Bool { technique != nil || mechanic != nil || onlyNew || !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    func clearFilters() { technique = nil; mechanic = nil; onlyNew = false; searchQuery = "" }
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
    /// ONE player for the whole app: every viewer on screen shows this same player, so a clip can never play twice
    /// (two players a few frames apart sound like an echo, and pausing one leaves the other playing).
    @ObservationIgnored let viewerPlayer = MomentViewerPlayer()
    func openViewer(_ id: String) { stopPlaying(); viewingID = id; viewerPlayer.load(viewing?.clipURL) }
    func closeViewer() { viewerPlayer.stop(); viewingID = nil }
    func step(_ delta: Int) {
        let list = filtered
        guard !list.isEmpty else { return }
        let index = list.firstIndex { $0.id == viewingID } ?? (delta > 0 ? -1 : 0)
        viewingID = list[((index + delta) % list.count + list.count) % list.count].id
        viewerPlayer.load(viewing?.clipURL)
    }

    // MARK: Hover playback

    /// Scrolling never creates video players. Remember the hovered card and wait for the gesture,
    /// including momentum, to settle before starting its usual hover dwell.
    func noteScrollActivity() {
        lastScroll = .now
        guard !scrolling else { return }
        scrolling = true
        stopPlaying()
        scrollTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .milliseconds(80)) } catch { return }
                guard let self else { return }
                if self.lastScroll.duration(to: .now) >= self.scrollIdle {
                    self.scrolling = false
                    self.scrollTask = nil
                    self.scheduleHover()
                    return
                }
            }
        }
    }

    func hoverBegan(_ id: String) {
        hoveredID = id
        scheduleHover()
    }

    private func scheduleHover() {
        hoverTask?.cancel()
        guard let id = hoveredID, !scrolling, viewingID == nil, allowsHoverMotion() else { return }
        let delay = hoverDelay
        hoverTask = Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            guard let self, !Task.isCancelled, !self.scrolling, self.hoveredID == id,
                  self.viewingID == nil, self.allowsHoverMotion() else { return }
            self.playingID = id
        }
    }

    func hoverEnded(_ id: String) {
        // A delayed exit from an old cell must not cancel the new cell's dwell.
        if hoveredID == id { hoveredID = nil; hoverTask?.cancel() }
        if playingID == id { playingID = nil }
    }
    func stopPlaying() { hoverTask?.cancel(); playingID = nil }
    func endInteraction() {
        stopPlaying()
        hoveredID = nil
        scrollTask?.cancel(); scrollTask = nil; scrolling = false
    }
}
