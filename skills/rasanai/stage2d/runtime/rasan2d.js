/* Rasan2D: a deterministic hand-painted 2D character stage for HyperFrames scenes (the 2D sibling of Rasan3D).
 *
 *   Rasan2D.mount(canvas, { width: 1920, height: 1080, seed: 1, look })      -> a renderer bound to a canvas
 *   Rasan2D.addActor({ id: "hero-01", canon: identity, position: { x: 0.5, y: 0.78 }, scale: 1, yaw: "front", emotion: "calm" })
 *   Rasan2D.renderAt(1.25, { actions: [{ actor: "hero-01", kind: "look", at: 0.8, duration: 0.4, target: [0.7, 0.5] }] })
 *   Rasan2D.load(sequence)            a whole film as data (shots, sets, actors, props, actions): see fixtures/demo-sequence.json
 *   Rasan2D.stage({ id, canvas, timeline, duration, sequence | actors+actions, seed, look })     the HyperFrames form (the paused GSAP timeline is the clock)
 *
 * renderAt(t) is a pure function of t, the seed, the look and the actions: nothing is integrated from the previous frame, nothing is
 * mutated for the future, no Math.random and no clock. Ask for any t in any order, twice, or on a parallel worker: same pixels.
 * The line "boil" is 12 drawings per second (look.boil.hz), seeded per actor AND per body part; the camera and the poses stay smooth.
 * Caches hold only completed, pure results (hash tables, paper and grain textures, a shot's painted backdrop layers).
 *
 * Documented signatures: references/2d-character.md. Original code (no p5.brush, no copied character).
 */
