// Resumable, fenced production jobs (Plan 09 P4) and budget reservations (P9). File-based, like the rest of crew/: <run>/crew/jobs/*.json, one writer at a time under a strict lock.
//
// A job record: { job_id, node_id, kind, role, job_type, input_digest, approval_digest, state, attempt, generation, lease:{owner, token, pid, pid_start, acquired_at, heartbeat_at},
//   checkpoint, outputs:[{path, digest, size}], provider:{client_id, id, status}, retries:{count, max, next_after}, cancel:{requested, reason}, history:[...] }
//
// The rules this file enforces (no model involved):
//   - the lead's acceptance is COMPARE-AND-SWAP: commit() succeeds only for the current `generation`, the lease `token`, and the input digest the job was created for, which must
//     still equal the CURRENT input digest the lead passes. A worker that was paused, replaced (supersede/claim after loss) and woke up fails the generation check; its staged
//     output and its log are preserved under crew/jobs/rejected/ and attempts/, never published.
//   - a heartbeat only extends a lease; it never authorizes publication. Reclaiming a lease checks owner IDENTITY (pid gone, or the pid now belongs to another process); an
//     expired heartbeat with a live owner is NOT reclaimed: the lead supersedes it explicitly (which bumps the generation and fences the old worker).
//   - outputs are staged in a private temp dir and published by atomic rename only after the ownership check, inside the lock.
//   - transient failures retry with bounded exponential backoff. A provider submission is NEVER blindly repeated: intent and client id are persisted BEFORE the call; an outcome that
//     is unknown becomes `unknown_outcome` and is reconciled by client id (lib/provider-jobs.mjs), never resubmitted without explicit approval.
//   - cancelObsolete() cancels LOCAL work whose inputs an upstream revision invalidated (and fences it); a provider job on a shared external queue is not interrupted, only
//     marked for reconciliation.
// Budget: reserveBudget / reconcileBudget keep one ledger of reservations drawn from the SAME remaining allowance under one lock; idempotent by operation id, so a retry never
// gets a second reservation; unknown subscription usage stays unknown and caps concurrency instead of inventing precision.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { acquire as lockAcquire, release as lockRelease } from "./runlock.mjs";
import { canonicalDigest } from "./contracts.mjs";
import { JOB_TYPES } from "./artifact-cache.mjs";
import { clientIdFor } from "./provider-jobs.mjs";
import { redact } from "./redact.mjs"; // Plan 11 R4: logs and history carry no credentials or personal paths

export const JOB_SCHEMA = 1;
export const JOB_STATES = Object.freeze(["pending", "leased", "running", "retry_wait", "completed", "failed", "cancelled", "unknown_outcome", "superseded"]);
export const ACTIVE = new Set(["leased", "running"]);
export const MAX_RETRIES = 3, BACKOFF_BASE_S = 5, BACKOFF_FACTOR = 3, BACKOFF_CAP_S = 300; // proposed starting values, calibrated in Plan 14

const jobsDir = (run) => path.join(path.resolve(String(run)), "crew", "jobs");
const jobFile = (run, id) => path.join(jobsDir(run), `${String(id).replace(/[^A-Za-z0-9_.-]+/g, "-")}.json`);
const lockFile = (run) => path.join(jobsDir(run), ".lock");
const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const nowIso = () => new Date().toISOString();
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const pidStart = (pid) => { try { const t = String(spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).stdout || "").trim(); return t || null; } catch { return null; } };
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
  const fd = fs.openSync(tmp, "w"); try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };

// Strict: runlock.withLock goes on WITHOUT the lock after its timeout (right for a console file, wrong for a CAS). Here a lock we cannot take is an error the caller queues on.
function withStrictLock(run, fn, timeoutMs = 8000) {
  fs.mkdirSync(jobsDir(run), { recursive: true });
  if (!lockAcquire(lockFile(run), timeoutMs)) { const e = new Error("the jobs lock could not be taken"); e.reason_code = "lock_unavailable"; e.state = "queued"; throw e; }
  try { return fn(); } finally { lockRelease(lockFile(run)); }
}
const logLine = (run, id, attempt, text) => { try { fs.mkdirSync(path.join(jobsDir(run), "attempts"), { recursive: true }); fs.appendFileSync(path.join(jobsDir(run), "attempts", `${id}-a${attempt}.log`), `${nowIso()} ${redact(String(text)).slice(0, 2000)}\n`); } catch {} };
const hist = (rec, ev, extra = {}) => { rec.history = [...(rec.history || []).slice(-39), { at: nowIso(), ev, attempt: rec.attempt, generation: rec.generation, ...extra }]; };

// a stable id for the same operation: the same node on the same inputs under the same approval is the SAME job (a re-plan or a retry never duplicates it)
// V3 (W06): an optional `identity_digest` (continuity identity: object/event/score digests of the job's group, lib/continuity-plan.mjs) joins the id ONLY when given, so a legacy id is byte-identical.
export const jobIdFor = ({ node_id, input_digest, approval_digest = null, identity_digest = null }) => "j-" + canonicalDigest(identity_digest ? { n: node_id, i: input_digest, a: approval_digest, c: identity_digest } : { n: node_id, i: input_digest, a: approval_digest }).slice(0, 14);

