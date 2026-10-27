// V3 W08 (additive): medium PERFORMANCE states (available | uncertain | unavailable, with evidence; source presence != executed != visually demonstrated),
// the factual-vs-taste authority split, and scoped (language-conditioned) fluency/finish diagnostics. Legacy resolveMediumRules keys are unchanged.
// Per-layer / per-scene rule adapter for the medium contract (design/<label>/medium.json, format medium-contract@1).
// A known medium policy may QUALIFY one named aesthetic (craft) check for one named layer and scene; it never suppresses a hard
// check (proof, readability, safety, time bounds, source refs, brand, permission) and never grants a blanket skip. An unknown
// layer, contract or rule keeps the established constraint. Pure: no imports, no I/O, no side effects at import.
//
// resolveMediumRules({ contract, layerId, sceneId, existingRules }) -> { hard, craft, scopedExceptions, reasons }
//   existingRules: an array of rule ids / { id, kind: "hard"|"craft" } objects, or an object { [id]: { kind } | "hard" | "craft" }.
//   hard:             rule ids that stay enforced exactly as before (never exempted)
//   craft:            craft rule ids that stay enforced for this layer/scene
//   scopedExceptions: [{ rule_id, layer_id, scene_id, policy, value, reason, source }] craft checks the contract qualifies HERE only
//   reasons:          [{ code, rule_id?, detail }] why each rule landed where it did (also errors: layer-unknown, contract-unknown)

import { CREATIVE_ERROR_CODES } from "./creative-policy.mjs";

// rules that no medium policy can qualify (the consumer must keep them whatever the contract says)
export const HARD_RULE_IDS = Object.freeze([
  "proof-legible", "text-readable", "readability", "safe-area", "time-bounds", "time-order", "source-ref", "source-refs",
  "paths", "permission", "rights", "brand-lock", "brand-constraint", "logo", "claim-mutation", "exact-ui", "qualifier",
  "frame-blank", "frame-missing", "render-failed", "contrast", "a11y", "reduced-motion", "protected-text", "approval",
]);

