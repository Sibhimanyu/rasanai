// The film's intent sheet: story/intent.json, the ONE written argument (references/intent.md is the schema; this file is its validator).
// The script writer writes it before any line, the structure critic's edits change it, the Motion Director and the critics read it, and scenes.mjs
// takes every beat's duration from it.
//   loadIntent(file)                      -> the parsed sheet, or null when there is none
//   validateIntent(intent, { lengthS, durations }) -> { ok, errors, warnings, timing, curve }
//        errors block: missing fields, relation words, importance values, the 25% budget, the one peak at importance 3, the peak holds longest (peak-not-longest), the proposition (<= 12 words, no "and"), ending_first;
//        warnings are the uncalibrated rules: the peak's place (60-75%), the rest before it, read seconds, duplicate buys, buys wording, felt-number count
//        durations = the pitch's beats' duration_s (the draft the peak's position is measured on); without them the beats' own, else planDurations()
//        (the plot engine, the turn and the payoff live in the pitch: story.mjs check holds them to these beats)
//   planDurations(beats, { total })       -> seconds per beat from each beat's read time and importance (peak and payoff hold longest, beats before the turn shorten)
//   applyEdits(intent, edits)             -> the structure critic's cut | merge | move | peak | rest | rewrite edits applied to a copy; keeps ending_first.echoes_beat on its beat
//   applyToScript(pitch, result)          -> the same cut / merge / move on the chosen script's beats[]
// emphasis_curve ([{n, t0, t1, importance, peak, rest_after}]) is derived here (curveOf), never written by hand.
import fs from "node:fs";
import { readTime, wordCount } from "./reading.mjs";

export const RELATIONS = ["because", "but", "so", "example", "escalation", "answer"]; // beat 1 is always "open"
export const PEAK_RANGE = [0.6, 0.75];
export const PEAK_RANGE_10S = [0.58, 0.75]; // a 10 s film (<= 12 s) rounds hard: the window opens at 58% // a lyric video's treatment: the song's own climax, 55-90%
export const TREATMENT_PEAK_RANGE = [0.55, 0.9];
export const MAX_TOP_SHARE = 0.25;
export const MAX_PROPOSITION_WORDS = 12;
const REST_S = 0.5; // the breath a rest_after beat gives (seconds, added to the beat)
const MIN_HOLD_S = 1.2; // nothing on screen is shorter than this

export function loadIntent(file) {
  if (!file || !fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new Error(`intent.json is not valid JSON: ${e.message}`); }
}

const str = (v) => String(v == null ? "" : typeof v === "object" ? v.text || v.line || v.what || v.frame || "" : v).trim();
const hasAnd = (t) => /\band\b/i.test(t);
const readOf = (b) => (b && b.read && typeof b.read === "object" ? b.read : { text: str(b && b.read) });
// seconds a beat's read needs: the stated read.s (or read.seconds), else the one formula (lib/reading.mjs); a picture needs 1.0
export const readSeconds = (b) => {
  const r = readOf(b), need = r.kind === "picture" ? 1 : readTime(str(r.text));
  const stated = Number(r.s) > 0 ? Number(r.s) : Number(r.seconds) > 0 ? Number(r.seconds) : 0;
  return stated || need;
};

// seconds per beat. floor = the read time (never shorter); weight = importance; the peak and the payoff (the `answer` beat, else the last) hold longest, beats
// before the peak (the turn) shorten, a rest_after beat gets a breath. With `total`, the time above the floors is shared by weight.
export function planDurations(beats, { total = 0 } = {}) {
  const peak = beats.findIndex((b) => b.peak === true);
  let payoff = beats.map((b) => b.relation).lastIndexOf("answer");
  if (payoff < 0) payoff = beats.length - 1;
  let turn = beats.findIndex((b) => String(b.relation).toLowerCase() === "but");
  if (turn < 0) turn = peak;
  const rows = beats.map((b, i) => {
    const floor = Math.max(MIN_HOLD_S, readSeconds(b) + 0.4);
    const imp = [0.9, 1.1, 1.35][Math.min(3, Math.max(1, Number(b.importance) || 2)) - 1];
    // the peak and the payoff hold longest; the two beats before the turn (the first `but`, else the peak) shorten; a rest adds air (uncalibrated starting point)
    const w = imp * (i === peak ? 1.2 : i === payoff ? 1.2 : 1) * (turn >= 2 && (i === turn - 1 || i === turn - 2) || turn === 1 && i === 0 ? 0.85 : 1);
    const rest = b.rest_after === true ? REST_S : 0;
    return { floor, w, rest, secs: floor * w + rest };
  });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  let overflow = false;
  if (total > 0) {
    const fixed = sum("floor") + sum("rest");
    if (fixed > total + 1e-6) { rows.forEach((r) => (r.secs = r.floor + r.rest)); overflow = true; }
    else { const free = total - fixed, tw = rows.reduce((a, r) => a + r.w, 0); rows.forEach((r) => (r.secs = r.floor + r.rest + (free * r.w) / tw)); }
  }
  return { seconds: rows.map((r) => +r.secs.toFixed(2)), total: +sum("secs").toFixed(2), overflow, peak_index: peak, payoff_index: payoff };
}

