// Plan 10 U8 (+ U5 compare): what ties a preview, a pointer or a render to a REVISION. Pure functions; no file is written here.
//   checkRenderReceipt   only a receipt that names this edit, carries the digests, media settings and an output checksum, and whose file hashes to
//                        that checksum may move an edit to preview_ready / rendered. A merely existing nonempty MP4/PNG is never evidence.
//   bindAnnotation       a pointer / annotation attaches to the DISPLAYED render revision and its element index; a stale index is never silently used.
//   timelineCorrespondence  explicit Original -> Updated time mapping per beat for retimed versions (never "same timestamp = same beat").
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { policyRevisionOf, SUPPORTED_POLICY_REVISIONS, CREATIVE_ERROR_CODES } from "./creative-policy.mjs";
import { diffIdentity } from "./impact.mjs";
import { canonicalDigest } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const HEX64 = /^[0-9a-f]{64}$/i;
const sha256File = (f) => { try { return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); } catch { return null; } };

// ---- U8: the render receipt ------------------------------------------------------------------------------------------------------------
// receipt: { edit_id, source_digest, score_digest?, look_digest?, build_job?, attempt?, media_settings:{mode,...}, output_checksum }
//   (the shape lib/hybrid-render writes into a revision event; score/look digests and the job are recorded when present and reported as unavailable otherwise)
// event (optional): the revision_progress event the receipt came from { stage, source:{edit_id}, preview:{file}, final:{file} }
// edit: the latest edits.jsonl line. kind: "preview" | "final". ctx: { run, accepted?: {source,score,look}, outputFile?, stale_revisions?:Set }
// -> { ok, problems:[...], unavailable:[...], evidence:{ output_sha, file } }
export function checkRenderReceipt({ receipt, event = null, edit, kind = "final", run = ".", outputFile = null, accepted = null, staleRevisionIds = [] } = {}) {
  const problems = [], unavailable = [];
  if (!isObj(receipt)) return { ok: false, problems: ["no receipt: a file that merely exists is not evidence that this edit was rendered"], unavailable, evidence: null };
  if (!edit || !edit.id) problems.push("no edit to match the receipt against");
  if (!receipt.edit_id) problems.push("the receipt names no edit_id");
  else if (edit && receipt.edit_id !== edit.id) problems.push(`the receipt is for edit ${receipt.edit_id}, not ${edit.id}`);
  if (!receipt.source_digest || typeof receipt.source_digest !== "string") problems.push("the receipt has no source_digest (the accepted source this render was made from)");
  if (!isObj(receipt.media_settings)) problems.push("the receipt has no media_settings");
  const sum = String(receipt.output_checksum || "");
  if (!HEX64.test(sum)) problems.push("the receipt has no sha256 output_checksum");
  const mode = receipt.media_settings && receipt.media_settings.mode;
  if (isObj(receipt.media_settings)) {
    if (kind === "final" && mode && !["delivery", "final"].includes(mode)) problems.push(`mode ${JSON.stringify(mode)} is a ${mode}, not a delivery render: use preview_ready for it`);
    if (kind === "preview" && mode && ["delivery", "final"].includes(mode) === false && mode !== "preview") problems.push(`mode ${JSON.stringify(mode)} is not a preview render`);
  }
  if (event) {
    if (event.stage !== (kind === "final" ? "final_ready" : "preview_ready")) problems.push(`the event says ${event.stage}, not ${kind === "final" ? "final_ready" : "preview_ready"}`);
    if (event.source && edit && event.source.edit_id && event.source.edit_id !== edit.id) problems.push(`the event belongs to edit ${event.source.edit_id}`);
    if (event.source && event.source.source_digest && receipt.source_digest && event.source.source_digest !== receipt.source_digest) problems.push("the event's source_digest and the receipt's differ: the render belongs to another source");
    if (event.preview && event.preview.kind === "overlay") problems.push("an overlay preview is ephemeral and never evidence of a render");
    if (staleRevisionIds.includes(event.revision_id)) problems.push(`revision ${event.revision_id} was superseded by a newer source`);
  }
  if (accepted) for (const k of ["source", "score", "look", ...(accepted.identity ? ["identity"] : [])]) { // V3: `identity` (lib/impact.mjs consumerIdentity) joins only when the accepted record carries one
    const want = accepted[k], got = receipt[`${k}_digest`];
    if (want && !got) problems.push(`the receipt does not carry the ${k} digest this edit was accepted under`);
    else if (want && got && want !== got) problems.push(`${k} digest differs from the one this edit was accepted under: the render predates or postdates the edit`);
  }
  for (const k of ["score_digest", "look_digest", "build_job", "attempt"]) if (receipt[k] == null) unavailable.push(k);
  // the file must exist and hash to the checksum
  const rel = outputFile || (event && ((kind === "final" ? event.final : event.preview) || {}).file) || null;
  let file = null, outSha = null;
  if (!rel) problems.push("no output file to verify: pass the rendered file (--preview <file>) or an event that names it");
  else {
    file = path.isAbsolute(rel) ? rel : path.resolve(String(run), rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) problems.push(`output file not found or empty: ${rel}`);
    else {
      outSha = sha256File(file);
      if (HEX64.test(sum) && outSha !== sum.toLowerCase()) problems.push("the output file does not hash to the receipt's output_checksum: it is another render");
    }
  }
  return { ok: problems.length === 0, problems, unavailable, evidence: { output_sha: outSha, file } };
}

