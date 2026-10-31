import StudioCore
import SwiftUI

// Taste memory, the native side. The engine (scripts/taste.mjs) writes the evidence; Studio reads it to show what RasanAI has
// learned ("Your taste" in Settings), lets the person forget an item, and sends the rating card after a film is accepted.

struct TasteItem: Identifiable, Equatable {
    let facet: String
    let value: String
    let weight: Double
    let films: Int
    var id: String { "\(facet):\(value)" }
    var label: String { "\(Self.names[facet] ?? facet): \(value.replacingOccurrences(of: "-", with: " "))" }
    static let names = ["style_world": "Style world", "carrier_kind": "Carrier", "story_shape": "Story shape", "device": "Device",
                        "sound_mode": "Sound mode", "music_source": "Music from", "move": "Move", "grammar": "Grammar", "pace": "Pace"]
}

struct TasteSnapshot: Equatable {
    var likes: [TasteItem] = []
    var dislikes: [TasteItem] = []
    var filmsRated = 0
    var isEmpty: Bool { likes.isEmpty && dislikes.isEmpty }
}

enum TasteStore {
    private static let halfLifeDays = 60.0
    private static let likeAt = 0.45

    static var home: URL {
        let env = ProcessInfo.processInfo.environment
        return ["RASANAI_HOME", "RASA_MOTION_HOME", "MOTION_DIRECTOR_HOME"].compactMap { env[$0] }.first { !$0.isEmpty }
            .map { URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".rasanai")
    }
    private static var forgottenURL: URL { home.appendingPathComponent("taste-forgotten.json") }

    private static func lines(_ name: String) -> [JSONValue] {
        guard let text = try? String(contentsOf: home.appendingPathComponent(name), encoding: .utf8) else { return [] }
        return text.split(whereSeparator: \.isNewline).compactMap { $0.data(using: .utf8).flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) } }
    }

    private static func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: text) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: text)
    }

    nonisolated static func forgotten() -> Set<String> {
        guard let data = try? Data(contentsOf: forgottenURL), let list = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return Set(list)
    }

    /// The same maths as taste.mjs `profile`: evidence decays by half every 60 days; an item is a like or a dislike once its net weight clears 0.45.
    nonisolated static func load(now: Date = Date()) -> TasteSnapshot {
        let gone = forgotten()
        struct Acc { var weight = 0.0; var films = Set<String>() }
        var items: [String: (facet: String, value: String, acc: Acc)] = [:]
        for row in lines("taste-memory.jsonl") {
            guard let facet = row["facet"].string, let value = row["value"].string, !value.isEmpty, TasteItem.names[facet] != nil,
                  !gone.contains("\(facet):\(value)") else { continue }
            let age = max(0, now.timeIntervalSince(date(row["ts"].string) ?? now) / 86_400)
            let weight = (row["w"].number ?? 0) * pow(0.5, age / halfLifeDays)
            var entry = items["\(facet):\(value)"] ?? (facet, value, Acc())
            entry.acc.weight += weight
            entry.acc.films.insert(row["film"].string ?? "")
            items["\(facet):\(value)"] = entry
        }
        let all = items.values.map { TasteItem(facet: $0.facet, value: $0.value, weight: ($0.acc.weight * 100).rounded() / 100, films: $0.acc.films.count) }
        return TasteSnapshot(likes: all.filter { $0.weight >= likeAt }.sorted { $0.weight > $1.weight },
                             dislikes: all.filter { $0.weight <= -likeAt }.sorted { $0.weight < $1.weight },
                             filmsRated: lines("taste-films.jsonl").count)
    }

    nonisolated static func forget(_ item: TasteItem) {
        var set = forgotten(); set.insert(item.id)
        try? FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(set.sorted()) { try? data.write(to: forgottenURL, options: .atomic) }
    }

    nonisolated static func forgetAll(_ snapshot: TasteSnapshot) {
        var set = forgotten()
        for item in snapshot.likes + snapshot.dislikes { set.insert(item.id) }
        try? FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(set.sorted()) { try? data.write(to: forgottenURL, options: .atomic) }
    }

    /// The film is already delivered, so the director may not be listening: ask the engine to read the rating line now (idempotent; best effort).
    @MainActor static func ingest(run: URL) async {
        guard let engine = DirectorRuntime.engineURL, let node = LessonStore.node else { return }
        let script = engine.appendingPathComponent("scripts/taste.mjs")
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = ([node.deletingLastPathComponent().path] + LocalAgent.searchDirectories).joined(separator: ":")
        environment["RASANAI_NO_UPDATE_CHECK"] = "1"
        let env = environment
        await Task.detached {
            let process = Process()
            process.executableURL = node
            process.arguments = [script.path, "ingest", "--run", run.path]
            process.environment = env
            process.standardInput = FileHandle.nullDevice; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
            guard (try? process.run()) != nil else { return }
            process.waitUntilExit()
        }.value
    }
}

// MARK: Your taste (Settings)