// where each beat starts: the pitch's durations when given (and one per beat), else the beats' own duration_s, else the planned durations
function timingOf(beats, { lengthS, durations }) {
  const given = Array.isArray(durations) && durations.length === beats.length && durations.every((d) => Number(d) > 0) ? durations.map(Number) : null;
  const own = beats.every((b) => Number(b.duration_s) > 0) ? beats.map((b) => Number(b.duration_s)) : null;
  const secs = given || own || planDurations(beats, { total: lengthS || 0 }).seconds;
  let t = 0;
  const starts = secs.map((d) => { const s = t; t += d; return s; });
  return { starts, secs, total: t, planned: !given && !own };
}

export const curveOf = (beats, timing) => beats.map((b, i) => ({ n: i + 1, t0: +(timing ? timing.starts[i] : 0).toFixed(2), t1: +(timing ? timing.starts[i] + timing.secs[i] : 0).toFixed(2), importance: Number(b && b.importance) || 0, peak: !!(b && b.peak), rest_after: !!(b && b.rest_after) }));

export function validateIntent(intent, { lengthS = 0, durations = null } = {}) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  if (!intent || typeof intent !== "object") return { ok: false, errors: ["intent.json: missing or not an object"], warnings, timing: null, curve: [] };
  const beats = Array.isArray(intent.beats) ? intent.beats : [];
  const N = beats.length;
  const treatment = intent.kind === "treatment";

  // the proposition: one sentence, <= 12 words, no "and" (single-minded)
  const prop = str(intent.proposition);
  if (!prop) E("proposition: missing (one sentence, at most 12 words, no \"and\")");
  else {
    const n = wordCount(prop);
    if (n > MAX_PROPOSITION_WORDS) E(`proposition-long: ${n} words (${MAX_PROPOSITION_WORDS} at most): "${prop}"`);
    if (hasAnd(prop) || /&|\+/.test(prop)) E(`proposition-and: has "and": two ideas are one too many ("${prop}"); keep the one every beat carries, proves or pays off`);
  }
  const page = intent.page && typeof intent.page === "object" ? intent.page : null;
  if (!page) E("page: missing { problem, audience, goal, emotion }");
  else {
    for (const k of ["problem", "audience", "goal", "emotion"]) if (!str(page[k])) E(`page.${k}: missing`);
    if (str(page.emotion) && !/ to /i.test(page.emotion)) W('page.emotion: write it "from <feeling> to <feeling>"');
  }
  const vil = intent.villain && typeof intent.villain === "object" ? intent.villain : null;
  if (!vil || !str(vil.what) || !str(vil.picture)) E("villain: missing { what, picture } (the one object or problem to blame, and how it is visible on screen)");
  const fn = Array.isArray(intent.felt_numbers) ? intent.felt_numbers : [];
  if (fn.length < 1 || fn.length > 3) W(`felt_numbers: ${fn.length} (1 to 3 of { value, source })`);
  fn.forEach((x, i) => { if (!/\d/.test(str(x && x.value))) W(`felt_numbers[${i}].value has no digit`); if (!str(x && x.source)) W(`felt_numbers[${i}].source: a claim id or "prop"`); });
  const ef = intent.ending_first && typeof intent.ending_first === "object" ? intent.ending_first : null;
  if (!ef || !str(ef.line) || !str(ef.last_frame)) E("ending_first: missing { line, last_frame, echo } (the last line and frame, written FIRST)");
  else {
    if (!str(ef.echo)) E("ending_first.echo: missing (what of the opening the ending answers)");
    if (ef.echoes_beat != null && !(Number(ef.echoes_beat) >= 1 && Number(ef.echoes_beat) <= N)) W(`ending_first.echoes_beat: a beat number 1-${N}`);
  }
  // idea from storytelling/payoff craft notes; our code, uncalibrated: a last frame that is only the mark does not pay the opening
  if (ef && str(ef.last_frame)) {
    const lf = str(ef.last_frame), lw = lf.split(/\s+/).filter(Boolean);
    const echoW = new Set((str(ef.echo).toLowerCase().match(/[a-z]{4,}/g) || []));
    const hasEcho = (lf.toLowerCase().match(/[a-z]{4,}/g) || []).some((w) => echoW.has(w));
    if ((/^\s*(the\s+)?(logo|mark|wordmark|lockup|end card)\b/i.test(lf) || (lw.length <= 6 && /logo|mark|wordmark|lockup/i.test(lf))) && !hasEcho) W(`logo-only-ending: the last frame is only the mark ("${lf}"); show the outcome the opening promised (ending_first.echo) and let the mark sit in it`);
  }
  // optional character arc (mascot, brand-character, animated-story films); silent when absent
  if (intent.character != null) {
    const ch = typeof intent.character === "object" ? intent.character : {};
    for (const k of ["want", "obstacle", "behaviour", "change", "acting"]) if (!str(ch[k])) W(`character-arc-thin: character.${k} missing`);
    if (str(ch.change) && str(ch.want) && str(ch.change).toLowerCase() === str(ch.want).toLowerCase()) W("character-no-change: character.change repeats character.want (what is different at the end?)");
  }
  if (!str(intent.muted_hook)) W("muted_hook: missing (what the first 2 s say with the sound off)");

  if (N < 3) E(`beats: ${N} (need at least 3)`);
  const label = (b, i) => `beats[${i}]${b && b.name ? ` "${b.name}"` : ""}`;
  beats.forEach((b, i) => {
    if (!b || typeof b !== "object") return E(`beats[${i}]: not an object`);
    const buys = str(b.buys);
    if (!buys) E(`${label(b, i)}: buys missing (the one belief the viewer now holds)`);
    else {
      if (!/^the viewer now /i.test(buys)) W(`buys-form: ${label(b, i)}: buys starts "The viewer now ..." (believes, knows, feels, wants)`);
      if (wordCount(buys) > 20) W(`buys-form: ${label(b, i)}: buys is ${wordCount(buys)} words (20 at most)`);
      if (hasAnd(buys)) W(`buys-and: ${label(b, i)}: buys has "and": one belief per beat`);
    }
    if (!str(b.viewer_before)) E(`${label(b, i)}: viewer_before missing`);
    if (!str(b.viewer_after)) E(`${label(b, i)}: viewer_after missing`);
    else if (str(b.viewer_after).toLowerCase() === str(b.viewer_before).toLowerCase()) W(`no-change: ${label(b, i)}: viewer_after equals viewer_before: a beat that changes nothing is cut`);
    const rel = str(b.relation).toLowerCase();
    if (i === 0) { if (rel !== "open") E(`${label(b, i)}: the first beat's relation is "open"`); }
    else if (!rel) E(`no-relation: ${label(b, i)}: no relation word (${RELATIONS.join(" | ")}): a beat with no relation to the one before is cut`);
    else if (!RELATIONS.includes(rel)) E(`${label(b, i)}: relation "${rel}" is not one of ${RELATIONS.join(" | ")}`);
    if (![1, 2, 3].includes(Number(b.importance))) E(`${label(b, i)}: importance must be 1, 2 or 3`);
    const r = readOf(b);
    if (!str(r.text)) E(`${label(b, i)}: read missing (the one thing on screen to read: { text, kind, s })`);
    else {
      const need = r.kind === "picture" ? 1 : readTime(str(r.text)), got = Number(r.s) > 0 ? Number(r.s) : Number(r.seconds) > 0 ? Number(r.seconds) : 0;
      if (!got) E(`${label(b, i)}: read.seconds missing (seconds the read needs: at least ${need.toFixed(1)} for "${str(r.text)}")`);
      else if (got < need - 0.05) W(`read-short: ${label(b, i)}: read.seconds ${got} < the ${need.toFixed(1)} s "${str(r.text)}" needs (lib/reading.mjs: 0.6 + 0.3 per word)`);
    }
    if (i > 0 && str(b.buys) && str(b.buys).toLowerCase() === str(beats[i - 1].buys).toLowerCase()) W(`${label(b, i)}: the same buys as the beat before (a repeated belief is a cut or a merge)`);
  });

  // the importance budget: <= 25% of the beats at 3, exactly one peak
  const top = beats.filter((b) => Number(b && b.importance) === 3).length;
  if (N && top / N > MAX_TOP_SHARE + 1e-9) E(`importance-budget: ${top} of ${N} beats are 3 (${Math.round((top / N) * 100)}%; at most ${MAX_TOP_SHARE * 100}%): when everything is important nothing is`);
  if (N && !beats.some((b) => Number(b && b.importance) === 1)) W("no-valley: no beat is 1 (emphasis is spent, not spread: at least one beat is calm)");
  const peaks = beats.map((b, i) => (b && b.peak === true ? i : -1)).filter((i) => i >= 0);
  if (peaks.length !== 1) E(`peak-count: ${peaks.length} beats marked peak: true (exactly one)`);
  else if (Number(beats[peaks[0]].importance) !== 3) E(`${label(beats[peaks[0]], peaks[0])}: the peak must be importance 3`);

  const timing = N ? timingOf(beats, { lengthS: lengthS || Number(intent.length_s) || 0, durations }) : null;
  if (timing && peaks.length === 1) {
    const pk = peaks[0], at = timing.starts[pk] / (timing.total || 1), [lo, hi] = treatment ? TREATMENT_PEAK_RANGE : timing.total <= 12 ? PEAK_RANGE_10S : PEAK_RANGE;
    // the peak holds longest: a measured beat (the pitch's durations, else the beats' own duration_s) shorter than another is an error; planned durations hold the peak longest by construction
    if (!timing.planned) { const longer = timing.secs.map((d, i) => ({ d, i })).filter(({ d, i }) => i !== pk && d > timing.secs[pk] + 1e-9); if (longer.length) E(`peak-not-longest: ${label(beats[pk], pk)} runs ${+timing.secs[pk].toFixed(2)} s, shorter than ${longer.map(({ d, i }) => `${label(beats[i], i)} (${+d.toFixed(2)} s)`).join(", ")}: the peak holds longest`); }
    if (at < lo - 0.01 || at > hi + 0.01) W(`peak-place: ${label(beats[pk], pk)} starts at ${Math.round(at * 100)}% of the running time (${Math.round(lo * 100)}-${Math.round(hi * 100)}%)`);
    if (pk > 0 && beats[pk - 1].rest_after !== true) W(`no-rest-before-peak: the beat before the peak (${label(beats[pk - 1], pk - 1)}) needs rest_after: true (the film breathes right before its peak)`);
  }
  if (timing && Number(intent.length_s) > 0 && !timing.planned && Math.abs(timing.total - Number(intent.length_s)) > 1) W(`the beats' durations sum to ${timing.total.toFixed(1)} s, length_s says ${intent.length_s}`);
  return { ok: !errors.length, errors, warnings, timing: timing && { total_s: +timing.total.toFixed(2), starts_s: timing.starts.map((x) => +x.toFixed(2)), seconds: timing.secs.map((x) => +x.toFixed(2)), planned: timing.planned }, curve: curveOf(beats, timing) };
}

