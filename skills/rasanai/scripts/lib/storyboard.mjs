// The Storyboard stage (Plan 05 E1, E2, E6, E7): shot and panel records, the stage boundary, the approval snapshot, the central classification of
// meaningful vs harmless change, and the cheap deterministic timed playback (the animatic). ONE review: panels plus timed playback; no sixth approval.
//
// Files (all under <run>/storyboard/, additive; frames/shots.json and the console's `animatic` step stay what they were and are ADOPTED, not replaced):
//   storyboard.json        the shot/panel records (kind "full" or "sketch"), revision, pinned inputs, derived timing
//   inputs.json            the Story and Look digests the full storyboard was scheduled from (stale detection)
//   revisions/rev-N.json   earlier panel sets, labelled old (never presented as current)
//   approvals.json         approval snapshots (contracts.approvalRecord + the pinned snapshot)
//   decision.json          a "Just make it" auto-decision for this stage (recorded, the Final is still shown)
//   animatic.json          the playback plan (+ animatic.mp4 only when `storyboard.mjs animatic --render` runs)
//
//   storyboardStageOf(key, hint) / mapLegacyRecord(rec) / legacyAction(action)       the old names -> the one Storyboard stage
//   storyDigest(run) / lookDigest(run) / boundary(run, o) / pinInputs(run) / panelSetCurrent(doc, run) / labelOld(doc)
//   fromLegacyShots(doc, o) / fromLegacyAnimatic(step, o) / normalizeShot(raw) / validateShot(s, ctx) / validateStoryboardDoc(doc, ctx) / toContractShape(doc)
//   writeStoryboard(run, doc) / readStoryboard(run) / restartAtStoryboard(run)
//   makeSnapshot(o) / approveStoryboard(o) / classifySnapshotChange(prev, next) / snapshotCurrent(record, nowSnapshot) / audioReplacementImpact(o)
//   autoDecision(o) / recordAutoDecision(run, rec)
//   animaticPlan(doc, o) / anchorAt(plan, t) / animaticPayload(plan, doc) / renderAnimatic(plan, out, o)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { approvalRecord, canonicalDigest, nextRevision, validateStoryboard, SCHEMA_VERSION } from "./contracts.mjs";
import { impact } from "./impact.mjs";
import { contractForStoryboard, readAudioContract } from "./audio-direction.mjs";
import { logicalStage, missingPrerequisites } from "./stages.mjs";
import { lookCommitted } from "./look.mjs";
import { CUT_RELATIONS, checkReading } from "./editorial.mjs";
import { layout, rate, reconcile, scoreRevision, toTicks, fromTicks } from "./timing.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
const rjson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const has = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const fileDigest = (p) => { try { return sha(fs.readFileSync(p)); } catch { return null; } };
const SB = (run, ...p) => path.join(path.resolve(String(run)), "storyboard", ...p);
function writeJson(p, o) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(o, null, 2) + "\n");
  fs.renameSync(tmp, p);
}

// ---- E1: the old names are all the Storyboard --------------------------------------------------------------------------------------------
// stages.json maps animatic/keyframes/voice/music/... to storyboard, and styleframes to look (the Look's representative frame).
// The per-beat boards (frames/shots.json, one board per beat) are Storyboard work, so a styleframes record is the Look only when it is the
// look comparison (hint "heroes" | "look" | "representative").
const BOARD_KEYS = new Set(["frames", "shots", "boards", "animatic", "preview", "keyframes", "storyboard", "thumbs", "reel", "transitions", "voice", "music"]);
export function storyboardStageOf(key, hint = "") {
  const k = T(key);
  if (k === "styleframes") return /heroes|look|representative/i.test(T(hint)) ? "look" : "storyboard";
  if (BOARD_KEYS.has(k)) return "storyboard";
  return logicalStage(k);
}
// a record from an old run or the console: { step | kind | stage, ... } -> { stage, legacy_key, one_review: true }
export function mapLegacyRecord(rec) {
  const r = isObj(rec) ? rec : {};
  const key = T(r.step || r.kind || r.stage || r.type);
  const stage = storyboardStageOf(key, r.hint || r.scope || r.phase);
  return { stage, legacy_key: key || null, one_review: stage === "storyboard", extra_approval: false };
}
// the console's old `animatic` actions (approve / comment / redo / decide) are Storyboard actions: same step key on disk, one logical stage
export function legacyAction(action) {
  const a = isObj(action) ? action : {};
  return { stage: storyboardStageOf(a.step), step: a.step || null, type: a.type || null, target: isObj(a.value) ? { shot_id: a.value.shot_id ?? null, panel_id: a.value.panel_id ?? null, scene: a.value.scene ?? null, t: typeof a.value.t === "number" ? a.value.t : null } : null };
}

