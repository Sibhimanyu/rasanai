// Measurements of one reference film (refs.mjs ingest): frames, cuts, shot list, music map, loudness, bands, SFX, words, sound-mode guess,
// type-follows-audio sync, hook timing. ffmpeg, Node and whisper-cli only (no Python audio). Every number is an estimate from the file, never exact:
// SFX are found from transients (counts good to about +/-30%), shot boundaries from scene scores (a morph-led film under-counts its changes).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { decode, loudness, probeDuration, hasAudioStream, SR } from "./audio.mjs";
import { findWhisper, listModels, transcribeDTW, toWav16, dtwPreset } from "./lyrics.mjs";
import { makeMap } from "../music-map.mjs";

export const r1 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 10) / 10);
export const r2 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 100) / 100);
export const r3 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 1000) / 1000);
export const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.max(0, Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1))))]; };
export const median = (a) => pct(a, 50);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const db = (v) => 20 * Math.log10(v + 1e-9);

export function probeVideo(file) {
  const o = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(o), s = (j.streams || [])[0] || {};
  const [n, d] = String(s.avg_frame_rate || "0/1").split("/").map(Number);
  return { duration_s: r2(Number(j.format && j.format.duration) || 0), width: s.width || 0, height: s.height || 0, fps: d ? r2(n / d) : null, has_audio: hasAudioStream(file) };
}

// ------------------------------------------------------------------ frames (tiled sheets) and hero stills
export function makeSheets(file, dir, dur) {
  const fps = dur <= 75 ? 3 : 2;
  const sd = path.join(dir, "sheets");
  fs.mkdirSync(sd, { recursive: true });
  for (const f of fs.readdirSync(sd)) if (/^s_\d+\.jpg$/.test(f)) fs.rmSync(path.join(sd, f));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-nostdin", "-i", file, "-vf", `fps=${fps},scale=640:-1,tile=4x3`, "-q:v", "3", path.join(sd, "s_%02d.jpg")]);
  const n = fs.readdirSync(sd).filter((f) => /^s_\d+\.jpg$/.test(f)).length;
  return { fps, sheets: n, tile: "4x3", seconds_per_sheet: r2(12 / fps), dir: "sheets/", note: "tile k covers t = (k-1)*seconds_per_sheet ... k*seconds_per_sheet, row by row, left to right; one cell = 1/fps s" };
}

export function makeBarFrames(file, outDir, id, shots, n = 9) {
  fs.mkdirSync(outDir, { recursive: true });
  const usable = shots.filter((s) => s.len >= 0.5);
  const pick = [];
  if (usable.length) for (let i = 0; i < Math.min(n, usable.length); i++) pick.push(usable[Math.min(usable.length - 1, Math.round(((i + 0.5) * usable.length) / Math.min(n, usable.length) - 0.5))]);
  const out = [];
  for (const s of pick) {
    const t = r2((s.t0 + s.t1) / 2), f = `${id}-t${String(Math.round(t * 10)).padStart(3, "0")}.png`;
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-nostdin", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=960:-1", path.join(outDir, f)]);
    if (r.status === 0) out.push({ file: f, t });
  }
  return out;
}