// spec: { node_id, kind, role, job_type, input_digest, approval_digest, local (a local process the supervisor may kill), max_retries, resource_class, est,
//         continuity?: { group_id, owner, depends_on:[job_id|node_id], identity_digest, event_ids, object_ids, shots } }  (V3, additive; `spec.group_id` / `spec.depends_on` / `spec.identity_digest` are accepted as shorthand)
// Edges are DATA the planner (lib/continuity-plan.mjs planContinuity) produced; jobs.mjs never dispatches: dependencyState() only reports whether a job's edges are met.
const sarr = (x) => (Array.isArray(x) ? x.map(String) : []);
function continuityField(spec) {
  const c = spec.continuity && typeof spec.continuity === "object" ? spec.continuity : {};
  const group_id = c.group_id ?? spec.group_id ?? null, owner = c.owner ?? spec.owner ?? null, identity_digest = c.identity_digest ?? spec.identity_digest ?? null;
  const depends_on = sarr(c.depends_on ?? spec.depends_on);
  if (!group_id && !owner && !identity_digest && !depends_on.length && !spec.continuity) return null;
  return { group_id: group_id && String(group_id), owner: owner && String(owner), identity_digest: identity_digest || null, depends_on, event_ids: sarr(c.event_ids), object_ids: sarr(c.object_ids), shots: sarr(c.shots) };
}
export function createJob(run, spec) {
  if (!spec || !spec.node_id || !spec.input_digest) throw new Error("a job needs node_id and input_digest");
  const jt = spec.job_type || "pure_artifact";
  if (!JOB_TYPES[jt]) throw new Error(`unknown job_type ${JSON.stringify(jt)}`);
  const id = spec.job_id || jobIdFor(spec);
  return withStrictLock(run, () => {
    const cur = rj(jobFile(run, id));
    if (cur) return { created: false, job: cur }; // idempotent: same operation
    const rec = { schema_version: JOB_SCHEMA, job_id: id, node_id: spec.node_id, kind: spec.kind || null, role: spec.role || null, key: spec.key || null, approvals: Array.isArray(spec.approvals) ? spec.approvals : [], digest_basis: spec.digest_basis || null, job_type: jt, resource_class: spec.resource_class || null, local: spec.local !== false,
      input_digest: spec.input_digest, approval_digest: spec.approval_digest || null, state: "pending", attempt: 0, generation: 0, lease: null, checkpoint: null, outputs: [], provider: null,
      retries: { count: 0, max: Number.isInteger(spec.max_retries) ? spec.max_retries : MAX_RETRIES, next_after: null }, cancel: { requested: false, reason: null }, est: spec.est || null, created_at: nowIso(), history: [] };
    const cont = continuityField(spec); if (cont) rec.continuity = cont; // V3: absent on a legacy job
    hist(rec, "created");
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    return { created: true, job: rec };
  });
}
export const readJob = (run, id) => rj(jobFile(run, id));
export function listJobs(run) { try { return fs.readdirSync(jobsDir(run)).filter((f) => f.endsWith(".json")).map((f) => rj(path.join(jobsDir(run), f))).filter(Boolean); } catch { return []; } }

// owner identity: is the process that holds this lease still the same live process?
export function leaseOwnerAlive(lease) {
  if (!lease || !Number.isInteger(lease.pid)) return false;
  if (!alive(lease.pid)) return false;
  if (lease.pid_start) { const now = pidStart(lease.pid); if (now && now !== lease.pid_start) return false; } // the pid was reused by another process
  return true;
}

// claim: pending / retry_wait (after its backoff) / lease whose owner IDENTITY is gone. A live owner keeps its lease no matter how old its heartbeat is.
export function claim(run, id, { owner, pid = process.pid, now = Date.now() } = {}) {
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!rec) return { ok: false, reason: "no_such_job" };
    if (rec.cancel && rec.cancel.requested) return { ok: false, reason: "cancelled", state: rec.state };
    if (rec.state === "unknown_outcome") return { ok: false, reason: "unknown_outcome", note: "reconcile the provider job by its client id; never resubmit" };
    if (["completed", "failed", "cancelled", "superseded"].includes(rec.state)) return { ok: false, reason: `terminal_${rec.state}` };
    if (rec.publishing) return { ok: false, reason: "publication_unreconciled", note: "an earlier attempt died while publishing its outputs: run recovery (jobs.recoverPublication) before this job is claimed again" }; // Plan 11 R1/R8
    if (rec.hold) return { ok: false, reason: "held", hold: rec.hold, note: "paused safely (for example a spend limit); the person releases it by requeueing" };
    if (rec.state === "retry_wait" && rec.retries.next_after && now < Date.parse(rec.retries.next_after)) return { ok: false, reason: "backoff", retry_after: rec.retries.next_after };
    if (ACTIVE.has(rec.state) && leaseOwnerAlive(rec.lease)) return { ok: false, reason: "lease_held", owner: rec.lease.owner, generation: rec.generation };
    const reclaimed = ACTIVE.has(rec.state);
    if (reclaimed) logLine(run, id, rec.attempt, `lease of ${rec.lease && rec.lease.owner} reclaimed: owner process is gone (identity check), generation ${rec.generation} fenced`);
    delete rec.interrupted;
    rec.generation += 1; rec.attempt += 1; // the generation is the fencing token: every claim, supersede and cancel moves it
    rec.lease = { owner: owner || `pid-${pid}`, token: crypto.randomBytes(8).toString("hex"), pid, pid_start: pidStart(pid), acquired_at: nowIso(), heartbeat_at: nowIso() };
    rec.state = "leased";
    hist(rec, reclaimed ? "reclaimed" : "claimed", { owner: rec.lease.owner });
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    logLine(run, id, rec.attempt, `claimed by ${rec.lease.owner} at generation ${rec.generation}`);
    return { ok: true, job: rec, lease: { generation: rec.generation, token: rec.lease.token, attempt: rec.attempt } };
  });
}
const current = (rec, lease) => rec && lease && rec.generation === lease.generation && rec.lease && rec.lease.token === lease.token;

