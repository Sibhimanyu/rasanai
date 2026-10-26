// Assignment-aware medium suitability and option diversity (M02). Pure and import-safe: no file, network, process,
// browser or model access, no writes. Mechanical eligibility (hard facts) is kept apart from semantic fit, which is
// only ever SUPPLIED by the Director/designer: nothing here infers taste. Output is a recommendation for
// <run>/creative/medium-selection.json; it grants no approval, capability or timing. No public percentages.
// Codes against the frozen medium-profile@1 / assignment shapes in the M01 contract; unknown fields are tolerated.
import { canonicalDigest } from "./contracts.mjs";
import { proposeMediumAdaptations, DEFAULT_ADAPTATION_CATALOG } from "./medium-adaptations.mjs";

export { proposeMediumAdaptations, DEFAULT_ADAPTATION_CATALOG };
export const SELECTION_FORMAT = "medium-selection@1";
export const ELIGIBILITY_STATES = ["eligible", "conditional", "blocked", "unknown"];
export const FIT_LEVELS = ["strong", "mixed", "weak", "unknown"];
export const FIT_DIMENSIONS = ["proof_clarity", "premise_relation", "tone", "audience_understanding", "brand_compatibility", "native_actions", "distinctiveness", "production_tradeoffs"];
export const DIFFERENCE_AXES = ["visual_material", "narrative_action", "composition", "motion", "sound"];
export const DEFAULT_REQUESTED_COUNT = 3;
export const DEFAULT_INTERNAL_LIMIT = 6; // proposed starting limit, not a measured optimum

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const low = (x) => str(x).trim().toLowerCase();
const uniq = (a) => [...new Set(a)];
const reason = (code, constraint_ref, detail, severity, source_refs = []) => ({ code, constraint_ref: constraint_ref ?? null, detail, severity, source_refs: arr(source_refs) });

// ids a media request may name: the profile, its family, its execution profile, or one of its style refs.
const profileKeys = (p) => uniq([p.id, p.family_id, p.execution_id, ...arr(p.style_refs)].filter(Boolean).map(low));
const namedHit = (p, list) => arr(list).some((m) => profileKeys(p).includes(low(isObj(m) ? m.id : m)));

// A constraint blocks a profile by naming what it blocks; vague "B2B" or "serious" never matches anything here.
function constraintBlocks(c, p) {
  const b = isObj(c.blocks) ? c.blocks : {};
  return arr(b.profile_ids).some((x) => low(x) === low(p.id)) || arr(b.family_ids).some((x) => low(x) === low(p.family_id)) ||
    arr(b.execution_ids).some((x) => low(x) === low(p.execution_id)) || arr(b.native_actions).some((x) => arr(p.native_actions).includes(x)) ||
    arr(b.tags).some((x) => arr(p.visual_material).includes(x) || arr(p.tags).includes(x));
}

// Proof policy values per need kind (profile.proof_policy keys use underscores: exact_ui, protected_text, ...).
const POLICY_KEY = { "exact-ui": "exact_ui", "protected-text": "protected_text", "exact-copy": "protected_text", "claim": "claim_mutation", "data": "data_precision" };
const NEEDS_LAYER = new Set(["readable-or-separate-layer", "separate-layer", "proof-layer", "separate-full-resolution-layer"]);
const ASSESS = new Set(["assess-legibility", "assess"]);
const UNSUPPORTED = new Set(["unsupported", "blocked", "forbidden-native"]);

