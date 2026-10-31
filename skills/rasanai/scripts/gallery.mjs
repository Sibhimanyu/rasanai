#!/usr/bin/env node
// The move and kit gallery: proof that runtime/rasan-moves.js and the DOM / Three.js kits run in a real browser, seek-safely.
// For every move (library/moves/*.json, "code.example") and every kit (KITS below) it writes a tiny self-contained HyperFrames-style
// composition (one paused GSAP timeline, 960x540, placeholder content, procedural canvas pictures, no network, no Codex), renders it by
// SEEKING in headless Chrome (scripts/lib/cdp.mjs, the same pipe driver the 3D checks use), and writes a contact sheet per demo plus one
// overview sheet to library/gallery/ (PNG only) and library/gallery/report.json.
//
//   node gallery.mjs                      all moves and kits
//   node gallery.mjs --only dot-field-resolve-to-photo,medium-sticker     some demos (ids; the overview and report are merged)
//   node gallery.mjs --moves | --kits     only one group
//   node gallery.mjs --mp4                also encode the overview as an MP4 (ffmpeg, from the seeked frames; a few seconds)
//   node gallery.mjs --keep               keep the work folder (demo html files, frames) and print its path
//
// Checks per demo (report.json: status ok | fixed | still-broken):
//   error   a page exception, a console error, a thrown build, or a failed ready promise
//   blank   every sampled frame is (nearly) one flat colour
//   static  nothing moves between the first and the last sample
//   jump    the same time rendered twice (after seeking away and back, forward and backward) differs
// "fixed" and "still-broken" come from the FIXED and KNOWN tables below (set by looking at the sheets); a demo that fails a check is
// always still-broken, whatever the tables say.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, SKILL_DIR, GSAP_PATH } from "./lib/common.mjs";
import { launch } from "./lib/cdp.mjs";

const args = parseArgs();
const OUT = path.join(SKILL_DIR, "library", "gallery");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-gallery-"));
const FW = 960, FH = 540;
const RT = path.join(SKILL_DIR, "runtime");
const S3 = path.join(SKILL_DIR, "stage3d");
const fileUrl = (p) => "file://" + p;
const rt = (f) => fileUrl(path.join(RT, f));
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// Set by hand after looking at the sheets (the checks cannot see "looks broken"): what was fixed, what is still wrong.
const FIXED = JSON.parse(fs.existsSync(path.join(SKILL_DIR, "scripts", "gallery-notes.json")) ? fs.readFileSync(path.join(SKILL_DIR, "scripts", "gallery-notes.json"), "utf8") : "{}");
const FIXED_MAP = FIXED.fixed || {}, KNOWN = FIXED.broken || {};
// the overview tile shows the sheet frame (0-5 of the six sampled times) that carries the move's key state; default 3
const SAMPLE = FIXED.sample || {};

// ---------------------------------------------------------------- the demos
// A kit demo is { id, title, kind: "kit", scripts: [urls], css, body: html, code: js run after the stage exists (tl, stage in scope), dur }
const KITS = [];
const kitFile = path.join(SKILL_DIR, "scripts", "gallery-kits.mjs");
if (fs.existsSync(kitFile)) { const m = await import(fileUrl(kitFile)); for (const k of m.kits({ rt, fileUrl, RT, S3, SKILL_DIR, FW, FH })) KITS.push(k); }

function moveDemos() {
  const idx = J(path.join(SKILL_DIR, "library", "moves", "index.json")), out = [];
  for (const m of idx.moves) {
    const j = J(path.join(SKILL_DIR, "library", "moves", m.file));
    if (!j.code || !j.code.example) { out.push({ id: m.id, title: m.name, kind: "move", fn: "", error: "no code.example in the move json" }); continue; }
    out.push({ id: m.id, title: `${m.n}. ${m.name}`, kind: "move", fn: j.code.fn, scripts: [rt("rasan-image-fx.js"), rt("rasan-moves.js"), fileUrl(path.join(S3, "rasan3d.js"))], code: j.code.example, body: "" });
  }
  return out;
}

