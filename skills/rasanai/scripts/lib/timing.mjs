// Timing authority for the Storyboard (Plan 05 E3, E5, E7): ONE canonical schedule, motion/score.json; everything else is a projection.
//
//   Boards give PROVISIONAL timing. Once narration/music and durations are reconciled, the approved result is committed through the score
//   (commitTiming), and the board's playback timings are DERIVED from the score's revision (projectBoardTiming), never edited separately.
//   motion/events.json is regenerated from the score (eventsFromScore / writeEvents), never hand-edited.
//
// Conventions (written into every record so no consumer guesses):
//   * seconds are authored; the film's frame rate is rational ({num, den}: 30000/1001 is not 29.97) and frames are DERIVED from seconds
//   * a duration is rounded ONCE to integer microsecond ticks; starts are exact prefix sums of those ticks, so no accumulated rounding
//   * intervals are start-inclusive, end-exclusive: [start, end). Adjacent intervals tile frames with no gap and no overlap
//   * three time spaces are never mixed: "source" (inside an asset), "shot" (from the shot's own start), "film" (the whole timeline)
//   * a retime is a recorded mapping (linear | reverse | freeze) that notes, captions, tracks and export all read
//
//   rate(x), toTicks(s), frameOf(t, r), ceilFrame(t, r), timeOfFrame(f, r)
//   interval(a, b), intervalContains(i, t), intervalsOverlap(i, j), frameRange(i, r), layout(durations_s, r)
//   retimeMapping(o), sourceAt(m, tFilm), filmAt(m, tSource), validateRetime(m), mapOldToNew(entries, tOld)
//   scoreTiming(score), scoreRevision(score), eventsFromScore(score, o), writeEvents(run), eventsFresh(run)
//   projectBoardTiming(doc, score, beatIds), timingDrift(doc, score, beatIds), reconcile(o), applyTimingDeltas(score, deltas), commitTiming(run, deltas, o)
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";
import { readingTime, checkReading } from "./editorial.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
export const TICKS_PER_S = 1_000_000;
export const toTicks = (s) => Math.round(Number(s) * TICKS_PER_S);
export const fromTicks = (t) => t / TICKS_PER_S;
const round6 = (s) => Math.round(s * TICKS_PER_S) / TICKS_PER_S;

// ---- frame rate: rational ----------------------------------------------------------------------------------------------------------------
const NTSC = { "23.976": [24000, 1001], "23.98": [24000, 1001], "29.97": [30000, 1001], "59.94": [60000, 1001] };
export function rate(x = 30) {
  if (isObj(x) && num(x.num) > 0 && num(x.den) > 0) return { num: Number(x.num), den: Number(x.den), fps: Number(x.num) / Number(x.den) };
  if (typeof x === "string" && /^\d+\s*\/\s*\d+$/.test(x.trim())) { const [n, d] = x.split("/").map(Number); return { num: n, den: d, fps: n / d }; }
  const k = typeof x === "number" ? String(Math.round(x * 1000) / 1000) : T(x);
  if (NTSC[k]) return { num: NTSC[k][0], den: NTSC[k][1], fps: NTSC[k][0] / NTSC[k][1] };
  const n = num(x, 30);
  if (n > 0 && Number.isInteger(n)) return { num: n, den: 1, fps: n };
  return { num: Math.round(n * 1000), den: 1000, fps: n }; // an odd decimal rate: exact as thousandths, flagged by the caller if it matters
}
// frame index whose start is <= t (integer arithmetic on ticks: no float error at an exact boundary)
export function frameOf(t, r = rate()) {
  const ticks = toTicks(t), D = r.den * TICKS_PER_S;
  let f = Math.floor((ticks * r.num) / D);
  while ((f + 1) * D <= ticks * r.num) f++;
  while (f * D > ticks * r.num) f--;
  return f;
}
// first frame whose start is >= t: the first frame INSIDE an interval that starts at t
export function ceilFrame(t, r = rate()) {
  const f = frameOf(t, r);
  return f * r.den * TICKS_PER_S === toTicks(t) * r.num ? f : f + 1;
}
export const timeOfFrame = (f, r = rate()) => round6((f * r.den) / r.num);

