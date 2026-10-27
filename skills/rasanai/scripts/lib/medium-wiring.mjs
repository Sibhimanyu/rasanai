// Style Intelligence Part 2: the run-side glue between the pure medium modules (medium-index / -fit / -contract / -rules / -examples / -learning) and a run folder.
// Lead-owned, a leaf helper like creative-run.mjs: it imports other leaf libs only (never crew.mjs, console.mjs or another CLI), does nothing at import, and every
// writer here is called by a command. Nothing here approves anything, schedules anything or owns timing: the existing Look approval decides, motion/score.json times.
// Everything is gated on the creative policy (crew/plan.json creative_policy_revision 1) or on a design/<label>/medium.json that says medium-contract@1; a legacy run
// reads none of it. A missing or invalid piece is an explanation (state "needs_you"), never a pass and never a silent fallback to animated type.
//
//   loadMedium()                          -> { index, registry, caps }   the medium-index@1 built from the real style records, metadata, recipe index and capability registry
//   flatCapabilities(registry)            -> [{id, implemented, available, enabled, permitted, verified, reason}]  the flat shape medium-fit / medium-contract read
//   buildAssignment(run, o)               -> the transient assignment of contract 01 sec 3 from the run's own brief / story / decisions / assets (no questionnaire)
//   prepareMediumSelection(run, o)        -> writes <run>/creative/medium-selection.json (recommendation only), pins registry_digest = medium-index source_digest
//   labelAssignments(run)                 -> { Sure: {candidate, profile...}, ... } which Look label develops which selected candidate (only when a selection exists)
//   checkMediumLook(run, label)           -> { applicable, state: ok|needs_you|not_applicable, problems, warnings, limitations } for crew.mjs check
//   readMediumContract(run) / mediumContractFor(run, label)                         design/<label>/medium.json, else look/medium.json
//   eventBindingsFor(run, scene) / canonsFor(run) / treatmentLines(contract)      scene-runtime inputs: events from motion/events.json, canons from cast/<id>/identity.json
//   scopedSkips(contract, ruleIds, ctx)   -> { skip:Set, exceptions:[...] }        the consumers' view of medium-rules resolveMediumRules (every layer must qualify)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SKILL_DIR } from "./common.mjs";
import { canonicalDigest } from "./contracts.mjs";
import { buildMediumIndex, readStyleRecords, readMediumMetadata, resolveMediumProfile, mediumSummary } from "./medium-index.mjs";
import { buildIndex as buildRecipeIndex } from "./recipe-index.mjs";
import { buildRegistry } from "./capabilities.mjs";
import { assessMediumEligibility, assessMediumFit, selectMediumShortlist, buildMediumSelection, validateFitDecision, proposeMediumAdaptations, DEFAULT_REQUESTED_COUNT, resolveMediumResolution, lookAlternativePolicy } from "./medium-fit.mjs";
import { validateMediumContract, mediumContractDigest, mediumContractCurrent, MEDIUM_FORMAT, toConstraintRecords, splitConstraintRecords, validateMediumResolution, lookIdentityDigest, lookIdentityCurrent } from "./medium-contract.mjs";
import { resolveMediumRules, resolveMediumPerformance, scopeDiagnostics, MEDIUM_BEHAVIORS } from "./medium-rules.mjs";
import { mediumExecutionEvidence } from "./capabilities.mjs";
import { readPerf, summarizeMediumEvidence, evidenceFlags } from "./perf-evidence.mjs";
import { storyDigest } from "./storyboard.mjs";
import { approvalPins } from "./creative-run.mjs";

const arr = (x) => (Array.isArray(x) ? x : []);
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const T = (x) => (x == null ? "" : String(x).trim());
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const has = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const P = (run, ...p) => path.join(path.resolve(String(run)), ...p);
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(o, null, 2) + "\n"); fs.renameSync(tmp, f); };
export const LABELS = ["Sure", "Bold", "Wild"];

