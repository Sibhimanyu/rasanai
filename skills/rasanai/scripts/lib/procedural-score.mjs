// procedural-score: an ORIGINAL score synthesised in Node typed arrays (no samples, no network, no model, no Python), scheduled from the film-event
// manifest (motion/events.json, scripts/lib/film-events.mjs) so every musical hit sits on the picture's own absolute cue time.
//   identity  = the film's musical identity from its look and story: family, pulse (bpm), key and mode, instrument voices, signature motif, cadence
//   sections  = intro / peak / resolve from the score's music_arc cues (or the identity's own list), each with an energy and a voice set
//   hits      = the peak hit (a designed pause, then sub drop + noise crash + chord stab ON the cue), a lighter payoff accent, the final cadence
//   stems     = music, ambience, foley (causal ticks and whooshes); the mix is music + ambience (foley joins on request)
// Deterministic: the same events, identity and seed give the same bytes. Notes come from a stateless hash of (seed, key, index), never from a running
// random stream, and the output has no peak-dependent normalisation, so moving one cue moves only the sounds that belong to it (reverb tails aside,
// which are far below 24-bit resolution a few seconds later). Method, budgets and licence: references/procedural-music.md.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const SCORE_SCHEMA = 1;
export const DEFAULT_SR = 48000;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r3 = (x) => Math.round(x * 1000) / 1000;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const db = (x) => 20 * Math.log10(Math.max(1e-9, x));
export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// ---------------------------------------------------------------------------------------------------- stateless randomness
export function hash32(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
// uniform [0,1) from (seed, key, index): a pure function, so adding or moving one thing never reshuffles another
export function rnd(seed, key, i = 0) {
  let h = hash32(`${seed}|${key}|${i}`);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// a white-noise stream in [-1,1) for one named sound (seeded by the sound's own id, not its time)
function noiseGen(seed, key) {
  let a = hash32(`${seed}|n|${key}`) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; };
}
const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

// ---------------------------------------------------------------------------------------------------- the musical identity
const MODES = { major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], minor: [0, 2, 3, 5, 7, 8, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10] };
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// the same seven families music.mjs searches by (match words, tempo range), each with its own voices and shape
export const FAMILIES = {
  editorial: { match: /swiss|editorial|minimal|grid|international|clean|mono|bauhaus|type/i, bpm: [100, 120], modes: ["dorian", "minor"], lead: "pluck", pad: "glass", rhythm: "tight", bass: "sine", bright: 0.55, rt60: 0.9, prog: [[0, 5, 3, 4], [0, 3, 5, 4], [0, 2, 3, 4]], cadence: [3, 0], motifs: [[0, 3, 6, 10, 12], [0, 4, 6, 8, 12]] },
  "dark-tech": { match: /dark|neon|terminal|cyber|code|hacker|glitch|developer|night/i, bpm: [108, 126], modes: ["phrygian", "minor"], lead: "pluck", pad: "dark", rhythm: "four", bass: "tri", bright: 0.4, rt60: 1.1, prog: [[0, 0, 5, 6], [0, 6, 5, 4], [0, 3, 6, 5]], cadence: [5, 0], motifs: [[0, 2, 6, 8, 11, 14], [0, 3, 6, 10, 14]] },
  playful: { match: /playful|flat|pastel|illustrat|cartoon|friendly|toy|bouncy|kid|fun/i, bpm: [104, 120], modes: ["major", "mixolydian"], lead: "mallet", pad: "glass", rhythm: "soft", bass: "sine", bright: 0.7, rt60: 0.7, prog: [[0, 4, 5, 3], [0, 3, 4, 3], [0, 5, 3, 4]], cadence: [4, 0], motifs: [[0, 2, 4, 8, 10], [0, 3, 6, 8, 12]] },
  cinematic: { match: /luxury|cinematic|premium|elegant|apple|serif|noir|keynote|restrain/i, bpm: [72, 90], modes: ["minor", "dorian"], lead: "bell", pad: "warm", rhythm: "soft", bass: "sine", bright: 0.35, rt60: 1.6, prog: [[0, 5, 3, 4], [0, 2, 5, 4], [0, 3, 0, 4]], cadence: [3, 0], motifs: [[0, 6, 12], [0, 4, 8, 12]] },
  raw: { match: /brutal|grunge|zine|punk|raw|collage|xerox/i, bpm: [124, 140], modes: ["phrygian", "minor"], lead: "pluck", pad: "dark", rhythm: "breaks", bass: "tri", bright: 0.6, rt60: 0.5, prog: [[0, 0, 6, 5], [0, 1, 0, 6], [0, 5, 6, 0]], cadence: [6, 0], motifs: [[0, 3, 6, 9, 12], [0, 2, 3, 6, 10]] },
  retro: { match: /retro|y2k|vapor|80s|90s|synthwave|arcade|chrome/i, bpm: [112, 126], modes: ["minor", "mixolydian"], lead: "mallet", pad: "warm", rhythm: "four", bass: "tri", bright: 0.65, rt60: 1.0, prog: [[0, 5, 2, 6], [0, 3, 5, 6], [0, 6, 5, 4]], cadence: [6, 0], motifs: [[0, 4, 8, 10, 12], [0, 2, 6, 10]] },
  organic: { match: /organic|wellness|nature|calm|warm|craft|hand|paper|earth/i, bpm: [80, 100], modes: ["major", "dorian", "lydian"], lead: "mallet", pad: "warm", rhythm: "soft", bass: "sine", bright: 0.45, rt60: 1.3, prog: [[0, 3, 4, 3], [0, 5, 3, 4], [0, 2, 3, 4]], cadence: [3, 0], motifs: [[0, 4, 8, 12], [0, 3, 6, 12]] },
};
const FALLBACK = ["editorial", "organic", "cinematic"];

