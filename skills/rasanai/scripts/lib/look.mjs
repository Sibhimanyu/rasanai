// Look development (Plan 04 L1, L3, L6, L7): comparing looks on ONE representative story beat, saying how looks really differ,
// surfacing treatments that cannot be done before the commit, the card the Look screen shows, a bounded look revision, and the rule that no
// storyboard or production work starts before the Look is committed. Everything here is pure data (plus one small run-state reader).
//   pickRepresentativeBeat(treatment, opts)   -> { beat_id, why, content, content_digest, alternatives }
//   comparisonPlan(o) / validateComparisonPlan(p)   one frame per look by default; a second only for a stated real uncertainty
//   lookDifferences(looks)                    -> { pairs, distinct, color_swap_pairs }   differences in hierarchy, density, material, framing, motion character
//   impossibleTreatments(requests, resources) -> { limitations, blocking }               said BEFORE the look is committed
//   lookCard(o)                               -> the native Look card payload (short differences up front, detail collapsed)
//   reviseLook(o)                             -> a bounded look revision: what changes, what stays fixed, the impact (Story always preserved)
//   lookCommitted(run) / productionGate(run, role, key) / annotatePhases(phases)   the stage gate on storyboard work
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest, revisionKey, SCHEMA_VERSION } from "./contracts.mjs";
import { impact } from "./impact.mjs";
import { missingPrerequisites, ancestors } from "./stages.mjs";
import { readTreatment } from "./treatment.mjs";
import { fontAvoidViolations } from "./visual-bible.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const words = (s) => T(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return 1; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };

export const LOOK_AXES = ["hierarchy", "density", "material", "framing", "motion_character"];
const AXIS_LABEL = { hierarchy: "Hierarchy", density: "Density", material: "Material", framing: "Framing", motion_character: "Motion" };
export const MIN_AXES_DIFFERENT = 3;
export const REAL_UNCERTAINTIES = ["interface-plus-object", "dimensional-seam", "locale-fit", "proof-legibility", "brand-constraint-edge", "other"];

// ---- L1: the representative beat ----------------------------------------------------------------
// The beat that exercises the likely typography, product imagery and hierarchy. Heuristic and explainable; the writer or user may name one.
export function pickRepresentativeBeat(treatment, { beat_id = null } = {}) {
  const r = readTreatment(treatment);
  if (!r.ok) return { ok: false, error: r.error || "no treatment" };
  const beats = arr(r.treatment.beats);
  if (!beats.length) return { ok: false, error: "the treatment has no beats" };
  const rows = beats.map((b, i) => {
    const copyWords = words(b.on_screen).length;
    const ve = b.visual_event || {};
    let score = 0; const why = [];
    if (arr(b.evidence_refs).length) { score += 3; why.push("carries evidence"); }
    if (copyWords >= 3 && copyWords <= 18) { score += 2; why.push("real on-screen copy"); }
    if (T(ve.change)) { score += 1; why.push("a visible change"); }
    if (/\b(ui|screen|interface|product|dashboard|app|window|chart|diagram|photo|logo)\b/i.test([b.on_screen, ve.before, ve.change, ve.after, b.internal_beat_label].join(" "))) { score += 2; why.push("product or interface imagery"); }
    if (i === 0) score -= 1; // an opening often shows the least of the real hierarchy
    if (i === beats.length - 1 && beats.length > 2) score -= 1;
    return { b, i, score, why };
  });
  const forced = beat_id ? rows.find((x) => x.b.id === beat_id) : null;
  if (beat_id && !forced) return { ok: false, error: `no beat ${beat_id}` };
  const best = forced || rows.slice().sort((x, y) => y.score - x.score || x.i - y.i)[0];
  const content = { beat_id: best.b.id, viewer_takeaway: T(best.b.viewer_takeaway), on_screen: best.b.on_screen || "", visual_event: best.b.visual_event || {}, evidence_refs: arr(best.b.evidence_refs) };
  return { ok: true, legacy: !!r.legacy, beat_id: best.b.id, why: forced ? ["named by the writer or the user"] : best.why, content, content_digest: canonicalDigest(content), alternatives: rows.filter((x) => x !== best).sort((x, y) => y.score - x.score).slice(0, 2).map((x) => x.b.id) };
}

