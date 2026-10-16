import Foundation
import StudioCore

/// SwiftPM's generated Bundle.module accessor differs between the CLI and Xcode
/// build systems. It can fatalError before we can recover in a relocated .app.
enum StudioResources {
    /// A file from the app's resource bundle, wherever it sits: in Contents/Resources of the packaged app, or beside the
    /// executable in a `swift build`. `nil` when it is missing; never traps like Bundle.module.
    static func url(_ name: String, _ ext: String, resourceDirectory: URL? = Bundle.main.resourceURL,
                    executableDirectory: URL = Bundle.main.bundleURL) -> URL? {
        let roots = [resourceDirectory, executableDirectory, Bundle.main.executableURL?.deletingLastPathComponent()].compactMap { $0 }
        for root in roots {
            let bundle = root.appendingPathComponent("RasanAIStudio_RasanAIStudio.bundle")
            // CLI SwiftPM creates a flat bundle; Xcode creates a macOS bundle.
            for relative in ["Contents/Resources/\(name).\(ext)", "\(name).\(ext)"] {
                let url = bundle.appendingPathComponent(relative)
                if FileManager.default.isReadableFile(atPath: url.path) { return url }
            }
        }
        return nil
    }

    static func sampleURL(resourceDirectory: URL? = Bundle.main.resourceURL,
                          executableDirectory: URL = Bundle.main.bundleURL) throws -> URL {
        if let url = url("sample-session", "json", resourceDirectory: resourceDirectory, executableDirectory: executableDirectory) { return url }
        throw CocoaError(.fileReadNoSuchFile, userInfo: [NSLocalizedDescriptionKey:
            "The sample film resource is missing from this installation. Reinstall RasanAI Studio; your projects are kept separately."])
    }

    static func sampleSnapshot() throws -> SessionSnapshot {
        try SessionSnapshot(data: Data(contentsOf: sampleURL()))
    }
}
