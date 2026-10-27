// Plan 06 V6: a recurring character's PERFORMANCE: expression, gesture, pose, gaze and viseme tracks tied to the actual dialogue timing, for an actor whose
// identity (canon) is already a file: `identity.json` (lib/canon.mjs: palette, proportions, fixed traits, materials, rig builder + version, sealed rig hash),
// drawn by Rasan3D (stage3d/character-rig.js) or Rasan2D (stage2d/). Contract C7 in docs/plans/hybrid-film-contracts.md:
//
//   <film>/cast/<character-id>/performance/<scene-id>.json
//   { schema_version:1, character_id, scene_id, medium, canon_digest, rig_hash|null, audio:{ source, sha256, words:[{text,start,end}] }, duration_s,
//     visemes:[{t_s, dur_s, viseme, weight}], expressions:[{t_s, dur_s, name, weight}], gestures:[{t_s, dur_s, kind, target?, ...}],
//     targets:[{kind:"gaze"|"head"|"body", keyframes:[{t_s, at:[x,y,z]|[x,y]}]}], foot_plants:[{t0_s,t1_s}], continuity:{ in, out } }     (scene-local seconds)
//
// What this module is and is not:
//   - a pure data contract: poseAt(doc, t) is a function of the document and the time only (no accumulated state, no hidden RNG, no clock): any seek order gives
//     the same pose. The render bridge (toRigActions) turns a document into the action lists the two rigs already take.
//   - honest about the actor: `actorLabel()` says "code-built 3D actor" or "painted 2D actor" (a still image a person supplied is REFERENCE ART, not a rigged model).
//   - honest about speech: the WORD times come from a transcript; the mouth shapes inside a word are a text heuristic (no phoneme aligner is installed), so the
//     alignment is MEASURED (measureAlignment) against the word times and reported as an offset in frames, never claimed frame-perfect.
import { identityDigest, rigAssetHash, validateIdentity } from "./canon.mjs";
import { createRequire } from "node:module";
import { SCHEMA_VERSION } from "./contracts.mjs";

