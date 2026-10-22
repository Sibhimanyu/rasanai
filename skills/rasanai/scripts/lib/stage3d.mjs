// Rasan3D tooling shared by stage3d.mjs, crew.mjs and design.mjs: install the runtime into a project, load a
// composition that uses it in a real browser (over the DevTools pipe, so the async 3D build is waited for),
// render stills, and the checks behind `stage3d.mjs check`.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { parseEase, GSAP_PATH, SKILL_DIR } from "./common.mjs";
import { launch } from "./cdp.mjs";

const exists = (p) => !!p && fs.existsSync(p);

export const STAGE = path.join(SKILL_DIR, "stage3d");
export const runtimeVersion = () => (fs.readFileSync(path.join(STAGE, "rasan3d.js"), "utf8").match(/var VERSION = "([^"]+)"/) || [])[1] || "0";

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === "templates") continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
export function install(destRoot) {
  const dst = path.join(destRoot, "assets", "three");
  // the runtime file itself decides (a fix without a version bump still reaches the project)
  const same = ["rasan3d.js", "rasan-music.js", "glsl.js", "character-rig.js"].every((f) => exists(path.join(dst, f)) && fs.readFileSync(path.join(dst, f), "utf8") === fs.readFileSync(path.join(STAGE, f), "utf8"));
  const updated = !same || !exists(path.join(dst, "three.core.min.js"));
  if (updated) {
    fs.rmSync(dst, { recursive: true, force: true });
    copyDir(STAGE, dst);
  }
  return { dir: dst, version: runtimeVersion(), updated, script: "assets/three/rasan3d.js" };
}

// ------------------------------------------------------------------ a local server (fetch() can't read file://)
// three.js loads fonts, SVGs and models with fetch, which file:// pages can't use; HyperFrames serves projects
// over http, so the tools do too: 127.0.0.1 only, files under the root only, plus the vendored GSAP.
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".mp4": "video/mp4", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
export function serve(root) {
  return new Promise((resolve, reject) => {
    const base = path.resolve(root);
    const srv = http.createServer((req, res) => {
      let p;
      try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end(); }
      const file = p === "/__rasanai/gsap.min.js" ? GSAP_PATH : path.join(base, p);
      if (file !== GSAP_PATH && !file.startsWith(base + path.sep) && file !== base) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
      });
    });
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(() => r())) }));
  });
}

