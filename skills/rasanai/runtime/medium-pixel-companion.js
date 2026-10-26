/* RasanPixelCompanion: an ORIGINAL editorial pixel sprite that sits beside a sharp product-UI evidence layer (medium profile
 * "living-screencast", execution "pixel-companion"). Original code; the sprite is RasanPixel.SCOUT (invented here).
 *
 * Two layers, never merged:
 *   proof  = the real UI, built by the existing rasan-ui.js path (sharp, full resolution, owns every label and qualifier)
 *   guide  = this sprite, on its own canvas above the proof, nearest-neighbour on its own integer grid
 * Nothing here pixelates, blurs or bit-crushes the proof. This module owns NO UI reconstruction.
 *
 * The anchor is MEASURED, not hard-coded: bounds are read from layout once, in WORLD coordinates at the world's first pose (the same
 * convention as RasanUI's aim()), cached under a layout digest, and converted through the ONE camera transform (world.map) at the
 * scene time you ask for. Screen deltas are never accumulated. The companion keeps out of the reading region and the captions.
 *
 * Editorial honesty: the character is NOT a product feature. It reacts to a real UI event the score already carries; it never
 * invents a success state, covers a qualifier, or stands in for the cursor/user action. disclosure() states this for the treatment.
 *
 *   var P = RasanPixelCompanion;
 *   var fit = RasanPixel.fit(1920, 1080, { base: [320, 180] });
 *   var C = P.mount(stageEl, { fit: fit, palette: [...], world: U.world(...) /* RasanUI world, optional *\/, seed: "film/04" });
 *   var a = C.anchor("saved", document.querySelector("#saved-row"));          // measure now, cache by digest
 *   C.script([{ id: "p1", t: 3.2, kind: "point", anchor: "saved" }, { id: "r1", t: 4.4, kind: "react", anchor: "saved" }]);
 *   C.reserve("proof", ["#saved-row", "#qualifier"]);                          // elements that must stay readable
 *   C.bind(tl, { at: 0, duration: 8 });                                        // after RasanUI's U.finish() (one clock, one camera)
 *
 * Import-safe: nothing touches document/window at load. Works as CommonJS (pure helpers) and as a browser global.
 */
