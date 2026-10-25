// Evidence for technical and documentary films (W9): schemas, units, provenance and the source adapters. The rule: every number, geometry and
// measurement on screen comes from documented source material, and a picture that is only a sketch says so on screen.
//   ingest(opts)            copy an authorized source into <run>/evidence/sources/, hash it, read it, add its object and measurement rows to
//                           <run>/evidence/manifest.json (originals are never changed). CSV / TSV / JSON tables, small XYZ point clouds (JSON, .xyz, x,y,z CSV),
//                           glTF / GLB / OBJ / JSON parts lists, PNG / JPEG images work offline. LAS/LAZ, CAD, slides, pathology slides, PDF: unsupported-source-format.
//   checkEvidence(run, o)   the diagnostics: [{code, severity, where, message, fix}]; a measurement must trace to its source cell / part / point set,
//                           in a compatible unit, with a real source; measured is grounded, schematic is labelled; a scene's labels are derived, not authored
//   formatValue / convert   locale-safe numbers with units, exact unit conversion (a mismatch throws unit-mismatch)
//   evidenceCredits / publicEvidence / evidenceRecipeLines   what survives into CREDITS.txt, the delivery folder and RECIPE.md (no local paths, no personal metadata)
//   writeLedger(run)        projects grounded measurements into research/evidence.claims.json in the claims format slop.mjs already reads (not a second facts store)
// No second facts database: a measurement points at research/claims.json (claim_ref), the truth sheet and sources.json by id. Method: references/evidence.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { numbersIn, knownNumbers } from "./textfit.mjs";

export const SCHEMA = "rasanai-evidence/1";
export const SCENE_SCHEMA = "rasanai-evidence-scene/1";
export const RECIPES = ["satellite-briefing", "engineering-briefing", "lidar-survey", "white-model", "data-physical", "exploded-teardown", "microscope", "archive-lighttable"];
export const SOURCE_TYPES = ["user-supplied", "public-record", "licensed", "research-source", "synthetic-fixture"];
export const PERMISSIONS = ["authorized", "owned", "public-domain", "licensed", "fixture"];
export const PRESENTATIONS = ["measured", "schematic"];
export const SCHEMATIC_LABEL = "SCHEMATIC";
// which kind of source object each recipe works from
export const RECIPE_FORMAT = { "satellite-briefing": "image", "engineering-briefing": "table", "lidar-survey": "points", "white-model": "model", "data-physical": "table", "exploded-teardown": "model", microscope: "image", "archive-lighttable": "image" };

export class EvidenceError extends Error {
  constructor(code, message, fix = "") { super(message); this.code = code; this.fix = fix; }
}
const D = (code, severity, where, message, fix = "") => ({ code, severity, where, message, fix });
const jm = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const slug = (s) => String(s).toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "source";

export const evidenceDir = (run) => path.join(run, "evidence");
export const manifestPath = (run) => path.join(evidenceDir(run), "manifest.json");
export const loadManifest = (run) => jm(manifestPath(run));

