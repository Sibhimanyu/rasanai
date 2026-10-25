// Resource pools (Plan 09 P3/P9). One deterministic place that says how much of each heavy resource a production may use at once, and admits or refuses work.
//
// REUSES lib/slot.mjs (the cross-process PID-lock semaphore): a pool is a slot folder there; the render pool IS the old render-slot folder, so finish.mjs, reel.mjs and
// the fragment renderer all share one cap on this machine, across films. Nothing here is a second limiter.
//
//   POOLS            model_job, browser_capture, video_render, encode, neural   (sizes are PROPOSED starting values, env-overridable, calibrated in Plan 14)
//   ADMIT            admission reason codes (stable strings the Studio and the ledger can show)
//   QUEUE_STATES     queued, admitted, running, paused, resource_blocked, cancelled, unknown_outcome, done, failed
//   preAdmission(run, need)           user pause, provider throttle, budget: refused BEFORE a slot is touched
//   renderUnits({workers})            a render's internal workers are accounted, not invisible
//   reserveBundle(needs, opts)        all-or-nothing, stable order, never hold-and-wait (no deadlock), re-entrant outer slot is not counted twice
//   superviseProcess(spec)            a deterministic supervisor: admit, run, emit real progress events (no LLM polling), record peak memory, never bypass the cap
//   queueSnapshot(), fairness lives in slot.mjs fairOrder()
//
// Fail-closed: when a pool cannot admit, the result is queued | resource_blocked | cancelled with a reason code. It is never "run anyway". The only way the cap is
// not applied is the person's explicit RASANAI_RENDER_SLOTS=0 / RASANAI_SLOTS_<POOL>=0, which is reported on the handle.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { tryAcquireManaged, acquireManaged, slotStatus, slotCount, freeMemBytes } from "./slot.mjs";

export const POOLS = Object.freeze({
  model_job: { slot_pool: "model_job", default_size: 3, min_free_mb: 0, basis: "proposed", note: "agent / generation jobs. Starting size follows the policy's build_workers (lib/graph.mjs chooseWorkers); expanded only for ready independent tasks" },
  browser_capture: { slot_pool: "browser_capture", default_size: 2, min_free_mb: 1000, basis: "proposed", note: "headless Chrome capture, screenshots, frame checks" },
  video_render: { slot_pool: "", default_size: null, min_free_mb: 1500, basis: "existing", note: "hyperframes render: the original render slots (RASANAI_RENDER_SLOTS), shared with finish.mjs and reel.mjs" },
  encode: { slot_pool: "encode", default_size: 2, min_free_mb: 500, basis: "proposed", note: "ffmpeg encodes, concat, mux" },
  neural: { slot_pool: "neural", default_size: 1, min_free_mb: 3000, basis: "proposed", note: "optional local neural work (tracking, matting, generation); absent capability means this pool is never used" },
});
// the one global acquisition order. Every bundle is taken in this order, so two tasks can never wait on each other's pools.
export const POOL_ORDER = Object.freeze(["model_job", "browser_capture", "video_render", "encode", "neural"]);

