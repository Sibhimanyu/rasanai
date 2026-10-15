#!/usr/bin/env node
// learn.mjs: learn the taste questions from an edit the person likes (a finished video), so the setup flow can prefill
// them with evidence instead of asking.
//
//   infer  --video <edit> [--clip <raw footage>] [--format <option id>] --out <dir>
//            measures what ffmpeg can measure -> <dir>/taste.json (status "measured"), <dir>/sheet.jpg (about 30 frames,
//            each labelled with its time, for the one vision pass), <dir>/end-card.mp4 when the edit ends on its own card
//   set    --out <dir> --question <id> --choice <id> --evidence "<plain sentence>" [--confidence 0.8]
//            fills in or overrides one answer (validated against library/questions.json); status becomes "done" once every
//            applicable question has an answer
//   prompt --video <edit> [--clip <raw footage>] --out <dir>
//            prints the whole brief for a short headless Claude job: infer, look at the sheet, decide `pictures`, finish
//
// Questions and choices are library/questions.json (pictures, speaker, text, captions, marks, ending). infer answers all
// but `pictures` (a judgement: literal / world / concept, left null for the vision pass). Every answer has a choice, a
// confidence 0-1 and one plain sentence of evidence. ffmpeg + Node only, no Python, no window; frames are decoded small.
// Reuses research.mjs `film` (cuts), brandfilm.mjs `measure` (palette, cut rate, tempo, grain), lib/marks.mjs (marks).
// See references/learn.md for what each measure does and where it is wrong.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findMarks, checkMarks, decodeFrames, probeVideo } from "./lib/marks.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, "..", "library");
const argv = process.argv.slice(2);
const cmd = argv[0];
const args = {};
for (let i = 1; i < argv.length; i++) if (argv[i].startsWith("--")) { const k = argv[i].slice(2); args[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; }
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const die = (msg, code = 2) => out({ ok: false, error: msg }, code);
const HELP = `learn.mjs: learn the taste questions from an edit you like

  node learn.mjs infer  --video <edit> [--clip <raw footage>] [--format <option id>] --out <dir>
  node learn.mjs set    --out <dir> --question <id> --choice <id> --evidence "..." [--confidence 0.8]
  node learn.mjs prompt --video <edit> [--clip <raw footage>] --out <dir>
`;
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const questions = () => readJSON(path.join(LIB, "questions.json")).questions;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

// which questions this film asks: the format option's list when it is known, otherwise all of them
function applicableFor(format) {
  const all = questions().map((q) => q.id);
  if (!format) return all;
  try {
    const f = readJSON(path.join(LIB, "formats.json"));
    const opts = Array.isArray(f.options) ? f.options : Object.entries(f.options || {}).map(([id, v]) => ({ id, ...v }));
    const o = opts.find((x) => x.id === format);
    if (o && Array.isArray(o.questions)) return o.questions;
  } catch { /* fall through */ }
  return all;
}

// ------------------------------------------------------------------ contact sheet (time labels drawn here: this ffmpeg has no drawtext)
const GLYPH = { // 3x5 digits, '.', 's', ':'
  0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001",
  5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111",
  ".": "000000000000010", s: "000111110001111", ":": "000010000010000",
};
function label(buf, W, text, x0, y0, sc) {
  const cw = 4 * sc, h = 5 * sc + 2 * sc, w = text.length * cw + sc;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = ((y0 + y) * W + x0 + x) * 3; buf[p] = buf[p + 1] = buf[p + 2] = 0; }
  [...text].forEach((ch, i) => {
    const g = GLYPH[ch]; if (!g) return;
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) if (g[gy * 3 + gx] === "1")
      for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) { const p = ((y0 + sc + gy * sc + dy) * W + x0 + sc + i * cw + gx * sc + dx) * 3; buf[p] = 255; buf[p + 1] = 235; buf[p + 2] = 0; }
  });
}
function contactSheet(video, info, file, n = 30) {
  const portrait = info.height >= info.width, tw = portrait ? 216 : 320, cols = portrait ? 10 : 6;
  const d = decodeFrames(video, { count: n, w: tw });
  if (!d.frames.length) return null;
  const th = d.h, rows = Math.ceil(d.frames.length / cols), pad = 3, SW = cols * (tw + pad) + pad, SH = rows * (th + pad) + pad;
  const sheet = Buffer.alloc(SW * SH * 3);
  d.frames.forEach((f, i) => {
    const ox = pad + (i % cols) * (tw + pad), oy = pad + Math.floor(i / cols) * (th + pad);
    for (let y = 0; y < th; y++) f.copy(sheet, ((oy + y) * SW + ox) * 3, y * tw * 3, (y + 1) * tw * 3);
    label(sheet, SW, `${d.times[i].toFixed(1)}s`, ox, oy, 2);
  });
  const tmp = file + ".raw";
  fs.writeFileSync(tmp, sheet);
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-nostdin", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${SW}x${SH}`, "-i", tmp, "-frames:v", "1", "-q:v", "3", file], { encoding: "utf8" });
  fs.rmSync(tmp, { force: true });
  return r.status === 0 ? { frames: d.frames.length, times: d.times } : null;
}

