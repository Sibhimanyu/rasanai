/* RasanMotionKit: twelve named, deterministic motion mechanics bound to a PAUSED GSAP timeline.
 *
 *   <script src="assets/rasan-motion-kit/rasan-motion-kit.js"></script>     (after GSAP)
 *   var tl = gsap.timeline({ paused: true });
 *   var r = RasanMotionKit.apply({ id: "kinetic-type-mask-reveal-v1", timeline: tl, target: "#title",
 *             design: { colors: { fg: "#fff", accent: "#f60" }, fonts: { display: "Fraunces" } },
 *             motion: {}, fps: 30, seed: "film/02", cues: [1.2, 1.6], props: { text: "Made to be seen", at: 0.4 } });
 *   // r = { id, version, duration, hits: [t_s...], warnings: [...] }
 *
 *   RasanMotionKit.list()          the 12 ids, with family, label, params
 *   RasanMotionKit.ids             mapping table id -> { family, name, fn }
 *   RasanMotionKit.params(id)      the bounded parameter schema (type, min, max, default, enum)
 *   RasanMotionKit.reduced(id)     the reduced-motion behaviour, as a doc string (the export itself is unchanged)
 *
 * Catalog ids are verbatim from motion-kit/catalog.json (W03); only these 12 are implemented here.
 *
 * Contract: every mechanic adds ONE linear "clock" tween to the timeline you pass in. The tween drives a proxy whose
 * setter calls render(T) with the absolute timeline time T, and render is a PURE function of T (and the seeded hash).
 * Seek anywhere, in any order, any number of times: the DOM is the same. No rAF, no Date, no Math.random, no ticker,
 * no network, no eval, no innerHTML (text goes in by textContent only).
 *
 * Inputs are validated: unknown id, unknown timeline, URL-like / eval-like strings and bad CSS values throw; numbers are
 * clamped to their bounds. Colours and fonts come ONLY from `design` (colors / palette: fg, bg, accent, muted, surface;
 * fonts: display, body, mono). A missing role is simply not set, so the host page's own styling shows through.
 * Effects start at `props.at` (seconds) or, when `cues` (seconds, from motion/events.json visual hits) are given, at the cues.
 * Times are snapped to the frame grid of `fps`.
 *
 * Reuses the conventions of rasan-shape.js (the drive proxy), rasan-ui.js (the stateless seeded hash) and rasan-motion.js
 * (expo/ease vocabulary). It does not need those files loaded.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.RasanMotionKit = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var VERSION = 1;
  var LIB_VERSION = "1.0.0";

  // ---------------------------------------------------------------- mapping table: id -> family / name / function
  // ---------------------------------------------------------------- mapping table: catalog id -> family / name / function
  // (ids are the W03 catalog ids, verbatim; this is the one place that maps them to the implementation)
  var IDS = {
    "kinetic-type-text-mask-reveal-v1":    { family: "kinetic-type", name: "text-as-mask reveal",    fn: "textMaskReveal",       role: "entry" },
    "kinetic-type-tracking-tension-v1":    { family: "kinetic-type", name: "tracking tension",       fn: "trackingTension",      role: "emphasis" },
    "product-ui-card-stack-rotation-v1":   { family: "product-ui",   name: "card-stack rotation",    fn: "cardStackRotation",    role: "emphasis" },
    "shape-outline-to-solid-v1":           { family: "shape",        name: "outline-to-solid",       fn: "outlineToSolid",       role: "entry" },
    "shape-split-recombine-v1":            { family: "shape",        name: "split / recombine",      fn: "splitRecombine",       role: "emphasis" },
    "camera-space-layer-parallax-v1":      { family: "camera-space", name: "layer parallax",         fn: "layerParallax",        role: "background" },
    "sound-hit-downbeat-reveal-v1":        { family: "sound-hit",    name: "downbeat reveal",        fn: "downbeatReveal",       role: "entry" },
    "sound-hit-multi-part-contraction-v1": { family: "sound-hit",    name: "multi-part contraction", fn: "multiPartContraction", role: "emphasis" },
    "sound-hit-visual-foley-hit-v1":       { family: "sound-hit",    name: "visual foley hit",       fn: "visualFoleyHit",       role: "emphasis" },
    "data-evidence-evidence-number-reveal-v1": { family: "data-evidence", name: "evidence number reveal", fn: "evidenceNumberReveal", role: "emphasis" },
    "texture-seeded-jitter-v1":            { family: "texture",      name: "seeded jitter",          fn: "seededJitter",         role: "background" },
    "ending-hold-then-cut-v1":             { family: "ending",       name: "hold-then-cut",          fn: "holdThenCut",          role: "ending" },
  };

  // ---------------------------------------------------------------- parameter schemas (names and bounds = catalog.json)
  var N = function (min, max, def) { return { type: "number", min: min, max: max, default: def }; };
  var S = function (def, max) { return { type: "string", max: max || 200, default: def }; };
  var E = function (list, def) { return { type: "enum", enum: list, default: def }; };
  // extras every mechanic accepts (additive to the catalog): where to start, frame size override, optional text content
  var COMMON = { at: N(0, 3600, 0), width: N(16, 8192, 0), height: N(16, 8192, 0), text: S("", 300) };
  var PARAMS = {
    "kinetic-type-text-mask-reveal-v1":    { lineDelay: N(0.04, 0.4, 0.12), travel: N(0.4, 1.4, 1), duration: N(0.3, 1.2, 0.6), direction: E(["up", "down"], "up") },
    "kinetic-type-tracking-tension-v1":    { from: N(0, 0.3, 0.14), to: N(-0.06, 0.1, 0), relax: N(0, 0.04, 0.01), duration: N(0.3, 1.5, 0.7) },
    "product-ui-card-stack-rotation-v1":   { cards: N(3, 6, 4), stepOffset: N(8, 40, 20), duration: N(0.4, 1.2, 0.7), arc: N(0, 80, 32) },
    "shape-outline-to-solid-v1":           { drawDuration: N(0.3, 2, 0.8), fillDuration: N(0.1, 1, 0.4), fillDelay: N(0, 0.6, 0.1) },
    "shape-split-recombine-v1":            { pieces: N(2, 8, 4), spread: N(20, 300, 120), holdDuration: N(0, 1, 0.25), duration: N(0.6, 2.4, 1.2) },
    "camera-space-layer-parallax-v1":      { layers: N(2, 6, 3), travel: N(20, 400, 120), duration: N(1, 10, 5), axis: E(["x", "y"], "x") },
    "sound-hit-downbeat-reveal-v1":        { cue: N(0, 300, 0), overshoot: N(0, 0.3, 0.08), duration: N(0.15, 0.8, 0.35) },
    "sound-hit-multi-part-contraction-v1": { parts: N(2, 8, 4), compression: N(0.2, 0.9, 0.6), releaseDuration: N(0.1, 0.8, 0.3) },
    "sound-hit-visual-foley-hit-v1":       { cue: N(0, 300, 0), intensity: N(0.02, 0.3, 0.1), duration: N(0.08, 0.5, 0.2) },
    "data-evidence-evidence-number-reveal-v1": { value: N(0, 1e12, 100), decimals: N(0, 4, 0), duration: N(0.4, 3, 1.2), prefix: S("", 40), suffix: S("", 40) },
    "texture-seeded-jitter-v1":            { amount: N(0, 6, 1.2), rate: N(2, 24, 8), seedOffset: N(0, 999, 0), duration: N(0.1, 60, 4) },
    "ending-hold-then-cut-v1":             { hold: N(0.3, 5, 1.5), cutAt: N(0, 300, 0) },
  };

  var REDUCED = {
    "kinetic-type-text-mask-reveal-v1": "Lines appear in place with a short opacity step, no travel.",
    "kinetic-type-tracking-tension-v1": "Final tracking applied immediately.",
    "product-ui-card-stack-rotation-v1": "Final stack order shown, no cycling.",
    "shape-outline-to-solid-v1": "Solid shape shown at once.",
    "shape-split-recombine-v1": "Final arrangement shown; no travel.",
    "camera-space-layer-parallax-v1": "Layers rest at their midpoint, no drift.",
    "sound-hit-downbeat-reveal-v1": "Element visible from the cue time with no scale overshoot.",
    "sound-hit-multi-part-contraction-v1": "Parts rest at their final spacing, no compression.",
    "sound-hit-visual-foley-hit-v1": "No pulse, element stays put.",
    "data-evidence-evidence-number-reveal-v1": "Final value shown, no counting.",
    "texture-seeded-jitter-v1": "Static at rest position.",
    "ending-hold-then-cut-v1": "Last frame shown for the hold.",
  };

  // ---------------------------------------------------------------- helpers
  function fail(msg) { throw new Error("RasanMotionKit: " + msg); }
  function need(c, m) { if (!c) fail(m); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function c01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  var easeOut = function (p) { p = c01(p); return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); };           // expo.out
  var easeIn = function (p) { p = c01(p); return p <= 0 ? 0 : Math.pow(2, 10 * (p - 1)); };            // expo.in (approx, 0 at 0)
  var easeInOut = function (p) { p = c01(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  var easeOutQuad = function (p) { p = c01(p); return 1 - (1 - p) * (1 - p); };
  function seg(T, a, b) { return b > a ? c01((T - a) / (b - a)) : T >= b ? 1 : 0; } // progress of T through [a, b]

  function seedOf(s) { var h = 2166136261; s = String(s == null ? "rasan-motion-kit" : s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
  function hash(n, seed) { // stateless seeded hash in [0,1): the same inputs give the same number, in any order
    var h = Math.imul((n | 0) + 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((seed | 0) + 1, 0x27D4EB2F);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // strings: reject URL-like, script-like and eval-like content anywhere (text, CSS values, selectors)
  var BAD = /(https?:|wss?:|ftp:|file:|data:|javascript:|vbscript:|blob:|\/\/[a-z0-9]|\bwww\.)|<\s*\/?\s*(script|iframe|object|embed|link|style)|\beval\s*\(|\bFunction\s*\(|\bimport\s*\(|url\s*\(|expression\s*\(|@import|on[a-z]+\s*=/i;
  function str(v, max, what) {
    need(typeof v === "string", what + " must be a string");
    need(v.length <= max, what + " is longer than " + max + " characters");
    need(!BAD.test(v), what + " contains a URL-like or script-like value, which is not allowed");
    return v;
  }
  var COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([0-9a-z.,%\s\/+-]+\)|[a-z]{3,24})$/i;
  function colorOf(v, what) {
    if (v == null || v === "") return "";
    str(v, 80, what);
    need(COLOR.test(v.trim()), what + " is not a plain CSS colour");
    return v.trim();
  }
  var FONT = /^[A-Za-z0-9 ,"'._-]+$/;
  function fontOf(v, what) {
    if (v == null || v === "") return "";
    str(v, 160, what);
    need(FONT.test(v), what + " is not a plain font-family list");
    return v;
  }
  function readDesign(design) {
    design = design && typeof design === "object" ? design : {};
    var c = design.colors || design.palette || (design.tokens && design.tokens.colors) || design;
    var f = design.fonts || design.typography || (design.tokens && design.tokens.fonts) || {};
    function pick(o, keys, what) { for (var i = 0; i < keys.length; i++) { var v = o && o[keys[i]]; if (v != null && v !== "") return colorOf(typeof v === "object" && v.value ? v.value : v, what); } return ""; }
    function pickF(o, keys, what) { for (var i = 0; i < keys.length; i++) { var v = o && o[keys[i]]; if (v != null && v !== "") return fontOf(typeof v === "object" && v.family ? v.family : v, what); } return ""; }
    return {
      fg: pick(c, ["fg", "foreground", "text", "ink", "on_bg"], "design fg"),
      bg: pick(c, ["bg", "background", "canvas", "paper"], "design bg"),
      accent: pick(c, ["accent", "primary", "brand", "signal"], "design accent"),
      muted: pick(c, ["muted", "secondary", "line", "border"], "design muted"),
      surface: pick(c, ["surface", "card", "panel"], "design surface"),
      fontD: pickF(f, ["display", "heading", "title", "head"], "design display font"),
      fontB: pickF(f, ["body", "text", "ui", "sans"], "design body font"),
      fontM: pickF(f, ["mono", "code"], "design mono font"),
    };
  }

  function validate(id, raw, warnings) {
    var schema = {}, k;
    for (k in COMMON) schema[k] = COMMON[k];
    for (k in PARAMS[id]) schema[k] = PARAMS[id][k];
    raw = raw && typeof raw === "object" ? raw : {};
    var out = {};
    for (k in raw) if (!Object.prototype.hasOwnProperty.call(schema, k)) warnings.push("unknown prop ignored: " + String(k).slice(0, 40));
    for (k in schema) {
      var d = schema[k], v = raw[k];
      if (v == null) { out[k] = d.default; continue; }
      if (d.type === "number") {
        need(typeof v === "number" && isFinite(v), "prop " + k + " must be a finite number");
        out[k] = clamp(v, d.min, d.max);
      } else if (d.type === "string") out[k] = str(v, d.max, "prop " + k);
      else { need(d.enum.indexOf(v) >= 0, "prop " + k + " must be one of " + d.enum.join(", ")); out[k] = v; }
    }
    return out;
  }

  // ---------------------------------------------------------------- DOM helpers (textContent only, never innerHTML)
  function resolveTarget(t) {
    if (typeof t === "string") {
      str(t, 200, "target selector");
      need(typeof document !== "undefined" && document.querySelector, "no document to resolve the target selector");
      var e = document.querySelector(t); need(e, 'no element for "' + t + '"'); return e;
    }
    need(t && t.nodeType === 1, "target must be an element or a selector");
    return t;
  }
  function css(e, o) { for (var k in o) if (o[k] !== "" && o[k] != null) e.style[k] = o[k]; return e; }
  function mk(parent, tag, style, text) {
    var e = document.createElement(tag);
    css(e, style || {});
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  }
  function absFill(extra) { var o = { position: "absolute", left: "0px", top: "0px", width: "100%", height: "100%" }; for (var k in extra) o[k] = extra[k]; return o; }
  function pct(v) { return r3(v) + "%"; }
  function px(v) { return r3(v) + "px"; }
  function words(s) { return s.split(/\s+/).filter(function (w) { return w.length; }); }
  function setText(e, s) { if (e.__t !== s) { e.textContent = s; e.__t = s; } }

  // The one mechanism: a linear tween on a proxy whose setter calls render(T) with the absolute timeline time.
  function clock(tl, start, end, render) {
    var span = Math.max(1e-4, end - start), v = 0, o = {};
    Object.defineProperty(o, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; render(x >= 1 ? r6(start + span) : r6(start + x * span)); } });
    render(r6(start));
    tl.fromTo(o, { p: 0 }, { p: 1, duration: span, ease: "none", immediateRender: false }, start);
    return o;
  }

  // ---------------------------------------------------------------- mechanics: each returns { start, end, hits, render(T) }
  // Mechanics that work on content you already placed (text lines, cards, layers, parts) take the CHILDREN of `target`; when the
  // target is empty they build placeholder content in a host layer (props.text, "|" separates lines/labels). They write inline
  // style (opacity, transform, clip-path, letter-spacing) on those elements, so give them no competing tweens.
  var M = {};
  function kids(c, n, build) {
    var own = c.target.children ? Array.prototype.slice.call(c.target.children).filter(function (e) { return !e.getAttribute || e.getAttribute("data-motion-kit-host") == null; }) : [];
    if (own.length) return own.slice(0, n || own.length);
    var out = [], i; for (i = 0; i < (n || 1); i++) out.push(build(i)); return out;
  }
  function ownKids(c) { return c.target.children ? Array.prototype.slice.call(c.target.children).filter(function (e) { return !(e.getAttribute && e.getAttribute("data-motion-kit-host") != null); }) : []; }
  function firstCue(c, fallback) { return c.q(c.cues.length ? c.cues[0] : fallback); }
  function lines(c) { return c.P.text.split("|").map(function (s) { return s.trim(); }).filter(Boolean); }

  // kinetic type: lines rise out of their own clip box (a hard edge, not a fade)
  M.textMaskReveal = function (c) {
    var P = c.P, ls = lines(c), els = ownKids(c);
    if (!els.length) {
      need(ls.length > 0, "text mask reveal needs lines in the target or props.text");
      var box = mk(c.host, "div", absFill({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }));
      els = ls.map(function (t) { return mk(box, "div", { fontSize: px(0.1 * c.H), lineHeight: "1.08", fontWeight: "700", whiteSpace: "nowrap" }, t); });
    }
    var n = els.length, slots = [], i;
    for (i = 0; i < n; i++) {
      var e = els[i], slot = mk(e.parentNode, "div", { overflow: "hidden", paddingBottom: "0.14em", marginBottom: "-0.14em" });
      if (e.parentNode.insertBefore) e.parentNode.insertBefore(slot, e); slot.appendChild(e);
      css(e, { color: c.d.fg, fontFamily: c.d.fontD });
      slots.push(e);
    }
    var t0 = c.q(c.cues.length ? c.cues[0] : c.at), ts = [], hits = [], sign = P.direction === "up" ? 1 : -1;
    for (i = 0; i < n; i++) { ts.push(c.q(c.cues.length > i ? c.cues[i] : t0 + i * P.lineDelay)); hits.push(ts[i]); }
    var start = Math.min.apply(null, ts), end = Math.max.apply(null, ts) + P.duration;
    return { start: start, end: end, hits: hits, render: function (T) {
      for (var i = 0; i < n; i++) slots[i].style.transform = "translateY(" + pct(sign * (1 - easeOut(seg(T, ts[i], ts[i] + P.duration))) * P.travel * 110) + ")";
    } };
  };

  // kinetic type: tracking tightens as the word lands, loading it with pressure, then relaxes a hair
  M.trackingTension = function (c) {
    var P = c.P, e = c.target, t0 = firstCue(c, c.at), tight = P.to - P.relax, land = t0 + P.duration * 0.7, end = t0 + P.duration;
    css(e, { color: c.d.fg, fontFamily: c.d.fontD });
    return { start: t0, end: end, hits: [r6(land)], render: function (T) {
      var ls = T < land ? lerp(P.from, tight, easeOut(seg(T, t0, land))) : lerp(tight, P.to, easeInOut(seg(T, land, end)));
      e.style.letterSpacing = r3(ls) + "em";
    } };
  };

  // product UI: the top card leaves along an arc and re-enters at the bottom; the rest step forward
  M.cardStackRotation = function (c) {
    var P = c.P, n = Math.round(P.cards), labels = lines(c), W = c.W, H = c.H;
    var cards = kids(c, n, function (i) {
      var cw = W * 0.4, ch = H * 0.34, e = mk(c.host, "div", { position: "absolute", left: px((W - cw) / 2), top: px((H - ch) / 2), width: px(cw), height: px(ch), boxSizing: "border-box", borderRadius: px(H * 0.03), padding: px(H * 0.03), fontFamily: c.d.fontB, fontSize: px(H * 0.05), fontWeight: "700", display: "flex", alignItems: "flex-end" }, labels[i] || ("Card " + (i + 1)));
      css(e, { backgroundColor: c.d.surface, color: c.d.fg, borderStyle: "solid", borderWidth: "2px", borderColor: c.d.muted || c.d.fg });
      return e;
    });
    n = cards.length;
    var steps = c.cues.length ? c.cues.slice() : [c.q(c.at)], start = steps[0], end = steps[steps.length - 1] + P.duration, hits = steps.slice();
    return { start: start, end: end, hits: hits, render: function (T) {
      var prog = 0; for (var k = 0; k < steps.length; k++) prog += easeInOut(seg(T, steps[k], steps[k] + P.duration));
      for (var i = 0; i < n; i++) {
        var f = i - prog; if (f < -1) f = f + n * Math.ceil((-1 - f) / n);
        var e = cards[i], x = 0, y, s, o, rot, z;
        if (f < 0) { var u = -f, ang = P.arc * u * Math.PI / 180; x = Math.sin(ang) * H * 0.35 * (i % 2 ? -1 : 1); y = -(1 - Math.cos(ang)) * H * 0.2 - u * H * 0.05; s = 1 - 0.04 * u; o = 1 - u * 0.9; rot = (i % 2 ? -1 : 1) * u * P.arc * 0.25; z = n + 1; }
        else { y = f * P.stepOffset * -1; s = 1 - f * 0.05; o = Math.max(0.15, 1 - f * 0.2); rot = 0; z = Math.round(n - f); }
        e.style.transform = "translate(" + r3(x) + "px," + r3(y) + "px) scale(" + r3(s) + ") rotate(" + r3(rot) + "deg)";
        e.style.opacity = r3(o); e.style.zIndex = String(z);
      }
    } };
  };

  // shape: a stroked shape draws on, then its fill floods in from the stroke
  M.outlineToSolid = function (c) {
    var P = c.P, s = 0.4 * Math.min(c.W, c.H), SVGNS = "http://www.w3.org/2000/svg", col = c.d.accent || c.d.fg;
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + r3(c.W) + " " + r3(c.H)); svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%");
    css(svg, { position: "absolute", left: "0px", top: "0px" }); c.host.appendChild(svg);
    var rect = document.createElementNS(SVGNS, "rect");
    rect.setAttribute("x", r3((c.W - s * 1.5) / 2)); rect.setAttribute("y", r3((c.H - s) / 2)); rect.setAttribute("width", r3(s * 1.5)); rect.setAttribute("height", r3(s));
    rect.setAttribute("rx", r3(s * 0.12)); rect.setAttribute("pathLength", "1"); rect.setAttribute("fill", col || "currentColor"); rect.setAttribute("stroke", col || "currentColor");
    rect.setAttribute("stroke-width", r3(Math.max(2, s * 0.025))); rect.setAttribute("stroke-dasharray", "1 1"); svg.appendChild(rect);
    var t0 = firstCue(c, c.at), t1 = t0 + P.drawDuration, f0 = t1 + P.fillDelay, f1 = f0 + P.fillDuration;
    return { start: t0, end: f1, hits: [r6(f0)], render: function (T) {
      rect.setAttribute("stroke-dashoffset", r3(1 - easeInOut(seg(T, t0, t1))));
      rect.setAttribute("fill-opacity", r3(easeInOut(seg(T, f0, f1))));
      rect.setAttribute("stroke-opacity", T < t0 ? "0" : "1");
    } };
  };

  // shape: an element divides into pieces that drift apart and snap back as one
  M.splitRecombine = function (c) {
    var P = c.P, n = Math.round(P.pieces), bw = c.W * 0.5, bh = c.H * 0.3, sw = bw / n, pieces = [], dir = [], rot = [], i;
    var box = mk(c.host, "div", { position: "absolute", left: px((c.W - bw) / 2), top: px((c.H - bh) / 2), width: px(bw), height: px(bh) });
    for (i = 0; i < n; i++) {
      var s = mk(box, "div", { position: "absolute", overflow: "hidden", left: px(i * sw), top: "0px", width: px(sw), height: px(bh) });
      css(s, { backgroundColor: c.d.accent || c.d.fg });
      if (c.P.text) css(mk(s, "div", { position: "absolute", left: px(-i * sw), top: "0px", width: px(bw), height: px(bh), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: c.d.fontD, fontWeight: "800", fontSize: px(bh * 0.4), whiteSpace: "nowrap" }, c.P.text), { color: c.d.bg || c.d.fg });
      pieces.push(s); dir.push((i % 2 ? 1 : -1) * (0.5 + 0.5 * hash(i, c.seed))); rot.push((hash(i + 101, c.seed) - 0.5) * 10);
    }
    var t0 = firstCue(c, c.at), mv = Math.max(0.1, (P.duration - P.holdDuration) / 2), t1 = t0 + mv, t2 = t1 + P.holdDuration, t3 = t2 + mv;
    return { start: t0, end: t3, hits: [r6(t3)], render: function (T) {
      var apart = easeOut(seg(T, t0, t1)) * (1 - easeInOut(seg(T, t2, t3)));
      for (var i = 0; i < n; i++) pieces[i].style.transform = "translate(0px," + r3(dir[i] * P.spread * apart) + "px) rotate(" + r3(rot[i] * apart) + "deg)";
    } };
  };

  // smooth seeded noise in [-1, 1]: hash at integer knots, smoothstep between (a pure function of x)
  function noise(x, seed) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1; }

  // camera space: layers drift laterally at different rates with a seeded wobble
  M.layerParallax = function (c) {
    var P = c.P, n = Math.round(P.layers), ls = kids(c, n, function (i) {
      var e = mk(c.host, "div", absFill({ opacity: String(0.25 + 0.2 * i) })); css(e, { backgroundColor: c.d.accent || c.d.surface || c.d.fg }); e.style.height = pct(100 / (n + 1)); e.style.top = pct(100 * (i + 0.5) / (n + 1)); return e;
    }), t0 = firstCue(c, c.at), t1 = t0 + P.duration, hits = [];
    n = ls.length;
    return { start: t0, end: t1, hits: hits, render: function (T) {
      var u = seg(T, t0, t1);
      for (var i = 0; i < n; i++) {
        var rate = (i + 1) / n, d = lerp(-P.travel / 2, P.travel / 2, u) * rate + noise((T - t0) * 0.6 + i * 7, c.seed + i) * P.travel * 0.02 * rate;
        ls[i].style.transform = "translate(" + (P.axis === "x" ? r3(d) + "px,0px" : "0px," + r3(d) + "px") + ")";
      }
    } };
  };

  // sound hit: hidden until the cue, then lands exactly on it with a short overshoot. Several children land on several cues.
  M.downbeatReveal = function (c) {
    var P = c.P, own = ownKids(c), items = own.length ? own : [c.target], n = items.length, ts = [], i;
    var base = c.q(c.cues.length ? c.cues[0] : (P.cue > 0 ? P.cue : c.at));
    for (i = 0; i < n; i++) ts.push(c.cues.length > 1 ? c.cues[Math.min(i, c.cues.length - 1)] : base);
    var start = Math.min.apply(null, ts), end = Math.max.apply(null, ts) + P.duration, wipe = Math.min(P.duration, 3 / c.fps);
    return { start: start, end: end, hits: ts.slice(), render: function (T) {
      for (var i = 0; i < n; i++) {
        var e = items[i], shown = T >= ts[i] - 1e-6, p = seg(T, ts[i], ts[i] + P.duration), s = lerp(0.85, 1, easeOut(p)) + P.overshoot * Math.sin(Math.PI * p) * (1 - p) * 2;
        e.style.visibility = shown ? "visible" : "hidden";
        e.style.clipPath = shown ? "inset(0 " + pct((1 - seg(T, ts[i], ts[i] + wipe)) * 100) + " 0 0)" : "inset(0 100% 0 0)";
        e.style.transform = "scale(" + r3(shown ? s : 0.85) + ")";
      }
    } };
  };

  // sound hit: several parts compress toward one point across successive beats, then release
  M.multiPartContraction = function (c) {
    var P = c.P, n = Math.round(P.parts), gap = c.W * 0.08, parts = kids(c, n, function (i) {
      var s = c.H * 0.1, e = mk(c.host, "div", { position: "absolute", width: px(s), height: px(s), top: px((c.H - s) / 2), left: px(c.W / 2 + (i - (n - 1) / 2) * gap - s / 2), borderRadius: "50%" });
      css(e, { backgroundColor: c.d.accent || c.d.fg }); return e;
    });
    n = parts.length;
    var beats = c.cues.length >= 2 ? c.cues.slice() : [c.q(c.at), c.q(c.at) + 0.5, c.q(c.at) + 1], K = beats.length - 1, rel = beats[K], end = rel + P.releaseDuration, snap = 3 / c.fps;
    return { start: beats[0], end: end, hits: beats.slice(), render: function (T) {
      var k = 0; for (var j = 0; j < K; j++) k += easeOut(seg(T, beats[j], beats[j] + snap));   // one stepped compression per beat
      var f = (1 - P.compression * (k / K)) , rl = easeOut(seg(T, rel, end)), factor = lerp(f, 1, rl);
      for (var i = 0; i < n; i++) parts[i].style.transform = "translateX(" + r3(-(i - (n - 1) / 2) * gap * (1 - factor)) + "px)";
    } };
  };

  // sound hit: a short impact pulse (scale, flash, offset) timed to the frame of a foley sound
  M.visualFoleyHit = function (c) {
    var P = c.P, e = c.target, t0 = c.q(c.cues.length ? c.cues[0] : (P.cue > 0 ? P.cue : c.at)), end = t0 + P.duration;
    return { start: t0, end: end, hits: [t0], render: function (T) {
      var u = seg(T, t0, end), k = T >= t0 - 1e-6 && u < 1 ? Math.pow(1 - u, 2) : 0, dir = hash(Math.round(t0 * 1000), c.seed) < 0.5 ? -1 : 1;
      e.style.transform = "translate(0px," + r3(dir * k * P.intensity * c.H * 0.04) + "px) scale(" + r3(1 + P.intensity * k) + ")";
      e.style.filter = "brightness(" + r3(1 + P.intensity * 3 * k) + ")";
    } };
  };

  // data evidence: a figure counts up and resolves exactly on its true value, then an optional source line (props.text) appears
  M.evidenceNumberReveal = function (c) {
    var P = c.P, fs = 0.2 * c.H, dec = Math.round(P.decimals);
    var box = mk(c.host, "div", absFill({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" })), num = mk(box, "div", { fontSize: px(fs), fontWeight: "700", whiteSpace: "pre", fontVariantNumeric: "tabular-nums" });
    css(num, { color: c.d.accent || c.d.fg, fontFamily: c.d.fontD });
    var src = c.P.text ? css(mk(box, "div", { fontSize: px(fs * 0.17), marginTop: px(fs * 0.12), opacity: "0" }, c.P.text), { color: c.d.muted || c.d.fg, fontFamily: c.d.fontB }) : null;
    var t0 = firstCue(c, c.at), t1 = t0 + P.duration, end = t1 + (src ? 0.4 : 0);
    function show(v) { return P.prefix + fmtNum(v, dec, "comma") + P.suffix; }
    return { start: t0, end: end, hits: [r6(t1)], render: function (T) {
      var p = easeOut(seg(T, t0, t1)); setText(num, show(p >= 1 ? P.value : P.value * p));
      if (src) src.style.opacity = r3(seg(T, t1, end));
    } };
  };
  function fmtNum(v, dec, group) {
    var neg = v < 0, s = Math.abs(v).toFixed(dec), parts = s.split("."), ip = parts[0];
    if (group === "comma") ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + ip + (parts[1] ? "." + parts[1] : "");
  }

  // texture: small position and rotation tremor, a pure function of time and a seed (stepped at `rate` per second)
  M.seededJitter = function (c) {
    var P = c.P, e = c.target, t0 = c.q(c.at), t1 = t0 + P.duration, sd = c.seed + Math.round(P.seedOffset) * 7919;
    return { start: t0, end: t1, hits: [], render: function (T) {
      var st = Math.floor((T - t0) * P.rate + 1e-6);
      e.style.transform = "translate(" + r3((hash(st * 3, sd) - 0.5) * 2 * P.amount) + "px," + r3((hash(st * 3 + 1, sd) - 0.5) * 2 * P.amount) + "px) rotate(" + r3((hash(st * 3 + 2, sd) - 0.5) * 2 * P.amount * 0.15) + "deg)";
    } };
  };

  // ending: the final frame holds still for a beat (a barely-there push), then hard-cuts to the background on the downbeat
  M.holdThenCut = function (c) {
    var P = c.P, e = c.target, start = c.q(c.at), cut = c.q(c.cues.length ? c.cues[0] : (P.cutAt > 0 ? P.cutAt : start + P.hold)), tail = 0.4;
    var cover = mk(c.host, "div", absFill({ visibility: "hidden", zIndex: "9" }));
    css(cover, { backgroundColor: c.d.bg });   // the cut lands on the design background; with none, the content simply drops out
    var from = Math.min(start, cut);
    return { start: from, end: Math.max(cut + tail, from + 1 / c.fps), hits: [cut], render: function (T) {
      var after = T >= cut - 1e-6;
      e.style.transform = "scale(" + r3(1 + 0.02 * easeOutQuad(seg(T, from, cut))) + ")";
      e.style.visibility = after ? "hidden" : "visible";
      cover.style.visibility = after ? "visible" : "hidden";
    } };
  };

  // ---------------------------------------------------------------- public API
  function apply(spec) {
    need(spec && typeof spec === "object", "apply needs a spec object");
    need(typeof spec.id === "string", "spec.id must be a string");
    str(spec.id, 80, "spec.id");
    need(Object.prototype.hasOwnProperty.call(IDS, spec.id), "unknown mechanic id: " + spec.id.slice(0, 60));
    var tl = spec.timeline;
    need(tl && typeof tl.fromTo === "function" && typeof tl.paused === "function", "spec.timeline must be a GSAP timeline");
    need(tl.paused() === true, "spec.timeline must be paused (the kit never plays it)");
    var warnings = [], info = IDS[spec.id], target = resolveTarget(spec.target);
    var fps = typeof spec.fps === "number" && isFinite(spec.fps) ? clamp(Math.round(spec.fps), 1, 240) : 30;
    var P = validate(spec.id, spec.props, warnings), design = readDesign(spec.design), seed = seedOf(spec.seed);
    if (spec.motion != null) need(typeof spec.motion === "object", "spec.motion must be an object");
    var q = function (t) { return Math.round(t * fps) / fps; };
    var cues = [];
    if (spec.cues != null) {
      need(Array.isArray(spec.cues) && spec.cues.length <= 64, "spec.cues must be an array of at most 64 seconds");
      cues = spec.cues.map(function (t) { need(typeof t === "number" && isFinite(t), "cues must be finite numbers"); return q(clamp(t, 0, 3600)); }).sort(function (a, b) { return a - b; });
    }
    var W = P.width || target.clientWidth || target.offsetWidth || 1920, H = P.height || target.clientHeight || target.offsetHeight || 1080;
    var host = mk(target, "div", { position: "absolute", left: "0px", top: "0px", width: "100%", height: "100%", pointerEvents: "none" });
    host.setAttribute("data-motion-kit-host", spec.id);
    var ctx = { host: host, target: target, d: design, P: P, at: q(P.at), cues: cues, fps: fps, seed: seed, W: W, H: H, q: q };
    var m = M[info.fn](ctx);
    clock(tl, m.start, m.end, m.render);
    var hits = m.hits.map(r6);
    need(isFinite(m.end - m.start), "internal: non-finite duration");
    return { id: spec.id, version: VERSION, duration: r6(m.end - m.start), start: r6(m.start), end: r6(m.end), hits: hits, warnings: warnings };
  }

  function list() {
    return Object.keys(IDS).map(function (id) { return { id: id, version: VERSION, family: IDS[id].family, label: IDS[id].name, role: IDS[id].role, implementation: "runtime/rasan-motion-kit.js:" + IDS[id].fn, params: params(id) }; });
  }
  function params(id) {
    need(Object.prototype.hasOwnProperty.call(IDS, String(id)), "unknown mechanic id");
    var o = {}, k; for (k in COMMON) o[k] = COMMON[k]; for (k in PARAMS[id]) o[k] = PARAMS[id][k];
    return JSON.parse(JSON.stringify(o));
  }
  function reduced(id) { need(Object.prototype.hasOwnProperty.call(REDUCED, String(id)), "unknown mechanic id"); return REDUCED[id]; }

  var ids = {}; Object.keys(IDS).forEach(function (k) { ids[k] = { family: IDS[k].family, name: IDS[k].name, fn: IDS[k].fn }; });

  return { apply: apply, list: list, version: VERSION, libVersion: LIB_VERSION, ids: ids, params: params, reduced: reduced };
});