// ---- U8: a pointer / annotation is bound to the displayed render ------------------------------------------------------------------------
// annotation: { render_revision_id, output_checksum?, index_build_digest, element_id?, time_s, region_norm?, frame_ref?, note }
// displayed:  { render_revision_id, output_checksum? }      what the viewer is looking at now
// index:      the CURRENT motion/element-index.json (or null)       currentBuildDigest: buildDigest(project) now, when the caller can compute it
// -> { ok, bound, mode: "element"|"region_only"|"conflict", reasons:[...], apply_allowed, reselect, show:{ annotated_frame, region_norm }, note_kept }
export function bindAnnotation({ annotation, displayed = {}, index = null, currentBuildDigest = null, currentAnchors = null } = {}) {
  const a = isObj(annotation) ? annotation : {};
  const reasons = [];
  if (displayed.render_revision_id && a.render_revision_id && displayed.render_revision_id !== a.render_revision_id) reasons.push("the annotation was made on a different render than the one displayed");
  if (displayed.output_checksum && a.output_checksum && displayed.output_checksum !== a.output_checksum) reasons.push("the annotated picture is not the displayed file (checksum differs)");
  if (!a.render_revision_id) reasons.push("the annotation names no render revision");
  let indexOk = true;
  if (a.element_id) {
    if (!index) { indexOk = false; reasons.push("there is no element index to confirm the element"); }
    else {
      if (!a.index_build_digest) { indexOk = false; reasons.push("the annotation recorded no index build digest"); }
      else if (index.build_digest && a.index_build_digest !== index.build_digest) { indexOk = false; reasons.push("the element index was rebuilt since the annotation: its bounds may belong to another picture"); }
      if (currentBuildDigest && index.build_digest && index.build_digest !== currentBuildDigest) { indexOk = false; reasons.push("the element index is older than the scene sources"); }
      if (indexOk && !arr(index.items).some((i) => i.element_id === a.element_id)) { indexOk = false; reasons.push(`element ${a.element_id} is not in the current index`); }
    }
  }
  // V3: an annotation that named a composition anchor / region (lib/composition-anchors.mjs ids) binds only while that anchor's digest is unchanged. currentAnchors: { <anchor_id>: digest }
  let anchorOk = true;
  if (a.anchor_id && currentAnchors) {
    if (!(a.anchor_id in currentAnchors)) { anchorOk = false; reasons.push(`anchor ${a.anchor_id} is not in the current composition`); }
    else if (a.anchor_digest && currentAnchors[a.anchor_id] !== a.anchor_digest) { anchorOk = false; reasons.push(`anchor ${a.anchor_id} was re-planned since the annotation: its region may be elsewhere now`); }
  }
  const renderOk = !reasons.some((r) => /different render|not the displayed file|names no render/.test(r));
  const elementOk = a.element_id ? indexOk && renderOk && anchorOk : false;
  const hasRegion = isObj(a.region_norm) && ["x", "y", "w", "h"].every((k) => typeof a.region_norm[k] === "number");
  const show = { annotated_frame: a.frame_ref || null, region_norm: hasRegion ? a.region_norm : null, time_s: a.time_s ?? null };
  if (elementOk) return { ok: true, bound: true, mode: "element", reasons: [], apply_allowed: true, reselect: false, show, note_kept: true };
  // region-only fallback keeps the note; it never authorises an edit on an unconfirmed object
  return { ok: false, bound: false, mode: hasRegion && renderOk ? "region_only" : "conflict", reasons, apply_allowed: false, reselect: true, show, note_kept: true,
    message: "The picture or its element index changed since you pointed. Your note is kept; pick the element again on the current render." };
}

