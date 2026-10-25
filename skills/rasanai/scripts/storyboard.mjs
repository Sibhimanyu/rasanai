#!/usr/bin/env node
// Storyboard (Plan 05): shot and panel records, the stage boundary, ONE timing authority, editorial review, the timed animatic, the approval
// snapshot. One review (panels plus timed playback); no sixth approval. Everything below is additive over frames/shots.json, motion/score.json
// and the console's `animatic` step, which are adopted, not replaced. See lib/storyboard.mjs, lib/timing.mjs, lib/editorial.mjs.
//
//   node storyboard.mjs boundary --run <run> [--mode full|sketch] [--inherit-look "<reason>"] [--inherit-story "<reason>"] [--pin]
//        -> may a full storyboard be scheduled? Needs the approved (or explicitly inherited) Story and Look digests; stale inputs are refused.
//           --pin records the digests in storyboard/inputs.json; a sketch (--mode sketch) is exploratory, labelled, and never schedulable
//   node storyboard.mjs adopt --run <run> [--from frames|animatic] [--kind full|sketch]
//        -> frames/shots.json (or the console animatic step) -> storyboard/storyboard.json shot records (a new revision when it changed; the old panel set is kept, labelled old)
//   node storyboard.mjs check --run <run>   -> records, editorial findings (beat and seam), board-vs-score drift, whether the panel set is current
//   node storyboard.mjs timing --run <run> [--audio <audio.json>] [--deltas <deltas.json>] [--commit] [--reason "<why>"]
//        -> drift of the board from motion/score.json; with --audio the reconciliation record (voice / music / boards: deltas PROPOSED, music-led track authoritative);
//           with --deltas [{scene, duration_s}] the committed change (--commit writes motion/score.json, scenes.json, motion/events.json, motion/retime.json)
//   node storyboard.mjs events --run <run>  -> regenerates motion/events.json from motion/score.json (never edit it)
//   node storyboard.mjs animatic --run <run> [--audio-kind selected|scratch|none] [--audio-file <f>] [--render] [--out <mp4>] [--push]
//        -> storyboard/animatic.json (segments [start, end), spatial changes, seam annotations, audio, honest fidelity label); --render builds a cheap mp4 with ffmpeg
//           (never run during implementation); --push prints the console `push --step animatic` data
//   node storyboard.mjs note --run <run> --text "<note>" [--t <s>] [--shot <id>] [--panel <id>]   -> the editorial revision request a viewer note becomes
//   node storyboard.mjs snapshot --run <run> [--approved-by <who>] [--check]   -> the approval snapshot (pins panels, copy, look, audio or scratch, timing revision) / is it still current
//   node storyboard.mjs auto-decide --run <run>   -> records a "Just make it" decision for this stage (the Final is still shown)
//   node storyboard.mjs restart --run <run>       -> restart at the Storyboard: Story and Look hold, the old panel set is labelled old
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die } from "./lib/common.mjs";
import { readShots } from "./lib/frames-lib.mjs";
import { contractForStoryboard, readAudioContract } from "./lib/audio-direction.mjs";
import { evaluateFilm, noteToRevision } from "./lib/editorial.mjs";
import { commitTiming, eventsFresh, projectBoardTiming, reconcile, scoreRevision, timingDrift, writeEvents } from "./lib/timing.mjs";
import {
  animaticPayload, animaticPlan, autoDecision, boundary, fromLegacyAnimatic, fromLegacyShots, labelOld, panelSetCurrent, pinInputs,
  readStoryboard, recordAutoDecision, renderAnimatic, restartAtStoryboard, snapshotRun, validateStoryboardDoc, writeStoryboard,
} from "./lib/storyboard.mjs";

