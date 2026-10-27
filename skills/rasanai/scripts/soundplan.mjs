#!/usr/bin/env node
// Sound, music and voice as part of the film (Plan 07). The DIRECTOR/crew-facing entry to lib/audio-direction, cues, music-fit, voice-cache, mix-receipt and
// sound-controls. It reads and writes small JSON files and calls NO audio tool (analysis, fit, render, speak and check stay in sound.mjs / music.mjs /
// voice.mjs, which consult these records). References: references/sound.md ("Sound direction").
//
//   node soundplan.mjs direction --run <run> [--set <direction.json> | --compile <opts.json>] [--check]
//        -> audio/direction.json: roles of voice, music, effects, ambience and intentional silence; a limited sonic palette; a recurring motif; protected silence
//           windows; a silent deliverable as a recorded choice. --compile builds the brief from options ({narrated, music_led, silent, silent_reason, palette, motif, silence_windows...})
//   node soundplan.mjs cues --run <run> [--write] [--sfx-events]
//        -> derives motion/cues.json from motion/score.json (audio_cues + events + seams; legacy sounds still read): film time comes from the events, never stored
//           on the cue. Reports offsets against each cue's OWN target, silence-window violations and riser+impact formulas. --sfx-events prints the events for sound.mjs sfx-plan
//   node soundplan.mjs contract --run <run> [--build <opts.json>]    -> audio/contract.json (replaces storyboard/audio.json, which still reads); no --build prints the current one
//   node soundplan.mjs music-fit --analysis <analysis.json> [--plan <fit-plan.json>] [--music-led] [--trim-authorized] [--loop-declared] [--film <s>] [--user-track] [--cuts "1.2,4.8"]
//        -> labelled estimates (tempo detected | uncertain | undetected, never a made-up BPM), structural edit boundaries, the fit guard (too short, endless loop, music-led trim)
//   node soundplan.mjs track --run <run> [--set <track.json>] [--change <new-track.json> [--shots a,b]]
//        -> audio/music-track.json (rights, edits, gain automation, version); --change prints the bounded timing impact of swapping the track
//   node soundplan.mjs voice --run <run> --lines <lines.json> --voice <voice.json> [--glossary <glossary.json>] [--locale en] [--settings <json>] [--cache <voice-cache.json>]
//        -> binds the lines to the approved copy, applies only USER-CONFIRMED pronunciations, and plans which segments to reuse or regenerate (and their genuine timing dependents)
//   node soundplan.mjs voice-check --lines <lines.json> --heard <heard.json> [--names "A,B"] [--glossary <f>]   -> heard words vs the script, with uncertainty
//   node soundplan.mjs mix --profiles | --evaluate <measures.json> [--profile <id|json>] [--duration <s>] [--silent-by-choice "<why>"] [--no-audio-expected]
//        | --duck <spans.json> [--depth 5] | --receipt --run <run> --kind preview|delivery [--profile <id>] [--output <file>] [--measures <json>] | --reuse --run <run> --kind <k> [--file <cached>]
//   node soundplan.mjs controls --run <run>                         -> the Studio sound-control payload (audition, mute/solo, permitted swaps, a sound-note slot)
//   node soundplan.mjs note --run <run> --text "<note>" [--kind swap_music|swap_voice|edit_line|remove_cue|add_cue|level|silence] [--shot <id>] [--cue <id>] [--stem <s>] [--t <s>]
//        -> a versioned targeted revision with its timing effect (audio/revisions/rev-N.json); never a per-cue approval
//   node soundplan.mjs mute --run <run> --stem vo|music|sfx|ambience [--mute 1|0] [--solo 1|0]   -> audition state only
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die } from "./lib/common.mjs";
import { buildContract, contractForStoryboard, directionFor, readAudioContract, readDirection, sfxExpectation, silenceWindows, validateDirection, writeAudioContract, writeDirection } from "./lib/audio-direction.mjs";
import { deriveCues, toSfxEvents, writeCues } from "./lib/cues.mjs";
import { eventsFromScore } from "./lib/timing.mjs";
import { cutBeatReport, editBoundaries, fitGuard, labelEstimates, trackChangeImpact, trackRecord } from "./lib/music-fit.mjs";
import { bindToCopy, planRegeneration, transcriptCheck, validateGlossary, voiceAuthorization } from "./lib/voice-cache.mjs";
import { PROFILES, cachedMixName, currentInputs, duckEnvelope, evaluateMeasures, measureRecord, readReceipt, receipt, reuseDecision, writeReceipt } from "./lib/mix-receipt.mjs";
import { mixRevisionOf } from "./lib/mix-bus.mjs";
import { controlPayload, setMuteSolo, soundNoteRevision } from "./lib/sound-controls.mjs";
import { readSoundChoices, soundChoicesPath } from "./lib/sound-choices.mjs";