// o: { treatment, beat_id, looks:[{label, axes?}], brand:{locked}, series:{name, look, provenance}, expected, second:[{label, kind, reason}], lean }
export function comparisonPlan(o = {}) {
  const pick = pickRepresentativeBeat(o.treatment, { beat_id: o.beat_id });
  if (!pick.ok) return { ok: false, error: pick.error };
  const brandLocked = !!(o.brand && o.brand.locked);
  const series = o.series && o.series.look ? o.series : null;
  const labels = series ? [T(series.label) || "Series"] : (arr(o.looks).map((l) => T(isObj(l) ? l.label : l)).filter(Boolean));
  const expected = series || o.lean ? 1 : Number(o.expected) || 3;
  const frames = labels.map((label) => ({ id: `${label}-rep`, look: label, role: "representative", beat_id: pick.beat_id, content_digest: pick.content_digest }));
  const seconds = [];
  for (const s of arr(o.second)) {
    const label = T(s && s.label);
    if (!labels.includes(label)) continue;
    seconds.push({ id: `${label}-rep-2`, look: label, role: "second", beat_id: pick.beat_id, content_digest: pick.content_digest, uncertainty: REAL_UNCERTAINTIES.includes(s.kind) ? s.kind : "other", reason: T(s.reason) });
  }
  const plan = {
    schema_version: SCHEMA_VERSION, kind: "look-comparison", representative: { beat_id: pick.beat_id, why: pick.why, content: pick.content, content_digest: pick.content_digest },
    looks: labels, expected_looks: expected, count_ok: labels.length === expected || (labels.length > 0 && labels.length < expected && !!(series || o.lean)),
    frames: [...frames, ...seconds], default_frames_per_look: 1,
    budget: { max_frames: labels.length + seconds.length, per_look_default: 1, second_requires: "a stated real uncertainty", opening_peak_end_for_every_look: false },
    variation_axes: LOOK_AXES, constrained_by_brand: brandLocked,
    brand: brandLocked ? { fixed: ["logo", "factual UI and numbers", "approved colours", "brand typefaces"], free: ["hierarchy", "density", "material", "framing", "motion character", "composition"], wild_outside_brand: false } : { wild_outside_brand: true },
    series: series ? { name: T(series.name), provenance: T(series.provenance) || "saved_series_default", locked: true } : null,
    gate: { storyboard_before_look_commit: false, production_scene_before_look_commit: false },
  };
  return { ok: true, plan };
}
export function validateComparisonPlan(p) {
  const problems = [];
  if (!isObj(p) || p.kind !== "look-comparison") return { ok: false, problems: ["not a look comparison plan"] };
  const digests = new Set(arr(p.frames).map((f) => f.content_digest));
  if (digests.size > 1) problems.push("frames show different content: every look is drawn on the same approved story beat");
  const per = {};
  for (const f of arr(p.frames)) per[f.look] = (per[f.look] || 0) + 1;
  for (const [l, n] of Object.entries(per)) if (n > 2) problems.push(`look ${l} has ${n} frames: one by default, a justified second at most`);
  for (const f of arr(p.frames)) if (f.role === "second" && !T(f.reason)) problems.push(`frame ${f.id}: a second frame needs the real uncertainty it resolves`);
  if (p.gate && (p.gate.storyboard_before_look_commit || p.gate.production_scene_before_look_commit)) problems.push("storyboard and production scenes wait for a committed Look");
  if (p.brand && p.brand.wild_outside_brand) problems.push("a supplied brand cannot be left by a 'Wild' option");
  if (!p.count_ok) problems.push(`expected ${p.expected_looks} looks, got ${arr(p.looks).length}`);
  return { ok: !problems.length, problems };
}

// ---- L7: how looks differ ------------------------------------------------------------------------
// looks: [{label, axes:{hierarchy, density, material, framing, motion_character}}]. A pair differing on fewer than MIN_AXES_DIFFERENT axes is a recolour.
const axisDiffers = (a, b) => !T(a) || !T(b) ? null : jaccard(words(a), words(b)) < 0.5;
export function lookDifferences(looks) {
  const L = arr(looks).filter((l) => isObj(l) && isObj(l.axes));
  const pairs = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const differ = [], same = [], unknown = [];
    for (const ax of LOOK_AXES) { const d = axisDiffers(L[i].axes[ax], L[j].axes[ax]); (d === null ? unknown : d ? differ : same).push(ax); }
    pairs.push({ a: L[i].label, b: L[j].label, differ, same, unknown, color_swap: unknown.length === 0 && differ.length < MIN_AXES_DIFFERENT });
  }
  return { pairs, distinct: pairs.every((p) => !p.color_swap), color_swap_pairs: pairs.filter((p) => p.color_swap).map((p) => [p.a, p.b]), checked: L.length };
}