(function (root, factory) {
  var P = typeof module === "object" && module.exports ? (function () { try { return require("./medium-pixel.js"); } catch (e) { return null; } })() : root.RasanPixel;
  if (typeof module === "object" && module.exports) module.exports = factory(root, P);
  else root.RasanPixelCompanion = factory(root, P);
})(typeof self !== "undefined" ? self : this, function (root, PX) {
  "use strict";
  var VERSION = "1.0.0";

  function need(c, m) { if (!c) throw new Error("RasanPixelCompanion: " + m); }
  function opt(o, k, d) { return o && o[k] !== undefined && o[k] !== null ? o[k] : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rd(v) { return Math.floor(v + 0.5); }
  function px() { need(PX || root.RasanPixel, "load medium-pixel.js before medium-pixel-companion.js"); return PX || root.RasanPixel; }

  // ------------------------------------------------------------------ rectangles: {x, y, w, h} in stage (frame) px
  function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
  function overlaps(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y; }
  function inside(a, F) { return a.x >= 0 && a.y >= 0 && a.x + a.w <= F.W && a.y + a.h <= F.H; }
  function grow(r, p) { return rect(r.x - p, r.y - p, r.w + 2 * p, r.h + 2 * p); }

  // a short digest of a layout measurement: rect rounded to 0.5 px + the text it holds. Used to decide when a cached bound is still current.
  function digestOf(r, text, extra) {
    var s = [r.x, r.y, r.w, r.h].map(function (v) { return Math.round(v * 2) / 2; }).join(",") + "|" + String(text || "") + "|" + (extra || ""), h = 2166136261 >>> 0, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  // ------------------------------------------------------------------ measuring (browser)
  // measureWorldBounds(el, { stage, W, H, world }) -> { rect (WORLD coords), digest, text }. The world sits at its first pose while you build,
  // so unmap(world.at0, ...) returns coordinates that do not depend on the camera. Without a world, coordinates are stage coordinates.
  function measureWorldBounds(el, o) {
    need(el && el.nodeType === 1, "measureWorldBounds: pass an element");
    var stage = o.stage, W = o.W, w = o.world, sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), k = sr.width / W || 1;
    var a = [(r.left - sr.left) / k, (r.top - sr.top) / k], b = [(r.right - sr.left) / k, (r.bottom - sr.top) / k];
    if (w) { a = w.unmap(w.at0, a); b = w.unmap(w.at0, b); }
    var rc = rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    return { rect: rc, digest: digestOf(rc, el.textContent ? el.textContent.slice(0, 200) : "", w ? "w" : "s"), text: el.textContent || "" };
  }

  // worldToScreen: the single transform. Corners map through world.map(T, ...) so a rotated/scaled world cannot be approximated by a
  // translation; the result is the axis-aligned box of the mapped corners.
  function worldToScreen(world, T, rc) {
    if (!world) return rc;
    var p = [world.map(T, [rc.x, rc.y]), world.map(T, [rc.x + rc.w, rc.y]), world.map(T, [rc.x, rc.y + rc.h]), world.map(T, [rc.x + rc.w, rc.y + rc.h])], xs = p.map(function (q) { return q[0]; }), ys = p.map(function (q) { return q[1]; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return rect(x0, y0, Math.max.apply(null, xs) - x0, Math.max.apply(null, ys) - y0);
  }

  // ------------------------------------------------------------------ placement: beside the anchor, never over the reading region
  // place(anchorScreen, { size:[w,h] (px), reserved:[rect], frame:{W,H}, prefer:[...], gap, grid }) ->
  //   { ok, x, y, w, h, side, tried[], reason } ; x,y snap to `grid` (the pixel scale in stage px) so the sprite sits on its grid.
  function place(anchor, o) {
    var sz = o.size, gap = opt(o, "gap", 16), grid = Math.max(1, opt(o, "grid", 1)), F = o.frame, prefer = o.prefer || ["left", "right", "above", "below"], res = o.reserved || [], tried = [], i, j, c, ok, box, side;
    function snap(v) { return rd(v / grid) * grid; }
    function at(s) {
      switch (s) {
        case "left": return rect(snap(anchor.x - gap - sz[0]), snap(anchor.y + anchor.h / 2 - sz[1] / 2), sz[0], sz[1]);
        case "right": return rect(snap(anchor.x + anchor.w + gap), snap(anchor.y + anchor.h / 2 - sz[1] / 2), sz[0], sz[1]);
        case "above": return rect(snap(anchor.x + anchor.w / 2 - sz[0] / 2), snap(anchor.y - gap - sz[1]), sz[0], sz[1]);
        default: return rect(snap(anchor.x + anchor.w / 2 - sz[0] / 2), snap(anchor.y + anchor.h + gap), sz[0], sz[1]);
      }
    }
    for (i = 0; i < prefer.length; i++) {
      side = prefer[i]; box = at(side); ok = inside(box, F) && !overlaps(box, anchor, 0);
      for (j = 0; ok && j < res.length; j++) if (overlaps(box, res[j], 4)) ok = false;
      tried.push({ side: side, ok: ok });
      if (ok) return { ok: true, x: box.x, y: box.y, w: box.w, h: box.h, side: side, tried: tried, reason: "" };
    }
    // last resort: slide along the frame edge nearest the anchor; still refuses any overlap with the reading region
    var edges = [rect(snap(anchor.x - gap - sz[0]), 0, sz[0], sz[1]), rect(snap(anchor.x + anchor.w + gap), F.H - sz[1], sz[0], sz[1])];
    for (i = 0; i < edges.length; i++) {
      c = edges[i]; ok = inside(c, F) && !overlaps(c, anchor, 0);
      for (j = 0; ok && j < res.length; j++) if (overlaps(c, res[j], 4)) ok = false;
      if (ok) { tried.push({ side: "edge" + i, ok: true }); return { ok: true, x: c.x, y: c.y, w: c.w, h: c.h, side: "edge", tried: tried, reason: "" }; }
    }
    return { ok: false, x: anchor.x, y: anchor.y, w: sz[0], h: sz[1], side: null, tried: tried, reason: "no position keeps the sprite clear of the reading region: hold the companion off-frame for this beat or shrink the sprite" };
  }

  // ------------------------------------------------------------------ the sprite's pose from the score's events (pure in T)
  // events: [{ id, t, kind: "point"|"react", anchor, hold }]. Phases: walk-in (before), anticipate (0.25 s before t: still idle),
  // act (point: held pose; react: react pose for hold s), then idle. Times come from the score; this module owns none.
  function poseAt(T, events, o) {
    var P = px(), fps = opt(o, "fps", 8), seed = opt(o, "seed", 0), best = null, i, e, lead = opt(o, "lead", 0.25), h;
    var list = (events || []).slice().sort(function (a, b) { return a.t - b.t; });
    for (i = 0; i < list.length; i++) {
      e = list[i]; h = opt(e, "hold", e.kind === "point" ? 1.4 : 0.8);
      if (T >= e.t - lead && T < e.t + h) { best = e; break; }
      if (T >= e.t + h) best = null;
    }
    if (best) {
      var act = T >= best.t;
      return { anim: act ? (best.kind === "react" ? "react" : "point") : "idle", frame: act ? 0 : P.step(T, { fps: fps, count: 2, id: "scout", seed: seed }), event: best.id, anchor: best.anchor, phase: act ? "act" : "anticipate" };
    }
    return { anim: "idle", frame: P.step(T, { fps: fps, count: 2, id: "scout", seed: seed }), event: null, anchor: null, phase: "idle" };
  }

  // ------------------------------------------------------------------ mount (browser)
  function mount(stage, o) {
    var P = px(), W = opt(o, "W", o.fit.baseW * o.fit.scale / o.fit.dpr), H = opt(o, "H", o.fit.baseH * o.fit.scale / o.fit.dpr), world = o.world || null, seed = opt(o, "seed", 0);
    var frame = { W: opt(o, "stageW", W), H: opt(o, "stageH", H) };
    var doc = stage.ownerDocument, cv = doc.createElement("canvas");
    cv.setAttribute("data-rp-layer", "guide"); cv.style.cssText = "position:absolute;pointer-events:none;z-index:" + opt(o, "z", 900);
    stage.appendChild(cv);
    var S = P.surface(cv, { fit: o.fit, palette: o.palette });
    var anchors = {}, events = [], reserveSel = {}, extraReserved = [], sp = o.sprite || P.SCOUT, scale = o.fit.scale / o.fit.dpr; // stage px per base px
    var size = [sp.w * scale, sp.h * scale];

    var C = { surface: S, fit: o.fit, sprite: sp };
    // anchor(id, el): measure now (world coords), cache by digest; re-measure only through refresh()
    C.anchor = function (id, el) { var m = measureWorldBounds(el, { stage: stage, W: frame.W, world: world }); anchors[id] = { el: el, m: m }; return m; };
    C.refresh = function (id) { // true when the layout changed since the cache was taken
      var a = anchors[id]; need(a, "unknown anchor " + id);
      var m = measureWorldBounds(a.el, { stage: stage, W: frame.W, world: world }), changed = m.digest !== a.m.digest; if (changed) a.m = m; return changed;
    };
    // reserve(group, selectorsOrEls): reading regions (proof, captions). Measured at world pose 0 and carried through the same camera.
    C.reserve = function (group, list) {
      reserveSel[group] = (list || []).map(function (x) { var el = typeof x === "string" ? stage.querySelector(x) : x; need(el, "reserve: no element for " + x); return { el: el, m: measureWorldBounds(el, { stage: stage, W: frame.W, world: world }) }; });
    };
    // reserveScreen(rect): a fixed screen-space region (e.g. platform captions zone) that does not move with the camera
    C.reserveScreen = function (r) { extraReserved.push(r); };
    C.script = function (evs) { events = (evs || []).slice(); return events; };
    C.at = function (T) {
      var pose = poseAt(T, events, { seed: seed, fps: opt(o, "fps", 8) }), reserved = extraReserved.slice(), g, i, anchorRect = null, pl = null;
      for (g in reserveSel) for (i = 0; i < reserveSel[g].length; i++) reserved.push(worldToScreen(world, T, reserveSel[g][i].m.rect));
      var aid = pose.anchor || opt(o, "restAnchor", null);
      if (aid && anchors[aid]) {
        anchorRect = worldToScreen(world, T, anchors[aid].m.rect);
        // the anchor is itself part of the reading region: the sprite keeps off it (place() refuses any overlap with anchorRect)
        pl = place(anchorRect, { size: size, reserved: reserved, frame: frame, gap: opt(o, "gap", 20), grid: scale, prefer: opt(o, "prefer", null) || undefined });
      }
      return { pose: pose, anchor: anchorRect, placement: pl, reserved: reserved };
    };
    C.draw = function (T) {
      var st = C.at(T);
      S.clearTransparent();
      if (st.placement && st.placement.ok) {
        var b = S.fromStage(st.placement.x + size[0] / 2, st.placement.y + size[1]); // anchor = feet, centre
        S.sprite(sp, rd(b[0]), rd(b[1]), { anim: st.pose.anim, frame: st.pose.frame, flip: st.placement.side === "right" });
      } // when placement fails the sprite is simply not drawn that frame: it never covers the proof
      S.present();
      return st;
    };
    C.bind = function (tl, bo) { return P.bind(tl, S, function (T) { C.draw(T); }, bo); };
    return C;
  }

  // ------------------------------------------------------------------ honest label + capability record
  function disclosure() {
    return {
      editorial: true, product_feature: false,
      treatment_note: "The pixel companion is an editorial character added by the film. The product has no such feature, and the sprite does not cause or confirm any product behaviour.",
      visible_label_suggestion: "Illustrative character; not part of the product",
      required_when: "the companion appears next to real UI in a way a viewer could take as a product feature (launch/promo/explainer); optional in an obviously stylised film",
    };
  }

  var CAPABILITY = {
    profile_id: "living-screencast", execution_id: "pixel-companion", module: "runtime/medium-pixel-companion.js", version: VERSION, state: "implemented_unvalidated", verified: false,
    depends_on: ["runtime/medium-pixel.js", "runtime/rasan-ui.js (existing; proof layer + world camera)"],
    adapters: {
      native_actions: { "anchor-follow": "mount().anchor + at(T) via world.map (one transform)", "sprite-react": "script([{kind:'react'}]) + poseAt", "point-attend": "script([{kind:'point'}]) + place() beside the anchor" },
      proof_layer: "existing rasan-ui.js / approved capture source; this module never reconstructs UI",
    },
    finish_requirements: {
      proof: "sharp, unchanged labels/qualifiers/dimensions; no pixelation, bit-crush, CRT or blur over the frame; layer-scoped grade/motion blur only",
      guide: "nearest-neighbor, integer scale, whole-pixel position on its own grid; sprite edges stay sharp; no layer-wide filter",
      region: "sprite box never intersects the anchor or any reserved reading/caption region; if no position exists the sprite is not drawn on that beat",
      honesty: "disclosure() note in the treatment; the sprite never shows a success/error state, never replaces the cursor",
    },
    unsupported: [
      "capturing or rebuilding product UI (reuse the approved source pipeline)",
      "a mascot that is claimed as, or implied to be, a product feature",
      "moving the proof layer to fit the sprite",
      "following a target whose layout changed without refresh() (stale digest)",
      "anchors inside iframes/cross-origin content or non-DOM (canvas/video) targets: supply a measured rect instead",
      "sprite lip-sync, rigging or arbitrary turning (poses are idle/point/react only)",
    ],
  };

  return {
    version: VERSION, CAPABILITY: CAPABILITY,
    mount: mount, measureWorldBounds: measureWorldBounds, worldToScreen: worldToScreen, place: place, poseAt: poseAt, digestOf: digestOf, overlaps: overlaps, disclosure: disclosure,
  };
});
