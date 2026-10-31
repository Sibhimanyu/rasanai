/*
 * Recipe clay-toy: soft physical toys (clay / gummy / plastic / felt-like matte) that move like stop-motion: held on TWOS (stepFps 12 by
 * default), squash and stretch that keeps volume, a hop with anticipation, landing and settle, and a seeded per-step "boil" wobble
 * (a tiny rotation and scale jitter that changes each held frame, never smooth). Seek-safe: pose(t) is a pure function of t; the held time is
 * floor(t * stepFps) / stepFps, the wobble is a hash of the step index.
 * Cast: opts.object (a THREE.Object3D) takes the lead role, else `count` rounded primitives (sphere, capsule, cone, torus) in opts.colors.
 * Each toy hops to its own beat (staggered); hits = the landing times. Materials come from Rasan3D's presets (k.material), so the soft look
 * is the same physical material the rest of the engine uses.
 */
(function (root, factory) {
  var C = typeof require === "function" && typeof module === "object" ? require("./common.js") : root.RasanRecipesCommon;
  C.registry.register(factory(C));
})(this, function (C) {
  "use strict";
  var KINDS = ["clay", "gummy", "plastic", "ceramic", "matte"];
  var params = {
    durationS: { type: "number", min: 2, max: 12, default: 5 },
    count: { type: "number", min: 1, max: 9, default: 4 },
    hopS: { type: "number", min: 0.4, max: 2, default: 0.8 },
    staggerS: { type: "number", min: 0, max: 1, default: 0.25 },
    hopHeight: { type: "number", min: 0.1, max: 2, default: 0.7 },
    squash: { type: "number", min: 0, max: 0.5, default: 0.28 },
    stepFps: { type: "number", min: 6, max: 30, default: 12 },
    boil: { type: "number", min: 0, max: 1, default: 0.35 },
    materialKind: { type: "enum", enum: KINDS, default: "clay" },
    objectSize: { type: "number", min: 0.2, max: 3, default: 0.8 },
    lensMm: { type: "number", min: 35, max: 135, default: 70 },
    seed: { type: "number", min: 0, max: 99999, default: 5 },
    fps: { type: "number", min: 24, max: 60, default: 30 },
  };
  var COLORS = ["#e86a4a", "#f2c14e", "#5ab0a6", "#7a6bd6", "#ef8fb1", "#8bc36a", "#4b8fd6", "#f2a65a", "#c9c3b8"];
  function hash(a, b) { var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  function plan(opts) {
    var P = C.resolve(params, opts), landings = [], i, t;
    for (i = 0; i < P.count; i++) { t = C.snap(0.4 + i * P.staggerS + P.hopS, P.fps); landings.push(Math.min(t, P.durationS)); }
    return { P: P, landings: landings, duration: P.durationS, hits: landings };
  }
  function camera(opts) {
    var P = plan(opts).P, w = P.count * P.objectSize * 1.6 + 1, d = (w * P.lensMm) / 36;
    return { pos: [[0, [0, P.objectSize * 0.9, d]], [P.durationS, [0.2 * w * 0.2, P.objectSize * 0.7, d * 0.92], "power1.inOut"]], target: [[0, [0, P.objectSize * 0.35, 0]]], lens: [[0, P.lensMm]], fstop: 4 };
  }
  // hop curve in 0..1 over [0, hopS]: crouch (0..0.18), launch+air (0.18..0.82), land+settle (0.82..1). Returns { y: 0..1 height, s: vertical scale }
  function hop(u, squash) {
    if (u <= 0 || u >= 1) return { y: 0, s: 1 };
    if (u < 0.18) { var a = u / 0.18; return { y: 0, s: 1 - squash * Math.sin(a * Math.PI / 2) }; }
    if (u < 0.82) { var b = (u - 0.18) / 0.64; return { y: 4 * b * (1 - b), s: 1 + squash * 0.7 * Math.sin(b * Math.PI) - squash * 0.3 * (b < 0.15 ? 1 - b / 0.15 : 0) }; }
    var c = (u - 0.82) / 0.18; return { y: 0, s: 1 - squash * 0.9 * Math.sin(c * Math.PI) * (1 - c * 0.4) };
  }
  function build(k, opts) {
    var p = plan(opts), P = p.P, T = k.THREE, toys = [], i, g, mesh, geo, lead = opts && opts.object && opts.object.isObject3D ? opts.object : null;
    var colors = (opts && opts.colors) || COLORS, S = P.objectSize, shapes = [function () { return new T.SphereGeometry(S * 0.5, 32, 24); }, function () { return new T.CapsuleGeometry(S * 0.3, S * 0.45, 8, 20); }, function () { return new T.ConeGeometry(S * 0.45, S * 0.95, 28, 1); }, function () { return new T.TorusGeometry(S * 0.32, S * 0.16, 16, 32); }];
    for (i = 0; i < P.count; i++) {
      g = new T.Group();
      if (lead && i === 0) { var o = lead, box = new T.Box3().setFromObject(o), sz = new T.Vector3(), ce = new T.Vector3(); box.getSize(sz); box.getCenter(ce); var sc = S / Math.max(sz.x, sz.y, sz.z, 1e-6); o.position.set(-ce.x, -box.min.y, -ce.z); var sw = new T.Group(); sw.add(o); sw.scale.setScalar(sc); g.add(sw); }
      else { geo = shapes[i % shapes.length](); geo.computeBoundingBox(); mesh = new T.Mesh(geo, k.material(P.materialKind, { color: colors[i % colors.length] })); mesh.position.y = -geo.boundingBox.min.y; mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); }
      g.position.x = (i - (P.count - 1) / 2) * S * 1.5; k.scene.add(g); toys.push({ g: g, x: g.position.x });
    }
    var ground = new T.Mesh(new T.CircleGeometry(S * P.count * 1.2, 64), k.material("matte", { color: "#e9e4da" })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; k.scene.add(ground);
    k.rig("three-point", { dir: [-0.5, 0.9, 0.6], shadowSize: 6 });
    function pose(t) {
      var th = Math.floor(Math.max(0, t) * P.stepFps + 1e-6) / P.stepFps, n = Math.floor(th * P.stepFps + 1e-6), j, u, h, tt, w1, w2;
      for (j = 0; j < toys.length; j++) {
        tt = th - (0.4 + j * P.staggerS); u = tt / P.hopS; h = hop(u, P.squash);
        w1 = (hash(n, j * 31 + P.seed) - 0.5) * 0.12 * P.boil; w2 = 1 + (hash(n + 77, j + P.seed) - 0.5) * 0.04 * P.boil;
        toys[j].g.position.y = h.y * P.hopHeight * S; toys[j].g.scale.set(w2 / Math.sqrt(h.s), h.s, w2 / Math.sqrt(h.s));
        toys[j].g.rotation.set(0, (u > 0 && u < 1 ? u * 0.9 : 0) + w1, w1 * 0.6);
      }
    }
    pose(0);
    return { duration: p.duration, hits: p.hits, objects: { toys: toys.map(function (x) { return x.g; }) }, pose: pose, warnings: [] };
  }
  return { id: "clay-toy", label: "Clay toy stop-motion", summary: "Soft physical toys hop on twos with volume-keeping squash and stretch and a seeded per-step boil; hits are the landings.", params: params, requires: ["optional object"], plan: plan, camera: camera, build: build, hop: hop };
});