// ---- intervals: [start, end) -------------------------------------------------------------------------------------------------------------
export function interval(start_s, end_s) {
  const a = toTicks(start_s), b = toTicks(end_s);
  if (!(b >= a)) throw new RangeError(`interval end ${end_s} is before start ${start_s}`);
  return { start_s: fromTicks(a), end_s: fromTicks(b), start_tick: a, end_tick: b, convention: "start-inclusive, end-exclusive" };
}
export const intervalContains = (i, t) => { const k = toTicks(t); return k >= i.start_tick && k < i.end_tick; };
export const intervalsOverlap = (i, j) => i.start_tick < j.end_tick && j.start_tick < i.end_tick;
export const frameRange = (i, r = rate()) => ({ first: ceilFrame(i.start_s, r), end: ceilFrame(i.end_s, r) }); // end exclusive

// durations -> intervals on the film timeline. Each duration is rounded once; starts are prefix sums of those ticks.
export function layout(durations_s, r = rate()) {
  let at = 0;
  return arr(durations_s).map((d, index) => {
    const len = Math.max(0, toTicks(d));
    const i = interval(fromTicks(at), fromTicks(at + len));
    at += len;
    return { index, ...i, frames: frameRange(i, r) };
  });
}

// ---- retime mapping ----------------------------------------------------------------------------------------------------------------------
// { shot_id, asset?, film: [in, out), source: [in, out), mode: "linear" | "reverse" | "freeze", freeze_at? }
// Speed is DERIVED from the two ranges (never stored twice). Freeze holds one source instant for the whole film range.
export function retimeMapping({ shot_id = null, asset = null, film, source, mode = "linear", freeze_at = null } = {}) {
  const m = { schema_version: SCHEMA_VERSION, shot_id, asset, mode, film: { space: "film", ...interval(film[0], film[1]) }, source: { space: "source", ...interval(source[0], source[1]) } };
  if (mode === "freeze") m.freeze_at = freeze_at == null ? source[0] : freeze_at;
  const fl = m.film.end_tick - m.film.start_tick, sl = m.source.end_tick - m.source.start_tick;
  m.speed = mode === "freeze" ? 0 : fl > 0 ? sl / fl : null;
  return m;
}
export function validateRetime(m) {
  const p = [];
  if (!isObj(m)) return { ok: false, problems: ["not an object"] };
  if (!["linear", "reverse", "freeze"].includes(m.mode)) p.push("mode must be linear, reverse or freeze");
  if (!isObj(m.film) || !isObj(m.source)) p.push("film and source intervals are required");
  else if (m.film.end_tick <= m.film.start_tick) p.push("film interval is empty");
  return { ok: !p.length, problems: p };
}
// film time -> source time (null outside the film interval: end-exclusive)
export function sourceAt(m, tFilm) {
  const k = toTicks(tFilm);
  if (k < m.film.start_tick || k >= m.film.end_tick) return null;
  if (m.mode === "freeze") return fromTicks(toTicks(m.freeze_at));
  const x = (k - m.film.start_tick) / (m.film.end_tick - m.film.start_tick);
  const s = m.mode === "reverse" ? m.source.end_tick - x * (m.source.end_tick - m.source.start_tick) : m.source.start_tick + x * (m.source.end_tick - m.source.start_tick);
  return round6(fromTicks(s));
}
// source time -> film time (null for freeze: many film instants map to one source instant)
export function filmAt(m, tSource) {
  if (m.mode === "freeze") return null;
  const k = toTicks(tSource);
  const a = Math.min(m.source.start_tick, m.source.end_tick), b = Math.max(m.source.start_tick, m.source.end_tick);
  if (k < a || k >= b) return null;
  const x = m.mode === "reverse" ? (m.source.end_tick - k) / (m.source.end_tick - m.source.start_tick) : (k - m.source.start_tick) / (m.source.end_tick - m.source.start_tick);
  return round6(fromTicks(m.film.start_tick + x * (m.film.end_tick - m.film.start_tick)));
}
// entries: [{old:[s,e), new:[s,e)}] sorted, from commitTiming. Old film time -> new film time (notes, captions, tracks and export all use this)
export function mapOldToNew(entries, tOld) {
  const E = arr(entries);
  let shift = 0;
  for (const e of E) {
    const [os, oe] = e.old, [ns, ne] = e.new;
    if (tOld < os) break;
    if (tOld < oe) return round6(ns + ((tOld - os) / (oe - os)) * (ne - ns));
    shift = ne - oe;
  }
  return round6(tOld + shift);
}