// identity from the film's look and story words; no event time goes in, so moving a cue never changes the key, the tempo or the motif
export function deriveIdentity(o = {}) {
  const seed = String(o.seed ?? 1);
  const words = `${o.look || ""} ${o.story || ""} ${o.family || ""}`.toLowerCase();
  let famId = o.family && FAMILIES[o.family] ? o.family : null;
  if (!famId) {
    const ranked = Object.entries(FAMILIES).map(([id, f]) => ({ id, hit: (words.match(new RegExp(f.match.source, "gi")) || []).length })).sort((a, b) => b.hit - a.hit || (a.id < b.id ? -1 : 1));
    famId = ranked[0].hit ? ranked[0].id : pick(FALLBACK, rnd(seed, "family", words));
  }
  const f = FAMILIES[famId];
  const key = `${words.trim()}|${seed}`;
  const bpm = o.bpm != null ? Number(o.bpm) : Math.round(f.bpm[0] + rnd(key, "bpm") * (f.bpm[1] - f.bpm[0]));
  const rootPc = o.root_pc != null ? Number(o.root_pc) : Math.floor(rnd(key, "root") * 12);
  const mode = o.mode && MODES[o.mode] ? o.mode : pick(f.modes, rnd(key, "mode"));
  const root = 36 + rootPc; // the tonic in octave 2 (36 = C2)
  // the signature motif: 4 to 6 notes of a rhythm template with a seeded contour; degrees are scale steps from the tonic
  const tpl = pick(f.motifs, rnd(key, "tpl"));
  let d = pick([0, 2, 4], rnd(key, "d0"));
  const motif = tpl.map((step, i) => {
    if (i) d += pick([-2, -1, 1, 2, 1], rnd(key, "mstep", i));
    d = clamp(d, -2, 9);
    const next = tpl[i + 1] != null ? tpl[i + 1] : 16;
    return { step, deg: i === tpl.length - 1 && rnd(key, "mend") < 0.6 ? pick([0, 4, 7], rnd(key, "mend2")) : d, len: Math.max(1, next - step) };
  });
  const id = {
    schema_version: SCORE_SCHEMA, family: famId, seed, bpm, key: `${NOTE_NAMES[rootPc]} ${mode}`, root, mode,
    instruments: { lead: f.lead, pad: f.pad, rhythm: f.rhythm, bass: f.bass },
    families: ["plucked", "sustained pad", "bass and percussion"],
    motif, progressions: f.prog, cadence: f.cadence, bright: f.bright, rt60: f.rt60,
    narrated: !!o.narrated, hit_event_ids: Array.isArray(o.hit_event_ids) ? o.hit_event_ids.map(String) : [],
    basis: { look: o.look || null, story: o.story || null },
  };
  if (Array.isArray(o.sections)) id.sections = o.sections;
  id.fingerprint = sha256(JSON.stringify({ ...id, basis: undefined })).slice(0, 16);
  return id;
}
// a hand-written identity file wins field by field; whatever it leaves out is derived from its look / story
export function resolveIdentity(file, over = {}) {
  let given = {};
  if (file) { given = JSON.parse(fs.readFileSync(file, "utf8")); }
  const merged = { ...given, ...Object.fromEntries(Object.entries(over).filter(([, v]) => v != null && v !== "")) };
  const base = deriveIdentity({ look: merged.look ?? given.basis?.look, story: merged.story ?? given.basis?.story, seed: merged.seed, family: merged.family, narrated: merged.narrated, hit_event_ids: merged.hit_event_ids, sections: merged.sections, bpm: merged.bpm, mode: merged.mode, root_pc: merged.root_pc });
  if (given.motif && Array.isArray(given.motif)) base.motif = given.motif;
  return base;
}

// ---------------------------------------------------------------------------------------------------- events in
// A film-event manifest ({schema_version, events[{id, at_s, kind, cue?, attrs?}], duration_s, fps}) or a plain list ({events|array of {id,t,kind}}).
export function normalizeEvents(input, { duration, fps } = {}) {
  const raw = Array.isArray(input) ? input : Array.isArray(input?.events) ? input.events : [];
  const events = raw.map((e, i) => {
    const t = Number(e.at_s ?? e.t ?? e.at ?? e.start);
    const attrs = { ...(e.attrs || {}) };
    let kind = e.kind, cue = e.cue;
    if (!["visual_hit", "music_cue", "seam", "foley_hit", "scene_start", "word_start"].includes(kind)) {
      // a plain list: "logo", "drop", "whoosh" ... are the cue kinds of picture hits (a drop / payoff / button / break is a music cue)
      const k = String(kind || e.type || e.id || "hit");
      if (/^(drop|payoff|button|intro|break)/i.test(k)) { kind = "music_cue"; cue = /_/.test(k) ? k : k + "_at"; } else { kind = "visual_hit"; attrs.cue_kind = attrs.cue_kind || k; if (e.sound) attrs.sound = e.sound; }
    }
    return { id: String(e.id ?? `${kind}-${i}`), at_s: t, frame: e.frame, kind, ...(cue ? { cue } : {}), ...(e.scene != null ? { scene: e.scene } : {}), ...(e.of ? { of: e.of } : {}), attrs };
  }).filter((e) => Number.isFinite(e.at_s) && e.at_s >= 0).sort((a, b) => a.at_s - b.at_s || (a.id < b.id ? -1 : 1));
  const dur = duration != null ? Number(duration) : Number(input?.duration_s ?? input?.duration);
  const fr = fps != null ? Number(fps) : Number(input?.fps) || 30;
  const total = Number.isFinite(dur) && dur > 0 ? dur : Math.max(1, ...events.map((e) => e.at_s)) + 1;
  return { events, duration_s: total, fps: fr };
}
const cueOf = (events, name) => { const e = events.find((x) => x.kind === "music_cue" && x.cue === name); return e ? e.at_s : null; };
const isEnd = (e) => e.kind === "visual_hit" && /^(logo|cta|end)/i.test(String(e.attrs?.cue_kind || e.id || ""));

// sections from the arc: intro [0, drop), peak [drop, payoff), resolve [payoff, end]; missing cues fall back to 40% / 75% of the film
export function sectionsFromEvents(events, duration, identity) {
  if (identity && Array.isArray(identity.sections) && identity.sections.length) {
    return identity.sections.map((s, i) => ({ name: s.name || ["intro", "peak", "resolve"][i] || `s${i + 1}`, start_s: Number(s.start_s), end_s: Number(s.end_s), energy: Number(s.energy ?? 0.5), voices: voiceSet(s.instruments, i, identity.sections.length) }));
  }
  const drop = cueOf(events, "drop_at") ?? cueOf(events, "break_end") ?? duration * 0.4;
  let payoff = cueOf(events, "payoff_at");
  if (payoff == null || payoff <= drop + 1) payoff = Math.max(drop + 1, duration * 0.75);
  const d = clamp(drop, 0.5, duration - 2), p = clamp(payoff, d + 1, duration - 0.5);
  return [
    { name: "intro", start_s: 0, end_s: r6(d), energy: 0.5, voices: new Set(["pluck", "pad"]) },
    { name: "peak", start_s: r6(d), end_s: r6(p), energy: 0.8, voices: new Set(["bass", "perc", "pluck", "pad", "lead"]) },
    { name: "resolve", start_s: r6(p), end_s: r6(duration), energy: 0.55, voices: new Set(["pad", "lead", "pluck"]) },
  ];
}
function voiceSet(list, i, n) {
  const map = { "soft-pluck": "pluck", pluck: "pluck", pad: "pad", bass: "bass", percussion: "perc", perc: "perc", melody: "lead", lead: "lead", bell: "lead" };
  const s = new Set((Array.isArray(list) ? list : []).map((x) => map[x]).filter(Boolean));
  if (!s.size) return new Set(i === 0 ? ["pluck", "pad"] : i === n - 1 ? ["pad", "lead", "pluck"] : ["bass", "perc", "pluck", "pad", "lead"]);
  return s;
}