// ---- E1: the stage boundary ---------------------------------------------------------------------------------------------------------------
export function storyDigest(run) {
  const r = path.resolve(String(run));
  for (const f of ["story/chosen-treatment.json", "story/intent.json", "story/chosen.json"]) {
    const p = path.join(r, f), j = rjson(p);
    if (j) return { digest: canonicalDigest(j), via: f };
    if (has(p)) return { digest: fileDigest(p), via: f };
  }
  return null;
}
export function lookDigest(run) {
  const r = path.resolve(String(run));
  const bible = rjson(path.join(r, "look", "visual-bible.json"));
  if (bible && bible.source && bible.source.source_digest) return { digest: bible.source.source_digest, via: "look/visual-bible.json", revision: num(bible.revision) };
  for (const f of ["look/DESIGN.md", "look/frame.md"]) { const d = fileDigest(path.join(r, f)); if (d) return { digest: d, via: f }; }
  const d = rjson(path.join(r, "decisions.json")) || {};
  if (d.look && typeof d.look === "object") return { digest: canonicalDigest(d.look), via: "decisions.look" };
  return null;
}

// mode "sketch": exploratory, cheap, labelled, needs only a committed Story. mode "full": needs the Story AND the Look, approved or EXPLICITLY inherited
// (o.inherit = { story?: {reason, source}, look?: {reason, source} }, e.g. a saved series' look), and rejects inputs that moved since they were pinned.
export function boundary(run, { mode = "full", inherit = {} } = {}) {
  const r = path.resolve(String(run));
  const problems = [], stale = [];
  const story = storyDigest(r), look = lookDigest(r);
  const inh = isObj(inherit) ? inherit : {};
  const committed = [...(story ? ["story"] : []), ...(look && lookCommitted(r).committed ? ["look"] : [])];
  const approvals = rjson(path.join(r, "approvals.json"));
  const recs = arr(Array.isArray(approvals) ? approvals : approvals && approvals.records);
  const approvedDigest = (st) => { const x = recs.filter((q) => q && q.stage === st).sort((a, b) => (b.revision || 0) - (a.revision || 0))[0]; return x ? x.artifact_digest : null; };
  if (mode === "sketch") {
    if (!story) problems.push("a sketch still starts from a chosen Story (story/chosen.json or story/intent.json)");
    return { ok: !problems.length, mode, kind: "sketch", label: "Exploratory sketch: rough, not the storyboard; no panel set here is approved or scheduled for build", schedulable: false, problems, inputs: { story, look } };
  }
  for (const st of ["story", "look"]) {
    const now = st === "story" ? story : look;
    if (!now) { if (!inh[st]) problems.push(`the ${st} is not committed: a full storyboard waits for the approved ${st} (or an explicit inherit.${st} with a reason)`); continue; }
    const ap = approvedDigest(st);
    if (ap && ap !== now.digest && !inh[st]) { stale.push(st); problems.push(`the ${st} changed since it was approved (approved digest ${String(ap).slice(0, 10)}, now ${String(now.digest).slice(0, 10)}): approve the current ${st} or inherit it explicitly`); }
    if (inh[st] && !T(inh[st].reason)) problems.push(`inherit.${st} needs a reason (where it comes from and why it still holds)`);
  }
  const pinned = rjson(SB(r, "inputs.json"));
  if (pinned) for (const st of ["story", "look"]) {
    const now = st === "story" ? story : look;
    if (now && pinned[st] && pinned[st].digest !== now.digest) { if (!stale.includes(st)) stale.push(st); problems.push(`stale input: the ${st} the storyboard was scheduled from (${String(pinned[st].digest).slice(0, 10)}) is not the current ${st} (${String(now.digest).slice(0, 10)}); the old panel set is labelled old, not current`); }
  }
  const missing = missingPrerequisites("storyboard", ["brief", ...committed, ...Object.keys(inh).filter((k) => inh[k])]).filter((s) => s !== "brief");
  if (missing.length && !problems.length) problems.push(`not committed: ${missing.join(", ")}`);
  return { ok: !problems.length, mode: "full", kind: "full", schedulable: !problems.length, problems, stale, inputs: { story, look }, inherited: Object.fromEntries(Object.entries(inh).filter(([, v]) => v)) };
}
export function pinInputs(run, { inherit = {} } = {}) {
  const b = boundary(run, { mode: "full", inherit });
  if (!b.ok) return { ok: false, ...b };
  const rec = { schema_version: SCHEMA_VERSION, story: b.inputs.story, look: b.inputs.look, inherited: b.inherited };
  writeJson(SB(run, "inputs.json"), rec);
  return { ok: true, pinned: rec };
}
// a panel set built from an older Story or Look is OLD: still viewable, labelled, rejected as current output
export function panelSetCurrent(doc, run) {
  const pin = doc && doc.inputs, story = storyDigest(run), look = lookDigest(run);
  if (!pin) return { current: true, legacy: true, reason: "no pinned inputs (an older run)" };
  const moved = [["story", story], ["look", look]].filter(([k, now]) => now && pin[k] && pin[k].digest !== now.digest).map(([k]) => k);
  return moved.length ? { current: false, moved, reason: `built from an earlier ${moved.join(" and ")}` } : { current: true };
}
export function labelOld(doc, reason = "built from an earlier Story or Look") {
  return { ...doc, status: "old", label: `Old: ${reason}. Shown for reference, not current output.`, shots: arr(doc && doc.shots).map((s) => ({ ...s, panels: arr(s.panels).map((p) => ({ ...p, status: "old" })) })) };
}