export const ADMIT = Object.freeze({
  admitted: "admitted: every pool in the bundle had room",
  pool_full: "queued: the pool's slots are all held",
  fair_share_wait: "queued: older, higher-priority or less-served films are ahead",
  memory_pressure: "queued: free memory is under the pool's floor (no slot is held while waiting)",
  memory_pressure_timeout: "resource_blocked: memory stayed under the floor for the whole wait",
  slot_dir_unwritable: "resource_blocked: the slot folder is not writable, so the limiter cannot work",
  demand_exceeds_pool: "resource_blocked: the task needs more units than the pool has: pick a lower-resource setting",
  wait_timeout: "queued: the wait window ended; the job stays queued (never run past the cap)",
  cancelled_while_queued: "cancelled: the person or an upstream revision cancelled it while it waited",
  user_paused: "paused: the person paused production; running work finishes, nothing new starts",
  provider_throttled: "queued: the provider asked to slow down (retry-after in the throttle file)",
  budget_unavailable: "resource_blocked: the remaining spend allowance cannot cover this job's reservation",
  budget_unknown_conservative: "admitted conservatively: subscription usage is unknown, so concurrency is held low",
  limiter_disabled_by_config: "admitted: the person turned the limiter off (slots=0)",
  unknown_pool: "resource_blocked: no such pool",
});
export const QUEUE_STATES = Object.freeze(["queued", "admitted", "running", "paused", "resource_blocked", "cancelled", "unknown_outcome", "done", "failed"]);
export const stateOfCode = (code) => (/timeout$/.test(code) && code.startsWith("memory") ? "resource_blocked" : { pool_full: "queued", fair_share_wait: "queued", memory_pressure: "queued", wait_timeout: "queued", provider_throttled: "queued", user_paused: "paused", cancelled_while_queued: "cancelled", admitted: "admitted", budget_unknown_conservative: "admitted", limiter_disabled_by_config: "admitted" }[code] || "resource_blocked");

const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { const t = Date.now() + ms; while (Date.now() < t); } };

export const poolSize = (name) => { const p = POOLS[name]; return p ? slotCount(p.slot_pool, p.default_size) : 0; };

// A render's INTERNAL workers (hyperframes --workers N) multiply load invisibly if the pool counts one slot per render. units = ceil(workers / WORKERS_PER_UNIT).
// workers unknown ("auto"): ONE unit and the reservation says so (we cannot see inside the renderer), never a precise-looking number.
export const WORKERS_PER_UNIT = () => Math.max(1, Number(process.env.RASANAI_WORKERS_PER_RENDER_UNIT) || 2);
export function renderUnits({ workers = null, pool = "video_render" } = {}) {
  const w = Number(workers);
  if (!Number.isFinite(w) || w <= 0) return { units: 1, internal_workers: "unknown", unaccounted: true, note: "the renderer picks its own worker count; counted as one unit and flagged unaccounted" };
  return { units: Math.max(1, Math.ceil(w / WORKERS_PER_UNIT())), internal_workers: w, unaccounted: false, note: `${w} internal worker(s) = ${Math.ceil(w / WORKERS_PER_UNIT())} unit(s) of the ${pool} pool` };
}

// ---- control files the person or the provider layer writes (read here, never invented) ---------------------------------------------------
export const controlDir = (run) => path.join(path.resolve(String(run || ".")), "crew");
export const pauseState = (run) => { const j = rj(path.join(controlDir(run), "pause.json")); return j && j.paused === true ? { paused: true, since: j.since || null, by: j.by || "user" } : { paused: false }; };
export function setPause(run, paused, by = "user") {
  fs.mkdirSync(controlDir(run), { recursive: true });
  fs.writeFileSync(path.join(controlDir(run), "pause.json"), JSON.stringify({ paused: !!paused, since: new Date().toISOString(), by }, null, 2) + "\n");
  return pauseState(run);
}
export function throttleState(run, pool, now = Date.now()) {
  const j = rj(path.join(controlDir(run), "throttle.json")) || {};
  const t = j[pool];
  const until = t && t.until ? Date.parse(t.until) : NaN;
  // Plan 11 R2: reset_known is true ONLY when the provider (or the person) gave a retry-after; otherwise `until` is our own bounded backoff and is reported as that, never as a provider reset time
  return Number.isFinite(until) && until > now ? { throttled: true, until: t.until, reason: t.reason || "provider rate limit", retry_after_s: Math.ceil((until - now) / 1000), reset_known: t.reset_known !== false && t.source !== "default_backoff", source: t.source || "unspecified" } : { throttled: false };
}
// retryAfterS: the provider's own number; omit (null) when it gave none: the wait is then a labelled default backoff (60 s), not a claimed reset time
export function recordThrottle(run, pool, retryAfterS, reason = "provider rate limit", { source = null } = {}) {
  fs.mkdirSync(controlDir(run), { recursive: true });
  const f = path.join(controlDir(run), "throttle.json"), cur = rj(f) || {};
  const given = Number(retryAfterS) > 0;
  cur[pool] = { until: new Date(Date.now() + (given ? Number(retryAfterS) : 60) * 1000).toISOString(), reason, reset_known: given, source: source || (given ? "provider_retry_after" : "default_backoff") };
  const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(cur, null, 2) + "\n"); fs.renameSync(tmp, f);
  return cur[pool];
}

