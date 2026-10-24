// render-cache: the content-addressed cache of contract C3 (<film>/hybrid/cache/<key>/<artifact> + meta.json + index.json).
// Binaries are truth; index.json is rebuildable metadata only. Zero dependencies.
//   const cache = openCache(dir);
//   cacheKey(inputs)                         sha256 of canonical JSON (sorted keys); the only place a key is made
//   cache.lookup(key, { deep, frames })      -> { hit:true, key, dir, file, meta } | { hit:false, reason }   (a corrupt entry is a miss, never a hit)
//   cache.produce(key, async (tmpDir) => ({ file, meta }), opts)   one producer per key: a lock file (O_EXCL, pid, stale takeover) in this and other
//                                            processes; late callers wait and then get the producer's entry. Publish = write temp in the key dir, fsync,
//                                            rename; meta.json is renamed LAST and is the commit marker, so a kill mid-write leaves no hit.
//   cache.publish(key, srcFile, meta)        same atomic publish for a file that already exists
//   cache.verify([key])                      -> [{ key, ok, reason }]   (meta valid, size, sha256, optional frame count)
//   cache.purge({ maxBytes, keep, dryRun })  drops corrupt entries and stale temp files, then least-recently-used entries over the cap;
//                                            pinned keys (pins.json) and in-use keys (live lock, or in `keep`) are never evicted
//   cache.pin(key) / cache.unpin(key) / cache.touch(key) / cache.rebuildIndex() / cache.stats() / cache.markFailed(key, note) / cache.state(key)
// Meta (C3): key, expected_frames, sample_rate|null, color_space, alpha "none|straight|premultiplied", time_base, sha256, size_bytes, created_at, tool_version.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const KEY_RE = /^[0-9a-f]{64}$/;
const LOCK_STALE_MS = 6 * 3600 * 1000, POLL_MS = 100;
const ALPHA = ["none", "straight", "premultiplied"];

export const canonical = (v) => JSON.stringify(stable(v));
export function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, stable(v[k])]));
  return v;
}
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const cacheKey = (inputs) => sha256(canonical(inputs));
export function fileSha256(file) {
  const h = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), buf = Buffer.alloc(1 << 20);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length)) > 0;) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest("hex");
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  const fd = fs.openSync(tmp, "w");
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

// frame count by ffprobe (video streams); null when ffprobe or the stream is unavailable
export function probeFrames(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" });
  const n = Number(String(r.stdout || "").trim());
  return r.status === 0 && Number.isFinite(n) ? n : null;
}

export function validateMeta(meta, key) {
  const P = [];
  if (!meta || typeof meta !== "object") return ["meta.json is missing or not an object"];
  if (meta.key !== key) P.push(`meta.key ${JSON.stringify(meta.key)} is not the entry key`);
  if (typeof meta.file !== "string" || !meta.file || meta.file.includes("..") || path.isAbsolute(meta.file) || meta.file.includes("/")) P.push("meta.file must be a plain artifact file name");
  if (!/^[0-9a-f]{64}$/.test(String(meta.sha256))) P.push("meta.sha256 is not a sha256 hex");
  if (!Number.isInteger(meta.size_bytes) || meta.size_bytes < 0) P.push("meta.size_bytes is not a whole number");
  if (meta.expected_frames !== null && !(Number.isInteger(meta.expected_frames) && meta.expected_frames >= 0)) P.push("meta.expected_frames must be a whole number or null");
  if (meta.sample_rate !== null && !(Number.isFinite(meta.sample_rate) && meta.sample_rate > 0)) P.push("meta.sample_rate must be a number or null");
  if (!ALPHA.includes(meta.alpha)) P.push(`meta.alpha must be one of ${ALPHA.join("|")}`);
  for (const k of ["color_space", "time_base", "created_at", "tool_version"]) if (typeof meta[k] !== "string" || !meta[k]) P.push(`meta.${k} is required`);
  return P;
}

