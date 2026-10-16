import Foundation

/// Which crew character stands for which agent, step, panel or phase. Pure strings so it can be tested without any UI:
/// the app turns a key ("tara", "kavi", "chitra", "ra", "laya", "rasika", "mala") into a `CrewCharacter`.
/// Rasan, the mascot and the Director, is the answer for anything the crew do not own.
public enum CrewRoles {
    public static let keys = ["tara", "kavi", "chitra", "ra", "laya", "rasika", "mala"]

    /// The agent roles of `skills/rasanai/scripts/crew.mjs` (ROLES) and the character who presents each.
    public static let roleCharacters: [String: String] = [
        "product-researcher": "tara", "brand-researcher": "tara", "screens-researcher": "tara", "precedent-researcher": "tara",
        "local-scout": "tara", "research-lead": "tara", "design-researcher": "tara",
        "script-writer": "kavi", "treatment-writer": "kavi", "visual-writer": "kavi", "script-editor": "kavi",
        "concept-critic": "kavi", "structure-critic": "kavi",
        "art-director": "chitra", "styleframe-designer": "chitra", "frame-designer": "chitra", "design-system-designer": "chitra",
        "frame-juror": "chitra", "ab-juror": "chitra", "brand-kit-builder": "chitra", "brand-film-analyst": "chitra",
        "motion-director": "laya", "move-inventor": "laya", "move-sketcher": "laya", "move-juror": "laya",
        "film-builder": "laya", "scene-animator": "laya",
        "critic": "rasika", "retrospective": "rasika",
        "footage-logger": "mala", "selects-producer": "mala", "footage-writer": "mala",
    ]

    /// Longest names first, so "script-writer" never loses to a shorter name that happens to be its prefix.
    private static let rolesByLength = roleCharacters.keys.sorted { $0.count != $1.count ? $0.count > $1.count : $0 < $1 }

    public static func character(forRole role: String?) -> String? {
        guard let role else { return nil }
        return roleCharacters[role.lowercased()]
    }

    /// The role a prompt names with its `crew/prompts/<role>[-<key>].md` path, e.g. "script-writer" from
    /// "crew/prompts/script-writer-sure.md" (the key is appended with a hyphen). `nil` when it names none.
    public static func role(fromPrompt prompt: String) -> String? {
        let marker = "crew/prompts/"
        var rest = prompt[...]
        while let found = rest.range(of: marker) {
            rest = rest[found.upperBound...]
            let token = rest.prefix { $0.isLowercase || $0.isNumber || $0 == "-" }
            if let role = rolesByLength.first(where: { token == $0 || token.hasPrefix($0 + "-") }) { return role }
        }
        return nil
    }

    /// The character for an Agent call's description ("Writing the Sure script"), when no role is known.
    public static func character(forDescription description: String) -> String? {
        let text = description.lowercased().trimmingCharacters(in: .whitespaces)
        // Order matters: the specific phrases come before the verbs they share ("Writing ... paper edit" is Mala's, not Kavi's).
        let rules: [(key: String, prefixes: [String], contains: [String])] = [
            ("mala", ["finding the bites", "logging"], ["paper edit"]),
            ("rasika", ["reviewing", "reading how the film was made"], []),
            ("kavi", ["reading the thumbnail sheet", "editing the three scripts", "scoring the chosen script"], []),
            ("laya", ["inventing the hero moves", "judging every move idea", "sketching", "scoring how the whole film moves",
                      "checking every cut", "animating", "building"], []),
            ("tara", ["reading the local project"], []),
            ("chitra", ["designing", "making the film's pictures", "drawing", "judging every styleframe", "judging two films blind",
                        "reading"], []),
            ("kavi", ["writing the"], []),
            ("tara", ["researching", "finding", "collecting", "studying", "merging the research"], []),
        ]
        for rule in rules where rule.prefixes.contains(where: text.hasPrefix) || rule.contains.contains(where: text.contains) { return rule.key }
        return nil
    }

    public static func character(forRoute route: StageRoute) -> String {
        switch route {
        case .working: "ra"
        case .brief: "tara"
        case .story: "kavi"
        case .look: "chitra"
        case .animatic, .build: "laya"
        case .final: "rasika"
        case .panel(let step): character(forPanel: step)
        }
    }

    /// The character for a step name (the keys of the session's `steps`), "ra" for the ones nobody owns.
    public static func character(forPanel panel: String) -> String {
        switch panel.lowercased() {
        case "brief", "research", "route", "local": "tara"
        case "story", "concept", "scenes", "plan": "kavi"
        case "look", "films", "direction", "styleframes", "brand", "keyframes", "storyboard": "chitra"
        case "animatic", "build", "motion", "transitions", "music", "voice": "laya"
        case "final", "render", "review": "rasika"
        case "footage", "reel": "mala"
        default: "ra"
        }
    }

    public static func character(forPhase phase: ProgressPhase) -> String {
        switch phase {
        case .research: "tara"
        case .script, .plan: "kavi"
        case .look: "chitra"
        case .animatic, .build: "laya"
        case .check, .render: "rasika"
        }
    }
}
