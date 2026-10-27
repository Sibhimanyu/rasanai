import Combine
import Sparkle
import SwiftUI

/// One line of "what's new": a short bold lead-in and the rest of the sentence.
struct UpdateNote: Identifiable, Equatable, Codable {
    var lead: String
    var body: String
    var id: String { lead + "|" + body }
}

/// What the update window knows about the version on offer.
struct UpdateInfo: Equatable {
    var version: String
    var size: UInt64
    var notes: [UpdateNote]
}

/// Where the update is, from the person's point of view. The window draws one screen per case.
enum UpdateState: Equatable {
    case idle
    case checking
    case upToDate
    case available(UpdateInfo)
    case downloading(UpdateInfo, received: UInt64, total: UInt64)
    case extracting(UpdateInfo, progress: Double)
    case ready(UpdateInfo)
    case installing
    case error(message: String, detail: String)

    var isBusy: Bool { self != .idle }
}

/// The notes saved when an update is chosen, shown once after the app has restarted on the new version.
struct PendingWhatsNew: Codable, Equatable {
    var version: String
    var notes: [UpdateNote]
}

@MainActor
final class StudioUpdater: ObservableObject {
    static let shared = StudioUpdater()
    /// Updates are checked every hour.
    static let checkInterval: TimeInterval = 18_000
    @Published var canCheck = false
    @Published var automaticChecks = false
    @Published var configurationError: String?
    @Published var lastChecked: Date?
    @Published private(set) var state: UpdateState = .idle { didSet { refreshCanCheck() } }
    /// Counts up each time something wants the update window opened; the main window listens.
    @Published private(set) var presentRequest = 0
    @Published private(set) var isSheetOpen = false
    /// Counts up when the update sheet must close (so no modal blocks the app from quitting); the main window listens.
    @Published private(set) var dismissRequest = 0
    private var quitSequenceID = 0
    private var quitSequenceRunning = false
    /// Set once on the first launch after an update, so the main window can show "here's what changed".
    @Published var whatsNew: PendingWhatsNew?
    /// While installing: nothing wrong yet, the app is slow to close, or nothing has happened for too long.
    enum InstallStall: Equatable { case none, waitingToClose(reason: String), timedOut }
    @Published fileprivate(set) var installStall: InstallStall = .none
    /// When "Restart now" was pressed, so the window can show a ticking elapsed time.
    @Published fileprivate(set) var installStartedAt: Date?
    /// Smoothed download speed in bytes per second (0 until known).
    @Published fileprivate(set) var downloadRate: Double = 0
    /// Set when a film (or other work) would be stopped by restarting; the window asks before going on.
    @Published fileprivate(set) var restartBlocker: String?
    private var stallTasks: [Task<Void, Never>] = []
    fileprivate var retryTerminating: (() -> Void)?
    static let releasesURL = URL(string: "https://github.com/Sibhimanyu/rasanai/releases")!
    private var observation: AnyCancellable?
    private var updater: SPUUpdater?
    private var systemCanCheck = false
    private let updaterDelegate = UpdaterDelegate()
    private var driver: StudioUpdateDriver?
    // Sparkle hands us these; each one is called once, when the person decides.
    fileprivate var cancelCheck: (() -> Void)?
    fileprivate var chooseUpdate: ((SPUUserUpdateChoice) -> Void)?
    fileprivate var acknowledge: (() -> Void)?
    fileprivate var cancelDownload: (() -> Void)?
    fileprivate var retryAfterDismiss = false
    var isConfigured: Bool { updater != nil && configurationError == nil }
    var lastCheckedText: String {
        guard let lastChecked else { return "Never" }
        return lastChecked.formatted(.relative(presentation: .named))
    }
    static var currentVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }
    /// An update has been found (or is on its way) and the window is not open.
    var hasUpdateWaiting: Bool {
        switch state {
        case .available, .downloading, .extracting, .ready: !isSheetOpen
        default: false
        }
    }
    var waitingVersion: String? {
        switch state {
        case .available(let i), .downloading(let i, _, _), .extracting(let i, _), .ready(let i): i.version
        default: nil
        }
    }

    private init() {
        recordVersionChange()
        // Source/candidate builds keep checks off; release packaging explicitly opts in.
        guard Bundle.main.object(forInfoDictionaryKey: "RasanAIUpdatesEnabled") as? Bool == true,
              let key = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String,
              Data(base64Encoded: key)?.count == 32 else {
            configurationError = "Updates are disabled in this local build. A release must include its verified update-signing public key."
            return
        }
        let driver = StudioUpdateDriver(owner: self)
        let updater = SPUUpdater(hostBundle: .main, applicationBundle: .main, userDriver: driver, delegate: updaterDelegate)
        do { try updater.start() }
        catch { configurationError = error.localizedDescription; return }
        self.driver = driver
        self.updater = updater
        // On by default; only an explicit opt-out in Settings turns it off. Sparkle's own stored
        // value from older builds is false, so we override it here.
        let optedOut = UserDefaults.standard.bool(forKey: "updatesOptOut")
        updater.automaticallyChecksForUpdates = !optedOut
        updater.updateCheckInterval = Self.checkInterval
        automaticChecks = !optedOut
        lastChecked = updater.lastUpdateCheckDate
        observation = updater.publisher(for: \.canCheckForUpdates).sink { [weak self] value in
            Task { @MainActor in
                self?.systemCanCheck = value
                self?.refreshCanCheck()
                self?.lastChecked = self?.updater?.lastUpdateCheckDate
            }
        }
        if !optedOut { updater.checkForUpdatesInBackground() }
    }

    /// First launch on a new version: if the update we installed left its notes behind, show them once.
    private func recordVersionChange() {
        let defaults = UserDefaults.standard
        let current = Self.currentVersion
        let lastSeen = defaults.string(forKey: "lastSeenStudioVersion")
        if lastSeen != current {
            defaults.set(current, forKey: "lastSeenStudioVersion")
            if lastSeen != nil, let data = defaults.data(forKey: "pendingWhatsNew"),
               let pending = try? JSONDecoder().decode(PendingWhatsNew.self, from: data), pending.version == current, !pending.notes.isEmpty {
                whatsNew = pending
            }
            defaults.removeObject(forKey: "pendingWhatsNew")
        }
    }

    private func refreshCanCheck() { canCheck = systemCanCheck || state.isBusy }

    // MARK: Actions the window and the rest of the app call

    /// "Check now": opens the update window and looks for an update (or just shows where one is up to).
    func check() {
        if state.isBusy { present(); return }
        guard let updater else { return }
        state = .checking
        present()
        updater.checkForUpdates()
    }
    func setAutomaticChecks(_ value: Bool) {
        updater?.automaticallyChecksForUpdates = value
        UserDefaults.standard.set(!value, forKey: "updatesOptOut")
        automaticChecks = value
    }
    func present() { presentRequest += 1 }
    func windowOpened() { isSheetOpen = true }
    /// The window went away. Settle whatever Sparkle is waiting on, so the next check can start.
    func windowClosed() {
        isSheetOpen = false
        switch state {
        case .checking: cancelCheck?()
        case .upToDate, .error: finishAcknowledge()
        case .available: choose(.dismiss)
        default: break   // downloading, installing, ready: the update carries on in the background
        }
    }
    func updateNow() {
        guard case .available(let info) = state else { return }
        if let data = try? JSONEncoder().encode(PendingWhatsNew(version: info.version, notes: info.notes)) {
            UserDefaults.standard.set(data, forKey: "pendingWhatsNew")
        }
        state = .downloading(info, received: 0, total: info.size)
        choose(.install)
    }
    func remindLater() { choose(.dismiss) }
    func skipThisVersion() { choose(.skip) }
    /// "Restart now". If a film is being made the window asks first; `force` is the answer "stop it and restart".
    func restartToFinish(force: Bool = false) {
        guard case .ready = state else { return }
        if !force, let reason = StudioAppDelegate.current?.blockingReason { restartBlocker = reason; return }
        restartBlocker = nil
        if force { StudioAppDelegate.current?.quitPreconfirmed = true }
        state = .installing
        installStartedAt = Date()
        startStallTimers()
        choose(.install)
    }
    func cancelRestartBlocker() { restartBlocker = nil }

    private func startStallTimers() {
        stallTasks.forEach { $0.cancel() }
        installStall = .none
        stallTasks = [
            Task { [weak self] in
                // Real stall only: 8 s after the quit attempts (which take about 1 s) have had their chance.
                try? await Task.sleep(for: .seconds(9))
                guard !Task.isCancelled, let self, self.state == .installing, self.installStall == .none else { return }
                self.installStall = .waitingToClose(reason: StudioAppDelegate.current?.blockingReason ?? "")
                self.present()   // the sheet was closed to unblock quitting; bring the explanation back
            },
            Task { [weak self] in
                // The swap can take a minute on managed Macs (security software scans the new app).
                try? await Task.sleep(for: .seconds(120))
                guard !Task.isCancelled, let self, self.state == .installing else { return }
                self.installStall = .timedOut
            },
        ]
    }
    private func stopStallTimers() {
        stallTasks.forEach { $0.cancel() }
        stallTasks = []
        installStall = .none
    }
    /// "Restart now" on the waiting screen: the full quit sequence again.
    func restartNow() { beginQuitSequence() }

    /// Gets the app to quit so Sparkle can swap it: ask Sparkle to resend its quit event, close the update sheet
    /// so nothing modal is in the way, quit through the normal path after ~1 s, and as a last resort exit after ~6 s.
    /// Never skips the director protections: with something running and no confirmation it only retries and waits.
    fileprivate func beginQuitSequence() {
        quitSequenceID += 1
        let id = quitSequenceID
        retryTerminating?()
        dismissRequest += 1
        func safeToQuit() -> Bool {
            StudioAppDelegate.current?.blockingReason == nil || StudioAppDelegate.current?.quitPreconfirmed == true
        }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard let self, self.quitSequenceID == id, self.state == .installing, safeToQuit() else { return }
            NSApp.terminate(nil)
            try? await Task.sleep(for: .seconds(5))
            guard self.quitSequenceID == id, self.state == .installing, safeToQuit() else { return }
            // Still here: Sparkle's helper is waiting on us. Close every window and leave.
            for window in NSApp.windows { window.close() }
            NSApp.terminate(nil)
            try? await Task.sleep(for: .seconds(1))
            if self.quitSequenceID == id, self.state == .installing { exit(0) }
        }
    }
    /// "Finish quitting anyway": stops whatever is running without asking again, then quits.
    func quitAnyway() {
        StudioAppDelegate.current?.quitPreconfirmed = true
        restartNow()
    }
    /// After the 60 second timeout: start the wait over and send the quit request again.
    func tryInstallAgain() {
        installStartedAt = Date()
        startStallTimers()
        beginQuitSequence()
    }
    func downloadManually() { NSWorkspace.shared.open(Self.releasesURL) }
    func tryAgain() {
        retryAfterDismiss = true
        finishAcknowledge()
        state = .idle
    }
    func cancelDownloading() { cancelDownload?(); cancelDownload = nil }
    func dismissWhatsNew() { whatsNew = nil }

    fileprivate func choose(_ choice: SPUUserUpdateChoice) {
        let reply = chooseUpdate
        chooseUpdate = nil
        reply?(choice)
        if choice != .install { state = .idle }
    }
    fileprivate func finishAcknowledge() {
        let ack = acknowledge
        acknowledge = nil
        ack?()
    }
    fileprivate func setState(_ new: UpdateState) { state = new }
    fileprivate func installing(applicationTerminated: Bool, retry: @escaping () -> Void) {
        retryTerminating = retry
        state = .installing
        if installStartedAt == nil { installStartedAt = Date() }
        if applicationTerminated { stopStallTimers(); quitSequenceID += 1 }
        else {
            if stallTasks.isEmpty { startStallTimers() }
            // Sparkle sends one quit event and then only waits. Quit by ourselves, once per install.
            if !quitSequenceRunning { quitSequenceRunning = true; beginQuitSequence() }
        }
    }
    fileprivate func sessionEnded() {
        // Nothing is left half done: timers, the quit request and the "skip the quit prompt" flag all go away.
        stopStallTimers()
        quitSequenceID += 1; quitSequenceRunning = false
        installStartedAt = nil; retryTerminating = nil; restartBlocker = nil; downloadRate = 0
        StudioAppDelegate.current?.quitPreconfirmed = false
        cancelCheck = nil; chooseUpdate = nil; acknowledge = nil; cancelDownload = nil
        state = .idle
        lastChecked = updater?.lastUpdateCheckDate
        if retryAfterDismiss { retryAfterDismiss = false; check() }
    }
}

