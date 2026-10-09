// Bespoke design systems: what the design desk writes per film (design/<label>/{DESIGN.md, recipe.json, blend.json}),
// the gate that decides one is a real system and not a generic one, the check that the three are different from each
// other, the Look-step payload the console draws live, and the step that makes the chosen one the film's look.
//
//   design/<label>/DESIGN.md    the whole system, in the format design-md.mjs reads (+ "## Motion and camera")
//   design/<label>/recipe.json  { name, tagline, recipe: {palette, fonts, layout, radius, stroke, shadow, surface, texture,
//                                 icons, motif, motion, effects?}, three?: {base, camera?, note?} }  (console/presets.js render())
//   design/<label>/specimen.html  the system drawn as a key frame on the story's first line (1600x900, its own components,
//                                 real fonts, a paused GSAP timeline at window.__specimen = { tl }); recipe.json is the fallback only
//   design/<label>/specimen.png   rendered by the gate (the Look's poster)
//   design/<label>/blend.json   { name, one_line, why_for_story, references: [{id, traits[], why}], subject_world[],
//                                 stack: {"visual-style": [...], "motion-language": "..."}, motion_contract?: {...} }
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SKILL_DIR } from "./common.mjs";
import { readDesignMd, toFrameMd, parseColor, contrast } from "./design-md.mjs";
import { validateRecipe } from "./vocab.mjs";
import { HF_AUTO_FONTS } from "./fonts.mjs";
import { resolvePicks } from "./direction.mjs";
import { serve } from "./stage3d.mjs";
import { launch } from "./cdp.mjs";
import { decodePng, colourShares, layoutSimilarity } from "./png.mjs";
import crypto from "node:crypto";

export const LABELS = ["Sure", "Bold", "Wild"];
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return e && e.name === "SyntaxError" ? undefined : null; } };
const exists = (f) => fs.existsSync(f);

// ---------------------------------------------------------------- colour helpers
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));
export function hsl(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}
const dist = (a, b) => { const x = rgbOf(a), y = rgbOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / 441.67; };
export const paletteDistance = (A, B) => 0.4 * dist(A.canvas, B.canvas) + 0.6 * dist(A.accent, B.accent);

// ---------------------------------------------------------------- fonts
const GENERIC_FONTS = new Set(["inter", "roboto", "arial", "helvetica", "helvetica neue", "system-ui", "open sans", "sans-serif", "-apple-system", "system stack", "segoe ui", "lato"]);
const SERIFS = new Set(["fraunces", "playfair display", "instrument serif", "cormorant", "cormorant garamond", "eb garamond", "source serif 4", "dm serif display", "dm serif text", "newsreader", "lora", "libre baskerville", "crimson text", "crimson pro", "gloock", "young serif", "bodoni moda", "spectral", "georgia", "times new roman"]);
const EXTRA_REAL = ["abril fatface", "anton", "archivo", "archivo narrow", "barlow", "barlow condensed", "bebas neue", "bricolage grotesque", "chivo", "dm sans", "dm mono", "familjen grotesk", "figtree", "geist", "geist mono", "ibm plex sans", "ibm plex serif", "instrument sans", "jetbrains mono", "karla", "league spartan", "manrope", "plus jakarta sans", "poppins", "public sans", "rubik", "schibsted grotesk", "sora", "space grotesk", "syne", "unbounded", "work sans", "zilla slab", "big shoulders display", "dela gothic one", "bowlby one", "caveat", "permanent marker", "special elite", "vt323", "press start 2p", "major mono display", "red hat display", "outfit", "lexend", "onest", "hanken grotesk", "epilogue", "inter tight", "fira code", "space mono", "ibm plex mono", "noto serif", "noto sans", "noto sans display", "libre franklin", "oswald", "montserrat", "nunito", "playfair display sc", "tiro devanagari hindi", "mukta", "hind", "teko", "yatra one", "rozha one", "baloo 2", "kalam", "tajawal", "cairo", "noto sans tamil", "noto serif tamil"];
let KNOWN = null;
function knownFonts() {
  if (KNOWN) return KNOWN;
  KNOWN = new Set([...HF_AUTO_FONTS, ...EXTRA_REAL, ...GENERIC_FONTS, ...SERIFS].map((x) => x.toLowerCase()));
  // every family the 403 raw-material presets draw with has been loaded from Google Fonts by the specimen renderer
  const dir = path.join(SKILL_DIR, "taxonomy", "presets");
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const p of j.presets || []) for (const k of ["display", "body", "mono"]) if (p.recipe && p.recipe.fonts && p.recipe.fonts[k]) KNOWN.add(String(p.recipe.fonts[k]).toLowerCase());
    }
  } catch {}
  return KNOWN;
}
// Is `family` loadable? known set, project files, else Google Fonts / Fontshare over the network (a down network is a warning)
function fontReal(family, { dir, offline }) {
  const f = String(family || "").trim();
  if (!f) return { ok: false, how: "empty" };
  if (knownFonts().has(f.toLowerCase())) return { ok: true, how: "known" };
  for (const d of [path.join(dir || "", "fonts"), path.join(dir || "", "..", "..", "assets", "fonts")]) {
    try { if (fs.readdirSync(d).some((x) => x.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(f.toLowerCase().replace(/[^a-z0-9]/g, "")))) return { ok: true, how: "project file" }; } catch {}
  }
  if (offline || process.env.RASANAI_OFFLINE) return { ok: null, how: "not in the known set and the network check was skipped" };
  const code = (url) => { const r = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "6", "-A", "Mozilla/5.0", url], { encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : "net"; };
  const g = code(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}&display=swap`);
  if (g === "200") return { ok: true, how: "google fonts" };
  if (g === "net") return { ok: null, how: "network unavailable" };
  const s = code(`https://api.fontshare.com/v2/css?f[]=${f.toLowerCase().replace(/\s+/g, "-")}@400&display=swap`);
  if (s === "200") return { ok: true, how: "fontshare" };
  return { ok: false, how: `not on Google Fonts (${g}) or Fontshare (${s})` };
}