// -> {state, reasons:[{code,constraint_ref,detail,severity,source_refs}], possible_adaptations:[ids], user_requested, tradeoffs}
// resources: {capabilities?, assets?, rights?, policy?, adaptationCatalog?}. Missing facts yield `unknown`, never a probe.
export function assessMediumEligibility(profile, assignment, resources = {}) {
  const p = isObj(profile) ? profile : {};
  const a = isObj(assignment) ? assignment : {};
  const r = isObj(resources) ? resources : {};
  const reasons = [];
  const ud = isObj(a.user_direction) ? a.user_direction : {};
  const userRequested = namedHit(p, ud.named_media);
  const srcAction = ud.source_action_id ?? null;

  // 1. explicit user prohibition
  if (namedHit(p, ud.excluded_media)) reasons.push(reason("excluded_by_user", srcAction, "the user excluded this medium", "hard", srcAction ? [srcAction] : []));

  // 2. actual brand constraints (typed, sourced). Inferred preferences never block; they can only be uncertainty.
  const brand = isObj(a.brand) ? a.brand : {};
  for (const c of [...arr(brand.hard_constraints), ...arr(brand.motion_constraints)]) {
    if (!isObj(c) || c.binding_kind === "inferred") continue;
    if (constraintBlocks(c, p)) reasons.push(reason("brand_hard_constraint", c.id || c.source || null, `${str(c.reason, "declared brand constraint")} (scope: ${str(c.scope, "unspecified")})`, "hard", [c.source].filter(Boolean)));
  }
  // profile.hard_exclusions must name a real constraint kind present in the assignment, never an industry.
  const kinds = new Set([...arr(brand.hard_constraints), ...arr(brand.motion_constraints)].filter((c) => isObj(c) && c.binding_kind !== "inferred").map((c) => low(c.kind)));
  for (const ex of arr(p.hard_exclusions)) {
    const k = low(isObj(ex) ? ex.constraint_kind || ex.constraint : ""); // integration fix: M01 names the field `constraint` ({constraint, reason})
    if (k && kinds.has(k)) reasons.push(reason("profile_hard_exclusion", isObj(ex) ? ex.id || k : k, str(ex.detail || ex.reason, `excluded by declared constraint ${k}`), "hard"));
  }

  // 3. buildability and capability: five distinct states, never merged, never inferred from a ranking.
  const state = low(p.state);
  if (["planned", "reference_only", "reference-only"].includes(state) && !p.capability_ref)
    reasons.push(reason("not_buildable", p.id ?? null, "reference or planned only: no registered implementation, so it cannot be advertised as buildable", "hard"));
  else if (["disabled", "unavailable_here", "not_permitted"].includes(state) && !p.capability_ref)
    reasons.push(reason(state, p.id ?? null, `profile state is ${state} and no capability record resolves it`, "hard"));
  const caps = arr(r.capabilities).concat(arr(a.capabilities));
  const cap = p.capability_ref ? caps.find((c) => isObj(c) && (c.id === p.capability_ref || c.ref === p.capability_ref)) : null;
  if (p.capability_ref && !cap) reasons.push(reason("capability_unknown", p.capability_ref, "no capability record supplied; not probing", "unknown"));
  if (cap) {
    if (cap.permitted === false) reasons.push(reason("not_permitted", cap.id || p.capability_ref, str(cap.reason, "not permitted by the current workflow"), "hard"));
    if (cap.enabled === false) reasons.push(reason("disabled", cap.id || p.capability_ref, str(cap.reason, "disabled"), "hard"));
    if (cap.implemented === false || (cap.available === false && !(low(cap.state) === "implemented_unvalidated" && cap.api_note))) reasons.push(reason("unavailable_here", cap.id || p.capability_ref, str(cap.reason, "not implemented or not available on this host"), "hard"));
    for (const k of ["implemented", "available", "enabled", "permitted"]) if (cap[k] === undefined) reasons.push(reason("capability_unknown", `${cap.id || p.capability_ref}.${k}`, `${k} not recorded`, "unknown"));
    if (low(cap.state) === "implemented_unvalidated" && str(cap.api_note || cap.reason)) reasons.push(reason("runtime_api_unconfirmed", cap.id || p.capability_ref, str(cap.api_note || cap.reason), "condition"));
    if (cap.verified !== true) reasons.push(reason("unverified", cap.id || p.capability_ref, "not verified for this scope; usable only as unvalidated", "info"));
  }
  const pol = isObj(r.policy) ? r.policy : {};
  if (arr(pol.blocked_execution_ids).includes(p.execution_id)) reasons.push(reason("resource_policy", "policy.blocked_execution_ids", "execution profile blocked by the resolved production policy", "hard"));

  // 4. exact proof preservation: a specific problem with a specific remedy, not a verdict on the whole medium.
  const pp = isObj(p.proof_policy) ? p.proof_policy : {};
  for (const need of arr(a.proof_needs)) {
    if (!isObj(need)) continue;
    const v = low(pp[POLICY_KEY[need.kind] || str(need.kind).replace(/-/g, "_")] || (need.precision === "exact" ? pp.protected_text : ""));
    const ref = need.id || null, srcs = [...arr(need.claim_refs), ...arr(need.required_text_refs)];
    if (!v) { if (need.precision === "exact") reasons.push(reason("proof_legibility_unassessed", ref, "profile states no policy for this exact proof", "condition", srcs)); continue; }
    if (NEEDS_LAYER.has(v) && need.precision === "exact") reasons.push(reason("proof_needs_separate_layer", ref, "exact proof needs a full-resolution layer", "condition", srcs));
    else if (ASSESS.has(v)) reasons.push(reason("proof_legibility_unassessed", ref, `legibility at ${str(a.destination && a.destination.viewing_size, "the stated viewing size")} must be judged`, "condition", srcs));
    else if (UNSUPPORTED.has(v)) reasons.push(reason("protected_text_unreadable_risk", ref, "native treatment cannot carry this proof", "condition", srcs));
  }

  // 5. assets and rights: missing real evidence is never fabricated; optional assets may have an original alternative.
  const have = new Map(arr(a.assets).filter(isObj).map((x) => [x.id || x.kind, x]));
  for (const rawNeed of arr(p.asset_needs)) {
    const need = typeof rawNeed === "string" ? { id: rawNeed, kind: rawNeed, required: false, original_alternative: true } : rawNeed; // integration: a bare string need is optional-with-alternative, never an evidence demand
    if (!isObj(need)) continue;
    const asset = have.get(need.id) || have.get(need.kind);
    const ref = need.id || need.kind || null;
    if (asset && asset.rights === "restricted") { reasons.push(reason("rights_restricted", ref, "asset rights do not permit this use", "hard")); continue; }
    if (asset && (asset.rights === "unknown" || asset.rights === undefined) && need.rights_required) reasons.push(reason("rights_unknown", ref, "rights status unknown; not assumed cleared", "unknown"));
    if (asset && asset.available === undefined) reasons.push(reason("asset_unknown", ref, "availability not recorded", "unknown"));
    if (!asset || asset.available === false) {
      if (need.evidence || need.required === true && !need.original_alternative) reasons.push(reason("missing_evidence_asset", ref, "required real asset is missing and cannot be invented", "hard"));
      else if (need.required === false || need.original_alternative) reasons.push(reason("optional_asset_missing", ref, "optional asset missing; an original compatible alternative may exist", "condition"));
    }
  }

  // 6. locale/script: a glyph or direction gap is a text-layer problem, not a medium ban.
  const dest = isObj(a.destination) ? a.destination : {};
  const script = low(dest.script || dest.locale_script);
  if (script && arr(isObj(p.text_constraints) ? p.text_constraints.unsupported_scripts : []).map(low).includes(script))
    reasons.push(reason("locale_text_support", script, `the medium's native text cannot render the ${script} script`, "condition"));

  const sev = (s) => reasons.some((x) => x.severity === s);
  const outState = sev("hard") ? "blocked" : sev("unknown") ? "unknown" : sev("condition") ? "conditional" : "eligible";
  const possible = outState === "blocked" ? [] : proposeMediumAdaptations(p, { reasons }, r.adaptationCatalog || DEFAULT_ADAPTATION_CATALOG, { proofNeeds: a.proof_needs }).candidates.map((c) => c.adaptation_id);
  const tradeoffs = userRequested && reasons.some((x) => x.severity === "condition") ? ["the user asked for this medium; the conditions are shown, not substituted away"] : [];
  return { state: outState, reasons, possible_adaptations: possible, user_requested: userRequested, tradeoffs };
}

