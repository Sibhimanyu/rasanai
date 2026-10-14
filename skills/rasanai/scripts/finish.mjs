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
//   node finish.mjs all   --project <dir> --out <mp4> [blur options] [grade options]
//   --draft (blur or all): the cheap draft blur for drafts and review strips: 4 samples in one 120 fps pass, draft
//                         quality, no auto pre-pass, no grade (all --draft = blur --draft). Hero moves show their smear
//                         in the draft and in strips cut from it. Override the count with --samples.
//   Projects that use RasanCamera render with its speed trails scaled to the gap between sub-frames
//   (window.RASAN_CAMERA_TRAILS = 2/samples): the shutter makes the smear, the trail only fills the steps between samples.
//   node finish.mjs patch-test [grade options]     (brand-colour drift of the grade on flat patches)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, die } from "./lib/common.mjs";
import { sharpRanges as sharpRangesOf, graphWithSharp } from "./lib/sharp.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";

const args = parseArgs();
const cmd = args._[0];
const MAX_RENDER_FPS = 240; // hyperframes render accepts 1..240
const MAX_PASSES = 4; // phase-shifted passes: up to 4 x 240 sub-frames per second

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
    width: v.width, height: v.height, fps: a / (b || 1),
    duration: Number(j.format.duration), frames: Number(v.nb_frames) || null,
    hasAudio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

// ---------------------------------------------------------------- blur

