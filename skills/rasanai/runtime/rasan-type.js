/* RasanType: three role-aware text operations RasanShape does not have (W13). Everything else a type performance needs already exists:
 * RasanShape.split (chars / words / lines, aria-label kept on the host), .followPath (path-following type), .morph (flubber, needs a path),
 * .scatter (repeated / scattered field), .iris / .flood (circular reveals), RasanCamera (scale passage). This file ADDS:
 *   RasanType.outlineFill(tl, target, { at, duration, ease, fill: [r, g, b], stroke: "currentColor", strokeWidth: 2, dir: "to-fill"|"to-outline", stagger })
 *   RasanType.maskReveal(tl, target, { at, duration, ease, dir: "up"|"down"|"left"|"right", stagger })       clip-path inset per fragment
 *   RasanType.reorder(tl, fragments, { order: [slot index per fragment], at, duration, ease, stagger })        fragments travel from the wrong slots into their own
 *   RasanType.scriptInfo(text) -> { scripts, rtl, complex, charSplit, wordSplit, notes[] }   (pure; also used by lib/text-performance.mjs)
 * `target` is an element / selector / array / the array RasanShape.split returns. The logical text is never altered: the host keeps its aria-label
 * (RasanShape.split sets it) and reorder only translates, so the DOM reading order is the intended phrase at all times; a fragment effect never
 * rewrites language. Same contract as RasanShape: a tween on a proxy whose setter is a PURE function of progress; seek-safe; no randomness, no wall clock.
 * Layout is measured once at call time: call after document.fonts.ready (the page should await it before building the timeline) or fragments are mis-placed.
 * Also loadable from Node (module.exports) for the pure scriptInfo only; the DOM operations need a document.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RasanType = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";
  var VERSION = "1.0.0";

  // ------------------------------------------------------------------ pure: what is safe to split
  var RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;   // Hebrew, Arabic, Syriac, Thaana, Arabic presentation forms
  var COMPLEX = /[ऀ-෿฀-໿ༀ-࿿က-႟ក-៿]/; // Indic, Thai, Lao, Tibetan, Myanmar, Khmer: clusters reshape
  var CJK = /[぀-ヿ㐀-鿿가-힯]/;
  var LATINISH = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
  function scriptInfo(text) {
    var t = String(text == null ? "" : text), scripts = [], notes = [];
    var rtl = RTL.test(t), complex = COMPLEX.test(t);
    if (rtl) scripts.push("rtl"); if (complex) scripts.push("complex"); if (CJK.test(t)) scripts.push("cjk"); if (LATINISH.test(t)) scripts.push("latin-like");
    var charSplit = "supported";
    if (rtl || complex) { charSplit = "unavailable"; notes.push("letters join or reshape by context; per-character fragments would break the language"); }
    else if (LATINISH.test(t) && /(fi|fl|ff|ffi|ffl)/.test(t)) { charSplit = "uncertain"; notes.push("per-character fragments drop ligatures and pair kerning unless the host sets font-kerning/ligatures; unverified for this font"); }
    else if (LATINISH.test(t)) { charSplit = "uncertain"; notes.push("per-character fragments lose pair kerning; unverified for this font"); }
    if (/[‍̀-ͯ]/.test(t)) { charSplit = charSplit === "unavailable" ? charSplit : "uncertain"; notes.push("combining marks or joiners present"); }
    return { scripts: scripts, rtl: rtl, complex: complex, charSplit: charSplit, wordSplit: rtl || complex ? "uncertain" : "supported", notes: notes };
  }

  // ------------------------------------------------------------------ DOM helpers
  function need(cond, msg) { if (!cond) throw new Error("RasanType: " + msg); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var EASE = {
    none: function (p) { return p; },
    "power2.out": function (p) { return 1 - (1 - p) * (1 - p); },
    "power3.out": function (p) { return 1 - Math.pow(1 - p, 3); },
    "power2.inOut": function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },
    "expo.out": function (p) { return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); },
  };
  function frags(x) {
    if (typeof x === "string") return Array.prototype.slice.call(document.querySelectorAll(x));
    if (x && x.nodeType === 1) return [x];
    return Array.prototype.slice.call(x || []);
  }
  // progress of fragment i of n inside the group's progress p, with a stagger of `s` (fraction of the span spent on the offsets)
  function local(p, i, n, s) {
    if (!s || n < 2) return p;
    var span = 1 - s, start = (i / (n - 1)) * s;
    return clamp((p - start) / span, 0, 1);
  }
  function drive(tl, at, duration, apply) {
    need(tl && typeof tl.fromTo === "function", "the first argument must be a GSAP timeline");
    var v = 0, o = {};
    Object.defineProperty(o, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; apply(x); } });
    apply(0);
    tl.fromTo(o, { p: 0 }, { p: 1, duration: Math.max(0.0001, duration), ease: "none", immediateRender: false }, at || 0);
    return o;
  }
  function easeOf(name) { return EASE[name] || EASE.none; }

  // outline <-> fill. The stroke stays; the fill alpha is the progress. dir "to-fill": outline first, fill arrives. Text stays real text.
  function outlineFill(tl, target, o) {
    o = o || {};
    var els = frags(target), ez = easeOf(o.ease), rgb = o.fill || [255, 255, 255], toFill = (o.dir || "to-fill") === "to-fill";
    var sw = o.strokeWidth || 2, stroke = o.stroke || "currentColor", st = o.stagger || 0;
    els.forEach(function (e) { e.style.webkitTextStroke = sw + "px " + stroke; e.style.paintOrder = "stroke fill"; });
    return drive(tl, o.at, o.duration || 0.8, function (p) {
      els.forEach(function (e, i) {
        var q = ez(local(p, i, els.length, st)), a = toFill ? q : 1 - q;
        e.style.webkitTextFillColor = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")";
      });
    });
  }

  // masked reveal: each fragment is clipped from its own edge (inset) and opens to the full box. dir is the direction the text appears FROM.
  function maskReveal(tl, target, o) {
    o = o || {};
    var els = frags(target), ez = easeOf(o.ease || "power3.out"), dir = o.dir || "up", st = o.stagger || 0;
    els.forEach(function (e) { if (!e.style.display || e.style.display === "inline") e.style.display = "inline-block"; });
    return drive(tl, o.at, o.duration || 0.7, function (p) {
      els.forEach(function (e, i) {
        var q = ez(local(p, i, els.length, st)), c = (1 - q) * 100, cl;
        if (dir === "up") cl = "inset(" + c + "% 0 0 0)"; else if (dir === "down") cl = "inset(0 0 " + c + "% 0)";
        else if (dir === "left") cl = "inset(0 0 0 " + c + "%)"; else cl = "inset(0 " + c + "% 0 0)";
        e.style.clipPath = cl; e.style.webkitClipPath = cl;
      });
    });
  }

  // controlled reorder: fragment i starts in the slot of fragment order[i] and travels home. order is a permutation of 0..n-1 (validated);
  // the final state is the intended phrase exactly (translate 0). Slots are the natural boxes measured now.
  function reorder(tl, target, o) {
    o = o || {};
    var els = frags(target), n = els.length, order = o.order || [];
    need(order.length === n, "order must list one slot per fragment (" + n + ")");
    var seen = {};
    order.forEach(function (s) { need(s >= 0 && s < n && s === (s | 0) && !seen[s], "order must be a permutation of 0.." + (n - 1)); seen[s] = 1; });
    var ez = easeOf(o.ease || "power2.inOut"), st = o.stagger || 0;
    var box = els.map(function (e) { return { x: e.offsetLeft, y: e.offsetTop }; });
    var d = els.map(function (e, i) { return { x: box[order[i]].x - box[i].x, y: box[order[i]].y - box[i].y }; });
    els.forEach(function (e) { e.style.display = e.style.display || "inline-block"; });
    return drive(tl, o.at, o.duration || 1, function (p) {
      els.forEach(function (e, i) {
        var q = ez(local(p, i, n, st)), k = 1 - q;
        e.style.transform = q >= 1 ? "" : "translate(" + d[i].x * k + "px," + d[i].y * k + "px)";
      });
    });
  }

  // ADDITIVE (sequence addendum): protected read. reads = [{ start, end }] in score seconds, `t0` = score time at timeline time `at` (default 0).
  // inRead is pure. holdRead is a proxy tween over [at, at + duration] whose setter, while the score time is inside a read, clears the distortions
  // this file and RasanShape.split put on the fragments (transform, clip-path, opacity, text fill/stroke) so the whole phrase stands legible.
  // Place it AFTER the effect tweens of the same target in the timeline (the later setter wins at equal time). Outside a read it does nothing.
  function inRead(t, reads) {
    for (var i = 0; i < (reads || []).length; i++) if (t >= reads[i].start && t <= reads[i].end) return i;
    return -1;
  }
  function holdRead(tl, target, o) {
    o = o || {};
    need(isFinite(o.duration) && o.duration > 0, "holdRead needs a duration");
    var els = frags(target), t0 = o.t0 || 0, reads = o.reads || [];
    return drive(tl, o.at, o.duration, function (p) {
      if (inRead(t0 + p * o.duration, reads) < 0) return;
      els.forEach(function (e) { e.style.transform = ""; e.style.clipPath = ""; e.style.webkitClipPath = ""; e.style.opacity = ""; e.style.webkitTextFillColor = ""; e.style.webkitTextStroke = ""; });
    });
  }

  return { version: VERSION, scriptInfo: scriptInfo, outlineFill: outlineFill, maskReveal: maskReveal, reorder: reorder, inRead: inRead, holdRead: holdRead };
});
