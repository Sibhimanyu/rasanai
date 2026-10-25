// Plan 06 V5: what a track IS, what it can honestly be used for, and where it breaks. Four different things share the word "tracking":
//
//   bbox          an axis-aligned box around an object. Good for pinning, cropping, reframing. NOT a silhouette, NOT perspective-correct.
//   planar-quad   four ordered corners (TL, TR, BR, BL) of a flat surface, with a homography. This is what screen replacement needs.
//   mask          a per-frame alpha silhouette (a person, a hand). This is what "text behind a person" needs.
//   depth         a per-frame distance map. Orders things in z; it is not a silhouette either.
//
// The track file is C5 (docs/plans/hybrid-film-contracts.md): `<film>/hybrid/tracks/<id>.json`, display-oriented normalised coordinates, samples keyed to the source's own
// PTS. Plan 06 adds a lenient `source` block so a track is bound to the exact media it was made on: checksum, display orientation (rotation, pixel aspect), display size and
// time base. A track whose source changed is stale: re-track, never reuse. Nothing here runs a tracker; scripts/track.mjs (manual keyframes, Apple Vision) produces tracks.
//
//   validateTrack(track, source?)      -> { ok, errors, warnings }                       strict structure + binding to the source
//   effectiveKeyframes(track)          -> samples with correction keyframes applied (a correction wins at its time, and anchors the interpolation)
//   quadAt(track, t_s)                 -> ordered quad at a source time (null outside the track or inside a lost span)
//   healthOf(track, { cuts_s })        -> { spans: [{kind, t0, t1, reason, fallbacks}], usable_fraction }   low confidence, scene cuts, lost
//   planTreatment({ treatment, track, mask, matte }) -> { mode: "exact" | "limited_fallback" | "refused", label, reason }
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const num = (x) => typeof x === "number" && Number.isFinite(x);

export const TRACK_TYPES = {
  bbox: { perspective_correct: false, silhouette: false, supports: ["pin", "crop", "reframe", "label_follow"], note: "a box, not a silhouette; no perspective" },
  "planar-quad": { perspective_correct: true, silhouette: false, supports: ["screen_replacement", "pin", "label_follow", "surface_decal"], note: "four ordered corners of a flat surface; occlusion needs a separate matte" },
  mask: { perspective_correct: false, silhouette: true, supports: ["text_behind_subject", "subject_cutout", "occlusion_matte"], note: "a real alpha silhouette per frame" },
  depth: { perspective_correct: false, silhouette: false, supports: ["z_order", "depth_of_field_hint"], note: "a distance map; it orders layers, it does not cut a subject out" },
};
export const ORIGINS = ["manual", "vision", "sam", "interpolated", "corrected"];
export const TRACK_STATUSES = ["tracked", "needs-correction", "manual", "failed"];
export const LOW_CONFIDENCE = 0.5;

