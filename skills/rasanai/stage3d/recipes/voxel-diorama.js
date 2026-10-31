/*
 * Recipe voxel-diorama: a little block world (terrain heightmap, water, trees, optional product slab) built from ONE InstancedMesh,
 * that RISES column by column in a seeded order and then holds while the camera drifts around it at a near-isometric angle.
 * Seek-safe: pose(t) rewrites instance matrices as a pure function of t; the world is built once from opts.seed (mulberry-style hash, no
 * Math.random). Voxels are lit, not unlit, so shadows read; palette is data: opts.palette = { deep, water, sand, grass, stone, snow, trunk, leaf }.
 * Drop-in: Rasan3D.stage({ camera: R.camera(opts) ... build(k) { return R.build(k, opts) } }) like any recipe; opts.voxels = [{x,y,z,c:"#hex"}]
 * replaces the generated terrain (a hand-authored level or a Codex voxel plate traced offline). Budget: grid^2 * height instances, capped.
 */
(function (root, factory) {
  var C = typeof require === "function" && typeof module === "object" ? require("./common.js") : root.RasanRecipesCommon;
  C.registry.register(factory(C));
})(this, function (C) {
  "use strict";
  var params = {
    durationS: { type: "number", min: 2, max: 14, default: 7 },
    riseS: { type: "number", min: 0.6, max: 5, default: 2.4 },
    grid: { type: "number", min: 6, max: 40, default: 20 },
    maxHeight: { type: "number", min: 2, max: 14, default: 7 },
    seed: { type: "number", min: 0, max: 99999, default: 11 },
    orbitDeg: { type: "number", min: 0, max: 180, default: 50 },
    pitchDeg: { type: "number", min: 15, max: 60, default: 35 },
    lensMm: { type: "number", min: 50, max: 200, default: 120 },
    trees: { type: "number", min: 0, max: 40, default: 10 },
    budgetInstances: { type: "number", min: 500, max: 30000, default: 12000 },
    fps: { type: "number", min: 24, max: 60, default: 30 },
  };
  var DEFAULT_PALETTE = { deep: "#2f5d8a", water: "#4f9bd0", sand: "#e8d49a", grass: "#6bb04a", stone: "#8a8f98", snow: "#f4f7fa", trunk: "#7a4e2d", leaf: "#2f8a3e" };

  function hash(a, b, c) { var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y, s) { var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }

  function plan(opts) {
    var P = C.resolve(params, opts), tBuilt = C.snap(Math.min(P.durationS - 0.5, P.riseS + 0.4), P.fps);
    return { P: P, tBuilt: tBuilt, duration: P.durationS, hits: [tBuilt] };
  }
  function camera(opts) {
    var p = plan(opts), P = p.P, d = (P.grid * 1.5 * P.lensMm) / (36 * 0.8), a0 = 45 * C.DEG, a1 = (45 + P.orbitDeg) * C.DEG, e = P.pitchDeg * C.DEG;
    function at(a) { return [d * Math.cos(e) * Math.sin(a), d * Math.sin(e) + P.maxHeight * 0.3, d * Math.cos(e) * Math.cos(a)]; }
    return { pos: [[0, at(a0)], [P.durationS, at(a1), "power1.inOut"]], target: [[0, [0, P.maxHeight * 0.25, 0]]], lens: [[0, P.lensMm]], fstop: 4 };
  }
  // the world as data: [{x, y, z, c}] in grid units (pure; runs in Node)
  function world(P, palette, custom) {
    if (custom) return custom;
    var out = [], g = P.grid, x, z, h, y, c, wl = Math.max(1, Math.round(P.maxHeight * 0.3)), n;
    for (x = 0; x < g; x++) for (z = 0; z < g; z++) {
      n = vnoise(x * 0.17, z * 0.17, P.seed) * 0.7 + vnoise(x * 0.4, z * 0.4, P.seed + 1) * 0.3;
      var edge = Math.min(x, z, g - 1 - x, g - 1 - z) / (g * 0.5); n *= 0.55 + 0.6 * Math.min(1, edge * 1.6);
      h = Math.max(1, Math.round(n * P.maxHeight));
      for (y = 0; y < h; y++) { c = y < wl - 1 ? palette.sand : y === h - 1 ? (h > P.maxHeight * 0.85 ? palette.snow : h > P.maxHeight * 0.62 ? palette.stone : h <= wl ? palette.sand : palette.grass) : palette.stone; out.push({ x: x, y: y, z: z, c: c }); }
      for (y = h; y < wl; y++) out.push({ x: x, y: y, z: z, c: y === wl - 1 ? palette.water : palette.deep });
      if (h > wl && h < P.maxHeight * 0.6 && out.length) { var ti = 0; if (hash(x, z, P.seed + 7) < P.trees / (g * g * 0.45) && ti++ < 1) { var k; for (k = 0; k < 3; k++) out.push({ x: x, y: h + k, z: z, c: palette.trunk }); [[0, 3], [1, 3], [-1, 3], [0, 4]].forEach(function (d) { out.push({ x: x + d[0], y: h + d[1] - 0, z: z, c: palette.leaf }); out.push({ x: x, y: h + d[1], z: z + d[0], c: palette.leaf }); }); } }
    }
    return out;
  }
  function build(k, opts) {
    var p = plan(opts), P = p.P, T = k.THREE, pal = Object.assign({}, DEFAULT_PALETTE, (opts && opts.palette) || {});
    var vox = world(P, pal, opts && opts.voxels);
    if (vox.length > P.budgetInstances) throw new Error("voxel-diorama over budget: " + vox.length + " voxels (limit " + P.budgetInstances + "); lower grid or maxHeight");
    var geo = new T.BoxGeometry(0.98, 0.98, 0.98), mat = new T.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), mesh = new T.InstancedMesh(geo, mat, vox.length), m4 = new T.Matrix4(), col = new T.Color(), q = new T.Quaternion(), s = new T.Vector3(), pos = new T.Vector3();
    var g = P.grid, delay = vox.map(function (v) { return (hash(v.x, v.z, P.seed + 3) * 0.55 + (v.y / P.maxHeight) * 0.35) * (P.riseS - 0.5); });
    vox.forEach(function (v, i) { mesh.setColorAt(i, col.set(v.c)); });
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
    var root = new T.Group(); root.add(mesh); root.position.set(-g / 2, 0, -g / 2); k.scene.add(root);
    k.rig("three-point", { dir: [-0.6, 1, 0.5], shadowSize: Math.max(8, g) });
    function pose(t) {
      var i, v, q01, e;
      for (i = 0; i < vox.length; i++) {
        v = vox[i]; q01 = Math.min(1, Math.max(0, (t - delay[i]) / 0.5)); e = 1 - Math.pow(1 - q01, 3) + Math.sin(q01 * 3.14159) * 0.12 * (1 - q01) ; // rise with a small overshoot
        s.setScalar(Math.max(1e-4, q01 > 0 ? 1 : 1e-4)); pos.set(v.x, v.y - (1 - Math.min(1, e)) * 6, v.z);
        if (q01 <= 0) s.setScalar(1e-4);
        m4.compose(pos, q, s); mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    pose(0);
    return { duration: p.duration, hits: p.hits, objects: { world: root, voxels: mesh }, pose: pose, budget: { instances: vox.length }, warnings: [] };
  }
  return { id: "voxel-diorama", label: "Voxel diorama", summary: "A block world (seeded terrain, water, trees) rises column by column, then the camera drifts round it; one InstancedMesh, lit and shadowed.", params: params, requires: ["optional voxels [{x,y,z,c}]"], plan: plan, camera: camera, build: build, world: world };
});
