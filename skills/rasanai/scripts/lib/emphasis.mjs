// Emphasis: where the film puts its weight, measured against where the intent says it should go (REBUILD section 5).
// The film's argument is story/intent.json (references/intent.md): beats[] with `importance` 1-3, one `peak: true`, `buys`.
// Emphasis is the viewer's sense of "this is the big one": a proxy per 0.5 s on the render, three normalised parts
//   bold   share of the frames in the bin that are big moments (frame-gate boldnessOf: giant glyph, frame-filling object,
//          colour field, DOM line)               weight 0.5
//   motion mean frame-to-frame change in the bin (4 fps, 0..1 by the film's p95)                            weight 0.25
//   loud   momentary level (audio.mjs momentaryDb, 0..1 between the film's p10 and p95); silent films drop it  weight 0.25
// A part that is not available drops out and the weights renormalise.
// Checks (all WARNINGS: uncalibrated, thresholds from REBUILD; calibrate on the references and FILM-D before an error):
//   emphasis-off-peak     the curve's maximum is outside the `peak: true` beat (+-0.5 s)
//   emphasis-on-minor     the film's biggest moment falls on an importance-1 beat (named, with what it buys)
//   budget-minor-beat     a planned big moment (score.big_moments) sits on an importance-1 beat
//   budget-over           more than ~4 big moments per 30 s
//   budget-none           no big moment planned
//   (the second-highest bin is reported with its beat; it is not a finding.)
// Pure functions take data; `measureCurve` decodes a render (ffmpeg, no window). Used by motion-gate.mjs.
import fs from "node:fs";
import path from "node:path";
import { decodeVideo, boldFrame, ffmpegOk } from "./pixels.mjs";
import { decode, hasAudioStream, momentaryDb, SR } from "./audio.mjs";

export const EMPH = {
  step_s: 0.5, // curve resolution
  peak_tol_s: 0.5, // the measured peak may sit this far outside the peak beat
  w: { bold: 0.5, motion: 0.25, loud: 0.25 },
  budget_per_30s: 4, // big moments (scale, colour field, camera move, spectacle) per 30 s
  second_gap_s: 1.0, // the second-highest bin must be this far from the highest
};

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const pctile = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------- the intent
// story/intent.json for a score.json path / run dir / project: <run>/story/intent.json (the run is the plan's grandparent).
// Uses lib/intent.mjs's loader when it exists (S2), else reads the JSON. -> intent | null
export async function loadIntent({ intent = null, plan = null, run = null, project = null } = {}) {
  const cands = [];
  if (intent) cands.push(path.resolve(intent));
  if (run) cands.push(path.join(path.resolve(run), "story", "intent.json"));
  if (plan) cands.push(path.join(path.dirname(path.dirname(path.resolve(plan))), "story", "intent.json"), path.join(path.dirname(path.resolve(plan)), "story", "intent.json"));
  if (project) cands.push(path.join(path.resolve(project), "story", "intent.json"), path.join(path.dirname(path.resolve(project)), "story", "intent.json"));
  const file = cands.find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
  if (!file) return null;
  try {
    const m = await import("./intent.mjs").catch(() => null);
    const fn = m && (m.loadIntent || m.readIntent);
    if (fn) { const v = await fn(file); const it = v && v.intent ? v.intent : v; if (it && Array.isArray(it.beats)) return { ...it, _file: file }; }
  } catch { /* fall through to the plain read */ }
  try { const it = JSON.parse(fs.readFileSync(file, "utf8")); return it && Array.isArray(it.beats) ? { ...it, _file: file } : null; } catch { return null; }
}

