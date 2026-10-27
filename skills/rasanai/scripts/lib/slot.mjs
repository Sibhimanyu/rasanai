// Render slots: a cross-process cap on how many `hyperframes render`s run at once on this machine, so two films (or a finish
// pass and a reel build) never fight over the CPU and the RAM and both crash. A PID-lock semaphore in the temp folder:
//   - N slot files (default 2 on a machine with 8+ cores and 16+ GB, else 1; RASANAI_RENDER_SLOTS=<n> overrides, 0 turns the limiter off),
//   - a slot is a file made with O_EXCL holding {pid, label, since}; the holder deletes it when it is done (and on exit/Ctrl-C),
//   - stale takeover: a slot whose holder PID is gone is taken over at once; an async holder also beats (utimes every 15 s) and a
//     slot not beaten for 10 minutes is taken over; any slot older than 6 hours is taken over (a reused PID),
//   - a free-memory gate: after a slot is won, wait until at least RASANAI_RENDER_MIN_FREE_MB (default 1500) is free (macOS: free +
//     inactive + speculative pages from vm_stat; Linux: MemAvailable), for at most 5 minutes, then go on with a note (a gate never deadlocks a film).
// Sync API (the scripts that shell out with spawnSync cannot beat while they wait, so they rely on the PID check):
//   const s = acquireSlotSync({ label: "finish" }); try { ... } finally { s.release(); }
//   const s = await acquireSlot({ label }); ...                                   (async: beats while held)
//   node slot.mjs run [--label x] -- <command> [args...]    run any command (e.g. npx hyperframes render ...) inside a slot; exit code passes through
//   node slot.mjs status                                     slots, holders, free memory (JSON)
// Held slots are always released on process exit and on SIGINT/SIGTERM/SIGHUP.
//
// PLAN 09 (P3/P9): the same limiter now also serves named POOLS and a FAIL-CLOSED "managed" mode. The legacy path above is unchanged
// (an old caller that passes nothing still runs on without a slot after an unwritable folder, a wait timeout or a low-memory wait).
// The MANAGED production path (opts.managed === true, or RASANAI_MANAGED=1 which the job supervisor sets for its children) never
// continues without a slot: it returns { ok:false, state:"queued"|"resource_blocked", reason_code } instead (see ADMIT in
// lib/resource-pools.mjs for the code list), and the caller queues, cancels or makes an explicit lower-resource choice.
//   - a pool is a sub-folder of slots (pool "" = the original render slots, i.e. the video_render pool); a task may need `units` slots of a pool,
//     taken all-or-nothing (never hold some and wait for the rest);
//   - the lock file carries a random owner token, a per-slot monotonic generation (a fencing token) and the owner's process start time:
//     managed reclamation checks IDENTITY (pid dead, or the pid now belongs to another process), never age alone; release checks the token;
//   - a managed child of a slot holder (RASANAI_SLOT_OWNER=<pool>|<token>, set by runInSlot) is admitted as re-entrant ONLY if that token still
//     owns a slot file, so a nested render is not counted twice and a forged env var is worth nothing;
//   - waiting managed tasks hold a ticket (queue/); admission follows fairOrder(): priority and age, minus what the task's film already holds,
//     so a new interactive preview jumps the line without starving older jobs or other films.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderProcessEnv } from "./containment.mjs";

const BASE_DIR = process.env.RASANAI_SLOT_DIR || path.join(os.tmpdir(), "rasanai-render-slots");
const safePool = (p) => String(p || "").replace(/[^A-Za-z0-9_-]+/g, "-");
const poolDir = (pool) => (pool ? path.join(BASE_DIR, `pool-${safePool(pool)}`) : BASE_DIR);
const DIR = BASE_DIR; // legacy name: the render (video_render) pool
const BEAT_MS = 15000, BEAT_STALE_MS = 10 * 60 * 1000, MAX_AGE_MS = 6 * 3600 * 1000, MEM_WAIT_MS = 5 * 60 * 1000;
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { const t = Date.now() + ms; while (Date.now() < t); } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