// ---- geometry --------------------------------------------------------------------------------------------------
// quad: [[x,y]x4] in TL,TR,BR,BL. Convex and consistently wound (all cross products one sign); self-crossing ("bow-tie") quads are corner swaps and are rejected.
export function isConvexQuad(q) {
  if (!Array.isArray(q) || q.length !== 4 || !q.every((p) => Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]))) return false;
  let sign = 0;
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = q[k], [bx, by] = q[(k + 1) % 4], [cx, cy] = q[(k + 2) % 4];
    const c = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (c === 0) return false;
    if (sign && Math.sign(c) !== sign) return false;
    sign = Math.sign(c);
  }
  return true;
}
export const quadArea = (q) => { let a = 0; for (let k = 0; k < 4; k++) { const [x1, y1] = q[k], [x2, y2] = q[(k + 1) % 4]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
// largest corner move between two quads, in normalised units
export const quadJump = (a, b) => Math.max(...a.map((p, k) => Math.hypot(p[0] - b[k][0], p[1] - b[k][1])));
const lerpQuad = (a, b, u) => a.map((p, k) => [p[0] + (b[k][0] - p[0]) * u, p[1] + (b[k][1] - p[1]) * u]);

// ---- validation ------------------------------------------------------------------------------------------------
// source: { sha256, duration_s?, width?, height? } the media as it is now. A track made on other bytes is stale.
export function validateTrack(track, source) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  if (!isObj(track)) return { ok: false, errors: ["not an object"], warnings };
  if (track.schema_version !== 1) E(`schema_version ${track.schema_version} unsupported (need 1)`);
  if (typeof track.id !== "string" || !track.id) E("id is required");
  if (typeof track.asset_id !== "string" || !track.asset_id) E("asset_id is required");
  const type = track.track_type;
  if (!TRACK_TYPES[type]) E(`track_type must be one of ${Object.keys(TRACK_TYPES).join(", ")}`);
  if (track.timebase !== "source_pts_seconds") E('timebase must be "source_pts_seconds" (samples are keyed to the source\'s own timestamps, not CFR frame numbers)');
  if (!/^[0-9a-f]{64}$/.test(String(track.source_digest || ""))) E("source_digest (sha256 of the media bytes) is required");
  else if (source && source.sha256 && source.sha256 !== track.source_digest) E("source_digest is stale: the media changed since this track was made; re-track");
  // the exact display orientation the coordinates mean: without it a rotated phone clip is silently wrong
  const src = track.source;
  if (!isObj(src)) W("no `source` block (orientation, display size, time base): coordinates cannot be checked against the media; re-track to record it");
  else {
    if (![0, 90, 180, 270].includes(src.rotation_deg)) E("source.rotation_deg must be 0, 90, 180 or 270 (the display orientation the coordinates use)");
    if (!(num(src.display_width) && src.display_width > 0 && num(src.display_height) && src.display_height > 0)) E("source.display_width / display_height (after rotation and pixel aspect) are required");
    else if (source && num(source.width) && num(source.height) && (Math.round(source.width) !== Math.round(src.display_width) || Math.round(source.height) !== Math.round(src.display_height))) E(`source display size ${src.display_width}x${src.display_height} differs from the media (${source.width}x${source.height}): re-track`);
    if (!(src.time_base === "source_pts_seconds")) E('source.time_base must be "source_pts_seconds"');
  }
  if (!TRACK_STATUSES.includes(track.status)) E(`status must be one of ${TRACK_STATUSES.join(", ")}`);
  if (track.status === "failed") E("track status is failed: re-track or correct it by hand");
  if (!Array.isArray(track.frames) || !track.frames.length) { E("frames[] is empty"); return { ok: false, errors, warnings }; }
  let prev = -Infinity;
  for (const [i, f] of track.frames.entries()) {
    const at = `frames[${i}]`;
    if (!num(f.t_s) || !(f.t_s > prev)) E(`${at}: t_s must be a strictly increasing number`); else prev = f.t_s;
    if (source && num(source.duration_s) && f.t_s > source.duration_s + 1e-3) E(`${at}: t_s ${f.t_s} is past the media's duration`);
    if (f.origin !== undefined && !ORIGINS.includes(f.origin)) E(`${at}: origin must be one of ${ORIGINS.join(", ")}`);
    if (f.confidence !== undefined && !(num(f.confidence) && f.confidence >= 0 && f.confidence <= 1)) E(`${at}: confidence must be 0..1`);
    if (type === "planar-quad" && !f.lost && !isConvexQuad(f.quad_norm)) E(`${at}: quad_norm must be four points, convex, in TL,TR,BR,BL order (a swapped corner crosses the quad)`);
    if (type === "bbox" && !(Array.isArray(f.bbox_norm) && f.bbox_norm.length === 4 && f.bbox_norm.every(num)) && !f.lost) E(`${at}: bbox_norm [x,y,w,h] is required`);
  }
  if (type === "mask") {
    const m = track.mask;
    if (!isObj(m)) E("a mask track needs a `mask` block: where the alpha lives and how to read it");
    else {
      if (typeof m.asset !== "string" && !isObj(m.rle)) E("mask.asset (a PNG sequence / alpha video path) or mask.rle (run-length data with a declared decoder) is required");
      if (!["straight", "premultiplied"].includes(m.alpha_mode)) E("mask.alpha_mode must be straight or premultiplied (mixing them gives dark or bright fringes)");
      if (typeof m.color_space !== "string" || !m.color_space) E("mask.color_space is required");
      if (m.producer && !["vision", "sam", "manual"].includes(m.producer)) E("mask.producer must be vision, sam or manual");
    }
  }
  // corrections: ordered keyframes by the person; they must be valid quads and sorted
  let pc = -Infinity;
  for (const [i, c] of (Array.isArray(track.corrections) ? track.corrections : []).entries()) {
    if (!num(c.t_s) || !(c.t_s > pc)) E(`corrections[${i}]: t_s must be strictly increasing`); else pc = c.t_s;
    if (type === "planar-quad" && !isConvexQuad(c.quad_norm)) E(`corrections[${i}]: quad_norm must be a convex TL,TR,BR,BL quad`);
  }
  for (const f of track.frames) if (num(f.confidence) && f.confidence < LOW_CONFIDENCE) { W(`low confidence (${f.confidence}) from ${f.t_s}s: see healthOf()`); break; }
  return { ok: !errors.length, errors, warnings };
}
// the digest a render cache key can include: changes when samples, corrections or the bound media change
export const trackDigest = (track) => canonicalDigest({ id: track.id, t: track.track_type, d: track.source_digest, f: track.frames, c: track.corrections || [], m: track.mask || null });

// ---- reading a track at a time -----------------------------------------------------------------------------------
// corrections are keyframes: at their time they replace the sample, and the interpolation continues from them (so one fix moves the neighbours' path, not just one frame)
export function effectiveKeyframes(track) {
  const byT = new Map();
  for (const f of track.frames || []) byT.set(f.t_s, { ...f });
  for (const c of track.corrections || []) byT.set(c.t_s, { ...(byT.get(c.t_s) || {}), t_s: c.t_s, quad_norm: c.quad_norm, bbox_norm: c.bbox_norm ?? (byT.get(c.t_s) || {}).bbox_norm, confidence: 1, origin: "corrected", lost: false });
  return [...byT.values()].sort((a, b) => a.t_s - b.t_s);
}
export function quadAt(track, t) {
  const k = effectiveKeyframes(track);
  if (!k.length || t < k[0].t_s - 1e-6 || t > k[k.length - 1].t_s + 1e-6) return null;
  let i = 0; while (i + 1 < k.length && k[i + 1].t_s <= t) i++;
  const a = k[i], b = k[i + 1];
  if (a.lost || (b && b.lost && t >= a.t_s && t > a.t_s)) return null; // inside a lost span: no invented quad
  if (!b || t <= a.t_s) return a.quad_norm ? a.quad_norm.map((p) => [...p]) : null;
  return lerpQuad(a.quad_norm, b.quad_norm, (t - a.t_s) / (b.t_s - a.t_s));
}

// ---- where it breaks ------------------------------------------------------------------------------------------------
export const FALLBACKS = {
  keep_source: "keep the source footage as shot for this span (no replacement; never a black frame)",
  manual_correction: "add correction keyframes by hand over this span (Level 0 quad)",
  simpler_treatment: "swap to a simpler treatment for this span (a flat, labelled overlay or a plain cut)",
};
// cuts_s: scene cut times in source seconds (footage/shots.json). jump_max: a quad that moves further than this between two samples is a cut or a lost lock.
export function healthOf(track, { cuts_s = [], jump_max = 0.25, low = LOW_CONFIDENCE } = {}) {
  const k = effectiveKeyframes(track), spans = [];
  const span = (kind, t0, t1, reason) => spans.push({ kind, t0, t1, reason, fallbacks: ["keep_source", "manual_correction", ...(kind === "scene_cut" ? [] : ["simpler_treatment"])] });
  let run = null;
  for (let i = 0; i < k.length; i++) {
    const f = k[i], bad = f.lost || (num(f.confidence) && f.confidence < low);
    if (bad) { if (!run) run = { t0: f.t_s, lost: !!f.lost }; run.t1 = k[i + 1] ? k[i + 1].t_s : f.t_s; run.lost = run.lost || !!f.lost; }
    else if (run) { span(run.lost ? "lost" : "low_confidence", run.t0, run.t1, run.lost ? "the tracker lost the surface" : `confidence below ${low}`); run = null; }
    if (i > 0 && !f.lost && !k[i - 1].lost && track.track_type === "planar-quad" && f.quad_norm && k[i - 1].quad_norm && quadJump(f.quad_norm, k[i - 1].quad_norm) > jump_max && f.origin !== "corrected")
      span("quad_jump", k[i - 1].t_s, f.t_s, `a corner moved ${quadJump(f.quad_norm, k[i - 1].quad_norm).toFixed(2)} of the frame between two samples (a cut, a swapped corner or a lost lock)`);
  }
  if (run) span(run.lost ? "lost" : "low_confidence", run.t0, run.t1, run.lost ? "the tracker lost the surface" : `confidence below ${low}`);
  for (const c of cuts_s) { const a = k.find((f, i) => k[i + 1] && f.t_s <= c && k[i + 1].t_s > c); if (a) span("scene_cut", c, c, "a scene cut: a track cannot cross it; start a new track after the cut"); }
  spans.sort((a, b) => a.t0 - b.t0);
  const total = k.length > 1 ? k[k.length - 1].t_s - k[0].t_s : 0;
  const bad = spans.filter((s) => s.kind !== "scene_cut").reduce((s, x) => s + Math.max(0, x.t1 - x.t0), 0);
  return { spans, usable_fraction: total > 0 ? Math.max(0, 1 - bad / total) : 0, needs_attention: spans.length > 0 };
}

// ---- what a treatment may honestly use -----------------------------------------------------------------------------
//   screen_replacement   needs a planar-quad (homography). A bbox is refused: the warp would be wrong, not just rough.
//   text_behind_subject  needs a real mask. Without one the only option is a LABELLED limited fallback (text beside or in front, never presented as occlusion).
//   occlusion over a replaced screen: a matte track in front is `exact`; none is `limited_fallback` (the replacement draws over the hand) and says so.
export function planTreatment({ treatment, track, mask, matte } = {}) {
  const type = track && track.track_type;
  const refuse = (reason) => ({ mode: "refused", treatment, reason, label: null, fallbacks: ["keep_source", "manual_correction", "simpler_treatment"] });
  if (treatment === "screen_replacement") {
    if (type === "planar-quad") return matte && matte.track_type === "mask"
      ? { mode: "exact", treatment, label: "perspective-correct, with the foreground matte in front", reason: "planar quad + mask" }
      : { mode: "exact", treatment, label: "perspective-correct", reason: "planar quad", note: "a hand or object crossing the screen is NOT occluded: add a matte track for that", occlusion: "none" };
    if (type === "bbox") return { mode: "limited_fallback", treatment, label: "approximate flat overlay (a box has no perspective: the screen content will not line up with a tilted phone)", reason: "bounding box only", fallbacks: ["manual_correction", "keep_source"] };
    return refuse(type ? `a ${type} track cannot place content on a surface` : "no track: nothing to place the screen on");
  }
  if (treatment === "text_behind_subject") {
    const real = (mask && mask.track_type === "mask") || type === "mask";
    if (real) return { mode: "exact", treatment, label: "text behind the subject, cut by a real mask", reason: "mask track" };
    return { mode: "limited_fallback", treatment, label: "limited: no subject mask. The text sits beside the subject (placed from its box), it is NOT behind the person", reason: type === "bbox" ? "a bounding box is not a silhouette" : "no mask available", fallbacks: ["keep_source", "simpler_treatment"] };
  }
  if (treatment === "pin" || treatment === "label_follow") return type && TRACK_TYPES[type].supports.includes(treatment) ? { mode: "exact", treatment, label: `follows the ${type}`, reason: type } : refuse("no usable track");
  return refuse(`unknown treatment ${JSON.stringify(treatment)}`);
}

export const trackSchemaVersion = SCHEMA_VERSION;