// ------------------------------------------------------------------ cuts (research.mjs film) and look (brandfilm.mjs measure)
function nodeJSON(script, a, timeout = 240000) {
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...a], { encoding: "utf8", timeout, maxBuffer: 1 << 28 });
  try { return JSON.parse(r.stdout); } catch { return null; }
}
function cutsOf(video, dir) {
  const fdir = path.join(dir, "film");
  const j = nodeJSON("research.mjs", ["film", "--file", video, "--out", fdir]);
  let film = null;
  try { film = readJSON(path.join(fdir, "film.json")); } catch { /* no film.json */ }
  fs.rmSync(path.join(fdir, "frames"), { recursive: true, force: true });
  fs.rmSync(path.join(fdir, "sheet.jpg"), { force: true });
  if (!film) return { cuts: [], stats: null, threshold: null, ok: !!j };
  return { cuts: film.shots.slice(0, -1).map((s) => r2(s.end)), stats: film.stats, threshold: film.threshold };
}
function lookOf(video, dir) {
  const g = path.join(dir, "grammar.json");
  const j = nodeJSON("brandfilm.mjs", ["measure", "--in", video, "--out", g]);
  const m = j && j.measured;
  if (!m) return null;
  return {
    palette: (m.palette || m.colors || []).slice(0, 6),
    cut_rate: m.cutRate ?? m.cuts ?? null, tempo: m.tempo ? { change_every_s: m.tempo.changeEveryS, longest_hold_s: m.tempo.longestHoldS } : null,
    luminance: m.luminance?.mean ?? null, finish: m.finish ? { grain: m.finish.noise ?? m.finish.grain ?? null } : null,
  };
}

// ------------------------------------------------------------------ speaker (skin-tone head blobs; calibrated on the raw clip when given)
const ycc = (r, g, b) => [0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b];
const genericSkin = (r, g, b) => { const [y, cb, cr] = ycc(r, g, b); return y >= 35 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173; };

