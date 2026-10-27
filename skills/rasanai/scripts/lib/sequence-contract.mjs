// Connected-sequence records (Addendum 1): ONE frozen shape for motif direction, motion handoff, optical treatment, product
// choreography and attention sequence. Pure: no file, network, process or model access, no clock. Status: implemented_unvalidated.
//
//   normalizeMotif(raw, score?) normalizeHandoff(raw, score) normalizeOptics(raw, score?) normalizeProduct(raw, score?) normalizeAttention(raw, score?)
//   sequenceDigest(records)  staleSequenceRefs(records, current)  checkSequence({motifs, handoffs, optics, product, attention, events, score, capabilities, current})
//
// Rules every record follows (references/sequence-contracts.md):
//   * {id, basis:"score", approved_input_revisions, semantic_digest}; ids are stable (event, motif, anchor, asset, layer, capture ids), records refer, never copy
//   * time is the score's: seconds in, integer microsecond ticks + the score's own frame range out (timing.mjs); no 30 fps assumption, no second clock
//   * normalization is total and pure: it never grants consent, never fills in an approval, never mutates its input. A missing or unauthored fact stays
//     missing so checkSequence can report it; the semantic_digest covers meaning only (not notes, not the revisions the record was approved against)
//   * readers (staleSequenceRefs, checkSequence) reject stale and unresolved references instead of guessing; a missing capability is a declared creative decision
// Consumers: creative-contract.mjs (treatment motifs / event motif_ids validation), creative-handoff.mjs (projection), creative-completion.mjs (assessCompletion
// sequence read), and, proposed for ENG-INT-1, packets.beatDeclarations/beatPlanNeeds + crew.mjs `plan` (see references/sequence-contracts.md).
import { canonicalDigest } from "./contracts.mjs";
import { CREATIVE_ERROR_CODES as C } from "./creative-policy.mjs";
import { interval as mkInterval, scoreRate, scoreTiming, frameRange, frameOf, toTicks, fromTicks } from "./timing.mjs";
import { STATIC_KINDS } from "./continuity-plan.mjs";

export const SEQUENCE_VERSION = 1;
export const MOTIF_ROLES = Object.freeze(["guide_attention", "reveal_region", "frame_evidence", "link_compositions", "resolve_identity", "other"]);
export const MOTIF_RELATIONS = Object.freeze(["continuous", "recurring"]);
export const HANDOFF_KINDS = Object.freeze(["continuous", "cut", "snap", "impact"]);
export const CARRY_PROPS = Object.freeze(["position", "velocity", "scale", "scale_rate", "rotation", "angular", "camera_relation", "mask_state", "settle"]);
export const FINAL_SPACE = "final_screen";
export const OPTIC_KINDS = Object.freeze(["motion_blur", "focus_blur", "stylized_distortion", "soft_material", "edge_treatment", "mask"]);
export const OPTIC_TIERS = Object.freeze({ mask: "essential", soft_material: "essential", focus_blur: "essential", motion_blur: "essential", edge_treatment: "essential", stylized_distortion: "enhancement" });
export const CAPABILITY_STATES = Object.freeze(["available", "uncertain", "unavailable"]);
export const PRODUCT_STAGES = Object.freeze(["context", "action", "result", "isolate", "hold"]);
export const READ_TARGET_KINDS = Object.freeze(["object", "region", "text_group"]);

// Local table: reuses CREATIVE_ERROR_CODES names where they fit (creative-policy.mjs is not edited), adds sequence-specific ones.
export const SEQUENCE_ERROR_CODES = Object.freeze({
  stale: C.stale_input, owner: C.owner_missing, capability: C.capability_unavailable, conflict: C.policy_conflict, notAssessable: C.not_assessable, approval: C.approval_missing,
  bad_shape: "sequence_bad_shape", bad_interval: "sequence_bad_interval", unresolved_ref: "sequence_unresolved_ref", role_not_authored: "motif_role_not_authored", static_continuous: "motif_static_continuous",
  relation_missing: "motif_relation_missing", carry_missing: "handoff_carry_missing", discontinuity_unreasoned: "handoff_discontinuity_unreasoned", coordinate_space: "handoff_coordinate_space",
  unit_missing: "handoff_unit_missing", filter_conflict: "optics_filter_conflict", protected_read: "optics_protected_read", label: "optics_label", source_state: "product_source_state_unbound",
  stage_order: "product_stage_order", reading_window: "product_reading_window_missing", studio_ui: "product_studio_ui", attention_order: "attention_order", attention_overlap: "attention_protected_overlap",
  digest_mismatch: "sequence_digest_mismatch", unpinned: "sequence_unpinned",
});
const K = SEQUENCE_ERROR_CODES;

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const S = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const filled = (x) => S(x) !== "";
const num = (x) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : null);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const strs = (x) => arr(x).map(S).filter(Boolean);
const uniq = (x) => [...new Set(x)];
const ext = (x) => (isObj(x) && isObj(x.extensions) && isObj(x.extensions.creative_thinking) ? x.extensions.creative_thinking : null);
const issue = (code, path, message, extra = {}) => ({ code, path, message, ...extra });

