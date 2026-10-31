/* RasanPixelWorld: the game-world layer on top of RasanPixel (medium-pixel.js, load that first). Original code, RasanAI MIT.
 * Seek-safe: every function is a PURE function of the scene time T you pass in. No Math.random (seeded hash only), no wall clock, no rAF.
 *
 * What it adds to RasanPixel (a surface S from RasanPixel.surface, drawn inside RasanPixel.bind):
 *   1. LEVEL / TILE scenes   tilemap(S, def, camX, camY)             char map + legend -> tiles (flat, brick, grass, water, custom draw)
 *   2. PARALLAX layers       layers(S, defs, cam)                    repeating layers moved by whole pixels from ONE rounded camera;
 *                            built-ins: hills, clouds, stars, skyline (all seeded)
 *   3. PALETTE shifts        shiftPalette(S, keys, T)                day->dusk->night as held steps (>= 0.5 s) over the SAME indices
 *   4. SPRITE SHEETS         sheet(img, o) -> sheet                  slices a Codex-generated grid image (cols x rows) into palette-index frames:
 *                            box-average downscale to the pixel size, chroma-key or alpha, nearest palette. sheet.draw(S, x, y, frame, o);
 *                            frameAt(T, o) is the stepped frame read (8 / 12 fps on twos), never a clock of its own
 *   5. PIXEL TYPE            bigText(S, str, x, y, i, o)             the 3x5 font at integer scale, with outline / shadow; typeOn(str, T, o)
 *   6. PIXEL TRANSITIONS     transition(S, kind, p, o)               "dissolve" | "iris" | "blinds" | "scanline" | "mosaic" | "wipe" | "shatter"
 *                            paints a palette index over the frame at progress p (0..1); call it LAST in drawFn
 * Recipe (the builder's drawFn):
 *   var W = RasanPixelWorld, P = RasanPixel;
 *   var hero = W.sheet(imgEl, { cols: 4, rows: 2, size: [24, 24], chroma: "#00ff00", palette: S.palette });   // after img.decode()
 *   P.bind(tl, S, function (T, s) {
 *     var cam = P.camera(T * 20, 0);
 *     W.shiftPalette(s, [{ at: 0, colors: DAY }, { at: 4, colors: DUSK }, { at: 8, colors: NIGHT }], T);
 *     s.clear(0); W.layers(s, [{ kind: "stars", depth: 0.05, c: 7 }, { kind: "hills", depth: 0.3, c: 2, seed: 3 }], cam);
 *     W.tilemap(s, LEVEL, cam.x, 0); hero.draw(s, 60, 120, W.frameAt(T, { fps: 8, count: 4, start: 0 }));
 *     W.bigText(s, "LEVEL 2", 40, 20, 5, { scale: 3, outline: 0 }); W.transition(s, "iris", W.progress(T, 7, 0.8), { c: 0 });
 *   }, { at: 0, duration: 9 });
 * Import-safe: needs RasanPixel (global or require); sheet() alone needs a document. No file is read here: images are the page's own.
 */
