// Reference deconstruction: a user's whole reference film turned into numbers (onetake's "deconstruct the reference", animate's
// "measuring a reference"). `research.mjs deconstruct --video <ref.mp4>` writes them to reference/numbers.json; the Motion Director
// scores against them and the motion gate can compare a draft's energy curve to them (warning `energy-off-reference`).
//
//   frameDiffs(file)          mean absolute luma difference between consecutive frames (0..255), 160x90 grey, native fps (30 at most)
//   robustCuts(diffs, fps)    the robust cut detector: a frame whose difference is above max(8, 4 x the rolling median of the +-12
//                             frames around it); cuts inside a STEPPED run (animation on 2s, 3s or 4s: the picture changes every nth
//                             frame, the others are exact repeats) are kept only when they tower over the run's own steps, and
//                             cuts inside a FLICKER run (3 frames or more over the floor in a row) are
//                             dropped; neighbours within 2 frames merge; 3 or more cuts each within 0.5 s of the last are a burst.
//                             A fixed scene-score threshold (brandfilm's old 0.25) over-cuts hand-animated footage (every step is a
//                             "cut") and under-cuts calm films; this one adapts to the film's own motion.
//   energyCurve(...)          the motion energy per 0.5 s (cuts excluded) and the share of frames that are still
//   soundArc(file, cuts)      loudness per second (median and p90 of the 100 ms momentary level, dB), the onsets, onsets per second,
//                             the share of cuts that land on an onset
//   deconstruct(file, opts)   everything, with the existing measurers: fluency (moves, curve families), camera kinds, echo, boldness
//   -> reference/numbers.json (see `deconstruct` below for the fields)
//
// Numbers are for scoring a draft against, not for copying: the reference's own pictures never enter the film. Thresholds for cuts
// come from the animate kit's shotlog (cth9191/animate, MIT: the idea; this code is our own) and are uncalibrated until run on references.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export const CUT = {
  floor: 8, mult: 4, win: 12, // a cut: diff > max(floor, mult x the rolling median over +-win frames)
  zero: 0.6, // a frame pair under this is an exact repeat (a hold); over it the picture changed
  step_min: 4, // a stepped run: at least this many equal-spaced steps (every 2nd, 3rd or 4th frame)
  tower: 2, // inside a stepped run a cut must also be this many times the run's 90th-percentile step
  flicker_run: 3, // this many frames over the floor in a row: a flash or a strobe, not a cut
  merge_f: 2, // cuts this close are one
  burst_gap_s: 0.5, burst_min: 3, // a burst: 3 cuts or more, each within 0.5 s of the last
  still: 0.8, // a frame is still when every difference within +-2 frames is under this
  bin_s: 0.5,
};
// family bounds on the time to half the distance (t50): the same as lib/fluent.mjs shapeOf
export const familyOfT50 = (t) => (t < 0.115 ? "snap" : t < 0.18 ? "decelerate" : t < 0.31 ? "glide" : t < 0.42 ? "soft" : t <= 0.58 ? "symmetric" : "accelerate");

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${file}`);
  const j = JSON.parse(r.stdout), s = j.streams[0], [a, b] = String(s.r_frame_rate).split("/").map(Number);
  return { w: s.width, h: s.height, fps: b ? a / b : a, duration: Number(j.format.duration) || 0 };
}

// ---------------------------------------------------------------- frame differences
export function frameDiffs(file) {
  const meta = probe(file), fps = meta.fps > 30.5 ? 30 : meta.fps;
  const AW = 160, AH = 90, size = AW * AH;
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `fps=${fps},scale=${AW}:${AH}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const diffs = [0];
    let buf = Buffer.alloc(0), prev = null, err = "";
    p.stdout.on("data", (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      while (buf.length >= size) {
        const cur = buf.subarray(0, size);
        if (prev) { let s = 0; for (let i = 0; i < size; i++) { const d = cur[i] - prev[i]; s += d < 0 ? -d : d; } diffs.push(s / size); }
        prev = Buffer.from(cur);
        buf = buf.subarray(size);
      }
    });
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ diffs, fps, ...meta }) : reject(new Error(`ffmpeg failed: ${err.trim().split("\n").pop() || code}`))));
  });
}

