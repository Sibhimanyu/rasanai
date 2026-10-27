// The user's sound choices as a resolved direction contract (Addendum 2 section 1, ledger 5.1).
//
//   audio/sound-choices.json   AUTHORED by the user (Brief fields.sound, Look action sound-direction); small, five independent choices:
//                              voiceover, pace, feeling, effects, music source. Only the user changes an `explicit` choice. Presets and
//                              recommendations initialise or suggest values; they never overwrite an explicit one and never grant consent.
//   resolveSound(...)          turns the record into the existing roles (VOICE/MUSIC/SFX/AMBIENCE roles of lib/audio-direction.mjs), the
//                              energy triple (perceived, rhythmic_density, development), conflicts[] and recommendations[]. Pure.
//
//   Consumers: lib/audio-direction.mjs directionFor/buildContract (wired, same lane), S/soundplan.mjs direction --compile and S/console.mjs
//   `sound-direction` action (ENG-INT-2, proposed), S/crew.mjs brief() + packets (ENG-INT-1, proposed), AUD-MUSIC/SFX/MIX read `resolved`.
//
//   SOUND_OPTIONS, normalizeChoices(raw, {legacy}), validateChoices(rec), setChoice(rec, key, value), resolveSound(o), PRESETS, applyPreset(rec, id),
//   choicesDigest(rec), soundChoicesPath(run), readSoundChoices(run), writeSoundChoices(run, rec)
//
// Pace is perceived energy + rhythmic density + desired development. It is NOT tempo (never BPM; a track's detected BPM is stored elsewhere) and
// fast is not cheerful: pace and feeling are independent. `feeling_custom` is free text and is carried as DATA, never as an instruction.
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest } from "./contracts.mjs";
import { SFX_BUDGET, sfxMode, sfxLimit } from "./audio.mjs"; // read-only: the cap shown to the user is the budget the checks enforce

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const rjson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
function writeJson(p, o) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(o, null, 2) + "\n");
  fs.renameSync(tmp, p);
}

export const SOUND_VERSION = 1;
export const SOUND_OPTIONS = {
  voiceover: ["with", "without", "recommend"],
  pace: ["slow", "moderate", "fast", "recommend"],
  feeling: ["calm", "warm", "playful", "bold", "dramatic", "custom", "unset"],
  effects: ["subtle", "expressive", "minimal_none", "unset"],
  music_source: ["recommend", "user_track", "none"],
};
// additive, optional: effects_floor says what Minimal/none means for this film; silent is the explicit fully-silent choice
export const EFFECTS_FLOORS = ["signature_only", "none"];
const CHOICE_KEYS = ["voiceover", "pace", "feeling", "effects", "music_source"];
const EXPLICIT_KEYS = [...CHOICE_KEYS, "feeling_custom", "user_track", "effects_floor", "silent"];
const UNSET = { voiceover: "recommend", pace: "recommend", feeling: "unset", effects: "unset", music_source: "recommend" };
const NOT_A_DECISION = new Set(["recommend", "unset"]); // "recommend for me" is a request, not a binding value
const CUSTOM_MAX = 240;

// the free text is data: control characters out, length capped, never parsed or executed
const cleanText = (x) => T(x).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, CUSTOM_MAX);

function normalizeUserTrack(x) {
  if (typeof x === "string") x = T(x) ? { file: T(x) } : null; // Studio's SoundDirection writes user_track as a path string
  if (!isObj(x)) return null;
  const file = T(x.file || x.path);
  const id = T(x.id || x.track_id);
  if (!file && !id) return null;
  return { file: file || null, id: id || null, music_led: x.music_led === true || x.role === "led" };
}