(function (root, factory) {
  var P = typeof module === "object" && module.exports ? (function () { try { return require("./medium-pixel.js"); } catch (e) { return null; } })() : root.RasanPixel;
  var api = factory(P);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RasanPixelWorld = api;
})(typeof self !== "undefined" ? self : this, function (P) {
  "use strict";
  var VERSION = "1.0.0";
  function need(c, m) { if (!c) throw new Error("RasanPixelWorld: " + m); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rd(v) { return Math.floor(v + 0.5); }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function hash01(id, seed, n) { return P ? P.hash01(id, seed, n) : 0.5; }
  function hexRgb(c) { var h = String(c).replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mod(a, n) { return ((a % n) + n) % n; }
  // progress of a window [at, at+dur] in T, held to twos so a transition steps like the art does
  function progress(T, at, dur, fps) { var th = P ? P.hold(T, fps || 12) : T; return clamp((th - at) / Math.max(1e-3, dur), 0, 1); }

  // ---------------------------------------------------------------- 1. tilemap
  // def = { tile: 8, map: ["....", "gggg", "dddd"], legend: { g: { top: 3, fill: 4 }, d: { fill: 4, speckle: 5 }, "#": { brick: [6, 7] }, "~": { water: [1, 2] }, k: { draw: function (S, x, y, t, T) {} } } }
  // ' ' and '.' are empty. A solid tile paints `fill`; `top` paints the first 2 rows, `speckle` seeded dots, `brick` [face, mortar], `water` [a, b] shimmer on twos.
  function tilemap(S, def, camX, camY, T) {
    var t = def.tile || 8, map = def.map, lg = def.legend || {}, x0 = rd(num(camX, 0)), y0 = rd(num(camY, 0)), r, c, ch, e, sx, sy;
    var c0 = Math.max(0, Math.floor(x0 / t)), c1 = Math.min(map[0].length - 1, Math.floor((x0 + S.w) / t));
    var r0 = Math.max(0, Math.floor(y0 / t)), r1 = Math.min(map.length - 1, Math.floor((y0 + S.h) / t));
    var wave = P ? Math.floor(P.hold(num(T, 0), 4) * 4) : 0;
    for (r = r0; r <= r1; r++) for (c = c0; c <= c1; c++) {
      ch = map[r][c]; if (ch === "." || ch === " " || !lg[ch]) continue;
      e = lg[ch]; sx = c * t - x0; sy = r * t - y0;
      if (e.draw) { e.draw(S, sx, sy, t, T, c, r); continue; }
      if (e.brick) { S.rect(sx, sy, t, t, e.brick[0]); S.rect(sx, sy + (t >> 1) - 1, t, 1, e.brick[1]); S.rect(sx + (r % 2 ? t >> 2 : (t * 3) >> 2), sy, 1, t >> 1, e.brick[1]); S.rect(sx + (r % 2 ? (t * 3) >> 2 : t >> 2), sy + (t >> 1), 1, t >> 1, e.brick[1]); continue; }
      if (e.water) { S.rect(sx, sy, t, t, e.water[0]); S.rect(sx + ((wave + c * 3) % t), sy + 2, 3, 1, e.water[1]); S.rect(sx + ((wave * 2 + c * 5) % t), sy + (t >> 1) + 1, 2, 1, e.water[1]); continue; }
      S.rect(sx, sy, t, t, e.fill);
      if (e.top !== undefined) S.rect(sx, sy, t, 2, e.top);
      if (e.speckle !== undefined) { var k; for (k = 0; k < 3; k++) S.put(sx + rd(hash01("sp", c * 31 + r, k) * (t - 1)), sy + 2 + rd(hash01("sq", c * 17 + r, k) * (t - 3)), e.speckle); }
    }
  }

  // ---------------------------------------------------------------- 2. parallax layers
  // defs: [{ kind: "hills"|"clouds"|"stars"|"skyline"|"map"|"draw", depth, c, c2, seed, y, period, def (tilemap), draw(S, ox, oy, T) }]
  // depth 0 = fixed to the screen, 1 = moves with the camera. cam is RasanPixel.camera() (rounded once, shared by every layer).
  function layers(S, defs, cam, T) {
    defs.forEach(function (d, li) {
      var px = P.parallax(cam, num(d.depth, 0.5)), ox = px[0], oy = px[1], seed = num(d.seed, li), x, y, w = S.w, h = S.h, id = d.id || ("L" + li), c = num(d.c, 1), n;
      if (d.kind === "map") { tilemap(S, d.def, -ox, -oy, T); return; }
      if (d.kind === "draw") { d.draw(S, ox, oy, T); return; }
      if (d.kind === "stars") {
        n = d.count || 40;
        for (x = 0; x < n; x++) { var sx = mod(rd(hash01(id, seed, x * 2) * w) + ox, w), sy = rd(hash01(id, seed, x * 2 + 1) * (d.h || h * 0.6)); if ((x + (P ? Math.floor(P.hold(num(T, 0), 3)) : 0)) % 7 !== 0) S.put(sx, sy, c); }
        return;
      }
      if (d.kind === "hills") { // a looping ridge: sum of two seeded sines on whole columns, filled to the bottom
        var base = num(d.y, h * 0.6), amp = num(d.amp, 14), per = num(d.period, w * 1.5), p1 = hash01(id, seed, 1) * 6.283, p2 = hash01(id, seed, 2) * 6.283;
        for (x = 0; x < w; x++) { var u = (x - ox) / per * 6.283; y = rd(base + oy + Math.sin(u + p1) * amp + Math.sin(u * 2.3 + p2) * amp * 0.4); S.rect(x, y, 1, h - y, c); if (d.c2 !== undefined) S.put(x, y, d.c2); }
        return;
      }
      if (d.kind === "clouds") {
        n = d.count || 5; var span = num(d.period, w * 2);
        for (x = 0; x < n; x++) { var cx = mod(rd(hash01(id, seed, x) * span) + ox + rd(num(T, 0) * num(d.drift, 0)), span) - 20, cy = rd(num(d.y, 12) + hash01(id, seed, x + 50) * num(d.spread, 30)), cw = 14 + rd(hash01(id, seed, x + 90) * 14);
          S.rect(cx + 3, cy, cw - 6, 3, c); S.rect(cx, cy + 2, cw, 3, c); S.rect(cx + 5, cy - 2, (cw >> 1), 3, c); }
        return;
      }
      if (d.kind === "skyline") {
        var bw = num(d.bw, 12), cols = Math.ceil(w / bw) + 2, c0 = Math.floor(-ox / bw);
        for (x = c0; x < c0 + cols; x++) { var bh = 16 + rd(hash01(id, seed, mod(x, 64)) * num(d.amp, 40)), bx = x * bw + ox, by = num(d.y, h) - bh + oy; S.rect(bx, by, bw - 1, bh, c);
          if (d.c2 !== undefined) { var wy; for (wy = by + 3; wy < by + bh - 3; wy += 4) if (hash01(id + "w", seed, x * 40 + wy) > 0.45) S.rect(bx + 2, wy, 2, 2, d.c2); } }
        return;
      }
      need(false, "layers: unknown kind " + d.kind);
    });
  }

  // ---------------------------------------------------------------- 3. palette shift
  // keys: [{ at, colors: [#hex...] }] same length. Blended in `steps` held levels between keys (default 6), so the change reads as a
  // few distinct states and never a smooth fade (flicker rule: each level holds >= 0.5 s when the span is 3 s or more).
  function shiftPalette(S, keys, T, o) {
    need(keys && keys.length >= 1, "shiftPalette: keys");
    var steps = (o && o.steps) || 6, i = 0, k0, k1, t;
    while (i < keys.length - 1 && T >= keys[i + 1].at) i++;
    k0 = keys[i]; k1 = keys[Math.min(i + 1, keys.length - 1)];
    t = k1.at > k0.at ? clamp((T - k0.at) / (k1.at - k0.at), 0, 1) : 0; t = Math.floor(t * steps + 1e-9) / steps;
    var rgb = S.palette.rgb, j, a, b;
    for (j = 0; j < rgb.length && j < k0.colors.length; j++) { a = hexRgb(k0.colors[j]); b = hexRgb(k1.colors[j]); rgb[j][0] = rd(a[0] + (b[0] - a[0]) * t); rgb[j][1] = rd(a[1] + (b[1] - a[1]) * t); rgb[j][2] = rd(a[2] + (b[2] - a[2]) * t); }
    return t;
  }

  // ---------------------------------------------------------------- 4. sprite sheets
  // sheet(img, { cols, rows, size: [w, h] (target pixels per frame), palette (RasanPixel palette obj or S.palette), chroma: "#00ff00", tol: 90,
  //              alpha: 0.5 (cut-off when the PNG has alpha), anchor: [x, y], trim: false })
  // Codex sheet rules: flat chroma-green (or transparent) background, a cols x rows grid of equal cells, one pose per cell, no text.
  // The image must be decoded before this runs (await img.decode()); the result is plain index arrays, so drawing needs no canvas.
  function sheet(img, o) {
    need(typeof document !== "undefined", "sheet: needs a document");
    var cols = o.cols | 0, rows = o.rows | 0, sz = o.size || [24, 24], fw = sz[0], fh = sz[1], pal = o.palette && o.palette.rgb ? o.palette : P.palette(o.palette);
    var cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true }), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    need(iw > 0 && cols > 0 && rows > 0, "sheet: image not decoded or grid missing");
    cv.width = iw; cv.height = ih; cx.drawImage(img, 0, 0);
    var data = cx.getImageData(0, 0, iw, ih).data, cw = iw / cols, ch = ih / rows, ck = o.chroma ? hexRgb(o.chroma) : null, tol = num(o.tol, 90), al = num(o.alpha, 0.5) * 255;
    var frames = [], f, fx, fy, x, y, sx0, sy0, sx1, sy1, xx, yy, n, r, g, b, a, idx, best, bd, dr, dg, db, k, fr;
    function nearest(r, g, b) { best = 0; bd = 1e9; for (k = 0; k < pal.rgb.length; k++) { dr = pal.rgb[k][0] - r; dg = pal.rgb[k][1] - g; db = pal.rgb[k][2] - b; var d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (d < bd) { bd = d; best = k; } } return best; }
    for (f = 0; f < cols * rows; f++) {
      fx = f % cols; fy = Math.floor(f / cols); fr = [];
      for (y = 0; y < fh; y++) { var row = []; for (x = 0; x < fw; x++) {
        sx0 = Math.floor(fx * cw + (x / fw) * cw); sx1 = Math.max(sx0 + 1, Math.floor(fx * cw + ((x + 1) / fw) * cw));
        sy0 = Math.floor(fy * ch + (y / fh) * ch); sy1 = Math.max(sy0 + 1, Math.floor(fy * ch + ((y + 1) / fh) * ch));
        r = g = b = a = n = 0;
        for (yy = sy0; yy < sy1; yy++) for (xx = sx0; xx < sx1; xx++) { var p4 = (yy * iw + xx) * 4, pa = data[p4 + 3]; if (ck) { dr = data[p4] - ck[0]; dg = data[p4 + 1] - ck[1]; db = data[p4 + 2] - ck[2]; if (dr * dr + dg * dg + db * db < tol * tol) pa = 0; } if (pa > al) { r += data[p4]; g += data[p4 + 1]; b += data[p4 + 2]; a++; } n++; }
        row.push(a * 2 > n ? nearest(r / a, g / a, b / a) : -1); // majority vote: a cell is solid only when more than half its source is
      } fr.push(row); }
      frames.push(fr);
    }
    var anchor = o.anchor || [fw >> 1, fh - 1];
    return {
      w: fw, h: fh, count: frames.length, frames: frames, anchor: anchor,
      // draw(S, x, y, frame, { flip, swap: { fromIdx: toIdx } }): (x, y) is the anchor on the grid
      draw: function (S, x, y, frame, so) {
        so = so || {}; var F = frames[clamp(frame | 0, 0, frames.length - 1)], ox = rd(x) - anchor[0], oy = rd(y) - anchor[1], rr, c, v;
        for (rr = 0; rr < fh; rr++) for (c = 0; c < fw; c++) { v = F[rr][so.flip ? fw - 1 - c : c]; if (v < 0) continue; if (so.swap && so.swap[v] !== undefined) v = so.swap[v]; S.put(ox + c, oy + rr, v); }
        return { x: ox, y: oy, w: fw, h: fh };
      },
    };
  }
  // frameAt(T, { fps: 8, count, start, mode, row: [first, count] }) -> a frame index on a step grid (RasanPixel.step with a row offset)
  function frameAt(T, o) { var base = o.first | 0; return base + P.step(T, { fps: o.fps || 8, count: o.count || 1, mode: o.mode || "loop", start: o.start || 0, id: o.id, seed: o.seed }); }

  // ---------------------------------------------------------------- 5. pixel type
  // bigText(S, str, x, y, i, { scale: 3, outline: idx, shadow: idx, spacing: 1, reveal: 0..1 (chars shown) }) -> { w, h, ok }
  function bigText(S, str, x, y, i, o) {
    o = o || {}; var sc = Math.max(1, o.scale | 0 || 1), G = P.FONT.glyphs, s = String(str), adv = (P.FONT.w + num(o.spacing, 1)) * sc, shown = o.reveal === undefined ? s.length : Math.floor(clamp(o.reveal, 0, 1) * s.length + 1e-9);
    var ok = true, ci, rr, c, a, b, ch, gl, u, passes = [];
    if (o.outline !== undefined) passes.push([o.outline, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]]);
    if (o.shadow !== undefined) passes.push([o.shadow, [[Math.max(1, sc >> 1), Math.max(1, sc >> 1)]]]);
    passes.push([i, [[0, 0]]]);
    passes.forEach(function (ps) { ps[1].forEach(function (d) {
      for (ci = 0; ci < shown; ci++) { ch = s[ci]; u = /[a-z]/.test(ch) ? ch.toUpperCase() : ch; gl = G[u]; if (!gl) { ok = false; continue; } gl = gl.split("/");
        for (rr = 0; rr < 5; rr++) for (c = 0; c < 3; c++) if (gl[rr][c] === "#") for (a = 0; a < sc; a++) for (b = 0; b < sc; b++) S.put(rd(x) + ci * adv + c * sc + a + d[0], rd(y) + rr * sc + b + d[1], ps[0]); }
    }); });
    return { ok: ok, w: s.length * adv - sc, h: 5 * sc };
  }
  // typeOn(str, T, { at, cps: 14, fps: 12 }) -> the visible prefix, stepped (a cursor blink is the caller's: "_" when hold(T, 2) % 1 < .5)
  function typeOn(str, T, o) { var n = Math.floor(Math.max(0, P.hold(T, (o && o.fps) || 12) - ((o && o.at) || 0)) * ((o && o.cps) || 14) + 1e-9); return String(str).slice(0, n); }

  // ---------------------------------------------------------------- 6. transitions
  // transition(S, kind, p, { c: paletteIndex, seed, cell: 8, dir: 1 }): paints `c` over the frame; p 0 = nothing, 1 = fully covered.
  // Run it forward to cover, then draw the next scene and run it with p = 1 - p to uncover. Pure in p.
  function transition(S, kind, p, o) {
    o = o || {}; p = clamp(p, 0, 1); if (p <= 0) return;
    var c = num(o.c, 0), W = S.w, H = S.h, cell = Math.max(2, o.cell | 0 || 8), x, y, cols, rows, id = o.id || "tr", seed = num(o.seed, 0);
    if (p >= 1) { S.rect(0, 0, W, H, c); return; }
    if (kind === "dissolve") { var lv = p; for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (P.bayer(x, y) < lv) S.put(x, y, c); return; }
    if (kind === "iris") { var rad = (1 - p) * Math.sqrt(W * W + H * H) / 2, cx = num(o.cx, W / 2), cy = num(o.cy, H / 2); for (y = 0; y < H; y++) for (x = 0; x < W; x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > rad * rad) S.put(x, y, c); return; }
    if (kind === "blinds") { var bh = cell; for (y = 0; y < H; y++) if ((y % bh) < Math.ceil(bh * p)) S.rect(0, y, W, 1, c); return; }
    if (kind === "scanline") { var rows2 = rd(H * p); for (y = 0; y < rows2; y += 2) S.rect(0, y, W, 1, c); for (y = H - 1; y >= H - rows2; y -= 2) S.rect(0, y, W, 1, c); return; }
    if (kind === "wipe") { var w2 = rd(W * p); if (o.dir === -1) S.rect(W - w2, 0, w2, H, c); else S.rect(0, 0, w2, H, c); return; }
    if (kind === "mosaic" || kind === "shatter") {
      cols = Math.ceil(W / cell); rows = Math.ceil(H / cell);
      var yc, xc; for (yc = 0; yc < rows; yc++) for (xc = 0; xc < cols; xc++) {
        var when = kind === "mosaic" ? hash01(id, seed, yc * 997 + xc) : clamp((Math.abs(xc - cols / 2) / cols + Math.abs(yc - rows / 2) / rows) + hash01(id, seed, yc * 997 + xc) * 0.25, 0, 0.99);
        if (p >= when) S.rect(xc * cell, yc * cell, cell, cell, c);
      } return;
    }
    need(false, "transition: unknown kind " + kind);
  }

  return { version: VERSION, tilemap: tilemap, layers: layers, shiftPalette: shiftPalette, sheet: sheet, frameAt: frameAt, bigText: bigText, typeOn: typeOn, transition: transition, progress: progress,
    TRANSITIONS: ["dissolve", "iris", "blinds", "scanline", "mosaic", "wipe", "shatter"] };
});
