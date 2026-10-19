// Font staging: HyperFrames renders in a clean headless Chrome, so every font family a
// composition names needs a local .woff2 and an @font-face (lint: font_family_without_font_face).
// Order: families HyperFrames resolves itself → files shipped with a frame preset →
// Google Fonts (latin subset) → Fontshare → give up (caller falls back, with a warning).
// 3D type (`k.extrudeText`) cannot read WOFF2 or a variable font: staticTtfFor() turns a staged woff2 / variable / otf into ONE static TTF (or OTF) at a
// weight with fontTools + brotli (Python; font tooling, not an audio library; `pip3 install fonttools brotli`). Missing tools: a recorded downgrade
// and a system face as a stand-in (or set the word with k.text on a plane, which uses the document's own @font-face).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { noteDowngrade } from "./downgrade.mjs";

export const HF_AUTO_FONTS = ["inter", "montserrat", "outfit", "nunito", "oswald", "league gothic", "archivo black", "space mono", "ibm plex mono", "jetbrains mono", "eb garamond", "playfair display", "source code pro", "noto sans jp", "roboto", "open sans", "lato", "poppins"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchText(url) {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  return r.ok ? r.text() : "";
}
async function save(url, dest) {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) return false;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return true;
}

const FONT_EXTS = ["woff2", "woff", "ttf", "otf"];
const FORMATS = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
// the font files the user supplied for a family: assets/fonts/<Compact>-<w>[-italic].<ext> and anything assets/fonts/fonts.json lists for it
// (case-insensitive family match) -> [{ w, style, rel, ext }]
export function localFaces(family, projectDir) {
  const fontDir = path.join(projectDir, "assets", "fonts");
  const out = [], seen = new Set();
  const add = (file, w, style) => {
    const abs = path.isAbsolute(file) ? file : file.includes("/") ? path.join(projectDir, file) : path.join(fontDir, file);
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (!FONT_EXTS.includes(ext) || !fs.existsSync(abs) || seen.has(abs)) return;
    seen.add(abs);
    out.push({ w: Number(w) || 400, style: style === "italic" ? "italic" : "normal", rel: path.relative(projectDir, abs).split(path.sep).join("/"), ext });
  };
  try {
    const j = JSON.parse(fs.readFileSync(path.join(fontDir, "fonts.json"), "utf8"));
    for (const e of Array.isArray(j) ? j : []) if (e && e.file && String(e.family || "").toLowerCase() === family.toLowerCase()) add(String(e.file), e.weight, e.style);
  } catch {}
  const compact = family.replace(/\s+/g, "").toLowerCase();
  if (fs.existsSync(fontDir)) for (const f of fs.readdirSync(fontDir)) {
    const m = f.match(/^(.+)-(\d{3})(-italic)?\.(woff2|woff|ttf|otf)$/i);
    if (m && m[1].toLowerCase() === compact) add(f, m[2], m[3] ? "italic" : "normal");
  }
  return out.sort((a, b) => FONT_EXTS.indexOf(a.ext) - FONT_EXTS.indexOf(b.ext));
}
// the user's own files win over every web source: the exact weight, else the nearest weight the family has (never a silent Inter).
// -> { res, complete (every weight has its own file), listed (fonts.json names the family: a brand kit, so no web lookup) } | null
function stageLocalFamily(family, weights, projectDir) {
  const all = localFaces(family, projectDir);
  if (!all.length) return null;
  const normal = all.filter((f) => f.style === "normal"), italic = all.filter((f) => f.style === "italic");
  const faces = [], put = (f, w, style) => { if (!faces.some((x) => x.w === w && x.style === style)) faces.push({ ...f, w, style }); };
  for (const w of weights) {
    const pool = normal.length ? normal : italic;
    const best = pool.slice().sort((a, b) => Math.abs(a.w - w) - Math.abs(b.w - w) || a.w - b.w)[0];
    put(best, w, best.style);
  }
  for (const f of italic) if (weights.includes(f.w)) put(f, f.w, "italic");
  faces.sort((a, b) => a.w - b.w || (a.style === "italic") - (b.style === "italic"));
  let listed = false;
  try { listed = (JSON.parse(fs.readFileSync(path.join(projectDir, "assets", "fonts", "fonts.json"), "utf8")) || []).some((e) => e && String(e.family || "").toLowerCase() === family.toLowerCase()); } catch {}
  return {
    listed,
    complete: weights.every((w) => normal.some((f) => f.w === w)),
    res: {
      family,
      source: "local",
      files: [...new Set(faces.map((f) => f.rel))],
      css: faces.map((f) => `@font-face { font-family: "${family}"; src: url("${f.rel}") format("${FORMATS[f.ext]}"); font-weight: ${f.w}; font-style: ${f.style}; font-display: block; }`).join("\n  "),
    },
  };
}

