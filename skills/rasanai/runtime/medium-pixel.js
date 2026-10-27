/* RasanPixel: a genuine low-resolution pixel surface for paused GSAP timelines (medium profile "pixel", execution "pixel-native").
 * Original code. No game sprite, font, palette or melody is copied; the sprite and the 3x5 font below are authored here.
 *
 * What it is: an explicit base grid (e.g. 320x180) drawn on an offscreen canvas and presented to the visible canvas at an INTEGER
 * scale with imageSmoothingEnabled = false. What it is not: a second renderer, clock or timeline. Every draw is a PURE function of the
 * scene time T you pass in (the timeline's time); the optional bind() adds one linear proxy tween to YOUR paused timeline, the same
 * device RasanShape / RasanCamera use. No Math.random, no wall clock, no rAF, no setTimeout. Output fps and audio timing are untouched:
 * a deliberate 8/12 fps sprite is a quantised READ of T, never a change of the film's clock.
 *
 *   var fit = RasanPixel.fit(1920, 1080, { base: [320, 180] });          // -> { scale: 6, ... } integer, recorded policy
 *   var S = RasanPixel.surface(canvasEl, { fit: fit, palette: ["#14121f", "#f2e9d8", "#d9534f", "#4aa3a0"] });
 *   RasanPixel.bind(tl, S, function (T, s) { s.clear(0); s.sprite(RasanPixel.SCOUT, 40, 100, { frame: RasanPixel.step(T, { fps: 8, count: 2, id: "scout", seed: 7 }) }); }, { at: 0, duration: 6 });
 *
 * Import-safe: nothing touches document/window at load; the module works as CommonJS (for fit/step/palette maths) and as a browser global.
 * Unsupported operations are named in CAPABILITY.unsupported; they are never silently flattened to a generic card.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.RasanPixel = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var VERSION = "1.0.0";

  // ------------------------------------------------------------------ helpers
  function need(c, m) { if (!c) throw new Error("RasanPixel: " + m); }
  function opt(o, k, d) { return o && o[k] !== undefined && o[k] !== null ? o[k] : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function rd(v) { return Math.floor(v + 0.5); } // one rounding rule everywhere: half up, so -0.5 and 0.5 do not disagree across layers

  // a stable hash of (a, b) in [0,1): per-object randomness that needs no state, so adding an object never changes another
  function hashStr(s) {
    var h = 2166136261 >>> 0, i;
    s = String(s);
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function hash01(id, seed, n) {
    var h = (hashStr(id) ^ Math.imul((seed | 0) + 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((n | 0) + 0x7F4A7C15, 0xC2B2AE35)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // ------------------------------------------------------------------ fit: base grid + integer scale + recorded policy
  // Common bases (landscape and portrait counterparts). One useful configuration each, not a fixed global format.
  var BASES = [[320, 180], [240, 135], [480, 270], [180, 320], [135, 240], [270, 480], [256, 256], [240, 240]];

  // fit(outW, outH, { base:[w,h], policy:"letterbox"|"crop", dpr, minScale, maxBases })
  //   outW/outH are the OUTPUT size in CSS px of the film stage. dpr (default 1) is the device ratio the surface will be rasterised at;
  //   the integer scale is chosen in DEVICE pixels and the canvas CSS size is derived from it, so DPR is applied exactly once
  //   (never ctx.scale(dpr) on top). -> { baseW, baseH, scale, dpr, drawW, drawH, cssW, cssH, offsetX, offsetY, bars, cropped, policy, exact, notes[] }
  function fit(outW, outH, o) {
    o = o || {};
    outW = num(outW, 0); outH = num(outH, 0);
    need(outW > 0 && outH > 0, "fit: output size must be positive");
    var dpr = clamp(num(opt(o, "dpr", 1), 1), 0.25, 8), policy = opt(o, "policy", "letterbox");
    need(policy === "letterbox" || policy === "crop", 'fit: policy is "letterbox" or "crop"');
    var devW = outW * dpr, devH = outH * dpr, notes = [], base = o.base, best = null, minScale = opt(o, "minScale", 1);

    function plan(b) {
      var sx = devW / b[0], sy = devH / b[1];
      var s = policy === "crop" ? Math.ceil(Math.max(sx, sy) - 1e-9) : Math.floor(Math.min(sx, sy) + 1e-9);
      if (s < minScale) return null;
      var dw = b[0] * s, dh = b[1] * s;
      // waste = the bars (letterbox) or the lost picture (crop), as a share of the frame; lower is better
      var waste = policy === "crop" ? 1 - (devW * devH) / (dw * dh) : 1 - (dw * dh) / (devW * devH);
      return { b: b, s: s, dw: dw, dh: dh, waste: Math.abs(waste), aspect: Math.abs(Math.log((b[0] / b[1]) / (outW / outH))) };
    }

    if (Array.isArray(base)) {
      need(base.length === 2 && base[0] > 0 && base[1] > 0 && base[0] === (base[0] | 0) && base[1] === (base[1] | 0), "fit: base must be [w, h] in whole pixels");
      best = plan(base);
      need(best, "fit: the base grid is larger than the output at an integer scale of " + minScale);
    } else {
      var i, p;
      for (i = 0; i < BASES.length; i++) {
        p = plan(BASES[i]);
        if (!p) continue;
        // prefer: the smallest waste, then the closest aspect, then the larger scale (chunkier pixels read as pixel art on video)
        if (!best || p.waste < best.waste - 1e-9 || (Math.abs(p.waste - best.waste) <= 1e-9 && (p.aspect < best.aspect - 1e-9 || (Math.abs(p.aspect - best.aspect) <= 1e-9 && p.s > best.s)))) best = p;
      }
      need(best, "fit: no preset base fits at an integer scale; pass { base: [w, h] }");
      notes.push("base grid chosen from presets (" + best.b[0] + "x" + best.b[1] + ")");
    }

    var drawW = best.dw, drawH = best.dh;
    var offX = (devW - drawW) / 2, offY = (devH - drawH) / 2;
    // centre on a whole DEVICE pixel: a half-pixel offset would make nearest-neighbour edges uneven
    offX = Math.floor(offX); offY = Math.floor(offY);
    var exact = Math.abs(devW - drawW) < 1e-6 && Math.abs(devH - drawH) < 1e-6;
    var bars = policy === "letterbox" && !exact ? { x: Math.max(0, offX), y: Math.max(0, offY) } : { x: 0, y: 0 };
    var cropped = policy === "crop" && !exact ? { x: Math.max(0, -offX), y: Math.max(0, -offY) } : { x: 0, y: 0 };
    if (!exact) notes.push(policy === "letterbox" ? "intentional letterbox: " + bars.x + "px side / " + bars.y + "px top bars (device px); fill them with the ground colour, never stretch" : "intentional crop: " + cropped.x + "px side / " + cropped.y + "px top lost (device px); keep key pixels out of the margin");
    if (dpr !== 1) notes.push("dpr " + dpr + " applied once through the integer scale (" + best.s + " device px per base pixel); do not also ctx.scale(dpr)");
    if (Math.abs(outW - Math.round(outW)) > 1e-9 || Math.abs(outH - Math.round(outH)) > 1e-9) notes.push("noninteger output size: the grid is still integer-scaled, the remainder is the recorded bars/crop");

    return {
      baseW: best.b[0], baseH: best.b[1], scale: best.s, dpr: dpr,
      drawW: drawW, drawH: drawH,                 // device px
      cssW: drawW / dpr, cssH: drawH / dpr,       // CSS px for the visible canvas
      offsetX: offX, offsetY: offY,               // device px, whole
      cssOffsetX: offX / dpr, cssOffsetY: offY / dpr,
      bars: bars, cropped: cropped, policy: policy, exact: exact, notes: notes,
    };
  }

  // ------------------------------------------------------------------ palette
  function parseHex(c) {
    c = String(c).trim();
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    need(m, "palette colours are #rgb or #rrggbb, got " + c);
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function palette(list) {
    need(Array.isArray(list) && list.length >= 2 && list.length <= 64, "palette: 2 to 64 colours (8 to 32 reads as pixel art)");
    var rgb = list.map(parseHex);
    return {
      colors: list.slice(), rgb: rgb,
      css: function (i) { var c = rgb[clamp(i | 0, 0, rgb.length - 1)]; return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; },
      // nearest palette index to any colour; used to map a brand colour onto the limited palette (palette mapping)
      nearest: function (hex) {
        var t = parseHex(hex), bi = 0, bd = Infinity, i, d, dr, dg, db;
        for (i = 0; i < rgb.length; i++) { dr = rgb[i][0] - t[0]; dg = rgb[i][1] - t[1]; db = rgb[i][2] - t[2]; d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (d < bd) { bd = d; bi = i; } }
        return bi;
      },
    };
  }

  // ------------------------------------------------------------------ time quantisation (sprite poses read T; they never own the clock)
  // step(T, { fps, count, id, seed, mode: "loop"|"once"|"pingpong", start }) -> frame index in [0, count).
  // A stable phase offset from (id, seed) keeps two sprites from marching in lockstep, and adding a sprite never moves another.
  function step(T, o) {
    o = o || {};
    var fps = clamp(num(opt(o, "fps", 8), 8), 1, 30), count = Math.max(1, opt(o, "count", 1) | 0), mode = opt(o, "mode", "loop");
    var start = num(opt(o, "start", 0), 0), phase = o.id !== undefined ? Math.floor(hash01(o.id, opt(o, "seed", 0), 1) * count) : 0;
    var n = Math.floor(Math.max(0, T - start) * fps + 1e-9);
    if (count === 1) return 0;
    if (mode === "once") return Math.min(count - 1, n);
    n += phase;
    if (mode === "pingpong") { var p = n % (2 * count - 2); return p < count ? p : 2 * count - 2 - p; }
    return n % count;
  }
  // the time T held to a step grid: a "twos"/"threes" read for anything that is not a sprite frame (tile pops, palette shifts)
  function hold(T, fps) { fps = clamp(num(fps, 12), 1, 60); return Math.floor(Math.max(0, T) * fps + 1e-9) / fps; }

  // ------------------------------------------------------------------ camera rounding (once, in shared logical pixel space)
  // "pure": every layer moves by whole logical pixels, using the SAME rounded camera, so layers never crawl independently.
  // "mixed": the sharp layers may move by fractions; the pixel layer still snaps to its grid (cam rounded once here).
  function camera(x, y, o) {
    var policy = opt(o, "policy", "pure");
    need(policy === "pure" || policy === "mixed", 'camera: policy is "pure" or "mixed"');
    return { x: rd(x), y: rd(y), policy: policy, raw: [x, y], sharpX: policy === "mixed" ? x : rd(x), sharpY: policy === "mixed" ? y : rd(y) };
  }
  // parallax by whole pixels from ONE rounded camera: depth 0 = fixed, 1 = moves with the camera
  function parallax(cam, depth) { return [rd(-cam.x * depth), rd(-cam.y * depth)]; }

  // ------------------------------------------------------------------ sprites (char grids; "." and " " are transparent)
  // defineSprite({ id, w, h, key: { "a": 1, ... }, frames: { name: [ rowString... ] | [[rows], [rows]] } }) -> sprite. Pure data.
  function defineSprite(d) {
    need(d && d.id && d.w > 0 && d.h > 0 && d.key && d.frames, "defineSprite: id, w, h, key, frames");
    var names = Object.keys(d.frames), frames = {}, k, i, f;
    for (k = 0; k < names.length; k++) {
      f = d.frames[names[k]];
      if (typeof f[0] === "string") f = [f]; // a single frame given as rows
      frames[names[k]] = f.map(function (rows) {
        need(rows.length === d.h, "sprite " + d.id + "/" + names[k] + ": " + d.h + " rows expected");
        return rows.map(function (r) { need(r.length === d.w, "sprite " + d.id + "/" + names[k] + ": rows are " + d.w + " wide"); return r; });
      });
    }
    return { id: d.id, w: d.w, h: d.h, key: d.key, frames: frames, anchor: d.anchor || [d.w >> 1, d.h - 1], original: d.original !== false };
  }

  // An ORIGINAL 12x12 scout (a small round lantern-bearer). Invented here; not any game's character.
  // key: a=outline, b=body, c=belly/face light, d=accent (lamp), e=eye
  var SCOUT = defineSprite({
    id: "scout", w: 12, h: 12, anchor: [6, 11],
    key: { a: 0, b: 1, c: 2, d: 3, e: 0 },
    frames: {
      idle: [
        ["....aaaa....", "...abbbba...", "..abbbbbba..", "..abebbebba.", "..abbbbbba..", "..abcccba...", "...abbbbaa..", "...abbbbad..", "...abbbbaa..", "...aa..aa...", "..aaa..aaa..", "............"],
        ["............", "....aaaa....", "...abbbba...", "..abebbebba.", "..abbbbbba..", "..abcccba...", "...abbbbaa..", "...abbbbad..", "...abbbbaa..", "...aa..aa...", "..aaa..aaa..", "............"],
      ],
      walk: [
        ["....aaaa....", "...abbbba...", "..abbbbbba..", "..abebbebba.", "..abbbbbba..", "..abcccba...", "...abbbbaa..", "...abbbbad..", "...abbbbaa..", "...aa...aa..", "..aaa...aaa.", "............"],
        ["....aaaa....", "...abbbba...", "..abbbbbba..", "..abebbebba.", "..abbbbbba..", "..abcccba...", "...abbbbaa..", "...abbbbad..", "...abbbbaa..", "....aa.aa...", "...aaa.aaa..", "............"],
      ],
      point: [
        ["....aaaa....", "...abbbba...", "..abbbbbba..", "..abebbebba.", "..abbbbbba.a", "..abcccbaaaa", "...abbbba..a", "...abbbbad..", "...abbbbaa..", "...aa..aa...", "..aaa..aaa..", "............"],
      ],
      react: [
        ["...aaaaaa...", "..abbbbbba..", ".abbbbbbbba.", ".abebbbbebba", ".abbbccbbba.", "..abbbbbba..", "..abbbbbba..", "...abbbbad..", "...abbbbaa..", "...aa..aa...", "..aaa..aaa..", "............"],
      ],
    },
  });

  // ------------------------------------------------------------------ an original 3x5 bitmap font (uppercase, digits, a few marks)
  // Original glyphs. Anything outside this set is reported in `missing`; the caller then uses a crisp separate text layer.
  var G = {
    "A": ".#./#.#/###/#.#/#.#", "B": "##./#.#/##./#.#/##.", "C": ".##/#../#../#../.##", "D": "##./#.#/#.#/#.#/##.",
    "E": "###/#../##./#../###", "F": "###/#../##./#../#..", "G": ".##/#../#.#/#.#/.##", "H": "#.#/#.#/###/#.#/#.#",
    "I": "###/.#./.#./.#./###", "J": "..#/..#/..#/#.#/.#.", "K": "#.#/#.#/##./#.#/#.#", "L": "#../#../#../#../###",
    "M": "#.#/###/###/#.#/#.#", "N": "##./#.#/#.#/#.#/#.#", "O": ".#./#.#/#.#/#.#/.#.", "P": "##./#.#/##./#../#..",
    "Q": ".#./#.#/#.#/##./.##", "R": "##./#.#/##./#.#/#.#", "S": ".##/#../.#./..#/##.", "T": "###/.#./.#./.#./.#.",
    "U": "#.#/#.#/#.#/#.#/###", "V": "#.#/#.#/#.#/#.#/.#.", "W": "#.#/#.#/###/###/#.#", "X": "#.#/#.#/.#./#.#/#.#",
    "Y": "#.#/#.#/.#./.#./.#.", "Z": "###/..#/.#./#../###",
    "0": "###/#.#/#.#/#.#/###", "1": ".#./##./.#./.#./###", "2": "##./..#/.#./#../###", "3": "##./..#/.#./..#/##.",
    "4": "#.#/#.#/###/..#/..#", "5": "###/#../##./..#/##.", "6": ".##/#../###/#.#/###", "7": "###/..#/.#./.#./.#.",
    "8": "###/#.#/###/#.#/###", "9": "###/#.#/###/..#/##.",
    ".": ".../.../.../.../.#.", ",": ".../.../.../.#./#..", "!": ".#./.#./.#./.../.#.", "?": "##./..#/.#./.../.#.",
    ":": ".../.#./.../.#./...", "-": ".../.../###/.../...", "'": ".#./.#./.../.../...", " ": ".../.../.../.../...",
  };
  var FONT = { id: "rasan-3x5", w: 3, h: 5, advance: 4, lineHeight: 6, glyphs: G, original: true, coverage: "A-Z 0-9 . , ! ? : - ' space (case-folded; no accents, no non-Latin scripts)" };

  // measureText(str) -> { ok, w, h, missing[] }. Case-folds with toUpperCase only for plain ASCII letters; accented and non-Latin
  // characters are NEVER substituted: they come back in `missing` so the caller routes the string to a sharp text layer.
  function measureText(str, o) {
    var wrap = opt(o, "maxW", 0), lines = layoutText(str, wrap), miss = [], seen = {}, i, ch;
    str = String(str);
    for (i = 0; i < str.length; i++) {
      ch = str[i];
      var u = /[a-z]/.test(ch) ? ch.toUpperCase() : ch;
      if (ch === "\n") continue;
      if (!G[u] && !seen[ch]) { seen[ch] = 1; miss.push(ch); }
    }
    var w = 0; lines.forEach(function (l) { w = Math.max(w, l.length * FONT.advance - 1); });
    return { ok: miss.length === 0, w: Math.max(0, w), h: lines.length ? lines.length * FONT.lineHeight - 1 : 0, lines: lines, missing: miss };
  }
  // greedy word wrap in base pixels (maxW = 0 means no wrap). Long unbroken words are split, never overflowed past maxW.
  function layoutText(str, maxW) {
    var per = maxW > 0 ? Math.max(1, Math.floor((maxW + 1) / FONT.advance)) : 1e9, out = [];
    String(str).split("\n").forEach(function (para) {
      var words = para.split(" "), cur = "";
      words.forEach(function (w) {
        while (w.length > per) { if (cur) { out.push(cur); cur = ""; } out.push(w.slice(0, per)); w = w.slice(per); }
        if (!cur) cur = w; else if ((cur + " " + w).length <= per) cur += " " + w; else { out.push(cur); cur = w; }
      });
      out.push(cur);
    });
    return out;
  }

  // ------------------------------------------------------------------ dither (ordered Bayer 4x4; deliberate, static pattern)
  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(x, y) { return (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16; }

  // ------------------------------------------------------------------ tiles: assemble from nothing, in a seeded order, on a step grid
  // tileAssemble(T, { id, seed, cols, rows, at, duration, fps }) -> { done, progress, shown(c, r) -> bool, drop(c, r) -> whole-pixel y offset }
  // Each tile has a stable arrival time from (id, seed, c, r); there is no shared state, so seeking anywhere gives the same picture.
  function tileAssemble(T, o) {
    var cols = o.cols | 0, rows = o.rows | 0, at = num(o.at, 0), dur = Math.max(1e-3, num(o.duration, 1)), fps = num(o.fps, 12), seed = num(o.seed, 0), id = o.id || "tiles";
    var th = hold(T, fps), p = clamp((th - at) / dur, 0, 1), dropPx = opt(o, "dropPx", 6) | 0, spread = 0.7;
    function when(c, r) { return hash01(id, seed, c * 4099 + r) * spread; } // arrival in [0, spread) of the duration
    return {
      progress: p, done: p >= 1,
      shown: function (c, r) { return p >= when(c, r); },
      drop: function (c, r) { var w = when(c, r), q = clamp((p - w) / (1 - spread + 1e-6), 0, 1); return q >= 1 ? 0 : -rd(dropPx * (1 - q)); },
    };
  }

  // ------------------------------------------------------------------ the surface
  // surface(canvas, { fit, palette, ground, ownerDoc }) -> drawing handle. Browser only; created lazily so import stays safe.
  function surface(canvas, o) {
    need(canvas && canvas.getContext, "surface: pass a <canvas>");
    var F = o && o.fit; need(F && F.baseW, "surface: pass { fit } from RasanPixel.fit()");
    var pal = o.palette && o.palette.rgb ? o.palette : palette(o.palette);
    var doc = canvas.ownerDocument || (typeof document !== "undefined" ? document : null);
    need(doc, "surface: no document");
    var low = doc.createElement("canvas"); low.width = F.baseW; low.height = F.baseH;
    var lx = low.getContext("2d"), img = lx.createImageData(F.baseW, F.baseH), px = img.data, W = F.baseW, H = F.baseH;
    // visible canvas: backing store = the DEVICE size of the drawn grid (integer multiple of the base); CSS size = backing / dpr
    canvas.width = F.drawW; canvas.height = F.drawH;
    canvas.style.width = F.cssW + "px"; canvas.style.height = F.cssH + "px";
    canvas.style.position = canvas.style.position || "absolute";
    canvas.style.left = F.cssOffsetX + "px"; canvas.style.top = F.cssOffsetY + "px";
    canvas.style.imageRendering = "pixelated"; // belt and braces; the real guarantee is imageSmoothingEnabled = false below
    var vx = canvas.getContext("2d");
    var S = { fit: F, palette: pal, w: W, h: H, canvas: canvas, low: low };

    function put(x, y, i) { // plot palette index i at whole base pixel (x, y); i < 0 = no-op
      x = rd(x); y = rd(y);
      if (i < 0 || x < 0 || y < 0 || x >= W || y >= H) return;
      var c = pal.rgb[i], o4 = (y * W + x) * 4; px[o4] = c[0]; px[o4 + 1] = c[1]; px[o4 + 2] = c[2]; px[o4 + 3] = 255;
    }
    S.put = put;
    S.clear = function (i) { var c = pal.rgb[i | 0], k; for (k = 0; k < W * H; k++) { px[k * 4] = c[0]; px[k * 4 + 1] = c[1]; px[k * 4 + 2] = c[2]; px[k * 4 + 3] = 255; } };
    S.clearTransparent = function () { var k; for (k = 0; k < px.length; k++) px[k] = 0; };
    S.rect = function (x, y, w, h, i) { var a, b; x = rd(x); y = rd(y); for (b = 0; b < rd(h); b++) for (a = 0; a < rd(w); a++) put(x + a, y + b, i); };
    S.ditherRect = function (x, y, w, h, a, b, level) { // level 0..1 of colour b over colour a, Bayer ordered
      var i, j; x = rd(x); y = rd(y);
      for (j = 0; j < rd(h); j++) for (i = 0; i < rd(w); i++) put(x + i, y + j, bayer(x + i, y + j) < level ? b : a);
    };
    // sprite(sp, x, y, { frame, anim, flip, colors: {key:index}}): (x, y) is the sprite's ANCHOR on the grid, rounded once here
    S.sprite = function (sp, x, y, so) {
      so = so || {};
      var anim = sp.frames[opt(so, "anim", "idle")] || sp.frames[Object.keys(sp.frames)[0]], fr = anim[clamp(opt(so, "frame", 0) | 0, 0, anim.length - 1)];
      var ox = rd(x) - sp.anchor[0], oy = rd(y) - sp.anchor[1], flip = !!so.flip, r, c, ch, idx;
      for (r = 0; r < sp.h; r++) for (c = 0; c < sp.w; c++) {
        ch = fr[r][flip ? sp.w - 1 - c : c];
        if (ch === "." || ch === " ") continue;
        idx = so.colors && so.colors[ch] !== undefined ? so.colors[ch] : sp.key[ch];
        if (idx !== undefined) put(ox + c, oy + r, idx);
      }
      return { x: ox, y: oy, w: sp.w, h: sp.h }; // the sprite's box in base pixels (for reserved-region checks)
    };
    // text(str, x, y, colorIndex, { maxW }) -> measure result. Refuses (returns ok:false, draws nothing) when a glyph is missing.
    S.text = function (str, x, y, i, to) {
      var m = measureText(str, to);
      if (!m.ok) return m;
      var r, c, ln, gl, rows;
      for (ln = 0; ln < m.lines.length; ln++) for (c = 0; c < m.lines[ln].length; c++) {
        var chh = m.lines[ln][c], u = /[a-z]/.test(chh) ? chh.toUpperCase() : chh; gl = G[u].split("/");
        for (r = 0; r < 5; r++) for (rows = 0; rows < 3; rows++) if (gl[r][rows] === "#") put(rd(x) + c * FONT.advance + rows, rd(y) + ln * FONT.lineHeight + r, i);
      }
      return m;
    };
    // present(): the ONLY scaling step. Nearest-neighbour, integer scale, no smoothing, DPR already inside the scale.
    S.present = function () {
      lx.putImageData(img, 0, 0);
      vx.imageSmoothingEnabled = false;
      if ("mozImageSmoothingEnabled" in vx) vx.mozImageSmoothingEnabled = false;
      if ("webkitImageSmoothingEnabled" in vx) vx.webkitImageSmoothingEnabled = false;
      vx.setTransform(1, 0, 0, 1, 0, 0);
      vx.clearRect(0, 0, canvas.width, canvas.height);
      vx.drawImage(low, 0, 0, W, H, 0, 0, W * F.scale, H * F.scale); // W*scale === canvas.width by construction
    };
    // base pixel <-> stage CSS px (for aligning a sharp layer to the grid)
    S.toStage = function (bx, by) { return [F.cssOffsetX + (bx * F.scale) / F.dpr, F.cssOffsetY + (by * F.scale) / F.dpr]; };
    S.fromStage = function (sx, sy) { return [((sx - F.cssOffsetX) * F.dpr) / F.scale, ((sy - F.cssOffsetY) * F.dpr) / F.scale]; };
    return S;
  }

  // ------------------------------------------------------------------ one proxy tween on YOUR paused timeline
  // bind(tl, S, drawFn(T, S), { at, duration }) -> draws S at tl.time() whenever the playhead moves. drawFn must be pure in T.
  function bind(tl, S, drawFn, o) {
    need(tl && typeof tl.fromTo === "function", "bind: pass a GSAP timeline");
    need(typeof drawFn === "function", "bind: pass drawFn(T, surface)");
    var v = 0, h = {}, at = num(opt(o, "at", 0), 0), dur = Math.max(1e-4, num(opt(o, "duration", tl.duration ? tl.duration() : 1), 1));
    function paint() { drawFn(tl.time(), S); S.present(); }
    Object.defineProperty(h, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; paint(); } });
    tl.fromTo(h, { p: 0 }, { p: 1, duration: dur, ease: "none", immediateRender: false }, at);
    paint();
    return { paint: paint };
  }

  // ------------------------------------------------------------------ capability record (honest state; never "verified")
  var CAPABILITY = {
    profile_id: "pixel", execution_id: "pixel-native", module: "runtime/medium-pixel.js", version: VERSION, state: "implemented_unvalidated", verified: false,
    adapters: {
      native_actions: { "tile-assemble": "RasanPixel.tileAssemble + surface.rect/sprite", "sprite-act": "RasanPixel.step + surface.sprite (anim idle/walk/point/react)", "palette-reveal": "RasanPixel.palette().nearest + surface.ditherRect, shifted on RasanPixel.hold(T)" },
      fit: "RasanPixel.fit(outW, outH, { base, policy, dpr })", camera: "RasanPixel.camera + parallax (round once in logical space)",
      layers: { pixel: "nearest-neighbor via surface.present()", exact_text: "separate sharp DOM/SVG layer (not pixelated)" },
    },
    finish_requirements: {
      pixel: "nearest-neighbor, integer scale, no smoothing, no blur or bit-crush over the frame; sprites whole-pixel positioned; sprite fps is its own read of T",
      sharp: "required copy, exact UI, qualifiers, accented/non-Latin and long text stay full-resolution DOM/SVG on their own layer",
      flicker: "no full-frame flashing; no copying a source blink rate; palette shifts held >= 0.5 s or faded by dither",
    },
    unsupported: [
      "pixelating or bit-crushing a captured/real interface and calling it readable",
      "pixel text for scripts or accents outside rasan-3x5 (use a sharp text layer or an approved licensed/original pixel font with those glyphs)",
      "multilingual shaping, bidi or ligatures on the pixel grid",
      "automatic points, levels, health bars, rewards or other gameplay semantics (only editorial, and labelled as such)",
      "non-integer pixel scaling or non-uniform stretch",
      "game sprites, game UI, names, melodies or fonts from any reference",
      "arbitrary object-level editing of rendered canvas pixels (the canvas layer is the editable unit)",
    ],
  };

  return {
    version: VERSION, BASES: BASES, CAPABILITY: CAPABILITY, FONT: FONT, SCOUT: SCOUT,
    fit: fit, palette: palette, step: step, hold: hold, camera: camera, parallax: parallax, defineSprite: defineSprite,
    measureText: measureText, bayer: bayer, tileAssemble: tileAssemble, surface: surface, bind: bind, hash01: hash01, round: rd,
  };
});