// a heartbeat extends the lease and records a checkpoint; it NEVER authorizes publication
export function heartbeat(run, id, lease, { checkpoint } = {}) {
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!current(rec, lease)) return { ok: false, stale: true, reason: "stale_generation" };
    if (rec.cancel.requested) return { ok: false, cancelled: true, reason: "cancelled" };
    rec.lease.heartbeat_at = nowIso(); rec.state = "running";
    if (checkpoint !== undefined) rec.checkpoint = checkpoint;
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    return { ok: true };
  });
}

// a private staging directory for ONE attempt; the worker writes outputs here, never into the film
export function stageDir(run, id, lease) {
  const d = path.join(jobsDir(run), "staging", `${String(id).replace(/[^A-Za-z0-9_.-]+/g, "-")}-g${lease.generation}-${crypto.randomBytes(3).toString("hex")}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const inside = (root, rel) => { const abs = path.resolve(root, rel), r = path.relative(path.resolve(root), abs); return r && !r.startsWith("..") && !path.isAbsolute(r) ? abs : null; };
const sha256File = (f) => { const h = crypto.createHash("sha256"), fd = fs.openSync(f, "r"), b = Buffer.alloc(1 << 20); try { for (let n; (n = fs.readSync(fd, b, 0, b.length)) > 0;) h.update(b.subarray(0, n)); } finally { fs.closeSync(fd); } return h.digest("hex"); };

function rejectStaged(run, id, lease, staged, reason, rec) {
  const dest = path.join(jobsDir(run), "rejected", `${String(id).replace(/[^A-Za-z0-9_.-]+/g, "-")}-g${lease && lease.generation}-${Date.now()}`);
  try { fs.mkdirSync(path.dirname(dest), { recursive: true }); if (staged && fs.existsSync(staged)) fs.renameSync(staged, dest); fs.writeFileSync(path.join(fs.existsSync(dest) ? dest : path.dirname(dest), `.rejected-${Date.now()}.json`), JSON.stringify({ job_id: id, reason, attempted: lease || null, current_generation: rec ? rec.generation : null, at: nowIso() }, null, 2)); } catch {}
  if (rec) logLine(run, id, lease ? rec.attempt : 0, `REJECTED stale/invalid commit (${reason}); staged output kept at ${path.relative(run, dest)}`);
}

// the lead's acceptance. outputs: [{ staged: <path inside staged_dir>, publish_to: <path relative to the run> }]
// current_input_digest: what the inputs digest to NOW (the lead computes it); a mismatch means an upstream revision landed while the worker ran.
export function commit(run, id, lease, { staged_dir, outputs = [], current_input_digest, current_approval_digest, current_identity_digest, provider = null } = {}) {
  // hashing a large render is slow and the lock must stay short (runlock reclaims a lock after 10 s): the staged files are private to this attempt, so they are measured BEFORE the lock
  const manifest = [], problems = [];
  for (const o of outputs) {
    const src = staged_dir ? inside(staged_dir, o.staged) : null, dst = inside(run, o.publish_to);
    if (!src || !fs.existsSync(src)) { problems.push(["missing_staged_output", o.staged]); continue; }
    if (!dst) { problems.push(["publish_path_outside_run", o.publish_to]); continue; }
    manifest.push({ src, dst, path: o.publish_to, digest: sha256File(src), size: fs.statSync(src).size });
  }
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!rec) return { ok: false, reason: "no_such_job" };
    const reject = (reason, extra = {}) => { rejectStaged(run, id, lease, staged_dir, reason, rec); return { ok: false, reason, rejected_kept: true, ...extra }; };
    if (!current(rec, lease)) return reject("stale_generation", { expected_generation: rec.generation, got_generation: lease && lease.generation });
    if (!ACTIVE.has(rec.state)) return reject(`not_running:${rec.state}`);
    if (rec.cancel.requested) return reject("cancelled");
    if (current_input_digest !== undefined && current_input_digest !== rec.input_digest) return reject("input_changed", { expected: rec.input_digest, now: current_input_digest });
    if (current_identity_digest !== undefined && rec.continuity && rec.continuity.identity_digest && current_identity_digest !== rec.continuity.identity_digest) return reject("identity_changed", { expected: rec.continuity.identity_digest, now: current_identity_digest }); // V3: a result built on an old object/event/score identity is stale even if the filename matches
    if (rec.approval_digest && current_approval_digest !== undefined && current_approval_digest !== rec.approval_digest) return reject("approval_superseded");
    if (problems.length) return reject(problems[0][0], { path: problems[0][1] });
    // ownership holds (we own the lock and the generation cannot move now): publish by atomic rename (copy + rename only across volumes)
    // Plan 11 R1/R8: the intent (every destination and its post-state digest) is on disk BEFORE the first rename, and a replaced file is kept as a hard link, so a process that dies
    // between two renames leaves something recoverPublication() can finish or roll back, never a half-published "completed" job.
    rec.publishing = { generation: rec.generation, started_at: nowIso(), outputs: manifest.map((m) => ({ path: m.path, digest: m.digest, size: m.size, had_prior: fs.existsSync(m.dst) })) };
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    for (const m of manifest) {
      fs.mkdirSync(path.dirname(m.dst), { recursive: true });
      if (fs.existsSync(m.dst)) { try { const pd = priorPath(run, id, rec.generation, m.path); fs.mkdirSync(path.dirname(pd), { recursive: true }); fs.rmSync(pd, { force: true }); fs.linkSync(m.dst, pd); } catch {} }
      try { fs.renameSync(m.src, m.dst); }
      catch (e) {
        if (e.code !== "EXDEV") throw e;
        const tmp = `${m.dst}.pub-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
        fs.copyFileSync(m.src, tmp);
        const fd = fs.openSync(tmp, "r+"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(tmp, m.dst);
      }
    }
    rec.outputs = manifest.map(({ path: p, digest, size }) => ({ path: p, digest, size }));
    rec.state = "completed"; rec.lease = { ...rec.lease, released_at: nowIso() }; rec.completed_generation = rec.generation;
    rec.completion = { basis: "output_manifest", at: nowIso() }; delete rec.publishing;
    if (provider) rec.provider = { ...(rec.provider || {}), ...provider };
    hist(rec, "completed", { outputs: rec.outputs.length });
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    if (staged_dir) fs.rmSync(staged_dir, { recursive: true, force: true });
    logLine(run, id, rec.attempt, `committed ${rec.outputs.length} output(s) at generation ${rec.generation}`);
    return { ok: true, outputs: rec.outputs, generation: rec.generation };
  });
}

