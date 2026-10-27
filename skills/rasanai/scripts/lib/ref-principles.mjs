// Reference-to-principle translation (Plan 04 L4). A reference is raw material, never a menu and never a law.
// For each reference a look actually uses we keep: the principle, its evidence, how it transfers to THIS brand and what must NOT be copied.
// Recipe numbers are normalized to the film's own units before reuse (60 fps frame counts -> seconds or an explicit frame lock;
// px values -> a fraction of the reference's own dimensions). A recipe-specific restriction (a cartoon recipe's "no text") is a scoped,
// subordinate craft_preference, never a film-wide rule.
//   makePrinciple(o) / validatePrinciple(p)        -> record / { ok, problems, warnings }
//   normalizeMeasurement(m, target)               -> { ok, ... } one number converted (or an explicit "unnormalized" with the reason)
//   normalizeRecipeUnits(recipe, target)          -> { measurements:[...], warnings }  target = { fps, width, height, frame_locked? }
//   selectPrinciples(list, ctx, limit)            -> a small relevant set (default 5), exclusions honoured
//   scopedRule(principle, rule)                   -> a lib/rules.mjs rule: craft_preference, scoped to the recipe, loses to any binding rule
//   principlesFromBlend(blend)                    -> the principles recorded in a design system's blend.json (legacy blends: none, no error)
import { makeRule } from "./rules.mjs";
import { SCHEMA_VERSION } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : x == null ? d : String(x));
const T = (x) => str(x).trim();

export const EVIDENCE_KINDS = ["measured", "observed", "source_text", "analysis"];
export const DEFAULT_REFERENCE_FPS = 60;
export const MAX_PRINCIPLES = 5;

export const makePrinciple = (o = {}) => ({
  schema_version: SCHEMA_VERSION, id: "", reference_id: "", principle: "", evidence: { kind: "observed", ref: "", note: "" }, transfer: "", do_not_copy: [],
  applicability: { kinds: [], tags: [], exclusions: [] }, scope: "recipe", runtime: { engine: "", version: "" }, measurements: [], rights: { source_art_bundled: false, license: "" }, ...o,
});

export function validatePrinciple(p) {
  const problems = [], warnings = [];
  if (!isObj(p)) return { ok: false, problems: ["not an object"], warnings };
  for (const k of ["id", "reference_id", "principle", "transfer"]) if (!T(p[k])) problems.push(`${k} is required`);
  if (!isObj(p.evidence) || !EVIDENCE_KINDS.includes(p.evidence.kind) || !T(p.evidence.note || p.evidence.ref)) problems.push(`evidence needs a kind (${EVIDENCE_KINDS.join(", ")}) and a ref or note`);
  if (!arr(p.do_not_copy).length) problems.push("do_not_copy needs at least one item (what must not be taken from this reference)");
  if (p.universal === true || p.scope === "universal" || p.scope === "film-law") problems.push("a reference principle is scoped to a recipe, beat or look; it is never a universal law");
  if (!arr(p.applicability && p.applicability.exclusions).length) warnings.push("no exclusions listed: say where this principle does not apply");
  if (p.rights && p.rights.source_art_bundled === true && !T(p.rights.license)) problems.push("source art, fonts, logos or video may only be bundled with a license; keep inspiration links and original analysis apart from distributable assets");
  if (isObj(p.runtime) && p.runtime.engine && !T(p.runtime.version)) warnings.push("runtime engine named without a version: keep the recipe's supported runtime and version, never a second live clock");
  for (const m of arr(p.measurements)) { const r = normalizeMeasurement(m, { fps: 30, width: 1920, height: 1080 }); if (!r.ok) warnings.push(`measurement ${T(m && m.id) || "?"}: ${r.reason}`); }
  return { ok: !problems.length, problems, warnings };
}

