// Plan 06 V4: the provider protocol behind optional generated plates. video-generation.mjs (C4) is the CLI; lib/video-generation/ holds the jobs log and the
// adapters (a synthetic test provider and ComfyUI, the first configurable adapter). This module is the part that must not be improvised per adapter:
//
//   the interface    capabilities, estimate, consent, submit, status (poll), retrieve (collect), cancel, reconcile        -> checkProvider()
//   the outcome      a submit that times out may or may not have queued the job: that is `unknown_outcome`, never `failed`   -> classifySubmitError()
//                    The same job is queried (reconcile by client id); a blind resubmit never happens (the CLI refuses a new job while one is unknown)
//   consent          spend is consented per job; anything sensitive sent to a non-local provider needs its own explicit consent -> consentPolicy()
//   provenance       a generated plate is an IMMUTABLE cached asset: provider / model / workflow identity, input hashes, prompt, seed, rights,
//                    output checksum, duration and the actual cost when the provider reports one                                -> provenanceOf()
//   discovery        installed workflows and models are discovered from the provider (nodes, checkpoints), model licences from a reviewed ledger; nothing is assumed
//                    and a missing local model is a visible unavailable capability, never a silent download                    -> discoverComfy(), modelLicense()
//
// Nothing here touches the network unless a caller hands it a `call` function (discoverComfy / findByClient); no module-level side effects.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

// the job states of the C4 log, plus the one a timeout can leave behind. unknown_outcome is NOT terminal: it resolves by reconciling the same job.
export const JOB_STATES = ["requested", "awaiting-consent", "queued", "running", "preview-ready", "accepted", "delivery-ready", "failed", "cancelled", "unknown_outcome"];
export const TERMINAL_STATES = new Set(["failed", "cancelled", "delivery-ready"]);
export const isTerminal = (s) => TERMINAL_STATES.has(s);

// ---- the interface -------------------------------------------------------------------------------------------
export const PROVIDER_METHODS = ["available", "capabilities", "validate", "estimate", "submit", "poll", "collect", "cancel", "reconcile"];
export const PROVIDER_METHOD_ROLE = { available: "capability discovery (is it reachable / installed)", capabilities: "capability discovery (what it can do)", validate: "refuse a spec it cannot run", estimate: "cost estimate before consent", submit: "submit", poll: "status", collect: "retrieve", cancel: "cancel (only this job)", reconcile: "find a job of unknown outcome by its client id" };
export function checkProvider(p) {
  const missing = PROVIDER_METHODS.filter((m) => typeof (p && p[m]) !== "function");
  return { ok: !missing.length && typeof (p && p.id) === "string", missing };
}

// ---- unknown outcome -----------------------------------------------------------------------------------------
// the client id travels with the submitted prompt; it is how a job is found again after a timeout (ComfyUI keeps it in the queue and history entry's extra data)
export const clientIdFor = (idempotencyKey) => "rasanai-" + String(idempotencyKey).slice(0, 16);
// -> { outcome: "not_submitted" | "rejected" | "unknown", why }
//   not_submitted: the request never connected (refused / no route): nothing was queued
//   rejected:      the provider answered with an error status: it did not queue the job
//   unknown:       a timeout, a reset after the request left, a reply that could not be read: the job may be queued. Query it; do not resubmit.
export function classifySubmitError(e) {
  if (e && e.rejected) return { outcome: "rejected", why: "the provider answered with an error and did not queue the job" };
  const code = (e && ((e.cause && e.cause.code) || e.code)) || "";
  if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"].includes(code)) return { outcome: "not_submitted", why: `the provider could not be reached (${code}): nothing was sent` };
  return { outcome: "unknown", why: `no usable answer (${code || (e && e.name) || "error"}): the job may already be queued` };
}
// scan queue + history items for a client id. items: ComfyUI queue rows [number, prompt_id, graph, extra_data, outputs] and history map entries.
export function findByClient({ queue_running = [], queue_pending = [], history = {} } = {}, clientId) {
  const hit = (extra) => isObj(extra) && extra.client_id === clientId;
  for (const [state, rows] of [["running", queue_running], ["queued", queue_pending]]) for (const r of rows || []) if (Array.isArray(r) && hit(r[3])) return { found: true, provider_job_id: r[1], state };
  for (const [pid, e] of Object.entries(history || {})) {
    const row = e && e.prompt;
    if (Array.isArray(row) && hit(row[3])) return { found: true, provider_job_id: pid, state: e.status && e.status.status_str === "error" ? "failed" : "history" };
  }
  return { found: false };
}
// what the CLI records / says for an unresolved job: evidence searched, never a guess
export const unknownNote = (searched) => `unknown outcome: ${searched.length ? "searched " + searched.join(" and ") + " for this job's client id without finding it" : "not yet searched"}; it may still be queued. Run status to reconcile; do not resubmit.`;