// Intent beats with times: the beat's own start/end (or t0/t1), else the plan beat with the same id / n / position.
// planBeats: motion-gate readPlan().beats [{ i, n, id, start, end }]. -> [{ key, id, i, start, end, importance, peak, buys }]
export function intentBeats(intent, planBeats = []) {
  if (!intent || !Array.isArray(intent.beats)) return [];
  return intent.beats.map((b, i) => {
    const ids = [b.id, b.beat, b.n, b.name, i + 1].filter((v) => v != null).map(String); // intent beats carry a name; scenes name theirs by 1-based position (scene.beat)
    const pb = planBeats.find((p) => ids.includes(String(p.id)) || ids.includes(String(p.n)) || (p.beat != null && Number(p.beat) === i + 1)) || (planBeats.length === intent.beats.length ? planBeats[i] : null);
    const num = (...v) => { for (const x of v) if (x != null && x !== "" && Number.isFinite(Number(x))) return Number(x); return null; };
    const start = num(b.start, b.t0, pb && pb.start), end = num(b.end, b.t1, pb && pb.end);
    return { i, id: String(b.id ?? b.beat ?? b.n ?? i + 1), ids: [...ids, ...(pb ? [String(pb.id), String(pb.n)] : [])], start, end, importance: Number(b.importance) || null, peak: b.peak === true, buys: b.buys || null };
  });
}
const beatAt = (beats, t) => beats.find((b) => b.start != null && b.end != null && t >= b.start - 1e-6 && t < b.end + 1e-6) || null;

// ---------------------------------------------------------------- the curve
// bold: [{ t, big }] (frame flags), motion: [{ t, v }] (frame change), loud: dB per 0.1 s window | null. -> { step, t[], curve[], parts{} }
export function emphasisCurve({ bold = null, motion = null, loud = null, dur }, step = EMPH.step_s) {
  const n = Math.max(1, Math.ceil(dur / step)), bin = (t) => Math.min(n - 1, Math.max(0, Math.floor(t / step)));
  const avg = (rows, f) => { const s = new Float64Array(n), c = new Float64Array(n); for (const r of rows) { const k = bin(r.t); s[k] += f(r); c[k]++; } return Array.from(s, (v, k) => (c[k] ? v / c[k] : 0)); };
  const parts = {};
  if (bold && bold.length) parts.bold = avg(bold, (r) => (r.big ? 1 : 0));
  if (motion && motion.length) { const raw = avg(motion, (r) => r.v), hi = pctile(raw, 95) || 1; parts.motion = raw.map((v) => clamp01(v / hi)); }
  if (loud && loud.length) {
    const lo = pctile(loud, 10), hi = pctile(loud, 95);
    if (hi - lo > 1) { const norm = loud.map((d) => clamp01((d - lo) / (hi - lo))); parts.loud = avg(norm.map((v, k) => ({ t: k * 0.1, v })), (r) => r.v); }
  }
  const keys = Object.keys(parts);
  if (!keys.length) return { step, t: [], curve: [], parts: {} };
  const wsum = keys.reduce((s, k) => s + EMPH.w[k], 0);
  const curve = Array.from({ length: n }, (_, k) => keys.reduce((s, key) => s + EMPH.w[key] * parts[key][k], 0) / wsum);
  return { step, t: curve.map((_, k) => r2(k * step)), curve: curve.map((v) => Math.round(v * 1000) / 1000), parts: Object.fromEntries(keys.map((k) => [k, parts[k].map((v) => Math.round(v * 1000) / 1000)])) };
}

// highest bin (a plateau -> its middle) and the highest bin at least second_gap_s away. -> { t, value, second: { t, value } | null }
export function peaksOf(c) {
  if (!c.curve.length) return null;
  const mx = Math.max(...c.curve), at = c.curve.map((v, k) => (v >= mx - 1e-9 ? k : -1)).filter((k) => k >= 0);
  const k0 = at[Math.floor(at.length / 2)], t0 = (k0 + 0.5) * c.step;
  let k1 = -1;
  c.curve.forEach((v, k) => { if (Math.abs((k + 0.5) * c.step - t0) >= EMPH.second_gap_s && (k1 < 0 || v > c.curve[k1])) k1 = k; });
  return { t: r2(t0), value: c.curve[k0], second: k1 >= 0 ? { t: r2((k1 + 0.5) * c.step), value: c.curve[k1] } : null };
}

