// Film energy: the render's motion hierarchy, energy arc and result holds, read from lib/fluency.mjs's `_series`
// (per-frame energy, conc = distinct motions, dom = the biggest motion's share of all motion) against the score's plan.
// All findings are WARNINGS and UNCALIBRATED (no real film has set these numbers yet; BACKLOG B15).
// Idea from iart-ai motion-art-direction, LottieFiles motion-design-skill and NewTurn2017/make-awesome-video (all MIT, ideas only); our code.
// Pure functions, no I/O. Findings use motion-gate's shape: { check, severity, at, region, message, fix, basis }.

export const FE = { busy_conc: 3, busy_dom: 0.5, busy_share: 0.35, flat_cv: 0.25, arc_rho: 0.3, strong: 0.6, hold_s: 0.3, min_beats: 4, min_film_s: 12, calm_pct: 75 };

const r2 = (x) => Math.round(x * 100) / 100;
const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function pctile(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * (p / 100), lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const find = (f) => ({ severity: "warning", basis: "measured", ...f });

// series = { t[], energy[], conc[], dom[] }; beats = [{ id, start, end }]
export function beatStats(series, beats) {
  const T = (series && series.t) || [], E = (series && series.energy) || [], C = (series && series.conc) || [], D = (series && series.dom) || [];
  return (beats || []).map((b) => {
    const idx = [];
    for (let i = 0; i < T.length; i++) if (T[i] >= b.start && T[i] < b.end && E[i] != null) idx.push(i);
    const en = idx.map((i) => E[i]);
    const p90 = pctile(en, 90);
    const act = idx.filter((i) => (C[i] || 0) >= 1);
    const busy = act.filter((i) => (C[i] || 0) >= FE.busy_conc && D[i] != null && D[i] < FE.busy_dom);
    let last = null;
    if (p90 > 0) for (const i of idx) if (E[i] >= FE.strong * p90) last = T[i];
    return { id: b.id, start: b.start, end: b.end, mean: avg(en), p90, active: act.length, busy_share: act.length ? busy.length / act.length : 0, last_strong_t: last };
  });
}

function ranks(a) {
  const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
  for (let i = 0; i < o.length;) {
    let j = i;
    while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++;
    for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
export function spearman(a, b) {
  if (!a || !b || a.length !== b.length || a.length < 3) return null;
  const ra = ranks(a), rb = ranks(b), ma = avg(ra), mb = avg(rb);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < ra.length; i++) { sab += (ra[i] - ma) * (rb[i] - mb); saa += (ra[i] - ma) ** 2; sbb += (rb[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}

export function busyChecks(stats, scenes, { stillness = false } = {}) {
  const out = [];
  for (const s of stats || []) {
    if (!(s.busy_share > FE.busy_share)) continue;
    out.push(find({ check: "motion-busy", at: r2(s.start), region: `beat ${s.id}`, message: `beat ${s.id}: ${Math.round(s.busy_share * 100)}% of its moving frames have ${FE.busy_conc}+ things moving at once and none leads (the biggest motion is under half of all motion)`, fix: "pick the one primary the beat's buys needs; hold or slow the rest (secondaries 2-4 frames behind and smaller, ambient barely moving), or move them in sequence" }));
  }
  return out;
}

export function energyArcChecks(stats, scenes, { dur = null, stillness = false } = {}) {
  const out = [], st = stats || [];
  const means = st.map((s) => s.mean);
  const ok = means.length && means.every((m) => m != null);
  const film = dur != null ? dur : st.length ? st[st.length - 1].end : 0;
  if (ok && !stillness && film >= FE.min_film_s && st.length >= FE.min_beats) {
    const m = avg(means), sd = Math.sqrt(avg(means.map((x) => (x - m) ** 2))), cv = m > 0 ? sd / m : 0;
    if (cv < FE.flat_cv) out.push(find({ check: "energy-flat", at: null, region: "whole film", message: `every beat moves at about the same intensity (beat-to-beat variation ${r2(cv)}; ${FE.flat_cv} or more): no build, no rest`, fix: "spend energy where the score puts it: calm the importance-1 beats (one slow mover), save the biggest motion for the peak, and let the beat before the peak breathe" }));
  }
  const sc = scenes || [];
  const pairs = [];
  for (let i = 0; i < st.length && i < sc.length; i++) { const e = num(sc[i] && sc[i].energy); if (e != null && st[i].mean != null) pairs.push([i, e, st[i].mean]); }
  if (pairs.length >= FE.min_beats) {
    const pe = pairs.map((p) => p[1]), me = pairs.map((p) => p[2]), rho = spearman(pe, me);
    if (rho != null && rho < FE.arc_rho) out.push(find({ check: "energy-arc-off", at: null, region: "whole film", message: `the render's energy follows the score's planned 1-5 at ${r2(rho)} (${FE.arc_rho} or more): planned ${pe.join("-")}, measured rank ${ranks(me).join("-")}`, fix: "the beats planned calm move as hard as the ones planned big: re-time or thin the calm beats, push the peak" }));
  }
  const means2 = st.map((s) => s.mean).filter((v) => v != null), cut = pctile(means2, FE.calm_pct);
  if (cut != null && means2.length >= FE.min_beats) {
    for (let i = 0; i < st.length && i < sc.length; i++) {
      const e = num(sc[i] && sc[i].energy);
      if (e != null && e <= 2 && st[i].mean != null && st[i].mean > cut) out.push(find({ check: "calm-beat-busy", at: r2(st[i].start), region: `beat ${st[i].id}`, message: `beat ${st[i].id} is planned calm (energy ${e}) but moves harder than three quarters of the film`, fix: "lock the camera, keep one slow mover, let the read land" }));
    }
  }
  return out;
}

const THROUGH = new Set(["push-through", "camera-through", "zoom-through", "carried-object", "shared-element", "whip", "match-cut", "signature"]);
export function resultHoldChecks(stats, scenes, seams, intent) {
  const out = [], st = stats || [], sc = scenes || [], sm = seams || [];
  const ib = intent && Array.isArray(intent.beats) ? intent.beats : [];
  for (let i = 0; i < st.length && i < sc.length; i++) {
    const s = st[i], c = sc[i] || {};
    const ids = [c.beat, c.n, c.id, i + 1].filter((v) => v != null).map(String);
    const intentBeat = ib.find((b) => b && [b.id, b.beat, b.n, b.name].filter((v) => v != null).map(String).some((v) => ids.includes(v))) || (ib.length === sc.length ? ib[i] : null);
    const picture = !!(intentBeat && intentBeat.read && intentBeat.read.kind === "picture");
    if (!(c.peak === true || Number(c.importance) === 3 || picture)) continue;
    if (s.last_strong_t == null) continue;
    const seam = sm.find((x) => x && [String(x.from)].some((v) => ids.includes(v) && (v === String(c.n ?? i + 1) || v === String(i + 1))));
    if (seam && (THROUGH.has(seam.kind) || seam.relation === "so")) continue;
    const x = s.end - s.last_strong_t;
    if (x < FE.hold_s) out.push(find({ check: "result-unheld", at: r2(s.last_strong_t), region: `beat ${s.id}`, message: `beat ${s.id}: its main action is still going ${r2(Math.max(0, x))} s before the cut (at ${r2(s.last_strong_t)} s): the viewer has no time to see the result`, fix: `land the change by ${r2(s.end - 0.5)} s and hold the result 0.5 s or more (a living layer may keep moving), or carry the motion through the seam on purpose` }));
  }
  return out;
}
