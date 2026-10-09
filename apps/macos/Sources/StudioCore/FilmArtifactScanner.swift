import Foundation

/// A critic's written report (`<run>/crew/critic-<lens>-<round>.json`).
public struct CriticReport: Codable, Equatable, Sendable {
    public struct Finding: Codable, Equatable, Sendable {
        public var scene: String?
        public var severity: String?
        public var problem: String
        public var fix: String?
    }
    public var lens: String
    public var round: Int
    /// "fix" or "pass".
    public var verdict: String
    public var findings: [Finding]
    public var time: Date
}

/// What the project folder holds right now. Produced by `FilmArtifactScanner.scan`.
public struct FilmArtifacts: Codable, Equatable, Sendable {
    /// Key frames, specimens and storyboard images, oldest first, one per scene.
    public var keyframes: [KeyframeThumb] = []
    public var drafts: [DraftRender] = []
    public var finalVideo: URL?
    public var poster: URL?
    public var criticReports: [CriticReport] = []
    /// The newest real scene frame (a key frame or storyboard frame, never an animator contact sheet, debug or check image),
    /// and each scene's latest one by scene id.
    public var newestStill: URL?
    public var sceneStills: [String: URL] = [:]
    /// How many scenes (so key frames) the film plans, read from the run's scene list or crew plan. Nil when nothing says.
    public var plannedSceneCount: Int?
    public init() {}
}

/// Reads the project folder for artifacts the progress screen shows. Cheap enough to poll every 2 s
/// (a handful of directory listings and `stat` calls, no file contents except the small critic reports).
public enum FilmArtifactScanner {
    /// `<project>/.rasanai/run-X` to `<project>`; nil for a run that lives somewhere else.
    public static func project(forRun run: URL) -> URL? {
        let parent = run.deletingLastPathComponent()
        return parent.lastPathComponent == ".rasanai" ? parent.deletingLastPathComponent() : nil
    }