// raw: a full record ({choices, explicit, preset, ...}) or just the choices object. {legacy:true} (or no raw on an old project) returns the
// no-record state: read as before, never rewritten.
export function normalizeChoices(raw, { legacy = false } = {}) {
  if (legacy) return { version: SOUND_VERSION, legacy: true, revision: 0, source: "legacy", choices: blankChoices(), preset: null, explicit: [] };
  const r = isObj(raw) ? raw : {};
  const c = isObj(r.choices) ? r.choices : r;
  const choices = blankChoices();
  for (const k of CHOICE_KEYS) { const v = k === "voiceover" && typeof c[k] === "boolean" ? (c[k] ? "with" : "without") : T(c[k]); if (SOUND_OPTIONS[k].includes(v)) choices[k] = v; }
  choices.feeling_custom = choices.feeling === "custom" ? cleanText(c.feeling_custom) : "";
  const track = normalizeUserTrack(c.user_track);
  choices.user_track = choices.music_source === "user_track" ? track : null;
  if (EFFECTS_FLOORS.includes(T(c.effects_floor))) choices.effects_floor = T(c.effects_floor);
  if (c.silent === true) choices.silent = true;
  const source = ["user", "preset", "recommend"].includes(T(r.source)) ? T(r.source) : "user";
  let explicit;
  if (Array.isArray(r.explicit)) explicit = r.explicit.map(T).filter((k) => EXPLICIT_KEYS.includes(k));
  else explicit = source === "user" ? CHOICE_KEYS.filter((k) => !NOT_A_DECISION.has(choices[k])) : []; // no list: a user-written record binds what it decided
  // an explicit key must still hold a decision (a user who went back to "recommend" or unset released it)
  explicit = [...new Set(explicit)].filter((k) => !(CHOICE_KEYS.includes(k) && NOT_A_DECISION.has(choices[k])));
  if (choices.silent === true && !explicit.includes("silent")) explicit.push("silent");
  return {
    version: SOUND_VERSION, legacy: false,
    revision: Math.max(0, Math.floor(Number(r.revision) || 0)),
    source, choices, preset: PRESETS.some((p) => p.id === T(r.preset)) ? T(r.preset) : null,
    explicit,
  };
}
function blankChoices() { return { ...UNSET, feeling_custom: "", user_track: null }; }

export function validateChoices(rec) {
  const errors = [], warnings = [];
  if (!isObj(rec) || !isObj(rec.choices)) return { ok: false, errors: ["not a sound choices record"], warnings };
  const c = rec.choices;
  for (const k of CHOICE_KEYS) if (c[k] !== undefined && !SOUND_OPTIONS[k].includes(c[k])) errors.push(`choices.${k} ${JSON.stringify(c[k])} is not one of ${SOUND_OPTIONS[k].join(", ")}`);
  if (c.feeling === "custom" && !T(c.feeling_custom)) warnings.push("feeling is custom but feeling_custom is empty: say in a few words what it should feel like");
  if (c.music_source === "user_track" && !(isObj(c.user_track) && (c.user_track.file || c.user_track.id))) errors.push("music_source user_track needs user_track {file|id}");
  if (c.effects_floor !== undefined && !EFFECTS_FLOORS.includes(c.effects_floor)) errors.push(`choices.effects_floor ${JSON.stringify(c.effects_floor)} is not one of ${EFFECTS_FLOORS.join(", ")}`);
  for (const k of arr(rec.explicit)) if (!EXPLICIT_KEYS.includes(k)) errors.push(`explicit key ${JSON.stringify(k)} is unknown`);
  return { ok: !errors.length, errors, warnings };
}

// the user edits one choice: it becomes explicit (or is released when they go back to recommend / unset). Returns a new record.
export function setChoice(rec, key, value) {
  const base = normalizeChoices(rec);
  if (!EXPLICIT_KEYS.includes(key)) return base;
  const choices = { ...base.choices, [key]: value };
  const next = normalizeChoices({ ...base, source: "user", choices, explicit: [...base.explicit.filter((k) => k !== key), key] });
  return { ...next, preset: base.preset };
}

