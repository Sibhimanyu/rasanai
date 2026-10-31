#!/usr/bin/env node
// The motion vocabulary: RasanMotion (travel on arcs, land with a settle, irregular cascades, entrances, exits,
// follow-through, a living camera, ambient, speed-softening) on paused GSAP timelines. A builder names what moves
// and where; the curve comes from the move's role and the duration from its travel and size, so the uniform pattern
// (one ease, one duration, one stagger, nothing settling) is hard to write. Every frame is a pure function of time.
//
//   node motionkit.mjs install --project videos/<name>    copies the runtime into <project>/assets/rasan-motion/
//                                                         with the project's motion.md contract baked in
//   node motionkit.mjs install-world --project videos/<name>
//                                                         copies the style-world runtimes (rasan-fx, rasan-image-fx, medium-pixel(-world), medium-retro-os,
//                                                         medium-sticker, rasan-type-only) into <project>/assets/rasan-world/; load them after GSAP
//   node motionkit.mjs demo --out <dir> [--times 0,0.4,0.8,1.2,1.8,2.6]
//                                                         a headless test page: the tell (one ease, one duration,
//                                                         an even stagger) next to the same content in RasanMotion,
//                                                         plus every verb; one frame per time, a strip (strip.png),
//                                                         and a report: every cell changes over time, is identical when
//                                                         seeked twice, and the kit's own audit stays fluent (exit 2 if not)
//   node motionkit.mjs check --project videos/<name> [--json]
//                                                         compositions that call RasanMotion load it after GSAP from an
//                                                         installed copy, on a paused timeline, with no Math.random or
//                                                         wall clock. Exit 0 clean, 2 violations.
//   node motionkit.mjs curves                             the role curves and their measured shapes (t50, family)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, die } from "./lib/common.mjs";
import { install, installWorld, collect, usesMotion, runtimeVersion } from "./lib/motionkit.mjs";
import { BASE_CURVES, shapeOfName } from "./lib/fluent.mjs";
import { serve } from "./lib/stage3d.mjs";
import { launch } from "./lib/cdp.mjs";

const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const str = (v) => (v && v !== true ? String(v) : "");

