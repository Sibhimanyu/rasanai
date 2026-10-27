// Shared anchors and regions (W14) and transitions derived from them.
// One set of moving anchors (rules, edges, focal points) and the regions that hang off them (cells, image windows, type groups, crops, layers).
// Every dependent object reads the same anchor at the same time, so edges agree by construction. This module PLANS and VALIDATES; the evaluation
// itself is runtime/rasan-layout.js (loaded here with createRequire so Node and the page run the very same code, and bound to a paused GSAP timeline
// by RasanLayout.bind). It has no clock of its own: every time is seconds on the EXISTING score (motion/score.json) and is checked against it; with no
// score the times stay unresolved and the state says uncertain. No design database, no renderer, no approval step.
//
// Units: all positions are fractions of the frame (x, y from the top-left; w, h sizes), like lib/safezones.mjs. Times are score seconds.
// Region / anchor IDs match ID_RE and are shared with lib/text-performance.mjs (a text group names its region_id / anchor_id) and, later, the storyboard.
// capabilityState: available | uncertain | unavailable. Unknown stays unknown: nothing here claims a render, a seek check or reference parity.
//
// Consumers (proposed wiring, not done here): the Motion Director's score step calls planAnchors and writes the returned `runtime` plan next to the score;
// the scene page binds it with RasanLayout.bind; deriveTransition is called at a boundary the storyboard marked meaningful; INT-ENGINE-A adds
// rasan-layout.js to the injected runtime files (see RUNTIME_FILES patch in the W13/W14 report).
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { zonesFor, boxInZones } from "./safezones.mjs";
import { CREATIVE_ERROR_CODES as E } from "./creative-policy.mjs";

const layout = createRequire(import.meta.url)("../../runtime/rasan-layout.js");

export const ID_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
export const REGION_KINDS = ["rule", "cell", "window", "type_group", "crop", "layer", "focal", "mask", "curve"];   // mask|curve (additive): a masked or curved region large type relates to (see `relation` on a type_group region)
export const TRANSITION_MECHANISMS = {
  // mechanism -> { carries: invariant types it can honour, support, mechanics }
  rule_becomes_boundary: { carries: ["spatial_anchor", "shape"], support: "available", mechanics: "RasanLayout.bind: one anchor set drives both layouts; no tween per edge" },
  field_opens_to_detail: { carries: ["spatial_anchor", "camera", "shape"], support: "available", mechanics: "RasanLayout.bind region growth plus RasanShape.iris/flood (byArea) for a circular field" },
  window_becomes_counter: { carries: ["shape", "spatial_anchor"], support: "uncertain", mechanics: "needs glyph counter geometry (W13 outline source); fall back to field_opens_to_detail with a mask" },
  foreground_cover: { carries: ["motion_direction", "spatial_anchor", "color"], support: "available", mechanics: "a layer region crossing the frame (RasanLayout.bind) while the next view is set behind it" },
  zoom_representation: { carries: ["camera", "spatial_anchor"], support: "available", mechanics: "RasanCamera push/scale through a region plus a crossfade-free swap at full cover" },
  color_field_wash: { carries: ["color"], support: "available", mechanics: "RasanShape.flood (byArea) in the outgoing or incoming colour" },
  object_carry: { carries: ["identity"], support: "uncertain", mechanics: "needs one continuity owner for the object across both shots (W06 ownership); layout only supplies the shared anchor" },
  hard_cut: { carries: ["contrast"], support: "available", mechanics: "no tween; the contrast is the intent, so it needs a declared meaning and never counts as a derived link" },
};
const MECH_FOR = { spatial_anchor: "rule_becomes_boundary", shape: "field_opens_to_detail", camera: "zoom_representation", motion_direction: "foreground_cover", color: "color_field_wash", identity: "object_carry", contrast: "hard_cut" };

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v) => (num(v) ? Math.round(v * 1e6) / 1e6 : v);
const err = (code, ref, message) => ({ code, ref, message });

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canon(v[k])]));
  return v;
}
export const digestOf = (v) => createHash("sha256").update(JSON.stringify(canon(v))).digest("hex");

function normalizeScore(score) {
  if (!isObj(score)) return null;
  const dur = num(score.duration) ? score.duration : num(score.duration_s) ? score.duration_s : num(score.total_s) ? score.total_s : null;
  return { duration: dur, beats: arr(score.beats).filter(num).sort((a, b) => a - b) };
}

