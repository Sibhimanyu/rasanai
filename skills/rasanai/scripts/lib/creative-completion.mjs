// One pure completion assessment for every path that presents a render as Final (V3 W09; references/temporal-review.md).
//   assessCompletion({ approvals, contract, output, review, limits }) -> { state, reasons, allowedLabels, nextDecisions, evidence, commitments, limitations }
// It REUSES creativeReadiness (creative-contract.mjs) for structure, pins, review currentness, independence and the five existing states
// (ready | revise | blocked | needs_user | not_reviewed), and only ADDS the temporal / semantic / human layers on top. Nothing here reads a
// file, renders, runs a model or writes a ledger: callers pass the evidence they already hold (see "Callers" in the reference doc).
//
// Evidence classes are assessed separately and reported in `evidence`:
//   structural  schema, IDs, pins, approvals current (creativeReadiness)
//   technical   an actual output with identity (digest), duration and frame rate; hard factual / rights / permission failures
//   temporal    per-commitment observed intervals tied to THIS output digest, timebase and a temporal-capable method
//   semantic    an independent retell written before the intent was read, then compared with the commitments
//   human       the user's own current Final decision (or aesthetic waiver) with its stage and artifact digest
// Metadata mappings, declared scene types, file extensions and movement metrics are structural/technical hints and never temporal or semantic proof.
// Missing temporal evidence blocks a reviewed-ready claim, never disclosure: `draft` stays an allowed label for any playable output.
// Legacy runs (creative_policy_revision absent or 1, no required commitments): the result is exactly creativeReadiness's, plus labels.
import { creativeReadiness, creativeExt, reconcileCommitments, treatmentCommitments } from "./creative-contract.mjs";
import { checkSequence } from "./sequence-contract.mjs";

const arr = (x) => (Array.isArray(x) ? x : []);
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const str = (x, d = "") => (typeof x === "string" ? x.trim() : x == null ? d : String(x).trim());
const filled = (x) => str(x) !== "";
const HEX64 = /^[0-9a-f]{64}$/i;
const hex = (v) => { const s = isObj(v) ? str(v.sha256 || v.artifact_digest || v.digest) : str(v); return s.replace(/^sha256:/, ""); };
const rs = (code, message, extra = {}) => ({ code, message, ...extra });

export const COMMITMENT_RESULTS = Object.freeze(["fulfilled", "partially_fulfilled", "missing", "materially_changed", "stale", "not_assessable"]);
// Observation methods. Only the first group can establish pacing, acting, cause-before-consequence or sync.
export const TEMPORAL_METHODS = Object.freeze(["temporal_playback", "dense_sequence", "frame_strip"]);
export const NON_TEMPORAL_METHODS = Object.freeze(["still", "contact_sheet", "sampled_stills", "metadata", "metrics", "declared"]);
export const FORMAL_FIELDS = Object.freeze(["hierarchy", "invariant", "transformation", "contrast", "resolution"]);
export const COMPLETION_LABELS = Object.freeze(["draft", "reviewed_with_limits", "ready"]);
export const COMPLETION_CODES = Object.freeze({
  no_output: "completion_no_output", output_unplayable: "completion_output_unplayable", hard_failure: "completion_hard_failure",
  temporal_missing: "temporal_evidence_missing", temporal_stale: "temporal_evidence_stale", temporal_method: "temporal_method_insufficient",
  timebase: "temporal_timebase_mismatch", interval: "temporal_interval_invalid", commitment_open: "commitment_not_fulfilled",
  retell_missing: "semantic_retell_missing", retell_order: "semantic_retell_not_blind", no_vision: "reviewer_cannot_see",
  formal_thin: "formal_read_incomplete", human_missing: "human_decision_missing", human_stale: "human_decision_stale", concept: "concept_wrong",
  sequence_invalid: "sequence_record_invalid", sequence_stale: "sequence_record_stale", playback_review: "playback_review_required",
});