// ---- time ------------------------------------------------------------------------------------------------------------------------------
// [a,b] | {start_s,end_s} | {window_s:[a,b]} -> {start_s,end_s,start_tick,end_tick,basis:"score",frames?}; null when it is not 0 <= a < b.
// With a score the interval also carries the score's own frame range (end exclusive): derived from seconds, never from an assumed rate.
export function normalizeInterval(raw, score = null) {
  const pair = Array.isArray(raw) ? raw : isObj(raw) ? (Array.isArray(raw.window_s) ? raw.window_s : [raw.start_s, raw.end_s]) : null;
  if (!pair) return null;
  const a = num(pair[0]), b = num(pair[1]);
  if (a === null || b === null || a < 0 || !(b > a)) return null;
  const iv = mkInterval(a, b);
  const out = { start_s: iv.start_s, end_s: iv.end_s, start_tick: iv.start_tick, end_tick: iv.end_tick, basis: "score" };
  if (score && isObj(score)) out.frames = frameRange(iv, scoreRate(score));
  return out;
}
const scoreTotal = (score) => (score && isObj(score) && Array.isArray(score.scenes) ? scoreTiming(score).total_s : null);
const inScore = (iv, total) => total === null || iv.end_tick <= toTicks(total) + 50_000; // 0.05 s grace, like completion's interval rule
const overlap = (a, b) => a.start_tick < b.end_tick && b.start_tick < a.end_tick;

// ---- shared record envelope ------------------------------------------------------------------------------------------------------------
// approved_input_revisions: {name: {revision?, digest?} | digest string | number}. Kept as authored; never filled in by normalization.
function revisions(raw) {
  if (!isObj(raw)) return {};
  const out = {};
  for (const k of Object.keys(raw).sort()) {
    const v = raw[k];
    if (isObj(v)) out[k] = { ...(v.revision !== undefined ? { revision: v.revision } : {}), ...(filled(v.digest || v.artifact_digest) ? { digest: S(v.digest || v.artifact_digest) } : {}) };
    else if (typeof v === "string" || typeof v === "number") out[k] = typeof v === "string" ? { digest: v } : { revision: v };
  }
  return out;
}
// meaning only: not the pin the record was approved against, not free notes, not a previous digest
export const recordDigest = (rec) => { const { semantic_digest, approved_input_revisions, notes, ...meaning } = isObj(rec) ? rec : {}; return canonicalDigest(meaning); };
const seal = (rec) => ({ ...rec, semantic_digest: recordDigest(rec) });
const head = (raw, kind) => ({ id: S(raw.id), kind, version: SEQUENCE_VERSION, basis: "score", approved_input_revisions: revisions(raw.approved_input_revisions) });

// ---- motif direction -------------------------------------------------------------------------------------------------------------------
// Lives at treatment.extensions.creative_thinking.motifs[]; events reference it by extensions.creative_thinking.motif_ids.
// raw: {id, identity:{label, description, kind}, invariants[], roles[{id, interval|window_s, role, authored, reason, event_ids, anchor_ids}],
//       progression[{state, interval}], relation, absent_ok, object_ids, event_ids}
export function normalizeMotif(raw, score = null) {
  const r = isObj(raw) ? raw : {}, idn = isObj(r.identity) ? r.identity : { label: S(r.identity) };
  const roles = arr(r.roles).filter(isObj).map((x) => {
    const inferred = x.inferred === true || ["repetition", "inferred", "auto"].includes(S(x.source).toLowerCase());
    return { id: S(x.id), interval: normalizeInterval(x.interval ?? x.window_s ?? [x.start_s, x.end_s], score), role: S(x.role), authored: x.authored === true && !inferred, inferred, reason: S(x.reason || x.why), event_ids: strs(x.event_ids), anchor_ids: strs(x.anchor_ids) };
  });
  const progression = arr(r.progression).filter(isObj).map((x) => ({ state: S(x.state), interval: normalizeInterval(x.interval ?? x.window_s, score), role_id: S(x.role_id) || null }));
  const relation = MOTIF_RELATIONS.includes(S(r.relation)) ? S(r.relation) : S(r.relation) || null;
  return seal({
    ...head(r, "motif"),
    identity: { label: S(idn.label), description: S(idn.description), kind: S(idn.kind).toLowerCase() || null },
    invariants: strs(r.invariants), roles, progression, relation, absent_ok: r.absent_ok === true,
    object_ids: strs(r.object_ids), event_ids: strs(r.event_ids),
    ...(filled(r.notes) ? { notes: S(r.notes) } : {}),
  });
}
export const isStaticMotif = (m) => !!(m && m.identity && STATIC_KINDS.includes(S(m.identity.kind).toLowerCase()));

// ---- motion handoff --------------------------------------------------------------------------------------------------------------------
// Stored under beat plan sidecar key `handoff` (creative/beat-plans.json beats.<id>.handoff). Boundary time is the score's.
// raw: {id, kind: continuous|cut|snap|impact, from:{beat_id,event_id,shot_id,scene}, to:{...}, boundary_s | boundary:{time_s}, coordinate_space, units,
//       state:{position,velocity,scale,scale_rate,rotation,angular,camera_relation,mask_state,settle}, carry[], intentional_discontinuity:{reason, properties[]}, owner, motif_id}
const endpoint = (e) => { const o = isObj(e) ? e : { beat_id: S(e) }; return { beat_id: S(o.beat_id) || null, event_id: S(o.event_id) || null, shot_id: S(o.shot_id) || null, scene: o.scene ?? null }; };
export function normalizeHandoff(raw, score = null) {
  const r = isObj(raw) ? raw : {};
  const t = num(isObj(r.boundary) ? r.boundary.time_s : r.boundary_s ?? r.time_s);
  const rate = score ? scoreRate(score) : null;
  const boundary = t === null || t < 0 ? null : { time_s: fromTicks(toTicks(t)), tick: toTicks(t), basis: "score", ...(rate ? { frame: frameOf(t, rate) } : {}) };
  const rk = S(r.handoff_kind) || (S(r.kind) === "handoff" ? "" : S(r.kind)), kind = rk || null; // `kind` on a sealed record is the record type
  const carry = uniq(strs(r.carry)).sort((a, b) => CARRY_PROPS.indexOf(a) - CARRY_PROPS.indexOf(b));
  const d = isObj(r.intentional_discontinuity) ? r.intentional_discontinuity : filled(r.intentional_discontinuity) ? { reason: S(r.intentional_discontinuity) } : null;
  const u = isObj(r.units) ? r.units : {};
  return seal({
    ...head(r, "handoff"), handoff_kind: kind, from: endpoint(r.from), to: endpoint(r.to), boundary,
    coordinate_space: S(r.coordinate_space) || null,
    units: { position: S(u.position) || null, time: S(u.time) || "s", angle: S(u.angle) || null, scale: S(u.scale) || null },
    state: isObj(r.state) ? Object.fromEntries(Object.keys(r.state).sort().map((k) => [k, r.state[k]])) : {},
    carry, intentional_discontinuity: d ? { reason: S(d.reason), properties: uniq(strs(d.properties)) } : null,
    owner: S(r.owner || r.continuity_owner) || null, motif_id: S(r.motif_id) || null,
    ...(filled(r.notes) ? { notes: S(r.notes) } : {}),
  });
}

