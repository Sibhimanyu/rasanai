// Adapted from cooked. (MIT, Copyright (c) 2026 NextWork), plugins/creator-teardown/skills/creator-teardown/scripts/visual.py constants L51-62, candidates() L76-90, analyse() L93-130 (hand-written pushes and punches), best_scale() L60-75, cut_kind() L178-219, speech() L356-372, zoom_block() L374-394 @3b236ec; ported to Node and modified by RasanAI. Credit: third_party/cooked/.
// (Line numbers are the pinned upstream file's; the pin is 3b236ec8fe32343cdf38375df90f6cd71e0846d7.)
//
// Cut kinds and zoom moves, measured on small grey frames (108 px short side). Complements lib/deconstruct.mjs robustCuts: the
// RasanAI cut list stays authoritative; this module names each cut (hard, jump, match, whip, mask, dissolve, zoom-punch), finds
// the zoom punches that are NOT cuts (a scaled copy of the same picture), the slow pushes inside shots, and (with words) how the
// zooms line up with the speech. Numbers describe a reference's editing; nothing of its pictures is kept.
//
//   node lib/cutkinds.mjs <file>     prints classifyCuts(file)
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

export const CUTKINDS_VERSION = "cutkinds@1";
export const K = {
  SMALL: 108, BLOCK: 8, SPIKE: 2.5, WIN: 7, SHOT_R: 10.0, SHOT_H: 0.30, ZOOM_H: 0.15, JUMP_R: 3.0, JUMP_SPIKE: 4.0,
  PUNCH_SCALES: [1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0],
  PUSH_SCALES: [1.02, 1.04, 1.06, 1.08, 1.1, 1.15],
  PUSH_STEP_S: 0.5, MAX_CANDIDATES: 400,
};

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// the six-line ffprobe pattern of deconstruct.mjs:probe, plus the rotation tag (ffmpeg auto-rotates, ffprobe's size is unrotated)
function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:stream_side_data=rotation:stream_tags=rotate:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${file}`);
  const j = JSON.parse(r.stdout), s = j.streams[0], [a, b] = String(s.r_frame_rate).split("/").map(Number);
  const rot = Math.abs(Number((s.side_data_list || []).find((d) => d.rotation != null)?.rotation ?? s.tags?.rotate ?? 0)) % 180;
  return { w: rot === 90 ? s.height : s.width, h: rot === 90 ? s.width : s.height, fps: b ? a / b : a, duration: Number(j.format.duration) || 0 };
}

// ---------------------------------------------------------------- frames
export async function grayFrames(file, { short = K.SMALL, fps = null } = {}) {
  const meta = probe(file), rate = fps || (meta.fps > 30 ? 30 : meta.fps);
  const even = (x) => Math.max(2, Math.round(x / 2) * 2);
  const w = meta.w <= meta.h ? short : even((short * meta.w) / meta.h), h = meta.w <= meta.h ? even((short * meta.h) / meta.w) : short;
  const vf = `fps=${rate},scale=${w}:${h}:flags=area,format=gray`;
  const size = w * h;
  const chunks = await new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const out = []; let err = "";
    p.stdout.on("data", (c) => out.push(c));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg failed: ${err.trim().split("\n").pop() || code}`))));
  });
  const buf = Buffer.concat(chunks), n = Math.floor(buf.length / size), frames = new Array(n);
  for (let i = 0; i < n; i++) { const f = new Float32Array(size), o = i * size; for (let k = 0; k < size; k++) f[k] = buf[o + k]; frames[i] = f; }
  return { w, h, fps: rate, n, frames };
}

// ---------------------------------------------------------------- measures
const meanAbsDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d < 0 ? -d : d; } return s / a.length; };

// median over 8x8 blocks of the mean |a - b|: robust to a person moving or a card popping on (most blocks are background)
export function blockMedian(a, b, w, h) {
  const B = K.BLOCK, bw = Math.floor(w / B), bh = Math.floor(h / B), m = new Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0;
    for (let y = 0; y < B; y++) { const o = (by * B + y) * w + bx * B; for (let x = 0; x < B; x++) { const d = a[o + x] - b[o + x]; s += d < 0 ? -d : d; } }
    m[by * bw + bx] = s / (B * B);
  }
  return median(m);
}

