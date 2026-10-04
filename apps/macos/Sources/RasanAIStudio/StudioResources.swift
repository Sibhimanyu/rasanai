import Foundation
import StudioCore

/// SwiftPM's generated Bundle.module accessor differs between the CLI and Xcode
/// build systems. It can fatalError before we can recover in a relocated .app.
enum StudioResources {
    static func sampleURL(resourceDirectory: URL? = Bundle.main.resourceURL,
                          executableDirectory: URL = Bundle.main.bundleURL) throws -> URL {
        let roots = [resourceDirectory, executableDirectory].compactMap { $0 }
        for root in roots {
            let bundle = root.appendingPathComponent("RasanAIStudio_RasanAIStudio.bundle")
            // CLI SwiftPM creates a flat bundle; Xcode creates a macOS bundle.
            for relative in ["Contents/Resources/sample-session.json", "sample-session.json"] {
                let url = bundle.appendingPathComponent(relative)
                if FileManager.default.isReadableFile(atPath: url.path) { return url }
            }
        }
        throw CocoaError(.fileReadNoSuchFile, userInfo: [NSLocalizedDescriptionKey:
            "The sample film resource is missing from this installation. Reinstall RasanAI Studio; your projects are kept separately."])
    }

    static func sampleSnapshot() throws -> SessionSnapshot {
        try SessionSnapshot(data: Data(contentsOf: sampleURL()))
    }
}