// ---------------------------------------------------------------------------------------------------- the plan (what plays when; no audio yet)
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const degMidi = (id, deg, oct = 0) => { const m = MODES[id.mode], o = Math.floor(deg / 7), k = ((deg % 7) + 7) % 7; return id.root + 12 * (o + oct) + m[k]; };
const chordDegs = (root, seventh) => (seventh ? [root, root + 2, root + 4, root + 6] : [root, root + 2, root + 4]);

export function buildPlan(inEvents, identity, opts = {}) {
  const { events, duration_s: dur, fps } = normalizeEvents(inEvents, opts);
  const id = identity;
  const seed = id.seed;
  const beat = 60 / id.bpm, step = beat / 4, bar = beat * 4;
  const hook = normalizeArrangement(opts.arrangement);
  const sections = applyArrangementEnergy(sectionsFromEvents(events, dur, id), hook);

  // the end: the logo / cta picture event, else the arc's button, else 0.9 s before the film's end; music stops there (no music past the CTA)
  const endEv = events.filter(isEnd).sort((a, b) => b.at_s - a.at_s)[0];
  let endT = endEv ? endEv.at_s : cueOf(events, "button_at") ?? dur - 0.9;
  endT = clamp(endT, Math.min(3, dur * 0.5), dur - 0.1);
  // arrangement hook (additive): ring-out / decay may ring longer when the film leaves room; stop / cut keep the short tail. Default: the long-standing 0.95 s.
  const tailMax = hook && (hook.ending === "ring-out" || hook.ending === "decay") ? 2.4 : hook && (hook.ending === "stop" || hook.ending === "cut") ? 0.4 : 0.95;
  const tail = clamp(Math.min(tailMax, dur - endT - 0.03), Math.min(0.25, tailMax), tailMax);
  const tailEnd = Math.min(dur - 0.03, endT + tail);

  // the hits: ids the identity names, else the visual hit on the drop cue, else the drop cue itself
  const dropT = cueOf(events, "drop_at");
  const visual = events.filter((e) => e.kind === "visual_hit" && !isEnd(e));
  let hitEv = null;
  for (const hid of id.hit_event_ids) { hitEv = events.find((e) => e.id === hid); if (hitEv) break; }
  if (!hitEv && dropT != null) hitEv = visual.filter((e) => Math.abs(e.at_s - dropT) <= 0.25).sort((a, b) => Math.abs(a.at_s - dropT) - Math.abs(b.at_s - dropT))[0] || null;
  const peak = hitEv ? { id: hitEv.id, at_s: hitEv.at_s, from: "event" } : dropT != null ? { id: "music-drop", at_s: dropT, from: "music_arc.drop_at" } : null;
  const breakEv = [cueOf(events, "break_start"), cueOf(events, "break_end")];
  const pauseLen = clamp(breakEv[0] != null && breakEv[1] != null ? breakEv[1] - breakEv[0] : 2 * beat, 0.4, 1.1);
  const gates = [];
  if (peak) gates.push({ id: "pause", from: r6(Math.max(0.6, peak.at_s - pauseLen)), to: r6(peak.at_s), floor: 0.05 });
  const payoffT = cueOf(events, "payoff_at");
  if (payoffT != null && payoffT < endT - 1 && (!peak || Math.abs(payoffT - peak.at_s) > 1)) gates.push({ id: "breath", from: r6(payoffT - 0.32), to: r6(payoffT), floor: 0.12 });

  const notes = [];
  const add = (n) => { if (n.t >= 0 && n.t < dur) notes.push({ ...n, t: r6(n.t) }); };
  const inGate = (t) => gates.some((g) => t >= g.from - 1e-9 && t < g.to - 1e-9);
  const cadenceT = endT - 2 * beat;
  const prog = (si, b) => { const phrase = Math.floor(b / 4); const p = pick(id.progressions, rnd(seed, `prog|${sections[si].name}`, phrase)); return p[((b % 4) + 4) % 4]; };

  sections.forEach((s, si) => {
    const tEnd = Math.min(s.end_s, cadenceT);
    if (tEnd <= s.start_s) return;
    const nSteps = Math.floor((tEnd - s.start_s) / step + 1e-9);
    const e = s.energy, V = s.voices;
    for (let k = 0; k < nSteps; k++) {
      const t = s.start_s + k * step, b = Math.floor(k / 16), pos = k % 16;
      const root = prog(si, b);
      const tones = chordDegs(root, e > 0.6 && rnd(seed, `7th|${s.name}`, b) < 0.4);
      const skip = inGate(t);
      // pad: one chord a bar (two bars in a soft section), long attack
      if (V.has("pad") && pos === 0 && (e > 0.4 || b % 2 === 0)) {
        const span = (e > 0.4 ? 1 : 2) * bar;
        tones.slice(0, 3).forEach((dg, j) => add({ voice: "pad", t, dur: Math.min(span, tEnd - t + 0.5), midi: degMidi(id, dg, 2) - (j === 0 ? 12 : 0), vel: (0.3 + 0.35 * e) * (j === 0 ? 0.9 : 0.75), pan: [-0.35, 0.05, 0.35][j] }));
      }
      // pluck arpeggio on the eighth grid; the very first step always sounds so the film opens already playing
      if (V.has("pluck") && pos % 2 === 0 && !skip) {
        const dens = 0.2 + 0.55 * e;
        if ((si === 0 && k === 0) || rnd(seed, `pl|${s.name}`, k) < dens) {
          const r = rnd(seed, `plt|${s.name}`, k);
          const dg = tones[Math.floor(r * tones.length)] + (r > 0.7 ? 7 : 0);
          add({ voice: "pluck", t, dur: step * 3, midi: degMidi(id, dg, 3), vel: (0.32 + 0.4 * e) * (pos % 8 === 0 ? 1 : 0.8), pan: (rnd(seed, `plp|${s.name}`, k) - 0.5) * 0.7 });
        }
      }
      // bass and percussion: the peak's engine
      if (V.has("bass") && !skip && [0, 6, 8, 12, 14].includes(pos) && (pos === 0 || pos === 8 || rnd(seed, `bs|${s.name}`, k) < 0.55)) add({ voice: "bass", t, dur: step * (pos === 0 || pos === 8 ? 5 : 3), midi: degMidi(id, root, 0) + 12, vel: 0.55 + 0.35 * e, pan: 0 });
      if (V.has("perc") && !skip) {
        const style = id.instruments.rhythm;
        const kicks = style === "four" ? [0, 4, 8, 12] : style === "breaks" ? [0, 6, 10] : style === "soft" ? [0, 8] : [0, 8, 10];
        if (kicks.includes(pos)) add({ voice: "kick", t, dur: 0.3, midi: 36, vel: 0.75 + 0.2 * e, pan: 0 });
        if ((pos === 4 || pos === 12) && style !== "soft") add({ voice: "snare", t, dur: 0.2, midi: 60, vel: 0.5, pan: 0.05 });
        if (pos % 4 === 2 || (pos % 2 === 1 && rnd(seed, `gh|${s.name}`, k) < 0.3)) add({ voice: "hat", t, dur: 0.1, midi: 90, vel: pos % 4 === 2 ? 0.34 : 0.2, open: pos === 14, pan: pos % 4 === 2 ? 0.25 : -0.2 });
      }
      // the motif: the signature phrase every second bar (peak) or slow and wide (resolve), varied phrase by phrase so nothing loops
      if (V.has("lead") && (b % 2 === 0) && pos === 0 && !id.narrated && !skip) {
        const slow = e <= 0.6 ? 2 : 1, ph = Math.floor(b / 2), variant = Math.floor(rnd(seed, `mv|${s.name}`, ph) * 3);
        id.motif.forEach((m, mi) => {
          const mt = t + m.step * step * slow;
          if (mt >= tEnd - 0.05 || inGate(mt)) return;
          const deg = variant === 1 ? (mi < id.motif.length - 1 ? m.deg : m.deg + 2) : variant === 2 ? m.deg + 2 : m.deg;
          add({ voice: "lead", t: mt, dur: m.len * step * slow * 0.9, midi: degMidi(id, deg + root, 3), vel: 0.34 + 0.3 * e, pan: 0.2 });
        });
      }
    }
  });

  // the final cadence: a pre-chord two beats out, then the closing chord ON the end cue, ringing out and gone by tailEnd
  const cad = id.cadence;
  chordDegs(cad[0], false).forEach((dg, j) => add({ voice: "pad", t: cadenceT, dur: 2 * beat + 0.2, midi: degMidi(id, dg, 2), vel: 0.5, pan: [-0.3, 0, 0.3][j] }));
  add({ voice: "pluck", t: cadenceT, dur: beat, midi: degMidi(id, cad[0], 3), vel: 0.55, pan: -0.2 });
  [0, 2, 4, 7].forEach((dg, j) => add({ voice: j < 3 ? "stab" : "bell", t: endT, dur: tail, midi: degMidi(id, dg, j === 3 ? 4 : 2), vel: 0.7, pan: [-0.3, 0.3, 0, 0][j] }));
  add({ voice: "bass", t: endT, dur: tail, midi: degMidi(id, 0, 0) + 12, vel: 0.9, pan: 0 });
  add({ voice: "pluck", t: endT, dur: tail, midi: degMidi(id, 0, 3), vel: 0.7, pan: 0.1 });
  add({ voice: "lead", t: endT, dur: tail, midi: degMidi(id, 0, 3), vel: 0.6, pan: 0 });

  // the peak hit and the payoff accent: musical events with their own ids, so each can be found and moved
  const hits = [];
  if (peak) {
    const si = Math.max(0, sections.findIndex((s) => peak.at_s >= s.start_s && peak.at_s < s.end_s));
    const b = Math.max(0, Math.floor((peak.at_s - sections[si].start_s) / bar));
    const root = prog(si, b);
    hits.push({ id: peak.id, at_s: r6(peak.at_s), role: "peak", from: peak.from });
    chordDegs(root, false).concat([root + 7]).forEach((dg, j) => add({ voice: "stab", t: peak.at_s, dur: 1.6, midi: degMidi(id, dg, 3), vel: 0.55, pan: [-0.3, 0.3, -0.1, 0.1][j], key: `${peak.id}|${j}` }));
    add({ voice: "bass", t: peak.at_s, dur: 1.2, midi: degMidi(id, root, 0), vel: 0.95, pan: 0 });
    add({ voice: "impact", t: peak.at_s, dur: 2.2, midi: 38, vel: 0.8, pan: 0, key: peak.id });
    add({ voice: "swell", t: Math.max(0, peak.at_s - pauseLen * 0.55), dur: pauseLen * 0.55, midi: 70, vel: 0.5, pan: 0, key: peak.id });
  }
  if (payoffT != null && payoffT < endT - 0.5 && (!peak || Math.abs(payoffT - peak.at_s) > 1)) {
    const si = sections.findIndex((s) => payoffT >= s.start_s && payoffT < s.end_s);
    const root = prog(Math.max(0, si), 0);
    hits.push({ id: "music-payoff", at_s: r6(payoffT), role: "payoff", from: "music_arc.payoff_at" });
    chordDegs(root, false).forEach((dg, j) => add({ voice: "stab", t: payoffT, dur: 1.4, midi: degMidi(id, dg, 3), vel: 0.85, pan: [-0.3, 0.3, 0][j], key: `payoff|${j}` }));
    add({ voice: "bell", t: payoffT, dur: 1.4, midi: degMidi(id, root + 7, 3), vel: 0.8, pan: 0.2 });
    add({ voice: "bass", t: payoffT, dur: 1.1, midi: degMidi(id, root, 0), vel: 1, pan: 0 });
    add({ voice: "impact", t: payoffT, dur: 1.4, midi: 38, vel: 0.55, pan: 0, key: "payoff" });
  }

  // causal foley: only picture hits that name a sound, capped so the SFX budget in sound.mjs is never crowded
  const used = new Set();
  const foleyEvents = [];
  const sfxEvs = events.filter((e) => e.kind === "foley_hit");
  const sources = sfxEvs.length ? sfxEvs.map((e) => ({ id: e.id, at_s: e.at_s, name: e.attrs?.sound || e.attrs?.cue_kind || (events.find((x) => x.id === e.of)?.attrs?.sound) || "tick" })) : events.filter((e) => (e.kind === "visual_hit" || e.kind === "seam") && (e.attrs?.sound || e.attrs?.sfx) && !isEnd(e)).map((e) => ({ id: e.id, at_s: e.at_s, name: e.attrs.sound || e.attrs.sfx }));
  let lastF = -9;
  for (const s of sources.sort((a, b) => a.at_s - b.at_s)) {
    if (s.at_s - lastF < 0.35 || foleyEvents.length >= 10 || s.at_s > endT || used.has(s.id)) continue;
    used.add(s.id); lastF = s.at_s;
    foleyEvents.push({ id: s.id, at_s: r6(s.at_s), sound: String(s.name) });
  }
  return {
    schema_version: SCORE_SCHEMA, sr: opts.sr || DEFAULT_SR, duration_s: dur, fps, bpm: id.bpm, key: id.key, seed, identity: id,
    sections: sections.map((s) => ({ name: s.name, start_s: s.start_s, end_s: s.end_s, energy: s.energy, instruments: [...s.voices] })),
    hits, gates, pause: peak ? { ...gates[0], event: peak.id } : null,
    ending: { cue_at_s: r6(endT), tail_end_s: r6(tailEnd), from: endEv ? endEv.id : cueOf(events, "button_at") != null ? "music_arc.button_at" : "duration - 0.9 s" },
    notes, foley: foleyEvents,
    ...(hook ? { arrangement: hook } : {}),
  };
}

