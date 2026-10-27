// Coordinated optical treatments (Addendum 1, Workstream B). PLANS and CHECKS layer-targeted optics; it renders nothing, calls no provider and has no clock.
// Pure and deterministic (reads only the runtime directory listing through spatial-fields capabilityInventory). Status: implemented_unvalidated: no operation here has been run.
//
//   planOptics(treatment, { anchors, assets, capabilities, protectedReads, externalWriters, material, medium, score, policyRevision, runtimeFiles })
//       -> { active, version, record, ops, runtime, ownership, deviations, blocking, errors, warnings, unknown, capabilities, dependency_digest, digest, status }
//   filterOwnership(ops, { externalWriters }) -> { ok, owners, stacks, conflicts }
//   opticsCapabilities({ capabilities, runtimeFiles }) -> { ops: { optics.<kind>: { state, tier, basis, alternative?, notes } }, digest }
//   sampleOp(op, t) -> { param: value }       the pure parameter evaluation (runtime/rasan-optics.js sample() is the same function)
//   OPERATION_KINDS, OPTIC_TIERS (re-exported), OPTICS_VERSION
//   readOpticsPlans(runDir) / opticsOwns(plans, target, kinds)    read-only readers for slop.mjs / obey.mjs (scoping of the blur rules to declared optics)
//
// Reuses (never replaces): sequence-contract normalizeOptics / checkSequence (record shape, tiers, filter-conflict and protected-read checks), spatial-fields
// capabilityInventory (lens_distortion, material_2d_surrogate, refraction_arbitrary, camera_dom3d), asset-compositing's asset shape (has_alpha / mask), composition-anchors regions.
//
// Honesty rules (references/optical-treatments.md):
//   * a capability is `available` (mechanism present in source), `uncertain` (unexercised or approximate) or `unavailable`; none of them means "ran" or "looks right".
//   * an unavailable capability is NEVER silently substituted. The op is dropped from the runtime block, a `creative_deviation` is returned, and an essential op
//     with no recorded creative_decision blocks production until the director resolves it. An unavailable enhancement or deferred op never blocks foundational work.
//   * a combination of separate optical operations (motion blur + focus blur, focus blur + soft material) is legal when each has its own owner or both declare compose_with.
// Consumers: packets.writeScenePlans -> creative/plans/<beat>.json key `optics` (proposed, ENG-INT-1); scripts/slop.mjs + scripts/obey.mjs (wired here, rev>=2 only);
// the Motion Director via `runtime` -> RasanOptics.apply(tl, runtime, {frame}) (runtime file injection proposed, medium-wiring RUNTIME_FILES).
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest } from "./contracts.mjs";
import { capabilityInventory } from "./spatial-fields.mjs";
import { policyRevisionOf } from "./creative-policy.mjs";
import { OPTIC_KINDS, OPTIC_TIERS, CAPABILITY_STATES, SEQUENCE_ERROR_CODES as K, normalizeOptics, checkSequence } from "./sequence-contract.mjs";

export const OPTICS_VERSION = 1;
export const OPERATION_KINDS = OPTIC_KINDS;
export { OPTIC_TIERS };
export const OPTICS_RUNTIME_FILE = "rasan-optics.js";
const RANK = { available: 0, uncertain: 1, unavailable: 2 };
const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const S = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const SKILL_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const RT = path.join(SKILL_DIR, "runtime") + path.sep;