const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const run = () => { if (!args.run || args.run === true) die("--run <run dir> required"); const d = path.resolve(String(args.run)); if (!fs.existsSync(d)) die(`run dir not found: ${d}`); return d; };
const S = (r, ...p) => path.join(r, "storyboard", ...p);
const str = (k) => (args[k] && args[k] !== true ? String(args[k]) : "");
const inheritOf = () => ({ ...(str("inherit-story") ? { story: { reason: str("inherit-story"), source: "inherited" } } : {}), ...(str("inherit-look") ? { look: { reason: str("inherit-look"), source: "inherited" } } : {}) });
const beatIdsOf = (r) => {
  for (const f of ["story/chosen-treatment.json", "story/intent.json", "story/chosen.json"]) {
    const j = rj(path.join(r, f));
    const bs = j && (j.beats || (j.treatment && j.treatment.beats));
    if (Array.isArray(bs) && bs.length) return bs.map((b, i) => (b && b.id) || `beat-${i + 1}`);
  }
  return [];
};
const copyOf = (doc) => (doc.shots || []).flatMap((s) => s.copy || []);
// Plan 07: audio/contract.json first (soundplan.mjs contract --build), then the old storyboard/audio.json, then the flags
const audioOf = (r) => { const c = readAudioContract(r); return c.source === "audio/contract.json" ? contractForStoryboard(c) : rj(S(r, "audio.json")) || { kind: str("audio-kind") || "none", file: str("audio-file") || null }; };

