#!/usr/bin/env node
// Fix-round regression diff: after a fix round, everything the round did NOT touch must be unchanged.
//
//   node fixcheck.mjs --before <old.mp4> --after <new.mp4> --touched 12.0-15.5[,30-32] [--margin 0.1] [--tol 0.5]
//                     [--out <dir>] [--max-diffs 12] [--strict]
//
// --touched   the time windows (seconds) the fixes were allowed to change; a frame inside one (plus --margin s each side, default 0.1) is not judged.
// How: every frame of both renders is hashed (ffmpeg framemd5 over the decoded frames); a frame outside the windows whose hash differs is then measured
// (mean absolute luma difference, ffmpeg blend=difference + signalstats). A difference at or under --tol levels (0-255, default 0.5) is re-encode
// noise (x264 spends bits differently once a nearby frame changes) and is only counted; a bigger one is a regression: the frame number, time and size of
// the change are listed and a diff PNG (the difference x8) is written for the worst --max-diffs of them to <out> (default <after>.fixcheck/).
// The audio of both is hashed too and reported (a fix round that did not ask for sound changes should leave it byte-identical).
// A WARNING, not a gate: exit 0 with verdict "regression" (exit 2 with --strict); exit 1 only when the files cannot be read.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, die } from "./lib/common.mjs";

const args = parseArgs();
const sh = (bin, argv, o = {}) => spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...o });
const r2 = (x) => Math.round(x * 100) / 100;
const need = (k) => (args[k] && args[k] !== true ? path.resolve(String(args[k])) : die(`--${k} <file> is required (usage: fixcheck.mjs --before old.mp4 --after new.mp4 --touched a-b[,c-d])`));
const before = need("before"), after = need("after");
for (const f of [before, after]) if (!fs.existsSync(f)) die(`no such file: ${f}`);
const margin = Number.isFinite(Number(args.margin)) && args.margin !== true ? Number(args.margin) : 0.1;
const tol = Number.isFinite(Number(args.tol)) && args.tol !== true ? Number(args.tol) : 0.5;
const maxDiffs = Number(args["max-diffs"]) || 12;
const windows = String(args.touched === true || args.touched === undefined ? "" : args.touched).split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const m = x.match(/^([\d.]+)\s*-\s*([\d.]+)$/); return m && Number(m[2]) >= Number(m[1]) ? [Number(m[1]), Number(m[2])] : null; });
if (windows.some((w) => !w)) die('--touched must be seconds windows like "12-15.5" or "12-15.5,30-32"');
if (args.touched === undefined) die('--touched <a-b[,c-d]> is required: the windows the fixes were allowed to change ("0-0" for none)');

function info(f) {
  const r = sh("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames,duration", "-of", "json", f]);
  if (r.status !== 0) die(`ffprobe could not read ${f}`);
  const v = (JSON.parse(r.stdout).streams || [])[0];
  if (!v) die(`${f} has no video stream`);
  const [a, b] = String(v.r_frame_rate).split("/").map(Number);
  return { w: v.width, h: v.height, fps: a / (b || 1), frames: Number(v.nb_frames) || null };
}
const md5s = (f) => {
  const r = sh("ffmpeg", ["-v", "error", "-i", f, "-an", "-f", "framemd5", "-"]);
  if (r.status !== 0) die(`ffmpeg could not decode ${f}`);
  return String(r.stdout).split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split(",").pop().trim());
};
const audioMd5 = (f) => { const r = sh("ffmpeg", ["-v", "error", "-i", f, "-vn", "-f", "md5", "-"]); return r.status === 0 ? (String(r.stdout).match(/MD5=(\w+)/) || [])[1] || null : null; };