// pool "" = the render slots (RASANAI_RENDER_SLOTS). A named pool reads RASANAI_SLOTS_<NAME> else `dflt` (resource-pools.mjs passes its configured size).
export function slotCount(pool = "", dflt = null) {
  const envName = pool ? `RASANAI_SLOTS_${safePool(pool).toUpperCase().replace(/-/g, "_")}` : "RASANAI_RENDER_SLOTS";
  const env = process.env[envName];
  if (env !== undefined && env !== "" && Number.isFinite(Number(env))) return Math.max(0, Math.floor(Number(env)));
  if (pool && Number.isFinite(Number(dflt))) return Math.max(0, Math.floor(Number(dflt)));
  return os.cpus().length >= 8 && os.totalmem() >= 15.5 * 2 ** 30 ? 2 : 1;
}

// bytes a new render can use: free + reclaimable
export function freeMemBytes() {
  try {
    if (process.platform === "darwin") {
      const r = spawnSync("vm_stat", { encoding: "utf8" });
      const page = Number((String(r.stdout).match(/page size of (\d+) bytes/) || [])[1]) || 16384;
      const get = (k) => Number((String(r.stdout).match(new RegExp(`Pages ${k}:\\s+(\\d+)`)) || [])[1]) || 0;
      const pages = get("free") + get("inactive") + get("speculative");
      if (pages > 0) return pages * page;
    } else if (process.platform === "linux") {
      const kb = Number((fs.readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+) kB/) || [])[1]);
      if (kb > 0) return kb * 1024;
    }
  } catch {}
  return os.freemem();
}

function readSlot(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
// the start time of a process, as `ps` reports it: with the pid it identifies one process, so a reused pid is told apart from the real holder
function pidStart(pid) {
  try { const r = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }); const t = String(r.stdout || "").trim(); return t || null; } catch { return null; }
}
const OWN_START = {};
const ownStart = () => (OWN_START.v !== undefined ? OWN_START.v : (OWN_START.v = pidStart(process.pid)));
// identity=true (the managed path): a slot is reclaimable only when its owner is gone or the pid now belongs to another process. Age and a missed heartbeat prove
// nothing about a long render (a paused or busy owner is alive), so they never reclaim a managed slot. Default (legacy): pid gone, 6 h age, or a stale beat.
function stale(f, identity = false) {
  const j = readSlot(f);
  let st; try { st = fs.statSync(f); } catch { return false; } // gone: not stale, just free
  if (!j || !Number.isInteger(j.pid)) return Date.now() - st.mtimeMs > 30000; // half-written files get a moment
  if (!alive(j.pid)) return true;
  if (identity) { if (j.pid_start) { const now = pidStart(j.pid); return !!now && now !== j.pid_start; } return false; }
  if (Date.now() - j.since > MAX_AGE_MS) return true;
  return !!j.beat && Date.now() - st.mtimeMs > BEAT_STALE_MS;
}

const HELD = new Set();
let hooked = false;
function hook() {
  if (hooked) return; hooked = true;
  const drop = () => { for (const h of [...HELD]) h.release(); };
  process.on("exit", drop);
  for (const sg of ["SIGINT", "SIGTERM", "SIGHUP"]) if (!process.listenerCount(sg)) process.on(sg, () => { drop(); process.exit(130); });
}

// one attempt: the slot index won, or -1
function tryTake(n, label, beat, dir = DIR, extra = null, identity = false, only = null) {
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    if (only && !only.has(i)) continue;
    const f = path.join(dir, `slot-${i}.lock`);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = fs.openSync(f, "wx");
        const token = extra && extra.token || crypto.randomBytes(8).toString("hex");
        // the generation is a per-slot fencing token: it only moves while the O_EXCL file is held, so two owners never share one
        let gen = 1; try { gen = (Number(fs.readFileSync(path.join(dir, `slot-${i}.gen`), "utf8")) || 0) + 1; fs.writeFileSync(path.join(dir, `slot-${i}.gen`), String(gen)); } catch { try { fs.writeFileSync(path.join(dir, `slot-${i}.gen`), String(gen)); } catch {} }
        try { fs.writeSync(fd, JSON.stringify({ pid: process.pid, pid_start: ownStart(), token, gen, label: String(label || ""), since: Date.now(), beat: !!beat, ...(extra || {}) })); } finally { fs.closeSync(fd); }
        return { i, f, token, gen };
      } catch (e) {
        if (e.code !== "EEXIST") return null;
        if (stale(f, identity)) { try { fs.rmSync(f, { force: true }); } catch {} continue; } // stale takeover, then one more try at this slot
        break;
      }
    }
  }
  return -1;
}

