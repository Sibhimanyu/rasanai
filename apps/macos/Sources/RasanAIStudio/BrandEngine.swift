import Foundation
import StudioCore

/// Runs the engine's `scripts/brand-assets.mjs` for a brand folder, the way LessonStore runs lessons.mjs.
/// Without node or the engine nothing here runs and the brand still works natively (no reference import, no check).
enum BrandEngine {
    @MainActor static var available: Bool { DirectorRuntime.engineURL != nil && LessonStore.node != nil }

    /// `import` then `check`. Pass the original DESIGN.md so relative references resolve next to it. True when the import ran and said ok.
    @MainActor @discardableResult
    static func importAndCheck(_ folder: URL, design: URL? = nil) async -> Bool {
        var args = ["import", "--brand", folder.path]
        if let design { args += ["--design", design.path] }
        let imported = await run(args)
        await check(folder)
        return imported?["ok"] == .bool(true)
    }

    /// `check` writes assets/check.json, which the brand page reads.
    @MainActor static func check(_ folder: URL) async {
        _ = await run(["check", "--brand", folder.path])
    }

    /// One command's stdout JSON, or nil when node/the engine is missing, the command failed or the output is not JSON.
    @MainActor private static func run(_ arguments: [String]) async -> JSONValue? {
        guard let engine = DirectorRuntime.engineURL, let node = LessonStore.node else { return nil }
        let script = engine.appendingPathComponent("scripts/brand-assets.mjs")
        guard FileManager.default.fileExists(atPath: script.path) else { return nil }
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = ([node.deletingLastPathComponent().path] + LocalAgent.searchDirectories).joined(separator: ":")
        environment["RASANAI_NO_UPDATE_CHECK"] = "1"
        let env = environment
        return await Task.detached { () -> JSONValue? in
            let process = Process()
            process.executableURL = node
            process.arguments = [script.path] + arguments
            process.environment = env
            let out = Pipe()
            process.standardInput = FileHandle.nullDevice; process.standardOutput = out; process.standardError = FileHandle.nullDevice
            guard (try? process.run()) != nil else { return nil }
            // Downloads in `import` can take a while; never hang the page on a stuck network.
            let watchdog = DispatchWorkItem { if process.isRunning { process.terminate() } }
            DispatchQueue.global().asyncAfter(deadline: .now() + 180, execute: watchdog)
            let data = out.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            watchdog.cancel()
            guard process.terminationStatus == 0 else { return nil }
            return try? JSONDecoder().decode(JSONValue.self, from: data)
        }.value
    }
}
