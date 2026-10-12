// DESIGN.md adapter: read a project's brand reference in any common shape and
// normalize it into brand tokens, then write a HyperFrames-valid frame.md or a
// build-frame tokens.json from them.
//
// Shapes read: Google design.md spec frontmatter (nested typography, oklch/rgb/hsl
// colors, comments, rounded/spacing/components; impeccable, gstack, the HyperFrames
// design picker), HyperFrames frame.md (inline typography maps), Stitch-style prose
// ("- **Canvas White** (#F9FAFB) — Primary background"), CSS custom-property blocks
// ("--bg: #0a0e15; /* base */"), and markdown tables of tokens (hex with or without #).
import fs from "node:fs";
import path from "node:path";

// ------------------------------------------------------------------ colors
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");
const gammaEnc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const num = (s, pct = 1) => (String(s).trim().endsWith("%") ? parseFloat(s) / 100 * pct : parseFloat(s));

export function parseColor(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/^["']|["']$/g, "").trim();
  let m;
  if ((m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i))) {
    let h = m[1];
    if (!s.startsWith("#") && !/[a-f]/i.test(h) && h.length !== 6) return null; // bare digits: only 6-char tables
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return { hex: "#" + h.slice(0, 6).toLowerCase(), alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  if ((m = s.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/i))) {
    const c = [m[1], m[2], m[3]].map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) / 255));
    return { hex: toHex(...c), alpha: m[4] ? num(m[4]) : 1 };
  }
  if ((m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/i))) {
    const h = parseFloat(m[1]) / 360, sa = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
    const q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return { hex: sa === 0 ? toHex(l, l, l) : toHex(f(h + 1 / 3), f(h), f(h - 1 / 3)), alpha: m[4] ? num(m[4]) : 1 };
  }
  if ((m = s.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/i))) {
    const L = num(m[1]), C = m[2].endsWith("%") ? parseFloat(m[2]) / 100 * 0.4 : parseFloat(m[2]), H = (parseFloat(m[3]) * Math.PI) / 180;
    const a = C * Math.cos(H), b = C * Math.sin(H);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l3 = l_ ** 3, m3 = m_ ** 3, s3 = s_ ** 3;
    const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
    return { hex: toHex(gammaEnc(r), gammaEnc(g), gammaEnc(bl)), alpha: m[4] ? num(m[4]) : 1 };
  }
  if (/^white$/i.test(s)) return { hex: "#ffffff", alpha: 1 };
  if (/^black$/i.test(s)) return { hex: "#000000", alpha: 1 };
  return null;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
export function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const chroma = (hex) => { const c = rgb(hex); return Math.max(...c) - Math.min(...c); };

