import Foundation

/// What a check of one tool found, in the words Rasan reports: what was looked at, where, and what came back. Never a guess.
public struct ToolCheck: Equatable, Sendable {
    public var found: Bool
    /// What Studio did ("looked for `kokoro-onnx` on the director's PATH", "ran `python3 -c "import kokoro_onnx"`").
    public var checked: String
    /// Where it was found (a path), empty when it was not.
    public var location: String
    /// The exact reason it was not found (the interpreter's own error line), or a short note on what was found.
    public var detail: String
    public init(found: Bool, checked: String, location: String, detail: String) { self.found = found; self.checked = checked; self.location = location; self.detail = detail }
    public var summary: String {
        found ? "Found: \(checked)\(location.isEmpty ? "" : " -> \(location)")." : "Not found: \(checked). \(detail)"
    }
}

/// One finished process: its exit status, everything it printed (stdout and stderr together), and whether the time limit stopped it.
public struct ShellResult: Sendable { public var status: Int32; public var output: String; public var timedOut: Bool }

public enum Shell {
    private final class Buffer: @unchecked Sendable {
        private let lock = NSLock(); private var text = ""; private var pending = ""
        func add(_ chunk: String, line: (@Sendable (String) -> Void)?) {
            lock.lock(); text += chunk; pending += chunk
            var lines: [String] = []
            while let r = pending.firstIndex(where: \.isNewline) { lines.append(String(pending[..<r])); pending.removeSubrange(...r) }
            lock.unlock()
            if let line { for l in lines where !l.trimmingCharacters(in: .whitespaces).isEmpty { line(l) } }
        }
        var all: String { lock.lock(); defer { lock.unlock() }; return text }
    }

    /// Runs `executable` with a time limit, forwarding each output line as it arrives. Cancelling the task stops the process.
    public static func run(_ executable: URL, _ arguments: [String], environment: [String: String], directory: URL = FileManager.default.temporaryDirectory,
                           timeout: TimeInterval, onLine: (@Sendable (String) -> Void)? = nil) async -> ShellResult {
        let process = Process(), pipe = Pipe(), buffer = Buffer()
        process.executableURL = executable; process.arguments = arguments; process.environment = environment; process.currentDirectoryURL = directory
        process.standardInput = FileHandle.nullDevice; process.standardOutput = pipe; process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { h in
            let data = h.availableData
            if !data.isEmpty { buffer.add(String(decoding: data, as: UTF8.self), line: onLine) }
        }
        do { try process.run() } catch { return ShellResult(status: -1, output: error.localizedDescription, timedOut: false) }
        let deadline = Date().addingTimeInterval(timeout)
        var timedOut = false, stopped = false
        while process.isRunning {
            if Task.isCancelled { stopped = true; break }
            if Date() > deadline { timedOut = true; stopped = true; break }
            try? await Task.sleep(for: .milliseconds(80))
        }
        if stopped {
            // The whole tree (pip starts build tools), politely first, then for sure. Never wait on a pipe a child may still hold open.
            let pid = process.processIdentifier
            let tree = descendants(of: pid)
            for p in tree.reversed() { kill(p, SIGTERM) }
            process.terminate()
            for _ in 0..<25 where process.isRunning { try? await Task.sleep(for: .milliseconds(80)) }
            for p in tree.reversed() { kill(p, SIGKILL) }
            if process.isRunning { kill(pid, SIGKILL) }
        }
        process.waitUntilExit()
        pipe.fileHandleForReading.readabilityHandler = nil
        if !stopped, let rest = try? pipe.fileHandleForReading.readToEnd(), !rest.isEmpty { buffer.add(String(decoding: rest, as: UTF8.self) + "\n", line: onLine) }
        return ShellResult(status: process.terminationStatus, output: buffer.all, timedOut: timedOut)
    }

    /// Every process below `pid`, parents before children (found with `pgrep -P`).
    private static func descendants(of pid: Int32, depth: Int = 0) -> [Int32] {
        guard depth < 5 else { return [] }
        let p = Process(), pipe = Pipe()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep"); p.arguments = ["-P", String(pid)]
        p.standardOutput = pipe; p.standardError = FileHandle.nullDevice
        guard (try? p.run()) != nil else { return [] }
        let data = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
        let kids = String(decoding: data, as: UTF8.self).split(whereSeparator: \.isNewline).compactMap { Int32($0) }
        return kids.flatMap { [$0] + descendants(of: $0, depth: depth + 1) }
    }
}

