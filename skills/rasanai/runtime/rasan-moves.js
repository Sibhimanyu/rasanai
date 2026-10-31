/* RasanMoves: the 41 library moves (library/moves/*.json) as code. Original code, RasanAI MIT.
 *
 * One function per move. Each one BUILDS its own DOM / canvas inside `target` (a stage element or selector) and adds its tweens to YOUR paused
 * GSAP timeline at a position, then returns { end, el, ... } so calls chain. Adapt the params, do not rewrite the move:
 *
 *   var tl = gsap.timeline({ paused: true });
 *   RasanMoves.dotFieldResolve(tl, 0.4, { target: stage, image: photoCanvasOrImgOrUrl, cell: 28 });
 *   RasanMoves.blurBloomWord(tl, 3.2, { target: stage2, word: "Why?", accent: "#ff4d2e" });
 *   RasanMoves.list()                     // [{ id, n, fn, duration, ease, params }]
 *   RasanMoves.ready()                    // Promise: pictures + WebGL kits loaded; wait for it before capture (window.__movesReady)
 *
 * Seek-safety (HyperFrames renders by seeking a paused timeline): DOM and canvases are built once at call time; every state after that is a
 * tween on `tl`, or a canvas/DOM write inside a tween setter that is a PURE function of the tween's progress. No Math.random (seeded hashes),
 * no clock, no rAF, no timers. Seek to 3 s then 1 s then 3 s again and the pixels are the same.
 *
 * Conventions: every function is (tl, at, opts). `opts.target` is the container (it gets position:relative when static; sizes come from its
 * clientWidth/Height, so a 960x540 and a 1920x1080 stage both work; px values scale with height/1080). `opts.duration` overrides the move's
 * default length; `opts.ease` its default easing; `opts.ink`, `opts.bg`, `opts.accent`, `opts.font`, `opts.seed` restyle it. Pictures
 * (`image`, `images`, `from`, `to`...) take an <img>, a <canvas> or a URL. Default content is neutral placeholder text and RasanMoves.placeholder.*
 * pictures, so any call with only { target } renders something sensible.
 * Runtimes used where a recipe names them: RasanImageFX (dotFieldResolve, tornEdgeWipe, pixelSquareWipe via clip paths, mockup pin is CSS 3D),
 * Rasan3D (voxelDisintegrateReform). Load order: gsap, [rasan-image-fx.js], [rasan-moves.js].
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api; else root.RasanMoves = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";
  var VERSION = "1.0.0";
  var FONT = "Inter, 'Helvetica Neue', system-ui, -apple-system, sans-serif";
  var PAL = ["#ff5a36", "#2f6bff", "#ffd23f", "#19c37d", "#a855f7", "#14b8d4"];
  var PENDING = [];
  var DEF = {}, META = [], BYID = {};

  // ---------------------------------------------------------------- helpers
  function need(c, m) { if (!c) throw new Error("RasanMoves: " + m); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hash(a, b, c) { var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function rn(seed, i, j) { return hash(seed | 0, i | 0, (j | 0) + 17); }
  function R(x) { return typeof x === "string" ? document.querySelector(x) : x; }
  function mk(tag, css, parent, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
  function svg(html, css, parent) { var d = mk("div", css, parent); d.innerHTML = html; return d; }
  function setup(o) {
    var c = R(o.target); need(c, "pass opts.target (the stage element or a selector)");
    if (getComputedStyle(c).position === "static") c.style.position = "relative";
    var W = c.clientWidth || 1920, H = c.clientHeight || 1080;
    return { c: c, W: W, H: H, u: H / 1080 };
  }
  function layer(c, css) { return mk("div", "position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;" + (css || ""), c); }
  function O(id, o) { var d = DEF[id], r = {}, k; for (k in d) r[k] = d[k]; for (k in (o || {})) if (o[k] !== undefined) r[k] = o[k]; return r; }
  function dur(o) { return Math.max(0.05, +o.duration || 1); }
  // a tween of progress 0..1 whose setter (and its first draw) is a pure function of p
  function prog(tl, at, d, ease, fn) {
    need(tl && typeof tl.fromTo === "function", "pass a GSAP timeline as the first argument");
    var o = {}, v = 0;
    Object.defineProperty(o, "p", { get: function () { return v; }, set: function (x) { v = x; fn(x); }, enumerable: true });
    tl.fromTo(o, { p: 0 }, { p: 1, duration: Math.max(1e-4, d), ease: ease || "none", immediateRender: true }, at);
    return o;
  }
  function ez(name) { return gsap.parseEase(name || "none"); }
  function px(n) { return Math.round(n * 100) / 100 + "px"; }
  function ink(o) { return o.ink || "#f5f2ea"; }
  // pictures: <img> | <canvas> | url -> a drawable that is complete (or will be; `whenImg` calls back on load)
  function pic(x) {
    if (!x) return null;
    if (typeof x === "string") { var im = new Image(); im.crossOrigin = "anonymous"; var pr = new Promise(function (res) { im.onload = res; im.onerror = res; }); PENDING.push(pr); im.src = x; return im; }
    if (x.tagName === "IMG" && !x.complete) PENDING.push(new Promise(function (res) { x.addEventListener("load", res); x.addEventListener("error", res); }));
    return x;
  }
  function whenImg(im, fn) { if (!im) return; if (im.tagName === "IMG" && !(im.complete && im.naturalWidth)) im.addEventListener("load", fn); else fn(); }
  function iw(im) { return im.naturalWidth || im.width || 1; }
  function ih(im) { return im.naturalHeight || im.height || 1; }
  // draw a picture cover-fitted into (x,y,w,h)
  function cover(g, im, x, y, w, h, zoom, fx, fy) {
    var s = Math.max(w / iw(im), h / ih(im)) * (zoom || 1), sw = w / s, sh = h / s, sx = (iw(im) - sw) * (fx == null ? 0.5 : fx), sy = (ih(im) - sh) * (fy == null ? 0.5 : fy);
    g.drawImage(im, sx, sy, sw, sh, x, y, w, h);
  }
  // an element showing a picture, cover-fitted (canvases are copied so the original stays untouched)
  function picEl(im, css, parent) {
    var e;
    if (im && im.tagName === "CANVAS") { e = mk("canvas", css, parent); e.width = im.width; e.height = im.height; e.getContext("2d").drawImage(im, 0, 0); e.style.objectFit = "cover"; }
    else if (im) { e = mk("img", css, parent); e.src = im.src; e.style.objectFit = "cover"; e.alt = ""; if (im.tagName === "IMG" && !im.complete) PENDING.push(new Promise(function (res) { e.onload = res; e.onerror = res; })); }
    else e = mk("div", css, parent);
    return e;
  }
  function toURL(im) { return im.tagName === "CANVAS" ? im.toDataURL("image/png") : im.src; }
  function face(o, i, w, h) { // a card face: the i-th picture, else a gradient tile in the palette
    var ims = o.images, cols = o.colors || PAL;
    if (ims && ims.length) return pic(ims[i % ims.length]);
    return PH.photo(i + 1 + (o.seed | 0), Math.round(w), Math.round(h), cols);
  }

  // ---------------------------------------------------------------- placeholders (procedural pictures, no files)
  var PH = {
    // a colourful landscape-ish picture with enough structure to read when it resolves
    photo: function (seed, w, h, cols) {
      cols = cols || PAL; w = w || 960; h = h || 540; seed = seed | 0;
      var c = document.createElement("canvas"); c.width = w; c.height = h; var g = c.getContext("2d");
      var a = cols[seed % cols.length], b = cols[(seed + 2) % cols.length], d = cols[(seed + 4) % cols.length];
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, a); gr.addColorStop(0.62, b); gr.addColorStop(1, "#101424"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(w * (0.25 + rn(seed, 1, 1) * 0.5), h * 0.3, h * 0.13, 0, 6.283); g.fill();
      for (var k = 0; k < 3; k++) { g.fillStyle = k === 0 ? "rgba(16,20,36,.55)" : k === 1 ? "rgba(16,20,36,.75)" : "rgba(10,12,24,.95)"; g.beginPath(); g.moveTo(0, h);
        for (var x = 0; x <= w; x += w / 24) g.lineTo(x, h * (0.62 + k * 0.1) - Math.sin(x / w * (3 + k) + seed + k) * h * 0.09 - rn(seed, x | 0, k) * h * 0.02); g.lineTo(w, h); g.fill(); }
      g.fillStyle = d; for (var j = 0; j < 7; j++) { g.beginPath(); g.arc(w * rn(seed, j, 5), h * (0.72 + rn(seed, j, 6) * 0.22), h * (0.025 + rn(seed, j, 7) * 0.03), 0, 6.283); g.fill(); }
      return c;
    },
    // a poster-like art board: bold shapes on a flat colour
    art: function (seed, w, h, cols) {
      cols = cols || PAL; w = w || 800; h = h || 1000; seed = seed | 0;
      var c = document.createElement("canvas"); c.width = w; c.height = h; var g = c.getContext("2d");
      g.fillStyle = cols[seed % cols.length]; g.fillRect(0, 0, w, h);
      g.fillStyle = cols[(seed + 1) % cols.length]; g.beginPath(); g.arc(w * 0.62, h * 0.38, w * 0.3, 0, 6.283); g.fill();
      g.fillStyle = cols[(seed + 3) % cols.length]; g.fillRect(w * 0.1, h * 0.62, w * 0.5, h * 0.12);
      g.fillStyle = "#fff"; g.beginPath(); g.moveTo(w * 0.1, h * 0.9); g.lineTo(w * 0.5, h * 0.78); g.lineTo(w * 0.9, h * 0.9); g.closePath(); g.fill();
      g.fillStyle = "#111"; g.beginPath(); g.arc(w * 0.62, h * 0.38, w * 0.07, 0, 6.283); g.fill();
      return c;
    },
    // a head-and-shoulders silhouette with a transparent background (a cut-out)
    cutout: function (seed, w, h) {
      w = w || 600; h = h || 800; var c = document.createElement("canvas"); c.width = w; c.height = h; var g = c.getContext("2d");
      g.fillStyle = "#3a3f55"; g.beginPath(); g.arc(w / 2, h * 0.3, w * 0.2, 0, 6.283); g.fill();
      g.beginPath(); g.moveTo(w * 0.1, h); g.quadraticCurveTo(w * 0.12, h * 0.55, w / 2, h * 0.55); g.quadraticCurveTo(w * 0.88, h * 0.55, w * 0.9, h); g.closePath(); g.fill();
      return c;
    },
    // flat layers for a parallax world, far to near: sky, hills, flowers (each transparent where empty)
    landscape: function (w, h) {
      w = w || 1920; h = h || 1080; var out = [], c, g, i;
      c = document.createElement("canvas"); c.width = w; c.height = h; g = c.getContext("2d"); var s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, "#7fb3ff"); s.addColorStop(0.7, "#ffd9b0"); s.addColorStop(1, "#ffb7a0"); g.fillStyle = s; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,.85)"; for (i = 0; i < 5; i++) { g.beginPath(); g.ellipse(w * (0.1 + i * 0.2), h * (0.15 + (i % 2) * 0.1), w * 0.07, h * 0.035, 0, 0, 6.283); g.fill(); } out.push(c);
      c = document.createElement("canvas"); c.width = w; c.height = h; g = c.getContext("2d"); g.fillStyle = "#6a8fd8"; g.beginPath(); g.moveTo(0, h); for (i = 0; i <= 20; i++) g.lineTo(w * i / 20, h * 0.62 - Math.sin(i * 0.7) * h * 0.08); g.lineTo(w, h); g.fill(); out.push(c);
      c = document.createElement("canvas"); c.width = w; c.height = h; g = c.getContext("2d"); g.fillStyle = "#3f9a6b"; g.beginPath(); g.moveTo(0, h); for (i = 0; i <= 20; i++) g.lineTo(w * i / 20, h * 0.78 - Math.sin(i * 0.5 + 2) * h * 0.06); g.lineTo(w, h); g.fill();
      for (i = 0; i < 40; i++) { g.fillStyle = PAL[i % PAL.length]; g.beginPath(); g.arc(w * rn(3, i, 1), h * (0.82 + rn(3, i, 2) * 0.16), h * (0.012 + rn(3, i, 3) * 0.015), 0, 6.283); g.fill(); } out.push(c);
      return out;
    },
  };
  // a small icon set (24x24 viewBox, currentColor): the placeholder for "an icon"
  var ICONS = {
    star: '<path d="M12 2l3 7 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.8l1.8-7.3L1.5 9.6 9 9z" fill="currentColor"/>',
    heart: '<path d="M12 21s-8-5.3-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.7-8 11-8 11z" fill="currentColor"/>',
    bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    plane: '<path d="M2 12l20-9-6 18-4-7z" fill="currentColor"/>',
    check: '<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
    circle: '<circle cx="12" cy="12" r="9" fill="currentColor"/>',
    square: '<rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor"/>',
    wave: '<path d="M2 12h3l2-6 3 12 3-16 3 12 2-4h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0014 0M12 18v4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    doc: '<path d="M6 2h8l5 5v15H6z" fill="currentColor"/>',
    scissors: '<circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 7.5L21 19M8.5 16.5L21 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  };
  function icon(name, size, color, parent, css) {
    var h = ICONS[name] || name || ICONS.star; // a known name, else treat the string as svg inner markup
    var s = (typeof h === "string" && h.indexOf("<svg") === 0) ? h : '<svg viewBox="0 0 24 24" width="100%" height="100%">' + h + "</svg>";
    return svg(s, "width:" + px(size) + ";height:" + px(size) + ";color:" + (color || "currentColor") + ";" + (css || ""), parent);
  }
  function mixHex(a, b, t) { var pa = hexRgb(a), pb = hexRgb(b); return "rgb(" + Math.round(lerp(pa[0], pb[0], t)) + "," + Math.round(lerp(pa[1], pb[1], t)) + "," + Math.round(lerp(pa[2], pb[2], t)) + ")"; }
  function hexRgb(c) { c = String(c); if (c.charAt(0) !== "#") { var m = /(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; } var h = c.replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function fitText(el, boxW, fill, maxPx) { el.style.whiteSpace = "nowrap"; var px0 = parseFloat(getComputedStyle(el).fontSize) || 100, w = el.scrollWidth || 1; var f = Math.min(maxPx || 1e5, px0 * (boxW * fill) / w); el.style.fontSize = f + "px"; return f; }
  function textLine(parent, text, o) { return mk("div", "white-space:nowrap;font:" + (o.weight || 800) + " " + px(o.size) + "/1.05 " + (o.family || FONT) + ";color:" + (o.color || "#fff") + ";letter-spacing:" + (o.ls || "-0.02em") + ";" + (o.css || ""), parent, text); }
  function def(id, n, fnName, fn, defaults, params, example, ex) {
    DEF[id] = defaults; var meta = { id: id, n: n, fn: fnName, params: params, example: example }; META.push(meta); BYID[id] = meta; API[fnName] = fn;
  }
  var API = { version: VERSION, placeholder: PH, icons: ICONS, icon: icon };

  // ================================================================= 1 flank-frame-hold
  def("flank-frame-hold", 1, "flankFrameHold", function (tl, at, o) {
    o = O("flank-frame-hold", o); var S = setup(o), u = S.u, d = dur(o), c = S.c;
    var root = layer(c, "display:flex;align-items:center;justify-content:center;background:" + (o.bg || "transparent") + ";gap:" + px(90 * u));
    var col = function (word, line2, align) { var e = mk("div", "display:flex;flex-direction:column;gap:" + px(14 * u) + ";width:" + px(S.W * 0.22) + ";text-align:" + align + ";color:" + ink(o) + ";font:700 " + px(58 * u) + "/1.15 " + (o.font || FONT), root); var a = mk("div", "", e, word), b = mk("div", "font-weight:400;opacity:.0", e, line2); b.style.fontSize = px(34 * u); return { e: e, a: a, b: b }; };
    var L = col(o.left, o.leftLine, "right");
    var hero = mk("div", "width:" + px(o.heroW * u) + ";height:" + px(o.heroH * u) + ";overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.35);flex:none", root);
    if (o.image) picEl(pic(o.image), "width:100%;height:100%;display:block", hero); else hero.style.background = "linear-gradient(135deg," + PAL[0] + "," + PAL[1] + ")";
    var Rr = col(o.right, o.rightLine, "left");
    tl.fromTo([L.a, Rr.a], { y: 12 * u, opacity: 0 }, { y: 0, opacity: 1, duration: d * 0.35, ease: o.ease, stagger: 0.08 }, at + d * 0.1);
    tl.fromTo(hero, { borderRadius: "50%", scale: 0.86 }, { borderRadius: px(36 * u), scale: 1, duration: d * 0.6, ease: o.ease }, at);
    tl.fromTo([L.b, Rr.b], { y: 12 * u, opacity: 0 }, { y: 0, opacity: 0.8, duration: d * 0.3, ease: o.ease, stagger: 0.1 }, at + d * 0.6);
    return { end: at + d, el: root };
  }, { duration: 2, ease: "power2.out", left: "Today", right: "Only", leftLine: "No pitch.", rightLine: "Nothing else.", heroW: 460, heroH: 560, image: null, ink: null, bg: null, font: null },
    { left: "word at the left", right: "word at the right", leftLine: "second line that joins later", rightLine: "second line (right)", image: "hero picture", heroW: "px at 1080p", heroH: "px at 1080p" },
    "RasanMoves.flankFrameHold(tl, 0.3, { target: stage, left: 'Today', right: 'Only', image: photo });");

  // ================================================================= 2 blur-bloom-word
  def("blur-bloom-word", 2, "blurBloomWord", function (tl, at, o) {
    o = O("blur-bloom-word", o); var S = setup(o), u = S.u, d = dur(o);
    var root = layer(S.c, "display:flex;align-items:center;justify-content:center;background:" + (o.bg || "transparent"));
    var glow = mk("div", "position:absolute;width:" + px(S.H * 0.9) + ";height:" + px(S.H * 0.9) + ";border-radius:50%;background:radial-gradient(circle," + o.glow + " 0%," + o.glow + "88 38%,transparent 70%);filter:blur(" + px(60 * u) + ")", root);
    var w = mk("div", "position:relative;font:800 " + px(o.size * u) + "/1 " + (o.font || FONT) + ";color:" + o.accent + ";white-space:nowrap", root, o.word);
    tl.fromTo(glow, { scale: 1.4, opacity: 0 }, { scale: 1, opacity: 1, duration: d, ease: o.ease }, at);
    tl.fromTo(w, { filter: "blur(" + px(14 * u) + ")", letterSpacing: "0.14em", opacity: 0 }, { filter: "blur(0px)", letterSpacing: "-0.02em", opacity: 1, duration: d * 0.85, ease: o.ease }, at + d * 0.1);
    return { end: at + d, el: root, word: w };
  }, { duration: 1.7, ease: "power3.out", word: "Why?", size: 300, glow: "#ff7a3d", accent: "#ff5a36", bg: null, font: null },
    { word: "the word", glow: "glow colour", accent: "the only accent in the film", size: "px at 1080p" },
    "RasanMoves.blurBloomWord(tl, 0.4, { target: stage, word: 'Why?', accent: '#ff5a36' });");

  // ================================================================= 3 in-place-word-swap
  def("in-place-word-swap", 3, "inPlaceWordSwap", function (tl, at, o) {
    o = O("in-place-word-swap", o); var S = setup(o), u = S.u, every = o.every, words = o.words, n = words.length, d = every * (n - 1) + 0.35;
    var root = layer(S.c, "display:flex;align-items:center;justify-content:center;background:" + (o.bg || "transparent") + ";overflow:visible");
    var line = mk("div", "display:flex;align-items:center;gap:0.3em;font:700 " + px(o.size * u) + "/1.15 " + (o.font || FONT) + ";color:" + ink(o), root);
    if (o.prefix) mk("span", "white-space:pre", line, o.prefix);
    var box = mk("span", "position:relative;display:inline-block;overflow:hidden;vertical-align:bottom;color:" + o.accent, line);
    var spans = words.map(function (w, i) { var s = mk("span", (i === 0 ? "display:block;" : "position:absolute;left:0;top:0;display:block;") + "white-space:nowrap", box, w); return s; });
    var widths = spans.map(function (s) { return s.offsetWidth; }); box.style.width = widths[0] + "px"; box.style.height = spans[0].offsetHeight + "px"; spans.forEach(function (s, i) { if (i) gsap.set(s, { yPercent: 100 }); });
    if (o.suffix) mk("span", "white-space:pre", line, o.suffix);
    for (var i = 1; i < n; i++) { var t = at + 0.2 + (i - 1) * every; tl.to(spans[i - 1], { yPercent: -100, duration: 0.35, ease: o.ease }, t).fromTo(spans[i], { yPercent: 100 }, { yPercent: 0, duration: 0.35, ease: o.ease }, t).to(box, { width: widths[i], duration: 0.35, ease: o.ease }, t); }
    return { end: at + d, el: root };
  }, { duration: null, every: 0.9, ease: "power3.out", words: ["fast", "safe", "yours"], prefix: "Built to be", suffix: "", size: 150, accent: "#ff5a36", ink: null, bg: null, font: null },
    { words: "the swapped word list (the first is shown at rest)", every: "seconds between swaps", prefix: "static text before", suffix: "static text after" },
    "RasanMoves.inPlaceWordSwap(tl, 0.3, { target: stage, prefix: 'Built to be', words: ['fast', 'safe', 'yours'] });");

  // ================================================================= 4 word-per-shot-sentence
  def("word-per-shot-sentence", 4, "wordPerShotSentence", function (tl, at, o) {
    o = O("word-per-shot-sentence", o); var S = setup(o), u = S.u, words = o.words, n = words.length, per = o.per, d = per * n + 0.4;
    var root = layer(S.c, "background:" + (o.bg || "#0d0f14"));
    if (o.image) { var im = picEl(pic(o.image), "position:absolute;inset:0;width:100%;height:100%;opacity:.55", root); }
    mk("div", "position:absolute;inset:0;background:rgba(8,10,16,.42)", root);
    var row = mk("div", "position:absolute;left:50%;top:50%;display:flex;gap:0.28em;white-space:nowrap;font:700 " + px(o.size * u) + "/1 " + (o.font || FONT) + ";color:" + ink(o) + ";transform:translate(-50%,-50%)", root);
    var sp = words.map(function (w, i) { return mk("span", "display:inline-block" + (i === o.italicIndex ? ";font-style:italic;font-weight:400;color:" + o.accent : ""), row, w); });
    var total = row.scrollWidth, acc = 0, ws = sp.map(function (s) { return s.offsetWidth; }), gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    row.style.left = "50%"; gsap.set(row, { xPercent: -50, yPercent: -50 });
    var cum = []; ws.forEach(function (w, i) { acc += w + (i ? gap : 0); cum.push(acc); });
    // the row is as wide as the final sentence; shift it so the words shown so far stay centred
    gsap.set(row, { x: (total - cum[0]) / 2 });
    sp.forEach(function (s, i) {
      var t = at + i * per; tl.fromTo(s, { opacity: 0, y: 24 * u }, { opacity: 1, y: 0, duration: per * 0.8, ease: o.ease }, t);
      tl.to(row, { x: (total - cum[i]) / 2, duration: per * 0.8, ease: o.ease }, t); if (i < n - 1) { /* next word shifts further */ }
    });
    tl.to(row, { x: 0, duration: 0.01 }, at + (n - 1) * per + per * 0.8); // settled: fully centred
    return { end: at + d, el: root };
  }, { duration: null, per: 0.28, ease: "power2.out", words: ["Make", "it", "feel", "like", "you"], italicIndex: 4, size: 130, accent: "#ffb84d", image: null, ink: null, bg: null, font: null },
    { words: "the sentence, one word per beat", per: "seconds per word (0.12 to 0.3)", italicIndex: "which word is italic", image: "optional still under a scrim" },
    "RasanMoves.wordPerShotSentence(tl, 0.2, { target: stage, words: ['Make','it','feel','like','you'], italicIndex: 4, image: photo });");

  // ================================================================= 5 inline-glyph-slot
  def("inline-glyph-slot", 5, "inlineGlyphSlot", function (tl, at, o) {
    o = O("inline-glyph-slot", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H;
    var root = layer(S.c, "display:flex;align-items:center;justify-content:center;background:" + (o.bg || "transparent") + ";overflow:visible");
    var size = o.size * u, tile = size * 1.05;
    var line = mk("div", "display:flex;align-items:center;font:700 " + px(size) + "/1.2 " + (o.font || FONT) + ";color:" + ink(o) + ";white-space:pre", root);
    mk("span", "", line, o.before + " ");
    var slot = mk("span", "display:inline-block;width:0;height:" + px(tile) + ";position:relative;flex:none", line);
    var tileEl = mk("div", "position:absolute;left:0;top:0;width:" + px(tile) + ";height:" + px(tile) + ";border-radius:" + px(tile * 0.26) + ";background:" + o.color + ";color:#fff;display:flex;align-items:center;justify-content:center", slot);
    icon(o.icon, tile * 0.56, "#fff", tileEl);
    mk("span", "", line, " " + o.after);
    var gap = tile + size * 0.3;
    tl.to(slot, { width: gap, duration: d * 0.5, ease: "power3.out" }, at);
    tl.fromTo(tileEl, { scale: 0 }, { scale: 1, duration: d * 0.55, ease: o.ease, transformOrigin: "50% 50%" }, at);
    var endT = at + d;
    if (o.fill) { // later it scales to fill the frame and becomes the next scene
      var rc = tileEl.getBoundingClientRect(), pr = S.c.getBoundingClientRect(), sc = pr.width ? W / pr.width : 1;
      var fl = mk("div", "position:absolute;left:" + px((rc.left - pr.left) * sc) + ";top:" + px((rc.top - pr.top) * sc) + ";width:" + px(rc.width * sc) + ";height:" + px(rc.height * sc) + ";border-radius:" + px(tile * 0.26) + ";background:" + o.color + ";opacity:0;z-index:5", root);
      var t0 = at + d + o.fillAfter;
      tl.set(fl, { opacity: 1 }, t0).set(tileEl, { opacity: 0 }, t0);
      tl.to(fl, { left: 0, top: 0, width: W, height: H, borderRadius: 0, duration: o.fillDuration, ease: "power3.inOut" }, t0);
      endT = t0 + o.fillDuration;
    }
    return { end: endT, el: root, tile: tileEl };
  }, { duration: 0.9, ease: "back.out(1.6)", before: "Send it", after: "to the team", icon: "plane", color: "#2f6bff", size: 120, fill: true, fillAfter: 0.6, fillDuration: 0.7, ink: null, bg: null, font: null },
    { before: "text before the tile", after: "text after", icon: "icon name or svg markup", fill: "scale to fill the frame afterwards", fillAfter: "hold before the fill (s)" },
    "RasanMoves.inlineGlyphSlot(tl, 0.3, { target: stage, before: 'Send it', after: 'to the team', icon: 'plane', fill: true });");

  // ================================================================= 6 full-frame-type-crop
  def("full-frame-type-crop", 6, "fullFrameTypeCrop", function (tl, at, o) {
    o = O("full-frame-type-crop", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H;
    var root = layer(S.c, "background:" + (o.bg || "#101114"));
    var el = mk("div", "position:absolute;left:0;top:50%;white-space:nowrap;font:900 " + px(H * o.size) + "/1 " + (o.font || FONT) + ";letter-spacing:-0.04em;color:" + ink(o), root, o.word);
    var fs = H * o.size, w0 = el.scrollWidth; if (w0 < W * 1.6) { fs = fs * (W * 1.6) / w0; el.style.fontSize = fs + "px"; } var w = el.scrollWidth;
    var e = ez(o.ease), x0 = W * 0.5 - w * (0.5 + o.from), x1 = W * 0.5 - w * (0.5 + o.to), delta = x1 - x0, h = 0.002;
    prog(tl, at, d, "none", function (p) {
      var q = e(p), v = p <= 0 || p >= 1 ? 0 : Math.abs((e(Math.min(1, p + h)) - e(Math.max(0, p - h))) / (2 * h)) * Math.abs(delta) / d; // px per second
      el.style.transform = "translate(" + (x0 + delta * q).toFixed(2) + "px,-50%) skewX(" + (-clamp(v / 2500, 0, 1) * o.skew).toFixed(3) + "deg)";
      el.style.filter = "blur(" + (v * o.blur).toFixed(3) + "px)";
    });
    return { end: at + d, el: root, word: el };
  }, { duration: 1.2, ease: "power2.in", word: "NEVER STOP", size: 0.38, from: 0, to: -0.3, blur: 0.006, skew: 8, ink: null, bg: null, font: null },
    { word: "the cropped word", size: "font size as a share of the frame height", from: "start offset (share of the word width)", to: "end offset", blur: "px of blur per px/s of speed", skew: "max skewX degrees" },
    "RasanMoves.fullFrameTypeCrop(tl, 0.2, { target: stage, word: 'NEVER STOP' });");

  // ================================================================= 7 anaphora-ladder
  def("anaphora-ladder", 7, "anaphoraLadder", function (tl, at, o) {
    o = O("anaphora-ladder", o); var S = setup(o), u = S.u, ends = o.endings, n = ends.length, every = o.every, d = n * every, cols = o.colors || PAL;
    var root = layer(S.c, "background:" + (o.bg || "#0e1016"));
    var plates = ends.map(function (e, i) { return mk("div", "position:absolute;right:" + px(S.W * 0.08) + ";top:50%;width:" + px(S.W * 0.2) + ";height:" + px(S.W * 0.2) + ";margin-top:" + px(-S.W * 0.1) + ";border-radius:" + px(36 * u) + ";background:" + cols[i % cols.length] + ";opacity:0;display:flex;align-items:center;justify-content:center;color:#fff", root); });
    plates.forEach(function (p, i) { icon((o.icons || [])[i] || ["star", "heart", "bolt", "play", "wave"][i % 5], S.W * 0.09, "#fff", p); });
    var line = mk("div", "position:absolute;left:" + px(S.W * 0.08) + ";top:50%;transform:translateY(-50%);display:flex;gap:0.3em;font:700 " + px(o.size * u) + "/1.1 " + (o.font || FONT) + ";color:" + ink(o), root);
    mk("span", "", line, o.stem);
    var box = mk("span", "position:relative;display:inline-block;overflow:hidden;vertical-align:bottom;color:" + o.accent, line), spans = ends.map(function (w, i) { return mk("span", (i ? "position:absolute;left:0;top:0;" : "") + "display:block;white-space:nowrap", box, w); });
    var widths = spans.map(function (s) { return s.offsetWidth; }); box.style.width = widths[0] + "px"; box.style.height = spans[0].offsetHeight + "px"; spans.forEach(function (s, i) { if (i) gsap.set(s, { yPercent: 100 }); });
    var meters = ends.map(function (e, i) { return mk("div", "position:absolute;left:" + px(S.W * 0.08) + ";top:calc(50% + " + px(o.size * u * 0.75) + ");height:" + px(8 * u) + ";width:" + px(S.W * 0.3) + ";background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden;opacity:0", root); });
    var fills = meters.map(function (m) { return mk("div", "height:100%;width:100%;background:" + o.accent + ";transform-origin:0 50%;transform:scaleX(0)", m); });
    ends.forEach(function (e, i) {
      var t = at + i * every;
      if (i) { tl.to(spans[i - 1], { yPercent: -100, duration: 0.35, ease: o.ease }, t).fromTo(spans[i], { yPercent: 100 }, { yPercent: 0, duration: 0.35, ease: o.ease }, t).to(box, { width: widths[i], duration: 0.35, ease: o.ease }, t); }
      tl.fromTo(plates[i], { opacity: 0, scale: 0.86, rotation: -4 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.4, ease: o.ease }, t);
      if (i < n - 1) tl.to(plates[i], { opacity: 0, scale: 1.06, duration: 0.2, ease: "power2.in" }, t + every - 0.2);
      tl.set(meters[i], { opacity: 1 }, t).fromTo(fills[i], { scaleX: 0 }, { scaleX: 1, duration: every * 0.85, ease: "power1.out" }, t);
      if (i < n - 1) tl.set(meters[i], { opacity: 0 }, t + every);
    });
    return { end: at + d, el: root };
  }, { duration: null, every: 1.1, ease: "power3.out", stem: "Every", endings: ["idea", "launch", "story", "frame"], size: 150, accent: "#ffb84d", icons: null, colors: null, ink: null, bg: null, font: null },
    { stem: "the shared first word(s)", endings: "the changing endings (3 to 5 rungs)", every: "seconds per rung (0.8 to 1.5)", icons: "icon name per rung" },
    "RasanMoves.anaphoraLadder(tl, 0.2, { target: stage, stem: 'Every', endings: ['idea','launch','story','frame'] });");

  // ================================================================= 8 drum-list
  def("drum-list", 8, "drumList", function (tl, at, o) {
    o = O("drum-list", o); var S = setup(o), u = S.u, items = o.items, n = items.length, every = o.every, steps = o.steps == null ? n - 1 : o.steps, d = steps * every + 0.3;
    var root = layer(S.c, "background:" + (o.bg || "#0e1016"));
    var rowH = o.size * u * 1.25, cx = S.W * 0.5;
    var arrow = icon('<path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>', rowH * 0.7, o.accent, root, "position:absolute;left:" + px(cx - S.W * 0.26) + ";top:" + px(S.H / 2 - rowH * 0.35));
    var rows = items.map(function (t) { return mk("div", "position:absolute;left:" + px(cx - S.W * 0.2) + ";top:0;white-space:nowrap;font:500 " + px(o.size * u) + "/1 " + (o.font || FONT) + ";color:" + ink(o) + ";transform-origin:0 50%", root, t); });
    var e = ez(o.ease);
    prog(tl, at + 0.1, steps * every, "none", function (p) {
      var pos = e(p) * steps;
      rows.forEach(function (r, i) {
        var dd = i - pos, a = Math.abs(dd), act = a < 0.5;
        r.style.transform = "translateY(" + (S.H / 2 + dd * rowH - rowH / 2).toFixed(2) + "px) scale(" + (1 - Math.min(a, 3) * 0.06).toFixed(3) + ")";
        r.style.opacity = String(Math.max(0, 1 - a * 0.32 - (a > 2.5 ? (a - 2.5) : 0)).toFixed(3));
        r.style.filter = "blur(" + (Math.min(a, 3) * 1.4).toFixed(2) + "px)";
        r.style.color = mixHex(ink(o), o.accent, clamp(1 - a, 0, 1)); r.style.fontWeight = act ? "800" : "500";
      });
    });
    return { end: at + d, el: root };
  }, { duration: null, every: 0.6, ease: "power2.inOut", items: ["Draft", "Design", "Build", "Ship", "Learn"], steps: null, size: 110, accent: "#ff5a36", ink: null, bg: null, font: null },
    { items: "the list", every: "seconds per row", steps: "rows to travel (default all)" },
    "RasanMoves.drumList(tl, 0.2, { target: stage, items: ['Draft','Design','Build','Ship','Learn'] });");

  // ================================================================= 9 glyph-burst
  def("glyph-burst", 9, "glyphBurst", function (tl, at, o) {
    o = O("glyph-burst", o); var S = setup(o), u = S.u, d = dur(o), n = o.count, syms = o.symbols;
    var root = layer(S.c, "background:" + (o.bg || "transparent") + ";overflow:visible");
    var phrase = mk("div", "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:700 " + px(o.size * u) + "/1 " + (o.font || FONT) + ";color:" + ink(o) + ";white-space:nowrap;z-index:2", root, o.phrase);
    var els = [];
    for (var i = 0; i < n; i++) {
      var a = rn(o.seed, i, 1) * 6.283, r = (0.18 + rn(o.seed, i, 2) * 0.28) * S.H, fx = Math.cos(a) * r * 1.5, fy = Math.sin(a) * r, rot = (rn(o.seed, i, 3) - 0.5) * 120;
      var s = mk("div", "position:absolute;left:50%;top:50%;font:800 " + px((70 + rn(o.seed, i, 4) * 90) * u) + "/1 ui-monospace,Menlo,monospace;color:" + (i % 3 === 0 ? o.accent : ink(o)) + ";opacity:0", root, syms[i % syms.length]);
      gsap.set(s, { xPercent: -50, yPercent: -50 });
      tl.fromTo(s, { x: fx * 2.4, y: fy * 2.4, rotation: rot * 2, opacity: 0, scale: 0.4 }, { x: fx, y: fy, rotation: rot, opacity: 1, scale: 1, duration: d * 0.6, ease: o.ease }, at + (i / n) * d * 0.3);
      tl.to(s, { opacity: 0, scale: 0.2, duration: 0.18, ease: "power2.in" }, at + d + o.hold);
      els.push(s);
    }
    tl.fromTo(phrase, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: d * 0.4, ease: "power2.out" }, at);
        return { end: at + d + o.hold + 0.4, el: root };
  }, { duration: 1.1, ease: "back.out(1.4)", phrase: "make it weird", symbols: ["/", "<", ">", "*", "//", "{", "}", "+"], count: 12, hold: 0.5, seed: 4, size: 96, accent: "#ff5a36", ink: null, bg: null, font: null },
    { phrase: "centre phrase", symbols: "glyph list", count: "8 to 14", hold: "how long they sit before they are removed on the beat" },
    "RasanMoves.glyphBurst(tl, 0.2, { target: stage, phrase: 'make it weird', count: 12 });");

  // ================================================================= 10 scramble-to-word
  def("scramble-to-word", 10, "scrambleToWord", function (tl, at, o) {
    o = O("scramble-to-word", o); var S = setup(o), u = S.u, d = dur(o), N = o.frames, word = String(o.word), chars = o.chars;
    var root = layer(S.c, "display:flex;align-items:center;justify-content:center;background:" + (o.bg || "transparent"));
    var row = mk("div", "display:flex;font:800 " + px(o.size * u) + "/1 " + (o.font || "ui-monospace,Menlo,monospace") + ";color:" + ink(o), root);
    var ls = word.split("").map(function (ch) { var s = mk("span", "display:inline-block;text-align:center", row, ch); s.style.width = s.offsetWidth + "px"; return s; });
    prog(tl, at, d, "steps(" + N + ")", function (p) {
      var f = Math.round(p * N);
      ls.forEach(function (s, i) { var res = 2 + Math.floor(i * (N - 3) / Math.max(1, word.length - 1)); s.textContent = (word[i] === " " || f >= res) ? word[i] : chars.charAt(Math.floor(rn(o.seed, i, f) * chars.length)); s.style.color = f >= res ? ink(o) : o.accent; });
      row.style.transform = "skewX(" + (-14 * (1 - p)).toFixed(2) + "deg)"; row.style.filter = "blur(" + (6 * Math.pow(1 - p, 2)).toFixed(2) + "px)";
    });
    if (o.exit) tl.to(row, { filter: "blur(" + px(18 * u) + ")", opacity: 0, duration: 0.3, ease: "power2.in" }, at + d + o.hold);
    return { end: at + d + (o.exit ? o.hold + 0.3 : 0), el: root };
  }, { duration: 0.8, ease: "steps(8)", word: "DECODE", frames: 8, chars: "!<>-_\\/[]{}=+*^?#ABCDEFGHJKLMNPRSTUVXYZ0123456789", seed: 5, exit: false, hold: 0.6, size: 220, accent: "#ff5a36", ink: null, bg: null, font: null },
    { word: "the word", frames: "steps (6 to 10)", chars: "scramble alphabet", exit: "blur it out after the hold" },
    "RasanMoves.scrambleToWord(tl, 0.3, { target: stage, word: 'DECODE' });");

  // ================================================================= 11 dot-matrix-type
  def("dot-matrix-type", 11, "dotMatrixType", function (tl, at, o) {
    o = O("dot-matrix-type", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H, cell = Math.max(3, o.cell * u), cols = o.blocks;
    var cv = mk("canvas", "position:absolute;left:0;top:0;width:100%;height:100%;background:" + (o.bg || "#0d0e12"), S.c); cv.width = W; cv.height = H; var g = cv.getContext("2d");
    var pad = Math.round(W * 0.5), mw = W + pad * 2, mc = document.createElement("canvas"); mc.width = mw; mc.height = H; var mg = mc.getContext("2d");
    mg.fillStyle = "#fff"; mg.textAlign = "center"; mg.textBaseline = "middle"; var fs = H * o.size; mg.font = "900 " + fs + "px " + (o.font || FONT); var tw = mg.measureText(o.word).width; if (tw > W * 0.9) { fs = fs * W * 0.9 / tw; mg.font = "900 " + fs + "px " + (o.font || FONT); }
    mg.fillText(o.word, mw / 2, H * 0.52); var A = mg.getImageData(0, 0, mw, H).data, e = ez(o.ease);
    function a(x, y) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= mw || y >= H) return 0; return A[(y * mw + x) * 4 + 3] / 255; }
    function draw(p) {
      var q = e(p), off = (1 - q) * W * o.slide; g.clearRect(0, 0, W, H);
      var bl = cols.map(function (c, i) { var bw = W * 0.2, by = H * (0.3 + i * 0.16), bx = lerp(-bw - W * 0.1 * i, W + bw, clamp(q * (1 + 0.25 * i) - 0.1 * i, 0, 1.2)); return { c: c, x: bx, y: by - H * 0.1, w: bw, h: H * 0.2 }; });
      bl.forEach(function (b) { var gr = g.createLinearGradient(b.x, 0, b.x + b.w, 0); gr.addColorStop(0, b.c + "00"); gr.addColorStop(0.5, b.c + "55"); gr.addColorStop(1, b.c + "00"); g.fillStyle = gr; g.fillRect(b.x, b.y, b.w, b.h); });
      for (var y = cell / 2; y < H; y += cell) for (var x = cell / 2; x < W; x += cell) {
        var sx = x + pad - off, v = (a(sx, y) + a(sx - cell / 3, y) + a(sx + cell / 3, y) + a(sx, y - cell / 3) + a(sx, y + cell / 3)) / 5, col = o.ink || "#f5f2ea", boost = 0;
        for (var k = 0; k < bl.length; k++) { var b = bl[k]; if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { col = b.c; boost = 0.3; } }
        var r = (v * 0.5 + boost * (v > 0.05 ? 1 : 0.35)) * cell; if (r < 0.4) { if (boost) r = cell * 0.12; else r = cell * 0.05; if (!boost && v <= 0.01) { g.fillStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); continue; } }
        g.fillStyle = col; g.beginPath(); g.arc(x, y, Math.min(r, cell * 0.62), 0, 6.283); g.fill();
      }
    }
    prog(tl, at, d, "none", draw);
    return { end: at + d, el: cv };
  }, { duration: 3, ease: "linear", word: "SIGNAL", cell: 12, size: 0.42, slide: 0.45, blocks: ["#ff5a36", "#2f6bff", "#ffd23f"], ink: null, bg: null, font: null },
    { word: "the heading", cell: "dot pitch px at 1080p", slide: "how far (share of the width) the sample offset scrolls", blocks: "colours of the sliding blocks" },
    "RasanMoves.dotMatrixType(tl, 0.2, { target: stage, word: 'SIGNAL' });");

  // ================================================================= 12 colour-sweep-word
  def("colour-sweep-word", 12, "colourSweepWord", function (tl, at, o) {
    o = O("colour-sweep-word", o); var S = setup(o), u = S.u, d = dur(o);
    var root = layer(S.c, "display:flex;align-items:center;justify-content:center;background:" + (o.bg || "#fff"));
    var line = mk("div", "display:flex;align-items:baseline;gap:0.28em;font:800 " + px(o.size * u) + "/1.1 " + (o.font || FONT) + ";color:" + (o.ink || "#111"), root);
    if (o.before) mk("span", "", line, o.before);
    var word = mk("span", "display:inline-flex", line), ls = o.word.split("").map(function (ch) { return mk("span", "display:inline-block;color:transparent;-webkit-background-clip:text;background-clip:text;opacity:0", word, ch); });
    var W0 = word.offsetWidth, gradient = "linear-gradient(90deg," + o.colors.join(",") + "," + o.colors[0] + ")";
    ls.forEach(function (s) { s.style.backgroundImage = gradient; s.style.backgroundSize = (W0 * 3) + "px 100%"; s.style.webkitTextFillColor = "transparent"; });
    var offs = ls.map(function (s) { return s.offsetLeft; });
    prog(tl, at, d, o.ease, function (p) { var sh = -p * W0 * 2; ls.forEach(function (s, i) { s.style.backgroundPosition = (sh - offs[i]).toFixed(1) + "px 0"; }); });
    tl.fromTo(ls, { opacity: 0, y: 24 * u }, { opacity: 1, y: 0, duration: d * 0.35, ease: "power2.out", stagger: d * 0.08 }, at);
    return { end: at + d, el: root };
  }, { duration: 1.5, ease: "power2.inOut", before: "Meet", word: "Aurora", colors: ["#ff5a36", "#ffd23f", "#2f6bff"], size: 220, ink: null, bg: null, font: null },
    { before: "plain black text before the brand word", word: "the brand word", colors: "gradient colours (the first repeats)" },
    "RasanMoves.colourSweepWord(tl, 0.2, { target: stage, before: 'Meet', word: 'Aurora' });");

  // ================================================================= 13 icon-as-missing-letter
  def("icon-as-missing-letter", 13, "iconAsMissingLetter", function (tl, at, o) {
    o = O("icon-as-missing-letter", o); var S = setup(o), u = S.u, d = dur(o), word = o.word.split(""), blank = o.blank, size = o.size * u, cols = o.colors || PAL, icons = o.icons;
    var root = layer(S.c, "background:" + o.bg);
    var slotW = size * 0.9, gap = size * 0.12, total = word.length * slotW + (word.length - 1) * gap, x0 = (S.W - total) / 2, cy = S.H / 2;
    var cells = word.map(function (ch, i) {
      var isBlank = blank.indexOf(i) >= 0, x = x0 + i * (slotW + gap);
      var L = mk("div", "position:absolute;left:" + px(x) + ";top:" + px(cy - size * 0.6) + ";width:" + px(slotW) + ";height:" + px(size * 1.2) + ";display:flex;align-items:center;justify-content:center;font:900 " + px(size) + "/1 " + (o.font || FONT) + ";color:" + o.ink + ";opacity:" + (isBlank ? 0 : 1), root, ch);
      var ic = null; if (isBlank) ic = mk("div", "position:absolute;left:" + px(x) + ";top:" + px(cy - size * 0.5) + ";width:" + px(slotW) + ";height:" + px(size) + ";display:flex;align-items:center;justify-content:center;color:" + o.ink, root);
      return { L: L, ic: ic, x: x, blank: isBlank };
    });
    var beats = Math.max(2, Math.floor(d * 0.55 / 0.28)), per = d * 0.55 / beats, bgs = o.bgs || [o.bg, cols[0], cols[1], cols[2]], k;
    var nb = cells.filter(function (c) { return c.blank; }), icn = [];
    nb.forEach(function (c, bi) { var arr = []; for (k = 0; k < beats; k++) { var ic = icon(icons[(bi + k) % icons.length], size * 0.7, o.ink, c.ic); ic.style.position = "absolute"; ic.style.opacity = k === 0 ? 1 : 0; arr.push(ic); } icn.push(arr); });
    for (k = 1; k < beats; k++) { var t = at + k * per; icn.forEach(function (arr) { tl.set(arr[k - 1], { opacity: 0 }, t).set(arr[k], { opacity: 1 }, t); }); tl.set(root, { backgroundColor: bgs[k % bgs.length] }, t); }
    // then the letters orbit along a circle to their final slots
    var t1 = at + d * 0.6, od = d * 0.4;
    nb.forEach(function (c, bi) {
      tl.set(c.ic, { opacity: 0 }, t1);
      var a0 = (bi + 1) * 2.4, R2 = size * 1.6, dx0 = Math.cos(a0) * R2, dy0 = Math.sin(a0) * R2, st = { a: 0 };
      tl.set(c.L, { opacity: 1 }, t1);
      var pr = { p: 0 }; // orbit: angle sweeps 1.5 turns while the radius collapses to zero
      Object.defineProperty(pr, "q", { get: function () { return this.p; }, set: function (v) { this.p = v; var r = R2 * (1 - v), a = a0 + v * 6.283 * 1.25; c.L.style.transform = "translate(" + (Math.cos(a) * r).toFixed(2) + "px," + (Math.sin(a) * r).toFixed(2) + "px)"; }, enumerable: true });
      tl.fromTo(pr, { q: 0 }, { q: 1, duration: od, ease: "power2.inOut", immediateRender: true }, t1);
    });
    tl.set(root, { backgroundColor: o.bg }, t1);
    return { end: at + d, el: root };
  }, { duration: 2.2, ease: "power2.inOut", word: "EDIT", blank: [1, 3], icons: ["star", "bolt", "heart", "play"], size: 300, bg: "#16181f", ink: "#f5f2ea", bgs: null, colors: null, font: null },
    { word: "the final word", blank: "indexes shown as icon slots first", icons: "icons swapped per micro-beat", bgs: "background colour per beat" },
    "RasanMoves.iconAsMissingLetter(tl, 0.2, { target: stage, word: 'EDIT', blank: [1, 3] });");

  // ================================================================= 14 slot-line-wipe-lockup
  def("slot-line-wipe-lockup", 14, "slotLineWipeLockup", function (tl, at, o) {
    o = O("slot-line-wipe-lockup", o); var S = setup(o), u = S.u, d = dur(o), h = o.size * u * 1.25;
    var root = layer(S.c, "background:" + (o.bg || "#101114"));
    var mid = S.H / 2, wd = S.W * 0.52, lx = (S.W - wd) / 2;
    var slot = mk("div", "position:absolute;left:" + px(lx) + ";top:" + px(mid - h / 2) + ";width:" + px(wd) + ";height:" + px(h) + ";overflow:hidden", root);
    var l1 = mk("div", "position:absolute;left:" + px(lx) + ";top:" + px(mid - h / 2 - 2 * u) + ";width:" + px(wd) + ";height:" + px(2 * u) + ";background:" + ink(o) + ";transform-origin:0 50%", root), l2 = mk("div", "position:absolute;left:" + px(lx) + ";top:" + px(mid + h / 2) + ";width:" + px(wd) + ";height:" + px(2 * u) + ";background:" + ink(o) + ";transform-origin:100% 50%", root);
    var flex = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;white-space:nowrap;";
    var w = mk("div", flex + "font:700 " + px(o.size * u) + "/1 " + (o.font || FONT) + ";color:" + ink(o), slot, o.word);
    var logo = mk("div", flex + "font:900 " + px(o.size * u) + "/1 " + (o.font || FONT) + ";color:" + o.accent + ";letter-spacing:-0.03em", slot, o.logo);
    tl.fromTo([l1, l2], { scaleX: 0 }, { scaleX: 1, duration: d * 0.3, ease: "power3.out" }, at);
    tl.fromTo(w, { yPercent: 100 }, { yPercent: 0, duration: d * 0.3, ease: o.ease }, at);
    tl.to(w, { yPercent: -100, filter: "blur(" + px(4 * u) + ")", duration: d * 0.4, ease: o.ease }, at + d * 0.45);
    tl.fromTo(logo, { yPercent: 100, filter: "blur(" + px(4 * u) + ")" }, { yPercent: 0, filter: "blur(0px)", duration: d * 0.4, ease: o.ease }, at + d * 0.45);
    return { end: at + d, el: root };
  }, { duration: 1.2, ease: "power3.inOut", word: "Simple", logo: "Aurora", size: 150, accent: "#ff5a36", ink: null, bg: null, font: null },
    { word: "the word held between the rules", logo: "the logo text (or put your own element in the returned slot)" },
    "RasanMoves.slotLineWipeLockup(tl, 0.2, { target: stage, word: 'Simple', logo: 'Aurora' });");

  // ================================================================= 15 dot-field-resolve-to-photo (RasanImageFX)
  function fxCanvas(S, o, srcPic, extra) {
    need(root.RasanImageFX, "RasanImageFX is not loaded (runtime/rasan-image-fx.js)");
    var cv = mk("canvas", "position:absolute;left:0;top:0;width:100%;height:100%", S.c); cv.width = S.W; cv.height = S.H;
    var cfg = { canvas: cv, width: S.W, height: S.H, src: toURL(srcPic), seed: o.seed }; for (var k in extra) cfg[k] = extra[k];
    var fx = root.RasanImageFX.create(cfg); PENDING.push(fx.ready); return { fx: fx, cv: cv };
  }
  def("dot-field-resolve-to-photo", 15, "dotFieldResolve", function (tl, at, o) {
    o = O("dot-field-resolve-to-photo", o); var S = setup(o), d = dur(o);
    var img = pic(o.image) || PH.photo(2, 960, 540);
    var bg = mk("div", "position:absolute;inset:0;background:" + o.bg, S.c);
    var r = fxCanvas(S, o, img, { bg: o.bg });
    r.fx.dissolve(tl, at, d, { mode: "dot", dir: "in", cell: o.cell * S.H / 1080, order: o.order, spread: o.spread, ease: o.ease, ink: o.ink });
    return { end: at + d, el: r.cv, fx: r.fx };
  }, { duration: 2.6, ease: "power2.inOut", image: null, cell: 28, order: "radial", spread: 0.7, ink: null, bg: "#0d0e12", seed: 7 },
    { image: "the photo it resolves into", cell: "dot pitch px at 1080p", order: "noise|radial|ltr|ttb|luma", spread: "0..1 how staggered the dots are" },
    "RasanMoves.dotFieldResolve(tl, 0.3, { target: stage, image: photo, cell: 28 });");

  // ================================================================= 16 mosaic-pixel-resolve
  def("mosaic-pixel-resolve", 16, "mosaicPixelResolve", function (tl, at, o) {
    o = O("mosaic-pixel-resolve", o); var S = setup(o), d = dur(o), W = S.W, H = S.H, img = pic(o.image) || PH.photo(3, 960, 540);
    var cv = mk("canvas", "position:absolute;left:0;top:0;width:100%;height:100%;image-rendering:pixelated", S.c); cv.width = W; cv.height = H; var g = cv.getContext("2d"), tiny = document.createElement("canvas"), tg = tiny.getContext("2d");
    function draw(p) {
      var size = Math.max(1, Math.round(o.from * Math.pow(1 / o.from, p) * (H / 1080))), tw = Math.max(1, Math.ceil(W / size)), th = Math.max(1, Math.ceil(H / size));
      tiny.width = tw; tiny.height = th; tg.imageSmoothingEnabled = true; tg.clearRect(0, 0, tw, th); cover(tg, img, 0, 0, tw, th);
      g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H); g.drawImage(tiny, 0, 0, tw, th, 0, 0, tw * size, th * size);
    }
    var st = { p: 0 }; whenImg(img, function () { draw(st.p); });
    prog(tl, at, d, o.ease, function (p) { st.p = p; if (!(img.tagName === "IMG" && !img.complete)) draw(p); });
    return { end: at + d, el: cv };
  }, { duration: 1.2, ease: "steps(8)", image: null, from: 64 },
    { image: "picture", from: "starting block size px at 1080p (shrinks to 1)" },
    "RasanMoves.mosaicPixelResolve(tl, 0.3, { target: stage, image: photo });");

  // ================================================================= 17 pixel-square-wipe
  def("pixel-square-wipe", 17, "pixelSquareWipe", function (tl, at, o) {
    o = O("pixel-square-wipe", o); var S = setup(o), d = dur(o), W = S.W, H = S.H, cell = Math.max(8, o.cell * S.u), cx = Math.ceil(W / cell), cy = Math.ceil(H / cell);
    var from = R(o.fromEl) || (o.from ? picEl(pic(o.from), "position:absolute;inset:0;width:100%;height:100%", S.c) : mk("div", "position:absolute;inset:0;background:" + o.fromColor, S.c));
    var to = R(o.toEl) || (o.to ? picEl(pic(o.to), "position:absolute;inset:0;width:100%;height:100%", S.c) : mk("div", "position:absolute;inset:0;background:" + o.toColor, S.c));
    var flash = mk("div", "position:absolute;inset:0;background:#fff", S.c);
    var thr = []; for (var i = 0; i < cx * cy; i++) thr.push(rn(o.seed, i % cx, (i / cx) | 0));
    var band = 0.14;
    function pathFor(lo, hi) { var s = ""; for (var j = 0; j < cy; j++) for (var k = 0; k < cx; k++) { var t = thr[j * cx + k]; if (t >= lo && t < hi) s += "M" + k * cell + " " + j * cell + "h" + cell + "v" + cell + "h-" + cell + "z"; } return s || "M0 0h0v0z"; }
    prog(tl, at, d, o.ease, function (p) {
      var q = p * (1 + band);
      to.style.clipPath = "path('" + pathFor(-1, q - band) + "')"; flash.style.clipPath = "path('" + pathFor(q - band, q) + "')"; flash.style.opacity = p > 0 && p < 1 ? "1" : "0";
    });
    return { end: at + d, el: to };
  }, { duration: 0.8, ease: "steps(6)", from: null, to: null, fromEl: null, toEl: null, fromColor: "#14161c", toColor: "#2f6bff", cell: 90, seed: 3 },
    { from: "old scene picture", to: "new scene picture", fromEl: "or existing elements (toEl is clipped)", cell: "square size px at 1080p" },
    "RasanMoves.pixelSquareWipe(tl, 2, { target: stage, from: photo, to: photo2 });");

  // ================================================================= 18 torn-edge-wipe (RasanImageFX)
  def("torn-edge-wipe", 18, "tornEdgeWipe", function (tl, at, o) {
    o = O("torn-edge-wipe", o); var S = setup(o), d = dur(o), a = pic(o.from) || PH.photo(1, 960, 540), b = pic(o.to) || PH.photo(4, 960, 540);
    var r = fxCanvas(S, o, a, { src2: toURL(b) });
    r.fx.wipe(tl, at, d, { shape: "torn", angle: o.angle, roughness: o.roughness, rimColor: o.rim, ease: o.ease });
    return { end: at + d, el: r.cv, fx: r.fx };
  }, { duration: 0.9, ease: "power3.inOut", from: null, to: null, angle: 20, roughness: 0.12, rim: "#f3ecdc", seed: 5 },
    { from: "old picture", to: "new picture", angle: "degrees of the tear line", roughness: "0..1 how ragged", rim: "paper rim colour" },
    "RasanMoves.tornEdgeWipe(tl, 2, { target: stage, from: photo, to: photo2 });");

  // ================================================================= 19 floating-card-field
  def("floating-card-field", 19, "floatingCardField", function (tl, at, o) {
    o = O("floating-card-field", o); var S = setup(o), u = S.u, d = dur(o), n = o.count, W = S.W, H = S.H;
    var root = layer(S.c, "background:" + (o.bg || "#eef0f5") + ";overflow:hidden");
    var cards = [];
    for (var i = 0; i < n; i++) {
      var depth = i % 3, sc = [1, 0.78, 0.58][depth], w = 300 * u * sc, h = 380 * u * sc, x = (0.08 + rn(o.seed, i, 1) * 0.84) * W - w / 2, y = (0.22 + rn(o.seed, i, 2) * 0.56) * H - h / 2;
      var el = mk("div", "position:absolute;left:" + px(x) + ";top:" + px(y) + ";width:" + px(w) + ";height:" + px(h) + ";border-radius:" + px(28 * u * sc) + ";overflow:hidden;box-shadow:0 " + px(24 * u * sc) + " " + px(50 * u) + " rgba(20,30,60,.25);filter:blur(" + px([0, 4, 10][depth] * u) + ");will-change:transform", root);
      picEl(face(o, i, 300, 380), "width:100%;height:100%;display:block", el);
      var dx = (rn(o.seed, i, 3) - 0.5) * 70 * u, dy = (rn(o.seed, i, 4) - 0.5) * 70 * u, ox = (x + w / 2 - W / 2), oy = (y + h / 2 - H / 2), nrm = Math.max(1, Math.hypot(ox, oy));
      tl.fromTo(el, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" }, at + rn(o.seed, i, 5) * 0.4);
      tl.fromTo(el, { x: -dx, y: -dy, rotation: -2 + depth }, { x: dx, y: dy, rotation: 2 - depth, duration: d, ease: o.ease }, at);
      tl.to(el, { x: dx + (ox / nrm) * W * 0.9, y: dy + (oy / nrm) * H * 0.9, scale: 2.4 + depth * 0.4, opacity: 0, duration: o.flyOut, ease: "power3.in" }, at + d);
    }
    var cap = mk("div", "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:800 " + px(o.size * u) + "/1.05 " + (o.font || FONT) + ";color:" + (o.ink || "#10131c") + ";text-align:center;z-index:5;white-space:nowrap;text-shadow:0 0 " + px(30 * u) + " " + (o.bg || "#eef0f5"), root, o.caption);
    tl.fromTo(cap, { opacity: 0, y: 20 * u }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, at + 0.2); tl.to(cap, { opacity: 0, duration: 0.3 }, at + d + 0.1);
    return { end: at + d + o.flyOut, el: root };
  }, { duration: 3, ease: "sine.inOut", count: 10, caption: "Everything, everywhere", flyOut: 0.7, seed: 8, size: 110, images: null, colors: null, ink: null, bg: null, font: null },
    { count: "8 to 12 cards at three blur depths", images: "card pictures (else placeholder tiles)", caption: "text in the middle", flyOut: "seconds of the fly-outward exit" },
    "RasanMoves.floatingCardField(tl, 0.2, { target: stage, caption: 'Everything, everywhere', images: [photo, photo2, photo3] });");

  // ================================================================= 20 cards-burst-from-dot
  def("cards-burst-from-dot", 20, "cardsBurstFromDot", function (tl, at, o) {
    o = O("cards-burst-from-dot", o); var S = setup(o), u = S.u, d = dur(o), n = o.count, W = S.W, H = S.H;
    var root = layer(S.c, "background:" + (o.bg || "#0f1117") + ";overflow:hidden;perspective:" + px(1400 * u));
    var world = mk("div", "position:absolute;inset:0;transform-style:preserve-3d;transform-origin:50% 50%", root);
    var cards = [];
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * 6.283 + rn(o.seed, i, 1) * 0.4, rr = (0.22 + rn(o.seed, i, 2) * 0.18) * H * (i % 2 ? 1.25 : 0.9), sz = (0.7 + rn(o.seed, i, 3) * 0.7) * 190 * u, w = sz, h = sz * 1.25;
      var el = mk("div", "position:absolute;left:" + px(W / 2 - w / 2) + ";top:" + px(H / 2 - h / 2) + ";width:" + px(w) + ";height:" + px(h) + ";border-radius:" + px(20 * u) + ";overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.4)", world);
      picEl(face(o, i, 220, 280), "width:100%;height:100%;display:block", el);
      tl.fromTo(el, { scale: 0, x: 0, y: 0, rotationX: 0, rotationY: 0 }, { scale: 1, x: Math.cos(ang) * rr * 1.5, y: Math.sin(ang) * rr, rotationX: (rn(o.seed, i, 4) - 0.5) * 24, rotationY: (rn(o.seed, i, 5) - 0.5) * 30, duration: d * 0.55, ease: o.ease }, at + i * (d * 0.3 / n));
    }
    var dot = mk("div", "position:absolute;left:" + px(W / 2 - 14 * u) + ";top:" + px(H / 2 - 14 * u) + ";width:" + px(28 * u) + ";height:" + px(28 * u) + ";border-radius:50%;background:" + o.dot + ";z-index:5", root);
    tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.2, ease: "back.out(2)" }, at);
    var t1 = at + d * 0.85, pd = d * 0.7;
    tl.to(world, { scale: 6, duration: pd, ease: "power3.in" }, t1);
    tl.to(dot, { scale: Math.hypot(W, H) / (28 * u) * 1.1, duration: pd, ease: "power3.in" }, t1);
    return { end: t1 + pd, el: root };
  }, { duration: 1.7, ease: "power3.out", count: 12, dot: "#ffffff", seed: 6, images: null, colors: null, bg: null },
    { count: "number of cards", dot: "the iris dot / next scene colour", images: "card pictures" },
    "RasanMoves.cardsBurstFromDot(tl, 0.2, { target: stage, count: 12, images: [photo, photo2] });");

  // ================================================================= 21 duotone-stock-cluster (light)
  def("duotone-stock-cluster", 21, "duotoneStockCluster", function (tl, at, o) {
    o = O("duotone-stock-cluster", o); var S = setup(o), u = S.u, d = dur(o), n = o.count, W = S.W, H = S.H;
    var root = layer(S.c, "background:" + (o.bg || "#0b1030"));
    var cards = [];
    for (var i = 0; i < n; i++) {
      var w = (260 + rn(o.seed, i, 1) * 110) * u, h = w * 1.28, a = (i / n) * 6.283, rr = Math.min(W, H) * (0.16 + 0.2 * rn(o.seed, i, 2)), x = W / 2 + Math.cos(a) * rr * 1.9 - w / 2, y = H / 2 + Math.sin(a) * rr * 1.1 - h / 2, color = i === o.colourIndex;
      var el = mk("div", "position:absolute;left:" + px(x) + ";top:" + px(y) + ";width:" + px(w) + ";height:" + px(h) + ";border-radius:" + px(18 * u) + ";overflow:hidden;isolation:isolate;box-shadow:0 18px 44px rgba(0,0,0,.45)", root);
      picEl(face(o, i, 240, 300), "width:100%;height:100%;display:block;" + (color ? "" : "filter:grayscale(1) contrast(1.15)"), el);
      if (!color) { mk("div", "position:absolute;inset:0;background:linear-gradient(160deg," + o.light + "," + o.dark + ");mix-blend-mode:multiply", el); mk("div", "position:absolute;inset:0;background:" + o.dark + ";mix-blend-mode:lighten;opacity:.5", el); }
      var rot = (rn(o.seed, i, 3) - 0.5) * 16; tl.fromTo(el, { scale: 0.6, opacity: 0, rotation: rot - 12, y: 40 * u }, { scale: 1, opacity: 1, rotation: rot, y: 0, duration: d * 0.6, ease: o.ease }, at + i * (d * 0.4 / n));
    }
    return { end: at + d, el: root };
  }, { duration: 1.5, ease: "power2.out", count: 7, colourIndex: 3, dark: "#1d3bff", light: "#8fb0ff", seed: 9, images: null, colors: null, bg: null },
    { count: "cards in the cluster", colourIndex: "the one card kept in colour", dark: "duotone shadow", light: "duotone highlight" },
    "RasanMoves.duotoneStockCluster(tl, 0.2, { target: stage, images: [photo, photo2, photo3], colourIndex: 3 });");

  // ================================================================= 22 dither-seam-on-art
  def("dither-seam-on-art", 22, "ditherSeamOnArt", function (tl, at, o) {
    o = O("dither-seam-on-art", o); var S = setup(o), d = dur(o), W = S.W, H = S.H, img = pic(o.image) || PH.photo(5, 960, 540), cell = Math.max(3, o.cell * S.u);
    var cv = mk("canvas", "position:absolute;left:0;top:0;width:100%;height:100%", S.c); cv.width = W; cv.height = H; var g = cv.getContext("2d"), edge = null, gw = Math.ceil(W / cell), gh = Math.ceil(H / cell), e = ez(o.ease), st = { p: 0 };
    function compute() { // Sobel edge map on a grid the size of the dot screen, then a soft widening
      var t = document.createElement("canvas"); t.width = gw; t.height = gh; var tg = t.getContext("2d"); cover(tg, img, 0, 0, gw, gh); var D = tg.getImageData(0, 0, gw, gh).data, L = new Float32Array(gw * gh), i, x, y;
      for (i = 0; i < gw * gh; i++) L[i] = (D[i * 4] * 0.3 + D[i * 4 + 1] * 0.59 + D[i * 4 + 2] * 0.11) / 255; var E = new Float32Array(gw * gh), mx = 1e-6;
      for (y = 1; y < gh - 1; y++) for (x = 1; x < gw - 1; x++) { var gx = L[(y - 1) * gw + x + 1] + 2 * L[y * gw + x + 1] + L[(y + 1) * gw + x + 1] - L[(y - 1) * gw + x - 1] - 2 * L[y * gw + x - 1] - L[(y + 1) * gw + x - 1], gy = L[(y + 1) * gw + x - 1] + 2 * L[(y + 1) * gw + x] + L[(y + 1) * gw + x + 1] - L[(y - 1) * gw + x - 1] - 2 * L[(y - 1) * gw + x] - L[(y - 1) * gw + x + 1]; E[y * gw + x] = Math.hypot(gx, gy); if (E[y * gw + x] > mx) mx = E[y * gw + x]; }
      var B = new Float32Array(gw * gh); for (y = 1; y < gh - 1; y++) for (x = 1; x < gw - 1; x++) { var m = 0; for (var j = -1; j <= 1; j++) for (var k = -1; k <= 1; k++) m = Math.max(m, E[(y + j) * gw + x + k]); B[y * gw + x] = Math.min(1, m / mx * 2.2); }
      edge = B;
    }
    function draw(p) {
      var q = e(p); g.clearRect(0, 0, W, H); cover(g, img, 0, 0, W, H); if (!edge) return;
      g.fillStyle = o.ink; for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) { var v = edge[y * gw + x] * q; if (v < 0.08) continue; g.beginPath(); g.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.5 * Math.min(1, v) * (0.55 + 0.45 * hash(x, y, o.seed)), 0, 6.283); g.fill(); }
    }
    whenImg(img, function () { compute(); draw(st.p); });
    prog(tl, at, d, "none", function (p) { st.p = p; draw(p); });
    return { end: at + d, el: cv };
  }, { duration: 1.4, ease: "power2.out", image: null, cell: 9, ink: "#fff4d6", seed: 3 },
    { image: "the art", cell: "dot pitch px at 1080p", ink: "dot colour" },
    "RasanMoves.ditherSeamOnArt(tl, 0.2, { target: stage, image: photo });");

  // ================================================================= 23 spectral-silhouette
  def("spectral-silhouette", 23, "spectralSilhouette", function (tl, at, o) {
    o = O("spectral-silhouette", o); var S = setup(o), d = dur(o), W = S.W, H = S.H, img = pic(o.image) || PH.cutout(1, 600, 800), e = ez(o.ease);
    var root = layer(S.c, "background:" + (o.bg || "#0a0b10"));
    var cv = mk("canvas", "position:absolute;inset:0;width:100%;height:100%", root); cv.width = W; cv.height = H; var g = cv.getContext("2d"), sil = document.createElement("canvas"), st = { p: 0 }, ready = false;
    var bh = H * o.height, bw = bh * (iw(img) / ih(img)), bx = (W - bw) / 2, by = (H - bh) / 2;
    function prep() { sil.width = Math.round(bw); sil.height = Math.round(bh); var sg = sil.getContext("2d"); sg.drawImage(img, 0, 0, sil.width, sil.height); var D = sg.getImageData(0, 0, sil.width, sil.height), hasA = false, i; for (i = 3; i < D.data.length; i += 4) if (D.data[i] < 250) { hasA = true; break; }
      if (!hasA) for (i = 0; i < D.data.length; i += 4) { var l = (D.data[i] * 0.3 + D.data[i + 1] * 0.59 + D.data[i + 2] * 0.11); D.data[i + 3] = l < 128 ? 255 : 0; } // dark subject on a light picture: keep the dark shape
      for (i = 0; i < D.data.length; i += 4) { D.data[i] = D.data[i + 1] = D.data[i + 2] = 255; } sg.putImageData(D, 0, 0); ready = true; }
    function draw(p) {
      if (!ready) return; var q = e(p), gr, k; g.clearRect(0, 0, W, H);
      var fill = document.createElement("canvas"); fill.width = sil.width; fill.height = sil.height; var fg = fill.getContext("2d");
      gr = fg.createLinearGradient(0, sil.height * (0.9 - 0.8 * q), sil.width, sil.height * (0.1 + 0.9 * (1 - q) * 0 + 0.5 * q)); gr.addColorStop(0, o.from); gr.addColorStop(1, o.to); fg.fillStyle = gr; fg.fillRect(0, 0, sil.width, sil.height); fg.globalCompositeOperation = "destination-in"; fg.drawImage(sil, 0, 0);
      for (k = o.ghosts; k >= 1; k--) { g.globalAlpha = 0.16 * (1 - k / (o.ghosts + 1)); g.drawImage(fill, bx - k * bw * 0.06 * q, by + k * bh * 0.01); }
      g.globalAlpha = 0.9 * q; g.filter = "blur(" + (28 * S.u) + "px)"; g.drawImage(fill, bx - bw * 0.04, by - bh * 0.02, bw * 1.08, bh * 1.04); g.filter = "none";
      g.globalAlpha = 0.55 + 0.45 * q; g.drawImage(fill, bx, by); g.globalAlpha = 1;
    }
    whenImg(img, function () { prep(); draw(st.p); });
    prog(tl, at, d, "none", function (p) { st.p = p; draw(p); });
    return { end: at + d, el: root };
  }, { duration: 2.4, ease: "sine.inOut", image: null, height: 0.8, from: "#ff7a1a", to: "#2f6bff", ghosts: 4, bg: null },
    { image: "a figure with alpha (or a dark silhouette on a light picture)", from: "gradient start (orange)", to: "gradient end (blue)", ghosts: "long-exposure ghost copies" },
    "RasanMoves.spectralSilhouette(tl, 0.2, { target: stage, image: RasanMoves.placeholder.cutout(1) });");

  // ================================================================= 24 poster-dive
  def("poster-dive", 24, "posterDive", function (tl, at, o) {
    o = O("poster-dive", o); var S = setup(o), d = dur(o), W = S.W, H = S.H, art = pic(o.image) || PH.art(2, 800, 1000);
    var root = layer(S.c, "background:#b9bcc4");
    var wall = mk("div", "position:absolute;inset:0;background:linear-gradient(180deg,#c9ccd4,#9ea3ae)", root);
    var ph = H * 0.62, pw = ph * (iw(art) / ih(art)), px0 = (W - pw) / 2, py0 = H * 0.16;
    var plate = mk("div", "position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:" + px(px0 + pw * o.fx) + " " + px(py0 + ph * o.fy), root);
    mk("div", "position:absolute;left:" + px(px0 - 18) + ";top:" + px(py0 - 18) + ";width:" + px(pw + 36) + ";height:" + px(ph + 36) + ";background:#23262e;border-radius:8px;box-shadow:0 30px 60px rgba(0,0,0,.4)", plate);
    var p0 = picEl(art, "position:absolute;left:" + px(px0) + ";top:" + px(py0) + ";width:" + px(pw) + ";height:" + px(ph) + ";object-fit:cover", plate);
    var full = layer(root, "clip-path:inset(" + px(py0) + " " + px(px0) + " " + px(H - py0 - ph) + " " + px(px0) + ")"); picEl(art, "position:absolute;left:" + px(px0) + ";top:" + px(py0) + ";width:" + px(pw) + ";height:" + px(ph) + ";object-fit:cover", full);
    var scale = Math.max(W / pw, H / ph) * 1.03, ox0 = px0 + pw * o.fx, oy0 = py0 + ph * o.fy;
    var cx1 = clamp(W / 2, W - pw * (1 - o.fx) * scale, pw * o.fx * scale), cy1 = clamp(H / 2, H - ph * (1 - o.fy) * scale, ph * o.fy * scale);
    prog(tl, at, d, o.ease, function (p) {
      var s = lerp(1, scale, p), ox = px0 + pw * o.fx, oy = py0 + ph * o.fy; plate.style.transform = "translate(" + ((cx1 - ox) * p).toFixed(2) + "px," + ((cy1 - oy) * p).toFixed(2) + "px) scale(" + s.toFixed(4) + ")";
      // the full-frame copy: a rect (the poster's current screen box) grows to the frame and its picture scales with it
      var cx = ox + (cx1 - ox) * p, cy = oy + (cy1 - oy) * p, l = cx - pw * o.fx * s, t = cy - ph * o.fy * s, r = l + pw * s, b = t + ph * s;
      full.style.clipPath = "inset(" + Math.max(0, t).toFixed(1) + "px " + Math.max(0, W - r).toFixed(1) + "px " + Math.max(0, H - b).toFixed(1) + "px " + Math.max(0, l).toFixed(1) + "px)";
      var im = full.firstChild; im.style.left = l.toFixed(1) + "px"; im.style.top = t.toFixed(1) + "px"; im.style.width = (pw * s).toFixed(1) + "px"; im.style.height = (ph * s).toFixed(1) + "px";
    });
    return { end: at + d, el: root };
  }, { duration: 1.6, ease: "power3.inOut", image: null, fx: 0.62, fy: 0.38 },
    { image: "the artwork on the poster", fx: "point of interest across the poster (0..1)", fy: "point of interest down the poster (0..1)" },
    "RasanMoves.posterDive(tl, 0.3, { target: stage, image: RasanMoves.placeholder.art(2), fx: 0.62, fy: 0.38 });");

  // ================================================================= 25 tilted-ui-dolly
  function mockUI(parent, o, W, H) { // a neutral dark product window with named controls: data-ctl on each
    var u = H / 1080, w = W * 0.62, h = H * 0.62, win = mk("div", "position:absolute;left:" + px((W - w) / 2) + ";top:" + px((H - h) / 2) + ";width:" + px(w) + ";height:" + px(h) + ";background:#171a22;border-radius:" + px(22 * u) + ";box-shadow:0 40px 90px rgba(0,0,0,.5);color:#e8e6df;font:500 " + px(22 * u) + " " + FONT + ";overflow:hidden", parent);
    var bar = mk("div", "height:" + px(56 * u) + ";display:flex;align-items:center;gap:" + px(10 * u) + ";padding:0 " + px(20 * u) + ";background:#1d212b", win); ["#ff5f57", "#febc2e", "#28c840"].forEach(function (c) { mk("div", "width:" + px(14 * u) + ";height:" + px(14 * u) + ";border-radius:50%;background:" + c, bar); });
    var body = mk("div", "padding:" + px(28 * u) + ";display:flex;flex-direction:column;gap:" + px(20 * u), win), ctl = [];
    var mkc = function (css, text, name) { var e = mk("div", css, body, text); e.setAttribute("data-ctl", name); ctl.push(e); return e; };
    var chips = mk("div", "display:flex;gap:" + px(12 * u), body); ["Draft", "Style", "Music"].forEach(function (t, i) { var e = mk("div", "padding:" + px(10 * u) + " " + px(22 * u) + ";border-radius:99px;background:" + (i === 1 ? "#2f6bff" : "#262b38") + ";color:#fff", chips, t); e.setAttribute("data-ctl", "chip" + i); ctl.push(e); });
    var field = mkc("height:" + px(120 * u) + ";border-radius:" + px(16 * u) + ";background:#0f1218;border:1px solid #2a3040;padding:" + px(18 * u) + ";color:#9aa3b5", "Describe the film you want to make...", "field");
    var row = mk("div", "display:flex;justify-content:space-between;align-items:center", body); mk("div", "color:#7b8497", row, "16:9  .  60s");
    var send = mk("div", "width:" + px(64 * u) + ";height:" + px(64 * u) + ";border-radius:50%;background:#ff5a36;display:flex;align-items:center;justify-content:center", row); icon("plane", 30 * u, "#fff", send); send.setAttribute("data-ctl", "send"); ctl.push(send);
    return { win: win, ctl: ctl, field: field, send: send, w: w, h: h, body: body };
  }
  def("tilted-ui-dolly", 25, "tiltedUiDolly", function (tl, at, o) {
    o = O("tilted-ui-dolly", o); var S = setup(o), d = dur(o), W = S.W, H = S.H;
    var root = layer(S.c, "background:" + (o.bg || "radial-gradient(circle at 30% 20%,#2a3350,#0c0e14)") + ";perspective:" + px(1400 * S.u));
    var rig = mk("div", "position:absolute;inset:0;transform-origin:50% 50%", root), plane = mk("div", "position:absolute;inset:0;transform-origin:50% 50%;transform:rotateY(" + o.ry + "deg) rotateX(" + o.rx + "deg);transform-style:preserve-3d", rig);
    var ui = o.plane ? { win: R(o.plane), ctl: [].slice.call(R(o.plane).querySelectorAll("[data-ctl]")) } : mockUI(plane, o, W, H); if (o.plane) plane.appendChild(ui.win);
    var cp = S.c.getBoundingClientRect(), sc = cp.width ? W / cp.width : 1;
    function centre(el) { var r = el.getBoundingClientRect(); return [(r.left - cp.left + r.width / 2) * sc, (r.top - cp.top + r.height / 2) * sc]; }
    var stops = o.stops || ["field", "send"], ctl = ui.ctl, per = d / (stops.length + 1), t = at;
    function ctlOf(name) { return ctl.filter(function (e) { return e.getAttribute("data-ctl") === name; })[0] || ctl[0]; }
    tl.fromTo(rig, { scale: 1, x: 0, y: 0 }, { scale: 1, x: 0, y: 0, duration: 0.01 }, t); // the wide establishing view
    stops.forEach(function (name, i) {
      var f = ctlOf(name), c = centre(f), s = o.zoom;
      tl.to(rig, { scale: s, x: -s * (c[0] - W / 2), y: -s * (c[1] - H / 2), duration: per * 0.8, ease: o.ease }, at + per * (i + 0.4));
      ctl.forEach(function (e) { tl.to(e, { filter: e === f ? "blur(0px)" : "blur(" + px(3 * S.u) + ")", opacity: e === f ? 1 : 0.55, duration: per * 0.6, ease: "power2.out" }, at + per * (i + 0.4)); });
    });
    tl.to(rig, { scale: 1, x: 0, y: 0, duration: per * 0.7, ease: o.ease }, at + per * (stops.length + 0.3)); ctl.forEach(function (e) { tl.to(e, { filter: "blur(0px)", opacity: 1, duration: per * 0.5 }, at + per * (stops.length + 0.3)); });
    return { end: at + d, el: root };
  }, { duration: 6, ease: "power2.inOut", plane: null, stops: ["field", "send"], zoom: 2.1, rx: 8, ry: -18, bg: null },
    { plane: "your own UI element (children with data-ctl=name are focus targets), else a neutral product window", stops: "data-ctl names to visit, in order", zoom: "magnification at each stop", rx: "tilt X deg", ry: "tilt Y deg" },
    "RasanMoves.tiltedUiDolly(tl, 0.2, { target: stage, stops: ['field', 'send'] });");

  // ================================================================= 26 typed-prompt-send
  var ARROW = '<path d="M3 2l18 8-8 2-2 8z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>';
  def("typed-prompt-send", 26, "typedPromptSend", function (tl, at, o) {
    o = O("typed-prompt-send", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H;
    var root = layer(S.c, "background:" + (o.bg || "#0f1117"));
    var w = W * 0.72, h = 230 * u, x = (W - w) / 2, y = H * 0.26;
    var box = mk("div", "position:absolute;left:" + px(x) + ";top:" + px(y) + ";width:" + px(w) + ";height:" + px(h) + ";border-radius:" + px(26 * u) + ";background:#1a1e29;border:1px solid #2c3345;font:500 " + px(48 * u) + "/1.3 " + (o.font || FONT) + ";color:#f2efe8;padding:" + px(36 * u) + ";box-sizing:border-box", root);
    var txt = mk("span", "", box), caret = mk("span", "display:inline-block;width:" + px(4 * u) + ";height:" + px(50 * u) + ";background:" + o.accent + ";vertical-align:text-bottom;margin-left:2px", box);
    var send = mk("div", "position:absolute;right:" + px(22 * u) + ";bottom:" + px(18 * u) + ";width:" + px(64 * u) + ";height:" + px(64 * u) + ";border-radius:50%;background:" + o.accent + ";display:flex;align-items:center;justify-content:center", box); icon("plane", 30 * u, "#fff", send);
    var res = mk("div", "position:absolute;left:" + px(x) + ";top:" + px(y + h + 36 * u) + ";width:" + px(w) + ";height:" + px(330 * u) + ";border-radius:" + px(26 * u) + ";overflow:hidden;opacity:0", root); picEl(pic(o.result) || PH.photo(2, 800, 400), "width:100%;height:100%", res);
    var cur = svg('<svg viewBox="0 0 24 24" width="100%" height="100%">' + ARROW + "</svg>", "position:absolute;left:0;top:0;width:" + px(46 * u) + ";height:" + px(46 * u) + ";z-index:9;opacity:0", root);
    var ring = mk("div", "position:absolute;width:" + px(80 * u) + ";height:" + px(80 * u) + ";border-radius:50%;border:" + px(4 * u) + " solid " + o.accent + ";opacity:0;z-index:8", root);
    var sx = x + w - 22 * u - 32 * u, sy = y + h - 18 * u - 32 * u, p0 = [W * 0.8, H * 0.2], c1 = [W * 0.5, H * 0.65], p2 = [sx, sy];
    var tType = d * 0.45, tMove = d * 0.3;
    prog(tl, at, tType, "none", function (p) { var n = Math.floor(p * o.text.length + 1e-9); txt.textContent = o.text.slice(0, n); caret.style.opacity = "1"; });
    tl.set(caret, { opacity: 0 }, at + d * 0.9);
    tl.set(cur, { opacity: 1 }, at + tType);
    prog(tl, at + tType, tMove, "power2.inOut", function (p) { var a = 1 - p; var xx = a * a * p0[0] + 2 * a * p * c1[0] + p * p * p2[0], yy = a * a * p0[1] + 2 * a * p * c1[1] + p * p * p2[1]; cur.style.transform = "translate(" + xx.toFixed(2) + "px," + yy.toFixed(2) + "px)"; });
    var tc = at + tType + tMove;
    tl.to(send, { scale: 0.88, duration: 0.08 }, tc).to(send, { scale: 1, duration: 0.2, ease: "back.out(3)" }, tc + 0.08);
    tl.set(ring, { left: sx + 32 * u - 40 * u, top: sy + 32 * u - 40 * u }, tc).fromTo(ring, { scale: 0.3, opacity: 0.9 }, { scale: 1.6, opacity: 0, duration: 0.5, ease: "power2.out" }, tc);
    tl.fromTo(res, { opacity: 0, scale: 0.9, y: 30 * u }, { opacity: 1, scale: 1, y: 0, duration: d - tType - tMove - 0.1, ease: o.ease }, tc + 0.15);
    return { end: at + d, el: root, clickAt: tc };
  }, { duration: 4, ease: "power2.out", text: "A launch film for my new app", accent: "#ff5a36", result: null, bg: null, font: null },
    { text: "the typed prompt", result: "the picture that pops", accent: "send button / caret colour" },
    "RasanMoves.typedPromptSend(tl, 0.2, { target: stage, text: 'A launch film for my new app' });");

  // ================================================================= 27 cursor-identity-swap
  def("cursor-identity-swap", 27, "cursorIdentitySwap", function (tl, at, o) {
    o = O("cursor-identity-swap", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H;
    var root = layer(S.c, "background:" + (o.bg || "#eef0f5"));
    var mkCur = function (inner, color, label, parent) { var g = mk("div", "position:absolute;left:0;top:0;z-index:9;opacity:0", parent || root), s = svg('<svg viewBox="0 0 24 24" width="100%" height="100%">' + inner + "</svg>", "width:" + px(84 * u) + ";height:" + px(84 * u) + ";position:absolute;left:0;top:0;transform-origin:0 0", g); if (label) mk("div", "position:absolute;left:" + px(54 * u) + ";top:" + px(64 * u) + ";padding:" + px(8 * u) + " " + px(20 * u) + ";border-radius:99px;background:" + color + ";color:#fff;font:600 " + px(34 * u) + " " + FONT + ";white-space:nowrap", g, label); return { g: g, s: s }; };
    var main = mkCur(ARROW, o.accent), plane = mkCur('<path d="M2 12l20-9-6 18-4-7z" fill="' + o.accent + '" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>', o.accent);
    var targetBtn = mk("div", "position:absolute;left:" + px(W * 0.66) + ";top:" + px(H * 0.58) + ";width:" + px(380 * u) + ";height:" + px(120 * u) + ";border-radius:99px;background:#fff;box-shadow:0 14px 40px rgba(30,40,70,.2);display:flex;align-items:center;justify-content:center;font:700 " + px(48 * u) + " " + FONT + ";color:#10131c", root, "Send");
    var P = [[W * 0.12, H * 0.2], [W * 0.4, H * 0.7], [W * 0.66 + 250 * u, H * 0.58 + 60 * u]], tM = d * 0.5;
    var place = function (c, x, y) { c.g.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)"; };
    tl.set(main.g, { opacity: 1 }, at);
    prog(tl, at, tM, "power2.inOut", function (p) { var a = 1 - p, x = a * a * P[0][0] + 2 * a * p * P[1][0] + p * p * P[2][0], y = a * a * P[0][1] + 2 * a * p * P[1][1] + p * p * P[2][1]; place(main, x, y); place(plane, x, y); });
    tl.set(main.g, { opacity: 0 }, at + tM).set(plane.g, { opacity: 1 }, at + tM).fromTo(plane.s, { scale: 0.4 }, { scale: 1, duration: 0.3, ease: "back.out(2.4)" }, at + tM);
    tl.to(targetBtn, { scale: 0.94, duration: 0.1 }, at + tM + 0.05).to(targetBtn, { scale: 1, duration: 0.25, ease: "back.out(3)" }, at + tM + 0.15);
    o.peers.forEach(function (pe, i) { var pc = mkCur(ARROW.replace("#111", pe.color), pe.color, pe.name), a0 = [W * (0.2 + 0.2 * i), H * 0.85], a1 = [W * (0.35 + 0.15 * i), H * (0.3 + 0.1 * i)], a2 = [W * (0.5 + 0.1 * i), H * (0.45 - 0.05 * i)]; pc.g.style.opacity = "0";
      tl.to(pc.g, { opacity: 1, duration: 0.2 }, at + 0.1 * i);
      prog(tl, at + 0.1 * i, d * 0.85, "sine.inOut", function (p) { var a = 1 - p, x = a * a * a0[0] + 2 * a * p * a1[0] + p * p * a2[0], y = a * a * a0[1] + 2 * a * p * a1[1] + p * p * a2[1]; place(pc, x, y); }); });
    return { end: at + d, el: root, swapAt: at + tM };
  }, { duration: 3.2, ease: "power2.out", accent: "#ff5a36", peers: [{ name: "Maya", color: "#2f6bff" }, { name: "Dev", color: "#19c37d" }], bg: null },
    { accent: "your cursor colour", peers: "[{name,color}] multiplayer cursors with avatar labels" },
    "RasanMoves.cursorIdentitySwap(tl, 0.2, { target: stage });");

  // ================================================================= 28 glow-on-control (light: wraps a mini UI + a mask overlay)
  def("glow-on-control", 28, "glowOnControl", function (tl, at, o) {
    o = O("glow-on-control", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H;
    var root = layer(S.c, "background:" + (o.bg || "#12151d"));
    var ctl = R(o.control), host = ctl ? S.c : root, others = [];
    if (!ctl) { var row = mk("div", "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:" + px(34 * u), root);
      o.labels.forEach(function (t, i) { var b = mk("div", "padding:" + px(40 * u) + " " + px(90 * u) + ";border-radius:" + px(34 * u) + ";background:#222735;color:#e8e6df;font:700 " + px(62 * u) + " " + FONT, row, t); if (i === o.lit) ctl = b; }); }
    var cp = S.c.getBoundingClientRect(), sc = cp.width ? W / cp.width : 1, r = ctl.getBoundingClientRect(), cx = (r.left - cp.left + r.width / 2) * sc, cy = (r.top - cp.top + r.height / 2) * sc, rad = Math.max(r.width, r.height) * sc * 0.75;
    var glow = mk("div", "position:absolute;left:" + px(cx - rad * 1.6) + ";top:" + px(cy - rad * 1.2) + ";width:" + px(rad * 3.2) + ";height:" + px(rad * 2.4) + ";border-radius:50%;background:radial-gradient(circle," + o.color + "cc 0%," + o.color + "44 45%,transparent 70%);filter:blur(" + px(40 * u) + ");opacity:0;z-index:3;mix-blend-mode:screen;pointer-events:none", S.c);
    var dim = mk("div", "position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0", S.c);
    prog(tl, at, d, o.ease, function (p) { var rr = lerp(Math.hypot(W, H), rad, p); dim.style.background = "radial-gradient(ellipse " + rr.toFixed(1) + "px " + (rr * 0.7).toFixed(1) + "px at " + cx.toFixed(1) + "px " + cy.toFixed(1) + "px,transparent 55%,rgba(5,6,10," + (0.78 * p).toFixed(3) + ") 100%)"; dim.style.opacity = "1"; glow.style.opacity = String(p.toFixed(3)); });
    tl.to(ctl, { scale: 1.06, duration: d * 0.6, ease: o.ease }, at);
    return { end: at + d, el: root };
  }, { duration: 1, ease: "power2.out", control: null, labels: ["Draft", "Style", "Send"], lit: 2, color: "#ff5a36", bg: null },
    { control: "the element to light (any element inside target), else a neutral control row", labels: "default control row", lit: "which default control is lit", color: "glow colour" },
    "RasanMoves.glowOnControl(tl, 0.3, { target: stage, lit: 2 });");

  // ================================================================= 29 counter-chip-ring
  def("counter-chip-ring", 29, "counterChipRing", function (tl, at, o) {
    o = O("counter-chip-ring", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H;
    var root = layer(S.c, "display:flex;align-items:center;justify-content:center;background:" + (o.bg || "#0f1117"));
    var chip = mk("div", "position:relative;display:flex;align-items:center;gap:" + px(28 * u) + ";padding:" + px(26 * u) + " " + px(56 * u) + " " + px(26 * u) + " " + px(36 * u) + ";border-radius:99px;background:#1b1f2b;color:#f2efe8;font:800 " + px(190 * u) + "/1 " + FONT + ";font-variant-numeric:tabular-nums", root);
    var rs = 200 * u, ring = svg('<svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="50" r="42" fill="none" stroke="#2c3345" stroke-width="9"/><circle class="arc" cx="50" cy="50" r="42" fill="none" stroke="' + o.accent + '" stroke-width="9" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 50 50)"/></svg>', "width:" + px(rs) + ";height:" + px(rs), chip), arc = ring.querySelector(".arc");
    var num = mk("span", "min-width:" + px(String(o.to).length * 115 * u), chip, "0"); if (o.label) mk("span", "font:600 " + px(60 * u) + " " + FONT + ";color:#9aa3b5", chip, o.label);
    var e = ez(o.ease), last = -1;
    prog(tl, at, d, "none", function (p) { var q = e(p), v = Math.round(q * o.to); num.textContent = o.prefix + v.toLocaleString("en-US") + o.suffix; arc.setAttribute("stroke-dashoffset", String((1 - q).toFixed(4))); });
    tl.fromTo(chip, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.6)" }, at - 0.0);
    for (var k = 1; k <= o.ticks; k++) { var qt = k / o.ticks, lo = 0, hi = 1, m; for (var it = 0; it < 24; it++) { m = (lo + hi) / 2; if (e(m) < qt) lo = m; else hi = m; } var tt = at + d * hi; tl.fromTo(chip, { scale: 1.0 }, { scale: 1.04, duration: 0.07, ease: "power2.out", yoyo: true, repeat: 1 }, Math.max(at + 0.3, tt - 0.07)); }
    return { end: at + d, el: root };
  }, { duration: 2, ease: "power2.out", to: 1684, prefix: "", suffix: "", label: "tasks", ticks: 5, accent: "#2f6bff", bg: null },
    { to: "final number", ticks: "scale pulses along the way", label: "small text after the number", prefix: "prefix", suffix: "suffix" },
    "RasanMoves.counterChipRing(tl, 0.2, { target: stage, to: 1684, label: 'tasks' });");

  // ================================================================= 30 segmented-control-over-world
  def("segmented-control-over-world", 30, "segmentedControlOverWorld", function (tl, at, o) {
    o = O("segmented-control-over-world", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H;
    var root = layer(S.c, "background:#7fb3ff"); var ls = (o.layers && o.layers.length ? o.layers.map(pic) : PH.landscape(Math.round(W * 1.15), Math.round(H * 1.15))), n = ls.length;
    var els = ls.map(function (im, i) { var e = picEl(im, "position:absolute;left:" + px(-W * 0.075) + ";top:" + px(-H * 0.075) + ";width:" + px(W * 1.15) + ";height:" + px(H * 1.15) + ";object-fit:cover", root); tl.fromTo(e, { x: -W * 0.03 * (i / n), scale: 1 }, { x: W * 0.03 * (i / n) + W * 0.02 * i, scale: 1.02 + 0.03 * i, duration: d, ease: o.ease }, at); return e; });
    var seg = o.segments, sw = 260 * u, sh = 110 * u, pad = 10 * u, total = sw * seg.length + pad * 2;
    var bar = mk("div", "position:absolute;left:" + px((W - total) / 2) + ";top:" + px(H * 0.72) + ";width:" + px(total) + ";height:" + px(sh + pad * 2) + ";border-radius:99px;background:rgba(255,255,255,.22);backdrop-filter:blur(" + px(24 * u) + ");border:1px solid rgba(255,255,255,.5);box-shadow:0 20px 50px rgba(20,40,90,.25)", root);
    var pill = mk("div", "position:absolute;left:" + px(pad) + ";top:" + px(pad) + ";width:" + px(sw) + ";height:" + px(sh) + ";border-radius:99px;background:#fff;box-shadow:0 6px 20px rgba(0,0,0,.18)", bar);
    seg.forEach(function (t, i) { mk("div", "position:absolute;left:" + px(pad + i * sw) + ";top:" + px(pad) + ";width:" + px(sw) + ";height:" + px(sh) + ";display:flex;align-items:center;justify-content:center;font:700 " + px(46 * u) + " " + FONT + ";color:#10131c;z-index:2", bar, t); });
    tl.fromTo(bar, { y: 40 * u, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, at + 0.1);
    for (var i = 1; i < seg.length; i++) tl.to(pill, { x: i * sw, duration: 0.45, ease: "power3.inOut" }, at + 0.4 + (d - 0.8) * (i / seg.length));
    tl.to(bar, { scale: 1.06, duration: d, ease: o.ease }, at);
    return { end: at + d, el: root };
  }, { duration: 3, ease: "power2.inOut", layers: null, segments: ["Day", "Dusk", "Night"] },
    { layers: "world pictures far to near (else a placeholder landscape)", segments: "labels of the segmented control" },
    "RasanMoves.segmentedControlOverWorld(tl, 0.2, { target: stage, segments: ['Day', 'Dusk', 'Night'] });");

  // ================================================================= 31 ribbon-of-frames
  def("ribbon-of-frames", 31, "ribbonOfFrames", function (tl, at, o) {
    o = O("ribbon-of-frames", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H, n = o.count;
    var root = layer(S.c, "background:" + (o.bg || "#0b0d14") + ";perspective:" + px(1500 * u) + ";perspective-origin:50% 38%");
    mk("div", "position:absolute;left:10%;right:10%;bottom:0;height:42%;background:radial-gradient(ellipse at 50% 100%," + o.glow + "99,transparent 70%);filter:blur(" + px(30 * u) + ")", root);
    var ring = mk("div", "position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d", root), cw = 520 * u, ch = 340 * u, Rr = (cw * n) / (2 * Math.PI) * 1.05;
    for (var i = 0; i < n; i++) { var c = mk("div", "position:absolute;left:" + px(-cw / 2) + ";top:" + px(-ch / 2) + ";width:" + px(cw) + ";height:" + px(ch) + ";border-radius:" + px(18 * u) + ";overflow:hidden;transform:rotateY(" + (i * 360 / n) + "deg) translateZ(" + px(Rr) + ");box-shadow:0 0 " + px(30 * u) + " " + o.glow + "55;backface-visibility:hidden", ring); picEl(face(o, i, 340, 220), "width:100%;height:100%;display:block", c); }
    var a0 = o.from, a1 = o.to;
    prog(tl, at, d, o.ease, function (p) { ring.style.transform = "translateZ(" + px(-Rr * 0.9) + ") rotateX(-12deg) rotateY(" + lerp(a0, a1, p).toFixed(2) + "deg)"; });
    return { end: at + d, el: root };
  }, { duration: 2.4, ease: "power2.inOut", count: 12, from: -70, to: 20, glow: "#2f6bff", images: null, colors: null, bg: null },
    { count: "cards on the ring", from: "ring angle at start (deg)", to: "ring angle at end", glow: "glow colour at the base" },
    "RasanMoves.ribbonOfFrames(tl, 0.2, { target: stage, images: [photo, photo2, photo3] });");

  // ================================================================= 32 column-ladder
  def("column-ladder", 32, "columnLadder", function (tl, at, o) {
    o = O("column-ladder", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H, cols = o.columns, n = cols.length;
    var root = layer(S.c, "background:" + (o.bg || "#10131b") + ";perspective:" + px(1600 * u));
    var group = mk("div", "position:absolute;left:" + px(W * 0.12) + ";top:" + px(H * 0.18) + ";width:" + px(W * 0.76) + ";height:" + px(H * 0.64) + ";display:flex;gap:" + px(26 * u) + ";transform-origin:50% 50%;transform-style:preserve-3d", root);
    var els = cols.map(function (c, i) { var e = mk("div", "flex:1;border-radius:" + px(22 * u) + ";padding:" + px(26 * u) + ";background:" + (c.hero ? o.accent : "#1d2230") + ";color:" + (c.hero ? "#fff" : "#e8e6df") + ";font:600 " + px(26 * u) + "/1.5 " + FONT + ";box-shadow:0 20px 50px rgba(0,0,0,.35)", group); mk("div", "font:800 " + px(38 * u) + " " + FONT + ";margin-bottom:" + px(18 * u), e, c.title); (c.rows || []).forEach(function (r) { mk("div", "padding:" + px(8 * u) + " 0;border-top:1px solid rgba(255,255,255,.14);opacity:.9", e, r); }); return e; });
    var heroI = Math.max(0, cols.findIndex(function (c) { return c.hero; })), order = [heroI].concat(cols.map(function (c, i) { return i; }).filter(function (i) { return i !== heroI; })), step = (d * 0.5) / n;
    order.forEach(function (ci, k) { tl.fromTo(els[ci], { y: 60 * u, opacity: 0, scale: 0.92 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: o.ease }, at + k * step); });
    tl.to(group, { rotationY: -12, rotationX: 3, duration: d * 0.4, ease: "power2.inOut" }, at + d * 0.55);
    var arrows = mk("div", "position:absolute;inset:0;pointer-events:none", root), as = [];
    var paths = [["M" + W * 0.5 + "," + H * 0.1, "C" + W * 0.55 + "," + H * 0.04 + " " + W * 0.66 + "," + H * 0.06 + " " + W * 0.7 + "," + H * 0.15], ["M" + W * 0.2 + "," + H * 0.92, "C" + W * 0.3 + "," + H * 0.97 + " " + W * 0.4 + "," + H * 0.92 + " " + W * 0.46 + "," + H * 0.84]];
    paths.forEach(function (pp, i) { var s = svg('<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="100%"><path d="' + pp.join(" ") + '" fill="none" stroke="' + o.ink + '" stroke-width="' + 5 * u + '" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>', "position:absolute;inset:0", arrows); as.push(s.querySelector("path")); });
    as.forEach(function (p, i) { tl.fromTo(p, { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: d * 0.2, ease: "power2.inOut" }, at + d * 0.78 + i * 0.12); });
    return { end: at + d, el: root };
  }, { duration: 4, ease: "power3.out", columns: [{ title: "Others", rows: ["Slow", "Manual", "Costly"] }, { title: "Aurora", hero: true, rows: ["Fast", "Automatic", "Free"] }, { title: "DIY", rows: ["Hard", "Fiddly", "Long"] }], accent: "#2f6bff", ink: "#ffd23f", bg: null },
    { columns: "[{title, rows, hero}] (the hero column enters first)", accent: "hero column colour", ink: "handwritten arrow colour" },
    "RasanMoves.columnLadder(tl, 0.2, { target: stage });");

  // ================================================================= 33 lone-dot-carrier-iris
  def("lone-dot-carrier-iris", 33, "loneDotCarrierIris", function (tl, at, o) {
    o = O("lone-dot-carrier-iris", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H, sz = o.size * u;
    var root = layer(S.c, "background:" + (o.bg || "#f4f1ea"));
    var lines = mk("div", "position:absolute;left:" + px(W * 0.3) + ";top:" + px(H * 0.4) + ";font:600 " + px(72 * u) + "/1.6 " + FONT + ";color:#10131c", root); (o.lines || ["Plan the launch", "Write the story"]).forEach(function (t) { mk("div", "", lines, t); });
    var dot = mk("div", "position:absolute;left:" + px(-sz / 2) + ";top:" + px(-sz / 2) + ";width:" + px(sz) + ";height:" + px(sz) + ";border-radius:50%;z-index:5", root);
    var ring = svg('<svg viewBox="0 0 100 100" width="100%" height="100%" style="overflow:visible"><circle class="c" cx="50" cy="50" r="40" fill="' + o.color + '" stroke="' + o.color + '" stroke-width="20" pathLength="1" stroke-dasharray="1 0"/></svg>', "position:absolute;inset:0", dot), c = ring.querySelector(".c");
    var P = [[W * 0.265, H * 0.435], [W * 0.265, H * 0.5], [W * 0.5, H * 0.5]];
    gsap.set(dot, { x: P[0][0], y: P[0][1] });
    var t1 = at + d * 0.2, t2 = at + d * 0.45, t3 = at + d * 0.6, pd = d * 0.4;
    tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.2, ease: "back.out(2)" }, at);
    tl.to(dot, { y: P[1][1], duration: d * 0.18, ease: "power2.inOut" }, t1);
    // bullet -> spinner: the fill drains to a ring and an arc spins; -> hole: the ring thickens around an empty centre
    prog(tl, t2, d * 0.15, "power2.inOut", function (p) { c.setAttribute("fill-opacity", String(1 - p)); c.setAttribute("stroke-dasharray", (1 - 0.3 * p) + " " + (0.3 * p)); c.setAttribute("stroke-width", String(lerp(20, 12, p))); });
    tl.to(dot, { rotation: 720, duration: d * 0.3, ease: "none" }, t2);
    tl.to(dot, { x: P[2][0], y: P[2][1], duration: d * 0.25, ease: "power2.inOut" }, t2 + 0.05);
    prog(tl, t3 - 0.05, 0.1, "none", function (p) { c.setAttribute("stroke-dasharray", "1 0"); c.setAttribute("fill-opacity", String(p)); c.setAttribute("stroke-width", String(lerp(12, 20, p))); });
    var big = Math.hypot(W, H) / sz * 2.6;
    tl.to(dot, { scale: big, duration: pd, ease: "power3.inOut" }, t3);
    return { end: t3 + pd, el: root };
  }, { duration: 3.2, ease: "power3.inOut", size: 80, color: "#10131c", lines: null, bg: null },
    { size: "dot diameter px at 1080p", color: "the dot / the colour of the next scene it becomes (set the next scene to this colour)", lines: "list text beside the bullet" },
    "RasanMoves.loneDotCarrierIris(tl, 0.2, { target: stage });");

  // ================================================================= 34 colour-world-flip
  def("colour-world-flip", 34, "colourWorldFlip", function (tl, at, o) {
    o = O("colour-world-flip", o); var S = setup(o), u = S.u, A = o.a, B = o.b, W = S.W, H = S.H;
    var root = layer(S.c, "display:flex;align-items:center;justify-content:center;background:" + A.bg);
    var line = mk("div", "display:flex;gap:0.28em;align-items:center;font:800 " + px(o.size * u) + "/1 " + (o.font || FONT) + ";color:" + A.ink, root), ws = o.words.map(function (w, i) { return mk("span", "", line, w); });
    var dot = mk("div", "width:" + px(0.5 * o.size * u) + ";height:" + px(0.5 * o.size * u) + ";border-radius:50%;background:" + A.accent, line);
    ws[o.flipWord].style.color = A.accent;
    var t = at + o.flipAt;
    tl.set(root, { backgroundColor: B.bg }, t); ws.forEach(function (w, i) { tl.set(w, { color: i === o.flipWord ? B.accent : B.ink }, t); }); tl.set(dot, { backgroundColor: B.accent }, t);
    tl.fromTo(line, { opacity: 0, y: 14 * u }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, at);
    return { end: t + 0.6, el: root, flipAt: t };
  }, { duration: 0.6, ease: "none", words: ["Everyone", "else", "builds", "slides."], flipWord: 2, flipAt: 1.0, size: 104, a: { bg: "#f4f1ea", ink: "#10131c", accent: "#ff5a36" }, b: { bg: "#10131c", ink: "#f4f1ea", accent: "#ffd23f" }, font: null },
    { words: "the line", flipWord: "index of the word that carries the turn", flipAt: "seconds after `at` when the world flips (a hard cut)", a: "{bg, ink, accent} before", b: "{bg, ink, accent} after (the inverse)" },
    "RasanMoves.colourWorldFlip(tl, 0.2, { target: stage, words: ['Everyone','else','builds','slides.'], flipWord: 2, flipAt: 1.0 });");

  // ================================================================= 35 inline-orb-expand
  def("inline-orb-expand", 35, "inlineOrbExpand", function (tl, at, o) {
    o = O("inline-orb-expand", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H, size = o.size * u;
    var root = layer(S.c, "display:flex;align-items:center;justify-content:center;background:" + (o.bg || "#f4f1ea"));
    var line = mk("div", "display:flex;align-items:center;gap:0.25em;font:700 " + px(size) + "/1.1 " + (o.font || FONT) + ";color:" + (o.ink || "#10131c") + ";white-space:pre", root), tx = [];
    tx.push(mk("span", "", line, o.before)); var orb = mk("span", "display:inline-block;width:" + px(size * 0.9) + ";height:" + px(size * 0.9) + ";border-radius:50%;background:" + o.gradient, line); tx.push(mk("span", "", line, o.after));
    var cp = S.c.getBoundingClientRect(), sc = cp.width ? W / cp.width : 1, r = orb.getBoundingClientRect(), cx = (r.left - cp.left + r.width / 2) * sc, cy = (r.top - cp.top + r.height / 2) * sc, rr = r.width * sc;
    var big = mk("div", "position:absolute;left:" + px(cx - rr / 2) + ";top:" + px(cy - rr / 2) + ";width:" + px(rr) + ";height:" + px(rr) + ";border-radius:50%;background:" + o.gradient + ";opacity:0;z-index:4", root);
    var logo = mk("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 " + px(size * 1.5) + "/1 " + (o.font || FONT) + ";color:#fff;letter-spacing:-0.03em;opacity:0;z-index:6", root, o.logo);
    var t0 = at + d * 0.1, grow = d * 0.65, scale = Math.hypot(W, H) * 2 / rr;
    tl.fromTo(orb, { scale: 0.2 }, { scale: 1, duration: 0.3, ease: "back.out(1.8)" }, at);
    tl.set(big, { opacity: 1 }, t0).set(orb, { opacity: 0 }, t0);
    tl.to(big, { scale: scale, duration: grow, ease: o.ease }, t0);
    tl.to(tx, { opacity: 0, duration: grow * 0.4, ease: "power2.in" }, t0);
    tl.fromTo(logo, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }, t0 + grow * 0.7);
    return { end: at + d + 0.2, el: root };
  }, { duration: 1.6, ease: "power3.in", before: "Make something", after: "new", logo: "Aurora", gradient: "linear-gradient(135deg,#ff5a36,#a855f7 55%,#2f6bff)", size: 140, ink: null, bg: null, font: null },
    { before: "text before the orb", after: "text after", logo: "logo text on the brand world", gradient: "the brand gradient" },
    "RasanMoves.inlineOrbExpand(tl, 0.2, { target: stage, before: 'Make something', after: 'new', logo: 'Aurora' });");

  // ================================================================= 36 action-as-transition
  def("action-as-transition", 36, "actionAsTransition", function (tl, at, o) {
    o = O("action-as-transition", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H;
    var root = layer(S.c, "background:" + o.toColor);
    if (o.to) picEl(pic(o.to), "position:absolute;inset:0;width:100%;height:100%", root);
    var strip = mk("div", "position:absolute;left:0;top:" + px(H * 0.5 - H * 0.2) + ";width:100%;height:" + px(H * 0.4) + ";overflow:hidden", root); // the current scene, in a band the blades cut through
    var top = mk("div", "position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;clip-path:inset(0 0 50% 0)", strip), bot = mk("div", "position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;clip-path:inset(50% 0 0 0)", strip);
    [top, bot].forEach(function (h) { if (o.from) picEl(pic(o.from), "position:absolute;left:0;top:0;width:100%;height:" + px(H * 0.4) + ";object-fit:cover", h); else h.style.background = "linear-gradient(90deg," + o.fromColor + "," + o.fromColor2 + ")"; });
    var tape = mk("div", "position:absolute;left:0;right:0;top:50%;height:" + px(3 * u) + ";background:rgba(255,255,255,.7)", strip);
    var blade = icon(o.icon, o.objectSize * u, "#fff", root, "position:absolute;left:0;top:0;z-index:6;filter:drop-shadow(0 8px 12px rgba(0,0,0,.4));transform-origin:50% 50%"); blade.style.color = o.accent;
    var cy = H / 2 - o.objectSize * u / 2, d1 = d * 0.6, cutX = W * 0.62;
    tl.fromTo(blade, { x: -o.objectSize * u * 1.5, y: cy, rotation: 90 }, { x: cutX, y: cy, rotation: 90, duration: d1, ease: o.ease }, at);
    tl.to(top, { y: -H * 0.2, rotation: -2, duration: d * 0.45, ease: "power3.out", transformOrigin: "100% 100%" }, at + d1);
    tl.to(bot, { y: H * 0.2, rotation: 2, duration: d * 0.45, ease: "power3.out", transformOrigin: "100% 0%" }, at + d1);
    tl.to(blade, { x: W * 1.2, duration: d * 0.4, ease: "power2.in" }, at + d1);
    tl.to(strip, { opacity: 0, duration: d * 0.3 }, at + d1 + d * 0.2);
    return { end: at + d + d * 0.2, el: root, contactAt: at + d1 };
  }, { duration: 1.2, ease: "power4.in", from: null, to: null, fromColor: "#ff5a36", fromColor2: "#ffd23f", toColor: "#10131c", icon: "scissors", objectSize: 220, accent: "#ffffff" },
    { from: "the current scene picture (else a colour band)", to: "the next scene picture revealed behind the halves", toColor: "the scene revealed behind the halves", icon: "icon name or svg", objectSize: "px at 1080p" },
    "RasanMoves.actionAsTransition(tl, 1.2, { target: stage, from: photo, to: photo2 });");

  // ================================================================= 37 voxel-disintegrate-reform (Rasan3D)
  var SHAPES = {
    heart: ["..XX..XX..", ".XXXXXXXX.", "XXXXXXXXXX", "XXXXXXXXXX", ".XXXXXXXX.", "..XXXXXX..", "...XXXX...", "....XX...."],
    star: ["....XX....", "....XX....", "XXXXXXXXXX", ".XXXXXXXX.", "..XXXXXX..", "..XXXXXX..", ".XXX..XXX.", ".XX....XX."],
    bolt: ["....XXXX..", "...XXXX...", "..XXXX....", ".XXXXXXX..", "...XXXX...", "..XXX.....", ".XX.......", "X........."],
  };
  function shapePts(rows, depth) { var pts = [], h = rows.length, w = rows[0].length, x, y, z; for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (rows[y][x] === "X") for (z = 0; z < depth; z++) pts.push([x - w / 2 + 0.5, h / 2 - y - 0.5, z - depth / 2 + 0.5]); return pts; }
  def("voxel-disintegrate-reform", 37, "voxelDisintegrateReform", function (tl, at, o) {
    o = O("voxel-disintegrate-reform", o); var S = setup(o), d = dur(o);
    need(root.Rasan3D, "Rasan3D is not loaded (stage3d/rasan3d.js)");
    var cv = mk("canvas", "position:absolute;left:0;top:0;width:100%;height:100%;background:" + o.bg, S.c), sub = gsap.timeline(), id = "moves-voxel-" + (uid++);
    var A = shapePts(typeof o.from === "string" ? SHAPES[o.from] : o.from, o.depth), B = shapePts(typeof o.to === "string" ? SHAPES[o.to] : o.to, o.depth), n = Math.max(A.length, B.length), seed = o.seed;
    var rec = null, e = ez(o.ease);
    root.Rasan3D.stage({
      id: id, canvas: cv, timeline: sub, duration: d + 0.001, width: S.W, height: S.H, fps: 30, pixelRatio: 1, environment: "studio", toneMapping: "neutral", background: o.bg,
      camera: { pos: [[0, [0, 1.5, 22]]], target: [[0, [0, 0, 0]]], lens: [[0, 50]], fstop: 8 },
      build: function (k) {
        var T = k.THREE, geo = new T.BoxGeometry(0.86, 0.86, 0.86), mat = new T.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }), mesh = new T.InstancedMesh(geo, mat, n), m4 = new T.Matrix4(), q = new T.Quaternion(), eu = new T.Euler(), sv = new T.Vector3(), pv = new T.Vector3(), col = new T.Color();
        var order = []; for (var i = 0; i < n; i++) order.push(i); order.sort(function (a, b) { return rn(seed, a, 9) - rn(seed, b, 9); });
        var cA = new T.Color(o.colors[0]), cB = new T.Color(o.colors[1]);
        for (i = 0; i < n; i++) mesh.setColorAt(i, col.copy(cA)); mesh.frustumCulled = false; k.scene.add(mesh); k.rig("three-point", { dir: [-0.5, 0.9, 0.7] });
        var sc = 0.9 * (10 / Math.max(10, 10));
        function pose(t) {
          var s = clamp(t / d, 0, 1), i, a, b, w0, q01, sx, sy, sz2, mid, p, boom;
          for (i = 0; i < n; i++) {
            a = A[i % A.length]; b = B[order[i] % B.length]; w0 = rn(seed, i, 2) * 0.45; q01 = e(clamp((s - 0.1 - w0 * 0.55) / 0.45, 0, 1)); var go = clamp((s - 0.18 - w0 * 0.2) / 0.5, 0, 1); go = go * go * (3 - 2 * go);
            mid = [(rn(seed, i, 3) - 0.5) * 18, (rn(seed, i, 4) - 0.3) * 14, (rn(seed, i, 5) - 0.2) * 14];
            boom = Math.sin(go * Math.PI);
            p = [lerp(a[0], b[0], go) + mid[0] * boom, lerp(a[1], b[1], go) + mid[1] * boom, lerp(a[2], b[2], go) + mid[2] * boom];
            var stretch = 1 + boom * 1.2; eu.set(boom * (rn(seed, i, 6) - 0.5) * 8, boom * (rn(seed, i, 7) - 0.5) * 8, 0); q.setFromEuler(eu); sv.set(1, 1, stretch);
            pv.set(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9); m4.compose(pv, q, sv); mesh.setMatrixAt(i, m4);
            mesh.setColorAt(i, col.copy(cA).lerp(cB, go));
          }
          mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        pose(0); rec = { pose: pose }; return { mesh: mesh };
      },
      pose: function (t) { if (rec) rec.pose(t); },
    });
    tl.add(sub, at);
    var p3 = (root.__hf && root.__hf.buildReady && root.__hf.buildReady["rasan3d:" + id]); if (p3) PENDING.push(p3);
    return { end: at + d, el: cv, timeline: sub };
  }, { duration: 2.2, ease: "power2.inOut", from: "heart", to: "star", depth: 2, colors: ["#ff5a36", "#2f6bff"], bg: "#10131c", seed: 7 },
    { from: "'heart'|'star'|'bolt' or rows of 'X'/'.' strings", to: "likewise (the next icon)", depth: "voxel layers", colors: "[from colour, to colour]" },
    "RasanMoves.voxelDisintegrateReform(tl, 0.2, { target: stage, from: 'heart', to: 'star' });");
  var uid = 0;

  // ================================================================= 38 specimen-triptych
  def("specimen-triptych", 38, "specimenTriptych", function (tl, at, o) {
    o = O("specimen-triptych", o); var S = setup(o), u = S.u, d = dur(o), W = S.W, H = S.H, items = o.items, n = items.length, per = o.per;
    var root = layer(S.c, "background:" + (o.bg || "#0b0c10"));
    var cw = H * 0.78, card = mk("div", "position:absolute;left:" + px((W - cw) / 2) + ";top:" + px(H * 0.11) + ";width:" + px(cw) + ";height:" + px(H * 0.78) + ";border-radius:" + px(34 * u) + ";background:#171a22;overflow:hidden;color:#f2efe8;font-family:" + FONT, root);
    var BT = H * 0.11, BS = cw * 0.52;
    var burst = svg('<svg viewBox="-100 -100 200 200" width="100%" height="100%"><polygon class="b" points="' + (function () { var s = ""; for (var i = 0; i < 24; i++) { var r = i % 2 ? 62 : 96, a = i / 24 * 6.2832; s += (Math.cos(a) * r).toFixed(1) + "," + (Math.sin(a) * r).toFixed(1) + " "; } return s; })() + '" fill="#fff"/></svg>', "position:absolute;left:50%;top:" + px(BT) + ";width:" + px(BS) + ";height:" + px(BS) + ";margin-left:" + px(-BS / 2) + ";transform-origin:50% 50%", card), poly = burst.querySelector(".b");
    var ic = mk("div", "position:absolute;left:50%;top:" + px(BT + BS / 2 - cw * 0.1) + ";width:" + px(cw * 0.2) + ";height:" + px(cw * 0.2) + ";margin-left:" + px(-cw * 0.1) + ";color:#10131c", card);
    var icons = items.map(function (it, i) { var e = icon(it.icon || ["wave", "heart", "star"][i % 3], cw * 0.2, "#10131c", ic, "position:absolute;left:0;top:0;opacity:" + (i ? 0 : 1)); return e; });
    var label = mk("div", "position:absolute;left:0;right:0;top:" + px(H * 0.58) + ";text-align:center;font:800 " + px(84 * u) + " " + FONT, card), lt = mk("span", "", label), caret = mk("span", "display:inline-block;width:" + px(4 * u) + ";height:" + px(66 * u) + ";background:#fff;vertical-align:middle;margin-left:4px", label);
    var meter = mk("div", "position:absolute;left:" + px(cw * 0.2) + ";right:" + px(cw * 0.2) + ";top:" + px(H * 0.72) + ";height:" + px(70 * u) + ";display:flex;align-items:center;justify-content:center;gap:" + px(8 * u), card), bars = [], mN = 14;
    for (var b = 0; b < mN; b++) bars.push(mk("div", "width:" + px(12 * u) + ";height:" + px(60 * u) + ";border-radius:99px;background:#fff;transform-origin:50% 50%", meter));
    var cols = items.map(function (it, i) { return it.color || PAL[i % PAL.length]; });
    function setItem(i) { poly.setAttribute("fill", cols[i]); icons.forEach(function (e, k) { e.style.opacity = k === i ? "1" : "0"; }); }
    prog(tl, at, per * n, "none", function (p) {
      var T = p * per * n, i = Math.min(n - 1, Math.floor(T / per)), lt0 = T - i * per, noun = items[i].noun || items[i], kind = items[i].meter || ["wave", "dots", "hearts"][i % 3];
      setItem(i); var cnt = Math.min(noun.length, Math.floor(lt0 / (per * 0.4) * noun.length)); lt.textContent = noun.slice(0, cnt); caret.style.opacity = lt0 < per * 0.9 ? "1" : "0";
      poly.setAttribute("transform", "rotate(" + (T * 30).toFixed(2) + ")");
      bars.forEach(function (bar, k) {
        var v = 0.5 + 0.5 * Math.sin(T * 9 + k * 0.9 + i * 2) * (0.6 + 0.4 * Math.sin(T * 3.1 + k)), live = lt0 > per * 0.2;
        if (kind === "wave") { bar.style.borderRadius = px(99 * u); bar.style.width = px(12 * u); bar.style.height = px((10 + v * 56 * (live ? 1 : 0.2)) * u); }
        else if (kind === "dots") { bar.style.borderRadius = "50%"; bar.style.width = px(18 * u); bar.style.height = px(18 * u); bar.style.opacity = (k / mN) <= (lt0 / per) ? "1" : "0.25"; bar.style.transform = "none"; }
        else { bar.style.borderRadius = px(4 * u); bar.style.width = px(18 * u); bar.style.height = px(18 * u); bar.style.transform = "rotate(45deg) scale(" + (0.6 + 0.4 * v).toFixed(3) + ")"; bar.style.opacity = (k / mN) <= (lt0 / per) ? "1" : "0.25"; }
        if (kind === "wave") bar.style.opacity = "1";
      });
    });
    return { end: at + per * n, el: root };
  }, { duration: null, per: 1.5, items: [{ noun: "Voice", icon: "mic", meter: "wave" }, { noun: "Friends", icon: "heart", meter: "hearts" }, { noun: "Moments", icon: "star", meter: "dots" }], bg: null },
    { items: "[{noun, icon, color, meter: 'wave'|'dots'|'hearts'}] one card state per noun", per: "seconds per noun (1.5)" },
    "RasanMoves.specimenTriptych(tl, 0.2, { target: stage });");

  // ================================================================= 39 mockup-parade
  def("mockup-parade", 39, "mockupParade", function (tl, at, o) {
    o = O("mockup-parade", o); var S = setup(o), u = S.u, W = S.W, H = S.H, art = pic(o.image) || PH.art(3, 800, 800), kinds = o.plates, n = kinds.length, each = o.each, d = n * each;
    var root = layer(S.c, "background:#cfd2d9;perspective:" + px(1800 * u));
    var A = function (parent, w, h, css) { return picEl(art, "position:absolute;width:" + px(w) + ";height:" + px(h) + ";object-fit:cover;" + (css || ""), parent); };
    function plateFor(kind) {
      var P = layer(root, "visibility:hidden"), inner = mk("div", "position:absolute;inset:0;transform-origin:50% 50%", P), w, h;
      if (kind === "flat") { P.style.background = "#f1f1ee"; w = H * 0.7; h = w; A(inner, w, h, "left:" + px((W - w) / 2) + ";top:" + px((H - h) / 2) + ";box-shadow:0 30px 70px rgba(0,0,0,.25)"); }
      else if (kind === "hoarding") { P.style.background = "linear-gradient(#9fc1e8,#d9e5f2 60%,#8b8f98 60%)"; w = W * 0.62; h = w * 0.42; mk("div", "position:absolute;left:" + px(W / 2 - 14 * u) + ";top:" + px(H * 0.2 + h) + ";width:" + px(28 * u) + ";height:" + px(H * 0.4) + ";background:#444", inner); mk("div", "position:absolute;left:" + px((W - w) / 2 - 16) + ";top:" + px(H * 0.2 - 16) + ";width:" + px(w + 32) + ";height:" + px(h + 32) + ";background:#2a2d35", inner); A(inner, w, h, "left:" + px((W - w) / 2) + ";top:" + px(H * 0.2)); inner.style.transform = "rotateY(-14deg) rotateX(2deg)"; }
      else if (kind === "binder") { P.style.background = "#6b4f3a"; w = H * 0.62; h = H * 0.8; mk("div", "position:absolute;left:" + px(W / 2 - w * 0.55) + ";top:" + px(H * 0.1) + ";width:" + px(w * 1.1) + ";height:" + px(h) + ";background:#1f2430;border-radius:14px;box-shadow:0 40px 80px rgba(0,0,0,.45)", inner); for (var r = 0; r < 3; r++) mk("div", "position:absolute;left:" + px(W / 2 - w * 0.6) + ";top:" + px(H * (0.2 + r * 0.25)) + ";width:" + px(60 * u) + ";height:" + px(20 * u) + ";background:#9aa", inner); A(inner, w * 0.8, w * 0.8, "left:" + px(W / 2 - w * 0.4 + 10) + ";top:" + px(H * 0.2) + ";box-shadow:0 10px 30px rgba(0,0,0,.4)"); inner.style.transform = "rotateX(12deg) rotateZ(-3deg)"; }
      else if (kind === "kiosk") { P.style.background = "linear-gradient(#cfd3dc,#8f95a2)"; w = H * 0.46; h = H * 0.7; mk("div", "position:absolute;left:" + px(W / 2 - w * 0.6) + ";top:" + px(H * 0.1) + ";width:" + px(w * 1.2) + ";height:" + px(H * 0.82) + ";background:#14161c;border-radius:" + px(30 * u), inner); A(inner, w, h, "left:" + px(W / 2 - w / 2) + ";top:" + px(H * 0.15) + ";border-radius:" + px(12 * u)); inner.style.transform = "rotateY(10deg)"; }
      else if (kind === "card") { P.style.background = "#d9d3c4"; w = H * 0.55; h = w * 0.58; mk("div", "position:absolute;left:" + px((W - w) / 2) + ";top:" + px((H - h) / 2) + ";width:" + px(w) + ";height:" + px(h) + ";background:#fff;border-radius:" + px(10 * u) + ";box-shadow:0 30px 60px rgba(0,0,0,.3)", inner); A(inner, h * 0.7, h * 0.7, "left:" + px((W - w) / 2 + h * 0.15) + ";top:" + px((H - h) / 2 + h * 0.15)); mk("div", "position:absolute;left:" + px((W - w) / 2 + h * 1.05) + ";top:" + px((H - h) / 2 + h * 0.25) + ";width:" + px(w - h * 1.2) + ";height:" + px(12 * u) + ";background:#222;border-radius:6px", inner); inner.style.transform = "rotateX(40deg) rotateZ(-22deg)"; }
      else { P.style.background = "linear-gradient(#0e1018,#1d2230)"; w = W * 0.7; h = w * 9 / 16; mk("div", "position:absolute;left:" + px((W - w) / 2 - 10) + ";top:" + px(H * 0.12 - 10) + ";width:" + px(w + 20) + ";height:" + px(h + 20) + ";background:#2a2f3d;border-radius:8px;box-shadow:0 0 90px rgba(80,120,255,.3)", inner); A(inner, w, h, "left:" + px((W - w) / 2) + ";top:" + px(H * 0.12)); mk("div", "position:absolute;left:0;right:0;bottom:0;height:" + px(H * 0.18) + ";background:#05060a", inner); }
      return { P: P, inner: inner };
    }
    kinds.forEach(function (k, i) { var pl = plateFor(k), t = at + i * each; tl.set(pl.P, { visibility: "visible" }, t); if (i < n - 1) tl.set(pl.P, { visibility: "hidden" }, t + each); tl.fromTo(pl.inner, { scale: 1 }, { scale: 1.07, duration: each, ease: o.ease }, t); });
    return { end: at + d, el: root };
  }, { duration: null, each: 2.6, ease: "power2.inOut", image: null, plates: ["flat", "hoarding", "binder", "kiosk", "card", "slide"] },
    { image: "the artwork shown on every plate", plates: "flat|hoarding|binder|kiosk|card|slide in order", each: "seconds per plate (2.5 to 3)" },
    "RasanMoves.mockupParade(tl, 0.2, { target: stage, image: RasanMoves.placeholder.art(3), each: 0.8 });");

  // ================================================================= 40 hold-and-sign-off
  def("hold-and-sign-off", 40, "holdAndSignOff", function (tl, at, o) {
    o = O("hold-and-sign-off", o); var S = setup(o), u = S.u, W = S.W, H = S.H, chars = o.tagline.length, typeD = chars * o.perChar, drawD = o.draw, d = drawD + 0.3 + typeD + o.hold;
    var root = layer(S.c, "background:" + (o.bg || "#0d0f14"));
    var ms = 340 * u, mk0 = svg('<svg viewBox="0 0 100 100" width="100%" height="100%"><path class="m" d="' + o.markPath + '" fill="' + o.accent + '" fill-opacity="0" stroke="' + o.accent + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>', "position:absolute;left:" + px((W - ms) / 2) + ";top:" + px(H * 0.17) + ";width:" + px(ms) + ";height:" + px(ms), root), path = mk0.querySelector(".m");
    var line = mk("div", "position:absolute;left:0;right:0;top:" + px(H * 0.66) + ";text-align:center;font:600 " + px(84 * u) + "/1.2 " + (o.font || FONT) + ";color:" + ink(o) + ";white-space:pre", root), a = mk("span", "", line), b = mk("span", "color:" + o.accent2, line), c2 = mk("span", "", line), caret = mk("span", "display:inline-block;width:" + px(4 * u) + ";height:" + px(76 * u) + ";background:" + ink(o) + ";vertical-align:middle;margin-left:3px;opacity:0", line);
    var idx = o.tagline.indexOf(o.accentWord), i0 = idx < 0 ? chars : idx, i1 = idx < 0 ? chars : idx + o.accentWord.length;
    prog(tl, at, drawD, "power2.inOut", function (p) { path.setAttribute("stroke-dashoffset", String((1 - Math.min(1, p / 0.8)).toFixed(4))); path.setAttribute("fill-opacity", String(clamp((p - 0.7) / 0.3, 0, 1).toFixed(3))); });
    var t1 = at + drawD + 0.3;
    prog(tl, t1, typeD, "none", function (p) { var n = Math.floor(p * chars + 1e-9), s = o.tagline; a.textContent = s.slice(0, Math.min(n, i0)); b.textContent = n > i0 ? s.slice(i0, Math.min(n, i1)) : ""; c2.textContent = n > i1 ? s.slice(i1, n) : ""; caret.style.opacity = p > 0 && p < 1 ? "1" : "0"; });
    var grain = mk("canvas", "position:absolute;inset:0;width:100%;height:100%;mix-blend-mode:overlay;opacity:.18;pointer-events:none", root); grain.width = 160; grain.height = 90; var gg = grain.getContext("2d"), gd = gg.createImageData(160, 90);
    prog(tl, at, d, "none", function (p) { var f = Math.floor(p * d * 12), dd = gd.data; for (var i = 0; i < 160 * 90; i++) { var v = Math.floor(rn(o.seed, i, f) * 255); dd[i * 4] = dd[i * 4 + 1] = dd[i * 4 + 2] = v; dd[i * 4 + 3] = 255; } gg.putImageData(gd, 0, 0); });
    return { end: at + d, el: root, holdFrom: t1 + typeD };
  }, { duration: null, draw: 1.1, perChar: 0.04, hold: 3, tagline: "Make something worth watching.", accentWord: "worth", markPath: "M50 8 L88 30 L88 70 L50 92 L12 70 L12 30 Z M50 34 L68 44 L68 62 L50 72 L32 62 L32 44 Z", accent: "#ff5a36", accent2: "#ffd23f", seed: 4, ink: null, bg: null, font: null },
    { tagline: "typed at 0.04 s per character", accentWord: "the one word in accent", markPath: "svg path d in a 0..100 box (the logo outline)", hold: "static hold seconds with micro-grain (3 to 5)" },
    "RasanMoves.holdAndSignOff(tl, 0.2, { target: stage, tagline: 'Make something worth watching.', accentWord: 'worth', hold: 1.2 });");

  // ================================================================= 41 ui-object-state-morph
  def("ui-object-state-morph", 41, "uiObjectStateMorph", function (tl, at, o) {
    o = O("ui-object-state-morph", o); var S = setup(o), u = S.u, W = S.W, H = S.H, states = o.states, hold = o.hold, mor = o.morph;
    var root = layer(S.c, "background:" + (o.bg || "#0d0f14"));
    var obj = mk("div", "position:absolute;left:50%;top:50%;overflow:hidden;background:#fff;color:#10131c;font:700 " + px(52 * u) + " " + FONT + ";box-shadow:0 30px 70px rgba(0,0,0,.45)", root);
    var inner = states.map(function (s, i) { var e = mk("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:" + px(16 * u) + ";opacity:" + (i ? 0 : 1) + ";padding:" + px(20 * u), obj); if (s.html) e.innerHTML = s.html; else { if (s.icon) icon(s.icon, (s.h || 120) * u * 0.42, s.fg || "#10131c", e); if (s.label) mk("span", "", e, s.label); if (s.badge != null) { var bd = mk("span", "background:#ff3b30;color:#fff;border-radius:99px;padding:" + px(6 * u) + " " + px(18 * u) + ";font-size:" + px(32 * u) + "px;font-variant-numeric:tabular-nums", e, "0"); e.__badge = bd; } } return e; });
    function box(s) { return { width: s.w * u, height: s.h * u, borderRadius: (s.r == null ? 24 : s.r) * u, xPercent: -50, yPercent: -50, x: (s.x || 0) * u, y: (s.y || 0) * u, backgroundColor: s.bg || "#fff", color: s.fg || "#10131c" }; }
    gsap.set(obj, box(states[0]));
    var t = at;
    states.forEach(function (s, i) {
      if (i > 0) {
        tl.to(obj, Object.assign(box(s), { duration: mor, ease: o.ease }), t);
        tl.to(inner[i - 1], { opacity: 0, duration: mor * 0.4, ease: "power1.in" }, t).to(inner[i], { opacity: 1, duration: mor * 0.5, ease: "power1.out" }, t + mor * 0.45);
        t += mor;
      }
      if (inner[i].__badge) { var bd = inner[i].__badge, target = s.badge, e = ez("power2.in"); prog(tl, t, hold, "none", function (p) { bd.textContent = Math.round(e(p) * target).toLocaleString("en-US"); }); }
      t += hold;
    });
    return { end: t, el: obj };
  }, { duration: null, hold: 0.7, morph: 0.7, ease: "power3.inOut", states: [{ w: 760, h: 170, r: 85, label: "Now playing", icon: "play" }, { w: 900, h: 420, r: 50, label: "A card", icon: "star" }, { w: 520, h: 520, r: 260, label: "Cover", icon: "heart", bg: "#ff5a36", fg: "#fff" }, { w: 760, h: 190, r: 95, label: "Inbox", badge: 1684, icon: "doc" }], bg: null },
    { states: "[{w,h,r,x,y,bg,fg,label,icon,badge,html}] sizes in px at 1080p", hold: "seconds each state holds", morph: "seconds per state change" },
    "RasanMoves.uiObjectStateMorph(tl, 0.2, { target: stage });");

  // ---------------------------------------------------------------- registry
  API.moves = BYID;
  API.list = function () { return META.map(function (m) { var d = DEF[m.id]; return { id: m.id, n: m.n, fn: m.fn, duration: d.duration, ease: d.ease, params: m.params }; }); };
  API.examples = function () { var out = {}; META.forEach(function (m) { out[m.id] = { fn: "RasanMoves." + m.fn, example: m.example, defaults: JSON.parse(JSON.stringify(DEF[m.id])), params: m.params }; }); return out; };
  API.ready = function () { return Promise.all(PENDING.splice(0)).then(function () { return document.fonts && document.fonts.ready ? document.fonts.ready : null; }).then(function () { if (PENDING.length) return API.ready(); }); };
  return API;
});