// ---------------------------------------------------------------------------------------------------- index and capabilities
// The library CLI's request: buildMediumIndex({styleRecords: readStyleRecords(), metadata: readMediumMetadata(), recipeIndex: buildIndex(), capabilities: buildRegistry()}).
export function loadMedium({ skillRoot = SKILL_DIR } = {}) {
  const registry = buildRegistry();
  const metadata = readMediumMetadata(skillRoot);
  const index = buildMediumIndex({ skillRoot, styleRecords: readStyleRecords(skillRoot), metadata, recipeIndex: buildRecipeIndex({ skillRoot }), capabilities: registry });
  return { index, registry, caps: flatCapabilities(registry), metadata_errors: metadata.errors };
}
// capabilities.mjs rows keep {implemented:{value,reason},...}; medium-fit and medium-contract read flat booleans. null = not reported (never read as false).
export function flatCapabilities(registry) {
  const rows = Array.isArray(registry) ? registry : arr(registry && registry.details);
  return rows.filter((c) => c && c.id).map((c) => {
    const v = (k) => (isObj(c[k]) && "value" in c[k] ? !!c[k].value : typeof c[k] === "boolean" ? c[k] : undefined);
    const why = ["implemented", "available", "enabled", "permitted"].map((k) => (isObj(c[k]) && c[k].value === false ? c[k].reason : "")).filter(Boolean)[0] || "";
    return { id: c.id, implemented: v("implemented"), available: v("available"), enabled: v("enabled"), permitted: v("permitted"), verified: v("verified"), reason: why, ...(c.state ? { state: c.state } : {}), ...(c.api_note ? { api_note: c.api_note } : {}) };
  });
}
// the same rows keyed by capability id AND execution id (medium-contract capOf reads either)
export function capabilityMap(caps) {
  const out = {};
  for (const c of arr(caps)) { out[c.id] = c; if (c.id.startsWith("style.")) out[c.id.slice(6)] = c; }
  return out;
}
// the profile snapshot a contract is pinned to: content, not file names
export const profileDigest = (rec) => canonicalDigest({ id: rec.id, family_id: rec.family_id, execution_id: rec.execution_id, style_refs: rec.style_refs, native_actions: rec.native_actions, proof_policy: rec.proof_policy, runtime_refs: rec.runtime_refs, asset_needs: rec.asset_needs, capability_ref: rec.capability_ref, evidence: rec.evidence });

// ---------------------------------------------------------------------------------------------------- the assignment (transient)
const briefFields = (run) => { const b = rj(P(run, "brief.json")) || {}; return b.fields && isObj(b.fields) ? { ...b, ...b.fields } : b; };
const storyDoc = (run) => rj(P(run, "story", "chosen-treatment.json")) || rj(P(run, "story", "intent.json")) || rj(P(run, "story", "chosen.json")) || null;
const LOCALE_SCRIPT = { ta: "tamil", hi: "devanagari", mr: "devanagari", ar: "arabic", he: "hebrew", zh: "cjk", ja: "cjk", ko: "cjk", fa: "arabic", ur: "arabic" };
const scriptFromLocale = (loc) => LOCALE_SCRIPT[T(loc).toLowerCase().split(/[-_]/)[0]] || null;
export function buildAssignment(run, { caps = [], pins = {} } = {}) {
  const f = briefFields(run), story = storyDoc(run) || {}, dec = rj(P(run, "decisions.json")) || {}, brief2 = rj(P(run, "brief.json")) || {};
  const briefing = rj(P(run, "research", "briefing.json")) || {};
  const proofs = rj(P(run, "story", "proof-contracts.json"));
  const contracts = Array.isArray(proofs) ? proofs : arr(proofs && proofs.contracts);
  const proof_needs = contracts.filter(isObj).map((c, i) => ({ id: T(c.id) || `proof-${i + 1}`, kind: T(c.transformation_kind) === "exact-ui" ? "exact-ui" : "protected-text", claim_refs: arr(c.source_refs).map(String), required_text_refs: [T(c.id) || `proof-${i + 1}`], precision: "exact" }));
  // real evidence the run holds: screens (the product UI), the user's brand kit; a recurring character's canon. Availability is what is on disk, rights are not guessed.
  const assets = [];
  if (has(P(run, "research", "screens.json")) || has(P(run, "research", "screens.md"))) assets.push({ id: "proof-ui", kind: "product-ui", available: true, rights: "unknown" });
  const castDir = P(run, "cast");
  if (has(castDir)) for (const d of fs.readdirSync(castDir)) if (has(path.join(castDir, d, "identity.json"))) assets.push({ id: "character-canon", kind: "character-canon", available: true, rights: "original" });
  const brandLocked = !!(dec.brand && dec.use_brand !== false);
  const brandC = isObj(dec.brand_constraints) ? dec.brand_constraints : {};
  const ud = isObj(dec.medium_direction) ? dec.medium_direction : {}; // written only by an explicit user request; no current writer produces it (KNOWN_LIMITS)
  const destination = { aspect: T(brief2.aspect || f.aspect || dec.aspect) || null, viewing_size: T(brief2.destination || f.destination || dec.destination) || null, sound: T(f.sound) || null, script: T(f.script || f.locale_script || brief2.script || brief2.locale_script) || scriptFromLocale(T(brief2.locale || brief2.language || f.locale || f.language)) || null, locale: T(brief2.locale || brief2.language || f.locale) || null };
  const base = {
    brief_pin: pins.brief ? { digest: pins.brief.artifact_digest, revision: pins.brief.revision ?? 1 } : null,
    story_pin: pins.story ? { digest: pins.story.artifact_digest, revision: pins.story.revision ?? 1 } : null,
    communication_kind: T(story.communication_kind || f.communication_kind || briefing.communication_kind) || null,
    audience_context: T(f.audience || (briefing.brief && briefing.brief.audience)) || null,
    takeaway: T(story.takeaway || f.takeaway) || null,
    tone_intent: arr(f.tone ? [].concat(f.tone) : []).map(String),
    destination, proof_needs,
    brand: {
      hard_constraints: [...(brandLocked ? [{ id: "brand-lock", kind: "brand-identity", source: "decisions.brand", binding_kind: "hard", scope: "film", reason: "the brand's palette, type, logo and UI stay binding (this blocks no medium by itself)" }] : []), ...arr(brandC.hard_constraints)],
      motion_constraints: arr(brandC.motion_constraints), inferred_preferences: arr(brandC.inferred_preferences),
    },
    user_direction: { named_media: arr(ud.named_media), excluded_media: arr(ud.excluded_media), source_action_id: ud.source_action_id ?? null },
    assets, capabilities: caps, resolved_policy_ref: "crew/plan.json creative_policy_revision",
  };
  return { ...base, constraints_revision: canonicalDigest({ brand: base.brand, user_direction: base.user_direction, destination, proof_needs: proof_needs.map((n) => n.id) }) };
}