// ---- capability inventory ---------------------------------------------------------------------------------------------------------------
// The six operations and what in the repo supports each (source facts only):
//   mask / focus_blur / soft_material / edge_treatment / motion_blur : runtime/rasan-optics.js composer (CSS filter, CSS mask-image, one SVG filter) when present
//   stylized_distortion : also needs RasanCamera's lens_distortion mechanism (SVG displacement) per capabilityInventory, which is `uncertain`
// Not offered at all (unavailable, alternative named but NEVER applied): physical refraction, arbitrary mask sources not backed by an inspected asset mask.
const OWN = {
  mask: { needs: [OPTICS_RUNTIME_FILE], base: "available", basis: "CSS mask-image radial feather and clip-path inset in rasan-optics.js; RasanShape.iris/flood remain the hard-edged circle", notes: "radial and rect masks are driven by params; an alpha-asset or custom mask source is a separate, uninspected dependency" },
  focus_blur: { needs: [OPTICS_RUNTIME_FILE], base: "available", basis: "per-layer CSS blur() composed into one filter string by RasanOptics (deterministic score-keyed radius); RasanCamera.dof is the depth-based alternative with a different owner", notes: "a pure function of time; unexercised in a render" },
  soft_material: { needs: [OPTICS_RUNTIME_FILE], base: "uncertain", basis: "diffusion + lifted contrast on a flat layer (matches material_2d_surrogate: matte and emissive read fine; translucent or reflective solids are approximations)", notes: "never a whole-frame glow; reflective or translucent solids need Rasan3D material_3d instead" },
  edge_treatment: { needs: [OPTICS_RUNTIME_FILE], base: "available", basis: "1-4 px drop-shadow rim composed in the same filter string", notes: "a thin edge only; widths above 0.004 of the frame width are clamped by the runtime" },
  motion_blur: { needs: [OPTICS_RUNTIME_FILE], base: "uncertain", basis: "axis-aligned feGaussianBlur through a per-op SVG filter; not a per-pixel velocity shutter (finish.mjs owns the delivery shutter)", notes: "x or y axis only; arbitrary-angle smear is not supported" },
  stylized_distortion: { needs: [OPTICS_RUNTIME_FILE], base: "uncertain", basis: "seeded feTurbulence + feDisplacementMap (lens_distortion in spatial-fields: scene-authored, unexercised)", notes: "stylized only: a displacement map is not refraction and is never labelled as refraction", inventory: "lens_distortion" },
};
export const physicalRefraction = { state: "unavailable", alternative: "stylized_distortion", note: "no custom refraction or caustics pass; a blur or displacement is never described as refraction (spatial-fields refraction_arbitrary)" };

// -> { ops: {"optics.<kind>": {kind, state, tier, basis, notes, alternative?, depends_on[]}}, digest }. `capabilities` (a map id -> state | {state}) can only make a state WORSE.
export function opticsCapabilities({ capabilities = null, runtimeFiles = null } = {}) {
  const inv = capabilityInventory().ops, have = (f) => (Array.isArray(runtimeFiles) ? runtimeFiles.includes(f) : fs.existsSync(RT + f));
  const ops = {};
  for (const kind of OPERATION_KINDS) {
    const o = OWN[kind], id = `optics.${kind}`;
    let state = o.base;
    const deps = o.needs.map((f) => ({ file: `runtime/${f}`, present: have(f) }));
    if (deps.some((d) => !d.present)) state = "unavailable";
    if (o.inventory && inv[o.inventory]) state = worse(state, inv[o.inventory].state);
    const given = isObj(capabilities) ? capabilities[id] ?? capabilities[kind] : null, gs = isObj(given) ? S(given.state) : S(given);
    if (CAPABILITY_STATES.includes(gs)) state = worse(state, gs);
    ops[id] = { kind, state, tier: OPTIC_TIERS[kind], basis: o.basis, notes: o.notes, depends_on: deps, ...(state === "unavailable" && kind === "stylized_distortion" ? { alternative: "none: no silent substitute; the distortion is dropped and reported" } : {}), states: { source_inspected: state !== "unavailable", exercised: null, visually_demonstrated: null } };
  }
  return { version: OPTICS_VERSION, ops, physical_refraction: physicalRefraction, digest: canonicalDigest(Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, v.state]))) };
}

