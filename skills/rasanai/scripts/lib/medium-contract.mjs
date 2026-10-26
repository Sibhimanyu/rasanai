// The selected medium contract (`design/<label>/medium.json`, format medium-contract@1): an approved-Look EXTENSION that says which visual
// language(s) the film speaks, on which layer, what must never change, and which native actions carry the picture. It is NOT a decision,
// timing or approval source: the existing Look approval decides, motion/score.json times, the Director owns the film.
// Pure helpers. Import-safe: no network, model, render, spawn or write; nothing is read from disk.
//   validateMediumContract(doc, {assignment, profiles, capabilities}) -> {ok, errors:[{code,path,message}], warnings:[], limitations:[]}
//   mediumContractDigest(doc)                                         -> full canonical digest, derived/status/clock fields excluded
//   projectMediumForWorker(doc, {role, beatIds, shotIds, events, budget}) -> {mandatory, visual_refs, technique_refs, omitted_optional, blockers}
//   mediumContractCurrent(doc, expectedPins)                          -> {current, stale, missing}
import { canonicalDigest } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (x == null ? "" : String(x).trim());

export const MEDIUM_FORMAT = "medium-contract@1";
export const LAYER_ROLES = ["evidence", "editorial", "environment", "character", "annotation", "type"];
export const INVARIANT_KINDS = ["hard", "medium", "craft"];
export const PIN_KEYS = ["story_digest", "comparison_content_digest", "profile_digest"];
// derived, status or clock fields never enter the digest: a re-stamped file with the same content has the same identity
const DERIVED = new Set(["digest", "contract_digest", "status", "created_at", "updated_at", "generated_at", "validated_at", "checked_at", "receipt", "receipts"]);

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) if (!DERIVED.has(k)) o[k] = strip(v[k]); return o; }
  return v;
};
export const mediumContractDigest = (doc) => canonicalDigest(strip(isObj(doc) ? doc : null));

const err = (errors, code, path, message) => errors.push({ code, path, message });
// profiles: an array of records, {records:[...]}, or an object keyed by id (a medium-index@1 or its records)
const profileList = (profiles) => (Array.isArray(profiles) ? profiles : isObj(profiles) && Array.isArray(profiles.records) ? profiles.records : isObj(profiles) ? Object.values(profiles) : []);
// capabilities: object keyed by capability id / execution id -> {implemented, available, enabled, permitted, verified}
const capOf = (capabilities, ...keys) => { if (!isObj(capabilities)) return null; for (const k of keys) if (k && isObj(capabilities[k])) return capabilities[k]; return null; };

