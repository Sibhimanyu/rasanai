// Real logo files only (references/brand.md "Logos"). Two halves share this file:
//   readLogos(assetsDir)  validates research/brand/assets/ + logos.json (crew.mjs check --role brand-researcher)
//   scanLogos(...)        finds every logo-looking element in the built compositions and says whether it is
//                         the downloaded file or a lookalike (slop.mjs, rule "logo-not-the-file")
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const KINDS = ["mark", "wordmark", "lockup", "app-icon"];
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const URL1 = /^https?:\/\/\S+$/i;

// a light well-formedness check: an <svg> root, every tag closed in order (no XML library in this skill)
function svgProblem(text) {
  const t = text.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?[^>]*>/gi, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (!/^\s*<svg[\s>]/i.test(t)) return "does not start with an <svg> root";
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m, last = 0, rootClosed = false;
  while ((m = re.exec(t))) {
    if (rootClosed) return "content after the closing </svg>";
    last = re.lastIndex;
    const [, close, name, rest] = m;
    if (close) {
      if (stack.pop() !== name) return `</${name}> closes the wrong element`;
      if (!stack.length) rootClosed = true;
    } else if (!/\/\s*$/.test(rest)) stack.push(name);
    else if (!stack.length) rootClosed = true;
  }
  if (stack.length) return `<${stack[stack.length - 1]}> is never closed`;
  if (/[^\s]/.test(t.slice(last))) return "text after the closing </svg>";
  return null;
}

function pngLongSide(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  return Math.max(buf.readUInt32BE(16), buf.readUInt32BE(20));
}

