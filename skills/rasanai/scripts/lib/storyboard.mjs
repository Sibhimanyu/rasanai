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
//   W05 temporal storyboard (additive; creative_policy_revision 1 boards carry none of these fields and behave exactly as before):
//   normalizeReads(reads, score) -> { intervals, errors } / staleReads(doc, score) / readsDigest(shot) / temporalNotes(shot)
//   shot extras (all optional, kept inside the shot record): reads[], bindings{initial,action,consequence}, camera_intent, composition, transition_out.cut_function, sound_intent.relation
//   see references/temporal-storyboard.md; the judging heuristics (read windows, cause before reaction, sameness) live in editorial.mjs evaluateTemporal
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { approvalRecord, canonicalDigest, nextRevision, validateStoryboard, SCHEMA_VERSION } from "./contracts.mjs";
import { impact } from "./impact.mjs";
import { mediumContractDigest } from "./medium-contract.mjs"; // Part 2: the Look pin includes the chosen medium contract (see lookDigest)
import { contractForStoryboard, readAudioContract } from "./audio-direction.mjs";
import { logicalStage, missingPrerequisites } from "./stages.mjs";
import { lookCommitted, resolveStageConsent } from "./look.mjs";
import { CUT_RELATIONS, checkReading } from "./editorial.mjs";
import { layout, rate, reconcile, scoreRevision, scoreTiming, toTicks, fromTicks } from "./timing.mjs";
import { CREATIVE_ERROR_CODES } from "./creative-policy.mjs"; // W05: the real stable error codes (temporal reads reuse stale_input / temporal_evidence_missing)

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
  // Part 2: the chosen Look's medium contract (look/medium.json, copied by choose-system) is part of the Look's identity: its FULL content digest joins the pin, so a contract edited after the bible was
  // compiled still moves every job / artifact key. A legacy look has no such file and returns exactly what it did. `medium` is the digest the bible recorded (receipt only).
  const mf = rjson(path.join(r, "look", "medium.json"));
  const mdig = mf && mf.format === "medium-contract@1" ? mediumContractDigest(mf) : null;
  const wrap = (o) => (mdig ? { ...o, digest: canonicalDigest({ look: o.digest, medium_contract: mdig }), medium_contract: mdig } : o);
  if (bible && bible.source && bible.source.source_digest) return wrap({ digest: bible.source.source_digest, via: "look/visual-bible.json", revision: num(bible.revision), ...(bible.source.medium ? { medium: bible.source.medium } : {}) });
  for (const f of ["look/DESIGN.md", "look/frame.md"]) { const d = fileDigest(path.join(r, f)); if (d) return wrap({ digest: d, via: f }); }
  const d = rjson(path.join(r, "decisions.json")) || {};
  if (d.look && typeof d.look === "object") return wrap({ digest: canonicalDigest(d.look), via: "decisions.look" });
  return null;
}

