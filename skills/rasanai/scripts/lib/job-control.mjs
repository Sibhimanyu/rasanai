// Plan 10 U5/U6: the engine side of the recovery controls and of "what is the film doing right now", from ACTUAL job and queue state (Plan 09 files), never from a guess.
//   runStatus(run)            Working | Waiting for you | Paused | Rate-limited | Stopped | Failed, with the reason and the evidence it came from
//   handleJobControl(action)  { kind: "job-control", value: { op: pause|resume|cancel|retry|logs|capabilities, job_id?, approve_duplicate? } }
//   redact(text)              no credentials or private paths reach a UI string
// Boundaries: cancel acts only on a job of THIS run; a job on a shared external queue is marked, never interrupted globally (jobs.cancelObsolete); retry never resubmits a provider job
// whose outcome is unknown without the person's approval. Pause stops new starts (crew/pause.json); running work finishes.
import fs from "node:fs";
import path from "node:path";
import { listJobs, readJob, cancelObsolete, requeue, ACTIVE } from "./jobs.mjs";
import { pauseState, setPause, throttleState, POOL_ORDER } from "./resource-pools.mjs";
import { registryReport, uiState, blockedBy } from "./capabilities.mjs";
import { reconcileRun } from "./recovery.mjs"; // Plan 11 R1

const arr = (x) => (Array.isArray(x) ? x : []);
const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

// credentials, tokens and private absolute paths -> placeholders (Plan 11 R4: the one policy lives in lib/redact.mjs)
import { redact } from "./redact.mjs";
export { redact };

// -> { state, label, reason, evidence:{...} } ; precedence: Failed (nothing active) > Paused > Rate-limited > Working > Waiting for you > Stopped
export function runStatus(run, { userWaits = null, now = Date.now() } = {}) {
  const jobs = listJobs(run);
  const active = jobs.filter((j) => ACTIVE.has(j.state));
  const failed = jobs.filter((j) => j.state === "failed" || j.state === "unknown_outcome");
  const pause = pauseState(run);
  const limited = POOL_ORDER.map((p) => ({ pool: p, ...throttleState(run, p, now) })).filter((t) => t.throttled);
  const schedule = rj(path.join(path.resolve(String(run)), "crew", "schedule.json")) || {};
  const waits = userWaits || arr(schedule.user_waits);
  const evidence = { active: active.length, failed: failed.map((j) => ({ job_id: j.job_id, node: j.node_id, state: j.state })), paused: pause.paused, rate_limited: limited.map((t) => t.pool), waiting_on: waits.map((w) => w.call || w), jobs: jobs.length };
  if (failed.length && !active.length) return { state: "failed", label: "Failed", reason: failed.some((j) => j.state === "unknown_outcome") ? "A request may or may not have reached the provider. Check it before trying again." : "A step failed. You can retry it.", evidence };
  if (pause.paused) return { state: "paused", label: "Paused", reason: "Nothing new starts. Work already running finishes.", evidence };
  if (limited.length) { const t = limited[0]; return { state: "rate_limited", label: "Rate-limited", reason: t.reset_known ? `The provider asked us to wait about ${t.retry_after_s}s.` : "The provider is limiting requests and gave no reset time; we are backing off on our own schedule.", evidence: { ...evidence, retry_after_s: t.retry_after_s, reset_known: !!t.reset_known, source: t.source } }; }
  if (active.length) return { state: "working", label: "Working", reason: `${active.length} step${active.length === 1 ? "" : "s"} running.`, evidence };
  if (waits.length) return { state: "waiting_for_you", label: "Waiting for you", reason: "A call is waiting for your decision.", evidence };
  return { state: "stopped", label: "Stopped", reason: jobs.length ? "No step is running." : "Nothing is scheduled.", evidence };
}

// the person's ready/unavailable view: only usable adapters are ready; every other one says why in plain words and what to do instead
export function capabilitiesView(opts = {}) {
  const rep = registryReport(opts);
  const items = arr(rep.details).map((c) => {
    const st = uiState(c), b = blockedBy(c);
    return {
      id: c.id, label: redact(c.label), kind: c.kind, state: st, ready: st === "ready",
      usable: st === "ready" || st === "experimental",
      explanation: st === "ready" ? "Ready." : st === "experimental" ? "Usable, but not yet verified on real footage." : st === "test_only" ? "A stand-in for testing; it is never offered for a real film." : redact(`Not available: ${b ? b.reason : "unknown"}`),
      alternative: st === "unavailable" ? "The built-in code-rendered path can make this film without it." : null,
    };
  });
  return { schema_version: 1, generated_at: new Date().toISOString(), items };
}