// -> {dimensions:{<dim>:{level,reason,ref}}, rationale:[short strings], unknowns:[...], evidence_refs:[...]}
// suppliedJudgment: {dimensions:{<dim>:{level,reason,ref}}, useful_native_actions?:[ids]} from the Director. No model call.
export function assessMediumFit(profile, assignment, suppliedJudgment) {
  const p = isObj(profile) ? profile : {};
  const j = isObj(suppliedJudgment) ? suppliedJudgment : {};
  const given = isObj(j.dimensions) ? j.dimensions : {};
  const dimensions = {}, unknowns = [], evidence_refs = [], rationale = [];
  for (const d of FIT_DIMENSIONS) {
    const g = given[d];
    if (!isObj(g)) { dimensions[d] = { level: "unknown", reason: "no judgment supplied", ref: null }; unknowns.push({ dimension: d, why: "no judgment supplied" }); continue; }
    if (!FIT_LEVELS.includes(g.level)) { dimensions[d] = { level: "unknown", reason: `unrecognised level ${JSON.stringify(g.level)}`, ref: null }; unknowns.push({ dimension: d, why: "invalid level" }); continue; }
    if (g.level !== "unknown" && (!str(g.reason).trim() || !str(g.ref).trim())) { dimensions[d] = { level: "unknown", reason: "judgment lacks a reason or a brief/story/source reference", ref: null }; unknowns.push({ dimension: d, why: "unsupported judgment" }); continue; }
    dimensions[d] = { level: g.level, reason: str(g.reason), ref: g.ref ?? null };
    if (g.ref) evidence_refs.push(g.ref);
    if (g.level === "unknown") unknowns.push({ dimension: d, why: str(g.reason, "judged unknown") });
    else rationale.push(`${d.replace(/_/g, " ")}: ${g.level} - ${g.reason}`);
  }
  // Native actions must be real ones of this profile; invented names are dropped and recorded as an unknown.
  const real = arr(p.native_actions), claimed = arr(j.useful_native_actions);
  const bad = claimed.filter((x) => !real.includes(x));
  if (bad.length) unknowns.push({ dimension: "native_actions", why: `named actions not on this profile: ${bad.join(", ")}` });
  return { dimensions, rationale, unknowns, evidence_refs: uniq(evidence_refs), useful_native_actions: claimed.filter((x) => real.includes(x)) };
}