// ---- presets: four editable STARTING points ---------------------------------------------------------------------------------------------
// They set independent values. They never touch an explicit choice, and what they set is not explicit (the user can still move it).
export const PRESETS = [
  { id: "calm_explanation", label: "Calm explanation", note: "voiceover, a restrained bed, subtle cues",
    choices: { voiceover: "with", pace: "slow", feeling: "calm", effects: "subtle", music_source: "recommend" } },
  { id: "upbeat_product_launch", label: "Upbeat product launch", note: "energetic music, expressive selected cues; the voice choice stays yours",
    choices: { voiceover: "recommend", pace: "fast", feeling: "playful", effects: "expressive", music_source: "recommend" } },
  { id: "fast_visual_showcase", label: "Fast visual showcase", note: "no voiceover, a music-led edit",
    choices: { voiceover: "without", pace: "fast", feeling: "bold", effects: "subtle", music_source: "recommend" } },
  { id: "cinematic_reveal", label: "Cinematic reveal", note: "spacious opening, developing music, selected prominent events; the voice choice stays yours",
    choices: { voiceover: "recommend", pace: "moderate", feeling: "dramatic", effects: "expressive", music_source: "recommend" } },
];

// returns {record, applied[], kept_explicit[]}: the keys the preset set, and the explicit keys it was not allowed to touch
export function applyPreset(rec, id) {
  const base = normalizeChoices(rec);
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return { record: base, applied: [], kept_explicit: [], error: `unknown preset ${JSON.stringify(id)} (${PRESETS.map((x) => x.id).join(", ")})` };
  if (base.legacy) return { record: base, applied: [], kept_explicit: [], error: "legacy project: no sound record is created for it" };
  const choices = { ...base.choices }, applied = [], kept = [];
  for (const [k, v] of Object.entries(p.choices)) {
    if (base.explicit.includes(k)) { kept.push(k); continue; }
    if (choices[k] !== v) applied.push(k);
    choices[k] = v;
  }
  const source = base.explicit.length ? "user" : "preset";
  const record = normalizeChoices({ ...base, source, choices, preset: p.id, explicit: base.explicit });
  return { record, applied, kept_explicit: kept };
}

// what the digest covers: the decided values and which are binding. Not the revision, source or timestamps.
export function choicesDigest(rec) {
  const r = normalizeChoices(rec);
  return canonicalDigest({ choices: r.choices, explicit: r.explicit.slice().sort(), preset: r.preset, legacy: r.legacy });
}

