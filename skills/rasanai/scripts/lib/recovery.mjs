// Plan 11 R1/R2/R7: durable recovery, bounded retries and uncertain outcomes. EXTENDS Plan 09 (lib/jobs.mjs leases + fencing, resource-pools.mjs pause/throttle, provider-jobs.mjs
// unknown_outcome) and the existing director supervisor (apps/macos Runtime/director-driver.mjs writes director-events.jsonl; Studio adopts or classifies a stopped director).
// There is NO second watchdog and NO second job log here: this file derives the recovery view from the job records, repairs what a crash can leave behind, and classifies failures.
//
//   RECOVERY_STATES / recoveryState(job, ctx)   planned, waiting-for-approval, queued, running, paused, interrupted, unknown-outcome, completed, failed, cancelled, stale
//                                                derived from three DISTINCT facts: process (lease owner identity), artifact (committed manifest on disk), approval (current digest)
//   completionEvidence(run, job)                terminal success = a committed output manifest whose files are on disk with their digests; an exit code alone is never success
//   reconcileRun(run, {apply})                  restart: leases, owned processes (pid + start time + generation), approval digests, provider ids, half-done publications
//   resumePlan(run)                             the smallest valid unfinished job(s); never "restart at Brief"
//   readJsonl / appendJsonl / repairJsonlTail   a torn final line keeps every preceding valid event; an append after a torn tail starts a fresh line
//   atomicWrite / sweepTemps / diskGuard        durable replace (file + directory fsync), cleanup of abandoned temp files (single files only), free-space check before expensive work
//   classifyFailure / nextStep / repeatedFailure / failWithClass   bounded backoff classes; a permission failure is never answered with broader tools
//   rateLimitReport(run)                        throttle state with its source; a reset time is only stated when the provider gave one
//   directorOwnership(run)                      never two directors for one run (read-only scan)
//   migrationPlan / migrate                     idempotent, versioned, reversible (originals are copied to crew/migrations/<id>/ first)
// Everything except reconcileRun({apply}), migrate({apply}), sweepTemps({apply}), repairJsonlTail and failWithClass is read-only. No model, no network, no render.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import * as Jobs from "./jobs.mjs";
import { pauseState, throttleState, POOL_ORDER, setPause } from "./resource-pools.mjs";
import { redact } from "./redact.mjs";

const R = (run, ...p) => path.join(path.resolve(String(run)), ...p);
const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const nowIso = () => new Date().toISOString();
const sha256File = (f) => { const h = crypto.createHash("sha256"), fd = fs.openSync(f, "r"), b = Buffer.alloc(1 << 20); try { for (let n; (n = fs.readSync(fd, b, 0, b.length)) > 0;) h.update(b.subarray(0, n)); } finally { fs.closeSync(fd); } return h.digest("hex"); };

// ---- states -----------------------------------------------------------------------------------------------------------------------
export const RECOVERY_STATES = Object.freeze(["planned", "waiting-for-approval", "queued", "running", "paused", "interrupted", "unknown-outcome", "completed", "failed", "cancelled", "stale"]);

// Verify a completed job's manifest. deep:true re-hashes (slow for media); the default compares existence and size only.
export function completionEvidence(run, job, { deep = false } = {}) {
  if (!job || job.state !== "completed") return { ok: false, basis: null, why: "not completed" };
  const basis = (job.completion && job.completion.basis) || "legacy_unverified";
  const outs = Array.isArray(job.outputs) ? job.outputs : [];
  if (!outs.length) return { ok: basis === "role_check_only", basis, why: basis === "role_check_only" ? "the lead's role check passed; no file manifest was supplied, so the files themselves are not re-verifiable here" : "completed with no output manifest (legacy or unverified): not treated as proven" };
  const problems = [];
  for (const o of outs) {
    const abs = path.resolve(R(run), o.path || "");
    if (!abs.startsWith(R(run) + path.sep)) { problems.push({ path: o.path, problem: "outside_run" }); continue; }
    let st; try { st = fs.statSync(abs); } catch { problems.push({ path: o.path, problem: "missing" }); continue; }
    if (o.size != null && st.size !== o.size) problems.push({ path: o.path, problem: "size_changed" });
    else if (deep && o.digest) { try { if (sha256File(abs) !== o.digest) problems.push({ path: o.path, problem: "digest_changed" }); } catch { problems.push({ path: o.path, problem: "unreadable" }); } }
  }
  return { ok: !problems.length, basis, problems, why: problems.length ? "an output recorded in the manifest is missing or changed" : "manifest verified" };
}