function page(d) {
  const tag = (u) => `<script src="${u}"></script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}#stage{position:relative;width:${FW}px;height:${FH}px;overflow:hidden;background:#000}${d.css || ""}</style>
<script src="${fileUrl(GSAP_PATH)}"></script>${(d.scripts || []).map(tag).join("")}</head><body>
<div id="root" data-composition-id="demo" data-width="${FW}" data-height="${FH}"><div id="stage">${d.body || ""}</div></div>
<script>
window.__timelines = window.__timelines || {};
var stage = document.getElementById("stage"), tl = gsap.timeline({ paused: true }), __end = 0, __err = null;
window.__timelines.demo = tl;
window.onerror = function (m) { __err = __err || String(m); };
window.addEventListener("unhandledrejection", function (e) { __err = __err || "rejection: " + (e.reason && e.reason.message || e.reason); });
var hasMoves = typeof RasanMoves !== "undefined";
var photo = hasMoves ? RasanMoves.placeholder.photo(1, 960, 540) : null, photo2 = hasMoves ? RasanMoves.placeholder.photo(4, 960, 540) : null, photo3 = hasMoves ? RasanMoves.placeholder.photo(2, 960, 540) : null;
window.__dur = ${d.dur || 0};
try {
${d.code || ""}
} catch (e) { __err = (e && e.stack || e).toString().split("\\n").slice(0, 3).join(" | "); }
var __res = typeof __result !== "undefined" ? __result : null;
if (__res && __res.end) __end = __res.end;
if (!window.__dur) window.__dur = Math.min(6.5, Math.max(4, (tl.duration() || __end) + 0.7));
tl.to({}, { duration: window.__dur }, 0);
tl.pause(0);
window.__seek = function (t) { tl.pause(); tl.seek(t, false); return t; };
window.__ready = (async function () { try { if (hasMoves) await RasanMoves.ready(); if (window.__hf && window.__hf.buildReady) await Promise.all(Object.values(window.__hf.buildReady)); if (window.__extraReady) await window.__extraReady; if (document.fonts) await document.fonts.ready; } catch (e) { __err = __err || String(e && e.message || e); } tl.seek(0, false); return { err: __err, dur: window.__dur }; })();
</script></body></html>`;
}

// moves: the example is a statement that calls RasanMoves; capture its return value as __result
function wrapMove(d) { return { ...d, code: `var __result = ${d.code.replace(/;\s*$/, "")};` }; }

// ---------------------------------------------------------------- pixels via ffmpeg (no image libs)
function gray(png, w = 96, h = 54) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-vf", `scale=${w}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { input: png, maxBuffer: 1 << 24 });
  return r.status === 0 ? new Uint8Array(r.stdout) : null;
}
const changed = (a, b, th = 24) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > th) n++; return n / a.length; };
const meanDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const stdev = (a) => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); };

