#!/usr/bin/env node
// The motion gate: does the film keep moving, and does it move like a person animated it? Measured on the DRAFT
// render (and from the built project's code) before the user sees it. A film that freezes, cuts between two poses at
// rest, or moves like a machine (every move on one curve, snap-and-die moves, one thing at a time, nothing settling)
// fails here with the time, the region or the beat, so the builder can fix the cause.
//
//   node motion-gate.mjs [--video <draft.mp4>] [--project <videos/name>] [--plan <run>/motion/score.json]
//        [--scenes <run>/scenes.json] [--end-hold 1.4] [--fps 15] [--no-text-fit] [--no-fluency] [--stillness] [--json]
//   node motion-gate.mjs fluency --video <film.mp4> [--stillness] [--json]     the fluency measurement alone
//   -> exit 0 pass · 2 findings (listed, each with a time and a fix) · 1 could not run (never "clean")
//
// Fluency (--video; lib/fluency.mjs: block-matching motion on 480 px grey frames, moving regions tracked into moves):
//   the curve-shape spread (t50 IQR), the median visible move, two or more motions at once, the settle share, the
//   duration spread, arcs, dead frames, cuts between poses at rest. A weighted score under 0.70 fails. Calibrated on
//   the reference films against our own (.context/night/done-W7.md). A declared stillness style (--stillness,
//   score.stillness: true, or motion.md `stillness: true`: an editorial film like OpenAI's "Refreshed.") waives dead
//   frames, cuts at rest and concurrency, and turns coverage and freezes into warnings; the shape checks stay.
//   Per beat (with --plan): a beat whose many moves share one curve is named (`one-curve`).
//
// From the frames (--video; sampled every 1/15 s by frame difference, ffmpeg, no window):
//   coverage   visible motion in at least 70% of frames (the end card's allowed hold is exempt)
//   freeze     no still stretch of 0.8 s or more outside the end card; the end card holds at most 1.4 s still after its
//              last move (--end-hold, or the plan's end_hold_s, when the brief asks for longer)
//   creep      a whole-frame scale or drift slower than 4% a second is a WARNING (it can shimmer thin lines and small
//              type); a living camera on a world layer is wanted (R5: UI references move the camera a third of the time)
//   empty-frames  at most 10% of frames near-empty (foreground under 2.5% of the frame: see foregroundShare), the end hold (last
//              1.4 s) and declared breaths (score.breaths: [[t0, t1]], each 1 s at most, two at most) exempt
//   gap-between-beats  no near-empty stretch over 0.3 s at a seam between two beats (outside breaths): the next element arrives
//              before the last one leaves
//   seams      every seam (a beat boundary from the plan) has motion on both sides within 0.2 s
//   duration-mismatch  (with --plan or --scenes) the render's length is within 0.25 s or 2% (whichever is larger) of the planned
//              duration (the plan's `duration`, or where its last beat ends)
// From the plan and the code (--plan, --project):
//   carriers   at least two seams carried by an object present on both sides (measured from index.html's carrier
//              tracks when the project is given; otherwise what the plan declares)
//   reveal     exactly one brand reveal: the plan's brandReveal beat, and no data-brand-mark in a beat before it
//   text-fit   (--project) every word meant to be read sits inside the frame: the built compositions are loaded headlessly
//              (no window), the timeline is seeked at 10 fps and the real DOM box of every visible text (opacity > 0.5,
//              font-size >= 20 px, trimmed by its clipping ancestors) is measured; error `text-cropped` with the time
//              range and the text when a box crosses the frame edge for more than 1.2 s, or sits outside the 6% safe
//              area at rest for 0.4 s or more (lib/textfit.mjs; data-text-fit="ignore" opts an element out;
//              --no-text-fit skips it; a Chrome that cannot start is listed as skipped, never passed)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/common.mjs";
import { track } from "./lib/report.mjs";
import { textFit } from "./lib/textfit.mjs";
import { analyse as fluencyOf, scoreFluency } from "./lib/fluency.mjs";

export const GATE = {
  coverage: 0.7, // share of frames with visible motion
  freeze_s: 0.8, // a still stretch this long fails
  end_hold_s: 1.4, // the end card's stillness after its last move
  creep_per_s: 0.04, // a whole-frame scale or drift slower than this (4%/s) is a creep
  seam_window_s: 0.2, // motion on both sides of every seam within this window
  carried_seams: 2, // seams carried by an object present on both sides
  empty_share: 0.10, // more than this share of frames near-empty fails (empty-frames)
  empty_fg: 0.025, // a frame is near-empty when its foreground covers less than this share of the frame
  gap_s: 0.3, // a near-empty stretch this long at a seam fails (gap-between-beats)
  breath_max_s: 1.0, breaths_max: 2, // declared breaths: each at most this long, at most this many
};

const W = 192, H = 108; // analysis size: area-averaged, so encoding noise falls under the pixel threshold
const PIX_T = 6, MOVE_SHARE = 0.0008; // a frame moves when >= 0.08% of pixels change by more than 6 levels