// ------------------------------------------------------------------ the demo page
const CELLS = ["tell", "cascade", "travel", "land", "enters", "camera"];
function demoPage() {
  const css = `html,body{margin:0;background:#d9d4c7;width:1600px;height:900px;overflow:hidden;font-family:Helvetica,Arial,sans-serif}
#root{position:relative;width:1600px;height:900px}
.grid{display:grid;grid-template-columns:repeat(3,532px);grid-template-rows:repeat(2,448px);gap:2px}
.cell{position:relative;overflow:hidden;background:#f3efe6}
.lab{position:absolute;left:10px;top:8px;font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.04em;color:#6b6558;z-index:5}
.rows{position:absolute;left:40px;top:70px;width:440px}
.row{height:40px;margin:0 0 14px;border-radius:10px;background:#1c1b19;color:#f3efe6;font:600 18px/40px Helvetica,Arial,sans-serif;padding:0 14px}
.row:nth-child(2n){background:#ff5a1f}
.card{position:absolute;left:40px;top:300px;width:180px;height:110px;border-radius:18px;background:#1c1b19;color:#f3efe6;box-shadow:0 18px 40px rgba(0,0,0,.25)}
.card .label{position:absolute;left:18px;top:18px;font:700 22px/1 Helvetica,Arial,sans-serif}
.card .chip{position:absolute;left:18px;bottom:16px;width:60px;height:14px;border-radius:7px;background:#ff5a1f}
.shadow{position:absolute;left:52px;top:420px;width:156px;height:14px;border-radius:50%;background:rgba(0,0,0,.18)}
.floor{position:absolute;left:0;top:360px;width:532px;height:2px;background:#1c1b19}
.badge{position:absolute;left:220px;top:250px;width:110px;height:110px;border-radius:50%;background:#ff5a1f;color:#fff;font:800 30px/110px Helvetica,Arial,sans-serif;text-align:center}
.word{position:absolute;font:800 46px/1 Helvetica,Arial,sans-serif;color:#1c1b19}
.world{position:absolute;left:0;top:0;width:532px;height:448px}
.tile{position:absolute;width:120px;height:80px;border-radius:12px;background:#1c1b19;opacity:.9}
.tile.o{background:#ff5a1f}
.glow{position:absolute;left:300px;top:40px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,#ffb38a 0,rgba(255,179,138,0) 70%)}`;
  const rows = (id) => `<div class="rows" id="${id}">${["Inbox", "Today", "Shared with you", "Drafts", "Done"].map((t) => `<div class="row">${t}</div>`).join("")}</div>`;
  const cell = (id, label, inner) => `<div class="cell" id="c-${id}"><div class="lab">${label}</div>${inner}</div>`;
  const tiles = [[40, 60, ""], [190, 90, "o"], [340, 50, ""], [80, 200, "o"], [250, 230, ""], [400, 190, ""], [150, 330, ""], [320, 340, "o"]].map(([x, y, c]) => `<div class="tile ${c}" style="left:${x}px;top:${y}px"></div>`).join("");
  const body = [
    cell("tell", "the tell: one ease, one duration, even stagger", rows("rowsA")),
    cell("cascade", "cascade: curved offsets, +-1 frame, durations vary", rows("rowsB")),
    cell("travel", "travel: arc, trail, speed-softening, follow", `<div class="shadow" id="shadow"></div><div class="card" id="card"><div class="label" id="clabel">Q3 plan</div><div class="chip" id="chip"></div></div>`),
    cell("land", "land: a settle on the budget", `<div class="floor"></div><div class="badge" id="badge">24</div>`),
    cell("enters", "enter: mask, wipe, scale, focus, fly", `<div class="word" style="left:40px;top:70px"><span id="w1">Mask</span></div><div class="word" id="w2" style="left:280px;top:70px">Wipe</div><div class="word" id="w3" style="left:40px;top:190px">Scale</div><div class="word" id="w4" style="left:280px;top:190px">Focus</div><div class="word" id="w5" style="left:160px;top:320px">Fly</div>`),
    cell("camera", "camera + ambient: a living frame", `<div class="glow" id="glow"></div><div class="world" id="world">${tiles}</div>`),
  ].join("\n");
  const script = `
var tl = gsap.timeline({ paused: true });
// the tell, written the way our films used to be: expo.out, 0.45 s, stagger 0.08
tl.fromTo("#rowsA .row", { yPercent: 120, clipPath: "inset(0% 0% 100% 0%)" }, { yPercent: 0, clipPath: "inset(0% 0% 0% 0%)", duration: 0.45, ease: "expo.out", stagger: 0.08 }, 0.2);
var M = RasanMotion.kit(tl, { seed: "demo", W: 1600, H: 900, root: "#root" });
var c = M.cascade("#rowsB .row", { at: 0.2, how: "wipe", from: "left" });
var t = M.travel("#card", { dx: 300, dy: -200, at: 0.15, trail: ["#clabel", "#chip"] });
M.follow("#shadow", t, { amp: 1 });
M.travel("#card", { dx: -60, dy: 40, at: t.next, scale: 1.08 });
gsap.set("#badge", { y: -230 });
M.land("#badge", { dy: 230, at: 0.3 });
var e1 = M.enter("#w1", { how: "mask", at: 0.1 });
var e2 = M.enter("#w2", { how: "wipe", from: "left", at: e1.next });
var e3 = M.enter("#w3", { how: "scale", at: e2.next });
var e4 = M.enter("#w4", { how: "focus", at: e3.next });
M.enter("#w5", { how: "fly", from: "left", dist: 420, at: e4.next });
M.camera("#world", { at: 0, dur: 3 });
M.ambient("#glow", { at: 0, dur: 3, amp: 14 });
window.__audit = M.audit();
window.__timelines = window.__timelines || {}; window.__timelines.demo = tl;
window.__seek = function (T) { tl.pause(); tl.seek(T, false); return true; };
function norm(n){ var k = n.cloneNode(true); Array.prototype.forEach.call([k].concat(Array.prototype.slice.call(k.querySelectorAll("[style]"))), function (e) { var v = e.getAttribute && e.getAttribute("style"); if (v === null || v === undefined) return; var d = v.split(";").map(function (x) { return x.trim(); }).filter(Boolean).sort().join(";"); if (d) e.setAttribute("style", d); else e.removeAttribute("style"); }); return k.innerHTML; }
window.__sig = function (id) { return norm(document.getElementById("c-" + id)); };
`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<script src="/__rasanai/gsap.min.js"></script><script src="assets/rasan-motion/rasan-motion.js"></script></head>
<body><div id="root" data-composition-id="demo" data-width="1600" data-height="900"><div class="grid">${body}</div></div><script>${script}</script></body></html>`;
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
    const settle = () => b.eval("new Promise(function(r){ setTimeout(function(){ r(true); }, 60); })", { await: true });
    report.audit = await b.eval("window.__audit");
    const frames = [];
    const take = async (t, keep) => {
      await b.eval(`window.__seek(${t})`); await settle();
      const s = {};
      for (const id of CELLS) s[id] = await b.eval(`window.__sig(${JSON.stringify(id)})`);
      if (keep) { const f = path.join(dir, `t${t.toFixed(2)}.png`); fs.writeFileSync(f, await b.screenshot()); frames.push(f); }
      return s;
    };
    const first = [];
    for (const t of times) first.push(await take(t, true));
    const second = [];
    for (const t of [...times].reverse()) second.unshift(await take(t, false));
    for (const id of CELLS) {
      const a = first.map((f) => f[id]), distinct = new Set(a).size, same = a.every((x, i) => x === second[i][id]);
      report.cells.push({ id, changes: distinct > 1, distinct_states: distinct, seek_identical: same });
    }
    report.errors = b.logs.slice(0, 10);
    report.frames = frames.map((f) => path.relative(process.cwd(), f));
    const strip = path.join(dir, "strip.png");
    const cols = Math.min(3, frames.length);
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...frames.flatMap((f) => ["-i", f]), "-filter_complex", frames.map((_, i) => `[${i}:v]scale=800:-2[s${i}]`).join(";") + ";" + frames.map((_, i) => `[s${i}]`).join("") + `xstack=inputs=${frames.length}:layout=${frames.map((_, i) => `${(i % cols) * 800}_${Math.floor(i / cols) * 450}`).join("|")}[o]`, "-map", "[o]", "-frames:v", "1", strip], { encoding: "utf8" });
    report.strip = r.status === 0 ? path.relative(process.cwd(), strip) : null;
    const a = report.audit || {};
    const bad = report.cells.filter((c) => !c.changes || !c.seek_identical);
    report.fluent_audit = !!a.gestures && a.dominant_share <= 0.4 && a.distinct_durations >= 4;
    report.ok = !bad.length && !report.errors.length && report.fluent_audit;
    if (bad.length) report.failing = bad.map((c) => `${c.id}: ${!c.changes ? "does not change over time" : "not identical on a second seek"}`);
    if (!report.fluent_audit) (report.failing = report.failing || []).push(`the kit's own audit is not fluent: ${JSON.stringify(a)}`);
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
  const files = collect(project).filter(usesMotion);
  const have = fs.existsSync(path.join(project, "assets", "rasan-motion", "rasan-motion.js"));
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    if (/\.(html?)$/i.test(f)) {
      const iR = t.search(/rasan-motion\.js/), iG = t.search(/gsap(\.min)?\.js/);
      if (!have) add("error", "runtime-missing", f, "calls RasanMotion but assets/rasan-motion/ is not installed", "node motionkit.mjs install --project <dir> (video.mjs inject does it when a composition names RasanMotion)");
      if (iR < 0 && !/RasanMotion\s*=|root\.RasanMotion/.test(t)) add("error", "runtime-not-loaded", f, "calls RasanMotion without loading rasan-motion.js", 'add <script src="../../assets/rasan-motion/rasan-motion.js"></script> after GSAP (relative to the composition)');
      if (iR >= 0 && iG >= 0 && iR < iG) add("error", "script-order", f, "rasan-motion.js loads before GSAP", "load GSAP first");
      if (!/paused\s*:\s*true/.test(t)) add("warning", "timeline-not-paused", f, "no gsap.timeline({ paused: true }) found; the kit adds to a paused timeline", "create the timeline paused and register it on window.__timelines");
    }
    if (/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/.test(t)) add("error", "nondeterministic", f, "Math.random or the wall clock next to RasanMotion", "the kit is seeded (RasanMotion.kit(tl, { seed })); derive everything else from the timeline");
  }
  const errors = findings.filter((x) => x.severity === "error").length;
  return { project, files: files.map((f) => path.relative(project, f)), runtime_installed: have, findings, errors, warnings: findings.length - errors, status: files.length ? (errors ? "violations" : "clean") : "no-motion-kit" };
}

