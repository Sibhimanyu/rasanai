// Creative brief contract (schema_version 1): one small, specific idea that survives every handoff.
// Pure and import-safe: no file, network or process access, no writes, no CLI. The Director owns the brief; this
// grants no approval. Structure (validate), currentness (pins), evidence and review are kept apart on purpose:
// nothing here judges taste, and a well-formed brief never turns into "ready" without current review evidence.
import { canonicalDigest } from "./contracts.mjs";

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
export function creativeReadiness({ brief, stage, review, expectedPins, expectedArtifactDigests, waiver = null } = {}) {
  const reasons = [];
  const structure = validateCreativeBrief(brief, { stage, expectedPins });
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
