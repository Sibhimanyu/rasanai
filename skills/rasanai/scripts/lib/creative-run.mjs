// Creative recovery: the run-side glue between the pure creative modules and a run folder (Plan 02 integration, lead-owned).
// Shared by crew.mjs, frames.mjs and design.mjs. A leaf helper: it imports other leaf libs only (never crew.mjs, console.mjs or another CLI),
// does nothing at load, and every writer here is called by a command, never by an import. Nothing here approves anything:
// consent is read through look.resolveStageConsent (a consumed user action, an approval record or a consumed delegation), never from a file's presence.
//
//   creativeOn(plan) / readPlan(run) / runCreativeOn(run)        the opt-in marker: crew/plan.json creative_policy_revision 1 (legacy creative recovery) or 2 (v3); legacy runs never have it
//   planRevision(plan|run)                                       the revision a creative run stamps on its own records (1 or 2; revision 1 plans stamp 1, unchanged)
//   commitmentReport(run, o)                                     v3: reconcileCommitments over the brief events, the chosen treatment and the live approval pins (revision >= 2 only)
//   consentContexts(run) / approvalPins(run)                     read-only approval state; pins only for stages the user really confirmed
//   lookStyleOf(run) / creativeLookProfile(run, doc)             the selected Look's craft class (blend.json look_style) for checkShots / frame-gate
//   prepareReferences(run, o) / provisionalBrief(run, o)         creative/references.json (automatic, local index) and the provisional creative/brief.json skeleton
//   reviseCreative(run, o)                                       a NEW brief revision after Story / Look / Storyboard (old one kept in creative/revisions/)
//   referenceStills(run, o)                                      permitted reference media of the selection, for frames/refs.json
//   latestReview(run, stage) / normalizeReviewPaths(rv, run)     creative/reviews/<stage>-r<N>.json
//   creativeGate(run, o)                                         readiness at a boundary (storyboard | build | final): absent evidence is "not_reviewed", never a pass
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest } from "./contracts.mjs";
import { resolveStageConsent } from "./look.mjs";
import { stageConsentContext, storyDigest, lookDigest } from "./storyboard.mjs";
import { selectCreativeReferences } from "./creative-references.mjs";
import { validateCreativeBrief, creativeReadiness } from "./creative-contract.mjs";
import { sha256File } from "./creative-handoff.mjs";
import { creativePolicyOn, policyRevisionOf } from "./creative-policy.mjs";
import { reconcileCommitments, creativeExt, treatmentMotifs } from "./creative-contract.mjs";
import { checkSequence } from "./sequence-contract.mjs"; // Addendum 1: the record checks behind the creative gate (revision >= 2 only)
import { opticsCapabilities } from "./optical-treatments.mjs";
import { capabilityInventory } from "./spatial-fields.mjs";
import { assessCompletion, completionStatusLine } from "./creative-completion.mjs";
import crypto from "node:crypto";

export const CREATIVE_POLICY_REVISION = 1;
const arr = (x) => (Array.isArray(x) ? x : []);
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const has = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const P = (run, ...p) => path.join(path.resolve(String(run)), ...p);
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n"); };

// revision 1 (legacy creative recovery) and 2 (v3, opt-in for new plans) both switch the creative branches on; an unsupported revision switches nothing on (crew.mjs plan/brief stop it with unsupported_policy)
export const creativeOn = (plan) => !!(plan && creativePolicyOn(plan));
export const planRevision = (x) => { const pl = typeof x === "string" ? readPlan(x) : x; const r = policyRevisionOf(pl); return r >= 1 ? r : CREATIVE_POLICY_REVISION; };
const v3On = (run) => planRevision(String(run)) >= 2;
export const readPlan = (run) => rj(P(run, "crew", "plan.json"));
export const runCreativeOn = (run) => creativeOn(readPlan(run));

