/*
 * Rasan3D recipes: shared helpers (Motion Studio W08). Original code, RasanAI MIT. No dependencies.
 *
 * A recipe is a module `{ id, label, summary, params, requires, plan(opts), camera(opts), build(k, opts) }`:
 *   plan(opts)   pure: validated params -> { duration, hits, ... } (no THREE, runs in Node; what the static check calls)
 *   camera(opts) pure: the declarative `camera:` keys for Rasan3D.stage (the gate reads eases from there)
 *   build(k, opts) async, inside the stage's build(k): makes the world once, returns
 *                { duration, hits, objects, pose(t, k), warnings, ... }; pose is a pure function of t (call it from the stage's pose)
 * `k` is the Rasan3D kit. Nothing here owns a renderer, a clock, a loop or a random source: motion is a function of t only,
 * on the scene's shared paused GSAP timeline. Assets are project-relative local paths (no URLs, no `..`).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") { window.RasanRecipesCommon = api; window.RasanRecipes = api.registry; }
})(this, function () {
  "use strict";
  var recipes = {};
  var registry = {
    recipes: recipes,
    register: function (r) { recipes[r.id] = r; return r; },
    get: function (id) { if (!recipes[id]) throw new Error("unknown Rasan3D recipe: " + id); return recipes[id]; },
    list: function () { return Object.keys(recipes).sort(); },
  };

  var DEG = Math.PI / 180;

  // Validate and clamp opts against a params spec. Unknown enum values and non-finite numbers throw: a recipe never guesses.
  function resolve(spec, opts) {
    opts = opts || {};
    var out = {}, name;
    for (name in spec) {
      var s = spec[name], v = opts[name];
      if (v === undefined || v === null) v = s.default;
      if (s.type === "number") {
        v = Number(v);
        if (!isFinite(v)) throw new Error("recipe param " + name + " must be a finite number");
        v = Math.min(s.max, Math.max(s.min, v));
      } else if (s.type === "enum") {
        if (s.enum.indexOf(v) < 0) throw new Error("recipe param " + name + " must be one of " + s.enum.join(", ") + " (got " + JSON.stringify(v) + ")");
      } else if (s.type === "boolean") v = !!v;
      else if (s.type === "string") v = v == null ? "" : String(v);
      out[name] = v;
    }
    return out;
  }
  // Snap a time to the frame grid so an event lands on a real frame, never between two.
  function snap(t, fps) { return Math.round(t * fps) / fps; }
  // Local assets only: project-relative, no scheme, no protocol-relative, no parent escape, no absolute path.
  function localAsset(p, what) {
    if (typeof p !== "string" || !p) throw new Error((what || "asset") + ": a project-relative local path is required");
    if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.indexOf("//") === 0 || p.charAt(0) === "/" || p.indexOf("\\") >= 0 || p.split("/").indexOf("..") >= 0) {
      throw new Error((what || "asset") + ": only project-relative local files are allowed (got " + JSON.stringify(p) + ")");
    }
    return p;
  }
  // width of an SVG in its own units (viewBox, else width attr), to size an extrusion depth as a share of the width
  function svgWidthOf(text) {
    var m = /viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+[\d.]+/.exec(text) || /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/.exec(text);
    return m ? Number(m[1]) : 100;
  }
  // A local text asset (an SVG): the page's own fetch of a project-relative path
  function readLocalText(url, what) { return fetch(localAsset(url, what)).then(function (r) { if (!r.ok) throw new Error(what + " not found: " + url); return r.text(); }); }
  function noop() {}
  function boxSize(T, obj) { var b = new T.Box3().setFromObject(obj), s = new T.Vector3(); b.getSize(s); return s; }
  // Full-frame lens maths: the sensor is 36 mm on the frame's long side, so the width seen at distance d is 36 d / mm.
  function visibleWidth(d, mm) { return (36 * d) / mm; }
  return { registry: registry, resolve: resolve, snap: snap, localAsset: localAsset, svgWidthOf: svgWidthOf, readLocalText: readLocalText, noop: noop, boxSize: boxSize, visibleWidth: visibleWidth, DEG: DEG };
});