// ---- U5: Original / Updated correspondence --------------------------------------------------------------------------------------------
// each timeline: { beats: [{ id, start, end }] } (seconds). -> { identical, segments:[{beat_id, original:[a,b], updated:[c,d], retimed}], added:[ids], removed:[ids] }
export function timelineCorrespondence(original, updated) {
  const o = arr(original && original.beats), u = arr(updated && updated.beats);
  const uById = new Map(u.map((b) => [b.id, b]));
  const segments = [], removed = [];
  for (const b of o) {
    const m = uById.get(b.id);
    if (!m) { removed.push(b.id); continue; }
    segments.push({ beat_id: b.id, original: [b.start, b.end], updated: [m.start, m.end], retimed: Math.abs(b.start - m.start) > 1e-6 || Math.abs(b.end - m.end) > 1e-6 });
  }
  const oIds = new Set(o.map((b) => b.id));
  const added = u.filter((b) => !oIds.has(b.id)).map((b) => b.id);
  return { identical: !segments.some((s) => s.retimed) && !added.length && !removed.length, segments, added, removed };
}
// map a time on one side to the other through the beat it falls in (linear inside the beat). direction: "original_to_updated" | "updated_to_original"
// -> { t, beat_id, exact:true } | { t:null, beat_id:null, exact:false, reason }
export function mapTime(corr, t, direction = "original_to_updated") {
  const fwd = direction === "original_to_updated";
  for (const s of arr(corr && corr.segments)) {
    const [a, b] = fwd ? s.original : s.updated, [c, d] = fwd ? s.updated : s.original;
    if (t >= a && (t < b || (t === b && s === corr.segments[corr.segments.length - 1]))) {
      const f = b > a ? (t - a) / (b - a) : 0;
      return { t: c + f * (d - c), beat_id: s.beat_id, exact: true };
    }
  }
  return { t: null, beat_id: null, exact: false, reason: "no matching beat on the other side (added, removed or outside the film)" };
}


// ---- V3 (W11): compatibility, late results, migration ---------------------------------------------------------------------------------------------
// Pure. No file is written; no plan is migrated. Consumers: INT-ENGINE-A (crew.mjs plan/resume, creative-run.mjs) calls policyCompat() where it used `creativeOn(plan)` / `=== 1`;
// the job/commit path calls lateResultVerdict() beside jobs.mjs commit/accept identity checks; an explicit user revision calls buildMigrationReceipt().

// plan: crew/plan.json (or any object with creative_policy_revision). Marker absent = a legacy run: unchanged. 1 = creative recovery (strict consent, creative checks). 2 = V3.
// Any other marker is unsupported: reading/resuming the folder is fine, but NEW production dispatch must stop (no permissive legacy fallback, no invented mode).
// -> { mode: "legacy"|"recovery"|"v3"|"unsupported", revision, creative_on, v3, strict_consent, dispatch_allowed, code?, message? }
export function policyCompat(plan) {
  const has = !!(plan && plan.creative_policy_revision != null);
  const rev = policyRevisionOf(plan);
  if (!has) return { mode: "legacy", revision: 0, creative_on: false, v3: false, strict_consent: false, dispatch_allowed: true };
  if (!SUPPORTED_POLICY_REVISIONS.includes(rev)) return { mode: "unsupported", revision: Number.isFinite(rev) ? rev : null, creative_on: false, v3: false, strict_consent: false, dispatch_allowed: false, code: CREATIVE_ERROR_CODES.unsupported_policy, message: `creative_policy_revision ${JSON.stringify(plan.creative_policy_revision)} is not supported by this engine: existing files stay readable, new production dispatch stops before any packet is written` };
  return { mode: rev >= 2 ? "v3" : "recovery", revision: rev, creative_on: true, v3: rev >= 2, strict_consent: true, dispatch_allowed: true };
}
// what a re-plan must carry forward: the saved marker unchanged (a revision 2 plan must never silently fall back to legacy, nor a revision 1 plan jump to 2). -> value to assign | undefined (leave unset)
export const carriedRevision = (prevPlan) => (prevPlan && prevPlan.creative_policy_revision != null ? prevPlan.creative_policy_revision : undefined);