// ------------------------------------------------------------------ cuts and shots
// one scene-score pass: [{t, s}] for every frame (scaled to 640 wide first, as the hand analysis did)
export function sceneScores(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-vf", "scale=640:-1,select='gte(scene,0)',metadata=print:file=-", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 29 });
  const rows = [];
  let t = null;
  for (const line of String(r.stdout || "").split("\n")) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) t = +m[1];
    const k = line.match(/lavfi\.scene_score=([\d.]+)/);
    if (k && t != null) rows.push({ t, s: +k[1] });
  }
  return rows;
}
export function cutsAt(scores, thr, minGap = 0.3) {
  const out = [];
  for (const r of scores) {
    if (r.s <= thr || r.t < 0.1) continue;
    const last = out[out.length - 1];
    if (last && r.t - last.t < minGap) { if (r.s > last.s) { last.t = r.t; last.s = r.s; } } else out.push({ t: r.t, s: r.s });
  }
  return out;
}
export function visualPeaks(scores, thr = 0.15) {
  const out = [];
  for (let i = 1; i < scores.length - 1; i++) if (scores[i].s >= thr && scores[i].s >= scores[i - 1].s && scores[i].s > scores[i + 1].s) out.push({ t: scores[i].t, s: r3(scores[i].s) });
  return out;
}
export function shotStats(cuts, dur) {
  const b = [0, ...cuts.map((c) => c.t), dur].filter((t, i, a) => i === 0 || t - a[i - 1] > 0.05);
  const shots = [];
  for (let i = 0; i < b.length - 1; i++) shots.push({ i: i + 1, t0: r2(b[i]), t1: r2(b[i + 1]), len: r2(b[i + 1] - b[i]) });
  const L = shots.map((s) => s.len);
  return { shots, count: shots.length, median_s: r2(median(L)), p10_s: r2(pct(L, 10)), p90_s: r2(pct(L, 90)), min_s: r2(Math.min(...L)), max_s: r2(Math.max(...L)), per_10s: r2((shots.length / dur) * 10), cuts: cuts.length };
}

// ------------------------------------------------------------------ audio bands, SFX
const BANDS = { full: "", sub: "lowpass=f=120", lowmid: "highpass=f=120,lowpass=f=300", voice: "highpass=f=300,lowpass=f=3400", highs: "highpass=f=3400", air: "highpass=f=8000" };
export function bandEnvelopes(file, W = 0.05) {
  const N = Math.round(SR * W), env = {};
  for (const [k, f] of Object.entries(BANDS)) {
    const r = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-vn", "-ac", "1", "-ar", String(SR), ...(f ? ["-af", f] : []), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
    const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
    const n = Math.floor(x.length / N), o = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < N; j++) { const v = x[i * N + j]; s += v * v; } o[i] = db(Math.sqrt(s / N)); }
    env[k] = o;
  }
  return { env, W };
}
export function perSecond(env, W) {
  const per = Math.round(1 / W), out = {};
  for (const k of Object.keys(env)) { const a = env[k], rows = []; for (let s = 0; s * per < a.length; s++) rows.push(r1(mean(Array.from(a.slice(s * per, (s + 1) * per))))); out[k] = rows; }
  return out;
}
export function sfxEvents({ env, W }) {
  const n = env.full.length, med = (a, i, r) => { const s = Array.from(a.slice(Math.max(0, i - r), Math.min(a.length, i + r + 1))).sort((x, y) => x - y); return s[s.length >> 1]; };
  const base = {};
  for (const k of Object.keys(env)) base[k] = Float64Array.from(env[k], (_, i) => med(env[k], i, 30));
  const ev = [];
  let last = -9;
  for (let i = 3; i < n - 8; i++) {
    const hi = env.highs, ex = hi[i] - base.highs[i], rise = hi[i] - Math.min(hi[i - 1], hi[i - 2], hi[i - 3]);
    if (!(ex >= 7 && rise >= 5 && hi[i] >= hi[i - 1] && hi[i] >= hi[i + 1] && hi[i] > -70 && i * W - last > 0.15)) continue;
    let w = 0; for (let j = i; j < n && hi[j] > hi[i] - 8; j++) w++;
    let rt = 0; for (let j = i; j > 0 && hi[j] > hi[i] - 8; j--) rt++;
    const e = { t: r2(i * W), exHi: Math.round(ex), exAir: Math.round(env.air[i] - base.air[i]), exSub: Math.round(env.sub[i] - base.sub[i]), exFull: Math.round(env.full[i] - base.full[i]), wMs: w * 50, riseMs: rt * 50 };
    let kind = "click";
    if (e.exSub >= 6 && e.wMs <= 400) kind = "impact"; else if (e.wMs >= 250 && e.riseMs >= 150 && e.exSub < 5) kind = "whoosh"; else if (e.wMs >= 250) kind = "tail";
    e.kind = kind; ev.push(e); last = i * W;
  }
  return ev;
}