export function validateMediumContract(doc, { assignment, profiles, capabilities } = {}) {
  const errors = [], warnings = [], limitations = [];
  if (!isObj(doc)) { err(errors, "not-object", "", "the medium contract is not an object"); return { ok: false, errors, warnings, limitations }; }
  if (doc.format !== MEDIUM_FORMAT) err(errors, "format", "format", `format must be ${MEDIUM_FORMAT}`);
  for (const k of ["candidate_id", "profile_id", "family_id", "execution_id", "visual_premise", "decision_authority"]) if (!T(doc[k])) err(errors, "missing-field", k, `${k} is required`);
  const pins = isObj(doc.pins) ? doc.pins : {};
  for (const k of PIN_KEYS) if (!T(pins[k])) err(errors, "missing-pin", `pins.${k}`, `pins.${k} is required: a worker must know what the contract was cut from`);

  // layers: roles are a closed set; one layer is enough (a native single-language film)
  const layers = arr(doc.layers), layerIds = new Set();
  if (!layers.length) err(errors, "no-layers", "layers", "at least one layer is required");
  layers.forEach((l, i) => {
    const p = `layers[${i}]`;
    if (!isObj(l) || !T(l.id)) { err(errors, "layer-id", p, "a layer needs an id"); return; }
    if (layerIds.has(l.id)) err(errors, "layer-dup", p, `duplicate layer id ${l.id}`);
    layerIds.add(l.id);
    if (!LAYER_ROLES.includes(l.role)) err(errors, "layer-role", `${p}.role`, `role must be one of ${LAYER_ROLES.join(", ")}`);
    if (!T(l.medium)) err(errors, "layer-medium", `${p}.medium`, "name the medium of this layer");
    if (!T(l.renderer_ref)) err(errors, "layer-renderer", `${p}.renderer_ref`, "name the existing adapter that draws this layer (no second renderer)");
    if (l.protected_refs !== undefined && !Array.isArray(l.protected_refs)) err(errors, "layer-protected", `${p}.protected_refs`, "protected_refs must be an array");
  });

  const invs = arr(doc.invariants), invIds = new Set();
  invs.forEach((v, i) => {
    const p = `invariants[${i}]`;
    if (!isObj(v) || !T(v.id)) { err(errors, "invariant-id", p, "an invariant needs an id"); return; }
    if (invIds.has(v.id)) err(errors, "invariant-dup", p, `duplicate invariant id ${v.id}`);
    invIds.add(v.id);
    if (!INVARIANT_KINDS.includes(v.kind)) err(errors, "invariant-kind", `${p}.kind`, `kind must be one of ${INVARIANT_KINDS.join(", ")}`);
    if (!T(v.description)) err(errors, "invariant-desc", `${p}.description`, "describe the invariant so a juror can answer yes or no");
    if (v.kind === "hard" && !arr(v.source_refs).length) err(errors, "invariant-source", `${p}.source_refs`, "a hard invariant points at the proof, brand or authorization it protects");
  });

  const acts = arr(doc.native_actions), actIds = new Set();
  acts.forEach((a, i) => {
    const p = `native_actions[${i}]`;
    if (!isObj(a) || !T(a.id)) { err(errors, "action-id", p, "a native action needs an id"); return; }
    if (actIds.has(a.id)) err(errors, "action-dup", p, `duplicate action id ${a.id}`);
    actIds.add(a.id);
    if (!T(a.serves)) err(errors, "action-serves", `${p}.serves`, "say what the viewer understands because of this action (not an effect for its own sake)");
    const b = a.event_binding;
    if (b != null && !(typeof b === "string" || (isObj(b) && (T(b.event_id) || T(b.beat_id) || T(b.shot_id))))) err(errors, "action-binding", `${p}.event_binding`, "event_binding is null, a stable id or {event_id|beat_id|shot_id}; times live in the score");
    if (isObj(b) && ("t" in b || "time" in b || "t0" in b)) err(errors, "action-time", `${p}.event_binding`, "a medium contract never carries timing");
  });
  if (!acts.length && !T(doc.native_actions_none_reason)) warnings.push({ code: "no-actions", path: "native_actions", message: "no native action declared: say why in native_actions_none_reason if the film is deliberately a single held picture" });

  const tp = isObj(doc.text_policy) ? doc.text_policy : null;
  if (!tp) err(errors, "text-policy", "text_policy", "text_policy is required (text is optional, but its role is declared)");
  else for (const id of arr(tp.full_resolution_layers)) if (!layerIds.has(id)) err(errors, "text-layer", "text_policy.full_resolution_layers", `unknown layer ${id}`);
  const fin = isObj(doc.finish_policy) && isObj(doc.finish_policy.by_layer) ? doc.finish_policy.by_layer : null;
  if (!isObj(doc.finish_policy)) err(errors, "finish-policy", "finish_policy", "finish_policy.by_layer is required: finish is resolved per layer, never one global filter");
  else if (fin) for (const id of Object.keys(fin)) if (!layerIds.has(id)) err(errors, "finish-layer", "finish_policy.by_layer", `unknown layer ${id}`);
  // a sharp layer must be named per layer: a missing entry would fall back to a film-wide finish that blurs or grains the proof
  if (fin) {
    const hasSharp = Object.values(fin).includes("sharp");
    if (hasSharp) for (const id of layerIds) if (!(id in fin)) err(errors, "finish-uncovered", "finish_policy.by_layer", `layer ${id} has no finish_policy.by_layer entry although the contract declares a sharp layer: a missing entry is an error, never a fallback to a film-wide finish`);
  }
  if (doc.profile_id === "pixel-companion" || doc.execution_id === "pixel-companion" || doc.profile_id === "living-screencast") {
    const ev = layers.filter((l) => isObj(l) && l.role === "evidence" && T(l.id));
    if (!ev.length) err(errors, "companion-no-evidence", "layers", "a pixel-companion contract needs a layer with role evidence (the sharp proof layer)");
    const sharpIds = fin ? Object.keys(fin).filter((k) => fin[k] === "sharp") : [];
    if (!sharpIds.length) err(errors, "companion-no-sharp", "finish_policy.by_layer", "a pixel-companion contract needs a sharp entry in finish_policy.by_layer");
    const fr = new Set(arr(tp && tp.full_resolution_layers));
    if (sharpIds.length && !sharpIds.some((id) => fr.has(id))) err(errors, "companion-sharp-text", "text_policy.full_resolution_layers", "the sharp layer must be listed in text_policy.full_resolution_layers");
  }
  if (!isObj(doc.motion_policy)) err(errors, "motion-policy", "motion_policy", "motion_policy is required");
  const eb = isObj(doc.evidence_boundaries) ? doc.evidence_boundaries : null;
  if (!eb) err(errors, "evidence-boundaries", "evidence_boundaries", "evidence_boundaries is required");
  else if (eb.editorial_metaphor_is_product_ui !== false) err(errors, "metaphor-as-ui", "evidence_boundaries.editorial_metaphor_is_product_ui", "an editorial metaphor is never the product's real UI: this must be false");

  // proof: every declared proof need is protected by a layer ref or a hard invariant source
  const protectedRefs = new Set([...layers.flatMap((l) => arr(l && l.protected_refs)), ...invs.flatMap((v) => arr(v && v.source_refs))].map(T));
  const as = isObj(assignment) ? assignment : null;
  if (as) {
    for (const n of arr(as.proof_needs)) {
      const refs = [...arr(n && n.required_text_refs), ...arr(n && n.claim_refs), n && n.id].map(T).filter(Boolean);
      if (refs.length && !refs.some((r) => protectedRefs.has(r))) err(errors, "proof-unprotected", "layers", `proof need ${T(n && n.id) || "?"} is not protected by any layer protected_refs or hard invariant`);
    }
    if (as.story_pin && T(as.story_pin.digest) && T(pins.story_digest) && as.story_pin.digest !== pins.story_digest) err(errors, "pin-story", "pins.story_digest", "the contract is cut from a different story than the assignment");
    const ex = arr(as.user_direction && as.user_direction.excluded_media).map((x) => T(x).toLowerCase());
    for (const k of ["profile_id", "family_id", "execution_id"]) if (ex.includes(T(doc[k]).toLowerCase())) err(errors, "user-excluded", k, `${doc[k]} is a medium the user excluded`);
  }

  // profile and capability truth: unknown is explicit, unverified is a limitation, never silently enabled
  if (profiles !== undefined) {
    const prof = profileList(profiles).find((p) => isObj(p) && (p.id === doc.profile_id || p.canonical_id === doc.profile_id));
    if (!prof) err(errors, "unknown-profile", "profile_id", `profile ${T(doc.profile_id) || "?"} is not in the medium index`);
    else {
      if (prof.family_id && prof.family_id !== doc.family_id) err(errors, "family-mismatch", "family_id", `profile belongs to family ${prof.family_id}`);
      if (prof.execution_id && prof.execution_id !== doc.execution_id) err(errors, "execution-mismatch", "execution_id", `profile executes as ${prof.execution_id}`);
      if (prof.evidence && prof.evidence.basis && prof.evidence.basis !== "verified-scope") limitations.push(`profile evidence is ${prof.evidence.basis}: not verified for this scope`);
    }
  }
  if (capabilities !== undefined) {
    const c = capOf(capabilities, doc.execution_id, doc.profile_id);
    if (!c) limitations.push(`no capability record for ${T(doc.execution_id) || "?"}: availability is unknown, not assumed`);
    else {
      for (const k of ["implemented", "available", "enabled", "permitted"]) if (c[k] === false) err(errors, `capability-${k}`, "execution_id", `${doc.execution_id} is not ${k}${T(c.reason) ? `: ${c.reason}` : ""}`);
      if (c.verified !== true) limitations.push(`${doc.execution_id} is not verified for this scope`);
    }
  }
  for (const l of arr(doc.limitations)) limitations.push(T(l));
  return { ok: !errors.length, errors, warnings, limitations };
}

