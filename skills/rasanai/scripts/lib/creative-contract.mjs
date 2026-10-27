// Creative brief contract (schema_version 1): one small, specific idea that survives every handoff.
// Pure and import-safe: no file, network or process access, no writes, no CLI. The Director owns the brief; this
// grants no approval. Structure (validate), currentness (pins), evidence and review are kept apart on purpose:
// nothing here judges taste, and a well-formed brief never turns into "ready" without current review evidence.
import { canonicalDigest } from "./contracts.mjs";
import { CREATIVE_ERROR_CODES } from "./creative-policy.mjs";

export const CREATIVE_SCHEMA_VERSION = 1;
export const CREATIVE_MODES = ["proposal", "story", "look", "build"];
export const PIN_STAGES = ["brief", "story", "look", "storyboard"];

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const filled = (x) => typeof x === "string" && x.trim().length > 0;
const posInt = (x) => Number.isInteger(x) && x >= 1;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HEX64 = /^[0-9a-f]{64}$/;

// Pins each mode (and each review stage) must carry. A provisional brief claims none of story/look/storyboard.
const MODE_PINS = { proposal: [], story: ["brief"], look: ["brief", "story", "look"], build: PIN_STAGES };
const STAGE_PINS = { brief: [], story: ["brief"], look: ["brief", "story"], storyboard: ["brief", "story", "look"], build: PIN_STAGES, final: PIN_STAGES };
// Words that describe a mood without saying what changes; alone they are a creative concern, never a length rule.
const VAGUE = new Set(["premium", "cinematic", "stunning", "beautiful", "modern", "sleek", "epic", "amazing", "polished", "elegant", "bold", "dynamic", "clean", "slick", "world-class", "high-end", "immersive", "powerful", "innovative"]);
const STOP = new Set(["a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "with", "that", "this", "is", "are", "it", "its", "film", "video", "feel", "look", "looks", "feels", "very", "more", "be"]);

const err = (code, path, message) => ({ code, path, message });
const idSet = (x) => (x instanceof Set ? x : Array.isArray(x) ? new Set(x.map((v) => (isObj(v) ? v.id : v))) : null);

// Content words left after dropping stopwords and mood-only adjectives.
const concreteWords = (s) => str(s).toLowerCase().split(/[^a-z0-9'-]+/).filter((w) => w && !STOP.has(w) && !VAGUE.has(w));

function checkPin(pin, stage, mode, errors, path) {
  if (pin === null || pin === undefined) return;
  if (!isObj(pin)) return errors.push(err("bad_pin", path, "a pin is null or {artifact_ref, artifact_digest, revision, source_action_id}"));
  if (!filled(pin.artifact_ref)) errors.push(err("bad_pin", `${path}.artifact_ref`, "artifact_ref must be a non-empty string"));
  if (!HEX64.test(str(pin.artifact_digest))) errors.push(err("bad_pin", `${path}.artifact_digest`, "artifact_digest must be a full sha256 hex digest"));
  if (!posInt(pin.revision)) errors.push(err("bad_pin", `${path}.revision`, "revision must be a positive integer"));
  const sid = pin.source_action_id;
  if (!(sid === null || filled(sid))) errors.push(err("bad_pin", `${path}.source_action_id`, "source_action_id must be a string or null"));
  if (sid === null && !filled(pin.legacy_basis)) errors.push(err("pin_unauthorized", `${path}.source_action_id`, "a null source_action_id needs a documented legacy_basis; an agent-written file is not authorization"));
  if (mode === "proposal" && stage !== "brief") errors.push(err("proposal_claims_approval", path, "a provisional brief must not claim a story, look or storyboard approval"));
}

// -> {ok, errors:[{code,path,message}], warnings:[], missing:[]}
// context: {stage, expectedPins, knownIds:{sources, beats, claims, shots}} (arrays or Sets; a missing set skips that ref check).
export function validateCreativeBrief(doc, context = {}) {
  const errors = [], warnings = [], missing = [];
  if (!isObj(doc)) return { ok: false, errors: [err("not_object", "", "brief must be a JSON object")], warnings, missing };
  const ctx = isObj(context) ? context : {};
  const known = isObj(ctx.knownIds) ? ctx.knownIds : {};
  const sources = idSet(known.sources), beats = idSet(known.beats), claims = idSet(known.claims), shots = idSet(known.shots);

  if (doc.schema_version !== CREATIVE_SCHEMA_VERSION) errors.push(err("bad_schema_version", "schema_version", `schema_version must be ${CREATIVE_SCHEMA_VERSION}`));
  for (const k of ["creative_policy_revision", "revision"]) if (!posInt(doc[k])) errors.push(err("bad_number", k, `${k} must be a positive integer`));
  const mode = doc.mode;
  if (!CREATIVE_MODES.includes(mode)) errors.push(err("bad_mode", "mode", `mode must be one of ${CREATIVE_MODES.join(", ")}`));
  const later = mode !== "proposal";

  // Pins: null until the artifact is really approved; shape checked here, truth checked against expectedPins below.
  const pins = isObj(doc.pins) ? doc.pins : null;
  if (!pins) { errors.push(err("bad_pins", "pins", "pins must be an object with brief/story/look/storyboard")); missing.push("pins"); }
  else {
    for (const s of PIN_STAGES) {
      if (!(s in pins)) { errors.push(err("bad_pins", `pins.${s}`, `pins.${s} must be present (null until approved)`)); continue; }
      checkPin(pins[s], s, mode, errors, `pins.${s}`);
    }
    for (const s of MODE_PINS[mode] || []) if (pins[s] === null || pins[s] === undefined) missing.push(`pins.${s}`);
  }

  for (const k of ["communication_kind", "promise", "premise"]) if (!filled(doc[k])) { errors.push(err("missing_field", k, `${k} is required`)); missing.push(k); }
  for (const k of ["promise", "premise"]) {
    if (filled(doc[k]) && concreteWords(doc[k]).length < 2) warnings.push({ code: "vague_vocabulary", path: k, message: `${k} names a mood, not what changes or what the viewer understands` });
  }

  // Native material: the product's own stuff that makes the film specific.
  arr(doc.native_material).forEach((m, i) => {
    const p = `native_material[${i}]`;
    if (!isObj(m) || !ID_RE.test(str(m.id)) || !filled(m.kind)) return errors.push(err("bad_native_material", p, "needs a valid id and a kind"));
    if (!filled(m.source_ref)) errors.push(err("unresolved_ref", `${p}.source_ref`, "source_ref is required"));
    else if (sources && !sources.has(m.source_ref)) errors.push(err("unresolved_ref", `${p}.source_ref`, `unknown source ${m.source_ref}`));
  });
  if (doc.native_material !== undefined && !Array.isArray(doc.native_material)) errors.push(err("bad_type", "native_material", "native_material must be an array"));
  if (later && !arr(doc.native_material).length) warnings.push({ code: "no_native_material", path: "native_material", message: "no product material named; the film risks being generic" });

  for (const k of ["opening", "payoff"]) {
    const o = doc[k];
    if (o === undefined || o === null) { (later ? errors : warnings).push(err("missing_field", k, `${k} is missing`)); if (later) missing.push(k); continue; }
    if (!isObj(o) || !filled(o.event)) errors.push(err("bad_field", k, `${k}.event must say what changes visibly`));
    else if (k === "opening" && !filled(o.why_watch)) warnings.push({ code: "missing_why_watch", path: `${k}.why_watch`, message: "say why this audience keeps watching" });
    else if (k === "payoff" && !filled(o.resolves)) warnings.push({ code: "missing_resolves", path: `${k}.resolves`, message: "say which proposition or setup the payoff answers" });
  }

  // Signature events: optional, may be subtle, silent or static. Empty is valid with a reason.
  if (!Array.isArray(doc.signature_events)) { errors.push(err("bad_type", "signature_events", "signature_events must be an array (empty is valid)")); missing.push("signature_events"); }
  else {
    const seen = new Set();
    doc.signature_events.forEach((e, i) => {
      const p = `signature_events[${i}]`;
      if (!isObj(e)) return errors.push(err("bad_signature", p, "signature event must be an object"));
      if (!ID_RE.test(str(e.id))) errors.push(err("bad_id", `${p}.id`, "id must be a stable identifier"));
      else if (seen.has(e.id)) errors.push(err("duplicate_id", `${p}.id`, `duplicate signature id ${e.id}`));
      else seen.add(e.id);
      if (!Array.isArray(e.beat_ids) || !e.beat_ids.length) errors.push(err("bad_signature", `${p}.beat_ids`, "assign at least one beat id"));
      arr(e.beat_ids).forEach((b, j) => {
        if (!ID_RE.test(str(b))) errors.push(err("bad_id", `${p}.beat_ids[${j}]`, "bad beat id"));
        else if (beats && !beats.has(b)) errors.push(err("unresolved_ref", `${p}.beat_ids[${j}]`, `unknown beat ${b}`));
      });
      for (const k of ["before", "change", "after", "why_motion", "fallback"]) if (!filled(e[k])) errors.push(err("bad_signature", `${p}.${k}`, `${k} must say something concrete`));
      for (const k of ["proof_refs", "must_preserve"]) if (!Array.isArray(e[k])) errors.push(err("bad_signature", `${p}.${k}`, `${k} must be an array`));
      arr(e.must_preserve).forEach((m, j) => { if (!filled(m)) errors.push(err("bad_signature", `${p}.must_preserve[${j}]`, "empty must_preserve entry")); });
      arr(e.proof_refs).forEach((r, j) => {
        if (!filled(r)) return errors.push(err("unresolved_ref", `${p}.proof_refs[${j}]`, "empty proof ref"));
        if ((claims || sources) && !(claims && claims.has(r)) && !(sources && sources.has(r))) errors.push(err("unresolved_ref", `${p}.proof_refs[${j}]`, `unknown proof ref ${r}`));
      });
      arr(e.shot_ids).forEach((s, j) => { if (shots && !shots.has(s)) errors.push(err("unresolved_ref", `${p}.shot_ids[${j}]`, `unknown shot ${s}`)); });
      if (e.shot_ids !== undefined && !Array.isArray(e.shot_ids)) errors.push(err("bad_signature", `${p}.shot_ids`, "shot_ids must be an array"));
    });
    if (!doc.signature_events.length && !filled(doc.signature_events_reason)) warnings.push({ code: "no_signature_reason", path: "signature_events_reason", message: "no signature events; note why that suits this format" });
  }

  const vs = doc.visual_strategy;
  if (!isObj(vs)) { errors.push(err("missing_field", "visual_strategy", "visual_strategy is required")); missing.push("visual_strategy"); }
  else for (const k of ["protagonist", "progression", "rhythm", "restraint", "sound_role"]) if (!filled(vs[k])) (later ? errors : warnings).push(err("missing_field", `visual_strategy.${k}`, `${k} is empty`));

  for (const k of ["repetition_intent", "do_not_substitute"]) if (!Array.isArray(doc[k])) errors.push(err("bad_type", k, `${k} must be an array`));
  if (later && !arr(doc.do_not_substitute).length) warnings.push({ code: "no_do_not_substitute", path: "do_not_substitute", message: "name what the builder must not swap in" });

  if (!isObj(doc.references)) errors.push(err("bad_type", "references", "references must be an object {selection_ref, digest}"));
  else if (doc.references.digest !== null && doc.references.digest !== undefined && !HEX64.test(str(doc.references.digest))) errors.push(err("bad_digest", "references.digest", "digest must be null or a full sha256 hex digest"));

  const ef = doc.effort;
  if (!isObj(ef)) errors.push(err("bad_type", "effort", "effort must be an object"));
  else {
    if (!Number.isInteger(ef.round_limit) || ef.round_limit < 0) errors.push(err("bad_number", "effort.round_limit", "round_limit must be a non-negative integer"));
    const fe = arr(ef.focus_event_ids), ids = new Set(arr(doc.signature_events).map((e) => e && e.id));
    fe.forEach((id, j) => { if (!ids.has(id)) errors.push(err("unresolved_ref", `effort.focus_event_ids[${j}]`, `unknown signature event ${id}`)); });
  }
  if (!filled(doc.decision_authority)) errors.push(err("missing_field", "decision_authority", "decision_authority must state that stage approvals stay with the user"));

  // Event commitments (additive; only for creative_policy_revision >= 2, so revision 1 briefs validate exactly as before).
  if (doc.creative_policy_revision >= 2 && Array.isArray(doc.signature_events)) {
    const phase = phaseOf(ctx.stage, mode);
    const ec = validateEventCommitments(doc, { phase, treatment: ctx.treatment, absences: ctx.absences, pins: isObj(ctx.expectedPins) ? ctx.expectedPins : pins, currentDigests: ctx.currentDigests });
    errors.push(...ec.errors); warnings.push(...ec.warnings); missing.push(...ec.missing);
  }

  // Currentness against what is actually approved right now.
  if (pins && isObj(ctx.expectedPins)) {
    const cur = creativePinsCurrent(doc, ctx.expectedPins);
    for (const s of cur.stale) errors.push(err("pin_stale", `pins.${s}`, `pin for ${s} no longer matches the current approved artifact`));
    for (const s of cur.missing) if ((MODE_PINS[mode] || []).includes(s)) errors.push(err("pin_missing", `pins.${s}`, `a ${mode} brief needs a current ${s} pin`));
  } else if (pins && later && (MODE_PINS[mode] || []).some((s) => !pins[s])) {
    for (const s of MODE_PINS[mode]) if (!pins[s]) errors.push(err("pin_missing", `pins.${s}`, `a ${mode} brief needs a current ${s} pin`));
  }
  return { ok: errors.length === 0, errors, warnings, missing };
}

const digestOf = (v) => (typeof v === "string" ? v : isObj(v) ? str(v.artifact_digest) || str(v.sha256) || str(v.digest) : "");

// Compares full digests (never filenames). expectedPins: {stage: digest | {artifact_digest} | null}.
// A null/absent expectation means nothing is approved for that stage, so a recorded pin there is stale.
// -> {current, stale:[stage], missing:[stage]}
export function creativePinsCurrent(doc, expectedPins) {
  const stale = [], missing = [];
  const pins = isObj(doc) && isObj(doc.pins) ? doc.pins : {};
  const exp = isObj(expectedPins) ? expectedPins : {};
  for (const s of Object.keys(exp)) {
    const want = digestOf(exp[s]), have = isObj(pins[s]) ? str(pins[s].artifact_digest) : "";
    if (!want) { if (have) stale.push(s); continue; }
    if (!have) missing.push(s);
    else if (have !== want) stale.push(s);
  }
  return { current: !stale.length && !missing.length, stale, missing };
}

const bytes = (v) => Buffer.byteLength(JSON.stringify(v), "utf8");

// The part of the brief one worker needs. Mandatory facts are never cut, whatever the byte budget; optional
// history goes by reference. -> {mandatory, references, omittedOptional}
export function creativeSlice(doc, { role = "", beatIds = [], shotIds = [], maxInlineBytes = 16000 } = {}) {
  const d = isObj(doc) ? doc : {};
  const beats = new Set(arr(beatIds)), shots = new Set(arr(shotIds));
  const scoped = beats.size > 0 || shots.size > 0;
  const events = arr(d.signature_events).filter((e) => isObj(e) && (!scoped || arr(e.beat_ids).some((b) => beats.has(b)) || arr(e.shot_ids).some((s) => shots.has(s))));
  const omittedEvents = arr(d.signature_events).filter((e) => isObj(e) && !events.includes(e)).map((e) => e.id);
  const mandatory = {
    role: str(role),
    promise: d.promise ?? null,
    premise: d.premise ?? null,
    visual_strategy: d.visual_strategy ?? null,
    signature_events: events,
    must_preserve: events.flatMap((e) => arr(e.must_preserve)),
    do_not_substitute: arr(d.do_not_substitute),
    payoff: d.payoff ?? null,
    approved_targets: Object.fromEntries(PIN_STAGES.filter((s) => isObj(d.pins) && isObj(d.pins[s])).map((s) => [s, { artifact_ref: d.pins[s].artifact_ref, artifact_digest: d.pins[s].artifact_digest }])),
  };
  const used = events.flatMap((e) => arr(e.proof_refs));
  const optional = [
    ["opening", d.opening],
    ["native_material", arr(d.native_material).filter((m) => isObj(m) && (!scoped || used.includes(m.id) || used.includes(m.source_ref)))],
    ["repetition_intent", arr(d.repetition_intent)],
  ];
  let size = bytes(mandatory);
  const omittedOptional = omittedEvents.length ? [`signature_events:${omittedEvents.join(",")}`] : [];
  for (const [k, v] of optional) {
    if (v === undefined || v === null || (Array.isArray(v) && !v.length)) continue;
    const add = bytes(v) + k.length + 6;
    if (size + add <= maxInlineBytes) { mandatory[k] = v; size += add; } else omittedOptional.push(k);
  }
  const references = {
    selection_ref: isObj(d.references) ? d.references.selection_ref ?? null : null,
    references_digest: isObj(d.references) ? d.references.digest ?? null : null,
    revision: d.revision ?? null,
    brief_digest: canonicalDigest(d),
    full_brief: "creative/brief.json",
    history: "creative/revisions/",
  };
  return { mandatory, references, omittedOptional };
}

const rs = (code, message) => ({ code, message });
// Judgment categories a style waiver can never remove.
const HARD = new Set(["factual", "fact", "permission", "mechanical", "legal", "brand-safety"]);

// Waiver = {kind:"aesthetic", source_action_id, artifact_digest}. Needs real user evidence, never an agent note.
const waiverOk = (w, digests) => isObj(w) && w.kind === "aesthetic" && filled(w.source_action_id) && HEX64.test(str(w.artifact_digest)) && (!digests.length || digests.includes(w.artifact_digest));

// Distinguishes structure, currentness, evidence and review; schema-valid with no visual evidence is never a pass.
// review: the creative/reviews/<stage>-rN.json envelope (+ optional numeric `round`).
// -> {state:'ready'|'revise'|'blocked'|'needs_user'|'not_reviewed', reasons:[{code,message}]}
export function creativeReadiness({ brief, stage, review, expectedPins, expectedArtifactDigests, waiver = null, treatment = null, absences = null, currentDigests = null } = {}) {
  const reasons = [];
  const structure = validateCreativeBrief(brief, { stage, expectedPins, treatment, absences, currentDigests });
  if (!structure.ok) {
    for (const e of structure.errors) reasons.push(rs(e.code, `${e.path}: ${e.message}`));
    return { state: "blocked", reasons };
  }
  // Currentness: every pin the stage depends on must be present and match the approved artifact now.
  const need = STAGE_PINS[stage] || [];
  const exp = isObj(expectedPins) ? expectedPins : {};
  const wanted = Object.fromEntries(need.map((s) => [s, s in exp ? exp[s] : undefined]));
  for (const s of need) if (!digestOf(wanted[s])) reasons.push(rs("approval_missing", `no current approved ${s} to anchor ${stage}`));
  const cur = creativePinsCurrent(brief, Object.fromEntries(need.filter((s) => digestOf(wanted[s])).map((s) => [s, wanted[s]])));
  for (const s of cur.stale) reasons.push(rs("pin_stale", `brief pin for ${s} is stale`));
  for (const s of cur.missing) reasons.push(rs("pin_missing", `brief carries no pin for ${s}`));
  if (reasons.length) return { state: "blocked", reasons };

  // Evidence: a review must exist, be independent, be about these exact artifacts and cite what was observed.
  if (!isObj(review)) return { state: "not_reviewed", reasons: [rs("no_review", "no creative review for this stage yet")] };
  const expDigests = (Array.isArray(expectedArtifactDigests) ? expectedArtifactDigests.map((x) => (isObj(x) ? x.sha256 : x)) : isObj(expectedArtifactDigests) ? Object.values(expectedArtifactDigests).map(digestOf) : []).filter(Boolean);
  const reviewed = arr(review.artifact_digests).map((a) => (isObj(a) ? a.sha256 : a));
  const staleReview = expDigests.length && (!reviewed.length || expDigests.some((d) => !reviewed.includes(d)));
  if (staleReview) reasons.push(rs("review_stale", "review does not cover the current artifact digests"));
  if (review.stage !== undefined && review.stage !== stage) reasons.push(rs("review_wrong_stage", `review is for ${review.stage}, not ${stage}`));
  if (!(isObj(review.reviewer) && review.reviewer.independent_of_builder === true)) reasons.push(rs("review_not_independent", "reviewer is not independent of the builder"));
  if (!(isObj(review.evidence) && arr(review.evidence.observed_refs).length)) reasons.push(rs("no_visual_evidence", "review cites no observed frames or artifacts; a valid schema is not a visual pass"));
  if (reasons.length) return { state: "not_reviewed", reasons };

  const judgments = arr(review.judgments).filter(isObj);
  const lim = arr(review.limitations).filter(filled);
  const hard = judgments.filter((j) => HARD.has(str(j.category).toLowerCase()) && !["ok", "pass", "strong", "good"].includes(str(j.verdict).toLowerCase()));
  if (review.result === "blocked" || hard.length) {
    for (const j of hard) reasons.push(rs("hard_failure", `${j.category}: ${str(j.observed, "see review")}`));
    if (!reasons.length) reasons.push(rs("review_blocked", "review result is blocked"));
    return { state: "blocked", reasons };
  }
  const weak = judgments.filter((j) => ["weak", "fail", "poor"].includes(str(j.verdict).toLowerCase()));
  const contradicted = review.result === "ready" && weak.length > 0;
  if (review.result === "ready" && !contradicted) {
    for (const l of lim) reasons.push(rs("limitation", l));
    return { state: "ready", reasons };
  }
  // Below quality: revise while rounds remain, then hand the decision to the person with the evidence.
  for (const j of weak) reasons.push(rs("below_quality", `${str(j.criterion, "criterion")}: ${str(j.observed, "see review")}${j.repair ? ` -> ${j.repair}` : ""}`));
  if (contradicted) reasons.push(rs("result_contradicts_judgments", "review says ready but records weak judgments"));
  if (!weak.length && review.result !== "ready") reasons.push(rs("review_requests_revision", `review result is ${str(review.result, "unknown")}`));
  const limit = isObj(brief.effort) ? brief.effort.round_limit : 0;
  const round = Number.isInteger(review.round) ? review.round : 1;
  if (waiverOk(waiver, expDigests)) { reasons.push(rs("aesthetic_waiver", "aesthetic concerns waived by the user; factual and permission checks still apply")); return { state: "ready", reasons }; }
  if (waiver) reasons.push(rs("waiver_rejected", "waiver needs kind 'aesthetic', a source_action_id and the reviewed artifact digest"));
  if (review.result === "needs_user" || round >= limit) { reasons.push(rs("budget_exhausted", `round ${round} of ${limit}: surface the evidence through the existing review controls`)); return { state: "needs_user", reasons }; }
  return { state: "revise", reasons };
}

// ======================================================================================================
// Event commitments (V3 W04). Additive and opt-in: every check below runs only for creative_policy_revision >= 2
// (or when a caller invokes the helper directly). `signature_events` stays the ONLY event collection; extension data
// (event.extensions.creative_thinking) and treatment commitments refer to its IDs. Truth comes from the selected treatment,
// the event records and the approval pins the caller passes: no keyword guessing, no approval is created or consumed here.
// Consumers: validateCreativeBrief (above), creativeReadiness (above), creative-handoff.mjs (packets, handoff check, review
// packet) and, once the lead wires it, crew.mjs creativeTraceProblems (see references/event-commitments.md).
// ======================================================================================================
export const COMMITMENT_PHASES = ["proposal", "story", "look", "storyboard", "build"];
export const EVENT_REQUIREMENTS = ["required", "supporting"];
export const EVENT_STATES = ["proposed", "bound", "implemented", "reviewed", "unavailable"];
// Same strings as W01's CREATIVE_ERROR_CODES (creative-policy.mjs), now imported from it.
export const COMMITMENT_ERROR_CODES = Object.freeze({
  unbound: CREATIVE_ERROR_CODES.required_commitment_unbound, absence: CREATIVE_ERROR_CODES.intentional_absence_unresolved, owner: CREATIVE_ERROR_CODES.owner_missing, stale: CREATIVE_ERROR_CODES.stale_input,
  deviation: CREATIVE_ERROR_CODES.material_deviation, notAssessable: CREATIVE_ERROR_CODES.not_assessable, approval: CREATIVE_ERROR_CODES.approval_missing,
});
const PHASE_RANK = Object.fromEntries(COMMITMENT_PHASES.map((p, i) => [p, i]));
export const phaseOf = (stage, mode) => (COMMITMENT_PHASES.includes(stage) ? stage : stage === "final" ? "build" : COMMITMENT_PHASES.includes(mode) ? mode : "proposal");

export const creativeExt = (x) => (isObj(x) && isObj(x.extensions) && isObj(x.extensions.creative_thinking) ? x.extensions.creative_thinking : null);
const nonEmpty = (x) => (Array.isArray(x) ? x.length > 0 : isObj(x) ? Object.keys(x).length > 0 : filled(x));
const validWindow = (w) => Array.isArray(w) && w.length === 2 && w.every((n) => typeof n === "number" && Number.isFinite(n)) && w[0] >= 0 && w[1] > w[0];

// The treatment's declared commitments, normalised. Read from treatment.extensions.creative_thinking.commitments (and a plain
// treatment.commitments alias). A commitment: {id, requirement?, kind?, label?, beat_ids?, event_id?, state?|deferred?, phase?}.
// W02 normalizeCreativeThinking keeps `commitments` as an object or an array (default {}): accept the array, {items|list|commitments: [...]}, {required: [...], supporting: [...]} and an id -> record map
function commitmentRows(v) {
  if (Array.isArray(v)) return v;
  if (!isObj(v)) return [];
  for (const k of ["items", "list", "commitments"]) if (Array.isArray(v[k])) return v[k];
  if (Array.isArray(v.required) || Array.isArray(v.supporting)) return [...arr(v.required).map((c) => (isObj(c) ? { requirement: "required", ...c } : c)), ...arr(v.supporting).map((c) => (isObj(c) ? { requirement: "supporting", ...c } : c))];
  return Object.entries(v).filter(([, c]) => isObj(c)).map(([id, c]) => ({ id, ...c }));
}
export function treatmentCommitments(treatment) {
  const t = isObj(treatment) ? treatment : {}, x = creativeExt(t), seen = new Set(), out = [];
  for (const c of [...commitmentRows(x && x.commitments), ...commitmentRows(t.commitments)]) {
    if (!isObj(c) || !ID_RE.test(str(c.id)) || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, requirement: c.requirement === "supporting" ? "supporting" : "required", kind: str(c.kind) || "event", label: str(c.label || c.what), beat_ids: arr(c.beat_ids).map(String), event_id: filled(c.event_id) ? c.event_id : null, deferred: c.deferred === true || c.state === "deferred", bind_phase: COMMITMENT_PHASES.includes(c.phase) ? c.phase : "story", treatment_id: str(t.id || t.label) || null });
  }
  return out;
}

// What an event still lacks for the phase. Required events only; a supporting event owes just structure (checked elsewhere).
// -> [{field, phase, message}]
export function eventBindingGaps(event, phase) {
  const e = isObj(event) ? event : {}, x = creativeExt(e) || {}, rank = PHASE_RANK[phase] ?? 0, gaps = [];
  if (x.requirement === "supporting") return gaps;
  const need = (ph, field, ok, message) => { if (rank >= PHASE_RANK[ph] && !ok) gaps.push({ field, phase: ph, message }); };
  need("story", "narrative_purpose", filled(x.narrative_purpose), "say what the audience should understand from this event");
  need("look", "medium_commitments", nonEmpty(x.medium_commitments) || filled(x.capability_state), "bind the chosen medium's commitments or capability limit");
  need("storyboard", "binding", arr(e.shot_ids).length > 0 || arr(e.beat_ids).length > 0 && validWindow(x.interval_s), "bind shot ids, or beat ids with an interval_s on the score timebase");
  need("storyboard", "audience_reads", arr(x.audience_reads).length > 0, "list the ordered audience reads");
  need("storyboard", "object_ids", arr(x.object_ids).length > 0, "name the object identities that must stay recognisable");
  need("storyboard", "continuity_owner", filled(x.continuity_owner), "name the one accountable continuity owner");
  need("storyboard", "scope", filled(x.scope), "state the scope (for example one-continuous-shot)");
  need("storyboard", "review_plan", isObj(x.review_plan) && filled(x.review_plan.method), "state how and where this will be reviewed");
  need("build", "state", ["bound", "implemented", "reviewed"].includes(x.state), "state must have reached bound before build");
  return gaps;
}

// Is an intentional-absence basis resolved? Needs: an approval source that matches a current pin, at least one alternative
// commitment (what must survive, how it is reviewed) and no deferred event ids left. -> {resolved, problems:[{code,message}]}
export function resolveIntentionalAbsence(basis, pins) {
  const problems = [], b = isObj(basis) ? basis : null;
  if (!b) return { resolved: false, problems: [{ code: COMMITMENT_ERROR_CODES.absence, message: "no commitment_basis declared" }] };
  const alts = arr(b.commitments).filter(isObj);
  if (!alts.length) problems.push({ code: COMMITMENT_ERROR_CODES.absence, message: "commitment_basis names no alternative commitment (what must survive instead)" });
  alts.forEach((a, i) => { if (!filled(a.id) || !filled(a.must_preserve) || !filled(a.review_method)) problems.push({ code: COMMITMENT_ERROR_CODES.absence, message: `commitment_basis.commitments[${i}] needs id, must_preserve and review_method` }); });
  if (arr(b.unresolved_event_ids).length) problems.push({ code: COMMITMENT_ERROR_CODES.absence, message: `commitment_basis still defers events ${arr(b.unresolved_event_ids).join(", ")}: a deferred event is not an intentional absence` });
  const src = b.approval_source;
  const wantDigest = digestOf(src), wantAction = isObj(src) ? str(src.source_action_id) : "";
  const live = isObj(pins) ? Object.values(pins).map((p) => (typeof p === "string" ? { artifact_digest: p } : p)).filter(isObj) : [];
  const matched = (wantDigest || wantAction) && live.some((p) => (wantDigest && str(p.artifact_digest || p.sha256 || p.digest) === wantDigest) || (wantAction && str(p.source_action_id) === wantAction));
  if (!src) problems.push({ code: COMMITMENT_ERROR_CODES.approval, message: "commitment_basis has no approval_source: an unapproved quiet-film claim is a proposal" });
  else if (!matched) problems.push({ code: COMMITMENT_ERROR_CODES.approval, message: "commitment_basis approval_source matches no current approval pin" });
  return { resolved: problems.length === 0, problems };
}

// -> {bound, unresolved, intentionally_absent, incompatible} (commitment IDs), plus additive `details`, `problems` and `quiet_film`.
// events: the brief's signature_events (the only event collection). absences: [commitment_basis]; pins: current approval pins.
// Optional `phase` also holds bound events to that phase's binding requirements (an incomplete event is unresolved).
export function reconcileCommitments({ treatment = null, events = [], absences = [], pins = null, phase = null } = {}) {
  const evs = arr(events).filter((e) => isObj(e) && filled(e.id)), cs = treatmentCommitments(treatment);
  const bases = arr(absences).filter(isObj);
  const out = { bound: [], unresolved: [], intentionally_absent: [], incompatible: [], details: {}, problems: [], quiet_film: null };
  const resolvedBases = bases.map((b) => ({ b, r: resolveIntentionalAbsence(b, pins) }));
  const problem = (code, c, responsible_phase, message) => out.problems.push({ code, commitment_id: c.id, treatment_id: c.treatment_id, beat_ids: c.beat_ids, responsible_phase, message });
  for (const c of cs) {
    const hits = evs.filter((e) => e.id === c.event_id || arr(creativeExt(e) && creativeExt(e).commitment_ids).includes(c.id) || (!c.event_id && e.id === c.id));
    const covering = resolvedBases.filter(({ b }) => arr(b.commitment_ids).includes(c.id));
    const absent = covering.find(({ r }) => r.resolved);
    const where = `${c.treatment_id ? `treatment ${c.treatment_id}` : "the selected treatment"}${c.beat_ids.length ? `, beat ${c.beat_ids.join("/")}` : ""}`;
    const d = out.details[c.id] = { requirement: c.requirement, event_ids: hits.map((e) => e.id), absence: absent ? "resolved" : covering.length ? "unresolved" : null };
    if (hits.length && absent) { out.incompatible.push(c.id); d.reason = "both bound to an event and declared intentionally absent"; problem("incompatible_commitment", c, "storyboard", `${c.id} (${where}) is bound to ${d.event_ids.join(", ")} and also declared intentionally absent: pick one`); continue; }
    if (hits.length) {
      const bad = hits.filter((e) => creativeExt(e) && (creativeExt(e).state === "unavailable" || (c.requirement === "required" && creativeExt(e).requirement === "supporting") || (c.beat_ids.length && arr(e.beat_ids).length && !arr(e.beat_ids).some((x) => c.beat_ids.includes(String(x))))));
      if (bad.length === hits.length) { out.incompatible.push(c.id); d.reason = "bound event is unavailable, downgraded to supporting, or sits on different beats than promised"; problem("incompatible_commitment", c, "storyboard", `${c.id} (${where}): event ${bad.map((e) => e.id).join(", ")} does not fit the promise (unavailable, downgraded or moved beats); return through the stage revision`); continue; }
      const gaps = phase && c.requirement === "required" ? hits.flatMap((e) => eventBindingGaps(e, phase).map((g) => ({ ...g, event_id: e.id }))) : [];
      if (gaps.length) { out.unresolved.push(c.id); d.reason = "binding_incomplete"; d.gaps = gaps.map((g) => `${g.event_id}.${g.field}`); const g0 = gaps[0]; problem(COMMITMENT_ERROR_CODES.unbound, c, g0.phase, `${c.id} (${where}): event ${g0.event_id} lacks ${gaps.map((g) => g.field).join(", ")} for ${phase}; ${g0.phase} binds it`); continue; }
      out.bound.push(c.id); continue;
    }
    if (absent) { out.intentionally_absent.push(c.id); continue; }
    out.unresolved.push(c.id);
    if (covering.length) { d.reason = "absence_unresolved"; for (const { r } of covering) for (const p of r.problems) problem(COMMITMENT_ERROR_CODES.absence, c, "story", `${c.id} (${where}): ${p.message}`); }
    else { d.reason = c.deferred ? "deferred" : "no_event"; problem(COMMITMENT_ERROR_CODES.unbound, c, c.bind_phase, `${c.id} (${where}) has no signature event and no approved intentional absence${c.deferred ? " (marked deferred)" : ""}; ${c.bind_phase} binds it`); }
  }
  // film level: a quiet film is only quiet when nothing required is still open and the alternative basis is resolved
  const open = out.unresolved.filter((id) => out.details[id].requirement === "required");
  const anyBasis = resolvedBases.length > 0, basisOk = resolvedBases.some(({ r }) => r.resolved);
  out.quiet_film = { empty_events: evs.length === 0, basis_declared: anyBasis, basis_resolved: basisOk, passes_as_quiet: evs.length === 0 && !open.length && basisOk };
  return out;
}

// Structural check of the event extension fields and commitment truth for one brief. Structure only: it never sets or accepts
// `reviewed` as proof. -> {errors:[{code,path,message}], warnings, missing, reconciliation}
export function validateEventCommitments(doc, { phase = "proposal", treatment = null, absences = null, pins = null, currentDigests = null } = {}) {
  const errors = [], warnings = [], missing = [], rank = PHASE_RANK[phase] ?? 0;
  const events = arr(doc && doc.signature_events).filter(isObj);
  const digests = currentDigests ? new Set(arr(currentDigests).map((d) => (isObj(d) ? d.sha256 || d.artifact_digest : d))) : null;
  const owners = new Map();
  events.forEach((e, i) => {
    const x = creativeExt(e); if (!x) { if (rank >= PHASE_RANK.storyboard) warnings.push({ code: "no_event_extension", path: `signature_events[${i}].extensions`, message: `event ${e.id} carries no creative_thinking extension (requirement, state, scope, review_plan)` }); return; }
    const p = `signature_events[${i}].extensions.creative_thinking`;
    if (x.requirement !== undefined && !EVENT_REQUIREMENTS.includes(x.requirement)) errors.push(err("bad_enum", `${p}.requirement`, `requirement must be one of ${EVENT_REQUIREMENTS.join(", ")}`));
    if (x.state !== undefined && !EVENT_STATES.includes(x.state)) errors.push(err("bad_enum", `${p}.state`, `state must be one of ${EVENT_STATES.join(", ")}`));
    arr(x.audience_reads).forEach((r, j) => { if (!isObj(r) || !ID_RE.test(str(r.id)) || !validWindow(r.window_s)) errors.push(err("bad_interval", `${p}.audience_reads[${j}]`, "an audience read needs an id and window_s [start,end] with 0 <= start < end in score seconds")); });
    if (x.interval_s !== undefined && !validWindow(x.interval_s)) errors.push(err("bad_interval", `${p}.interval_s`, "interval_s must be [start,end] with 0 <= start < end"));
    // state transitions cite digests and receipts; the enum alone is a claim
    const ev = isObj(x.evidence) ? x.evidence : null, dg = ev ? str(ev.artifact_digest) : "";
    if (x.state === "implemented" && !(ev && HEX64.test(dg) && arr(ev.produced_artifact_refs).length)) errors.push(err("state_unevidenced", `${p}.state`, `event ${e.id} says implemented without evidence {artifact_digest, produced_artifact_refs}; the state is a claim until receipts exist`));
    if (x.state === "reviewed" && !(ev && HEX64.test(dg) && filled(ev.review_ref) && arr(ev.observed_refs).length)) errors.push(err("state_unevidenced", `${p}.state`, `event ${e.id} says reviewed without {artifact_digest, review_ref, observed_refs}; an agent-written reviewed enum is a claim, not verified completion`));
    if ((x.state === "implemented" || x.state === "reviewed") && digests && HEX64.test(dg) && !digests.has(dg)) errors.push(err(COMMITMENT_ERROR_CODES.stale, `${p}.evidence.artifact_digest`, `event ${e.id}: evidence cites an artifact that is not current`));
    if (filled(x.continuity_owner) && x.requirement !== "supporting") { const prev = owners.get(x.continuity_owner); owners.set(x.continuity_owner, [...(prev || []), e.id]); }
    for (const g of eventBindingGaps(e, phase)) {
      (rank >= PHASE_RANK.build || g.field === "narrative_purpose" ? errors : warnings).push(err(g.field === "continuity_owner" ? COMMITMENT_ERROR_CODES.owner : COMMITMENT_ERROR_CODES.unbound, `${p}.${g.field}`, `event ${e.id}: ${g.message} (${g.phase} phase)`));
      if (rank >= PHASE_RANK.build) missing.push(`${p}.${g.field}`);
    }
  });
  const bx = creativeExt(doc), basis = isObj(bx) && isObj(bx.commitment_basis) ? bx.commitment_basis : null;
  const rec = reconcileCommitments({ treatment, events, absences: absences || (basis ? [basis] : []), pins, phase });
  for (const pr of rec.problems) {
    const hard = rank >= PHASE_RANK[pr.responsible_phase] && rank >= PHASE_RANK.story && rec.details[pr.commitment_id].requirement === "required";
    (hard ? errors : warnings).push(err(pr.code, `commitments.${pr.commitment_id}`, pr.message));
    if (hard) missing.push(`commitments.${pr.commitment_id}`);
  }
  // the empty-event distinction: valid when deliberate, never when a promise is merely deferred
  if (!events.length && rank >= PHASE_RANK.look && !rec.problems.some((x) => x.code === COMMITMENT_ERROR_CODES.unbound)) {
    if (basis) { const r = resolveIntentionalAbsence(basis, pins); if (!r.resolved && rank >= PHASE_RANK.build) for (const pr of r.problems) errors.push(err(pr.code, "extensions.creative_thinking.commitment_basis", pr.message)); else if (!r.resolved) for (const pr of r.problems) warnings.push(err(pr.code, "extensions.creative_thinking.commitment_basis", pr.message)); }
    else if (!filled(doc.signature_events_reason) && rank >= PHASE_RANK.build) errors.push(err(COMMITMENT_ERROR_CODES.absence, "extensions.creative_thinking.commitment_basis", "no signature events and no commitment_basis: say what must survive instead (an editorial film is valid; an unexplained empty list is not)"));
    else if (!basis) warnings.push(err(COMMITMENT_ERROR_CODES.absence, "extensions.creative_thinking.commitment_basis", "no signature events: declare commitment_basis (alternative commitments, approval source, review method)"));
  }
  return { errors, warnings, missing, reconciliation: rec };
}
