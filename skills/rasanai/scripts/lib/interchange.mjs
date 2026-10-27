// Plan 12 D6/D8: timeline interchange with an honest loss report.
//
// Design (follows docs/plans/hybrid-film-contracts.md C8; no OTIO code existed in this checkout, so this is new):
//   timelineModel()   a NEUTRAL, exact model of the delivered edit: tracks, clips with source ranges, gaps, transitions, rational rates (integer
//                     frames, never float seconds), handles (known | unknown, never silently zero), audio stems, caption REFERENCES, relative media paths.
//                     It is the single thing the writers consume.
//   lossReport()      what an interchange file cannot carry: baked scene proxies, time-warps, unsupported effects, unknown handles, subtitle behaviour,
//                     alpha, nested compositions. A clean serialisation is not a verified editor round trip.
//   otio              written ONLY by the official OpenTimelineIO library inside the optional Python sidecar (lib/interchange/otio_sidecar.py),
//                     pinned by lib/interchange/otio-pin.json (a compatible range until Plan 14 records an exact verified version). If the sidecar or the
//                     library is not there the result is `otio_unavailable` plus the neutral model; a hand-built .otio is never produced.
//   GSAP / Three.js / HTML scenes travel as RENDERED PROXIES plus source links, labelled baked; they never become native editable layers.
//   FCPXML / AAF / EDL: capability rows say unavailable until an adapter exists AND its destination round trip is recorded.
//   relink            media paths are relative to the package; `relinkCheck` re-resolves every path and hash after a move.
// No encodes, no network, no installs. `doctor` and `exportOtio` start the sidecar only when the CLI asks for them.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION, canonicalDigest } from "./contracts.mjs";
import { rate as toRate, TICKS_PER_S } from "./timing.mjs";
import { resolveInRoots } from "./containment.mjs";
import { sha256File, editability } from "./delivery-manifest.mjs";
import { atomicWrite } from "./recovery.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SIDECAR = path.join(HERE, "interchange", "otio_sidecar.py");
export const PIN_FILE = path.join(HERE, "interchange", "otio-pin.json");
export const MODEL_SCHEMA = "rasanai.interchange.v1";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const int = (x) => (Number.isInteger(x) ? x : Number.isFinite(Number(x)) ? Math.round(Number(x)) : null);

const rt = (value, r) => ({ value, rate: r.num / r.den, rate_num: r.num, rate_den: r.den });
const range = (start, dur, r) => ({ start: rt(start, r), duration: rt(dur, r) });
const isAbs = (p) => path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p);
const relOk = (p) => typeof p === "string" && p && !isAbs(p) && !p.split(/[\\/]/).includes("..") && !p.includes("\0");

