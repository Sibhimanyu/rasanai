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
import { impact } from "./impact.mjs";
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
};

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
    technical: { collapsed: true, profile: rec && rec.profile ? rec.profile.id : HOUSE_PROFILE_ID, cues_fresh: cuesFresh(R).fresh, mix: match ? { reusable: match.reusable, stale: match.stale } : { reusable: false, stale: ["no receipt yet"] }, sfx: sfxExpectation(dir.direction) },
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
  if (/\b(louder|quieter|softer|lower|raise|duck|level|volume|mix)\b/.test(t)) return "level";
  return "other";
}
export function soundNoteRevision(run, { text, kind = null, shot_id = null, cue_id = null, stem = null, t = null, ids = [], source = "studio" } = {}) {
  const note = T(text);
  if (!note) return { ok: false, error: "a sound note needs text" };
  const k = NOTE_KINDS[kind] ? kind : inferKind(note);
  const spec = NOTE_KINDS[k];
  const touched = [...new Set([shot_id, cue_id, stem, ...arr(ids)].filter(Boolean).map(String))];
  const imp = impact(spec.stage, touched, spec.timing ? { timing: true } : {});
  const dir = path.join(String(run), "audio", "revisions");
  let n = 1;
  try { n = fs.readdirSync(dir).filter((f) => /^rev-\d+\.json$/.test(f)).length + 1; } catch {}
  const rec = {
    schema_version: SCHEMA_VERSION, revision: n, status: "requested", source, requires_approval: false, // a sound note is applied as a revision, never queued behind a cue approval
    request: { text: note, kind: k }, anchor: { shot_id, cue_id, stem, t: num(t) }, targeted: touched,
    effect: { timing_changes: spec.timing, why: spec.why, stale: imp.stale, keep: imp.keep, audio_alignment: !!imp.audio_alignment, summary: spec.timing ? `${spec.why}: the affected shots get a proposed timing revision (commitTiming); ${imp.keep.join(", ")} hold` : `${spec.why}; ${imp.keep.join(", ")} hold` },
    held_fixed: ["story", "look", ...(spec.timing ? [] : ["timing"])],
    created_at: new Date().toISOString(),
  };
  writeJson(path.join(dir, `rev-${n}.json`), rec);
  return { ok: true, revision: n, record: rec, file: `audio/revisions/rev-${n}.json` };
}
