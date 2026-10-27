// Continuity as a shared implementation contract (Plan 04 L5). At storyboard/build time ONE owner supplies each shared component (product
// interface, character canon, camera convention, recurring motif); scene workers receive the projected subset they use, may request a change,
// and never redefine the component. Every seam between beats has a continuity TYPE, so a smooth carry never claims more than is true:
//   same_object            the same object or screen persists (needs an object_id that is a shared component)
//   visual_analogy         two different things that rhyme visually (never claims identity: no carry of "the same" thing)
//   causal_handoff         one thing visibly causes the next (needs the cause's evidence or story relation: no invented product causality or sync)
//   temporal_continuation  the same moment or timeline goes on
//   deliberate_discontinuity  separate contexts; a hard cut is valid and clearer than a morph
//   validateContinuity(c, ctx) -> { ok, problems, warnings }     projectForScene(c, sceneId) -> the subset     requestChange(...) -> a request record (never mutates)
//   seamRelation(type) -> the visual-bible transition relation     defaultContinuity(over) / sceneUsers(c, componentId)
import { SCHEMA_VERSION } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());

export const CONTINUITY_TYPES = ["same_object", "visual_analogy", "causal_handoff", "temporal_continuation", "deliberate_discontinuity"];
export const COMPONENT_KINDS = ["interface", "character", "camera", "motif", "object", "sound_motif"];
// transitions that make two shots read as one continuous thing
export const TRAVELING_KINDS = ["morph", "carry", "travel", "handoff", "match-cut", "camera-move", "continuous-camera"];
const RELATION = { same_object: "continuation", visual_analogy: "continuation", causal_handoff: "cause", temporal_continuation: "continuation", deliberate_discontinuity: "separation" };
export const seamRelation = (type) => RELATION[type] || null;

export const defaultContinuity = (over = {}) => ({ schema_version: SCHEMA_VERSION, shared_components: [], links: [], scenes: {}, ...over });

const endpoint = (e) => (isObj(e) ? T(e.beat_id || e.scene_id || e.id) : T(e));

export function validateContinuity(c, ctx = {}) {
  const problems = [], warnings = [];
  if (!isObj(c)) return { ok: false, problems: ["not an object"], warnings };
  const comps = new Map();
  for (const k of arr(c.shared_components)) {
    const id = T(k && k.id);
    if (!id) { problems.push("a shared component needs an id"); continue; }
    if (!COMPONENT_KINDS.includes(k.kind)) problems.push(`component ${id}: kind must be one of ${COMPONENT_KINDS.join(", ")}`);
    if (!T(k.owner)) problems.push(`component ${id}: needs exactly one owner (the worker or role that may change it)`);
    if (comps.has(id)) problems.push(`component ${id} is defined twice${comps.get(id).owner !== T(k.owner) ? ` with different owners (${comps.get(id).owner}, ${T(k.owner)})` : ""}: one owner, one definition`);
    comps.set(id, { owner: T(k.owner), kind: k.kind });
  }
  const known = new Set(arr(ctx.beat_ids).map(String));
  const seen = new Set();
  for (const l of arr(c.links)) {
    const id = T(l && l.id) || `${endpoint(l && l.from)}->${endpoint(l && l.to)}`;
    if (seen.has(id)) problems.push(`link ${id} is listed twice`);
    seen.add(id);
    const from = endpoint(l && l.from), to = endpoint(l && l.to);
    if (!from || !to) { problems.push(`link ${id}: needs from and to (stable beat or scene ids)`); continue; }
    if (known.size && (!known.has(from) || !known.has(to))) problems.push(`link ${id}: from/to must be existing ids`);
    if (!CONTINUITY_TYPES.includes(l.type)) { problems.push(`link ${id}: type must be one of ${CONTINUITY_TYPES.join(", ")}`); continue; }
    const kind = T(l.transition && l.transition.kind).toLowerCase();
    const travels = TRAVELING_KINDS.includes(kind);
    if (l.type === "same_object") {
      if (!T(l.object_id)) problems.push(`link ${id}: same_object needs object_id`);
      else if (!comps.has(T(l.object_id))) problems.push(`link ${id}: object ${l.object_id} is not a shared component (so nobody owns it)`);
    }
    if (l.type === "causal_handoff" && !T(l.cause_ref)) problems.push(`link ${id}: causal_handoff needs cause_ref (the story relation or evidence that one thing really causes the next); a travelling object must not imply false causality or product synchronization`);
    if (l.type === "visual_analogy") {
      if (T(l.object_id)) problems.push(`link ${id}: visual_analogy never claims the same object; drop object_id or use same_object`);
      if (kind === "carry" || kind === "travel") problems.push(`link ${id}: a ${kind} implies identity; an analogy is a cut or a match-cut`);
    }
    if (l.type === "deliberate_discontinuity" && travels) problems.push(`link ${id}: a deliberate discontinuity must not use ${kind}: a hard cut between separate contexts is the honest transition`);
    if (l.synchronized === true && !T(l.cause_ref)) problems.push(`link ${id}: it claims synchronization with no evidence (cause_ref)`);
    if (travels && l.type === "temporal_continuation" && l.same_timeline === false) problems.push(`link ${id}: temporal_continuation says same_timeline false`);
    if (!kind && l.type !== "deliberate_discontinuity") warnings.push(`link ${id}: no transition kind named (a cut is fine; say so)`);
  }
  for (const [scene, rec] of Object.entries(isObj(c.scenes) ? c.scenes : {})) for (const u of arr(rec && rec.uses)) if (!comps.has(T(u))) problems.push(`scene ${scene} uses ${u}, which is not a shared component`);
  return { ok: !problems.length, problems, warnings };
}