// ------------------------------------------------------------------ commands
if (cmd === "install") {
  const root = path.resolve(str(args.project) || die("--project <videos/name> required"));
  if (!fs.existsSync(root)) die(`not found: ${root}`);
  const inst = install(root);
  out({ ok: true, ...inst, dir: path.relative(process.cwd(), inst.dir), use: '<script src="../../assets/rasan-motion/rasan-motion.js"></script> after GSAP (relative to the composition), then var M = RasanMotion.kit(tl, { seed: "<film>/<beat>" })' });
} else if (cmd === "install-world") {
  const root = path.resolve(str(args.project) || die("--project <videos/name> required"));
  if (!fs.existsSync(root)) die(`not found: ${root}`);
  const inst = installWorld(root);
  out({ ok: true, ...inst, dir: path.relative(process.cwd(), inst.dir), use: "load each <script src=\"../../assets/rasan-world/<file>\"> AFTER GSAP (relative to the composition); medium-pixel-world.js after medium-pixel.js; read each file's header for its API" });
} else if (cmd === "demo") {
  const dir = path.resolve(str(args.out) || die("--out <dir> required"));
  const times = (str(args.times) || "0,0.4,0.8,1.2,1.8,2.6").split(",").map(Number).filter((x) => x >= 0);
  const r = await demo(dir, times);
  out(r, r.ok ? 0 : 2);
} else if (cmd === "check") {
  const project = path.resolve(str(args.project) || ".");
  if (!fs.existsSync(project)) die(`project not found: ${project}`);
  const r = checkProject(project);
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`motionkit: ${r.status}: ${r.files.length} file(s) use RasanMotion; ${r.errors} error(s), ${r.warnings} warning(s)`);
    for (const f of r.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.rule} ${f.file}\n      ${f.message}\n      fix: ${f.fix}`);
  }
  process.exit(r.errors ? 2 : 0);
} else if (cmd === "curves") {
  out(Object.fromEntries(Object.entries(BASE_CURVES).map(([role, c]) => [role, { curve: c, ...shapeOfName(c) }])));
} else {
  die("usage: motionkit.mjs install|demo|check|curves … (see the header)");
}
