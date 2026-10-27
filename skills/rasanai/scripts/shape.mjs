#!/usr/bin/env node
// The shape kit: RasanShape (morph, draw-on, motion path, split, scatter, ink, dissolve, squash, smear, stepped)
// for paused GSAP timelines. Every function is a pure function of the timeline's time, so it is seek-safe.
//
//   node shape.mjs install --project videos/<name> [--optics]   copies the runtime + flubber (MIT) into <project>/assets/rasan-shape/; --optics also copies rasan-optics.js
//   node shape.mjs demo    --out <dir> [--times 0,0.6,1.1,1.6,2.3]
//                                   renders a test page that exercises every function headlessly: one frame per time,
//                                   a contact strip (strip.png), and a report: each function changes the frame over
//                                   time and is identical when the same time is seeked twice (exit 2 when not)
//   node shape.mjs check   --project videos/<name> [--json]
//                                   a composition that calls RasanShape has the runtime installed, loaded after GSAP
//                                   (flubber before it when it morphs), a paused registered timeline, and no Math.random
//                                   or wall clock in the calls. Exit 0 = clean, 2 = violations.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, die } from "./lib/common.mjs";
import { install, collect, usesShape, usesOptics, RUNTIME, runtimeVersion } from "./lib/shape.mjs";
import { serve } from "./lib/stage3d.mjs";
import { launch } from "./lib/cdp.mjs";

const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const str = (v) => (v && v !== true ? String(v) : "");

