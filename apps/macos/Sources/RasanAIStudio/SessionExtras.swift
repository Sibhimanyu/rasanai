import AppKit
import Foundation
import StudioCore
import SwiftUI

// What the skill records beyond the calls themselves, shown in the Decisions inspector and on the Final page:
//   session.json  steps.<id>.decisions_history [{decision, at, replaced_by, because}]   (console.mjs push, a swapped call)
//                 downgrades [{t, what, instead, why, impact?}]                           (lib/downgrade.mjs -> console.mjs push)
//   run folder    crew/ab-<n>.json (verdict {result: keep|revert, pick, loses_on, scores}) + crew/ab-<n>-verdict.json (reasons)
//                 crew/motion-gate.json (measured.emphasis/echo/camera/carry/text_fit), a frame-gate result with film.boldness
//                 (crew/*frame-gate*.json or frames/gate.json), crew/sound*.json (warnings)
//   ~/.rasanai/lessons.jsonl  (or $RASANAI_HOME): the user's rules and Claude's own notes; `lessons.mjs drop --id` removes one.
// Read-only except the lesson drop. Nothing here is a second writer of session.json.

// MARK: Session

/// An older call on a step that was replaced, with the reason it lost.
struct DecisionHistoryEntry: Identifiable, Equatable {
    let id: Int
    let decision: String
    let because: String
    let replacedBy: String
}

/// A fallback a script took ("Working without X: using Y").
struct DowngradeRow: Identifiable, Equatable {
    let id: Int
    let what: String
    let instead: String
    let why: String
    let impact: String
}

extension SessionSnapshot {
    /// The calls this step used to have, oldest first (struck through under the current one).
    func decisionHistory(step name: String) -> [DecisionHistoryEntry] {
        step(name)["decisions_history"].array.enumerated().compactMap { index, entry in
            guard let old = entry["decision"].string, !old.isEmpty else { return nil }
            return DecisionHistoryEntry(id: index, decision: old, because: entry["because"].string ?? "", replacedBy: entry["replaced_by"].string ?? "")
        }
    }
    /// Fallbacks recorded in `session.downgrades`, newest first. A row with a `kind` (a routine adjustment such as a Fast pace
    /// shortcut) is not a downgrade: it shows only as a quiet adjustment on the working screen.
    var downgrades: [DowngradeRow] {
        raw["downgrades"].array.enumerated().compactMap { index, entry in
            guard let what = entry["what"].string, let instead = entry["instead"].string, (entry["kind"].string ?? "").isEmpty else { return nil }
            return DowngradeRow(id: index, what: what, instead: instead, why: entry["why"].string ?? "", impact: entry["impact"].string ?? "")
        }.reversed()
    }
}

// MARK: Lessons

struct LessonRow: Identifiable, Equatable {
    let id: String
    let rule: String
    let quote: String
    let area: String
    let seen: Int
    /// True for a note Claude wrote itself after a film; false for the person's own rule.
    let isOwn: Bool
    /// "text.statement_min_h = 0.05" when the rule is also a measured check.
    let gate: String?
}

enum LessonStore {
    static var fileURL: URL {
        let env = ProcessInfo.processInfo.environment
        let home = ["RASANAI_HOME", "RASA_MOTION_HOME", "MOTION_DIRECTOR_HOME"].compactMap { env[$0] }.first { !$0.isEmpty }
            .map { URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".rasanai")
        return home.appendingPathComponent("lessons.jsonl")
    }

    /// The rows of lessons.jsonl (user's first, then Claude's own), or none when there is no file.
    nonisolated static func load() -> [LessonRow] {
        guard let text = try? String(contentsOf: fileURL, encoding: .utf8) else { return [] }
        let rows = text.split(whereSeparator: \.isNewline).compactMap { line -> LessonRow? in
            guard let data = line.data(using: .utf8), let row = try? JSONDecoder().decode(JSONValue.self, from: data),
                  let id = row["id"].string, let rule = row["rule"].string else { return nil }
            let gate = row["gate"]["key"].string.map { key in "\(key) = \(row["gate"]["value"].number.map { String(format: "%g", $0) } ?? "?")" }
            return LessonRow(id: id, rule: rule, quote: row["quote"].string ?? "", area: row["area"].string ?? "", seen: Int(row["seen"].number ?? 1),
                             isOwn: row["source"].string == "self", gate: gate)
        }
        return rows.filter { !$0.isOwn } + rows.filter(\.isOwn)
    }

    /// Where a Node binary lives for the skill's scripts: the bundled one, Studio's managed one, then the usual folders.
    nonisolated static var node: URL? {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("Runtime/node/bin/node").path
        let paths = [bundled, home + "/.rasanai/node/bin/node"].compactMap { $0 } + LocalAgent.searchDirectories.map { $0 + "/node" }
        return paths.first { FileManager.default.isExecutableFile(atPath: $0) }.map { URL(fileURLWithPath: $0) }
    }

