/* RasanMediumPaper: P03 tactile paper and collage, original vector-cut paper (the no-download fallback; it is paper-cut,
 * NOT stop-motion photography, and says so in describeElements()). Built on RasanMediumSurface.
 *
 *   RasanMediumPaper.createPaperCollageScene({root, width, height, seed, design, content, assets})
 *     -> { ready, setTime(t), describeElements(), destroy(), surface }
 *
 * content: { logical?, background?, shadows?: false, stepFps?: null, pieces: [piece, ...] }
 * piece:   { id, layer (paint order, int), kind: "rect"|"poly", w,h | pts, x, y, rot, fill, back?, grain?, edge: {rough, steps},
 *            track: [{t,x,y,rot,ease}]            hinged/pivoted motion: rot turns about piece.pivot {x,y} (local)
 *            step: fps                            deliberate stepped posing: this piece reads quantized time
 *            reveal: {at,dur,dir}                 masked reveal: a clipPath rect grows over the piece (dir left|right|up|down)
 *            fold:   {x,at,dur,to?,back}          a flap beyond local x folds over the body: the visible plane and mask change
 *            text:   {value,size,dx,dy,fill}      crisp SVG text overlay (never baked into a texture)
 *            photo:  {asset}                      only when the approved resolver supplies it; missing asset throws }
 * Cached: edge geometry is computed once at build from (seed, piece.id), never per frame. Shadows derive from layer order
 * and only when content.shadows === true. Paper grain is an optional separable decor layer (role "decor") and is never
 * applied over evidence text. Limits: flat polygons only (no curved paper bend, no real cloth/physics); the fold is a
 * single straight crease; stacking shadow is a hard offset, not soft light simulation.
 */
