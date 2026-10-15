#!/usr/bin/env node
// Film-wide finish for a delivery render: real motion blur on every scene (2D DOM/GSAP included)
// and one grade across the whole film. Zero dependencies; needs ffmpeg/ffprobe and, for blur/all,
// `npx hyperframes render`. Prints JSON. Method and costs: references/finish.md.
//
//   node finish.mjs blur  --project <dir> --out <mp4> [--fps 30] [--shutter 0.5] [--samples 4..32|auto]  (above 8 at 30 fps: phase-shifted passes, see finish.md)
//                         [--sharp "t0-t1,t2-t3" | --sharp-scenes 3,5]   (no blur on these: stepped / on-twos scenes keep their steps; also any scene
//                          whose frame root or index clip carries data-finish-blur="off" is left sharp automatically; --no-auto-sharp turns that off)
//                         [--quality draft|delivery] [--crf 18] [--composition <file>] [--workers n] [--keep]
//   node finish.mjs grade --in <mp4> --out <mp4> [--grain 0.03] [--halation 0.2] [--vignette 0.2]
//                         [--bloom 0] [--lut <cube>] [--seed 1] [--probe x,y,w,h]
//                         lens and finish extras (all off by default, references/finish.md "Lens and print extras"):
//                         [--lens k]              lens distortion, k1 in -0.3..0.3 (+ barrel with the zoom that hides its corners, - pincushion)
//                         [--ca px] [--ca-at "t0-t1,..."]   chromatic aberration, px of R/B split at the corner at 1080p; windows, or the score's
//                                                 "chromatic-split" budget scenes; film-wide only with a note (the uniform tell)
//                         [--focus-follow | --focus x,y,w,h] [--focus-blur 7]   a soft field outside the hero's box (0..1 of the frame): the score's
//                                                 scenes[].hero_box [x,y,w,h] (+ optional hero_box_end) with --run/--score, or one constant box
//                         [--crt 0..1] [--crt-at ...] [--led px] [--led-at ...]   scanlines + phosphor triads / an LED-wall cell grid (screen worlds)
//                         [--print riso]          the film-wide risograph print: three spot-ink plates (teal 15, pink 75, yellow 45 degrees),
//                                                 re-screened, plates a few px off register with a 3-variant shimmer, 0.6% dropout specks
//                         [--print-pitch 10.8] [--print-shimmer 1] [--print-dropout 0.006] [--print-contrast 1]
//   node finish.mjs all   --project <dir> --out <mp4> [blur options] [grade options]
//   --draft (blur or all): the cheap draft blur for drafts and review strips: 4 samples in one 120 fps pass, draft
//                         quality, no auto pre-pass, no grade (all --draft = blur --draft). Hero moves show their smear
//                         in the draft and in strips cut from it. Override the count with --samples.
//   Projects that use RasanCamera render with its speed trails scaled to the gap between sub-frames
//   (window.RASAN_CAMERA_TRAILS = 2/samples): the shutter makes the smear, the trail only fills the steps between samples.
//   node finish.mjs patch-test [grade options]     (brand-colour drift of the grade on flat patches)
// Blur details (references/finish.md): the shutter averages in LINEAR light (--blur-space gamma for the old gamma average); a frame whose
// shutter window would straddle a hard cut is laid from its own centre sub-frame (nothing of the other shot leaks in; --no-cut-aware turns
// that off); one blur grammar per film: a score (--run / --score) or motion.md that declares blur_grammar smear | stepped | crisp makes
// blur/all refuse the shutter (--shutter-over-smear overrides, --draft is never refused); renders take a slot (lib/slot.mjs: at most
// RASANAI_RENDER_SLOTS at once on the machine, a free-memory gate; RASANAI_RENDER_SLOTS=0 or --no-slot turns it off).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, die, readFrontmatterDoc } from "./lib/common.mjs";
import { sharpRanges as sharpRangesOf, graphWithSharp } from "./lib/sharp.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";
import { acquireSlotSync } from "./lib/slot.mjs";
import { readBudget } from "./lib/budget.mjs";

const args = parseArgs();
const cmd = args._[0];
const MAX_RENDER_FPS = 240; // hyperframes render accepts 1..240
const MAX_PASSES = 4; // phase-shifted passes: up to 4 x 240 sub-frames per second

// the print grade is our own code from the idea of the MIT animate kit's riso finish (cth9191/animate, styles/riso/kit.js): credited in the report
const CREDIT_RISO = { name: "animate (cth9191)", licence: "MIT", what: "the idea of a film-wide riso print finish (three plates, per-angle screens, register shimmer, dropout); the code here is our own", url: "https://github.com/cth9191/animate" };
const num = (v, d) => (v === undefined || v === true || v === "" || Number.isNaN(Number(v)) ? d : Number(v));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sh = (bin, argv, opts = {}) => spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
const ff = (argv, label) => {
  const r = sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv]);
  if (r.status !== 0) die(`ffmpeg failed${label ? ` (${label})` : ""}: ${(r.stderr || "").trim().split("\n").slice(-6).join(" | ")}`);
  return r;
};
const fmtSize = (p) => Math.round((fs.statSync(p).size / 1024) * 10) / 10;