// ctx: { pause?, approvalCurrent?: bool|null, artifact?: completionEvidence result, now? } -> { state, process, artifact, approval, why }
export function recoveryState(job, ctx = {}) {
  if (!job) return { state: "planned", process: "none", artifact: "none", approval: "unknown", why: "in the plan, no job record yet" };
  const approval = ctx.approvalCurrent === false ? "superseded" : ctx.approvalCurrent === true ? "current" : "unchecked";
  const owner = Jobs.ACTIVE.has(job.state) ? (Jobs.leaseOwnerAlive(job.lease) ? "alive" : "gone") : "none";
  const artifact = job.state === "completed" ? (ctx.artifact ? (ctx.artifact.ok ? "committed" : "stale") : "unverified") : "none";
  const mk = (state, why) => ({ state, process: owner, artifact, approval, why });
  if (job.publishing) return mk("interrupted", "died while publishing outputs: recoverPublication decides finish or roll back");
  switch (job.state) {
    case "leased": case "running": return owner === "alive" ? mk("running", "owner process is alive") : mk("interrupted", "owner process identity is gone; the lease generation fences it on the next claim");
    case "pending": return approval === "superseded" ? mk("waiting-for-approval", "the approval this job was created under was superseded") : ctx.pause && ctx.pause.paused ? mk("paused", "the person paused production") : mk("queued", "ready to be claimed");
    case "retry_wait": return job.hold ? mk("paused", `held: ${job.hold.reason}`) : mk("queued", job.retries && job.retries.next_after ? `retry after ${job.retries.next_after}` : "ready to retry");
    case "unknown_outcome": return mk("unknown-outcome", "a provider request may or may not have been accepted: reconcile by client id, never resubmit blindly");
    case "completed": return artifact === "stale" ? mk("stale", "completed, but its committed output is missing or changed") : approval === "superseded" ? mk("stale", "completed under an approval that has since been superseded") : mk("completed", ctx.artifact ? ctx.artifact.why : "completed");
    case "failed": return mk("failed", (job.failure && job.failure.category) || "failed");
    case "cancelled": return mk("cancelled", "cancelled");
    case "superseded": return mk("stale", "superseded by a newer attempt or revision");
    default: return mk("stale", `unknown job state ${JSON.stringify(job.state)}: left as is`);
  }
}

// ---- restart reconciliation -----------------------------------------------------------------------------------------------------
// opts: { apply (default false: report only), currentApprovalDigest?(job) -> string|null, deep }
export function reconcileRun(run, { apply = false, currentApprovalDigest = null, deep = false } = {}) {
  const pause = pauseState(run);
  const rows = [], actions = [];
  for (const job of Jobs.listJobs(run)) {
    const approvalCurrent = currentApprovalDigest && job.approval_digest ? currentApprovalDigest(job) === job.approval_digest : null;
    const artifact = job.state === "completed" ? completionEvidence(run, job, { deep }) : null;
    const st = recoveryState(job, { pause, approvalCurrent, artifact });
    const row = { job_id: job.job_id, node: job.node_id, job_state: job.state, created_at: job.created_at || null, ...st, generation: job.generation, provider: job.provider ? { client_id: job.provider.client_id || null, id: job.provider.id || null, status: job.provider.status || null } : null };
    if (st.state === "interrupted") {
      if (job.publishing) { const plan = Jobs.recoverPublication(run, job.job_id, { dry: true }); actions.push({ job_id: job.job_id, action: "recover_publication", plan: plan.plan, applied: false }); row.next = `recover publication (${plan.plan})`; }
      else { actions.push({ job_id: job.job_id, action: "reclaim_on_claim", note: "the next claim bumps the generation; the dead worker can no longer commit", applied: false }); row.next = job.provider && job.provider.submitted && !job.provider.id ? "reconcile the provider job by client id before any claim" : "claim again (smallest unfinished job)"; }
    } else if (st.state === "unknown-outcome") row.next = "reconcile by client id; resubmit only with the person's explicit approval";
    else if (st.state === "stale") row.next = artifact && !artifact.ok ? "the committed output changed: re-run only this job's outputs" : "inputs or approval moved: the schedule decides what to redo";
    else if (st.state === "waiting-for-approval") row.next = "ask the person; nothing runs under a superseded approval";
    rows.push(row);
  }
  if (apply) for (const a of actions) {
    if (a.action === "recover_publication") { const r = Jobs.recoverPublication(run, a.job_id); a.applied = !!r.ok; a.result = r.plan || r.reason; }
    else { const r = Jobs.markInterrupted(run, a.job_id); a.applied = !!r.ok; }
  }
  const byState = {}; for (const r of rows) byState[r.state] = (byState[r.state] || 0) + 1;
  return { schema_version: 1, generated_at: nowIso(), applied: !!apply, jobs: rows, actions, by_state: byState, pause, resume: resumePlan(run, rows) };
}

