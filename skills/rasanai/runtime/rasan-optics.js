/* RasanOptics: layer-targeted optical treatments for paused GSAP timelines. Status: implemented_unvalidated (never run).
 *
 * Why it exists (audit, references/optical-treatments.md): RasanCamera.dof writes `style.filter` on the layers it owns, RasanShape.iris/flood is a hard-edged
 * circle, and nothing else lets a plan say "this layer, this operation, this interval, these protected layers" while keeping ONE writer per element. So this file is a
 * small composer, not a renderer: it uses CSS filter, CSS mask-image and one SVG filter (feTurbulence + feDisplacementMap, feGaussianBlur) that already ship in the browser.
 *
 *   RasanOptics.apply(tl, plan, { frame: {w, h}, resolve?: id => Element })  ->  { owners, skipped, ops }
 *     plan = the `runtime` block of planOptics(): { ops: [{ id, kind, channel, order, select[], protect[], interval:[a,b] (score seconds), sampling, params:{name:keys},
 *                                                           mask?:{shape:"radial"|"rect", ...}, stylized?:true, axis?:"x"|"y", seed?, label }] }
 *     keys are [[t_s, value], ...] in the SAME score seconds as the timeline; fn per param: "linear" | "smooth" | "hold".
 *   RasanOptics.sample(op, t) -> { param: value }     the pure evaluation (same function the setter uses; lib/optical-treatments.mjs sampleOp mirrors it)
 *   RasanOptics.owner(el)     -> the writer id for an element ("RasanOptics") or null
 *
 * Rules the code enforces:
 *   * One writer per element: every operation on an element is composed into ONE filter string (and one mask) by one tween. A second apply() on an element that is already
 *     owned throws; so does an element carrying data-rasan-filter-owner="RasanCamera" (the camera's depth of field), unless the plan opted in to compose (not supported here).
 *   * Layers listed in `protect` (and any element inside one, or containing one that is protected) are never given a blur, distortion or mask by this operation.
 *   * Pure function of the timeline's time: the setter evaluates keys at t = a + p*(b-a); no Math.random, no clock, no rAF. Seeded turbulence (the `seed` attribute).
 *   * Units: blur and distortion params are FRACTIONS OF FRAME WIDTH (px = v * frame.w); filters run before the layer's transform, so edges scale with the layer.
 *   * Bounded cost: at most 8 owned elements, 4 filter functions each, one SVG filter per distortion op; a blur above 0.08 of frame width is clamped.
 *   * Stylized distortion is a displacement map, never refraction (the label stays "stylized").
 */
