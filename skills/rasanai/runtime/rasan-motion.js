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
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.RasanMotion = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var VERSION = "1.0.0";

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
  // a curve name -> an ease function tagged with its name (cubic-bezier(), spring(), steps(n), any GSAP ease)
  function ease(name) {
    var s = String(name || "glide").trim(), m, f;
    if (CURVES[s] && CURVES[s] !== s) return tag(ease(CURVES[s]), s);
    if ((m = s.match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/))) f = bez(+m[1], +m[2], +m[3], +m[4]);
    else if ((m = s.match(/^spring\(\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/))) f = spring(+m[1], +(m[2] || 12));
    else if (/^(none|linear)$/.test(s)) f = function (x) { return x; };
    else { need(root.gsap, "GSAP is needed to read the ease " + s); f = root.gsap.parseEase(s); need(f, "unknown ease " + s); }
    return tag(f, s);
  }
  function tag(f, name) { var g = function (x) { return f(x); }; g.rasanCurve = name; return g; }

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
    var blurs = new WeakMap(), blurId = 0;
    function softenWith(el, fn, start, d, dist) {
      if (!blurOn || dist < W * 0.08) return;
      var h = 1 / (fps * d), id = ++blurId;
      if (!blurs.has(el)) blurs.set(el, {});
      var mine = blurs.get(el);
      drive(start, d, function (p) {
        var s = 0;
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
    function next(h, share) { return share == null ? h.next : frameRound(h.start + h.dur * share); }
    function audit() {
      var n = log.gestures || 1, top = 0, name = null, c;
      for (c in log.byCurve) if (log.byCurve[c] > top) { top = log.byCurve[c]; name = c; }
      var ds = log.durations.slice().sort(function (a, b) { return a - b; });
      return { gestures: log.gestures, dominant_curve: name, dominant_share: Math.round((top / n) * 100) / 100, curves: log.byCurve, roles: log.byRole, settle_share: Math.round((log.settles / n) * 100) / 100, duration_median: ds.length ? ds[ds.length >> 1] : null, distinct_durations: Object.keys(log.durations.reduce(function (a, d) { a[Math.round(d * fps)] = 1; return a; }, {})).length };
    }
    return { travel: travel, land: land, follow: follow, enter: enter, exit: exit, cascade: cascade, camera: camera, ambient: ambient, next: next, audit: audit, dur: durFor, ease: function (role) { return ease(curves[role] || role); }, curves: curves, W: W, H: H, fps: fps };
  }

  return { version: VERSION, kit: kit, ease: ease, curves: CURVES, contract: contract, spring: spring, bezier: bez };
});
