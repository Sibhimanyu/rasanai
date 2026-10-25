// Artifact cache INTERFACE (Plan 08 K5). Plan 09 supplies the concrete store and the render dependency graph; this module fixes the
// key and the validation so nothing Plan 09 builds can accept a hit more loosely than this. No files are read or written here.
//
// Three layers, kept apart:
//   1. artifact cache      (this file): skip a model invocation when the same authorized inputs already have a valid ACCEPTED result
//   2. runtime/component reuse: established renderer and layout code (RasanShape, RasanUI, motion-kit) is reused, not regenerated; that is NOT a
//                           token guarantee, so the repair rate and the usage are measured (lib/usage.mjs), never assumed
//   3. provider prompt cache: stable shared material is placed before task input in the packet (lib/packets.mjs `prompt_cache`); counters are
//                           recorded only if the harness reports them (lib/usage.mjs cache_creation / cache_read, null when unreported).
//                           No direct-API key path is added for subscription CLI users to obtain caching.
// Rules the validator enforces: a hit needs every dependency digest to still match; freshness; authorization; the same scope (project/user);
// the same policy/recipe/model configuration; a still-current approval. Reusing an artifact is never a creative approval. A provider
// submission is never replayed (see JOB_TYPES): only its immutable OUTPUT can be reused.
import { canonicalDigest } from "./contracts.mjs";
import { freshness } from "./evidence-records.mjs";

export const CACHE_SCHEMA = 1;
// what kind of thing is cached decides whether a hit is even possible
export const JOB_TYPES = Object.freeze({
  pure_artifact: { cacheable: true, note: "a deterministic or accepted artifact derived from declared inputs (a packet, a projection, an extraction)" },
  immutable_media: { cacheable: true, note: "generated or rendered media with a recorded checksum and provenance" },
  provider_submission: { cacheable: false, note: "a remote job: never replayed, never treated as proof a new job exists. unknown_outcome is reconciled by its client id (lib/provider-jobs.mjs), not resubmitted" },
  tool_side_effect: { cacheable: false, note: "an arbitrary model/tool side effect is not a pure function of its inputs" },
});

// scope keeps private material out of other projects and users; `shared` is only for material with no private source
export const SCOPES = ["project", "user", "shared"];

// every material input changes the key. Order-insensitive for sets, secrets and temp paths and timestamps excluded by construction (only digests go in).
export function cacheKey(o = {}) {
  const inputs = (Array.isArray(o.inputs) ? o.inputs : []).map((i) => ({ ref: String(i.ref || ""), digest: i.digest ?? null, revision: i.revision ?? null })).sort((a, b) => a.ref.localeCompare(b.ref));
  const body = {
    v: CACHE_SCHEMA, job_type: o.job_type || "pure_artifact", task: o.task || "",
    inputs,
    policy_digest: o.policy_digest || null, recipe_versions: o.recipe_versions || {}, packet_version: o.packet_version ?? null,
    model_config: o.model_config || null, // null where the model does not matter (a deterministic extraction)
    approval_digest: o.approval_digest || null, // the approval state the result was accepted under
    tool_versions: o.tool_versions || {},
    scope: { kind: o.scope && o.scope.kind || "project", project: o.scope && o.scope.project || null, user: o.scope && o.scope.user || null },
  };
  return { key: canonicalDigest(body), body };
}

// entry: { key, job_type, scope, accepted:true, dependencies:[{ref,digest}], approval_digest, rights:{authorized:boolean, revoked:boolean}, source:{fact_kind, retrieved_at}, output:{path,digest}, provider:{status} }
// wanted: the same shape of `cacheKey` options plus { current_dependencies:[{ref,digest}], current_approval_digest, authorization: {allowed: boolean} }
// -> { ok:boolean, reasons:[...], reuse_is_approval:false }. A cache hit is accepted only when ok is true.
export function validateHit(entry, wanted = {}, { now = Date.now() } = {}) {
  const reasons = [];
  if (!entry) return { ok: false, reasons: ["no entry"], reuse_is_approval: false };
  const jt = JOB_TYPES[entry.job_type];
  if (!jt) reasons.push(`unknown job_type ${JSON.stringify(entry.job_type)}`);
  else if (!jt.cacheable) reasons.push(`${entry.job_type} is never replayed from cache`);
  if (entry.provider && /unknown_outcome|submitted|queued|running/.test(String(entry.provider.status || ""))) reasons.push("provider outcome is not final: reconcile the existing job, never resubmit or reuse");
  if (entry.accepted !== true) reasons.push("the stored result was never accepted");
  const want = cacheKey(wanted);
  if (entry.key !== want.key) reasons.push("key differs: an input, policy, recipe, model configuration, packet version or approval changed");
  const es = entry.scope || {}, ws = want.body.scope;
  if (es.kind !== ws.kind || (es.project || null) !== (ws.project || null) || (es.user || null) !== (ws.user || null)) reasons.push("scope differs: private material is never returned to another project or user");
  // dependency validation: every declared dependency must still have the digest it had; an undeclared or missing one falls back to a miss
  const cur = new Map((wanted.current_dependencies || []).map((d) => [d.ref, d.digest]));
  const deps = Array.isArray(entry.dependencies) ? entry.dependencies : null;
  if (!deps) reasons.push("no dependency declaration: conservative miss");
  else for (const d of deps) {
    if (!cur.has(d.ref)) reasons.push(`dependency ${d.ref} cannot be checked now`);
    else if (cur.get(d.ref) !== d.digest) reasons.push(`dependency ${d.ref} changed`);
  }
  if (entry.approval_digest && wanted.current_approval_digest !== entry.approval_digest) reasons.push("the approval it was accepted under is superseded or not current");
  if (entry.rights && (entry.rights.revoked || entry.rights.authorized === false)) reasons.push("rights or authorization no longer hold");
  if (wanted.authorization && wanted.authorization.allowed === false) reasons.push("this project or user is not authorized to use the cached material");
  if (entry.source) { const f = freshness(entry.source, { now }); if (!f.fresh) reasons.push(f.reason); }
  return { ok: reasons.length === 0, reasons, reuse_is_approval: false, why: reasons.length ? null : "same key, scope, dependency digests, current approval, fresh and authorized" };
}

// the contract a concrete store (Plan 09) implements
export const STORE_METHODS = ["get", "put", "invalidate", "pin", "stats"];
export function checkStore(store) {
  const missing = STORE_METHODS.filter((m) => !store || typeof store[m] !== "function");
  return { ok: !missing.length, missing };
}
// a lookup that can only return a validated hit: the store supplies `get(key)`, this decides
export function lookupValidated(store, wanted, opts) {
  const { key } = cacheKey(wanted);
  const entry = store && typeof store.get === "function" ? store.get(key) : null;
  const v = validateHit(entry, wanted, opts);
  return { key, hit: v.ok ? entry : null, decision: v };
}