const req = createRequire(import.meta.url);
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const num = (x) => typeof x === "number" && Number.isFinite(x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const r4 = (x) => Math.round(x * 1e4) / 1e4;

let rig3d = null, kit2d = null;
const R3 = () => rig3d || (rig3d = req("../../stage3d/character-rig.js"));
const R2 = () => kit2d || (globalThis.Rasan2DKit = undefined, kit2d = req("../../stage2d/runtime/character.js"));

// ---- visemes -----------------------------------------------------------------------------------------------------------
// Eight mouth classes (a coarse set on purpose: it is what two stylised rigs can draw). open 0..1, w = width factor, shape = a mouth shape the 2D face draws.
export const VISEMES = {
  rest: { open: 0, w: 1, shape: null },
  mbp: { open: 0, w: 0.9, shape: "flat" },
  fv: { open: 0.12, w: 1, shape: "flat" },
  l: { open: 0.3, w: 0.9, shape: "open" },
  ai: { open: 0.85, w: 1.1, shape: "open" },
  e: { open: 0.45, w: 1.3, shape: "open" },
  o: { open: 0.6, w: 0.6, shape: "o" },
  u: { open: 0.35, w: 0.45, shape: "o" },
};
const LETTER = { a: "ai", i: "ai", y: "ai", e: "e", o: "o", u: "u", w: "u", q: "u", m: "mbp", b: "mbp", p: "mbp", f: "fv", v: "fv", l: "l", t: "l", d: "l", n: "l", r: "e", s: "e", z: "e", c: "e", g: "e", h: "ai", j: "e", k: "e", x: "e" };
export const visemeMouth = (v) => VISEMES[v] || VISEMES.rest;

// word times -> a viseme track. The word boundaries are the transcript's; the letters inside a word are spread evenly: an approximation, labelled so.
export function visemesFromWords(words, { fps = 30 } = {}) {
  const out = [];
  for (const w of Array.isArray(words) ? words : []) {
    if (!(num(w.start) && num(w.end) && w.end > w.start)) continue;
    const letters = String(w.text || "").toLowerCase().replace(/[^a-z]/g, "").split("").filter((c) => LETTER[c]);
    const classes = [];
    for (const c of letters) { const v = LETTER[c]; if (classes[classes.length - 1] !== v) classes.push(v); }
    if (!classes.length) continue;
    const step = (w.end - w.start) / classes.length;
    classes.forEach((v, i) => out.push({ t_s: r4(w.start + i * step), dur_s: r4(step), viseme: v, weight: v === "mbp" || v === "fv" ? 1 : 0.9 }));
    out.push({ t_s: r4(w.end), dur_s: r4(Math.max(1 / fps, 0.04)), viseme: "rest", weight: 1 });
  }
  return out;
}

// ---- the document ------------------------------------------------------------------------------------------------------
export function mediumOf(identity) { return identity && identity.medium === "3d-rig" ? "3d-rig" : "painted-2d"; }
export function actorLabel(identity) {
  if (!identity) return "unknown actor";
  if (identity.medium === "3d-rig") { const r = identity.rig || {}; return `code-built 3D actor (Rasan3D ${r.kind === "glb" ? "glb rig" : `builder ${r.builder || "?"} v${r.builder_version || "?"}`}); not a photoreal or scanned model`; }
  return "painted 2D actor (Rasan2D, drawn from code); a supplied still image is reference art, not a rig";
}
export function makePerformance({ identity, character_id, scene_id, audio, duration_s, visemes, expressions = [], gestures = [], targets = [], foot_plants = [], continuity = {}, baseDir } = {}) {
  const medium = mediumOf(identity);
  const words = (audio && audio.words) || [];
  return {
    schema_version: SCHEMA_VERSION, character_id: character_id || (identity && identity.id) || "", scene_id: scene_id || "", medium,
    canon_digest: identity ? identityDigest(identity) : null, rig_hash: medium === "3d-rig" && identity ? rigAssetHash(identity, baseDir) : null,
    actor_label: actorLabel(identity),
    audio: { source: (audio && audio.source) || null, sha256: (audio && audio.sha256) || null, words },
    duration_s, visemes: visemes || visemesFromWords(words),
    viseme_method: visemes ? "authored" : "text-heuristic inside transcript word times (approximate; no phoneme aligner)",
    expressions, gestures, targets, foot_plants, continuity: { in: continuity.in || null, out: continuity.out || null },
  };
}

// ---- validation --------------------------------------------------------------------------------------------------------
// opts: { identity, fps, scene_duration_s }. Emotion names are checked against the rig that will draw them.
export function validatePerformance(doc, opts = {}) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  if (!isObj(doc)) return { ok: false, errors: ["not an object"], warnings };
  if (doc.schema_version !== 1) E(`schema_version ${doc.schema_version} unsupported (need 1)`);
  for (const k of ["character_id", "scene_id"]) if (typeof doc[k] !== "string" || !doc[k]) E(`${k} is required`);
  const dur = num(opts.scene_duration_s) ? opts.scene_duration_s : doc.duration_s;
  if (!(num(dur) && dur > 0)) E("duration_s (scene-local seconds) is required");
  const fps = opts.fps || 30;
  const id = opts.identity;
  if (id) {
    const v = validateIdentity(id, { medium: mediumOf(id) });
    if (!v.ok) E(`the canon itself is invalid: ${v.errors[0].message}`);
    if (doc.canon_digest !== identityDigest(id)) E("canon_digest does not match the identity file: the actor changed since this performance was authored (re-author or re-seal)");
    if (mediumOf(id) === "3d-rig" && doc.rig_hash && doc.rig_hash !== rigAssetHash(id, opts.baseDir)) E("rig_hash does not match: proportions, materials, palette or rig version changed");
    if (doc.medium && doc.medium !== mediumOf(id)) E(`medium ${doc.medium} differs from the canon's ${mediumOf(id)}`);
  } else W("no identity supplied: the canon digest could not be checked");
  const names = (() => { try { return doc.medium === "3d-rig" ? R3().EMOTIONS : R2().EMOTION_NAMES; } catch { return null; } })();
  const sorted = (rows, what, tKey = "t_s") => {
    let prev = -Infinity;
    for (const [i, r] of (Array.isArray(rows) ? rows : []).entries()) {
      if (!num(r[tKey])) { E(`${what}[${i}]: ${tKey} must be a number`); continue; }
      if (r[tKey] < prev - 1e-9) E(`${what}[${i}]: times must be sorted`); prev = r[tKey];
      if (r[tKey] < -1e-9 || (num(dur) && r[tKey] > dur + 1e-6)) E(`${what}[${i}]: ${tKey} ${r[tKey]} is outside the scene (0..${dur})`);
      if (r.dur_s !== undefined && !(num(r.dur_s) && r.dur_s >= 0)) E(`${what}[${i}]: dur_s must be >= 0`);
      if (r.weight !== undefined && !(num(r.weight) && r.weight >= 0 && r.weight <= 1)) E(`${what}[${i}]: weight must be 0..1`);
    }
  };
  sorted(doc.visemes, "visemes"); sorted(doc.expressions, "expressions"); sorted(doc.gestures, "gestures");
  for (const [i, v] of (doc.visemes || []).entries()) if (!VISEMES[v.viseme]) E(`visemes[${i}]: unknown viseme ${JSON.stringify(v.viseme)} (have ${Object.keys(VISEMES).join(", ")})`);
  for (const [i, x] of (doc.expressions || []).entries()) if (names && !names.includes(x.name)) E(`expressions[${i}]: ${JSON.stringify(x.name)} is not an emotion the ${doc.medium} rig draws`);
  for (const [i, t] of (doc.targets || []).entries()) { if (!["gaze", "head", "body"].includes(t.kind)) E(`targets[${i}]: kind must be gaze, head or body`); sorted(t.keyframes, `targets[${i}].keyframes`); }
  for (const [i, f] of (doc.foot_plants || []).entries()) if (!(num(f.t0_s) && num(f.t1_s) && f.t1_s > f.t0_s)) E(`foot_plants[${i}]: t0_s < t1_s required`);
  // speech: the audio the visemes follow must be named and checksummed, and its words must lie inside the scene
  if (!isObj(doc.audio) || !doc.audio.source || !/^[0-9a-f]{64}$/.test(String(doc.audio.sha256 || ""))) W("audio.source / audio.sha256 missing: the dialogue these visemes follow is not pinned");
  const al = measureAlignment(doc, { fps });
  if (al.words > 0 && al.max_abs_frames > 2) W(`mouth onsets are up to ${al.max_abs_frames} frames off their words (mean ${al.mean_abs_frames}); correct the track, do not call it in sync`);
  return { ok: !errors.length, errors, warnings, alignment: al };
}