async function main() {
  const args = parseArgs();
  if (!args.json) track("Measuring the film frame by frame: freezes, creep, seams", "Motion gate done");
  if (args._[0] === "fluency") {
    if (!str(args.video)) { console.error("fluency needs --video <film.mp4>"); process.exit(1); }
    const m = await fluencyOf(path.resolve(str(args.video)));
    const g = scoreFluency(m, { stillness: !!args.stillness });
    if (args.json) console.log(JSON.stringify({ ...m, fluency: g }, null, 2));
    else {
      console.log(`fluency: ${g.insufficient ? "not enough moves to judge" : g.pass ? "pass" : "FAIL"} · score ${g.score} (0.70 to pass)${args.stillness ? " · stillness style" : ""}`);
      for (const c of g.checks) console.log(`  ${c.ok === false ? "FAIL" : c.ok ? "ok  " : "--  "} ${c.key} = ${c.value} (want ${c.want})${c.note ? ` ${c.note}` : ""}${c.message ? `: ${c.message}` : ""}`);
    }
    process.exit(g.pass === false ? 2 : 0);
  }
  const res = await gate({ video: str(args.video), project: str(args.project), plan: str(args.plan), scenes: str(args.scenes), endHold: Number(args["end-hold"]) || null, fps: Number(args.fps) || 15, textFit: !args["no-text-fit"], fluency: !args["no-fluency"], stillness: args.stillness ? true : null });
  if (args.json) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`motion gate: ${res.verdict}${res.measured.coverage != null ? ` · ${Math.round(res.measured.coverage * 100)}% of frames move` : ""}`);
    for (const f of res.findings) console.log(`  ${f.severity === "error" ? "FAIL" : "warn"} ${f.check}${f.at != null ? ` at ${f.at} s` : ""}${f.region ? ` (${f.region})` : ""}: ${f.message}${f.fix ? `\n       fix: ${f.fix}` : ""}`);
    for (const s of res.skipped) console.log(`  skip ${s}`);
    for (const c of res.could_not_run) console.log(`  could not run: ${c}`);
  }
  process.exit(res.could_not_run.length && !res.findings.some((f) => f.severity === "error") ? 1 : res.ok ? 0 : 2);
}

function str(v) { return v == null || v === true ? null : String(v); }
const r2 = (x) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------- the plan
// beats from the plan (motion/score.json: scenes[] with start/end or durations, brandReveal, carriers) or scenes.json
export function readPlan(planPath, scenesPath) {
  const read = (p) => { try { return p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; } catch { return undefined; } };
  const plan = read(planPath), sc = read(scenesPath);
  if (plan === undefined) return { error: `${planPath} is not valid JSON` };
  const list = (plan && (plan.beats || plan.scenes)) || (sc && sc.scenes) || [];
  let t = 0;
  const beats = list.map((b, i) => {
    const start = Number.isFinite(Number(b.start)) && b.start !== "" && b.start != null ? Number(b.start) : t;
    const end = Number.isFinite(Number(b.end)) && b.end != null ? Number(b.end) : start + (Number(b.duration) || Number(b.duration_s) || 0);
    t = end;
    return { i, n: b.n || i + 1, id: String(b.id || b.n || i + 1), start, end, exit: b.exit || null, carrier: b.carrier || null, line: b.line || b.on_screen || null };
  });
  const seams = (plan && Array.isArray(plan.seams) ? plan.seams : []);
  return { plan, beats, seams, brandReveal: plan ? plan.brandReveal : undefined, endHold: plan && Number(plan.end_hold_s) > 0 ? Number(plan.end_hold_s) : null, duration: plan && Number(plan.duration) > 0 ? Number(plan.duration) : t || null };
}

// ---------------------------------------------------------------- frames
function probeDuration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  return Number((r.stdout || "").trim()) || null;
}
export function readFrames(file, fps = 15) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `fps=${fps},scale=${W}:${H}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${path.basename(file)}: ${String(r.stderr || "").trim().split("\n").pop()}`);
  const buf = r.stdout, n = Math.floor(buf.length / (W * H));
  const frames = [];
  for (let i = 0; i < n; i++) frames.push(buf.subarray(i * W * H, (i + 1) * W * H));
  return frames;
}

