/* Rasan2D gestures: time-addressable actions compiled into pure functions of absolute time.
 *
 * pose(actorId, t) is a function of t and of the action list ONLY. Nothing is integrated from the previous frame,
 * so any t can be asked for in any order, twice, on any worker, and answers the same.
 *
 * Animation principles built in (each one is a named term in the gesture functions below):
 *   anticipation (a crouch or a pull-back before a hop, jump, reach, turn), squash and stretch (volume kept: sx = 1/sqrt(sy)),
 *   easing (every move ramps in and out), arcs (hops fly on a parabola, hands swing on arcs), overshoot and follow-through
 *   (ears, tuft, tail and head answer the body a few frames late through a damped-spring response of its own past),
 *   timing offsets between parts (head leads a turn, body follows; hand lags arm), weight (landings squash by the fall height)
 *   and planted feet (a foot schedule compiled from the actions: a planted foot has one world position for its whole stance).
 *
 * Units: positions are world pixels; "u" is the actor's unit (actor height / 19), body-local numbers are in u.
 * Works in a browser (window.Rasan2DKit.gestures) and in Node (module.exports).
 */
(function (root) {
  "use strict";
  var K = (root.Rasan2DKit = root.Rasan2DKit || {});
  var B = K.brush || (typeof require === "function" ? require("./brush.js") : null);
  var C = K.character || (typeof require === "function" ? require("./character.js") : null);
  var TAU = Math.PI * 2;

  // ------------------------------------------------------------------ easing
  var E = {
    lin: function (u) { return u; },
    inQ: function (u) { return u * u; },
    outQ: function (u) { return 1 - (1 - u) * (1 - u); },
    inOutQ: function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; },
    inC: function (u) { return u * u * u; },
    outC: function (u) { return 1 - Math.pow(1 - u, 3); },
    inOutC: function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    inOutS: function (u) { return -(Math.cos(Math.PI * u) - 1) / 2; },
    smooth: function (u) { return u * u * (3 - 2 * u); },
    outB: function (u) { var s = 1.9, c = u - 1; return 1 + c * c * ((s + 1) * c + s); },
    inB: function (u) { var s = 1.6; return u * u * ((s + 1) * u - s); },
    outE: function (u) { return u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(2, -9 * u) * Math.cos(u * 9.4) ; },
  };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(name, u) { u = clamp(u, 0, 1); return (E[name] || E.inOutC)(u); }
  function lerp(a, b, w) { return a + (b - a) * w; }
  function prog(t, t0, t1) { return t1 <= t0 ? (t >= t1 ? 1 : 0) : clamp((t - t0) / (t1 - t0), 0, 1); }
  // piecewise keys [[u, value, easeIntoThisKey?], ...]; u in absolute or local units, any increasing numbers
  function kf(keys, u) {
    if (u <= keys[0][0]) return keys[0][1];
    for (var i = 1; i < keys.length; i++) {
      if (u <= keys[i][0]) { var a = keys[i - 1], b = keys[i]; return lerp(a[1], b[1], ease(b[2] || "inOutC", (u - a[0]) / (b[0] - a[0]))); }
    }
    return keys[keys.length - 1][1];
  }
  function bump(u) { return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u); }

  var KINDS = ["idle", "breathe", "look", "gaze", "walk", "point", "reach", "hop", "jump", "react", "take", "blink", "turn", "hold", "emote", "release", "catch"];
  var VIEWS = ["front", "quarter", "side", "back-quarter", "back"];
  var VIEW_YAW = { front: 0, quarter: 45, side: 90, "back-quarter": 135, back: 180 };

  // ------------------------------------------------------------------ the emotion vector blend
  function blendEmo(a, b, w) {
    if (w <= 0) return a;
    if (w >= 1) return b;
    var o = {}, k;
    for (k in a) {
      if (k === "marks") continue;
      o[k] = typeof a[k] === "number" ? lerp(a[k], b[k], w) : (w < 0.5 ? a[k] : b[k]);
    }
    o.marks = {};
    var mk = {};
    for (k in a.marks) mk[k] = 1;
    for (k in b.marks) mk[k] = 1;
    for (k in mk) o.marks[k] = lerp(a.marks[k] || 0, b.marks[k] || 0, w);
    return o;
  }

  // 2-bone helpers, unit vectors
  function unitFromAngle(deg) { var a = deg * Math.PI / 180; return [Math.sin(a), Math.cos(a)]; } // 0 = down, +90 = outward (+x)

  // ------------------------------------------------------------------ compile
  // spec: { width, height, seed, actors: { id: { x, y (frame fractions of the floor point), scale, yaw (view name or degrees), emotion } },
  //         props: { id: {...} } , actions: [...] }
  function createTimeline(spec) {
    var Wd = spec.width || 1920, Ht = spec.height || 1080, seed = (spec.seed | 0) >>> 0;
    var actorsIn = spec.actors || {}, aids = Object.keys(actorsIn), problems = [];
    var A = {};
    aids.forEach(function (id) {
      var a = actorsIn[id], hs = B.mix(B.hashStr(id), seed), px = (a.x != null ? a.x : 0.5) * Wd, py = (a.y != null ? a.y : 0.8) * Ht;
      var size = a.size || (a.scale || 1) * Ht * 0.4;
      var yaw0 = typeof a.yaw === "string" ? (VIEW_YAW[a.yaw] != null ? VIEW_YAW[a.yaw] : 0) : (a.yaw || 0);
      if (typeof a.yaw === "string" && /^-/.test(a.yaw)) yaw0 = -VIEW_YAW[a.yaw.slice(1)] || 0;
      A[id] = { id: id, hs: hs, x0: px, y0: py, size: size, u: size / 19, yaw0: snapYaw(yaw0), emo0: a.emotion || "calm", hold: [], root: [], yawB: [], yawH: [], emo: [], gaze: [], trans: [], idle: [], feet: { L: [], R: [] }, phase: B.hash01(hs, 1, 2) * TAU };
    });
    var acts = (spec.actions || []).map(function (a, i) { return Object.assign({}, a, { _i: i }); }).filter(function (a) { return a && A[a.actor]; });
    acts.sort(function (a, b) { return (a.at - b.at) || (a._i - b._i); });
    (spec.actions || []).forEach(function (a, i) {
      if (!a || typeof a !== "object") return problems.push("action " + i + " is not an object");
      if (!A[a.actor]) problems.push("action " + i + " (" + a.kind + "): unknown actor " + a.actor);
      if (KINDS.indexOf(a.kind) < 0) problems.push("action " + i + ": unknown kind " + a.kind + " (" + KINDS.join(", ") + ")");
      if (!isFinite(a.at)) problems.push("action " + i + " (" + a.kind + "): at must be a number of seconds");
      if (a.duration != null && !(a.duration >= 0)) problems.push("action " + i + " (" + a.kind + "): duration must be >= 0");
    });
    var propsIn = spec.props || {}, P = compileProps(propsIn, Wd, Ht);

    function snapYaw(y) { var s = y < 0 ? -1 : 1, a = Math.round(Math.abs(y) / 45) * 45; return s * Math.min(180, a); }
    var EMO = function (n) { var e = C.EMOTIONS[n]; return e ? C.emotionParams(n) : (problems.push("unknown emotion " + n), C.emotionParams("calm")); };

    // ---- persistent channels, in order of the actions
    aids.forEach(function (id) {
      var A_ = A[id], u = A_.u, mine = acts.filter(function (a) { return a.actor === id; });
      var x = A_.x0, y = A_.y0, yawB = A_.yaw0, yawBt = -1e9;
      A_.yawB.push([-1e9, A_.yaw0]); A_.yawH.push([-1e9, A_.yaw0]);
      A_.emo.push({ t0: -1e9, t1: -1e9, vec: EMO(A_.emo0), name: A_.emo0 });
      var lastYaw = A_.yaw0;
      mine.forEach(function (a) {
        var d = a.duration != null ? a.duration : 0.5, t0 = a.at, t1 = a.at + d;
        if (a.kind === "walk") {
          var dx = (a.dx != null ? a.dx : (a.to && a.to.x != null ? a.to.x - x / Wd : 0)) * Wd, dy = (a.dy != null ? a.dy : 0) * Ht;
          A_.root.push({ t0: t0, t1: t1, x0: x, y0: y, x1: x + dx, y1: y + dy, ease: a.ease || "inOutS", kind: "walk", a: a });
          x += dx; y += dy;
        } else if (a.kind === "hop" || a.kind === "jump") {
          var dxh = (a.dx || 0) * Wd, dyh = (a.dy || 0) * Ht, q = hopTimes(a, d);
          A_.root.push({ t0: q.fly0, t1: q.fly1, x0: x, y0: y, x1: x + dxh, y1: y + dyh, ease: "inOutS", kind: a.kind, a: a, q: q });
          x += dxh; y += dyh;
        } else if (a.kind === "turn") {
          var tgt = a.to != null ? (typeof a.to === "string" ? (a.to.charAt(0) === "-" ? -VIEW_YAW[a.to.slice(1)] : (VIEW_YAW[a.to] != null ? VIEW_YAW[a.to] : lastYaw)) : a.to) : lastYaw;
          if (typeof a.to === "string" && a.dir === "left" && tgt > 0) tgt = -tgt;
          if (typeof a.to === "string" && a.dir === "right" && tgt < 0) tgt = -tgt;
          tgt = snapYaw(tgt);
          var steps = turnSteps(lastYaw, tgt, a.via), n = steps.length - 1;
          var s0 = t0 + d * 0.22, s1 = t0 + d * 0.9;
          for (var k = 1; k <= n; k++) {
            var tk = n === 1 ? (s0 + s1) / 2 : s0 + (s1 - s0) * (k - 1) / (n - 1);
            A_.yawH.push([tk - Math.min(0.08, d * 0.08), steps[k]]);
            A_.yawB.push([tk + Math.min(0.1, d * 0.1), steps[k]]);
            A_.trans.push({ kind: "turnstep", t0: tk - 0.05, t1: tk + 0.11 });
          }
          A_.trans.push({ kind: "turn", t0: t0, t1: t1, d: d, a: a, dirSign: (tgt - lastYaw) >= 0 ? 1 : -1, steps: n });
          A_.replant = A_.replant || [];
          for (var k2 = 1; k2 <= n; k2++) A_.replant.push({ t: A_.yawB[A_.yawB.length - n + k2 - 1][0], yaw: steps[k2], instant: d === 0 });
          lastYaw = tgt;
        } else if (a.kind === "emote" || ((a.kind === "react" || a.kind === "take") && a.emotion)) {
          var name = a.emotion || "calm", prev = A_.emo[A_.emo.length - 1];
          var et0 = a.kind === "emote" ? t0 : t0 + (a.emoteAt != null ? a.emoteAt : 0.04), et1 = a.kind === "emote" ? t1 : et0 + (a.emoteBlend != null ? a.emoteBlend : 0.18);
          A_.emo.push({ t0: et0, t1: et1, vec: EMO(name), name: name, pop: a.kind !== "emote" });
        } else if (a.kind === "look" || a.kind === "gaze") {
          A_.gaze.push({ t0: t0, t1: t1, tgt: a.target != null ? { pt: a.target.length === 2 ? [a.target[0] * Wd, a.target[1] * Ht] : null, prop: a.prop } : a.prop ? { prop: a.prop } : { dir: a.dir || [0, 0] }, head: a.head != null ? a.head : 1 });
          if (a.target == null && a.prop == null && !a.dir) A_.gaze[A_.gaze.length - 1].tgt = { dir: [0, 0] };
          if (a.prop && a.target == null) A_.gaze[A_.gaze.length - 1].tgt = { prop: a.prop };
        } else if (a.kind === "hold" || a.kind === "catch") {
          A_.hold.push({ t0: t0, t1: t1, until: a.until != null ? a.until : (a.release != null ? a.release : 1e9), prop: a.prop, hand: a.hand || "R", front: a.inFront === undefined ? "auto" : a.inFront, a: a });
        } else if (a.kind === "release") {
          for (var h = A_.hold.length - 1; h >= 0; h--) if (A_.hold[h].until > t0 && (!a.prop || A_.hold[h].prop === a.prop)) { A_.hold[h].until = t0; A_.hold[h].releaseEnd = t1; break; }
        } else if (a.kind === "idle" || a.kind === "breathe") {
          A_.idle.push({ t0: t0, t1: t1, amp: a.amount != null ? a.amount : 1, rate: a.rate || 1, style: a.style || "breathe" });
        }
        if (a.kind === "hop" || a.kind === "jump" || a.kind === "reach" || a.kind === "point" || a.kind === "react" || a.kind === "take" || a.kind === "blink" || a.kind === "catch" || a.kind === "walk")
          A_.trans.push({ kind: a.kind, t0: t0, t1: a.kind === "hop" || a.kind === "jump" ? hopTimes(a, d).end : t1, a: a, d: d });
      });
      // cache the "from" of each later emotion / gaze (the value just before it begins)
      A_.emo.forEach(function (e, i) { e.i = i; });
      buildFeet(A_);
    });

    function hopTimes(a, d) {
      var j = a.kind === "jump", antic = a.anticipation != null ? a.anticipation : (j ? 0.28 : 0.2) * Math.min(1, d / 0.7 + 0.35), land = a.settle != null ? a.settle : (j ? 0.26 : 0.18);
      var air = Math.max(0.15, d - antic - land);
      return { start: a.at, fly0: a.at + antic, fly1: a.at + antic + air, end: a.at + d, antic: antic, land: land, air: air, h: a.height != null ? a.height : (j ? 5.2 : 2.6) };
    }
    function turnSteps(from, to, via) {
      var s = [from];
      if (from === to) return s;
      var cur = from, guard = 0;
      // the walk through authored views: shortest way round unless told to go via front or back
      var dir;
      if (via === "front") dir = from > to ? -1 : 1;
      else if (via === "back") dir = from >= 0 && to >= 0 ? (from < to ? 1 : -1) : (from + to >= 0 ? 1 : -1);
      else dir = null;
      while (cur !== to && guard++ < 10) {
        var next;
        if (via === "front") { next = cur + (to > cur ? 45 : -45); }
        else if (via === "back") {
          if (cur < to && to <= 180 && cur >= 0) next = cur + 45;
          else if (cur > to && to >= -180 && cur <= 0) next = cur - 45;
          else if (cur >= 0 && to < 0) next = cur + 45 > 180 ? -135 : cur + 45;
          else if (cur <= 0 && to > 0) next = cur - 45 < -180 ? 135 : cur - 45;
          else next = cur + (to > cur ? 45 : -45);
          if (cur === 180) next = to < 0 ? -135 : 135;
        } else next = cur + (to > cur ? 45 : -45);
        if (next > 180) next = -135; if (next < -180) next = 135;
        cur = next; s.push(cur);
      }
      return s;
    }

    // ---- the foot schedule: planted feet have one world position for their whole stance
    function rootAt(A_, t) {
      var x = A_.x0, y = A_.y0, r = A_.root;
      for (var i = 0; i < r.length; i++) {
        var p = r[i];
        if (t >= p.t1) { x = p.x1; y = p.y1; }
        else if (t > p.t0) { var w = ease(p.ease, (t - p.t0) / (p.t1 - p.t0)); return [lerp(p.x0, p.x1, w), lerp(p.y0, p.y1, w)]; }
        else break;
      }
      return [x, y];
    }
    function yawAt(list, t) { var v = list[0][1]; for (var i = 1; i < list.length; i++) { if (list[i][0] <= t) v = list[i][1]; else break; } return v; }
    function stanceOffset(yaw, side) { return C.footOffset(yaw, side); } // in u, along the screen x for a body facing `yaw`
    function buildFeet(A_) {
      var u = A_.u, ev = { L: [], R: [] };
      var r0 = rootAt(A_, -1e9), yaw0 = A_.yaw0;
      ["L", "R"].forEach(function (s) { ev[s].push({ t0: -1e9, t1: 1e9, type: "plant", x: r0[0] + stanceOffset(yaw0, s) * u, y: r0[1] }); });
      var plantAt = function (s, t, x, y) { // replace the foot's open-ended plant with one that ends at t, then add the new one later
        var L = ev[s], last = L[L.length - 1];
        if (last && last.t1 > t && last.type === "plant") last.t1 = t;
      };
      var addSeg = function (s, seg) { ev[s].push(seg); };
      // events in time order: walks, hops/jumps, turn re-plants
      var items = [];
      A_.root.forEach(function (p) { if (p.kind === "walk" || p.kind === "hop" || p.kind === "jump") items.push({ t: p.t0, p: p }); });
      (A_.replant || []).forEach(function (rp) { items.push({ t: rp.instant ? rp.t : rp.t - 0.06, rp: rp }); });
      items.sort(function (a, b) { return a.t - b.t; });
      var busy = []; // windows where a walk or a hop owns the feet
      A_.root.forEach(function (p) { if (p.kind === "walk") busy.push([p.t0 - 0.02, p.t1 + 0.12]); else if (p.q) busy.push([p.q.start - 0.01, p.q.end + 0.01]); });
      var strictBusy = function (t) { return A_.root.some(function (p) { return (p.kind === "walk" && t > p.t0 && t < p.t1) || (p.q && t > p.q.start && t < p.q.end); }); };
      var inBusy = function (t) { return busy.some(function (w) { return t >= w[0] && t <= w[1]; }); };
      var yawNow = function (t) { return yawAt(A_.yawB, t); };
      items.forEach(function (it) {
        if (it.rp && it.rp.instant) { // a turn at a cut: the feet are re-planted in the same instant (the cut hides it), unless a walk or hop is under way
          if (strictBusy(it.t)) return;
          var rt0 = rootAt(A_, it.t);
          ["L", "R"].forEach(function (s) { plantAt(s, it.t); addSeg(s, { t0: it.t, t1: 1e9, type: "plant", x: rt0[0] + stanceOffset(it.rp.yaw, s) * u, y: rt0[1] }); });
          return;
        }
        if (it.rp) {
          if (inBusy(it.t) || inBusy(it.t + 0.14)) return;
          var t = it.t, rt = rootAt(A_, t);
          ["L", "R"].forEach(function (s, i) {
            var ts = t + i * 0.05, te = ts + 0.12;
            plantAt(s, ts);
            var lastX = lastPos(ev[s], ts);
            var nx = rt[0] + stanceOffset(it.rp.yaw, s) * u;
            addSeg(s, { t0: ts, t1: te, type: "swing", x0: lastX[0], y0: lastX[1], x: nx, y: rt[1], lift: 0.35 * u });
            addSeg(s, { t0: te, t1: 1e9, type: "plant", x: nx, y: rt[1] });
          });
          return;
        }
        var p = it.p;
        if (p.kind === "walk") {
          var yaw = yawNow(p.t0), dist = (p.x1 - p.x0), dir = dist >= 0 ? 1 : -1, stepLen = 1.9 * u;
          var n = Math.max(2, Math.round(Math.abs(dist) / stepLen)), T = (p.t1 - p.t0 - 0.1) / n, ts0 = p.t0 + 0.04;
          var finalYaw = yawAt(A_.yawB, p.t1 + 0.2);
          for (var i = 0; i < n; i++) {
            var s = i % 2 === 0 ? "L" : "R", st = ts0 + i * T, se = st + T * 0.86;
            var lastNow = lastPos(ev[s], st);
            plantAt(s, st);
            var hipEnd = rootAt(A_, se), isLast = i >= n - 2;
            var nx = isLast ? p.x1 + stanceOffset(finalYaw, s) * u : hipEnd[0] + dir * 0.55 * u + stanceOffset(yaw, s) * u * 0.5;
            var ny = isLast ? p.y1 : hipEnd[1];
            addSeg(s, { t0: st, t1: se, type: "swing", x0: lastNow[0], y0: lastNow[1], x: nx, y: ny, lift: 0.9 * u });
            addSeg(s, { t0: se, t1: 1e9, type: "plant", x: nx, y: ny });
          }
          // the foot that did not step last settles beside the other at the end (still planted: it just re-plants once, before the walk ends)
        } else {
          var q = p.q;
          ["L", "R"].forEach(function (s) {
            plantAt(s, q.fly0);
            var lastNow = lastPos(ev[s], q.fly0), y1 = p.y1, x1 = p.x1 + stanceOffset(yawAt(A_.yawB, q.fly1), s) * u;
            addSeg(s, { t0: q.fly0, t1: q.fly1, type: "air", x0: lastNow[0], y0: lastNow[1], x: x1, y: y1, lift: 0 });
            addSeg(s, { t0: q.fly1, t1: 1e9, type: "plant", x: x1, y: y1 });
          });
        }
      });
      ["L", "R"].forEach(function (s) { ev[s].sort(function (a, b) { return a.t0 - b.t0; }); });
      A_.feet = ev;
    }
    function lastPos(L, t) {
      var best = L[0];
      for (var i = 0; i < L.length; i++) if (L[i].t0 <= t && L[i].type === "plant") best = L[i];
      var cand = null;
      for (var j = 0; j < L.length; j++) if (L[j].t0 <= t && (L[j].type !== "plant") && L[j].t1 <= t + 1e-9) cand = L[j];
      if (cand && cand.t1 > best.t0) return [cand.x, cand.y];
      return [best.x, best.y];
    }
    function footAt(A_, side, t) {
      var L = A_.feet[side], seg = null;
      for (var i = L.length - 1; i >= 0; i--) if (L[i].t0 <= t) { seg = L[i]; break; }
      if (!seg) seg = L[0];
      if (seg.type === "plant") return { x: seg.x, y: seg.y, planted: true, lift: 0 };
      var w = prog(t, seg.t0, seg.t1), e = seg.type === "air" ? ease("inOutS", w) : ease("inOutQ", w);
      return { x: lerp(seg.x0, seg.x, e), y: lerp(seg.y0, seg.y, e), planted: false, lift: (seg.lift || 0) * bump(w), air: seg.type === "air" };
    }

    // ---- props
    function compileProps(defs, W, H) {
      var out = {};
      Object.keys(defs).forEach(function (id) {
        var d = defs[id], segs = [], cur = { x: (d.x != null ? d.x : 0.5) * W, y: (d.y != null ? d.y : 0.8) * H, rot: d.rot || 0, sx: 1, sy: 1 }, tcur = -1e9;
        (d.motion || []).forEach(function (m) {
          var t0 = m.at, from = Object.assign({}, cur);
          if (m.from) { from.x = m.from[0] * W; from.y = m.from[1] * H; }
          var seg = { kind: m.kind, t0: t0, from: from, m: m };
          if (m.kind === "fall") {
            seg.t1 = m.arrive; seg.to = { x: m.to[0] * W, y: m.to[1] * H }; cur = { x: seg.to.x, y: seg.to.y, rot: from.rot + (m.spin || 0) * TAU, sx: 1, sy: 1 };
          } else if (m.kind === "bounce") {
            seg.t1 = t0 + m.duration; seg.to = { x: from.x + (m.dx || 0) * W, y: from.y + (m.dy || 0) * H }; cur = { x: seg.to.x, y: seg.to.y, rot: from.rot + (m.spin || 0) * TAU, sx: 1, sy: 1 };
          } else if (m.kind === "roll") {
            seg.t1 = t0 + m.duration; seg.to = { x: from.x + (m.dx || 0) * W, y: from.y + (m.dy || 0) * H }; cur = { x: seg.to.x, y: seg.to.y, rot: from.rot + (m.dx >= 0 ? 1 : -1) * Math.abs(m.dx) * W / (m.radius || 22) , sx: 1, sy: 1 };
          } else if (m.kind === "move") {
            seg.t1 = t0 + m.duration; seg.to = { x: m.to[0] * W, y: m.to[1] * H }; cur = { x: seg.to.x, y: seg.to.y, rot: from.rot + (m.spin || 0) * TAU, sx: 1, sy: 1 };
          } else if (m.kind === "set") {
            seg.t1 = t0; seg.to = { x: (m.to ? m.to[0] : from.x / W) * W, y: (m.to ? m.to[1] : from.y / H) * H }; cur = { x: seg.to.x, y: seg.to.y, rot: from.rot, sx: 1, sy: 1 };
          } else return;
          segs.push(seg);
        });
        segs.sort(function (a, b) { return a.t0 - b.t0; });
        out[id] = { id: id, def: d, segs: segs, x0: (d.x != null ? d.x : 0.5) * W, y0: (d.y != null ? d.y : 0.8) * H, z: d.z || [] };
      });
      return out;
    }
    function propFree(id, t) {
      var p = P[id];
      if (!p) return null;
      var s = null, x = p.x0, y = p.y0, rot = p.def.rot || 0, sx = 1, sy = 1, lift = 0;
      for (var i = 0; i < p.segs.length; i++) {
        var g = p.segs[i];
        if (t >= g.t1) { x = g.to.x; y = g.to.y; rot = endRot(g); continue; }
        if (t < g.t0) break;
        var w = (t - g.t0) / Math.max(1e-6, g.t1 - g.t0);
        if (g.kind === "fall") { var f = w * w; x = lerp(g.from.x, g.to.x, w * 0.9 + f * 0.1); y = lerp(g.from.y, g.to.y, f); rot = g.from.rot + (g.m.spin || 0) * TAU * w; sy = 1 + 0.12 * w; sx = 1 - 0.05 * w; }
        else if (g.kind === "bounce") { var ht = (g.m.height || 0.12) * Ht; x = lerp(g.from.x, g.to.x, w); y = lerp(g.from.y, g.to.y, w) - 4 * ht * w * (1 - w); rot = g.from.rot + (g.m.spin || 0) * TAU * w; var e2 = Math.max(0, 1 - Math.abs(w - 0.5) * 2); sy = 1 + 0.12 * e2; sx = 1 - 0.06 * e2; }
        else if (g.kind === "roll") { var e3 = ease("outQ", w); x = lerp(g.from.x, g.to.x, e3); y = lerp(g.from.y, g.to.y, e3); rot = lerp(g.from.rot, endRot(g), e3); }
        else if (g.kind === "move") { var e4 = ease(g.m.ease || "inOutC", w); x = lerp(g.from.x, g.to.x, e4); y = lerp(g.from.y, g.to.y, e4) - (g.m.arc ? 4 * g.m.arc * Ht * e4 * (1 - e4) : 0); rot = lerp(g.from.rot, g.from.rot + (g.m.spin || 0) * TAU, e4); }
        break;
      }
      // squash on the ground: the frames just after a fall or bounce lands
      for (var j = 0; j < p.segs.length; j++) {
        var q = p.segs[j];
        if ((q.kind === "fall" || q.kind === "bounce") && t >= q.t1 && t < q.t1 + 0.16) { var k = 1 - (t - q.t1) / 0.16, h = q.kind === "fall" ? 1 : 0.6; sy *= 1 - 0.3 * h * k * k; sx *= 1 + 0.22 * h * k * k; }
      }
      return { x: x, y: y, rot: rot, sx: sx, sy: sy };
      function endRot(g) { return g.kind === "roll" ? g.from.rot + (g.m.dx >= 0 ? 1 : -1) * Math.abs(g.m.dx) * Wd / (g.m.radius || 22) : g.from.rot + (g.m.spin || 0) * TAU; }
    }
    function propZ(id, t) { // depth keys: [{t, rel: actorId, where: "behind"|"front"}] or [{t, z}] (step function)
      var p = P[id], z = null;
      if (!p) return null;
      for (var i = 0; i < p.z.length; i++) if (p.z[i].t <= t) z = p.z[i];
      return z;
    }

    // ---- the channels at t
    function emoAt(A_, t) {
      var cur = A_.emo[0].vec, name = A_.emo[0].name, t0 = A_.emo[0].t0, pop = false;
      for (var i = 1; i < A_.emo.length; i++) {
        var e = A_.emo[i];
        if (t < e.t0) break;
        var from = emoUpTo(A_, i, e.t0);
        var w = e.t1 > e.t0 ? ease(e.pop ? "outB" : "inOutC", (t - e.t0) / (e.t1 - e.t0)) : 1;
        cur = w >= 1 ? e.vec : blendEmo(from, e.vec, clamp(w, 0, 1.0));
        if (w > 1) cur = blendOver(from, e.vec, w);
        name = e.name; t0 = e.t0; pop = e.pop;
      }
      return { vec: cur, name: name, age: t - t0 };
    }
    function blendOver(a, b, w) { return blendEmo(a, b, 1 + (w - 1) * 0.0); }
    function emoUpTo(A_, i, t) { // value of the first i emotions at time t (just before emotion i begins)
      var cur = A_.emo[0].vec;
      for (var j = 1; j < i; j++) { var e = A_.emo[j]; if (t < e.t0) break; var from = j > 1 ? emoUpTo(A_, j, e.t0) : A_.emo[0].vec; var w = e.t1 > e.t0 ? ease(e.pop ? "outB" : "inOutC", (t - e.t0) / (e.t1 - e.t0)) : 1; cur = w >= 1 ? e.vec : blendEmo(from, e.vec, clamp(w, 0, 1)); }
      return cur;
    }
    function headPos(A_, t, ro) { var r = ro || rootAt(A_, t); return [r[0], r[1] - 11.6 * A_.u]; }
    function gazeTarget(g, t, A_) {
      if (g.tgt.pt) return g.tgt.pt;
      if (g.tgt.prop) { var q = propFree(g.tgt.prop, t); return q ? [q.x, q.y] : [A_.x0, A_.y0 - 11 * A_.u]; }
      var hp = headPos(A_, t), d = g.tgt.dir || [0, 0];
      return [hp[0] + d[0] * 0.25 * Wd, hp[1] + d[1] * 0.25 * Ht];
    }
    function gazeAt(A_, t) {
      var cur = null, curHead = 0;
      for (var i = 0; i < A_.gaze.length; i++) {
        var g = A_.gaze[i];
        if (t < g.t0) break;
        var tgt = gazeTarget(g, t, A_), w = ease("inOutC", prog(t, g.t0, g.t1));
        if (cur == null) { var hp = headPos(A_, t); cur = [lerp(hp[0], tgt[0], w), lerp(hp[1], tgt[1], w)]; curHead = lerp(0, g.head, w); }
        else { var prev = A_.gaze[i - 1], pt = gazeTarget(prev, t, A_); cur = [lerp(pt[0], tgt[0], w), lerp(pt[1], tgt[1], w)]; curHead = lerp(prev.head, g.head, w); }
      }
      var hp2 = headPos(A_, t);
      if (!cur) return { x: 0, y: 0, head: 0 };
      return { x: clamp((cur[0] - hp2[0]) / (0.2 * Wd), -1, 1), y: clamp((cur[1] - hp2[1]) / (0.22 * Ht), -1, 1), head: curHead };
    }
    function holdAt(A_, t) {
      for (var i = A_.hold.length - 1; i >= 0; i--) {
        var h = A_.hold[i];
        if (t >= h.t0 && t < h.until + (h.releaseEnd ? h.releaseEnd - h.until : 0)) {
          var w = ease("outC", prog(t, h.t0, h.t0 + Math.max(0.12, h.a.grab != null ? h.a.grab : 0.28)));
          if (h.releaseEnd && t >= h.until) w *= 1 - prog(t, h.until, h.releaseEnd);
          return { prop: h.prop, hand: h.hand, w: w, front: h.front, t0: h.t0 };
        }
      }
      return null;
    }
    function idleAt(A_, t) {
      var amp = 1, rate = 1;
      A_.idle.forEach(function (i) { if (t >= i.t0 && t <= i.t1) { amp = i.amp; rate = i.rate; } });
      return { amp: amp, rate: rate };
    }
    function blinkAt(A_, t) {
      var c = 0, slot = 3.4, j = Math.floor(t / slot);
      for (var k = j - 1; k <= j; k++) {
        var tb = k * slot + 0.5 + B.hash01(A_.hs, 7, k) * 2.3, u = (t - tb) / 0.15;
        if (u >= 0 && u <= 1) c = Math.max(c, u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6);
      }
      A_.trans.forEach(function (tr) { if (tr.kind === "blink") { var u = (t - tr.t0) / Math.max(0.08, tr.d); if (u >= 0 && u <= 1) c = Math.max(c, u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6); } });
      return c;
    }

    // the primary pose: every channel that does not depend on the pose's own past
    function primary(A_, t, noEmo) {
      var u = A_.u, root = rootAt(A_, t), acc = { lift: 0, dsy: 0, lean: 0, dx: 0, hTilt: 0, hNod: 0, hDx: 0, armA: { L: 0, R: 0 }, armR: { L: 0, R: 0 }, ik: { L: null, R: null }, calm: 1, eyePop: 0, earKick: 0, shape: { L: null, R: null }, sxPulse: 0, bodyY: 0, tuck: 0, stride: 0 };
      var idl = idleAt(A_, t), ph = A_.phase + t * TAU / 3.1 * idl.rate, hold = holdAt(A_, t);
      acc.calm = 1;
      // reactions that hold the pose lower the idle amplitude (a moving hold: breathing and drift only)
      A_.trans.forEach(function (tr) {
        var a = tr.a, d = tr.d, u0 = t - tr.t0;
        if (tr.kind === "react" || tr.kind === "take") {
          var hd = a.hold != null ? a.hold : 0, t1 = tr.t0 + (a.snap != null ? a.snap : 0.3);
          if (t >= tr.t0 && t <= t1 + hd + 0.45) acc.calm = Math.min(acc.calm, t < t1 + hd ? 0.35 : 0.35 + 0.65 * prog(t, t1 + hd, t1 + hd + 0.45));
        }
      });
      var breath = Math.sin(ph) * 0.016 * idl.amp * acc.calm;
      acc.dsy += breath;
      acc.dx += Math.sin(ph * 0.5 + 1.3) * 0.12 * idl.amp * acc.calm;
      acc.hTilt += Math.sin(ph * 0.5 + 0.4) * 1.1 * idl.amp * acc.calm;
      acc.hNod += Math.sin(ph + 0.6) * 0.05 * idl.amp * acc.calm;
      acc.armA.L += Math.sin(ph + 0.9) * 1.2 * idl.amp; acc.armA.R += Math.sin(ph + 2.3) * 1.2 * idl.amp;

      A_.trans.forEach(function (tr) {
        var a = tr.a, d = tr.d, k = tr.kind;
        if (k === "hop" || k === "jump") hopPose(A_, acc, t, tr, a);
        else if (k === "walk") walkPose(A_, acc, t, tr, a, root);
        else if (k === "reach" || k === "point" || k === "catch") reachPose(A_, acc, t, tr, a, root, k);
        else if (k === "react" || k === "take") reactPose(A_, acc, t, tr, a);
        else if (k === "turn" || k === "turnstep") turnPose(A_, acc, t, tr);
      });
      // the arms and a held prop
      if (hold && hold.w > 0) {
        var hnd = hold.hand === "both" ? ["L", "R"] : [hold.hand];
        hnd.forEach(function (hh) {
          var sgn = hh === "R" ? -1 : 1, lx = hold.hand === "both" ? sgn * 1.3 : sgn * 1.1;
          var tgt = { w: hold.w, local: [lx, -6.0 + (hold.hand === "both" ? 0.4 : 0)], shape: "hold" };
          acc.ik[hh] = acc.ik[hh] && acc.ik[hh].w > 0 ? { w: Math.min(1, Math.max(acc.ik[hh].w, hold.w)), world: acc.ik[hh].world, local: tgt.local, mixLocal: hold.w, shape: tgt.shape } : tgt;
          if (acc.ik[hh].world && hold.w > 0) acc.ik[hh].mixLocal = hold.w;
        });
      }
      var mov = { root: root, acc: acc, ph: ph, hold: hold, idl: idl, calm: acc.calm };
      return mov;
    }

    function hopPose(A_, acc, t, tr, a) {
      var q = hopTimes(a, tr.d), j = a.kind === "jump";
      if (t < q.start || t > q.end + 0.5) return;
      var ac = q.antic, sq = j ? 0.3 : 0.24;
      var crouch = t < q.fly0 ? bump(prog(t, q.start, q.fly0 + 0.0001) * 1) * 0 + ease("outC", prog(t, q.start, q.fly0 - 0.02)) : 0;
      if (t < q.fly0) {
        // anticipation: down and back, arms swing back, then the push (stretch) in the last frames
        var w = prog(t, q.start, q.fly0);
        var dn = kf([[0, 0], [0.7, 1, "outC"], [1, 0.55, "inQ"]], w);
        acc.dsy -= sq * dn; acc.lean -= (j ? 5 : 3) * dn * (a.dx >= 0 ? 1 : -1) * -1; acc.armA.L -= 24 * dn; acc.armA.R -= 24 * dn; acc.hNod += 0.35 * dn; acc.bodyY = (acc.bodyY || 0);
        acc.dsy += (w > 0.8 ? 0.2 * ease("outQ", (w - 0.8) / 0.2) : 0);
      } else if (t <= q.fly1) {
        var f = prog(t, q.fly0, q.fly1), lift = (q.h) * 4 * f * (1 - f);
        acc.lift += lift;
        acc.dsy += 0.17 * (1 - f * 1.6 > 0 ? 1 - f * 1.6 : 0) - 0.05 * Math.max(0, f * 2 - 1); // stretch rising, a touch of tuck coming down
        acc.armA.L += 70 * bump(f) + 20; acc.armA.R += 70 * bump(f) + 20; acc.lean += (a.dx >= 0 ? 1 : -1) * 4 * (1 - f); acc.tuck = Math.max(acc.tuck, bump(f));
        acc.hNod -= 0.2 * bump(f);
      } else {
        // landing: weight (a squash that grows with the fall height), then overshoot and settle
        var lw = prog(t, q.fly1, q.fly1 + q.land), heavy = clamp(q.h / 4.5, 0.5, 1.5);
        var sqv = kf([[0, 0], [0.18, 1, "outQ"], [0.55, -0.32, "inOutS"], [1, 0, "inOutS"]], lw) * (lw >= 1 ? 0 : 1);
        acc.dsy -= 0.3 * heavy * sqv; acc.lean += 1.5 * (a.dx >= 0 ? 1 : -1) * (1 - lw) * 0;
        acc.armA.L += 18 * (1 - lw); acc.armA.R += 18 * (1 - lw); acc.hNod += 0.35 * heavy * sqv;
        if (lw >= 1) { var rem = (t - q.fly1 - q.land) / 0.5; acc.dsy += rem < 1 ? 0.02 * Math.sin(rem * 9) * (1 - rem) : 0; }
      }
    }

    function walkPose(A_, acc, t, tr, a, root) {
      var t0 = tr.t0, t1 = tr.t1;
      if (t < t0 - 0.1 || t > t1 + 0.5) return;
      var rp = null;
      for (var i = 0; i < A_.root.length; i++) if (A_.root[i].a === a) rp = A_.root[i];
      if (!rp) return;
      var dist = Math.abs(rp.x1 - rp.x0), n = Math.max(2, Math.round(dist / (1.9 * A_.u))), T = (t1 - t0 - 0.1) / n, ts0 = t0 + 0.04;
      var w = prog(t, ts0, ts0 + n * T);
      var env = bump(clamp((t - t0) / Math.max(0.01, t1 - t0), 0, 1)) > 0 ? Math.min(1, Math.min((t - t0) / 0.2, (t1 - t) / 0.25)) : 0;
      env = clamp(env, 0, 1);
      var phase = (t - ts0) / T;                               // one step per unit
      var ft = phase - Math.floor(phase);
      var dirS = rp.x1 >= rp.x0 ? 1 : -1;
      acc.bodyY -= 0;                                          // (the bob goes through dsy and lift: planted feet stay planted)
      acc.lift += env * 0.14 * Math.abs(Math.sin(Math.PI * phase));
      acc.dsy += env * (-0.03 * Math.pow(Math.cos(Math.PI * phase), 2));
      acc.lean += env * dirS * 3.2 + env * Math.sin(Math.PI * phase) * 2.2;
      acc.dx += env * Math.sin(Math.PI * phase) * 0.16 * (1 - 2 * (Math.floor(phase) % 2));
      var sw = Math.sin(Math.PI * phase) * (Math.floor(phase) % 2 ? -1 : 1);
      acc.armA.L += env * 26 * sw; acc.armA.R += env * -26 * sw;
      acc.hNod += env * 0.12 * Math.abs(Math.cos(Math.PI * phase));
      acc.stride = Math.max(acc.stride, env);
    }

    function reachPose(A_, acc, t, tr, a, root, kind) {
      var t0 = tr.t0, d = tr.d, t1 = t0 + d, hand = a.hand || "R", s = hand === "R" ? -1 : 1;
      var hd = a.hold != null ? a.hold : 0.15, tail = a.recover != null ? a.recover : 0.35;
      if (t < t0 || t > t1 + tail + 0.01) return;
      var antic = Math.min(0.28 * d, 0.25), ext0 = t0 + antic, ext1 = Math.min(t1, ext0 + Math.max(0.1, (t1 - ext0) * 0.6));
      var target;
      if (a.track) { var q = propFree(a.track, t + (a.lead || 0)); target = q ? [q.x + (a.offset ? a.offset[0] * Wd : 0), q.y + (a.offset ? a.offset[1] * Ht : 0)] : null; }
      else if (a.target) target = [a.target[0] * Wd, a.target[1] * Ht];
      if (!target) return;
      var w;
      if (t < ext0) { // anticipation: draw the arm back and down, lean away, crouch a little
        var wa = ease("outC", prog(t, t0, ext0));
        w = 0;
        acc.armA[hand] -= 26 * wa; acc.dsy -= 0.07 * wa; acc.hNod += 0.1 * wa;
        var away = target[0] >= root[0] ? 1 : -1; acc.lean -= away * 3.5 * wa; acc.dx -= away * 0.35 * wa;
        acc.ik[hand] = null;
        // the head has already turned to the target
        acc.hTilt += away * 3 * wa;
      } else if (t <= t1) {
        var we = ease("outB", prog(t, ext0, ext1));
        w = clamp(we, 0, 1.12);
        var sd = target[0] >= root[0] ? 1 : -1;
        acc.lean += sd * 7 * Math.min(1, we) + 0; acc.dx += sd * 0.9 * Math.min(1, we); acc.dsy += 0.04 * Math.min(1, we);
        acc.ik[hand] = acc.ik[hand] && acc.ik[hand].w > w ? acc.ik[hand] : { w: w, world: target, shape: kind === "point" ? "point" : (kind === "catch" ? "open" : "reach"), bend: -s };
        acc.armA[hand === "R" ? "L" : "R"] += 24 * Math.min(1, we) * (sd >= 0 ? 1 : 1); // the other arm balances
        acc.hTilt += sd * 2.5 * Math.min(1, we);
        acc.earKick += 0.6 * Math.min(1, we);
      } else { // recover after the hold, with follow-through
        var wr = prog(t, t1 + hd, t1 + hd + tail), sd2 = target[0] >= root[0] ? 1 : -1;
        var back = t < t1 + hd ? 1 : 1 - ease("inOutC", wr);
        var fol = t >= t1 + hd ? Math.sin(wr * Math.PI * 1.3) * 0.08 * (1 - wr) : 0;
        acc.ik[hand] = back > 0.001 ? { w: back, world: target, shape: kind === "point" ? "point" : (kind === "catch" ? "closed" : "reach"), bend: -s } : null;
        acc.lean += sd2 * 7 * back + fol * 10; acc.dx += sd2 * 0.9 * back; acc.armA[hand === "R" ? "L" : "R"] += 24 * back;
      }
    }

    function reactPose(A_, acc, t, tr, a) {
      var t0 = tr.t0, snap = a.snap != null ? a.snap : 0.3, hd = a.hold != null ? a.hold : 0, out = a.recover != null ? a.recover : 0.45;
      var style = a.style || (tr.kind === "take" ? "take" : "slump"), t1 = t0 + snap;
      if (t < t0 || t > t1 + hd + out + 0.6) return;
      var env;
      if (t < t1) env = ease("outB", prog(t, t0, t1)); else if (t < t1 + hd) env = 1; else env = 1 - ease("inOutC", prog(t, t1 + hd, t1 + hd + out));
      var ov = t >= t1 + hd + out ? Math.sin((t - t1 - hd - out) * 12) * Math.exp(-(t - t1 - hd - out) * 6) * 0.2 : 0; // follow-through after the hold lets go
      var e = env + ov, dirS = a.dir != null ? a.dir : -1;
      if (style === "take") { // double take: recoil, eyes pop, a squash then stretch, ears kick
        acc.lean += dirS * -9 * e; acc.dsy += 0.12 * Math.min(1, e) - 0.08 * Math.max(0, e - 1); acc.eyePop += 0.35 * Math.min(1, e); acc.earKick += 1.2 * Math.min(1, e);
        acc.armA.L += 40 * e; acc.armA.R += 40 * e; acc.lift += 0.5 * bump(prog(t, t0, t0 + 0.28)); acc.hNod -= 0.3 * e; acc.dx += dirS * -0.6 * e;
      } else if (style === "slump") { // deflate: the weight comes down, the head drops, the arms hang
        acc.dsy -= 0.12 * e; acc.hNod += 0.7 * e; acc.lean += 5 * e * (a.dir || 1) * 0; acc.armA.L -= 12 * e; acc.armA.R -= 12 * e; acc.hTilt += 5 * e * (a.dir != null ? a.dir : 1);
        acc.dx += 0.2 * e;
      } else if (style === "jump-scare") {
        acc.lift += 1.4 * bump(prog(t, t0, t0 + 0.34)); acc.dsy += 0.16 * Math.min(1, e); acc.lean += dirS * -6 * e; acc.eyePop += 0.4 * Math.min(1, e); acc.armA.L += 60 * e; acc.armA.R += 60 * e; acc.earKick += 1.5;
      } else if (style === "wince") {
        acc.dsy -= 0.07 * e; acc.hNod += 0.4 * e; acc.lean += 4 * e; acc.armA.L += 20 * e; acc.armA.R += 20 * e;
      }
    }

    function turnPose(A_, acc, t, tr) {
      if (tr.kind === "turnstep") { // each authored view lands with a small pop (squash) before it settles
        if (t >= tr.t0 && t <= tr.t1) { var w = prog(t, tr.t0, tr.t1); acc.dsy += 0.05 * bump(w) * (w < 0.5 ? 1 : -0.6); acc.hTilt += 1.6 * bump(w); }
        return;
      }
      var a = tr.a, t0 = tr.t0, d = tr.d, ant = d * 0.22;
      if (t < t0 || t > t0 + d + 0.4) return;
      if (t < t0 + ant) { var wa = ease("outC", prog(t, t0, t0 + ant)); acc.lean += (tr.dirSign) * -3.5 * wa; acc.dsy -= 0.04 * wa; acc.hTilt += tr.dirSign * -2 * wa; } // anticipation: wind up the other way
      else { var wb = prog(t, t0 + ant, t0 + d + 0.3); acc.lean += tr.dirSign * -3.5 * (1 - ease("outB", wb)); acc.dsy -= 0.04 * (1 - ease("outC", wb)); }
    }

    // ---- secondary motion: the body's own past, through a damped spring
    function follow(sampler, t, omega, zeta, win, n) {
      // y(t) = sum h(k dt) * x(t - k dt), h = unit-area damped oscillator response; the spring lags and overshoots
      var dt = win / n, sum = 0, tot = 0, wd = omega * Math.sqrt(Math.max(0.01, 1 - zeta * zeta));
      for (var k = 0; k < n; k++) {
        var s = (k + 0.5) * dt, h = Math.exp(-zeta * omega * s) * (1 - Math.cos(wd * s)) * 0 + Math.exp(-zeta * omega * s) * (Math.sin(wd * s) * omega / (wd || 1));
        sum += h * sampler(t - s); tot += h;
      }
      return tot > 1e-6 ? sum / tot : sampler(t);
    }

    var cache = new Map();
    function pose(id, t) {
      var A_ = A[id];
      if (!A_) return null;
      var key = id + "@" + t;
      if (cache.has(key)) return cache.get(key);
      var u = A_.u, pr = primary(A_, t), acc = pr.acc, root = pr.root;
      var sig = function (tt) { var p = primary(A_, tt).acc; return [p.lift * 1.2 + p.dsy * 6, p.dx + p.lean * 0.12 + (rootAt(A_, tt)[0] - A_.x0) / u]; };
      // follow-through signals (vertical, horizontal) for ears, tuft, tail and the head
      var vF = follow(function (tt) { return sig(tt)[0]; }, t, 20, 0.3, 0.45, 9), hF = follow(function (tt) { return sig(tt)[1]; }, t, 15, 0.38, 0.5, 9);
      var vNow = sig(t)[0], hNow = sig(t)[1];
      var ev = emoAt(A_, t), ga = gazeAt(A_, t), hold = pr.hold;
      var yawB = yawAt(A_.yawB, t), yawH = yawAt(A_.yawH, t);
      var emo = ev.vec;
      var blink = blinkAt(A_, t);
      var sy = clamp(1 + acc.dsy + emo.squash * 0 - emo.slump * 0.07 + emo.bounce * 0.012 * Math.sin(pr.ph * 3), 0.5, 1.7);
      var tremble = emo.tremble * 0.12 * Math.sin(t * 61 + A_.phase), lean = acc.lean + emo.lean * 1 + tremble * 6;
      var pz = {
        id: id, t: t, u: u, root: { x: root[0], y: root[1] }, lift: acc.lift + emo.bounce * 0.2 * Math.max(0, Math.sin(pr.ph * 3)) * pr.calm,
        sy: sy, sx: 1 / Math.sqrt(sy), lean: lean, dx: acc.dx + tremble * 0.6, tuck: acc.tuck, stride: acc.stride,
        yawBody: yawB, yawHead: yawH,
        hTilt: acc.hTilt + emo.tilt + (vF - vNow) * 0 + (hF - hNow) * 2.2 + ga.x * 3.5 * ga.head, hNod: acc.hNod + emo.nod * 0.9 + ga.y * 0.45 * ga.head + (vF - vNow) * 0.12 + emo.slump * 0.4, hDx: ga.x * 0.55 * ga.head + (hF - hNow) * 0.18,
        gaze: { x: ga.x, y: ga.y }, blink: blink,
        ear: { L: emo.earDroop * 38 + (vF - vNow) * 7 + (hF - hNow) * 6 + acc.earKick * -18 * (emo.earDroop > 0 ? 0.3 : 1), R: emo.earDroop * 38 + (vF - vNow) * 7 - (hF - hNow) * 6 + acc.earKick * -18 * (emo.earDroop > 0 ? 0.3 : 1) },
        tuft: emo.tuftDroop * 30 + (vF - vNow) * 12 + (hF - hNow) * 14 + Math.sin(pr.ph * 1.5) * 1.5, tail: (hF - hNow) * 14 + Math.sin(t * 5 + A_.phase) * 4 * (0.4 + acc.stride) + (vF - vNow) * 6,
        arms: { L: { angle: 14 + acc.armA.L + emo.slump * -4, reach: 0.82, ik: acc.ik.L }, R: { angle: 14 + acc.armA.R + emo.slump * -4, reach: 0.82, ik: acc.ik.R } },
        emotion: emo, emotionName: ev.name, emoAge: ev.age, eyePop: acc.eyePop,
        hold: hold, calm: pr.calm,
        feet: { L: footAt(A_, "L", t), R: footAt(A_, "R", t) },
        light: { x: 0, y: 0 },
      };
      if (cache.size > 5000) cache.clear();
      cache.set(key, pz);
      return pz;
    }

    return {
      actors: A, props: P, problems: problems, width: Wd, height: Ht,
      pose: pose, footAt: function (id, side, t) { return footAt(A[id], side, t); }, rootAt: function (id, t) { return rootAt(A[id], t); },
      propAt: propFree, propZ: propZ,
      feetSchedule: function (id) { return A[id].feet; },
      events: function () { return acts.map(function (a) { return { actor: a.actor, kind: a.kind, at: a.at, duration: a.duration != null ? a.duration : 0.5 }; }); },
      // the extreme poses of every action, in time order: the frames a contact strip shows
      extremes: function () {
        var out = [];
        acts.forEach(function (a) {
          var d = a.duration != null ? a.duration : 0.5, t0 = a.at, t1 = a.at + d, add = function (t, label) { out.push({ t: +t.toFixed(3), label: label, actor: a.actor, kind: a.kind }); };
          if (a.kind === "hop" || a.kind === "jump") { var q = hopTimes(a, d); add(q.start + q.antic * 0.85, a.kind + " anticipation"); add((q.fly0 + q.fly1) / 2, a.kind + " apex"); add(q.fly1 + 0.18 * q.land, a.kind + " landing squash"); }
          else if (a.kind === "reach" || a.kind === "point" || a.kind === "catch") { var an = Math.min(0.28 * d, 0.25); add(t0 + an * 0.95, a.kind + " anticipation"); add(Math.min(t1, t0 + an + Math.max(0.1, (d - an) * 0.6)), a.kind + " extension"); }
          else if (a.kind === "react" || a.kind === "take") { var sn = a.snap != null ? a.snap : 0.3; add(t0 + sn, (a.style || a.kind) + " peak"); if (a.hold) add(t0 + sn + a.hold * 0.55, "reaction hold"); }
          else if (a.kind === "emote") add(t1, "emotion: " + a.emotion);
          else if (a.kind === "walk") { var ts = t0 + 0.04, n = Math.max(2, Math.round(Math.abs((a.dx || 0) * Wd) / (1.9 * (A[a.actor] ? A[a.actor].u : 20)))), T = (d - 0.1) / n; add(ts + T * 0.45, "walk contact"); add(ts + T * 1.45, "walk passing"); }
          else if (a.kind === "hold" || a.kind === "catch") add(t0 + (a.grab != null ? a.grab : 0.28), "grab " + (a.prop || ""));
          else if (a.kind === "turn" && A[a.actor]) { A[a.actor].yawB.forEach(function (e) { if (e[0] >= t0 && e[0] <= t1 + 0.2) add(e[0] + 0.05, "view " + e[1] + "\u00b0"); }); }
        });
        out.sort(function (x, y) { return x.t - y.t; });
        var ded = [];
        out.forEach(function (e) { if (!ded.length || e.t - ded[ded.length - 1].t > 0.07) ded.push(e); });
        return ded;
      },
    };
  }

  // an action list sanity pass that needs no actors (used by check and the CLI)
  function checkActions(actions) {
    var p = [];
    (actions || []).forEach(function (a, i) {
      if (!a || typeof a !== "object") return p.push("action " + i + " is not an object");
      if (KINDS.indexOf(a.kind) < 0) p.push("action " + i + ": unknown kind " + a.kind);
      if (!isFinite(a.at)) p.push("action " + i + " (" + a.kind + "): at must be seconds");
      if (a.kind === "walk" && a.dx == null && !(a.to && a.to.x != null)) p.push("action " + i + " (walk): dx or to.x is required");
      if ((a.kind === "reach" || a.kind === "point") && !a.target && !a.track) p.push("action " + i + " (" + a.kind + "): a target [x, y] (frame fractions) or track <prop> is required");
      if (a.kind === "turn" && a.to == null) p.push("action " + i + " (turn): to is required (a view name or degrees)");
    });
    return p;
  }

  var api = { createTimeline: createTimeline, checkActions: checkActions, KINDS: KINDS, VIEWS: VIEWS, VIEW_YAW: VIEW_YAW, ease: ease, kf: kf, bump: bump, lerp: lerp, clamp: clamp, blendEmo: blendEmo, E: E };
  K.gestures = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