// ---- the score is the canonical schedule ---------------------------------------------------------------------------------------------------
export function scoreRate(score) { return rate(score && (score.frame_rate || score.fps) || 30); }
export function scoreTiming(score) {
  const S = arr(score && score.scenes);
  const r = scoreRate(score);
  const L = layout(S.map((s) => num(s.duration, 0)), r);
  const scenes = S.map((s, i) => ({ n: num(s.n, i + 1), id: s.id ?? null, beat: s.beat ?? null, ...L[i] }));
  return { schema_version: SCHEMA_VERSION, frame_rate: { num: r.num, den: r.den }, convention: "start-inclusive, end-exclusive; film time", total_s: scenes.length ? scenes[scenes.length - 1].end_s : 0, scenes };
}
// the revision: changes only when what a schedule means changes (durations, seam kinds, rate), never on a note or a reorder of keys
export function scoreRevision(score) {
  const S = arr(score && score.scenes);
  const r = scoreRate(score);
  return canonicalDigest({ rate: [r.num, r.den], durations: S.map((s) => toTicks(num(s.duration, 0))), seams: arr(score && score.seams).map((x) => [x.from, x.to, x.kind]) }).slice(0, 16);
}

export function eventsFromScore(score, { source = "motion/score.json" } = {}) {
  const st = scoreTiming(score);
  const S = arr(score && score.scenes);
  const events = [];
  S.forEach((sc, i) => {
    const iv = st.scenes[i];
    arr(sc.events).forEach((ev, j) => {
      const local = num(ev.t);
      if (local == null || local < 0) return;
      const tk = iv.start_tick + toTicks(local);
      const clamped = tk >= iv.end_tick; // an event at/after the end belongs to the next interval: flag it, never move it silently
      const e = { id: T(ev.id) || `s${iv.index + 1}-e${j + 1}`, t: fromTicks(tk), scene: iv.n, scene_t: local, kind: T(ev.sound || ev.sfx || ev.kind) || "event", what: T(ev.what) || undefined };
      for (const k of ["word", "name", "on_word", "x", "treatment", "group"]) if (ev[k] !== undefined) e[k] = ev[k];
      if (clamped) e.outside_scene = true;
      events.push(e);
    });
  });
  arr(score && score.seams).forEach((sm) => {
    const to = st.scenes[Number(sm.to) - 1];
    if (!to) return;
    const snd = T(sm.sound || sm.sfx);
    events.push({ id: `seam-${sm.from}-${sm.to}`, t: to.start_s, scene: to.n, scene_t: 0, kind: snd || "seam", seam_kind: sm.kind, ...(snd ? {} : { silent: true }) });
  });
  events.sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id)));
  return { schema_version: SCHEMA_VERSION, derived: true, note: "regenerated from motion/score.json; edit the score, not this file", source, score_revision: scoreRevision(score), frame_rate: st.frame_rate, convention: st.convention, events };
}