// Foreground share of a frame: the fraction of pixels that are NOT the ground. The ground is a quadratic surface in x and y
// (a flat colour, or a soft gradient) fitted robustly: fit on every 2nd pixel, drop pixels more than FG_T grey levels off it,
// refit (4 rounds); the pixels left off the surface are foreground (type, dots, cards, shadows). A frame with only a small
// dot or one small word on a plain ground measures about 0.5% to 2%; a gradient ground with a centred card 8% or more.
// Calibrated on real films (a white-ground film with a dot at 15 fps: 22% of frames under 3%; a gradient-ground film with
// centred glass cards: 5%). Frames are the 192x108 gray frames of readFrames.
const FG_T = 10;
function solve6(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-12) return null;
    for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
  return x;
}
export function foregroundShare(a) {
  const basis = (x, y) => { const u = x / W - 0.5, v = y / H - 0.5; return [1, u, v, u * u, u * v, v * v]; };
  let keep = null;
  for (let it = 0; it < 4; it++) {
    const A = Array.from({ length: 6 }, () => Array(6).fill(0)), b = Array(6).fill(0);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const o = y * W + x;
      if (keep && !keep[o]) continue;
      const f = basis(x, y);
      for (let i = 0; i < 6; i++) { b[i] += f[i] * a[o]; for (let j = 0; j < 6; j++) A[i][j] += f[i] * f[j]; }
    }
    const c = solve6(A, b);
    if (!c) return 1;
    keep = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const f = basis(x, y); let g = 0; for (let i = 0; i < 6; i++) g += c[i] * f[i]; keep[y * W + x] = Math.abs(a[y * W + x] - g) <= FG_T ? 1 : 0; }
  }
  let n = 0;
  for (let i = 0; i < keep.length; i++) if (!keep[i]) n++;
  return n / keep.length;
}
// per step i (frame i-1 -> i, time i/fps): share of pixels that changed visibly, and where
function diffs(frames) {
  const out = [{ share: 0, mean: 0, box: null }];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    let n = 0, sum = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let p = 0; p < a.length; p++) {
      const d = Math.abs(a[p] - b[p]);
      sum += d;
      if (d > PIX_T) { n++; const x = p % W, y = (p / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    out.push({ share: n / a.length, mean: sum / a.length, box: n ? [x0, y0, x1, y1] : null });
  }
  return out;
}
const regionOf = (box) => {
  if (!box) return "whole frame";
  const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2 / W, cy = (y0 + y1) / 2 / H, area = ((x1 - x0 + 1) * (y1 - y0 + 1)) / (W * H);
  if (area > 0.6) return "whole frame";
  return `${cy < 0.34 ? "top" : cy > 0.66 ? "bottom" : "middle"}-${cx < 0.34 ? "left" : cx > 0.66 ? "right" : "centre"}`;
};

// Creep is measured where it shows: on the edges (thin lines, type, borders) of the earlier frame. For each edge pixel,
// the residual between frame b and frame a transformed (scale s about the centre, then a shift dx, dy); per quadrant the
// lowest 70% of residuals are averaged, so a small animated element does not hide a whole-frame move.
export function edgeMask(a) {
  const mx = Math.round(W * 0.1), my = Math.round(H * 0.1);
  const pts = Array.from({ length: 9 }, () => []);
  const cw = (W - 2 * mx) / 3, ch = (H - 2 * my) / 3;
  for (let y = my; y < H - my; y++) for (let x = mx; x < W - mx; x++) {
    const o = y * W + x, g = Math.abs(a[o + 1] - a[o - 1]) + Math.abs(a[o + W] - a[o - W]);
    if (g > 24) pts[Math.min(2, Math.floor((y - my) / ch)) * 3 + Math.min(2, Math.floor((x - mx) / cw))].push(o);
  }
  return pts;
}
export function qerr(a, b, pts, s, dx, dy) {
  const cx = W / 2, cy = H / 2, out = [];
  for (const q of pts) {
    if (q.length < 15) { out.push(null); continue; }
    const r = [];
    for (const o of q) {
      const x = o % W, y = (o / W) | 0;
      const sx = (x - dx - cx) / s + cx, sy = (y - dy - cy) / s + cy;
      const ix = Math.floor(sx), iy = Math.floor(sy);
      if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) continue;
      const fx = sx - ix, fy = sy - iy, p = iy * W + ix;
      const v = a[p] * (1 - fx) * (1 - fy) + a[p + 1] * fx * (1 - fy) + a[p + W] * (1 - fx) * fy + a[p + W + 1] * fx * fy;
      r.push(Math.abs(v - b[o]));
    }
    r.sort((m, n) => m - n);
    const k = Math.max(1, Math.floor(r.length * 0.7));
    let sum = 0;
    for (let i = 0; i < k; i++) sum += r[i];
    out.push(sum / k);
  }
  return out;
}
const total = (q) => { const v = q.filter((x) => x != null); return v.length ? v.reduce((m, n) => m + n, 0) / v.length : Infinity; };
// a whole-frame scale or drift that explains the change between two frames dt apart, when it is slower than the creep limit
export function creepBetween(a, b, dt, dbg = null) {
  const pts = edgeMask(a);
  const cells = pts.filter((q) => q.length >= 15).length;
  if (cells < 3) return null; // too few edges across the frame to call anything whole-frame
  const q0 = qerr(a, b, pts, 1, 0, 0), e0 = total(q0);
  if (e0 < 2) return null; // the edges did not change
  let best = { e: e0, q: q0, s: 1, dx: 0, dy: 0 };
  const K = 16, STEP = 0.0025; // scale up to +-4% over the pair
  for (let k = -K; k <= K; k++) { if (!k) continue; const s = 1 + k * STEP, q = qerr(a, b, pts, s, 0, 0), e = total(q); if (e < best.e) best = { e, q, s, dx: 0, dy: 0, k }; }
  const DX = 6, DY = 4; // drift up to 6 px of 192 over the pair
  for (let dy = -DY; dy <= DY; dy++) for (let dx = -DX; dx <= DX; dx++) { if (!dx && !dy) continue; const q = qerr(a, b, pts, 1, dx, dy), e = total(q); if (e < best.e) best = { e, q, s: 1, dx, dy }; }
  if (best.s === 1 && !best.dx && !best.dy) return null;
  if (best.e > 0.6 * e0) return null; // the transform does not explain the change
  // whole frame: the same transform clearly explains the change across the frame. A drift must hold in 6 of the 9
  // cells (one line sliding on an empty ground is a line's carry, not a camera drift); a zoom in 3 (a centred
  // headline that scales slowly creeps as much as a camera push)
  const better = q0.filter((v, i) => v != null && best.q[i] != null && best.q[i] <= 0.7 * v).length;
  if (better < (best.s !== 1 ? 3 : 6)) return null;
  const atEdge = best.s !== 1 ? Math.abs(best.k) === K : Math.abs(best.dx) === DX || Math.abs(best.dy) === DY;
  if (atEdge) return null; // faster than the search: a real move, not a creep
  const rate = best.s !== 1 ? Math.abs(Math.log(best.s)) / dt : Math.hypot(best.dx, best.dy) / W / dt;
  if (rate >= GATE.creep_per_s) return null;
  const kind = best.s !== 1 ? (best.s > 1 ? "zoom in" : "zoom out") : "drift";
  return { kind, sign: best.s !== 1 ? Math.sign(best.s - 1) : `${Math.sign(best.dx)},${Math.sign(best.dy)}`, rate };
}