// ---------------------------------------------------------------------------------------------------- the selection
// judgments file (the Director's, creative/medium-judgments.json): { candidates?: [{id, treatment_id?, differences?, adaptation_of?}], judgments: {<candidate id>: {dimensions:{...}, useful_native_actions?}} }.
// No judgment -> every fit dimension is "unknown"; nothing is inferred here. strict_brand comes only from the user's explicit request (decisions.json strict_brand_film / film_style_strict).
export function prepareMediumSelection(run, { pins = {}, judgmentsFile = null, requestedCount = null, strictBrand = false, write = true, med = null, recent = [] } = {}) {
  const M = med || loadMedium();
  const { index, caps } = M;
  const assignment = buildAssignment(run, { caps, pins });
  const J = rj(judgmentsFile || P(run, "creative", "medium-judgments.json")) || {};
  const judgmentsSupplied = isObj(J.judgments) && Object.keys(J.judgments).length > 0; // v3: a missing file is a visible gap (needs-direction), never a quiet default
  const byJ = new Map(arr(J.candidates).filter(isObj).map((c) => [c.id, c]));
  const resources = { capabilities: caps, assets: assignment.assets, policy: {} };
  const candidates = [], assessments = {}, adaptations = [];
  const addCandidate = (rec, extra = {}) => {
    const id = extra.id || rec.id, o = byJ.get(id) || {};
    const c = { id, profile_id: rec.id, family_id: rec.family_id, execution_id: rec.execution_id, treatment_id: o.treatment_id ?? null, user_requested: undefined,
      differences: o.differences || { visual_material: arr(rec.visual_material).join(" / ") || null, narrative_action: arr(rec.native_actions).join(" / ") || null, composition: null, motion: null, sound: null }, ...(extra.adaptation_of ? { adaptation_of: extra.adaptation_of } : {}) };
    candidates.push(c);
    const eligibility = assessMediumEligibility(rec, assignment, resources);
    const fit = assessMediumFit(rec, assignment, (J.judgments || {})[id]);
    assessments[id] = { eligibility, fit };
    return { c, eligibility };
  };
  for (const rec of index.records) {
    const { eligibility } = addCandidate(rec);
    // a mitigation is its own candidate, re-assessed as itself (contract 01 sec 4 step C); never a silent mutation of the original
    if (eligibility.state === "conditional") {
      for (const a of proposeMediumAdaptations(rec, eligibility, undefined, { proofNeeds: assignment.proof_needs }).candidates) {
        adaptations.push(a);
        const adapted = { ...rec, state: rec.state, hard_exclusions: rec.hard_exclusions };
        const id = a.candidate_id;
        candidates.push({ id, profile_id: rec.id, family_id: rec.family_id, execution_id: rec.execution_id, treatment_id: null, adaptation_of: rec.id, differences: { visual_material: `${arr(rec.visual_material).join(" / ")} + sharp proof layer`, narrative_action: arr(rec.native_actions).join(" / "), composition: "hybrid layers", motion: null, sound: null } });
        // the adapted candidate keeps the exact proof on a full-resolution layer (policy value "proof-layer-resolved": no proof condition is raised); proof needs, assets, capability and exclusions are all re-assessed as its own candidate
        const re = assessMediumEligibility({ ...adapted, proof_policy: { ...(rec.proof_policy || {}), exact_ui: "proof-layer-resolved", protected_text: "proof-layer-resolved" } }, assignment, resources);
        assessments[id] = { eligibility: re, fit: assessMediumFit(rec, assignment, (J.judgments || {})[id]) };
      }
    }
  }
  const nd = assignment.user_direction.named_media;
  if (nd.length) for (const c of candidates) c.user_requested = [c.profile_id, c.family_id, c.execution_id].filter(Boolean).some((k) => nd.map(T).map((x) => x.toLowerCase()).includes(String(k).toLowerCase())) || undefined;
  const want = Number.isInteger(requestedCount) && requestedCount >= 1 ? requestedCount : DEFAULT_REQUESTED_COUNT;
  const shortlist = selectMediumShortlist({ candidates, assessments, requestedCount: want, policy: { strict_brand: !!strictBrand, requested_count: want }, recent });
  const doc = buildMediumSelection({ pins: { brief_pin: assignment.brief_pin, story_pin: assignment.story_pin, constraints_revision: assignment.constraints_revision }, registryDigest: index.source_digest, candidates, assessments, adaptations, shortlist,
    limitations: ["Fit judgments are the Director's (creative/medium-judgments.json); none were inferred here. A dimension with no judgment is unknown.", "Every medium is implemented_unvalidated: no render, frame check or review has run.", ...(index.excluded.length ? [`${index.excluded.length} metadata record(s) were left out of the index (see the index's excluded list).`] : [])] });
  const validation = validateFitDecision(doc, { assignment, profiles: index.records, expectedPins: { brief_pin: assignment.brief_pin, story_pin: assignment.story_pin, constraints_revision: assignment.constraints_revision, registry_digest: index.source_digest }, requestedCount: want });
  const file = P(run, "creative", "medium-selection.json");
  if (write && validation.ok) writeJson(file, doc);
  return { ok: validation.ok, file, selection: doc, validation, assignment_digest: canonicalDigest({ ...assignment, capabilities: undefined }), considered: candidates.length, judgments_supplied: judgmentsSupplied, needs_direction: !judgmentsSupplied };
}
export const readSelection = (run) => rj(P(run, "creative", "medium-selection.json"));
// the selected candidates take the Look labels in order; a label beyond the selection is a legacy (non-medium) look. Returns {} when no selection exists.
// why the stored selection no longer matches the run (story pin digest or constraints_revision changed), else null
export function selectionStale(run, sel = readSelection(run)) {
  if (!sel || !isObj(sel.pins)) return null;
  const dg = (x) => (isObj(x) ? x.digest : x), spins = dg(sel.pins.story_pin) || null;
  let cur = null; try { cur = (approvalPins(run) || {}).story || null; } catch { cur = null; }
  if (spins && cur && cur.artifact_digest && spins !== cur.artifact_digest) return "story pin changed";
  if (sel.pins.constraints_revision && sel.pins.constraints_revision !== buildAssignment(run, { caps: [], pins: {} }).constraints_revision) return "constraints_revision changed";
  return null;
}
export function labelAssignments(run, med = null) {
  const sel = readSelection(run);
  if (!sel || !Array.isArray(sel.selected)) return {};
  if (selectionStale(run, sel)) return {}; // a stale shortlist is never kept silently
  const idx = (med || loadMedium()).index;
  const out = {};
  sel.selected.forEach((cid, i) => {
    const label = LABELS[i]; if (!label) return;
    const base = String(cid).split("+")[0];
    const r = resolveMediumProfile(idx, base);
    const adaptation = arr(sel.adaptations).find((a) => a && a.candidate_id === cid) || null;
    out[label] = { candidate_id: cid, profile: r.ok ? mediumSummary(r.profile) : null, record: r.ok ? r.profile : null, adaptation, assessment: sel.assessments && sel.assessments[cid] || null };
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------- the contract on disk
export const readMediumContract = (run, label = null) => {
  const f = label ? [P(run, "design", label, "medium.json")] : [P(run, "look", "medium.json")];
  for (const x of f) { const j = rj(x); if (j) return j; }
  return null;
};
// the chosen look's contract: look/medium.json (copied by choose-system), else the chosen label's candidate file
export function mediumContractFor(run) {
  const chosen = readMediumContract(run);
  if (chosen) return chosen;
  const dec = rj(P(run, "decisions.json")) || {};
  const label = (dec.design_system && dec.design_system.label) || (dec.look && dec.look.system) || null;
  return label ? readMediumContract(run, label) : null;
}
export const isMediumContract = (c) => isObj(c) && c.format === MEDIUM_FORMAT;

// Missing or invalid contract on a medium Look -> needs_you with an explanation; dispatched only for medium Looks (a label with an assigned candidate or an existing medium.json).
export function checkMediumLook(run, label, { med = null, creative = true } = {}) {
  const problems = [], warnings = [];
  const file = P(run, "design", label, "medium.json");
  const doc = rj(file);
  const M = med || (creative ? loadMedium() : null);
  const assigned = creative && M ? labelAssignments(run, M)[label] : null;
  const blend = rj(P(run, "design", label, "blend.json")) || {};
  const applicable = !!(assigned || doc || Number(blend.medium_policy_revision) >= 1);
  if (creative && !assigned) { const st = selectionStale(run); if (st) warnings.push(`creative/medium-selection.json is stale (${st}): re-run medium-select before any label takes a medium candidate`); }
  if (!applicable) return { applicable: false, state: "not_applicable", problems, warnings, limitations: [] };
  const why = (m) => problems.push(`needs-you: ${m}`);
  if (!doc) { if (has(file)) why(`design/${label}/medium.json is not valid JSON: the contract cannot be read, so this Look is not accepted (the designer rewrites it; nothing falls back to a typographic Look)`); else why(`design/${label}/medium.json is missing: this Look develops the medium candidate ${assigned ? assigned.candidate_id : "(declared by blend.json medium_policy_revision)"}; without the contract the Look cannot be accepted (references/medium-direction.md)`); return { applicable: true, state: "needs_you", problems, warnings, limitations: [] }; }
  let limitations = [];
  if (M) {
    const caps = capabilityMap(M.caps);
    const asg = buildAssignment(run, { caps: M.caps, pins: {} });
    asg.story_pin = null; // the pin is compared below against the real story digest (an unconfirmed story is not a mismatch of this file)
    const v = validateMediumContract(doc, { assignment: asg, profiles: M.index, capabilities: caps });
    for (const e of v.errors) why(`medium.json ${e.path || ""}: ${e.message} [${e.code}]`);
    warnings.push(...v.warnings.map((w) => `medium.json ${w.path || ""}: ${w.message}`));
    limitations = v.limitations;
    const rec = resolveMediumProfile(M.index, doc.profile_id);
    if (rec.ok) {
      if (assigned && assigned.record && assigned.record.id !== rec.profile.id) why(`medium.json develops ${rec.profile.id} but this label was assigned ${assigned.record.id} by creative/medium-selection.json (a different medium is a new selection, not a quiet substitution)`);
      const cur = mediumContractCurrent(doc, { profile_digest: profileDigest(rec.profile) });
      if (!cur.current) why(`medium.json pins are stale or missing (${[...cur.stale, ...cur.missing].join(", ")}): re-cut the contract from the current profile (pins.profile_digest ${profileDigest(rec.profile)})`);
    }
    const sd = storyDigest(run);
    if (sd && T(doc.pins && doc.pins.story_digest) && doc.pins.story_digest !== sd.digest) why(`medium.json pins.story_digest does not match the current Story (${sd.via}): the contract was cut from a different story`);
    const cp = rj(P(run, "design", "comparison-plan.json"));
    const cdig = cp && cp.representative && cp.representative.content_digest;
    if (cdig) { const cur = mediumContractCurrent(doc, { comparison_content_digest: cdig }); if (!cur.current) why(`medium.json pins.comparison_content_digest does not match design/comparison-plan.json (${cdig}): every Look candidate is cut from the same beat and content`); }
  } else warnings.push("the medium index could not be loaded: only the file's own form was checked");
  // v3 (additive): an explicit resolution that is not "selected"/"custom-supported" is a visible needs-you, and a Look identity pin must still match the medium it was cut from
  let resolution = null;
  if (isObj(doc.resolution)) {
    resolution = doc.resolution;
    for (const e of validateMediumResolution(resolution).errors) why(`medium.json ${e.path}: ${e.message} [${e.code}]`);
    if (resolution.state === "needs-direction") why(`medium.json resolution is needs-direction: ${T(resolution.reason)}`);
    if (resolution.state === "capability-blocked") why(`medium.json resolution is capability-blocked: ${T(resolution.reason)} (offer a feasible treatment through the Look/revision path; the label is not kept on a textured card)`);
  }
  const pinned = doc.pins && doc.pins.look_identity_digest;
  if (pinned) {
    const now = lookIdentityFor(run, label, { med: M, contract: doc });
    if (now.digest && now.digest !== pinned) why(`medium.json pins.look_identity_digest is stale: the medium, resolution or binding constraints changed after the Look was cut (now ${now.digest}): re-cut the Look board`);
  }
  return { applicable: true, state: problems.length ? "needs_you" : "ok", problems, warnings, limitations, contract_digest: mediumContractDigest(doc), ...(resolution ? { resolution } : {}) };
}

// ---------------------------------------------------------------------------------------------------- v3: constraint split, resolution, Look identity, alternatives
// The run's brand/user constraints as {id,value,scope,authority,source_ref,required,why} records, split by authority.
// Consumer (proposed): crew.mjs Look path / design.mjs Look brief, to hand the designer required identity vs observed traits.
export function brandConstraintRecords(run, { extra = [] } = {}) {
  const records = toConstraintRecords(buildAssignment(run, { caps: [], pins: {} }).brand, extra);
  return { records, ...splitConstraintRecords(records) };
}
const mediumDirectionOf = (run) => { const d = rj(P(run, "decisions.json")) || {}; return isObj(d.medium_direction) ? d.medium_direction : {}; };
// Which of the four states this Look is in. label: the Look label (null = the chosen look). A custom direction comes from the contract (custom_direction) or an explicit
// decisions.medium_direction.custom_direction; supportedPrimitives is the caller's list of primitives the runtime really supports (null = unchecked, recorded as a condition).
// Consumer (proposed): crew.mjs Look generation/check, design.mjs Look card projection.
export function resolveLookMedium(run, label = null, { med = null, supportedPrimitives = null } = {}) {
  const M = med || loadMedium();
  const doc = label ? readMediumContract(run, label) : mediumContractFor(run);
  const custom = (isObj(doc) && isObj(doc.custom_direction) ? doc.custom_direction : null) || (isObj(mediumDirectionOf(run).custom_direction) ? mediumDirectionOf(run).custom_direction : null);
  const sel = readSelection(run), assigned = label ? labelAssignments(run, M)[label] : null;
  const pid = (isObj(doc) && doc.profile_id) || (assigned && assigned.record && assigned.record.id) || null;
  const r = pid ? resolveMediumProfile(M.index, pid) : { ok: false };
  const profile = r.ok ? r.profile : null;
  let eligibility = null;
  if (profile) { const asg = buildAssignment(run, { caps: M.caps, pins: {} }); eligibility = assessMediumEligibility(profile, asg, { capabilities: M.caps, assets: asg.assets, policy: {} }); }
  const cid = (assigned && assigned.candidate_id) || (isObj(doc) ? doc.candidate_id : null) || null;
  const judgmentsSupplied = !!(sel && cid && isObj(sel.assessments && sel.assessments[cid] && sel.assessments[cid].fit) && Object.values(sel.assessments[cid].fit.dimensions || {}).some((d) => d && d.level !== "unknown"));
  return resolveMediumResolution({ profile, candidateId: cid, eligibility, selected: !!(assigned || (isObj(doc) && doc.profile_id)), judgmentsSupplied, customDirection: custom, supportedPrimitives });
}
// The Look identity digest: includes the selected medium contract digest / custom direction, resolution and required constraints. A board pinned to an older
// digest is not current. Consumer (proposed): crew.mjs look-board freshness check; design.mjs stamps pins.look_identity_digest on the Look it writes.
export function lookIdentityFor(run, label = null, { med = null, contract = null, resolution = null } = {}) {
  const doc = contract || (label ? readMediumContract(run, label) : mediumContractFor(run));
  let M = med; try { M = M || loadMedium(); } catch { M = null; }
  const res = resolution || (M ? resolveLookMedium(run, label, { med: M }) : null);
  const rec = M && isObj(doc) && doc.profile_id ? resolveMediumProfile(M.index, doc.profile_id) : { ok: false };
  const digest = lookIdentityDigest({ contract: isMediumContract(doc) ? doc : null, resolution: res, customDirection: isObj(doc) && doc.custom_direction ? doc.custom_direction : null, constraints: brandConstraintRecords(run).records, profileDigest: rec.ok ? profileDigest(rec.profile) : null });
  return { digest, resolution: res, medium_contract_digest: isMediumContract(doc) ? mediumContractDigest(doc) : null };
}
export { lookIdentityCurrent };
// Look alternatives for the run. Reads only explicit user direction (decisions.medium_direction: exact_fidelity / reproduce_existing / authorized_variation / delegated);
// brand ownership, direct and Fast never collapse the count. Consumer (proposed): crew.mjs Look count (replaces any branded/direct/Fast collapse under revision 2 only).
export function lookAlternativesFor(run, { route = "standard", requestedCount = null } = {}) {
  const dec = rj(P(run, "decisions.json")) || {}, md = mediumDirectionOf(run);
  const userDirection = { exact_fidelity: md.exact_fidelity === true, reproduce_existing: md.reproduce_existing === true, authorized_variation: arr(md.authorized_variation), delegated: md.delegated === true, source_action_id: md.source_action_id ?? null };
  return lookAlternativePolicy({ requestedCount, route, brandOwned: !!(dec.brand && dec.use_brand !== false), userDirection });
}

// the short fit / trade-off lines a Look card shows through its existing `limitations` field ([{name, why}])
export function mediumLimitations(run, label, med = null) {
  const doc = readMediumContract(run, label);
  if (!isMediumContract(doc)) return [];
  const out = [{ name: `Medium: ${doc.profile_id}`, why: T(doc.visual_premise).slice(0, 140) }];
  for (const l of arr(doc.limitations).slice(0, 2)) out.push({ name: "Medium limit", why: T(l).slice(0, 140) });
  out.push({ name: "Medium status", why: "Not yet rendered or checked (unvalidated): the first picture of it is the representative frame." });
  void med;
  return out;
}

// ---------------------------------------------------------------------------------------------------- scene-runtime inputs
// eventBindings: [{id, t}] in SCENE-LOCAL seconds (what createMediumScene / setTime expect), from the derived motion/events.json. Times stay in the score.
export function eventBindingsFor(run, scene = null) {
  const ev = rj(P(run, "motion", "events.json"));
  if (!ev || !Array.isArray(ev.events)) return { ok: false, bindings: [], note: "motion/events.json is missing or not derived yet (events.mjs export --run <run>)" };
  const rows = ev.events.filter((e) => e && e.id != null && Number.isFinite(Number(e.scene_t)) && (scene == null || String(e.scene) === String(scene)));
  return { ok: true, score_revision: ev.score_revision ?? null, bindings: rows.map((e) => ({ id: String(e.id), t: Number(e.scene_t), film_t: Number(e.t), scene: e.scene })) };
}
// assets.canons: { <cast id>: <identity.json, inline> } for the cel runtime's canonRef (a painted-2d identity, schema_version 1)
export function canonsFor(run) {
  const dir = P(run, "cast"), out = {};
  if (has(dir)) for (const d of fs.readdirSync(dir)) { const j = rj(path.join(dir, d, "identity.json")); if (j) out[d] = j; }
  return out;
}
// the honest treatment line(s) a scene's author keeps, read from the runtime's own disclosure() (companion only today); null when the module exposes none
export function treatmentLines(contract) {
  const out = [];
  const exec = isObj(contract) ? contract.execution_id : null;
  try {
    if (exec === "pixel-companion") {
      const req = createRequire(import.meta.url);
      const C = req(path.join(SKILL_DIR, "runtime", "medium-pixel-companion.js"));
      const d = C && typeof C.disclosure === "function" ? C.disclosure() : null;
      if (d && d.treatment_note) out.push({ execution_id: exec, treatment_note: d.treatment_note, visible_label_suggestion: d.visible_label_suggestion || null, required_when: d.required_when || null });
    }
  } catch { /* the line is advisory; a missing module is not a failure here */ }
  return out;
}
// which runtime files a project needs for this contract's execution (video.mjs inject copies exactly these into assets/rasan-medium/)
export const RUNTIME_FILES = {
  "flat-vector-native": ["medium-surface.js", "medium-graphic.js"], "line-drawing-native": ["medium-surface.js", "medium-graphic.js"], "evidence-diagram": ["medium-surface.js", "medium-graphic.js"],
  "paper-collage-native": ["medium-surface.js", "medium-paper.js"], "pixel-native": ["medium-pixel.js"], "pixel-companion": ["medium-pixel.js", "medium-pixel-companion.js"],
  "cel-performance": ["medium-cel.js"], "isometric-system": ["medium-isometric.js"],
};
// v3: runtime helper names supplied by other lanes (W13 text, W14 anchors, W15 space). INT-ENGINE-A passes them (or appends them to RUNTIME_FILES) in wave 3; this never
// invents a file. A name is kept only once; the contract's own medium files come first. Consumer (proposed): video.mjs inject.
export const runtimeFilesFor = (contract, extra = []) => [...new Set([...(RUNTIME_FILES[isObj(contract) ? contract.execution_id : null] || []), ...arr(extra).map(T).filter(Boolean)])];
// v3 (INT-ENGINE-A): the shared helper runtimes. COMMON_RUNTIME = the text-performance (W13) and anchor/layout (W14) helpers every v3 scene may call; SPATIAL_RUNTIME = the
// existing runtime files a W15 spatial op needs (the 3D stage installs its own assets/three). runtimeFilesFor adds them only when the caller says the scene uses them
// (opts.common / opts.spatial), so a legacy call (no opts) returns exactly what it returned before. Consumer: video.mjs inject (INT-ENGINE-B) and crew.mjs mediumContext.
// Addendum 1 (sequence, revision >= 2 callers only): rasan-motion.js (RasanMotion.continueFrom: handoff boundary conditions), rasan-ui.js (product choreography: reveal / isolate / follow / hold) and
// rasan-optics.js (RasanOptics.apply: the one writer of layer filters and masks) join the shared helpers. They are plain runtime files that already exist; a scene calls only what its beat plan names.
export const COMMON_RUNTIME = ["rasan-type.js", "rasan-layout.js", "rasan-motion.js", "rasan-ui.js", "rasan-optics.js"];
export const SPATIAL_RUNTIME = ["rasan-sim.js", "rasan-camera.js", "rasan-shape.js", "rasan-optics.js"]; // optics composes with the camera's depth of field (one filter writer per element); runtimeFilesFor keeps a name once
// true when creative/plans/index.json (written by packets.writeScenePlans at scene-packet compile) holds a planned spatial operation: the spatial runtime files (RasanSim/Camera/Shape) are then injected
export const spatialPlanned = (run) => { const ix = run ? rj(P(run, "creative", "plans", "index.json")) : null; return !!(ix && ix.spatial === true); };
export const runtimeFilesWith = (contract, { common = false, spatial = false, extra = [] } = {}) => runtimeFilesFor(contract, [...(common ? COMMON_RUNTIME : []), ...(spatial ? SPATIAL_RUNTIME : []), ...arr(extra)]);
// the medium's defining-behaviour evidence for the chosen contract (W08): classifyEvidence's input comes from the capability registry (source present, verified gate) plus the
// medium rows already in crew/perf.jsonl (recorded only by a person or a frame/temporal review). Nothing runs here. Returns { language_id, states, summary, errors, scoped }.
// commitments: [{id, behavior, event_id?, language?}] (the Look/Storyboard's medium commitments); diagnostics: the checks a consumer would run (ids), scoped by the visual language.
// Consumer: crew.mjs check (creative_review / look), console/Look card limitations; a revision-1 run never calls it.
const languageOf = (execId) => Object.keys(MEDIUM_BEHAVIORS).find((k) => MEDIUM_BEHAVIORS[k].execution_ids.includes(execId)) || null;
export function performanceFor(run, { label = null, commitments = [], diagnostics = [], visualLanguage = null, intentionalStillness = [], registry = null, sceneId = null } = {}) {
  const contract = label ? readMediumContract(run, label) : mediumContractFor(run);
  if (!isMediumContract(contract)) return { applicable: false, reason: "no medium contract for this Look: nothing to assess", states: [], summary: { available: 0, uncertain: 0, unavailable: 0 }, errors: [], scoped: { enforce: arr(diagnostics).map((d) => (isObj(d) ? d.id : d)).filter(Boolean), scoped: [], factual: [] } };
  const reg = registry || (() => { try { return buildRegistry(); } catch { return []; } })();
  const demonstrated = summarizeMediumEvidence(readPerf(run));
  const base = mediumExecutionEvidence(reg, contract.execution_id);
  const languageId = languageOf(contract.execution_id);
  const evidence = {};
  for (const b of languageId ? MEDIUM_BEHAVIORS[languageId].behaviors : []) {
    const seen = demonstrated[`${contract.execution_id}:${b}`];
    evidence[b] = { ...base, ...(seen ? evidenceFlags(seen.level) : { visually_demonstrated: false }), refs: [...arr(base.refs)] };
  }
  const perf = resolveMediumPerformance({ languageId, commitments, evidence });
  const scoped = scopeDiagnostics(diagnostics, { visualLanguage: visualLanguage || (languageId === "typography" ? "typographic" : null), contract, sceneId, intentionalStillness });
  return { applicable: true, execution_id: contract.execution_id, profile_id: contract.profile_id, ...perf, scoped };
}
export const needsRasan2d = (contract) => isObj(contract) && contract.execution_id === "cel-performance";

// ---------------------------------------------------------------------------------------------------- consumers of the per-layer adapter
// A film-level check has no layer of its own, so an exception holds only when EVERY layer of the contract (or the given layerIds) qualifies for it; one layer that does
// not qualify keeps the established check. Unknown contract / layer / rule keeps the check. Returns the exceptions to record in the consumer's report.
export function scopedSkips(contract, ruleIds, { sceneId = null, layerIds = null } = {}) {
  const skip = new Set(), exceptions = [], kept = [];
  if (!isMediumContract(contract)) return { skip, exceptions, kept: arr(ruleIds).slice() };
  const layers = (layerIds && layerIds.length ? layerIds : arr(contract.layers).map((l) => l && l.id)).filter(Boolean);
  for (const rule of arr(ruleIds)) {
    const per = layers.map((l) => resolveMediumRules({ contract, layerId: l, sceneId, existingRules: [rule] }).scopedExceptions.filter((x) => x.rule_id === rule)[0] || null);
    if (layers.length && per.every(Boolean)) { skip.add(rule); exceptions.push({ rule_id: rule, scene_id: sceneId, layers, reason: per[0].reason, policy: per[0].policy, source: per[0].source }); }
    else kept.push(rule);
  }
  return { skip, exceptions, kept };
}
// layers of a contract whose finish is sharp / nearest-neighbour / none / flat: a film-wide blur, grain or glow pass would hit them
export function sharpFinishLayers(contract) {
  if (!isMediumContract(contract)) return [];
  const f = (contract.finish_policy && contract.finish_policy.by_layer) || {};
  return Object.keys(f).filter((k) => ["sharp", "nearest-neighbor", "none", "flat"].includes(f[k]));
}