// ---- E2: shot and panel records ------------------------------------------------------------------------------------------------------------
export const TIMING_STATUS = ["provisional", "reconciled", "approved"];
const LEGACY_RELATION = [[/\b(but|however|yet|instead|unlike)\b/i, "contrast"], [/\b(because|so|therefore|which is why|cause)\b/i, "cause"], [/\b(for example|e\.g\.|another|also|example|and)\b/i, "example"], [/\b(meanwhile|elsewhere|separate|new chapter)\b/i, "separation"], [/\b(zoom|scale|closer|wider|out to|in to)\b/i, "scale"], [/\b(then|next|continu\w*|keeps? going|same)\b/i, "continuation"]];
export const relationOf = (text) => { const t = T(text); if (CUT_RELATIONS.includes(t)) return t; const hit = LEGACY_RELATION.find(([re]) => re.test(t)); return hit ? hit[1] : null; };

export function normalizeShot(raw = {}) {
  const s = isObj(raw) ? raw : {};
  const panels = arr(s.panels).map((p, i) => {
    const q = isObj(p) ? p : {};
    return { id: T(q.id || q.panel_id) || `p${i + 1}`, state: T(q.state), image_ref: q.image_ref ?? null, ...(q.weight != null ? { weight: q.weight } : {}), ...(q.source_digest ? { source_digest: q.source_digest } : {}), ...(q.image_digest ? { image_digest: q.image_digest } : {}), status: q.status || "current" };
  });
  const t = isObj(s.timing) ? s.timing : {};
  const tr = isObj(s.transition_out) ? s.transition_out : {};
  const si = isObj(s.sound_intent) ? s.sound_intent : {};
  return {
    ...s,
    shot_id: T(s.shot_id), beat_id: T(s.beat_id), purpose: T(s.purpose),
    panels: panels.length ? panels : [{ id: "p1", state: "", image_ref: null, status: "current" }], // 1..n: one panel explains a static beat; never a mechanical 3
    copy_refs: arr(s.copy_refs).map(String),
    focal_read: Array.isArray(s.focal_read) ? s.focal_read : T(s.focal_read),
    timing: { status: TIMING_STATUS.includes(t.status) ? t.status : "provisional", duration_s: num(t.duration_s), ...(t.min_s != null ? { min_s: t.min_s } : {}), ...(t.score_revision ? { score_revision: t.score_revision } : {}), ...(t.start_s != null ? { start_s: t.start_s, end_s: t.end_s } : {}) },
    transition_out: { relation: tr.relation ?? null, kind: T(tr.kind) || "cut", carrier: tr.carrier ?? null, ...(tr.cause_ref ? { cause_ref: tr.cause_ref } : {}), ...(tr.continuity_ref ? { continuity_ref: tr.continuity_ref } : {}) },
    sound_intent: { role: T(si.role) || "supportive", cue_refs: arr(si.cue_refs).map(String) },
  };
}
export function validateShot(shot, ctx = {}) {
  const p = [], w = [];
  const s = normalizeShot(shot);
  if (!s.shot_id) p.push("shot_id is required");
  if (!s.beat_id) p.push(`${s.shot_id || "shot"}: beat_id is required (a shot binds to a story beat)`);
  else if (arr(ctx.beat_ids).length && !ctx.beat_ids.includes(s.beat_id)) p.push(`${s.shot_id}: beat_id ${s.beat_id} is not a beat of the chosen story`);
  if (!s.purpose) w.push(`${s.shot_id}: no purpose`);
  const ids = s.panels.map((x) => x.id);
  if (new Set(ids).size !== ids.length) p.push(`${s.shot_id}: panel ids must be unique`);
  if (s.panels.length > 12) w.push(`${s.shot_id}: ${s.panels.length} panels; a shot with this many probably wants to be several shots`);
  if (s.timing.duration_s != null && !(s.timing.duration_s > 0)) p.push(`${s.shot_id}: timing.duration_s must be positive seconds`);
  if (s.transition_out.relation != null && !CUT_RELATIONS.includes(s.transition_out.relation)) p.push(`${s.shot_id}: transition_out.relation must be one of ${CUT_RELATIONS.join(", ")}`);
  return { ok: !p.length, problems: p, warnings: w };
}
export function toContractShape(doc) {
  const by = new Map();
  for (const s of arr(doc && doc.shots)) { const k = s.beat_id || "beat-?"; (by.get(k) || by.set(k, []).get(k)).push({ id: s.shot_id, panels: arr(s.panels).map((p) => ({ id: p.id })) }); }
  return { schema_version: SCHEMA_VERSION, timing_source: doc && doc.timing_source || "estimate", beats: [...by].map(([id, shots]) => ({ id, shots })) };
}
export function validateStoryboardDoc(doc, ctx = {}) {
  const problems = [], warnings = [];
  if (!isObj(doc)) return { ok: false, problems: ["not an object"], warnings };
  const seen = new Set();
  for (const s of arr(doc.shots)) {
    const v = validateShot(s, ctx);
    problems.push(...v.problems); warnings.push(...v.warnings);
    if (seen.has(s.shot_id)) problems.push(`duplicate shot_id ${s.shot_id}`);
    seen.add(s.shot_id);
  }
  if (!arr(doc.shots).length) problems.push("no shots");
  // panel ids are only unique inside a shot, but the contract keys them film-wide: namespace them for its validator
  const cs = toContractShape({ ...doc, shots: arr(doc.shots).map((s) => ({ ...s, panels: arr(s.panels).map((p) => ({ id: `${s.shot_id}/${p.id}` })) })) });
  const c = validateStoryboard(cs);
  for (const x of c.problems) if (!/duplicate id/.test(x) || !problems.some((q) => /duplicate/.test(q))) problems.push(x);
  if (doc.kind === "sketch" && doc.schedulable) problems.push("a sketch is never schedulable for build");
  return { ok: !problems.length, problems, warnings };
}

