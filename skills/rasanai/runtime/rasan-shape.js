/* RasanShape: shape-level motion for paused GSAP timelines (morph, draw-on, motion paths, text splitting,
 * seeded scatter, ink, pixel/halftone/dither dissolves, squash, smear, stepped timing).
 *
 * Every function adds a tween to the timeline you pass in; that tween drives a proxy whose setter applies a
 * PURE function of the tween's eased progress. So a frame depends only on the timeline's time: seek anywhere,
 * in any order, any number of times, and the pixels are the same. No Math.random, no wall clock, no rAF.
 *
 *   <script src="assets/rasan-shape/flubber.min.js"></script>      (only needed for morph)
 *   <script src="assets/rasan-shape/rasan-shape.js"></script>      (after GSAP)
 *
 * AO additions (idea from awesome-opus5-5-videos; our code): circular reveals eased by AREA.
 *   RasanShape.iris(tl, target, { at, duration, ease, dir: "open"|"close", center: [x, y], byArea: true })   clip-path circle on an element
 *   RasanShape.flood(tl, host, { at, duration, ease, dir: "open"|"close", color, center: [x, y], byArea: true })  a coloured circle over a frame
 *   RasanShape.circleAt(e, { R, dir, byArea }) -> { r, covered }   the pure radius for eased progress e
 * The eye reads the AREA a circle uncovers, so with byArea (default true, these helpers are new) the radius is R*sqrt(e) opening and
 * R*sqrt(1-e) closing: the area grows at the rate of the ease, not the radius, so an iris never crawls at the start and snaps at the end.
 * byArea: false gives the plain linear radius. Once a flood circle reaches the farthest corner (r >= R) it is drawn as a full-frame
 * rect (no clip-path) and reports covered: true, so no hairline of the underlying frame survives anti-aliasing.
 */
