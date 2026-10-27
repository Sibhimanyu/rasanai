// Audio direction brief and the audio contract (Plan 07 A1, and the contract Plan 05 E5 waited for).
//
//   audio/direction.json   AUTHORED, small: the role of voice, music, sound effects, ambience and intentional silence for THIS film, a limited sonic
//                          palette, an optional recurring motif, protected silence windows, and what the deliverable is allowed to be (a silent film is
//                          a valid deliverable, distinct from an audio generation that failed).
//   audio/contract.json    what the film's audio IS (kind selected|scratch|none, music track, narration segments per shot, stems, digests). It
//                          replaces Plan 05's plain storyboard/audio.json; readAudioContract() still reads that old file (legacy: true).
//   Timing is NEVER stored here: cues point at stable event ids and their film time is derived from motion/score.json (lib/cues.mjs, lib/timing.mjs).
//
//   directionFor(o), validateDirection(d), readDirection(run), writeDirection(run, d), silenceWindows(d, events), sfxExpectation(d)
//   deliverableState(o), buildContract(o), readAudioContract(run), writeAudioContract(run, c), contractForStoryboard(c)
//   Addendum 2 (additive): directionFor accepts o.sound / o.sound_choices (lib/sound-choices.mjs), stamps mix_policy_revision 2 and a `sound` block ONLY
//   for new work that carries them; soundDirectionOf(d), rolesFromResolved(resolved). No sound input = byte-identical output.
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";
import { resolveSound, normalizeChoices, validateChoices } from "./sound-choices.mjs";

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

export const VOICE_ROLES = ["carrier", "optional", "none"];
export const MUSIC_ROLES = ["led", "bed", "sparse", "none"]; // led: the track IS the schedule
export const SFX_ROLES = ["causal", "sparse", "signature_only", "none"];
export const AMBIENCE_ROLES = ["room", "texture", "none"];
export const SILENCE_KINDS = ["emotional", "breath", "pre_payoff", "hold", "dialogue_space"];
export const MAX_PALETTE = 6;

// ---- A1: compile the brief --------------------------------------------------------------------------------------------------------------
// o: { narrated, music_led, music, sfx, ambience, silent, silent_reason, palette[], motif, silence_windows[], communication_kind, look_motif_refs[], film_s }
// Defaults are labelled (defaults_applied) so a reader can tell a decision from a fallback. Nothing here asks for an effect on every visual hit.
export function directionFor(o0 = {}) {
  const snd = soundInput(o0);
  const o = snd ? mergeSound(o0, snd) : o0;
  const narrated = !!o.narrated;
  const silent = !!o.silent;
  const defaults = [];
  const pick = (v, allowed, dflt, name) => { const s = T(v); if (allowed.includes(s)) return s; defaults.push(name); return dflt; };
  const voice = silent ? "none" : pick(o.voice, VOICE_ROLES, narrated ? "carrier" : "none", "voice");
  const music = silent ? "none" : o.music_led ? "led" : pick(o.music, MUSIC_ROLES, "bed", "music");
  const sfx = silent ? "none" : pick(o.sfx, SFX_ROLES, narrated ? "sparse" : "causal", "sfx");
  const ambience = silent ? "none" : pick(o.ambience, AMBIENCE_ROLES, "none", "ambience");
  const palette = arr(o.palette).map(T).filter(Boolean).slice(0, MAX_PALETTE);
  const motif = isObj(o.motif) && T(o.motif.description) ? { id: T(o.motif.id) || "motif", description: T(o.motif.description), recurs_at: arr(o.motif.recurs_at).map(String), look_ref: T(o.motif.look_ref) || null } : null;
  const out = {
    schema_version: SCHEMA_VERSION,
    revision: Math.max(1, Math.floor(num(o.revision, 1))),
    communication_kind: T(o.communication_kind) || null,
    roles: {
      voice: { role: voice, note: T(o.voice_note) || undefined },
      music: { role: music, note: T(o.music_note) || undefined },
      sfx: { role: sfx, every_visual_hit: false, note: T(o.sfx_note) || undefined }, // a visual hit is never owed an effect
      ambience: { role: ambience },
      silence: { role: arr(o.silence_windows).length ? "intentional" : "none" },
    },
    palette, // a few sonic ingredients (e.g. "soft glass taps", "low pad"), not a library
    motif,
    look_motif_refs: arr(o.look_motif_refs).map(String),
    silence_windows: arr(o.silence_windows).map((w, i) => silenceWindow(w, i)),
    deliverable: silent
      ? { state: "silent_by_choice", reason: T(o.silent_reason) || "" }
      : { state: "with_audio", reason: "" },
    defaults_applied: defaults,
    film_s: num(o.film_s),
  };
  if (snd) { out.mix_policy_revision = 2; out.sound = soundBlock(snd); }
  return out;
}

