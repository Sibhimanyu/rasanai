// Adapted from cooked. (MIT, Copyright (c) 2026 NextWork), plugins/ai-editor/skills/cut/scripts/build_timeline.py edge/snap_and_pad/silence_cuts/lead_trail_cuts/merge/enforce_splice_budget/kept_frames/in_speech/is_kept/retime L55-L70, L141-L178, L200-L210, L312-L331, L380-L431, L457-L479, L498-L522, L530-L534, L619-L644 and splice_check.py edges_in_speech/fix_splices-style check L27-L69 @3b236ec; ported to Node and modified by RasanAI. Credit: third_party/cooked/.
//
// Non-destructive cut decisions for one clip (schema rasanai.cut.v1) and the kept ranges they imply.
// Words are immutable; decisions are an append-only action log with a `head` pointer, so undo/redo are
// pointer moves and nothing is lost. `correct` changes display text only, never times. Source media is
// only ever read (ffmpeg decode); nothing here writes next to it. Node + ffmpeg only.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fingerprintFile, sha1OfFile } from "./fingerprint.mjs";

export const CUTPLAN_VERSION = "cutplan@1";
// Constants: build_timeline.py L156-L157 (SHORT_WORD_S, RUNWAY_S), L192-L197 (SPEECH_OFFSET_DB, MIN_SEPARATION_DB,
// FLOOR_HEADROOM_DB, RMS_WIN_S), L435 (SPLICE_LEFT_MIN_S), L494-L495 (MIN_KEPT_S, END_TAIL_S), L526-L527 (LOUD_OVER_DB),
// splice_check.py L24 (SPLICE_REACH_S). MAX_PAUSE_S 0.30 is ours (upstream code default 0.15, L60); RasanAI keeps the breath.
export const CP = {
  PAD_S: 0.10, MAX_PAUSE_S: 0.30, SHORT_WORD_S: 0.12, RUNWAY_S: 0.25, SPLICE_LEFT_MIN_S: 0.05, MIN_KEPT_S: 0.2,
  END_TAIL_S: 0.4, RMS_WIN_S: 0.020, SPEECH_OFFSET_DB: 26, MIN_SEPARATION_DB: 20, FLOOR_HEADROOM_DB: 6,
  LOUD_OVER_DB: 10, SPLICE_REACH_S: 0.12,
};
const BED_PERCENTILE = 0.10, FLOOR_SEARCH_DB = 10; // build_timeline.py L194-L195

const OPS = new Set(["accept", "reject", "undecide", "cut", "keep", "correct"]);
const r3 = (x) => Math.round(x * 1000) / 1000;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

export function wordId(clip, i) { return `${clip}:${String(i).padStart(5, "0")}`; }

// ---------------------------------------------------------------- document

export function newCutDoc({ clip, source, transcript, words, candidates = [], params = {} }) {
  let doc = {
    schema: "rasanai.cut.v1", clip, source: { ...source },
    transcript: { ...(transcript || {}), words: words.length },
    analysis: { tool: "retakes@1", upstream: "cooked.@3b236ec", params: { keep_fillers: false, auto_hard_fillers: true, ...params } },
    words: words.map((w, i) => ({ id: w.id || wordId(clip, i), i, text: w.text, start: w.start, end: w.end, conf: w.conf ?? null, speaker: w.speaker ?? null })),
    candidates: candidates.map((c) => ({ ...c })), actions: [], head: 0,
  };
  if (doc.analysis.params.auto_hard_fillers) {
    const ids = doc.candidates.filter((c) => c.kind === "hard_filler" || c.kind === "audio_event").map((c) => c.id);
    if (ids.length) doc = applyAction(doc, { op: "accept", ids, by: "agent", note: "hard fillers and audio events are removed automatically; restore any with reject" });
  }
  return doc;
}

function wordIndex(doc, id) {
  const i = doc.words.findIndex((w) => w.id === id);
  if (i < 0) throw new Error(`unknown id ${id}`);
  return i;
}

