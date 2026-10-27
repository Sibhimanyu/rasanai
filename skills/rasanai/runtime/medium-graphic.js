/* RasanMediumGraphic: original SVG mechanisms for P01 flat-vector, P02 line drawing, P08 evidence diagram.
 * Built on RasanMediumSurface (the shared factory). No renderer, clock, network or package of its own; every setTime(t)
 * is a complete pure state. Scope: practical primitives, not a general morph or physics engine.
 *
 *   var G = RasanMediumGraphic;                     (load runtime/medium-surface.js first; Node: require is automatic)
 *   G.createFlatVectorScene({root, width, height, seed, design, content})      P01
 *   G.createLineDrawingScene({...})                                            P02
 *   G.createEvidenceDiagramScene({...})                                        P08
 *   each -> { ready, setTime(t), describeElements(), destroy(), surface }
 *
 * Honest limits. P01 interpolates MATCHED shapes only (same point count); a differing count is a disclosed crossfade, never
 * arbitrary topology morphing (describeElements() reports mode "morph" or "crossfade"). P02 supports absolute M L H V C Q Z.
 * P08 draws geometry from the supplied values/memberships; a chart without a declared `source` of "measured" or "synthetic"
 * is rejected, and a conceptual diagram may not carry numeric bars.
 * Editability: stable semantic data-id / data-role on SVG groups; roles are "shape", "route", "evidence" (exact text/data)
 * and "decor" (ornament, separable and removable without changing the claim).
 */