// ---- consent and pins (read-only) ---------------------------------------------------------------------------------------------------------
export function consentContexts(run) {
  return { story: stageConsentContext(run, "story"), look: stageConsentContext(run, "look"), storyboard: stageConsentContext(run, "storyboard") };
}
const lastRecord = (ctx) => arr(Array.isArray(ctx.approvals) ? ctx.approvals : ctx.approvals && ctx.approvals.records).filter((q) => q && q.stage === "storyboard").sort((a, b) => (b.revision || 0) - (a.revision || 0))[0] || null;
// -> { story?, look?, storyboard?, brief? } each { artifact_ref, artifact_digest, revision, source_action_id, basis }, ONLY for a stage the user confirmed and whose artifact is still the one confirmed.
// The Brief precedes the Story: a confirmed Story implies the confirmed Brief (legacy_basis says so; the consent resolver covers story, look and storyboard).
export function approvalPins(run, contexts = null) {
  const c = contexts || consentContexts(run), pins = {};
  for (const [st, d] of [["story", storyDigest(run)], ["look", lookDigest(run)]]) {
    if (!d) continue;
    const x = resolveStageConsent({ ...c[st], stage: st });
    if (x.confirmed) pins[st] = { artifact_ref: d.via, artifact_digest: d.digest, revision: d.revision ?? 1, source_action_id: x.sourceActionId, basis: x.basis };
  }
  const rec = lastRecord(c.storyboard);
  if (rec) {
    const x = resolveStageConsent({ ...c.storyboard, stage: "storyboard", expectedDigest: rec.artifact_digest });
    if (x.confirmed) pins.storyboard = { artifact_ref: "storyboard/approvals.json", artifact_digest: rec.artifact_digest, revision: rec.revision ?? 1, source_action_id: x.sourceActionId, basis: x.basis };
  }
  if (pins.story) {
    const b = rj(P(run, "brief.json"));
    if (b) pins.brief = { artifact_ref: "brief.json", artifact_digest: canonicalDigest(b), revision: 1, source_action_id: null, legacy_basis: "the Brief precedes the Story the user confirmed (a consumed Story action: " + pins.story.source_action_id + ")" };
  }
  return pins;
}
const toBriefPin = (p) => (p ? { artifact_ref: p.artifact_ref, artifact_digest: p.artifact_digest, revision: p.revision, source_action_id: p.source_action_id ?? null, ...(p.legacy_basis ? { legacy_basis: p.legacy_basis } : {}) } : null);