// ---- arrangement hooks (additive; absent = every output byte-identical) -------------------------------------------------------------------
// input: lib/music-arrangement.mjs proceduralHooks() = { energy_scale?, section_energy?: {intro|peak|resolve|<name>: 0..1}, ending?: ring-out|decay|stop|cut|resolved_cadence }.
// It only changes section energy (hence density and velocity) and the closing tail length; seeds, identity, cue times and the hit ids are untouched.
function normalizeArrangement(a) {
  if (!a || typeof a !== "object") return null;
  const h = a.procedural && typeof a.procedural === "object" ? a.procedural : a;
  const scale = Number(h.energy_scale);
  const se = h.section_energy && typeof h.section_energy === "object" ? Object.fromEntries(Object.entries(h.section_energy).map(([k, v]) => [k, clamp(Number(v), 0.1, 1)]).filter(([, v]) => Number.isFinite(v))) : null;
  const ending = ["ring-out", "decay", "stop", "cut", "resolved_cadence"].includes(h.ending) ? h.ending : null;
  const out = {};
  if (Number.isFinite(scale) && scale > 0 && scale !== 1) out.energy_scale = clamp(scale, 0.5, 1.3);
  if (se && Object.keys(se).length) out.section_energy = se;
  if (ending) out.ending = ending;
  return Object.keys(out).length ? out : null;
}
function applyArrangementEnergy(sections, hook) {
  if (!hook || (!hook.section_energy && !hook.energy_scale)) return sections;
  return sections.map((s) => {
    const base = hook.section_energy && hook.section_energy[s.name] != null ? hook.section_energy[s.name] : s.energy;
    return { ...s, energy: r6(clamp(base * (hook.energy_scale || 1), 0.1, 1)) };
  });
}

