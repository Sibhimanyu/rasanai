/*
 * Recipe focus-pull: a rack focus that lands on a supplied event time, frame-correct. The event time is snapped to the
 * frame grid; the focus distance is exactly the near value on the frame before the pull starts and exactly the far value
 * from the event frame on. Declarative camera keys only (focus/fstop), so the gate reads the eases.
 * Use camera(opts) as the stage's `camera.focus`/`fstop`; merge it with your own pos/target/lens keys.
 */
(function (root, factory) {
  var C = typeof require === "function" && typeof module === "object" ? require("./common.js") : root.RasanRecipesCommon;
  C.registry.register(factory(C));
})(this, function (C) {
  "use strict";
  var params = {
    eventS: { type: "number", min: 0.2, max: 60, default: 2 },
    pullS: { type: "number", min: 0.1, max: 3, default: 0.7 },
    fromDistance: { type: "number", min: 0.2, max: 100, default: 4 },
    toDistance: { type: "number", min: 0.2, max: 100, default: 9 },
    fstop: { type: "number", min: 1.2, max: 8, default: 2 },
    fps: { type: "number", min: 24, max: 60, default: 30 },
  };

  function plan(opts) {
    var P = C.resolve(params, opts);
    var tEvent = C.snap(P.eventS, P.fps);
    var frames = Math.max(1, Math.round(P.pullS * P.fps));
    var tStart = tEvent - frames / P.fps;
    if (tStart < 0) throw new Error("focus-pull: eventS " + tEvent + " leaves no room for a " + frames + "-frame pull; raise eventS or lower pullS");
    return { P: P, tEvent: tEvent, tStart: tStart, frames: frames, duration: tEvent + 0.5, hits: [tEvent] };
  }
  function camera(opts) {
    var p = plan(opts), P = p.P;
    return { focus: [[0, P.fromDistance], [p.tStart, P.fromDistance], [p.tEvent, P.toDistance, "power3.inOut"]], fstop: P.fstop };
  }
  // the focus distance at t, by the same keys (for the check and for pinning DOM to the in-focus plane)
  function focusAt(t, opts) {
    var p = plan(opts), P = p.P;
    if (t <= p.tStart) return P.fromDistance;
    if (t >= p.tEvent) return P.toDistance;
    var u = (t - p.tStart) / (p.tEvent - p.tStart);
    var e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // power3.inOut
    return P.fromDistance + (P.toDistance - P.fromDistance) * e;
  }
  function build(k, opts) {
    var p = plan(opts);
    // nothing to build: the pull lives entirely in the camera's focus keys (no objects, no extra GPU work)
    return { duration: p.duration, hits: p.hits, objects: {}, pose: C.noop, focusAt: function (t) { return focusAt(t, opts); }, event_frame: Math.round(p.tEvent * p.P.fps), warnings: [] };
  }
  return { id: "focus-pull", label: "Frame-correct focus pull", summary: "A rack focus that is in focus on exactly the supplied event frame.", params: params, requires: [], plan: plan, camera: camera, build: build, focusAt: focusAt };
});