// ---- adopting what already exists ---------------------------------------------------------------------------------------------------------
// frames/shots.json (one board per beat) -> shot records. The code representation (html, reused assets, type) stays with the shot; the PNG is a
// panel image. o = { run, beatIds, durations: {<id>: s}, score, copyOf }
export function fromLegacyShots(doc, { run = null, beatIds = [], durations = {}, score = null, kind = "full" } = {}) {
  const shots = arr(doc && doc.shots);
  const seams = arr(score && score.seams);
  const out = shots.map((raw, i) => {
    const id = T(raw.id) || String(i + 1).padStart(2, "0");
    const html = `frames/${id}.html`, png = raw.image_ref || `frames/${id}.png`;
    const abs = (f) => (run ? path.join(path.resolve(String(run)), f) : null);
    const type = arr(raw.type).filter((t) => isObj(t) && T(t.text));
    const copy = type.map((t, k) => ({ id: `${id}-t${k + 1}`, text: T(t.text), size_pct: num(t.pct ?? t.h_pct ?? t.h), ...(t.readable === false ? { seen_before: true } : {}) }));
    const sm = seams[i];
    const dur = num(durations[id] ?? durations[i + 1] ?? raw.duration ?? (score && arr(score.scenes)[i] && score.scenes[i].duration));
    const srcDigest = (abs(html) && fileDigest(abs(html))) || canonicalDigest(raw);
    return normalizeShot({
      shot_id: `shot-${id}`, beat_id: arr(beatIds)[i] || T(raw.beat_id) || `beat-${id}`, purpose: T(raw.purpose || raw.beat),
      panels: arr(raw.panels).length ? raw.panels : [{ id: "p1", state: T(raw.hero) || T(raw.beat), image_ref: png, source_digest: srcDigest, ...(abs(png) && fileDigest(abs(png)) ? { image_digest: fileDigest(abs(png)) } : {}) }],
      copy_refs: arr(raw.copy_refs).length ? raw.copy_refs : copy.map((c) => c.id),
      focal_read: raw.focal_read || T(raw.hero),
      timing: { status: "provisional", duration_s: dur },
      transition_out: sm ? { relation: relationOf(sm.relation) || relationOf(sm.why), kind: sm.kind, carrier: sm.element || null, ...(sm.cause_ref ? { cause_ref: sm.cause_ref } : {}) } : raw.transition_out,
      sound_intent: raw.sound_intent,
      copy, // inline copy for the reading-time check
      editable: { html_ref: html, reused_assets: arr(raw.assets || raw.reused_assets), elements: arr(raw.elements), legacy: { size: raw.size, kind: raw.kind, angle: raw.angle, focus: raw.focus, light: raw.light, ground: raw.ground, crop: raw.crop, device: raw.device, hero_pct: raw.hero_pct } },
      demonstrates: raw.kind === "ui-demo" || raw.demonstrates === true || undefined,
      editorial: raw.editorial,
    });
  });
  return { schema_version: SCHEMA_VERSION, kind, legacy_adopted: true, source: "frames/shots.json", timing_source: "estimate", frame_rate: rate(score && (score.frame_rate || score.fps) || 30), shots: out };
}
// the console's animatic step ({scenes:[{id,title,line,visual,duration,thumb}], audio|music, video}) -> shot records (one panel per scene)
export function fromLegacyAnimatic(step, { kind = "full" } = {}) {
  const st = isObj(step) ? step : {};
  const shots = arr(st.scenes).map((sc, i) => normalizeShot({
    shot_id: `shot-${T(sc.id) || i + 1}`, beat_id: T(sc.beat_id) || `beat-${T(sc.id) || i + 1}`, purpose: T(sc.title || sc.line),
    panels: [{ id: "p1", state: T(sc.visual || sc.title), image_ref: sc.thumb ?? null }], focal_read: T(sc.hero || sc.title),
    timing: { status: st.video ? "approved" : "provisional", duration_s: num(sc.duration) }, copy: sc.line ? [{ id: `scene-${T(sc.id) || i + 1}-line`, text: T(sc.line) }] : [],
  }));
  return { schema_version: SCHEMA_VERSION, kind, legacy_adopted: true, source: "console animatic step", timing_source: st.voice && st.voice.name ? "voiceover" : st.music && st.music.file ? "music" : "estimate", playback: { video: st.video || null, audio: st.audio || (st.music && st.music.file) || null }, shots };
}

