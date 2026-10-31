// "Generate long, then edit to picture": cut a generated music take (ACE-Step makes no exact timings) onto the film's arc, in Node + ffmpeg only (no Python).
//   editToPicture({ file, arc, film, bpm, out }) -> { out, plan, before/after numbers, checks }
// 1. map the take: bars + downbeats + a per-bar energy curve + sections (analyzeTrack) and the hits (music-map makeMap)
// 2. pick, per arc segment, the source bars that fit: the drop = the bar with the biggest lift into a loud body (and the hardest attack), the intro = the quietest early bars,
//    the break = a natural quiet run (else a made one), the button = the take's own ending (else its strongest downbeat with a short tail)
// 3. splice on downbeats: every piece starts on a source downbeat, the incoming audio is pre-rolled and crossfaded (equal power, 40 ms) so the downbeat itself is 100% the new piece;
//    the drop's attack (not the grid estimate) is placed on drop_at; no tempo change unless the take is within 6% of the BPM asked for (then ffmpeg rubberband / atempo)
// 4. shape what the take did not do: a gain + low-pass envelope (sparse intro, a thinning before the drop, a filter-sweep dip in the break: never silence, a decay on a made button)
// 5. measure: arcFit, the drop's landing error in ms, clicks at the splices.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { analyzeTrack, arcFit, r1, r3 } from "./audio.mjs";
import { makeMap } from "../music-map.mjs";
import { transcribeDTW, toWav16, listModels, findWhisper, norm, matchWords } from "./lyrics.mjs";

const SRATE = 48000, XF = 0.04;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function readStereo(file, sr = SRATE) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-vn", "-f", "f32le", "-ac", "2", "-ar", String(sr), "-"], { maxBuffer: 1 << 30 });
  const n = Math.floor(buf.length / 8), f = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + n * 8)), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return { L, R, sr, n };
}
export function writeWav(file, L, R, sr = SRATE) {
  const n = L.length, b = Buffer.alloc(44 + n * 6);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 6, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 6, 28); b.writeUInt16LE(6, 32); b.writeUInt16LE(24, 34); b.write("data", 36); b.writeUInt32LE(n * 6, 40);
  const w = (v, o) => { const q = Math.round(clamp(v, -1, 1) * 8388607); b.writeIntLE(q, o, 3); };
  for (let i = 0; i < n; i++) { w(L[i], 44 + i * 6); w(R[i], 47 + i * 6); }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, b);
}

// a time-stretch within 6%: ffmpeg's rubberband when it is built in, else atempo (phase-vocoder-free WSOLA; fine under 6%)
export function stretchTo(file, ratio, out) {
  const has = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout || "";
  const af = /\brubberband\b/.test(has) ? `rubberband=tempo=${ratio.toFixed(5)}:pitch=1` : `atempo=${ratio.toFixed(5)}`;
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-filter:a", af, out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("time-stretch failed: " + String(r.stderr).slice(0, 160));
  return { out, filter: af.split("=")[0] };
}

// ---------------------------------------------------------------- 1. the map of a take
export function mapCandidate(file) {
  const A = analyzeTrack(file, { quick: true });
  let hits = [];
  try { hits = makeMap(file).hits; } catch {}
  return { A, hits, bars: A.bars, bar_db: A.bar_db, sections: A.sections, bpm: A.bpm, bar_s: A.bar_s, downbeat_confidence: A.downbeat_confidence };
}

// ---------------------------------------------------------------- shaping: gain (dB) and a sweeping low-pass
const interp = (pts, t, def, logF = false) => {
  if (!pts.length) return def;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i], k = b > a ? (t - a) / (b - a) : 1; return logF ? Math.exp(Math.log(va) + k * (Math.log(vb) - Math.log(va))) : va + k * (vb - va); }
  return pts[pts.length - 1][1];
};
const tidy = (pts) => { pts.sort((a, b) => a[0] - b[0]); for (let i = 1; i < pts.length; i++) if (pts[i][0] <= pts[i - 1][0]) pts[i][0] = pts[i - 1][0] + 0.001; return pts; };
function lowpassSweep(x, sr, pts) {
  if (!pts.length) return x;
  const y = new Float32Array(x.length), BL = 128;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let s = 0; s < x.length; s += BL) {
    const fc = interp(pts, s / sr, 19500, true), e = Math.min(x.length, s + BL);
    if (fc >= 19400) { for (let i = s; i < e; i++) { y[i] = x[i]; } x1 = x[e - 1]; x2 = e - 2 >= 0 ? x[e - 2] : 0; y1 = x[e - 1]; y2 = e - 2 >= 0 ? x[e - 2] : 0; continue; }
    const w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * 0.707), c = Math.cos(w0), a0 = 1 + al;
    const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
    for (let i = s; i < e; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  }
  return y;
}

