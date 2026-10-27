// Procedural forms, fields and spatial choreography (W15): an inventory of what the CURRENT runtime can already do and a planner that selects among it.
// It PLANS and VALIDATES. It renders nothing, calls no model, owns no clock (every interval is seconds on the existing score, motion/score.json, checked when
// a score is given) and adds no render engine. Operations map onto mechanics that already exist:
//   forms / instancing   Rasan3DLib.instanceField (stage3d/glsl.js, cell-seeded, history-free), Rasan3DLib.tube (spatial curve), RasanShape.scatter / split
//   paths / contours     RasanShape.drawOn / followPath / morph (flubber), Rasan3DLib.tube
//   fields               RasanSim.magnet / follow / jelly / verlet (pre-baked at 240 Hz into a table, sampled by time), RasanCamera plateField / flowGround, instanceField.place
//   camera / space       RasanCamera (DOM 3D stage: dolly, truck, orbit, push, keys, rack) and the Rasan3D camera keys; references/scale-dive.md for representation levels
//   materials            Rasan3D k.material(matte|clay|ceramic|plastic|chrome|brushed-metal|glass|frosted-glass|gummy|emissive|...); RasanCamera glass / sheen / rimLight (2D surrogates)
// Unknown capability stays "uncertain" (source-inspected is not exercised); an operation the stack cannot do is "unavailable" with the reason and, where one exists,
// a named alternative. A flat card is never presented as a sculptural, reflective or translucent form: a 2D surrogate is `material_deviation` unless the plan
// explicitly accepts it, and then it is disclosed in the op. Nothing here promises arbitrary topology, booleans, fluid or rigid-body physics.
//
// Representation changes ("one object -> many -> field -> environment", "detail -> system -> consequence") are an explicit `representation` relation: which
// identity survives, which properties may change, continuous or editorial. It never carries a product or scientific claim; abstract fields are not evidence.
//
// Determinism: every form/field names a seed; time comes only from the score. A param that asks for wall-clock, frame history or unseeded randomness is an error.
// Host cost is bounded and reported per metric against limits the caller supplies from the real host (defaults are marked planning_default, not measurements);
// over a limit the op is unavailable with budget_exhausted, never silently downgraded. W10 admits the cost; this module only reports it.
//
// Consumers (proposed wiring, not done here): the scene builder packet for a spatial beat carries the planSpatialOps result; its `digest` joins the scene's input
// identity; INT-ENGINE-A passes the existing runtime files the ops need via runtimeFilesFor(contract, extra) in lib/medium-wiring.mjs; W09 reviews the camera
// move together with the operation; W10 admits `hostCost`. Shares ID_RE and digestOf with lib/composition-anchors.mjs, error codes with lib/creative-policy.mjs.
import fs from "node:fs";
import { createRequire } from "node:module";
import { ID_RE, digestOf } from "./composition-anchors.mjs";
import { CREATIVE_ERROR_CODES } from "./creative-policy.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const STATE_RANK = { available: 0, uncertain: 1, unavailable: 2 };
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => typeof v === "number" && Number.isFinite(v);
const worst = (states) => states.reduce((a, s) => (STATE_RANK[s] > STATE_RANK[a] ? s : a), "available");
const err = (code, ref, message) => ({ code: CREATIVE_ERROR_CODES[code] || code, ref, message });

export const SPACES = ["dom3d", "rasan3d"]; // the two coordinate systems that exist; there is no shared transform between them
export const SCALE_LEVELS = ["detail", "object", "many", "field", "system", "environment", "consequence"];
export const MATERIAL_KINDS = { matte: ["matte", "clay", "ceramic", "plastic", "concrete", "paper"], reflective: ["chrome", "brushed-metal"], translucent: ["glass", "frosted-glass", "gummy"], emissive: ["emissive"] };

