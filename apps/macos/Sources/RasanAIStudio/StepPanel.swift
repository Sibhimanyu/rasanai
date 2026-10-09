import StudioCore
import SwiftUI

/// Every minor step. This view is the common frame (the question, context, Claude's recommendation, the decision line,
/// the conversation, and a bottom bar with a note box, "Send note", "You decide this step" and the step's primary action)
/// around a per-step body:
///   brand, research, route, footage, reel, concept, scenes  -> MinorPanelsA.swift
///   styleframes, motion, transitions, voice, music, storyboard, keyframes, plan, direction, anything else -> MinorPanelsB.swift
///
/// A body may register its primary action (the pinned prominent button, which gets Return) with `.stepPrimary(...)`;
/// bodies that lay out their own buttons inline can ignore it.
struct StepPanel: View {
    let model: FilmSessionModel
    let step: String
    init(model: FilmSessionModel, step: String) { self.model = model; self.step = step }

    @State private var slot = StepActionSlot()

    var body: some View {
        let payload = model.payload(step)
        StageScaffold(model: model, step: step,
                      question: payload["question"].string ?? Self.defaultQuestion(step),
                      context: payload["context"].string,
                      recommended: Self.recommendedTitle(payload),
                      maxWidth: Self.width(step)) {
            panelBody
                .environment(slot)
                .id(step)
        } actions: {
            StepActionBar(model: model, step: step, slot: slot)
        }
        .environment(model)
        .onChange(of: step) { slot.clear() }
    }

    @ViewBuilder private var panelBody: some View {
        switch step {
        case "brand": BrandPanel(model: model, step: step)
        case "research": ResearchPanel(model: model, step: step)
        case "route": RoutePanel(model: model, step: step)
        case "footage": FootagePanel(model: model, step: step)
        case "reel": ReelPanel(model: model, step: step)
        case "concept": ConceptPanel(model: model, step: step)
        case "scenes": ScenesPanel(model: model, step: step)
        case "styleframes": StyleframesPanel(model: model, step: step)
        case "motion": MotionPanel(model: model, step: step)
        case "transitions": TransitionsPanel(model: model, step: step)
        case "voice": VoicePanel(model: model, step: step)
        case "music": MusicPanel(model: model, step: step)
        case "storyboard": StoryboardPanel(model: model, step: step)
        case "keyframes": KeyframesPanel(model: model, step: step)
        case "plan": PlanPanel(model: model, step: step)
        case "direction": DirectionPanel(model: model, step: step)
        default: GenericPanel(model: model, step: step)
        }
    }

    static func defaultQuestion(_ step: String) -> String {
        switch step {
        case "brand": "Use your brand for this film?"
        case "research": "What the crew found"
        case "route": "Which workflow builds this?"
        case "footage": "Which clips go in?"
        case "reel": "Is this the cut?"
        case "concept": "Which story?"
        case "scenes": "Do the scenes add up?"
        default: StepCatalog.label(step)
        }
    }

    /// Wide steps (editable tables) get more room.
    static func width(_ step: String) -> CGFloat {
        switch step {
        case "reel", "scenes": 1120
        case "footage": 1000
        default: 900
        }
    }

    /// The title of the option Claude recommends, found in whichever list the payload carries.
    static func recommendedTitle(_ payload: JSONValue) -> String? {
        guard let id = payload["recommended"].identifier, !id.isEmpty else { return nil }
        for key in ["options", "suggestions", "menu", "looks", "stories", "cells"] {
            for item in payload[key].array where item["id"].identifier == id {
                if let name = item["title"].string ?? item["label"].string ?? item["name"].string { return name }
            }
        }
        return id
    }
}

// MARK: - Primary action slot

/// Where a panel body registers its primary action for the pinned bar.
@MainActor @Observable
final class StepActionSlot {
    var title: String?
    var symbol: String?
    var enabled = true
    @ObservationIgnored var perform: (String) -> Void = { _ in }
    func clear() { title = nil; symbol = nil; perform = { _ in } }
}

