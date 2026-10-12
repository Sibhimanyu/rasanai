#!/usr/bin/env node
// Tasting menu: the user's own content looping in N motion personalities,
// side by side, in the chosen look. Output is one HTML file that is BOTH:
//   - a standalone page (open in a browser: every cell loops forever), and
//   - a valid HyperFrames composition (paused master timeline registered on
//     window.__timelines, deterministic, synchronous build) for Studio preview
//     or `hyperframes render`.
// Optional --stills renders PNGs where every cell sits at the same phase
// (mid-enter / hold / mid-exit) so the menu can be judged in chat too.
//
// usage: node tasting.mjs --content "Ship it in an afternoon" \
//          --personalities editorial-mask,elastic-playful,brutalist-step \
//          [--frame path/to/frame.md | --preset editorial-forest] [--aspect 16:9] \
//          [--sub "secondary line (tagline, URL); animates with the headline"] \
//          [--scenes "Hook::sub || Middle line || Close::url"  (instead of --content: 2-4 scenes of the video, played in order per cell)] \
//          --out .rasanai/run-1/tasting [--stills]
// Content "|" forces a line break. Text only: for a logo or data piece, preview
// with the words the piece will show (brand name, the key number + label).
import fs from "node:fs";
import path from "node:path";
import {
  parseArgs, die, getPersonality, readLook, normalizeAspect, esc, googleFontLink,
  writeFile, SKILL_DIR, chromeScreenshot, chromeDumpDom, gsapInline,
} from "./lib/common.mjs";
import { resolvePreset } from "./lib/hyperframes.mjs";
import { track } from "./lib/report.mjs";
import "./lib/motion-lang.mjs"; // motion-language terms ("lang-snappy") resolve like swatch ids

const args = parseArgs();
track("Rendering motion swatches of your own lines", "Motion swatches ready");
// --scenes "Hook line::sub || Middle line || Closing line::url": several scenes per
// cell, played in order, so each personality is judged across the video
const scenes = args.scenes
  ? String(args.scenes).split("||").map((x) => x.trim()).filter(Boolean).slice(0, 4).map((x) => {
      const [c, sb] = x.split("::");
      return { content: c.trim(), sub: (sb || "").trim() };
    })
  : null;
if (!args.content && !scenes) die("--content (one headline) or --scenes (a few scenes of the video) is required");
if (!args.content) args.content = scenes[0].content;
if (!args.personalities) die("--personalities is required (comma-separated ids; see personalities/)");
if (!args.out) die("--out is required (a directory)");

const ids = String(args.personalities).split(",").map((s) => s.trim()).filter(Boolean);
if (ids.length < 1 || ids.length > 6) die("pick 1-6 motion languages / swatches for one tasting page");
const personalities = ids.map(getPersonality);
const framePath = args.frame || (args.preset ? resolvePreset(args.preset) : null);
const look = readLook(framePath);
const [W, H] = normalizeAspect(args.aspect || "16:9").split("x").map(Number);

// Grid: page is 1920x1080. Cells keep the target aspect.
const PAGE_W = 1920, PAGE_H = 1080, GAP = 28, PAD = 56, LABEL_H = 64;
const n = personalities.length;
const cols = W / H <= 0.85 ? Math.min(n, 6) : n <= 2 ? 2 : n <= 4 ? 2 : 3;
const rows = Math.ceil(n / cols);
const availW = PAGE_W - PAD * 2 - GAP * (cols - 1);
const availH = PAGE_H - PAD * 2 - GAP * (rows - 1) - LABEL_H * rows;
let cellW = availW / cols;
let cellH = cellW * (H / W);
if (cellH > availH / rows) {
  cellH = availH / rows;
  cellW = cellH * (W / H);
}
cellW = Math.floor(cellW);
cellH = Math.floor(cellH);

const letters = "ABCDEF";
const engine = fs.readFileSync(path.join(SKILL_DIR, "scripts", "lib", "engine.js"), "utf8");