// Pure: returns a new doc. undo/redo only move head; other ops truncate the redo tail and append.
export function applyAction(doc, action) {
  const op = action?.op;
  if (op === "undo") return { ...doc, head: Math.max(0, doc.head - 1) };
  if (op === "redo") return { ...doc, head: Math.min(doc.actions.length, doc.head + 1) };
  if (!OPS.has(op)) throw new Error(`unknown op ${op}`);
  const cand = new Set(doc.candidates.map((c) => c.id));
  const rec = { rev: doc.head + 1, ts: new Date().toISOString(), by: action.by || "user", op, ids: null, from: null, to: null, text: null, note: action.note ?? null };
  if (op === "accept" || op === "reject" || op === "undecide") {
    const ids = action.ids || [];
    if (!ids.length) throw new Error(`${op} needs ids`);
    for (const id of ids) if (!cand.has(id)) throw new Error(`unknown id ${id}`);
    rec.ids = [...ids];
  } else if (op === "cut" || op === "keep") {
    const a = wordIndex(doc, action.from), b = wordIndex(doc, action.to);
    if (a > b) throw new Error(`range ${action.from}..${action.to} runs backwards`);
    rec.from = action.from; rec.to = action.to;
  } else {
    if (!action.ids || action.ids.length !== 1) throw new Error("correct needs ids:[wordId]");
    wordIndex(doc, action.ids[0]);
    if (typeof action.text !== "string") throw new Error("correct needs text");
    rec.ids = [action.ids[0]]; rec.text = action.text;
  }
  const actions = doc.actions.slice(0, doc.head).concat(rec);
  return { ...doc, actions, head: actions.length };
}

// Replay actions[0..head). Per word a stack of marks (candidate id | "manual" | "keep"); the top mark decides, so a
// later `keep` restores and a later accept/cut removes again. Reject/undecide drop that candidate's marks.
export function cutState(doc) {
  const idx = new Map(doc.words.map((w, i) => [w.id, i]));
  const cmap = new Map(doc.candidates.map((c) => [c.id, c]));
  const dec = Object.fromEntries(doc.candidates.map((c) => [c.id, "proposed"]));
  const stacks = doc.words.map(() => []);
  const display = doc.words.map((w) => w.text);
  const rangeOf = (c) => {
    if (c.from != null && idx.has(c.from) && idx.has(c.to)) return [idx.get(c.from), idx.get(c.to)];
    const ix = doc.words.filter((w) => w.start >= c.start - 1e-6 && w.end <= c.end + 1e-6).map((w) => w.i);
    return ix.length ? [ix[0], ix[ix.length - 1]] : null;
  };
  // long_pause candidates tighten a gap; they never remove their neighbouring words.
  const removes = (c) => c.kind !== "long_pause";
  for (const a of doc.actions.slice(0, doc.head)) {
    if (a.op === "accept" || a.op === "reject" || a.op === "undecide") {
      for (const id of a.ids) {
        for (const s of stacks) { const k = s.findIndex((m) => m === id); if (k >= 0) s.splice(k, 1); }
        dec[id] = a.op === "accept" ? "accepted" : a.op === "reject" ? "rejected" : "undecided";
        if (a.op === "accept" && removes(cmap.get(id))) {
          const r = rangeOf(cmap.get(id));
          if (r) for (let i = r[0]; i <= r[1]; i++) stacks[i].push(id);
        }
      }
    } else if (a.op === "cut" || a.op === "keep") {
      for (let i = idx.get(a.from); i <= idx.get(a.to); i++) stacks[i].push(a.op === "cut" ? "manual" : "keep");
    } else if (a.op === "correct") display[idx.get(a.ids[0])] = a.text;
  }
  return {
    candidates: dec, rev: doc.head,
    words: doc.words.map((w, i) => {
      const top = stacks[i][stacks[i].length - 1];
      const removed = top !== undefined && top !== "keep";
      return { id: w.id, removed, by: removed ? top : null, display: display[i] };
    }),
  };
}

// ---------------------------------------------------------------- kept ranges

const KIND_RANK = { manual: 3, redundant: 4, retake: 2, false_start: 2, meta: 2, filler: 2, hard_filler: 2, alt_hook: 2, audio_event: 1, silence: 0 }; // L412-L413

// edge: L141-L149
function edge(left, right, pad, fromLeft) {
  const gap = right - left;
  if (gap <= 0) return fromLeft ? right : left;
  if (gap >= 2 * pad) return fromLeft ? left + pad : right - pad;
  return left + gap / 2;
}