// ---- pure parameter evaluation (same arithmetic as runtime/rasan-optics.js evalKeys) ------------------------------------------------------
function evalKeys(keys, t, fn) {
  if (!keys || !keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i]; let u = (t - a[0]) / Math.max(1e-9, b[0] - a[0]);
    if (fn === "hold") return a[1];
    if (fn === "smooth") u = u * u * (3 - 2 * u);
    return a[1] + (b[1] - a[1]) * u;
  }
  return last[1];
}
export function sampleOp(op, t) { const out = {}; for (const p of arr(op && op.params)) out[p.param] = evalKeys(p.keys, t, p.fn); return out; }

// ---- filter ownership --------------------------------------------------------------------------------------------------------------------
// ops: normalized or raw ops (channel from kind when absent). One owner per (layer, channel) while intervals overlap; the owner is the operation, and every owned
// element is written by exactly ONE composer (RasanOptics) whose stack is ordered by `order`. Two operations in one channel are legal only if both name each other
// in compose_with. externalWriters: [{layer, channel, owner, interval?}] (e.g. RasanCamera dof writing blur on a layer) conflict like any other overlapping owner.
const CHANNEL = { motion_blur: "blur", focus_blur: "blur", stylized_distortion: "distort", soft_material: "material", edge_treatment: "edge", mask: "mask" };
const ov = (a, b) => !a || !b || (a.start_tick < b.end_tick && b.start_tick < a.end_tick);
export function filterOwnership(ops, { externalWriters = [] } = {}) {
  const list = arr(ops).filter(isObj).map((o) => ({ ...o, channel: o.channel || CHANNEL[o.kind] || null, compose_with: arr(o.compose_with), layers: isObj(o.layers) ? o.layers : { select: arr(o.layers) } }));
  const owners = {}, stacks = {}, conflicts = [];
  for (const o of list) for (const l of arr(o.layers.select)) {
    const key = `${l}|${o.channel}`; (owners[key] = owners[key] || []).push({ op_id: o.id, kind: o.kind, interval: o.interval || null, order: o.order ?? null });
    (stacks[l] = stacks[l] || []).push({ op_id: o.id, kind: o.kind, channel: o.channel, order: o.order ?? 0 });
  }
  for (const s of Object.values(stacks)) s.sort((a, b) => a.order - b.order || (a.op_id < b.op_id ? -1 : 1));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const x = list[i], y = list[j], share = arr(x.layers.select).filter((l) => arr(y.layers.select).includes(l));
    if (!share.length || !x.channel || x.channel !== y.channel || !ov(x.interval, y.interval)) continue;
    const composed = x.compose_with.includes(y.id) && y.compose_with.includes(x.id);
    if (!composed) conflicts.push({ code: K.filter_conflict, layers: share, channel: x.channel, ops: [x.id, y.id], message: `${x.id} and ${y.id} both write the ${x.channel} channel on ${share.join(", ")} while overlapping: one owner, or compose_with on both` });
  }
  for (const w of arr(externalWriters).filter(isObj)) for (const o of list) {
    if (arr(o.layers.select).includes(w.layer) && (!w.channel || w.channel === o.channel) && ov(o.interval, w.interval || null)) conflicts.push({ code: K.filter_conflict, layers: [w.layer], channel: o.channel, ops: [o.id, S(w.owner) || "external"], message: `${o.id} writes ${o.channel} on ${w.layer}, which ${S(w.owner) || "another helper"} also writes: concurrent helpers overwrite each other's style.filter` });
  }
  return { ok: conflicts.length === 0, owners, stacks, conflicts, composer: "RasanOptics (one writer per element)" };
}

// ---- planning -----------------------------------------------------------------------------------------------------------------------------
const RADIAL = /^radial(:|$)/;
const rectOf = (r) => (isObj(r) && isObj(r.rect) ? r.rect : isObj(r) && ["x", "y", "w", "h"].every((k) => typeof r[k] === "number") ? r : null);