// ---- resolution -------------------------------------------------------------------------------------------------------------------------
// o: { choices (record or raw), brief, direction, contract, format, narrated, film_s }
// -> { legacy, resolved:{voice_role, music_role, sfx_role, ambience_role, energy:{perceived, rhythmic_density, development}, music_source, effects:{choice, roles, visible_text, ...}, ...},
//      conflicts[], recommendations[{key,value,why}], explicit[], digest }
// Roles are the existing ones: VOICE carrier|optional|none, MUSIC led|bed|sparse|none, SFX causal|sparse|signature_only|none, AMBIENCE room|texture|none.
//
// Minimal/none -> sfx role `signature_only` (a declared signature move may carry one sound, up to the hero budget) unless the user chose
// effects_floor "none" (or the film is silent), then `none`. Subtle -> `sparse`. Expressive -> `causal`, selected prominent events allowed.
// Caution, read from the real code: lib/audio-direction.mjs sfxExpectation() returns required:false for signature_only, and S/sound.mjs sfx-plan
// (~346) treats ANY required:false as "no cues at all", so today signature_only behaves like none until sound.mjs keeps declared signature
// moves (patch proposed to ENG-INT-2). The visible text below says what the user is promised; `effects.consumer_gap` names the difference.
export function resolveSound(o = {}) {
  const rec = normalizeChoices(o.choices, { legacy: o.choices == null && o.legacy === true });
  if (rec.legacy) return { legacy: true, resolved: null, conflicts: [], recommendations: [], explicit: [], digest: null };
  const c = rec.choices, ex = new Set(rec.explicit);
  const brief = isObj(o.brief) ? o.brief : {}, direction = isObj(o.direction) ? o.direction : null, contract = isObj(o.contract) ? o.contract : null;
  const film_s = Number.isFinite(Number(o.film_s)) && Number(o.film_s) > 0 ? Number(o.film_s) : null;
  const format = o.format || brief.format || brief.kind || null;
  const sources = {}, conflicts = [], recommendations = [];
  const by = (k) => (ex.has(k) ? "user" : rec.preset && !NOT_A_DECISION.has(c[k]) ? "preset" : NOT_A_DECISION.has(c[k]) ? "recommendation" : "user");

  const silent = c.silent === true;
  const trackLed = !!(c.user_track && c.user_track.music_led) || !!(contract && contract.music && contract.music.music_led) || !!(direction && direction.roles && direction.roles.music && direction.roles.music.role === "led" && c.music_source === "user_track");

  // pace: perceived energy, rhythmic density, desired development. Stored apart from any detected tempo.
  let pace = c.pace;
  if (pace === "recommend") {
    pace = format === "reel" ? "fast" : "moderate";
    recommendations.push({ key: "pace", value: pace, why: format === "reel" ? "a reel is cut to a faster, denser rhythm" : "a steady middle pace unless you say slower or faster" });
  }
  sources.pace = by("pace");
  const energy = {
    perceived: { slow: "low", moderate: "medium", fast: "high" }[pace],
    rhythmic_density: { slow: "sparse", moderate: "steady", fast: "dense" }[pace],
    development: { calm: "steady", warm: "gentle_rise", playful: "playful_phrases", bold: "punctuated", dramatic: "build", custom: "steady", unset: "steady" }[c.feeling],
  };
  const feeling = { value: c.feeling, custom: c.feeling === "custom" ? { text: c.feeling_custom, treated_as: "data" } : null };
  sources.feeling = c.feeling === "unset" ? "default" : by("feeling");

  // voice
  let voice_role, voice_with;
  if (silent) { voice_role = "none"; voice_with = false; }
  else if (c.voiceover === "with") { voice_role = "carrier"; voice_with = true; }
  else if (c.voiceover === "without") { voice_role = "none"; voice_with = false; }
  else {
    const known = typeof o.narrated === "boolean" ? o.narrated : null; // an already settled answer (legacy bool or a prior resolve) is the base
    voice_with = known != null ? known : !(format === "reel" || (pace === "fast" && c.music_source !== "user_track" && format !== "explainer"));
    voice_role = voice_with ? "carrier" : "none";
    recommendations.push({ key: "voiceover", value: voice_with ? "with" : "without", why: voice_with ? "the film explains something, so a voice carries it" : "a fast, visual cut reads without a voice", consent_required: false });
  }
  sources.voiceover = silent ? "user" : by("voiceover");

  // music
  let music_role, music_source = c.music_source;
  if (silent || c.music_source === "none") { music_role = "none"; music_source = "none"; }
  else if (c.music_source === "user_track") music_role = trackLed ? "led" : "bed";
  else {
    music_role = !voice_with && pace === "fast" ? "led" : "bed"; // same default as directionFor ("bed"); led only for a fast voiceless cut
    recommendations.push({ key: "music_source", value: "licensed_or_local_first", why: "pick from the licensed and local library before anything is generated; a track you supply always wins", consent_required: false });
    recommendations.push({ key: "music_generation", value: "optional_original_music", why: "an original score is a separate, optional step", consent_required: true, spends_money: true, transmits_content: true });
  }
  sources.music_source = silent ? "user" : by("music_source");

  // effects
  const eff = c.effects;
  let sfx_role, effects_choice = eff;
  const floor = c.effects_floor === "none" ? "none" : "signature_only";
  if (silent) { sfx_role = "none"; effects_choice = "minimal_none"; }
  else if (eff === "subtle") sfx_role = "sparse";
  else if (eff === "expressive") sfx_role = "causal";
  else if (eff === "minimal_none") sfx_role = floor;
  else { // unset: the same default directionFor uses, shown as a default and recommended, not hidden
    sfx_role = voice_with ? "sparse" : "causal"; effects_choice = "unset";
    recommendations.push({ key: "effects", value: sfx_role === "sparse" ? "subtle" : "expressive", why: voice_with ? "under a voice, effects stay sparse so speech stays clear" : "without a voice, effects can carry the visual moments", consent_required: false });
  }
  sources.effects = silent ? "user" : eff === "unset" ? "default" : by("effects");
  const effects = effectsBlock(effects_choice, sfx_role, { film_s, format, narrated: voice_with, silent });

  // ambience: not a user choice here; keep what a direction already says, else none
  const ambience_role = silent ? "none" : direction && direction.roles && direction.roles.ambience && direction.roles.ambience.role || "none";

  // ---- conflicts: the user decides; nothing below is applied silently ----
  const conflict = (id, what, proposed, keys) => conflicts.push({ id, what, proposed_resolution: proposed, decided_by: "user", status: "unresolved", keys });
  if (silent && (c.voiceover === "with" || c.music_source === "user_track" || eff === "expressive" || eff === "subtle"))
    conflict("silent_vs_sound", "A fully silent film is chosen together with voiceover, a music track or effects.", "Keep the film silent (nothing else sounds), or turn Silent off and keep those choices.", ["silent", "voiceover", "music_source", "effects"].filter((k) => k === "silent" || ex.has(k)));
  if (!silent && voice_with && c.voiceover === "with" && music_role === "led")
    conflict("voice_vs_music_led", "Voiceover is on while your track leads the film (music-led: the track sets the schedule).", "Keep the voiceover and use the track as a bed under it, or keep the track leading and turn the voiceover off.", ["voiceover", "music_source"]);
  if (!silent && c.voiceover === "without" && contract && arr(contract.vo).length)
    conflict("no_voiceover_but_vo", "Voiceover is off, yet the audio contract still holds narration segments.", "Remove the narration from the contract (the script stays), or turn voiceover back on.", ["voiceover"]);
  if (!silent && c.voiceover === "with" && brief.narration === false)
    conflict("voiceover_vs_brief", "Voiceover is on here, while the Brief says no narration.", "Use the Brief value you set last; the Voiceover control is the Brief's narration field.", ["voiceover"]);
  if (rec.preset && PRESETS.find((p) => p.id === rec.preset) && PRESETS.find((p) => p.id === rec.preset).choices.effects === "expressive" && eff === "minimal_none" && ex.has("effects"))
    conflict("effects_none_vs_preset", `Effects are Minimal/none while the starting preset (${rec.preset}) is expressive.`, "Your explicit Effects choice stays; the preset only suggested a starting value.", ["effects"]);
  if (!silent && direction && direction.roles && direction.roles.sfx && direction.roles.sfx.role && ex.has("effects") && direction.roles.sfx.role !== sfx_role)
    conflict("direction_differs", `The compiled audio direction has effects role ${direction.roles.sfx.role}; your choice resolves to ${sfx_role}.`, "Recompile the audio direction from your choices (your choice is binding).", ["effects"]);
  if (!silent && direction && direction.deliverable && direction.deliverable.state === "silent_by_choice")
    conflict("direction_silent", "The audio direction records a silent film, while your choices ask for sound.", "Recompile the audio direction from your choices, or turn Silent on.", ["silent"]);

  const resolved = {
    voice_role, music_role, sfx_role, ambience_role,
    silent,
    energy, feeling, pace,
    music_source, user_track: c.music_source === "user_track" ? c.user_track : null,
    effects,
    sources, // user | preset | recommendation | default, per choice
    pending_conflicts: conflicts.length,
  };
  return { legacy: false, resolved, conflicts, recommendations, explicit: rec.explicit.slice(), digest: choicesDigest(rec) };
}