// craft rule id -> the contract policy that may qualify it, and the predicate that must hold for the layer/scene
export const CRAFT_QUALIFIERS = Object.freeze({
  "camera-drift": { policy: "motion_policy.camera_mode", test: (c) => ["locked", "none", "static"].includes(motionPolicy(c).camera_mode) },
  "camera-motion": { policy: "motion_policy.camera_mode", test: (c) => ["locked", "none", "static"].includes(motionPolicy(c).camera_mode) },
  "forced-camera-move": { policy: "motion_policy.camera_mode", test: (c) => ["locked", "none", "static", "chosen-by-look"].includes(motionPolicy(c).camera_mode) },
  "ground-motion": { policy: "motion_policy.ground_motion", test: (c) => motionPolicy(c).ground_motion === "none" },
  "continuous-motion": { policy: "motion_policy.ground_motion", test: (c) => motionPolicy(c).ground_motion === "none" },
  "stepped-motion": { policy: "motion_policy.temporal_mode", test: (c, l) => ["stepped", "mixed"].includes(motionPolicy(c).temporal_mode) && !!l && l.stepped !== false },
  "curve-mix": { policy: "motion_policy.temporal_mode", test: (c) => ["stepped", "cut-based", "still"].includes(motionPolicy(c).temporal_mode) },
  "handoff-continuity": { policy: "motion_policy.temporal_mode", test: (c) => ["cut-based", "still"].includes(motionPolicy(c).temporal_mode) },
  "intentional-hold": { policy: "motion_policy.intentional_holds_allowed", test: (c, l, s) => motionPolicy(c).intentional_holds_allowed === true && Array.isArray(motionPolicy(c).hold_scene_ids) && !!s && motionPolicy(c).hold_scene_ids.includes(s) },
  "static-freeze": { policy: "motion_policy.intentional_holds_allowed", test: (c, l, s) => motionPolicy(c).intentional_holds_allowed === true && Array.isArray(motionPolicy(c).hold_scene_ids) && !!s && motionPolicy(c).hold_scene_ids.includes(s) },
  "cadence": { policy: "motion_policy.cadence", test: (c) => !!motionPolicy(c).cadence && motionPolicy(c).cadence !== "universal" },
  "word-choreo": { policy: "text_policy.role", test: (c) => ["none", "proof", "support", "proof-and-support"].includes((c.text_policy || {}).role) },
  "type-scale-quota": { policy: "text_policy.role", test: (c) => ["none", "proof", "support", "proof-and-support"].includes((c.text_policy || {}).role) },
  "blur-finish": { policy: "finish_policy.by_layer", test: (c, l) => sharpFinish(c, l) },
  "soft-focus": { policy: "finish_policy.by_layer", test: (c, l) => sharpFinish(c, l) },
  "depth-of-field": { policy: "finish_policy.by_layer", test: (c, l) => sharpFinish(c, l) },
  "lighting-shadow": { policy: "finish_policy.by_layer", test: (c, l) => sharpFinish(c, l) },
  "grain-glow": { policy: "finish_policy.by_layer", test: (c, l) => sharpFinish(c, l) },
  "multi-plane-depth": { policy: "layers[].medium", test: (c, l) => !!l && (["pixel", "sharp-ui", "flat", "line", "paper-flat", "vector-flat", "isometric", "evidence-diagram", "diagram"].includes(l.medium) || (c.execution_id === "cel-performance" && ["cel", "painted-2d"].includes(l.medium)) || (["isometric-system", "evidence-diagram"].includes(c.execution_id) && l.medium === "vector-flat")) },
  "dimensional-craft": { policy: "layers[].medium", test: (c, l) => !!l && (["pixel", "sharp-ui", "flat", "line", "paper-flat", "vector-flat", "isometric", "evidence-diagram", "diagram"].includes(l.medium) || (c.execution_id === "cel-performance" && ["cel", "painted-2d"].includes(l.medium))) },
});

const motionPolicy = (c) => (c && c.motion_policy && typeof c.motion_policy === "object" ? c.motion_policy : {});
const SHARP = ["sharp", "nearest-neighbor", "none", "flat"];
const sharpFinish = (c, l) => {
  const f = c && c.finish_policy && c.finish_policy.by_layer;
  return !!(f && l && SHARP.includes(f[l.id]));
};

const isContract = (c) => !!c && typeof c === "object" && c.format === "medium-contract@1" && typeof c.profile_id === "string" && c.profile_id.trim() && Array.isArray(c.layers);

function normaliseRules(existing) {
  const out = [];
  if (Array.isArray(existing)) for (const r of existing) { if (typeof r === "string") out.push({ id: r, kind: null }); else if (r && typeof r.id === "string") out.push({ id: r.id, kind: r.kind || null }); }
  else if (existing && typeof existing === "object") for (const [id, v] of Object.entries(existing)) out.push({ id, kind: typeof v === "string" ? v : (v && v.kind) || null });
  return out;
}