function probe(file) {
  const r = sh("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,nb_frames,duration:format=duration", "-of", "json", file]);
  if (r.status !== 0) die(`ffprobe failed for ${file}`);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === "video");
  const [a, b] = String(v.r_frame_rate).split("/").map(Number);
  return {
    width: v.width, height: v.height, fps: a / (b || 1), fpsRat: `${a}/${b || 1}`,
    duration: Number(j.format.duration), frames: Number(v.nb_frames) || null,
    hasAudio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

// ---------------------------------------------------------------- blur

// Sub-frames are point samples at k / (fps*N). Output frame n is centred on t = n / fps, i.e. sub-frame
// index n*N, and averages the window [n*N - M/2, n*N + M/2] sub-frames (shutter = M/N of a frame). M is
// even so the centre is a sub-frame; the two end taps get half weight, which makes the window exactly
// M sub-frame intervals wide (a true box filter of the sub-frame signal, symmetric about the frame time).
// linear = true (default): the average is taken in linear light (a 2.2 power on 16-bit planes), not on gamma-encoded values: a bright
// object crossing a dark ground keeps its highlight in the streak instead of fading into mud. The chain takes yuv420p bt709 limited in and
// gives yuv420p bt709 limited out (explicit matrices both ways).
function blurChain({ N, shutter, fps, linear = true }) {
  const M = N <= 1 ? 0 : Math.max(2, 2 * Math.round((shutter * N) / 2));
  if (M === 0) return { M, effShutter: 0, chain: `setpts=N/(${fps}*TB)` };
  const P = M / 2;
  const w = Array.from({ length: M + 1 }, (_, i) => (i === 0 || i === M ? 0.5 : 1)).join(" ");
  const g = (e) => `lutrgb=r='pow(val/maxval,${e})*maxval':g='pow(val/maxval,${e})*maxval':b='pow(val/maxval,${e})*maxval'`;
  const toLin = linear ? [`scale=in_color_matrix=bt709:in_range=limited:flags=accurate_rnd+full_chroma_int`, `format=gbrp16le`, g("2.2")] : [];
  const fromLin = linear ? [g("(1/2.2)"), `scale=out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int`, `format=yuv420p`] : [];
  // pad P clones each side so frame 0 and the last frame have full windows; tmix output i averages
  // padded inputs i-M..i, i.e. original sub-frames centred on i-2P; the first full window is i = M.
  const chain = [
    ...toLin,
    `tpad=start=${P}:start_mode=clone:stop=${P}:stop_mode=clone`,
    `tmix=frames=${M + 1}:weights='${w}'`,
    `trim=start_frame=${M}`,
    `setpts=PTS-STARTPTS`,
    `select='not(mod(n,${N}))'`,
    `setpts=N/(${fps}*TB)`,
    ...fromLin,
  ].join(",");
  return { M, effShutter: M / N, chain, space: linear ? "linear" : "gamma" };
}

// Hard cuts in the oversampled render: a jump between two consecutive sub-frames of pass 0 (mean luma difference at 480 px wide, far above
// the 240 fps motion floor). -> pass-0 frame indices i whose step i-1 -> i is a cut.
function detectCuts(file) {
  const r = sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-vf", "scale=480:-2,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-", "-f", "null", "-"]);
  const vals = [...String(r.stdout).matchAll(/YDIF=([0-9.e+-]+)/g)].map((m) => Number(m[1]));
  if (vals.length < 3) return [];
  const sorted = [...vals].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)] || 0;
  const thr = Math.max(10, med * 20);
  return vals.map((v, i) => (i > 0 && v > thr ? i : -1)).filter((i) => i > 0);
}

// Output frames whose shutter window [nN-P, nN+P] holds both sides of a cut (the cut lies between interleaved sub-frames b-1 and b,
// b in ((i-1)K, iK] for a cut seen at pass-0 frame i). Those frames are laid sharp from their own centre sub-frame, the frame-time side.
function cutFrames(cuts, { N, M, K, fps, frames }) {
  const P = M / 2, set = new Set();
  for (const i of cuts) {
    const lo = Math.ceil(((i - 1) * K + 1 - P) / N), hi = Math.floor((i * K - 1 + P) / N);
    for (let n = Math.max(0, lo); n <= hi && (!frames || n < frames); n++) set.add(n);
  }
  return [...set].sort((a, b) => a - b).map((n) => [Math.round((n / fps - 0.002) * 10000) / 10000, Math.round((n / fps + 0.002) * 10000) / 10000, `cut at frame ${n}`]);
}

// The film's declared blur grammar (one per film): score.json `blur_grammar`, else motion.md `blur_grammar`: shutter | smear | stepped | crisp
function declaredGrammar(project) {
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  let v = null, from = null;
  const sf = args.score && args.score !== true ? path.resolve(String(args.score)) : args.run && args.run !== true ? path.join(path.resolve(String(args.run)), "motion", "score.json") : null;
  const sc = sf && read(sf);
  if (sc && typeof (sc.blur_grammar || (sc.film && sc.film.blur_grammar)) === "string") { v = String(sc.blur_grammar || sc.film.blur_grammar); from = path.basename(sf); }
  if (!v) { try { const M = readFrontmatterDoc(fs.readFileSync(path.join(project, "motion.md"), "utf8")).fields; if (M && typeof M.blur_grammar === "string") { v = M.blur_grammar; from = "motion.md"; } } catch {} }
  return v ? { value: v.trim().toLowerCase(), from } : null;
}

// Motion energy per output frame from a cheap draft pass: mean absolute luma difference to the previous
// frame (signalstats YDIF) on a 480-wide copy. Gives a global sample count (render is one fps for the whole film).
function measureMotion(file) {
  const r = sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-vf", "scale=480:-2,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-", "-f", "null", "-"]);
  // hard cuts read as huge YDIF and say nothing about motion: drop frames above 20
  const vals = [...String(r.stdout).matchAll(/YDIF=([0-9.e+-]+)/g)].map((m) => Number(m[1])).filter((v) => v <= 20);
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { frames: vals.length, p50: pct(0.5), p95: pct(0.95), max: sorted[sorted.length - 1] };
}

function autoSamples(motion, cap) {
  // YDIF is mean |dY| over the whole frame, so a small fast object under-reads; thresholds are low on purpose.
  // Calibration: see references/finish.md. Steps are even numbers so the window centres on a sub-frame.
  let n;
  const m = motion ? motion.p95 : 99;
  if (m < 0.5) n = 4;
  else if (m < 2) n = 6;
  else if (m < 4) n = cap;
  else if (m < 8) n = cap * 2;
  else n = cap * 4;
  return Math.min(n, cap * MAX_PASSES);
}

// A copy of the project whose GSAP timelines (the host's, every sub-composition's and Rasan3D's clock tween)
// are all seeked `delta` seconds later. HyperFrames has no time-offset or frame-range option and snaps its own
// seek time to the render fps grid, so the shift is applied after the snap, on the timeline instances.
// Not shifted: CSS keyframes / WAAPI / Lottie / video and audio elements (sub-millisecond for audio).
function shiftedProject(project, delta, dir, trails = 0) {
  const out = fs.mkdtempSync(path.join(dir, "shift-"));
  for (const e of fs.readdirSync(project)) {
    if (e === "index.html" || e === "renders" || e === "node_modules" || e === ".git") continue;
    fs.symlinkSync(path.join(project, e), path.join(out, e));
  }
  const inj = `<script>window.RASAN_CAMERA_TRAILS=${trails > 0 ? Math.round(trails * 1000) / 1000 : false};(function(){var D=${delta};function wrap(tl){if(!tl||tl.__sh||typeof tl.seek!=="function")return tl;tl.__sh=1;["seek","time","totalTime"].forEach(function(m){var o=tl[m];if(typeof o!=="function")return;tl[m]=function(v){if(arguments.length&&typeof v==="number"){var a=Array.prototype.slice.call(arguments);a[0]=v+D;return o.apply(this,a)}return o.apply(this,arguments)}});return tl}window.__timelines=new Proxy({},{set:function(t,k,v){t[k]=wrap(v);return true}});})()</script>`;
  let html = fs.readFileSync(path.join(project, "index.html"), "utf8");
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inj) : inj + html;
  fs.writeFileSync(path.join(out, "index.html"), html);
  return out;
}