private struct StepPrimaryModifier: ViewModifier {
    let title: String
    let symbol: String?
    let enabled: Bool
    let perform: (String) -> Void
    @Environment(StepActionSlot.self) private var slot: StepActionSlot?
    func body(content: Content) -> some View {
        content
            .onAppear { register() }
            .onChange(of: title) { register() }
            .onChange(of: enabled) { register() }
            .onDisappear { slot?.clear() }
    }
    private func register() {
        guard let slot else { return }
        slot.title = title; slot.symbol = symbol; slot.enabled = enabled; slot.perform = perform
    }
}

extension View {
    /// Registers this panel's primary action in the frame's bottom bar. `perform` receives the note typed there.
    func stepPrimary(_ title: String, symbol: String? = nil, enabled: Bool = true, perform: @escaping (String) -> Void) -> some View {
        modifier(StepPrimaryModifier(title: title, symbol: symbol, enabled: enabled, perform: perform))
    }
}

// MARK: - Bottom bar

/// The note box ("Send note"), "You decide this step", and the panel's primary action.
struct StepActionBar: View {
    let model: FilmSessionModel
    let step: String
    let slot: StepActionSlot
    @State private var note = ""

    /// Only the person's turn (or looking back, or just sent) gets a bar; while Claude works there is nothing to do.
    var body: some View {
        if model.showsActions(for: step) { bar }
    }

    @ViewBuilder private var bar: some View {
        let canAct = model.canAct(on: step)
        VStack(spacing: 8) {
            if let error = model.lastError {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text(error).font(.system(size: 12)).lineLimit(2)
                    Spacer()
                    Button("Dismiss") { model.dismissError() }.buttonStyle(.link).font(.system(size: 12))
                }
            }
            HStack(spacing: 10) {
                if model.isViewingPast {
                    Label("Looking back. This step is decided.", systemImage: "clock.arrow.circlepath")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                    Spacer()
                    Button("Back to now") { model.returnToLive() }.controlSize(.large)
                } else if model.hasSent(step) && model.status(step) != "done" {
                    ProgressView().controlSize(.small)
                    Text("Sent to Claude. Waiting for the next update.").font(.system(size: 12)).foregroundStyle(.secondary)
                    Spacer()
                } else {
                    HStack(spacing: 6) {
                        TextField("Add a note for Claude", text: $note, axis: .vertical)
                            .textFieldStyle(.plain).font(.system(size: 13)).lineLimit(1...3)
                            .disabled(!canAct)
                            .onSubmit { sendNote() }
                            .accessibilityLabel("Note for Claude")
                        if !trimmed.isEmpty {
                            Button("Send note") { sendNote() }
                                .buttonStyle(.borderless).font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Color.rasan).disabled(!canAct || model.isSending)
                                .transition(.opacity)
                        }
                    }
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(Color(nsColor: .textBackgroundColor).opacity(0.7), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5) }
                    .animation(.smooth(duration: 0.15), value: trimmed.isEmpty)
                    Button("Let Claude decide") { Task { await model.decide(step: step, note: trimmed) } }
                        .controlSize(.large).disabled(!canAct)
                        .help("Let Claude make this call. It will say what it chose and why.")
                    if let title = slot.title {
                        Button {
                            slot.perform(trimmed)
                        } label: {
                            HStack(spacing: 6) {
                                if model.isSending { ProgressView().controlSize(.small) }
                                else if let symbol = slot.symbol { Image(systemName: symbol) }
                                Text(title)
                            }.frame(minWidth: 110)
                        }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                        .keyboardShortcut(.defaultAction)
                        .disabled(!canAct || !slot.enabled)
                    }
                }
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 12)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
        .onChange(of: model.sendCount) { _, _ in note = "" }
    }

    private var trimmed: String { note.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func sendNote() {
        let text = trimmed
        guard !text.isEmpty else { return }
        Task { if await model.send(step: step, type: "note", note: text) { note = "" } }
    }
}
