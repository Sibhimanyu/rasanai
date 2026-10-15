#!/usr/bin/env node
// The motion gate: does the film keep moving, and does it move like a person animated it? Measured on the DRAFT
// render (and from the built project's code) before the user sees it. A film that freezes, cuts between two poses at
// rest, or moves like a machine (every move on one curve, snap-and-die moves, one thing at a time, nothing settling)
// fails here with the time, the region or the beat, so the builder can fix the cause.
//
//   node motion-gate.mjs [--video <draft.mp4>] [--project <videos/name>] [--plan <run>/motion/score.json]
//        [--scenes <run>/scenes.json] [--end-hold 1.5] [--fps 15] [--vo <audio_meta.json|words.json>] [--no-text-fit] [--no-fluency] [--no-carry] [--no-echo] [--no-camera] [--no-emphasis] [--no-guards]
//        [--stillness] [--json]
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
//   end-hold-short  (warning) the film holds under 0.3 s still after its last move: the ending flashes by. An error once a lesson sets
//              motion.end_hold_min_s (a floor: a LARGER value is stricter; motion.end_hold_s is the ceiling above, a smaller one is stricter)
//   creep      a whole-frame scale or drift slower than 4% a second is a WARNING (it can shimmer thin lines and small
//              type); a living camera on a world layer is wanted (R5: UI references move the camera a third of the time)
//   empty-frames  at most 10% of frames near-empty (foreground under 2.5% of the frame: see foregroundShare), the end hold (last
//              1.4 s) and declared breaths (score.breaths: [[t0, t1]], each 1 s at most, two at most) exempt
//   gap-between-beats  no near-empty stretch over 0.3 s at a seam between two beats (outside breaths): the next element arrives
//              before the last one leaves
//   seams      every seam (a beat boundary from the plan) has motion on both sides within 0.2 s
//   carry      something on screen survives every seam, measured from the pixels (lib/carry.mjs; onetake: "never replace a
//              beat, carry it"): at each seam (the plan's beat boundaries, else the hard cuts found in the frames) the
//              frames 0.1 s and 0.3 s either side are compared and the best pair wins; the score is the share of the
//              foreground structure before the seam that reappears after it, allowing a shift (15% of the width) and a
//              scale change (0.7 to 1.4), corrected for chance; a cut-in on the same object (much bigger or smaller, 0.2 to 5) is credited by
//              a verified second pass (edge match over chance plus the grey picture correlating: lib/carry.mjs). A seam under 0.25 is not carried; fewer than half the
//              seams carried is a WARNING listing each uncarried seam with its time and score (an error only when a
//              user lesson sets motion.carry_share, and never in a stillness style). Calibrated against our carry-chain films and the references (craft.md)
//   long-ending  (warning, --plan) the last beat is more than 25% of the film (film.ending_share_max; motionmaxxing G3)
//   no-echo    (warning) the ending does not echo the opening ("the end is the start, changed"; lib/echo.mjs): the opening's key frame
//              (the first settled composition in 3 s) against the end card and the last still frame before it, palette + where the
//              foreground sits + where the edges sit; under 0.55 does not rhyme (the references that rhyme by eye: 0.59 to 0.99; the
//              ones that do not: 0.26 to 0.53). With --plan, also when the score has no echo {opening, ending, change}
//   echo-identical  (warning) the end is the start unchanged (the same frame to a few levels): change it
//   camera-monotone  (warning) the camera does one thing (lib/camera-moves.mjs): each beat's measured camera (locked, push-in,
//              pull-out, pan-truck, tilt, rotate, handheld-drift, whip) is reported; the render needs 1 moving kind from 15 s, 2 from
//              40 s, 3 from 90 s (where the references sit: most great 2D films barely move the camera), never in a stillness style;
//              with --plan, a warning only when no beat names a camera (the move is chosen from what the beat buys) or there is no signature_shot
//   emphasis   (WARNINGS, uncalibrated; lib/emphasis.mjs; needs story/intent.json beside the plan: <run>/story/intent.json) an emphasis curve
//              per 0.5 s (boldness flags + motion energy + loudness) is reported with its measured peak time and the planned one;
//              `emphasis-off-peak` when its maximum is outside the `peak: true` beat (+-0.5 s), `emphasis-on-minor` when the film's
//              biggest moment is on an importance-1 beat (named, with what it buys). With --plan, the budget: `budget-minor-beat`
//              (score.big_moments on an importance-1 beat), `budget-over` (more than ~4 per 30 s), `budget-none`. --no-emphasis skips it.
//   flash-over-cap  (warning, lib/frame-guards.mjs) a flash of 1-3 frames where over ~60% of the picture is near-white (the frames 4 either side under 30%): it reads as a blank frame
//   seam-blank  (warning, --plan) a frame from 10% to 90% of a transition that is blown out (over 50% near-white), flooded (over 60% one colour in neither neighbouring scene) or emptied of detail (edges under 30% of both neighbours); a seam with flood: true opts out
//   hold-frame-drift  (warning, --plan with <run>/frames/<id>.png) a beat's settled frame (its peak_t, else the last quarter) against its approved styleframe: dHash distance over 14/64 or SSIM under 0.55; beats in score.deviations are skipped
//              (--no-guards skips these three)
//   duration-mismatch  (with --plan or --scenes) the render's length is within 0.25 s or 2% (whichever is larger) of the planned
//              duration (the plan's `duration`, or where its last beat ends)
// Lessons (lib/gate-lessons.mjs): motion.end_hold_s, motion.end_hold_min_s, motion.freeze_s, motion.carry_share and film.ending_share_max read
// through gateValue, so a mistake the user pointed out once can tighten them; the report lists each lesson in force.
// From the plan and the code (--plan, --project):
//   carriers   at least two seams carried by an object present on both sides (measured from index.html's carrier
//              tracks when the project is given; otherwise what the plan declares)
//   reveal     exactly one brand reveal: the plan's brandReveal beat, and no data-brand-mark in a beat before it
//   text-fit   (--project) every word meant to be read sits inside the frame: the built compositions are loaded headlessly
//              (no window), the timeline is seeked at 10 fps and the real DOM box of every visible text (opacity > 0.5,
//              font-size >= 20 px, trimmed by its clipping ancestors) is measured; error `text-cropped` with the time
//              range and the text when a box crosses the frame edge for more than 1.2 s, or sits outside the 6% safe
//              area at rest for 0.4 s or more (lib/textfit.mjs; data-text-fit="ignore" opts an element out;
//              --no-text-fit skips it; a Chrome that cannot start is listed as skipped, never passed). The same samples read
//              line blocks (SplitText spans = one line): error `text-too-brief` when a statement-size block (font >= 3.5%
//              of the frame height, 3+ words) is readable for less than 0.6 s + 0.3 s per word (data-read="skim" opts out),
//              and error `text-overlap` when two readable blocks sit on top of each other for 0.3 s or more
//              (data-overlap="ok" opts out). `text-cropped` also fires when a mask or inset cuts letters off a readable line (region "mask"), and
//              text-too-brief is judged per text state (a typed, deleted and swapped slot: each string on its own); see lib/textfit.mjs
//   subject-lost  (WARNING, --project; the plan's beat `hero_id` / `hero` when it is an element id, and every [data-hero]) the hero keeps 90% of its box inside the 6% safe area
//              while it is on screen: a camera move (or the hero's own) that takes it out for 0.3 s or more, or a hero never inside, is named with its times (lib/textfit.mjs; data-hero="bleed" opts out)
//   see-and-say (WARNING; --project plus --vo <audio_meta.json | words.json>, found as <project>/audio_meta.json) each narration cue (a sentence or a pause of 0.6 s ends one) has an on-screen event within 1.0 s: a score event
//              (the plan's beats[].events, scene-relative), a beat start or a line of text appearing (captions never count); and `text-off-word`: a text that names a word the voice says elsewhere
//   caption-duplicates-text (WARNING; --project) a caption and another on-screen line of 3+ words say the same words (70% of the line) in the same window: say it once
//   script-error  (--project) the same page loads error when a composition's script throws while it loads or when its timeline is seeked, a
//              local script does not load, or the composition never registers window.__timelines[<its id>]: a render-blocking error that
//              every other gate misses (obey, slop and lint pass a page whose timeline never registers)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/common.mjs";
import { track } from "./lib/report.mjs";
import { textFit, cuesOf, seeAndSay, captionDupes } from "./lib/textfit.mjs";
import { analyse as fluencyOf, scoreFluency } from "./lib/fluency.mjs";
import { measureCarry } from "./lib/carry.mjs";
import { gateValue, gateNotes } from "./lib/gate-lessons.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";
import { measureEcho, ECHO } from "./lib/echo.mjs";
import { loadIntent, emphasisReport } from "./lib/emphasis.mjs";
import { measureCamera, cameraKind, cameraFloor } from "./lib/camera-moves.mjs";
import { whiteFlashes, seamBlanks, holdDrift } from "./lib/frame-guards.mjs";