// ---- Addendum 2: the user's sound choices ---------------------------------------------------------------------------------------------------
// The existing role resolution used by lib/sound-choices.mjs, as directionFor opts. Pure.
export function rolesFromResolved(r) {
  if (!isObj(r)) return {};
  return { voice: r.voice_role, music: r.music_role === "led" ? undefined : r.music_role, music_led: r.music_role === "led", sfx: r.sfx_role, ambience: r.ambience_role, narrated: r.voice_role === "carrier", silent: !!r.silent };
}
// o.sound / o.sound_choices: a record or raw choices. Legacy (no record) resolves to nothing: no stamp, no change.
function soundInput(o) {
  const raw = o && (o.sound || o.sound_choices);
  if (!isObj(raw)) return null;
  const rec = normalizeChoices(raw);
  if (rec.legacy) return null;
  const res = resolveSound({ choices: rec, brief: o.brief, direction: null, contract: o.contract, format: o.format, narrated: typeof o.narrated === "boolean" ? o.narrated : undefined, film_s: o.film_s });
  if (res.legacy || !res.resolved) return null;
  return { rec, res };
}
// explicit choices bind; a recommended or preset value only fills what the caller left unsaid
function mergeSound(o, { rec, res }) {
  const ex = new Set(rec.explicit), r = res.resolved, f = rolesFromResolved(r), m = { ...o };
  if (r.silent) { m.silent = true; m.silent_reason = T(o.silent_reason) || "silent by the user's sound choices"; return m; }
  if (ex.has("voiceover") || T(o.voice) === "") m.voice = f.voice;
  if (ex.has("voiceover") || o.narrated === undefined) m.narrated = f.narrated;
  if (ex.has("music_source") || (o.music === undefined && !o.music_led)) { m.music = f.music; m.music_led = f.music_led; }
  if (ex.has("effects") || T(o.sfx) === "") m.sfx = f.sfx;
  if (T(o.ambience) === "") m.ambience = f.ambience;
  return m;
}
const soundBlock = ({ rec, res }) => ({
  digest: res.digest, revision: rec.revision || 0, preset: rec.preset, explicit: res.explicit, choices: rec.choices,
  resolved: { voice_role: res.resolved.voice_role, music_role: res.resolved.music_role, sfx_role: res.resolved.sfx_role, ambience_role: res.resolved.ambience_role, energy: res.resolved.energy, music_source: res.resolved.music_source, effects: { choice: res.resolved.effects.choice, visible_text: res.resolved.effects.visible_text } },
  conflicts: res.conflicts.map((c) => c.id), // the full entries come from resolveSound; the record keeps only that they exist
});
// the sound block of a direction (or null for a legacy / pre-sound one)
export const soundDirectionOf = (d) => (isObj(d) && isObj(d.sound) ? d.sound : null);
function silenceWindow(w, i) {
  const x = isObj(w) ? w : {};
  return {
    id: T(x.id) || `silence-${i + 1}`,
    kind: SILENCE_KINDS.includes(T(x.kind)) ? T(x.kind) : "emotional",
    start_s: num(x.start_s), end_s: num(x.end_s), // film time, [start, end)
    around_event: T(x.around_event) || null, before_s: num(x.before_s, 0.5), after_s: num(x.after_s, 0.5), // or: this much clear air around a stable event id
    why: T(x.why),
    allow: arr(x.allow).map(String), // cue ids that may sound inside it on purpose
  };
}