export function jobLog(run, id, { tail = 60 } = {}) {
  const rec = readJob(run, id);
  if (!rec) return { ok: false, error: "no such job in this film" };
  const dir = path.join(path.resolve(String(run)), "crew", "jobs", "attempts");
  let lines = [];
  try { for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(`${id}-a`)).sort()) lines = lines.concat(fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean)); } catch {}
  return { ok: true, job_id: id, state: rec.state, lines: lines.slice(-tail).map(redact) };
}

// action: { kind|type: "job-control", value: { op, job_id, approve_duplicate } }. -> { ok, ... } ; the console records it in the feed
export function handleJobControl(action, { run } = {}) {
  const v = action && action.value && typeof action.value === "object" ? action.value : {};
  if (!run) return { ok: false, error: "run is required" };
  switch (v.op) {
    case "pause": return { ok: true, op: "pause", pause: setPause(run, true, "studio"), note: "Nothing new starts; running work finishes." };
    case "resume": return { ok: true, op: "resume", pause: setPause(run, false, "studio") };
    case "cancel": {
      const rec = v.job_id ? readJob(run, String(v.job_id)) : null;
      if (!rec) return { ok: false, error: "that job is not part of this film, so it cannot be cancelled here" };
      const r = cancelObsolete(run, { node_ids: [rec.node_id], reason: "cancelled by the person" });
      let stopped = null;
      for (const c of r.cancelled) if (c.job_id === rec.job_id && c.stop_pid) { try { process.kill(c.stop_pid, "SIGTERM"); stopped = c.stop_pid; } catch {} }
      return { ok: true, op: "cancel", job_id: rec.job_id, cancelled: r.cancelled.map((c) => c.job_id), provider_marked: r.provider_marked.map((p) => p.job_id), stopped_local_process: !!stopped,
        note: r.provider_marked.length ? "This ran on a shared queue: it was marked cancelled here and left to finish there. Nothing global was interrupted." : "Cancelled." };
    }
    case "retry": {
      if (!v.job_id) return { ok: false, error: "job_id is required" };
      const r = requeue(run, String(v.job_id), { explicit_approval: v.approve_duplicate === true });
      return r.ok ? { ok: true, op: "retry", ...r } : { ok: false, op: "retry", error: r.reason === "unknown_outcome_needs_approval" ? "This request may already be running at the provider. Retrying could do the work twice; approve that explicitly to continue." : `Cannot retry: ${r.reason}`, ...r };
    }
    case "recover": { // Plan 11 R1: a report by default (the same read-only view as scripts/diagnose.mjs); the person's explicit apply marks interrupted jobs and finishes or rolls back an unfinished publication
      const r = reconcileRun(run, { apply: v.apply === true });
      return { ok: true, op: "recover", applied: v.apply === true, by_state: r.by_state, resume: r.resume, actions: r.actions.map((a) => ({ job_id: a.job_id, action: a.action, applied: a.applied })), note: r.actions.length ? (v.apply === true ? "Interrupted work was marked and publications were reconciled. Nothing restarted at the Brief." : "Some work was interrupted. Apply recovery to mark it; nothing is re-run without you.") : "Nothing needs recovery." };
    }
    case "logs": return { op: "logs", ...jobLog(run, String(v.job_id || ""), { tail: Number(v.tail) || 60 }) };
    case "capabilities": {
      const view = capabilitiesView();
      try { fs.mkdirSync(path.join(path.resolve(String(run)), "crew"), { recursive: true }); fs.writeFileSync(path.join(path.resolve(String(run)), "crew", "capabilities.json"), JSON.stringify(view, null, 2) + "\n"); } catch {}
      return { ok: true, op: "capabilities", ready: view.items.filter((i) => i.ready).length, unavailable: view.items.filter((i) => i.state === "unavailable").length };
    }
    default: return { ok: false, error: "op must be pause, resume, cancel, retry, recover, logs or capabilities" };
  }
}
