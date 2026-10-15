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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = process.env.RASANAI_SLOT_DIR || path.join(os.tmpdir(), "rasanai-render-slots");
const BEAT_MS = 15000, BEAT_STALE_MS = 10 * 60 * 1000, MAX_AGE_MS = 6 * 3600 * 1000, MEM_WAIT_MS = 5 * 60 * 1000;
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { const t = Date.now() + ms; while (Date.now() < t); } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

export function slotCount() {
  const env = process.env.RASANAI_RENDER_SLOTS;
  if (env !== undefined && env !== "" && Number.isFinite(Number(env))) return Math.max(0, Math.floor(Number(env)));
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
function stale(f) {
  const j = readSlot(f);
  let st; try { st = fs.statSync(f); } catch { return false; } // gone: not stale, just free
  if (!j || !Number.isInteger(j.pid)) return Date.now() - st.mtimeMs > 30000; // half-written files get a moment
  if (!alive(j.pid)) return true;
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
function tryTake(n, label, beat) {
  fs.mkdirSync(DIR, { recursive: true });
  for (let i = 0; i < n; i++) {
    const f = path.join(DIR, `slot-${i}.lock`);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = fs.openSync(f, "wx");
        try { fs.writeSync(fd, JSON.stringify({ pid: process.pid, label: String(label || ""), since: Date.now(), beat: !!beat })); } finally { fs.closeSync(fd); }
        return { i, f };
      } catch (e) {
        if (e.code !== "EEXIST") return null;
        if (stale(f)) { try { fs.rmSync(f, { force: true }); } catch {} continue; } // stale takeover, then one more try at this slot
        break;
      }
    }
  }
  return -1;
}

function finish(taken, n, t0, notes, beat) {
  let timer = null;
  if (beat) { timer = setInterval(() => { try { const t = new Date(); fs.utimesSync(taken.f, t, t); } catch {} }, BEAT_MS); timer.unref(); }
  const h = { slot: taken.i, of: n, waited_s: Math.round((Date.now() - t0) / 100) / 10, notes, release() { if (timer) clearInterval(timer); HELD.delete(h); const j = readSlot(taken.f); if (j && j.pid === process.pid) { try { fs.rmSync(taken.f, { force: true }); } catch {} } } };
  HELD.add(h); hook();
  return h;
}
const none = () => ({ slot: -1, of: 0, waited_s: 0, notes: [], release() {} });
const minFree = () => (Number(process.env.RASANAI_RENDER_MIN_FREE_MB) || 1500) * 2 ** 20;

// blocks until a slot is free and memory allows (sync). timeoutMs: give up waiting for a slot after this long (default 3 h) and run anyway, with a note.
export function acquireSlotSync({ label = "render", timeoutMs = 3 * 3600 * 1000, log = (s) => process.stderr.write(s + "\n") } = {}) {
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

export async function acquireSlot({ label = "render", timeoutMs = 3 * 3600 * 1000, log = (s) => process.stderr.write(s + "\n") } = {}) {
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

export function slotStatus() {
  const out = [];
  for (let i = 0; i < Math.max(slotCount(), 1); i++) { const f = path.join(DIR, `slot-${i}.lock`); if (fs.existsSync(f)) { const j = readSlot(f); out.push({ slot: i, ...(j || {}), stale: stale(f) }); } }
  return { dir: DIR, slots: slotCount(), holders: out, free_mb: Math.round(freeMemBytes() / 2 ** 20), min_free_mb: Math.round(minFree() / 2 ** 20) };
}

// run a command inside a slot (sync); the status passes through
export function runInSlot(argv, { label = "render", ...spawnOpts } = {}) {
  const s = acquireSlotSync({ label });
  try { return spawnSync(argv[0], argv.slice(1), { stdio: "inherit", ...spawnOpts }); } finally { s.release(); }
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  if (a[0] === "status") console.log(JSON.stringify(slotStatus(), null, 2));
  else if (a[0] === "run") {
    const dd = a.indexOf("--");
    const li = a.indexOf("--label");
    if (dd < 0 || dd === a.length - 1) { console.error("usage: slot.mjs run [--label x] -- <command> [args...]"); process.exit(1); }
    const r = runInSlot(a.slice(dd + 1), { label: li >= 0 && li < dd ? a[li + 1] : "render" });
    process.exit(r.status === null ? 1 : r.status);
  } else { console.error("usage: slot.mjs status | run [--label x] -- <command> [args...]"); process.exit(1); }
}