export function resolveMediumRules({ contract, layerId, sceneId, existingRules } = {}) {
  const rules = normaliseRules(existingRules);
  const hard = [], craft = [], scopedExceptions = [], reasons = [];
  const keepAll = (code, detail) => {
    for (const r of rules) (r.kind === "hard" || HARD_RULE_IDS.includes(r.id) ? hard : craft).push(r.id);
    reasons.push({ code, detail });
    return { hard, craft, scopedExceptions, reasons, authority: authoritySplit(hard, craft) };
  };
  if (!isContract(contract)) return keepAll("contract-unknown", "no valid medium-contract@1 (format, profile_id and layers): every established rule stays as it was");
  const layer = contract.layers.find((l) => l && l.id === layerId) || null;
  if (!layer) return keepAll("layer-unknown", `layer "${layerId}" is not in the contract (${contract.layers.map((l) => l && l.id).filter(Boolean).join(", ")}): no exception granted`);
  for (const inv of Array.isArray(contract.invariants) ? contract.invariants : []) {
    if (inv && inv.kind === "hard" && inv.id) { hard.push(`invariant:${inv.id}`); reasons.push({ code: "hard-invariant", rule_id: `invariant:${inv.id}`, detail: "the contract's own hard invariant is enforced as a hard check" }); }
  }
  for (const r of rules) {
    if (r.kind === "hard" || HARD_RULE_IDS.includes(r.id)) { hard.push(r.id); reasons.push({ code: "hard-retained", rule_id: r.id, detail: "hard checks are never qualified by a medium" }); continue; }
    const q = CRAFT_QUALIFIERS[r.id];
    if (!q) { craft.push(r.id); reasons.push({ code: "unknown-rule-retained", rule_id: r.id, detail: "no medium qualifier is defined for this rule: the established constraint stays" }); continue; }
    let ok = false;
    try { ok = !!q.test(contract, layer, sceneId); } catch { ok = false; }
    if (ok) {
      scopedExceptions.push({ rule_id: r.id, layer_id: layer.id, scene_id: sceneId || null, policy: q.policy, value: q.policy.startsWith("layers") ? layer.medium : readPath(contract, q.policy, layer.id), reason: `contract ${contract.profile_id} declares ${q.policy} for this layer/scene`, source: contract.candidate_id || contract.profile_id });
      reasons.push({ code: "scoped-exception", rule_id: r.id, detail: `qualified by ${q.policy} for layer ${layer.id}${sceneId ? `, scene ${sceneId}` : ""} only` });
    } else { craft.push(r.id); reasons.push({ code: "craft-retained", rule_id: r.id, detail: `${q.policy} does not qualify this rule here` }); }
  }
  return { hard, craft, scopedExceptions, reasons, authority: authoritySplit(hard, craft) };
}

function readPath(obj, p, layerId) {
  let v = obj;
  for (const k of p.split(".")) { if (k.endsWith("[]")) return undefined; v = v && v[k]; }
  return v && typeof v === "object" && !Array.isArray(v) && layerId in v ? v[layerId] : v;
}


// ---- V3 W08: factual authority vs taste authority --------------------------------------------------------------------------------------------------
// factual: facts, proof, safety, rights, brand locks, approvals: a medium or a look never qualifies them. taste: craft preferences a chosen visual language may qualify.
export const AUTHORITIES = Object.freeze(["factual", "taste"]);
export const FACTUAL_RULE_KINDS = Object.freeze(["authorization", "fact", "brand", "format", "resource"]);
export const ruleAuthority = (idOrRule, kind = null) => {
  const id = typeof idOrRule === "string" ? idOrRule : idOrRule && (idOrRule.id || idOrRule.rule_id);
  const k = kind || (idOrRule && typeof idOrRule === "object" ? idOrRule.kind : null);
  return HARD_RULE_IDS.includes(id) || k === "hard" || FACTUAL_RULE_KINDS.includes(k) ? "factual" : "taste";
};
const authoritySplit = (hard, craft) => ({ factual: [...hard], taste: [...craft] });

// ---- V3 W08: evidence ladder and performance states ------------------------------------------------------------------------------------------------
// none < declared (a profile/doc says so) < source_present (code behind it exists) < executed (it ran on something) < visually_demonstrated (someone/something saw the DEFINING behaviour)
export const PERFORMANCE_STATES = Object.freeze(["available", "uncertain", "unavailable"]);
export const EVIDENCE_LEVELS = Object.freeze(["none", "declared", "source_present", "executed", "visually_demonstrated"]);
const levelIndex = (l) => Math.max(0, EVIDENCE_LEVELS.indexOf(l));

