// Plan 10 U8 (+ U5 compare): what ties a preview, a pointer or a render to a REVISION. Pure functions; no file is written here.
//   checkRenderReceipt   only a receipt that names this edit, carries the digests, media settings and an output checksum, and whose file hashes to
//                        that checksum may move an edit to preview_ready / rendered. A merely existing nonempty MP4/PNG is never evidence.
//   bindAnnotation       a pointer / annotation attaches to the DISPLAYED render revision and its element index; a stale index is never silently used.
//   timelineCorrespondence  explicit Original -> Updated time mapping per beat for retimed versions (never "same timestamp = same beat").
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const HEX64 = /^[0-9a-f]{64}$/i;
const sha256File = (f) => { try { return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); } catch { return null; } };

// ---- U8: the render receipt ------------------------------------------------------------------------------------------------------------
// receipt: { edit_id, source_digest, score_digest?, look_digest?, build_job?, attempt?, media_settings:{mode,...}, output_checksum }
//   (the shape lib/hybrid-render writes into a revision event; score/look digests and the job are recorded when present and reported as unavailable otherwise)
// event (optional): the revision_progress event the receipt came from { stage, source:{edit_id}, preview:{file}, final:{file} }
// edit: the latest edits.jsonl line. kind: "preview" | "final". ctx: { run, accepted?: {source,score,look}, outputFile?, stale_revisions?:Set }
// -> { ok, problems:[...], unavailable:[...], evidence:{ output_sha, file } }
export function checkRenderReceipt({ receipt, event = null, edit, kind = "final", run = ".", outputFile = null, accepted = null, staleRevisionIds = [] } = {}) {
  const problems = [], unavailable = [];
  if (!isObj(receipt)) return { ok: false, problems: ["no receipt: a file that merely exists is not evidence that this edit was rendered"], unavailable, evidence: null };
  if (!edit || !edit.id) problems.push("no edit to match the receipt against");
  if (!receipt.edit_id) problems.push("the receipt names no edit_id");
  else if (edit && receipt.edit_id !== edit.id) problems.push(`the receipt is for edit ${receipt.edit_id}, not ${edit.id}`);
  if (!receipt.source_digest || typeof receipt.source_digest !== "string") problems.push("the receipt has no source_digest (the accepted source this render was made from)");
  if (!isObj(receipt.media_settings)) problems.push("the receipt has no media_settings");
  const sum = String(receipt.output_checksum || "");
  if (!HEX64.test(sum)) problems.push("the receipt has no sha256 output_checksum");
  const mode = receipt.media_settings && receipt.media_settings.mode;
  if (isObj(receipt.media_settings)) {
    if (kind === "final" && mode && !["delivery", "final"].includes(mode)) problems.push(`mode ${JSON.stringify(mode)} is a ${mode}, not a delivery render: use preview_ready for it`);
    if (kind === "preview" && mode && ["delivery", "final"].includes(mode) === false && mode !== "preview") problems.push(`mode ${JSON.stringify(mode)} is not a preview render`);
  }
  if (event) {
    if (event.stage !== (kind === "final" ? "final_ready" : "preview_ready")) problems.push(`the event says ${event.stage}, not ${kind === "final" ? "final_ready" : "preview_ready"}`);
    if (event.source && edit && event.source.edit_id && event.source.edit_id !== edit.id) problems.push(`the event belongs to edit ${event.source.edit_id}`);
    if (event.source && event.source.source_digest && receipt.source_digest && event.source.source_digest !== receipt.source_digest) problems.push("the event's source_digest and the receipt's differ: the render belongs to another source");
    if (event.preview && event.preview.kind === "overlay") problems.push("an overlay preview is ephemeral and never evidence of a render");
    if (staleRevisionIds.includes(event.revision_id)) problems.push(`revision ${event.revision_id} was superseded by a newer source`);
  }
  if (accepted) for (const k of ["source", "score", "look"]) {
    const want = accepted[k], got = receipt[`${k}_digest`];
    if (want && !got) problems.push(`the receipt does not carry the ${k} digest this edit was accepted under`);
    else if (want && got && want !== got) problems.push(`${k} digest differs from the one this edit was accepted under: the render predates or postdates the edit`);
  }
  for (const k of ["score_digest", "look_digest", "build_job", "attempt"]) if (receipt[k] == null) unavailable.push(k);
  // the file must exist and hash to the checksum
  const rel = outputFile || (event && ((kind === "final" ? event.final : event.preview) || {}).file) || null;
  let file = null, outSha = null;
  if (!rel) problems.push("no output file to verify: pass the rendered file (--preview <file>) or an event that names it");
  else {
    file = path.isAbsolute(rel) ? rel : path.resolve(String(run), rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) problems.push(`output file not found or empty: ${rel}`);
    else {
      outSha = sha256File(file);
      if (HEX64.test(sum) && outSha !== sum.toLowerCase()) problems.push("the output file does not hash to the receipt's output_checksum: it is another render");
    }
  }
  return { ok: problems.length === 0, problems, unavailable, evidence: { output_sha: outSha, file } };
}

