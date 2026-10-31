// Layered stem mix, driven from Node, rendered by ffmpeg. Never mutes: it carves and shaves.
//   music, VO and SFX are rendered as separate 48 kHz stereo float stems, then summed, glued and mastered to the platform's loudness.
//   - the music bed is EQ-carved at 150-300 Hz (and 1.8 kHz) when a voice is present, and NOT ducked by default (the favourites keep the bed constant; SFX sit 0-6 dB over it). A duck (spec.duck_db, 0-9 dB) is an option for VO intelligibility when measured masking needs it,
//     by a smooth gain lane (0.3 s in, hold, 0.8 s out) computed from the word timings: deterministic, no pumping, nothing ever muted
//   - SFX are placed by their measured sync point on the picture's hit points (within 60 ms) or the beat grid (within 60 ms); risers end on the hit, whooshes land
//     3 frames early, impacts on the frame; each gets a stereo position (screen x -> pan, never past 70%), a role-based level against the bed and a band-limit by kind
//   - master: glue compressor, then masterFile (static gain + 4x-oversampled true-peak limiter): web -14, keynote -16, broadcast -23 LUFS
//
//   mixFilm(spec, out, { workDir, log }) -> { out, stems, cues, duck, measures, targets, variants, mode, notes }
//   spec: { duration, mode, platform: "web"|"keynote"|"broadcast"|{lufs,tp}, duck_db?, key_duck_db?, carve?: bool, stereo_width?,
//           music: { file, gain_db? }, vo: { file, words?: <words.json path | [{start,end}]> } | null,
//           sfx: [{ file | palette, at, role?, kind?, gain_db?, pan?, x?, key?, sync_point_s? }], palette_dir?, hits?: [s], beats?: [s] | { beats: [s] },
//           variants?: ["no-vo","no-music"] }
//   role: carrier | accent | transition | reveal | button (palettes.json); kind: tick | whoosh | riser | impact | stinger | subdrop | foley | hit
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loudness, loudnessOver, masterFile, loudnessTarget, phrasesFromWords, probeDuration, requireTools, r1, r3 } from "./audio.mjs";
import { MODE_STEMS } from "./sound-mode.mjs";

const SNAP_S = 0.06;
const WHOOSH_LEAD_S = 0.08; // 2-3 frames before the visual arrives
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
const ROLE_OVER_BED_DB = { accent: 3, carrier: 5, transition: 7, button: 8, reveal: 12 }; // peak of a cue over the bed's integrated loudness
const kindOf = (c) => String(c.kind || ({ transition: "whoosh", reveal: "impact", button: "stinger", accent: "tick", carrier: "tick" }[c.role]) || "hit");

function ff(argv, what) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-nostdin", ...argv], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${what}: ${(r.stderr || "").trim().split("\n").slice(-2).join(" ")}`);
}
// the graph goes in a script file: no shell or filter-escaping surprises with long expressions
function run(inputs, graph, outLabel, out, what, workDir) {
  const gf = path.join(workDir, `${path.basename(out)}.graph.txt`);
  fs.writeFileSync(gf, graph);
  const argv = [];
  for (const i of inputs) argv.push(...i);
  ff([...argv, "-filter_complex_script", gf, "-map", `[${outLabel}]`, "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", out], what);
}
const STEREO = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";

// ---------------------------------------------------------------- placement

export function readBeats(b) {
  if (!b) return [];
  if (typeof b === "string") b = JSON.parse(fs.readFileSync(b, "utf8"));
  const a = Array.isArray(b) ? b : b.beats || b.grid || [];
  return a.map((x) => (typeof x === "number" ? x : x.t ?? x.time)).filter(Number.isFinite).sort((p, q) => p - q);
}
const nearest = (arr, t) => arr.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), arr[0]);

// -> the cue with its film time `hit` (after snapping), `start` (hit - sync point, may be < 0: then `trim` seconds are cut from the file's head), `snapped_to`, `snap_delta_ms`
export function placeCues(cues, { beats = [], hits = [], duration = Infinity } = {}) {
  return cues.map((c) => {
    const sync = Number.isFinite(c.sync_point_s) ? c.sync_point_s : 0;
    let hit = Number(c.at);
    let snapped = "none";
    if (hits.length) { const h = nearest(hits, hit); if (Math.abs(h - hit) <= SNAP_S) { hit = h; snapped = "picture"; } }
    if (snapped === "none" && beats.length) { const b = nearest(beats, hit); if (Math.abs(b - hit) <= SNAP_S) { hit = b; snapped = "beat"; } }
    const kind = kindOf(c);
    let land = hit;
    if (kind === "whoosh") land = hit - WHOOSH_LEAD_S;
    else if (kind === "impact" || kind === "hit" || kind === "tick") land = hit + 0.005;
    const start = land - sync;
    return { ...c, kind, hit: r3(hit), start: r3(Math.max(0, start)), trim: r3(Math.max(0, -start)), snapped_to: snapped, snap_delta_ms: Math.round((hit - Number(c.at)) * 1000), dropped: land > duration ? "after the end" : undefined };
  }).filter((c) => !c.dropped);
}