// requests: [{ id, need: "font"|"asset"|"screen"|"footage"|"3d"|"rig"|"effect", name, text }]
// resources: { fonts: {Family: "available"|"missing"}, assets: [ids], screens: [ids], capabilities: { "3d": bool, rig: bool, footage: bool, effect: [..] } }
export function impossibleTreatments(requests, resources = {}) {
  const limitations = [];
  const caps = resources.capabilities || {};
  for (const r of arr(requests)) {
    if (!isObj(r)) continue;
    const name = T(r.name);
    const add = (why, options) => limitations.push({ id: T(r.id) || name, need: r.need, name, request: T(r.text), why, options });
    if (r.need === "font" && (resources.fonts || {})[name] !== "available") add(`the font ${name} is ${(resources.fonts || {})[name] || "not verified"}; this look cannot show it`, ["supply the font file", "choose a licensed fallback (shown in the card)", "keep the brand fallback"]);
    else if (r.need === "asset" && !arr(resources.assets).includes(name)) add(`no asset ${name} exists, and proof will not be invented later`, ["supply it", "drop the treatment", "show it as a labelled placeholder"]);
    else if (r.need === "screen" && !arr(resources.screens).includes(name)) add(`no real screen ${name}; a redrawn UI would claim behavior it may not have`, ["capture the screen", "use a diagram instead"]);
    else if (r.need === "3d" && caps["3d"] === false) add("3D is not available on this machine or route", ["keep it 2D with depth cues", "enable 3D"]);
    else if (r.need === "rig" && caps.rig === false) add("no rigged character for this", ["use a still as reference art, labelled", "drop the performance"]);
    else if (r.need === "footage" && caps.footage === false) add("no footage supplied for this treatment", ["supply footage", "use a graphic"]);
    else if (r.need === "effect" && Array.isArray(caps.effect) && !caps.effect.includes(name)) add(`the effect ${name} is not implemented`, ["pick an implemented effect"]);
  }
  return { limitations, blocking: limitations.length > 0, say_before_commit: limitations.length > 0 };
}

// ---- L6: the card -----------------------------------------------------------------------------
// style: an entry of design.mjs look-payload (id, label, name, blend, why, references, frames, specimen...). others: the other looks' axes.
export function lookCard({ style, axes = null, others = [], frames = [], limitations = [], fixed = [], series = null, brand = null, bible = null } = {}) {
  const s = isObj(style) ? style : {};
  const diffs = [];
  if (isObj(axes)) {
    const rivals = arr(others).filter(isObj);
    for (const ax of LOOK_AXES) {
      if (!T(axes[ax])) continue;
      const unique = rivals.every((o) => axisDiffers(axes[ax], o[ax]) !== false);
      if (unique) diffs.push({ axis: ax, label: AXIS_LABEL[ax], text: T(axes[ax]) });
    }
  }
  const differences = (diffs.length ? diffs : [{ axis: "summary", label: "Look", text: T(s.blend) || T(s.why) }]).filter((d) => d.text).slice(0, 3);
  const short = (t, n) => (T(t).length > n ? T(t).slice(0, n - 1).trimEnd() + "…" : T(t));
  return {
    schema_version: SCHEMA_VERSION, id: T(s.id), label: T(s.label), title: T(s.name),
    summary: short(s.why || s.blend, 160), differences: differences.map((d) => ({ ...d, text: short(d.text, 90) })),
    frames: arr(frames.length ? frames : s.frames).map((f) => ({ id: f.id, image: f.image, role: f.role || "representative" })),
    fixed: arr(fixed), limitations: arr(limitations).map((l) => ({ name: l.name, why: l.why })),
    provenance: series ? { kind: "saved_series_default", series: T(series.name) } : brand && brand.locked ? { kind: "brand", note: "inside the supplied brand" } : null,
    details: { collapsed: true, references: arr(s.references).slice(0, 4), type: bible && bible.type ? arr(bible.type.roles).map((r) => `${r.role}: ${r.family}`) : [], palette: bible && bible.palette ? Object.fromEntries(Object.entries(bible.palette.roles || {}).map(([k, v]) => [k, v.hex])) : {}, motion: bible && bible.motion ? { scale_ms: bible.motion.scale_ms, easing: bible.motion.easing } : {}, design_md: s.design_md || null },
  };
}