// spec:
// { name, rate (30 | "30000/1001" | {num,den}), duration_frames?,
//   tracks: [{ id, kind: "video"|"audio", name?, items: [
//       { type: "clip", id, name?, element_id?, media_path (relative to the package), media_rate?, source_in_f, duration_f, available_f?,
//         scene?: { engine: "gsap"|"threejs"|"html"|"hyperframes", source_link?: relative path, proxy: true },
//         retime?: { mode: "linear"|"freeze"|"ramp", factor? }, effects?: [name], alpha?: bool, role?: "master"|"stem"|"music"|"voice"|"sfx"|"footage" },
//       { type: "gap", duration_f },
//       { type: "transition", kind: "dissolve"|"cut"|"wipe"|"other", in_f, out_f, handles?: { head_f: int|null, tail_f: int|null } } ] }],
//   captions: [{ id, language, path (relative), format: "srt"|"vtt" }], stems: [{ id, path, role }], warnings?: [] }
export function timelineModel(spec) {
  const S = isObj(spec) ? spec : {};
  const r = toRate(S.rate ?? 30);
  const problems = [];
  const tracks = [];
  for (const t of arr(S.tracks)) {
    const items = [];
    let pos = 0;
    arr(t.items).forEach((it, idx) => {
      const at = `${t.id || "track"}[${idx}]`;
      if (it.type === "gap") {
        const d = int(it.duration_f);
        if (!(d > 0)) { problems.push(`${at}: a gap needs a positive duration_f`); return; }
        items.push({ type: "gap", id: it.id || `${t.id}-gap-${idx}`, source_range: range(0, d, r), record_start_f: pos }); pos += d; return;
      }
      if (it.type === "transition") {
        const inF = int(it.in_f), outF = int(it.out_f);
        if (!(inF >= 0 && outF >= 0)) { problems.push(`${at}: a transition needs in_f and out_f`); return; }
        const h = isObj(it.handles) ? it.handles : null;
        // missing handles are UNKNOWN, not zero: a transition with no recorded handles is never described as handle-free
        const handles = h ? { head_f: h.head_f === null || h.head_f === undefined ? null : int(h.head_f), tail_f: h.tail_f === null || h.tail_f === undefined ? null : int(h.tail_f) } : { head_f: null, tail_f: null };
        const known = handles.head_f !== null && handles.tail_f !== null;
        items.push({ type: "transition", id: it.id || `${t.id}-tr-${idx}`, name: it.kind || "transition", kind: it.kind || "dissolve", in_offset: rt(inF, r), out_offset: rt(outF, r), record_start_f: pos, handles: { ...handles, state: known ? "known" : "unknown" }, metadata: { handles: { ...handles, state: known ? "known" : "unknown" }, kind: it.kind || "dissolve" } });
        return;
      }
      if (it.type !== "clip") { problems.push(`${at}: unknown item type ${JSON.stringify(it.type)}`); return; }
      const d = int(it.duration_f), s = int(it.source_in_f ?? 0);
      if (!(d > 0) || !(s >= 0)) { problems.push(`${at}: a clip needs source_in_f >= 0 and a positive duration_f`); return; }
      if (!relOk(it.media_path)) problems.push(`${at}: media_path must be relative to the package, without .. (got ${it.media_path ? "an unsafe path" : "nothing"})`);
      const mr = it.media_rate ? toRate(it.media_rate) : r;
      const proxy = !!(it.scene && it.scene.proxy);
      const ed = editability({ kind: proxy ? "proxy" : it.role || "media" });
      items.push({
        type: "clip", id: it.id, name: it.name || it.id, record_start_f: pos, source_range: range(s, d, mr),
        media: { relative_path: str(it.media_path), element_id: it.element_id || null, available_range: it.available_f ? range(0, int(it.available_f), mr) : null, rate: { num: mr.num, den: mr.den } },
        editability: ed.label, retime: it.retime || null, effects: arr(it.effects), alpha: it.alpha === true,
        metadata: { element_id: it.element_id || null, role: it.role || null, editability: ed.label, scene: proxy ? { engine: str(it.scene.engine) || "unknown", source_link: it.scene.source_link || null, note: "rendered proxy; the source is linked, not editable as layers here" } : null },
      });
      pos += d;
    });
    tracks.push({ id: str(t.id), name: str(t.name) || str(t.id), kind: t.kind === "audio" ? "audio" : "video", items, duration_f: pos });
  }
  const dur = Math.max(0, ...tracks.map((t) => t.duration_f));
  if (Number.isInteger(S.duration_frames) && dur !== S.duration_frames) problems.push(`tracks run ${dur} frames but the delivered film is ${S.duration_frames}`);
  const captions = arr(S.captions).map((c) => ({ id: c.id, language: c.language || "und", path: c.path, format: c.format || path.extname(str(c.path)).slice(1) }));
  for (const c of captions) if (!relOk(c.path)) problems.push(`caption ${c.id}: path must be relative`);
  const model = {
    schema: MODEL_SCHEMA, schema_version: SCHEMA_VERSION, name: str(S.name) || "RasanAI timeline", rate: { num: r.num, den: r.den, fps: r.fps }, ticks_per_s: TICKS_PER_S,
    convention: "frames at the timeline rate; ranges start-inclusive, end-exclusive; no float seconds", duration_f: dur, tracks, captions,
    stems: arr(S.stems).map((s) => ({ id: s.id, path: s.path, role: s.role || "stem", real: true })),
    note: "interchange model: clips are the delivered edit; scene proxies are baked renders with source links",
  };
  model.loss_report = lossReport(model, S);
  model.digest = canonicalDigest({ ...model, digest: null }).slice(0, 16);
  return { ok: !problems.length, problems, model };
}