// evidence: { declared?, source_present?, executed?, visually_demonstrated?, blocked?:string|true, refs?:[string] } -> { level, state, why, refs }
// available only with a visual demonstration of the behaviour (texture alone never counts); executed/source-only is uncertain; blocked or nothing is unavailable.
export function classifyEvidence(evidence) {
  const e = evidence && typeof evidence === "object" ? evidence : {};
  const refs = Array.isArray(e.refs) ? e.refs.filter((x) => typeof x === "string") : [];
  if (e.blocked) return { level: highest(e), state: "unavailable", why: typeof e.blocked === "string" ? e.blocked : "a gate is closed (not implemented, not on this host, not enabled or not permitted)", refs };
  const level = highest(e);
  if (level === "visually_demonstrated") return { level, state: "available", why: "the defining behaviour was demonstrated on real output", refs };
  if (level === "executed") return { level, state: "uncertain", why: "it ran, but nothing shows the defining behaviour was seen working", refs };
  if (level === "source_present") return { level, state: "uncertain", why: "source exists; it was never executed or visually demonstrated", refs };
  if (level === "declared") return { level, state: "uncertain", why: "declared by a profile or note only", refs };
  return { level: "none", state: "unavailable", why: "no evidence of this behaviour", refs };
}
function highest(e) {
  for (const l of ["visually_demonstrated", "executed", "source_present", "declared"]) if (e[l]) return l;
  return "none";
}
export const strongerEvidence = (a, b) => (levelIndex(a) >= levelIndex(b) ? a : b);

// ---- V3 W08: what each language's defining behaviour is (review questions, never universal minima) -------------------------------------------------
export const MEDIUM_BEHAVIORS = Object.freeze({
  character: { execution_ids: ["cel-performance"], behaviors: ["intention", "pose", "eyeline", "anticipation", "reaction", "contact", "expression-states"], weak_substitution: "mascot beside text; idle bobbing with no acting", stillness_legitimate: true,
    review_questions: ["Does the approved intention read from pose and eyeline at the event interval?", "Is anticipation or reaction present where the commitment names one (a held pose that still reads is fine)?", "Does every named object contact stay attached for its interval?", "Do expression changes use the approved states without abrupt replacement?"] },
  paper: { execution_ids: ["paper-collage-native"], behaviors: ["cut", "fold", "layer", "material-continuity"], weak_substitution: "paper texture behind ordinary cards", stillness_legitimate: true,
    review_questions: ["Is the selected cut/fold/layer behaviour visible, or only a texture over moving rectangles?", "Does material stay continuous across the change?"] },
  line: { execution_ids: ["line-drawing-native"], behaviors: ["drawing-order", "line-weight", "relation-emergence"], weak_substitution: "stroke filter applied to a slide", stillness_legitimate: true,
    review_questions: ["Does drawing order carry meaning?", "Do relations emerge from the lines, not just outline a finished frame?"] },
  pixel: { execution_ids: ["pixel-native", "pixel-companion"], behaviors: ["grid", "stepping", "glyph-legibility"], weak_substitution: "downsampled UI that destroys evidence", stillness_legitimate: true,
    review_questions: ["Is the grid deliberate on the pixel layers only?", "Is every proof/UI layer still sharp and legible?"] },
  diagram: { execution_ids: ["evidence-diagram"], behaviors: ["causal-order", "relationship-reveal"], weak_substitution: "arbitrary line growth around a paragraph", stillness_legitimate: true,
    review_questions: ["Is the claimed relationship revealed in causal order and readable at the end?"] },
  isometric: { execution_ids: ["isometric-system"], behaviors: ["space", "occlusion", "scale", "motivated-camera"], weak_substitution: "tilted rectangles with a 3D label", stillness_legitimate: true,
    review_questions: ["Do occlusion and scale agree with the space?", "Is any camera move motivated?"] },
  typography: { execution_ids: ["flat-vector-native"], behaviors: ["language-performs", "reading-order", "readability"], weak_substitution: "interchangeable headline entrance effects", stillness_legitimate: true,
    review_questions: ["Does layout or action change what the words mean?", "Does it stay readable at the event interval?"] },
  footage: { execution_ids: [], behaviors: ["selection", "duration", "juxtaposition", "source-meaning"], weak_substitution: "unrelated stock moving behind claims", stillness_legitimate: false,
    review_questions: ["Does the source keep its meaning in this cut?", "Does juxtaposition carry the beat?"] },
});