// Acceptance for AGENT work. An agent writes its files where the crew expects them (it cannot stage a whole run), so the fence is at the lead's acceptance: crew.mjs check calls this
// with the generation and token the Director was given at claim time. A superseded, cancelled or input-stale attempt is refused (and logged); the accepted files are recorded by digest.
export function accept(run, id, lease, { current_input_digest, current_approval_digest, current_identity_digest, outputs = [] } = {}) {
  const manifest = [];
  for (const rel of outputs) { const abs = inside(run, rel); if (abs && fs.existsSync(abs) && fs.statSync(abs).isFile()) manifest.push({ path: rel, digest: sha256File(abs), size: fs.statSync(abs).size }); else manifest.push({ path: rel, digest: null, size: null, missing: true }); }
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!rec) return { ok: false, reason: "no_such_job" };
    const refuse = (reason, extra = {}) => { logLine(run, id, rec.attempt, `acceptance REFUSED (${reason}) for generation ${lease && lease.generation}; current generation ${rec.generation}`); return { ok: false, reason, ...extra }; };
    if (!current(rec, lease)) return refuse("stale_generation", { expected_generation: rec.generation });
    if (!ACTIVE.has(rec.state)) return refuse(`not_running:${rec.state}`);
    if (rec.cancel.requested) return refuse("cancelled");
    if (current_input_digest !== undefined && current_input_digest !== rec.input_digest) return refuse("input_changed", { expected: rec.input_digest, now: current_input_digest });
    if (current_identity_digest !== undefined && rec.continuity && rec.continuity.identity_digest && current_identity_digest !== rec.continuity.identity_digest) return refuse("identity_changed", { expected: rec.continuity.identity_digest, now: current_identity_digest });
    if (rec.approval_digest && current_approval_digest !== undefined && current_approval_digest !== rec.approval_digest) return refuse("approval_superseded");
    const missing = manifest.filter((m) => m.missing).map((m) => m.path);
    if (missing.length) return refuse("output_missing", { missing }); // Plan 11 R1: a listed output that is not on disk is not a success
    rec.completion = { basis: outputs.length ? "output_manifest" : "role_check_only", at: nowIso() }; // role_check_only: the lead's check passed but no file manifest was supplied; recovery reports it as such
    rec.outputs = manifest; rec.state = "completed"; rec.lease = { ...rec.lease, released_at: nowIso() }; rec.completed_generation = rec.generation;
    hist(rec, "accepted", { outputs: manifest.length });
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    logLine(run, id, rec.attempt, `accepted at generation ${rec.generation}`);
    return { ok: true, outputs: manifest, generation: rec.generation };
  });
}