function finish(taken, n, t0, notes, beat) {
  let timer = null;
  if (beat) { timer = setInterval(() => { try { const t = new Date(); fs.utimesSync(taken.f, t, t); } catch {} }, BEAT_MS); timer.unref(); }
  const h = { slot: taken.i, of: n, token: taken.token, generation: taken.gen, waited_s: Math.round((Date.now() - t0) / 100) / 10, notes, release() { if (timer) clearInterval(timer); HELD.delete(h); const j = readSlot(taken.f); if (j && j.pid === process.pid && (!j.token || j.token === taken.token)) { try { fs.rmSync(taken.f, { force: true }); } catch {} } } };
  HELD.add(h); hook();
  return h;
}
const none = () => ({ slot: -1, of: 0, waited_s: 0, notes: [], release() {} });
const minFree = () => (Number(process.env.RASANAI_RENDER_MIN_FREE_MB) || 1500) * 2 ** 20;

// blocks until a slot is free and memory allows (sync). timeoutMs: give up waiting for a slot after this long (default 3 h) and run anyway, with a note.
export function acquireSlotSync(opts = {}) {
  const { label = "render", timeoutMs = 3 * 3600 * 1000, log = (s) => process.stderr.write(s + "\n") } = opts;
  // PLAN 09: the managed production path is fail-closed; it returns a handle with `blocked: true` (never a silent bypass) when it cannot admit
  if (isManaged(opts)) return asHandle(acquireManagedSync({ ...opts, label, timeoutMs, log }));
  const n = slotCount();
  if (!n) return none();
  const t0 = Date.now(), notes = [];
  let said = false, taken;
  for (;;) {
    taken = tryTake(n, label, false);
    if (taken && taken !== -1) break;
    if (taken === null) { notes.push("render slots: the slot folder is not writable; running without the limiter"); return Object.assign(none(), { notes }); }
    if (Date.now() - t0 > timeoutMs) { notes.push(`render slots: waited ${Math.round(timeoutMs / 60000)} min for a slot; running without one`); return Object.assign(none(), { notes }); }
    if (!said) { said = true; log(`SLOT waiting: ${n} render slot(s) are busy (${label})`); }
    sleepSync(2000 + Math.floor(Math.random() * 1000));
  }
  const h = finish(taken, n, t0, notes, false);
  const mt = Date.now();
  while (freeMemBytes() < minFree()) {
    if (Date.now() - mt > MEM_WAIT_MS) { notes.push(`render slots: only ${Math.round(freeMemBytes() / 2 ** 20)} MB free after waiting 5 min; rendering anyway`); break; }
    if (!said) { said = true; log(`SLOT waiting for free memory (${Math.round(freeMemBytes() / 2 ** 20)} MB free, ${Math.round(minFree() / 2 ** 20)} MB wanted)`); }
    sleepSync(3000);
  }
  h.waited_s = Math.round((Date.now() - t0) / 100) / 10;
  return h;
}