    /// `node scripts/lessons.mjs drop --id <id>` from the engine the Studio ships; the same script the director runs.
    @MainActor static func drop(_ id: String) async -> Bool {
        guard let engine = DirectorRuntime.engineURL, let node else { return false }
        let script = engine.appendingPathComponent("scripts/lessons.mjs")
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = ([node.deletingLastPathComponent().path] + LocalAgent.searchDirectories).joined(separator: ":")
        environment["RASANAI_NO_UPDATE_CHECK"] = "1"
        let env = environment
        return await Task.detached { () -> Bool in
            let process = Process()
            process.executableURL = node
            process.arguments = [script.path, "drop", "--id", id]
            process.environment = env
            process.standardInput = FileHandle.nullDevice; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
            guard (try? process.run()) != nil else { return false }
            process.waitUntilExit()
            return process.terminationStatus == 0
        }.value
    }
}

// MARK: The run's checks (A/B rounds and gate numbers)

struct ABRound: Identifiable, Equatable {
    let id: Int
    /// "keep" (the new version won), "revert" (it lost) or nil (not judged yet).
    let result: String?
    let loses: String
    let reasons: [String]
}

struct GateNumber: Identifiable, Equatable {
    var id: String { label }
    let label: String
    let value: String
    /// True when the check warned or missed its bar, so the row is drawn as a caution.
    var caution = false
}

struct RunChecks: Equatable {
    var rounds: [ABRound] = []
    var numbers: [GateNumber] = []
    var isEmpty: Bool { rounds.isEmpty && numbers.isEmpty }

    /// Reads the run's crew/ and frames/ files; every number is shown only when its gate wrote it.
    nonisolated static func load(run: URL) -> RunChecks {
        let crew = run.appendingPathComponent("crew")
        func json(_ url: URL) -> JSONValue? { (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) } }
        let names = ((try? FileManager.default.contentsOfDirectory(atPath: crew.path)) ?? []).sorted()
        func newest(_ matches: (String) -> Bool) -> [JSONValue] {
            names.filter { $0.hasSuffix(".json") && matches($0.lowercased()) }.compactMap { name -> (Date, JSONValue)? in
                let url = crew.appendingPathComponent(name)
                let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                return json(url).map { (date, $0) }
            }.sorted { $0.0 > $1.0 }.map(\.1)
        }

        var out = RunChecks()
        // A/B rounds, in order
        out.rounds = names.compactMap { name -> ABRound? in
            guard name.range(of: #"^ab-(\d+)\.json$"#, options: .regularExpression) != nil, let n = Int(name.dropFirst(3).dropLast(5)),
                  let record = json(crew.appendingPathComponent(name)) else { return nil }
            let reasons = json(crew.appendingPathComponent("ab-\(n)-verdict.json"))?["reasons"].array.compactMap(\.string) ?? []
            return ABRound(id: n, result: record["verdict"]["result"].string, loses: record["verdict"]["loses_on"].string ?? "", reasons: reasons)
        }.sorted { $0.id < $1.id }

        // the motion gate: emphasis, echo, camera, carry, text
        if let gate = json(crew.appendingPathComponent("motion-gate.json")) {
            let m = gate["measured"]
            let findings = gate["findings"].array
            let warned = { (prefix: String) in findings.contains { ($0["check"].string ?? "").hasPrefix(prefix) } }
            if let peak = m["emphasis"]["measured_peak"]["t"].number {
                let planned = m["emphasis"]["planned_peak"]
                let plan = planned["t0"].number.flatMap { t0 in planned["t1"].number.map { t1 in String(format: "planned %.1f–%.1f s", t0, t1) } } ?? "planned peak unknown"
                out.numbers.append(GateNumber(label: "Emphasis peak", value: String(format: "measured %.1f s, ", peak) + plan, caution: warned("emphasis")))
            }
            if let echo = m["echo"]["score"].number {
                out.numbers.append(GateNumber(label: "Echo", value: String(format: "%.2f", echo) + (m["echo"]["need"].number.map { String(format: " (rhymes from %.2f)", $0) } ?? ""),
                                              caution: warned("no-echo") || warned("echo-identical")))
            }
            let kinds = m["camera"]["kinds"].array.compactMap(\.string)
            if !kinds.isEmpty {
                out.numbers.append(GateNumber(label: "Camera", value: Array(Set(kinds)).sorted().joined(separator: ", "), caution: warned("camera-monotone")))
            }
            if let share = m["carry"]["carried_share"].number {
                out.numbers.append(GateNumber(label: "Carry", value: "\(Int((share * 100).rounded()))% of seams" + (m["carry"]["need"].number.map { " (\(Int(($0 * 100).rounded()))% needed)" } ?? ""),
                                              caution: warned("carry")))
            }
            let text = findings.filter { ($0["check"].string ?? "").hasPrefix("text-") }.count
            if m["text_fit"] != .null || text > 0 {
                out.numbers.append(GateNumber(label: "Text findings", value: "\(text)", caution: text > 0))
            }
        }

        // the frame gate on the film: boldness share and where the big moments land
        let frameResults = newest { $0.contains("frame-gate") || $0.contains("boldness") } + [json(run.appendingPathComponent("frames/gate.json"))].compactMap { $0 }
        if let bold = frameResults.map({ $0["film"]["boldness"] }).first(where: { $0["bigShare"].number != nil }), let share = bold["bigShare"].number {
            var value = "\(Int((share * 100).rounded()))% of frames"
            if let covered = bold["placed"]["covered"].number { value += ", \(Int(covered)) of \(bold["placed"]["beats"].array.count) peak beats big" }
            let placedOK = bold["placed"]["peakCovered"] != .bool(false)
            out.numbers.insert(GateNumber(label: "Boldness", value: value, caution: bold["placed"] == .null ? share < 0.25 : !placedOK), at: 0)
        }

        // the sound check's warnings
        if let sound = newest({ $0.contains("sound") }).first, sound["warnings"] != .null {
            let count = sound["warnings"].array.count
            out.numbers.append(GateNumber(label: "Sound warnings", value: "\(count)", caution: count > 0))
        }
        return out
    }
}