// A worker result that arrives late. recorded: the identity the job ran under; current: what the identities are NOW (both lib/impact.mjs identityMap, or per-kind digests);
// reads (optional): the keys this job read, so an unrelated edit does not reject it. Rejected work is not deleted: disposition "old_reference" keeps it as reference, never as current.
// -> { accept, disposition: "current"|"old_reference", mismatches:[{key, recorded, current}], reason }
export function lateResultVerdict({ recorded = {}, current = {}, reads = [] } = {}) {
  const rd = arr(reads).map(String);
  const rel = (k) => !rd.length || rd.some((r) => k === r || k.startsWith(r + ":") || r.startsWith(k + ":"));
  const d = diffIdentity(recorded, current);
  const mismatches = [...d.changed, ...d.added, ...d.removed].filter(rel).map((key) => ({ key, recorded: (recorded || {})[key] ?? null, current: (current || {})[key] ?? null }));
  return mismatches.length
    ? { accept: false, disposition: "old_reference", mismatches, reason: `${mismatches.length} input identit${mismatches.length === 1 ? "y" : "ies"} changed while it ran (${mismatches.slice(0, 3).map((m) => m.key).join(", ")}): kept as old reference, not published as current` }
    : { accept: true, disposition: "current", mismatches: [], reason: "every input it read is unchanged" };
}

// An EXPLICIT adoption of a newer policy revision for a saved run. Never automatic, never retroactive: the original documents stay as they are and a new revision is written with this receipt.
// o: { from_revision, to_revision, user_action:{ action_id, text? } (the person's consumed request), shown_diff:[lines the person saw], consumed_actions:[{ action_id, kind, ref? }],
//      known_artifacts:[{ ref, digest, kind }], signature_events:[{ id, source_action_id? }], run? }
// -> { ok, receipt } | { ok:false, errors }. Bindings come only from real consumed actions; anything without evidence is listed in `unbound`, never given an invented id.
export function buildMigrationReceipt(o = {}) {
  const errors = [];
  const to = Number(o.to_revision), from = Number(o.from_revision ?? 0);
  if (!SUPPORTED_POLICY_REVISIONS.includes(to)) errors.push(`to_revision must be one of ${SUPPORTED_POLICY_REVISIONS.join(", ")}`);
  if (!(to > from)) errors.push("to_revision must be newer than from_revision (migration only moves forward, by explicit revision)");
  if (!isObj(o.user_action) || !o.user_action.action_id) errors.push("user_action.action_id: the person's own consumed request (no silent migration)");
  if (!arr(o.shown_diff).length) errors.push("shown_diff: what changes must be shown to the person before adoption");
  if (errors.length) return { ok: false, errors };
  const consumed = new Map(arr(o.consumed_actions).filter((a) => isObj(a) && a.action_id).map((a) => [String(a.action_id), a]));
  const bound = [], unbound = [];
  for (const e of arr(o.signature_events)) {
    const id = isObj(e) ? String(e.id || "") : "";
    if (!id) continue;
    if (e.source_action_id && consumed.has(String(e.source_action_id))) bound.push({ event_id: id, source_action_id: String(e.source_action_id) });
    else unbound.push({ event_id: id, why: "no consumed action proves it was observed before build: left unbound (a pre-build contract is not claimed)" });
  }
  const artifacts = arr(o.known_artifacts).filter((a) => isObj(a) && a.ref && a.digest).map((a) => ({ ref: String(a.ref), digest: String(a.digest), kind: a.kind || null }));
  const receipt = {
    format: "migration-receipt@1", from_revision: from, to_revision: to, run: o.run || null, user_action: { action_id: String(o.user_action.action_id), text: o.user_action.text || null },
    shown_diff: arr(o.shown_diff).map(String), original_preserved: true, write_as: "a new revision document beside the original; the original files are not rewritten",
    bound, unbound, known_artifacts: artifacts,
    claims: { retroactive_approval: false, validated_against_new_requirements: false, note: "Reading a legacy film successfully is not validating it against the new creativity requirements." },
    ...(artifacts.length || unbound.length ? {} : { evidence: "none: this legacy film has no recorded evidence to bind" }),
  };
  receipt.digest = canonicalDigest(receipt);
  return { ok: true, receipt };
}