// ---- measuring lip-sync -------------------------------------------------------------------------------------------------
// For every transcript word: the first non-rest mouth shape after the previous word's end (at most 0.5 s before this word) and the word's start. offset_frames = (mouth onset - word start) * fps.
// This measures the TRACK against the transcript's word times. It does not measure the audio waveform, and the transcript's own timing has an error:
// the result says so and is never a "frame-perfect" claim.
export function measureAlignment(doc, { fps = 30 } = {}) {
  const words = ((doc.audio && doc.audio.words) || []).filter((w) => num(w.start) && num(w.end)).sort((a, b) => a.start - b.start);
  const vs = (doc.visemes || []).filter((v) => v.viseme !== "rest" && num(v.t_s)).sort((a, b) => a.t_s - b.t_s);
  const rows = [];
  let prevEnd = -Infinity;
  for (const w of words) {
    // the search window starts after the previous word ended (its mouth shapes belong to it) and at most half a second before this word
    const lo = Math.max(prevEnd, w.start - 0.5);
    const onset = vs.find((v) => v.t_s >= lo - 1e-9 && v.t_s <= w.end);
    rows.push({ text: w.text, word_start: w.start, mouth_onset: onset ? onset.t_s : null, offset_frames: onset ? r4((onset.t_s - w.start) * fps) : null });
    prevEnd = w.end;
  }
  const m = rows.filter((r) => r.offset_frames != null).map((r) => Math.abs(r.offset_frames));
  const silent = rows.filter((r) => r.offset_frames == null).length;
  return {
    words: rows.length, measured: m.length, words_without_mouth: silent, fps,
    mean_abs_frames: m.length ? r4(m.reduce((a, b) => a + b, 0) / m.length) : null, max_abs_frames: m.length ? Math.max(...m) : null,
    within_one_frame: m.filter((x) => x <= 1).length,
    basis: "track vs transcript word times (the transcript's own timing error is not included); not a waveform measurement",
    verdict: m.length ? `measured: ${m.filter((x) => x <= 1).length} of ${m.length} words within one frame at ${fps} fps, worst ${Math.max(...m)} frames` : "nothing to measure",
    rows,
  };
}