// ---------------------------------------------------------------- render one demo
const FR = [0.04, 0.22, 0.4, 0.58, 0.78, 0.97];
async function shoot(b, t) {
  await b.eval(`window.__seek(${t})`);
  await b.eval("new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})", { await: true });
  return b.screenshot();
}
async function renderDemo(b, d, dir) {
  const rep = { id: d.id, kind: d.kind, title: d.title, fn: d.fn || undefined, status: "ok", notes: [], metrics: {} };
  if (d.error) { rep.status = "still-broken"; rep.notes.push(d.error); return { rep, frames: [] }; }
  for (const [n, txt] of Object.entries(d.assets || {})) fs.writeFileSync(path.join(dir, n), txt);
  const file = path.join(dir, d.id + ".html");
  fs.writeFileSync(file, page(d.kind === "move" ? wrapMove(d) : d));
  b.logs.length = 0;
  try { await b.open(fileUrl(file), { waitMs: 45000 }); } catch (e) { rep.status = "still-broken"; rep.notes.push("page did not load: " + e.message); return { rep, frames: [] }; }
  let info;
  try { info = await b.eval("window.__ready", { await: true }); } catch (e) { rep.status = "still-broken"; rep.notes.push("ready failed: " + e.message); return { rep, frames: [] }; }
  const dur = info.dur; rep.duration_s = Math.round(dur * 10) / 10;
  const errs = [];
  if (info.err) errs.push(info.err);
  const frames = [], times = FR.map((f) => Math.round(f * dur * 100) / 100);
  for (const t of times) frames.push(await shoot(b, t));
  const g = frames.map((f) => gray(f));
  if (g.some((x) => !x)) { rep.status = "still-broken"; rep.notes.push("ffmpeg could not read a frame"); return { rep, frames }; }
  // seek determinism: T1, T2, then away and back in the other order
  const T1 = times[2], T2 = times[4];
  const a1 = g[2], a2 = g[4];
  await shoot(b, 0.02); const b2 = gray(await shoot(b, T2)); await shoot(b, dur * 0.15); const b1 = gray(await shoot(b, T1)); const b2b = gray(await shoot(b, T2));
  const jump = Math.max(meanDiff(a1, b1), meanDiff(a2, b2), meanDiff(a2, b2b));
  const sd = Math.max(...g.map(stdev)), mov = Math.max(...g.map((x) => meanDiff(x, g[0]))), chg = Math.max(...g.map((x) => changed(x, g[0])), ...g.slice(1).map((x, i) => changed(x, g[i])));
  rep.metrics = { max_stddev: +sd.toFixed(1), motion: +mov.toFixed(1), changed_px: +(chg * 100).toFixed(2), seek_diff: +jump.toFixed(2) };
  const logs = b.logs.filter((l) => !/favicon|ERR_FILE_NOT_FOUND.*(map|ico)|GPU stall|WebGL.*(performance|ReadPixels)|Automatic fallback to software/i.test(l));
  if (logs.length) errs.push(...logs.slice(0, 3));
  if (errs.length) { rep.status = "still-broken"; rep.notes.push("error: " + errs.join(" || ").slice(0, 400)); }
  if (sd < 3) { rep.status = "still-broken"; rep.notes.push("blank: frames are one flat colour"); }
  if (mov < 1.2 && chg < 0.004 && !d.staticOk) { rep.status = "still-broken"; rep.notes.push("static: nothing moves across the demo"); }
  if (jump > 1.0) { rep.status = "still-broken"; rep.notes.push(`jump: the same time renders differently (diff ${jump.toFixed(2)})`); }
  if (rep.status === "ok" && FIXED_MAP[d.id]) { rep.status = "fixed"; rep.notes.push(FIXED_MAP[d.id]); }
  if (KNOWN[d.id]) { rep.status = "still-broken"; rep.notes.push(KNOWN[d.id]); }
  return { rep, frames, times };
}

