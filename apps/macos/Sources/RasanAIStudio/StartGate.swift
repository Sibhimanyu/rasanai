import StudioCore
import SwiftUI

/// Holds the start that is waiting on the readiness sheet. Kept here so the gate needs nothing from StudioStore's stored state.
@MainActor @Observable final class StartGate {
    static let shared = StartGate()
    /// Runs once readiness passes; cleared when the sheet is dismissed.
    var pending: (() -> Void)?
    /// True while the silent check runs, so the Start button can show it is working.
    var isChecking = false
}

extension StudioStore {
    /// Runs the readiness check silently. Starts straight away when everything is in place; otherwise shows the blockers.
    func startWhenReady(project: URL?, sources: [URL], proceed: @escaping () -> Void) {
        guard !isDemo else { proceed(); return }
        let gate = StartGate.shared
        guard !gate.isChecking else { return }
        gate.isChecking = true
        preflightProject = project
        preflightSources = sources
        Task {
            await checkPreflight()
            gate.isChecking = false
            if preflightReport?.canStart == true { proceed() }
            else { gate.pending = proceed; sheet = .preflight }
        }
    }

    /// Re-runs the check for the waiting start and continues if the blockers are gone.
    func recheckAndStart() async {
        await checkPreflight()
        guard preflightReport?.canStart == true, let proceed = StartGate.shared.pending else { return }
        StartGate.shared.pending = nil
        sheet = nil
        proceed()
    }
}