// pre-admission: refused before any slot is touched. need: [{ pool, units }]. -> { ok:true } | { ok:false, state, reason_code, detail }
export function preAdmission(run, needs = []) {
  const unknown = needs.find((n) => !POOLS[n.pool]);
  if (unknown) return { ok: false, state: "resource_blocked", reason_code: "unknown_pool", detail: String(unknown.pool) };
  if (run) {
    const p = pauseState(run);
    if (p.paused) return { ok: false, state: "paused", reason_code: "user_paused", detail: `paused since ${p.since || "?"}` };
    for (const n of needs) { const t = throttleState(run, n.pool); if (t.throttled) return { ok: false, state: "queued", reason_code: "provider_throttled", detail: `${n.pool}: ${t.reason}, retry in ~${t.retry_after_s} s` }; }
  }
  return { ok: true };
}

// ---- bundles -------------------------------------------------------------------------------------------------------------------------
// needs: [{ pool, units }] -> normalised, merged per pool, sorted in POOL_ORDER (a bundle names each pool once: no nested double count)
export function normalizeNeeds(needs = []) {
  const m = new Map();
  for (const n of needs) { if (!n || !n.pool) continue; m.set(n.pool, (m.get(n.pool) || 0) + Math.max(1, Math.floor(Number(n.units) || 1))); }
  return [...m.entries()].map(([pool, units]) => ({ pool, units })).sort((a, b) => (POOL_ORDER.indexOf(a.pool) + 100 * (POOL_ORDER.indexOf(a.pool) < 0)) - (POOL_ORDER.indexOf(b.pool) + 100 * (POOL_ORDER.indexOf(b.pool) < 0)));
}
// One attempt, in stable order, non-blocking. If any pool refuses, everything taken so far is released before returning (no hold-and-wait).
export function tryBundle(needs, { film = null, label = "task", priority = "normal" } = {}) {
  const taken = [];
  const rel = () => { for (const h of taken.reverse()) { try { h.release(); } catch {} } };
  for (const n of normalizeNeeds(needs)) {
    const def = POOLS[n.pool];
    const r = tryAcquireManaged({ pool: def.slot_pool, units: n.units, count: def.default_size, min_free_mb: def.min_free_mb, label: `${label}:${n.pool}`, film, priority });
    if (!r.ok) { rel(); return { ok: false, state: r.state, reason_code: r.reason_code, detail: r.detail || "", blocked_on: n.pool }; }
    taken.push(r.handle);
  }
  return {
    ok: true, handles: taken.slice(), pools: normalizeNeeds(needs),
    verify: () => taken.every((h) => h.verify()), // fencing: still the owner of every slot
    release: () => { for (const h of [...taken].reverse()) { try { h.release(); } catch {} } },
  };
}
export function reserveBundleSync(needs, { run = null, film = null, label = "task", priority = "normal", timeoutMs = 3600 * 1000, shouldCancel = null, log = (s) => process.stderr.write(s + "\n") } = {}) {
  const t0 = Date.now();
  let said = false, memSince = null;
  for (;;) {
    if (shouldCancel && shouldCancel()) return { ok: false, state: "cancelled", reason_code: "cancelled_while_queued", waited_s: (Date.now() - t0) / 1000 };
    const pre = preAdmission(run, normalizeNeeds(needs));
    let r;
    if (!pre.ok) r = pre;
    else { r = tryBundle(needs, { film, label, priority }); if (r.ok) return { ...r, waited_s: Math.round((Date.now() - t0) / 100) / 10, reason_code: "admitted" }; }
    if (r.state === "resource_blocked") return { ...r, waited_s: (Date.now() - t0) / 1000 };
    if (r.reason_code === "memory_pressure") { memSince = memSince || Date.now(); if (Date.now() - memSince > 5 * 60 * 1000) return { ok: false, state: "resource_blocked", reason_code: "memory_pressure_timeout", detail: r.detail, waited_s: (Date.now() - t0) / 1000 }; } else memSince = null;
    if (Date.now() - t0 > timeoutMs) return { ok: false, state: r.state === "paused" ? "paused" : "queued", reason_code: r.state === "paused" ? "user_paused" : "wait_timeout", timed_out: true, waited_s: (Date.now() - t0) / 1000, detail: r.detail || "" };
    if (!said) { said = true; log(`ADMISSION ${r.state} (${r.reason_code}) ${label}: ${r.detail || ADMIT[r.reason_code] || ""}`); }
    // jittered, so two bundles that conflict do not retry in lockstep (stable order already rules out deadlock; this rules out a livelock)
    sleepSync(1500 + Math.floor(Math.random() * 1500));
  }
}

