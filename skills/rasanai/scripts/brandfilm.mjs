#!/usr/bin/env node
// brandfilm.mjs: learn a brand's real film style, and check our film against it.
//
//   find     --brand "<name>" [--product "<p>"] --out <dir>      candidate official videos (yt-dlp search, no download)
//   fetch    --url <url> | --file <path> --out <dir> [--max-height 720] [--max-duration 180]
//   frames   --in <video> --out <dir>                            cut-detected + 1 fps frames (<=60 JPGs, 640 px) and 6x6 contact sheets
//   measure  --in <video|frames dir> --out <grammar.json>        luminance, white/black shares, palette, saturation, motion, cut rate
//   card     --dir <dir> [--brand <name>]                        FILM-STYLE.json + FILM-STYLE.md (measured numbers + slots for the AI to fill)
//   compare  --ref <grammar.json|FILM-STYLE.json> --ours <video|frames dir> [--tolerance strict|normal]
//                                                                style-match gate, exit 1 on fail
//
// All output is JSON on stdout. Nothing opens a window. Needs ffmpeg/ffprobe; find/fetch need yt-dlp and network.
// Colour distance is CIE76 (dE) in Lab, weighted by palette share. Do not put downloaded brand films in the repo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const YTDLP = fs.existsSync("/opt/homebrew/bin/yt-dlp") ? "/opt/homebrew/bin/yt-dlp" : "yt-dlp";
const W = 64, H = 36;

const HELP = `brandfilm.mjs: learn a brand's real film style and gate our film against it

Usage
  node brandfilm.mjs find     --brand "OpenAI" [--product "ChatGPT"] --out <dir>
  node brandfilm.mjs fetch    --url <url> | --file <path> --out <dir> [--max-height 720] [--max-duration 180]
  node brandfilm.mjs frames   --in <video> --out <dir>
  node brandfilm.mjs measure  --in <video|frames dir> --out <dir>/grammar.json
  node brandfilm.mjs card     --dir <dir> [--brand "OpenAI"]
  node brandfilm.mjs compare  --ref <dir>/grammar.json --ours <video|frames dir> [--tolerance strict|normal]

Flow: find -> pick the official film -> fetch -> frames (read the contact sheets) -> measure -> card
(fill the slots in FILM-STYLE.json/.md from the sheets), then compare our cut against grammar.json.
compare exits 1 when the style does not match. Output is JSON on stdout.
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

// scene-cut times (seconds) from ffmpeg's scene score
function sceneCuts(file, thr = 0.25) {
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

function measure(input) {
  const { bufs, fps } = sampleFrames(input);
  if (!bufs.length) return null;
  const all = new Map(), bgs = new Map(), chromB = new Map(), neuHist = new Array(8).fill(0);
  let chromPix = 0, neuPix = 0;
  let sumLum = 0, white = 0, black = 0, satSum = 0, satPix = 0, moments = 0, motion = 0, motionN = 0, prev = null;
  const perFrame = [];
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
    if (prev) { let d = 0; for (let i = 0; i < px; i++) d += Math.abs(lumArr[i] - prev[i]); motion += d / px; motionN++; }
    prev = lumArr;
    perFrame.push({ i: fi, t: fps ? fi / fps : null, lum: Math.round(fl / px), bg: bk, bgLum: Math.round(luma(...bg)), colorShare: r3(fsp / px) });
  }
  const n = bufs.length;
  const bgDom = cluster(bgs, 10, 3);
  let cuts = null, dur = null;
  if (fps) { const p = probe(input); dur = p ? p.duration : n / fps; cuts = sceneCuts(input); }
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
  const res = { version: 1, source: path.basename(inp), kind: fs.statSync(inp).isDirectory() ? "frames" : "video", measured: m };
  if (file) { mkdir(path.dirname(path.resolve(file))); fs.writeFileSync(file, JSON.stringify(res, null, 2)); }
  out(res);
}

function cardCmd() {
  const dir = opt("dir"); if (!dir) fail("card needs --dir");
  const gp = path.join(dir, "grammar.json");
  if (!fs.existsSync(gp)) fail(`no grammar.json in ${dir}; run measure --out ${gp} first`);
  const g = JSON.parse(fs.readFileSync(gp, "utf8")), m = g.measured;
  const fr = fs.existsSync(path.join(dir, "frames.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "frames.json"), "utf8")) : null;
  const brand = opt("brand", "");
  const slots = {
    typefaces: "", motif: "", layout: "", motionVocabulary: "", photographyStyle: "", endCard: "", notes: "",
  };
  const card = { version: 1, brand, source: g.source, measured: m, frames: fr ? { cutCount: fr.cutCount, cutsPer10s: fr.cutsPer10s, avgShotLength: fr.avgShotLength, sheets: fr.sheets.map((s) => s.file) } : null, slots, filled: false };
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
${c ? `- Cuts: ${c.count}, ${c.per10s} per 10 s, average shot ${c.avgShotLength} s` : "- Cuts: n/a (frames input)"}

## Slots (the director fills these from the frames)
- Typefaces (families, weights, sizes, where type sits):
- Motif (the recurring shape or idea and how it transforms):
- Layout (grid, centring, whitespace, how many elements at once):
- Motion vocabulary (the moves used, and the moves never used):
- Photography style (or none):
- Opening (first image):
- End card:
- Notes (what would make a film look off-brand):

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
  const ref = JSON.parse(fs.readFileSync(refp, "utf8")).measured;
  const m = measure(ours); if (!m) fail("no frames could be read from --ours");
  const checks = [];
  const add = (name, value, limit, pass, note = "") => checks.push({ name, value, limit, pass, note });
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
    add("offBrandChromaShare", `${r3(offCh)} off-hue, ${oc.chromaticShare} chromatic overall (ref ${rc.chromaticShare})`, `off-hue <= ${T.offChroma} and chromatic <= ${r3(allow)}`, offCh <= T.offChroma && oc.chromaticShare <= allow, offs.join("; "));
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
  const failed = checks.filter((c) => !c.pass).map((c) => c.name);
  const res = { ok: true, tolerance: tolName, verdict: failed.length ? "FAIL" : "PASS", failed, checks, ours: { luminance: m.luminance, shares: m.shares, palette: m.palette, cuts: m.cuts && { count: m.cuts.count, per10s: m.cuts.per10s } } };
  out(res, failed.length ? 1 : 0);
}

if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") { console.log(HELP); process.exit(cmd ? 0 : 2); }
const table = { find, fetch: fetchCmd, frames: framesCmd, measure: measureCmd, card: cardCmd, compare: compareCmd };
if (!table[cmd]) fail(`unknown subcommand "${cmd}"\n${HELP}`);
table[cmd]();
