/* MediumIsometric (profile P07, "isometric" / "iso-infographic", execution "isometric-system"): a small deterministic isometric diorama.
 *
 *   var scene = MediumIsometric.createMediumScene({ root, width, height, seed, assets, design, content, eventBindings });
 *   scene.ready.then(function () { scene.setTime(2.0); });      // setTime(t) paints the COMPLETE frame at scene-local t (pure)
 *   scene.describeElements();  scene.destroy();
 *
 * What it is: ONE declared orthographic projection (iso30 = true 30 degree axes, or iso2to1 = the 2:1 pixel slope), applied to every
 * object, route and board edge; a per-frame depth order computed from the objects' world boxes (a separating-axis topological sort, ties by
 * id), not by guesswork; staged object assembly (the footprint lands, walls rise, the top lands a few frames later); and routes: a line that
 * leads, then one carrier travelling along it between two known objects. Three flat tones per face are derived from one base colour.
 * Camera = pan + zoom only (explicit keys, zoom interpolated in log space), never rotation, never a vanishing point.
 *
 * What it is not: arbitrary geometry (boxes only), a 3D engine (use Rasan3D when real perspective or geometry is needed), a clock
 * (times come from the score through eventBindings; this file adds none), or a source of facts. A route must say whether it is
 * `factual` (and name its source) or `illustrative` (and is then disclosed in the frame). It never invents infrastructure.
 *
 * Import is side-effect free. No network, fonts, images or randomness. Everything is Canvas 2D drawn from `content`.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.MediumIsometric = factory(root);
})(typeof self !== "undefined" ? self : this, function (G) {
  "use strict";
  var VERSION = "1.0.0";
  var PROFILE_IDS = ["isometric", "iso-infographic"], EXECUTION_ID = "isometric-system";
  var NATIVE_ACTIONS = ["assemble", "route", "reframe"];
  var C30 = Math.sqrt(3) / 2;

  function need(c, m) { if (!c) throw new Error("MediumIsometric: " + m); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function str(v) { return typeof v === "string" && v.length > 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(x) { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); }
  function easeInOut(x) { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function easeBack(x) { x = clamp(x, 0, 1); var c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  // ---- colour: one base hex -> three flat tones (top light, left mid, right dark; shadows a touch cool)
  function hex(c) {
    need(typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c), "colours must be #rrggbb hex strings, got '" + c + "'");
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  function toHex(a) { return "#" + a.map(function (v) { var n = Math.round(clamp(v, 0, 255)).toString(16); return n.length < 2 ? "0" + n : n; }).join(""); }
  function tones(base) {
    var c = hex(base);
    function m(t, w, cool) { return toHex([c[0] + (t[0] - c[0]) * w - cool, c[1] + (t[1] - c[1]) * w - cool * 0.4, c[2] + (t[2] - c[2]) * w + cool * 0.5]); }
    return { top: m([255, 255, 255], 0.28, 0), left: toHex(c), right: m([20, 24, 48], 0.26, 4) };
  }

  // ---- the one projection: world (x, y, z) in grid units -> screen px (before the camera).
  function makeProjection(kind, unit) {
    need(kind === "iso30" || kind === "iso2to1", "projection must be 'iso30' or 'iso2to1' (declared orthographic); perspective is not offered");
    var ax = kind === "iso30" ? C30 : 1, ay = kind === "iso30" ? 0.5 : 0.5, az = kind === "iso30" ? 1 : 1;
    return { kind: kind, unit: unit, project: function (x, y, z) { return [(x - y) * ax * unit, (x + y) * ay * unit - z * az * unit]; } };
  }

  // ---- depth order. Boxes {x,y,z,w,d,h} (min corner + size). In this view a box A is behind B if A is separated from B on
  // the x axis, the y axis or the z axis in the "away from camera" direction. A stable topological sort; ties by id.
  function behind(a, b) { // true when a must be drawn before b
    if (a.x + a.w <= b.x + 1e-9) return a.y < b.y + b.d - 1e-9 ? true : a.z < b.z + b.h - 1e-9;
    if (a.y + a.d <= b.y + 1e-9) return a.x < b.x + b.w - 1e-9 ? true : a.z < b.z + b.h - 1e-9;
    if (a.z + a.h <= b.z + 1e-9) return true;
    return false;
  }
  function depthOrder(boxes) {
    var n = boxes.length, indeg = new Array(n), adj = new Array(n), i, j, out = [], used = new Array(n);
    for (i = 0; i < n; i++) { indeg[i] = 0; adj[i] = []; }
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      if (i === j) continue;
      if (behind(boxes[i], boxes[j]) && !behind(boxes[j], boxes[i])) { adj[i].push(j); indeg[j]++; }
    }
    function key(b) { return (b.x + b.w) + (b.y + b.d) + b.z * 0.5; }
    while (out.length < n) {
      var best = -1;
      for (i = 0; i < n; i++) {
        if (used[i] || indeg[i] > 0) continue;
        if (best < 0 || key(boxes[i]) < key(boxes[best]) || (key(boxes[i]) === key(boxes[best]) && boxes[i].id < boxes[best].id)) best = i;
      }
      if (best < 0) { // a cycle (should not happen for non-overlapping boxes): fall back to the plain key, still deterministic
        for (i = 0; i < n; i++) if (!used[i] && (best < 0 || key(boxes[i]) < key(boxes[best]) || (key(boxes[i]) === key(boxes[best]) && boxes[i].id < boxes[best].id))) best = i;
      }
      used[best] = 1; out.push(boxes[best]);
      for (i = 0; i < adj[best].length; i++) indeg[adj[best][i]]--;
    }
    return out;
  }

  // ---- event bindings (the score is the only timing authority)
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
  function timeOf(spec, bindings, what) {
    if (spec.event != null) {
      need(str(spec.event) && bindings[spec.event] != null, what + ": score event '" + spec.event + "' has no time in eventBindings");
      return bindings[spec.event] + (spec.offset || 0);
    }
    need(isNum(spec.at) && spec.at >= 0, what + ": needs `event` (a score event id) or a scene-local `at` >= 0");
    return spec.at + (spec.offset || 0);
  }

  // ---- validation / compile
  function compile(content, bindings) {
    need(content && typeof content === "object", "content is required");
    need(isNum(content.duration) && content.duration > 0 && content.duration <= 600, "content.duration must be finite seconds > 0");
    var projection = makeProjection(content.projection || "iso30", isNum(content.unit) ? content.unit : 60);
    need(projection.unit > 4 && projection.unit < 2000, "content.unit must be a sane px size per grid unit");
    var ids = {}, objects = [], routes = [], cams = [], byId = {}, limitations = [];

    need(Array.isArray(content.objects) && content.objects.length > 0, "content.objects needs at least one object");
    content.objects.forEach(function (ob) {
      need(ob && str(ob.id) && !ids[ob.id], "object ids must be unique and non-empty");
      ids[ob.id] = 1;
      ["x", "y", "z", "w", "d", "h"].forEach(function (k) { need(isNum(ob[k]), "object " + ob.id + ": " + k + " must be a finite grid number"); });
      need(ob.w > 0 && ob.d > 0 && ob.h > 0, "object " + ob.id + ": w, d, h must be > 0");
      var a = ob.assemble || {}, dur = a.duration == null ? 0.6 : a.duration;
      need(isNum(dur) && dur > 0, "object " + ob.id + ": assemble.duration must be > 0");
      var start = ob.assemble ? timeOf(a, bindings, "object " + ob.id + " assemble") : 0;
      var o = { id: ob.id, x: ob.x, y: ob.y, z: ob.z, w: ob.w, d: ob.d, h: ob.h, color: tones(ob.color || "#9fb8e8"), baseColor: ob.color || "#9fb8e8", label: ob.label || null, role: ob.role || "block", start: start, dur: dur, staged: !!ob.assemble };
      objects.push(o); byId[o.id] = o;
    });

    (content.routes || []).forEach(function (r) {
      var w = "route " + (r && r.id);
      need(r && str(r.id) && !ids[r.id], "route ids must be unique and not collide with object ids"); ids[r.id] = 1;
      need(byId[r.from] && byId[r.to], w + ": `from` and `to` must be existing object ids (no route to nowhere)");
      need(r.status === "factual" || r.status === "illustrative", w + ": status must be 'factual' or 'illustrative' (a link needs a declared meaning)");
      if (r.status === "factual") need(str(r.sourceRef), w + ": a factual route must cite `sourceRef` (the fact it shows)");
      need(Array.isArray(r.via) && r.via.length >= 1, w + ": `via` lists the intermediate [x, y, z] grid points (the line runs from the source's top centre to the target's top centre)");
      var pts = [], f = byId[r.from], t = byId[r.to];
      pts.push([f.x + f.w / 2, f.y + f.d / 2, f.z + f.h]);
      r.via.forEach(function (p) { need(Array.isArray(p) && p.length === 3 && p.every(isNum), w + ": via points are finite [x, y, z]"); pts.push(p.slice()); });
      pts.push([t.x + t.w / 2, t.y + t.d / 2, t.z + t.h]);
      var len = [0], i;
      for (i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
      need(len[len.length - 1] > 0, w + ": zero-length route");
      var at = timeOf(r, bindings, w), lead = r.lead == null ? 0.35 : r.lead, dur = r.duration == null ? 1.2 : r.duration;
      need(isNum(lead) && lead >= 0 && isNum(dur) && dur > 0, w + ": lead >= 0 and duration > 0");
      routes.push({ id: r.id, from: r.from, to: r.to, status: r.status, sourceRef: r.sourceRef || null, label: r.label || null, pts: pts, len: len, at: at, lead: lead, dur: dur, color: r.color || "#2b2f4a", carrier: r.carrier || { kind: "cube", color: "#ff7a59" } });
      if (r.status === "illustrative") limitations.push("route " + r.id + " is illustrative, not a factual link");
    });

    (content.camera || []).forEach(function (k, i) {
      need(k && isNum(k.cx) && isNum(k.cy) && isNum(k.zoom) && k.zoom > 0.1 && k.zoom < 20, "camera key " + i + ": cx, cy (world grid centre) and zoom (0.1..20) must be finite");
      need(k.rotation == null, "camera key " + i + ": rotation is not allowed (isometric camera is pan + zoom only)");
      cams.push({ t: timeOf(k, bindings, "camera key " + i), cx: k.cx, cy: k.cy, zoom: k.zoom, ease: k.ease || "inOut", id: k.id || ("cam-" + i) });
    });
    cams.sort(function (a, b) { return a.t - b.t; });
    if (!cams.length) cams.push({ t: 0, cx: 0, cy: 0, zoom: 1, ease: "inOut", id: "cam-default" });

    var board = content.board ? { x: content.board.x || 0, y: content.board.y || 0, w: content.board.w, d: content.board.d, thick: content.board.thick == null ? 0.4 : content.board.thick, color: tones(content.board.color || "#e7e4f4") } : null;
    if (board) need(isNum(board.w) && isNum(board.d) && board.w > 0 && board.d > 0, "board.w and board.d must be > 0");
    return { projection: projection, objects: objects, byId: byId, routes: routes, cams: cams, board: board, limitations: limitations };
  }

  function cameraAt(cams, t) {
    if (t <= cams[0].t) return cams[0];
    var last = cams[cams.length - 1];
    if (t >= last.t) return last;
    for (var i = 1; i < cams.length; i++) {
      if (t <= cams[i].t) {
        var a = cams[i - 1], b = cams[i], u = (t - a.t) / Math.max(1e-9, b.t - a.t);
        u = b.ease === "linear" ? u : easeInOut(u);
        return { cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * u) };
      }
    }
    return last;
  }

  function polyAt(route, s) { // point on the route polyline at arclength s
    var L = route.len, total = L[L.length - 1], d = clamp(s, 0, 1) * total, i = 1;
    while (i < L.length - 1 && L[i] < d) i++;
    var seg = Math.max(1e-9, L[i] - L[i - 1]), u = clamp((d - L[i - 1]) / seg, 0, 1), a = route.pts[i - 1], b = route.pts[i];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }
  function polyTo(route, s) { // the visible leading part of the line: list of points from the start to arclength s
    var L = route.len, total = L[L.length - 1], d = clamp(s, 0, 1) * total, out = [route.pts[0]], i;
    for (i = 1; i < route.pts.length; i++) {
      if (L[i] <= d) out.push(route.pts[i]);
      else { out.push(polyAt(route, s)); break; }
    }
    return out;
  }

  function createMediumScene(o) {
    need(o && typeof o === "object", "options required");
    need(o.root && o.root.nodeType === 1, "root must be an element");
    need(isNum(o.width) && o.width >= 16 && o.width <= 8192 && isNum(o.height) && o.height >= 16 && o.height <= 8192, "width/height must be finite pixel sizes");
    need(Number.isInteger(o.seed), "seed must be an integer");
    var width = o.width, height = o.height, design = o.design || {}, doc = o.root.ownerDocument;
    var content = o.content, plan = compile(content, normalizeBindings(o.eventBindings));
    var font = design.fontFamily || "sans-serif", ink = design.ink || "#2b2f4a", ground = design.ground || "#f3f1fb";
    var showDisclosure = content.showDisclosure !== false;
    var state = { canvas: null, ctx: null, destroyed: false, ready: false };

    function P(cam, x, y, z) {
      var p = plan.projection.project(x, y, z), c = plan.projection.project(cam.cx, cam.cy, 0);
      return [width / 2 + (p[0] - c[0]) * cam.zoom, height / 2 + (p[1] - c[1]) * cam.zoom];
    }
    function poly(ctx, pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }

    // the height a staged object has at t: footprint lands first, walls rise, the top lands a few frames after the walls stop
    function heightAt(ob, t) {
      if (!ob.staged) return ob.h;
      var u = (t - ob.start) / ob.dur;
      if (u <= 0) return 0;
      var wall = easeBack(clamp(u / 0.8, 0, 1));
      return ob.h * Math.max(0.02, wall);
    }
    function drawBox(ctx, cam, b, color, h) {
      if (h <= 0) return;
      var x0 = b.x, y0 = b.y, z0 = b.z, x1 = b.x + b.w, y1 = b.y + b.d, z1 = b.z + h;
      poly(ctx, [P(cam, x0, y1, z0), P(cam, x1, y1, z0), P(cam, x1, y1, z1), P(cam, x0, y1, z1)], color.left);   // the face toward -x/+y: left
      poly(ctx, [P(cam, x1, y1, z0), P(cam, x1, y0, z0), P(cam, x1, y0, z1), P(cam, x1, y1, z1)], color.right);  // the face toward +x: right
      poly(ctx, [P(cam, x0, y0, z1), P(cam, x1, y0, z1), P(cam, x1, y1, z1), P(cam, x0, y1, z1)], color.top);
    }

    function draw(t) {
      var ctx = state.ctx, cam = cameraAt(plan.cams, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = ground; ctx.fillRect(0, 0, width, height);
      ctx.lineJoin = "round";
      if (plan.board) {
        var b = plan.board, tn = b.color, tk = b.thick;
        poly(ctx, [P(cam, b.x, b.y + b.d, 0), P(cam, b.x + b.w, b.y + b.d, 0), P(cam, b.x + b.w, b.y + b.d, -tk), P(cam, b.x, b.y + b.d, -tk)], tn.left);
        poly(ctx, [P(cam, b.x + b.w, b.y + b.d, 0), P(cam, b.x + b.w, b.y, 0), P(cam, b.x + b.w, b.y, -tk), P(cam, b.x + b.w, b.y + b.d, -tk)], tn.right);
        poly(ctx, [P(cam, b.x, b.y, 0), P(cam, b.x + b.w, b.y, 0), P(cam, b.x + b.w, b.y + b.d, 0), P(cam, b.x, b.y + b.d, 0)], tn.top);
      }
      // drawables: objects at their current height, and each moving carrier as a small box, all sorted together
      var items = [];
      plan.objects.forEach(function (ob) {
        var h = heightAt(ob, t);
        if (h > 0) items.push({ id: ob.id, x: ob.x, y: ob.y, z: ob.z, w: ob.w, d: ob.d, h: h, kind: "object", ref: ob });
      });
      var routeLines = [];
      plan.routes.forEach(function (r) {
        var lineP = clamp((t - r.at) / Math.max(1e-9, r.lead), 0, 1);
        if (r.lead === 0 && t >= r.at) lineP = 1;
        if (lineP > 0) routeLines.push({ r: r, pts: polyTo(r, lineP) });
        var cp = (t - (r.at + r.lead)) / r.dur;
        if (cp >= 0 && cp <= 1) { // nothing travels before its line has led it
          var q = polyAt(r, easeInOut(cp)), sz = r.carrier.size || 0.35;
          items.push({ id: r.id + ".carrier", x: q[0] - sz / 2, y: q[1] - sz / 2, z: q[2], w: sz, d: sz, h: sz, kind: "carrier", ref: r });
        }
      });
      // route lines first (they sit on the ground/tops), then depth-ordered solids
      routeLines.forEach(function (rl) {
        ctx.save(); ctx.strokeStyle = rl.r.color; ctx.lineWidth = Math.max(1.5, 2 * cam.zoom); ctx.setLineDash(rl.r.status === "illustrative" ? [10 * cam.zoom, 7 * cam.zoom] : []);
        ctx.beginPath();
        rl.pts.forEach(function (p, i) { var s = P(cam, p[0], p[1], p[2]); if (i === 0) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]); });
        ctx.stroke(); ctx.restore();
      });
      depthOrder(items).forEach(function (it) {
        if (it.kind === "object") drawBox(ctx, cam, it, it.ref.color, it.h);
        else drawBox(ctx, cam, it, tones(it.ref.carrier.color || "#ff7a59"), it.h);
      });
      // labels: exact text, never wobbled or scaled below a legible size, placed above the object top with a leader and ground halo
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      plan.objects.forEach(function (ob) {
        if (!ob.label || heightAt(ob, t) < ob.h * 0.98) return;
        var top = P(cam, ob.x + ob.w / 2, ob.y + ob.d / 2, ob.z + ob.h), size = Math.max(14, (design.labelSize || 22)), tip = [top[0] + 36, top[1] - 44];
        ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(tip[0] + 14, tip[1]); ctx.stroke();
        ctx.font = "600 " + size + "px " + font; ctx.lineWidth = 6; ctx.strokeStyle = ground; ctx.strokeText(ob.label, tip[0] + 20, tip[1]); ctx.fillStyle = ink; ctx.fillText(ob.label, tip[0] + 20, tip[1]);
      });
      if (showDisclosure && plan.routes.some(function (r) { return r.status === "illustrative" && t >= r.at; })) {
        ctx.font = "500 " + Math.max(14, (design.labelSize || 22) * 0.8) + "px " + font; ctx.fillStyle = ink; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
        ctx.fillText(content.disclosureText || "Illustrative routes, not a real network", width - 32, height - 24);
      }
    }

    var ready = Promise.resolve().then(function () {
      var cv = doc.createElement("canvas"); cv.width = width; cv.height = height; cv.setAttribute("data-medium", "isometric");
      cv.style.cssText = "display:block;width:" + width + "px;height:" + height + "px";
      o.root.appendChild(cv); state.canvas = cv; state.ctx = cv.getContext("2d");
      need(state.ctx, "2D canvas context unavailable");
      return doc.fonts && doc.fonts.ready ? doc.fonts.ready : undefined;
    }).then(function () { state.ready = true; });
    ready.catch(function () {});

    function setTime(t) {
      need(!state.destroyed, "scene is destroyed");
      need(state.ready, "call setTime after `ready` resolves");
      need(isNum(t), "setTime needs a finite time in seconds");
      draw(clamp(t, 0, content.duration));
    }

    function describeElements() {
      var out = [];
      plan.objects.forEach(function (ob) {
        out.push({ id: ob.id, role: ob.role, layer: "environment", kind: "iso-box", world: { x: ob.x, y: ob.y, z: ob.z, w: ob.w, d: ob.d, h: ob.h }, label: ob.label, assembles: ob.staged ? { start: ob.start, duration: ob.dur } : null, native_actions: ["assemble"], editable: ["colour", "label", "grid position and size", "timing via score events"] });
      });
      plan.routes.forEach(function (r) {
        out.push({ id: r.id, role: "route", layer: "annotation", from: r.from, to: r.to, status: r.status, sourceRef: r.sourceRef, label: r.label, native_actions: ["route"], disclosure: r.status === "illustrative" ? "illustrative link, not a factual one" : null, editable: ["via points", "timing via score events"] });
      });
      plan.cams.forEach(function (k) { out.push({ id: k.id, role: "camera-key", native_actions: ["reframe"], t: k.t, cx: k.cx, cy: k.cy, zoom: k.zoom }); });
      return out;
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      if (state.canvas && state.canvas.parentNode) state.canvas.parentNode.removeChild(state.canvas);
      state.canvas = null; state.ctx = null;
    }

    return { ready: ready, setTime: setTime, describeElements: describeElements, destroy: destroy, projection: plan.projection.kind, limitations: plan.limitations.slice() };
  }

  return { VERSION: VERSION, PROFILE_IDS: PROFILE_IDS, EXECUTION_ID: EXECUTION_ID, NATIVE_ACTIONS: NATIVE_ACTIONS, createMediumScene: createMediumScene, makeProjection: makeProjection, depthOrder: depthOrder, tones: tones, compile: compile, cameraAt: cameraAt, normalizeBindings: normalizeBindings };
});
