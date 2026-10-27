// Element index core (contract C): project files, static scan of data-el annotations, digest, schema check,
// point lookup and the letterbox mapping helper. Pure Node, no dependencies, no browser.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const SCHEMA_VERSION = 1;
export const KINDS = ["text", "image", "shape", "ui", "3d", "video"];
export const CAPABILITIES = ["dom", "projected-3d", "raster"];
export const EDITABLE_ALL = ["text", "position", "scale", "color", "timing", "motion_preset"];
const DEFAULT_EDITABLE = {
  text: ["text", "position", "scale", "color", "timing", "motion_preset"],
  image: ["position", "scale", "timing", "motion_preset"],
  video: ["timing"],
  shape: ["position", "scale", "color", "timing", "motion_preset"],
  ui: ["position", "scale", "color", "timing", "motion_preset"],
  "3d": ["timing"],
};
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// ---- path safety -----------------------------------------------------------------------------------------
export function projectRoot(dir) {
  if (!dir || dir === true) throw new Error("--project <dir> is required");
  const root = fs.realpathSync(path.resolve(String(dir)));
  if (!fs.statSync(root).isDirectory()) throw new Error(`not a directory: ${dir}`);
  return root;
}
export function insideRoot(root, p) {
  let real;
  try { real = fs.realpathSync(p); } catch { return false; }
  return real === root || real.startsWith(root + path.sep);
}
/** True when scene code loads a script or stylesheet from the network (such files are never executed). */
export function hasRemoteCode(html) {
  return /<script\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html) || /<link\b[^>]*\bhref\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html) || /\bimport\s*\(?\s*["']https?:/i.test(html);
}

function walkHtml(root, dir, out, depth = 0) {
  if (depth > 6) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory() || e.isSymbolicLink()) {
      if (insideRoot(root, p) && fs.statSync(p).isDirectory()) walkHtml(root, p, out, depth + 1);
    } else if (e.isFile() && /\.html?$/i.test(e.name) && insideRoot(root, p)) out.push(p);
  }
}
/** Scene source files: root index.html, compositions/**.html. Project-relative, sorted. */
export function sceneFiles(root) {
  const abs = [];
  const idx = path.join(root, "index.html");
  if (fs.existsSync(idx) && insideRoot(root, idx)) abs.push(idx);
  walkHtml(root, path.join(root, "compositions"), abs);
  return abs.map((p) => path.relative(root, p).split(path.sep).join("/"));
}
export function readScore(root) {
  const p = path.join(root, "score.json");
  if (!fs.existsSync(p) || !insideRoot(root, p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
export function buildDigest(root) {
  const h = crypto.createHash("sha256");
  const files = sceneFiles(root);
  if (fs.existsSync(path.join(root, "score.json")) && insideRoot(root, path.join(root, "score.json"))) files.push("score.json");
  for (const f of files.sort()) {
    h.update(f + "\0");
    h.update(fs.readFileSync(path.join(root, f)));
    h.update("\0");
  }
  return h.digest("hex");
}

// ---- static scan -----------------------------------------------------------------------------------------
function parseAttrs(s) {
  const a = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(s))) a[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return a;
}
const num = (v) => (v == null || v === "" || !isFinite(Number(v)) ? null : Number(v));

/** Tokenise tags with a stack so each data-el element knows its timing ancestors and its own text. */
export function scanHtml(html) {
  const found = [];
  const roots = [];
  const comps = [];
  const stack = [];
  const lower = html.toLowerCase();
  const re = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m, last = 0;
  while ((m = re.exec(html))) {
    const text = html.slice(last, m.index);
    last = re.lastIndex;
    if (text.trim()) for (const f of stack) if (f.rec) f.rec.text += text;
    if (m[0].startsWith("<!--")) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    if (tag === "script" || tag === "style") {
      const end = lower.indexOf(`</${tag}`, re.lastIndex);
      if (end > 0) { re.lastIndex = end; last = end; }
      continue;
    }
    const attrs = parseAttrs(m[3].replace(/\/\s*$/, ""));
    const frame = { tag, attrs, start: num(attrs["data-start"]), duration: num(attrs["data-duration"]), rec: null };
    if (attrs["data-composition-id"] != null) roots.push({ id: attrs["data-composition-id"], w: num(attrs["data-width"]), h: num(attrs["data-height"]), start: frame.start, duration: frame.duration });
    if (attrs["data-composition-src"]) comps.push({ src: attrs["data-composition-src"], start: frame.start, duration: frame.duration });
    if (attrs["data-el"]) {
      const timing = [...stack, frame].filter((f) => f.start != null || f.duration != null).map((f) => ({ start: f.start, duration: f.duration, root: f.attrs["data-composition-id"] != null }));
      frame.rec = { el: attrs["data-el"], tag, attrs, text: "", order: found.length, timing };
      found.push(frame.rec);
    }
    if (!VOID.has(tag) && !/\/\s*>$/.test(m[0])) stack.push(frame);
  }
  return { root: roots[0] || null, found, comps };
}

export function kindOf(rec) {
  const k = (rec.attrs["data-el-kind"] || "").toLowerCase();
  if (KINDS.includes(k)) return k;
  if (rec.tag === "img" || rec.tag === "picture") return "image";
  if (rec.tag === "video") return "video";
  if (rec.tag === "canvas" || "data-3d" in rec.attrs) return "3d";
  if (rec.tag === "svg" || rec.tag === "path") return "shape";
  if (rec.text.trim() || /^(h[1-6]|p|span|a|li|button|label)$/.test(rec.tag)) return "text";
  return "shape";
}
export const capabilityOf = (kind) => (kind === "image" || kind === "video" ? "raster" : kind === "3d" ? "projected-3d" : "dom");
export function editableOf(rec, kind) {
  const v = rec.attrs["data-el-editable"];
  const allowed = DEFAULT_EDITABLE[kind];
  if (v == null) return allowed.slice();
  // raster/3d layers are clip-level only; never a text claim
  return v.split(",").map((s) => s.trim()).filter((s) => EDITABLE_ALL.includes(s) && allowed.includes(s));
}
export const sceneIdOf = (el, fallback) => (el.includes(".") ? el.slice(0, el.indexOf(".")) : fallback);
export function labelOf(rec) {
  return rec.attrs["data-el-label"] || rec.text.trim().replace(/\s+/g, " ").slice(0, 60) || rec.attrs.alt || rec.el.split(".").pop();
}

// ---- lookup ----------------------------------------------------------------------------------------------
/** Linear interpolation of bounds_samples at t (clamped to the first/last sample); null when none. */
export function boundsAt(samples, t) {
  if (!samples || !samples.length) return null;
  if (t <= samples[0].t_s) return samples[0];
  const L = samples[samples.length - 1];
  if (t >= L.t_s) return L;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (t <= b.t_s) {
      const k = b.t_s === a.t_s ? 0 : (t - a.t_s) / (b.t_s - a.t_s);
      const l = (p) => a[p] + (b[p] - a[p]) * k;
      return { t_s: t, x: l("x"), y: l("y"), w: l("w"), h: l("h") };
    }
  }
  return L;
}
/** Candidates under a point (x, y normalised 0..1 of the frame) at time t, topmost (highest z) first. */
export function lookup(index, t, nx, ny) {
  const { w, h } = index.frame_size;
  const px = nx * w, py = ny * h;
  const out = [];
  for (const it of index.items || []) {
    const [a, b] = it.active_s || [-Infinity, Infinity];
    if (t < a || t > b) continue;
    const bb = boundsAt(it.bounds_samples, t);
    if (!bb || bb.w <= 0 || bb.h <= 0) continue;
    if (px >= bb.x && px <= bb.x + bb.w && py >= bb.y && py <= bb.y + bb.h) {
      out.push({ ...it, bounds_at_t: { x: bb.x, y: bb.y, w: bb.w, h: bb.h }, bounds_norm: { x: bb.x / w, y: bb.y / h, w: bb.w / w, h: bb.h / h } });
    }
  }
  return out.sort((p, q) => q.z - p.z);
}
/**
 * Map a pointer in a letterboxed (contain-fit) view into frame-normalised coordinates.
 * view = displayed rectangle {w,h} in the same units as px,py; frame = {w,h}.
 * Returns {x,y,inside}: x,y are 0..1 of the frame; inside=false when the pointer is on a bar.
 */
export function letterboxToFrameNorm(px, py, view, frame) {
  const s = Math.min(view.w / frame.w, view.h / frame.h);
  const dw = frame.w * s, dh = frame.h * s;
  const ox = (view.w - dw) / 2, oy = (view.h - dh) / 2;
  const x = (px - ox) / dw, y = (py - oy) / dh;
  return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}

// ---- schema check ----------------------------------------------------------------------------------------
export function validateIndex(ix) {
  const errs = [];
  const bad = (m) => errs.push(m);
  if (!ix || typeof ix !== "object") return ["not an object"];
  if (ix.schema_version !== SCHEMA_VERSION) bad("schema_version must be 1");
  if (typeof ix.build_digest !== "string" || !/^[0-9a-f]{64}$/.test(ix.build_digest)) bad("build_digest must be a sha256 hex");
  if (!ix.frame_size || !(ix.frame_size.w > 0) || !(ix.frame_size.h > 0)) bad("frame_size {w,h} required");
  if (!Array.isArray(ix.items)) { bad("items must be an array"); return errs; }
  const seen = new Set();
  ix.items.forEach((it, i) => {
    const at = `items[${i}]`;
    if (typeof it.element_id !== "string" || !it.element_id) bad(`${at}.element_id`);
    else if (seen.has(it.element_id)) bad(`${at}.element_id duplicate: ${it.element_id}`);
    else seen.add(it.element_id);
    if (!KINDS.includes(it.kind)) bad(`${at}.kind`);
    if (!CAPABILITIES.includes(it.capability)) bad(`${at}.capability`);
    if (typeof it.scene_id !== "string") bad(`${at}.scene_id`);
    if (!Array.isArray(it.active_s) || it.active_s.length !== 2 || !(it.active_s[1] >= it.active_s[0])) bad(`${at}.active_s`);
    if (!Array.isArray(it.editable) || it.editable.some((e) => !EDITABLE_ALL.includes(e))) bad(`${at}.editable`);
    else if ((it.kind === "image" || it.kind === "video") && it.editable.includes("text")) bad(`${at} raster claims text editing`);
    if (typeof it.z !== "number") bad(`${at}.z`);
    if (!Array.isArray(it.bounds_samples) || it.bounds_samples.some((s) => ![s.t_s, s.x, s.y, s.w, s.h].every(Number.isFinite))) bad(`${at}.bounds_samples`);
  });
  return errs;
}