// snap_and_pad: L160-L178
function snapAndPad(cuts, kept, pad) {
  return cuts.map((c) => {
    let prevEnd = 0;
    for (const w of kept) if (w.end <= c.start + 1e-6 && w.end > prevEnd) prevEnd = w.end;
    let nxt = null;
    for (const w of kept) if (w.start >= c.end - 1e-6 && (!nxt || w.start < nxt.start)) nxt = w;
    const padR = nxt && nxt.end - nxt.start < CP.SHORT_WORD_S ? Math.max(pad, CP.RUNWAY_S) : pad;
    let a = edge(prevEnd, c.start, pad, true);
    let b = nxt ? edge(c.end, nxt.start, padR, false) : c.end;
    if (b <= a) { a = c.start; b = c.end; }
    if (!nxt) b = Infinity; // a removal that runs to the take's end leaves no stub
    return { ...c, start: a, end: b, _next: nxt ? nxt.start : null };
  });
}

// merge: L416-L431
function merge(cuts) {
  const out = [];
  for (const c of [...cuts].sort((x, y) => x.start - y.start)) {
    const last = out[out.length - 1];
    if (last && c.start <= last.end + 1e-6) {
      last.end = Math.max(last.end, c.end);
      if ((KIND_RANK[c.kind] ?? 2) > (KIND_RANK[last.kind] ?? 2)) last.kind = c.kind;
      if (c._next != null) last._next = Math.max(last._next || 0, c._next);
      last.ids = [...new Set([...last.ids, ...c.ids])];
    } else out.push({ ...c, ids: [...c.ids] });
  }
  return out;
}

// enforce_splice_budget: L457-L479 (no audio levels here: the word labels are the only neighbours)
function enforceBudget(cuts, kept, budget) {
  budget = Math.max(budget, CP.SPLICE_LEFT_MIN_S);
  for (const c of cuts) {
    let prevEnd = null;
    for (const w of kept) if (w.start < c.start) { const e = Math.min(w.end, c.start); prevEnd = prevEnd === null ? e : Math.max(prevEnd, e); }
    let nxt = null;
    for (const w of kept) if (w.end > c.end && (!nxt || w.start < nxt.start)) nxt = w;
    if (prevEnd === null || !nxt) continue;
    c._next = nxt.start;
    const left = Math.max(0, c.start - prevEnd), right = Math.max(0, nxt.start - c.end);
    if (left + right <= budget + 1e-6) continue;
    const short = nxt.end - nxt.start < CP.SHORT_WORD_S;
    let wantRight = Math.max(0, Math.min(right, short ? budget - CP.SPLICE_LEFT_MIN_S : budget / 2));
    let wantLeft = Math.max(CP.SPLICE_LEFT_MIN_S, budget - wantRight);
    if (wantLeft > left) { wantLeft = left; wantRight = Math.max(0, budget - left); }
    c.start = prevEnd + wantLeft;
    c.end = nxt.start - Math.min(right, wantRight);
    c._next = nxt.start;
  }
  return cuts;
}

// kept_frames: L498-L522. words = kept words; a span under MIN_KEPT_S stays only when one of them starts in it.
function keptFrames(cuts, fps, total, words) {
  const kept = []; let cursor = 0;
  for (const c of cuts) {
    const a0 = Math.max(0, Math.min(total, Math.floor(c.start * fps + 1e-9)));
    let b = c.end === Infinity ? total : Math.max(0, Math.min(total, Math.ceil(c.end * fps - 1e-9)));
    if (c._next != null) b = Math.min(b, Math.max(a0 + 1, Math.floor(c._next * fps + 1e-9)));
    const a = Math.max(a0, cursor);
    if (b <= a) continue;
    if (a - cursor >= CP.MIN_KEPT_S * fps || words.some((w) => cursor <= w.start * fps && w.start * fps < a)) kept.push([cursor, a]);
    cursor = b;
  }
  if (cursor < total) kept.push([cursor, total]);
  return kept;
}

// is_kept: L619-L626. A word plays if >= 0.1 s (or half of it) lies in kept segments.
function isKept(w, segs) {
  if (w.end <= w.start) return segs.some((s) => s.in <= w.start && w.start <= s.out);
  const need = Math.min(0.1, (w.end - w.start) / 2);
  return segs.reduce((n, s) => n + Math.max(0, Math.min(w.end, s.out) - Math.max(w.start, s.in)), 0) >= need - 1e-9;
}