const rjson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
function writeJson(p, o) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(o, null, 2) + "\n");
  fs.renameSync(tmp, p);
}
export function writeEvents(run) {
  const f = path.join(run, "motion", "score.json");
  const score = rjson(f);
  if (!score) return { ok: false, error: "motion/score.json is missing or invalid" };
  const doc = eventsFromScore(score);
  writeJson(path.join(run, "motion", "events.json"), doc);
  return { ok: true, events: doc.events.length, score_revision: doc.score_revision, file: "motion/events.json" };
}
export function eventsFresh(run) {
  const score = rjson(path.join(run, "motion", "score.json")), ev = rjson(path.join(run, "motion", "events.json"));
  if (!score) return { fresh: false, reason: "no score" };
  if (!ev) return { fresh: false, reason: "no events.json yet" };
  return ev.score_revision === scoreRevision(score) ? { fresh: true } : { fresh: false, reason: "events.json was made from an older score revision (writeEvents regenerates it)" };
}

// ---- board timing is derived from the score -----------------------------------------------------------------------------------------------
// shot -> scene: shot.scene_n, else the scene whose `beat` is the 1-based position of the shot's beat_id in beatIds, else the shot's index.
function sceneIndexFor(shot, i, beatIds, scenes) {
  if (num(shot.scene_n) >= 1) return num(shot.scene_n) - 1;
  const pos = arr(beatIds).indexOf(shot.beat_id);
  if (pos >= 0) { const hit = scenes.findIndex((s) => num(s.beat) === pos + 1); return hit >= 0 ? hit : pos; }
  return i;
}
// -> a COPY of the storyboard doc whose shots carry timing {status:"approved", duration_s, start_s, end_s, score_revision}. The score wins; the doc is never the source.
export function projectBoardTiming(doc, score, beatIds = []) {
  const st = scoreTiming(score), rev = scoreRevision(score);
  const shots = arr(doc && doc.shots).map((s) => ({ ...s }));
  const groups = new Map();
  shots.forEach((s, i) => { const k = sceneIndexFor(s, i, beatIds, st.scenes); (groups.get(k) || groups.set(k, []).get(k)).push(s); });
  for (const [k, g] of groups) {
    const sc = st.scenes[k];
    if (!sc) { g.forEach((s) => { s.timing = { ...(s.timing || {}), status: "provisional", note: "no score scene for this shot" }; }); continue; }
    // several shots in one scene share its interval in proportion to their board durations; boundaries are rounded once each (no drift)
    const w = g.map((s) => Math.max(1e-6, num(s.timing && s.timing.duration_s, 1)));
    const total = w.reduce((a, b) => a + b, 0);
    let cum = 0, prev = sc.start_tick;
    g.forEach((s, j) => {
      cum += w[j];
      const end = j === g.length - 1 ? sc.end_tick : sc.start_tick + Math.round((cum / total) * (sc.end_tick - sc.start_tick));
      s.timing = { ...(s.timing || {}), status: "approved", duration_s: fromTicks(end - prev), start_s: fromTicks(prev), end_s: fromTicks(end), score_revision: rev, scene_n: sc.n };
      prev = end;
    });
  }
  return { ...doc, shots, timing_revision: rev, frame_rate: st.frame_rate, timing_authority: "motion/score.json" };
}
// where the board and the score disagree by more than one frame (a drift is reported, never "fixed" by editing both)
export function timingDrift(doc, score, beatIds = []) {
  const proj = projectBoardTiming(doc, score, beatIds), r = scoreRate(score), one = r.den / r.num;
  const out = [];
  arr(doc && doc.shots).forEach((s, i) => {
    const b = num(s.timing && s.timing.duration_s), p = num(proj.shots[i].timing.duration_s);
    if (b != null && p != null && Math.abs(b - p) > one + 1e-9) out.push({ shot_id: s.shot_id, board_s: b, score_s: p, delta_s: round6(p - b) });
  });
  return { drift: out, board_revision: doc && doc.timing_revision || null, score_revision: scoreRevision(score), stale: !!(doc && doc.timing_revision && doc.timing_revision !== scoreRevision(score)) };
}