// ---------------------------------------------------------------------------------------------------------------------------------- units
const U = (dim, f) => ({ dim, f });
export const UNITS = {
  nm: U("length", 1e-9), "µm": U("length", 1e-6), mm: U("length", 1e-3), cm: U("length", 1e-2), m: U("length", 1), km: U("length", 1e3), in: U("length", 0.0254), ft: U("length", 0.3048), mi: U("length", 1609.344),
  mm2: U("area", 1e-6), cm2: U("area", 1e-4), m2: U("area", 1), ha: U("area", 1e4), km2: U("area", 1e6),
  mm3: U("volume", 1e-9), cm3: U("volume", 1e-6), m3: U("volume", 1), L: U("volume", 1e-3), mL: U("volume", 1e-6),
  mg: U("mass", 1e-6), g: U("mass", 1e-3), kg: U("mass", 1), t: U("mass", 1e3),
  ms: U("time", 1e-3), s: U("time", 1), min: U("time", 60), h: U("time", 3600), d: U("time", 86400),
  "m/s": U("speed", 1), "km/h": U("speed", 1 / 3.6),
  N: U("force", 1), kN: U("force", 1e3), Pa: U("pressure", 1), kPa: U("pressure", 1e3), MPa: U("pressure", 1e6),
  W: U("power", 1), kW: U("power", 1e3), MW: U("power", 1e6), Wh: U("energy", 3600), kWh: U("energy", 3.6e6),
  "%": U("percent", 1), count: U("count", 1), "µm/px": U("scale", 1e-6), "m/px": U("scale", 1),
};
const ALIAS = { um: "µm", "μm": "µm", "µm": "µm", sq_m: "m2", "m²": "m2", "km²": "km2", "cm²": "cm2", "mm²": "mm2", "m³": "m3", "cm³": "cm3", "mm³": "mm3", l: "L", pct: "%", percent: "%", inch: "in", inches: "in", feet: "ft", sec: "s", hr: "h", kph: "km/h", "kgs": "kg", "metre": "m", "meter": "m", "metres": "m", "meters": "m", "units": "count", unit: "count", "": "" };
export const normUnit = (u) => { const s = String(u == null ? "" : u).trim(); return Object.prototype.hasOwnProperty.call(ALIAS, s) ? ALIAS[s] : s; };
export const unitInfo = (u) => { const n = normUnit(u); return n && Object.prototype.hasOwnProperty.call(UNITS, n) ? { unit: n, ...UNITS[n] } : null; };
export function convert(value, from, to) {
  const a = unitInfo(from), b = unitInfo(to);
  if (!a || !b) throw new EvidenceError("unit-unknown", `unit "${!a ? from : to}" is not one RasanAI knows`, `use one of: ${Object.keys(UNITS).join(", ")}`);
  if (a.dim !== b.dim) throw new EvidenceError("unit-mismatch", `${from} (${a.dim}) cannot stand for ${to} (${b.dim})`, `give the measurement the unit its source states (${to}), or fix the source column's unit`);
  return (value * a.f) / b.f;
}
// "12,345.5 mm" for en-US, "12.345,5 mm" for de-DE: derived from the number, never typed by a model. NBSP between number and unit (none for %).
export function formatValue(value, unit, locale = "en-US") {
  const s = String(value), dec = Math.min(6, ((s.split(".")[1] || "").replace(/e.*$/i, "")).length);
  let n;
  try { n = new Intl.NumberFormat(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(value); } catch { n = new Intl.NumberFormat("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(value); }
  const u = normUnit(unit);
  return !u || u === "count" ? n : u === "%" ? `${n}%` : `${n}\u00a0${u}`;
}
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------------------------------------------------------------- privacy
const PRIVATE = /(\/Users\/[^\s"'<>]+|\/home\/[^\s"'<>]+|\/private\/var\/[^\s"'<>]+|\/var\/folders\/[^\s"'<>]+|[A-Za-z]:\\+Users\\+[^\s"'<>]+|file:\/\/[^\s"'<>]*)/g;
export const hasPrivatePath = (s) => { const t = String(s); PRIVATE.lastIndex = 0; if (PRIVATE.test(t)) { PRIVATE.lastIndex = 0; return true; } const h = os.homedir(); return !!(h && h.length > 4 && t.includes(h)); };
export const scrub = (s) => { let t = String(s).replace(PRIVATE, "<path removed>"); const h = os.homedir(); if (h && h.length > 4) t = t.split(h).join("<path removed>"); return t; };
const INSTRUCTION_LIKE = /\b(ignore (all |any |the )?(previous|prior|above)|disregard (all|the|your)|system prompt|you (must|should) now|new instructions?|run (this|the following) command|delete (all|the) files)\b/i;
// text that came out of an imported file is shown as a plain label: control characters out, one line, bounded
export const cleanLabel = (s, n = 60) => scrub(String(s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()).slice(0, n);

// ---------------------------------------------------------------------------------------------------------------------------------- readers
export function parseCsv(text) {
  const t = String(text).replace(/^\uFEFF/, "");
  const lines = t.split(/\r?\n/);
  const meta = {};
  const body = [];
  for (const l of lines) { const m = /^#\s*([\w-]+)\s*:\s*(.*)$/.exec(l); if (m) meta[m[1].toLowerCase()] = m[2].trim(); else if (/^#/.test(l)) { const w = l.replace(/^#\s*/, "").trim(); if (/^synthetic\b/i.test(w)) meta.synthetic = "true"; } else body.push(l); }
  const first = body.find((l) => l.trim()) || "";
  const delim = (first.match(/\t/g) || []).length > (first.match(/[,;]/g) || []).length ? "\t" : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], f = "", q = false;
  const src = body.join("\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); f = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else if (c !== "\r") f += c;
  }
  row.push(f); if (row.some((x) => x.trim() !== "")) rows.push(row);
  return { rows, meta, delim };
}
const NUM = /^-?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/;
const AMBIG = /^-?\d{1,3}(,\d{3})+(\.\d+)?$|^-?\d+,\d+$/;
function splitUnit(h) { const m = /^(.*?)\s*[([]\s*([^)\]]+?)\s*[)\]]\s*$/.exec(String(h).trim()); return m ? { name: m[1].trim() || String(h).trim(), unit: normUnit(m[2]) } : { name: String(h).trim(), unit: null }; }

// -> { columns: [{name, unit, numeric}], rows: [[cell...]], synthetic, ambiguous: [..] }; numeric cells are numbers, nothing else is interpreted
export function readTable(file) {
  const ext = path.extname(file).toLowerCase();
  const text = fs.readFileSync(file, "utf8");
  let header, body, synthetic = false, units = {};
  if (ext === ".json") {
    let j; try { j = JSON.parse(text); } catch (e) { throw new EvidenceError("source-unreadable", `JSON does not parse: ${e.message}`); }
    synthetic = !!(j && j.synthetic === true);
    const rowsIn = Array.isArray(j) ? j : Array.isArray(j && j.rows) ? j.rows : null;
    if (!rowsIn) throw new EvidenceError("json-shape-unknown", "JSON holds no table (an array of rows, or {rows: [...]})", "use {columns:[{name,unit}], rows:[[...]]} or an array of objects");
    if (j && !Array.isArray(j) && j.units) units = j.units;
    if (j && Array.isArray(j.columns)) { header = j.columns.map((c) => (typeof c === "string" ? c : c.name)); for (const c of j.columns) if (c && c.unit) units[typeof c === "string" ? c : c.name] = c.unit; body = rowsIn.map((r) => (Array.isArray(r) ? r : header.map((h) => r[h]))); }
    else if (rowsIn.length && !Array.isArray(rowsIn[0]) && typeof rowsIn[0] === "object") { header = Object.keys(rowsIn[0]); body = rowsIn.map((r) => header.map((h) => r[h])); }
    else { header = (rowsIn[0] || []).map(String); body = rowsIn.slice(1); }
  } else {
    const p = parseCsv(text);
    synthetic = /^(true|yes|1)$/i.test(p.meta.synthetic || "");
    header = p.rows[0] || []; body = p.rows.slice(1);
  }
  const ambiguous = [];
  const columns = header.map((h, ci) => {
    const { name, unit } = splitUnit(h);
    const u = unit || (units[h] != null ? normUnit(units[h]) : units[name] != null ? normUnit(units[name]) : null);
    const cells = body.map((r) => r[ci]).filter((x) => x !== undefined && x !== null && String(x).trim() !== "");
    const numeric = cells.length > 0 && cells.every((x) => typeof x === "number" || NUM.test(String(x).trim()));
    if (!numeric) for (const x of cells) if (AMBIG.test(String(x).trim())) { ambiguous.push(`${name}: "${x}"`); break; }
    return { name, unit: u, numeric };
  });
  const rows = body.map((r) => columns.map((c, ci) => { const x = r[ci]; if (c.numeric) return x === undefined || x === null || String(x).trim() === "" ? null : Number(x); return x == null ? "" : String(x); }));
  return { columns, rows, synthetic, ambiguous };
}

// -> { unit, points: [[x,y,z,class|null]], synthetic, crs }; JSON {points: [[x,y,z,class?]|{x,y,z,class?}], unit}, .xyz text, or a CSV with x,y,z columns
export function readPoints(file) {
  const ext = path.extname(file).toLowerCase();
  const text = fs.readFileSync(file, "utf8");
  let pts = [], unit = null, synthetic = false, crs = null;
  if (ext === ".json") {
    let j; try { j = JSON.parse(text); } catch (e) { throw new EvidenceError("source-unreadable", `JSON does not parse: ${e.message}`); }
    synthetic = !!j.synthetic; unit = normUnit(j.unit || "") || null; crs = j.crs ? cleanLabel(j.crs, 40) : null;
    const arr = Array.isArray(j.points) ? j.points : null;
    if (!arr) throw new EvidenceError("json-shape-unknown", "JSON holds no points", "use {unit, points:[[x,y,z,class?],...]}");
    pts = arr.map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1]), Number(p[2]), p[3] == null ? null : Number(p[3])] : [Number(p.x), Number(p.y), Number(p.z), p.class == null ? (p.c == null ? null : Number(p.c)) : Number(p.class)]));
  } else if (ext === ".xyz" || ext === ".txt") {
    for (const l of text.split(/\r?\n/)) { const s = l.trim(); if (!s) continue; if (s.startsWith("#")) { if (/synthetic/i.test(s)) synthetic = true; const m = /unit\s*[:=]\s*(\S+)/i.exec(s); if (m) unit = normUnit(m[1]); continue; } const v = s.split(/[\s,;]+/).map(Number); pts.push([v[0], v[1], v[2], Number.isFinite(v[3]) ? v[3] : null]); }
  } else {
    const t = readTable(file); synthetic = t.synthetic;
    const ix = ["x", "y", "z"].map((n) => t.columns.findIndex((c) => c.name.toLowerCase() === n)), ic = t.columns.findIndex((c) => /^(class|classification|c)$/i.test(c.name));
    if (ix.some((i) => i < 0)) throw new EvidenceError("json-shape-unknown", "the CSV has no x, y, z columns", "name the columns x, y, z (and optionally class)");
    unit = t.columns[ix[0]].unit; pts = t.rows.map((r) => [r[ix[0]], r[ix[1]], r[ix[2]], ic >= 0 ? r[ic] : null]);
  }
  if (!pts.length) throw new EvidenceError("points-empty", "the point file holds no points", "supply at least one x y z row");
  if (pts.length > 2_000_000) throw new EvidenceError("points-too-large", `${pts.length} points: over the 2,000,000 the offline reader takes`, "thin the cloud with the licensed tool you own and ingest the sample (state that it is a sample)");
  for (const p of pts) if (![0, 1, 2].every((i) => Number.isFinite(p[i]))) throw new EvidenceError("points-invalid", "a point has a non-numeric coordinate", "every point needs numeric x, y, z");
  return { unit, points: pts, synthetic, crs };
}
export function pointStats(pts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], cls = {};
  for (const p of pts) { for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; } const k = p[3] == null ? "none" : String(p[3]); cls[k] = (cls[k] || 0) + 1; }
  return { count: pts.length, min, max, size: [0, 1, 2].map((i) => r6(max[i] - min[i])), classes: cls };
}

