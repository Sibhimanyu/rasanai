// Shared helpers for renderer adapters (Contract E). Zero-dependency, never runs a render, never downloads.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SLOT = path.join(SCRIPTS, "lib", "slot.mjs");

export function which(bin) {
  for (const d of String(process.env.PATH || "").split(path.delimiter)) {
    const p = path.join(d, bin);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return null;
}
export function version(bin, args = ["-version"]) {
  const r = spawnSync(bin, args, { encoding: "utf8", timeout: 8000 });
  return r.status === 0 ? String(r.stdout || r.stderr).split("\n")[0].trim() : null;
}
export function chromePath() {
  const c = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
    which("google-chrome"), which("chromium"), which("chromium-browser")].filter(Boolean);
  return c.find((p) => fs.existsSync(p)) || null;
}
// read a package.json from a node_modules dir without executing anything
export function pkgVersion(name, roots) {
  for (const r of roots) {
    try { return JSON.parse(fs.readFileSync(path.join(r, "node_modules", name, "package.json"), "utf8")).version; } catch {}
  }
  return null;
}
export function npxCacheRoots() {
  const base = path.join(os.homedir(), ".npm", "_npx");
  try { return fs.readdirSync(base).map((d) => path.join(base, d)); } catch { return []; }
}
export const flag = (id, suffix = "") => process.env[`RASANAI_ADAPTER_${id.toUpperCase()}${suffix}`] === "1";
export function rejectDisabled(id, reason) {
  return async () => { throw new Error(`adapter ${id} is disabled: ${reason}`); };
}
// the adapter's license gate: enabled only with the flag and, where a license applies, the acknowledgement
export function gate(id, needsAck) {
  const on = flag(id), ack = flag(id, "_LICENSE_ACK");
  const enabled = on && (!needsAck || ack);
  const why = enabled ? "enabled by env" : !on ? `set RASANAI_ADAPTER_${id.toUpperCase()}=1 to enable` : `license acknowledgement missing: also set RASANAI_ADAPTER_${id.toUpperCase()}_LICENSE_ACK=1`;
  return { enabled, flag: on, ack, why };
}
