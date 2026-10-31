/* RasanSticker: sticker / maximalist-collage kit for paused GSAP timelines. Original code, RasanAI MIT. Seek-safe: DOM is built once, every
 * move is a tween/set on YOUR timeline; layout randomness is a seeded hash (no Math.random, no clock).
 *   var K = RasanSticker;
 *   var s = K.sticker(stage, { src: "assets/cat.png", w: 260, x: 700, y: 300, rotate: -8 });        // die-cut: white border + soft shadow
 *   var t = K.sticker(stage, { text: "NEW!", font: "900 90px Impact", color: "#ff3b6b", w: 240, x: 200, y: 120, rotate: 6 });
 *   K.slap(tl, s, { at: 0.6, from: "top" });                                  // slaps on: oversize + spin in, lands, shadow tightens (stuck down)
 *   var layout = K.scrapbook(stage, [s, t, ...], { seed: 4, area: [0, 0, 1920, 1080], tape: 3 });   // seeded scatter, overlaps on purpose
 *   K.slapAll(tl, layout.items, { at: 1, every: 0.22 });                      // one new thing every 0.22 s, each on top
 *   K.boil(tl, layout.items, { at: 0, duration: 8, fps: 8 });                 // the pile lives: +-1.2 deg step wobble on 8 fps, never smooth
 * die-cut = the image's own alpha: a stack of 8 white drop-shadows draws the border around any transparent PNG/SVG/text shape (cut-out cut-outs
 * from art.mjs cutout work best). `border` is in px at 1080p. The sticker shadow is a CSS variable so it can be tweened.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api; else root.RasanSticker = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";
  var VERSION = "1.0.0", zi = 10;
  function need(c, m) { if (!c) throw new Error("RasanSticker: " + m); }
  function hash(a, b) { var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function outline(b, c) { var o = [], n = 8, i; for (i = 0; i < n; i++) { var a = (i / n) * 6.2832; o.push("drop-shadow(" + (Math.cos(a) * b).toFixed(1) + "px " + (Math.sin(a) * b).toFixed(1) + "px 0 " + c + ")"); } return o.join(" "); }

  function sticker(stage, o) {
    need(stage && typeof document !== "undefined", "sticker: pass the stage element"); o = o || {};
    var b = o.border == null ? 10 : o.border, w = document.createElement("div"), inner;
    w.style.cssText = "position:absolute;left:0;top:0;width:" + (o.w || 240) + "px;--so:6px;--sb:14px;transform-origin:50% 50%;will-change:transform";
    if (o.src) { inner = document.createElement("img"); inner.src = o.src; inner.style.cssText = "display:block;width:100%;height:auto"; inner.alt = o.alt || ""; }
    else { inner = document.createElement("div"); inner.textContent = o.text || ""; inner.style.cssText = "display:block;text-align:center;white-space:pre;line-height:1;font:" + (o.font || "900 80px system-ui") + ";color:" + (o.color || "#111") + ";-webkit-text-stroke:" + (o.stroke || 0) + "px " + (o.strokeColor || "#000"); if (o.html) inner.innerHTML = o.html; }
    // border first (white, hard), then the soft shadow under it; shadow offset reads the CSS vars so a slap can tighten it
    inner.style.filter = outline(b, o.borderColor || "#fff") + " drop-shadow(0 var(--so) var(--sb) rgba(0,0,0,.38))";
    w.appendChild(inner); stage.appendChild(w);
    var S = { el: w, x: o.x || 0, y: o.y || 0, rotate: o.rotate || 0, scale: o.scale || 1, w: o.w || 240, border: b };
    w.style.zIndex = ++zi; gsap.set(w, { x: S.x, y: S.y, rotation: S.rotate, scale: S.scale, opacity: 0 });
    return S;
  }
  // tape / paper scrap helpers (flat DIVs, original shapes)
  function tape(stage, o) { o = o || {}; var t = document.createElement("div"); t.style.cssText = "position:absolute;left:0;top:0;width:" + (o.w || 120) + "px;height:" + (o.h || 34) + "px;background:" + (o.color || "rgba(255,226,120,.82)") + ";clip-path:polygon(2% 0,98% 6%,100% 94%,0 100%);z-index:" + (++zi); stage.appendChild(t); gsap.set(t, { x: o.x || 0, y: o.y || 0, rotation: o.rotate || 0, opacity: 0 }); return { el: t, x: o.x || 0, y: o.y || 0 }; }
  function scrap(stage, o) { o = o || {}; var t = document.createElement("div"), w = o.w || 300, h = o.h || 220; t.style.cssText = "position:absolute;left:0;top:0;width:" + w + "px;height:" + h + "px;background:" + (o.color || "#f4efe4") + ";clip-path:polygon(1% 4%,30% 0,62% 3%,99% 0,100% 40%,97% 72%,100% 100%,55% 97%,20% 100%,0 96%,3% 55%);box-shadow:0 8px 20px rgba(0,0,0,.25);z-index:" + (++zi); stage.appendChild(t); gsap.set(t, { x: o.x || 0, y: o.y || 0, rotation: o.rotate || 0, opacity: 0 }); return { el: t, x: o.x || 0, y: o.y || 0 }; }

  // slap on: arrives oversize (scale 1.6) and tilted 25 deg off its rest angle from an edge, lands with a small bounce, the shadow starts big
  // (it is in the air) and snaps tight (it is stuck down) on the landing frame; lands on top (zIndex set at the landing time)
  function slap(tl, s, o) {
    o = o || {}; var at = o.at || 0, d = o.duration || 0.38, from = o.from || "top", L = 520, off = { top: [0, -L], bottom: [0, L], left: [-L, 0], right: [L, 0], none: [0, 0] }[from] || [0, -L], spin = o.spin == null ? 25 : o.spin;
    tl.set(s.el, { zIndex: ++zi }, at)
      .fromTo(s.el, { opacity: 0, scale: s.scale * 1.6, x: s.x + off[0], y: s.y + off[1], rotation: s.rotate + spin }, { opacity: 1, scale: s.scale, x: s.x, y: s.y, rotation: s.rotate, duration: d, ease: "back.out(1.6)" }, at)
      .fromTo(s.el, { "--so": "34px", "--sb": "40px" }, { "--so": "5px", "--sb": "12px", duration: d * 0.5, ease: "power4.in" }, at + d * 0.5);
    return at + d;
  }
  function slapAll(tl, items, o) { o = o || {}; var froms = ["top", "left", "right", "bottom"], at = o.at || 0, every = o.every || 0.22; items.forEach(function (s, i) { if (s.el.style.width && s.border != null) slap(tl, s, { at: at + i * every, from: o.from || froms[Math.floor(hash(i, o.seed || 0) * 4)], duration: o.duration }); else tl.set(s.el, { opacity: 1 }, at + i * every); }); return at + items.length * every; }

  // scrapbook: jittered grid layout (seeded), rotation +-rot deg, scale 0.85..1.15, deliberate overlaps; mutates s.x/s.y/s.rotate/s.scale and
  // sets their start poses. Optional tape strips on `tape` items. Returns { items }. Call BEFORE slap/slapAll.
  function scrapbook(stage, items, o) {
    o = o || {}; var A = o.area || [0, 0, 1920, 1080], seed = o.seed || 0, rot = o.rot == null ? 14 : o.rot, n = items.length, cols = Math.ceil(Math.sqrt(n * (A[2] / A[3]))), rows = Math.ceil(n / cols), cw = A[2] / cols, ch = A[3] / rows, tapes = [];
    items.forEach(function (s, i) {
      var c = i % cols, r = Math.floor(i / cols), jx = (hash(i, seed + 1) - 0.5) * cw * 0.5, jy = (hash(i, seed + 2) - 0.5) * ch * 0.5;
      s.x = A[0] + c * cw + cw / 2 - s.w * 0.5 + jx; s.y = A[1] + r * ch + ch / 2 - s.w * 0.35 + jy; s.rotate = (hash(i, seed + 3) - 0.5) * 2 * rot; s.scale = 0.85 + hash(i, seed + 4) * 0.3;
      gsap.set(s.el, { x: s.x, y: s.y, rotation: s.rotate, scale: s.scale });
    });
    for (var t = 0; t < (o.tape || 0); t++) { var it = items[Math.floor(hash(t, seed + 9) * n)], tp = tape(stage, { x: it.x + it.w * 0.3, y: it.y - 10, rotate: (hash(t, seed + 5) - 0.5) * 50 }); tapes.push(tp); }
    return { items: items, tapes: tapes, cols: cols, rows: rows };
  }
  // boil: step-wobble every item on `fps` (default 8): rotation +-amp deg around its rest angle, by held frames, never smooth
  function boil(tl, items, o) {
    o = o || {}; var fps = o.fps || 8, at = o.at || 0, dur = o.duration || 4, amp = o.amp == null ? 1.2 : o.amp, n = Math.floor(dur * fps), i, k;
    items.forEach(function (s, i0) { for (k = 0; k < n; k++) tl.set(s.el, { rotation: s.rotate + (hash(i0 * 131 + k, 7) - 0.5) * 2 * amp }, at + k / fps); });
  }
  return { version: VERSION, sticker: sticker, tape: tape, scrap: scrap, slap: slap, slapAll: slapAll, scrapbook: scrapbook, boil: boil };
});
