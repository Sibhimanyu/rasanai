/* RasanCamera: product cinematography for HyperFrames compositions (a 3D world rig from a focal length, camera legs,
 * depth of field by distance with rack focus, contact shadows, a shadow ladder, glass, brand-colour rim light, a light
 * comet, a key light, a tinted living ground, speed-driven blur trails, grain, halation, chromatic split, sheen, burst).
 *
 * One clock: every state (camera, layers, focus, light, ground drift, grain) is a PURE function of the scene's timeline
 * time T. The kit adds linear "clock" tweens to the paused timeline you pass in; their setters read tl.time() and
 * redraw. So a frame depends only on T: seek anywhere, in any order, any number of times, the pixels are the same.
 * No Math.random, no wall clock, no rAF. Without a timeline (a still), call cam.seek(T); it renders T=0 by itself.
 *
 *   <script src="assets/gsap/gsap.min.js"></script>          (HyperFrames' GSAP; optional for stills)
 *   <script src="assets/rasan-camera/rasan-camera.js"></script>
 *
 *   var tl = gsap.timeline({ paused: true });
 *   var cam = RasanCamera.stage(root, { lens_mm: 35, tl: tl, duration: 6 });
 *   cam.ground({ tint: "#f3efe9", falloff: 10, blobs: ["#ffb38a", "#b9d3c2"] });
 *   cam.keyLight({ side: "top-left", color: "#fff6ea", intensity: 0.8, vignette: 0.18 });
 *   cam.place(word,  { x: 960, y: 520, z: -1400, keepSize: true });
 *   cam.place(strip, { x: 960, y: 540, z: 0, ry: -8 });
 *   cam.glass(strip); cam.shadowLadder(strip, { elevation: 3 });
 *   cam.dof({ focus: strip, aperture: 1.6 });
 *   cam.push(0.06, { at: 0, duration: 6, ease: "power1.out" });
 *   cam.rack(word, { at: 3.2, duration: 0.5 });
 *   cam.grain({ amount: 0.03 });
 *
 * Reference: references/cinematography.md (every recipe as calls, with the numbers and the reference film).
 */