// ---- optical treatment -----------------------------------------------------------------------------------------------------------------
// Stored under beat plan sidecar key `optics`. raw: {id, ops:[{id, kind, label, layers:{select[], protect[]}, source_layer_id, coordinate_space, mask_source, crop,
//   order, sampling:{resolution_scale}, params:[{param, fn, keys:[[t_s,v]]}], interval, protected_reads:[{id, ref, interval}], channel, compose_with[], capability:{op_id,state},
//   creative_decision:{id, summary, source_action_id}}]}
const CHANNEL = { motion_blur: "blur", focus_blur: "blur", stylized_distortion: "distort", soft_material: "material", edge_treatment: "edge", mask: "mask" };
export function normalizeOptics(raw, score = null) {
  const r = isObj(raw) ? raw : {};
  const ops = arr(r.ops).filter(isObj).map((o) => {
    const kind = S(o.kind), cap = isObj(o.capability) ? o.capability : {}, dec = isObj(o.creative_decision) ? o.creative_decision : null, ly = isObj(o.layers) ? o.layers : { select: o.layers };
    return {
      id: S(o.id), kind, tier: OPTIC_TIERS[kind] || null, label: S(o.label), layers: { select: uniq(strs(ly.select)), protect: uniq(strs(ly.protect)) }, source_layer_id: S(o.source_layer_id) || null,
      coordinate_space: S(o.coordinate_space) || null, mask_source: S(isObj(o.mask_source) ? o.mask_source.ref || o.mask_source.id : o.mask_source) || null, crop: o.crop ?? null,
      order: num(o.order), sampling: { resolution_scale: num(isObj(o.sampling) ? o.sampling.resolution_scale : o.sampling) },
      params: arr(o.params).filter(isObj).map((p) => ({ param: S(p.param), fn: S(p.fn) || "linear", keys: arr(p.keys).filter((k) => Array.isArray(k) && num(k[0]) !== null && num(k[1]) !== null).map((k) => [Number(k[0]), Number(k[1])]) })),
      interval: normalizeInterval(o.interval ?? o.window_s, score),
      protected_reads: arr(o.protected_reads).filter(isObj).map((p) => ({ id: S(p.id), ref: S(p.ref), interval: normalizeInterval(p.interval ?? p.window_s, score) })),
      channel: S(o.channel) || CHANNEL[kind] || null, compose_with: uniq(strs(o.compose_with)),
      capability: { op_id: S(cap.op_id || o.capability_op) || null, state: CAPABILITY_STATES.includes(S(cap.state)) ? S(cap.state) : null },
      creative_decision: dec && filled(dec.id) && filled(dec.summary) ? { id: S(dec.id), summary: S(dec.summary), source_action_id: S(dec.source_action_id) || null } : null,
    };
  });
  const rec = seal({ ...head(r, "optics"), ops, ...(filled(r.notes) ? { notes: S(r.notes) } : {}) });
  // the dependency digest names what the plan was made against (ops, layers, masks, capability ids), so a changed layer set reads as stale
  return { ...rec, dependency_digest: canonicalDigest(ops.map((o) => ({ id: o.id, layers: o.layers, mask: o.mask_source, cap: o.capability.op_id }))) };
}

// ---- product choreography --------------------------------------------------------------------------------------------------------------
// Stored under beat plan sidecar key `product`. raw: {id, claim_id, depicts_studio, ui, demonstration, stages:[{id, stage, interval, source_state_ref:{kind:capture|demonstration,id,digest,revision},
//   labels[], conditions[], simplifications[], reading_window:{interval,min_s}, anchor_ids[], action_id}]}
export function normalizeProduct(raw, score = null) {
  const r = isObj(raw) ? raw : {};
  const stages = arr(r.stages).filter(isObj).map((s, i) => {
    const ref = isObj(s.source_state_ref) ? s.source_state_ref : null, rw = isObj(s.reading_window) ? s.reading_window : null;
    return {
      id: S(s.id) || null, index: i, stage: S(s.stage), interval: normalizeInterval(s.interval ?? s.window_s, score),
      source_state_ref: ref ? { kind: S(ref.kind), id: S(ref.id), digest: S(ref.digest) || null, revision: ref.revision ?? null } : null,
      labels: strs(s.labels), conditions: strs(s.conditions), simplifications: strs(s.simplifications), anchor_ids: strs(s.anchor_ids), action_id: S(s.action_id) || null,
      reading_window: rw ? { interval: normalizeInterval(rw.interval ?? rw.window_s, score), min_s: num(rw.min_s) } : null,
    };
  });
  return seal({ ...head(r, "product"), claim_id: S(r.claim_id) || null, depicts_studio: r.depicts_studio === true, ui: S(r.ui) || null, demonstration: r.demonstration === true, stages, ...(filled(r.notes) ? { notes: S(r.notes) } : {}) });
}