// 32 bins over 0..255, each a share of the pixels; L1 distance (0..2)
export function histJump(a, b) {
  const ha = new Float64Array(32), hb = new Float64Array(32);
  for (let i = 0; i < a.length; i++) { ha[Math.min(31, a[i] >> 3)]++; hb[Math.min(31, b[i] >> 3)]++; }
  let s = 0;
  for (let k = 0; k < 32; k++) s += Math.abs(ha[k] / a.length - hb[k] / b.length);
  return s;
}

// src cropped to the box (x0, y0, cw, ch) and bilinearly resized to w x h
function cropResize(src, w, h, x0, y0, cw, ch, out) {
  const kx = cw / w, ky = ch / h;
  for (let y = 0; y < h; y++) {
    let sy = y0 + (y + 0.5) * ky - 0.5; sy = sy < 0 ? 0 : sy > h - 1 ? h - 1 : sy;
    const iy = Math.floor(sy), fy = sy - iy, iy2 = Math.min(h - 1, iy + 1);
    for (let x = 0; x < w; x++) {
      let sx = x0 + (x + 0.5) * kx - 0.5; sx = sx < 0 ? 0 : sx > w - 1 ? w - 1 : sx;
      const ix = Math.floor(sx), fx = sx - ix, ix2 = Math.min(w - 1, ix + 1);
      const top = src[iy * w + ix] * (1 - fx) + src[iy * w + ix2] * fx, bot = src[iy2 * w + ix] * (1 - fx) + src[iy2 * w + ix2] * fx;
      out[y * w + x] = top * (1 - fy) + bot * fy;
    }
  }
}

// b looks like a zoomed by `scale` (>1 in, <1 out); a steps x steps grid of crop offsets per scale, both directions
export function bestScale(a, b, w, h, scales, steps = 5) {
  let best = { scale: 1.0, residual: blockMedian(a, b, w, h) };
  const z = new Float32Array(w * h);
  for (const [src, dst, sign] of [[a, b, 1], [b, a, -1]]) {
    for (const s of scales) {
      const cw = w / s, ch = h / s;
      for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
        const dx = steps === 1 ? 0 : -(w - cw) / 2 + (i * (w - cw)) / (steps - 1), dy = steps === 1 ? 0 : -(h - ch) / 2 + (j * (h - ch)) / (steps - 1);
        cropResize(src, w, h, (w - cw) / 2 + dx, (h - ch) / 2 + dy, cw, ch, z);
        const r = blockMedian(z, dst, w, h);
        if (r < best.residual) best = { scale: sign === 1 ? s : 1 / s, residual: r };
      }
    }
  }
  return best;
}

// frames whose difference to the next spikes above their neighbours: [{ i, spike }]
export function spikeCandidates(F) {
  const d = new Float64Array(Math.max(0, F.length - 1)), out = [];
  for (let i = 0; i < d.length; i++) d[i] = meanAbsDiff(F[i], F[i + 1]);
  for (let i = 0; i < d.length; i++) {
    const lo = Math.max(0, i - K.WIN), hi = Math.min(d.length, i + K.WIN + 1), nb = [];
    let mx = -Infinity;
    for (let j = lo; j < hi; j++) { if (j !== i) nb.push(d[j]); if (d[j] > mx) mx = d[j]; }
    const base = nb.length ? median(nb) : 0;
    if (d[i] === mx && d[i] > Math.max(K.SPIKE * base, K.SPIKE)) out.push({ i, spike: d[i] / Math.max(base, 0.1) });
  }
  return out;
}

function sharpness(f, w, h) {
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x, l = -4 * f[k] + f[k - w] + f[k + w] + f[k - 1] + f[k + 1];
    s += l; s2 += l * l; n++;
  }
  return n ? s2 / n - (s / n) ** 2 : 0;
}