// ---- storage, revisions, restart ----------------------------------------------------------------------------------------------------------
export function readStoryboard(run) { return rjson(SB(run, "storyboard.json")); }
// a changed board gets revision+1; the previous panel set is kept under revisions/ labelled old
export function writeStoryboard(run, doc) {
  const prev = readStoryboard(run);
  const body = { ...doc };
  delete body.revision; delete body.digest;
  const digest = canonicalDigest({ ...body, inputs: body.inputs || null });
  if (prev && prev.digest === digest) return { ok: true, unchanged: true, revision: prev.revision, digest };
  const revision = prev ? (num(prev.revision, 0) + 1) : 1;
  if (prev) writeJson(SB(run, "revisions", `rev-${prev.revision}.json`), labelOld(prev, `superseded by revision ${revision}`));
  const pin = rjson(SB(run, "inputs.json"));
  const next = { ...body, schema_version: SCHEMA_VERSION, revision, digest, status: "current", inputs: body.inputs || (pin ? { story: pin.story, look: pin.look } : undefined) };
  writeJson(SB(run, "storyboard.json"), next);
  return { ok: true, revision, digest, superseded: prev ? prev.revision : null };
}
// restart at Storyboard: Story and Look hold, the current panel set becomes old, build and final are stale (impact.mjs), nothing upstream is touched
export function restartAtStoryboard(run) {
  const prev = readStoryboard(run);
  if (prev) writeJson(SB(run, "revisions", `rev-${prev.revision}.json`), labelOld(prev, "restarted at the Storyboard"));
  const imp = impact("storyboard", arr(prev && prev.shots).map((s) => s.shot_id), { timing: true });
  return { ok: true, keeps: ["brief", "story", "look"], restarts: "storyboard", archived_revision: prev ? prev.revision : null, impact: imp, note: "the old panel set is labelled old; Story and Look approvals stay; the next storyboard gets the next revision" };
}