// Static, source-inspected inventory. `dependencies` are checked on disk by capabilityInventory(); `states` keep the four evidence levels apart (spec 32).
// `state` is the planning state: available = deterministic mechanism present and documented; uncertain = present but not exercised for this use, or approximated;
// unavailable = the stack has no mechanism.
const OPS = {
  // ---- forms and instancing
  instance_field: { family: "form", space: ["rasan3d"], state: "available", mechanics: "Rasan3DLib.instanceField({geometry,material,cell,count,around,wrap,plane,place,seed}); per-cell position/yaw/scale/colour/visibility from a seeded generator", cost: "instances", dependencies: ["stage3d/glsl.js", "stage3d/rasan3d.js"], notes: "variation of position, scale, rotation, colour and presence per cell; no state change over time unless the scene's pose(t) drives the place() inputs" },
  scatter_repeat: { family: "form", space: ["dom3d"], state: "available", mechanics: "RasanShape.scatter / cloned spans with seeded offsets", cost: "elements", dependencies: ["runtime/rasan-shape.js"], notes: "DOM elements, not instances; keep counts to what the page can lay out" },
  spatial_curve: { family: "path", space: ["rasan3d"], state: "available", mechanics: "Rasan3DLib.tube(points|fn(t), {radius,segments,radial,closed}) with uv = arc length; thicken by radius, draw by uv", cost: "instances", dependencies: ["stage3d/glsl.js"], notes: "a contour becomes a spatial curve by sampling a path; topology change is not offered" },
  path_draw: { family: "path", space: ["dom3d"], state: "available", mechanics: "RasanShape.drawOn / followPath (paused GSAP timeline)", cost: "elements", dependencies: ["runtime/rasan-shape.js"], notes: "" },
  path_morph: { family: "path", space: ["dom3d"], state: "uncertain", mechanics: "RasanShape.morph (flubber interpolation between two SVG paths)", cost: "elements", dependencies: ["runtime/rasan-shape.js"], notes: "needs flubber.min.js loaded; contour compatibility is unproven until exercised under authorization", needs: ["rasan-shape/flubber.min.js"] },
  // ---- fields (authored functions)
  field_attraction: { family: "field", space: ["dom3d"], state: "available", mechanics: "RasanSim.magnet(target, bodies, {radius,pull,home,damp,seed,duration}) baked to a table, sampled by time", cost: "sim", dependencies: ["runtime/rasan-sim.js"], notes: "2D bodies on the page; attraction to a path-defined target" },
  field_follow_chain: { family: "field", space: ["dom3d"], state: "available", mechanics: "RasanSim.follow / verlet (chain, rope)", cost: "sim", dependencies: ["runtime/rasan-sim.js"], notes: "" },
  field_flow: { family: "field", space: ["dom3d"], state: "uncertain", mechanics: "RasanCamera plateField / flowGround (seeded vnoise flow plate)", cost: "post", dependencies: ["runtime/rasan-camera.js"], notes: "a field plate, not per-form flow; its cost is an SVG filter chain" },
  field_wave: { family: "field", space: ["rasan3d", "dom3d"], state: "uncertain", mechanics: "pose(t) drives instanceField.place inputs, or a vertex-shader chunk (glsl.field); DOM: per-element GSAP phase offsets", cost: "instances", dependencies: ["stage3d/glsl.js"], notes: "pure function of time and cell, deterministic by construction; no shipped helper, scene-authored, unexercised" },
  field_separation: { family: "field", space: ["rasan3d", "dom3d"], state: "uncertain", mechanics: "authored per-cell function, or a baked 2D RasanSim table; no neighbour-aware solver", cost: "sim", dependencies: ["runtime/rasan-sim.js"], notes: "separation/aggregation between neighbours is not a shipped solver; authored as a function of cell and time, or baked on the page plane" },
  field_aggregation: { family: "field", space: ["rasan3d", "dom3d"], state: "uncertain", mechanics: "as field_separation (attraction toward authored targets over time)", cost: "sim", dependencies: ["runtime/rasan-sim.js"], notes: "see field_separation" },
  field_coherent_flow_3d: { family: "field", space: ["rasan3d"], state: "unavailable", mechanics: null, cost: null, dependencies: [], notes: "no 3D fluid or curl-noise advection helper; author a deterministic function of (cell, time) via field_wave instead, and disclose it is not a flow simulation", alternative: "field_wave" },
  deform_jelly: { family: "deform", space: ["dom3d"], state: "available", mechanics: "RasanSim.jelly (squash and stretch along velocity, baked)", cost: "sim", dependencies: ["runtime/rasan-sim.js"], notes: "2D element deformation only" },
  deform_mesh_3d: { family: "deform", space: ["rasan3d"], state: "unavailable", mechanics: null, cost: null, dependencies: [], notes: "no soft-body, cloth or sampled mesh simulation; subject-specific 3D deformation needs authored morph targets or a baked clip supplied as an asset", alternative: null },
  // ---- camera through space
  camera_dom3d: { family: "camera", space: ["dom3d"], state: "available", mechanics: "RasanCamera.stage (dolly, truck, orbit, push, pan, tilt, roll, zoom, keys, rack); cam.perspective(t), cam.place(el,p) are the shared transform", cost: "post", dependencies: ["runtime/rasan-camera.js"], notes: "one camera per stage; every layer in the stage shares it by construction" },
  camera_rasan3d: { family: "camera", space: ["rasan3d"], state: "available", mechanics: "Rasan3D camera keys (stage3d/rasan3d.js); screen projection through the stage's project()", cost: "post", dependencies: ["stage3d/rasan3d.js"], notes: "the 3D camera; frames are a pure function of scene time" },
  // ---- materials
  material_3d: { family: "material", space: ["rasan3d"], state: "available", mechanics: "k.material(name, {color}) in stage3d/rasan3d.js: matte|clay|ceramic|plastic|concrete|paper (matte), chrome|brushed-metal (reflective), glass|frosted-glass|gummy (translucent), emissive", cost: "post", dependencies: ["stage3d/rasan3d.js"], notes: "reflective and translucent look depends on the environment map and the final-quality transmission pass; unexercised for any specific form", kinds: ["matte", "reflective", "translucent", "emissive"] },
  material_2d_surrogate: { family: "material", space: ["dom3d"], state: "uncertain", mechanics: "RasanCamera glass / sheen / rimLight / shadowLadder / halation on DOM layers", cost: "post", dependencies: ["runtime/rasan-camera.js"], notes: "a surface treatment on a flat layer: matte and emissive read fine; reflective and translucent solids are approximations, never the real thing", kinds: ["matte", "emissive"], surrogate_for: ["reflective", "translucent"] },
  refraction_arbitrary: { family: "material", space: ["rasan3d"], state: "unavailable", mechanics: null, cost: null, dependencies: [], notes: "no custom refraction or caustics pass beyond three.js MeshPhysicalMaterial transmission; disclose before promising it", alternative: "material_3d" },
  lens_distortion: { family: "material", space: ["dom3d"], state: "uncertain", mechanics: "RasanCamera warpDef (SVG displacement) and chromaticSplit", cost: "post", dependencies: ["runtime/rasan-camera.js"], notes: "SVG filter based; scene-authored, unexercised for full-frame distortion" },
};