(function (root, factory) {
  var S = (typeof module === "object" && module.exports) ? require("./medium-surface.js") : root.RasanMediumSurface;
  if (typeof module === "object" && module.exports) module.exports = factory(S);
  else root.RasanMediumPaper = factory(S);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";
  var VERSION = "1.0.0";
  var need = S.need, finite = S.finite, prog = S.prog, ease = S.ease;

  function fmt(n) { return Math.round(n * 100) / 100; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeOf(n) { var f = ease[n || "inOut"]; need(typeof f === "function", "unknown ease " + n); return f; }
  function basePoly(p) {
    if (p.kind === "poly") { need(Array.isArray(p.pts) && p.pts.length >= 3, "poly needs >= 3 pts"); p.pts.forEach(function (q) { finite(q[0], "pt.x"); finite(q[1], "pt.y"); }); return p.pts; }
    need(p.kind === "rect" || p.kind == null, "unknown piece kind " + p.kind);
    var w = finite(p.w, "piece.w", 1) / 2, h = finite(p.h, "piece.h", 1) / 2; return [[-w, -h], [w, -h], [w, h], [-w, h]];
  }
  // Hand-cut edge: each edge is subdivided and nudged once by the piece's own seeded stream. Cached in the piece record.
  function cutEdge(pts, rnd, rough, steps) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      for (var s = 0; s < steps; s++) {
        var u = s / steps, jx = s === 0 ? 0 : (rnd() - 0.5) * 2 * rough, jy = s === 0 ? 0 : (rnd() - 0.5) * 2 * rough;
        out.push([lerp(a[0], b[0], u) + jx, lerp(a[1], b[1], u) + jy]);
      }
    }
    return out;
  }
  function polyD(pts) { return "M" + pts.map(function (p) { return fmt(p[0]) + " " + fmt(p[1]); }).join(" L") + " Z"; }
  function bbox(pts) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); return { x0: x0, y0: y0, x1: x1, y1: y1 }; }

  function createPaperCollageScene(cfg) {
    need(cfg && cfg.content, "content required");
    var c0 = {}; for (var k in cfg) c0[k] = cfg[k];
    c0.build = function (surf, ctx) {
      var content = ctx.content, d = ctx.design.palette || {}, paper = d.paper || "#f2ede2", ink = d.ink || "#1d1c1a";
      var lw = (content.logical && content.logical.w) || surf.width, lh = (content.logical && content.logical.h) || surf.height;
      var T = S.makeTransform(lw, lh, surf.width, surf.height, "contain");
      var view = surf.group("view");
      surf.set(view, { transform: "translate(" + fmt(T.x) + " " + fmt(T.y) + ") scale(" + fmt(T.scale) + ")" });
      surf.node("rect", { x: 0, y: 0, width: lw, height: lh, fill: content.background || paper }, view, "bg", "decor");
      var shadows = content.shadows === true, defaults = [d.accent || "#d6553a", d.accent2 || "#3b7ea1", d.accent3 || "#e8b64c", "#7a8f5c"];
      var pieces = (Array.isArray(content.pieces) && content.pieces.length ? content.pieces : need(false, "content.pieces required") ).slice();
      pieces.forEach(function (p, i) { need(p && typeof p.id === "string", "piece needs id"); p._i = i; finite(p.layer == null ? i : p.layer, "piece.layer"); });
      pieces.sort(function (a, b) { return (a.layer == null ? a._i : a.layer) - (b.layer == null ? b._i : b.layer) || a._i - b._i; });   // paint order = layer order
      var recs = pieces.map(function (p, idx) {
        var base = basePoly(p), edge = p.edge || {}, rough = edge.rough == null ? 2.2 : finite(edge.rough, "edge.rough", 0, 40);
        var cut = rough > 0 ? cutEdge(base, ctx.rngFor("edge:" + p.id), rough, edge.steps || 5) : base;          // cached once
        var fill = p.fill || defaults[idx % defaults.length];
        if (p.photo) { need(ctx.assets && ctx.assets[p.photo.asset], "photo asset " + p.photo.asset + " is not supplied by the approved resolver"); }
        var g = surf.group("paper-" + p.id, view, "shape"), body = surf.group("body-" + p.id, g, "shape");
        var rec = { p: p, g: g, cut: cut, base: base, fill: fill, layer: p.layer == null ? p._i : p.layer, mode: p.fold ? "fold" : p.reveal ? "mask" : p.track ? "hinge" : "static" };
        if (shadows) rec.shadow = surf.node("path", { d: polyD(cut), fill: "#000", opacity: 0.18, transform: "translate(" + (3 + idx) + " " + (4 + idx) + ")" }, g, "shadow-" + p.id, "decor");
        // fold: body keeps the part left of the crease; a flap polygon (right of the crease) rotates over it.
        if (p.fold) {
          var bb = bbox(cut), fx = finite(p.fold.x, "fold.x");
          need(fx > bb.x0 && fx < bb.x1, "fold.x must cross the piece");
          surf.node("clipPath", {}, g, "foldA-" + p.id, "decor").appendChild(surf.node("rect", { x: bb.x0 - 4, y: bb.y0 - 4, width: fx - bb.x0 + 4, height: bb.y1 - bb.y0 + 8 }, null));
          surf.node("clipPath", {}, g, "foldB-" + p.id, "decor").appendChild(surf.node("rect", { x: fx, y: bb.y0 - 4, width: bb.x1 - fx + 4, height: bb.y1 - bb.y0 + 8 }, null));
          rec.main = surf.node("path", { d: polyD(cut), fill: fill, "clip-path": "url(#foldA-" + p.id + ")" }, body, "front-" + p.id, "shape");
          rec.flapG = surf.group("flap-" + p.id, g, "shape");
          rec.flap = surf.node("path", { d: polyD(cut), fill: fill, "clip-path": "url(#foldB-" + p.id + ")" }, rec.flapG);
          rec.crease = surf.node("line", { x1: fx, y1: bb.y0, x2: fx, y2: bb.y1, stroke: "#000", "stroke-width": 1.5, opacity: 0 }, g, "crease-" + p.id, "decor");
          rec.fx = fx;
        } else {
          rec.main = surf.node("path", { d: polyD(cut), fill: fill }, body, "front-" + p.id, "shape");
        }
        if (p.photo) { var bb2 = bbox(cut); surf.node("image", { href: ctx.assets[p.photo.asset], x: bb2.x0, y: bb2.y0, width: bb2.x1 - bb2.x0, height: bb2.y1 - bb2.y0, preserveAspectRatio: "xMidYMid slice", "clip-path": null }, body, "photo-" + p.id, "shape"); }
        // optional grain: separable decor, clipped to this piece's own paper only (never over evidence text)
        if (p.grain) {
          var rr = ctx.rngFor("grain:" + p.id), bb3 = bbox(cut), n = Math.min(60, p.grain.count || 30), dots = surf.group("grain-" + p.id, body, "decor");
          for (var q = 0; q < n; q++) surf.node("circle", { cx: fmt(lerp(bb3.x0, bb3.x1, rr())), cy: fmt(lerp(bb3.y0, bb3.y1, rr())), r: fmt(0.6 + rr() * 1.4), fill: ink, opacity: 0.07 }, dots);
        }
        if (p.reveal) {
          var bb4 = bbox(cut), cp = surf.node("clipPath", {}, g, "mask-" + p.id, "decor");
          rec.maskRect = surf.node("rect", { x: bb4.x0 - 4, y: bb4.y0 - 4, width: 0, height: 0 }, cp); rec.mb = bb4;
          surf.set(body, { "clip-path": "url(#mask-" + p.id + ")" });
        }
        rec.body = body;
        if (p.text) {            // crisp text lives above the paper, unrotated texture-free, same hinge as its piece
          rec.txt = surf.node("text", { x: finite(p.text.dx || 0, "text.dx"), y: finite(p.text.dy || 0, "text.dy"), "text-anchor": "middle", fill: p.text.fill || ink, "font-size": p.text.size || 32, "font-family": p.text.font || "inherit" }, g, "text-" + p.id, "evidence");
          rec.txt.textContent = String(p.text.value);
        }
        return rec;
      });
      return {
        update: function (t) {
          recs.forEach(function (r) {
            var p = r.p, tt = p.step ? S.quantize(t, p.step) : content.stepFps ? S.quantize(t, content.stepFps) : t;    // deliberate stepped posing
            var x = p.x || 0, y = p.y || 0, rot = p.rot || 0, tr = p.track;
            if (tr) {
              if (tt <= tr[0].t) { x = tr[0].x; y = tr[0].y; rot = tr[0].rot || 0; }
              else if (tt >= tr[tr.length - 1].t) { var z = tr[tr.length - 1]; x = z.x; y = z.y; rot = z.rot || 0; }
              else for (var i = 1; i < tr.length; i++) if (tt <= tr[i].t) { var a = tr[i - 1], b = tr[i], e = easeOf(b.ease)((tt - a.t) / (b.t - a.t)); x = lerp(a.x, b.x, e); y = lerp(a.y, b.y, e); rot = lerp(a.rot || 0, b.rot || 0, e); break; }
            }
            var pv = p.pivot || { x: 0, y: 0 };      // hinge: rotate about the pivot, not the centre
            S.set(r.g, { transform: "translate(" + fmt(x) + " " + fmt(y) + ") translate(" + fmt(pv.x) + " " + fmt(pv.y) + ") rotate(" + fmt(rot) + ") translate(" + fmt(-pv.x) + " " + fmt(-pv.y) + ")" });
            if (p.enter) S.set(r.g, { opacity: prog(tt, p.enter.at, p.enter.dur || 0) });
            if (p.reveal) {
              var k = easeOf(p.reveal.ease || "out")(prog(tt, p.reveal.at, p.reveal.dur)), b2 = r.mb, w = b2.x1 - b2.x0 + 8, h = b2.y1 - b2.y0 + 8, dir = p.reveal.dir || "right";
              var m = dir === "right" ? { x: b2.x0 - 4, y: b2.y0 - 4, width: w * k, height: h } : dir === "left" ? { x: b2.x1 + 4 - w * k, y: b2.y0 - 4, width: w * k, height: h } : dir === "down" ? { x: b2.x0 - 4, y: b2.y0 - 4, width: w, height: h * k } : { x: b2.x0 - 4, y: b2.y1 + 4 - h * k, width: w, height: h * k };
              S.set(r.maskRect, { x: fmt(m.x), y: fmt(m.y), width: fmt(m.width), height: fmt(m.height) });
            }
            if (p.fold) {
              var th = easeOf(p.fold.ease)(prog(tt, p.fold.at, p.fold.dur)) * (p.fold.to == null ? 180 : p.fold.to), cs = Math.cos(th * Math.PI / 180);
              // the flap's visible width is cos(theta) about the crease; past 90 degrees we see its back and it lies over the body
              S.set(r.flapG, { transform: "translate(" + fmt(r.fx) + " 0) scale(" + fmt(cs) + " 1) translate(" + fmt(-r.fx) + " 0)" });
              S.set(r.flap, { fill: th > 90 ? (p.fold.back || "#e9e3d3") : r.fill });
              S.set(r.crease, { opacity: fmt(Math.sin(th * Math.PI / 180) * 0.25) });
            }
          });
        },
        describe: function () { return { technique: "vector-cut paper (original geometry; not stop-motion photography)", pieces: recs.map(function (r) { return { id: r.p.id, layer: r.layer, mode: r.mode, shadow: shadows, evidenceText: !!r.p.text }; }) }; }
      };
    };
    return S.createMediumScene(c0);
  }

  return { VERSION: VERSION, createPaperCollageScene: createPaperCollageScene };
});