export const normD = (d) => String(d).replace(/[\s,]+/g, " ").replace(/\s*([a-zA-Z])\s*/g, "$1").trim();
export const pathData = (svg) => [...String(svg).matchAll(/\sd\s*=\s*("([^"]*)"|'([^']*)')/g)].map((m) => normD(m[2] ?? m[3])).filter(Boolean);

// -> { state: "files"|"none"|"missing"|"invalid", problems[], entries[{file,kind,source_url,colour_versions,abs,hash,bytes}], none?, why?, searched? }
export function readLogos(assetsDir) {
  const out = { state: "missing", problems: [], warnings: [], entries: [] };
  const mf = path.join(assetsDir, "logos.json");
  if (!fs.existsSync(mf)) {
    out.problems.push("research/brand/assets/logos.json is missing: download the official logo file into research/brand/assets/ and list it there as [{file, kind, source_url}], or write {\"none\": true, \"why\": \"...\", \"searched\": [urls]} when no official file exists. A logo described in prose is not a logo");
    return out;
  }
  let j;
  try { j = JSON.parse(fs.readFileSync(mf, "utf8")); } catch (e) { out.state = "invalid"; out.problems.push(`research/brand/assets/logos.json is not valid JSON: ${e.message}`); return out; }
  if (j && !Array.isArray(j) && typeof j === "object" && j.none === true) {
    out.state = "none"; out.none = true; out.why = String(j.why || ""); out.searched = Array.isArray(j.searched) ? j.searched : [];
    if (out.why.trim().length < 10) out.problems.push("logos.json says none but gives no `why` (what was tried, what was missing)");
    const urls = out.searched.filter((u) => typeof u === "string" && URL1.test(u));
    if (urls.length < 2) out.problems.push(`logos.json says none but \`searched\` lists ${urls.length} URLs (at least 2: the site's own header/favicon and the press or brand page)`);
    return out;
  }
  if (!Array.isArray(j) || !j.length) { out.state = "invalid"; out.problems.push("logos.json must be a non-empty array of {file, kind, source_url} (or {none: true, why, searched})"); return out; }
  out.state = "files";
  const listed = new Set();
  for (const [i, e] of j.entries()) {
    const tag = `logos.json[${i}]`;
    if (!e || typeof e.file !== "string" || !e.file) { out.problems.push(`${tag} has no file`); continue; }
    if (!KINDS.includes(e.kind)) out.problems.push(`${tag} (${e.file}): kind must be one of ${KINDS.join(", ")}`);
    if (typeof e.source_url !== "string" || !URL1.test(e.source_url)) out.problems.push(`${tag} (${e.file}): source_url must be the http(s) URL the file came from`);
    const abs = path.resolve(assetsDir, e.file);
    if (!abs.startsWith(path.resolve(assetsDir) + path.sep)) { out.problems.push(`${tag}: ${e.file} is outside research/brand/assets/`); continue; }
    if (!fs.existsSync(abs)) { out.problems.push(`${tag}: ${e.file} is not on disk`); continue; }
    const buf = fs.readFileSync(abs);
    if (!buf.length) { out.problems.push(`${tag}: ${e.file} is empty`); continue; }
    listed.add(path.resolve(abs));
    if (/\.svg$/i.test(e.file)) {
      const p = svgProblem(buf.toString("utf8"));
      if (p) { out.problems.push(`${e.file} is not a valid SVG: ${p}`); continue; }
    } else if (/\.png$/i.test(e.file)) {
      const side = pngLongSide(buf);
      if (side === null) { out.problems.push(`${e.file} is not a PNG (bad signature)`); continue; }
      if (side < 512) { out.problems.push(`${e.file} is ${side}px on its long side (a PNG logo needs at least 512; get the SVG or a larger file)`); continue; }
    } else { out.problems.push(`${e.file}: a logo file is an .svg (preferred) or a .png of at least 512 px`); continue; }
    out.entries.push({ ...e, abs, hash: sha(buf), bytes: buf.length });
  }
  if (!out.entries.length && !out.problems.length) out.problems.push("logos.json lists no usable logo file");
  for (const f of fs.readdirSync(assetsDir)) if (/\.(svg|png)$/i.test(f) && !listed.has(path.resolve(assetsDir, f))) out.warnings.push(`${f} is in research/brand/assets/ but not listed in logos.json (unlisted files are never placed in a film)`);
  return out;
}

// ---------------------------------------------------------------- scanning built compositions
const NAMED = /(^|[^a-z0-9])(logo|logos|logomark|brand-?mark|brand-?symbol|brand-?icon|brand-?glyph|wordmark-?icon|mark)([^a-z0-9]|$)/i;
const ENDCARD_SYMBOL = /(end|outro|cta|closing|sign-?off)[\w-]*[-_ ](symbol|glyph|icon|emblem|blossom|mark)\b/i;
const SHAPES = /^(circle|ellipse|rect|polygon|polyline|line|path|g)$/i;
const VOID = /^(img|br|hr|input|meta|link|source|image|use|circle|ellipse|rect|path|line|polygon|polyline|stop)$/i;

function attrs(raw) {
  const o = {};
  for (const m of raw.matchAll(/([A-Za-z_:][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) o[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return o;
}
// the markup between an open tag and its matching close (depth-counted on the same tag name)
function inner(html, from, name) {
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[1]) depth--; else if (!/\/>$/.test(m[0])) depth++;
    if (!depth) return { body: html.slice(from, m.index), end: re.lastIndex };
  }
  return { body: html.slice(from), end: html.length };
}

// assetDirs: where a relative src may live (the composition's folder, the project root)
export function scanLogos({ project, sources, logos, cssText }) {
  const findings = [];
  const hashes = new Set((logos.entries || []).map((e) => e.hash));
  const dSets = (logos.entries || []).filter((e) => /\.svg$/i.test(e.file)).map((e) => new Set(pathData(fs.readFileSync(e.abs, "utf8"))));
  const none = logos.state === "none";
  const fileHash = (ref, fromFile) => {
    const r = String(ref).trim().replace(/^url\(\s*["']?|["']?\s*\)$/g, "");
    if (!r) return { missing: true };
    if (/^data:/i.test(r)) {
      const m = r.match(/^data:[^,]*?(;base64)?,(.*)$/is);
      if (!m) return { missing: true };
      try { return { hash: sha(m[1] ? Buffer.from(m[2], "base64") : Buffer.from(decodeURIComponent(m[2]))), data: true }; } catch { return { missing: true }; }
    }
    if (/^[a-z]+:\/\//i.test(r)) return { remote: true };
    const clean = r.split(/[?#]/)[0];
    for (const base of [path.dirname(path.join(project, fromFile)), project, path.join(project, "compositions")]) {
      const p = path.resolve(base, clean.replace(/^\//, ""));
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return { hash: sha(fs.readFileSync(p)), file: p };
    }
    return { missing: true };
  };
  // is this reference one of the downloaded files?
  const refOk = (ref, f) => { const h = fileHash(ref, f); return h.hash && hashes.has(h.hash) ? { ok: true } : { ok: false, h }; };
  const bgUrls = (style) => [...String(style || "").matchAll(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\)/gi)].map((m) => m[0]);
  const cssFor = (a) => {
    const names = [...(a.class ? a.class.split(/\s+/).map((c) => `.${c}`) : []), ...(a.id ? [`#${a.id}`] : [])];
    let out = "";
    for (const n of names) {
      const esc = n.replace(/[.#\-_]/g, (c) => `\\${c}`);
      for (const m of cssText.matchAll(new RegExp(`${esc}\\s*(?:[,{][^{}]*)?\\{([^}]*)\\}`, "g"))) out += m[1] + ";";
    }
    return out;
  };

  for (const [file, html0] of Object.entries(sources)) {
    if (!file.endsWith(".html")) continue;
    const html = html0.replace(/<script[\s\S]*?<\/script>/gi, (s) => " ".repeat(s.length)).replace(/<style[\s\S]*?<\/style>/gi, (s) => " ".repeat(s.length)).replace(/<!--[\s\S]*?-->/g, (s) => " ".repeat(s.length));
    const re = /<([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    let m;
    let skipUntil = 0;
    while ((m = re.exec(html))) {
      if (m.index < skipUntil) continue; // inside a logo element already judged
      const name = m[1].toLowerCase(), raw = m[2], a = attrs(raw);
      const label = [a.id, a.class, a.alt, a["aria-label"], a.title, a["data-role"], a["data-name"], a.name].filter(Boolean).join(" ");
      const named = NAMED.test(label.replace(/\bwatermark\b/gi, "")) || ENDCARD_SYMBOL.test(label);
      if (!named) continue;
      const who = `${file}: <${name}${a.id ? ` id="${a.id}"` : ""}${a.class ? ` class="${a.class}"` : ""}>`;
      const bad = (why) => findings.push({ where: who, why });
      const selfClosing = VOID.test(name) || /\/\s*$/.test(raw);
      const { body, end } = selfClosing ? { body: "", end: re.lastIndex } : inner(html, re.lastIndex, name);
      skipUntil = end;
      const whole = html.slice(m.index, end);

      // 1. an image-like element: src / href must be the downloaded file
      const refs = [];
      if (name === "img") refs.push(a.src);
      else if (name === "image" || name === "use") refs.push(a.href ?? a["xlink:href"]);
      for (const c of body.matchAll(/<(img|image|use)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi)) { const ca = attrs(c[2]); refs.push(c[1].toLowerCase() === "img" ? ca.src : (ca.href ?? ca["xlink:href"])); }
      for (const u of [...bgUrls(a.style), ...bgUrls(cssFor(a))]) refs.push(u);
      const refVerdicts = refs.filter((r) => r !== undefined).map((r) => refOk(r, file));
      const ownRef = refVerdicts.some((v) => v.ok);

      // 2. inline svg whose path data is the asset's
      const svgM = name === "svg" ? [whole] : [...body.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map((x) => x[0]);
      const svgD = svgM.map((s) => pathData(s));
      const svgOk = svgD.some((ds) => ds.length && dSets.some((set) => ds.every((d) => set.has(d))));

      const hasShapes = name !== "img" && (/<(circle|ellipse|rect|polygon|polyline|line)\b/i.test(whole) || (svgM.length && !svgOk) || /border-radius\s*:\s*(50%|9999|999)/i.test(whole + a.style) || /<(div|span|i|b)\b[^>]*(circle|dot|petal|blob)/i.test(body));
      const text = body.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#?\w+;/g, "?").trim();
      const glyph = /[^\p{L}\p{N}\s.,'’&\-–:!?+@/()®™©]/u.test(text) || /[-]/.test(text);
      const iconFont = /\b(fa|fas|far|fab|material-icons|material-symbols)\b/.test(a.class || "");

      if (ownRef || svgOk) {
        if (!svgOk && hasShapes && !ownRef) bad("mixes the logo with extra drawn shapes");
        continue;
      }
      if (none && refVerdicts.length === 0 && !svgM.length && !hasShapes && !glyph && !iconFont) continue; // the name set in type
      if (hasShapes || svgM.length) {
        bad(`a drawn shape or an <svg> whose paths are not the official file stands in for the logo${none ? " (no official file exists: set the name in type, no symbol)" : ` (place the file from research/brand/assets/: ${(logos.entries || []).map((e) => e.file).join(", ") || "none"})`}`);
      } else if (refVerdicts.length) {
        const v = refVerdicts[0].h || {};
        bad(v.remote ? "the logo is loaded from a URL, not a file copied from research/brand/assets/" : v.missing ? "the logo references a file that is not in the project" : `the logo image is not the downloaded file (its bytes differ from research/brand/assets/${none ? "; none was found, so no symbol may be shown" : ""})`);
      } else if (glyph || iconFont) {
        bad("a glyph, emoji or icon-font character stands in for the logo");
      } else if (!selfClosing && text && !none) {
        findings.push({ where: who, why: "the logo is typed text; if the brand has a logo file, place the file (a typed name is only right when logos.json says none)", warn: true });
      } else if (name === "img" || name === "image" || name === "use" || selfClosing) {
        bad("the logo element has no image source");
      } else if (!text) {
        findings.push({ where: who, why: "an empty element labelled as the logo holds no official file (if a script fills it, make sure it places the file from research/brand/assets/)", warn: true });
      }
    }
  }
  return findings;
}
