/*
 * RasanCharacter3D: a recurring 3D actor on the existing Rasan3D stage (wave W6). A thin, seek-safe adapter, not a second
 * Three.js app: it builds the actor from its identity.json (the ONE canon: score.cast[].canon -> RUN/cast/<id>/identity.json) into
 * the scene Rasan3D.stage already owns, and poses it as a pure function of the scene's time.
 *
 *   const rig = RasanCharacter3D.loadCharacter(identity, k);         // in build(k): group, joints, hand points, nothing else
 *   k.scene.add(rig.group);
 *   rig.poseAt(t, { start: { x: -1, z: 0, yaw: 0 }, actions: [ { kind: "walk", at: 1, duration: 1.6, to: [1, 0] }, ... ] });  // in pose(t, k)
 *   rig.attach(propMesh, "hand_r");                                    // a prop rides the stable hand point
 *   RasanCharacter3D.validateCanon(rig, identity)                      // structural on-model check from the LIVE objects
 *   await RasanCharacter3D.canonViews(rig)                             // standardized front + quarter renders (RGBA) for the visual check
 *   await RasanCharacter3D.renderModelSheet(identity | rig)            // the model sheet: four views + five actions, one PNG
 *
 * Seek-safe by construction: poseAt(t, spec) is a pure function of t and the spec (compile() resolves root motion from the spec alone,
 * evaluate() reads nothing else); it overwrites every joint on every call, so A-B-A seeks and a cold renderer give the same pixels.
 * No wall clock, no Math.random (a seeded integer hash drives the blinks), no frame history, no AnimationMixer (the code-built actor
 * has no clips; time-driven transforms on named joints are the seekable track API's own idea). The vendored runtime shares ONE
 * WebGLRenderer: the canon views use a second Rasan3D STAGE (same renderer), never a second renderer.
 *
 * Sides: L and R are SCREEN sides when the actor faces the camera (yaw 0): L is -x, R is +x. The actor faces +z at yaw 0.
 * Units: identity.proportions are in the actor's own units; one unit is 0.05 world units (the fixture stands 1 world unit tall).
 *
 * Needs from upstream (Sibhimanyu/rasan-3d, NOT merged): a rigged GLB actor with skeleton clips (rig.kind "glb"). This adapter
 * validates such an identity but loadCharacter() refuses to build it, with that reason; it never pretends the actions work.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.RasanCharacter3D = api;
})(this, function () {
  "use strict";

  var VERSION = "1.0.0";
  var UNIT = 0.05; // world units per identity unit: the fixture is 1 unit tall
  var BUILDERS = { "rasan-critter": { version: 1, label: "round clay critter: egg body, big head, round ears, leaf sprout, scarf, mittens" } };
  var KINDS = ["idle", "look", "point", "hop", "react", "walk", "turn", "carry", "hold"];
  var REQUIRED_ACTIONS = ["look", "point", "hop", "react", "walk"];

  // ------------------------------------------------------------------ fixed traits -> the parts that draw them
  var FEATURES = [
    { re: /round\s+ears?/i, parts: ["earL", "earR"] },
    { re: /(?:leaf\s+)?sprout|(?:single\s+)?(?:curved\s+)?tuft/i, parts: ["sproutStem", "sproutLeaf"] },
    { re: /scarf/i, parts: ["scarf"] },
    { re: /short\s+legs?/i, parts: ["legL", "legR"] },
    { re: /belly\s+patch/i, parts: ["belly"] },
    { re: /mittens?/i, parts: ["handL", "handR"] },
    { re: /(?:big|round|glossy)[\w\s]*eyes?/i, parts: ["eyeL", "eyeR"] },
    { re: /blush|cheeks?/i, parts: ["cheekL", "cheekR"] },
  ];
  function traitFeatures(traits) {
    var features = [], unknown = [];
    (traits || []).forEach(function (t) {
      var hit = FEATURES.filter(function (f) { return f.re.test(String(t)); });
      if (hit.length) features.push({ trait: String(t), parts: hit[0].parts.slice() }); else unknown.push(String(t));
    });
    return { features: features, unknown: unknown };
  }

  // which palette key colours which parts (the structural palette check reads the live materials)
  var PALETTE_PARTS = {
    body: ["body", "head", "armL", "armR", "earL", "earR", "legL", "legR", "footL", "footR"],
    accent: ["belly", "handL", "handR", "scarfStripe0", "scarfStripe1"],
    scarf: ["scarf", "scarfTail"],
    leaf: ["sproutLeaf", "sproutStem"],
    eye: ["eyeL", "eyeR", "mouth"],
    cheek: ["cheekL", "cheekR", "earInL", "earInR"],
  };
  // identity.proportions key -> how it is read back from the built parts (size from geometry x world scale, so a pose never changes it)
  var MEASURES = {
    body_w: { part: "body", axis: "x" }, body_h: { part: "body", axis: "y" }, head_w: { part: "head", axis: "x" }, head_h: { part: "head", axis: "y" },
    ear_r: { part: "earL", axis: "x", div: 2 }, leg_len: { part: "legL", axis: "y" }, arm_len: { part: "armL", axis: "y" }, sprout_h: { part: "sproutStem", axis: "y" },
    eye_sep: { between: ["eyeL", "eyeR"] },
  };
  var TOL = { ratio: 0.04, colour: 10 / 255 };

  // ------------------------------------------------------------------ pure helpers
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function smoother(x) { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); }
  function hash(i, seed) { var h = Math.imul((i | 0) ^ Math.imul((seed | 0), 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function lerp3(a, b, w) { return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]; }
  function shortest(a, b) { var d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; }
  function deg(x) { return (x * Math.PI) / 180; }
  function canonicalJSON(v) {
    if (Array.isArray(v)) return "[" + v.map(canonicalJSON).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canonicalJSON(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }
  function digest(v) { // FNV-1a over the canonical JSON: the same in the page and in Node (canon3d.mjs recomputes it)
    var s = canonicalJSON(v), h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  // ------------------------------------------------------------------ dimensions from the identity
  var DEF_PROPS = { body_w: 10, body_h: 8.4, head_w: 11.4, head_h: 9.4, eye_sep: 4, leg_len: 2.4, arm_len: 4.6, ear_r: 2.3, sprout_h: 3.4 };
  function dimsOf(identity) {
    var p = {}, src = (identity && identity.proportions) || {};
    Object.keys(DEF_PROPS).forEach(function (k) { p[k] = typeof src[k] === "number" && src[k] > 0 ? src[k] : DEF_PROPS[k]; });
    var u = UNIT, d = { u: u, p: p };
    d.legLen = p.leg_len * u; d.bodyW = p.body_w * u; d.bodyH = p.body_h * u; d.headW = p.head_w * u; d.headH = p.head_h * u;
    d.bodyCY = d.legLen + d.bodyH / 2 - 0.55 * u;
    d.bodyTop = d.bodyCY + d.bodyH / 2;
    d.neckY = d.bodyTop - 0.9 * u;
    d.headCY = d.neckY + d.headH / 2 - 1.5 * u;       // head centre in world-at-rest; headJ pivots at the neck
    d.headTop = d.headCY + d.headH / 2;
    d.shoulderY = d.bodyCY + d.bodyH * 0.2;
    d.shoulderX = d.bodyW * 0.47;
    d.height = d.headTop + p.sprout_h * u * 0.85;
    d.hipY = d.legLen * 0.62;
    return d;
  }

  // ------------------------------------------------------------------ actions: compile (root motion from the spec alone), evaluate (pure of t)
  var EMOTIONS = {
    surprised: { eye: 0.38, sy: 0.07, pitch: 0.16, ear: -0.55, sprout: -0.1, arm: 0.55, lift: 0.04, mouth: 0.55, cheek: 0.0, squint: 0, roll: 0 },
    joyful: { eye: -0.05, sy: 0.04, pitch: 0.22, ear: -0.25, sprout: 0.2, arm: 0.9, lift: 0.07, mouth: 0.5, cheek: 0.35, squint: 0.7, roll: 0.05 },
    worried: { eye: 0.12, sy: -0.04, pitch: -0.1, ear: 0.7, sprout: 0.35, arm: 0.0, lift: 0, mouth: -0.2, cheek: -0.2, squint: 0, roll: 0.22 },
    proud: { eye: 0.0, sy: 0.05, pitch: 0.3, ear: -0.15, sprout: 0.0, arm: 0.35, lift: 0, mouth: 0.25, cheek: 0.2, squint: 0.35, roll: -0.06 },
    sad: { eye: -0.1, sy: -0.06, pitch: -0.28, ear: 0.85, sprout: 0.5, arm: 0.0, lift: 0, mouth: -0.3, cheek: -0.25, squint: 0.2, roll: 0.1 },
    curious: { eye: 0.16, sy: 0.02, pitch: 0.1, ear: -0.3, sprout: 0.25, arm: 0.0, lift: 0, mouth: 0.1, cheek: 0, squint: 0, roll: -0.28 },
  };
  var REST_ARM = { L: [-0.26, -1, 0.05], R: [0.26, -1, 0.05] };

  function validateActions(spec) {
    var errs = [];
    if (!spec || typeof spec !== "object") return ["the action spec is not an object ({ start, actions: [...] })"];
    var acts = Array.isArray(spec.actions) ? spec.actions : [];
    acts.forEach(function (a, i) {
      if (!a || typeof a !== "object") { errs.push("actions[" + i + "] is not an object"); return; }
      if (KINDS.indexOf(a.kind) < 0) errs.push("actions[" + i + "]: unknown kind " + JSON.stringify(a.kind) + " (have " + KINDS.join(", ") + ")");
      if (a.kind !== "idle" && !(typeof a.at === "number" && a.at >= 0)) errs.push("actions[" + i + "] (" + a.kind + "): at must be a number of seconds, 0 or more");
      if (a.kind !== "idle" && !(typeof a.duration === "number" && a.duration > 0)) errs.push("actions[" + i + "] (" + a.kind + "): duration must be a positive number of seconds");
      if ((a.kind === "look" || a.kind === "point") && !(Array.isArray(a.target) && a.target.length === 3) && !(a.kind === "look" && typeof a.yaw === "number")) errs.push("actions[" + i + "] (" + a.kind + "): target must be a world point [x, y, z]" + (a.kind === "look" ? " (or yaw in degrees)" : ""));
      if (a.kind === "react" && !EMOTIONS[a.emotion]) errs.push("actions[" + i + "] (react): emotion must be one of " + Object.keys(EMOTIONS).join(", "));
      if (a.kind === "walk" && !(Array.isArray(a.to) && a.to.length === 2) && !(Array.isArray(a.by) && a.by.length === 2)) errs.push("actions[" + i + "] (walk): to [x, z] or by [dx, dz] required");
      if (a.kind === "turn" && typeof a.to !== "number" && typeof a.by !== "number") errs.push("actions[" + i + "] (turn): to or by (degrees) required");
    });
    var roots = acts.filter(function (a) { return a && (a.kind === "walk" || a.kind === "turn") && typeof a.at === "number" && typeof a.duration === "number"; }).sort(function (a, b) { return a.at - b.at; });
    for (var i = 1; i < roots.length; i++) if (roots[i].at < roots[i - 1].at + roots[i - 1].duration - 1e-9) errs.push("walk/turn actions overlap at " + roots[i].at + " s (root motion is sequential)");
    return errs;
  }

  // resolves each walk/turn's start and end state from the spec alone, so evaluate(t) never depends on frame history
  function compile(spec) {
    var errors = validateActions(spec);
    var s0 = (spec && spec.start) || {};
    var state = { x: Number(s0.x) || 0, z: Number(s0.z) || 0, yaw: deg(Number(s0.yaw) || 0) };
    var acts = ((spec && spec.actions) || []).filter(function (a) { return a && typeof a === "object"; }).map(function (a, i) { return Object.assign({ _i: i }, a); });
    var roots = acts.filter(function (a) { return (a.kind === "walk" || a.kind === "turn") && typeof a.at === "number" && a.duration > 0; }).sort(function (a, b) { return a.at - b.at; });
    var cur = { x: state.x, z: state.z, yaw: state.yaw };
    roots.forEach(function (a) {
      a.from = { x: cur.x, z: cur.z, yaw: cur.yaw };
      if (a.kind === "walk") {
        var to = a.to ? [Number(a.to[0]), Number(a.to[1])] : [cur.x + Number(a.by[0]), cur.z + Number(a.by[1])];
        var dx = to[0] - cur.x, dz = to[1] - cur.z, dist = Math.hypot(dx, dz);
        var face = a.face === "keep" ? cur.yaw : dist > 1e-9 ? cur.yaw + shortest(cur.yaw, Math.atan2(dx, dz)) : cur.yaw;
        var endYaw = typeof a.end_yaw === "number" ? cur.yaw + shortest(cur.yaw, deg(a.end_yaw)) : face;
        a.dist = dist; a.dx = dx; a.dz = dz; a.faceYaw = face;
        a.steps = a.steps || Math.max(2, Math.round(dist / 0.22));
        a.to_ = { x: to[0], z: to[1], yaw: endYaw };
      } else {
        var yaw = typeof a.to === "number" ? cur.yaw + shortest(cur.yaw, deg(a.to)) : cur.yaw + deg(a.by);
        a.to_ = { x: cur.x, z: cur.z, yaw: yaw };
      }
      cur = { x: a.to_.x, z: a.to_.z, yaw: a.to_.yaw };
    });
    return { errors: errors, start: state, roots: roots, acts: acts };
  }

  function env(t, a) {
    var d = a.duration, at = a.at;
    var att = Math.min(a.attack != null ? a.attack : 0.28, d * 0.45), rel = Math.min(a.release != null ? a.release : 0.3, d * 0.45);
    return smooth((t - at) / att) * (1 - smooth((t - (at + d - rel)) / rel));
  }

  function rootAt(c, t) {
    var st = { x: c.start.x, z: c.start.z, yaw: c.start.yaw, walk: null };
    for (var i = 0; i < c.roots.length; i++) {
      var a = c.roots[i];
      if (t >= a.at + a.duration) { st.x = a.to_.x; st.z = a.to_.z; st.yaw = a.to_.yaw; continue; }
      if (t > a.at) {
        var u = (t - a.at) / a.duration;
        if (a.kind === "walk") {
          var p = smoother(u);
          st.x = a.from.x + a.dx * p; st.z = a.from.z + a.dz * p;
          st.yaw = a.from.yaw + (a.faceYaw - a.from.yaw) * smooth(u / 0.28);
          if (u > 0.82) st.yaw = a.faceYaw + (a.to_.yaw - a.faceYaw) * smooth((u - 0.82) / 0.18);
          st.walk = { u: u, p: p, steps: a.steps, w: env(t, a) };
        } else {
          st.yaw = a.from.yaw + (a.to_.yaw - a.from.yaw) * smoother(u);
        }
      } else { st.x = a.from.x; st.z = a.from.z; st.yaw = a.from.yaw; }
      break;
    }
    return st;
  }

  function hopCurve(u) { // u in [0,1): { lift (0..1 of height), sy }
    if (u < 0.22) { var c = smooth(u / 0.22); return { lift: 0, sy: 1 - 0.2 * c }; }
    if (u < 0.78) { var s = (u - 0.22) / 0.56; return { lift: 4 * s * (1 - s), sy: 0.8 + 0.32 * smooth(s * 3) - 0.12 * smooth((s - 0.66) * 3) }; }
    if (u < 0.92) { var l = (u - 0.78) / 0.14; return { lift: 0, sy: 1 - 0.17 * Math.sin(Math.PI * l) }; }
    var r = (u - 0.92) / 0.08; return { lift: 0, sy: 1 - 0.03 * Math.sin(Math.PI * 2 * r) * (1 - r) };
  }

  function evaluate(t, c, dims, seed) {
    var d = dims, sd = seed | 0;
    var r = rootAt(c, t);
    var ch = {
      x: r.x, y: 0, z: r.z, yaw: r.yaw, sy: 1,
      headYaw: 0, headPitch: 0, headRoll: 0,
      armL: REST_ARM.L.slice(), armR: REST_ARM.R.slice(), legL: 0, legR: 0, earL: 0, earR: 0, sprout: 0, sproutX: 0, scarf: 0, scarfZ: 0,
      eye: 1, blink: 0, squint: 0, mouth: 1, cheek: 1,
    };
    // idle: breath, a sprout that sways, ears that breathe, a blink on a seeded schedule (a pure function of t and the seed)
    ch.sy += 0.012 * Math.sin((2 * Math.PI * t) / 3.4);
    ch.sprout += 0.07 * Math.sin((2 * Math.PI * t) / 2.6 + 1);
    ch.scarf += 0.05 * Math.sin((2 * Math.PI * t) / 2.2 + 0.4);
    ch.earL += 0.025 * Math.sin((2 * Math.PI * t) / 3.4 + 0.6); ch.earR += 0.025 * Math.sin((2 * Math.PI * t) / 3.4 + 0.9);
    var k = Math.floor(t / 3), bs = k * 3 + 0.6 + hash(k, sd) * 1.8, bu = (t - bs) / 0.16;
    if (bu > 0 && bu < 1) ch.blink = Math.sin(Math.PI * bu);
    var armAim = { L: null, R: null }, armW = { L: 0, R: 0 };
    var headAim = null;
    var sideOf = function (a) { return a.hand === "l" || a.hand === "L" ? "L" : "R"; };
    var headPos = function () { return [r.x, d.headCY, r.z]; };
    var toLocal = function (v) { var cs = Math.cos(r.yaw), sn = Math.sin(r.yaw); return [v[0] * cs - v[2] * sn, v[1], v[0] * sn + v[2] * cs]; };

    c.acts.forEach(function (a) {
      if (a.kind === "idle" || a.kind === "hold" || typeof a.at !== "number") return;
      var w = env(t, a);
      if (a.kind === "walk") {
        // legs and arms swing with the eased travel (a stride count per leg cycle), amplitude by how fast the actor goes
        if (t >= a.at && t <= a.at + a.duration) {
          var u = (t - a.at) / a.duration, p = smoother(u), ph = 2 * Math.PI * a.steps * 0.5 * p, speed = Math.sin(Math.PI * Math.min(1, Math.max(0, p))) , amp = 0.55 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.5);
          ch.legL += amp * Math.sin(ph); ch.legR -= amp * Math.sin(ph);
          ch.y += 0.008 * Math.abs(Math.sin(ph)) * amp / 0.55;
          ch.headRoll += 0.04 * Math.sin(ph) * amp / 0.55;
          armAim.L = [-0.26, -1, 0.05 - 0.42 * Math.sin(ph) * amp / 0.55]; armAim.R = [0.26, -1, 0.05 + 0.42 * Math.sin(ph) * amp / 0.55];
          armW.L = Math.max(armW.L, 1); armW.R = Math.max(armW.R, 1);
          ch.earL += 0.18 * Math.sin(ph + 1.2) * amp / 0.55; ch.earR += 0.18 * Math.sin(ph + 1.2) * amp / 0.55;
          void speed;
        }
      } else if (a.kind === "hop") {
        var n = Math.max(1, a.count | 0 || 1), h = (typeof a.height === "number" ? a.height : 0.25), dd = a.duration / n;
        if (t >= a.at && t < a.at + a.duration) {
          var i = Math.min(n - 1, Math.floor((t - a.at) / dd)), cu = (t - a.at - i * dd) / dd, cv = hopCurve(cu);
          ch.y += h * cv.lift; ch.sy *= cv.sy;
          var e = 1 / 240, c2 = hopCurve(clamp(cu + e / dd, 0, 0.9999)), c1 = hopCurve(clamp(cu - e / dd, 0, 0.9999));
          var vel = (c2.lift - c1.lift) * h / (2 * e);          // world units per second: the ears trail it
          ch.earL += clamp(-vel * 0.18, -0.7, 0.7) * 0.6; ch.earR += clamp(-vel * 0.18, -0.7, 0.7) * 0.6;
          ch.sprout += clamp(-vel * 0.12, -0.5, 0.5);
          var air = cv.lift > 0 ? Math.sin(Math.PI * Math.min(1, cv.lift * 1.0)) : 0;
          var up = norm3([0.7, 0.8, 0.15]);
          armAim.L = [-up[0], up[1], up[2]]; armAim.R = up; armW.L = Math.max(armW.L, air * 0.9); armW.R = Math.max(armW.R, air * 0.9);
          ch.legL += -0.35 * air; ch.legR += -0.35 * air;
        }
      } else if (a.kind === "look") {
        var yawT, pitchT;
        if (Array.isArray(a.target)) {
          var hp = headPos(), v = [a.target[0] - hp[0], a.target[1] - hp[1], a.target[2] - hp[2]], lv = toLocal(v);
          yawT = Math.atan2(lv[0], lv[2]); pitchT = Math.atan2(lv[1], Math.hypot(lv[0], lv[2]));
        } else { yawT = deg(a.yaw); pitchT = deg(a.pitch || 0); }
        yawT = clamp(shortest(0, yawT), -1.15, 1.15); pitchT = clamp(pitchT, -0.5, 0.5);
        headAim = headAim || { yaw: 0, pitch: 0, w: 0 };
        ch.headYaw += yawT * w; ch.headPitch += pitchT * w;
      } else if (a.kind === "point") {
        var sd2 = sideOf(a), sh = [r.x + (sd2 === "R" ? 1 : -1) * Math.cos(r.yaw) * d.shoulderX, d.shoulderY, r.z - (sd2 === "R" ? 1 : -1) * Math.sin(r.yaw) * d.shoulderX];
        var tv = toLocal([a.target[0] - sh[0], a.target[1] - sh[1], a.target[2] - sh[2]]);
        var dir = norm3(tv);
        armAim[sd2] = dir; armW[sd2] = Math.max(armW[sd2], w);
        var hp2 = headPos(), hv = toLocal([a.target[0] - hp2[0], a.target[1] - hp2[1], a.target[2] - hp2[2]]);
        ch.headYaw += clamp(shortest(0, Math.atan2(hv[0], hv[2])), -1.0, 1.0) * w * 0.7; ch.headPitch += clamp(Math.atan2(hv[1], Math.hypot(hv[0], hv[2])), -0.4, 0.4) * w * 0.6;
        ch.sy *= 1 + 0.015 * w;
      } else if (a.kind === "carry") {
        var s3 = sideOf(a), fwd = norm3([s3 === "R" ? 0.18 : -0.18, -0.15, 1]);
        armAim[s3] = fwd; armW[s3] = Math.max(armW[s3], w);
        ch.headPitch += -0.06 * w;
      } else if (a.kind === "react") {
        var E = EMOTIONS[a.emotion];
        if (E) {
          var u2 = clamp((t - a.at) / a.duration, 0, 1);
          // a quick pop at the start (a damped spring), then the held emotion
          var pop = t >= a.at ? Math.exp(-5 * (t - a.at)) * Math.sin(18 * (t - a.at)) : 0;
          ch.eye += E.eye * w * (1 + 0.5 * pop); ch.sy *= 1 + E.sy * w + 0.05 * pop * (E.lift > 0 ? 1 : 0.3);
          ch.headPitch += E.pitch * w; ch.headRoll += E.roll * w; ch.earL += E.ear * w; ch.earR += E.ear * w; ch.sprout += E.sprout * w;
          ch.y += E.lift * w * Math.max(0, pop) * 1.5; ch.mouth += E.mouth * w; ch.cheek += E.cheek * w; ch.squint += E.squint * w;
          if (E.arm > 0) { var up2 = norm3([0.55, 0.55, 0.25]); armAim.L = armAim.L || [-up2[0], up2[1], up2[2]]; armAim.R = armAim.R || up2; armW.L = Math.max(armW.L, E.arm * w); armW.R = Math.max(armW.R, E.arm * w); }
          void u2;
        }
      }
    });
    ["L", "R"].forEach(function (sd3) {
      var aim = armAim[sd3], w = clamp(armW[sd3], 0, 1);
      var dir = aim ? norm3(lerp3(REST_ARM[sd3], aim, aim === armAim[sd3] && w >= 0 ? w : 0)) : REST_ARM[sd3];
      ch["arm" + sd3] = dir;
    });
    ch.sy = clamp(ch.sy, 0.6, 1.3);
    ch.headYaw = clamp(ch.headYaw, -1.3, 1.3);
    return ch;
  }

  // the whole pure layer in one call: spec -> channels at t. Memoised by the spec's text only (never by time)
  var memo = {};
  function channelsAt(t, spec, identity, seed) {
    var key = canonicalJSON(spec || {});
    var c = memo[key] || (memo[key] = compile(spec || {}));
    if (c.errors.length) throw new Error("RasanCharacter3D action spec: " + c.errors.join("; "));
    return evaluate(t, c, dimsOf(identity), seed == null ? (spec && spec.seed) || 0 : seed);
  }

  // ------------------------------------------------------------------ the comparison of what was measured against the canon (pure: runs in the page and in Node)
  function expectedRatios(identity) {
    var P = (identity && identity.proportions) || {}, bw = P.body_w, out = {};
    if (!(bw > 0)) return out;
    Object.keys(MEASURES).forEach(function (k) { if (k !== "body_w" && typeof P[k] === "number") out[k] = P[k] / bw; });
    return out;
  }
  function hexToRgb(h) { h = String(h).replace("#", ""); if (h.length === 3) h = h.split("").map(function (x) { return x + x; }).join(""); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function swappableOf(identity) { return Array.isArray(identity && identity.palette_swappable) ? identity.palette_swappable : []; }
  function expectedPalette(identity, colors) {
    var p = Object.assign({}, (identity && identity.palette) || {});
    Object.keys(colors || {}).forEach(function (k) { if (swappableOf(identity).indexOf(k) >= 0) p[k] = colors[k]; });
    return p;
  }
  // measured: what measure() read from the live objects. -> { ok, findings: [{ rule, severity, message, fix }] }
  function validateMeasured(measured, identity, opts) {
    opts = opts || {};
    var tol = opts.tolerance || TOL, F = [], add = function (rule, message, fix, extra) { F.push(Object.assign({ rule: rule, severity: "error", message: message, fix: fix }, extra || {})); };
    if (!measured || !identity) return { ok: false, findings: [{ rule: "canon-unmeasured", severity: "error", message: "nothing to compare", fix: "pass the rig and the identity" }] };
    if (measured.id !== identity.id) add("canon-id-mismatch", "the actor in the scene is " + measured.id + " but the canon is " + identity.id, "load the actor from the canon's identity.json");
    if (opts.expectDigest && measured.digest !== opts.expectDigest) add("identity-stale", "the scene's copy of the identity (" + measured.digest + ") differs from the run's cast/" + identity.id + "/identity.json (" + opts.expectDigest + ")", "rescaffold the scene or paste the current identity; scenes reference the canon, never edit it");
    var b = BUILDERS[(identity.rig || {}).builder];
    if (measured.builder && b && (measured.builder !== identity.rig.builder || measured.builder_version !== (identity.rig.builder_version || b.version))) add("rig-builder-mismatch", "the scene drew the actor with builder " + measured.builder + " v" + measured.builder_version + ", the canon says " + identity.rig.builder + " v" + (identity.rig.builder_version || b.version), "use the canon's builder version");
    // fixed traits: every part that draws one must be there, attached and visible
    var feat = traitFeatures(identity.fixed_traits || []);
    feat.features.forEach(function (f) {
      f.parts.forEach(function (p) {
        var m = measured.parts[p];
        if (!m || !m.present) add("fixed-trait-missing", "fixed trait \"" + f.trait + "\": part " + p + " is missing from the actor in this scene", "never remove a fixed accessory or feature; hide nothing the canon fixes", { trait: f.trait, part: p });
        else if (!m.visible) add("fixed-trait-missing", "fixed trait \"" + f.trait + "\": part " + p + " is hidden in this scene", "never hide a fixed accessory or feature", { trait: f.trait, part: p });
      });
    });
    feat.unknown.forEach(function (u) { F.push({ rule: "trait-not-verified", severity: "warning", message: "fixed trait \"" + u + "\" is not one the rig can verify on screen", fix: "keep it as a note, or add a feature the builder draws" }); });
    // attachment points
    (identity.attachments || []).forEach(function (a) { if (!measured.attach || !measured.attach[a]) add("attachment-missing", "attachment point " + a + " is missing", "the rig owns its attachment points; do not delete them", { attach: a }); });
    // proportions: ratios to the body width, so a uniform scale of the whole actor is allowed and a changed body ratio is not
    var exp = expectedRatios(identity), t2 = tol.ratio;
    Object.keys(exp).forEach(function (k) {
      var got = measured.ratios && measured.ratios[k];
      if (got == null) return;
      var rel = Math.abs(got - exp[k]) / exp[k];
      if (rel > t2) add("proportion-drift", "proportion " + k + " (relative to body width) is " + got.toFixed(3) + ", the canon says " + exp[k].toFixed(3) + " (" + (rel * 100).toFixed(1) + "% off, " + (t2 * 100).toFixed(0) + "% allowed)", "the body ratio is fixed by the canon; scale the whole actor uniformly, never one axis", { proportion: k, measured: got, expected: exp[k] });
    });
    // palette: the live material colours against the canon palette (plus the permitted outfit swaps recorded on the rig)
    var pal = expectedPalette(identity, measured.colors_swapped), pt = tol.colour * 255;
    Object.keys(pal).forEach(function (key) {
      (PALETTE_PARTS[key] || []).forEach(function (p) {
        var m = measured.parts[p];
        if (!m || !m.present || !m.colour) return;
        var a = hexToRgb(pal[key]), g = hexToRgb(m.colour), dist = Math.max(Math.abs(a[0] - g[0]), Math.abs(a[1] - g[1]), Math.abs(a[2] - g[2]));
        if (dist > pt) add("palette-drift", "palette " + key + " is " + pal[key] + " but " + p + " is " + m.colour + " in this scene", "colours come from the canon; only palette_swappable keys may change, and only through setOutfit / setColors", { key: key, part: p, expected: pal[key], got: m.colour });
      });
    });
    return { ok: !F.some(function (f) { return f.severity === "error"; }), findings: F };
  }

  // ------------------------------------------------------------------ the browser half (three.js through the Rasan3D kit)
  var nextInstance = 0;
  function registry() { return (typeof window !== "undefined") ? (window.__rasanCharacters = window.__rasanCharacters || {}) : {}; }

  function buildCritter(T, k, identity, dims) {
    var d = dims, u = d.u, pal = identity.palette || {}, mats = identity.materials || {};
    function mat(key, fallback) { return k.material(mats[key] || fallback || "clay", { color: pal[key] || "#cccccc" }); }
    var M = { body: mat("body", "clay"), accent: mat("accent", "clay"), scarf: mat("scarf", "matte"), leaf: mat("leaf", "clay"), eye: mat("eye", "plastic"), cheek: mat("cheek", "matte") };
    var shineMat = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    var parts = {}, joints = {}, attach = {};
    var group = new T.Group(); group.name = "character:" + identity.id;
    var rootJ = joint("root", group, 0, 0, 0);
    function joint(name, parent, x, y, z) { var o = new T.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); o.userData.rest = { p: [x, y, z], q: [0, 0, 0, 1], s: [1, 1, 1] }; o.userData.joint = true; joints[name] = o; return o; }
    function restRot(o, x, y, z) { o.rotation.set(x, y, z); o.userData.rest.q = o.quaternion.toArray(); }
    function ell(name, parent, material, rx, ry, rz, x, y, z) {
      var m = new T.Mesh(new T.SphereGeometry(1, 40, 28), material); m.name = name; m.scale.set(rx, ry, rz); m.position.set(x, y, z); m.castShadow = true; parent.add(m); parts[name] = m; return m;
    }
    // body: an egg, squashed about the hips, with the cream belly patch on its front
    var hipJ = joint("bodyJ", rootJ, 0, d.hipY, 0);
    var bodyRz = d.bodyW / 2 * 0.92;
    ell("body", hipJ, M.body, d.bodyW / 2, d.bodyH / 2, bodyRz, 0, d.bodyCY - d.hipY, 0);
    var by = d.bodyCY - d.hipY - d.bodyH * 0.06, bx = d.bodyW * 0.27, byy = d.bodyH * 0.29;
    var bz = bodyRz * Math.sqrt(Math.max(0.05, 1 - (bx * 0.0) / 1 - Math.pow((by - (d.bodyCY - d.hipY)) / (d.bodyH / 2), 2))) - 0.18 * u;
    ell("belly", hipJ, M.accent, bx, byy, 0.35 * u, 0, by, bz);
    // legs: short stubs with round feet; they do not squash with the body, they bend
    ["L", "R"].forEach(function (s) {
      var sx = s === "L" ? -1 : 1, lj = joint("leg" + s + "J", rootJ, sx * d.bodyW * 0.22, d.legLen, 0), r = 0.95 * u;
      var leg = new T.Mesh(new T.CapsuleGeometry(r, Math.max(0.01, d.legLen - 2 * r), 8, 16), M.body); leg.name = "leg" + s; leg.position.y = -d.legLen / 2; leg.castShadow = true; lj.add(leg); parts["leg" + s] = leg;
      ell("foot" + s, lj, M.body, 1.25 * u, 0.62 * u, 1.7 * u, 0, -d.legLen + 0.62 * u, 0.55 * u);
    });
    // arms: capsules hung from the shoulders, a cream mitten at the end, a hand point inside it
    ["L", "R"].forEach(function (s) {
      var sx = s === "L" ? -1 : 1, aj = joint("arm" + s + "J", hipJ, sx * d.shoulderX, d.shoulderY - d.hipY, 0), r = 0.95 * u, len = d.p.arm_len * u;
      aj.userData.rest.q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, -1, 0), new T.Vector3().fromArray(norm3(REST_ARM[s])).normalize()).toArray();
      aj.quaternion.fromArray(aj.userData.rest.q);
      var arm = new T.Mesh(new T.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 8, 16), M.body); arm.name = "arm" + s; arm.position.y = -len / 2; arm.castShadow = true; aj.add(arm); parts["arm" + s] = arm;
      ell("hand" + s, aj, M.accent, 1.2 * u, 1.2 * u, 1.2 * u, 0, -len + 0.1 * u, 0);
      var hp = new T.Object3D(); hp.name = "hand_" + s.toLowerCase(); hp.position.set(0, -len - 0.2 * u, 0.5 * u); aj.add(hp); attach["hand_" + s.toLowerCase()] = hp;
    });
    // head: the neck is its pivot; ears, sprout, eyes, cheeks and mouth ride it
    var headJ = joint("headJ", hipJ, 0, d.neckY - d.hipY, 0);
    var hy = d.headCY - d.neckY, hrx = d.headW / 2, hry = d.headH / 2, hrz = d.headW / 2 * 0.95;
    ell("head", headJ, M.body, hrx, hry, hrz, 0, hy, 0);
    function surfaceZ(x, y) { var f = 1 - Math.pow(x / hrx, 2) - Math.pow((y - hy) / hry, 2); return hrz * Math.sqrt(Math.max(0.04, f)); }
    ["L", "R"].forEach(function (s) {
      var sx = s === "L" ? -1 : 1, ex = sx * d.p.eye_sep * u / 2, ey = hy + d.headH * 0.02, er = d.headW * 0.072;
      var ej = joint("eye" + s + "J", headJ, ex, ey, surfaceZ(ex, ey) - er * 0.5);
      var e = new T.Mesh(new T.SphereGeometry(1, 28, 20), M.eye); e.name = "eye" + s; e.scale.set(er, er * 1.3, er * 0.8); ej.add(e); parts["eye" + s] = e;
      var sh = new T.Mesh(new T.SphereGeometry(1, 12, 10), shineMat); sh.name = "eyeShine" + s; sh.scale.set(er * 0.3, er * 0.3, er * 0.2); sh.position.set(er * 0.28, er * 0.5, er * 0.62); ej.add(sh); parts["eyeShine" + s] = sh;
      var cx = sx * d.headW * 0.3, cy = hy - d.headH * 0.16;
      var cj = joint("cheek" + s + "J", headJ, cx, cy, surfaceZ(cx, cy) - 0.1 * u);
      var ch = new T.Mesh(new T.SphereGeometry(1, 20, 14), M.cheek); ch.name = "cheek" + s; ch.scale.set(d.headW * 0.075, d.headH * 0.05, 0.2 * u); cj.add(ch); parts["cheek" + s] = ch;
      // ears: flattened discs at the top of the head, tilted outward; a pink inner disc on the front face
      var er2 = d.p.ear_r * u, ex2 = sx * d.headW * 0.4, ey2 = hy + d.headH * 0.36;
      var ej2 = joint("ear" + s + "J", headJ, ex2, ey2, -0.1 * u); restRot(ej2, 0, 0, -sx * 0.32);
      ell("ear" + s, ej2, M.body, er2, er2, er2 * 0.42, sx * er2 * 0.55, er2 * 0.55, 0);
      ell("earIn" + s, ej2, M.cheek, er2 * 0.62, er2 * 0.62, er2 * 0.2, sx * er2 * 0.55, er2 * 0.55, er2 * 0.34);
    });
    var mj = joint("mouthJ", headJ, 0, hy - d.headH * 0.15, surfaceZ(0, hy - d.headH * 0.15) - 0.04 * u);
    var mouth = new T.Mesh(new T.TorusGeometry(d.headW * 0.05, d.headW * 0.011, 8, 28, Math.PI), M.eye); mouth.name = "mouth"; mouth.rotation.z = Math.PI; mj.add(mouth); parts.mouth = mouth;
    // the leaf sprout: a bent stem and one leaf (its height is the fixed sprout_h)
    var spj = joint("sproutJ", headJ, 0, hy + hry * 0.93, 0.15 * u); restRot(spj, 0, 0, -0.1);
    var sl = d.p.sprout_h * u, sr = 0.3 * u;
    var stem = new T.Mesh(new T.CapsuleGeometry(sr, Math.max(0.01, sl - 2 * sr), 6, 12), M.leaf); stem.name = "sproutStem"; stem.position.y = sl / 2 - 0.2 * u; stem.castShadow = true; spj.add(stem); parts.sproutStem = stem;
    var leaf = new T.Mesh(new T.SphereGeometry(1, 24, 16), M.leaf); leaf.name = "sproutLeaf"; leaf.scale.set(1.9 * u, 0.55 * u, 0.9 * u); leaf.position.set(1.3 * u, sl - 0.35 * u, 0); leaf.rotation.z = 0.5; leaf.castShadow = true; spj.add(leaf); parts.sproutLeaf = leaf;
    // the scarf: a ring at the neck with two cream stripes and a tail that swings (the signature accessory)
    var sc = new T.Mesh(new T.TorusGeometry(d.bodyW * 0.335, 1.05 * u, 16, 44), M.scarf); sc.name = "scarf"; sc.rotation.x = Math.PI / 2; sc.position.set(0, d.neckY - d.hipY - 0.15 * u, 0.15 * u); sc.castShadow = true; hipJ.add(sc); parts.scarf = sc;
    [-0.5, 0.55].forEach(function (o, i) { var st = new T.Mesh(new T.TorusGeometry(d.bodyW * 0.335 + 0.92 * u, 0.17 * u, 8, 44), M.accent); st.name = "scarfStripe" + i; st.position.z = o * 0.85 * u; sc.add(st); parts["scarfStripe" + i] = st; });
    var tj = joint("scarfTailJ", hipJ, d.bodyW * 0.2, d.neckY - d.hipY - 0.5 * u, d.bodyW * 0.335 + 0.6 * u); restRot(tj, -0.42, 0, 0.08);
    var tail = new T.Mesh(new T.CapsuleGeometry(0.85 * u, 2.2 * u, 6, 12), M.scarf); tail.name = "scarfTail"; tail.scale.set(1, 1, 0.35); tail.position.y = -1.6 * u; tail.castShadow = true; tj.add(tail); parts.scarfTail = tail;
    var top = new T.Object3D(); top.name = "head_top"; top.position.set(0, hy + hry + 0.2 * u, 0); headJ.add(top); attach.head_top = top;
    group.userData.canon = { id: identity.id, digest: digest(identity), builder: "rasan-critter", builder_version: BUILDERS["rasan-critter"].version, swapped: {} };
    return { group: group, joints: joints, parts: parts, attach: attach, materials: M };
  }

  // the rest pose of any copy of a rig (a clone keeps userData): joints only, never the parts a scene may have tampered with
  function resetToRest(group) {
    group.traverse(function (o) {
      var r = o.userData && o.userData.rest;
      if (!r || !o.userData.joint) return;
      o.position.set(r.p[0], r.p[1], r.p[2]); o.quaternion.fromArray(r.q); o.scale.set(r.s[0], r.s[1], r.s[2]);
    });
    group.updateMatrixWorld(true);
  }

  function applyChannels(rig, c, T) {
    var J = rig.joints, d = rig.dims;
    J.root.position.set(c.x, c.y, c.z); J.root.rotation.y = c.yaw;
    var sy = c.sy, sxz = 1 / Math.sqrt(sy);
    J.bodyJ.scale.set(sxz, sy, sxz);
    J.headJ.rotation.set(-c.headPitch, c.headYaw, c.headRoll);
    ["L", "R"].forEach(function (s) {
      var q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, -1, 0), new T.Vector3().fromArray(norm3(c["arm" + s])));
      J["arm" + s + "J"].quaternion.copy(q);
      J["leg" + s + "J"].rotation.x = c["leg" + s];
      J["leg" + s + "J"].scale.y = sy < 1 ? 1 - 0.5 * (1 - sy) : 1 + 0.5 * (sy - 1);
      var sg = s === "L" ? -1 : 1, ro = J["ear" + s + "J"].userData.rest.q;
      J["ear" + s + "J"].rotation.set(0, 0, -sg * 0.32 + sg * -c["ear" + s]);
      void ro;
      var eyeS = Math.max(0.05, c.eye), ey = Math.max(0.04, 1 - c.blink * 0.94 - c.squint * 0.55);
      J["eye" + s + "J"].scale.set(eyeS, eyeS * ey, eyeS);
      J["cheek" + s + "J"].scale.set(Math.max(0.2, c.cheek), Math.max(0.2, c.cheek), 1);
    });
    J.sproutJ.rotation.set(c.sproutX, 0, -0.1 + c.sprout);
    J.scarfTailJ.rotation.set(-0.42 + c.scarf, 0, 0.08 + c.scarfZ);
    J.mouthJ.scale.set(Math.max(0.2, c.mouth), Math.max(0.2, c.mouth), 1);
    rig.group.updateMatrixWorld(true);
  }

  function loadCharacter(identity, k, opts) {
    opts = opts || {};
    if (!identity || identity.medium !== "3d-rig") throw new Error("RasanCharacter3D.loadCharacter: the identity's medium must be \"3d-rig\" (got " + JSON.stringify(identity && identity.medium) + ")");
    var rg = identity.rig || {};
    if (rg.kind !== "code") throw new Error("RasanCharacter3D.loadCharacter: rig.kind \"" + rg.kind + "\" needs the rigged-actor API of the unmerged upstream Sibhimanyu/rasan-3d (skeleton clips); this adapter builds only rig.kind \"code\" actors. Use the code-built actor, or wait for the merge.");
    if (!BUILDERS[rg.builder]) throw new Error("RasanCharacter3D.loadCharacter: unknown rig.builder " + JSON.stringify(rg.builder) + " (have " + Object.keys(BUILDERS).join(", ") + ")");
    if (!k || !k.THREE || !k.material) throw new Error("RasanCharacter3D.loadCharacter(identity, k): k is the Rasan3D kit handed to build(k)");
    var T = k.THREE, dims = dimsOf(identity), b = buildCritter(T, k, identity, dims);
    var rig = {
      id: identity.id, identity: identity, digest: digest(identity), group: b.group, joints: b.joints, parts: b.parts, attach: b.attach, dims: dims, T: T,
      instance: opts.instance || String(++nextInstance), seed: opts.seed | 0, carried: [],
    };
    // time is the only input: spec + t -> every joint, every call
    rig.poseAt = function (t, spec) {
      var s = spec && typeof spec === "object" ? spec : { actions: [] };
      var c = channelsAt(t, s, identity, s.seed != null ? s.seed : rig.seed);
      applyChannels(rig, c, T);
      rig.carried.forEach(function (cr) { cr.obj.visible = cr.from == null ? true : t >= cr.from && t < cr.to; });
      return c;
    };
    rig.attachProp = rig.attach_ = function (obj, point, o) {
      var node = rig.attach[point];
      if (!node) throw new Error("no attachment point " + point + " (have " + Object.keys(rig.attach).join(", ") + ")");
      o = o || {};
      obj.userData.canonProp = true; node.add(obj);
      if (o.offset) obj.position.set(o.offset[0], o.offset[1], o.offset[2]); else obj.position.set(0, 0, 0);
      if (o.rotation) obj.rotation.set(o.rotation[0], o.rotation[1], o.rotation[2]);
      if (o.scale != null) obj.scale.setScalar(o.scale);
      if (o.from != null || o.to != null) rig.carried.push({ obj: obj, from: o.from == null ? 0 : o.from, to: o.to == null ? Infinity : o.to });
      return obj;
    };
    rig.detach = function (obj) { obj.removeFromParent(); rig.carried = rig.carried.filter(function (c) { return c.obj !== obj; }); };
    // outfit and colour swaps: only the keys identity.palette_swappable names, only the outfits it lists
    rig.setColors = function (colors) {
      var sw = swappableOf(identity), bad = Object.keys(colors || {}).filter(function (x) { return sw.indexOf(x) < 0; });
      if (bad.length) throw new Error("the canon does not permit changing " + bad.join(", ") + " (palette_swappable: " + (sw.join(", ") || "none") + ")");
      Object.keys(colors).forEach(function (key) {
        (PALETTE_PARTS[key] || []).forEach(function (p) { var m = rig.parts[p]; if (m && m.material) { m.material = freshMaterial(m.material); m.material.color.set(colors[key]); } });
        b.group.userData.canon.swapped[key] = colors[key];
      });
      rig.swapped = Object.assign({}, b.group.userData.canon.swapped);
      return rig;
    };
    rig.setOutfit = function (id) {
      var o = (identity.outfits || []).filter(function (x) { return x.id === id; })[0];
      if (!o) throw new Error("the canon has no outfit " + JSON.stringify(id) + " (have " + ((identity.outfits || []).map(function (x) { return x.id; }).join(", ") || "none") + ")");
      return rig.setColors(o.colors || {});
    };
    rig.measure = function () { return measure(rig.group, identity); };
    rig.validateCanon = function (o) { return validateCanon(rig, identity, o); };
    b.group.userData.rigInstance = rig.instance;
    registry()[rig.id + "#" + rig.instance] = rig;
    poseRest(rig);
    return rig;
  }
  function poseRest(rig) { rig.poseAt(0, { actions: [] }); }

  // ------------------------------------------------------------------ measure: the live objects at their rest pose (on a clone: never touches the scene's rig)
  function stripped(group) {
    var c = group.clone(true);
    var props = [];
    c.traverse(function (o) { if (o.userData && o.userData.canonProp) props.push(o); });
    props.forEach(function (o) { o.removeFromParent(); });
    resetToRest(c);
    return c;
  }
  // a copy of a material that Rasan3D has not tone-mapped yet (Material.clone keeps userData, which would make the stage skip its patch)
  function freshMaterial(m) { var c = m.clone(); if (c.userData) { delete c.userData.r3tone; delete c.userData.r3prevCompile; } return c; }
  function hex(m) { return m && m.color ? "#" + m.color.getHexString() : null; }
  function visibleChain(o, top) { for (var n = o; n && n !== top.parent; n = n.parent) if (n.visible === false) return false; return true; }
  function measure(group, identity) {
    var T = window.THREE;
    var c = stripped(group);
    // zero the scene's placement but keep any scale (a squashed or stretched actor is the thing to catch); yaw 0
    c.position.set(0, 0, 0); c.quaternion.identity(); c.updateMatrixWorld(true);
    var out = { id: null, digest: null, builder: null, builder_version: null, parts: {}, attach: {}, sizes: {}, ratios: {}, colours: {}, colors_swapped: {}, height: 0 };
    var meta = (group.userData && group.userData.canon) || {};
    out.id = meta.id; out.digest = meta.digest; out.builder = meta.builder; out.builder_version = meta.builder_version; out.colors_swapped = Object.assign({}, meta.swapped || {});
    var pos = {}, size = {}, names = {};
    c.traverse(function (o) { if (o.name) names[o.name] = o; });
    Object.keys(PALETTE_PARTS).forEach(function (key) { PALETTE_PARTS[key].forEach(function (p) { names[p] = names[p] || null; }); });
    var allParts = {};
    FEATURES.forEach(function (f) { f.parts.forEach(function (p) { allParts[p] = 1; }); });
    Object.keys(PALETTE_PARTS).forEach(function (k2) { PALETTE_PARTS[k2].forEach(function (p) { allParts[p] = 1; }); });
    Object.keys(MEASURES).forEach(function (k2) { var m = MEASURES[k2]; if (m.part) allParts[m.part] = 1; if (m.between) m.between.forEach(function (p) { allParts[p] = 1; }); });
    Object.keys(allParts).forEach(function (p) {
      var o = names[p];
      if (!o) { out.parts[p] = { present: false, visible: false }; return; }
      var vis = visibleChain(o, c);
      var e = { present: true, visible: vis, colour: o.material ? hex(o.material) : null };
      if (o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        var bb = o.geometry.boundingBox, w = o.matrixWorld, ps = o.getWorldPosition(new T.Vector3()), sc = new T.Vector3(), q = new T.Quaternion(), pp = new T.Vector3();
        w.decompose(pp, q, sc);
        size[p] = { x: (bb.max.x - bb.min.x) * Math.abs(sc.x), y: (bb.max.y - bb.min.y) * Math.abs(sc.y), z: (bb.max.z - bb.min.z) * Math.abs(sc.z) };
        pos[p] = ps; e.size = size[p];
      }
      out.parts[p] = e;
    });
    Object.keys(names).forEach(function (n) { if (/^hand_[lr]$|^head_top$/.test(n)) out.attach[n] = true; });
    var bw = size.body ? size.body.x : 0;
    if (bw > 0) {
      Object.keys(MEASURES).forEach(function (k2) {
        if (k2 === "body_w") return;
        var m = MEASURES[k2], v = null;
        if (m.part && size[m.part]) v = size[m.part][m.axis] / (m.div || 1);
        else if (m.between && pos[m.between[0]] && pos[m.between[1]]) v = Math.abs(pos[m.between[1]].x - pos[m.between[0]].x);
        if (v != null) out.ratios[k2] = v / bw;
      });
      out.sizes = { body_w: bw };
    }
    return out;
  }
  function validateCanon(rigOrGroup, identity, opts) {
    var group = rigOrGroup && rigOrGroup.group ? rigOrGroup.group : rigOrGroup;
    var id = identity || (rigOrGroup && rigOrGroup.identity);
    var m = measure(group, id);
    var r = validateMeasured(m, id, opts);
    r.measured = m;
    return r;
  }

  // ------------------------------------------------------------------ canon views and the model sheet: a second Rasan3D STAGE (same WebGL renderer), cloned actor at rest
  var VIEW_W = 240, VIEW_H = 320;
  function cameraFor(identity, name, dims) {
    // portrait tiles (3:4): the frame's long side is its height, so 36 mm is the vertical sensor size (Rasan3D's lens() does the same)
    var cr = ((identity.camera_reference || {})[name]) || (name === "quarter" ? { azimuth: 38, elevation: 6, lens: 70, fill: 0.78 } : name === "side" ? { azimuth: 90, elevation: 3, lens: 70, fill: 0.78 } : name === "back" ? { azimuth: 180, elevation: 3, lens: 70, fill: 0.78 } : { azimuth: 0, elevation: 3, lens: 70, fill: 0.78 });
    var H = dims.height, fovV = 2 * Math.atan(18 / (cr.lens || 70)), dist = (H / (cr.fill || 0.78)) / (2 * Math.tan(fovV / 2));
    var az = deg(cr.azimuth || 0), el = deg(cr.elevation || 0), cy = H * 0.5;
    return { pos: [dist * Math.sin(az) * Math.cos(el), cy + dist * Math.sin(el), dist * Math.cos(az) * Math.cos(el)], target: [0, cy, 0], lens: cr.lens || 70 };
  }
  var viewerN = 0;
  function viewer(Rasan3D, T, source, identity, views, o) {
    o = o || {};
    var dims = dimsOf(identity), W = o.width || VIEW_W, H = o.height || VIEW_H;
    var canvas = document.createElement("canvas"); canvas.style.cssText = "position:absolute;left:-9999px;top:0;width:" + W + "px;height:" + H + "px"; document.body.appendChild(canvas);
    var tl = window.gsap.timeline({ paused: true }), id = "__canon-view-" + (++viewerN), cur = { view: views[0].name, spec: null, t: 0 };
    var holder = {};
    var stage = Rasan3D.stage({
      id: id, canvas: canvas, timeline: tl, duration: 0, width: W, height: H, fps: 30, pixelRatio: 1, environment: "studio", motionBlur: false, toneMapping: "neutral",
      camera: {
        pos: function () { return cameraFor(identity, cur.view, dims).pos; },
        target: function () { return cameraFor(identity, cur.view, dims).target; },
        lens: function () { return cameraFor(identity, cur.view, dims).lens; },
      },
      build: function (k) {
        k.rig("three-point", { key: "#fff4e6", dir: [-0.5, 0.8, 0.8], shadows: false });
        var c;
        if (source) { c = stripped(source); c.position.set(0, 0, 0); c.quaternion.identity(); var uy = c.scale.y || 1; c.scale.set(c.scale.x / uy, 1, c.scale.z / uy); } // a uniform scale of the whole actor is allowed (framing is by height); one stretched axis stays visible
        else { var pr = loadCharacter(identity, k, { instance: "view" + viewerN }); delete registry()[pr.id + "#" + pr.instance]; c = pr.group; resetToRest(c); } // a fresh actor from the canon, at its true rest pose
        // a permitted outfit swap is not a palette change: put the swappable parts back to canon colours, keep every locked part as the scene has it
        var sw = swappableOf(identity);
        sw.forEach(function (key) { (PALETTE_PARTS[key] || []).forEach(function (p) { var m = c.getObjectByName(p); if (m && m.material) { m.material = freshMaterial(m.material); m.material.color.set(identity.palette[key]); } }); });
        k.scene.add(c); holder.group = c; return { c: c };
      },
      pose: function (t, k) { /* the actor stays at its rest pose; only the camera moves */ },
    });
    function pixels() { var x = stage.ctx2d, cv = stage.canvas; return { w: cv.width, h: cv.height, data: x.getImageData(0, 0, cv.width, cv.height).data }; }
    return {
      stage: stage, holder: holder, cur: cur,
      ready: stage.readyPromise,
      shoot: function (view, extra) { cur.view = view; cur.extra = extra || null; stage.draw(0, true); return pixels(); },
      dispose: function () { try { delete window.__rasan3d.stages[id]; } catch (e) { /* none */ } canvas.remove(); },
    };
  }
  function b64(data) { var s = "", n = data.length, CH = 0x8000; for (var i = 0; i < n; i += CH) s += String.fromCharCode.apply(null, data.subarray ? data.subarray(i, Math.min(n, i + CH)) : data.slice(i, i + CH)); return btoa(s); }

  // the standardized front + quarter renders of THIS rig (the live scene's actor, at rest): RGBA as base64 for canon3d.mjs to normalise and compare
  async function canonViews(rigOrGroup, o) {
    o = o || {};
    var R3 = window.Rasan3D, group = rigOrGroup.group || (rigOrGroup.isObject3D ? rigOrGroup : null);
    var identity = o.identity || rigOrGroup.identity || (group ? null : rigOrGroup);   // an identity alone: the actor is built fresh from the canon
    var T = await R3.loadThree();
    var names = o.views || ["front", "quarter"];
    var v = viewer(R3, T, group, identity, names.map(function (n) { return { name: n }; }), o);
    await v.ready;
    if (v.stage.error) { v.dispose(); throw new Error("canon view stage failed: " + v.stage.error); }
    var out = {};
    names.forEach(function (n) { var p = v.shoot(n); out[n] = { w: p.w, h: p.h, rgba: b64(p.data) }; });
    v.dispose();
    return out;
  }

  // the model sheet: front, quarter, side and back at rest, then look / point / hop / react / walk mid-action, on a flat ground. One PNG.
  async function renderModelSheet(identityOrRig, o) {
    o = o || {};
    var R3 = window.Rasan3D, T = await R3.loadThree();
    var identity = identityOrRig.identity || identityOrRig, rigIn = identityOrRig.group ? identityOrRig : null;
    var holderKit = null, rig = rigIn;
    var shots = [], W = o.tileW || 240, H = o.tileH || 320, cols = 5, tiles = [];
    var actions = [
      { name: "look", spec: { actions: [{ kind: "look", at: 0, duration: 2, target: [1.2, 0.7, 1.2], attack: 0.1 }] }, t: 1 },
      { name: "point", spec: { actions: [{ kind: "point", at: 0, duration: 2, target: [1.1, 0.8, 0.6], attack: 0.1 }] }, t: 1 },
      { name: "hop", spec: { actions: [{ kind: "hop", at: 0, duration: 1, height: 0.12 }] }, t: 0.5 },
      { name: "react", spec: { actions: [{ kind: "react", at: 0, duration: 2, emotion: "surprised", attack: 0.1 }] }, t: 0.5 },
      { name: "walk", spec: { start: { x: -0.05, z: 0 }, actions: [{ kind: "walk", at: 0, duration: 2, to: [0.3, 0.05] }] }, t: 0.8 },
    ];
    var canvas = document.createElement("canvas"); canvas.style.cssText = "position:absolute;left:-9999px;top:0"; document.body.appendChild(canvas);
    var tl = window.gsap.timeline({ paused: true }), cur = { cam: "front" };
    var dims = dimsOf(identity), state = {};
    var stage = R3.stage({
      id: "__canon-sheet", canvas: canvas, timeline: tl, duration: 0, width: W, height: H, fps: 30, pixelRatio: 1, environment: "studio", motionBlur: false, toneMapping: "neutral",
      camera: { pos: function () { return cameraFor(identity, cur.cam, dims).pos; }, target: function () { return cameraFor(identity, cur.cam, dims).target; }, lens: function () { return cameraFor(identity, cur.cam, dims).lens; } },
      build: function (k) {
        k.rig("three-point", { key: "#fff4e6", dir: [-0.5, 0.8, 0.8], shadows: true, shadowSize: 3 });
        k.ground({ y: 0, shadowOpacity: 0.28 });
        rig = rig || loadCharacter(identity, k, { instance: "sheet" });
        k.scene.add(rig.group); state.rig = rig;
        return {};
      },
      pose: function (t, k) { state.rig.poseAt(cur.t || 0, cur.spec || { actions: [] }); },
    });
    await stage.readyPromise;
    if (stage.error) throw new Error("model sheet stage failed: " + stage.error);
    var sheet = document.createElement("canvas"); sheet.width = W * cols; sheet.height = H * 2;
    var x = sheet.getContext("2d"); x.fillStyle = o.paper || "#f3ead8"; x.fillRect(0, 0, sheet.width, sheet.height);
    function tile(i, name, camName, spec, t) {
      cur.cam = camName; cur.spec = spec; cur.t = t; stage.draw(0, true);
      var cx = (i % cols) * W, cy = Math.floor(i / cols) * H;
      x.drawImage(stage.canvas, cx, cy, W, H);
      x.fillStyle = "#6b5f4b"; x.font = "600 15px sans-serif"; x.fillText(name, cx + 10, cy + H - 10);
    }
    var order = ["front", "quarter", "side", "back"];
    order.forEach(function (n, i) { tile(i, n, n, null, 0); });
    x.fillStyle = "#6b5f4b"; x.font = "600 14px sans-serif"; x.fillText(identity.display_name, 4 * W / 1 * 0 + (4 * W) + 12, 26); x.font = "12px sans-serif"; (identity.fixed_traits || []).forEach(function (tr, i) { x.fillText((i ? "" : "fixed: ") + tr, 4 * W + 12 + (i ? 42 : 0), 46 + i * 17); }); x.fillText("synthetic fixture", 4 * W + 12, 46 + ((identity.fixed_traits || []).length + 1) * 17);
    actions.forEach(function (a, i) { tile(cols + i, a.name, "front", a.spec, a.t); });
    try { delete window.__rasan3d.stages["__canon-sheet"]; } catch (e) { /* none */ }
    if (!rigIn) rig.group.removeFromParent();
    canvas.remove();
    return { png: sheet.toDataURL("image/png"), width: sheet.width, height: sheet.height };
  }

  // a stable hash of the posed joint transforms: A-B-A seeks must repeat it
  function poseHash(rig) {
    var parts = [], J = rig.joints;
    Object.keys(J).sort().forEach(function (n) { var o = J[n]; parts.push(n, o.position.x.toFixed(5), o.position.y.toFixed(5), o.position.z.toFixed(5), o.quaternion.x.toFixed(5), o.quaternion.y.toFixed(5), o.quaternion.z.toFixed(5), o.quaternion.w.toFixed(5), o.scale.x.toFixed(5), o.scale.y.toFixed(5), o.scale.z.toFixed(5)); });
    var h = 2166136261 >>> 0, s = parts.join("|");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16);
  }

  return {
    version: VERSION, UNIT: UNIT, BUILDERS: BUILDERS, KINDS: KINDS, REQUIRED_ACTIONS: REQUIRED_ACTIONS, EMOTIONS: Object.keys(EMOTIONS), TOL: TOL,
    FEATURES: FEATURES, PALETTE_PARTS: PALETTE_PARTS, MEASURES: MEASURES,
    traitFeatures: traitFeatures, digest: digest, canonicalJSON: canonicalJSON, dimsOf: dimsOf, compile: compile, validateActions: validateActions, channelsAt: channelsAt,
    expectedRatios: expectedRatios, expectedPalette: expectedPalette, validateMeasured: validateMeasured,
    loadCharacter: loadCharacter, poseAt: function (rig, t, spec) { return rig.poseAt(t, spec); }, validateCanon: validateCanon, measure: measure, canonViews: canonViews, renderModelSheet: renderModelSheet,
    poseHash: poseHash, registry: registry, cameraFor: cameraFor, VIEW: { w: VIEW_W, h: VIEW_H },
  };
});
