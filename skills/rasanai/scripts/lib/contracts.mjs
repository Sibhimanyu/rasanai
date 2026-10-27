// Shared contracts (schema_version 1): approval records, light validators and factory defaults.
// Additive: nothing here rewrites an old run. readLegacy() reads any object, old or new, without mutating it.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logicalStage, STAGES } from "./stages.mjs";

export const SCHEMA_VERSION = 1;

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);

const stable = (v) => (Array.isArray(v) ? v.map(stable) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
export const canonicalDigest = (obj) => crypto.createHash("sha256").update(JSON.stringify(stable(obj === undefined ? null : obj))).digest("hex");

// ---- reading old and new records ----------------------------------------------
// -> { ok:true, version, value } (value is a shallow copy; unknown fields kept) or { ok:false, error } (nothing touched)
export function readLegacy(obj, { supported = SCHEMA_VERSION } = {}) {
  if (!isObj(obj)) return { ok: false, error: { code: "not_object", message: "expected a JSON object" } };
  const v = obj.schema_version;
  if (v === undefined || v === null) return { ok: true, version: 0, legacy: true, value: { ...obj } };
  if (!Number.isInteger(v) || v < 0) return { ok: false, error: { code: "bad_schema_version", message: `schema_version must be a non-negative integer, got ${JSON.stringify(v)}` } };
  if (v > supported) return { ok: false, error: { code: "unsupported_schema_version", message: `schema_version ${v} is newer than this engine supports (${supported}); update RasanAI`, found: v, supported } };
  return { ok: true, version: v, legacy: false, value: { ...obj } };
}

// ---- paths ----------------------------------------------------------------------
// resolve `rel` inside `root`; refuses absolute escapes, ".." and symlinks that leave the project. -> { ok, path } | { ok:false, error }
export function safePath(root, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) return { ok: false, error: "empty or invalid path" };
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  const inside = (p) => p === base || p.startsWith(base + path.sep);
  if (!inside(full)) return { ok: false, error: `path escapes the project: ${rel}` };
  let realBase;
  try { realBase = fs.realpathSync(base); } catch { return { ok: false, error: "project root not found" }; }
  // real path of the deepest existing ancestor must stay inside the real root
  let probe = full;
  while (!fs.existsSync(probe)) {
    const up = path.dirname(probe);
    if (up === probe) break;
    probe = up;
  }
  let realProbe;
  try { realProbe = fs.realpathSync(probe); } catch { return { ok: false, error: "path not resolvable" }; }
  if (realProbe !== realBase && !realProbe.startsWith(realBase + path.sep)) return { ok: false, error: `symlink escapes the project: ${rel}` };
  return { ok: true, path: full };
}

// ---- approvals ------------------------------------------------------------------
// An approved revision is immutable: a new edit makes a new revision (revision = previous + 1), never an overwrite.
export function approvalRecord({ stage, artifact_ref, artifact, artifact_digest, revision = 1, approved_by = "", source_action_id = null, depends_on = [] }) {
  const st = logicalStage(stage);
  if (!st) return { ok: false, error: `unknown stage ${JSON.stringify(stage)}` };
  if (!Number.isInteger(revision) || revision < 1) return { ok: false, error: "revision must be an integer >= 1" };
  const digest = artifact_digest || (artifact !== undefined ? canonicalDigest(artifact) : null);
  if (!digest) return { ok: false, error: "artifact or artifact_digest required" };
  return {
    ok: true,
    record: Object.freeze({
      schema_version: SCHEMA_VERSION, stage: st, artifact_ref: str(artifact_ref), artifact_digest: digest, revision,
      approved_by: str(approved_by), source_action_id: source_action_id ?? null,
      depends_on: arr(depends_on).map((d) => ({ stage: logicalStage(d && d.stage), revision: d && d.revision, digest: d && d.digest })),
    }),
  };
}

// next revision for a stage given earlier approval records; never reuses a number
export const nextRevision = (records, stage) => arr(records).filter((r) => r && r.stage === stage).reduce((m, r) => Math.max(m, r.revision || 0), 0) + 1;

