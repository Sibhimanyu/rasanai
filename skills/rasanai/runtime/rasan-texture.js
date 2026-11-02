/* global gsap */
/* RasanTexture: motion-texture and reference-move helpers for launch films. Original code, RasanAI MIT. (references/launch-grammar.md "Motion texture", references/launch-moves.md)
 *
 * Texture contrast (smooth / stepped / flicker / glitch). STEPPED IS FOR DISCRETE MOTION: pieces arriving or assembling in a collage, pop-ins and state changes, montage bursts, hits on the beat,
 * things that jump between positions. NEVER on a continuous single-direction move (scroll, pan, camera push, long glide, orbit rotation, slide-across): those stay fluid.
 * FLICKER is a flash-frame burst: one varying element in a locked layout, 2-3 frames per flash, 8-24 frames in all, landing on a held readable `final` (12+ frames) on the downbeat;
 * never unrelated metrics, 1-2 per film, and photosensitivity-safe (<= 3 high-contrast full-frame flashes per second; keep the ground constant, no black/white alternation, no saturated red).
 *   RasanTexture.stepped(tl, at, { build: function (inner) { inner.to(card, { x: -900, duration: 2 }) }, duration: 2, fps: 12 })   // a section that moves on twos/threes
 *   RasanTexture.stepsEase(12, 2)                                  // "steps(24)": a GSAP ease for ONE tween that should stutter (tl.to(el, { x: 400, duration: 2, ease: ... }))
 *   RasanTexture.flicker(tl, at, { target: stage, items: [elA, elB, "<div>stat</div>"], duration: 1.4, every: 2, fps: 30, final: 0 })   // a card/image swap burst, a new item every `every` frames
 *   RasanTexture.glitchPop(tl, at, { el: card, duration: 0.3, slices: 5, amp: 40, rgb: true })   // a pop-in with displaced clip-path slices and a 1-2 frame jitter
 * Reference moves (references/launch-moves.md):
 *   RasanTexture.objectSplitsWord(tl, at, { target, text: "here", splitAt: 1, object: { w: 150, h: 420, html: "..." } })
 *   RasanTexture.redactionSlash(tl, at, { target, word: "Woah", color: "#e5322d" })
 *   RasanTexture.slotList(tl, at, { target, items: ["direction", "design", "crafted"], fps: 10, duration: 2.4 })
 *   RasanTexture.scaleTransition(tl, at, { el, from: 6, to: 0.4, duration: 0.9, next: sceneElBehind })
 *   RasanTexture.irisThrough(tl, at, { target, keep: objectEl, cx: 0.5, cy: 0.5, color: "#0b0d12" })
 *   RasanTexture.cutsUnder(tl, at, { layers: [shotA, shotB, shotC], times: [0, 0.9, 1.7], end: 2.6 })   // persistent type over cuts: the type sits on a higher track
 *
 * Seek-safety (HyperFrames renders by seeking a paused timeline): every state is a tween on `tl`, or a DOM write inside a tween setter that is a PURE
 * function of that tween's progress (no Math.random: seeded hashes; no clock, no rAF, no timers). `stepped` drives a DETACHED paused helper timeline
 * from one tween on `tl`, quantising its time to 1/fps: seek to 3 s, then 1 s, then 3 s and the pixels are identical. Load after GSAP.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api; else root.RasanTexture = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var FONT = "Inter, 'Helvetica Neue', system-ui, -apple-system, sans-serif";
  function need(c, m) { if (!c) throw new Error("RasanTexture: " + m); }
  function R(x) { return typeof x === "string" ? document.querySelector(x) : x; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(a, b, c) { var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function mk(tag, css, parent, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
  function stage(o) { var c = R(o.target); need(c, "pass opts.target"); if (getComputedStyle(c).position === "static") c.style.position = "relative"; return { c: c, W: c.clientWidth || 1920, H: c.clientHeight || 1080, u: (c.clientHeight || 1080) / 1080 }; }
  // a tween of progress 0..1 whose setter (and first draw) is a pure function of p
  function prog(tl, at, d, ease, fn) {
    need(tl && typeof tl.fromTo === "function", "pass a GSAP timeline as the first argument");
    var o = {}, v = 0;
    Object.defineProperty(o, "p", { get: function () { return v; }, set: function (x) { v = x; fn(x); }, enumerable: true });
    tl.fromTo(o, { p: 0 }, { p: 1, duration: Math.max(1e-4, d), ease: ease || "none", immediateRender: true }, at);
    return o;
  }
  function px(n) { return Math.round(n * 100) / 100 + "px"; }
  function asEl(x, parent, css) { if (typeof x === "string") { var e = mk("div", css, parent); e.innerHTML = x; return e; } if (x.parentNode !== parent) parent.appendChild(x); return x; }

  var API = { VERSION: "1.0.0" };

  // ------------------------------------------------------------ stepped (on twos / threes)
  // GSAP ease for one tween that should stutter: fps frames per second over `duration` seconds
  API.stepsEase = function (fps, duration) { return "steps(" + Math.max(1, Math.round((fps || 12) * (duration || 1))) + ")"; };

  // A whole section on twos/threes: build(inner) fills a DETACHED paused timeline (positions in 0..duration); one tween on `tl` seeks it to floor(t*fps)/fps.
  API.stepped = function (tl, at, o) {
    need(typeof o.build === "function", "stepped needs opts.build(inner)"); need(typeof gsap !== "undefined", "gsap is not loaded");
    var fps = o.fps || 12, d = o.duration || 1, inner = gsap.timeline({ paused: true });
    o.build(inner);
    var D = Math.max(d, inner.duration());
    prog(tl, at, D, "none", function (p) { var t = p * D; inner.time(Math.min(D, Math.floor(t * fps + 1e-6) / fps), false); });
    return { end: at + D, inner: inner };
  };

  // ------------------------------------------------------------ flicker montage
  // items: elements, selectors or html strings stacked in `target`; one is shown per `every` frames (seeded order, never the same twice in a row), then `final` stays
  API.flicker = function (tl, at, o) {
    var S = stage(o), fps = o.fps || 30, every = Math.max(1, o.every || 2), d = o.duration || 1.2, seed = o.seed | 0, host = mk("div", "position:absolute;inset:0;overflow:hidden", S.c);
    var els = (o.items || []).map(function (x) { var e = asEl(typeof x === "string" && x.charAt(0) !== "<" ? R(x) : x, host, "position:absolute;inset:0;display:flex;align-items:center;justify-content:center"); e.style.position = "absolute"; e.style.display = "none"; return e; });
    need(els.length >= 2, "flicker needs 2+ items");
    var n = els.length, frames = Math.max(1, Math.floor(d * fps / every)), fin = o.final == null ? n - 1 : o.final, order = [], last = -1;
    for (var f = 0; f < frames; f++) { var k = Math.floor(hash(seed, f, 3) * n); if (k === last) k = (k + 1) % n; if (k === fin && f === frames - 1) k = (k + 1) % n; order.push(k); last = k; }
    var shown = -2;
    prog(tl, at, d, "none", function (p) {
      var f = Math.floor(p * frames - 1e-6), idx = p >= 1 ? fin : order[clamp(f, 0, frames - 1)];
      if (idx === shown) return; shown = idx; for (var i = 0; i < n; i++) els[i].style.display = i === idx ? "flex" : "none";
    });
    return { end: at + d, el: host, items: els };
  };

  // ------------------------------------------------------------ glitch pop-in
  // el pops in with displaced slices (clip-path) and a 1-2 frame jitter; clean on its last frame. Clones are made once; each frame's offsets are seeded.
  API.glitchPop = function (tl, at, o) {
    var el = R(o.el); need(el && el.parentNode, "glitchPop needs opts.el inside the DOM");
    var fps = o.fps || 24, d = o.duration || 0.3, slices = o.slices || 5, amp = o.amp || 40, seed = o.seed | 0, frames = Math.max(2, Math.round(d * fps)), parent = el.parentNode;
    var cs = getComputedStyle(parent); if (cs.position === "static") parent.style.position = "relative";
    function clone(css) { var c = el.cloneNode(true); c.removeAttribute("id"); c.setAttribute("aria-hidden", "true"); c.style.cssText += ";pointer-events:none;" + css; parent.appendChild(c); return c; }
    var layers = []; for (var i = 0; i < slices; i++) layers.push(clone("clip-path:inset(" + (100 * i / slices).toFixed(2) + "% 0 " + (100 - 100 * (i + 1) / slices).toFixed(2) + "% 0);visibility:hidden"));
    var rgb = o.rgb ? [clone("mix-blend-mode:screen;opacity:.7;visibility:hidden;filter:drop-shadow(0 0 0 #ff2d55)"), clone("mix-blend-mode:screen;opacity:.7;visibility:hidden;filter:drop-shadow(0 0 0 #19d3ff)")] : [];
    function frame(f) { // f = -1: before; f >= frames: clean
      var live = f >= 0 && f < frames;
      el.style.visibility = f < 0 ? "hidden" : live && f < frames - 1 ? "hidden" : "visible";
      layers.forEach(function (c, i) { c.style.visibility = live && f < frames - 1 ? "visible" : "hidden"; if (live) { var a = (hash(seed, f, i) - 0.5) * 2 * amp * (1 - f / frames); c.style.transform = "translateX(" + px(a) + ")"; } });
      rgb.forEach(function (c, i) { c.style.visibility = live ? "visible" : "hidden"; if (live) c.style.transform = "translateX(" + px((i ? 1 : -1) * amp * 0.3 * (1 - f / frames)) + ")"; });
    }
    prog(tl, at, d, "none", function (p) { frame(p >= 1 ? frames : Math.floor(p * frames - 1e-6)); });
    return { end: at + d, el: el };
  };

  // ------------------------------------------------------------ reference moves
  // The object splits the word: the word's two halves are pushed apart by the object's width, the text racks out of focus, the object rises through the gap sharp.
  API.objectSplitsWord = function (tl, at, o) {
    var S = stage(o), u = S.u, d = o.duration || 1.4, text = o.text || "here", cut = clamp(o.splitAt == null ? Math.floor(text.length / 2) : o.splitAt, 1, text.length - 1);
    var host = mk("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center", S.c);
    var row = mk("div", "position:relative;display:flex;align-items:center;font:" + (o.weight || 700) + " " + px((o.size || 300) * u) + "/1 " + (o.font || FONT) + ";color:" + (o.ink || "#111") + ";white-space:pre", host);
    var a = mk("span", "display:inline-block", row, text.slice(0, cut)), b = mk("span", "display:inline-block", row, text.slice(cut));
    var ob = o.object || {}, w = (ob.w || 150) * u, h = (ob.h || 420) * u;
    var obj = mk("div", "position:absolute;left:" + px(a.offsetWidth) + ";top:50%;width:" + px(w) + ";height:" + px(h) + ";margin-left:" + px(-w / 2) + ";margin-top:" + px(-h / 2) + ";border-radius:" + px(w * 0.28) + ";background:" + (ob.bg || "#fff") + ";box-shadow:0 30px 80px rgba(0,0,0,.25);overflow:hidden;z-index:2", row);
    if (ob.html) obj.innerHTML = ob.html;
    var ease = o.ease || "power3.inOut", blur = (o.blur == null ? 14 : o.blur) * u;
    gsap.set(obj, { y: h * 1.2 }); gsap.set(a, { x: 0 }); gsap.set(b, { x: 0 });
    tl.to(obj, { y: 0, duration: d * 0.55, ease: ease }, at);
    tl.to(a, { x: -w / 2, duration: d * 0.55, ease: ease }, at).to(b, { x: w / 2, duration: d * 0.55, ease: ease }, at);
    tl.fromTo([a, b], { filter: "blur(0px)" }, { filter: "blur(" + blur + "px)", duration: d * 0.45, ease: "power2.out" }, at + d * 0.1);
    return { end: at + d, el: host, word: [a, b], object: obj, row: row };
  };

  // The redaction slash: a bar cuts across the middle of the word (the object acts on the word; nothing underlines it).
  API.redactionSlash = function (tl, at, o) {
    var S = stage(o), u = S.u, d = o.duration || 0.5, host = mk("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center", S.c);
    var pill = mk("div", "position:relative;display:inline-block;padding:" + px(40 * u) + " " + px(90 * u) + ";border-radius:999px;background:" + (o.pillBg || "#fff") + ";font:" + (o.weight || 800) + " " + px((o.size || 220) * u) + "/1 " + (o.font || FONT) + ";color:" + (o.ink || "#111"), host, o.word || "Woah");
    var bar = mk("div", "position:absolute;left:-4%;width:108%;top:50%;height:" + px((o.barH || 30) * u) + ";margin-top:" + px(-(o.barH || 30) * u / 2) + ";background:" + (o.color || "#e5322d") + ";transform-origin:0 50%;transform:rotate(" + (o.angle == null ? -6 : o.angle) + "deg) scaleX(0)", pill);
    tl.to(bar, { scaleX: 1, duration: d, ease: "expo.out" }, at);
    if (o.shrink !== false) tl.to(pill, { scale: 0.001, duration: 0.45, ease: "power3.in" }, at + d + (o.hold == null ? 0.5 : o.hold));
    return { end: at + d + (o.hold == null ? 0.5 : o.hold) + 0.45, el: host, bar: bar };
  };

  // The slot-machine list: a column of words steps through a fixed focus mark; the focused row is ink, the rest faded.
  API.slotList = function (tl, at, o) {
    var S = stage(o), u = S.u, items = o.items || ["one", "two", "three", "four"], n = items.length, rowH = (o.rowH || 150) * u, fps = o.fps || 10, d = o.duration || 2.4;
    var host = mk("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:" + px(60 * u), S.c);
    if (o.lead) mk("div", "font:700 " + px((o.size || 110) * u) + "/1 " + (o.font || FONT) + ";color:" + (o.ink || "#111"), host, o.lead);
    var win = mk("div", "position:relative;height:" + px(rowH * 3) + ";overflow:hidden;min-width:" + px(700 * u), host), col = mk("div", "position:absolute;left:0;top:" + px(rowH) + ";width:100%", win);
    var rows = items.map(function (t) { return mk("div", "height:" + px(rowH) + ";line-height:" + px(rowH) + ";font:700 " + px((o.size || 110) * u) + "/" + px(rowH) + " " + (o.font || FONT) + ";color:" + (o.ink || "#111"), col, t); });
    var steps = Math.max(1, Math.round(d * fps)), shown = -1;
    prog(tl, at, d, "power2.out", function (p) { // p is eased; quantise to the stepped frame, land exactly on the last item
      var f = p >= 1 ? steps : Math.floor(p * steps), pos = clamp((f / steps) * (n - 1), 0, n - 1), idx = Math.round(pos);
      if (idx === shown && p < 1) return; shown = idx;
      col.style.transform = "translateY(" + px(-pos * rowH) + ")"; rows.forEach(function (r, i) { r.style.opacity = i === idx ? "1" : "0.18"; });
    });
    return { end: at + d, el: host };
  };

  // Scale as transition: the line starts frame-filling (or tiny) and scales continuously; the zoom IS the cut. `next` (optional) is revealed behind it as it passes.
  API.scaleTransition = function (tl, at, o) {
    var el = R(o.el); need(el, "scaleTransition needs opts.el"); var d = o.duration || 0.9;
    tl.fromTo(el, { scale: o.from == null ? 6 : o.from, transformOrigin: o.origin || "50% 50%" }, { scale: o.to == null ? 0.4 : o.to, duration: d, ease: o.ease || "expo.out" }, at);
    if (o.next) { var nx = R(o.next); tl.fromTo(nx, { autoAlpha: 0 }, { autoAlpha: 1, duration: d * 0.5, ease: "power1.out" }, at + d * 0.5); }
    return { end: at + d, el: el };
  };

  // Iris through an object: a dark ring closes in on the object (kept above the overlay) until the frame is dark and the object survives the cut.
  API.irisThrough = function (tl, at, o) {
    var S = stage(o), d = o.duration || 0.8, cx = (o.cx == null ? 0.5 : o.cx) * 100, cy = (o.cy == null ? 0.5 : o.cy) * 100, col = o.color || "#0b0d12", diag = Math.sqrt(S.W * S.W + S.H * S.H) / 2;
    var ov = mk("div", "position:absolute;inset:0;z-index:5;pointer-events:none", S.c);
    var keep = o.keep ? R(o.keep) : null; if (keep) { if (getComputedStyle(keep).position === "static") keep.style.position = "relative"; keep.style.zIndex = "6"; }
    var r1 = (o.rEnd == null ? 0 : o.rEnd) * S.u;
    prog(tl, at, d, o.ease || "power3.inOut", function (p) { var r = diag * (1 - p) + r1 * p; ov.style.background = "radial-gradient(circle at " + cx + "% " + cy + "%, rgba(0,0,0,0) " + px(Math.max(0, r - 2)) + ", " + col + " " + px(Math.max(0, r)) + ")"; });
    return { end: at + d, el: ov };
  };

  // Persistent type over cuts: shots are shown one at a time on the beat while the type (on a higher track) never moves. Times are seconds from `at`.
  API.cutsUnder = function (tl, at, o) {
    var layers = (o.layers || []).map(R), times = o.times || [], end = o.end == null ? (times[times.length - 1] || 0) + 1 : o.end;
    need(layers.length && layers.length === times.length, "cutsUnder needs layers[] and times[] of the same length");
    layers.forEach(function (l, i) { tl.set(l, { autoAlpha: 0 }, 0); tl.set(l, { autoAlpha: 1 }, at + times[i]); tl.set(l, { autoAlpha: 0 }, at + (i + 1 < times.length ? times[i + 1] : end)); });
    return { end: at + end };
  };

  return API;
});