export function openCache(dir) {
  dir = path.resolve(dir);
  const entryDir = (key) => { if (!KEY_RE.test(String(key))) throw new Error(`bad cache key ${JSON.stringify(key)}`); return path.join(dir, key); };
  const lockPath = (key) => path.join(entryDir(key), ".lock");
  const pinsPath = path.join(dir, "pins.json");
  const pins = () => new Set(Array.isArray(readJ(pinsPath)) ? readJ(pinsPath) : []);
  const savePins = (set) => { fs.mkdirSync(dir, { recursive: true }); writeAtomic(pinsPath, JSON.stringify([...set].sort(), null, 2) + "\n"); };
  const keys = () => { try { return fs.readdirSync(dir).filter((k) => KEY_RE.test(k) && fs.statSync(path.join(dir, k)).isDirectory()); } catch { return []; } };

  function lockHolder(key) {
    const l = readJ(lockPath(key));
    if (!l) return null;
    let age = Infinity;
    try { age = Date.now() - fs.statSync(lockPath(key)).mtimeMs; } catch { return null; }
    return alive(l.pid) && age < LOCK_STALE_MS ? l : null;
  }
  function tryLock(key, label) {
    fs.mkdirSync(entryDir(key), { recursive: true });
    for (let i = 0; i < 2; i++) {
      try {
        const fd = fs.openSync(lockPath(key), "wx");
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, label: label || "", since: new Date().toISOString() }));
        fs.closeSync(fd);
        return () => { try { fs.unlinkSync(lockPath(key)); } catch {} };
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        if (lockHolder(key)) return null;
        try { fs.unlinkSync(lockPath(key)); } catch {}   // stale: holder gone
      }
    }
    return null;
  }

  function lookup(key, opts = {}) {
    const d = entryDir(key), meta = readJ(path.join(d, "meta.json"));
    if (!meta) return { hit: false, reason: fs.existsSync(d) ? "no valid meta.json" : "absent" };
    const P = validateMeta(meta, key);
    if (P.length) return { hit: false, reason: `invalid meta: ${P[0]}` };
    const file = path.join(d, meta.file);
    let st;
    try { st = fs.statSync(file); } catch { return { hit: false, reason: "artifact missing" }; }
    if (st.size !== meta.size_bytes) return { hit: false, reason: `size ${st.size} != ${meta.size_bytes}` };
    if (opts.deep !== false && fileSha256(file) !== meta.sha256) return { hit: false, reason: "checksum mismatch" };
    if (opts.frames && meta.expected_frames !== null) {
      const n = (opts.frameCounter || probeFrames)(file);
      if (n !== null && n !== meta.expected_frames) return { hit: false, reason: `frame count ${n} != ${meta.expected_frames}` };
    }
    return { hit: true, key, dir: d, file, meta };
  }

  function touch(key) { try { const f = path.join(entryDir(key), ".used"); fs.writeFileSync(f, ""); const t = new Date(); fs.utimesSync(f, t, t); } catch {} }

  // artifact already at srcFile (moved with rename when on the same volume, else copied to a temp in the key dir first)
  function publish(key, srcFile, meta = {}) {
    const d = entryDir(key);
    fs.mkdirSync(d, { recursive: true });
    const name = path.basename(meta.file || srcFile);
    const tmp = path.join(d, `.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}-${name}`);
    fs.copyFileSync(srcFile, tmp);
    const fd = fs.openSync(tmp, "r+"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const full = {
      expected_frames: null, sample_rate: null, color_space: "unknown", alpha: "none", time_base: "unknown", tool_version: "unknown", ...meta,
      key, file: name, sha256: fileSha256(tmp), size_bytes: fs.statSync(tmp).size, created_at: new Date().toISOString(),
    };
    const P = validateMeta(full, key);
    if (P.length) { fs.rmSync(tmp, { force: true }); throw new Error(`cannot publish ${key}: ${P.join("; ")}`); }
    try { fs.unlinkSync(path.join(d, "meta.json")); } catch {}   // an old (maybe corrupt) commit marker goes before the artifact is replaced
    fs.rmSync(path.join(d, "failed.json"), { force: true });
    fs.renameSync(tmp, path.join(d, name));
    writeAtomic(path.join(d, "meta.json"), JSON.stringify(full, null, 2) + "\n");   // commit marker last
    touch(key);
    updateIndex(key, full);
    return { hit: true, key, dir: d, file: path.join(d, name), meta: full };
  }

  const inflight = new Map();
  // producer(tmpDir) writes its output into tmpDir and returns { file: <name inside tmpDir or absolute>, meta }. Called once per key.
  async function produce(key, producer, opts = {}) {
    const key0 = `${dir}:${key}`;
    if (inflight.has(key0)) return inflight.get(key0);
    const p = (async () => {
      const deadline = Date.now() + (opts.timeoutMs || 30 * 60 * 1000);
      for (;;) {
        const got = lookup(key, opts);
        if (got.hit) { touch(key); return { ...got, produced: false }; }
        const release = tryLock(key, opts.label);
        if (release) {
          try {
            const again = lookup(key, opts);                      // someone may have finished between our miss and our lock
            if (again.hit) return { ...again, produced: false };
            const tmpDir = path.join(entryDir(key), `.work-${process.pid}-${crypto.randomBytes(4).toString("hex")}`);
            fs.mkdirSync(tmpDir, { recursive: true });
            try {
              const out = await producer(tmpDir);
              const src = path.isAbsolute(out.file) ? out.file : path.join(tmpDir, out.file);
              return { ...publish(key, src, { ...out.meta, file: path.basename(src) }), produced: true };
            } catch (e) { markFailed(key, e && e.message); throw e; }
            finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
          } finally { release(); }
        }
        if (Date.now() > deadline) throw new Error(`timed out waiting for the producer of ${key}`);
        await sleep(POLL_MS);
      }
    })();
    inflight.set(key0, p);
    try { return await p; } finally { inflight.delete(key0); }
  }

  function markFailed(key, note) {
    try { fs.mkdirSync(entryDir(key), { recursive: true }); writeAtomic(path.join(entryDir(key), "failed.json"), JSON.stringify({ at: new Date().toISOString(), note: String(note || "") }) + "\n"); } catch {}
  }
  // "ready" (valid entry), "rendering" (live producer), "failed" (last producer failed), "stale"
  function state(key, opts = {}) {
    if (lookup(key, { deep: opts.deep === true }).hit) return "ready";
    if (lockHolder(key)) return "rendering";
    return fs.existsSync(path.join(entryDir(key), "failed.json")) ? "failed" : "stale";
  }

  function verify(list) {
    return (list || keys()).map((key) => { const r = lookup(key, { frames: true }); return { key, ok: r.hit, ...(r.hit ? {} : { reason: r.reason }) }; });
  }
  function entrySize(key) {
    let n = 0;
    for (const f of fs.readdirSync(entryDir(key))) { try { n += fs.statSync(path.join(entryDir(key), f)).size; } catch {} }
    return n;
  }
  function updateIndex(key, meta) {
    const idx = readJ(path.join(dir, "index.json")) || { schema_version: 1, entries: {} };
    idx.entries = idx.entries || {};
    idx.entries[key] = { file: meta.file, sha256: meta.sha256, size_bytes: meta.size_bytes, created_at: meta.created_at };
    try { writeAtomic(path.join(dir, "index.json"), JSON.stringify(stable(idx), null, 2) + "\n"); } catch {}
  }
  function rebuildIndex() {
    const entries = {};
    for (const key of keys()) { const m = readJ(path.join(entryDir(key), "meta.json")); if (m && validateMeta(m, key).length === 0) entries[key] = { file: m.file, sha256: m.sha256, size_bytes: m.size_bytes, created_at: m.created_at }; }
    fs.mkdirSync(dir, { recursive: true });
    writeAtomic(path.join(dir, "index.json"), JSON.stringify(stable({ schema_version: 1, entries }), null, 2) + "\n");
    return Object.keys(entries).length;
  }

  function purge(opts = {}) {
    const keep = new Set(opts.keep || []), pinned = pins(), removed = [], kept = [], skipped = [];
    const rm = (key, why) => { if (!opts.dryRun) fs.rmSync(entryDir(key), { recursive: true, force: true }); removed.push({ key, why }); };
    const live = [];
    for (const key of keys()) {
      // temp leftovers of killed writers (never a hit anyway)
      if (!opts.dryRun) for (const f of fs.readdirSync(entryDir(key))) {
        const p = path.join(entryDir(key), f);
        if (f.startsWith(".tmp-") || f.includes(".tmp-") || f.startsWith(".work-")) { try { if (Date.now() - fs.statSync(p).mtimeMs > 60 * 60 * 1000 || !lockHolder(key)) fs.rmSync(p, { recursive: true, force: true }); } catch {} }
      }
      if (lockHolder(key) || keep.has(key)) { skipped.push({ key, why: keep.has(key) ? "in use" : "being produced" }); continue; }
      const r = lookup(key, { deep: true });
      if (!r.hit) { if (pinned.has(key) && opts.corruptOnly !== true) { /* a pinned corrupt entry is still unusable; drop it */ } rm(key, `corrupt: ${r.reason}`); continue; }
      let used = 0; try { used = fs.statSync(path.join(entryDir(key), ".used")).mtimeMs; } catch { used = Date.parse(r.meta.created_at) || 0; }
      live.push({ key, used, size: entrySize(key) });
    }
    let total = live.reduce((n, e) => n + e.size, 0);
    if (opts.all) { for (const e of live) { if (pinned.has(e.key)) kept.push({ key: e.key, why: "pinned" }); else { rm(e.key, "purge all"); total -= e.size; } } }
    else if (Number.isFinite(opts.maxBytes)) {
      for (const e of live.sort((a, b) => a.used - b.used)) {
        if (total <= opts.maxBytes) break;
        if (pinned.has(e.key)) { kept.push({ key: e.key, why: "pinned" }); continue; }
        rm(e.key, "over cap (least recently used)"); total -= e.size;
      }
    }
    if (!opts.dryRun) rebuildIndex();
    return { removed, skipped, kept, bytes_after: Math.max(0, total), dry_run: !!opts.dryRun };
  }

  function stats() {
    let bytes = 0, n = 0;
    for (const key of keys()) { n++; try { bytes += entrySize(key); } catch {} }
    return { dir, entries: n, bytes, pinned: [...pins()] };
  }
  return {
    dir, lookup, publish, produce, verify, purge, stats, touch, state, markFailed, rebuildIndex,
    pin: (k) => { entryDir(k); const s = pins(); s.add(k); savePins(s); },
    unpin: (k) => { const s = pins(); s.delete(k); savePins(s); },
    keys, lockHolder,
  };
}