// ---- attention sequence ----------------------------------------------------------------------------------------------------------------
// Mirrors the storyboard shot `reads[]` extension (L/storyboard.mjs, SQ-ATTENTION). raw: {id, shot_id, reads:[{order, target_ref:{kind,id}, interval, intended_understanding,
//   transfer_change, competing:[{ref, treatment}], protected_read:{required, min_s_basis}}]}
export function normalizeAttention(raw, score = null) {
  const r = isObj(raw) ? raw : {};
  const reads = arr(r.reads).filter(isObj).map((x, i) => {
    const t = isObj(x.target_ref) ? x.target_ref : {}, p = isObj(x.protected_read) ? x.protected_read : {};
    return {
      order: num(x.order) ?? i + 1, target_ref: { kind: S(t.kind), id: S(t.id) }, interval: normalizeInterval(x.interval ?? x.window_s, score),
      intended_understanding: S(x.intended_understanding), transfer_change: S(x.transfer_change),
      competing: arr(x.competing).map((c) => (isObj(c) ? { ref: S(c.ref || c.id), treatment: S(c.treatment) } : { ref: S(c), treatment: "" })).filter((c) => c.ref),
      protected_read: { required: p.required === true, min_s_basis: S(p.min_s_basis) || null },
    };
  }).sort((a, b) => a.order - b.order);
  return seal({ ...head(r, "attention"), shot_id: S(r.shot_id) || null, reads, ...(filled(r.notes) ? { notes: S(r.notes) } : {}) });
}

const NORMALIZERS = { motifs: normalizeMotif, handoffs: normalizeHandoff, optics: normalizeOptics, product: normalizeProduct, attention: normalizeAttention };
export const SEQUENCE_KINDS = Object.freeze(Object.keys(NORMALIZERS));
const norm = (kind, list, score) => arr(list).filter(isObj).map((x) => NORMALIZERS[kind](x, score)); // idempotent: a normalized record normalizes to itself
function normalizedSet(records, score) {
  const rs = isObj(records) ? records : {};
  return Object.fromEntries(SEQUENCE_KINDS.map((k) => [k, norm(k, rs[k], score)]));
}

// ---- digest and staleness --------------------------------------------------------------------------------------------------------------
// One digest over (kind, id, meaning) of every record, order-independent. Changes when meaning changes, never for a note, a key order or a pin.
export function sequenceDigest(records) {
  const set = normalizedSet(records, null);
  return canonicalDigest(Object.fromEntries(SEQUENCE_KINDS.map((k) => [k, set[k].map((r) => ({ id: r.id, d: recordDigest(r) })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))])));
}

// References each record makes, by kind of target. Only the targets the caller supplies in `current` are resolved (an absent list skips that check, as knownIds does).
function refsOf(kind, r) {
  const out = [];
  const add = (ref_kind, ref) => { if (filled(ref)) out.push({ ref_kind, ref: S(ref) }); };
  if (kind === "motifs") { r.event_ids.forEach((x) => add("event", x)); r.object_ids.forEach((x) => add("object", x)); r.roles.forEach((x) => { x.event_ids.forEach((e) => add("event", e)); x.anchor_ids.forEach((a) => add("anchor", a)); }); }
  if (kind === "handoffs") { for (const e of [r.from, r.to]) { add("beat", e.beat_id); add("event", e.event_id); add("shot", e.shot_id); } add("motif", r.motif_id); }
  if (kind === "optics") r.ops.forEach((o) => { o.layers.select.forEach((x) => add("layer", x)); o.layers.protect.forEach((x) => add("layer", x)); add("layer", o.source_layer_id); add("mask", o.mask_source); o.protected_reads.forEach((p) => add("target", p.ref)); });
  if (kind === "product") r.stages.forEach((s) => { if (s.source_state_ref) add(s.source_state_ref.kind === "capture" ? "capture" : "demonstration", s.source_state_ref.id); s.anchor_ids.forEach((a) => add("anchor", a)); });
  if (kind === "attention") { add("shot", r.shot_id); r.reads.forEach((x) => { add("target", x.target_ref.id); x.competing.forEach((c) => add("target", c.ref)); }); }
  return out;
}
const CURRENT_LISTS = { event: "events", beat: "beats", shot: "shots", motif: "motifs", anchor: "anchors", layer: "layers", mask: "masks", target: "targets", capture: "captures", demonstration: "demonstrations", object: "objects" };
const idsOf = (x) => (x instanceof Set ? x : Array.isArray(x) ? new Set(x.map((v) => (isObj(v) ? v.id : v)).map(S)) : isObj(x) ? new Set(Object.keys(x)) : null);

