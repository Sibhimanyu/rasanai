/* MediumCel (profile P06, "cel-boil" / execution "cel-performance"): cel-style character performance, as glue over Rasan2D.
 *
 *   var scene = MediumCel.createMediumScene({ root, width, height, seed, assets, design, content, eventBindings });
 *   scene.ready.then(function () { scene.setTime(1.25); });     // setTime(t) paints the COMPLETE frame at scene-local t (pure)
 *   scene.describeElements();  scene.destroy();
 *
 * What it is: a compiler from "beats" (anticipate -> act -> react, with a held pose) into the action list Rasan2D.renderAt already
 * understands, plus an optional line-boil FX overlay. It is NOT a renderer, a clock or a timeline: Rasan2D paints the character
 * (identity, five views, emotions, planted feet, its own seeded boil), the score owns timing, and this file only turns authored beats
 * into actions at times resolved from the score's events (eventBindings). Same time in, same pixels out.
 *
 * Not claimed: lip sync / speech mouth shapes, arbitrary rigging, perspective turning beyond Rasan2D's five views, cloth or hair.
 * Boil is line-only: it is Rasan2D's per-actor, per-part, per-drawing seeded offsets (look.boil) plus the FX overlay below; evidence text
 * and the whole frame are never wobbled.
 *
 * Needs (loaded before use, from assets/rasan2d/): brush.js, character.js, gestures.js, rasan2d.js  ->  global Rasan2D.
 * If Rasan2D is missing, `ready` rejects with a precise message; nothing is downloaded or substituted.
 * Import is side-effect free (no DOM, timers, network or randomness at load).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.MediumCel = factory(root);
})(typeof self !== "undefined" ? self : this, function (G) {
  "use strict";
  var VERSION = "1.0.0";
  var PROFILE_ID = "cel-boil", EXECUTION_ID = "cel-performance";
  var NATIVE_ACTIONS = ["anticipate", "act", "react", "pose-hold"];

  // Rasan2D action kinds (references/2d-character.md, capability 3). "Idle" kinds never count as the action of a beat.
  var IDLE_KINDS = { idle: 1, breathe: 1, blink: 1 };
  var KINDS = { idle: 1, breathe: 1, look: 1, gaze: 1, walk: 1, point: 1, reach: 1, hop: 1, jump: 1, react: 1, take: 1, blink: 1, turn: 1, hold: 1, release: 1, emote: 1, catch: 1 };
  var EXPRESSIVE = { react: 1, take: 1, emote: 1, jump: 1, hop: 1, look: 1, gaze: 1, point: 1, turn: 1 };
  var MIN_HOLD = 0.25;

  function need(c, m) { if (!c) throw new Error("MediumCel: " + m); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function str(v) { return typeof v === "string" && v.length > 0; }

  // ---- deterministic boil: a pure function of (seed, objectId, drawingFrame). Adding an actor changes nobody else's offsets.
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mix32(h) { h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return h >>> 0; }
  function unit(seed, objectId, drawingFrame, salt) {
    return mix32((seed | 0) ^ mix32(hashStr(objectId)) ^ mix32(Math.imul((drawingFrame | 0) + 1, 0x9E3779B1) ^ (salt | 0))) / 4294967296;
  }
  // boilOffset(seed, objectId, drawingFrame, amp) -> {dx, dy, dr} in [-amp, amp] px (dr in radians, amp/200)
  function boilOffset(seed, objectId, drawingFrame, amp) {
    var a = amp == null ? 1 : amp;
    return { dx: (unit(seed, objectId, drawingFrame, 1) * 2 - 1) * a, dy: (unit(seed, objectId, drawingFrame, 2) * 2 - 1) * a, dr: (unit(seed, objectId, drawingFrame, 3) * 2 - 1) * a / 200 };
  }
  function drawingFrame(t, hz) { return Math.floor(Math.max(0, t) * hz + 1e-9); }

  // ---- event bindings: the score stays the timing authority. {eventId: seconds | {t}} or [{id|event_id, t|time|start}]
  function normalizeBindings(b) {
    var out = {}, i, e, id, t;
    if (!b) return out;
    if (Array.isArray(b)) {
      for (i = 0; i < b.length; i++) { e = b[i] || {}; id = e.id || e.event_id || e.eventId; t = e.t != null ? e.t : e.time != null ? e.time : e.start; if (str(id) && isNum(t)) out[id] = t; }
    } else {
      for (id in b) { e = b[id]; t = isNum(e) ? e : e && (e.t != null ? e.t : e.time != null ? e.time : e.start); if (isNum(t)) out[id] = t; }
    }
    return out;
  }
  // a beat starts at its bound score event (+ offset). An unbound event id is an error: never guess a time.
  function beatStart(beat, bindings) {
    if (beat.event != null) {
      need(str(beat.event), "beat " + beat.id + ": event must be a score event id");
      need(bindings[beat.event] != null, "beat " + beat.id + ": score event '" + beat.event + "' has no time in eventBindings");
      return bindings[beat.event] + (beat.offset || 0);
    }
    need(isNum(beat.at) && beat.at >= 0, "beat " + beat.id + ": needs `event` (a score event id) or a scene-local `at` >= 0");
    return beat.at + (beat.offset || 0);
  }

  // ---- validation + compilation to Rasan2D actions
  function checkPhase(beat, name, bounds) {
    var ph = beat[name];
    need(ph && typeof ph === "object", "beat " + beat.id + ": missing phase '" + name + "'");
    need(isNum(ph.at) && ph.at >= 0, "beat " + beat.id + "." + name + ": `at` (offset in seconds from the beat start) must be finite and >= 0");
    need(Array.isArray(ph.actions) && ph.actions.length > 0, "beat " + beat.id + "." + name + ": needs at least one action");
    ph.actions.forEach(function (a, i) {
      var w = "beat " + beat.id + "." + name + "[" + i + "]";
      need(a && KINDS[a.kind], w + ": unsupported action kind '" + (a && a.kind) + "'");
      need(str(a.actor) && bounds.actors[a.actor], w + ": unknown actor '" + (a && a.actor) + "'");
      need(a.dt == null || (isNum(a.dt) && a.dt >= 0), w + ": dt must be finite >= 0");
      need(isNum(a.duration) && a.duration > 0 && a.duration <= 20, w + ": duration must be finite, > 0 and <= 20");
      if (a.prop != null) need(bounds.props[a.prop], w + ": unknown prop '" + a.prop + "'");
      if (a.track != null) need(bounds.props[a.track], w + ": unknown prop '" + a.track + "'");
    });
    return ph;
  }
  function phaseEnd(ph) { var m = 0; ph.actions.forEach(function (a) { m = Math.max(m, (a.dt || 0) + a.duration); }); return ph.at + m; }

  function compile(content, bindings) {
    var bounds = { actors: {}, props: {} }, actions = [], beats = [], limitations = [];
    content.actors.forEach(function (a) { bounds.actors[a.id] = a; });
    (content.props || []).forEach(function (p) { bounds.props[p.id] = p; });

    // attached props: a `hold` for the whole stretch, so a prop is never left floating (Rasan2D grab blends)
    (content.props || []).forEach(function (p) {
      if (!p.attach) return;
      need(bounds.actors[p.attach.actor], "prop " + p.id + ": attach.actor '" + p.attach.actor + "' is not an actor");
      var from = isNum(p.attach.from) ? p.attach.from : 0, to = isNum(p.attach.to) ? p.attach.to : content.duration;
      need(to > from, "prop " + p.id + ": attach.to must be after attach.from");
      actions.push({ actor: p.attach.actor, kind: "hold", at: from, duration: to - from, prop: p.id, hand: p.attach.hand || "R" });
    });

    var actCount = 0;
    content.beats.forEach(function (beat) {
      need(beat && str(beat.id), "every beat needs an id");
      var t0 = beatStart(beat, bindings);
      var an = checkPhase(beat, "anticipate", bounds), ac = checkPhase(beat, "act", bounds), re = checkPhase(beat, "react", bounds);
      need(an.at < ac.at, "beat " + beat.id + ": anticipation must come before the action");
      var result = isNum(ac.resultAt) ? ac.resultAt : phaseEnd(ac);
      need(result >= ac.at, "beat " + beat.id + ": act.resultAt precedes the action");
      need(re.at >= result - 1e-9, "beat " + beat.id + ": the reaction (" + re.at + "s) comes before the result it responds to (" + result + "s)");
      need(ac.actions.some(function (a) { return !IDLE_KINDS[a.kind]; }), "beat " + beat.id + ": the action phase is only idle/breathe/blink; a cheerful idle is not action");
      need(re.actions.some(function (a) { return EXPRESSIVE[a.kind]; }), "beat " + beat.id + ": the reaction phase needs an expressive action (react, emote, look, jump, hop, point, turn)");
      var hold = beat.hold == null ? 0.5 : beat.hold;
      need(isNum(hold) && hold >= 0, "beat " + beat.id + ": hold must be finite >= 0");
      if (hold > 0 && hold < MIN_HOLD) limitations.push("beat " + beat.id + ": held pose of " + hold + "s is shorter than " + MIN_HOLD + "s and may not read");
      if (hold === 0) limitations.push("beat " + beat.id + ": no held pose after the reaction");
      var bi = beats.length;
      [["anticipate", an], ["act", ac], ["react", re]].forEach(function (pair) {
        var name = pair[0], ph = pair[1];
        ph.actions.forEach(function (a, idx) {
          var out = {}, k;
          for (k in a) if (k !== "dt") out[k] = a[k];
          out.at = t0 + ph.at + (a.dt || 0);
          out.beat = beat.id; out.phase = name;
          // the held pose lives on the reaction: Rasan2D's own react/take `hold` keeps the pose after the move completes
          if (name === "react" && hold > 0 && (a.kind === "react" || a.kind === "take") && out.hold == null) out.hold = hold;
          out.id = beat.id + "." + name + "." + idx;
          actions.push(out);
        });
      });
      actCount++;
      beats.push({ id: beat.id, start: t0, resultAt: t0 + result, holdUntil: t0 + phaseEnd(re) + hold, event: beat.event || null, fx: beat.fx || null, serves: beat.serves || null });
    });
    need(actCount > 0, "content.beats needs at least one anticipate -> act -> react beat");
    actions.sort(function (a, b) { return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    return { actions: actions, beats: beats, limitations: limitations };
  }

  function validateContent(content, assets, width, height) {
    need(content && typeof content === "object", "content is required");
    need(isNum(content.duration) && content.duration > 0 && content.duration <= 600, "content.duration must be a finite number of seconds (> 0)");
    need(Array.isArray(content.actors) && content.actors.length > 0, "content.actors needs at least one actor");
    var seen = {};
    content.actors.forEach(function (a) {
      need(a && str(a.id), "every actor needs an id");
      need(!seen[a.id], "duplicate id '" + a.id + "'"); seen[a.id] = 1;
      var canon = a.canon || (a.canonRef && assets && assets.canons && assets.canons[a.canonRef]);
      need(canon && typeof canon === "object" && canon.schema_version === 1 && canon.medium === "painted-2d", "actor " + a.id + ": needs a painted-2d identity (inline `canon` or `canonRef` resolved through assets.canons); no character is invented here");
      need(a.position && isNum(a.position.x) && isNum(a.position.y) && a.position.x >= 0 && a.position.x <= 1 && a.position.y >= 0 && a.position.y <= 1, "actor " + a.id + ": position.x/y are fractions of the frame in [0, 1]");
      a._canon = canon;
    });
    (content.props || []).forEach(function (p) {
      need(p && str(p.id) && !seen[p.id], "prop ids must be unique and non-empty");
      seen[p.id] = 1;
      need(isNum(p.size) && p.size > 0, "prop " + p.id + ": size must be a finite px value");
    });
    need(Array.isArray(content.beats), "content.beats must be an array");
    (content.beats || []).forEach(function (b) {
      if (b.fx) {
        need(b.fx.kind === "burst" && Array.isArray(b.fx.at) && isNum(b.fx.at[0]) && isNum(b.fx.at[1]), "beat " + b.id + ": fx supports {kind:'burst', at:[x,y] fractions of the frame, start, duration}");
        need(isNum(b.fx.start) && isNum(b.fx.duration) && b.fx.duration > 0, "beat " + b.id + ": fx.start/duration must be finite (start is an offset in seconds from the beat start)");
      }
    });
  }

  // logical (0..1 of the frame) -> output px. One mapping, used for the FX overlay and for describeElements anchors.
  function toScreen(width, height, p) { return [p[0] * width, p[1] * height]; }

  function createMediumScene(o) {
    need(o && typeof o === "object", "options required");
    need(o.root && o.root.nodeType === 1, "root must be an element");
    need(isNum(o.width) && o.width >= 16 && o.width <= 8192 && isNum(o.height) && o.height >= 16 && o.height <= 8192, "width/height must be finite pixel sizes");
    need(Number.isInteger(o.seed), "seed must be an integer (unseeded boil is refused)");
    var width = o.width, height = o.height, seed = o.seed, content = o.content, design = o.design || {};
    var doc = o.root.ownerDocument;
    validateContent(content, o.assets, width, height);
    var bindings = normalizeBindings(o.eventBindings);
    var plan = compile(content, bindings);

    var boil = content.boil || {};
    var boilOn = boil.enabled !== false, hz = boil.hz == null ? 12 : boil.hz, amp = boil.amp == null ? 1 : boil.amp;
    need(isNum(hz) && hz >= 1 && hz <= 30 && isNum(amp) && amp >= 0 && amp <= 4, "boil.hz must be 1..30 and boil.amp 0..4");
    var look = {};
    var k;
    for (k in (content.look || {})) look[k] = content.look[k];
    look.boil = { hz: hz, amp: boilOn ? amp : 0 };

    var state = { renderer: null, canvas: null, fx: null, fxCtx: null, wrap: null, destroyed: false, ready: false };
    var rejectReady;

    function build() {
      var R = G.Rasan2D;
      need(R && typeof R.mount === "function", "Rasan2D is not loaded. Expected assets/rasan2d/{brush,character,gestures,rasan2d}.js (stage2d.mjs install) before this module; none is downloaded or substituted");
      var wrap = doc.createElement("div");
      wrap.setAttribute("data-medium", PROFILE_ID);
      wrap.style.cssText = "position:relative;width:" + width + "px;height:" + height + "px;overflow:hidden";
      var cv = doc.createElement("canvas"); cv.width = width; cv.height = height; cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%";
      wrap.appendChild(cv);
      var fx = null;
      if (plan.beats.some(function (b) { return b.fx; })) {
        fx = doc.createElement("canvas"); fx.width = width; fx.height = height; fx.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
        wrap.appendChild(fx);
      }
      o.root.appendChild(wrap);
      state.wrap = wrap; state.canvas = cv; state.fx = fx; state.fxCtx = fx ? fx.getContext("2d") : null;
      var rend = R.createRenderer ? R.createRenderer(cv, { width: width, height: height, seed: seed, look: look }) : R.mount(cv, { width: width, height: height, seed: seed, look: look });
      content.actors.forEach(function (a) {
        rend.addActor({ id: a.id, canon: a._canon, position: a.position, scale: a.scale == null ? 1 : a.scale, yaw: a.yaw || "front", emotion: a.emotion || "calm" });
      });
      (content.props || []).forEach(function (p) {
        rend.addProp({ id: p.id, kind: p.kind || "pear", size: p.size, x: p.x, y: p.y, motion: p.motion || [], z: p.z || [] });
      });
      state.renderer = rend;
    }

    function drawFx(t) {
      var ctx = state.fxCtx; if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      var frame = drawingFrame(t, hz), ink = design.ink || (content.look && content.look.inkColor) || "#302921";
      plan.beats.forEach(function (b) {
        if (!b.fx) return;
        var s = b.start + b.fx.start, u = (t - s) / b.fx.duration;
        if (u < 0 || u > 1) return;
        var c = toScreen(width, height, b.fx.at), n = b.fx.rays || 8, r0 = (b.fx.radius || 0.04) * height * (0.6 + 0.8 * u), r1 = r0 * 1.7;
        ctx.save(); ctx.strokeStyle = b.fx.color || ink; ctx.lineWidth = Math.max(2, height * 0.004) * (1 - 0.5 * u); ctx.lineCap = "round";
        for (var i = 0; i < n; i++) {
          // each ray is its own object id, so boil never depends on how many other rays or actors exist
          var j = boilOffset(seed, b.id + ".fx." + i, frame, boilOn ? amp * 3 : 0), ang = (i / n) * Math.PI * 2 + j.dr * 8;
          ctx.beginPath();
          ctx.moveTo(c[0] + Math.cos(ang) * r0 + j.dx, c[1] + Math.sin(ang) * r0 + j.dy);
          ctx.lineTo(c[0] + Math.cos(ang) * r1 + j.dx, c[1] + Math.sin(ang) * r1 + j.dy);
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    var ready = new Promise(function (resolve, reject) { rejectReady = reject; resolve(); }).then(function () {
      build();
      return doc.fonts && doc.fonts.ready ? doc.fonts.ready : undefined;
    }).then(function () { state.ready = true; });
    ready.catch(function () {});

    function setTime(t) {
      need(!state.destroyed, "scene is destroyed");
      need(state.ready, "call setTime after `ready` resolves");
      need(isNum(t), "setTime needs a finite time in seconds");
      var tt = clamp(t, 0, content.duration);
      state.renderer.renderAt(tt, { actions: plan.actions });
      drawFx(tt);
    }

    function describeElements() {
      var out = [];
      content.actors.forEach(function (a) {
        out.push({ id: a.id, role: "character", layer: "character", kind: "rasan2d-actor", anchor: toScreen(width, height, [a.position.x, a.position.y]), canon: a._canon.id,
          editable: ["emotion", "position", "scale", "beat timing via score events"], notEditable: ["lip sync", "rig", "per-pixel drawing"] });
      });
      (content.props || []).forEach(function (p) { out.push({ id: p.id, role: "prop", layer: "character", kind: p.kind || "pear", attachedTo: p.attach ? p.attach.actor : null, editable: ["size", "position"] }); });
      plan.beats.forEach(function (b) { out.push({ id: b.id, role: "beat", native_actions: NATIVE_ACTIONS, start: b.start, resultAt: b.resultAt, holdUntil: b.holdUntil, scoreEvent: b.event, serves: b.serves, fx: b.fx ? b.fx.kind : null }); });
      return out;
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      if (state.renderer && typeof state.renderer.destroy === "function") state.renderer.destroy();
      if (state.wrap && state.wrap.parentNode) state.wrap.parentNode.removeChild(state.wrap);
      state.renderer = null; state.canvas = null; state.fx = null; state.fxCtx = null; state.wrap = null;
    }

    return { ready: ready, setTime: setTime, describeElements: describeElements, destroy: destroy, limitations: plan.limitations.slice(), actions: plan.actions.slice() };
  }

  return { VERSION: VERSION, PROFILE_ID: PROFILE_ID, EXECUTION_ID: EXECUTION_ID, NATIVE_ACTIONS: NATIVE_ACTIONS, createMediumScene: createMediumScene, boilOffset: boilOffset, drawingFrame: drawingFrame, compile: compile, normalizeBindings: normalizeBindings };
});
