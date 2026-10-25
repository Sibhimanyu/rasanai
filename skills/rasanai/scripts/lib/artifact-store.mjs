// Concrete artifact store (Plan 09 P5/P10): the STORE_METHODS (get, put, invalidate, pin, stats) that lib/artifact-cache.mjs fixes the key and validation for.
//
// Two stores, never one pretending to be the other:
//   - THIS store holds accepted PURE artifacts (packets, projections, extractions, structured results) and the metadata of immutable media. A hit is only ever returned through
//     artifact-cache.lookupValidated / validateHit (key, scope, dependency digests, current approval, freshness, authorization).
//   - Render fragments (video/audio bytes) live in lib/render-cache (restored from phase2/hybrid-film-studio): content-addressed, checksum-verified, atomic. A media entry here
//     points at that cache with output.render_cache_key; get() then asks the render cache for the verified bytes. The checksums are the truth; index.json files are rebuildable.
//
// Layout: <root>/ns-<scope digest>/<key>/entry.json (+ output file), <root>/ns-.../pins.json, index.json (REBUILDABLE: never trusted), invalidations.jsonl.
// The namespace is derived from the scope (project / user / shared), so one project's folder never contains another's artifacts, and get() re-checks entry.scope anyway.
//
// Publish = stage in a private temp dir inside the namespace (same volume), fsync, rename into place; entry.json is the commit marker and is written last. A writer whose lease was
// lost (opts.fence() false) publishes nothing. Pinned (active/final outputs) and in-use (lease marker with a live pid) entries are never evicted, even over the disk limit: put() then
// fails with { disk_limit: true } instead of deleting something a render is reading.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalDigest } from "./contracts.mjs";
import { JOB_TYPES, cacheKey, lookupValidated, checkStore, CACHE_SCHEMA } from "./artifact-cache.mjs";

const KEY_RE = /^[0-9a-f]{64}$/;
const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const sha256File = (f) => { const h = crypto.createHash("sha256"), fd = fs.openSync(f, "r"), b = Buffer.alloc(1 << 20); try { for (let n; (n = fs.readSync(fd, b, 0, b.length)) > 0;) h.update(b.subarray(0, n)); } finally { fs.closeSync(fd); } return h.digest("hex"); };
function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  const fd = fs.openSync(tmp, "w");
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
const dirSize = (d) => { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; } } catch {} return n; };

export const scopeNamespace = (scope = {}) => scope.kind === "shared" ? "ns-shared" : "ns-" + canonicalDigest({ kind: scope.kind || "project", project: scope.project || null, user: scope.user || null }).slice(0, 16);