// an attack = the level over the next 25 ms against the 40 ms before it (1 ms steps). The strong ones are within 3 dB of the biggest rise near t and (floorDb) reach the
// take's loud level (a rise out of a quiet noise floor is not a drop); the nearest strong one to t is "the" attack. The same definition lands the drop and checks it.
const cumOf = (x) => { const c = new Float64Array(x.length + 1); for (let i = 0; i < x.length; i++) c[i + 1] = c[i] + x[i] * x[i]; return c; };
function strongAttack(cum, n, sr, t, win, floorDb = -1e9) {
  const w1 = Math.round(0.025 * sr), w0 = Math.round(0.04 * sr), step = Math.max(1, Math.round(sr / 1000));
  const e = (p, q) => (cum[Math.min(n, q)] - cum[Math.max(0, p)]) / Math.max(1, Math.min(n, q) - Math.max(0, p));
  const r = [], ts = [], post = [];
  for (let s = Math.round((t - win) * sr); s <= Math.round((t + win) * sr); s += step) { if (s < w0 || s + w1 > n) continue; const ea = e(s, s + w1); r.push(10 * Math.log10((ea + 1e-10) / (e(s - w0, s) + 1e-10))); post.push(10 * Math.log10(ea + 1e-10)); ts.push(s / sr); }
  let mx = -1e9; for (let i = 0; i < r.length; i++) if (post[i] >= floorDb && r[i] > mx) mx = r[i];
  let best = null;
  for (let i = 1; i < r.length - 1; i++) if (post[i] >= floorDb && r[i] >= mx - 3 && r[i] >= r[i - 1] && r[i] >= r[i + 1] && (best == null || Math.abs(ts[i] - t) < Math.abs(ts[best] - t))) best = i;
  return best == null ? { t, rise: 0 } : { t: ts[best], rise: r1(r[best]) };
}
const floorOf = (x) => { const v = []; for (let st = 0; st + 1102 <= x.length; st += 1102) { let z = 0; for (let k = 0; k < 1102; k++) z += x[st + k] * x[st + k]; v.push(10 * Math.log10(z / 1102 + 1e-12)); } v.sort((p, q) => p - q); return v[Math.floor(v.length * 0.7)] - 3; };

// ---------------------------------------------------------------- 2-4. the edit
// where the lyric words are sung in a take (whisper.cpp + DTW on the take): every transcribed word {text, start, end}. [] when there is no whisper or no singing.
// from > 0 transcribes only the audio after that time and shifts the words back (whisper reads a long instrumental start as "(upbeat music)" for the whole 30 s window: the edited film opens with 8-10 s of intro)
export function transcribeTake(file, work, lang = "en", from = 0) {
  try {
    const bin = findWhisper(), model = listModels(lang)[0];
    if (!bin || !model) return [];
    fs.mkdirSync(path.dirname(work), { recursive: true });
    const wav = work + ".16k.wav"; toWav16(file, wav, from > 0 ? `atrim=start=${from},asetpts=PTS-STARTPTS` : undefined);
    fs.rmSync(path.dirname(work) + "/w_" + path.basename(work).replace(/\W/g, "_") + ".json", { force: true });
    const tr = transcribeDTW(wav, { model, lang, workDir: path.dirname(work), tag: path.basename(work).replace(/\W/g, "_"), bin });
    fs.rmSync(wav, { force: true });
    return from > 0 ? tr.map((w) => ({ ...w, start: w.start + from, end: w.end + from })) : tr;
  } catch { return []; }
}
export function sungWords(file, lyricsText, work) {
  if (!lyricsText) return [];
  const vocab = new Set(String(lyricsText).split(/\s+/).map(norm).filter((w) => w.length >= 3));
  return transcribeTake(file, work).filter((w) => String(w.text).split(/\s+/).some((x) => vocab.has(norm(x)))).map((w) => w.end);
}

