/*
 * Recipe hero-turntable: the supplied hero object (a THREE.Object3D, or a local GLB) turns `turns` times and eases to rest
 * exactly on its hero yaw, while the camera settles from a slight elevation to the object's axis: the last frames are an
 * on-axis hero view. The object keeps its own brand materials unless materialKind asks for a Rasan3D preset (colour is kept).
 * Budget: triangle and material counts are checked at build; over budget throws (default) so GPU work stays bounded.
 */
(function (root, factory) {
  var C = typeof require === "function" && typeof module === "object" ? require("./common.js") : root.RasanRecipesCommon;
  C.registry.register(factory(C));
})(this, function (C) {
  "use strict";
  var KINDS = ["keep", "glass", "frosted-glass", "chrome", "brushed-metal", "clay", "ceramic", "gummy", "plastic", "concrete", "paper", "matte"];
  var params = {
    durationS: { type: "number", min: 2, max: 12, default: 6 },
    holdS: { type: "number", min: 0.4, max: 3, default: 1.2 },
    turns: { type: "number", min: 0.25, max: 3, default: 1 },
    heroYawDeg: { type: "number", min: -45, max: 45, default: 0 },
    startPitchDeg: { type: "number", min: 0, max: 30, default: 12 },
    endPitchDeg: { type: "number", min: -10, max: 30, default: 0 },
    lensMm: { type: "number", min: 35, max: 135, default: 70 },
    fill: { type: "number", min: 0.3, max: 0.8, default: 0.55 },
    objectSize: { type: "number", min: 0.2, max: 3, default: 1 },
    materialKind: { type: "enum", enum: KINDS, default: "keep" },
    budgetTriangles: { type: "number", min: 1000, max: 2000000, default: 300000 },
    budgetMaterials: { type: "number", min: 1, max: 32, default: 8 },
    budgetMode: { type: "enum", enum: ["throw", "warn"], default: "throw" },
    fps: { type: "number", min: 24, max: 60, default: 30 },
    model: { type: "string", local_asset: true, default: "" },
  };

  function plan(opts) {
    var P = C.resolve(params, opts);
    var tRest = C.snap(Math.max(0.5, P.durationS - P.holdS), P.fps);
    var d = (P.objectSize * P.lensMm) / (36 * P.fill);
    return { P: P, tRest: tRest, d: d, duration: P.durationS, hits: [tRest] };
  }
  function eye(d, deg) { var a = deg * C.DEG; return [0, d * Math.sin(a), d * Math.cos(a)]; }
  function camera(opts) {
    var p = plan(opts), P = p.P;
    return { pos: [[0, eye(p.d, P.startPitchDeg)], [p.tRest, eye(p.d, P.endPitchDeg), "power3.inOut"]], target: [[0, [0, 0, 0]]], lens: [[0, P.lensMm]], fstop: 5.6 };
  }
  function count(obj) {
    var tris = 0, mats = {}, n = 0;
    obj.traverse(function (o) {
      if (!o.isMesh) return;
      var g = o.geometry, idx = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
      tris += idx / 3;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m && !mats[m.uuid]) { mats[m.uuid] = 1; n++; } });
    });
    return { triangles: Math.round(tris), materials: n };
  }
  function build(k, opts) {
    var p = plan(opts), P = p.P, T = k.THREE, warnings = [];
    var src;
    if (opts && opts.object && opts.object.isObject3D) src = Promise.resolve(opts.object);
    else if (P.model) src = k.addon("loaders/GLTFLoader.js").then(function (m) { return new m.GLTFLoader().loadAsync(C.localAsset(P.model, "model")); }).then(function (g) { return g.scene; });
    else throw new Error("hero-turntable needs opts.object (a THREE.Object3D) or opts.model (a local .glb)");
    return src.then(function (obj) {
      var used = count(obj);
      if (used.triangles > P.budgetTriangles || used.materials > P.budgetMaterials) {
        var msg = "over budget: " + used.triangles + " triangles / " + used.materials + " materials (limit " + P.budgetTriangles + " / " + P.budgetMaterials + ")";
        if (P.budgetMode === "throw") throw new Error("hero-turntable " + msg + "; decimate the model or raise the budget on purpose");
        warnings.push(msg);
      }
      if (P.materialKind !== "keep") {
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          var c = o.material && o.material.color ? "#" + o.material.color.getHexString() : "#cccccc";
          o.material = k.material(P.materialKind, { color: c });
        });
      }
      obj.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // centre and normalise to objectSize (bounding sphere diameter) inside a pivot that turns
      var box = new T.Box3().setFromObject(obj), size = new T.Vector3(), c = new T.Vector3();
      box.getSize(size); box.getCenter(c);
      var sc = P.objectSize / Math.max(size.x, size.y, size.z, 1e-6);
      obj.position.set(-c.x, -c.y, -c.z);
      var scaler = new T.Group(); scaler.add(obj); scaler.scale.setScalar(sc);
      var pivot = new T.Group(); pivot.add(scaler);
      k.rig("three-point", { dir: [-0.5, 0.8, 0.7], shadowSize: 4 });
      k.scene.add(pivot);
      var y0 = (P.heroYawDeg + 360 * P.turns) * C.DEG, y1 = P.heroYawDeg * C.DEG;
      function pose(t, kk) { kk = kk || k; pivot.rotation.y = kk.at(t, [[0, y0], [p.tRest, y1, "power2.out"]]); }
      return { duration: p.duration, hits: p.hits, objects: { pivot: pivot }, pose: pose, budget: used, warnings: warnings };
    });
  }
  return { id: "hero-turntable", label: "Hero object turntable", summary: "Turns the hero object, eases to rest on its hero yaw and settles the camera on-axis; materials kept, budget enforced.", params: params, requires: ["object or model (.glb)"], plan: plan, camera: camera, build: build };
});