export function keptRanges(doc, opts = {}) {
  const pad = opts.pad ?? CP.PAD_S, maxPause = opts.maxPause ?? CP.MAX_PAUSE_S, fps = opts.fps ?? (doc.source?.fps || 30);
  const st = cutState(doc), notes = [];
  const W = doc.words.map((w, i) => ({ ...w, removed: st.words[i].removed, by: st.words[i].by }));
  const last = W.length ? Math.max(...W.map((w) => w.end)) : 0;
  const duration = opts.duration ?? (doc.source?.duration || last + CP.END_TAIL_S);
  const total = Math.round(duration * fps);
  const kind = new Map(doc.candidates.map((c) => [c.id, c.kind]));
  const keptW = W.filter((w) => !w.removed);
  const gapKeep = r3((2 / 3) * maxPause);

  // 1. removed-word runs -> model cuts
  const model = [];
  for (let i = 0; i < W.length; i++) {
    if (!W[i].removed) continue;
    let j = i; while (j + 1 < W.length && W[j + 1].removed) j++;
    const ids = new Set(); let k = "silence";
    for (let m = i; m <= j; m++) { const by = W[m].by; ids.add(by); const kk = by === "manual" ? "manual" : kind.get(by) || "retake"; if ((KIND_RANK[kk] ?? 2) >= (KIND_RANK[k] ?? 2)) k = kk; }
    model.push({ start: W[i].start, end: W[j].end, kind: k, ids: [...ids] });
    i = j;
  }
  const cuts = snapAndPad(model, keptW, pad);

  // 2. silence on word gaps only (silence_cuts L380-L393, no audio). Accepted long_pause candidates force a tighten.
  const forced = new Set();
  for (const c of doc.candidates) if (c.kind === "long_pause" && st.candidates[c.id] === "accepted" && c.from && c.to) forced.add(wordIndex(doc, c.from));
  for (let i = 0; i + 1 < W.length; i++) {
    if (W[i].removed || W[i + 1].removed) continue;
    const a = W[i].end, b = W[i + 1].start, gap = b - a;
    if (!(gap > maxPause || (forced.has(i) && gap > gapKeep))) continue;
    const nxt = W[i + 1];
    const keep = nxt.end - nxt.start < CP.SHORT_WORD_S ? Math.max(gapKeep, CP.RUNWAY_S) : gapKeep;
    const s = a + keep / 2, e = b - keep / 2;
    if (e - s >= 0.04) cuts.push({ start: s, end: e, kind: "silence", ids: [], _next: null });
  }
  // 3. lead and tail (lead_trail_cuts L396-L408; the tail keeps END_TAIL_S so the clip does not stop mid-release)
  if (!keptW.length) notes.push("every word is removed: nothing is kept");
  else {
    const first = keptW[0].start, endAt = Math.max(...keptW.map((w) => w.end));
    if (first > gapKeep) cuts.push({ start: 0, end: first - gapKeep, kind: "silence", ids: [], _next: null });
    const tail = Math.max(gapKeep, CP.END_TAIL_S);
    if (duration - endAt > tail) cuts.push({ start: endAt + tail, end: Infinity, kind: "silence", ids: [], _next: null });
  }
  if (!keptW.length) return { segments: [], cuts: [], notes };

  const merged = enforceBudget(merge(cuts), keptW, maxPause).sort((a, b) => a.start - b.start);
  const frames = keptFrames(merged, fps, total, keptW);
  const segments = frames.map(([a, b]) => ({ in: r6(a / fps), out: r6(b / fps), from: null, to: null }));
  const outCuts = merged.map((c) => ({ start: r6(c.start), end: c.end === Infinity ? r6(duration) : r6(c.end), kind: c.kind, ids: c.ids }));
  // from/to = first and last kept word that plays in each segment
  const playing = keptW.filter((w) => isKept(w, segments));
  for (const w of playing) {
    const s = segments[bestSeg(w, segments)];
    if (!s.from) s.from = w.id;
    s.to = w.id;
  }
  const dropped = keptW.length - playing.length;
  if (dropped) notes.push(`${dropped} kept word(s) fall mostly inside a cut and will not play`);
  notes.push(`${segments.length} segment(s), ${r3(segments.reduce((n, s) => n + s.out - s.in, 0))}s kept of ${r3(duration)}s at ${fps}fps`);
  return { segments, cuts: outCuts, notes };
}