// ---- failure, retry, providers ------------------------------------------------------------------------------------------------------
export const backoffS = (n) => Math.min(BACKOFF_CAP_S, BACKOFF_BASE_S * BACKOFF_FACTOR ** Math.max(0, n)); // deterministic: 5, 15, 45, 135, 300 s
// pure: what may happen next to a failed job
export function retryDecision(rec, { explicit_approval = false } = {}) {
  if (!rec) return { action: "stop", why: "no job" };
  if (rec.state === "unknown_outcome") return explicit_approval ? { action: "retry", why: "the person approved a possible duplicate (cost and work noted)" } : { action: "reconcile", why: "the provider outcome is unknown: look the job up by its client id; do not resubmit" };
  if (rec.cancel && rec.cancel.requested) return { action: "stop", why: "cancelled" };
  if (rec.retries.count >= rec.retries.max) return { action: "stop", why: `retry budget (${rec.retries.max}) used` };
  return { action: "retry", after_s: backoffS(rec.retries.count), why: "transient failure, bounded backoff" };
}
// transient: a failure worth retrying (a crash, a timeout before any provider submission). provider_in_flight: a submission was made (or may have been) and no result came back.
// category (Plan 11 R2, lib/recovery.mjs classifyFailure): transient | permission | invalid_input | budget | permanent | rate_limit. A budget failure PAUSES the job (hold) without using a retry and without
// deleting anything; permission / invalid_input / permanent never retry on their own; none of them is "fixed" by granting broader tools.
export function fail(run, id, lease, { error = "", transient = true, provider_in_flight = false, category = null } = {}) {
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!current(rec, lease)) { logLine(run, id, rec ? rec.attempt : 0, `stale failure report ignored: ${String(error).slice(0, 300)}`); return { ok: false, stale: true, reason: "stale_generation" }; }
    logLine(run, id, rec.attempt, `failed: ${String(error).slice(0, 1500)}`);
    if (provider_in_flight || (rec.provider && rec.provider.submitted && !rec.provider.id)) {
      rec.state = "unknown_outcome"; rec.provider = { ...(rec.provider || {}), status: "unknown_outcome" };
      hist(rec, "unknown_outcome", { note: "provider outcome unknown: reconcile by client id" });
    } else if (category === "budget" && !rec.cancel.requested) {
      rec.state = "retry_wait"; rec.retries.next_after = null; rec.hold = { reason: "spend_limit", at: nowIso(), note: "paused safely: produced assets are kept; the person raises the limit or releases the hold" };
      hist(rec, "budget_hold", { category });
    } else if (transient && rec.retries.count < rec.retries.max && !rec.cancel.requested) {
      rec.state = "retry_wait"; rec.retries.next_after = new Date(Date.now() + backoffS(rec.retries.count) * 1000).toISOString(); rec.retries.count += 1;
      hist(rec, "retry_wait", { next_after: rec.retries.next_after });
    } else { rec.state = "failed"; hist(rec, "failed", { error: redact(String(error)).slice(0, 200), category }); }
    if (category) { const sig = canonicalDigest({ n: rec.node_id, i: rec.input_digest, c: category, e: redact(String(error)).replace(/[0-9]+/g, "#").slice(0, 120) }).slice(0, 16); rec.failures = [...(rec.failures || []).slice(-9), { at: nowIso(), attempt: rec.attempt, category, sig, checkpoint: rec.checkpoint ?? null }]; }
    if (category) rec.failure = { category, error: redact(String(error)).slice(0, 300), at: nowIso(), attempt: rec.attempt, op_sig: canonicalDigest({ n: rec.node_id, i: rec.input_digest, c: category, e: redact(String(error)).replace(/[0-9]+/g, "#").slice(0, 120) }).slice(0, 16) };
    rec.lease = rec.lease ? { ...rec.lease, released_at: nowIso() } : null;
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    return { ok: true, state: rec.state, retry: retryDecision(rec) };
  });
}
// BEFORE the remote call: persist the intent and the idempotent client id, so a crash or timeout leaves something to reconcile instead of a lost job
export function beginProviderSubmit(run, id, lease, { provider = "unknown", idempotency_key, operation = null, consent = null, estimate = null } = {}) {
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!current(rec, lease)) return { ok: false, stale: true, reason: "stale_generation" };
    if (rec.provider && rec.provider.submitted) return { ok: false, reason: "already_submitted", provider: rec.provider, note: rec.provider.id ? "reuse the existing provider job id" : "outcome unknown: reconcile by client id; never resubmit" };
    const key = idempotency_key || canonicalDigest({ j: id, i: rec.input_digest, a: rec.approval_digest });
    // Plan 11 R2: the intended operation, the consent it ran under and the idempotency key are on disk before the request leaves; "exactly once" is never claimed (the key only lets us FIND the job again)
    rec.provider = { provider, submitted: true, client_id: clientIdFor(key), idempotency_key: key, id: null, status: "submit_intent", intent_at: nowIso(), operation: operation ? redact(String(operation)).slice(0, 300) : null, consent: consent || null, estimate: estimate ?? null };
    hist(rec, "provider_submit_intent", { client_id: rec.provider.client_id });
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    return { ok: true, client_id: rec.provider.client_id };
  });
}
export function recordProviderId(run, id, lease, { provider_job_id, status = "queued" } = {}) {
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!current(rec, lease)) return { ok: false, stale: true, reason: "stale_generation" };
    rec.provider = { ...(rec.provider || {}), id: provider_job_id, status };
    hist(rec, "provider_id", { provider_job_id });
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    return { ok: true };
  });
}
// a reconcile found (or proved absent) the provider job. found: { id, status } | null. Only after a proven absence AND explicit approval may a resubmission be allowed.
export function reconcileProvider(run, id, found, { searched = [] } = {}) {
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!rec) return { ok: false, reason: "no_such_job" };
    if (found && found.id) { rec.provider = { ...(rec.provider || {}), id: found.id, status: found.status || "found" }; rec.state = "pending"; hist(rec, "reconciled_found", { id: found.id }); }
    else { rec.provider = { ...(rec.provider || {}), status: "unknown_outcome", searched }; hist(rec, "reconciled_not_found", { searched }); }
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    return { ok: true, state: rec.state, provider: rec.provider, may_resubmit: false, note: found ? "adopt the existing provider job; do not submit another" : "not found is not proof it never ran: a resubmission needs the person's explicit approval" };
  });
}