// ---- intelligibility: how much of the written lyric the take really sings, and where its hook line is
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1) || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 3);
// every place in the transcript that sings the phrase (>= half its words, in order, within a short window): [{onset, end, hit, total}]. onset = the first matched word's start (a word that follows a gap starts about 0.35 s before its end).
export function findPhrase(tr, phrase) {
  const pw = String(phrase).split(/\s+/).map(norm).filter(Boolean), out = [];
  if (!pw.length || !tr.length) return out;
  const tw = tr.map((w) => norm(w.text));
  for (let i = 0; i < tr.length; i++) {
    let k = 0, first = -1, last = -1, hit = 0;
    for (let j = i; j < Math.min(tr.length, i + pw.length + 3) && k < pw.length; j++) {
      const m = [0, 1, 2].find((q) => k + q < pw.length && same(tw[j], pw[k + q]));
      if (m != null) { if (first < 0) first = j; last = j; hit++; k += m + 1; }
    }
    if (first === i && hit >= Math.max(2, Math.ceil(pw.length * 0.4)) && true) {
      const w = tr[first], onset = r3(Math.max(w.start, w.end - 0.4)), prev = out[out.length - 1];
      if (prev && onset - prev.onset < 1.2) { if (hit > prev.hit) out[out.length - 1] = { onset, end: r3(tr[last].end), hit, total: pw.length }; continue; }
      out.push({ onset, end: r3(tr[last].end), hit, total: pw.length });
    }
  }
  return out;
}
// the sung-lyrics score of a file: word coverage (a lyric word counts at confidence >= 0.5: half or more of its letters found, in order, in the transcript), the hook phrase's occurrences, one number 0-100
export function singScore(file, lyricsText, { hook = "", work, tr = null, lang = "en", from = 0 } = {}) {
  const lines = String(lyricsText || "").split(/\n+/).map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  const T = tr || transcribeTake(file, work || file.replace(/\.[^.]+$/, "") + ".sing", lang, from);
  if (!words.length) return null;
  if (!T.length) return { words: words.length, matched: 0, coverage: 0, confidence: 0, hook: [], hook_best: 0, score: 0, transcript_words: 0 };
  const m = matchWords(words, T);
  const matched = m.filter((x) => x && x.frac >= 0.5).length, conf = m.reduce((a, x) => a + (x ? x.frac : 0), 0) / words.length;
  const hookText = hook || lines.slice(Math.ceil(lines.length / 2)).join(" ");
  const hk = findPhrase(T, hookText);
  // how much of the whole chorus is sung (from the global alignment, so a take that sings only its last words still counts), and the first line's own occurrences (for the onset)
  const nHook = lines.slice(Math.ceil(lines.length / 2)).join(" ").split(/\s+/).filter(Boolean).length, mh = m.slice(words.length - nHook);
  const hookBest = nHook ? mh.filter((x) => x && x.frac >= 0.5).length / nHook : 0;
  const coverage = matched / words.length;
  return { words: words.length, matched, coverage: r3(coverage), confidence: r3(conf), hook: hk, hook_best: r3(hookBest), transcript_words: T.length, score: Math.round(100 * (0.55 * coverage + 0.15 * conf + 0.3 * hookBest)) };
}
// a take's tempo against the one asked: ok within 6% (a take that far off cannot be stretched onto the grid without sounding it)
// strict: 60 or 240 for 120 asked is NOT accepted (bars are then 4 s or 1 s long and the splice grid is the wrong size: the hook missed its bar by 1.2 s in the pilot); the field `octave` only says which way it is off
export const tempoCheck = (takeBpm, askedBpm) => {
  if (!askedBpm || !takeBpm) return { take_bpm: r1(takeBpm || 0), asked_bpm: askedBpm, off_pct: 0, ok: true };
  const off = Math.abs(askedBpm / takeBpm - 1);
  return { take_bpm: r1(takeBpm), asked_bpm: askedBpm, off_pct: r1(off * 100), octave: [0.5, 2].some((k) => Math.abs(askedBpm / (takeBpm * k) - 1) <= 0.06), ok: off <= 0.06 };
};