// treatment: raw optics record {id, ops:[...]} (see normalizeOptics). Inputs:
//   anchors: composition-anchors planAnchors() object (regions resolve `region:<id>` mask sources); assets: hybrid/sources.json-shaped records (id, has_alpha, mask {inspected})
//   protectedReads: [{id, ref, interval|window_s}] from text-performance / product reading windows: refs a blur, distortion or mask may not touch during the read
//   externalWriters: [{layer, channel, owner}] helpers that already write a layer's filter (RasanCamera dof)
//   material: {flat?:bool, background?, light_direction_deg?, kind?}; medium: {sharp_layers:[ids]} (a sharp medium finish contradicts blur kinds on those layers)
//   policyRevision: plan's creative_policy_revision; below 2 the planner returns { active:false } and plans nothing (legacy byte-identical)
export function planOptics(treatment, { anchors = null, assets = [], capabilities = null, protectedReads = [], externalWriters = [], material = null, medium = null, score = null, policyRevision = null, runtimeFiles = null } = {}) {
  const rev = isObj(policyRevision) ? policyRevisionOf(policyRevision) : Number(policyRevision || 0);
  if (policyRevision !== null && rev < 2) return { active: false, version: OPTICS_VERSION, reason: "creative_policy_revision < 2: sequence optics are inactive", status: "implemented_unvalidated" };
  const errors = [], warnings = [], unknown = [], deviations = [];
  const t = isObj(treatment) ? treatment : {};
  const caps = opticsCapabilities({ capabilities, runtimeFiles });
  const A = new Map(arr(assets).filter((a) => isObj(a) && a.id != null).map((a) => [String(a.id), a]));
  const regions = new Map([...arr(anchors && anchors.regions)].filter((r) => r && r.id).map((r) => [String(r.id), r]));
  const reads = arr(protectedReads).filter(isObj).map((p) => ({ id: S(p.id), ref: S(p.ref), interval: p.interval ?? p.window_s }));
  // enrich the raw ops (never mutating the caller's): capability id + state from the inventory (worse of declared and inventory), protected reads attached
  const rawOps = arr(t.ops).filter(isObj).map((o) => {
    const kind = S(o.kind), c = caps.ops[`optics.${kind}`], declared = isObj(o.capability) ? S(o.capability.state) : "";
    let state = c ? c.state : "unavailable";
    if (CAPABILITY_STATES.includes(declared)) state = worse(state, declared);
    // a mask source only the repo can vouch for: radial/rect shapes and anchors regions are source-backed; an asset mask stays uncertain until inspected
    const ms = S(isObj(o.mask_source) ? o.mask_source.ref || o.mask_source.id : o.mask_source);
    let maskRuntime = null;
    if (kind === "mask") {
      if (!ms) { /* contract check reports the missing source */ }
      else if (RADIAL.test(ms)) maskRuntime = { shape: "radial" };
      else if (ms.startsWith("region:")) {
        const r = regions.get(ms.slice(7)); if (!r) errors.push({ code: K.unresolved_ref, path: `ops.${S(o.id)}.mask_source`, message: `mask source ${ms} is not a region of the supplied anchors` });
        else { const rc = rectOf(r); maskRuntime = rc ? { shape: "rect", region: ms.slice(7) } : null; if (!rc) { state = worse(state, "uncertain"); unknown.push(`${S(o.id)}: region ${ms.slice(7)} has no rect; the mask follows its edges, which RasanOptics does not read`); } }
      } else if (A.has(ms)) { const a = A.get(ms), m = isObj(a.mask) ? a.mask : null; if (!(a.has_alpha || m)) { state = worse(state, "unavailable"); errors.push({ code: K.unresolved_ref, path: `ops.${S(o.id)}.mask_source`, message: `asset ${ms} has no alpha or mask` }); } else if (!(m && m.inspected === true)) { state = worse(state, "uncertain"); unknown.push(`${S(o.id)}: mask of asset ${ms} is not_inspected (asset-compositing review owns that)`); } maskRuntime = null; }
      else { state = worse(state, "uncertain"); unknown.push(`${S(o.id)}: mask source ${ms} is not radial, a region or a known asset: resolved by the compositor, not by RasanOptics`); }
    }
    return { ...o, protected_reads: [...arr(o.protected_reads), ...reads], capability: { op_id: `optics.${kind}`, state }, __mask: maskRuntime };
  });
  const rec = normalizeOptics({ ...t, ops: rawOps.map(({ __mask, ...o }) => o) }, score);
  const caps4check = Object.fromEntries(Object.entries(caps.ops).map(([k, v]) => [k, v.state]));
  const chk = checkSequence({ optics: [rec], score, capabilities: caps4check });
  errors.push(...chk.errors); warnings.push(...chk.warnings);
  const own = filterOwnership(rec.ops, { externalWriters });
  own.conflicts.forEach((c) => { if (!errors.some((e) => e.code === c.code && e.message && c.ops.every((id) => e.message.includes(id)))) errors.push({ code: c.code, path: `optics.${rec.id}`, message: c.message }); });

  // material context: a soft material needs a declared background and light direction unless the language is intentionally flat
  const mat = isObj(material) ? material : isObj(t.material) ? t.material : {};
  const soft = rec.ops.some((o) => o.kind === "soft_material");
  if (soft && mat.flat !== true) { if (mat.light_direction_deg == null || !S(mat.background)) warnings.push({ code: K.bad_shape, path: "material", message: "a soft material supports a declared background colour and light direction (material.background, material.light_direction_deg); mark material.flat:true for an intentionally flat graphic language" }); }
  if (soft && mat.flat === true) warnings.push({ code: K.bad_shape, path: "material", message: "flat graphic language: the soft material is diffusion only, with no lit-volume claim" });
  // a sharp medium finish contradicts blur on those layers (medium-rules blur-finish / soft-focus / depth-of-field)
  const sharp = new Set(arr(medium && medium.sharp_layers).map(S));
  for (const o of rec.ops) if (["motion_blur", "focus_blur", "soft_material"].includes(o.kind)) for (const l of o.layers.select) if (sharp.has(l)) errors.push({ code: K.bad_shape, path: `ops.${o.id}`, message: `${o.kind} on ${l}, whose medium finish policy is sharp: change the medium decision or the operation` });
  // honest labels
  for (const o of rec.ops) if (o.kind === "stylized_distortion" && !/stylized/i.test(o.label)) warnings.push({ code: K.label, path: `ops.${o.id}.label`, message: "label a stylized distortion as 'stylized' (it is a displacement map, never refraction)" });

  // capability outcome per op; deviations the director must resolve
  const runtimeOps = [], dropped = [];
  for (const o of rec.ops) {
    const st = o.capability.state || "unavailable", tier = o.tier || "enhancement";
    if (st === "unavailable") {
      const decided = !!o.creative_decision;
      deviations.push({ type: "creative_deviation", code: K.capability, op_id: o.id, kind: o.kind, tier, state: st, requires_decision: tier === "essential" && !decided, blocking: tier === "essential" && !decided, decision: o.creative_decision, substitute: null, message: `${o.kind} (${tier}) is unavailable: ${tier === "essential" ? "the director resolves this deviation before production" : "dropped; foundational work continues"}; nothing is substituted` });
      dropped.push(o.id); continue;
    }
    if (st === "uncertain") deviations.push({ type: "capability_note", code: K.capability, op_id: o.id, kind: o.kind, tier, state: st, requires_decision: false, blocking: false, message: `${o.kind} is uncertain (${caps.ops[`optics.${o.kind}`].basis}); playback review decides` });
    const rawO = rawOps.find((r) => S(r.id) === o.id) || {}, iv = o.interval;
    if (!iv) continue; // the contract check already reports a missing interval
    const params = o.params.map((p) => ({ param: p.param, fn: p.fn, keys: p.keys }));
    runtimeOps.push({
      id: o.id, kind: o.kind, channel: o.channel, order: o.order, select: o.layers.select, protect: [...new Set([...o.layers.protect, ...reads.map((r) => r.ref).filter(Boolean)])],
      interval: [iv.start_s, iv.end_s], interval_basis: "score", coordinate_space: o.coordinate_space, crop: o.crop, sampling: o.sampling, params,
      ...(rawO.__mask ? { mask: rawO.__mask } : {}), ...(o.kind === "stylized_distortion" ? { stylized: true, label: o.label, seed: Number(rawO.seed) || 1, frequency: rawO.frequency } : {}),
      ...(o.kind === "motion_blur" ? { axis: rawO.axis === "y" ? "y" : "x" } : {}), source_layer_id: o.source_layer_id,
    });
  }
  const blocking = deviations.some((d) => d.blocking) || errors.length > 0;
  const runtime = { file: `runtime/${OPTICS_RUNTIME_FILE}`, call: "RasanOptics.apply(tl, runtime, { frame: {w, h} })", units: { blur: "fraction of frame width", displace: "fraction of frame width", time: "score seconds" }, ops: runtimeOps };
  const digest = canonicalDigest({ dep: rec.dependency_digest, caps: caps.digest, runtime: runtimeOps.map((o) => [o.id, o.interval, o.select, o.protect, o.params]), dropped });
  return {
    active: true, version: OPTICS_VERSION, record: rec, ops: rec.ops, runtime, ownership: own, deviations, blocking, dropped, errors, warnings, unknown,
    capabilities: caps, material_context: { flat: mat.flat === true, background: S(mat.background) || null, light_direction_deg: mat.light_direction_deg ?? null },
    playback_review_required: chk.playback_review_required, dependency_digest: rec.dependency_digest, digest, status: "implemented_unvalidated",
  };
}

