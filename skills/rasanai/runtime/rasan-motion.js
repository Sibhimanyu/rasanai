/* RasanMotion: a motion vocabulary for paused GSAP timelines that makes the mechanical pattern hard to write.
 *
 * R5 measured what makes AI motion read as AI: every move on one curve, durations on a grid, one thing moving at a
 * time, nothing ever settling, ruler-straight paths, constant staggers. The verbs below take WHAT moves and WHERE;
 * they never take an ease or a duration. The curve comes from the move's role, the duration from its travel and
 * size (jittered +-8%, seeded), travels bend on arcs, landings settle on a budget, cascades are irregular, every verb
 * returns `next` (55-75% into it) so the next gesture overlaps, and fast moves soften with speed.
 *
 * Seek-safe and deterministic: every frame is a pure function of the timeline's time (real GSAP tweens with
 * modifiers, and proxies whose setters apply f(progress)); jitter comes from a seeded PRNG, never Math.random.
 *
 *   <script src="../../assets/rasan-motion/rasan-motion.js"></script>   (after GSAP; relative to the composition)
 *   var M = RasanMotion.kit(tl, { seed: "film/04" });                    (W, H from the composition root)
 *   var a = M.enter("#title", { how: "mask", at: 0.2 });
 *   var b = M.travel("#card", { dx: -420, dy: 60, at: a.next, trail: ["#card .label"] });
 *   M.land("#badge", { dy: -180, at: b.next });
 *   M.cascade("#list .row", { at: b.next, how: "scale" });
 *   M.camera("#world", { at: 0, dur: 4.2 });
 *   M.audit()   -> { gestures, dominant_share, families, settle_share, ... }  (obey.mjs measures the same on the build)
 *
 * 1.1.0 additions (all pure functions of time, no rAF): M.snap (one-frame snap: the first frame after the start is
 * already `firstFrameShare` of the way, then a decelerating tail), M.dive (constant-octave zoom: the scale multiplies by
 * the same factor every frame, no ease), M.scaleDive (a many-level dive: log zoom, an anchor pinned to a screen point,
 * detail that fades by its on-screen size), M.smear (a directional blur on one element, peak on the first or last frame),
 * M.mix / RasanMotion.mix(a, b, k) (a colour in between in OKLab, never mud) and M.colour (a colour tween with it).
 * AO additions (idea from awesome-opus5-5-videos; our code), all pure functions of time:
 *   RasanMotion.springTrack(keys, { z, w })  keys [{t, v}]: a value that chases each new key with a closed-form damped
 *     spring. Each key adds (v_i - v_{i-1}) * step(t - t_i), so responses ADD: retargeting mid-flight keeps the velocity,
 *     and there is no state to seek. f(t) -> value, f.velocity(t) -> units/s (for matching a loop seam). Defaults z 1, w 20.
 *   RasanMotion.edges(keys, { lead, trail })  keys [{t, x, w}]: an indicator (tab pill, toggle, segmented control) as two
 *     edges on two springs. The edge on the side of travel uses the stiffer `lead` (default z 1, w 28), the other the softer
 *     `trail` (z 1, w 16), so the pill stretches ahead and catches up. -> { left(t), right(t), center(t), width(t) }.
 *   RasanMotion.continueFrom({ t0, x0, v0, to, z, w })  a value that continues from the outgoing state {x0, v0} at t0 toward `to` on a closed-form
 *     spring (pure f(t), seek-safe, f.velocity(t)); RasanMotion.stateAt(fn, t) -> {x, v}. For declared continuous seams (references/motion-handoffs.md).
 *   RasanMotion.frameTime(t, fps)  the time of the frame itself, floor(t * fps + 1e-6) / fps. Counters, clocks and typed
 *     digits must read THIS, not t: finish.mjs blends sub-frames for motion blur, and a counter read at a sub-time smears
 *     into a double image. When the page sets window.__rasanFrameTime (seconds, finish.mjs does this per sub-frame) that wins.
 * ONE blur grammar per film: smear, crisp steps or shutter. M.smear takes an element's filter from the speed softening;
 * audit().blur_grammar says "smear", "soft" or "mixed" (mixed is the thing to fix).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.RasanMotion = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var VERSION = "1.1.0";

  function need(c, m) { if (!c) throw new Error("RasanMotion: " + m); }
  function gs() { need(root.gsap, "GSAP must load before rasan-motion.js"); return root.gsap; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function one(x) {
    if (typeof x === "string") { var e = document.querySelector(x); need(e, 'no element for "' + x + '"'); return e; }
    need(x && x.nodeType === 1, "expected an element or a selector");
    return x;
  }
  function many(x) {
    if (typeof x === "string") return Array.prototype.slice.call(document.querySelectorAll(x));
    if (x && x.nodeType === 1) return [x];
    return Array.prototype.slice.call(x || []);
  }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var a = hashStr(seed);
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ------------------------------------------------------------------ curves
  function bez(x1, y1, x2, y2) {
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 28; i++) { t = (lo + hi) / 2; var bx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t; if (bx < x) lo = t; else hi = t; }
      return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
    };
  }
  // a damped spring that lands exactly on 1 at the end of the tween (z: damping ratio, w: angular frequency per tween)
  function spring(z, w) {
    z = Math.min(0.99, z); var wd = w * Math.sqrt(1 - z * z), k = z / Math.sqrt(1 - z * z);
    function raw(q) { return 1 - Math.exp(-z * w * q) * (Math.cos(wd * q) + k * Math.sin(wd * q)); }
    var end = raw(1);
    return function (x) { if (x <= 0) return 0; if (x >= 1) return 1; return raw(x) + (1 - end) * x; };
  }
  var CURVES = {
    launch: "cubic-bezier(0.05,0.7,0.1,1)",
    glide: "cubic-bezier(0.2,0,0,1)",
    expressive: "cubic-bezier(0.4,0.14,0.3,1)",
    exit: "cubic-bezier(0.3,0,0.8,0.15)",
    settle: "spring(0.68,12)",
    snap: "expo.out",
    drift: "sine.inOut",
  };
  // ------------------------------------------------------------------ measured eases
  // Twelve closed-form curves fitted to real finished motion (f(0)=0, f(1)=1, pure functions of t, so seek-safe).
  // Adapted from motionmaxxing (Apache-2.0, Tejas Makwana), runtime/motion.js. Modified.
  function powerOut(p) { return function (t) { return 1 - Math.pow(1 - t, p); }; }
  function powerIn(p) { return function (t) { return Math.pow(t, p); }; }
  function expoOut(k) { var d = 1 - Math.exp(-k); return function (t) { return (1 - Math.exp(-k * t)) / d; }; }
  function snapRamp(w, tau) { var n = w * (1 - Math.exp(-1 / tau)) + (1 - w); return function (t) { return (w * (1 - Math.exp(-t / tau)) + (1 - w) * t) / n; }; }
  function snapOver(A, ta, td) { var f = function (t) { return (1 + A * Math.exp(-t / td)) * (1 - Math.exp(-t / ta)); }, n = f(1); return function (t) { return f(t) / n; }; }
  function dampedOsc(c, om) { var f = function (t) { return 1 - Math.exp(-c * t) * (Math.cos(om * t) + (c / om) * Math.sin(om * t)); }, n = f(1); return function (t) { return f(t) / n; }; }
  function smoothP(p) { return function (t) { var a = Math.pow(t, p), b = Math.pow(1 - t, p); return a / (a + b); }; }
  function guard(f) { return function (t) { return t <= 0 ? 0 : t >= 1 ? 1 : f(t); }; }
  var MEASURED = {
    cruise: guard(function (t) { return t; }),   // linear: fades, drifts, counters
    glide: guard(powerOut(1.7)),                 // gentle ease-out for medium moves
    softInOut: guard(smoothP(1.42)),             // symmetric S for opacity, blur, ground ramps
    softLand: guard(expoOut(3.41)),              // firm decelerate: the workhorse for text and panels
    gentleIn: guard(powerIn(2.07)),              // mild acceleration: exits, fade-out starts
    snapSettle: guard(snapRamp(0.942, 0.118)),   // hero entry: over half the travel in the first tenth
    whip: guard(powerOut(2.52)),                 // hard decelerating big move
    accelExit: guard(powerIn(2.6)),              // the leaving curve
    crashOut: guard(powerIn(3.97)),              // hard acceleration into a cut
    popOver: guard(dampedOsc(2.67, 4.36)),       // slow late overshoot (peak ~1.08 at t~.72)
    crashIn: guard(snapOver(2.0, 0.19, 0.218)),  // hits and passes its mark at once (peak ~1.18 at t~.27)
    bounceHard: guard(dampedOsc(1.34, 5.07)),    // big overshoot (~1.48): use sparingly
  };
  // typical frames at 30 fps for each measured ease (a starting duration, not a rule)
  var MEASURED_FRAMES = { cruise: 9, glide: 10, softInOut: 9, softLand: 12, gentleIn: 9, snapSettle: 11, whip: 7, accelExit: 13, crashOut: 17, popOver: 15, crashIn: 10, bounceHard: 22 };
  // "glide" is also a role curve (kept as it was), so the measured glide answers to "measured.glide" / "measuredGlide"
  function measuredName(s) {
    var m = /^measured[.:]?(\w+)$/i.exec(s), n = m && m[1];
    if (n) for (var k in MEASURED) if (k.toLowerCase() === n.toLowerCase()) return k;
    return CURVES[s] ? null : MEASURED.hasOwnProperty(s) ? s : null;
  }

  // a curve name -> an ease function tagged with its name (role curve, measured ease, cubic-bezier(), spring(), steps(n), any GSAP ease)
  function ease(name) {
    var s = String(name || "glide").trim(), m, f;
    if (CURVES[s] && CURVES[s] !== s) return tag(ease(CURVES[s]), s);
    var mn = measuredName(s);
    if (mn) return tag(MEASURED[mn], s);
    if ((m = s.match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/))) f = bez(+m[1], +m[2], +m[3], +m[4]);
    else if ((m = s.match(/^spring\(\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/))) f = spring(+m[1], +(m[2] || 12));
    else if (/^(none|linear)$/.test(s)) f = function (x) { return x; };
    else { need(root.gsap, "GSAP is needed to read the ease " + s); f = root.gsap.parseEase(s); need(f, "unknown ease " + s); }
    return tag(f, s);
  }
  function tag(f, name) { var g = function (x) { return f(x); }; g.rasanCurve = name; return g; }


  // ------------------------------------------------------------------ colour in OKLab
  // A tween between two colours in sRGB goes through mud (red to green passes brown); in OKLab it passes through yellow.
  // Pure functions: mix(a, b, k) -> "#rrggbb" for k in 0..1 (k is clamped). Accepts #rgb, #rrggbb, rgb(r,g,b), rgba().
  // The matrices are Bjorn Ottosson's published OKLab (public domain).
  function parseColour(c) {
    var s = String(c).trim(), m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(s))) return [+m[1], +m[2], +m[3]];
    throw new Error("RasanMotion.mix: cannot read the colour " + s + " (use #hex or rgb())");
  }
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function unlin(v) { v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return clamp(Math.round(v * 255), 0, 255); }
  function toOklab(c) {
    var r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function fromOklab(L) {
    var l = Math.pow(L[0] + 0.3963377774 * L[1] + 0.2158037573 * L[2], 3), m = Math.pow(L[0] - 0.1055613458 * L[1] - 0.0638541728 * L[2], 3), s = Math.pow(L[0] - 0.0894841775 * L[1] - 1.2914855480 * L[2], 3);
    return [unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), unlin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  function hex2(v) { return (v < 16 ? "0" : "") + v.toString(16); }
  function mix(a, b, k) {
    k = clamp(+k, 0, 1);
    var A = toOklab(parseColour(a)), B = toOklab(parseColour(b));
    var o = fromOklab([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
    return "#" + hex2(o[0]) + hex2(o[1]) + hex2(o[2]);
  }

  // ------------------------------------------------------------------ the contract (motion.md, installed with the runtime)
  var CONTRACT = null;
  function contract(c) { if (c) CONTRACT = c; return CONTRACT; }

  // ------------------------------------------------------------------ the kit
  function kit(tl, o) {
    o = o || {};
    need(tl && typeof tl.add === "function", "the first argument must be a GSAP timeline");
    var G = gs();
    var C = o.contract || CONTRACT || {};
    var rootEl = o.root ? one(o.root) : document.querySelector("[data-composition-id][data-width]") || document.body;
    var W = +o.W || +(rootEl.getAttribute && rootEl.getAttribute("data-width")) || 1920;
    var H = +o.H || +(rootEl.getAttribute && rootEl.getAttribute("data-height")) || 1080;
    var fps = +o.fps || 30, F = 1 / fps, diag = Math.hypot(W, H);
    var R = rng(o.seed || "rasan-motion");
    var jit = function (v, p) { return v * (1 + (R() * 2 - 1) * p); };
    var curves = {}, k;
    for (k in CURVES) curves[k] = CURVES[k];
    for (k in (C.curves || {})) curves[k] = C.curves[k];
    var D = C.durations || {};
    var pace = +o.pace || 1;
    var dur = {
      base: (D.base_ms || 280) / 1000, travel: (D.travel_ms || 550) / 1000, area: (D.area_ms || 150) / 1000,
      min: (D.min_ms || 350) / 1000, max: (D.max_ms || 1400) / 1000, jitter: D.jitter != null ? D.jitter : 0.08, exitK: D.exit_k || 0.65,
    };
    var budget = C.overshoot || { share: 0.15, max_pct: 8 };
    var bowPct = (C.arcs && C.arcs.bow_pct) || [4, 12], arcMin = ((C.arcs && C.arcs.min_travel_pct) || 3) / 100;
    var overlap = (C.overlap && C.overlap.next_at) || [0.55, 0.75];
    var trailF = (C.overlap && C.overlap.trail_frames) || [2, 4];
    var staggerMax = ((C.stagger && C.stagger.amount_max_ms) || 500) / 1000;
    var blurOn = o.blur !== false;
    var banned = C.banned || [];
    var log = { gestures: 0, byCurve: {}, byRole: {}, settles: 0, durations: [] };

    // where each element will be once its planned moves are done: the next verb starts from there, never from
    // the build-time value (which a later tween has not reached yet)
    var planned = new WeakMap();
    function state(el) {
      var s0 = planned.get(el);
      if (!s0) { s0 = { x: +G.getProperty(el, "x") || 0, y: +G.getProperty(el, "y") || 0, scale: +G.getProperty(el, "scale") || 1, rotation: +G.getProperty(el, "rotation") || 0, fresh: true }; planned.set(el, s0); }
      return s0;
    }
    // the first planned move of an element renders its from-state at once (it equals the element's current state), so
    // frame 0 looks the same before and after any seek; later moves wait for their turn
    function first(st) { var f0 = !!st.fresh; st.fresh = false; return f0;
    }
    function frameRound(t) { return Math.round(t * 1000) / 1000; }
    var ROLE_K = { launch: 1.25, glide: 1, expressive: 1.15, settle: 1.2, snap: 0.8, move: 1, drift: 1 };
    function durFor(travel, area, role) {
      if (role === "exit") return frameRound(jit(clamp(dur.base + dur.travel * Math.sqrt(Math.abs(travel) / diag), dur.min, dur.max) * pace * dur.exitK, dur.jitter));
      var a = area == null ? 0 : Math.round(Math.sqrt(area / (W * H)) * 10) / 10; // coarse: font loading must not change timing
      var d = clamp(dur.base + dur.travel * Math.sqrt(Math.abs(travel) / diag) + dur.area * a, dur.min, dur.max) * pace;
      d *= ROLE_K[role] || 1; // a hero launch glides longer than a reposition, a snap is quicker: roles spread the durations
      return frameRound(jit(d, dur.jitter));
    }
    function areaOf(el, o2) {
      if (o2 && o2.area != null) return +o2.area;
      if (o2 && o2.size) return { s: 0.01, m: 0.06, l: 0.25, xl: 0.6 }[o2.size] * W * H;
      var r = el.getBoundingClientRect(); return r.width * r.height;
    }
    // the curve for a role, rationed: no exact curve over 40% of gestures, snap under 25%, settles within the budget
    var FALLBACK = { glide: ["expressive", "launch"], launch: ["glide", "snap"], expressive: ["glide", "launch"], snap: ["launch", "glide"], settle: ["glide", "launch"], exit: ["exit"], drift: ["drift"], move: ["glide", "expressive"] };
    function pick(role) {
      var n = log.gestures + 1, chosen = role;
      var over = function (r) { var c = curves[r]; return n >= 8 && ((log.byCurve[c] || 0) + 1) / n > 0.4; };
      if (role === "settle" && (budget.share <= 0 || (log.settles + 1) / n > budget.share)) chosen = "glide";
      if (chosen === "snap" && n >= 4 && ((log.byRole.snap || 0) + 1) / n > 0.25) chosen = "launch";
      var tries = [chosen].concat(FALLBACK[chosen] || []);
      for (var i = 0; i < tries.length; i++) if (curves[tries[i]] && !over(tries[i])) { chosen = tries[i]; break; }
      if (curves[chosen] === "none" && role === "settle") chosen = "glide";
      log.gestures++; log.byRole[chosen] = (log.byRole[chosen] || 0) + 1;
      log.byCurve[curves[chosen]] = (log.byCurve[curves[chosen]] || 0) + 1;
      if (chosen === "settle") log.settles++;
      return { role: chosen, fn: ease(curves[chosen]) };
    }
    function handle(start, d, extra) {
      var h = { start: frameRound(start), dur: d, end: frameRound(start + d), next: frameRound(start + d * (overlap[0] + R() * (overlap[1] - overlap[0]))) };
      for (var q in (extra || {})) h[q] = extra[q];
      log.durations.push(d);
      return h;
    }
    function at(v) { return typeof v === "number" ? v : v && typeof v.next === "number" ? v.next : tl.duration(); }
    // f(progress) on a proxy: runs on every render, seeks included
    function drive(start, d, apply) {
      var v = 0, p = {};
      Object.defineProperty(p, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; apply(x); } });
      tl.add(G.fromTo(p, { p: 0 }, { p: 1, duration: Math.max(0.0001, d), ease: "none", immediateRender: false }), start);
    }
    // speed-softening: blur grows with on-screen speed above ~40% of the frame width per second (Kinso / Sovra)
    // each travel adds its own contribution and the element shows the largest, so the result does not depend on the
    // order GSAP renders overlapping tweens in (it renders backwards when you seek back)
    var blurs = new WeakMap(), blurId = 0, smeared = new WeakSet(), smearLog = 0, softLog = 0;
    function softenWith(el, fn, start, d, dist) {
      if (!blurOn || dist < W * 0.08) return;
      softLog++;
      var h = 1 / (fps * d), id = ++blurId;
      if (!blurs.has(el)) blurs.set(el, {});
      var mine = blurs.get(el);
      drive(start, d, function (p) {
        var s = 0;
        if (smeared.has(el)) return; // one blur grammar per film: a smeared element is not also softened
        if (p > 0 && p < 1) {
          var v = Math.abs(fn(p) - fn(Math.max(0, p - h))) * dist * fps; // px per second, from the curve itself
          s = v / W > 0.4 ? Math.min(6, (v / fps) * 0.12) : 0;
        }
        mine[id] = s;
        var top = 0; for (var q in mine) if (mine[q] > top) top = mine[q];
        el.style.filter = top > 0.3 ? "blur(" + top.toFixed(2) + "px)" : "";
      });
    }
    function centreOf(el) { var r = el.getBoundingClientRect(), b = rootEl.getBoundingClientRect(); return [r.left + r.width / 2 - b.left - W / 2, r.top + r.height / 2 - b.top - H / 2]; }

    // travel: move an element by (dx, dy) [and to scale / rotation] on an arc, with a curve picked by distance
    // (short: snap, medium: glide, long: expressive, unless role says otherwise); children in `trail` drag behind it
    function travel(sel, p) {
      p = p || {};
      var el = one(sel), dx = +p.dx || 0, dy = +p.dy || 0, dist = Math.hypot(dx, dy);
      var role = p.role || (dist > W * 0.35 ? "expressive" : dist < W * 0.04 && !p.scale ? "snap" : "glide");
      var c = pick(role), start = at(p.at);
      var d = durFor(dist + (p.scale ? Math.abs(p.scale - 1) * Math.sqrt(areaOf(el, p)) : 0), areaOf(el, p), c.role);
      var st = state(el), x0 = st.x, y0 = st.y;
      var bow = p.bow === 0 || dist < W * arcMin ? 0 : (typeof p.bow === "number" ? p.bow : (bowPct[0] + R() * (bowPct[1] - bowPct[0])) / 100) * dist;
      var nx = -dy / (dist || 1), ny = dx / (dist || 1), cc = centreOf(el);
      var side = p.side || ((nx * cc[0] + ny * cc[1]) >= 0 ? 1 : -1);
      var tw;
      var arcAt = function () { var r = tw ? tw.ratio : 0; return 4 * r * (1 - r) * bow * side; };
      var to = { x: x0 + dx, y: y0 + dy, duration: d, ease: c.fn, immediateRender: first(st) };
      if (bow) to.modifiers = { x: function (x) { return (parseFloat(x) + nx * arcAt()).toFixed(3) + "px"; }, y: function (y) { return (parseFloat(y) + ny * arcAt()).toFixed(3) + "px"; } }; // transform values carry their unit
      var from = { x: x0, y: y0 };
      if (p.scale != null) { from.scale = st.scale; to.scale = p.scale; st.scale = p.scale; }
      if (p.rotate != null) { from.rotation = st.rotation; to.rotation = st.rotation + p.rotate; st.rotation = to.rotation; }
      st.x = x0 + dx; st.y = y0 + dy;
      tw = G.fromTo(el, from, to);
      tl.add(tw, start);
      if (p.blur !== false) softenWith(el, c.fn, start, d, dist);
      var h = handle(start, d, { dx: dx, dy: dy, role: c.role });
      (p.trail ? many(p.trail) : []).forEach(function (ch, i) { follow(ch, h, { drag: true, k: i }); });
      return h;
    }
    // land: a travel that ends on a settle (a spring, within the overshoot budget; a glide once the budget is spent)
    function land(sel, p) { p = p || {}; var q = {}; for (var x in p) q[x] = p[x]; q.role = "settle"; return travel(sel, q); }

    // follow: secondary motion. drag: a child inside the mover lags 2-4 frames and catches up with a little more
    // amplitude; otherwise the element repeats the leader's travel 2-4 frames behind it
    function follow(sel, h, p) {
      p = p || {};
      var el = one(sel), lag = (trailF[0] + Math.round(R() * (trailF[1] - trailF[0])) + (p.k || 0)) * F;
      if (p.drag) {
        var kk = 0.035 + R() * 0.03;
        tl.add(G.to(el, { keyframes: { x: [0, -kk * h.dx, kk * 0.3 * h.dx, 0], y: [0, -kk * h.dy, kk * 0.3 * h.dy, 0] }, duration: frameRound(h.dur * (0.95 + R() * 0.15)), ease: "power1.inOut", immediateRender: first(state(el)) }), frameRound(h.start + lag));
        log.gestures++; log.byCurve["power1.inOut"] = (log.byCurve["power1.inOut"] || 0) + 1;
        return handle(h.start + lag, h.dur);
      }
      return travel(el, { dx: h.dx * (p.amp || 1), dy: h.dy * (p.amp || 1), at: frameRound(h.start + lag), role: p.role || "glide", bow: p.bow });
    }

    // enter: something becomes visible. how: mask (a line rising from behind its own mask), wipe (clip-path from a side),
    // scale (0.9 -> 1 with opacity, from its transform origin), focus (blur 10 -> 0 with opacity), fly (travels in from
    // off its spot without a fade). Distance-derived duration and a launch curve; never the fade-up-slide.
    function enter(sel, p) {
      p = p || {};
      var el = one(sel), how = p.how || "mask", start = at(p.at), from = p.from || "bottom";
      if (how === "focus" && banned.indexOf("blur-in") >= 0) how = "scale"; // the language bans blur-in (a budgeted hero blur-in is written by hand, with its score.budget entry)
      var c = pick(p.role || (how === "fly" ? "glide" : "launch"));
      var r = el.getBoundingClientRect(), d, tw;
      if (how === "mask") {
        var par = el.parentElement;
        if (!par || getComputedStyle(par).overflow !== "hidden") {
          var m = document.createElement("span");
          m.style.cssText = "display:" + (getComputedStyle(el).display === "inline" ? "inline-block" : getComputedStyle(el).display) + ";overflow:hidden;vertical-align:top";
          el.parentNode.insertBefore(m, el); m.appendChild(el);
          if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
        }
        d = frameRound((p.k || 1) * durFor(r.height * 1.1, areaOf(el, p), c.role));
        tw = G.fromTo(el, { yPercent: from === "top" ? -110 : 110 }, { yPercent: 0, duration: d, ease: c.fn });
      } else if (how === "wipe") {
        var ins = { left: "inset(0% 100% 0% 0%)", right: "inset(0% 0% 0% 100%)", top: "inset(0% 0% 100% 0%)", bottom: "inset(100% 0% 0% 0%)" }[from === "bottom" ? "top" : from] || "inset(0% 100% 0% 0%)";
        d = frameRound((p.k || 1) * durFor(from === "left" || from === "right" ? r.width : r.height, areaOf(el, p), c.role));
        tw = G.fromTo(el, { clipPath: ins }, { clipPath: "inset(0% 0% 0% 0%)", duration: d, ease: c.fn });
      } else if (how === "scale") {
        d = frameRound((p.k || 1) * durFor(Math.sqrt(r.width * r.height) * 0.4, areaOf(el, p), c.role));
        tw = G.fromTo(el, { autoAlpha: 0, scale: p.scaleFrom || 0.9 }, { autoAlpha: 1, scale: 1, duration: d, ease: c.fn });
      } else if (how === "focus") {
        d = frameRound((p.k || 1) * durFor(r.height * 0.6, areaOf(el, p), c.role));
        tw = G.fromTo(el, { autoAlpha: 0, filter: "blur(10px)", scale: 1.04 }, { autoAlpha: 1, filter: "blur(0px)", scale: 1, duration: d, ease: c.fn });
      } else if (how === "fly") {
        var dist = +p.dist || W * 0.25, dx = from === "left" ? -dist : from === "right" ? dist : 0, dy = from === "top" ? -dist : from === "bottom" ? dist : 0;
        d = frameRound((p.k || 1) * durFor(dist, areaOf(el, p), c.role));
        tw = G.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: d, ease: c.fn });
        tl.add(tw, start);
        softenWith(el, c.fn, start, d, dist);
        return handle(start, d, { dx: -dx, dy: -dy, role: c.role });
      } else need(false, "enter: unknown how " + how);
      tl.add(tw, start);
      return handle(start, d, { role: c.role });
    }
    // exit: the matching leave, about 0.65x an entrance, on the exit curve
    function exit(sel, p) {
      p = p || {};
      var el = one(sel), how = p.how || "mask", start = at(p.at), to = p.to || "top", c = pick("exit"), r = el.getBoundingClientRect(), d, tw;
      if (how === "mask") { d = durFor(r.height * 1.1, areaOf(el, p), "exit"); tw = G.to(el, { yPercent: to === "bottom" ? 110 : -110, duration: d, ease: c.fn }); }
      else if (how === "wipe") { d = durFor(r.width, areaOf(el, p), "exit"); tw = G.to(el, { clipPath: { left: "inset(0% 100% 0% 0%)", right: "inset(0% 0% 0% 100%)", top: "inset(0% 0% 100% 0%)", bottom: "inset(100% 0% 0% 0%)" }[to] || "inset(0% 0% 0% 100%)", duration: d, ease: c.fn }); }
      else if (how === "fade") { d = durFor(r.height * 0.5, areaOf(el, p), "exit"); tw = G.to(el, { autoAlpha: 0, scale: 0.97, duration: d, ease: c.fn }); }
      else { var dist = +p.dist || W * 0.3, dx = to === "left" ? -dist : to === "right" ? dist : 0, dy = to === "top" ? -dist : to === "bottom" ? dist : 0; d = durFor(dist, areaOf(el, p), "exit"); var se = state(el); tw = G.fromTo(el, { x: se.x, y: se.y }, { x: se.x + dx, y: se.y + dy, duration: d, ease: c.fn, immediateRender: first(se) }); se.x += dx; se.y += dy; tl.add(tw, start); softenWith(el, c.fn, start, d, dist); return handle(start, d, { role: "exit" }); }
      tl.add(tw, start);
      return handle(start, d, { role: "exit" });
    }
    // cascade: many similar things enter as one irregular group. Offsets fall on a curve (amount * (i/n)^1.35) plus
    // +-1 frame, durations vary +-10%, the whole spread stays under the contract's amount (0.5 s by default)
    function cascade(sel, p) {
      p = p || {};
      var els = many(sel), n = els.length, start = at(p.at), amount = Math.min(staggerMax, p.amount || Math.min(staggerMax, 0.06 * n + 0.1));
      need(n, "cascade: no elements for " + sel);
      var end = start, first = null;
      els.forEach(function (el, i) {
        var off = amount * Math.pow(i / Math.max(1, n - 1), p.from === "end" ? 0.75 : 1.35) + Math.round(R() * 2 - 1) * F;
        var q = {}; for (var x in p) q[x] = p[x];
        q.at = frameRound(start + Math.max(0, off));
        q.k = 0.88 + 0.3 * (i / Math.max(1, n - 1)); // later items land a little slower: the group never ends on one frame
        var h = enter(el, q);
        if (!first) first = h;
        end = Math.max(end, h.end);
      });
      return handle(start, frameRound(end - start), { first: first });
    }
    // camera: the living frame on a world wrapper (never on a single line of text): a push of 1.5-4% or a drift of
    // 0.5-1.5% of the frame a second, on a drift curve, for the length of the shot. `to` moves it somewhere for real.
    function camera(sel, p) {
      p = p || {};
      var el = one(sel), start = at(p.at), d = +p.dur || 4;
      el.setAttribute("data-obey", "camera");
      var cam = C.camera || {}, pr = cam.push_pct || [1.5, 4], dr = cam.drift_pct_s || [0.5, 1.5];
      var push = p.push != null ? p.push : (pr[0] + R() * (pr[1] - pr[0])) / 100;
      var ang = R() * Math.PI * 2, sp = (dr[0] + R() * (dr[1] - dr[0])) / 100 * W * d;
      var to = p.to || { scale: 1 + push, x: Math.cos(ang) * sp * (p.drift === 0 ? 0 : 1), y: Math.sin(ang) * sp * 0.5 * (p.drift === 0 ? 0 : 1) };
      var sc = state(el), from = { scale: sc.scale, x: sc.x, y: sc.y };
      var t = { duration: d, ease: ease(p.curve || curves.drift), immediateRender: first(sc) };
      for (var q in to) t[q] = to[q];
      if (to.x != null) sc.x = to.x; if (to.y != null) sc.y = to.y; if (to.scale != null) sc.scale = to.scale;
      tl.add(G.fromTo(el, from, t), start);
      return handle(start, d, { role: "camera" });
    }
    // ambient: a finite, quiet secondary life on a ground, a glow or a background card (never on a line being read)
    function ambient(sel, p) {
      p = p || {};
      var el = one(sel), start = at(p.at), d = +p.dur || 4, amp = p.amp != null ? +p.amp : 6;
      var period = 2.2 + R() * 1.6, reps = Math.max(1, Math.round(d / period)) - 1;
      var sa = state(el);
      tl.add(G.fromTo(el, { y: sa.y, rotation: sa.rotation }, { y: sa.y + jit(amp, 0.3), rotation: sa.rotation + (R() * 2 - 1) * 0.6, duration: frameRound(d / (reps + 1)), ease: "sine.inOut", yoyo: true, repeat: reps, immediateRender: first(sa) }), start);
      return handle(start, d, { role: "ambient" });
    }

    // ---- 1.1.0: one-frame snap, constant-octave dive, scale dive, directional smear, OKLab colour
    var svgDefs = null, smearId = 0;
    function smearFilter() {
      if (!svgDefs) {
        var NS = "http://www.w3.org/2000/svg", sv = document.createElementNS(NS, "svg");
        sv.setAttribute("width", 0); sv.setAttribute("height", 0); sv.setAttribute("aria-hidden", "true"); sv.style.cssText = "position:absolute;width:0;height:0";
        svgDefs = document.createElementNS(NS, "defs"); sv.appendChild(svgDefs); rootEl.appendChild(sv);
      }
      var NS2 = "http://www.w3.org/2000/svg", f = document.createElementNS(NS2, "filter"), g = document.createElementNS(NS2, "feGaussianBlur"), id = "rm-smear-" + (++smearId);
      f.setAttribute("id", id); f.setAttribute("x", "-50%"); f.setAttribute("y", "-50%"); f.setAttribute("width", "200%"); f.setAttribute("height", "200%"); f.setAttribute("color-interpolation-filters", "sRGB");
      g.setAttribute("stdDeviation", "0 0"); f.appendChild(g); svgDefs.appendChild(f);
      return { id: id, g: g };
    }
    // smear: a directional blur (a Gaussian along one axis, stdDeviation = length / 2) that peaks on the FIRST frame of
    // a fast entrance (peak "first": the arrival is blurred, then it resolves) or the LAST frame of a fast exit
    // (peak "last"). Over `frames` frames the length falls (or rises) with an exponent of 2.5. Take the length from the
    // speed: about a quarter of the travel in px, 12 to 90.
    function smear(sel, p) {
      p = p || {};
      var els = many(sel), N = Math.max(1, Math.round(p.frames || 3)), start = at(p.at), peak = p.peak === "last" ? "last" : "first", px = p.px != null ? +p.px : 24, ax = p.axis === "y" ? "y" : "x";
      els.forEach(function (el) {
        var f = smearFilter(); smeared.add(el); smearLog++;
        drive(start, N * F, function (q) {
          var i = Math.min(N - 1, Math.floor(q * N + 1e-9)), v = 0;
          if (q > 0 && q < 1) v = px / 2 * Math.pow(peak === "last" ? (i + 1) / N : 1 - i / N, 2.5);
          if (q === 0 && peak === "first") v = px / 2;
          f.g.setAttribute("stdDeviation", ax === "y" ? "0 " + v.toFixed(3) : v.toFixed(3) + " 0");
          el.style.filter = v > 0.05 ? "url(#" + f.id + ")" : "";
        });
      });
      return handle(start, N * F);
    }
    // snap: frame `at` is the "from" pose, the NEXT frame is already `firstFrameShare` (default 0.6) of the way, then a
    // decelerating tail of `tail` frames (default 15, ease "softLand"). The move reads as hit, not travelled. Properties:
    // x, y, scale, rotation, opacity in from/to (from defaults to where the element is planned to be). smear: true adds
    // the directional smear on the first frames, along the larger of dx / dy.
    function snap(sel, p) {
      p = p || {};
      var el = one(sel), start = at(p.at), sh = p.firstFrameShare == null ? 0.6 : clamp(+p.firstFrameShare, 0, 1), tail = Math.max(1, Math.round(p.tail == null ? 15 : p.tail));
      var tail_ease = ease(p.ease || "softLand"), st = state(el), to = p.to || {}, from = {};
      var props = ["x", "y", "scale", "rotation", "opacity"], base = { x: st.x, y: st.y, scale: st.scale, rotation: st.rotation, opacity: 1 };
      props.forEach(function (k) { var a = p.from && p.from[k] != null ? p.from[k] : base[k]; from[k] = a; if (to[k] == null) to[k] = a; });
      var total = (1 + tail) * F;
      drive(start, total, function (q) {
        var e = q * (1 + tail), v = {};
        props.forEach(function (k) {
          var a = from[k], b = to[k], first = a + (b - a) * sh;
          v[k] = e <= 0 ? a : e < 1 ? a + (first - a) * e : e >= 1 + tail ? b : first + (b - first) * tail_ease((e - 1) / tail);
        });
        G.set(el, v);
      });
      st.x = to.x; st.y = to.y; st.scale = to.scale; st.rotation = to.rotation; st.fresh = false;
      log.gestures++; log.byRole.snap = (log.byRole.snap || 0) + 1; log.byCurve["snap:" + (p.ease || "softLand")] = (log.byCurve["snap:" + (p.ease || "softLand")] || 0) + 1;
      var d = Math.hypot(to.x - from.x, to.y - from.y);
      if (p.smear) smear(el, { at: start, frames: Math.min(4, tail), px: p.smearPx != null ? p.smearPx : clamp(d * 0.15, 8, 90), axis: Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? "x" : "y", peak: "first" });
      return handle(start, total, { role: "snap" });
    }
    // dive: a constant-octave zoom. The scale multiplies by `perStep` (default 1.6) EVERY frame for `frames` frames
    // (default 9), no ease: the zoom never slows, which is what makes it read as falling into something. The origin
    // is the point that stays put (a feature of the logo, not the frame centre): origin [x, y] in composition px.
    // `to` (a final scale) can replace perStep. The end scale is perStep ^ frames (9 frames at 1.6 is about 69x).
    function dive(sel, p) {
      p = p || {};
      var el = one(sel), start = at(p.at), frames = Math.max(1, Math.round(p.frames || 9)), ps = p.to ? Math.pow(+p.to, 1 / frames) : +p.perStep || 1.6, org = p.origin || [W / 2, H / 2];
      G.set(el, { transformOrigin: org[0] + "px " + org[1] + "px" });
      var s0 = state(el).scale || 1;
      drive(start, frames * F, function (q) { G.set(el, { scale: s0 * Math.pow(ps, q * frames) }); });
      state(el).scale = s0 * Math.pow(ps, frames); log.gestures++; log.byRole.dive = (log.byRole.dive || 0) + 1; log.byCurve["dive"] = (log.byCurve["dive"] || 0) + 1;
      return handle(start, frames * F, { role: "dive", perStep: ps, end_scale: Math.pow(ps, frames) });
    }
    // scaleDive: a dive through levels of a world, 1x to 300x and beyond (references/scale-dive.md). `world` is one element
    // holding every level; the zoom z(t) is exponential in time (constant octaves per second, eased only at the two
    // ends by `ends` of the run), `anchor` is the world point [x, y] that stays at the screen point `at_screen`
    // (default the frame centre), and each level fades by its ON-SCREEN size so the eye never sees a level it cannot read:
    // `screenTo` [x, y] moves the anchor's screen position linearly over the dive (the target slides to the centre while the zoom falls).
    //   levels: [{ el, size }]  size = the level's width in world px at zoom 1; visible while its on-screen width is
    //   between `appear` (default 0.04 W, fades in by 0.08 W) and `leave` (default 3 W, fades out by 6 W).
    function scaleDive(world, p) {
      p = p || {};
      var wEl = one(world), start = at(p.at), d = +p.dur || 4, z0 = +p.from || 1, z1 = +p.to || 300, an = p.anchor || [W / 2, H / 2], sc = p.screen || [W / 2, H / 2], sc2 = p.screenTo || sc, ends = p.ends != null ? p.ends : 0.12;
      var lv = (p.levels || []).map(function (l) { return { el: one(l.el), size: +l.size || W }; });
      var lz0 = Math.log(z0), lz1 = Math.log(z1), appear = (p.appear || 0.04) * W, leave = (p.leave || 3) * W;
      G.set(wEl, { transformOrigin: "0 0" });
      function zoomAt(q) { // log zoom: a trapezoid of speed (ease in over `ends`, constant octaves, ease out) so it starts and lands without a jolt
        var a = clamp(ends, 0, 0.45), u = q;
        if (a > 0) {
          var norm = 1 - a;
          u = q < a ? q * q / (2 * a) : q > 1 - a ? a / 2 + (1 - 2 * a) + (a - (1 - q) * (1 - q) / (2 * a)) : a / 2 + (q - a);
          u /= norm;
        }
        return Math.exp(lz0 + (lz1 - lz0) * clamp(u, 0, 1));
      }
      drive(start, d, function (q) {
        var z = zoomAt(q);
        var sx = sc[0] + (sc2[0] - sc[0]) * q, sy = sc[1] + (sc2[1] - sc[1]) * q; // the anchor's screen spot may travel (linearly) to its resting place
        G.set(wEl, { scale: z, x: sx - an[0] * z, y: sy - an[1] * z });
        lv.forEach(function (l) {
          var w = l.size * z, o = clamp((w - appear) / appear, 0, 1) * clamp((leave * 2 - w) / leave, 0, 1);
          l.el.style.opacity = o.toFixed(3); l.el.style.visibility = o <= 0.001 ? "hidden" : "visible";
        });
      });
      log.gestures++; log.byRole.dive = (log.byRole.dive || 0) + 1; log.byCurve.scaleDive = (log.byCurve.scaleDive || 0) + 1;
      return handle(start, d, { role: "dive", octaves: Math.log(z1 / z0) / Math.LN2 });
    }
    // colour: tween a CSS colour property in OKLab (red to green passes yellow, not brown). Linear in k unless `curve`.
    function colour(sel, p) {
      p = p || {};
      var els = many(sel), start = at(p.at), d = +p.dur || 0.5, prop = p.prop || "color", c = ease(p.curve || "softInOut");
      drive(start, d, function (q) { var v = mix(p.from, p.to, c(q)); els.forEach(function (e) { e.style[prop] = v; }); });
      return handle(start, d, { role: "colour" });
    }
    function next(h, share) { return share == null ? h.next : frameRound(h.start + h.dur * share); }
    function audit() {
      var n = log.gestures || 1, top = 0, name = null, c;
      for (c in log.byCurve) if (log.byCurve[c] > top) { top = log.byCurve[c]; name = c; }
      var ds = log.durations.slice().sort(function (a, b) { return a - b; });
      return { gestures: log.gestures, dominant_curve: name, dominant_share: Math.round((top / n) * 100) / 100, curves: log.byCurve, roles: log.byRole, settle_share: Math.round((log.settles / n) * 100) / 100, duration_median: ds.length ? ds[ds.length >> 1] : null, distinct_durations: Object.keys(log.durations.reduce(function (a, d) { a[Math.round(d * fps)] = 1; return a; }, {})).length, blur_grammar: smearLog && softLog ? "mixed" : smearLog ? "smear" : softLog ? "soft" : "none" };
    }
    return { travel: travel, land: land, follow: follow, enter: enter, exit: exit, cascade: cascade, camera: camera, ambient: ambient, snap: snap, dive: dive, scaleDive: scaleDive, smear: smear, colour: colour, mix: mix, next: next, audit: audit, dur: durFor, ease: function (role) { return ease(curves[role] || role); }, curves: curves, W: W, H: H, fps: fps };
  }

  // ------------------------------------------------------------------ spring superposition (AO.1)
  // step response of a damped spring from 0 to 1 at t >= 0 (z: damping ratio, w: angular frequency rad/s)
  function stepResponse(z, w, t) {
    if (t <= 0) return 0;
    if (z < 1) { var wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t)); }
    if (z === 1) return 1 - (1 + w * t) * Math.exp(-w * t);
    var q = Math.sqrt(z * z - 1), r1 = -w * (z - q), r2 = -w * (z + q); // two real poles
    return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  }
  function stepRate(z, w, t) { // d/dt of stepResponse
    if (t <= 0) return 0;
    if (z < 1) { var wd = w * Math.sqrt(1 - z * z); return (w / Math.sqrt(1 - z * z)) * Math.exp(-z * w * t) * Math.sin(wd * t); }
    if (z === 1) return w * w * t * Math.exp(-w * t);
    var q = Math.sqrt(z * z - 1), r1 = -w * (z - q), r2 = -w * (z + q);
    return -r1 * r2 * (Math.exp(r1 * t) - Math.exp(r2 * t)) / (r2 - r1);
  }
  // times [t_i], values [v_i], pick(i) -> { z, w } for the step that arrives at key i (i >= 1)
  function chase(ts, vs, pick) {
    var n = ts.length, par = [];
    for (var i = 1; i < n; i++) par[i] = pick(i);
    function f(t) {
      var v = vs[0];
      for (var i = 1; i < n; i++) { if (t <= ts[i]) break; v += (vs[i] - vs[i - 1]) * stepResponse(par[i].z, par[i].w, t - ts[i]); }
      return v;
    }
    f.velocity = function (t) {
      var d = 0;
      for (var i = 1; i < n; i++) { if (t <= ts[i]) break; d += (vs[i] - vs[i - 1]) * stepRate(par[i].z, par[i].w, t - ts[i]); }
      return d;
    };
    return f;
  }
  function springTrack(keys, o) {
    o = o || {};
    need(keys && keys.length, "springTrack needs at least one key {t, v}");
    var z = o.z == null ? 1 : +o.z, w = o.w == null ? 20 : +o.w;
    return chase(keys.map(function (k) { return +k.t; }), keys.map(function (k) { return +k.v; }), function () { return { z: z, w: w }; });
  }
  function edges(keys, o) {
    o = o || {};
    need(keys && keys.length, "edges needs at least one key {t, x, w}");
    var L = o.lead || {}, T = o.trail || {};
    var lead = { z: L.z == null ? 1 : +L.z, w: L.w == null ? 28 : +L.w }, trail = { z: T.z == null ? 1 : +T.z, w: T.w == null ? 16 : +T.w };
    var ts = keys.map(function (k) { return +k.t; });
    var lv = keys.map(function (k) { return +k.x; }), rv = keys.map(function (k) { return +k.x + +k.w; });
    function dir(i) { return (lv[i] + rv[i]) - (lv[i - 1] + rv[i - 1]); } // sign of the centre's travel at key i
    var left = chase(ts, lv, function (i) { return dir(i) < 0 ? lead : trail; });   // moving left: the left edge leads
    var right = chase(ts, rv, function (i) { return dir(i) > 0 ? lead : trail; });  // moving right: the right edge leads
    return {
      left: left, right: right,
      center: function (t) { return (left(t) + right(t)) / 2; },
      width: function (t) { return right(t) - left(t); },
    };
  }
  // Boundary-condition support (Addendum 1, motion handoffs). A value that CONTINUES from a known state {x0, v0} at t0 toward `to`
  // on a closed-form damped spring (z damping ratio, w rad/s): no state, no history, a pure function of t, so any frame can be
  // sought in any order and an interrupted render restarts anywhere. Before t0 it holds x0. w <= 0 coasts at v0 (no pull).
  // f(t) -> value, f.velocity(t) -> units/s (v0 at t0, so the incoming side starts with the outgoing side's speed: no ease reset,
  // no stop). Plan the inputs with scripts/lib/motion-handoff.mjs planHandoff (carried states come from the declared seam).
  function continueFrom(o) {
    o = o || {};
    need(isFinite(+o.x0), "continueFrom needs x0 (the outgoing value at the boundary)");
    var t0 = +o.t0 || 0, x0 = +o.x0, v0 = isFinite(+o.v0) ? +o.v0 : 0, to = o.to == null || !isFinite(+o.to) ? null : +o.to;
    var z = o.z == null ? 1 : Math.max(0, +o.z), w = o.w == null ? 18 : +o.w;
    var tgt = to === null ? x0 : to, A = x0 - tgt; // no target (to == null): coast at v0, no pull
    function e(q) { // [deviation, rate] from the target, q seconds after t0
      if (w <= 0 || to === null) return null;
      var a = z * w, ex;
      if (z < 1 - 1e-9) { var wd = w * Math.sqrt(1 - z * z); ex = Math.exp(-a * q); var c = Math.cos(wd * q), s = Math.sin(wd * q); return [ex * (A * c + ((v0 + a * A) / wd) * s), ex * (v0 * c - ((a * v0 + w * w * A) / wd) * s)]; }
      if (z <= 1 + 1e-9) { ex = Math.exp(-w * q); return [ex * (A + (v0 + w * A) * q), ex * (v0 - w * (v0 + w * A) * q)]; }
      var qq = Math.sqrt(z * z - 1), r1 = -w * (z - qq), r2 = -w * (z + qq), c1 = (v0 - r2 * A) / (r1 - r2), c2 = A - c1, e1 = Math.exp(r1 * q), e2 = Math.exp(r2 * q);
      return [c1 * e1 + c2 * e2, c1 * r1 * e1 + c2 * r2 * e2];
    }
    function f(t) { var q = +t - t0; if (q <= 0) return x0; var d = e(q); return d ? tgt + d[0] : x0 + v0 * q; }
    f.velocity = function (t) { var q = +t - t0; if (q <= 0) return v0; var d = e(q); return d ? d[1] : v0; };
    f.t0 = t0; f.x0 = x0; f.v0 = v0; f.to = to;
    return f;
  }
  // the state {x, v} of any value function that has .velocity (springTrack, continueFrom, edges.left ...) at time t: what a seam hands over
  function stateAt(fn, t) { need(typeof fn === "function", "stateAt needs a function of time"); return { x: fn(t), v: typeof fn.velocity === "function" ? fn.velocity(t) : (fn(t + 1e-4) - fn(t - 1e-4)) / 2e-4 }; }

  function frameTime(t, fps) {
    if (typeof root.__rasanFrameTime === "number") return root.__rasanFrameTime;
    return Math.floor(t * fps + 1e-6) / fps;
  }

  return { version: VERSION, springTrack: springTrack, continueFrom: continueFrom, stateAt: stateAt, edges: edges, frameTime: frameTime, kit: kit, ease: ease, curves: CURVES, measured: MEASURED, measuredFrames: MEASURED_FRAMES, contract: contract, spring: spring, bezier: bez, mix: mix, oklab: toOklab, fromOklab: fromOklab };
});
