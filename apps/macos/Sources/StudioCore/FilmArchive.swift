import Foundation

public struct FilmVersion: Identifiable, Sendable {
    public var id: String { number.identifier ?? "current" }
    public let number: JSONValue
    public let when: String?
    public let changes: [String]
    public let video: String?
}

extension SessionSnapshot {
    public var filmVersions: [FilmVersion] {
        var versions = final["versions"].array.compactMap { value -> FilmVersion? in
            guard value["v"].identifier != nil else { return nil }
            return FilmVersion(number: value["v"], when: value["when"].string,
                               changes: value["changes"].array.compactMap(\.string), video: value["video"].string)
        }
        if final["version"].identifier != nil, !versions.contains(where: { $0.id == final["version"].identifier }) {
            versions.append(FilmVersion(number: final["version"], when: nil, changes: final["changes"].array.compactMap(\.string), video: finalVideo))
        }
        var seen = Set<String>()
        return versions.filter { seen.insert($0.id).inserted }
    }
    public var filmChanges: [String] { final["changes"].array.compactMap(\.string) }
    public var captionFile: String? { final["srt"].string ?? final["captions_file"].string ?? final["subtitles"].string }
}

/// A disk snapshot for browsing a film without replacing the active director's connection.
public struct FilmArchive: Sendable {
    public let project: URL
    public let title: String
    public let draft: FilmDraft?
    public let run: URL?
    public let session: SessionSnapshot?
    public var resolver: AssetResolver? { run.map { AssetResolver(run: $0, workspace: project) } }
    public var video: URL? { resolver?.resolve(session?.finalVideo) }
    public var captions: URL? { resolver?.resolve(session?.captionFile) }
    public static func load(_ project: URL, library: ProjectLibrary) throws -> Self {
        let manifest = try library.read(project)
        let current = try? String(contentsOf: project.appendingPathComponent(".rasanai/current"), encoding: .utf8)
        let run = current.flatMap { value -> URL? in
            guard value.range(of: "^run-[A-Fa-f0-9-]+$", options: .regularExpression) != nil else { return nil }
            return project.appendingPathComponent(".rasanai/\(value)")
        }
        let session = run.flatMap { try? SessionSnapshot(data: Data(contentsOf: $0.appendingPathComponent("session.json"))) }
        return Self(project: project, title: manifest.name, draft: FilmDraft.load(in: project), run: run, session: session)
    }
}