// ---- readers for the blur-grammar rules ------------------------------------------------------------------------------------------------
// creative/plans/<beat>.json (and creative/beat-plans.json beats.<id>) hold the plan's `optics` key. -> [{id, kind, layers[], channel}] (empty for legacy runs and missing files).
export function readOpticsPlans(runDir) {
  const out = [];
  if (!runDir) return out;
  const take = (o) => { const recs = Array.isArray(o) ? o : isObj(o) ? [o.record && isObj(o.record) ? o.record : o] : []; for (const r of recs) for (const op of arr(r && r.ops)) if (isObj(op) && S(op.kind)) out.push({ id: S(op.id), kind: S(op.kind), layers: [...arr(isObj(op.layers) ? op.layers.select : op.layers), ...arr(op.select)].map(S).filter(Boolean), channel: S(op.channel) || CHANNEL[S(op.kind)] || null }); };
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  const dir = path.join(runDir, "creative", "plans");
  try { for (const f of fs.readdirSync(dir).sort()) if (f.endsWith(".json")) { const j = read(path.join(dir, f)); if (j && j.optics) take(j.optics); } } catch { /* no plans */ }
  const bp = read(path.join(runDir, "creative", "beat-plans.json"));
  if (bp && isObj(bp.beats)) for (const b of Object.values(bp.beats)) if (isObj(b) && b.optics) take(b.optics);
  return out;
}
// does a declared optical operation (of these kinds) own this tween target? target is a selector or id string; layer ids match with or without a leading # or [data-layer=...]
export function opticsOwns(plans, target, kinds = OPERATION_KINDS) {
  const t = S(target); if (!t) return null;
  const norm = (s) => S(s).replace(/^[#.]/, "");
  const nt = norm(t);
  return arr(plans).find((p) => kinds.includes(p.kind) && p.layers.some((l) => norm(l) === nt || t.includes(`"${norm(l)}"`) || t.includes(`'${norm(l)}'`))) || null;
}