// opts: { root, scope: { kind, project, user }, maxBytes, mediaCache (a lib/render-cache openCache instance, for immutable_media) }
export function openArtifactStore(opts = {}) {
  const scope = { kind: opts.scope && opts.scope.kind || "project", project: opts.scope && opts.scope.project || null, user: opts.scope && opts.scope.user || null };
  const nsDir = path.join(path.resolve(opts.root), scopeNamespace(scope));
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : null;
  const entryDir = (key) => { if (!KEY_RE.test(String(key))) throw new Error(`bad artifact key ${JSON.stringify(key)}`); return path.join(nsDir, key); };
  const pinsFile = path.join(nsDir, "pins.json");
  const pins = () => new Set(Array.isArray(rj(pinsFile)) ? rj(pinsFile) : []);
  const keys = () => { try { return fs.readdirSync(nsDir).filter((k) => KEY_RE.test(k) && fs.statSync(path.join(nsDir, k)).isDirectory()); } catch { return []; } };
  const sameScope = (s) => !!s && s.kind === scope.kind && (s.project || null) === scope.project && (s.user || null) === scope.user;

  // an entry is in use while a lease marker names a live process
  const inUse = (key) => { try { return fs.readdirSync(entryDir(key)).some((f) => f.startsWith(".use-") && alive(Number(f.split("-")[1]))); } catch { return false; } };
  const lease = (key) => {
    const f = path.join(entryDir(key), `.use-${process.pid}-${crypto.randomBytes(3).toString("hex")}`);
    try { fs.writeFileSync(f, ""); } catch { return { release() {} }; }
    return { release() { try { fs.rmSync(f, { force: true }); } catch {} } };
  };

  // verified read: scope, commit marker, and (when it has an output) the bytes. Anything off is a MISS, never a hit.
  function get(key, o = {}) {
    let d; try { d = entryDir(key); } catch { return null; }
    const entry = rj(path.join(d, "entry.json"));
    if (!entry || entry.key !== key) return null;
    if (!sameScope(entry.scope)) return null; // another project's or user's entry is invisible here
    const out = entry.output;
    if (out && out.render_cache_key) {
      if (!opts.mediaCache) return null;
      const r = opts.mediaCache.lookup(out.render_cache_key, { deep: o.deep !== false });
      if (!r.hit || (out.digest && r.meta.sha256 !== out.digest)) return null;
      return { ...entry, _dir: d, _file: r.file };
    }
    if (out && out.path) {
      const f = path.join(d, out.path);
      let st; try { st = fs.statSync(f); } catch { return null; }
      if (out.size !== undefined && st.size !== out.size) return null;
      if (o.deep !== false && out.digest && sha256File(f) !== out.digest) return null;
      return { ...entry, _dir: d, _file: f };
    }
    return { ...entry, _dir: d, _file: null };
  }

  // entry: { key, job_type, task, dependencies:[{ref,digest}], approval_digest, rights, source, manifest:{producer, job_id, attempt, generation, input_digest}, provider } and the result as
  //   o.json (a JSON result written as output.json) | o.sourceFile (copied) | o.media {render_cache_key, digest}
  function put(entry, o = {}) {
    if (!entry || !KEY_RE.test(String(entry.key))) throw new Error("put needs entry.key (the cacheKey digest)");
    const jt = JOB_TYPES[entry.job_type];
    if (!jt) throw new Error(`unknown job_type ${JSON.stringify(entry.job_type)}`);
    if (!jt.cacheable) throw new Error(`${entry.job_type} is never stored as a reusable result (${jt.note})`);
    if (entry.provider && /unknown_outcome|submitted|queued|running/.test(String(entry.provider.status || ""))) throw new Error("a provider job whose outcome is not final is reconciled, never cached");
    if (!Array.isArray(entry.dependencies)) throw new Error("an artifact is stored with its dependency declaration (an undeclared one is a conservative miss on read)");
    if (typeof o.fence === "function" && !o.fence()) return { published: false, reason: "lease_lost", note: "the writer no longer owns the job; nothing was published" };
    fs.mkdirSync(nsDir, { recursive: true });
    const tmp = path.join(nsDir, `.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tmp);
    try {
      let output = null;
      if (o.media) output = { render_cache_key: o.media.render_cache_key, digest: o.media.digest || null };
      else if (o.sourceFile) {
        const name = path.basename(o.sourceFile);
        fs.copyFileSync(o.sourceFile, path.join(tmp, name));
        const fd = fs.openSync(path.join(tmp, name), "r+"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        output = { path: name, digest: sha256File(path.join(tmp, name)), size: fs.statSync(path.join(tmp, name)).size };
      } else if (o.json !== undefined) {
        const text = JSON.stringify(o.json, null, 2) + "\n";
        writeAtomic(path.join(tmp, "output.json"), text);
        output = { path: "output.json", digest: crypto.createHash("sha256").update(text).digest("hex"), size: Buffer.byteLength(text) };
      }
      const full = { schema_version: CACHE_SCHEMA, accepted: entry.accepted === true, ...entry, scope, output, stored_at: new Date().toISOString() };
      const need = dirSize(tmp) + 2048;
      if (maxBytes !== null) {
        const have = stats().bytes;
        if (have + need > maxBytes) { const p = purge({ maxBytes: Math.max(0, maxBytes - need) }); if (p.bytes_after + need > maxBytes) return { published: false, reason: "disk_limit", disk_limit: true, note: "over the limit and everything left is pinned or in use: nothing was evicted" }; }
      }
      writeAtomic(path.join(tmp, "entry.json"), JSON.stringify(full, null, 2) + "\n"); // the commit marker
      // ownership check again right before the swap: a writer that lost its lease while staging must not publish
      if (typeof o.fence === "function" && !o.fence()) return { published: false, reason: "lease_lost", note: "the writer lost ownership while staging; nothing was published" };
      const d = entryDir(entry.key);
      if (fs.existsSync(d)) { const old = path.join(nsDir, `.trash-${process.pid}-${crypto.randomBytes(3).toString("hex")}`); fs.renameSync(d, old); fs.rmSync(old, { recursive: true, force: true }); } // a crash between the two leaves a miss, never a torn entry
      fs.renameSync(tmp, d);
      updateIndex(entry.key, full);
      return { published: true, key: entry.key, dir: d };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  function invalidate(key, reason = "invalidated") {
    if (pins().has(key)) return { invalidated: false, reason: "pinned: an active or final output is replaced by publishing a new one, never deleted" };
    if (inUse(key)) return { invalidated: false, reason: "in use by a running job" };
    try { fs.mkdirSync(nsDir, { recursive: true }); fs.appendFileSync(path.join(nsDir, "invalidations.jsonl"), JSON.stringify({ key, reason: String(reason).slice(0, 300), at: new Date().toISOString() }) + "\n"); } catch {}
    fs.rmSync(entryDir(key), { recursive: true, force: true });
    return { invalidated: true };
  }
  function pin(key) { entryDir(key); const s = pins(); s.add(key); fs.mkdirSync(nsDir, { recursive: true }); writeAtomic(pinsFile, JSON.stringify([...s].sort(), null, 2) + "\n"); }
  function unpin(key) { const s = pins(); s.delete(key); fs.mkdirSync(nsDir, { recursive: true }); writeAtomic(pinsFile, JSON.stringify([...s].sort(), null, 2) + "\n"); }
  function stats() {
    let bytes = 0, n = 0;
    for (const k of keys()) { n++; bytes += dirSize(entryDir(k)); }
    return { namespace: path.basename(nsDir), dir: nsDir, entries: n, bytes, pinned: [...pins()], max_bytes: maxBytes };
  }
  // least recently stored first; pinned and in-use are skipped, never deleted
  function purge(o = {}) {
    const removed = [], kept = [], pinned = pins();
    const rows = keys().map((k) => { const e = rj(path.join(entryDir(k), "entry.json")); return { k, size: dirSize(entryDir(k)), at: e && e.stored_at ? Date.parse(e.stored_at) : 0, corrupt: !e }; });
    let total = rows.reduce((a, r) => a + r.size, 0);
    for (const r of rows.filter((x) => x.corrupt)) { if (!pinned.has(r.k) && !inUse(r.k) && !o.dryRun) { fs.rmSync(entryDir(r.k), { recursive: true, force: true }); total -= r.size; removed.push({ key: r.k, why: "no valid entry.json (torn publish)" }); } }
    if (Number.isFinite(o.maxBytes) || o.all) {
      for (const r of rows.filter((x) => !x.corrupt).sort((a, b) => a.at - b.at)) {
        if (!o.all && total <= o.maxBytes) break;
        if (pinned.has(r.k)) { kept.push({ key: r.k, why: "pinned" }); continue; }
        if (inUse(r.k)) { kept.push({ key: r.k, why: "in use" }); continue; }
        if (!o.dryRun) fs.rmSync(entryDir(r.k), { recursive: true, force: true });
        total -= r.size; removed.push({ key: r.k, why: "over the limit (least recently stored)" });
      }
    }
    if (!o.dryRun) rebuildIndex();
    return { removed, kept, bytes_after: Math.max(0, total), dry_run: !!o.dryRun };
  }
  // the index is a convenience only: rebuilt from the verified entries, never consulted for a hit
  function updateIndex(key, e) { try { const idx = rj(path.join(nsDir, "index.json")) || { schema_version: 1, entries: {} }; idx.entries[key] = { task: e.task || null, job_type: e.job_type, stored_at: e.stored_at }; writeAtomic(path.join(nsDir, "index.json"), JSON.stringify(idx, null, 2) + "\n"); } catch {} }
  function rebuildIndex() {
    const entries = {};
    for (const k of keys()) { const e = rj(path.join(entryDir(k), "entry.json")); if (e && e.key === k && sameScope(e.scope)) entries[k] = { task: e.task || null, job_type: e.job_type, stored_at: e.stored_at }; }
    fs.mkdirSync(nsDir, { recursive: true });
    writeAtomic(path.join(nsDir, "index.json"), JSON.stringify({ schema_version: 1, entries }, null, 2) + "\n");
    return Object.keys(entries).length;
  }
  const store = { scope, dir: nsDir, get, put, invalidate, pin, unpin, stats, purge, rebuildIndex, lease, keys, inUse };
  return store;
}

// P10: why is this reusable (or not)? Everything a person or the evidence hooks need, in one record. Reuse is NEVER approval: approval_effect is always "none".
//   wanted: the artifact-cache.cacheKey options plus { current_dependencies, current_approval_digest, authorization }
export function explainReuse(store, wanted, opts = {}) {
  const chk = checkStore(store);
  if (!chk.ok) return { reusable: false, reasons: [`store lacks ${chk.missing.join(", ")}`], reuse_is_approval: false, approval_effect: "none" };
  const { key, hit, decision } = lookupValidated(store, wanted, opts);
  const entry = hit || store.get(key, { deep: false });
  return {
    key, reusable: !!hit, reasons: decision.reasons, why: decision.why || null,
    producing_manifest: entry ? (entry.manifest || { note: "no manifest recorded: treated as unexplained" }) : null,
    freshness: entry && entry.source ? { fact_kind: entry.source.fact_kind || null, retrieved_at: entry.source.retrieved_at || null } : { note: "no source freshness recorded" },
    rights: entry ? (entry.rights || { note: "no rights record: conservative" }) : null,
    dependencies: entry ? entry.dependencies : null,
    reuse_is_approval: false, approval_effect: "none",
    note: "a reusable render or artifact is not a creative approval: it cannot approve a storyboard, waive a claim or stand in for the person's choice",
  };
}
export { cacheKey };
