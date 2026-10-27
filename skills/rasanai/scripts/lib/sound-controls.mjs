// Studio sound controls as DATA (Plan 07 A6): what the native Storyboard / Final views show for sound, and what a sound note becomes.
// No approve-every-cue step exists or is created here; technical mix controls are in a collapsed `technical` block.
//
//   controlPayload(run, o)       audition items, mute/solo state, permitted music/voice swaps, a concise sound-note slot, collapsed technical block
//   setMuteSolo(run, change)     audition state only (audio/mix-state.json): it never changes the delivered mix or its receipt
//   soundNoteRevision(run, o)    a note ("louder music under the line", "swap the track", "drop that whoosh") -> a VERSIONED targeted revision with its
//                                timing effect (lib/impact.mjs), written to audio/revisions/rev-N.json. Nothing is applied, regenerated or retimed here.
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION } from "./contracts.mjs";
import { impact, audioScopeImpact } from "./impact.mjs";
import { readAudioContract, readDirection, sfxExpectation } from "./audio-direction.mjs";
import { cuesFresh } from "./cues.mjs";
import { HOUSE_PROFILE_ID, readReceipt, receiptMatches, currentInputs } from "./mix-receipt.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
const rjson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
function writeJson(p, o) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(o, null, 2) + "\n");
  fs.renameSync(tmp, p);
}
const STEMS = ["vo", "music", "sfx", "ambience"];
const statePath = (run) => path.join(String(run), "audio", "mix-state.json");

export const NOTE_KINDS = {
  swap_music: { stage: "storyboard", timing: true, why: "a different track changes the schedule it is edited to" },
  swap_voice: { stage: "storyboard", timing: true, why: "a different voice or model changes every line's length and pauses" },
  edit_line: { stage: "storyboard", timing: true, why: "new wording regenerates that line and may move its shot" },
  remove_cue: { stage: "final", timing: false, why: "one effect leaves the mix; the picture and the schedule hold" },
  add_cue: { stage: "final", timing: false, why: "one effect is added at a stable event; the schedule holds" },
  level: { stage: "final", timing: false, why: "a level or ducking change re-mixes; nothing upstream moves" },
  silence: { stage: "final", timing: false, why: "a protected silence window changes what auto-fill may place" },
  other: { stage: "final", timing: false, why: "a sound note with no stated structural effect" },
  // Addendum 2 (additive): plain-language requests. Each is classified to a SCOPE (lib/impact.mjs AUDIO_SCOPES) shown in `effect`; none silently changes a source or style decision.
  keep_music_audible: { stage: "final", timing: false, why: "the music stays audible under speech: a level / ducking-depth change on the music bus", scope: "gain_eq" },
  softer_effects: { stage: "final", timing: false, why: "sound effects get quieter or sparser: the effects policy changes, the picture holds", scope: "effects_policy" },
  less_percussion: { stage: "final", timing: false, why: "less percussion: real stems allow a bus change; a stereo file cannot be split, so a calmer section or a different track is proposed instead", scope: "music_section", source_dependent: true },
  calmer_section: { stage: "final", timing: false, why: "a calmer part of the same track: the music section changes, the track and style hold", scope: "music_section" },
  remove_voiceover: { stage: "storyboard", timing: true, why: "no voiceover: the script and its meaning are kept; durations, reading time and ducking are re-derived", scope: "voiceover", script_truth_kept: true },
  resolve_ending: { stage: "final", timing: false, why: "the sound ends on a clear resolution: the music tail or last section and the closing cue change", scope: "ending" },
};

