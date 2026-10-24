/*
 * Recipe icon-portal-through: the camera dollies through the opening of an extruded icon (an outline SVG with a real
 * counter/hole) into the next scene. The next scene's FIRST frame (a local image) sits behind the icon, unlit and
 * colour-exact; it is held smaller than the opening until the camera passes the icon, then fills the frame exactly
 * at the end pose, which is held for a few frames so the next scene can start on that very frame (seam `shared`).
 * The camera leg ends at its peak speed (power3.in), reported in seam.out for the next scene's matching first leg.
 * Limit, stated: the mask is a size rule (holeFraction of the icon width), so the opening should be roughly round or square.
 */
(function (root, factory) {
  var C = typeof require === "function" && typeof module === "object" ? require("./common.js") : root.RasanRecipesCommon;
  C.registry.register(factory(C));
})(this, function (C) {
  "use strict";
  var params = {
    durationS: { type: "number", min: 1, max: 5, default: 2.4 },
    holdFrames: { type: "number", min: 2, max: 12, default: 3 },
    iconWidth: { type: "number", min: 0.5, max: 5, default: 2.4 },
    holeFraction: { type: "number", min: 0.2, max: 0.9, default: 0.5 },
    startDistance: { type: "number", min: 2, max: 30, default: 8 },
    planeWidth: { type: "number", min: 1, max: 8, default: 3.2 },
    lensMm: { type: "number", min: 14, max: 50, default: 24 },
    width: { type: "number", min: 320, max: 7680, default: 1920 },
    height: { type: "number", min: 240, max: 4320, default: 1080 },
    fps: { type: "number", min: 24, max: 60, default: 30 },
    iconSvg: { type: "string", local_asset: true, default: "" },
    nextFrame: { type: "string", local_asset: true, default: "" },
    nextColor: { type: "string", default: "#0b0b0d" },
  };

  function plan(opts) {
    var P = C.resolve(params, opts);
    var dFill = (P.planeWidth * P.lensMm) / 36;            // distance at which the plane exactly fills the frame width
    var gap = dFill * 1.5, planeZ = -gap, zEnd = planeZ + dFill; // zEnd < 0: the camera ends beyond the icon plane (z = 0)
    var flyS = C.snap(P.durationS - P.holdFrames / P.fps, P.fps), z0 = P.startDistance;
    var p = Math.pow(z0 / (z0 - zEnd), 1 / 3);               // power3.in: z(p) = z0 + (zEnd - z0) p^3 crosses the icon plane at z = 0
    var cross = C.snap(flyS * p, P.fps);
    return { P: P, dFill: dFill, planeZ: planeZ, zEnd: zEnd, z0: z0, flyS: flyS, duration: P.durationS, hits: [cross, flyS],
      seam: { kind: "camera-through", hold_s: P.holdFrames / P.fps, out: { speed_units_per_s: +(3 * (z0 - zEnd) / flyS).toFixed(3), direction: [0, 0, -1], lens_mm: P.lensMm } } };
  }
  function camera(opts) {
    var p = plan(opts);
    return { pos: [[0, [0, 0, p.z0]], [p.flyS, [0, 0, p.zEnd], "power3.in"]], target: [[0, [0, 0, -1]], [p.flyS, [0, 0, p.planeZ], "power3.in"]], lens: [[0, p.P.lensMm]], fstop: 8 };
  }
  function build(k, opts) {
    var p = plan(opts), P = p.P, T = k.THREE, warnings = [];
    if (!P.iconSvg) throw new Error("icon-portal-through needs opts.iconSvg: a local outline SVG with a real opening");
    k.rig("three-point", { dir: [-0.4, 0.7, 0.9], shadowSize: 4 });
    var planeH = P.planeWidth * (P.height / P.width);
    var mat = new T.MeshBasicMaterial({ toneMapped: false, color: 0xffffff });
    var tex = P.nextFrame ? Promise.resolve(k.image(C.localAsset(P.nextFrame, "nextFrame"))) : Promise.resolve(null);
    if (!P.nextFrame) { mat.color = new T.Color(P.nextColor); warnings.push("downgrade: no opts.nextFrame, so the seam shows a flat colour, not the next scene's real first frame"); }
    var plane = new T.Mesh(new T.PlaneGeometry(P.planeWidth, planeH), mat);
    plane.position.z = p.planeZ;
    k.scene.add(plane);
    return tex.then(function (map) { if (map) mat.map = map; return C.readLocalText(P.iconSvg, "iconSvg"); }).then(function (svgText) {
      var w = C.svgWidthOf(svgText);
      return k.svg(svgText, { width: P.iconWidth, depth: w * 0.05, bevelThickness: w * 0.012, bevelSize: w * 0.008 }).then(function (icon) {
        k.scene.add(icon);
        var gap = -p.planeZ;
        function pose(t, kk) {
          kk = kk || k;
          var camZ = kk.at(t, [[0, p.z0], [p.flyS, p.zEnd, "power3.in"]]);
          // before the camera crosses the icon, the next frame stays inside the opening's apparent size; after, it is free
          var s = camZ <= 0.02 ? 1 : Math.min(1, (P.iconWidth * P.holeFraction * (camZ + gap)) / (camZ * P.planeWidth));
          plane.scale.set(s, s, 1);
        }
        return { duration: p.duration, hits: p.hits, objects: { icon: icon, plane: plane }, pose: pose, seam: p.seam, warnings: warnings };
      });
    });
  }
  return { id: "icon-portal-through", label: "Camera through an icon", summary: "The camera dollies through an extruded icon's opening; the next scene's first frame fills the frame exactly at the hold.", params: params, requires: ["iconSvg", "nextFrame (image of the next scene's first frame)"], plan: plan, camera: camera, build: build };
});
