/*
 * Recipe title-extrude-lockup: the 2D title's pixel rect becomes extruded brand type (flat at first, depth grows as it lifts),
 * flies to the official logo (the supplied SVG through k.svg, never redrawn) and lands beside it as a lockup; the logo
 * takes the landing as a small push. The camera starts on the layout pose, so the previous 2D frame is matched.
 * No static TTF? It says so (warnings) and sets the word on a flat plane instead of pretending it is extruded.
 */
(function (root, factory) {
  var C = typeof require === "function" && typeof module === "object" ? require("./common.js") : root.RasanRecipesCommon;
  C.registry.register(factory(C));
})(this, function (C) {
  "use strict";
  var params = {
    durationS: { type: "number", min: 1.5, max: 6, default: 3 },
    holdS: { type: "number", min: 0.1, max: 1, default: 0.3 },
    fromX: { type: "number", min: 0, max: 7680, default: 160 },
    fromY: { type: "number", min: 0, max: 4320, default: 168 },
    fromW: { type: "number", min: 40, max: 7680, default: 900 },
    fromH: { type: "number", min: 10, max: 2000, default: 96 },
    sizeUnits: { type: "number", min: 0.2, max: 3, default: 0.8 },
    depth: { type: "number", min: 0.02, max: 0.4, default: 0.12 },
    gap: { type: "number", min: 0, max: 1, default: 0.3 },
    logoWidth: { type: "number", min: 0.3, max: 4, default: 1 },
    tiltDeg: { type: "number", min: 0, max: 40, default: 16 },
    layoutDistance: { type: "number", min: 4, max: 30, default: 12 },
    fill: { type: "number", min: 0.3, max: 0.9, default: 0.6 },
    width: { type: "number", min: 320, max: 7680, default: 1920 },
    height: { type: "number", min: 240, max: 4320, default: 1080 },
    fps: { type: "number", min: 24, max: 60, default: 30 },
    text: { type: "string", default: "" },
    titleColor: { type: "string", default: "#f2f2f2" },
    font: { type: "string", local_asset: true, default: "" },
    logoSvg: { type: "string", local_asset: true, default: "" },
  };

  function plan(opts) {
    var P = C.resolve(params, opts);
    var tLand = C.snap(P.holdS + (P.durationS - P.holdS) * 0.8, P.fps);
    return { P: P, tLand: tLand, duration: P.durationS, hits: [tLand] };
  }
  function camera(opts) {
    var p = plan(opts), D = p.P.layoutDistance;
    // t = 0 is the layout pose (the 2D frame); then a small settle push so the lockup is not static
    return { pos: [[0, [0, 0, D]], [p.P.holdS, [0, 0, D]], [p.P.durationS, [0, 0, D * 0.95], "power2.out"]], target: [[0, [0, 0, 0]]], lens: [[0, 50]], fstop: 8 };
  }
  function build(k, opts) {
    var p = plan(opts), P = p.P, T = k.THREE, warnings = [];
    if (!P.text) throw new Error("title-extrude-lockup needs opts.text (the title)");
    if (!P.logoSvg) throw new Error("title-extrude-lockup needs opts.logoSvg: the official logo as a local SVG (it is extruded, never redrawn)");
    k.rig("three-point", { dir: [-0.5, 0.8, 0.7], shadowSize: 6 });
    var flat = k.layout({ at: 0, distance: P.layoutDistance });
    flat.updateMatrixWorld(true);
    var ppu = flat.userData.pxPerUnit;
    var textHeightUnits = P.fromH / ppu;
    var startScale = textHeightUnits / P.sizeUnits;

    return Promise.all([C.readLocalText(P.logoSvg, "logoSvg"), P.font ? k.extrudeText(P.text, { font: C.localAsset(P.font, "font"), size: P.sizeUnits, depth: P.depth, align: "center", color: P.titleColor }) : null]).then(function (r) {
      var svgText = r[0], textMesh = r[1];
      return k.svg(svgText, { width: P.logoWidth, depth: C.svgWidthOf(svgText) * 0.04, bevelThickness: C.svgWidthOf(svgText) * 0.01, bevelSize: C.svgWidthOf(svgText) * 0.006 }).then(function (logo) {
        if (!textMesh) {
          warnings.push("downgrade: no static TTF/OTF in opts.font, so the title is a flat text plane, not extruded (node scripts/stage3d.mjs font ... makes one)");
          var h = P.sizeUnits * 1.3, w = h * (1600 / 300);
          textMesh = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: k.text({ text: P.text, size: 170, weight: 700, color: P.titleColor, width: 1600, height: 300, align: "center", valign: "middle" }), transparent: true, toneMapped: false }));
        }
        var tSize = C.boxSize(T, textMesh), lSize = C.boxSize(T, logo);
        var gapU = P.gap * lSize.y, total = lSize.x + gapU + tSize.x;
        // the lockup is scaled so it spans `fill` of the frame width at the camera's resting distance
        var sf = (P.fill * C.visibleWidth(P.layoutDistance, 50)) / total;
        var logoX = (-total / 2 + lSize.x / 2) * sf, textX = (total / 2 - tSize.x / 2) * sf;
        // the extruded word starts left-aligned on the 2D title's own pixel rect
        var startPos = flat.localToWorld(new T.Vector3(P.fromX + (tSize.x * startScale * ppu) / 2, P.fromY + P.fromH / 2, 0));
        k.scene.remove(flat);
        var endPos = new T.Vector3(textX, 0, 0);
        k.scene.add(textMesh); k.scene.add(logo);
        var tiltR = P.tiltDeg * C.DEG, hold = P.holdS, tl = p.tLand, tMid = hold + (tl - hold) * 0.5;
        function pose(t, kk) {
          kk = kk || k;
          var u = kk.prog(t, hold, tl, "power3.inOut");
          var s = startScale + (sf - startScale) * u;
          var zs = 0.04 + 0.96 * kk.prog(t, hold, hold + (tl - hold) * 0.45, "power2.out"); // depth grows as it lifts
          textMesh.position.set(startPos.x + (endPos.x - startPos.x) * u, startPos.y + (endPos.y - startPos.y) * u, startPos.z + 0.35 * Math.sin(Math.PI * u) * sf);
          textMesh.scale.set(s, s, s * zs);
          textMesh.rotation.y = kk.at(t, [[hold, 0], [tMid, tiltR, "power2.inOut"], [tl, 0, "power3.inOut"]]);
          var ls = Math.max(0.001, sf * kk.prog(t, tMid, tl, "expo.out"));
          logo.scale.setScalar(ls); // the logo was built at logoWidth world units; sf scales the whole lockup
          logo.position.set(logoX, 0, kk.at(t, [[tl, 0], [tl + 0.08, -0.04 * sf, "power2.out"], [tl + 0.45, 0, "power2.out"]]));
        }
        return { duration: p.duration, hits: p.hits, objects: { text: textMesh, logo: logo }, pose: pose, warnings: warnings, extruded: !warnings.length };
      });
    });
  }
  return { id: "title-extrude-lockup", label: "Title to extruded brand lockup", summary: "The 2D title lifts into extruded brand type and lands beside the real, extruded logo.", params: params, requires: ["logoSvg", "font (static TTF/OTF, optional)"], plan: plan, camera: camera, build: build };
});
