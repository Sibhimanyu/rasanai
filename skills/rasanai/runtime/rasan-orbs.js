/* RasanOrbs: "the AI is working" motifs for HyperFrames compositions. Nine dotted-orb states (working, searching, solving,
 * listening, connecting, weaving, composing, breathing, shaping) in two separately tuned sizes (64 and 20), drawn on a plain 2D
 * canvas, monochrome by default with an optional brand colour.
 *
 * The motion is a port of thinking-orbs by Jakub Antalik (MIT, github.com/Jakubantalik/thinking-orbs, v0.3.1): the geometry
 * functions and the tuned presets are its own, ported from TypeScript to vanilla JS without changing a number (the test checks
 * the port against the library's golden vectors to 1e-4). Credit and licence: third_party/thinking-orbs/.
 * What RasanAI added: a seek-safe clock (the library runs on rAF and performance.now), seeded/hashed-only randomness (the library
 * already had none at render), timed state changes with a dissolve between states, a brand-colour ink, and a "hero" size.
 *
 * One clock: a frame is a PURE function of the scene's timeline time T (and the config). The kit adds one linear "clock" tween to the
 * paused timeline you pass in; its setter reads tl.time() and redraws. Seek anywhere, in any order, any number of times: same pixels.
 * No Math.random, no wall clock, no rAF. Without a timeline pass `time` (a getter) or call orb.seek(T) yourself (a still: T=0).
 *
 *   <script src="assets/gsap/gsap.min.js"></script>          (HyperFrames' GSAP; optional for stills)
 *   <script src="assets/rasan-orbs/rasan-orbs.js"></script>
 *
 *   var tl = gsap.timeline({ paused: true });
 *   var orb = RasanOrbs.mount("#thinking", { state: "searching", size: 64, tl: tl, at: 0, duration: 6 });
 *   orb.to("composing", 2.4, 0.5);               // at 2.4 s dissolve into composing over 0.5 s
 *   // brand colour, light ground, hero size (scales the 64 design), delayed start:
 *   RasanOrbs.mount(el, { state: "working", size: "hero", color: "#2f6bff", theme: "light", t0: 1.2, tl: tl, duration: 6 });
 *
 * Reference: references/orbs.md.
 */
