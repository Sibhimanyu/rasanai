// Plan 10 U7: one owned source transaction. The writer lock is held across COMPARE + PATCH + PUBLICATION (the source write and the edit-log transition),
// not just the log append. A recoverable journal names what was about to change; if the process dies between the source write and the log line, the next
// transaction finishes the transition (or finds nothing was written). The lock is STRICT: lib/runlock.mjs withLock goes on without the lock after its
// timeout (right for a console file, wrong here), so this uses acquire() directly and refuses when it cannot take the lock.
//
//   withSourceTxn(run, project, { id, kind: "apply"|"undo"|"redo"|"restore", files: [project-relative] }, fn)
//   Re-entrant inside one process (typedEdit -> record -> applySimple all run in one transaction).
//   payloadDigest(edit)  stable digest of what the client asked for: same action id + same digest = retry, same id + different digest = conflict.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { acquire, release } from "../runlock.mjs";
import { canonicalDigest } from "../contracts.mjs";
import * as core from "./index.mjs";
import { atomicWrite } from "../recovery.mjs";

const held = new Set();
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const lockPath = (run) => path.join(run, "motion", "source.lock");
const journalPath = (run) => path.join(run, "motion", "journal.json");
const busy = () => { const e = new Error("another edit is writing this film's source right now; nothing was changed, try again in a moment"); e.userFacing = true; e.busy = true; return e; };

export function payloadDigest(edit) {
  const e = edit || {};
  return canonicalDigest({
    operation: e.operation ?? null, scene_id: e.scene_id ?? null, element_id: e.element_id ?? null, region_norm: e.region_norm ?? null, time_s: e.time_s ?? null,
    fields: e.fields ?? null, instruction: e.instruction ?? null, original: e.original ?? null, proposed: e.proposed ?? null,
    film_version: e.film_version ?? null, build_digest: e.build_digest ?? null, element_digest: e.element_digest ?? null,
  });
}

function fileShas(project, rels) {
  const out = {};
  for (const rel of rels) { try { out[rel] = sha(fs.readFileSync(path.join(project, rel))); } catch { out[rel] = null; } }
  return out;
}
const writeAtomic = (f, text) => { atomicWrite(f, text); }; // Plan 11 R1: fsync of file and directory, temp removed on failure

// Plan 11 R8: the journal has phases. prepared = intent + pre-state digests; committed = the source write returned, with POST-state digests; published = the log line landed and the journal is gone.
// Recovery uses them so it never writes over a NEWER revision: a file that is neither the recorded pre-state nor the recorded post-state means somebody else changed it since, and the
// journal is dropped without logging anything on that edit's behalf.
// finish a transition that a dead process began; under the lock. -> { recovered, ... }
export function recoverJournal(run, project) {
  let j; try { j = JSON.parse(fs.readFileSync(journalPath(run), "utf8")); } catch { return { recovered: false }; }
  const now = fileShas(project, Object.keys(j.pre || {}));
  const changed = Object.keys(j.pre || {}).some((k) => now[k] !== j.pre[k]);
  let did = null, conflict = null;
  if (changed && j.post) {
    const keys = Object.keys(j.pre);
    const newer = keys.filter((k) => now[k] !== j.pre[k] && now[k] !== j.post[k]);
    if (newer.length) conflict = { kind: "newer_revision", files: newer, note: "a file changed after this transaction began: nothing is logged or overwritten on its behalf" };
    else if (keys.some((k) => now[k] !== j.post[k])) conflict = { kind: "partial_write", files: keys.filter((k) => now[k] !== j.post[k]), note: "the transaction died part-way through its source writes" };
  }
  if (conflict && conflict.kind === "partial_write" && j.id) {
    const edit = core.latest(run, j.id);
    if (edit && ["requested", "accepted"].includes(edit.status)) { core.appendStatus(run, j.id, { status: "conflicted", note: "interrupted while writing the source: some files changed and some did not. Restore the last checkpoint as a new version, then redo the edit." }); did = "marked_conflicted"; }
  } else if (changed && j.id && !conflict) {
    const edit = core.latest(run, j.id);
    const digest = core.digestOf(project, Object.keys(j.pre));
    if (edit && j.kind === "apply" && ["requested", "accepted"].includes(edit.status) && !(edit.patch && edit.patch.digest === digest)) {
      core.appendStatus(run, j.id, { patch: { files: Object.keys(j.pre), digest }, status: edit.status === "requested" ? "accepted" : edit.status, note: "recovered from the journal: the source write landed but the log line did not" });
      did = "apply_logged";
    } else if (edit && ["undo", "restore"].includes(j.kind) && edit.status !== "reverted") {
      core.appendStatus(run, j.id, { status: "reverted", note: "recovered from the journal: the restore landed but the log line did not" });
      did = "undo_logged";
    }
  }
  try { fs.rmSync(journalPath(run), { force: true }); } catch {}
  return { recovered: changed && !conflict, did, id: j.id, ...(conflict ? { conflict } : {}) };
}

export function withSourceTxn(run, project, meta, fn) {
  const key = path.resolve(run);
  if (held.has(key)) return fn(); // already inside this process's transaction
  fs.mkdirSync(path.join(run, "motion"), { recursive: true });
  if (!acquire(lockPath(run), 8000)) throw busy();
  held.add(key);
  try {
    recoverJournal(run, project);
    const rels = (meta.files || []).filter(Boolean);
    const pre = fileShas(project, rels);
    if (rels.length) writeAtomic(journalPath(run), JSON.stringify({ schema_version: 2, phase: "prepared", id: meta.id || null, kind: meta.kind || "apply", pre, started: new Date().toISOString(), pid: process.pid }));
    let out;
    try { out = fn(); }
    catch (e) {
      // nothing written: drop the journal; written but not logged: keep it, the next transaction finishes it
      const now = fileShas(project, rels);
      if (!rels.some((r) => now[r] !== pre[r])) { try { fs.rmSync(journalPath(run), { force: true }); } catch {} }
      throw e;
    }
    // committed: record the post-state digests BEFORE the caller's log line is considered done; if we die right here, recovery can tell "landed" from "someone else changed it"
    if (rels.length) { try { const post = fileShas(project, rels); const j = JSON.parse(fs.readFileSync(journalPath(run), "utf8")); writeAtomic(journalPath(run), JSON.stringify({ ...j, phase: "committed", post })); } catch {} }
    try { fs.rmSync(journalPath(run), { force: true }); } catch {} // published
    return out;
  } finally { held.delete(key); release(lockPath(run)); }
}