export async function acquireSlot(opts = {}) {
  const { label = "render", timeoutMs = 3 * 3600 * 1000, log = (s) => process.stderr.write(s + "\n") } = opts;
  if (isManaged(opts)) return asHandle(await acquireManaged({ ...opts, label, timeoutMs, log }));
  const n = slotCount();
  if (!n) return none();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now(), notes = [];
  let said = false, taken;
  for (;;) {
    taken = tryTake(n, label, true);
    if (taken && taken !== -1) break;
    if (taken === null) { notes.push("render slots: the slot folder is not writable; running without the limiter"); return Object.assign(none(), { notes }); }
    if (Date.now() - t0 > timeoutMs) { notes.push(`render slots: waited ${Math.round(timeoutMs / 60000)} min for a slot; running without one`); return Object.assign(none(), { notes }); }
    if (!said) { said = true; log(`SLOT waiting: ${n} render slot(s) are busy (${label})`); }
    await sleep(2000 + Math.floor(Math.random() * 1000));
  }
  const h = finish(taken, n, t0, notes, true);
  const mt = Date.now();
  while (freeMemBytes() < minFree()) {
    if (Date.now() - mt > MEM_WAIT_MS) { notes.push(`render slots: only ${Math.round(freeMemBytes() / 2 ** 20)} MB free after waiting 5 min; rendering anyway`); break; }
    await sleep(3000);
  }
  h.waited_s = Math.round((Date.now() - t0) / 100) / 10;
  return h;
}

// ---------------------------------------------------------------- PLAN 09: managed (fail-closed) admission
// opts: { pool, units, label, film, priority: interactive|normal|background, count (pool size when no env override), min_free_mb, timeoutMs,
//         shouldCancel(): bool, log }
// -> { ok:true, handle } | { ok:false, state:"queued"|"resource_blocked"|"cancelled", reason_code, waited_s, notes }
export const isManaged = (o = {}) => (o && o.managed !== undefined ? o.managed === true : process.env.RASANAI_MANAGED === "1");
const asHandle = (r) => (r.ok ? r.handle : { slot: -1, of: 0, waited_s: r.waited_s || 0, notes: r.notes || [], blocked: true, state: r.state, reason_code: r.reason_code, release() {} });
export const PRIORITY_S = Object.freeze({ interactive: 600, normal: 0, background: -120 }); // a head start in seconds of waiting; age still wins eventually (no starvation)
const HOLD_PENALTY_S = 90; // per slot the ticket's film already holds: another film's older or equal ticket goes first

const queueDir = (pool) => path.join(poolDir(pool), "queue");
function liveTickets(pool) {
  const dir = queueDir(pool), out = [];
  let names = []; try { names = fs.readdirSync(dir); } catch { return out; }
  for (const f of names) {
    if (!f.endsWith(".json")) continue;
    const full = path.join(dir, f), t = readSlot(full);
    if (!t || !Number.isInteger(t.pid) || !alive(t.pid) || (t.pid_start && pidStart(t.pid) !== t.pid_start && pidStart(t.pid))) { try { fs.rmSync(full, { force: true }); } catch {} continue; }
    out.push(t);
  }
  return out;
}
function poolHolders(dir, n) {
  const by = new Map();
  for (let i = 0; i < Math.max(n, 1); i++) {
    const f = path.join(dir, `slot-${i}.lock`), j = readSlot(f);
    if (!j || stale(f, true)) continue;
    const k = j.token || `pid${j.pid}-${i}`, e = by.get(k) || { token: k, film: j.film || null, units: 0, pid: j.pid };
    e.units++; by.set(k, e);
  }
  return [...by.values()];
}
// pure: the order in which waiting tickets are admitted. score = seconds waited + priority head start - what the film already holds; ties by age then token.
export function fairOrder(tickets, holders = [], now = Date.now(), opts = {}) {
  const pr = { ...PRIORITY_S, ...(opts.priority_s || {}) }, pen = Number.isFinite(opts.hold_penalty_s) ? opts.hold_penalty_s : HOLD_PENALTY_S;
  const held = {};
  for (const h of holders) held[h.film || ""] = (held[h.film || ""] || 0) + (h.units || 1);
  return (tickets || []).map((t) => ({ ...t, score: (now - t.since) / 1000 + (pr[t.priority] ?? 0) - pen * (held[t.film || ""] || 0) }))
    .sort((a, b) => b.score - a.score || a.since - b.since || String(a.token).localeCompare(String(b.token)));
}
const ownsToken = (dir, n, token) => { for (let i = 0; i < Math.max(n, 1); i++) { const j = readSlot(path.join(dir, `slot-${i}.lock`)); if (j && j.token === token && alive(j.pid)) return true; } return false; };
const blocked = (state, reason_code, extra = {}) => ({ ok: false, state, reason_code, ...extra });

