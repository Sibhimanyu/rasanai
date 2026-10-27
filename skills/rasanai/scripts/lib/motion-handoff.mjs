// Motion handoff math (Addendum 1, workstream C): carry position, velocity, scale, rotation, camera relation, mask state and settling
// across a DECLARED continuous boundary. Pure: no file, network, process or model access, no clock, no state between calls. Every
// result is a function of its arguments only, so seeking frames in any order, or restarting an interrupted production, gives the
// same answer. Status: implemented_unvalidated (nothing here was run against a film; see references/motion-handoffs.md).
//
//   toScreenSpace(state, chain, {output})            one declared space: final_screen (px, origin top-left, y down, degrees, scale ratio)
//   wrapAngle(deg, {lo})                             deg wrapped into [lo, lo+360); default (-180, 180]
//   seamTolerances(output, overrides)                tolerances relative to the output size and precision
//   seamReport(handoff, a, b, {score, output, ...})  math checks of one seam; visual acceptance stays a separate, human, playback verdict
//   planHandoff(handoff, {score, output, outgoing, incoming, ...})  the boundary conditions the incoming motion must start from
//
// Time is the score's: `handoff.boundary` comes from normalizeHandoff(raw, score) (integer ticks + the score's own frame), never an assumed fps.
// Producer: crew `plan` phase / packets.beatDeclarations (proposed, ENG-INT-1) -> creative/beat-plans.json beats.<id>.handoff and
// creative/plans/<beat>.json -> consumers: the scene animator (continueFrom in runtime/rasan-motion.js), checkSequence (records), reviewers (seamReport).
import { canonicalDigest } from "./contracts.mjs";
import { frameOf, scoreRate, toTicks, fromTicks } from "./timing.mjs";
import { normalizeHandoff, CARRY_PROPS, FINAL_SPACE } from "./sequence-contract.mjs";

export const HANDOFF_VERSION = 1;
export const MAX_CHAIN = 16; // bounded evaluation: a transform chain deeper than this is an authoring error, not a loop to run
const SEAM_STATUS = Object.freeze(["pass", "fail", "exempt", "not_carried", "not_assessable"]);
export { SEAM_STATUS };

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const n0 = (x, d = 0) => (fin(x) ? x : fin(Number(x)) && x !== null && x !== "" && x !== undefined ? Number(x) : d);
const S = (x) => (typeof x === "string" ? x.trim() : "");
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const DEG = Math.PI / 180;

export function wrapAngle(deg, { lo = -180 } = {}) {
  const d = Number(deg);
  if (!Number.isFinite(d)) return null;
  const w = ((((d - lo) % 360) + 360) % 360) + lo; // [lo, lo+360)
  return r6(lo === -180 && w === -180 ? 180 : w);
}
// signed shortest rotation from a to b, degrees in (-180, 180]
export const angleDelta = (a, b) => wrapAngle(Number(b) - Number(a));

// ---- output size and tolerances -------------------------------------------------------------------------------------------------------
// output: {width, height, precision_px?}. Tolerances scale with the frame diagonal and never fall under the output's own precision.
function outputOf(output) {
  const o = isObj(output) ? output : {};
  const width = fin(o.width) && o.width > 0 ? o.width : null, height = fin(o.height) && o.height > 0 ? o.height : null;
  return { width, height, diag: width && height ? Math.hypot(width, height) : null, precision_px: fin(o.precision_px) && o.precision_px > 0 ? o.precision_px : 0.5 };
}
export function seamTolerances(output, overrides = {}) {
  const o = outputOf(output), ov = isObj(overrides) ? overrides : {};
  const diag = o.diag || 2202.9; // 1920x1080 diagonal when the caller gave no size; reported via assumed_output
  const t = {
    position_px: Math.max(o.precision_px, 0.0015 * diag),            // ~3.3 px on 1080p
    velocity_px_s: Math.max(2 * o.precision_px, 0.02 * diag),         // absolute floor, px per second
    velocity_rel: 0.1,                                                // or 10% of the faster side
    scale: 0.005, scale_rate: 0.02, scale_rate_rel: 0.1,
    rotation_deg: 0.25, angular_deg_s: 2, angular_rel: 0.1,
  };
  for (const k of Object.keys(t)) if (fin(ov[k]) && ov[k] >= 0) t[k] = ov[k];
  return { ...t, assumed_output: !o.diag, basis: "output_size_and_precision" };
}