// ---- Shortlist -------------------------------------------------------------------------------------------------
const rankFit = (fit) => {
  const d = (fit && fit.dimensions) || {};
  const val = (k) => ({ strong: 2, mixed: 1, unknown: 0, weak: -1 })[(d[k] && d[k].level) || "unknown"];
  // proof clarity first, then the sum of the rest; internal ordering only, never published
  return [val("proof_clarity"), FIT_DIMENSIONS.filter((k) => k !== "proof_clarity").reduce((s, k) => s + val(k), 0)];
};
const cmpRank = (x, y) => (y[0] - x[0]) || (y[1] - x[1]);
const diffCount = (x, y) => DIFFERENCE_AXES.filter((ax) => x.differences && y.differences && x.differences[ax] != null && y.differences[ax] != null && low(x.differences[ax]) !== low(y.differences[ax])).length;
const sameFamily = (x, y) => x.family_id && x.family_id === y.family_id;

// candidates: [{id, profile_id?, family_id, execution_id?, treatment_id?, differences:{visual_material,narrative_action,composition,motion,sound}, user_requested?, adaptation_of?}]
// assessments: {<id>:{eligibility:{state,reasons}, fit:{dimensions}}}. recent: [{family_id, execution_id}] (tie-break only).
// -> {selected:[ids], reserves:[ids], rejected:[{id,code,detail}], unresolved:[{id?,code,detail}], shortfall, notes, selection_digest}
export function selectMediumShortlist({ candidates, assessments, requestedCount, policy, recent } = {}) {
  const pol = isObj(policy) ? policy : {};
  const want = Number.isInteger(requestedCount) && requestedCount >= 1 ? requestedCount : Number.isInteger(pol.requested_count) && pol.requested_count >= 1 ? pol.requested_count : DEFAULT_REQUESTED_COUNT;
  const cap = Math.max(want, Number.isInteger(pol.internal_limit) ? pol.internal_limit : DEFAULT_INTERNAL_LIMIT);
  const asm = isObj(assessments) ? assessments : {};
  const rec = arr(recent);
  const rejected = [], unresolved = [], notes = [];
  const pool = [];
  for (const c of arr(candidates).filter((x) => isObj(x) && x.id).slice().sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const e = (asm[c.id] && asm[c.id].eligibility) || null;
    if (!e || !ELIGIBILITY_STATES.includes(e.state)) { unresolved.push({ id: c.id, code: "unassessed", detail: "no eligibility assessment supplied" }); continue; }
    if (e.state === "blocked") { rejected.push({ id: c.id, code: "blocked", detail: arr(e.reasons).filter((r) => r.severity === "hard").map((r) => r.code).join(", ") || "hard constraint" }); continue; }
    if (e.state === "unknown") { unresolved.push({ id: c.id, code: "eligibility_unknown", detail: arr(e.reasons).filter((r) => r.severity === "unknown").map((r) => r.code).join(", ") }); continue; }
    pool.push({ c, e, rank: rankFit(asm[c.id].fit), recentHit: rec.some((r) => isObj(r) && ((r.family_id && r.family_id === c.family_id) || (r.execution_id && r.execution_id === c.execution_id))) });
  }
  // Order: user-requested media are kept first; then eligible over conditional, proof/fit rank, not-recently-used, id.
  pool.sort((x, y) => (Number(!!y.c.user_requested) - Number(!!x.c.user_requested)) || ((x.e.state === "eligible" ? 0 : 1) - (y.e.state === "eligible" ? 0 : 1)) || cmpRank(x.rank, y.rank) || (Number(x.recentHit) - Number(y.recentHit)) || (x.c.id < y.c.id ? -1 : 1));

  const picked = [];
  const families = uniq(pool.map((x) => x.c.family_id).filter(Boolean));
  const strictBrand = pol.strict_brand === true;
  let remaining = pool.slice();
  // A near-duplicate (no differing axis against a picked option) is not diversity; it goes back for repair.
  const dupOf = (x, list) => list.find((y) => x.c.differences && y.c.differences && diffCount(x.c, y.c) === 0 && sameFamily(x.c, y.c) && low(x.c.treatment_id) === low(y.c.treatment_id));
  while (remaining.length && picked.length < cap) {
    let best = null, bestScore = null;
    for (const x of remaining) {
      const gain = picked.length ? Math.min(...picked.map((y) => (sameFamily(x.c, y.c) ? 0 : 2) + diffCount(x.c, y.c) + (low(x.c.treatment_id) !== low(y.c.treatment_id) ? 1 : 0))) : 0;
      const adequate = (x.rank[0] > 0 || x.c.user_requested) ? 1 : 0; // adequate proof/fit before novelty
      const score = [Number(!!x.c.user_requested), adequate, strictBrand ? 0 : gain, x.e.state === "eligible" ? 1 : 0, -Number(x.recentHit)];
      const lex = !best ? 1 : (score.map((v, i) => v - bestScore[i]).find((dv) => dv !== 0) || 0);
      if (lex > 0) { best = x; bestScore = score; }
    }
    remaining = remaining.filter((x) => x !== best);
    const d = dupOf(best, picked);
    if (d) { rejected.push({ id: best.c.id, code: "not_distinct", detail: `no meaningful difference from ${d.c.id}; repair within budget rather than pretend diversity`, needs_repair: true }); continue; }
    picked.push(best);
  }
  for (const x of remaining) rejected.push({ id: x.c.id, code: "over_internal_limit", detail: "eligible but beyond the internal shortlist limit" });
  const selected = picked.slice(0, want), reserves = picked.slice(want);
  if (families.length === 1 && selected.length > 1) notes.push(`only one family (${families[0]}) is feasible; the options are distinct treatments within it, not forced alternatives`);
  if (strictBrand) notes.push("strict brand brief: family diversity was not forced");
  let shortfall = null;
  if (selected.length < want) {
    shortfall = { requested: want, found: selected.length, path: "needs-you", explanation: "not enough feasible, distinct options; the configured count is kept and the gap is explained, not filled with unsupported candidates" };
    unresolved.push({ code: "insufficient_feasible_options", detail: `requested ${want}, found ${selected.length}` });
  }
  const out = { selected: selected.map((x) => x.c.id), reserves: reserves.map((x) => x.c.id), rejected, unresolved, shortfall, notes };
  out.selection_digest = canonicalDigest({ want, cap, considered: arr(candidates).map((c) => c && c.id).sort(), out });
  return out;
}