// What each role needs beyond the mandatory core. The core (hard invariants, evidence layers, evidence boundaries, authority, pins) is always sent.
const ROLE_SECTIONS = {
  "design-system-designer": ["layers", "native_actions", "text_policy", "motion_policy", "finish_policy", "sound_intent"],
  "styleframe-designer": ["layers", "native_actions", "text_policy", "finish_policy"],
  "frame-designer": ["layers", "native_actions", "text_policy", "finish_policy"],
  "frame-juror": ["layers", "native_actions", "text_policy", "finish_policy", "motion_policy"],
  "motion-director": ["layers", "native_actions", "motion_policy", "sound_intent", "text_policy"],
  "film-builder": ["layers", "native_actions", "motion_policy", "finish_policy", "text_policy"],
  "scene-animator": ["layers", "native_actions", "motion_policy", "finish_policy", "text_policy"],
};
const bindingIds = (b) => (b == null ? [] : typeof b === "string" ? [b] : [b.event_id, b.beat_id, b.shot_id].map(T).filter(Boolean));

// The subset one worker receives. budget (optional) caps optional items: { max_actions, max_examples }.
export function projectMediumForWorker(doc, { role, beatIds, shotIds, events, budget } = {}) {
  const blockers = [];
  if (!isObj(doc) || doc.format !== MEDIUM_FORMAT) return { mandatory: null, visual_refs: [], technique_refs: [], omitted_optional: [], blockers: ["no usable medium contract: the worker falls back to the Look and visual bible alone"] };
  const layers = arr(doc.layers);
  if (!layers.length) blockers.push("the medium contract has no layers");
  const sections = new Set(ROLE_SECTIONS[role] || ROLE_SECTIONS["scene-animator"]);
  const hard = arr(doc.invariants).filter((v) => v && v.kind === "hard");
  const mandatory = {
    digest: mediumContractDigest(doc), pins: doc.pins || {}, candidate_id: doc.candidate_id, profile_id: doc.profile_id, family_id: doc.family_id, execution_id: doc.execution_id,
    visual_premise: doc.visual_premise, decision_authority: doc.decision_authority,
    hard_invariants: hard, evidence_layers: layers.filter((l) => l && l.role === "evidence").map((l) => ({ id: l.id, medium: l.medium, renderer_ref: l.renderer_ref, protected_refs: arr(l.protected_refs) })),
    evidence_boundaries: doc.evidence_boundaries || {}, limitations: arr(doc.limitations),
  };
  const ids = new Set([...arr(beatIds), ...arr(shotIds), ...arr(events).map((e) => (isObj(e) ? e.id || e.event_id : e))].map(T).filter(Boolean));
  const scoped = ids.size > 0;
  const bound = arr(doc.native_actions).filter((a) => a && (!scoped || bindingIds(a.event_binding).length === 0 || bindingIds(a.event_binding).some((x) => ids.has(x))));
  const maxA = Number.isInteger(budget && budget.max_actions) ? budget.max_actions : bound.length;
  const maxE = Number.isInteger(budget && budget.max_examples) ? budget.max_examples : arr(doc.example_refs).length;
  const omitted_optional = [];
  const visual_refs = sections.has("layers") ? layers.map((l) => ({ id: l.id, role: l.role, medium: l.medium, renderer_ref: l.renderer_ref, protected_refs: arr(l.protected_refs) })) : [];
  const technique_refs = [];
  if (sections.has("native_actions")) {
    // actions bound to this worker's beats, shots or events come first; unbound ones fill what the budget leaves
    const ranked = [...bound].sort((a, b) => Number(bindingIds(b.event_binding).length > 0) - Number(bindingIds(a.event_binding).length > 0));
    ranked.slice(0, maxA).forEach((a) => technique_refs.push({ kind: "native_action", id: a.id, serves: a.serves, event_binding: a.event_binding ?? null }));
    ranked.slice(maxA).forEach((a) => omitted_optional.push(`native_action:${a.id}`));
    arr(doc.example_refs).slice(0, maxE).forEach((e) => technique_refs.push({ kind: "example", ref: e }));
    arr(doc.example_refs).slice(maxE).forEach((e) => omitted_optional.push(`example:${isObj(e) ? e.id : e}`));
  }
  for (const k of ["text_policy", "motion_policy", "finish_policy", "sound_intent"]) if (sections.has(k) && doc[k] !== undefined) mandatory[k] = doc[k];
  for (const v of arr(doc.invariants)) if (v && v.kind !== "hard" && sections.has("layers")) (mandatory.medium_invariants ||= []).push(v);
  return { mandatory, visual_refs, technique_refs, omitted_optional, blockers };
}

// expectedPins: any of { story_digest, comparison_content_digest, profile_digest, contract_digest }. A pin the caller omits is not checked.
export function mediumContractCurrent(doc, expectedPins = {}) {
  const stale = [], missing = [];
  if (!isObj(doc)) return { current: false, stale, missing: ["contract"] };
  const pins = isObj(doc.pins) ? doc.pins : {};
  for (const k of PIN_KEYS) {
    if (expectedPins[k] === undefined || expectedPins[k] === null) continue;
    if (!T(pins[k])) missing.push(k); else if (pins[k] !== expectedPins[k]) stale.push(k);
  }
  if (T(expectedPins.contract_digest) && mediumContractDigest(doc) !== expectedPins.contract_digest) stale.push("contract_digest");
  return { current: !stale.length && !missing.length, stale, missing };
}