(function (root, factory) {
  var S = (typeof module === "object" && module.exports) ? require("./medium-surface.js") : root.RasanMediumSurface;
  if (typeof module === "object" && module.exports) module.exports = factory(S);
  else root.RasanMediumGraphic = factory(S);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";
  var VERSION = "1.0.0";
  var need = S.need, finite = S.finite, prog = S.prog, ease = S.ease, clamp = S.clamp;

  function palette(design) {
    var p = (design && design.palette) || {};
    return { ink: p.ink || "#1b1b1f", paper: p.paper || "#f4f1ea", accent: p.accent || "#e4572e", accent2: p.accent2 || "#2e86ab", accent3: p.accent3 || "#f2b134", mute: p.mute || "#8d8a84" };
  }
  function easeOf(name) { var f = ease[name || "inOut"]; need(typeof f === "function", "unknown ease " + name); return f; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function num(v, name, lo, hi) { return finite(v, name, lo, hi); }
  function list(v, name) { need(Array.isArray(v) && v.length, name + " must be a non-empty array"); return v; }
  function fmt(n) { return Math.round(n * 100) / 100; }
  function tx(x, y, rot, sc) { return "translate(" + fmt(x) + " " + fmt(y) + ") rotate(" + fmt(rot || 0) + ") scale(" + fmt(sc == null ? 1 : sc) + ")"; }
  function sceneOf(cfg, build) {
    need(cfg && cfg.content, "content required");
    var c = {}; for (var k in cfg) c[k] = cfg[k]; c.build = build;
    return S.createMediumScene(c);
  }
  // logical canvas: authors place things in content.logical = {w,h} (default = output size), drawn through one uniform transform.
  function viewGroup(surf, content) {
    var lw = (content.logical && content.logical.w) || surf.width, lh = (content.logical && content.logical.h) || surf.height;
    var T = S.makeTransform(lw, lh, surf.width, surf.height, "contain");
    var g = surf.group("view");
    surf.set(g, { transform: "translate(" + fmt(T.x) + " " + fmt(T.y) + ") scale(" + fmt(T.scale) + ")" });
    return { g: g, lw: lw, lh: lh, T: T };
  }

  // ===================================================================== P01 flat vector
  function polyBBox(pts) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); return { x0: x0, y0: y0, x1: x1, y1: y1 }; }
  function shapeToPoly(sh) {            // every shape has a polygon form so matched interpolation and split are uniform
    if (sh.kind === "poly") { list(sh.pts, "poly pts").forEach(function (p) { num(p[0], "pt.x"); num(p[1], "pt.y"); }); return sh.pts; }
    if (sh.kind === "rect") { var w = num(sh.w, "rect.w", 1) / 2, h = num(sh.h, "rect.h", 1) / 2; return [[-w, -h], [w, -h], [w, h], [-w, h]]; }
    if (sh.kind === "circle") { var r = num(sh.r, "circle.r", 1), n = sh.n || 24, out = []; for (var i = 0; i < n; i++) out.push([Math.cos(i / n * Math.PI * 2) * r, Math.sin(i / n * Math.PI * 2) * r]); return out; }
    need(false, "unknown shape kind " + sh.kind);
  }
  function polyD(pts) { return "M" + pts.map(function (p) { return fmt(p[0]) + " " + fmt(p[1]); }).join(" L") + " Z"; }

  function createFlatVectorScene(cfg) {
    return sceneOf(cfg, function (surf, ctx) {
      var P = palette(ctx.design), content = ctx.content, V = viewGroup(surf, content);
      surf.node("rect", { x: 0, y: 0, width: V.lw, height: V.lh, fill: content.background || P.paper }, V.g, "bg", "decor");
      var colors = [P.accent, P.accent2, P.accent3, P.ink];
      var items = list(content.objects, "content.objects").map(function (o, idx) {
        need(o && typeof o.id === "string", "object needs id");
        var poly = shapeToPoly(o.shape), g = surf.group("obj-" + o.id, V.g, "shape");
        var it = { o: o, poly: poly, g: g, fill: o.fill || colors[idx % colors.length], parts: [], halves: null, morph: null, mode: "rigid" };
        // segmented construction: each segment is its own path that flies in from an offset and locks (identity = parent group).
        if (o.segments) it.parts = o.segments.map(function (sg) {
          need(typeof sg.id === "string" && sg.d, "segment needs id and d");
          var el = surf.node("path", { d: sg.d, fill: sg.fill || it.fill }, g, "seg-" + o.id + "-" + sg.id, "shape");
          return { s: sg, el: el };
        });
        else if (!o.split) it.body = surf.node("path", { d: polyD(poly), fill: it.fill }, g, "body-" + o.id, "shape");
        // split/recombine: two clipped copies of the same polygon; the halves part by `gap` then rejoin.
        if (o.split) {
          var bb = polyBBox(poly), vertical = o.split.axis !== "horizontal", cut = vertical ? (bb.x0 + bb.x1) / 2 : (bb.y0 + bb.y1) / 2;
          var cA = surf.node("clipPath", {}, g, "clipA-" + o.id, "decor"), cB = surf.node("clipPath", {}, g, "clipB-" + o.id, "decor");
          var pad = 4;
          surf.node("rect", vertical ? { x: bb.x0 - pad, y: bb.y0 - pad, width: cut - bb.x0 + pad, height: bb.y1 - bb.y0 + 2 * pad } : { x: bb.x0 - pad, y: bb.y0 - pad, width: bb.x1 - bb.x0 + 2 * pad, height: cut - bb.y0 + pad }, cA);
          surf.node("rect", vertical ? { x: cut, y: bb.y0 - pad, width: bb.x1 - cut + pad, height: bb.y1 - bb.y0 + 2 * pad } : { x: bb.x0 - pad, y: cut, width: bb.x1 - bb.x0 + 2 * pad, height: bb.y1 - cut + pad }, cB);
          var hA = surf.group("half-a-" + o.id, g, "shape"), hB = surf.group("half-b-" + o.id, g, "shape");
          surf.node("path", { d: polyD(poly), fill: it.fill, "clip-path": "url(#clipA-" + o.id + ")" }, hA);
          surf.node("path", { d: polyD(poly), fill: o.split.fillB || it.fill, "clip-path": "url(#clipB-" + o.id + ")" }, hB);
          it.halves = { a: hA, b: hB, vertical: vertical };
        }
        // route handoff: the object rides an authored path (position + tangent), identity unchanged.
        if (o.route) it.route = S.parsePath(o.route.d);
        // matched morph
        if (o.morph) {
          var to = shapeToPoly(o.morph.to);
          it.morph = { to: to, matched: to.length === poly.length };
          it.mode = it.morph.matched ? "morph" : "crossfade";
          if (!it.morph.matched) it.toEl = surf.node("path", { d: polyD(to), fill: o.morph.fill || it.fill, opacity: 0 }, g, "to-" + o.id, "shape");
        }
        return it;
      });
      // purely ornamental shapes are allowed only when labelled; they carry no relationship claim.
      (content.ornaments || []).forEach(function (r, i) {
        need(typeof r.id === "string", "ornament needs id");
        surf.node("circle", { cx: num(r.x, "ornament.x"), cy: num(r.y, "ornament.y"), r: num(r.r, "ornament.r", 0.5), fill: r.fill || P.mute, opacity: r.opacity == null ? 0.25 : r.opacity }, V.g, "orn-" + r.id, "decor");
      });
      if (content.caption) {
        var cap = surf.node("text", { x: num(content.caption.x, "caption.x"), y: num(content.caption.y, "caption.y"), fill: P.ink, "font-size": content.caption.size || 28, "font-family": content.caption.font || "inherit", opacity: 0 }, V.g, "caption", "evidence");
        cap.textContent = String(content.caption.text);
      }
      return {
        update: function (t) {
          items.forEach(function (it) {
            var o = it.o, enter = o.enter || { at: 0, dur: 0 };
            var k = prog(t, enter.at || 0, enter.dur || 0);
            var x = o.x || 0, y = o.y || 0, rot = o.rot || 0, sc = o.scale == null ? 1 : o.scale;
            if (o.track) {                    // keyframes [{t,x,y,rot,scale,ease}] interpolated per-leg with the leg's own ease
              var tr = o.track;
              if (t <= tr[0].t) { x = tr[0].x; y = tr[0].y; rot = tr[0].rot || 0; sc = tr[0].scale == null ? 1 : tr[0].scale; }
              else if (t >= tr[tr.length - 1].t) { var z = tr[tr.length - 1]; x = z.x; y = z.y; rot = z.rot || 0; sc = z.scale == null ? 1 : z.scale; }
              else for (var i = 1; i < tr.length; i++) if (t <= tr[i].t) {
                var a = tr[i - 1], b = tr[i], e = easeOf(b.ease)((t - a.t) / (b.t - a.t));
                x = lerp(a.x, b.x, e); y = lerp(a.y, b.y, e); rot = lerp(a.rot || 0, b.rot || 0, e); sc = lerp(a.scale == null ? 1 : a.scale, b.scale == null ? 1 : b.scale, e); break;
              }
            }
            if (it.route) {
              var rp = o.route, f = easeOf(rp.ease)(prog(t, rp.at, rp.dur)), pt = S.pointAt(it.route, f);
              x = pt.x; y = pt.y; if (rp.orient) rot = pt.angle + (rp.offsetAngle || 0);
            }
            var vis = enter.dur === 0 && (enter.at || 0) > t ? 0 : 1;
            S.set(it.g, { transform: tx(x, y, rot, sc * (enter.how === "scale" ? easeOf("out")(k) : 1)), opacity: enter.how === "scale" ? vis : (k > 0 || vis ? k : 0) });
            it.parts.forEach(function (pp) {  // segment lock-in: offset collapses to 0 at its own time
              var sg = pp.s, kk = easeOf(sg.ease || "out")(prog(t, sg.at || 0, sg.dur || 0.4)), f0 = sg.from || { dx: 0, dy: 0, rot: 0 };
              S.set(pp.el, { transform: tx((f0.dx || 0) * (1 - kk), (f0.dy || 0) * (1 - kk), (f0.rot || 0) * (1 - kk), 1), opacity: kk > 0 ? 1 : 0 });
            });
            if (it.halves) {
              var sp = o.split, gap = sp.gap || 40, out = easeOf("inOut")(prog(t, sp.at, sp.dur)), back = easeOf("inOut")(prog(t, sp.recombineAt, sp.recombineDur || sp.dur));
              var d = gap * (out - back) / 2;
              S.set(it.halves.a, { transform: it.halves.vertical ? "translate(" + fmt(-d) + " 0)" : "translate(0 " + fmt(-d) + ")" });
              S.set(it.halves.b, { transform: it.halves.vertical ? "translate(" + fmt(d) + " 0)" : "translate(0 " + fmt(d) + ")" });
            }
            if (it.morph) {
              var mk = easeOf(o.morph.ease)(prog(t, o.morph.at, o.morph.dur));
              if (it.morph.matched) {
                var mp = it.poly.map(function (p, i) { return [lerp(p[0], it.morph.to[i][0], mk), lerp(p[1], it.morph.to[i][1], mk)]; });
                S.set(it.body, { d: polyD(mp) });
              } else { S.set(it.body, { opacity: 1 - mk }); S.set(it.toEl, { opacity: mk }); }   // disclosed crossfade
            }
          });
          if (content.caption) S.set(surf.svg.querySelector("#caption"), { opacity: prog(t, content.caption.at || 0, content.caption.dur || 0.3) });
        },
        describe: function () { return items.map(function (it) { return { id: it.o.id, mode: it.mode, claim: it.o.claim || "structural" }; }); }
      };
    });
  }

  // ===================================================================== P02 line drawing
  function createLineDrawingScene(cfg) {
    return sceneOf(cfg, function (surf, ctx) {
      var P = palette(ctx.design), content = ctx.content, V = viewGroup(surf, content);
      surf.node("rect", { x: 0, y: 0, width: V.lw, height: V.lh, fill: content.background || P.paper }, V.g, "bg", "decor");
      var byId = {};
      var paths = list(content.paths, "content.paths").map(function (p) {
        need(typeof p.id === "string", "path needs id");
        var kind = p.kind || "main";
        need(["main", "branch", "construction", "connector"].indexOf(kind) >= 0, "unknown path kind " + kind);
        // boundary rule: a connector between systems must declare whether the link is real or illustrative.
        if (kind === "connector") need(p.claim === "supported" || p.claim === "illustrative", "connector " + p.id + " needs claim supported|illustrative; no implied data flow");
        var parsed = S.parsePath(p.d), at = p.at, dur = p.dur;
        if (p.branchOf) {                   // a deliberate branch starts where it leaves its parent, not arbitrarily
          var par = byId[p.branchOf]; need(par, "branchOf " + p.branchOf + " must be declared earlier");
          if (at == null) at = par.at + (p.leaveAt == null ? 0.5 : p.leaveAt) * par.dur;
        }
        num(at, "path.at", 0); num(dur, "path.dur", 0.01);
        var w = p.width == null ? 6 : num(p.width, "path.width", 0.5, 80);
        var col = p.color || (kind === "branch" ? P.accent2 : kind === "connector" ? P.mute : P.ink);
        var g = surf.group("line-" + p.id, V.g, "route");
        var plan = null;
        if (kind === "construction" || p.guide) plan = surf.node("path", { d: p.d, fill: "none", stroke: P.mute, "stroke-width": Math.max(1, w / 3), "stroke-dasharray": "6 8", opacity: 0.45, "stroke-linecap": "butt" }, g, "guide-" + p.id, "decor");
        var dash = kind === "connector" && p.claim === "illustrative" ? null : null;
        var el = surf.node("path", { d: p.d, fill: "none", stroke: col, "stroke-width": w, "stroke-linecap": p.cap || "round", "stroke-linejoin": p.join || "round", "stroke-dasharray": parsed.length + " " + parsed.length, "stroke-dashoffset": parsed.length }, g, "stroke-" + p.id, "route");
        var rec = { p: p, id: p.id, kind: kind, parsed: parsed, at: at, dur: dur, el: el, g: g, plan: plan, ease: easeOf(p.ease || "inOut") };
        byId[p.id] = rec; return rec;
      });
      var points = (content.points || []).map(function (pt) {
        need(typeof pt.id === "string", "point needs id");
        var rec = byId[pt.on], at = pt.at;
        var x = pt.x, y = pt.y;
        if (pt.on) {                        // point emphasis pinned to a fraction of a real path
          need(rec, "point.on " + pt.on + " is not a path");
          var q = S.pointAt(rec.parsed, pt.along == null ? 1 : pt.along); x = q.x; y = q.y;
          if (at == null) at = rec.at + (pt.along == null ? 1 : pt.along) * rec.dur;   // appears when the line reaches it
        }
        num(x, "point.x"); num(y, "point.y"); num(at, "point.at", 0);
        var g = surf.group("pt-" + pt.id, V.g, "evidence");
        var ring = surf.node("circle", { cx: x, cy: y, r: pt.r || 14, fill: "none", stroke: pt.color || P.accent, "stroke-width": 4 }, g);
        var dot = surf.node("circle", { cx: x, cy: y, r: (pt.r || 14) * 0.45, fill: pt.color || P.accent }, g);
        return { pt: pt, at: at, ring: ring, dot: dot, g: g, r: pt.r || 14 };
      });
      var labels = (content.labels || []).map(function (l) {
        need(typeof l.id === "string" && typeof l.text === "string", "label needs id and text");
        var after = l.after ? byId[l.after] : null;
        if (l.after) need(after, "label.after " + l.after + " is not a path");
        var at = l.at != null ? l.at : after ? after.at + after.dur + (l.delay == null ? 0.15 : l.delay) : 0;   // supporting label follows the line
        var el = surf.node("text", { x: num(l.x, "label.x"), y: num(l.y, "label.y"), fill: P.ink, "font-size": l.size || 30, "font-family": l.font || "inherit", opacity: 0 }, V.g, "label-" + l.id, "evidence");
        el.textContent = l.text; return { at: at, el: el };
      });
      return {
        update: function (t) {
          paths.forEach(function (r) {
            var k = r.ease(prog(t, r.at, r.dur));
            S.set(r.el, { "stroke-dashoffset": fmt(r.parsed.length * (1 - k)), opacity: t < r.at ? 0 : 1 });
            // finished lines read solid; guide (future construction) lines vanish once the real stroke completes
            if (r.plan) S.set(r.plan, { opacity: t >= r.at + r.dur ? 0 : 0.45 });
            if (r.kind === "connector" && r.p.claim === "illustrative" && t >= r.at + r.dur) S.set(r.el, { "stroke-dasharray": "14 10", "stroke-dashoffset": 0 });
          });
          points.forEach(function (q) {
            var k = easeOf("out")(prog(t, q.at, 0.25));
            S.set(q.g, { opacity: k > 0 ? 1 : 0 }); S.set(q.ring, { r: fmt(q.r * (1 + 0.8 * (1 - k))), opacity: k }); S.set(q.dot, { opacity: k });
          });
          labels.forEach(function (l) { S.set(l.el, { opacity: prog(t, l.at, 0.25) }); });
        },
        describe: function () { return paths.map(function (r) { return { id: r.id, kind: r.kind, length: fmt(r.parsed.length), claim: r.p.claim || null }; }); }
      };
    });
  }

  // ===================================================================== P08 evidence diagram / data
  function createEvidenceDiagramScene(cfg) {
    return sceneOf(cfg, function (surf, ctx) {
      var P = palette(ctx.design), content = ctx.content, V = viewGroup(surf, content);
      surf.node("rect", { x: 0, y: 0, width: V.lw, height: V.lh, fill: content.background || P.paper }, V.g, "bg", "decor");
      need(content.mode === "bars" || content.mode === "sets", "content.mode must be bars or sets");
      return content.mode === "bars" ? bars(surf, V, P, content) : sets(surf, V, P, content);
    });
  }

  function bars(surf, V, P, c) {
    need(c.source === "measured" || c.source === "synthetic", "bars need source measured|synthetic (conceptual diagrams may not carry numeric bars)");
    need(typeof c.unit === "string" && c.unit, "unit required");
    var items = list(c.items, "items"), box = c.box || { x: 160, y: 140, w: V.lw - 320, h: V.lh - 340 };
    var base = c.baseline == null ? 0 : num(c.baseline, "baseline");
    if (base !== 0) need(c.axisBreak === true, "non-zero baseline requires axisBreak:true and is drawn as broken");
    var all = [];
    items.forEach(function (it) { need(typeof it.id === "string" && typeof it.label === "string", "item needs id and label"); all.push(num(it.value, "item.value")); if (it.value2 != null) all.push(num(it.value2, "item.value2")); });
    var hi = Math.max.apply(null, all); need(hi > base, "max value must exceed baseline");
    var top = c.domainMax != null ? num(c.domainMax, "domainMax") : hi; need(top >= hi, "domainMax below data");
    var n = items.length, slot = box.w / n, bw = slot * 0.62;
    surf.node("line", { x1: box.x, y1: box.y + box.h, x2: box.x + box.w, y2: box.y + box.h, stroke: P.ink, "stroke-width": 3 }, V.g, "baseline", "evidence");
    var bu = surf.node("text", { x: box.x, y: box.y + box.h + 78, fill: P.mute, "font-size": 24, "font-family": "inherit" }, V.g, "unit-note", "evidence");
    bu.textContent = c.unit + " | baseline " + base + (c.denominator ? " | n = " + c.denominator : "") + (c.source === "synthetic" ? " | synthetic example data" : "");
    var rows = items.map(function (it, i) {
      var x = box.x + slot * i + (slot - bw) / 2, g = surf.group("bar-" + it.id, V.g, "evidence");
      var rect = surf.node("rect", { x: x, y: box.y + box.h, width: bw, height: 0, fill: it.color || [P.accent, P.accent2, P.accent3][i % 3] }, g, "barfill-" + it.id, "shape");
      var val = surf.node("text", { x: x + bw / 2, "text-anchor": "middle", fill: P.ink, "font-size": 28, "font-family": "inherit", opacity: 0 }, g, "barval-" + it.id, "evidence");
      var lab = surf.node("text", { x: x + bw / 2, y: box.y + box.h + 38, "text-anchor": "middle", fill: P.ink, "font-size": 26, "font-family": "inherit" }, g, "barlab-" + it.id, "evidence");
      lab.textContent = it.label;
      return { it: it, rect: rect, val: val, x: x, bw: bw };
    });
    function h(v) { return (v - base) / (top - base) * box.h; }
    return {
      update: function (t) {
        rows.forEach(function (r, i) {
          var it = r.it, at = (c.at || 0) + (c.stagger == null ? 0.12 : c.stagger) * i, k = easeOf("out")(prog(t, at, c.dur || 0.7));
          var v = base + (it.value - base) * k;              // grows from the true baseline to the true value, never from a convenient start
          if (it.value2 != null && c.transform) { var tk = easeOf("inOut")(prog(t, c.transform.at, c.transform.dur)); v = lerp(it.value, it.value2, tk); if (t < at + (c.dur || 0.7)) v = base + (it.value - base) * k; }
          var hh = h(v);
          S.set(r.rect, { y: fmt(box.y + box.h - hh), height: fmt(Math.max(0, hh)) });
          var shown = it.value2 != null && c.transform && t >= c.transform.at ? v : it.value;
          S.set(r.val, { y: fmt(box.y + box.h - hh - 14), opacity: k >= 1 ? 1 : 0 });
          r.val.textContent = (Math.round(shown * 100) / 100) + (c.valueSuffix || "");
        });
      },
      describe: function () { return rows.map(function (r) { return { id: r.it.id, value: r.it.value, value2: r.it.value2 == null ? null : r.it.value2, unit: c.unit, source: c.source }; }); }
    };
  }

  // Sets: every universe member is drawn exactly once, placed by real membership; interpretations are computed, never hand-placed.
  function sets(surf, V, P, c) {
    var universe = list(c.universe, "universe"), setDefs = list(c.sets, "sets"), ids = {}, mem = {};
    universe.forEach(function (u) { need(typeof u.id === "string" && !ids[u.id], "universe ids must be unique strings"); ids[u.id] = u; });
    setDefs.forEach(function (s) { need(typeof s.id === "string" && Array.isArray(s.members), "set needs id and members"); mem[s.id] = {}; s.members.forEach(function (m) { need(ids[m], "set " + s.id + " names unknown member " + m); mem[s.id][m] = true; }); });
    need(setDefs.length === 2, "sets mode lays out exactly two sets (A,B)");
    var A = setDefs[0].id, B = setDefs[1].id;
    function region(u) { var a = !!mem[A][u.id], b = !!mem[B][u.id]; return a && b ? "both" : a ? "a" : b ? "b" : "none"; }
    var W = V.lw, H = V.lh, r = Math.min(W, H) * 0.27, cy = H * 0.5, ax = W * 0.5 - r * 0.55, bx = W * 0.5 + r * 0.55;
    surf.node("circle", { cx: ax, cy: cy, r: r, fill: P.accent, opacity: 0.18, stroke: P.accent, "stroke-width": 4 }, V.g, "set-" + A, "shape");
    surf.node("circle", { cx: bx, cy: cy, r: r, fill: P.accent2, opacity: 0.18, stroke: P.accent2, "stroke-width": 4 }, V.g, "set-" + B, "shape");
    [[A, ax - r * 0.55, cy - r - 24], [B, bx + r * 0.55, cy - r - 24]].forEach(function (s, i) {
      var d = setDefs[i], el = surf.node("text", { x: s[1], y: s[2], "text-anchor": "middle", fill: P.ink, "font-size": 30, "font-family": "inherit" }, V.g, "setlab-" + d.id, "evidence"); el.textContent = d.label || d.id;
    });
    var anchorsX = { a: ax - r * 0.6, both: (ax + bx) / 2, b: bx + r * 0.6 }, groups = { a: [], both: [], b: [], none: [] };
    universe.forEach(function (u) { groups[region(u)].push(u); });
    var dots = [];
    ["a", "both", "b", "none"].forEach(function (key) {
      var cx0 = key === "none" ? W * 0.5 : anchorsX[key], cy0 = key === "none" ? cy + r + 70 : cy, arr = groups[key];
      arr.forEach(function (u, i) {                       // deterministic column grid per region: no random placement
        var cols = Math.max(1, Math.ceil(Math.sqrt(arr.length))), col = i % cols, row = Math.floor(i / cols), step = 54;
        var x = cx0 + (col - (cols - 1) / 2) * step, y = cy0 + (row - (Math.ceil(arr.length / cols) - 1) / 2) * step;
        var g = surf.group("member-" + u.id, V.g, "evidence");
        var dot = surf.node("circle", { cx: x, cy: y, r: 17, fill: P.ink, opacity: 0 }, g);
        var tt = surf.node("text", { x: x, y: y + 6, "text-anchor": "middle", fill: P.paper, "font-size": 15, "font-family": "inherit", opacity: 0 }, g);
        tt.textContent = u.short || u.id;
        dots.push({ u: u, dot: dot, tt: tt, i: dots.length });
      });
    });
    need(dots.length === universe.length, "every universe member must be drawn (none lost)");
    // interpretations: op over the two sets, computed from membership; the count line proves nothing was dropped.
    var interps = (c.interpretations || []).map(function (ip) {
      need(typeof ip.id === "string" && (ip.op === "union" || ip.op === "intersection" || ip.op === "a" || ip.op === "b"), "interpretation needs id and op union|intersection|a|b");
      var set = {}, n = 0;
      universe.forEach(function (u) { var a = !!mem[A][u.id], b = !!mem[B][u.id]; var inn = ip.op === "union" ? a || b : ip.op === "intersection" ? a && b : ip.op === "a" ? a : b; if (inn) { set[u.id] = true; n++; } });
      var el = surf.node("text", { x: W * 0.5, y: H - 60, "text-anchor": "middle", fill: P.ink, "font-size": 30, "font-family": "inherit", opacity: 0 }, V.g, "interp-" + ip.id, "evidence");
      el.textContent = (ip.label || ip.id) + ": " + n + " of " + universe.length;
      return { ip: ip, set: set, el: el, n: n };
    });
    return {
      update: function (t) {
        var step = c.step == null ? 0.08 : c.step, at0 = c.at || 0;
        var active = null;
        interps.forEach(function (x) { if (t >= x.ip.at) active = x; });
        dots.forEach(function (d) {
          var k = easeOf("out")(prog(t, at0 + d.i * step, 0.25)), on = !active || active.set[d.u.id];
          S.set(d.dot, { opacity: k * (on ? 1 : 0.18), fill: active && on ? P.accent : P.ink }); S.set(d.tt, { opacity: k * (on ? 1 : 0.35) });
        });
        interps.forEach(function (x) { S.set(x.el, { opacity: x === active ? 1 : 0 }); });
      },
      describe: function () { return { members: universe.length, regions: { a: groups.a.length, both: groups.both.length, b: groups.b.length, none: groups.none.length }, interpretations: interps.map(function (x) { return { id: x.ip.id, count: x.n }; }) }; }
    };
  }

  return { VERSION: VERSION, createFlatVectorScene: createFlatVectorScene, createLineDrawingScene: createLineDrawingScene, createEvidenceDiagramScene: createEvidenceDiagramScene };
});
