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

// the look a concept resolves to: its own style {palette, font} first, else the atlas art block of style_world (palette, font pairing, finish kinds, case, scale)
export function styleOf(concept) {
  const rs = resolveStyle(concept || {});
  const p = rs.palette || {}, pr = rs.pairing;
  const sc = pr ? pr.scale : null;
  return {
    name: clean(rs.id || "unstyled"),
    bg: hex(p.bg, "#F4F1EA"), bg2: hex(p.bg2, ""), ink: hex(p.ink, "#16181D"), accent: hex(p.accent, "#E8833A"), accent2: hex(p.accent2, ""), muted: hex(p.muted, "#8A8C93"),
    font: clean(rs.font || "-apple-system, 'Helvetica Neue', Arial, sans-serif"),
    textFont: clean(rs.text_font || rs.font || "-apple-system, 'Helvetica Neue', Arial, sans-serif"),
    links: pr ? [pr.display.google, pr.text.google].filter((x, i, a) => x && a.indexOf(x) === i) : [],
    case: pr ? pr.case : "", weight: pr ? pr.weight : 800, tracking: pr ? pr.tracking.hero : "-.035em", lh: pr ? pr.line_height.hero : 0.98,
    hero: sc ? sc.hero_cqw : 13, hero2: sc ? sc.two_words : 10.5, heroN: sc ? sc.long : 8, cap: sc ? sc.caption_cqw : 1.9,
    fx: rs.art ? rs.art.finish.css || [] : [],
  };
}
// <link> tags for the style's Google fonts (OFL); boards and style frames put these in <head>
export const fontLinks = (st) => (st.links || []).map((u) => `<link rel="stylesheet" href="${u}">`).join("");

export function moveName(id) {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, "library", "moves", "index.json"), "utf8"));
    const m = idx.moves.find((x) => x.id === id);
    return m ? m.name : null;
  } catch { return null; }
}