function renderOversampled({ project, composition, fps, N, quality, workers, outFile }) {
  const argv = ["--yes", "hyperframes", "render", project, "-o", outFile, "--fps", String(fps * N), "--quiet"];
  if (composition) argv.push("-c", composition);
  if (workers) argv.push("-w", String(workers));
  if (quality === "draft") argv.push("--quality", "draft");
  else argv.push("--quality", "delivery");
  const t0 = Date.now();
  const r = sh("npx", argv, { cwd: project });
  const secs = (Date.now() - t0) / 1000;
  if (r.status !== 0 || !fs.existsSync(outFile)) die(`hyperframes render failed at ${fps * N} fps: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-6).join(" | ")}`);
  return secs;
}

// ---------------------------------------------------------------- grade


const grainSrc = (w, h, fps, seed) => `color=c=black:s=${w}x${h}:r=${fps},format=gray,lut=y=128,noise=alls=64:allf=t+u:all_seed=${seed}`;
let calCache = null;
// Mean/std of the combined 0.6 fine + 0.4 coarse noise map as ffmpeg really produces it (the filter's
// distribution differs by build), measured on a 640x360 sample of 4 frames.
function calibrateGrain(seed) {
  if (calCache) return calCache;
  const W = 640, H = 360;
  const graph = `${grainSrc(W, H, 30, seed)}[a];${grainSrc(W / 2, H / 2, 30, seed + 7)},scale=${W}:${H}:flags=neighbor,format=gray[b];[a][b]blend=all_mode=normal:all_opacity=0.4:shortest=1,format=gray`;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-filter_complex", graph, "-frames:v", "4", "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
  const b = r.stdout;
  if (!b || !b.length) die("grain calibration failed");
  let m = 0;
  for (const v of b) m += v;
  m /= b.length;
  let s = 0;
  for (const v of b) s += (v - m) ** 2;
  calCache = { mean: m, std: Math.sqrt(s / b.length) };
  return calCache;
}

// ---- lens, focus, CRT/LED and print extras (all off by default; references/finish.md "Lens and print extras")
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const parseWindows = (v) => (v && v !== true ? String(v).split(",").map((s) => s.trim().split("-").map(Number)).filter((w) => w.length === 2 && w.every(Number.isFinite) && w[1] > w[0]) : []);
const enableOf = (wins) => wins.map(([a, b]) => `between(t,${r4(a)},${r4(b)})`).join("+");
function scoreDoc() {
  const sf = args.score && args.score !== true ? path.resolve(String(args.score)) : args.run && args.run !== true ? path.join(path.resolve(String(args.run)), "motion", "score.json") : null;
  try { return sf ? JSON.parse(fs.readFileSync(sf, "utf8")) : null; } catch { return null; }
}
// a budget entry's "scene" is a 1-based position or a scene id
const sceneSpan = (sc, ref) => {
  const L = (sc && sc.scenes) || [];
  const s = L.find((x) => String(x.id) === String(ref)) || L[Number(ref) - 1];
  return s && Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end)) && Number(s.end) > Number(s.start) ? [Number(s.start), Number(s.end)] : null;
};
// the score's hero boxes: scenes[].hero_box = [x, y, w, h] as 0..1 of the frame (optional hero_box_end: the box at the scene's end,
// the focus follows it linearly); a scene without one stays sharp
function heroBoxes(sc) {
  const ok = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(Number(v)));
  const out = [];
  for (const s of (sc && sc.scenes) || []) {
    const b = s.hero_box || (s.hero && s.hero.box), a = Number(s.start), z = Number(s.end);
    if (!ok(b) || !(z > a)) continue;
    out.push({ id: s.id, a, z, from: b.map(Number), to: (ok(s.hero_box_end) ? s.hero_box_end : b).map(Number) });
  }
  return out;
}

const RISO = {
  paper: [241, 235, 226], inks: [[0x36, 0x89, 0xab], [0xdc, 0x44, 0xa0], [0xee, 0xde, 0x1e]], // teal, fluorescent pink, yellow (measured)
  angles: [15, 75, 45], reg: [[0, 0], [4, -3], [-3, 4]], // screen angles and the pink / yellow plates' offset from the teal key, px at 1080p
};