// MARK: Sparkle's user driver

/// Tells Sparkle's updater what to show by feeding `StudioUpdater.state`; the Studio window does the drawing.
@MainActor
final class StudioUpdateDriver: NSObject, SPUUserDriver {
    private unowned let owner: StudioUpdater
    private var info: UpdateInfo?
    private var received: UInt64 = 0
    private var expected: UInt64 = 0
    private var sampleTime = Date()
    private var sampleBytes: UInt64 = 0
    private var smoothedRate: Double = 0
    init(owner: StudioUpdater) { self.owner = owner }

    func show(_ request: SPUUpdatePermissionRequest, reply: @escaping (SUUpdatePermissionResponse) -> Void) {
        reply(SUUpdatePermissionResponse(automaticUpdateChecks: !UserDefaults.standard.bool(forKey: "updatesOptOut"), sendSystemProfile: false))
    }
    func showUserInitiatedUpdateCheck(cancellation: @escaping () -> Void) {
        owner.cancelCheck = cancellation
        owner.setState(.checking)
    }
    func showUpdateFound(with appcastItem: SUAppcastItem, state: SPUUserUpdateState, reply: @escaping (SPUUserUpdateChoice) -> Void) {
        let info = UpdateInfo(version: appcastItem.displayVersionString, size: appcastItem.contentLength,
                              notes: UpdateNotesParser.notes(from: appcastItem.itemDescription, format: appcastItem.itemDescriptionFormat))
        self.info = info
        owner.chooseUpdate = reply
        owner.setState(.available(info))
        // A person who asked for the check sees the window; a quiet background find shows the notice instead.
        if state.userInitiated { owner.present() }
    }
    func showUpdateReleaseNotes(with downloadData: SPUDownloadData) {}
    func showUpdateReleaseNotesFailedToDownloadWithError(_ error: any Error) {}
    func showUpdateNotFoundWithError(_ error: any Error, acknowledgement: @escaping () -> Void) {
        owner.acknowledge = acknowledgement
        owner.setState(.upToDate)
        owner.present()
    }
    func showUpdaterError(_ error: any Error, acknowledgement: @escaping () -> Void) {
        owner.acknowledge = acknowledgement
        let wasWorking = owner.state.isBusy || owner.isSheetOpen
        owner.setState(.error(message: UpdateNotesParser.plainMessage(for: error), detail: error.localizedDescription))
        // A quiet background hiccup is not worth interrupting anyone for; anything the person is watching is.
        if wasWorking { owner.present() } else { owner.windowClosed(); owner.setState(.idle) }
    }
    func showDownloadInitiated(cancellation: @escaping () -> Void) {
        owner.cancelDownload = cancellation
        received = 0; expected = 0
        sampleTime = Date(); sampleBytes = 0; smoothedRate = 0; owner.downloadRate = 0
        if let info { owner.setState(.downloading(info, received: 0, total: info.size)) }
    }
    func showDownloadDidReceiveExpectedContentLength(_ expectedContentLength: UInt64) {
        expected = expectedContentLength
        publishDownload()
    }
    func showDownloadDidReceiveData(ofLength length: UInt64) {
        received += length
        let now = Date(), dt = now.timeIntervalSince(sampleTime)
        if dt >= 0.5 {
            let instant = Double(received - sampleBytes) / dt
            smoothedRate = smoothedRate == 0 ? instant : smoothedRate * 0.8 + instant * 0.2
            sampleTime = now; sampleBytes = received
            owner.downloadRate = smoothedRate
        }
        publishDownload()
    }
    private func publishDownload() {
        guard let info else { return }
        owner.setState(.downloading(info, received: received, total: expected > 0 ? expected : info.size))
    }
    func showDownloadDidStartExtractingUpdate() {
        if let info { owner.setState(.extracting(info, progress: 0)) }
    }
    func showExtractionReceivedProgress(_ progress: Double) {
        if let info { owner.setState(.extracting(info, progress: progress)) }
    }
    func showReady(toInstallAndRelaunch reply: @escaping (SPUUserUpdateChoice) -> Void) {
        owner.chooseUpdate = reply
        owner.setState(.ready(info ?? UpdateInfo(version: "", size: 0, notes: [])))
        owner.present()
    }
    func showInstallingUpdate(withApplicationTerminated applicationTerminated: Bool, retryTerminatingApplication: @escaping () -> Void) {
        owner.installing(applicationTerminated: applicationTerminated, retry: retryTerminatingApplication)
    }
    func showUpdateInstalledAndRelaunched(_ relaunched: Bool, acknowledgement: @escaping () -> Void) { acknowledgement() }
    func showUpdateInFocus() { owner.present() }
    func dismissUpdateInstallation() {
        info = nil
        owner.sessionEnded()
    }
}