    /// `asOf`: ignore files modified after this time (the DEBUG replay uses it to show a film as it was).
    public static func scan(project: URL?, run: URL?, asOf: Date? = nil) -> FilmArtifacts {
        var found = FilmArtifacts()
        let fm = FileManager.default
        func files(in directory: URL, ext: Set<String>) -> [(url: URL, date: Date, size: Int64)] {
            guard let names = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey], options: [.skipsHiddenFiles]) else { return [] }
            return names.compactMap { url in
                guard ext.contains(url.pathExtension.lowercased()),
                      let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
                      let date = values.contentModificationDate else { return nil }
                if let asOf, date > asOf { return nil }
                return (url, date, Int64(values.fileSize ?? 0))
            }.sorted { $0.date < $1.date }
        }
        func sceneID(_ name: String) -> String? {
            let stem = (name as NSString).deletingPathExtension
            let trimmed = stem.hasPrefix("s") ? String(stem.dropFirst()) : stem
            return Int(trimmed) != nil ? trimmed : nil
        }

        var frames: [String: KeyframeThumb] = [:]
        // Real scene frames only: `N.png` / `sN.png` under run/frames and the project's assets/keyframes. Names such as
        // `1-overview.png`, `1-move.png`, `contact-*.png`, `debug-*.png` or `*-check.png` never match `sceneID`.
        var latest: [String: (url: URL, date: Date)] = [:]
        func addFrame(_ file: (url: URL, date: Date, size: Int64), kind: KeyframeThumb.Kind) {
            let name = file.url.lastPathComponent
            guard let scene = sceneID(name) else { return }
            if latest[scene].map({ $0.date < file.date }) ?? true { latest[scene] = (file.url, file.date) }
            if let existing = frames[scene], existing.addedAt <= file.date { return }
            frames[scene] = KeyframeThumb(id: "kf-\(scene)", label: "Key frame \(scene)", kind: kind, url: file.url, addedAt: file.date, sceneID: scene)
        }
        if let run {
            for file in files(in: run.appendingPathComponent("frames"), ext: ["png"]) { addFrame(file, kind: .keyframe) }
            if let designs = try? fm.contentsOfDirectory(at: run.appendingPathComponent("design"), includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
                for dir in designs.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
                    let specimen = dir.appendingPathComponent("specimen.png")
                    guard let values = try? specimen.resourceValues(forKeys: [.contentModificationDateKey]), let date = values.contentModificationDate else { continue }
                    if let asOf, date > asOf { continue }
                    found.keyframes.append(KeyframeThumb(id: "specimen-\(dir.lastPathComponent)", label: "\(dir.lastPathComponent) look", kind: .specimen, url: specimen, addedAt: date))
                }
            }
            found.plannedSceneCount = plannedSceneCount(run: run, asOf: asOf)
            let crewFiles = (try? fm.contentsOfDirectory(at: run.appendingPathComponent("crew"), includingPropertiesForKeys: [.contentModificationDateKey], options: [.skipsHiddenFiles])) ?? []
            for url in crewFiles where url.lastPathComponent.hasPrefix("critic-") && url.pathExtension == "json" {
                let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? Date()
                if let asOf, date > asOf { continue }
                if let report = criticReport(at: url, time: date) { found.criticReports.append(report) }
            }
            found.criticReports.sort { ($0.time, $0.lens) < ($1.time, $1.lens) }
        }
        if let project {
            let videos = project.appendingPathComponent("videos")
            let films = (try? fm.contentsOfDirectory(at: videos, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? []
            for film in films.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
                for file in files(in: film.appendingPathComponent("assets/keyframes"), ext: ["png"]) { addFrame(file, kind: .keyframe) }
                for file in files(in: film.appendingPathComponent("renders"), ext: ["mp4"]) {
                    let stem = (file.url.lastPathComponent as NSString).deletingPathExtension
                    if stem == "final" { found.finalVideo = file.url; continue }
                    found.drafts.append(DraftRender(id: "draft-\(stem)", name: stem, url: file.url, finishedAt: file.date, sizeBytes: file.size))
                }
                let poster = film.appendingPathComponent("renders/poster.png")
                if fm.fileExists(atPath: poster.path), found.finalVideo != nil || asOf == nil { found.poster = poster }
            }
            found.drafts.sort { $0.finishedAt < $1.finishedAt }
        }
        found.sceneStills = latest.mapValues(\.url)
        found.newestStill = latest.values.max { ($0.date, $0.url.path) < ($1.date, $1.url.path) }?.url
        found.keyframes += frames.values.sorted { ($0.addedAt, $0.id) < ($1.addedAt, $1.id) }
        found.keyframes.sort { ($0.addedAt, $0.id) < ($1.addedAt, $1.id) }
        return found
    }

    /// The scene count the film plans: the run's `scenes.json` / `plan/timeline.json` scene list, else `crew/plan.json`'s `scenes`.
    static func plannedSceneCount(run: URL, asOf: Date?) -> Int? {
        let fm = FileManager.default
        func object(_ path: String) -> [String: Any]? {
            let url = run.appendingPathComponent(path)
            if let asOf, let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate, date > asOf { return nil }
            guard fm.fileExists(atPath: url.path), let data = try? Data(contentsOf: url) else { return nil }
            return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        }
        for path in ["scenes.json", "plan/timeline.json", "animatic.json"] {
            if let count = (object(path)?["scenes"] as? [Any])?.count, count > 0 { return count }
        }
        if let count = object("crew/plan.json")?["scenes"] as? Int, count > 0 { return count }
        return nil
    }

    static func criticReport(at url: URL, time: Date) -> CriticReport? {
        guard let data = try? Data(contentsOf: url), let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        let findings = (object["findings"] as? [[String: Any]] ?? []).compactMap { item -> CriticReport.Finding? in
            guard let problem = item["problem"] as? String else { return nil }
            let scene = (item["scene"] as? Int).map(String.init) ?? (item["scene"] as? String)
            return CriticReport.Finding(scene: scene, severity: item["severity"] as? String, problem: problem, fix: item["fix"] as? String)
        }
        let lens = object["lens"] as? String ?? url.deletingPathExtension().lastPathComponent.split(separator: "-").dropFirst().first.map(String.init) ?? "film"
        return CriticReport(lens: lens, round: object["round"] as? Int ?? 1, verdict: object["verdict"] as? String ?? (findings.isEmpty ? "pass" : "fix"), findings: findings, time: time)
    }
}
