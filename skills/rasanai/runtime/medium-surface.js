/* RasanMediumSurface: the shared, frozen factory shape for medium scenes (M04 owns this file; M05/M06 import, never edit).
 *
 * Not a renderer, clock or timeline. A medium scene draws objects into an SVG the existing HyperFrames/Rasan2D
 * composition already hosts; the film's clock calls setTime(t) with scene-local seconds. Every setTime is a pure
 * function of (t, seed, content): no delta time, no timers, no Math.random, no hidden global state.
 *
 *   var S = RasanMediumSurface;
 *   var scene = S.createMediumScene({ root, width, height, seed, assets, design, content, eventBindings, build });
 *   // -> { ready: Promise<void>, setTime(t), describeElements(), destroy(), surface }
 *   `build(surface, ctx)` is supplied by a medium module (medium-graphic.js, medium-paper.js) and must return
 *   { update(t, surface), describe() }; update draws a complete state.
 *
 * Importing this file has no side effects. Malformed input throws; nothing draws an empty box as if complete.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.RasanMediumSurface = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var VERSION = "1.0.0";
  var NS = "http://www.w3.org/2000/svg";

  function need(c, m) { if (!c) throw new Error("RasanMediumSurface: " + m); }
  function finite(v, name, lo, hi) {
    need(typeof v === "number" && isFinite(v), name + " must be a finite number");
    if (lo != null) need(v >= lo, name + " must be >= " + lo);
    if (hi != null) need(v <= hi, name + " must be <= " + hi);
    return v;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // Seeded PRNG. Per-object variation must come from rngFor(seed, objectId[, frame]) so adding an object never
  // changes another one: the stream depends only on its own key.
  function rng(seed) {
    var a = hashStr(seed);
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function rngFor(seed, id, frame) { return rng(String(seed) + "|" + String(id) + (frame == null ? "" : "|" + frame)); }

  // Explicit quantized time: floor(t * fps + eps) / fps. Deliberate stepped posing reads this, never raw t.
  function quantize(t, fps) { finite(fps, "fps", 1, 240); return Math.floor(t * fps + 1e-6) / fps; }
  function frameTime(t, fps) {
    if (root && typeof root.__rasanFrameTime === "number") return root.__rasanFrameTime;
    return quantize(t, fps);
  }

  // Easing: pure functions of progress 0..1. Purpose-driven, chosen per move by the medium module.
  var ease = {
    linear: function (p) { return p; },
    out: function (p) { var q = 1 - p; return 1 - q * q * q; },
    inOut: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    step: function (n) { return function (p) { return Math.floor(clamp(p, 0, 1) * n) / n; }; }
  };
  // Progress of t inside [start, start + dur], clamped. dur 0 is a hard cut.
  function prog(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return clamp((t - start) / dur, 0, 1); }

  // Logical-space -> output-space transform: author in logical units (width x height), draw at output size.
  function makeTransform(logicalW, logicalH, width, height, fit) {
    finite(logicalW, "logicalW", 1); finite(logicalH, "logicalH", 1); finite(width, "width", 1); finite(height, "height", 1);
    var sx = width / logicalW, sy = height / logicalH;
    var s = fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);       // uniform only; never a non-uniform stretch
    var ox = (width - logicalW * s) / 2, oy = (height - logicalH * s) / 2;
    return { scale: s, x: ox, y: oy, point: function (px, py) { return [ox + px * s, oy + py * s]; } };
  }

  // Length of an SVG path d string approximated from its own geometry (no DOM): polyline over sampled commands.
  // Supports M L H V C Q Z (absolute), enough for authored diagram paths. Throws on anything else.
  function parsePath(d) {
    need(typeof d === "string" && d.length, "path d must be a non-empty string");
    var tok = d.match(/[MLHVCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
    need(tok, "path d has no tokens");
    var i = 0, cx = 0, cy = 0, sx = 0, sy = 0, pts = [], cmd = "";
    function num() { var v = parseFloat(tok[i++]); need(isFinite(v), "malformed path coordinate in " + d); return v; }
    while (i < tok.length) {
      if (/^[A-Za-z]$/.test(tok[i])) cmd = tok[i++].toUpperCase();
      else need(cmd && cmd !== "Z" && cmd !== "M", "malformed path d: " + d);
      if (cmd === "M") { cx = num(); cy = num(); sx = cx; sy = cy; pts.push([cx, cy]); cmd = "L"; }
      else if (cmd === "L") { cx = num(); cy = num(); pts.push([cx, cy]); }
      else if (cmd === "H") { cx = num(); pts.push([cx, cy]); }
      else if (cmd === "V") { cy = num(); pts.push([cx, cy]); }
      else if (cmd === "Z") { cx = sx; cy = sy; pts.push([cx, cy]); }
      else if (cmd === "Q") {
        var qx = num(), qy = num(), ex = num(), ey = num();
        for (var k = 1; k <= 16; k++) { var u = k / 16, v = 1 - u; pts.push([v * v * cx + 2 * v * u * qx + u * u * ex, v * v * cy + 2 * v * u * qy + u * u * ey]); }
        cx = ex; cy = ey;
      } else if (cmd === "C") {
        var x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
        for (var m = 1; m <= 24; m++) { var a = m / 24, b = 1 - a; pts.push([b*b*b*cx + 3*b*b*a*x1 + 3*b*a*a*x2 + a*a*a*x3, b*b*b*cy + 3*b*b*a*y1 + 3*b*a*a*y2 + a*a*a*y3]); }
        cx = x3; cy = y3;
      } else need(false, "unsupported path command " + cmd);
    }
    var cum = [0];
    for (var j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    return { pts: pts, cum: cum, length: cum[cum.length - 1] };
  }
  // Point at fraction f (0..1) of the path length, with tangent angle in degrees.
  function pointAt(parsed, f) {
    var target = clamp(f, 0, 1) * parsed.length, c = parsed.cum, p = parsed.pts, lo = 1;
    while (lo < c.length - 1 && c[lo] < target) lo++;
    var seg = c[lo] - c[lo - 1] || 1, u = (target - c[lo - 1]) / seg;
    var a = p[lo - 1], b = p[lo];
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI };
  }

  // The SVG surface. Stable semantic IDs: every created node gets data-id (and id) from the caller, deduped by throw.
  function createSurface(opts) {
    opts = opts || {};
    var host = opts.root;
    need(host && host.nodeType === 1, "root must be an element");
    var doc = host.ownerDocument;
    var width = finite(opts.width, "width", 1, 16384), height = finite(opts.height, "height", 1, 16384);
    var svg = doc.createElementNS(NS, "svg");
    svg.setAttribute("xmlns", NS);
    svg.setAttribute("width", width); svg.setAttribute("height", height);
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("data-medium-surface", "1");
    svg.style.cssText = "position:absolute;left:0;top:0;overflow:hidden";
    host.appendChild(svg);
    var ids = {}, disposed = false;
    function node(tag, attrs, parent, id, role) {
      need(!disposed, "surface is destroyed");
      var e = doc.createElementNS(NS, tag);
      if (id != null) {
        need(typeof id === "string" && id.length, "id must be a non-empty string");
        need(!ids[id], "duplicate element id " + id);
        ids[id] = { tag: tag, role: role || "decor", el: e };
        e.setAttribute("id", id); e.setAttribute("data-id", id); e.setAttribute("data-role", role || "decor");
      }
      for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(e);
      return e;
    }
    function set(e, attrs) { for (var k in attrs) { if (attrs[k] == null) e.removeAttribute(k); else e.setAttribute(k, attrs[k]); } }
    return {
      svg: svg, width: width, height: height, doc: doc, node: node, set: set,
      group: function (id, parent, role) { return node("g", null, parent, id, role); },
      describe: function () { var out = []; for (var k in ids) out.push({ id: k, tag: ids[k].tag, role: ids[k].role }); return out; },
      destroy: function () { if (disposed) return; disposed = true; if (svg.parentNode) svg.parentNode.removeChild(svg); ids = {}; }
    };
  }

  // The shared factory. `build` is supplied by a medium module; this validates, wires readiness, determinism and disposal.
  function createMediumScene(cfg) {
    need(cfg && typeof cfg === "object", "config required");
    need(typeof cfg.build === "function", "build(surface, ctx) required");
    var seed = cfg.seed == null ? "medium" : String(cfg.seed);
    var surface = createSurface({ root: cfg.root, width: cfg.width, height: cfg.height });
    var ctx = {
      seed: seed, width: surface.width, height: surface.height,
      assets: cfg.assets || {}, design: cfg.design || {}, content: cfg.content || {}, eventBindings: cfg.eventBindings || [],
      rngFor: function (id, frame) { return rngFor(seed, id, frame); }
    };
    var built = null, destroyed = false, last = null;
    var ready = Promise.resolve().then(function () {
      if (destroyed) return;
      built = cfg.build(surface, ctx);
      need(built && typeof built.update === "function", "build() must return { update(t, surface) }");
      built.update(0, surface);                    // a complete state exists once ready resolves
    });
    return {
      ready: ready,
      surface: surface,
      setTime: function (t) {
        need(!destroyed, "scene is destroyed");
        finite(t, "t");
        need(built, "setTime before ready resolved");
        if (t === last) return;                    // same time, same state: nothing to redraw
        last = t; built.update(t, surface);
      },
      // semantic elements, plus the medium's own claims (mode, data, provenance) once built
      describeElements: function () { var els = surface.describe(); return built && built.describe ? { elements: els, medium: built.describe() } : { elements: els, medium: null }; },
      destroy: function () { destroyed = true; built = null; surface.destroy(); }
    };
  }

  return {
    VERSION: VERSION, createMediumScene: createMediumScene, createSurface: createSurface,
    rng: rng, rngFor: rngFor, hashStr: hashStr, quantize: quantize, frameTime: frameTime,
    ease: ease, prog: prog, clamp: clamp, finite: finite, need: need,
    makeTransform: makeTransform, parsePath: parsePath, pointAt: pointAt
  };
});