function bestSeg(w, segs) {
  let bi = 0, bv = -Infinity;
  segs.forEach((s, k) => { const v = Math.min(w.end, s.out) - Math.max(w.start, s.in); if (v > bv) { bv = v; bi = k; } });
  return bi;
}

// ---------------------------------------------------------------- time mapping

// retime: L629-L644. Kept words onto the edited timeline, clipped to the segment they play in.
export function editedMap(doc, segments) {
  const st = cutState(doc), offs = []; let t = 0;
  for (const s of segments) { offs.push(t); t += s.out - s.in; }
  const out = [];
  doc.words.forEach((w, i) => {
    if (st.words[i].removed || !segments.length || !isKept(w, segments)) return;
    const k = bestSeg(w, segments), s = segments[k];
    const a = Math.max(w.start, s.in), b = Math.min(w.end, s.out);
    out.push({ id: w.id, text: st.words[i].display, src_start: r3(a), src_end: r3(b), out_start: r3(a - s.in + offs[k]), out_end: r3(b - s.in + offs[k]), seg: k });
  });
  return out.sort((x, y) => x.out_start - y.out_start);
}

// null = the word was cut: the caller surfaces "unresolved".
export function resolveWord(map, id) { return map.find((e) => e.id === id) || null; }

// Anchors ({id} | {word} | {from,to}) onto the edited timeline. A word-anchored note or overlay whose words were all cut
// is marked unresolved (never dropped, never guessed).
export function remapAnchors(doc, map, anchors) {
  const ix = new Map(doc.words.map((w) => [w.id, w.i]));
  return anchors.map((a) => {
    const id = a.id || a.word;
    let hits;
    if (a.from && a.to) {
      const lo = ix.get(a.from), hi = ix.get(a.to);
      hits = map.filter((e) => { const i = ix.get(e.id); return i >= lo && i <= hi; });
    } else { const e = id ? resolveWord(map, id) : null; hits = e ? [e] : []; }
    if (!hits.length) return { ...a, resolved: false, status: "unresolved", out_start: null, out_end: null, reason: "the words this is attached to were cut" };
    return { ...a, resolved: true, status: "resolved", out_start: Math.min(...hits.map((h) => h.out_start)), out_end: Math.max(...hits.map((h) => h.out_end)) };
  });
}

export function sourceToEdited(segments, t) {
  let off = 0;
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k];
    if (t < s.in) return { out: r6(off), in_cut: true, seg: k }; // inside a cut: snaps to the next kept moment
    if (t <= s.out) return { out: r6(off + t - s.in), in_cut: false, seg: k };
    off += s.out - s.in;
  }
  return { out: r6(off), in_cut: true, seg: segments.length - 1 };
}

export function editedToSource(segments, t) {
  let off = 0;
  for (const s of segments) {
    const d = s.out - s.in;
    if (t <= off + d + 1e-9) return r6(s.in + Math.max(0, t - off));
    off += d;
  }
  return segments.length ? segments[segments.length - 1].out : 0;
}

// ---------------------------------------------------------------- splice check (audio)

// window_rms_db: build_timeline.py L200-L210 (16 kHz mono s16le, 20 ms windows).
function windowRmsDb(sourceFile) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-v", "error", "-i", sourceFile, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = []; let err = "";
    p.stdout.on("data", (d) => chunks.push(d));
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code) return reject(new Error(`ffmpeg failed: ${err.trim()}`));
      const buf = Buffer.concat(chunks), n = Math.floor(16000 * CP.RMS_WIN_S), total = Math.floor(buf.length / 2), out = [];
      for (let i = 0; i + n < total; i += n) {
        let m = 0;
        for (let k = 0; k < n; k++) { const v = buf.readInt16LE((i + k) * 2); m += v * v; }
        m /= n;
        out.push(m > 0 ? 10 * Math.log10(m / (32768 * 32768)) : -120);
      }
      resolve(out);
    });
  });
}