// ---- required commitments (what the Final must account for) ----------------------------------------------------------------------------
// Required = reconciled treatment commitments that are bound, plus brief signature_events that are not "supporting". Intentional absences owe nothing here
// (their alternative commitments are listed by id when the review addresses them). Revision 1 briefs with no extension data owe no temporal evidence.
export function requiredCommitments({ brief = null, treatment = null, absences = null, pins = null } = {}) {
  const b = isObj(brief) ? brief : {}, events = arr(b.signature_events).filter(isObj);
  const revision = Number(b.creative_policy_revision) || 0;
  const out = new Map();
  const add = (id, o) => { if (filled(id) && !out.has(String(id))) out.set(String(id), { id: String(id), ...o }); };
  if (revision >= 2 || treatment) {
    const x = creativeExt(b);
    const rec = reconcileCommitments({ treatment, events, absences: absences || (x && x.commitment_basis ? [x.commitment_basis] : []), pins });
    const meta = new Map(treatmentCommitments(treatment).map((c) => [c.id, c]));
    for (const id of [...rec.bound, ...rec.unresolved]) {
      const c = meta.get(id); if (!c || c.requirement !== "required") continue;
      add(id, { source: "treatment", event_ids: arr(rec.details[id] && rec.details[id].event_ids), kind: c.kind, formal: c.kind === "formal" || c.kind === "passage", label: c.label });
    }
  }
  if (revision >= 2) for (const e of events) {
    const x = creativeExt(e);
    if (x && x.requirement === "supporting") continue;
    add(e.id, { source: "event", event_ids: [e.id], kind: str(x && x.scope) || "event", formal: x && (x.scope === "formal" || x.kind === "formal"), label: str(e.change || e.label) });
  }
  return [...out.values()];
}

// ---- observations -> per-commitment results --------------------------------------------------------------------------------------------
// results: review.commitment_results = [{commitment_id, result, artifact_digest, interval:{start_s,end_s}, method, observed, formal?, involves_text?, text_role?, limitations?}]
// Returns {results:[{commitment_id,result,assessed,problems}], problems}. `assessed` is true only for a current, temporal-method, in-range observation.
export function checkCommitmentResults(review, { output = {}, required = [] } = {}) {
  const rows = arr(review && review.commitment_results).filter(isObj);
  const od = hex(output.digest), dur = Number(output.duration_s), fps = Number(output.fps);
  const reviewFps = Number(review && review.temporal && review.temporal.fps);
  const problems = [], results = [];
  const ids = new Set(required.map((r) => r.id));
  for (const r of required) {
    const rows1 = rows.filter((x) => str(x.commitment_id) === r.id);
    if (!rows1.length) { results.push({ commitment_id: r.id, result: "not_assessable", assessed: false, problems: [rs(COMPLETION_CODES.temporal_missing, `no observed interval for required commitment ${r.id}`, { commitment_id: r.id })] }); continue; }
    const row = rows1[rows1.length - 1], ps = [];
    const result = COMMITMENT_RESULTS.includes(row.result) ? row.result : "not_assessable";
    if (!COMMITMENT_RESULTS.includes(row.result)) ps.push(rs(COMPLETION_CODES.temporal_missing, `${r.id}: result must be one of ${COMMITMENT_RESULTS.join(", ")}`, { commitment_id: r.id }));
    if (!TEMPORAL_METHODS.includes(str(row.method))) ps.push(rs(COMPLETION_CODES.temporal_method, `${r.id}: method "${str(row.method) || "none"}" cannot establish timing, acting or cause; use ${TEMPORAL_METHODS.join(" | ")} over the defining interval`, { commitment_id: r.id }));
    if (!od || hex(row.artifact_digest) !== od) ps.push(rs(COMPLETION_CODES.temporal_stale, `${r.id}: observation is not tied to the current output digest`, { commitment_id: r.id }));
    const iv = isObj(row.interval) ? row.interval : {}, s = Number(iv.start_s), e = Number(iv.end_s);
    if (!(Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e > s) || (Number.isFinite(dur) && dur > 0 && e > dur + 0.05)) ps.push(rs(COMPLETION_CODES.interval, `${r.id}: interval needs 0 <= start_s < end_s within the output duration (score time)`, { commitment_id: r.id }));
    if (Number.isFinite(fps) && fps > 0 && Number.isFinite(reviewFps) && reviewFps > 0 && Math.abs(fps - reviewFps) > 1e-6) ps.push(rs(COMPLETION_CODES.timebase, `${r.id}: review frame rate ${reviewFps} differs from output ${fps}`, { commitment_id: r.id }));
    if (!filled(row.observed) || str(row.observed).length < 20) ps.push(rs(COMPLETION_CODES.temporal_missing, `${r.id}: say what was observed in the interval (20+ characters)`, { commitment_id: r.id }));
    if (r.formal || isObj(row.formal)) {
      const f = isObj(row.formal) ? row.formal : {}, n = FORMAL_FIELDS.filter((k) => filled(f[k])).length;
      if (n < 3) ps.push(rs(COMPLETION_CODES.formal_thin, `${r.id}: a formal passage is judged on hierarchy, invariant, transformation, contrast and resolution (3+ stated), not on a literal narrative retell`, { commitment_id: r.id }));
    }
    results.push({ commitment_id: r.id, result, assessed: ps.length === 0, interval: row.interval || null, method: str(row.method) || null, text_role: row.involves_text ? (str(row.text_role) || "unstated") : null, problems: ps });
  }
  for (const row of rows) if (!ids.has(str(row.commitment_id))) results.push({ commitment_id: str(row.commitment_id), result: COMMITMENT_RESULTS.includes(row.result) ? row.result : "not_assessable", assessed: false, extra: true, problems: [] });
  for (const x of results) problems.push(...x.problems);
  return { results, problems };
}

