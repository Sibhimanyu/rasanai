// Shared by board.mjs (story boards) and style-frames.mjs: one composition drawn from a concept's shot, at any size.
// A shot is {t, see, style, carrier_state, move, transition, words}, plus optional image (a plate, e.g. from Codex), accent_word,
// signature (true on the signature-moment shot) or html (a hand-built composition fragment that replaces the generated one).
// The concept carries style_world (an atlas id) + optional style {palette: {bg, bg2?, ink, accent, muted?}, font?}, carrier {what, kind}, signature_moment {what, shot}. See references/concept-schema.md.
// Pure functions, no Chrome here.
import fs from "node:fs";
import path from "node:path";
import { esc, SKILL_DIR } from "./common.mjs";
import { resolveStyle } from "./concept-schema.mjs";

const clean = (s) => (s == null ? "" : String(s));
export const hex = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(clean(c)) || /^(rgb|hsl)a?\(/i.test(clean(c)) ? clean(c) : d);

export function styleOf(concept) {
  const rs = resolveStyle(concept || {}); // canonical: style_world id string + optional style {palette, font}; an atlas look fills what is missing
  const sw = { font: rs.font }, p = rs.palette || {};
  return {
    name: clean(rs.id || "unstyled"),
    bg: hex(p.bg, "#F4F1EA"), bg2: hex(p.bg2, ""), ink: hex(p.ink, "#16181D"), accent: hex(p.accent, "#E8833A"), muted: hex(p.muted, "#8A8C93"),
    font: clean(sw.font || "-apple-system, 'Helvetica Neue', Arial, sans-serif"),
  };
}

export function moveName(id) {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, "library", "moves", "index.json"), "utf8"));
    const m = idx.moves.find((x) => x.id === id);
    return m ? m.name : null;
  } catch { return null; }
}

// One composition as a self-sizing box (container units: 1cqw = 1 % of the box width), so a 1280 x 720 frame and a 370 px tile use the same markup.
export function composition(shot, st, opts = {}) {
  if (shot.html) return `<div class="comp" style="background:${st.bg};color:${st.ink};font-family:${st.font}">${shot.html}</div>`;
  const words = clean(shot.words).trim();
  const ws = words ? words.split(/\s+/) : [];
  const accentIdx = shot.accent_word != null ? ws.findIndex((w) => w.toLowerCase().replace(/\W/g, "") === clean(shot.accent_word).toLowerCase()) : ws.length > 1 ? ws.length - 1 : -1;
  const size = ws.length <= 1 ? 13 : ws.length === 2 ? 10.5 : 8; // cqw: hero type 1-4 words
  const img = clean(shot.image) && fs.existsSync(path.resolve(clean(shot.image))) ? `file://${path.resolve(clean(shot.image))}` : "";
  const bg = img ? `url("${img}") center/cover` : st.bg2 ? `linear-gradient(135deg, ${st.bg}, ${st.bg2})` : st.bg;
  const dark = img || luminance(st.bg) < 0.4;
  const ink = img ? "#fff" : st.ink;
  const type = ws.map((w, i) => `<span style="${i === accentIdx ? `color:${st.accent}` : ""}">${esc(w)}</span>`).join(" ");
  const carrierDot = opts.carrier ? `<div class="car" style="background:${st.accent}"></div>` : "";
  return `<div class="comp" style="background:${bg};color:${ink};font-family:${st.font}">
  ${img ? `<div class="veil"></div>` : ""}
  <div class="grid ${dark ? "g-d" : "g-l"}"></div>
  ${carrierDot}
  <div class="hero" style="font-size:${size}cqw">${type}</div>
  ${opts.caption ? `<div class="cap" style="color:${img ? "#fff" : st.muted}">${esc(clean(shot.see).slice(0, 110))}</div>` : ""}
</div>`;
}
function luminance(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(clean(c)) || (/^#([0-9a-f]{3})$/i.exec(clean(c)) && [0, clean(c).slice(1).replace(/./g, (x) => x + x)]);
  if (!m) return 0.9;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

export const COMP_CSS = `.box{container-type:size;position:relative;overflow:hidden}
.comp{position:absolute;inset:0;overflow:hidden}
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.55))}
.grid{position:absolute;inset:0;background-size:4cqw 4cqw;opacity:.07}
.g-l{background-image:linear-gradient(#000 1px,transparent 1px),linear-gradient(90deg,#000 1px,transparent 1px)}
.g-d{background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)}
.hero{position:absolute;left:6cqw;right:6cqw;top:50%;transform:translateY(-54%);font-weight:800;letter-spacing:-.035em;line-height:.98;text-wrap:balance}
.cap{position:absolute;left:6cqw;right:6cqw;bottom:5cqw;font-size:1.9cqw;line-height:1.3;font-weight:500}
.car{position:absolute;left:6cqw;top:7cqw;width:2.4cqw;height:2.4cqw;border-radius:50%}`;