// ---- consent -------------------------------------------------------------------------------------------------
// provider: { id, ep?: { loopback } }, spec: { refs: [{sha256, rights}], prompt }, flags: { consent, shareInputs }
// Spend and use of the provider are consented per job (`consent`). Anything that leaves the machine for a hosted (non-loopback, non-synthetic) provider is a
// second, explicit consent: reference images and footage, and the prompt when the person marked it sensitive.
export function consentPolicy(provider, spec, flags = {}) {
  const local = provider.id === "fake" || !!(provider.ep && provider.ep.loopback);
  const sends = [];
  if (!local) { sends.push("prompt text"); for (const r of (spec && spec.refs) || []) sends.push(`reference input ${String(r.sha256).slice(0, 12)} (${r.rights})`); }
  const need_input_consent = !local && ((spec && spec.refs && spec.refs.length > 0) || !!(spec && spec.sensitive));
  const missing = [];
  if (!flags.consent) missing.push("consent (provider use and cost estimate)");
  if (need_input_consent && !flags.shareInputs) missing.push("consent to send your inputs to a hosted provider (--consent-share-inputs)");
  return { local, leaves_machine: sends, need_input_consent, ok: !missing.length, missing };
}

// ---- model licences and discovery ---------------------------------------------------------------------------
// hybrid/model-licences.json (also accepted: model-licenses.json): { schema_version, models: [{ name, sha256?, license, commercial_use: "yes"|"no"|"unknown", source, reviewed_by, reviewed_at }] }
// Written by a person. No record = unreviewed; nothing is guessed from a model's name.
export function modelLicense(film, modelName, modelSha) {
  for (const f of ["model-licenses.json", "model-licences.json"]) {
    const p = path.join(film, "hybrid", f);
    if (!fs.existsSync(p)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      const m = (j.models || []).find((x) => (modelSha && x.sha256 === modelSha) || (x.name && x.name === modelName));
      if (m) return { status: "reviewed", license: String(m.license || "unspecified"), commercial_use: m.commercial_use || "unknown", source: m.source || null, reviewed_by: m.reviewed_by || null, reviewed_at: m.reviewed_at || null };
    } catch { return { status: "unreadable", license: null, note: `${f} is not valid JSON` }; }
  }
  return { status: "unreviewed", license: null, commercial_use: "unknown", note: "no reviewed licence record for this model; the weights' own licence applies and none is assumed" };
}
// call(path) -> parsed JSON (the caller owns the HTTP and its timeout). workflows: lib/video-generation/workflows.mjs approved() rows { id, allowed_nodes, ... }
// -> { reachable, nodes_missing_by_workflow, checkpoints, workflows: [{ id, runnable, missing_nodes }] }; a missing model is reported, never fetched.
export async function discoverComfy(call, workflows = []) {
  let info;
  try { info = await call("/object_info"); } catch (e) { return { reachable: false, reason: `ComfyUI did not answer /object_info (${(e && e.cause && e.cause.code) || (e && e.name) || "error"})`, workflows: workflows.map((w) => ({ id: w.id, runnable: false, missing_nodes: [], reason: "provider unreachable" })), checkpoints: null }; }
  const have = new Set(Object.keys(isObj(info) ? info : {}));
  let checkpoints = null;
  const ck = isObj(info) && info.CheckpointLoaderSimple && info.CheckpointLoaderSimple.input && info.CheckpointLoaderSimple.input.required && info.CheckpointLoaderSimple.input.required.ckpt_name;
  if (Array.isArray(ck) && Array.isArray(ck[0])) checkpoints = ck[0];
  return {
    reachable: true, checkpoints,
    workflows: workflows.map((w) => { const missing = (w.allowed_nodes || []).filter((n) => !have.has(n)); return { id: w.id, runnable: !missing.length && !!(checkpoints && checkpoints.length), missing_nodes: missing, reason: missing.length ? `ComfyUI lacks node types: ${missing.join(", ")}` : checkpoints && checkpoints.length ? "" : "no checkpoint installed; RasanAI never downloads one" }; }),
  };
}