// ------------------------------------------------------------------ loading one composition in a browser
export function projectRootOf(file) {
  let d = path.dirname(path.resolve(file));
  for (let i = 0; i < 6; i++) {
    if (exists(path.join(d, "hyperframes.json")) || (exists(path.join(d, "index.html")) && exists(path.join(d, "compositions"))) || exists(path.join(d, "assets", "three", "rasan3d.js"))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return path.dirname(path.resolve(file));
}
// the composition as a standalone page: template unwrapped, project root as base, the vendored GSAP, a seek helper
function pageFor(file, quality) {
  let html = fs.readFileSync(file, "utf8").replace(/<template[^>]*>/gi, "").replace(/<\/template>/gi, "");
  html = html.replace(/<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi, `<script src="/__rasanai/gsap.min.js"></script>`);
  const W = Number((html.match(/data-width="(\d+)"/) || [])[1] || 1920), H = Number((html.match(/data-height="(\d+)"/) || [])[1] || 1080);
  const root = projectRootOf(file);
  const gsapTag = /gsap(\.min)?\.js/.test(html) ? "" : `<script src="/__rasanai/gsap.min.js"></script>`;
  const head = `${gsapTag}<script>window.__timelines=window.__timelines||{};window.__rasan3dQuality=${JSON.stringify(quality)};</script><style>html,body{margin:0;padding:0;background:#000;overflow:hidden;width:${W}px;height:${H}px}</style>`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  const helper = `<script>
window.__r3ready = function(){ var R = window.__rasan3d; if (!R) return Promise.resolve({ stages: [] });
  var S = Object.keys(R.stages).map(function(k){ return R.stages[k]; });
  return Promise.all(S.map(function(s){ return s.readyPromise; })).then(function(){ return { stages: S.map(function(s){ return { id: s.id, ready: s.ready, error: s.error }; }), errors: R.errors.slice() }; }); };
window.__r3seek = function(T){ var L = window.__timelines || {};
  Object.keys(L).forEach(function(k){ try { L[k].pause(); L[k].seek(T, false); } catch (e) {} });
  document.querySelectorAll('[data-start][data-duration]').forEach(function(el){ if (el.hasAttribute('data-composition-id')) return; var s = parseFloat(el.getAttribute('data-start')), d = parseFloat(el.getAttribute('data-duration')); if (isFinite(s) && isFinite(d)) el.style.visibility = (T >= s && T < s + d) ? '' : 'hidden'; });
  var R = window.__rasan3d; if (R) Object.keys(R.stages).forEach(function(k){ var s = R.stages[k]; s.draw(s.tl.time(), true); });
  return true; };
</script>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, helper + "</body>") : html + helper;
  const tmp = path.join(root, `.rasanai-3d-${process.pid}-${Math.random().toString(36).slice(2, 8)}.html`);
  fs.writeFileSync(tmp, html);
  return { tmp, W, H, root };
}
export async function withComposition(file, quality, fn) {
  const { tmp, W, H, root } = pageFor(file, quality);
  let b, srv;
  try {
    srv = await serve(root);
    b = await launch({ width: W, height: H, timeoutMs: 180000 });
    await b.open(`${srv.url}/${path.basename(tmp)}`);
    // fonts first (canvas text textures read them), then every stage's build
    await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){ return true; }) : true", { await: true });
    const ready = await b.eval("window.__r3ready()", { await: true });
    return await fn(b, { W, H, root, ready });
  } finally {
    if (b) await b.close();
    if (srv) await srv.close();
    fs.rmSync(tmp, { force: true });
  }
}
export async function stills(file, times, dir, quality = "final") {
  fs.mkdirSync(dir, { recursive: true });
  return withComposition(file, quality, async (b, { W, H, ready }) => {
    const files = [];
    for (const t of times) {
      await b.eval(`window.__r3seek(${Number(t)})`);
      const png = path.join(dir, `t${Number(t).toFixed(3)}.png`);
      fs.writeFileSync(png, await b.screenshot());
      files.push({ t, png });
    }
    return { files, W, H, ready, logs: b.logs };
  });
}

// ------------------------------------------------------------------ the gate
// Errors are only for what breaks a render: a build that fails, frames that depend on state (not seek-safe), a blank
// frame, wall clock / Math.random / a free-running loop / a second WebGL context / remote assets / interactive controls,
// a frame too costly to render, a missing runtime. Everything else is TASTE: a warning the critics weigh, which the
// scene silences by stating its intent: declare: { intent: { "<rule>": "<why, 12+ characters>" } }. The report lists
// every declared intent so the critics see the reason and judge it.
export const MIN_INTENT = 12;           // characters of reason an intent needs
export const FRAME_COST_WARN_MS = 2500; // a final frame slower than this: warning, with the estimated render time
export const FRAME_COST_MAX_MS = 20000; // a final frame slower than this cannot be rendered: error
const SMELLS = [
  { re: /Math\.random\s*\(/, rule: "nondeterministic-random", sev: "error", msg: "Math.random() changes every seek", fix: "use a seeded generator: k.rng(seed) or Rasan3D.rng(seed)" },
  { re: /Date\.now\s*\(|performance\.now\s*\(|new Date\s*\(/, rule: "wall-clock", sev: "error", msg: "reads the wall clock; frames must be a pure function of the scene's time", fix: "derive everything from t in pose(t, k)" },
  { re: /requestAnimationFrame\s*\(|setAnimationLoop\s*\(/, rule: "free-running-loop", sev: "error", msg: "a free-running render loop; HyperFrames seeks frame by frame", fix: "remove it: the stage draws on every seek of the scene's timeline" },
  { re: /new\s+(?:THREE\.)?WebGLRenderer\s*\(/, rule: "own-renderer", sev: "error", msg: "creates its own WebGLRenderer (a GL context per scene runs out at ~16 and skips the motion blur, DoF and grade)", fix: "use Rasan3D.stage(...); it shares one renderer across the film" },
  { re: /OrbitControls|TrackballControls|FlyControls/, rule: "interactive-controls", sev: "error", msg: "interactive controls in a rendered film", fix: "drive the camera from camera keys" },
  { re: /MeshNormalMaterial/, rule: "placeholder-material", sev: "warning", msg: "MeshNormalMaterial is the rainbow debug look", fix: "give it a material from the look (k.material('clay'|'glass'|…, { color }), or your own shader); if the debug look is the point, declare intent['placeholder-material'] with the reason" },
  { re: /TorusKnotGeometry|new\s+(?:THREE\.)?(?:Torus|Icosahedron|Dodecahedron|Octahedron)Geometry/, rule: "stock-primitive", sev: "warning", msg: "a stock demo primitive (torus knot, icosahedron) is the 'three.js demo' tell", fix: "model the film's own object (the product, its UI as panels, the logo extruded, type, a shape from the motif) or declare intent['stock-primitive'] if the primitive is deliberate" },
  { re: /cdn\.jsdelivr\.net\/npm\/three|unpkg\.com\/three|three@\d/, rule: "remote-three", sev: "error", msg: "loads three.js from a CDN (a second copy, network at render time)", fix: 'load assets/three/rasan3d.js and use k.THREE' },
  { re: /\.load\(\s*["']https?:\/\//, rule: "remote-asset", sev: "error", msg: "loads a model or texture over the network at render time", fix: "copy the file into assets/ and load it project-root relative" },
];

// the intents a stage declared that count (a rule id -> a reason of MIN_INTENT+ characters); legacy declare.linear = track names
function intentsOf(manifest) {
  const d = (manifest && manifest.declared) || {};
  const out = {}, short = [];
  for (const [rule, why] of Object.entries(d.intent || {})) {
    if (typeof why === "string" && why.trim().length >= MIN_INTENT) out[rule] = why.trim();
    else short.push(rule);
  }
  return { intent: out, short };
}

export async function checkFile(file, project, M, quality) {
  const findings = [];
  const add = (f) => findings.push({ file: path.relative(project, file), ...f });
  const text = fs.readFileSync(file, "utf8");
  for (const s of SMELLS) if (s.re.test(text.replace(/<!--[\s\S]*?-->/g, ""))) add({ severity: s.sev, rule: s.rule, message: s.msg, fix: s.fix });
  if (!/assets\/three\/rasan3d\.js/.test(text)) add({ severity: "error", rule: "runtime-path", message: "doesn't load assets/three/rasan3d.js (project-root relative)", fix: '<script src="assets/three/rasan3d.js"></script> inside the <template>, after GSAP' });
  if (!exists(path.join(projectRootOf(file), "assets", "three", "rasan3d.js"))) return { findings: [...findings, { file: path.relative(project, file), severity: "error", rule: "runtime-missing", message: "assets/three/ (the Rasan3D runtime) is not installed in this project", fix: `node "${path.join(SKILL_DIR, "scripts", "stage3d.mjs")}" install --project "${project}"` }], couldNotRun: null, stages: [] };

  const easeSet = Object.values((M && M.easing) || {}).map(parseEase);
  const inSet = (e) => easeSet.some((x) => x.family === e.family && x.dir === e.dir);
  let couldNotRun = null;
  const stages = [];
  const intentNotes = new Map();
  try {
    await withComposition(file, quality, async (b, { ready }) => {
      for (const s of ready.stages || []) if (s.error) add({ severity: "error", rule: "build-failed", stage: s.id, message: `the 3D scene failed to build: ${s.error}`, fix: "fix the error (open the page in a browser to see the stack)" });
      for (const l of b.logs.filter((x) => /exception|error/i.test(x)).slice(0, 4)) add({ severity: "warning", rule: "console-error", message: l.slice(0, 240), fix: "fix the script error" });
      const ids = (ready.stages || []).filter((s) => s.ready && !s.error).map((s) => s.id);
      if (!ids.length && !(ready.stages || []).length) { couldNotRun = "no Rasan3D stage registered (is Rasan3D.stage(...) called synchronously in the scene script?)"; return; }
      for (const id of ids) {
        const r = await b.eval(`(function(){
          var s = window.__rasan3d.stages[${JSON.stringify(id)}], D = s.duration || s.tl.duration(), fps = s.fps;
          function hash(){ var c = s.canvas, x = s.ctx2d, d = x.getImageData(0, 0, c.width, c.height).data, h = 2166136261 >>> 0, sum = 0, sum2 = 0, n = 0;
            for (var i = 0; i < d.length; i += 4) { h = Math.imul(h ^ d[i], 16777619) >>> 0; h = Math.imul(h ^ d[i + 1], 16777619) >>> 0; h = Math.imul(h ^ d[i + 2], 16777619) >>> 0; h = Math.imul(h ^ d[i + 3], 16777619) >>> 0;
              var l = (d[i] + d[i + 1] + d[i + 2]) / 3 * (d[i + 3] / 255); sum += l; sum2 += l * l; n++; }
            var mean = sum / n; return { h: h, mean: mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) }; }
          function seek(t){ window.__r3seek(t); return hash(); }
          // three moments, each rendered, then rendered again after seeking elsewhere: any difference is state
          var T3 = [D * 0.27, D * 0.53, D * 0.81].map(function(x){ return Math.min(x, D - 0.05); });
          var first = T3.map(seek); seek(0.02); var again = T3.slice().reverse().map(seek).reverse();
          var a1 = first[0], a2 = again[0], b1 = first[2], z = { h: 0 };
          var same = first.every(function(h, i){ return h.h === again[i].h; });
          var blank = [0.1, D * 0.5, Math.max(0.1, D - 0.1)].map(function(t){ var hh = seek(t); return { t: t, sd: hh.sd, mean: hh.mean }; });
          // screen travel per frame across the scene (px/frame), from the stage's own probes
          var travel = []; var N = 24;
          for (var i = 0; i <= N; i++) { var t = Math.min(D - 0.001, (D * i) / N); travel.push({ t: +t.toFixed(3), px: +s._travel(t, 0.5 / fps).toFixed(2) }); }
          s.draw(s.tl.time(), true);
          return { deterministic: same, hashes: first.map(function(h){ return h.h; }).concat(again.map(function(h){ return h.h; })), blank: blank, travel: travel, manifest: s.manifest() };
        })()`);
        // the cost of one final frame at the busiest moment, measured to completion (getImageData waits for the GPU)
        const busiest = r.travel.reduce((a, x) => (x.px > a.px ? x : a), r.travel[0] || { t: 0, px: 0 });
        const cost = await b.eval(`(function(){ window.__rasan3dQuality = "final"; var s = window.__rasan3d.stages[${JSON.stringify(id)}], c = window["perf" + "ormance"];
          var t0 = c.now(); s.draw(${busiest.t}, true); s.ctx2d.getImageData(0, 0, 1, 1); var ms = c.now() - t0; window.__rasan3dQuality = ${JSON.stringify(quality)}; return { ms: Math.round(ms), samples: s.stats.lastSamples }; })()`);
        const { intent, short } = intentsOf(r.manifest);
        stages.push({ id, deterministic: r.deterministic, cost, busiest, manifest: r.manifest, intents: intent });
        const where = { stage: id };
        // a taste finding is dropped when the stage declared the intent for its rule (and noted in the report)
        const taste = (f) => {
          if (intent[f.rule]) return;
          if (short.includes(f.rule)) f = { ...f, fix: `${f.fix}; your declare.intent["${f.rule}"] reason is under ${MIN_INTENT} characters, so it doesn't count` };
          pushOnce(f);
        };
        for (const [rule, why] of Object.entries(intent)) intentNotes.set(`${id}|${rule}`, { severity: "info", rule: "declared-intent", stage: id, declares: rule, message: `intent for ${rule}: ${why}`, fix: "critics: judge whether the intent holds on screen" });
        if (!r.deterministic) add({ severity: "error", rule: "not-seek-safe", ...where, message: "the same time rendered different pixels after seeking elsewhere: something carries state between frames", fix: "make pose(t, k) set every animated property from t alone (no += on positions, no counters, no simulation state)" });
        for (const x of r.blank) if (x.sd < 0.6 && !(r.manifest.declared && r.manifest.declared.plain)) add({ severity: "error", rule: "blank-frame", ...where, at: `${x.t.toFixed(2)}s`, message: `the 3D layer is a flat field at ${x.t.toFixed(2)}s (luma sd ${x.sd.toFixed(2)})`, fix: "check the camera aims at the subject and the subject is lit and in front of the near plane" });
        // eases (pose keys are grouped: one finding per rule and ease, naming how many keys share it)
        const seenEase = new Map();
        const pushOnce = (f) => {
          const key = f.track && f.track.startsWith("pose.") ? `${f.rule}|${f.ease || f.message}` : null;
          if (!key) return add(f);
          if (seenEase.has(key)) { seenEase.get(key).count++; return; }
          const g = { ...f, track: "pose()", count: 1 };
          seenEase.set(key, g);
          add(g);
        };
        for (const tr of r.manifest.tracks || []) {
          for (const e of tr.eases || []) {
            if (e === "(implicit)") taste({ severity: "warning", rule: "implicit-ease", ...where, track: tr.name, message: `track "${tr.name}" has a key with no ease (falls back to power2.inOut)`, fix: `name it on the key: [t, value, "${((M && M.easing) || {}).move || "power3.inOut"}"]` });
            else if (e === "(function)") taste({ severity: "warning", rule: "custom-ease", ...where, track: tr.name, message: `track "${tr.name}" eases with a function, which can't be checked against motion.md`, fix: "use a named GSAP ease from motion.md" });
            else {
              const pe = parseEase(e);
              const declared = (r.manifest.declared && r.manifest.declared.linear) || [];
              if (pe.family === "none" && !inSet(pe) && !declared.includes(tr.name)) taste({ severity: "warning", rule: "linear-drift", ...where, track: tr.name, message: `track "${tr.name}" moves at a constant speed (ease none): the screensaver look`, fix: "ease it (a move eases in and out and lands), or state the intent: declare: { intent: { \"linear-drift\": \"why constant speed is the shot (a conveyor, a clock hand, the endless glide)\" } }" });
              else if (pe.family !== "none" && easeSet.length && !inSet(pe)) taste({ severity: "warning", rule: "ease-outside-set", ...where, track: tr.name, ease: e, message: `track "${tr.name.startsWith("pose.") ? "pose()" : tr.name}" uses ${e}, not one of motion.md's eases (${Object.values(M.easing).join(", ")})`, fix: `use "${M.easing.move || Object.values(M.easing)[0]}", or state the intent: declare.intent["ease-outside-set"] = "<why this ease is the shot>"` });
            }
          }
          if (tr.fn) pushOnce({ severity: "info", rule: "function-track", ...where, track: tr.name, message: `track "${tr.name}" is a function of t (an orbit or a path): its ease is whatever the function does`, fix: "fine when it eases (Rasan3D.orbit eases); make sure it lands" });
        }
        // motion: blur on fast moves, a rest somewhere, and no ending at full speed into a cut
        const fast = r.travel.filter((x) => x.px > 6);
        if (fast.length && r.manifest.motionBlur === false) taste({ severity: "warning", rule: "fast-without-blur", ...where, at: `${fast[0].t}s`, message: `moves ${fast[0].px} px per frame with motion blur off: it will strobe`, fix: "remove motionBlur: false (the default is a 180° shutter)" });
        const still = r.travel.filter((x) => x.px < 0.4);
        if (r.travel.length > 4 && !still.length) taste({ severity: "warning", rule: "never-rests", ...where, message: "the 3D world never comes to rest: every sampled moment is moving", fix: "land the camera and hold (0.4 s or more) where the line is read, or declare intent['never-rests'] when constant motion is the shot (an endless flight)" });
        if (cost.ms > FRAME_COST_MAX_MS) add({ severity: "error", rule: "frame-cost", ...where, message: `a final frame at ${busiest.t}s takes ${cost.ms} ms (${cost.samples} samples), over the ${FRAME_COST_MAX_MS / 1000} s ceiling: this scene cannot be rendered in reasonable time`, fix: `lower motionBlur.samples, cut march steps or resolution of heavy passes, drop shadows on small lights, merge geometry${r.manifest.ao ? "; the ambient occlusion re-renders the scene per recompute: ao: { every: 8, resolution: 0.5, samples: 8 } cuts it" : ""}` });
        else if (cost.ms > FRAME_COST_WARN_MS) add({ severity: "warning", rule: "frame-cost", ...where, message: `a final frame at ${busiest.t}s takes ${cost.ms} ms (${cost.samples} samples): about ${Math.round(((cost.ms / 1000) * r.manifest.duration * r.manifest.fps) / 60)} min to render this scene`, fix: `lower motionBlur.samples${r.manifest.ao ? ", ao: { every, resolution }" : ""}, drop shadows on small lights, merge geometry, or shrink transmission (glass) to the hero` });
      }
    });
  } catch (e) {
    couldNotRun = String(e.message || e).split("\n")[0];
  }
  // static (text) taste rules honour the stage's declared intent too
  const allIntent = new Set(stages.flatMap((s) => Object.keys(s.intents || {})));
  const kept = findings.filter((f) => !(f.severity === "warning" && !f.stage && allIntent.has(f.rule)));
  for (const f of findings) if (!kept.includes(f)) { const st = stages.find((s) => s.intents && s.intents[f.rule]); if (st) intentNotes.set(`${st.id}|${f.rule}`, { file: f.file, severity: "info", rule: "declared-intent", stage: st.id, declares: f.rule, message: `intent for ${f.rule}: ${st.intents[f.rule]}`, fix: "critics: judge whether the intent holds on screen" }); }
  for (const n of intentNotes.values()) kept.push({ file: path.relative(project, file), ...n });
  return { findings: kept, couldNotRun, stages };
}