// what Effects means in exact terms, always returned as visible text (never a silent pick)
function effectsBlock(choice, role, { film_s, format, narrated, silent }) {
  const mode = sfxMode({ format: format === "reel" ? "reel" : undefined, narrated });
  const b = SFX_BUDGET[mode];
  const ceiling = film_s ? sfxLimit(mode, film_s) : null;
  const inFilm = film_s ? ` (about ${ceiling} at most in ${Math.round(film_s)} s)` : "";
  const roles = { sfx: role, requested: choice };
  const base = { choice, roles, budget_mode: mode, binding: choice !== "unset" };
  if (silent) return { ...base, visible_text: "Silent film: no effects, no music, no voice (a recorded choice, not a failure)." };
  if (role === "sparse") return { ...base, cap: { max_cues: film_s ? Math.max(1, Math.floor(ceiling / 2)) : null, hero_max: b.heroMax, share: "about half the budget, advisory" }, allow_prominent: false,
    visible_text: `Subtle (effects role: sparse). Only the moments the story leans on get a sound${film_s ? `, roughly ${Math.max(1, Math.floor(ceiling / 2))} or fewer in ${Math.round(film_s)} s` : ""}; never every visual hit. It stays subtle even if the library holds dramatic impacts.` };
  if (role === "causal") return { ...base, cap: { max_cues: ceiling, hero_max: b.heroMax }, allow_prominent: true,
    visible_text: `Expressive (effects role: causal). Visible causes get a sound${inFilm}, and selected prominent events may be big (up to ${b.heroMax} hero sounds). Still not every visual hit.` };
  if (role === "signature_only") return { ...base, cap: { max_cues: b.heroMax, hero_max: b.heroMax }, allow_prominent: false,
    visible_text: `Minimal (effects role: signature_only). Only declared signature moves may carry one sound (at most ${b.heroMax}); every other effect is off. Choose "none" instead for no effects at all.`,
    consumer_gap: "sfxExpectation() reports required:false for signature_only and S/sound.mjs sfx-plan then places no cues; until it keeps declared signature moves, Minimal behaves as none in sfx-plan." };
  if (role === "none") return { ...base, cap: { max_cues: 0, hero_max: 0 }, allow_prominent: false, visible_text: "No effects (effects role: none): nothing but the music and voice you chose." };
  return { ...base, visible_text: `Effects role ${role}.` };
}