// Addendum 2: five DISTINCT audio states, never folded into one "no audio" / "bad" flag. Each: { state:boolean, why }. Read from the run's files only; nothing is probed or played.
//   unresolved_rights  the track or a cue source has rights that are not granted/declared      absent_audio  audio was expected and no file exists
//   missing_stems      stems were claimed but are unverified or missing                         intentional_silence  the direction chose a silent deliverable (a decision, not a fault)
//   unvalidated_audio  there is no matching receipt with measures: the mix is not shown to be right
export const AUDIO_STATE_NAMES = Object.freeze(["unresolved_rights", "absent_audio", "missing_stems", "intentional_silence", "unvalidated_audio"]);
export function audioStates(run, { contract = null, direction = null, receipt = null, match = null } = {}) {
  const R = String(run), c = contract || readAudioContract(R), d = direction || (readDirection(R).direction || null);
  const track = rjson(path.join(R, "audio", "music-track.json")) || null;
  const silent = c.kind === "none" && !!(d && d.deliverable && d.deliverable.state === "silent_by_choice");
  const fileMissing = (f) => !f || !fs.existsSync(path.resolve(R, String(f)));
  const absent = !silent && (c.kind === "none" ? !(track && track.file) : fileMissing(c.file || (track && track.file))); // no audio and no recorded choice of silence, or a named file that is not there
  const rs = track && track.rights ? T(track.rights.status) : "";
  const byUse = track && track.rights_by_use;
  const rightsOpen = !!track && (["unreviewed", "undeclared", "unresolved", "withdrawn", "expired"].includes(rs) || (!rs && !(track.rights && (track.rights.licence || track.rights.declared_by))) || (isObj(byUse) && byUse.sync_into_film === false));
  const stemsClaimed = !!(track && track.stems && track.stems.available === true) || Object.keys(isObj(c.stems) ? c.stems : {}).filter((k) => k !== "vo").length > 0;
  const stemFiles = [...arr(track && track.stems && track.stems.files), ...Object.values(isObj(c.stems) ? c.stems : {}).map((v) => (isObj(v) ? v.file : v)).filter((v) => typeof v === "string")];
  const stemsMissing = stemsClaimed && ((track && track.stems && track.stems.available === true && track.stems.verified !== true) || stemFiles.some(fileMissing));
  const validated = !!(receipt && receipt.measures && match && match.reusable === true);
  return {
    unresolved_rights: { state: rightsOpen, why: rightsOpen ? "the music's rights are not granted or declared for use in the film (a recommendation is never consent)" : "no open rights on the recorded track" },
    absent_audio: { state: absent, why: absent ? "audio is expected and no file is present" : "no missing audio detected" },
    missing_stems: { state: stemsMissing, why: stemsMissing ? "stems are claimed but unverified or missing: the file is treated as stereo" : "no stems claimed, or all verified present" },
    intentional_silence: { state: silent, why: silent ? "silent by choice: recorded as a decision, not a failure" : "not a silent deliverable" },
    unvalidated_audio: { state: !validated, why: validated ? "a receipt with measures matches the current inputs" : "no matching measured receipt: nothing here is evidence the mix is right" },
  };
}

// o: { alternatives: {music: [{id,label,file,rights}], voice: [{id,label,file,kind}]} } (the Director's shortlist; else audio/alternatives.json)
export function controlPayload(run, { alternatives = null } = {}) {
  const R = String(run);
  const contract = readAudioContract(R), dir = readDirection(R);
  const cues = rjson(path.join(R, "motion", "cues.json")), cache = rjson(path.join(R, "audio", "voice-cache.json"));
  const state = rjson(statePath(R)) || { stems: {} };
  const alt = alternatives || rjson(path.join(R, "audio", "alternatives.json")) || {};
  const musicLed = !!contract.music_led;
  const audition = [];
  if (contract.file) audition.push({ id: "music", kind: "music", label: "Music", file: contract.file, start_s: null, end_s: null });
  for (const seg of arr(cache && cache.segments)) audition.push({ id: seg.segment_id, kind: "voice", label: seg.text ? `Line: ${seg.text.slice(0, 48)}` : "Narration line", file: seg.file, shot_id: seg.shot_id || null, start_s: seg.context && seg.context.film_start_s, end_s: seg.context && seg.format && seg.context.film_start_s != null && seg.format.duration_s != null ? seg.context.film_start_s + seg.format.duration_s : null });
  for (const c of arr(cues && cues.cues)) if (c.resolved) audition.push({ id: c.id, kind: "sfx", label: c.source && (c.source.sample || c.source.asset) || c.role, file: c.source && c.source.file || null, event_id: c.event_id, start_s: c.timing && c.timing.sfx_onset_s, end_s: null });
  const stems = Object.fromEntries(STEMS.map((s) => [s, { muted: !!(state.stems[s] && state.stems[s].muted), solo: !!(state.stems[s] && state.stems[s].solo) }]));
  const cur = currentInputs(R), rec = readReceipt(R, "delivery") || readReceipt(R, "preview");
  const match = rec ? receiptMatches(rec, cur) : null;
  return {
    schema_version: SCHEMA_VERSION,
    direction: dir.direction ? { roles: dir.direction.roles, palette: dir.direction.palette, motif: dir.direction.motif, deliverable: dir.direction.deliverable, revision: dir.direction.revision } : null,
    direction_legacy: dir.legacy || undefined,
    audio_kind: contract.kind, scratch: contract.kind === "scratch" || undefined, silent: contract.kind === "none" ? (dir.direction && dir.direction.deliverable && dir.direction.deliverable.state === "silent_by_choice" ? "silent_by_choice" : "no audio") : undefined,
    audition, stems, mute_solo_scope: "audition only: the delivered mix changes through a sound note",
    swap: {
      music: { permitted: !musicLed, blocked_reason: musicLed ? "this film is tied to its track; swapping it needs the user's authorization and changes the schedule" : null, options: arr(alt.music), effect: NOTE_KINDS.swap_music.why },
      voice: { permitted: true, options: arr(alt.voice).filter((v) => T(v.kind) !== "cloned" || (v.authorization && v.authorization.ref)), note: "a cloned voice is offered only with a recorded authorization", effect: NOTE_KINDS.swap_voice.why },
    },
    sound_note: { placeholder: "e.g. quieter music under the second line", kinds: Object.keys(NOTE_KINDS), becomes: "a versioned targeted revision that shows its timing effect" },
    approve_every_cue: false, // never a step
    technical: { collapsed: true, states: audioStates(R, { contract, direction: dir.direction || null, receipt: rec, match }), audition_excluded_from_inputs: !JSON.stringify(cur).includes("mix-state") && !("mix_state" in cur) && !("solo" in cur), profile: rec && rec.profile ? rec.profile.id : HOUSE_PROFILE_ID, cues_fresh: cuesFresh(R).fresh, mix: match ? { reusable: match.reusable, stale: match.stale } : { reusable: false, stale: ["no receipt yet"] }, sfx: sfxExpectation(dir.direction) },
  };
}