// ---- E5: reconcile voice, music and boards ------------------------------------------------------------------------------------------------
// o = { shots, audio: { kind: "selected"|"scratch"|"none", music_led, track_duration_s, sections: [{shot_id,start_s,end_s}], vo: [{shot_id, start_s, end_s}] },
//       pad_s: {lead, tail}, copy, locale, display, rate }
// -> a reconciliation record: deltas PROPOSED (committed later through commitTiming); the music-led track is authoritative; proof/readability is protected.
export function reconcile({ shots = [], audio = {}, pad_s = { lead: 0.3, tail: 0.4 }, copy = [], locale = "en", display = "desktop" } = {}) {
  const a = isObj(audio) ? audio : {};
  const kind = ["selected", "scratch", "none"].includes(a.kind) ? a.kind : "none";
  const deltas = [], protectedShots = [], notes = [];
  const byShot = (list) => new Map(arr(list).map((x) => [x.shot_id, x]));
  const sections = byShot(a.sections), vo = byShot(a.vo);
  for (const s of arr(shots)) {
    const board = num(s.timing && s.timing.duration_s);
    let want = null, why = "";
    if (a.music_led && sections.has(s.shot_id)) { const x = sections.get(s.shot_id); want = fromTicks(toTicks(x.end_s) - toTicks(x.start_s)); why = "the music track is authoritative for a music-led film (changing the track needs the user's authorization)"; }
    else if (vo.has(s.shot_id)) { const x = vo.get(s.shot_id); want = fromTicks(toTicks(x.end_s) - toTicks(x.start_s)) + num(pad_s.lead, 0) + num(pad_s.tail, 0); why = `narration ${kind === "scratch" ? "(scratch) " : ""}runs ${round6(want - num(pad_s.lead, 0) - num(pad_s.tail, 0))} s plus its breathing room`; }
    if (want == null || board == null) continue;
    // proof and readability are not crushed to fit a grid or a short take
    const need = checkReading({ ...s, timing: { duration_s: want } }, copy, { locale, display });
    const floor = Math.max(need.needed_s || 0, num(s.timing && s.timing.min_s, 0));
    if (want < floor && !a.music_led) { protectedShots.push({ shot_id: s.shot_id, wanted_s: round6(want), floor_s: round6(floor), why: need.needed_s >= floor ? "the on-screen copy needs this long to read" : "this shot's minimum for its proof" }); want = floor; }
    else if (want < floor && a.music_led) notes.push({ shot_id: s.shot_id, issue: `the track gives ${round6(want)} s but the copy needs ~${round6(floor)} s: change the copy or ask to edit the track; the track was not changed` });
    if (Math.abs(want - board) > 1e-6) deltas.push({ shot_id: s.shot_id, scene: s.scene_n ?? null, from_s: board, to_s: round6(want), reason: why });
  }
  return {
    schema_version: SCHEMA_VERSION, point: { stage: "storyboard", before: "approval", id: "timing-reconciliation" },
    audio_kind: kind, labelled: kind === "scratch" ? "scratch audio: timings provisional, final-voice timing is not approved by this storyboard" : kind === "none" ? "silent preview: no audio" : "selected audio",
    authority: a.music_led ? "music" : kind === "none" ? "board" : "voice", deltas, protected: protectedShots, notes,
    needs_commit: deltas.length > 0, commit_via: "commitTiming (the canonical score writer); no second timeline",
  };
}

