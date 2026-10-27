#!/usr/bin/env node
// 2D characters for RasanAI scenes (Rasan2D): install the runtime, start a scene, look at it, and gate it.
//
//   node stage2d.mjs install  --project videos/<name>            copies Rasan2D into <project>/assets/rasan2d/
//   node stage2d.mjs scaffold --project videos/<name> --frame <frame_id> --duration <s> [--width 1920 --height 1080] [--seed 7]
//                             [--canon <identity.json>] [--sequence <sequence.json>] [--canvas "#f1e7d2" --ink "#302921" --accent "#c97057"]
//                             [--standalone] [--out <file>] [--force]
//   node stage2d.mjs stills   --file <composition.html> --at 0,1,2.5,3.8 --out <dir>
//   node stage2d.mjs check    --project videos/<name> [--file <composition.html>] [--run <run>] [--score <motion/score.json>] [--json]
//   node stage2d.mjs canon    --file <identity.json> | --run <run> [--score <motion/score.json>] [--json]     validate an actor's identity (and the score's cast link)
//   node stage2d.mjs sheet    --canon <identity.json> --kind views|emotions|turn --out <png> [--page 0|1]    the model sheet, the emotion contact sheets, the turn
//   node stage2d.mjs strips   [--sequence <sequence.json>] [--canon <identity.json>] --out <png> [--cols 4]  contact strips at the action extremes
//   node stage2d.mjs film     [--sequence <sequence.json>] [--canon <identity.json>] --out <dir> [--workers 3] [--fps 30] [--no-mp4]
//                             the mandatory test film (default: stage2d/fixtures/demo-sequence.json, 15 s, one original actor): model sheet, emotion sheets,
//                             turn, action-extreme strips and an MP4 (headless Chrome frames in parallel + ffmpeg) into <dir>
//
// check loads every composition that uses Rasan2D in a real browser and gates it: it builds and draws, it isn't blank, the same time renders
// the same pixels after seeking elsewhere (A-B-A, including the 12 Hz line boil), the boil is seeded per actor and per part, every actor's
// canon is valid and its fixed traits are drawn in every shot, actors stay in frame, poses stay in bounds, planted feet do not slide, and
// nothing in the code breaks determinism (Math.random, the wall clock, a free-running loop, remote assets) or the installed runtime is missing.
// Exit 0 = clean (warnings allowed), 2 = violations, 1 = could not run.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, die } from "./lib/common.mjs";
import { install, scaffoldText, stills, checkProject, projectRootOf, validate2d, readSequence, renderSheet, renderStrips, renderFrames, encodeMp4, haveFfmpeg, FIXTURES, runtimeVersion, usesRasan2d } from "./lib/stage2d.mjs";
import { validateCast, loadIdentity } from "./lib/canon.mjs";
import { traitsFor2d } from "./lib/stage2d.mjs";
import { track } from "./lib/report.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";

process.env.RASANAI_GL = process.env.RASANAI_GL || "cpu"; // software rendering: the same pixels on every run

const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const exists = (p) => !!p && fs.existsSync(p);
const str = (v) => (v && v !== true ? String(v) : "");
const rel = (p) => path.relative(process.cwd(), p);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