export function validateDirection(d) {
  const errors = [], warnings = [];
  if (!isObj(d)) return { ok: false, errors: ["not an object"], warnings };
  const r = isObj(d.roles) ? d.roles : {};
  const chk = (k, allowed) => { const v = r[k] && r[k].role; if (v !== undefined && !allowed.includes(v)) errors.push(`roles.${k}.role ${JSON.stringify(v)} is not one of ${allowed.join(", ")}`); };
  chk("voice", VOICE_ROLES); chk("music", MUSIC_ROLES); chk("sfx", SFX_ROLES); chk("ambience", AMBIENCE_ROLES);
  if (arr(d.palette).length > MAX_PALETTE) errors.push(`the sonic palette is limited to ${MAX_PALETTE} ingredients (it has ${d.palette.length})`);
  if (d.motif && !arr(d.motif.recurs_at).length) warnings.push("a motif that never recurs is not a motif: name where it returns, or drop it");
  for (const w of arr(d.silence_windows)) {
    if (!T(w.why)) errors.push(`silence window ${w.id}: say why (emotional silence is a choice; dead air is an accident)`);
    const timed = w.start_s != null && w.end_s != null && w.end_s > w.start_s;
    if (!timed && !w.around_event) errors.push(`silence window ${w.id}: needs start_s/end_s or around_event`);
  }
  if (d.mix_policy_revision !== undefined && ![1, 2].includes(d.mix_policy_revision)) errors.push(`mix_policy_revision ${JSON.stringify(d.mix_policy_revision)} is not one of 1, 2`);
  if (d.sound !== undefined) {
    if (!isObj(d.sound)) errors.push("sound must be an object");
    else {
      if (d.sound.choices !== undefined) { const sv = validateChoices({ choices: d.sound.choices, explicit: d.sound.explicit }); for (const e of sv.errors) errors.push(`sound: ${e}`); for (const w of sv.warnings) warnings.push(`sound: ${w}`); }
      const rs = d.sound.resolved && d.sound.resolved.sfx_role;
      if (rs && r.sfx && r.sfx.role && rs !== r.sfx.role && arr(d.sound.explicit).includes("effects")) warnings.push(`sound: the user's Effects choice resolves to ${rs} but roles.sfx.role is ${r.sfx.role}: the user's choice is binding, recompile`);
    }
  }
  if (d.deliverable && d.deliverable.state === "silent_by_choice" && !T(d.deliverable.reason)) errors.push("a silent deliverable needs a reason (it is a decision, recorded; not a failure)");
  if (r.sfx && r.sfx.every_visual_hit === true) warnings.push("every_visual_hit is on: not every visual hit should have an effect");
  return { ok: !errors.length, errors, warnings };
}

// resolved silence windows in film time. events: [{id, t}] (lib/timing.mjs eventsFromScore .events). An unresolvable around_event is reported, never guessed.
export function silenceWindows(d, events = []) {
  const byId = new Map(arr(events).map((e) => [e.id, e]));
  const out = [], unresolved = [];
  for (const w of arr(d && d.silence_windows)) {
    if (w.start_s != null && w.end_s != null && w.end_s > w.start_s) { out.push({ ...w, start_s: Number(w.start_s), end_s: Number(w.end_s) }); continue; }
    const ev = w.around_event && byId.get(w.around_event);
    if (!ev) { unresolved.push({ id: w.id, around_event: w.around_event || null }); continue; }
    out.push({ ...w, start_s: Math.max(0, ev.t - num(w.before_s, 0.5)), end_s: ev.t + num(w.after_s, 0.5) });
  }
  return { windows: out, unresolved };
}