// records: {motifs, handoffs, optics, product, attention} (raw or normalized lists). current: {score_revision?, revisions:{name: digest|{digest,revision}}, digests:{record_id: semantic_digest},
//   events, beats, shots, motifs, anchors, layers, masks, targets, captures (ids or {id: {digest, revision}}), demonstrations, objects}
// -> [{record_id, record_kind, code, ref_kind, ref, message}]. Empty means every checked reference is current and resolved.
export function staleSequenceRefs(records, current = {}) {
  const cur = isObj(current) ? current : {}, set = normalizedSet(records, null), out = [];
  const lists = Object.fromEntries(Object.entries(CURRENT_LISTS).map(([rk, k]) => [rk, idsOf(cur[k])]));
  for (const kind of SEQUENCE_KINDS) for (const rec of set[kind]) {
    const at = { record_id: rec.id, record_kind: kind };
    for (const [name, want] of Object.entries(revisions(cur.revisions))) {
      const have = rec.approved_input_revisions[name];
      if (!have) continue;
      if ((want.digest && have.digest && want.digest !== have.digest) || (want.revision !== undefined && have.revision !== undefined && want.revision !== have.revision)) out.push({ ...at, code: K.stale, ref_kind: "approved_input", ref: name, message: `${rec.id} was approved against an earlier ${name}` });
    }
    if (filled(cur.score_revision) && filled(rec.approved_input_revisions.score && rec.approved_input_revisions.score.digest) && rec.approved_input_revisions.score.digest !== S(cur.score_revision)) out.push({ ...at, code: K.stale, ref_kind: "approved_input", ref: "score", message: `${rec.id} was planned against an earlier score revision` });
    const known = isObj(cur.digests) ? cur.digests[rec.id] : null;
    if (filled(known) && S(known) !== rec.semantic_digest) out.push({ ...at, code: K.stale, ref_kind: "semantic_digest", ref: rec.id, message: `${rec.id} changed meaning since its approved digest` });
    for (const { ref_kind, ref } of refsOf(kind, rec)) {
      const l = lists[ref_kind];
      if (!l) continue;
      if (!l.has(ref)) out.push({ ...at, code: K.unresolved_ref, ref_kind, ref, message: `${rec.id} refers to ${ref_kind} ${ref}, which does not exist in the current plan` });
      else if ((ref_kind === "capture") && isObj(cur.captures) && isObj(cur.captures[ref])) {
        const stage = kind === "product" ? rec.stages.find((s) => s.source_state_ref && s.source_state_ref.id === ref) : null, c = cur.captures[ref];
        if (stage && filled(stage.source_state_ref.digest) && filled(c.digest) && stage.source_state_ref.digest !== S(c.digest)) out.push({ ...at, code: K.stale, ref_kind, ref, message: `${rec.id}: capture ${ref} is outdated (the choreography is bound to an earlier state)` });
      }
    }
  }
  return out;
}

// ---- checks ----------------------------------------------------------------------------------------------------------------------------
const needId = (rec, kind, path, errors, seen) => { if (!ID_RE.test(rec.id)) errors.push(issue(K.bad_shape, path, `${kind} needs a stable id`)); else if (seen.has(rec.id)) errors.push(issue(K.bad_shape, path, `duplicate ${kind} id ${rec.id}`)); seen.add(rec.id); };
const ivCheck = (iv, path, total, errors, what) => { if (!iv) { errors.push(issue(K.bad_interval, path, `${what} needs an interval [start,end) in score seconds with 0 <= start < end`)); return false; } if (!inScore(iv, total)) { errors.push(issue(K.bad_interval, path, `${what} ends after the score (${total}s)`)); return false; } return true; };
const NUMERIC_STATE = new Set(["position", "velocity", "scale", "scale_rate", "rotation", "angular"]);