// commitments: [{ id, language?, behavior, event_id? }]; evidence: { [behavior or "language:behavior"]: evidenceObject }; languageId from MEDIUM_BEHAVIORS keys.
// -> { language_id, states:[{commitment_id, behavior, state, level, why, evidence_refs, disclosure}], summary:{available,uncertain,unavailable}, errors:[{code, commitment_id}] }
// A weak substitute is never relabelled: unavailable/uncertain rows carry `disclosure` text for the Look/Storyboard decision (route a change through revision).
export function resolveMediumPerformance({ languageId = null, commitments = [], evidence = {}, profile = null } = {}) {
  const spec = MEDIUM_BEHAVIORS[languageId] || null;
  const states = [], errors = [];
  for (const c of Array.isArray(commitments) ? commitments : []) {
    if (!c || typeof c !== "object") continue;
    const lang = c.language || languageId;
    const s = MEDIUM_BEHAVIORS[lang] || spec;
    const key = c.behavior;
    const known = !!s && s.behaviors.includes(key);
    const ev = evidence[`${lang}:${key}`] || evidence[key] || null;
    const r = known ? classifyEvidence(ev) : { level: "none", state: "unavailable", why: `no defining behaviour named "${key}" for language ${lang || "?"}`, refs: [] };
    const row = { commitment_id: c.id ?? null, event_id: c.event_id ?? null, language: lang || null, behavior: key ?? null, state: r.state, level: r.level, why: r.why, evidence_refs: r.refs,
      disclosure: r.state === "available" ? null : `${lang || "this medium"} "${key}" is ${r.state} (${r.level}): say so before it becomes a promise; a change goes through Look/Storyboard revision, never relabelled as the same style` };
    states.push(row);
    if (r.state === "unavailable") errors.push({ code: CREATIVE_ERROR_CODES.capability_unavailable, commitment_id: row.commitment_id });
  }
  const summary = { available: 0, uncertain: 0, unavailable: 0 };
  for (const r of states) summary[r.state]++;
  return { language_id: languageId, profile_id: profile && profile.id ? profile.id : null, states, summary, errors };
}