function mkHandle(taken, n, t0, notes, o, units) {
  const dir = poolDir(o.pool || "");
  let timer = null;
  if (o.beat) { timer = setInterval(() => { for (const t of taken) { try { const d = new Date(); fs.utimesSync(t.f, d, d); } catch {} } }, BEAT_MS); timer.unref(); }
  const h = {
    ok: true, pool: o.pool || "video_render", slot: taken[0].i, slots: taken.map((t) => t.i), of: n, units, token: taken[0].token, generation: taken[0].gen, generations: taken.map((t) => t.gen),
    film: o.film || null, waited_s: Math.round((Date.now() - t0) / 100) / 10, notes, blocked: false,
    // the fencing check: this handle still owns every slot file it took (same token and generation); a result is only published while it is true
    verify() { return taken.every((t) => { const j = readSlot(t.f); return !!j && j.token === t.token && j.gen === t.gen && j.pid === process.pid; }); },
    release() { if (timer) clearInterval(timer); HELD.delete(h); for (const t of taken) { const j = readSlot(t.f); if (j && j.pid === process.pid && j.token === t.token) { try { fs.rmSync(t.f, { force: true }); } catch {} } } },
  };
  HELD.add(h); hook();
  return h;
}

// one admission attempt (never waits). ctx = { notes, ticket, t0 }
function attemptManaged(o, ctx) {
  const pool = o.pool || "", dir = poolDir(pool), n = slotCount(pool, o.count);
  const units = Math.max(1, Math.floor(Number(o.units) || 1));
  const own = String(process.env.RASANAI_SLOT_OWNER || "");
  if (own) { const [op, tok] = own.split("|"); if ((op || "") === pool && tok && ownsToken(dir, n, tok)) return { ok: true, handle: { ok: true, pool: pool || "video_render", slot: -1, of: n, units: 0, reentrant: true, token: tok, blocked: false, waited_s: 0, notes: ["re-entrant: an outer process already holds this pool's slot; not counted twice"], verify: () => ownsToken(dir, n, tok), release() {} } }; }
  if (!n) return { ok: true, handle: { ok: true, pool: pool || "video_render", slot: -1, of: 0, units: 0, limiter_off: true, blocked: false, waited_s: 0, notes: [`the ${pool || "render"} limiter is turned off by configuration (slots=0): concurrency is the person's explicit choice`], verify: () => true, release() {} } };
  if (units > n) return blocked("resource_blocked", "demand_exceeds_pool", { detail: `needs ${units} of ${n} ${pool || "video_render"} slot(s): choose a lower-resource setting (fewer renderer workers) or a bigger pool` });
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); } catch { return blocked("resource_blocked", "slot_dir_unwritable", { detail: `the slot folder ${dir} is not writable: refusing to run without the limiter` }); }
  const holders = poolHolders(dir, n), used = holders.reduce((a, h) => a + h.units, 0), free = n - used;
  if (free < units) return blocked("queued", "pool_full", { detail: `${used} of ${n} slot(s) held`, holders: holders.map((h) => ({ film: h.film, units: h.units })) });
  if (ctx.ticket) {
    const order = fairOrder(liveTickets(pool), holders), pos = order.findIndex((t) => t.token === ctx.ticket.token);
    const ahead = pos > 0 ? order.slice(0, pos).reduce((a, t) => a + (t.units || 1), 0) : 0;
    if (pos > 0 && ahead + units > free) return blocked("queued", "fair_share_wait", { detail: `${pos} ticket(s) are ahead (older, higher priority, or from a film holding fewer slots)`, position: pos });
  }
  const need = o.min_free_mb !== undefined ? Number(o.min_free_mb) * 2 ** 20 : pool === "" ? minFree() : 0;
  if (need > 0 && freeMemBytes() < need) return blocked("queued", "memory_pressure", { detail: `${Math.round(freeMemBytes() / 2 ** 20)} MB free, ${Math.round(need / 2 ** 20)} MB wanted; no slot is held while waiting` });
  const token = ctx.ticket ? ctx.ticket.token : crypto.randomBytes(8).toString("hex");
  const taken = [];
  for (let k = 0; k < units; k++) {
    const t = tryTake(n, o.label, !!o.beat, dir, { token, film: o.film || null, pool: pool || "video_render", units, priority: o.priority || "normal" }, true);
    if (t && t !== -1) { taken.push(t); continue; }
    for (const x of taken) { const j = readSlot(x.f); if (j && j.token === token) { try { fs.rmSync(x.f, { force: true }); } catch {} } } // all or nothing: never hold part of a bundle
    return t === null ? blocked("resource_blocked", "slot_dir_unwritable", { detail: "could not create a slot file" }) : blocked("queued", "pool_full", { detail: "another process took the slot first" });
  }
  return { ok: true, handle: mkHandle(taken, n, ctx.t0, ctx.notes, { ...o, pool }, units) };
}

