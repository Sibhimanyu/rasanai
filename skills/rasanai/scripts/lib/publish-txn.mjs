// Plan 11 R8: transactional publication across files, log records and public pointers. A rename makes ONE file replacement atomic; it does not make "three files plus a log line plus a pointer"
// atomic. This file adds the missing envelope as a recoverable INTENT:
//
//   prepared   the intent is on disk: every target, its pre-state digest, its POST-state digest (of the staged file), the replaced file kept as a hard link, the log record to append
//   committed  every target now holds its post-state; the log record is not necessarily appended yet
//   published  the log record is appended (idempotent by txn id) and the intent moved to crew/txn/done/
//
//   prepare(run, spec) -> commit(run, id) -> (published)       recover(run, {apply})  finish forward or roll back what a dead process left; never overwrite a newer revision
//   publishDeliveredPointer(...)   the public current-final pointer (hybrid/renders/delivered.json) moves only after the file exists, hashes to the receipt's checksum, and the receipt names a source
//   publishFileAtomic(staged, final, manifest)   a media file is published only when its size and sha256 equal a committed manifest (never a partial file)
//
// The source-edit journal in lib/editor-patch/txn.mjs now uses the same phases and post digests; this module is the general form for log records, cache outputs and final delivery.
// It reuses the strict lock (lib/runlock.mjs acquire) and lib/recovery.mjs appendJsonl / atomicWrite. Nothing here deletes a target or a prior copy.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { acquire, release } from "./runlock.mjs";
import { appendJsonl, atomicWrite } from "./recovery.mjs";
import { safePath, canonicalDigest } from "./contracts.mjs";

export const KINDS = Object.freeze(["source_edit", "log_record", "cache_output", "final_delivery"]);
export const PHASES = Object.freeze(["prepared", "committed", "published", "rolled_back", "conflict"]);
const R = (run, ...p) => path.join(path.resolve(String(run)), ...p);
const txnDir = (run) => R(run, "crew", "txn");
const intentFile = (run, id) => path.join(txnDir(run), `${String(id).replace(/[^A-Za-z0-9_.-]+/g, "-")}.json`);
const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const sha256File = (f) => { const h = crypto.createHash("sha256"), fd = fs.openSync(f, "r"), b = Buffer.alloc(1 << 20); try { for (let n; (n = fs.readSync(fd, b, 0, b.length)) > 0;) h.update(b.subarray(0, n)); } finally { fs.closeSync(fd); } return h.digest("hex"); };
const digestOrNull = (f) => { try { return fs.existsSync(f) ? sha256File(f) : null; } catch { return null; } };
const nowIso = () => new Date().toISOString();
const strict = (run, fn) => { fs.mkdirSync(txnDir(run), { recursive: true }); const lock = path.join(txnDir(run), ".lock"); if (!acquire(lock, 8000)) { const e = new Error("the publication lock could not be taken; nothing was changed"); e.reason_code = "lock_unavailable"; throw e; } try { return fn(); } finally { release(lock); } };

function placeFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try { fs.renameSync(src, dst); }
  catch (e) {
    if (e.code !== "EXDEV") throw e;
    const tmp = `${dst}.pub-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
    fs.copyFileSync(src, tmp); const fd = fs.openSync(tmp, "r+"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, dst);
  }
}

// spec: { id?, kind, base_revision?, targets: [{ path (project-relative), staged (absolute or run-relative path of the finished file) }], record?: { file (run-relative .jsonl), line (object) } }
// -> { ok, id, intent } | { ok:false, reason }
export function prepare(run, spec) {
  if (!spec || !KINDS.includes(spec.kind)) return { ok: false, reason: "unknown_kind" };
  const targets = [];
  for (const t of spec.targets || []) {
    const dst = safePath(R(run), t.path); if (!dst.ok) return { ok: false, reason: "target_outside_run", error: dst.error };
    const stagedAbs = path.resolve(R(run), String(t.staged || "")); const sp = safePath(R(run), path.relative(R(run), stagedAbs) || "."); if (!sp.ok) return { ok: false, reason: "staged_outside_run", error: sp.error };
    if (!fs.existsSync(stagedAbs) || !fs.statSync(stagedAbs).isFile()) return { ok: false, reason: "staged_missing", path: t.path };
    targets.push({ path: t.path, staged: path.relative(R(run), stagedAbs), pre: digestOrNull(dst.path), post: sha256File(stagedAbs), size: fs.statSync(stagedAbs).size });
  }
  if (!targets.length && !spec.record) return { ok: false, reason: "nothing_to_publish" };
  const id = spec.id || "tx-" + canonicalDigest({ k: spec.kind, t: targets.map((x) => [x.path, x.post]), r: spec.record || null, b: spec.base_revision ?? null }).slice(0, 14);
  return strict(run, () => {
    const cur = rj(intentFile(run, id));
    if (cur && ["prepared", "committed"].includes(cur.phase)) return { ok: true, id, intent: cur, resumed: true };
    if (cur && cur.phase === "published") return { ok: true, id, intent: cur, already_published: true };
    const intent = { schema_version: 1, id, kind: spec.kind, phase: "prepared", base_revision: spec.base_revision ?? null, targets, record: spec.record ? { file: spec.record.file, line: { ...spec.record.line, txn_id: id } } : null, created_at: nowIso(), pid: process.pid };
    for (const t of targets) { const dst = R(run, t.path); if (fs.existsSync(dst)) { try { const pd = path.join(txnDir(run), "prior", id, t.path); fs.mkdirSync(path.dirname(pd), { recursive: true }); fs.rmSync(pd, { force: true }); fs.linkSync(dst, pd); t.prior = path.relative(R(run), pd); } catch {} } }
    atomicWrite(intentFile(run, id), JSON.stringify(intent, null, 2) + "\n");
    return { ok: true, id, intent };
  });
}

// opts.current_revision: when the intent carries a base_revision, the caller's CURRENT revision must equal it (a newer revision is never overwritten).
export function commit(run, id, { current_revision } = {}) {
  return strict(run, () => {
    const intent = rj(intentFile(run, id));
    if (!intent) return { ok: false, reason: "no_such_transaction" };
    if (intent.phase === "published") return { ok: true, already_published: true };
    if (!["prepared", "committed"].includes(intent.phase)) return { ok: false, reason: `not_commitable:${intent.phase}` };
    if (intent.phase === "prepared") {
      if (intent.base_revision != null && current_revision !== undefined && current_revision !== intent.base_revision) return { ok: false, reason: "superseded_by_newer_revision", base: intent.base_revision, now: current_revision, note: "nothing was changed; the staged files are kept" };
      const conflicts = intent.targets.filter((t) => { const now = digestOrNull(R(run, t.path)); return now !== t.pre && now !== t.post; });
      if (conflicts.length) return { ok: false, reason: "target_changed_since_prepare", files: conflicts.map((t) => t.path), note: "somebody else changed it: nothing was overwritten" };
      for (const t of intent.targets) { if (digestOrNull(R(run, t.path)) === t.post) continue; const sp = R(run, t.staged); if (digestOrNull(sp) !== t.post) return { ok: false, reason: "staged_changed", path: t.path }; placeFile(sp, R(run, t.path)); }
      intent.phase = "committed"; intent.committed_at = nowIso(); atomicWrite(intentFile(run, id), JSON.stringify(intent, null, 2) + "\n");
    }
    return finishPublish(run, intent);
  });
}
function finishPublish(run, intent) {
  if (intent.record) { const f = R(run, intent.record.file); const have = (() => { try { return fs.readFileSync(f, "utf8").includes(`"txn_id":"${intent.id}"`); } catch { return false; } })(); if (!have) appendJsonl(f, intent.record.line, { sync: true }); }
  intent.phase = "published"; intent.published_at = nowIso();
  fs.mkdirSync(path.join(txnDir(run), "done"), { recursive: true });
  atomicWrite(path.join(txnDir(run), "done", path.basename(intentFile(run, intent.id))), JSON.stringify(intent, null, 2) + "\n");
  try { fs.unlinkSync(intentFile(run, intent.id)); } catch {}
  return { ok: true, id: intent.id, phase: "published" };
}

// every unfinished intent: classify by what is on disk, then (apply) finish forward or roll back.
//   all targets at post                 -> finish forward (append the record, publish)
//   all targets at pre (nothing landed) -> roll back (the intent is closed; staged files stay)
//   mix of pre and post, staged intact  -> finish forward;  staged gone -> restore landed targets from their prior links where possible
//   any target at neither pre nor post  -> conflict_newer: left alone, never overwritten, reported to the owner
export function recover(run, { apply = false } = {}) {
  let names = []; try { names = fs.readdirSync(txnDir(run)).filter((n) => n.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const n of names) {
    const intent = rj(path.join(txnDir(run), n)); if (!intent || !["prepared", "committed"].includes(intent.phase)) continue;
    const now = intent.targets.map((t) => ({ t, d: digestOrNull(R(run, t.path)) }));
    const atPost = now.filter((x) => x.d === x.t.post), atPre = now.filter((x) => x.d === x.t.pre && x.d !== x.t.post), other = now.filter((x) => x.d !== x.t.post && x.d !== x.t.pre);
    const stagedOk = atPre.every((x) => digestOrNull(R(run, x.t.staged)) === x.t.post);
    const plan = other.length ? "conflict_newer" : atPre.length === now.length && now.length ? "roll_back" : stagedOk ? "finish_forward" : "restore_prior";
    const row = { id: intent.id, kind: intent.kind, phase: intent.phase, plan, files: now.map((x) => ({ path: x.t.path, at: x.d === x.t.post ? "post" : x.d === x.t.pre ? "pre" : "other" })), applied: false };
    if (apply) row.result = strict(run, () => {
      const cur = rj(intentFile(run, intent.id)); if (!cur || !["prepared", "committed"].includes(cur.phase)) return { skipped: true };
      if (plan === "conflict_newer") { cur.phase = "conflict"; cur.note = "a target changed after this transaction was prepared; nothing was overwritten"; atomicWrite(intentFile(run, cur.id), JSON.stringify(cur, null, 2) + "\n"); return { closed: "conflict", files: other.map((x) => x.t.path) }; }
      if (plan === "roll_back") { cur.phase = "rolled_back"; cur.note = "nothing had landed"; atomicWrite(intentFile(run, cur.id), JSON.stringify(cur, null, 2) + "\n"); return { closed: "rolled_back" }; }
      if (plan === "finish_forward") { for (const x of atPre) placeFile(R(run, x.t.staged), R(run, x.t.path)); return finishPublish(run, { ...cur, phase: "committed" }); }
      const restored = [], stuck = [];
      for (const x of atPost) { const pr = x.t.prior ? R(run, x.t.prior) : null; if (pr && fs.existsSync(pr)) { placeFile(pr, R(run, x.t.path)); restored.push(x.t.path); } else stuck.push(x.t.path); }
      cur.phase = stuck.length ? "conflict" : "rolled_back"; cur.note = stuck.length ? "some landed files have no prior copy: kept, the owner decides" : "restored the previous files"; atomicWrite(intentFile(run, cur.id), JSON.stringify(cur, null, 2) + "\n");
      return { closed: cur.phase, restored, stuck };
    });
    row.applied = apply; out.push(row);
  }
  return out;
}

// ---- the public pointer ----------------------------------------------------------------------------------------------------------------------
// receipt: { source_digest, output_checksum, media_settings }  -> { ok, problems, previous_keys } ; the pointer file changes only when ok
export function publishDeliveredPointer({ pointerFile, film, outFile, receipt, keys = [], frames = null }) {
  const problems = [];
  const sum = digestOrNull(outFile);
  if (!sum) problems.push("the delivered file does not exist");
  if (!receipt || typeof receipt !== "object") problems.push("no receipt");
  else {
    if (!/^[0-9a-f]{64}$/.test(String(receipt.output_checksum || ""))) problems.push("the receipt has no sha256 output_checksum");
    else if (sum && sum !== receipt.output_checksum) problems.push("the file's checksum does not match the receipt");
    if (!receipt.source_digest) problems.push("the receipt names no source_digest");
  }
  const prev = rj(pointerFile);
  const previous_keys = prev && Array.isArray(prev.keys) ? prev.keys : [];
  if (problems.length) return { ok: false, problems, previous_keys: [] };
  atomicWrite(pointerFile, JSON.stringify({ schema_version: 1, keys, file: path.relative(film, outFile), frames, sha256: sum, source_digest: receipt.source_digest, published_at: nowIso() }, null, 2) + "\n");
  return { ok: true, problems: [], previous_keys };
}

// publish ONE media file: only a staged file that is complete (size and sha256 equal the committed manifest) replaces the final path. The previous final is kept as a hard link when there is one.
export function publishFileAtomic(staged, final, manifest) {
  if (!manifest || !/^[0-9a-f]{64}$/.test(String(manifest.sha256 || "")) || !Number.isInteger(manifest.size)) return { ok: false, reason: "no_committed_manifest", note: "a file is never published without a manifest (size and sha256)" };
  let st; try { st = fs.statSync(staged); } catch { return { ok: false, reason: "staged_missing" }; }
  if (st.size !== manifest.size) return { ok: false, reason: "partial_file", size: st.size, expected: manifest.size };
  if (sha256File(staged) !== manifest.sha256) return { ok: false, reason: "checksum_mismatch" };
  let prior = null;
  if (fs.existsSync(final)) { try { prior = `${final}.prior-${Date.now()}`; fs.linkSync(final, prior); } catch { prior = null; } }
  placeFile(staged, final);
  try { const d = fs.openSync(path.dirname(final), "r"); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch {}
  return { ok: true, path: final, prior };
}