// ---- unit normalization -------------------------------------------------------------
// m: { id?, kind: "frames"|"px"|"px_per_s", value, ref_fps?, ref: {width,height}?, axis?: "short"|"long"|"width"|"height" }
// target: { fps, width, height, frame_locked? }
const axisOf = (dims, axis) => { const w = Number(dims && dims.width), h = Number(dims && dims.height); if (!(w > 0 && h > 0)) return null; return { short: Math.min(w, h), long: Math.max(w, h), width: w, height: h }[axis || "short"] || null; };
export function normalizeMeasurement(m, target = {}) {
  if (!isObj(m)) return { ok: false, reason: "not an object" };
  const v = Number(m.value);
  if (!Number.isFinite(v)) return { ok: false, reason: "value is not a number" };
  const fps = Number(target.fps) > 0 ? Number(target.fps) : 30;
  const base = { id: T(m.id), kind: m.kind, source_value: v };
  if (m.kind === "frames") {
    const rf = Number(m.ref_fps) > 0 ? Number(m.ref_fps) : null;
    if (!rf) return { ok: false, ...base, reason: "frame count with no reference fps: state the fps the recipe was authored at (60 is only a guess), do not paste the number" };
    const duration_s = v / rf;
    // time is the portable form; frames at the film's rate only when the choice is explicitly frame-locked
    return { ok: true, ...base, duration_s, ...(target.frame_locked ? { frames_at_target: Math.max(1, Math.round(duration_s * fps)), frame_locked: true, target_fps: fps } : { frame_locked: false }) };
  }
  if (m.kind === "px" || m.kind === "px_per_s") {
    const ref = axisOf(m.ref, m.axis);
    if (!ref) return { ok: false, ...base, reason: "pixel value with no reference dimensions: say which frame size and axis it was measured on" };
    const fraction = v / ref;
    const tgt = axisOf(target, m.axis);
    return { ok: true, ...base, fraction_of_ref_axis: fraction, axis: m.axis || "short", ...(tgt ? { value_at_target: fraction * tgt } : {}), ...(m.kind === "px_per_s" ? { per_second: true } : {}) };
  }
  return { ok: false, ...base, reason: `unknown measurement kind ${JSON.stringify(m.kind)}` };
}
export function normalizeRecipeUnits(recipe, target = {}) {
  const list = arr(isObj(recipe) ? recipe.measurements : recipe);
  const measurements = list.map((m) => normalizeMeasurement(m, target));
  return { measurements, warnings: measurements.filter((r) => !r.ok).map((r) => `${r.id || "measurement"}: ${r.reason}`) };
}

// ---- a small relevant set -----------------------------------------------------------
export function selectPrinciples(list, ctx = {}, limit = MAX_PRINCIPLES) {
  const kind = T(ctx.communication_kind), tags = new Set(arr(ctx.tags).map(String));
  const rows = arr(list).filter((p) => isObj(p) && validatePrinciple(p).ok).map((p) => {
    const a = p.applicability || {};
    if (arr(a.exclusions).some((e) => tags.has(String(e)) || (kind && e === kind))) return null;
    const kinds = arr(a.kinds);
    if (kinds.length && kind && !kinds.includes(kind)) return null;
    const score = (kinds.includes(kind) ? 2 : 0) + arr(a.tags).filter((t) => tags.has(String(t))).length + (p.evidence && p.evidence.kind === "measured" ? 1 : 0);
    return { p, score };
  }).filter(Boolean).sort((x, y) => y.score - x.score);
  return rows.slice(0, Math.max(1, limit)).map((r) => r.p);
}

export const scopedRule = (principle, rule = {}) => makeRule({
  rule_id: T(rule.rule_id) || `ref:${T(principle && principle.id)}`, scope: `recipe:${T(principle && (principle.reference_id || principle.id))}`, kind: "craft_preference", source: T(principle && principle.reference_id), applicability: { topic: T(rule.topic) || T(principle && principle.id), recipe: T(principle && principle.id), exclusions: arr(principle && principle.applicability && principle.applicability.exclusions) }, ...rule,
});

export const principlesFromBlend = (blend) => arr(blend && blend.principles).map(makePrinciple);