// Sub-frames are point samples at k / (fps*N). Output frame n is centred on t = n / fps, i.e. sub-frame
// index n*N, and averages the window [n*N - M/2, n*N + M/2] sub-frames (shutter = M/N of a frame). M is
// even so the centre is a sub-frame; the two end taps get half weight, which makes the window exactly
// M sub-frame intervals wide (a true box filter of the sub-frame signal, symmetric about the frame time).
function blurChain({ N, shutter, fps }) {
  const M = N <= 1 ? 0 : Math.max(2, 2 * Math.round((shutter * N) / 2));
  if (M === 0) return { M, effShutter: 0, chain: `setpts=N/(${fps}*TB)` };
  const P = M / 2;
  const w = Array.from({ length: M + 1 }, (_, i) => (i === 0 || i === M ? 0.5 : 1)).join(" ");
  // pad P clones each side so frame 0 and the last frame have full windows; tmix output i averages
  // padded inputs i-M..i, i.e. original sub-frames centred on i-2P; the first full window is i = M.
  const chain = [
    `tpad=start=${P}:start_mode=clone:stop=${P}:stop_mode=clone`,
    `tmix=frames=${M + 1}:weights='${w}'`,
    `trim=start_frame=${M}`,
    `setpts=PTS-STARTPTS`,
    `select='not(mod(n,${N}))'`,
    `setpts=N/(${fps}*TB)`,
  ].join(",");
  return { M, effShutter: M / N, chain };
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

// Filter graph for the grade. `src` and `dst` are pad labels; yuv420p bt709 limited in and out.
// Order follows post.ts: look (LUT) -> halation/bloom -> vignette -> grain, grain last so it sits on top.
function gradeGraph({ src, dst, width, height, fps, g, extraInputs }) {
  const s = height / 1080;
  const parts = [];
  const f = (x) => (Math.round(x * 1e4) / 1e4).toString();
  let cur = "base";
  parts.push(`[${src}]scale=in_color_matrix=bt709:in_range=limited:flags=accurate_rnd+full_chroma_int,format=gbrp[${cur}]`);
  let k = 0;
  const next = () => `s${k++}`;

  if (g.lut) {
    const n = next();
    parts.push(`[${cur}]lut3d=file='${g.lut.replace(/'/g, "\\'")}':interp=tetrahedral[${n}]`);
    cur = n;
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
  return {
    grain: num(args.grain, 0.03),
    halation: num(args.halation, 0.2),
    vignette: num(args.vignette, 0.2),
    bloom: num(args.bloom, 0),
    lut: args.lut && args.lut !== true ? path.resolve(String(args.lut)) : null,
    seed: Math.round(num(args.seed, 1)),
  };
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
  const mask = g.vignette > 0 ? makeMask({ width: p.width, height: p.height, vignette: g.vignette, dir: tmpDir }) : null;
  const graph = gradeGraph({ src: "0:v", dst: "out", width: p.width, height: p.height, fps: p.fps, g, extraInputs: { mask: "1:v" } });
  const inputs = ["-i", input];
  if (mask) inputs.push("-loop", "1", "-framerate", String(p.fps), "-i", mask);
  const t0 = Date.now();
  ff([...inputs, "-filter_complex", graph, "-map", "[out]", "-map", "0:a?", ...ENCODE(quality), ...TAGS, "-c:a", "copy", output], "grade");
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
  if (cam) notes.push(`RasanCamera trails at ${Math.round(200 / N)}% (they fill the steps between the ${N} samples)`);
  if (DRAFT) notes.push("draft blur: " + N + " samples, draft quality, no grade");
  const { M, effShutter, chain } = blurChain({ N, shutter, fps });
  // interleave: pass k frame i is sub-frame i*K + k at time (i*K+k) / (R*K)
  const pre = passes === 1 ? "[0:v]" : files.map((_, k) => `[${k}:v]setpts=(N*${passes}+${k})/(${R * passes}*TB)[p${k}]`).join(";") + ";" + files.map((_, k) => `[p${k}]`).join("") + `interleave=nb_inputs=${passes},`;
  const ranges = sharpRangesOf(project, args);
  if (ranges.length) notes.push(`sharp (not blurred): ${ranges.map((r) => `${r[2]} ${r[0]}-${r[1]}s`).join(", ")}`);
    return { over: files[0], files, passes, sharp: ranges, graphIn: graphWithSharp(passes === 1 ? "[0:v]" : pre, chain, { N, fps, ranges }), fps, N, M, effShutter, chain, renderSeconds, preSeconds, motion, notes, quality };
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
    const mask = g.vignette > 0 ? makeMask({ width: o.width, height: o.height, vignette: g.vignette, dir: tmpDir }) : null;
    const graph = `${b.graphIn},fps=${b.fps}[blurred];` + gradeGraph({ src: "blurred", dst: "out", width: o.width, height: o.height, fps: b.fps, g, extraInputs: { mask: `${b.files.length}:v` } });
    const inputs = b.files.flatMap((f) => ["-i", f]);
    if (mask) inputs.push("-loop", "1", "-framerate", String(b.fps), "-i", mask);
    ff([...inputs, "-filter_complex", graph.replace(/\[1:v\]format=gbrp/, `[${b.files.length}:v]format=gbrp`), "-map", "[out]", "-map", "0:a?", ...ENCODE(b.quality), ...TAGS, "-c:a", "copy", out], "blur+grade");
    result = { grade: g };
  }
  const mixSeconds = (Date.now() - t0) / 1000;
  const o = probe(out);
  report({
    ok: true, command: cmd, draft: DRAFT || undefined, out, fps: b.fps, samples: b.N,
    sharp: b.sharp && b.sharp.length ? b.sharp.map((r) => ({ from_s: r[0], to_s: r[1], why: r[2] })) : undefined,
    window: { subframes: b.M, shutter_requested: clamp(num(args.shutter, 0.5), 0.05, 1), shutter_effective: b.effShutter, taps: b.M ? b.M + 1 : 1, note: "centred on each frame time; end taps half weight" },
    frames: { expected: expectFrames, got: o.frames }, audio: o.hasAudio,
    auto: b.motion ? { motion: b.motion, pre_pass_seconds: b.preSeconds } : undefined,
    seconds: { render_oversampled: b.renderSeconds, mix_and_encode: mixSeconds, pre_pass: b.preSeconds, total: b.renderSeconds + mixSeconds + b.preSeconds },
    size_kb: fmtSize(out), notes: b.notes, ...result,
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
  report({ ok: true, command: "grade", out: output, grade: g, seconds, size_kb: fmtSize(output), frames: probe(output).frames, input_frames: p.frames, probe: probeReport });
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