export function lossReport(model, spec = {}) {
  const loss = [];
  const add = (kind, where, detail, severity = "warning") => loss.push({ kind, where, detail, severity });
  for (const t of arr(model.tracks)) for (const it of t.items) {
    if (it.type === "clip") {
      const sc = it.metadata && it.metadata.scene;
      if (sc) add("baked_proxy", it.id, `${sc.engine} scene is delivered as a rendered proxy${sc.source_link ? ` with a source link (${sc.source_link})` : " (no source link recorded)"}: not an editable layer in another editor`, "info");
      if (it.retime) add("time_warp", it.id, `${it.retime.mode || "retime"}${it.retime.factor ? ` x${it.retime.factor}` : ""}: carried as metadata; whether an editor applies it is not verified, and the proxy already contains it when baked`);
      for (const e of arr(it.effects)) add("unsupported_effect", it.id, `${e}: not carried as an editable effect; present only if baked into the media`);
      if (it.alpha) add("alpha", it.id, "alpha channel: depends on the media codec and the editor; not verified");
    } else if (it.type === "transition") {
      if (it.handles.state === "unknown") add("transition_handles_unknown", it.id, "no head/tail handles were recorded: they are UNKNOWN, not zero-length; an editor may refuse the transition or clamp it");
      else if (it.handles.head_f === 0 || it.handles.tail_f === 0) add("transition_no_handle", it.id, "a recorded zero handle: the transition has nothing to overlap on that side", "info");
      if (it.kind && !["dissolve", "cut"].includes(it.kind)) add("transition_kind", it.id, `${it.kind} wipes and custom transitions are written as a generic transition; the look is not carried`);
    }
  }
  if (arr(model.captions).length) add("subtitle_behaviour", "captions", "captions are referenced as sidecar files (and listed in metadata): they are not imported as an editor caption track, styling and burn-in are not carried", "info");
  if (arr(spec.nested).length) add("nested_composition", spec.nested.join(","), "nested compositions are flattened to rendered clips");
  return loss;
}