// -> { family, css, source, files } ; css is "" when HyperFrames resolves the family itself
export async function stageFont(family, weights, projectDir, { presetDir = null, offline = false } = {}) {
  if (!family) return { family: null, css: "", source: "none", files: [] };
  const mine = stageLocalFamily(family, weights, projectDir);
  if (mine && (mine.listed || mine.complete)) return mine.res;
  if (HF_AUTO_FONTS.includes(family.toLowerCase())) return { family, css: "", source: "hyperframes", files: [] };
  const fontDir = path.join(projectDir, "assets", "fonts");
  const compact = family.replace(/\s+/g, "");
  const faces = [];
  const have = (w) => faces.some((f) => f.w === w);
  for (const w of weights) {
    const name = `${compact}-${w}.woff2`;
    const dest = path.join(fontDir, name);
    if (!fs.existsSync(dest) && presetDir) {
      const cand = path.join(presetDir, "fonts", name);
      if (fs.existsSync(cand)) { fs.mkdirSync(fontDir, { recursive: true }); fs.copyFileSync(cand, dest); }
    }
    if (fs.existsSync(dest)) faces.push({ w, rel: `assets/fonts/${name}`, source: "local" });
  }
  let source = faces.length ? "local" : null;
  const missing = () => weights.filter((w) => !have(w));
  if (missing().length && !offline) {
    try {
      const css = await fetchText(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${missing().join(";")}&display=swap`);
      for (const block of css.split("}")) {
        if (!/\/\* latin \*\//.test(block) && /\/\* [a-z-]+ \*\//.test(block)) continue;
        const wm = block.match(/font-weight:\s*(\d+)/), um = block.match(/url\((https:[^)]+\.woff2)\)/);
        if (!wm || !um || have(Number(wm[1]))) continue;
        const name = `${compact}-${wm[1]}.woff2`;
        if (await save(um[1], path.join(fontDir, name))) { faces.push({ w: Number(wm[1]), rel: `assets/fonts/${name}` }); source = source || "google-fonts"; }
      }
    } catch {}
  }
  if (missing().length && !offline) {
    try {
      const slug = family.toLowerCase().replace(/\s+/g, "-");
      const css = await fetchText(`https://api.fontshare.com/v2/css?f[]=${slug}@${missing().join(",")}&display=swap`); // one family, comma-separated weights
      for (const block of css.split("}")) {
        const wm = block.match(/font-weight:\s*(\d+)/), um = block.match(/url\(['"]?((?:https:)?\/\/[^)'"]+\.woff2)['"]?\)/);
        if (!wm || !um || have(Number(wm[1]))) continue;
        const name = `${compact}-${wm[1]}.woff2`;
        if (await save(um[1].startsWith("//") ? `https:${um[1]}` : um[1], path.join(fontDir, name))) { faces.push({ w: Number(wm[1]), rel: `assets/fonts/${name}` }); source = source || "fontshare"; }
      }
    } catch {}
  }
  if (!faces.length && mine) return mine.res; // some local files, the web has no more: the nearest weight beats Inter
  if (!faces.length) return { family: null, css: "", source: "unavailable", files: [] };
  faces.sort((a, b) => a.w - b.w);
  return {
    family,
    source,
    files: faces.map((f) => f.rel),
    css: faces.map((f) => `@font-face { font-family: "${family}"; src: url("${f.rel}") format("woff2"); font-weight: ${f.w}; font-style: normal; font-display: block; }`).join("\n  "),
  };
}

// stage several families; returns { css, families: {asked: used}, warnings }
export async function stageFonts(list, projectDir, opts = {}) {
  const warnings = [];
  const used = {};
  const css = [];
  for (const { family, weights } of list) {
    if (!family || used[family] !== undefined) continue;
    const r = await stageFont(family, weights || [400, 500, 700], projectDir, opts);
    if (!r.family) {
      used[family] = "Inter";
      warnings.push(`font "${family}" could not be staged (no local file, not on Google Fonts or Fontshare, or offline); using Inter`);
    } else {
      used[family] = r.family;
      if (r.css) css.push(r.css);
    }
  }
  return { css: css.join("\n  "), families: used, warnings };
}

// ---------------------------------------------------------------- static TTF for 3D type
const PY_CONVERT = `
import sys
from fontTools.ttLib import TTFont
src, dest, wght = sys.argv[1], sys.argv[2], sys.argv[3]
f = TTFont(src)
if "fvar" in f:
    from fontTools.varLib import instancer
    axes = {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in f["fvar"].axes}
    loc = {t: df for t, (lo, df, hi) in axes.items()}
    if "wght" in axes and wght:
        lo, df, hi = axes["wght"]
        loc["wght"] = max(lo, min(hi, float(wght)))
    f = instancer.instantiateVariableFont(f, loc, inplace=False)
f.flavor = None
f.save(dest)
print("otf" if "CFF " in f else "ttf")
`;
let toolsCache = null;
// -> { ok, python } or { ok: false, why }
export function fontTools() {
  if (toolsCache) return toolsCache;
  for (const py of ["python3", "python"]) {
    const r = spawnSync(py, ["-c", "import fontTools, brotli"], { encoding: "utf8" });
    if (r.status === 0) return (toolsCache = { ok: true, python: py });
  }
  return (toolsCache = { ok: false, why: "Python fontTools and brotli are not installed (pip3 install fonttools brotli)" });
}
// woff2 / woff / variable ttf / otf -> a static font at `weight`. -> { ok, file, kind: "ttf"|"otf" } | { ok: false, error }
export function toStaticTtf(src, destBase, { weight = 400 } = {}) {
  const t = fontTools();
  if (!t.ok) return { ok: false, error: t.why };
  const tmp = `${destBase}.tmp.ttf`;
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  const r = spawnSync(t.python, ["-c", PY_CONVERT, src, tmp, String(weight)], { encoding: "utf8", maxBuffer: 1 << 24 });
  if (r.status !== 0 || !fs.existsSync(tmp)) return { ok: false, error: `fontTools could not convert ${path.basename(src)}: ${String(r.stderr || "").trim().split("\n").pop() || "no output"}` };
  const kind = String(r.stdout).trim() === "otf" ? "otf" : "ttf";
  const file = `${destBase}.${kind}`;
  fs.renameSync(tmp, file);
  return { ok: true, file, kind };
}
const SYSTEM_TTF = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"];

// The static font file 3D type should load: assets/fonts/<Family>-<weight>.ttf|otf, made from `src`, else the staged woff2 nearest the weight
// (fetched with stageFont when none is staged). -> { ok, rel, file, kind, source, notes[] } ; ok false carries { error, fallback? } and writes a downgrade row.
export async function staticTtfFor(family, weight, projectDir, { src = null, run, offline = false } = {}) {
  const fontDir = path.join(projectDir, "assets", "fonts"), compact = String(family || "font").replace(/\s+/g, "");
  const notes = [];
  const done = (r) => ({ ok: true, ...r, rel: path.relative(projectDir, r.file), notes });
  for (const ext of ["ttf", "otf"]) { const f = path.join(fontDir, `${compact}-${weight}.${ext}`); if (fs.existsSync(f) && !src) return done({ file: f, kind: ext, source: "already staged" }); }
  let from = src && fs.existsSync(path.resolve(src)) ? path.resolve(src) : null;
  if (!from) {
    const staged = () => fs.existsSync(fontDir) ? fs.readdirSync(fontDir).filter((f) => f.startsWith(compact + "-") && /\.(woff2?|ttf|otf)$/i.test(f) && !/-italic\./i.test(f)).map((f) => ({ f, w: Number((f.match(/-(\d+)\.(woff2?|ttf|otf)$/i) || [])[1]) || 400 })) : [];
    let have = staged();
    if (!have.length && family && !offline) { await stageFont(family, [weight], projectDir, { offline }); have = staged(); }
    if (have.length) { have.sort((a, b) => Math.abs(a.w - weight) - Math.abs(b.w - weight)); from = path.join(fontDir, have[0].f); if (have[0].w !== weight) notes.push(`no ${weight} staged: converted the ${have[0].w} face`); }
  }
  if (!from) {
    const e = `no font file for "${family}" to convert (none staged under assets/fonts, none found on Google Fonts / Fontshare, no --src)`;
    noteDowngrade({ run, what: `3D type in "${family}"`, instead: "no brand-font 3D type", why: e, impact: "extrudeText has no font to load: use k.text on a plane (it uses the document's @font-face) or give --src a TTF" });
    return { ok: false, error: e };
  }
  notes.push("the staged woff2 is a latin subset when it came from Google Fonts: 3D type can only set characters the file holds");
  if (/\.(ttf|otf)$/i.test(from) && !fontTools().ok) return done({ file: from, kind: path.extname(from).slice(1).toLowerCase(), source: path.basename(from) }); // a plain TTF/OTF needs no tools (if it is variable, install fonttools)
  const r = toStaticTtf(from, path.join(fontDir, `${compact}-${weight}`), { weight });
  if (r.ok) return done({ file: r.file, kind: r.kind, source: path.basename(from) });
  const sys = SYSTEM_TTF.find((f) => fs.existsSync(f));
  let fb = null;
  if (sys) { fb = path.join(fontDir, `fallback-3d${path.extname(sys)}`); try { fs.mkdirSync(fontDir, { recursive: true }); fs.copyFileSync(sys, fb); } catch { fb = null; } }
  noteDowngrade({ run, what: `3D type in "${family}"`, instead: fb ? `the system face ${path.basename(sys)}` : "no brand-font 3D type", why: r.error, impact: "the extruded type is not in the brand's font; install fonttools + brotli (pip3 install fonttools brotli) and re-run stage3d.mjs font, or set the word with k.text on a plane" });
  return { ok: false, error: r.error, ...(fb ? { fallback: { file: fb, rel: path.relative(projectDir, fb), source: sys } } : {}) };
}