// ---- coordinate conversion ------------------------------------------------------------------------------------------------------------
// chain: levels from the innermost (closest to the object) outward. A level maps its child space into its parent space:
//   p' = o + t + R(rotate) * scale * (p - o)             (origin o is preserved: rotation and scale act about it)
//   level: {id, kind: scene|parent|world|camera, translate:{x,y}, scale, rotate (deg), origin:{x,y}, velocity:{x,y}, scale_rate, angular (deg/s),
//           inverse (camera: world -> screen is the inverse of the camera's own transform), applied (true when `state` already contains this level)}
// No double application: a level with applied:true is skipped, a repeated level id is skipped (reported), and ids that are not unique per kind are the caller's bug.
function pt(v) { return isObj(v) ? { x: n0(v.x), y: n0(v.y) } : { x: 0, y: 0 }; }
function rot(a, p) { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); return { x: c * p.x - s * p.y, y: s * p.x + c * p.y }; }
function rotPerp(a, p) { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); return { x: -s * p.x - c * p.y, y: c * p.x - s * p.y }; } // d/d(radians) R(a) p
function toPx(v, unit, out) {
  if (!v) return null;
  if (unit === "frame_fraction") { if (!out.width) return null; return { x: v.x * out.width, y: v.y * out.height }; }
  return { x: v.x, y: v.y };
}
function fromPx(v, unit, out) {
  if (!v) return null;
  if (unit === "frame_fraction") return { x: r6(v.x / out.width), y: r6(v.y / out.height) };
  return { x: r6(v.x), y: r6(v.y) };
}

// state: {position:{x,y}, velocity:{x,y} (per second), scale, scale_rate (ratio per second), rotation (deg), angular (deg/s), camera_relation, mask_state, settle, unit?: px|frame_fraction}
// -> the same fields in final screen space (position and velocity in `output.units`, default px), plus {space:"final_screen", applied:[ids], skipped:[ids], issues:[...]}.
export function toScreenSpace(state, chain = [], { output = null, units = null } = {}) {
  const st = isObj(state) ? state : {}, out = outputOf(output), issues = [], applied = [], skipped = [];
  const unitIn = S(st.unit) || "px", unitOut = S(units || (isObj(output) && output.units)) || "px";
  const levels = Array.isArray(chain) ? chain : [];
  if (levels.length > MAX_CHAIN) issues.push({ code: "chain_too_long", message: `transform chain has ${levels.length} levels (max ${MAX_CHAIN}); only the first ${MAX_CHAIN} were applied` });
  if ((unitIn === "frame_fraction" || unitOut === "frame_fraction") && !out.width) issues.push({ code: "output_size_missing", message: "frame_fraction needs output {width,height}" });

  let p = st.position ? toPx(pt(st.position), unitIn, out) : null;
  let v = st.velocity ? toPx(pt(st.velocity), unitIn, out) : null;
  let s = fin(st.scale) ? st.scale : null, sr = fin(st.scale_rate) ? st.scale_rate : null;
  let r = fin(st.rotation) ? st.rotation : null, w = fin(st.angular) ? st.angular : null;
  const seen = new Set();
  for (const L of levels.slice(0, MAX_CHAIN)) {
    if (!isObj(L)) continue;
    const id = S(L.id) || `${S(L.kind) || "level"}#${applied.length + skipped.length}`;
    if (L.applied === true) { skipped.push(id); issues.push({ code: "already_applied", level: id, message: `${id} is already inside the state (applied:true): not applied again` }); continue; }
    if (seen.has(id)) { skipped.push(id); issues.push({ code: "duplicate_level", level: id, message: `${id} appears twice in the chain: applied once` }); continue; }
    seen.add(id); applied.push(id);
    const o = pt(L.origin), t = pt(L.translate), tv = pt(L.velocity), S0 = fin(L.scale) && L.scale !== 0 ? L.scale : 1, a = n0(L.rotate), Sr = n0(L.scale_rate), Aw = n0(L.angular);
    if (!L.inverse) {
      if (p) {
        const q = { x: p.x - o.x, y: p.y - o.y };
        if (v) { // d/dt of o + t + sR(p-o), with the level's own motion
          const Rv = rot(a, v), Rq = rot(a, q), Pq = rotPerp(a, q);
          v = { x: S0 * Rv.x + tv.x + Sr * Rq.x + S0 * Aw * DEG * Pq.x, y: S0 * Rv.y + tv.y + Sr * Rq.y + S0 * Aw * DEG * Pq.y };
        }
        const Rq = rot(a, q); p = { x: o.x + t.x + S0 * Rq.x, y: o.y + t.y + S0 * Rq.y };
      }
      if (s !== null) { if (sr !== null) sr = sr * S0 + s * Sr; s *= S0; }
      else if (sr !== null) sr *= S0;
      if (r !== null) r += a; if (w !== null) w += Aw;
    } else {
      // world -> screen through a camera: p' = o + R(-a) (p - o - t) / s
      if (p) {
        const q = { x: p.x - o.x - t.x, y: p.y - o.y - t.y };
        if (v) {
          const qd = { x: v.x - tv.x, y: v.y - tv.y }, Rq = rot(-a, q), Rqd = rot(-a, qd), Pq = rotPerp(-a, q);
          v = { x: Rqd.x / S0 - (Sr / (S0 * S0)) * Rq.x + (-Aw * DEG * Pq.x) / S0, y: Rqd.y / S0 - (Sr / (S0 * S0)) * Rq.y + (-Aw * DEG * Pq.y) / S0 };
        }
        const Rq = rot(-a, q); p = { x: o.x + Rq.x / S0, y: o.y + Rq.y / S0 };
      }
      if (s !== null) { if (sr !== null) sr = sr / S0 - (s * Sr) / (S0 * S0); s /= S0; }
      else if (sr !== null) sr /= S0;
      if (r !== null) r -= a; if (w !== null) w -= Aw;
    }
  }
  return {
    space: FINAL_SPACE, units: { position: unitOut, angle: "deg", scale: "ratio", time: "s" },
    ...(p ? { position: fromPx(p, unitOut, out) } : {}), ...(v ? { velocity: fromPx(v, unitOut, out) } : {}),
    ...(s !== null ? { scale: r6(s) } : {}), ...(sr !== null ? { scale_rate: r6(sr) } : {}),
    ...(r !== null ? { rotation: wrapAngle(r) } : {}), ...(w !== null ? { angular: r6(w) } : {}),
    ...(st.camera_relation !== undefined ? { camera_relation: st.camera_relation } : {}), ...(st.mask_state !== undefined ? { mask_state: st.mask_state } : {}),
    ...(st.settle !== undefined ? { settle: st.settle } : {}),
    ...(S(st.action_id) ? { action_id: S(st.action_id) } : {}), ...(fin(st.progress) ? { progress: st.progress } : {}), ...(fin(st.time_s) ? { time_s: st.time_s } : {}),
    applied, skipped, issues,
  };
}