// regions[]: { id, kind, layer?, edges: {left,right,top,bottom} | rect: {x,y,w,h}, role?, group_id?, media?: {crop:{x,y,w,h}} }
// anchors[]: { id, keyframes?: [{t,x?,y?,ease?}], at?: {x,y}, follow?: {anchor,dx,dy} }
// -> { ok, regions, anchors, bounds, sample_times, runtime, digest, capabilityState, errors[], warnings[], bleeds[], safe_zone }
export function planAnchors({ regions = [], anchors = [], score = null, frame = { w: 1920, h: 1080 }, destination = null, aspect = null } = {}) {
  const errors = [], warnings = [], unknown = [];
  const sc = normalizeScore(score);
  const A = {}, R = {}, outA = [], outR = [];

  for (const a of arr(anchors)) {
    if (!isObj(a) || !ID_RE.test(String(a.id))) { errors.push(err(E.stale_input, "anchors", `anchor id must match ${ID_RE}`)); continue; }
    if (A[a.id]) { errors.push(err(E.stale_input, a.id, "duplicate anchor id")); continue; }
    const e = { id: a.id };
    if (a.follow) e.follow = { anchor: String(a.follow.anchor), dx: a.follow.dx || 0, dy: a.follow.dy || 0 };
    if (a.at) e.at = { x: a.at.x, y: a.at.y };
    if (a.keyframes) {
      const ks = arr(a.keyframes).map((k) => ({ t: k.t, x: k.x, y: k.y, ease: k.ease }));
      let last = -Infinity;
      for (const k of ks) {
        if (!num(k.t)) { errors.push(err(E.temporal_evidence_missing, a.id, "keyframe without a numeric score time")); continue; }
        if (k.t < last) errors.push(err(E.stale_input, a.id, `keyframes reversed at t=${k.t}`));
        last = k.t;
        if (sc && sc.duration !== null && (k.t < 0 || k.t > sc.duration)) errors.push(err(E.stale_input, a.id, `keyframe t=${k.t} is outside the score (0..${sc.duration})`));
        if (!layout.knownEase(k.ease)) unknown.push(`${a.id}: ease "${k.ease}" not in RasanLayout.EASES (evaluated linear)`);
      }
      e.keyframes = ks;
      if (!sc || sc.duration === null) unknown.push(`${a.id}: no score duration given, keyframe times unchecked`);
    }
    if (!e.follow && !e.at && !e.keyframes) errors.push(err(E.stale_input, a.id, "anchor needs keyframes, at or follow"));
    A[a.id] = e; outA.push(e);
  }

  for (const r of arr(regions)) {
    if (!isObj(r) || !ID_RE.test(String(r.id))) { errors.push(err(E.stale_input, "regions", `region id must match ${ID_RE}`)); continue; }
    if (R[r.id]) { errors.push(err(E.stale_input, r.id, "duplicate region id")); continue; }
    if (r.kind !== undefined && !REGION_KINDS.includes(r.kind)) warnings.push(`${r.id}: kind "${r.kind}" is not one of ${REGION_KINDS.join("|")}`);
    let edges = r.edges;
    if (!edges && isObj(r.rect)) edges = { left: r.rect.x, top: r.rect.y, right: r.rect.x + r.rect.w, bottom: r.rect.y + r.rect.h };
    if (!isObj(edges)) { errors.push(err(E.stale_input, r.id, "region needs edges or rect")); continue; }
    for (const side of ["left", "right", "top", "bottom"]) {
      const v = edges[side], ref = typeof v === "string" ? v : isObj(v) ? v.anchor : null;
      if (ref !== null && ref !== undefined && !A[ref]) errors.push(err(E.stale_input, r.id, `edge ${side} names unknown anchor "${ref}"`));
      if (v === undefined) errors.push(err(E.stale_input, r.id, `edge ${side} missing`));
    }
    const e = { id: r.id, kind: r.kind || "cell", layer: num(r.layer) ? r.layer : 0, edges, role: r.role, group_id: r.group_id, media: r.media };
    R[r.id] = e; outR.push(e);
  }

  const runtime = { frame: { w: frame.w, h: frame.h }, anchors: {}, regions: {} };
  for (const a of outA) { const { id, ...rest } = a; runtime.anchors[id] = rest; }
  for (const r of outR) runtime.regions[r.id] = { layer: r.layer, edges: r.edges };

  // cycles / unresolved references surface as one named error each
  for (const a of outA) { try { layout.anchorAt(runtime, a.id, 0); } catch (x) { errors.push(err(/cycle/.test(x.message) ? E.continuity_cycle : E.stale_input, a.id, x.message)); } }

  const times = new Set();
  if (sc && sc.duration !== null) { times.add(0); times.add(sc.duration); }
  for (const a of outA) for (const k of arr(a.keyframes)) if (num(k.t) && (!sc || sc.duration === null || (k.t >= 0 && k.t <= sc.duration))) times.add(k.t);
  if (!times.size) times.add(0);
  const sample_times = [...times].sort((p, q) => p - q);

  const bounds = {}, bleeds = [];
  if (!errors.length) {
    for (const r of outR) {
      bounds[r.id] = sample_times.map((t) => {
        const q = layout.rectAt(runtime, r.id, t);
        const row = { t, x: round(q.x), y: round(q.y), w: round(q.w), h: round(q.h) };
        if (!num(row.w) || row.w < 0 || row.h < 0) errors.push(err(E.stale_input, r.id, `region has no usable size at t=${t}`));
        else if (row.x < 0 || row.y < 0 || row.x + row.w > 1 || row.y + row.h > 1) { if (!bleeds.includes(r.id)) bleeds.push(r.id); }
        return row;
      });
    }
  }
  // crop windows: the image crop must lie inside the unit square (the picture), or the window shows nothing there
  for (const r of outR) { const c = r.media && r.media.crop; if (c && (c.x < 0 || c.y < 0 || c.x + c.w > 1 || c.y + c.h > 1)) errors.push(err(E.stale_input, r.id, "media.crop leaves the source picture (fractions of the source)")); }

  // advisory only: reading regions against the destination's platform UI. Deliberately cropped texture and bleeds are not flagged.
  let safe_zone = null;
  if (destination || aspect) {
    const zones = zonesFor(destination, aspect);
    safe_zone = { destination: zones.id, notes: [] };
    for (const r of outR) {
      if (!(r.role === "primary_reading" || r.role === "qualifier" || r.role === "product_evidence")) continue;
      for (const row of bounds[r.id] || []) {
        const hits = boxInZones(row, zones).filter((h) => h.zone !== "margin" || h.share > 0.05);
        if (hits.length) safe_zone.notes.push({ region_id: r.id, t: row.t, hits });
      }
    }
  }

  const capabilityState = errors.length ? "unavailable" : unknown.length ? "uncertain" : "available";
  const digest = digestOf({ frame: runtime.frame, anchors: runtime.anchors, regions: outR.map((r) => ({ id: r.id, kind: r.kind, layer: r.layer, edges: r.edges, role: r.role, group_id: r.group_id, media: r.media })), score: sc });
  return { ok: !errors.length, regions: outR, anchors: outA, bounds, sample_times, runtime, digest, capabilityState, errors, warnings: warnings.concat(unknown), bleeds, safe_zone };
}