// ---------------------------------------------------------------- code (the built project)
function readText(p) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }
function hostsOf(project) {
  const idx = readText(path.join(project, "index.html"));
  const hosts = [];
  for (const m of idx.matchAll(/<[a-z]+\b[^>]*data-composition-src="([^"]+)"[^>]*>/gi)) {
    const tag = m[0];
    const start = Number((tag.match(/data-start="([\d.]+)"/) || [])[1]);
    const dur = Number((tag.match(/data-duration="([\d.]+)"/) || [])[1]);
    const trk = Number((tag.match(/data-track-index="(\d+)"/) || [])[1]);
    hosts.push({ src: m[1], start, end: start + dur, track: Number.isFinite(trk) ? trk : null, carrier: /carriers\//.test(m[1]) || (Number.isFinite(trk) && trk >= 3 && trk < 10) });
  }
  return { idx, hosts };
}
// balanced-brace object literal starting at s[i] === "{"
function objAt(s, i) {
  let d = 0, q = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "{") d++;
    else if (c === "}") { d--; if (!d) return { text: s.slice(i, j + 1), end: j + 1 }; }
  }
  return null;
}
const MOVE_PROPS = /\b(x|y|xPercent|yPercent|scale|scaleX|scaleY|rotation|rotate|left|top|strokeDashoffset|drawSVG|motionPath|attr)\s*:/;
// every GSAP tween in a composition the gate can resolve: target ids, start, end, moves?, fades in/out?
export function tweensOf(code) {
  const out = [], skipped = [];
  let cursor = 0;
  const re = /\.(to|from|fromTo)\(\s*(["'`])([^"'`]+)\2\s*,\s*/g;
  let m;
  while ((m = re.exec(code))) {
    const kind = m[1], sel = m[3];
    let i = re.lastIndex;
    const a = code[i] === "{" ? objAt(code, i) : null;
    if (!a) { skipped.push(sel); continue; }
    let b = null, j = a.end;
    if (kind === "fromTo") { const k = code.indexOf("{", j); b = k >= 0 && /^\s*,\s*$/.test(code.slice(j, k)) ? objAt(code, k) : null; if (!b) { skipped.push(sel); continue; } j = b.end; }
    const vars = (b || a).text;
    const pm = code.slice(j, j + 40).match(/^\s*(?:,\s*([^,)]+?))?\s*\)/);
    const posRaw = pm && pm[1] != null ? pm[1].trim() : null;
    const dur = Number(((vars.match(/\bduration\s*:\s*([\d.]+)/) || [])[1])) || 0.5;
    let start;
    if (posRaw == null) start = cursor;
    else if (/^[\d.]+$/.test(posRaw)) start = Number(posRaw);
    else if (/^["'`]\+=([\d.]+)["'`]$/.test(posRaw)) start = cursor + Number(posRaw.match(/[\d.]+/)[0]);
    else { skipped.push(`${sel} at ${posRaw}`); continue; }
    const ids = sel.split(",").map((x) => x.trim()).filter((x) => /^#[\w-]+$/.test(x)).map((x) => x.slice(1));
    if (!ids.length) { skipped.push(sel); continue; }
    const fromText = kind === "from" ? a.text : kind === "fromTo" ? a.text : "";
    const fadeIn = /\b(opacity|autoAlpha)\s*:\s*0(?![.\d])/.test(fromText) || (kind === "to" && false);
    const fadeOut = kind !== "from" && /\b(opacity|autoAlpha)\s*:\s*0(?![.\d])/.test(vars);
    const moves = MOVE_PROPS.test(vars) || MOVE_PROPS.test(fromText);
    const num = (txt, k) => { const mm = txt.match(new RegExp(`\\b${k}\\s*:\\s*(-?[\\d.]+)`)); return mm ? Number(mm[1]) : null; };
    const pair = (k, dflt) => { const f0 = fromText ? num(fromText, k) : null, t0 = kind === "from" ? null : num(vars, k); return { from: f0 != null ? f0 : kind === "from" ? null : dflt, to: kind === "from" ? dflt : t0 }; };
    const sc = pair("scale", 1), px = pair("x", 0), py = pair("y", 0);
    out.push({ ids, start, end: start + dur, dur, moves, fadeIn, fadeOut, scale: sc, x: px, y: py });
    cursor = Math.max(cursor, start + dur);
  }
  return { tweens: out, skipped };
}
// id -> ancestor ids, and the leaf text / stroke candidates, from a light tag walk
export function structureOf(html) {
  const parent = {}, text = {}, strokes = new Set();
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  const VOID = /^(br|img|input|meta|link|hr|source|path|line|polyline|circle|rect|use|stop)$/i;
  while ((m = re.exec(html))) {
    if (m[5] != null) { const top = stack.length && stack[stack.length - 1]; if (top && top.id && m[5].trim()) text[top.id] = (text[top.id] || "") + " " + m[5].trim(); continue; }
    const [, close, tag, attrs, self] = m;
    if (/^(script|style)$/i.test(tag) && !close) { const endTag = html.indexOf(`</${tag}`, re.lastIndex); re.lastIndex = endTag < 0 ? html.length : endTag; continue; }
    if (close) { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tag.toLowerCase()) { stack.length = k; break; } continue; }
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || null;
    const anc = stack.map((s) => s.id).filter(Boolean);
    if (id) { parent[id] = anc; if (/^(line|path|polyline)$/i.test(tag) && /stroke/i.test(attrs)) strokes.add(id); }
    if (!self && !VOID.test(tag)) stack.push({ tag: tag.toLowerCase(), id: id || (stack.length ? null : null) });
  }
  // text attributed to the nearest id'd element only (direct text); words of a line
  return { parent, text, strokes };
}
// creep in the code: a scale that changes slower than 4% a second over 0.8 s or more (any element: a slow push on a
// wrapper, a headline that grows by 3% over 4 s), or a camera / world wrapper that drifts that slowly
function creepIn(file, html, tweens) {
  const out = [];
  const Wd = Number((html.match(/data-width="(\d+)"/) || [])[1]) || 1920;
  for (const t of tweens) {
    if (!(t.dur >= GATE.freeze_s)) continue;
    const { from, to } = t.scale;
    if (from > 0 && to > 0 && from !== to) {
      const rate = Math.abs(Math.log(to / from)) / t.dur;
      if (rate < GATE.creep_per_s) out.push({ check: "creep", severity: "warning", at: r2(t.start), element: t.ids.map((x) => `#${x}`).join(", "), file: path.basename(file), region: "scale", message: `#${t.ids[0]} scales ${from} to ${to} over ${r2(t.dur)} s (${r2(rate * 100)}% a second, composition seconds ${r2(t.start)} to ${r2(t.end)}): slower than ${GATE.creep_per_s * 100}% a second shimmers thin lines and small type`, fix: "a slow push is fine on a camera layer (RasanMotion.camera on a world wrapper, 1.5-4% over the shot); on a headline or a hairline look at a 24 fps strip for shimmer, and move it for real if it crawls" });
    }
    if (t.ids.some((x) => /^(world|cam|camera|stage|scene|root|film)([-_]|$)/i.test(x))) {
      for (const ax of ["x", "y"]) {
        const { from: a, to: b } = t[ax];
        if (a == null || b == null || a === b) continue;
        const rate = Math.abs(b - a) / Wd / t.dur;
        if (rate < GATE.creep_per_s) out.push({ check: "creep", severity: "warning", at: r2(t.start), element: `#${t.ids[0]}`, file: path.basename(file), region: "camera drift", message: `the camera wrapper #${t.ids[0]} drifts ${Math.abs(b - a)} px on ${ax} over ${r2(t.dur)} s (${r2(rate * 100)}% of the width a second): a creep`, fix: "a drift of 0.5-1.5% of the frame a second is a living frame (wanted); check a 24 fps strip for shimmer on thin lines and small type" });
      }
    }
  }
  return out;
}
// the code checks per composition: creep in the code (a warning). "A line never parks" was dropped (R5): it made every
// line drift mechanically; composed holds with a living layer read as human, constant drift does not.
function codeChecks(file, html) {
  const { tweens, skipped: sk } = tweensOf(html);
  return { findings: creepIn(file, html, tweens), skipped: sk.map((s2) => `${path.basename(file)}: ${s2} (position or target not resolvable)`) };
}

// ---------------------------------------------------------------- the gate
export async function gate({ video = null, project = null, plan = null, scenes = null, endHold = null, fps = 15, textFit: doTextFit = true, fluency = true, stillness = null } = {}) {
  const findings = [], skipped = [], could = [], measured = {};
  const add = (f) => findings.push(f);
  const P = readPlan(plan && path.resolve(plan), scenes && path.resolve(scenes));
  if (P.error) could.push(P.error);
  // a declared stillness style: the flag, the plan (stillness: true or motion_style: "stillness"), or motion.md
  if (stillness == null) {
    const md = project ? readText(path.join(path.resolve(project), "motion.md")) : "";
    stillness = !!(P.plan && (P.plan.stillness === true || P.plan.motion_style === "stillness")) || /^stillness:\s*true\b/m.test(md);
  }
  measured.stillness = stillness;
  const still = stillness ? "warning" : "error";
  const beats = P.beats || [];
  const holdMax = endHold || P.endHold || GATE.end_hold_s;
  const seamTimes = beats.slice(1).map((b) => b.start);
  const endStart = beats.length >= 2 ? beats[beats.length - 1].start : null;
  measured.thresholds = { ...GATE, end_hold_s: holdMax };
  if (!video && !project) could.push("nothing to measure: give --video <draft.mp4> (the frame checks) and/or --project <dir> (the code checks)");

  // ---- frames
  if (video) {
    const file = path.resolve(video);
    if (!fs.existsSync(file)) could.push(`video not found: ${video}`);
    else {
      let frames = null;
      try { frames = readFrames(file, fps); } catch (e) { could.push(e.message); }
      if (frames && frames.length < 3) { could.push(`${path.basename(file)} has ${frames.length} frames`); frames = null; }
      if (frames) {
        const dur = probeDuration(file) || frames.length / fps;
        // the render is as long as the plan says (the plan's duration, or its beats' end when it gives none)
        if (P.duration) {
          const tol = Math.max(0.25, 0.02 * P.duration);
          measured.planned_duration_s = r2(P.duration);
          measured.render_duration_s = r2(dur);
          if (Math.abs(dur - P.duration) > tol) add({ check: "duration-mismatch", severity: "error", at: null, region: "whole film", message: `the render runs ${r2(dur)} s but the plan says ${r2(P.duration)} s (${r2(tol)} s tolerance)`, fix: dur > P.duration ? "trim the tail or the over-long beat, or correct the plan's duration if the film was meant to run longer" : "a beat or the end card is short or the timeline ends early; extend it to the planned length, or correct the plan's duration" });
        }
        const D = diffs(frames);
        const moving = D.map((d, i) => i > 0 && d.share >= MOVE_SHARE);
        const tOf = (i) => r2(i / fps);
        // the end card's hold: the still run that ends the film, exempt up to holdMax
        let tail = 0;
        for (let i = D.length - 1; i > 0 && !moving[i]; i--) tail++;
        const tailS = tail / fps;
        const lastMove = (D.length - 1 - tail) / fps;
        if (tailS > holdMax + 1 / fps) add({ check: "end-hold", severity: "error", at: r2(lastMove), region: "whole frame", message: `the end card holds ${r2(tailS)} s still after its last move (${holdMax} s at most)`, fix: `land the end card's last element later (the CTA wipes in, the mark settles), or end the film ${r2(tailS - holdMax)} s sooner` });
        const exempt = Math.min(tail, Math.round(holdMax * fps));
        const counted = moving.slice(1, D.length - exempt);
        const coverage = counted.length ? counted.filter(Boolean).length / counted.length : 0;
        measured.coverage = r2(coverage);
        measured.frames = frames.length;
        measured.duration_s = r2(dur);
        measured.end_card_hold_s = r2(tailS);
        // still stretches (each step that does not move), outside the trailing hold
        const stills = [];
        let s0 = null;
        for (let i = 1; i < D.length - tail; i++) {
          if (!moving[i]) { if (s0 == null) s0 = i; }
          else if (s0 != null) { stills.push([s0, i - 1]); s0 = null; }
        }
        if (s0 != null) stills.push([s0, D.length - tail - 1]);
        measured.longest_still_s = r2(Math.max(0, ...stills.map(([a, b]) => (b - a + 1) / fps)));
        if (coverage < GATE.coverage) {
          const top = stills.map(([a, b]) => ({ a, len: (b - a + 1) / fps })).sort((x, y) => y.len - x.len).slice(0, 3).map((x) => `${tOf(x.a)} s (${r2(x.len)} s)`);
          add({ check: "coverage", severity: still, at: null, region: "whole film", message: `visible motion in ${Math.round(coverage * 100)}% of frames (${Math.round(GATE.coverage * 100)}% at least)${top.length ? `; the longest still stretches start at ${top.join(", ")}` : ""}`, fix: "overlap the gestures (the next starts at 55-75% of the last) and keep a living layer through holds (a camera push or drift on the world, ambient on the ground); a composed hold is fine, a dead frame is not" });
        }
        for (const [a, b] of stills) {
          const len = (b - a + 1) / fps;
          if (len >= GATE.freeze_s - 1e-6) {
            const inEnd = endStart != null && a / fps >= endStart;
            add({ check: "freeze", severity: still, at: tOf(a - 1 >= 0 ? a - 1 : a), region: "whole frame", message: `nothing moves for ${r2(len)} s (${tOf(a - 1 >= 0 ? a - 1 : a)} to ${tOf(b)} s)${inEnd ? ", inside the end card before its last move" : ""}: ${GATE.freeze_s} s at most`, fix: "let the hold breathe instead of dying: a camera push on the world, a secondary that settles late, the next element starting early; or cut it shorter" });
          }
        }
        // empty frames: near-empty = foreground under GATE.empty_fg (foregroundShare); the end hold and declared breaths are exempt
        {
          const fgs = frames.map(foregroundShare);
          const empty = fgs.map((v) => v < GATE.empty_fg);
          const exemptFrom = Math.max(0, frames.length - Math.round(holdMax * fps));
          const bs = (P.plan && Array.isArray(P.plan.breaths) ? P.plan.breaths : []);
          const breaths = [];
          bs.forEach((b, k) => {
            const ok = Array.isArray(b) && b.length === 2 && Number(b[0]) >= 0 && Number(b[1]) > Number(b[0]);
            if (!ok) skipped.push(`breaths[${k}] is not [t0, t1]: ignored`);
            else if (Number(b[1]) - Number(b[0]) > GATE.breath_max_s + 1e-6) skipped.push(`breaths[${k}] [${b[0]}, ${b[1]}] is longer than ${GATE.breath_max_s} s: not exempt`);
            else if (breaths.length >= GATE.breaths_max) skipped.push(`breaths[${k}]: only ${GATE.breaths_max} breaths are allowed; not exempt`);
            else breaths.push([Number(b[0]), Number(b[1])]);
          });
          const inBreath = (i) => breaths.some(([t0, t1]) => i / fps >= t0 - 1e-6 && i / fps <= t1 + 1e-6);
          const counts = (i) => i < exemptFrom && !inBreath(i);
          const idx = frames.map((_, i) => i).filter(counts);
          const nEmpty = idx.filter((i) => empty[i]).length;
          const share = idx.length ? nEmpty / idx.length : 0;
          measured.empty_share = r2(share);
          const runs = [];
          let r0 = null;
          for (let i = 0; i <= frames.length; i++) {
            const e = i < frames.length && empty[i] && counts(i);
            if (e && r0 == null) r0 = i;
            else if (!e && r0 != null) { runs.push([r0, i - 1]); r0 = null; }
          }
          if (share > GATE.empty_share) {
            const top = runs.map(([a, b]) => ({ a, len: (b - a + 1) / fps })).sort((x, y) => y.len - x.len).slice(0, 3).map((x) => `${tOf(x.a)} s (${r2(x.len)} s)`);
            add({ check: "empty-frames", severity: "error", at: null, region: "whole film", message: `${Math.round(share * 100)}% of frames are near-empty (foreground under ${GATE.empty_fg * 100}% of the frame; ${Math.round(GATE.empty_share * 100)}% at most, the end hold and declared breaths excepted)${top.length ? `; the longest start at ${top.join(", ")}` : ""}`, fix: "overlap the beats: the next element arrives before the last one leaves, and a hold carries a card, a line or a ground that lives; declare a real breath in score.breaths ([[t0, t1]], 1 s at most, two at most) only at the emotional turn" });
          }
          // gap between beats: a near-empty run over 0.3 s that touches a seam (within 0.15 s)
          const gaps = [];
          for (const [a, b] of runs) {
            const len = (b - a + 1) / fps;
            if (len <= GATE.gap_s + 1e-6) continue;
            const t = seamTimes.find((st) => st >= a / fps - 0.15 && st <= (b + 1) / fps + 0.15);
            if (t != null) gaps.push({ t, a, len });
          }
          for (const g of gaps) add({ check: "gap-between-beats", severity: "error", at: tOf(g.a), region: "seam", message: `the frame is near-empty for ${r2(g.len)} s at the seam at ${r2(g.t)} s (${tOf(g.a)} s on; ${GATE.gap_s} s at most)`, fix: "start the next beat's first element before the last beat's final element leaves (overlap them), or declare the gap a breath in score.breaths" });
          measured.gaps_between_beats = gaps.length;
          if (!seamTimes.length) skipped.push("gap-between-beats: no plan (--plan) to say where the beats meet");
        }
        // creep: frame pairs 0.8 s and 2.4 s apart (the longer baseline sees a push as slow as 0.3% a second), every 0.2 s;
        // a creep is three pairs in a row on one baseline with the same move (a settle at the end of an ease is shorter)
        const step = Math.max(1, Math.round(fps / 5)), creeps = [];
        for (const base of [0.8, 2.4]) {
          const span = Math.round(base * fps);
          const pairs = [];
          for (let i = 0; i + span < frames.length; i += step) pairs.push({ i, c: creepBetween(frames[i], frames[i + span], span / fps) });
          let run = [];
          const flush = () => { if (run.length >= 3) creeps.push({ from: run[0].i, to: run[run.length - 1].i + span, kind: run[0].c.kind, rate: Math.max(...run.map((p) => p.c.rate)) }); run = []; };
          for (const p of pairs) {
            if (p.c && run.length && (run[0].c.kind !== p.c.kind || String(run[0].c.sign) !== String(p.c.sign))) flush();
            if (p.c) run.push(p); else flush();
          }
          flush();
        }
        // overlapping spans (both baselines) are one creep
        creeps.sort((x, y) => x.from - y.from);
        for (let k = 1; k < creeps.length; k++) if (creeps[k].from <= creeps[k - 1].to && creeps[k].kind === creeps[k - 1].kind) { creeps[k - 1].to = Math.max(creeps[k - 1].to, creeps[k].to); creeps[k - 1].rate = Math.max(creeps[k - 1].rate, creeps[k].rate); creeps.splice(k--, 1); }
        // the end card may settle with a slow drift of its type block (HyperFrames' own gate allows it); a slow zoom stays a creep
        const lastBeat = P.beats && P.beats.length ? P.beats[P.beats.length - 1] : null;
        const endCardFrom = lastBeat && Number(lastBeat.start) >= 0 ? Number(lastBeat.start) : dur - 3;
        for (let k = creeps.length - 1; k >= 0; k--) if (creeps[k].kind === "drift" && tOf(creeps[k].from) >= endCardFrom - 0.2) { skipped.push(`creep: a slow drift on the end card from ${tOf(creeps[k].from)} s is allowed`); creeps.splice(k, 1); }
        for (const c of creeps) add({ check: "creep", severity: "warning", at: tOf(c.from), region: "whole frame", message: `a whole-frame ${c.kind} of about ${r2(c.rate * 100)}% a second from ${tOf(c.from)} to ${tOf(c.to)} s (slower than ${GATE.creep_per_s * 100}% a second can shimmer thin lines and small type)`, fix: "a living camera is wanted; check a 24 fps strip of this stretch for shimmer on hairlines and small type, and if it shimmers put the push on a layer without them or move it for real" });
        measured.creep_spans = creeps.length;
        // seams: motion on both sides within the window (the cut step itself and its neighbour do not count)
        const seamRows = [];
        seamTimes.forEach((t, k) => {
          if (t > dur - GATE.seam_window_s / 2) { skipped.push(`seam ${beats[k].id}>${beats[k + 1].id} at ${r2(t)} s is past the end of the render (${r2(dur)} s)`); return; }
          const c = Math.round(t * fps), w = Math.round(GATE.seam_window_s * fps);
          const before = [], after = [];
          for (let i = c - w; i <= c - 2; i++) if (i > 0 && i < D.length) before.push(moving[i]);
          for (let i = c + 2; i <= c + w; i++) if (i > 0 && i < D.length) after.push(moving[i]);
          const okB = before.some(Boolean), okA = after.some(Boolean);
          seamRows.push({ seam: `${beats[k].id}>${beats[k + 1].id}`, t: r2(t), before: okB, after: okA });
          if (!okB || !okA) add({ check: "seam", severity: "error", at: r2(t), region: `seam ${beats[k].id}>${beats[k + 1].id}`, message: `the cut at ${r2(t)} s (${beats[k].id} to ${beats[k + 1].id}) has ${!okB && !okA ? "both sides" : !okB ? "the outgoing side" : "the incoming side"} at rest within ${GATE.seam_window_s} s`, fix: "the outgoing beat is still moving when the cut lands and the incoming beat arrives already moving, same axis, same direction, same speed (cut the curve, or carry an object across)" });
        });
        measured.seams = seamRows;
        if (!seamTimes.length) skipped.push(beats.length ? "seams: the plan has one beat" : "seams: no plan (--plan <run>/motion/score.json) to say where the beats meet");
      }
    }
  } else skipped.push("frames: no --video (coverage, freeze, creep and seams are measured on the draft render)");

  // ---- fluency: does it move like a person animated it?
  if (video && fluency && fs.existsSync(path.resolve(video))) {
    try {
      const m = await fluencyOf(path.resolve(video), { series: true });
      const g = scoreFluency(m, { stillness });
      const { _series, ...rest } = m;
      measured.fluency = { score: g.score, pass: g.pass, ...rest };
      const fails = g.checks.filter((c) => c.ok === false);
      if (g.insufficient) skipped.push(`fluency: ${g.note}`);
      else if (!g.pass) add({ check: "fluency", severity: "error", at: null, region: "whole film", message: `moves like a machine: fluency ${g.score} (0.70 to pass). ${fails.map((c) => `${c.key} ${c.value} (want ${c.want})`).join("; ")}`, fix: fails.map((c) => c.message).join(" | ") });
      else if (fails.length) add({ check: "fluency", severity: "warning", at: null, region: "whole film", message: `fluency ${g.score} passes, still weak on: ${fails.map((c) => `${c.key} ${c.value} (want ${c.want})`).join("; ")}`, fix: fails.map((c) => c.message).join(" | ") });
      // per beat: many moves on one curve (a swarm, a metronomic cascade)
      const rows = [];
      for (const b of beats) {
        const mv = (_series.moves || []).filter((x) => x.t0 >= b.start && x.t0 < b.end);
        const t50 = mv.map((x) => x.t50).filter((x) => x != null).sort((p, q) => p - q);
        const iqr = t50.length >= 6 ? r2(t50[Math.floor(t50.length * 0.75)] - t50[Math.floor(t50.length * 0.25)]) : null;
        rows.push({ beat: b.id, moves: mv.length, t50_iqr: iqr });
        if (t50.length >= 10 && iqr != null && iqr < 0.08) add({ check: "one-curve", severity: "warning", at: r2(b.start), region: `beat ${b.id}`, message: `${t50.length} moves in beat ${b.id} share one curve shape (t50 spread ${iqr})`, fix: "give the group irregular offsets and two or three curves (RasanMotion.cascade), and its hero a settle" });
      }
      if (rows.length) measured.fluency_beats = rows;
    } catch (e) { skipped.push(`fluency: ${e.message} (not measured, never passed)`); }
  } else if (video && !fluency) skipped.push("fluency: skipped (--no-fluency)");

  // ---- the plan and the code
  if (beats.length) {
    // carriers
    const need = Math.min(GATE.carried_seams, seamTimes.length);
    const declared = beats.slice(0, -1).filter((b) => b.exit === "carrier" && String(b.carrier || "").trim()).length || (P.seams || []).filter((s) => ["carried-object", "shared-element"].includes(s.kind) && s.element).length;
    let carried = null;
    if (project) {
      const { hosts } = hostsOf(path.resolve(project));
      const cs = hosts.filter((h) => h.carrier && Number.isFinite(h.start) && Number.isFinite(h.end));
      carried = seamTimes.filter((t) => cs.some((h) => h.start < t - 0.1 && h.end > t + 0.1)).length;
      measured.carried_seams = carried;
    }
    measured.declared_carried_seams = declared;
    const have = carried != null ? carried : declared;
    if (need && have < need) add({ check: "carriers", severity: "error", at: null, region: "seams", message: carried != null ? `${carried} seam(s) carried by an object present on both sides in the built film (the plan declares ${declared}); ${need} at least` : `the plan declares ${declared} carried seam(s); ${need} at least`, fix: "carry at least two seams with one object that crosses the cut and becomes part of the next beat (compositions/carriers/<name>.html on its own track, spanning both beats; video.mjs carriers mounts it)" });
    if (carried == null && need) skipped.push("carriers: measured from the plan only (give --project to measure the carrier tracks)");
    // one brand reveal
    const br = P.brandReveal;
    const ids = beats.map((b) => b.id);
    if (br == null || br === "") add({ check: "reveal", severity: "error", at: null, message: "the plan names no brandReveal beat (exactly one beat reveals the brand)", fix: 'set "brandReveal": "<beat id>" in the plan' });
    else if (Array.isArray(br)) add({ check: "reveal", severity: "error", at: null, message: `the plan names ${br.length} brand reveals; exactly one`, fix: "reveal the mark once; after it, it stays or travels as the same object into the end card" });
    else if (!ids.includes(String(br))) add({ check: "reveal", severity: "error", at: null, message: `brandReveal "${br}" is not a beat id (${ids.join(", ")})`, fix: "name the beat where the mark is revealed" });
    else if (project) {
      const rb = beats.find((b) => b.id === String(br));
      const { hosts } = hostsOf(path.resolve(project));
      let marks = 0;
      for (const h of hosts) {
        const html = readText(path.join(path.resolve(project), h.src));
        const n = (html.match(/data-brand-mark/g) || []).length;
        marks += n;
        if (n && Number.isFinite(h.start) && h.start < rb.start - 0.1 && !h.carrier) add({ check: "reveal", severity: "error", at: r2(h.start), element: h.src, message: `${h.src} shows a brand mark at ${r2(h.start)} s, before the reveal beat "${br}" (${r2(rb.start)} s)`, fix: "before the reveal the brand shows only inside product imagery; reveal the mark once, in its beat" });
        if (n && h.carrier && h.start < rb.start - 0.1) add({ check: "reveal", severity: "error", at: r2(h.start), element: h.src, message: `the carrier ${h.src} holds a brand mark from ${r2(h.start)} s, before the reveal beat "${br}"`, fix: "start the mark's carrier at the reveal" });
      }
      if (!marks) skipped.push("reveal: no element is tagged data-brand-mark, so the code can't show where the mark appears (tag every logo)");
    }
  } else skipped.push("plan checks: no plan (carriers, the one brand reveal and the seams need --plan <run>/motion/score.json)");

  if (project) {
    const pj = path.resolve(project);
    if (!fs.existsSync(pj)) could.push(`project not found: ${project}`);
    else {
      const files = [];
      if (fs.existsSync(path.join(pj, "index.html"))) files.push(path.join(pj, "index.html"));
      for (const sub of ["compositions/frames", "compositions/carriers", "compositions"]) {
        const d = path.join(pj, sub);
        if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith(".html") && !files.includes(path.join(d, f))) files.push(path.join(d, f));
      }
      for (const f of files) {
        const r = codeChecks(f, readText(f));
        findings.push(...r.findings);
        skipped.push(...r.skipped.slice(0, 5));
      }
      if (doTextFit) {
        const tf = await textFit(pj);
        findings.push(...tf.findings);
        skipped.push(...tf.skipped, ...tf.could_not_run.map((c) => `${c} (not measured, never passed)`));
        measured.text_fit = { pages: tf.pages, samples: tf.samples, cropped: tf.findings.length };
      } else skipped.push("text-fit: skipped (--no-text-fit)");
    }
  }

  const errors = findings.filter((f) => f.severity === "error");
  const ok = !errors.length && !could.length;
  return { ok, verdict: errors.length ? "fail" : could.length ? "could not run" : "pass", measured, findings, skipped, could_not_run: could };
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) await main();