export function collect(dir, res = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "renders", "snapshots", ".superseded", ".git", "assets", ".media", "capture"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) collect(p, res);
    else if (f.name.endsWith(".html") && !f.name.startsWith("__") && !f.name.startsWith(".rasanai")) res.push(p);
  }
  return res;
}
export function uses3d(file) {
  return /Rasan3D\.stage\s*\(|assets\/three\/rasan3d\.js/.test(fs.readFileSync(file, "utf8"));
}


// a standalone page (a key frame) that draws in 3D: open it as is, wait for its stages, capture it
export async function pageStill(file, png, W, H) {
  const srv = await serve(path.dirname(path.resolve(file)));
  const b = await launch({ width: W, height: H, timeoutMs: 120000 });
  try {
    await b.open(`${srv.url}/${encodeURIComponent(path.basename(file))}`);
    const r = await b.eval(`(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function(){ var R = window.__rasan3d; if (!R) return { stages: 0, errors: [] };
      var S = Object.keys(R.stages).map(function(k){ return R.stages[k]; });
      return Promise.all(S.map(function(s){ return s.readyPromise; })).then(function(){ S.forEach(function(s){ s.draw(s.tl.time(), true); }); return { stages: S.length, errors: R.errors.slice() }; }); })`, { await: true });
    fs.writeFileSync(png, await b.screenshot());
    return { ...r, logs: b.logs };
  } finally {
    await b.close();
    await srv.close();
  }
}
