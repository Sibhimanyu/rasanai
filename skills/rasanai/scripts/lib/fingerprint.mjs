// Content fingerprints shared by footage.mjs and the reference profile cache.
// fingerprintFile is the SAME algorithm as footage.mjs `fingerprint` (sha1 of size + first 1 MiB + last 1 MiB when > 2 MiB;
// the whole file with { full: true }), so ids agree across tools.
import fs from "node:fs";
import crypto from "node:crypto";

export function fingerprintFile(file, { full = false } = {}) {
  const st = fs.statSync(file);
  const h = crypto.createHash("sha1");
  h.update(String(st.size));
  const fd = fs.openSync(file, "r");
  try {
    if (full) { const b = Buffer.alloc(1 << 20); let n; let pos = 0; while ((n = fs.readSync(fd, b, 0, b.length, pos)) > 0) { h.update(b.subarray(0, n)); pos += n; } }
    else { const b = Buffer.alloc(1 << 20); let n = fs.readSync(fd, b, 0, b.length, 0); h.update(b.subarray(0, n)); if (st.size > 2 << 20) { n = fs.readSync(fd, b, 0, b.length, st.size - (1 << 20)); h.update(b.subarray(0, n)); } }
  } finally { fs.closeSync(fd); }
  return h.digest("hex").slice(0, 16);
}

// sha1 (hex) of a whole file, streamed in 1 MiB chunks.
export function sha1OfFile(file) {
  const h = crypto.createHash("sha1");
  const fd = fs.openSync(file, "r");
  try { const b = Buffer.alloc(1 << 20); let n; let pos = 0; while ((n = fs.readSync(fd, b, 0, b.length, pos)) > 0) { h.update(b.subarray(0, n)); pos += n; } }
  finally { fs.closeSync(fd); }
  return h.digest("hex");
}

const stable = (v) => Array.isArray(v) ? v.map(stable)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v;

// sha1 (hex) of JSON with object keys sorted at every depth.
export function sha1OfJSON(obj) {
  return crypto.createHash("sha1").update(JSON.stringify(stable(obj))).digest("hex");
}
