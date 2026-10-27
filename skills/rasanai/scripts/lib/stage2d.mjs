// Rasan2D tooling shared by stage2d.mjs, crew.mjs and video.mjs: install the runtime into a project (assets/rasan2d/),
// load a composition that uses it in a real browser over the DevTools pipe, render stills, sheets and the test film,
// and the checks behind `stage2d.mjs check`. Uses scripts/lib/cdp.mjs (one Chrome, headless) and the repo's local server.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { SKILL_DIR, GSAP_PATH } from "./common.mjs";
import { launch } from "./cdp.mjs";
import { serve } from "./stage3d.mjs";
import { validateIdentity, validateCast, loadIdentity } from "./canon.mjs";

const require = createRequire(import.meta.url);
const exists = (p) => !!p && fs.existsSync(p);

export const STAGE2D = path.join(SKILL_DIR, "stage2d");
export const RUNTIME_FILES = ["brush.js", "character.js", "gestures.js", "rasan2d.js"];
export const FIXTURES = path.join(STAGE2D, "fixtures");
export const runtimeVersion = () => (fs.readFileSync(path.join(STAGE2D, "runtime", "rasan2d.js"), "utf8").match(/var VERSION = "([^"]+)"/) || [])[1] || "0";

// the runtime's own list of the fixed traits it can draw (character.js, plain JS, loaded here for the canon rules)
let kit = null;
export function character() {
  if (!kit) { global.Rasan2DKit = undefined; kit = require(path.join(STAGE2D, "runtime", "character.js")); }
  return kit;
}
export const traitsFor2d = (traits) => character().traitFeatures(traits);
export const validate2d = (identity, baseDir) => validateIdentity(identity, { medium: "painted-2d", baseDir, traits: traitsFor2d });

