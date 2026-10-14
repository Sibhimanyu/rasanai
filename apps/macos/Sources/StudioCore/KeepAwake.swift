import Foundation

/// When the Mac should be kept from idle sleep: only while the director is genuinely working.
public enum KeepAwakePolicy {
    /// Hold while the setting is on and the director runs, except while the film waits on the person with nothing running
    /// in the background (that wait could last all night, so the Mac may sleep).
    public static func shouldHold(enabled: Bool, processRunning: Bool, health: DirectorHealth?) -> Bool {
        guard enabled, processRunning else { return false }
        if let health, health.state == .waitingForYou, health.background == nil { return false }
        return true
    }
}