// ---- supersede / cancel ----------------------------------------------------------------------------------------------------------------
// the lead replaces a running attempt (an upstream revision landed, or the worker is wedged): bump the generation so the old worker's commit and heartbeat both fail
export function supersede(run, id, reason = "superseded") {
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!rec) return { ok: false, reason: "no_such_job" };
    if (["completed", "failed", "cancelled"].includes(rec.state)) return { ok: false, reason: `terminal_${rec.state}` };
    const old = rec.lease;
    rec.generation += 1; rec.lease = null; rec.state = "pending";
    hist(rec, "superseded", { reason, old_owner: old && old.owner, old_pid: old && old.pid });
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    logLine(run, id, rec.attempt, `attempt superseded (${reason}); a late result from owner ${old && old.owner} will be rejected`);
    return { ok: true, generation: rec.generation, stop_pid: rec.local && old && old.pid && leaseOwnerAlive(old) ? old.pid : null };
  });
}
// ids: node ids and/or input digests now invalid. Cancels (and fences) the LOCAL attempts; a provider job on a shared queue is only marked.
// -> { cancelled:[{job_id, stop_pid}], provider_marked:[{job_id, client_id}] }
// V3: `stale_groups` ([continuity group ids]) cancels only the jobs of those groups, so a late shared asset invalidates its dependents and nothing else.
export function cancelObsolete(run, { node_ids = [], stale_inputs = [], stale_groups = [], reason = "an upstream revision invalidated this work" } = {}) {
  const nodes = new Set(node_ids), digs = new Set(stale_inputs), grps = new Set(stale_groups.map(String));
  return withStrictLock(run, () => {
    const out = { cancelled: [], provider_marked: [] };
    for (const rec of listJobs(run)) {
      if (["completed", "failed", "cancelled"].includes(rec.state)) continue;
      if (!nodes.has(rec.node_id) && !digs.has(rec.input_digest) && !(rec.continuity && rec.continuity.group_id && grps.has(rec.continuity.group_id))) continue;
      const old = rec.lease;
      rec.cancel = { requested: true, reason, at: nowIso() }; rec.generation += 1; rec.lease = null;
      if (rec.provider && rec.provider.submitted) {
        rec.provider = { ...rec.provider, cancel: "not_called: a shared external queue is never interrupted globally; reconcile or let it finish and discard the result" };
        rec.state = rec.provider.id ? "cancelled" : "unknown_outcome";
        out.provider_marked.push({ job_id: rec.job_id, client_id: rec.provider.client_id, provider_job_id: rec.provider.id || null });
      } else { rec.state = "cancelled"; out.cancelled.push({ job_id: rec.job_id, stop_pid: rec.local && old && leaseOwnerAlive(old) ? old.pid : null }); }
      hist(rec, "cancelled_obsolete", { reason });
      writeAtomic(jobFile(run, rec.job_id), JSON.stringify(rec, null, 2) + "\n");
      logLine(run, rec.job_id, rec.attempt, `cancelled: ${reason}`);
    }
    return out;
  });
}
// Plan 10 U6: "retry a failed step". Puts a FAILED / retry-waiting job of THIS run back to pending under a new generation (a late result from the old attempt is rejected).
// An unknown_outcome job is only requeued with the person's explicit approval of the possible duplicate (retryDecision); a provider job is never resubmitted here.
export function requeue(run, id, { explicit_approval = false } = {}) {
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!rec) return { ok: false, reason: "no_such_job" };
    if (!["failed", "retry_wait", "unknown_outcome"].includes(rec.state)) return { ok: false, reason: `not_retryable_${rec.state}` };
    if (rec.state === "unknown_outcome" && !explicit_approval) return { ok: false, reason: "unknown_outcome_needs_approval", decision: retryDecision(rec) };
    rec.generation += 1; rec.lease = null; rec.state = "pending"; rec.cancel = { requested: false }; delete rec.hold;
    if (rec.retries) rec.retries.next_after = null;
    hist(rec, "requeued", { by: "person", explicit_approval: !!explicit_approval });
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    logLine(run, id, rec.attempt, `requeued by the person (generation ${rec.generation})`);
    return { ok: true, state: rec.state, generation: rec.generation };
  });
}
// ---- Plan 11 R1/R8: restart reconciliation of one job -----------------------------------------------------------------------------
const priorPath = (run, id, gen, rel) => path.join(jobsDir(run), "prior", `${String(id).replace(/[^A-Za-z0-9_.-]+/g, "-")}-g${gen}`, rel);
// a leased/running job whose owner IDENTITY is gone is INTERRUPTED (derived, and recorded once). It keeps its generation until somebody claims it again, which fences the dead worker.
export function markInterrupted(run, id) {
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!rec || !ACTIVE.has(rec.state)) return { ok: false, reason: "not_active" };
    if (leaseOwnerAlive(rec.lease)) return { ok: false, reason: "owner_alive" };
    if (rec.interrupted && rec.interrupted.generation === rec.generation) return { ok: true, already: true, interrupted: rec.interrupted };
    rec.interrupted = { at: nowIso(), generation: rec.generation, owner: rec.lease && rec.lease.owner, pid: rec.lease && rec.lease.pid, checkpoint: rec.checkpoint };
    hist(rec, "interrupted", { owner: rec.interrupted.owner });
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    logLine(run, id, rec.attempt, `interrupted: owner ${rec.interrupted.owner} is gone (identity check); checkpoint ${rec.checkpoint ?? "none"}`);
    return { ok: true, interrupted: rec.interrupted };
  });
}
// a worker died inside commit(): every output either landed with its recorded digest or not. All landed -> finish forward (completed, manifest recorded). Some landed -> restore the prior
// file from its hard link where one exists, else report partial and change nothing more (never delete, never call it complete). None landed -> nothing was published, drop the marker.
function publicationRows(run, rec) {
  const rows = rec.publishing.outputs.map((o) => { const abs = inside(run, o.path); let d = null; try { d = abs && fs.existsSync(abs) ? sha256File(abs) : null; } catch {} return { ...o, abs, landed: d === o.digest, now: d }; });
  const landed = rows.filter((r) => r.landed);
  return { rows, landed, plan: landed.length === rows.length ? "finish_forward" : landed.length === 0 ? "nothing_published" : "partial" };
}
export function recoverPublication(run, id, { dry = false } = {}) {
  if (dry) { // read-only: no lock, no file touched (lib/recovery.mjs reconcileRun and scripts/diagnose.mjs)
    const rec = rj(jobFile(run, id));
    if (!rec || !rec.publishing) return { ok: true, dry: true, recovered: false, reason: "no_publication_in_progress" };
    const p = publicationRows(run, rec);
    return { ok: true, dry: true, plan: p.plan, landed: p.landed.length, total: p.rows.length };
  }
  return withStrictLock(run, () => {
    const rec = rj(jobFile(run, id));
    if (!rec || !rec.publishing) return { ok: true, recovered: false, reason: "no_publication_in_progress" };
    if (ACTIVE.has(rec.state) && leaseOwnerAlive(rec.lease)) return { ok: false, reason: "owner_alive" };
    const { rows, landed, plan } = publicationRows(run, rec);
    const gen = rec.publishing.generation;
    if (plan === "finish_forward") {
      rec.outputs = rows.map(({ path: p, digest, size }) => ({ path: p, digest, size })); rec.state = "completed"; rec.completion = { basis: "output_manifest", at: nowIso(), recovered: true };
      rec.lease = rec.lease ? { ...rec.lease, released_at: nowIso() } : null; rec.completed_generation = gen; delete rec.publishing; delete rec.interrupted;
      hist(rec, "publication_finished", { outputs: rows.length });
    } else if (plan === "nothing_published") { delete rec.publishing; hist(rec, "publication_dropped", { note: "no output had landed" }); }
    else {
      const restored = [], stuck = [];
      for (const r of landed) {
        const pd = priorPath(run, id, gen, r.path);
        if (r.had_prior && fs.existsSync(pd)) { try { fs.renameSync(pd, r.abs); restored.push(r.path); } catch { stuck.push(r.path); } }
        else stuck.push(r.path);
      }
      if (stuck.length) { hist(rec, "publication_partial", { landed: landed.map((r) => r.path), restored, stuck }); rec.publishing = { ...rec.publishing, partial: true, stuck }; }
      else { delete rec.publishing; hist(rec, "publication_rolled_back", { restored }); }
      writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
      return { ok: true, recovered: !stuck.length, plan, restored, stuck, note: stuck.length ? "some outputs landed without a prior copy to restore: nothing was deleted; the owner decides (keep the new files, or restore from backup)" : "rolled back to the previous files" };
    }
    writeAtomic(jobFile(run, id), JSON.stringify(rec, null, 2) + "\n");
    return { ok: true, recovered: true, plan, state: rec.state };
  });
}