// ---- E7: the approval snapshot and the classification of change ----------------------------------------------------------------------------
// ONE central table. A meaningful change reopens the Storyboard review (or proposes a timing revision in the same surface); a harmless one does not.
export const CHANGE_CLASSES = Object.freeze({
  panel_regenerated_identical_source: { class: "harmless", reopens: false, why: "the same source drew the same panel again (a lost thumbnail, a re-render): no creative decision changed" },
  panel_source_changed: { class: "meaningful", reopens: true, why: "the panel's content changed" },
  shot_added: { class: "meaningful", reopens: true, why: "a new shot changes what the film shows" },
  shot_removed: { class: "meaningful", reopens: true, why: "a shot was removed" },
  demo_shot_changed: { class: "meaningful", reopens: true, why: "this changes a product demonstration: the proof the viewer sees" },
  shot_order_changed: { class: "meaningful", reopens: true, why: "the order of shots is the argument" },
  copy_changed: { class: "meaningful", reopens: true, why: "approved copy changed" },
  look_changed: { class: "meaningful", reopens: true, why: "the Look revision the panels were drawn in changed" },
  audio_changed: { class: "meaningful", reopens: true, route: "timing", why: "different audio can change the reading windows, the order or the meaning: propose the affected timing revision on this surface before the final build" },
  audio_kind_changed: { class: "meaningful", reopens: true, route: "timing", why: "scratch audio became real (or the reverse): final-voice timing was never approved by the scratch storyboard" },
  timing_revision_changed: { class: "meaningful", reopens: true, route: "timing", why: "the reconciled timing revision changed" },
  encode_only: { class: "harmless", reopens: false, why: "re-encoding or thumbnails only" },
});
export function makeSnapshot({ doc, score = null, copy = [], look = null, audio = null } = {}) {
  const shots = arr(doc && doc.shots);
  const aud = isObj(audio) ? audio : { kind: "none" };
  return {
    schema_version: SCHEMA_VERSION,
    storyboard_revision: num(doc && doc.revision),
    shots: shots.map((s) => s.shot_id),
    demo_shots: shots.filter((s) => s.demonstrates).map((s) => s.shot_id),
    panels: shots.flatMap((s) => arr(s.panels).map((p) => ({ shot_id: s.shot_id, panel_id: p.id, source_digest: p.source_digest || canonicalDigest({ state: p.state, image_ref: p.image_ref }), image_digest: p.image_digest || null }))),
    copy: arr(copy).map((c) => ({ id: c.id, digest: canonicalDigest(T(c.text)) })),
    look: look ? { revision: look.revision ?? null, digest: look.digest || null } : null,
    audio: { kind: ["selected", "scratch", "none"].includes(aud.kind) ? aud.kind : "none", scratch: aud.kind === "scratch", file: aud.file || null, digest: aud.digest || (aud.file ? canonicalDigest(aud.file) : null) },
    timing: { revision: score ? scoreRevision(score) : (doc && doc.timing_revision) || null, status: shots.length && shots.every((s) => s.timing && s.timing.status === "approved") ? "approved" : "provisional" },
  };
}
export function approveStoryboard({ doc, score = null, copy = [], look = null, audio = null, story = null, records = [], approved_by = "", source_action_id = null } = {}) {
  const snap = makeSnapshot({ doc, score, copy, look, audio });
  const r = approvalRecord({
    stage: "storyboard", artifact_ref: "storyboard/storyboard.json", artifact: snap, revision: nextRevision(records, "storyboard"), approved_by, source_action_id,
    depends_on: [{ stage: "story", revision: story && story.revision, digest: story && story.digest }, { stage: "look", revision: look && look.revision, digest: look && look.digest }],
  });
  if (!r.ok) return r;
  const scratch = snap.audio.scratch;
  return { ok: true, record: { ...r.record, snapshot: snap, scratch_audio: scratch || undefined, final_voice_approved: scratch ? false : snap.audio.kind === "selected" ? "this storyboard pins the selected audio; the Final is still reviewed" : null, final_audio_pending: scratch || undefined, silent_preview: snap.audio.kind === "none" || undefined } };
}
// compare two snapshots: -> { changes:[{kind, ids, class, reopens, why, route?}], reopen, harmless:[...] }
export function classifySnapshotChange(prev, next) {
  const changes = [];
  const add = (kind, ids = []) => changes.push({ kind, ids, ...CHANGE_CLASSES[kind] });
  if (!isObj(prev) || !isObj(next)) return { changes, reopen: false, harmless: [] };
  const ps = new Set(arr(prev.shots)), ns = new Set(arr(next.shots));
  const added = [...ns].filter((x) => !ps.has(x)), removed = [...ps].filter((x) => !ns.has(x));
  const demo = new Set([...arr(prev.demo_shots), ...arr(next.demo_shots)]);
  for (const id of added) add(demo.has(id) ? "demo_shot_changed" : "shot_added", [id]);
  for (const id of removed) add(demo.has(id) ? "demo_shot_changed" : "shot_removed", [id]);
  const common = arr(prev.shots).filter((x) => ns.has(x)), common2 = arr(next.shots).filter((x) => ps.has(x));
  if (JSON.stringify(common) !== JSON.stringify(common2)) add("shot_order_changed", common2);
  const pk = (p) => `${p.shot_id}/${p.panel_id}`;
  const before = new Map(arr(prev.panels).map((p) => [pk(p), p]));
  for (const p of arr(next.panels)) {
    const b = before.get(pk(p));
    if (!b) continue; // a new panel of an existing shot is a shot-level change only when its source differs; counted below via added/removed panels
    if (b.source_digest !== p.source_digest) add(demo.has(p.shot_id) ? "demo_shot_changed" : "panel_source_changed", [pk(p)]);
    else if (b.image_digest !== p.image_digest) add("panel_regenerated_identical_source", [pk(p)]);
  }
  const nb = new Set(arr(next.panels).map(pk));
  const panelAdded = arr(next.panels).filter((p) => !before.has(pk(p)) && ps.has(p.shot_id)).map(pk);
  const panelGone = [...before.keys()].filter((k) => !nb.has(k) && ns.has(k.split("/")[0]));
  if (panelAdded.length || panelGone.length) add("panel_source_changed", [...panelAdded, ...panelGone]);
  const cb = new Map(arr(prev.copy).map((c) => [c.id, c.digest]));
  const copyMoved = arr(next.copy).filter((c) => cb.get(c.id) !== c.digest).map((c) => c.id).concat([...cb.keys()].filter((k) => !arr(next.copy).some((c) => c.id === k)));
  if (copyMoved.length) add("copy_changed", copyMoved);
  if (JSON.stringify(prev.look) !== JSON.stringify(next.look)) add("look_changed");
  if (prev.audio && next.audio) {
    if (prev.audio.kind !== next.audio.kind) add("audio_kind_changed");
    else if (prev.audio.digest !== next.audio.digest) add("audio_changed");
  }
  if (prev.timing && next.timing && prev.timing.revision !== next.timing.revision) add("timing_revision_changed");
  const reopen = changes.some((c) => c.reopens);
  return { changes, reopen, harmless: changes.filter((c) => !c.reopens).map((c) => c.kind), reasons: changes.filter((c) => c.reopens).map((c) => c.why) };
}
export function snapshotCurrent(record, nowSnapshot) {
  const c = classifySnapshotChange(record && record.snapshot, nowSnapshot);
  return { current: !c.reopen, reopen: c.reopen, changes: c.changes, note: c.reopen ? "the approved snapshot no longer matches: review the changes on the Storyboard surface" : c.changes.length ? "only harmless regeneration: the approval stands" : "unchanged" };
}
// real audio replaced the scratch (or another track replaced it): compute the impact, never silently retime
export function audioReplacementImpact({ doc, before = null, after = null, copy = [], pad_s, locale = "en", display = "desktop" } = {}) {
  const shots = arr(doc && doc.shots);
  const rec = reconcile({ shots, audio: after || {}, pad_s, copy: arr(copy).length ? copy : shots.flatMap((s) => arr(s.copy)), locale, display });
  const ids = rec.deltas.map((d) => d.shot_id);
  const reading = shots.map((s) => ({ shot_id: s.shot_id, ...checkReading(s, arr(copy).length ? copy : arr(s.copy), { locale, display }) })).filter((x) => x.ok === false);
  const imp = ids.length ? impact("storyboard", ids, { timing: true }) : impact("storyboard", [], {});
  return { kind: "audio_replacement", from: before && before.kind || null, to: after && after.kind || null, silent_retime: false, deltas: rec.deltas, protected: rec.protected, reading_conflicts: reading, impact: imp, propose_in: "Storyboard (same surface, before the final build)", audio_contract: "audio/contract.json (Plan 07; storyboard/audio.json still reads); no second audio timeline" };
}