export const sceneUsers = (c, componentId) => Object.entries((c && c.scenes) || {}).filter(([, r]) => arr(r && r.uses).includes(componentId)).map(([s]) => s);

// the subset a scene worker gets: the components it uses (or that its seams carry), the seams touching it, and where to send a change request
export function projectForScene(c, sceneId) {
  const cc = isObj(c) ? c : defaultContinuity();
  const uses = new Set(arr(cc.scenes && cc.scenes[sceneId] && cc.scenes[sceneId].uses).map(T));
  const links = arr(cc.links).filter((l) => endpoint(l.from) === sceneId || endpoint(l.to) === sceneId);
  for (const l of links) if (T(l.object_id)) uses.add(T(l.object_id));
  const comps = arr(cc.shared_components).filter((k) => uses.has(T(k.id))).map((k) => ({ id: k.id, kind: k.kind, owner: k.owner, version: k.version ?? 1, spec_ref: k.spec_ref || null, digest: k.digest || null, read_only: true }));
  return {
    schema_version: SCHEMA_VERSION, projection: "continuity-scene", scene_id: sceneId, components: comps,
    seams: links.map((l) => ({ id: l.id || null, direction: endpoint(l.from) === sceneId ? "out" : "in", other: endpoint(l.from) === sceneId ? endpoint(l.to) : endpoint(l.from), type: l.type, relation: seamRelation(l.type), transition: l.transition || null, object_id: l.object_id || null })),
    rules: ["shared components are read-only here: request a change from the owner", "do not carry an object across a seam the contract calls a discontinuity", "do not imply causality or product sync the contract does not state"],
  };
}

// a worker may ASK; this returns a record for the owner, never edits the contract
export function requestChange(c, { component_id, scene_id, reason }) {
  const k = arr(c && c.shared_components).find((x) => x.id === component_id);
  if (!k) return { ok: false, error: `no shared component ${component_id}` };
  if (!T(reason)) return { ok: false, error: "a change request needs a reason" };
  return { ok: true, request: { schema_version: SCHEMA_VERSION, component_id, requested_by_scene: scene_id || null, owner: k.owner, reason: T(reason), status: "open", affects_scenes: sceneUsers(c, component_id) } };
}

// ---- V3 additive (W06): which seams are TEMPORAL (one action continues across them) and which only share a static asset or an analogy ----------------
// lib/continuity-plan.mjs reads these to decide that two shots must share one accountable owner. A visual analogy and a deliberate discontinuity never
// force one owner; a shared font, logo or palette is never a link at all (it is a read-only shared asset). Legacy validateContinuity behaviour is unchanged.
export const TEMPORAL_CONTINUITY_TYPES = ["same_object", "causal_handoff", "temporal_continuation"];
export const isTemporalLink = (l) => !!l && TEMPORAL_CONTINUITY_TYPES.includes(l.type);
// -> [{id, from, to, type, object_id, temporal}] with endpoints normalised to ids; a link with a missing endpoint is dropped (validateContinuity reports it)
export function continuityEdges(c) {
  return arr(c && c.links).map((l) => ({ id: T(l.id) || `${endpoint(l.from)}->${endpoint(l.to)}`, from: endpoint(l.from), to: endpoint(l.to), type: l.type, object_id: T(l.object_id) || null, temporal: isTemporalLink(l) })).filter((e) => e.from && e.to);
}

// ---- SQ-MOTIF additive: a motif is either ONE continuous identity (one accountable owner through a temporal action) or RECURRING (separate appearances sharing a visual language; never an ownership group) ----
// planContinuity (continuity-plan.mjs) consumes these. Anything that is not exactly "continuous" is recurring, so a repeated palette, logo, font or shape can never force one owner for the film.
export const MOTIF_RELATIONS = ["continuous", "recurring"];
export const motifRelation = (m) => (m && T(m.relation).toLowerCase() === "continuous" ? "continuous" : "recurring");
export const motifForcesOwner = (m) => motifRelation(m) === "continuous";