// ---- pose at a time (pure) -------------------------------------------------------------------------------------------------
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
function envelope(t, t0, dur, attack = 0.12, release = 0.18) {
  if (t < t0) return 0;
  if (dur <= 0) return 0;
  const a = Math.min(attack, dur * 0.45), r = Math.min(release, dur * 0.45);
  return smooth((t - t0) / a) * (1 - smooth((t - (t0 + dur - r)) / r));
}
function targetAt(keys, t) {
  const k = (keys || []).filter((x) => num(x.t_s) && Array.isArray(x.at));
  if (!k.length) return null;
  if (t <= k[0].t_s) return k[0].at.slice();
  if (t >= k[k.length - 1].t_s) return k[k.length - 1].at.slice();
  let i = 0; while (i + 1 < k.length && k[i + 1].t_s <= t) i++;
  const u = smooth((t - k[i].t_s) / (k[i + 1].t_s - k[i].t_s));
  return k[i].at.map((v, n) => v + (k[i + 1].at[n] - v) * u);
}
// the pose is a function of (doc, t): mouth from the viseme active at t blended with its neighbours over a short attack/release, expressions as enveloped weights,
// gestures active at t, gaze/head/body targets interpolated, feet planted when t is inside a hold. No state survives between calls.
export function poseAt(doc, t) {
  const vs = (doc.visemes || []).filter((v) => num(v.t_s));
  let open = 0, w = 1, shape = null, active = "rest";
  for (const v of vs) {
    const e = envelope(t, v.t_s, Math.max(v.dur_s || 0.08, 0.04), 0.05, 0.05) * (v.weight ?? 1);
    if (e > 0 && v.viseme !== "rest") {
      const m = visemeMouth(v.viseme);
      if (m.open * e >= open) { open = m.open * e; w = 1 + (m.w - 1) * e; shape = m.shape; active = v.viseme; }
    }
  }
  const expr = (doc.expressions || []).map((x) => ({ name: x.name, weight: r4(envelope(t, x.t_s, x.dur_s ?? 0.5) * (x.weight ?? 1)) })).filter((x) => x.weight > 1e-4);
  const gestures = (doc.gestures || []).filter((g) => t >= g.t_s && t < g.t_s + (g.dur_s ?? 0.5)).map((g) => g.kind + (g.id ? ":" + g.id : ""));
  const tg = {};
  for (const x of doc.targets || []) { const p = targetAt(x.keyframes, t); if (p) tg[x.kind] = p.map(r4); }
  return { t, mouth: { open: r4(open), width: r4(w), shape, viseme: active }, expressions: expr, gestures, targets: tg, planted: (doc.foot_plants || []).some((f) => t >= f.t0_s && t < f.t1_s) };
}

// ---- continuity across scenes -------------------------------------------------------------------------------------------------
// Two scenes of one actor agree when the canon digest (and rig hash) is identical, the same medium draws both, and scene A's `out` pose constraint equals B's `in`.
export function checkContinuity(a, b) {
  const errors = [], warnings = [];
  if (a.character_id !== b.character_id) errors.push("different characters");
  if (a.canon_digest !== b.canon_digest) errors.push("canon_digest differs: the actor's identity changed between scenes");
  if (a.rig_hash !== b.rig_hash) errors.push("rig_hash differs: proportions, materials, palette or rig version changed between scenes");
  if (a.medium !== b.medium) errors.push(`medium changes (${a.medium} -> ${b.medium}): a 2D fallback in one scene and a 3D actor in the next is a different look, not continuity`);
  const o = a.continuity && a.continuity.out, i = b.continuity && b.continuity.in;
  if (o && i && JSON.stringify(o) !== JSON.stringify(i)) errors.push("scene A's out pose differs from scene B's in pose");
  if (!o || !i) warnings.push("no pose constraint recorded at the seam: the cut is unchecked");
  return { ok: !errors.length, errors, warnings };
}