// the speaker's skin chroma, from a keyed raw clip: median Cb/Cr of the skin-like pixels in the upper half of what is not screen
function calibrate(clip) {
  const d = decodeFrames(clip, { count: 10, w: 135 });
  if (!d.frames.length) return null;
  const cbs = [], crs = [], ys = [], W = d.w, H = d.h;
  for (const f of d.frames) {
    const e = []; // border colour = screen
    for (let x = 0; x < W; x += 4) e.push([f[x * 3], f[x * 3 + 1], f[x * 3 + 2]]);
    const key = [0, 1, 2].map((c) => median(e.map((p) => p[c])));
    let top = H, bottom = 0, any = 0;
    const subj = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (Math.hypot(f[i * 3] - key[0], f[i * 3 + 1] - key[1], f[i * 3 + 2] - key[2]) > 80) { subj[i] = 1; any++; const y = (i / W) | 0; if (y < top) top = y; if (y > bottom) bottom = y; }
    if (any < W * H * 0.05) continue;
    const mid = top + (bottom - top) * 0.45;
    for (let y = top; y < mid; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (subj[i] && genericSkin(f[i * 3], f[i * 3 + 1], f[i * 3 + 2])) { const [, cb, cr] = ycc(f[i * 3], f[i * 3 + 1], f[i * 3 + 2]); cbs.push(cb); crs.push(cr); ys.push(ycc(f[i * 3], f[i * 3 + 1], f[i * 3 + 2])[0]); } }
  }
  if (cbs.length < 200) return null;
  return { cb: median(cbs), cr: median(crs), y: median(ys) };
}
// the biggest head-like skin blob of one RGB frame -> { x, y, w, h, area } normalised, or null
function headBlob(f, W, H, cal) {
  const px = W * H, m = new Uint8Array(px);
  for (let i = 0; i < px; i++) {
    const r = f[i * 3], g = f[i * 3 + 1], b = f[i * 3 + 2];
    if (cal) { const [y, cb, cr] = ycc(r, g, b); m[i] = Math.abs(y - cal.y) <= 38 && Math.abs(cb - cal.cb) <= 6 && Math.abs(cr - cal.cr) <= 6 ? 1 : 0; } else m[i] = genericSkin(r, g, b) ? 1 : 0;
  }
  const D = new Uint8Array(px);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (m[y * W + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) D[(y + dy) * W + x + dx] = 1;
  const seen = new Uint8Array(px), st = [];
  const cands = [];
  for (let s = 0; s < px; s++) {
    if (!D[s] || seen[s]) continue;
    let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0, sy = 0, scb = 0, scr = 0;
    seen[s] = 1; st.push(s);
    while (st.length) {
      const p = st.pop(), x = p % W, y = (p / W) | 0;
      if (m[p]) { n++; { const [yy, cbb, crr] = ycc(f[p * 3], f[p * 3 + 1], f[p * 3 + 2]); sy += yy; scb += cbb; scr += crr; } if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < px && D[q] && !seen[q] && !(Math.abs((q % W) - x) > 1)) { seen[q] = 1; st.push(q); }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (n < px * 0.0025 || n / (bw * bh) < 0.28 || bh / bw < 0.7 || bh / bw > 2.2 || n > px * 0.25) continue;
    cands.push({ x: x0 / W, y: y0 / H, w: bw / W, h: bh / H, area: n / px, fill: n / (bw * bh), ay: sy / n, acb: scb / n, acr: scr / n });
  }
  return cands.sort((a, b) => b.area - a.area);
}
function speakerOf(video, cal, fps = 2) {
  const d = decodeFrames(video, { fps, w: 135 });
  let cands = d.frames.map((f) => headBlob(f, d.w, d.h, cal));
  let selfCal = null;
  if (!cal) {
    // no raw clip: the speaker's skin tone is the most common head-like blob colour (chroma bins of 4, weighted by area)
    const bins = new Map();
    for (const c of cands) for (const b of c.slice(0, 2)) if (b.fill >= 0.4 && b.h / b.w >= 0.8 && b.h / b.w <= 1.8) {
      const k = Math.round(b.acb / 4) + "," + Math.round(b.acr / 4), e = bins.get(k) || (bins.set(k, { n: 0, cb: 0, cr: 0, y: 0 }), bins.get(k));
      e.n += b.area; e.cb += b.acb * b.area; e.cr += b.acr * b.area; e.y += b.ay * b.area;
    }
    let best = null;
    for (const e of bins.values()) if (!best || e.n > best.n) best = e;
    if (best) { selfCal = { cb: best.cb / best.n, cr: best.cr / best.n, y: best.y / best.n }; cands = d.frames.map((f) => headBlob(f, d.w, d.h, selfCal)); }
  }
  return { heads: cands.map((c) => c[0] || null), times: d.times.map((_, i) => i / fps), fps, selfCalibrated: !!selfCal };
}

// ------------------------------------------------------------------ gray frames at 5 fps: captions band, text, soft changes
const frameBudget = (D) => Math.min(5, 360 / Math.max(1, D));
// text-like tiles: crisp, two-tone, with several strokes per row (type on a flat ground), 12x12 px tiles of a 270 px frame
function textTiles(g, W, H, skip) {
  const T = 12, tw = Math.floor(W / T), th = Math.floor(H / T), hit = new Uint8Array(tw * th);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    if (skip(tx, ty, tw, th)) continue;
    const vals = [];
    let trRows = 0;
    for (let y = 0; y < T; y++) {
      let tr = 0;
      for (let x = 0; x < T; x++) {
        const p = (ty * T + y) * W + tx * T + x;
        vals.push(g[p]);
        if (x < T - 1 && Math.abs(g[p + 1] - g[p]) >= 40) tr++;
      }
      if (tr >= 2) trRows++;
    }
    if (trRows < T * 0.5) continue;
    const s = [...vals].sort((a, b) => a - b), lo = s[Math.floor(s.length * 0.05)], hi = s[Math.floor(s.length * 0.95)];
    if (hi - lo < 90) continue;
    let nl = 0, nh = 0;
    for (const v of vals) { if (v - lo <= 30) nl++; else if (hi - v <= 30) nh++; }
    if ((nl + nh) / vals.length < 0.85 || Math.min(nl, nh) / vals.length < 0.08) continue;
    hit[ty * tw + tx] = 1;
  }
  return { hit, tw, th };
}
// the largest connected group of text tiles (8-neighbour): its size in tiles
function biggestGroup(hit, tw, th) {
  const seen = new Uint8Array(hit.length), st = [];
  let best = 0, total = 0;
  for (let s = 0; s < hit.length; s++) {
    if (!hit[s] || seen[s]) continue;
    let n = 0; seen[s] = 1; st.push(s);
    while (st.length) {
      const p = st.pop(); n++;
      const x = p % tw, y = (p / tw) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= tw || yy >= th) continue; const q = yy * tw + xx; if (hit[q] && !seen[q]) { seen[q] = 1; st.push(q); } }
    }
    total += n; if (n > best) best = n;
  }
  return { best, total };
}

