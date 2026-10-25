// Story grammars (Plan 03 S1): one starting narrative logic per communication kind (lib/communication.mjs).
// A grammar is a candidate pattern, never a formula. The old universal rules (a villain, a turn that reverses something, one peak at 60-75%,
// "the product reveals no earlier than 20%", a stock-opener ban) are OPTIONAL_TOOLS here: a writer may use one when it serves the assignment,
// a checker never requires one and never bans one. Original house guidance; no studio script is copied.
import { COMMUNICATION_KINDS, KIND_IDS } from "./communication.mjs";

const G = (roles, evidence_needed, proof_roles, extra = {}) => ({ roles, evidence_needed, proof_roles, ...extra });

// roles = the starting order of beat jobs. proof_roles = roles whose beats must carry evidence_refs (they say something true about the product or world).
export const STORY_GRAMMARS = Object.freeze({
  "whole-product-introduction": G(["proposition", "demonstration", "demonstration", "accumulation", "invitation"], "representative capabilities that support the promise; breadth over one stunt", ["demonstration"], { min_beats: 4, promise: "broad", notes: "Meet X / Introducing X is allowed when it serves the assignment. Shared benefits are fine even if a competitor can claim them." }),
  "single-feature-announcement": G(["task", "feature_behavior", "visible_improvement", "availability"], "what actually changed, on screen; no invented problem", ["feature_behavior", "visible_improvement"], { min_beats: 3, promise: "single-feature", notes: "Start from a task the viewer already does, not a manufactured villain." }),
  "workflow-demo": G(["outcome", "step", "step", "product_response", "result"], "reproducible actions and the real state changes they cause", ["step", "product_response", "result"], { min_beats: 4, promise: "single-feature" }),
  "instructional-explainer": G(["question", "context", "mechanism", "consequence", "takeaway"], "a correct mental model; causal relationships stated and shown", ["mechanism", "consequence"], { min_beats: 4 }),
  "brand-manifesto": G(["observation", "idea", "implication", "position"], "a distinctive, coherent belief; UI is not required", [], { min_beats: 3, abstraction_ok: true }),
  "identity-reveal": G(["element", "system_behavior", "application", "resolution"], "the identity system itself, never invented product features", ["application"], { min_beats: 3, abstraction_ok: true }),
  "performance-ad": G(["relevance", "benefit_proof", "action"], "one specific benefit, a reason to believe, a fitting call to action", ["benefit_proof"], { min_beats: 3, promise: "single-feature" }),
  "teaser": G(["clue", "anticipation", "partial_reveal", "destination"], "intentional uncertainty; any promised date or place is verified", ["destination"], { min_beats: 3, abstraction_ok: true }),
  "event-opener": G(["motif", "development", "collective_energy", "event_resolution"], "audience- and event-specific meaning; owner-confirmed names and dates", ["event_resolution"], { min_beats: 3, abstraction_ok: true }),
  "evidence-case-study": G(["baseline", "intervention", "result", "qualified_interpretation"], "source-linked numbers, faithful charts, qualifiers kept", ["baseline", "intervention", "result", "qualified_interpretation"], { min_beats: 4 }),
  "character-short": G(["desire", "obstacle", "action", "consequence"], "performance and understandable changes of state", [], { min_beats: 3, abstraction_ok: true, notes: "Desire/obstacle/action/consequence here are story roles, not vague on-screen labels." }),
  "music-lyric-film": G(["musical_progression", "visual_treatment"], "the actual audio and lyrics; the song is never rewritten", [], { min_beats: 2, abstraction_ok: true, notes: "Lyric films keep their own treatment path (treatment.mjs); this grammar only names the roles." }),
  "footage-led-story": G(["material", "selects", "edit", "resolution"], "what was actually recorded; no invented coverage", ["selects", "edit"], { min_beats: 3 }),
});

// Optional craft tools. Each says when it tends to help and when it misleads. None is required or banned by any checker.
export const OPTIONAL_TOOLS = Object.freeze({
  villain: { help: "a shared, real pain the viewer already feels", misleads: "inventing a problem for a product that needs none" },
  twist: { help: "a reversal that is the idea itself", misleads: "a twist added only to look clever" },
  peak: { help: "one moment the proposition is proven hardest", misleads: "forcing every film to crest at the same percentage" },
  reveal_timing: { help: "holding the product back when withholding builds a real question", misleads: "a universal deadline for when the product may appear" },
  introducing_opening: { help: "Meet X / Introducing X when the viewer needs the name first", misleads: "never; it is allowed" },
  early_logo: { help: "an event opener or identity film that leads with the mark", misleads: "a performance ad that has no reason to believe yet" },
  metaphor: { help: "a coherent progression that also shows the product", misleads: "a metaphor that hides the demonstration" },
  crescendo: { help: "music- or event-led energy build", misleads: "an explainer that needs calm clarity" },
  motif: { help: "one repeated element that develops", misleads: "decoration with no development" },
  hard_cut: { help: "a surprise or a finished thought", misleads: "cutting before the viewer reads" },
  silence: { help: "a held beat that lets proof land", misleads: "dead air on a performance ad" },
});
export const OPTIONAL_TOOL_IDS = Object.freeze(Object.keys(OPTIONAL_TOOLS));

export const grammarFor = (kind) => (STORY_GRAMMARS[kind] ? { kind, ...STORY_GRAMMARS[kind], profile: COMMUNICATION_KINDS[kind] } : null);
export const grammarKinds = () => [...KIND_IDS];

// roles that are free-form when the writer departs from the starting logic; a treatment may reorder or rename roles with a stated reason.
export const roleFits = (kind, role) => { const g = STORY_GRAMMARS[kind]; return !!g && g.roles.includes(role); };

// a grammar's contract with a treatment, as plain data for prompts: never a template to fill
export function grammarBrief(kind) {
  const g = grammarFor(kind);
  if (!g) return null;
  return { kind, starting_logic: g.roles, evidence_needed: g.evidence_needed, proof_roles: g.proof_roles, min_beats: g.min_beats, abstraction_ok: !!g.abstraction_ok, notes: g.notes || "", optional_tools: OPTIONAL_TOOL_IDS, rule: "optional_tools are never required and never banned: use one only when it serves the assignment and say why in treatment.optional_tools" };
}