// ---- L6: a bounded look revision -----------------------------------------------------------------
const FIXABLE = { typography: ["typography", "type", "font", "fonts", "typeface"], palette: ["palette", "colors", "colours", "color", "colour"], layout: ["layout", "composition", "grid"], motion: ["motion", "animation", "movement"], logo: ["logo", "logos"], copy: ["copy", "text", "wording"], framing: ["framing", "camera", "crop"], material: ["material", "finish", "materials"] };
const CHANGES = [
  ["material", /\b(gloss\w*|shin\w+|glass\w*|plastic|matte|flat|texture\w*|grain\w*|soft\w*|metal\w*|paper)\b/i],
  ["density", /\b(busy|dense|cluttered|crowded|sparse|clean\w*|minimal\w*|simpl\w+|airy|more space|less stuff)\b/i],
  ["hierarchy", /\b(bigger|larger|smaller|louder|quieter|hierarchy|bolder headline|emphasi\w+)\b/i],
  ["framing", /\b(zoom\w*|closer|wider|crop\w*|framing|tighter|further)\b/i],
  ["motion_character", /\b(faster|slower|calmer|snappy|snappier|bouncy|bounce|smoother|gentler|punchier|energetic)\b/i],
  ["palette", /\b(darker|lighter|warmer|cooler|colou?r\w*|palette|brighter|muted|saturat\w+)\b/i],
];
const BRAND_HARD = { palette: "brand.palette", typography: "brand.type", logo: "brand.logo" };

// o: { instruction, base_revision, current: { fixed? }, brand:{locked}, ids?: [stable ids touched], downstream_started }
export function reviseLook(o = {}) {
  const text = T(o.instruction);
  if (!text) return { ok: false, error: "an instruction is required" };
  const fixed = new Set();
  for (const m of text.matchAll(/\b(?:same|keep|unchanged|leave)\s+(?:the\s+)?([a-z ,]+?)(?=[,.;]|\bbut\b|\bless\b|\bmore\b|$)/gi)) {
    for (const w of m[1].split(/[, ]+(?:and\s+)?/).map((x) => x.trim().toLowerCase()).filter(Boolean)) for (const [k, names] of Object.entries(FIXABLE)) if (names.includes(w)) fixed.add(k);
  }
  const tail = text.replace(/\b(?:same|keep|unchanged|leave)\s+(?:the\s+)?[a-z ,]+?(?=[,.;]|\bbut\b|\bless\b|\bmore\b|$)/gi, " ");
  const changes = CHANGES.filter(([, re]) => re.test(tail)).map(([k]) => k);
  const conflict = changes.filter((c) => fixed.has(c === "motion_character" ? "motion" : c === "palette" ? "palette" : c));
  if (conflict.length) return { ok: false, error: `the request both keeps and changes: ${conflict.join(", ")}` };
  if (!changes.length) return { ok: true, needs_clarification: true, question: "What should change? (hierarchy, density, material, framing, motion, or colour)", fixed: [...fixed], story_preserved: true };
  const brandBlocked = o.brand && o.brand.locked ? changes.filter((c) => c === "palette").map((c) => ({ part: c, constraint: BRAND_HARD.palette, route: "a local, approved exception with a rationale; the brand stays as supplied" })) : [];
  const applied = changes.filter((c) => !brandBlocked.some((b) => b.part === c));
  const fixedAll = [...new Set([...fixed, ...arr(o.current && o.current.fixed), ...LOOK_AXES.filter((a) => !applied.includes(a)).map((a) => (a === "motion_character" ? "motion" : a)), ...["typography", "logo", "copy"].filter((x) => !applied.includes(x)), ...(applied.includes("palette") ? [] : ["palette"])])];
  const req = { schema_version: SCHEMA_VERSION, stage: "look", target_ids: arr(o.ids), instruction: text, base_revision: o.base_revision ?? null };
  req.idempotency_key = revisionKey(req);
  const imp = impact("look", arr(o.ids), { bounded: true, fixed: fixedAll, downstream_started: o.downstream_started !== false });
  return { ok: true, request: req, changes: applied, fixed: fixedAll, blocked_by_brand: brandBlocked, story_preserved: true, bounded: true, impact: imp, redraw: { representative_frame: true, other_frames: "only those drawn from a changed part" } };
}