// ---- file --------------------------------------------------------------------------------------------------------------------------------
export const soundChoicesPath = (run) => path.join(String(run), "audio", "sound-choices.json");
// no file = a legacy project (or one that never asked): {legacy:true}, nothing is written or rewritten by reading
export function readSoundChoices(run) {
  const raw = rjson(soundChoicesPath(run));
  if (!isObj(raw)) return { ok: false, legacy: true, record: normalizeChoices(null, { legacy: true }), file: null };
  const record = normalizeChoices(raw);
  return { ok: true, legacy: false, record, validation: validateChoices(record), file: "audio/sound-choices.json" };
}
// atomic (tmp + rename); the revision rises only when the decided values changed
export function writeSoundChoices(run, rec) {
  const next0 = normalizeChoices(rec);
  if (next0.legacy) return { ok: false, errors: ["a legacy record is never written"] };
  const v = validateChoices(next0);
  if (!v.ok) return { ok: false, errors: v.errors };
  const prevRaw = rjson(soundChoicesPath(run));
  const prev = isObj(prevRaw) ? normalizeChoices(prevRaw) : null;
  const revision = prev ? (prev.revision || 1) + (choicesDigest(prev) === choicesDigest(next0) ? 0 : 1) : 1;
  const next = { ...next0, revision };
  delete next.legacy;
  writeJson(soundChoicesPath(run), next);
  return { ok: true, revision, digest: choicesDigest(next), warnings: v.warnings, file: "audio/sound-choices.json" };
}
