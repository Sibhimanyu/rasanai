// ffmpeg-only measurements for reference-motion: scene cuts, sampled frame stats, per-shot estimates, audio onsets.
// Deterministic for a given file. Everything here is an estimate from cheap statistics, never exact motion curves.
import { run, round } from "./probe.mjs";

const MAX_FAST_FRAMES = 24, MAX_FULL_FRAMES = 96;

export function detectCuts(file, fast, duration) {
  const vf = `${fast ? "scale=320:-2," : ""}select='gt(scene,0.3)',showinfo`;
  const r = run("ffmpeg", ["-v", "info", "-nostdin", "-i", file, "-an", "-vf", vf, "-f", "null", "-"]);
  const cuts = [];
  for (const m of (r.stderr || "").matchAll(/pts_time:([0-9.]+)/g)) cuts.push(round(Number(m[1]), 2));
  const out = [];
  for (const c of cuts.sort((a, b) => a - b)) if (c > 0.25 && c < duration - 0.25 && (!out.length || c - out[out.length - 1] >= 0.3)) out.push(c);
  return out;
}

// Raw rgb24 frames at 64x36, N uniformly spaced; returns per-frame stats.
export function sampleFrames(file, duration, fast) {
  const n = Math.max(2, Math.min(fast ? MAX_FAST_FRAMES : MAX_FULL_FRAMES, Math.ceil(duration * (fast ? 2 : 4))));
  const W = 64, H = 36, fps = n / duration;
  const r = run("ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-an", "-vf", `fps=${fps.toFixed(6)},scale=${W}:${H}:flags=area,format=rgb24`, "-frames:v", String(n), "-f", "rawvideo", "-"], { raw: true });
  const buf = r.stdout || Buffer.alloc(0), fsz = W * H * 3, count = Math.floor(buf.length / fsz);
  const frames = [];
  let prev = null;
  for (let i = 0; i < count; i++) {
    const px = buf.subarray(i * fsz, (i + 1) * fsz), g = new Float32Array(W * H);
    let sum = 0;
    for (let k = 0; k < W * H; k++) { g[k] = 0.299 * px[k * 3] + 0.587 * px[k * 3 + 1] + 0.114 * px[k * 3 + 2]; sum += g[k]; }
    let diff = 0, edge = 0, centerEdge = 0, centerN = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (prev) diff += Math.abs(g[k] - prev[k]);
      if (x + 1 < W && y + 1 < H) {
        const e = Math.abs(g[k] - g[k + 1]) + Math.abs(g[k] - g[k + W]);
        edge += e;
        if (x >= W / 4 && x < (3 * W) / 4 && y >= H / 4 && y < (3 * H) / 4) { centerEdge += e; centerN++; }
      }
    }
    frames.push({
      t: round((i + 0.5) / fps, 2), mean: sum / (W * H), diff: prev ? diff / (W * H) / 255 : 0,
      edge: edge / (W * H) / 255, centerShare: edge > 0 ? centerEdge / centerN / (edge / (W * H)) : 1, px,
    });
    prev = g;
  }
  return frames;
}

export function palette(frames) {
  const bins = new Map();
  for (const f of frames) for (let k = 0; k < f.px.length; k += 3) {
    const key = ((f.px[k] >> 5) << 6) | ((f.px[k + 1] >> 5) << 3) | (f.px[k + 2] >> 5);
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const top = [...bins.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const out = [];
  for (const [key] of top) {
    const c = [((key >> 6) & 7) * 36 + 18, ((key >> 3) & 7) * 36 + 18, (key & 7) * 36 + 18];
    if (out.some((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) + Math.abs(o[2] - c[2]) < 90)) continue;
    out.push(c);
    if (out.length >= 5) break;
  }
  return out.map((c) => "#" + c.map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join(""));
}

const avg = (a, f) => (a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0);

export function buildShots(duration, cuts, frames) {
  const bounds = [0, ...cuts, duration];
  const raw = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i], b = bounds[i + 1];
    const fs = frames.filter((f) => f.t >= a && f.t < b);
    // the first sample after a cut differs because of the cut itself: leave it out of the motion estimate
    const inner = i > 0 ? fs.slice(1) : fs;
    raw.push({ a, b, n: fs.length, md: avg(inner, (f) => f.diff), cs: avg(fs, (f) => f.centerShare), mean: avg(fs, (f) => f.mean) });
  }
  const maxMd = Math.max(1e-6, ...raw.map((s) => s.md));
  return raw.map((s) => {
    const low = s.n < 2;
    const motion_role = low ? "unknown" : s.md < 0.004 ? "held" : s.md < 0.02 ? "drift" : s.md < 0.06 ? "active" : "busy";
    const framing = low ? "unknown" : s.cs > 1.5 ? "centered-subject" : s.cs < 0.8 ? "edge-heavy-or-wide" : "balanced";
    const observations = low
      ? ["shot too short for the sample rate; no per-shot stats"]
      : [
        `pixel change between samples reads as ${motion_role} (mean ${round(s.md, 3)})`,
        `detail ${s.cs > 1.5 ? "concentrated in the middle of frame" : s.cs < 0.8 ? "spread toward the edges" : "spread evenly"}`,
        `average brightness ${s.mean < 70 ? "dark" : s.mean > 170 ? "bright" : "mid"}`,
      ];
    return {
      start_s: round(s.a, 2), end_s: round(s.b, 2), framing, motion_role, observations,
      confidence: low ? "low" : "medium", _energy: round(Math.min(1, s.md / maxMd), 2),
    };
  });
}

// Node onset pass on 8 kHz mono float PCM piped from ffmpeg: positive RMS-dB flux above an adaptive threshold.
export function audioHits(file, duration) {
  const SR = 8000, HOP = 160; // 20 ms
  const r = run("ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-vn", "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { raw: true });
  const buf = r.stdout || Buffer.alloc(0), n = Math.floor(buf.length / 4);
  if (n < HOP * 4) return { hits: [], ok: false };
  const pcm = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + n * 4));
  const db = [];
  for (let i = 0; i + HOP <= n; i += HOP) {
    let s = 0; for (let k = 0; k < HOP; k++) s += pcm[i + k] * pcm[i + k];
    db.push(10 * Math.log10(s / HOP + 1e-10));
  }
  const flux = db.map((v, i) => (i ? Math.max(0, v - db[i - 1]) : 0));
  const nz = flux.filter((v) => v > 0), mean = nz.length ? nz.reduce((s, v) => s + v, 0) / nz.length : 0;
  const thr = Math.max(6, mean * 3);
  const hits = [];
  for (let i = 1; i < flux.length; i++) {
    if (flux[i] >= thr && db[i] > -50) {
      const t = round(i * 0.02, 2);
      if (!hits.length || t - hits[hits.length - 1] >= 0.15) hits.push(t);
    }
  }
  return { hits: hits.filter((t) => t <= duration + 0.1), ok: true };
}