(function (root) {
  "use strict";
  var VERSION = "1.0.0";
  var NS = "http://www.w3.org/2000/svg";
  var PI = Math.PI;
  var uid = 0;

  // ------------------------------------------------------------------ helpers
  function need(c, m) { if (!c) throw new Error("RasanCamera: " + m); }
  function one(x, scope) {
    if (typeof x === "string") { var e = (scope || document).querySelector(x) || document.querySelector(x); need(e, 'no element for "' + x + '"'); return e; }
    need(x && x.nodeType === 1, "expected an element or a selector");
    return x;
  }
  function opt(o, k, d) { return o && o[k] !== undefined && o[k] !== null ? o[k] : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function div(cls, css) { var d = document.createElement("div"); if (cls) d.className = cls; if (css) d.style.cssText = css; return d; }
  function svgEl(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  // seeded PRNG (mulberry32) and a stateless hash, same as RasanShape
  function rng(seed) {
    var a = (seed | 0) >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash1(x, seed) {
    var h = Math.imul((x | 0) + 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((seed | 0) + 1, 0x27D4EB2F);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // eases: GSAP's when it is loaded, else a small built-in set (stills work without GSAP)
  var EASES = {
    none: function (p) { return p; }, linear: function (p) { return p; },
    "sine.in": function (p) { return 1 - Math.cos(p * PI / 2); }, "sine.out": function (p) { return Math.sin(p * PI / 2); }, "sine.inOut": function (p) { return -(Math.cos(PI * p) - 1) / 2; },
    "expo.out": function (p) { return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); }, "expo.in": function (p) { return p <= 0 ? 0 : Math.pow(2, 10 * p - 10); },
    "expo.inOut": function (p) { return p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2; },
  };
  [1, 2, 3, 4].forEach(function (n) {
    var k = n + 1;
    EASES["power" + n + ".in"] = function (p) { return Math.pow(p, k); };
    EASES["power" + n + ".out"] = function (p) { return 1 - Math.pow(1 - p, k); };
    EASES["power" + n + ".inOut"] = function (p) { return p < 0.5 ? Math.pow(2 * p, k) / 2 : 1 - Math.pow(2 - 2 * p, k) / 2; };
  });
  function easeFn(e) {
    if (typeof e === "function") return e;
    var name = e || "power2.inOut";
    if (root.gsap && root.gsap.parseEase) { var f = root.gsap.parseEase(name); if (f) return f; }
    if (/^power\d$/.test(name)) name += ".out";
    return EASES[name] || EASES["power2.inOut"];
  }

  // colours: "#rgb", "#rrggbb", "rgb(...)" -> [r,g,b]
  function rgb(c) {
    if (Array.isArray(c)) return c.slice(0, 3);
    var s = String(c).trim(), m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return m[1].split("").map(function (h) { return parseInt(h + h, 16); });
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); });
    if ((m = /rgba?\(([^)]+)\)/i.exec(s))) return m[1].split(",").slice(0, 3).map(function (v) { return parseFloat(v); });
    return [128, 128, 128];
  }
  function rgba(c, a) { var v = rgb(c); return "rgba(" + Math.round(v[0]) + "," + Math.round(v[1]) + "," + Math.round(v[2]) + "," + r3(a === undefined ? 1 : a) + ")"; }
  function mixc(a, b, t) { a = rgb(a); b = rgb(b); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function luma(c) { var v = rgb(c); return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255; }
  // a shadow colour from the ground: the ground's own hue, much darker, a touch more saturated (never neutral black)
  function shadowOf(ground, strength) {
    var g = rgb(ground), m = (g[0] + g[1] + g[2]) / 3;
    var sat = g.map(function (v) { return m + (v - m) * 2.2; });
    var k = 0.16 + 0.1 * (1 - luma(ground));
    return sat.map(function (v) { return clamp(v * k * (strength || 1), 0, 255); });
  }

  // ------------------------------------------------------------------ 4x4 matrices (column-major, as CSS matrix3d)
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function T(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z || 0, 1]; }
  function S(x, y, z) { return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]; }
  function RX(d) { var a = d * PI / 180, c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function RY(d) { var a = d * PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  function RZ(d) { var a = d * PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }
  function ap(m, x, y, z) { z = z || 0; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
  function css3d(m) { return "matrix3d(" + m.map(function (v) { return Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6; }).join(",") + ")"; }

  // focal length (mm, 36 mm film back, the After Effects convention) -> CSS perspective in px for a frame `width` wide
  function perspectiveFor(mm, width) { return width * mm / 36; }

  // ------------------------------------------------------------------ chains: values over time
  // Abs: a base value and absolute targets; each segment eases from the value at its start to its target.
  // Add: a base value plus relative legs; concurrent legs add up (camera moves).
  function Abs(base) { this.base = base; this.seg = []; }
  Abs.prototype.to = function (v, at, dur, ease) { this.seg.push({ at: at, dur: Math.max(1e-4, dur), to: v, ease: easeFn(ease) }); this.seg.sort(function (a, b) { return a.at - b.at; }); };
  Abs.prototype.at = function (t, resolve) {
    var v = resolve ? resolve(this.base, t) : this.base;
    for (var i = 0; i < this.seg.length; i++) {
      var s = this.seg[i];
      if (t <= s.at) break;
      var p = clamp((t - s.at) / s.dur, 0, 1), to = resolve ? resolve(s.to, t) : s.to;
      v = v + (to - v) * s.ease(p);
    }
    return v;
  };
  Abs.prototype.end = function () { var e = 0; this.seg.forEach(function (s) { e = Math.max(e, s.at + s.dur); }); return e; };
  function Add(base) { this.base = base || 0; this.seg = []; }
  Add.prototype.by = function (d, at, dur, ease) { this.seg.push({ at: at, dur: Math.max(1e-4, dur), d: d, ease: easeFn(ease) }); };
  Add.prototype.at = function (t) {
    var v = this.base;
    for (var i = 0; i < this.seg.length; i++) { var s = this.seg[i]; if (t > s.at) v += s.d * s.ease(clamp((t - s.at) / s.dur, 0, 1)); }
    return v;
  };
  Add.prototype.end = Abs.prototype.end;

  // the one drive: a linear tween on a proxy whose setter redraws the stage at the timeline's own time
  function clockTween(tl, at, dur, fn) {
    var v = 0, o = {};
    Object.defineProperty(o, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; fn(); } });
    return tl.fromTo(o, { p: 0 }, { p: 1, duration: Math.max(1e-4, dur), ease: "none", immediateRender: false }, at);
  }

  // a 256 px seeded noise tile: each pixel is white or black with a small alpha (works on light and dark grounds)
  var noiseCache = {};
  function noiseTile(seed, size) {
    var key = seed + ":" + size;
    if (noiseCache[key]) return noiseCache[key];
    var c = document.createElement("canvas"); c.width = c.height = size;
    var x = c.getContext("2d"), img = x.createImageData(size, size), r = rng(seed);
    for (var i = 0; i < size * size; i++) {
      var v = (r() + r() + r()) / 3 - 0.5; // triangular-ish, mean 0
      var w = v > 0 ? 255 : 0;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = w;
      img.data[i * 4 + 3] = Math.round(Math.min(1, Math.abs(v) * 3.2) * 255);
    }
    x.putImageData(img, 0, 0);
    return (noiseCache[key] = c.toDataURL("image/png"));
  }

  function radiusOf(el) { var cs = getComputedStyle(el); return cs.borderRadius || "0px"; }
  function radiusPx(el) { var v = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0; return v; }
  function offsetIn(child, anc) {
    var x = 0, y = 0, e = child;
    while (e && e !== anc) { x += e.offsetLeft; y += e.offsetTop; var p = e.offsetParent; if (!p) break; e = p; }
    return [x, y];
  }
  function sideToXY(side) {
    if (Array.isArray(side)) return side;
    return ({ "top-left": [-0.05, -0.15], top: [0.5, -0.3], "top-right": [1.05, -0.15], left: [-0.3, 0.45], right: [1.3, 0.45], bottom: [0.5, 1.3], "bottom-left": [-0.05, 1.15], "bottom-right": [1.05, 1.15], center: [0.5, 0.45] })[side || "top-left"] || [-0.05, -0.15];
  }

  // ------------------------------------------------------------------ the stage
  function stage(rootEl, o) {
    o = o || {};
    var rootE = one(rootEl);
    var W = opt(o, "width", rootE.offsetWidth || 1920), H = opt(o, "height", rootE.offsetHeight || 1080);
    if (o.aspect && !o.height && !o.width) { var ar = String(o.aspect).split(/[:x/]/).map(Number); if (ar.length === 2 && ar[0] > 0) { if (ar[0] >= ar[1]) H = Math.round(W * ar[1] / ar[0]); else W = Math.round(H * ar[0] / ar[1]); } }
    var lens0 = opt(o, "lens_mm", 35);
    var origin = opt(o, "origin", [0.5, 0.5]);
    var C = [W * origin[0], H * origin[1]];
    var tl = o.tl || null;
    var fps = opt(o, "fps", 30);
    var id = "rc" + (++uid);
    var trailsOpt = opt(o, "trails", true);

    if (getComputedStyle(rootE).position === "static") rootE.style.position = "relative";
    var st = div("rc-stage", "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;overflow:hidden;z-index:0;pointer-events:none;");
    var groundL = div("rc-ground", "position:absolute;inset:0;overflow:hidden;");
    var floorL = div("rc-floor", "position:absolute;inset:0;");
    var view = div("rc-view", "position:absolute;inset:0;perspective-origin:" + C[0] + "px " + C[1] + "px;");
    var world = div("rc-world", "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;transform-style:preserve-3d;transform-origin:0 0 0;");
    var fx = div("rc-fx", "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;overflow:hidden;z-index:50;pointer-events:none;");
    var defs = svgEl("svg", { width: "0", height: "0", style: "position:absolute;width:0;height:0" });
    st.appendChild(defs); st.appendChild(groundL); st.appendChild(floorL); view.appendChild(world); st.appendChild(view);
    rootE.insertBefore(st, rootE.firstChild);
    rootE.appendChild(fx);

    var cam = {
      x: new Add(), y: new Add(), dolly: new Add(), pan: new Add(), tilt: new Add(), roll: new Add(), orbitY: new Add(), orbitX: new Add(),
      lens: new Abs(lens0), mag: new Abs(1), persp: new Abs(lens0),
      target: [0, 0, 0], drifts: [],
    };
    var dof = { on: false, focus: new Abs(0), aperture: new Abs(1.5), max: 5, haze: 0, levels: 3, fray: 0 };
    var layers = [], extras = [], budget = {}, version = 0, lastT = 0, lastKey = "", lifeTween = null;
    var dur = opt(o, "duration", null);
    if (dur === null) { var dn = rootE.closest ? rootE.closest("[data-duration]") : null; if (dn) dur = parseFloat(dn.getAttribute("data-duration")) || null; }
    var groundState = null, keyState = null, grainState = null, trailK = 1;

    function spend(k) { budget[k] = (budget[k] || 0) + 1; }
    function bump() { version++; if (!tl) render(lastT); else render(tl.time()); }
    function addClock(at, d) {
      if (!tl) return;
      clockTween(tl, at, d, function () { render(tl.time()); });
    }
    function life(d) {
      if (!tl || !(d > 0)) return;
      if (lifeTween) { if (d > lifeTween.duration()) lifeTween.duration(d); return; }
      lifeTween = clockTween(tl, 0, d, function () { render(tl.time()); });
    }
    if (dur) life(dur);
    function leg(at, d) { addClock(at, d); if (!dur) life(at + d); }

    // ---------------------------------------------------------------- camera state at time t
    function camAt(t) {
      var c = { x: cam.x.at(t), y: cam.y.at(t), dolly: cam.dolly.at(t), pan: cam.pan.at(t), tilt: cam.tilt.at(t), roll: cam.roll.at(t), oy: cam.orbitY.at(t), ox: cam.orbitX.at(t), mag: cam.mag.at(t), persp: cam.persp.at(t) };
      for (var i = 0; i < cam.drifts.length; i++) {
        var d = cam.drifts[i], from = d.from, to = d.to === null ? (dur || from + 8) : d.to;
        var p = clamp((t - from) / Math.max(1e-3, to - from), 0, 1);
        if (t < from) continue;
        c.dolly += d.push * perspectiveFor(c.persp, W) * EASES["sine.inOut"](p);
        var w = 2 * PI * (t - from) / d.period;
        c.pan += d.sway * Math.sin(w + d.ph1);
        c.tilt += d.sway * 0.6 * Math.sin(w * 0.73 + d.ph2);
        c.x += d.float * Math.sin(w * 0.61 + d.ph3);
        c.y += d.float * 0.7 * Math.sin(w * 0.89 + d.ph1);
      }
      c.P = perspectiveFor(c.persp, W);
      var tg = cam.target;
      c.M = chain(T(C[0], C[1], 0), S(c.mag, c.mag, 1), T(0, 0, c.P), RZ(c.roll), RX(c.tilt), RY(c.pan), T(0, 0, -c.P),
        T(-c.x, -c.y, c.dolly), T(tg[0], tg[1], tg[2]), RX(-c.ox), RY(-c.oy), T(-tg[0], -tg[1], -tg[2]), T(-C[0], -C[1], 0));
      return c;
    }
    function project(c, p) { var d = Math.max(1, c.P - p[2]), k = c.P / d; return [C[0] + (p[0] - C[0]) * k, C[1] + (p[1] - C[1]) * k, d]; }

    // ---------------------------------------------------------------- layers
    function layerOf(el) { el = one(el, rootE); for (var i = 0; i < layers.length; i++) if (layers[i].el === el) return layers[i]; return null; }
    function needLayer(el, what) { var L = layerOf(el); need(L, what + ": place() the element first"); return L; }

    function layerMatrix(L, t, c) {
      var x = L.ch.x.at(t), y = L.ch.y.at(t), z = L.ch.z.at(t), s = L.ch.scale.at(t);
      if (L.keepSize) s *= (perspectiveFor(cam.persp.at(t), W) - z) / perspectiveFor(cam.persp.at(t), W);
      return chain(T(x, y, z), RX(L.ch.rx.at(t)), RY(L.ch.ry.at(t)), RZ(L.ch.rz.at(t)), S(s, s, s), T(-L.ax, -L.ay, 0));
    }
    function layerScreen(L, t, c) {
      var F = mul(c.M, layerMatrix(L, t, c));
      return project(c, ap(F, L.w / 2, L.h / 2, 0));
    }

    function place(el, p) {
      p = p || {};
      el = one(el, rootE);
      var L = layerOf(el);
      if (!L) {
        var w = el.offsetWidth, h = el.offsetHeight;
        var wrap = div("rc-layer", "position:absolute;left:0;top:0;width:" + w + "px;height:" + h + "px;transform-origin:0 0 0;");
        var band0 = div("rc-band", "position:absolute;inset:0;");
        var under = div("rc-under", "position:absolute;inset:0;");
        var over = div("rc-over", "position:absolute;inset:0;pointer-events:none;");
        world.appendChild(wrap); wrap.appendChild(under); wrap.appendChild(band0); band0.appendChild(el); wrap.appendChild(over);
        el.style.position = "absolute"; el.style.left = "0px"; el.style.top = "0px"; el.style.margin = "0";
        L = { el: el, wrap: wrap, under: under, over: over, bands: [band0], w: w, h: h, ax: w / 2, ay: h / 2, html: null, ch: {}, extra: { glow: null, chroma: null, shadowAlpha: null }, floor: null, rid: id + "l" + layers.length };
        ["x", "y", "z", "rx", "ry", "rz", "scale", "opacity", "chroma", "glow"].forEach(function (k) { L.ch[k] = new Abs(k === "scale" || k === "opacity" ? 1 : 0); });
        L.ch.x.base = C[0]; L.ch.y.base = C[1];
        layers.push(L);
      }
      if (p.anchor !== undefined) {
        if (Array.isArray(p.anchor)) { L.ax = p.anchor[0] * L.w; L.ay = p.anchor[1] * L.h; }
        else { var ch = one(p.anchor, el), off = offsetIn(ch, el); L.ax = off[0] + ch.offsetWidth / 2; L.ay = off[1] + ch.offsetHeight / 2; L.anchorEl = ch; }
      }
      if (p.at) { L.ch.x.base = p.at[0]; L.ch.y.base = p.at[1]; }
      ["x", "y", "z", "rx", "ry", "rz", "scale", "opacity"].forEach(function (k) { if (typeof p[k] === "number") L.ch[k].base = p[k]; });
      if (p.keepSize !== undefined) L.keepSize = !!p.keepSize;
      if (p.dof !== undefined) L.dof = p.dof;
      if (p.plane !== undefined) L.plane = p.plane;
      if (p.shade !== undefined) L.shade = p.shade;
      if (p.trail !== undefined) L.trail = p.trail;
      if (p.fray !== undefined) L.fray = p.fray;
      if (p.haze !== undefined) L.haze = p.haze;
      bump();
      return L.wrap;
    }
    function move(el, to, m) {
      m = m || {};
      var L = needLayer(el, "move");
      var at = opt(m, "at", 0), d = opt(m, "duration", 0.8), e = opt(m, "ease", "expo.out");
      ["x", "y", "z", "rx", "ry", "rz", "scale", "opacity"].forEach(function (k) { if (typeof to[k] === "number") L.ch[k].to(to[k], at, d, e); });
      if (to.at) { L.ch.x.to(to.at[0], at, d, e); L.ch.y.to(to.at[1], at, d, e); }
      leg(at, d); bump();
      return cam_api;
    }

    // ---------------------------------------------------------------- depth of field
    function focusDist(t, c) {
      return dof.focus.at(t, function (v, tt) {
        if (typeof v === "number") return 1 / Math.max(1, c.P - ap(c.M, C[0], C[1], v)[2]); // diopters: a rack eases in 1/distance
        var L = v; return 1 / layerScreen(L, tt, c)[2];
      });
    }
    function blurAt(dist, s, A, max) { return Math.min(max, A * Math.abs(1 - s / dist)); }

    // ---------------------------------------------------------------- filters
    function svgFilter(L) {
      if (L.svg) return L.svg;
      var f = svgEl("filter", { id: L.rid + "f", x: "-30%", y: "-30%", width: "160%", height: "160%", "color-interpolation-filters": "sRGB" });
      var gb = svgEl("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "0 0" });
      f.appendChild(gb); defs.appendChild(f);
      L.svg = { f: f, disp: null, gb: gb };
      return L.svg;
    }
    function extraFilters(L, t) {
      var out = "";
      var ch = L.ch.chroma.at(t);
      if (L.extra.chroma && ch > 0.05) {
        var a = L.extra.chroma.angle * PI / 180, dx = r2(Math.cos(a) * ch), dy = r2(Math.sin(a) * ch);
        out += " drop-shadow(" + dx + "px " + dy + "px 0 rgba(255,40,90," + L.extra.chroma.alpha + ")) drop-shadow(" + (-dx) + "px " + (-dy) + "px 0 rgba(30,190,255," + L.extra.chroma.alpha + "))";
      }
      var gl = L.ch.glow.at(t);
      if (L.extra.glow && gl > 0.01) {
        var g = L.extra.glow;
        out += " drop-shadow(0 0 " + r2(g.radius * 0.35) + "px " + rgba(g.color, 0.55 * gl) + ") drop-shadow(0 0 " + r2(g.radius) + "px " + rgba(g.color, 0.35 * gl) + ")";
      }
      if (L.extra.shadowAlpha) out += " " + L.extra.shadowAlpha;
      return out;
    }

    // keep the band copies of a plane in step with the original (content that types or counts)
    function syncBands(L) {
      if (L.bands.length < 2) return;
      var html = L.el.innerHTML;
      if (html !== L.html) {
        L.html = html;
        for (var i = 1; i < L.bands.length; i++) {
          var cl = L.bands[i].firstChild;
          cl.innerHTML = html;
        }
      }
      for (var j = 1; j < L.bands.length; j++) {
        var c2 = L.bands[j].firstChild;
        c2.className = L.el.className;
        c2.style.cssText = L.el.style.cssText;
        var src = L.el.querySelectorAll("canvas"), dst = c2.querySelectorAll("canvas");
        for (var k = 0; k < src.length && k < dst.length; k++) { dst[k].width = src[k].width; dst[k].height = src[k].height; dst[k].getContext("2d").drawImage(src[k], 0, 0); }
      }
    }
    function ensureBands(L, n) {
      while (L.bands.length < n) {
        var b = div("rc-band", "position:absolute;inset:0;");
        // the copy keeps its ids so id-based CSS still styles it; the original comes first in the document, so
        // getElementById / querySelector still find the original
        var cl = L.el.cloneNode(true);
        cl.setAttribute("aria-hidden", "true"); cl.setAttribute("data-rc-copy", String(L.bands.length));
        b.appendChild(cl);
        L.wrap.insertBefore(b, L.over);
        L.bands.push(b); L.html = null;
      }
      for (var i = 0; i < L.bands.length; i++) L.bands[i].style.display = i < n ? "" : "none";
    }

    // ---------------------------------------------------------------- render
    function renderLayer(L, t, c, cPrev, sInv, A) {
      var M = layerMatrix(L, t, c), F = mul(c.M, M);
      L.wrap.style.transform = css3d(M);
      var op = L.ch.opacity.at(t);
      L.wrap.style.opacity = op >= 0.999 ? "" : String(r3(op));
      var cen = project(c, ap(F, L.w / 2, L.h / 2, 0));
      var sc = cen[2] > 0 ? (c.mag * c.P / cen[2]) * Math.abs(L.ch.scale.at(t) || 1) : 1;
      var useDof = dof.on && L.dof !== false;
      var screenBlur = useDof ? blurAt(cen[2], 1 / sInv, A, dof.max * H / 100) : 0;
      // rotation of the plane against the camera: band it (tilt-shift) when it is laid back
      var gz = Math.hypot(F[2], F[6]);
      var isPlane = useDof && (L.plane === true || (L.plane !== false && gz > 0.22 && (L.w * L.h) > W * H * 0.06));
      var extra = extraFilters(L, t);
      // speed: the screen-space travel of the layer's centre over one frame, for the trail
      var tx = 0, ty = 0;
      if (cPrev && L.trail !== false) {
        var prev = layerScreen(L, t - 1 / fps, cPrev);
        var vx = cen[0] - prev[0], vy = cen[1] - prev[1], sp = Math.hypot(vx, vy);
        if (sp > 2) {
          var rz = (L.ch.rz.at(t) + c.roll) * PI / 180, lx = vx * Math.cos(-rz) - vy * Math.sin(-rz), ly = vx * Math.sin(-rz) + vy * Math.cos(-rz);
          tx = Math.abs(lx) * 0.25 * trailK / sc; ty = Math.abs(ly) * 0.25 * trailK / sc;
        }
      }
      // haze: layers behind the focus lose contrast and sink toward the ground
      var hz = 0;
      var hazeAmt = L.haze !== undefined ? L.haze : dof.haze;
      if (useDof && hazeAmt > 0) hz = clamp((cen[2] * sInv - 1), 0, 1.5) * hazeAmt;
      var hazeF = hz > 0.005 ? " contrast(" + r3(1 - 0.45 * hz) + ") saturate(" + r3(1 - 0.35 * hz) + ") brightness(" + r3(groundState && groundState.dark ? 1 - 0.35 * hz : 1 + 0.12 * hz) + ")" : "";

      if (isPlane) {
        var n = Math.max(2, dof.levels);
        var nx = F[2] / gz, ny = F[6] / gz;
        var corners = [[0, 0], [L.w, 0], [0, L.h], [L.w, L.h]].map(function (q) { return q[0] * nx + q[1] * ny; });
        var qmin = Math.min.apply(null, corners), qmax = Math.max.apply(null, corners), qc = (L.w / 2) * nx + (L.h / 2) * ny;
        var qspan = Math.abs(nx) + Math.abs(ny);
        var N = 18, bl = [], Lmax = 0, Lmin = 1e9;
        for (var i = 0; i <= N; i++) {
          var q = lerp(qmin, qmax, i / N), u = L.w / 2 + nx * (q - qc), v = L.h / 2 + ny * (q - qc);
          var pr = project(c, ap(F, u, v, 0));
          var lb = blurAt(pr[2], 1 / sInv, A, dof.max * H / 100) / Math.max(0.05, c.mag * c.P / pr[2] * Math.abs(L.ch.scale.at(t) || 1));
          bl.push(lb); if (lb > Lmax) Lmax = lb; if (lb < Lmin) Lmin = lb;
        }
        // band only when the blur really varies across the plane; an evenly soft plane takes one uniform blur
        if (Lmax < 0.6 || Lmax - Lmin < Math.max(1, 0.3 * Lmax)) isPlane = false;
        else {
          ensureBands(L, n); syncBands(L);
          var ang = r2(Math.atan2(nx, -ny) * 180 / PI);
          // the bands are larger than the element by a margin so the blurred copies' spill is not cut at the box edge;
          // the mask gradient runs over the larger box, so stop positions map from the element's own range into it
          var mg = Math.ceil(3 * Lmax) + 2, q0 = qmin - mg * qspan, q1 = qmax + mg * qspan;
          for (var bi = 0; bi < n; bi++) { var bs = L.bands[bi].style; bs.inset = (-mg) + "px"; }
          L.el.style.left = mg + "px"; L.el.style.top = mg + "px";
          if (L.bandMargin !== mg) { L.bandMargin = mg; syncBands(L); }
          // per sample, per level weights (hat functions), turned into stacked alphas: level k over level k-1
          for (var lv = 0; lv < n; lv++) {
            var stops = [];
            for (var i2 = 0; i2 <= N; i2++) {
              var f = bl[i2] / Lmax * (n - 1), wsum = 0, wk = 0;
              for (var j = 0; j <= lv; j++) { var wj = Math.max(0, 1 - Math.abs(f - j)); wsum += wj; if (j === lv) wk = wj; }
              var a = wsum > 1e-6 ? wk / wsum : 0;
              stops.push("rgba(0,0,0," + r3(a) + ") " + r2((lerp(qmin, qmax, i2 / N) - q0) / (q1 - q0) * 100) + "%");
            }
            var mask = "linear-gradient(" + ang + "deg," + stops.join(",") + ")";
            var bd = L.bands[lv];
            bd.style.webkitMaskImage = mask; bd.style.maskImage = mask;
            var lb2 = Lmax * lv / (n - 1);
            bd.style.filter = lb2 > 0.05 ? "blur(" + r2(lb2) + "px)" : "";
          }
          // glow, chromatic split and alpha shadows go on the whole layer, outside the masks
          L.wrap.style.filter = (extra + hazeF).trim();
          L.under.style.filter = "blur(" + r2(Lmax / 3) + "px)";
          L.bandsOn = true;
        }
      }
      if (!isPlane) {
        if (L.bandsOn) {
          for (var b = 0; b < L.bands.length; b++) { var bst = L.bands[b].style; bst.maskImage = ""; bst.webkitMaskImage = ""; bst.filter = ""; bst.inset = "0px"; bst.display = b === 0 ? "" : "none"; }
          L.el.style.left = "0px"; L.el.style.top = "0px"; L.bandMargin = 0;
          L.under.style.filter = ""; L.bandsOn = false;
        }
        var local = screenBlur / Math.max(0.05, sc);
        var fray = (L.fray !== undefined ? L.fray : dof.fray) * clamp(local / 6, 0, 1);
        var filt;
        if (tx > 0.3 || ty > 0.3 || fray > 0.05) {
          var sv = svgFilter(L);
          var sx = Math.sqrt(local * local + tx * tx), sy = Math.sqrt(local * local + ty * ty);
          sv.gb.setAttribute("stdDeviation", r2(sx) + " " + r2(sy));
          if (fray > 0.05 && !sv.disp) {
            // noise-displaced edges (Kinso's frayed defocus): turbulence -> displacement -> blur, only when asked
            var turb = svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: "0.085", numOctaves: "2", seed: String(3 + layers.indexOf(L)), result: "n" });
            sv.disp = svgEl("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "0", xChannelSelector: "R", yChannelSelector: "G", result: "d" });
            sv.f.insertBefore(sv.disp, sv.gb); sv.f.insertBefore(turb, sv.disp); sv.gb.setAttribute("in", "d");
          }
          if (sv.disp) sv.disp.setAttribute("scale", r2(fray * local * 2.6));
          var mx = clamp((3 * sx + fray * local) / Math.max(1, L.w), 0.05, 1.5), my = clamp((3 * sy + fray * local) / Math.max(1, L.h), 0.05, 1.5);
          sv.f.setAttribute("x", r3(-mx * 100) + "%"); sv.f.setAttribute("width", r3(100 + 200 * mx) + "%");
          sv.f.setAttribute("y", r3(-my * 100) + "%"); sv.f.setAttribute("height", r3(100 + 200 * my) + "%");
          filt = "url(#" + L.rid + "f)";
        } else filt = local > 0.05 ? "blur(" + r2(local) + "px)" : "";
        var full = (filt + extra + hazeF).trim();
        L.wrap.style.filter = full;
      }
      // shade: a soft falloff across a laid-back plane (farther = a touch darker), light from the key side
      if (L.shadeEl) {
        var amt = L.shade !== undefined ? L.shade : 0.07;
        if (gz > 0.08 && amt > 0) {
          var a2 = r2(Math.atan2(F[2] / gz, -F[6] / gz) * 180 / PI);
          var dark = groundState ? shadowOf(groundState.tint) : [20, 20, 30];
          // the gradient runs toward increasing depth (z up = nearer): far edge darker
          L.shadeEl.style.background = "linear-gradient(" + r2(a2 + 180) + "deg," + rgba([255, 255, 255], 0.06 * Math.min(1, gz * 2)) + " 0%," + rgba(dark, 0) + " 35%," + rgba(dark, amt * Math.min(1, gz * 1.6)) + " 100%)";
        } else L.shadeEl.style.background = "none";
      }
      // floor contact shadow: a 2D ellipse on the ground under the lowest edge of the object
      if (L.floor) {
        var pts = [[0, L.h], [L.w, L.h], [0, 0], [L.w, 0]].map(function (q) { return project(c, ap(F, q[0], q[1], 0)); });
        pts.sort(function (p1, p2) { return p2[1] - p1[1]; });
        var p1 = pts[0], p2 = pts[1], mxp = (p1[0] + p2[0]) / 2, myp = (p1[1] + p2[1]) / 2, len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * L.floor.width;
        var angf = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / PI; if (angf > 90) angf -= 180; if (angf < -90) angf += 180;
        var hgt = len * L.floor.squash, fb = L.floor.blur * H / 1080;
        var e1 = L.floor.el;
        e1.style.width = r2(len) + "px"; e1.style.height = r2(hgt) + "px";
        e1.style.transform = "translate(" + r2(mxp - len / 2) + "px," + r2(myp - hgt / 2 + L.floor.drop) + "px) rotate(" + r2(angf) + "deg)";
        e1.style.filter = "blur(" + r2(fb) + "px)";
        e1.style.opacity = String(r3(L.floor.opacity * op));
        if (L.floor.core) {
          var e2 = L.floor.core, l2 = len * 0.82, h2 = hgt * 0.32;
          e2.style.width = r2(l2) + "px"; e2.style.height = r2(h2) + "px";
          e2.style.transform = "translate(" + r2(mxp - l2 / 2) + "px," + r2(myp - h2 / 2 + L.floor.drop * 0.4) + "px) rotate(" + r2(angf) + "deg)";
          e2.style.filter = "blur(" + r2(fb * 0.28) + "px)";
          e2.style.opacity = String(r3(L.floor.opacity * op));
        }
      }
    }

    function renderGround(t) {
      if (groundState) {
        var g = groundState;
        for (var i = 0; i < g.blobs.length; i++) {
          var b = g.blobs[i], w = 2 * PI * t / g.period;
          var dx = g.drift * W * Math.sin(w * b.f1 + b.p1), dy = g.drift * H * Math.cos(w * b.f2 + b.p2);
          var s = 1 + 0.06 * Math.sin(w * b.f2 + b.p1);
          b.el.style.transform = "translate(" + r2(b.x + dx) + "px," + r2(b.y + dy) + "px) scale(" + r3(s) + ")";
        }
      }
      if (keyState) {
        var k = keyState, kx = k.x.at(t), ky = k.y.at(t), it = k.intensity.at(t), col = [k.r.at(t), k.g.at(t), k.b.at(t)];
        var R = k.spread * W;
        k.el.style.background = "radial-gradient(" + r2(R) + "px " + r2(R * 0.78) + "px at " + r2(kx * W) + "px " + r2(ky * H) + "px," + rgba(col, it) + " 0%," + rgba(col, it * 0.55) + " 30%," + rgba(col, it * 0.18) + " 58%," + rgba(col, 0) + " 100%)";
        if (k.vig) k.vig.style.opacity = String(r3(k.vignette.at(t)));
      }
      if (grainState) {
        var fi = Math.floor(t * grainState.fps + 1e-6);
        var gx = Math.floor(hash1(fi, grainState.seed) * 256), gy = Math.floor(hash1(fi + 7919, grainState.seed) * 256);
        grainState.el.style.backgroundPosition = gx + "px " + gy + "px";
      }
    }

    function renderExtras(t, c) {
      for (var i = 0; i < extras.length; i++) extras[i](t, c);
    }

    function render(t) {
      t = Math.max(0, +t || 0);
      var key = r3(t) + "|" + version;
      if (key === lastKey) return;
      lastKey = key; lastT = t;
      var c = camAt(t);
      view.style.perspective = r2(c.P) + "px";
      world.style.transform = css3d(c.M);
      // RASAN_CAMERA_TRAILS: false = off; a number scales them (finish.mjs sets 2/samples: the shutter makes the smear)
      var tScale = typeof root.RASAN_CAMERA_TRAILS === "number" ? root.RASAN_CAMERA_TRAILS : 1;
      var trails = trailsOpt && root.RASAN_CAMERA_TRAILS !== false && tScale > 0 && t > 0;
      var cPrev = trails ? camAt(t - 1 / fps) : null;
      var sInv = dof.on ? focusDist(t, c) : 1;
      var A = dof.aperture.at(t) * H / 100 * 2;
      trailK = tScale;
      for (var i = 0; i < layers.length; i++) renderLayer(layers[i], t, c, cPrev, sInv, A);
      renderGround(t);
      renderExtras(t, c);
    }

    // ---------------------------------------------------------------- camera legs
    function lg(chainObj, d, m, defEase) {
      m = m || {};
      var at = opt(m, "at", 0), du = opt(m, "duration", 1.2);
      chainObj.by(d, at, du, opt(m, "ease", defEase));
      leg(at, du);
    }
    var cam_api = {
      version: VERSION, width: W, height: H, root: rootE, stageEl: st, world: world, fx: fx, groundEl: groundL,
      perspective: function (t) { return camAt(t || 0).P; },
      place: function (el, p) { place(el, p); return cam_api; },
      layer: function (el) { var L = layerOf(el); return L ? L.wrap : null; },
      move: move,
      // dolly: the camera travels along its view axis (px; + = toward the scene). A layer at z=0 grows by P/(P-dz).
      dolly: function (dz, m) { lg(cam.dolly, dz, m, "expo.out"); bump(); return cam_api; },
      // truck: the camera slides sideways (dx) and up/down (dy, + = down); the world moves the other way
      truck: function (dx, dy, m) { if (typeof dy === "object") { m = dy; dy = 0; } lg(cam.x, dx || 0, m, "expo.out"); if (dy) lg(cam.y, dy, m, "expo.out"); bump(); return cam_api; },
      // orbit: the camera circles a target (yaw deg; pitch deg) - parallax between near and far layers
      orbit: function (yaw, pitch, m) {
        if (typeof pitch === "object") { m = pitch; pitch = 0; }
        m = m || {};
        if (m.target) { var tg = m.target; if (typeof tg === "number") cam.target = [0, 0, tg]; else if (Array.isArray(tg)) cam.target = [tg[0] - C[0], tg[1] - C[1], tg[2] || 0]; else { var L = needLayer(tg, "orbit target"); cam.target = [L.ch.x.base - C[0], L.ch.y.base - C[1], L.ch.z.base]; } }
        lg(cam.orbitY, yaw || 0, m, "power2.inOut"); if (pitch) lg(cam.orbitX, pitch, m, "power2.inOut");
        bump(); return cam_api;
      },
      // push: dolly so the plane at z=0 grows by `fraction` (0.06 = +6%); the classic slow push-in or a punch-in
      push: function (fraction, m) {
        var P = perspectiveFor(cam.persp.base, W);
        lg(cam.dolly, P * (1 - 1 / (1 + fraction)), m, "power2.out"); bump(); return cam_api;
      },
      pan: function (deg, m) { lg(cam.pan, deg, m, "power2.inOut"); bump(); return cam_api; },
      tilt: function (deg, m) { lg(cam.tilt, deg, m, "power2.inOut"); bump(); return cam_api; },
      roll: function (deg, m) { lg(cam.roll, deg, m, "power2.inOut"); bump(); return cam_api; },
      // zoom: change the focal length; magnifies about the frame centre and flattens/deepens the perspective
      zoom: function (mm, m) {
        m = m || {}; var at = opt(m, "at", 0), du = opt(m, "duration", 1.2), e = opt(m, "ease", "power2.inOut");
        cam.mag.to(mm / lens0, at, du, e); cam.persp.to(mm, at, du, e); leg(at, du); bump(); return cam_api;
      },
      // dollyZoom: the vertigo shot - the z=0 plane stays the same size while the perspective changes behind it
      dollyZoom: function (mm, m) {
        m = m || {}; var at = opt(m, "at", 0), du = opt(m, "duration", 1.5), e = opt(m, "ease", "power2.inOut");
        cam.persp.to(mm, at, du, e); leg(at, du); bump(); return cam_api;
      },
      // drift: the hold is never static - a slow push plus a seeded sway, finite and deterministic
      drift: function (d) {
        d = d || {}; var r = rng(opt(d, "seed", 7));
        cam.drifts.push({ from: opt(d, "from", 0), to: opt(d, "to", null), push: opt(d, "push", 0.015), sway: opt(d, "sway", 0.35), float: opt(d, "float", 4), period: opt(d, "period", 9), ph1: r() * 6.28, ph2: r() * 6.28, ph3: r() * 6.28 });
        if (dur) life(dur);
        bump(); return cam_api;
      },
      // ------------------------------------------------------------ depth of field
      dof: function (d) {
        d = d || {}; dof.on = d.on !== false;
        if (d.focus !== undefined) dof.focus.base = typeof d.focus === "number" ? d.focus : needLayer(d.focus, "dof focus");
        if (d.aperture !== undefined) dof.aperture.base = d.aperture;
        ["max", "haze", "levels", "fray"].forEach(function (k) { if (d[k] !== undefined) dof[k] = d[k]; });
        bump(); return cam_api;
      },
      rack: function (to, m) {
        m = m || {}; var at = opt(m, "at", 0), du = opt(m, "duration", 0.5), e = opt(m, "ease", "power2.inOut");
        dof.on = true;
        dof.focus.to(typeof to === "number" ? to : needLayer(to, "rack"), at, du, e);
        if (m.aperture !== undefined) dof.aperture.to(m.aperture, at, du, e);
        leg(at, du); bump(); return cam_api;
      },
      // ------------------------------------------------------------ shadows, glass, light on the object
      contactShadow: function (el, s) {
        s = s || {}; var L = needLayer(el, "contactShadow");
        var mode = opt(s, "mode", "plane"), tint = groundState ? groundState.tint : "#e9e7e3";
        var col = s.color ? rgb(s.color) : shadowOf(tint);
        if (mode === "floor") {
          var e1 = div("rc-contact", "position:absolute;left:0;top:0;border-radius:50%;background:radial-gradient(closest-side," + rgba(col, 0.9) + "," + rgba(col, 0.45) + " 55%," + rgba(col, 0) + ");transform-origin:50% 50%;");
          var e2 = div("rc-contact-core", "position:absolute;left:0;top:0;border-radius:50%;background:radial-gradient(closest-side," + rgba(col, 1) + "," + rgba(col, 0) + ");transform-origin:50% 50%;");
          floorL.appendChild(e1); floorL.appendChild(e2);
          L.floor = { el: e1, core: e2, opacity: opt(s, "opacity", 0.55), blur: opt(s, "blur", 28), squash: opt(s, "squash", 0.1), width: opt(s, "width", 1.0), drop: opt(s, "drop", 6) };
        } else {
          var off = opt(s, "offset", 6), bl = opt(s, "blur", 10), a = opt(s, "opacity", 0.32), rad = radiusOf(L.el);
          var sh = div("rc-contact", "position:absolute;left:" + (L.w * 0.04) + "px;right:" + (L.w * 0.04) + "px;top:" + off + "px;bottom:" + (-off) + "px;border-radius:" + rad + ";background:" + rgba(col, a) + ";filter:blur(" + bl + "px);");
          L.under.appendChild(sh);
        }
        bump(); return cam_api;
      },
      // a multi-layer shadow that reads as real height (Aceternity's 5 layers, scaled by elevation 1-5, tinted to the ground)
      shadowLadder: function (el, s) {
        s = s || {}; var L = needLayer(el, "shadowLadder");
        var e = opt(s, "elevation", 3), k = e / 3, tint = groundState ? groundState.tint : "#e9e7e3", col = s.color ? rgb(s.color) : shadowOf(tint);
        var a = opt(s, "opacity", 1) * (groundState && groundState.dark ? 1.6 : 1);
        var layersS = [[9, 20, 0.29], [37, 37, 0.26], [84, 50, 0.15], [149, 60, 0.04], [233, 65, 0.012]];
        var str = layersS.map(function (q) { return "0 " + r2(q[0] * k) + "px " + r2(q[1] * k) + "px " + rgba(col, Math.min(1, q[2] * a)); }).join(",");
        if (s.alpha) { L.extra.shadowAlpha = layersS.slice(0, 3).map(function (q) { return "drop-shadow(0 " + r2(q[0] * k * 0.6) + "px " + r2(q[1] * k * 0.5) + "px " + rgba(col, Math.min(1, q[2] * a)) + ")"; }).join(" "); }
        else { var sh = div("rc-ladder", "position:absolute;inset:0;border-radius:" + radiusOf(L.el) + ";box-shadow:" + str + ";"); L.under.appendChild(sh); }
        bump(); return cam_api;
      },
      // glass: a translucent rim with backdrop blur around a solid face, a crisp stroke, a top highlight
      glass: function (el, g) {
        g = g || {}; var L = needLayer(el, "glass");
        var rim = opt(g, "rim", 18), dark = opt(g, "tone", groundState && groundState.dark ? "dark" : "light") === "dark";
        var rad = radiusPx(L.el), stroke = g.stroke || (dark ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.85)");
        var ring = div("rc-glass", "position:absolute;left:" + (-rim) + "px;top:" + (-rim) + "px;right:" + (-rim) + "px;bottom:" + (-rim) + "px;border-radius:" + (rad + rim) + "px;" +
          "background:" + (dark ? "linear-gradient(160deg,rgba(255,255,255,.10),rgba(255,255,255,.03) 60%,rgba(255,255,255,.06))" : "linear-gradient(160deg,rgba(255,255,255,.72),rgba(255,255,255,.38) 55%,rgba(255,255,255,.55))") + ";" +
          "backdrop-filter:blur(" + opt(g, "blur", 22) + "px) saturate(1.5);-webkit-backdrop-filter:blur(" + opt(g, "blur", 22) + "px) saturate(1.5);" +
          "box-shadow:inset 0 0 0 1px " + stroke + ",inset 0 1.5px 0 " + (dark ? "rgba(255,255,255,.22)" : "rgba(255,255,255,1)") + ",inset 0 -1px 0 " + (dark ? "rgba(0,0,0,.4)" : "rgba(0,0,0,.05)") + ";");
        L.under.appendChild(ring);
        if (g.face !== false) {
          var edge = div("rc-glass-edge", "position:absolute;inset:0;border-radius:" + radiusOf(L.el) + ";box-shadow:inset 0 0 0 1px " + (g.faceStroke || (dark ? "rgba(255,255,255,.10)" : "rgba(120,90,60,.10)")) + ",inset 0 1px 0 " + (dark ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.9)") + ";");
          L.over.appendChild(edge);
        }
        bump(); return cam_api;
      },
      // rim light: a soft halo in brand colours behind the object plus a thin crisp colour edge (Google). Brand colours only.
      rimLight: function (el, r) {
        r = r || {}; var L = needLayer(el, "rimLight");
        var cols = (r.colors || ["#4285f4", "#34a853", "#fbbc05", "#ea4335"]).map(function (c) { return rgba(c, 1); });
        var spread = opt(r, "spread", 44), op = opt(r, "opacity", 0.55), rad = radiusPx(L.el), from = opt(r, "angle", 200);
        var grad = "conic-gradient(from " + from + "deg," + cols.concat([cols[0]]).join(",") + ")";
        var halo = div("rc-rim-halo", "position:absolute;inset:" + (-spread * 0.15) + "px;border-radius:" + (rad + spread * 0.15) + "px;background:" + grad + ";filter:blur(" + spread * 0.75 + "px);opacity:" + op + ";");
        L.under.insertBefore(halo, L.under.firstChild);
        if (r.edge !== false) {
          var w = opt(r, "edge", 2.5);
          var ring = div("rc-rim-edge", "position:absolute;inset:" + (-w * 0.4) + "px;border-radius:" + (rad + w * 0.4) + "px;padding:" + w + "px;background:" + grad + ";" +
            "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);opacity:" + opt(r, "edgeOpacity", 0.85) + ";");
          L.over.appendChild(ring);
          if (r.spin) {
            var spin = new Abs(0); spin.to(r.spin.deg || 120, r.spin.at || 0, r.spin.duration || 3, r.spin.ease || "sine.inOut"); leg(r.spin.at || 0, r.spin.duration || 3);
            extras.push(function (t) { var g2 = "conic-gradient(from " + r2(from + spin.at(t)) + "deg," + cols.concat([cols[0]]).join(",") + ")"; halo.style.background = g2; ring.style.background = g2; });
          }
        }
        bump(); return cam_api;
      },
      // light comet: a short bright streak travelling the object's border ("it's thinking", Sovra)
      lightComet: function (el, k) {
        k = k || {}; spend("lightComet");
        var L = layerOf(el), host = L ? L.over : one(el, rootE);
        var w = L ? L.w : host.offsetWidth, h = L ? L.h : host.offsetHeight, rr = Math.min(L ? radiusPx(L.el) : radiusPx(host), Math.min(w, h) / 2);
        var per = 2 * (w + h) - 8 * rr + 2 * PI * rr;
        var at = opt(k, "at", 0), du = opt(k, "duration", 1.6), laps = opt(k, "laps", 1), len = opt(k, "length", 0.2) * per, col = k.color || "#ffffff", sw = opt(k, "width", 2);
        var d = "M" + rr + " 0H" + (w - rr) + "A" + rr + " " + rr + " 0 0 1 " + w + " " + rr + "V" + (h - rr) + "A" + rr + " " + rr + " 0 0 1 " + (w - rr) + " " + h + "H" + rr + "A" + rr + " " + rr + " 0 0 1 0 " + (h - rr) + "V" + rr + "A" + rr + " " + rr + " 0 0 1 " + rr + " 0Z";
        var s = svgEl("svg", { width: w, height: h, viewBox: "0 0 " + w + " " + h, style: "position:absolute;left:0;top:0;overflow:visible;" + (L ? "" : "pointer-events:none;z-index:5;") });
        var fid = id + "c" + (++uid);
        var fl = svgEl("filter", { id: fid, x: "-20%", y: "-20%", width: "140%", height: "140%" }); fl.appendChild(svgEl("feGaussianBlur", { stdDeviation: String(opt(k, "halo", 9)) })); s.appendChild(fl);
        var strokes = [[len * 1.0, sw * 6, 0.55, true], [len * 2.6, sw, 0.18, false], [len * 1.6, sw, 0.4, false], [len * 0.7, sw * 1.2, 1, false]].map(function (q) {
          var p = svgEl("path", { d: d, fill: "none", stroke: col, "stroke-width": q[1], "stroke-linecap": "round", "stroke-dasharray": r2(q[0]) + " " + r2(per - q[0]), opacity: "0" });
          if (q[3]) p.setAttribute("filter", "url(#" + fid + ")");
          s.appendChild(p); return { p: p, len: q[0], a: q[2] };
        });
        if (!L && getComputedStyle(host).position === "static") host.style.position = "relative";
        host.appendChild(s);
        var ease = easeFn(opt(k, "ease", "power1.inOut"));
        extras.push(function (t) {
          var p = (t - at) / du;
          var on = p > 0 && p < 1;
          var head = ease(clamp(p, 0, 1)) * laps * per + opt(k, "start", 0) * per;
          var env = on ? Math.min(1, p / 0.12) * (p > 0.8 ? 1 - EASES["power2.out"]((p - 0.8) / 0.2) : 1) : 0;
          for (var i = 0; i < strokes.length; i++) { var q = strokes[i]; q.p.setAttribute("stroke-dashoffset", r2(-(head - q.len))); q.p.setAttribute("opacity", r3(q.a * env)); }
        });
        leg(at, du); bump(); return cam_api;
      },
      // sheen: one diagonal soft highlight crosses the object once ("it's real glass", the "done" punctuation)
      sheen: function (el, k) {
        k = k || {}; var L = layerOf(el), host = L ? L.over : one(el, rootE);
        var w = L ? L.w : host.offsetWidth, h = L ? L.h : host.offsetHeight;
        var at = opt(k, "at", 0), du = opt(k, "duration", 0.7), bw = opt(k, "width", 0.22) * w, ang = opt(k, "angle", 24), str = opt(k, "strength", 0.35);
        var clip = div("rc-sheen", "position:absolute;inset:0;overflow:hidden;border-radius:" + radiusOf(L ? L.el : host) + ";pointer-events:none;mix-blend-mode:" + opt(k, "blend", "soft-light") + ";");
        var band = div("", "position:absolute;top:-50%;height:200%;left:0;width:" + bw + "px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255," + str + ") 50%,rgba(255,255,255,0));");
        clip.appendChild(band); host.appendChild(clip);
        var ease = easeFn(opt(k, "ease", "power2.inOut"));
        extras.push(function (t) { var p = ease(clamp((t - at) / du, 0, 1)); band.style.transform = "translateX(" + r2(lerp(-bw * 1.6, w + bw * 0.6, p)) + "px) rotate(" + ang + "deg)"; band.style.opacity = p <= 0 || p >= 1 ? "0" : "1"; });
        leg(at, du); bump(); return cam_api;
      },
      // ------------------------------------------------------------ light and ground
      keyLight: function (k) {
        k = k || {};
        var xy = sideToXY(k.side), col = rgb(k.color || (groundState && groundState.dark ? "#7b4dff" : "#ffffff"));
        if (!keyState) {
          var el = div("rc-key", "position:absolute;inset:0;"); groundL.appendChild(el);
          keyState = { el: el, x: new Abs(xy[0]), y: new Abs(xy[1]), intensity: new Abs(opt(k, "intensity", 0.75)), r: new Abs(col[0]), g: new Abs(col[1]), b: new Abs(col[2]), vignette: new Abs(1), spread: opt(k, "spread", 0.95) };
        } else { keyState.x.base = xy[0]; keyState.y.base = xy[1]; keyState.intensity.base = opt(k, "intensity", keyState.intensity.base); keyState.r.base = col[0]; keyState.g.base = col[1]; keyState.b.base = col[2]; }
        var v = opt(k, "vignette", 0.18);
        if (v > 0 && !keyState.vig) {
          var dk = groundState ? shadowOf(groundState.tint, groundState.dark ? 0.4 : 1) : [20, 20, 28];
          keyState.vig = div("rc-vignette", "position:absolute;inset:0;background:radial-gradient(130% 105% at 50% 46%," + rgba(dk, 0) + " 52%," + rgba(dk, v * 0.55) + " 80%," + rgba(dk, v) + " 100%);");
          fx.insertBefore(keyState.vig, fx.firstChild);
        }
        bump(); return cam_api;
      },
      // a story turn: the key light moves, warms or changes colour (L* change 10-20 over 0.5-1 s)
      keyTurn: function (to, m) {
        need(keyState, "keyTurn: call keyLight first");
        m = m || {}; var at = opt(m, "at", 0), du = opt(m, "duration", 0.8), e = opt(m, "ease", "power2.inOut");
        if (to.side) { var xy = sideToXY(to.side); keyState.x.to(xy[0], at, du, e); keyState.y.to(xy[1], at, du, e); }
        if (to.color) { var c = rgb(to.color); keyState.r.to(c[0], at, du, e); keyState.g.to(c[1], at, du, e); keyState.b.to(c[2], at, du, e); }
        if (typeof to.intensity === "number") keyState.intensity.to(to.intensity, at, du, e);
        if (typeof to.vignette === "number") keyState.vignette.to(to.vignette, at, du, e);
        leg(at, du); bump(); return cam_api;
      },
      // the ground: never a neutral flat. A tint, an L* falloff, soft colour blobs drifting slowly, anti-banding grain
      ground: function (g) {
        g = g || {};
        var tint = g.tint || "#f2f1ee", dark = luma(tint) < 0.35, fall = opt(g, "falloff", dark ? 6 : 8) / 100;
        var light = mixc(tint, "#ffffff", fall * 1.6), deep = mixc(tint, dark ? "#000000" : "#6a6560", fall * (dark ? 3 : 1.2));
        groundL.style.background = "linear-gradient(" + opt(g, "angle", 160) + "deg," + rgba(light) + " 0%," + rgba(tint) + " 48%," + rgba(deep) + " 100%)";
        var r = rng(opt(g, "seed", 11)), blobs = [];
        (g.blobs || []).forEach(function (c, i) {
          var size = W * (0.55 + r() * 0.35), a = opt(g, "blobAlpha", dark ? 0.32 : 0.42);
          var el = div("rc-blob", "position:absolute;left:0;top:0;width:" + size + "px;height:" + size * 0.8 + "px;border-radius:50%;" +
            "background:radial-gradient(closest-side," + rgba(c, a) + " 0%," + rgba(c, a * 0.62) + " 30%," + rgba(c, a * 0.24) + " 62%," + rgba(c, 0) + " 100%);");
          groundL.appendChild(el);
          var pos = g.positions && g.positions[i] ? g.positions[i] : [r(), r()];
          blobs.push({ el: el, x: pos[0] * W - size / 2, y: pos[1] * H - size * 0.4, f1: 0.7 + r() * 0.6, f2: 0.6 + r() * 0.7, p1: r() * 6.28, p2: r() * 6.28 });
        });
        if (opt(g, "grain", 0.02) > 0) {
          var gr = div("rc-ground-grain", "position:absolute;inset:0;opacity:" + r3(opt(g, "grain", 0.02) * 2.5) + ";background-image:url(" + noiseTile(opt(g, "seed", 11) + 101, 256) + ");");
          groundL.appendChild(gr);
        }
        if (keyState) groundL.appendChild(keyState.el); // the key light sits on top of the blobs
        groundState = { tint: tint, dark: dark, blobs: blobs, drift: opt(g, "drift", 0.035), period: opt(g, "period", 10) };
        if (dur) life(dur);
        bump(); return cam_api;
      },
      // film grain on top of everything: 2-4% (1-2% on brand-flat grounds), re-seeded every frame from T
      grain: function (gopt) {
        gopt = gopt || {};
        if (!grainState) { var el = div("rc-grain", "position:absolute;inset:-2px;"); fx.appendChild(el); grainState = { el: el }; }
        grainState.fps = opt(gopt, "fps", fps); grainState.seed = opt(gopt, "seed", 5);
        grainState.el.style.backgroundImage = "url(" + noiseTile(grainState.seed, 256) + ")";
        grainState.el.style.opacity = String(r3(opt(gopt, "amount", 0.03) * 2.5));
        if (dur) life(dur);
        bump(); return cam_api;
      },
      // ------------------------------------------------------------ budgeted extras (hero only, 2-3 per film)
      halation: function (el, h) {
        h = h || {}; spend("halation"); var L = needLayer(el, "halation");
        L.extra.glow = { color: h.color || "#ff6a3d", radius: opt(h, "radius", 18) };
        L.ch.glow.base = opt(h, "amount", 1);
        if (h.to !== undefined) { L.ch.glow.to(h.to, opt(h, "at", 0), opt(h, "duration", 0.4), opt(h, "ease", "power2.out")); leg(opt(h, "at", 0), opt(h, "duration", 0.4)); }
        bump(); return cam_api;
      },
      bloom: function (el, h) { h = h || {}; h.color = h.color || "#ffffff"; budget.halation = (budget.halation || 1) - 1; spend("bloom"); return cam_api.halation(el, h); },
      chromaticSplit: function (el, c) {
        c = c || {}; spend("chromaticSplit"); var L = needLayer(el, "chromaticSplit");
        L.extra.chroma = { angle: opt(c, "angle", 0), alpha: opt(c, "alpha", 0.5) };
        L.ch.chroma.base = opt(c, "amount", 0);
        if (c.peak !== undefined) {
          var at = opt(c, "at", 0), du = opt(c, "duration", 0.3);
          L.ch.chroma.to(c.peak, at, du * 0.35, "power2.out"); L.ch.chroma.to(opt(c, "amount", 0), at + du * 0.35, du * 0.65, "power2.inOut");
          leg(at, du);
        }
        bump(); return cam_api;
      },
      // zoom burst: radial speed lines for a fly-through exit into a hard cut (0.25-0.4 s)
      burst: function (b) {
        b = b || {}; spend("burst");
        var at = opt(b, "at", 0), du = opt(b, "duration", 0.35), n = opt(b, "lines", 40), cx = opt(b, "center", [0.5, 0.5]), col = b.color || (groundState && groundState.dark ? "#ffffff" : "#1b1b22");
        var s = svgEl("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, style: "position:absolute;left:0;top:0;" });
        var r = rng(opt(b, "seed", 3)), D = Math.hypot(W, H), lines = [];
        for (var i = 0; i < n; i++) { var a = (i + r() * 0.8) / n * 2 * PI, ln = svgEl("line", { stroke: col, "stroke-width": r2(1 + r() * 2), "stroke-linecap": "round", opacity: "0" }); s.appendChild(ln); lines.push({ el: ln, a: a, k: 0.7 + r() * 0.6 }); }
        fx.appendChild(s);
        var ease = easeFn(opt(b, "ease", "power3.in"));
        extras.push(function (t) {
          var p = (t - at) / du, on = p > 0 && p < 1, e = ease(clamp(p, 0, 1));
          for (var i = 0; i < lines.length; i++) {
            var q = lines[i], r0 = D * (0.12 + 0.5 * e) * q.k, r1 = r0 + D * (0.08 + 0.4 * e) * q.k, ox = cx[0] * W, oy = cx[1] * H;
            q.el.setAttribute("x1", r2(ox + Math.cos(q.a) * r0)); q.el.setAttribute("y1", r2(oy + Math.sin(q.a) * r0));
            q.el.setAttribute("x2", r2(ox + Math.cos(q.a) * r1)); q.el.setAttribute("y2", r2(oy + Math.sin(q.a) * r1));
            q.el.setAttribute("opacity", on ? r3(opt(b, "opacity", 0.3) * Math.sin(PI * clamp(p, 0, 1))) : "0");
          }
        });
        leg(at, du); bump(); return cam_api;
      },
      // shade a laid-back plane: a soft falloff into depth (on by default for placed planes via place({shade}))
      shade: function (el, amount) {
        var L = needLayer(el, "shade"); L.shade = amount === undefined ? 0.07 : amount;
        if (!L.shadeEl) { L.shadeEl = div("rc-shade", "position:absolute;inset:0;border-radius:" + radiusOf(L.el) + ";pointer-events:none;"); L.over.insertBefore(L.shadeEl, L.over.firstChild); }
        bump(); return cam_api;
      },
      // ------------------------------------------------------------ control
      render: function (t) { render(t); return cam_api; },
      seek: function (t) { lastKey = ""; render(t); return cam_api; },
      refresh: function () {
        layers.forEach(function (L) {
          L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; L.wrap.style.width = L.w + "px"; L.wrap.style.height = L.h + "px";
          if (L.anchorEl) { var off = offsetIn(L.anchorEl, L.el); L.ax = off[0] + L.anchorEl.offsetWidth / 2; L.ay = off[1] + L.anchorEl.offsetHeight / 2; }
        });
        version++; lastKey = ""; render(tl ? tl.time() : lastT); return cam_api;
      },
      // what the camera sees at t: lens, perspective, focus distance, per layer screen centre, size and blur (for checks)
      state: function (t) {
        t = t === undefined ? lastT : t;
        var c = camAt(t), sInv = dof.on ? focusDist(t, c) : 1, A = dof.aperture.at(t) * H / 100 * 2;
        return { t: r3(t), perspective: r2(c.P), lens_mm: r2(c.persp), magnification: r3(c.mag), focus_distance: dof.on ? r2(1 / sInv) : null,
          layers: layers.map(function (L) { var p = layerScreen(L, t, c); return { id: L.el.id || L.el.className || "layer", x: r2(p[0]), y: r2(p[1]), distance: r2(p[2]), blur_px: dof.on && L.dof !== false ? r2(blurAt(p[2], 1 / sInv, A, dof.max * H / 100)) : 0 }; }) };
      },
      budget: function () { var o = {}; for (var k in budget) if (budget[k] > 0) o[k] = budget[k]; return o; },
    };
    // planes get the light falloff by default
    var placeRaw = cam_api.place;
    cam_api.place = function (el, p) {
      placeRaw(el, p);
      var L = layerOf(el);
      // auto only for a surface (a card, a slab): text and transparent layers would get a visible box
      var solid = L && (function (cs) { return cs.backgroundImage !== "none" || !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(cs.backgroundColor); })(getComputedStyle(L.el));
      if (L && !L.shadeEl && (p && (p.shade !== undefined ? p.shade > 0 : solid && (Math.abs(p.rx || 0) > 8 || Math.abs(p.ry || 0) > 8)))) cam_api.shade(el, p.shade);
      return cam_api;
    };
    if (root.document && document.fonts && document.fonts.ready && o.refreshOnFonts !== false) document.fonts.ready.then(function () { cam_api.refresh(); });
    render(0);
    return cam_api;
  }

  // ------------------------------------------------------------------ blurTrail for elements outside a stage
  // A speed-driven directional blur for a plain GSAP move. Pass the move (dx/dy px, at, duration, ease) or let it read
  // the element's x/y tweens on the timeline. The blur is a pure function of the timeline time (velocity from the
  // move's own ease at t and t - 1/fps), so it is seek-safe. For drafts and review strips; finish.mjs adds the real
  // shutter at delivery (and switches these trails off there, window.RASAN_CAMERA_TRAILS = false).
  function blurTrail(tl, el, o) {
    need(tl && typeof tl.fromTo === "function", "blurTrail: the first argument must be a GSAP timeline");
    el = one(el); o = o || {};
    var fps = opt(o, "fps", 30), shutter = opt(o, "shutter", 0.5), moves = [];
    if (o.dx !== undefined || o.dy !== undefined) moves.push({ at: opt(o, "at", 0), dur: opt(o, "duration", 0.6), ease: easeFn(opt(o, "ease", "power3.inOut")), dx: o.dx || 0, dy: o.dy || 0 });
    else if (tl.getTweensOf) {
      var cur = { x: 0, y: 0 };
      if (root.gsap) { cur.x = parseFloat(root.gsap.getProperty(el, "x")) || 0; cur.y = parseFloat(root.gsap.getProperty(el, "y")) || 0; }
      tl.getTweensOf(el).sort(function (a, b) { return a.startTime() - b.startTime(); }).forEach(function (tw) {
        var v = tw.vars || {}, sa = v.startAt || {}, m = { at: tw.startTime(), dur: tw.duration(), ease: easeFn(v.ease || "power1.out"), dx: 0, dy: 0 };
        ["x", "y"].forEach(function (k) {
          if (v[k] === undefined) return;
          var from = sa[k] !== undefined ? parseFloat(sa[k]) : cur[k], to = v[k];
          if (typeof to === "string" && /^[+-]=/.test(to)) to = from + parseFloat(to.replace("=", ""));
          to = parseFloat(to); if (isNaN(to)) return;
          m["d" + k] = to - from; m[k + "0"] = from; cur[k] = to;
        });
        if (m.dx || m.dy) moves.push(m);
      });
    }
    need(moves.length, "blurTrail: no move found (pass {dx, dy, at, duration, ease} or tween x/y of the element on this timeline)");
    var fid = "rct" + (++uid);
    var s = svgEl("svg", { width: "0", height: "0", style: "position:absolute;width:0;height:0" });
    var f = svgEl("filter", { id: fid, x: "-50%", y: "-50%", width: "200%", height: "200%" }), gb = svgEl("feGaussianBlur", { stdDeviation: "0 0" });
    f.appendChild(gb); s.appendChild(f); document.body.appendChild(s);
    function pos(t) { var x = 0, y = 0; moves.forEach(function (m) { var p = clamp((t - m.at) / m.dur, 0, 1); x += m.dx * m.ease(p); y += m.dy * m.ease(p); }); return [x, y]; }
    var last = null;
    function draw() {
      var k = typeof root.RASAN_CAMERA_TRAILS === "number" ? root.RASAN_CAMERA_TRAILS : 1;
      var t = tl.time(), a = pos(t), b = pos(t - 1 / fps), sx = Math.abs(a[0] - b[0]) * shutter * 0.5 * k, sy = Math.abs(a[1] - b[1]) * shutter * 0.5 * k;
      var on = root.RASAN_CAMERA_TRAILS !== false && (sx > 0.4 || sy > 0.4);
      var key = on ? r2(sx) + " " + r2(sy) : "off";
      if (key === last) return; last = key;
      if (on) { gb.setAttribute("stdDeviation", key); el.style.filter = "url(#" + fid + ")"; } else el.style.filter = "";
    }
    moves.forEach(function (m) { clockTween(tl, m.at, m.dur + 1 / fps, draw); });
    return el;
  }

  root.RasanCamera = { version: VERSION, stage: stage, blurTrail: blurTrail, perspectiveFor: perspectiveFor, rng: rng, shadowOf: function (g) { return rgba(shadowOf(g), 1); } };
})(typeof window !== "undefined" ? window : this);
