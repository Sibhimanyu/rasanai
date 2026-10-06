import AppKit
import StudioCore
import SwiftUI

/// `--snapshot <dir>`: renders each main screen at 1120x740, light and dark, from seeded fake data in a temp
/// folder. It draws the app's own windows into bitmaps; it never uses screen capture or the real library.
enum SnapshotHarness {
    static var directory: URL? {
        guard let index = CommandLine.arguments.firstIndex(of: "--snapshot"), CommandLine.arguments.count > index + 1 else { return nil }
        return URL(fileURLWithPath: CommandLine.arguments[index + 1], isDirectory: true)
    }
    /// `--snapshot-stages <dir> [--only a,b]`: renders every native stage from fixtures (see SnapshotFixtures.swift).
    static var stagesDirectory: URL? {
        guard let index = CommandLine.arguments.firstIndex(of: "--snapshot-stages"), CommandLine.arguments.count > index + 1 else { return nil }
        return URL(fileURLWithPath: CommandLine.arguments[index + 1], isDirectory: true)
    }
    static var onlyStages: Set<String>? {
        guard let index = CommandLine.arguments.firstIndex(of: "--only"), CommandLine.arguments.count > index + 1 else { return nil }
        return Set(CommandLine.arguments[index + 1].split(separator: ",").map(String.init))
    }
    static let sandbox: URL = {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("rasanai-snapshot-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()
    static var libraryRoot: URL { sandbox.appendingPathComponent("Library", isDirectory: true) }

    @MainActor static func isolatedSettings(root: URL? = nil) -> StudioSettings {
        let libraryRoot = root ?? Self.libraryRoot
        let suite = "rasanai-snapshot-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        defaults.set(libraryRoot.path, forKey: "projectRoot")
        defaults.set(true, forKey: "hasCompletedWelcome")
        // Readiness checks use local exit-code fixtures, never the user's provider CLIs.
        defaults.set("/usr/bin/true", forKey: "claudePath")
        defaults.set("/usr/bin/false", forKey: "codexPath")
        try? FileManager.default.createDirectory(at: libraryRoot, withIntermediateDirectories: true)
        return StudioSettings(defaults: defaults)
    }

    // MARK: Seed data

    struct Seed { var store: StudioStore; var films: [String: URL]; var brands: [Brand] }

    @MainActor static func makeSeed(films wanted: Bool) throws -> Seed {
        let settings = isolatedSettings(root: sandbox.appendingPathComponent("Library-\(UUID().uuidString.prefix(6))", isDirectory: true))
        let libraryRoot = URL(fileURLWithPath: settings.projectRoot, isDirectory: true)
        let store = StudioStore(settings: settings, demo: true)
        var urls: [String: URL] = [:]
        var brands: [Brand] = []
        if wanted {
            let library = settings.library
            try library.prepare()
            let assets = sandbox.appendingPathComponent("assets", isDirectory: true)
            try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
            let hues: [(String, [Double])] = [("launch", [0.62, 0.72]), ("trip", [0.08, 0.14]), ("founder", [0.33, 0.45]), ("trailer", [0.80, 0.9]), ("update", [0.55, 0.6]), ("reel", [0.02, 0.1])]
            var posters: [String: URL] = [:]
            for (key, pair) in hues {
                let url = assets.appendingPathComponent("\(key).png")
                try posterPNG(hueA: pair[0], hueB: pair[1]).write(to: url)
                posters[key] = url
            }
            func ago(_ hours: Double) -> Date { Date().addingTimeInterval(-hours * 3600) }
            let plan: [(String, FilmSummary, String?)] = [
                ("Spring launch film", FilmSummary(phase: .finished(45), poster: posters["launch"], stage: .final, updatedAt: ago(26), duration: 45, aspect: "16:9"), "launch"),
                ("Trip reel", FilmSummary(phase: .yourTurn("pick a story"), poster: posters["trip"], stage: .story, updatedAt: ago(0.4), duration: 30, aspect: "16:9"), "trip"),
                ("Founder story", FilmSummary(phase: .working, poster: posters["founder"], stage: .animatic, updatedAt: ago(0.05), duration: 60, aspect: "16:9"), "founder"),
                ("Podcast trailer", FilmSummary(phase: .draft, poster: nil, updatedAt: ago(70), duration: 45, aspect: "9:16"), nil),
                ("Quarterly update", FilmSummary(phase: .needsAttention, poster: posters["update"], stage: .look, updatedAt: ago(5), duration: 45, aspect: "1:1"), "update"),
                ("Customer reel", FilmSummary(phase: .finished(30), poster: posters["reel"], stage: .final, updatedAt: ago(200), duration: 30, aspect: "9:16"), "reel"),
            ]
            for (name, summary, _) in plan {
                let folder = try library.create(name: name)
                urls[name] = folder
                store.summaries[folder] = summary
                try FilmDraft(brief: "A calm, confident film about \(name.lowercased()). Show the product in use, keep the pace unhurried, and end on a clear call to action.", duration: 45, aspect: "16:9", agent: "claude", motionLevel: "maximal", brand: name == "Spring launch film" ? "Northwind" : nil).save(in: folder)
            }
            store.localProjects = try library.projects()
            let summaryByName = Dictionary(uniqueKeysWithValues: plan.map { ($0.0, $0.1) })
            store.summaries = [:]
            urls = [:]
            for (project, folder) in store.localProjects {
                urls[project.name] = folder
                store.summaries[folder] = summaryByName[project.name]
            }
            // Brands
            let design1 = sandbox.appendingPathComponent("northwind.md")
            try """
            # Northwind
            ## Colours
            - Ink: #14213D
            - Sea: #1F7A8C
            - Sand: #F4E9CD
            - Coral: #EE6C4D
            - Mist: #E0FBFC
            ## Typography
            font-family: "Fraunces", serif
            Body: Inter
            ## Motion
            Unhurried, eased, never bouncy.
            """.write(to: design1, atomically: true, encoding: .utf8)
            let design2 = sandbox.appendingPathComponent("mono.md")
            try """
            # Mono Atelier
            ## Colours
            - Black: #0A0A0A
            - Bone: #F2F0EB
            - Signal: #FF4F00
            - Graphite: #3A3A3C
            ## Typography
            Display: Space Grotesk
            ## Motion
            Hard cuts and quick snaps.
            """.write(to: design2, atomically: true, encoding: .utf8)
            brands = [try BrandLibrary.create(name: "Northwind", importing: design1, logo: nil, in: libraryRoot),
                      try BrandLibrary.create(name: "Mono Atelier", importing: design2, logo: nil, in: libraryRoot)]
            // A draft with files, and a finished film with a run
            if let trip = urls["Podcast trailer"] {
                try? FileManager.default.createDirectory(at: trip.appendingPathComponent("assets/sources"), withIntermediateDirectories: true)
                for file in ["interview-raw.mov", "cover-art.png", "show-notes.pdf"] {
                    _ = try? Data("demo".utf8).write(to: trip.appendingPathComponent("assets/sources/\(file)"))
                }
            }
        }
        return Seed(store: store, films: urls, brands: brands)
    }

    @MainActor static func loadFinished(into store: StudioStore, film: URL, poster: URL) throws {
        let run = film.appendingPathComponent(".rasanai/run-00000000-0000-0000-0000-000000000001", isDirectory: true)
        try FileManager.default.createDirectory(at: run, withIntermediateDirectories: true)
        try Data("demo".utf8).write(to: run.appendingPathComponent("final.mp4"))
        try FileManager.default.copyItem(at: poster, to: run.appendingPathComponent("poster.png"))
        let json = """
        {"title":"Spring launch film","current":"render","steps":{"brief":{"fields":{"aspect":"16:9","length_s":45}},
        "render":{"status":"done","video":"final.mp4","duration":45,"scenes":[{"id":1,"start":0,"duration":45,"frame":"poster.png"}]}}}
        """
        store.snapshot = try SessionSnapshot(data: Data(json.utf8))
        store.runURL = run; store.workspaceURL = run
        store.selectedProjectURL = film; store.loadedFilm = film
        store.isSample = false
    }

    // MARK: Run

    @MainActor static func run(into directory: URL) async {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let size = CGSize(width: 1120, height: 740)
        do {
            for dark in [false, true] {
                let suffix = dark ? "-dark" : ""
                func shot<V: View>(_ name: String, _ view: V, titled: Bool = true, title: String = "RasanAI", size: CGSize = size, push: (() -> Void)? = nil) async {
                    await capture(view, size: size, dark: dark, titled: titled, title: title, to: directory.appendingPathComponent("\(name)\(suffix).png"), push: push)
                }
                let full = try makeSeed(films: true)
                let empty = try makeSeed(films: false)

                await shot("home", StudioView(store: full.store))
                await shot("home-empty", StudioView(store: empty.store))

                let recovered = try makeSeed(films: false)
                recovered.store.settings.saveEditorDraft(FilmEditorDraft(name: "Launch film", film: FilmDraft(brief: "A 30-second launch film for our app.", duration: 30), sources: []), for: nil)
                await shot("home-recovered-draft", StudioView(store: recovered.store))
                await shot("editor-recovered-draft", StudioView(store: recovered.store)) { recovered.store.path = [.newFilm(nil)] }

                let starting = try makeSeed(films: false)
                starting.store.runtime.isPreparing = true
                starting.store.runtime.startedAt = Date().addingTimeInterval(-4)
                starting.store.runtime.status = "Opening the review workspace…"
                await shot("film-starting", StartingView(runtime: starting.store.runtime), title: "Starting film")

                let failed = try makeSeed(films: true)
                if let film = failed.films["Quarterly update"] {
                    failed.store.loadedFilm = film; failed.store.selectedProjectURL = film
                    failed.store.runURL = film.appendingPathComponent(".rasanai/run-fixture")
                    failed.store.runtime.lastExitCode = 1
                    failed.store.runtime.recovery = .signIn
                    failed.store.runtime.logURL = film.appendingPathComponent(".rasanai/director.log")
                    await shot("film-recovery", StudioView(store: failed.store)) { failed.store.path = [.film(film)] }
                }

                let needs = try makeSeed(films: true)
                let keep: Set<String> = ["Trip reel", "Spring launch film", "Podcast trailer"]
                needs.store.localProjects = needs.store.localProjects.filter { keep.contains($0.0.name) }
                await shot("home-needs-you", StudioView(store: needs.store))

                let progress = try makeSeed(films: false)
                progress.store.runtime.startedAt = Date().addingTimeInterval(-74)
                progress.store.snapshot = try SessionSnapshot(data: Data("{\"title\":\"Film progress\",\"current\":\"look\",\"steps\":{\"look\":{\"status\":\"working\"}},\"activity\":[{\"msg\":\"Writing three story directions from your brief.\"}]}".utf8))
                await shot("film-progress", VStack(spacing: 0) { FilmStageBar(current: progress.store.snapshot.stage); DirectorProgressView(store: progress.store); Spacer(minLength: 0) }.background(Color(nsColor: .windowBackgroundColor)), titled: false, size: CGSize(width: 900, height: 150))

                // RASANAI_SNAPSHOT_FILES: optional folder of real sample files, so the rows show true sizes and thumbnails.
                let realFiles = ProcessInfo.processInfo.environment["RASANAI_SNAPSHOT_FILES"].map { URL(fileURLWithPath: $0, isDirectory: true) }
                let newFilmFiles = ["interview-raw.mov", "cover-art.png"].map { name -> URL in
                    if let real = realFiles?.appendingPathComponent(name), FileManager.default.fileExists(atPath: real.path) { return real }
                    let url = sandbox.appendingPathComponent(name); try? Data("demo".utf8).write(to: url); return url
                }
                full.store.settings.saveEditorDraft(FilmEditorDraft(name: "Northwind launch film", film: FilmDraft(brief: "A 45-second launch film for Northwind, our budgeting app. Calm, confident, a little playful.", duration: 45, motionLevel: "balanced", brand: "Northwind"), sources: newFilmFiles), for: nil)
                await shot("new-film", StudioView(store: full.store)) { full.store.path = [.newFilm(nil)] }

                if let draft = full.films["Podcast trailer"] {
                    full.store.selectedProjectURL = draft; full.store.loadedFilm = draft; full.store.filmDraftProject = draft
                    full.store.projectSources = (try? ProjectSources.files(in: draft)) ?? []
                    await shot("film-draft", StudioView(store: full.store)) { full.store.path = [.film(draft)] }
                }
                let done = try makeSeed(films: true)
                if let film = done.films["Spring launch film"], let poster = done.store.summaries[film]?.poster {
                    try loadFinished(into: done.store, film: film, poster: poster)
                    done.store.filmNotes[film] = [FilmNote(time: 12, text: "Hold the closing title a beat longer."), FilmNote(time: 40, text: "The music drops too early here.")]
                    await shot("film-finished", StudioView(store: done.store)) { done.store.path = [.film(film)] }
                    await shot("film-finished-notes", StudioView(store: done.store), size: CGSize(width: 1120, height: 1250)) { done.store.path = [.film(film)] }
                }
                let fresh = try makeSeed(films: true)
                await shot("brands", StudioView(store: fresh.store)) { fresh.store.path = [.brands] }
                if !fresh.brands.isEmpty {
                    let second = try makeSeed(films: true)
                    let target = second.brands[0].folder
                    await shot("brand", StudioView(store: second.store)) { second.store.path = [.brands, .brand(target)] }
                }
                let welcome = try makeSeed(films: false)
                await shot("welcome", WelcomeView(store: welcome.store), titled: false, size: CGSize(width: 480, height: 640))
                await shot("settings-general", StudioSettingsView(settings: welcome.store.settings), titled: false, size: CGSize(width: 520, height: 470))
                await shot("settings-director", StudioSettingsView(settings: welcome.store.settings, initialTab: "director"), titled: false, size: CGSize(width: 520, height: 500))
            }
        } catch {
            FileHandle.standardError.write(Data("Snapshot failed: \(error)\n".utf8))
        }
        try? FileManager.default.removeItem(at: sandbox)
    }

    // MARK: Rendering

    @MainActor static func capture<V: View>(_ view: V, size: CGSize, dark: Bool, titled: Bool, title: String = "RasanAI", to url: URL, push: (() -> Void)? = nil) async {
        let controller = NSHostingController(rootView: view)
        let window = NSWindow(contentViewController: controller)
        window.styleMask = titled ? [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView] : [.titled, .closable]
        window.title = title
        window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        window.setContentSize(size)
        window.setFrameOrigin(NSPoint(x: 60, y: 60))
        window.alphaValue = 0.01
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        window.makeKey()
        if let push { try? await Task.sleep(for: .milliseconds(700)); push() }
        try? await Task.sleep(for: .milliseconds(1400))
        window.contentView?.layoutSubtreeIfNeeded()
        if let frame = window.contentView?.superview {
            let rep = frame.bitmapImageRepForCachingDisplay(in: frame.bounds)
            if let rep {
                frame.cacheDisplay(in: frame.bounds, to: rep)
                try? rep.representation(using: .png, properties: [:])?.write(to: url)
            }
        }
        window.contentViewController = nil
        window.close()
    }

    static func posterPNG(hueA: Double, hueB: Double) -> Data {
        let w = 640, h = 360
        let space = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return Data() }
        let a = NSColor(hue: hueA, saturation: 0.55, brightness: 0.85, alpha: 1).cgColor
        let b = NSColor(hue: hueB, saturation: 0.7, brightness: 0.45, alpha: 1).cgColor
        if let gradient = CGGradient(colorsSpace: space, colors: [a, b] as CFArray, locations: [0, 1]) {
            ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: w, y: h), options: [])
        }
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.22).cgColor)
        ctx.fillEllipse(in: CGRect(x: w - 220, y: h - 200, width: 260, height: 260))
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.18).cgColor)
        ctx.fill(CGRect(x: 40, y: 40, width: 200, height: 14))
        guard let image = ctx.makeImage() else { return Data() }
        return NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) ?? Data()
    }
}
