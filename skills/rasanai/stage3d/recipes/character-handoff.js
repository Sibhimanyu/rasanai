/*
 * Recipe character-handoff: a recurring crew character walks to its mark, then hands the beat from one state to the next
 * (look at the camera, then an emotion, then an optional point/hop). It reads the character canon (identity.json, the one
 * file score.cast[].canon points to) and drives the existing RasanCharacter3D adapter (assets/three/character-rig.js, loaded first).
 *
 * What can be rigged, stated plainly: only rig.kind "code" with a known builder (the code-built critter). A reference image,
 * a painted 2D actor (medium "painted-2d") or a "glb" rig CANNOT be rigged here (the rigged GLB actor lives on the unmerged
 * Sibhimanyu/rasan-3d). Then build() returns { rigged: false, reason, fallback } and an inert pose: nothing pretends a flat
 * image became a rigged mesh; keep the actor 2D (Rasan2D) and record the downgrade.
 */
(function (root, factory) {
  var C = typeof require === "function" && typeof module === "object" ? require("./common.js") : root.RasanRecipesCommon;
  C.registry.register(factory(C, typeof require === "function" && typeof module === "object" ? null : root));
})(this, function (C, win) {
  "use strict";
  var EMOTIONS = ["surprised", "joyful", "worried", "proud", "sad", "curious"];
  var params = {
    durationS: { type: "number", min: 2, max: 10, default: 4 },
    fromX: { type: "number", min: -3, max: 3, default: -0.8 },
    toX: { type: "number", min: -3, max: 3, default: 0.4 },
    walkS: { type: "number", min: 0.4, max: 4, default: 1.6 },
    handoffAt: { type: "number", min: 0.5, max: 9, default: 2.2 },
    emotion: { type: "enum", enum: EMOTIONS, default: "joyful" },
    then: { type: "enum", enum: ["none", "point", "hop", "look"], default: "none" },
    emotionS: { type: "number", min: 0.4, max: 4, default: 1.4 },
    fps: { type: "number", min: 24, max: 60, default: 30 },
  };
  var KNOWN_BUILDERS = ["rasan-critter"];

  // Pure: can this identity be rigged on the current runtime?
  function assess(identity) {
    var rg = identity && identity.rig;
    if (!identity) return { rigged: false, reason: "no identity.json supplied", fallback: "keep the actor 2D (Rasan2D) and record a downgrade" };
    if (identity.medium !== "3d-rig") return { rigged: false, reason: "medium is " + JSON.stringify(identity.medium) + ": a painted or reference image is not a rigged mesh; no image-to-3D is claimed", fallback: "keep the actor in 2D (Rasan2D painted-2d) and record a downgrade" };
    if (!rg || rg.kind !== "code") return { rigged: false, reason: "rig.kind " + JSON.stringify(rg && rg.kind) + " needs the rigged GLB actor of the unmerged upstream Sibhimanyu/rasan-3d (apps/rasan-3d); this runtime builds only rig.kind \"code\"", fallback: "keep the actor in 2D (Rasan2D) or use the code-built critter if the canon allows it, and record a downgrade" };
    if (KNOWN_BUILDERS.indexOf(rg.builder) < 0) return { rigged: false, reason: "unknown rig.builder " + JSON.stringify(rg.builder) + " (have " + KNOWN_BUILDERS.join(", ") + ")", fallback: "keep the actor 2D and record a downgrade" };
    return { rigged: true, reason: "", fallback: null };
  }
  function actions(P) {
    var a = [];
    var walk = Math.abs(P.toX - P.fromX) > 1e-6;
    var tWalk = 0.2, tEnd = tWalk + P.walkS;
    if (walk) a.push({ kind: "walk", at: tWalk, duration: P.walkS, to: [P.toX, 0] });
    var look0 = walk ? tEnd : 0.2;
    if (P.handoffAt - look0 > 0.3) a.push({ kind: "look", at: look0, duration: P.handoffAt - look0, target: [0, 0.7, 3] });
    a.push({ kind: "react", at: P.handoffAt, duration: P.emotionS, emotion: P.emotion, attack: 0.1 });
    var tThen = P.handoffAt + P.emotionS;
    if (P.then === "point") a.push({ kind: "point", at: tThen, duration: 1.2, target: [P.toX + 1, 0.6, 0.5], hand: "r" });
    else if (P.then === "hop") a.push({ kind: "hop", at: tThen, duration: 1, height: 0.2, count: 1 });
    else if (P.then === "look") a.push({ kind: "look", at: tThen, duration: 1.2, target: [-1, 0.7, 2] });
    return a;
  }
  function plan(opts) {
    var P = C.resolve(params, opts);
    var tHand = C.snap(P.handoffAt, P.fps);
    var verdict = assess(opts && opts.identity);
    return { P: P, duration: P.durationS, hits: [tHand], actions: actions(P), assessment: verdict };
  }
  function camera() {
    // the actor stands about 1 world unit tall: a 50 mm lens, chest height, a slow settle in
    return { pos: [[0, [0, 0.55, 4.2]], [4, [0, 0.55, 3.6], "power2.out"]], target: [[0, [0, 0.5, 0]]], lens: [[0, 50]], fstop: 4 };
  }
  function build(k, opts) {
    var p = plan(opts), P = p.P, v = p.assessment;
    if (!v.rigged) return { duration: p.duration, hits: [], objects: {}, pose: C.noop, rigged: false, reason: v.reason, fallback: v.fallback, warnings: ["not rigged: " + v.reason] };
    var Lib = (win && win.RasanCharacter3D) || (typeof RasanCharacter3D !== "undefined" ? RasanCharacter3D : null);
    if (!Lib) return { duration: p.duration, hits: [], objects: {}, pose: C.noop, rigged: false, reason: "assets/three/character-rig.js (RasanCharacter3D) is not loaded", fallback: "load it before the recipe", warnings: ["not rigged: adapter missing"] };
    k.rig("three-point", { dir: [-0.5, 0.8, 0.7], shadowSize: 4 });
    k.ground({ y: 0 });
    var rig = Lib.loadCharacter(opts.identity, k, { seed: 1 });
    k.scene.add(rig.group);
    var spec = { start: { x: P.fromX, z: 0, yaw: 0 }, actions: p.actions };
    function pose(t) { rig.poseAt(t, spec); }
    return { duration: p.duration, hits: p.hits, objects: { rig: rig }, pose: pose, rigged: true, spec: spec, warnings: [] };
  }
  return { id: "character-handoff", label: "Character pose and emotion handoff", summary: "A crew character walks to its mark and hands the beat from look to an emotion; refuses, loudly, anything that cannot be rigged.", params: params, requires: ["identity (identity.json of a 3d-rig, rig.kind code)", "character-rig.js loaded"], plan: plan, camera: camera, build: build, assess: assess };
});