function checkMotifs(motifs, ctx) {
  const { errors, warnings, total, eventIds } = ctx, seen = new Set();
  motifs.forEach((m, i) => {
    const p = `motifs[${i}]`; needId(m, "motif", p, errors, seen);
    if (!filled(m.identity.label)) errors.push(issue(K.bad_shape, `${p}.identity`, "a motif names its identity (label)"));
    if (!m.invariants.length) warnings.push(issue(K.bad_shape, `${p}.invariants`, "name what stays recognizable across appearances"));
    if (!MOTIF_RELATIONS.includes(m.relation)) errors.push(issue(K.relation_missing, `${p}.relation`, `relation must be ${MOTIF_RELATIONS.join(" | ")}: continuous (one accountable object through an action) or recurring (separate appearances)`));
    if (m.relation === "continuous" && isStaticMotif(m)) errors.push(issue(K.static_continuous, `${p}.relation`, `a ${m.identity.kind} is a shared read-only asset: it is recurring, never one ownership group`));
    if (!m.roles.length && !m.absent_ok) errors.push(issue(K.bad_shape, `${p}.roles`, "a motif with no roles must declare absent_ok (a film may legitimately not need it)"));
    let prev = null;
    [...m.roles].sort((a, b) => (a.interval ? a.interval.start_tick : 0) - (b.interval ? b.interval.start_tick : 0)).forEach((r, j) => {
      const q = `${p}.roles[${j}]`;
      if (!MOTIF_ROLES.includes(r.role)) errors.push(issue(K.bad_shape, `${q}.role`, `role must be ${MOTIF_ROLES.join(" | ")}`));
      if (r.role === "other" && !filled(r.reason)) errors.push(issue(K.role_not_authored, `${q}.reason`, "role other needs the authored reason"));
      ivCheck(r.interval, `${q}.interval`, total, errors, "a motif role");
      if (r.inferred) errors.push(issue(K.role_not_authored, `${q}.role`, "a role cannot be inferred from repetition: author it"));
      else if (prev && prev.role !== r.role && !(r.authored && filled(r.reason))) errors.push(issue(K.role_not_authored, `${q}.role`, `role changes from ${prev.role} to ${r.role}: the change must be authored (authored:true with a reason), not implied by the repeated shape`));
      prev = r;
    });
    m.event_ids.forEach((e) => { if (eventIds && !eventIds.has(e)) errors.push(issue(K.unresolved_ref, `${p}.event_ids`, `motif ${m.id} refers to unknown event ${e}`)); });
  });
}
function checkHandoffs(hs, ctx) {
  const { errors, warnings, total } = ctx, seen = new Set();
  hs.forEach((h, i) => {
    const p = `handoffs[${i}]`; needId(h, "handoff", p, errors, seen);
    if (!HANDOFF_KINDS.includes(h.handoff_kind)) errors.push(issue(K.bad_shape, `${p}.kind`, `kind must be ${HANDOFF_KINDS.join(" | ")}`));
    if (!h.boundary) errors.push(issue(K.bad_interval, `${p}.boundary`, "a handoff needs boundary time_s on the score"));
    else if (total !== null && h.boundary.tick > toTicks(total)) errors.push(issue(K.bad_interval, `${p}.boundary`, `boundary is after the score (${total}s)`));
    if (!(h.from.beat_id || h.from.event_id || h.from.shot_id) || !(h.to.beat_id || h.to.event_id || h.to.shot_id)) errors.push(issue(K.unresolved_ref, `${p}.from/to`, "name both sides of the boundary (beat, event or shot id)"));
    if (h.coordinate_space !== FINAL_SPACE) errors.push(issue(K.coordinate_space, `${p}.coordinate_space`, `seams are compared in the declared final screen space ("${FINAL_SPACE}"); scene-local, parent, world and camera values must be converted first`));
    if (h.handoff_kind === "continuous") {
      if (!h.owner) errors.push(issue(K.owner, `${p}.owner`, "a continuous handoff needs the one accountable continuity owner"));
      if (!h.carry.length) errors.push(issue(K.carry_missing, `${p}.carry`, `a continuous handoff names exactly what survives: ${CARRY_PROPS.join(", ")}`));
    } else if (HANDOFF_KINDS.includes(h.handoff_kind) && !(h.intentional_discontinuity && filled(h.intentional_discontinuity.reason))) errors.push(issue(K.discontinuity_unreasoned, `${p}.intentional_discontinuity`, `a ${h.handoff_kind} breaks continuity on purpose: say why`));
    h.carry.forEach((c) => { if (!CARRY_PROPS.includes(c)) errors.push(issue(K.bad_shape, `${p}.carry`, `unknown carry property ${c}`)); });
    if (h.intentional_discontinuity) for (const c of h.intentional_discontinuity.properties) if (h.carry.includes(c)) errors.push(issue(K.conflict, `${p}.carry`, `${c} is both carried and an intentional discontinuity`));
    if (h.intentional_discontinuity && !filled(h.intentional_discontinuity.reason)) errors.push(issue(K.discontinuity_unreasoned, `${p}.intentional_discontinuity.reason`, "an intentional discontinuity needs a reason"));
    for (const c of h.carry) {
      if (c === "settle") continue;
      if (h.state[c] === undefined) warnings.push(issue(K.notAssessable, `${p}.state.${c}`, `${c} is carried but no boundary state was supplied: the runtime must measure it or the producer must state it`));
    }
    if (h.carry.some((c) => NUMERIC_STATE.has(c))) {
      if (!filled(h.units.position) && h.carry.some((c) => ["position", "velocity"].includes(c))) errors.push(issue(K.unit_missing, `${p}.units.position`, "position and velocity need explicit units (px or frame_fraction, per second)"));
      if (!filled(h.units.angle) && h.carry.some((c) => ["rotation", "angular"].includes(c))) errors.push(issue(K.unit_missing, `${p}.units.angle`, "rotation needs explicit angle units (deg) and wrapping"));
      if (!filled(h.units.scale) && h.carry.some((c) => ["scale", "scale_rate"].includes(c))) errors.push(issue(K.unit_missing, `${p}.units.scale`, "scale needs explicit units (ratio)"));
    }
  });
}
function checkOptics(list, ctx) {
  const { errors, warnings, total, capabilities } = ctx, seen = new Set(), ownerSeen = new Set();
  const all = [];
  list.forEach((rec, i) => {
    const p = `optics[${i}]`; needId(rec, "optics", p, errors, seen);
    if (!rec.ops.length) warnings.push(issue(K.bad_shape, `${p}.ops`, "an optical treatment with no operations does nothing"));
    rec.ops.forEach((o, j) => {
      const q = `${p}.ops[${j}]`;
      if (!ID_RE.test(o.id) || ownerSeen.has(o.id)) errors.push(issue(K.bad_shape, `${q}.id`, "an operation needs a unique stable id")); ownerSeen.add(o.id);
      if (!OPTIC_KINDS.includes(o.kind)) errors.push(issue(K.bad_shape, `${q}.kind`, `kind must be ${OPTIC_KINDS.join(" | ")} (motion blur, focus blur and distortion are different operations)`));
      if (!o.layers.select.length) errors.push(issue(K.bad_shape, `${q}.layers.select`, "name the layers this operation applies to (no whole-frame blur or glow fallback)"));
      if (!filled(o.coordinate_space)) errors.push(issue(K.coordinate_space, `${q}.coordinate_space`, "declare the coordinate space the operation works in"));
      if (o.kind === "mask" && !o.mask_source) errors.push(issue(K.bad_shape, `${q}.mask_source`, "a mask operation names its mask source"));
      if (o.order === null) errors.push(issue(K.bad_shape, `${q}.order`, "declare the compositing order"));
      if (o.sampling.resolution_scale === null) warnings.push(issue(K.bad_shape, `${q}.sampling`, "declare the sampling resolution (scale of the output)"));
      if (!o.params.length) warnings.push(issue(K.bad_shape, `${q}.params`, "declare score-driven parameter functions (keys in score seconds)"));
      ivCheck(o.interval, `${q}.interval`, total, errors, "an optical operation");
      if (o.kind === "stylized_distortion" && /refract/i.test(o.label)) errors.push(issue(K.label, `${q}.label`, "a stylized distortion is labelled stylized; do not call it refraction"));
      if (o.source_layer_id && o.layers.select.includes(o.source_layer_id) && o.kind !== "mask") warnings.push(issue(K.bad_shape, `${q}.source_layer_id`, "the processed copy is a different layer from its identifiable source layer"));
      // capability: given by the plan, else looked up from the caller's inventory; never assumed available
      let state = o.capability.state;
      if (!state && o.capability.op_id && isObj(capabilities)) { const c = capabilities[o.capability.op_id]; state = isObj(c) ? S(c.state) : S(c); state = CAPABILITY_STATES.includes(state) ? state : null; }
      if (!state) warnings.push(issue(K.notAssessable, `${q}.capability`, "capability state unknown: check the inventory before production"));
      if (state === "unavailable" || state === "uncertain") {
        const needs = o.tier === "essential" && state === "unavailable";
        if (needs && !o.creative_decision) errors.push(issue(K.capability, `${q}.capability`, `${o.kind} is essential and unavailable: record a creative decision (deviation or alternative) before production`));
        else warnings.push(issue(K.capability, `${q}.capability`, `${o.kind} is ${state}${o.creative_decision ? `; declared decision ${o.creative_decision.id}` : ""}`));
      }
      all.push({ o, q });
    });
  });
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
    const x = all[a].o, y = all[b].o, share = x.layers.select.filter((l) => y.layers.select.includes(l));
    if (!x.interval || !y.interval || !share.length || !overlap(x.interval, y.interval)) continue;
    if (x.channel && x.channel === y.channel && !(x.compose_with.includes(y.id) && y.compose_with.includes(x.id))) errors.push(issue(K.filter_conflict, all[b].q, `${x.id} and ${y.id} both own the ${x.channel} filter on ${share.join(", ")} while overlapping: assign one owner or compose them explicitly (compose_with on both)`));
  }
  // protected reads: a blur or distortion may not touch a protected layer during its read
  for (const { o, q } of all) {
    if (!o.interval || !["motion_blur", "focus_blur", "stylized_distortion"].includes(o.kind)) continue;
    for (const { o: other } of all) for (const pr of other.protected_reads) {
      if (pr.interval && overlap(pr.interval, o.interval) && o.layers.select.includes(pr.ref)) errors.push(issue(K.protected_read, q, `${o.id} (${o.kind}) targets ${pr.ref} during its protected read ${pr.id}`));
    }
    for (const l of o.layers.protect) if (o.layers.select.includes(l)) errors.push(issue(K.protected_read, q, `${o.id} selects and protects the same layer ${l}`));
  }
}
function checkProduct(list, ctx) {
  const { errors, warnings, total } = ctx, seen = new Set();
  list.forEach((rec, i) => {
    const p = `product[${i}]`; needId(rec, "product", p, errors, seen);
    if (!rec.stages.length) errors.push(issue(K.bad_shape, `${p}.stages`, "a choreography has at least the stage its claim needs"));
    if (!filled(rec.claim_id)) warnings.push(issue(K.bad_shape, `${p}.claim_id`, "bind the choreography to the claim it supports"));
    if (rec.depicts_studio && rec.ui !== "current-dark") errors.push(issue(K.studio_ui, `${p}.ui`, 'RasanAI Studio is drawn with the current dark UI (sidebar + Describe...Final stepper): set ui:"current-dark"; the old light UI is retired'));
    let lastRank = -1, lastStart = -1;
    rec.stages.forEach((s, j) => {
      const q = `${p}.stages[${j}]`, rank = PRODUCT_STAGES.indexOf(s.stage);
      if (rank < 0) errors.push(issue(K.bad_shape, `${q}.stage`, `stage must be ${PRODUCT_STAGES.join(" | ")}`));
      else { if (rank < lastRank) errors.push(issue(K.stage_order, `${q}.stage`, `${s.stage} comes after a later stage: order is ${PRODUCT_STAGES.join(" -> ")} (use only the stages the claim needs)`)); lastRank = Math.max(lastRank, rank); }
      if (ivCheck(s.interval, `${q}.interval`, total, errors, "a stage")) { if (s.interval.start_tick < lastStart) errors.push(issue(K.stage_order, `${q}.interval`, "stages run in time order")); lastStart = Math.max(lastStart, s.interval.start_tick); }
      const ref = s.source_state_ref;
      if (!ref || !filled(ref.id) || !["capture", "demonstration"].includes(ref.kind)) errors.push(issue(K.source_state, `${q}.source_state_ref`, "bind every stage to an approved capture state or to labelled demonstration content; no invented functionality, messages or proof"));
      else if (ref.kind === "demonstration" && !s.labels.some((l) => /demonstration|illustrat/i.test(l))) errors.push(issue(K.source_state, `${q}.labels`, "demonstration content carries a visible demonstration label"));
      else if (ref.kind === "capture" && !ref.digest && ref.revision == null) warnings.push(issue(K.unpinned, `${q}.source_state_ref`, "pin the capture state (digest or revision) so a re-capture reads as stale"));
      if (["result", "isolate", "hold"].includes(s.stage) && !(s.reading_window && s.reading_window.interval)) errors.push(issue(K.reading_window, `${q}.reading_window`, `${s.stage} needs a reading window: reading time follows the content, there is no universal hold`));
      if (s.reading_window && s.reading_window.interval && s.interval && !(s.reading_window.interval.start_tick >= s.interval.start_tick && s.reading_window.interval.end_tick <= s.interval.end_tick)) errors.push(issue(K.bad_interval, `${q}.reading_window`, "the reading window lies inside its stage"));
    });
    if (rec.stages.some((s) => s.stage === "result") && !rec.stages.some((s) => s.stage === "action")) warnings.push(issue(K.source_state, `${p}.stages`, "a result with no action stage: say what caused it, or show the action"));
  });
}
function checkAttention(list, ctx) {
  const { errors, warnings, total } = ctx, seen = new Set();
  list.forEach((rec, i) => {
    const p = `attention[${i}]`; needId(rec, "attention", p, errors, seen);
    if (!rec.reads.length) errors.push(issue(K.bad_shape, `${p}.reads`, "an attention sequence has ordered reads"));
    const orders = new Set(); let lastStart = -1;
    rec.reads.forEach((r, j) => {
      const q = `${p}.reads[${j}]`;
      if (orders.has(r.order)) errors.push(issue(K.attention_order, `${q}.order`, `duplicate read order ${r.order}`)); orders.add(r.order);
      if (!READ_TARGET_KINDS.includes(r.target_ref.kind) || !filled(r.target_ref.id)) errors.push(issue(K.unresolved_ref, `${q}.target_ref`, `bind the read to an actual target: {kind: ${READ_TARGET_KINDS.join(" | ")}, id}`));
      if (ivCheck(r.interval, `${q}.interval`, total, errors, "a read")) { if (r.interval.start_tick < lastStart) errors.push(issue(K.attention_order, `${q}.interval`, "reads are ordered by time as well as by order number")); lastStart = Math.max(lastStart, r.interval.start_tick); }
      if (!filled(r.intended_understanding)) errors.push(issue(K.bad_shape, `${q}.intended_understanding`, "say what the audience should understand from this read"));
      if (j > 0 && !filled(r.transfer_change)) warnings.push(issue(K.bad_shape, `${q}.transfer_change`, "name the change that moves emphasis here (scale, contrast, focus, position, overlap, motion or stillness)"));
      if (r.protected_read.required && !r.protected_read.min_s_basis) errors.push(issue(K.reading_window, `${q}.protected_read`, "a protected read cites its basis (a text-performance role or a product reading window), not a universal hold"));
    });
    const prot = rec.reads.filter((r) => r.protected_read.required && r.interval);
    for (let a = 0; a < prot.length; a++) for (let b = a + 1; b < prot.length; b++) if (prot[a].target_ref.id !== prot[b].target_ref.id && overlap(prot[a].interval, prot[b].interval)) errors.push(issue(K.attention_overlap, p, `protected reads ${prot[a].order} and ${prot[b].order} overlap on different targets: one must yield, or the earlier read ends first`));
  });
}