// Plan 10: a look's fonts against the person's font_avoid list -> { ok, violations:[{ role, family, problem }] }; the look is reported, never silently shipped with an avoided font.
// fonts: [{ role, family }] or family names (e.g. the look's DESIGN.md display/body/mono); avoid: lib/visual-bible.mjs font_avoid.
export function checkLookFonts(fonts, avoid) { const violations = fontAvoidViolations(fonts, avoid); return { ok: !violations.length, violations }; }

// ---- the gate: no storyboard or production before the Look is committed -------------------------------
export const PRODUCTION_PHASES = Object.freeze({
  art: "storyboard", thumbs: "storyboard", moments: "storyboard", styleframes: "storyboard", boards: "storyboard", "style-match-boards": "storyboard", "frames-jury": "storyboard",
  "styleframes-show": "storyboard", "styleframes-call": "storyboard", keyframes: "storyboard", "keyframes-review": "storyboard", "animatic-draft": "storyboard", score: "storyboard", seams: "storyboard", cut: "storyboard",
  spike: "build", animate: "build", "animate-graphics": "build", build: "build", "style-match-draft": "build", review: "final", "review-film": "final",
});
const PRODUCTION_ROLES = new Set(["frame-designer", "scene-animator", "film-builder", "art-director", "frame-juror", "motion-director"]);
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const has = (p) => { try { return fs.existsSync(p); } catch { return false; } };

// the Look is committed when a look was chosen into the run (any route: a chosen system, the series' look, the brand's own look)
export function lookCommitted(run) {
  const r = path.resolve(String(run));
  if (has(path.join(r, "look", "DESIGN.md")) || has(path.join(r, "look", "frame.md"))) return { committed: true, via: "look/" };
  const d = rj(path.join(r, "decisions.json")) || {};
  if (d.look && (d.look.design_md || d.look.frame || d.look.name)) return { committed: true, via: "decisions.look" };
  if (d.design_system && d.design_system.picked) return { committed: true, via: "decisions.design_system" };
  return { committed: false, via: null };
}
const storyCommitted = (run) => has(path.join(path.resolve(String(run)), "story", "chosen.json")) || has(path.join(path.resolve(String(run)), "story", "intent.json"));

// -> { ok:true } | { ok:false, missing:[stages], message }.  Only a run planned with look_gate (crew/plan.json) is held; older plans keep running.
export function productionGate(run, role, key, plan = null) {
  const heroes = role === "styleframe-designer" && String(key || "").startsWith("heroes-"); // the Look comparison itself
  const prod = PRODUCTION_ROLES.has(role) || (role === "styleframe-designer" && !heroes);
  if (!prod) return { ok: true };
  const p = plan || rj(path.join(path.resolve(String(run)), "crew", "plan.json")) || {};
  if (!p.look_gate) return { ok: true, legacy: true };
  const committed = ["brief", ...(storyCommitted(run) ? ["story"] : []), ...(lookCommitted(run).committed ? ["look"] : [])];
  const missing = missingPrerequisites("storyboard", committed).filter((s) => s !== "brief");
  return missing.length ? { ok: false, missing, message: `${role}${key ? ":" + key : ""} is storyboard/production work and waits for a committed ${missing.join(" and ")} (stages: ${ancestors("storyboard").join(" -> ")} -> storyboard). Choose the Look first: design.mjs choose-system` } : { ok: true };
}

// marks each production phase with the stage it belongs to and what must be committed first (data for the Director; crew.mjs check enforces by role)
export function annotatePhases(phases) {
  for (const ph of arr(phases)) {
    const st = PRODUCTION_PHASES[ph && ph.phase];
    if (st) { ph.stage = st; ph.requires_committed = ancestors(st).filter((s) => s !== "brief"); }
  }
  return phases;
}