// ---- U8: a pointer / annotation is bound to the displayed render ------------------------------------------------------------------------
// annotation: { render_revision_id, output_checksum?, index_build_digest, element_id?, time_s, region_norm?, frame_ref?, note }
// displayed:  { render_revision_id, output_checksum? }      what the viewer is looking at now
// index:      the CURRENT motion/element-index.json (or null)       currentBuildDigest: buildDigest(project) now, when the caller can compute it
// -> { ok, bound, mode: "element"|"region_only"|"conflict", reasons:[...], apply_allowed, reselect, show:{ annotated_frame, region_norm }, note_kept }
export function bindAnnotation({ annotation, displayed = {}, index = null, currentBuildDigest = null } = {}) {
  const a = isObj(annotation) ? annotation : {};
  const reasons = [];
  if (displayed.render_revision_id && a.render_revision_id && displayed.render_revision_id !== a.render_revision_id) reasons.push("the annotation was made on a different render than the one displayed");
  if (displayed.output_checksum && a.output_checksum && displayed.output_checksum !== a.output_checksum) reasons.push("the annotated picture is not the displayed file (checksum differs)");
  if (!a.render_revision_id) reasons.push("the annotation names no render revision");
  let indexOk = true;
  if (a.element_id) {
    if (!index) { indexOk = false; reasons.push("there is no element index to confirm the element"); }
    else {
      if (!a.index_build_digest) { indexOk = false; reasons.push("the annotation recorded no index build digest"); }
      else if (index.build_digest && a.index_build_digest !== index.build_digest) { indexOk = false; reasons.push("the element index was rebuilt since the annotation: its bounds may belong to another picture"); }
      if (currentBuildDigest && index.build_digest && index.build_digest !== currentBuildDigest) { indexOk = false; reasons.push("the element index is older than the scene sources"); }
      if (indexOk && !arr(index.items).some((i) => i.element_id === a.element_id)) { indexOk = false; reasons.push(`element ${a.element_id} is not in the current index`); }
    }
  }
  const renderOk = !reasons.some((r) => /different render|not the displayed file|names no render/.test(r));
  const elementOk = a.element_id ? indexOk && renderOk : false;
  const hasRegion = isObj(a.region_norm) && ["x", "y", "w", "h"].every((k) => typeof a.region_norm[k] === "number");
  const show = { annotated_frame: a.frame_ref || null, region_norm: hasRegion ? a.region_norm : null, time_s: a.time_s ?? null };
  if (elementOk) return { ok: true, bound: true, mode: "element", reasons: [], apply_allowed: true, reselect: false, show, note_kept: true };
  // region-only fallback keeps the note; it never authorises an edit on an unconfirmed object
  return { ok: false, bound: false, mode: hasRegion && renderOk ? "region_only" : "conflict", reasons, apply_allowed: false, reselect: true, show, note_kept: true,
    message: "The picture or its element index changed since you pointed. Your note is kept; pick the element again on the current render." };
}

// ---- U5: Original / Updated correspondence --------------------------------------------------------------------------------------------
// each timeline: { beats: [{ id, start, end }] } (seconds). -> { identical, segments:[{beat_id, original:[a,b], updated:[c,d], retimed}], added:[ids], removed:[ids] }
export function timelineCorrespondence(original, updated) {
  const o = arr(original && original.beats), u = arr(updated && updated.beats);
  const uById = new Map(u.map((b) => [b.id, b]));
  const segments = [], removed = [];
  for (const b of o) {
    const m = uById.get(b.id);
    if (!m) { removed.push(b.id); continue; }
    segments.push({ beat_id: b.id, original: [b.start, b.end], updated: [m.start, m.end], retimed: Math.abs(b.start - m.start) > 1e-6 || Math.abs(b.end - m.end) > 1e-6 });
  }
  const oIds = new Set(o.map((b) => b.id));
  const added = u.filter((b) => !oIds.has(b.id)).map((b) => b.id);
  return { identical: !segments.some((s) => s.retimed) && !added.length && !removed.length, segments, added, removed };
}
// map a time on one side to the other through the beat it falls in (linear inside the beat). direction: "original_to_updated" | "updated_to_original"
// -> { t, beat_id, exact:true } | { t:null, beat_id:null, exact:false, reason }
export function mapTime(corr, t, direction = "original_to_updated") {
  const fwd = direction === "original_to_updated";
  for (const s of arr(corr && corr.segments)) {
    const [a, b] = fwd ? s.original : s.updated, [c, d] = fwd ? s.updated : s.original;
    if (t >= a && (t < b || (t === b && s === corr.segments[corr.segments.length - 1]))) {
      const f = b > a ? (t - a) / (b - a) : 0;
      return { t: c + f * (d - c), beat_id: s.beat_id, exact: true };
    }
  }
  return { t: null, beat_id: null, exact: false, reason: "no matching beat on the other side (added, removed or outside the film)" };
}