function newCtx(o) {
  const t0 = Date.now(), pool = o.pool || "";
  const ticket = { token: crypto.randomBytes(8).toString("hex"), pid: process.pid, pid_start: ownStart(), film: o.film || null, label: String(o.label || ""), priority: PRIORITY_S[o.priority] !== undefined ? o.priority : "normal", units: Math.max(1, Math.floor(Number(o.units) || 1)), since: t0 };
  const tf = path.join(queueDir(pool), `ticket-${ticket.token}.json`);
  try { fs.mkdirSync(queueDir(pool), { recursive: true }); fs.writeFileSync(tf, JSON.stringify(ticket)); } catch { /* an unwritable folder is reported by attemptManaged as resource_blocked */ }
  return { t0, notes: [], ticket, tf, said: false, memSince: null };
}
function stepManaged(o, ctx) {
  const timeoutMs = Number.isFinite(o.timeoutMs) ? o.timeoutMs : 3 * 3600 * 1000;
  if (typeof o.shouldCancel === "function" && o.shouldCancel()) return { done: true, result: blocked("cancelled", "cancelled_while_queued", { waited_s: (Date.now() - ctx.t0) / 1000, notes: ctx.notes }) };
  const r = attemptManaged(o, ctx);
  if (r.ok) { r.handle.waited_s = Math.round((Date.now() - ctx.t0) / 100) / 10; return { done: true, result: r }; }
  if (r.state === "resource_blocked") return { done: true, result: { ...r, waited_s: (Date.now() - ctx.t0) / 1000, notes: [...ctx.notes, r.detail || r.reason_code] } };
  if (r.reason_code === "memory_pressure") { ctx.memSince = ctx.memSince || Date.now(); if (Date.now() - ctx.memSince > (o.mem_wait_ms || MEM_WAIT_MS)) return { done: true, result: blocked("resource_blocked", "memory_pressure_timeout", { detail: r.detail, waited_s: (Date.now() - ctx.t0) / 1000, notes: [...ctx.notes, `${r.detail}; refusing to render under memory pressure`] }) }; } else ctx.memSince = null;
  if (Date.now() - ctx.t0 > timeoutMs) return { done: true, result: blocked("queued", "wait_timeout", { timed_out: true, detail: `waited ${Math.round(timeoutMs / 60000)} min for ${o.pool || "video_render"}; the job stays queued (the cap is not ignored)`, waited_s: (Date.now() - ctx.t0) / 1000, notes: [...ctx.notes, r.detail || r.reason_code] }) };
  if (!ctx.said) { ctx.said = true; (o.log || ((x) => process.stderr.write(x + "\n")))(`SLOT ${r.state} (${r.reason_code}): ${o.pool || "video_render"} ${o.label || ""} ${r.detail || ""}`); }
  return { done: false, wait_ms: 2000 + Math.floor(Math.random() * 1000) };
}
export function acquireManagedSync(o = {}) {
  const ctx = newCtx(o);
  try { for (;;) { const st = stepManaged(o, ctx); if (st.done) return st.result; sleepSync(st.wait_ms); } } finally { try { fs.rmSync(ctx.tf, { force: true }); } catch {} }
}
export async function acquireManaged(o = {}) {
  const ctx = newCtx({ ...o });
  try { for (;;) { const st = stepManaged({ ...o, beat: true }, ctx); if (st.done) return st.result; await new Promise((r) => setTimeout(r, st.wait_ms)); } } finally { try { fs.rmSync(ctx.tf, { force: true }); } catch {} }
}
// one non-blocking attempt for callers that reserve a BUNDLE of pools themselves (lib/resource-pools.mjs): no ticket, no waiting, no bypass
export function tryAcquireManaged(o = {}) {
  const ctx = { t0: Date.now(), notes: [], ticket: null };
  return attemptManaged(o, ctx);
}
// does this holder still own its slot? (the fencing check a job runs before it publishes a result)
export const holderOwns = (h) => !!h && typeof h.verify === "function" && h.verify();