// The structure critic's edits, applied to a copy (beats are 1-based, numbered as on the sheet; later edits still name the ORIGINAL numbers):
//   { op: "cut", beat }  { op: "merge", beats: [A, B], buys? }  { op: "move", beat, to }  { op: "peak", beat } (the old peak steps down to importance 2)  { op: "rest", beat }
//   { op: "rewrite", beat, buys?, relation?, importance?, viewer_before?, viewer_after? }
// Returns { intent, applied[], skipped[], removed[], order[], merged{} }: `order` = the original numbers still on the sheet, in their new order; `merged` maps a
// surviving original number to the numbers it absorbed. ending_first.echoes_beat follows its beat (a gone one becomes beat 1); beat 1 is always "open".
export function applyEdits(intent, edits) {
  const doc = JSON.parse(JSON.stringify(intent));
  const beats = doc.beats.map((b, i) => ({ ...b, __o: i + 1 }));
  const applied = [], skipped = [];
  const at = (n) => beats.findIndex((b) => b.__o === n);
  for (const e of edits || []) {
    const op = String(e.op || "").toLowerCase();
    const i = at(Number(e.beat != null ? e.beat : (e.beats || [])[0]));
    if (!["cut", "merge", "move", "peak", "rest", "rewrite"].includes(op)) { skipped.push({ ...e, why: "unknown op" }); continue; }
    if (i < 0) { skipped.push({ ...e, why: "that beat is no longer on the sheet" }); continue; }
    if (op === "cut") { if (beats[i].peak) { skipped.push({ ...e, why: "the peak cannot be cut: move the peak first" }); continue; } beats.splice(i, 1); }
    else if (op === "merge") {
      const j = at(Number((e.beats || [])[1]));
      if (j < 0 || j === i) { skipped.push({ ...e, why: "second beat missing" }); continue; }
      const [a, b] = i < j ? [i, j] : [j, i], keep = beats[a], gone = beats[b];
      keep.buys = str(e.buys) || keep.buys;
      keep.viewer_after = gone.viewer_after || keep.viewer_after;
      keep.importance = Math.max(Number(keep.importance) || 1, Number(gone.importance) || 1);
      keep.peak = !!(keep.peak || gone.peak);
      keep.rest_after = gone.rest_after === true;
      if (Number(gone.duration_s) > 0 && Number(keep.duration_s) > 0) keep.duration_s = +(Number(keep.duration_s) + Number(gone.duration_s)).toFixed(2);
      keep.__merged = [...(keep.__merged || []), gone.__o, ...(gone.__merged || [])];
      beats.splice(b, 1);
    } else if (op === "move") {
      const to = Math.min(beats.length, Math.max(1, Number(e.to))) - 1;
      const [b] = beats.splice(i, 1); beats.splice(to, 0, b);
    } else if (op === "peak") { beats.forEach((b) => { if (b.peak && b !== beats[i] && Number(b.importance) === 3) b.importance = 2; b.peak = false; }); beats[i].peak = true; beats[i].importance = 3; } // the old peak steps down to 2, so the 25% budget holds
    else if (op === "rest") beats[i].rest_after = true;
    else if (op === "rewrite") {
      const keys = ["buys", "relation", "importance", "viewer_before", "viewer_after"].filter((k) => e[k] != null && String(e[k]).trim() !== "");
      if (!keys.length) { skipped.push({ ...e, why: "rewrite names nothing to change" }); continue; }
      for (const k of keys) beats[i][k] = k === "importance" ? Number(e[k]) : e[k];
    }
    applied.push(e);
  }
  const order = beats.map((b) => b.__o);
  const merged = Object.fromEntries(beats.filter((b) => b.__merged).map((b) => [b.__o, b.__merged]));
  const newIndexOf = (o) => { const k = order.indexOf(o); if (k >= 0) return k + 1; const host = Object.entries(merged).find(([, g]) => g.includes(o)); return host ? order.indexOf(Number(host[0])) + 1 : 0; };
  const removed = (intent.beats || []).map((_, k) => k + 1).filter((n) => !order.includes(n));
  doc.beats = beats.map(({ __o, __merged, ...b }, k) => ({ ...b, ...(k === 0 ? { relation: "open" } : b.relation === "open" ? { relation: "so" } : {}) }));
  if (doc.ending_first) doc.ending_first.echoes_beat = newIndexOf(Number(doc.ending_first.echoes_beat)) || 1;
  delete doc.emphasis_curve; // derived: story.mjs intent --write recomputes it
  return { intent: doc, applied, skipped, removed, order, merged };
}

// the same edits on the chosen script's beats[] (aligned with the intent's beats by position): follow `order`, and fold a merged beat's duration into its host
export function applyToScript(pitch, result) {
  const src = pitch.beats || [];
  const beats = result.order.map((o) => {
    const b = { ...src[o - 1] };
    for (const m of result.merged[o] || []) if (src[m - 1] && Number(src[m - 1].duration_s) > 0) b.duration_s = +((Number(b.duration_s) || 0) + Number(src[m - 1].duration_s)).toFixed(2);
    return b;
  });
  return { ...pitch, beats };
}