function inspectDeps(deps) {
  return deps.map((d) => ({ file: d, present: fs.existsSync(ROOT + d) }));
}

// -> { version, ops: { id: { family, space[], state, mechanics, cost, dependencies:[{file,present}], states:{source_inspected,executable_dependency,exercised,visually_demonstrated}, notes } }, runtime_api, digest }
// States: source_inspected is true where a mechanism exists in the repo; executable_dependency is "present" when every dependency file exists on disk, "missing"
// otherwise (it does not mean the dependency ran); exercised and visually_demonstrated are never claimed here (null = unknown until authorized evidence).
export function capabilityInventory() {
  const rt = createRequire(import.meta.url);
  let simApi = null;
  try { simApi = Object.keys(rt("../../runtime/rasan-sim.js")).filter((k) => typeof rt("../../runtime/rasan-sim.js")[k] === "function").sort(); } catch { /* unreadable stays unknown */ }
  const ops = {};
  for (const [id, o] of Object.entries(OPS)) {
    const deps = inspectDeps(o.dependencies);
    const missing = deps.some((d) => !d.present);
    ops[id] = {
      family: o.family, space: o.space.slice(), state: missing && o.state !== "unavailable" ? "unavailable" : o.state, mechanics: o.mechanics, cost_metric: o.cost,
      dependencies: deps, notes: o.notes,
      ...(o.alternative !== undefined ? { alternative: o.alternative } : {}), ...(o.needs ? { needs: o.needs.slice() } : {}),
      ...(o.kinds ? { kinds: o.kinds.slice() } : {}), ...(o.surrogate_for ? { surrogate_for: o.surrogate_for.slice() } : {}),
      states: { source_inspected: o.state !== "unavailable", executable_dependency: o.state === "unavailable" ? null : missing ? "missing" : "present", exercised: null, visually_demonstrated: null },
    };
  }
  const out = { version: 1, ops, runtime_api: { RasanSim: simApi }, spaces: SPACES.slice(), no_shared_transform_between: SPACES.slice() };
  out.digest = digestOf({ ops: Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, [v.state, v.space, v.states.executable_dependency]])) });
  return out;
}