// models: glTF / GLB (POSITION accessor bounds per mesh node, translation + scale), OBJ (o / g groups), or a JSON parts list. Parts carry a bounding box only.
export function readModel(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") {
    let j; try { j = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new EvidenceError("source-unreadable", `JSON does not parse: ${e.message}`); }
    if (!Array.isArray(j.parts)) throw new EvidenceError("json-shape-unknown", "JSON holds no parts", "use {unit, parts:[{name, size:[x,y,z], position:[x,y,z]}]}");
    return { unit: normUnit(j.unit || "") || null, synthetic: !!j.synthetic, parts: j.parts.map((p, i) => ({ name: cleanLabel(p.name || `part-${i + 1}`, 40), min: (p.position || [0, 0, 0]).map(Number), max: (p.position || [0, 0, 0]).map((v, k) => Number(v) + Number((p.size || [0, 0, 0])[k])) })) };
  }
  if (ext === ".obj") {
    const parts = []; let cur = null; const all = [];
    for (const l of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const t = l.trim().split(/\s+/);
      if (t[0] === "o" || t[0] === "g") { cur = { name: cleanLabel(t.slice(1).join(" ") || `part-${parts.length + 1}`, 40), v: [] }; parts.push(cur); }
      else if (t[0] === "v") { const v = t.slice(1, 4).map(Number); all.push(v); if (!cur) { cur = { name: "mesh", v: [] }; parts.push(cur); } cur.v.push(v); }
    }
    const bb = (v) => ({ min: [0, 1, 2].map((i) => Math.min(...v.map((p) => p[i]))), max: [0, 1, 2].map((i) => Math.max(...v.map((p) => p[i]))) });
    return { unit: null, synthetic: false, parts: parts.filter((p) => p.v.length).map((p) => ({ name: p.name, ...bb(p.v) })) };
  }
  // glTF / GLB
  const buf = fs.readFileSync(file);
  let gltf;
  if (ext === ".glb") {
    if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new EvidenceError("source-unreadable", "not a GLB file (bad magic)");
    const len = buf.readUInt32LE(12); if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new EvidenceError("source-unreadable", "GLB has no JSON chunk first");
    try { gltf = JSON.parse(buf.subarray(20, 20 + len).toString("utf8")); } catch { throw new EvidenceError("source-unreadable", "GLB JSON chunk does not parse"); }
  } else { try { gltf = JSON.parse(buf.toString("utf8")); } catch { throw new EvidenceError("source-unreadable", "glTF JSON does not parse"); } }
  const parts = [];
  for (const n of gltf.nodes || []) {
    if (n.mesh == null) continue;
    const mesh = (gltf.meshes || [])[n.mesh]; if (!mesh) continue;
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], got = false;
    for (const pr of mesh.primitives || []) { const a = (gltf.accessors || [])[pr.attributes && pr.attributes.POSITION]; if (a && a.min && a.max) { got = true; for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], a.min[i]); max[i] = Math.max(max[i], a.max[i]); } } }
    if (!got) continue;
    const s = n.scale || [1, 1, 1], t = n.translation || [0, 0, 0];
    parts.push({ name: cleanLabel(n.name || mesh.name || `part-${parts.length + 1}`, 40), min: min.map((v, i) => r6(v * s[i] + t[i])), max: max.map((v, i) => r6(v * s[i] + t[i])), note: n.rotation || n.matrix ? "node rotation / matrix ignored: bounds are of the unrotated mesh" : null });
  }
  if (!parts.length) throw new EvidenceError("model-no-bounds", "no mesh with POSITION bounds in the model", "export with accessor min/max (every glTF exporter does) or supply a parts list JSON");
  return { unit: "m", synthetic: !!(gltf.extras && gltf.extras.synthetic === true), parts };
}

// images: PNG / JPEG size from the header; EXIF / eXIf noted (the film render never copies it, delivery must not ship the original)
export function readImage(file) {
  const b = fs.readFileSync(file), ext = path.extname(file).toLowerCase();
  let w = null, h = null, exif = false;
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) { w = b.readUInt32BE(16); h = b.readUInt32BE(20); exif = b.includes(Buffer.from("eXIf")) || b.includes(Buffer.from("tEXtSoftware")) || b.includes(Buffer.from("tEXtAuthor")); }
  else if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m === 0xe1 && b.subarray(i + 4, i + 8).toString("latin1") === "Exif") exif = true; if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + len; }
  } else if (ext === ".webp" && b.subarray(0, 4).toString("latin1") === "RIFF") { exif = b.includes(Buffer.from("EXIF")); }
  else throw new EvidenceError("source-unreadable", "the image header is not PNG, JPEG or WebP");
  return { width: w, height: h, exif };
}