// ---- connected sequence (Addendum 1) ------------------------------------------------------------------------------------------------------
// contract.sequence = { motifs, handoffs, optics, product, attention, events?, score?, capabilities?, current? } (the records sequence-contract.mjs defines).
// Static record checks (checkSequence) can only LOWER the state; they never stand in for watching connected motion. Every handoff, optic, product and attention
// record owes review.sequence_results[{record_id, method, artifact_digest, interval:{start_s,end_s}, observed}] from a temporal method on THIS output, else the
// record is a playback_review_required reason and `ready` is withheld (a draft stays disclosable). Owed only when the run is revision >= 2 and carries records.
export function checkSequenceResults(review, { output = {}, owed = [] } = {}) {
  const rows = arr(review && review.sequence_results).filter(isObj), od = hex(output.digest), dur = Number(output.duration_s), results = [];
  for (const o of owed) {
    const row = rows.filter((x) => str(x.record_id) === o.record_id).pop(), ps = [];
    if (!row) ps.push(rs(COMPLETION_CODES.playback_review, `${o.record_id} (${o.record_kind}): no playback observation; ${o.reason}`, { record_id: o.record_id }));
    else {
      if (!TEMPORAL_METHODS.includes(str(row.method))) ps.push(rs(COMPLETION_CODES.temporal_method, `${o.record_id}: method "${str(row.method) || "none"}" cannot establish connected motion; use ${TEMPORAL_METHODS.join(" | ")}`, { record_id: o.record_id }));
      if (!od || hex(row.artifact_digest) !== od) ps.push(rs(COMPLETION_CODES.temporal_stale, `${o.record_id}: observation is not tied to the current output digest`, { record_id: o.record_id }));
      const iv = isObj(row.interval) ? row.interval : {}, a = Number(iv.start_s), b = Number(iv.end_s);
      if (!(Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b > a) || (Number.isFinite(dur) && dur > 0 && b > dur + 0.05)) ps.push(rs(COMPLETION_CODES.interval, `${o.record_id}: interval needs 0 <= start_s < end_s within the output (score time)`, { record_id: o.record_id }));
      if (str(row.observed).length < 20) ps.push(rs(COMPLETION_CODES.temporal_missing, `${o.record_id}: say what was observed (20+ characters)`, { record_id: o.record_id }));
    }
    results.push({ record_id: o.record_id, record_kind: o.record_kind, assessed: ps.length === 0, problems: ps });
  }
  return { results, problems: results.flatMap((r) => r.problems) };
}

// The semantic layer: the retell comes first, from observation, then is compared. Observed tool reads show access, not comprehension.
function semanticClass(review, { required }) {
  const reasons = [];
  if (!isObj(review)) return { state: "missing", reasons };
  const rt = isObj(review.retell) ? review.retell : isObj(review.semantic) ? review.semantic : null;
  const vision = isObj(review.reviewer) ? review.reviewer.vision : undefined;
  if (vision === false) { reasons.push(rs(COMPLETION_CODES.no_vision, "the reviewer cannot see images or playback: route this review to a capable, authorized reviewer or the user; no silent model or account escalation")); return { state: "not_assessable", reasons }; }
  if (!required) return { state: rt ? "present" : "not_applicable", reasons };
  if (!rt || str(rt.text || rt.retell).length < 20) { reasons.push(rs(COMPLETION_CODES.retell_missing, "no observation-first retell: say what happened and what a first-time viewer can infer, before comparing with the approved intent")); return { state: "missing", reasons }; }
  if (rt.before_intent !== true && rt.written_before_intent !== true) reasons.push(rs(COMPLETION_CODES.retell_order, "the retell is not recorded as written before the approved intent was read: it compares, it does not retell"));
  return { state: reasons.length ? "weak" : "present", reasons };
}