// ---- V3 (W11): the exact-equality / dropped-field inventory (data for the lead and INT-ENGINE-A/B; nothing here changes behavior) ---------------------------------------------
// Each: file, symbol (line numbers drift: anchor on the symbol), what it does today, the replacement. Derived by inspection at HEAD f72e7d45; unvalidated.
export const REVISION_CONSUMER_INVENTORY = Object.freeze([
  { file: "skills/rasanai/scripts/lib/creative-run.mjs", symbol: "creativeOn = (plan) => !!(plan && plan.creative_policy_revision === CREATIVE_POLICY_REVISION)", effect: "revision 2 is false: every creative check silently turns off", replace: "export const creativeOn = (plan) => creativePolicyOn(plan); // import { creativePolicyOn } from \"./creative-policy.mjs\" (1 and 2 true, anything else false)" },
  { file: "skills/rasanai/scripts/lib/creative-run.mjs", symbol: "creativeBriefSkeleton / writeSelection doc `creative_policy_revision: CREATIVE_POLICY_REVISION` (two sites)", effect: "a revision 2 run would write revision 1 into creative/brief.json and the selection doc, so creative-contract.mjs `>= 2` event commitments and creative-handoff.mjs `>= 2` projections never run", replace: "write policyRevisionOf(readPlan(run)) || CREATIVE_POLICY_REVISION" },
  { file: "skills/rasanai/scripts/storyboard.mjs", symbol: "const strict = () => { ... p.creative_policy_revision === 1 }", effect: "revision 2 plans lose strict consent (prepared story/look would count as approval)", replace: "return !!(p && creativePolicyOn(p)); // lib/creative-policy.mjs" },
  { file: "skills/rasanai/scripts/crew.mjs", symbol: "plan command: `else if (prev.creative_policy_revision === 1) p.creative_policy_revision = 1;` (~3621)", effect: "a re-plan of a revision 2 run drops the marker and silently downgrades it to legacy (the marker is rebuilt only for isNew); an unsupported future marker is also erased, which would re-enable dispatch", replace: "else if (prev.creative_policy_revision != null) p.creative_policy_revision = prev.creative_policy_revision; // lib/revision-bind.mjs carriedRevision(prev); keeps 1, 2 and any unsupported value so creativePolicyUnsupported() still stops dispatch" },
  { file: "skills/rasanai/scripts/crew.mjs", symbol: "plan command: `cpArg === \"1\"` branch and `delete p.creative_policy_revision` (~3619-3622)", effect: "no explicit way to opt a NEW plan into revision 2", replace: "accept cpArg \"2\" the same way as \"1\" (eligibility die message names revision 2); `off` stays an explicit choice that must not apply to a plan that already has approved creative artifacts without a migration receipt (buildMigrationReceipt)" },
  { file: "skills/rasanai/scripts/crew.mjs", symbol: "`const creative = creativeOn(p)` (~346), `creativeOn(P)` (~811, 915, 919, 1441, 1444, 1445), `CP = creativeOn(...)` (~2171, 2261), creativeCommand (~3499), creativePrep (~3643), creativeReadsNote (~3704)", effect: "all go through creativeOn: fixed once by the creative-run.mjs change above", replace: "no per-site edit; add `const compat = policyCompat(plan); if (!compat.dispatch_allowed) die(compat.message)` at the top of the dispatch/prompt/packet command (before compilePacket) for unsupported_policy" },
  { file: "skills/rasanai/scripts/crew.mjs", symbol: "check message at ~2687: 'set \"creative_policy_revision\": 1, or \"creative\": {\"policy_revision\": 1}'", effect: "text names revision 1 only; the truthy test itself already passes 2", replace: "say: the plan's revision (policyRevisionOf(plan))" },
  { file: "skills/rasanai/scripts/skill-map.mjs", symbol: "CREATIVE_DEEPER / line ~229 `def.kind === \"scene\"`", effect: "no equality check: the guide list is applied on every scene route regardless of revision (comments only name revision 1)", replace: "no code change required; update comments at ~11 and ~70 to say revision 1 or 2" },
  { file: "skills/rasanai/scripts/motion-gate.mjs", symbol: "`creativePolicy = !!(P.plan && (P.plan.creative_policy_revision || cr.policy_revision))` (~531); obey.mjs `PLAN_REV ... || null` / NEW_POLICY (~216-219); lib/moves-lib.mjs `obj.creative_policy_revision`", effect: "truthy tests: revision 2 passes, but so does an unsupported marker like 3", replace: "optional: use policyCompat(plan).creative_on so only 1 and 2 count; unsupported is stopped upstream in crew.mjs anyway" },
  { file: "skills/rasanai/scripts/lib/creative-handoff.mjs / packets.mjs / creative-contract.mjs", symbol: "`creative_policy_revision >= 1` / `>= 2` (creative-handoff ~105, 122, 300; packets ~102, 157; creative-contract ~140, 286)", effect: "already ordered comparisons (rev 1 unchanged, rev 2 adds): correct, but they read the BRIEF marker, which depends on the creative-run.mjs brief-writer fix above", replace: "none" },
]);
export const PROJECTION_GAPS = Object.freeze([
  { file: "skills/rasanai/scripts/lib/packets.mjs", symbol: "`body` in compilePacket (policy_digest, creative_digest, medium_digest, mechanism_digest)", gap: "text ops, anchors, spatial/material/camera ops, asset compositing, continuity group and the event/object ids a packet is for are not in the packet digest, so a font or anchor edit does not move the packet", replace: "add `...(o.ctx && o.ctx.identity ? { identity_digest: o.ctx.identity } : {})` to `body`, where ctx.identity = consumerIdentity(reads, identityMap(parts)) from lib/impact.mjs (absent for legacy: digest unchanged)" },
  { file: "skills/rasanai/scripts/lib/continuity-plan.mjs / jobs.mjs", symbol: "group identity_digest = canonicalDigest({units, owner, events, objects, score}) -> jobs.mjs jobIdFor / commit / accept `current_identity_digest`", gap: "policy, font, shaping, anchor, material and camera keys do not enter the group identity, so a job that read them is not rejected as identity_changed", replace: "the caller (INT-ENGINE-A crew.mjs createJob) passes spec.identity_digest = canonicalDigest({ g: group.identity_digest, x: consumerIdentity(job.reads, identityMap(parts)) }) and the same value as current_identity_digest at commit/accept; jobs.mjs is unchanged" },
  { file: "skills/rasanai/scripts/lib/storyboard.mjs", symbol: "lookPin (~90-98) and the inputs.json story/look pin", gap: "the look pin covers the visual bible and medium contract only; font/shaping, anchors and material/camera plans have no pin, so editing them leaves a storyboard `current`", replace: "extend the pin with an optional `extras` digest = consumerIdentity(['font','shaping','anchor','material','camera'], identityMap(parts)), added to the wrap() only when non-null so a legacy pin digest is unchanged" },
  { file: "skills/rasanai/scripts/lib/contracts.mjs", symbol: "validateRevisionRequest / revisionKey", gap: "none dropped: validateRevisionRequest ignores unknown fields; revisionKey uses stage/target/instruction/base only, so `change_scope` and `change_record` on a request line are preserved and do not change idempotency", replace: "none" },
  { file: "skills/rasanai/scripts/lib/hybrid-render.mjs (receipt writer)", symbol: "receipt { edit_id, source_digest, score_digest, look_digest, build_job, attempt, media_settings, output_checksum }", gap: "no identity_digest, so checkRenderReceipt cannot confirm a V3 render was made under the accepted event/object/font/anchor identity", replace: "write `identity_digest` into the receipt (value = the accepted record's identity); checkRenderReceipt already compares it when accepted.identity is given" },
  { file: "skills/rasanai/scripts/lib/job-control.mjs / jobs.mjs", symbol: "staleByIdentity(run, identities)", gap: "compares per-group digests only", replace: "pass identities computed with the extended spec.identity_digest above; no signature change" },
]);