// ---- seam report ----------------------------------------------------------------------------------------------------------------------
const same = (x, y) => canonicalDigest(x === undefined ? null : x) === canonicalDigest(y === undefined ? null : y);
const mag = (v) => (v ? Math.hypot(v.x, v.y) : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// a and b: states at the boundary, ALREADY in final screen space (the output of toScreenSpace). a = the outgoing side's state AT the boundary
// (its last evaluated moment, taken as the limit at boundary_s), b = the incoming side's state AT the boundary. Both evaluated at the same score time.
export function seamReport(handoff, a, b, { score = null, output = null, tolerances = null, outgoing_last_frame = null, incoming_first_frame = null } = {}) {
  const h = isObj(handoff) && handoff.semantic_digest !== undefined && isObj(handoff.units) ? handoff : normalizeHandoff(handoff, score);
  const A = isObj(a) ? a : {}, B = isObj(b) ? b : {};
  const tol = seamTolerances(output, { ...(tolerances || {}) });
  const errors = [], warnings = [], checks = [];
  const kind = h.handoff_kind, continuous = kind === "continuous";
  const exemptProps = new Set(h.intentional_discontinuity ? h.intentional_discontinuity.properties : []);
  const intentional = !continuous && !!(h.intentional_discontinuity && h.intentional_discontinuity.reason);
  const carry = new Set(h.carry);
  const add = (prop, status, extra = {}) => { checks.push({ prop, status, ...extra }); if (status === "fail") errors.push({ code: `seam_${prop}`, prop, message: `${prop} is not continuous across ${h.id || "the seam"}`, ...extra }); };
  const missing = [];
  if (!h.boundary) errors.push({ code: "boundary_missing", message: "the handoff has no score boundary" });
  if (h.coordinate_space !== FINAL_SPACE) errors.push({ code: "coordinate_space", message: `seams are compared in ${FINAL_SPACE}; convert with toScreenSpace first` });
  for (const side of [A, B]) if (S(side.space) && S(side.space) !== FINAL_SPACE) errors.push({ code: "coordinate_space", message: `a seam state is in "${side.space}", not ${FINAL_SPACE}` });
  if (tol.assumed_output) warnings.push({ code: "output_assumed", message: "no output size given: tolerances assume 1920x1080" });

  const gate = (prop) => {
    if (exemptProps.has(prop) || (intentional && !h.intentional_discontinuity.properties.length)) return "exempt"; // a cut/snap/impact with no property list exempts everything it breaks
    if (!continuous) return "exempt";
    if (!carry.has(prop)) return "not_carried";
    return null;
  };
  const numeric = (prop, va, vb, tolAbs, tolRel, delta, unit) => {
    const g = gate(prop); if (g) { add(prop, g, { unit }); return; }
    if (va === undefined || vb === undefined || va === null || vb === null) { missing.push(prop); add(prop, "not_assessable", { unit, reason: "state missing on one side" }); return; }
    const d = delta(va, vb), allowed = Math.max(tolAbs, tolRel ? tolRel * Math.max(Math.abs(va?.x !== undefined ? mag(va) : va), Math.abs(vb?.x !== undefined ? mag(vb) : vb)) : 0);
    add(prop, d <= allowed ? "pass" : "fail", { delta: r6(d), tolerance: r6(allowed), unit });
  };
  numeric("position", A.position, B.position, tol.position_px, 0, dist, "px");
  numeric("velocity", A.velocity, B.velocity, tol.velocity_px_s, tol.velocity_rel, dist, "px/s");
  numeric("scale", A.scale, B.scale, tol.scale, 0, (x, y) => Math.abs(y / x - 1) * (x !== 0 ? 1 : 0) || Math.abs(y - x), "ratio");
  numeric("scale_rate", A.scale_rate, B.scale_rate, tol.scale_rate, tol.scale_rate_rel, (x, y) => Math.abs(y - x), "ratio/s");
  numeric("rotation", A.rotation, B.rotation, tol.rotation_deg, 0, (x, y) => Math.abs(angleDelta(x, y)), "deg"); // wrapped: 359 and -1 are one angle
  numeric("angular", A.angular, B.angular, tol.angular_deg_s, tol.angular_rel, (x, y) => Math.abs(y - x), "deg/s");
  for (const [prop, key] of [["camera_relation", "camera_relation"], ["mask_state", "mask_state"]]) {
    const g = gate(prop); if (g) { add(prop, g); continue; }
    if (A[key] === undefined || B[key] === undefined) { missing.push(prop); add(prop, "not_assessable", { reason: "state missing on one side" }); continue; }
    add(prop, same(A[key], B[key]) ? "pass" : "fail");
  }
  { // settle: the declared resting target and settling character must be the same movement, not a new one
    const g = gate("settle");
    if (g) add("settle", g);
    else if (A.settle === undefined && B.settle === undefined) { missing.push("settle"); add("settle", "not_assessable", { reason: "no settle declared" }); }
    else add("settle", same(A.settle, B.settle) ? "pass" : "fail");
  }
  // easing reset on a continued action: the same action must carry its own progress across the boundary, not start again at 0
  if (continuous && S(A.action_id) && S(A.action_id) === S(B.action_id) && fin(A.progress) && fin(B.progress) && B.progress + 1e-6 < A.progress)
    add("easing_reset", "fail", { delta: r6(A.progress - B.progress), unit: "progress", reason: "a continued action restarted its ease at the boundary" });
  // stop / acceleration reset when velocity is carried: reported with its own name so reviewers see which kind of break it is
  const vc = checks.find((c) => c.prop === "velocity");
  if (vc && vc.status === "fail" && A.velocity && B.velocity) {
    const va = mag(A.velocity), vb = mag(B.velocity);
    if (va > tol.velocity_px_s && vb <= tol.velocity_px_s) errors.push({ code: "seam_stop", prop: "velocity", message: "motion stops at the seam (outgoing moves, incoming starts at rest)" });
    else if (va <= tol.velocity_px_s && vb > tol.velocity_px_s) errors.push({ code: "seam_start", prop: "velocity", message: "motion starts from rest at the seam" });
  }
  // duplicate or dropped endpoint frames: the outgoing side owns frames < boundary frame, the incoming side owns frames >= it (end exclusive)
  if (h.boundary && (fin(outgoing_last_frame) || fin(incoming_first_frame))) {
    const bf = fin(h.boundary.frame) ? h.boundary.frame : score ? frameOf(h.boundary.time_s, scoreRate(score)) : null;
    if (bf === null) warnings.push({ code: "frame_unknown", message: "no score to resolve the boundary frame: endpoint frames not checked" });
    else {
      if (fin(outgoing_last_frame) && outgoing_last_frame >= bf) add("endpoint_frames", "fail", { reason: `outgoing side renders frame ${outgoing_last_frame}, which belongs to the incoming side (boundary frame ${bf}): a duplicated endpoint frame`, unit: "frame" });
      else if (fin(incoming_first_frame) && incoming_first_frame < bf) add("endpoint_frames", "fail", { reason: `incoming side renders frame ${incoming_first_frame} before the boundary frame ${bf}`, unit: "frame" });
      else if (fin(outgoing_last_frame) && fin(incoming_first_frame) && incoming_first_frame - outgoing_last_frame !== 1) add("endpoint_frames", "fail", { reason: `frames ${outgoing_last_frame} -> ${incoming_first_frame} leave a gap or overlap`, unit: "frame" });
      else add("endpoint_frames", "pass", { unit: "frame" });
    }
  }
  if (A.time_s !== undefined && B.time_s !== undefined && h.boundary && (Math.abs(toTicks(A.time_s) - h.boundary.tick) > 1 || Math.abs(toTicks(B.time_s) - h.boundary.tick) > 1))
    warnings.push({ code: "sampled_off_boundary", message: "a seam state was sampled away from boundary_s: compare limits at the boundary, not neighbouring frames" });
  if (continuous && !carry.size) errors.push({ code: "carry_missing", message: `a continuous handoff names what survives (${CARRY_PROPS.join(", ")})` });
  if (!continuous && !intentional) errors.push({ code: "discontinuity_unreasoned", message: `a ${kind || "non-continuous"} handoff says why continuity is broken` });
  return {
    version: HANDOFF_VERSION, handoff_id: h.id || null, kind, basis: "score", boundary: h.boundary || null, space: FINAL_SPACE,
    units: { position: "px", velocity: "px/s", angle: "deg", angular: "deg/s", scale: "ratio", scale_rate: "ratio/s", time: "s" },
    tolerances: tol, checks, ok: errors.length === 0, errors, warnings, not_assessable: [...new Set(missing)],
    // mathematical agreement is not visual acceptance: only playback of the seam settles that (references/motion-handoffs.md)
    visual_acceptance: "unreviewed", playback_review_required: true,
    status: "implemented_unvalidated",
  };
}

// ---- planning the incoming side -------------------------------------------------------------------------------------------------------
// outgoing: state at the boundary in final screen space (toScreenSpace output) - or {state, chain} to convert here.
// incoming: optional {state, chain}: where the incoming motion wants to rest (targets per property) and its spring character.
// -> {handoff_id, boundary, frame_policy, channels:{position.x:{t0_s, x0, v0, to, z, w, call}, ...}, carry, exempt, cost, issues[]}
// Each channel is a boundary condition {x0, v0} at t0 for RasanMotion.continueFrom: the incoming scene starts from the outgoing state
// instead of from rest, so the ease is NOT reset, and velocity and scale/rotation carry. A pure function of its inputs: arbitrary-order seek safe.
export function planHandoff(handoff, { score = null, output = null, outgoing = null, incoming = null, spring = null } = {}) {
  const h = isObj(handoff) && handoff.semantic_digest !== undefined && isObj(handoff.units) ? handoff : normalizeHandoff(handoff, score);
  const issues = [], channels = {}, exempt = [];
  const conv = (side) => (!side ? null : isObj(side.state) ? toScreenSpace(side.state, side.chain || [], { output }) : isObj(side) && side.space === FINAL_SPACE ? side : toScreenSpace(side, [], { output }));
  const A = conv(outgoing), B = conv(incoming);
  const continuous = h.handoff_kind === "continuous";
  if (!h.boundary) issues.push({ code: "boundary_missing", message: "no score boundary" });
  if (!continuous) issues.push({ code: "not_continuous", message: `${h.handoff_kind || "unclassified"} handoff: no boundary conditions are carried (it breaks continuity on purpose)` });
  const sp = isObj(spring) ? spring : {}, z = fin(sp.z) ? sp.z : 1, w = fin(sp.w) ? sp.w : 18;
  const t0 = h.boundary ? h.boundary.time_s : null;
  const ex = new Set(h.intentional_discontinuity ? h.intentional_discontinuity.properties : []);
  const chan = (name, x0, v0, to) => { channels[name] = { t0_s: t0, x0: r6(x0), v0: r6(v0), to: to === undefined || to === null ? null : r6(to), z, w, call: "RasanMotion.continueFrom({t0, x0, v0, to, z, w})" }; };
  if (continuous && A && t0 !== null) {
    for (const prop of h.carry) {
      if (ex.has(prop)) { exempt.push(prop); continue; }
      if (prop === "position" || prop === "velocity") {
        if (!A.position) { issues.push({ code: "state_missing", prop, message: "outgoing position is unknown: measure it at the boundary before planning" }); continue; }
        if (prop === "velocity" && !A.velocity) { issues.push({ code: "state_missing", prop, message: "outgoing velocity is unknown" }); continue; }
        for (const ax of ["x", "y"]) if (!channels[`position.${ax}`]) chan(`position.${ax}`, A.position[ax], (A.velocity && A.velocity[ax]) || 0, B && B.position ? B.position[ax] : null);
        if (prop === "position" && !h.carry.includes("velocity")) for (const ax of ["x", "y"]) channels[`position.${ax}`].v0 = 0; // position alone survives: the incoming side starts at rest there
      } else if (prop === "scale" || prop === "scale_rate") {
        if (!fin(A.scale)) { issues.push({ code: "state_missing", prop, message: "outgoing scale is unknown" }); continue; }
        if (!channels.scale) chan("scale", A.scale, h.carry.includes("scale_rate") ? n0(A.scale_rate) : 0, B ? B.scale : null);
      } else if (prop === "rotation" || prop === "angular") {
        if (!fin(A.rotation)) { issues.push({ code: "state_missing", prop, message: "outgoing rotation is unknown" }); continue; }
        if (!channels.rotation) { // unwrap: the incoming target is the nearest equivalent angle, so the carry never spins the long way round
          const to = B && fin(B.rotation) ? A.rotation + angleDelta(A.rotation, B.rotation) : null;
          chan("rotation", A.rotation, h.carry.includes("angular") ? n0(A.angular) : 0, to);
        }
      }
    }
  }
  const frame = h.boundary && (fin(h.boundary.frame) ? h.boundary.frame : score ? frameOf(h.boundary.time_s, scoreRate(score)) : null);
  if (continuous && h.carry.includes("settle") && A && A.settle !== undefined) channels.settle = { declared: A.settle, note: "the incoming side settles on the declared target with the declared character; do not start a second ease" };
  if (continuous && h.carry.includes("camera_relation") && A && A.camera_relation !== undefined) channels.camera_relation = { declared: A.camera_relation, note: "keep the same camera relation across the boundary" };
  if (continuous && h.carry.includes("mask_state") && A && A.mask_state !== undefined) channels.mask_state = { declared: A.mask_state, note: "start the incoming layer with the same mask state" };
  return {
    version: HANDOFF_VERSION, handoff_id: h.id || null, kind: h.handoff_kind, basis: "score", boundary: h.boundary || null, space: FINAL_SPACE,
    // the boundary frame belongs to the INCOMING side (end exclusive): the outgoing side stops at frame - 1, so no frame is drawn twice
    frame_policy: frame === null || frame === undefined ? null : { boundary_frame: frame, outgoing_last_frame: frame - 1, incoming_first_frame: frame, convention: "start-inclusive, end-exclusive" },
    channels, carry: [...h.carry], exempt, issues,
    cost: { channels: Object.keys(channels).length, per_frame: "closed form, O(channels), no history, no iteration" },
    digest: canonicalDigest({ id: h.id, carry: h.carry, boundary: h.boundary && h.boundary.tick, channels }).slice(0, 16),
    status: "implemented_unvalidated",
  };
}
export { fromTicks };