// a steady band of changing text near the bottom (captions)
function captionBand(grays, W, H, fps, masks) {
  const y0 = Math.floor(H * 0.5), y1 = Math.floor(H * 0.98), per = [];
  for (const g of grays) {
    const rows = [];
    for (let y = y0; y < y1; y++) {
      let t = 0;
      for (let x = 0; x < W - 1; x++) {
        if (masks(x, y)) continue;
        if (Math.abs(g[y * W + x + 1] - g[y * W + x]) >= 45) t++;
      }
      rows.push(t);
    }
    // runs of text-dense rows (a one-row gap is allowed)
    const runs = [];
    let s = -1, gap = 0;
    for (let i = 0; i <= rows.length; i++) {
      const on = i < rows.length && rows[i] >= 14;
      if (on) { if (s < 0) s = i; gap = 0; } else if (s >= 0) { gap++; if (gap > 1 || i === rows.length) { const e = i - gap; runs.push({ a: s, b: e, sum: rows.slice(s, e + 1).reduce((x, y) => x + y, 0) }); s = -1; gap = 0; } }
    }
    const ok = runs.filter((r) => r.b - r.a + 1 >= 3 && r.b - r.a + 1 <= H * 0.12);
    per.push(ok.length ? ok.reduce((a, b) => (b.sum > a.sum ? b : a)) : null);
  }
  // the dominant position
  const centres = per.map((r) => (r ? (r.a + r.b) / 2 + y0 : null));
  let best = null;
  for (const c of centres) {
    if (c == null) continue;
    const near = centres.filter((v) => v != null && Math.abs(v - c) <= H * 0.025).length;
    if (!best || near > best.near) best = { c, near };
  }
  if (!best) return { present: 0, frames: grays.length, change: 0, interval_s: null, y: null, bar: false };
  const idx = [];
  centres.forEach((c, i) => { if (c != null && Math.abs(c - best.c) <= H * 0.025) idx.push(i); });
  const ya = Math.round(median(idx.map((i) => per[i].a)) + y0), yb = Math.round(median(idx.map((i) => per[i].b)) + y0);
  // column profile of the band per frame; the content changes when consecutive profiles stop correlating
  const prof = (g) => { const p = new Float32Array(W - 1); for (let x = 0; x < W - 1; x++) { let s = 0; for (let y = ya; y <= yb; y++) s += Math.abs(g[y * W + x + 1] - g[y * W + x]); p[x] = s; } return p; };
  const corr = (a, b) => { const ma = mean([...a]), mb = mean([...b]); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da > 0 && db > 0 ? n / Math.sqrt(da * db) : 1; };
  let pairs = 0, changed = 0;
  const changeAt = [];
  let prev = null;
  for (let k = 0; k < grays.length; k++) {
    if (!idx.includes(k)) { prev = null; continue; }
    const p = prof(grays[k]);
    if (prev) { pairs++; if (corr(prev, p) < 0.85) { changed++; changeAt.push(k / fps); } }
    prev = p;
  }
  // a bar: the band's left and right margins are flat (a solid strip behind the words)
  let flat = 0, tot = 0;
  for (const i of idx.slice(0, 20)) { const g = grays[i]; for (let y = ya; y <= yb; y++) { const v = [g[y * W + 2], g[y * W + 6], g[y * W + W - 3], g[y * W + W - 7]]; tot++; if (Math.max(...v) - Math.min(...v) < 14) flat++; } }
  const gaps = changeAt.slice(1).map((t, i) => t - changeAt[i]).filter((g) => g < 3);
  return { present: idx.length, frames: grays.length, change: pairs ? changed / pairs : 0, interval_s: gaps.length ? median(gaps) : null, y: (ya + yb) / 2 / H, band: [ya / H, (yb + 1) / H], bar: tot ? flat / tot > 0.8 : false };
}