if (cmd === "install") {
  const root = str(args.project) || str(args.dest);
  if (!root) die("--project <videos/name> or --dest <dir> required");
  if (!exists(path.resolve(root))) die(`not found: ${root}`);
  out({ ok: true, ...install(path.resolve(root)), use: "inside the scene's <template>, after GSAP: assets/rasan2d/brush.js, character.js, gestures.js, rasan2d.js (scaffold writes them)" });
} else if (cmd === "scaffold") {
  const frame = str(args.frame) || die("--frame <frame_id> required (the composition id, e.g. 02-actor)");
  const duration = Number(args.duration) || die("--duration <seconds> required");
  const width = Number(args.width) || 1920, height = Number(args.height) || 1080, seed = Number.isFinite(Number(args.seed)) && args.seed != null && args.seed !== true ? Number(args.seed) | 0 : 7;
  const project = str(args.project) ? path.resolve(str(args.project)) : null;
  const standalone = !!args.standalone;
  const file = str(args.out) ? path.resolve(str(args.out)) : project ? path.join(project, "compositions", "frames", `${frame}.html`) : die("--project or --out required");
  if (exists(file) && !args.force) die(`${file} exists (pass --force to overwrite it)`);
  let canons = null;
  if (str(args.canon)) {
    const id = loadIdentity(path.resolve(str(args.canon)));
    const v = validate2d(id, path.dirname(path.resolve(str(args.canon))));
    if (!v.ok) die(`canon is not valid:\n${v.errors.map((e) => `  ${e.rule}: ${e.message}`).join("\n")}`);
    canons = { [id.id]: id };
  }
  const sequence = str(args.sequence) ? readSequence(path.resolve(str(args.sequence))) : null;
  const text = scaffoldText({ frame, duration, width, height, standalone, canvas: str(args.canvas) || "#f1e7d2", ink: str(args.ink) || "#302921", accent: str(args.accent) || "#c97057", seed, canons, sequence });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  const inst = install(project || projectRootOf(file));
  out({ ok: true, file: rel(file), runtime: rel(inst.dir), seed, next: "Edit SEQUENCE in the scene: the shots, the set, the props and the actions (a cause, then its reaction). stage2d.mjs stills to look at it, then stage2d.mjs check." });
} else if (cmd === "stills") {
  const file = path.resolve(str(args.file) || die("--file <composition.html> required"));
  if (!exists(file)) die(`not found: ${file}`);
  const times = str(args.at).split(",").map(Number).filter((x) => x >= 0);
  if (!times.length) die("--at t1,t2,... required");
  const dir = path.resolve(str(args.out) || die("--out <dir> required"));
  track("Rendering the 2D scene's frames", "2D frames rendered");
  const r = await stills(file, times, dir);
  const errs = (r.info.stages || []).filter((s) => s.error).map((s) => `${s.id}: ${s.error}`).concat(r.info.errors || []);
  out({ ok: !errs.length, frames: r.files.map((f) => rel(f.png)), errors: errs, console: r.logs.slice(0, 8) }, errs.length ? 2 : 0);
} else if (cmd === "check") {
  const project = path.resolve(str(args.project) || ".");
  if (!exists(project)) die(`project not found: ${project}`);
  track("Checking the 2D scenes: seek-safe, seeded, canon, in frame, feet planted", "2D check done");
  const report = await checkProject(project, { file: str(args.file) || null, run: str(args.run) || null, score: str(args.score) ? path.resolve(str(args.score)) : null });
  if (report.status === "no-2d") out({ ok: true, ...report }, 0);
  for (const c of report.could_not_run) noteDowngrade({ run: args.run, what: "the 2D check", instead: "no 2D check", why: String(c).slice(0, 200), impact: "the 2D scenes were not verified" });
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`stage2d: ${report.status}: ${report.files.length} 2D composition(s); ${report.errors} error(s), ${report.warnings} warning(s)`);
    for (const f of report.files) for (const s of f.stages) console.log(`  ${f.file} [${s.id}] seek-safe=${s.deterministic} frame ~ ${s.frame_ms} ms, ${s.shots} shot(s), boil ${s.boil_hz} Hz seed ${s.seed}`);
    for (const f of report.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.rule} ${f.file}${f.stage ? ` [${f.stage}]` : ""}${f.actor ? ` ${f.actor}` : ""}${f.at ? ` @${f.at}` : ""}\n      ${f.message}\n      fix: ${f.fix}`);
    for (const c of report.could_not_run) console.log(`  [COULD NOT RUN] ${c}`);
  }
  process.exit(report.could_not_run.length ? 1 : report.errors ? 2 : 0);
} else if (cmd === "canon") {
  const rows = [];
  let ok = true;
  if (str(args.file)) {
    const f = path.resolve(str(args.file));
    let idn;
    try { idn = loadIdentity(f); } catch (e) { out({ ok: false, error: e.message }, 2); }
    const v = validate2d(idn, path.dirname(f));
    rows.push({ file: rel(f), id: idn.id, ...v });
    ok = v.ok;
  } else if (str(args.run)) {
    const run = path.resolve(str(args.run)), sf = str(args.score) ? path.resolve(str(args.score)) : path.join(run, "motion", "score.json");
    if (!exists(sf)) out({ ok: false, error: `no score at ${sf}` }, 2);
    const v = validateCast(readJSON(sf), run, { medium: "painted-2d", traits: traitsFor2d });
    for (const r of v.rows) rows.push({ id: r.id, canon: r.canon, ok: !r.errors.length, errors: r.errors, warnings: r.warnings });
    ok = v.ok;
    if (!v.characters) out({ ok: true, status: "no-characters", message: "score.cast has no character" }, 0);
  } else die("--file <identity.json> or --run <run> required");
  if (args.json || true) console.log(JSON.stringify({ ok, rows }, null, 2));
  process.exit(ok ? 0 : 2);
} else if (cmd === "sheet") {
  const canonFile = path.resolve(str(args.canon) || path.join(FIXTURES, "original-actor.json"));
  const o = path.resolve(str(args.out) || die("--out <png> required"));
  const kind = str(args.kind) || "views";
  if (!["views", "emotions", "turn"].includes(kind)) die("--kind must be views, emotions or turn");
  const idn = loadIdentity(canonFile);
  const v = validate2d(idn, path.dirname(canonFile));
  if (!v.ok) die(`canon is not valid:\n${v.errors.map((e) => `  ${e.rule}: ${e.message}`).join("\n")}`);
  track("Drawing the model sheet from the runtime", "Model sheet drawn");
  const r = await renderSheet(kind, idn, o, { page: Number(args.page) || 0, seed: Number(args.seed) || 7 });
  out({ ok: true, png: rel(r.png), kind });
} else if (cmd === "strips") {
  const seqFile = path.resolve(str(args.sequence) || path.join(FIXTURES, "demo-sequence.json"));
  const canonFile = path.resolve(str(args.canon) || path.join(FIXTURES, "original-actor.json"));
  const o = path.resolve(str(args.out) || die("--out <png> required"));
  const seq = readSequence(seqFile), idn = loadIdentity(canonFile);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "r2strips-"));
  try {
    const r = await renderStrips(work, seq, { [idn.id]: idn }, o, { cols: Number(args.cols) || 4, cellW: Number(args.cell) || 480 });
    out({ ok: true, png: rel(r.png), extremes: r.extremes.length, labels: r.extremes.map((e) => `${e.t}s ${e.label}`) });
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
} else if (cmd === "film") {
  const seqFile = path.resolve(str(args.sequence) || path.join(FIXTURES, "demo-sequence.json"));
  const canonFile = path.resolve(str(args.canon) || path.join(FIXTURES, "original-actor.json"));
  const dir = path.resolve(str(args.out) || die("--out <dir> required"));
  const seq = readSequence(seqFile), idn = loadIdentity(canonFile), fps = Number(args.fps) || seq.fps || 30;
  const v = validate2d(idn, path.dirname(canonFile));
  if (!v.ok) die(`canon is not valid:\n${v.errors.map((e) => `  ${e.rule}: ${e.message}`).join("\n")}`);
  fs.mkdirSync(dir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "r2film-"));
  const res = { ok: true, dir: rel(dir), files: {} };
  try {
    track("Painting the 15-second test film", "Test film painted");
    const sheetFile = (k, f, page) => renderSheet(k, idn, path.join(dir, f), { page, seed: seq.seed || 7 }).then((r) => { res.files[f] = rel(r.png); });
    await sheetFile("views", "model-sheet.png", 0);
    await sheetFile("emotions", "emotions-1.png", 0);
    await sheetFile("emotions", "emotions-2.png", 1);
    await sheetFile("turn", "turn.png", 0);
    const st = await renderStrips(work, seq, { [idn.id]: idn }, path.join(dir, "action-extremes.png"), { cols: 4, cellW: 480 });
    res.files["action-extremes.png"] = rel(st.png); res.extremes = st.extremes.map((e) => `${e.t}s ${e.label}`);
    if (args["no-mp4"]) { res.mp4 = "skipped (--no-mp4)"; }
    else if (!haveFfmpeg()) { res.mp4 = "not run: ffmpeg is not installed"; noteDowngrade({ run: args.run, what: "the test film's MP4", instead: "frames only", why: "ffmpeg is not installed", impact: "no video file was made" }); }
    else {
      const fr = await renderFrames({ project: work, sequence: seq, canons: { [idn.id]: idn }, outDir: path.join(work, "frames"), fps, workers: Math.max(1, Number(args.workers) || 3) });
      const enc = encodeMp4(path.join(work, "frames"), path.join(dir, `${seq.id || "film"}.mp4`), fps);
      if (!enc.ok) { res.ok = false; res.mp4 = `failed: ${enc.error}`; }
      else { res.mp4 = rel(path.join(dir, `${seq.id || "film"}.mp4`)); res.frames = fr.frames; }
      if (fr.logs.length) res.console = fr.logs.slice(0, 5);
    }
    out(res, res.ok ? 0 : 2);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
} else {
  die("usage: stage2d.mjs install|scaffold|stills|check|canon|sheet|strips|film ... (see the header)");
}