(function (root) {
  "use strict";
  var K = (root.Rasan2DKit = root.Rasan2DKit || {});
  var VERSION = "1.0.0";
  var B = K.brush, C = K.character, G = K.gestures;
  if (!B || !C || !G) throw new Error("Rasan2D needs brush.js, character.js and gestures.js loaded first (assets/rasan2d/)");
  var TAU = Math.PI * 2;

  var LOOK = {
    paper: { tint: "#f1e7d2", grain: 0.5, fibres: 1 },
    ink: { width: 1, wobble: 1 }, inkColor: null,
    wash: { opacity: 1 },
    boil: { hz: 12, amp: 1 },
    glow: { strength: 0.6 },
    grade: { tint: null, strength: 0 },
    light: { dir: [-0.5, -0.8] },
    vignette: 0.16,
    layers: { wash: true, ink: true, paper: true, glow: true, grain: true, bristles: true },
  };
  function merge(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k] && typeof a[k] === "object" && !Array.isArray(a[k]) ? merge(a[k], {}) : a[k];
    for (k in (b || {})) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object" ? merge(a[k], b[k]) : b[k];
    return o;
  }
  function noRemote(v, where) {
    var s = JSON.stringify(v || "");
    if (/(https?|ftp|data|javascript|blob):/i.test(s.replace(/"#[0-9a-f]{3,8}"/gi, ""))) throw new Error("Rasan2D: " + where + " must not carry a remote or script URL (local project files only)");
  }

  // ------------------------------------------------------------------ the sets: a painted backdrop in cached layers
  var SET_MARGIN = 0.14;
  var PARALLAX = { far: 0.35, mid: 0.7, near: 1 };
  function drawElement(ctx, el, W, H, seed, look) {
    var x = el.x * W, y = el.y * H, s = (el.s || 1), rs = B.mix(seed, B.hashStr(el.id || el.kind + ":" + el.x + ":" + el.y));
    var pal = look.set || {};
    var wash = function (pts, color, o) { B.wash(ctx, pts, Object.assign({ color: color, seed: rs, frame: 0, jitter: 2.2, under: 0.97, passes: 3, edge: 0.3, k: 1, shade: { light: 0.18, dark: 0.2 } }, o || {})); };
    var circle = function (cx, cy, r, n) { var pts = []; n = n || 22; for (var i = 0; i < n; i++) { var a = (i / n) * TAU, rr = r * (0.92 + 0.16 * B.hash01(rs, i, Math.round(cx))); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.93]); } return pts; };
    switch (el.kind) {
      case "sky": {
        var g = ctx.createLinearGradient(0, -H * 0.2, 0, H * (el.to || 0.8));
        g.addColorStop(0, el.top || pal.skyTop || "#bfd8e0"); g.addColorStop(1, el.bottom || pal.skyBottom || "#f6e9c8");
        ctx.save(); ctx.fillStyle = g; ctx.globalAlpha = 0.92; ctx.fillRect(-W, -H, W * 3, H * 3); ctx.restore();
        B.bristles(ctx, [[-W * 0.1, H * 0.15], [W * 1.1, H * 0.2]], { seed: rs, frame: 0, color: "#ffffff", n: 18, width: H * 0.42, alpha: 0.2, size: 3, dry: 0.5, flow: 0.8 });
        break;
      }
      case "ground": {
        var gy = el.y * H, pts = [[-W * 0.2, gy], [W * 0.3, gy - 6], [W * 0.7, gy + 4], [W * 1.2, gy - 3], [W * 1.2, H * 1.3], [-W * 0.2, H * 1.3]];
        wash(pts, el.color || pal.ground || "#9bb873", { shade: { light: 0.2, dark: 0.3, dir: [0, -1] }, edge: 0.45, jitter: 3 });
        B.bristles(ctx, [[-W * 0.1, gy + H * 0.04], [W * 1.1, gy + H * 0.05]], { seed: rs, frame: 0, color: "#5f7d44", n: 22, width: H * 0.2, alpha: 0.22, size: 2.4, dry: 0.45, flow: 0.4 });
        B.bristles(ctx, [[-W * 0.1, gy + H * 0.12], [W * 1.1, gy + H * 0.11]], { seed: rs + 1, frame: 0, color: "#e7efb1", n: 14, width: H * 0.16, alpha: 0.18, size: 2.2, dry: 0.5, flow: 0.4 });
        ctx.save(); ctx.strokeStyle = B.rgba("#46603a", 0.5); ctx.lineWidth = 2; ctx.lineCap = "round";
        var r = B.rng(rs + 9);
        for (var i = 0; i < 90; i++) { var gx = r() * W * 1.2 - W * 0.1, gyy = gy + 10 + r() * (H - gy) * 0.9, hh = 8 + r() * 16; ctx.beginPath(); ctx.moveTo(gx, gyy); ctx.quadraticCurveTo(gx + (r() - 0.5) * 8, gyy - hh * 0.6, gx + (r() - 0.5) * 12, gyy - hh); ctx.stroke(); }
        ctx.restore();
        break;
      }
      case "hill": {
        var hy = el.y * H, w = (el.w || 0.8) * W, h = (el.h || 0.2) * H, pts2 = [];
        for (var j = 0; j <= 14; j++) { var u = j / 14, a = Math.PI * u; pts2.push([x - w / 2 + w * u, hy - Math.sin(a) * h * (0.9 + 0.2 * B.hash01(rs, j, 4))]); }
        pts2.push([x + w / 2, hy + 40], [x - w / 2, hy + 40]);
        wash(pts2, el.color || pal.hill || "#a9c48b", { shade: { light: 0.25, dark: 0.2, dir: [-0.3, -1] }, jitter: 3 });
        break;
      }
      case "tree": {
        var th = (el.h || 0.62) * H * s, tw = th * 0.085, base = [x, y], lean = (el.lean || 0) * th;
        var trunk = []; for (var q = 0; q <= 10; q++) { var uu = q / 10, cxx = x + lean * uu * uu + Math.sin(uu * 2.2) * tw * 0.4; trunk.push([cxx - tw * (1 - uu * 0.55), y - th * 0.78 * uu]); }
        for (var q2 = 10; q2 >= 0; q2--) { var uu2 = q2 / 10, cx2 = x + lean * uu2 * uu2 + Math.sin(uu2 * 2.2) * tw * 0.4; trunk.push([cx2 + tw * (1 - uu2 * 0.55), y - th * 0.78 * uu2]); }
        wash(trunk, el.trunk || pal.trunk || "#8a6247", { shade: { light: 0.22, dark: 0.3 }, hatch: 9, edge: 0.4 });
        // the branch: out to the side, where something can hang
        var bx = x + (el.branchDx || 0.16) * W * s, by = y - th * (el.branchAt || 0.72) , br = [];
        for (var b2 = 0; b2 <= 10; b2++) { var ub = b2 / 10; br.push([x + lean * 0.7 + (bx - x - lean * 0.7) * ub, by + 20 - Math.sin(ub * Math.PI * 0.5) * 36 - ub * 10 + 10 * ub * ub]); }
        var brp = B.ribbonPoly(br, tw * 0.55, tw * 0.22);
        wash(brp, el.trunk || pal.trunk || "#8a6247", { shade: { light: 0.2, dark: 0.3 }, jitter: 1.4, edge: 0.4 });
        // the canopy: overlapped washes
        var cr = th * 0.3, cx0 = x + lean * 0.9, cy0 = y - th * 0.9;
        var leaf = el.leaf || pal.leaf || "#6f9a52", blobs = [[0, 0, 1], [-0.7, 0.28, 0.78], [0.78, 0.2, 0.82], [-0.28, -0.55, 0.7], [0.45, -0.5, 0.64], [1.35, 0.35, 0.55]];
        blobs.forEach(function (bl, i) { wash(circle(cx0 + bl[0] * cr, cy0 + bl[1] * cr, cr * bl[2], 26), B.hex(B.shade(leaf, 0.9 + 0.12 * ((i * 37) % 5) / 5)), { passes: 3, jitter: 3, edge: 0.4 }); });
        B.bristles(ctx, [[cx0 - cr * 1.4, cy0 + cr * 0.2], [cx0 + cr * 1.6, cy0 - cr * 0.1]], { seed: rs, frame: 0, color: "#3f6a3a", n: 14, width: cr * 1.4, alpha: 0.2, size: 2.2, dry: 0.5, flow: 0.9 });
        el._anchor = { branchTip: [bx / W, (by) / H] };
        break;
      }
      case "bush": {
        var br2 = (el.r || 0.07) * H * s, leafc = el.leaf || pal.bush || "#5e8f4e";
        [[-1.2, 0.2, 0.8], [-0.4, -0.1, 1], [0.5, 0, 0.95], [1.3, 0.25, 0.75], [0.0, 0.45, 0.8]].forEach(function (bl, i) { wash(circle(x + bl[0] * br2, y - br2 * 0.6 + bl[1] * br2 * 0.5, br2 * bl[2], 24), B.hex(B.shade(leafc, 0.88 + 0.07 * i)), { passes: 3, jitter: 2.6, edge: 0.4 }); });
        B.bristles(ctx, [[x - br2 * 1.6, y - br2 * 0.5], [x + br2 * 1.6, y - br2 * 0.7]], { seed: rs, frame: 0, color: "#2f5a35", n: 10, width: br2 * 1.3, alpha: 0.22, size: 2, dry: 0.5, flow: 0.7 });
        break;
      }
      case "cloud": {
        var cw = (el.w || 0.2) * W * s;
        [[-0.3, 0.05, 0.28], [0, -0.1, 0.36], [0.32, 0.05, 0.26]].forEach(function (bl) { wash(circle(x + bl[0] * cw, y + bl[1] * cw * 0.6, bl[2] * cw * 0.7, 22), "#fff8ec", { passes: 2, jitter: 3, under: 0.9, edge: 0.15, shade: { light: 0.1, dark: 0.12 } }); });
        break;
      }
      case "rock": {
        var rr = (el.r || 0.04) * H * s, pts3 = []; for (var k = 0; k < 12; k++) { var a2 = (k / 12) * TAU; pts3.push([x + Math.cos(a2) * rr * (0.9 + 0.2 * B.hash01(rs, k, 1)), y + Math.sin(a2) * rr * 0.65 * (0.9 + 0.2 * B.hash01(rs, k, 2))]); }
        wash(pts3, el.color || "#b6b0a6", { shade: { light: 0.25, dark: 0.3 } });
        break;
      }
      case "flowers": {
        var rg = B.rng(rs), n = el.n || 12;
        for (var f = 0; f < n; f++) { var fx = x + (rg() - 0.5) * (el.w || 0.3) * W, fy = y + (rg() - 0.5) * 30; ctx.save(); ctx.strokeStyle = B.rgba("#46603a", 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + (rg() - 0.5) * 6, fy - 16 - rg() * 14); ctx.stroke(); ctx.restore(); wash(circle(fx, fy - 20, 6 + rg() * 3, 10), ["#f6c1c9", "#ffe08a", "#ffffff"][f % 3], { passes: 1, jitter: 1, edge: 0.2 }); }
        break;
      }
    }
  }
  function buildSetLayers(set, W, H, seed, look) {
    var mW = Math.round(W * (1 + 2 * SET_MARGIN)), mH = Math.round(H * (1 + 2 * SET_MARGIN)), out = {};
    ["far", "mid", "near"].forEach(function (layer) {
      var c = root.document.createElement("canvas");
      c.width = mW; c.height = mH;
      var x = c.getContext("2d");
      x.translate(W * SET_MARGIN, H * SET_MARGIN);
      var els = (set.elements || []).filter(function (e) { return (e.layer || "mid") === layer; });
      els.forEach(function (e) { drawElement(x, e, W, H, B.mix(seed, 777), merge(look, { set: set.palette || {} })); });
      out[layer] = c;
    });
    return out;
  }

  // ------------------------------------------------------------------ props (painted, in a prop-local frame)
  var PROP_DRAW = {
    pear: function (ctx, p, env) {
      var r = p.size * 0.5, pts = [];
      for (var i = 0; i < 26; i++) { var a = (i / 26) * TAU - Math.PI / 2, s = Math.sin(a), c = Math.cos(a), wd = r * (0.78 + 0.5 * (s > 0 ? 1 : 0.0) * s * 0.55 + (s < 0 ? 0.18 * s : 0)); pts.push([c * wd, s * r * 1.1 + (s < 0 ? 0 : 0)]); }
      pts = pts.map(function (q) { var top = (q[1] < -r * 0.2) ? Math.max(0.55, 1 + (q[1] + r * 0.2) / (r * 1.2)) : 1; return [q[0] * top, q[1]]; });
      paint(ctx, pts, p, env, p.color || "#b9c847", { shade: { light: 0.32, dark: 0.28 }, hatch: 5 });
      // blush, stem, leaf
      var bl = B.ellipse(r * 0.28, r * 0.25, r * 0.38, r * 0.5, 0.4, 16).map(function (q) { return q; });
      ctx.save(); B.pathSmooth(ctx, tr(bl, p), true); ctx.fillStyle = B.rgba("#e5845a", 0.38); ctx.fill(); ctx.restore();
      var stem = [[0, -r * 1.05], [r * 0.06, -r * 1.35], [r * 0.2, -r * 1.55]].map(function (q) { return tr([q], p)[0]; });
      B.ribbon(ctx, B.bezier(stem[0], stem[1], stem[2], 8), { color: "#5b3a22", width: Math.max(3, r * 0.14), seed: B.mix(env.seed, 31), frame: env.frame, taper: [0.1, 0.3], alpha: 1 });
      var leaf = [[r * 0.18, -r * 1.4], [r * 0.7, -r * 1.75], [r * 1.0, -r * 1.35], [r * 0.55, -r * 1.3]].map(function (q) { return tr([q], p)[0]; });
      B.wash(ctx, B.boil(leaf, B.mix(env.seed, 33), env.frame, env.amp, true), { color: "#69a050", seed: env.seed + 33, frame: env.frame, jitter: 1, under: 0.97, passes: 2, edge: 0.4, k: 1, shade: { light: 0.2, dark: 0.2 } });
      B.ink(ctx, B.boil(leaf, B.mix(env.seed, 34), env.frame, env.amp, true), { color: "#302921", width: 2.2, seed: env.seed + 34, frame: env.frame });
    },
    ball: function (ctx, p, env) { paint(ctx, B.ellipse(0, 0, p.size / 2, p.size / 2, 0, 24), p, env, p.color || "#e0705a", { shade: { light: 0.3, dark: 0.3 } }); },
  };
  function tr(pts, p) { // prop-local -> world (rotation, squash)
    var c = Math.cos(p.rot), s = Math.sin(p.rot);
    return pts.map(function (q) { var x = q[0] * p.sx, y = q[1] * p.sy; return [p.x + x * c - y * s, p.y + x * s + y * c]; });
  }
  function paint(ctx, local, p, env, color, o) {
    var pts = tr(local, p), bp = B.boil(pts, B.mix(env.seed, 21), env.frame, env.amp, true);
    B.wash(ctx, bp, Object.assign({ color: color, seed: env.seed + 21, frame: env.frame, jitter: Math.max(0.6, env.amp * 0.7), under: 0.97, passes: 3, edge: 0.32, k: 1 }, o));
    B.ink(ctx, bp, { color: "#302921", width: 2.8, seed: env.seed + 22, frame: env.frame });
  }

  // ------------------------------------------------------------------ the renderer
  function createRenderer(canvas, opts) {
    opts = opts || {};
    var W = opts.width || canvas.width || 1920, H = opts.height || canvas.height || 1080;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    var R = {
      canvas: canvas, ctx: canvas.getContext("2d"), W: W, H: H, seed: (opts.seed == null ? null : opts.seed | 0), look: merge(LOOK, opts.look || {}), actors: {}, propsDef: {}, seq: null, tl: null, tlKey: "", bg: {}, errors: [], lastRig: {}, lastOrder: [],
    };
    if (opts.seed == null) R.errors.push("unseeded: Rasan2D.mount needs an integer seed");
    noRemote(opts.look, "look");

    R.addActor = function (a) {
      if (!a || !a.id) throw new Error("addActor needs an id");
      noRemote(a.canon, "canon");
      var canon = a.canon;
      if (!canon) R.errors.push("canon-missing: actor " + a.id + " has no canon (identity.json)");
      R.actors[a.id] = { id: a.id, canon: canon || null, rig: C.rigOf(canon || {}), position: a.position || { x: 0.5, y: 0.78 }, scale: a.scale || 1, yaw: a.yaw != null ? a.yaw : "front", emotion: a.emotion || "calm", seedKey: a.seedKey || a.id };
      R.tl = null; return R;
    };
    R.addProp = function (p) { noRemote(p, "prop"); R.propsDef[p.id] = p; R.tl = null; return R; };
    R.load = function (seq) {
      noRemote(seq, "sequence");
      R.seq = seq;
      if (seq.width && seq.width !== R.W) { R.W = seq.width; canvas.width = seq.width; }
      if (seq.height && seq.height !== R.H) { R.H = seq.height; canvas.height = seq.height; }
      if (seq.seed != null && R.seed == null) { R.seed = seq.seed | 0; R.errors = R.errors.filter(function (e) { return !/^unseeded/.test(e); }); }
      if (seq.look) R.look = merge(R.look, seq.look);
      (seq.actors || []).forEach(function (a) {
        var canon = a.canon;
        if (typeof canon === "string" && seq.canons) canon = seq.canons[canon];
        R.addActor(Object.assign({}, a, { canon: canon }));
      });
      (seq.props || []).forEach(function (p) { R.addProp(p); });
      R.tl = null; R.bg = {};
      return R;
    };
    function actionsFor(extra) {
      var list = ((R.seq && R.seq.actions) || []).concat(extra || []);
      return list;
    }
    function timelineFor(extra) {
      var acts = actionsFor(extra), key = JSON.stringify([acts, R.seq && R.seq.depthBias, Object.keys(R.actors).map(function (k) { var a = R.actors[k]; return [k, a.position, a.scale, a.yaw, a.emotion]; }), Object.keys(R.propsDef).map(function (k) { return R.propsDef[k]; })]);
      if (R.tl && R.tlKey === key) return R.tl;
      var actors = {};
      Object.keys(R.actors).forEach(function (id) { var a = R.actors[id]; actors[id] = { x: a.position.x, y: a.position.y, scale: a.scale, yaw: a.yaw, emotion: a.emotion }; });
      var props = {};
      Object.keys(R.propsDef).forEach(function (id) { props[id] = R.propsDef[id]; });
      R.tl = G.createTimeline({ width: R.W, height: R.H, seed: R.seed | 0, actors: actors, props: props, actions: acts });
      R.tlKey = key;
      return R.tl;
    }
    R.timeline = timelineFor;
    R.shotAt = function (t) {
      var shots = (R.seq && R.seq.shots) || [];
      if (!shots.length) return null;
      var s = shots[0];
      for (var i = 0; i < shots.length; i++) if (t >= shots[i].from) s = shots[i];
      return s;
    };
    function cameraAt(shot, t, override) {
      var keys = (override && override.keys) || (shot && shot.camera && shot.camera.keys) || (shot && shot.camera) || null;
      if (override && !override.keys && override.x != null) return { x: override.x, y: override.y != null ? override.y : 0.5, z: override.zoom || 1 };
      if (!Array.isArray(keys) || !keys.length) return { x: 0.5, y: 0.5, z: 1 };
      if (t <= keys[0].t) return { x: keys[0].x, y: keys[0].y, z: keys[0].zoom || 1 };
      for (var i = 1; i < keys.length; i++) {
        if (t <= keys[i].t) { var a = keys[i - 1], b = keys[i], w = G.ease(b.ease || "inOutS", (t - a.t) / Math.max(1e-6, b.t - a.t)); return { x: G.lerp(a.x, b.x, w), y: G.lerp(a.y, b.y, w), z: G.lerp(a.zoom || 1, b.zoom || 1, w) }; }
      }
      var l = keys[keys.length - 1];
      return { x: l.x, y: l.y, z: l.zoom || 1 };
    }
    function setOf(shot) {
      if (!shot || !shot.set) return null;
      return typeof shot.set === "string" ? ((R.seq && R.seq.sets && R.seq.sets[shot.set]) || null) : shot.set;
    }
    function bgFor(shot) {
      var set = setOf(shot);
      if (!set) return null;
      var key = typeof shot.set === "string" ? shot.set : (shot.id || "shot");
      if (!R.bg[key]) R.bg[key] = buildSetLayers(set, R.W, R.H, R.seed | 0, R.look);
      return R.bg[key];
    }
    function sampleRig(a, pose, env) { return C.rig(a, pose, env); }

    // the draw list for time t: every item with its sort key (painter's order, near is last)
    R.drawList = function (t, o) {
      o = o || {};
      var tl = timelineFor(o.actions), shot = o.shot || R.shotAt(t), visible = o.actors || (shot && shot.actors) || Object.keys(R.actors);
      var hz = R.look.boil.hz || 12, frame = B.drawingAt(t, hz);
      var k = Math.max(0.6, R.H / 1080) * (1);
      var list = [], rigs = {};
      visible.forEach(function (id) {
        var a = R.actors[id];
        if (!a) return;
        var pose = o.pose && o.pose[id] ? o.pose[id] : tl.pose(id, t);
        var env = { look: R.look, k: k, frame: frame, seed: R.seed | 0, seedKey: a.seedKey };
        var rg = sampleRig(a, pose, env);
        rigs[id] = { rig: rg, pose: pose, env: env };
        var z = pose.root.y;
        var bias = [];
        ((R.seq && R.seq.depthBias) || []).forEach(function (b) { if (b.actor === id && t >= (b.from || -1e9) && t < (b.to || 1e9)) bias.push(b); });
        list.push({ z: z - 1, kind: "shadow", actor: id, pose: pose, rig: rg, env: env });
        rg.items.forEach(function (it) {
          if (o.only && o.only.indexOf(it.name) < 0) return;
          var bz = 0; bias.forEach(function (b) { if (new RegExp(b.part || ".*").test(it.name)) bz += b.bias || 0; });
          list.push({ z: z + (it.depth || 0) * 0.01 + bz, kind: "item", item: it, env: env, actor: id });
        });
        list.push({ z: z + 0.09, kind: "marks", actor: id, pose: pose, rig: rg, env: env });
      });
      // props
      Object.keys(R.propsDef).forEach(function (pid) {
        var d = R.propsDef[pid];
        if (d.shots && shot && d.shots.indexOf(shot.id) < 0) return;
        var st = tl.propAt(pid, t);
        if (!st) return;
        var held = null, hz2 = null;
        Object.keys(rigs).forEach(function (aid) { var h = rigs[aid].pose.hold; if (h && h.prop === pid && h.w > 0) { held = { aid: aid, h: h }; } });
        var zk = tl.propZ(pid, t), z = st.y + (d.zBias || 0), pos = { x: st.x, y: st.y };
        if (held) {
          var rr = rigs[held.aid], hand = rr.rig.hands[held.h.hand === "both" ? "R" : held.h.hand] || rr.rig.hands.R, hand2 = held.h.hand === "both" ? rr.rig.hands.L : null;
          var hx = hand2 ? (hand.x + hand2.x) / 2 : hand.x, hy = hand2 ? (hand.y + hand2.y) / 2 : hand.y - rr.pose.u * 0.5;
          var ww = held.h.w; pos = { x: G.lerp(st.x, hx, ww), y: G.lerp(st.y, hy - rr.pose.u * (d.size || 40) / 40 * 0.55, ww) };
          var az = rr.pose.root.y;
          z = held.h.front === true ? az + 0.5 : held.h.front === false ? az - 0.5 : az + 0.005;
        } else if (zk) {
          if (zk.rel && rigs[zk.rel]) z = rigs[zk.rel].pose.root.y + (zk.where === "behind" ? -0.5 : 0.5);
          else if (zk.rel && R.actors[zk.rel]) z = tl.rootAt(zk.rel, t)[1] + (zk.where === "behind" ? -0.5 : 0.5);
          else if (zk.z != null) z = zk.z;
        }
        var p2 = Object.assign({}, d, { x: pos.x, y: pos.y, rot: st.rot, sx: st.sx, sy: st.sy });
        list.push({ z: z, kind: "prop", prop: p2, env: { seed: B.mix(R.seed | 0, B.hashStr("prop:" + pid)), frame: frame, amp: 1.4 * R.look.boil.amp }, id: pid });
        list.push({ z: z - 0.4, kind: "pshadow", prop: p2, id: pid });
      });
      // set elements that stand in front of or among the actors
      ((setOf(shot) && setOf(shot).elements) || []).forEach(function (e, i) {
        if (e.layer !== "front" && e.layer !== "stage") return;
        list.push({ z: (e.layer === "front" ? 4000 : e.y * R.H) + (e.zBias || 0), kind: "element", el: e, seed: R.seed | 0, id: "el" + i });
      });
      list.sort(function (a, b) { return a.z - b.z || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0); });
      return { list: list, rigs: rigs, frame: frame, shot: shot, k: k };
    };

    // ---- renderAt: paint the frame at t. Pure: the same (t, seed, look, actions) paints the same pixels.
    R.renderAt = function (t, o) {
      o = o || {};
      if (!isFinite(t)) throw new Error("renderAt needs a finite time in seconds");
      var ctx = o.ctx || R.ctx, W = R.W, H = R.H, look = R.look;
      var shot = o.shot || R.shotAt(t), cam = cameraAt(shot, t, o.camera), dl = R.drawList(t, o);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      // paper
      if (look.layers.paper !== false) ctx.drawImage(B.paper(W, H, { seed: B.mix(R.seed | 0, 4242), tint: look.paper.tint, grain: look.paper.grain, fibres: look.paper.fibres }), 0, 0);
      else { ctx.fillStyle = look.paper.tint; ctx.fillRect(0, 0, W, H); }
      // the backdrop in parallax layers (stable seeds: it does not boil)
      var bg = bgFor(shot);
      if (bg) ["far", "mid", "near"].forEach(function (layer) {
        var f = PARALLAX[layer], ccx = cam.x * f + 0.5 * (1 - f), ccy = cam.y * f + 0.5 * (1 - f), zl = 1 + (cam.z - 1) * f;
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(zl, zl); ctx.translate(-ccx * W, -ccy * H); ctx.drawImage(bg[layer], -W * SET_MARGIN, -H * SET_MARGIN); ctx.restore();
      });
      // the world: actors, props and the foreground, under the shot's camera (smooth: not on twos)
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x * W, -cam.y * H);
      var order = [];
      dl.list.forEach(function (d) {
        if (d.kind === "shadow") shadow(ctx, d);
        else if (d.kind === "item") { C.paintItem(ctx, d.item, d.env); if (d.item.name === "head") order.push(d.actor); }
        else if (d.kind === "marks") C.marks(ctx, d.rig, d.pose, d.env);
        else if (d.kind === "prop") { var pd = PROP_DRAW[d.prop.kind] || PROP_DRAW.ball; pd(ctx, d.prop, d.env); }
        else if (d.kind === "pshadow") pshadow(ctx, d.prop, R);
        else if (d.kind === "element") drawElement(ctx, d.el, W, H, B.mix(d.seed, 777), merge(look, { set: (setOf(shot) && setOf(shot).palette) || {} }));
        if (look.layers.glow !== false && d.kind === "prop" && d.prop.glow) { /* glow handled below */ }
      });
      ctx.restore();
      R.lastOrder = dl.list.filter(function (d) { return d.kind === "item" && /^(body|head)$/.test(d.item.name); }).map(function (d) { return d.actor + ":" + d.item.name; });
      R.lastRig = dl.rigs;
      // additive light, the colour grade of the film's look, grain and vignette: screen-space finish
      if (look.layers.glow !== false && shot && shot.lights) {
        var gl = shot.lights.map(function (l) { return { x: (l.x - cam.x) * W * cam.z + W / 2, y: (l.y - cam.y) * H * cam.z + H / 2, r: l.r * H * cam.z, color: l.color, alpha: l.alpha }; });
        B.glow(ctx, gl, look.glow.strength);
      }
      if (look.grade && look.grade.tint && look.grade.strength > 0) { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = B.rgba(look.grade.tint, look.grade.strength); ctx.fillRect(0, 0, W, H); ctx.restore(); }
      if (look.layers.grain !== false) { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = Math.min(1, 0.3 + look.paper.grain * 0.45); ctx.drawImage(B.grainTex(W, H, { seed: B.mix(R.seed | 0, 99) }), 0, 0); ctx.restore(); }
      if (look.vignette > 0) { ctx.save(); var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95); vg.addColorStop(0, "rgba(40,20,10,0)"); vg.addColorStop(1, "rgba(40,20,10," + look.vignette + ")"); ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      ctx.restore();
      return dl;
    };
    function shadow(ctx, d) {
      var u = d.pose.u, lift = Math.max(0, d.pose.lift), sc = 1 / (1 + lift * 0.12), fx = (d.pose.feet.L.x + d.pose.feet.R.x) / 2, fy = d.pose.root.y + 0.1 * u;
      var pts = B.ellipse(fx + d.pose.dx * u * 0.4, fy, 6.2 * u * sc, 1.35 * u * sc, 0, 28);
      ctx.save(); ctx.globalCompositeOperation = "multiply"; B.pathSmooth(ctx, B.boil(pts, B.mix(B.hashStr(d.actor + ":shadow"), d.env.seed), d.env.frame, u * 0.07 * R.look.boil.amp, true), true); ctx.fillStyle = B.rgba([70, 90, 60], 0.33 * sc); ctx.fill(); ctx.restore();
    }
    function pshadow(ctx, p, Rr) {
      var gy = p.groundY != null ? p.groundY * Rr.H : null; if (gy == null) return;
      var h = Math.max(0, gy - p.y), sc = 1 / (1 + h / 160), w = p.size * 0.62 * sc;
      ctx.save(); ctx.globalCompositeOperation = "multiply"; B.pathSmooth(ctx, B.ellipse(p.x, gy + 4, w, w * 0.2, 0, 20), true); ctx.fillStyle = B.rgba([70, 90, 60], 0.3 * sc); ctx.fill(); ctx.restore();
    }

    // ---- inspection (the gate's and the tests' eyes)
    R.hash = function (stride) {
      var d = R.ctx.getImageData(0, 0, R.W, R.H).data, h = 2166136261 >>> 0, s = (stride || 1) * 4;
      for (var i = 0; i < d.length; i += s) { h = Math.imul(h ^ d[i], 16777619) >>> 0; h = Math.imul(h ^ d[i + 1], 16777619) >>> 0; h = Math.imul(h ^ d[i + 2], 16777619) >>> 0; }
      return h >>> 0;
    };
    R.stats = function (rect) {
      var r = rect || { x: 0, y: 0, w: R.W, h: R.H }, d = R.ctx.getImageData(r.x, r.y, r.w, r.h).data, sum = 0, sum2 = 0, n = 0;
      for (var i = 0; i < d.length; i += 16) { var l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; sum2 += l * l; n++; }
      var mean = sum / n;
      return { mean: mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
    };
    R.debug = {
      pose: function (id, t) { return timelineFor().pose(id, t); },
      feet: function (id, t) { var tl = timelineFor(), p = tl.pose(id, t); return { L: p.feet.L, R: p.feet.R }; },
      schedule: function (id) { return timelineFor().feetSchedule(id); },
      // the boil offsets for one part at time t: unique per actor and per part, a pure function of the drawing number
      jitter: function (id, part, t, n) {
        var a = R.actors[id], seed = B.mix(B.hashStr((a ? a.seedKey : id) + ":" + part), R.seed | 0), f = B.drawingAt(t, R.look.boil.hz || 12), w = B.wobble(seed, f, n || 8, 1, true);
        return Array.prototype.slice.call(w);
      },
      drawing: function (t) { return B.drawingAt(t, R.look.boil.hz || 12); },
      bounds: function (id, t) {
        var tl = timelineFor(), pose = tl.pose(id, t), a = R.actors[id], k = Math.max(0.6, R.H / 1080);
        var rg = C.rig(a, pose, { look: R.look, k: k, frame: 0, seed: R.seed | 0, seedKey: a.seedKey });
        var sh = R.shotAt(t), cam = cameraAt(sh, t), b = rg.bounds;
        var tx = function (x) { return (x - cam.x * R.W) * cam.z + R.W / 2; }, ty = function (y) { return (y - cam.y * R.H) * cam.z + R.H / 2; };
        return { x0: tx(b.x0), y0: ty(b.y0), x1: tx(b.x1), y1: ty(b.y1), view: rg.view, head: [tx(rg.head[0]), ty(rg.head[1])], hands: rg.hands };
      },
      order: function (t, o) { R.renderAt(t, o); return R.lastOrder.slice(); },
      parts: function (id, t) { var tl = timelineFor(), pose = tl.pose(id, t), a = R.actors[id]; return C.rig(a, pose, { look: R.look, k: 1, frame: 0, seed: R.seed | 0, seedKey: a.seedKey }).items.map(function (i) { return i.name; }); },
      extremes: function () { return timelineFor().extremes(); },
      // where each foot is drawn (the unboiled centroid of its painted shape): a planted foot must not move
      footCentroids: function (id, t) {
        var tl = timelineFor(), pose = tl.pose(id, t), a = R.actors[id];
        var rg = C.rig(a, pose, { look: R.look, k: 1, frame: 0, seed: R.seed | 0, seedKey: a.seedKey }), out = {};
        rg.items.forEach(function (it) { var m = /^foot([LR])$/.exec(it.name); if (m) { var sx = 0, sy = 0; it.pts.forEach(function (p) { sx += p[0]; sy += p[1]; }); out[m[1]] = [sx / it.pts.length, sy / it.pts.length]; } });
        out.planted = { L: pose.feet.L.planted, R: pose.feet.R.planted };
        return out;
      },
      problems: function () { var p = R.errors.slice(); try { p = p.concat(timelineFor().problems); } catch (e) { p.push(String(e.message || e)); } return p; },
    };
    return R;
  }

  // ------------------------------------------------------------------ a single pose (the model sheet and the emotion contact sheet)
  function drawPose(ctx, rend, actorId, poseObj, o) {
    var a = rend.actors[actorId], k = Math.max(0.6, rend.H / 1080);
    var env = { look: rend.look, k: (o && o.k) || k, frame: (o && o.frame) || 0, seed: rend.seed | 0, seedKey: a.seedKey };
    var rg = C.rig(a, poseObj, env), items = rg.items.slice().sort(function (p, q) { return (p.depth || 0) - (q.depth || 0); });
    items.forEach(function (it) { C.paintItem(ctx, it, env); });
    C.marks(ctx, rg, poseObj, env);
    return rg;
  }

  // ------------------------------------------------------------------ sheets: the model sheet, the emotion contact sheets, strips at action extremes
  var FONT = "600 22px ui-sans-serif, -apple-system, Helvetica, Arial, sans-serif";
  function label(ctx, text, x, y, size, color, align) {
    ctx.save(); ctx.font = "600 " + (size || 22) + "px ui-sans-serif, -apple-system, Helvetica, Arial, sans-serif"; ctx.fillStyle = color || "#3a3028"; ctx.textAlign = align || "center"; ctx.fillText(text, x, y); ctx.restore();
  }
  function sheetBase(ctx, rend, W, H) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(B.paper(W, H, { seed: B.mix(rend.seed | 0, 4242), tint: rend.look.paper.tint, grain: rend.look.paper.grain, fibres: rend.look.paper.fibres }), 0, 0); ctx.restore(); }
  var sheets = {
    // five illustrated views (calm) over a row of every fixed trait and palette swatch
    views: function (ctx, rend, id, o) {
      var W = rend.W, H = rend.H, a = rend.actors[id], canon = a.canon || {}, u = (o && o.u) || 21;
      sheetBase(ctx, rend, W, H);
      label(ctx, (canon.display_name || id) + ": model sheet (rendered by the runtime that animates it)", 70, 64, 34, "#3a3028", "left");
      label(ctx, "five views: front, 3/4, side, rear 3/4, back. One rig, one palette, one set of fixed traits.", 70, 100, 21, "#6b5d52", "left");
      var xs = [0.1, 0.3, 0.5, 0.7, 0.9], names = C.VIEWS;
      [0, 45, 90, 135, 180].forEach(function (yaw, i) {
        var pose = C.restPose(id, { u: u, x: W * xs[i] - (yaw === 90 ? 20 : 0), y: H * 0.72, yaw: yaw, emotion: (o && o.emotion) || "calm" });
        drawPose(ctx, rend, id, pose, { frame: 2 });
        label(ctx, names[i].toUpperCase(), W * xs[i], H * 0.72 + 56, 24, "#3a3028");
      });
      // palette and traits
      var pal = canon.palette || {}, x = 70, y = H * 0.72 + 120;
      Object.keys(pal).forEach(function (k) { ctx.fillStyle = pal[k]; ctx.fillRect(x, y, 70, 40); ctx.strokeStyle = "#3a3028"; ctx.lineWidth = 2; ctx.strokeRect(x, y, 70, 40); label(ctx, k + " " + pal[k], x + 35, y + 64, 16, "#3a3028"); x += 160; });
      label(ctx, "fixed traits: " + ((canon.fixed_traits || []).join("; ")), W - 70, y + 24, 21, "#3a3028", "right");
      label(ctx, "source: " + (canon.source || "?") + "  |  expression preset: " + (canon.expression_preset || "?") + "  |  " + C.EMOTION_NAMES.length + " emotions", W - 70, y + 58, 19, "#6b5d52", "right");
    },
    // the 31 named emotions as head close-ups, 16 to a page, labelled
    emotions: function (ctx, rend, id, o) {
      var W = rend.W, H = rend.H, page = (o && o.page) || 0, names = C.EMOTION_NAMES.slice(page * 16, page * 16 + 16), cols = 4, cw = W / cols, ch = (H - 70) / 4, u = (o && o.u) || 15;
      sheetBase(ctx, rend, W, H);
      label(ctx, "emotions " + (page * 16 + 1) + "-" + (page * 16 + names.length) + " of " + C.EMOTION_NAMES.length + " (named presets: eyes, brows, mouth, blush, head and torso, reaction marks)", 40, 44, 26, "#3a3028", "left");
      names.forEach(function (n, i) {
        var cx = (i % cols) * cw, cy = 70 + Math.floor(i / cols) * ch;
        ctx.save(); ctx.beginPath(); ctx.rect(cx + 6, cy + 4, cw - 12, ch - 8); ctx.clip();
        ctx.fillStyle = "rgba(255,250,240,0.35)"; ctx.fillRect(cx + 6, cy + 4, cw - 12, ch - 8);
        var pose = C.restPose(id, { u: u, x: cx + cw / 2 - 10, y: cy + 130 + 11.5 * u, yaw: 0, emotion: n });
        pose.hTilt *= 1; drawPose(ctx, rend, id, pose, { frame: 1 });
        ctx.restore();
        label(ctx, (page * 16 + i + 1) + ". " + n, cx + cw / 2, cy + ch - 12, 24, "#3a3028");
      });
    },
    // a turn: the authored views in order, on one strip, both ways round
    turn: function (ctx, rend, id, o) {
      var W = rend.W, H = rend.H, u = 14;
      sheetBase(ctx, rend, W, H);
      label(ctx, "turn: front, 3/4, side, rear 3/4, back, rear 3/4 (other way), side, 3/4, front: authored view steps", 40, 44, 24, "#3a3028", "left");
      var yaws = [0, 45, 90, 135, 180, -135, -90, -45, 0];
      yaws.forEach(function (yaw, i) {
        var x = (i + 0.5) * (W / yaws.length);
        drawPose(ctx, rend, id, C.restPose(id, { u: u, x: x, y: H * 0.62, yaw: yaw }), { frame: 2 });
        label(ctx, String(yaw) + "\u00b0", x, H * 0.62 + 44, 20, "#6b5d52");
      });
    },
  };
  // a contact sheet of the film itself at chosen times (action extremes), each cell a full renderAt scaled down
  function contactSheet(rend, times, o) {
    o = o || {};
    var cols = o.cols || 4, rows = Math.ceil(times.length / cols), cw = o.cellW || 480, ch = Math.round(cw * rend.H / rend.W), pad = 6, top = 40;
    var sheet = o.canvas || root.document.createElement("canvas");
    sheet.width = cols * cw + pad * 2; sheet.height = rows * (ch + 30) + top + pad;
    var x = sheet.getContext("2d");
    x.fillStyle = "#1a1612"; x.fillRect(0, 0, sheet.width, sheet.height);
    label(x, o.title || "action extremes", 12, 28, 22, "#f3ead8", "left");
    var tmp = root.document.createElement("canvas"), r2 = createRenderer(tmp, { width: rend.W, height: rend.H, seed: rend.seed, look: rend.look });
    r2.actors = rend.actors; r2.propsDef = rend.propsDef; r2.seq = rend.seq;
    times.forEach(function (tt, i) {
      var t = typeof tt === "number" ? tt : tt.t, ccol = i % cols, crow = Math.floor(i / cols), ox = pad + ccol * cw, oy = top + crow * (ch + 30);
      r2.renderAt(t);
      x.drawImage(tmp, ox + 2, oy, cw - 4, ch - 4 * (ch / cw));
      label(x, (typeof tt === "number" ? "" : (tt.label || "") + "  ") + "t=" + t.toFixed(2) + "s", ox + cw / 2, oy + ch + 20, 17, "#f3ead8");
    });
    return sheet;
  }

  // ------------------------------------------------------------------ the HyperFrames form
  var registry = (root.__rasan2d = root.__rasan2d || { stages: {}, errors: [], version: VERSION });
  var G2 = root.window || root;
  function stage(o) {
    if (!o || !o.timeline) throw new Error("Rasan2D.stage needs the scene's paused GSAP timeline as its clock");
    var canvas = typeof o.canvas === "string" ? root.document.querySelector(o.canvas) : o.canvas;
    if (!canvas) throw new Error("Rasan2D.stage: canvas not found");
    var seq = o.sequence || {};
    var rend = createRenderer(canvas, { width: o.width || seq.width || 1920, height: o.height || seq.height || 1080, seed: o.seed != null ? o.seed : seq.seed, look: merge(seq.look || {}, o.look || {}) });
    var S = { id: o.id, canvas: canvas, ctx2d: rend.ctx, renderer: rend, tl: o.timeline, duration: o.duration || (seq.duration || o.timeline.duration()), fps: o.fps || seq.fps || 30, ready: true, error: null, declared: o.declare || {}, drawn: 0 };
    try {
      rend.load(Object.assign({}, seq, { actors: o.actors || seq.actors, props: o.props || seq.props, actions: o.actions || seq.actions, shots: o.shots || seq.shots, canons: o.canons || seq.canons }));
      rend.timeline();
    } catch (e) { S.error = String(e.message || e); S.ready = false; registry.errors.push(S.error); }
    S.draw = function (t, force) { if (!S.ready) return; var tt = Math.max(0, Math.min(S.duration, t)); S.drawn++; rend.renderAt(tt); S.lastT = tt; };
    S.readyPromise = Promise.resolve(S);
    S.manifest = function () {
      var probs = rend.debug.problems();
      return { id: S.id, duration: S.duration, fps: S.fps, seed: rend.seed, seeded: rend.seed != null, boilHz: rend.look.boil.hz, problems: probs, declared: S.declared, actors: Object.keys(rend.actors).map(function (id) { var a = rend.actors[id]; return { id: id, canon: a.canon }; }), shots: (rend.seq && rend.seq.shots || []).map(function (s) { return { id: s.id, from: s.from, to: s.to, actors: s.actors || null }; }) };
    };
    var clock = { t: 0 };
    o.timeline.to(clock, { t: S.duration, duration: S.duration, ease: "none", onUpdate: function () { S.draw(this.time()); } }, 0);
    root.addEventListener && root.addEventListener("hf-seek", function () { S.draw(o.timeline.time(), true); });
    registry.stages[S.id] = S;
    S.draw(o.timeline.time ? o.timeline.time() : 0, true);
    return S;
  }

  var current = null;
  var Rasan2D = {
    VERSION: VERSION, version: VERSION, kit: K, LOOK: LOOK,
    createRenderer: createRenderer, mount: function (canvas, opts) { current = createRenderer(typeof canvas === "string" ? root.document.querySelector(canvas) : canvas, opts); return current; },
    addActor: function (a) { if (!current) throw new Error("Rasan2D.mount first"); return current.addActor(a); },
    addProp: function (p) { if (!current) throw new Error("Rasan2D.mount first"); return current.addProp(p); },
    load: function (s) { if (!current) throw new Error("Rasan2D.mount first"); return current.load(s); },
    renderAt: function (t, o) { if (!current) throw new Error("Rasan2D.mount first"); return current.renderAt(t, o); },
    stage: stage, drawPose: drawPose, sheets: sheets, contactSheet: contactSheet, restPose: C.restPose, emotions: C.EMOTION_NAMES.slice(), views: C.VIEWS.slice(), actionKinds: G.KINDS.slice(), PROP_DRAW: PROP_DRAW,
    rng: B.rng, hash01: B.hash01, hashStr: B.hashStr,
  };
  Object.defineProperty(Rasan2D, "current", { get: function () { return current; } });
  root.Rasan2D = Rasan2D;
  if (typeof module !== "undefined" && module.exports) module.exports = Rasan2D;
})(typeof window !== "undefined" ? window : globalThis);
