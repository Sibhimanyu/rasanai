/* Rasan2D character: the actor's identity (canon), its five views, its face (31 named emotions) and its skeleton.
 *
 * One rig, five views. The body, head, ears, tuft and tail live on two ellipsoids (head, body); a view is a yaw of those
 * ellipsoids (front 0, quarter 45, side 90, back-quarter 135, back 180; the sign is the facing: negative faces left), and the
 * drawing of each view is its own: the profile grows a muzzle bump and a one-eye face, the quarter's far eye narrows behind the
 * muzzle, the back views lose the face and gain the nape curl and two cream dorsal spots. Face features are drawn on the head
 * surface in face-plane coordinates and clipped to its silhouette, so an eye at the edge of the head is cut by the horizon the
 * way a painted one would be.
 *
 * The identity (canon) is the only source of look: palette, proportions, fixed traits. Nothing here is copied from any
 * existing character; the demo actor ("Pim") is an original design.
 *
 * Works in a browser (window.Rasan2DKit.character) and in Node (module.exports) for the pure parts.
 */
(function (root) {
  "use strict";
  var K = (root.Rasan2DKit = root.Rasan2DKit || {});
  var B = K.brush || (typeof require === "function" ? require("./brush.js") : null);
  var D2R = Math.PI / 180, TAU = Math.PI * 2;

  // ------------------------------------------------------------------ the 31 emotions
  var DEF = {
    eyeOpen: 1, lidTop: 0, lidSlant: 0, lidBot: 0, smileEye: 0, pupil: 1, eyeSize: 1, eyeSep: 1, gx: 0, gy: 0,
    browY: 0, browAng: 0, browArch: 0.35, browAsym: 0,
    mouthW: 1, mouthOpen: 0, mouthCurve: 0.3, mouthSkew: 0, mouthShape: "curve",
    blush: 0, tilt: 0, nod: 0, lean: 0, slump: 0, bounce: 0.3, tremble: 0, earDroop: 0, tuftDroop: 0, squash: 0,
    eyeFx: "dot",
  };
  var EMO = {
    calm:          { eyeOpen: 0.85, lidTop: 0.12, mouthW: 0.8, mouthCurve: 0.3, browY: -0.1, bounce: 0.12, earDroop: 0.1 },
    curious:       { eyeOpen: 1.1, eyeSize: 1.1, browY: 0.5, browAsym: 0.55, tilt: 12, mouthShape: "o", mouthW: 0.45, mouthOpen: 0.25, gy: 0.3, gx: 0.3, earDroop: -0.4, marks: { question: 0.7 } },
    surprised:     { eyeOpen: 1.3, eyeSize: 1.15, pupil: 0.55, browY: 0.9, mouthShape: "o", mouthW: 0.8, mouthOpen: 0.75, lean: -6, earDroop: -0.8, tuftDroop: -0.6, marks: { exclaim: 0.8 } },
    worried:       { eyeOpen: 1.05, pupil: 0.85, browAng: 0.95, browY: 0.3, mouthShape: "zig", mouthW: 0.7, mouthCurve: -0.4, tilt: -8, earDroop: 0.55, tremble: 0.25, bounce: 0.05, marks: { sweat: 1 } },
    sad:           { lidTop: 0.35, lidSlant: -0.55, browAng: 1.0, browY: -0.1, mouthCurve: -0.8, mouthW: 0.6, nod: 0.5, slump: 0.6, earDroop: 1, tuftDroop: 1, gy: -0.45, pupil: 1.2, bounce: 0, marks: { tear: 1 } },
    joyful:        { smileEye: 1, mouthShape: "open", mouthW: 1.25, mouthOpen: 0.7, mouthCurve: 1, blush: 0.5, bounce: 0.95, earDroop: -0.3, tuftDroop: -0.3, marks: { sparkle: 0.8 } },
    frustrated:    { lidTop: 0.28, lidSlant: 0.6, browAng: -0.8, browY: -0.35, mouthShape: "grit", mouthW: 0.95, mouthOpen: 0.15, mouthCurve: -0.2, tremble: 0.5, lean: 4, bounce: 0.08, earDroop: 0.3, marks: { vein: 1 } },
    skeptical:     { eyeOpen: 0.8, lidTop: 0.32, browAsym: 0.9, browY: 0.1, mouthShape: "flat", mouthW: 0.7, mouthSkew: 0.7, tilt: -10, gx: 0.85, bounce: 0.05, earDroop: 0.15 },
    proud:         { lidTop: 0.4, smileEye: 0.25, mouthShape: "curve", mouthW: 1.15, mouthCurve: 0.8, nod: -0.55, lean: -5, blush: 0.15, slump: -0.5, bounce: 0.15, earDroop: -0.5, tuftDroop: -0.5, marks: { sparkle: 0.35 } },
    embarrassed:   { eyeOpen: 0.7, blush: 1, gx: -0.7, gy: 0.6, mouthShape: "zig", mouthW: 0.55, mouthCurve: 0.05, browAng: 0.5, browY: 0.1, tilt: 8, nod: 0.3, slump: 0.25, earDroop: 0.5, bounce: 0.05, marks: { sweat: 0.6 } },
    scared:        { eyeOpen: 1.35, eyeSize: 1.2, pupil: 0.4, browAng: 0.9, browY: 0.85, mouthShape: "o", mouthW: 1.2, mouthOpen: 0.65, tremble: 1, lean: -9, earDroop: 1, tuftDroop: -0.7, bounce: 0, marks: { sweat: 1 } },
    delighted:     { smileEye: 0.65, eyeOpen: 1.1, mouthShape: "curve", mouthW: 1.4, mouthCurve: 1, blush: 0.75, bounce: 0.6, earDroop: -0.5, browY: 0.45, eyeFx: "sparkle", marks: { hearts: 0.25 } },
    thoughtful:    { eyeOpen: 0.95, lidTop: 0.1, gx: 0.55, gy: 0.65, browAsym: 0.45, browY: 0.15, mouthShape: "flat", mouthW: 0.4, mouthSkew: 0.4, tilt: 14, bounce: 0.05, marks: { dots: 1 } },
    angry:         { lidTop: 0.38, lidSlant: 1, browAng: -1, browY: -0.5, mouthShape: "grit", mouthW: 1.25, mouthOpen: 0.3, mouthCurve: -0.55, tremble: 0.6, lean: 8, nod: 0.3, blush: 0.35, earDroop: 0.7, tuftDroop: -0.8, marks: { vein: 1.4 } },
    sleepy:        { eyeOpen: 0.35, lidTop: 0.55, mouthShape: "yawn", mouthW: 0.8, mouthOpen: 0.95, nod: 0.6, slump: 0.5, tilt: 10, earDroop: 0.85, tuftDroop: 0.9, bounce: 0, marks: { zzz: 1 } },
    excited:       { eyeOpen: 1.25, eyeSize: 1.28, pupil: 1.25, browY: 0.7, mouthShape: "open", mouthW: 1.35, mouthOpen: 0.95, mouthCurve: 0.9, bounce: 1, blush: 0.3, earDroop: -1, tuftDroop: -1, eyeFx: "sparkle", marks: { sparkle: 1.1 } },
    confused:      { eyeOpen: 1, browAng: 0.5, browAsym: 0.9, mouthShape: "zig", mouthW: 0.85, mouthCurve: 0, mouthSkew: -0.4, tilt: -16, gx: 0.6, gy: 0.2, earDroop: 0.2, bounce: 0.1, marks: { question: 1.3, swirl: 0.3 } },
    determined:    { lidTop: 0.25, lidSlant: 0.5, browAng: -0.6, browY: -0.2, mouthShape: "flat", mouthW: 0.95, mouthCurve: 0.12, lean: 6, nod: 0.2, bounce: 0.04, earDroop: -0.2, tuftDroop: -0.4 },
    smug:          { eyeOpen: 0.8, lidTop: 0.42, lidSlant: 0.1, browY: 0.15, browAsym: 0.5, mouthShape: "smirk", mouthW: 1, mouthSkew: 0.95, mouthCurve: 0.6, nod: -0.4, tilt: 6, gx: 0.4, bounce: 0.08 },
    relieved:      { smileEye: 0.7, mouthShape: "o", mouthW: 0.55, mouthOpen: 0.35, slump: 0.55, nod: 0.4, blush: 0.12, earDroop: 0.35, bounce: 0.05, marks: { sweat: 0.55 } },
    disgusted:     { eyeOpen: 0.6, lidTop: 0.35, lidSlant: 0.3, browAng: -0.5, browY: -0.2, mouthShape: "tongue", mouthW: 0.9, mouthOpen: 0.4, mouthCurve: -0.5, lean: -6, tilt: -10, earDroop: 0.5, bounce: 0.03 },
    shy:           { eyeOpen: 0.8, blush: 0.95, gx: -0.8, gy: 0.5, mouthShape: "flat", mouthW: 0.35, mouthCurve: 0.3, tilt: 12, nod: 0.3, slump: 0.2, earDroop: 0.4, bounce: 0.1 },
    hopeful:       { eyeOpen: 1.15, eyeSize: 1.2, pupil: 1.3, gy: 0.55, browAng: 0.7, browY: 0.5, mouthShape: "curve", mouthW: 0.7, mouthCurve: 0.55, tilt: 6, lean: -2, earDroop: -0.4, blush: 0.2, bounce: 0.2, marks: { sparkle: 0.4 } },
    disappointed:  { lidTop: 0.3, lidSlant: -0.3, browAng: 0.6, mouthShape: "curve", mouthCurve: -0.5, mouthW: 0.8, nod: 0.45, slump: 0.4, gy: -0.4, earDroop: 0.6, tuftDroop: 0.5, bounce: 0 },
    amused:        { smileEye: 0.5, lidBot: 0.3, mouthShape: "cat", mouthW: 1.1, mouthOpen: 0.2, mouthCurve: 0.7, blush: 0.2, bounce: 0.45, tilt: 5, earDroop: -0.2 },
    bored:         { eyeOpen: 0.55, lidTop: 0.45, mouthShape: "flat", mouthW: 0.6, mouthCurve: -0.05, tilt: 15, slump: 0.5, nod: 0.3, gx: 0.85, bounce: 0, earDroop: 0.5, tuftDroop: 0.4 },
    suspicious:    { eyeOpen: 0.7, lidTop: 0.35, lidSlant: 0.35, pupil: 0.8, browAng: -0.35, browAsym: 0.6, gx: -0.85, mouthShape: "flat", mouthW: 0.8, mouthSkew: -0.5, lean: 4, tilt: 4, bounce: 0.04 },
    adoring:       { eyeOpen: 1.15, eyeSize: 1.3, eyeFx: "heart", mouthShape: "curve", mouthW: 0.7, mouthCurve: 0.75, mouthOpen: 0.1, blush: 0.95, tilt: 10, bounce: 0.5, earDroop: -0.2, marks: { hearts: 1 } },
    shocked:       { eyeOpen: 1.4, eyeSize: 1.32, pupil: 0.3, browY: 1, mouthShape: "o", mouthW: 0.9, mouthOpen: 1, lean: -11, squash: 0.1, tremble: 0.35, earDroop: -1, tuftDroop: -1, bounce: 0, marks: { exclaim: 1.4 } },
    mischievous:   { lidTop: 0.15, lidSlant: 0.45, browAng: -0.4, browAsym: 0.5, mouthShape: "cat", mouthW: 1.35, mouthOpen: 0.35, mouthCurve: 0.9, mouthSkew: 0.5, blush: 0.1, lean: 6, tilt: -8, bounce: 0.6, earDroop: -0.3 },
    dizzy:         { eyeFx: "spiral", eyeOpen: 1.1, mouthShape: "zig", mouthW: 0.8, mouthOpen: 0.2, mouthCurve: 0, tilt: 18, tremble: 0.4, nod: 0.3, earDroop: 0.5, bounce: 0, marks: { swirl: 1 } },
  };
  var EMOTION_NAMES = Object.keys(EMO);
  function emotionParams(name) {
    var src = EMO[name] || EMO.calm, o = {}, k;
    for (k in DEF) o[k] = DEF[k];
    for (k in src) if (k !== "marks") o[k] = src[k];
    o.marks = {};
    for (k in (src.marks || {})) o.marks[k] = src.marks[k];
    return o;
  }

  // ------------------------------------------------------------------ canon
  var VIEWS = ["front", "quarter", "side", "back-quarter", "back"];
  // fixed traits the runtime can actually draw, matched in words. Every identity's fixed_traits must resolve to a feature
  var TRAIT_FEATURES = [
    { re: /round\s+ears?|ears?\s+round/i, feature: "ears.round" },
    { re: /(single|one)\s+(curved\s+)?tuft|curved\s+tuft/i, feature: "tuft.single" },
    { re: /(two|2)\s+short\s+legs?|short\s+legs?/i, feature: "legs.two-short" },
    { re: /cream\s+(belly|tummy)|belly\s+patch/i, feature: "belly.patch" },
    { re: /cream\s+(tail|pom)|tail\s+(pom|tip)|round\s+tail/i, feature: "tail.pom" },
    { re: /cream\s+(mittens?|paws?|hands?)|mittens?/i, feature: "hands.mitten" },
    { re: /muzzle/i, feature: "face.muzzle" },
    { re: /(two\s+)?(cream\s+)?(dorsal|back)\s+spots?/i, feature: "back.spots" },
  ];
  var RIG_FEATURES = ["ears.round", "tuft.single", "legs.two-short", "belly.patch", "tail.pom", "hands.mitten", "face.muzzle", "back.spots"];
  function traitFeatures(traits) {
    var found = [], unknown = [];
    (traits || []).forEach(function (t) {
      var hit = TRAIT_FEATURES.filter(function (x) { return x.re.test(String(t)); });
      if (hit.length) hit.forEach(function (h) { if (found.indexOf(h.feature) < 0) found.push(h.feature); });
      else unknown.push(String(t));
    });
    return { features: found, unknown: unknown };
  }

  var PROP_DEFAULT = { body_w: 10, body_h: 8, head_w: 11.2, head_h: 9.2, eye_sep: 3.4, leg_len: 2, arm_len: 5, ear_r: 1.9, tuft_h: 3 };
  function rigOf(canon) {
    var p = Object.assign({}, PROP_DEFAULT, (canon && canon.proportions) || {});
    var pal = (canon && canon.palette) || {};
    var body = pal.body || "#c97057", outline = pal.outline || "#302921", accent = pal.accent || "#f3d79e";
    return {
      Rb: { x: p.body_w / 2, y: p.body_h / 2, z: p.body_w / 2 * 0.88 }, Rh: { x: p.head_w / 2, y: p.head_h / 2, z: p.head_w / 2 * 0.9 },
      eyeSep: p.eye_sep, legLen: p.leg_len, armLen: p.arm_len, earR: p.ear_r, tuftH: p.tuft_h,
      colors: {
        body: body, outline: outline, accent: accent,
        bodyDark: pal.body_dark || B.hex(B.shade(body, 0.78)), paw: pal.paw || B.hex(B.mixc(outline, body, 0.28)), earIn: pal.ear_inner || B.hex(B.mixc(accent, "#e8a09a", 0.55)),
        eyeWhite: pal.eye_white || "#fffaf0", pupil: pal.pupil || outline, blush: pal.blush || "#e8837a", mouthIn: pal.mouth || "#7a2f33", tongue: "#e66f7c",
      },
    };
  }

  // ------------------------------------------------------------------ geometry
  // sphere math: a point on an ellipsoid by face-plane coordinates (fx right, fy up, in u) under a yaw (deg)
  function ellProject(R, cx, cy, fx, fy, psi, bump) {
    // fx, fy in u on the surface plane; (phi, e) on the ellipsoid
    var e = Math.asin(Math.max(-0.999, Math.min(0.999, fy / R.y))), ce = Math.cos(e);
    var s = Math.max(-0.999, Math.min(0.999, fx / (R.x * ce))), phi = Math.asin(s);
    var m = 1 + (bump || 0);
    var a = phi + psi * D2R;
    if (Math.cos(a) < 0) a = (Math.sin(a) >= 0 ? 1 : -1) * Math.PI / 2; // behind the horizon: pin to the horizon line
    var X = R.x * ce * Math.sin(phi) * m, Z = R.z * ce * Math.cos(phi) * m, Y = R.y * Math.sin(e) * m;
    var ps = psi * D2R, sx = X * Math.cos(ps) + Z * Math.sin(ps), dz = -X * Math.sin(ps) + Z * Math.cos(ps);
    if (dz < 0) { var w = R.x * ce * m * Math.sqrt(Math.pow(Math.cos(ps), 2) + Math.pow(R.z / R.x * Math.sin(ps), 2)); sx = Math.sign(sx || 1) * w; dz = 0; }
    return [cx + sx, cy - Y, dz];
  }
  function silhouette(R, cx, cy, psi, n, bulge) {
    var ps = psi * D2R, wx = Math.sqrt(Math.pow(R.x * Math.cos(ps), 2) + Math.pow(R.z * Math.sin(ps), 2)), pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU - Math.PI / 2, s = Math.sin(a), c = Math.cos(a);
      pts.push([cx + wx * c * (1 + (bulge || 0) * s), cy + R.y * s * (1 + (bulge || 0) * 0.25 * Math.max(0, s))]);
    }
    return pts;
  }
  // a point attached to an ellipsoid in 3D (X right at yaw 0, Y up, Z toward the viewer at yaw 0), rotated by yaw
  function pt3(cx, cy, X, Yup, Z, psi) {
    var ps = psi * D2R;
    return [cx + X * Math.cos(ps) + Z * Math.sin(ps), cy - Yup, -X * Math.sin(ps) + Z * Math.cos(ps)];
  }
  function viewName(yaw) { return VIEWS[Math.round(Math.abs(yaw) / 45)] || "front"; }
  // where a foot rests, in u from the actor's floor point, for a body at this yaw (stagger so a profile has two feet)
  function footOffset(yaw, side) {
    var ps = yaw * D2R, X = side === "L" ? 2.4 : -2.4, Z = side === "L" ? 0.9 : -0.7;
    return X * Math.cos(ps) + Z * Math.sin(ps);
  }
  function footDepth(yaw, side) { var ps = yaw * D2R, X = side === "L" ? 2.4 : -2.4, Z = side === "L" ? 0.9 : -0.7; return -X * Math.sin(ps) + Z * Math.cos(ps); }

  // ------------------------------------------------------------------ a rest pose (the sheet and the fallbacks use it)
  function restPose(id, o) {
    o = o || {};
    var u = o.u || 22, emo = emotionParams(o.emotion || "calm");
    var yaw = o.yaw || 0;
    return {
      id: id, t: o.t || 0, u: u, root: { x: o.x || 960, y: o.y || 900 }, lift: 0, sy: 1, sx: 1, lean: emo.lean, dx: 0, tuck: 0, stride: 0,
      yawBody: yaw, yawHead: o.yawHead != null ? o.yawHead : yaw, hTilt: emo.tilt, hNod: emo.nod * 0.9, hDx: 0, gaze: { x: o.gx || 0, y: o.gy || 0 }, blink: 0,
      ear: { L: emo.earDroop * 38, R: emo.earDroop * 38 }, tuft: emo.tuftDroop * 30, tail: 0,
      arms: { L: { angle: 14, reach: 0.82, ik: null }, R: { angle: 14, reach: 0.82, ik: null } },
      emotion: emo, emotionName: o.emotion || "calm", emoAge: 9, eyePop: 0, hold: null, calm: 1,
      feet: { L: { x: (o.x || 960) + footOffset(yaw, "L") * u, y: o.y || 900, planted: true, lift: 0 }, R: { x: (o.x || 960) + footOffset(yaw, "R") * u, y: o.y || 900, planted: true, lift: 0 } },
    };
  }

  // ------------------------------------------------------------------ the rig: a pose -> paintable items
  // rig(actor, pose, env) -> { items: [{ z, kind, ... }], bounds, hands: {L,R}, head: [x,y], feet }
  //   actor: { id, canon, rig (rigOf(canon)), seedKey }, env: { look, k (ink scale), props (held prop offsets), partDepth }
  function rig(actor, pose, env) {
    var rg = actor.rig || rigOf(actor.canon), Cc = rg.colors, u = pose.u, items = [];
    var ink = Cc.outline;
    var yb = pose.yawBody, yh = pose.yawHead, em = pose.emotion;
    var base = [pose.root.x, pose.root.y];
    var lean = pose.lean * D2R, sx = pose.sx, sy = pose.sy;
    var hipPivot = [0, -3];
    // body-local -> world, with the pose's squash, lean, shift and lift
    function B_(p) {
      var x = p[0] * sx, y = hipPivot[1] + (p[1] - hipPivot[1]) * sy;
      var c = Math.cos(lean), s = Math.sin(lean), dx = x, dy = y - hipPivot[1];
      var rx = dx * c - dy * s, ry = dx * s + dy * c;
      return [base[0] + (rx + pose.dx) * u, base[1] + (ry + hipPivot[1] - pose.lift) * u];
    }
    function mapPts(pts, f) { return pts.map(function (p) { var q = f(p); return q; }); }
    // the head: tilt about the neck, nod down, shift
    var tilt = pose.hTilt * D2R, neck = [0, -8.6];
    var hc = [pose.hDx + Math.sin(tilt) * 2.9, -11.5 + pose.hNod - (1 - Math.cos(tilt)) * 2.9 + (sy - 1) * -3.2];
    var hsx = 1 + (sx - 1) * 0.5, hsy = 1 + (sy - 1) * 0.5;
    function H_(p) { // head-local (centred on the head, y down) -> world
      var x = p[0] * hsx, y = p[1] * hsy, c = Math.cos(tilt), s = Math.sin(tilt);
      return B_([hc[0] + x * c - y * s, hc[1] + x * s + y * c]);
    }
    var Rb = rg.Rb, Rh = rg.Rh, bodyC = [0, -6.2];
    var seed = actor.seedKey || actor.id;
    var part = function (name, o) {
      o.name = name; o.seedKey = seed + ":" + name; o.kind = o.kind || "part"; items.push(o); return o;
    };
    var Z0 = 0; // z within the actor: grows by draw order, written at the end
    var amp = u * 0.09;

    // --- feet (world positions come from the foot schedule: planted feet never slide)
    var feetItems = {};
    ["L", "R"].forEach(function (side) {
      var f = pose.feet[side], sgn = side === "L" ? 1 : -1;
      var hip3 = pt3(0, 0, sgn * 2.5, 0, 0.3, yb), hipW = B_([hip3[0], -2.3]);
      var dz = footDepth(yb, side);
      var fwd = Math.sin(yb * D2R), absS = Math.abs(Math.sin(yb * D2R)), fl = (yb >= 0 ? 1 : 1);
      var fx = f.x, fy = f.y - f.lift - (pose.lift && f.air ? pose.lift * u : 0);
      var air = f.air ? pose.tuck * 0.9 * u : 0;
      var ankle = [fx, fy - 0.7 * u - air];
      var mid = [(hipW[0] + ankle[0]) / 2 + sgn * 0.35 * u * (1 - absS), (hipW[1] + ankle[1]) / 2];
      var legPts = B.bezier(hipW, mid, ankle, 9);
      var leg = B.ribbonPoly(legPts, 2.2 * u, 1.9 * u);
      var footRx = (1.55 + 0.9 * absS) * u, footRy = 1.0 * u, fcx = fx + (Math.sin(yb * D2R) * 0.55 * u), fcy = fy - 0.35 * u - air;
      var rot = f.planted ? 0 : -0.25 * Math.sign(fwd || 1) * (f.lift > 0 ? 1 : 0);
      var foot = B.ellipse(fcx, fcy, footRx, footRy, rot, 24);
      feetItems[side] = { dz: dz };
      part("leg" + side, { pts: leg, color: Cc.bodyDark, amp: amp * 0.55, ink: true, inkW: 2.4, depth: dz - 5, shadeDark: 0.2 });
      part("foot" + side, { pts: foot, color: Cc.paw, amp: amp * 0.45, ink: true, inkW: 2.4, depth: dz - 4.9, edge: 0.15, shadeLight: 0.28 });
    });

    // --- the tail pom (cream tip): behind the body when it is behind it
    if (true) {
      var ta = pose.tail * D2R, tp = pt3(0, 0, Math.sin(ta) * 4.4, 0, -Math.cos(ta) * (Rb.z + 0.35), yb);
      var tw = B_([tp[0], -3.9]), depthT = tp[2];
      var tailPts = B.ellipse(tw[0], tw[1], 1.6 * u, 1.45 * u, 0, 22);
      part("tail", { pts: tailPts, color: Cc.accent, amp: amp * 0.4, ink: true, inkW: 2.4, depth: depthT < 0 ? -3 : 3.5, edge: 0.2 });
    }

    // --- the body (pear-shaped ellipsoid)
    var bodyW = B_(bodyC), bodySil;
    (function () {
      var sil = silhouette(Rb, 0, -6.2, yb, 36, 0.12);
      bodySil = sil.map(B_);
    })();
    part("body", { pts: bodySil, color: Cc.body, amp: amp, ink: true, inkW: 3, depth: 0, hatch: 7, hatchDir: 0.6 });
    // belly patch (front surfaces) or dorsal spots (back surfaces), clipped to the body
    (function () {
      var bsil = bodySil;
      var patch = [];
      for (var i = 0; i < 22; i++) { var a = (i / 22) * TAU; patch.push(ellProject(Rb, 0, -6.2, 3.1 * Math.cos(a), -0.9 + 2.9 * Math.sin(a), yb, 0.03)); }
      var vis = patch.filter(function (p) { return p[2] > 0.1; }).length;
      if (vis > 6) part("belly", { pts: patch.map(function (p) { return B_([p[0], p[1]]); }), color: Cc.accent, amp: amp * 0.7, ink: false, depth: 0.2, clip: bsil, edge: 0.18, under: 0.9 });
      // two dorsal spots on the back surface (the front surface rotated by 180 degrees)
      [[-1.5, 1.0, 1.0], [1.7, -0.9, 0.8]].forEach(function (s, i) {
        var poly3 = [];
        for (var j2 = 0; j2 < 16; j2++) { var a3 = (j2 / 16) * TAU; poly3.push(ellProject(Rb, 0, -6.2, s[0] + s[2] * Math.cos(a3), s[1] + s[2] * 0.9 * Math.sin(a3) + 0.5, yb + 180, 0.03)); }
        if (poly3.filter(function (p) { return p[2] > 0.1; }).length > 8) part("spot" + i, { pts: poly3.map(function (p) { return B_([p[0], p[1]]); }), color: Cc.accent, amp: amp * 0.5, ink: false, depth: 0.2, clip: bsil, edge: 0.15, under: 0.88 });
      });
    })();

    // --- arms
    var shoulderUp = -8.4;
    var hands = {};
    ["L", "R"].forEach(function (side) {
      var sgn = side === "L" ? 1 : -1, ps = yb * D2R;
      var sh3 = pt3(0, 0, sgn * (Rb.x * 0.93), 0, 0, yb), shW = B_([sh3[0], shoulderUp]), depth = sh3[2];
      var arm = pose.arms[side], ik = arm.ik;
      var outX = Math.abs(sh3[0]) > 0.9 ? Math.sign(sh3[0]) : (Math.sin(ps) >= 0 ? 1 : -1) * (side === "L" ? 1 : 0.55);
      if (Math.abs(sh3[0]) <= 0.9) outX = (Math.sin(ps) >= 0 ? 1 : -1);
      var L1 = rg.armLen * 0.52, L2 = rg.armLen * 0.48, tot = (L1 + L2) * u;
      var ang = arm.angle * D2R, reach = arm.reach;
      var fk = [shW[0] + outX * Math.sin(ang) * reach * tot, shW[1] + Math.cos(ang) * reach * tot];
      var tgt = fk, wIK = 0, shape = "mitt";
      if (ik) {
        var wt;
        if (ik.world) wt = ik.world; else wt = null;
        var loc = ik.local ? B_([ik.local[0], ik.local[1]]) : null;
        if (ik.local && !ik.world) wt = loc;
        else if (ik.local && ik.world) wt = [ik.world[0] + (loc[0] - ik.world[0]) * (ik.mixLocal || 0), ik.world[1] + (loc[1] - ik.world[1]) * (ik.mixLocal || 0)];
        wIK = Math.min(1, ik.w || 0); tgt = [fk[0] + (wt[0] - fk[0]) * wIK, fk[1] + (wt[1] - fk[1]) * wIK]; shape = ik.shape || "mitt";
      }
      var dx = tgt[0] - shW[0], dy = tgt[1] - shW[1], d = Math.hypot(dx, dy) || 1e-3, l1 = L1 * u, l2 = L2 * u;
      var dc = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), (l1 + l2) * 0.999);
      var a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      var ux = dx / d, uy = dy / d, px = -uy, py = ux;
      var e1 = [shW[0] + ux * a + px * h, shW[1] + uy * a + py * h], e2 = [shW[0] + ux * a - px * h, shW[1] + uy * a - py * h];
      var pick = (e1[0] - shW[0]) * outX >= (e2[0] - shW[0]) * outX ? e1 : e2;
      if (ik && ik.bend) pick = (ik.bend > 0 ? e1 : e2);
      var hand = [shW[0] + ux * Math.min(d, dc), shW[1] + uy * Math.min(d, dc)];
      if (d > (l1 + l2) * 0.999) hand = [shW[0] + ux * (l1 + l2) * 0.999, shW[1] + uy * (l1 + l2) * 0.999];
      var armPts = B.ribbonPoly(B.bezier(shW, pick, hand, 10), 2.3 * u, 1.75 * u);
      var fa = Math.atan2(hand[1] - pick[1], hand[0] - pick[0]);
      var handPts;
      var hr = 1.35 * u;
      if (shape === "open") handPts = B.ellipse(hand[0] + Math.cos(fa) * 0.4 * u, hand[1] + Math.sin(fa) * 0.4 * u, 1.65 * u, 1.45 * u, fa, 22);
      else if (shape === "closed") handPts = B.ellipse(hand[0], hand[1], 1.15 * u, 1.1 * u, fa, 20);
      else handPts = B.ellipse(hand[0] + Math.cos(fa) * 0.3 * u, hand[1] + Math.sin(fa) * 0.3 * u, hr, hr * 0.92, fa, 22);
      var armDepth = depth > -0.15 * Rb.x ? 1 : -4;
      if (pose.hold && pose.hold.w > 0.4 && (pose.hold.hand === side || pose.hold.hand === "both")) armDepth = 1;
      part("arm" + side, { pts: armPts, color: Cc.body, amp: amp * 0.5, ink: true, inkW: 2.6, depth: armDepth, shadeDark: 0.2, edge: 0.25 });
      part("hand" + side, { pts: handPts, color: Cc.accent, amp: amp * 0.35, ink: true, inkW: 2.4, depth: armDepth + 0.01, edge: 0.18 });
      if (shape === "point") {
        var fp = [hand[0] + Math.cos(fa) * 1.6 * u, hand[1] + Math.sin(fa) * 1.6 * u];
        part("finger" + side, { pts: B.ellipse(fp[0], fp[1], 0.95 * u, 0.5 * u, fa, 16), color: Cc.accent, amp: amp * 0.25, ink: true, inkW: 2.2, depth: armDepth + 0.02, edge: 0.15 });
      } else if (shape === "open") {
        for (var q = -1; q <= 1; q++) { var fq = fa + q * 0.55, pp = [hand[0] + Math.cos(fq) * 1.9 * u, hand[1] + Math.sin(fq) * 1.9 * u]; part("finger" + side + q, { pts: B.ellipse(pp[0], pp[1], 0.55 * u, 0.4 * u, fq, 12), color: Cc.accent, amp: amp * 0.2, ink: true, inkW: 2, depth: armDepth + 0.02 }); }
      } else {
        var th = [hand[0] + Math.cos(fa - 1.4 * sgn) * 1.0 * u, hand[1] + Math.sin(fa - 1.4 * sgn) * 1.0 * u];
        part("thumb" + side, { pts: B.ellipse(th[0], th[1], 0.5 * u, 0.42 * u, fa, 12), color: Cc.accent, amp: amp * 0.2, ink: true, inkW: 2, depth: armDepth + 0.02 });
      }
      hands[side] = { x: hand[0], y: hand[1], angle: fa, depth: armDepth };
    });

    // --- head: ears (round spheres on the head), then the silhouette, then the face, then the tuft
    var headSilPts = silhouette(Rh, 0, 0, yh, 40, 0).map(H_);
    var ears = {};
    ["L", "R"].forEach(function (side) {
      var sgn = side === "L" ? 1 : -1, droop = pose.ear[side] * D2R;
      var phi = (63 * D2R) * sgn + sgn * droop * 0.55, el = 48 * D2R - droop * 0.95;
      var X = Rh.x * Math.cos(el) * Math.sin(phi) * 1.07, Z = Rh.z * Math.cos(el) * Math.cos(phi) * 1.07, Yu = Rh.y * Math.sin(el) * 1.07;
      var p3 = pt3(0, 0, X, Yu, Z, yh), c = H_([p3[0], p3[1]]);
      var r = rg.earR * u, flop = 1 + 0.1 * Math.abs(droop);
      var e = B.ellipse(c[0], c[1], r, r * flop, droop * sgn * 0.6, 22);
      var depth = p3[2] > Rh.z * 0.28 ? 6 : -2;
      part("ear" + side, { pts: e, color: Cc.body, amp: amp * 0.5, ink: true, inkW: 2.8, depth: depth, edge: 0.3, shadeDark: 0.2 });
      // inner ear: a smaller disc on the outward face of the ear sphere
      var nxo = Math.sin(phi) * Math.cos(el), nzo = Math.cos(phi) * Math.cos(el), nyo = Math.sin(el);
      var nrot = -nxo * Math.sin(yh * D2R) + nzo * Math.cos(yh * D2R), nsx = nxo * Math.cos(yh * D2R) + nzo * Math.sin(yh * D2R);
      if (nrot > -0.1) {
        var ic = [c[0] + nsx * r * 0.34, c[1] - nyo * r * 0.2 + r * 0.05], iw = r * 0.62 * Math.max(0.4, nrot + 0.3);
        part("earIn" + side, { pts: B.ellipse(ic[0], ic[1], iw, r * 0.62, droop * sgn * 0.6, 16), color: Cc.earIn, amp: amp * 0.25, ink: false, depth: depth + 0.01, clip: e, edge: 0.1, under: 0.95, shadeLight: 0.1 });
      }
      ears[side] = c;
    });
    part("head", { pts: headSilPts, color: Cc.body, amp: amp, ink: true, inkW: 3, depth: 4, hatch: 8, hatchDir: 0.6 });
    var headC = H_([0, 0]);

    // --- the face (hidden on the back views by the horizon: nothing is faked there)
    var face = function (name, fpts, o) { // fpts in face-plane u relative to the head centre
      var proj = fpts.map(function (p) { return ellProject(Rh, 0, 0, p[0], -p[1], yh, o.bump || 0); });
      var vis = proj.filter(function (p) { return p[2] > 0.15; }).length;
      if (vis < Math.max(3, fpts.length * 0.4)) return null;
      var pts = proj.map(function (p) { return H_([p[0], p[1]]); });
      o.pts = pts; o.clip = headSilPts; o.depth = o.depth != null ? o.depth : 5; o.amp = o.amp != null ? o.amp : amp * 0.3;
      return part(name, o);
    };
    var prof = Math.abs(Math.abs(yh) - 90) < 1, ps_ = yh >= 0 ? 1 : -1;
    if (prof) profileFace(); else genericFace();
    // the profile is its own drawing: one near eye, the snout bump in the silhouette, the mouth under it
    function profileFace() {
      var s = ps_, size = em.eyeSize, openB = Math.max(0, em.eyeOpen + pose.eyePop) * (1 - pose.blink * 0.97);
      var local = function (pts) { return pts.map(function (p) { return H_(p); }); };
      var dpart = function (name, pts, o) { o.pts = local(pts); o.depth = o.depth != null ? o.depth : 5; o.amp = o.amp != null ? o.amp : amp * 0.3; return part(name, o); };
      var dline = function (name, pts, o) { return part(name, { kind: "line", pts: local(pts), color: o.color || ink, width: (o.width || 3) * (env.k || 1), depth: o.depth || 5.8, clip: o.clip === null ? null : (o.clip || headSilPts), amp: amp * (o.amp != null ? o.amp : 0.14), taper: o.taper }); };
      var ell = function (cx, cy, rx, ry, n) { var p = []; for (var i = 0; i < (n || 20); i++) { var a = (i / (n || 20)) * TAU; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return p; };
      if (em.blush > 0.03) dpart("blush", ell(s * 2.5, 1.9, 1.15, 0.75), { color: Cc.blush, ink: false, depth: 5.2, under: 0.12 + 0.5 * Math.min(1, em.blush), edge: 0, wash: 0.5, clip: headSilPts });
      dpart("snout", ell(s * 5.15, 2.45, 1.95, 1.62, 24), { color: Cc.accent, ink: true, inkW: 2.4, depth: 5.1, edge: 0.18, under: 0.97, amp: amp * 0.4 });
      dpart("nose", ell(s * 6.55, 1.85, 0.8, 0.62, 14), { color: Cc.outline, ink: false, depth: 5.3, edge: 0, wash: 0.2, amp: amp * 0.15 });
      var ex = s * 2.75, ey2 = -0.35, rw = 0.98 * size, rh = 1.65 * size * Math.min(1.5, openB);
      if (em.smileEye > 0.5 && pose.blink < 0.5) { var ar = []; for (var i = 0; i <= 10; i++) { var u2 = i / 10 * 2 - 1; ar.push([ex + u2 * rw * 1.05, ey2 + 0.55 - (0.55 + 0.4 * em.smileEye) * (1 - u2 * u2)]); } dline("eyeArc", ar, { width: 3.6 }); }
      else if (openB < 0.14) { var ar2 = []; for (var i2 = 0; i2 <= 8; i2++) { var u3 = i2 / 8 * 2 - 1; ar2.push([ex + u3 * rw, ey2 + 0.15 + 0.3 * (1 - u3 * u3)]); } dline("eyeShut", ar2, { width: 3.4 }); }
      else {
        var ew = dpart("eyeW", ell(ex, ey2, rw, rh, 22), { color: Cc.eyeWhite, ink: true, inkW: 2.6, depth: 5.4, edge: 0.2, under: 0.98, amp: amp * 0.25, clip: headSilPts });
        var gxo = Math.max(-0.5 * rw, Math.min(0.5 * rw, (pose.gaze.x * 0.42 + em.gx * 0.4) * rw)) + s * 0.15, gyo = Math.max(-0.5 * rh, Math.min(0.5 * rh, (pose.gaze.y * 0.5 - em.gy * 0.36) * rh)), pr = 0.78 * em.pupil * size;
        if (em.eyeFx === "spiral") { var sp = []; for (var q = 0; q <= 40; q++) { var th = q / 40 * Math.PI * 5.5, rr = (q / 40) * 0.95 * rw; sp.push([ex + gxo + rr * Math.cos(th), ey2 + gyo + rr * Math.sin(th) * (rh / rw)]); } dline("pupil", sp, { width: 2.4, depth: 5.6, amp: 0.1, clip: ew.pts }); }
        else { dpart("pupil", ell(ex + gxo, ey2 + gyo, pr * 0.72, pr * 1.05, 16), { color: em.eyeFx === "heart" ? "#e0455f" : Cc.pupil, ink: false, depth: 5.6, amp: amp * 0.12, wash: 0.25, under: 1, clip: ew.pts }); dpart("glint", ell(ex + gxo - pr * 0.22, ey2 + gyo - pr * 0.4, 0.26 * size, 0.26 * size, 10), { color: "#ffffff", ink: false, depth: 5.7, amp: 0, wash: 0, under: 0.95, clip: ew.pts }); }
        if (em.lidTop > 0.02 || Math.abs(em.lidSlant) > 0.02) {
          var yTop = ey2 - rh + em.lidTop * rh * 2 * 0.62, sl = em.lidSlant * 0.3 * rh, xi = ex - s * rw * 1.12, xo = ex + s * rw * 1.12, lid = [];
          for (var j = 0; j <= 8; j++) lid.push([xi + (xo - xi) * j / 8, yTop + sl - 2 * sl * j / 8]);
          var edge = lid.slice(); lid.push([xo, ey2 - rh - 1.2], [xi, ey2 - rh - 1.2]);
          dpart("lid", lid, { color: Cc.body, ink: false, depth: 5.8, clip: ew.pts, edge: 0, amp: 0, under: 1, wash: 0 }); dline("lidEdge", edge, { width: 2.8, depth: 5.9, amp: 0, clip: ew.pts });
        }
      }
      var by = ey2 - 2.15 - em.browY * 0.8, bp = []; for (var k2 = 0; k2 <= 8; k2++) { var u4 = k2 / 8 * 2 - 1, inner = -u4; bp.push([s * 2.75 + u4 * 1.3 * s, by - em.browArch * 0.55 * (1 - u4 * u4) - inner * em.browAng * 0.6 * (inner > 0 ? 1 : 0.35)]); }
      dline("brow", bp, { width: 3.8, depth: 5.9, taper: [0.15, 0.4], amp: 0.18 });
      // the mouth runs back from under the snout
      var shape = em.mouthShape, mp = [];
      if (shape === "curve" || shape === "smirk" || shape === "flat" || shape === "zig" || shape === "cat") {
        for (var m = 0; m <= 10; m++) { var t3 = m / 10, wob = shape === "zig" ? (m % 2 ? 0.25 : -0.25) : shape === "cat" ? 0.3 * Math.abs(Math.sin(Math.PI * t3 * 2)) : 0; mp.push([s * (5.7 - 2.9 * t3 * em.mouthW), 3.45 - 0.0 - em.mouthCurve * 0.6 * t3 * t3 + wob]); }
        dline("mouth", mp, { width: 3.2, depth: 5.5, clip: null, amp: 0.1 });
      } else {
        var oh = (shape === "o" ? 0.55 : 0.4) + em.mouthOpen * 1.3, ow = (shape === "o" ? 0.62 : 0.95) * em.mouthW, mm = [];
        for (var q2 = 0; q2 < 20; q2++) { var a2 = (q2 / 20) * TAU; mm.push([s * (5.2 - ow * 0.2) + ow * Math.cos(a2) * s, 3.7 + oh / 2 - 0.1 + oh / 2 * Math.sin(a2)]); }
        dpart("mouth", mm, { color: Cc.mouthIn, ink: true, inkW: 2.6, depth: 5.5, edge: 0.12, amp: amp * 0.15, under: 1, wash: 0.25, clip: null });
      }
    }
    function genericFace() {
      // cheeks
      var ey = -0.35, sep = rg.eyeSep * em.eyeSep * 0.5;
      if (em.blush > 0.03) [1, -1].forEach(function (sg) {
        var pts = []; for (var i = 0; i < 18; i++) { var a = (i / 18) * TAU; pts.push([sg * (sep + 1.6) + 1.2 * Math.cos(a), 1.9 + 0.72 * Math.sin(a)]); }
        face("blush" + sg, pts, { color: Cc.blush, ink: false, depth: 5.2, under: 0.12 + 0.52 * Math.min(1, em.blush), edge: 0, wash: 0.5 });
      });
      // the muzzle: a cream bump (the profile's nose, the front's mouth patch)
      (function () {
        var pts = []; for (var i = 0; i < 26; i++) { var a = (i / 26) * TAU; pts.push([2.55 * Math.cos(a), 2.5 + 1.95 * Math.sin(a)]); }
        var proj = pts.map(function (p) { var dist = Math.min(1, Math.hypot(p[0] / 2.55, (p[1] - 2.5) / 1.95)); return ellProject(Rh, 0, 0, p[0], -p[1], yh, 0.17 * (1 - dist * dist) + 0.015); });
        var vis = proj.filter(function (p) { return p[2] > 0.1; }).length;
        if (vis >= 10) part("muzzle", { pts: proj.map(function (p) { return H_([p[0], p[1]]); }), color: Cc.accent, amp: amp * 0.4, ink: true, inkW: 2.2, depth: 5.1, edge: 0.18, under: 0.96 });
      })();
      // nose
      (function () {
        var pts = []; for (var i = 0; i < 16; i++) { var a = (i / 16) * TAU; pts.push([0.85 * Math.cos(a), 1.2 + 0.58 * Math.sin(a)]); }
        var proj = pts.map(function (p) { return ellProject(Rh, 0, 0, p[0], -p[1], yh, 0.22); });
        if (proj.filter(function (p) { return p[2] > 0.1; }).length >= 10) part("nose", { pts: proj.map(function (p) { return H_([p[0], p[1]]); }), color: Cc.outline, amp: amp * 0.2, ink: false, depth: 5.3, edge: 0, wash: 0.2 });
      })();
      // eyes
      var openBase = Math.max(0, em.eyeOpen + pose.eyePop) * (1 - pose.blink * 0.97), size = em.eyeSize;
      var inkW = function (w) { return w * (env.k || 1); };
      var lineItem = function (name, fp, o) { // an inked line drawn in face-plane points (y down)
        var proj = fp.map(function (p) { return ellProject(Rh, 0, 0, p[0], -p[1], yh, o.bump || 0.03); });
        if (proj.filter(function (p) { return p[2] > 0.15; }).length < Math.max(3, fp.length * 0.5)) return null;
        return part(name, { kind: "line", pts: proj.map(function (p) { return H_([p[0], p[1]]); }), color: o.color || ink, width: inkW(o.width || 3), depth: o.depth || 5.8, clip: headSilPts, amp: amp * (o.amp != null ? o.amp : 0.14), taper: o.taper });
      };
      [1, -1].forEach(function (sg) {
        var cx = sg * sep, cy = ey, rw = 1.3 * size, rh = 1.65 * size * Math.min(1.5, openBase), fx = em.eyeFx;
        if (em.smileEye > 0.5 && pose.blink < 0.5) { // a happy arc: ^ ^
          var arc = []; for (var i = 0; i <= 12; i++) { var s = i / 12 * 2 - 1; arc.push([cx + s * rw * 1.05, cy + 0.55 - (0.55 + 0.4 * em.smileEye) * (1 - s * s)]); }
          lineItem("eyeArc" + sg, arc, { width: 3.6, depth: 5.8 });
          return;
        }
        if (openBase < 0.14) { // closed: a curved line
          var arc2 = []; for (var i2 = 0; i2 <= 10; i2++) { var s2 = i2 / 10 * 2 - 1; arc2.push([cx + s2 * rw * 1.0, cy + 0.15 + 0.32 * (1 - s2 * s2)]); }
          lineItem("eyeShut" + sg, arc2, { width: 3.4 });
          return;
        }
        var white = []; for (var j = 0; j < 22; j++) { var a2 = (j / 22) * TAU; white.push([cx + rw * Math.cos(a2), cy + rh * Math.sin(a2)]); }
        var wp = face("eyeW" + sg, white, { color: Cc.eyeWhite, ink: true, inkW: 2.6, depth: 5.4, bump: 0.02, edge: 0.2, under: 0.98, amp: amp * 0.25 });
        if (!wp) return;
        // the pupil follows the gaze
        var gxo = (pose.gaze.x * 0.42 + em.gx * 0.4) * rw, gyo = (pose.gaze.y * 0.5 - em.gy * 0.36) * rh;
        gyo = Math.max(-0.5 * rh, Math.min(0.5 * rh, gyo)); gxo = Math.max(-0.55 * rw, Math.min(0.55 * rw, gxo));
        var pr = 0.78 * em.pupil * size, pcx = cx + gxo, pcy = cy + gyo;
        if (fx === "spiral") {
          var sp = []; for (var q = 0; q <= 40; q++) { var th = q / 40 * Math.PI * 5.5, rr = (q / 40) * 0.95 * rw; sp.push([pcx + rr * Math.cos(th), pcy + rr * Math.sin(th) * (rh / rw)]); }
          lineItem("pupil" + sg, sp, { width: 2.4, depth: 5.6, amp: 0.1 });
        } else if (fx === "heart") {
          var ht = []; for (var h2 = 0; h2 < 28; h2++) { var t2 = (h2 / 28) * TAU, hx = 16 * Math.pow(Math.sin(t2), 3), hy = 13 * Math.cos(t2) - 5 * Math.cos(2 * t2) - 2 * Math.cos(3 * t2) - Math.cos(4 * t2); ht.push([pcx + hx * 0.07 * size * em.pupil, pcy - hy * 0.07 * size * em.pupil - 0.1]); }
          face("pupil" + sg, ht, { color: "#e0455f", ink: true, inkW: 2, depth: 5.6, bump: 0.03, amp: amp * 0.1, edge: 0.1 });
        } else {
          var pp = []; for (var m = 0; m < 18; m++) { var a3 = (m / 18) * TAU; pp.push([pcx + pr * 0.9 * Math.cos(a3), pcy + pr * 1.05 * Math.sin(a3)]); }
          face("pupil" + sg, pp, { color: Cc.pupil, ink: false, depth: 5.6, bump: 0.03, amp: amp * 0.12, wash: 0.25, under: 1 });
          var hl = []; for (var n2 = 0; n2 < 10; n2++) { var a4 = (n2 / 10) * TAU; hl.push([pcx - pr * 0.3 + 0.3 * Math.cos(a4) * size, pcy - pr * 0.38 + 0.3 * Math.sin(a4) * size]); }
          face("glint" + sg, hl, { color: "#ffffff", ink: false, depth: 5.7, bump: 0.04, amp: 0, wash: 0, under: 0.95 });
          if (fx === "sparkle") { var hl2 = []; for (var n3 = 0; n3 < 8; n3++) { var a5 = (n3 / 8) * TAU; hl2.push([pcx + pr * 0.35 + 0.2 * Math.cos(a5), pcy + pr * 0.35 + 0.2 * Math.sin(a5)]); } face("glintB" + sg, hl2, { color: "#ffffff", ink: false, depth: 5.7, bump: 0.04, amp: 0, wash: 0, under: 0.95 }); }
        }
        // lids: painted in the head colour over the top (and bottom) of the eye, slanted by the emotion
        var xi = cx - sg * rw * 1.12, xo = cx + sg * rw * 1.12;
        if (em.lidTop > 0.02 || Math.abs(em.lidSlant) > 0.02) {
          var yTop = cy - rh + em.lidTop * rh * 2 * 0.62, sl = em.lidSlant * 0.3 * rh, inner = yTop + sl, outer = yTop - sl;
          var lid = []; for (var s3 = 0; s3 <= 8; s3++) lid.push([lerpv(xi, xo, s3 / 8), lerpv(inner, outer, s3 / 8)]);
          var edgeL = lid.slice();
          lid.push([xo, cy - rh - 1.2], [xi, cy - rh - 1.2]);
          var lp = lid.map(function (p) { return ellProject(Rh, 0, 0, p[0], -p[1], yh, 0.025); });
          if (lp.filter(function (p) { return p[2] > 0.12; }).length > 5) {
            part("lid" + sg, { pts: lp.map(function (p) { return H_([p[0], p[1]]); }), color: Cc.body, ink: false, depth: 5.8, clip: wp.pts, edge: 0, amp: 0, under: 1, wash: 0 });
            var le = lineItem("lidEdge" + sg, edgeL, { width: 2.8, depth: 5.9, amp: 0 }); if (le) le.clip = wp.pts;
          }
        }
        if (em.lidBot > 0.02) {
          var yb2 = cy + rh - em.lidBot * rh * 1.1, lbd = []; for (var s4 = 0; s4 <= 8; s4++) lbd.push([lerpv(xi, xo, s4 / 8), yb2 - 0.3 * Math.sin(s4 / 8 * Math.PI)]);
          lbd.push([xo, cy + rh + 1.2], [xi, cy + rh + 1.2]);
          var lbp = lbd.map(function (p) { return ellProject(Rh, 0, 0, p[0], -p[1], yh, 0.025); });
          if (lbp.filter(function (p) { return p[2] > 0.12; }).length > 5) part("lidB" + sg, { pts: lbp.map(function (p) { return H_([p[0], p[1]]); }), color: Cc.body, ink: false, depth: 5.8, clip: wp.pts, edge: 0, amp: 0, under: 1, wash: 0 });
        }
      });
      // brows: ink strokes over the eyes (inner end up = worried, inner end down = angry)
      [1, -1].forEach(function (sg) {
        var cx = sg * sep, by = ey - 2.15 - em.browY * 0.8 - (sg < 0 ? em.browAsym * 0.9 : 0), ptsB = [];
        for (var i = 0; i <= 8; i++) {
          var s = i / 8 * 2 - 1, inner = -sg * s; // +1 at the end nearest the nose
          ptsB.push([cx + s * 1.3, by - em.browArch * 0.55 * (1 - s * s) - inner * em.browAng * 0.6 * (inner > 0 ? 1 : 0.35)]);
        }
        lineItem("brow" + sg, ptsB, { width: 3.8, depth: 5.9, taper: [0.15, 0.4], amp: 0.18 });
      });
      // the mouth: on the muzzle
      (function () {
        var w = 1.0 * em.mouthW, my = 3.05, shape = em.mouthShape, op = em.mouthOpen, curve = em.mouthCurve, skew = em.mouthSkew, pts, N;
        var sk = function (s) { return -skew * 0.4 * s; };
        var line = function (arr, wdt) { lineItem("mouth", arr, { width: wdt || 3.2, depth: 5.5, bump: 0.18, amp: 0.12 }); };
        if (shape === "curve" || shape === "smirk") {
          pts = []; for (var i = 0; i <= 12; i++) { var s = i / 12 * 2 - 1; pts.push([s * w * 1.15, my - 0.1 - curve * 0.62 * s * s + sk(s)]); }
          return line(pts);
        }
        if (shape === "flat") {
          pts = []; for (var i2 = 0; i2 <= 8; i2++) { var s2 = i2 / 8 * 2 - 1; pts.push([s2 * w * 0.95, my - curve * 0.3 * s2 * s2 + sk(s2)]); }
          return line(pts);
        }
        if (shape === "zig") {
          pts = []; for (var i3 = 0; i3 <= 10; i3++) { var s3 = i3 / 10 * 2 - 1; pts.push([s3 * w * 1.1, my + (i3 % 2 ? 0.26 : -0.26) - curve * 0.3 * s3 * s3 + sk(s3)]); }
          return line(pts, 2.8);
        }
        if (shape === "cat") {
          pts = []; for (var i4 = 0; i4 <= 18; i4++) { var s4 = i4 / 18 * 2 - 1; pts.push([s4 * w * 1.25, my - 0.25 + (0.35 + 0.25 * curve) * Math.abs(Math.sin(Math.PI * s4)) + sk(s4) - 0.0]); }
          return line(pts);
        }
        // open mouths are shapes that can be filled
        var ow, oh, round = false;
        if (shape === "o") { ow = 0.62 * w; oh = 0.55 + op * 1.25; round = true; }
        else if (shape === "yawn") { ow = 0.85 * w; oh = 0.7 + op * 1.5; round = true; }
        else if (shape === "grit") { ow = 1.25 * w; oh = 0.4 + op * 1.0; }
        else if (shape === "tongue") { ow = 0.95 * w; oh = 0.5 + op * 1.2; }
        else { ow = 1.1 * w; oh = 0.4 + op * 1.3; } // "open"
        pts = [];
        if (round) { for (var i5 = 0; i5 < 22; i5++) { var a5 = (i5 / 22) * TAU; pts.push([ow * Math.cos(a5), my + oh / 2 - 0.15 + (oh / 2) * Math.sin(a5)]); } }
        else {
          for (var i6 = 0; i6 <= 10; i6++) { var s6 = i6 / 10 * 2 - 1; pts.push([s6 * ow, my - 0.2 - curve * 0.25 * s6 * s6 + sk(s6)]); }
          for (var i7 = 1; i7 < 10; i7++) { var a7 = (i7 / 10) * Math.PI; pts.push([ow * Math.cos(a7), my - 0.2 + oh * Math.sin(a7) * (shape === "grit" ? 0.9 : 1)]); }
        }
        var mp = face("mouth", pts, { color: Cc.mouthIn, ink: true, inkW: 2.6, depth: 5.5, bump: 0.18, edge: 0.12, amp: amp * 0.15, under: 1, wash: 0.25 });
        if (mp && (shape === "tongue" || shape === "open" || shape === "yawn")) {
          var tg = []; for (var i8 = 0; i8 < 16; i8++) { var a8 = (i8 / 16) * TAU; tg.push([ow * 0.55 * Math.cos(a8), my + oh * (shape === "tongue" ? 0.72 : 0.62) + oh * 0.28 * Math.sin(a8)]); }
          var tp = face("tongue", tg, { color: Cc.tongue, ink: false, depth: 5.55, bump: 0.18, amp: 0, under: 0.95, wash: 0.1 });
          if (tp) tp.clip = mp.pts;
        }
        if (mp && shape === "grit") { var tl2 = []; for (var q2 = -2; q2 <= 2; q2++) tl2.push(lineItem("tooth" + q2, [[q2 * 0.5 * w, my - 0.2], [q2 * 0.5 * w, my - 0.2 + oh * 0.9]], { width: 1.8, depth: 5.56, bump: 0.18, amp: 0 })); tl2.push(lineItem("toothMid", [[-ow, my - 0.2 + oh * 0.45], [ow, my - 0.2 + oh * 0.45]], { width: 1.8, depth: 5.56, bump: 0.18, amp: 0 })); tl2.forEach(function (l) { if (l) l.clip = mp.pts; }); }
        if (mp && shape === "yawn") { /* a wide O with the tongue low */ }
      })();
    }
    // the nape curl (back views only): a little ink swirl at the back of the head
    (function () {
      var pts = []; for (var i = 0; i <= 14; i++) { var t2 = i / 14, th = t2 * Math.PI * 3.2, r = 0.2 + 1.3 * t2; pts.push([r * Math.cos(th), -1.8 + r * Math.sin(th) * 0.9]); }
      var proj = pts.map(function (p) { return ellProject(Rh, 0, 0, p[0], -p[1], yh + 180, 0.02); });
      if (proj.filter(function (p) { return p[2] > 0.2; }).length > 10) part("nape", { kind: "line", pts: proj.map(function (p) { return H_([p[0], p[1]]); }), color: B.hex(B.shade(Cc.body, 0.62)), width: 2.8 * (env.k || 1), depth: 5.2, clip: headSilPts, amp: amp * 0.1 });
    })();

    // --- the tuft: one curved lock, curving toward the actor's left and forward
    (function () {
      var drop = pose.tuft * D2R, pts = [];
      for (var i = 0; i <= 10; i++) {
        var s = i / 10, X = (2.3 * s * s - 3.2 * Math.pow(Math.max(0, s - 0.72), 2) * 3.0 + Math.sin(drop) * 3.4 * s * s) * 1, Z = 1.5 * s * s * Math.cos(drop * 0.6), Yu = Rh.y * 0.96 + rg.tuftH * Math.cos(drop) * s * (1 - 0.15 * s) - Math.abs(Math.sin(drop)) * 0.9 * s * s;
        var p3 = pt3(0, 0, X * (Rh.x / Rh.x), Yu, Z, yh), w = H_([p3[0], p3[1]]);
        pts.push(w);
      }
      var poly = B.ribbonPoly(pts, 2.7 * u, 0.3 * u);
      part("tuft", { pts: poly, color: Cc.bodyDark, amp: amp * 0.35, ink: true, inkW: 2.4, depth: 7, edge: 0.25, shadeDark: 0.1 });
    })();

    // --- the held prop's depth hint and the reaction marks anchor
    var bnds = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    items.forEach(function (it) { if (it.kind === "part" || it.kind === "line") it.pts.forEach(function (p) { if (p[0] < bnds.x0) bnds.x0 = p[0]; if (p[0] > bnds.x1) bnds.x1 = p[0]; if (p[1] < bnds.y0) bnds.y0 = p[1]; if (p[1] > bnds.y1) bnds.y1 = p[1]; }); });
    return { items: items, bounds: bnds, hands: hands, head: headC, headSil: headSilPts, bodySil: bodySil, ears: ears, feet: pose.feet, u: u, yawBody: yb, yawHead: yh, view: viewName(yb), headView: viewName(yh), headRadius: Rh.x * u };
  }
  function lerpv(a, b, t) { return a + (b - a) * t; }

  // ------------------------------------------------------------------ reaction marks (painted shapes near the head, popped in by the emotion's age)
  function marks(ctx, rigOut, pose, env) {
    var em = pose.emotion, mk = em.marks || {}, u = rigOut.u, hc = rigOut.head, k = env.k || 1, look = env.look;
    var frame = env.frame, seed = B.mix(B.hashStr((env.seedKey || pose.id) + ":marks"), env.seed | 0), t = pose.t;
    var pop = function (delay) { var a = Math.max(0, pose.emoAge - delay) / 0.26; return a >= 1 ? 1 : 1 + Math.sin(Math.min(a, 1) * Math.PI) * 0.25 * 0 + (a < 1 ? (a * a * (3 - 2 * a)) - 1 : 0) + (a < 1 ? Math.sin(a * Math.PI) * 0.22 : 0); };
    var ink = look.inkColor || "#2b2420";
    function stroke(pts, w, col, delay, alpha) { var p = pop(delay || 0); if (p <= 0.02) return; B.ribbon(ctx, pts, { color: col || ink, width: w * k * p, seed: seed + 3, frame: frame, taper: [0.2, 0.3], alpha: alpha == null ? 0.95 : alpha }); }
    var side = pose.yawHead >= 0 ? 1 : -1, ax = hc[0] + (pose.yawHead >= 0 ? 1 : -1) * 0, top = hc[1] - 5.6 * u;
    var mx = hc[0] + 4.6 * u * (Math.abs(pose.yawHead) > 100 ? -side : 1) , my = hc[1] - 4.6 * u;
    if (mk.exclaim > 0.05) {
      var s = Math.min(1.4, mk.exclaim) * pop(0.03), x = mx + 0.5 * u, y = my - 1.2 * u, wob = Math.sin(t * 30) * 0.0;
      var line = [[x, y - 2.9 * u * s], [x + 0.1 * u, y - 0.9 * u * s]];
      stroke([[x, y - 3.0 * u * s], [x + 0.08 * u, y - 1.7 * u * s], [x, y - 0.8 * u * s]], 1.1 * u * 0.6, "#c0392b", 0, 0.95);
      var dot = B.ellipse(x, y - 0.02 * u, 0.42 * u * s, 0.42 * u * s, 0, 14);
      ctx.save(); ctx.fillStyle = B.rgba("#c0392b", 0.95); B.pathSmooth(ctx, B.boil(dot, B.mix(seed, 5), frame, 0.4, true), true); ctx.fill(); ctx.restore();
    }
    if (mk.question > 0.05) {
      var s2 = Math.min(1.5, mk.question) * pop(0.03), x2 = mx + 0.4 * u, y2 = my - 1.0 * u, pts = [];
      for (var i = 0; i <= 14; i++) { var a = -Math.PI * 0.95 + (i / 14) * Math.PI * 1.55; pts.push([x2 + Math.cos(a) * 0.95 * u * s2, y2 - 2.0 * u * s2 + Math.sin(a) * 0.95 * u * s2]); }
      pts.push([x2 + 0.1 * u * s2, y2 - 0.9 * u * s2]);
      stroke(pts, 0.55 * u, "#3b5d8f", 0, 0.95);
      var dot2 = B.ellipse(x2, y2 + 0.15 * u, 0.3 * u * s2, 0.3 * u * s2, 0, 12);
      ctx.save(); ctx.fillStyle = B.rgba("#3b5d8f", 0.95); B.pathSmooth(ctx, dot2, true); ctx.fill(); ctx.restore();
      if (mk.question > 1.0) { var x3 = x2 - 3.2 * u, y3 = y2 + 0.8 * u, pts2 = []; for (var j = 0; j <= 12; j++) { var a2 = -Math.PI * 0.95 + (j / 12) * Math.PI * 1.55; pts2.push([x3 + Math.cos(a2) * 0.6 * u * s2, y3 - 1.2 * u * s2 + Math.sin(a2) * 0.6 * u * s2]); } stroke(pts2, 0.4 * u, "#3b5d8f", 0.08, 0.85); }
    }
    if (mk.sweat > 0.05) {
      var s3 = Math.min(1.2, mk.sweat) * pop(0.05), x4 = hc[0] - side * 5.0 * u, y4 = hc[1] - 3.6 * u + Math.sin(t * 3) * 0.1 * u;
      var drop = []; for (var m = 0; m < 20; m++) { var th = (m / 20) * TAU; drop.push([x4 + Math.sin(th) * 0.8 * u * s3 * (th > Math.PI ? 1 : 1), y4 - Math.cos(th) * (th < Math.PI ? 1.25 : 0.9) * u * s3 + (Math.cos(th) > 0.7 ? -0.5 * u * s3 * (Math.cos(th) - 0.7) : 0)]); }
      ctx.save(); B.wash(ctx, B.boil(drop, B.mix(seed, 9), frame, 0.5, true), { color: "#8ec9e8", seed: seed + 9, frame: frame, jitter: 0.8, under: 0.85, passes: 1, edge: 0.3, k: k, shade: { light: 0.4, dark: 0.1 } }); ctx.restore();
    }
    if (mk.tear > 0.05) {
      [1, -1].forEach(function (sg) {
        var x5 = hc[0] + sg * 3.1 * u * Math.abs(Math.cos(pose.yawHead * D2R)) + Math.sin(pose.yawHead * D2R) * 4.5 * u * 0.2, y5 = hc[1] - 0.2 * u + (pose.emoAge * 1.6 % 2.2) * u * 0.8 * Math.min(1, mk.tear);
        if (Math.abs(pose.yawHead) > 100) return;
        var tear = []; for (var m2 = 0; m2 < 14; m2++) { var th2 = (m2 / 14) * TAU; tear.push([x5 + Math.sin(th2) * 0.45 * u, y5 + (th2 < Math.PI ? -Math.cos(th2) * 0.9 : -Math.cos(th2) * 0.5) * u]); }
        ctx.save(); B.wash(ctx, tear, { color: "#8ec9e8", seed: seed + 11, frame: frame, jitter: 0.4, under: 0.9, passes: 1, edge: 0.3, k: k }); ctx.restore();
      });
    }
    if (mk.vein > 0.05) {
      var s4 = Math.min(1.4, mk.vein) * pop(0.04), x6 = hc[0] + 4.2 * u * side * -1 + 0, y6 = hc[1] - 4.4 * u;
      if (Math.abs(pose.yawHead) > 100) x6 = hc[0] + 3 * u;
      for (var q = 0; q < 4; q++) { var an = q * Math.PI / 2 + Math.PI / 4, r1 = 0.28 * u * s4, r2 = 1.15 * u * s4; stroke([[x6 + Math.cos(an - 0.35) * r1, y6 + Math.sin(an - 0.35) * r1], [x6 + Math.cos(an) * (r1 + r2) * 0.7, y6 + Math.sin(an) * (r1 + r2) * 0.7], [x6 + Math.cos(an + 0.35) * r1, y6 + Math.sin(an + 0.35) * r1]], 0.5 * u, "#c0392b", 0, 0.95); }
    }
    if (mk.sparkle > 0.05) {
      [[-4.6, -5.8, 1], [4.8, -6.4, 0.8], [5.9, -3.2, 0.6]].forEach(function (sp, i) {
        var tw = 0.65 + 0.35 * Math.sin(t * 7 + i * 2.1), s5 = sp[2] * Math.min(1.3, mk.sparkle) * tw * pop(0.02 * i) * u, x7 = hc[0] + sp[0] * u, y7 = hc[1] + sp[1] * u + 1.2 * u;
        var star = []; for (var m3 = 0; m3 < 8; m3++) { var r = m3 % 2 === 0 ? 1 : 0.28, an2 = (m3 / 8) * TAU - Math.PI / 2; star.push([x7 + Math.cos(an2) * r * s5, y7 + Math.sin(an2) * r * s5]); }
        ctx.save(); B.wash(ctx, B.boil(star, B.mix(seed, 20 + i), frame, 0.5, true), { color: "#ffd66b", seed: seed + 20 + i, frame: frame, jitter: 0.5, under: 0.95, passes: 1, edge: 0.4, k: k, shade: { light: 0.3, dark: 0.1 } }); ctx.restore();
      });
    }
    if (mk.hearts > 0.05) {
      [[-4.6, -6.0, 1], [5, -7.0, 0.75], [1.5, -8.8, 0.55]].forEach(function (sp, i) {
        var s6 = sp[2] * Math.min(1.2, mk.hearts) * pop(0.05 * i) * u * 0.1, x8 = hc[0] + sp[0] * u, y8 = hc[1] + sp[1] * u + 1.2 * u - ((t * 0.9 + i * 0.4) % 1.2) * u * 0.5, ht = [];
        for (var h = 0; h < 26; h++) { var th3 = (h / 26) * TAU; ht.push([x8 + 16 * Math.pow(Math.sin(th3), 3) * s6, y8 - (13 * Math.cos(th3) - 5 * Math.cos(2 * th3) - 2 * Math.cos(3 * th3) - Math.cos(4 * th3)) * s6]); }
        ctx.save(); B.wash(ctx, B.boil(ht, B.mix(seed, 40 + i), frame, 0.5, true), { color: "#e0455f", seed: seed + 40 + i, frame: frame, jitter: 0.5, under: 0.95, passes: 1, edge: 0.4, k: k, shade: { light: 0.3, dark: 0.15 } }); ctx.restore();
      });
    }
    if (mk.zzz > 0.05) {
      for (var z = 0; z < 3; z++) {
        var ph = ((t * 0.55 + z * 0.33) % 1), s7 = (0.55 + 0.35 * ph) * u * pop(0), x9 = hc[0] + (4.2 + z * 1.4 + ph * 0.8) * u, y9 = hc[1] - (3.2 + z * 1.6 + ph * 1.6) * u, a = (1 - Math.abs(ph - 0.5) * 1.2) * 0.9;
        stroke([[x9 - s7, y9 - s7], [x9 + s7, y9 - s7], [x9 - s7, y9 + s7], [x9 + s7, y9 + s7]], 0.34 * u, "#3b5d8f", 0, Math.max(0.2, a));
      }
    }
    if (mk.dots > 0.05) {
      for (var d = 0; d < 3; d++) { var on = 0.5 + 0.5 * Math.sin(t * 4 - d * 1.2), x10 = hc[0] + (4.4 + d * 1.35) * u * (Math.abs(pose.yawHead) > 100 ? -1 : 1), y10 = hc[1] - 5.6 * u; ctx.save(); ctx.fillStyle = B.rgba("#6b5d52", 0.5 + 0.5 * on); B.pathSmooth(ctx, B.ellipse(x10, y10, 0.36 * u * pop(d * 0.06), 0.36 * u * pop(d * 0.06), 0, 12), true); ctx.fill(); ctx.restore(); }
    }
    if (mk.swirl > 0.05) {
      var sw = Math.min(1.3, mk.swirl), cx11 = hc[0], cy11 = hc[1] - 7 * u;
      for (var o = 0; o < 3; o++) { var an3 = t * 3.2 + o * TAU / 3, x12 = cx11 + Math.cos(an3) * 3.2 * u, y12 = cy11 + Math.sin(an3) * 0.9 * u, st = []; for (var m4 = 0; m4 < 8; m4++) { var r2 = m4 % 2 === 0 ? 0.7 : 0.26, an4 = (m4 / 8) * TAU - Math.PI / 2; st.push([x12 + Math.cos(an4) * r2 * u * sw, y12 + Math.sin(an4) * r2 * u * sw]); } ctx.save(); B.wash(ctx, st, { color: "#ffd66b", seed: seed + 60 + o, frame: frame, jitter: 0.4, under: 0.95, passes: 1, edge: 0.3, k: k }); ctx.restore(); }
    }
  }

  // ------------------------------------------------------------------ painting one item
  function paintItem(ctx, it, env) {
    var look = env.look, k = env.k || 1, frame = env.frame, seed = B.mix(B.hashStr(it.seedKey), env.seed | 0);
    var boilOn = look.boil && look.boil.amp > 0, amp = (it.amp || 0.6) * (boilOn ? look.boil.amp : 0);
    var layers = look.layers || {};
    ctx.save();
    if (it.clip && it.clip.length > 2) { B.pathSmooth(ctx, it.clip, true); ctx.clip(); }
    var pts = it.pts;
    if (it.kind === "line") {
      var lp = amp > 0 ? B.boil(pts, seed, frame, amp * 0.8, false) : pts;
      if (layers.ink !== false) B.ribbon(ctx, lp, { color: it.color, width: it.width * (look.ink.width || 1), seed: seed, frame: frame, taper: it.taper || [0.2, 0.25], alpha: 0.95, press: 0.22 * (look.ink.wobble == null ? 1 : look.ink.wobble) });
      ctx.restore();
      return;
    }
    var bp = amp > 0 ? B.boil(pts, seed, frame, amp, true) : pts;
    var col = it.color;
    if (layers.wash !== false || it.under) {
      var o = { color: col, seed: seed, frame: frame, jitter: Math.max(0.5, amp * 0.7), under: it.under != null ? it.under : 0.97, passes: it.passes != null ? it.passes : 3, edge: it.edge != null ? it.edge : 0.32, k: k, wash: layers.wash === false ? 0 : (it.wash != null ? it.wash : 1) * (look.wash && look.wash.opacity != null ? look.wash.opacity : 1), edgeW: 3, shade: { light: it.shadeLight != null ? it.shadeLight : 0.2, dark: it.shadeDark != null ? it.shadeDark : 0.22, dir: look.light && look.light.dir ? look.light.dir : [-0.5, -0.8] }, hatch: it.hatch && layers.bristles !== false ? it.hatch : 0 };
      B.wash(ctx, bp, o);
    }
    if (it.ink !== false && layers.ink !== false) B.ink(ctx, bp, { color: look.inkColor || ink_(it), width: (it.inkW || 2.6) * k * (look.ink.width || 1), seed: seed + 5, frame: frame, range: it.inkRange, press: 0.28 * (look.ink.wobble == null ? 1 : look.ink.wobble), light: look.light && look.light.dir ? look.light.dir.map(function (v) { return -v; }) : null });
    ctx.restore();
  }
  function ink_(it) { return it.inkColor || "#302921"; }

  var api = {
    EMOTIONS: EMO, EMOTION_NAMES: EMOTION_NAMES, emotionParams: emotionParams, EMO_DEFAULT: DEF,
    VIEWS: VIEWS, viewName: viewName, footOffset: footOffset, footDepth: footDepth, rigOf: rigOf, traitFeatures: traitFeatures, RIG_FEATURES: RIG_FEATURES, TRAIT_FEATURES: TRAIT_FEATURES,
    restPose: restPose, rig: rig, marks: marks, paintItem: paintItem, ellProject: ellProject, PROP_DEFAULT: PROP_DEFAULT,
  };
  K.character = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