// ---------------------------------------------------------------------------------------------------------------------------------- formats
const UNSUPPORTED = [
  [/\.(las|laz)$/i, "lidar-las", "LAS / LAZ point clouds need a licensed decoder", ["pdal", "lasinfo"], "convert a sample to XYZ JSON or x,y,z CSV (for example `pdal translate in.las out.csv`), state it is a sample, then ingest that file"],
  [/\.(e57|ply|pcd)$/i, "lidar-other", "this point-cloud format has no offline reader here", ["pdal", "cloudcompare"], "convert a sample to XYZ JSON or x,y,z CSV, then ingest that file"],
  [/\.(dwg|dxf|step|stp|iges|igs|ifc|sldprt|3dm|fbx|blend)$/i, "cad", "CAD and DCC formats need the maker's own tool", ["freecadcmd", "assimp", "blender"], "export GLB / glTF or OBJ (or a parts list JSON) and ingest that"],
  [/\.(pptx?|key|odp)$/i, "slides", "slide decks are not read offline", ["soffice", "libreoffice"], "export the tables as CSV and the figures as PNG, then ingest those"],
  [/\.(svs|ndpi|mrxs|czi|scn|vsi)$/i, "pathology-slide", "whole-slide pathology formats need an optional licensed decoder", ["openslide-show-properties", "vips"], "export a region as PNG with its scale-bar calibration, then ingest that"],
  [/\.(tiff?|heic|heif|raw|dng|cr2|nef|arw)$/i, "image-other", "Chrome cannot draw this image format", ["vips", "sips", "magick"], "convert to PNG or JPEG (keep the capture date and extent in the metadata) and ingest that"],
  [/\.(pdf)$/i, "document", "PDF documents are not parsed (no fake text, no fake figures)", ["pdftotext", "pdftoppm"], "export the numbers as CSV and the pages as PNG, then ingest those"],
  [/\.(xlsx?|numbers|ods)$/i, "spreadsheet", "spreadsheet files are not parsed offline", ["soffice", "libreoffice"], "export the sheet as CSV (state the unit in each header: `height (mm)`) and ingest that"],
];
function which(bin) { const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" }); return r.status === 0 ? r.stdout.trim().split("\n")[0] : null; }
export function classify(file) {
  const base = path.basename(file), ext = path.extname(file).toLowerCase();
  for (const [re, why, reason, tools, fix] of UNSUPPORTED) if (re.test(base)) {
    const found = tools.map((t) => (which(t) ? t : null)).filter(Boolean);
    return { format: null, unsupported: { code: "unsupported-source-format", why, reason, tools_checked: tools, tools_found: found, fix: `${fix}${found.length ? `. A converter is on this machine (${found.join(", ")}), but RasanAI never runs one silently: convert, review the result, then ingest it.` : `. No converter was found on PATH (${tools.join(", ")}).`}` } };
  }
  if ([".csv", ".tsv"].includes(ext)) return { format: "table" };
  if ([".xyz"].includes(ext)) return { format: "points" };
  if ([".glb", ".gltf", ".obj"].includes(ext)) return { format: "model" };
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return { format: "image" };
  if (ext === ".json" || ext === ".txt") {
    const j = ext === ".json" ? jm(file) : null;
    if (j && Array.isArray(j.points)) return { format: "points" };
    if (j && Array.isArray(j.parts)) return { format: "model" };
    if (ext === ".txt") return { format: "points" };
    return { format: "table" };
  }
  return { format: null, unsupported: { code: "unsupported-source-format", why: "unknown", reason: `no reader for "${ext || base}"`, tools_checked: [], tools_found: [], fix: "supply CSV / JSON tables, XYZ points, GLB / glTF / OBJ models or PNG / JPEG images" } };
}

// ---------------------------------------------------------------------------------------------------------------------------------- ingest
const META_KEYS = new Set(["captured", "extent", "source_name", "scale_bar", "title", "date", "repository", "rights", "snippets", "synthetic", "note", "region", "view"]);
function cleanMeta(m) {
  const out = {};
  for (const [k, v] of Object.entries(m || {})) {
    if (!META_KEYS.has(k)) continue;
    out[k] = typeof v === "string" ? cleanLabel(v, 200) : JSON.parse(scrub(JSON.stringify(v)));
  }
  if (out.snippets) out.snippets = (out.snippets || []).map((s, i) => ({ id: cleanLabel(s.id || `s${i + 1}`, 20), locator: cleanLabel(s.locator || "", 60), text: cleanLabel(s.text || "", 4000), ...(s.rect ? { rect: s.rect } : {}) }));
  return out;
}
function measurementsFor(obj, data, claimMap) {
  const M = [], pres = obj.synthetic ? "schematic" : "measured", conf = obj.synthetic ? "fixture-only" : "supplied";
  const add = (id, label, value, unit, locator, method, extra = {}) => M.push({ id, label, value, unit, source_id: obj.id, locator, method, confidence: conf, presentation: pres, ...(claimMap && claimMap[id] ? { claim_ref: claimMap[id] } : {}), ...extra });
  if (obj.format === "table") {
    const lab = data.columns.findIndex((c) => !c.numeric);
    data.rows.slice(0, 500).forEach((r, ri) => data.columns.forEach((c, ci) => { if (!c.numeric || r[ci] === null) return; const name = lab >= 0 ? cleanLabel(r[lab], 40) : `row ${ri + 1}`; add(`${obj.id}-r${ri + 1}-${slug(c.name)}`, `${name}: ${c.name}`, r[ci], c.unit || "", `row:${ri + 1}/col:${c.name}`, "tabular value as supplied (no processing)"); }));
  } else if (obj.format === "points") {
    const s = obj.summary;
    ["x", "y", "z"].forEach((a, i) => add(`${obj.id}-extent-${a}`, `Extent ${a.toUpperCase()}`, s.size[i], obj.summary.unit || "", `points:bbox/${a}`, "bounding box of the supplied points (max - min)"));
    add(`${obj.id}-count`, "Points", s.count, "count", "points:count", "number of supplied points");
  } else if (obj.format === "model") {
    for (const p of obj.summary.parts) ["x", "y", "z"].forEach((a, i) => { if (obj.summary.unit) add(`${obj.id}-${slug(p.name)}-${a}`, `${p.name} ${a.toUpperCase()}`, r6(p.max[i] - p.min[i]), obj.summary.unit, `part:${p.name}/bounding-box/${a}`, "measured bounding box of the part's mesh"); });
  } else if (obj.format === "image") {
    const m = obj.meta || {};
    if (m.scale_bar && Number.isFinite(Number(m.scale_bar.length))) add(`${obj.id}-scale`, "Scale bar", Number(m.scale_bar.length), normUnit(m.scale_bar.unit), `scale-bar/${Number(m.scale_bar.pixels)}px`, "calibrated scale bar supplied with the image");
    if (m.extent && Number.isFinite(Number(m.extent.width))) add(`${obj.id}-extent-width`, "Extent width", Number(m.extent.width), normUnit(m.extent.unit), "extent/width", "known ground extent supplied with the image");
  }
  return M;
}

export function ingest(o) {
  const run = path.resolve(o.run);
  const src = path.resolve(o.source);
  if (!fs.existsSync(src)) throw new EvidenceError("source-missing", `source not found: ${path.basename(src)}`, "pass --source <file> you are allowed to use");
  const recipe = o.kind;
  if (!RECIPES.includes(recipe)) throw new EvidenceError("unknown-recipe", `--kind "${recipe}" is not one of the eight recipes`, `use one of: ${RECIPES.join(", ")}`);
  const cl = classify(src);
  if (cl.unsupported) throw Object.assign(new EvidenceError("unsupported-source-format", `${path.basename(src)}: ${cl.unsupported.reason}`, cl.unsupported.fix), { detail: cl.unsupported });
  let format = cl.format;
  // a CSV with x,y,z columns for a LiDAR recipe is a point cloud
  if (recipe === "lidar-survey" && format === "table") format = "points";
  if (format !== RECIPE_FORMAT[recipe]) throw new EvidenceError("kind-format-mismatch", `${recipe} works from ${RECIPE_FORMAT[recipe]} data, but ${path.basename(src)} is ${format} data`, `use --kind ${RECIPES.filter((r) => RECIPE_FORMAT[r] === format).join(" or ")} for this file, or supply ${RECIPE_FORMAT[recipe]} data`);
  const bytes = fs.readFileSync(src);
  const hash = sha(bytes);
  let sidecar = jm(`${src}.meta.json`) || {};
  const meta = cleanMeta({ ...sidecar, ...(o.meta || {}) });
  let data, synthetic = !!(o.synthetic || meta.synthetic);
  const warnings = [];
  const obj = { id: null, kind: recipe, format, file: null, original_name: cleanLabel(path.basename(src), 80), bytes: bytes.length, content_hash: `sha256:${hash}`, origin: null, source_type: null, permission: null, synthetic, processing_note: "", summary: {}, meta };
  if (format === "table") { data = readTable(src); synthetic = synthetic || data.synthetic; obj.summary = { columns: data.columns.map((c) => ({ name: cleanLabel(c.name, 40), unit: c.unit, numeric: c.numeric })), rows: data.rows.length }; for (const a of data.ambiguous) warnings.push(D("ambiguous-number-format", "warn", obj.original_name, `a text cell looks like a number with a locale-dependent separator (${a})`, "write numbers without thousands separators (1200 or 1200.5) so no locale can misread them")); if (data.columns.some((c) => c.numeric && !c.unit)) warnings.push(D("unit-missing", "warn", obj.original_name, `numeric column(s) without a unit: ${data.columns.filter((c) => c.numeric && !c.unit).map((c) => c.name).join(", ")}`, "put the unit in the header, e.g. `height (mm)`, so labels can carry it")); }
  else if (format === "points") { data = readPoints(src); synthetic = synthetic || data.synthetic; const st = pointStats(data.points); const unit = o.unit ? normUnit(o.unit) : data.unit; obj.summary = { ...st, unit: unit || null, crs: data.crs || null, relative_only: true }; if (!unit) warnings.push(D("unit-missing", "warn", obj.original_name, "the point file states no unit", "add \"unit\":\"m\" (or a header unit) so the extent can be labelled; positions stay relative either way")); }
  else if (format === "model") { data = readModel(src); synthetic = synthetic || data.synthetic; const unit = o.unit ? normUnit(o.unit) : data.unit; obj.summary = { unit: unit || null, parts: data.parts.map((p) => ({ name: p.name, min: p.min, max: p.max })) }; if (!unit) warnings.push(D("unit-missing", "warn", obj.original_name, "the model states no unit (OBJ has none)", "pass --unit mm|m|... if the source says so; without it no dimension is shown")); }
  else { const im = readImage(src); obj.summary = { width: im.width, height: im.height }; if (im.exif) { obj.exif = true; warnings.push(D("personal-metadata", "warn", obj.original_name, "the image carries EXIF / text metadata (maker, software, perhaps location)", "the film render never copies it; do not put the original into the delivery folder")); } }
  obj.synthetic = synthetic;
  // permission and origin: stated, never assumed
  obj.source_type = o.sourceType || (synthetic ? "synthetic-fixture" : null);
  const perm = o.permission || (synthetic ? "fixture" : null);
  if (!SOURCE_TYPES.includes(obj.source_type)) throw new EvidenceError("provenance-incomplete", `${obj.original_name}: say where the data comes from (--source-type ${SOURCE_TYPES.filter((x) => x !== "synthetic-fixture").join("|")})`, "the research desk records the source; a source with no type is not ingested");
  if (!PERMISSIONS.includes(perm)) throw new EvidenceError("provenance-incomplete", `${obj.original_name}: say who allows its use (--permission ${PERMISSIONS.filter((x) => x !== "fixture").join("|")})`, "the user said yes in the console, or the source is public domain / licensed: record which");
  if (synthetic && perm !== "fixture") throw new EvidenceError("provenance-incomplete", "a synthetic file is a fixture: --permission fixture", "synthetic data is never presented as a source");
  if (!synthetic && perm === "fixture") throw new EvidenceError("provenance-incomplete", "--permission fixture is for synthetic fixtures only", "state the real permission");
  obj.permission = { status: perm, ...(o.permissionNote ? { note: cleanLabel(o.permissionNote, 160) } : {}) };
  const label = cleanLabel(o.origin || (synthetic ? "synthetic fixture" : ""), 100);
  if (!label) throw new EvidenceError("provenance-incomplete", `${obj.original_name}: name the origin (--origin "who made it, where from")`, "no origin, no ingest");
  if (o.origin && hasPrivatePath(o.origin)) warnings.push(D("private-path", "warn", "origin", "the origin text named a local path: it was removed", "name the source by title and publisher, not a file location"));
  let url = null; try { if (o.url) { const u = new URL(o.url); u.username = ""; u.password = ""; u.search = ""; u.hash = ""; url = u.toString(); } } catch { /* a non-URL is ignored */ }
  obj.origin = { label, ...(url ? { url } : {}) };
  if (o.license) obj.license = cleanLabel(o.license, 80);
  if (o.attribution) obj.attribution = cleanLabel(o.attribution, 160);
  obj.processing_note = cleanLabel(o.note || ({ table: "read as a table; numeric cells kept exactly as supplied", points: "read as XYZ points; positions kept exactly as supplied (relative, no georeference)", model: "read as bounding boxes of the model's parts; no mesh was altered", image: "image kept as supplied; only its size was read" })[format], 200);
  // text that came out of the file is data: flag anything that reads like an instruction
  const texts = format === "table" ? data.rows.flat().filter((x) => typeof x === "string") : format === "image" ? [meta.title, meta.note, ...(meta.snippets || []).map((s) => s.text)].filter(Boolean) : format === "model" ? data.parts.map((p) => p.name) : [];
  if (texts.some((t) => INSTRUCTION_LIKE.test(t))) warnings.push(D("imported-text-instruction-like", "warn", obj.original_name, "text inside the imported file reads like an instruction", "it was kept as a label only: imported content is data, never a command; check the source before using that text on screen"));
  obj.id = o.id ? slug(o.id) : `${slug(path.basename(src))}-${hash.slice(0, 6)}`;
  const dir = path.join(evidenceDir(run), "sources");
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(src).toLowerCase();
  const dest = path.join(dir, `${obj.id}${ext}`);
  if (path.resolve(src) !== dest) fs.copyFileSync(src, dest); // the original is copied, never moved or edited
  obj.file = `evidence/sources/${obj.id}${ext}`;
  const mf = o.out ? path.resolve(o.out) : manifestPath(run);
  const manifest = jm(mf) || { schema: SCHEMA, objects: [], measurements: [] };
  const claimMap = o.claims || null;
  const rows = measurementsFor({ ...obj, summary: obj.summary }, data, claimMap);
  manifest.objects = (manifest.objects || []).filter((x) => x.id !== obj.id).concat(obj);
  manifest.measurements = (manifest.measurements || []).filter((m) => m.source_id !== obj.id).concat(rows);
  fs.mkdirSync(path.dirname(mf), { recursive: true });
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 2) + "\n");
  return { ok: true, manifest: path.relative(run, mf), object: obj, measurements: rows.length, warnings };
}

