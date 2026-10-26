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
  "multi-plane-depth": { policy: "layers[].medium", test: (c, l) => !!l && ["pixel", "sharp-ui", "flat", "line", "paper-flat"].includes(l.medium) },
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
    return { hard, craft, scopedExceptions, reasons };
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
  return { hard, craft, scopedExceptions, reasons };
}

function readPath(obj, p, layerId) {
  let v = obj;
  for (const k of p.split(".")) { if (k.endsWith("[]")) return undefined; v = v && v[k]; }
  return v && typeof v === "object" && !Array.isArray(v) && layerId in v ? v[layerId] : v;
}