function edgeVector(f, w, h) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1), y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
    const gx = (f[y * w + x1] - f[y * w + x0]) / (x1 - x0), gy = (f[y1 * w + x] - f[y0 * w + x]) / (y1 - y0);
    g[y * w + x] = Math.hypot(gx, gy);
  }
  const C = 12, bw = Math.floor(w / C), bh = Math.floor(h / C), v = new Float64Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) s += g[(by * C + y) * w + bx * C + x];
    v[by * bw + bx] = s / (C * C);
  }
  let m = 0; for (const x of v) m += x; m /= v.length || 1;
  let sd = 0; for (const x of v) sd += (x - m) ** 2; sd = Math.sqrt(sd / (v.length || 1));
  return v.map((x) => (x - m) / (sd + 1e-6));
}

// what kind of cut lands at frame c (the first frame after it):
//   zoom-punch  the next shot is the same picture scaled      whip      the frames round the cut are motion-blurred
//   dissolve    over 2+ frames every pixel is a blend         mask      part of the frame is already the next shot
//   jump        the set lines up across the cut               match     an instant change whose layout of edges lines up
//   hard        an instant change to a new picture
export function cutKind(F, c, w, h, punchOnCut) {
  const n = F.length;
  if (punchOnCut) return "zoom-punch";
  c = Math.max(1, Math.min(n - 1, c));
  const pre = F[Math.max(0, c - 4)], post = F[Math.min(n - 1, c + 3)];
  const around = [], shots = [];
  for (let k = Math.max(0, c - 2); k < Math.min(n, c + 2); k++) around.push(sharpness(F[k], w, h));
  for (let k = Math.max(0, c - 9); k < Math.max(0, c - 4); k++) shots.push(sharpness(F[k], w, h));
  for (let k = Math.min(n, c + 4); k < Math.min(n, c + 9); k++) shots.push(sharpness(F[k], w, h));
  if (shots.length && around.length && Math.min(...around) < 0.4 * median(shots)) return "whip";
  const idx = [];
  for (let i = 0; i < pre.length; i++) if (Math.abs(post[i] - pre[i]) > 20) idx.push(i);
  let step = 1;
  if (idx.length) {
    let a = 0, b = 0;
    for (const i of idx) { a += Math.abs(F[c][i] - F[c - 1][i]); b += Math.abs(post[i] - pre[i]); }
    step = (a / idx.length) / (b / idx.length + 1e-6);
  }
  if (idx.length / pre.length > 0.05 && step < 0.6) { // most of the change is not in the one frame: gradual
    const mids = [];
    for (let k = Math.max(0, c - 3); k < Math.min(n, c + 3); k++) {
      const p = idx.map((i) => Math.min(1, Math.max(0, Math.abs(F[k][i] - pre[i]) / (Math.abs(post[i] - pre[i]) + 1e-6))));
      const m = p.reduce((x, y) => x + y, 0) / p.length;
      if (m > 0.15 && m < 0.85) mids.push(p);
    }
    if (mids.length >= 2) {
      let tot = 0, ext = 0;
      for (const p of mids) for (const v of p) { tot++; if (v < 0.2 || v > 0.8) ext++; }
      return ext / tot > 0.6 ? "mask" : "dissolve";
    }
  }
  const B = K.BLOCK, bw = Math.floor(w / B), bh = Math.floor(h / B);
  let low = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0;
    for (let y = 0; y < B; y++) { const o = (by * B + y) * w + bx * B; for (let x = 0; x < B; x++) s += Math.abs(F[c - 1][o + x] - F[c][o + x]); }
    if (s / (B * B) < 8) low++;
  }
  if (low / (bw * bh) >= 0.3) return "jump";
  const e1 = edgeVector(F[c - 1], w, h), e2 = edgeVector(F[c], w, h);
  let dot = 0; for (let i = 0; i < e1.length; i++) dot += e1[i] * e2[i];
  if (e1.length && dot / e1.length > 0.6) return "match";
  return "hard";
}