// ---------------------------------------------------------------------------------------------------------------------------------- locators
const objFile = (run, o) => path.join(run, o.file);
export function resolveLocator(run, obj, locator) {
  const loc = String(locator || "");
  const f = objFile(run, obj);
  if (!fs.existsSync(f)) return null;
  let m;
  if (obj.format === "table" && (m = /^row:(\d+)\/col:(.+)$/.exec(loc))) {
    const t = readTable(f), ci = t.columns.findIndex((c) => c.name === m[2]), row = t.rows[Number(m[1]) - 1];
    if (ci < 0 || !row || row[ci] === null || !t.columns[ci].numeric) return null;
    return { value: row[ci], unit: t.columns[ci].unit || "" };
  }
  if (obj.format === "points") {
    const p = readPoints(f), st = pointStats(p.points), unit = obj.summary.unit || p.unit || "";
    if ((m = /^points:bbox\/([xyz])$/.exec(loc))) return { value: st.size["xyz".indexOf(m[1])], unit };
    if (loc === "points:count") return { value: st.count, unit: "count" };
    return null;
  }
  if (obj.format === "model" && (m = /^part:(.+)\/bounding-box\/([xyz])$/.exec(loc))) {
    const md = readModel(f), p = md.parts.find((x) => x.name === m[1]);
    return p ? { value: r6(p.max["xyz".indexOf(m[2])] - p.min["xyz".indexOf(m[2])]), unit: obj.summary.unit || md.unit || "" } : null;
  }
  if (obj.format === "image") {
    if (/^scale-bar\//.test(loc) && obj.meta.scale_bar) return { value: Number(obj.meta.scale_bar.length), unit: normUnit(obj.meta.scale_bar.unit) };
    if (loc === "extent/width" && obj.meta.extent) return { value: Number(obj.meta.extent.width), unit: normUnit(obj.meta.extent.unit) };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------------- claims and sources by id
function claimIds(run) {
  const ids = new Set(), rd = path.join(run, "research");
  const files = [path.join(rd, "claims.json"), ...(fs.existsSync(rd) ? fs.readdirSync(rd).filter((x) => /\.claims\.json$/.test(x)).map((x) => path.join(rd, x)) : [])];
  for (const f of files) { const j = jm(f); for (const c of Array.isArray(j) ? j : (j && j.claims) || []) if (c && c.id != null) ids.add(String(c.id)); }
  return ids;
}
function sourceIds(run) {
  const j = jm(path.join(run, "sources.json")) || jm(path.join(run, "research", "sources.json"));
  const ids = new Set();
  for (const s of (j && j.sources) || []) for (const k of ["id", "path", "name"]) if (s && s[k]) ids.add(String(s[k]));
  return ids;
}
const truthText = (run) => { try { return fs.readFileSync(path.join(run, "story", "truth.md"), "utf8"); } catch { return ""; } };
function claimResolves(run, ref, claims, truth) {
  const s = String(ref); const id = s.includes("#") ? s.split("#")[1] : s;
  if (/^truth\.md#/.test(s) || /^story\/truth\.md#/.test(s)) return new RegExp(`^#+\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[- ]")}\\s*$`, "im").test(truth);
  return claims.has(id);
}

// ---------------------------------------------------------------------------------------------------------------------------------- crops
export const cropRect = (spec, canvas) => {
  if (!spec) return null;
  if (typeof spec === "string" && /^\d+:\d+$/.test(spec)) { const [a, b] = spec.split(":").map(Number), ar = a / b, car = canvas.w / canvas.h; return car > ar ? { name: spec, x: (1 - ar / car) / 2, y: 0, w: ar / car, h: 1 } : { name: spec, x: 0, y: (1 - car / ar) / 2, w: 1, h: car / ar }; }
  if (typeof spec === "string") { const v = spec.split(",").map(Number); if (v.length === 4 && v.every(Number.isFinite)) return { name: `crop ${spec}`, x: v[0], y: v[1], w: v[2], h: v[3] }; return null; }
  return spec;
};
const inside = (b, c, pad = 0.01) => b.x >= c.x + pad && b.y >= c.y + pad && b.x + b.w <= c.x + c.w - pad && b.y + b.h <= c.y + c.h - pad;

// ---------------------------------------------------------------------------------------------------------------------------------- recipe requirements
export function recipeRequirements(recipe, manifest, scene) {
  const D2 = [], objs = (manifest.objects || []).filter((o) => o.kind === recipe), fmt = RECIPE_FORMAT[recipe];
  const real = objs.filter((o) => !o.synthetic);
  const mode = scene ? scene.mode : null;
  const miss = (code, msg, fix) => D2.push(D(code, "error", recipe, msg, fix));
  if (!objs.length) { miss(recipe === "lidar-survey" ? "survey-blocked-no-points" : "recipe-source-missing", recipe === "lidar-survey" ? "no point data: 'survey' mode is blocked, no terrain is invented" : `${recipe} has no ${fmt} source ingested`, `ingest an authorized ${fmt} file: evidence.mjs ingest --kind ${recipe} --source <file> ...`); return D2; }
  if (recipe === "lidar-survey" && mode === "survey" && !real.length) miss("survey-blocked-no-points", "survey mode needs real point data: only a synthetic fixture is ingested", "ingest an authorized point sample, or label the scene schematic");
  if (recipe === "satellite-briefing") for (const o of objs) {
    const gaps = [!o.meta.captured && "captured (date)", !(o.meta.extent && Number(o.meta.extent.width) > 0) && "extent (known width)", !o.meta.source_name && !o.origin.label && "source"].filter(Boolean);
    if (gaps.length && !o.synthetic) miss("imagery-metadata-missing", `${o.id}: ${gaps.join(", ")} missing: the image cannot be called a measured briefing`, "add the capture date and known extent with --meta, or tag the scene schematic");
    if (scene && scene.claims_change) { const dated = real.filter((x) => x.meta.captured); if (dated.length < 2 || new Set(dated.map((x) => x.meta.captured)).size < 2) miss("change-claim-unsupported", "the scene claims a change, but fewer than two dated, real images support it", "ingest the before and after images with their dates; a generated or mock background never shows a change"); }
  }
  if (recipe === "microscope") for (const o of objs) if (!(o.meta.scale_bar && Number(o.meta.scale_bar.length) > 0 && Number(o.meta.scale_bar.pixels) > 0)) {
    if (scene && scene.elements && scene.elements.some((e) => e.measurement)) miss("scale-calibration-missing", `${o.id}: no scale-bar calibration, yet the scene shows a measurement`, "supply meta.scale_bar {pixels, length, unit}, or show only a labelled illustration with no measured conclusion");
    else if (!o.synthetic && mode === "measured") miss("scale-calibration-missing", `${o.id}: measured microscope story without a scale-bar calibration`, "supply meta.scale_bar {pixels, length, unit}, or tag the scene schematic");
  }
  if (recipe === "archive-lighttable") for (const o of objs) {
    const gaps = [!o.meta.date && "date", !o.meta.repository && "repository", !o.meta.rights && "rights"].filter(Boolean);
    if (gaps.length && !o.synthetic) miss("provenance-incomplete", `${o.id}: ${gaps.join(", ")} missing: an archive page is shown with its provenance`, "add title, date, repository and rights with --meta");
    for (const s of o.meta.snippets || []) { const w = String(s.text).split(/\s+/).filter(Boolean).length; if (w > 80) miss("snippet-too-long", `${o.id}/${s.id}: ${w} words: an archival page is not permission to reproduce copyrighted text at length`, "quote one short passage (25 words or fewer) and its locator"); else if (w > 25) D2.push(D("snippet-long", "warn", `${o.id}/${s.id}`, `${w} words quoted: keep to 25 or fewer unless the rights allow more`, "shorten the snippet or record the licence")); if (!s.locator) miss("locator-missing", `${o.id}/${s.id}: a snippet needs its page / line locator`, "add locator like page:3/line:12-14"); }
  }
  if (recipe === "exploded-teardown") for (const o of objs) if ((o.summary.parts || []).length < 2) miss("parts-missing", `${o.id}: fewer than two parts: nothing to explode`, "supply a model or parts list with at least two named parts; internal parts are never invented");
  if (recipe === "white-model" && mode === "measured" && !objs.some((o) => o.format === "model" && !o.synthetic)) miss("model-not-authorized", "projection on a white model needs a user-authorized model, or a scene labelled schematic", "ingest the authorized model, or build mode schematic");
  if (recipe === "data-physical") for (const o of objs) if (!(o.summary.columns || []).some((c) => c.numeric)) miss("table-no-numbers", `${o.id}: no numeric column to map to objects`, "supply a table with a numeric column and its unit in the header");
  return D2;
}

// ---------------------------------------------------------------------------------------------------------------------------------- scene check
function verifyLidar(run, manifest, scene, out) {
  const el = (scene.elements || []).find((e) => e.type === "points"); if (!el) return;
  const obj = (manifest.objects || []).find((o) => o.id === el.object);
  if (!obj) { out.push(D("source-missing", "error", "scene.points", `the point layer names source ${el.object}, which is not in the manifest`, "re-run scene-data")); return; }
  const f = objFile(run, obj); if (!fs.existsSync(f)) return;
  const src = readPoints(f).points, t = el.transform || scene.transform;
  if (!t || !Array.isArray(t.center) || !Number.isFinite(Number(t.scale)) || !Array.isArray(el.points)) { out.push(D("lidar-relative-changed", "error", "scene.points", "the point layer has no transform (center, scale) from the source", "re-run scene-data: it writes the one uniform scale and shift that map the source to the scene")); return; }
  if (t.z_scale != null && Number(t.z_scale) !== 1 && !scene.disclosed_exaggeration) out.push(D("lidar-vertical-exaggeration", "error", "scene.points", `the vertical axis is scaled x${t.z_scale} against the horizontal and the scene does not disclose it`, "keep z at the same scale as x and y, or add disclosed_exaggeration with an on-screen label"));
  const tol = 1e-6 * (Math.max(...pointStats(src).size) || 1) * Number(t.scale) + 1e-9;
  let worst = 0, at = -1, missing = 0;
  for (const p of el.points) {
    const sp = src[p[4]]; if (!sp) { missing++; continue; }
    for (let i = 0; i < 3; i++) { const exp = (sp[i] - t.center[i]) * Number(t.scale), d = Math.abs((i === 2 && t.z_scale ? p[i] / Number(t.z_scale) : p[i]) - exp); if (d > worst) { worst = d; at = p[4]; } }
  }
  if (missing) out.push(D("lidar-relative-changed", "error", "scene.points", `${missing} scene point(s) name a source index that does not exist`, "re-run scene-data from the ingested point file"));
  if (worst > tol * 5) out.push(D("lidar-relative-changed", "error", "scene.points", `a point (source index ${at}) sits ${r6(worst)} scene units from where one uniform scale and shift of the source puts it: the relative measured positions were changed`, "do not move, jitter, smooth or re-sample coordinates: re-run scene-data so the scene is the source under one scale and shift"));
}
export function checkScene(run, manifest, scene, o = {}) {
  const out = [];
  const meas = new Map((manifest.measurements || []).map((m) => [m.id, m]));
  const claims = claimIds(run);
  const locale = scene.locale || "en-US";
  const canvas = scene.canvas || { w: 1920, h: 1080 };
  if (scene.schema !== SCENE_SCHEMA) out.push(D("scene-schema", "error", "scene.json", `schema is "${scene.schema}", expected ${SCENE_SCHEMA}`, "re-run scene-data"));
  // labels are derived from the measurement, never authored
  const used = new Set(), shown = new Set(), okTexts = new Set();
  for (const e of scene.elements || []) {
    if (e.measurements) {
      const ms = e.measurements.map((id) => meas.get(id));
      if (ms.some((m) => !m)) { out.push(D("source-missing", "error", `scene.${e.id}`, `label cites a measurement that is not in the manifest (${e.measurements.join(", ")})`, "cite measurement ids from evidence/manifest.json")); continue; }
      const want = ms.map((m) => formatValue(m.value, m.unit, locale)).join(" × ");
      if (e.label && norm(e.label.text) !== norm(want)) out.push(D("label-not-derived", "error", `scene.${e.id}`, `label "${e.label.text}" differs from the measurements (${want})`, "derive the label from the source object (scene-data does); never type a number"));
      else if (e.label) okTexts.add(norm(e.label.text));
      continue;
    }
    if (e.type === "snippet") {
      const ob = (manifest.objects || []).find((x) => x.id === e.object), sn = ob && (ob.meta.snippets || []).find((x) => x.id === e.snippet);
      const body = String(e.text || "").replace(/…$/, "").trim();
      if (!sn || !norm(sn.text).startsWith(norm(body))) out.push(D("snippet-not-from-source", "error", `scene.${e.id}`, "the quoted text is not the supplied snippet", "quote only the located snippet from the manifest: no paraphrase on a quote card"));
      continue;
    }
    if (e.measurement) {
      const m = meas.get(e.measurement); used.add(e.measurement);
      if (!m) { out.push(D("source-missing", "error", `scene.${e.id}`, `label cites measurement "${e.measurement}", which is not in the manifest`, "cite a measurement id from evidence/manifest.json")); continue; }
      const want = (e.label && e.label.prefix ? e.label.prefix : "") + formatValue(m.value, m.unit, locale);
      if (e.label && e.label.text !== undefined && norm(e.label.text) !== norm(want)) out.push(D("label-not-derived", "error", `scene.${e.id}`, `label "${e.label.text}" differs from the measurement (${want}, ${m.id})`, "derive the label from the source object (scene-data does); never type a number"));
      shown.add(norm(want));
      if (e.label && norm(e.label.text) === norm(want)) okTexts.add(norm(want));
      if (e.presentation && e.presentation !== m.presentation) out.push(D("presentation-mismatch", "error", `scene.${e.id}`, `the element is drawn as ${e.presentation}, the measurement is ${m.presentation}`, "take the presentation from the measurement"));
    } else if (e.label && /\d/.test(String(e.label.text || "")) && e.label.kind !== "axis" && e.label.kind !== "quote") out.push(D("number-without-measurement", "error", `scene.${e.id}`, `label "${e.label.text}" carries a number with no measurement`, "attach a measurement id (a source cell, part or claim), or remove the number"));
  }
  // every number on screen resolves to a measurement or a ledger claim (slop.mjs's number-not-in-ledger still runs on the real film)
  const rd = path.join(run, "research"), ledgerFiles = [path.join(rd, "claims.json"), ...(fs.existsSync(rd) ? fs.readdirSync(rd).filter((x) => /\.claims\.json$/.test(x)).map((x) => path.join(rd, x)) : [])];
  // the same number parser slop.mjs uses (a "m" after a number reads as millions there too): the measurements' own strings are known, as are the ledger's
  const known = knownNumbers([...ledgerFiles.map((f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } }), ...[...meas.values()].map((m) => `${formatValue(m.value, m.unit, "en-US")} ${m.value}`)].join("\n"));
  const r2 = (x) => Math.round(x * 100) / 100;
  for (const t of scene.texts || []) {
    if (["axis", "quote", "disclosure", "provenance", "name"].includes(t.kind) || okTexts.has(norm(t.text))) continue; // a text equal to a label verified as derived is already resolved (its number is the measurement's, in any locale)
    for (const n of numbersIn(t.text)) if (!known.has(r2(n.value))) out.push(D("number-unresolved", "error", `scene text "${String(t.text).slice(0, 40)}"`, `"${n.raw}" on screen resolves to no measurement or claim`, "show only numbers from a measurement (a source cell) or a claim in research/claims.json"));
  }
  // schematic must be visibly labelled and never read as surveyed
  const schematic = scene.mode === "schematic" || (scene.elements || []).some((e) => (e.measurement && meas.get(e.measurement) && meas.get(e.measurement).presentation === "schematic") || e.presentation === "schematic");
  const measuredWithFixture = (scene.mode === "measured" || scene.mode === "survey") && (scene.elements || []).some((e) => e.measurement && meas.get(e.measurement) && meas.get(e.measurement).presentation === "schematic");
  if (measuredWithFixture) out.push(D("schematic-presented-as-measured", "error", "scene.mode", "the scene is marked measured/survey but shows schematic (fixture) values", "set mode schematic, or ingest the real source"));
  if (schematic) {
    const d = scene.disclosure;
    if (!d || !String(d.text || "").includes(SCHEMATIC_LABEL) || !d.box) out.push(D("schematic-unlabelled", "error", "scene.disclosure", `a schematic scene must carry a visible "${SCHEMATIC_LABEL}" label`, "re-run scene-data: it adds the label; do not remove it"));
    else {
      const rects = [d.box]; const pv = o.preview && o.preview.rects && o.preview.rects.disclosure; const box = pv || d.box;
      const crops = [...(scene.crops || []), ...(o.crops || [])].map((c) => cropRect(c, canvas)).filter(Boolean);
      for (const c of crops) if (!inside(box, c)) out.push(D("schematic-label-cropped", "error", `crop ${c.name || ""}`, `the ${SCHEMATIC_LABEL} label (${pv ? "measured in the render" : "from the layout"}) is cut off or outside the safe margin of the ${c.name || "crop"} crop`, `build the layout for that aspect (scene-data --aspect ${c.name && /^\d+:\d+$/.test(c.name) ? c.name : "9:16"}) so the label sits inside it, or do not crop the label out`));
      void rects;
    }
  }
  // provenance is on screen for the recipes that depend on it
  const needsProv = ["satellite-briefing", "microscope", "archive-lighttable"].includes(scene.recipe);
  if (needsProv && !(scene.provenance && scene.provenance.text)) out.push(D("provenance-not-shown", "error", "scene.provenance", `${scene.recipe} shows its source, date and rights on screen`, "re-run scene-data: it writes the provenance line from the manifest"));
  if (scene.provenance && scene.provenance.objects) for (const id of scene.provenance.objects) if (!(manifest.objects || []).some((x) => x.id === id)) out.push(D("source-missing", "error", "scene.provenance", `provenance names ${id}, not in the manifest`, "re-run scene-data"));
  if (scene.recipe === "data-physical") {
    const bars = (scene.elements || []).filter((e) => e.type === "bar");
    const units = new Set(bars.map((b) => meas.get(b.measurement) && normUnit(meas.get(b.measurement).unit)).filter((x) => x != null));
    if (units.size > 1) out.push(D("unit-mismatch", "error", "scene.bars", `the bars mix units (${[...units].join(", ")}) on one axis`, "convert the column to one unit before mapping, or split the chart"));
    if (scene.axis && Number(scene.axis.min) !== 0) out.push(D("axis-not-from-zero", "error", "scene.axis", "physical bars start at zero", "set axis.min 0: a truncated axis exaggerates differences"));
    if (scene.axis && scene.axis.unit && units.size === 1 && normUnit(scene.axis.unit) !== [...units][0]) out.push(D("unit-mismatch", "error", "scene.axis", `the axis says ${scene.axis.unit}, the values are ${[...units][0]}`, "label the axis with the measurement's unit"));
    const ks = bars.map((b) => { const m = meas.get(b.measurement); return m && Number(m.value) ? b.height / Number(m.value) : null; }).filter((x) => x != null);
    if (ks.length > 1 && Math.max(...ks) - Math.min(...ks) > 1e-6 * Math.max(...ks)) out.push(D("bars-not-proportional", "error", "scene.bars", "bar heights are not proportional to their values", "map value to height with one linear scale from zero"));
  }
  if (scene.recipe === "lidar-survey") verifyLidar(run, manifest, scene, out);
  // what the browser really drew: every drawn string with a digit is a listed scene text (so a label cannot appear that the scene does not account for)
  if (o.preview && Array.isArray(o.preview.drawn)) { const listed = new Set((scene.texts || []).map((t) => norm(t.text))); for (const s of o.preview.drawn) if (/\d/.test(s) && !listed.has(norm(s))) out.push(D("drawn-text-unlisted", "error", "preview", `the render drew "${String(s).slice(0, 50)}", which the scene does not list`, "every drawn number comes from scene.texts (derived from measurements): re-run scene-data and preview")); }
  void used; void shown;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------- check
export function checkEvidence(run, o = {}) {
  run = path.resolve(run);
  const out = [];
  const manifest = loadManifest(run);
  if (!manifest) return { ok: false, strict: !!o.strict, errors: [D("manifest-missing", "error", "evidence/manifest.json", "no evidence manifest in this run", "ingest the sources first: evidence.mjs ingest --run <RUN> --source <file> --kind <recipe> ...")], warnings: [], diagnostics: [], objects: 0, measurements: 0 };
  if (manifest.schema !== SCHEMA) out.push(D("manifest-schema", "error", "manifest.json", `schema is "${manifest.schema}", expected ${SCHEMA}`, "re-ingest the sources"));
  if (hasPrivatePath(JSON.stringify(manifest))) out.push(D("private-path", "error", "manifest.json", "the manifest names a private local path", "paths stay relative to the run (evidence/sources/...); name origins by title and publisher"));
  const ids = new Set();
  for (const ob of manifest.objects || []) {
    const w = `object ${ob.id}`;
    if (ids.has(ob.id)) out.push(D("duplicate-id", "error", w, "two objects share one id", "ids are unique")); ids.add(ob.id);
    for (const k of ["content_hash", "origin", "source_type", "permission", "processing_note"]) if (!ob[k] || (k === "origin" && !ob.origin.label) || (k === "permission" && !ob.permission.status)) out.push(D("provenance-incomplete", "error", w, `${k} is missing`, "every object has a content hash, origin, source type, permission and processing note: re-ingest it"));
    if (ob.file) {
      const f = path.join(run, ob.file);
      if (!fs.existsSync(f)) out.push(D("object-file-missing", "error", w, `${ob.file} is not in the run`, "re-ingest the source"));
      else if (`sha256:${sha(fs.readFileSync(f))}` !== ob.content_hash) out.push(D("object-hash-mismatch", "error", w, `${ob.file} changed since it was ingested`, "the source is evidence: re-ingest the new file and re-derive its measurements"));
    }
    if (ob.permission && ob.permission.status === "fixture" && !ob.synthetic) out.push(D("fixture-not-synthetic", "error", w, "permission fixture on a non-synthetic object", "state the real permission"));
    if (ob.synthetic && ob.source_type !== "synthetic-fixture") out.push(D("provenance-incomplete", "error", w, "a synthetic object must be typed synthetic-fixture", "never present synthetic data as a source"));
    if (ob.exif) out.push(D("personal-metadata", "warn", w, "the original image carries EXIF / text metadata", "the render drops it; keep the original out of the delivery folder"));
  }
  const meas = manifest.measurements || [], mids = new Set(), claims = claimIds(run), srcIds = sourceIds(run), truth = truthText(run);
  const byObj = new Map((manifest.objects || []).map((x) => [x.id, x]));
  for (const m of meas) {
    const w = `measurement ${m.id}`;
    if (mids.has(m.id)) out.push(D("duplicate-id", "error", w, "two measurements share one id", "ids are unique")); mids.add(m.id);
    if (!Number.isFinite(Number(m.value)) || m.value === null || m.value === "") { out.push(D("value-invalid", "error", w, "value is not a number", "a measurement is a number with a unit")); continue; }
    if (!PRESENTATIONS.includes(m.presentation)) out.push(D("presentation-invalid", "error", w, `presentation "${m.presentation}" is not measured or schematic`, "use measured (grounded) or schematic (labelled)"));
    for (const k of ["method", "locator"]) if (!String(m[k] || "").trim()) out.push(D("measurement-incomplete", "error", w, `${k} is missing`, "a measurement names its method and its locator (page / cell / region / object)"));
    if (m.unit === undefined || m.unit === null) out.push(D("unit-missing", "error", w, "no unit", "state the unit the source states"));
    else if (m.unit !== "" && !unitInfo(m.unit)) out.push(D("unit-unknown", "error", w, `unit "${m.unit}" is not one RasanAI knows`, `use one of: ${Object.keys(UNITS).join(", ")}`));
    const ob = byObj.get(m.source_id);
    if (!m.source_id || (!ob && !srcIds.has(String(m.source_id)))) { out.push(D("source-missing", "error", w, `source "${m.source_id || ""}" is in neither the evidence manifest nor sources.json`, "ingest the source (evidence.mjs ingest) or cite a registered source id")); continue; }
    if (m.claim_ref && !claimResolves(run, m.claim_ref, claims, truth)) out.push(D("claim-ref-missing", "error", w, `claim_ref "${m.claim_ref}" is not in research/claims.json or the truth sheet`, "cite an existing claim id (a second facts store is not allowed): add the claim with its source first"));
    for (const d of m.derived_from || []) if (!meas.some((x) => x.id === d)) out.push(D("derived-source-missing", "error", w, `derived from ${d}, which does not exist`, "list the measurements the value is computed from"));
    if (m.presentation === "measured") {
      if (ob && (ob.synthetic || m.confidence === "fixture-only")) out.push(D("measured-not-grounded", "error", w, "marked measured, but its source is a synthetic fixture", "a fixture is schematic: set presentation schematic (and show the label), or ingest the real source"));
      if (!ob && !(m.derived_from || []).length && !m.claim_ref) out.push(D("measured-not-grounded", "error", w, "measured, but only a registered source id backs it, with no locator check and no claim", "attach claim_ref to a ledger claim, or ingest the source file"));
    }
    if (ob && !(m.derived_from || []).length) {
      let r = null; try { r = resolveLocator(run, ob, m.locator); } catch { r = null; }
      if (!r) { if (m.presentation === "measured") out.push(D("fictional-measurement", "error", w, `locator "${m.locator}" does not resolve in ${ob.id}: the value is not in the source`, "a measured number comes from a real cell, part or point set: fix the locator or remove the number")); else out.push(D("locator-unresolved", "warn", w, `locator "${m.locator}" does not resolve in ${ob.id}`, "fix the locator")); }
      else {
        const mu = normUnit(m.unit), su = normUnit(r.unit);
        const a = unitInfo(mu), b = unitInfo(su);
        if (su && mu && (!a || !b)) { /* reported above */ }
        else if (a && b && a.dim !== b.dim) out.push(D("unit-mismatch", "error", w, `the measurement says ${mu} (${a.dim}) but the source cell is ${su} (${b.dim})`, `use the source's unit (${su}) or convert it exactly; the unit is never guessed`));
        else if (!a && !b ? false : !a !== !b) out.push(D("unit-mismatch", "error", w, `the measurement says "${mu || "no unit"}" but the source says "${su || "no unit"}"`, "state the unit the source states"));
        else { const conv = a && b ? convert(r.value, su, mu) : r.value; if (Math.abs(conv - Number(m.value)) > 1e-9 * Math.max(1, Math.abs(conv))) out.push(D("fictional-measurement", "error", w, `value ${m.value} ${mu} is not what ${ob.id} holds at ${m.locator} (${r6(conv)} ${mu})`, "a number on screen must equal its source: fix the value or the locator")); }
      }
    }
  }
  // the recipes' own requirements, from the scene when there is one
  const scenePath = o.scene ? path.resolve(o.scene) : path.join(evidenceDir(run), "scene.json");
  const scene = fs.existsSync(scenePath) ? jm(scenePath) : null;
  const recipes = o.recipe ? [o.recipe] : scene && scene.recipe ? [scene.recipe] : [...new Set((manifest.objects || []).map((x) => x.kind))];
  for (const r of recipes) if (RECIPES.includes(r)) out.push(...recipeRequirements(r, manifest, scene && scene.recipe === r ? scene : null));
  if (scene) {
    const pvf = o.previewFile ? path.resolve(o.previewFile) : path.join(evidenceDir(run), "preview", "preview.json");
    const pv = jm(pvf);
    const fresh = pv && pv.scene_sha256 === sha(fs.readFileSync(scenePath)) ? pv : null;
    out.push(...checkScene(run, manifest, scene, { crops: o.crops || [], preview: fresh }));
  }
  const strict = !!o.strict;
  const errors = out.filter((d) => d.severity === "error" || (strict && d.severity === "warn"));
  const warnings = out.filter((d) => !errors.includes(d));
  return { ok: !errors.length, strict, objects: (manifest.objects || []).length, measurements: meas.length, scene: scene ? path.relative(run, scenePath) : null, errors, warnings, diagnostics: out };
}

// ---------------------------------------------------------------------------------------------------------------------------------- ledger, credits, delivery
// grounded measurements only, in the claims format slop.mjs already reads (research/*.claims.json); fixtures never become claims
export function writeLedger(run) {
  const m = loadManifest(run); if (!m) return { ok: false, claims: 0 };
  const byObj = new Map((m.objects || []).map((x) => [x.id, x]));
  const claims = (m.measurements || []).filter((x) => x.presentation === "measured" && byObj.get(x.source_id) && !byObj.get(x.source_id).synthetic).map((x) => ({ id: `ev-${x.id}`, claim: `${x.label || x.id}: ${formatValue(x.value, x.unit)}`, kind: "number", value: String(x.value), unit: x.unit, source: `evidence:${x.source_id}`, quote: x.locator, date: x.timestamp || null, confidence: "high" }));
  const f = path.join(run, "research", "evidence.claims.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(claims, null, 2) + "\n");
  return { ok: true, claims: claims.length, file: path.relative(run, f) };
}
const pubObj = (o) => ({ id: o.id, kind: o.kind, format: o.format, content_hash: o.content_hash, origin: o.origin, source_type: o.source_type, permission: o.permission, license: o.license || null, attribution: o.attribution || null, synthetic: !!o.synthetic, processing_note: o.processing_note, ...(o.meta && (o.meta.captured || o.meta.date) ? { date: o.meta.captured || o.meta.date } : {}) });
// no local paths, no file names, no EXIF: what may travel with a delivered film
export function publicEvidence(run) {
  const m = loadManifest(run); if (!m || !(m.objects || []).length) return null;
  const objects = m.objects.map(pubObj);
  const measurements = (m.measurements || []).map((x) => ({ id: x.id, value: x.value, unit: x.unit, source_id: x.source_id, locator: x.locator, method: x.method, presentation: x.presentation, ...(x.claim_ref ? { claim_ref: x.claim_ref } : {}), ...(x.uncertainty != null ? { uncertainty: x.uncertainty } : {}) }));
  const out = { schema: `${SCHEMA}/public`, objects, measurements };
  if (hasPrivatePath(JSON.stringify(out))) return { ...JSON.parse(scrub(JSON.stringify(out))) };
  return out;
}
export function evidenceCredits(run) {
  const m = loadManifest(run); if (!m || !(m.objects || []).length) return null;
  const L = ["EVIDENCE SOURCES"];
  for (const o of m.objects) {
    const lic = o.license ? `, ${o.license}` : "";
    if (o.synthetic) L.push(`${o.id}: SYNTHETIC test fixture, not real data and not a source of facts (${o.origin.label}).`);
    else L.push(`${o.attribution || o.origin.label} (${o.source_type}, permission: ${o.permission.status}${lic}) ${o.origin.url || ""}`.trim() + ` [${o.kind}: ${o.id}, ${o.content_hash.slice(0, 19)}]`);
  }
  L.push("");
  return scrub(L.join("\n"));
}
export function evidenceRecipeLines(run) {
  const m = loadManifest(run); if (!m || !(m.objects || []).length) return null;
  let chk = null; try { const c = checkEvidence(run, {}); chk = `${c.ok ? "passes" : "FAILS"} evidence.mjs check (${c.errors.length} error(s), ${c.warnings.length} warning(s))`; } catch { chk = "evidence check could not run"; }
  const L = ["## Evidence (every number and geometry traces to these sources)", `- ${chk}`];
  for (const o of m.objects) L.push(`- ${o.id} (${o.kind}): ${o.synthetic ? "SYNTHETIC fixture, schematic only" : `${o.source_type}, permission ${o.permission.status}`}; ${o.content_hash.slice(0, 19)}; ${o.processing_note}`);
  L.push(`- ${(m.measurements || []).length} measurement rows; the delivered \`evidence.json\` carries them without local paths. Re-derive with \`evidence.mjs scene-data\`; a changed source hash fails the check.`, "");
  return scrub(L.join("\n"));
}