// the same, synchronously (brandfilm's frame sampling is synchronous); the whole grey stream is held in memory (14 KB a frame)
export function frameDiffsSync(file) {
  const meta = probe(file), fps = meta.fps > 30.5 ? 30 : meta.fps;
  const AW = 160, AH = 90, size = AW * AH;
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `fps=${fps},scale=${AW}:${AH}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 2 ** 31, timeout: 600000 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${file}`);
  const b = r.stdout, n = Math.floor(b.length / size), diffs = [0];
  for (let f = 1; f < n; f++) { let s = 0; const a = f * size, c = (f - 1) * size; for (let i = 0; i < size; i++) { const d = b[a + i] - b[c + i]; s += d < 0 ? -d : d; } diffs.push(s / size); }
  return { diffs, fps, ...meta };
}
// cut times in seconds with the robust detector (null when the film cannot be read)
export function cutTimes(file) {
  try { const F = frameDiffsSync(file); return robustCuts(F.diffs, F.fps).cuts.map((c) => c.t); } catch { return null; }
}

// ---------------------------------------------------------------- the robust cut detector
export function robustCuts(d, fps) {
  const n = d.length;
  const around = (i, keep) => { const v = []; for (let j = Math.max(1, i - CUT.win); j <= Math.min(n - 1, i + CUT.win); j++) if (j !== i && keep(d[j])) v.push(d[j]); return v; };
  const nz = d.map((v) => v > CUT.zero);
  // stepped runs: nonzero differences exactly p apart (p = 2, 3, 4), the frames between them exact repeats, step_min times or more
  const stepped = new Array(n).fill(false), runs = [];
  for (const p of [2, 3, 4]) {
    let i = 1;
    while (i < n) {
      if (!nz[i]) { i++; continue; }
      let j = i, cnt = 1;
      const quietBetween = (a) => { for (let k = a + 1; k < a + p; k++) if (k < n && nz[k]) return false; return true; };
      while (j + p < n && nz[j + p] && quietBetween(j)) { j += p; cnt++; }
      if (cnt >= CUT.step_min) {
        const end = Math.min(n - 1, j + p - 1);
        for (let k = i; k <= end; k++) stepped[k] = true;
        runs.push({ f0: i, f1: end, every: p });
        i = j + 1;
      } else i++;
    }
  }
  // flicker runs: a run of frames over the floor in a row (a flash, a strobe at every frame). Strobing every 2nd or 3rd frame is a stepped run
  // (nothing tells it from animation on 2s but its steps), where a cut must tower over the steps
  const hi = d.map((v) => v > CUT.floor), flicker = new Array(n).fill(false), fruns = [];
  for (let i = 1; i < n;) {
    if (!hi[i]) { i++; continue; }
    let j = i; while (j + 1 < n && hi[j + 1]) j++;
    if (j - i + 1 >= CUT.flicker_run) { for (let k = i; k <= j; k++) flicker[k] = true; fruns.push({ f0: i, f1: j, why: "consecutive" }); }
    i = j + 1;
  }
  const raw = [], dropped = [];
  for (let i = 1; i < n; i++) {
    const med = median(around(i, () => true));
    if (!(d[i] > Math.max(CUT.floor, CUT.mult * med))) continue;
    if (flicker[i]) { dropped.push({ f: i, t: r3(i / fps), diff: r2(d[i]), why: "inside a flicker run" }); continue; }
    if (stepped[i]) {
      const steps = around(i, (v) => v > CUT.zero);
      if (!(d[i] > CUT.mult * median(steps) && d[i] > CUT.tower * pct(steps, 0.9))) { dropped.push({ f: i, t: r3(i / fps), diff: r2(d[i]), why: "inside a stepped run (a step, not a cut)" }); continue; }
    }
    raw.push({ f: i, diff: d[i] });
  }
  const cuts = [];
  for (const c of raw) {
    const last = cuts[cuts.length - 1];
    if (last && c.f - last.f <= CUT.merge_f) { if (c.diff > last.diff) cuts[cuts.length - 1] = c; } else cuts.push(c);
  }
  const out = cuts.map((c) => ({ f: c.f, t: r3(c.f / fps), diff: r2(c.diff) }));
  const bursts = [];
  for (let i = 0; i < out.length;) {
    let j = i; while (j + 1 < out.length && out[j + 1].t - out[j].t <= CUT.burst_gap_s) j++;
    if (j - i + 1 >= CUT.burst_min) bursts.push({ t0: out[i].t, t1: out[j].t, cuts: j - i + 1 });
    i = j + 1;
  }
  return { cuts: out, dropped, bursts, stepped_runs: runs.map((r) => ({ t0: r3(r.f0 / fps), t1: r3(r.f1 / fps), every: r.every })), flicker_runs: fruns.map((r) => ({ t0: r3(r.f0 / fps), t1: r3(r.f1 / fps), why: r.why })) };
}