export const GATE = {
  coverage: 0.7, // share of frames with visible motion
  freeze_s: 0.8, // a still stretch this long fails
  end_hold_s: 1.5, // the end card's stillness after its last move (a ceiling; a lesson can lower it: motion.end_hold_s)
  end_hold_min_s: 0.3, // ... and its floor: the film holds at least this long still after its last move, else the ending flashes by (a warning; an error once a lesson sets motion.end_hold_min_s, which can raise it)
  creep_per_s: 0.04, // a whole-frame scale or drift slower than this (4%/s) is a creep
  seam_window_s: 0.2, // motion on both sides of every seam within this window
  carried_seams: 2, // seams carried by an object present on both sides (read from the code and the plan)
  carry_seam: 0.25, // a seam is carried when this share of the foreground before it reappears after it (lib/carry.mjs)
  carry_share: 0.5, // at least this share of the seams carried, measured from the pixels (a lesson can raise it: motion.carry_share)
  ending_share_max: 0.25, // the last beat is at most this share of the film (long-ending; a lesson can lower it)
  empty_share: 0.10, // more than this share of frames near-empty fails (empty-frames)
  empty_fg: 0.025, // a frame is near-empty when its foreground covers less than this share of the frame
  gap_s: 0.3, // a near-empty stretch this long at a seam fails (gap-between-beats)
  breath_max_s: 1.0, breaths_max: 2, // declared breaths: each at most this long, at most this many
};