// from / to = { at, region_id?, anchor_id?, features: [{ type, ... }] }  (at = score seconds: from.at is where the outgoing view ends, to.at where the incoming begins)
// invariants = [{ type: spatial_anchor|shape|camera|motion_direction|color|identity|contrast, note? }] : what the boundary must carry (a hard cut declares contrast + a reason)
// opts = { plan: planAnchors() result, score }  -> { ok, mechanism, interval, regions, bounds, digest, capabilityState, unresolved_invariants[], steps[], errors[], notes[] }
// The bridge region `tr:<from>:<to>` is the rect that runs from the outgoing region's bounds at from.at to the incoming region's bounds at to.at (the same
// anchor evaluation), so the boundary is part of the shared interval, not a transition picked after both scenes were finished.
export function deriveTransition({ from, to, invariants = [] } = {}, { plan = null, score = null } = {}) {
  const errors = [], notes = [];
  const sc = normalizeScore(score);
  if (!isObj(from) || !isObj(to)) return { ok: false, mechanism: null, interval: null, regions: [], bounds: {}, digest: null, capabilityState: "unavailable", unresolved_invariants: [], steps: [], errors: [err(E.stale_input, "transition", "from and to are required")], notes };
  for (const [k, s] of [["from", from], ["to", to]]) {
    if (!num(s.at)) errors.push(err(E.temporal_evidence_missing, k, `${k}.at (score seconds) is required; no timing is invented`));
    else if (sc && sc.duration !== null && (s.at < 0 || s.at > sc.duration)) errors.push(err(E.stale_input, k, `${k}.at=${s.at} is outside the score (0..${sc.duration})`));
    for (const ref of [s.region_id, s.anchor_id]) if (ref && ![...arr(plan && plan.regions).map((r) => r.id), ...arr(plan && plan.anchors).map((a) => a.id)].includes(ref)) errors.push(err(E.stale_input, k, `unknown id "${ref}" in the supplied anchor plan`));
  }
  if (num(from.at) && num(to.at) && to.at < from.at) errors.push(err(E.stale_input, "transition", "to.at is before from.at"));

  const want = arr(invariants).map((i) => (typeof i === "string" ? i : i && i.type)).filter(Boolean);
  const have = (s) => new Set(arr(s.features).map((f) => f && f.type));
  const fa = have(from), fb = have(to);
  const carried = [], unresolved = [];
  for (const t of want) {
    if (t === "contrast") { if (isObj(invariants.find((i) => i && i.type === "contrast")) && invariants.find((i) => i.type === "contrast").note) carried.push(t); else unresolved.push({ type: t, why: "a hard cut needs a declared meaning (note)" }); }
    else if (fa.has(t) && fb.has(t)) carried.push(t);
    else unresolved.push({ type: t, why: `${fa.has(t) ? "incoming" : fb.has(t) ? "outgoing" : "neither"} view lacks a "${t}" feature` });
  }
  if (!want.length) notes.push("no invariants declared: nothing links the two views, so no mechanism is derived (choose a hard cut with a stated meaning or declare what carries)");
  const mech = carried.map((t) => MECH_FOR[t]).filter(Boolean)[0] || null;
  const m = mech ? TRANSITION_MECHANISMS[mech] : null;

  let regions = [], bounds = {};
  const idsOf = (s) => s.region_id || null;
  if (plan && plan.ok && idsOf(from) && idsOf(to) && num(from.at) && num(to.at) && !errors.length) {
    const a = layout.rectAt(plan.runtime, from.region_id, from.at), b = layout.rectAt(plan.runtime, to.region_id, to.at);
    const bid = `tr:${from.region_id}:${to.region_id}`;
    regions = [from.region_id, to.region_id, bid];
    bounds[bid] = [{ t: from.at, x: round(a.x), y: round(a.y), w: round(a.w), h: round(a.h) }, { t: to.at, x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }];
    bounds[from.region_id] = [{ t: from.at, x: round(a.x), y: round(a.y), w: round(a.w), h: round(a.h) }];
    bounds[to.region_id] = [{ t: to.at, x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }];
  } else if (!plan) notes.push("no anchor plan supplied: no bounds computed");

  // the anchor relation a handoff record references: the ids, the instants and the anchors the two regions share. Same frame-fraction coordinate
  // system as the plan; no second one. null without a usable plan/region pair.
  let anchor_relation = null;
  if (regions.length && plan && plan.ok) {
    const edgeAnchors = (id) => { const r = arr(plan.regions).find((q) => q.id === id), s = new Set(); for (const v of Object.values((r && r.edges) || {})) { const ref = typeof v === "string" ? v : isObj(v) ? v.anchor : null; if (ref) s.add(ref); } return s; };
    const ea = edgeAnchors(from.region_id), eb = edgeAnchors(to.region_id);
    anchor_relation = { space: "frame_fraction", basis: "score", from: { region_id: from.region_id, anchor_id: from.anchor_id || null, at: from.at }, to: { region_id: to.region_id, anchor_id: to.anchor_id || null, at: to.at },
      bridge_region_id: `tr:${from.region_id}:${to.region_id}`, shared_anchors: [...ea].filter((x) => eb.has(x)).sort(), plan_digest: plan.digest };
  }

  let capabilityState = "available";
  if (errors.length || !mech) capabilityState = "unavailable";
  else if (unresolved.length || (m && m.support === "uncertain") || !regions.length) capabilityState = "uncertain";
  if (mech === "hard_cut" && !unresolved.length) capabilityState = capabilityState === "unavailable" ? capabilityState : "available";

  const interval = num(from.at) && num(to.at) ? { start: from.at, end: to.at } : null;
  const steps = mech ? [{ mechanism: mech, mechanics: m.mechanics, support: m.support, carries: carried, interval }] : [];
  if (m && m.support === "uncertain") notes.push(`${mech}: ${m.mechanics}`);
  const digest = digestOf({ from: { at: from.at, region_id: from.region_id, anchor_id: from.anchor_id, features: arr(from.features).map((f) => f && f.type) }, to: { at: to.at, region_id: to.region_id, anchor_id: to.anchor_id, features: arr(to.features).map((f) => f && f.type) }, want, mech, plan: plan ? plan.digest : null });
  return { ok: !errors.length && !!mech, mechanism: mech, interval, regions, bounds, digest, capabilityState, unresolved_invariants: unresolved, steps, errors, notes, anchor_relation };
}