// ---- verification of the model itself (no file reads) ----------------------------------------------------------------------------------------
export function verifyModel(m) {
  const problems = [];
  if (!m || m.schema !== MODEL_SCHEMA) return { ok: false, problems: ["not an interchange model"] };
  for (const t of m.tracks) {
    t.items.forEach((it, i) => {
      if (it.type === "clip") {
        if (!relOk(it.media.relative_path)) problems.push(`${t.id}[${i}]: media path is not relative`);
        if (it.source_range.duration.rate_num !== (it.media.rate.num) || it.source_range.duration.rate_den !== it.media.rate.den) problems.push(`${t.id}[${i}]: source range rate differs from the media rate`);
        if (it.media.available_range && it.source_range.start.value + it.source_range.duration.value > it.media.available_range.duration.value) problems.push(`${t.id}[${i}]: the source range runs past the available media`);
      }
    });
  }
  const json = JSON.stringify(m);
  if (/"(?:\/Users|\/home|[A-Za-z]:\\\\Users)/.test(json)) problems.push("a private absolute path appears in the model");
  return { ok: !problems.length, problems };
}

// ---- relinking after a move -------------------------------------------------------------------------------------------------------------------
// packageRoot: the folder the package now lives in. manifest: delivery MANIFEST.json (elements with path + sha256)
export function relinkCheck(model, packageRoot, manifest = null) {
  const problems = [], resolved = [];
  const hash = new Map(arr(manifest && manifest.elements).filter((e) => e.path && e.sha256).map((e) => [e.path, e.sha256]));
  for (const t of arr(model.tracks)) for (const it of t.items) {
    if (it.type !== "clip") continue;
    const rel = it.media.relative_path;
    const r = resolveInRoots([packageRoot], rel, { mustExist: true });
    if (!r.ok) { problems.push({ clip: it.id, path: rel, problem: r.reason, why: r.error }); continue; }
    const want = hash.get(rel);
    if (want && sha256File(r.path) !== want) problems.push({ clip: it.id, path: rel, problem: "checksum", why: "the file is not the one the manifest names" });
    else resolved.push(rel);
  }
  return { ok: !problems.length, problems, resolved: resolved.length };
}

// ---- the optional sidecar ----------------------------------------------------------------------------------------------------------------------
const pythonFor = (env = process.env) => env.RASANAI_OTIO_PYTHON || "python3";
function runSidecar(args, { env = process.env, timeoutMs = 30000 } = {}) {
  const r = spawnSync(pythonFor(env), ["-I", SIDECAR, ...args], { encoding: "utf8", timeout: timeoutMs, env: { PATH: env.PATH || "", HOME: env.HOME || "" } });
  if (r.error) return { ran: false, reason: r.error.code === "ENOENT" ? "python_not_found" : r.error.code || "spawn_failed", detail: String(r.error.message).slice(0, 160) };
  let json = null; try { json = JSON.parse(r.stdout); } catch {}
  return { ran: true, status: r.status, json, stderr: String(r.stderr || "").slice(0, 300) };
}
// the deliberate probe: starts Python and tries to import OpenTimelineIO. Never installs anything.
export function doctor({ env = process.env } = {}) {
  const r = runSidecar(["doctor", "--pin", PIN_FILE], { env });
  if (!r.ran) return { available: false, state: "otio_unavailable", reason: r.reason, note: "OpenTimelineIO is optional. The neutral interchange model is still produced; no .otio is written." };
  if (r.status === 3 || !r.json || r.json.available === false) return { available: false, state: "otio_unavailable", reason: (r.json && r.json.reason) || "opentimelineio_not_importable", detail: r.json && r.json.detail };
  return { available: true, state: r.json.pin && r.json.pin.status, pin: r.json.pin, verified: false, note: r.json.note };
}
// writes film.otio (official library, then re-read and compared) next to film.interchange.json; the neutral model is always written
export function exportOtio({ model, outDir, name = "timeline", env = process.env } = {}) {
  const v = verifyModel(model);
  if (!v.ok) return { ok: false, reason: "model_invalid", problems: v.problems };
  fs.mkdirSync(outDir, { recursive: true });
  const modelFile = path.join(outDir, `${name}.interchange.json`);
  atomicWrite(modelFile, JSON.stringify(model, null, 2) + "\n");
  const base = { model_file: path.basename(modelFile), loss_report: model.loss_report, verified_editor_import: false };
  const otioFile = path.join(outDir, `${name}.otio`), partFile = path.join(outDir, `.${name}.part.otio`); // the OTIO adapter is chosen by extension, so the staging name still ends in .otio
  const r = runSidecar(["write", "--model", modelFile, "--out", partFile, "--pin", PIN_FILE], { env });
  const unavailable = !r.ran || r.status === 3;
  if (unavailable) { try { fs.rmSync(partFile, { force: true }); } catch {} return { ok: false, state: "otio_unavailable", reason: r.ran ? "opentimelineio_not_importable" : r.reason, ...base, note: "no .otio was written: RasanAI does not hand-build OTIO JSON. Install the library in your own environment (RASANAI_OTIO_PYTHON) if you want it." }; }
  if (!r.json || r.status !== 0) { try { fs.rmSync(partFile, { force: true }); } catch {} return { ok: false, state: "otio_write_failed", reason: "sidecar_check_failed", detail: r.json && r.json.read_back_problems || r.stderr, ...base }; }
  fs.renameSync(partFile, otioFile);
  return { ok: true, state: "otio_written_reread_ok", otio_file: path.basename(otioFile), pin: r.json.pin, ...base, note: "written and re-read by the official library; this is not proof that any editor imports it" };
}

// ---- capability states and the manual round-trip list --------------------------------------------------------------------------------------
// registry rows come from capabilities.buildRegistry (`interchange.*`); this only filters and words them
export function capabilityStates(rows) {
  return arr(rows).filter((c) => /^interchange\./.test(c.id)).map((c) => ({ id: c.id, label: c.label, ui_state: c.ui_state, blocked_by: c.blocked_by, verification: c.verification_status, offer: c.ui_state === "ready" || c.ui_state === "experimental" }));
}
// editors Plan 14 must try by hand. Nothing here claims an import path works; every status is not_run.
export const EDITOR_ROUND_TRIPS = Object.freeze([
  { editor: "DaVinci Resolve", formats: ["otio", "fcpxml", "aaf", "edl"], status: "not_run", record: "which formats import, whether clips relink after moving the package, transition handling" },
  { editor: "Final Cut Pro", formats: ["fcpxml"], status: "not_run", record: "whether an FCPXML adapter exists in this install; .otio import path is unknown until tested" },
  { editor: "Adobe Premiere Pro", formats: ["otio", "aaf", "edl", "fcpxml"], status: "not_run", record: "native vs plugin import, relinking, transitions" },
  { editor: "Avid Media Composer", formats: ["aaf", "edl", "otio"], status: "not_run", record: "AAF/EDL import and media relinking" },
  { editor: "OpenTimelineIO reference viewer / otioview", formats: ["otio"], status: "not_run", record: "read-back parity with the neutral model" },
]);