// ------------------------------------------------------------------ the measures
async function infer() {
  if (!args.video || !args.out) die("infer needs --video <edit> and --out <dir>");
  const video = path.resolve(String(args.video)), clip = args.clip ? path.resolve(String(args.clip)) : null, dir = path.resolve(String(args.out));
  if (!fs.existsSync(video)) die(`not found: ${video}`);
  if (clip && !fs.existsSync(clip)) die(`not found: ${clip}`);
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) die("ffmpeg is required");
  fs.mkdirSync(dir, { recursive: true });
  const info = probeVideo(video);
  if (!info || !(info.duration > 0)) die(`ffprobe could not read ${video}`);
  const D = info.duration, t0 = Date.now(), timings = {}, tick = (k, s) => { timings[k] = r2((Date.now() - s) / 1000); };
  const applicable = applicableFor(args.format && args.format !== true ? String(args.format) : null);
  const answers = Object.fromEntries(questions().map((q) => [q.id, null]));
  const put = (id, choice, confidence, evidence) => { answers[id] = { choice, confidence: r2(confidence), evidence }; };

  let s = Date.now();
  const sheetInfo = contactSheet(video, info, path.join(dir, "sheet.jpg"));
  tick("sheet", s);
  s = Date.now();
  const { cuts, stats, threshold } = cutsOf(video, dir);
  tick("cuts", s);
  s = Date.now();
  const look = lookOf(video, dir);
  tick("look", s);

  // ---- speaker
  s = Date.now();
  const cal = clip ? calibrate(clip) : null;
  const sp = speakerOf(video, cal);
  tick("speaker", s);
  const heads = sp.heads, N = heads.length, present = heads.filter(Boolean).length;
  const headBoxes = heads.filter(Boolean);
  const meanHead = headBoxes.length ? { x: mean(headBoxes.map((b) => b.x)), y: mean(headBoxes.map((b) => b.y)), w: mean(headBoxes.map((b) => b.w)), h: mean(headBoxes.map((b) => b.h)) } : null;

  // ---- ending: the last segment has no speaker where the rest has one (a card), judged from the speaker track and the last cut
  let ending = null;
  {
    const lastCut = cuts.length ? cuts[cuts.length - 1] : null;
    if (lastCut != null && D - lastCut >= 1.2 && D - lastCut <= Math.max(20, D * 0.35) && N) {
      const inSeg = (i) => sp.times[i] >= lastCut + 0.3, before = (i) => sp.times[i] < lastCut - 0.3 && sp.times[i] >= lastCut - 12;
      const segIdx = heads.map((_, i) => i).filter(inSeg), preIdx = heads.map((_, i) => i).filter(before);
      const segShare = segIdx.length ? segIdx.filter((i) => heads[i]).length / segIdx.length : 1;
      const preShare = preIdx.length ? preIdx.filter((i) => heads[i]).length / preIdx.length : 0;
      if (segShare <= 0.15 && preShare >= 0.6) ending = { start_s: lastCut, conf: 0.85, why: `the last ${r2(D - lastCut)} s have no speaker, after ${r2(lastCut)} s that do` };
    }
  }
  const body = ending ? heads.filter((_, i) => sp.times[i] < ending.start_s) : heads;
  const bodyPresent = body.filter(Boolean);

  // ---- speaker answer
  if (!bodyPresent.length) put("speaker", "cutaways", 0.3, `no speaker found in any of ${plural(body.length, "sampled frame")}; the picture carries the film`);
  else {
    const missing = body.length - bodyPresent.length;
    const mw = median(bodyPresent.map((b) => b.w)), mcx = median(bodyPresent.map((b) => b.x + b.w / 2)), mcy = median(bodyPresent.map((b) => b.y + b.h / 2));
    const inl = bodyPresent.filter((b) => Math.abs(b.w / mw - 1) < 0.3 && Math.abs(b.x + b.w / 2 - mcx) < 0.08 && Math.abs(b.y + b.h / 2 - mcy) < 0.08).length;
    const inShare = inl / bodyPresent.length, sizeRange = Math.max(...bodyPresent.map((b) => b.w)) / Math.min(...bodyPresent.map((b) => b.w));
    // runs of absent frames of at least two seconds
    let longGap = 0, run = 0;
    for (const h of body) { if (!h) { run++; longGap = Math.max(longGap, run); } else run = 0; }
    if (missing / body.length >= 0.2 && longGap >= sp.fps * 2) put("speaker", "cutaways", 0.7, `the speaker is off screen in ${missing} of ${plural(body.length, "sampled frame")}, then comes back`);
    else if (inShare >= 0.75) put("speaker", "fixed", 0.85, `the speaker's head stays the same size (about ${Math.round(mw * 100)}% of the width) and in the same place in ${inl} of ${plural(bodyPresent.length, "frame")} that show him`);
    else put("speaker", "moving", 0.8, `the speaker's head changes size and place: it is the same in only ${Math.round(inShare * 100)}% of the frames, and up to ${r2(sizeRange)} times bigger in others, so the layout changes`);
  }

  // ---- gray frames for text and captions
  s = Date.now();
  const fps = frameBudget(D), g5 = decodeFrames(video, { fps, w: 270, gray: true });
  const W = g5.w, H = g5.h;
  tick("decode", s);

  // ---- marks
  s = Date.now();
  let marks = [], rawMarks = null, markCheck = null;
  const exclude = meanHead ? { x: Math.max(0, meanHead.x - meanHead.w * 0.4), y: Math.max(0, meanHead.y - meanHead.h * 0.4), w: meanHead.w * 1.8, h: meanHead.h * 1.8 } : undefined;
  if (clip) {
    rawMarks = await findMarks(clip, { samples: 24 });
    marks = rawMarks;
    if (rawMarks.length) markCheck = await checkMarks(video, rawMarks, clip);
  } else marks = await findMarks(video, { samples: 24, exclude });
  tick("marks", s);
  const where = (b) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return `${cy > 0.66 ? "bottom" : cy < 0.33 ? "top" : "middle"} ${cx < 0.33 ? "left" : cx > 0.66 ? "right" : "centre"}`.replace("middle centre", "middle"); };
  if (marks.length) {
    const b = marks[0];
    if (clip) {
      const hidden = markCheck.filter((m) => !m.visible);
      if (hidden.length) put("marks", "cover", 0.8, `the ${where(hidden[0])} mark in your clip is visible in only ${Math.round(hidden[0].presence * 100)}% of this edit's frames: it is covered`);
      else put("marks", "keep", 0.9, `the ${where(b)} mark in your clip is still visible in ${Math.round(markCheck[0].presence * 100)}% of this edit's frames`);
    } else put("marks", "keep", 0.85, `a small mark (${where(b)}) stays in the same place in ${Math.round(b.presence * 100)}% of the frames`);
  }

  // ---- captions and text
  s = Date.now();
  const markMask = (x, y) => marks.some((m) => x / W >= m.x - 0.02 && x / W <= m.x + m.w + 0.02 && y / H >= m.y - 0.012 && y / H <= m.y + m.h + 0.012);
  const headMask = (x, y) => meanHead && x / W >= exclude.x && x / W <= exclude.x + exclude.w && y / H >= exclude.y && y / H <= exclude.y + exclude.h;
  const endIdx = ending ? Math.floor(ending.start_s * fps) : g5.frames.length;
  const gBody = g5.frames.slice(0, endIdx);
  const cb = captionBand(gBody, W, H, fps, (x, y) => markMask(x, y) || headMask(x, y));
  const presentShare = cb.frames ? cb.present / cb.frames : 0;
  const isCaps = presentShare >= 0.5 && cb.change >= 0.25;
  if (isCaps) {
    const wordByWord = cb.interval_s != null && cb.interval_s <= 0.8;
    const styled = wordByWord || cb.bar;
    put("captions", styled ? "styled" : "plain", styled ? 0.7 : 0.6, `a text band at the bottom changes ${cb.interval_s ? `every ${r2(cb.interval_s)} s` : "as he speaks"} in ${Math.round(presentShare * 100)}% of the frames${cb.bar ? ", on a solid strip" : ""}${wordByWord ? ", word by word" : ""}`);
  } else put("captions", "off", presentShare < 0.1 ? 0.9 : 0.75, presentShare < 0.1 ? `no steady text band at the bottom in any of ${plural(gBody.length, "sampled frame")}` : `a bottom band shows up in ${Math.round(presentShare * 100)}% of the frames but never changes like captions`);

  // text outside the caption band and the marks: groups of crisp two-tone tiles
  const stepT = Math.max(1, Math.round(fps / 2)), textFlags = [];
  const capBand = isCaps ? cb.band : null;
  for (let i = 0; i < gBody.length; i += stepT) {
    const g = gBody[i];
    const r = textTiles(g, W, H, (tx, ty, tw, th) => {
      const x = (tx + 0.5) / tw, y = (ty + 0.5) / th;
      if (capBand && y >= capBand[0] - 0.02 && y <= capBand[1] + 0.02) return true;
      if (marks.some((m) => x >= m.x - 0.03 && x <= m.x + m.w + 0.03 && y >= m.y - 0.02 && y <= m.y + m.h + 0.02)) return true;
      if (meanHead && x >= exclude.x && x <= exclude.x + exclude.w && y >= exclude.y && y <= exclude.y + exclude.h) return true;
      return false;
    });
    const grp = biggestGroup(r.hit, r.tw, r.th);
    let lines = 0;
    for (let ty = 0; ty < r.th; ty++) { let c = 0; for (let tx = 0; tx < r.tw; tx++) c += r.hit[ty * r.tw + tx]; if (c >= 6) lines++; }
    textFlags.push({ t: i / fps, has: lines >= 1, lines, size: grp.total });
  }
  tick("text", s);
  const nT = textFlags.length, withText = textFlags.filter((f) => f.has).length, share = nT ? withText / nT : 0;
  let events = 0;
  { let lastHas = -9; textFlags.forEach((f) => { if (!f.has) return; if (f.t - lastHas > 1.6) events++; lastHas = f.t; }); }
  const avgSize = withText ? mean(textFlags.filter((f) => f.has).map((f) => f.size)) : 0;
  if (share < 0.05) put("text", "none", 0.8, `almost no writing on screen: only ${plural(withText, "frame")} of ${nT} have any`);
  else if (share < 0.45 && events < 5 * D / 60) put("text", "key", 0.75, `writing appears in ${withText} of ${nT} frames, in ${events === 1 ? "one short stretch" : `${events} short stretches`}: a title or a name, not a graphics film`);
  else put("text", "full", 0.75, `${plural(events, "separate piece")} of writing come and go (${withText} of ${nT} sampled frames show some): a graphics film, not an occasional title`);

  // ---- soft changes (not a cut, yet the picture changes a lot): dissolves and morphs
  const small = g5.frames.map((g) => { const o = new Uint8Array((W >> 2) * (H >> 2)); for (let y = 0; y < (H >> 2); y++) for (let x = 0; x < (W >> 2); x++) o[y * (W >> 2) + x] = g[(y * 4) * W + x * 4]; return o; });
  const k2 = Math.max(1, Math.round(fps * 0.4));
  let soft = 0, lastT = -9;
  for (let i = k2; i < small.length; i++) {
    let d = 0; for (let p = 0; p < small[i].length; p++) d += Math.abs(small[i][p] - small[i - k2][p]);
    d /= small[i].length;
    const t = i / fps;
    if (d > 22 && t - lastT > 1 && !cuts.some((c) => Math.abs(c - t) < 0.8)) { soft++; lastT = t; }
  }

  // ---- ending answer (and the card file)
  let endingInfo = { start_s: null, file: null };
  if (ending) {
    const file = path.join(dir, "end-card.mp4");
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-nostdin", "-ss", String(ending.start_s), "-i", video, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", file], { encoding: "utf8" });
    endingInfo = { start_s: r2(ending.start_s), file: r.status === 0 ? "end-card.mp4" : null };
    put("ending", "card", ending.conf, `${ending.why}: it reads as an end card, saved as end-card.mp4`);
  } else put("ending", "none", 0.7, cuts.length ? D - cuts[cuts.length - 1] >= 1.2 ? `the last ${r2(D - cuts[cuts.length - 1])} s still look like the rest of the film (the speaker is there)` : "no separate closing segment after the last cut" : "no cuts, so no separate closing segment");
  // pace line for the evidence trail, not a question
  const pace = { cuts: cuts.length, cut_every_s: cuts.length ? r2(D / (cuts.length + 1)) : null, cuts_per_min: stats ? stats.cuts_per_min : null, soft_changes: soft, scene_threshold: threshold };

  const taste = {
    version: 1, video, ...(clip ? { clip } : {}), duration_s: r2(D), format: args.format && args.format !== true ? String(args.format) : null,
    applicable: applicable.filter((q) => q !== "marks" || marks.length),
    answers, cuts, pace, marks: marks.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h, presence: m.presence })),
    ending: endingInfo, look,
    measures: { speaker_frames: { present, sampled: N, head: meanHead && { x: r3(meanHead.x), y: r3(meanHead.y), w: r3(meanHead.w), h: r3(meanHead.h) }, calibrated_on_clip: !!cal }, caption_band: cb, text: { frames_with_text: withText, sampled: nT, events }, sheet_frames: sheetInfo ? sheetInfo.frames : 0 },
    timings_s: { ...timings, total: r2((Date.now() - t0) / 1000) },
    status: "measured",
  };
  settle(taste);
  fs.writeFileSync(path.join(dir, "taste.json"), JSON.stringify(taste, null, 2));
  out({ ok: true, taste: path.join(dir, "taste.json"), sheet: path.join(dir, "sheet.jpg"), status: taste.status, answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v ? `${v.choice} (${v.confidence}): ${v.evidence}` : null])), cuts, ending: endingInfo, marks: taste.marks, applicable: taste.applicable, timings_s: taste.timings_s, next: `look at ${path.join(dir, "sheet.jpg")}, then: node learn.mjs set --out ${dir} --question pictures --choice literal|world|concept --evidence "..."` });
}