const W = 192, H = 108; // analysis size: area-averaged, so encoding noise falls under the pixel threshold
const PIX_T = 6, MOVE_SHARE = 0.0008; // a frame moves when >= 0.08% of pixels change by more than 6 levels

async function main() {
  const args = parseArgs();
  if (!args.json) track("Measuring the film frame by frame: freezes, creep, seams, echo, camera", "Motion gate done");
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
  const res = await gate({ vo: str(args.vo), video: str(args.video), project: str(args.project), plan: str(args.plan), scenes: str(args.scenes), endHold: Number(args["end-hold"]) || null, fps: Number(args.fps) || 15, textFit: !args["no-text-fit"], fluency: !args["no-fluency"], carry: !args["no-carry"], echo: !args["no-echo"], camera: !args["no-camera"], emphasis: !args["no-emphasis"], guards: !args["no-guards"], stillness: args.stillness ? true : null });
  for (const c of res.could_not_run) noteDowngrade({ run: args.run, what: "the motion gate", instead: "no motion check", why: String(c).slice(0, 200), impact: "this film's motion was not measured" });
  if (args.json) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`motion gate: ${res.verdict}${res.measured.coverage != null ? ` · ${Math.round(res.measured.coverage * 100)}% of frames move` : ""}`);
    const em = res.measured.emphasis;
    if (em && em.measured_peak) console.log(`  emphasis peak measured ${em.measured_peak.t} s, planned ${em.planned_peak ? `beat ${em.planned_peak.beat} ${em.planned_peak.t0}-${em.planned_peak.t1} s` : "unknown"}${em.second ? `, second ${em.second.t} s` : ""} (curve in --json)`);
    for (const f of res.findings) console.log(`  ${f.severity === "error" ? "FAIL" : "warn"} ${f.check}${f.at != null ? ` at ${f.at} s` : ""}${f.region ? ` (${f.region})` : ""}: ${f.message}${f.fix ? `\n       fix: ${f.fix}` : ""}`);
    for (const n of res.notes) console.log(`  note tightened by ${n}`);
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
    const cam3 = b.camera3d && Array.isArray(b.camera3d.moves) ? b.camera3d.moves.map((m) => m && m.move).filter(Boolean) : [];
    return { i, n: b.n || i + 1, id: String(b.id || b.n || i + 1), start, end, exit: b.exit || null, carrier: b.carrier || null, beat: b.beat != null ? Number(b.beat) : null, peak_t: Number.isFinite(Number(b.peak_t)) && b.peak_t != null && b.peak_t !== "" ? Number(b.peak_t) : null, hero_id: [b.hero_id, b.heroId, b.hero_el, b.hero_element, typeof b.hero === "string" && /^[A-Za-z][\w-]*$/.test(b.hero.trim()) ? b.hero.trim() : null].find((x) => typeof x === "string" && x.trim()) || null, events: Array.isArray(b.events) ? b.events : [], line: b.line || b.on_screen || null, camera: b.camera || null, camera3d: cam3, signature_shot: !!b.signature_shot };
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
// VO word times in film seconds from audio_meta.json ({voices:[{frame, words:[{text, start}]}]}, start into the beat) or a flat list / {words:[]}
function loadVoWords(file, beats) {
  let j; try { j = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
  const one = (w, off) => ({ text: String(w.text ?? w.word ?? ""), start: Number(w.start) + off, end: w.end != null ? Number(w.end) + off : Number(w.start) + off + 0.2 });
  if (Array.isArray(j) || Array.isArray(j.words)) return (Array.isArray(j) ? j : j.words).map((w) => one(w, 0)).filter((w) => Number.isFinite(w.start) && w.text);
  if (!Array.isArray(j.voices)) return null;
  const out = [];
  for (const v of j.voices) {
    const b = beats.find((x) => String(x.n) === String(v.frame) || x.id === String(v.frame)), off = b ? b.start : 0;
    if (!b && beats.length) continue;
    for (const w of v.words || []) out.push(one(w, off));
  }
  return out.filter((w) => Number.isFinite(w.start) && w.text);
}
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
export async function gate({ vo = null, video = null, project = null, plan = null, scenes = null, endHold = null, fps = 15, textFit: doTextFit = true, fluency = true, carry = true, echo = true, camera = true, emphasis = true, guards = true, stillness = null } = {}) {
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
  const holdMax = gateValue("motion.end_hold_s", endHold || P.endHold || GATE.end_hold_s);
  const holdMin = gateValue("motion.end_hold_min_s", GATE.end_hold_min_s), holdMinTaught = gateNotes(["motion.end_hold_min_s"]).length > 0;
  const freezeS = gateValue("motion.freeze_s", GATE.freeze_s);
  const carryShare = gateValue("motion.carry_share", GATE.carry_share), endingMax = gateValue("film.ending_share_max", GATE.ending_share_max);
  const notes = gateNotes(["motion.end_hold_s", "motion.end_hold_min_s", "motion.freeze_s", "motion.carry_share", "film.ending_share_max"]);
  const seamTimes = beats.slice(1).map((b) => b.start);
  const endStart = beats.length >= 2 ? beats[beats.length - 1].start : null;
  measured.thresholds = { ...GATE, end_hold_s: holdMax, end_hold_min_s: holdMin, freeze_s: freezeS, carry_share: carryShare, ending_share_max: endingMax };
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
        // the floor: a film that stops on its last move (or holds under the minimum) flashes its ending by; a warning, an error once the user taught it
        if (tailS < holdMin - 1 / fps - 1e-9) add({ check: "end-hold-short", severity: holdMinTaught && still === "error" ? "error" : "warning", at: r2(lastMove), region: "whole frame", message: `the film holds ${r2(tailS)} s still after its last move (${holdMin} s at least): the ending flashes by`, fix: `let the last move settle and hold the end card for ${holdMin} s or more: land the call to action earlier, or end the film ${r2(holdMin - tailS)} s later` });
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
          if (len >= freezeS - 1e-6) {
            const inEnd = endStart != null && a / fps >= endStart;
            add({ check: "freeze", severity: still, at: tOf(a - 1 >= 0 ? a - 1 : a), region: "whole frame", message: `nothing moves for ${r2(len)} s (${tOf(a - 1 >= 0 ? a - 1 : a)} to ${tOf(b)} s)${inEnd ? ", inside the end card before its last move" : ""}: ${freezeS} s at most`, fix: "let the hold breathe instead of dying: a camera push on the world, a secondary that settles late, the next element starting early; or cut it shorter" });
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
      if (!stillness && (measured.duration_s || P.duration || 0) >= 20 && m.dead_frac != null && m.dead_frac < 0.05 && !m.holds_ge_0_5s)
        add({ check: "always-moving", severity: "warning", at: null, region: "whole film", message: `${Math.round(m.dead_frac * 100)}% of frames are still and no hold lasts 0.5 s: the frame is always in motion (the references keep about a third still)`, fix: "land the key moments and let them be read: hold 0.5-1 s where the line is read, after the move that earns it" });
      // energy-off-reference (WARNING, uncalibrated): the draft's energy curve against the reference's (research.mjs deconstruct -> <run>/reference/numbers.json), both per 0.5 s and normalised by their own 90th percentile, the reference stretched to the draft's length
      if (_series && plan && _series.t && _series.t.length > 2) {
        let R = null; try { R = JSON.parse(fs.readFileSync(path.join(path.resolve(path.dirname(path.resolve(plan)), ".."), "reference", "numbers.json"), "utf8")); } catch {}
        if (R && R.energy && Array.isArray(R.energy.energy_norm) && R.energy.energy_norm.length >= 6) {
          const fpsS = 1 / Math.max(1e-3, _series.t[1] - _series.t[0]), per = Math.max(1, Math.round(0.5 * fpsS)), E = _series.energy, mine = [];
          for (let i = 0; i < E.length; i += per) { const w = E.slice(i, i + per).filter((v) => v != null); mine.push(w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0); }
          const p90 = [...mine].sort((a, b) => a - b)[Math.floor(mine.length * 0.9)] || 1, A = mine.map((v) => v / p90);
          const B = Array.from({ length: A.length }, (_, i) => R.energy.energy_norm[Math.min(R.energy.energy_norm.length - 1, Math.floor((i / A.length) * R.energy.energy_norm.length))]);
          const ma = A.reduce((a, b) => a + b, 0) / A.length, mb = B.reduce((a, b) => a + b, 0) / B.length;
          let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < A.length; i++) { sab += (A[i] - ma) * (B[i] - mb); saa += (A[i] - ma) ** 2; sbb += (B[i] - mb) ** 2; }
          const corr = saa && sbb ? sab / Math.sqrt(saa * sbb) : 0, gap = Math.abs((m.dead_frac ?? 0) - (R.energy.still_share ?? 0));
          measured.energy_vs_reference = { corr: +corr.toFixed(2), still_draft: m.dead_frac, still_reference: R.energy.still_share };
          if (corr < 0.2 || gap > 0.25) add({ check: "energy-off-reference", severity: "warning", at: null, region: "whole film", message: `the draft's energy curve follows the reference's at ${corr.toFixed(2)} (want 0.2 or more) and its still share is ${m.dead_frac} against the reference's ${R.energy.still_share}`, fix: "re-shape the pacing: where the reference builds and rests (reference/numbers.json energy_norm), build and rest; or state in the score why this film differs" });
        }
      }
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

  // ---- carry: does something on screen survive every seam? (lib/carry.mjs, measured from the pixels)
  if (video && carry && fs.existsSync(path.resolve(video))) {
    try {
      const c = await measureCarry(path.resolve(video), { seams: seamTimes });
      const rows = c.seams.map((x) => ({ t: x.t, score: x.score, carried: (x.score ?? 0) >= GATE.carry_seam }));
      const total = rows.length, got = rows.filter((x) => x.carried).length, share = total ? got / total : null;
      measured.carry = { source: seamTimes.length ? "plan" : "hard cuts", seams: rows, carried_share: share == null ? null : r2(share), need: carryShare };
      if (!total) skipped.push(`carry: ${seamTimes.length ? "no seam fell inside the render" : "no plan and no hard cut found in the frames"} (nothing to compare)`);
      else if (share < carryShare) {
        const bad = rows.filter((x) => !x.carried);
        // a warning by default: the reference films hard-cut between scenes and the score sits near its line on some seams; an error once the user's lesson asks for carry (motion.carry_share)
        add({ check: "carry", severity: still === "error" && gateNotes(["motion.carry_share"]).length ? "error" : "warning", at: bad[0].t, region: "seams", message: `${got} of ${total} seams carried (${Math.round(share * 100)}%, ${Math.round(carryShare * 100)}% at least); uncarried: ${bad.map((x) => `${x.t} s (${x.score == null ? "nothing on screen before it" : x.score.toFixed(2)})`).join(", ")}; a seam needs ${GATE.carry_seam}`, fix: "never replace a beat, carry it: take an object (a card, a line, the mark, a shape) across the cut and let it become part of the next beat, grown or moved, or make the cut a match cut on a shape" });
      }
    } catch (e) { skipped.push(`carry: ${e.message} (not measured, never passed)`); }
  } else if (video && !carry) skipped.push("carry: skipped (--no-carry)");

  // ---- echo: the end is the start, changed (lib/echo.mjs)
  if (beats.length && P.plan) {
    const e = P.plan.echo, miss = ["opening", "ending", "change"].filter((k) => !(e && typeof e[k] === "string" && e[k].trim().length >= 3));
    if (miss.length) add({ check: "no-echo", severity: "warning", at: null, region: "plan", message: `the score has no echo${e ? ` ${miss.join(", ")}` : ""}: name how the ending answers the opening (score.echo {opening, ending, change})`, fix: 'add "echo": { "opening": "the empty composer, caret blinking", "ending": "the same composer, now holding the answer", "change": "empty to full" }: the end is the start, changed (the same object, frame or shape, transformed by the story)' });
  }
  if (video && echo && fs.existsSync(path.resolve(video))) {
    try {
      const e = measureEcho(path.resolve(video));
      if (e.echo == null) skipped.push(`echo: ${e.note}`);
      else {
        measured.echo = { score: e.echo, palette: e.palette, mass: e.mass, edges: e.edges, opening_t: e.opening.t, ending_t: e.ending.t, ending: e.ending.which, need: ECHO.rhyme };
        if (e.identical) add({ check: "echo-identical", severity: "warning", at: e.ending.t, region: "ending", message: `the ending (${e.ending.which} at ${e.ending.t} s) is the opening frame (${e.opening.t} s) unchanged: an echo is the start, changed`, fix: "keep the opening's object, frame or shape and let the story change it: filled instead of empty, grown, re-coloured, the mark in place of the question" });
        else if (e.echo < ECHO.rhyme) add({ check: "no-echo", severity: "warning", at: e.ending.t, region: "ending", message: `the ending does not echo the opening: ${e.echo} (palette ${e.palette}, layout ${e.mass}, edges ${e.edges}; ${ECHO.rhyme} to rhyme) between ${e.opening.t} s and the ${e.ending.which} at ${e.ending.t} s`, fix: "bring the opening back, changed: the same ground, the same object or frame device in the same place, now transformed (the empty composer returns full, the dot returns as the full stop of the logo, the grid returns with the answer in it)" });
      }
    } catch (err) { skipped.push(`echo: ${err.message} (not measured, never passed)`); }
  } else if (video && !echo) skipped.push("echo: skipped (--no-echo)");

  // ---- camera variety (lib/camera-moves.mjs): what the camera does per beat; warns only when no beat names one
  if (beats.length && P.plan) {
    const named = beats.map((b) => ({ id: b.id, kinds: [b.camera, ...b.camera3d].map(cameraKind).filter(Boolean) }));
    const kinds = new Set(named.flatMap((b) => b.kinds));
    const sig = P.plan.signature_shot || beats.some((b) => b.signature_shot);
    const why = [];
    if (!kinds.size) why.push("no beat names a camera");
    if (!sig) why.push("no signature_shot");
    measured.camera_plan = { kinds: [...kinds], beats: named };
    if (why.length) add({ check: "camera-monotone", severity: "warning", at: null, region: "plan", message: `the score's camera: ${why.join("; ")}`, fix: 'name each beat\'s camera (locked where the UI or type moves; a push toward what the beat buys; a pull-out for scale) and one "signature_shot": { "beat", "move", "why" } on the peak (references/craft.md "Camera from meaning")' });
  }
  if (video && camera && fs.existsSync(path.resolve(video))) {
    try {
      const c = await measureCamera(path.resolve(video), { beats: beats.length ? beats : null });
      const floor = cameraFloor(c.duration_s);
      measured.camera = { kinds: c.kinds, moving_kinds: c.moving_kinds, need: floor, beats: c.beats.map((b) => ({ id: b.id, start: b.start, end: b.end, camera: b.camera, declared: (beats.find((x) => x.id === b.id) || {}).camera || null })), moves: c.moves.slice(0, 40), signature: c.signature };
      if (stillness) skipped.push(`camera-monotone: a stillness style (${c.moving_kinds} moving kind${c.moving_kinds === 1 ? "" : "s"} measured)`);
      else if (c.moving_kinds < floor) add({ check: "camera-monotone", severity: "warning", at: null, region: "whole film", message: `the camera ${c.moving_kinds ? `moves one way only (${c.kinds.filter((k) => k !== "locked").join(", ")})` : "never moves"} over ${c.duration_s} s: ${floor} moving kind${floor === 1 ? "" : "s"} at least (measured per beat: ${c.beats.map((b) => `${b.id} ${b.camera}`).join(", ")})`, fix: "give the film a camera: a push-in toward what matters, a pull-out that reveals, a truck or tilt that follows, and one signature shot (a whip, a crash zoom, an orbit) at the biggest hinge; locked shots stay where the UI itself moves" });
    } catch (err) { skipped.push(`camera: ${err.message} (not measured, never passed)`); }
  } else if (video && !camera) skipped.push("camera: skipped (--no-camera)");

  // ---- the ending: the last beat is not a quarter of the film
  if (beats.length >= 2) {
    const total = measured.duration_s || P.duration, last = beats[beats.length - 1];
    if (total > 0 && last.start < total) {
      const share = (total - last.start) / total;
      measured.ending_share = r2(share);
      if (share > endingMax + 1e-6) add({ check: "long-ending", severity: "warning", at: r2(last.start), region: `beat ${last.id}`, message: `the last beat (${last.id}) runs ${r2(total - last.start)} s, ${Math.round(share * 100)}% of the ${r2(total)} s film (${Math.round(endingMax * 100)}% at most)`, fix: "the end card is 2 to 3 s: land the call to action and stop; give the story's weight to the beats before it" });
    }
  }

  // ---- emphasis: does the weight land where the intent puts it? (lib/emphasis.mjs; warnings)
  if (emphasis && (video || P.plan)) {
    try {
      const intent = await loadIntent({ plan, project });
      const er = await emphasisReport({ video: video && fs.existsSync(path.resolve(video)) ? path.resolve(video) : null, intent, planBeats: beats, score: P.plan, dur: measured.duration_s || P.duration });
      for (const f of er.findings) add(f);
      skipped.push(...er.skipped);
      measured.emphasis = { intent: er.intent, planned_peak: er.planned, measured_peak: er.measured, second: er.second, budget: er.budget ? { big_moments: er.budget.count, limit: er.budget.limit, moments: er.budget.moments } : null, curve: er.curve ? { step_s: er.curve.step, values: er.curve.curve } : null };
    } catch (e) { skipped.push(`emphasis: ${e.message} (not measured, never passed)`); }
  } else if (!emphasis) skipped.push("emphasis: skipped (--no-emphasis)");

  // ---- picture guards (lib/frame-guards.mjs; warnings, uncalibrated): the white flash cap, a seam that never blanks, the hold frame against the approved board
  if (guards && video && fs.existsSync(path.resolve(video))) {
    try {
      const vp = path.resolve(video), dur = measured.duration_s || P.duration || 0;
      for (const f of whiteFlashes(vp)) add({ check: "flash-over-cap", severity: "warning", at: f.t, region: "flash", message: `a flash at ${f.t} s covers ${Math.round(f.share * 100)}% of the frame in near-white for ${f.n} frame(s); over ~60% it reads as a blank frame`, fix: "cap the flash layer's opacity at ~0.6 (or tint it with the ground colour) so the picture stays faintly visible; hold 1-2 frames" });
      const sms = (P.seams || []).map((sm, k) => ({ ...sm, t: Number.isFinite(Number(sm.t)) ? Number(sm.t) : (beats[Number(sm.to) - 1] || beats[k + 1] || {}).start, dur: Number(sm.dur) || Number(sm.duration) || 0, from: sm.from, to: sm.to })).filter((sm) => Number.isFinite(sm.t) && (!dur || sm.t < dur - 0.2));
      const rows = sms.length ? sms : seamTimes.map((t, k) => ({ t, from: beats[k].id, to: beats[k + 1].id }));
      for (const f of seamBlanks(vp, rows)) add({ check: "seam-blank", severity: "warning", at: f.t, region: `seam ${f.seam}`, message: `the seam at ${f.t} s goes ${f.kind} (${Math.round(f.pct * 100)}%) mid-transition`, fix: 'add the missing layer (ground, outgoing scene held under, incoming scene arriving) so the transition never shows an empty or flooded frame; a short deliberate flood (a flash within the cap, a dip to the ground colour) opts out with data-seam="flood" on the transition (flood: true on the score seam)' });
      if (plan && beats.length) {
        const run = path.dirname(path.dirname(path.resolve(plan))), dev = new Set((Array.isArray(P.plan && P.plan.deviations) ? P.plan.deviations : []).map((d) => String((d && (d.beat ?? d.scene ?? d.id)) ?? d)));
        const pad = (x) => String(x).padStart(2, "0"), items = [];
        for (const b of beats) {
          if (dev.has(String(b.id)) || dev.has(String(b.n))) continue;
          const still = [b.id, pad(b.id), b.n, pad(b.n)].map((k) => path.join(run, "frames", `${k}.png`)).find((p) => fs.existsSync(p));
          if (!still) continue;
          const t = b.peak_t != null ? (b.peak_t >= b.start - 1e-6 && b.peak_t <= b.end + 1e-6 ? b.peak_t : b.start + b.peak_t) : b.end - 0.125 * (b.end - b.start);
          items.push({ id: b.id, t, still });
        }
        for (const f of holdDrift(vp, items)) add({ check: "hold-frame-drift", severity: "warning", at: f.t, region: `beat ${f.id}`, message: `beat "${f.id}" settles on a frame unlike its approved styleframe (hash distance ${f.hamming}/64, ssim ${f.ssim})`, fix: "the Final must look like the board the user approved: re-check palette, layout and type size against the styleframe, or record the change as a deviation in the score" });
      }
    } catch (e) { skipped.push(`guards: ${e.message} (not measured, never passed)`); }
  } else if (!guards) skipped.push("guards: skipped (--no-guards)");

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
        const tf = await textFit(pj, { heroIds: beats.map((b) => b.hero_id).filter(Boolean) });
        findings.push(...tf.findings);
        findings.push(...(tf.warnings || []));
        for (const e of tf.script_errors || []) findings.push({ check: "script-error", severity: "error", at: null, region: e.file, file: e.file, message: `${e.file}: ${e.message}`, fix: "the render will not play this composition: fix the script error (a selector that is not valid, a typo, a missing asset) so the timeline registers; run the page in a browser console to read the full stack" });
        skipped.push(...tf.skipped, ...tf.could_not_run.map((c) => `${c} (not measured, never passed)`));
        measured.text_fit = { pages: tf.pages, samples: tf.samples, script_errors: (tf.script_errors || []).length, cropped: tf.findings.filter((f) => f.check === "text-cropped").length, too_brief: tf.findings.filter((f) => f.check === "text-too-brief").length, overlap: tf.findings.filter((f) => f.check === "text-overlap").length, warnings: (tf.warnings || []).length };
        // caption duplicates and see-and-say (warnings, uncalibrated; lib/textfit.mjs)
        findings.push(...captionDupes(tf.texts || []));
        const voFile = vo ? path.resolve(vo) : [path.join(pj, "audio_meta.json")].find((p) => fs.existsSync(p));
        const words = voFile ? loadVoWords(voFile, beats) : null;
        if (words && words.length) {
          const evs = [];
          for (const b of beats) {
            evs.push({ t: b.start, what: `beat ${b.id} starts` });
            for (const e of b.events || []) { const t = Number(e.t ?? e.at); if (Number.isFinite(t)) evs.push({ t: t <= b.end - b.start + 0.05 ? b.start + t : t, what: String(e.what || e.sound || "event").slice(0, 30) }); }
          }
          const cues = cuesOf(words);
          findings.push(...seeAndSay(cues, evs, tf.texts || [], words));
          measured.see_and_say = { cues: cues.length, events: evs.length, texts: (tf.texts || []).length };
        } else if (vo) skipped.push(`see-and-say: no word times in ${vo}`);
        else skipped.push("see-and-say: no VO word times (give --vo <audio_meta.json|words.json>; a silent film has no cues)");
      } else skipped.push("text-fit: skipped (--no-text-fit)");
    }
  }

  const errors = findings.filter((f) => f.severity === "error");
  const ok = !errors.length && !could.length;
  return { ok, verdict: errors.length ? "fail" : could.length ? "could not run" : "pass", measured, findings, notes, skipped, could_not_run: could };
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) await main();