(function (root) {
  "use strict";
  var VERSION = "1.0.0";
  var NS = "http://www.w3.org/2000/svg";
  var OWNER = "RasanOptics";
  var MAX_OWNED = 8, MAX_FUNCS = 4, MAX_BLUR = 0.08;
  var owners = typeof WeakMap !== "undefined" ? new WeakMap() : null;

  function need(cond, msg) { if (!cond) throw new Error("RasanOptics: " + msg); }
  function gs() { need(root.gsap, "GSAP must load before rasan-optics.js"); return root.gsap; }
  function num(x, d) { return typeof x === "number" && isFinite(x) ? x : d; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ------------------------------------------------------------------ pure evaluation
  function evalKeys(keys, t, fn) {
    if (!keys || !keys.length) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    var last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    for (var i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        var a = keys[i - 1], b = keys[i], u = (t - a[0]) / Math.max(1e-9, b[0] - a[0]);
        if (fn === "hold") return a[1];
        if (fn === "smooth") u = u * u * (3 - 2 * u);
        return a[1] + (b[1] - a[1]) * u;
      }
    }
    return last[1];
  }
  // op.params: { name: { fn, keys } } or the plan's [{param, fn, keys}] list
  function sample(op, t) {
    var out = {}, ps = op.params;
    if (Array.isArray(ps)) ps.forEach(function (p) { out[p.param] = evalKeys(p.keys, t, p.fn); });
    else for (var k in ps) if (Object.prototype.hasOwnProperty.call(ps, k)) out[k] = evalKeys(ps[k].keys || ps[k], t, ps[k].fn);
    return out;
  }

  // ------------------------------------------------------------------ elements
  function elementsFor(op, o) {
    var out = [];
    (op.select || []).forEach(function (id) {
      var e = null;
      if (o.resolve) e = o.resolve(id);
      if (!e) e = document.getElementById(String(id).replace(/^#/, "")) || (/^[.#\[]/.test(id) ? document.querySelector(id) : document.querySelector('[data-layer="' + id + '"]'));
      need(e, 'no element for layer "' + id + '" (operation ' + op.id + ")");
      if (out.indexOf(e) < 0) out.push(e);
    });
    return out;
  }
  function protectedEls(op, o) {
    var out = [];
    (op.protect || []).forEach(function (id) {
      var e = o.resolve ? o.resolve(id) : null;
      if (!e) e = document.getElementById(String(id).replace(/^#/, "")) || (/^[.#\[]/.test(id) ? document.querySelector(id) : document.querySelector('[data-layer="' + id + '"]'));
      if (e) out.push(e);
    });
    return out;
  }
  function touchesProtected(el, prot) {
    for (var i = 0; i < prot.length; i++) if (prot[i] === el || prot[i].contains(el) || el.contains(prot[i])) return prot[i];
    return null;
  }

  // ------------------------------------------------------------------ SVG filters (distortion, directional blur): one def per operation
  var defsEl = null;
  function defs() {
    if (defsEl && defsEl.isConnected) return defsEl;
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("width", "0"); s.setAttribute("height", "0"); s.setAttribute("aria-hidden", "true"); s.setAttribute("data-rasan-optics-defs", "");
    s.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    defsEl = document.createElementNS(NS, "defs"); s.appendChild(defsEl);
    (document.body || document.documentElement).appendChild(s);
    return defsEl;
  }
  function svgFilter(id, inner) {
    var f = document.createElementNS(NS, "filter");
    f.setAttribute("id", id); f.setAttribute("x", "-10%"); f.setAttribute("y", "-10%"); f.setAttribute("width", "120%"); f.setAttribute("height", "120%");
    f.setAttribute("color-interpolation-filters", "sRGB");
    f.innerHTML = inner; defs().appendChild(f);
    return f;
  }

  // ------------------------------------------------------------------ one writer per element
  function compose(el, ops, W, state) {
    // ops sorted by plan order; each contributes at most one filter function (or the mask)
    var funcs = [], mask = "";
    for (var i = 0; i < ops.length; i++) {
      var s = ops[i].s, op = ops[i].op, k = op.kind;
      if (k === "focus_blur") { var b = clamp(num(s.blur, 0), 0, MAX_BLUR) * W; if (b > 0.05) funcs.push("blur(" + r3(b) + "px)"); }
      else if (k === "motion_blur") {
        var sd = clamp(num(s.blur, 0), 0, MAX_BLUR) * W; ops[i].f.setAttribute("data-sd", r3(sd));
        ops[i].f.querySelector("feGaussianBlur").setAttribute("stdDeviation", op.axis === "y" ? "0 " + r3(sd) : r3(sd) + " 0");
        if (sd > 0.05) funcs.push("url(#" + ops[i].fid + ")");
      } else if (k === "stylized_distortion") {
        var sc = clamp(num(s.displace, 0), 0, 0.05) * W;
        ops[i].f.querySelector("feDisplacementMap").setAttribute("scale", r3(sc));
        if (sc > 0.05) funcs.push("url(#" + ops[i].fid + ")");
      } else if (k === "soft_material") {
        // a coherent soft surface: a little diffusion plus lifted blacks and a touch of brightness; never a whole-frame glow
        var soft = clamp(num(s.softness, 0), 0, 1), sb = clamp(num(s.blur, 0), 0, MAX_BLUR / 4) * W;
        if (sb > 0.05) funcs.push("blur(" + r3(sb) + "px)");
        if (soft > 0.001) funcs.push("contrast(" + r3(1 - 0.12 * soft) + ") brightness(" + r3(1 + 0.05 * soft) + ")");
      } else if (k === "edge_treatment") {
        var ew = clamp(num(s.width, 0), 0, 0.004) * W, ea = clamp(num(s.alpha, 0), 0, 1);
        if (ew > 0.05 && ea > 0.001) funcs.push("drop-shadow(0 0 " + r3(ew) + "px " + (op.edge_color || "rgba(255,255,255," + r3(ea) + ")") + ")");
      } else if (k === "mask") {
        var m = op.mask || {};
        if (m.shape === "rect") {
          var cut = clamp(num(s.inset, 0), 0, 0.5) * 100;
          mask = cut > 0.01 ? "inset(" + r3(cut) + "%)" : "";
          state.clip = true;
        } else {
          var rad = clamp(num(s.radius, 1.5), 0, 3) * 100, fe = clamp(num(s.feather, 0.1), 0, 1) * 100, cx = num(s.cx, num(m.cx, 0.5)) * 100, cy = num(s.cy, num(m.cy, 0.5)) * 100;
          var inner = Math.max(0, rad - fe);
          mask = "radial-gradient(circle at " + r3(cx) + "% " + r3(cy) + "%, #000 " + r3(inner) + "%, transparent " + r3(rad) + "%)";
        }
      }
    }
    if (funcs.length > MAX_FUNCS) funcs.length = MAX_FUNCS; // cost bound
    el.style.filter = funcs.join(" ");
    if (state.clip) { el.style.clipPath = mask; }
    else { el.style.webkitMaskImage = mask; el.style.maskImage = mask; }
  }

  function apply(tl, plan, o) {
    o = o || {};
    need(tl && typeof tl.fromTo === "function", "the first argument must be a GSAP timeline");
    need(plan && Array.isArray(plan.ops), "plan.ops is required (the runtime block of planOptics)");
    gs();
    var W = num(o.frame && o.frame.w, 1920), byEl = [], skipped = [], seen = 0;
    plan.ops.slice().sort(function (a, b) { return num(a.order, 0) - num(b.order, 0); }).forEach(function (op) {
      var iv = op.interval; need(iv && iv[1] > iv[0], "operation " + op.id + " needs interval [start_s, end_s] in score seconds");
      var prot = protectedEls(op, o), els = elementsFor(op, o);
      els.forEach(function (el) {
        var hit = touchesProtected(el, prot);
        if (hit) { skipped.push({ op: op.id, reason: "protected_layer", layer: hit.id || hit.getAttribute("data-layer") || null }); return; }
        need(!(el.getAttribute && el.getAttribute("data-rasan-filter-owner") && el.getAttribute("data-rasan-filter-owner") !== OWNER), 'element already owned by "' + el.getAttribute("data-rasan-filter-owner") + '": give that filter one owner (operation ' + op.id + ")");
        var slot = null;
        for (var i = 0; i < byEl.length; i++) if (byEl[i].el === el) slot = byEl[i];
        if (!slot) {
          need(!(owners && owners.get(el)), "this element already has an optics writer: compose every operation for it in one apply() call (operation " + op.id + ")");
          need(byEl.length < MAX_OWNED, "more than " + MAX_OWNED + " owned elements: cost bound");
          slot = { el: el, ops: [], state: {} }; byEl.push(slot);
        }
        var rec = { op: op, s: {}, f: null, fid: null };
        if (op.kind === "motion_blur") {
          rec.fid = "ro-mb-" + op.id.replace(/[^A-Za-z0-9_-]/g, "_") + "-" + byEl.length;
          rec.f = svgFilter(rec.fid, '<feGaussianBlur in="SourceGraphic" stdDeviation="0 0"/>');
        } else if (op.kind === "stylized_distortion") {
          rec.fid = "ro-sd-" + op.id.replace(/[^A-Za-z0-9_-]/g, "_") + "-" + byEl.length;
          rec.f = svgFilter(rec.fid, '<feTurbulence type="fractalNoise" baseFrequency="' + num(op.frequency, 0.012) + '" numOctaves="1" seed="' + (num(op.seed, 1) | 0) + '" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G"/>');
          el.setAttribute("data-rasan-stylized", op.label || "stylized distortion");
        }
        slot.ops.push(rec); seen++;
      });
    });
    // exactly one tween per element: it spans the union of its operations' intervals and evaluates each operation at the tween's own time
    byEl.forEach(function (slot) {
      var a = Infinity, b = -Infinity;
      slot.ops.forEach(function (r) { a = Math.min(a, r.op.interval[0]); b = Math.max(b, r.op.interval[1]); });
      slot.ops.sort(function (x, y) { return num(x.op.order, 0) - num(y.op.order, 0); });
      slot.el.setAttribute("data-rasan-filter-owner", OWNER); if (owners) owners.set(slot.el, OWNER);
      var v = 0, proxy = {};
      function evalAt(t) {
        slot.ops.forEach(function (r) {
          var iv = r.op.interval;
          r.s = t >= iv[0] && t <= iv[1] ? sample(r.op, t) : sample(r.op, t < iv[0] ? iv[0] : iv[1]);
          if (t < iv[0] || t > iv[1]) { for (var k in r.s) if (!r.op.hold_outside) r.s[k] = 0; if (r.op.kind === "mask") r.s.radius = r.op.hold_outside ? r.s.radius : 3; }
        });
        compose(slot.el, slot.ops, W, slot.state);
      }
      Object.defineProperty(proxy, "p", { enumerable: true, get: function () { return v; }, set: function (x) { v = x; evalAt(a + x * (b - a)); } });
      evalAt(a);
      tl.fromTo(proxy, { p: 0 }, { p: 1, duration: Math.max(1e-4, b - a), ease: "none", immediateRender: false }, a);
    });
    return { owners: byEl.map(function (s) { return s.el; }), skipped: skipped, ops: seen };
  }

  root.RasanOptics = { version: VERSION, apply: apply, sample: sample, evalKeys: evalKeys, owner: function (el) { return owners ? owners.get(el) || null : null; } };
})(typeof window !== "undefined" ? window : this);