// ---- the snapshot, read from a run (console approve on the animatic step and `storyboard.mjs snapshot` share this) -------------------------------------
// -> { ok, record } after appending to storyboard/approvals.json; check:true only compares the last approval with what is on disk now
export function snapshotRun(run, { approved_by = "user", source_action_id = null, check = false } = {}) {
  const r = path.resolve(String(run));
  const doc = readStoryboard(r);
  if (!doc) return { ok: false, error: "no storyboard/storyboard.json (storyboard.mjs adopt first)" };
  const score = rjson(path.join(r, "motion", "score.json"));
  const look = lookDigest(r), story = storyDigest(r);
  // Plan 07: audio/contract.json is the audio contract (flat Plan 05 fields included); the old storyboard/audio.json still reads, byte-for-byte as before
  const contract = readAudioContract(r);
  const audio = contract.source === "audio/contract.json" ? contractForStoryboard(contract) : rjson(SB(r, "audio.json")) || { kind: "none" };
  const copy = arr(doc.shots).flatMap((s) => arr(s.copy));
  const parts = { doc, score, copy, look: look && { revision: look.revision ?? null, digest: look.digest }, audio, story: story && { revision: null, digest: story.digest } };
  const f = SB(r, "approvals.json");
  const store = rjson(f) || { schema_version: SCHEMA_VERSION, records: [] };
  if (check) {
    const last = store.records[store.records.length - 1];
    return last ? { ok: true, ...snapshotCurrent(last, makeSnapshot(parts)) } : { ok: false, error: "no approved snapshot yet" };
  }
  const cur = panelSetCurrent(doc, r);
  if (!cur.current) return { ok: false, error: `this panel set is old (${cur.reason}): rebuild before approving` };
  const a = approveStoryboard({ ...parts, records: store.records, approved_by, source_action_id });
  if (!a.ok) return a;
  store.records.push(a.record);
  writeJson(f, store);
  return { ok: true, record: a.record, file: "storyboard/approvals.json" };
}

// ---- "Just make it" ------------------------------------------------------------------------------------------------------------------------
export function autoDecision({ approval_mode = "autonomous", decided_by = "claude", boundary: b = null, note = "" } = {}) {
  return { schema_version: SCHEMA_VERSION, stage: "storyboard", decided_by, decision: "auto", policy: approval_mode, reason: T(note) || "Just make it: Claude decided the Storyboard under the run's existing policy", inputs: b && b.inputs ? { story: b.inputs.story && b.inputs.story.digest, look: b.inputs.look && b.inputs.look.digest } : null, final_review_retained: true, at: new Date().toISOString() };
}
export function recordAutoDecision(run, rec) {
  const f = SB(run, "decision.json");
  const log = rjson(f) || { schema_version: SCHEMA_VERSION, decisions: [] };
  log.decisions.push(rec);
  writeJson(f, log);
  return { ok: true, file: "storyboard/decision.json", decisions: log.decisions.length };
}

