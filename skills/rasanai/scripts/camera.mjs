#!/usr/bin/env node
// The camera kit: RasanCamera (a 3D world rig from a focal length, camera legs, depth of field by distance with rack
// focus, contact shadows, a shadow ladder, glass, rim light, a light comet, key light, a living ground, blur trails,
// grain, halation, chromatic split, sheen, burst) for paused GSAP timelines and for stills. references/cinematography.md
//
//   node camera.mjs install --project videos/<name>     copies the runtime into <project>/assets/rasan-camera/ (and the
//                                                        GSAP plugins bundle into assets/vendor/ when it is vendored)
//   node camera.mjs demo    --out <dir> [--times 0.35,1.2,...] [--gpu]
//                                   renders the demo film (four shots: Kinso, Google, Sovra, a depth stack) headlessly:
//                                   one PNG per time, a contact strip (strip.png) and a report. Every animated function
//                                   must change the frame over time; every function must be identical when the same time
//                                   is seeked again (reverse order, same browser) and the frames must be byte-identical
//                                   across two separate browser launches (the double render). Exit 2 when not.
//                                   Software GL by default (deterministic); --gpu uses the Mac's GPU.
//   node camera.mjs check   --project videos/<name> [--json]
//                                   a composition that calls RasanCamera has the runtime installed and loaded after GSAP,
//                                   passes its paused timeline to stage(), no Math.random / wall clock, and keeps the
//                                   budgeted extras (chromaticSplit, halation/bloom, lightComet, burst, plateTransition) within 3 each.
//                                   Exit 0 = clean, 2 = violations.
//                                   Two more WARNINGS (uncalibrated; idea from awesome-opus5-5-videos, our code), a static scan of every
//                                   cam.keys([[t, zoom, x, y], ...]) call whose rows are plain numbers (x, y in px from the frame centre;
//                                   the frame is the composition's data-width / data-height, else 1920 x 1080):
//                                   zoom-into-point   a key past 4x whose point sits more than 15% of the frame (width for x, height for y)
//                                                     off centre: a push into an off-centre point reads as a crop, open it as an iris instead
//                                   zoom-in-out       a zoom in (a key at least 15% above the one before) followed by a zoom back out (the next
//                                                     key at least 15% below) within 1.5 s: it breathes in and out, pick one direction per scene
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die } from "./lib/common.mjs";
import { installCamera, installPlugins, cameraFiles, projectFiles, cameraVersion } from "./lib/camera.mjs";
import { serve } from "./lib/stage3d.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const str = (v) => (v && v !== true ? String(v) : "");
export const BUDGET_MAX = 3;
const BUDGETED = ["chromaticSplit", "halation", "bloom", "lightComet", "burst", "plateTransition"];

// ------------------------------------------------------------------ demo
const TIMES = [0.35, 1.2, 2.6, 3.35, 4.3, 5.7, 6.55, 7.6, 9.0, 9.8, 11.0, 12.12];

async function renderPass(url, times, { keepDir = null, features = false } = {}) {
  const { launch } = await import("./lib/cdp.mjs");
  const b = await launch({ width: 1920, height: 1080, timeoutMs: 180000 });
  const res = { shots: [], sigs: [], errors: [], budget: null, keys: [] };
  try {
    await b.open(url);
    await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){ return true; }) : true", { await: true });
    const settle = () => b.eval("new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(function(){ setTimeout(function(){ r(true); }, 60); }); }); })", { await: true });
    if (features) res.keys = await b.eval("Object.keys(window.__features)");
    const keys = features ? res.keys : [];
    const order = features === "reverse" ? [...times].map((t, i) => [t, i]).reverse() : times.map((t, i) => [t, i]);
    const shots = new Array(times.length), sigs = new Array(times.length);
    for (const [t, i] of order) {
      await b.eval("window.__seek(5.1)"); // seek away first: every frame is reached from somewhere else
      await b.eval(`window.__seek(${t})`);
      await settle();
      const s = {};
      for (const k of keys) s[k] = await b.eval(`window.__sig(${JSON.stringify(k)})`);
      sigs[i] = s;
      const png = await b.screenshot();
      shots[i] = png;
      if (keepDir) fs.writeFileSync(path.join(keepDir, `t${t.toFixed(2)}.png`), png);
    }
    res.shots = shots; res.sigs = sigs;
    res.budget = await b.eval("window.__budget()");
    res.errors = b.logs.slice(0, 10);
  } finally { await b.close(); }
  return res;
}

