// The scene contract: in-between states, cast canon and continuity, result holds and the hero against platform UI, all read from
// motion/score.json (the one contract; no new file). Every check is a WARNING and uncalibrated (thresholds in SC are first guesses).
// Ideas from agentara video-storyboard, Paldom storytelling-animation and svenkatreddy universal-video-skills (MIT, ideas only); our code.
import fs from "node:fs";
import path from "node:path";
import { destinationOf, zonesFor, boxInZones } from "./safezones.mjs";
import { castCanonWarnings } from "./canon.mjs";

export const SC = { min_states_complex: 3, hold_s: 0.6, hold_picture_s: 1.0, zone_share: 0.2 };

// the same list as the motion gate's result-unheld: a seam that carries the result forward needs no separate hold
export const CARRY_KINDS = new Set(["push-through", "camera-through", "zoom-through", "carried-object", "shared-element", "whip", "match-cut", "signature"]);
const num = (x) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : null);
const r2 = (x) => Math.round(x * 100) / 100;
const castIn = (s, side) => (s && s.cast_state && s.cast_state[side] && typeof s.cast_state[side] === "object" ? s.cast_state[side] : {});
const castKind = (score, id) => ((score.cast || []).find((c) => c && c.id === id) || {}).kind;

// -> a reason string when the scene is a complex action, else ""
export function isComplex(scene, score) {
  const ids = [...Object.keys(castIn(scene, "in")), ...Object.keys(castIn(scene, "out"))];
  const chars = ids.filter((id) => castKind(score, id) === "character" || (score.cast || []).length === 0);
  if ((scene.space === "3d" || scene.space === "hybrid") && chars.length) return `a ${scene.space} scene with a cast character`;
  if ((scene.shots || []).length >= 3) return `${scene.shots.length} shots`;
  const mv = Array.isArray(score.moves) ? score.moves.find((m) => m && m.status === "used" && Number(m.scene) === Number(scene.n)) : null;
  if (mv) return `hero move ${mv.id || ""}`.trim();
  if (chars.length) return "a cast character performs";
  return "";
}

const sceneLast = (s) => {
  const t = (s.states || []).map((x) => num(x && x.t)).filter((x) => x !== null);
  const p = num(s.peak_t);
  const all = [...t, ...(p !== null ? [p] : [])];
  return all.length ? Math.max(...all) : null;
};

function readBrief(run) {
  try { return run ? JSON.parse(fs.readFileSync(path.join(run, "brief.json"), "utf8")) : {}; } catch { return {}; }
}

// the held-result rule, shared with reads.mjs: the last state (or the payoff read) at `last` s of `dur` s leaves less than the hold,
// unless the scene hands its result on through a carrying seam -> { need, left, picture } or null
export function unheldResult(scene, score, { last, dur, picture = false }) {
  if (last === null || last === undefined || dur === null || dur === undefined) return null;
  const so = (Array.isArray(score.seams) ? score.seams : []).find((x) => Number(x.from) === Number(scene.n));
  const skip = so && (CARRY_KINDS.has(so.kind) || so.relation === "so");
  const need = picture ? SC.hold_picture_s : SC.hold_s;
  return !skip && dur - last < need ? { need, left: dur - last, picture } : null;
}