// Assemble the private sidecar for <run>/creative/medium-selection.json. A recommendation: never approval or timing.
export function buildMediumSelection({ pins, registryDigest, candidates, assessments, adaptations, shortlist, limitations } = {}) {
  const doc = {
    format: SELECTION_FORMAT,
    authority: "recommendation",
    pins: { brief_pin: (pins && pins.brief_pin) || null, story_pin: (pins && pins.story_pin) || null, constraints_revision: (pins && pins.constraints_revision) || null, registry_digest: registryDigest || null },
    considered: arr(candidates).map((c) => c.id),
    assessments: isObj(assessments) ? assessments : {},
    adaptations: arr(adaptations),
    selected: shortlist.selected, reserves: shortlist.reserves, rejected: shortlist.rejected, unresolved: shortlist.unresolved, shortfall: shortlist.shortfall,
    notes: shortlist.notes,
    selection_digest: shortlist.selection_digest,
    limitations: arr(limitations).length ? limitations : ["Fit judgments are supplied by the Director; none were inferred or verified here.", "All candidates are unvalidated until an authorized test scope."],
  };
  return doc;
}

const TIMING_KEYS = new Set(["start", "end", "duration", "timestamp", "at_ms", "time"]);
const APPROVAL_KEYS = new Set(["approved", "approval", "authorized", "consent", "just_make_it"]);
const hasKey = (o, keys, depth = 0) => isObj(o) && depth < 6 && Object.entries(o).some(([k, v]) => (keys.has(k) && v) || hasKey(v, keys, depth + 1) || (Array.isArray(v) && v.some((i) => hasKey(i, keys, depth + 1))));