// the 3D scene families the specimen renderer can draw (console/presets3d.js)
export function threeBases() {
  try {
    const t = fs.readFileSync(path.join(SKILL_DIR, "console", "presets3d.js"), "utf8");
    const m = t.match(/var IDS = \[([^\]]*)\]/);
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  } catch { return []; }
}

// ---------------------------------------------------------------- loading
export function loadSystem(dir) {
  const d = path.resolve(dir);
  const md = exists(path.join(d, "DESIGN.md")) ? fs.readFileSync(path.join(d, "DESIGN.md"), "utf8") : null;
  let B = null, readError = null;
  if (md) { try { B = readDesignMd(path.join(d, "DESIGN.md")); } catch (e) { readError = e.message; } }
  return { dir: d, md, B, readError, recipe: readJ(path.join(d, "recipe.json")), blend: readJ(path.join(d, "blend.json")) };
}
const motionSection = (md) => { const m = String(md || "").match(/^##\s+Motion and camera[^\n]*\n([\s\S]*?)(?=\n##\s|(?![\s\S]))/mi); return m ? m[1].trim() : ""; };

const EASE_RE = /\b(?:power[1-4]|expo|sine|circ|back|elastic|bounce|quad|cubic|quart|quint)\.(?:in|out|inOut|inout)\b|\bsteps\(\s*\d+\s*\)|cubic-bezier\([^)]*\)|\bnone\b\s*\(linear\)|\bsteps\b|\bstepped\b/i;
const TIME_RE = /\b\d{2,4}\s?ms\b|\b\d(?:\.\d+)?\s?s\b/gi;
const CAMERA_RE = /\bcamera\b|\blens\b|\bdolly\b|\bpush\b|\btruck\b|\borbit\b|\bpan\b|\blocked\b|\bparallax\b/i;

// ---------------------------------------------------------------- the gate for one system
// opts: { libraryIds:Set, brand: <DESIGN.md>|null, label, offline }
export function checkSystem(dir, opts = {}) {
  const P = [], W = [];
  const S = loadSystem(dir);
  const label = opts.label || path.basename(dir);
  const info = { label, name: null, display: null, body: null, layout: null, motion: null, palette: null };
  for (const f of ["DESIGN.md", "recipe.json", "blend.json", "specimen.html"]) if (!exists(path.join(S.dir, f))) P.push(`design/${label}/${f} is missing${f === "specimen.html" ? " (the system drawn as a key frame on the story's first line, with its own components: references/design-desk.md)" : ""}`);
  if (S.recipe === undefined) P.push("recipe.json is not valid JSON");
  if (S.blend === undefined) P.push("blend.json is not valid JSON");
  if (P.length) return { P, W, info };

  // DESIGN.md parses and has what a build needs
  if (!S.B) { P.push(`DESIGN.md can't be read: ${S.readError}`); return { P, W, info }; }
  const B = S.B, R = B.roles || {};
  for (const r of ["canvas", "ink", "accent"]) if (!R[r]) P.push(`DESIGN.md has no ${r} colour (name each colour by role in the frontmatter)`);
  if (!(B.fonts && B.fonts.display && B.fonts.display.family)) P.push("DESIGN.md has no display font (typography.display.fontFamily)");
  if (!(B.fonts && B.fonts.body && B.fonts.body.family)) W.push("DESIGN.md has no separate body font");
  if (!Object.keys(B.radii || {}).length) P.push("DESIGN.md has no radii (a rounded: block)");
  if (!/^shadows:/m.test(S.md) && !B.shadows.length) W.push("DESIGN.md has no shadows: block (write `shadows:` with none if flat)");
  if (!/^components:\s*\n(?:\s+\S.*\n?){2,}/m.test(S.md)) P.push("DESIGN.md needs a components: block with at least 2 components (card, button, label, stat...)");
  if (B.dos.length < 3 || B.donts.length < 3) P.push(`DESIGN.md needs a "Do's and Don'ts" section with at least 3 of each (it has ${B.dos.length} do and ${B.donts.length} don't)`);
  if (!B.overview || B.overview.length < 60) P.push("DESIGN.md needs an Overview paragraph that says what the system is and why it fits this film");
  if (P.length) return { P, W, info };

  const recipe = S.recipe && S.recipe.recipe;
  if (!recipe) { P.push('recipe.json needs { "name", "recipe": {...} } (the format console/presets.js render() takes)'); return { P, W, info }; }
  for (const m of validateRecipe(recipe)) P.push(m);
  info.name = S.recipe.name || B.name;
  info.display = B.fonts.display.family; info.body = (B.fonts.body || B.fonts.display).family;
  info.layout = recipe.layout; info.motion = recipe.motion;
  info.palette = { canvas: R.canvas, accent: R.accent, ink: R.ink };

  // contrast
  const cr = contrast(R.ink, R.canvas);
  if (cr < 4.5) P.push(`ink ${R.ink} on canvas ${R.canvas} is ${cr.toFixed(2)}:1 (needs 4.5:1)`);
  if (contrast(R.accent, R.canvas) < 3) W.push(`accent ${R.accent} on canvas ${R.canvas} is ${contrast(R.accent, R.canvas).toFixed(2)}:1: it can't carry text; keep it for shapes and large type`);
  if (R.accent.toLowerCase() === R.ink.toLowerCase()) W.push("accent equals ink: nothing is rationed to the focal element");

  // the recipe draws the same system the DESIGN.md describes
  const rp = recipe.palette || {};
  for (const k of ["canvas", "ink", "accent"]) if (rp[k] && R[k] && String(rp[k]).toLowerCase() !== String(R[k]).toLowerCase()) P.push(`recipe.palette.${k} ${rp[k]} differs from DESIGN.md's ${k} ${R[k]} (the specimen must draw the real system)`);
  for (const k of ["display", "body"]) {
    const a = ((recipe.fonts || {})[k] || "").toLowerCase(), b = ((B.fonts[k] || B.fonts.display || {}).family || "").toLowerCase();
    if (a && b && a !== b) P.push(`recipe.fonts.${k} "${recipe.fonts[k]}" differs from DESIGN.md's "${(B.fonts[k] || B.fonts.display).family}"`);
  }

  // fonts are real
  for (const [role, fam] of [["display", B.fonts.display.family], ["body", (B.fonts.body || B.fonts.display).family], ...(B.fonts.mono ? [["mono", B.fonts.mono.family]] : [])]) {
    const r = fontReal(fam, { dir: S.dir, offline: opts.offline });
    if (r.ok === false) P.push(`the ${role} font "${fam}" is not loadable: ${r.how} (use a Google Fonts or Fontshare family, or ship the file in design/${label}/fonts/)`);
    else if (r.ok === null) W.push(`the ${role} font "${fam}" couldn't be verified (${r.how})`);
  }

  // not a generic default
  const d = info.display.toLowerCase(), b2 = info.body.toLowerCase();
  const brand = !!opts.brand;
  if (GENERIC_FONTS.has(d) && GENERIC_FONTS.has(b2) && !brand) P.push(`generic type: ${info.display} for display and ${info.body} for body is the default, not a system (pair a display face with a point of view)`);
  else if (GENERIC_FONTS.has(d) && !brand) W.push(`the display face ${info.display} is a default; a bespoke system usually owns a display face`);
  const hc = hsl(R.canvas), ha = hsl(R.accent);
  const purpleBlue = ha.h >= 235 && ha.h <= 285 && ha.s > 0.45;
  if (purpleBlue && /gradient/i.test(S.md) && !brand) P.push("the purple-blue gradient is the default AI look: choose another accent or drop the gradient");
  const cream = hc.l > 0.82 && hc.h >= 28 && hc.h <= 60 && hc.s > 0.2;
  const rust = ha.h >= 5 && ha.h <= 28 && ha.s > 0.4 && ha.l > 0.28 && ha.l < 0.6;
  const italicSerif = SERIFS.has(d) && (recipe.fonts || {}).italic === true;
  if (!brand && [cream, rust, italicSerif].filter(Boolean).length >= 2) P.push(`this is the "Claude look" (${[cream && "cream canvas", rust && "rust accent", italicSerif && "italic serif display"].filter(Boolean).join(" + ")}): it is everyone's default; unless the brand is that, make a different choice`);
  if (opts.brand) {
    // BRAND LOCK: when a brand applies, ALL three systems are the brand extended for motion (its palette and type
    // system); they vary composition, motion and density, never the palette or the type
    try {
      const BR = readDesignMd(path.resolve(opts.brand), { mode: opts.mode });
      {
        for (const k of ["canvas", "ink", "accent"]) if (BR.roles[k] && R[k] && BR.roles[k].toLowerCase() !== R[k].toLowerCase()) P.push(`${label}: brand lock: this system must be the brand extended (Sure, Bold and Wild all stay inside the brand's palette and type): its ${k} is ${R[k]} but the brand's is ${BR.roles[k]}`);
        const bf = BR.fonts.display && BR.fonts.display.family;
        if (bf && info.display.toLowerCase() !== bf.toLowerCase()) P.push(`${label}: brand lock: this system must keep the brand's display face ${bf} (it has ${info.display})`);
      }
    } catch (e) { W.push(`couldn't read the brand DESIGN.md to compare: ${e.message}`); }
  }

  // blend: the references it was made from
  const bl = S.blend;
  for (const k of ["name", "one_line", "why_for_story"]) if (!String(bl[k] || "").trim()) P.push(`blend.json needs "${k}"`);
  if (String(bl.one_line || "").length > 200) W.push("blend.one_line is long: one line the user reads under the specimen");
  const refs = Array.isArray(bl.references) ? bl.references : [];
  const ids = [...new Set(refs.map((r) => r && r.id).filter(Boolean))];
  if (ids.length < 2) P.push(`blend.json cites ${ids.length} library references (blend at least 2, ideally 2 to 4)`);
  if (ids.length > 4) W.push(`blend.json cites ${ids.length} references: past 4 it stops being a blend and becomes a mood board`);
  for (const r of refs) {
    if (!r || !r.id) { P.push("a blend reference has no id"); continue; }
    if (opts.libraryIds && !opts.libraryIds.has(r.id)) P.push(`blend cites "${r.id}", which is not in the library (library.mjs search --q ...)`);
    if (!Array.isArray(r.traits) || !r.traits.length) P.push(`blend reference "${r.id}" needs traits (what was taken from it)`);
    if (!String(r.why || "").trim()) P.push(`blend reference "${r.id}" needs a why (why it belongs in this system)`);
  }
  if (!Array.isArray(bl.subject_world) || !bl.subject_world.length) P.push("blend.json needs subject_world: what from the subject's own visual world is in the system");
  // taxonomy picks, so DIRECTION.md compiles from this system
  const stack = bl.stack || {};
  if (!stack["visual-style"] || !stack["motion-language"]) P.push('blend.json needs stack: { "visual-style": [<term id>], "motion-language": "<term id>" } (taxonomy ids: taxonomy.mjs show visual-style / motion-language)');
  else {
    const picks = Object.fromEntries(Object.entries(stack).map(([k, v]) => [k, [].concat(v)]));
    try { const r = resolvePicks(picks); for (const p of r.problems) P.push(`blend.stack: ${p}`); } catch (e) { P.push(`blend.stack: ${e.message}`); }
  }

  // the motion section names numbers
  const mo = motionSection(S.md);
  if (!mo) P.push('DESIGN.md has no "## Motion and camera" section (2D motion language and, when the story has depth, the 3D camera grammar)');
  else {
    const times = mo.match(TIME_RE) || [];
    if (times.length < 2) P.push(`the Motion and camera section names ${times.length} timings (write durations and holds in ms or s)`);
    if (!EASE_RE.test(mo)) P.push("the Motion and camera section names no ease (GSAP names: power3.out, expo.inOut, steps(4)...)");
    if (!CAMERA_RE.test(mo)) P.push("the Motion and camera section says nothing about the camera (locked, a push, a parallax, a lens in mm...)");
    if (S.recipe.three && !/\b\d{2,3}\s?mm\b/i.test(mo)) P.push("this system leans 3D (recipe.three) but its Motion and camera section gives no lens in mm: write the 3D camera grammar (lens, moves, easing)");
    if (mo.length < 400) W.push("the Motion and camera section is thin: the animators build from it");
  }
  const mc = bl.motion_contract;
  if (mc) {
    if (!Array.isArray(mc.scale_ms) || mc.scale_ms.length < 4 || !mc.scale_ms.every((n) => Number(n) > 0)) P.push("blend.motion_contract.scale_ms needs 4 or more durations in ms (e.g. [120, 240, 480, 900])");
    for (const k of ["enter", "exit", "move"]) if (!(mc.easing && mc.easing[k])) P.push(`blend.motion_contract.easing.${k} is missing`);
    if (mo && mc.easing) for (const k of ["enter", "exit", "move"]) if (mc.easing[k] && !mo.replace(/\s/g, "").includes(String(mc.easing[k]).replace(/\s/g, ""))) W.push(`the contract's ${k} ease ${mc.easing[k]} isn't named in the Motion and camera section`);
  }
  // 3D hint
  if (S.recipe.three) {
    const bases = threeBases();
    if (bases.length && !bases.includes(S.recipe.three.base)) P.push(`recipe.three.base "${S.recipe.three.base}" is not a 3D specimen family (${bases.join(", ")})`);
  }
  return { P, W, info };
}


// ---------------------------------------------------------------- the specimen: the system drawn as a key frame
// The first on-screen line of the chosen story (the hook the Look draws): beats[0].on_screen of story/chosen.json
export function firstLine(run) {
  const j = readJ(path.join(run, "story", "chosen.json"));
  if (!j) return "";
  const b = (Array.isArray(j.beats) && j.beats[0]) || (Array.isArray(j.scenes) && j.scenes[0]) || {};
  return String(j.hook || b.on_screen || b.text || b.line || "").trim();
}
const norm = (t) => String(t || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9'À-￿]+/g, " ").trim();
const GSAP_SRC = /<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi;
const normEase = (e) => String(e).toLowerCase().replace(/\s+/g, "").replace(/inout/g, "inout");

// Renders design/<label>/specimen.html in a real browser: waits for fonts and any Rasan3D stage, collects page errors,
// reads the timeline, parks it on its final frame and writes specimen.png. Returns { png, errors, text, tl }.
export async function renderSpecimen(dir, { png } = {}) {
  const file = path.join(dir, "specimen.html");
  const html = fs.readFileSync(file, "utf8");
  const W = Number((html.match(/data-width="(\d+)"/) || [])[1]) || 1600, H = Number((html.match(/data-height="(\d+)"/) || [])[1]) || 900;
  const tmp = path.join(dir, `.rasanai-specimen-${process.pid}.html`);
  fs.writeFileSync(tmp, html.replace(GSAP_SRC, '<script src="/__rasanai/gsap.min.js"></script>'));
  const srv = await serve(dir);
  const b = await launch({ width: W, height: H, timeoutMs: 60000 });
  try {
    await b.open(`${srv.url}/${path.basename(tmp)}`);
    const r = await b.eval(`(function(){ var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      var wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
      return Promise.race([fonts, wait(8000)]).then(function(){ var R = window.__rasan3d; var S = R ? Object.keys(R.stages).map(function(k){ return R.stages[k]; }) : [];
        return Promise.all(S.map(function(s){ return s.readyPromise; })).then(function(){ return wait(250); }).then(function(){
          var sp = window.__specimen, tl = sp && sp.tl, info = { has: !!tl, errors: R ? R.errors.slice() : [] };
          if (tl && typeof tl.duration === "function") {
            info.duration = tl.duration(); info.paused = tl.paused();
            var ez = [], implicit = 0, fn = 0, n = 0;
            (tl.getChildren ? tl.getChildren(true, true, false) : []).forEach(function(t){ var v = t.vars || {}; if (v.startAt && !t.duration) return; n++;
              if (v.ease === undefined || v.ease === null) implicit++; else if (typeof v.ease === "function") fn++; else ez.push(String(v.ease)); });
            info.eases = ez; info.implicit = implicit; info.fn = fn; info.tweens = n;
            try { tl.pause(); tl.progress(1); } catch (e) {}
          }
          info.text = (document.body.innerText || "").replace(/\\s+/g, " ").trim();
          info.fonts = Array.from(document.fonts || []).filter(function(f){ return f.status === "loaded"; }).map(function(f){ return f.family.replace(/["']/g, ""); });
          if (R) Object.keys(R.stages).forEach(function(k){ var s = R.stages[k]; s.draw(s.tl.time(), true); });
          return info; }); }); })()`, { await: true });
    const out = png || path.join(dir, "specimen.png");
    await new Promise((res) => setTimeout(res, 150));
    fs.writeFileSync(out, await b.screenshot());
    const errors = b.logs.filter((l) => /^exception:|^error:/.test(l) && !/Failed to load resource|net::ERR|fonts\.g(?:oogleapis|static)|favicon/i.test(l)).map((l) => l.slice(0, 200));
    return { png: out, errors: [...errors, ...(r.errors || [])], info: r, W, H };
  } finally {
    await b.close();
    await srv.close();
    fs.rmSync(tmp, { force: true });
  }
}

// What the page may do with its accent: the share of pixels it can take. The DESIGN.md says how rationed it is.
function accentCeiling(md, bl) {
  const o = bl && bl.specimen && Number(bl.specimen.accent_max);
  if (o > 0 && o <= 1) return o;
  return /never (?:fills|on) a background|never fills|rationed|once per frame|one [a-z ]{0,30}per frame|single [a-z ]{0,20}per frame|one hot/i.test(md || "") ? 0.08 : 0.15;
}

// opts: { hook, offline }. Returns { P, W, stats } (cached by content: re-checking an unchanged specimen costs nothing)
export async function checkSpecimen(dir, opts = {}) {
  const P = [], W = [];
  const S = loadSystem(dir), label = opts.label || path.basename(dir);
  const file = path.join(S.dir, "specimen.html");
  if (!exists(file)) return { P: [`design/${label}/specimen.html is missing`], W, stats: null };
  const html = fs.readFileSync(file, "utf8");
  const mo = motionSection(S.md);
  const key = crypto.createHash("sha1").update(html).update(S.md || "").update(JSON.stringify(S.blend && S.blend.specimen || null)).update(String(opts.hook || "")).update(fs.existsSync(path.join(S.dir, "assets")) ? "a" : "").digest("hex");
  const cacheF = path.join(S.dir, ".specimen-check.json");
  const cached = readJ(cacheF);
  if (cached && cached.key === key && exists(path.join(S.dir, "specimen.png"))) return { P: cached.P, W: cached.W, stats: cached.stats };

  if (!/data-width=["']?\d+/.test(html) || !/data-height=["']?\d+/.test(html)) P.push("specimen.html's root needs data-width and data-height (1600 x 900)");
  if (!/@font-face|fonts\.googleapis\.com|fonts\.bunny\.net|api\.fontshare\.com/i.test(html)) P.push("specimen.html loads no fonts: use the DESIGN.md's real faces through Google Fonts or @font-face");
  let R;
  try { R = await renderSpecimen(S.dir); } catch (e) { return { P: [...P, `specimen.html would not render: ${String(e.message || e).split("\n")[0]}`], W, stats: null }; }
  for (const e of R.errors.slice(0, 3)) P.push(`specimen.html has a page error: ${e}`);
  const I = R.info || {};

  // the line is in the DOM
  const dom = norm(I.text);
  if (opts.hook) {
    const words = norm(opts.hook).split(" ").filter(Boolean), have = new Set(dom.split(" "));
    if (words.length && words.filter((w) => have.has(w)).length / words.length < 0.8) P.push(`specimen.html does not carry the story's first line ("${opts.hook}") as DOM text: set it in this system, in real text (not an image)`);
  } else if (dom.length < 8) P.push("specimen.html has no headline text in the DOM");
  const B = S.B;
  if (B && !new RegExp(String(B.fonts.display && B.fonts.display.family || "").replace(/[^a-z0-9]+/gi, ".?"), "i").test(html)) P.push(`specimen.html does not use the display face ${B.fonts.display.family}`);

  // the timeline
  if (!I.has) P.push("specimen.html must register its motion: window.__specimen = { tl } (a paused GSAP timeline, 2.5 s at most)");
  else {
    if (!(I.duration > 0.2)) P.push(`the specimen timeline is ${Number(I.duration).toFixed(2)} s: it must animate something`);
    if (I.duration > 2.55) P.push(`the specimen timeline is ${I.duration.toFixed(2)} s (2.5 s at most: it plays when the user hovers)`);
    if (!I.paused) W.push("the specimen timeline is not paused at load (it should rest on its final frame until hovered)");
    if (I.implicit) P.push(`${I.implicit} specimen tween(s) name no ease: use the eases of the Motion and camera section`);
    if (I.fn) W.push(`${I.fn} specimen tween(s) ease with a function, which can't be checked against the Motion and camera section`);
    const motionN = normEase(mo);
    const strays = [...new Set((I.eases || []).filter((e) => !motionN.includes(normEase(e)) && !(/^(none|linear)$/i.test(e) && /linear|\bnone\b/i.test(mo))))];
    if (strays.length) P.push(`the specimen uses ease(s) ${strays.join(", ")} that the DESIGN.md's Motion and camera section doesn't name (it names the system's own eases)`);
  }

  // the pixels
  let stats = null;
  try {
    const img = decodePng(R.png), Rl = (S.B && S.B.roles) || {};
    const pal = Object.fromEntries(["canvas", "ink", "accent", "support", "surface", "muted", "rule"].filter((k) => /^#[0-9a-f]{6}$/i.test(Rl[k] || "")).map((k) => [k, Rl[k]]));
    const cs = colourShares(img, pal);
    const sh = cs.share, ceiling = accentCeiling(S.md, S.blend), spc = (S.blend && S.blend.specimen) || {};
    stats = { share: Object.fromEntries(Object.entries(sh).map(([k, v]) => [k, Math.round(v * 1000) / 1000])), off_palette: Math.round(cs.off * 1000) / 1000, accent_max: ceiling };
    const ground = (sh.canvas || 0) + (sh.surface || 0);
    if (cs.off > 0.5) P.push(`the specimen is ${Math.round(cs.off * 100)}% off the system's palette: draw it in the DESIGN.md's colours (gradients and photographs aside, nothing should be a colour the system doesn't own)`);
    if (spc.canvas !== "absent" && ground < 0.2) P.push(`the system's canvas and surface cover ${Math.round(ground * 100)}% of the specimen: it should lead (or say blend.json specimen.canvas = "absent" when the system deliberately has none)`);
    if ((sh.ink || 0) < 0.003) P.push("the system's ink is hardly on the specimen (under 0.3% of pixels): set the line in it");
    if ((sh.accent || 0) < 0.0004) P.push("the system's accent is not on the specimen: show the one place it lives");
    if ((sh.accent || 0) > ceiling) P.push(`the accent covers ${(sh.accent * 100).toFixed(1)}% of the specimen, over the ${Math.round(ceiling * 100)}% this system allows (its DESIGN.md rations it): it is a mark, not a ground`);
  } catch (e) { P.push(`the specimen render could not be read: ${e.message}`); }
  if (!P.length) { try { fs.writeFileSync(cacheF, JSON.stringify({ key, P, W, stats })); } catch {} }
  return { P, W, stats };
}

// checkSystem + the specimen. The specimen renders only once the rest of the system is sound.
export async function checkSystemFull(dir, opts = {}) {
  const r = checkSystem(dir, opts);
  if (r.P.length) return r;
  const sp = await checkSpecimen(dir, { hook: opts.hook || firstLine(path.resolve(dir, "..", "..")), offline: opts.offline, label: r.info.label });
  r.P.push(...sp.P); r.W.push(...sp.W); r.info.specimen = sp.stats;
  return r;
}

// ---------------------------------------------------------------- the three together
export async function checkSystems(dirs, opts = {}) {
  const P = [], W = [];
  const rows = [];
  for (const d of dirs) rows.push(opts.specimens === false ? checkSystem(d, opts) : await checkSystemFull(d, opts));
  rows.forEach((r, i) => { for (const p of r.P) P.push(`${path.basename(dirs[i])}: ${p}`); for (const w of r.W) W.push(`${path.basename(dirs[i])}: ${w}`); });
  const ok = rows.filter((r) => r.info.palette);
  const pairs = [];
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const a = ok[i].info, b = ok[j].info;
    const pd = paletteDistance(a.palette, b.palette);
    const dims = { palette: pd >= 0.2, display: a.display.toLowerCase() !== b.display.toLowerCase(), layout: a.layout !== b.layout, motion: a.motion !== b.motion };
    const differ = Object.values(dims).filter(Boolean).length;
    pairs.push({ a: a.label, b: b.label, palette_distance: Math.round(pd * 100) / 100, differ: Object.entries(dims).filter(([, v]) => v).map(([k]) => k) });
    if (opts.brand) {
      // brand lock: palette and type are the brand's in all three, so they must differ in composition AND motion
      if (!dims.layout || !dims.motion) P.push(`${a.label} and ${b.label} are too alike under the brand lock (they differ in: ${Object.entries(dims).filter(([, v]) => v).map(([k]) => k).join(", ") || "nothing"}): with the brand's palette and type fixed, the three must differ in layout AND motion language (and density)`);
    } else if (!dims.display || differ < 3) P.push(`${a.label} and ${b.label} are too alike (they differ in: ${Object.entries(dims).filter(([, v]) => v).map(([k]) => k).join(", ") || "nothing"}; palette distance ${pd.toFixed(2)}): three systems must differ in at least 3 of palette, display face (always), layout, motion language`);
  }
  // the three specimens are three compositions, not one layout recoloured
  const pngs = dirs.map((d) => path.join(d, "specimen.png"));
  if (opts.specimens !== false && pngs.every(exists)) {
    const imgs = pngs.map((f) => { try { return decodePng(f); } catch { return null; } });
    for (let i = 0; i < imgs.length; i++) for (let j = i + 1; j < imgs.length; j++) {
      if (!imgs[i] || !imgs[j]) continue;
      const sim = layoutSimilarity(imgs[i], imgs[j]);
      pairs.push({ a: path.basename(dirs[i]), b: path.basename(dirs[j]), specimen_similarity: Math.round(sim * 100) / 100 });
      if (sim > 0.85) P.push(`the ${path.basename(dirs[i])} and ${path.basename(dirs[j])} specimens are the same layout recoloured (layout similarity ${sim.toFixed(2)}; at most 0.85): compose each system's own page`);
    }
  }
  // each system pitches itself: the one line and the why the console shows must be its own
  const pitch = dirs.map((d) => { const b = loadSystem(d).blend || {}; return ["one_line", "why_for_story"].map((k) => String(b[k] || "").trim().toLowerCase()).filter(Boolean); });
  for (let i = 0; i < pitch.length; i++) for (let j = i + 1; j < pitch.length; j++) {
    const dup = pitch[i].find((x) => x.length > 20 && pitch[j].includes(x));
    if (dup) P.push(`${path.basename(dirs[i])} and ${path.basename(dirs[j])} share the same pitch text ("${dup.slice(0, 60)}…"): each system says why it fits in its own words`);
  }
  // the same references carry all three: a desk repeating itself
  const cites = dirs.map((d) => new Set((((loadSystem(d).blend) || {}).references || []).map((x) => x && x.id).filter(Boolean)));
  for (let i = 0; i < cites.length; i++) for (let j = i + 1; j < cites.length; j++) {
    const same = [...cites[i]].filter((x) => cites[j].has(x)).length;
    if (cites[i].size >= 2 && same === cites[i].size && same === cites[j].size) P.push(`${path.basename(dirs[i])} and ${path.basename(dirs[j])} blend exactly the same references`);
  }
  return { P, W, pairs, systems: rows.map((r) => r.info) };
}

// ---------------------------------------------------------------- the Look step
export function lookPayload(run, { labels = LABELS, recommended, hook, sub, brand } = {}) {
  const styles = [];
  for (const label of labels) {
    const dir = path.join(run, "design", label);
    const S = loadSystem(dir);
    if (!S.recipe || !S.recipe.recipe || !S.blend) continue;
    const id = label.toLowerCase();
    styles.push({
      id, preset: id, label,
      name: S.recipe.name || S.blend.name,
      blend: S.blend.one_line,
      why: S.blend.why_for_story,
      style: { id, name: S.recipe.name || S.blend.name, recipe: S.recipe.recipe, ...(S.recipe.three ? { three: S.recipe.three } : {}), feels: S.recipe.feels || [] },
      references: (S.blend.references || []).map((r) => r.id),
      design_md: path.relative(process.cwd(), path.join(dir, "DESIGN.md")),
      // the system drawn by its own page (a sandboxed iframe in the console, specimen.png as its poster); the recipe is the fallback
      ...(exists(path.join(dir, "specimen.html")) ? { specimen: path.relative(process.cwd(), path.join(dir, "specimen.html")), ...(exists(path.join(dir, "specimen.png")) ? { poster: path.relative(process.cwd(), path.join(dir, "specimen.png")) } : {}) } : {}),
    });
  }
  return { styles, recommended: recommended ? String(recommended).toLowerCase() : styles[0] && styles[0].id, hook: hook || "", sub: sub || "", brand: brand || undefined };
}

// ---------------------------------------------------------------- choose: the system becomes the film's look
// writes <run>/look/{DESIGN.md, frame.md}, merges the system into decisions.json (look, picks, design_system)
export function chooseSystem(run, label, decisionsFile, { mode, preset } = {}) {
  const dir = path.join(run, "design", label);
  const S = loadSystem(dir);
  if (!S.B || !S.recipe || !S.blend) throw new Error(`design/${label} is not a complete system (design.mjs check-system --dir ${dir})`);
  const out = path.join(run, "look");
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(dir, "DESIGN.md"), path.join(out, "DESIGN.md"));
  const frame = toFrameMd(readDesignMd(path.join(out, "DESIGN.md"), { mode }));
  fs.writeFileSync(path.join(out, "frame.md"), frame);
  const dp = path.resolve(decisionsFile);
  const D = exists(dp) ? JSON.parse(fs.readFileSync(dp, "utf8")) : { picks: {} };
  D.picks = { ...(D.picks || {}) };
  D.decided_by = D.decided_by || {};
  for (const [k, v] of Object.entries(S.blend.stack || {})) { D.picks[k] = [].concat(v); D.decided_by[k] = "user"; }
  const rel = (p) => path.relative(process.cwd(), p);
  D.look = { frame: rel(path.join(out, "frame.md")), name: S.recipe.name || S.blend.name, system: label, design_md: rel(path.join(out, "DESIGN.md")), recipe: S.recipe.recipe, ...(S.recipe.three ? { three: S.recipe.three } : {}) };
  D.design_system = { picked: true, label, name: D.look.name, dir: rel(dir), design_md: D.look.design_md, one_line: S.blend.one_line, references: (S.blend.references || []).map((r) => r.id), motion_contract: S.blend.motion_contract || null };
  // a workflow whose gate wants a preset's frame.md verbatim (lyric videos) gets the nearest one as the technical frame;
  // the bespoke system still binds through DIRECTION.md and DISPATCH
  if (preset) D.look.preset = String(preset);
  delete D.style_preset;
  fs.writeFileSync(dp, JSON.stringify(D, null, 2) + "\n");
  return { ok: true, system: D.look.name, label, frame: D.look.frame, design_md: D.look.design_md, picks: D.picks, motion_contract: D.design_system.motion_contract };
}

// the bespoke system's own words for DIRECTION.md (compiled after the picks)
export function directionSection(D) {
  const ds = D && D.design_system;
  if (!ds || !ds.design_md || !exists(path.resolve(ds.design_md))) return "";
  const S = loadSystem(path.dirname(path.resolve(ds.design_md)));
  const mo = motionSection(fs.readFileSync(path.resolve(ds.design_md), "utf8"));
  const bl = (S && S.blend) || {};
  return `\n## The bespoke design system: ${ds.name}\n\n${bl.one_line || ds.one_line || ""}\n\nBuilt for this film by the design desk from: ${(bl.references || []).map((r) => `${r.id} (${(r.traits || []).join("; ")})`).join(" · ") || (ds.references || []).join(", ")}. The subject's own visual world in it: ${(bl.subject_world || []).join("; ")}.\n\nThe design system is \`${ds.design_md}\` (read all of it: colours by role, type, shapes, components, do's and don'ts). Its motion and camera language binds the animators:\n\n${mo}\n`;
}
