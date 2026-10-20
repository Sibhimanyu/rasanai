#!/usr/bin/env node
// brandfilm.mjs: learn a brand's real film style, and check our film against it.
//
//   find     --brand "<name>" [--product "<p>"] --out <dir>      candidate official videos (yt-dlp search, no download)
//   fetch    --url <url> | --file <path> --out <dir> [--max-height 720] [--max-duration 180]
//   frames   --in <video> --out <dir>                            cut-detected + 1 fps frames (<=60 JPGs, 640 px) and 6x6 contact sheets
//   measure  --in <video|frames dir> --out <grammar.json> [--film <name>] [--structure one-take|montage|...]
//                                                                luminance, white/black shares, palette, saturation, motion, cut rate;
//                                                                --film adds the film to grammar.json's `films` (the first one measured is also `measured`)
//   card     --dir <dir> [--brand <name>]                        FILM-STYLE.json + FILM-STYLE.md (measured numbers + slots + `principles: []` (2 to 4: why it works) for the AI to fill)
//   compare  --ref <grammar.json|FILM-STYLE.json> --ours <video|frames dir> [--tolerance strict|normal] [--film <name>] [--structure <type>]
//                                                                a ref (or a FILM-STYLE.json beside it) with `principles` adds principles_to_judge [{id, principle, check}] to the output (idea from reference-to-principle work; our code)
//                                                                --film: measure against that film in grammar.json (the one the script follows);
//                                                                --structure one-take (no film of that type): cut rate warns, tempo has no floor
//                                                                style-match gate, exit 1 on an error (palette dE, off-brand hue,
//                                                                cut rate, tempo); canvas share, % white and colour amount warn
//
// All output is JSON on stdout. Nothing opens a window. Needs ffmpeg/ffprobe; find/fetch need yt-dlp and network.
// Colour distance is CIE76 (dE) in Lab, weighted by palette share. Do not put downloaded brand films in the repo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cutTimes } from "./lib/deconstruct.mjs";

const YTDLP = fs.existsSync("/opt/homebrew/bin/yt-dlp") ? "/opt/homebrew/bin/yt-dlp" : "yt-dlp";
const W = 64, H = 36;

const HELP = `brandfilm.mjs: learn a brand's real film style and gate our film against it

Usage
  node brandfilm.mjs find     --brand "OpenAI" [--product "ChatGPT"] --out <dir>
  node brandfilm.mjs fetch    --url <url> | --file <path> --out <dir> [--max-height 720] [--max-duration 180]
  node brandfilm.mjs frames   --in <video> --out <dir>
  node brandfilm.mjs measure  --in <video|frames dir> --out <dir>/grammar.json [--film "refreshed" --structure montage]
  node brandfilm.mjs card     --dir <dir> [--brand "OpenAI"]
  node brandfilm.mjs compare  --ref <dir>/grammar.json --ours <video|frames dir> [--tolerance strict|normal] [--film "sites-spot"] [--structure one-take]

Flow: find -> pick the official film -> fetch -> frames (read the contact sheets) -> measure -> card
(fill the slots in FILM-STYLE.json/.md from the sheets), then compare our cut against grammar.json.
compare exits 1 when the style does not match. Output is JSON on stdout.
One grammar.json can hold several brand films (measure --film <name> --structure <type> for each). compare measures against
the film the script follows (--film), else the one whose structure matches --structure, else the first; a one-take spot
is never failed on cut rate by a 110 s montage (--structure one-take with no film of that type: cut rate warns).
`;

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const fail = (msg, code = 2) => out({ ok: false, error: msg }, code);
const run = (bin, a, o = {}) => spawnSync(bin, a, { encoding: o.buffer ? "buffer" : "utf8", maxBuffer: 1 << 30, timeout: o.timeout || 600000 });
const r1 = (x) => Math.round(x * 10) / 10, r3 = (x) => Math.round(x * 1000) / 1000;
const mkdir = (d) => fs.mkdirSync(d, { recursive: true });

function probe(file) {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,r_frame_rate", "-select_streams", "v:0", "-of", "json", file]);
  try { const j = JSON.parse(r.stdout); return { duration: parseFloat(j.format.duration) || 0, width: j.streams[0].width, height: j.streams[0].height }; } catch { return null; }
}

// cut times (seconds): the robust detector (lib/deconstruct.mjs: a frame difference above max(8, 4x its rolling median +-12 frames),
// cuts inside stepped / flicker runs dropped, so hand-animated footage on 2s does not read as a cut at every step); ffmpeg's fixed
// scene score (0.25) only when the film cannot be read frame by frame
function sceneCuts(file, thr = 0.25) {
  const robust = cutTimes(file);
  if (robust) return robust;
  const r = run("ffmpeg", ["-v", "info", "-nostats", "-i", file, "-an", "-vf", `scale=320:-2,select='gt(scene,${thr})',showinfo`, "-f", "null", "-"]);
  const t = [];
  for (const m of (r.stderr || "").matchAll(/pts_time:([0-9.]+)/g)) t.push(parseFloat(m[1]));
  return t;
}

