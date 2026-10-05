import Foundation

public struct PreflightItem: Identifiable, Sendable {
    public enum Level: Sendable, Equatable { case ready, warning, blocked }
    public let id: String
    public let title: String
    public let detail: String
    public let level: Level
    public let command: String?
    public init(_ id: String, _ title: String, _ detail: String, _ level: Level, command: String? = nil) {
        self.id = id; self.title = title; self.detail = detail; self.level = level; self.command = command
    }
}

public struct PreflightReport: Sendable {
    public let items: [PreflightItem]
    public let checkedAt: Date
    public var canStart: Bool { !items.contains { $0.level == .blocked } }
    public var blockers: String { items.filter { $0.level == .blocked }.map { "\($0.title): \($0.detail)" }.joined(separator: "\n") }
    public init(items: [PreflightItem]) { self.items = items; checkedAt = Date() }
}

public struct PreflightConfiguration: Sendable {
    public let node: URL?
    public let engine: URL?
    public let driver: URL?
    public let directories: [String]
    public let environment: [String: String]
    public let project: URL
    public let sources: [URL]
    public let existingRun: URL?
    /// The Codex CLI used for image generation (nil when none was found) and whether Settings allows it.
    public let codex: URL?
    public let imageGeneration: Bool
    public init(node: URL?, engine: URL?, driver: URL?, directories: [String], environment: [String: String], project: URL, sources: [URL], existingRun: URL? = nil, codex: URL? = nil, imageGeneration: Bool = true) {
        self.node = node; self.engine = engine; self.driver = driver; self.directories = directories
        self.environment = environment; self.project = project; self.sources = sources; self.existingRun = existingRun
        self.codex = codex; self.imageGeneration = imageGeneration
    }
}

