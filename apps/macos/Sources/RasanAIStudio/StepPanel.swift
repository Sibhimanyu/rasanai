import StudioCore
import SwiftUI

/// Every minor step. This view is the common frame (the question, context, Claude's recommendation, the decision line,
/// and the step's actions, which the film page's status bar shows) around a per-step body:
///   brand, research, route, footage, reel, concept, scenes  -> MinorPanelsA.swift
///   styleframes, motion, transitions, voice, music, storyboard, keyframes, plan, direction, anything else -> MinorPanelsB.swift
///
/// A body may register its primary action (the status bar's prominent button, which gets Return) with `.stepPrimary(...)`;
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
        case "styleframes": StyleframesStage(model: model, step: step)
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
        case "styleframes": "Do these frames look like the film?"
        default: StepCatalog.label(step)
        }
    }

    /// Reading-text steps stay narrow; the rest (tables, pickers, grids) use the workspace.
    static func width(_ step: String) -> CGFloat {
        switch step {
        case "reel", "scenes", "styleframes", "footage": 1240
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

/// Where a panel body registers its primary action for the status bar.
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
    /// Registers this panel's primary action in the status bar. `perform` receives the note typed in the inspector composer.
    func stepPrimary(_ title: String, symbol: String? = nil, enabled: Bool = true, perform: @escaping (String) -> Void) -> some View {
        modifier(StepPrimaryModifier(title: title, symbol: symbol, enabled: enabled, perform: perform))
    }
}

// MARK: - Bottom bar

/// "Let Claude decide" and the panel's primary action, published to the film page's status bar (it draws nothing itself).
struct StepActionBar: View {
    let model: FilmSessionModel
    let step: String
    let slot: StepActionSlot

    var body: some View {
        FilmActionsPublisher(actions: model.showsActions(for: step) ? FilmActions(
            step: step, primaryTitle: slot.title, primarySymbol: slot.symbol, primaryEnabled: slot.enabled,
            secondaryTitle: "Let Claude decide", secondaryHelp: "Let Claude make this call. It will say what it chose and why.",
            onPrimary: slot.perform,
            onSecondary: { note in Task { await model.decide(step: step, note: note) } }) : nil)
    }
}