// pan -1..1 -> [gainL, gainR], constant power, normalised so the centre is unity; never past 70%
export function panGains(p) {
  const x = clampN(p, -0.7, 0.7);
  const a = ((x + 1) * Math.PI) / 4;
  return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2];
}

// ---------------------------------------------------------------- duck lane

const nestMax = (xs) => (xs.length === 0 ? "0" : xs.length === 1 ? xs[0] : `max(${xs[0]},${nestMax(xs.slice(1))})`);
// linear gain expression of t: -duckDb under VO spans, -keyDb under key cues; 0.3 s in (starting 0.25 s before the first word), hold 0.4 s after, 0.8 s out
export function duckExpr(spans, keyTimes, duckDb, keyDb) {
  const vo = spans.map(([a, b]) => `min(clip((t-${r3(a - 0.25)})/0.3,0,1),clip((${r3(b + 1.2)}-t)/0.8,0,1))`);
  const key = keyTimes.map((T) => `min(clip((t-${r3(T - 0.15)})/0.1,0,1),clip((${r3(T + 0.9)}-t)/0.4,0,1))`);
  return `pow(10,-(${duckDb}*${nestMax(vo)}+${keyDb}*${nestMax(key)})/20)`;
}

export function voSpans(vo) {
  let words = vo && vo.words;
  if (typeof words === "string") { const j = JSON.parse(fs.readFileSync(words, "utf8")); words = j.words || j; }
  if (!words || !words.length) return [];
  return phrasesFromWords(words, 1.2);
}

const complement = (spans, D) => {
  const out = [];
  let t = 0;
  for (const [a, b] of spans) { if (a - 0.4 > t) out.push([t, a - 0.4]); t = Math.max(t, b + 1.2); }
  if (D - 0.1 > t) out.push([t, D]);
  return out.filter(([a, b]) => b - a > 0.3);
};

// ---------------------------------------------------------------- the mix