const args = parseArgs();
const cmd = args._[0];
const str = (k) => (args[k] && args[k] !== true ? String(args[k]) : "");
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const rj = (p) => { try { return JSON.parse(fs.readFileSync(path.resolve(p), "utf8")); } catch { return null; } };
const need = (k, what) => { if (!str(k)) die(`--${k} ${what} required`); return str(k); };
const runDir = () => path.resolve(need("run", "<run dir>"));
const jarg = (k) => { const v = str(k); if (!v) return null; return /^\s*[[{]/.test(v) ? JSON.parse(v) : rj(v); };
const AD = (r, ...p) => path.join(r, "audio", ...p);
const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n"); };

if (cmd === "direction") {
  const r = runDir();
  let d = null;
  if (str("set")) d = rj(str("set"));
  else if (str("compile")) {
    // revision 2: the user's recorded sound choices bind the roles (directionFor stamps mix_policy_revision 2). No record, or a legacy one: compiled exactly as before.
    const o = jarg("compile") || {}, sc = readSoundChoices(r);
    if (o.sound === undefined && o.sound_choices === undefined && sc && !sc.legacy && sc.record && !sc.record.legacy) o.sound = sc.record;
    d = directionFor(o);
  }
  if (d) { const w = writeDirection(r, d); out(w, w.ok ? 0 : 2); }
  const cur = readDirection(r);
  out({ ok: cur.ok, legacy: cur.legacy, direction: cur.direction, validation: cur.validation || (cur.direction ? validateDirection(cur.direction) : null), sfx: sfxExpectation(cur.direction), note: cur.note }, 0);
} else if (cmd === "cues") {
  const r = runDir();
  if (args.write) { const w = writeCues(r); out(w, w.ok ? 0 : 1); }
  const score = rj(path.join(r, "motion", "score.json"));
  if (!score) die("motion/score.json is missing or invalid");
  const dir = readDirection(r), ev = eventsFromScore(score).events;
  const doc = deriveCues(score, { silence: dir.direction ? silenceWindows(dir.direction, ev).windows : [] });
  if (args["sfx-events"]) out({ events: toSfxEvents(doc.cues) });
  out({ ok: !doc.issues.some((i) => i.severity === "error"), cues: doc.cues.length, issues: doc.issues, score_revision: doc.score_revision });
} else if (cmd === "contract") {
  const r = runDir();
  if (str("build")) {
    const o = jarg("build") || {};
    if (o.sound === undefined) { const cur = readDirection(r).direction; if (cur && cur.sound) o.sound = cur.sound; } // the contract carries the direction's sound block (absent for legacy)
    const c = buildContract(o); out({ ...writeAudioContract(r, c), contract: c }); }
  const c = readAudioContract(r);
  out({ contract: c, storyboard_shape: contractForStoryboard(c), legacy: c.legacy });
} else if (cmd === "music-fit") {
  const A = rj(need("analysis", "<analysis.json (sound.mjs analyze)>"));
  if (!A) die("could not read the analysis");
  const labels = labelEstimates(A);
  const plan = str("plan") ? rj(str("plan")) : null;
  const res = { labels, boundaries: editBoundaries(A, labels) };
  if (plan) res.guard = fitGuard(plan, A, { music_led: !!args["music-led"], trim_authorized: !!args["trim-authorized"], loop_declared: !!args["loop-declared"], film_s: str("film") ? Number(str("film")) : null, user_track: !!args["user-track"] });
  if (str("cuts")) res.cuts = cutBeatReport(str("cuts").split(",").map(Number).filter(Number.isFinite), A, labels);
  out({ ok: res.guard ? res.guard.ok : true, ...res }, res.guard && !res.guard.ok ? 2 : 0);
} else if (cmd === "track") {
  const r = runDir(), f = AD(r, "music-track.json");
  const cur = rj(f);
  if (str("set")) { const rec = trackRecord(jarg("set") || {}); wj(f, rec); out({ ok: true, file: "audio/music-track.json", record: rec }); }
  if (str("pick")) {
    // the user picked a candidate of music/shortlist.json: the record carries the chosen section, the rights ref and the per-use rights of THAT entry (never invented)
    const sl = rj(path.join(r, "music", "shortlist.json"));
    const e = sl && (sl.options || []).find((o) => o && o.id === str("pick"));
    if (!e) out({ ok: false, error: `no shortlist entry "${str("pick")}" in music/shortlist.json` }, 2);
    const sel = sl.selected && sl.selected.id === e.id ? sl.selected : null;
    const sec = e.chosen_section || (sel && sel.section) || null;
    const rec = trackRecord({ id: e.id, source: e.source === "user" ? "user" : e.source === "ai" ? "ai" : "catalog", file: e.file_identity && e.file_identity.file, file_digest: e.file_identity && e.file_identity.sha256, music_led: !!(cur && cur.music_led), section: sec ? { t0: sec.t0, t1: sec.t1, label: sec.label, reason: sec.reason } : undefined, evidence_state: e.evidence_state, rights_ref: e.rights && e.rights.ref, rights_by_use: e.rights && e.rights.by_use, stems: e.stems, shortlist_revision: sl.revision });
    wj(f, rec);
    out({ ok: true, file: "audio/music-track.json", record: rec });
  }
  if (str("change")) {
    const after = trackRecord(jarg("change") || {});
    const con = readAudioContract(r);
    const ti = trackChangeImpact({ before: cur, after, shot_ids: str("shots") ? str("shots").split(",") : [], music_led: !!con.music_led || !!(cur && cur.music_led) });
    // revision 2: the arrangement on file belongs to the old track; a different track means the edit is re-evaluated (sound.mjs fit rewrites audio/arrangement.json), visuals are not rebuilt
    const pa = rj(AD(r, "arrangement.json"));
    const arrImpact = pa ? (pa.track_id && after.id && pa.track_id !== after.id ? { edit_reevaluation: true, gain_only: false, rebuild_visuals: false, why: "the track changed: re-fit the music edit (sound.mjs fit --run), then timing is proposed through the impact below" } : { edit_reevaluation: false, gain_only: true, rebuild_visuals: false, why: "same track id: at most a gain lane changed" }) : null;
    out({ ok: true, ...ti, ...(arrImpact ? { arrangement_impact: arrImpact } : {}), next_record: after });
  }
  out({ track: cur });
} else if (cmd === "voice") {
  const r = runDir();
  const lines = jarg("lines");
  if (!Array.isArray(lines)) die("--lines wants a JSON list of {segment_id, text, copy_ref?, shot_id?}");
  const voice = jarg("voice") || {};
  const auth = voiceAuthorization(voice);
  if (!auth.ok) out({ ok: false, error: auth.error }, 2);
  const glossary = jarg("glossary");
  const gv = glossary ? validateGlossary(glossary) : { ok: true, errors: [], warnings: [] };
  const sb = rj(path.join(r, "storyboard", "storyboard.json"));
  const copy = (sb && Array.isArray(sb.shots) ? sb.shots : []).flatMap((s) => (Array.isArray(s.copy) ? s.copy : []).map((c, i) => (typeof c === "string" ? { id: `${s.shot_id}-copy-${i + 1}`, text: c } : { id: c.id, text: c.text })));
  const binding = copy.length ? bindToCopy(lines, copy) : { rows: [], ok: null, note: "no storyboard copy to bind to: lines are not checked against approved wording" };
  const cache = str("cache") ? rj(str("cache")) : rj(AD(r, "voice-cache.json"));
  const plan = planRegeneration({ cache: cache || {}, lines, voice, locale: str("locale") || "en", settings: jarg("settings") || {}, glossary });
  out({ ok: gv.ok && binding.ok !== false, voice: auth, glossary: gv, binding, plan });
} else if (cmd === "voice-check") {
  const lines = jarg("lines"), heard = jarg("heard");
  if (!Array.isArray(lines)) die("--lines wants a JSON list of {n, text}");
  const gl = jarg("glossary");
  const res = transcriptCheck({ lines, heard: Array.isArray(heard) ? heard : [], names: str("names").split(",").map((x) => x.trim()).filter(Boolean), glossary: gl, transcriber: { name: str("transcriber") || undefined, model: str("model") || undefined } });
  out(res, res.review && res.review.length ? 2 : 0);
} else if (cmd === "mix") {
  if (args.profiles) out({ default: "rasanai-house", profiles: PROFILES });
  if (str("evaluate")) {
    const m = rj(str("evaluate"));
    if (!m) die("could not read the measures");
    const prof = str("profile") ? (/^\s*\{/.test(str("profile")) ? JSON.parse(str("profile")) : str("profile")) : "rasanai-house";
    const res = evaluateMeasures(measureRecord(m), { profile: prof, expected_duration_s: str("duration") ? Number(str("duration")) : null, silent_by_choice: str("silent-by-choice"), audio_expected: !args["no-audio-expected"] });
    out(res, res.ok ? 0 : 2);
  }
  if (str("duck")) { const sp = rj(str("duck")); out(duckEnvelope(Array.isArray(sp) ? sp : sp && sp.spans || [], { depth_db: args.depth ? Number(args.depth) : 5 })); }
  const r = args.receipt || args.reuse ? runDir() : null;
  const kind = str("kind") === "delivery" ? "delivery" : "preview";
  if (args.receipt) {
    // revision 2 (a bus plan or extended identity is present): the receipt also records the processor identity and the index.html audio attributes
    const proc = jarg("processor"), ext = mixRevisionOf(r) >= 2 || !!proc;
    const inputs = currentInputs(r, { profile: str("profile") || "rasanai-house", ...(ext ? { processor: proc || {}, html_audio: true } : {}) });
    const m = jarg("measures");
    const rc = receipt({ kind, inputs, profile: str("profile") || "rasanai-house", output: str("output") ? { file: str("output") } : {}, measures: m, processor_detail: proc || null });
    const w = writeReceipt(r, rc);
    out({ ...w, digests: rc.digests, cached_name: cachedMixName("mix", "wav", rc.digests) });
  }
  if (args.reuse) {
    const rc = readReceipt(r, kind);
    const hasExt = !!(rc && rc.digests && ["processor", "html_audio"].some((k) => rc.digests[k] != null)); // compare like with like: the extended keys only when the receipt carries them
    out(reuseDecision({ receipt: rc, current: currentInputs(r, { profile: rc && rc.profile && rc.profile.id || "rasanai-house", ...(hasExt ? { processor: jarg("processor") || (rc.processor || {}), html_audio: rc.digests.html_audio != null } : {}) }), file: str("file") }));
  }
  die("mix wants --profiles | --evaluate <measures.json> | --duck <spans.json> | --receipt | --reuse");
} else if (cmd === "music-args") {
  // the argv tail the music step is run with: the film's sound choices, and --allow-generation ONLY when the user gave explicit generation consent
  // (audio/generation-consent.json {consented:true}, written by the Look action when the user says so; a key in the environment or a recommendation is never consent)
  const r = runDir(), sc = readSoundChoices(r), consent = rj(AD(r, "generation-consent.json"));
  const a = sc.legacy ? [] : ["--sound", soundChoicesPath(r)];
  if (consent && consent.consented === true) a.push("--allow-generation");
  out({ args: a, sound: !sc.legacy, generation_consent: !!(consent && consent.consented === true) });
} else if (cmd === "controls") {
  out(controlPayload(runDir()));
} else if (cmd === "note") {
  const res = soundNoteRevision(runDir(), { text: need("text", "<the note>"), kind: str("kind") || null, shot_id: str("shot") || null, cue_id: str("cue") || null, stem: str("stem") || null, t: str("t") ? Number(str("t")) : null });
  out(res, res.ok ? 0 : 1);
} else if (cmd === "mute") {
  const flag = (k) => args[k] === true || !/^(0|false|no)$/i.test(String(args[k]));
  const res = setMuteSolo(runDir(), { stem: need("stem", "vo|music|sfx|ambience"), muted: args.mute === undefined ? undefined : flag("mute"), solo: args.solo === undefined ? undefined : flag("solo") });
  out(res, res.ok ? 0 : 1);
} else {
  die("usage: soundplan.mjs direction|cues|contract|music-fit|track|music-args|voice|voice-check|mix|controls|note|mute (see the header)");
}