// an approval is current when each dependency it recorded still has the same revision and digest
export function approvalCurrent(record, latestByStage) {
  const stale = arr(record && record.depends_on).filter((d) => { const l = latestByStage && latestByStage[d.stage]; return !l || l.revision !== d.revision || l.digest !== d.digest; });
  return { current: !stale.length, stale: stale.map((d) => d.stage) };
}

// ---- validators and factory defaults ---------------------------------------------
const APPROVAL_MODES = ["every_stage", "key_stages", "final_only", "autonomous"];
const check = (problems, cond, msg) => { if (!cond) problems.push(msg); };
const finish = (problems) => ({ ok: !problems.length, problems });

export const defaultFilmBrief = (over = {}) => ({
  schema_version: SCHEMA_VERSION, communication_kind: "", viewer: "", destination: "", scope: "", takeaway: "",
  duration: null, aspect: "16:9", must_show: [], evidence_refs: [], sound: { music: true, voiceover: false }, accessibility: { captions: true, reduced_motion_safe: true },
  approval_mode: "key_stages", ...over,
});
export function validateFilmBrief(b) {
  const p = [];
  if (!isObj(b)) return finish(["not an object"]);
  for (const k of ["communication_kind", "viewer", "destination", "takeaway"]) check(p, typeof b[k] === "string" && b[k].trim(), `${k} is required`);
  check(p, b.duration == null || (Number.isFinite(b.duration) && b.duration > 0), "duration must be positive seconds");
  check(p, Array.isArray(b.must_show ?? []), "must_show must be a list");
  check(p, Array.isArray(b.evidence_refs ?? []), "evidence_refs must be a list");
  check(p, b.approval_mode == null || APPROVAL_MODES.includes(b.approval_mode), `approval_mode must be one of ${APPROVAL_MODES.join(", ")}`);
  return finish(p);
}

export const defaultStoryTreatment = (over = {}) => ({ schema_version: SCHEMA_VERSION, proposition: "", claims: [], beats: [], ...over });
export function validateStoryTreatment(s) {
  const p = [];
  if (!isObj(s)) return finish(["not an object"]);
  check(p, typeof s.proposition === "string" && s.proposition.trim(), "proposition is required");
  const ids = arr(s.beats).map((b) => b && b.id);
  check(p, ids.every((i) => typeof i === "string" && i), "every beat needs a stable id");
  check(p, new Set(ids).size === ids.length, "beat ids must be unique");
  return finish(p);
}

export const defaultLookContract = (over = {}) => ({ schema_version: SCHEMA_VERSION, name: "", palette: [], type: {}, motion_language: "", do: [], dont: [], ...over });
export function validateLookContract(l) {
  const p = [];
  if (!isObj(l)) return finish(["not an object"]);
  check(p, typeof l.name === "string" && l.name.trim(), "name is required");
  check(p, Array.isArray(l.palette ?? []), "palette must be a list");
  return finish(p);
}

// ids are stable: a beat/shot/panel keeps its id when reordered or retimed
export const defaultStoryboard = (over = {}) => ({ schema_version: SCHEMA_VERSION, timing_source: "estimate", beats: [], ...over });
export const TIMING_SOURCES = ["estimate", "voiceover", "music", "manual"];
export function validateStoryboard(sb) {
  const p = [];
  if (!isObj(sb)) return finish(["not an object"]);
  check(p, TIMING_SOURCES.includes(sb.timing_source), `timing_source must be one of ${TIMING_SOURCES.join(", ")}`);
  const seen = new Set();
  for (const b of arr(sb.beats)) {
    check(p, b && typeof b.id === "string" && b.id, "every beat needs an id");
    for (const s of arr(b && b.shots)) {
      check(p, s && typeof s.id === "string" && s.id, `beat ${b && b.id}: every shot needs an id`);
      for (const pn of arr(s && s.panels)) check(p, pn && typeof pn.id === "string" && pn.id, `shot ${s && s.id}: every panel needs an id`);
    }
    const ids = [b && b.id, ...arr(b && b.shots).flatMap((s) => [s && s.id, ...arr(s && s.panels).map((x) => x && x.id)])].filter(Boolean);
    for (const i of ids) { check(p, !seen.has(i), `duplicate id ${i}`); seen.add(i); }
  }
  return finish(p);
}