// Planning ceilings used only when the caller gives no host limits. They are NOT measurements of any machine (source: "planning_default").
export const DEFAULT_LIMITS = { instances: 50000, elements: 400, sim_floats: 4000000, texture_px: 4096, post_passes: 4 };
const SIM_HZ = 240; // RasanSim steps the whole run at a fixed 240 Hz into a table (4 floats per body per step: x, y, vx, vy)
const BAD_PARAM = /^(wall_?clock|date_?now|performance_?now|frame_?history|previous_?frame|free_?running|raf|random)$/i;
const overlapsIv = (a, b) => a.start < b.end && b.start < a.end;

function scan(params, ref, errors) {
  if (!isObj(params)) return;
  for (const [k, v] of Object.entries(params)) {
    if (BAD_PARAM.test(k) && v !== false && v !== null) errors.push(err("stale_input", ref, `param "${k}" asks for a clock, frame history or unseeded randomness; production frames must be a pure function of score time and a seed`));
    else if (isObj(v)) scan(v, ref, errors);
  }
}

function checkInterval(o, dur, bad) {
  const iv = o.interval;
  if (!isObj(iv) || !num(iv.start) || !num(iv.end) || iv.end < iv.start) { bad("temporal_evidence_missing", "interval {start,end} in score seconds is required and may not be reversed"); return null; }
  if (dur && (iv.start < 0 || iv.end > dur)) bad("stale_input", `interval ${iv.start}..${iv.end} is outside the score (0..${dur})`);
  return { start: iv.start, end: iv.end };
}

