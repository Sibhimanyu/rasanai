// film-events: the ONE derived event timeline of a film (picture hits, seams, foley, music cues, spoken words) in film seconds.
// motion/score.json stays the authored truth; <run>/motion/events.json is DERIVED from it (plus the run's word alignments and the sfx plan)
// by `events.mjs export`, never hand-written (an edit is overwritten on the next export). Consumers (music, sound, voice, subtitles, the
// motion gate, delivery) read the manifest only when it is supplied or present and fresh; without one they behave as before.
// Method and field mapping: references/film-events.md. Pure Node, no network, no dependencies.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const SCHEMA_VERSION = 1;
// the event kinds, in tie-break precedence (a scene opens before its seam, a picture hit before its sound, a sound before the word)
export const KINDS = ["scene_start", "seam", "music_cue", "visual_hit", "foley_hit", "word_start"];
const PREC = Object.fromEntries(KINDS.map((k, i) => [k, i]));
export const TOL_S = 0.05; // the same slack crew.mjs gives a scene-local event at the scene's end
const MAX_FPS = 240;
const ATTRS = ["what", "sound", "sfx", "size", "group", "x", "on_word", "name", "treatment", "signature"];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const num = (v) => (v === null || v === undefined || v === "" || typeof v === "boolean" ? NaN : Number(v));
const posix = (p) => String(p).split(path.sep).join("/");
const norm = (w) => String(w ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const pad2 = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------------------------------- ordering / serialising

export function compareEvents(a, b) {
  if (a.at_s !== b.at_s) return a.at_s < b.at_s ? -1 : 1;
  const pa = PREC[a.kind] ?? 99, pb = PREC[b.kind] ?? 99;
  if (pa !== pb) return pa - pb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
export const serialize = (m) => JSON.stringify(m, null, 2) + "\n";
export const isManifest = (o) => !!o && typeof o === "object" && !Array.isArray(o) && o.schema_version != null && Array.isArray(o.events) && o.events.every((e) => e && typeof e === "object" && "at_s" in e);

// ---------------------------------------------------------------------------------------------------- derive (pure)

// input: { score, scorePath, scoreSha, audioMeta|null, audioMetaInfo, sfxPlan|null, sfxInfo, fps? }
// returns { manifest|null, problems[], warnings[] }; no manifest when anything is invalid
export function derive(inp) {
  const P = [], W = [];
  const score = inp.score;
  const missing = { path: null, sha256: null, status: "missing" };
  if (!score || typeof score !== "object" || Array.isArray(score)) return { manifest: null, problems: ["score: not a JSON object"], warnings: [] };
  const fps = inp.fps != null ? num(inp.fps) : score.fps != null ? num(score.fps) : 30;
  if (!(Number.isFinite(fps) && fps > 0 && fps <= MAX_FPS)) P.push(`fps ${JSON.stringify(inp.fps ?? score.fps)}: must be a number from 1 to ${MAX_FPS}`);
  const S = Array.isArray(score.scenes) ? score.scenes : null;
  if (!S || !S.length) return { manifest: null, problems: [...P, "score.scenes: missing or empty (a film needs scenes)"], warnings: W };

  // scenes: id, start, end (scene-local times convert to film time by adding the scene's start, exactly once, here)
  const scenes = [], byKey = new Map();
  let cursor = 0;
  S.forEach((sc, i) => {
    if (!sc || typeof sc !== "object") { P.push(`scenes[${i}]: not an object`); return; }
    const n = sc.n != null ? sc.n : i + 1;
    const id = sc.id != null && String(sc.id).trim() ? String(sc.id) : sc.n != null ? pad2(sc.n) : null;
    if (id === null) { P.push(`scenes[${i}]: no id (and no n): events cannot reference it`); return; }
    if (scenes.some((x) => x.id === id)) { P.push(`scenes[${i}]: duplicate scene id "${id}"`); return; }
    const start = sc.start != null ? num(sc.start) : sc.start_s != null ? num(sc.start_s) : cursor;
    let dur = sc.duration != null ? num(sc.duration) : sc.duration_s != null ? num(sc.duration_s) : sc.end != null ? num(sc.end) - start : NaN;
    if (!Number.isFinite(start) || start < 0) { P.push(`scenes[${i}] "${id}": start ${JSON.stringify(sc.start)} is not a time of 0 or more`); return; }
    if (!(Number.isFinite(dur) && dur > 0)) { P.push(`scenes[${i}] "${id}": impossible duration ${JSON.stringify(sc.duration ?? sc.duration_s ?? null)} (needs a number over 0)`); return; }
    if (sc.end != null && Math.abs(num(sc.end) - (start + dur)) > TOL_S) P.push(`scenes[${i}] "${id}": end ${sc.end} disagrees with start ${r6(start)} + duration ${r6(dur)}`);
    if (scenes.length && start < scenes[scenes.length - 1].end_s - TOL_S) P.push(`scenes[${i}] "${id}": starts at ${r6(start)} s, before the previous scene ends (${r6(scenes[scenes.length - 1].end_s)} s)`);
    const row = { i, n, id, beat: sc.beat != null ? sc.beat : id, start_s: r6(start), end_s: r6(start + dur) };
    cursor = start + dur;
    scenes.push(row);
    byKey.set(String(n), row); byKey.set(id, row);
  });
  const duration_s = score.duration != null ? num(score.duration) : scenes.length ? scenes[scenes.length - 1].end_s : NaN;
  if (!(Number.isFinite(duration_s) && duration_s > 0)) P.push(`duration ${JSON.stringify(score.duration)}: impossible (needs a number over 0)`);
  else for (const s of scenes) if (s.end_s > duration_s + TOL_S) P.push(`scene "${s.id}" ends at ${s.end_s} s, past the film (${r6(duration_s)} s)`);
  if (P.length) return { manifest: null, problems: P, warnings: W };

  const ev = [], ids = new Set();
  const push = (e) => {
    if (typeof e.id !== "string" || !e.id) { P.push(`${e.source_ref}: no usable id`); return; }
    if (ids.has(e.id)) { P.push(`${e.source_ref}: duplicate event id "${e.id}"`); return; }
    ids.add(e.id);
    ev.push(e);
  };
  const atCheck = (t, ref, what) => {
    if (!Number.isFinite(t)) { P.push(`${ref}: ${what} ${JSON.stringify(t)} is not a number`); return false; }
    if (t < 0) { P.push(`${ref}: ${what} ${t} is negative`); return false; }
    return true;
  };
  const build = (id, at, kind, sc, ref, extra = {}) => ({ id, at_s: r6(at), frame: Math.round(r6(at) * fps), kind, ...(sc ? { scene: sc.id, beat: sc.beat } : {}), ...extra, source_ref: ref });
  const attrsOf = (o) => {
    const a = {};
    if (o.kind != null) a.cue_kind = String(o.kind);
    for (const k of ATTRS) if (o[k] !== undefined && o[k] !== null) a[k] = o[k];
    return Object.keys(a).length ? a : undefined;
  };

  // scene starts
  for (const s of scenes) push(build(`scene-${s.id}-start`, s.start_s, "scene_start", s, `scenes[${s.i}]`));

  // seams: at the start of the incoming scene
  (Array.isArray(score.seams) ? score.seams : []).forEach((sm, i) => {
    const ref = `seams[${i}]`;
    if (!sm || typeof sm !== "object") { P.push(`${ref}: not an object`); return; }
    const to = byKey.get(String(sm.to)), from = byKey.get(String(sm.from));
    if (!to) { P.push(`${ref}: references scene ${JSON.stringify(sm.to)}, which is not in the score`); return; }
    if (!from) { P.push(`${ref}: references scene ${JSON.stringify(sm.from)}, which is not in the score`); return; }
    push(build(sm.id != null ? String(sm.id) : `seam-${from.id}-${to.id}`, to.start_s, "seam", to, ref, { from: from.id, attrs: attrsOf({ kind: sm.kind, sound: sm.sound ?? sm.sfx }) }));
  });

  // picture hits: a scene's events (t in SCENE seconds) and the film-level hits (t in FILM seconds)
  const hits = [];
  S.forEach((sc, i) => {
    const s = scenes.find((x) => x.i === i);
    if (!s || !Array.isArray(sc.events)) return;
    sc.events.forEach((e, j) => {
      const ref = `scenes[${i}].events[${j}]`;
      if (!e || typeof e !== "object") { P.push(`${ref}: not an object`); return; }
      const t = num(e.t ?? e.at);
      if (!atCheck(t, ref, "t")) return;
      if (t > s.end_s - s.start_s + TOL_S) { P.push(`${ref}: scene-local t ${t} is past scene "${s.id}" (${r6(s.end_s - s.start_s)} s long); scene events are in scene seconds`); return; }
      const h = build(e.id != null ? String(e.id) : `hit-${s.id}-${j + 1}`, s.start_s + t, "visual_hit", s, ref, { scene_t_s: r6(t), attrs: attrsOf(e) });
      push(h); hits.push({ h, e });
    });
  });
  (Array.isArray(score.hits) ? score.hits : []).forEach((e, i) => {
    const ref = `hits[${i}]`;
    if (!e || typeof e !== "object") { P.push(`${ref}: not an object`); return; }
    const t = num(e.t ?? e.at);
    if (!atCheck(t, ref, "t")) return;
    if (t > duration_s + TOL_S) { P.push(`${ref}: t ${t} is past the film (${r6(duration_s)} s)`); return; }
    const sc = scenes.find((x) => t >= x.start_s - 1e-9 && t < x.end_s - 1e-9) || null;
    const h = build(e.id != null ? String(e.id) : `hit-film-${i + 1}`, t, "visual_hit", sc, ref, { attrs: attrsOf(e) });
    push(h); hits.push({ h, e });
  });

  // music cues: only the arc's real numbers
  const arc = score.music_arc && typeof score.music_arc === "object" ? score.music_arc : null;
  if (arc) {
    for (const k of ["intro_until", "drop_at", "payoff_at", "button_at"]) if (arc[k] != null) {
      const t = num(arc[k]);
      if (!atCheck(t, `music_arc.${k}`, k)) continue;
      if (t > duration_s + TOL_S) { P.push(`music_arc.${k}: ${t} is past the film (${r6(duration_s)} s)`); continue; }
      push(build(`music-${k.replace(/_at$|_until$/, "")}`, t, "music_cue", null, `music_arc.${k}`, { cue: k }));
    }
    if (Array.isArray(arc.break) && arc.break.length === 2) arc.break.forEach((v, k) => {
      const t = num(v);
      if (!atCheck(t, `music_arc.break[${k}]`, "break")) return;
      if (t > duration_s + TOL_S) { P.push(`music_arc.break[${k}]: ${t} is past the film`); return; }
      push(build(`music-break-${k ? "end" : "start"}`, t, "music_cue", null, `music_arc.break[${k}]`, { cue: k ? "break_end" : "break_start" }));
    });
  }

  // foley: the sfx plan's cues when there is one (the measured landing time), else what the score itself says has a sound
  const sfx = inp.sfxPlan && Array.isArray(inp.sfxPlan.cues) ? inp.sfxPlan.cues : null;
  const foleyAt = new Map();
  if (sfx) {
    sfx.forEach((c, i) => {
      const ref = `sfx_plan.cues[${i}]`;
      if (!c || typeof c !== "object") { P.push(`${ref}: not an object`); return; }
      const t = num(c.t ?? c.start);
      if (!atCheck(t, ref, "t")) return;
      if (t > duration_s + TOL_S) { P.push(`${ref}: t ${t} is past the film (${r6(duration_s)} s)`); return; }
      const sc = c.scene != null ? byKey.get(String(c.scene)) : scenes.find((x) => t >= x.start_s - 1e-9 && t < x.end_s - 1e-9) || null;
      if (c.scene != null && !sc) { P.push(`${ref}: references scene ${JSON.stringify(c.scene)}, which is not in the score`); return; }
      const of = c.event != null && ids.has(String(c.event)) ? String(c.event) : null;
      const f = build(`foley-${c.event != null ? c.event : `cue-${i + 1}`}`, t, "foley_hit", sc, ref, { origin: "sfx_plan", ...(of ? { of } : {}), ...(c.kind ? { attrs: { sound: String(c.kind) } } : {}) });
      push(f); if (of) foleyAt.set(of, f);
    });
  } else {
    for (const { h, e } of hits) {
      const snd = e.sound ?? e.sfx;
      if (snd == null || !String(snd).trim()) continue;
      const f = build(`foley-${h.id}`, h.at_s, "foley_hit", h.scene ? scenes.find((x) => x.id === h.scene) : null, h.source_ref, { origin: "score", of: h.id, attrs: { sound: String(snd) } });
      push(f); foleyAt.set(h.id, f);
    }
  }

  // spoken words: audio_meta voices[{frame, words:[{text,start,end}]}], start in SCENE seconds
  const am = inp.audioMeta;
  const words = [];
  if (am) {
    const voices = Array.isArray(am.voices) ? am.voices : Array.isArray(am) ? [{ words: am, frame: null }] : [];
    const count = {};
    voices.forEach((v, vi) => {
      const sc = v && v.frame != null ? byKey.get(String(v.frame)) : null;
      if (!v || typeof v !== "object") { P.push(`audio_meta.voices[${vi}]: not an object`); return; }
      if (v.frame == null) { P.push(`audio_meta.voices[${vi}]: no frame (the scene the words are timed against)`); return; }
      if (!sc) { P.push(`audio_meta.voices[${vi}]: references scene ${JSON.stringify(v.frame)}, which is not in the score`); return; }
      (Array.isArray(v.words) ? v.words : []).forEach((w, wi) => {
        const ref = `audio_meta.voices[${vi}].words[${wi}]`;
        const text = String(w && (w.text ?? w.word) != null ? (w.text ?? w.word) : "").trim();
        const t = num(w && w.start);
        if (!text) { P.push(`${ref}: no text`); return; }
        if (!atCheck(t, ref, "start")) return;
        const len = sc.end_s - sc.start_s;
        if (t > len + TOL_S) { P.push(`${ref}: "${text}" starts ${t} s into scene "${sc.id}", which is ${r6(len)} s long (out of bounds)`); return; }
        if (sc.start_s + t > duration_s + TOL_S) { P.push(`${ref}: "${text}" lands past the end of the film`); return; }
        const end = w.end != null ? num(w.end) : NaN;
        if (w.end != null && !(Number.isFinite(end) && end >= t)) { P.push(`${ref}: end ${JSON.stringify(w.end)} is not a time at or after start ${t}`); return; }
        const k = (count[sc.id] = (count[sc.id] || 0) + 1);
        const e = build(`word-${sc.id}-${k}`, sc.start_s + t, "word_start", sc, ref, { scene_t_s: r6(t), word: text, ...(Number.isFinite(end) ? { end_s: r6(sc.start_s + end) } : {}) });
        push(e); words.push(e);
      });
    });
  }

  // sync: every hit that names a spoken word (event.word) against that word's onset and the hit's foley
  const sync = [];
  for (const { h, e } of hits) {
    if (e.word == null || !String(e.word).trim()) continue;
    const want = norm(e.word), f = foleyAt.get(h.id) || null;
    const cand = words.filter((w) => norm(w.word) === want && (!h.scene || w.scene === h.scene));
    const w = cand.sort((a, b) => Math.abs(a.at_s - h.at_s) - Math.abs(b.at_s - h.at_s) || (a.id < b.id ? -1 : 1))[0] || null;
    const row = { id: `sync-${h.id}`, hit: h.id, word: String(e.word), word_event: w ? w.id : null, foley: f ? f.id : null, status: w ? "aligned" : "no-alignment" };
    if (w || f) {
      const times = [h.at_s, ...(w ? [w.at_s] : []), ...(f ? [f.at_s] : [])];
      const err = Math.max(...times) - Math.min(...times);
      row.max_err_s = r6(err);
      row.max_err_frames = Math.round((err * fps) * 1000) / 1000;
      row.within_one_frame = err * fps <= 1 + 1e-9;
      if (!row.within_one_frame) W.push(`sync-off: "${h.id}" (picture ${h.at_s} s${f ? `, foley ${f.at_s} s` : ""}${w ? `, word "${w.word}" ${w.at_s} s` : ""}) spread ${row.max_err_s} s = ${row.max_err_frames} frames at ${fps} fps (one frame is ${r6(1 / fps)} s)`);
    } else row.within_one_frame = null;
    if (!w && am) W.push(`sync-unaligned: "${h.id}" names the word "${e.word}" but no word of that text is timed in scene ${h.scene || "?"}: nothing was invented`);
    sync.push(row);
  }

  if (P.length) return { manifest: null, problems: P, warnings: W };
  ev.sort(compareEvents);
  const manifest = {
    schema_version: SCHEMA_VERSION,
    derived: "DERIVED by events.mjs export from motion/score.json (the authored truth); a hand edit is overwritten on the next export. Edit the score and regenerate.",
    source: {
      score: inp.scorePath || "motion/score.json",
      sha256: inp.scoreSha || null,
      audio_meta: inp.audioMetaInfo || missing,
      sfx_plan: inp.sfxInfo || missing,
    },
    duration_s: r6(duration_s),
    fps,
    scenes: scenes.map((s) => ({ id: s.id, n: s.n, start_s: s.start_s, end_s: s.end_s })),
    events: ev,
    sync,
  };
  const bad = validate(manifest);
  if (bad.length) return { manifest: null, problems: bad.map((b) => `derived manifest: ${b}`), warnings: W };
  return { manifest, problems: [], warnings: W };
}

// ---------------------------------------------------------------------------------------------------- validate (pure)

export function validate(m) {
  const P = [];
  if (!m || typeof m !== "object" || Array.isArray(m)) return ["manifest: not a JSON object"];
  if (m.schema_version !== SCHEMA_VERSION) P.push(`schema_version ${JSON.stringify(m.schema_version)}: this reader knows ${SCHEMA_VERSION}`);
  const fps = num(m.fps), dur = num(m.duration_s);
  if (!(Number.isFinite(fps) && fps > 0 && fps <= MAX_FPS)) P.push(`fps ${JSON.stringify(m.fps)}: must be a number from 1 to ${MAX_FPS}`);
  if (!(Number.isFinite(dur) && dur > 0)) P.push(`duration_s ${JSON.stringify(m.duration_s)}: impossible (needs a number over 0)`);
  const sceneRows = Array.isArray(m.scenes) ? m.scenes : null;
  if (!sceneRows) P.push("scenes: missing (the scene ids events refer to)");
  const sc = new Map();
  for (const s of sceneRows || []) {
    if (!s || typeof s.id !== "string" || !s.id) { P.push("scenes: an entry has no id"); continue; }
    if (sc.has(s.id)) P.push(`scenes: duplicate id "${s.id}"`);
    if (!(Number.isFinite(num(s.start_s)) && Number.isFinite(num(s.end_s)) && num(s.end_s) > num(s.start_s) && num(s.start_s) >= 0)) P.push(`scenes: "${s.id}" has an impossible window ${JSON.stringify([s.start_s, s.end_s])}`);
    sc.set(s.id, s);
  }
  if (!Array.isArray(m.events)) return [...P, "events: missing"];
  const seen = new Set();
  let prev = null;
  m.events.forEach((e, i) => {
    const at = `events[${i}]`;
    if (!e || typeof e !== "object") { P.push(`${at}: not an object`); return; }
    if (typeof e.id !== "string" || !e.id) P.push(`${at}: no id`);
    else if (seen.has(e.id)) P.push(`${at}: duplicate id "${e.id}"`);
    else seen.add(e.id);
    if (!KINDS.includes(e.kind)) P.push(`${at} "${e.id}": unsupported kind ${JSON.stringify(e.kind)} (${KINDS.join(", ")})`);
    const t = num(e.at_s);
    if (!Number.isFinite(t)) { P.push(`${at} "${e.id}": at_s ${JSON.stringify(e.at_s)} is not a number`); return; }
    if (t < 0) P.push(`${at} "${e.id}": at_s ${t} is negative`);
    if (Number.isFinite(dur) && t > dur + TOL_S) P.push(`${at} "${e.id}": at_s ${t} is past the film (${dur} s)`);
    if (e.frame != null && Number.isFinite(fps) && e.frame !== Math.round(t * fps)) P.push(`${at} "${e.id}": frame ${e.frame} is not round(at_s * fps) = ${Math.round(t * fps)}`);
    if (e.scene != null && sceneRows && !sc.has(String(e.scene))) P.push(`${at} "${e.id}": references scene "${e.scene}", which is not in scenes`);
    if (e.kind === "word_start") {
      const s = sc.get(String(e.scene));
      if (!e.word) P.push(`${at} "${e.id}": a word_start with no word`);
      if (e.scene == null) P.push(`${at} "${e.id}": a word_start with no scene`);
      else if (s && (t < num(s.start_s) - TOL_S || t > num(s.end_s) + TOL_S)) P.push(`${at} "${e.id}": word at ${t} s is outside its scene "${s.id}" (${s.start_s}-${s.end_s} s)`);
    }
    if (prev && Number.isFinite(t) && compareEvents(prev, e) > 0 && !P.some((p) => p.startsWith(`${at}: out of order`))) P.push(`${at}: out of order (events sort by at_s, kind precedence, id)`);
    prev = e;
  });
  return P;
}

// ---------------------------------------------------------------------------------------------------- diff (pure)

export function diff(a, b) {
  const ma = new Map((a.events || []).map((e) => [e.id, e])), mb = new Map((b.events || []).map((e) => [e.id, e]));
  const added = [...mb.keys()].filter((k) => !ma.has(k)).sort(), removed = [...ma.keys()].filter((k) => !mb.has(k)).sort(), moved = [], changed = [];
  const fps = num(b.fps) || num(a.fps) || 30;
  for (const [id, x] of [...ma].sort((p, q) => (p[0] < q[0] ? -1 : 1))) {
    const y = mb.get(id);
    if (!y) continue;
    if (x.at_s !== y.at_s) moved.push({ id, a_at_s: x.at_s, b_at_s: y.at_s, delta_s: r6(y.at_s - x.at_s), delta_frames: Math.round((y.at_s - x.at_s) * fps * 1000) / 1000 });
    else if (JSON.stringify(x) !== JSON.stringify(y)) changed.push(id);
  }
  const meta = [];
  for (const k of ["duration_s", "fps"]) if (a[k] !== b[k]) meta.push({ field: k, a: a[k], b: b[k] });
  return { identical: !added.length && !removed.length && !moved.length && !changed.length && !meta.length, added, removed, moved, changed, meta };
}

// ---------------------------------------------------------------------------------------------------- adapters for the consumers (pure)

// the legacy {t, kind, ...} event rows sound.mjs and music.mjs already read. cuesOnly: just what can carry a sound (sfx-plan);
// otherwise also seams, scene cuts' seams, logo/payoff/button lines the sound check looks up by kind.
export function legacyEvents(m, { cuesOnly = false } = {}) {
  const nOf = new Map((m.scenes || []).map((s) => [s.id, s.n]));
  const out = [];
  for (const e of m.events || []) {
    const a = e.attrs || {};
    const base = { id: e.id, t: e.at_s, ...(e.scene != null ? { scene: nOf.get(e.scene) ?? e.scene } : {}) };
    if (e.kind === "visual_hit") {
      const kind = a.cue_kind || a.sound || a.sfx;
      if (cuesOnly && !kind) continue;
      out.push({ ...base, ...passAttrs(a), kind: kind || "hit" });
    } else if (e.kind === "seam") {
      const snd = a.sound || a.sfx;
      if (cuesOnly) { if (snd) out.push({ ...base, ...passAttrs(a), kind: snd }); continue; }
      out.push({ ...base, kind: "seam", what: a.cue_kind || "seam" });
    } else if (!cuesOnly && e.kind === "music_cue") out.push({ ...base, kind: e.cue || "music" });
  }
  return out;
}
const passAttrs = (a) => { const o = {}; for (const k of ATTRS) if (a[k] !== undefined && k !== "sound" && k !== "sfx") o[k] = a[k]; return o; };

// the picture's hit times for the music tempo: hits, seams, the arc's cues
const TEMPO_CUES = new Set(["drop_at", "payoff_at", "button_at", "break_end"]);
export const hitTimes = (m) => (m.events || []).filter((e) => e.kind === "visual_hit" || e.kind === "seam" || (e.kind === "music_cue" && TEMPO_CUES.has(e.cue))).map((e) => ({ t: e.at_s, kind: e.cue || (e.attrs && e.attrs.cue_kind) || e.kind }));
// spoken words in film seconds
export const wordsOf = (m) => (m.events || []).filter((e) => e.kind === "word_start").map((e) => ({ text: e.word, start: e.at_s, end: e.end_s != null ? e.end_s : e.at_s + 0.2, scene: e.scene }));

// what a delivery folder may carry: no free text from the score (notes), no paths outside the run
export function publicManifest(m) {
  const clean = (p) => (typeof p === "string" && !path.isAbsolute(p) && !/^\w:|\.\.|\/Users\/|\/home\//.test(p) ? p : null);
  const src = m.source || {};
  const sub = (s) => (s && typeof s === "object" ? { path: clean(s.path), sha256: s.sha256 || null, status: s.status || "missing" } : { path: null, sha256: null, status: "missing" });
  return {
    schema_version: m.schema_version,
    source: { score: clean(src.score) || "motion/score.json", sha256: src.sha256 || null, audio_meta: sub(src.audio_meta), sfx_plan: sub(src.sfx_plan) },
    duration_s: m.duration_s,
    fps: m.fps,
    scenes: m.scenes,
    events: (m.events || []).map(({ attrs, source_ref, ...rest }) => ({ ...rest, ...(attrs && attrs.sound ? { sound: attrs.sound } : {}), source_ref })),
    sync: m.sync,
  };
}

// ---------------------------------------------------------------------------------------------------- the run on disk

const rd = (f) => fs.readFileSync(f);
const relIn = (run, p) => { const r = posix(path.relative(run, p)); return r.startsWith("..") || path.isAbsolute(r) ? `external:${path.basename(p)}` : r; };
const first = (run, names) => names.map((n) => path.join(run, n)).find((f) => fs.existsSync(f)) || null;
export const DEFAULTS = {
  score: ["motion", "score.json"],
  audio_meta: [["motion", "audio_meta.json"], ["audio_meta.json"], ["audio", "audio_meta.json"]],
  sfx_plan: [["motion", "sfx-plan.json"], ["audio", "sfx-plan.json"], ["sfx-plan.json"]],
};
export const eventsPath = (run) => path.join(run, "motion", "events.json");

// opts: {score, audioMeta, sfx} explicit files (a named file that is missing is "unable"); returns {inputs} or throws {unable}
export function readSources(run, opts = {}) {
  run = path.resolve(run);
  const fail = (m) => { const e = new Error(m); e.unable = true; throw e; };
  const scoreFile = opts.score ? path.resolve(opts.score) : path.join(run, ...DEFAULTS.score);
  if (!fs.existsSync(scoreFile)) fail(`score not found: ${opts.score ? scoreFile : path.join("motion", "score.json")} (run folder ${run})`);
  const info = (file) => (file ? { path: relIn(run, file), sha256: sha256(rd(file)), status: "present" } : { path: null, sha256: null, status: "missing" });
  const pick = (explicit, names, label) => {
    if (explicit) { const f = path.resolve(explicit); if (!fs.existsSync(f)) fail(`${label} not found: ${explicit}`); return f; }
    return first(run, names.map((n) => path.join(...n)));
  };
  const am = pick(opts.audioMeta, DEFAULTS.audio_meta, "--audio-meta file"), sf = pick(opts.sfx, DEFAULTS.sfx_plan, "--sfx file");
  const parse = (f, label) => { try { return JSON.parse(rd(f).toString("utf8")); } catch (e) { const x = new Error(`${label} is not valid JSON: ${e.message}`); x.invalid = true; throw x; } };
  const scoreBuf = rd(scoreFile);
  let score;
  try { score = JSON.parse(scoreBuf.toString("utf8")); } catch (e) { const x = new Error(`motion/score.json is not valid JSON: ${e.message}`); x.invalid = true; throw x; }
  return {
    score, scorePath: relIn(run, scoreFile), scoreSha: sha256(scoreBuf),
    audioMeta: am ? parse(am, "audio_meta") : null, audioMetaInfo: info(am),
    sfxPlan: sf ? parse(sf, "sfx plan") : null, sfxInfo: info(sf),
    scoreFile,
  };
}

export function exportRun(run, opts = {}) {
  const src = readSources(run, opts);
  const { manifest, problems, warnings } = derive({ ...src, fps: opts.fps });
  return { manifest, problems, warnings, text: manifest ? serialize(manifest) : null, scoreFile: src.scoreFile };
}

// is a manifest read from a file still what its sources say? {state: "fresh"|"stale"|"unverified", reasons[]}
export function freshness(run, m) {
  const reasons = [];
  let checked = 0;
  const s = (m && m.source) || {};
  const hashOf = (rel) => { const f = path.resolve(run, rel); return fs.existsSync(f) ? sha256(rd(f)) : null; };
  const one = (label, rel, want) => {
    if (!rel || path.isAbsolute(rel) || rel.startsWith("external:")) return;
    const h = hashOf(rel);
    checked++;
    if (h === null) reasons.push(`${label} ${rel} is gone`);
    else if (h !== want) reasons.push(`${label} ${rel} changed since the export (sha256 ${String(want).slice(0, 12)}... then, ${h.slice(0, 12)}... now)`);
  };
  one("score", s.score, s.sha256);
  for (const k of ["audio_meta", "sfx_plan"]) {
    const x = s[k];
    if (x && x.status === "present") one(k, x.path, x.sha256);
    else if (x && x.status === "missing") { const f = first(run, DEFAULTS[k].map((n) => path.join(...n))); if (f) { checked++; reasons.push(`${k} ${relIn(run, f)} now exists but the manifest recorded it as missing`); } }
  }
  return { state: reasons.length ? "stale" : checked ? "fresh" : "unverified", reasons };
}

// for a consumer given a manifest FILE: parse, validate, refuse stale. The run is the folder above motion/.
export function loadManifest(file, { run } = {}) {
  const f = path.resolve(file);
  let m;
  try { m = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return { ok: false, error: `${f}: ${e.code === "ENOENT" ? "not found" : "not valid JSON"}` }; }
  if (!isManifest(m)) return { ok: false, notManifest: true, raw: m };
  const bad = validate(m);
  if (bad.length) return { ok: false, error: `film events manifest is invalid: ${bad[0]}${bad.length > 1 ? ` (+${bad.length - 1} more)` : ""}` };
  const root = run ? path.resolve(run) : path.basename(path.dirname(f)) === "motion" ? path.dirname(path.dirname(f)) : null;
  const fr = root ? freshness(root, m) : { state: "unverified", reasons: [] };
  if (fr.state === "stale") return { ok: false, stale: true, error: `film events manifest is stale: ${fr.reasons[0]}; run events.mjs export --run <run> again` };
  return { ok: true, manifest: m, freshness: fr.state };
}

// the present, fresh manifest of a run, or null (stale or invalid: null and the reason)
export function presentManifest(run) {
  const f = eventsPath(path.resolve(run));
  if (!fs.existsSync(f)) return { manifest: null };
  const r = loadManifest(f, { run });
  return r.ok ? { manifest: r.manifest, freshness: r.freshness } : { manifest: null, reason: r.error };
}