export function jobsSummary(run) {
  const by = {}, rows = listJobs(run);
  for (const r of rows) by[r.state] = (by[r.state] || 0) + 1;
  return { schema_version: JOB_SCHEMA, total: rows.length, by_state: by, unknown_outcome: rows.filter((r) => r.state === "unknown_outcome").map((r) => ({ job_id: r.job_id, client_id: r.provider && r.provider.client_id })), retrying: rows.filter((r) => r.state === "retry_wait").map((r) => ({ job_id: r.job_id, next_after: r.retries.next_after })) };
}

// ---- continuity edges (V3, W06) -----------------------------------------------------------------------------------------------------
// Are the upstream jobs this job depends on (continuity.depends_on, job_id or node_id) completed and CURRENT? Read-only; the caller (the crew scheduler) decides what to start.
// -> { ready, waiting_on:[{ref, state}], missing:[ref], stale:[ref] }. `current` ({ <job_id|node_id>: input_digest }) marks a completed upstream whose input moved as stale.
export function dependencyState(run, id, { current = {} } = {}) {
  const rec = readJob(run, id);
  if (!rec) return { ready: false, waiting_on: [], missing: [String(id)], stale: [], reason: "no_such_job" };
  const rows = listJobs(run), waiting_on = [], missing = [], stale = [];
  for (const ref of sarr(rec.continuity && rec.continuity.depends_on)) {
    const ups = rows.filter((r) => r.job_id === ref || r.node_id === ref);
    if (!ups.length) { missing.push(ref); continue; }
    const done = ups.filter((r) => r.state === "completed");
    if (!done.length) { waiting_on.push({ ref, state: ups[0].state }); continue; }
    const cur = current[ref];
    if (cur !== undefined && !done.some((r) => r.input_digest === cur)) stale.push(ref);
  }
  return { ready: !waiting_on.length && !missing.length && !stale.length, waiting_on, missing, stale };
}
// Jobs whose recorded continuity identity no longer equals the group's current one (identities: { <group_id>: identity_digest }). Resume uses it to rerun only these, never every scene.
export function staleByIdentity(run, identities = {}) {
  return listJobs(run).filter((r) => r.continuity && r.continuity.group_id && identities[r.continuity.group_id] !== undefined && r.continuity.identity_digest && r.continuity.identity_digest !== identities[r.continuity.group_id])
    .map((r) => ({ job_id: r.job_id, node_id: r.node_id, group_id: r.continuity.group_id, state: r.state, recorded: r.continuity.identity_digest, now: identities[r.continuity.group_id] }));
}
// Per continuity group: how many of its jobs are in each state (a group is done only when every job is completed). Feeds the planner's `ready` decision and runStatus-style views.
export function groupProgress(run) {
  const by = {};
  for (const r of listJobs(run)) {
    const g = r.continuity && r.continuity.group_id; if (!g) continue;
    const e = (by[g] ||= { group_id: g, owner: r.continuity.owner || null, jobs: 0, by_state: {} });
    e.jobs += 1; e.by_state[r.state] = (e.by_state[r.state] || 0) + 1;
  }
  return Object.values(by).map((e) => ({ ...e, done: e.jobs > 0 && e.by_state.completed === e.jobs, active: (e.by_state.leased || 0) + (e.by_state.running || 0) > 0 }));
}