// what the sound check may demand. A film of any length is allowed zero effects when the direction says so; the old "15 s or more needs SFX"
// rule applies only when the direction asks for effects (or there is no direction: a legacy run).
export function sfxExpectation(d) {
  if (!isObj(d) || !isObj(d.roles)) return { required: null, why: "no audio direction (legacy run): the legacy density rules apply" };
  if (d.deliverable && d.deliverable.state === "silent_by_choice") return { required: false, silent_by_choice: d.deliverable.reason || "silent deliverable", why: "the audio direction chose a silent deliverable" };
  const role = d.roles.sfx && d.roles.sfx.role;
  if (role === "none") return { required: false, silent_by_choice: "the audio direction gives sound effects no role in this film", why: "sfx role none" };
  return { required: role === "causal" || role === "sparse", role, why: `sfx role ${role || "unspecified"}` };
}

// silent-by-choice, generation failure and "not made yet" are three different states
// o: { direction, audio_files: [..produced], generation: { attempted, errors[] }, expected }
export function deliverableState({ direction = null, audio_files = [], generation = {}, expected = null } = {}) {
  const produced = arr(audio_files).filter(Boolean);
  const errs = arr(generation.errors).filter(Boolean);
  const silentChoice = direction && direction.deliverable && direction.deliverable.state === "silent_by_choice";
  if (silentChoice && !produced.length) return { state: "silent_by_choice", complete: true, reason: direction.deliverable.reason || "", note: "a silent film is complete; nothing failed" };
  if (produced.length) return { state: "with_audio", complete: true, files: produced.length };
  const wanted = expected != null ? expected : !!(direction && direction.deliverable && direction.deliverable.state === "with_audio");
  if (wanted && (generation.attempted || errs.length)) return { state: "generation_failed", complete: false, errors: errs, note: "audio was wanted and the attempt produced nothing: this is a failure to report and retry, not a silent deliverable" };
  if (wanted) return { state: "pending", complete: false, note: "audio is wanted and has not been made yet" };
  return { state: "unspecified", complete: true, note: "no audio direction and no audio: a no-VO, no-music film is complete as it stands" };
}

// ---- files ------------------------------------------------------------------------------------------------------------------------------
export const directionPath = (run) => path.join(String(run), "audio", "direction.json");
export const contractPath = (run) => path.join(String(run), "audio", "contract.json");
export const legacyAudioPath = (run) => path.join(String(run), "storyboard", "audio.json");
export function readDirection(run) {
  const d = rjson(directionPath(run));
  if (d) return { ok: true, legacy: false, direction: d, validation: validateDirection(d) };
  // an older run: derive a bare direction from the storyboard's per-shot sound_intent, never inventing roles
  const sb = rjson(path.join(String(run), "storyboard", "storyboard.json"));
  const intents = arr(sb && sb.shots).map((s) => s && s.sound_intent && s.sound_intent.role).filter(Boolean);
  return { ok: false, legacy: true, direction: null, derived_intents: [...new Set(intents)], note: "no audio/direction.json: legacy run, the legacy sound rules apply" };
}
export function writeDirection(run, d) {
  const v = validateDirection(d);
  if (!v.ok) return { ok: false, errors: v.errors };
  const prev = rjson(directionPath(run));
  const next = { ...d, revision: prev ? (prev.revision || 1) + (canonicalDigest({ ...prev, revision: 0 }) === canonicalDigest({ ...d, revision: 0 }) ? 0 : 1) : d.revision || 1 };
  writeJson(directionPath(run), next);
  return { ok: true, revision: next.revision, warnings: v.warnings, file: "audio/direction.json" };
}