// the designed sounds: a clear air-band burst or a strong highs transient, one per 0.6 s (raw transients also catch every hat and kick; on the
// first favourite this gives 11 in 46 s where the hand count was about 10)
export function designedSfx(ev) {
  const out = [];
  for (const e of ev.filter((x) => x.exAir >= 15 || x.exHi >= 20).sort((a, b) => a.t - b.t)) {
    const l = out[out.length - 1];
    if (l && e.t - l.t < 0.6) { if (e.exHi + e.exAir > l.exHi + l.exAir) out[out.length - 1] = e; } else out.push(e);
  }
  return out;
}

// ------------------------------------------------------------------ whisper
export function findModel() {
  const want = process.env.WHISPER_MODEL;
  if (want) {
    if (fs.existsSync(want)) return { name: path.basename(want).replace(/^ggml-/, "").replace(/\.bin$/, ""), file: path.resolve(want) };
    const m = listModels("auto").find((x) => x.name === want || x.file.includes(want));
    if (m) return m;
  }
  const found = listModels("auto");
  // the repo's own model folder (.context/lyrics/models) when nothing is installed in the usual places
  const extra = [];
  for (let d = path.resolve(process.cwd()), i = 0; i < 6; i++, d = path.dirname(d)) extra.push(path.join(d, ".context", "lyrics", "models"));
  const home = [path.join(os.homedir(), ".cache", "whisper"), path.join(os.homedir(), ".cache", "hyperframes", "whisper", "models")];
  const seen = new Set(found.map((f) => f.file));
  for (const d of [...extra, ...home]) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) { const m = f.match(/^ggml-(.+)\.bin$/); if (m && !m[1].startsWith("for-tests") && !seen.has(path.join(d, f))) { found.push({ name: m[1], file: path.join(d, f) }); seen.add(path.join(d, f)); } }
  }
  const rank = (n) => (/large-v3-turbo/.test(n) ? 0 : /large/.test(n) ? 1 : /medium/.test(n) ? 2 : /small/.test(n) ? 3 : 4);
  return found.sort((a, b) => rank(a.name) - rank(b.name))[0] || null;
}
export function transcribeWords(file, workDir) {
  const bin = findWhisper(), model = findModel();
  if (!bin || !model) return { ok: false, words: [], reason: `no whisper (${bin ? "cli ok" : "whisper-cli missing"}, ${model ? "model ok" : "no ggml model: set WHISPER_MODEL=<file> or run lyrics.mjs models --fetch"})` };
  fs.mkdirSync(workDir, { recursive: true });
  try {
    const wav = toWav16(file, path.join(workDir, "mono16k.wav"));
    const words = transcribeDTW(wav, { model, lang: /\.en(-|$)/.test(model.name) ? "en" : "auto", bin, workDir, tag: "ref" });
    return { ok: true, model: model.name, words: words.map((w) => ({ w: w.text, t0: r2(w.start), t1: r2(w.end) })) };
  } catch (e) { return { ok: false, words: [], reason: String(e.message || e).slice(0, 200) }; }
}