// A static halftone threshold map for one screen angle (PNG: R = dot map, G = hole map, 0..255). A cell is `pitch` px wide, rotated by
// `angle`; R = pi d^2 (d: distance to the cell centre, in cells), G = 1 - pi dc^2 (dc: distance to the nearest cell corner).
function makeScreen({ angle, pitch, width, height, dir, name }) {
  const file = path.join(dir, `screen-${name}.png`), th = (angle * Math.PI) / 180;
  const pre = `st(0,X*${r4(Math.cos(th))}+Y*${r4(Math.sin(th))});st(1,Y*${r4(Math.cos(th))}-X*${r4(Math.sin(th))});st(2,mod(mod(ld(0),${r4(pitch)})+${r4(pitch)},${r4(pitch)})/${r4(pitch)}-0.5);st(3,mod(mod(ld(1),${r4(pitch)})+${r4(pitch)},${r4(pitch)})/${r4(pitch)}-0.5);`;
  const dot = `${pre}255*clip(PI*(ld(2)*ld(2)+ld(3)*ld(3)),0,1)`;
  const hole = `${pre}255*clip(1-PI*(pow(0.5-abs(ld(2)),2)+pow(0.5-abs(ld(3)),2)),0,1)`;
  ff(["-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:d=1`, "-vf", `format=gbrp,geq=r='${dot}':g='${hole}':b='0'`, "-frames:v", "1", "-pix_fmt", "rgb24", file], `riso screen ${name}`);
  return file;
}

// CRT: scanlines (dark row every `pitch` px) and a phosphor triad (every third column brighter per channel); the multiply darkens, so a gain follows.
function makeCrtMask({ width, height, amount, s, dir }) {
  const file = path.join(dir, "crt.png"), pitch = Math.max(3, Math.round(4 * s)), tw = Math.max(1, Math.round(s));
  const row = `(1-${r4(amount * 0.6)}*(0.5+0.5*cos(2*PI*Y/${pitch})))`;
  const tri = (k) => `if(eq(mod(floor(X/${tw}),3),${k}),1,${r4(1 - amount * 0.3)})`;
  ff(["-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:d=1`, "-vf", `format=gbrp,geq=r='255*${row}*${tri(0)}':g='255*${row}*${tri(1)}':b='255*${row}*${tri(2)}'`, "-frames:v", "1", "-pix_fmt", "rgb24", file], "crt mask");
  return { file, gain: r4(1 / ((1 - amount * 0.3) * (1 - amount * 0.2))) };
}
// LED wall: square cells (pitch px at 1080p) with a dark gutter; about 57% of the area is lit, so a 1.75 gain follows.
function makeLedMask({ width, height, pitch, dir }) {
  const file = path.join(dir, "led.png"), P = Math.max(3, Math.round(pitch));
  const m = `(1-0.94*clip((max(abs(mod(X,${P})/${P}-0.5),abs(mod(Y,${P})/${P}-0.5))-0.32)/0.1,0,1))`;
  ff(["-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:d=1`, "-vf", `format=gbrp,geq=r='255*${m}':g='255*${m}':b='255*${m}'`, "-frames:v", "1", "-pix_fmt", "rgb24", file], "led mask");
  return { file, gain: 1.75 };
}

// Filter graph for the grade. `src` and `dst` are pad labels; yuv420p bt709 limited in and out.
// Order: look (LUT) -> lens -> chromatic aberration -> focus-follow -> halation/bloom -> riso print -> CRT / LED -> vignette -> grain,
// grain last so it sits on top. extraInputs: {mask, crt, led, scr: [3 labels]} (the extra -i streams, see prepareExtras).
function gradeGraph({ src, dst, width, height, fps, fpsRat, dur, g, extraInputs }) {
  const s = height / 1080;
  const parts = [];
  const f = (x) => (Math.round(x * 1e4) / 1e4).toString();
  let cur = "base";
  parts.push(`[${src}]scale=in_color_matrix=bt709:in_range=limited:flags=accurate_rnd+full_chroma_int,format=gbrp,setsar=1[${cur}]`);
  let k = 0;
  const next = () => `s${k++}`;
  // a stage over the whole film, or only inside windows (the original and the processed copy overlaid with enable)
  const stage = (inL, wins, build) => {
    const o = next();
    if (!wins || !wins.length) { build(inL, o); return o; }
    const a = next(), b = next(), p = next();
    parts.push(`[${inL}]split=2[${a}][${b}]`);
    build(b, p);
    parts.push(`[${a}][${p}]overlay=format=gbrp:enable='${enableOf(wins)}'[${o}]`);
    return o;
  };

  if (g.lut) {
    const n = next();
    parts.push(`[${cur}]lut3d=file='${g.lut.replace(/'/g, "\\'")}':interp=tetrahedral[${n}]`);
    cur = n;
  }

  // lens distortion (ffmpeg lenscorrection: k1 > 0 barrel, < 0 pincushion). A barrel pulls the corners in, so it is followed by a zoom of
  // 1 + k1 (measured: black corners are gone at that zoom); a pincushion samples inside the frame and needs none.
  if (g.lens) {
    cur = stage(cur, [], (i, o) => parts.push(`[${i}]lenscorrection=k1=${f(g.lens)}:k2=0:fc=black${g.lens > 0 ? `,scale=iw*${f(1 + g.lens * 1.05)}:ih*${f(1 + g.lens * 1.05)}:flags=bicubic,crop=${width}:${height}` : ""},setsar=1,format=gbrp[${o}]`));
  }

  // chromatic aberration: the channels magnified by different amounts about the centre (R most, B none), so the split grows toward the
  // corners like a real lens. g.ca = px of R/B split at the corner at 1080p.
  if (g.ca > 0) {
    cur = stage(cur, g.caAt, (i, o) => {
      const e = (g.ca * s) / Math.hypot(width, height), even = (v) => Math.ceil(v / 2) * 2;
      const [pr, pg, pb, r2, g2, mm] = [next(), next(), next(), next(), next(), next()];
      parts.push(
        `[${i}]extractplanes=r+g+b[${pr}][${pg}][${pb}]`,
        `[${pr}]scale=${even(width * (1 + 2 * e))}:${even(height * (1 + 2 * e))}:flags=bicubic,crop=${width}:${height},setsar=1[${r2}]`,
        `[${pg}]scale=${even(width * (1 + e))}:${even(height * (1 + e))}:flags=bicubic,crop=${width}:${height},setsar=1[${g2}]`,
        `[${g2}][${pb}][${r2}]mergeplanes=0x001020:gbrp[${o}]`
      );
    });
  }

  // focus-follow: a soft field outside the hero's box. The mask is built at a quarter size from the score's boxes (time-driven, geq's T),
  // 0 inside an ellipse around the box, a smoothstep to 1 beyond it; the film is blurred once and merged through the mask.
  if (g.focus && g.focus.length) {
    const w4 = Math.ceil(width / 4), h4 = Math.ceil(height / 4);
    const scene = (b) => {
      const lerp = (i) => `(${f(b.from[i])}+(${f(b.to[i] - b.from[i])})*clip((T-${f(b.a)})/${f(b.z - b.a)},0,1))`;
      const cx = `((${lerp(0)}+${lerp(2)}/2)*${w4})`, cy = `((${lerp(1)}+${lerp(3)}/2)*${h4})`;
      const rx = `(max(${lerp(2)},0.08)*0.575*${w4})`, ry = `(max(${lerp(3)},0.08)*0.575*${h4})`;
      const m = `clip((hypot((X-${cx})/${rx},(Y-${cy})/${ry})-1)/0.9,0,1)`;
      return `${m}*${m}*(3-2*${m})`;
    };
    const expr = g.focus.reduceRight((rest, b) => `if(between(T,${f(b.a)},${f(b.z)}),${scene(b)},${rest})`, "0");
    const [a, b, bb, m, o] = [next(), next(), next(), next(), next()];
    parts.push(
      `[${cur}]split=2[${a}][${b}]`,
      `[${b}]gblur=sigma=${f(g.focusBlur * s)}[${bb}]`,
      `color=c=black:s=${w4}x${h4}:r=${fpsRat}:d=${f(dur)},format=gray,geq=lum='255*(${expr})',scale=${width}:${height}:flags=bicubic,format=gbrp[${m}]`,
      `[${a}][${bb}][${m}]maskedmerge[${o}]`
    );
    cur = o;
  }

  // highlight glow: threshold luma, blur at two radii, tint, add. Pixels away from highlights get exactly 0.
  const glow = (name, { thr, sigmas, tint, amount }) => {
    const a = next(), b = next(), c = next(), d = next(), e = next(), o = next();
    const lo = Math.round(thr * 255);
    const slope = f(255 / Math.max(1, 255 - lo));
    parts.push(`[${cur}]split=2[${a}][${b}]`);
    const sig = sigmas.map((x) => f(x * s));
    parts.push(
      `[${b}]format=gray,lut=y='clip((val-${lo})*${slope},0,255)',split=2[${c}][${d}]`,
      `[${c}]gblur=sigma=${sig[0]}[${c}g]`,
      `[${d}]gblur=sigma=${sig[1]}[${d}g]`,
      `[${c}g][${d}g]blend=all_expr='(A+B)/2',format=gbrp,colorchannelmixer=rr=${tint[0]}:gg=${tint[1]}:bb=${tint[2]}[${e}]`,
      `[${a}][${e}]blend=all_mode=addition:all_opacity=${f(amount)}[${o}]`
    );
    cur = o;
  };
  if (g.halation > 0) glow("halation", { thr: 0.8, sigmas: [5, 22], tint: [1, 0.18, 0.04], amount: g.halation * 1.6 });
  if (g.bloom > 0) glow("bloom", { thr: 0.65, sigmas: [14, 48], tint: [1, 1, 1], amount: g.bloom * 1.2 });

  // film-wide risograph print: the picture is separated into three plate tones (teal <- 1-R, pink <- 1-G, yellow <- 1-B, the nearest
  // CMY to the three inks), each screened at its own angle against a static threshold map (a round dot to 50%, paper holes at the cell
  // corners above), nudged off register (the 3 variants step every 2 frames, so it shimmers without crawling), robbed of a few specks
  // (dropout), printed as the ink-over-paper ratio in a multiply, and the whole thing on the cream paper. No black, no white ink.
  if (g.print === "riso") {
    const pitch = g.printPitch * s, M = Math.ceil(8 * s) + 1, [fa, fb] = String(fpsRat).split("/");
    const sig = f(pitch * 0.45), halfRat = `${fa}/${2 * Number(fb || 1)}`;
    const pl = [next(), next(), next()], spk = [next(), next(), next()];
    parts.push(`[${cur}]extractplanes=r+g+b[${pl[0]}][${pl[1]}][${pl[2]}]`);
    const sp = `if(lt(random(0),${f(g.printDropout)}),0,255)`;
    parts.push(`color=c=black:s=${Math.ceil(width / 2)}x${Math.ceil(height / 2)}:r=${fpsRat}:d=${f(dur)},format=gbrp,geq=g='${sp}':b='${sp}':r='${sp}',fps=fps=${halfRat},scale=${width}:${height}:flags=neighbor,fps=fps=${fpsRat},format=gbrp,extractplanes=g+b+r[${spk[0]}][${spk[1]}][${spk[2]}]`);
    const layers = [];
    for (let i = 0; i < 3; i++) {
      const [t1, t2, b1, b2, c1, c2, cv, cs, cf, cm, wh, ink, L] = Array.from({ length: 13 }, next);
      const ratio = RISO.inks[i].map((v, c) => Math.round(Math.min(255, (v / RISO.paper[c]) * 255)));
      const hex = "0x" + ratio.map((v) => v.toString(16).padStart(2, "0")).join("");
      const jit = (ph) => `${g.printShimmer}*(mod(floor(n/2)+${ph},3)-1)`;
      parts.push(
        `[${pl[i]}]negate,lut=y='clip(128+(val-128)*${f(g.printContrast)},0,255)',gblur=sigma=${sig},format=gray,split=2[${t1}][${t2}]`,
        `[${extraInputs.scr[i]}]format=gbrp,extractplanes=r+g[${b1}][${b2}]`,
        `[${t1}][${b1}]blend=all_expr='if(lte(A,127.5),if(gte(A,B),255,0),0)':shortest=1[${c1}]`,
        `[${t2}][${b2}]blend=all_expr='if(gt(A,127.5),if(lte(A,B),255,0),0)':shortest=1[${c2}]`,
        `[${c1}][${c2}]blend=all_mode=lighten:shortest=1,gblur=sigma=0.5,pad=iw+${2 * M}:ih+${2 * M}:${M}:${M}:color=black,crop=${width}:${height}:x='${M + Math.round(RISO.reg[i][0] * s)}+${jit(i)}':y='${M + Math.round(RISO.reg[i][1] * s)}+${jit(i + 1)}'[${cs}]`,
        `[${cs}][${spk[i]}]blend=all_mode=darken:shortest=1,format=gbrp[${cm}]`,
        `color=c=white:s=${width}x${height}:r=${fpsRat}:d=${f(dur)},format=gbrp[${wh}]`,
        `color=c=${hex}:s=${width}x${height}:r=${fpsRat}:d=${f(dur)},format=gbrp[${ink}]`,
        `[${wh}][${ink}][${cm}]maskedmerge[${L}]`
      );
      layers.push(L);
    }
    const m1 = next(), m2 = next(), o = next();
    parts.push(
      `[${layers[0]}][${layers[1]}]blend=all_mode=multiply:shortest=1[${m1}]`,
      `[${m1}][${layers[2]}]blend=all_mode=multiply:shortest=1[${m2}]`,
      `[${m2}]lutrgb=r='val*${f(RISO.paper[0] / 255)}':g='val*${f(RISO.paper[1] / 255)}':b='val*${f(RISO.paper[2] / 255)}'[${o}]`
    );
    cur = o;
  }

  // CRT scanlines and phosphor triads, an LED-wall cell grid: a multiply with a static mask, then the gain that brings the mean back
  if (g.crt > 0) cur = stage(cur, g.crtAt, (i, o) => parts.push(`[${i}][${extraInputs.crt.label}]blend=all_mode=multiply:shortest=1,lutrgb=r='clip(val*${extraInputs.crt.gain},0,255)':g='clip(val*${extraInputs.crt.gain},0,255)':b='clip(val*${extraInputs.crt.gain},0,255)'[${o}]`));
  if (g.led > 0) cur = stage(cur, g.ledAt, (i, o) => parts.push(`[${i}][${extraInputs.led.label}]blend=all_mode=multiply:shortest=1,lutrgb=r='clip(val*${extraInputs.led.gain},0,255)':g='clip(val*${extraInputs.led.gain},0,255)':b='clip(val*${extraInputs.led.gain},0,255)'[${o}]`));

  if (g.vignette > 0) {
    const n = next(), m = next();
    parts.push(`[${extraInputs.mask}]format=gbrp[${m}]`);
    parts.push(`[${cur}][${m}]blend=all_mode=multiply:shortest=1[${n}]`);
    cur = n;
  }

  if (g.grain > 0) {
    // Two scales like post.ts: fine per-pixel + coarse 2x2 cells, 0.6/0.4, amplitude * (0.55 + 1.2*l*(1-l)),
    // one monochrome value added to R,G,B, fresh every frame. The noise filter's real mean/std are measured
    // once (calibrateGrain) so the amplitude is exact: target std in levels = 255 * grain * w(l) * 0.208.
    const cal = calibrateGrain(g.seed);
    const unit = ((255 * 0.208) / cal.std) * g.grain;
    const Lb = next(), L = next(), gw = next(), gm = next(), gmr = next(), n = next();
    parts.push(
      `${grainSrc(width, height, fps, g.seed)}[n1]`,
      `${grainSrc(Math.ceil(width / 2), Math.ceil(height / 2), fps, g.seed + 7)},scale=${width}:${height}:flags=neighbor,format=gray[n2]`,
      `[n1][n2]blend=all_mode=normal:all_opacity=0.4:shortest=1[${gm}]`,
      `[${cur}]split=2[${Lb}][${L}]`,
      `[${L}]format=gray[${gw}]`,
      `[${gm}][${gw}]blend=all_expr='clip(128.5+(A-${f(cal.mean)})*${f(unit)}*(0.55+1.2*(B/255)*(1-B/255)),0,255)':shortest=1,format=gbrp[${gmr}]`,
      `[${Lb}][${gmr}]blend=all_mode=addition128:shortest=1[${n}]`
    );
    cur = n;
  }
  if (process.env.FINISH_DEBUG) process.stderr.write(parts.join(";\n") + "\n");
  parts.push(`[${cur}]scale=out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p[${dst}]`);
  return parts.join(";");
}

function makeMask({ width, height, vignette, dir }) {
  const file = path.join(dir, "vignette.png");
  const t = `clip((hypot(X/W-0.5,(Y/H-0.5)*0.8)-0.95)/(-0.7),0,1)`;
  const v = `(1-${vignette}+${vignette}*(${t})*(${t})*(3-2*(${t})))`;
  ff(["-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:d=1`, "-vf", `format=gray,geq=lum='255*${v}',format=gray`, "-frames:v", "1", file], "vignette mask");
  return file;
}

function gradeOpts() {
  const print = String(args.print || "").toLowerCase() === "riso" ? "riso" : null;
  // a print is the whole look: no halation, vignette or grain filter over it unless asked for ("keep the paper flat")
  const g = {
    grain: num(args.grain, print ? 0 : 0.03),
    halation: num(args.halation, print ? 0 : 0.2),
    vignette: num(args.vignette, print ? 0 : 0.2),
    bloom: num(args.bloom, 0),
    lut: args.lut && args.lut !== true ? path.resolve(String(args.lut)) : null,
    seed: Math.round(num(args.seed, 1)),
    lens: clamp(num(args.lens, 0), -0.3, 0.3),
    ca: Math.max(0, num(args.ca, 0)), caAt: parseWindows(args["ca-at"]),
    focus: [], focusBlur: num(args["focus-blur"], 7),
    crt: clamp(num(args.crt, 0), 0, 1), crtAt: parseWindows(args["crt-at"]),
    led: Math.max(0, num(args.led, 0)), ledAt: parseWindows(args["led-at"]),
    print, printPitch: num(args["print-pitch"], 10.8), printShimmer: Math.round(num(args["print-shimmer"], 1)), printDropout: clamp(num(args["print-dropout"], 0.006), 0, 0.05), printContrast: num(args["print-contrast"], 1),
    notes: [],
  };
  const sc = scoreDoc();
  // chromatic aberration is the budgeted "chromatic-split" hero effect: with no windows it takes the scenes of the score's budget entries;
  // with neither it runs film-wide, which is the uniform tell, and says so
  if (g.ca > 0 && !g.caAt.length) {
    const wins = readBudget(sc || {}).filter((e) => e.effect === "chromatic-split").map((e) => sceneSpan(sc, e.scene)).filter(Boolean);
    if (wins.length) { g.caAt = wins; g.notes.push(`chromatic aberration only in the score's budgeted scene(s): ${wins.map((w) => w.join("-")).join(", ")} s`); }
    else g.notes.push("WARNING: chromatic aberration film-wide is the uniform tell; give it --ca-at windows or a chromatic-split entry in the score's budget (hero moments only)");
  }
  if (g.crt > 0 && !g.crtAt.length) g.notes.push("CRT layer film-wide: right for a film set on a screen, otherwise give it --crt-at windows");
  if (g.led > 0 && !g.ledAt.length) g.notes.push("LED layer film-wide: right for a film set on an LED wall, otherwise give it --led-at windows");
  if (args["focus-follow"]) {
    g.focus = heroBoxes(sc);
    g.notes.push(g.focus.length ? `focus follows the score's hero_box in ${g.focus.length} scene(s)` : "WARNING: --focus-follow found no scenes[].hero_box in the score (give --run/--score; scenes without a box stay sharp): no focus layer");
  } else if (args.focus && args.focus !== true) {
    const b = String(args.focus).split(",").map(Number);
    if (b.length === 4 && b.every(Number.isFinite)) g.focus = [{ id: "film", a: 0, z: 1e6, from: b, to: b }];
    else g.notes.push("WARNING: --focus wants x,y,w,h as 0..1 of the frame: no focus layer");
  }
  if (g.print && (args.lut || g.bloom > 0)) g.notes.push("print riso: a LUT or bloom under a three-ink print is mostly lost; the plates re-separate the colour");
  return g;
}

// The extra -i inputs a grade needs (static masks as looped PNGs), the labels their streams get from `base`, the first free input index.
function prepareExtras({ g, width, height, fps, dir, base }) {
  const s = height / 1080, args2 = [], x = { scr: [] };
  let idx = base;
  const add = (file) => { args2.push("-loop", "1", "-framerate", String(fps), "-i", file); return `${idx++}:v`; };
  if (g.vignette > 0) x.mask = add(makeMask({ width, height, vignette: g.vignette, dir }));
  if (g.crt > 0) { const m = makeCrtMask({ width, height, amount: g.crt, s, dir }); x.crt = { label: add(m.file), gain: m.gain }; }
  if (g.led > 0) { const m = makeLedMask({ width, height, pitch: g.led * s, dir }); x.led = { label: add(m.file), gain: m.gain }; }
  if (g.print === "riso") RISO.angles.forEach((a, i) => x.scr.push(add(makeScreen({ angle: a, pitch: g.printPitch * s, width, height, dir, name: String(a) }))));
  // sources made with a duration (the print's plates and specks, the focus mask) end with the film; -t keeps the output from running on
  x.limit = g.print === "riso" || (g.focus && g.focus.length) ? ["-t", String(r4(g.dur || 0) || 1e6)] : [];
  return { inputs: args2, x };
}

const ENCODE = (quality) => (quality === "draft"
  ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
  : ["-c:v", "libx264", "-preset", "slow", "-crf", String(num(args.crf, 18))]);
const TAGS = ["-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-movflags", "+faststart"];

// Mean RGB of a rectangle averaged over up to 12 frames.
function meanRGB(file, rect) {
  const [x, y, w, h] = rect;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "12", "-vf", `crop=${w}:${h}:${x}:${y},scale=1:1:flags=area,scale=in_color_matrix=bt709:in_range=limited:out_range=full,format=rgb24`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
  const b = r.stdout;
  const n = Math.floor(b.length / 3);
  if (!n) return null;
  const m = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) m[c] += b[i * 3 + c];
  return m.map((v) => Math.round((v / n) * 100) / 100);
}

function runGrade({ input, output, g, quality, tmpDir, audioFrom }) {
  const p = probe(input);
  g.dur = p.duration;
  const { inputs: extra, x } = prepareExtras({ g, width: p.width, height: p.height, fps: p.fps, dir: tmpDir, base: 1 });
  const graph = gradeGraph({ src: "0:v", dst: "out", width: p.width, height: p.height, fps: p.fps, fpsRat: p.fpsRat, dur: p.duration, g, extraInputs: x });
  const t0 = Date.now();
  ff(["-i", input, ...extra, "-filter_complex", graph, "-map", "[out]", "-map", "0:a?", ...x.limit, ...ENCODE(quality), ...TAGS, "-c:a", "copy", output], "grade");
  return { p, seconds: (Date.now() - t0) / 1000 };
}

// ---------------------------------------------------------------- commands

const DRAFT = !!args.draft;
if (DRAFT && (args.samples === undefined || args.samples === true)) args.samples = "4";
function resolveBlurSettings() {
  const fps = num(args.fps, 30);
  const shutter = clamp(num(args.shutter, 0.5), 0.05, 1);
  const quality = DRAFT || args.quality === "draft" ? "draft" : "delivery";
  const cap = Math.max(1, Math.floor(MAX_RENDER_FPS / fps));
  return { fps, shutter, quality, cap };
}

function blurRender(tmpDir) {
  const project = path.resolve(String(args.project || ""));
  if (!args.project || !fs.existsSync(path.join(project, "index.html"))) die("--project <dir with index.html> is required");
  const { fps, shutter, quality, cap } = resolveBlurSettings();
  const notes = [];
  // one blur grammar per film: a shutter over a smear / stepped / crisp-steps look doubles the blur (or turns each step into a dissolve)
  const gram = declaredGrammar(project);
  if (gram && /smear|stepp|crisp|steps|twos/.test(gram.value)) {
    const msg = `${gram.from} declares blur_grammar "${gram.value}": a film has ONE blur grammar, and the shutter would average over it (a smear gets blurred twice, steps turn into dissolves)`;
    if (DRAFT || args["shutter-over-smear"]) notes.push(`WARNING: ${msg}${args["shutter-over-smear"] ? " (--shutter-over-smear: going ahead)" : " (a draft: not refused)"}`);
    else die(`${msg}. Run \`finish.mjs grade\` on the plain render instead, change blur_grammar to "shutter" in the score if the shutter is the film's blur, or pass --shutter-over-smear.`);
  }
  const slot = args["no-slot"] ? null : acquireSlotSync({ label: `finish ${path.basename(project)}` });
  if (slot && slot.notes.length) notes.push(...slot.notes);
  if (slot && slot.waited_s > 1) notes.push(`waited ${slot.waited_s} s for a render slot`);
  let N, motion = null, preSeconds = 0;
  if (!args.samples || args.samples === "auto") {
    const pre = path.join(tmpDir, "pre.mp4");
    const t0 = Date.now();
    const argv = ["--yes", "hyperframes", "render", project, "-o", pre, "--fps", String(fps), "--quiet", "--quality", "draft"];
    if (args.composition) argv.push("-c", String(args.composition));
    const r = sh("npx", argv, { cwd: project });
    preSeconds = (Date.now() - t0) / 1000;
    if (r.status === 0 && fs.existsSync(pre)) {
      motion = measureMotion(pre);
      N = autoSamples(motion, cap);
    } else { N = cap; notes.push("auto: draft pre-pass failed, using the cap"); noteDowngrade({ run: args.run, what: "the measured motion-blur sample count", instead: `the cap (${cap} samples)`, why: "the draft pre-pass failed", impact: "the blur is more expensive than it needs to be, not weaker" }); }
  } else N = Math.round(num(args.samples, 8));
  // N sub-frames per frame = base (<= 240 fps render) x K phase-shifted passes
  const base = cap, K = Math.max(1, Math.ceil(N / base));
  if (K > MAX_PASSES) { notes.push(`samples ${N} needs ${K} passes; using ${MAX_PASSES}`); }
  const passes = Math.min(K, MAX_PASSES);
  const Nb = N <= cap ? N : base;
  N = Nb * passes;
  const R = fps * Nb;
  const files = [];
  const cam = usesCamera(project);
  let renderSeconds = 0;
  for (let k = 0; k < passes; k++) {
    const f = path.join(tmpDir, `over${k}.mp4`);
    // pass 0 goes through the same shim (delta 0) when the project uses RasanCamera, to switch its trails off
    const proj = k === 0 && !cam ? project : shiftedProject(project, k / (R * passes), tmpDir, cam ? 2 / (Nb * passes) : 0);
    renderSeconds += renderOversampled({ project: proj, composition: args.composition && String(args.composition), fps, N: Nb, quality, workers: args.workers, outFile: f });
    files.push(f);
  }
  if (slot) slot.release(); // the renders are done: the mix below is ffmpeg only
  if (cam) notes.push(`RasanCamera trails at ${Math.round(200 / N)}% (they fill the steps between the ${N} samples)`);
  if (DRAFT) notes.push("draft blur: " + N + " samples, draft quality, no grade");
  const { M, effShutter, chain, space } = blurChain({ N, shutter, fps, linear: String(args["blur-space"] || "linear") !== "gamma" });
  // interleave: pass k frame i is sub-frame i*K + k at time (i*K+k) / (R*K)
  const pre = passes === 1 ? "[0:v]" : files.map((_, k) => `[${k}:v]setpts=(N*${passes}+${k})/(${R * passes}*TB)[p${k}]`).join(";") + ";" + files.map((_, k) => `[p${k}]`).join("") + `interleave=nb_inputs=${passes},`;
  const ranges = sharpRangesOf(project, args);
  if (ranges.length) notes.push(`sharp (not blurred): ${ranges.map((r) => `${r[2]} ${r[0]}-${r[1]}s`).join(", ")}`);
  // cut-aware: a frame whose shutter window straddles a hard cut keeps its own (frame-time) side
  let cutRanges = [];
  if (M > 0 && !args["no-cut-aware"]) {
    const cuts = detectCuts(files[0]);
    cutRanges = cutFrames(cuts, { N, M, K: passes, fps });
    ranges.push(...cutRanges);
    if (cutRanges.length) notes.push(`cut-aware: ${cuts.length} hard cut(s) seen; ${cutRanges.length} frame(s) whose shutter window crossed one are laid from their own centre sub-frame (no blur from the other shot)`);
  }
  return { over: files[0], files, passes, sharp: ranges.filter((r) => !cutRanges.includes(r)), cuts: cutRanges.length, graphIn: graphWithSharp(passes === 1 ? "[0:v]" : pre, chain, { N, fps, ranges }), fps, N, M, effShutter, space, chain, renderSeconds, preSeconds, motion, notes, quality };
}

// any .html/.js in the project (shallow: index, compositions, assets) that calls RasanCamera
function usesCamera(project) {
  const hit = (d, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return false; }
    for (const e of ents) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "renders" || e.name === "rasan-camera") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4 && hit(p, depth + 1)) return true; }
      else if (/\.(html?|js)$/i.test(e.name) && /\bRasanCamera\b/.test(fs.readFileSync(p, "utf8"))) return true;
    }
    return false;
  };
  return hit(project, 0);
}

function report(extra) {
  process.stdout.write(JSON.stringify(extra, null, 2) + "\n");
}

const keepTmp = !!args.keep;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-finish-"));
const cleanup = () => { if (!keepTmp) fs.rmSync(tmpDir, { recursive: true, force: true }); };

if (cmd === "blur" || cmd === "all") {
  if (!args.out) die("--out <mp4> is required");
  const out = path.resolve(String(args.out));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const b = blurRender(tmpDir);
  const srcInfo = probe(b.over);
  const expectFrames = Math.round(srcInfo.duration * b.fps);
  const t0 = Date.now();
  let result;
  if (cmd === "blur" || DRAFT) {
    ff([...b.files.flatMap((f) => ["-i", f]), "-filter_complex", `${b.graphIn},fps=${b.fps}[out]`, "-map", "[out]", "-map", "0:a?", ...ENCODE(b.quality), ...TAGS, "-c:a", "copy", out], "blur");
    result = {};
  } else {
    const g = gradeOpts();
    const o = probe(b.over);
    g.dur = srcInfo.duration;
    const { inputs: extra, x } = prepareExtras({ g, width: o.width, height: o.height, fps: b.fps, dir: tmpDir, base: b.files.length });
    const graph = `${b.graphIn},fps=${b.fps}[blurred];` + gradeGraph({ src: "blurred", dst: "out", width: o.width, height: o.height, fps: b.fps, fpsRat: `${b.fps}/1`, dur: srcInfo.duration, g, extraInputs: x });
    ff([...b.files.flatMap((f) => ["-i", f]), ...extra, "-filter_complex", graph, "-map", "[out]", "-map", "0:a?", ...x.limit, ...ENCODE(b.quality), ...TAGS, "-c:a", "copy", out], "blur+grade");
    result = { grade: g };
  }
  const mixSeconds = (Date.now() - t0) / 1000;
  const o = probe(out);
  report({
    ok: true, command: cmd, draft: DRAFT || undefined, out, fps: b.fps, samples: b.N,
    sharp: b.sharp && b.sharp.length ? b.sharp.map((r) => ({ from_s: r[0], to_s: r[1], why: r[2] })) : undefined,
    window: { subframes: b.M, shutter_requested: clamp(num(args.shutter, 0.5), 0.05, 1), shutter_effective: b.effShutter, taps: b.M ? b.M + 1 : 1, space: b.space, cut_frames_sharp: b.cuts, note: "centred on each frame time; end taps half weight; averaged in " + (b.space || "gamma") + " light" },
    frames: { expected: expectFrames, got: o.frames }, audio: o.hasAudio,
    auto: b.motion ? { motion: b.motion, pre_pass_seconds: b.preSeconds } : undefined,
    seconds: { render_oversampled: b.renderSeconds, mix_and_encode: mixSeconds, pre_pass: b.preSeconds, total: b.renderSeconds + mixSeconds + b.preSeconds },
    size_kb: fmtSize(out), notes: [...b.notes, ...(result.grade ? result.grade.notes : [])], credits: result.grade && result.grade.print ? [CREDIT_RISO] : undefined, ...result,
  });
  cleanup();
} else if (cmd === "grade") {
  if (!args.in || !args.out) die("--in <mp4> and --out <mp4> are required");
  const input = path.resolve(String(args.in)), output = path.resolve(String(args.out));
  if (!fs.existsSync(input)) die(`no such file: ${input}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const g = gradeOpts();
  const { p, seconds } = runGrade({ input, output, g, quality: args.quality === "draft" ? "draft" : "delivery", tmpDir });
  let probeReport;
  if (args.probe && args.probe !== true) {
    const rect = String(args.probe).split(",").map(Number);
    const a = meanRGB(input, rect), c = meanRGB(output, rect);
    probeReport = { rect, before: a, after: c, delta: a && c ? c.map((v, i) => Math.round((v - a[i]) * 100) / 100) : null };
  }
  report({ ok: true, command: "grade", out: output, grade: g, notes: g.notes.length ? g.notes : undefined, credits: g.print ? [CREDIT_RISO] : undefined, seconds, size_kb: fmtSize(output), frames: probe(output).frames, input_frames: p.frames, probe: probeReport });
  cleanup();
} else if (cmd === "patch-test") {
  // Flat brand-colour patches on mid grey: centre patches and an off-centre patch, before/after the grade.
  const g = gradeOpts();
  const W = 1920, H = 1080;
  const patches = [
    { name: "blue #3a6ea5", c: "0x3a6ea5", x: 910, y: 490 },
    { name: "red #c8392b", c: "0xc8392b", x: 700, y: 490 },
    { name: "green #3f9a5a", c: "0x3f9a5a", x: 1120, y: 490 },
    { name: "blue off-centre", c: "0x3a6ea5", x: 140, y: 120 },
  ];
  const draws = patches.map((p) => `drawbox=x=${p.x}:y=${p.y}:w=100:h=100:color=${p.c}:t=fill`).join(",");
  const src = path.join(tmpDir, "patches.mp4");
  ff(["-f", "lavfi", "-i", `color=c=0x2a2a2e:s=${W}x${H}:r=30:d=2`, "-vf", `${draws},scale=out_color_matrix=bt709:out_range=limited,format=yuv420p`, ...ENCODE("draft"), ...TAGS, src], "patch source");
  const dst = path.join(tmpDir, "patches-graded.mp4");
  runGrade({ input: src, output: dst, g, quality: "draft", tmpDir });
  const rows = patches.map((p) => {
    const rect = [p.x + 20, p.y + 20, 60, 60];
    const a = meanRGB(src, rect), c = meanRGB(dst, rect);
    return { patch: p.name, before: a, after: c, delta: c.map((v, i) => Math.round((v - a[i]) * 100) / 100) };
  });
  report({ ok: true, command: "patch-test", grade: g, rows, note: "mean RGB over 60x60 inside each patch, 12 frames; grain is zero-mean so its mean delta is ~0, vignette only moves the off-centre patch" });
  cleanup();
} else {
  die("usage: finish.mjs blur|grade|all|patch-test (see the header of this file)");
}