// the smallest valid unfinished work: interrupted / queued jobs that are not waiting on a person, a hold, an unknown provider outcome or a throttle. Oldest first. Never "reset to Brief":
// approvals and accepted artifacts are inputs here, not something resume recomputes.
export function resumePlan(run, rows = null) {
  const jobs = rows || reconcileRowsLite(run);
  const ready = jobs.filter((r) => ["interrupted", "queued"].includes(r.state)).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const blocked = jobs.filter((r) => ["waiting-for-approval", "unknown-outcome", "paused", "stale"].includes(r.state)).map((r) => ({ job_id: r.job_id, state: r.state, next: r.next || r.why }));
  return { reset_to_brief: false, next: ready.slice(0, 1).map((r) => r.job_id), also_ready: ready.slice(1).map((r) => r.job_id), blocked, note: "resume continues the smallest unfinished job; approved decisions and accepted artifacts are kept" };
}
function reconcileRowsLite(run) { const pause = pauseState(run); return Jobs.listJobs(run).map((j) => ({ job_id: j.job_id, created_at: j.created_at, ...recoveryState(j, { pause }) })); }

// never two directors for one run: the supervisor's own event file plus a read-only process scan. -> { drivers:[{pid}], open_start_pid, ok }
export function directorOwnership(run) {
  const events = readJsonl(R(run, "director-events.jsonl")).events;
  let open = null; for (const e of events) { if (e.event === "start") open = e; else if (e.event === "exit") open = null; }
  let drivers = [];
  try {
    const ps = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8", timeout: 4000 });
    for (const line of String(ps.stdout || "").split("\n")) { const m = /^\s*(\d+)\s+(.*)$/.exec(line); if (m && m[2].includes("director-driver.mjs") && (m[2].includes(R(run)) || m[2].includes(fs.realpathSync(R(run))))) drivers.push({ pid: Number(m[1]) }); }
  } catch {}
  return { ok: drivers.length <= 1, drivers, open_start_pid: open ? open.pid ?? null : null, note: drivers.length > 1 ? "two director drivers are alive for this run: stop one (Studio adopts a single driver per run)" : "at most one driver" };
}

