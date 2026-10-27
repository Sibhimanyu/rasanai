/* RasanLayout: shared anchors and regions for paused GSAP timelines (W14). One set of moving anchors (rules, edges, focal points)
 * and the regions that hang off them (cells, image windows, type boxes, crops). Every dependent element reads the SAME anchor
 * value at the SAME time, so a grid line, the media window beside it and the label inside it can never disagree about an edge.
 *
 *   <script src="assets/rasan-layout/rasan-layout.js"></script>    (after GSAP; works without GSAP for the pure functions)
 *   RasanLayout.bind(tl, plan, { elements: { "cell-a": "#a", "rule-1": el }, frame: { w: 1920, h: 1080 } | frameEl, at: 0, duration: 4 })
 *   RasanLayout.rectAt(plan, "cell-a", t) -> { x, y, w, h, right, bottom }      fractions of the frame, t in score seconds
 *   RasanLayout.anchorAt(plan, "rule-1", t) -> { x, y }
 *
 * plan = the `runtime` projection that scripts/lib/composition-anchors.mjs planAnchors() returns:
 *   { frame: { w, h }, anchors: { id: { keyframes: [{ t, x?, y?, ease? }] | at: { x, y } | follow: { anchor, dx, dy } } },
 *     regions: { id: { layer, edges: { left, right, top, bottom } } } }   an edge is a number (fraction), an anchor id, or { anchor, d }
 * A keyframe's ease shapes the segment that ENDS at that keyframe. A missing x or y on a keyframe carries the previous value.
 *
 * Like RasanShape: one proxy tween whose setter applies a PURE function of the timeline time (no Math.random, no wall clock, no
 * rAF), so seeking anywhere in any order gives the same pixels. There is NO second clock: t is the timeline time the tween is placed at.
 * This file is also loadable from Node (module.exports) so lib/composition-anchors.mjs evaluates with the very same code.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RasanLayout = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";
  var VERSION = "1.0.0";

  function need(cond, msg) { if (!cond) throw new Error("RasanLayout: " + msg); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // the eases a plan may name (the common GSAP names, as pure functions); an unknown name is reported by `knownEase`, evaluated linear
  var EASES = {
    none: function (p) { return p; }, linear: function (p) { return p; },
    hold: function (p) { return p >= 1 ? 1 : 0; },
    "power2.in": function (p) { return p * p; }, "power2.out": function (p) { return 1 - (1 - p) * (1 - p); },
    "power2.inOut": function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },
    "power3.in": function (p) { return p * p * p; }, "power3.out": function (p) { return 1 - Math.pow(1 - p, 3); },
    "power3.inOut": function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    "expo.out": function (p) { return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); },
    "expo.inOut": function (p) { return p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2; },
  };
  function knownEase(name) { return name === undefined || name === null || Object.prototype.hasOwnProperty.call(EASES, name); }

  // an anchor at time t -> { x, y }. Keyframes interpolate per axis; before the first / after the last they hold. `follow` offsets another anchor.
  function anchorAt(plan, id, t, stack) {
    stack = stack || [];
    need(plan && plan.anchors && plan.anchors[id], 'unknown anchor "' + id + '"');
    need(stack.indexOf(id) < 0, "anchor cycle: " + stack.concat(id).join(" -> "));
    var a = plan.anchors[id];
    if (a.follow) {
      var b = anchorAt(plan, a.follow.anchor, t, stack.concat(id));
      return { x: b.x + (a.follow.dx || 0), y: b.y + (a.follow.dy || 0) };
    }
    if (!a.keyframes || !a.keyframes.length) return { x: a.at ? a.at.x : undefined, y: a.at ? a.at.y : undefined };
    var ks = a.keyframes, out = {};
    ["x", "y"].forEach(function (axis) {
      var prev = null, next = null, i;
      for (i = 0; i < ks.length; i++) {
        if (!isNum(ks[i][axis])) continue;
        if (ks[i].t <= t) prev = ks[i]; else { next = ks[i]; break; }
      }
      if (!prev && !next) { out[axis] = a.at ? a.at[axis] : undefined; return; }
      if (!prev) { out[axis] = next[axis]; return; }
      if (!next) { out[axis] = prev[axis]; return; }
      var span = next.t - prev.t, p = span > 0 ? clamp((t - prev.t) / span, 0, 1) : 1;
      var ez = EASES[next.ease] || EASES.linear;
      out[axis] = prev[axis] + (next[axis] - prev[axis]) * ez(p);
    });
    return out;
  }

  function edge(plan, e, axis, t) {
    if (isNum(e)) return e;
    if (typeof e === "string") return anchorAt(plan, e, t)[axis];
    if (e && typeof e === "object" && typeof e.anchor === "string") return anchorAt(plan, e.anchor, t)[axis] + (e.d || 0);
    return undefined;
  }
  // a region at time t -> { x, y, w, h, right, bottom } (fractions of the frame); a coordinate that cannot be resolved stays undefined
  function rectAt(plan, id, t) {
    need(plan && plan.regions && plan.regions[id], 'unknown region "' + id + '"');
    var E = plan.regions[id].edges || {};
    var l = edge(plan, E.left, "x", t), r = edge(plan, E.right, "x", t), tp = edge(plan, E.top, "y", t), bt = edge(plan, E.bottom, "y", t);
    var ok = isNum(l) && isNum(r) && isNum(tp) && isNum(bt);
    return { x: l, y: tp, w: ok ? r - l : undefined, h: ok ? bt - tp : undefined, right: r, bottom: bt };
  }

  // ADDITIVE (sequence addendum): carried elements. Both are pure functions of score time t and of the same anchors/regions, so a handoff
  // references the one coordinate system (frame fractions) and nothing new is bound.
  // anchoredRect: a box placed relative to an anchor, { w, h } fractions, pivot {x,y} in 0..1 of the box (default centre), offset { dx, dy }.
  function anchoredRect(plan, anchorId, t, o) {
    o = o || {};
    need(isNum(o.w) && isNum(o.h), "anchoredRect needs w and h (fractions of the frame)");
    var a = anchorAt(plan, anchorId, t), pv = o.pivot || { x: 0.5, y: 0.5 };
    var x = a.x + (o.dx || 0) - o.w * (isNum(pv.x) ? pv.x : 0.5), y = a.y + (o.dy || 0) - o.h * (isNum(pv.y) ? pv.y : 0.5);
    return { x: x, y: y, w: o.w, h: o.h, right: x + o.w, bottom: y + o.h };
  }
  // carriedRectAt: rect of an element that leaves region `fromId` as it stands at fromAt and arrives in region `toId` as it stands at toAt.
  // Before fromAt it sits on the outgoing region at t, after toAt on the incoming one (each still moves with its own anchors). ease from EASES.
  function carriedRectAt(plan, fromId, toId, fromAt, toAt, t, ease) {
    need(isNum(fromAt) && isNum(toAt) && toAt >= fromAt, "carriedRectAt needs fromAt <= toAt (score seconds)");
    if (t <= fromAt) return rectAt(plan, fromId, t);
    if (t >= toAt) return rectAt(plan, toId, t);
    var a = rectAt(plan, fromId, fromAt), b = rectAt(plan, toId, toAt), ez = EASES[ease] || EASES.linear, p = ez((t - fromAt) / (toAt - fromAt)), out = {};
    ["x", "y", "w", "h"].forEach(function (k) { out[k] = a[k] + (b[k] - a[k]) * p; });
    out.right = out.x + out.w; out.bottom = out.y + out.h;
    return out;
  }

  function px(frame, plan) {
    if (frame && frame.nodeType === 1) return { w: frame.clientWidth, h: frame.clientHeight };
    if (frame && isNum(frame.w) && isNum(frame.h)) return frame;
    need(plan && plan.frame, "bind needs a frame size ({ w, h } or the frame element)");
    return plan.frame;
  }
  function elOf(x) {
    if (typeof x === "string") { var e = document.querySelector(x); need(e, 'no element for "' + x + '"'); return e; }
    need(x && x.nodeType === 1, "expected an element or a selector");
    return x;
  }

  // Place every mapped element from the plan at timeline time `at + p * duration`. opts: { elements: {regionId: el|selector},
  // frame, at (timeline seconds where score time `t0` starts, default 0), t0 (score time at `at`, default 0), duration, onUpdate(t, rects) }.
  // Elements are positioned absolutely in px inside the frame; a rule is a region with zero width or height.
  function bind(tl, plan, o) {
    o = o || {};
    need(tl && typeof tl.fromTo === "function", "the first argument must be a GSAP timeline");
    need(isNum(o.duration) && o.duration > 0, "bind needs a duration in seconds");
    var at = o.at || 0, t0 = o.t0 || 0, els = {}, ids = Object.keys(o.elements || {});
    ids.forEach(function (id) { els[id] = elOf(o.elements[id]); });
    var dur = o.duration;
    function apply(p) {
      var t = t0 + p * dur, f = px(o.frame, plan), rects = {};
      ids.forEach(function (id) {
        var r = rectAt(plan, id, t); rects[id] = r;
        if (!isNum(r.w) || !isNum(r.h)) return;
        var s = els[id].style, z = plan.regions[id].layer;
        s.position = "absolute"; s.left = r.x * f.w + "px"; s.top = r.y * f.h + "px";
        s.width = r.w * f.w + "px"; s.height = r.h * f.h + "px";
        if (isNum(z)) s.zIndex = String(z);
      });
      if (typeof o.onUpdate === "function") o.onUpdate(t, rects);
    }
    var v = 0, proxy = {};
    Object.defineProperty(proxy, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; apply(x); } });
    apply(0);
    tl.fromTo(proxy, { p: 0 }, { p: 1, duration: dur, ease: "none", immediateRender: false }, at);
    return proxy;
  }

  return { version: VERSION, EASES: EASES, knownEase: knownEase, anchorAt: anchorAt, rectAt: rectAt, anchoredRect: anchoredRect, carriedRectAt: carriedRectAt, bind: bind };
});