// forms:  [{ id, op: instance_field|scatter_repeat|spatial_curve|path_draw|path_morph, space?, interval, seed, count?, texture_px?, region_id?, params? }]
// fields: [{ id, op: field_attraction|field_follow_chain|field_flow|field_wave|field_separation|field_aggregation|field_coherent_flow_3d|deform_jelly|deform_mesh_3d,
//            form_id?, bodies?, interval, seed, params? }]
// camera: [{ id, op?: camera_dom3d|camera_rasan3d (default by space), space, kind (free label: push-in, orbit...), interval, form_ids?: [], dof?, bloom? }]
// material: [{ id, form_id, kind: matte|reflective|translucent|emissive, name?, accept_surrogate?: true }]
// representation: [{ id, steps: [{ form_id, level }], identity_survives, properties_may_change?: [], transition: continuous|editorial, camera_id? }]
// Optional: score { duration } and host { limits: { instances, elements, sim_floats, texture_px, post_passes } }.
// -> { ops[], representation[], capabilityState, hostCost, digest, errors[], notes[] }   (ops: forms, fields, camera, material ops in input order, each with status)
export function planSpatialOps({ forms = [], fields = [], camera = [], material = [], representation = [], score = null, host = null } = {}) {
  const inv = capabilityInventory().ops;
  const errors = [], notes = [];
  const dur = isObj(score) ? (num(score.duration) ? score.duration : num(score.duration_s) ? score.duration_s : null) : null;
  const limits = { ...DEFAULT_LIMITS, ...(isObj(host) && isObj(host.limits) ? host.limits : {}) };
  const limitsSource = isObj(host) && isObj(host.limits) ? "host" : "planning_default";
  if (!dur) notes.push("no score duration given: intervals are not checked against the score (unknown stays unknown)");
  if (limitsSource === "planning_default") notes.push("no host limits given: cost is compared with planning ceilings that are not measurements of this machine; W10 admits the real cost");

  const planned = [], seen = new Set(), byId = {};
  const cost = { instances: 0, elements: 0, sim_floats: 0, texture_px: 0, post_passes: 0 };

  function begin(o, kind, allowed) {
    const out = { id: o && o.id, kind, op: o && o.op, status: "unavailable", reasons: [] };
    const bad = (code, msg) => { errors.push(err(code, out.id || kind, msg)); out.reasons.push(msg); };
    planned.push(out);
    if (!isObj(o) || !ID_RE.test(String(o.id))) { bad("stale_input", `${kind} id must match ${ID_RE}`); return { out, bad, stop: true }; }
    if (seen.has(o.id)) { bad("stale_input", "duplicate id"); return { out, bad, stop: true }; }
    seen.add(o.id); byId[o.id] = out;
    const spec = inv[o.op];
    if (!spec || !allowed.includes(spec.family)) { bad("capability_unavailable", `unknown ${kind} op "${o.op}" (${Object.entries(inv).filter(([, v]) => allowed.includes(v.family)).map(([k]) => k).join("|")})`); return { out, bad, stop: true }; }
    out.family = spec.family;
    return { out, bad, spec, stop: false };
  }
  function finish(out, o, spec, state) {
    const failed = errors.some((e) => e.ref === out.id);
    const reasons = out.reasons;
    if (spec.state === "unavailable") { state = "unavailable"; reasons.push(spec.notes); if (spec.alternative) out.alternative = spec.alternative; }
    else if (spec.state === "uncertain" && state === "available") { state = "uncertain"; reasons.push(`not exercised for this use: ${spec.notes || spec.mechanics}`); }
    if (spec.states.executable_dependency === "missing") { state = "unavailable"; reasons.push("a dependency file is missing on disk"); }
    Object.assign(out, { status: failed ? "unavailable" : state, mechanics: spec.mechanics, params: o.params || null, seed: o.seed === undefined ? null : o.seed });
  }
  const seedOk = (o, bad) => { if (!(Number.isInteger(o.seed) || (typeof o.seed === "string" && o.seed.length))) bad("stale_input", "a seed (integer or string) is required: unseeded randomness cannot seek"); };

  // ---- forms
  for (const o of arr(forms)) {
    const { out, bad, spec, stop } = begin(o, "form", ["form", "path"]);
    if (stop) continue;
    const space = o.space || spec.space[0];
    if (!spec.space.includes(space)) bad("capability_unavailable", `${o.op} runs in ${spec.space.join("/")}, not "${space}"`);
    scan(o.params, o.id, errors); seedOk(o, bad);
    out.space = space; out.interval = checkInterval(o, dur, bad); out.region_id = o.region_id || null;
    if (o.region_id && !ID_RE.test(String(o.region_id))) bad("stale_input", `region_id must match ${ID_RE}`);
    const n = o.count === undefined ? (o.op === "instance_field" ? 1024 : 1) : o.count;
    if (!Number.isInteger(n) || n < 1) bad("stale_input", "count must be a positive integer");
    else { out.count = n; cost[spec.cost_metric === "elements" ? "elements" : "instances"] += n; }
    if (num(o.texture_px)) cost.texture_px = Math.max(cost.texture_px, o.texture_px);
    finish(out, o, spec, "available");
    if (o.op === "path_morph") out.reasons.push("fallback if contours do not match: path_draw or an editorial cut, disclosed as not a morph");
  }

  // ---- fields
  for (const o of arr(fields)) {
    const { out, bad, spec, stop } = begin(o, "field", ["field", "deform"]);
    if (stop) continue;
    scan(o.params, o.id, errors); seedOk(o, bad);
    out.interval = checkInterval(o, dur, bad);
    const target = o.form_id ? byId[o.form_id] : null;
    if (o.form_id && !(target && target.kind === "form")) bad("stale_input", `form_id "${o.form_id}" is not a planned form`);
    if (target && !spec.space.includes(target.space)) bad("capability_unavailable", `${o.op} acts in ${spec.space.join("/")} but form ${target.id} is in ${target.space}`);
    out.form_id = o.form_id || null;
    if (spec.cost_metric === "sim") {
      const bodies = o.bodies !== undefined ? o.bodies : target && target.count;
      if (!Number.isInteger(bodies) || bodies < 1) bad("stale_input", "a simulated field needs bodies (positive integer) or a form with a count");
      else if (out.interval) { const steps = Math.ceil(SIM_HZ * Math.max(0, out.interval.end - out.interval.start)); out.sim = { bodies, steps, floats: steps * bodies * 4, hz: SIM_HZ, baked: true }; cost.sim_floats += out.sim.floats; }
    } else if (spec.cost_metric === "post") cost.post_passes += 1;
    finish(out, o, spec, "available");
  }

  // ---- camera
  for (const o of arr(camera)) {
    const space = o && (o.space || (o.op === "camera_rasan3d" ? "rasan3d" : "dom3d"));
    const { out, bad, spec, stop } = begin({ ...o, op: o && (o.op || (space === "rasan3d" ? "camera_rasan3d" : "camera_dom3d")) }, "camera", ["camera"]);
    if (stop) continue;
    out.space = space; out.move = o.kind || null; out.interval = checkInterval(o, dur, bad);
    if (!spec.space.includes(space)) bad("capability_unavailable", `${out.op} runs in ${spec.space.join("/")}, not "${space}"`);
    out.shared_form_ids = arr(o.form_ids);
    for (const fid of out.shared_form_ids) {
      const f = byId[fid];
      if (!f || f.kind !== "form") bad("stale_input", `camera form_id "${fid}" is not a planned form`);
      else if (f.space !== space) bad("capability_unavailable", `form ${fid} is in ${f.space} and the camera in ${space}: there is no shared world/screen transform between them, so a camera move cannot carry it`);
    }
    cost.post_passes += 1 + (o.dof ? 1 : 0) + (o.bloom ? 1 : 0);
    out.shared_transform = space === "dom3d" ? "RasanCamera cam.perspective(t) / cam.place(el, p)" : "Rasan3D camera projection (stage.project)";
    finish(out, o, spec, "available");
  }

  // ---- material
  for (const o of arr(material)) {
    const kind = o && o.kind;
    const f = o && byId[o.form_id];
    const space = f && f.kind === "form" ? f.space : null;
    const wantOp = space === "dom3d" ? "material_2d_surrogate" : "material_3d";
    const { out, bad, spec, stop } = begin({ ...o, op: o && (o.op || wantOp) }, "material", ["material"]);
    if (stop) continue;
    out.form_id = o.form_id || null; out.material_kind = kind || null;
    if (!f || f.kind !== "form") bad("stale_input", `form_id "${o.form_id}" is not a planned form`);
    if (!Object.keys(MATERIAL_KINDS).includes(kind)) bad("stale_input", `material kind must be ${Object.keys(MATERIAL_KINDS).join("|")}`);
    if (o.name !== undefined && !(MATERIAL_KINDS[kind] || []).includes(o.name)) bad("stale_input", `material "${o.name}" is not a ${kind} material (${(MATERIAL_KINDS[kind] || []).join("|")})`);
    let state = "available";
    if (f && spec.space[0] !== space && !spec.space.includes(space)) bad("capability_unavailable", `${out.op} does not apply to a ${space} form`);
    if (spec.surrogate_for && spec.surrogate_for.includes(kind)) {
      if (o.accept_surrogate === true) { out.surrogate = { disclosed: true, note: `${kind} is approximated by a surface treatment on a flat layer; this is a material deviation the plan accepted` }; state = "uncertain"; }
      else bad("material_deviation", `a ${kind} solid cannot be shown on a flat ${space} layer; moving the form to rasan3d, choosing another material, or setting accept_surrogate: true (disclosed) are the options. A flat card is never presented as the form`);
    }
    if (kind === "reflective" || kind === "translucent") { cost.post_passes += 1; if (state === "available") state = "uncertain"; out.reasons.push("look depends on environment map and the final-quality pass; unexercised for this form"); }
    finish(out, o, spec, state);
  }

  // ---- representation changes
  const reps = [];
  for (const r of arr(representation)) {
    const rep = { id: r && r.id, status: "unavailable", reasons: [] };
    const bad = (code, msg) => { errors.push(err(code, rep.id || "representation", msg)); rep.reasons.push(msg); };
    reps.push(rep);
    if (!isObj(r) || !ID_RE.test(String(r.id))) { bad("stale_input", `representation id must match ${ID_RE}`); continue; }
    const steps = arr(r.steps);
    if (steps.length < 2) bad("stale_input", "a representation change needs at least two steps");
    steps.forEach((s, i) => {
      if (!isObj(s) || !byId[s.form_id] || byId[s.form_id].kind !== "form") bad("stale_input", `step ${i} form_id "${s && s.form_id}" is not a planned form`);
      if (!isObj(s) || !SCALE_LEVELS.includes(s.level)) bad("stale_input", `step ${i} level must be one of ${SCALE_LEVELS.join("|")}`);
    });
    if (typeof r.identity_survives !== "string" || !r.identity_survives.trim()) bad("stale_input", "name the identity that survives the change (what the audience keeps recognising)");
    if (!["continuous", "editorial"].includes(r.transition)) bad("stale_input", "transition must be continuous or editorial");
    if (r.transition === "continuous") {
      const spaces = new Set(steps.map((s) => s && byId[s.form_id] && byId[s.form_id].space).filter(Boolean));
      if (spaces.size > 1) bad("capability_unavailable", "a continuous change cannot cross dom3d and rasan3d (no shared transform); make it editorial or keep one space");
      const cam = r.camera_id ? byId[r.camera_id] : null;
      if (r.camera_id && !(cam && cam.kind === "camera")) bad("stale_input", `camera_id "${r.camera_id}" is not a planned camera`);
      else if (!cam) rep.reasons.push("no camera named for a continuous change: its relation to the camera move is unrecorded");
    }
    if (r.claim !== undefined) bad("material_deviation", "a representation change carries no product or scientific claim; abstract fields are not quantitative evidence");
    Object.assign(rep, {
      status: errors.some((e) => e.ref === rep.id) ? "unavailable" : steps.every((s) => byId[s.form_id] && byId[s.form_id].status === "available") ? "available" : "uncertain",
      steps: steps.map((s) => ({ form_id: s && s.form_id, level: s && s.level })), identity_survives: r.identity_survives || null,
      properties_may_change: arr(r.properties_may_change).filter((x) => typeof x === "string"), transition: r.transition || null, camera_id: r.camera_id || null,
      evidence_required: "a representative complete operation with its camera move, not only a hero still (hierarchy, continuity, legibility, material consistency)",
    });
  }

  // ---- one owner per continuous action: two fields acting on the same form at the same time
  const fieldsByForm = {};
  for (const p of planned.filter((x) => x.kind === "field" && x.form_id && x.interval && x.status !== "unavailable")) (fieldsByForm[p.form_id] = fieldsByForm[p.form_id] || []).push(p);
  for (const list of Object.values(fieldsByForm)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (overlapsIv(list[i].interval, list[j].interval)) {
    errors.push(err("owner_missing", list[j].id, `${list[i].id} and ${list[j].id} both drive form ${list[j].form_id} at the same time; name one owner or separate the intervals`));
    list[j].status = "unavailable"; list[j].reasons.push("overlaps another field on the same form");
  }

  // ---- bounded host cost (reported per metric; never a silent downgrade)
  const over = Object.keys(cost).filter((k) => cost[k] > limits[k]);
  for (const k of over) errors.push(err("budget_exhausted", "hostCost", `${k} ${cost[k]} exceeds the limit ${limits[k]} (${limitsSource}); admission through W10 or a smaller plan, not an automatic quality downgrade`));
  const hostCost = { metrics: cost, limits, limits_source: limitsSource, within_limits: !over.length, over, sim_hz: SIM_HZ };

  const capabilityState = errors.some((e) => e.ref === "hostCost") ? "unavailable" : planned.length || reps.length ? worst([...planned.map((p) => p.status), ...reps.map((r) => r.status)]) : "unavailable";
  if (!planned.length) errors.push(err("stale_input", "planSpatialOps", "no forms, fields, camera or material operations were given"));
  const digest = digestOf({
    ops: planned.map((p) => ({ id: p.id, kind: p.kind, op: p.op, space: p.space || null, status: p.status, interval: p.interval || null, seed: p.seed === undefined ? null : p.seed, count: p.count || null, form: p.form_id || null, material: p.material_kind || null, shared: p.shared_form_ids || null, surrogate: !!p.surrogate })),
    representation: reps.map((r) => ({ id: r.id, status: r.status, steps: r.steps || null, identity: r.identity_survives || null, transition: r.transition || null })),
    cost, limits, inventory: capabilityInventory().digest,
  });
  return { ops: planned, representation: reps, capabilityState, hostCost, digest, errors, notes };
}