const cellsHtml = personalities
  .map(
    (p, i) => `
      <figure class="md-fig">
        <div class="md-cell" id="cell-${letters[i]}" data-content="${esc(args.content)}"${args.sub ? ` data-sub="${esc(args.sub)}"` : ""} data-w="${cellW}" data-h="${cellH}" data-personality="${p.id}">
          ${scenes ? scenes.map((sc) => `<div class="md-block" data-content="${esc(sc.content)}"${sc.sub ? ` data-sub="${esc(sc.sub)}"` : ""}></div>`).join("") : `<div class="md-block"></div>`}
        </div>
        <figcaption><b>${letters[i]}</b> ${esc(p.name)}<span>${esc(p.oneLiner)}</span></figcaption>
      </figure>`
  )
  .join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${PAGE_W}, height=${PAGE_H}" />
<title>Tasting menu: ${esc(args.content)}</title>
${gsapInline()}
${googleFontLink(look.font)}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${PAGE_W}px; height: ${PAGE_H}px; overflow: hidden; background: #0c0c0e; }
  #stage { width: 100%; height: 100%; display: grid; grid-template-columns: repeat(${cols}, ${cellW}px);
    gap: ${GAP}px; justify-content: center; align-content: center; padding: ${PAD}px; }
  .md-fig { display: flex; flex-direction: column; gap: 10px; }
  .md-cell { --md-bg-c: ${look.bg}; --md-ink-c: ${look.ink}; --md-bg: var(--md-bg-c); --md-ink: var(--md-ink-c);
    position: relative; width: ${cellW}px; height: ${cellH}px; overflow: hidden; border-radius: 6px;
    background: var(--md-bg); color: var(--md-ink); display: grid; place-items: center; }
  .md-cell > .md-block { grid-area: 1 / 1; }
  .md-block { font-family: "${look.font}", Inter, ui-sans-serif, system-ui, sans-serif; font-weight: ${look.fontWeight};
    line-height: 1.02; letter-spacing: -0.02em; text-align: center; position: relative; will-change: transform; }
  .md-line { overflow: hidden; padding: 0.04em 0.06em; white-space: nowrap; }
  .md-line-in { display: block; }
  .md-word { display: inline-block; white-space: nowrap; }
  .md-char { display: inline-block; }
  .md-rule { height: max(2px, 0.045em); background: ${look.accent}; margin: 0.18em auto 0; width: 60%; transform: scaleX(0); }
  .md-cursor { display: inline-block; width: 0.5em; background: ${look.accent}; margin-left: 0.04em; }
  .md-subline { font-weight: 500; letter-spacing: 0.02em; line-height: 1.3; color: color-mix(in srgb, var(--md-ink) 78%, var(--md-bg)); }
  .md-rule + .md-subline { margin-top: 0.35em; }
  figcaption { font: 500 15px/1.35 ui-monospace, "JetBrains Mono", Menlo, monospace; color: #e8e6e1; letter-spacing: 0.02em; height: ${LABEL_H - 10}px; }
  figcaption b { display: inline-block; min-width: 1.6em; padding: 1px 6px; margin-right: 8px; background: #e8e6e1; color: #0c0c0e; border-radius: 3px; text-align: center; }
  figcaption span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #8d8a84; font-size: 13px; margin-top: 4px; }
</style>
</head>
<body>
  <div id="stage" data-composition-id="tasting" data-obey-mix="off" data-start="0" data-duration="__DUR__" data-width="${PAGE_W}" data-height="${PAGE_H}">
    ${cellsHtml}
  </div>
  <script>${engine}</script>
  <script>
    (function () {
      var standalone = !window.__timelines;
      window.__timelines = window.__timelines || {};
      var P = ${JSON.stringify(Object.fromEntries(personalities.map((p) => [p.id, p])))};
      // ?cell=B: one swatch alone, filling the page (the console shows each motion language as its own card)
      var solo = new URLSearchParams(location.search).get("cell");
      if (solo) {
        [].slice.call(document.querySelectorAll(".md-fig")).forEach(function (f) {
          var c = f.querySelector(".md-cell");
          if (!c || c.id !== "cell-" + solo) { f.remove(); return; }
          var w = Number(c.getAttribute("data-w")), hh = Number(c.getAttribute("data-h"));
          var k = Math.min(${PAGE_W} / w, ${PAGE_H} / hh);
          document.body.style.background = getComputedStyle(c).backgroundColor;
          f.style.cssText = "position:absolute;left:" + (${PAGE_W} - w * k) / 2 + "px;top:" + (${PAGE_H} - hh * k) / 2 + "px;margin:0;transform-origin:0 0;transform:scale(" + k + ")";
          var cap = f.querySelector("figcaption"); if (cap) cap.remove();
        });
      }
      var master = gsap.timeline({ paused: true });
      var cells = [].slice.call(document.querySelectorAll(".md-cell"));
      var phases = {};
      var subs = cells.map(function (cell) {
        var sub = gsap.timeline();
        phases[cell.id] = MD.build(sub, cell, P[cell.getAttribute("data-personality")]);
        master.add(sub, 0);
        return sub;
      });
      window.__timelines["tasting"] = master;
      document.body.setAttribute("data-md-cells", String(document.querySelectorAll(".md-cell .md-line").length ? cells.length : 0));
      window.__mdPhases = phases;
      master.seek(0);
      var q = new URLSearchParams(location.search);
      var phase = q.get("phase");
      if (phase) {
        // stills: every cell at its own phase time
        subs.forEach(function (s, i) { s.pause(); s.seek(phases[cells[i].id][phase] || 0); });
        master.pause();
      } else if (standalone) {
        // a timeline removed from its parent ticks nowhere: hand each cell back to GSAP's root timeline to loop
        subs.forEach(function (s) { master.remove(s); gsap.globalTimeline.add(s, gsap.globalTimeline.time()); s.repeat(-1).repeatDelay(0.7).play(0); });
      }
    })();
  </script>
</body>
</html>
`;

// duration of the HF composition = longest cell; estimate from personality demo
// timings (the page itself computes exact values; the attribute needs a number).
// generous: per-character stagger on both entrance and exit, plus two holds
const nChars = (scenes ? scenes.map((x) => x.content + x.sub).join("") : args.content + (args.sub || "")).replace(/\s|\|/g, "").length + 2;
const est = Math.max(
  ...personalities.map((p) => {
    const d = p.demo;
    const hold = Math.max(d.hold_ms, p.holds.min_ms);
    const perScene = d.enter_ms + d.move_ms * 2 + d.exit_ms + hold * 2;
    return ((scenes ? scenes.length : 1) * perScene + p.stagger.each_ms * nChars * 2) / 1000 + 0.5 + (scenes ? scenes.length * 0.2 : 0);
  })
);
const out = path.resolve(args.out);
const file = path.join(out, "index.html");
writeFile(file, html.replace("__DUR__", est.toFixed(2)));

const manifest = {
  content: args.content,
  sub: args.sub || null,
  scenes: scenes || null,
  aspect: `${W}x${H}`,
  look,
  // adjusted variants carry parent + adjust so a lock maps back to
  // `motion-md.mjs write --personality <parent> --adjust <adjust>`
  cells: personalities.map((p, i) => ({ letter: letters[i], id: p.id, name: p.name, oneLiner: p.oneLiner, ...(p.parent ? { parent: p.parent, adjust: p.adjustments } : {}) })),
  file,
};

// the page must actually build every cell (script error / missing GSAP would leave it blank)
{
  const dom = chromeDumpDom(file, 6000);
  const m = dom.match(/data-md-cells="(\d+)"/);
  if (!m || Number(m[1]) !== personalities.length) die(`tasting page did not render (${m ? m[1] : 0}/${personalities.length} cells). Open ${file} in a browser to see the console error.`, 1);
}
if (look.defaulted && look.defaulted.length) manifest.warning = `look fell back to defaults for: ${look.defaulted.join(", ")}`;
if (args.stills) {
  const phasesWanted = ["enterMid", "hold", "exitMid"];
  manifest.stills = [];
  for (const ph of phasesWanted) {
    const png = path.join(out, `tasting-${ph}.png`);
    chromeScreenshot(`file://${file}?phase=${ph}`, png, PAGE_W, PAGE_H, 6000);
    manifest.stills.push(png);
  }
}

writeFile(path.join(out, "tasting.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
