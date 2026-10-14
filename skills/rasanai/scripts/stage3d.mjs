#!/usr/bin/env node
// 3D for RasanAI scenes: install the runtime, start a scene, look at it, and gate it.
//
//   node stage3d.mjs install  --project videos/<name>            copies Rasan3D + three.js into <project>/assets/three/
//   node stage3d.mjs install  --dest "$RUN/frames"               (the same, for key frames drawn in 3D)
//   node stage3d.mjs scaffold --project videos/<name> --frame <frame_id> --duration <s> [--width 1920 --height 1080]
//                             [--canvas "#0b0b0d" --ink "#f2f2f2" --accent "#ff4d12"] [--standalone] [--out <file>] [--force]
//   node stage3d.mjs stills   --file <composition.html> --at 0.5,2,3.4 --out <dir> [--quality final|draft]
//   node stage3d.mjs check    --project videos/<name> [--file <composition.html>] [--motion <motion.md>] [--json]
//
// check loads every composition that uses Rasan3D in a real browser and gates it: it builds and draws
// without errors, it isn't blank, the same time renders the same pixels (seek-safe), every 3D track eases
// on motion.md's eases (no implicit or linear drift), fast moves have motion blur, the world comes to rest
// at least once, the frame cost fits a render, and nothing in the code breaks determinism or the shared
// renderer (Math.random, the wall clock, a second WebGLRenderer, remote assets, OrbitControls, normal-colour
// placeholder materials). Exit 0 = clean (warnings allowed), 2 = violations, 1 = could not run.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, readFrontmatterDoc, SKILL_DIR } from "./lib/common.mjs";
import { STAGE, install, projectRootOf, stills, checkFile, collect, uses3d } from "./lib/stage3d.mjs";
import { track } from "./lib/report.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";

const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const exists = (p) => !!p && fs.existsSync(p);
const str = (v) => (v && v !== true ? String(v) : "");
// ------------------------------------------------------------------ scaffold
function scaffold(o) {
  const tplFile = path.join(STAGE, "templates", o.standalone ? "standalone-3d.html" : "scene-3d.html");
  let t = fs.readFileSync(tplFile, "utf8");
  const vars = { FRAME_ID: o.frame, W: o.width, H: o.height, DURATION: o.duration, CANVAS: o.canvas, INK: o.ink, ACCENT: o.accent, ASPECT: (o.width / o.height).toFixed(4) };
  t = t.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return t;
}

