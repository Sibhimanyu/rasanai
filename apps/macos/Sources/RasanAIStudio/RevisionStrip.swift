import StudioCore
import SwiftUI

/// Plan 10 U5/U6: what the engine says about the revision in flight and about the run, in one slim strip over the stage (details open in a popover, so the stage never
/// jumps). Everything is READ from the run folder the engine writes (crew/revision-latest.json, motion/edits.jsonl, crew/jobs, pause.json, throttle.json). A "ready"
/// state shows only with its matching receipt; the last delivered film stays available while a revision builds; usage is never invented. Recovery controls act on THIS
/// film's jobs through the `job-control` action; nothing here interrupts a provider's shared queue.
struct RevisionStrip: View {
    let model: FilmSessionModel
    @State private var snap = Snap()
    @State private var showDetails = false
    @State private var dismissedOutcomes: Set<String> = []

    struct Snap: Equatable {
        var events: [RevisionEvent] = []
        var edits: [EditLine] = []
        var activity: RunActivity?
        var capabilities: [CapabilityListing] = []
    }

    private var failedOutcome: EditOutcome? { model.editOutcomes.last { $0.restoresCommittedState && !dismissedOutcomes.contains($0.id) } }

    var body: some View {
        Group {
            if let run = model.runDirectory {
                content.task(id: run.path) { await poll(run) }
            }
        }
    }

    @ViewBuilder private var content: some View {
        let latest = snap.events.first
        let activity = snap.activity
        let trouble = [RunActivityState.failed, .paused, .rateLimited].contains(activity?.state ?? .stopped)
        let editTrouble = snap.edits.contains { $0.lifecycle == .conflicted || $0.lifecycle == .failed }
        let inFlight = latest.map { $0.stage != .finalReady } ?? false
        if inFlight || trouble || editTrouble || failedOutcome != nil {
            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 10) {
                    if let latest { revisionLabel(latest) }
                    if let activity, activity.state != .stopped || activity.jobs.contains(where: { $0.state == "failed" }) {
                        Label(activity.state.token.label, systemImage: activity.state.token.symbol).font(.system(size: 12, weight: .medium))
                            .help(activity.reason)
                    }
                    Spacer(minLength: 8)
                    controls(activity)
                    Button { showDetails.toggle() } label: { Label("Details", systemImage: "list.bullet.rectangle").font(.system(size: 12)) }
                        .buttonStyle(.rasanSecondary).controlSize(.small)
                        .popover(isPresented: $showDetails, arrowEdge: .bottom) {
                            RunDetailsView(model: model, snap: snap).frame(width: 440).frame(maxHeight: 460)
                                .task { await model.send(step: "render", type: "job-control", value: RunActivityReader.control("capabilities")) }
                        }
                }
                .padding(.horizontal, .filmInset).padding(.vertical, 5)
                if let outcome = failedOutcome, let text = outcome.explanation { outcomeRow(outcome, text) }
            }
            .background(.bar).overlay(alignment: .bottom) { Divider() }
            .accessibilityElement(children: .contain).accessibilityLabel("Revision progress")
        }
    }

    private func revisionLabel(_ event: RevisionEvent) -> some View {
        let token = event.token
        return HStack(spacing: 6) {
            Label(token.label, systemImage: token.symbol).font(.system(size: 12, weight: .semibold))
            Text(summary(event)).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.tail)
        }
        .help(token.detail).accessibilityElement(children: .combine).accessibilityLabel("\(token.label). \(token.detail)")
    }

    private func summary(_ event: RevisionEvent) -> String {
        var parts: [String] = []
        if [.sourceChanged, .previewPending, .previewReady, .finalRendering].contains(event.stage), event.previousDeliveredExists { parts.append("Your last delivered film stays available.") }
        parts.append(contentsOf: event.work.lines.prefix(1))
        return parts.joined(separator: " ")
    }

    @ViewBuilder private func controls(_ activity: RunActivity?) -> some View {
        if let activity, !activity.jobs.isEmpty {
            Button(activity.state == .paused ? "Resume" : "Pause new work") {
                Task { await model.send(step: "render", type: "job-control", value: RunActivityReader.control(activity.state == .paused ? "resume" : "pause")) }
            }
            .buttonStyle(.rasanSecondary).controlSize(.small)
            .help(activity.state == .paused ? "Let new steps start again." : "Nothing new starts. Work already running finishes.")
            if let retry = activity.jobs.first(where: { $0.canRetry }) {
                Button("Retry failed step") { Task { await model.send(step: "render", type: "job-control", value: RunActivityReader.control("retry", job: retry.id)) } }
                    .buttonStyle(.rasanSecondary).controlSize(.small)
            }
        }
    }

    private func outcomeRow(_ outcome: EditOutcome, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 12))
            Text(text).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if outcome.needsReselect { Text("Turn on “Edit elements” on the picture and pick it again.").font(.system(size: 11)).foregroundStyle(.secondary) }
            Button("Dismiss") { dismissedOutcomes.insert(outcome.id) }.buttonStyle(.link).font(.system(size: 12))
        }
        .padding(.horizontal, .filmInset).padding(.bottom, 6)
        .accessibilityElement(children: .combine)
    }

    private func poll(_ run: URL) async {
        while !Task.isCancelled {
            let next = await Task.detached { Snap(events: RevisionLog.read(run: run), edits: EditLog.read(run: run), activity: RunActivityReader.read(run: run), capabilities: CapabilityReader.read(run: run)) }.value
            if next != snap { snap = next }
            try? await Task.sleep(for: .seconds(2))
        }
    }
}

