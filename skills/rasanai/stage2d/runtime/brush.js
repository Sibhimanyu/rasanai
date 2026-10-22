/* Rasan2D brush: the painting backend. Original Canvas 2D code (no p5.brush, no third-party brush code):
 * variable-width ink ribbons, translucent pigment washes with pooled edges, seeded bristle tracks, paper and grain
 * textures, an additive glow layer. Everything that looks hand-made is a pure function of (seed, drawing number):
 * the same inputs paint the same pixels, in any order, on any worker. There is no Math.random and no clock in here.
 *
 * Works in a browser (window.Rasan2DKit.brush) and in Node (module.exports) for the pure parts (hashing, boil, geometry).
 */
(function (root) {
  "use strict";
  var K = (root.Rasan2DKit = root.Rasan2DKit || {});
  var TAU = Math.PI * 2;

  // ------------------------------------------------------------------ seeded hashing
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mix(a, b) {
    var h = (a ^ Math.imul((b | 0) + 0x7f4a7c15, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  function hash01(a, b, c) { return mix(mix(a >>> 0, b | 0), c | 0) / 4294967296; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ the boil
  // `frame` is the drawing number (floor(t * 12)); offsets for one (seed, frame) are smooth along the outline,
  // so a line wobbles like a pencil does, it does not scribble. Different seeds (actor + part) never share offsets.
  var wobbleCache = new Map();
  function wobble(seed, frame, n, amp, closed, every) {
    every = every || 4;
    var key = seed + "|" + frame + "|" + n + "|" + closed + "|" + every;
    var base = wobbleCache.get(key);
    if (!base) {
      var m = closed ? Math.max(3, Math.round(n / every)) : Math.ceil((n - 1) / every) + 2;
      var kx = new Float32Array(m + 1), ky = new Float32Array(m + 1);
      for (var j = 0; j < m; j++) { kx[j] = hash01(seed, frame, j * 2) * 2 - 1; ky[j] = hash01(seed, frame, j * 2 + 1) * 2 - 1; }
      kx[m] = kx[0]; ky[m] = ky[0];
      base = new Float32Array(n * 2);
      for (var i = 0; i < n; i++) {
        var u = closed ? (i / n) * m : i / every;
        var j0 = Math.floor(u), f = u - j0, s = f * f * (3 - 2 * f);
        var j1 = closed ? (j0 + 1) % m : j0 + 1;
        base[i * 2] = kx[j0 % (m + 1)] * (1 - s) + kx[closed ? j1 : Math.min(j1, m)] * s;
        base[i * 2 + 1] = ky[j0 % (m + 1)] * (1 - s) + ky[closed ? j1 : Math.min(j1, m)] * s;
      }
      if (wobbleCache.size > 4000) wobbleCache.clear();
      wobbleCache.set(key, base);
    }
    var out = new Float32Array(n * 2);
    for (var q = 0; q < out.length; q++) out[q] = base[q] * amp;
    return out;
  }
  // the drawing number at time t: 12 per second, a pure function of t
  function drawingAt(t, hz) { return Math.floor(t * (hz || 12) + 1e-6); }
  function boil(pts, seed, frame, amp, closed) {
    var n = pts.length, w = wobble(seed, frame, n, amp, closed !== false), out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = [pts[i][0] + w[i * 2], pts[i][1] + w[i * 2 + 1]];
    return out;
  }

  // ------------------------------------------------------------------ colour
  function parse(c) {
    if (Array.isArray(c)) return c;
    var s = String(c).trim();
    if (s[0] === "#") {
      if (s.length === 4) s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    }
    var m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { var p = m[1].split(",").map(Number); return [p[0], p[1], p[2]]; }
    return [128, 128, 128];
  }
  function rgba(c, a) { c = parse(c); return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (a == null ? 1 : +a.toFixed(3)) + ")"; }
  function mixc(a, b, t) { a = parse(a); b = parse(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function shade(c, f) { c = parse(c); return f < 1 ? [c[0] * f, c[1] * f, c[2] * f] : [c[0] + (255 - c[0]) * (f - 1), c[1] + (255 - c[1]) * (f - 1), c[2] + (255 - c[2]) * (f - 1)]; }
  function hex(c) { c = parse(c); return "#" + c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }).join(""); }

  // ------------------------------------------------------------------ geometry helpers (pure)
  function ellipse(cx, cy, rx, ry, rot, n) {
    n = n || 28; rot = rot || 0;
    var c = Math.cos(rot), s = Math.sin(rot), out = [];
    for (var i = 0; i < n; i++) { var a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([cx + x * c - y * s, cy + x * s + y * c]); }
    return out;
  }
  // a capsule-like ribbon polygon along a polyline with a width at each end (round-ish)
  function ribbonPoly(pts, w0, w1) {
    var n = pts.length, L = [], R = [];
    for (var i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      var u = n > 1 ? i / (n - 1) : 0, w = (w0 + (w1 - w0) * u) / 2;
      L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
      R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
    }
    // round caps
    var endCap = [], startCap = [];
    var pe = pts[n - 1], pp = pts[n - 2] || pts[n - 1];
    var ae = Math.atan2(pe[1] - pp[1], pe[0] - pp[0]);
    for (var k = 1; k < 6; k++) { var th = ae + Math.PI / 2 - (k / 6) * Math.PI; endCap.push([pe[0] + Math.cos(th) * w1 / 2, pe[1] + Math.sin(th) * w1 / 2]); }
    var ps = pts[0], pn = pts[1] || pts[0];
    var as = Math.atan2(ps[1] - pn[1], ps[0] - pn[0]);
    for (var k2 = 1; k2 < 6; k2++) { var th2 = as + Math.PI / 2 - (k2 / 6) * Math.PI; startCap.push([ps[0] + Math.cos(th2) * w0 / 2, ps[1] + Math.sin(th2) * w0 / 2]); }
    return L.concat(endCap, R.reverse(), startCap);
  }
  function bezier(p0, p1, p2, n) { // quadratic
    var out = [];
    for (var i = 0; i < n; i++) { var u = i / (n - 1), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]); }
    return out;
  }
  function bounds(pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < pts.length; i++) { var p = pts[i]; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function area(pts) { var a = 0; for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

  // ------------------------------------------------------------------ painting (browser only past this line)
  function pathSmooth(ctx, pts, closed) {
    var n = pts.length;
    ctx.beginPath();
    if (n < 2) return;
    if (closed) {
      var m0 = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
      ctx.moveTo(m0[0], m0[1]);
      for (var i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
      ctx.closePath();
    } else {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var j = 1; j < n - 1; j++) { var a = pts[j], b = pts[j + 1]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
      ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  }

  // Translucent pigment on an opaque underpaint (so an actor in front of a tree hides it, like gouache),
  // layered passes with their own wobble, a darker pooled edge, a soft light-to-dark sweep and optional dry-brush hatching.
  // o: color, seed, frame, jitter (px), under (0..1), passes, edge (0..1), shade {dir:[x,y], light, dark}, hatch (tracks), wash (0..1 layer strength), clip (false to skip)
  function wash(ctx, pts, o) {
    var col = parse(o.color), n = pts.length, k = o.k == null ? 1 : o.k;
    var layer = o.wash == null ? 1 : o.wash;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    pathSmooth(ctx, pts, true);
    ctx.fillStyle = rgba(col, (o.under == null ? 0.96 : o.under));
    ctx.fill();
    if (layer > 0) {
      var passes = o.passes == null ? 3 : o.passes, jit = (o.jitter == null ? 1.2 : o.jitter);
      ctx.globalCompositeOperation = "multiply";
      for (var p = 0; p < passes; p++) {
        var q = boil(pts, mix(o.seed, 101 + p * 7), o.frame, jit * (0.7 + p * 0.55), true);
        pathSmooth(ctx, q, true);
        ctx.fillStyle = rgba(shade(col, 0.86 - p * 0.03), (0.16 + 0.04 * p) * layer);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      // the inner pool at the edge, and the light-to-dark sweep, both clipped to the shape
      pathSmooth(ctx, pts, true);
      ctx.clip();
      var b = bounds(pts), dir = (o.shade && o.shade.dir) || [-0.5, -0.8];
      var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = (b.x1 - b.x0) / 2 + 1, ry = (b.y1 - b.y0) / 2 + 1;
      var L = (o.shade && o.shade.light != null) ? o.shade.light : 0.2, D = (o.shade && o.shade.dark != null) ? o.shade.dark : 0.22;
      if (L > 0 || D > 0) {
        var g = ctx.createLinearGradient(cx + dir[0] * rx, cy + dir[1] * ry, cx - dir[0] * rx, cy - dir[1] * ry);
        g.addColorStop(0, rgba([255, 244, 220], L * layer));
        g.addColorStop(0.45, rgba([255, 244, 220], 0));
        g.addColorStop(0.62, rgba(shade(col, 0.5), 0));
        g.addColorStop(1, rgba(shade(col, 0.45), D * layer));
        ctx.fillStyle = g;
        ctx.fillRect(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 4);
      }
      var edge = (o.edge == null ? 0.35 : o.edge) * layer;
      if (edge > 0) {
        ctx.globalCompositeOperation = "multiply";
        var e = boil(pts, mix(o.seed, 977), o.frame, jit * 0.6, true);
        pathSmooth(ctx, e, true);
        ctx.lineWidth = Math.max(2, (o.edgeW || 3) * k);
        ctx.strokeStyle = rgba(shade(col, 0.62), edge);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      if (o.hatch) bristles(ctx, [[b.x0 - 4, cy - ry * 0.2], [b.x1 + 4, cy + ry * 0.35]], { seed: mix(o.seed, 313), frame: o.frame, color: shade(col, 0.7), n: o.hatch, width: ry * 1.9, alpha: 0.2 * layer, size: 1.3 * k, dry: 0.45, flow: 0.5 });
    }
    ctx.restore();
  }

  // Seeded bristle tracks along a centreline: a row of thin offset strokes with gaps (dry brush).
  // o: seed, frame, color, n, width (px across), alpha, size (px), dry (0..1 gap share), flow (wave)
  function bristles(ctx, line, o) {
    var n = o.n || 8, pts = line.length === 2 ? bezier(line[0], [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2], line[1], 14) : line;
    var N = pts.length, wv = wobble(mix(o.seed, 17), o.frame, N, (o.flow == null ? 0.4 : o.flow) * (o.width || 20) * 0.1, false);
    ctx.save();
    ctx.lineCap = "round";
    for (var t = 0; t < n; t++) {
      var off = ((t + 0.5) / n - 0.5) * (o.width || 20), r = rng(mix(o.seed, 5000 + t) ^ mix(o.frame, 7));
      var segs = [], start = 0;
      while (start < N - 1) {
        var len = 2 + Math.floor(r() * 5), on = r() > (o.dry == null ? 0.35 : o.dry);
        if (on) segs.push([start, Math.min(N - 1, start + len)]);
        start += len + (on ? 0 : 1);
      }
      ctx.strokeStyle = rgba(o.color, (o.alpha == null ? 0.3 : o.alpha) * (0.5 + r() * 0.8));
      ctx.lineWidth = (o.size || 1.2) * (0.6 + r() * 0.9);
      for (var s = 0; s < segs.length; s++) {
        ctx.beginPath();
        for (var i = segs[s][0]; i <= segs[s][1]; i++) {
          var a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
          var x = pts[i][0] + (-dy / d) * off + wv[i * 2], y = pts[i][1] + (dx / d) * off + wv[i * 2 + 1];
          if (i === segs[s][0]) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // A variable-width ink line along a polyline: pressure noise, tapered ends. o: color, width, seed, frame, taper [in,out] (0..0.5), alpha, press
  function ribbon(ctx, pts, o) {
    var n = pts.length;
    if (n < 2) return;
    var wv = wobble(mix(o.seed, 41), o.frame, n, 1, false, 3), L = [], R = [];
    var tin = (o.taper && o.taper[0] != null) ? o.taper[0] : 0.18, tout = (o.taper && o.taper[1] != null) ? o.taper[1] : 0.25, press = o.press == null ? 0.28 : o.press;
    var dir = o.light || [0.55, 0.8], sgn = area(pts) >= 0 ? 1 : -1;
    for (var i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      var nx = -dy / d, ny = dx / d, u = n > 1 ? i / (n - 1) : 0;
      var tp = Math.min(1, tin > 0 ? u / tin : 1, tout > 0 ? (1 - u) / tout : 1);
      tp = 0.18 + 0.82 * Math.pow(Math.max(0, tp), 0.7);
      var side = o.closed ? sgn * (nx * dir[0] + ny * dir[1]) : 0; // the normal against the light: the pen leans on the shadow side
      var w = o.width * tp * (1 + wv[i * 2] * press) * (1 + 0.28 * side * (o.closed ? 1 : 0));
      L.push([pts[i][0] + nx * w / 2, pts[i][1] + ny * w / 2]);
      R.push([pts[i][0] - nx * w / 2, pts[i][1] - ny * w / 2]);
    }
    ctx.save();
    ctx.fillStyle = rgba(o.color, o.alpha == null ? 0.95 : o.alpha);
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (var j = 1; j < n - 1; j++) ctx.quadraticCurveTo(L[j][0], L[j][1], (L[j][0] + L[j + 1][0]) / 2, (L[j][1] + L[j + 1][1]) / 2);
    ctx.lineTo(L[n - 1][0], L[n - 1][1]);
    ctx.lineTo(R[n - 1][0], R[n - 1][1]);
    for (var m = n - 2; m > 0; m--) ctx.quadraticCurveTo(R[m][0], R[m][1], (R[m][0] + R[m - 1][0]) / 2, (R[m][1] + R[m - 1][1]) / 2);
    ctx.lineTo(R[0][0], R[0][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The contour of a closed shape, inked as one pen stroke that starts somewhere different each drawing, never quite closes,
  // and leans on its shadow side. o: color, width, seed, frame, range [from,to] (0..1 of the loop) to ink only part, gap (0..0.06)
  function ink(ctx, pts, o) {
    var n = pts.length, from = 0, to = 1;
    if (o.range) { from = o.range[0]; to = o.range[1]; }
    var span = Math.max(3, Math.round((to - from) * n)), start0 = Math.floor(from * n);
    var startJ = o.range ? 0 : Math.floor(hash01(o.seed, o.frame, 99) * n), gap = o.range ? 0 : (o.gap == null ? 0.03 : o.gap);
    var cnt = Math.max(3, Math.round(span * (1 - gap))), line = [];
    for (var i = 0; i <= cnt; i++) line.push(pts[(start0 + startJ + i) % n]);
    ribbon(ctx, line, { color: o.color, width: o.width, seed: o.seed, frame: o.frame, taper: o.range ? [0.25, 0.25] : [0.12, 0.2], alpha: o.alpha, closed: true, press: o.press, light: o.light });
  }

  // ------------------------------------------------------------------ paper and grain (cached textures: pure functions of their parameters)
  var texCache = new Map();
  function makeCanvas(w, h) {
    var c = root.document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  function valueNoise(seed, x, y, cell) {
    var gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var a = hash01(seed, x0, y0), b = hash01(seed, x0 + 1, y0), c = hash01(seed, x0, y0 + 1), d = hash01(seed, x0 + 1, y0 + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  }
  // the paper: tint, soft blotches, tooth and fibres. Stable (a background seed that never changes between frames).
  function paper(W, H, o) {
    var key = ["paper", W, H, o.seed, o.tint, o.grain, o.fibres].join("|");
    if (texCache.has(key)) return texCache.get(key);
    var c = makeCanvas(W, H), x = c.getContext("2d"), img = x.createImageData(W, H), d = img.data, t = parse(o.tint), g = o.grain == null ? 0.5 : o.grain, sd = o.seed >>> 0;
    for (var y = 0; y < H; y++) for (var px = 0; px < W; px++) {
      var i = (y * W + px) * 4, blot = valueNoise(sd, px, y, 220) * 0.6 + valueNoise(sd + 3, px, y, 60) * 0.4, tooth = hash01(sd + 9, px, y);
      var f = 1 + (blot - 0.5) * 0.07 * (0.4 + g) + (tooth - 0.5) * 0.06 * g;
      d[i] = Math.max(0, Math.min(255, t[0] * f)); d[i + 1] = Math.max(0, Math.min(255, t[1] * f)); d[i + 2] = Math.max(0, Math.min(255, t[2] * f)); d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var r = rng(sd + 77), nf = Math.round((o.fibres == null ? 1 : o.fibres) * W * H / 9000);
    x.lineCap = "round";
    for (var k = 0; k < nf; k++) {
      var fx0 = r() * W, fy0 = r() * H, a = r() * TAU, l = 6 + r() * 22;
      x.strokeStyle = r() > 0.5 ? "rgba(255,255,255," + (0.05 + r() * 0.06) + ")" : "rgba(120,100,80," + (0.03 + r() * 0.05) + ")";
      x.lineWidth = 0.6 + r() * 0.8;
      x.beginPath(); x.moveTo(fx0, fy0); x.quadraticCurveTo(fx0 + Math.cos(a + 0.5) * l * 0.5, fy0 + Math.sin(a + 0.5) * l * 0.5, fx0 + Math.cos(a) * l, fy0 + Math.sin(a) * l); x.stroke();
    }
    texCache.set(key, c);
    return c;
  }
  // grain that is multiplied over the painted frame, like pigment catching the tooth of the paper
  function grainTex(W, H, o) {
    var key = ["grain", W, H, o.seed].join("|");
    if (texCache.has(key)) return texCache.get(key);
    var c = makeCanvas(W, H), x = c.getContext("2d"), img = x.createImageData(W, H), d = img.data, sd = (o.seed + 12345) >>> 0;
    for (var y = 0; y < H; y++) for (var px = 0; px < W; px++) {
      var i = (y * W + px) * 4, v = 255 - Math.floor((hash01(sd, px, y) * 0.65 + valueNoise(sd + 1, px, y, 3) * 0.35) * 46);
      d[i] = v; d[i + 1] = v; d[i + 2] = v - 3; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    texCache.set(key, c);
    return c;
  }

  // The glow: an additive layer drawn last. sources: [{x, y, r, color, alpha}]
  function glow(ctx, sources, strength) {
    if (!sources || !sources.length || !(strength > 0)) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i], g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, rgba(s.color || [255, 214, 140], (s.alpha == null ? 0.5 : s.alpha) * strength));
      g.addColorStop(0.45, rgba(s.color || [255, 214, 140], (s.alpha == null ? 0.5 : s.alpha) * strength * 0.28));
      g.addColorStop(1, rgba(s.color || [255, 214, 140], 0));
      ctx.fillStyle = g;
      ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    ctx.restore();
  }

  var api = {
    hashStr: hashStr, mix: mix, hash01: hash01, rng: rng, wobble: wobble, boil: boil, drawingAt: drawingAt,
    parse: parse, rgba: rgba, mixc: mixc, shade: shade, hex: hex,
    ellipse: ellipse, ribbonPoly: ribbonPoly, bezier: bezier, bounds: bounds, area: area,
    pathSmooth: pathSmooth, wash: wash, bristles: bristles, ribbon: ribbon, ink: ink, paper: paper, grainTex: grainTex, glow: glow, valueNoise: valueNoise,
  };
  K.brush = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