export async function mixFilm(spec, out, { workDir, log = () => {} } = {}) {
  requireTools();
  const D = Number(spec.duration);
  if (!(D > 0)) throw new Error("mix spec needs a duration in seconds");
  out = path.resolve(out);
  workDir = path.resolve(workDir || path.join(path.dirname(out), "stems"));
  fs.mkdirSync(workDir, { recursive: true });
  const notes = [];
  const target = loudnessTarget(spec.platform || "web");
  const modeInfo = MODE_STEMS[spec.mode] || {};
  const hasVO = !!(spec.vo && spec.vo.file && fs.existsSync(spec.vo.file));
  if (spec.vo && spec.vo.file && !hasVO) notes.push(`VO file not found: ${spec.vo.file}`);
  const hasMusic = !!(spec.music && spec.music.file && fs.existsSync(spec.music.file));
  const spans = hasVO ? voSpans(spec.vo) : [];
  if (hasVO && !spans.length) { const d = probeDuration(spec.vo.file); spans.push([0, Math.min(d, D)]); notes.push("no word timings: the whole VO file is treated as one speech span (ducks for its full length)"); }
  const duckDb = clampN(Number(spec.duck_db ?? 0) || 0, 0, 9); // no duck by default: the EQ carve does the separating; set duck_db only when measured masking needs it
  const keyDb = clampN(Number(spec.key_duck_db ?? 0) || 0, 0, 6);

  // ---- cues, snapped
  const pal = spec.palette_dir && fs.existsSync(path.join(spec.palette_dir, "palette.json")) ? JSON.parse(fs.readFileSync(path.join(spec.palette_dir, "palette.json"), "utf8")) : null;
  const raw = (spec.sfx || []).map((c) => {
    if (!c.palette) return c;
    const s = pal && pal.sounds.find((x) => x.id === c.palette);
    if (!s) { notes.push(`palette sound ${c.palette} not found`); return null; }
    return { role: s.role, kind: s.kind, sync_point_s: s.sync_point_s, gain_db: s.gain_db, ...(s.pan ? { pan: s.pan } : {}), ...c, file: path.join(spec.palette_dir, s.file) };
  }).filter(Boolean).filter((c) => c.file && fs.existsSync(c.file) ? true : (notes.push(`SFX file missing: ${c.file}`), false));
  const cues = placeCues(raw, { beats: readBeats(spec.beats), hits: spec.hits || [], duration: D });

  // ---- music stem
  const stems = {};
  const musicRef = {};
  if (hasMusic) {
    const m = loudness(spec.music.file);
    const carve = spec.carve ?? hasVO;
    const targetLufs = hasVO ? -18 - 12 + duckDb : -17; // the bed sits 12 LU under the voice, so its un-ducked level is that plus the duck
    const gain = (spec.music.gain_db ?? 0) + (m.lufs != null ? targetLufs - m.lufs : 0);
    const keyTimes = cues.filter((c) => c.key || c.role === "reveal" || c.role === "button" || c.kind === "impact").map((c) => c.hit);
    const lane = hasVO || keyTimes.length ? `,volume='${duckExpr(spans, keyTimes, hasVO ? duckDb : 0, keyDb)}':eval=frame` : "";
    const chain = [
      `atrim=end=${D}`, "asetpts=PTS-STARTPTS", STEREO, "highpass=f=30", "lowpass=f=16000",
      ...(carve ? ["equalizer=f=220:t=q:w=0.9:g=-3.5", "equalizer=f=1800:t=q:w=1.2:g=-3", "equalizer=f=3000:t=q:w=1.5:g=-1.5"] : []),
      ...(spec.stereo_width !== 1 ? [`extrastereo=m=${spec.stereo_width ?? 1.15}`] : []),
      `volume=${gain.toFixed(2)}dB`,
    ].join(",");
    const f = path.join(workDir, "music.wav");
    run([["-i", spec.music.file]], `[0:a]${chain}${lane},apad=whole_dur=${D},atrim=end=${D}[o]`, "o", f, "music stem", workDir);
    stems.music = f;
    musicRef.lufs = loudness(f).lufs;
    musicRef.gain_db = r1(gain);
    musicRef.carve = !!carve;
  } else if (!spec.music) notes.push(modeInfo.music === "none" ? "no music: SFX-led" : "no music stem given");

  // ---- VO stem (dead centre, mud out, presence in, level -18 LUFS before the bus)
  let voRef = null;
  if (hasVO) {
    const v = loudness(spec.vo.file);
    const gain = v.lufs != null ? -18 - v.lufs : 0;
    const f = path.join(workDir, "vo.wav");
    const chain = [STEREO, "highpass=f=80", "equalizer=f=200:t=q:w=1:g=-2", "equalizer=f=3500:t=q:w=1:g=2", `volume=${gain.toFixed(2)}dB`, "acompressor=threshold=0.125:ratio=3:attack=10:release=120:makeup=1.6", "alimiter=limit=0.89:level=disabled", `apad=whole_dur=${D}`, `atrim=end=${D}`].join(",");
    run([["-i", spec.vo.file]], `[0:a]${chain}[o]`, "o", f, "vo stem", workDir);
    stems.vo = f;
    voRef = { lufs: loudness(f).lufs, spans: spans.map(([a, b]) => [r3(a), r3(b)]) };
  }

  // ---- SFX stem
  if (cues.length) {
    const bedLufs = musicRef.lufs ?? (voRef ? voRef.lufs - 12 : -22);
    const peaks = new Map();
    const peakOf = (file) => { if (!peaks.has(file)) peaks.set(file, loudness(file).true_peak ?? -6); return peaks.get(file); };
    const inputs = [];
    const parts = [];
    cues.forEach((c, i) => {
      inputs.push(["-i", c.file]);
      const over = ROLE_OVER_BED_DB[c.role] ?? 4;
      const wantPeak = bedLufs + over + (Number(c.gain_db) || 0);
      const g = wantPeak - peakOf(c.file);
      c.gain_applied_db = r1(g);
      const pan = c.pan != null ? Number(c.pan) : c.x != null ? (Number(c.x) - 0.5) * 1.4 : 0;
      const [gl, gr] = panGains(pan);
      c.pan_applied = r3(clampN(pan, -0.7, 0.7));
      const band = c.kind === "whoosh" || c.kind === "riser" ? "highpass=f=200" : c.kind === "impact" || c.kind === "subdrop" ? (spans.length ? "equalizer=f=250:t=q:w=1:g=-2" : "anull") : "highpass=f=60";
      const ms = Math.round(c.start * 1000);
      parts.push(`[${i}:a]${c.trim ? `atrim=start=${c.trim},asetpts=PTS-STARTPTS,` : ""}${STEREO},${band},volume=${g.toFixed(2)}dB,pan=stereo|c0=${gl.toFixed(4)}*c0|c1=${gr.toFixed(4)}*c1,adelay=${ms}|${ms}[c${i}]`);
    });
    const f = path.join(workDir, "sfx.wav");
    const sum = cues.length > 1 ? `${cues.map((_, i) => `[c${i}]`).join("")}amix=inputs=${cues.length}:normalize=0:duration=longest,` : `[c0]`;
    run(inputs, `${parts.join(";")};${sum}apad=whole_dur=${D},atrim=end=${D}[o]`, "o", f, "sfx stem", workDir);
    stems.sfx = f;
  }
  if (!Object.keys(stems).length) throw new Error("nothing to mix: no music, VO or SFX");

  // ---- bus: sum, glue, headroom, master
  const buildMaster = (omit, dest) => {
    const use = Object.entries(stems).filter(([k]) => !omit.includes(k));
    if (!use.length) return null;
    const pre = dest.replace(/\.[^.]+$/, "") + ".premaster.wav";
    const g = `${use.map((_, i) => `[${i}:a]`).join("")}amix=inputs=${use.length}:normalize=0:duration=longest,acompressor=threshold=0.1:ratio=1.6:attack=30:release=250:makeup=1[o]`;
    run(use.map(([, f]) => ["-i", f]), g, "o", pre, "premix", workDir);
    const pk = loudness(pre).true_peak;
    let note = null;
    if (pk != null && pk > -6) { // keep -6 dBFS of pre-master headroom
      const trimmed = pre.replace(/\.wav$/, ".trim.wav");
      ff(["-i", pre, "-af", `volume=${(-6 - pk).toFixed(2)}dB`, "-c:a", "pcm_f32le", trimmed], "headroom trim");
      fs.renameSync(trimmed, pre);
      note = `pre-master peak was ${r1(pk)} dBFS: trimmed ${r1(-6 - pk)} dB to leave -6 dBFS of headroom`;
    }
    const m = masterFile(pre, dest, { lufs: target.lufs, tp: target.tp });
    return { ...m, headroom_note: note, premaster: pre };
  };
  const master = buildMaster([], out);
  const variants = {};
  for (const v of spec.variants || []) {
    const omit = v === "no-vo" ? ["vo"] : v === "no-music" ? ["music"] : [];
    if (!omit.length || (omit[0] === "vo" && !stems.vo) || (omit[0] === "music" && !stems.music)) continue;
    const dest = out.replace(/(\.[^.]+)$/, `.${v}$1`);
    const m = buildMaster(omit, dest);
    if (m) variants[v] = { out: dest, lufs: m.lufs, true_peak: m.true_peak };
  }

  // ---- measures (what the QA gate reads)
  const measures = { master: { lufs: master.lufs, true_peak: master.true_peak, lra: master.lra, target_lufs: target.lufs, target_tp: target.tp }, music: musicRef.lufs != null ? { lufs: r1(musicRef.lufs), gain_db: musicRef.gain_db, carve_150_300: musicRef.carve } : null, vo: voRef ? { lufs: r1(voRef.lufs) } : null };
  const duck = { depth_set_db: hasVO ? duckDb : 0, // 0 = no duck (default)
     key_set_db: keyDb, spans: voRef ? voRef.spans : [], measured_db: null, music_under_vo_lu: null };
  if (stems.music && spans.length) {
    const inside = loudnessOver(stems.music, spans.map(([a, b]) => [a, b]));
    const outside = complement(spans, D);
    const outL = outside.length ? loudnessOver(stems.music, outside) : null;
    if (inside != null && outL != null) duck.measured_db = r1(outL - inside);
    if (stems.vo) { const vIn = loudnessOver(stems.vo, spans); if (vIn != null && inside != null) duck.music_under_vo_lu = r1(vIn - inside); }
    if (duck.measured_db != null && duck.measured_db > 9) notes.push(`measured duck ${duck.measured_db} dB is deeper than 9 dB (the bed is also dynamic): check the bed`);
  }
  const placed = cues.map((c) => ({ id: c.id || c.palette || path.basename(c.file), role: c.role, kind: c.kind, at: c.at, hit: c.hit, start: c.start, snapped_to: c.snapped_to, snap_delta_ms: c.snap_delta_ms, gain_db: c.gain_applied_db, pan: c.pan_applied }));
  const receipt = { out, mode: spec.mode || null, platform: spec.platform || "web", duration: D, stems, cues: placed, duck, measures, variants, notes, premaster: master.premaster };
  fs.writeFileSync(out.replace(/\.[^.]+$/, "") + ".mix.json", JSON.stringify(receipt, null, 2) + "\n");
  log(`mix: ${r1(master.lufs)} LUFS, ${r1(master.true_peak)} dBTP, ${placed.length} cues`);
  return receipt;
}
