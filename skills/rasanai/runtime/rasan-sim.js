/* RasanSim: cursor-driven motion that is a simulation (a magnet pulling dots, a trail that follows, a jelly that wobbles,
 * a rope on a pin), made seek-safe by PRE-SIMULATING it.
 *
 * A live physics loop depends on the frames it saw before; a renderer that seeks (the frame at 4.2 s first, then 1.0 s)
 * would get a different answer. So the whole run is stepped once, up front, at a fixed 240 Hz from a seeded start, into a
 * table, and every frame is a SAMPLE of that table by time (linear between two neighbouring steps). The same time gives the
 * same numbers in any order, any number of times. No Math.random (a seeded hash), no wall clock, no rAF.
 *
 *   <script src="../../assets/rasan-sim/rasan-sim.js"></script>      (no GSAP needed to bake; GSAP only for bind)
 *   var cursorAt = RasanSim.path([[0, 200, 800], [1.2, 900, 500], [2.4, 1500, 700]]);        // or: function (t) { return cur.pos(t); }  (RasanUI cursor)
 *   var m = RasanSim.magnet(cursorAt, dots, { duration: 4, radius: 220, pull: 1400, home: 22, damp: 5, seed: "film/04" });
 *   RasanSim.bind(tl, m, function (s) { dotEls.forEach(function (e, i) { e.style.translate = s.x(i) + "px " + s.y(i) + "px"; }); }, { at: 0 });
 *   RasanSim.follow(cursorAt, { n: 6, k: 90, damp: 12, duration: 4 })   // a chain: each follower springs to the one before it
 *   RasanSim.jelly(cursorAt, { k: 140, damp: 9, stretch: 0.0016, duration: 4 })   // -> x, y, sx, sy, rot per time (squash and stretch along the velocity)
 *   RasanSim.verlet(cursorAt, { n: 14, len: 22, gravity: 900, iter: 6, duration: 4 }) // a rope pinned to the cursor
 *
 * Every sim returns a sampler: s.at(t) -> a state object whose getters x(i), y(i), vx(i), vy(i) read body i at time t.
 * Time before 0 is the start state; after `duration` it is the last step (the sim has settled or you stop using it).
 * The path (the cursor's route) is itself a pure function of time, so the whole thing is deterministic.
 * Reference: references/scale-dive.md and cinematography.md (cursor sims); the idea is onetake's, the code is ours.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.RasanSim = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var VERSION = "1.0.0";
  function need(c, m) { if (!c) throw new Error("RasanSim: " + m); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var a = hashStr(seed == null ? "rasan-sim" : seed);
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // a path through [[t, x, y], ...] (Catmull-Rom through the points, clamped before the first and after the last), or any f(t) -> [x, y]
  function path(pts) {
    if (typeof pts === "function") return pts;
    need(pts && pts.length >= 2, "path: give at least two [t, x, y] points");
    var P = pts.slice().sort(function (a, b) { return a[0] - b[0]; });
    return function (t) {
      if (t <= P[0][0]) return [P[0][1], P[0][2]];
      if (t >= P[P.length - 1][0]) return [P[P.length - 1][1], P[P.length - 1][2]];
      var i = 0; while (i < P.length - 2 && t > P[i + 1][0]) i++;
      var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)], u = (t - p1[0]) / (p2[0] - p1[0]), u2 = u * u, u3 = u2 * u;
      function cr(a, b, c, d) { return 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3); }
      return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
    };
  }

  // bake: step a state vector at `hz` for `duration` seconds into a table of frames. step(state, t, dt, i) mutates state in place.
  // The state holds `stride` numbers per body: x, y, vx, vy by default.
  function bake(o) {
    var hz = o.hz || 240, dur = +o.duration, n = o.n, stride = o.stride || 4, steps = Math.ceil(dur * hz) + 1, dt = 1 / hz;
    need(dur > 0 && n > 0, "bake: duration and n are required");
    var st = o.init(), table = new Float64Array(steps * n * stride), row = n * stride;
    for (var i = 0; i < steps; i++) {
      if (i > 0) o.step(st, i * dt, dt);
      table.set(st, i * row);
    }
    function view(t) {
      var f = clamp(t * hz, 0, steps - 1), a = Math.floor(f), b = Math.min(steps - 1, a + 1), k = f - a, tmp = new Float64Array(row);
      for (var j = 0; j < row; j++) tmp[j] = table[a * row + j] + (table[b * row + j] - table[a * row + j]) * k;
      return tmp;
    }
    return {
      version: VERSION, hz: hz, duration: dur, n: n, steps: steps,
      at: function (t) {
        var v = view(t);
        return { raw: v, x: function (j) { return v[j * stride]; }, y: function (j) { return v[j * stride + 1]; }, vx: function (j) { return v[j * stride + 2]; }, vy: function (j) { return v[j * stride + 3]; }, extra: function (j, k) { return v[j * stride + 4 + k]; } };
      },
    };
  }

  // magnet: bodies [{ x, y }] sit at home; the pointer pulls those within `radius` toward it (or pushes, pull < 0) with a falloff,
  // a spring brings each home, and drag damps. Same inputs, same dots, every time.
  function magnet(target, bodies, o) {
    o = o || {}; need(bodies && bodies.length, "magnet: give bodies [{ x, y }]");
    var tg = path(target), R = o.radius || 200, pull = o.pull != null ? o.pull : 1200, home = o.home != null ? o.home : 20, damp = o.damp != null ? o.damp : 5, jit = o.jitter != null ? o.jitter : 0, r = rng(o.seed), n = bodies.length;
    var jx = bodies.map(function () { return (r() * 2 - 1) * jit; }), jy = bodies.map(function () { return (r() * 2 - 1) * jit; });
    return bake({
      hz: o.hz, duration: o.duration, n: n,
      init: function () { var s = new Float64Array(n * 4); bodies.forEach(function (b, i) { s[i * 4] = b.x; s[i * 4 + 1] = b.y; }); return s; },
      step: function (s, t, dt) {
        var p = tg(t);
        for (var i = 0; i < n; i++) {
          var x = s[i * 4], y = s[i * 4 + 1], vx = s[i * 4 + 2], vy = s[i * 4 + 3];
          var dx = p[0] - x, dy = p[1] - y, d = Math.sqrt(dx * dx + dy * dy) || 1e-6, ax = 0, ay = 0;
          if (d < R) { var f = pull * (1 - d / R) * (1 - d / R); ax += dx / d * f; ay += dy / d * f; }
          ax += (bodies[i].x + jx[i] - x) * home; ay += (bodies[i].y + jy[i] - y) * home;
          ax -= vx * damp; ay -= vy * damp;
          vx += ax * dt; vy += ay * dt; s[i * 4] = x + vx * dt; s[i * 4 + 1] = y + vy * dt; s[i * 4 + 2] = vx; s[i * 4 + 3] = vy;
        }
      },
    });
  }

  // follow: n followers; follower 0 springs toward the target, follower i toward follower i-1 (stiffness k, damping damp): a trail
  // whose lag and overshoot come from the spring, not from a delay. Body i is the i-th follower.
  function follow(target, o) {
    o = o || {}; var tg = path(target), n = o.n || 5, k = o.k != null ? o.k : 90, damp = o.damp != null ? o.damp : 12, p0 = tg(0);
    return bake({
      hz: o.hz, duration: o.duration, n: n,
      init: function () { var s = new Float64Array(n * 4); for (var i = 0; i < n; i++) { s[i * 4] = p0[0]; s[i * 4 + 1] = p0[1]; } return s; },
      step: function (s, t, dt) {
        var p = tg(t);
        for (var i = 0; i < n; i++) {
          var tx = i === 0 ? p[0] : s[(i - 1) * 4], ty = i === 0 ? p[1] : s[(i - 1) * 4 + 1], kk = k * (1 - 0.06 * i);
          var ax = (tx - s[i * 4]) * kk - s[i * 4 + 2] * damp, ay = (ty - s[i * 4 + 1]) * kk - s[i * 4 + 3] * damp;
          s[i * 4 + 2] += ax * dt; s[i * 4 + 3] += ay * dt; s[i * 4] += s[i * 4 + 2] * dt; s[i * 4 + 1] += s[i * 4 + 3] * dt;
        }
      },
    });
  }

  // jelly: one body on a spring to the target. Extra channels per body: sx, sy (stretch along the velocity, squash across it,
  // area kept) and rot (the velocity's angle, degrees). s.extra(0, 0) = sx, extra(0, 1) = sy, extra(0, 2) = rot.
  function jelly(target, o) {
    o = o || {}; var tg = path(target), k = o.k != null ? o.k : 140, damp = o.damp != null ? o.damp : 9, st = o.stretch != null ? o.stretch : 0.0016, maxS = o.max != null ? o.max : 1.6, p0 = tg(0);
    return bake({
      hz: o.hz, duration: o.duration, n: 1, stride: 7,
      init: function () { var s = new Float64Array(7); s[0] = p0[0]; s[1] = p0[1]; s[4] = 1; s[5] = 1; return s; },
      step: function (s, t, dt) {
        var p = tg(t), ax = (p[0] - s[0]) * k - s[2] * damp, ay = (p[1] - s[1]) * k - s[3] * damp;
        s[2] += ax * dt; s[3] += ay * dt; s[0] += s[2] * dt; s[1] += s[3] * dt;
        var sp = Math.sqrt(s[2] * s[2] + s[3] * s[3]), a = clamp(1 + sp * st, 1, maxS);
        s[4] = a; s[5] = 1 / a; s[6] = sp > 5 ? Math.atan2(s[3], s[2]) * 180 / Math.PI : s[6];
      },
    });
  }

  // verlet: a rope of n points `len` px apart, the first pinned to the target, gravity, `iter` constraint passes, light damping.
  function verlet(target, o) {
    o = o || {}; var tg = path(target), n = o.n || 12, len = o.len || 20, g = o.gravity != null ? o.gravity : 900, iter = o.iter || 6, damp = o.damp != null ? o.damp : 0.995, p0 = tg(0);
    var prev = new Float64Array(n * 2);
    return bake({
      hz: o.hz, duration: o.duration, n: n,
      init: function () { var s = new Float64Array(n * 4); for (var i = 0; i < n; i++) { s[i * 4] = p0[0]; s[i * 4 + 1] = p0[1] + i * len; prev[i * 2] = s[i * 4]; prev[i * 2 + 1] = s[i * 4 + 1]; } return s; },
      step: function (s, t, dt) {
        var p = tg(t), i, it;
        for (i = 1; i < n; i++) {
          var x = s[i * 4], y = s[i * 4 + 1], vx = (x - prev[i * 2]) * damp, vy = (y - prev[i * 2 + 1]) * damp;
          prev[i * 2] = x; prev[i * 2 + 1] = y; s[i * 4] = x + vx; s[i * 4 + 1] = y + vy + g * dt * dt;
        }
        for (it = 0; it < iter; it++) {
          s[0] = p[0]; s[1] = p[1];
          for (i = 0; i < n - 1; i++) {
            var dx = s[(i + 1) * 4] - s[i * 4], dy = s[(i + 1) * 4 + 1] - s[i * 4 + 1], d = Math.sqrt(dx * dx + dy * dy) || 1e-6, diff = (d - len) / d, w0 = i === 0 ? 0 : 0.5, w1 = i === 0 ? 1 : 0.5;
            s[i * 4] += dx * diff * w0; s[i * 4 + 1] += dy * diff * w0; s[(i + 1) * 4] -= dx * diff * w1; s[(i + 1) * 4 + 1] -= dy * diff * w1;
          }
        }
        s[0] = p[0]; s[1] = p[1];
        for (i = 0; i < n; i++) { s[i * 4 + 2] = (s[i * 4] - prev[i * 2]) / dt; s[i * 4 + 3] = (s[i * 4 + 1] - prev[i * 2 + 1]) / dt; }
      },
    });
  }

  // bind: draw a sim on a paused GSAP timeline. apply(state) runs on every render with the state at the timeline's local time
  // (progress of a linear tween times `duration`): a pure function of time, so seeking cannot change it.
  function bind(tl, sim, apply, o) {
    o = o || {}; need(root.gsap && tl && typeof tl.add === "function", "bind: GSAP and a timeline are needed");
    var at = o.at || 0, d = o.dur || sim.duration, v = 0, p = {};
    Object.defineProperty(p, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; apply(sim.at(x * d), x * d); } });
    tl.add(root.gsap.fromTo(p, { p: 0 }, { p: 1, duration: d, ease: "none", immediateRender: false }), at);
    return { start: at, end: at + d };
  }

  return { version: VERSION, path: path, bake: bake, magnet: magnet, follow: follow, jelly: jelly, verlet: verlet, bind: bind };
});