// MARK: Notes and plain words

enum UpdateNotesParser {
    /// The release notes as rows. The appcast carries a `<ul><li>` list (older items carry markdown bullets).
    static func notes(from description: String?, format: String?) -> [UpdateNote] {
        guard let text = description?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return [] }
        let isHTML = format?.lowercased() != "markdown" && text.range(of: "<li", options: .caseInsensitive) != nil
        var rows: [(String, String)] = []
        if isHTML {
            let items = matches(#"<li[^>]*>(.*?)</li>"#, in: text)
            for item in items {
                if let lead = matches(#"^\s*<(?:b|strong)>(.*?)</(?:b|strong)>"#, in: item).first {
                    let rest = item.replacingOccurrences(of: #"^\s*<(?:b|strong)>.*?</(?:b|strong)>"#, with: "", options: [.regularExpression, .caseInsensitive])
                    rows.append((clean(lead), clean(rest)))
                } else { rows.append(("", clean(item))) }
            }
        } else {
            for line in text.split(separator: "\n") {
                var l = line.trimmingCharacters(in: .whitespaces)
                guard l.hasPrefix("- ") || l.hasPrefix("* ") else {
                    if !rows.isEmpty, !l.isEmpty { rows[rows.count - 1].1 += " " + clean(l) }
                    continue
                }
                l = String(l.dropFirst(2))
                if l.hasPrefix("**"), let end = l.range(of: "**", range: l.index(l.startIndex, offsetBy: 2)..<l.endIndex) {
                    rows.append((clean(String(l[l.index(l.startIndex, offsetBy: 2)..<end.lowerBound])), clean(String(l[end.upperBound...]))))
                } else { rows.append(("", clean(l))) }
            }
        }
        return rows.compactMap { lead, body in
            var lead = lead
            if lead.hasSuffix(".") || lead.hasSuffix(":") { lead.removeLast() }
            guard !lead.isEmpty || !body.isEmpty else { return nil }
            return lead.isEmpty ? UpdateNote(lead: body, body: "") : UpdateNote(lead: lead, body: body)
        }
    }

    private static func matches(_ pattern: String, in text: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators, .caseInsensitive]) else { return [] }
        return re.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap {
            Range($0.range(at: 1), in: text).map { String(text[$0]) }
        }
    }
    private static func clean(_ s: String) -> String {
        var t = s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        for (a, b) in [("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&nbsp;", " "), ("&amp;", "&")] { t = t.replacingOccurrences(of: a, with: b) }
        t = t.replacingOccurrences(of: "`", with: "")
        return t.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// What went wrong, in plain words. The technical text goes in small print underneath.
    static func plainMessage(for error: any Error) -> String {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain {
            switch ns.code {
            case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed:
                return "RasanAI couldn't reach the update server. Check your internet connection and try again."
            case NSURLErrorTimedOut:
                return "The update took too long to download. Check your connection and try again."
            default: break
            }
        }
        return "Something went wrong while updating. Your current version is fine to keep using. Please try again in a moment."
    }
}

/// Gives the update download ten minutes without data before it gives up, instead of URLSession's 60 seconds.
/// Security proxies on managed Macs can hold a whole download to scan it before sending the first byte: a fresh
/// 70 MB disk image took 76 s that way, so Sparkle reported "The request timed out" with nothing received.
private final class UpdaterDelegate: NSObject, SPUUpdaterDelegate {
    func updater(_ updater: SPUUpdater, willDownloadUpdate item: SUAppcastItem, with request: NSMutableURLRequest) {
        request.timeoutInterval = 600
    }
}