// the shot lengths between cuts and how much they vary
export function shotLengths(cuts, dur) {
  const b = [0, ...cuts.map((c) => c.t), dur], lens = [];
  for (let i = 1; i < b.length; i++) if (b[i] - b[i - 1] > 0.001) lens.push(r3(b[i] - b[i - 1]));
  const p10 = pct(lens, 0.1), p90 = pct(lens, 0.9);
  return { shots: lens.length, lengths_s: lens, median_s: r3(median(lens)), min_s: r3(Math.min(...lens)), max_s: r3(Math.max(...lens)), spread_p90_p10: p10 > 0 ? r2(p90 / p10) : null, spread_max_min: r2(Math.max(...lens) / Math.max(0.001, Math.min(...lens))) };
}

// motion energy per bin (the mean difference of the non-cut frames) and the still share
export function energyCurve(d, fps, cuts, dur) {
  const isCut = new Set(cuts.map((c) => c.f));
  const per = Math.max(1, Math.round(CUT.bin_s * fps)), bins = [];
  for (let i = 0; i < d.length; i += per) {
    const v = []; for (let k = i; k < Math.min(d.length, i + per); k++) if (k > 0 && !isCut.has(k)) v.push(Math.min(d[k], 40));
    bins.push(v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  }
  const ref = pct(bins, 0.9) || 1;
  let still = 0, counted = 0;
  for (let i = 1; i < d.length; i++) {
    if (isCut.has(i)) continue;
    let m = 0; for (let k = Math.max(1, i - 2); k <= Math.min(d.length - 1, i + 2); k++) if (!isCut.has(k)) m = Math.max(m, d[k]);
    counted++; if (m < CUT.still) still++;
  }
  return { step_s: CUT.bin_s, energy: bins.map((b) => r2(b)), energy_norm: bins.map((b) => r2(b / ref)), energy_p90: r2(ref), still_share: counted ? r3(still / counted) : null, duration_s: r2(dur) };
}

// ---------------------------------------------------------------- the sound arc
export async function soundArc(file, cuts = []) {
  const A = await import("./audio.mjs");
  if (!A.hasAudioStream(file)) return { audio: false };
  const y = A.decode(file, { sr: A.SR });
  const mom = A.momentaryDb(y, 0.1, A.SR), per = [];
  for (let s = 0; s * 10 < mom.length; s++) {
    const w = mom.slice(s * 10, s * 10 + 10).filter((v) => v > -80);
    per.push({ t: s, median_db: w.length ? r2(median(w)) : null, p90_db: w.length ? r2(pct(w, 0.9)) : null });
  }
  const onsets = A.onsetTimes(y), secs = Math.max(1, Math.ceil(y.length / A.SR));
  const onsetPerS = Array.from({ length: secs }, (_, s) => onsets.filter((t) => t >= s && t < s + 1).length);
  const live = mom.filter((v) => v > -80);
  return {
    audio: true, loudness_per_s: per,
    loudness: { median_db: r2(median(live)), p90_db: r2(pct(live, 0.9)), range_db: r2(pct(live, 0.9) - pct(live, 0.1)) },
    onsets, onsets_per_s: onsetPerS, onset_rate: r2(onsets.length / secs),
    cut_on_onset: cuts.length && onsets.length ? A.cutOnsetShare(cuts.map((c) => c.t), onsets) : null,
    note: "onsets are the strongest 25% of spectral-flux peaks; the centroid is not measured",
  };
}

// ---------------------------------------------------------------- everything
// opts: { only: ["cuts","motion","camera","echo","bold","sound"] (default all), log }
export async function deconstruct(file, opts = {}) {
  const want = (k) => !opts.only || opts.only.includes(k);
  const log = opts.log || (() => {});
  const out = { source: path.basename(file), measured: [], skipped: [], note: "numbers to score a draft against, never pictures to copy" };
  log("frame differences");
  const F = await frameDiffs(file);
  out.duration_s = r2(F.duration); out.fps = r2(F.fps); out.size = [F.w, F.h];
  const C = robustCuts(F.diffs, F.fps);
  out.cuts = { count: C.cuts.length, per_min: r2((C.cuts.length / F.duration) * 60), list: C.cuts, bursts: C.bursts, dropped: C.dropped, stepped_runs: C.stepped_runs, flicker_runs: C.flicker_runs };
  out.shots = shotLengths(C.cuts, F.duration);
  out.energy = energyCurve(F.diffs, F.fps, C.cuts, F.duration);
  out.measured.push("cuts", "shots", "energy");
  const soft = async (key, fn) => { if (!want(key)) return; try { log(key); const v = await fn(); out[key === "bold" ? "boldness" : key] = v; out.measured.push(key); } catch (e) { out.skipped.push(`${key}: ${String(e.message || e).split("\n")[0]}`); } };
  await soft("motion", async () => {
    const { analyse } = await import("./fluency.mjs");
    const R = await analyse(file, { series: true });
    const moves = (R._series && R._series.moves) || [], t50 = moves.map((m) => m.t50).filter((t) => t != null);
    const fam = {}; for (const t of t50) { const f = familyOfT50(t); fam[f] = (fam[f] || 0) + 1; }
    const dominant = Object.entries(fam).sort((a, b) => b[1] - a[1])[0];
    return {
      moves: R.moves, moves_per_s: R.moves_per_s, median_move_s: R.move_dur_med, median_move_frames: R.move_dur_med != null ? Math.round(R.move_dur_med * R.fps) : null,
      long_move_share: R.long_move_share, curve_families: fam, dominant_family: dominant ? dominant[0] : null, t50_median: t50.length ? r3(median(t50)) : null, t50_iqr: R.shape_iqr,
      overshoot_share: R.overshoot_share, hard_start_share: R.hard_start_share, arc_share: R.arc_share, concurrent_mean: R.conc_mean, concurrent_ge2: R.conc_ge2,
      dead_frac: R.dead_frac, holds_ge_0_5s: R.holds_ge_0_5s, camera_frac: R.camera_frac, cut_carry: R.cut_carry, cut_still: R.cut_still, fluency_cuts: R.cuts,
      note: R.moves < 15 ? "fewer than 15 moves tracked: the curve statistics say little" : undefined,
    };
  });
  await soft("camera", async () => {
    const { measureCamera } = await import("./camera-moves.mjs");
    const c = await measureCamera(file);
    const byKind = {}; for (const m of c.moves || []) byKind[m.kind] = (byKind[m.kind] || 0) + 1;
    return { kinds: c.kinds, moves_by_kind: byKind, locked_share: c.locked_share, moves: (c.moves || []).map((m) => ({ kind: m.kind, t0: m.t0, t1: m.t1 })) };
  });
  await soft("echo", async () => {
    const { measureEcho } = await import("./echo.mjs");
    const e = measureEcho(file);
    return e.echo == null ? { echo: null, note: e.note } : { echo: e.echo, palette: e.palette, mass: e.mass, edges: e.edges, identical: e.identical, opening_t: e.opening.t, ending_t: e.ending.t, ending: e.ending.which };
  });
  await soft("bold", async () => {
    const { measureCurve } = await import("./emphasis.mjs");
    const m = await measureCurve(file);
    const big = m.bold.filter((f) => f.big).length;
    return { share: m.bold.length ? r3(big / m.bold.length) : null, samples: m.bold.length, step_s: 0.25, big_times: m.bold.filter((f) => f.big).map((f) => f.t) };
  });
  if (want("sound")) { try { log("sound"); out.sound = await soundArc(file, C.cuts); out.measured.push("sound"); } catch (e) { out.skipped.push(`sound: ${String(e.message || e).split("\n")[0]}`); } }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("deconstruct.mjs")) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node lib/deconstruct.mjs <ref.mp4> [out.json]"); process.exit(1); }
  const r = await deconstruct(path.resolve(file));
  const o = process.argv[3];
  if (o) { fs.mkdirSync(path.dirname(path.resolve(o)), { recursive: true }); fs.writeFileSync(o, JSON.stringify(r, null, 2)); }
  console.log(JSON.stringify({ cuts: r.cuts.count, shots: r.shots.shots, still_share: r.energy.still_share, measured: r.measured, skipped: r.skipped }));
}