// ---------------------------------------------------------------- sheets (a second Chrome with a big viewport screenshots an HTML grid)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function sheet(sb, html, w, h, png) {
  const f = path.join(WORK, "sheet-" + path.basename(png, ".png") + ".html");
  fs.writeFileSync(f, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#15171e;color:#e8e6df;font:12px/1.3 -apple-system,Helvetica,sans-serif}.t{padding:6px 8px;display:flex;justify-content:space-between}.g{display:grid;gap:3px;padding:0 3px 3px}.g img{width:100%;display:block}.c{position:relative}.c i{position:absolute;left:3px;top:2px;font:10px monospace;color:#fff;background:#0009;padding:0 3px;border-radius:2px;font-style:normal}.s{position:absolute;right:3px;top:2px;font:10px monospace;padding:0 4px;border-radius:2px;color:#fff}</style><div id="s" style="width:${w}px">${html}</div>`);
  await sb.open(fileUrl(f), { waitMs: 30000 });
  await sb.eval("Promise.all([].map.call(document.images,function(i){return i.decode?i.decode().catch(function(){}):0}))", { await: true });
  const hh = await sb.eval("document.getElementById('s').offsetHeight");
  fs.writeFileSync(png, await sb.screenshot({ clip: { x: 0, y: 0, width: w, height: hh }, beyond: true }));
}
const COLOR = { ok: "#1c8a4b", fixed: "#2f6bff", "still-broken": "#d6362b" };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const only = args.only && args.only !== true ? String(args.only).split(",").map((s) => s.trim()) : null;
  let demos = [...(args.kits ? [] : moveDemos()), ...(args.moves ? [] : KITS)];
  if (only) demos = demos.filter((d) => only.includes(d.id));
  if (!demos.length) { console.error("no demos matched"); process.exit(2); }
  const frameDir = path.join(WORK, "frames"); fs.mkdirSync(frameDir, { recursive: true });
  const b = await launch({ width: FW, height: FH, timeoutMs: 90000 });
  const sb = await launch({ width: 1700, height: 1500, timeoutMs: 60000 });
  const results = [];
  for (const d of demos) {
    let r;
    try { r = await renderDemo(b, d, WORK); } catch (e) { r = { rep: { id: d.id, kind: d.kind, title: d.title, status: "still-broken", notes: ["harness: " + e.message] }, frames: [] }; }
    const { rep, frames, times } = r;
    const fdir = path.join(frameDir, d.id); fs.mkdirSync(fdir, { recursive: true });
    const names = frames.map((f, i) => { const p = path.join(fdir, i + ".png"); fs.writeFileSync(p, f); return p; });
    rep.sheet = `${d.id}.png`;
    if (names.length) {
      const cells = names.map((p, i) => `<div class="c"><img src="${fileUrl(p)}"><i>${times[i]}s</i></div>`).join("");
      const head = `<div class="t"><b>${esc(d.title)}</b><span>${esc(rep.fn || d.fn || "")} &middot; ${rep.duration_s || ""}s &middot; <b style="color:${COLOR[rep.status]}">${rep.status}</b></span></div>`;
      await sheet(sb, head + `<div class="g" style="grid-template-columns:repeat(3,1fr)">${cells}</div>`, 780, 0, path.join(OUT, rep.sheet));
    } else {
      const head = `<div class="t"><b>${esc(d.title)}</b><span style="color:#d6362b">${esc(rep.notes.join(" | ").slice(0, 160))}</span></div>`;
      await sheet(sb, head, 780, 0, path.join(OUT, rep.sheet));
    }
    results.push({ rep, names });
    console.log(`${rep.status.padEnd(12)} ${d.id}${rep.notes.length ? "  " + rep.notes.join(" | ").slice(0, 160) : ""}`);
  }
  await b.close();

  // report.json (merged with the previous one when --only)
  const repFile = path.join(OUT, "report.json");
  let prev = []; if (only && fs.existsSync(repFile)) prev = (J(repFile).demos || []).filter((x) => !only.includes(x.id));
  const all = [...prev, ...results.map((r) => r.rep)];
  const order = [...moveIds(), ...KITS.map((k) => k.id)]; all.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
  const count = (s) => all.filter((x) => x.status === s).length;
  fs.writeFileSync(repFile, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), size: `${FW}x${FH}`, summary: { total: all.length, ok: count("ok"), fixed: count("fixed"), "still-broken": count("still-broken") }, demos: all }, null, 1) + "\n");

  // overview: one mid frame per demo (full runs only: a partial run has no frames for the others)
  const tiles = all.map((x) => {
    const mid = path.join(frameDir, x.id, (SAMPLE[x.id] ?? 3) + ".png"), have = fs.existsSync(mid);
    return { x, mid, have };
  });
  // frames of demos not rendered in this run are re-read from their sheets' absence: only render tiles we have frames for
  const cells = tiles.filter((t) => t.have).map((t) => `<div class="c"><img src="${fileUrl(t.mid)}"><i>${esc(t.x.id)}</i><span class="s" style="background:${COLOR[t.x.status]}">${t.x.status}</span></div>`).join("");
  if (cells && !only) await sheet(sb, `<div class="t"><b>RasanAI move and kit gallery</b><span>${all.length} demos &middot; ${count("ok")} ok &middot; ${count("fixed")} fixed &middot; ${count("still-broken")} still-broken</span></div><div class="g" style="grid-template-columns:repeat(6,1fr)">${cells}</div>`, 1680, 0, path.join(OUT, "overview.png"));
  // overview mp4: the seeked frames of every demo in turn, encoded by ffmpeg (a few seconds)
  if (args.mp4) {
    const list = [];
    for (const t of tiles) for (let i = 0; i < 6; i++) { const p = path.join(frameDir, t.x.id, i + ".png"); if (fs.existsSync(p)) list.push(p); }
    if (list.length) {
      const txt = path.join(WORK, "list.txt"); fs.writeFileSync(txt, list.map((p) => `file '${p}'\nduration 0.45`).join("\n") + `\nfile '${list[list.length - 1]}'\n`);
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", txt, "-vf", "scale=640:360,fps=15,format=yuv420p", "-c:v", "libx264", "-crf", "30", "-preset", "veryfast", path.join(OUT, "overview.mp4")], { encoding: "utf8" });
      console.log(r.status === 0 ? "wrote overview.mp4" : "mp4 failed: " + (r.stderr || "").slice(0, 200));
    }
  }
  await sb.close();
  console.log(JSON.stringify(J(repFile).summary));
  if (args.keep) console.log("work folder: " + WORK); else fs.rmSync(WORK, { recursive: true, force: true });
}
function moveIds() { return J(path.join(SKILL_DIR, "library", "moves", "index.json")).moves.map((m) => m.id); }
main().catch((e) => { console.error(e); process.exit(1); });