(function (root) {
  "use strict";
  var VERSION = "1.0.0";
  var PI = Math.PI;

  function need(c, m) { if (!c) throw new Error("RasanOrbs: " + m); }
  function opt(o, k, d) { return o && o[k] !== undefined && o[k] !== null ? o[k] : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ===================================================================== engine (thinking-orbs, MIT)
  // ---- core: shared primitives
  function lerp(a, b, f) { return a + (b - a) * f; }
  function frac(x) { return x - Math.floor(x); }
  function hashD(a, b) { var h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return h - Math.floor(h); }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hashD(xi, yi), b = hashD(xi + 1, yi), c = hashD(xi, yi + 1), d = hashD(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fibDir(i, n) {
    var golden = PI * (3 - Math.sqrt(5)), y = 1 - (2 * (i + 0.5)) / n, rad = Math.sqrt(1 - y * y), a = i * golden;
    return [rad * Math.cos(a), y, rad * Math.sin(a)];
  }
  function angleDelta(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function makeProj(yaw, tilt, cx, cy, scale) {
    var st = Math.sin(tilt), ct = Math.cos(tilt), sy = Math.sin(yaw), cyw = Math.cos(yaw);
    return function (x, y, z) {
      var x1 = x * cyw + z * sy, z1 = -x * sy + z * cyw, y1 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      return [cx + x1 * scale, cy - y1 * scale, z2];
    };
  }
  // drop invisible marks, clamp radii to the mode's floor, z-sort far to near (a stable sort, so a frame is the same list every time)
  function finalizeFrame(dots, lines, rMin) {
    if (rMin === undefined) rMin = 0.3;
    var visible = [];
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      if ((d.a === undefined ? 1 : d.a) < 0.02) continue;
      d.r = Math.max(rMin, d.r);
      visible.push(d);
    }
    visible.sort(function (a, b) { return a.z - b.z; });
    return { dots: visible, lines: lines.filter(function (l) { return (l.a === undefined ? 1 : l.a) >= 0.02; }) };
  }
  // dot radii were tuned for a 300pt frame; sub-linear scaling keeps small spinners legible
  function radiusScale(size, pow) { return Math.pow(size / 300, pow); }
  function g(o, k, d) { return o[k] === undefined ? d : o[k]; }

  // ---- lattice modes: globe (searching), rubik (solving), wave (listening)
  function solveCycle(time, count, slotDur, rest) {
    var cyc = 2 * count * slotDur + rest, tc = time % cyc, amount = [], active = -1, i;
    for (i = 0; i < count; i++) amount.push(0);
    if (tc < 2 * count * slotDur) {
      var slot = Math.floor(tc / slotDur), p = (tc - slot * slotDur) / slotDur, cl = Math.min(1, p / 0.7), ep = 1 - Math.pow(1 - cl, 3);
      if (slot < count) { for (i = 0; i < slot; i++) amount[i] = 1; amount[slot] = ep; active = slot; }
      else { var u = 2 * count - 1 - slot; for (i = 0; i < u; i++) amount[i] = 1; amount[u] = 1 - ep; active = u; }
    }
    return { amount: amount, active: active };
  }
  function applyMoves(pt3, moves, sc) {
    var x = pt3[0], y = pt3[1], z = pt3[2], inActive = false;
    for (var i = 0; i < moves.length; i++) {
      if (sc.amount[i] <= 0) continue;
      var mv = moves[i], coord = mv.axis === 0 ? x : mv.axis === 1 ? y : z;
      if (coord < mv.lo || coord >= mv.hi) continue;
      if (i === sc.active) inActive = true;
      var a = mv.ang * sc.amount[i], ca = Math.cos(a), sa = Math.sin(a);
      if (mv.axis === 0) { var y2 = y * ca - z * sa; z = y * sa + z * ca; y = y2; }
      else if (mv.axis === 1) { var x2 = x * ca + z * sa; z = -x * sa + z * ca; x = x2; }
      else { var x3 = x * ca - y * sa; y = x * sa + y * ca; x = x3; }
    }
    return [x, y, z, inActive];
  }
  function makeMoves(count) {
    var moves = [];
    for (var i = 0; i < count; i++) {
      var axis = Math.min(2, Math.floor(hashD(i, 2.3) * 3)), lo = -1.0 + 0.5 * Math.min(3, Math.floor(hashD(i, 5.9) * 4)), dir = hashD(i, 7.7) < 0.5 ? 1 : -1;
      moves.push({ axis: axis, lo: lo, hi: lo + 0.5, ang: (dir * PI) / 2 });
    }
    return moves;
  }

  function frameGlobe(size, t, o) {
    var spin = 0.5, cx = size / 2, cy = size / 2, radius = (size / 2) * 0.82, tilt = 0.4 + 0.06 * Math.sin(t * 0.35);
    var pt = makeProj(t * spin, tilt, cx, cy, radius);
    var scan = t * (spin + (1.7 - spin) * g(o, "scanMul", 1));
    var rs = radiusScale(size, g(o, "rsPow", 0.6)), dimBase = g(o, "dimBase", 1), dots = [];
    var latRings = g(o, "latRings", 17), lonDensity = g(o, "lonDensity", 44);
    for (var li = 0; li <= latRings; li++) {
      var lat = -PI / 2 + (li / latRings) * PI, cosLat = Math.cos(lat), sinLat = Math.sin(lat);
      var lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
      for (var lj = 0; lj < lonCount; lj++) {
        var lon = (lj / lonCount) * 2 * PI;
        var p = pt(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)), z = p[2], depth = (z + 1) / 2;
        var d = angleDelta(lon + t * spin, scan), boost = Math.exp(-(d * d) / 0.18) * Math.max(0, z);
        dots.push({ x: p[0], y: p[1], z: z, r: (g(o, "rBase", 0.6) + g(o, "rDepth", 1.7) * depth + g(o, "rBoost", 1) * boost) * rs, white: g(o, "inkFar", 0.62) - g(o, "inkSpan", 0.54) * depth, a: dimBase + (1 - dimBase) * Math.min(1, boost) });
      }
    }
    return finalizeFrame(dots, [], o.rMin);
  }

  function frameRubik(size, t, o) {
    var cx = size / 2, cy = size / 2, R = (size / 2) * 0.82;
    var pt = makeProj(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), cx, cy, R);
    var rs = radiusScale(size, g(o, "rsPow", 0.6)), moveCount = g(o, "moveCount", 14), moves = makeMoves(moveCount), sc = solveCycle(t, moveCount, 0.42, 1.2), dots = [];
    var latRings = g(o, "latRings", 15), lonDensity = g(o, "lonDensity", 40);
    for (var li = 0; li <= latRings; li++) {
      var lat = -PI / 2 + (li / latRings) * PI, cosLat = Math.cos(lat), sinLat = Math.sin(lat);
      var lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
      for (var lj = 0; lj < lonCount; lj++) {
        var lon = (lj / lonCount) * 2 * PI;
        var m = applyMoves([cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)], moves, sc), inActive = m[3];
        var p = pt(m[0], m[1], m[2]), zr = p[2], depth = (zr + 1) / 2;
        dots.push({ x: p[0], y: p[1], z: zr, r: (g(o, "rBase", 0.6) + g(o, "rDepth", 1.7) * depth + (inActive ? g(o, "rActive", 0.3) : 0)) * rs, white: g(o, "inkFar", 0.62) - g(o, "inkSpan", 0.54) * depth - (inActive ? 0.14 : 0) });
      }
    }
    return finalizeFrame(dots, [], o.rMin);
  }

  function frameWave(size, t, o) {
    var cx = size / 2, cy = size / 2, R = (size / 2) * 0.874, pt = makeProj(t * 0.18, 0.38, cx, cy, 1);
    var rs = radiusScale(size, g(o, "rsPow", 0.6)), dots = [], rings = g(o, "rings", 15), lonDensity = g(o, "lonDensity", 40);
    for (var ri = 0; ri <= rings; ri++) {
      var lat = -PI / 2 + (ri / rings) * PI, cosLat = Math.cos(lat), sinLat = Math.sin(lat);
      var w = 0.62 * Math.sin(t * 2.1 - ri * 0.52) + 0.38 * Math.sin(t * 1.27 + ri * 0.83), rr = R * (0.88 + 0.105 * w);
      var lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
      for (var lj = 0; lj < lonCount; lj++) {
        var lon = (lj / lonCount) * 2 * PI;
        var p = pt(cosLat * Math.cos(lon) * rr, sinLat * rr, cosLat * Math.sin(lon) * rr), z = p[2], depth = (z / R + 1) / 2, crest = Math.max(0, w);
        dots.push({ x: p[0], y: p[1], z: z, r: (g(o, "rBase", 0.6) + g(o, "rDepth", 1.7) * depth) * (1 + 0.4 * crest) * rs, white: 0.66 - 0.56 * depth - 0.1 * crest });
      }
    }
    return finalizeFrame(dots, [], o.rMin);
  }

  // ---- orbits (working): particles on tilted orbits, no nucleus
  function frameOrbits(size, t, o) {
    var cx = size / 2, cy = size / 2, R = (size / 2) * 0.82, pt = makeProj(t * 0.12, 0.3, cx, cy, 1);
    var rs = radiusScale(size, g(o, "rsPow", 0.6)), dots = [], orbitN = g(o, "orbitN", 12), ghostN = g(o, "ghostN", 40), particles = g(o, "particles", 3);
    for (var orb = 0; orb < orbitN; orb++) {
      var h1 = hashD(orb, 1.7), h2 = hashD(orb, 5.2), h3 = hashD(orb, 8.9), ro = R * (0.45 + 0.52 * h1), th = h1 * 2 * PI, phi = Math.acos(2 * h2 - 1);
      var nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
      var ux = -ny, uy = nx, uz = 0, ul = Math.max(1e-6, Math.sqrt(ux * ux + uy * uy));
      ux /= ul; uy /= ul;
      var vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux, speed = (0.25 + 0.55 * h3) * (h3 > 0.5 ? 1 : -1), k, a, p, z, depth;
      for (k = 0; k < ghostN; k++) {
        a = (k / ghostN) * 2 * PI;
        p = pt((ux * Math.cos(a) + vx * Math.sin(a)) * ro, (uy * Math.cos(a) + vy * Math.sin(a)) * ro, (uz * Math.cos(a) + vz * Math.sin(a)) * ro);
        z = p[2]; depth = (z / ro + 1) / 2;
        dots.push({ x: p[0], y: p[1], z: z, r: g(o, "ghostR", 0.9) * rs, white: 0.72, a: g(o, "ghostA", 0.5) * (0.4 + 0.6 * depth) });
      }
      for (var m = 0; m < particles; m++) {
        a = t * speed + (m / particles) * 2 * PI + h2 * 6;
        p = pt((ux * Math.cos(a) + vx * Math.sin(a)) * ro, (uy * Math.cos(a) + vy * Math.sin(a)) * ro, (uz * Math.cos(a) + vz * Math.sin(a)) * ro);
        z = p[2]; depth = (z / ro + 1) / 2;
        dots.push({ x: p[0], y: p[1], z: z, r: (g(o, "partR", 1.2) + g(o, "partRDepth", 1.6) * depth) * rs, white: 0.3 - 0.22 * depth });
      }
    }
    return finalizeFrame(dots, [], o.rMin);
  }

  // ---- braid (weaving): three strands plait around the sphere
  function frameBraid(size, t, o) {
    var cx = size / 2, cy = size / 2, R = (size / 2) * 0.76, pt = makeProj(t * 0.4, 0.3, cx, cy, 1), rs = radiusScale(size, g(o, "rsPow", 0.6)), dots = [], ghostN = g(o, "ghostN", 150), i, p, depth;
    for (i = 0; i < ghostN; i++) {
      var d = fibDir(i, ghostN);
      p = pt(d[0] * R, d[1] * R, d[2] * R); depth = (p[2] / R + 1) / 2;
      dots.push({ x: p[0], y: p[1], z: p[2], r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
    }
    var strandN = g(o, "strandN", 52), turns = g(o, "turns", 3);
    for (var s = 0; s < 3; s++) {
      var phase = (s / 3) * 2 * PI;
      for (i = 0; i < strandN; i++) {
        var u = (frac(i / strandN + t * 0.045) * 2 - 1) * 0.96, surf = Math.sqrt(Math.max(0, 1 - u * u)), endFade = Math.min(1, (1 - Math.abs(u)) / 0.1);
        var a = u * PI * turns + phase, weave = 1 + 0.075 * Math.sin(u * PI * turns * 2 + phase * 2 + t * 0.8), rr = surf * R * weave;
        p = pt(Math.cos(a) * rr, u * R * weave, Math.sin(a) * rr); depth = (p[2] / R + 1) / 2;
        dots.push({ x: p[0], y: p[1], z: p[2], r: (g(o, "rBase", 1.2) + g(o, "rDepth", 1.8) * depth) * rs, white: 0.55 - 0.45 * depth, a: endFade * (0.45 + 0.55 * depth) });
      }
    }
    return finalizeFrame(dots, [], o.rMin);
  }

  // ---- ribbon (composing) and ring (breathing, the faceOn flag): a sash of strands on a great circle
  function frameRibbon(size, t, o) {
    var cx = size / 2, cy = size / 2, R = (size / 2) * 0.78, spin = g(o, "spin", 1), camTilt = 0.3;
    var pt = makeProj(t * 0.1 * spin, camTilt, cx, cy, 1), rs = radiusScale(size, g(o, "rsPow", 0.6)), dots = [], ghostN = g(o, "ghostN", 150), i, p, depth;
    for (i = 0; i < ghostN; i++) {
      var d = fibDir(i, ghostN);
      p = pt(d[0] * R, d[1] * R, d[2] * R); depth = (p[2] / R + 1) / 2;
      dots.push({ x: p[0], y: p[1], z: p[2], r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
    }
    var ya = t * 0.24 * spin, ta = o.faceOn ? -camTilt : 0.55 + 0.3 * Math.sin(t * 0.18) * spin;
    var ux = Math.cos(ya), uy = 0, uz = Math.sin(ya), vx = -uz * Math.sin(ta), vy = Math.cos(ta), vz = ux * Math.sin(ta);
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var wobAmp = 0.23 * g(o, "wobMul", 1), baseR = o.faceOn ? R / (1 + 0.85 * wobAmp) : R;
    var baseLanes = g(o, "lanes", 5), segs = g(o, "segs", 88), lanes = Math.max(1, Math.round(baseLanes * g(o, "bandMul", 1)));
    for (var w = 0; w < lanes; w++) {
      var laneOff = (w - (lanes - 1) / 2) * 0.075, edge = Math.abs(w - (lanes - 1) / 2) / Math.max(1, (lanes - 1) / 2);
      for (var k = 0; k < segs; k++) {
        var a = (k / segs) * 2 * PI;
        var wob = (0.16 * Math.sin(a * 3 - t * 1.7 + w * 0.22) + 0.07 * Math.sin(a * 5 + t * 1.1)) * g(o, "wobMul", 1);
        var radial = o.faceOn ? 1 + wob : 1, off = o.faceOn ? laneOff : laneOff + wob;
        var x = ux * Math.cos(a) + vx * Math.sin(a) + nx * off, y = uy * Math.cos(a) + vy * Math.sin(a) + ny * off, z = uz * Math.cos(a) + vz * Math.sin(a) + nz * off;
        var l = Math.sqrt(x * x + y * y + z * z), rr = baseR * radial;
        p = pt((x / l) * rr, (y / l) * rr, (z / l) * rr); depth = (p[2] / R + 1) / 2;
        dots.push({ x: p[0], y: p[1], z: p[2], r: (g(o, "rBase", 1.1) + g(o, "rDepth", 1.7) * depth) * (1 - 0.25 * edge) * rs, white: 0.52 - 0.44 * depth + 0.18 * edge, a: 0.4 + 0.6 * depth });
      }
    }
    return finalizeFrame(dots, [], o.rMin);
  }

  // ---- web (connecting): a constellation wires itself; packets run between node pairs
  function frameWeb(size, t, o) {
    var cx = size / 2, cy = size / 2, R = (size / 2) * 0.8 * g(o, "spread", 1), pt = makeProj(t * 0.12, 0.32, cx, cy, R), rs = radiusScale(size, g(o, "rsPow", 0.6));
    var nodeN = g(o, "nodeN", 30), thr = g(o, "thr", 0.72), nodeR = g(o, "nodeR", 1.4), nodeRDepth = g(o, "nodeRDepth", 1.8), nodes = [], i, j;
    for (i = 0; i < nodeN; i++) {
      var d = fibDir(i, nodeN);
      var x = d[0] + 0.3 * (vnoise(i * 0.31 + 9, t * 0.24) - 0.5) * 2, y = d[1] + 0.3 * (vnoise(i * 0.53 + 27, t * 0.21) - 0.5) * 2, z = d[2] + 0.3 * (vnoise(i * 0.77 + 55, t * 0.27) - 0.5) * 2;
      var l = Math.sqrt(x * x + y * y + z * z);
      nodes.push([x / l, y / l, z / l]);
    }
    var lines = [], dots = [];
    for (i = 0; i < nodeN; i++) {
      for (j = i + 1; j < nodeN; j++) {
        var dx = nodes[i][0] - nodes[j][0], dy = nodes[i][1] - nodes[j][1], dz = nodes[i][2] - nodes[j][2], dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist >= thr) continue;
        var p1 = pt(nodes[i][0], nodes[i][1], nodes[i][2]), p2 = pt(nodes[j][0], nodes[j][1], nodes[j][2]), depth = ((p1[2] + p2[2]) / 2 + 1) / 2;
        lines.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], white: 0.42, a: (1 - dist / thr) * (0.3 + 0.55 * depth), w: Math.max(0.6, g(o, "lineW", 0.8) * rs) });
      }
    }
    for (i = 0; i < nodeN; i++) {
      var p = pt(nodes[i][0], nodes[i][1], nodes[i][2]), dp = (p[2] + 1) / 2, pulse = 1 + 0.25 * Math.sin(t * 1.4 + i * 2.7);
      dots.push({ x: p[0], y: p[1], z: p[2], r: (nodeR + nodeRDepth * dp) * pulse * rs, white: 0.55 - 0.45 * dp });
    }
    var signals = g(o, "signals", 5);
    for (var s = 0; s < signals; s++) {
      var seg = Math.floor(t * 0.55 + s * 7.31), a = Math.floor(hashD(seg, s * 3.1 + 1.7) * nodeN), b = Math.floor(hashD(seg, s * 5.7 + 4.2) * nodeN);
      if (a === b) continue;
      var f = frac(t * 0.55 + s * 7.31), sx = lerp(nodes[a][0], nodes[b][0], f), sy = lerp(nodes[a][1], nodes[b][1], f), sz = lerp(nodes[a][2], nodes[b][2], f);
      var sl = Math.max(1e-6, Math.sqrt(sx * sx + sy * sy + sz * sz)), ps = pt(sx / sl, sy / sl, sz / sl), dd = (ps[2] + 1) / 2;
      dots.push({ x: ps[0], y: ps[1], z: ps[2], r: (nodeR * 1.5 + nodeRDepth * dd) * rs, white: 0.05, a: 0.5 + 0.5 * dd });
    }
    return finalizeFrame(dots, lines, o.rMin);
  }

  // ---- morph (shaping): a dotted outline cycling circle, triangle, square; dots laid evenly along the blended outline
  function smoothE(x) { return x * x * (3 - 2 * x); }
  function polyPath(verts) {
    var V = verts.length, L = [], total = 0, i;
    for (i = 0; i < V; i++) { var a = verts[i], b = verts[(i + 1) % V], l = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)); L.push(l); total += l; }
    return function (f) {
      var target = f * total, k = 0;
      while (target > L[k] && k < V - 1) { target -= L[k]; k++; }
      var a = verts[k], b = verts[(k + 1) % V], ff = L[k] ? Math.min(1, target / L[k]) : 0;
      return [a[0] + (b[0] - a[0]) * ff, a[1] + (b[1] - a[1]) * ff];
    };
  }
  var CIRCLE = function (f) { var a = -PI / 2 + f * 2 * PI; return [Math.cos(a) * 0.24, Math.sin(a) * 0.24]; };
  var TRIANGLE = polyPath([[0.0, -0.26], [0.24, 0.16], [-0.24, 0.16]]);
  var SQUARE = polyPath([[0, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2]]);
  var CYCLE = [CIRCLE, TRIANGLE, SQUARE];
  var HOLD = 1.4, MORPH = 0.9, SEG = HOLD + MORPH;
  function frameMorph(size, t, o) {
    var K = CYCLE.length, tc = t % (SEG * K), k = Math.floor(tc / SEG), local = tc - k * SEG, m = local > HOLD ? smoothE((local - HOLD) / MORPH) : 0, sprd = g(o, "spread", 1);
    var pA = CYCLE[k], pB = CYCLE[(k + 1) % K], M = 160, pts = [], i;
    for (i = 0; i < M; i++) { var f = i / M, a = pA(f), b = pB(f); pts.push([(a[0] + (b[0] - a[0]) * m) * sprd, (a[1] + (b[1] - a[1]) * m) * sprd]); }
    var L = [], total = 0;
    for (i = 0; i < M; i++) { var a2 = pts[i], b2 = pts[(i + 1) % M], l = Math.sqrt(Math.pow(b2[0] - a2[0], 2) + Math.pow(b2[1] - a2[1], 2)); L.push(l); total += l; }
    var n = Math.max(6, Math.round(34 * g(o, "iconD", 1))), re = g(o, "rDot", 0.021) * 1.35 * sprd, pulse = 1 + 0.02 * Math.sin(local * 3.1);
    var dots = [], c2 = size / 2, seg = 0, acc = 0;
    for (var k2 = 0; k2 < n; k2++) {
      var target = (k2 / n) * total;
      while (acc + L[seg] < target && seg < M - 1) { acc += L[seg]; seg++; }
      var pa = pts[seg], pb = pts[(seg + 1) % M], ff = L[seg] ? Math.min(1, (target - acc) / L[seg]) : 0;
      var x = (pa[0] + (pb[0] - pa[0]) * ff) * pulse, y = (pa[1] + (pb[1] - pa[1]) * ff) * pulse;
      dots.push({ x: c2 + x * size, y: c2 + y * size, z: 0, r: Math.max(0.35, re * size), white: 0.1 });
    }
    return finalizeFrame(dots, [], o.rMin);
  }

  // ---- profiles and presets: the tuned (state x size) rows, resolved once
  var COUNT_PAIRS = [["latRings", "lonDensity"], ["rings", "lonDensity"], ["lanes", "segs"]];
  var COUNT_KEYS = ["orbitN", "ghostN", "nodeN", "strandN", "signals"];
  var RADIUS_KEYS = ["rBase", "rDepth", "rActive", "rDot", "ghostR", "partR", "partRDepth", "nodeR", "nodeRDepth"];
  function copy(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }
  function scaleCounts(opts, scale) {
    var out = copy(opts), done = {}, rt = Math.sqrt(scale), i;
    for (i = 0; i < COUNT_PAIRS.length; i++) {
      var a = COUNT_PAIRS[i][0], b = COUNT_PAIRS[i][1];
      if (out[a] != null && out[b] != null && !done[a] && !done[b]) { out[a] = Math.max(2, Math.round(out[a] * rt)); out[b] = Math.max(2, Math.round(out[b] * rt)); done[a] = done[b] = true; }
    }
    for (i = 0; i < COUNT_KEYS.length; i++) { var k = COUNT_KEYS[i], v = out[k]; if (v != null && v !== 0 && !done[k]) out[k] = Math.max(1, Math.round(v * scale)); }
    if (out.iconD != null) out.iconD = Math.max(0.02, out.iconD * scale);
    return out;
  }
  function scaleRadii(opts, scale) {
    var out = copy(opts);
    for (var i = 0; i < RADIUS_KEYS.length; i++) { var v = out[RADIUS_KEYS[i]]; if (v != null) out[RADIUS_KEYS[i]] = v * scale; }
    out.rSizeMul = (out.rSizeMul === undefined ? 1 : out.rSizeMul) * scale;
    return out;
  }
  var BASE = {
    globe: { latRings: 17, lonDensity: 44, rBase: 0.6, rDepth: 1.7, rBoost: 1.0, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    orbits: { orbitN: 12, ghostN: 40, ghostR: 0.9, ghostA: 0.5, particles: 3, partR: 1.2, partRDepth: 1.6, rsPow: 0.6, rMin: 0.3 },
    rubik: { latRings: 15, lonDensity: 40, moveCount: 14, rBase: 0.6, rDepth: 1.7, rActive: 0.3, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    wave: { rings: 15, lonDensity: 40, rBase: 0.6, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    web: { nodeN: 30, thr: 0.72, signals: 5, nodeR: 1.4, nodeRDepth: 1.8, lineW: 0.8, rsPow: 0.6, rMin: 0.3 },
    braid: { strandN: 52, turns: 3.0, ghostN: 150, rBase: 1.2, rDepth: 1.8, rsPow: 0.6, rMin: 0.3 },
    ribbon: { lanes: 5, segs: 88, ghostN: 150, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    ring: { lanes: 5, segs: 88, ghostN: 0, faceOn: 1, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    morph: { rDot: 0.021, iconD: 1, rMin: 0.25 },
  };
  var STATE_TO_MODE = { working: "orbits", searching: "globe", solving: "rubik", listening: "wave", connecting: "web", weaving: "braid", composing: "ribbon", breathing: "ring", shaping: "morph" };
  var STATES = Object.keys(STATE_TO_MODE);
  var LABELS = { working: "Working…", searching: "Searching…", solving: "Solving…", listening: "Listening…", connecting: "Connecting…", weaving: "Weaving…", composing: "Composing…", breathing: "Thinking…", shaping: "Shaping…" };
  var FRAMES = { orbits: frameOrbits, globe: frameGlobe, rubik: frameRubik, wave: frameWave, web: frameWeb, braid: frameBraid, ribbon: frameRibbon, ring: frameRibbon, morph: frameMorph };
  var PRESETS = {
    orbits: { 64: { speed: 1.885, count: 1, size: 1 }, 20: { speed: 3.9, count: 0.238, size: 2.4 } },
    globe: { 64: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } }, 20: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } } },
    rubik: { 64: { speed: 1.82, count: 0.35, size: 1.05 }, 20: { speed: 1.95, count: 0.088, size: 1.9 } },
    wave: { 64: { speed: 4.388, count: 0.341, size: 1 }, 20: { speed: 3.998, count: 0.105, size: 1.6 } },
    web: { 64: { speed: 3.315, count: 1.35, size: 0.95 }, 20: { speed: 6.63, count: 0.25, size: 1.52 } },
    braid: { 64: { speed: 1.625, count: 0.5, size: 1 }, 20: { speed: 2.75, count: 0.1125, size: 1.36 } },
    ribbon: { 64: { speed: 2.34, count: 0.25, size: 0.85, extra: { spin: 0, bandMul: 3.9, wobMul: 1 } }, 20: { speed: 3.12, count: 0.051, size: 1.073, extra: { spin: 0, bandMul: 4.94, wobMul: 1 } } },
    ring: { 64: { speed: 3.24, count: 0.25, size: 0.956, extra: { spin: 0, bandMul: 3.627, wobMul: 0.368 } }, 20: { speed: 3.78, count: 0.028, size: 1.622, extra: { spin: 0, bandMul: 3.968, wobMul: 0.565 } } },
    morph: { 64: { speed: 2.405, count: 0.702, size: 0.395, extra: { spread: 1.45 } }, 20: { speed: 2.08, count: 0.53, size: 1.011, extra: { spread: 1.45 } } },
  };
  var presetCache = {};
  function resolvePreset(state, size) {
    need(STATE_TO_MODE[state], 'unknown state "' + state + '" (' + STATES.join(", ") + ")");
    var key = state + "-" + size;
    if (presetCache[key]) return presetCache[key];
    var mode = STATE_TO_MODE[state], p = PRESETS[mode][size], opts = copy(BASE[mode]), k;
    if (p.count !== 1) opts = scaleCounts(opts, p.count);
    if (p.size !== 1) opts = scaleRadii(opts, p.size);
    if (p.extra) for (k in p.extra) opts[k] = p.extra[k];
    return (presetCache[key] = { mode: mode, speed: p.speed, opts: opts });
  }
  // the geometry of one instant, exactly as thinking-orbs returns it: t is the preset clock (seconds * preset speed)
  function geometry(state, design, t) { var r = resolvePreset(state, design); return FRAMES[r.mode](design, t, r.opts); }

  // ===================================================================== the RasanOrbs layer
  // size: 64 and 20 are the two tuned designs. Any other number draws the nearest design and scales it (<= 32 the 20, else the 64);
  // "hero" is the 64 design at 256 px; a number above 64 is a hero of that size (the 64 design scaled, dots scale with it).
  function sizeOf(size) {
    var px = size === "hero" ? 256 : +size;
    need(px > 0 && isFinite(px), "size must be a positive number or \"hero\"");
    var design = px === 20 ? 20 : px === 64 ? 64 : px <= 32 ? 20 : 64;
    return { px: px, design: design, k: px / design };
  }

  function parseColor(c) {
    if (c == null) return null;
    var s = String(c).trim(), m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s))) return [+m[1], +m[2], +m[3]];
    need(false, 'color must be "#rgb", "#rrggbb" or "rgb(r,g,b)", got "' + c + '"');
  }

  // one frame, drawn: ink is monochrome (grey by depth; light dots on dark, dark dots on light) or the brand colour at a depth-weighted alpha
  function paint(ctx, fr, dark, rgb, alpha, rScale) {
    var i, d, l, w, a, g8;
    function ink(white, al) {
      w = clamp(white, 0, 1);
      if (rgb) return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (al * (1 - w)).toFixed(4) + ")";
      g8 = Math.round((dark ? 1 - w : w) * 255);
      return "rgba(" + g8 + "," + g8 + "," + g8 + "," + al.toFixed(4) + ")";
    }
    for (i = 0; i < fr.lines.length; i++) {
      l = fr.lines[i]; a = (l.a === undefined ? 1 : l.a) * alpha;
      if (a < 0.004) continue;
      ctx.strokeStyle = ink(l.white, a); ctx.lineWidth = l.w; ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    }
    for (i = 0; i < fr.dots.length; i++) {
      d = fr.dots[i]; a = (d.a === undefined ? 1 : d.a) * alpha;
      if (a < 0.004) continue;
      ctx.fillStyle = ink(d.white, a); ctx.beginPath(); ctx.arc(d.x, d.y, d.r * rScale, 0, PI * 2); ctx.fill();
    }
  }

  function mount(el, o) {
    o = o || {};
    var node = typeof el === "string" ? document.querySelector(el) : el;
    need(node && node.nodeType === 1, "mount(el): expected an element or a selector");
    var sz = sizeOf(opt(o, "size", 64)), dpr = opt(o, "dpr", 2), rgb = parseColor(o.color), dark = opt(o, "theme", "dark") !== "light";
    var t0 = opt(o, "t0", 0), speed = opt(o, "speed", 1), xdur = opt(o, "transition", 0.5);
    var initial = opt(o, "state", "working");
    need(STATE_TO_MODE[initial], 'unknown state "' + initial + '" (' + STATES.join(", ") + ")");
    var changes = []; // [{at, state, dur}] sorted by time: the schedule is data, so any T maps to one picture

    var canvas = node.tagName === "CANVAS" ? node : document.createElement("canvas");
    if (canvas !== node) node.appendChild(canvas);
    canvas.width = Math.round(sz.px * dpr); canvas.height = Math.round(sz.px * dpr);
    canvas.style.width = sz.px + "px"; canvas.style.height = sz.px + "px"; canvas.style.display = "block";
    canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", opt(o, "label", LABELS[initial]));
    var ctx = canvas.getContext("2d");
    need(ctx, "no 2d context");

    function stateAt(T) {
      var cur = initial, prev = null, e = 1;
      for (var i = 0; i < changes.length; i++) {
        var c = changes[i];
        if (T < c.at) break;
        prev = cur; cur = c.state;
        e = c.dur > 0 ? clamp((T - c.at) / c.dur, 0, 1) : 1;
        if (e >= 1) { prev = null; e = 1; }
      }
      return { state: cur, from: prev, e: e < 1 ? e * e * (3 - 2 * e) : 1 };
    }
    function layer(state, lt) {
      var r = resolvePreset(state, sz.design);
      return FRAMES[r.mode](sz.design, lt * r.speed, r.opts);
    }
    function draw(T) {
      var lt = Math.max(0, T - t0) * speed, st = stateAt(T);
      ctx.setTransform(dpr * sz.k, 0, 0, dpr * sz.k, 0, 0);
      ctx.clearRect(0, 0, sz.design, sz.design);
      if (st.from) {
        // a dissolve: the old orb thins and shrinks as the new one grows in; each keeps its own clock, so nothing restarts
        paint(ctx, layer(st.from, lt), dark, rgb, 1 - st.e, 1 - 0.4 * st.e);
        paint(ctx, layer(st.state, lt), dark, rgb, st.e, 0.6 + 0.4 * st.e);
      } else paint(ctx, layer(st.state, lt), dark, rgb, 1, 1);
      return st;
    }

    var tl = o.tl, at = opt(o, "at", 0), clockAt = o.time;
    var api = {
      canvas: canvas,
      size: sz.px,
      // schedule a state change: at timeline time `at`, dissolve into `state` over `dur` seconds (default the mount's `transition`, 0.5)
      to: function (state, atT, dur) {
        need(STATE_TO_MODE[state], 'unknown state "' + state + '" (' + STATES.join(", ") + ")");
        changes.push({ at: atT, state: state, dur: dur === undefined ? xdur : dur });
        changes.sort(function (a, b) { return a.at - b.at; });
        api.seek(tl ? tl.time() : clockAt ? clockAt() : 0);
        return api;
      },
      stateAt: function (T) { return stateAt(T).state; },
      seek: function (T) { draw(T); return api; },
      draw: draw,
    };
    if (tl) {
      var du = opt(o, "duration", tl.duration());
      need(du > 0, "pass duration (the scene's length in seconds) so the orb's clock covers the whole scene");
      var v = 0, p = {};
      Object.defineProperty(p, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; draw(tl.time()); } });
      tl.fromTo(p, { p: 0 }, { p: 1, duration: Math.max(1e-4, du), ease: "none", immediateRender: false }, at);
    }
    draw(tl ? tl.time() : clockAt ? clockAt() : 0);
    return api;
  }

  root.RasanOrbs = { VERSION: VERSION, mount: mount, geometry: geometry, states: STATES.slice(), sizes: [64, 20], labels: LABELS };
})(typeof window !== "undefined" ? window : this);