function psnr(dir, a, b) {
  const fa = path.join(dir, ".psnr-a.png"), fb = path.join(dir, ".psnr-b.png");
  fs.writeFileSync(fa, a); fs.writeFileSync(fb, b);
  const r = spawnSync("ffmpeg", ["-v", "info", "-i", fa, "-i", fb, "-lavfi", "psnr", "-f", "null", "-"], { encoding: "utf8" });
  try { fs.unlinkSync(fa); fs.unlinkSync(fb); } catch {}
  const m = /average:(inf|[0-9.]+)/.exec(r.stderr || "");
  return m ? (m[1] === "inf" ? Infinity : Number(m[1])) : null;
}

async function demo(dir, times) {
  fs.mkdirSync(dir, { recursive: true });
  installCamera(dir);
  fs.copyFileSync(path.join(HERE, "lib", "camera-demo.html"), path.join(dir, "demo.html"));
  if (!args.gpu && !process.env.RASANAI_GL) process.env.RASANAI_GL = "cpu";
  const srv = await serve(dir);
  const report = { ok: true, version: cameraVersion(), gl: process.env.RASANAI_GL || "default", times, features: [], errors: [] };
  const t0 = Date.now();
  try {
    const url = `${srv.url}/demo.html`;
    const first = await renderPass(url, times, { keepDir: dir, features: true });
    const second = await renderPass(url, times, { features: "reverse" });
    const third = await renderPass(url, times, {}); // a separate launch, forward order: the double render
    for (const k of first.keys) {
      const a = first.sigs.map((s) => s[k]), distinct = new Set(a).size;
      const same = a.every((x, i) => x === second.sigs[i][k]);
      report.features.push({ id: k, distinct_states: distinct, changes: distinct > 1, seek_identical: same, present: a.every((x) => x && x !== "missing"), ...(same ? {} : { mismatch_at: times.filter((_, i) => a[i] !== second.sigs[i][k]) }) });
    }
    // the static functions (glass, the shadow ladder, haze at a fixed distance) need not change over time
    const STATIC = new Set(["haze", "shadowLadder", "glass"]);
    report.byte_identical_seek = first.shots.every((p, i) => p.equals(second.shots[i]));
    report.byte_identical_double_render = first.shots.every((p, i) => p.equals(third.shots[i]));
    if (!report.byte_identical_double_render) {
      report.double_render_psnr_min = Math.min(...first.shots.map((p, i) => (p.equals(third.shots[i]) ? Infinity : psnr(dir, p, third.shots[i]) ?? 0)));
    }
    const diffAt = (other) => times.filter((_, i) => !first.shots[i].equals(other.shots[i]));
    if (!report.byte_identical_seek) report.seek_mismatch_at = diffAt(second);
    if (!report.byte_identical_double_render) report.double_render_mismatch_at = diffAt(third);
    report.frames_differ = first.shots.every((p, i) => i === 0 || !p.equals(first.shots[i - 1]));
    report.budget = first.budget;
    report.errors = [...first.errors, ...second.errors, ...third.errors].slice(0, 10);
    report.frames = times.map((t) => path.relative(process.cwd(), path.join(dir, `t${t.toFixed(2)}.png`)));
    const files = report.frames.map((f) => path.resolve(f));
    const strip = path.join(dir, "strip.png"), cols = 3, cw = 640, chh = 360;
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...files.flatMap((f) => ["-i", f]), "-filter_complex", files.map((_, i) => `[${i}:v]scale=${cw}:${chh}[s${i}]`).join(";") + ";" + files.map((_, i) => `[s${i}]`).join("") + `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * cw}_${Math.floor(i / cols) * chh}`).join("|")}[o]`, "-map", "[o]", "-frames:v", "1", strip], { encoding: "utf8" });
    report.strip = r.status === 0 ? path.relative(process.cwd(), strip) : null;
    if (r.status !== 0) report.strip_note = "ffmpeg not available; the frames are in " + path.relative(process.cwd(), dir);
    const bad = report.features.filter((f) => !f.present || !f.seek_identical || (!STATIC.has(f.id) && !f.changes));
    report.ok = !bad.length && report.byte_identical_seek && report.byte_identical_double_render && report.frames_differ && !report.errors.length;
    if (bad.length) report.failing = bad.map((f) => `${f.id}: ${!f.present ? "not drawn" : !f.seek_identical ? "not identical on a second seek" : "does not change over time"}`);
    report.seconds = Math.round((Date.now() - t0) / 100) / 10;
  } finally { await srv.close(); }
  return report;
}

// ------------------------------------------------------------------ check
// every cam.keys([[t, zoom, x, y], ...]) call with all-number rows: zoom-into-point and zoom-in-out (warnings)
export const ZOOM_POINT = { zoom: 4, off: 0.15 }, ZOOM_INOUT = { change: 1.15, within_s: 1.5 };
export function zoomKeyFindings(code) {
  const out = [];
  const Wd = Number((code.match(/data-width="(\d+)"/) || [])[1]) || 1920, Hd = Number((code.match(/data-height="(\d+)"/) || [])[1]) || 1080;
  const re = /\.keys\s*\(\s*\[/g;
  let m;
  while ((m = re.exec(code))) {
    // the array literal, by bracket balance
    let i = re.lastIndex - 1, d = 0, j = i;
    for (; j < code.length; j++) { if (code[j] === "[") d++; else if (code[j] === "]" && !--d) break; }
    if (d) continue;
    const num = "(-?\\d*\\.?\\d+)";
    const row = new RegExp(`\\[\\s*${num}\\s*,\\s*${num}(?:\\s*,\\s*${num})?(?:\\s*,\\s*${num})?\\s*\\]`, "g");
    const ks = [...code.slice(i + 1, j).matchAll(row)].map((r) => ({ t: +r[1], z: +r[2], x: r[3] != null ? +r[3] : 0, y: r[4] != null ? +r[4] : 0 })).sort((a, b) => a.t - b.t);
    for (const k of ks) {
      const off = Math.max(Math.abs(k.x) / Wd, Math.abs(k.y) / Hd);
      if (k.z > ZOOM_POINT.zoom && off > ZOOM_POINT.off) out.push({ rule: "zoom-into-point", message: `a camera key at t=${k.t} s zooms to ${k.z}x toward a point ${Math.round(off * 100)}% of the frame off centre (${k.x}, ${k.y} px)`, fix: "open it as an iris instead (a circular reveal grown from that point, eased by area), or keep the push on the frame's centre" });
    }
    for (let n = 1; n + 1 < ks.length; n++) {
      const a = ks[n - 1], b = ks[n], c = ks[n + 1];
      if (b.z >= a.z * ZOOM_INOUT.change && c.z <= b.z / ZOOM_INOUT.change && c.t - b.t <= ZOOM_INOUT.within_s) out.push({ rule: "zoom-in-out", message: `the camera zooms in to ${b.z}x by t=${b.t} s and back out to ${c.z}x by t=${c.t} s (${Math.round((c.t - b.t) * 100) / 100} s later)`, fix: "one eased move per scene: hold the push, or cut to the next scene instead of pulling back" });
    }
  }
  return out;
}
export function checkProject(project) {
  const findings = [];
  const add = (severity, rule, file, message, fix) => findings.push({ severity, rule, file: path.relative(project, file) || file, message, fix });
  const files = cameraFiles(project);
  const have = fs.existsSync(path.join(project, "assets", "rasan-camera", "rasan-camera.js"));
  const counts = {};
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    if (/\.(html?)$/i.test(f)) {
      const iR = t.search(/rasan-camera\.js/), iG = t.search(/gsap(\.min)?\.js/);
      if (!have) add("error", "runtime-missing", f, "calls RasanCamera but assets/rasan-camera/ is not installed", "node camera.mjs install --project <dir> (video.mjs inject does it for you)");
      if (iR < 0 && !/var VERSION[\s\S]*RasanCamera\s*=/.test(t)) add("error", "runtime-not-loaded", f, "calls RasanCamera without loading rasan-camera.js", 'add <script src="assets/rasan-camera/rasan-camera.js"></script> after GSAP');
      if (iR >= 0 && iG >= 0 && iR < iG) add("error", "script-order", f, "rasan-camera.js loads before GSAP", "load GSAP first (the camera uses GSAP's eases and the paused timeline)");
      if (/RasanCamera\.stage\s*\(/.test(t) && /gsap\.timeline/.test(t) && !/RasanCamera\.stage\s*\([^)]*\btl\s*:/.test(t.replace(/\n/g, " "))) add("warning", "stage-without-timeline", f, "RasanCamera.stage(...) is not given the scene's timeline ({ tl: tl }): the camera, focus and light will not move with it", "RasanCamera.stage(root, { lens_mm: 35, tl: tl, duration: <scene seconds> })");
      if (/RasanCamera/.test(t) && /gsap\.timeline/.test(t) && !/paused\s*:\s*true/.test(t)) add("warning", "timeline-not-paused", f, "no gsap.timeline({ paused: true }) found; the camera is driven by a paused timeline", "create the timeline paused and register it on window.__timelines");
    }
    if (/\bRasanCamera\b/.test(t)) for (const k of zoomKeyFindings(t)) add("warning", k.rule, f, k.message, k.fix);
    if (/\bRasanCamera\b/.test(t) && /Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/.test(t)) add("error", "nondeterministic", f, "Math.random / the wall clock in a composition that uses RasanCamera", "use RasanCamera.rng(seed) and derive everything from the timeline");
  }
  // budgeted extras are counted across every scene file (a scene script may only say cam.chromaticSplit(...))
  if (files.length) for (const f of projectFiles(project)) {
    const t = fs.readFileSync(f, "utf8");
    for (const k of BUDGETED) counts[k] = (counts[k] || 0) + (t.match(new RegExp(`\\.${k}\\s*\\(`, "g")) || []).length;
  }
  for (const k of BUDGETED) if (counts[k] > BUDGET_MAX) add("warning", "over-budget", project, `${k} is called ${counts[k]} times; it is a budgeted extra (hero only, at most ${BUDGET_MAX} per film)`, `keep ${k} for the ${BUDGET_MAX} hero moments the score names in its budget entries`);
  const errors = findings.filter((x) => x.severity === "error").length;
  return { project, files: files.map((f) => path.relative(project, f)), runtime_installed: have, budget: Object.fromEntries(Object.entries(counts).filter(([, v]) => v)), findings, errors, warnings: findings.length - errors, status: files.length ? (errors ? "violations" : "clean") : "no-camera" };
}

// ------------------------------------------------------------------ commands
if (cmd === "install") {
  const root = path.resolve(str(args.project) || str(args.dest) || die("--project <videos/name> required"));
  if (!fs.existsSync(root)) die(`not found: ${root}`);
  const inst = installCamera(root), plug = installPlugins(root);
  out({ ok: true, ...inst, dir: path.relative(process.cwd(), inst.dir), plugins: plug ? plug.script : null, use: 'after GSAP: <script src="assets/rasan-camera/rasan-camera.js"></script>' + (plug ? ' (GSAP plugins, self-registering: <script src="assets/vendor/gsap-plugins.min.js"></script> right after gsap)' : "") });
} else if (cmd === "demo") {
  const dir = path.resolve(str(args.out) || die("--out <dir> required"));
  const times = str(args.times) ? str(args.times).split(",").map(Number).filter((x) => x >= 0) : TIMES;
  const r = await demo(dir, times);
  out(r, r.ok ? 0 : 2);
} else if (cmd === "check") {
  const project = path.resolve(str(args.project) || ".");
  if (!fs.existsSync(project)) die(`project not found: ${project}`);
  const r = checkProject(project);
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`camera: ${r.status}: ${r.files.length} file(s) use RasanCamera; ${r.errors} error(s), ${r.warnings} warning(s)`);
    for (const f of r.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.rule} ${f.file}\n      ${f.message}\n      fix: ${f.fix}`);
  }
  process.exit(r.errors ? 2 : 0);
} else if (cmd) {
  die("usage: camera.mjs install|demo|check … (see the header)");
}