// ---------------------------------------------------------------- speech and zoom block
function speechOf(words) {
  const ws = (words || []).filter((x) => x && Number.isFinite(x.start) && Number.isFinite(x.end));
  if (ws.length < 2) return null;
  const dur = ws[ws.length - 1].end;
  if (!(dur > 0)) return null;
  const gaps = ws.slice(1).map((b, i) => b.start - ws[i].end);
  const starts = [ws[0].start];
  ws.slice(1).forEach((b, i) => { if (gaps[i] >= 0.25 || /[.?!]$/.test(String(ws[i].text || "").trimEnd())) starts.push(b.start); });
  const real = gaps.filter((g) => g > 0.05).sort((x, y) => x - y);
  const pause = real.length ? real[Math.floor(0.9 * (real.length - 1))] : 0; // the 90th percentile gap: between phrases, not a one-off
  return { wpm: Math.round((ws.length / dur) * 60), max_pause_s: r2(pause), sentence_starts: starts.length, _starts: starts };
}

function zoomBlock(zooms, minutes, sp, hasWords) {
  if (!zooms.length) return { per_min: 0, kind: null, scale: 1, duration_s: 0, on: null };
  const counts = {}; for (const z of zooms) counts[z.kind] = (counts[z.kind] || 0) + 1;
  const kind = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const mine = zooms.filter((z) => z.kind === kind);
  const onCut = mine.filter((z) => z.on_cut).length / mine.length;
  const near = sp && hasWords ? mine.filter((z) => sp._starts.some((s) => Math.abs(z.t - s) <= 0.3)).length / mine.length : 0;
  const on = onCut >= 0.7 ? "every_cut" : near >= 0.5 ? "sentence_start" : "emphasis";
  return {
    per_min: minutes ? r2(zooms.length / minutes) : 0, kind,
    scale: r2(median(mine.map((z) => Math.max(z.scale, 1 / z.scale)))), duration_s: r2(median(mine.map((z) => z.duration_s))), on,
  };
}