/// The popover: the run's state, the revision's work (expected vs done), jobs with their controls, edits with their lifecycle, and which adapters are really usable.
struct RunDetailsView: View {
    let model: FilmSessionModel
    let snap: RevisionStrip.Snap

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let activity = snap.activity { section("Run") {
                    Label(activity.state.token.label, systemImage: activity.state.token.symbol).font(.system(size: 13, weight: .semibold))
                    Text(activity.reason).font(.system(size: 12)).foregroundStyle(.secondary)
                } }
                if let event = snap.events.first { section("Latest revision") {
                    Label(event.token.label, systemImage: event.token.symbol).font(.system(size: 13, weight: .semibold))
                    Text(event.token.detail).font(.system(size: 12)).foregroundStyle(.secondary)
                    ForEach(event.work.lines, id: \.self) { Text($0).font(.system(size: 12)) }
                    if event.work.isExpectation { Text("This is what is expected, not what has finished.").font(.system(size: 11)).foregroundStyle(.secondary) }
                    ForEach(event.fallbacks, id: \.self) { Text("Safer, slower path: \($0)").font(.system(size: 11)).foregroundStyle(.secondary) }
                } }
                if let jobs = snap.activity?.jobs, !jobs.isEmpty { section("Steps") {
                    ForEach(jobs) { job in jobRow(job) }
                    let log = model.snapshot.raw["job_control"]
                    if log["op"].string == "logs", !log["lines"].array.isEmpty {
                        Text(log["lines"].array.compactMap(\.string).joined(separator: "\n")).font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                    }
                } }
                if !snap.edits.isEmpty { section("Edits") { ForEach(snap.edits) { edit in editRow(edit) } } }
                if !snap.capabilities.isEmpty { section("What this Mac can use") {
                    ForEach(snap.capabilities.filter { $0.isUsable || $0.state == "unavailable" }.prefix(40)) { cap in
                        VStack(alignment: .leading, spacing: 1) {
                            Label(cap.label, systemImage: cap.isReady ? "checkmark.circle" : cap.isUsable ? "circle.dotted" : "minus.circle").font(.system(size: 12, weight: .medium))
                            Text(cap.explanation + (cap.alternative.map { " " + $0 } ?? "")).font(.system(size: 11)).foregroundStyle(.secondary)
                        }
                    }
                } }
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary).textCase(.uppercase).accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func jobRow(_ job: RunJob) -> some View {
        HStack(spacing: 8) {
            Text(job.node.isEmpty ? job.id : job.node).font(.system(size: 12, weight: .medium)).lineLimit(1)
            Text(job.state.replacingOccurrences(of: "_", with: " ")).font(.system(size: 11)).foregroundStyle(.secondary)
            Spacer(minLength: 4)
            Button("Logs") { Task { await model.send(step: "render", type: "job-control", value: RunActivityReader.control("logs", job: job.id)) } }.buttonStyle(.link).font(.system(size: 11))
            if job.canRetry { Button("Retry") { Task { await model.send(step: "render", type: "job-control", value: RunActivityReader.control("retry", job: job.id)) } }.buttonStyle(.link).font(.system(size: 11)) }
            if job.needsDuplicateApproval {
                Button("Retry (may repeat work)") { Task { await model.send(step: "render", type: "job-control", value: RunActivityReader.control("retry", job: job.id, approveDuplicate: true)) } }.buttonStyle(.link).font(.system(size: 11))
                    .help("The provider may already be running this. Retrying could do the work twice.")
            }
            if job.canCancel { Button("Cancel") { Task { await model.send(step: "render", type: "job-control", value: RunActivityReader.control("cancel", job: job.id)) } }.buttonStyle(.link).font(.system(size: 11))
                .help("Cancels this film's step. A step on a shared queue is marked cancelled here and left to finish there.") }
        }
    }

    private func editRow(_ edit: EditLine) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Label(edit.lifecycle.token.label, systemImage: edit.lifecycle.token.symbol).font(.system(size: 12, weight: .medium))
                Text(edit.elementID ?? edit.instruction).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                if edit.lifecycle == .rendered || edit.lifecycle == .previewReady, !edit.hasReceipt { Text("(older run: not verified)").font(.system(size: 11)).foregroundStyle(.secondary) }
            }
            if let reason = edit.conflictReason {
                Text(reason).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if edit.offersRestoreAsNewVersion {
                    Button("Restore as a new version") { Task { await model.send(step: "render", type: "motion-edit", value: .object(["restore_of": .string(edit.id)])) } }.buttonStyle(.link).font(.system(size: 11))
                        .help("Keeps the current state as a checkpoint, then writes the earlier state as a new version. Nothing is lost.")
                }
            }
        }
    }
}