const A = info(before), B = info(after);
const notes = [];
if (A.w !== B.w || A.h !== B.h) notes.push(`size changed (${A.w}x${A.h} -> ${B.w}x${B.h}): every frame differs`);
if (Math.abs(A.fps - B.fps) > 0.01) notes.push(`frame rate changed (${r2(A.fps)} -> ${r2(B.fps)}): frames cannot be compared one to one`);
const ha = md5s(before), hb = md5s(after);
if (ha.length !== hb.length) notes.push(`frame count changed (${ha.length} -> ${hb.length}): compared up to the shorter`);
const n = Math.min(ha.length, hb.length), fps = B.fps || A.fps || 30;
const inWindow = (k) => { const t = k / fps; return windows.some(([a, b]) => t >= a - margin - 1e-6 && t <= b + margin + 1e-6); };
const mismatched = [];
for (let k = 0; k < n; k++) if (ha[k] !== hb[k]) mismatched.push(k);
const outside = mismatched.filter((k) => !inWindow(k));
const inside = mismatched.length - outside.length;

// the size of each difference outside the windows
const diffs = new Map();
if (outside.length && A.w === B.w && A.h === B.h) {
  const r = sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", before, "-i", after, "-filter_complex", "[0:v][1:v]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"]);
  [...String(r.stdout).matchAll(/YAVG=([0-9.e+-]+)/g)].forEach((m, k) => diffs.set(k, Number(m[1])));
}
const real = outside.map((k) => ({ frame: k, t: r2(k / fps), mean_diff: diffs.has(k) ? r2(diffs.get(k)) : null })).filter((x) => x.mean_diff === null || x.mean_diff > tol);
const noise = outside.length - real.length;

// diff PNGs for the worst
const outDir = path.resolve(args.out && args.out !== true ? String(args.out) : after + ".fixcheck");
const pngs = [];
if (real.length) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const x of real.slice().sort((a, b) => (b.mean_diff ?? 255) - (a.mean_diff ?? 255)).slice(0, maxDiffs)) {
    const file = path.join(outDir, `diff-f${String(x.frame).padStart(5, "0")}-${x.t}s.png`);
    const amp = "clip(val*8,0,255)";
    const r = sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", before, "-i", after, "-filter_complex", `[0:v][1:v]blend=all_mode=difference,select='eq(n,${x.frame})',lutrgb=r='${amp}':g='${amp}':b='${amp}'`, "-frames:v", "1", file]);
    if (r.status === 0 && fs.existsSync(file)) pngs.push(path.relative(process.cwd(), file));
  }
}

// runs of regressions, for a short summary
const runs = [];
for (const x of real) { const l = runs[runs.length - 1]; if (l && x.frame - l.to <= 1) { l.to = x.frame; l.max = Math.max(l.max, x.mean_diff ?? 0); } else runs.push({ from: x.frame, to: x.frame, max: x.mean_diff ?? 0 }); }
const am = { before: audioMd5(before), after: audioMd5(after) };
const verdict = real.length ? "regression" : "clean";
const result = {
  ok: !real.length, verdict, severity: real.length ? "warning" : "none", before, after,
  frames: n, fps: r2(fps), touched: windows.map(([a, b]) => ({ from_s: a, to_s: b })), margin_s: margin, tolerance: tol,
  changed_inside_windows: inside, changed_outside_windows: outside.length, encode_noise_outside: noise, regressions: real.length,
  regression_runs: runs.map((x) => ({ frames: `${x.from}-${x.to}`, from_s: r2(x.from / fps), to_s: r2((x.to + 1) / fps), max_mean_diff: r2(x.max) })),
  worst: real.slice().sort((a, b) => (b.mean_diff ?? 255) - (a.mean_diff ?? 255)).slice(0, 8),
  diff_pngs: pngs, audio_identical: am.before && am.after ? am.before === am.after : null, notes,
  message: real.length ? `${real.length} frame(s) outside the touched windows changed by more than ${tol} levels (${runs.map((x) => `${r2(x.from / fps)}-${r2((x.to + 1) / fps)} s`).join(", ")}): a fix leaked into untouched film` : `every frame outside the touched windows is unchanged${noise ? ` (${noise} differ by re-encode noise only)` : ""}`,
};
if (real.length) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, "fixcheck.json"), JSON.stringify(result, null, 2)); }
console.log(JSON.stringify(result, null, 2));
process.exit(real.length && args.strict ? 2 : 0);