// Everything that can be checked from records alone. Playback review stays separate: nothing here says a connected movement reads well.
// capabilities: an inventory map {op_id: state | {state}} (spatial-fields capabilityInventory().ops fits). current: as staleSequenceRefs.
// -> {ok, errors:[{code,path,message}], warnings, records (normalized), digest, stale, playback_review_required:[{record_id, record_kind, reason}]}
export function checkSequence({ motifs = [], handoffs = [], optics = [], product = [], attention = [], events = [], score = null, capabilities = null, current = null } = {}) {
  const errors = [], warnings = [], total = scoreTotal(score);
  const set = normalizedSet({ motifs, handoffs, optics, product, attention }, score);
  const evs = arr(events).filter(isObj), eventIds = new Set(evs.map((e) => S(e.id)));
  const any = SEQUENCE_KINDS.some((k) => set[k].length);
  if (any && total === null) warnings.push(issue(K.notAssessable, "score", "no score supplied: intervals could not be resolved against the timebase"));
  const ctx = { errors, warnings, total, eventIds: evs.length ? eventIds : null, capabilities };
  checkMotifs(set.motifs, ctx); checkHandoffs(set.handoffs, ctx); checkOptics(set.optics, ctx); checkProduct(set.product, ctx); checkAttention(set.attention, ctx);
  // events refer to motifs (event.extensions.creative_thinking.motif_ids); signature_events stays the only event collection
  const motifIds = new Set(set.motifs.map((m) => m.id));
  evs.forEach((e, i) => arr(ext(e) && ext(e).motif_ids).forEach((id) => { if (!motifIds.has(S(id))) errors.push(issue(K.unresolved_ref, `signature_events[${i}].extensions.creative_thinking.motif_ids`, `event ${e.id} refers to unknown motif ${id}`)); }));
  set.handoffs.forEach((h, i) => { if (h.motif_id && !motifIds.has(h.motif_id)) errors.push(issue(K.unresolved_ref, `handoffs[${i}].motif_id`, `handoff ${h.id} refers to unknown motif ${h.motif_id}`)); });
  const stale = staleSequenceRefs(set, { events: evs.length ? [...eventIds] : undefined, ...(isObj(current) ? current : {}) });
  for (const s of stale) errors.push(issue(s.code, `${s.record_kind}.${s.record_id}`, s.message, { ref_kind: s.ref_kind, ref: s.ref }));
  for (const kind of SEQUENCE_KINDS) set[kind].forEach((r, i) => { if (!Object.keys(r.approved_input_revisions).length) warnings.push(issue(K.unpinned, `${kind}[${i}]`, `${r.id || kind} records no approved input revisions: a changed input cannot read as stale`)); });
  // static checks never substitute for watching connected motion: every handoff, optic, product and attention record owes a playback review
  const playback = [];
  for (const kind of ["handoffs", "optics", "product", "attention"]) for (const r of set[kind]) playback.push({ record_id: r.id, record_kind: kind, reason: kind === "handoffs" && r.handoff_kind !== "continuous" ? "intentional break: confirm it reads as intended in playback" : "connected motion, optics, product action or attention transfer is judged in temporal playback, not from these checks" });
  return { ok: errors.length === 0, errors, warnings, records: set, digest: sequenceDigest(set), stale, playback_review_required: playback };
}