// ---------------------------------------------------------------------------------------------------- voices
// each writes a note into a stereo bus {L, R}; `wet` is the share sent to the reverb
function mk(sr, dur) { const n = Math.ceil(dur * sr) + 1; return { n, L: new Float64Array(n), R: new Float64Array(n) }; }
const panGains = (p) => { const a = (clamp(p, -1, 1) + 1) * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; };
const tri = (p) => 4 * Math.abs(p - Math.floor(p) - 0.5) - 1;

function put(bus, i, v, gl, gr) { bus.L[i] += v * gl; bus.R[i] += v * gr; }

function voicePluck(bus, sr, nt, id, kind) {
  const f = midiHz(nt.midi), i0 = Math.round(nt.t * sr), [gl, gr] = panGains(nt.pan);
  const bell = kind === "bell", mallet = kind === "mallet";
  const decay = bell ? Math.max(0.9, nt.dur * 1.1) : mallet ? 0.35 : 0.45 + 0.1 * nt.dur;
  const ratios = bell ? [1, 2.76, 5.4] : mallet ? [1, 3.9, 9.2] : [1, 2, 3];
  const amps = bell ? [1, 0.35, 0.15] : mallet ? [1, 0.4, 0.1] : [1, 0.5 * id.bright * 2, 0.25 * id.bright * 2];
  const n = Math.min(bus.n - i0, Math.round((Math.min(4, decay * 5) + 0.05) * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    for (let h = 0; h < 3; h++) s += amps[h] * Math.sin(TAU * f * ratios[h] * t) * Math.exp(-t / (decay / (1 + h * 0.7)));
    put(bus, i0 + i, s * nt.vel * 0.34 * (1 - Math.exp(-t / 0.002)), gl, gr);
  }
}
function voicePad(bus, sr, nt, id) {
  const f = midiHz(nt.midi), i0 = Math.round(nt.t * sr), [gl, gr] = panGains(nt.pan);
  const kind = id.instruments.pad;
  const atk = kind === "glass" ? 0.18 : kind === "dark" ? 0.4 : 0.3, rel = 0.55;
  const cut = (kind === "glass" ? 2600 : kind === "dark" ? 700 : 1300) * (0.6 + id.bright);
  const c = 1 - Math.exp(-TAU * cut / sr);
  const n = Math.min(bus.n - i0, Math.round((nt.dur + rel * 3) * sr));
  const det = [1, 1.0045, 0.9962];
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = (1 - Math.exp(-t / atk)) * (t < nt.dur ? 1 : Math.exp(-(t - nt.dur) / rel));
    const x = (tri(f * det[0] * t) + tri(f * det[1] * t + 0.1) + tri(f * det[2] * t + 0.3)) / 3 + 0.25 * Math.sin(TAU * f * 0.5 * t);
    lp += c * (x - lp);
    put(bus, i0 + i, lp * env * nt.vel * 0.26, gl, gr);
  }
}
function voiceBass(bus, sr, nt, id) {
  const f = midiHz(nt.midi), i0 = Math.round(nt.t * sr), [gl, gr] = panGains(nt.pan);
  const rel = 0.12, n = Math.min(bus.n - i0, Math.round((nt.dur + rel * 4) * sr));
  const tau = Math.max(0.12, nt.dur * 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / tau) * (t < nt.dur ? 1 : Math.exp(-(t - nt.dur) / rel));
    const s = Math.sin(TAU * f * t) + (id.instruments.bass === "tri" ? 0.35 * tri(f * t) : 0.2 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.15));
    put(bus, i0 + i, s * env * nt.vel * 0.42, gl, gr);
  }
}
function voiceLead(bus, sr, nt, id) {
  const f = midiHz(nt.midi), i0 = Math.round(nt.t * sr), [gl, gr] = panGains(nt.pan);
  const rel = 0.14, n = Math.min(bus.n - i0, Math.round((nt.dur + rel * 4) * sr));
  const c = 1 - Math.exp(-TAU * (1800 + 2500 * id.bright) / sr);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const vib = 1 + 0.004 * Math.sin(TAU * 5.2 * t) * (1 - Math.exp(-t / 0.3));
    const env = (1 - Math.exp(-t / 0.018)) * (t < nt.dur ? 1 : Math.exp(-(t - nt.dur) / rel));
    lp += c * (0.7 * tri(f * vib * t) + 0.3 * Math.sin(TAU * f * 2 * vib * t) - lp);
    put(bus, i0 + i, lp * env * nt.vel * 0.3, gl, gr);
  }
}
function voiceKick(bus, sr, nt, seed) {
  const i0 = Math.round(nt.t * sr), n = Math.min(bus.n - i0, Math.round(0.35 * sr)), [gl, gr] = panGains(0);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (45 + 80 * Math.exp(-t / 0.028)) / sr;
    put(bus, i0 + i, Math.sin(TAU * ph) * Math.exp(-t / 0.15) * nt.vel * 0.55 * (1 - Math.exp(-t / 0.0008)), gl, gr);
  }
}
function voiceNoiseHit(bus, sr, nt, seed, kind) {
  const i0 = Math.round(nt.t * sr), [gl, gr] = panGains(nt.pan);
  const hat = kind === "hat", tau = hat ? (nt.open ? 0.09 : 0.022) : 0.075;
  const n = Math.min(bus.n - i0, Math.round(tau * 7 * sr)), g = noiseGen(seed, `${kind}|${Math.round(nt.t * 1000)}`);
  let prev = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = g();
    let s;
    if (hat) { lp += 0.55 * ((x - prev) - lp); prev = x; s = lp; } else { lp += 0.35 * (x - lp); s = lp + 0.5 * Math.sin(TAU * 190 * t) * Math.exp(-t / 0.05); }
    put(bus, i0 + i, s * Math.exp(-t / tau) * nt.vel * (hat ? 0.22 : 0.38) * (1 - Math.exp(-t / 0.0005)), gl, gr);
  }
}
// the peak hit's body: a sub drop, a lowpassed noise crash and (separately scheduled) a chord stab; seeded by the hit's id so the sound is the same wherever it lands
function voiceImpact(bus, sr, nt, seed) {
  const i0 = Math.round(nt.t * sr), n = Math.min(bus.n - i0, Math.round(nt.dur * sr)), g = noiseGen(seed, `impact|${nt.key}`);
  let ph = 0, lp = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (34 + 40 * Math.exp(-t / 0.18)) / sr;
    const sub = Math.sin(TAU * ph) * Math.exp(-t / 0.7);
    const x = g();
    lp += 0.22 * (x - lp); lp2 += 0.04 * (lp - lp2);
    const crash = (lp - lp2) * Math.exp(-t / 0.45) * 0.9;
    const v = (sub * 0.75 + crash * 0.55) * nt.vel;
    put(bus, i0 + i, v, 0.707, 0.707);
  }
}
function voiceStab(bus, sr, nt, id) {
  const f = midiHz(nt.midi), i0 = Math.round(nt.t * sr), [gl, gr] = panGains(nt.pan);
  const n = Math.min(bus.n - i0, Math.round((nt.dur + 0.1) * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const s = (tri(f * t) * 0.6 + Math.sin(TAU * f * t) * 0.4 + 0.25 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.2)) * Math.exp(-t / (nt.dur * 0.45)) * (1 - Math.exp(-t / 0.0015));
    put(bus, i0 + i, s * nt.vel * 0.25, gl, gr);
  }
}
function voiceSwell(bus, sr, nt, seed) {
  const i0 = Math.round(nt.t * sr), n = Math.min(bus.n - i0, Math.round(nt.dur * sr)), g = noiseGen(seed, `swell|${nt.key}`);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, c = 0.02 + 0.3 * u * u;
    lp += c * (g() - lp);
    put(bus, i0 + i, lp * u * u * u * 0.12 * nt.vel, 0.707, 0.707);
  }
}