struct YourTasteView: View {
    @State private var taste = TasteSnapshot()
    @State private var loaded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if loaded && taste.isEmpty {
                Text("Nothing learned yet. Rate a film when it is done, and pick, pass and leave notes as you go: RasanAI leans toward what you like and away from what you do not, softly, and always shows you one idea outside it.")
                    .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if !taste.likes.isEmpty { group("You like", symbol: "hand.thumbsup.fill", tint: .green, items: taste.likes) }
            if !taste.dislikes.isEmpty { group("You tend to pass on", symbol: "hand.thumbsdown.fill", tint: .orange, items: taste.dislikes) }
            if !taste.isEmpty {
                HStack {
                    Text("\(taste.filmsRated) film\(taste.filmsRated == 1 ? "" : "s") rated. Older evidence counts for less.").font(.caption).foregroundStyle(.tertiary)
                    Spacer()
                    Button("Forget everything") { TasteStore.forgetAll(taste); reload() }.buttonStyle(.link).font(.caption)
                }
            }
        }
        .task { reload() }
    }

    private func reload() { taste = TasteStore.load(); loaded = true }

    private func group(_ title: String, symbol: String, tint: Color, items: [TasteItem]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: symbol).font(.system(size: 12, weight: .semibold)).foregroundStyle(tint)
            ForEach(items) { item in
                HStack(spacing: 8) {
                    Text(item.label).font(.system(size: 13)).lineLimit(1)
                    if item.films > 1 { Text("\(item.films) films").font(.system(size: 11)).foregroundStyle(.tertiary) }
                    Spacer(minLength: 6)
                    Button { TasteStore.forget(item); reload() } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                        .buttonStyle(.borderless).help("Forget this").accessibilityLabel("Forget \(item.label)")
                }
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.05)))
            }
        }
    }
}

// MARK: The rating card (after the film is accepted)

/// Three quick ratings and an optional line, on the finished film. Skippable, asked once per film. Sent through the console like any answer.
struct TasteRatingCard: View {
    let store: StudioStore
    @State private var story = 0
    @State private var picture = 0
    @State private var sound = 0
    @State private var note = ""
    @State private var state: CardState = .asking
    private enum CardState { case asking, thanks, hidden }

    private var key: String { "tasteRated:" + (store.runURL?.path ?? "") }

    var body: some View {
        Group {
            switch state {
            case .hidden: EmptyView()
            case .thanks:
                Label("Noted. The next film will lean on it.", systemImage: "checkmark.circle.fill").font(.system(size: 13)).foregroundStyle(.secondary)
                    .padding(.horizontal, Workspace.panelPadding).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
            case .asking: card
            }
        }
        .onAppear { if UserDefaults.standard.bool(forKey: key) { state = .hidden } }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("How did it turn out?").font(.system(size: 15, weight: .semibold))
                Text("RasanAI learns what you like").font(.system(size: 12)).foregroundStyle(.secondary)
                Spacer()
                Button("Skip") { UserDefaults.standard.set(true, forKey: key); withAnimation(.snappy) { state = .hidden } }.buttonStyle(.link).font(.system(size: 12))
            }
            HStack(alignment: .top, spacing: 28) {
                stars("Story", $story); stars("Picture", $picture); stars("Sound", $sound)
            }
            HStack(spacing: 10) {
                TextField("What felt cheap or wrong? (optional)", text: $note).textFieldStyle(.roundedBorder).font(.system(size: 13))
                Button("Send") { send() }.rasanButton(primary: true).disabled(story + picture + sound == 0 && note.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(Workspace.panelPadding).frame(maxWidth: .infinity, alignment: .leading).workspacePanel()
        .accessibilityElement(children: .contain).accessibilityLabel("Rate this film")
    }

    private func stars(_ title: String, _ value: Binding<Int>) -> some View {
        HStack(spacing: 8) {
            Text(title).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary).frame(width: 48, alignment: .leading)
            HStack(spacing: 3) {
                ForEach(1...5, id: \.self) { n in
                    Button { value.wrappedValue = value.wrappedValue == n ? 0 : n } label: {
                        Image(systemName: n <= value.wrappedValue ? "star.fill" : "star").font(.system(size: 17))
                            .foregroundStyle(n <= value.wrappedValue ? Color.turmeric : Color.secondary.opacity(0.55))
                    }
                    .buttonStyle(.plain).accessibilityLabel("\(title) \(n) star\(n == 1 ? "" : "s")")
                }
            }
        }
    }

    private func send() {
        var value: [String: JSONValue] = [:]
        for (k, n) in [("story", story), ("picture", picture), ("sound", sound)] where n > 0 { value[k] = .number(Double(n)) }
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty { value["note"] = .string(text) }
        guard let film = store.film else { return }
        let run = store.runURL
        Task {
            if await film.send(step: "final", type: "rate", value: .object(value), note: text) {
                UserDefaults.standard.set(true, forKey: key)
                withAnimation(.snappy) { state = .thanks }
                if let run { await TasteStore.ingest(run: run) }
            }
        }
    }
}
