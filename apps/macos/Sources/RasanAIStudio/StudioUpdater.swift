import Combine
import Sparkle
import SwiftUI

@MainActor
final class StudioUpdater: ObservableObject {
    static let shared = StudioUpdater()
    @Published var canCheck = false
    @Published var automaticChecks = false
    @Published var configurationError: String?
    private var observation: AnyCancellable?
    private var controller: SPUStandardUpdaterController?
    var isConfigured: Bool { controller != nil && configurationError == nil }
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
        automaticChecks = controller.updater.automaticallyChecksForUpdates
        observation = controller.updater.publisher(for: \.canCheckForUpdates).sink { [weak self] value in
            Task { @MainActor in self?.canCheck = value }
        }
    }
    func check() { controller?.updater.checkForUpdates() }
    func setAutomaticChecks(_ value: Bool) {
        controller?.updater.automaticallyChecksForUpdates = value
        automaticChecks = value
    }
}

struct UpdateSettingsView: View {
    @ObservedObject var updater = StudioUpdater.shared
    var body: some View {
        Section("Software updates") {
            Toggle("Automatically check for updates", isOn: Binding(get: { updater.automaticChecks }, set: updater.setAutomaticChecks))
                .disabled(!updater.isConfigured)
            Button("Check for Updates…") { updater.check() }.disabled(!updater.canCheck)
            if let error = updater.configurationError { Text(error).font(.caption).foregroundStyle(.secondary) }
            Text("Updates use Sparkle and signed GitHub release downloads. Project files stay outside the application bundle.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}