// ---- budget reservations (P9) ------------------------------------------------------------------------------------------------------
// ledger: <run>/crew/reservations.json { schema_version, reservations: { <op_id>: { op_id, amount, headroom, state: active|settled|released, actual, unknown, attempts } } }
// All reservations are drawn from ONE remaining allowance under one lock, so two parallel jobs cannot both spend the same remainder.
const resFile = (run) => path.join(jobsDir(run), "reservations.json");
const UNKNOWN_USAGE_MAX_CONCURRENT = 2; // conservative cap while the harness reports no counters (proposed)
export const HEADROOM_DEFAULT = 0.25;   // bounded repair headroom (proposed)
function readRes(run) { return rj(resFile(run)) || { schema_version: 1, reservations: {} }; }
const sumActive = (l) => Object.values(l.reservations).filter((r) => r.state === "active").reduce((a, r) => a + (r.amount || 0) + (r.headroom || 0), 0);
// op_id: the OPERATION (node + input digest), never the attempt: a retry finds the same reservation.
// o: { op_id, tokens (the job's estimate), limit_tokens (the person's limit or null), spent_tokens (reported actuals so far; null = unknown), usage_known:boolean, headroom_pct }
export function reserveBudget(run, o = {}) {
  if (!o.op_id) throw new Error("reserveBudget needs op_id (the operation, not the attempt)");
  return withStrictLock(run, () => {
    const led = readRes(run), cur = led.reservations[o.op_id];
    if (cur) {
      if (cur.state === "released" || cur.state === "settled") { if (cur.state === "released") { cur.state = "active"; cur.attempts = (cur.attempts || 1) + 1; cur.reopened_at = nowIso(); } else return { ok: true, reservation: cur, idempotent: true, note: "this operation already settled" }; }
      else return { ok: true, reservation: cur, idempotent: true, note: "the operation already holds a reservation: a retry gets no second one" };
      writeAtomic(resFile(run), JSON.stringify(led, null, 2) + "\n");
      return { ok: true, reservation: cur, idempotent: true, reopened: true };
    }
    const tokens = Number(o.tokens) || 0, limit = Number.isFinite(Number(o.limit_tokens)) && o.limit_tokens !== null ? Number(o.limit_tokens) : null;
    const headroom = Math.round(tokens * (Number.isFinite(Number(o.headroom_pct)) ? Number(o.headroom_pct) : HEADROOM_DEFAULT));
    const active = Object.values(led.reservations).filter((r) => r.state === "active").length;
    const usageKnown = o.usage_known === true && o.spent_tokens !== null && o.spent_tokens !== undefined;
    if (limit === null) {
      // no limit the person set: nothing to overspend, but nothing is invented either. Unknown usage keeps concurrency conservative.
      if (!usageKnown && active >= UNKNOWN_USAGE_MAX_CONCURRENT) return { ok: false, reason_code: "budget_unavailable", state: "queued", detail: `usage is unreported, so at most ${UNKNOWN_USAGE_MAX_CONCURRENT} reservations run at once`, active };
      const r = { op_id: o.op_id, amount: null, headroom: null, estimate_tokens: tokens || null, state: "active", unknown: true, conservative: !usageKnown, attempts: 1, reserved_at: nowIso() };
      led.reservations[o.op_id] = r; writeAtomic(resFile(run), JSON.stringify(led, null, 2) + "\n");
      return { ok: true, reservation: r, reason_code: usageKnown ? "admitted" : "budget_unknown_conservative" };
    }
    if (!usageKnown && active >= UNKNOWN_USAGE_MAX_CONCURRENT) return { ok: false, reason_code: "budget_unavailable", state: "queued", detail: `a limit is set but usage is unreported: reservations are drawn from estimates and capped at ${UNKNOWN_USAGE_MAX_CONCURRENT} at once`, active };
    const spent = usageKnown ? Number(o.spent_tokens) : 0; // unknown stays unknown: not treated as zero, only estimates of what is reserved/settled count
    const settledEstimate = Object.values(led.reservations).filter((r) => r.state === "settled" && r.actual === null).reduce((a, r) => a + (r.amount || 0), 0); // finished but unreported: held against the limit
    const remaining = limit - spent - sumActive(led) - settledEstimate;
    const need = tokens + headroom;
    if (need > remaining) return { ok: false, reason_code: "budget_unavailable", state: "resource_blocked", detail: `needs ${need} (estimate ${tokens} + repair headroom ${headroom}) of ${Math.max(0, remaining)} remaining`, remaining: Math.max(0, remaining) };
    const r = { op_id: o.op_id, amount: tokens, headroom, state: "active", unknown: false, conservative: !usageKnown, attempts: 1, reserved_at: nowIso(), limit_tokens: limit };
    led.reservations[o.op_id] = r; writeAtomic(resFile(run), JSON.stringify(led, null, 2) + "\n");
    return { ok: true, reservation: r, remaining_after: remaining - need, reason_code: usageKnown ? "admitted" : "budget_unknown_conservative" };
  });
}
// actual: the reported tokens, or null = not reported (stays unknown: the reservation stays counted as an estimate, nothing is released). Idempotent.
export function reconcileBudget(run, op_id, { actual = null, failed = false } = {}) {
  return withStrictLock(run, () => {
    const led = readRes(run), r = led.reservations[op_id];
    if (!r) return { ok: false, reason: "no_such_reservation" };
    if (r.state === "settled" || r.state === "released") return { ok: true, reservation: r, idempotent: true };
    const a = actual === null || actual === undefined ? null : Number(actual);
    if (failed && a === null) { r.state = "released"; r.released_at = nowIso(); r.note = "failed before any usage was reported: released; a retry reopens the same reservation"; }
    else { r.state = "settled"; r.actual = a; r.settled_at = nowIso(); r.released = a === null || r.amount === null ? 0 : Math.max(0, (r.amount + r.headroom) - a); if (a === null) r.note = "usage not reported: stays unknown and keeps counting against the allowance as an estimate"; }
    writeAtomic(resFile(run), JSON.stringify(led, null, 2) + "\n");
    return { ok: true, reservation: r };
  });
}
export function budgetSnapshot(run, { limit_tokens = null } = {}) {
  const led = readRes(run), all = Object.values(led.reservations);
  return { schema_version: 1, active: all.filter((r) => r.state === "active").length, reserved_active: sumActive(led), settled_unreported: all.filter((r) => r.state === "settled" && r.actual === null).length, limit_tokens, note: "reservations are estimates until usage is reported; unknown stays unknown" };
}
