// The eight evidence recipes as DATA (sceneData) and as pictures (preview). sceneData maps an ingested source to evidence/scene.json: every label is
// derived from a measurement of the manifest, geometry is the source under one uniform scale and shift, a schematic scene carries a SCHEMATIC badge.
// preview draws that scene.json with Canvas 2D + GSAP in headless Chrome (lib/cdp.mjs, no window): a paused timeline seeked per frame, so the same time
// is the same pixels; it records the label rectangles and every string it really drew, which `evidence.mjs check` reads back. Chrome / ffmpeg missing
// is reported "not run: <reason>", never as passed. No network: fonts are system fonts, images come from the run.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gsapInline } from "./common.mjs";
import { launch } from "./cdp.mjs";
import { SCENE_SCHEMA, RECIPES, RECIPE_FORMAT, SCHEMATIC_LABEL, EvidenceError, loadManifest, evidenceDir, formatValue, readPoints, pointStats, normUnit, cleanLabel } from "./evidence.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const SIZES = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1000, 1000], "4:5": [800, 1000] };
const TITLES = { "satellite-briefing": "Satellite briefing", "engineering-briefing": "Engineering briefing", "lidar-survey": "LiDAR survey", "white-model": "Projection on a white model", "data-physical": "Data physicalization", "exploded-teardown": "Exploded teardown", microscope: "Microscope story", "archive-lighttable": "Archive light table" };

