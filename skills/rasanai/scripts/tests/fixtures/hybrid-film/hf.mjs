// Tiny real HyperFrames project for the end-to-end case: two 1 s scenes (sub-compositions), 320x180 @ 30 fps, vendored GSAP (no network).
//   makeHyperFilm(film, { line2 })  writes index.html, compositions/{intro,phone}.html, assets/gsap.min.js and motion/score.json into the film dir
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GSAP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "vendor", "gsap.min.js");
const W = 320, H = 180;
const scene = (id, bg, text) => `<template id="${id}-template">
<div data-composition-id="${id}" data-start="0" data-duration="1" data-width="${W}" data-height="${H}" style="position:relative;width:${W}px;height:${H}px;background:${bg};overflow:hidden">
  <div id="${id}-t" style="position:absolute;left:0;top:70px;width:${W}px;text-align:center;font:700 34px sans-serif;color:#fff">${text}</div>
  <div id="${id}-bar" style="position:absolute;left:0;bottom:0;height:12px;width:${W}px;background:#ffd23f;transform-origin:0 50%"></div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.from("#${id}-t", { y: 40, opacity: 0, duration: 0.5, ease: "power2.out" }, 0);
    tl.fromTo("#${id}-bar", { scaleX: 0 }, { scaleX: 1, duration: 1, ease: "none" }, 0);
    window.__timelines["${id}"] = tl;
  </script>
</div>
</template>`;

export function makeHyperFilm(film, { line2 = "PHONE" } = {}) {
  fs.mkdirSync(path.join(film, "compositions"), { recursive: true });
  fs.mkdirSync(path.join(film, "assets"), { recursive: true });
  fs.mkdirSync(path.join(film, "motion"), { recursive: true });
  fs.copyFileSync(GSAP, path.join(film, "assets", "gsap.min.js"));
  fs.writeFileSync(path.join(film, "compositions", "intro.html"), scene("intro", "#143d59", "INTRO"));
  fs.writeFileSync(path.join(film, "compositions", "phone.html"), scene("phone", "#b4161b", line2));
  fs.writeFileSync(path.join(film, "index.html"), `<!doctype html>
<html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script></head>
<body style="margin:0;background:#000">
<div id="root" data-composition-id="root" data-start="0" data-duration="2" data-width="${W}" data-height="${H}">
  <div id="slot-intro" class="clip" data-composition-id="intro" data-composition-src="compositions/intro.html" data-start="0" data-duration="1" data-track-index="1"></div>
  <div id="slot-phone" class="clip" data-composition-id="phone" data-composition-src="compositions/phone.html" data-start="1" data-duration="1" data-track-index="2"></div>
</div>
<script>window.__timelines = window.__timelines || {}; window.__timelines["root"] = gsap.timeline({ paused: true });</script>
</body></html>
`);
  fs.writeFileSync(path.join(film, "motion", "score.json"), JSON.stringify({ duration: 2, fps: 30, width: W, height: H, scenes: [
    { n: 1, id: "intro", start: 0, end: 1, duration: 1, line: "intro" }, { n: 2, id: "phone", start: 1, end: 2, duration: 1, line: line2 } ], seams: [{ from: 1, to: 2, kind: "cut" }] }, null, 2) + "\n");
  return film;
}