// ---- committing a timing delta through the score ----------------------------------------------------------------------------------------
// deltas: [{scene: n (1-based), duration_s}] -> { score (a copy), changed, retime, review }. Pure.
export function applyTimingDeltas(score, deltas) {
  const next = JSON.parse(JSON.stringify(score));
  const S = arr(next.scenes);
  const before = scoreTiming(score);
  const changed = [];
  for (const d of arr(deltas)) {
    const i = Number(d.scene) - 1;
    if (!S[i] || !(num(d.duration_s) > 0)) continue;
    const old = num(S[i].duration, 0), nu = round6(Number(d.duration_s));
    if (Math.abs(nu - old) < 1e-9) continue;
    const k = old > 0 ? nu / old : 1;
    S[i].duration = nu;
    // scene-local times follow the scene proportionally (the interval keeps its meaning); a hand-placed event is flagged for review
    arr(S[i].shots).forEach((sh) => { sh.t0 = round6(Number(sh.t0) * k); sh.t1 = round6(Number(sh.t1) * k); });
    if (arr(S[i].shots).length) S[i].shots[S[i].shots.length - 1].t1 = nu;
    arr(S[i].events).forEach((ev) => { if (num(ev.t) != null) ev.t = round6(Number(ev.t) * k); });
    changed.push({ scene: i + 1, from_s: old, to_s: nu });
  }
  if (num(next.duration) != null || changed.length) next.duration = round6(S.reduce((a, s) => a + num(s.duration, 0), 0));
  const after = scoreTiming(next);
  const retime = before.scenes.map((b, i) => ({ scene: b.n, old: [b.start_s, b.end_s], new: [after.scenes[i].start_s, after.scenes[i].end_s], mode: "linear" })).filter((e) => e.old[0] !== e.new[0] || e.old[1] !== e.new[1]);
  const first = changed.length ? Math.min(...changed.map((c) => c.scene)) : null;
  const review = first == null ? [] : ["music_arc", "breaths", "budget", "big_moments", "hits", "curves.json", "audio cues"].filter((f) => f === "audio cues" || next[f] !== undefined || f === "curves.json").map((f) => `${f}: film-time values after scene ${first} moved`);
  return { score: next, changed, retime, review };
}

// Commit: score.json (and the scenes.json durations the score is checked against), the derived events.json, and the recorded retime mapping.
// dry: true -> only the report. The caller then runs `crew.mjs storyboard` to project the score into STORYBOARD.md (the existing writer).
export function commitTiming(run, deltas, { dry = false, reason = "" } = {}) {
  const sf = path.join(run, "motion", "score.json");
  const score = rjson(sf);
  if (!score) return { ok: false, error: "motion/score.json is missing or invalid: the score is the one timing authority, so there is nothing to commit to" };
  const res = applyTimingDeltas(score, deltas);
  if (!res.changed.length) return { ok: true, changed: [], note: "no duration changed" };
  const rev0 = scoreRevision(score), rev1 = scoreRevision(res.score);
  if (dry) return { ok: true, dry: true, changed: res.changed, retime: res.retime, review: res.review, from_revision: rev0, to_revision: rev1 };
  writeJson(sf, res.score);
  const scf = path.join(run, "scenes.json"), sc = rjson(scf);
  if (sc && Array.isArray(sc.scenes)) { for (const c of res.changed) if (sc.scenes[c.scene - 1]) sc.scenes[c.scene - 1].duration = c.to_s; writeJson(scf, sc); }
  const logf = path.join(run, "motion", "retime.json");
  const log = rjson(logf) || { schema_version: SCHEMA_VERSION, convention: "film time, start-inclusive end-exclusive; map old film time to new with mapOldToNew", entries: [] };
  log.entries.push({ from_revision: rev0, to_revision: rev1, reason: T(reason), changed: res.changed, retime: res.retime });
  writeJson(logf, log);
  const ev = writeEvents(run);
  return { ok: true, changed: res.changed, retime: res.retime, review: res.review, from_revision: rev0, to_revision: rev1, events: ev, next: "run crew.mjs storyboard --run <run> --project <dir> (the existing score writer) to project the new score into STORYBOARD.md and score.md" };
}