const nice = (v) => { if (!(v > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; };

// the badge: its box is the layout's own estimate; the browser measures the real one into preview.json
function disclosure(canvas) {
  const fs0 = Math.min(canvas.w, canvas.h) * 0.034, w = (Math.max(9 * 0.72 * fs0, 38 * 0.56 * fs0 * 0.62) + fs0 * 1.4) / canvas.w, h = (fs0 * 2.6) / canvas.h;
  return { text: `${SCHEMATIC_LABEL}: synthetic fixture, not surveyed data`, box: { x: 0.03, y: 0.035, w: r6(w), h: r6(h) } };
}
const provLine = (objs) => {
  const one = (o) => (o.synthetic ? "synthetic fixture (not real data)" : `${o.origin.label}${o.meta && (o.meta.captured || o.meta.date) ? `, ${o.meta.captured || o.meta.date}` : ""} (${o.source_type}, ${o.permission.status}) ${o.content_hash.slice(7, 15)}`);
  return `Source: ${objs.slice(0, 2).map(one).join(" · ")}${objs.length > 2 ? ` · +${objs.length - 2} more` : ""}`;
};

export function sceneData(run, recipe, o = {}) {
  run = path.resolve(run);
  if (!RECIPES.includes(recipe)) throw new EvidenceError("unknown-recipe", `"${recipe}" is not one of the eight recipes`, `use one of: ${RECIPES.join(", ")}`);
  const mf = loadManifest(run);
  if (!mf) throw new EvidenceError("manifest-missing", "no evidence manifest", "ingest first: evidence.mjs ingest --run <RUN> --source <file> --kind <recipe> ...");
  const aspect = o.aspect || "16:9";
  if (!SIZES[aspect]) throw new EvidenceError("aspect-unknown", `aspect "${aspect}" is not one of ${Object.keys(SIZES).join(", ")}`, "pick a supported aspect");
  const canvas = { w: SIZES[aspect][0], h: SIZES[aspect][1] };
  const locale = o.locale || "en-US";
  const ids = o.objects ? String(o.objects).split(",") : null;
  const objs = (mf.objects || []).filter((x) => x.kind === recipe && (!ids || ids.includes(x.id)));
  const meas = new Map((mf.measurements || []).map((m) => [m.id, m]));
  const texts = [], elements = [];
  const T = (kind, text) => { texts.push({ kind, text }); return text; };
  const fmt = (m) => formatValue(m.value, m.unit, locale);
  const mlabel = (id) => { const m = meas.get(id); return m ? { text: fmt(m) } : null; };
  const base = { schema: SCENE_SCHEMA, recipe, aspect, canvas, locale, duration: 4, crops: [], title: T("title", TITLES[recipe]) };
  if (!objs.length) {
    // nothing to draw: say so honestly; check reports the missing source (survey blocked, no invented terrain)
    return { ...base, mode: recipe === "lidar-survey" ? "survey" : "measured", elements: [], texts, disclosure: null, provenance: null, blocked: `no ${RECIPE_FORMAT[recipe]} source ingested for ${recipe}` };
  }
  const o1 = objs[0];
  const synthetic = objs.some((x) => x.synthetic);
  const subtitle = { "satellite-briefing": "Approved imagery, known extent, dated", "engineering-briefing": "Alternatives against sourced numbers", "lidar-survey": "Measured points, relative positions preserved", "white-model": "Light projected on a supplied model", "data-physical": "One physical object per measured item", "exploded-teardown": "Sourced parts, pulled apart", microscope: "Supplied image with its scale calibration", "archive-lighttable": "Supplied pages, with provenance" }[recipe];
  base.subtitle = T("name", subtitle);
  let extra = {};
  const mid = (suffix) => `${o1.id}-${suffix}`;

  if (recipe === "data-physical" || recipe === "engineering-briefing") {
    const cols = (o1.summary.columns || []);
    const numCols = cols.filter((c) => c.numeric);
    const labCol = cols.find((c) => !c.numeric);
    const rows = Math.min(o1.summary.rows, recipe === "data-physical" ? 12 : 4);
    const rowName = (ri) => { const m = [...meas.values()].find((x) => x.id.startsWith(`${o1.id}-r${ri + 1}-`) && x.label); return m ? m.label.split(": ")[0] : `row ${ri + 1}`; };
    if (recipe === "data-physical") {
      const col = (o.column && numCols.find((c) => c.name === o.column)) || numCols[0];
      const slugc = col.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "source";
      const ms = []; for (let ri = 0; ri < rows; ri++) { const m = meas.get(`${o1.id}-r${ri + 1}-${slugc}`); if (m) ms.push({ m, ri }); }
      const maxv = Math.max(...ms.map((x) => Number(x.m.value))), axisMax = nice(maxv);
      const ticks = [0, 1, 2, 3, 4].map((i) => { const v = r6((axisMax * i) / 4); return { v, text: T("axis", formatValue(v, "", locale)) }; });
      extra.axis = { min: 0, max: axisMax, unit: normUnit(col.unit || ""), ticks, title: T("axis", `${col.name}${col.unit ? ` (${col.unit})` : ""}`) };
      for (const { m, ri } of ms) elements.push({ id: m.id, type: "bar", row: ri, name: T("name", rowName(ri)), measurement: m.id, label: { text: T("measurement", fmt(m)) }, presentation: m.presentation, height: r6(Number(m.value) / axisMax) });
    } else {
      const use = numCols.slice(0, 4);
      const mm = use.map((c) => { const sl = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "source"; return { c, vals: Array.from({ length: rows }, (_, ri) => meas.get(`${o1.id}-r${ri + 1}-${sl}`)).filter(Boolean) }; });
      for (let ri = 0; ri < rows; ri++) {
        const name = T("name", rowName(ri));
        elements.push({ id: `card-${ri + 1}`, type: "card", card: ri, name });
        mm.forEach(({ c, vals }, ci) => {
          const m = vals.find((x) => x.id.startsWith(`${o1.id}-r${ri + 1}-`)); if (!m) return;
          const hi = Math.max(...vals.map((x) => Number(x.value))), lo = Math.min(...vals.map((x) => Number(x.value)));
          elements.push({ id: m.id, type: "metric", card: ri, slot: ci, name: T("name", c.name), measurement: m.id, label: { text: T("measurement", fmt(m)) }, presentation: m.presentation, norm: hi === lo ? 1 : r6((Number(m.value) - lo) / (hi - lo) * 0.8 + 0.2) });
        });
      }
    }
    void labCol;
  } else if (recipe === "lidar-survey") {
    const pts = readPoints(path.join(run, o1.file)).points, st = pointStats(pts);
    const center = [0, 1, 2].map((i) => r6((st.min[i] + st.max[i]) / 2)), scale = r6(1 / (Math.max(...st.size) || 1)), stride = Math.max(1, Math.ceil(pts.length / 20000));
    const out = [];
    for (let i = 0; i < pts.length; i += stride) { const p = pts[i]; out.push([r6((p[0] - center[0]) * scale), r6((p[1] - center[1]) * scale), r6((p[2] - center[2]) * scale), p[3], i]); }
    const transform = { center, scale, unit: o1.summary.unit || null, z_scale: 1 };
    elements.push({ id: "points", type: "points", object: o1.id, transform, classes: st.classes, points: out });
    for (const a of ["x", "y"]) { const m = meas.get(mid(`extent-${a}`)); if (m && o1.summary.unit) elements.push({ id: `span-${a}`, type: "extent", axis: a, measurement: m.id, label: { prefix: `Span ${a.toUpperCase()}: `, text: T("measurement", `Span ${a.toUpperCase()}: ${fmt(m)}`) } }); }
    const mz = meas.get(mid("extent-z")); if (mz && o1.summary.unit) elements.push({ id: "span-z", type: "extent", axis: "z", measurement: mz.id, label: { prefix: "Height: ", text: T("measurement", `Height: ${fmt(mz)}`) } });
    const mc = meas.get(mid("count")); if (mc) elements.push({ id: "count", type: "count", measurement: mc.id, label: { prefix: "Points: ", text: T("measurement", `Points: ${fmt(mc)}`) } });
    extra.ground = true; extra.thinned = stride > 1; if (stride > 1) T("name", "thinned for display");
    extra.transform = transform;
  } else if (recipe === "exploded-teardown" || recipe === "white-model") {
    const parts = o1.summary.parts, unit = o1.summary.unit;
    const lo = [0, 1, 2].map((i) => Math.min(...parts.map((p) => p.min[i]))), hi = [0, 1, 2].map((i) => Math.max(...parts.map((p) => p.max[i])));
    const center = lo.map((v, i) => (v + hi[i]) / 2), scale = r6(1 / (Math.max(...hi.map((v, i) => v - lo[i])) || 1));
    parts.forEach((p, i) => {
      const nb = { min: p.min.map((v, k) => r6((v - center[k]) * scale)), max: p.max.map((v, k) => r6((v - center[k]) * scale)) };
      const pc = nb.min.map((v, k) => (v + nb.max[k]) / 2), len = Math.hypot(...pc) || 1;
      const dir = len < 1e-6 ? [0, 0, 1] : pc.map((v) => r6(v / len));
      const ids = ["x", "y", "z"].map((a) => meas.get(`${o1.id}-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32)}-${a}`)).filter(Boolean);
      const el = { id: `part-${i + 1}`, type: "part", name: T("name", p.name), box: nb, dir };
      if (unit && ids.length === 3) { el.measurements = ids.map((m) => m.id); el.label = { text: T("measurement", ids.map((m) => fmt(m)).join(" × ")) }; el.presentation = ids[0].presentation; }
      else el.note = T("name", "dimensions not supplied");
      elements.push(el);
    });
    extra.transform = { center: center.map(r6), scale, unit: unit || null };
    extra.explode = recipe === "exploded-teardown";
  } else if (recipe === "satellite-briefing") {
    elements.push({ id: "image", type: "image", object: o1.id, width: o1.summary.width, height: o1.summary.height });
    const me = meas.get(mid("extent-width")); if (me) elements.push({ id: "extent", type: "extent", axis: "x", measurement: me.id, label: { prefix: "Width: ", text: T("measurement", `Width: ${fmt(me)}`) } });
    if (o1.meta.region) elements.push({ id: "region", type: "region", rect: o1.meta.region, name: T("name", cleanLabel(o1.meta.region.name || "Region of interest", 40)) });
    if (!me) T("name", "extent not supplied");
    if (o1.meta.captured) T("provenance", `Captured ${o1.meta.captured}`);
    extra.captured = o1.meta.captured || null;
  } else if (recipe === "microscope") {
    elements.push({ id: "image", type: "image", object: o1.id, width: o1.summary.width, height: o1.summary.height });
    const ms = meas.get(mid("scale"));
    if (ms) elements.push({ id: "scale", type: "scalebar", measurement: ms.id, pixels: Number(o1.meta.scale_bar.pixels), label: { text: T("measurement", fmt(ms)) } });
    else elements.push({ id: "note", type: "note", text: T("name", "Illustration: no scale calibration, no measurement") });
    if (o1.meta.region) elements.push({ id: "region", type: "region", rect: o1.meta.region, name: T("name", cleanLabel(o1.meta.region.name || "Region", 40)) });
  } else if (recipe === "archive-lighttable") {
    objs.slice(0, 3).forEach((ob, i) => {
      elements.push({ id: `page-${i + 1}`, type: "page", object: ob.id, width: ob.summary.width, height: ob.summary.height, title: T("name", cleanLabel(ob.meta.title || "Untitled page", 60)), date: ob.meta.date ? T("name", ob.meta.date) : null, repository: ob.meta.repository ? T("name", cleanLabel(ob.meta.repository, 60)) : null, rights: ob.meta.rights ? T("name", cleanLabel(ob.meta.rights, 60)) : null });
      (ob.meta.snippets || []).slice(0, 1).forEach((s) => { const w = s.text.split(/\s+/); const text = w.length > 25 ? `${w.slice(0, 25).join(" ")}…` : s.text; elements.push({ id: `snippet-${ob.id}-${s.id}`, type: "snippet", object: ob.id, snippet: s.id, page: i, rect: s.rect || { x: 0.1, y: 0.3, w: 0.8, h: 0.12 }, locator: T("name", s.locator), text: T("quote", text) }); });
    });
  }

  // measured only when every object is real and every measurement it draws is measured; a fixture is a schematic and says so
  const drawn = elements.filter((e) => e.measurement).map((e) => meas.get(e.measurement)).filter(Boolean);
  const schematic = o.mode === "schematic" || synthetic || drawn.some((m) => m.presentation === "schematic") || (recipe === "microscope" && !elements.some((e) => e.type === "scalebar")) || (recipe === "satellite-briefing" && (!o1.meta.captured || !o1.meta.extent));
  const mode = schematic ? "schematic" : recipe === "lidar-survey" ? "survey" : "measured";
  const dis = schematic ? disclosure(canvas) : null;
  if (dis) T("disclosure", dis.text);
  const prov = { objects: objs.map((x) => x.id), text: T("provenance", provLine(objs)) };
  return { ...base, mode, elements, texts, disclosure: dis, provenance: prov, ...extra, ...(o.claimsChange ? { claims_change: true } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------------------- preview
let chromeCache;
export function chromeStatus() {
  if (chromeCache) return chromeCache;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `import { chromePath } from ${JSON.stringify(pathToFileURL(path.join(HERE, "common.mjs")).href)}; console.log(chromePath());`], { encoding: "utf8", timeout: 60000, env: { ...process.env } });
  const p = (r.stdout || "").trim().split("\n").pop();
  if (r.status === 0 && p && fs.existsSync(p)) return (chromeCache = { ok: true, path: p });
  return (chromeCache = { ok: false, reason: r.status === 0 ? `Chrome path ${p} does not exist` : ((r.stderr || "").trim().split("\n").pop() || "no headless Chrome found").replace(/^rasanai:\s*/, "") });
}
const mime = (f) => ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" })[path.extname(f).toLowerCase()] || "application/octet-stream";

export function pageHtml(run, scene) {
  const manifest = loadManifest(run) || { objects: [] };
  const assets = {};
  for (const e of scene.elements || []) if (e.object && ["image", "page"].includes(e.type)) { const ob = manifest.objects.find((x) => x.id === e.object); if (ob && !assets[e.object]) assets[e.object] = `data:${mime(ob.file)};base64,${fs.readFileSync(path.join(run, ob.file)).toString("base64")}`; }
  const js = fs.readFileSync(path.join(HERE, "evidence-render.js"), "utf8");
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block}</style></head><body><canvas id="c" width="${scene.canvas.w}" height="${scene.canvas.h}"></canvas>${gsapInline()}<script>window.SCENE=${JSON.stringify(scene).replace(/</g, "\\u003c")};window.ASSETS=${JSON.stringify(assets)};</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
}

// frames: [{t, file, sha256}]; seeks A, B, A and compares the two A frames. video: an mp4 from ffmpeg (or "not run: ...")
export async function preview(run, scene, outDir, o = {}) {
  run = path.resolve(run); outDir = path.resolve(outDir);
  const ch = chromeStatus();
  if (!ch.ok) return { ok: false, status: "not run", reason: `not run: ${ch.reason}` };
  fs.mkdirSync(outDir, { recursive: true });
  const html = path.join(outDir, `${scene.recipe}.html`);
  fs.writeFileSync(html, pageHtml(run, scene));
  const times = (o.times || [0.4, 1.4, 3.2]).map(Number);
  const b = await launch({ width: scene.canvas.w, height: scene.canvas.h, scale: 1, timeoutMs: 60000 });
  const frames = []; let det = null, rects = null, drawn = [], video = null;
  try {
    await b.open(pathToFileURL(html).href, { waitMs: 30000 });
    for (let i = 0; i < 50 && !(await b.eval("window.__ready === true")); i++) await new Promise((r) => setTimeout(r, 100));
    if (!(await b.eval("window.__ready === true"))) throw new Error(`the scene did not become ready${b.logs.length ? `: ${b.logs.slice(0, 2).join(" | ")}` : ""}`);
    const seek = async (t) => { await b.eval(`__seek(${t})`); await b.eval("new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})", { await: true }); };
    const shot = async (t) => { await seek(t); return b.screenshot(); };
    for (const t of times) { const png = await shot(t); const file = path.join(outDir, `${scene.recipe}-t${String(t).replace(".", "_")}.png`); fs.writeFileSync(file, png); frames.push({ t, file: path.basename(file), sha256: sha(png) }); }
    const a1 = frames[0], other = await shot(times[times.length - 1]), a2 = await shot(times[0]);
    void other;
    det = sha(a2) === a1.sha256;
    rects = await b.eval("window.__rects"); drawn = await b.eval("window.__drawn()");
    if (b.logs.some((l) => /^(error|exception)/.test(l))) throw new Error(`the scene logged: ${b.logs.filter((l) => /^(error|exception)/.test(l))[0]}`);
    if (o.video) {
      const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
      if (ff.error || ff.status !== 0) video = "not run: ffmpeg not found on PATH";
      else {
        const fps = Number(o.fps) || 12, dur = Number(scene.duration) || 4, n = Math.round(dur * fps), tmp = path.join(outDir, ".frames"); fs.mkdirSync(tmp, { recursive: true });
        for (let i = 0; i < n; i++) fs.writeFileSync(path.join(tmp, `f${String(i).padStart(4, "0")}.png`), await shot(i / fps));
        const mp4 = path.join(outDir, `${scene.recipe}.mp4`);
        const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", path.join(tmp, "f%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-map_metadata", "-1", "-fflags", "+bitexact", "-movflags", "+faststart", mp4], { encoding: "utf8" });
        fs.rmSync(tmp, { recursive: true, force: true });
        video = r.status === 0 && fs.existsSync(mp4) ? { file: path.basename(mp4), frames: n, fps, seconds: dur } : `not run: ffmpeg failed (${(r.stderr || "").trim().split("\n").pop()})`;
      }
    }
  } finally { await b.close(); }
  const sceneFile = path.join(evidenceDir(run), "scene.json");
  const rec = { recipe: scene.recipe, scene_sha256: o.sceneSha || sha(JSON.stringify(scene, null, 2) + "\n"), canvas: scene.canvas, times, frames, deterministic: det, rects, drawn, video };
  void sceneFile;
  fs.writeFileSync(path.join(outDir, "preview.json"), JSON.stringify(rec, null, 2) + "\n");
  return { ok: true, status: "ok", ...rec, out: outDir, html: path.basename(html) };
}