// ---- provenance ----------------------------------------------------------------------------------------------
// The fields an accepted plate must carry (V4). The plate is immutable: a regenerated plate is a NEW job id with its own checksum; this record is written once.
export const PROVENANCE_REQUIRED = ["provider", "model_id", "workflow_digest", "prompt", "input_hashes", "config", "rights", "output", "duration_s", "cost", "immutable"];
export function provenanceOf(job, { outputSha, outputPath, frames, ledger = null, actualCost = null }) {
  const c = job.config || {};
  return {
    provider: job.provider, model_id: job.model_id, model_revision: job.model_revision ?? null, workflow_id: job.workflow_id ?? null, workflow_digest: job.workflow_digest,
    prompt: job.prompt, negative_prompt: (job.params && job.params.negative_prompt) || null,
    input_hashes: { prompt_sha256: sha(String(job.prompt || "")), negative_sha256: sha(String((job.params && job.params.negative_prompt) || "")), graph_digest: job.graph_digest || null, references: (job.reference_inputs || []).map((r) => r.sha256) },
    config: { seed: c.seed ?? null, aspect: c.aspect ?? null, duration_s: c.duration_s ?? null, width: c.width ?? null, height: c.height ?? null, fps_num: c.fps_num ?? null, fps_den: c.fps_den ?? null },
    seed_repeatability: "requested; not guaranteed across a model or backend change. The accepted output itself is stored.",
    rights: { output: "generated", reference_inputs: (job.reference_inputs || []).map((r) => ({ sha256: r.sha256, rights: r.rights })), model_license: ledger || { status: "unreviewed", license: null } },
    output: { path: outputPath, sha256: outputSha }, duration_s: c.duration_s ?? null, frames: frames ?? null,
    cost: { estimate: job.cost_estimate ?? null, actual: actualCost },
    provider_job_id: job.provider_job_id ?? null, immutable: true, schema_version: SCHEMA_VERSION,
  };
}
export function validateProvenance(a) {
  const p = [];
  if (!isObj(a)) return { ok: false, problems: ["not an object"] };
  for (const k of PROVENANCE_REQUIRED) if (a[k] === undefined) p.push(`missing ${k}`);
  if (isObj(a.output) && !/^[0-9a-f]{64}$/.test(String(a.output.sha256 || ""))) p.push("output.sha256 must be a sha256");
  if (a.immutable !== true) p.push("a generated plate is immutable (immutable: true)");
  if (isObj(a.cost) && a.cost.actual === undefined) p.push("cost.actual must be present (null when the provider reports none)");
  if (JSON.stringify(a).match(/\/Users\/|\/home\/[a-z]|Bearer\s/)) p.push("a private path or token leaked into the record");
  return { ok: !p.length, problems: p };
}
// write-once: refuses to replace an existing record whose output differs
export function writeOnce(file, record) {
  if (fs.existsSync(file)) {
    const cur = JSON.parse(fs.readFileSync(file, "utf8"));
    if (cur && cur.output && record.output && cur.output.sha256 !== record.output.sha256) return { ok: false, error: "asset.json already exists with a different output: accepted plates are immutable; regenerate as a new job" };
    return { ok: true, written: false, record: cur };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  return { ok: true, written: true, record };
}
export const jobDigest = (job) => canonicalDigest({ p: job.provider, w: job.workflow_digest, prompt: job.prompt, c: job.config, refs: job.reference_inputs });