// derive_noise_db: L312-L331, including the music-bed branch.
export function deriveNoiseDb(lvl) {
  if (lvl.length < 50) return { noise: null, diag: { reason: `only ${lvl.length} audio windows, too short to measure` } };
  const hist = new Map();
  for (const v of lvl) { const b = Math.floor(v); hist.set(b, (hist.get(b) || 0) + 1); }
  const srt = [...lvl].sort((a, b) => a - b);
  const speech = Math.floor(srt[Math.min(srt.length - 1, Math.floor(0.99 * srt.length))]);
  let floor = null;
  for (const [b, n] of hist) if (b < speech - FLOOR_SEARCH_DB && (floor === null || n > hist.get(floor))) floor = b;
  if (floor === null) return { noise: null, diag: { reason: `no floor below speech (${speech} dB)`, speech } };
  const sep = speech - floor, diag = { speech, floor, sep };
  if (sep < CP.MIN_SEPARATION_DB) {
    const bed = srt[Math.floor(BED_PERCENTILE * (srt.length - 1))];
    diag.bed = Math.round(bed * 10) / 10; diag.noise = Math.round((bed + (speech - bed) / 3) * 10) / 10;
    return { noise: diag.noise, diag };
  }
  diag.noise = Math.max(speech - CP.SPEECH_OFFSET_DB, floor + CP.FLOOR_HEADROOM_DB);
  return { noise: diag.noise, diag };
}

// in_speech: L530-L534; edges: splice_check.py L27-L29; walk-to-quiet: build_timeline.py fix_splices L536-L574 (suggest only).
export async function spliceWarnings(sourceFile, segments, { reach = CP.SPLICE_REACH_S, fps = 30, duration = null } = {}) {
  const lvl = await windowRmsDb(sourceFile);
  const { noise, diag } = deriveNoiseDb(lvl);
  if (noise === null) return [{ check: "splice-not-checked", severity: "warning", at: null, edge: null, message: `splices not checked: ${diag.reason}`, fix: null }];
  const W = CP.RMS_WIN_S, total = duration ?? lvl.length * W;
  const speech = (t) => { const w = Math.floor(t / W); return w > 0 && w < lvl.length && Math.min(lvl[w - 1], lvl[w]) > noise + CP.LOUD_OVER_DB; };
  const quiet = (t) => { const w = Math.floor(t / W); const sl = lvl.slice(Math.max(0, w - 1), w + 1); return Math.min(...(sl.length ? sl : [0])) <= noise; };
  const out = [], step = 1 / fps;
  segments.forEach((s, k) => {
    for (const side of ["in", "out"]) {
      const t = side === "in" ? s.in : s.out;
      if (t <= 0 || t >= total - 1e-6 || !speech(t)) continue;
      let fix = null;
      if (side === "in") { const lo = Math.max(k ? segments[k - 1].out : 0, t - reach); for (let g = t; g >= lo - 1e-9; g -= step) if (quiet(g)) { fix = g; break; } }
      else { const hi = Math.min(k + 1 < segments.length ? segments[k + 1].in : total, t + reach); for (let g = t; g <= hi + 1e-9; g += step) if (quiet(g)) { fix = g; break; } }
      out.push({
        check: "splice-in-speech", severity: "warning", at: r3(t), edge: side,
        message: `the cut ${side === "in" ? "starts" : "ends"} at ${r3(t)}s with speech on both sides of the join, so it may click or clip a word`,
        fix: fix === null ? `no quiet frame within ${reach}s: listen to this join` : `move the ${side === "in" ? "start" : "end"} to ${r3(fix)}s`,
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------- source check and save

// fingerprintFile / sha1OfFile each take either a path (hashed here with lib/fingerprint.mjs) or a function returning the value.
// sourceFile / transcriptFile are accepted as clearer aliases for the two paths.
export function checkSource(doc, opts = {}) {
  const val = (x, fn) => (typeof x === "function" ? x() : typeof x === "string" ? fn(x) : null);
  const problems = [];
  const src = val(opts.sourceFile ?? opts.fingerprintFile, fingerprintFile);
  const tr = val(opts.transcriptFile ?? opts.sha1OfFile, sha1OfFile);
  if (src !== null && doc.source?.fingerprint && src !== doc.source.fingerprint) problems.push("the source changed since the cut was made");
  if (tr !== null && doc.transcript?.sha1 && tr !== doc.transcript.sha1) {
    problems.push(`the transcript changed; re-run footage.mjs retakes --clip ${doc.clip} --rebase (starts a new doc and keeps this one as ${doc.clip}.cut.r${doc.head}.json)`);
  }
  return { ok: problems.length === 0, problems };
}

export function saveCutDoc(file, doc) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, file);
}