// ---------------------------------------------------------------- the checks
// curve: emphasisCurve(); beats: intentBeats(). -> { planned, measured, second, findings[] }   (findings: motion-gate shape)
export function emphasisChecks(curve, beats) {
  const out = { planned: null, measured: null, second: null, findings: [] };
  const pk = peaksOf(curve);
  if (!pk) return out;
  out.measured = { t: pk.t, value: pk.value };
  const peakBeat = beats.find((b) => b.peak), timed = beats.filter((b) => b.start != null && b.end != null);
  if (peakBeat && peakBeat.start != null) out.planned = { beat: peakBeat.id, t0: r2(peakBeat.start), t1: r2(peakBeat.end) };
  const on = beatAt(timed, pk.t);
  if (pk.second) { const sb = beatAt(timed, pk.second.t); out.second = { ...pk.second, beat: sb ? sb.id : null, importance: sb ? sb.importance : null }; }
  const curveNote = `emphasis curve peaks at ${pk.t} s (${pk.value}); planned peak ${out.planned ? `beat ${out.planned.beat}, ${out.planned.t0}-${out.planned.t1} s` : "not timed"}`;
  if (out.planned && (pk.t < out.planned.t0 - EMPH.peak_tol_s || pk.t > out.planned.t1 + EMPH.peak_tol_s)) {
    findings_push(out, { check: "emphasis-off-peak", at: pk.t, region: on ? `beat ${on.id}` : null, message: `${curveNote}: the film's weight lands ${on ? `on beat ${on.id}${on.importance ? ` (importance ${on.importance})` : ""}` : "off every beat"}, not on the peak beat`, fix: `spend the scale, colour field, camera move and sound hit on beat ${out.planned.beat}; calm the loudest/biggest moment at ${pk.t} s, or move \`peak: true\` in story/intent.json if that beat is the real payoff` });
  }
  if (on && on.importance === 1) {
    findings_push(out, { check: "emphasis-on-minor", at: pk.t, region: `beat ${on.id}`, message: `the film's biggest moment (${pk.t} s) falls on beat ${on.id}, importance 1; that beat only buys: "${on.buys || "(no buys written)"}"`, fix: `shrink beat ${on.id} (smaller type, no colour field, no hit) and give its weight to the peak beat${out.planned ? ` ${out.planned.beat}` : ""}` });
  }
  return out;
}
function findings_push(out, f) { out.findings.push({ severity: "warning", ...f }); }

// score.big_moments [{ beat, t0, t1 }] against the intent's importance. -> { count, perBeat[], findings[] }
export function budgetChecks(score, beats, dur) {
  const out = { count: 0, limit: null, moments: [], findings: [] };
  const bm = score && Array.isArray(score.big_moments) ? score.big_moments : null;
  if (!bm) return out; // no score: nothing to measure (the caller says so)
  out.count = bm.length;
  out.limit = Math.max(2, Math.ceil(EMPH.budget_per_30s * Math.max(dur || 0, 1) / 30));
  const timed = beats.filter((b) => b.start != null && b.end != null);
  out.moments = bm.map((m) => {
    const key = m.beat != null ? String(m.beat) : null, mid = Number.isFinite(Number(m.t0)) && Number.isFinite(Number(m.t1)) ? (Number(m.t0) + Number(m.t1)) / 2 : null;
    const b = (key != null && beats.find((x) => x.ids.includes(key))) || (mid != null ? beatAt(timed, mid) : null);
    return { beat: key ?? (b ? b.id : null), t0: m.t0 ?? null, t1: m.t1 ?? null, importance: b ? b.importance : null, buys: b ? b.buys : null };
  });
  const add = (f) => out.findings.push({ severity: "warning", ...f });
  if (!bm.length) add({ check: "budget-none", at: null, message: "the plan has no big moments (score.big_moments is empty): the film stays at one scale", fix: `spend ${out.limit > 2 ? "2 to " + out.limit : "2"} big moments on the importance-3 beats and the peak (scale, colour field, camera move, spectacle)` });
  if (bm.length > out.limit) add({ check: "budget-over", at: null, message: `${bm.length} big moments planned in ${Math.round(dur || 0)} s (about ${EMPH.budget_per_30s} per 30 s is the budget, ${out.limit} here): emphasis spread over that many beats is no emphasis`, fix: "keep the peak and the importance-3 beats, calm the rest" });
  for (const m of out.moments) if (m.importance === 1) add({ check: "budget-minor-beat", at: m.t0 != null ? Number(m.t0) : null, region: `beat ${m.beat}`, message: `a big moment is planned on beat ${m.beat}, importance 1 (it only buys: "${m.buys || "no buys written"}")`, fix: "move the big moment to an importance-3 beat or the peak, or raise the beat's importance in story/intent.json with a reason" });
  return out;
}