// ---- E6: the cheap deterministic animatic ---------------------------------------------------------------------------------------------------
// From board panels + essential spatial changes + audio + transition annotations. Honest about fidelity: it is a timed reading aid, never "the film".
export function animaticPlan(doc, { audio = null, frame_rate = null, revision = null } = {}) {
  const shots = arr(doc && doc.shots);
  const r = rate(frame_rate || (doc && doc.frame_rate) || 30);
  const rev = revision ?? (doc && doc.revision) ?? null;
  const shotL = layout(shots.map((s) => num(s.timing && s.timing.duration_s, 0)), r);
  const segments = [], annotations = [];
  shots.forEach((s, i) => {
    const iv = shotL[i];
    const P = arr(s.panels);
    const w = P.map((p) => Math.max(1e-6, num(p.weight, 1))), total = w.reduce((a, b) => a + b, 0);
    let cum = 0, prev = iv.start_tick;
    P.forEach((p, j) => {
      cum += w[j];
      const end = j === P.length - 1 ? iv.end_tick : iv.start_tick + Math.round((cum / total) * (iv.end_tick - iv.start_tick)); // each boundary rounded once
      const spatial = arr(s.spatial).filter((x) => isObj(x) && (num(x.panel_index, 0) === j || x.panel_id === p.id) && ["zoom", "pan"].includes(x.kind));
      segments.push({ shot_id: s.shot_id, panel_id: p.id, image_ref: p.image_ref ?? null, state: p.state || "", start_s: fromTicks(prev), end_s: fromTicks(end), interval: "[start, end)", spatial: spatial.map((x) => ({ kind: x.kind, from: x.from ?? null, to: x.to ?? null, essential: true })), shot_index: i, status: p.status || "current" });
      prev = end;
    });
    if (i < shots.length - 1) {
      const t = s.transition_out || {};
      annotations.push({ at_s: fromTicks(iv.end_tick), shot_id: s.shot_id, relation: t.relation ?? null, kind: t.kind || "cut", carrier: t.carrier ?? null, text: `${t.kind || "cut"}${t.relation ? ` (${t.relation})` : ""}` });
    }
  });
  const a = isObj(audio) ? audio : { kind: "none" };
  const kind = ["selected", "scratch", "none"].includes(a.kind) ? a.kind : "none";
  const audioLabel = kind === "scratch" ? "scratch audio (placeholder: not the final voice or music)" : kind === "selected" ? "the selected audio" : "silent preview";
  const spatial = segments.some((x) => x.spatial.length);
  const old = (doc && doc.status === "old") || segments.some((x) => x.status === "old");
  const total = shotL.length ? shotL[shotL.length - 1].end_s : 0;
  return {
    schema_version: SCHEMA_VERSION, storyboard_revision: rev, timing_revision: (doc && doc.timing_revision) || null, timing_status: shots.every((s) => s.timing && s.timing.status === "approved") ? "approved" : "provisional",
    frame_rate: { num: r.num, den: r.den }, convention: "film time, start-inclusive end-exclusive", total_s: total, segments, annotations,
    audio: { kind, label: audioLabel, file: a.file || null, scratch: kind === "scratch" },
    fidelity: { level: spatial ? "timed_panels_spatial" : "timed_panels", animated: false, label: `Timed storyboard panels${spatial ? " with the essential camera moves" : ""}, ${audioLabel}. A reading aid for pace and order, not the finished film.` },
    ...(old ? { old: true, label: "Old panel set: reference only" } : {}),
  };
}
// a viewer's note lands on a shot, a panel, a time and the revision they watched
export function anchorAt(plan, t) {
  const k = toTicks(t);
  const seg = arr(plan && plan.segments).find((s) => k >= toTicks(s.start_s) && k < toTicks(s.end_s));
  return seg ? { shot_id: seg.shot_id, panel_id: seg.panel_id, t: Number(t), revision: plan.storyboard_revision } : null;
}
// the console's animatic step stays the same shape (scenes[{id,title,line,visual,duration,thumb}], audio, video); the extras ride along
export function animaticPayload(plan, doc) {
  const shots = arr(doc && doc.shots);
  return {
    scenes: shots.map((s) => ({ id: s.shot_id, title: s.purpose, line: arr(s.copy).map((c) => c.text).join(" / ") || undefined, visual: arr(s.panels).map((p) => p.state).filter(Boolean).join(" -> "), duration: s.timing && s.timing.duration_s, thumb: arr(s.panels)[0] && s.panels[0].image_ref, panels: arr(s.panels).map((p) => ({ id: p.id, state: p.state, image_ref: p.image_ref })) })),
    audio: plan.audio.file || undefined, fidelity: plan.fidelity.label, fidelity_level: plan.fidelity.level, audio_kind: plan.audio.kind, storyboard_revision: plan.storyboard_revision, timing_revision: plan.timing_revision, timing_status: plan.timing_status,
  };
}
// Builds playback with ffmpeg only when called (the CLI's --render). Each panel is a clip of exactly the frames its [start, end) covers.
export function renderAnimatic(plan, outFile, { run = ".", width = 1280, height = 720 } = {}) {
  const r = plan.frame_rate, F = `${r.num}/${r.den}`;
  const dir = path.join(path.resolve(String(run)), "storyboard", "animatic-tmp");
  fs.mkdirSync(dir, { recursive: true });
  const clips = [];
  const fit = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x101014`;
  const cf = (t) => Math.ceil((toTicks(t) * r.num) / (r.den * 1e6) - 1e-9);
  plan.segments.forEach((s, i) => {
    const n = Math.max(1, cf(s.end_s) - cf(s.start_s));
    const img = s.image_ref ? path.resolve(String(run), s.image_ref) : null;
    const clip = path.join(dir, `c${String(i).padStart(3, "0")}.mp4`);
    const z = s.spatial.find((x) => x.kind === "zoom"), pn = s.spatial.find((x) => x.kind === "pan");
    const vf = !img || !has(img) ? null : z ? `${fit},zoompan=z='1+0.12*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${width}x${height}:fps=${F}` : pn ? `${fit},zoompan=z=1.12:x='(iw-iw/zoom)*on/${n}':y='ih/2-(ih/zoom/2)':d=${n}:s=${width}x${height}:fps=${F}` : `${fit},fps=${F}`;
    const args = img && has(img)
      ? ["-y", "-loop", "1", "-i", img, "-vf", vf, "-frames:v", String(n), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", F, clip]
      : ["-y", "-f", "lavfi", "-i", `color=c=0x1c1c22:s=${width}x${height}:r=${F}`, "-frames:v", String(n), "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]; // a missing panel image is a visible grey frame, never a silent skip
    const res = spawnSync("ffmpeg", ["-v", "error", ...args], { encoding: "utf8" });
    if (res.status !== 0) return clips.push(null);
    clips.push(clip);
  });
  if (clips.some((c) => !c)) return { ok: false, error: "ffmpeg could not build every panel clip (is ffmpeg installed?)" };
  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const aud = plan.audio.file && has(path.resolve(String(run), plan.audio.file)) ? path.resolve(String(run), plan.audio.file) : null;
  const args = ["-y", "-f", "concat", "-safe", "0", "-i", list, ...(aud ? ["-i", aud, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-shortest"] : []), "-c:v", "copy", outFile];
  const res = spawnSync("ffmpeg", ["-v", "error", ...args], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return res.status === 0 ? { ok: true, file: outFile, fidelity: plan.fidelity.label, audio: plan.audio.label } : { ok: false, error: String(res.stderr || "ffmpeg failed").slice(0, 300) };
}