// ------------------------------------------------------------------ commands
if (cmd === "install") {
  const root = str(args.project) || str(args.dest);
  if (!root) die("--project <videos/name> or --dest <dir> required");
  if (!exists(path.resolve(root))) die(`not found: ${root}`);
  out({ ok: true, ...install(path.resolve(root)), use: 'inside the scene\'s <template>, after GSAP: <script src="assets/three/rasan3d.js"></script>' });
} else if (cmd === "scaffold") {
  const frame = str(args.frame) || die("--frame <frame_id> required (the composition id, e.g. 04-reveal)");
  const duration = Number(args.duration) || die("--duration <seconds> required");
  const width = Number(args.width) || 1920, height = Number(args.height) || 1080;
  const project = str(args.project) ? path.resolve(str(args.project)) : null;
  const standalone = !!args.standalone;
  const file = str(args.out) ? path.resolve(str(args.out)) : project ? path.join(project, "compositions", "frames", `${frame}.html`) : die("--project or --out required");
  if (exists(file) && !args.force) die(`${file} exists (pass --force to overwrite it)`);
  const text = scaffold({ frame, duration, width, height, standalone, canvas: str(args.canvas) || "#0b0b0d", ink: str(args.ink) || "#f2f2f2", accent: str(args.accent) || "#ff4d12" });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  const inst = install(project || projectRootOf(file));
  out({ ok: true, file: path.relative(process.cwd(), file), runtime: path.relative(process.cwd(), inst.dir), next: "Replace the placeholder world in build() and pose() with the score's shots; then stage3d.mjs stills to look at it, and stage3d.mjs check." });
} else if (cmd === "stills") {
  const file = path.resolve(str(args.file) || die("--file <composition.html> required"));
  if (!exists(file)) die(`not found: ${file}`);
  const times = str(args.at).split(",").map(Number).filter((x) => x >= 0);
  if (!times.length) die("--at t1,t2,… required");
  const dir = path.resolve(str(args.out) || die("--out <dir> required"));
  track("Rendering the 3D scene's frames", "3D frames rendered");
  const r = await stills(file, times, dir, str(args.quality) || "final");
  const errs = (r.ready.stages || []).filter((s) => s.error);
  out({ ok: !errs.length, frames: r.files.map((f) => path.relative(process.cwd(), f.png)), errors: errs.map((s) => `${s.id}: ${s.error}`), console: r.logs.slice(0, 8) }, errs.length ? 2 : 0);
} else if (cmd === "check") {
  const project = path.resolve(str(args.project) || ".");
  if (!exists(project)) die(`project not found: ${project}`);
  const motionPath = path.resolve(str(args.motion) || path.join(project, "motion.md"));
  let M = null;
  if (exists(motionPath)) {
    try { M = readFrontmatterDoc(fs.readFileSync(motionPath, "utf8")).fields; } catch (e) { die(`cannot read ${motionPath}: ${e.message}`); }
  }
  const files = str(args.file) ? [path.resolve(str(args.file))] : collect(project).filter(uses3d);
  track("Checking the 3D scenes: seek-safe, lit, eased, blurred where they move", "3D check done");
  if (!files.length) out({ ok: true, status: "no-3d", files: 0, message: "no composition uses Rasan3D" });
  const report = { project, motion: exists(motionPath) ? motionPath : null, files: [], errors: 0, warnings: 0 };
  const findings = [], couldNot = [];
  for (const f of files) {
    const r = await checkFile(f, project, M, "check");
    report.files.push({ file: path.relative(project, f), stages: r.stages.map((s) => ({ id: s.id, deterministic: s.deterministic, frame_ms: s.cost.ms, samples: s.cost.samples, busiest: s.busiest })) });
    if (r.couldNotRun) couldNot.push(`${path.relative(project, f)}: ${r.couldNotRun}`);
    for (const x of r.findings) {
      findings.push(x);
      if (x.severity === "error") report.errors++;
      else if (x.severity === "warning") report.warnings++;
    }
  }
  report.could_not_run = couldNot;
  for (const c of couldNot) noteDowngrade({ run: args.run, what: "the 3D check", instead: "no 3D check", why: String(c).slice(0, 200), impact: "the 3D scenes were not verified" });
  report.status = couldNot.length ? "could-not-run" : report.errors ? "violations" : "clean";
  if (args.json) console.log(JSON.stringify({ ...report, findings }, null, 2));
  else {
    console.log(`stage3d: ${report.status}: ${files.length} 3D composition(s); ${report.errors} error(s), ${report.warnings} warning(s)`);
    for (const f of report.files) for (const s of f.stages) console.log(`  ${f.file} [${s.id}] seek-safe=${s.deterministic} final frame ≈ ${s.frame_ms} ms (${s.samples} samples) busiest at ${s.busiest.t}s (${s.busiest.px} px/frame)`);
    for (const f of findings) console.log(`  [${f.severity.toUpperCase()}] ${f.rule} ${f.file}${f.stage ? ` [${f.stage}]` : ""}${f.track ? ` ${f.track}` : ""}${f.at ? ` @${f.at}` : ""}\n      ${f.message}\n      fix: ${f.fix}`);
    for (const c of couldNot) console.log(`  [COULD NOT RUN] ${c}`);
  }
  process.exit(couldNot.length ? 1 : report.errors ? 2 : 0);
} else {
  die("usage: stage3d.mjs install|scaffold|stills|check … (see the header)");
}