// ---------- colour ----------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function lab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  let x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const unhex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ---------- sampling ----------
function listFrames(dir) {
  return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/^sheet-/.test(f)).sort().map((f) => path.join(dir, f));
}
// returns array of Buffers (W*H*3), and sample times
function sampleFrames(input) {
  if (fs.statSync(input).isDirectory()) {
    const bufs = [];
    for (const f of listFrames(input)) {
      const r = run("ffmpeg", ["-v", "error", "-i", f, "-vf", `scale=${W}:${H}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { buffer: true });
      if (r.stdout && r.stdout.length === W * H * 3) bufs.push(r.stdout);
    }
    return { bufs, fps: null };
  }
  const r = run("ffmpeg", ["-v", "error", "-i", input, "-an", "-vf", `fps=2,scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { buffer: true });
  const n = Math.floor((r.stdout?.length || 0) / (W * H * 3)), bufs = [];
  for (let i = 0; i < n; i++) bufs.push(r.stdout.subarray(i * W * H * 3, (i + 1) * W * H * 3));
  return { bufs, fps: 2 };
}

function cluster(buckets, thr, keep) {
  // buckets: Map key -> {n, r, g, b}; greedy merge by dE
  const list = [...buckets.values()].sort((a, b) => b.n - a.n), cl = [];
  for (const b of list) {
    const c = [b.r / b.n, b.g / b.n, b.b / b.n];
    let hit = null;
    for (const k of cl) if (dE(c, [k.r / k.n, k.g / k.n, k.b / k.n]) < thr) { hit = k; break; }
    if (hit) { hit.n += b.n; hit.r += b.r; hit.g += b.g; hit.b += b.b; } else cl.push({ ...b });
  }
  cl.sort((a, b) => b.n - a.n);
  const tot = cl.reduce((s, k) => s + k.n, 0) || 1;
  return cl.slice(0, keep).map((k) => ({ hex: hex([k.r / k.n, k.g / k.n, k.b / k.n]), share: r3(k.n / tot) }));
}

// Tempo: how often something meaningfully changes on screen, cuts or not. A change is a sampled frame pair (0.5 s apart)
// whose mean luma difference clears a threshold well under a cut's, so a continuous take with UI states still registers.
// Events are debounced to one per second; the hold is the longest stretch without one. (house)
const HOUSE_CHANGE_EVERY_S = 2.5;
const TEMPO_CHANGE_THR = 0.8, TEMPO_DEBOUNCE_S = 1;
function tempoOf(diffs, fps, dur) {
  const total = dur || (diffs.length + 1) / fps, times = [];
  diffs.forEach((d, i) => { const t = (i + 1) / fps; if (d > TEMPO_CHANGE_THR && (!times.length || t - times[times.length - 1] >= TEMPO_DEBOUNCE_S)) times.push(t); });
  const marks = [0, ...times, total];
  let hold = 0;
  for (let i = 1; i < marks.length; i++) hold = Math.max(hold, marks[i] - marks[i - 1]);
  return { threshold: TEMPO_CHANGE_THR, changes: times.length, changeEveryS: times.length ? r1(total / times.length) : null, longestHoldS: r1(hold), changeTimes: times.slice(0, 400).map(r1) };
}

// ---------- finish (grain, ground tint and falloff, vignette, soft shadow, softness) ----------
// Measured, not guessed: a coarse analyst cannot see 1-2% grain, a 2-unit ground tint or a soft shadow, and what it
// cannot see it used to ban. These numbers decide whether the default finish layer stays on (references/brand-film.md 4).
// Frames at 480x270, tiles of 30x30 px (16x9). A tile is "empty" (ground) when its 5x5 block means barely change; noise is
// the residual against the local 3x3 mean inside empty tiles; soft content is R1's measure: of the 24 px tiles with
// structure (std > 10), the share whose Laplacian variance is under 6% of their variance (blurred structure).
const FW = 480, FH = 270, TS = 30;
const FINISH_OFF = { noise: 1.0, groundChroma: 1.0, groundRange: 2.0, vignette: 2.0, shadowFrames: 0.1 };
function sampleFinishFrames(input) {
  const sz = FW * FH * 3;
  if (fs.statSync(input).isDirectory()) {
    const files = listFrames(input), step = Math.max(1, Math.ceil(files.length / 40)), bufs = [];
    for (let i = 0; i < files.length; i += step) {
      const r = run("ffmpeg", ["-v", "error", "-i", files[i], "-vf", `scale=${FW}:${FH}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { buffer: true });
      if (r.stdout && r.stdout.length === sz) bufs.push(r.stdout);
    }
    return bufs;
  }
  const p = probe(input), dur = p && p.duration ? p.duration : 40, fps = Math.min(1, 40 / dur);
  const r = run("ffmpeg", ["-v", "error", "-i", input, "-an", "-vf", `fps=${fps.toFixed(4)},scale=${FW}:${FH}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { buffer: true });
  const n = Math.floor((r.stdout?.length || 0) / sz), bufs = [];
  for (let i = 0; i < n; i++) bufs.push(r.stdout.subarray(i * sz, (i + 1) * sz));
  return bufs;
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
function finishOf(bufs) {
  const TX = FW / TS, TY = FH / TS, noise = [], gChroma = [], gRange = [], vig = [], soft = [];
  let shadowFrames = 0, haloFrames = 0, counted = 0;
  for (const b of bufs) {
    const g = new Float32Array(FW * FH);
    for (let i = 0; i < FW * FH; i++) g[i] = luma(b[i * 3], b[i * 3 + 1], b[i * 3 + 2]);
    const box = new Float32Array(FW * FH);
    for (let y = 1; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += g[(y + dy) * FW + x + dx]; box[y * FW + x] = s / 9; }
    const tiles = [];
    for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
      const x0 = tx * TS, y0 = ty * TS, bm = [];
      for (let by = 0; by < 3; by++) for (let bx = 0; bx < 3; bx++) { let s = 0; for (let yy = 0; yy < 10; yy++) for (let xx = 0; xx < 10; xx++) s += g[(y0 + by * 10 + yy) * FW + x0 + bx * 10 + xx]; bm.push(s / 100); }
      let adj = 0; for (let by = 0; by < 3; by++) for (let bx = 0; bx < 3; bx++) { const v = bm[by * 3 + bx]; if (bx < 2) adj = Math.max(adj, Math.abs(v - bm[by * 3 + bx + 1])); if (by < 2) adj = Math.max(adj, Math.abs(v - bm[(by + 1) * 3 + bx])); }
      const range = Math.max(...bm) - Math.min(...bm);
      let rs = 0, rq = 0, rn = 0, lapO = 0, cr = 0, cg = 0, cb = 0;
      for (let y = Math.max(2, y0); y < Math.min(FH - 2, y0 + TS); y++) for (let x = Math.max(2, x0); x < Math.min(FW - 2, x0 + TS); x++) {
        const i = y * FW + x, d = g[i] - box[i]; rs += d; rq += d * d; rn++;
        lapO += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - FW] - g[i + FW]);
      }
      for (let y = y0; y < y0 + TS; y++) for (let x = x0; x < x0 + TS; x++) { const i = (y * FW + x) * 3; cr += b[i]; cg += b[i + 1]; cb += b[i + 2]; }
      const np = TS * TS, L = lab([cr / np, cg / np, cb / np]);
      tiles.push({ tx, ty, empty: adj < 3 && range < 5, smooth: adj < 5 && range < 24, noise: rn ? Math.sqrt(Math.max(0, rq / rn - (rs / rn) ** 2)) : 0, lap: lapO / (rn || 1), L: L[0], C: Math.hypot(L[1], L[2]) });
    }
    // the ground is the most common lightness among the flat tiles (a solid black box is flat too, but it is not the ground)
    const flat = tiles.filter((t) => t.empty), bins = {};
    for (const t of flat) bins[Math.round(t.L / 10)] = (bins[Math.round(t.L / 10)] || 0) + 1;
    const mode = Number((Object.entries(bins).sort((a, b) => b[1] - a[1])[0] || [0])[0]) * 10;
    const empty = flat.filter((t) => Math.abs(t.L - mode) <= 20), structured = tiles.filter((t) => !t.smooth && t.lap > 6);
    if (empty.length >= 4) {
      counted++;
      noise.push(median(empty.map((t) => t.noise)));
      gChroma.push(median(empty.map((t) => t.C)));
      const Ls = empty.map((t) => t.L); gRange.push(pct(Ls, 0.95) - pct(Ls, 0.05));
      const edge = empty.filter((t) => t.tx === 0 || t.ty === 0 || t.tx === TX - 1 || t.ty === TY - 1), mid = empty.filter((t) => t.tx >= 4 && t.tx < TX - 4 && t.ty >= 2 && t.ty < TY - 2);
      if (edge.length >= 2 && mid.length >= 2) vig.push(median(mid.map((t) => t.L)) - median(edge.map((t) => t.L)));
      const gL = median(Ls), near = (t) => structured.some((s) => Math.abs(s.tx - t.tx) <= 1 && Math.abs(s.ty - t.ty) <= 1);
      const fall = tiles.filter((t) => t.smooth && !t.empty && near(t));
      if (fall.some((t) => gL - t.L >= 3 && gL - t.L <= 25)) shadowFrames++;
      if (fall.some((t) => t.L - gL >= 3 && t.L - gL <= 25)) haloFrames++;
    }
    { let content = 0, sc = 0; const T = 24;
      for (let y0 = 0; y0 + T <= FH; y0 += T) for (let x0 = 0; x0 + T <= FW; x0 += T) {
        let s1 = 0, s2 = 0; for (let y = y0; y < y0 + T; y++) for (let x = x0; x < x0 + T; x++) { const v = g[y * FW + x]; s1 += v; s2 += v * v; }
        const vr = s2 / (T * T) - (s1 / (T * T)) ** 2; if (vr <= 100) continue; content++;
        let l1 = 0, l2 = 0, ln = 0; for (let y = Math.max(1, y0); y < Math.min(FH - 1, y0 + T); y++) for (let x = Math.max(1, x0); x < Math.min(FW - 1, x0 + T); x++) { const i = y * FW + x, l = g[i - 1] + g[i + 1] + g[i - FW] + g[i + FW] - 4 * g[i]; l1 += l; l2 += l * l; ln++; }
        if ((l2 / ln - (l1 / ln) ** 2) / vr < 0.06) sc++;
      }
      if (content >= 3) soft.push(sc / content); }
  }
  const f = {
    frames: bufs.length, groundFrames: counted,
    noise: noise.length ? r1(median(noise)) : null,                       // residual std in 8-bit units: ~2-3 is 1% grain, 5+ is 2-4%
    groundChroma: gChroma.length ? r1(median(gChroma)) : null,            // C* of the empty area: 0 = neutral ground
    groundRange: gRange.length ? r1(median(gRange)) : null,               // L* p5..p95 across the empty area: 0 = flat, 4+ = lit/falloff
    vignette: vig.length ? r1(median(vig)) : null,                        // centre minus edge L* of the ground
    shadowFrames: counted ? r3(shadowFrames / counted) : null,            // frames with a soft dark falloff next to an object
    haloFrames: counted ? r3(haloFrames / counted) : null,                // frames with a soft light falloff next to an object (glow, rim)
    softContent: soft.length ? { median: r3(median(soft)), p90: r3(pct(soft, 0.9)), framesOver15: r3(soft.filter((s) => s >= 0.15).length / soft.length) } : null,
  };
  const zero = (v, t) => v === null || v < t;
  f.layerOff = zero(f.noise, FINISH_OFF.noise) && zero(f.groundChroma, FINISH_OFF.groundChroma) && zero(f.groundRange, FINISH_OFF.groundRange) && zero(f.vignette, FINISH_OFF.vignette) && zero(f.shadowFrames, FINISH_OFF.shadowFrames);
  f.route = f.layerOff ? "graphic" : "atmospheric";
  f.note = f.layerOff
    ? "Measured zero grain, shadow and ground tint on a flat ground: the finish layer may be off, and the film must win on type scale (giant moments), photography and colour content (the OpenAI route). Hero effects stay available on a budget."
    : "The brand's films carry a finish layer (measured grain, ground tint or falloff, vignette or soft shadow): the default finish stays on.";
  return f;
}

function measure(input) {
  const { bufs, fps } = sampleFrames(input);
  if (!bufs.length) return null;
  const all = new Map(), bgs = new Map(), chromB = new Map(), neuHist = new Array(8).fill(0);
  let chromPix = 0, neuPix = 0;
  let sumLum = 0, white = 0, black = 0, satSum = 0, satPix = 0, moments = 0, motion = 0, motionN = 0, prev = null;
  const perFrame = [], diffs = [];
  const px = W * H;
  for (let fi = 0; fi < bufs.length; fi++) {
    const b = bufs[fi], fb = new Map();
    let fl = 0, fw = 0, fk = 0, fsat = 0, fsp = 0;
    const lumArr = new Uint8Array(px);
    for (let i = 0; i < px; i++) {
      const r = b[i * 3], g = b[i * 3 + 1], bl = b[i * 3 + 2], L = luma(r, g, bl);
      lumArr[i] = L; fl += L;
      if (L > 240) fw++; else if (L < 20) fk++;
      const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), s = mx ? (mx - mn) / mx : 0;
      fsat += s;
      if (s > 0.4 && mx > 40) fsp++;
      { const [Ls, as, bs] = lab([r, g, bl]), C = Math.hypot(as, bs);
        if (C < 10) { neuPix++; neuHist[Math.min(7, Math.floor(Ls / 12.5))]++; }
        else { chromPix++; const ck = (r >> 4) * 256 + (g >> 4) * 16 + (bl >> 4), ce = chromB.get(ck) || (chromB.set(ck, { n: 0, r: 0, g: 0, b: 0 }), chromB.get(ck)); ce.n++; ce.r += r; ce.g += g; ce.b += bl; } }
      const key = (r >> 5) * 64 + (g >> 5) * 8 + (bl >> 5);
      for (const m of [all, fb]) { const e = m.get(key) || (m.set(key, { n: 0, r: 0, g: 0, b: 0 }), m.get(key)); e.n++; e.r += r; e.g += g; e.b += bl; }
    }
    // background estimate = most populated bucket in the frame
    let top = null; for (const e of fb.values()) if (!top || e.n > top.n) top = e;
    const bg = [top.r / top.n, top.g / top.n, top.b / top.n];
    const bk = hex(bg), be = bgs.get(bk) || (bgs.set(bk, { n: 0, r: 0, g: 0, b: 0 }), bgs.get(bk)); be.n++; be.r += bg[0]; be.g += bg[1]; be.b += bg[2];
    sumLum += fl / px; white += fw / px; black += fk / px; satSum += fsat / px; satPix += fsp / px;
    if (fsp / px > 0.1) moments++;
    if (prev) { let d = 0; for (let i = 0; i < px; i++) d += Math.abs(lumArr[i] - prev[i]); motion += d / px; motionN++; diffs.push(d / px); }
    prev = lumArr;
    perFrame.push({ i: fi, t: fps ? fi / fps : null, lum: Math.round(fl / px), bg: bk, bgLum: Math.round(luma(...bg)), colorShare: r3(fsp / px) });
  }
  const n = bufs.length;
  const bgDom = cluster(bgs, 10, 3);
  let cuts = null, dur = null;
  if (fps) { const p = probe(input); dur = p ? p.duration : n / fps; cuts = sceneCuts(input); }
  const tempo = fps && diffs.length ? tempoOf(diffs, fps, dur) : null;
  const bgLumMean = perFrame.reduce((s, f) => s + f.bgLum, 0) / n;
  const m = {
    frames: n, duration: dur === null ? null : r1(dur),
    luminance: { mean: r1(sumLum / n), bgMean: r1(bgLumMean) },
    shares: { nearWhite: r3(white / n), nearBlack: r3(black / n), mid: r3(1 - white / n - black / n) },
    palette: cluster(all, 12, 8),
    chroma: {
      neutralShare: r3(neuPix / (n * px)), chromaticShare: r3(chromPix / (n * px)),
      neutralLightness: neuHist.map((v) => r3(v / (n * px))),
      chromaticPalette: cluster(chromB, 14, 6).map((c) => ({ hex: c.hex, share: r3(c.share * chromPix / (n * px)) })),
    },
    background: { overall: bgDom[0]?.hex, dominant: bgDom, perFrameSample: perFrame.filter((_, i) => i % Math.max(1, Math.floor(n / 24)) === 0).map((f) => ({ t: f.t, bg: f.bg })) },
    saturation: { mean: r3(satSum / n), saturatedShare: r3(satPix / n), colourMoments: moments, colourMomentShare: r3(moments / n) },
    motion: { meanFrameDiff: motionN ? r1(motion / motionN) : null },
    tempo,
    finish: finishOf(sampleFinishFrames(input)),
    cuts: cuts === null ? null : { count: cuts.length, per10s: r1((cuts.length / dur) * 10), avgShotLength: r1(dur / (cuts.length + 1)), times: cuts.slice(0, 400).map(r1) },
  };
  return m;
}

// ---------- subcommands ----------
function find() {
  const brand = opt("brand"), product = opt("product", ""), dir = opt("out");
  if (!brand || !dir) fail("find needs --brand and --out");
  mkdir(dir);
  const flat = (q, n) => {
    const r = run(YTDLP, ["--flat-playlist", "--dump-json", "--no-warnings", "--playlist-end", String(n), q], { timeout: 90000 });
    if (r.error || (r.status !== 0 && !r.stdout)) return { err: (r.error?.message || r.stderr || "yt-dlp failed").slice(0, 300), items: [] };
    return { items: r.stdout.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) };
  };
  const q = `ytsearch10:"${brand} ${product} official launch"`.replace(/\s+/g, " ");
  const first = flat(q, 10);
  if (first.err && !first.items.length) out({ ok: false, offline: true, error: first.err }, 1);
  const b = brand.toLowerCase();
  const isOfficial = (e) => { const c = (e.channel || e.uploader || "").toLowerCase(); return c.includes(b) || e.channel_is_verified === true; };
  // identify the official channel: most common brand-named channel among the results
  const tally = {};
  for (const e of first.items) if ((e.channel || "").toLowerCase().includes(b) && e.channel_url) tally[e.channel_url] = (tally[e.channel_url] || 0) + 1;
  const chanUrl = Object.entries(tally).sort((x, y) => y[1] - x[1])[0]?.[0];
  let items = first.items;
  if (chanUrl) items = items.concat(flat(chanUrl.replace(/\/$/, "") + "/videos", 10).items);
  const seen = new Set();
  const cands = items.filter((e) => e.id && !seen.has(e.id) && seen.add(e.id)).map((e) => ({
    title: e.title, url: e.url || `https://www.youtube.com/watch?v=${e.id}`, channel: e.channel || e.uploader || null,
    duration: e.duration ?? null, uploadDate: e.upload_date || (e.timestamp ? new Date(e.timestamp * 1000).toISOString().slice(0, 10).replace(/-/g, "") : null),
    views: e.view_count ?? null, officialGuess: isOfficial(e),
  }));
  cands.sort((a, c) => (c.officialGuess - a.officialGuess) || String(c.uploadDate || "").localeCompare(String(a.uploadDate || "")));
  const res = { ok: true, brand, product, officialChannel: chanUrl || null, candidates: cands };
  fs.writeFileSync(path.join(dir, "candidates.json"), JSON.stringify(res, null, 2));
  out(res);
}

function fetchCmd() {
  const url = opt("url"), file = opt("file"), dir = opt("out");
  const maxH = parseInt(opt("max-height", "720"), 10), maxD = parseInt(opt("max-duration", "180"), 10);
  if (!dir || (!url && !file)) fail("fetch needs --url or --file, and --out");
  mkdir(dir);
  if (file) {
    if (!fs.existsSync(file)) fail(`no such file: ${file}`);
    const p = probe(file);
    return out({ ok: true, source: "file", video: path.resolve(file), ...(p || {}), note: p && p.duration > maxD ? `longer than ${maxD}s; frames/measure still work` : undefined });
  }
  const fmt = `bv*[height<=${maxH}][ext=mp4]+ba[ext=m4a]/b[height<=${maxH}][ext=mp4]/b[height<=${maxH}]/b`;
  const r = run(YTDLP, ["--no-playlist", "-f", fmt, "--merge-output-format", "mp4", "--match-filter", `duration<=${maxD}`, "--no-warnings", "-o", path.join(dir, "source.%(ext)s"), url], { timeout: 900000 });
  const vid = fs.readdirSync(dir).find((f) => /^source\.(mp4|mkv|webm)$/.test(f));
  if (!vid) fail(`download failed or video is longer than ${maxD}s: ${(r.stderr || r.error?.message || "").slice(-300)}`, 1);
  const v = path.join(dir, vid);
  out({ ok: true, source: "url", url, video: path.resolve(v), ...(probe(v) || {}) });
}

function framesCmd() {
  const inp = opt("in"), dir = opt("out");
  if (!inp || !dir || !fs.existsSync(inp)) fail("frames needs --in <video> and --out <dir>");
  mkdir(dir);
  const p = probe(inp); if (!p) fail("cannot read video");
  const dur = p.duration, cuts = sceneCuts(inp);
  // picks: first frame, a frame just after each cut, plus 2 s samples inside long holds (>4 s)
  const picks = [{ t: 0.05, why: "start" }];
  const bounds = [0, ...cuts, dur];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i], b = bounds[i + 1];
    if (i > 0) picks.push({ t: Math.min(a + 0.08, dur - 0.05), why: "cut" });
    if (b - a > 4) for (let t = a + 2; t < b - 1; t += 2) picks.push({ t, why: "hold" });
  }
  picks.sort((x, y) => x.t - y.t);
  const MAX = 60;
  let sel = picks;
  if (picks.length > MAX) { sel = []; for (let i = 0; i < MAX; i++) sel.push(picks[Math.round((i * (picks.length - 1)) / (MAX - 1))]); }
  for (const f of listFrames(dir)) if (/^frame-\d+\.jpg$/.test(path.basename(f))) fs.unlinkSync(f);
  const list = [];
  sel.forEach((s, i) => {
    const name = `frame-${String(i + 1).padStart(3, "0")}.jpg`;
    const r = run("ffmpeg", ["-y", "-v", "error", "-ss", String(s.t), "-i", inp, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", path.join(dir, name)]);
    if (r.status === 0 && fs.existsSync(path.join(dir, name))) list.push({ file: name, t: r1(s.t), why: s.why });
  });
  const sheets = [];
  for (let s = 0; s * 36 < list.length; s++) {
    const name = `sheet-${s + 1}.jpg`, first = s * 36 + 1;
    const r = run("ffmpeg", ["-y", "-v", "error", "-framerate", "1", "-start_number", String(first), "-i", path.join(dir, "frame-%03d.jpg"), "-frames:v", "1", "-vf", "scale=320:-2,tile=6x6:padding=2:color=gray", "-q:v", "3", path.join(dir, name)]);
    if (r.status === 0) sheets.push({ file: name, frames: [list[s * 36].file, list[Math.min(list.length, s * 36 + 36) - 1].file], layout: "6x6 row-major, in time order" });
  }
  const res = {
    ok: true, input: path.resolve(inp), duration: r1(dur), width: p.width, height: p.height,
    cutCount: cuts.length, cutsPer10s: r1((cuts.length / dur) * 10), avgShotLength: r1(dur / (cuts.length + 1)), cutTimes: cuts.map(r1),
    frames: list, sheets,
  };
  fs.writeFileSync(path.join(dir, "frames.json"), JSON.stringify(res, null, 2));
  out(res);
}

function measureCmd() {
  const inp = opt("in"), file = opt("out");
  if (!inp || !fs.existsSync(inp)) fail("measure needs --in <video|frames dir>");
  const m = measure(inp);
  if (!m) fail("no frames could be read");
  let res = { version: 1, source: path.basename(inp), kind: fs.statSync(inp).isDirectory() ? "frames" : "video", measured: m };
  const film = opt("film"), structure = opt("structure");
  if (film || structure) {
    // per-film numbers: grammar.json keeps every film measured into it; `measured` stays the first (what the card and the look read)
    let prev = null; try { prev = file && JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    const name = film || path.basename(inp, path.extname(inp));
    const entry = { source: res.source, kind: res.kind, ...(structure ? { structure } : {}), measured: m };
    const films = { ...((prev && prev.films) || {}) };
    if (prev && prev.measured && !Object.keys(films).length) films["first"] = { source: prev.source, kind: prev.kind, measured: prev.measured };
    films[name] = entry;
    res = prev && prev.measured ? { ...prev, films } : { ...res, films };
  }
  if (file) { mkdir(path.dirname(path.resolve(file))); fs.writeFileSync(file, JSON.stringify(res, null, 2)); }
  out(res);
}

// One line for the card's measured block: the finish numbers and what they decide (the default finish layer on or off).
function finishLine(f) {
  if (!f) return "- Finish: not measured (re-run measure)";
  const sc = f.softContent ? `soft content p90 ${f.softContent.p90} (${Math.round(f.softContent.framesOver15 * 100)}% of frames >= 0.15)` : "soft content n/a";
  return `- Finish: grain ${f.noise ?? "n/a"} (residual std, 8-bit); ground chroma ${f.groundChroma ?? "n/a"}, ground L* range ${f.groundRange ?? "n/a"}; vignette ${f.vignette ?? "n/a"} L*; soft shadow in ${f.shadowFrames === null ? "n/a" : Math.round(f.shadowFrames * 100) + "%"} of frames, soft light falloff in ${f.haloFrames === null ? "n/a" : Math.round(f.haloFrames * 100) + "%"}; ${sc}. Route: ${f.route} (finish layer ${f.layerOff ? "may be off: win on type scale, photography and colour content" : "on"})`;
}

function cardCmd() {
  const dir = opt("dir"); if (!dir) fail("card needs --dir");
  const gp = path.join(dir, "grammar.json");
  if (!fs.existsSync(gp)) fail(`no grammar.json in ${dir}; run measure --out ${gp} first`);
  const g = JSON.parse(fs.readFileSync(gp, "utf8")), m = g.measured;
  const fr = fs.existsSync(path.join(dir, "frames.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "frames.json"), "utf8")) : null;
  const brand = opt("brand", "");
  const slots = {
    tempo: "", typefaces: "", motif: "", layout: "", motionVocabulary: "", photographyStyle: "", endCard: "", notes: "",
  };
  const card = { version: 1, brand, source: g.source, measured: m, frames: fr ? { cutCount: fr.cutCount, cutsPer10s: fr.cutsPer10s, avgShotLength: fr.avgShotLength, sheets: fr.sheets.map((s) => s.file) } : null, slots, principles: [], filled: false };
  fs.writeFileSync(path.join(dir, "FILM-STYLE.json"), JSON.stringify(card, null, 2));
  const pal = m.palette.map((c) => `${c.hex} (${Math.round(c.share * 100)}%)`).join(", ");
  const c = m.cuts;
  const md = `# Film style${brand ? `: ${brand}` : ""}

Source: ${g.source}. Measured from ${m.frames} sampled frames${m.duration ? ` of a ${m.duration}s film` : ""}. Read the contact sheets (${fr ? fr.sheets.map((s) => s.file).join(", ") : "run frames first"}) to fill the slots.

## Measured (do not edit)
- Mean luminance ${m.luminance.mean}/255; background luminance ${m.luminance.bgMean}/255; background ${m.background.overall}
- Near-white ${Math.round(m.shares.nearWhite * 100)}%, near-black ${Math.round(m.shares.nearBlack * 100)}%, mid ${Math.round(m.shares.mid * 100)}%
- Palette: ${pal}
- Saturation mean ${m.saturation.mean}; saturated colour share ${Math.round(m.saturation.saturatedShare * 100)}%; colour moments ${m.saturation.colourMoments} of ${m.frames} frames
- Motion: mean frame difference ${m.motion.meanFrameDiff ?? "n/a"}
${m.tempo ? `- Tempo: ${m.tempo.changes} changes, one every ${m.tempo.changeEveryS ?? "n/a"} s, longest hold without a change ${m.tempo.longestHoldS} s` : "- Tempo: n/a (frames input)"}
${c ? `- Cuts: ${c.count}, ${c.per10s} per 10 s, average shot ${c.avgShotLength} s` : "- Cuts: n/a (frames input)"}
${finishLine(m.finish)}

## Slots (the director fills these from the frames)
- Tempo (ideas shown, seconds per idea, change rate, longest hold, where the film breathes):
- Typefaces (families, weights, sizes, where type sits):
- Motif (the recurring shape or idea and how it transforms):
- Layout (grid, centring, whitespace, how many elements at once):
- Motion vocabulary: "Seen: ..." (every move and effect the films use) and "Not seen (allowed on a budget): ..." (effects absent from these films; a budget, not a ban: references/brand-film.md 4):
- Finish (from the measured line above: grain, ground tint and falloff, vignette, soft shadow, softness; say what the eye confirms):
- Photography style (or none):
- Opening (first image):
- End card:
- Notes (what would make a film look off-brand):

## Principles (2 to 4: why it works, not what it shows)
For each, a JSON entry in FILM-STYLE.json principles: id, principle (the technique in one line), why (why it works on a viewer), effect (the feeling it is for), prerequisites (what our film needs for it to work), distinctive (the brand's own: never copy), check (how a critic sees it in our film on a strip: one sentence), evidence (optional: a measured number).

Then run: node brandfilm.mjs compare --ref ${gp} --ours <our film>
`;
  fs.writeFileSync(path.join(dir, "FILM-STYLE.md"), md);
  out({ ok: true, json: path.join(dir, "FILM-STYLE.json"), md: path.join(dir, "FILM-STYLE.md"), slotsToFill: Object.keys(slots) });
}

// Tolerances, calibrated on a real brand film (near-white brand canvas vs an off-brand dark one).
const TOL = {
  normal: { meanLum: 30, bgLum: 35, white: 0.2, black: 0.1, paletteDE: 22, offPalette: 0.2, offDE: 28, cutRatio: [0.35, 2.8], colourMoment: 0.3, hueDE: 15, offChroma: 0.08, chromaAllow: 0.05, neutral: 0.25, neutralTV: 0.4 },
  strict: { meanLum: 15, bgLum: 20, white: 0.1, black: 0.05, paletteDE: 12, offPalette: 0.1, offDE: 20, cutRatio: [0.6, 1.6], colourMoment: 0.15, hueDE: 10, offChroma: 0.04, chromaAllow: 0.02, neutral: 0.12, neutralTV: 0.25 },
};

function compareCmd() {
  const refp = opt("ref"), ours = opt("ours"), tolName = opt("tolerance", "normal");
  if (!refp || !ours || !fs.existsSync(refp) || !fs.existsSync(ours)) fail("compare needs --ref <grammar.json> and --ours <video|frames dir>");
  const T = TOL[tolName]; if (!T) fail("--tolerance is strict or normal");
  const gram = JSON.parse(fs.readFileSync(refp, "utf8")), filmOpt = opt("film"), structure = opt("structure");
  let ref = gram.measured, refFilm = null;
  const films = gram.films || {};
  if (filmOpt) {
    const k = Object.keys(films).find((n) => n === filmOpt) || Object.keys(films).find((n) => n.toLowerCase().includes(String(filmOpt).toLowerCase()));
    if (!k) fail(`--film "${filmOpt}" is not in ${refp} (films: ${Object.keys(films).join(", ") || "none, measure with --film"})`);
    ref = films[k].measured; refFilm = k;
  } else if (structure) {
    const k = Object.keys(films).find((n) => films[n].structure === structure);
    if (k) { ref = films[k].measured; refFilm = k; }
  }
  if (!ref) fail(`${refp} has no measured block`);
  // a one-take spot against a montage reference has no honest cut rate: warn, and drop the tempo floor (the house cap stays)
  const oneTakeVsOther = structure === "one-take" && !(refFilm && films[refFilm].structure === "one-take") && !(!refFilm && gram.structure === "one-take");
  const m = measure(ours); if (!m) fail("no frames could be read from --ours");
  // Brand lock is palette, type, logo, UI and tone. Canvas share, % white, lightness and the amount of colour are
  // warnings: a launch film may light its ground, turn dark on the pain beat or carry photography the identity film
  // never showed. Palette distance and off-brand hues stay errors (the typeface is checked by design.mjs check-system).
  const WARN_ONLY = new Set(["meanLuminance", "backgroundLuminance", "nearWhiteShare", "nearBlackShare", "neutralShare", "neutralLightness", "colourMoments", "chromaticShare", "finish", ...(oneTakeVsOther ? ["cutRateRatio"] : [])]);
  const checks = [];
  const add = (name, value, limit, pass, note = "") => checks.push({ name, value, limit, pass, note, severity: WARN_ONLY.has(name) ? "warning" : "error" });
  const dl = Math.abs(m.luminance.mean - ref.luminance.mean), db = Math.abs(m.luminance.bgMean - ref.luminance.bgMean);
  add("meanLuminance", `${m.luminance.mean} vs ${ref.luminance.mean}`, `diff <= ${T.meanLum}`, dl <= T.meanLum, `diff ${r1(dl)}`);
  add("backgroundLuminance", `${m.luminance.bgMean} vs ${ref.luminance.bgMean}`, `diff <= ${T.bgLum}`, db <= T.bgLum, `diff ${r1(db)}`);
  const dw = Math.abs(m.shares.nearWhite - ref.shares.nearWhite), dk = Math.abs(m.shares.nearBlack - ref.shares.nearBlack);
  add("nearWhiteShare", `${m.shares.nearWhite} vs ${ref.shares.nearWhite}`, `diff <= ${T.white}`, dw <= T.white, `diff ${r3(dw)}`);
  add("nearBlackShare", `${m.shares.nearBlack} vs ${ref.shares.nearBlack}`, `diff <= ${T.black}`, dk <= T.black, `diff ${r3(dk)}`);
  // palette distance, weighted by our share: how far each of our colours sits from the reference palette
  const refPal = ref.palette.filter((c) => c.share >= 0.005).map((c) => unhex(c.hex));
  let wsum = 0, wtot = 0, off = 0; const offenders = [];
  for (const c of m.palette) {
    const d = Math.min(...refPal.map((r) => dE(unhex(c.hex), r)));
    wsum += d * c.share; wtot += c.share;
    if (d > T.offDE) { off += c.share; offenders.push({ hex: c.hex, share: c.share, dE: r1(d) }); }
  }
  const wd = wtot ? wsum / wtot : 0, offTot = wtot ? off / wtot : 0;
  add("paletteDistance", r1(wd), `weighted dE <= ${T.paletteDE}`, wd <= T.paletteDE, "our palette to the nearest reference colour, weighted by share");
  add("offPaletteShare", r3(offTot), `<= ${T.offPalette} (colours > dE ${T.offDE} from every reference colour)`, offTot <= T.offPalette, offenders.map((o) => `${o.hex} ${Math.round(o.share * 100)}% dE${o.dE}`).join("; "));
  if (ref.chroma && m.chroma) {
    const rc = ref.chroma, oc = m.chroma;
    const ab = (h) => { const l = lab(unhex(h)); return [l[1], l[2]]; };
    // hue-aware: chromatic colours are compared on hue/chroma (a*,b*), lightness ignored
    const refCh = rc.chromaticPalette.filter((c) => c.share >= 0.002).map((c) => ab(c.hex));
    let offCh = 0; const offs = [];
    for (const c of oc.chromaticPalette) {
      const [a, b] = ab(c.hex), d = refCh.length ? Math.min(...refCh.map((r) => Math.hypot(a - r[0], b - r[1]))) : Infinity;
      if (d > T.hueDE) { offCh += c.share; offs.push(`${c.hex} ${Math.round(c.share * 100)}% d${d === Infinity ? "inf" : r1(d)}`); }
    }
    const allow = T.chromaAllow + rc.chromaticShare * 1.5; // a brand whose colour is only a moment gets a small allowance
    add("offBrandChromaShare", `${r3(offCh)} off-hue`, `off-hue <= ${T.offChroma}`, offCh <= T.offChroma, offs.join("; "));
    add("chromaticShare", `${oc.chromaticShare} chromatic overall (ref ${rc.chromaticShare})`, `<= ${r3(allow)}`, oc.chromaticShare <= allow, "how much colour, not which: colour content (photos, the product's own colours) is not brand-locked");
    const dn = Math.abs(oc.neutralShare - rc.neutralShare);
    add("neutralShare", `${oc.neutralShare} vs ${rc.neutralShare}`, `diff <= ${T.neutral}`, dn <= T.neutral, "pixels with chroma C* < 10");
    const nz = (h, t) => h.map((v) => (t > 0 ? v / t : 0));
    const hr = nz(rc.neutralLightness, rc.neutralShare), ho = nz(oc.neutralLightness, oc.neutralShare);
    const tv = oc.neutralShare < 0.02 ? 1 : hr.reduce((s, v, i) => s + Math.abs(v - ho[i]), 0) / 2;
    add("neutralLightness", r3(tv), `total variation <= ${T.neutralTV}`, tv <= T.neutralTV, "8-bin L* histogram of neutral pixels, ours vs reference");
  } else add("offBrandChromaShare", "n/a", "", true, "skipped: reference grammar has no chroma block, re-run measure");
  const dm = Math.abs(m.saturation.colourMomentShare - ref.saturation.colourMomentShare);
  add("colourMoments", `${m.saturation.colourMomentShare} vs ${ref.saturation.colourMomentShare}`, `diff <= ${T.colourMoment}`, dm <= T.colourMoment, "share of frames with >10% saturated colour");
  if (m.cuts && ref.cuts && ref.cuts.per10s > 0) {
    const ratio = m.cuts.per10s / ref.cuts.per10s;
    add("cutRateRatio", `${m.cuts.per10s} vs ${ref.cuts.per10s} cuts/10s = ${r1(ratio)}x`, `${T.cutRatio[0]}x to ${T.cutRatio[1]}x`, ratio >= T.cutRatio[0] && ratio <= T.cutRatio[1]);
  } else add("cutRateRatio", "n/a", "", true, "skipped (frames input or no reference cuts)");
  // tempo (house): our change rate within 0.7x to 1.4x the brand's, and never slower than the house rate (a change every 2.5 s).
  // When the brand itself is slower than house, the house cap wins and the lower bound is dropped.
  if (m.tempo && m.tempo.changeEveryS) {
    const mine = m.tempo.changeEveryS, house = HOUSE_CHANGE_EVERY_S, rt = ref.tempo && ref.tempo.changeEveryS;
    if (rt) {
      let lo = rt / 1.4; const hi = Math.min(rt / 0.7, house);
      if (lo > hi || oneTakeVsOther) lo = 0;
      add("tempoRatio", `a change every ${mine} s vs the brand's ${rt} s = ${r1(rt / mine)}x`, `0.7x to 1.4x of the brand's rate, a change at least every ${house} s`, mine >= lo - 0.01 && mine <= hi + 0.01, "the brand's measured tempo, never slower than house");
    } else add("tempoRatio", `a change every ${mine} s`, `at least every ${house} s`, mine <= house + 0.01, "no tempo in the reference grammar (re-run measure): held to the house tempo");
  } else add("tempoRatio", "n/a", "", true, "skipped (frames input or no changes measured)");
  if (ref.finish && m.finish) add("finish", `ours: ${m.finish.route}, brand film: ${ref.finish.route}`, "the brand's films carry a finish layer, so ours does too", ref.finish.layerOff || !m.finish.layerOff, "measured grain, ground tint and falloff, vignette, soft shadow (references/brand-film.md 4)");
  const failed = checks.filter((c) => !c.pass && c.severity === "error").map((c) => c.name);
  const warnings = checks.filter((c) => !c.pass && c.severity === "warning").map((c) => c.name);
  let prs = Array.isArray(gram.principles) ? gram.principles : null;
  if (!prs) { try { const cp = path.join(path.dirname(refp), "FILM-STYLE.json"); if (fs.existsSync(cp)) { const cj = JSON.parse(fs.readFileSync(cp, "utf8")); if (Array.isArray(cj.principles)) prs = cj.principles; } } catch {} }
  const res = { ok: true, tolerance: tolName, ...(prs && prs.length ? { principles_to_judge: prs.map((p) => ({ id: p.id, principle: p.principle, check: p.check })) } : {}), ...(refFilm ? { film: refFilm } : {}), ...(oneTakeVsOther ? { note: "structure one-take against a reference that is not one-take: cut rate is a warning, tempo has no floor" } : {}), verdict: failed.length ? "FAIL" : "PASS", failed, warnings, checks, ours: { luminance: m.luminance, shares: m.shares, palette: m.palette, finish: m.finish, cuts: m.cuts && { count: m.cuts.count, per10s: m.cuts.per10s }, tempo: m.tempo && { changes: m.tempo.changes, changeEveryS: m.tempo.changeEveryS, longestHoldS: m.tempo.longestHoldS } } };
  out(res, failed.length ? 1 : 0);
}

if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") { console.log(HELP); process.exit(cmd ? 0 : 2); }
const table = { find, fetch: fetchCmd, frames: framesCmd, measure: measureCmd, card: cardCmd, compare: compareCmd };
if (!table[cmd]) fail(`unknown subcommand "${cmd}"\n${HELP}`);
table[cmd]();
