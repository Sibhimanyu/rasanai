import Combine
import Sparkle
import SwiftUI

@MainActor
final class StudioUpdater: ObservableObject {
    static let shared = StudioUpdater()
    /// Updates are checked every 5 hours.
    static let checkInterval: TimeInterval = 18_000
    @Published var canCheck = false
    @Published var automaticChecks = false
    @Published var configurationError: String?
    @Published var lastChecked: Date?
    private var observation: AnyCancellable?
    private var controller: SPUStandardUpdaterController?
    var isConfigured: Bool { controller != nil && configurationError == nil }
    var lastCheckedText: String {
        guard let lastChecked else { return "Never" }
        return lastChecked.formatted(.relative(presentation: .named))
    }
    private init() {
        // Source/candidate builds keep checks off; release packaging explicitly opts in.
        guard Bundle.main.object(forInfoDictionaryKey: "RasanAIUpdatesEnabled") as? Bool == true,
              let key = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String,
              Data(base64Encoded: key)?.count == 32 else {
            configurationError = "Updates are disabled in this local build. A release must include its verified update-signing public key."
            return
        }
        let controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: nil, userDriverDelegate: nil)
        do { try controller.updater.start() }
        catch { configurationError = error.localizedDescription; return }
        self.controller = controller
        let updater = controller.updater
        // On by default; only an explicit opt-out in Settings turns it off. Sparkle's own stored
        // value from older builds is false, so we override it here.
        let optedOut = UserDefaults.standard.bool(forKey: "updatesOptOut")
        updater.automaticallyChecksForUpdates = !optedOut
        updater.updateCheckInterval = Self.checkInterval
        automaticChecks = !optedOut
        lastChecked = updater.lastUpdateCheckDate
        observation = updater.publisher(for: \.canCheckForUpdates).sink { [weak self] value in
            Task { @MainActor in
                self?.canCheck = value
                self?.lastChecked = self?.controller?.updater.lastUpdateCheckDate
            }
        }
        if !optedOut { updater.checkForUpdatesInBackground() }
    }
    func check() { controller?.updater.checkForUpdates() }
    func setAutomaticChecks(_ value: Bool) {
        controller?.updater.automaticallyChecksForUpdates = value
        UserDefaults.standard.set(!value, forKey: "updatesOptOut")
        automaticChecks = value
    }
}