/// Local checks never install packages, download browsers or run project code.
public enum FilmPreflight {
    public static func check(_ config: PreflightConfiguration) async -> PreflightReport {
        await Task.detached { await inspect(config) }.value
    }
    private static func inspect(_ config: PreflightConfiguration) async -> PreflightReport {
        let fm = FileManager.default
        var rows: [PreflightItem] = []
        let nodeOK: Bool
        if let node = config.node {
            nodeOK = await probe(node, arguments: ["-e", "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"], config: config)
            rows.append(PreflightItem("node", "Node.js", nodeOK ? "Node.js 22 or newer is available." : "Select a working Node.js 22+ installation, or clear the override to use bundled Node in Settings → Director → Advanced.", nodeOK ? .ready : .blocked))
        } else {
            nodeOK = false
            rows.append(PreflightItem("node", "Node.js", "Node.js 22+ is missing. Set its path in Settings → Director → Advanced.", .blocked))
        }
        let engineOK = config.engine.map { fm.isReadableFile(atPath: $0.appendingPathComponent("scripts/console.mjs").path) } == true
            && config.driver.map { fm.isReadableFile(atPath: $0.path) } == true
        rows.append(PreflightItem("engine", "Studio tools", engineOK ? "The bundled director and review tools are available." : "Bundled tools are missing. Download a fresh copy of Studio.", engineOK ? .ready : .blocked))
        for tool in ["ffmpeg", "ffprobe"] {
            let binary = executable(tool, directories: config.directories)
            let okay = if let binary { await probe(binary, arguments: ["-version"], config: config) } else { false }
            rows.append(PreflightItem(tool, tool == "ffmpeg" ? "Video rendering" : "Media inspection",
                okay ? "\(tool) is available." : "\(tool) is missing or cannot run. Install FFmpeg, then recheck.", okay ? .ready : .blocked,
                command: okay ? nil : "brew install ffmpeg"))
        }
        let npxOK = executable("npx", directories: config.directories) != nil
        rows.append(PreflightItem("npx", "Renderer launcher", npxOK ? "npx is available for HyperFrames." : "npx is missing. Install Node.js with npm, or select the complete Node distribution in Settings.", npxOK ? .ready : .blocked))
        let renderer = executable("hyperframes", directories: config.directories)
            ?? executable("hyperframes", directories: [config.project.appendingPathComponent("node_modules/.bin").path])
        rows.append(PreflightItem("renderer", "HyperFrames", renderer == nil
            ? "The renderer will be resolved through npx and may need an internet connection. Install it in advance for offline work."
            : "A local HyperFrames executable is available. Compatibility is checked when rendering.", renderer == nil ? .warning : .ready,
            command: renderer == nil ? "npm install --global --prefix \(LocalAgent.shellQuote(fm.homeDirectoryForCurrentUser.appendingPathComponent(".npm-global").path)) hyperframes" : nil))
        let browser = findBrowser(environment: config.environment)
        rows.append(PreflightItem("browser", "Render browser", browser == nil
            ? "No render browser was found. HyperFrames may download one on first use; prepare it before working offline."
            : "A local browser executable was found. HyperFrames verifies its compatibility when rendering.", browser == nil ? .warning : .ready,
            command: browser == nil ? "npx --yes hyperframes browser ensure" : nil))
        rows.append(await imageGenerationRow(config))
        let home = fm.homeDirectoryForCurrentUser
        var roots = [home.appendingPathComponent(".claude/skills"), home.appendingPathComponent(".agents/skills"),
                     config.project.appendingPathComponent(".claude/skills"), config.project.appendingPathComponent(".agents/skills")]
        if let extra = config.environment["HYPERFRAMES_SKILLS_DIR"] { roots.insert(URL(fileURLWithPath: extra), at: 0) }
        let creative = roots.contains { fm.isReadableFile(atPath: $0.appendingPathComponent("hyperframes-creative/SKILL.md").path) }
        rows.append(PreflightItem("skills", "Design resources", creative ? "HyperFrames design resources are installed." : "HyperFrames design resources were not found. Some design helpers require them.", creative ? .ready : .warning,
            command: creative ? nil : "npx --yes hyperframes skills update"))
        if !creative {
            let git = executable("git", directories: config.directories)
            let gitOK: Bool
            if let git {
                // Apple's git shim can open an installer dialog. A readiness check must not do that.
                let shimReady: Bool
                if git.path == "/usr/bin/git" { shimReady = await probe(URL(fileURLWithPath: "/usr/bin/xcode-select"), arguments: ["-p"], config: config) }
                else { shimReady = true }
                gitOK = shimReady ? await probe(git, arguments: ["--version"], config: config) : false
            } else { gitOK = false }
            rows.append(PreflightItem("git", "Design setup support", gitOK ? "Git is available for installing design resources." : "Install Apple's command line tools to provide Git, then recheck. The renderer and video tools can be installed separately.", gitOK ? .ready : .warning,
                command: gitOK ? nil : "xcode-select --install"))
        }
        do {
            let values = try config.project.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard values.isDirectory == true, values.isSymbolicLink != true else { throw ProjectSources.SourceError.unsafeLocation }
            let probeURL = config.project.appendingPathComponent(".rasanai-write-check-\(UUID().uuidString)")
            defer { try? fm.removeItem(at: probeURL) }
            try Data().write(to: probeURL, options: .withoutOverwriting)
            rows.append(PreflightItem("folder", "Film folder", "The folder is readable and writable.", .ready))
        } catch { rows.append(PreflightItem("folder", "Film folder", "The folder is unavailable or cannot be written. Choose a local writable folder in Settings.", .blocked)) }
        let unreadable = config.sources.filter { url in
            guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey]),
                  values.isRegularFile == true, values.isSymbolicLink != true else { return true }
            return !fm.isReadableFile(atPath: url.path)
        }
        rows.append(PreflightItem("sources", "Source files", unreadable.isEmpty
            ? (config.sources.isEmpty ? "No source files attached." : "All \(config.sources.count) source files are readable.")
            : "Unavailable files: " + unreadable.prefix(5).map(\.lastPathComponent).joined(separator: ", "), unreadable.isEmpty ? .ready : .blocked))
        if let run = config.existingRun {
            let valid = (try? SessionSnapshot(data: Data(contentsOf: run.appendingPathComponent("session.json")))) != nil
            rows.append(PreflightItem("run", "Saved review state", valid ? "The existing run can be read." : "The saved run is missing or invalid. Restore the project files before resuming.", valid ? .ready : .blocked))
        }
        let free = (try? config.project.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage)
        if let free {
            let level: PreflightItem.Level = free < 1_073_741_824 ? .blocked : free < 5_368_709_120 ? .warning : .ready
            let available = ByteCountFormatter.string(fromByteCount: free, countStyle: .file)
            rows.append(PreflightItem("disk", "Free space", "\(available) available. Allow at least 1 GB to start; larger source files and renders need more.", level))
        } else { rows.append(PreflightItem("disk", "Free space", "Free space could not be measured. Check the destination drive before rendering.", .warning)) }
        return PreflightReport(items: rows)
    }
    /// Never blocks a film: without Codex, presenter films fall back to designed backdrops. Runs `codex login status` only.
    private static func imageGenerationRow(_ config: PreflightConfiguration) async -> PreflightItem {
        let title = "Image generation"
        let install = "npm install -g @openai/codex && codex login"
        guard config.imageGeneration else {
            return PreflightItem("imagegen", title, "Image generation is turned off in Settings → Director. Presenter films will use designed backdrops instead of generated images.", .warning)
        }
        guard let codex = config.codex, FileManager.default.isExecutableFile(atPath: codex.path) else {
            return PreflightItem("imagegen", title, "Generated images for presenter films use your ChatGPT plan through Codex, which isn't installed. Without it, films use designed backdrops.", .warning, command: install)
        }
        let signedIn = await probe(codex, arguments: ["login", "status"], config: config)
        return signedIn
            ? PreflightItem("imagegen", title, "Generated images for presenter films use your ChatGPT plan through Codex.", .ready)
            : PreflightItem("imagegen", title, "Generated images for presenter films use your ChatGPT plan through Codex. Sign in to Codex to use them; until then films use designed backdrops.", .warning, command: "codex login")
    }
    private static func executable(_ name: String, directories: [String]) -> URL? {
        directories.map { URL(fileURLWithPath: $0).appendingPathComponent(name) }
            .first { FileManager.default.isExecutableFile(atPath: $0.path) }
    }
    private static func probe(_ executable: URL, arguments: [String], config: PreflightConfiguration) async -> Bool {
        let process = Process()
        process.executableURL = executable; process.arguments = arguments; process.environment = config.environment
        process.currentDirectoryURL = FileManager.default.temporaryDirectory
        process.standardInput = FileHandle.nullDevice; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            let deadline = Date().addingTimeInterval(8)
            while process.isRunning && Date() < deadline {
                if Task.isCancelled { process.terminate(); return false }
                try await Task.sleep(for: .milliseconds(50))
            }
            if process.isRunning { process.terminate(); return false }
            return process.terminationStatus == 0
        } catch { if process.isRunning { process.terminate() }; return false }
    }
    private static func findBrowser(environment: [String: String]) -> URL? {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser
        let explicit = [environment["HYPERFRAMES_BROWSER_PATH"], environment["PRODUCER_HEADLESS_SHELL_PATH"]].compactMap { $0 }
        for path in explicit where fm.isExecutableFile(atPath: path) { return URL(fileURLWithPath: path) }
        for root in [home.appendingPathComponent(".cache/puppeteer/chrome-headless-shell"), home.appendingPathComponent(".cache/hyperframes/chrome/chrome-headless-shell")] {
            for version in (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? [] {
                for suffix in ["chrome-headless-shell-mac-arm64/chrome-headless-shell", "chrome-headless-shell-mac-x64/chrome-headless-shell"] {
                    let binary = version.appendingPathComponent(suffix)
                    if fm.isExecutableFile(atPath: binary.path) { return binary }
                }
            }
        }
        for path in ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", home.appendingPathComponent("Applications/Google Chrome.app/Contents/MacOS/Google Chrome").path] where fm.isExecutableFile(atPath: path) {
            return URL(fileURLWithPath: path)
        }
        return nil
    }
}