/// Looks for a tool the way its kind is found, in the director's own environment: an executable on its PATH, a Python package by importing
/// it with the `python3` the director gets, an npm package through its `node`, an app in the Applications folders.
/// A Python package is never imported (librosa and numba crash on Python 3.14 and pop dialogs, and any import runs the package's own code):
/// it is looked up with `importlib.util.find_spec` on its top-level name, or `importlib.metadata` for the names in `neverImport`.
public enum ToolVerifier {
    static let neverImport: Set<String> = ["librosa", "numba", "llvmlite", "whisper"]

    public static func check(_ need: ToolNeed, environment: [String: String]) async -> ToolCheck {
        switch need.kind {
        case .executable: return await executable(need, environment: environment)
        case .pythonModule: return await python(need, environment: environment)
        case .npmPackage: return await npm(need, environment: environment)
        case .app: return app(need)
        }
    }

    private static func executable(_ need: ToolNeed, environment: [String: String]) async -> ToolCheck {
        let names = need.executables
        guard !names.isEmpty else { return ToolCheck(found: true, checked: "nothing to look up on the PATH", location: "", detail: "") }
        let found = await FilmPreflight.visibleOnPath(names, environment: environment)
        let absent = names.filter { found[$0] == nil }
        let checked = "looked for " + names.map { "`\($0)`" }.joined(separator: ", ") + " on the director's PATH"
        if absent.isEmpty { return ToolCheck(found: true, checked: checked, location: found.values.map(\.path).sorted().joined(separator: ", "), detail: "") }
        return ToolCheck(found: false, checked: checked, location: "", detail: "Missing: " + absent.joined(separator: ", ") + ".")
    }

    /// The first usable `python3` on the director's PATH. The macOS `/usr/bin/python3` stub is skipped when the command line tools are
    /// absent (running it opens Apple's installer dialog).
    public static func pythonURL(environment: [String: String]) -> URL? {
        let fm = FileManager.default
        let tools = fm.fileExists(atPath: "/Library/Developer/CommandLineTools/usr/bin/python3") || fm.fileExists(atPath: "/Applications/Xcode.app/Contents/Developer/usr/bin/python3")
        for dir in (environment["PATH"] ?? "").split(separator: ":").map(String.init) {
            let candidate = URL(fileURLWithPath: dir).appendingPathComponent("python3")
            guard fm.isExecutableFile(atPath: candidate.path) else { continue }
            if candidate.path == "/usr/bin/python3" && !tools { continue }
            return candidate
        }
        return nil
    }