export function slotStatus(pool = "") {
  const dir = poolDir(pool), n = slotCount(pool, pool ? 1 : null), out = [];
  for (let i = 0; i < Math.max(n, 1); i++) {
    const f = path.join(dir, `slot-${i}.lock`);
    if (fs.existsSync(f)) { const j = readSlot(f); out.push({ slot: i, ...(j || {}), stale: stale(f), reclaimable_by_identity: stale(f, true) }); }
  }
  return { pool: pool || "video_render", dir, slots: n, holders: out, queue: liveTickets(pool), free_mb: Math.round(freeMemBytes() / 2 ** 20), min_free_mb: Math.round(minFree() / 2 ** 20) };
}

// run a command inside a slot (sync); the status passes through. The child is told which token owns the slot so a managed nested render is admitted
// as re-entrant (and only while that token really owns a slot file). opts.managed makes a failure to admit a refusal (status 75) instead of a bypass.
export function runInSlot(argv, { label = "render", managed, pool = "", units = 1, film = null, priority = "normal", timeoutMs, ...spawnOpts } = {}) {
  const s = acquireSlotSync({ label, managed, pool, units, film, priority, timeoutMs });
  if (s.blocked) { process.stderr.write(`SLOT ${s.state}: ${s.reason_code} (${label})\n`); return { status: 75, blocked: true, state: s.state, reason_code: s.reason_code }; }
  try {
    const env = renderProcessEnv(spawnOpts.env || process.env); // Plan 11 R8: secret-shaped variables are not passed to the child
    if (s.token) env.RASANAI_SLOT_OWNER = `${pool}|${s.token}`;
    return spawnSync(argv[0], argv.slice(1), { stdio: "inherit", ...spawnOpts, env });
  } finally { s.release(); }
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  if (a[0] === "status") { const pi = a.indexOf("--pool"); console.log(JSON.stringify(slotStatus(pi >= 0 ? a[pi + 1] : ""), null, 2)); }
  else if (a[0] === "run") {
    const dd = a.indexOf("--");
    const li = a.indexOf("--label");
    if (dd < 0 || dd === a.length - 1) { console.error("usage: slot.mjs run [--label x] [--pool name] [--managed] -- <command> [args...]"); process.exit(1); }
    const pi = a.indexOf("--pool");
    const r = runInSlot(a.slice(dd + 1), { label: li >= 0 && li < dd ? a[li + 1] : "render", managed: a.includes("--managed") && a.indexOf("--managed") < dd ? true : undefined, pool: pi >= 0 && pi < dd ? a[pi + 1] : "" });
    process.exit(r.status === null ? 1 : r.status);
  } else { console.error("usage: slot.mjs status [--pool name] | run [--label x] [--pool name] [--managed] -- <command> [args...]"); process.exit(1); }
}