// -> {ok, errors:[{code,path,message}], warnings:[]}: checks provenance and logic, never taste.
export function validateFitDecision(decision, { assignment, profiles, expectedPins, requestedCount } = {}) {
  const errors = [], warnings = [];
  const e = (code, path, message) => errors.push({ code, path, message });
  if (!isObj(decision)) return { ok: false, errors: [{ code: "not_object", path: "", message: "decision must be an object" }], warnings };
  if (decision.format !== SELECTION_FORMAT) e("bad_format", "format", `format must be ${SELECTION_FORMAT}`);
  if (decision.authority !== "recommendation") e("bad_authority", "authority", "a selection is a recommendation, never an approval");
  if (hasKey(decision, APPROVAL_KEYS)) e("approval_claimed", "", "a fit decision must not carry approval or authorization claims");
  if (hasKey(decision, TIMING_KEYS)) e("timing_authority", "", "a fit decision must not carry timing; the score or footage authority owns it");
  const pins = isObj(decision.pins) ? decision.pins : {}, want = isObj(expectedPins) ? expectedPins : {};
  const dig = (p) => (isObj(p) ? p.digest : p);
  for (const k of ["brief_pin", "story_pin"]) if (want[k] !== undefined && dig(pins[k]) !== dig(want[k])) e("stale_pin", `pins.${k}`, `${k} does not match the current pin`);
  for (const k of ["constraints_revision", "registry_digest"]) if (want[k] !== undefined && pins[k] !== want[k]) e("stale_pin", `pins.${k}`, `${k} does not match the current value`);
  const known = new Set((Array.isArray(profiles) ? profiles : Object.values(isObj(profiles) ? profiles : {})).map((p) => p && p.id).filter(Boolean));
  const considered = arr(decision.considered), consSet = new Set(considered);
  const idBase = (id) => str(id).split("+")[0];
  considered.forEach((id, i) => { if (known.size && !known.has(idBase(id))) e("unknown_profile", `considered[${i}]`, `${id} is not a resolvable profile`); });
  const asm = isObj(decision.assessments) ? decision.assessments : {};
  const ud = isObj(assignment && assignment.user_direction) ? assignment.user_direction : {};
  const all = [...arr(decision.selected), ...arr(decision.reserves)];
  for (const id of all) {
    const st = asm[id] && asm[id].eligibility && asm[id].eligibility.state;
    if (!consSet.has(id)) e("not_considered", `selected.${id}`, "chosen candidate was never considered");
    if (st === undefined) e("no_assessment", `assessments.${id}`, "chosen candidate has no eligibility assessment");
    else if (st === "blocked" || st === "unknown") e("ineligible_selected", `assessments.${id}`, `a ${st} candidate cannot be selected`);
    if (known.size && known.has(idBase(id))) { /* profile exists */ }
    if (arr(ud.excluded_media).some((m) => low(idBase(id)) === low(isObj(m) ? m.id : m))) e("excluded_selected", id, "an explicitly excluded medium was selected");
  }
  for (const [id, a] of Object.entries(asm)) {
    const fit = isObj(a) && isObj(a.fit) ? a.fit : null;
    for (const [d, v] of Object.entries(fit && isObj(fit.dimensions) ? fit.dimensions : {})) {
      if (!FIT_DIMENSIONS.includes(d)) e("bad_dimension", `assessments.${id}.fit.${d}`, "unknown fit dimension");
      if (!isObj(v) || !FIT_LEVELS.includes(v.level)) e("bad_level", `assessments.${id}.fit.${d}`, `level must be one of ${FIT_LEVELS.join(", ")} (no numeric scores)`);
      else if (v.level !== "unknown" && (!str(v.reason).trim() || !v.ref)) e("unsupported_judgment", `assessments.${id}.fit.${d}`, "a non-unknown judgment needs a reason and a brief/story/source ref");
    }
    const state = isObj(a) && isObj(a.eligibility) ? a.eligibility.state : null;
    if (state && !ELIGIBILITY_STATES.includes(state)) e("bad_state", `assessments.${id}.eligibility.state`, "bad eligibility state");
    if ((state === "blocked" || state === "conditional" || state === "unknown") && !arr(a.eligibility.reasons).length) e("no_reasons", `assessments.${id}.eligibility`, `${state} needs named reasons`);
  }
  // explicit requested media must survive unless blocked or rejected with a reason
  for (const m of arr(ud.named_media)) {
    const id = low(isObj(m) ? m.id : m);
    const present = considered.some((c) => low(idBase(c)) === id);
    const kept = all.some((c) => low(idBase(c)) === id);
    const why = arr(decision.rejected).some((r) => low(idBase(r.id)) === id && r.detail);
    if (!present) e("requested_dropped", `user_direction.named_media`, `requested medium ${id} was never considered`);
    else if (!kept && !why) e("requested_dropped", `user_direction.named_media`, `requested medium ${id} vanished without a stated reason`);
  }
  for (const r of arr(decision.rejected)) if (!str(r.detail).trim()) e("no_reasons", `rejected.${r.id}`, "a rejection needs a reason");
  const want2 = Number.isInteger(requestedCount) ? requestedCount : null;
  if (want2 !== null && arr(decision.selected).length < want2 && !decision.shortfall) e("silent_count_drop", "selected", "fewer options than requested without an explicit shortfall");
  if (want2 !== null && arr(decision.selected).length > want2) e("count_exceeded", "selected", "more options than requested");
  const { selection_digest, ...rest } = decision;
  void rest;
  if (!selection_digest) warnings.push({ code: "no_digest", path: "selection_digest", message: "selection_digest missing" });
  return { ok: !errors.length, errors, warnings };
}