// ------------------------------------------------------------------ sync, sound mode, hook
const nearest = (t, arr) => { let b = null; for (const x of arr) if (b == null || Math.abs(x - t) < Math.abs(b - t)) b = x; return b; };
export function syncShare(vis, audio, dur, tol = 0.15) {
  if (!vis.length || !audio.length) return { n: vis.length, on: 0, share: null, chance: null, lift: null };
  const on = vis.filter((t) => Math.abs(nearest(t, audio) - t) <= tol).length;
  let cover = 0; const steps = Math.max(1, Math.floor(dur / 0.01));
  for (let i = 0; i < steps; i++) if (Math.abs(nearest(i * 0.01, audio) - i * 0.01) <= tol) cover++;
  const chance = cover / steps, share = on / vis.length;
  return { n: vis.length, on, share: r2(share), chance: r2(chance), lift: r2(share - chance) };
}
// word starts against the music's 8th-note grid (phase from the strong onsets' circular mean): a sung line sits on it, a voice-over does not
function wordGrid(words, map) {
  if (!(map.bpm > 0) || !words.length) return null;
  const per = 60 / map.bpm / 2;
  const strong = map.hits.length >= 3 ? map.hits.map((h) => h.t) : map.onsets.slice().sort((a, b) => b.strength - a.strength).slice(0, 40).map((o) => o.t);
  let cx = 0, cy = 0; for (const t of strong) { const a = (2 * Math.PI * t) / per; cx += Math.cos(a); cy += Math.sin(a); }
  const phase = ((Math.atan2(cy, cx) / (2 * Math.PI)) * per + per) % per;
  const tol = 0.06, on = words.filter((w) => { const d = Math.abs(((w.t0 - phase) % per + per) % per); return Math.min(d, per - d) <= tol; }).length;
  const chance = Math.min(1, (2 * tol) / per), share = on / words.length;
  return { share: r2(share), chance: r2(chance), lift: r2(share - chance) };
}
export function guessSoundMode({ dur, hasAudio, words, map, sfxPer10s, fullMeanDb, voiceMeanDb, subMeanDb }) {
  if (!hasAudio || fullMeanDb < -60) return { mode: "silent", atlas_mode: null, confidence: 0.9, why: "no audio, or the track is below -60 dB" };
  const wps = words.length / Math.max(1, dur);
  const grid = wordGrid(words, map);
  const sig = { words: words.length, words_per_s: r2(wps), sfx_per_10s: sfxPer10s, bpm: map.bpm, bpm_confidence: map.bpm_confidence, voice_band_minus_full_db: r1(voiceMeanDb - fullMeanDb), voice_band_minus_sub_db: r1(voiceMeanDb - subMeanDb), word_grid: grid };
  if (words.length < 5 || wps < 0.25) {
    const led = sfxPer10s >= 3.5 && (map.bpm_confidence || 0) < 0.4;
    return { mode: led ? "sfx-led" : "instrumental", atlas_mode: led ? "sfx-led" : "instrumental-arc", confidence: 0.7, why: led ? "almost no words, many designed sounds, no steady pulse" : "almost no words; a music bed with a pulse", signals: sig };
  }
  // a voice-over sits ABOVE the bed in the voice band; a sung line sits inside the beat (the sub/kick carries more than the voice). Measured on the three
  // favourites: voice minus sub +4.6 dB (voice-over) against -7.1 dB (song). Only a guess: the analyst reads the words and confirms.
  const song = (voiceMeanDb - subMeanDb) <= -3 && (map.bpm_confidence || 0) >= 0.3;
  return song ? { mode: "song", atlas_mode: "song-lyric", confidence: grid && grid.lift >= 0.15 ? 0.6 : 0.45, why: "words under a strong beat: the voice band sits below the sub band and the tempo is steady (sung or rapped over it); confirm from the transcript", signals: sig }
    : { mode: "vo", atlas_mode: "vo-kinetic", confidence: wps >= 1.2 ? 0.75 : 0.55, why: "continuous words that do not follow the music's grid (a voice-over over a bed)", signals: sig };
}
export function hookOf({ dur, cuts25, peaks, words, map, sfx, momentary }) {
  const firstWord = words.length ? words[0].t0 : null, firstCut = cuts25.length ? cuts25[0].t : null;
  const firstHit = map.hits.length ? map.hits[0].t : null, firstOnset = map.onsets.length ? map.onsets[0].t : null, firstSfx = sfx.length ? sfx[0].t : null;
  const lead = momentary ? (() => { const med = median(momentary.filter((v) => v > -70)) ?? -30; const i = momentary.findIndex((v) => v > med - 12); return i < 0 ? null : r2(i * 0.1); })() : null;
  const tailSilence = momentary ? (() => { let j = momentary.length - 1; while (j >= 0 && momentary[j] < -50) j--; return r2((momentary.length - 1 - j) * 0.1); })() : null;
  return { first_word_s: firstWord, first_cut_s: firstCut == null ? null : r2(firstCut), first_music_hit_s: firstHit, first_music_onset_s: firstOnset, first_sfx_s: firstSfx, audio_lead_in_s: lead,
    shots_in_first_3s: 1 + cuts25.filter((c) => c.t <= 3).length, visual_changes_in_first_3s: peaks.filter((p) => p.t <= 3).length, tail_silence_s: tailSilence,
    note: "hook = the first 3 s: what changes (cut, word, hit) and how early; the analyst adds what is on screen and the claim from the sheets" };
}

