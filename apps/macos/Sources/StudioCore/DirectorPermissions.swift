import Foundation

/// What a director may do when the person has not turned on "Allow unrestricted tools".
///
/// A headless `claude --print` cannot ask anyone for approval, so anything outside its folder or allowlist is silently
/// denied and the film never starts (the engine lives inside the app bundle, outside the project). This type scopes the
/// director precisely: it may read the engine and the installed skills, write only in the project (and RasanAI's own
/// data folders), and run the commands the RasanAI skill documents. Destructive and installer commands stay denied.
public struct DirectorPermissions: Sendable, Equatable {
    public let additionalDirectories: [String]
    public let writableDirectories: [String]
    public let allow: [String]
    public let deny: [String]

    public static let tools = ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "Agent", "TodoWrite", "Skill", "BashOutput", "KillShell"]
    /// Every program the skill's workflow runs through the shell. The engine's own scripts (node …/scripts/*.mjs) spawn
    /// ffmpeg, whisper and the rest themselves, so these are only the commands the director types.
    public static let commands = [
        "node", "hyperframes", "*/node_modules/.bin/hyperframes", "yt-dlp",
        // The model often types the absolute path it found with `which` (a private Node, /usr/bin/curl, Homebrew's ffmpeg).
        "*/bin/node", "*/bin/npx", "*/bin/ffmpeg", "*/bin/ffprobe", "*/bin/curl", "*/bin/python3", "*/bin/jq", "ffmpeg", "ffprobe", "whisper-cli",
        "python3", "curl", "jq", "ls", "cat", "head", "tail", "wc", "find", "grep", "rg", "sed", "awk", "sort", "uniq", "cut", "tr", "diff",
        "file", "stat", "du", "which", "echo", "printf", "pwd", "date", "sleep", "basename", "dirname", "realpath", "shasum", "test",
        "mkdir", "cp", "mv", "touch", "cd", "tar", "unzip", "rm", "bash */scripts/setup.sh", "sh */scripts/setup.sh",
        "git status", "git log", "git diff", "git rev-parse"
    ] + npxHyperframes
    /// `npx` is only for HyperFrames (any flag order the model reaches for); any other package stays unapproved.
    static let npxHyperframes: [String] = {
        let flags = ["", "-y ", "--yes ", "--no-install ", "-y --no-install ", "--yes --no-install ", "--no-install -y ", "--no-install --yes "]
        return flags.flatMap { ["npx \($0)hyperframes", "npx \($0)hyperframes@*"] }
    }()
    /// Deny rules beat allow rules. Recursive deletes, privilege escalation, piping a download into a shell, system installers
    /// and anything that rewrites the signed app are never allowed without the unrestricted opt-in.
    public static let denied = [
        "rm -r*", "rm -R*", "rm -fr*", "rm -fR*", "rm -vr*", "rm --*", "rm * -r*", "rm * -R*", "rm * -fr*", "rm * -fR*", "rm * --recursive*", "rmdir", "sudo", "su", "doas",
        "chmod -R", "chown", "dd", "mkfs", "diskutil", "launchctl", "osascript", "open", "kill", "killall", "pkill",
        "npm install", "npm i", "npm uninstall", "npm exec", "npx -g", "pip", "pip3", "python3 -m pip", "brew", "gem", "cargo install", "go install",
        "curl * | *", "curl *|*", "wget", "git push", "git reset --hard", "git clean", "git checkout", "git commit",
        "find * -delete*", "find * -exec rm*", "find * -exec sh*", "find * -exec bash*", "xargs rm*", "* | sh", "* | bash", "* | zsh", "* | sudo*",
        "eval", "defaults write", "security", "codesign", "xattr", "spctl", "tccutil"
    ]

    public init(engine: URL, home: URL, toolsDirectory: URL, fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }) {
        // Read access: the engine, the installed skills the engine reads (HyperFrames' workflows), the managed tools and the model caches.
        let readOnly = [
            engine.path,
            home.appendingPathComponent(".claude/skills").path,
            home.appendingPathComponent(".agents/skills").path,
            home.appendingPathComponent(".claude/plugins/cache").path,
            home.appendingPathComponent(".codex/skills").path
        ]
        // Scratch space for downloads and frame grabs; the research crew keeps working files in /tmp.
        let data = Self.dataFolders(home: home, toolsDirectory: toolsDirectory) + ["/tmp"]
        // The engine is always granted, even if the path check cannot see it yet; the rest only when they exist.
        func keep(_ paths: [String]) -> [String] { paths.filter { $0 == engine.path || fileExists($0) } }
        writableDirectories = keep(data)
        additionalDirectories = keep(readOnly) + writableDirectories
        allow = Self.tools + Self.commands.map { $0.contains("*") && !$0.hasPrefix("*/") || $0.hasSuffix("@*") ? "Bash(\($0))" : "Bash(\($0) *)" } + Self.bareCommands.map { "Bash(\($0))" }
        // Not denied with Edit/Write rules on the engine: Claude Code applies those to every path a shell command names, which
        // would block `cp <engine>/templates …`. The launch prompt already forbids modifying the signed bundle.
        deny = Self.denied.map { $0.contains("*") ? "Bash(\($0))" : "Bash(\($0) *)" } + Self.bareDenied.map { "Bash(\($0))" }
    }

    /// Data folders RasanAI itself writes to: its memory, a private Node, the managed tools, whisper models, the npm cache.
    public static func dataFolders(home: URL, toolsDirectory: URL) -> [String] {
        [home.appendingPathComponent(".rasanai").path, toolsDirectory.path, home.appendingPathComponent(".cache/hyperframes").path,
         home.appendingPathComponent(".npm").path]
    }

    static let bareCommands = ["ls", "pwd", "date", "git status", "git log", "git diff"]
    static let bareDenied = ["sudo", "su", "wget"]

    /// The JSON for `claude --settings`. One argument, so it can never swallow the prompt the way variadic flags do.
    public var claudeSettingsJSON: String {
        let object: [String: Any] = ["permissions": ["additionalDirectories": additionalDirectories, "allow": allow, "deny": deny]]
        let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])) ?? Data("{}".utf8)
        return String(decoding: data, as: UTF8.self)
    }

    /// Codex `workspace-write` already reads the whole disk (so the engine is readable). It cannot write outside the project
    /// or reach the network unless told to: the data folders become writable roots and network access is switched on for
    /// research, music, fonts and `npx hyperframes`. It never gets full access.
    public var codexArguments: [String] {
        var args = ["-c", "sandbox_workspace_write.network_access=true"]
        for dir in writableDirectories { args += ["--add-dir", dir] }
        return args
    }

    /// Creates the data folders the sandbox is allowed to write to, so that the first write inside one does not fail
    /// for lack of a parent. Call before building the launch.
    public static func prepareDataFolders(home: URL, toolsDirectory: URL) {
        for dir in dataFolders(home: home, toolsDirectory: toolsDirectory) { try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true) }
    }
}