// ------------------------------------------------------------------ the demo page
// 12 cells, one per function; each is driven by the same paused timeline (window.__timelines.demo)
const CELLS = ["morph", "drawon", "followpath", "scatter", "ink-smear", "ink-blot", "ink-wipe", "dissolve-pixel", "dissolve-halftone", "dissolve-dither", "squash-smear", "stepped"];
function demoPage() {
  const css = `html,body{margin:0;background:#cfc9bb;width:1600px;height:900px;overflow:hidden;font-family:Helvetica,Arial,sans-serif}
.grid{display:grid;grid-template-columns:repeat(4,400px);grid-template-rows:repeat(3,300px);gap:0}
.cell{position:relative;width:400px;height:300px;overflow:hidden;background:#f1ede4;box-sizing:border-box;border:1px solid #cfc9bb}
.cell svg.full{position:absolute;left:0;top:0;width:400px;height:300px}
.lab{position:absolute;left:8px;top:6px;font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.04em;color:#6b6558;z-index:5}
.inkbox{position:absolute;left:50px;top:50px;width:300px;height:200px;background:#1b1a18;color:#f1ede4;font:900 96px/200px Helvetica,Arial,sans-serif;text-align:center;letter-spacing:-.03em}
.inkbox i{position:absolute;left:0;bottom:0;height:18px;width:100%;background:#ff4d12}
.big{position:absolute;left:0;top:78px;width:400px;text-align:center;font:900 118px/1 Helvetica,Arial,sans-serif;letter-spacing:-.02em;color:#1b1a18}
.sq{position:absolute;left:30px;top:196px;width:64px;height:64px;border-radius:14px;background:#ff4d12}
.floor{position:absolute;left:0;top:260px;width:400px;height:2px;background:#1b1a18}
.dot{position:absolute;left:0;top:0;width:26px;height:26px;margin:0;background:#1b1a18;clip-path:polygon(0 0,100% 50%,0 100%,25% 50%)}
.ball{position:absolute;left:40px;top:110px;width:56px;height:56px;border-radius:50%;background:#1b1a18}
.ball:after{content:"";position:absolute;left:14px;top:12px;width:12px;height:12px;border-radius:50%;background:#f1ede4}
canvas.src{position:absolute;left:40px;top:50px;width:320px;height:200px}`;
  const cell = (id, inner) => `<div class="cell" id="c-${id}"><div class="lab">${id}</div>${inner}</div>`;
  const body = [
    cell("morph", `<svg class="full" viewBox="0 0 400 300"><circle cx="200" cy="150" r="108" fill="none" stroke="#1b1a18" stroke-width="3"/><circle cx="200" cy="150" r="84" fill="#c8b27a"/><path id="pupil" fill="#1b1a18" d="M200 90 C233 90 260 117 260 150 C260 183 233 210 200 210 C167 210 140 183 140 150 C140 117 167 90 200 90 Z"/><path id="slit" fill="none" d="M200 62 C210 100 212 130 212 150 C212 170 210 200 200 238 C190 200 188 170 188 150 C188 130 190 100 200 62 Z"/></svg>`),
    cell("drawon", `<svg class="full" viewBox="0 0 400 300"><path id="sig" fill="none" stroke="#1b1a18" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M40 190 C70 90 100 90 105 170 C108 215 130 200 150 150 C165 112 180 120 178 165 C176 205 205 200 225 135 C232 112 250 110 262 150 C275 195 300 205 360 120"/><path id="conn" fill="none" stroke="#ff4d12" stroke-width="3" d="M80 250 L170 250 L230 232"/><rect id="box" x="228" y="214" width="120" height="44" fill="none" stroke="#ff4d12" stroke-width="3"/></svg>`),
    cell("followpath", `<svg class="full" viewBox="0 0 400 300"><path id="route" fill="none" stroke="#b9b2a2" stroke-width="2" stroke-dasharray="3 5" d="M40 230 C100 40 170 40 200 150 C230 260 300 260 360 70"/></svg><div class="dot" id="arrow"></div>`),
    cell("scatter", `<div class="big" id="love">LOVE</div>`),
    cell("ink-smear", `<div class="inkbox" id="ink1">INK<i></i></div>`),
    cell("ink-blot", `<div class="inkbox" id="ink2">INK<i></i></div>`),
    cell("ink-wipe", `<div class="inkbox" id="ink3">INK<i></i></div>`),
    cell("dissolve-pixel", `<canvas class="src" id="src1" width="320" height="200"></canvas>`),
    cell("dissolve-halftone", `<canvas class="src" id="src2" width="320" height="200"></canvas>`),
    cell("dissolve-dither", `<canvas class="src" id="src3" width="320" height="200"></canvas>`),
    cell("squash-smear", `<div class="floor"></div><div class="sq" id="sq"></div>`),
    cell("stepped", `<div class="ball" id="ball"></div>`),
  ].join("\n");
  const script = `
function paintSrc(c, hue){ var x=c.getContext("2d"), g=x.createLinearGradient(0,0,320,200); g.addColorStop(0,hue[0]); g.addColorStop(1,hue[1]); x.fillStyle=g; x.fillRect(0,0,320,200);
  x.fillStyle="#f1ede4"; x.beginPath(); x.arc(110,100,62,0,6.2832); x.fill(); x.fillStyle="#1b1a18"; x.beginPath(); x.arc(110,100,28,0,6.2832); x.fill();
  x.fillStyle="#ff4d12"; x.fillRect(190,40,90,120); x.fillStyle="#f1ede4"; x.font="900 54px Helvetica,Arial,sans-serif"; x.fillText("Ab",196,118); }
paintSrc(document.getElementById("src1"),["#2b4a8a","#e9a13b"]); paintSrc(document.getElementById("src2"),["#1b1a18","#7a8f5a"]); paintSrc(document.getElementById("src3"),["#6a2b5c","#f0c987"]);
var tl = gsap.timeline({ paused: true });
var S = RasanShape;
S.morph(tl, "#pupil", "#slit", { at: 0.3, duration: 1.2, ease: "power2.inOut" });
S.drawOn(tl, "#sig", { at: 0.2, duration: 1.2, ease: "power1.inOut" });
S.drawOn(tl, "#conn", { at: 1.2, duration: 0.5 }); S.drawOn(tl, "#box", { at: 1.5, duration: 0.5 });
S.followPath(tl, "#arrow", "#route", { at: 0.2, duration: 1.8, ease: "power1.inOut", rotate: true });
var chars = S.split("#love", { by: "chars" });
S.scatter(tl, chars, { at: 0.2, duration: 1.1, seed: 11, stagger: 0.06, spread: 260, settle: "back.out(1.4)" });
S.ink(tl, "#ink1", { mode: "smear", at: 0.3, duration: 1.5, seed: 4 });
S.ink(tl, "#ink2", { mode: "blot", at: 0.3, duration: 1.5, seed: 9 });
S.ink(tl, "#ink3", { mode: "wipe", at: 0.3, duration: 1.5, seed: 2 });
S.dissolve(tl, "#src1", { mode: "pixel", at: 0.2, duration: 1.6, cell: 26, seed: 5 });
S.dissolve(tl, "#src2", { mode: "halftone", at: 0.2, duration: 1.6, cell: 12 });
S.dissolve(tl, "#src3", { mode: "dither", at: 0.2, duration: 1.6, cell: 10 });
// squash and smear: the square drops onto the floor and slides right, smeared
tl.fromTo("#sq", { y: -150 }, { y: 0, duration: 0.45, ease: "power2.in" }, 0.1);
S.squash(tl, "#sq", { at: 0.55, duration: 0.4, amount: 0.28, axis: "y", origin: "50% 100%" });
tl.to("#sq", { x: 280, duration: 0.5, ease: "power3.inOut" }, 1.1);
S.smear(tl, "#sq", { at: 1.15, frames: 3, direction: "right", length: 120, opacity: 0.7 });
// stepped: a ball drifting across on threes
gsap.set("#ball", { x: 0, y: 0, rotation: 0 });
var sub = gsap.timeline();
sub.to("#ball", { x: 260, y: 70, rotation: 90, duration: 2, ease: "sine.inOut" }, 0);
S.stepped(sub, { fps: 6 });
tl.add(sub, 0.1);
window.__timelines = window.__timelines || {}; window.__timelines.demo = tl;
window.__dur = 2.4;
window.__seek = function (T) { tl.pause(); tl.seek(T, false); return true; };
function norm(n){ var k = n.cloneNode(true); Array.prototype.forEach.call([k].concat(Array.prototype.slice.call(k.querySelectorAll("[style]"))), function (e) { var v = e.getAttribute && e.getAttribute("style"); if (v === null || v === undefined) return; var d = v.split(";").map(function (x) { return x.trim(); }).filter(Boolean).sort().join(";"); if (d) e.setAttribute("style", d); else e.removeAttribute("style"); }); return k.innerHTML; }
window.__sig = function (id) { var c = document.getElementById("c-" + id), s = norm(c);
  Array.prototype.forEach.call(c.querySelectorAll("canvas"), function (k) { var d = k.toDataURL(); var h = 0; for (var i = 0; i < d.length; i += 7) h = (h * 31 + d.charCodeAt(i)) | 0; s += "|cv" + h; });
  if (/^ink/.test(id)) s += "|" + document.querySelector("body > svg").innerHTML;
  return s; };
`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<script src="/__rasanai/gsap.min.js"></script><script src="assets/rasan-shape/flubber.min.js"></script><script src="assets/rasan-shape/rasan-shape.js"></script></head>
<body><div class="grid">${body}</div><script>${script}</script></body></html>`;
}

async function demo(dir, times) {
  fs.mkdirSync(dir, { recursive: true });
  install(dir);
  fs.writeFileSync(path.join(dir, "demo.html"), demoPage());
  const srv = await serve(dir);
  const b = await launch({ width: 1600, height: 900, timeoutMs: 120000 });
  const report = { ok: true, version: runtimeVersion(), times, cells: [], errors: [] };
  try {
    await b.open(`${srv.url}/demo.html`);
    await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){ return true; }) : true", { await: true });
    const settle = () => b.eval("new Promise(function(r){ setTimeout(function(){ r(true); }, 80); })", { await: true });
    const frames = [], sigs = {}, shots = {};
    for (const id of CELLS) sigs[id] = [];
    const take = async (t, keep) => {
      await b.eval(`window.__seek(${t})`); await settle();
      const s = {};
      for (const id of CELLS) s[id] = await b.eval(`window.__sig(${JSON.stringify(id)})`);
      const png = await b.screenshot();
      if (keep) { const f = path.join(dir, `t${t.toFixed(2)}.png`); fs.writeFileSync(f, png); frames.push(f); }
      return { s, png: png.toString("base64") };
    };
    const first = [];
    for (const t of times) first.push(await take(t, true));
    // seek the same times again, in reverse order, after seeking elsewhere: identical frames
    const second = [];
    for (const t of [...times].reverse()) second.unshift(await take(t, false));
    for (const id of CELLS) {
      const a = first.map((f) => f.s[id]), distinct = new Set(a).size;
      const same = a.every((x, i) => x === second[i].s[id]);
      report.cells.push({ id, changes: distinct > 1, distinct_states: distinct, seek_identical: same, ...(same ? {} : { mismatch_at: times.filter((_, i) => a[i] !== second[i].s[id]) }) });
    }
    // whole-page identity: byte-equal screenshots, or (on renderers whose PNG encoding or filter noise
    // differs by a few values, e.g. GPU-less CI Chrome) visually identical frames, PSNR >= 45 dB by ffmpeg.
    // The per-cell state signatures above are the exact determinism test; this guards the whole frame.
    const psnr = (a, b) => {
      const fa = path.join(dir, ".psnr-a.png"), fb = path.join(dir, ".psnr-b.png");
      fs.writeFileSync(fa, Buffer.from(a, "base64")); fs.writeFileSync(fb, Buffer.from(b, "base64"));
      const r = spawnSync("ffmpeg", ["-v", "info", "-i", fa, "-i", fb, "-lavfi", "psnr", "-f", "null", "-"], { encoding: "utf8" });
      try { fs.unlinkSync(fa); fs.unlinkSync(fb); } catch {}
      if (r.status !== 0) return null;
      const m = /average:(inf|[0-9.]+)/.exec(r.stderr || "");
      return m ? (m[1] === "inf" ? Infinity : Number(m[1])) : null;
    };
    const same = (a, b) => { if (a === b) return true; const v = psnr(a, b); return v !== null && v >= 45; };
    report.page_identical = first.every((f, i) => same(f.png, second[i].png));
    report.page_changes = first.every((f, i) => i === 0 || !same(first[i - 1].png, f.png));
    report.errors = b.logs.slice(0, 10);
    report.frames = frames.map((f) => path.relative(process.cwd(), f));
    // the strip: every frame in one picture
    const strip = path.join(dir, "strip.png");
    const cols = Math.min(3, frames.length), rows = Math.ceil(frames.length / cols);
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...frames.flatMap((f) => ["-i", f]), "-filter_complex", frames.map((_, i) => `[${i}:v]scale=800:-2[s${i}]`).join(";") + ";" + frames.map((_, i) => `[s${i}]`).join("") + `xstack=inputs=${frames.length}:layout=${frames.map((_, i) => `${(i % cols) * 800}_${Math.floor(i / cols) * 450}`).join("|")}[o]`, "-map", "[o]", "-frames:v", "1", strip], { encoding: "utf8" });
    report.strip = r.status === 0 ? path.relative(process.cwd(), strip) : null;
    if (r.status !== 0) report.strip_note = "ffmpeg not available; the frames are in " + path.relative(process.cwd(), dir);
    const bad = report.cells.filter((c) => !c.changes || !c.seek_identical);
    report.ok = !bad.length && report.page_identical && !report.errors.length;
    if (bad.length) report.failing = bad.map((c) => `${c.id}: ${!c.changes ? "does not change over time" : "not identical on a second seek"}`);
  } finally {
    await b.close();
    await srv.close();
  }
  return report;
}

// ------------------------------------------------------------------ check
function checkProject(project) {
  const findings = [];
  const add = (severity, rule, file, message, fix) => findings.push({ severity, rule, file: path.relative(project, file) || file, message, fix });
  const files = collect(project).filter(usesShape);
  const have = fs.existsSync(path.join(project, "assets", "rasan-shape", "rasan-shape.js"));
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    if (/\.(html?)$/i.test(f)) {
      const iR = t.search(/rasan-shape\.js/), iG = t.search(/gsap(\.min)?\.js/), iF = t.search(/flubber(\.min)?\.js/);
      if (!have) add("error", "runtime-missing", f, "calls RasanShape but assets/rasan-shape/ is not installed", "node shape.mjs install --project <dir> (video.mjs inject does it for you)");
      if (iR < 0 && !/<script>[\s\S]*var VERSION[\s\S]*RasanShape\s*=/.test(t)) add("error", "runtime-not-loaded", f, "calls RasanShape without loading rasan-shape.js", 'add <script src="assets/rasan-shape/rasan-shape.js"></script> after GSAP');
      if (iR >= 0 && iG >= 0 && iR < iG) add("error", "script-order", f, "rasan-shape.js loads before GSAP", "load GSAP first");
      if (/RasanShape\.morph\s*\(/.test(t) && iF < 0) add("error", "flubber-missing", f, "RasanShape.morph needs flubber", 'add <script src="assets/rasan-shape/flubber.min.js"></script> before rasan-shape.js');
      if (/RasanShape/.test(t) && !/paused\s*:\s*true/.test(t)) add("warning", "timeline-not-paused", f, "no gsap.timeline({ paused: true }) found; the shape kit is driven by a paused timeline", "create the timeline paused and register it on window.__timelines");
    }
    if (/\bRasanShape\b/.test(t) && /Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/.test(t)) add("error", "nondeterministic", f, "Math.random / the wall clock in a composition that uses RasanShape", "use RasanShape.rng(seed) and derive everything from the timeline");
  }
  // optics (additive): a composition calling RasanOptics loads rasan-optics.js after GSAP, has it installed, and keeps the timeline paused and clock-free
  const haveOptics = fs.existsSync(path.join(project, "assets", "rasan-shape", "rasan-optics.js"));
  for (const f of collect(project).filter(usesOptics)) {
    const t = fs.readFileSync(f, "utf8");
    if (/\.(html?)$/i.test(f)) {
      const iO = t.search(/rasan-optics\.js/), iG = t.search(/gsap(\.min)?\.js/);
      if (!haveOptics && iO < 0) add("error", "optics-runtime-missing", f, "calls RasanOptics but rasan-optics.js is not installed or loaded", "node shape.mjs install --project <dir> --optics");
      if (iO >= 0 && iG >= 0 && iO < iG) add("error", "optics-script-order", f, "rasan-optics.js loads before GSAP", "load GSAP first");
      if (!/paused\s*:\s*true/.test(t)) add("warning", "optics-timeline-not-paused", f, "no gsap.timeline({ paused: true }) found; RasanOptics is driven by a paused timeline", "create the timeline paused and register it");
    }
    if (/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/.test(t)) add("error", "optics-nondeterministic", f, "Math.random / the wall clock in a composition that uses RasanOptics", "the optics are a pure function of timeline time: use the plan's seed and score-second keys");
    if (/RasanOptics[\s\S]*\.style\.filter\s*=|\.style\.filter\s*=[\s\S]*RasanOptics/.test(t)) add("warning", "optics-second-writer", f, "this composition writes style.filter by hand next to RasanOptics: one writer per element, or the helpers overwrite each other", "move that effect into an optics operation or give it another element");
  }
  const errors = findings.filter((x) => x.severity === "error").length;
  return { project, files: files.map((f) => path.relative(project, f)), runtime_installed: have, findings, errors, warnings: findings.length - errors, status: files.length ? (errors ? "violations" : "clean") : "no-shape" };
}

// ------------------------------------------------------------------ commands
if (cmd === "install") {
  const root = path.resolve(str(args.project) || str(args.dest) || die("--project <videos/name> required"));
  if (!fs.existsSync(root)) die(`not found: ${root}`);
  const inst = install(root, { optics: !!args.optics });
  out({ ok: true, ...inst, dir: path.relative(process.cwd(), inst.dir), use: 'after GSAP: <script src="assets/rasan-shape/flubber.min.js"></script><script src="assets/rasan-shape/rasan-shape.js"></script> (flubber only for morph)' });
} else if (cmd === "demo") {
  const dir = path.resolve(str(args.out) || die("--out <dir> required"));
  const times = (str(args.times) || "0,0.6,1.1,1.6,2.3").split(",").map(Number).filter((x) => x >= 0);
  const r = await demo(dir, times);
  out(r, r.ok ? 0 : 2);
} else if (cmd === "check") {
  const project = path.resolve(str(args.project) || ".");
  if (!fs.existsSync(project)) die(`project not found: ${project}`);
  const r = checkProject(project);
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`shape: ${r.status}: ${r.files.length} file(s) use RasanShape; ${r.errors} error(s), ${r.warnings} warning(s)`);
    for (const f of r.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.rule} ${f.file}\n      ${f.message}\n      fix: ${f.fix}`);
  }
  process.exit(r.errors ? 2 : 0);
} else {
  die("usage: shape.mjs install|demo|check … (see the header)");
}