export function sceneContractChecks(score, { intent = null, run = null } = {}) {
  const W = [];
  const S = Array.isArray(score.scenes) ? score.scenes : [];
  const seams = Array.isArray(score.seams) ? score.seams : [];
  const cast = Array.isArray(score.cast) ? score.cast : [];
  const beats = intent && Array.isArray(intent.beats) ? intent.beats : [];
  const castIds = new Set(cast.map((c) => c && c.id));
  const seamOut = (n) => seams.find((x) => Number(x.from) === Number(n));

  S.forEach((s, i) => {
    const dur = num(s.duration) ?? (num(s.end) !== null && num(s.start) !== null ? s.end - s.start : null);
    const st = Array.isArray(s.states) ? s.states : [];
    const why = isComplex(s, score);
    if (why && st.length < SC.min_states_complex) W.push(`states-thin: scene ${s.n} (${s.id}) is a complex action (${why}) with ${st.length} states (${SC.min_states_complex} at least): write states [{t, what, look}] from its start to its settle so the builder and the board show the in-betweens`);
    if (st.length) {
      const ts = st.map((x) => num(x && x.t));
      const bad = ts.some((t, k) => t === null || t < 0 || (dur !== null && t > dur) || (k > 0 && t <= ts[k - 1])) || st.some((x) => !x || !String(x.what || "").trim() || !String(x.look || "").trim());
      if (bad) W.push(`states-order: scene ${s.n}: states must rise in t inside 0..${dur ?? "?"} s and each needs what and look`);
    }
    const imp = num(s.importance) ?? num(beats[i] && beats[i].importance) ?? 0;
    const last = sceneLast(s);
    if (imp >= 2 && last !== null && dur !== null) {
      const picture = beats[i] && beats[i].read && beats[i].read.kind === "picture";
      const need = picture ? SC.hold_picture_s : SC.hold_s;
      if (unheldResult(s, score, { last, dur, picture })) W.push(`result-unheld-plan: scene ${s.n} (${s.id}, importance ${imp}): its last state (or peak_t) is at ${r2(last)} s of ${r2(dur)} s, leaving ${r2(dur - last)} s to see the result (${need} s${picture ? ": 1.0 for a picture read" : ""})`);
    }
    for (const side of ["in", "out"]) for (const id of Object.keys(castIn(s, side))) {
      if (!castIds.has(id)) W.push(`cast-undeclared: scene ${s.n} cast_state names ${id}, which is not in score.cast`);
    }
  });
  for (const c of cast) {
    if (!c || c.kind !== "character") continue;
    const fixed = (Array.isArray(c.fixed) ? c.fixed : []).filter((x) => String(x || "").trim());
    if (!c.canon || fixed.length < 2) W.push(`cast-canon-missing: cast ${c.id} (${c.kind}) has no canon file or fewer than 2 fixed traits: a recurring subject needs a canonical identity`);
    else if (run && !fs.existsSync(path.resolve(run, String(c.canon)))) W.push(`cast-canon-not-found: cast ${c.id} canon ${c.canon} does not exist`);
  }
  // W6: the identity files themselves (painted-2d and 3d-rig) and each scene's cast states against them: same warning family, same severity
  if (run) W.push(...castCanonWarnings(score, run));
  for (const sm of seams) {
    const a = S.find((x) => Number(x.n) === Number(sm.from)), b = S.find((x) => Number(x.n) === Number(sm.to));
    if (!a || !b || String(sm.continuity_change || "").trim().length >= 12) continue;
    const out = castIn(a, "out"), inn = castIn(b, "in");
    for (const id of Object.keys(out)) {
      if (!inn[id]) continue;
      const o = out[id] || {}, n = inn[id] || {};
      const norm = (v) => String(v ?? "").trim().toLowerCase();
      const xy = (w) => { const m = typeof w === "string" ? w.match(/^\s*([\d.]+)\s*,\s*([\d.]+)\s*$/) : null; return m ? [Number(m[1]), Number(m[2])] : null; };
      const pa = xy(o.where), pb = xy(n.where);
      const whereDiff = o.where && n.where && (pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > 0.15 : !pa && !pb && norm(o.where) !== norm(n.where));
      const holdsDiff = o.holds && n.holds && norm(o.holds) !== norm(n.holds);
      const faceDiff = o.facing && n.facing && norm(o.facing) !== norm(n.facing);
      if (holdsDiff || faceDiff || whereDiff) W.push(`continuity-break: seam ${sm.from}>${sm.to}: ${id} leaves holding "${o.holds ?? "?"}" facing ${o.facing ?? "?"} at ${o.where ?? "?"} and enters holding "${n.holds ?? "?"}" facing ${n.facing ?? "?"} at ${n.where ?? "?"}; say why in the seam's continuity_change or keep it`);
    }
  }
  const brief = score.destination ? {} : readBrief(run);
  const destination = score.destination || brief.destination || null;
  const aspect = score.aspect || brief.aspect || null;
  const dest = destinationOf({ destination, aspect });
  const zones = zonesFor(dest, aspect);
  for (const s of S) {
    const h = Array.isArray(s.hero_box) ? s.hero_box.map(Number) : null;
    if (!h || h.length < 4 || h.some((v) => !Number.isFinite(v))) continue;
    const hits = boxInZones({ x: h[0], y: h[1], w: h[2], h: h[3] }, zones, { minShare: SC.zone_share }).filter((z) => z.zone !== "margin");
    for (const z of hits) W.push(`hero-in-ui-zone: scene ${s.n}: hero_box sits ${Math.round(z.share * 100)}% under the ${z.zone} overlay of ${destination || dest} (${zones.id}): move the hero out of the platform's UI`);
  }
  return { W };
}

// -> [{ scene, id, at: [film seconds] }]: the instants of each scene's states, for the strip helper
export function stateTimes(score) {
  return (score.scenes || []).filter((s) => Array.isArray(s.states) && s.states.length).map((s) => {
    const o = num(s.start) ?? 0;
    return { scene: s.n, id: s.id, at: s.states.map((x) => r2(o + Number(x.t))), local: s.states.map((x) => Number(x.t)) };
  });
}