// ---- V3 W08: generic fluency/finish checks as SCOPED diagnostics -----------------------------------------------------------------------------------
// A taste diagnostic is conditioned on the selected visual language. Never a hard rule, never applied outside its scope, never a global quota.
export const VISUAL_LANGUAGES = Object.freeze(["formal", "typographic", "procedural", "hybrid"]);
export const SCOPED_DIAGNOSTICS = Object.freeze({
  "depth-quota": { scope: ["formal"], why: "flat graphic direction need not carry depth layers" },
  "multi-plane-depth": { scope: ["formal", "typographic"], why: "flat/typographic looks are legitimate without parallax planes" },
  "grain-glow": { scope: ["formal", "typographic"], why: "atmospheric finish is optional for flat looks" },
  "lighting-shadow": { scope: ["formal", "typographic"], why: "lighting is a choice, not a minimum" },
  "atmosphere-finish": { scope: ["formal", "typographic"], why: "flat graphic direction may disable atmospheric finish" },
  "continuous-motion": { scope: ["formal", "typographic", "procedural"], why: "stepped, held or still timing is by design" },
  "fluency-metric": { scope: ["formal", "typographic", "procedural"], why: "recorded intentional stillness and stepped timing are not fluency failures" },
  "word-choreo": { scope: ["typographic"], why: "only text-led looks owe word choreography; other looks keep text as support" },
  "static-freeze": { scope: ["formal", "typographic", "procedural", "hybrid"], why: "a held pose or still emotion is legitimate where declared" },
});
// diagnostics: [id | {id}]; context: { visualLanguage, contract?, layerId?, sceneId?, intentionalStillness?:[sceneId], proofLayerIds?:[] }
// -> { enforce:[ids kept as before], scoped:[{id, mode:"scoped-out"|"review", reason, scope}], factual:[ids never qualified] }
// Unknown language or unknown diagnostic keeps the established check (legacy). `scoped-out` still lists the finding as review, never silently deletes it.
export function scopeDiagnostics(diagnostics = [], context = {}) {
  const lang = context.visualLanguage;
  const enforce = [], scoped = [], factual = [];
  for (const d of Array.isArray(diagnostics) ? diagnostics : []) {
    const id = typeof d === "string" ? d : d && d.id;
    if (!id) continue;
    if (ruleAuthority(id, d && d.kind) === "factual") { factual.push(id); continue; }
    const spec = SCOPED_DIAGNOSTICS[id];
    if (!spec || !VISUAL_LANGUAGES.includes(lang) || !spec.scope.includes(lang)) { enforce.push(id); continue; }
    const stillnessOnly = id === "static-freeze";
    if (stillnessOnly && !(Array.isArray(context.intentionalStillness) && context.sceneId && context.intentionalStillness.includes(context.sceneId))) { enforce.push(id); continue; }
    scoped.push({ id, mode: stillnessOnly ? "review" : "scoped-out", reason: spec.why, scope: lang });
  }
  return { enforce, scoped, factual };
}

// ---- V3 W08: deferred acceptance cases (specs only; nothing here runs) -----------------------------------------------------------------------------
export const MEDIUM_PERFORMANCE_CASES = Object.freeze([
  { id: "MED-01", setup: "cel profile exists, acting runtime never demonstrated", expect: "resolveMediumPerformance: character behaviours uncertain (source_present at best), disclosure present, never available" },
  { id: "MED-02", setup: "paper look = textured moving rectangles", expect: "paper cut/fold/layer reviewed; texture-only evidence stays uncertain; weak_substitution named" },
  { id: "MED-03", setup: "pixel composition with sharp evidence-UI layer", expect: "scopeDiagnostics/resolveMediumRules scope grid rules to pixel layers; proof layer stays sharp (hard rules intact)" },
  { id: "MED-04", setup: "face expression replaced abruptly vs approved acting", expect: "character-performance expressionDiscontinuities returns the frame interval" },
  { id: "MED-05", setup: "held prop floats from a hand", expect: "character-performance contactCoverage flags contact interval not covered/attached" },
  { id: "MED-06", setup: "flat graphic film without atmospheric finish", expect: "scopeDiagnostics(visualLanguage formal) scopes out depth/grain/lighting quotas as review, no failure" },
  { id: "MED-07", setup: "diagram animates nodes, obscures relationship", expect: "diagram review question on causal order; total motion is not the criterion" },
  { id: "MED-08", setup: "typography changes meaning through layout/action", expect: "typography review questions (meaning, readability); text-led work not rejected categorically" },
  { id: "EDGE-01", setup: "caption-only task", expect: "no medium performance commitments => resolveMediumPerformance returns empty states; no concept/footage change" },
  { id: "EDGE-06", setup: "CJK/RTL or unfamiliar script in proof", expect: "pixel glyph-legibility without evidence stays uncertain; locale_text_support adaptation, honest limitation" },
  { id: "EDGE-07", setup: "reduced motion / accessibility", expect: "reduced-motion and a11y remain factual (HARD_RULE_IDS); kinetic diagnostics scoped out, meaning/readability kept" },
]);