// ------------------------------------------------------------------ the whole thing
export function analyse(file, dir, { log = () => {}, noWhisper = false } = {}) {
  const probe = probeVideo(file), dur = probe.duration_s;
  if (!(dur > 0)) throw new Error("could not read the duration");
  const stats = { version: 1, video: probe, notes: ["every number is measured from the file and is an estimate; SFX counts are good to about +/-30%, shot lists from scene scores miss morphs and dissolves"] };
  const audioDir = path.join(dir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  log("frames and sheets");
  stats.frames = makeSheets(file, dir, dur);
  log("cuts and shots");
  const scores = sceneScores(file);
  const c10 = cutsAt(scores, 0.1, 0.15), c25 = cutsAt(scores, 0.25, 0.15), c40 = cutsAt(scores, 0.4, 0.3), peaks = visualPeaks(scores, 0.15);
  fs.writeFileSync(path.join(dir, "scene_score.tsv"), "t\tscore\n" + scores.map((r) => `${r.t}\t${r.s}`).join("\n") + "\n");
  const sh = shotStats(c25, dur);
  stats.cuts = { thr_0_1: c10.map((c) => r2(c.t)), thr_0_25: c25.map((c) => r2(c.t)), thr_0_4: c40.map((c) => r2(c.t)), counts: { "0.1": c10.length, "0.25": c25.length, "0.4": c40.length }, hard_cuts: c40.length, hard_cuts_per_10s: r2((c40.length / dur) * 10),
    visual_peaks_0_15: peaks.map((p) => ({ t: r2(p.t), score: p.s })), note: "shots use the 0.25 threshold; 0.4 = true hard cuts; 0.1 also catches fast morphs and big in-frame moves" };
  const noList = ({ shots, ...x }) => x;
  stats.shots = { ...sh, by_threshold: { "0.1": noList(shotStats(c10, dur)), "0.25": noList(sh), "0.4": noList(shotStats(c40, dur)) } };
  stats.bar_frames = makeBarFrames(file, path.join(dir, "bar-frames"), path.basename(dir), sh.shots);
  const wordsOut = { ok: false, words: [], reason: "no audio stream" };
  let map = { bpm: 0, bpm_confidence: 0, onsets: [], hits: [], breaks: [], thin: [] }, sfx = [], momentary = null, bandMeans = null;
  if (probe.has_audio) {
    log("music event map");
    map = makeMap(file);
    fs.writeFileSync(path.join(audioDir, "music-map.json"), JSON.stringify(map, null, 2) + "\n");
    log("loudness");
    const L = loudness(file, { frames: true });
    momentary = (L.frames || []).map((f) => f.M);
    const curve = L.frames || [];
    fs.writeFileSync(path.join(audioDir, "ebur_curve.tsv"), "t\tM\tS\n" + curve.map((f) => `${f.t}\t${f.M}\t${f.S}`).join("\n") + "\n");
    const bySec = []; for (const f of curve) { const k = Math.floor(f.t); if (Number.isFinite(f.S)) bySec[k] = f.S; }
    stats.loudness = { lufs: L.lufs, lra: L.lra, true_peak_dbfs: L.true_peak, short_term_per_s: Array.from(bySec, (v) => (v == null ? null : r1(v))), short_term_range: (() => { const v = bySec.filter((x) => x != null && x > -70); return v.length ? [r1(Math.min(...v)), r1(Math.max(...v))] : null; })() };
    log("bands and sfx");
    const B = bandEnvelopes(file);
    const per = perSecond(B.env, B.W);
    fs.writeFileSync(path.join(audioDir, "bands_per_sec.tsv"), ["s", ...Object.keys(per)].join("\t") + "\n" + per.full.map((_, i) => [i, ...Object.keys(per).map((k) => per[k][i])].join("\t")).join("\n") + "\n");
    bandMeans = Object.fromEntries(Object.keys(B.env).map((k) => [k, r1(mean(Array.from(B.env[k]).filter((v) => v > -80)))]));
    stats.bands = { means_db: bandMeans, per_second_db: per, bands_hz: { sub: "<120", lowmid: "120-300", voice: "300-3400", highs: ">3400", air: ">8000" } };
    const raw = sfxEvents(B);
    sfx = designedSfx(raw);
    const buckets = []; for (let s = 0; s < dur; s += 10) buckets.push(sfx.filter((e) => e.t >= s && e.t < s + 10).length);
    const kinds = {}; sfx.forEach((e) => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
    fs.writeFileSync(path.join(audioDir, "sfx_events.json"), JSON.stringify(raw));
    fs.writeFileSync(path.join(audioDir, "sfx_designed.json"), JSON.stringify(sfx));
    stats.sfx = { count: sfx.length, raw_transients: raw.length, basis: "designed = air burst >= 15 dB or highs transient >= 20 dB over the local level, one per 0.6 s; raw_transients also counts every hat and kick", per_10s_overall: r2((sfx.length / dur) * 10), per_10s_buckets: buckets, kinds, events: sfx.map((e) => ({ t: e.t, kind: e.kind, exHi: e.exHi, exAir: e.exAir })), onsets_file: "audio/sfx_events.json", designed_file: "audio/sfx_designed.json" };
    stats.music = { bpm: map.bpm, bpm_confidence: map.bpm_confidence, onsets: map.onsets.length, hits: map.hits.map((h) => h.t), hit_rise_db: map.hits.map((h) => h.rise_db), breaks: map.breaks, thin: map.thin, map_file: "audio/music-map.json" };
    if (!noWhisper) {
      log("words (whisper)");
      Object.assign(wordsOut, transcribeWords(file, audioDir));
    }
  }
  const W = wordsOut.words;
  stats.words = { ok: wordsOut.ok, model: wordsOut.model || null, count: W.length, per_s: r2(W.length / dur), reason: wordsOut.ok ? undefined : wordsOut.reason || (noWhisper ? "skipped (--no-whisper)" : "no audio"), list: W, note: "start times are DTW estimates (about +/-60 ms), the previous word's end" };
  fs.writeFileSync(path.join(audioDir, "words.json"), JSON.stringify(W, null, 1));
  stats.sound_mode = guessSoundMode({ dur, hasAudio: probe.has_audio, words: W, map, sfxPer10s: stats.sfx ? stats.sfx.per_10s_overall : 0, fullMeanDb: bandMeans ? bandMeans.full : -90, voiceMeanDb: bandMeans ? bandMeans.voice : -90, subMeanDb: bandMeans ? bandMeans.sub : -90 });
  const vis = peaks.map((p) => p.t), cutT = c25.map((c) => c.t);
  const strongEv = map.cut_points || [];
  const audioEv = [...map.onsets.map((o) => o.t)], wordT = W.map((w) => w.t0), hitT = map.hits.map((h) => h.t);
  stats.sync = { tol_s: 0.15, cuts_vs_music_onsets: syncShare(cutT, audioEv, dur), visual_changes_vs_music_onsets: syncShare(vis, audioEv, dur), visual_changes_vs_word_starts: syncShare(vis, wordT, dur), cuts_vs_word_starts: syncShare(cutT, wordT, dur),
    hard_cuts_vs_music_events: syncShare(c40.map((c) => c.t), strongEv.length ? strongEv : audioEv, dur), visual_changes_vs_sfx: syncShare(vis, sfx.map((e) => e.t), dur),
    note: "share = fraction of visual changes within 150 ms of an audio event; chance = share expected if the events were random; lift = share - chance (type follows audio when lift is clearly positive)" };
  stats.hook = hookOf({ dur, cuts25: c25, peaks, words: W, map, sfx, momentary });
  return stats;
}
