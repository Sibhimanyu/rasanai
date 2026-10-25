/*
 * Recipe product-slab-evidence: a product slab (the REAL screenshot on a k.panel) turns face-on and the camera settles
 * on one region of it, close enough that the UI text stays legible. Ends on-axis (slab yaw/pitch 0, camera on the
 * region's normal) and holds. Needs a local screenshot; never a mock.
 */
(function (root, factory) {
  var C = typeof require === "function" && typeof module === "object" ? require("./common.js") : root.RasanRecipesCommon;
  C.registry.register(factory(C));
})(this, function (C) {
  "use strict";
  var params = {
    durationS: { type: "number", min: 2, max: 8, default: 3.2 },
    holdS: { type: "number", min: 0.3, max: 2, default: 0.6 },
    startYawDeg: { type: "number", min: -60, max: 60, default: -32 },
    startPitchDeg: { type: "number", min: -30, max: 30, default: 10 },
    regionX: { type: "number", min: 0, max: 0.9, default: 0.1 },
    regionY: { type: "number", min: 0, max: 0.9, default: 0.1 },
    regionW: { type: "number", min: 0.1, max: 1, default: 0.8 },
    regionH: { type: "number", min: 0.1, max: 1, default: 0.8 },
    fill: { type: "number", min: 0.5, max: 0.95, default: 0.8 },
    lensMm: { type: "number", min: 24, max: 85, default: 50 },
    slabWidth: { type: "number", min: 0.5, max: 6, default: 3.2 },
    aspect: { type: "number", min: 0.5, max: 3, default: 1.6667 },
    imageWidthPx: { type: "number", min: 320, max: 8192, default: 1920 },
    width: { type: "number", min: 320, max: 7680, default: 1920 },
    height: { type: "number", min: 240, max: 4320, default: 1080 },
    fps: { type: "number", min: 24, max: 60, default: 30 },
    screenshot: { type: "string", local_asset: true, default: "" },
  };
  var LEGIBLE_MIN = 0.75; // on-screen px per screenshot px at the end; below it small UI text softens

  function plan(opts) {
    var P = C.resolve(params, opts);
    var W = P.slabWidth, H = W / P.aspect;
    var rw = Math.min(P.regionW, 1 - P.regionX), rh = Math.min(P.regionH, 1 - P.regionY);
    var cx = (P.regionX + rw / 2 - 0.5) * W, cy = (0.5 - (P.regionY + rh / 2)) * H;
    // distance at which the region fills `fill` of the frame (width and height both fit)
    var dW = (rw * W * P.lensMm) / (36 * P.fill);
    var dH = (rh * H * P.lensMm) / (36 * (P.height / P.width) * P.fill);
    var d = Math.max(dW, dH);
    var tLand = C.snap(P.durationS - P.holdS, P.fps);
    var screenPx = (rw * W / C.visibleWidth(d, P.lensMm)) * P.width;
    var scale = screenPx / (rw * P.imageWidthPx);
    return { P: P, W: W, H: H, cx: cx, cy: cy, d: d, tLand: tLand, duration: P.durationS, hits: [tLand],
      legibility: { screen_px_per_image_px: +scale.toFixed(3), min: LEGIBLE_MIN, ok: scale >= LEGIBLE_MIN } };
  }
  function camera(opts) {
    var p = plan(opts), P = p.P;
    return {
      pos: [[0, [0, 0, p.d * 1.7]], [p.tLand, [p.cx, p.cy, p.d], "power3.inOut"]],
      target: [[0, [0, 0, 0]], [p.tLand, [p.cx, p.cy, 0], "power3.inOut"]],
      lens: [[0, P.lensMm]], fstop: 8, // deep focus on purpose: the UI must stay sharp
    };
  }
  function build(k, opts) {
    var p = plan(opts), P = p.P, warnings = [];
    if (!P.screenshot) throw new Error("product-slab-evidence needs opts.screenshot: a project-relative path of the real screenshot");
    if (!p.legibility.ok) warnings.push("legibility: the region renders at " + p.legibility.screen_px_per_image_px + " screen px per image px (min " + LEGIBLE_MIN + "); shrink regionW/H or raise the screenshot resolution");
    k.rig("top-soft", { shadows: false });
    return Promise.resolve(k.image(C.localAsset(P.screenshot, "screenshot"))).then(function (tex) { // k.image resolves to the texture
      var panel = k.panel({ width: p.W, height: p.H, depth: 0.06, radius: 0.05, texture: tex, bodyColor: (opts && opts.bodyColor) || "#16181d" });
      k.scene.add(panel);
      var yaw = P.startYawDeg * C.DEG, pitch = P.startPitchDeg * C.DEG;
      function pose(t, kk) {
        kk = kk || k;
        panel.rotation.y = kk.at(t, [[0, yaw], [p.tLand, 0, "power3.inOut"]]);
        panel.rotation.x = kk.at(t, [[0, pitch], [p.tLand, 0, "power3.inOut"]]);
      }
      return { duration: p.duration, hits: p.hits, objects: { panel: panel }, pose: pose, legibility: p.legibility, warnings: warnings };
    });
  }
  return { id: "product-slab-evidence", label: "Product slab to evidence", summary: "A slab carrying the real screenshot turns face-on and the camera settles on one region, on-axis and legible.", params: params, requires: ["screenshot"], plan: plan, camera: camera, build: build };
});