// human evidence: the user's own Final decision for exactly this output, or an aesthetic waiver; never an agent note.
function humanClass(approvals, output) {
  const a = isObj(approvals) ? approvals : {}, d = isObj(a.final) ? a.final : isObj(a.human) ? a.human : null, od = hex(output && output.digest);
  if (!d || !filled(d.source_action_id)) return { state: "missing", decision: null };
  if (od && hex(d.artifact_digest) !== od) return { state: "stale", decision: str(d.decision) || null };
  return { state: "current", decision: str(d.decision) || null, source_action_id: d.source_action_id };
}

const worst = (a, b) => { const rank = { blocked: 5, needs_user: 4, revise: 3, not_reviewed: 2, ready: 0 }; return (rank[b] ?? 0) > (rank[a] ?? 0) ? b : a; };

// approvals: { pins: {brief,story,look,storyboard: digest|{artifact_digest}}, final?: {decision, source_action_id, artifact_digest}, waiver?: {kind:'aesthetic', source_action_id, artifact_digest} }
// contract : { brief (creative/brief.json), treatment?, absences?, stage? ('final' default) }
// output   : { digest (sha256 of the file being presented), exists?, playable?, duration_s?, fps?, kind?, failures?: [{category: factual|permission|mechanical|legal|brand-safety, message}], metrics? (ignored as proof) }
// review   : the creative/reviews/final-rN.json envelope, additively carrying commitment_results[], retell {text, before_intent, match}, temporal {fps}, repair_scope
// limits   : { round?, round_limit? } (defaults to the review's round and the brief's effort.round_limit)
export function assessCompletion({ approvals = {}, contract = {}, output = {}, review = null, limits = {} } = {}) {
  const stage = str(contract.stage) || "final";
  const brief = contract.brief, out = isObj(output) ? output : {}, reasons = [], limitations = [];
  const pins = isObj(approvals && approvals.pins) ? approvals.pins : {};
  const od = hex(out.digest);
  const evidence = { structural: { state: "unknown" }, technical: { state: "unknown" }, temporal: { state: "not_applicable" }, semantic: { state: "not_applicable" }, human: humanClass(approvals, out) };
  const playable = out.exists !== false && out.playable !== false && !!od && HEX64.test(od);
  const labels = (state) => {
    const l = [];
    if (playable) l.push("draft"); // an imperfect or unreviewed draft is always disclosable, with its limitation
    if (playable && isObj(review) && state !== "not_reviewed" && state !== "blocked") l.push("reviewed_with_limits");
    if (playable && state === "ready") l.push("ready");
    return l;
  };
  const done = (state, extra = {}) => ({ state, reasons, allowedLabels: labels(state), nextDecisions: nextDecisions(state, extra), evidence, commitments: extra.commitments || [], limitations });
  const nextDecisions = (state, extra) => {
    const d = [];
    if (state === "blocked") d.push({ id: "fix_blockers", who: "director", what: "repair the structural, factual, rights or permission failures listed; these are never waived by a builder" });
    if (extra.conceptWrong) d.push({ id: "revise_stage", who: "user", stage: extra.stage || "story", what: "the concept itself is wrong: stop polishing and revise the appropriate existing stage with consent" });
    if (state === "revise") d.push({ id: "repair_local", who: "director", commitment_ids: extra.open || [], what: "localized repair within the approved intention and budget; keep the listed strengths" });
    if (state === "not_reviewed") d.push({ id: "run_review", who: "reviewer", what: "an independent reviewer observes the defining intervals of the current output and writes the review envelope", ...(extra.missingTemporal ? { missing: "temporal" } : {}) });
    if (state === "needs_user") d.push({ id: "final_decision", who: "user", what: "decide through the existing Final controls with the review's concrete description; aesthetic disagreement is not waived by the builder that caused it" });
    if (state !== "ready" && playable) d.push({ id: "accept_draft", who: "user", what: "the draft remains available, labelled as a draft with its remaining limits" });
    if (evidence.human.state !== "current" && state === "ready") d.push({ id: "final_decision", who: "user", what: "the Final stays the user's decision: approve or leave notes" });
    return d;
  };

  // technical: an actual output with identity. No output means nothing to label.
  if (!od || out.exists === false) { evidence.technical = { state: "missing" }; reasons.push(rs(COMPLETION_CODES.no_output, "no output file with a digest: nothing to present as a Final")); return done("not_reviewed"); }
  const unplayable = out.playable === false;
  const hard = arr(out.failures).filter(isObj).filter((f) => ["factual", "fact", "permission", "mechanical", "legal", "brand-safety", "rights"].includes(str(f.category).toLowerCase()));
  evidence.technical = { state: unplayable ? "fail" : hard.length ? "fail" : "ok", digest: od, duration_s: Number.isFinite(Number(out.duration_s)) ? Number(out.duration_s) : null, fps: Number.isFinite(Number(out.fps)) ? Number(out.fps) : null, note: out.metrics ? "movement and extension metrics are not intent evidence and were not used" : undefined };
  if (unplayable) reasons.push(rs(COMPLETION_CODES.output_unplayable, "the output cannot be played"));
  for (const f of hard) reasons.push(rs(COMPLETION_CODES.hard_failure, `${str(f.category)}: ${str(f.message, "see output failures")}`));
  if (unplayable || hard.length) return done("blocked");

  // structural + review currentness + judgments: the existing readiness
  const base = creativeReadiness({ brief, stage, review, expectedPins: Object.fromEntries(Object.entries(pins).map(([k, v]) => [k, isObj(v) ? str(v.artifact_digest || v.sha256 || v.digest) : v])), expectedArtifactDigests: od ? [od] : [], waiver: approvals && approvals.waiver || null, treatment: contract.treatment || null, absences: contract.absences || null });
  evidence.structural = { state: base.state === "blocked" ? "fail" : "ok" };
  reasons.push(...base.reasons);
  let state = base.state;
  if (state === "blocked") return done("blocked");

  // temporal / semantic: owed when the run carries required commitments (revision 2 or a selected treatment); legacy runs owe none
  const required = requiredCommitments({ brief, treatment: contract.treatment || null, absences: contract.absences || null, pins });
  let commitments = [], open = [], conceptWrong = false;
  if (required.length) {
    const chk = isObj(review) ? checkCommitmentResults(review, { output: out, required }) : { results: required.map((r) => ({ commitment_id: r.id, result: "not_assessable", assessed: false, problems: [] })), problems: [] };
    commitments = chk.results;
    const unassessed = commitments.filter((c) => !c.extra && !c.assessed);
    const stale = chk.problems.some((p) => p.code === COMPLETION_CODES.temporal_stale || p.code === COMPLETION_CODES.timebase);
    if (!isObj(review)) { evidence.temporal = { state: "missing", required: required.map((r) => r.id) }; }
    else if (unassessed.length) { evidence.temporal = { state: stale ? "stale" : "missing", unassessed: unassessed.map((c) => c.commitment_id) }; reasons.push(...chk.problems); }
    else evidence.temporal = { state: "ok", assessed: commitments.filter((c) => !c.extra).length };
    const sem = semanticClass(review, { required: true });
    evidence.semantic = { state: sem.state };
    reasons.push(...sem.reasons);
    open = commitments.filter((c) => c.assessed && ["partially_fulfilled", "missing", "materially_changed"].includes(c.result)).map((c) => c.commitment_id);
    const stales = commitments.filter((c) => c.assessed && c.result === "stale");
    const notAss = commitments.filter((c) => c.assessed && c.result === "not_assessable");
    for (const id of open) { const c = commitments.find((x) => x.commitment_id === id); reasons.push(rs(COMPLETION_CODES.commitment_open, `${id}: ${c.result}`, { commitment_id: id })); }
    conceptWrong = isObj(review) && str(review.repair_scope) === "concept";
    if (conceptWrong) reasons.push(rs(COMPLETION_CODES.concept, "the review judges the concept, not the execution, to be wrong"));
    if (evidence.semantic.state === "not_assessable") state = worst(state, "needs_user");
    if (open.length || conceptWrong) state = worst(state, "revise");
    if (stales.length || unassessed.length || ["missing", "weak"].includes(evidence.semantic.state)) state = worst(state, "not_reviewed");
    if (notAss.length) state = worst(state, "needs_user");
    // a ready base cannot survive an unobserved or open required commitment
    if (state !== "ready" && base.state === "ready") reasons.push(rs("ready_withheld", "a ready label needs current temporal evidence and a fulfilled result for every required commitment"));
  } else if (isObj(review) && Array.isArray(review.commitment_results) && review.commitment_results.length) {
    evidence.temporal = { state: "not_required", note: "no required commitments for this run; observations are kept as information" };
  }
  // connected sequence records (additive; revision >= 2 with supplied records only, so legacy results are untouched)
  const seq = isObj(contract.sequence) ? contract.sequence : null;
  if (seq && Number(brief && brief.creative_policy_revision) >= 2) {
    const chk = checkSequence({ ...seq, events: seq.events || arr(brief && brief.signature_events) });
    const total = chk.playback_review_required.length;
    if (total || chk.errors.length) {
      const stale = chk.errors.filter((e) => e.code === "stale_input" || e.code === "sequence_unresolved_ref");
      evidence.sequence = { state: "pending", records: total, static_errors: chk.errors.length, digest: chk.digest };
      for (const e of chk.errors) reasons.push(rs(stale.includes(e) ? COMPLETION_CODES.sequence_stale : COMPLETION_CODES.sequence_invalid, `${e.path}: ${e.message}`, { record_code: e.code }));
      if (stale.length) state = worst(state, "not_reviewed");
      if (chk.errors.length > stale.length) state = worst(state, "revise");
      const pr = checkSequenceResults(review, { output: out, owed: chk.playback_review_required });
      const open = pr.results.filter((r) => !r.assessed);
      reasons.push(...pr.problems);
      if (open.length) { state = worst(state, "not_reviewed"); evidence.sequence.unreviewed = open.map((r) => r.record_id); }
      else if (!chk.errors.length) evidence.sequence.state = "ok";
      if (state !== "ready" && base.state === "ready") reasons.push(rs("ready_withheld", "a ready label needs a current playback observation for every connected-motion record and no sequence record faults"));
    }
  }
  limitations.push(...arr(review && review.limitations).map(str).filter(Boolean));

  // bounded repair: review-round limits stay respected; at the limit a draft and the remaining issue go to the user's Final
  const lim = isObj(limits) ? limits : {}, limit = Number.isFinite(Number(lim.round_limit)) ? Number(lim.round_limit) : isObj(brief && brief.effort) ? Number(brief.effort.round_limit) : 0;
  const round = Number.isFinite(Number(lim.round)) ? Number(lim.round) : Number.isInteger(review && review.round) ? review.round : 1;
  if (state === "revise" && limit > 0 && round >= limit) { state = "needs_user"; reasons.push(rs("budget_exhausted", `round ${round} of ${limit}: report the draft and the remaining issue through the existing Final controls`)); }
  if (conceptWrong && state === "revise") state = "needs_user";
  if (evidence.human.state === "stale") reasons.push(rs(COMPLETION_CODES.human_stale, "the user's last Final decision covers an earlier output"));
  return done(state, { open, conceptWrong, missingTemporal: ["missing", "stale"].includes(evidence.temporal.state) || (evidence.sequence && evidence.sequence.unreviewed && evidence.sequence.unreviewed.length > 0), stage: "story", commitments });
}

// What a Final writer may SAY about its output, from the assessment alone (never a stronger word than the assessment allows).
export function completionStatusLine(a) {
  if (!a || !Array.isArray(a.allowedLabels) || !a.allowedLabels.length) return "no playable output to present";
  if (a.state === "ready") return "ready: a current independent review observed the intended events in this output";
  const why = arr(a.reasons).slice(0, 2).map((r) => r.message).join("; ");
  const base = { blocked: "draft, blocked", revise: "draft, revision requested", needs_user: "draft, decision needed from you", not_reviewed: "draft, not reviewed against the intended events" }[a.state] || "draft";
  return why ? `${base}: ${why}` : base;
}