// status is "done" once every applicable question has an answer
function settle(t) {
  t.status = t.applicable.every((q) => t.answers[q]) ? "done" : "measured";
}

function setCmd() {
  if (!args.out || !args.question || !args.choice) die("set needs --out <dir> --question <id> --choice <id> --evidence \"...\"");
  const file = path.join(path.resolve(String(args.out)), "taste.json");
  if (!fs.existsSync(file)) die(`no taste.json in ${args.out}: run infer first`);
  const q = questions().find((x) => x.id === args.question);
  if (!q) die(`unknown question "${args.question}"; it is one of: ${questions().map((x) => x.id).join(", ")}`);
  if (!q.choices.some((c) => c.id === args.choice)) die(`"${args.choice}" is not a choice of ${q.id}; it is one of: ${q.choices.map((c) => c.id).join(", ")}`);
  if (!args.evidence || args.evidence === true) die("set needs --evidence \"<one plain sentence>\"");
  const conf = args.confidence === undefined ? 0.8 : Number(args.confidence);
  if (!(conf >= 0 && conf <= 1)) die("--confidence is a number from 0 to 1");
  const t = readJSON(file);
  t.answers[q.id] = { choice: String(args.choice), confidence: r2(conf), evidence: String(args.evidence) };
  if (!t.applicable.includes(q.id)) t.applicable.push(q.id);
  settle(t);
  fs.writeFileSync(file, JSON.stringify(t, null, 2));
  out({ ok: true, question: q.id, choice: args.choice, status: t.status, missing: t.applicable.filter((x) => !t.answers[x]) });
}