// CSS approximations of the atlas finish kinds (art.finish.css): cheap overlays drawn inside the .comp box. Unknown kinds are ignored.
const NOISE = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 1.4 -.2'/></filter><rect width='160' height='160' filter='url(#n)'/></svg>")}")`;
const kindOf = (k) => { const [n, v] = String(k).split(":"); return [n, v == null ? null : Number(v)]; };
export function finish(st) {
  const L = [], text = [], rule = {};
  const ink = st.ink, acc = st.accent, bg = st.bg, a2 = st.accent2 || st.accent;
  for (const k of st.fx || []) {
    const [n, v] = kindOf(k);
    const layer = (css) => L.push(`<div class="fx" style="${css}"></div>`);
    if (n === "grain") layer(`background:${NOISE.replace(/"/g, "'")};background-size:12cqw;opacity:${v == null ? 0.1 : v * 1.6};mix-blend-mode:overlay`);
    else if (n === "scan") layer(`background:repeating-linear-gradient(0deg,rgba(0,0,0,${(v || 0.3).toFixed(2)}) 0 .12cqw,transparent .12cqw .42cqw)`);
    else if (n === "vignette" || n === "soft-vignette") layer(`background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,${v || 0.25}) 100%)`);
    else if (n === "halftone" || n === "halftone-soft") layer(`background:radial-gradient(circle,${ink} 28%,transparent 31%) 0 0/.75cqw .75cqw;opacity:${n === "halftone" ? 0.14 : 0.08};mix-blend-mode:multiply;-webkit-mask-image:linear-gradient(110deg,#000,transparent 70%)`);
    else if (n === "pixel" || n === "pixel-layer") layer(`background:linear-gradient(rgba(0,0,0,.18) 1px,transparent 1px) 0 0/1.25cqw 1.25cqw,linear-gradient(90deg,rgba(0,0,0,.18) 1px,transparent 1px) 0 0/1.25cqw 1.25cqw`);
    else if (n === "led-dots") layer(`background:radial-gradient(circle,transparent 34%,#000 40%) 0 0/1.1cqw 1.1cqw;opacity:.9`);
    else if (n === "glow") text.push(`0 0 1.4cqw ${acc}`, `0 0 .3cqw ${acc}`);
    else if (n === "rgb-split") text.push(`.35cqw 0 rgba(255,40,80,.85)`, `-.35cqw 0 rgba(0,240,255,.85)`);
    else if (n === "gloss") layer(`background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,0) 38%),radial-gradient(circle at 78% 22%,rgba(255,255,255,.7),transparent 12%)`);
    else if (n === "outline-text") { rule.stroke = `-webkit-text-stroke:.16cqw ${ink};paint-order:stroke fill;`; text.push(`.55cqw .55cqw 0 ${ink}`); }
    else if (n === "chrome-text") rule.chrome = true;
    else if (n === "blueprint-grid") layer(`background:linear-gradient(rgba(255,255,255,.28) 1px,transparent 1px) 0 0/2cqw 2cqw,linear-gradient(90deg,rgba(255,255,255,.28) 1px,transparent 1px) 0 0/2cqw 2cqw,linear-gradient(rgba(255,255,255,.4) 1px,transparent 1px) 0 0/10cqw 10cqw,linear-gradient(90deg,rgba(255,255,255,.4) 1px,transparent 1px) 0 0/10cqw 10cqw;outline:.25cqw solid ${ink};outline-offset:-2cqw`);
    else if (n === "iso-grid") layer(`background:repeating-linear-gradient(30deg,${ink}22 0 1px,transparent 1px 3cqw),repeating-linear-gradient(150deg,${ink}22 0 1px,transparent 1px 3cqw)`);
    else if (n === "grid-lines") layer(`background:repeating-linear-gradient(90deg,${ink}26 0 1px,transparent 1px calc(100%/12));box-shadow:inset 0 1.2cqw 0 -.8cqw ${acc}`);
    else if (n === "chart-grid") layer(`background:repeating-linear-gradient(0deg,${ink}20 0 1px,transparent 1px 6cqw)`);
    else if (n === "hud-ticks") layer(`background:repeating-radial-gradient(circle at 50% 50%,transparent 0 9cqw,${acc}55 9cqw 9.15cqw),linear-gradient(${acc}66,${acc}66) 4cqw 4cqw/6cqw .2cqw no-repeat,linear-gradient(${acc}66,${acc}66) 4cqw 4cqw/.2cqw 6cqw no-repeat,linear-gradient(${acc}66,${acc}66) calc(100% - 4cqw) calc(100% - 4cqw)/6cqw .2cqw no-repeat,linear-gradient(${acc}66,${acc}66) calc(100% - 4cqw) calc(100% - 4cqw)/.2cqw 6cqw no-repeat`);
    else if (n === "hard-shadow") { rule.stroke = `-webkit-text-stroke:.14cqw ${ink};`; text.push(`.7cqw .7cqw 0 ${acc}`); }
    else if (n === "paper-shadow") text.push(`.4cqw .5cqw 0 rgba(0,0,0,.28)`);
    else if (n === "sticker-shadow") text.push(`.8cqw .8cqw 0 ${ink}`);
    else if (n === "bevel") text.push(`.15cqw .15cqw 0 #fff`, `-.15cqw -.15cqw 0 rgba(0,0,0,.55)`);
    else if (n === "letterbox") layer(`background:linear-gradient(#000,#000) 0 0/100% 12.5% no-repeat,linear-gradient(#000,#000) 0 100%/100% 12.5% no-repeat`);
    else if (n === "glow-top") layer(`background:radial-gradient(ellipse 60% 55% at 50% 0%,${acc}55,transparent 70%)`);
    else if (n === "particles") layer(`background:radial-gradient(circle,${acc} 0 .18cqw,transparent .3cqw) 0 0/3.1cqw 3.7cqw,radial-gradient(circle,${a2} 0 .12cqw,transparent .25cqw) 1.1cqw .6cqw/4.3cqw 3.1cqw,radial-gradient(circle,${ink}88 0 .1cqw,transparent .2cqw) .4cqw 1.7cqw/2.3cqw 2.7cqw;opacity:.7;-webkit-mask-image:radial-gradient(ellipse at 70% 50%,#000,transparent 75%)`);
    else if (n === "multiply-misreg") layer(`background:radial-gradient(circle at 74% 38%,${acc} 0 17cqw,transparent 17.2cqw),radial-gradient(circle at 80% 44%,${ink} 0 17cqw,transparent 17.2cqw);opacity:.55;mix-blend-mode:multiply`);
    else if (n === "columns") layer(`background:repeating-linear-gradient(90deg,transparent 0 15.6%,${ink}1f 15.6% calc(15.6% + 1px));box-shadow:inset 0 .7cqw 0 -.3cqw ${ink}`);
    else if (n === "tilt-shift") layer(`background:linear-gradient(180deg,rgba(0,0,0,.18),transparent 22%,transparent 70%,rgba(0,0,0,.22))`);
    else if (n === "m-clay") layer(`background:radial-gradient(circle at 80% 62%,${acc} 0 11cqw,transparent 11.3cqw),radial-gradient(circle at 66% 76%,${a2} 0 6cqw,transparent 6.3cqw),radial-gradient(ellipse at 74% 96%,rgba(0,0,0,.25) 0 22cqw,transparent 23cqw);filter:drop-shadow(0 .8cqw .6cqw rgba(0,0,0,.25))`);
    else if (n === "m-paper") layer(`background:radial-gradient(ellipse 60cqw 18cqw at 30% 112%,${a2} 0 99%,transparent 100%),radial-gradient(ellipse 55cqw 16cqw at 78% 108%,${acc} 0 99%,transparent 100%),radial-gradient(ellipse 70cqw 14cqw at 50% 118%,${ink} 0 99%,transparent 100%);filter:drop-shadow(0 -.5cqw 0 rgba(0,0,0,.25))`);
    else if (n === "m-tape") layer(`background:linear-gradient(${a2}cc,${a2}cc) 3cqw 3cqw/12cqw 3.2cqw no-repeat,linear-gradient(${acc},${acc}) 78cqw 40cqw/17cqw 7cqw no-repeat;transform:rotate(-2.5deg);outline:.3cqw dashed ${ink}55;outline-offset:-2cqw`);
    else if (n === "m-bauhaus") layer(`background:radial-gradient(circle at 80% 30%,${acc} 0 13cqw,transparent 13.2cqw),linear-gradient(${a2},${a2}) 66cqw 44cqw/14cqw 14cqw no-repeat,linear-gradient(${ink},${ink}) 52cqw 56cqw/44cqw 1.2cqw no-repeat;transform:rotate(-8deg)`);
    else if (n === "m-sticker") layer(`background:radial-gradient(circle at 82% 28%,${acc} 0 9cqw,#fff 9.1cqw 10.6cqw,${ink} 10.7cqw 11.2cqw,transparent 11.3cqw),radial-gradient(circle at 70% 70%,${a2} 0 7cqw,#fff 7.1cqw 8.4cqw,${ink} 8.5cqw 9cqw,transparent 9.1cqw),radial-gradient(circle at 90% 78%,${st.bg2 || acc} 0 4cqw,#fff 4.1cqw 5cqw,${ink} 5.1cqw 5.5cqw,transparent 5.6cqw)`);
    else if (n === "m-lux") layer(`background:linear-gradient(${ink}66,${ink}66) 10cqw 80cqw/0 0 no-repeat,linear-gradient(${acc},${acc}) 6cqw 36cqw/.15cqw 28cqw no-repeat,radial-gradient(circle at 88% 82%,${acc} 0 .5cqw,transparent .6cqw)`);
    else if (n === "m-line") layer(`background:url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'><path d='M0 70 C30 70 40 20 70 30 S110 80 120 50 S140 20 160 25' fill='none' stroke='${ink}' stroke-width='.7' stroke-linecap='round'/><circle cx='120' cy='50' r='2.2' fill='${acc}'/></svg>`).replace(/'/g, "%27")}') center/100% 100% no-repeat`);
    else if (n === "m-ruled") layer(`background:repeating-linear-gradient(0deg,transparent 0 3.6cqw,${a2}44 3.6cqw 3.75cqw),linear-gradient(${acc}88,${acc}88) 5cqw 0/.2cqw 100% no-repeat`);
    else if (n === "m-roto") layer(`background:radial-gradient(circle at 78% 52%,${acc} 0 12cqw,transparent 12.2cqw),radial-gradient(circle at 80% 49%,transparent 0 12cqw,${ink} 12.1cqw 12.6cqw,transparent 12.7cqw),linear-gradient(${a2},${a2}) 62cqw 60cqw/26cqw 9cqw no-repeat`);
    else if (n === "m-burst") layer(`background:repeating-conic-gradient(from 0deg at 72% 50%,${a2}55 0 4deg,transparent 4deg 12deg);opacity:.9`);
    else if (n === "m-spheres") layer(`background:radial-gradient(circle at 74% 40%,#fff 0,${acc} 30%,${acc} 100%) 0 0/0 0,radial-gradient(circle at 76% 40%,${st.bg} 0 1%,${acc} 2% 8%,transparent 9%),radial-gradient(circle at 84% 64%,${a2} 0 8cqw,transparent 8.3cqw),radial-gradient(circle at 70% 70%,${acc} 0 11cqw,transparent 11.3cqw);filter:drop-shadow(0 1.2cqw 1cqw rgba(0,0,0,.2))`);
    else if (n === "m-card") layer(`background:linear-gradient(135deg,${ink}1a,transparent) 56cqw 24cqw/34cqw 21cqw no-repeat;border-radius:1.5cqw;box-shadow:0 0 0 .1cqw ${ink}33`);
    else if (n === "m-cubes") layer(`background:linear-gradient(60deg,${acc} 0 33%,transparent 33%) 0 0/6cqw 6cqw,linear-gradient(120deg,${a2}88 0 33%,transparent 33%) 3cqw 3cqw/6cqw 6cqw;opacity:.35;-webkit-mask-image:radial-gradient(ellipse at 80% 70%,#000,transparent 65%)`);
    else if (n === "m-bars") layer(`background:linear-gradient(${acc},${acc}) 62cqw 42cqw/5cqw 20cqw no-repeat,linear-gradient(${ink}44,${ink}44) 68cqw 50cqw/5cqw 12cqw no-repeat,linear-gradient(${ink}44,${ink}44) 74cqw 46cqw/5cqw 16cqw no-repeat,linear-gradient(${ink}44,${ink}44) 80cqw 53cqw/5cqw 9cqw no-repeat`);
    else if (n === "m-card-board") layer(`background:repeating-linear-gradient(90deg,transparent 0 1.1cqw,${ink}18 1.1cqw 1.25cqw);-webkit-mask-image:linear-gradient(180deg,transparent 55%,#000 56%)`);
    else if (n === "contrast") rule.filter = `filter:contrast(${v || 1.2});`;
  }
  return { layers: L.join(""), textShadow: text.length ? `text-shadow:${text.join(",")};` : "", rule };
}
const caseCss = (c) => (c === "upper" ? "text-transform:uppercase;" : c === "lower" ? "text-transform:lowercase;" : c === "title" ? "text-transform:capitalize;" : "");

// One composition as a self-sizing box (container units: 1cqw = 1 % of the box width), so a 1280 x 720 frame and a 370 px tile use the same markup.
export function composition(shot, st, opts = {}) {
  if (shot.html) return `<div class="comp" style="background:${st.bg};color:${st.ink};font-family:${st.font}">${shot.html}</div>`;
  const words = clean(shot.words).trim();
  const ws = words ? words.split(/\s+/) : [];
  const accentIdx = shot.accent_word != null ? ws.findIndex((w) => w.toLowerCase().replace(/\W/g, "") === clean(shot.accent_word).toLowerCase()) : ws.length > 1 ? ws.length - 1 : -1;
  const size = ws.length <= 1 ? st.hero || 13 : ws.length === 2 ? st.hero2 || 10.5 : st.heroN || 8; // cqw: hero type 1-4 words
  const img = clean(shot.image) && fs.existsSync(path.resolve(clean(shot.image))) ? `file://${path.resolve(clean(shot.image))}` : "";
  const bg = img ? `url("${img}") center/cover` : st.bg2 ? `linear-gradient(135deg, ${st.bg}, ${st.bg2})` : st.bg;
  const dark = img || luminance(st.bg) < 0.4;
  const ink = img ? "#fff" : st.ink;
  const fx = finish(st);
  const type = ws.map((w, i) => `<span style="${i === accentIdx ? `color:${st.accent}` : ""}">${esc(w)}</span>`).join(" ");
  const carrierDot = opts.carrier ? `<div class="car" style="background:${st.accent}"></div>` : "";
  const heroCss = `font-size:${size}cqw;font-weight:${st.weight || 800};letter-spacing:${st.tracking || "-.035em"};line-height:${st.lh || 0.98};${caseCss(st.case)}${fx.rule.stroke || ""}${fx.textShadow}` +
    (fx.rule.chrome ? `background:linear-gradient(180deg,#fff 0%,#9aa3b5 45%,#1a1d26 52%,#cfd6e6 70%,#fff 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;` : "");
  return `<div class="comp" style="background:${bg};color:${ink};font-family:${st.font};${fx.rule.filter || ""}">
  ${img ? `<div class="veil"></div>` : ""}
  <div class="grid ${dark ? "g-d" : "g-l"}"${st.fx && st.fx.length ? ` style="display:none"` : ""}></div>
  ${carrierDot}
  <div class="hero" style="${heroCss}">${type}</div>
  ${fx.layers}
  ${opts.caption ? `<div class="cap" style="color:${img ? "#fff" : st.muted};font-family:${st.textFont || st.font};font-size:${st.cap || 1.9}cqw">${esc(clean(shot.see).slice(0, 110))}</div>` : ""}
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
.fx{position:absolute;inset:0;pointer-events:none}
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.55))}
.grid{position:absolute;inset:0;background-size:4cqw 4cqw;opacity:.07}
.g-l{background-image:linear-gradient(#000 1px,transparent 1px),linear-gradient(90deg,#000 1px,transparent 1px)}
.g-d{background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)}
.hero{position:absolute;left:6cqw;right:6cqw;top:50%;transform:translateY(-54%);text-wrap:balance}
.cap{position:absolute;left:6cqw;right:6cqw;bottom:5cqw;line-height:1.3;font-weight:500}
.car{position:absolute;left:6cqw;top:7cqw;width:2.4cqw;height:2.4cqw;border-radius:50%}`;
