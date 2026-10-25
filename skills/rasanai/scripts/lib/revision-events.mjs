// Truthful progressive revision events (Plan 09 P7). The engine writes them; Studio (Plan 10) reads them from the run folder like every other piece of session state
// (the R07 boundary: the engine writes, Studio reads and appends actions). No UI is here and nothing is faked: an event states only what the render results and the dependency
// keys show, and the validator refuses a "ready" event that has no matching receipt.
//
// File: <run>/crew/revisions.jsonl (append-only, one JSON object per line) and <run>/crew/revision-latest.json (the newest event per revision_id, rewritten atomically).
// Stages, in order: source_changed, preview_pending, preview_ready, final_rendering, final_ready. Side states: failed, blocked, cancelled, stale.
//   source_changed   the SOURCE transaction (score / scene code / look / audio) was accepted; nothing has been rendered yet
//   preview_pending  a preview is queued or rendering (queue.state / reason_code say why it waits)
//   preview_ready    a preview file exists AND its receipt matches this source digest (an overlay in Studio is not this)
//   final_rendering  the delivery-quality render is running
//   final_ready      a NEW valid delivery file was published; only now does the delivered version change (until then delivered_kept names the old one)
// The event shape is documented for Plan 10 in docs/plans/PLAN09_REVISION_EVENTS.md.
import { appendJsonl } from "./recovery.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalDigest } from "./contracts.mjs";

export const EVENT_SCHEMA = 1;
export const STAGES = Object.freeze(["source_changed", "preview_pending", "preview_ready", "final_rendering", "final_ready"]);
export const SIDE_STATES = Object.freeze(["failed", "blocked", "cancelled", "stale"]);
export const BASES = Object.freeze(["dependency_results", "plan"]);
const arr = (x) => (Array.isArray(x) ? x : []);
const dir = (run) => path.join(path.resolve(String(run)), "crew");
const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
  const fd = fs.openSync(tmp, "w"); try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
export const newRevisionId = (sourceDigest = "") => "rev-" + canonicalDigest({ s: sourceDigest, r: crypto.randomBytes(4).toString("hex") }).slice(0, 12);

// the previous delivered film, kept until a new valid one exists: { file, sha256, frames } | null
export function previousDelivered(film) {
  const rec = rj(path.join(path.resolve(String(film)), "hybrid", "renders", "delivered.json"));
  if (!rec || !rec.file) return null;
  const f = path.resolve(String(film), rec.file);
  let st; try { st = fs.statSync(f); } catch { return { file: rec.file, exists: false, note: "the recorded delivered file is gone" }; }
  return { file: rec.file, exists: true, size_bytes: st.size, frames: rec.frames ?? null };
}

// ev: { revision_id, stage, film, source:{score_revision, source_digest, edit_id, action_id}, scope:{scenes, time_range}, preview:{state, kind, file},
//       final:{state, file}, work:{reused, rebuilt, pending, invalidation_causes, basis}, path:{units, fallbacks}, receipt, queue:{state, reason_code}, note }
export function validateEvent(ev) {
  const P = [];
  if (!ev || typeof ev !== "object") return ["event is not an object"];
  if (!ev.revision_id) P.push("revision_id is required");
  if (![...STAGES, ...SIDE_STATES].includes(ev.stage)) P.push(`stage ${JSON.stringify(ev.stage)} is not one of ${[...STAGES, ...SIDE_STATES].join(", ")}`);
  if (!ev.source || !ev.source.source_digest) P.push("source.source_digest is required: an event without the source it describes cannot be matched to a render");
  const rc = ev.receipt;
  if (ev.stage === "preview_ready" || ev.stage === "final_ready") {
    const kind = ev.stage === "final_ready" ? "final" : "preview";
    const file = ev[kind] && ev[kind].file;
    if (!file) P.push(`${ev.stage} needs ${kind}.file`);
    if (!rc || !rc.output_checksum) P.push(`${ev.stage} needs a receipt with output_checksum (a nonempty old file is not evidence of this edit)`);
    else if (ev.source && rc.source_digest !== ev.source.source_digest) P.push(`${ev.stage}: the receipt's source_digest is not this revision's: that render belongs to another source`);
    if (kind === "preview" && ev.preview && ev.preview.kind === "overlay") P.push("an overlay preview in Studio is ephemeral: it can never be preview_ready (the source transaction and a render have not completed)");
  }
  if (ev.stage === "source_changed" && ((ev.preview && ev.preview.state === "ready") || (ev.final && ev.final.state === "ready"))) P.push("source_changed cannot already carry a ready preview or final");
  if (ev.stage === "final_ready" && ev.final && ev.final.delivered_kept) P.push("final_ready replaced the delivered file: delivered_kept must be null now");
  if (ev.work && ev.work.basis && !BASES.includes(ev.work.basis)) P.push(`work.basis must be one of ${BASES.join(", ")}`);
  if (ev.work && ev.work.basis === "dependency_results" && !arr(ev.work.reused).length && !arr(ev.work.rebuilt).length && ev.stage !== "source_changed" && ev.stage !== "preview_pending") P.push("work.basis dependency_results with nothing reused or rebuilt");
  return P;
}

// append one event. -> { ok, event } | { ok:false, problems }. Refuses an event that would claim more than it proved.
export function emitRevision(run, ev) {
  const problems = validateEvent(ev);
  if (problems.length) return { ok: false, problems };
  const f = path.join(dir(run), "revisions.jsonl");
  fs.mkdirSync(dir(run), { recursive: true });
  let seq = 1; try { seq = fs.readFileSync(f, "utf8").split("\n").filter(Boolean).length + 1; } catch {}
  const full = { schema_version: EVENT_SCHEMA, type: "revision_progress", seq, at: new Date().toISOString(), previous_delivered: ev.film ? previousDelivered(ev.film) : null, ...ev };
  appendJsonl(f, full); // Plan 11 R1: never glued onto a torn final line
  const latestF = path.join(dir(run), "revision-latest.json");
  const latest = rj(latestF) || { schema_version: EVENT_SCHEMA, revisions: {} };
  latest.revisions[ev.revision_id] = full;
  writeAtomic(latestF, JSON.stringify(latest, null, 2) + "\n");
  return { ok: true, event: full };
}
export function readRevisions(run, { revision_id = null } = {}) {
  try { return fs.readFileSync(path.join(dir(run), "revisions.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && (!revision_id || e.revision_id === revision_id)); } catch { return []; }
}
export const latestRevisions = (run) => (rj(path.join(dir(run), "revision-latest.json")) || { revisions: {} }).revisions;

// a newer source supersedes an earlier unfinished revision: its events say stale (never silently dropped)
export function markStale(run, revision_id, by_revision_id) {
  const last = readRevisions(run, { revision_id }).pop();
  if (!last || last.stage === "final_ready" || last.stage === "stale") return { ok: false, reason: last ? "already terminal" : "unknown revision" };
  return emitRevision(run, { revision_id, stage: "stale", film: last.film, source: last.source, scope: last.scope, note: `superseded by ${by_revision_id}: its render results are not published`, queue: null });
}