// MARK: Views

/// Under a decision: the calls it replaced, struck through, each with the reason it lost.
struct DecisionHistoryView: View {
    let entries: [DecisionHistoryEntry]
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(entries) { entry in
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.decision).strikethrough().font(.system(size: 11)).foregroundStyle(.secondary)
                        .lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                    if !entry.because.isEmpty {
                        Text("because \(entry.because)").font(.system(size: 11)).foregroundStyle(.tertiary)
                            .lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Earlier calls: " + entries.map { "\($0.decision), because \($0.because)" }.joined(separator: "; "))
    }
}

/// "Working without": what a script could not do and what it did instead.
struct DowngradesSection: View {
    let rows: [DowngradeRow]
    var body: some View {
        ForEach(rows) { row in
            VStack(alignment: .leading, spacing: 3) {
                Label(row.what, systemImage: "exclamationmark.triangle").font(.system(size: 12, weight: .medium))
                Text("Using \(row.instead)" + (row.why.isEmpty ? "" : " because \(row.why)")).font(.system(size: 12)).foregroundStyle(.secondary)
                    .lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                if !row.impact.isEmpty {
                    Text(row.impact).font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 3)
            .accessibilityElement(children: .combine)
        }
    }
}

/// One lesson row with its drop action.
struct LessonRowView: View {
    let row: LessonRow
    let agent: String
    let drop: () -> Void
    @State private var hovering = false
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(row.area.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.5).foregroundStyle(.secondary)
                Spacer()
                Text(row.isOwn ? "\(agent)'s own" : "You")
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background((row.isOwn ? Color.secondary : Color.rasan).opacity(0.15), in: Capsule())
                    .foregroundStyle(row.isOwn ? Color.secondary : Color.rasan)
            }
            Text(row.rule).font(.system(size: 12)).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                if row.seen > 1 { Text("seen \(row.seen) times").font(.system(size: 11)).foregroundStyle(.tertiary) }
                if let gate = row.gate { Text("checked: \(gate)").font(.system(size: 11)).foregroundStyle(.tertiary) }
                Spacer()
                Button("Drop", role: .destructive, action: drop).buttonStyle(.link).font(.system(size: 11)).opacity(hovering ? 1 : 0.75)
                    .accessibilityLabel("Drop the lesson: \(row.rule)")
            }
        }
        .padding(.vertical, 4)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .contain)
    }
}

/// The Final page's checks: each fix round's blind A/B and the gate numbers worth a glance. Hidden when the run holds neither.
struct RunChecksView: View {
    let checks: RunChecks
    @Environment(\.agentName) private var agent
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !checks.rounds.isEmpty {
                VStack(alignment: .leading, spacing: 9) {
                    StageSectionTitle("Fix rounds, judged blind")
                    ForEach(checks.rounds) { round in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Image(systemName: round.result == "keep" ? "checkmark.circle.fill" : round.result == "revert" ? "arrow.uturn.backward.circle.fill" : "circle.dashed")
                                    .foregroundStyle(round.result == "keep" ? Color.green : round.result == "revert" ? Color.orange : Color.secondary)
                                Text("Round \(round.id): " + (round.result == "keep" ? "kept" : round.result == "revert" ? "reverted" : "not judged yet"))
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            ForEach(round.reasons.indices, id: \.self) { index in
                                Text(round.reasons[index]).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                            }
                            if round.result == "revert", !round.loses.isEmpty {
                                Text("The new version lost on: \(round.loses)").font(.system(size: 11)).foregroundStyle(.tertiary).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            if !checks.numbers.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    StageSectionTitle("The numbers")
                    ForEach(checks.numbers) { number in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(number.label).font(.system(size: 12)).frame(width: 104, alignment: .leading)
                            Text(number.value).font(.system(size: 12)).monospacedDigit()
                                .foregroundStyle(number.caution ? Color.orange : Color.secondary)
                                .lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
        .padding(16).frame(width: 380, alignment: .leading)
    }
}