// a small stereo Schroeder room; only decaying recursion, so a note's tail is gone (below 24-bit) a few seconds on
function reverb(bus, sr, rt60) {
  const out = { n: bus.n, L: new Float64Array(bus.n), R: new Float64Array(bus.n) };
  const delays = [[0.0297, 0.0371, 0.0411, 0.0437], [0.0305, 0.0379, 0.0419, 0.0445]];
  ["L", "R"].forEach((ch, c) => {
    const combs = delays[c].map((d) => { const len = Math.round(d * sr); return { buf: new Float64Array(len), p: 0, g: Math.pow(10, -3 * d / rt60), lp: 0 }; });
    const ap = [0.005, 0.0017].map((d) => ({ buf: new Float64Array(Math.round(d * sr)), p: 0 }));
    const src = bus[ch], dst = out[ch];
    for (let i = 0; i < bus.n; i++) {
      const x = src[i];
      let y = 0;
      for (const cb of combs) { const d = cb.buf[cb.p]; cb.lp += 0.35 * (d - cb.lp); cb.buf[cb.p] = x + cb.lp * cb.g; cb.p = (cb.p + 1) % cb.buf.length; y += d; }
      y *= 0.25;
      for (const a of ap) { const d = a.buf[a.p]; const w = y + d * 0.5; a.buf[a.p] = w; y = d - w * 0.5; a.p = (a.p + 1) % a.buf.length; }
      dst[i] = y;
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------- stems
const WET = { pluck: 0.5, bell: 0.7, pad: 0.45, lead: 0.4, stab: 0.3, bass: 0.05 };
export function renderStems(plan) {
  const sr = plan.sr, dur = plan.duration_s, id = plan.identity, seed = plan.seed;
  const dry = mk(sr, dur), wet = mk(sr, dur), post = mk(sr, dur);
  const ordered = [...plan.notes].sort((a, b) => a.t - b.t || (a.voice < b.voice ? -1 : a.voice > b.voice ? 1 : a.midi - b.midi));
  for (const nt of ordered) {
    const send = WET[nt.voice] ?? 0;
    const w = send > 0 ? wet : null;
    const targets = nt.voice === "swell" ? [[post, 1]] : [[dry, 1 - send * 0.5], ...(w ? [[w, send]] : [])];
    for (const [bus, g] of targets) {
      const v = g === 1 ? nt : { ...nt, vel: nt.vel * g };
      switch (nt.voice) {
        case "pluck": voicePluck(bus, sr, v, id, id.instruments.lead === "bell" ? "pluck" : id.instruments.lead); break;
        case "bell": voicePluck(bus, sr, v, id, "bell"); break;
        case "pad": voicePad(bus, sr, v, id); break;
        case "bass": voiceBass(bus, sr, v, id); break;
        case "lead": voiceLead(bus, sr, v, id); break;
        case "kick": voiceKick(bus, sr, v, seed); break;
        case "snare": voiceNoiseHit(bus, sr, v, seed, "snare"); break;
        case "hat": voiceNoiseHit(bus, sr, v, seed, "hat"); break;
        case "impact": voiceImpact(bus, sr, v, seed); break;
        case "stab": voiceStab(bus, sr, v, id); break;
        case "swell": voiceSwell(bus, sr, v, seed); break;
      }
    }
  }
  const room = reverb(wet, sr, id.rt60);
  const music = { n: dry.n, L: new Float64Array(dry.n), R: new Float64Array(dry.n) };
  // gates (the designed pause and the breath before the payoff) and the closing fade: sample-wise gain curves, local in time
  const gain = new Float64Array(dry.n).fill(1);
  const ramp = Math.round(0.04 * sr);
  for (const g of plan.gates) {
    const a = Math.round(g.from * sr), b = Math.round(g.to * sr);
    for (let i = Math.max(0, a - ramp); i < Math.min(dry.n, b); i++) {
      const down = i < a ? (a - i) / ramp : 0; // 1 -> 0 over the ramp before the gate
      gain[i] = Math.min(gain[i], i < a ? g.floor + (1 - g.floor) * down : g.floor);
    }
  }
  const endI = Math.round(plan.ending.cue_at_s * sr), tailI = Math.round(plan.ending.tail_end_s * sr);
  for (let i = 0; i < dry.n; i++) {
    if (i >= tailI) gain[i] = 0;
    else if (i > endI + Math.round(0.12 * sr)) { const u = (i - endI - 0.12 * sr) / Math.max(1, tailI - endI - 0.12 * sr); gain[i] *= 0.5 + 0.5 * Math.cos(Math.PI * u); }
    music.L[i] = (dry.L[i] + room.L[i] * 0.55) * gain[i] + post.L[i];
    music.R[i] = (dry.R[i] + room.R[i] * 0.55) * gain[i] + post.R[i];
  }
  const amb = renderAmbience(plan);
  const foley = renderFoley(plan);
  return { music, ambience: amb, foley };
}

function renderAmbience(plan) {
  const sr = plan.sr, bus = mk(sr, plan.duration_s), seed = plan.seed, id = plan.identity;
  const gl = noiseGen(seed, "amb-l"), gr = noiseGen(seed, "amb-r");
  let a1 = 0, a2 = 0, b1 = 0, b2 = 0;
  const f0 = midiHz(id.root + 12), f5 = midiHz(id.root + 19);
  const endI = Math.round(plan.ending.cue_at_s * sr), tailI = Math.round(plan.ending.tail_end_s * sr);
  for (let i = 0; i < bus.n; i++) {
    const t = i / sr;
    const cut = 0.012 + 0.008 * Math.sin(TAU * 0.07 * t + 1.3) + 0.004 * Math.sin(TAU * 0.19 * t);
    a1 += cut * (gl() - a1); a2 += cut * (a1 - a2);
    b1 += cut * (gr() - b1); b2 += cut * (b1 - b2);
    const sec = plan.sections.find((s) => t >= s.start_s && t < s.end_s) || plan.sections[plan.sections.length - 1];
    const lvl = (sec.name === "peak" ? 0.55 : 1) * (0.9 + 0.1 * Math.sin(TAU * 0.11 * t));
    const drone = (Math.sin(TAU * f0 * t) * 0.5 + Math.sin(TAU * f5 * t + 0.5) * 0.35) * 0.012 * (0.6 + 0.4 * Math.sin(TAU * 0.05 * t));
    let env = i >= tailI ? 0 : 1;
    if (i > endI) env *= 0.5 + 0.5 * Math.cos(Math.PI * clamp((i - endI) / Math.max(1, tailI - endI), 0, 1));
    const fadeIn = 1 - Math.exp(-t / 0.05);
    bus.L[i] = (a2 * 0.32 * lvl + drone) * env * fadeIn;
    bus.R[i] = (b2 * 0.32 * lvl + drone * 0.9) * env * fadeIn;
  }
  return bus;
}

// causal foley: a short sound for each picture event that names one, at that event's own time
const FOLEY = [
  [/whoosh|swipe|slide|swoosh|transition|push|pan/i, "whoosh"],
  [/key|type|tap|click|press|tick|count|button/i, "click"],
  [/reveal|logo|land|hit|impact|thud|pop|drop|slam|payoff/i, "thud"],
];
function renderFoley(plan) {
  const sr = plan.sr, bus = mk(sr, plan.duration_s), seed = plan.seed;
  for (const f of plan.foley) {
    const kind = (FOLEY.find(([re]) => re.test(f.sound)) || [0, "click"])[1], g = noiseGen(seed, `foley|${f.id}`);
    if (kind === "click") {
      const i0 = Math.round(f.at_s * sr), n = Math.min(bus.n - i0, Math.round(0.06 * sr));
      let prev = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, x = g(); const hp = x - prev; prev = x; const v = (hp * Math.exp(-t / 0.004) * 0.5 + Math.sin(TAU * 1700 * t) * Math.exp(-t / 0.012) * 0.45) * 0.45; bus.L[i0 + i] += v * 0.8; bus.R[i0 + i] += v * 0.9; }
    } else if (kind === "thud") {
      const i0 = Math.round(f.at_s * sr), n = Math.min(bus.n - i0, Math.round(0.5 * sr));
      let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; ph += (60 + 70 * Math.exp(-t / 0.05)) / sr; const v = Math.sin(TAU * ph) * Math.exp(-t / 0.16) * 0.55 * (1 - Math.exp(-t / 0.001)); bus.L[i0 + i] += v; bus.R[i0 + i] += v; }
    } else {
      // a whoosh crests ON its event: the sweep is written backwards from the cue so the loudest instant is the cue sample
      const len = Math.round(0.34 * sr), i1 = Math.round(f.at_s * sr), i0 = Math.max(0, i1 - len);
      let b1 = 0, b2 = 0;
      for (let i = i0; i < Math.min(bus.n, i1 + Math.round(0.12 * sr)); i++) {
        const u = (i - i0) / len, c = 0.02 + 0.28 * Math.min(1, u), x = g();
        b1 += c * (x - b1); b2 += c * (b1 - b2);
        const env = u <= 1 ? Math.pow(Math.max(0, u), 2) : Math.exp(-(u - 1) * len / sr / 0.05);
        const v = (b1 - b2) * 3 * env * 0.5; bus.L[i] += v; bus.R[i] += v;
      }
    }
  }
  return bus;
}

// ---------------------------------------------------------------------------------------------------- mix, WAV out
export const GAIN = { music: 0.78, ambience: 1.0, foley: 0.7 };
export function mixdown(stems, { foley = false } = {}) {
  const n = stems.music.n, L = new Float64Array(n), R = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let l = stems.music.L[i] * GAIN.music + stems.ambience.L[i] * GAIN.ambience, r = stems.music.R[i] * GAIN.music + stems.ambience.R[i] * GAIN.ambience;
    if (foley) { l += stems.foley.L[i] * GAIN.foley; r += stems.foley.R[i] * GAIN.foley; }
    L[i] = Math.tanh(l); R[i] = Math.tanh(r); // memoryless soft limit: keeps peaks off full scale without touching anything else
  }
  return { n, L, R };
}
export function scaleBus(bus, g) { const L = new Float64Array(bus.n), R = new Float64Array(bus.n); for (let i = 0; i < bus.n; i++) { L[i] = Math.tanh(bus.L[i] * g); R[i] = Math.tanh(bus.R[i] * g); } return { n: bus.n, L, R }; }

// 24-bit PCM stereo WAV, exactly `frames` frames
export function wavBytes(bus, sr, frames) {
  const n = frames ?? bus.n, data = Buffer.alloc(n * 6);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
    const x = clamp(i < bus.n ? (c ? bus.R[i] : bus.L[i]) : 0, -1, 1);
    const v = Math.round(x * 8388607);
    data.writeIntLE(v, i * 6 + c * 3, 3);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 6, 28); h.writeUInt16LE(6, 32); h.writeUInt16LE(24, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
// decode a PCM / float WAV (16, 24, 32 bit int or 32 float); anything else is the caller's job (ffmpeg)
export function readWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const tag = buf.toString("ascii", p, p + 4); let sz = buf.readUInt32LE(p + 4);
    if (tag === "fmt ") fmt = { code: buf.readUInt16LE(p + 8), ch: buf.readUInt16LE(p + 10), sr: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (tag === "data") { if (p + 8 + sz > buf.length) sz = buf.length - p - 8; data = buf.subarray(p + 8, p + 8 + sz); break; }
    p += 8 + sz + (sz & 1);
  }
  if (!fmt || !data) return null;
  if (fmt.code === 0xfffe) fmt.code = buf.readUInt16LE(36) || 1;
  const bps = fmt.bits / 8, frames = Math.floor(data.length / (bps * fmt.ch));
  const chans = Array.from({ length: fmt.ch }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.ch; c++) {
    const o = (i * fmt.ch + c) * bps;
    let v;
    if (fmt.code === 3 && fmt.bits === 32) v = data.readFloatLE(o);
    else if (fmt.bits === 16) v = data.readInt16LE(o) / 32768;
    else if (fmt.bits === 24) v = data.readIntLE(o, 3) / 8388608;
    else if (fmt.bits === 32) v = data.readInt32LE(o) / 2147483648;
    else return null;
    chans[c][i] = v;
  }
  return { sr: fmt.sr, channels: chans, frames };
}

// ---------------------------------------------------------------------------------------------------- provenance
export function provenance(plan) {
  return {
    origin: "procedural",
    generator: "RasanAI scripts/lib/procedural-score.mjs",
    license: "Original work generated on this machine from code; no third-party recording, sample, model or provider is used. No credit is required.",
    copyright_holder: "the film's owner",
    samples_used: [],
    sample_library: "none: no licence-verified instrument sample library ships with the skill (library/sfx holds UI and impact one-shots that sound.mjs sfx-plan places); every voice is a sine, triangle or filtered-noise synthesis",
    quality_downgrade: "synthesised sine / triangle / noise voices, not sampled instruments: clean and in time, but thinner than a produced track. Pick a real or licensed track (--track) when the film deserves one; the user's own track always wins",
    credits: "Music: original score generated by RasanAI (no third-party material, no credit needed)",
    seed: plan.seed, identity: plan.identity.fingerprint,
  };
}

// the one call: events + identity -> stems, mix, sidecar (plan + provenance + the sound.mjs plan that carries the wav through fit/render)
export function renderScore(inEvents, identity, opts = {}) {
  const plan = buildPlan(inEvents, identity, opts);
  const stems = renderStems(plan);
  const frames = Math.round(plan.duration_s * plan.sr);
  const mix = mixdown(stems, { foley: !!opts.withFoley });
  return { plan, stems, mix, frames, wav: wavBytes(mix, plan.sr, frames), provenance: provenance(plan) };
}

// the plan sound.mjs fit / render take for a track that is already the film's length and built to its events (never re-cut on bar lines: that would move the hits)
export function identityPlan(trackFile, plan) {
  const D = plan.duration_s;
  return { track: path.resolve(trackFile), shape: "procedural-exact", film_duration: D, segments: [{ src_in: 0, src_out: D, film_start: 0, film_end: D }], joins: [], why: "an original procedural score rendered to this film's own event times: it is already the film's length, so it is not re-cut", origin: "procedural", moments: { logo: { t: plan.ending.cue_at_s }, ...(plan.hits[0] ? { reveal: { t: plan.hits[0].at_s } } : {}) } };
}
export const sidecarPath = (wav) => String(wav).replace(/\.[^.\\/]+$/, "") + ".score.json";
export function readSidecar(wav) {
  try { const j = JSON.parse(fs.readFileSync(sidecarPath(wav), "utf8")); return j && j.origin === "procedural" && j.schema_version === SCORE_SCHEMA ? j : null; } catch { return null; }
}
export { r3, db };