export function setMuteSolo(run, { stem, muted, solo } = {}) {
  if (!STEMS.includes(stem)) return { ok: false, error: `stem must be one of ${STEMS.join(", ")}` };
  const s = rjson(statePath(run)) || { schema_version: SCHEMA_VERSION, scope: "audition", stems: {} };
  s.stems[stem] = { muted: muted === undefined ? !!(s.stems[stem] && s.stems[stem].muted) : !!muted, solo: solo === undefined ? !!(s.stems[stem] && s.stems[stem].solo) : !!solo };
  writeJson(statePath(run), s);
  return { ok: true, scope: "audition", stems: s.stems };
}

// o: { text, kind?, shot_id?, cue_id?, stem?, t?, ids?[], note_source }  -> revision record + effect. kind is inferred from plain words when not given.
export function inferKind(text) {
  const t = T(text).toLowerCase();
  if (/\b(swap|change|different|another|replace)\b.*\b(track|song|music)\b/.test(t)) return "swap_music";
  if (/\b(swap|change|different|another|replace)\b.*\b(voice|narrator|speaker)\b/.test(t)) return "swap_voice";
  if (/\b(reword|rewrite|say|wording|pronounce|mispronounc)/.test(t)) return "edit_line";
  if (/\b(remove|drop|no|without|cut)\b.*\b(whoosh|sfx|effect|sound|click|hit|riser|impact)\b/.test(t)) return "remove_cue";
  if (/\b(add|needs?)\b.*\b(whoosh|sfx|effect|sound|click|hit|impact)\b/.test(t)) return "add_cue";
  if (/\b(silen|quiet moment|let it breathe|no sound)\b/.test(t)) return "silence";
  // Addendum 2: specific phrases before the generic `level` words (louder / softer / lower) so "softer effects" is not just a level note
  if (/\b(remove|drop|no|without|skip|turn off|get rid of)\b.*\b(voice ?over|voice-over|narration|narrator|vo)\b/.test(t) || /\b(voice ?over|narration)\b.*\b(off|away|out)\b/.test(t)) return "remove_voiceover";
  if (/\b(less|fewer|lighter|no|without|reduce|tone down)\b.*\b(percussion|drums?|beat|rhythm)\b/.test(t)) return "less_percussion";
  if (/\b(calmer|calm|quieter|gentler|softer)\b.*\b(section|part|bit|passage|stretch)\b/.test(t)) return "calmer_section";
  if (/\b(end|ending|finish|close|outro|last)\b.*\b(resolv\w*|land\w*|settle\w*|conclu\w*|cleanly|clean)\b|\b(resolv\w*|land\w*)\b.*\b(end|ending|finish|close)\b/.test(t) && /\b(sound|music|audio|track|ending|end)\b/.test(t)) return "resolve_ending";
  if (/\b(softer|quieter|lighter|fewer|less|subtler|gentler|tone down|reduce)\b.*\b(effects?|sfx|whooshes|sounds?)\b/.test(t)) return "softer_effects";
  if (/\b(keep|make|let|hear|stay)\b.*\b(music)\b.*\b(audible|heard|present|there|up|clear)\b|\bmusic\b.*\b(too (?:quiet|low|soft)|buried|drowned|inaudible|can'?t (?:hear|be heard))\b|\bcan'?t hear the music\b/.test(t)) return "keep_music_audible";
  if (/\b(louder|quieter|softer|lower|raise|duck|level|volume|mix)\b/.test(t)) return "level";
  return "other";
}
// what the music file can honestly do: real stems (verified) or a stereo file. Reads audio/music-track.json + the contract; nothing is probed.
function musicFacts(R) {
  const track = rjson(path.join(R, "audio", "music-track.json")) || {};
  const contract = readAudioContract(R);
  const named = Object.keys(contract.stems && typeof contract.stems === "object" ? contract.stems : {}).filter((k) => k !== "vo");
  const stemsVerified = !!(track.stems && track.stems.available === true && track.stems.verified === true);
  return { has_music: !!(contract.file || track.file), music_led: !!contract.music_led || !!track.music_led, stems_verified: stemsVerified, stems_claimed: !!(track.stems && track.stems.available === true) || named.length > 0, narrated: arr(contract.vo).length > 0 || !!rjson(path.join(R, "audio", "voice-cache.json")) };
}
// the effect block for a new kind: the scope, what it invalidates and keeps, what needs the user. Legacy kinds never reach this (their output is unchanged).
function scopedEffect(R, k, spec, imp, touched) {
  const f = musicFacts(R);
  let scope = spec.scope, notes = [], proposes = null, needsUser = false;
  if (k === "less_percussion") {
    if (f.stems_verified) { scope = "gain_eq"; notes.push("verified stems exist: the percussion-carrying stem is lowered on the music bus; source and style hold"); }
    else { scope = "music_section"; proposes = "this music is one stereo file with no verified stems, so percussion cannot be turned down on its own: a calmer or sparser section of the same track, or a different track, is proposed (a different track needs your say)"; needsUser = true; notes.push("no stem control exists for this file: nothing is filtered or split"); }
  }
  const sc = audioScopeImpact(scope, touched, { music_led: f.music_led, narrated: f.narrated });
  needsUser = needsUser || !!sc.needs_user;
  return {
    scope, scope_label: sc.label, scope_invalidates: sc.invalidates, scope_keeps: sc.keeps, visuals_rebuilt: sc.visuals_rebuilt,
    source_style_decision: !!sc.source_decision || (k === "less_percussion" && !f.stems_verified), needs_user: needsUser, reevaluate_edit: !!sc.reevaluate_edit,
    script_truth_kept: spec.script_truth_kept === true || undefined, proposal: proposes || undefined, notes: notes.length ? notes : undefined,
    music_facts: { stems_verified: f.stems_verified, stems_claimed: f.stems_claimed, music_led: f.music_led },
  };
}
export function soundNoteRevision(run, { text, kind = null, shot_id = null, cue_id = null, stem = null, t = null, ids = [], source = "studio" } = {}) {
  const note = T(text);
  if (!note) return { ok: false, error: "a sound note needs text" };
  const k = NOTE_KINDS[kind] ? kind : inferKind(note);
  const spec = NOTE_KINDS[k];
  const touched = [...new Set([shot_id, cue_id, stem, ...arr(ids)].filter(Boolean).map(String))];
  const imp = impact(spec.stage, touched, spec.timing ? { timing: true } : {});
  const scoped = spec.scope ? scopedEffect(String(run), k, spec, imp, touched) : null; // Addendum 2 kinds only
  const dir = path.join(String(run), "audio", "revisions");
  let n = 1;
  try { n = fs.readdirSync(dir).filter((f) => /^rev-\d+\.json$/.test(f)).length + 1; } catch {}
  const rec = {
    schema_version: SCHEMA_VERSION, revision: n, status: "requested", source, requires_approval: false, // a sound note is applied as a revision, never queued behind a cue approval
    request: { text: note, kind: k }, anchor: { shot_id, cue_id, stem, t: num(t) }, targeted: touched,
    effect: { timing_changes: spec.timing, why: spec.why, stale: imp.stale, keep: imp.keep, audio_alignment: !!imp.audio_alignment, summary: spec.timing ? `${spec.why}: the affected shots get a proposed timing revision (commitTiming); ${imp.keep.join(", ")} hold` : `${spec.why}; ${imp.keep.join(", ")} hold`,
      ...(scoped ? { ...scoped, summary: `${spec.why}. Scope: ${scoped.scope_label}; re-done: ${scoped.scope_invalidates.join(", ")}; unchanged pictures hold${scoped.needs_user ? "; needs your decision before it is applied" : ""}${scoped.proposal ? `. ${scoped.proposal}` : ""}` } : {}) },
    held_fixed: ["story", "look", ...(spec.timing ? [] : ["timing"]), ...(scoped && !scoped.source_style_decision ? ["music_source", "music_style"] : []), ...(scoped && scoped.script_truth_kept ? ["script"] : [])],
    ...(scoped && scoped.needs_user ? { requires_user_decision: true } : {}),
    created_at: new Date().toISOString(),
  };
  writeJson(path.join(dir, `rev-${n}.json`), rec);
  return { ok: true, revision: n, record: rec, file: `audio/revisions/rev-${n}.json` };
}