// ---- the audio contract -------------------------------------------------------------------------------------------------------------------
// o: { kind, music: {file, track_id, music_led, sections:[{shot_id,start_s,end_s}], digest, rights_ref}, vo: [{shot_id, segment_id, file, start_s, end_s}], stems: {vo, music, sfx, ambience: path},
//      direction_digest, sound: direction.sound block or a resolveSound() result (optional; carried into the contract with its digest) }
// The flat fields (kind, file, music_led, sections, vo) are the Plan 05 shape, so storyboard.mjs reconcile/makeSnapshot read it unchanged.
export function buildContract(o = {}) {
  const kind = ["selected", "scratch", "none"].includes(o.kind) ? o.kind : "none";
  const m = isObj(o.music) ? o.music : {};
  const vo = arr(o.vo).map((x) => ({ shot_id: x.shot_id, segment_id: x.segment_id || null, file: x.file || null, start_s: num(x.start_s), end_s: num(x.end_s) }));
  const c = {
    schema_version: SCHEMA_VERSION, kind,
    file: m.file || o.file || null, music_led: !!m.music_led, sections: arr(m.sections),
    vo,
    music: { file: m.file || null, track_id: m.track_id || null, music_led: !!m.music_led, rights_ref: m.rights_ref || null, digest: m.digest || null },
    stems: isObj(o.stems) ? o.stems : {},
    direction_digest: o.direction_digest || null,
    scratch: kind === "scratch",
    label: kind === "scratch" ? "scratch audio: timings provisional, the final voice is not approved by this" : kind === "none" ? "silent preview: no audio" : "selected audio",
  };
  const sn = contractSound(o.sound);
  if (sn) { c.sound = sn; c.mix_policy_revision = 2; } // Final controls read this; absent for legacy / pre-sound contracts
  c.digest = canonicalDigest({ kind: c.kind, music: c.music, vo: c.vo.map((v) => [v.shot_id, v.segment_id, v.start_s, v.end_s]), stems: c.stems, ...(sn ? { sound_digest: sn.digest } : {}) });
  return c;
}
// accepts a direction.sound block or a resolveSound() result; anything else adds nothing
function contractSound(x) {
  if (!isObj(x) || !x.digest || !isObj(x.resolved)) return null;
  const r = x.resolved;
  const res = r.effects && r.voice_role ? { voice_role: r.voice_role, music_role: r.music_role, sfx_role: r.sfx_role, ambience_role: r.ambience_role, energy: r.energy, music_source: r.music_source, effects: { choice: r.effects.choice, visible_text: r.effects.visible_text } } : r;
  return { digest: x.digest, revision: num(x.revision, 0), preset: x.preset || null, explicit: arr(x.explicit), resolved: res, conflicts: arr(x.conflicts).map((c) => (isObj(c) ? c.id : c)) };
}
// reads the new contract, else Plan 05's storyboard/audio.json (flagged legacy), else silence. Never throws.
export function readAudioContract(run) {
  const c = rjson(contractPath(run));
  if (isObj(c)) return { ...c, legacy: false, source: "audio/contract.json" };
  const l = rjson(legacyAudioPath(run));
  if (isObj(l)) return { kind: ["selected", "scratch", "none"].includes(l.kind) ? l.kind : "none", file: l.file || null, music_led: !!l.music_led, sections: arr(l.sections), vo: arr(l.vo), stems: {}, legacy: true, source: "storyboard/audio.json" };
  return { kind: "none", file: null, music_led: false, sections: [], vo: [], stems: {}, legacy: false, source: null };
}
export function writeAudioContract(run, c) {
  writeJson(contractPath(run), c);
  return { ok: true, file: "audio/contract.json", digest: c.digest || null };
}
// the Plan 05 shape, for storyboard.mjs timing --audio and makeSnapshot
export const contractForStoryboard = (c) => ({ kind: c.kind, file: c.file || null, music_led: !!c.music_led, sections: arr(c.sections), vo: arr(c.vo), digest: c.digest || undefined });