(function (root) {
  "use strict";
  var VERSION = "1.0.0";
  var NS = "http://www.w3.org/2000/svg";

  // ------------------------------------------------------------------ helpers
  function need(cond, msg) { if (!cond) throw new Error("RasanShape: " + msg); }
  function gs() { need(root.gsap, "GSAP must load before rasan-shape.js"); return root.gsap; }
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
  function opt(o, k, d) { return o && o[k] !== undefined && o[k] !== null ? o[k] : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // seeded PRNG (mulberry32): rng(seed)() -> [0,1), the same sequence every time
  function rng(seed) {
    var a = (seed | 0) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // a stable hash of (x, y, seed) in [0,1): per-cell randomness that needs no state
  function hash2(x, y, seed) {
    var h = Math.imul((x | 0) + 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((y | 0) + 0x7F4A7C15, 0xC2B2AE35) ^ Math.imul((seed | 0) + 1, 0x27D4EB2F);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // The one mechanism: a tween on a proxy whose property setter applies f(progress). GSAP assigns the property
  // on every render (seek, scrub, play) whether or not callbacks are suppressed, so frames never go stale.
  function drive(tl, at, duration, ease, apply) {
    need(tl && typeof tl.fromTo === "function", "the first argument must be a GSAP timeline");
    var v = 0, o = {};
    Object.defineProperty(o, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; apply(x); } });
    apply(0);
    tl.fromTo(o, { p: 0 }, { p: 1, duration: Math.max(0.0001, duration), ease: ease || "none", immediateRender: false }, at || 0);
    return o;
  }

  // ------------------------------------------------------------------ morph (flubber)
  function morph(tl, pathEl, toD, o) {
    o = o || {};
    var f = root.flubber;
    need(f && f.interpolate, "morph needs assets/rasan-shape/flubber.min.js loaded first");
    var el = one(pathEl);
    var from = o.from || el.getAttribute("d");
    var to = typeof toD === "string" && /^\s*[Mm]/.test(toD) ? toD : one(toD).getAttribute("d");
    var interp = f.interpolate(from, to, { maxSegmentLength: opt(o, "maxSegmentLength", 8), string: true });
    drive(tl, o.at, opt(o, "duration", 0.8), opt(o, "ease", "power2.inOut"), function (p) {
      el.setAttribute("d", p <= 0 ? from : p === 1 ? to : interp(p));
    });
    return el;
  }

  // ------------------------------------------------------------------ drawOn
  function pathsOf(x) {
    var list = [];
    many(x).forEach(function (e) {
      if (e.tagName && /^(svg|g)$/i.test(e.tagName)) list = list.concat(Array.prototype.slice.call(e.querySelectorAll("path,line,polyline,polygon,circle,ellipse,rect")));
      else list.push(e);
    });
    return list;
  }
  function lenOf(e) { try { return e.getTotalLength() || 0; } catch (err) { return 0; } }
  function drawOn(tl, target, o) {
    o = o || {};
    var paths = pathsOf(target), reverse = !!o.reverse;
    var at = o.at || 0, duration = opt(o, "duration", 1), stagger = opt(o, "stagger", 0);
    paths.forEach(function (e, i) {
      var L = lenOf(e);
      drive(tl, at + i * stagger, duration, opt(o, "ease", "power2.inOut"), function (p) {
        p = clamp(p, 0, 1);
        if (!L) return;
        e.style.strokeDasharray = (p <= 0 && !reverse) || (p >= 1 && reverse) ? "0 " + (L * 2 + 10) : L + " " + (L + 2);
        e.style.strokeDashoffset = reverse ? String(-L * p) : String(L * (1 - p));
        if (p >= 1 && !reverse) { e.style.strokeDasharray = "none"; e.style.strokeDashoffset = "0"; }
      });
    });
    return paths;
  }

  // ------------------------------------------------------------------ followPath
  function followPath(tl, el, pathEl, o) {
    o = o || {};
    var g = gs(), e = one(el), path = one(pathEl), L = lenOf(path);
    need(L > 0, "followPath needs a path with a length");
    var rotate = o.rotate, isSvg = e instanceof SVGElement;
    drive(tl, o.at, opt(o, "duration", 1.2), opt(o, "ease", "power1.inOut"), function (p) {
      var d = L * clamp(p, 0, 1), pt = path.getPointAtLength(d), ang = 0;
      if (rotate !== undefined && rotate !== false) {
        var a = path.getPointAtLength(Math.max(0, d - 0.5)), b = path.getPointAtLength(Math.min(L, d + 0.5));
        ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + (typeof rotate === "number" ? rotate : 0);
      }
      if (isSvg) {
        e.setAttribute("transform", "translate(" + pt.x.toFixed(3) + " " + pt.y.toFixed(3) + ") rotate(" + ang.toFixed(3) + ")");
      } else {
        var m = path.getScreenCTM(), parent = e.offsetParent || document.body, pr = parent.getBoundingClientRect();
        var sx = pt.x, sy = pt.y;
        if (m) { sx = m.a * pt.x + m.c * pt.y + m.e; sy = m.b * pt.x + m.d * pt.y + m.f; }
        var cs = parent === document.body ? { left: 0, top: 0 } : { left: pr.left + parent.clientLeft, top: pr.top + parent.clientTop };
        var x = sx - cs.left - e.offsetLeft - e.offsetWidth / 2, y = sy - cs.top - e.offsetTop - e.offsetHeight / 2;
        var vars = { x: x, y: y };
        if (rotate !== undefined && rotate !== false) vars.rotation = ang;
        g.set(e, vars);
      }
    });
    return e;
  }

  // ------------------------------------------------------------------ split
  function textNodes(el) {
    var out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }
  function split(target, o) {
    o = o || {};
    var el = one(target), by = opt(o, "by", "chars");
    if (el.__rsSplit && el.__rsSplit.by === by) return el.__rsSplit.result;
    var original = el.textContent;
    var chars = [], words = [];
    textNodes(el).forEach(function (node) {
      var txt = node.nodeValue, frag = document.createDocumentFragment();
      txt.split(/(\s+)/).forEach(function (part) {
        if (part === "") return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var w = document.createElement("span");
        w.className = "rs-word"; w.setAttribute("aria-hidden", "true");
        w.style.display = "inline-block"; w.style.whiteSpace = "nowrap";
        if (by === "chars") {
          Array.from(part).forEach(function (ch) {
            var c = document.createElement("span");
            c.className = "rs-char"; c.style.display = "inline-block"; c.textContent = ch;
            w.appendChild(c); chars.push(c);
          });
        } else w.textContent = part;
        words.push(w); frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.setAttribute("aria-label", original);
    var result = words;
    if (by === "chars") result = chars;
    if (by === "lines") {
      var lines = [], cur = null, top = null;
      words.forEach(function (w) {
        var t = w.offsetTop;
        if (top === null || Math.abs(t - top) > 2) { cur = []; lines.push(cur); top = t; }
        cur.push(w);
      });
      result = lines.map(function (ws) {
        var ln = document.createElement("span");
        ln.className = "rs-line"; ln.style.display = "block"; ln.setAttribute("aria-hidden", "true");
        ws[0].parentNode.insertBefore(ln, ws[0]);
        ws.forEach(function (w, i) { if (i) ln.appendChild(document.createTextNode(" ")); ln.appendChild(w); });
        // words keep their inline-block box inside the line; the line is what you animate
        return ln;
      });
      // drop the stray text nodes left between moved words
      Array.prototype.slice.call(el.childNodes).forEach(function (n) { if (n.nodeType === 3 && /^\s*$/.test(n.nodeValue)) n.parentNode.removeChild(n); });
    }
    result.chars = chars; result.words = words; result.el = el; result.by = by;
    el.__rsSplit = { by: by, result: result };
    return result;
  }

  // ------------------------------------------------------------------ scatter
  function scatter(tl, spans, o) {
    o = o || {};
    var g = gs(), list = many(spans), rand = rng(opt(o, "seed", 1));
    var from = opt(o, "from", "random-seeded"), spread = opt(o, "spread", 520), rot = opt(o, "rotate", 140);
    var settle = opt(o, "settle", true), reverse = !!o.reverse, stagger = opt(o, "stagger", 0.018);
    var ease = typeof settle === "string" ? settle : settle ? "back.out(1.4)" : opt(o, "ease", "power3.out");
    var k = list.map(function (e, i) {
      var a = rand() * Math.PI * 2, r = (from === "radius" ? 0.85 + rand() * 0.3 : 0.25 + rand() * 0.75) * spread;
      var dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      return { e: e, dx: dx, dy: dy, rot: (rand() * 2 - 1) * rot, sc: 0.5 + rand() * 1.1 };
    });
    k.forEach(function (c, i) {
      var apply = function (p) {
        var q = reverse ? p : 1 - p; // 1 = fully scattered
        g.set(c.e, { x: c.dx * q, y: c.dy * q, rotation: c.rot * q, scale: 1 + (c.sc - 1) * q });
      };
      drive(tl, (o.at || 0) + i * stagger, opt(o, "duration", 0.9), ease, apply);
    });
    return list;
  }

  // ------------------------------------------------------------------ ink (feTurbulence + feDisplacementMap)
  var svgHost = null, filterN = 0;
  function host() {
    if (svgHost && svgHost.isConnected) return svgHost;
    svgHost = document.createElementNS(NS, "svg");
    svgHost.setAttribute("width", "0"); svgHost.setAttribute("height", "0");
    svgHost.setAttribute("aria-hidden", "true");
    svgHost.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    svgHost.appendChild(document.createElementNS(NS, "defs"));
    document.body.appendChild(svgHost);
    return svgHost;
  }
  function svgEl(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function ink(tl, target, o) {
    o = o || {};
    var el = one(target), mode = opt(o, "mode", "smear"), seed = opt(o, "seed", 7), dir = opt(o, "direction", "out");
    var id = "rs-ink-" + (++filterN);
    var defs = host().querySelector("defs");
    var f = svgEl("filter", { id: id, x: "-30%", y: "-30%", width: "160%", height: "160%", "color-interpolation-filters": "sRGB" }, defs);
    var amount = opt(o, "amount", mode === "smear" ? 220 : mode === "blot" ? 90 : 0);
    var turb, disp, blur, mat, comp, tr, noise;
    if (mode === "smear") {
      // a long horizontal smear: noise stretched along x, displacement growing, a directional blur trailing it
      turb = svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: "0.004 0.03", numOctaves: "2", seed: String(seed), result: "n" }, f);
      disp = svgEl("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "0", xChannelSelector: "R", yChannelSelector: "G", result: "d" }, f);
      blur = svgEl("feGaussianBlur", { in: "d", stdDeviation: "0 0", result: "b" }, f);
      tr = svgEl("feComponentTransfer", { in: "b" }, f);
      svgEl("feFuncA", { type: "linear", slope: "1", intercept: "0" }, tr);
    } else if (mode === "blot") {
      // gooey: displace, blur, then threshold the alpha so edges pool like wet ink and finally vanish
      turb = svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: "0.012 0.012", numOctaves: "3", seed: String(seed), result: "n" }, f);
      disp = svgEl("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "0", xChannelSelector: "R", yChannelSelector: "G", result: "d" }, f);
      blur = svgEl("feGaussianBlur", { in: "d", stdDeviation: "0", result: "b" }, f);
      mat = svgEl("feColorMatrix", { in: "b", type: "matrix", values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" }, f);
    } else {
      // wipe: a noise field thresholded against progress cuts an organic edge through the element
      turb = svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: "0.006 0.01", numOctaves: "4", seed: String(seed), result: "n" }, f);
      noise = svgEl("feColorMatrix", { in: "n", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -14 0 0 0 7", result: "m" }, f);
      comp = svgEl("feComposite", { in: "SourceGraphic", in2: "m", operator: "in" }, f);
    }
    var base = el.style.filter;
    drive(tl, o.at, opt(o, "duration", 0.9), opt(o, "ease", "power2.inOut"), function (p) {
      var q = dir === "in" ? 1 - clamp(p, 0, 1) : clamp(p, 0, 1); // 0 = the element as it is, 1 = gone
      el.style.filter = q <= 0 ? base : "url(#" + id + ")";
      if (mode === "smear") {
        disp.setAttribute("scale", (amount * q).toFixed(2));
        blur.setAttribute("stdDeviation", (q * 38).toFixed(2) + " " + (q * 2).toFixed(2));
        tr.firstChild.setAttribute("slope", (1 - clamp((q - 0.55) / 0.45, 0, 1)).toFixed(3));
      } else if (mode === "blot") {
        disp.setAttribute("scale", (amount * q).toFixed(2));
        blur.setAttribute("stdDeviation", (q * 9).toFixed(2));
        var a = 1 + 17 * clamp(q * 3, 0, 1), b = -(a - 1) * 0.5 - 1.15 * clamp((q - 0.25) / 0.75, 0, 1) * a * 0.5;
        mat.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 " + a.toFixed(3) + " " + b.toFixed(3));
      } else {
        // alpha = clamp(-14*R + 14*0.5 + k) with k sliding so the cut passes through the whole noise range
        var t = 0.2 + 0.6 * (1 - q);
        noise.setAttribute("values", "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -14 0 0 0 " + (14 * t).toFixed(3));
      }
    });
    return el;
  }

  // ------------------------------------------------------------------ dissolve (canvas)
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }
  function dissolve(tl, target, o) {
    o = o || {};
    var src = one(target), mode = opt(o, "mode", "pixel"), cell = Math.max(2, opt(o, "cell", 12)), seed = opt(o, "seed", 3);
    var dir = opt(o, "direction", "out"), colors = opt(o, "colors", ["#14110f", "#f2eee3"]);
    var isCanvas = src.tagName === "CANVAS";
    var W = Math.round(opt(o, "width", isCanvas ? src.width : src.naturalWidth || src.offsetWidth));
    var H = Math.round(opt(o, "height", isCanvas ? src.height : src.naturalHeight || src.offsetHeight));
    need(W > 0 && H > 0, "dissolve: the image has no size yet (wait for it to load)");
    // the source drawn once, and its cell colours
    var sc = document.createElement("canvas"); sc.width = W; sc.height = H;
    var sx = sc.getContext("2d", { willReadFrequently: true });
    sx.drawImage(src, 0, 0, W, H);
    var cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), px = null;
    try {
      var tiny = document.createElement("canvas"); tiny.width = cols; tiny.height = rows;
      var tx = tiny.getContext("2d", { willReadFrequently: true }); tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = "high";
      tx.drawImage(sc, 0, 0, cols, rows);
      px = tx.getImageData(0, 0, cols, rows).data;
    } catch (err) { px = null; }
    need(px, "dissolve: the image is cross-origin (canvas is tainted); serve it from the project");
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var cs = getComputedStyle(src);
    var box = isCanvas || cs.position === "absolute" || cs.position === "fixed";
    cv.style.cssText = "position:absolute;left:" + src.offsetLeft + "px;top:" + src.offsetTop + "px;width:" + (src.offsetWidth || W) + "px;height:" + (src.offsetHeight || H) + "px;pointer-events:none;image-rendering:pixelated;display:none";
    cv.className = src.className;
    src.parentNode.insertBefore(cv, src.nextSibling);
    var cx = cv.getContext("2d");
    function lum(i) { return (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255; }
    function paint(p) {
      var q = dir === "in" ? 1 - clamp(p, 0, 1) : clamp(p, 0, 1);
      if (q <= 0) { cx.clearRect(0, 0, W, H); cv.style.display = "none"; src.style.visibility = ""; return; }
      cv.style.display = ""; src.style.visibility = "hidden";
      cx.clearRect(0, 0, W, H);
      var x, y, i, c;
      if (mode === "pixel") {
        // pixelate (cells grow from the image's own pixels to `cell`), then cells drop out on a seeded schedule
        var grow = clamp(q / 0.55, 0, 1), drop = clamp((q - 0.45) / 0.55, 0, 1);
        var s = Math.max(1, Math.round(lerp(1, cell, grow))), cc = Math.ceil(W / s), rr = Math.ceil(H / s);
        var t = document.createElement("canvas"); t.width = cc; t.height = rr;
        var tc = t.getContext("2d"); tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = "high"; tc.drawImage(sc, 0, 0, cc, rr);
        var d = tc.getImageData(0, 0, cc, rr);
        for (y = 0; y < rr; y++) for (x = 0; x < cc; x++) {
          if (hash2(x, y, seed) < drop) continue;
          i = (y * cc + x) * 4;
          cx.fillStyle = "rgb(" + d.data[i] + "," + d.data[i + 1] + "," + d.data[i + 2] + ")";
          cx.fillRect(x * s, y * s, s, s);
        }
      } else if (mode === "halftone") {
        // the picture breaks into a dot screen (dot size follows tone), then the dots shrink away
        var fadeImg = clamp(1 - q * 2.6, 0, 1), dots = clamp(q * 2.2, 0, 1), shrink = clamp((q - 0.4) / 0.6, 0, 1);
        if (fadeImg > 0) { cx.globalAlpha = fadeImg; cx.drawImage(sc, 0, 0); cx.globalAlpha = 1; }
        for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
          i = (y * cols + x) * 4;
          var ink = 0.38 + 0.62 * (1 - lum(i)), r = cell * 0.62 * Math.sqrt(ink) * (1 - shrink) * dots;
          if (r < 0.4) continue;
          cx.fillStyle = "rgb(" + px[i] + "," + px[i + 1] + "," + px[i + 2] + ")";
          cx.beginPath(); cx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, 6.2832); cx.fill();
        }
      } else {
        // dither: cells flip to a two-tone ordered dither, then are removed in Bayer order
        var toDither = clamp(q / 0.5, 0, 1), away = clamp((q - 0.5) / 0.5, 0, 1);
        for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
          i = (y * cols + x) * 4;
          var th = bayer(x, y);
          if (away > 0 && th < away) continue;
          if (th < toDither) c = lum(i) + (th - 0.5) * 0.35 > 0.5 ? colors[1] : colors[0];
          else c = "rgb(" + px[i] + "," + px[i + 1] + "," + px[i + 2] + ")";
          cx.fillStyle = c;
          cx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }
    drive(tl, o.at, opt(o, "duration", 1.2), opt(o, "ease", "none"), paint);
    return cv;
  }

  // ------------------------------------------------------------------ squash and smear
  function squash(tl, target, o) {
    o = o || {};
    var g = gs(), el = one(target), amount = opt(o, "amount", 0.18), axis = opt(o, "axis", "y");
    if (o.origin) g.set(el, { transformOrigin: o.origin });
    drive(tl, o.at, opt(o, "duration", 0.28), opt(o, "ease", "none"), function (p) {
      // down fast, recover with a small overshoot: s goes 0 -> 1 -> -0.25 -> 0
      p = clamp(p, 0, 1);
      var s = p < 0.3 ? Math.sin(p / 0.3 * Math.PI / 2) : Math.cos((p - 0.3) / 0.7 * Math.PI * 1.5) * (1 - (p - 0.3) / 0.7 * 0.55) * (p < 1 ? 1 : 0);
      if (p >= 1) s = 0;
      var a = 1 - amount * s, b = 1 + amount * s;
      g.set(el, axis === "x" ? { scaleX: a, scaleY: b } : { scaleX: b, scaleY: a });
    });
    return el;
  }
  function smear(tl, target, o) {
    o = o || {};
    var g = gs(), el = one(target), frames = clamp(Math.round(opt(o, "frames", 2)), 1, 3), fps = opt(o, "fps", 30);
    var dir = opt(o, "direction", "right"), length = opt(o, "length", 120);
    var angle = typeof dir === "number" ? dir : { right: 0, down: 90, left: 180, up: 270 }[dir] || 0, rad = angle * Math.PI / 180;
    var clone = el.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll("[id]"), function (n) { n.removeAttribute("id"); });
    clone.removeAttribute("id"); clone.setAttribute("aria-hidden", "true");
    clone.style.cssText += ";position:absolute;margin:0;pointer-events:none;visibility:hidden;transform-origin:0 0;left:" + el.offsetLeft + "px;top:" + el.offsetTop + "px;width:" + el.offsetWidth + "px;height:" + el.offsetHeight + "px";
    el.parentNode.insertBefore(clone, el);
    var w = el.offsetWidth, h = el.offsetHeight, ex = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
    var k = (ex + length) / ex;
    var dur = frames / fps;
    drive(tl, o.at, dur, "none", function (p) {
      if (p <= 0 || p >= 1) { clone.style.visibility = "hidden"; return; }
      var gp = g.getProperty;
      var x = gp(el, "x") || 0, y = gp(el, "y") || 0, r = gp(el, "rotation") || 0, sX = gp(el, "scaleX"), sY = gp(el, "scaleY");
      if (sX === undefined || sX === null) sX = 1; if (sY === undefined || sY === null) sY = 1;
      var cx = w / 2, cy = h / 2, ux = Math.cos(rad), uy = Math.sin(rad);
      var M = new DOMMatrix().translate(x, y).translate(cx, cy).rotate(r).scale(sX, sY).translate(-cx, -cy);
      var lead = M.transformPoint(new DOMPoint(cx + ux * ex / 2, cy + uy * ex / 2));
      // stretch only along the move, anchored at the leading edge, so the copy trails behind the object
      var S = new DOMMatrix().translate(lead.x, lead.y).rotate(angle).scale(k, 1).rotate(-angle).translate(-lead.x, -lead.y);
      var fade = 1 - (p - 0.0) * 0.5;
      clone.style.transform = S.multiply(M).toString();
      clone.style.opacity = String(opt(o, "opacity", 0.55) * fade);
      clone.style.filter = "blur(" + opt(o, "blur", 3) + "px)";
      clone.style.visibility = "visible";
    });
    return clone;
  }

  // ------------------------------------------------------------------ stepped
  // Quantises the time of every tween already on the timeline (or those starting in [from, to]) to `fps`
  // steps: on twos at 12, threes at 8. Call it AFTER the tweens exist. Proxy tweens from this kit step too.
  function stepped(tl, o) {
    o = o || {};
    var fps = opt(o, "fps", 12), from = opt(o, "from", 0), to = opt(o, "to", Infinity);
    (function walk(t) {
      t.getChildren(false, true, true).forEach(function (c) {
        if (typeof c.getChildren === "function") { walk(c); return; }
        var st = c.startTime ? c.startTime() : 0;
        if (t !== tl) st += (t.startTime ? t.startTime() : 0);
        if (st < from || st > to) return;
        var d = c.duration(), n = Math.max(1, Math.round(d * fps));
        var orig = c._ease;
        if (!orig || orig.__rsStepped) return;
        var q = function (p) { return p >= 1 ? orig(1) : orig(Math.floor(p * n) / n); };
        q.__rsStepped = true;
        c._ease = q;
      });
    })(tl);
    return tl;
  }

  // ------------------------------------------------------------------ iris and flood (circle reveals eased by area)
  // the radius of a circle reveal at eased progress e (0..1): R is the radius that covers everything
  function circleAt(e, o) {
    o = o || {}; e = clamp(e, 0, 1);
    var byArea = o.byArea !== false, close = o.dir === "close", R = o.R || 1;
    var k = close ? 1 - e : e;                       // closing is the same curve run from full to nothing
    var r = R * (byArea ? Math.sqrt(k) : k);
    return { r: r, covered: r >= R - 1e-6 };
  }
  // distance from a point to the farthest corner of a w x h box (the radius that covers the whole box)
  function coverR(c, w, h) { return Math.max(Math.hypot(c[0], c[1]), Math.hypot(w - c[0], c[1]), Math.hypot(c[0], h - c[1]), Math.hypot(w - c[0], h - c[1])); }
  function sizeOf(el, o) { return [opt(o, "width", el.offsetWidth || 1920), opt(o, "height", el.offsetHeight || 1080)]; }
  function iris(tl, target, o) {
    o = o || {};
    var el = one(target), ease = opt(o, "ease", "power2.inOut");
    drive(tl, o.at, opt(o, "duration", 0.8), ease, function (p) {
      var wh = sizeOf(el, o), c = o.center || [wh[0] / 2, wh[1] / 2], c2 = circleAt(p, { R: coverR(c, wh[0], wh[1]), dir: o.dir, byArea: o.byArea });
      el.style.clipPath = c2.covered ? "none" : "circle(" + c2.r.toFixed(2) + "px at " + c[0] + "px " + c[1] + "px)";
    });
    return el;
  }
  function flood(tl, hostEl, o) {
    o = o || {};
    var h = one(hostEl), ease = opt(o, "ease", "power2.inOut"), cover = document.createElement("div");
    cover.setAttribute("data-rs-flood", "");
    cover.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:" + opt(o, "z", 1000) + ";background:" + opt(o, "color", "#000") + ";visibility:hidden";
    h.appendChild(cover);
    var covered = false;
    drive(tl, o.at, opt(o, "duration", 0.8), ease, function (p) {
      var wh = sizeOf(h, o), c = o.center || [wh[0] / 2, wh[1] / 2], c2 = circleAt(p, { R: coverR(c, wh[0], wh[1]), dir: o.dir, byArea: o.byArea });
      covered = c2.covered;
      if (c2.r <= 0) { cover.style.visibility = "hidden"; return; }
      cover.style.visibility = "visible";
      cover.style.clipPath = c2.covered ? "none" : "circle(" + c2.r.toFixed(2) + "px at " + c[0] + "px " + c[1] + "px)"; // covered: a full-frame rect
    });
    return { el: cover, get covered() { return covered; } };
  }

  root.RasanShape = {
    version: VERSION,
    rng: rng, hash2: hash2,
    morph: morph, drawOn: drawOn, followPath: followPath, split: split, scatter: scatter,
    iris: iris, flood: flood, circleAt: circleAt, ink: ink, dissolve: dissolve, squash: squash, smear: smear, stepped: stepped,
  };
})(typeof window !== "undefined" ? window : this);