function promptCmd() {
  if (!args.video || !args.out) die("prompt needs --video <edit> and --out <dir>");
  const me = fileURLToPath(import.meta.url), video = path.resolve(String(args.video)), dir = path.resolve(String(args.out));
  const clip = args.clip ? path.resolve(String(args.clip)) : null;
  const fmt = args.format && args.format !== true ? ` --format ${args.format}` : "";
  const text = `You are learning one person's taste from a video edit they like, so a setup flow can prefill questions for their next film. Work fast and cheaply (under 60k tokens): there is nobody to ask, so never ask a question; open no window and no app; no Python; use only the commands below, plus ffmpeg if you extract frames.

EDIT: ${video}${clip ? `\nRAW CLIP (the green-screen footage the edit was cut from): ${clip}` : ""}
OUT: ${dir}

1. Measure. Run:
   node ${me} infer --video "${video}"${clip ? ` --clip "${clip}"` : ""}${fmt} --out "${dir}"
   It takes about a minute and writes ${dir}/taste.json and ${dir}/sheet.jpg. Read the printed answers: each has a choice and a one-sentence evidence.
2. Look. Open ${dir}/sheet.jpg with the Read tool (about 30 frames, each labelled with its time). Optionally extract two full frames with ffmpeg (ffmpeg -ss <t> -i "${video}" -frames:v 1 ${dir}/f1.jpg) and Read them, no more.
3. Decide \`pictures\`, the one question the measures cannot answer:
   - literal: the pictures are recognisable real things: stock photos, real objects or products, the actual book cover, named in the talk.
   - world: every picture belongs to one consistent designed world (one illustration or 3D style, one set of characters).
   - concept: metaphorical or surreal pictures that add a second meaning.
   Run: node ${me} set --out "${dir}" --question pictures --choice <literal|world|concept> --evidence "<one plain sentence naming what you saw, with times>" --confidence <0-1>
4. Check the measured answers against the sheet. Only if one is clearly wrong (captions says off but every frame has a caption bar; text says none but graphics fill the screen; speaker says fixed but the person plainly moves between layouts), correct it with the same \`set\` command (choices: speaker fixed|moving|cutaways, text none|key|full, captions off|plain|styled, marks keep|cover, ending card|make|none) and say why in the evidence. The plain-versus-styled captions guess is the weakest: if captions are present, look and fix it. Do not change answers that are plausible.
5. Finish: ${dir}/taste.json must have "status": "done". If \`set\` printed a non-empty "missing" list, set those questions too. Then reply with one line per question: the choice and the evidence. Nothing else.
`;
  process.stdout.write(text);
}

if (cmd === "infer") await infer();
else if (cmd === "set") setCmd();
else if (cmd === "prompt") promptCmd();
else { process.stdout.write(HELP); process.exit(cmd && cmd !== "help" && cmd !== "--help" ? 2 : 0); }