    static func validModule(_ m: String) -> Bool { m.range(of: #"^[A-Za-z_][A-Za-z0-9_.]*$"#, options: .regularExpression) != nil }

    /// A fresh, empty folder to run Python from, so nothing in the project or the film's folder can shadow a module.
    private static func emptyDirectory() -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("rasan-pycheck-" + UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static func python(_ need: ToolNeed, environment: [String: String]) async -> ToolCheck {
        let module = need.module ?? need.tool.replacingOccurrences(of: "-", with: "_")
        guard let python = pythonURL(environment: environment) else {
            return ToolCheck(found: false, checked: "looked for `python3` on the director's PATH", location: "", detail: "There is no usable python3 there, so a Python package can't be looked up.")
        }
        let top = String(module.split(separator: ".").first ?? "")
        guard validModule(module), !top.isEmpty else { return ToolCheck(found: false, checked: "checked the module name", location: "", detail: "`\(module)` is not a valid Python module name.") }
        // Never `import`: find_spec on the top-level name only reads the import machinery's paths. For the names that must never be loaded, package metadata.
        let viaMetadata = neverImport.contains(top.lowercased())
        let code = viaMetadata
            ? "import sys, importlib.metadata as m\nm.version(sys.argv[1])\nprint(sys.executable)"
            : "import sys, importlib.util\nif importlib.util.find_spec(sys.argv[1]) is None: raise SystemExit('No module named ' + repr(sys.argv[1]))\nprint(sys.executable)"
        var env = environment; env["PYTHONSAFEPATH"] = "1"; env["PYTHONDONTWRITEBYTECODE"] = "1"
        let dir = emptyDirectory(); defer { try? FileManager.default.removeItem(at: dir) }
        let run = await Shell.run(python, ["-c", code, viaMetadata ? need.tool : top], environment: env, directory: dir, timeout: 30)
        let checked = "asked `\(python.path)` whether the Python package `\(need.tool)` (module `\(top)`) is installed, without importing it"
        if run.status == 0 { return ToolCheck(found: true, checked: checked, location: python.path, detail: "") }
        let lines = run.output.split(whereSeparator: \.isNewline).map(String.init).filter { !$0.isEmpty }
        let reason = run.timedOut ? "It did not finish within 30 seconds." : (lines.last ?? "It exited with status \(run.status).")
        return ToolCheck(found: false, checked: checked, location: "", detail: reason)
    }

    private static func npm(_ need: ToolNeed, environment: [String: String]) async -> ToolCheck {
        let dirs = (environment["PATH"] ?? "").split(separator: ":").map(String.init)
        guard let node = dirs.map({ URL(fileURLWithPath: $0).appendingPathComponent("node") }).first(where: { FileManager.default.isExecutableFile(atPath: $0.path) }) else {
            return ToolCheck(found: false, checked: "looked for `node` on the director's PATH", location: "", detail: "Node is not on the director's PATH.")
        }
        let globalRoot = node.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("lib/node_modules").path
        let code = "try { console.log(require.resolve(process.argv[1] + '/package.json', { paths: [process.cwd(), process.argv[2]] })) } catch (e) { console.error(e.code || e.message); process.exit(1) }"
        let run = await Shell.run(node, ["-e", code, need.tool, globalRoot], environment: environment, timeout: 20)
        let checked = "asked `\(node.path)` to resolve the npm package `\(need.tool)`"
        if run.status == 0 { return ToolCheck(found: true, checked: checked, location: run.output.trimmingCharacters(in: .whitespacesAndNewlines), detail: "") }
        return ToolCheck(found: false, checked: checked, location: "", detail: run.output.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private static func app(_ need: ToolNeed) -> ToolCheck {
        let fm = FileManager.default, name = need.tool
        let roots = ["/Applications", fm.homeDirectoryForCurrentUser.appendingPathComponent("Applications").path]
        let names = [name, name.capitalized, name.replacingOccurrences(of: "-", with: " ").capitalized]
        for root in roots { for n in names where fm.fileExists(atPath: "\(root)/\(n).app") {
            return ToolCheck(found: true, checked: "looked for \(n).app in the Applications folders", location: "\(root)/\(n).app", detail: "")
        } }
        return ToolCheck(found: false, checked: "looked for \(name).app in /Applications and ~/Applications", location: "", detail: "It is not installed in either.")
    }
}

/// Studio-managed install of a Python package into the person's user Python (`python3 -m pip install --user`), after their yes. No sudo, no
/// Homebrew. On a Python that pip marks as externally managed (Homebrew's), the second attempt adds `--break-system-packages`, still into
/// the user's own folder, and says so.
public enum PythonInstaller {
    public struct Outcome: Sendable { public var ok: Bool; public var command: String; public var tail: String; public var usedBreak: Bool }

    public static func command(package: String, python: String = "python3", breaking: Bool = false, user: Bool = true) -> String {
        "\(python) -m pip install" + (user ? " --user" : "") + " --disable-pip-version-check" + (breaking ? " --break-system-packages" : "") + " \(package)"
    }

    public static func install(package: String, environment: [String: String], onLine: @escaping @Sendable (String) -> Void) async -> Outcome {
        guard package.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]*$"#, options: .regularExpression) != nil else {
            return Outcome(ok: false, command: "", tail: "`\(package)` is not a package name Studio will pass to pip.", usedBreak: false)
        }
        guard let python = ToolVerifier.pythonURL(environment: environment) else {
            return Outcome(ok: false, command: "", tail: "There is no usable python3 on the director's PATH, so pip can't run. Install Python (python.org) or Apple's command line tools first.", usedBreak: false)
        }
        var usedBreak = false
        // Inside a virtual environment pip refuses --user; there it installs into the environment itself.
        let probe = await Shell.run(python, ["-c", "import sys; print(sys.prefix != sys.base_prefix)"], environment: environment, timeout: 20)
        let inVenv = probe.output.contains("True")
        var args = ["-m", "pip", "install"] + (inVenv ? [] : ["--user"]) + ["--disable-pip-version-check", package]
        var run = await Shell.run(python, args, environment: environment, timeout: 900, onLine: onLine)
        if run.status != 0, !inVenv, run.output.contains("externally-managed-environment") {
            usedBreak = true; args.insert("--break-system-packages", at: args.count - 1)
            onLine("Python is managed by your system, so installing into your own user folder instead.")
            run = await Shell.run(python, args, environment: environment, timeout: 900, onLine: onLine)
        }
        let lines = run.output.split(whereSeparator: \.isNewline).map(String.init).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        let cmd = command(package: package, python: python.path, breaking: usedBreak, user: !inVenv)
        return Outcome(ok: run.status == 0, command: cmd, tail: run.timedOut ? "pip did not finish within 15 minutes." : lines.suffix(6).joined(separator: "\n"), usedBreak: usedBreak)
    }
}