// hook = the sung line the drop should open on (default: the first line of the lyric's second half, the chorus the prompt builder writes)
export function editToPicture({ file, arc, film, bpm = null, out, lyrics = "", hook = "", log = () => {}, keepWork = false }) {
  const t0 = Date.now();
  const F = Number(film), D = arc.drop_at, B = arc.button_at;
  const I = Math.max(1, Math.min(arc.intro_until ?? D * 0.7, D));
  const brk = Array.isArray(arc.break) && arc.break.length === 2 ? [Number(arc.break[0]), Number(arc.break[1])] : null;
  const work = out.replace(/\.[^.]+$/, "");
  const res = { source: file, out, notes: [] };

  // tempo: only a take within 6% of the BPM asked for is stretched onto it (never more: it would sound it)
  let src = file, A = analyzeTrack(file, { quick: true });
  res.source_bpm = A.bpm;
  if (bpm && A.bpm) {
    const ratio = bpm / A.bpm, off = Math.abs(ratio - 1);
    if (off > 0.004 && off <= 0.06) { const st = stretchTo(file, ratio, work + ".stretch.wav"); src = st.out; A = analyzeTrack(src, { quick: true }); res.stretched = { from_bpm: res.source_bpm, to_bpm: A.bpm, ratio: r3(ratio), filter: st.filter }; }
    else if (off > 0.06) res.notes.push(`the take is ${r1(A.bpm)} BPM against ${bpm} asked (${r1(off * 100)}% off, over the 6% limit): not stretched; the edit follows the take's own bars`);
  }
  const y = A._y, bars = A.bars, nb = bars.length, bdb = A.bar_db;
  if (nb < 8) throw new Error(`only ${nb} bars found in ${path.basename(file)}: not enough to edit`);
  const barLen = (i) => (i + 1 < nb ? bars[i + 1] - bars[i] : A.bar_s);
  const barS = mean(bars.slice(1).map((b, i) => b - bars[i]));
  const top = Math.max(...bdb);
  const sorted = [...bdb].sort((a, b) => a - b), loudRef = sorted[Math.floor(sorted.length * 0.85)];
  // a downbeat's true attack (a splice must keep it; the grid estimate can be 20-40 ms off)
  const anchorCache = new Map();
  const cumY = cumOf(y), floorY = floorOf(y), loudAttack = (_y, _p, t, win) => strongAttack(cumY, y.length, 22050, t, win, floorY);
  const p90 = 0;
  const anchor = (i) => { i = clamp(i, 0, nb - 1); if (!anchorCache.has(i)) { const tr = loudAttack(y, p90, bars[i], 0.06); anchorCache.set(i, tr.rise >= 4 ? { t: tr.t, rise: tr.rise } : { t: bars[i], rise: tr.rise }); } return anchorCache.get(i); };
  const endIdx = A.ending && A.ending.natural && A.ending.hit != null ? bars.findIndex((b) => Math.abs(b - A.ending.hit) < 0.25) : -1;
  const lastUsable = Math.min(A.duration, A.last_audible + 0.05);

  // pieces a run is made of: {label, out0, src0, out1, bar}
  const pieces = [];
  const run = (label, startOut, startBar, outEnd, { regionEnd = nb, loopBack = 0, off = 0 } = {}) => {
    let k = startBar, cur = startOut, guard = 0;
    while (cur < outEnd - 1e-6 && guard++ < 40) {
      const end = regionEnd >= nb ? lastUsable : bars[regionEnd] + off;
      const s0 = bars[k] + off, len = Math.max(0.05, end - s0), o1 = Math.min(outEnd, cur + len);
      pieces.push({ label, out0: cur, src0: s0, out1: o1, bar: k });
      if (o1 >= outEnd - 1e-6 || !loopBack) break;
      k = Math.max(0, regionEnd - loopBack); cur = o1;
    }
  };

  // --- the drop: the bar with the biggest lift into a loud, long body
  const bodyS = Math.max(2, (brk ? brk[0] : B - 4) - D), needBody = Math.max(2, Math.ceil(bodyS / barS));
  const lyricLines = String(lyrics || "").split(/\n+/).map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
  const hookLine = hook || lyricLines.slice(Math.ceil(lyricLines.length / 2)).join(" ") || lyricLines[0] || "";
  const vocab = new Set(lyricLines.join(" ").split(/\s+/).map(norm).filter((w) => w.length >= 3));
  const trSrc = lyrics ? transcribeTake(src, work + ".vox") : [];
  const sung = trSrc.filter((w) => String(w.text).split(/\s+/).some((x) => vocab.has(norm(x)))).map((w) => w.end);
  const voxIn = (a, b) => sung.filter((t) => t >= a && t < b).length;
  res.sung_words = sung.length;
  // the sung hook line's onsets in the take: the drop is cut on the bar that starts it, so the line is sung on drop_at (a hook that lands late or in the middle of a bar is reported, not hidden)
  const hookOn = hookLine && trSrc.length ? findPhrase(trSrc, hookLine).filter((h) => h.hit >= Math.max(2, Math.ceil(h.total * 0.4))) : [];
  const hookBars = new Map();
  for (const h of hookOn) { let k = 0; for (let i = 0; i < nb; i++) if (Math.abs(bars[i] - h.onset) < Math.abs(bars[k] - h.onset)) k = i; if (Math.abs(h.onset - bars[k]) <= 0.5 * barS && !hookBars.has(k)) hookBars.set(k, h.onset); } // a sung line starts on a downbeat: where the grid estimate is off by a fraction of a bar (0.7 s was seen), the hook's own onset sets the phase
  res.hook_in_take = hookOn.map((h) => ({ onset: h.onset, hit: h.hit + "/" + h.total, bar: [...hookBars.entries()].find(([, v]) => v === h.onset)?.[0] ?? null }));
  const cands = [];
  for (let d = 1; d < nb - 1; d++) {
    if (endIdx >= 0 && d >= endIdx) continue;
    if (hookBars.size && !hookBars.has(d)) continue;
    const lift = mean(bdb.slice(d, d + 2)) - mean(bdb.slice(Math.max(0, d - 2), d));
    const body = mean(bdb.slice(d, Math.min(nb, d + needBody)));
    const room = Math.min(needBody, nb - d) / needBody;
    const hit = loudAttack(y, p90, bars[d], 0.45 * barS).rise;
    const score = clamp(lift, -3, 14) - Math.max(0, D / barS - d) * 1.0 * 1.0 + (body - top) * 0.9 + clamp(hit, 0, 14) * 0.3 - (room < 1 ? 6 * (1 - room) : 0) + (sung.length ? 4 * Math.min(3, voxIn(bars[d] - 0.3, bars[Math.min(nb - 1, d + 3)])) : 0) - (d < 2 ? 2 : 0) ;
    cands.push({ d, lift: r1(lift), body: r1(body), hit: r1(hit), score: r1(score) });
  }
  if (!cands.length) throw new Error("no drop candidate: the take has no bar with room for the body");
  cands.sort((a, b) => b.score - a.score);
  const d = cands[0].d, bodyLevel = cands[0].body;
  res.drop_candidate = cands[0];
  if (hookBars.has(d)) { res.drop_candidate.hook_onset_in_take = hookBars.get(d); res.drop_candidate.hook_offset_ms = Math.round((hookBars.get(d) - bars[d]) * 1000); } else if (hookOn.length) res.notes.push("the hook is sung in the take but too far from a bar line to cut on"); else if (lyrics) res.notes.push("the hook line was not found in the take: the drop was chosen on energy and sung words only");
  if (sung.length) res.drop_candidate.sung_words_on_drop = voxIn(bars[d] - 0.3, bars[Math.min(nb - 1, d + 3)]);
  // the grid's downbeat can sit a beat off the real attack (a weak kick): the drop's own attack sets the offset every piece of the body uses
  const dT = loudAttack(y, p90, bars[d], 0.45 * barS);
  const gOff = hookBars.has(d) ? hookBars.get(d) - bars[d] : dT.rise >= 6 ? dT.t - bars[d] : anchor(d).t - bars[d];
  res.drop_candidate.attack_offset_ms = Math.round(gOff * 1000);
  if (hookBars.has(d)) res.drop_candidate.phase_from = "hook onset";
  // loud region the body may play (and loop inside) from the drop
  let re = d + 1; while (re < nb && bdb[re] >= bodyLevel - 5 && (endIdx < 0 || re < endIdx)) re++;
  const region = re - d;
  const loopBack = region >= 8 ? 4 * Math.floor(region / 4) : region >= 2 ? region : 0;

  // --- the button: the take's own ending, else its hardest loud downbeat with room for a tail
  const tailNeed = Math.max(0.3, F - B);
  let btn;
  if (endIdx >= 0 && A.ending.hit != null) { btn = { idx: endIdx, natural: true, t: A.ending.hit }; }
  else {
    let best = null;
    for (let i = 4; i < nb; i++) { if (bars[i] + tailNeed > A.duration - 0.05) break; const s = anchor(i).rise + (bdb[i] - top) * 0.6; if (bdb[i] >= loudRef - 3 && (!best || s > best.s)) best = { s, idx: i }; }
    if (!best) best = { s: 0, idx: Math.min(nb - 1, Math.max(4, d + 4)) };
    btn = { idx: best.idx, natural: false, t: anchor(best.idx).t };
  }
  const nLead = Math.max(1, Math.floor(((brk ? B - brk[1] : (B - D) * 0.25) + 1e-6) / barS));
  const sj = Math.max(0, btn.idx - nLead);
  const lead = bars[btn.idx] - bars[sj], btnOff = btn.t - bars[btn.idx];
  const rD = B - lead; // where the final chorus starts so the button hit lands on B
  res.button = { natural: btn.natural, bar: btn.idx, src_t: r3(btn.t), lead_bars: btn.idx - sj };

  // --- the build into the drop, and the intro before it
  let kb = clamp(Math.round((D - I) / barS), 1, d);
  let aOut = D - (bars[d] - bars[d - kb]); // out time of the build's first downbeat
  if (aOut < 0) { kb = Math.max(1, Math.floor(D / barS)); kb = Math.min(kb, d); aOut = D - (bars[d] - bars[d - kb]); }
  if (aOut < 0) aOut = 0;
  if (aOut > 0.25) {
    const m = Math.min(Math.ceil(aOut / barS) + 1, d), last = Math.max(0, d - m);
    let bi = 0, bc = 1e9;
    for (let i0 = 0; i0 <= last; i0++) { const c = mean(bdb.slice(i0, i0 + m)) + 0.3 * i0; if (c < bc) { bc = c; bi = i0; } }
    run("intro", 0, bi, aOut, { regionEnd: bi + m, loopBack: m, off: gOff });
  }
  // --- natural break: a quiet run after the drop's body
  let natBreak = null;
  if (brk) {
    let ci = -1;
    for (let i = d + 2; i < (endIdx >= 0 ? endIdx : nb) - 1; i++) if (bdb[i] <= bodyLevel - 8 && (ci < 0 || bdb[i] < bdb[ci] - 1)) ci = i;
    if (ci > 0) { while (ci - 1 > d + 1 && bdb[ci - 1] <= bodyLevel - 6) ci--; natBreak = ci; }
  }
  // the body runs from the build through the drop (looping inside its loud region); with a made break it simply goes on under the dip
  run("body", aOut, d - kb, natBreak != null ? brk[0] : rD, { regionEnd: re, loopBack, off: gOff });
  if (brk && natBreak != null) { run("break (natural)", brk[0], natBreak, rD, { off: gOff }); res.break = { natural: true, bar: natBreak, depth_db: r1(bodyLevel - bdb[natBreak]) }; }
  else if (brk) res.break = { natural: false, made: "low-pass sweep to 450 Hz plus a level dip, never silence" };
  run("final", rD, sj, F, { off: btnOff });
  // pieces are contiguous in `out`: each run starts where the one before ends
  res.pieces = pieces.map((p) => ({ label: p.label, out0: r3(p.out0), out1: r3(p.out1), src0: r3(p.src0), bar: p.bar }));

  // --- render the assembly
  const S = readStereo(src), N = Math.round(F * SRATE), oL = new Float32Array(N), oR = new Float32Array(N);
  const splices = [];
  pieces.forEach((p, i) => {
    const xin = i === 0 ? 0 : XF, xout = i + 1 < pieces.length ? XF : 0;
    const off = Math.round(p.src0 * SRATE) - Math.round(p.out0 * SRATE);
    const a = Math.max(0, Math.round((p.out0 - xin) * SRATE)), b = i + 1 < pieces.length ? Math.min(N, Math.round(p.out1 * SRATE)) : N;
    if (i > 0) splices.push(p.out0);
    for (let n = a; n < b && n < N; n++) {
      const si = n + off; if (si < 0 || si >= S.n) continue;
      const tt = n / SRATE; let g = 1;
      if (xin && tt < p.out0) g *= Math.sin(((tt - (p.out0 - xin)) / xin) * Math.PI / 2);
      if (xout && tt >= p.out1 - XF) g *= Math.cos(((tt - (p.out1 - XF)) / XF) * Math.PI / 2);
      oL[n] += S.L[si] * g; oR[n] += S.R[si] * g;
    }
  });
  // end of the last piece: a source shorter than the film simply ends (its own tail), faded in the last few ms

  // --- shaping + measurement loop (sparse intro, a lift into the drop, a break that is really quiet)
  const P = { gi: 0, gp: 0, gd: 0, gk: 0, gl: 0, introFilter: false, breakFilter: false };
  const Pay = arc.payoff_at ?? B;
  const tailPts = btn.natural ? [] : [[B + 0.12, 0], [F - 0.05, -38], [F, -70]];
  const tmp = work + ".tmp.wav";
  const shape = () => {
    const gains = [], hz = [];
    const tA = I, tC = Math.max(0.05, D - 0.03), tB = Math.min(tC - 0.01, Math.max(tA + 0.01, D - 1.5));
    gains.push([0, P.gi], [Math.min(tA, tB - 0.01), P.gi], [tB, P.gp], [tC, P.gp], [D, 0]);
    if (P.introFilter) hz.push([0, 2200], [Math.min(tA, tB - 0.01), 2200], [Math.max(tB, D - 0.05), 16000], [D, 19500]);
    if (brk && (P.gd < -0.2 || P.breakFilter)) {
      const L = Math.max(0.5, rD - brk[0]), r1s = Math.min(0.45, 0.25 * L), r2s = Math.min(0.35, 0.2 * L);
      gains.push([brk[0], 0], [brk[0] + r1s, P.gd], [rD - r2s, P.gd], [rD, 0]);
      hz.push([brk[0], 19500], [brk[0] + 0.55 * L, 450], [rD - 0.3, 450], [rD - 0.01, 12000], [rD, 19500]);
    }
    if (P.gl < -0.2 && Pay > D + 1) { // the second before the payoff sits under the payoff, so the payoff lifts (it must still lift after the master's limiter: 3.5 dB asked of a 2 dB need)
      const a0 = Math.max(D + 0.5, Pay - 1.5);
      if (brk && rD > a0 - 0.01) { const k = gains.findIndex((g) => g[0] === rD && g[1] === 0); if (k >= 0) gains[k][1] = P.gl; } else gains.push([a0 - 0.1, 0], [a0, P.gl]);
      gains.push([Pay - 0.04, P.gl], [Pay, 0]);
    }
    if (P.gk < -0.2) gains.push([Pay + 2.0, 0], [Pay + 2.6, P.gk], [Math.max(Pay + 2.7, B - 0.02), P.gk], [Math.max(Pay + 2.8, B), btn.natural ? P.gk : 0]);
    for (const t of tailPts) gains.push(t);
    if (!btn.natural) hz.push([B + 0.1, 19500], [F, 1500]);
    gains.push([F - 0.015, tailPts.length ? -70 : 0], [F, -90]);
    tidy(gains); tidy(hz);
    const gl = new Float32Array(N);
    for (let n = 0; n < N; n++) { const t = n / SRATE; gl[n] = Math.pow(10, interp(gains, t, 0) / 20) * Math.min(1, n / (0.006 * SRATE)); }
    let L = lowpassSweep(oL, SRATE, hz), R = lowpassSweep(oR, SRATE, hz), pk = 0;
    for (let n = 0; n < N; n++) { L[n] *= gl[n]; R[n] *= gl[n]; pk = Math.max(pk, Math.abs(L[n]), Math.abs(R[n])); }
    const k = pk > 0.89 ? 0.89 / pk : 1; if (k < 1) for (let n = 0; n < N; n++) { L[n] *= k; R[n] *= k; }
    return { L, R };
  };
  let M = shape(), AF = null;
  for (let it = 0; it < 7; it++) {
    writeWav(tmp, M.L, M.R);
    AF = arcFit(tmp, arc, F);
    const need = { intro: 8.5, lift: 7, brk: 12 };
    let changed = false;
    if (AF.intro_below_db < need.intro && P.gi > -24) { P.gi = Math.max(-24, P.gi - (need.intro - AF.intro_below_db)); P.introFilter = true; changed = true; }
    if (AF.lift_db < need.lift && P.gp > -18) { P.gp = Math.max(-18, P.gp - (need.lift - AF.lift_db)); changed = true; }
    if (brk && AF.break_below_db < need.brk && P.gd > -34) { P.gd = Math.max(-34, P.gd - (need.brk - AF.break_below_db)); P.breakFilter = true; changed = true; }
    if (AF.payoff_lift_db != null && AF.payoff_lift_db < 3.5 && P.gl > -12) { P.gl = Math.max(-12, P.gl - (3.5 - AF.payoff_lift_db) - 0.5); changed = true; }
    if (AF.loudest_at_s > Pay + 2.5 - 0.4 && P.gk > -9) { P.gk = Math.max(-9, P.gk - 1.5); changed = true; }
    res.iterations = it + 1;
    if (!changed) break;
    M = shape();
  }
  res.shaping = { intro_gain_db: r1(P.gi), pre_drop_gain_db: r1(P.gp), break_dip_db: r1(P.gd), after_payoff_gain_db: r1(P.gk), pre_payoff_gain_db: r1(P.gl), intro_filter: P.introFilter, break_filter: P.breakFilter };
  writeWav(out, M.L, M.R);
  const final = arcFit(out, arc, F);
  fs.rmSync(tmp, { force: true });
  if (!keepWork && res.stretched) fs.rmSync(work + ".stretch.wav", { force: true });
  res.arc_fit = final;

  // --- checks: where the drop's attack landed, clicks at the splices
  const mono = new Float32Array(N); for (let n = 0; n < N; n++) mono[n] = 0.5 * (M.L[n] + M.R[n]);
  res.drop_error_ms = Math.round(attackAt(mono, SRATE, D) * 1000 * 10) / 10;
  res.clicks = clickCheck(mono, SRATE, splices);
  if (lyrics) {
    // the edited file as the film will hear it: word coverage, and where its hook line is sung against drop_at (nearest occurrence)
    // whisper locks onto the first seconds: try a few start points and keep the best reading
    let sg = null;
    for (const fr of [0, D - 1.5, D + 0.5, D + 2.5]) { const g = singScore(out, lyrics, { hook: hookLine, work: work + ".vox2", from: Math.max(0, fr) }); if (g && (!sg || g.score + (g.hook.length ? 15 : 0) > sg.score + (sg.hook.length ? 15 : 0))) sg = g; }
    if (sg) { const near = sg.hook.length ? sg.hook.reduce((a, h) => (Math.abs(h.onset - D) < Math.abs(a.onset - D) ? h : a)) : null; res.sing = { ...sg, hook_error_ms: near ? Math.round((near.onset - D) * 1000) : null, hook_onset: near ? near.onset : null }; }
  }
  res.splices = splices.map(r3);
  res.edit_s = r1((Date.now() - t0) / 1000);
  fs.writeFileSync(work + ".edit.json", JSON.stringify({ ...res, arc, film: F }, null, 2) + "\n");
  return res;
}