// ---- JSONL: torn tails, appends, repair ------------------------------------------------------------------------------------------
// -> { events, bad_lines, torn_tail, valid_bytes }. A final line without a newline that does not parse is a torn tail (crash mid-write): it is reported, every earlier valid line is kept.
export function readJsonl(file) {
  let text = ""; try { text = fs.readFileSync(file, "utf8"); } catch { return { events: [], bad_lines: 0, torn_tail: false, valid_bytes: 0 }; }
  const endsNl = text.endsWith("\n");
  const lines = text.split("\n"); if (endsNl) lines.pop();
  const events = []; let bad = 0, torn = false, valid = 0, off = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], hasNl = !(i === lines.length - 1 && !endsNl), len = Buffer.byteLength(l) + (hasNl ? 1 : 0);
    if (!l.trim()) { off += len; valid = off; continue; }
    try { events.push(JSON.parse(l)); off += len; valid = off; }
    catch { if (!hasNl) torn = true; else { bad++; off += len; valid = off; } }
  }
  return { events, bad_lines: bad, torn_tail: torn, valid_bytes: valid };
}
// an append never glues onto a torn fragment: if the file does not end in a newline, one is written first, so only the torn line itself stays unreadable
export function appendJsonl(file, obj, { sync = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let lead = "";
  try { const st = fs.statSync(file); if (st.size > 0) { const fd = fs.openSync(file, "r"); const b = Buffer.alloc(1); try { fs.readSync(fd, b, 0, 1, st.size - 1); } finally { fs.closeSync(fd); } if (b[0] !== 10) lead = "\n"; } } catch {}
  const fd = fs.openSync(file, "a");
  try { fs.writeSync(fd, lead + JSON.stringify(obj) + "\n"); if (sync) fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
// keep the original (as <file>.torn-<ts>) and rewrite the file without the torn tail
export function repairJsonlTail(file) {
  const r = readJsonl(file);
  if (!r.torn_tail) return { ok: true, repaired: false };
  const original = fs.readFileSync(file);
  const keep = original.subarray(0, r.valid_bytes);
  const backup = `${file}.torn-${Date.now()}`;
  fs.writeFileSync(backup, original);
  atomicWrite(file, keep);
  return { ok: true, repaired: true, kept_bytes: keep.length, dropped_bytes: original.length - keep.length, backup };
}

// ---- durable atomic replace, temp cleanup, free space ---------------------------------------------------------------------------------
// temp in the SAME directory (same volume), fsync the file, rename, fsync the directory. durable:false when the filesystem refuses a directory fsync (reported, not hidden).
export function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
  try {
    const fd = fs.openSync(tmp, "w"); try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch {} throw e; }
  let durable = true;
  try { const d = fs.openSync(path.dirname(file), "r"); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch { durable = false; }
  return { durable };
}
const TEMP_RE = /\.(?:tmp|pub)-(\d+)(?:-[0-9a-f]+)?$|\.(\d+)\.tmp$/;
// abandoned temp files directly inside `dirs` (not recursive). A temp whose pid is alive and that is younger than olderThanMs is left. apply:false only lists. Single files only; nothing else is touched.
export function sweepTemps(dirs, { olderThanMs = 60 * 60 * 1000, apply = false, now = Date.now() } = {}) {
  const found = [];
  for (const d of [].concat(dirs)) {
    let names = []; try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names) {
      const m = TEMP_RE.exec(n); if (!m) continue;
      const f = path.join(d, n); let st; try { st = fs.statSync(f); } catch { continue; }
      if (!st.isFile()) continue;
      const pid = Number(m[1] || m[2]); let live = false; try { process.kill(pid, 0); live = true; } catch (e) { live = e.code === "EPERM"; }
      if (live && now - st.mtimeMs < olderThanMs) continue;
      const row = { file: f, bytes: st.size, age_s: Math.round((now - st.mtimeMs) / 1000), removed: false };
      if (apply) { try { fs.unlinkSync(f); row.removed = true; } catch {} }
      found.push(row);
    }
  }
  return found;
}
// before expensive work: is there room? Never deletes anything to make room. -> { ok, free_bytes|null, needed_bytes, known }
export function diskGuard(dir, neededBytes) {
  try { const s = fs.statfsSync(dir); const free = Number(s.bavail) * Number(s.bsize); return { ok: free >= neededBytes, free_bytes: free, needed_bytes: neededBytes, known: true, note: free >= neededBytes ? "" : "not enough free disk space: nothing was deleted; free some space or choose a lower-resource setting, then resume" }; }
  catch { return { ok: true, free_bytes: null, needed_bytes: neededBytes, known: false, note: "free space could not be read: unknown, not assumed sufficient" }; }
}

// ---- failure classes, retries, repeated failure -------------------------------------------------------------------------------------------
export const FAILURE_CATEGORIES = Object.freeze(["transient", "rate_limit", "permission", "invalid_input", "budget", "permanent"]);
const RULES = [
  ["budget", /spend[- ]limit|budget (exceeded|exhausted)|quota (exceeded|exhausted)|insufficient (credit|funds)|payment required|billing|usage limit|credit balance/i],
  ["rate_limit", /\b429\b|rate[- ]?limit|too many requests|retry-after|overloaded|throttl/i],
  ["permission", /EACCES|EPERM|permission denied|operation not permitted|not permitted|not allowed|forbidden|\b403\b|requires? (your )?(approval|permission)|tool .{0,40}(denied|not allowed)|sandbox/i],
  ["invalid_input", /ENOENT|no such file|missing (asset|file|input)|invalid|malformed|unsupported (format|codec|type)|\b400\b|\b422\b|schema|parse error|unexpected token/i],
  ["transient", /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EBUSY|timed? ?out|timeout|temporar|\b50[234]\b|socket hang up|lock_unavailable/i],
];
export function classifyFailure(err) {
  const text = redact(typeof err === "string" ? err : (err && (err.message || String(err))) || "") + " " + ((err && err.code) || "");
  for (const [cat, re] of RULES) if (re.test(text)) return { category: cat, retryable: cat === "transient" || cat === "rate_limit", matched: re.exec(text)[0].slice(0, 40) };
  return { category: "permanent", retryable: false, matched: null };
}
// what the system does next and what it must NOT do. Owner actions are offered, never taken.
export function nextStep(category, { missing_asset = false } = {}) {
  const forbidden = ["grant unrestricted tools or flags automatically", "regenerate the whole film", "resubmit a paid provider request whose outcome is unknown"];
  switch (category) {
    case "transient": return { action: "retry_with_backoff", bounded: true, owner_action: null, forbidden };
    case "rate_limit": return { action: "wait", owner_action: null, note: "waiting on the provider; a reset time is only shown when the provider gave one", forbidden };
    case "permission": return { action: "stop_and_ask", owner_action: "review the specific permission this step needs and grant only that, or choose a path that does not need it", forbidden };
    case "invalid_input": return { action: missing_asset ? "restore_or_regenerate_that_asset_only" : "fix_the_input", owner_action: "replace or repair the named input", forbidden };
    case "budget": return { action: "pause_keep_assets", owner_action: "raise the spend limit or accept a cheaper path; nothing produced is deleted", forbidden };
    default: return { action: "stop", owner_action: "read the failure; this is not retried automatically", forbidden };
  }
}
// repeated failure = the SAME operation (same input digest, category and normalized message) failing again with NO checkpoint progress in between. A slow job that keeps advancing its checkpoint is not "repeating".
export function repeatedFailure(job, { threshold = 3 } = {}) {
  const f = (job && job.failures) || [];
  const last = f[f.length - 1]; if (!last) return { repeated: false };
  const same = []; for (let i = f.length - 1; i >= 0 && f[i].sig === last.sig; i--) same.unshift(f[i]);
  let stuck = 1; for (let i = same.length - 1; i > 0 && same[i].checkpoint === same[i - 1].checkpoint; i--) stuck++;
  return { repeated: stuck >= threshold, count: stuck, category: last.category, sig: last.sig, note: stuck >= threshold ? "the same operation failed the same way with no progress: stop retrying and show the owner the failure" : "" };
}
// fail a job WITH its class. budget pauses (hold, no retry used, spend pause on the run); permission / invalid_input / permanent do not retry on their own; transient and rate_limit use the bounded backoff.
export function failWithClass(run, id, lease, err, { provider_in_flight = false, force_category = null } = {}) {
  const c = FAILURE_CATEGORIES.includes(force_category) ? { category: force_category, retryable: force_category === "transient" || force_category === "rate_limit" } : classifyFailure(err);
  const r = Jobs.fail(run, id, lease, { error: redact(typeof err === "string" ? err : (err && err.message) || "error"), transient: c.retryable, provider_in_flight, category: c.category });
  if (c.category === "budget") try { setPause(run, true, "spend_limit"); } catch {}
  const rec = Jobs.readJob(run, id);
  const rep = repeatedFailure(rec);
  return { ...r, category: c.category, next: nextStep(c.category), ...(rep.repeated ? { repeated_failure: rep } : {}) };
}
export function rateLimitReport(run, now = Date.now()) {
  return POOL_ORDER.map((p) => ({ pool: p, ...throttleState(run, p, now) })).filter((t) => t.throttled).map((t) => ({ pool: t.pool, reason: t.reason, source: t.source, ...(t.reset_known ? { retry_after_s: t.retry_after_s } : { retry_after_s: null, note: "no reset time was given by the provider" }) }));
}

// ---- migrations: idempotent, versioned, reversible ----------------------------------------------------------------------------------
const MIGRATIONS = [
  { id: "001-job-completion-basis", describe: "completed jobs gain a `completion.basis` (legacy_unverified when no manifest basis was recorded), so old films read unchanged and are never reported as verified",
    files: (run) => Jobs.listJobs(run).filter((j) => j.state === "completed" && !j.completion).map((j) => path.join("crew", "jobs", `${j.job_id}.json`)),
    up: (run, rel) => { const f = R(run, rel), j = rj(f); if (!j || j.completion) return false; j.completion = { basis: "legacy_unverified", at: nowIso(), migrated: true }; atomicWrite(f, JSON.stringify(j, null, 2) + "\n"); return true; } },
  { id: "002-jsonl-torn-tail", describe: "a torn final line in the edit log / ledger is cut off; the original is kept next to it",
    files: (run) => ["motion/edits.jsonl", "crew/ledger.jsonl", "director-events.jsonl"].filter((rel) => readJsonl(R(run, rel)).torn_tail),
    up: (run, rel) => repairJsonlTail(R(run, rel)).repaired },
];
const schemaFile = (run) => R(run, "crew", "schema.json");
export function migrationPlan(run) {
  const applied = (rj(schemaFile(run)) || {}).applied || [];
  return { schema_version: 1, applied: applied.map((a) => a.id), pending: MIGRATIONS.filter((m) => !applied.some((a) => a.id === m.id)).map((m) => ({ id: m.id, describe: m.describe, files: m.files(run) })).filter((m) => m.files.length) };
}
export function migrate(run, { apply = false, id = null } = {}) {
  const plan = migrationPlan(run);
  if (!apply) return { ...plan, applied_now: [], dry: true };
  const state = rj(schemaFile(run)) || { schema_version: 1, applied: [] };
  const done = [];
  for (const m of MIGRATIONS.filter((x) => !id || x.id === id)) {
    const files = m.files(run); if (!files.length) continue;
    const backup = R(run, "crew", "migrations", m.id);
    for (const rel of files) { const src = R(run, rel); try { fs.mkdirSync(path.join(backup, path.dirname(rel)), { recursive: true }); fs.copyFileSync(src, path.join(backup, rel)); } catch {} }
    const changed = files.filter((rel) => { try { return m.up(run, rel); } catch { return false; } });
    const post = {}; for (const rel of changed) { try { post[rel] = sha256File(R(run, rel)); } catch {} }
    state.applied = [...state.applied.filter((a) => a.id !== m.id), { id: m.id, at: nowIso(), files: changed, post, backup: path.relative(R(run), backup) }];
    done.push({ id: m.id, changed });
  }
  atomicWrite(schemaFile(run), JSON.stringify(state, null, 2) + "\n");
  return { ...migrationPlan(run), applied_now: done };
}
// restore the originals a migration copied aside, and forget it. Files that changed since are NOT overwritten (reported instead).
export function rollbackMigration(run, id) {
  const state = rj(schemaFile(run)); const rec = state && state.applied.find((a) => a.id === id);
  if (!rec) return { ok: false, reason: "not_applied" };
  const restored = [], skipped = [];
  for (const rel of rec.files || []) {
    const bak = R(run, rec.backup, rel), dst = R(run, rel);
    if (!fs.existsSync(bak)) { skipped.push({ file: rel, why: "backup missing" }); continue; }
    let now = null; try { now = sha256File(dst); } catch {}
    if (rec.post && rec.post[rel] && now !== rec.post[rel]) { skipped.push({ file: rel, why: "changed since the migration: not overwritten" }); continue; }
    atomicWrite(dst, fs.readFileSync(bak)); restored.push(rel);
  }
  state.applied = state.applied.filter((a) => a.id !== id);
  atomicWrite(schemaFile(run), JSON.stringify(state, null, 2) + "\n");
  return { ok: true, restored, skipped };
}