// ---- the supervisor ------------------------------------------------------------------------------------------------------------------
const rssMb = (pid) => { try { const r = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }); const k = Number(String(r.stdout).trim()); return Number.isFinite(k) && k > 0 ? Math.round(k / 1024) : null; } catch { return null; } };
// spec: { job_id, cmd, args, cwd, env, needs: [{pool, units}], run, film, label, priority, heartbeat_s, emit(event), shouldCancel(), timeoutMs, on_blocked: "queue" (default) }
// Emits real events only: queued/blocked (with reason code), admitted (with waited_s and each pool's fencing generation), started, heartbeat (child's rss, no model involved),
// finished (exit code, duration_s, peak_rss_mb) | failed | cancelled. -> { ok, state, exit_code, reason_code, duration_s, peak_rss_mb, queue_wait_s, generations }
export async function superviseProcess(spec) {
  const emit = typeof spec.emit === "function" ? spec.emit : () => {};
  const base = { job_id: spec.job_id || null, label: spec.label || null, film: spec.film || null };
  const needs = normalizeNeeds(spec.needs || [{ pool: "video_render", units: 1 }]);
  emit({ ...base, type: "queued", state: "queued", pools: needs, at: new Date().toISOString() });
  const t0 = Date.now();
  const got = reserveBundleSync(needs, { run: spec.run, film: spec.film, label: spec.label || "task", priority: spec.priority || "normal", timeoutMs: spec.timeoutMs, shouldCancel: spec.shouldCancel, log: () => {} });
  if (!got.ok) {
    emit({ ...base, type: got.state === "cancelled" ? "cancelled" : "blocked", state: got.state, reason_code: got.reason_code, detail: got.detail || ADMIT[got.reason_code] || "", at: new Date().toISOString() });
    return { ok: false, state: got.state, reason_code: got.reason_code, queue_wait_s: got.waited_s ?? null, detail: got.detail || "" };
  }
  const generations = Object.fromEntries(got.handles.map((h, i) => [got.pools[i].pool, h.generation ?? null]));
  emit({ ...base, type: "admitted", state: "admitted", queue_wait_s: got.waited_s, generations, at: new Date().toISOString() });
  const env = { ...process.env, ...(spec.env || {}), RASANAI_MANAGED: "1" };
  const video = got.handles.find((h) => h.pool === "video_render" && h.token);
  if (video) env.RASANAI_SLOT_OWNER = `|${video.token}`; // a nested managed render sees the outer slot as its own (not counted twice)
  const started = Date.now();
  let peak = null, killed = false;
  try {
    const child = spawn(spec.cmd, spec.args || [], { cwd: spec.cwd, env, stdio: spec.stdio || "inherit" });
    emit({ ...base, type: "started", state: "running", pid: child.pid, at: new Date().toISOString() });
    const hb = setInterval(() => {
      const m = rssMb(child.pid); if (m !== null && (peak === null || m > peak)) peak = m;
      if (!got.verify()) { killed = true; try { child.kill("SIGTERM"); } catch {} emit({ ...base, type: "lease_lost", state: "failed", detail: "a slot was reclaimed from under this job; stopping it so its output cannot be published", at: new Date().toISOString() }); return; }
      if (spec.shouldCancel && spec.shouldCancel()) { killed = true; try { child.kill("SIGTERM"); } catch {} return; }
      emit({ ...base, type: "heartbeat", state: "running", elapsed_s: Math.round((Date.now() - started) / 1000), rss_mb: m, at: new Date().toISOString() });
    }, Math.max(1, Number(spec.heartbeat_s) || 15) * 1000);
    hb.unref();
    const code = await new Promise((resolve) => { child.on("error", () => resolve(127)); child.on("close", (c, sig) => resolve(c === null ? (sig ? 128 : 1) : c)); });
    clearInterval(hb);
    const duration_s = Math.round((Date.now() - started) / 100) / 10;
    const state = killed ? "cancelled" : code === 0 ? "done" : "failed";
    emit({ ...base, type: killed ? "cancelled" : code === 0 ? "finished" : "failed", state, exit_code: code, duration_s, peak_rss_mb: peak, at: new Date().toISOString() });
    return { ok: code === 0 && !killed, state, exit_code: code, duration_s, peak_rss_mb: peak, queue_wait_s: got.waited_s, generations, reason_code: "admitted" };
  } finally { got.release(); }
}