// ------------------------------------------------------------------ tiny YAML (frontmatter subset)
// maps, nested maps, inline flow maps { a: b }, lists (- x), quoted scalars, # comments
// (kept as the entry's note), folded/literal block scalars (> |).
export function parseYamlish(text) {
  const lines = text.split("\n");
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  const notes = {};
  let block = null;
  const pathOf = () => stack.slice(1).map((s) => s.key).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (block) {
      const ind = raw.match(/^\s*/)[0].length;
      if (raw.trim() === "" || ind > block.indent) { block.buf.push(raw.trim()); continue; }
      block.target[block.key] = block.buf.join(block.fold ? " " : "\n").trim();
      block = null;
    }
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const indent = raw.match(/^\s*/)[0].length;
    let line = raw.trim();
    let comment = "";
    // a comment is " # ..." outside quotes (a bare "#F59E0B" value is not one)
    let inQ = null;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (inQ) { if (ch === inQ) inQ = null; continue; }
      if (ch === '"' || ch === "'") { inQ = ch; continue; }
      if (ch === "#" && j > 0 && /\s/.test(line[j - 1]) && (j + 1 === line.length || /\s/.test(line[j + 1]))) { comment = line.slice(j + 1).trim(); line = line.slice(0, j).trim(); break; }
    }
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (line.startsWith("- ")) {
      const key = stack[stack.length - 1].key;
      const holder = stack[stack.length - 2] ? stack[stack.length - 2].obj : root;
      if (key && !Array.isArray(holder[key])) holder[key] = [];
      if (key) holder[key].push(scalar(line.slice(2)));
      continue;
    }
    const km = line.match(/^("[^"]+"|'[^']+'|[^:]+?):\s*(.*)$/);
    if (!km) continue;
    const key = km[1].replace(/^["']|["']$/g, "").trim();
    const val = km[2];
    if (val === "" ) {
      parent[key] = {};
      stack.push({ indent, obj: parent[key], key });
    } else if (/^[>|][+-]?$/.test(val)) {
      block = { indent, target: parent, key, buf: [], fold: val.startsWith(">") };
    } else if (val.startsWith("{")) {
      let flow = val;
      while (!balanced(flow) && i + 1 < lines.length) flow += " " + lines[++i].trim();
      parent[key] = flowMap(flow);
    } else parent[key] = scalar(val);
    if (comment) notes[[...pathOf(), key].join(".")] = comment;
  }
  if (block) block.target[block.key] = block.buf.join(block.fold ? " " : "\n").trim();
  return { data: root, notes };
}
const balanced = (s) => (s.match(/{/g) || []).length <= (s.match(/}/g) || []).length;
function scalar(v) {
  v = String(v).trim();
  if (/^".*"$|^'.*'$/.test(v)) return v.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === "true" || v === "false") return v === "true";
  return v;
}
function flowMap(s) {
  const body = s.trim().replace(/^{|}$/g, "");
  const out = {};
  let depth = 0, cur = "", parts = [], q = null;
  for (const ch of body) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  for (const p of parts) {
    const k = p.indexOf(":");
    if (k < 0) continue;
    out[p.slice(0, k).trim().replace(/^["']|["']$/g, "")] = scalar(p.slice(k + 1));
  }
  return out;
}

// ------------------------------------------------------------------ roles
const R = {
  canvas: /\b(bg|background|canvas|page|ground|paper|base|backdrop|cream|parchment|bone|off-?white)\b|page ground|primary background|backdrop/i,
  surface: /\b(surface|card|panel|raised|container|elevated|fill|tint|sheet)\b/i,
  ink: /\b(ink|text|fg|foreground|charcoal|noir|headline|body copy|primary text|on-(bg|background|surface|canvas))\b/i,
  muted: /\b(muted|secondary text|subdued|meta|caption|tertiary|dim|faint|disabled|gray|grey|slate|steel)\b/i,
  accent: /\b(accent|brand|primary|highlight|signal|cta|action|key|hero|lime|gold|kinpaku)\b|primary accent|brand anchor/i,
  border: /\b(border|divider|rule|hairline|line|stroke|outline)\b/i,
  status: /\b(success|error|danger|warning|info|positive|negative|critical|alert)\b/i,
};
function scoreRoles(c) {
  const t = `${c.name} ${c.note || ""}`.replace(/[-_]/g, " ");
  const s = {};
  for (const [k, re] of Object.entries(R)) s[k] = re.test(t) ? 1 : 0;
  if (/^on[- ]/i.test(c.name)) { s.ink += 1; s.canvas = 0; s.accent = 0; }
  if (/\bborder\b|\bshadow\b/i.test(t)) { s.accent = 0; s.canvas = 0; }
  if (s.status) s.accent = 0;
  return s;
}

function assignRoles(colors, { mode } = {}) {
  const warnings = [];
  const inMode = (c) => {
    if (!mode) return true;
    const t = `${c.name} ${c.note || ""}`;
    const other = mode === "dark" ? "light" : "dark";
    return !new RegExp(`(^|[-_ ])${other}([-_ ]mode)?$|^${other}[-_ ]|${other}[-_ ]mode`, "i").test(c.name);
  };
  const pool = colors.filter((c) => c.alpha > 0.6 && inMode(c));
  const scored = pool.map((c) => ({ c, s: scoreRoles(c), L: luminance(c.hex), C: chroma(c.hex) }));
  const pick = (role, filter = () => true) => scored.filter((x) => x.s[role] && filter(x)).map((x) => x.c)[0];
  // a color named exactly for its role is that role: the author said so (design systems exported by RasanAI rely on it)
  const exact = (re, not = []) => (scored.find((x) => re.test(x.c.name.trim()) && !not.includes(x.c)) || {}).c;
  let canvas = exact(/^(canvas|background)$/i) || pick("canvas", (x) => x.C < 0.35) || pick("canvas");
  // design-picker convention: "primary" is the background when "on-primary" exists and nothing else claims the ground
  if (!canvas) {
    const prim = scored.find((x) => /^primary$/i.test(x.c.name)), onp = scored.find((x) => /^on-primary$/i.test(x.c.name));
    if (prim && onp && contrast(prim.c.hex, onp.c.hex) > 4) canvas = prim.c;
  }
  if (!canvas && scored.length) {
    const neutrals = scored.filter((x) => x.C < 0.12);
    const src = neutrals.length ? neutrals : scored;
    canvas = src.reduce((a, b) => (b.L > a.L ? b : a)).c;
    warnings.push("no color is named as the background; using the lightest neutral");
  }
  const cv = canvas ? canvas.hex : "#ffffff";
  let ink = exact(/^(ink|text|foreground)$/i, [canvas]) || pick("ink", (x) => contrast(x.c.hex, cv) >= 4.5 && !x.s.muted && !x.s.accent && x.C < 0.2);
  if (!ink) ink = scored.filter((x) => x.c !== canvas && x.C < 0.2).sort((a, b) => contrast(b.c.hex, cv) - contrast(a.c.hex, cv)).map((x) => x.c)[0];
  if (!ink) ink = scored.filter((x) => x.c !== canvas).sort((a, b) => contrast(b.c.hex, cv) - contrast(a.c.hex, cv)).map((x) => x.c)[0];
  if (ink && contrast(ink.hex, cv) < 4.5) warnings.push(`ink ${ink.hex} on ${cv} is only ${contrast(ink.hex, cv).toFixed(1)}:1`);
  const taken = new Set([canvas, ink].filter(Boolean));
  let accent = exact(/^accent$/i, [...taken]) || scored.filter((x) => x.s.accent && !taken.has(x.c) && x.C > 0.15 && !x.s.border).sort((a, b) => b.C - a.C).map((x) => x.c)[0];
  if (!accent) accent = scored.filter((x) => !taken.has(x.c) && !x.s.status && !x.s.border && !x.s.muted).sort((a, b) => b.C - a.C).map((x) => x.c).find((c) => chroma(c.hex) > 0.12);
  if (!accent) {
    // monochrome brand: the accent is its second-strongest ink (HyperFrames never takes the ink itself as the accent)
    accent = scored.filter((x) => !taken.has(x.c) && contrast(x.c.hex, cv) >= 4.5).sort((a, b) => contrast(b.c.hex, cv) - contrast(a.c.hex, cv)).map((x) => x.c)[0] || null;
    warnings.push(accent ? `no chromatic accent (a monochrome brand); ${accent.name} ${accent.hex} carries emphasis` : "no accent color found (a monochrome brand); the ink doubles as the accent");
  }
  if (accent) taken.add(accent);
  const surface = pick("surface", (x) => !taken.has(x.c) && Math.abs(x.L - luminance(cv)) < 0.25 && x.C < 0.25);
  if (surface) taken.add(surface);
  const muted = pick("muted", (x) => !taken.has(x.c) && contrast(x.c.hex, cv) >= 2.5);
  if (muted) taken.add(muted);
  const border = pick("border", (x) => !taken.has(x.c));
  const support = scored.filter((x) => !taken.has(x.c) && x !== border && !x.s.status && x.C > 0.15).map((x) => x.c).slice(0, 3);
  const status = scored.filter((x) => x.s.status).map((x) => x.c);
  return { roles: { canvas, ink, accent: accent || null, surface: surface || null, muted: muted || null, border: border || null, support, status }, warnings };
}

// ------------------------------------------------------------------ fonts
const GENERIC = /^(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-monospace|ui-serif|inherit|-apple-system|blinkmacsystemfont|arial|helvetica neue|segoe ui)$/i;
const firstFamily = (v) => String(v || "").split(",").map((s) => s.trim().replace(/^["'`]|["'`]$/g, "")).find((s) => s && !GENERIC.test(s)) || null;
const FONT_ROLE = {
  display: /^(display(-hero)?|hero|headline(-xl)?|h1|title|heading|headings?|card-headline|section-headline|quote-display)$/i,
  body: /^(body|text|paragraph|copy|subtitle|base|p)$/i,
  mono: /^(mono|mono-tag|code|data|label-mono|monospace|numerals?)$/i,
  label: /^(label|caption|eyebrow|overline|small)$/i,
};
// platform fonts don't exist in a clean headless render: map them to the nearest shipped face
const SYSTEM_MAP = [
  // only the platform faces themselves: Google families (Roboto and its variants, Courier Prime) stay as they are
  [/sf ?mono|sfmono|ui-monospace|menlo|monaco|consolas|^courier( new)?$/i, "JetBrains Mono"],
  [/sf pro|san francisco|-apple-system|blinkmacsystemfont|system[- ]ui|system stack|system font|^system$|segoe ui|helvetica|arial/i, "Inter"],
  [/new york|georgia|times/i, "Source Serif 4"],
  [/^calibri$/i, "Carlito"],
  [/^cambria$/i, "Caladea"],
];
function normFamily(fam, subs) {
  if (!fam) return null;
  for (const [re, to] of SYSTEM_MAP) if (re.test(fam)) { if (fam !== to) subs.push(`${fam} → ${to}`); return to; }
  return fam;
}
const sizeOf = (v) => Number(v.cqw) * 19.2 || parseFloat(v.px) || (/rem$/.test(String(v.fontSize)) ? parseFloat(v.fontSize) * 16 : parseFloat(v.fontSize)) || 0;
function fontsFromTypography(t, subs) {
  const out = {};
  let biggest = null;
  for (const [k, v] of Object.entries(t || {})) {
    if (!v || typeof v !== "object") continue;
    const fam = normFamily(firstFamily(v.fontFamily || v.family), subs);
    if (!fam) continue;
    const weight = Number(v.fontWeight || v.weight) || null;
    const f = { family: fam, weight, key: k };
    for (const [role, re] of Object.entries(FONT_ROLE)) if (re.test(k) && !out[role]) out[role] = f;
    if (!out._any) out._any = f;
    if (!biggest || sizeOf(v) > biggest.size) biggest = { size: sizeOf(v), f };
  }
  // no display-named role: the family of the largest size is the display face
  if (!out.display && biggest && biggest.size > 0) out.display = biggest.f;
  return out;
}
function fontsFromProse(text, subs) {
  const out = {};
  // drop "Banned fonts" / "Avoid" subsections: they name fonts NOT to use
  const sec = (sectionText(text, /typograph|\btype\b|fonts?/i) || "").split(/\n(?=#{3,4} )/).filter((p) => !/^#{3,4} .*(ban|avoid|never|don'?t|forbidden)/i.test(p)).join("\n");
  const setRole = (label, f) => {
    const lab = label.toLowerCase();
    if (/display|headline|heading|title|hero|\bh1\b/.test(lab) && !out.display) out.display = f;
    if (/\bmono|code|data|metadata|numer|path|diff|terminal/.test(lab) && !out.mono) out.mono = f;
    else if (/\bbody|text|paragraph|\bui\b|interface|prose/.test(lab) && !out.body) out.body = f;
    if (!out._any && !/\bmono|code/.test(lab)) out._any = f;
  };
  const lines = sec.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^\s*\|/.test(line)) {
      if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) continue;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      const famCell = cells.slice(1).find((c) => /[A-Z][a-z]/.test(c));
      if (!famCell || /^(apple|android|role|font|family)/i.test(cells[0])) continue;
      const fam = normFamily(firstFamily(famCell.replace(/\(.*?\)|`/g, "")), subs);
      if (fam) setRole(cells[0], { family: fam, weight: null });
      continue;
    }
    if (/^\s*[-*]?\s*(\*\*)?\s*(avoid|never|don'?t|do not|banned)\b/i.test(line)) continue;
    // keep the line but drop fragments that name fonts NOT to use ("`Inter` is BANNED")
    line = line.split(/(?<=[.;])\s+|\s+[—–]\s+/).filter((f) => !/\b(banned|forbidden)\b/i.test(f)).join(" ");
    const lab = (line.match(/\*\*([^*]+)\*\*/) || [])[1] || line;
    if (/\*\*[^*]+\*\*\s*:?\s*same (family|face|typeface)/i.test(line)) {
      const base = out.display || out._any;
      if (base) { setRole(lab, { family: base.family, weight: Number((line.match(/\b([1-9]00)\b/) || [])[1]) || null }); continue; }
    }
    let fam = (line.match(/`([A-Z][A-Za-z0-9 -]{1,40})`/) || [])[1];
    if (!fam) fam = (line.match(/\*\*[^*]+\*\*\s*:?\s*([A-Z][A-Za-z0-9]+(?: [A-Z0-9][A-Za-z0-9]+){0,3})/) || [])[1];
    if (!fam) fam = (line.match(/font-family:\s*["']?([A-Za-z0-9 -]+)/i) || [])[1];
    // "System stack." with the stack on the next line
    if (!fam && /\*\*/.test(line) && /system/i.test(line)) fam = (lines[i + 1] || "").includes("apple-system") ? "-apple-system" : "system stack";
    if (!fam || GENERIC.test(fam.trim()) || /^(Two|The|This|One|Rationale|Do|Never|Same|See|Use|Used|All|Any|None|Keep|Always|Only|Also|Both|Each|Every|No|Not|Weight|Weights|Size|Line)\b/.test(fam.trim())) continue;
    const w = Number((line.match(/weights?\s*:?\s*(\d{3})/i) || line.match(/\b([1-9]00)\b/) || [])[1]) || null;
    setRole(lab, { family: normFamily(fam.trim(), subs), weight: w });
  }
  return out;
}

// ------------------------------------------------------------------ prose helpers
function sectionText(text, headRe) {
  const parts = text.split(/\n(?=#{1,3} )/);
  const hit = parts.filter((p) => { const h = (p.match(/^#{1,3} (.*)/) || [])[1] || ""; return headRe.test(h); });
  return hit.length ? hit.join("\n") : null;
}
function listItems(text) {
  return String(text || "").split("\n").map((l) => l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/)).filter(Boolean).map((m) => m[1].replace(/\*\*/g, "").trim()).filter((l) => l.length > 3);
}
function dosDonts(text) {
  const dos = [], donts = [];
  const parts = text.split(/\n(?=#{1,4} )/);
  for (const p of parts) {
    const h = ((p.match(/^#{1,4} (.*)/) || [])[1] || "").toLowerCase();
    if (/do'?s and don'?ts|do and do not|dos and don'?ts/.test(h)) {
      for (const l of listItems(p)) (/^(don'?t|do not|never|avoid|no )/i.test(l) ? donts : dos).push(l);
    } else if (/don'?t|do not|avoid|anti-?pattern|never|banned/.test(h)) donts.push(...listItems(p));
    else if (/^(\d+\.\s*)?(do|do's|dos)\s*$|^(\d+\.\s*)?(do|do's|dos)\b/.test(h)) dos.push(...listItems(p));
    else if (false) {
      for (const l of listItems(p)) (/^(don'?t|never|avoid|no )/i.test(l) ? donts : dos).push(l);
    }
  }
  return { dos: dos.slice(0, 16), donts: donts.slice(0, 16) };
}

// ------------------------------------------------------------------ main reader
export function readDesignMd(file, { mode } = {}) {
  const text = fs.readFileSync(file, "utf8");
  const fmMatch = text.match(/^﻿?---\n([\s\S]*?)\n---\n?/);
  const fm = fmMatch ? parseYamlish(fmMatch[1]) : { data: {}, notes: {} };
  const body = fmMatch ? text.slice(fmMatch[0].length) : text;
  const D = fm.data;
  const colors = [];
  const seen = new Set();
  const add = (name, value, note, from) => {
    const c = parseColor(value);
    if (!c) return;
    const key = `${String(name).toLowerCase()}|${c.hex}`;
    if (seen.has(key)) return;
    seen.add(key);
    colors.push({ name: String(name).trim(), hex: c.hex, alpha: c.alpha, note: (note || "").trim(), from });
  };
  // 1. frontmatter colors
  if (D.colors && typeof D.colors === "object") for (const [k, v] of Object.entries(D.colors)) add(k, typeof v === "object" ? v.value || v.hex : v, fm.notes[`colors.${k}`], "frontmatter");
  // 2. CSS custom properties anywhere in the body
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\))\s*;?\s*(?:\/\*\s*(.*?)\s*\*\/)?/gi)) add(m[1], m[2], m[3], "css");
  // 3. prose bullets: "- **Canvas White** (#F9FAFB) — role"
  for (const m of body.matchAll(/^\s*[-*]\s+\*\*([^*]+)\*\*\s*\(?\s*`?(#[0-9a-f]{3,8}|rgba?\([^)]*\)|oklch\([^)]*\))`?\s*\)?\s*[—–:-]?\s*(.*)$/gim)) add(m[1], m[2], m[3], "prose");
  // 4. tables: a row with a name cell and a hex cell (with or without #)
  for (const row of body.split("\n").filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s|:-]+\|\s*$/.test(l))) {
    const cells = row.split("|").slice(1, -1).map((c) => c.trim().replace(/`/g, ""));
    const hi = cells.findIndex((c) => /^#?[0-9a-f]{6}$/i.test(c) || /^(#[0-9a-f]{3,8}|oklch\(|rgba?\()/i.test(c));
    if (hi < 0) continue;
    const name = cells.find((c, i) => i !== hi && c && !/^#?[0-9a-f]{3,8}$/i.test(c) && !/^(oklch|rgba?|hsla?)\(/i.test(c)) || `color-${colors.length + 1}`;
    add(name.replace(/^--/, ""), cells[hi], cells.filter((c, i) => i !== hi && c !== name).join(" "), "table");
  }
  // 5. inline "name `#hex`" mentions as a last resort
  if (colors.length < 2) for (const m of body.matchAll(/\*\*?([A-Za-z][\w -]{1,30})\*\*?[^#\n]{0,20}`?(#[0-9a-f]{6})`?/gi)) add(m[1], m[2], "", "inline");

  const { roles, warnings } = assignRoles(colors, { mode });
  // light/dark variants: at least two token bases that exist in both (surface-dark + surface-light, base-dark + base-light)
  const variants = {};
  for (const c of colors) {
    const m = c.name.match(/^(.+?)[-_ ](dark|light)(?:[-_ ]mode)?$/i) || c.name.match(/^(dark|light)[-_ ](.+)$/i);
    if (!m) continue;
    const [base, mode] = /^(dark|light)$/i.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    (variants[base.toLowerCase()] = variants[base.toLowerCase()] || new Set()).add(mode.toLowerCase());
  }
  const modes = Object.values(variants).filter((v) => v.size === 2).length >= 2 ? ["light", "dark"] : null;
  if (modes && !mode) warnings.push("the brand defines light and dark variants; choose which one leads (brand.mjs --mode light|dark), otherwise both are read together");

  const subs = [];
  let fonts = fontsFromTypography(D.typography, subs);
  if (!fonts._any && !fonts.display) fonts = fontsFromProse(body, subs);
  if (subs.length) warnings.push(`platform fonts don't exist in the headless render; substituted ${[...new Set(subs)].join(", ")}`);
  const display = fonts.display || fonts._any || null;
  const bodyFont = fonts.body || fonts.label || display;
  if (!display) warnings.push("no font family found; the look's type will be chosen separately");

  const rounded = D.rounded || {};
  const spacing = D.spacing || {};
  const px = (v) => (v == null ? null : /rem$/.test(String(v)) ? parseFloat(v) * 16 : parseFloat(v));
  const radii = Object.fromEntries(Object.entries({ ...rounded, ...Object.fromEntries(Object.entries(spacing).filter(([k]) => /radius|round/.test(k))) }).map(([k, v]) => [k, px(v)]).filter(([, v]) => v != null && !Number.isNaN(v)));
  if (!Object.keys(radii).length) {
    const rm = body.match(/border-radius:\s*(\d+)px/i) || body.match(/(\d+)\s*px\s+(?:corner\s+)?radi/i);
    if (rm) radii.md = Number(rm[1]);
  }
  const sidecar = path.join(path.dirname(file), ".impeccable", "design.json");
  let shadows = [];
  if (D.shadows && typeof D.shadows === "object") shadows = Object.entries(D.shadows).map(([k, v]) => ({ name: k, value: String(v) }));
  if (fs.existsSync(sidecar)) {
    try {
      const sj = JSON.parse(fs.readFileSync(sidecar, "utf8"));
      shadows = shadows.concat(((sj.extensions && sj.extensions.shadows) || sj.shadows || []).map((s) => ({ name: s.name || s.id, value: s.value || s.css })));
    } catch {}
  }
  const overview =
    (typeof D.description === "string" && D.description) ||
    (sectionText(body, /overview|visual theme|atmosphere|aesthetic direction|the brand|brand & style/i) || "").replace(/^#{1,3} .*\n/, "").split("\n\n").map((s) => s.trim()).find((s) => s && !s.startsWith("|") && !s.startsWith("#")) ||
    "";
  const motion = (sectionText(body, /^motion|motion & interaction|animation/i) || "").replace(/^#{1,3} .*\n/, "").trim().slice(0, 1500);
  const { dos, donts } = dosDonts(body);
  const name = (typeof D.name === "string" && D.name) || ((body.match(/^#\s+(.+)$/m) || [])[1] || path.basename(path.dirname(path.resolve(file)))).replace(/^(design system|design)\s*[-—:]\s*/i, "").trim();
  const format = fmMatch && D.colors ? (Object.values(D.typography || {}).some((v) => v && v.cqw !== undefined) ? "frame" : "spec") : colors.some((c) => c.from === "prose") ? "prose" : colors.length ? "prose-tables" : "prose-only";
  if (colors.length < 2) warnings.push("fewer than two colors found; the brand reference may keep its palette elsewhere (a CSS file, a Figma link)");
  return {
    source: file,
    format,
    name,
    overview: String(overview).replace(/\*\*|__|`/g, "").replace(/^\s*[-*]\s+/gm, "").replace(/\s+/g, " ").trim().slice(0, 600),
    colors,
    roles: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, Array.isArray(v) ? v.map((c) => c.hex) : v ? v.hex : null])),
    role_names: Object.fromEntries(Object.entries(roles).filter(([, v]) => v && !Array.isArray(v)).map(([k, v]) => [k, v.name])),
    fonts: { display, body: bodyFont, mono: fonts.mono || null },
    radii,
    spacing: Object.fromEntries(Object.entries(spacing).filter(([k]) => !/radius|round/.test(k))),
    shadows,
    motion,
    dos,
    donts,
    modes,
    warnings,
  };
}

// ------------------------------------------------------------------ writers
const q = (s) => JSON.stringify(String(s));
export function toFrameMd(B) {
  const r = B.roles;
  const accent = r.accent || r.ink;
  // HyperFrames picks its accent as the most chromatic remaining color: keep support colors below the accent's chroma
  const support = (r.support || []).filter((h) => chroma(h) < chroma(accent) - 0.02);
  const cols = [["canvas", r.canvas], ["ink", r.ink], ["accent", accent], ["surface", r.surface], ["muted", r.muted], ["rule", r.border], ...support.map((h, i) => [`support-${i + 1}`, h])].filter(([, v]) => v);
  const status = B.colors.filter((c) => r.status.includes(c.hex)).map((c) => [`status-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^status-/, "")}`, c.hex]);
  const disp = B.fonts.display || { family: "Inter", weight: 700 };
  const body = B.fonts.body || disp;
  const mono = B.fonts.mono;
  const dw = disp.weight || 700, bw = body.weight || 400;
  const card = B.radii.md ?? B.radii.card ?? B.radii.lg ?? B.radii.sm ?? 8;
  const type = [
    `  display-hero: { fontFamily: ${q(disp.family)}, cqw: 9.5, weight: ${dw}, lineHeight: 0.95, tracking: "-0.02em" }`,
    `  display: { fontFamily: ${q(disp.family)}, cqw: 6.8, weight: ${dw}, lineHeight: 1.0, tracking: "-0.02em" }`,
    `  headline: { fontFamily: ${q(disp.family)}, cqw: 4.4, weight: ${dw}, lineHeight: 1.05, tracking: "-0.01em" }`,
    `  body: { fontFamily: ${q(body.family)}, cqw: 1.6, weight: ${bw}, lineHeight: 1.4 }`,
    `  label: { fontFamily: ${q((mono || body).family)}, cqw: 1.25, weight: 500, tracking: "0.12em", upper: true }`,
    ...(mono ? [`  mono: { fontFamily: ${q(mono.family)}, cqw: 1.4, weight: ${mono.weight || 500} }`] : []),
    `  stat-figure: { fontFamily: ${q(disp.family)}, cqw: 11, weight: ${dw}, lineHeight: 0.92, tracking: "-0.03em" }`,
  ];
  const shadowLine = B.shadows.length ? B.shadows.slice(0, 4).map((s) => `  ${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}: ${q(s.value)}`).join("\n") : '  card: "none"';
  const fm = [
    "---",
    "version: alpha",
    `name: ${q(`${B.name} — Frame (video / frame layer)`)}`,
    `description: ${q(`Converted from the project's brand reference (${path.basename(B.source)}) by RasanAI. ${B.overview}`.slice(0, 400))}`,
    "unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented",
    "principle: atoms are sacred · composition is free · numbers come from the script",
    "colors:",
    ...cols.map(([k, v]) => `  ${k}: "${v}"`),
    ...status.map(([k, v]) => `  ${k}: "${v}"`),
    "typography:",
    ...type,
    "spacing:",
    '  slide-pad: "5cqw"',
    '  rule: "2px"',
    `  radius-card: "${card}px"`,
    `  radius-control: "${Math.max(2, Math.round(card * 0.6))}px"`,
    "shadows:",
    shadowLine,
    "components:",
    `  card: { backgroundColor: "{colors.${r.surface ? "surface" : "canvas"}}", rounded: "{spacing.radius-card}", typography: "{typography.body}" }`,
    `  accent-mark: { backgroundColor: "{colors.accent}", description: "the one accent: rationed to the focal element" }`,
    "---",
  ];
  const dos = B.dos.length ? B.dos.map((d) => `- ${d}`).join("\n") : "- Keep the brand's colors and type exactly as listed in the frontmatter.";
  const donts = B.donts.length ? B.donts.map((d) => `- ${d}`).join("\n") : "- Don't introduce colors or font families that are not in the frontmatter.";
  const bodyMd = `
## Overview

${B.overview || `${B.name}'s brand, adapted to the frame.`}

This frame spec was converted from \`${path.basename(B.source)}\` (${B.format}). The brand reference stays the source of truth: its colors and type are sacred; composition is free.

## The Frame

- Canvases: 1920×1080 (16:9), 1080×1920 (9:16), 1080×1080 (1:1). Safe area: 5cqw on every edge.
- Container law: size everything in \`cqw\` (container width), never \`vw\`.
- One focal element per frame; the accent marks it.

## Colors

${cols.map(([k, v]) => `- **${k}** \`${v}\`${B.role_names[k] ? ` (brand: ${B.role_names[k]})` : ""}`).join("\n")}
${status.length ? status.map(([k, v]) => `- **${k}** \`${v}\` (status only; never decorative)`).join("\n") + "\n" : ""}
Ground: \`canvas\`. Text: \`ink\` (contrast ${contrast(r.ink || "#000000", r.canvas || "#ffffff").toFixed(1)}:1). Accent: rationed, about 10% of any frame.

## Typography

- Display: ${disp.family}${disp.weight ? ` ${disp.weight}` : ""}. Body: ${body.family}${body.weight ? ` ${body.weight}` : ""}.${mono ? ` Mono: ${mono.family}.` : ""}
- Headline size by word count: 1-3 words \`display-hero\`, 4-8 \`display\`, longer \`headline\`.

## Depth & Surface

${B.shadows.length ? B.shadows.map((s) => `- ${s.name}: \`${s.value}\``).join("\n") : "The product UI defines no shadows of its own. The film still gets the finish layer: soft multi-layer shadows under floating objects and a contact shadow at the ground (references/craft.md \"Finish and budgets\"), in the palette's neutral."}

## Shapes

Card radius ${card}px; controls ${Math.max(2, Math.round(card * 0.6))}px.
${B.motion ? `\n## Brand motion notes (from the reference)\n\n${B.motion}\n` : ""}
## Composition Rules

### Do
${dos}

### Don't
${donts}

## Known Gaps

- Motion out of scope here: RasanAI appends the binding motion contract.
- Fonts need local files: the build stages them into \`assets/fonts/\` with \`@font-face\`.
`;
  return fm.join("\n") + "\n" + bodyMd;
}

// capture/extracted/tokens.json for build-frame.mjs (a preset's layout remixed onto the brand)
export function toTokensJson(B) {
  const hexes = [B.roles.canvas, B.roles.ink, B.roles.accent, B.roles.surface, B.roles.muted, ...(B.roles.support || [])].filter(Boolean);
  const fonts = [B.fonts.display, B.fonts.body, B.fonts.mono].filter(Boolean).filter((f, i, a) => a.findIndex((x) => x.family === f.family) === i).map((f) => ({ family: f.family, weights: [...new Set([400, 500, 700, f.weight].filter(Boolean))].sort() }));
  return { title: B.name, description: B.overview, colors: [...new Set(hexes)], fonts, source: "design.md" };
}

// where a project's brand reference usually lives
export function findDesignMd(dir) {
  for (const n of ["DESIGN.md", "design.md", "Design.md", "BRAND.md", "brand.md", "docs/DESIGN.md", "docs/design.md", ".impeccable/DESIGN.md"]) {
    const p = path.join(dir, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