// ---- the selected Look's craft class ------------------------------------------------------------------------------------------------------
// design-system-designer writes look_style in design/<Label>/blend.json (references/design-desk.md). The chosen label is decisions.design_system.label.
export function lookStyleOf(run) {
  const dec = rj(P(run, "decisions.json")) || {};
  const label = (dec.design_system && dec.design_system.label) || (dec.look && dec.look.system) || null;
  const files = [label && P(run, "design", label, "blend.json"), P(run, "look", "blend.json"), P(run, "look", "visual-bible.json")].filter(Boolean);
  for (const f of files) {
    const j = rj(f);
    if (!j) continue;
    const s = j.look_style || (isObj(j.craft) && j.craft.look_style) || (isObj(j.look) && j.look.look_style);
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  if (dec.look && typeof dec.look.look_style === "string" && dec.look.look_style.trim()) return dec.look.look_style.trim();
  return null;
}
const beatsOf = (run) => {
  const t = rj(P(run, "story", "chosen-treatment.json")) || rj(P(run, "story", "intent.json")) || rj(P(run, "story", "chosen.json"));
  return arr(t && (t.beats || (t.treatment && t.treatment.beats)));
};
// the argument of lib/frames-lib.mjs checkShots / frame-gate (creativePolicy): the Look's style class plus the structural bindings the run really has
export function creativeLookProfile(run, doc = null) {
  const brief = rj(P(run, "creative", "brief.json")) || {};
  const beatIds = beatsOf(run).map((b) => b && b.id).filter((x) => x != null).map(String);
  const events = arr(brief.signature_events).filter(isObj);
  const proofs = rj(P(run, "story", "proof-contracts.json"));
  const contracts = Array.isArray(proofs) ? proofs : arr(proofs && proofs.contracts);
  const protectedText = [];
  // a protected item is bound to a board only through an explicit shot_ids on its contract (no guess from the beat name)
  for (const c of contracts) for (const sid of arr(c && c.shot_ids)) for (const g of [c.protected_entities, c.protected_quantities, c.protected_conditions]) for (const it of arr(g)) { const text = isObj(it) ? it.text : it; if (text && !(isObj(it) && it.optional_in_output)) protectedText.push({ shot_id: String(sid), text: String(text) }); }
  return {
    style: lookStyleOf(run) || (doc && doc.film && doc.film.look_style) || "",
    beatIds: beatIds.length === arr(beatsOf(run)).length ? beatIds : [],
    signatureEvents: events,
    repetitionIntent: arr(brief.repetition_intent).length ? brief.repetition_intent : null,
    protectedText,
  };
}

// ---- references (automatic, local; never asks the user for inspiration) -------------------------------------------------------------------
const briefFields = (run) => { const b = rj(P(run, "brief.json")) || {}; return b.fields && isObj(b.fields) ? { ...b, ...b.fields } : b; };
const kindOf = (run) => { const it = rj(P(run, "story", "intent.json")) || {}; const f = briefFields(run); return String(it.communication_kind || f.communication_kind || (rj(P(run, "research", "briefing.json")) || {}).communication_kind || "").trim(); };
// the index's own media that the skill really holds, by full sha256 (a row with none stays a text description)
export function availableMedia(index, skillDir) {
  const out = [];
  for (const row of arr(index && (index.entries || index))) for (const m of arr(row && row.media)) {
    if (!m || !m.path || !m.sha256) continue;
    const abs = path.resolve(skillDir, String(m.path));
    if (!abs.startsWith(path.resolve(skillDir) + path.sep) || !has(abs)) continue;
    if (sha256File(abs) === String(m.sha256).toLowerCase()) out.push({ path: m.path, sha256: String(m.sha256).toLowerCase() });
  }
  return out;
}
export function prepareReferences(run, { skillDir, stage = "research", force = false } = {}) {
  const f = P(run, "creative", "references.json");
  if (has(f) && !force) return { ok: true, file: f, created: false, selection: rj(f) };
  const indexFile = path.join(skillDir, "library", "creative-reference-index.json");
  const index = rj(indexFile);
  const fl = briefFields(run);
  const story = rj(P(run, "story", "chosen-treatment.json")) || rj(P(run, "story", "intent.json")) || rj(P(run, "story", "chosen.json")) || null;
  const style = lookStyleOf(run);
  const kind = kindOf(run);
  // Part 2: the chosen Look's medium (look/medium.json), when there is one, lets that medium's own original examples be considered; before a Look there is none and nothing changes
  const chosenMedium = rj(P(run, "look", "medium.json"));
  const mediumIds = chosenMedium && chosenMedium.format === "medium-contract@1" ? [chosenMedium.profile_id, chosenMedium.execution_id].filter(Boolean) : [];
  const assignment = { communication_kind: kind, format: String(fl.format || fl.tile || ""), tags: [style, String(fl.kind || "")].filter(Boolean), references: fl.references === false || fl.no_references === true ? false : undefined, ...(mediumIds.length ? { medium_ids: mediumIds } : {}) };
  const userRefs = Object.entries(fl).filter(([k, v]) => /^(reference|references|reference_video|reference_url|reference_clip|linked_reference)$/i.test(k) && v && typeof v === "string").map(([, v]) => v);
  const look = style ? { tags: [style] } : null;
  let selection;
  if (!index) selection = { selected: [], unavailable: [], evidenceLevel: "none", note: "library/creative-reference-index.json is missing: work from the brief and the approved Look" };
  else selection = selectCreativeReferences({ index, assignment, story: story && isObj(story) ? { communication_kind: story.communication_kind } : null, look, userReferences: userRefs, availableMedia: availableMedia(index, skillDir), seed: path.basename(path.resolve(String(run))), limit: 4 });
  const doc = { schema_version: 1, creative_policy_revision: planRevision(String(run)), stage, assignment, index_sha256: has(indexFile) ? sha256File(indexFile) : null, ...selection };
  writeJson(f, doc);
  return { ok: true, file: f, created: true, selection: doc };
}
export function referencesDigest(run) { const f = P(run, "creative", "references.json"); return has(f) ? sha256File(f) : null; }

// ---- the provisional brief (a skeleton the Director fills; it grants nothing) -------------------------------------------------------------
export function provisionalBrief(run, { plan = {} } = {}) {
  const f = P(run, "creative", "brief.json");
  if (has(f)) return { ok: true, file: f, created: false };
  const rounds = { lean: 1, standard: 2, full: 3 }[plan.budget || "standard"] ?? 2;
  const doc = {
    schema_version: 1, creative_policy_revision: creativeOn(plan) ? planRevision(plan) : CREATIVE_POLICY_REVISION, revision: 1, mode: "proposal", status: "skeleton",
    pins: { brief: null, story: null, look: null, storyboard: null },
    communication_kind: kindOf(run), promise: "", premise: "", native_material: [],
    opening: { event: "", why_watch: "" }, signature_events: [], signature_events_reason: "", payoff: { event: "", resolves: "" },
    visual_strategy: { protagonist: "", progression: "", rhythm: "", restraint: "", sound_role: "" },
    repetition_intent: [], do_not_substitute: [],
    references: { selection_ref: "creative/references.json", digest: referencesDigest(run) },
    effort: { focus_event_ids: [], round_limit: rounds, source: "existing resolved production budget" },
    decision_authority: "existing user stage approvals; this record grants none",
    todo: "the Director fills promise, premise, native_material, opening, payoff, visual_strategy and the signature events from the research (references/creative-quality.md), deletes this status, then `crew.mjs creative check --run <run>`",
  };
  // revision 2: the user's fixed format kinds / mechanism (brief fields) travel in the extension story.mjs check --brief reads (extensions.creative_thinking.fixed_concept_kinds / brief_mechanism)
  if (creativeOn(plan) && planRevision(plan) >= 2) {
    const fl = briefFields(run), fk = arr(fl.fixed_concept_kinds).map(String).filter(Boolean), bm = String(fl.brief_mechanism || fl.mechanism || "").trim();
    if (fk.length || bm) doc.extensions = { creative_thinking: { version: 1, ...(fk.length ? { fixed_concept_kinds: fk } : {}), ...(bm ? { brief_mechanism: bm } : {}) } };
  }
  writeJson(f, doc);
  return { ok: true, file: f, created: true };
}
export const briefIsSkeleton = (b) => !!(b && b.status === "skeleton");
const stageIds = (run) => ({ beats: beatsOf(run).map((b) => b && b.id).filter((x) => x != null).map(String), shots: arr((rj(P(run, "frames", "shots.json")) || {}).shots).map((s, i) => String((s && s.id) ?? String(i + 1).padStart(2, "0"))) });
export function checkBrief(run, { stage = "proposal", expectPins = false } = {}) {
  const b = rj(P(run, "creative", "brief.json"));
  if (!b) return { ok: false, state: "missing", errors: [{ code: "no_brief", path: "creative/brief.json", message: "creative/brief.json is missing (crew.mjs creative init)" }], warnings: [], missing: [] };
  if (briefIsSkeleton(b)) return { ok: false, state: "skeleton", errors: [{ code: "skeleton", path: "status", message: "creative/brief.json is still the skeleton: fill it and remove status" }], warnings: [], missing: [] };
  const ids = stageIds(run);
  const knownIds = { ...(ids.beats.length ? { beats: ids.beats } : {}), ...(ids.shots.length && stage !== "proposal" && stage !== "story" ? { shots: ids.shots } : {}) };
  // Addendum 1 (revision >= 2 only): the selected treatment and the score let validateCreativeBrief resolve event motif_ids and check treatment motifs (validateMotifBindings); revision 1 passes neither
  const seq = v3On(run) ? { treatment: chosenTreatment(run), score: rj(P(run, "motion", "score.json")) } : {};
  const r = validateCreativeBrief(b, { stage, knownIds, ...(expectPins ? { expectedPins: approvalPins(run) } : {}), ...seq });
  return { ...r, state: r.ok ? "valid" : "invalid" };
}

// a NEW revision (never a silent rewrite): the previous brief and selection are kept in creative/revisions/, references re-picked with the Story / Look now known,
// pins taken from what the user really confirmed. mode: story | look | build.
const NEED = { story: ["story"], look: ["story", "look"], build: ["story", "look", "storyboard"] };
export function reviseCreative(run, { skillDir, mode = "story" } = {}) {
  if (!NEED[mode]) return { ok: false, reason: `mode is one of ${Object.keys(NEED).join(", ")}` };
  const f = P(run, "creative", "brief.json");
  const b = rj(f);
  if (!b) return { ok: false, reason: "no creative/brief.json (crew.mjs creative init)" };
  if (briefIsSkeleton(b)) return { ok: false, reason: "the brief is still the skeleton: fill it first" };
  const pins = approvalPins(run), missing = NEED[mode].filter((s) => !pins[s]);
  if (missing.length) return { ok: false, reason: `no confirmed ${missing.join(" / ")} yet: a prepared file is not approval. Revise the brief only after the user's choice (the existing ${missing[0]} review)`, missing };
  const rev = Number(b.revision) || 1;
  const rdir = P(run, "creative", "revisions");
  fs.mkdirSync(rdir, { recursive: true });
  if (!has(path.join(rdir, `brief-r${rev}.json`))) writeJson(path.join(rdir, `brief-r${rev}.json`), b);
  const rf = P(run, "creative", "references.json");
  if (has(rf) && !has(path.join(rdir, `references-r${rev}.json`))) fs.copyFileSync(rf, path.join(rdir, `references-r${rev}.json`));
  const refs = prepareReferences(run, { skillDir, stage: mode, force: true });
  const next = { ...b, revision: rev + 1, mode, pins: { brief: toBriefPin(pins.brief), story: toBriefPin(pins.story), look: toBriefPin(pins.look), storyboard: toBriefPin(pins.storyboard) }, references: { selection_ref: "creative/references.json", digest: referencesDigest(run) } };
  writeJson(f, next);
  const v = checkBrief(run, { stage: mode });
  return { ok: true, revision: next.revision, mode, pins: Object.keys(pins), references: (refs.selection || {}).evidenceLevel || null, validation: { ok: v.ok, errors: v.errors, warnings: v.warnings } };
}

// ---- reference media for frames/refs.json --------------------------------------------------------------------------------------------------
const IMG = /\.(png|jpe?g|webp)$/i;
// the selected references' lawful, present, hash-checked images -> stills for frames.mjs refs (origin "creative-reference"). No download, no copy: a path already on disk.
export function referenceStills(run, { skillDir } = {}) {
  const sel = rj(P(run, "creative", "references.json"));
  const out = [], skipped = [];
  for (const s of arr(sel && sel.selected)) for (const m of arr(s.mediaRefs)) {
    const p = m && m.path;
    if (!p || !IMG.test(p)) continue;
    const abs = [path.resolve(skillDir || ".", p), P(run, p)].find((x) => has(x));
    if (!abs) { skipped.push({ id: s.id, path: p, why: "not on disk" }); continue; }
    if (m.sha256 && sha256File(abs) !== String(m.sha256).toLowerCase()) { skipped.push({ id: s.id, path: p, why: "sha256 does not match the index" }); continue; }
    out.push({ image: abs, origin: "creative-reference", source: s.id, rights_basis: m.rights_basis || null, scope: m.scope || "reference-only" });
  }
  return { stills: out, skipped };
}

// ---- reviews -------------------------------------------------------------------------------------------------------------------------------
export function latestReview(run, stage) {
  const dir = P(run, "creative", "reviews");
  if (!has(dir)) return null;
  let best = null;
  for (const fn of fs.readdirSync(dir)) {
    const m = fn.match(new RegExp(`^${stage}-r(\\d+)\\.json$`));
    if (m && (!best || Number(m[1]) > best.n)) best = { n: Number(m[1]), file: path.join(dir, fn) };
  }
  if (!best) return null;
  const doc = rj(best.file);
  return { n: best.n, file: best.file, doc, valid_json: !!doc };
}
// a reviewer may name an artifact relative to the run, the workspace or absolute: compare by the run-relative tail
export function normalizeReviewPaths(rv, run) {
  if (!isObj(rv) || !Array.isArray(rv.artifact_digests)) return rv;
  const root = path.resolve(String(run)) + path.sep, tail = path.basename(path.resolve(String(run)));
  const fix = (p) => { const s = String(p || ""); if (s.startsWith(root)) return s.slice(root.length); const i = s.indexOf(`/${tail}/`); return i >= 0 ? s.slice(i + tail.length + 2) : s.replace(/^\.\//, ""); };
  return { ...rv, artifact_digests: rv.artifact_digests.map((a) => (isObj(a) ? { ...a, path: fix(a.path) } : a)) };
}
export function boardDigests(run) {
  const doc = rj(P(run, "frames", "shots.json"));
  const out = [];
  if (has(P(run, "frames", "shots.json"))) out.push({ path: "frames/shots.json", sha256: sha256File(P(run, "frames", "shots.json")) });
  for (const [i, s] of arr(doc && doc.shots).entries()) {
    const id = String((s && s.id) ?? String(i + 1).padStart(2, "0")), f = P(run, "frames", `${id}.png`);
    if (has(f)) out.push({ path: `frames/${id}.png`, sha256: sha256File(f) });
  }
  return out;
}

// v3 (revision >= 2 only): what the selected treatment promised, what the brief's events bind, and what the user approved, reconciled by the one W04 helper.
// -> { applicable, phase, treatment, absences, bound, unresolved, intentionally_absent, incompatible, problems, quiet_film } (commitment ids and problems; no approval is created)
const chosenTreatment = (run) => rj(P(run, "story", "chosen-treatment.json")) || rj(P(run, "story", "chosen.json")) || null;
export function commitmentReport(run, { phase = "build", brief = null, treatment = null } = {}) {
  if (!v3On(run)) return { applicable: false };
  const b = brief || rj(P(run, "creative", "brief.json"));
  if (!b || briefIsSkeleton(b)) return { applicable: true, phase, state: "no_brief", bound: [], unresolved: [], intentionally_absent: [], incompatible: [], problems: [], quiet_film: null };
  const ext = creativeExt(b), basis = ext && isObj(ext.commitment_basis) ? [ext.commitment_basis] : [];
  const t = treatment || chosenTreatment(run);
  const rec = reconcileCommitments({ treatment: t, events: arr(b.signature_events), absences: basis, pins: approvalPins(run), phase });
  return { applicable: true, phase, treatment: t ? String(t.id || t.label || "") || null : null, absences: basis.length, ...rec };
}

// readiness at a boundary. stage: storyboard | build | final. Absent or stale evidence is "not_reviewed" / "blocked", never a pass.
// Revision >= 2 adds the treatment, the intentional-absence basis and the current artifact digests to the structure check (event commitments); revision 1 is exactly as before.
export function creativeGate(run, { stage = "final", waiver = null, outputFile = null } = {}) {
  const base = creativeGateBase(run, { stage, waiver });
  // revision 2 Final: `ready` only when assessCompletion agrees (temporal evidence, commitments, output identity); it can only lower the state, never raise it
  if (stage !== "final" || !v3On(run) || base.state === "not_reviewed" && base.reasons && base.reasons.some((r) => r.code === "no_brief") || base.state === "blocked" && base.reasons && base.reasons.some((r) => r.code === "skeleton")) return base;
  const a = completionFor(run, { waiver, outputFile });
  if (!a) return base;
  const rank = { ready: 0, not_reviewed: 1, revise: 2, needs_user: 3, blocked: 4 };
  const state = (rank[a.state] ?? 0) > (rank[base.state] ?? 0) ? a.state : base.state;
  return { ...base, state, reasons: [...(base.reasons || []), ...(a.reasons || []).filter((r) => !(base.reasons || []).some((b) => b.code === r.code && b.message === r.message))], completion: { state: a.state, allowed_labels: a.allowedLabels, next_decisions: a.nextDecisions, status_line: a.status_line, evidence: a.evidence, commitments: a.commitments, limitations: a.limitations, output_file: a.output_file } };
}
// Addendum 1 (revision >= 2): the sequence records of the run's beat plans (creative/plans/<beat>.json, written by packets.writeScenePlans) and the treatment's motifs, checked by sequence-contract.checkSequence.
// -> null (legacy, no brief, or no motif/record at all: absence is valid) | { ok, errors, warnings, stale, playback_review_required, digest, counts } | { failed } when the check itself threw (recorded to creative/errors.json, never swallowed).
// Records alone can never say a connected movement reads well: playback_review_required stays listed, and the gate never reads "ready" because of it.
// {capability id: available|uncertain|unavailable}: the source-inspected spatial inventory plus the optics ids (planOptics reads the same two), the one input checkSequence and planContinuity take as `capabilities`
export const sequenceCapabilities = () => ({ ...Object.fromEntries(Object.entries(capabilityInventory().ops).map(([k, v]) => [k, v.state])), ...Object.fromEntries(Object.entries(opticsCapabilities({}).ops).map(([k, v]) => [k, v.state])) });
// the sequence records a run really has: treatment motifs (normalized) + the handoff / optics / product / attention records of creative/plans/<beat>.json (the artifacts packets.writeScenePlans wrote)
export function sequenceRecordsOf(run) {
  const score = rj(P(run, "motion", "score.json")), rec = { motifs: treatmentMotifs(chosenTreatment(run), score), handoffs: [], optics: [], product: [], attention: [] };
  const ix = rj(P(run, "creative", "plans", "index.json"));
  for (const row of arr(ix && ix.beats)) {
    const doc = row && row.file ? rj(P(run, row.file)) : null, sec = (doc && doc.sections) || {};
    if (sec.handoff_plan && isObj(sec.handoff_plan.record)) rec.handoffs.push(sec.handoff_plan.record);
    if (sec.optics && sec.optics.active && isObj(sec.optics.record)) rec.optics.push(sec.optics.record);
    if (sec.product && isObj(sec.product.record)) rec.product.push(sec.product.record);
    if (sec.attention && isObj(sec.attention.record)) rec.attention.push(sec.attention.record);
  }
  return rec;
}
export const sequenceRecordsFor = (run) => sequenceRecordsOf(run); // the name completionFor / final-label callers use: the same records the gate checks
export function sequenceGateFor(run) {
  if (!v3On(run)) return null;
  const brief = rj(P(run, "creative", "brief.json"));
  if (!brief || briefIsSkeleton(brief)) return null;
  try {
    const score = rj(P(run, "motion", "score.json")), rec = sequenceRecordsOf(run);
    const n = Object.values(rec).reduce((a, l) => a + l.length, 0);
    if (!n) return null;
    const r = checkSequence({ ...rec, events: arr(brief.signature_events), score, capabilities: sequenceCapabilities() });
    return { ok: r.ok, errors: r.errors, warnings: r.warnings, stale: r.stale, playback_review_required: r.playback_review_required, digest: r.digest, counts: Object.fromEntries(Object.entries(rec).map(([k, l]) => [k, l.length])) };
  } catch (e) {
    try { const f = P(run, "creative", "errors.json"), cur = rj(f), list = arr(cur && cur.errors); list.push({ where: "checkSequence (creative gate)", message: String((e && e.message) || e).slice(0, 400), at: new Date().toISOString() }); writeJson(f, { errors: list.slice(-20) }); } catch { /* the gate still reports the failure below */ }
    return { failed: String((e && e.message) || e).slice(0, 200) };
  }
}
const GATE_RANK = { ready: 0, not_reviewed: 1, revise: 2, needs_user: 3, blocked: 4 };
// the sequence check can only lower the gate (errors at build/final -> revise; a check that threw -> not_reviewed), never raise it; at storyboard it adds reasons only (intervals are still being bound)
function creativeGateBase(run, o = {}) {
  const base = creativeGateCore(run, o), stage = o.stage || "final";
  if (!v3On(run) || (base.state === "not_reviewed" && base.reasons && base.reasons.some((r) => r.code === "no_brief")) || (base.state === "blocked" && base.reasons && base.reasons.some((r) => r.code === "skeleton"))) return base;
  const sq = sequenceGateFor(run);
  if (!sq) return base;
  if (sq.failed) return { ...base, state: GATE_RANK.not_reviewed > GATE_RANK[base.state] ? "not_reviewed" : base.state, reasons: [...(base.reasons || []), { code: "sequence_check_failed", message: `the sequence records could not be checked (${sq.failed}); recorded in creative/errors.json` }] };
  const add = [...sq.errors.map((e) => ({ code: e.code, message: `sequence ${e.path}: ${e.message}`, sequence: true })), ...sq.stale.filter((x) => !sq.errors.some((e) => e.code === x.code && e.message === x.message)).map((x) => ({ code: x.code, message: `sequence ${x.record_kind}.${x.record_id}: ${x.message}`, sequence: true }))];
  const lower = sq.errors.length && (stage === "build" || stage === "final") ? "revise" : base.state;
  return { ...base, state: GATE_RANK[lower] > GATE_RANK[base.state] ? lower : base.state, reasons: [...(base.reasons || []), ...add], sequence: { ok: sq.ok, counts: sq.counts, digest: sq.digest, warnings: sq.warnings.length, stale: sq.stale.length, playback_review_required: sq.playback_review_required.length, note: "record checks only: nothing here says a connected movement, optic, product action or attention transfer reads well; that needs a temporal playback review" } };
}
function creativeGateCore(run, { stage = "final", waiver = null } = {}) {
  const brief = rj(P(run, "creative", "brief.json"));
  if (!brief) return { state: "not_reviewed", reasons: [{ code: "no_brief", message: "no creative/brief.json: this run has no recorded creative intent to review against" }] };
  if (briefIsSkeleton(brief)) return { state: "blocked", reasons: [{ code: "skeleton", message: "the creative brief is still the skeleton" }] };
  const rv = latestReview(run, stage);
  const review = rv && rv.doc ? normalizeReviewPaths(rv.doc, run) : null;
  const pins = approvalPins(run);
  const expectedPins = Object.fromEntries(Object.entries(pins).map(([k, v]) => [k, v.artifact_digest]));
  const digests = stage === "storyboard" || stage === "build" ? boardDigests(run) : [];
  const v3 = v3On(run) ? (() => { const ext = creativeExt(brief); return { treatment: chosenTreatment(run), absences: ext && isObj(ext.commitment_basis) ? [ext.commitment_basis] : null, currentDigests: boardDigests(run) }; })() : {};
  return { ...creativeReadiness({ brief, stage, review: review ? { ...review, round: Number.isInteger(review.round) ? review.round : rv.n } : null, expectedPins, expectedArtifactDigests: digests, waiver, ...v3 }), review_file: rv ? path.relative(path.resolve(String(run)), rv.file) : null };
}

// v3 (revision >= 2, stage final only): the completion assessment over the real output and the latest Final review. Revision 1 and every other stage return null (creativeGate is unchanged).
// output file: explicit, else the newest video the console recorded for the render/final step (session.json), else none (-> not_reviewed: nothing to present as a Final).
const VIDEO = /\.(mp4|mov|m4v|webm)$/i;
export function finalOutputOf(run, file = null) {
  const cands = [];
  if (file) cands.push(path.resolve(String(file)));
  const ss = rj(P(run, "session.json")) || rj(P(run, "console.json")) || {};
  for (const step of ["final", "render"]) { const d = ss.steps && ss.steps[step]; const v = d && (typeof d.video === "string" && d.video ? d.video : arr(d.videos).filter((x) => typeof x === "string" && x).at(-1)); if (v) cands.push(path.isAbsolute(v) ? v : path.resolve(P(run), v)); }
  for (const f of cands) if (VIDEO.test(f) && has(f)) return { file: f, digest: sha256File(f), exists: true, playable: true };
  return { file: null, digest: null, exists: false };
}
export function completionFor(run, { waiver = null, outputFile = null, limits = {} } = {}) {
  if (!v3On(run)) return null;
  const brief = rj(P(run, "creative", "brief.json"));
  const rv = latestReview(run, "final");
  const review = rv && rv.doc ? normalizeReviewPaths(rv.doc, run) : null;
  const pins = approvalPins(run), out = finalOutputOf(run, outputFile);
  const ext = brief && !briefIsSkeleton(brief) ? creativeExt(brief) : null;
  // Addendum 1: the sequence records of the run's beat plans, so assessCompletion owes (and checks) the playback observations for them; absent when the run has none (legacy results unchanged)
  let sequence = null;
  try { const rec = brief && !briefIsSkeleton(brief) ? sequenceRecordsFor(run) : null; if (rec && Object.values(rec).some((l) => l.length)) sequence = { ...rec, events: arr(brief.signature_events), score: rj(P(run, "motion", "score.json")), capabilities: sequenceCapabilities() }; } catch { sequence = null; }
  const a = assessCompletion({
    approvals: { pins: Object.fromEntries(Object.entries(pins).map(([k, v]) => [k, v.artifact_digest])), ...(waiver ? { waiver } : {}) },
    contract: { brief, stage: "final", treatment: chosenTreatment(run), absences: ext && isObj(ext.commitment_basis) ? [ext.commitment_basis] : null, ...(sequence ? { sequence } : {}) },
    output: { digest: out.digest, exists: out.exists, playable: out.exists ? true : undefined },
    review: review ? { ...review, round: Number.isInteger(review.round) ? review.round : rv.n } : null, limits,
  });
  return { ...a, status_line: completionStatusLine(a), output_file: out.file ? path.relative(path.resolve(String(run)), out.file) : null, review_file: rv ? path.relative(path.resolve(String(run)), rv.file) : null };
}