// mode "sketch": exploratory, cheap, labelled, needs only a committed Story. mode "full": needs the Story AND the Look, approved or EXPLICITLY inherited
// (o.inherit = { story?: {reason, source}, look?: {reason, source} }, e.g. a saved series' look), and rejects inputs that moved since they were pinned.
export function boundary(run, { mode = "full", inherit = {}, requireConsent = false, consent = null } = {}) {
  const r = path.resolve(String(run));
  const problems = [], stale = [];
  const story = storyDigest(r), look = lookDigest(r);
  const inh = isObj(inherit) ? inherit : {};
  // strict (requireConsent, creative_policy_revision 1): a prepared story or look is not a decision; each needs a consumed user choice, an approval record or a consumed
  // delegation (resolveStageConsent), and an inherit note counts only with the source_action_id of a consumed action. consent = { story, look } contexts, else read from the run.
  const cons = {};
  if (requireConsent && mode !== "sketch") for (const st of ["story", "look"]) cons[st] = resolveStageConsent({ ...(consent && consent[st] || stageConsentContext(r, st)), stage: st });
  const committed = requireConsent ? ["story", "look"].filter((st) => (st === "story" ? story : look) && cons[st] && cons[st].confirmed) : [...(story ? ["story"] : []), ...(look && lookCommitted(r).committed ? ["look"] : [])];
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
    if (requireConsent) {
      const c = cons[st], ih = inh[st];
      const ctx = (consent && consent[st]) || stageConsentContext(r, st);
      const inheritedOk = ih && ih.source_action_id && arr(ctx.appliedActions).some((a) => a && a.id === ih.source_action_id && ["choose", "approve", "submit", "decide", "decide-rest"].includes(a.type) && [st, st === "story" || st === "look" ? st : "animatic", "*"].includes(a.step));
      if (ih && !inheritedOk) problems.push(`inherit.${st} is not evidence of the user's decision: it needs the source_action_id of a consumed action (a note written by an agent is not delegation)`);
      else if (!ih && !c.confirmed) { if (c.stale) stale.push(st); problems.push(`the ${st} is prepared but not approved: ${c.reason}`); }
    }
    const ap = approvedDigest(st);
    if (ap && ap !== now.digest && !inh[st]) { stale.push(st); problems.push(`the ${st} changed since it was approved (approved digest ${String(ap).slice(0, 10)}, now ${String(now.digest).slice(0, 10)}): approve the current ${st} or inherit it explicitly`); }
    if (inh[st] && !T(inh[st].reason)) problems.push(`inherit.${st} needs a reason (where it comes from and why it still holds)`);
  }
  const pinned = rjson(SB(r, "inputs.json"));
  if (pinned) for (const st of ["story", "look"]) {
    const now = st === "story" ? story : look;
    if (now && pinned[st] && pinned[st].digest !== now.digest) { if (!stale.includes(st)) stale.push(st); problems.push(`stale input: the ${st} the storyboard was scheduled from (${String(pinned[st].digest).slice(0, 10)}) is not the current ${st} (${String(now.digest).slice(0, 10)}); the old panel set is labelled old, not current`); }
  }
  const inheritedStages = Object.keys(inh).filter((k) => inh[k] && (!requireConsent || problems.every((p) => !p.startsWith(`inherit.${k}`))));
  const missing = missingPrerequisites("storyboard", ["brief", ...committed, ...inheritedStages]).filter((s) => s !== "brief");
  if (missing.length && !problems.length) problems.push(`not committed: ${missing.join(", ")}`);
  return { ok: !problems.length, mode: "full", kind: "full", schedulable: !problems.length, problems, stale, inputs: { story, look }, inherited: Object.fromEntries(Object.entries(inh).filter(([, v]) => v)) };
}
// Strict-mode inputs for resolveStageConsent, read-only from the run: session.json, the actions the transport consumed (consumed.json minus rejected.json, so a raw or
// unprocessed line is excluded), approval records, the delegations among those actions. Writes nothing and consumes nothing. stage: "story" | "look" | "storyboard".
export function stageConsentContext(run, stage) {
  const r = path.resolve(String(run));
  const done = new Set(arr(rjson(path.join(r, "consumed.json")))), bad = new Set(arr(rjson(path.join(r, "rejected.json"))).map((x) => x && x.id));
  let lines = [];
  try { lines = fs.readFileSync(path.join(r, "actions.jsonl"), "utf8").split("\n"); } catch {}
  const appliedActions = [];
  for (const l of lines) {
    let a = null; try { a = l.trim() ? JSON.parse(l) : null; } catch {}
    if (a && typeof a.id === "string" && done.has(a.id) && !bad.has(a.id)) appliedActions.push({ id: a.id, step: a.step, type: a.type, value: a.value ?? null, ts: a.ts || null, source: a.source || null });
  }
  const recs = (f) => { const j = rjson(f); return arr(Array.isArray(j) ? j : j && j.records); };
  const approvals = [...recs(path.join(r, "approvals.json")), ...recs(SB(r, "approvals.json"))];
  const explicitDelegations = appliedActions.filter((a) => ["decide", "decide-rest"].includes(a.type)).map((a) => ({ source_action_id: a.id }));
  const ctx = { session: rjson(path.join(r, "session.json")), appliedActions, approvals, explicitDelegations, expectedDigest: null, selectedId: null, isCurrent: null };
  if (stage === "story" || stage === "look") {
    const d = stage === "story" ? storyDigest(r) : lookDigest(r);
    ctx.expectedDigest = d ? d.digest : null;
    const ch = stage === "story" ? rjson(path.join(r, "story", "chosen.json")) : null;
    // the chosen file is written by the Director and has no fixed id field: every name the pick could carry is a candidate (id, story_id, label, key, name)
    if (isObj(ch)) {
      const ids = (o) => [o.id, o.story_id, o.label, o.key, o.name].filter((x) => x != null && x !== "").map(String);
      const c = ids(ch);
      // the pitch the chosen file came from may carry the id the user picked under another spelling (prefix / case): add that one entry's ids only
      const pj = rjson(path.join(r, "story", "pitches.json"));
      const pool = Array.isArray(pj) ? pj : isObj(pj) ? arr(pj.pitches || pj.stories || pj.options) : [];
      const low = c.map((x) => x.toLowerCase());
      for (const p of pool) if (isObj(p) && ids(p).some((x) => low.includes(x.toLowerCase()))) c.push(...ids(p));
      if (c.length) ctx.selectedId = [...new Set(c)];
    }
    if (stage === "look") {
      // the Look the user confirmed is the system label in decisions (choose-system writes look/ afterwards, so no mtimes); a series / direct pick is an object without an id and is skipped, not stale
      const dec = rjson(path.join(r, "decisions.json")), c = isObj(dec) ? [dec.design_system && dec.design_system.label, dec.look && dec.look.system].filter((x) => typeof x === "string" && x).map(String) : [];
      if (c.length) ctx.selectedId = [...new Set(c)];
    }
  } else {
    const c = snapshotRun(r, { check: true });
    if (c.ok) ctx.isCurrent = c.current;
  }
  return ctx;
}
export function pinInputs(run, { inherit = {}, requireConsent = false, consent = null } = {}) {
  const b = boundary(run, { mode: "full", inherit, requireConsent, consent });
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

// ---- W05: ordered audience reads, mapped onto the ONE score timeline ----------------------------------------------------------------------------
// A read = { id, event_id, what_to_notice, what_to_understand, source_interval: {start_s,end_s | beat_ref, timebase?, score_revision?}, attention_target,
// minimum_read_basis, competing_reads[], accessibility_dependency }. Reads are annotations on the existing score, never a second editable timeline:
// this function only RESOLVES them against `score` (motion/score.json shape: {scenes[{id,beat,duration}], frame_rate, duration?, revision?}) and reports.
// It is read-only, never changes a duration, never clamps, and keeps the source timebase and beat reference exactly as written.
// -> { intervals: [{id, event_id, start_s, end_s, start_tick, end_tick, timebase, beat_ref, score_revision, stale, resolved_from, attention_target,
//                   overlaps:[ids], ...}], errors: [{code, ref, kind, message}] }   (code is a CREATIVE_ERROR_CODES value)
export const READ_FIELDS = ["id", "event_id", "what_to_notice", "what_to_understand", "source_interval", "attention_target", "minimum_read_basis", "competing_reads", "accessibility_dependency"];
const rerr = (code, ref, kind, message) => ({ code, ref, kind, message });
function scoreFacts(score) {
  if (!isObj(score)) return null;
  const hasScenes = arr(score.scenes).length > 0;
  const timing = hasScenes ? scoreTiming(score) : null;
  const total = timing ? timing.total_s : num(score.duration_s ?? score.duration ?? score.total_s);
  const revision = score.revision != null ? String(score.revision) : hasScenes ? scoreRevision(score) : null;
  return { timing, total, revision };
}
export function normalizeReads(reads, score = null) {
  const intervals = [], errors = [];
  const facts = scoreFacts(score);
  const seen = new Set();
  arr(reads).forEach((raw, i) => {
    const r = isObj(raw) ? raw : {};
    const id = T(r.id) || `read-${i + 1}`;
    if (seen.has(id)) { errors.push(rerr(CREATIVE_ERROR_CODES.stale_input, id, "duplicate_id", `${id}: duplicate read id`)); return; }
    seen.add(id);
    const si = isObj(r.source_interval) ? r.source_interval : {};
    const timebase = T(si.timebase) || "score_s";
    const beatRef = si.beat_ref != null && si.beat_ref !== "" ? String(si.beat_ref) : null;
    const claimed = si.score_revision ?? r.score_revision ?? null;
    let start = num(si.start_s ?? si.start), end = num(si.end_s ?? si.end), from = "source_interval";
    // a beat reference alone resolves to that scene's score interval (read from the score, not invented)
    if ((start == null || end == null) && beatRef && facts && facts.timing) {
      const sc = facts.timing.scenes.find((x) => String(x.beat ?? x.id) === beatRef || String(x.id) === beatRef);
      if (sc) { start = sc.start_s; end = sc.end_s; from = "score.scenes"; }
    }
    if (start == null || end == null || timebase !== "score_s" && from === "source_interval") {
      errors.push(rerr(CREATIVE_ERROR_CODES.temporal_evidence_missing, id, "unresolved", `${id}: the read has no start/end the score can resolve (timebase ${timebase}${beatRef ? `, beat_ref ${beatRef}` : ""}); give score seconds or a beat_ref the score carries; a duration is never invented`));
      return;
    }
    if (end < start) { errors.push(rerr(CREATIVE_ERROR_CODES.temporal_evidence_missing, id, "reversed", `${id}: the read ends (${end}) before it begins (${start})`)); return; }
    const stale = claimed != null && facts && facts.revision != null && String(claimed) !== String(facts.revision);
    if (stale) errors.push(rerr(CREATIVE_ERROR_CODES.stale_input, id, "stale", `${id}: the read was mapped on score revision ${claimed}, the score is now ${facts.revision}; its window is kept as written and marked stale, not re-timed`));
    else if (facts && facts.total != null && (start < 0 || end > facts.total + 1e-6)) errors.push(rerr(CREATIVE_ERROR_CODES.stale_input, id, "out_of_bounds", `${id}: the window [${start}, ${end}) is outside the score (0..${facts.total} s)`));
    else if (!facts) errors.push(rerr(CREATIVE_ERROR_CODES.temporal_evidence_missing, id, "no_score", `${id}: no score to resolve against yet; the window stays unverified`));
    intervals.push({
      id, event_id: T(r.event_id) || null, start_s: fromTicks(toTicks(start)), end_s: fromTicks(toTicks(end)), start_tick: toTicks(start), end_tick: toTicks(end),
      convention: "start-inclusive, end-exclusive; score time", timebase, beat_ref: beatRef, score_revision: claimed ?? (facts ? facts.revision : null), stale: !!stale, resolved_from: from,
      attention_target: T(r.attention_target) || null, overlaps: [],
    });
  });
  for (const a of intervals) for (const b of intervals) if (a !== b && a.start_tick < b.end_tick && b.start_tick < a.end_tick) a.overlaps.push(b.id);
  return { intervals, errors };
}
// every read of every shot against the CURRENT score: which are stale (a new score or audio revision moved them). Read-only; -> { stale: [{shot_id, read_id}], errors }
export function staleReads(doc, score = null) {
  const stale = [], errors = [];
  for (const s of arr(doc && doc.shots)) {
    const r = normalizeReads(arr(s.reads), score);
    for (const e of r.errors) { errors.push({ ...e, shot_id: s.shot_id }); if (e.kind === "stale") stale.push({ shot_id: s.shot_id, read_id: e.ref }); }
  }
  return { stale, errors };
}
export const CUT_FUNCTIONS = ["cause", "contrast", "ellipsis", "viewpoint", "evidence", "rhythmic_punctuation", "separation"]; // what a cut does; free-standing from CUT_RELATIONS
export const BINDING_PHASES = ["initial", "action", "consequence"];
const normBinding = (b) => {
  if (!isObj(b)) return null;
  const x = { ...(T(b.panel_id) ? { panel_id: T(b.panel_id) } : {}), state: T(b.state), ...(T(b.event_id) ? { event_id: T(b.event_id) } : {}) };
  const s = num(b.start_s), e = num(b.end_s);
  if (s != null) x.start_s = s;
  if (e != null) x.end_s = e;
  if (b.anticipation && isObj(b.anticipation)) x.anticipation = { motivated: b.anticipation.motivated === true, reason: T(b.anticipation.reason) };
  return x;
};
// the per-shot digest of the temporal extension (reads + bindings + camera + composition), or null when the shot has none (a revision 1 shot)
export function readsDigest(shot) {
  const s = isObj(shot) ? shot : {};
  if (!arr(s.reads).length && !s.bindings && !s.camera_intent && !s.composition) return null;
  return canonicalDigest({ reads: arr(s.reads).map((r) => ({ id: r.id, event_id: r.event_id, si: r.source_interval })), bindings: s.bindings || null, camera: s.camera_intent || null, composition: s.composition || null });
}
// one line per phase and read for `frames/<id>.md` or a note on the existing board: the richer direction rides in existing supported text slots (no new UI field)
export function temporalNotes(shot) {
  const s = normalizeShot(shot), out = [];
  if (s.bindings) for (const ph of BINDING_PHASES) if (s.bindings[ph] && s.bindings[ph].state) out.push(`${ph}: ${s.bindings[ph].state}`);
  for (const r of arr(s.reads)) out.push(`read ${r.id}: notice ${r.what_to_notice || "?"}; understand ${r.what_to_understand || "?"} (${r.source_interval && r.source_interval.start_s != null ? `${r.source_interval.start_s}-${r.source_interval.end_s} s` : r.source_interval && r.source_interval.beat_ref ? `beat ${r.source_interval.beat_ref}` : "unplaced"})`);
  if (s.camera_intent && s.camera_intent.motivation) out.push(`camera: ${s.camera_intent.motivation}`);
  return out;
}

export function normalizeShot(raw = {}) {
  const s = isObj(raw) ? raw : {};
  const panels = arr(s.panels).map((p, i) => {
    const q = isObj(p) ? p : {};
    return { id: T(q.id || q.panel_id) || `p${i + 1}`, state: T(q.state), image_ref: q.image_ref ?? null, ...(q.weight != null ? { weight: q.weight } : {}), ...(q.source_digest ? { source_digest: q.source_digest } : {}), ...(q.image_digest ? { image_digest: q.image_digest } : {}),
      ...(T(q.event_id) ? { event_id: T(q.event_id) } : {}), ...(BINDING_PHASES.includes(T(q.phase)) ? { phase: T(q.phase) } : {}), ...(q.score_revision ? { score_revision: q.score_revision } : {}), status: q.status || "current" };
  });
  const t = isObj(s.timing) ? s.timing : {};
  const tr = isObj(s.transition_out) ? s.transition_out : {};
  const si = isObj(s.sound_intent) ? s.sound_intent : {};
  // W05 extras are emitted only when the raw shot carries them, so a legacy shot (and every digest over it) is unchanged
  const ci = isObj(s.camera_intent) ? s.camera_intent : null;
  const cmp = isObj(s.composition) ? s.composition : null;
  const bnd = isObj(s.bindings) ? Object.fromEntries(BINDING_PHASES.map((k) => [k, normBinding(s.bindings[k])]).filter(([, v]) => v)) : null;
  const reads = Array.isArray(s.reads) ? s.reads.map((r, i) => {
    const q = isObj(r) ? r : {}, sv = isObj(q.source_interval) ? q.source_interval : {};
    return { id: T(q.id) || `read-${i + 1}`, event_id: T(q.event_id), what_to_notice: T(q.what_to_notice), what_to_understand: T(q.what_to_understand), source_interval: { ...sv }, attention_target: T(q.attention_target),
      minimum_read_basis: isObj(q.minimum_read_basis) ? q.minimum_read_basis : T(q.minimum_read_basis) || null, competing_reads: arr(q.competing_reads).map((c) => (isObj(c) ? c : { id: T(c) })), accessibility_dependency: T(q.accessibility_dependency) };
  }) : null;
  return {
    ...s,
    shot_id: T(s.shot_id), beat_id: T(s.beat_id), purpose: T(s.purpose),
    panels: panels.length ? panels : [{ id: "p1", state: "", image_ref: null, status: "current" }], // 1..n: one panel explains a static beat; never a mechanical 3
    copy_refs: arr(s.copy_refs).map(String),
    focal_read: Array.isArray(s.focal_read) ? s.focal_read : T(s.focal_read),
    timing: { status: TIMING_STATUS.includes(t.status) ? t.status : "provisional", duration_s: num(t.duration_s), ...(t.min_s != null ? { min_s: t.min_s } : {}), ...(t.score_revision ? { score_revision: t.score_revision } : {}), ...(t.start_s != null ? { start_s: t.start_s, end_s: t.end_s } : {}) },
    ...(reads ? { reads } : {}), ...(bnd && Object.keys(bnd).length ? { bindings: bnd } : {}),
    ...(ci ? { camera_intent: { motivation: T(ci.motivation), ...(T(ci.move) ? { move: T(ci.move) } : {}), ...(T(ci.event_id) ? { event_id: T(ci.event_id) } : {}) } } : {}),
    ...(cmp ? { composition: { focal_subject: T(cmp.focal_subject), scale: T(cmp.scale), framing: T(cmp.framing), ground: T(cmp.ground), density: T(cmp.density), action_register: T(cmp.action_register), adjacent_relation: T(cmp.adjacent_relation),
      anchor_ids: arr(cmp.anchor_ids).map(String), text_roles: isObj(cmp.text_roles) ? cmp.text_roles : {}, representation_level: T(cmp.representation_level), ...(T(cmp.repeat_reason) ? { repeat_reason: T(cmp.repeat_reason) } : {}) } } : {}),
    transition_out: { relation: tr.relation ?? null, kind: T(tr.kind) || "cut", carrier: tr.carrier ?? null, ...(CUT_FUNCTIONS.includes(T(tr.cut_function)) ? { cut_function: T(tr.cut_function) } : {}), ...(tr.cause_ref ? { cause_ref: tr.cause_ref } : {}), ...(tr.continuity_ref ? { continuity_ref: tr.continuity_ref } : {}) },
    sound_intent: { role: T(si.role) || "supportive", cue_refs: arr(si.cue_refs).map(String), ...(T(si.relation) ? { relation: T(si.relation) } : {}) },
  };
}
export function validateShot(shot, ctx = {}) {
  const p = [], w = [];
  const raw = shot;
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
  if (T(raw && raw.transition_out && raw.transition_out.cut_function) && !s.transition_out.cut_function) p.push(`${s.shot_id}: transition_out.cut_function must be one of ${CUT_FUNCTIONS.join(", ")}`);
  // W05 temporal extension (only checked when the shot carries it). Structural read errors are problems; stale/unverified reads are warnings (re-map them, never re-time them here).
  const errors = [];
  if (s.reads) {
    const rids = s.reads.map((r) => r.id);
    if (new Set(rids).size !== rids.length) p.push(`${s.shot_id}: read ids must be unique`);
    for (const r of s.reads) {
      if (!r.attention_target) w.push(`${s.shot_id}/${r.id}: no attention_target (what the eye is on during this read)`);
      if (ctx.event_ids && arr(ctx.event_ids).length && r.event_id && !ctx.event_ids.includes(r.event_id)) p.push(`${s.shot_id}/${r.id}: event_id ${r.event_id} is not a signature event of the chosen story`);
      for (const c of r.competing_reads) if (c.id && !rids.includes(c.id)) w.push(`${s.shot_id}/${r.id}: competing read ${c.id} is not a read of this shot`);
    }
    const n = normalizeReads(s.reads, ctx.score || null);
    for (const e of n.errors) {
      errors.push({ ...e, shot_id: s.shot_id });
      if (["reversed", "out_of_bounds", "duplicate_id"].includes(e.kind)) p.push(e.message);
      else w.push(e.message);
    }
  }
  if (s.bindings) {
    const ids = new Set(s.panels.map((x) => x.id));
    for (const ph of BINDING_PHASES) { const b = s.bindings[ph]; if (b && b.panel_id && !ids.has(b.panel_id)) p.push(`${s.shot_id}: bindings.${ph}.panel_id ${b.panel_id} is not a panel of this shot`); }
    for (const ph of BINDING_PHASES) { const b = s.bindings[ph]; if (b && b.start_s != null && b.end_s != null && b.end_s < b.start_s) p.push(`${s.shot_id}: bindings.${ph} ends before it begins`); }
  }
  return { ok: !p.length, problems: p, warnings: w, ...(errors.length ? { errors } : {}) };
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
  reads_changed: { class: "meaningful", reopens: true, why: "what the viewer is asked to notice and understand, or when, changed (reads, bindings, camera or composition direction)" },
  reads_stale: { class: "meaningful", reopens: true, route: "timing", why: "the score or audio revision the reads were mapped on moved: re-map the windows on this surface (they are kept as written, never silently re-timed)" },
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
    ...(shots.some((s) => readsDigest(s)) ? { temporal: shots.filter((s) => readsDigest(s)).map((s) => ({ shot_id: s.shot_id, digest: readsDigest(s), score_revision: (s.timing && s.timing.score_revision) || (doc && doc.timing_revision) || null })) } : {}),
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
  if (prev.temporal || next.temporal) {
    const tb = new Map(arr(prev.temporal).map((x) => [x.shot_id, x])), tn = new Map(arr(next.temporal).map((x) => [x.shot_id, x]));
    const moved = [...new Set([...tb.keys(), ...tn.keys()])].filter((k) => !tb.get(k) || !tn.get(k) || tb.get(k).digest !== tn.get(k).digest);
    if (moved.length) add("reads_changed", moved);
    const restamped = [...tn.keys()].filter((k) => tb.get(k) && tb.get(k).digest === tn.get(k).digest && tb.get(k).score_revision !== tn.get(k).score_revision);
    if (restamped.length) add("reads_stale", restamped);
  }
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
  // W05: reads mapped on the old score/audio are stale until re-mapped; only present when a shot carries reads (a revision 1 board gets exactly what it got before)
  const rd = shots.some((s) => arr(s.reads).length) ? { reads_stale: ids.length ? shots.filter((s) => ids.includes(s.shot_id) && arr(s.reads).length).map((s) => ({ shot_id: s.shot_id, read_ids: s.reads.map((r) => r.id) })) : [], note: "reads on a shot whose timing moved are stale: re-map them against the new score (normalizeReads); never silently re-time them" } : null;
  return { kind: "audio_replacement", from: before && before.kind || null, to: after && after.kind || null, silent_retime: false, deltas: rec.deltas, protected: rec.protected, reading_conflicts: reading, ...(rd ? { reads: rd } : {}), impact: imp, propose_in: "Storyboard (same surface, before the final build)", audio_contract: "audio/contract.json (Plan 07; storyboard/audio.json still reads); no second audio timeline" };
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
