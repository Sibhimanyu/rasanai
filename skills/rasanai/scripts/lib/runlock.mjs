// A tiny cross-process lock for a run folder's files, shared by console.mjs and RasanAI Studio (which speaks the same
// protocol from Swift: a lock is a file created with O_EXCL holding "<pid> <unix ms>"). A lock whose owner is gone, or
// that is older than STALE_MS, is taken over. Used in headless mode (no console server serializing the writes).
import fs from "node:fs";

const STALE_MS = 10000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
function stale(lockPath) {
  try {
    const st = fs.statSync(lockPath);
    const pid = Number(String(fs.readFileSync(lockPath, "utf8")).split(" ")[0]);
    if (Date.now() - st.mtimeMs > STALE_MS) return true;
    return Number.isInteger(pid) && pid > 0 && !alive(pid);
  } catch {
    return false;
  }
}
// true when the lock is held by this process now; false if it could not be taken within timeoutMs (callers go on without it
// rather than hang: a wedged lock must never stop a film)
export function acquire(lockPath, timeoutMs = 4000) {
  const t0 = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      try { fs.writeSync(fd, `${process.pid} ${Date.now()}\n`); } finally { fs.closeSync(fd); }
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") return false;
    }
    if (stale(lockPath)) { try { fs.rmSync(lockPath, { force: true }); } catch {} continue; }
    if (Date.now() - t0 > timeoutMs) return false;
    sleep(5 + Math.floor(Math.random() * 15));
  }
}
export function release(lockPath) {
  try {
    const owner = Number(String(fs.readFileSync(lockPath, "utf8")).split(" ")[0]);
    if (owner === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {}
}
export function withLock(lockPath, fn) {
  const held = acquire(lockPath);
  try {
    return fn();
  } finally {
    if (held) release(lockPath);
  }
}