// ---------------------------------------------------------------- classify
export async function classifyCuts(file, { cuts = null, words = null } = {}) {
  const { w, h, fps, n, frames: F } = await grayFrames(file);
  const notes = [], zooms = [], notCuts = [], found = []; // found: { f, source, kind }
  const t3 = (f) => r3(f / fps);
  let cand = spikeCandidates(F);
  if (cand.length > K.MAX_CANDIDATES) { cand = cand.sort((a, b) => b.spike - a.spike).slice(0, K.MAX_CANDIDATES).sort((a, b) => a.i - b.i); notes.push(`candidates capped at the ${K.MAX_CANDIDATES} strongest spikes`); }
  const robust = Array.isArray(cuts) ? cuts.map((c) => c.f).filter((f) => Number.isInteger(f) && f >= 1 && f < n) : null;
  const near = (f) => robust && robust.some((r) => Math.abs(r - f) <= 2);

  // the verdict on one candidate frame i (the cut would be at i + 1): the upstream analyse() branch
  const judge = (i, spike) => {
    const a = F[Math.max(0, i - 1)], b = F[Math.min(n - 1, i + 2)];
    const r1 = blockMedian(a, b, w, h), hj = histJump(F[i], F[i + 1]);
    const gestureOnly = r1 <= K.SHOT_R && hj <= K.SHOT_H && !(r1 >= K.JUMP_R && spike >= K.JUMP_SPIKE);
    const jumpish = r1 >= K.JUMP_R && spike >= K.JUMP_SPIKE;
    let s = 1.0, rb = r1;
    if (!gestureOnly && r1 > 2) ({ scale: s, residual: rb } = bestScale(a, b, w, h, K.PUNCH_SCALES, 9));
    const scaled = s !== 1.0 && rb < 0.5 * r1;
    return { r1, hj, gestureOnly, jumpish, s, scaled };
  };

  if (robust) {
    // the RasanAI cuts stay authoritative: each gets a kind; a pure scaled copy is a zoom, not a cut
    for (const f of robust) {
      const i = f - 1, v = judge(i, 1);
      if (v.scaled) {
        zooms.push({ t: t3(f), kind: "punch", scale: r2(v.s), duration_s: 0, on_cut: v.hj >= K.ZOOM_H });
        if (v.hj < K.ZOOM_H) { notCuts.push({ t: t3(f), why: "zoom punch (scaled copy, histogram steady)" }); continue; }
      }
      found.push({ f, source: "robust", punch: v.scaled && v.hj >= K.ZOOM_H });
    }
    // candidates no robust cut explains: an unseen punch, or a jump cut on a locked-off camera
    for (const { i, spike } of cand) {
      const f = i + 1;
      if (near(f)) continue;
      const v = judge(i, spike);
      if (v.gestureOnly) continue;
      if (v.scaled) {
        zooms.push({ t: t3(f), kind: "punch", scale: r2(v.s), duration_s: 0, on_cut: v.hj >= K.ZOOM_H });
        if (v.hj < K.ZOOM_H) { notCuts.push({ t: t3(f), why: "zoom punch (scaled copy, histogram steady)" }); continue; }
        found.push({ f, source: "jump-detector", punch: true });
      } else if (v.jumpish) found.push({ f, source: "jump-detector", punch: false });
    }
  } else {
    for (const { i, spike } of cand) {
      const f = i + 1, v = judge(i, spike);
      if (v.gestureOnly) continue; // a gesture, or a small graphic
      if (v.scaled) zooms.push({ t: t3(f), kind: "punch", scale: r2(v.s), duration_s: 0, on_cut: v.hj >= K.ZOOM_H });
      if (v.scaled && v.hj < K.ZOOM_H) { notCuts.push({ t: t3(f), why: "zoom punch (scaled copy, histogram steady)" }); continue; }
      found.push({ f, source: "robust", punch: v.scaled && v.hj >= K.ZOOM_H });
    }
  }
  found.sort((a, b) => a.f - b.f);
  for (const c of found) c.kind = cutKind(F, c.f, w, h, c.punch);

  // pushes: a steady scale change inside a shot, sampled every PUSH_STEP_S, 2 steps in the same direction or more
  const edges = [0, ...found.map((c) => c.f), n], stepF = Math.max(1, Math.round(K.PUSH_STEP_S * fps));
  const pushOf = (run) => ({ t: r3(run[0].j / fps), kind: "push", scale: r2(run.reduce((p, x) => p * x.s, 1)), duration_s: r2((run[run.length - 1].k - run[0].j) / fps), on_cut: false });
  for (let e = 0; e + 1 < edges.length; e++) {
    const idx = []; for (let j = edges[e] + 2; j < edges[e + 1] - 2; j += stepF) idx.push(j);
    let run = [];
    for (let q = 0; q + 1 < idx.length; q++) {
      const j = idx[q], k = idx[q + 1], { scale: s, residual: rb } = bestScale(F[j], F[k], w, h, K.PUSH_SCALES);
      const moving = s !== 1.0 && rb < 0.7 * blockMedian(F[j], F[k], w, h);
      if (moving && (!run.length || s > 1 === run[run.length - 1].s > 1)) { run.push({ j, k, s }); continue; }
      if (run.length >= 2) zooms.push(pushOf(run));
      run = moving ? [{ j, k, s }] : [];
    }
    if (run.length >= 2) zooms.push(pushOf(run));
  }
  zooms.sort((a, b) => a.t - b.t);

  const share = {};
  for (const c of found) share[c.kind] = (share[c.kind] || 0) + 1;
  for (const k of Object.keys(share)) share[k] = r2(share[k] / found.length);
  const sp = words && words.length ? speechOf(words) : null;
  const minutes = n / fps / 60;
  return {
    version: CUTKINDS_VERSION, fps: r2(fps), size: [w, h],
    cuts: found.map((c) => ({ t: t3(c.f), kind: c.kind, source: c.source })),
    zooms, not_cuts: notCuts, kind_share: share,
    zoom: zoomBlock(zooms, minutes, sp, !!sp),
    speech: sp ? { wpm: sp.wpm, max_pause_s: sp.max_pause_s, sentence_starts: sp.sentence_starts } : null,
    notes,
  };
}

if (process.argv[1] && process.argv[1].endsWith("cutkinds.mjs")) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node lib/cutkinds.mjs <file>"); process.exit(1); }
  console.log(JSON.stringify(await classifyCuts(path.resolve(file)), null, 2));
}