// ---------------------------------------------------------------- measurement
// Decode a render: bold flags (frame-gate boldnessOf, imported on demand), frame change, loudness. -> { dur, bold, motion, loud }
export async function measureCurve(video, { fps = 4 } = {}) {
  if (!ffmpegOk()) throw new Error("ffmpeg is not installed (brew install ffmpeg)");
  const rows = [], motion = []; let prev = null;
  const d = await decodeVideo(path.resolve(video), { fps, onFrame: (im) => {
    rows.push({ t: im.t, ...boldFrame(im) });
    const g = im.rgb; if (prev) { let s = 0, c = 0; for (let i = 0; i < g.length; i += 21) { s += Math.abs(g[i] - prev[i]); c++; } motion.push({ t: im.t, v: s / Math.max(c, 1) / 255 }); }
    prev = g;
  } });
  const dur = (d.src && d.src.duration) || rows.length / fps;
  const { boldnessOf } = await import("../frame-gate.mjs");
  const flags = boldnessOf(rows, dur).flags.map((f) => ({ t: f.t, big: f.big }));
  let loud = null;
  try { if (hasAudioStream(video)) loud = momentaryDb(decode(path.resolve(video), { sr: SR }), 0.1, SR); } catch { loud = null; }
  return { dur, bold: flags, motion, loud };
}

// The whole check for motion-gate: measure (or take `inputs`), build the curve, run the emphasis and budget checks.
// -> { curve, planned, measured, second, budget, intent: bool, findings[], skipped[] }
export async function emphasisReport({ video = null, inputs = null, intent = null, planBeats = [], score = null, dur = null } = {}) {
  const res = { curve: null, planned: null, measured: null, second: null, budget: null, intent: !!intent, findings: [], skipped: [] };
  const beats = intentBeats(intent, planBeats);
  if (score) { res.budget = budgetChecks(score, beats, dur || (inputs && inputs.dur) || 0); res.findings.push(...res.budget.findings); if (!intent) res.skipped.push("budget: no story/intent.json, so big moments are counted but not weighed against importance"); }
  else res.skipped.push("budget: no --plan (score.big_moments)");
  if (!intent) { res.skipped.push("emphasis-off-peak: no story/intent.json to say where the peak is (the curve is reported)"); }
  else if (!beats.some((b) => b.peak)) res.skipped.push("emphasis-off-peak: the intent marks no `peak: true` beat");
  else if (!beats.filter((b) => b.peak).every((b) => b.start != null)) res.skipped.push("emphasis-off-peak: the peak beat has no time (the plan's beat ids do not match the intent's)");
  let m = inputs;
  if (!m && video) { try { m = await measureCurve(video); } catch (e) { res.skipped.push(`emphasis: ${e.message} (not measured, never passed)`); return res; } }
  if (!m) { res.skipped.push("emphasis: no render (--video)"); return res; }
  res.curve = emphasisCurve(m, EMPH.step_s);
  const c = emphasisChecks(res.curve, beats);
  res.planned = c.planned; res.measured = c.measured; res.second = c.second; res.findings.push(...c.findings);
  return res;
}