// ONE pool, awaited, fail-closed: for the single-resource steps (a scene render, an ffmpeg concat) that previously called acquireSlot and carried on without a slot.
// Resolves to the handle; a refusal THROWS an Error with .resource_blocked = true, .state and .reason_code (the caller marks the job queued / resource_blocked / cancelled
// and reports it; nothing renders past the cap).
export async function admitPool(poolName, { label = "task", film = null, units = 1, priority = "normal", timeoutMs, shouldCancel, log, run = null } = {}) {
  const def = POOLS[poolName];
  if (!def) { const e = new Error(`unknown resource pool ${JSON.stringify(poolName)}`); e.resource_blocked = true; e.state = "resource_blocked"; e.reason_code = "unknown_pool"; throw e; }
  const pre = preAdmission(run, [{ pool: poolName, units }]);
  if (!pre.ok) { const e = new Error(`${pre.state}: ${pre.reason_code} ${pre.detail || ""}`); e.resource_blocked = true; e.state = pre.state; e.reason_code = pre.reason_code; throw e; }
  const r = await acquireManaged({ pool: def.slot_pool, count: def.default_size, min_free_mb: def.min_free_mb, units, label, film, priority, timeoutMs, shouldCancel, log });
  if (!r.ok) { const e = new Error(`${r.state}: ${r.reason_code} ${r.detail || ADMIT[r.reason_code] || ""}`.trim()); e.resource_blocked = true; e.state = r.state; e.reason_code = r.reason_code; throw e; }
  return r.handle;
}

// who holds what, who waits (all pools): the data the Studio queue states and the evidence hooks read
export function queueSnapshot() {
  const out = {};
  for (const name of POOL_ORDER) { const d = POOLS[name]; const st = slotStatus(d.slot_pool); out[name] = { size: poolSize(name), holders: st.holders.map((h) => ({ film: h.film || null, label: h.label || null, gen: h.gen ?? null, since: h.since || null })), waiting: (st.queue || []).map((t) => ({ film: t.film || null, label: t.label || null, priority: t.priority, units: t.units || 1, since: t.since })) }; }
  return { schema_version: 1, pools: out, free_mb: Math.round(freeMemBytes() / 2 ** 20), cpus: os.cpus().length, at: new Date().toISOString() };
}
export const newJobId = () => "job-" + crypto.randomBytes(6).toString("hex");
