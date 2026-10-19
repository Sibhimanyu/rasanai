// A brand is a DESIGN.md plus a managed set of assets (logos with roles, font files, media): see references/brand.md "User brand kits".
// Brand folder: DESIGN.md, brand.json, assets/{brand-assets.json, check.json, logos/, fonts/, media/}.
//   importBrand(...)  finds every file DESIGN.md points at (images, links, @font-face, logo:/font-file: keys, bare paths and URLs), pulls it in, lists what is missing
//   addAsset(...)     copies one file in and classifies it
//   checkBrand(...)   reads DESIGN.md + the assets and says what a film would get (colours, fonts, font files, logos) and what is wrong
//   applyBrand(...)   copies the brand into a film project in the format the crew, lib/fonts.mjs and the logo gate read
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readDesignMd } from "./design-md.mjs";
import { HF_AUTO_FONTS } from "./fonts.mjs";
import { svgProblem, pngLongSide } from "./logos.mjs";

export const LOGO_KINDS = ["mark", "wordmark", "lockup", "app-icon"];
export const MEDIA_KINDS = ["screenshot", "image", "icon", "video", "guideline"];
const LOGO_EXT = ["svg", "png", "pdf", "webp", "jpg", "jpeg"];
const FONT_EXT = ["woff2", "woff", "ttf", "otf"];
const MEDIA_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "mp4", "mov", "webm", "pdf", "avif", "heic"];
const ALL_EXT = [...new Set([...LOGO_EXT, ...FONT_EXT, ...MEDIA_EXT])];
const MAX_BYTES = 25 * 1024 * 1024;
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 2) + "\n"); fs.renameSync(t, f); };
const cleanPath = (r) => String(r).split(/[?#]/)[0];
const extOf = (r) => path.extname(cleanPath(r)).slice(1).toLowerCase();
const isUrl = (r) => /^https?:\/\//i.test(r);
const within = (root, p) => { const a = path.resolve(root), b = path.resolve(p); return b === a || b.startsWith(a + path.sep); };

export function sanitizeName(name) {
  let n = path.basename(String(name)).replace(/[^\w.\-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|-+$/g, "");
  return n || "asset";
}
const baseKey = (r) => { let b = cleanPath(r); try { b = decodeURIComponent(b); } catch {} return sanitizeName(b).toLowerCase(); };

// ---------------------------------------------------------------- manifest
export const manifestPath = (brand) => path.join(brand, "assets", "brand-assets.json");
export function readManifest(brand) {
  const j = readJson(manifestPath(brand)) || {};
  return { ...j, version: 1, logos: Array.isArray(j.logos) ? j.logos : [], fonts: Array.isArray(j.fonts) ? j.fonts : [], media: Array.isArray(j.media) ? j.media : [], missing: Array.isArray(j.missing) ? j.missing : [] };
}
function fixPrimary(m) {
  if (!m.logos.length) return;
  const first = m.logos.findIndex((l) => l.primary);
  m.logos.forEach((l, i) => { if (i === (first >= 0 ? first : 0)) l.primary = true; else delete l.primary; });
}
export function writeManifest(brand, m) { fixPrimary(m); writeJson(manifestPath(brand), m); }

const assetsDir = (brand) => path.join(brand, "assets");
const manifestFiles = (brand, m) => [...m.logos, ...m.fonts, ...m.media].map((e) => path.join(assetsDir(brand), e.file));
function knownHashes(brand, m) {
  const h = new Map();
  for (const e of [...m.logos.map((x) => ["logos", x]), ...m.fonts.map((x) => ["fonts", x]), ...m.media.map((x) => ["media", x])]) {
    const f = path.join(assetsDir(brand), e[1].file);
    try { h.set(sha(fs.readFileSync(f)), { group: e[0], entry: e[1] }); } catch {}
  }
  return h;
}

// the file name a copy gets inside <dir>: the original base name, sanitized; a clash with different bytes appends -2, -3
function placeFile(dir, name, buf) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let n = 1, cand = name;
  while (fs.existsSync(path.join(dir, cand))) {
    try { if (sha(fs.readFileSync(path.join(dir, cand))) === sha(buf)) return cand; } catch {}
    n++; cand = `${stem}-${n}${ext}`;
  }
  fs.writeFileSync(path.join(dir, cand), buf);
  return cand;
}

// ---------------------------------------------------------------- guessing
const WEIGHTS = [["extra-?light|ultra-?light", 200], ["hairline|thin", 100], ["light", 300], ["regular|book|normal|roman", 400], ["medium", 500], ["semi-?bold|demi-?bold", 600], ["extra-?bold|ultra-?bold", 800], ["bold", 700], ["black|heavy", 900]];
const STYLE_TAIL = new RegExp(`(${["italic|oblique", ...WEIGHTS.map((w) => w[0]), "[1-9]00"].join("|")})$`, "i");
// "AcmeSans-BoldItalic.otf" -> { family: "Acme Sans", weight: 700, style: "italic" }
export function guessFont(file) {
  let s = path.basename(cleanPath(file)).replace(/\.[^.]+$/, "").replace(/\[[^\]]*\]/g, "").replace(/[-_ ]?(Variable(Font)?|VF)$/i, "");
  let weight = null, style = "normal";
  for (let guard = 0; guard < 4; guard++) {
    const t = s.replace(/[-_ .]+$/, "");
    const m = t.match(STYLE_TAIL);
    if (!m) break;
    const i = t.length - m[1].length, prev = t[i - 1];
    if (i > 0 && !(/[-_ .]/.test(prev) || (/[A-Z]/.test(t[i]) && /[a-z0-9]/.test(prev)))) break; // "Delight" is not "De" + "light"
    if (i === 0) break;
    const w = m[1].toLowerCase();
    if (/^(italic|oblique)$/.test(w)) style = "italic";
    else if (/^[1-9]00$/.test(w)) weight = Number(w);
    else for (const [re, n] of WEIGHTS) if (new RegExp(`^(${re})$`, "i").test(w)) { weight = n; break; }
    s = t.slice(0, i);
  }
  const family = s.replace(/[-_.]+$/, "").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Font";
  return { family, weight: weight || 400, style };
}
const wnum = (v) => { if (v == null) return null; const s = String(v).toLowerCase(); if (s === "normal") return 400; if (s === "bold") return 700; const n = parseInt(s, 10); return n >= 100 && n <= 900 ? Math.round(n / 100) * 100 : null; };

function logoHints(words) {
  const w = String(words).toLowerCase();
  const kind = /wordmark|logotype/.test(w) ? "wordmark" : /lockup|horizontal|stacked|combination/.test(w) ? "lockup" : /app[-_ ]?icon|favicon|(^|[^a-z])icon([^a-z]|$)/.test(w) ? "app-icon" : "mark";
  const cv = [];
  // dark -> on-dark, light -> on-light, white -> reversed, black / mono -> mono (the same guess the Studio makes)
  if (/on[-_ ]?light|light[-_ ]?(bg|background|mode|theme)|for[-_ ]?light|(^|[^a-z])light([^a-z]|$)/.test(w)) cv.push("on-light");
  if (/on[-_ ]?dark|dark[-_ ]?(bg|background|mode|theme)|for[-_ ]?dark|(^|[^a-z])dark([^a-z]|$)/.test(w)) cv.push("on-dark");
  if (/mono|black|single[-_ ]?colou?r|one[-_ ]?colou?r/.test(w)) cv.push("mono");
  if (/revers|white|negative|inverse/.test(w)) cv.push("reversed");
  return { kind, colour_versions: cv };
}
export function mediaKind(file) {
  const ext = extOf(file), name = path.basename(cleanPath(file)).toLowerCase();
  if (ext === "pdf") return "guideline";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (ext === "svg" || ext === "ico" || /icon/.test(name)) return "icon";
  if (/screen|shot|(^|[^a-z])ui([^a-z]|$)/.test(name)) return "screenshot";
  return "image";
}
// where a file belongs: { as: "logo"|"font"|"media", ...hints }
function classify(ref, h = {}) {
  const ext = extOf(ref), name = path.basename(cleanPath(ref)).replace(/\.[^.]+$/, "");
  if (FONT_EXT.includes(ext)) return { as: "font" };
  const key = String(h.key || "").toLowerCase().replace(/[^a-z]/g, "");
  const words = `${name} ${h.alt || ""} ${h.key || ""}`;
  const logoWord = /logo|wordmark|lockup|logotype|logomark|brand[-_ ]?mark|app[-_ ]?icon|(^|[^a-z])mark([^a-z]|$)/i.test(words);
  const shot = /screen|shot|(^|[^a-z])ui([^a-z]|$)|dashboard|mockup/i.test(words);
  const inSection = h.section && /logo|brand assets?/i.test(h.section);
  if (LOGO_EXT.includes(ext) && (logoWord || key === "icon" || /^(mark|brandmark)$/.test(key) || (inSection && !shot))) return { as: "logo", ...logoHints(`${words} ${key === "icon" ? "app-icon" : ""}`) };
  return { as: "media" };
}

// ---------------------------------------------------------------- finding references in DESIGN.md
function findRefs(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  const lineAt = (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
  const heads = [...text.matchAll(/^#{1,6}[ \t]+(.+)$/gm)].map((m) => ({ line: lineAt(m.index), title: m[1].trim() }));
  const sectionAt = (line) => { let t = ""; for (const h of heads) { if (h.line <= line) t = h.title; else break; } return t; };
  const refs = new Map(), ignored = new Set();
  const norm = (r) => String(r).trim().replace(/^[<"'`(]+|[>"'`),.;:*]+$/g, "");
  const add = (raw, idx, props = {}) => {
    const ref = norm(raw);
    if (!ref || /^data:/i.test(ref) || !ALL_EXT.includes(extOf(ref))) return;
    const line = lineAt(idx);
    const cur = refs.get(ref);
    if (cur) { for (const [k, v] of Object.entries(props)) if (v && !cur[k]) cur[k] = v; return; }
    refs.set(ref, { ref, line, section: sectionAt(line), ...props });
  };
  // @font-face blocks: the family / weight / style come from the block; of woff2 / woff / ttf / otf take the best one
  for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const b = m[1];
    const family = (b.match(/font-family\s*:\s*["']?([^;"']+)/i) || [])[1];
    const weight = wnum((b.match(/font-weight\s*:\s*([\w ]+)/i) || [])[1]);
    const style = /font-style\s*:\s*(italic|oblique)/i.test(b) ? "italic" : "normal";
    const urls = [...b.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/g)].map((x) => norm(x[2])).filter((u) => FONT_EXT.includes(extOf(u)));
    urls.sort((a, c) => FONT_EXT.indexOf(extOf(a)) - FONT_EXT.indexOf(extOf(c)));
    urls.forEach((u, i) => { if (i === 0) add(u, m.index, { font: { family: family && family.trim(), weight, style } }); else ignored.add(u); });
  }
  // markdown images and links
  for (const m of text.matchAll(/!?\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g)) add(m[2], m.index, { alt: m[1] });
  // key lines: logo: ..., - **Wordmark:** ..., | font-file | ... |
  const KEY = /^(logos?|logo[- ]?[\w-]+|wordmark[\w-]*|lockup[\w-]*|logotype|icon|app[- ]?icon|mark|brand[- ]?mark|font[- ]?files?|fonts?)$/i;
  let off = 0;
  for (const raw of text.split("\n")) {
    const km = raw.match(/^\s*(?:[-*+]\s+|\|\s*)?[`*"']*([A-Za-z][\w -]*?)[`*"']*\s*(?:\||:)\s*(.+)$/);
    if (km && KEY.test(km[1].trim())) for (const b of km[2].matchAll(BARE())) add(b[0], off + (km.index || 0), { key: km[1].trim() });
    off += raw.length + 1;
  }
  // bare relative paths and URLs
  for (const b of text.matchAll(BARE())) add(b[0], b.index);
  return [...refs.values()].filter((r) => !ignored.has(r.ref));
}
const BARE = () => new RegExp(`[^\\s"'\`()<>\\[\\]{}|,;*]+?\\.(?:${ALL_EXT.join("|")})(?![\\w])(?:\\?[^\\s"'\`()<>\\[\\]{}|,;*]*)?`, "gi");

// ---------------------------------------------------------------- fetching one reference
async function download(url) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 RasanAI" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (Number(r.headers.get("content-length")) > MAX_BYTES) throw new Error("larger than 25 MB");
  const chunks = []; let n = 0;
  for await (const c of r.body) { n += c.length; if (n > MAX_BYTES) throw new Error("larger than 25 MB"); chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks);
}
async function fetchRef(ref, { offline, baseDirs }) {
  if (isUrl(ref)) {
    if (offline) return { why: "offline: not downloaded" };
    try { const buf = await download(ref); let nm = cleanPath(new URL(ref).pathname); try { nm = decodeURIComponent(nm); } catch {} return { buf, name: sanitizeName(nm), src: ref }; } catch (e) { return { why: `download failed: ${e.message}` }; }
  }
  let p = ref;
  if (/^file:\/\//i.test(ref)) { try { p = fileURLToPath(ref); } catch { return { why: "bad file:// URL" }; } }
  p = cleanPath(p); try { p = decodeURIComponent(p); } catch {}
  const cands = path.isAbsolute(p) ? [p, ...baseDirs.map((b) => path.join(b, p))] : baseDirs.map((b) => path.resolve(b, p));
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return { buf: fs.readFileSync(c), name: sanitizeName(c), src: c, abs: c };
  return { why: "file not found" };
}

// ---------------------------------------------------------------- adding entries
const GROUP = { logo: "logos", font: "fonts", media: "media" };
// puts one file's bytes into the brand and the manifest -> { status: "added"|"dup", group, entry }
function addBuffer(brand, m, hashes, { as, name, buf, src, page = "DESIGN.md", meta = {} }) {
  const h = sha(buf);
  if (hashes.has(h)) return { status: "dup", ...hashes.get(h) };
  const group = GROUP[as];
  const file = placeFile(path.join(assetsDir(brand), group), sanitizeName(name), buf);
  let entry;
  if (as === "logo") entry = { file: `logos/${file}`, kind: LOGO_KINDS.includes(meta.kind) ? meta.kind : "mark", colour_versions: meta.colour_versions || [], ...(m.logos.length ? {} : { primary: true }), source: { file: src, page } };
  else if (as === "font") { const g = guessFont(file); entry = { file: `fonts/${file}`, family: meta.family || g.family, weight: wnum(meta.weight) || g.weight, style: meta.style === "italic" ? "italic" : meta.style === "normal" ? "normal" : g.style }; }
  else entry = { file: `media/${file}`, kind: MEDIA_KINDS.includes(meta.kind) ? meta.kind : mediaKind(file), tags: meta.tags || [], note: meta.note || "" };
  m[group].push(entry);
  const rec = { group, entry };
  hashes.set(h, rec);
  return { status: "added", ...rec };
}

export async function importBrand({ brand, design = null, offline = false }) {
  brand = path.resolve(brand);
  if (!fs.existsSync(brand)) throw new Error(`brand folder not found: ${brand}`);
  const own = path.join(brand, "DESIGN.md");
  let designFile = design ? path.resolve(design) : own;
  if (!fs.existsSync(designFile)) throw new Error(`DESIGN.md not found: ${designFile}`);
  const baseDir = path.dirname(designFile); // references resolve against the ORIGINAL file's folder
  if (designFile !== own) { fs.copyFileSync(designFile, own); }
  const text = fs.readFileSync(own, "utf8");
  const m = readManifest(brand);
  const hashes = knownHashes(brand, m);
  const have = new Set([...m.logos, ...m.fonts, ...m.media].map((e) => baseKey(e.file)));
  const added = { logos: 0, fonts: 0, media: 0 };
  const missing = [];
  for (const r of findRefs(text)) {
    const where = `DESIGN.md:${r.line}`;
    const cls = classify(r.ref, r);
    if (r.font && cls.as === "font") cls.meta = r.font;
    if (have.has(baseKey(r.ref))) continue; // already in the kit (a re-import, or the user located it)
    const got = await fetchRef(r.ref, { offline, baseDirs: [baseDir, brand, assetsDir(brand)] });
    if (!got.buf) { missing.push({ ref: r.ref, where, as: cls.as === "media" ? "media" : cls.as, why: got.why }); continue; }
    if (got.abs && within(assetsDir(brand), got.abs)) continue; // points at a file the kit already holds
    if (!got.buf.length) { missing.push({ ref: r.ref, where, as: cls.as, why: "file is empty" }); continue; }
    const res = addBuffer(brand, m, hashes, { as: cls.as, name: got.name, buf: got.buf, src: got.src, meta: { ...cls, ...(cls.meta || {}) } });
    if (res.status === "added") added[GROUP[cls.as]]++;
    have.add(baseKey(r.ref));
  }
  m.missing = missing;
  writeManifest(brand, m);
  return { ok: true, added, missing, manifest: manifestPath(brand) };
}

export function addAsset({ brand, file, as = null, kind = null, colours = null, primary = false }) {
  brand = path.resolve(brand);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`file not found: ${file}`);
  const ext = extOf(file);
  if (!ALL_EXT.includes(ext)) throw new Error(`unsupported file type .${ext} (logos: ${LOGO_EXT.join(", ")}; fonts: ${FONT_EXT.join(", ")}; media: ${MEDIA_EXT.join(", ")})`);
  const cls = classify(file, {});
  const kindAs = as || (cls.as === "media" && FONT_EXT.includes(ext) ? "font" : cls.as);
  if (!GROUP[kindAs]) throw new Error("--as must be logo, font or media");
  if (kindAs === "font" && !FONT_EXT.includes(ext)) throw new Error(`a font file is ${FONT_EXT.join(", ")}`);
  if (kindAs === "logo" && !LOGO_EXT.includes(ext)) throw new Error(`a logo file is ${LOGO_EXT.join(", ")}`);
  if (kindAs !== "font" && FONT_EXT.includes(ext)) throw new Error("a font file cannot be a logo or media");
  fs.mkdirSync(assetsDir(brand), { recursive: true });
  const m = readManifest(brand), hashes = knownHashes(brand, m);
  const meta = { ...(kindAs === "logo" ? logoHints(path.basename(file)) : {}), ...(kind ? { kind } : {}), ...(colours ? { colour_versions: String(colours).split(",").map((s) => s.trim()).filter(Boolean) } : {}) };
  const res = addBuffer(brand, m, hashes, { as: kindAs, name: path.basename(file), buf: fs.readFileSync(file), src: path.resolve(file), page: "added by hand", meta });
  if (kindAs === "logo" && primary && res.status === "added") { m.logos.forEach((l) => delete l.primary); res.entry.primary = true; }
  const bk = baseKey(file);
  m.missing = m.missing.filter((x) => baseKey(x.ref) !== bk);
  writeManifest(brand, m);
  return { ok: true, status: res.status, as: kindAs, entry: res.entry };
}

// ---------------------------------------------------------------- check
const nearestWeight = (list, w) => list.slice().sort((a, b) => Math.abs(a - w) - Math.abs(b - w))[0];
export async function checkBrand({ brand, online = false }) {
  brand = path.resolve(brand);
  const m = readManifest(brand);
  const out = { ok: false, colors: [], fonts: { display: null, body: null, mono: null }, font_files: {}, logos: { count: 0, primary: null, problems: [] }, problems: [], warnings: [] };
  const df = path.join(brand, "DESIGN.md");
  let B = null;
  try { B = readDesignMd(df); } catch (e) { out.problems.push(fs.existsSync(df) ? `DESIGN.md could not be read: ${e.message}` : "this brand has no DESIGN.md"); }
  if (B) {
    const r = B.roles || {};
    for (const [role, hex] of [["canvas", r.canvas], ["ink", r.ink], ["accent", r.accent], ["surface", r.surface], ["muted", r.muted], ["border", r.border], ...(r.support || []).map((h, i) => [`support-${i + 1}`, h])]) if (hex) out.colors.push({ role, hex });
    for (const k of ["canvas", "ink", "accent"]) if (!r[k]) out.problems.push(`no ${k} colour found in DESIGN.md: add one (a hex value named ${k}) so films can use it`);
    for (const k of ["display", "body", "mono"]) out.fonts[k] = (B.fonts && B.fonts[k] && B.fonts[k].family) || null;
    if (!out.fonts.display) out.problems.push("no display font found in DESIGN.md: name the typeface used for headlines");
    for (const w of B.warnings || []) out.warnings.push(w);
  }
  // fonts: which families have a file in the kit
  for (const fam of [...new Set(Object.values(out.fonts).filter(Boolean))]) {
    const mine = m.fonts.filter((f) => String(f.family).toLowerCase() === fam.toLowerCase() && fs.existsSync(path.join(assetsDir(brand), f.file)));
    if (mine.length) { out.font_files[fam] = { weights: [...new Set(mine.map((f) => f.weight))].sort((a, b) => a - b), local: true }; continue; }
    if (HF_AUTO_FONTS.includes(fam.toLowerCase())) { out.font_files[fam] = { local: false, web: "built-in" }; continue; }
    let web = "google-fonts?";
    if (online) {
      const ok = async (u) => { try { return (await fetch(u, { signal: AbortSignal.timeout(4000) })).ok; } catch { return null; } };
      const g = await ok(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}`);
      if (g) web = "google-fonts";
      else if (await ok(`https://api.fontshare.com/v2/css?f[]=${fam.toLowerCase().replace(/\s+/g, "-")}@400&display=swap`)) web = "fontshare";
      else if (g === false) web = null;
    }
    out.font_files[fam] = web ? { local: false, web } : { local: false };
    if (web === null) out.warnings.push(`${fam} has no font file: films would use Inter if it's not on Google Fonts or Fontshare. Add the font files.`);
    else if (web === "google-fonts?") out.warnings.push(`${fam} has no font file: films would use Inter if it's not on Google Fonts or Fontshare. Add the font files.`);
  }
  // logos
  const L = m.logos.filter((l) => l && l.file);
  out.logos.count = L.length;
  const prim = L.find((l) => l.primary) || L[0];
  out.logos.primary = prim ? prim.file : null;
  for (const l of L) {
    const f = path.join(assetsDir(brand), l.file);
    if (!fs.existsSync(f)) { out.logos.problems.push(`${l.file} is listed but not on disk`); continue; }
    const buf = fs.readFileSync(f), ext = extOf(l.file);
    if (!buf.length) out.logos.problems.push(`${l.file} is empty`);
    else if (ext === "svg") { const p = svgProblem(buf.toString("utf8")); if (p) out.logos.problems.push(`${l.file} is not a valid SVG: ${p}`); }
    else if (ext === "png") { const side = pngLongSide(buf); if (side === null) out.logos.problems.push(`${l.file} is not a valid PNG`); else if (side < 512) out.logos.problems.push(`${l.file} is only ${side}px on its long side: a PNG logo needs at least 512 (use the SVG or a larger file)`); }
    else if (ext === "pdf") out.logos.problems.push(`${l.file} is a PDF: a film cannot place a PDF, add an SVG or PNG of it`);
  }
  out.warnings.push(...out.logos.problems);
  if (!L.length) out.warnings.push("this brand has no logo file: the film will set the name in type, with no symbol");
  for (const x of m.missing) out.warnings.push(`${x.ref} (${x.where}) is named in DESIGN.md but the file was not found: locate it`);
  out.ok = !out.problems.length;
  writeJson(path.join(assetsDir(brand), "check.json"), out);
  return out;
}

// ---------------------------------------------------------------- apply to a film project
export function applyBrand({ brand, project }) {
  brand = path.resolve(brand); project = path.resolve(project);
  const files = [], removed = [];
  const m = readManifest(brand);
  fs.mkdirSync(project, { recursive: true });
  // 1. DESIGN.md (a different one already there is kept as DESIGN.previous[-n].md)
  const bd = path.join(brand, "DESIGN.md"), pd = path.join(project, "DESIGN.md");
  if (!fs.existsSync(bd)) throw new Error(`the brand has no DESIGN.md: ${bd}`);
  if (fs.existsSync(pd) && !fs.readFileSync(pd).equals(fs.readFileSync(bd))) {
    let n = 1, bak = path.join(project, "DESIGN.previous.md");
    while (fs.existsSync(bak)) { n++; bak = path.join(project, `DESIGN.previous-${n}.md`); }
    fs.renameSync(pd, bak);
  }
  fs.copyFileSync(bd, pd);
  // 2. stale cleanup: exactly what the previous apply wrote under assets/brand and assets/fonts
  const pm = path.join(project, "assets", "brand", "brand-assets.json");
  const prev = readJson(pm);
  if (prev && Array.isArray(prev.applied_files)) {
    for (const rel of prev.applied_files) {
      const f = path.resolve(project, String(rel));
      if (!(within(path.join(project, "assets", "brand"), f) || within(path.join(project, "assets", "fonts"), f))) continue;
      if (fs.existsSync(f) && fs.statSync(f).isFile()) { fs.unlinkSync(f); removed.push(path.relative(project, f)); }
    }
  }
  const brandDir = path.join(project, "assets", "brand"), fontDir = path.join(project, "assets", "fonts"), mediaDir = path.join(brandDir, "media");
  const abs = (e) => path.join(assetsDir(brand), e.file);
  const put = (src, dest) => { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); files.push(path.relative(project, dest)); return path.relative(project, dest); };
  const used = new Set();
  const uniq = (dir, base) => { let n = 1, cand = base; const ext = path.extname(base), stem = base.slice(0, base.length - ext.length); while (used.has(path.join(dir, cand))) { n++; cand = `${stem}-${n}${ext}`; } used.add(path.join(dir, cand)); return cand; };
  // 3. logos (primary first)
  fs.mkdirSync(brandDir, { recursive: true });
  const logos = m.logos.filter((l) => fs.existsSync(abs(l))).sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  const logoRows = [], outLogos = [];
  for (const [i, l] of logos.entries()) {
    const base = uniq(brandDir, path.basename(l.file));
    const rel = put(abs(l), path.join(brandDir, base));
    logoRows.push({ file: base, kind: l.kind, colour_versions: l.colour_versions || [], primary: i === 0, source: { file: path.join(brand, "assets", l.file), page: "user brand kit" } });
    outLogos.push({ ...l, file: rel, primary: i === 0 || undefined });
  }
  writeJson(path.join(brandDir, "logos.json"), logoRows.length ? logoRows : { none: true, why: "the user's brand has no logo file", searched: [] });
  files.push("assets/brand/logos.json");
  // 4. fonts
  const outFonts = [], fontRows = [];
  for (const f of m.fonts.filter((x) => fs.existsSync(abs(x)))) {
    const ext = path.extname(f.file).toLowerCase();
    const base = uniq(fontDir, `${String(f.family).replace(/\s+/g, "")}-${f.weight || 400}${f.style === "italic" ? "-italic" : ""}${ext}`);
    const rel = put(abs(f), path.join(fontDir, base));
    fontRows.push({ family: f.family, weight: f.weight || 400, style: f.style === "italic" ? "italic" : "normal", file: base });
    outFonts.push({ ...f, file: rel });
  }
  if (fontRows.length) { writeJson(path.join(fontDir, "fonts.json"), fontRows); files.push("assets/fonts/fonts.json"); }
  else { const fj = path.join(fontDir, "fonts.json"); if (fs.existsSync(fj) && prev && (prev.applied_files || []).includes("assets/fonts/fonts.json")) { fs.unlinkSync(fj); removed.push("assets/fonts/fonts.json"); } }
  // 5. media
  const outMedia = [];
  for (const x of m.media.filter((e) => fs.existsSync(abs(e)))) {
    const base = uniq(mediaDir, path.basename(x.file));
    outMedia.push({ ...x, file: put(abs(x), path.join(mediaDir, base)) });
  }
  // 6. the project-side manifest
  let name = path.basename(brand);
  const bj = readJson(path.join(brand, "brand.json")); if (bj && bj.name) name = bj.name;
  files.push("assets/brand/brand-assets.json");
  writeJson(pm, { version: 1, origin: "user", brand: name, logos: outLogos, fonts: outFonts, media: outMedia, missing: m.missing, applied_files: [...files] });
  return { ok: true, files, removed };
}
