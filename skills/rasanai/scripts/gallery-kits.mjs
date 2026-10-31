// The kit demos for scripts/gallery.mjs: one tiny composition per kit (the DOM kits and the Three.js recipes). Each entry is
// { id, title, kind: "kit", fn, scripts, body, code, dur, css? }; `code` runs on the demo page with `tl` (the one paused GSAP timeline),
// `stage` (960x540) and `photo*` (procedural canvases from RasanMoves.placeholder) in scope. Assets for recipes that need local files
// are written next to the page by `assets` (name -> text).
import fs from "node:fs";
import path from "node:path";

export function kits({ rt, fileUrl, S3, SKILL_DIR }) {
  const moves = rt("rasan-moves.js");
  const R3 = (f) => fileUrl(S3 + "/" + f);
  const demo = (o) => ({ kind: "kit", scripts: [moves], body: "", ...o });
  const out = [];

  // ---- DOM kits
  out.push(demo({
    id: "medium-pixel-world", title: "Kit: RasanPixelWorld (tiles, parallax, palette shift, pixel type, iris)", fn: "RasanPixelWorld",
    scripts: [moves, rt("medium-pixel.js"), rt("medium-pixel-world.js")], dur: 6.5,
    code: `
var P = RasanPixel, W = RasanPixelWorld, fit = P.fit(960, 540, { base: [240, 135] });
var cv = document.createElement("canvas"); cv.style.cssText = "position:absolute;left:0;top:0"; stage.appendChild(cv);
var DAY = ["#8fd0f0","#6cb0e0","#7fa8c8","#ffffff","#e8d9a8","#5ca05c","#3d7a45","#ffffff","#d9534f"], DUSK = ["#f0a070","#c06080","#8a5a8a","#ffd9b0","#c8a878","#4a8a5a","#335a3d","#fff2dc","#d9534f"], NIGHT = ["#14121f","#2b2d5a","#2a3a6a","#4a5fa8","#6a6a80","#2f6a4a","#244a35","#f2e9d8","#d9534f"];
var S = P.surface(cv, { fit: fit, palette: DAY });
var rows = []; for (var r = 0; r < 14; r++) rows.push(".".repeat(120)); rows.push("g".repeat(120)); rows.push("d".repeat(120)); rows.push("d".repeat(120));
var LEVEL = { tile: 8, map: rows, legend: { g: { top: 5, fill: 6 }, d: { fill: 6, speckle: 5 } } };
P.bind(tl, S, function (T, s) {
  var cam = P.camera(T * 22, 0);
  W.shiftPalette(s, [{ at: 0, colors: DAY }, { at: 3, colors: DUSK }, { at: 5, colors: NIGHT }], T);
  s.clear(0);
  W.layers(s, [{ kind: "stars", depth: 0.02, c: 7, count: 30 }, { kind: "clouds", depth: 0.1, c: 3, y: 10, drift: 3 }, { kind: "hills", depth: 0.3, c: 2, seed: 3, y: 80 }, { kind: "hills", depth: 0.55, c: 5, seed: 5, y: 100 }], cam, T);
  W.tilemap(s, LEVEL, cam.x, 0, T);
  s.sprite(P.SCOUT, 70, 119, { anim: "walk", colors: { a: 6, b: 8, c: 7, d: 4, e: 6 }, frame: P.step(T, { fps: 8, count: 2, id: "scout", seed: 7 }) });
  W.bigText(s, "LEVEL 2", 62, 28, 7, { scale: 3, outline: 0 });
  W.transition(s, "iris", W.progress(T, 5.4, 0.9), { c: 0 });
}, { at: 0, duration: 6.5 });
` }));

  const retro = (variant, extra) => demo({
    id: "medium-retro-os-" + variant, title: `Kit: RasanRetroOS (${variant}: windows, cursor, drag, stack)`, fn: "RasanRetroOS",
    scripts: [moves, rt("medium-retro-os.js")], dur: 5.5,
    code: `
var OS = RasanRetroOS, d = OS.desktop(stage, { variant: "${variant}", icons: ["Docs", "Bin"], taskbar: true });
var w1 = OS.window(d, { title: "Untitled", body: "<p>Hello, world.</p>", x: 150, y: 70, w: 420, h: 250 });
var w2 = OS.window(d, { title: "Notes", body: "<p>Second window.</p>", x: 330, y: 150, w: 400, h: 240 });
var w3 = OS.window(d, { title: "Draft", body: "<p>Third.</p>", x: 330, y: 150, w: 360, h: 220 });
var cur = OS.cursor(d, { x: 40, y: 40, stepped: ${variant === "classic"} });
OS.open(tl, w1, { at: 0.4 });
var t = OS.click(tl, cur, w1.titlebar, { at: 1.0, duration: 0.6 });
t = OS.drag(tl, cur, w1, { at: t + 0.1, duration: 0.9, to: [90, 100] });
OS.stack(tl, [w2, w3], { at: t + 0.4, offset: [40, 30], stagger: 0.3 });
var __result = { end: t + 1.2 };
` });
  for (const v of ["classic", "win95", "y2k"]) out.push(retro(v));

  out.push(demo({
    id: "medium-sticker", title: "Kit: RasanSticker (die-cut, slap, scrapbook, boil)", fn: "RasanSticker",
    scripts: [moves, rt("medium-sticker.js")], dur: 5,
    code: `
var K = RasanSticker, items = [];
var imgs = [RasanMoves.placeholder.cutout(1, 300, 400), RasanMoves.placeholder.art(2, 300, 300), RasanMoves.placeholder.photo(4, 400, 300)].map(function (c) { return c.toDataURL(); });
items.push(K.sticker(stage, { src: imgs[0], w: 200, x: 90, y: 80, rotate: -8 }));
items.push(K.sticker(stage, { src: imgs[1], w: 220, x: 640, y: 60, rotate: 7 }));
items.push(K.sticker(stage, { src: imgs[2], w: 260, x: 330, y: 280, rotate: -3 }));
items.push(K.sticker(stage, { text: "NEW!", font: "900 90px Impact, sans-serif", color: "#ff3b6b", w: 220, x: 560, y: 300, rotate: 6 }));
items.push(K.sticker(stage, { text: "WOW", font: "900 80px Impact, sans-serif", color: "#2f6bff", w: 190, x: 120, y: 360, rotate: -9 }));
stage.style.background = "#f4efe4";
var layout = K.scrapbook(stage, items, { seed: 4, area: [60, 40, 840, 460], tape: 3 });
K.slapAll(tl, layout.items, { at: 0.4, every: 0.28 });
K.boil(tl, layout.items, { at: 0, duration: 5, fps: 8 });
` }));

  // ---- RasanTypeOnly: one demo per function
  const typeOnly = (id, title, body) => demo({ id: "rasan-type-only-" + id, title: "Kit: RasanTypeOnly." + title, fn: "RasanTypeOnly." + title, scripts: [moves, rt("rasan-type-only.js")], dur: 5, code: `stage.style.background = "#111"; stage.style.color = "#fff"; stage.style.font = "800 90px Inter, system-ui, sans-serif";\n${body}` });
  out.push(typeOnly("wordPerShot", "wordPerShot", `var e = RasanTypeOnly.wordPerShot(tl, stage, ["SHIP", "IT", "TODAY", "FOR REAL"], { at: 0.3, per: 0.8, font: "900 200px Inter", bg: ["#111", "#ffe14d", "#ff3b30", "#2f6bff"], ink: ["#fff", "#111", "#fff", "#fff"], fill: 0.86 });\nvar __result = { end: e };`));
  out.push(typeOnly("crop", "crop", `var h = document.createElement("div"); h.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 380px Inter,sans-serif;white-space:nowrap"; h.textContent = "BIG"; stage.appendChild(h);\nvar e = RasanTypeOnly.crop(tl, h, { at: 0.5, duration: 3, from: 1.0, to: 2.6, focus: [0.15, 0.5] });\nvar __result = { end: e };`));
  out.push(typeOnly("swap", "swap", `var line = document.createElement("div"); line.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:24px;font:800 110px Inter,sans-serif;white-space:nowrap"; line.innerHTML = '<span>Built to be</span><span id="slot" style="color:#ffe14d">fast</span>'; stage.appendChild(line);\nvar e = RasanTypeOnly.swap(tl, document.getElementById("slot"), ["fast", "safe", "yours"], { at: 0.4, every: 1.2 });\nvar __result = { end: e };`));
  out.push(typeOnly("drum", "drum", `var host = document.createElement("div"); host.style.cssText = "position:absolute;left:180px;top:0;width:600px;height:540px"; stage.appendChild(host);\nvar e = RasanTypeOnly.drum(tl, host, ["design", "build", "ship", "learn", "repeat"], { at: 0.3, every: 0.7, rows: 5, font: "800 84px Inter", ink: "#fff" });\nvar __result = { end: e };`));
  out.push(typeOnly("ladder", "ladder", `var e = RasanTypeOnly.ladder(tl, stage, ["We make it.", "We make it fast.", "We make it fast for you.", "We make it fast for you, always."], { at: 0.3, every: 1.1, font: "800 50px Inter" });\nvar __result = { end: e };`));

  // ---- Three.js recipes (Rasan3D stage; scripts load the recipe common + the recipe)
  const rec = (id, title, opts, extra = {}) => demo({
    id: "stage3d-" + id, title: "Kit: stage3d recipe " + id, fn: "RasanRecipes." + id,
    scripts: [moves, R3("rasan3d.js"), R3("recipes/common.js"), R3("recipes/" + id + ".js")],
    body: '<canvas id="gl" style="position:absolute;inset:0;width:100%;height:100%"></canvas>', dur: extra.dur, assets: extra.assets,
    code: `
var R = RasanRecipes.get("${id}"), OPTS = ${JSON.stringify(opts)}, rec;
Rasan3D.stage({ id: "demo", canvas: document.getElementById("gl"), timeline: tl, duration: R.plan(OPTS).duration, width: 960, height: 540, fps: 30, pixelRatio: 1,
  camera: R.camera(OPTS), motionBlur: { shutter: 0.5 }, environment: "studio", toneMapping: "neutral", background: "#10131c",
  build: async function (k) { rec = await R.build(k, OPTS); return rec.objects; }, pose: function (t, k) { rec.pose(t, k); } });
window.__dur = R.plan(OPTS).duration;
` });
  out.push(rec("voxel-diorama", "Voxel diorama", { durationS: 5, grid: 16, maxHeight: 6, riseS: 2 }, { dur: 5 }));
  out.push(rec("clay-toy", "Clay toy", { durationS: 5, count: 4 }, { dur: 5 }));
  out.push(rec("icon-portal-through", "Icon portal through", { durationS: 3.2, iconSvg: "icon.svg", nextFrame: "next.svg", nextColor: "#2f6bff", width: 960, height: 540 }, {
    dur: 3.2,
    assets: {
      "icon.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M50 4 A46 46 0 1 1 49.9 4 Z M50 28 A22 22 0 1 0 50.1 28 Z" fill="#ff5a36"/></svg>',
      "next.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><circle cx="960" cy="540" r="260" fill="#fff" opacity=".9"/></svg>',
    },
  }));

  // ---- medium scene kits (createXScene({root, width, height, content}) -> setTime(t)), driven by one proxy tween on the timeline
  const ex = (rel) => fs.readFileSync(path.join(SKILL_DIR, "library", "medium-examples", rel), "utf8");
  const drive = (D) => `
var __sc = 0.5, holder = document.createElement("div"); holder.style.cssText = "position:absolute;left:0;top:0;width:1920px;height:1080px;transform:scale(0.5);transform-origin:0 0;background:#f4f1ea"; stage.appendChild(holder);
var scene = MOUNT;
var __o = {}, __v = 0; Object.defineProperty(__o, "p", { get: function () { return __v; }, set: function (x) { __v = x; if (__rdy) scene.setTime(x * ${D}); }, enumerable: true });
tl.fromTo(__o, { p: 0 }, { p: 1, duration: ${D}, ease: "none", immediateRender: true }, 0);
var __rdy = false; window.__extraReady = scene.ready.then(function () { __rdy = true; scene.setTime(__v * ${D}); }); window.__dur = ${D} + 0.4;`;
  const jsScene = (id, title, fn, mod, rel, D) => demo({ id, title: "Kit: " + title, fn, scripts: [moves, rt("medium-surface.js"), rt(mod)], dur: D + 0.4,
    code: `var module = { exports: {} }; (function () {\n${ex(rel)}\n})();` + drive(D).replace("MOUNT", "module.exports.mount(holder, {})") });
  out.push(jsScene("medium-flat-vector", "RasanMediumGraphic.createFlatVectorScene", "RasanMediumGraphic", "medium-graphic.js", "flat-vector-native/positive-three-into-one.js", 5));
  out.push(jsScene("medium-line-drawing", "RasanMediumGraphic.createLineDrawingScene", "RasanMediumGraphic", "medium-graphic.js", "line-drawing-native/positive-line-reveals-relation.js", 5));
  out.push(jsScene("medium-evidence-diagram", "RasanMediumGraphic.createEvidenceDiagramScene", "RasanMediumGraphic", "medium-graphic.js", "evidence-diagram/positive-overlap-sets.js", 5));
  out.push(jsScene("medium-paper-collage", "RasanMediumPaper.createPaperCollageScene", "RasanMediumPaper", "medium-paper.js", "paper-collage-native/positive-two-strips.js", 5));
  const iso = JSON.parse(ex("isometric-system/positive-inputs-to-result.example.json"));
  out.push(demo({ id: "medium-isometric", title: "Kit: MediumIsometric.createMediumScene", fn: "MediumIsometric", scripts: [moves, rt("medium-isometric.js")], dur: 7,
    code: "var ARGS = " + JSON.stringify(iso.createMediumScene_args) + "; ARGS.eventBindings = ARGS.eventBindings || " + JSON.stringify(iso.eventBindings_example) + ";" + drive(6.6).replace("MOUNT", "MediumIsometric.createMediumScene(Object.assign({ root: holder, width: 1920, height: 1080 }, ARGS))") }));
  return out;
}