// ---- Authored case fixtures for M09 (data only; never executed here) ---------------------------------------------
const pixelProfile = { id: "pixel", family_id: "pixel-retro", execution_id: "pixel-native", style_refs: ["pixel"], native_actions: ["tile-assemble", "sprite-act", "palette-reveal"], capability_ref: null, state: "planned", proof_policy: { exact_ui: "assess-legibility", protected_text: "readable-or-separate-layer", claim_mutation: "forbidden" }, text_constraints: { unsupported_scripts: ["rtl"] } };
export const MEDIUM_FIT_CASES = Object.freeze([
  { id: "MF-same-product-different-objective", note: "same product, two objectives: fit rationales must differ; pixel is neither globally allowed nor banned",
    profile: pixelProfile, assignments: [{ communication_kind: "workflow-demo", proof_needs: [{ id: "p1", kind: "exact-ui", precision: "exact" }] }, { communication_kind: "awareness", proof_needs: [] }],
    expect: { first: "not eligible-clean (conditional or blocked by buildability)", second: "no proof reasons" } },
  { id: "MF-evidence-beats-novelty", profile: pixelProfile, assignments: [{ destination: { viewing_size: "phone" }, proof_needs: [{ id: "p1", kind: "exact-ui", precision: "exact" }] }], expect: { reasons_include: ["proof_legibility_unassessed", "proof_needs_separate_layer"], adaptations_include: ["pixel-companion-over-sharp-proof"] } },
  { id: "MF-brand-no-motion-restriction", assignments: [{ brand: { hard_constraints: [], inferred_preferences: [{ kind: "tone", detail: "corporate" }] } }], expect: { not_blocked_by_brand: true } },
  { id: "MF-brand-strict-no-characters", assignments: [{ brand: { hard_constraints: [{ id: "bc1", kind: "no-characters", source: "brand-guide", binding_kind: "hard", scope: "film", reason: "no illustrated characters", blocks: { tags: ["character"] } }] } }], expect: { code: "brand_hard_constraint" } },
  { id: "MF-user-requested-awkward-medium", assignments: [{ user_direction: { named_media: ["pixel"], source_action_id: "act-1" }, proof_needs: [{ id: "p1", kind: "protected-text", precision: "exact" }] }], expect: { user_requested: true, state_not: "blocked-by-taste", tradeoffs_nonempty: true } },
  { id: "MF-missing-assets", assignments: [{ assets: [] }], profileAssetNeeds: [{ id: "ui", kind: "product-ui", evidence: true }, { id: "bg", kind: "texture", required: false, original_alternative: true }], expect: { codes: ["missing_evidence_asset", "optional_asset_missing"], note: "no invented UI" } },
  { id: "MF-unknown-not-false", assignments: [{ capabilities: [] }], profileCapabilityRef: "cap-x", expect: { state: "unknown", code: "capability_unknown" } },
  { id: "MF-same-card-three-adjectives", candidates: ["a", "b", "c"], differencesEqual: true, expect: { rejected_code: "not_distinct" } },
  { id: "MF-one-family-only", candidates: ["a", "b", "c"], note: "strict brief; one family feasible", expect: { notes_include: "distinct treatments within it" } },
  { id: "MF-offline-no-references", requestedCount: 3, candidates: ["a"], expect: { shortfall: { requested: 3, found: 1 }, silent_count_drop: false } },
  { id: "MF-locale-rtl-or-cjk", assignments: [{ destination: { script: "rtl", locale: "ar" } }], profile: pixelProfile, expect: { code: "locale_text_support", adaptation: "proof-layer-hybrid" } },
]);