// ---- the render bridge -------------------------------------------------------------------------------------------------------
// Rasan2D (stage2d/runtime/gestures.js): `emote` actions; a viseme is an emote that keeps the current expression and overrides the mouth (a.mouth {open,w,shape}).
//   -> the actions[] of a Rasan2D sequence for this actor. Gestures keep their own kinds (look, reach, hop, turn, blink...).
// Rasan3D (stage3d/character-rig.js): `react` (6 emotions), `look`, `point`, `hop`, `walk`, `turn`. The 3D rig has NO viseme channel: the mouth only opens through react.mouth.
//   -> actions[] for the rig, with `limits` naming what could not be driven (visemes; expressions outside the rig's six, mapped to the nearest and marked).
const NEAREST_3D = { calm: "curious", amused: "joyful", excited: "joyful", delighted: "joyful", happy: "joyful", scared: "worried", frustrated: "worried", angry: "worried", disappointed: "sad", shocked: "surprised" };
export function toRigActions(doc, { actor = doc.character_id } = {}) {
  const limits = [];
  if (doc.medium === "3d-rig") {
    const emos = (() => { try { return R3().EMOTIONS; } catch { return []; } })();
    const actions = [];
    for (const x of doc.expressions || []) {
      const name = emos.includes(x.name) ? x.name : NEAREST_3D[x.name];
      if (!name) { limits.push(`expression ${x.name}: no equivalent in the 3D rig; skipped`); continue; }
      if (name !== x.name) limits.push(`expression ${x.name}: shown as ${name} (the 3D rig has ${emos.length} emotions)`);
      actions.push({ kind: "react", emotion: name, at: x.t_s, duration: Math.max(0.1, x.dur_s ?? 0.5) });
    }
    for (const g of doc.gestures || []) actions.push({ ...g, at: g.t_s, duration: Math.max(0.1, g.dur_s ?? 0.5), t_s: undefined, dur_s: undefined });
    if ((doc.visemes || []).some((v) => v.viseme !== "rest")) limits.push("visemes: the 3D rig has no viseme channel (the mouth moves only through emotions); lip-sync is not driven in 3D");
    return { medium: "3d-rig", actions: actions.sort((p, q) => p.at - q.at), limits };
  }
  const actions = [];
  const expAt = (t) => { const e = (doc.expressions || []).filter((x) => t >= x.t_s && t < x.t_s + (x.dur_s ?? 0.5)).pop(); return e ? e.name : "calm"; };
  for (const x of doc.expressions || []) actions.push({ actor, kind: "emote", emotion: x.name, at: x.t_s, duration: Math.max(0.1, x.dur_s ?? 0.5) });
  for (const g of doc.gestures || []) actions.push({ actor, ...g, at: g.t_s, duration: g.dur_s ?? 0.5, t_s: undefined, dur_s: undefined });
  for (const v of doc.visemes || []) {
    const m = visemeMouth(v.viseme);
    if (v.viseme === "rest") { actions.push({ actor, kind: "emote", emotion: expAt(v.t_s), at: v.t_s, duration: Math.max(0.04, v.dur_s ?? 0.06), viseme: "rest" }); continue; }
    actions.push({ actor, kind: "emote", emotion: expAt(v.t_s), at: v.t_s, duration: Math.max(0.04, v.dur_s ?? 0.08), mouth: { open: r4(m.open * (v.weight ?? 1)), w: m.w, shape: m.shape || undefined }, viseme: v.viseme });
  }
  return { medium: "painted-2d", actions: actions.sort((p, q) => p.at - q.at), limits };
}