// the drop's landing: the nearest strong attack to t, in seconds from t (a drop that lands on t reads ~0; one a beat off reads ~0.5)
export function attackAt(mono, sr, t, win = 0.3) { return strongAttack(cumOf(mono), mono.length, sr, t, win).t - t; }
// a splice click shows as a one-sample jump far above the context's own sample-to-sample movement
export function clickCheck(mono, sr, times) {
  const out = { checked: 0, clicks: 0, worst_ratio: 0 };
  for (const T of times) for (const t of [T - XF, T - XF / 2]) {
    const c = Math.round(t * sr), near = Math.round(0.0015 * sr), ctx = Math.round(0.08 * sr);
    if (c - ctx < 1 || c + ctx >= mono.length) continue;
    let nd = 0; for (let i = c - near; i <= c + near; i++) nd = Math.max(nd, Math.abs(mono[i] - mono[i - 1]));
    const ds = []; for (let i = c - ctx; i <= c + ctx; i++) if (Math.abs(i - c) > near) ds.push(Math.abs(mono[i] - mono[i - 1]));
    ds.sort((a, b) => a - b); const p99 = ds[Math.floor(ds.length * 0.99)] || 1e-6, ratio = nd / Math.max(p99, 1e-4);
    out.checked++; out.worst_ratio = Math.max(out.worst_ratio, r1(ratio));
    if (ratio > 4 && nd > 0.1) out.clicks++;
  }
  return out;
}