if (cmd === "boundary") {
  const r = run();
  const b = boundary(r, { mode: str("mode") || "full", inherit: inheritOf() });
  if (args.pin && b.ok && b.mode === "full") b.pinned = pinInputs(r, { inherit: inheritOf() }).ok;
  out(b, b.ok ? 0 : 2);
} else if (cmd === "adopt") {
  const r = run();
  const kind = str("kind") === "sketch" ? "sketch" : "full";
  const b = boundary(r, { mode: kind, inherit: inheritOf() });
  if (!b.ok) out({ ok: false, problems: b.problems, hint: "a full storyboard waits for the approved Story and Look (storyboard.mjs boundary); use --kind sketch for an exploratory sketch" }, 2);
  const score = rj(path.join(r, "motion", "score.json"));
  const from = str("from") || (fs.existsSync(path.join(r, "frames", "shots.json")) ? "frames" : "animatic");
  let doc;
  if (from === "frames") {
    const legacy = readShots(path.join(r, "frames", "shots.json"));
    if (!legacy) die("frames/shots.json not found");
    doc = fromLegacyShots(legacy, { run: r, beatIds: beatIdsOf(r), score, kind });
  } else {
    const session = rj(path.join(r, "session.json")) || rj(path.join(r, ".console", "session.json")) || {};
    doc = fromLegacyAnimatic(session.steps && session.steps.animatic, { kind });
    if (!doc.shots.length) die("no animatic step with scenes found in the session");
  }
  if (kind === "sketch") { doc.label = b.label; doc.schedulable = false; }
  else { const pin = pinInputs(r, { inherit: inheritOf() }); doc.inputs = pin.ok ? { story: pin.pinned.story, look: pin.pinned.look } : undefined; }
  if (score) { const p = projectBoardTiming(doc, score, beatIdsOf(r)); if (p.shots.every((s) => s.timing.status === "approved")) { doc.shots = p.shots; doc.timing_revision = p.timing_revision; doc.timing_authority = p.timing_authority; } }
  const v = validateStoryboardDoc(doc, { beat_ids: [] });
  if (!v.ok) out({ ok: false, problems: v.problems, warnings: v.warnings }, 2);
  out({ ok: true, ...writeStoryboard(r, doc), kind, shots: doc.shots.length, panels: doc.shots.reduce((a, s) => a + s.panels.length, 0), file: "storyboard/storyboard.json", warnings: v.warnings });
} else if (cmd === "check") {
  const r = run();
  const doc = readStoryboard(r);
  if (!doc) die("no storyboard/storyboard.json (storyboard.mjs adopt first)");
  const beatIds = beatIdsOf(r), score = rj(path.join(r, "motion", "score.json"));
  const v = validateStoryboardDoc(doc, { beat_ids: beatIds });
  const continuity = rj(path.join(r, "look", "continuity.json"));
  const ed = evaluateFilm(doc.shots, { copy: copyOf(doc), links: continuity && continuity.links, locale: str("locale") || "en", display: str("display") || "desktop", styleOptions: (rj(path.join(r, "look", "visual-bible.json")) || {}).editorial_options });
  const cur = panelSetCurrent(doc, r);
  const drift = score ? timingDrift(doc, score, beatIds) : null;
  // an adopted legacy record may not state its editorial intent yet: its findings are advice, not a failure
  const advice = !!doc.legacy_adopted;
  out({ ok: v.ok && cur.current && (advice || ed.ok), kind: doc.kind, revision: doc.revision, problems: v.problems, warnings: v.warnings, editorial: { ...ed, advisory: advice || undefined }, current: cur, timing_drift: drift, events: score ? eventsFresh(r) : undefined }, v.ok && cur.current && (advice || ed.ok) ? 0 : 2);
} else if (cmd === "timing") {
  const r = run();
  const doc = readStoryboard(r), score = rj(path.join(r, "motion", "score.json"));
  const o = { drift: doc && score ? timingDrift(doc, score, beatIdsOf(r)) : null, score_revision: score ? scoreRevision(score) : null };
  if (str("audio")) { const a = rj(path.resolve(str("audio"))); if (!a || !doc) die("--audio needs an audio.json and a storyboard"); o.reconciliation = reconcile({ shots: doc.shots, audio: a, copy: copyOf(doc) }); }
  if (str("deltas")) {
    const d = rj(path.resolve(str("deltas")));
    if (!Array.isArray(d)) die("--deltas wants a JSON list of {scene, duration_s}");
    o.commit = commitTiming(r, d, { dry: !args.commit, reason: str("reason") });
  }
  out({ ok: true, ...o });
} else if (cmd === "events") {
  const r = run();
  const res = writeEvents(r);
  out(res, res.ok ? 0 : 1);
} else if (cmd === "animatic") {
  const r = run();
  let doc = readStoryboard(r);
  if (!doc) die("no storyboard/storyboard.json (storyboard.mjs adopt first)");
  const score = rj(path.join(r, "motion", "score.json"));
  if (score) { const p = projectBoardTiming(doc, score, beatIdsOf(r)); doc = { ...doc, shots: p.shots, timing_revision: p.timing_revision, frame_rate: p.frame_rate }; }
  if (!panelSetCurrent(doc, r).current) doc = labelOld(doc);
  const plan = animaticPlan(doc, { audio: audioOf(r), frame_rate: score && (score.frame_rate || score.fps) });
  fs.mkdirSync(S(r), { recursive: true });
  fs.writeFileSync(S(r, "animatic.json"), JSON.stringify(plan, null, 2) + "\n");
  const res = { ok: true, plan: "storyboard/animatic.json", segments: plan.segments.length, total_s: plan.total_s, fidelity: plan.fidelity.label, timing_status: plan.timing_status, audio: plan.audio.label };
  if (args.render) res.render = renderAnimatic(plan, path.resolve(str("out") || S(r, "animatic.mp4")), { run: r });
  if (args.push) res.console_push = animaticPayload(plan, doc);
  out(res, res.render && !res.render.ok ? 1 : 0);
} else if (cmd === "note") {
  const r = run();
  if (!str("text")) die('--text "<the note>" required');
  const doc = readStoryboard(r) || {};
  const plan = rj(S(r, "animatic.json"));
  const anchor = { shot_id: str("shot") || null, panel_id: str("panel") || null, t: args.t !== undefined ? Number(args.t) : null, revision: plan ? plan.storyboard_revision : doc.revision ?? null };
  const res = noteToRevision(str("text"), anchor, { revision: doc.revision });
  out(res, res.ok ? 0 : 1);
} else if (cmd === "snapshot") {
  const res = snapshotRun(run(), { approved_by: str("approved-by") || "user", check: !!args.check });
  out(res.ok && res.record ? { ok: true, revision: res.record.revision, artifact_digest: res.record.artifact_digest, scratch_audio: res.record.scratch_audio || false, final_voice_approved: res.record.final_voice_approved, file: res.file } : res, res.ok && res.current !== false ? 0 : res.ok ? 2 : 1);
} else if (cmd === "auto-decide") {
  const r = run();
  const b = boundary(r, { mode: "full", inherit: inheritOf() });
  const rec = autoDecision({ boundary: b, approval_mode: str("policy") || "autonomous" });
  out({ ok: true, boundary_ok: b.ok, problems: b.ok ? undefined : b.problems, ...recordAutoDecision(r, rec) });
} else if (cmd === "restart") {
  out(restartAtStoryboard(run()));
} else {
  die("usage: storyboard.mjs boundary|adopt|check|timing|events|animatic|note|snapshot|auto-decide|restart --run <run> (see the header)");
}
