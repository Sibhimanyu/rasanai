// Browser side of the evidence preview: draws window.SCENE (evidence/scene.json) on a Canvas 2D with one paused GSAP timeline, so a time is a picture
// (window.__seek(t)). It only draws what the scene holds: strings come from the scene, geometry from its normalized coordinates. It records the
// real label rectangles (window.__rects) and every string drawn (window.__drawn()) for `evidence.mjs check`. No network, no randomness, no clock.
(function () {
  var S = window.SCENE, W = S.canvas.w, H = S.canvas.h, cv = document.getElementById("c"), ctx = cv.getContext("2d");
  var FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif', MONO = 'Menlo, "SF Mono", Consolas, monospace';
  var light = S.recipe === "archive-lighttable";
  var C = light ? { bg: "#e6e3da", ink: "#1d1b17", dim: "#6c675c", accent: "#b3421d", panel: "#f4f1e8" } : { bg: "#0d1116", ink: "#ecf1f4", dim: "#8a97a3", accent: "#f2a900", panel: "#16202a" };
  var CLS = ["#7e8b96", "#9bbf4a", "#4fb0c6", "#e0a030", "#c8584c", "#9a6bd0", "#5bd18b", "#d27ac2"];
  var PAL = ["#5ab0d6", "#e08a4a", "#8ecb6a", "#c779c1", "#e3c14d", "#6f8fe0", "#d9605c", "#58c7b0"];
  var drawnSet = {}, rects = {}, P = { a: 0, b: 0 };
  var imgs = {}, minDim = Math.min(W, H);
  window.__rects = rects; window.__drawn = function () { return Object.keys(drawnSet); };
  var _ft = ctx.fillText.bind(ctx); ctx.fillText = function (t) { drawnSet[String(t)] = 1; return _ft.apply(null, arguments); };
  var ease = function (x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  function font(px, w, mono) { ctx.font = (w || 500) + " " + Math.round(px) + "px " + (mono ? MONO : FONT); }
  function text(s, x, y, px, col, o) { o = o || {}; font(px, o.w, o.mono); ctx.fillStyle = col || C.ink; ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "alphabetic"; ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.fillText(s, x, y); ctx.globalAlpha = 1; }
  function wrap(s, maxW, px, w) { font(px, w); var words = String(s).split(" "), lines = [], cur = ""; for (var i = 0; i < words.length; i++) { var t = cur ? cur + " " + words[i] : words[i]; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t; } if (cur) lines.push(cur); return lines; }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  var M = Math.round(W * 0.04);

  // ---- 3D helpers: x right, y depth, z up; yaw about z, pitch looks down
  function view(yaw, pitch, scale, cx, cy) {
    var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return function (p) { var x = p[0] * cyw - p[1] * syw, y = p[0] * syw + p[1] * cyw, z = p[2]; return [cx + x * scale, cy - (z * cp + y * sp) * scale, y * cp - z * sp]; };
  }
  var FACES = [[0, 1, 3, 2, [0, -1, 0]], [4, 5, 7, 6, [0, 1, 0]], [0, 2, 6, 4, [-1, 0, 0]], [1, 3, 7, 5, [1, 0, 0]], [0, 1, 5, 4, [0, 0, -1]], [2, 3, 7, 6, [0, 0, 1]]];
  function boxFaces(mn, mx, pr, col, o) {
    o = o || {}; var v = []; for (var i = 0; i < 8; i++) v.push(pr([i & 1 ? mx[0] : mn[0], i & 2 ? mx[1] : mn[1], i & 4 ? mx[2] : mn[2]]));
    var out = [];
    for (var f = 0; f < FACES.length; f++) { var F = FACES[f], pts = [v[F[0]], v[F[1]], v[F[2]], v[F[3]]], dep = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4; out.push({ pts: pts, dep: dep, n: F[4], col: col, o: o }); }
    return out;
  }
  function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return "rgb(" + Math.round(clamp(r * k, 0, 255)) + "," + Math.round(clamp(g * k, 0, 255)) + "," + Math.round(clamp(b * k, 0, 255)) + ")"; }
  function drawFaces(faces) {
    faces.sort(function (a, b) { return b.dep - a.dep; });
    faces.forEach(function (f) {
      var k = 0.55 + 0.45 * Math.max(0, f.n[0] * -0.35 + f.n[1] * -0.25 + f.n[2] * 0.9);
      ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]); for (var i = 1; i < 4; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]); ctx.closePath();
      ctx.fillStyle = f.o.fill ? f.o.fill(f, k) : shade(f.col, k); ctx.globalAlpha = f.o.alpha == null ? 1 : f.o.alpha; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = f.o.edge || "rgba(0,0,0,0.35)"; ctx.lineWidth = 1; ctx.stroke();
    });
  }

  // ---- shared chrome: title, schematic badge, provenance line
  function chrome() {
    var by = S.disclosure ? Math.round((S.disclosure.box.y + S.disclosure.box.h) * H) + Math.round(minDim * 0.03) : M;
    var tpx = Math.round(minDim * 0.058);
    text(S.title, M, by + tpx, tpx, C.ink, { w: 700 });
    var sub = S.subtitle; if (sub) text(sub, M, by + tpx + Math.round(minDim * 0.04), Math.round(minDim * 0.026), C.dim, { w: 400 });
    if (S.disclosure) {
      var fs0 = minDim * 0.034, x = S.disclosure.box.x * W, y = S.disclosure.box.y * H;
      font(fs0, 800); var w1 = ctx.measureText("SCHEMATIC").width; font(fs0 * 0.55, 600); var w2 = ctx.measureText("synthetic fixture, not surveyed data").width;
      var bw = Math.max(w1, w2) + fs0 * 1.0, bh = fs0 * 2.6;
      ctx.fillStyle = "#f2a900"; rr(x, y, bw, bh, fs0 * 0.3); ctx.fill();
      text("SCHEMATIC", x + fs0 * 0.5, y + fs0 * 1.3, fs0, "#161000", { w: 800 });
      text("synthetic fixture, not surveyed data", x + fs0 * 0.5, y + fs0 * 2.1, fs0 * 0.55, "#161000", { w: 600 });
      rects.disclosure = { x: x / W, y: y / H, w: bw / W, h: bh / H };
    }
    if (S.provenance) { var ppx = Math.round(minDim * 0.021), lines = wrap(S.provenance.text, W - 2 * M, ppx, 400); for (var i = 0; i < lines.length; i++) text(lines[i], M, H - M * 0.7 - (lines.length - 1 - i) * ppx * 1.35, ppx, C.dim, { w: 400, mono: true }); }
  }
  var stage = function () { var top = Math.round(H * (W < H ? 0.24 : 0.27)); return { x: M, y: top, w: W - 2 * M, h: Math.round(H * 0.9) - top - Math.round(minDim * 0.03) }; };

  function el(type) { return (S.elements || []).filter(function (e) { return e.type === type; }); }
  function byId(id) { return (S.elements || []).filter(function (e) { return e.id === id; })[0]; }

  // ---- data physicalization: one plate-and-bar per row, heights linear from zero
  function dataPhysical() {
    var st = stage(), bars = el("bar"), n = bars.length || 1, ax = S.axis, depth = 0.5;
    var yaw = 0.3 + Math.sin(P.b * Math.PI * 2) * 0.04, pitch = 0.5;
    var span = n * 1.0 + 0.4, sc = st.w * 0.74 / (span * Math.cos(yaw) + 1.3), cx = st.x + st.w * 0.54, cy = st.y + st.h * 0.78;
    var H1 = Math.min(2.8, st.h * 0.62 / (sc * Math.cos(pitch)));
    var pr = view(yaw, pitch, sc, cx, cy), x0 = -span / 2;
    var faces = [];
    faces = faces.concat(boxFaces([x0 - 0.2, -0.7, -0.08], [x0 + span + 0.2, 0.7, 0], pr, "#233140", { edge: "rgba(255,255,255,0.12)" }));
    // back wall grid and axis ticks at the left back corner
    ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1;
    ax.ticks.forEach(function (t, i) {
      var z = (t.v / ax.max) * H1, a = pr([x0 - 0.2, 0.7, z]), b = pr([x0 + span + 0.2, 0.7, z]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      text(t.text, a[0] - sc * 0.12, a[1] + minDim * 0.008, Math.round(minDim * 0.022), C.dim, { align: "right", w: 500, mono: true });
    });
    var a0 = pr([x0 - 0.2, 0.7, 0]), a1 = pr([x0 - 0.2, 0.7, H1]); ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
    text(ax.title, a1[0] - sc * 0.12, a1[1] - minDim * 0.03, Math.round(minDim * 0.024), C.ink, { align: "right", w: 600 });
    var tops = [];
    bars.forEach(function (b, i) {
      var g = ease(clamp(P.a * 1.6 - i * 0.07, 0, 1)), h = b.height * H1 * g, bx = x0 + i * 1.0 + 0.5, w = 0.34;
      faces = faces.concat(boxFaces([bx - w, -depth * 0.6, 0], [bx + w, depth * 0.6, Math.max(h, 0.0001)], pr, PAL[i % PAL.length], {}));
      var tp = pr([bx, 0, h + 0.02]), bp = pr([bx, -depth * 0.6 - 0.1, 0]); tops.push({ b: b, tp: tp, bp: bp, g: g });
    });
    drawFaces(faces);
    var lpx = Math.round(minDim * 0.026);
    tops.forEach(function (t) { text(t.b.label.text, t.tp[0], t.tp[1] - lpx * 0.5, lpx, C.ink, { align: "center", w: 700, alpha: t.g }); text(t.b.name, t.bp[0], t.bp[1] + lpx * 1.4, Math.round(minDim * 0.022), C.dim, { align: "center", w: 500 }); });
  }

  // ---- LiDAR: the measured points, rotating, swept in along x
  function lidar() {
    var st = stage(), E = el("points")[0], pts = E.points, yaw = -0.85 + P.b * 0.8, pitch = 1.0;
    var sc = Math.min(st.w * 0.62, st.h * 1.1) * 0.8, cx = st.x + st.w * 0.46, cy = st.y + st.h * 0.5, pr = view(yaw, pitch, sc, cx, cy);
    var zmin = Infinity, zmax = -Infinity, xmin = Infinity, xmax = -Infinity; pts.forEach(function (p) { if (p[2] < zmin) zmin = p[2]; if (p[2] > zmax) zmax = p[2]; if (p[0] < xmin) xmin = p[0]; if (p[0] > xmax) xmax = p[0]; });
    var ymin = Infinity, ymax = -Infinity; pts.forEach(function (p) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; });
    if (S.ground) {
      ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1;
      for (var i = 0; i <= 10; i++) { var u = xmin + (xmax - xmin) * i / 10, v = ymin + (ymax - ymin) * i / 10, a = pr([u, ymin, zmin]), b = pr([u, ymax, zmin]), c = pr([xmin, v, zmin]), d = pr([xmax, v, zmin]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke(); }
    }
    var sweep = xmin + (xmax - xmin) * 1.08 * ease(P.a), proj = pts.map(function (p) { var q = pr(p); return { q: q, p: p }; }).sort(function (a, b) { return b.q[2] - a.q[2]; });
    var r = Math.max(1.4, minDim * 0.0042), hasCls = Object.keys(E.classes || {}).filter(function (k) { return k !== "none"; }).length > 1;
    proj.forEach(function (o) {
      if (o.p[0] > sweep) return; var edge = clamp((sweep - o.p[0]) / 0.06, 0, 1), t = (o.p[2] - zmin) / ((zmax - zmin) || 1);
      ctx.globalAlpha = 0.35 + 0.65 * edge; ctx.fillStyle = hasCls && o.p[3] != null ? CLS[o.p[3] % CLS.length] : "hsl(" + (205 - t * 175) + ",70%," + (42 + t * 24) + "%)";
      ctx.fillRect(o.q[0] - r / 2, o.q[1] - r / 2, r, r);
    });
    ctx.globalAlpha = 1;
    if (ease(P.a) > 0.2 && ease(P.a) < 1) { var s1 = pr([sweep, ymin, zmin]), s2 = pr([sweep, ymax, zmin]); ctx.strokeStyle = "rgba(242,169,0,0.75)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke(); }
    // extent bar along the ground edge, labelled from the measurement
    var sx = byId("span-x"); if (sx) { var e1 = pr([xmin, ymin, zmin]), e2 = pr([xmax, ymin, zmin]); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e1[0], e1[1] + 8); ctx.lineTo(e1[0], e1[1] + 16); ctx.lineTo(e2[0], e2[1] + 16); ctx.lineTo(e2[0], e2[1] + 8); ctx.stroke(); text(sx.label.text, (e1[0] + e2[0]) / 2, Math.min(Math.max(e1[1], e2[1]) + 16 + minDim * 0.032, st.y + st.h - 2), Math.round(minDim * 0.025), C.ink, { align: "center", w: 600 }); }
    var chips = ["span-y", "span-z", "count"].map(byId).filter(Boolean), cpx = Math.round(minDim * 0.024);
    chips.forEach(function (c, i) { text(c.label.text, st.x + st.w, st.y + cpx * 1.6 * (i + 1), cpx, C.ink, { align: "right", w: 600 }); });
    if (S.thinned) text("thinned for display", st.x + st.w, st.y + cpx * 1.6 * (chips.length + 1), Math.round(minDim * 0.02), C.dim, { align: "right", w: 400 });
  }

  // ---- exploded teardown / projection on a white model
  function parts() {
    var st = stage(), ps = el("part"), exp = S.explode ? ease(clamp((P.b - 0.12) / 0.45, 0, 1)) : 0, yaw = 0.7 + P.b * 0.25, pitch = 0.55;
    var sc = Math.min(st.w * 0.3, st.h * 0.62) * (S.explode ? 0.9 : 1.15), cx = st.x + st.w * 0.36, cy = st.y + st.h * 0.58, pr = view(yaw, pitch, sc, cx, cy);
    var faces = [], cen = [];
    var gp = pr([0, 0, S.explode ? -0.62 : -0.4]); ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.beginPath(); ctx.ellipse(gp[0], gp[1], sc * 0.7, sc * 0.26, 0, 0, 6.2832); ctx.fill();
    var band = (P.b * 1.4 - 0.2) * 1.6 - 0.8;
    ps.forEach(function (p, i) {
      var k = exp * 0.38 * Math.min(1, ease(P.a * 1.4 - i * 0.05)), off = p.dir.map(function (d) { return d * k; });
      var mn = p.box.min.map(function (v, j) { return v + off[j]; }), mx = p.box.max.map(function (v, j) { return v + off[j]; });
      var col = S.explode ? PAL[i % PAL.length] : "#f2f2ee";
      var o = {};
      if (!S.explode) o.fill = function (f, kk) { var wx = (f.pts[0][0] + f.pts[2][0]) / 2 - cx, d = Math.abs(wx / (sc * 0.5) - band), pulse = Math.max(0, 1 - d * 3.2), g = Math.round(kk * 232); var proj = 0.55 * pulse; return "rgb(" + Math.round(g * (1 - proj) + 255 * proj * 0.35) + "," + Math.round(g * (1 - proj) + 190 * proj) + "," + Math.round(g * (1 - proj) + 255 * proj) + ")"; };
      faces = faces.concat(boxFaces(mn, mx, pr, col, o));
      cen.push(pr([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]));
    });
    drawFaces(faces);
    var lx = st.x + st.w * 0.7, lpx = Math.round(minDim * 0.026), gap = Math.min(lpx * 3.4, st.h / (ps.length + 0.3));
    var order = ps.map(function (p, i) { return i; }).sort(function (a, b) { return cen[a][1] - cen[b][1]; }), slot = {}; order.forEach(function (i, r) { slot[i] = r; });
    ps.forEach(function (p, i) {
      var y = st.y + lpx * 1.6 + slot[i] * gap, a = Math.max(0.15, S.explode ? exp : 1);
      ctx.strokeStyle = S.explode ? PAL[i % PAL.length] : "rgba(255,255,255,0.4)"; ctx.globalAlpha = a; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cen[i][0], cen[i][1]); ctx.lineTo(lx - 10, y - lpx * 0.3); ctx.stroke(); ctx.globalAlpha = 1;
      text(p.name, lx, y, lpx, C.ink, { w: 700, alpha: a });
      text(p.label ? p.label.text : p.note, lx, y + lpx * 1.2, Math.round(lpx * 0.82), p.label ? C.dim : C.accent, { w: 500, mono: !!p.label, alpha: a });
    });
  }

  // ---- imagery recipes
  function fit(img, box, mode) { var s = mode === "cover" ? Math.max(box.w / img.width, box.h / img.height) : Math.min(box.w / img.width, box.h / img.height); var w = img.width * s, h = img.height * s; return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w: w, h: h, s: s }; }
  function satellite() {
    var st = stage(), E = byId("image"), img = imgs[E.object], f = fit(img, st, "contain"), z = 1 + 0.18 * P.b, rg = byId("region");
    ctx.save(); ctx.beginPath(); ctx.rect(st.x, st.y, st.w, st.h); ctx.clip();
    var fx = rg ? f.x + (rg.rect.x + rg.rect.w / 2) * f.w : f.x + f.w / 2, fy = rg ? f.y + (rg.rect.y + rg.rect.h / 2) * f.h : f.y + f.h / 2;
    ctx.translate(fx, fy); ctx.scale(z, z); ctx.translate(-fx, -fy); ctx.drawImage(img, f.x, f.y, f.w, f.h);
    if (rg) { var rx = f.x + rg.rect.x * f.w, ry = f.y + rg.rect.y * f.h, rw = rg.rect.w * f.w, rh = rg.rect.h * f.h, k = ease(P.a); ctx.strokeStyle = C.accent; ctx.lineWidth = 3 / z; ctx.setLineDash([rw * 0.1, rw * 0.05]); ctx.strokeRect(rx + rw * (1 - k) / 2, ry + rh * (1 - k) / 2, rw * k, rh * k); ctx.setLineDash([]); text(rg.name, rx, ry - 8, Math.round(minDim * 0.024), C.accent, { w: 700, alpha: k }); }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1; ctx.strokeRect(st.x, st.y, st.w, st.h);
    var ex = byId("extent"), px = Math.round(minDim * 0.026);
    if (ex) { var by = st.y + st.h + px * 0.0; var x1 = fx + (f.x - fx) * z, x2 = fx + (f.x + f.w - fx) * z, yy = Math.min(st.y + st.h, f.y + f.h) - px * 1.6; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x1, yy - 7); ctx.lineTo(x1, yy + 7); ctx.moveTo(x1, yy); ctx.lineTo(x2, yy); ctx.moveTo(x2, yy - 7); ctx.lineTo(x2, yy + 7); ctx.stroke(); var lab = ex.label.text, lw = (font(px, 700), ctx.measureText(lab).width); ctx.fillStyle = "rgba(10,14,18,0.78)"; rr((x1 + x2) / 2 - lw / 2 - 10, yy - px * 1.2 - 8, lw + 20, px * 1.5, 6); ctx.fill(); text(lab, (x1 + x2) / 2, yy - px * 0.2 - 8, px, C.ink, { align: "center", w: 700 }); void by; }
    var cap = S.texts.filter(function (t) { return /^Captured /.test(t.text); })[0]; if (cap) text(cap.text, st.x + st.w - 12, st.y + px * 1.6, px, C.ink, { align: "right", w: 700, mono: true });
    if (!ex) text("extent not supplied", st.x + 12, st.y + px * 1.8, Math.round(px * 0.9), C.accent, { w: 600 });
  }
  function microscope() {
    var st = stage(), E = byId("image"), img = imgs[E.object], d = Math.min(st.w, st.h), cx = st.x + st.w / 2, cy = st.y + st.h / 2, r = d / 2 - 4;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.clip();
    var f = fit(img, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, "cover"), z = 1.05 + 0.1 * P.b; ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); ctx.drawImage(img, f.x, f.y, f.w, f.h); ctx.restore();
    var g = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
    var sb = byId("scale"), px = Math.round(minDim * 0.026), rg = byId("region");
    if (rg) { var rx = f.x + rg.rect.x * f.w, ry = f.y + rg.rect.y * f.h; ctx.save(); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5 / z; ctx.strokeRect(rx, ry, rg.rect.w * f.w, rg.rect.h * f.h); text(rg.name, rx, ry - 8, Math.round(px * 0.9), C.accent, { w: 700 }); ctx.restore(); }
    if (sb) { var barPx = sb.pixels * f.s * z, bx = cx + r - barPx - 8, by = cy + r + px * 0.2 - px * 1.8; ctx.fillStyle = C.ink; ctx.fillRect(bx, by, barPx, 5); ctx.fillRect(bx, by - 6, 2, 17); ctx.fillRect(bx + barPx - 2, by - 6, 2, 17); text(sb.label.text, bx + barPx / 2, by - px * 0.9, px, "#ffffff", { align: "center", w: 700 }); }
    else { var nt = byId("note"); text(nt.text, cx, st.y + st.h + px * 0.2 - 4, px, C.accent, { align: "center", w: 700 }); }
  }
  function archive() {
    var st = stage(), pages = el("page"), n = Math.max(1, pages.length);
    var g = ctx.createRadialGradient(W / 2, st.y + st.h / 2, 10, W / 2, st.y + st.h / 2, Math.max(W, H) * 0.7); g.addColorStop(0, "#fffef6"); g.addColorStop(1, C.bg); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.65)"; rr(st.x, st.y, st.w, st.h, 14); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.stroke();
    var cardH = Math.round(st.h * 0.27), area = { x: st.x, y: st.y, w: st.w, h: st.h - cardH - 10 }, slotW = area.w / n;
    pages.forEach(function (p, i) {
      var img = imgs[p.object], f = fit(img, { x: area.x + slotW * i + 14, y: area.y + 12, w: slotW - 28, h: area.h - 24 }, "contain"), k = ease(clamp(P.a * 1.5 - i * 0.2, 0, 1)), rot = (i - (n - 1) / 2) * 0.03;
      ctx.save(); ctx.translate(f.x + f.w / 2, f.y + f.h / 2 + (1 - k) * 40); ctx.rotate(rot); ctx.globalAlpha = k;
      ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; ctx.fillStyle = "#fff"; ctx.fillRect(-f.w / 2 - 6, -f.h / 2 - 6, f.w + 12, f.h + 12); ctx.shadowColor = "transparent";
      ctx.drawImage(img, -f.w / 2, -f.h / 2, f.w, f.h);
      el("snippet").filter(function (s) { return s.page === i; }).forEach(function (s) { var hx = -f.w / 2 + s.rect.x * f.w, hy = -f.h / 2 + s.rect.y * f.h, hw = s.rect.w * f.w * ease(P.b * 2.2), hh = s.rect.h * f.h; ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = "rgba(255,214,0,0.55)"; ctx.fillRect(hx, hy, hw, hh); ctx.globalCompositeOperation = "source-over"; });
      ctx.restore(); ctx.globalAlpha = 1;
    });
    var cy = area.y + area.h + 10, px = Math.round(minDim * 0.024), p0 = pages[0];
    ctx.fillStyle = C.panel; rr(st.x, cy, st.w, cardH, 12); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.stroke();
    var lines = [p0.title, [p0.date, p0.repository].filter(Boolean).join(" · "), p0.rights ? "Rights: " + p0.rights : ""].filter(Boolean);
    text(lines[0], st.x + 18, cy + px * 1.5, px * 1.1, C.ink, { w: 700 }); for (var i = 1; i < lines.length; i++) text(lines[i], st.x + 18, cy + px * (1.5 + 1.25 * i), px * 0.88, C.dim, { w: 500 });
    var sn = el("snippet")[0]; if (sn) { var qx = st.x + st.w * 0.46, qw = st.w * 0.5, ql = wrap("“" + sn.text + "”", qw, px, 500); ql.forEach(function (l, j) { text(l, qx, cy + px * (1.5 + 1.25 * j), px, C.ink, { w: 500, alpha: ease(P.b * 2.2) }); }); text("located: " + sn.locator, qx, cy + cardH - px * 0.7, px * 0.8, C.accent, { w: 600, mono: true }); }
  }
  function engineering() {
    var st = stage(), cards = el("card"), n = Math.max(1, cards.length), gap = 16, cw = (st.w - gap * (n - 1)) / n;
    var cols = W < H ? 1 : n, rowsN = W < H ? n : 1, cw2 = W < H ? st.w : cw, ch = W < H ? (st.h - gap * (n - 1)) / n : Math.min(st.h, Math.round(minDim * 0.028) * (2.6 + 3.1 * Math.max(1, el("metric").filter(function (m) { return m.card === 0; }).length))); void cols; void rowsN;
    cards.forEach(function (c, i) {
      var x = W < H ? st.x : st.x + i * (cw + gap), y = W < H ? st.y + i * (ch + gap) : st.y, k = ease(clamp(P.a * 1.5 - i * 0.15, 0, 1));
      ctx.globalAlpha = k; ctx.fillStyle = C.panel; rr(x, y + (1 - k) * 24, cw2, ch, 14); ctx.fill(); ctx.strokeStyle = PAL[i % PAL.length]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 14, y + (1 - k) * 24 + 1.5); ctx.lineTo(x + cw2 - 14, y + (1 - k) * 24 + 1.5); ctx.stroke();
      var px = Math.round(minDim * 0.028), yy = y + (1 - k) * 24 + px * 1.9; text(c.name, x + 16, yy, px * 1.15, C.ink, { w: 700 });
      var ms = el("metric").filter(function (m) { return m.card === i; }), rowH = (ch - px * 3) / Math.max(ms.length, 1);
      ms.forEach(function (m, j) { var my = yy + px * 1.1 + j * Math.min(rowH, px * 3.2); text(m.name, x + 16, my + px * 0.9, px * 0.8, C.dim, { w: 500 }); text(m.label.text, x + cw2 - 16, my + px * 0.9, px * 0.95, C.ink, { align: "right", w: 700, mono: true }); ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(x + 16, my + px * 1.25, cw2 - 32, 6); ctx.fillStyle = PAL[i % PAL.length]; ctx.fillRect(x + 16, my + px * 1.25, (cw2 - 32) * m.norm * k, 6); });
      ctx.globalAlpha = 1;
    });
  }

  var DRAW = { "data-physical": dataPhysical, "lidar-survey": lidar, "exploded-teardown": parts, "white-model": parts, "satellite-briefing": satellite, microscope: microscope, "archive-lighttable": archive, "engineering-briefing": engineering };
  function draw() {
    drawnSet = {}; // strings of THIS frame only
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    if (S.blocked) { text(S.title, M, H * 0.3, minDim * 0.058, C.ink, { w: 700 }); text("Blocked: " + S.blocked, M, H * 0.4, minDim * 0.03, C.accent, { w: 600 }); window.__drawnAll = drawnSet; return; }
    if (S.recipe === "archive-lighttable") { DRAW[S.recipe](); chrome(); } else { chrome(); DRAW[S.recipe](); }
    for (var k in drawnSet) allDrawn[k] = 1;
  }
  var allDrawn = {}; window.__drawn = function () { return Object.keys(allDrawn); };
  var tl = window.gsap.timeline({ paused: true });
  tl.fromTo(P, { a: 0 }, { a: 1, duration: 1.4, ease: "power3.out" }, 0).fromTo(P, { b: 0 }, { b: 1, duration: S.duration || 4, ease: "none" }, 0);
  window.__seek = function (t) { tl.time(Math.max(0, Math.min(t, S.duration || 4))); draw(); };
  var ids = {}; (S.elements || []).forEach(function (e) { if (e.object && (e.type === "image" || e.type === "page")) ids[e.object] = 1; });
  var keys = Object.keys(ids), left = keys.length;
  function ready() { window.__seek(0); window.__ready = true; }
  if (!left) ready(); else keys.forEach(function (k) { var im = new Image(); im.onload = function () { imgs[k] = im; if (!--left) ready(); }; im.onerror = function () { console.error("image failed: " + k); }; im.src = window.ASSETS[k]; });
})();