export const defaultWorkerPacket = (over = {}) => ({ schema_version: SCHEMA_VERSION, packet_id: "", stage: "", task: "", inputs: [], output_ref: "", allowed_paths: [], depends_on: [], budget: {}, ...over });
export function validateWorkerPacket(w) {
  const p = [];
  if (!isObj(w)) return finish(["not an object"]);
  check(p, typeof w.packet_id === "string" && w.packet_id, "packet_id is required");
  check(p, logicalStage(w.stage) !== null, "stage must be a known stage");
  check(p, typeof w.task === "string" && w.task.trim(), "task is required");
  check(p, Array.isArray(w.allowed_paths ?? []), "allowed_paths must be a list");
  return finish(p);
}

// idempotency_key: sending the same request twice must not make two revisions
// Plan 10 U3 (additive): pinned to the film/approval/build/render revision, a target (beat/shot/element/time range), the exact note, an optional region annotation,
// an intent category, the dependency impact (lib/impact.mjs) and a status. Old requests without these fields stay valid; lib/revision-intent.mjs builds the full one.
export const REVISION_REQUEST_STATUSES = ["requested", "accepted", "applied", "preview_ready", "rendered", "failed", "reverted", "stale", "conflicted"];
export const defaultRevisionRequest = (over = {}) => ({
  schema_version: SCHEMA_VERSION, idempotency_key: "", stage: "", target_ids: [], instruction: "", base_revision: null,
  pinned: { film: null, approval_revision: null, build_revision: null, render_revision_id: null, source_digest: null },
  target: { beat_id: null, shot_id: null, element_id: null, time_range: null }, annotation: null, intent_category: "general", impact: null, status: "requested", ...over });
export function validateRevisionRequest(r) {
  const p = [];
  if (!isObj(r)) return finish(["not an object"]);
  check(p, typeof r.idempotency_key === "string" && r.idempotency_key, "idempotency_key is required");
  check(p, logicalStage(r.stage) !== null, "stage must be a known stage");
  check(p, typeof r.instruction === "string" && r.instruction.trim(), "instruction is required");
  check(p, r.status == null || REVISION_REQUEST_STATUSES.includes(r.status), `status must be one of ${REVISION_REQUEST_STATUSES.join(", ")}`);
  check(p, r.pinned == null || isObj(r.pinned), "pinned must be an object");
  check(p, r.target == null || isObj(r.target), "target must be an object");
  return finish(p);
}
export const revisionKey = (r) => canonicalDigest({ stage: logicalStage(r && r.stage), target_ids: arr(r && r.target_ids).slice().sort(), instruction: str(r && r.instruction).trim(), base_revision: (r && r.base_revision) ?? null });

// Capability: five separate states, each with its own reason, so "not available" never hides "not permitted"
export const CAPABILITY_STATES = ["implemented", "available", "enabled", "permitted", "verified"];
export function defaultCapability(id, over = {}) {
  const c = { schema_version: SCHEMA_VERSION, id: str(id) };
  for (const s of CAPABILITY_STATES) c[s] = { value: false, reason: "" };
  for (const [k, v] of Object.entries(over)) if (CAPABILITY_STATES.includes(k)) c[k] = { value: !!(isObj(v) ? v.value : v), reason: str(isObj(v) ? v.reason : "") };
  return c;
}
export function validateCapability(c) {
  const p = [];
  if (!isObj(c)) return finish(["not an object"]);
  check(p, typeof c.id === "string" && c.id, "id is required");
  for (const s of CAPABILITY_STATES) {
    check(p, isObj(c[s]) && typeof c[s].value === "boolean", `${s}.value must be a boolean`);
    check(p, isObj(c[s]) && (c[s].value === true || (typeof c[s].reason === "string" && c[s].reason)), `${s} is false: give a reason`);
  }
  return finish(p);
}
export const usable = (c) => CAPABILITY_STATES.every((s) => c && c[s] && c[s].value === true);

export { STAGES };