// ------------------------------------------------------------------ install
export function install(destRoot) {
  const dst = path.join(destRoot, "assets", "rasan2d");
  const same = RUNTIME_FILES.every((f) => exists(path.join(dst, f)) && fs.readFileSync(path.join(dst, f), "utf8") === fs.readFileSync(path.join(STAGE2D, "runtime", f), "utf8"));
  if (!same) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of RUNTIME_FILES) fs.copyFileSync(path.join(STAGE2D, "runtime", f), path.join(dst, f));
  }
  fs.mkdirSync(path.join(dst, "cast"), { recursive: true });
  return { dir: dst, version: runtimeVersion(), updated: !same, scripts: RUNTIME_FILES.map((f) => `assets/rasan2d/${f}`) };
}
export function usesRasan2d(file) {
  return /Rasan2D\.(stage|mount)\s*\(|assets\/rasan2d\/rasan2d\.js/.test(fs.readFileSync(file, "utf8"));
}
export function projectUsesRasan2d(dir) {
  try { return collect(dir).some(usesRasan2d); } catch { return false; }
}
export function collect(dir, res = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "renders", "snapshots", ".superseded", ".git", "assets", ".media", "capture", "deliver"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) collect(p, res);
    else if (f.name.endsWith(".html") && !f.name.startsWith("__") && !f.name.startsWith(".rasanai")) res.push(p);
  }
  return res;
}
export function projectRootOf(file) {
  let d = path.dirname(path.resolve(file));
  for (let i = 0; i < 6; i++) {
    if (exists(path.join(d, "hyperframes.json")) || (exists(path.join(d, "index.html")) && exists(path.join(d, "compositions"))) || exists(path.join(d, "assets", "rasan2d", "rasan2d.js"))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return path.dirname(path.resolve(file));
}

// ------------------------------------------------------------------ templates
export function fill(text, vars) { return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)); }
export function readSequence(file = path.join(FIXTURES, "demo-sequence.json")) { return JSON.parse(fs.readFileSync(file, "utf8")); }
export function scaffoldText(o) {
  const tpl = fs.readFileSync(path.join(STAGE2D, "templates", o.standalone ? "standalone-2d.html" : "scene-2d.html"), "utf8");
  const canons = o.canons || { "hero-01": loadIdentity(path.join(FIXTURES, "original-actor.json")) };
  const sequence = o.sequence || starterSequence(o, Object.keys(canons)[0]);
  return fill(tpl, { FRAME_ID: o.frame, W: o.width, H: o.height, DURATION: o.duration, CANVAS: o.canvas, INK: o.ink, ACCENT: o.accent, SEED: o.seed, CANONS: JSON.stringify(canons, null, 2), SEQUENCE: JSON.stringify(sequence, null, 2).replace(/<\/script/gi, "<\\/script") });
}
// a small starting scene: the actor idles, looks at something, and hops: replace with the score's shots
export function starterSequence(o, canonId) {
  const D = Number(o.duration) || 4;
  return {
    schema_version: 1, id: o.frame, width: o.width, height: o.height, fps: 30, duration: D, seed: o.seed,
    look: { paper: { tint: o.canvas && !/^#0|^#1/i.test(o.canvas) ? o.canvas : "#f1e7d2" } },
    actors: [{ id: canonId, canon: canonId, position: { x: 0.5, y: 0.8 }, scale: 1, yaw: "front", emotion: "calm" }],
    props: [],
    sets: { stage: { palette: {}, elements: [{ kind: "sky", layer: "far" }, { kind: "hill", layer: "far", x: 0.5, y: 0.72, w: 1.3, h: 0.18 }, { kind: "ground", layer: "mid", y: 0.72 }] } },
    shots: [{ id: "s1", from: 0, to: D, set: "stage", actors: [canonId], camera: { keys: [{ t: 0, x: 0.5, y: 0.52, zoom: 1 }, { t: D, x: 0.5, y: 0.52, zoom: 1.06 }] } }],
    actions: [
      { actor: canonId, kind: "look", at: 0.4, duration: 0.5, target: [0.75, 0.45] },
      { actor: canonId, kind: "emote", emotion: "curious", at: 0.5, duration: 0.3 },
      { actor: canonId, kind: "hop", at: D * 0.45, duration: 0.7, height: 1.8, dx: 0 },
      { actor: canonId, kind: "emote", emotion: "delighted", at: D * 0.45 + 0.4, duration: 0.25 },
    ],
  };
}

// ------------------------------------------------------------------ loading a composition (or a standalone page) in a browser
function pageFor(file) {
  let html = fs.readFileSync(file, "utf8").replace(/<template[^>]*>/gi, "").replace(/<\/template>/gi, "");
  html = html.replace(/<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi, `<script src="/__rasanai/gsap.min.js"></script>`);
  const W = Number((html.match(/data-width="(\d+)"/) || [])[1] || (html.match(/width="(\d+)"/) || [])[1] || 1920), H = Number((html.match(/data-height="(\d+)"/) || [])[1] || (html.match(/height="(\d+)"/) || [])[1] || 1080);
  const root = projectRootOf(file);
  const gsapTag = /gsap(\.min)?\.js/.test(html) || !/__timelines/.test(html) ? "" : `<script src="/__rasanai/gsap.min.js"></script>`;
  const head = `${gsapTag}<script>window.__timelines=window.__timelines||{};</script><style>html,body{margin:0;padding:0;background:#000;overflow:hidden;width:${W}px;height:${H}px}</style>`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  const helper = `<script>
window.__r2info = function(){ var R = window.__rasan2d; if (!R) return { stages: [], errors: [] };
  return { stages: Object.keys(R.stages).map(function(k){ var s = R.stages[k]; return { id: s.id, ready: s.ready, error: s.error, duration: s.duration, manifest: s.manifest() }; }), errors: R.errors.slice() }; };
window.__r2seek = window.__r2seek || function(T){ var L = window.__timelines || {};
  Object.keys(L).forEach(function(k){ try { L[k].pause(); L[k].seek(T, false); } catch (e) {} });
  document.querySelectorAll('[data-start][data-duration]').forEach(function(el){ if (el.hasAttribute('data-composition-id')) return; var s = parseFloat(el.getAttribute('data-start')), d = parseFloat(el.getAttribute('data-duration')); if (isFinite(s) && isFinite(d)) el.style.visibility = (T >= s && T < s + d) ? '' : 'hidden'; });
  var R = window.__rasan2d; if (R) Object.keys(R.stages).forEach(function(k){ var s = R.stages[k]; s.draw(s.tl.time(), true); });
  return true; };
</script>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, helper + "</body>") : html + helper;
  const tmp = path.join(root, `.rasanai-2d-${process.pid}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}.html`);
  fs.writeFileSync(tmp, html);
  return { tmp, W, H, root };
}
// the same server the 3D tools use, with the vendored GSAP at /__rasanai/gsap.min.js
async function withPage(file, fn, { timeoutMs = 180000 } = {}) {
  const { tmp, W, H, root } = pageFor(file);
  let b, srv;
  try {
    srv = await serve(root);
    b = await launch({ width: W, height: H, timeoutMs });
    await b.open(`${srv.url}/${path.basename(tmp)}`);
    await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){ return true; }) : true", { await: true });
    const info = await b.eval("window.__r2info ? window.__r2info() : { stages: [], errors: [] }");
    return await fn(b, { W, H, root, info, url: `${srv.url}/${path.basename(tmp)}`, base: srv.url });
  } finally {
    if (b) await b.close();
    if (srv) await srv.close();
    fs.rmSync(tmp, { force: true });
  }
}
export { withPage };

export async function stills(file, times, dir) {
  fs.mkdirSync(dir, { recursive: true });
  return withPage(file, async (b, { info }) => {
    const files = [];
    for (const t of times) {
      await b.eval(`window.__r2seek(${Number(t)})`);
      const png = path.join(dir, `t${Number(t).toFixed(3)}.png`);
      fs.writeFileSync(png, await b.screenshot());
      files.push({ t, png });
    }
    return { files, info, logs: b.logs };
  });
}

// ------------------------------------------------------------------ the sheets (model sheet, emotions, turn) and the strips
function pageForSheet(root, W, H, seed, canonJson, look) {
  const tmp = path.join(root, `.rasanai-2d-sheet-${process.pid}-${Date.now().toString(36)}.html`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#111}canvas{display:block}</style></head><body><canvas id="c" width="${W}" height="${H}"></canvas>
${RUNTIME_FILES.map((f) => `<script src="assets/rasan2d/${f}"></script>`).join("\n")}
<script>
window.__sheet = function(kind, o){ var R = Rasan2D.mount("#c", { width: ${W}, height: ${H}, seed: ${seed}, look: ${JSON.stringify(look || {})} });
  var canon = ${canonJson}; R.addActor({ id: canon.id, canon: canon, position: { x: 0.5, y: 0.8 } });
  Rasan2D.sheets[kind](R.ctx, R, canon.id, o || {}); return true; };
</script></body></html>`;
  fs.writeFileSync(tmp, html);
  return tmp;
}
export async function renderSheet(kind, identity, outPng, { W = 1920, H = 1080, seed = 7, page = 0, look = null } = {}) {
  const root = fs.mkdtempSync(path.join(path.dirname(outPng), ".r2sheet-"));
  try {
    install(root);
    const tmp = pageForSheet(root, W, H, seed, JSON.stringify(identity), look);
    const srv = await serve(root);
    const b = await launch({ width: W, height: H, timeoutMs: 120000 });
    try {
      await b.open(`${srv.url}/${path.basename(tmp)}`);
      const r = await b.eval(`(function(){ try { return window.__sheet(${JSON.stringify(kind)}, ${JSON.stringify({ page })}); } catch (e) { return "ERR " + e.stack; } })()`);
      if (r !== true) throw new Error(String(r));
      fs.mkdirSync(path.dirname(outPng), { recursive: true });
      fs.writeFileSync(outPng, await b.screenshot());
      return { png: outPng, logs: b.logs };
    } finally {
      await b.close();
      await srv.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ the film: frames from headless Chrome (parallel, stateless), then ffmpeg
export function haveFfmpeg() { return spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0; }
export async function renderFrames({ project, sequence, canons, outDir, fps = 30, from = 0, to = null, workers = 3, onlyTimes = null, quality = 0.94, W = null, H = null }) {
  fs.mkdirSync(outDir, { recursive: true });
  const root = project;
  install(root);
  const seq = sequence;
  const Wd = W || seq.width || 1920, Hd = H || seq.height || 1080;
  const tmp = path.join(root, `.rasanai-2d-film-${process.pid}-${Date.now().toString(36)}.html`);
  fs.writeFileSync(tmp, fill(fs.readFileSync(path.join(STAGE2D, "templates", "standalone-2d.html"), "utf8"), { FRAME_ID: seq.id || "film", W: Wd, H: Hd, CANVAS: "#111", SEED: seq.seed, SEQUENCE: JSON.stringify({ ...seq, canons }).replace(/<\/script/gi, "<\\/script") }));
  const srv = await serve(root);
  const end = to != null ? to : seq.duration;
  const times = onlyTimes || Array.from({ length: Math.round((end - from) * fps) }, (_, i) => from + i / fps);
  const files = [];
  try {
    const run = async (w) => {
      const b = await launch({ width: Wd, height: Hd, timeoutMs: 240000 });
      try {
        await b.open(`${srv.url}/${path.basename(tmp)}`);
        const ready = await b.eval("window.__r2ready()");
        if (ready.problems && ready.problems.length) throw new Error("sequence problems: " + ready.problems.join("; "));
        for (let i = w; i < times.length; i += workers) {
          const url = await b.eval(`(function(){ window.__r2seek(${times[i]}); return document.getElementById("stage").toDataURL("image/jpeg", ${quality}); })()`);
          const f = path.join(outDir, `${String(i).padStart(5, "0")}.jpg`);
          fs.writeFileSync(f, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
          files[i] = f;
        }
        return b.logs.slice();
      } finally { await b.close(); }
    };
    const logs = await Promise.all(Array.from({ length: Math.min(workers, times.length) }, (_, w) => run(w)));
    return { dir: outDir, frames: times.length, fps, files, logs: logs.flat(), times };
  } finally {
    await srv.close();
    fs.rmSync(tmp, { force: true });
  }
}
export function encodeMp4(framesDir, out, fps = 30) {
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(framesDir, "%05d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "15", "-preset", "medium", "-movflags", "+faststart", out], { encoding: "utf8" });
  return { ok: r.status === 0, error: (r.stderr || "").slice(0, 400) };
}

// contact strips at the action extremes: a renderer inside the page draws each extreme and tiles them with their labels
export async function renderStrips(project, sequence, canons, outPng, { cols = 4, cellW = 480, only = null, W = null, H = null } = {}) {
  install(project);
  const Wd = W || sequence.width || 1920, Hd = H || sequence.height || 1080;
  const tmp = path.join(project, `.rasanai-2d-strip-${process.pid}-${Date.now().toString(36)}.html`);
  fs.writeFileSync(tmp, fill(fs.readFileSync(path.join(STAGE2D, "templates", "standalone-2d.html"), "utf8"), { FRAME_ID: sequence.id || "film", W: Wd, H: Hd, CANVAS: "#111", SEED: sequence.seed, SEQUENCE: JSON.stringify({ ...sequence, canons }).replace(/<\/script/gi, "<\\/script") }));
  const srv = await serve(project);
  const b = await launch({ width: Wd, height: Hd, timeoutMs: 240000 });
  try {
    await b.open(`${srv.url}/${path.basename(tmp)}`);
    const out = await b.eval(`(function(){ try { var R = window.__r2, ex = R.debug.extremes(); var pick = ${JSON.stringify(only)}; if (pick) ex = ex.filter(function(e){ return pick.indexOf(e.kind) >= 0; });
      var cv = document.createElement("canvas"); Rasan2D.contactSheet(R, ex, { cols: ${cols}, cellW: ${cellW}, canvas: cv, title: ${JSON.stringify((sequence.id || "film") + ": action extremes")} });
      return { n: ex.length, data: cv.toDataURL("image/png"), extremes: ex }; } catch (e) { return { err: e.stack }; } })()`, { await: true });
    if (out.err) throw new Error(out.err);
    fs.mkdirSync(path.dirname(outPng), { recursive: true });
    fs.writeFileSync(outPng, Buffer.from(out.data.slice(out.data.indexOf(",") + 1), "base64"));
    return { png: outPng, extremes: out.extremes, logs: b.logs };
  } finally {
    await b.close();
    await srv.close();
    fs.rmSync(tmp, { force: true });
  }
}

// ------------------------------------------------------------------ the gate
export const FRAME_COST_WARN_MS = 2500;
export const FRAME_COST_MAX_MS = 20000;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1").replace(/<!--[\s\S]*?-->/g, "");
const SMELLS = [
  { re: /Math\.random\s*\(/, rule: "nondeterministic-random", msg: "Math.random() is unseeded: it changes on every seek and every worker", fix: "use Rasan2D.rng(seed) (a seeded generator) or a hash of (seed, actor, part, drawing)" },
  { re: /Date\.now\s*\(|performance\.now\s*\(|new Date\s*\(|crypto\.getRandomValues/, rule: "wall-clock", msg: "reads the wall clock or entropy; frames must be a pure function of the scene's time", fix: "derive everything from t" },
  { re: /requestAnimationFrame\s*\(|setInterval\s*\(|setTimeout\s*\(/, rule: "free-running-loop", msg: "a free-running loop or timer; HyperFrames seeks frame by frame", fix: "remove it: the stage draws on every seek of the scene's timeline" },
  { re: /(?:src|href)\s*=\s*["']https?:\/\/(?!cdn\.jsdelivr\.net\/npm\/gsap)/i, rule: "remote-asset", msg: "loads a script or image over the network at render time", fix: "copy the file into assets/ and load it project-root relative" },
  { re: /\.(?:src)\s*=\s*["']https?:\/\//, rule: "remote-asset", msg: "sets an image source to a remote URL", fix: "copy the file into assets/" },
];
export function staticFindings(text, file, rel, where) {
  const out = [], src = stripComments(text);
  for (const s of SMELLS) if (s.re.test(src)) out.push({ file: rel, severity: "error", rule: where === "runtime" ? "runtime-nondeterministic" : s.rule, message: `${where === "runtime" ? "the installed runtime " : ""}${s.msg}`, fix: s.fix });
  return out;
}

// One composition, in a browser. Returns { findings, stages, couldNotRun }.
export async function checkFile(file, project, { run = null, scorePath = null } = {}) {
  const findings = [];
  const rel = path.relative(project, file);
  const add = (f) => findings.push({ file: rel, ...f });
  const text = fs.readFileSync(file, "utf8");
  for (const f of staticFindings(text, file, rel, "composition")) findings.push(f);
  const root = projectRootOf(file), rtDir = path.join(root, "assets", "rasan2d");
  const missing = RUNTIME_FILES.filter((f) => !exists(path.join(rtDir, f)));
  if (!/assets\/rasan2d\/rasan2d\.js/.test(text)) add({ severity: "error", rule: "runtime-path", message: "doesn't load assets/rasan2d/rasan2d.js (project-root relative)", fix: '<script src="assets/rasan2d/rasan2d.js"></script> inside the <template>, after GSAP and brush.js, character.js, gestures.js' });
  if (missing.length) return { findings: [...findings, { file: rel, severity: "error", rule: "runtime-missing", message: `assets/rasan2d/ is not complete in this project (missing ${missing.join(", ")})`, fix: `node "${path.join(SKILL_DIR, "scripts", "stage2d.mjs")}" install --project "${project}"` }], couldNotRun: null, stages: [] };
  // the installed runtime itself: tampered or stale copies
  let stale = false;
  for (const f of RUNTIME_FILES) {
    const inst = fs.readFileSync(path.join(rtDir, f), "utf8");
    for (const x of staticFindings(inst, path.join(rtDir, f), `assets/rasan2d/${f}`, "runtime")) findings.push(x);
    if (inst !== fs.readFileSync(path.join(STAGE2D, "runtime", f), "utf8")) stale = true;
  }
  if (stale) add({ severity: "warning", rule: "runtime-stale", message: "the installed runtime differs from the skill's current Rasan2D", fix: `node "${path.join(SKILL_DIR, "scripts", "stage2d.mjs")}" install --project "${project}"` });
  const seeded = /\bseed\s*:/.test(stripComments(text)) || /"seed"\s*:/.test(text);
  if (!seeded) add({ severity: "error", rule: "unseeded", message: "Rasan2D.stage / mount is called without a seed: the line boil and the set would not be reproducible", fix: "pass seed: <integer> (the film's seed) to Rasan2D.stage" });

  let couldNotRun = null;
  const stages = [];
  try {
    await withPage(file, async (b, { info }) => {
      for (const l of b.logs.filter((x) => /exception|error/i.test(x)).slice(0, 4)) add({ severity: "warning", rule: "console-error", message: l.slice(0, 240), fix: "fix the script error" });
      for (const e of info.errors || []) add({ severity: "error", rule: "build-failed", message: String(e).slice(0, 240), fix: "fix the error (open the page in a browser to see the stack)" });
      const ok = (info.stages || []).filter((s) => s.ready && !s.error);
      for (const s of info.stages || []) if (s.error) add({ severity: "error", rule: "build-failed", stage: s.id, message: `the 2D scene failed to build: ${s.error}`, fix: "fix the error" });
      if (!ok.length && !(info.stages || []).length) { couldNotRun = "no Rasan2D stage registered (is Rasan2D.stage(...) called synchronously in the scene script?)"; return; }
      for (const st of ok) {
        const r = await b.eval(`(${INSPECT})(${JSON.stringify(st.id)})`);
        stages.push({ id: st.id, ...r.summary });
        const where = { stage: st.id };
        for (const p of r.problems || []) {
          if (/^canon-missing/.test(p)) add({ severity: "error", rule: "canon-missing", ...where, message: p, fix: "give the actor its canon (identity.json: RUN/cast/<id>/identity.json, inlined as CANONS)" });
          else if (/^unseeded/.test(p)) add({ severity: "error", rule: "unseeded", ...where, message: p, fix: "pass an integer seed" });
          else add({ severity: "error", rule: "sequence-problem", ...where, message: p, fix: "fix the sequence (the action list, actors, emotions)" });
        }
        // canon: the identity each actor was built from, validated by the shared rules (lib/canon.mjs)
        for (const a of r.actors || []) {
          if (!a.canon) continue;
          const v = validate2d(a.canon, project);
          for (const e of v.errors) add({ severity: "error", rule: e.rule === "copied-design" ? "copied-design" : "canon-invalid", ...where, actor: a.id, message: `${a.id}: ${e.message}`, fix: e.fix });
          for (const w of v.warnings) add({ severity: "warning", rule: w.rule, ...where, actor: a.id, message: `${a.id}: ${w.message}`, fix: w.fix });
          // the rig draws what the canon says: every fixed trait the runtime knows must show up in the painted parts
          const want = v.features || [];
          for (const smp of a.parts || []) {
            const miss = [];
            if (want.includes("ears.round") && !(smp.names.includes("earL") && smp.names.includes("earR"))) miss.push("round ears");
            if (want.includes("tuft.single") && smp.names.filter((n) => n === "tuft").length !== 1) miss.push("single curved tuft");
            if (want.includes("legs.two-short") && !(smp.names.includes("legL") && smp.names.includes("legR"))) miss.push("two short legs");
            if (want.includes("belly.patch") && ["front", "quarter", "side"].includes(smp.view) && !smp.names.includes("belly")) miss.push("cream belly patch");
            if (want.includes("hands.mitten") && !(smp.names.includes("handL") && smp.names.includes("handR"))) miss.push("cream mittens");
            if (want.includes("tail.pom") && !smp.names.includes("tail")) miss.push("cream tail pom");
            if (miss.length) { add({ severity: "error", rule: "trait-missing", ...where, actor: a.id, at: `${smp.t.toFixed(2)}s`, message: `${a.id}: the canon's fixed trait${miss.length > 1 ? "s" : ""} ${miss.join(", ")} not drawn at ${smp.t.toFixed(2)}s (${smp.view} view)`, fix: "the actor must keep its fixed traits in every shot; don't redraw it per shot" }); break; }
          }
        }
        if (!r.deterministic) add({ severity: "error", rule: "not-seek-safe", ...where, message: "the same time rendered different pixels after seeking elsewhere (A-B-A): something carries state between frames", fix: "every frame must be a pure function of t: no counters, no accumulated state, no unseeded randomness" });
        if (r.blankSd != null && r.blankSd < 6) add({ severity: "error", rule: "blank-frame", ...where, message: `the 2D frame is nearly blank (luma sd ${r.blankSd.toFixed(1)})`, fix: "the actor and the set must be in frame and painted" });
        for (const o of r.outside || []) add({ severity: "error", rule: "actor-out-of-frame", ...where, actor: o.actor, at: `${o.t.toFixed(2)}s`, message: `${o.actor} is only ${(o.inside * 100).toFixed(0)}% inside the usable frame at ${o.t.toFixed(2)}s (shot ${o.shot})`, fix: "move the actor or the camera so the actor stays in frame (keep entrances and exits in a walk that starts or ends off screen)" });
        for (const x of r.bounds || []) add({ severity: x.hard ? "error" : "warning", rule: "pose-bounds", ...where, actor: x.actor, at: `${x.t.toFixed(2)}s`, message: `${x.actor}'s ${x.what} is ${x.value} at ${x.t.toFixed(2)}s (limit ${x.limit})`, fix: "soften the action: squash 0.55 to 1.6, lean within 45 degrees, head tilt within 50" });
        for (const x of r.slides || []) add({ severity: "error", rule: "feet-slide", ...where, actor: x.actor, at: `${x.t.toFixed(2)}s`, message: `${x.actor}'s planted ${x.foot} foot moved ${x.drift.toFixed(1)} px while planted (${x.t0.toFixed(2)}s-${x.t1.toFixed(2)}s)`, fix: "a planted foot has one world position for its whole stance: keep the runtime's foot schedule (walk, hop and turn re-plants)" });
        if (!r.jitterOk.repeat) add({ severity: "error", rule: "boil-not-seeded", ...where, message: "the line boil differs between two asks for the same drawing: it is not a pure function of the seed", fix: "seed the boil from (seed, actor, part, drawing number)" });
        if (!r.jitterOk.parts) add({ severity: "error", rule: "boil-not-seeded", ...where, message: "two body parts share the same boil offsets: the boil is not seeded per part", fix: "seed the boil from (actor, part)" });
        if (!r.jitterOk.actors) add({ severity: "error", rule: "boil-not-seeded", ...where, message: "two actors share the same boil offsets: the boil is not seeded per actor", fix: "seed the boil from (actor, part)" });
        if (!r.jitterOk.drawings) add({ severity: "error", rule: "boil-not-twelve-hz", ...where, message: "the boil does not change between drawings", fix: "the boil is 12 drawings a second (look.boil.hz)" });
        if (!r.poseDeterministic) add({ severity: "error", rule: "pose-not-pure", ...where, message: "pose(t) answered differently for the same t", fix: "pose functions must depend on absolute t only" });
        for (const s of r.emptyShots || []) add({ severity: "warning", rule: "no-event-in-shot", ...where, message: `shot ${s} has no action: every dramatic shot needs an event (a cause, then a reaction)`, fix: "add the action that makes this shot worth cutting to" });
        if (r.cost.ms > FRAME_COST_MAX_MS) add({ severity: "error", rule: "frame-cost", ...where, message: `a frame takes ${r.cost.ms} ms: this scene cannot be rendered in reasonable time`, fix: "fewer actors, a smaller canvas, or fewer set elements" });
        else if (r.cost.ms > FRAME_COST_WARN_MS) add({ severity: "warning", rule: "frame-cost", ...where, message: `a frame takes ${r.cost.ms} ms (about ${Math.round((r.cost.ms / 1000) * st.duration * 30 / 60)} min for this scene)`, fix: "fewer actors or set elements" });
      }
    });
  } catch (e) {
    couldNotRun = String(e.message || e).split("\n")[0];
  }
  // the score's cast link (only when a score is given): identity file, id and fixed traits agree
  if (scorePath && exists(scorePath)) {
    try {
      const score = JSON.parse(fs.readFileSync(scorePath, "utf8")), runDir = run ? path.resolve(run) : path.dirname(path.dirname(path.resolve(scorePath)));
      const v = validateCast(score, runDir, { medium: "painted-2d", traits: traitsFor2d });
      for (const e of v.errors) findings.push({ file: path.relative(project, scorePath), severity: "error", rule: e.rule, actor: e.cast, message: `score.cast ${e.cast}: ${e.message}`, fix: e.fix });
    } catch (e) { findings.push({ file: path.relative(project, scorePath), severity: "error", rule: "score-unreadable", message: String(e.message), fix: "fix the score JSON" }); }
  }
  return { findings, couldNotRun, stages };
}

// runs inside the page: everything the gate measures, as one JSON-able object
const INSPECT = `function (id) {
  var S = window.__rasan2d.stages[id], R = S.renderer, D = S.duration, W = R.W, H = R.H, C = window.Rasan2DKit.character, seq = R.seq || {};
  function hash() { var d = R.ctx.getImageData(0, 0, W, H).data, h = 2166136261 >>> 0; for (var i = 0; i < d.length; i += 12) { h = Math.imul(h ^ d[i], 16777619) >>> 0; h = Math.imul(h ^ d[i + 1], 16777619) >>> 0; h = Math.imul(h ^ d[i + 2], 16777619) >>> 0; } return h; }
  function at(t) { R.renderAt(Math.max(0, Math.min(D, t))); return hash(); }
  var out = { problems: R.debug.problems(), actors: [], bounds: [], outside: [], slides: [], emptyShots: [], summary: {} };
  var T3 = [D * 0.27, D * 0.53, D * 0.81].map(function (x) { return Math.min(x, D - 0.05); });
  var first = T3.map(at); at(0.03); var again = T3.slice().reverse().map(at).reverse();
  out.deterministic = first.every(function (h, i) { return h === again[i]; });
  var sds = [0.1, D * 0.5, Math.max(0.1, D - 0.1)].map(function (t) { R.renderAt(t); return R.stats().sd; });
  out.blankSd = Math.min.apply(null, sds);
  var ids = Object.keys(R.actors), shots = seq.shots && seq.shots.length ? seq.shots : [{ id: "all", from: 0, to: D, actors: ids }];
  var acts = seq.actions || [];
  var inFlight = function (aid, t) { return acts.some(function (a) { return a.actor === aid && (a.enter || a.exit) && t >= a.at - 0.05 && t <= a.at + (a.duration || 0.5) + 0.05; }); };
  var tl = R.timeline();
  var lim = { sy: [0.5, 1.7, 0.6, 1.55], lean: 45, tilt: 50 };
  shots.forEach(function (sh) {
    var vis = sh.actors || ids, evs = acts.filter(function (a) { return a.at >= sh.from - 0.01 && a.at < (sh.to || D) + 0.01; });
    if (!evs.length) out.emptyShots.push(sh.id);
    for (var t = sh.from + 0.05; t < (sh.to || D) - 0.04; t += 0.25) {
      vis.forEach(function (aid) {
        if (!R.actors[aid] || inFlight(aid, t)) return;
        var b = R.debug.bounds(aid, t), ix0 = Math.max(b.x0, W * 0.005), ix1 = Math.min(b.x1, W * 0.995), iy0 = Math.max(b.y0, -H * 0.02), iy1 = Math.min(b.y1, H * 1.0);
        var area = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0)), inside = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0) / area;
        var headIn = b.head[0] > 0 && b.head[0] < W && b.head[1] > 0 && b.head[1] < H;
        if (inside < 0.75 || !headIn) out.outside.push({ actor: aid, t: t, inside: inside, shot: sh.id });
      });
    }
  });
  var seen = {};
  ids.forEach(function (aid) {
    var a = R.actors[aid], parts = [];
    shots.forEach(function (sh) { if (sh.actors && sh.actors.indexOf(aid) < 0) return; [0.25, 0.75].forEach(function (f) { var t = sh.from + (((sh.to || D) - sh.from) * f); var p = tl.pose(aid, t); parts.push({ t: t, names: R.debug.parts(aid, t), view: C.viewName(p.yawBody) }); }); });
    out.actors.push({ id: aid, canon: a.canon, parts: parts });
    // pose bounds, sampled at 12 Hz
    for (var t = 0; t <= D; t += 1 / 12) {
      var p = tl.pose(aid, t), chk = function (what, v, lo, hi, hardLo, hardHi) { var key = aid + what; if (seen[key]) return; if (v < hardLo || v > hardHi) { seen[key] = 1; out.bounds.push({ actor: aid, t: t, what: what, value: +v.toFixed(2), limit: hardLo + ".." + hardHi, hard: true }); } else if (v < lo || v > hi) { seen[key] = 1; out.bounds.push({ actor: aid, t: t, what: what, value: +v.toFixed(2), limit: lo + ".." + hi, hard: false }); } };
      chk("squash (sy)", p.sy, 0.6, 1.55, 0.45, 1.8); chk("body lean", p.lean, -32, 32, -45, 45); chk("head tilt", p.hTilt, -36, 36, -50, 50); chk("lift", p.lift, -0.01, 9, -1, 14);
    }
    // planted feet: the drawn foot must not move for the whole stance
    var sch = R.debug.schedule(aid);
    ["L", "R"].forEach(function (side) {
      sch[side].forEach(function (seg) {
        if (seg.type !== "plant") return;
        var t0 = Math.max(seg.t0, 0) + 0.04, t1 = Math.min(seg.t1, D) - 0.04;
        if (t1 - t0 < 0.25) return;
        var ref = null, worst = 0, wt = t0;
        [0, 0.33, 0.66, 1].forEach(function (f) { var t = t0 + (t1 - t0) * f, c = R.debug.footCentroids(aid, t); if (!c[side]) return; if (!ref) ref = c[side]; var d = Math.hypot(c[side][0] - ref[0], c[side][1] - ref[1]); if (d > worst) { worst = d; wt = t; } });
        if (worst > 0.75) out.slides.push({ actor: aid, foot: side, t: wt, t0: t0, t1: t1, drift: worst });
      });
    });
  });
  // the boil: pure per drawing, different per part, per actor and per drawing
  var a0 = ids[0], j = function (aid, part, t) { return R.debug.jitter(aid, part, t, 8); }, eq = function (x, y) { return x.every(function (v, i) { return v === y[i]; }); };
  out.jitterOk = { repeat: eq(j(a0, "body", 1.0), j(a0, "body", 1.0)) && eq(j(a0, "head", 2.3), j(a0, "head", 2.3)), parts: !eq(j(a0, "body", 1.0), j(a0, "head", 1.0)), actors: ids.length > 1 ? !eq(j(ids[0], "body", 1.0), j(ids[1], "body", 1.0)) : true, drawings: !eq(j(a0, "body", 1.0), j(a0, "body", 1.0 + 1 / R.look.boil.hz + 0.001)) };
  var p1 = JSON.stringify(tl.pose(a0, 1.7)), p2 = JSON.stringify(tl.pose(a0, 1.7)); out.poseDeterministic = p1 === p2;
  // the cost of one frame at the busiest moment
  var cf = window["perf" + "ormance"], tb = D * 0.5, t0 = cf.now(); R.renderAt(tb); R.ctx.getImageData(0, 0, 1, 1); out.cost = { ms: Math.round(cf.now() - t0) };
  R.renderAt(0);
  out.summary = { deterministic: out.deterministic, frame_ms: out.cost.ms, shots: shots.length, actors: ids, boil_hz: R.look.boil.hz, seed: R.seed, drawings_per_s: R.look.boil.hz };
  return out;
}`;

export async function checkProject(project, { file = null, run = null, score = null } = {}) {
  const files = file ? [path.resolve(file)] : collect(project).filter(usesRasan2d);
  const report = { project, files: [], errors: 0, warnings: 0, findings: [], could_not_run: [] };
  if (!files.length) return { ...report, status: "no-2d", message: "no composition uses Rasan2D" };
  for (const f of files) {
    const r = await checkFile(f, project, { run, scorePath: score });
    report.files.push({ file: path.relative(project, f), stages: r.stages });
    if (r.couldNotRun) report.could_not_run.push(`${path.relative(project, f)}: ${r.couldNotRun}`);
    for (const x of r.findings) { report.findings.push(x); if (x.severity === "error") report.errors++; else if (x.severity === "warning") report.warnings++; }
  }
  report.status = report.could_not_run.length ? "could-not-run" : report.errors ? "violations" : "clean";
  return report;
}