// ---- V3 W08 (additive): acting, contact and discontinuity READ-OUTS -------------------------------------------------------------------------------
// Pure functions of a performance document; no rig, render or clock. They report what the TRACKS declare (source-level evidence); whether the drawn result reads is a
// separate, visual judgement and is never claimed here. A commitment that allows stillness (hold_ok) is satisfied by a declared hold, so static emotion stays legitimate.
//
// commitments: [{ id, kind:"intention"|"anticipation"|"reaction"|"eyeline"|"contact"|"expression", t0_s, t1_s, hold_ok?, target?, name? }]
// -> [{ id, kind, state:"declared"|"intentional-hold"|"not-declared", evidence:[...] }]   (callers map not-declared to capability_unavailable / review, never to a failure by itself)
export function actingCoverage(doc, commitments = []) {
  const d = isObj(doc) ? doc : {};
  const within = (x, c) => num(x.t_s) && x.t_s < c.t1_s + 1e-9 && x.t_s + (x.dur_s ?? 0) > c.t0_s - 1e-9;
  return (Array.isArray(commitments) ? commitments : []).filter(isObj).map((c) => {
    const ev = [];
    if (c.kind === "expression" || c.kind === "reaction" || c.kind === "intention") for (const x of d.expressions || []) if (within(x, c) && (!c.name || x.name === c.name)) ev.push(`expression:${x.name}@${x.t_s}`);
    if (c.kind === "reaction" || c.kind === "anticipation" || c.kind === "contact" || c.kind === "intention") for (const g of d.gestures || []) if (within(g, c) && (!c.target || g.target === c.target)) ev.push(`gesture:${g.kind}@${g.t_s}`);
    if (c.kind === "eyeline" || c.kind === "intention") for (const t of d.targets || []) if (t.kind === "gaze" && (t.keyframes || []).some((k) => num(k.t_s) && k.t_s >= c.t0_s - 1e-9 && k.t_s <= c.t1_s + 1e-9)) ev.push("target:gaze");
    const hold = (d.foot_plants || []).some((f) => num(f.t0_s) && f.t0_s <= c.t0_s + 1e-9 && f.t1_s >= c.t1_s - 1e-9);
    const state = ev.length ? "declared" : c.hold_ok && hold ? "intentional-hold" : "not-declared";
    return { id: c.id ?? null, kind: c.kind ?? null, state, evidence: hold && state === "intentional-hold" ? ["hold:foot_plant"] : ev };
  });
}

// object contact: a gesture with a `target` names what is held/touched for [t_s, t_s+dur_s]. Reports contact intervals the document declares and the ones a commitment
// names that nothing declares or that end early. It cannot see a prop drift in the picture (that is a temporal visual read, W05/W09).
export function contactCoverage(doc, commitments = []) {
  const gs = (isObj(doc) && Array.isArray(doc.gestures) ? doc.gestures : []).filter((g) => num(g.t_s) && g.target);
  return (Array.isArray(commitments) ? commitments : []).filter((c) => isObj(c) && c.kind === "contact").map((c) => {
    const hits = gs.filter((g) => g.target === c.target && g.t_s <= c.t0_s + 1e-9);
    const covering = hits.find((g) => g.t_s + (g.dur_s ?? 0) >= c.t1_s - 1e-9);
    return { id: c.id ?? null, target: c.target ?? null, state: covering ? "declared" : hits.length ? "ends-early" : "not-declared", evidence: (covering || hits[0]) ? [`gesture:${(covering || hits[0]).kind}@${(covering || hits[0]).t_s}`] : [] };
  });
}

// abrupt expression replacement: sample poseAt at fps and report frames where the weight vector jumps by more than maxStep (default 0.5) between adjacent frames.
// An approved cut-based/stepped acting style passes allowAbrupt:true; the intervals are still returned as `intentional`.
export function expressionDiscontinuities(doc, { fps = 30, maxStep = 0.5, allowAbrupt = false } = {}) {
  const dur = isObj(doc) && num(doc.duration_s) ? doc.duration_s : 0;
  const found = [];
  let prev = null;
  for (let f = 0; f <= Math.floor(dur * fps); f++) {
    const t = f / fps, w = {};
    for (const e of poseAt(doc, t).expressions) w[e.name] = e.weight;
    if (prev) {
      let step = 0;
      for (const k of new Set([...Object.keys(prev), ...Object.keys(w)])) step = Math.max(step, Math.abs((w[k] || 0) - (prev[k] || 0)));
      if (step > maxStep) found.push({ t0_s: r4((f - 1) / fps), t1_s: r4(t), step: r4(step) });
    }
    prev = w;
  }
  return { fps, max_step: maxStep, discontinuities: allowAbrupt ? [] : found, intentional: allowAbrupt ? found : [], basis: "declared expression tracks sampled with poseAt; not a measurement of rendered pixels" };
}
