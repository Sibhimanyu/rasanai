#!/usr/bin/env node
// Sound for the film: music edited to picture, SFX on a budget, and a measured mix check.
// Pure Node + ffmpeg/ffprobe (no Python, no npm). The playbook: references/sound.md.
//
//   node sound.mjs analyze --track <file> [--full]
//       -> {duration, bpm, beat_s, bar_s, bars, bar_db, sections, strong_sections,
//           start_candidates, ending{natural,type,hit,last_audible,tail_s}, loudness, usable, problems}
//   node sound.mjs fit --track <file> [--film <s>] [--scenes scenes.json|timeline.json]
//        [--reveal <s>] [--logo <s>] [--flex 1] [--soft-start] [--out plan.json] [--write-scenes <file>]
//       -> an edit plan that never loops audibly: shape (backtimed | head+tail | own-fade | button |
//          fade | repeat), segments, joins, the film-time bar grid, the reveal/logo moved onto the
//          music, and scene starts snapped to bars. needs_longer: true when the track is too short.
//       Plan 07: analyze adds `estimates` (tempo detected | uncertain | undetected, never a made-up BPM); fit adds `estimates` and `guard` (track too short, an undeclared repeat,
//       a music-led trim [--music-led, --trim-authorized], --user-track, --loop-declared); a failed guard exits 2 unless --allow-guard
//   node sound.mjs render --plan plan.json --out bed.wav [--lufs -14]
//       -> renders the edited bed (atrim/acrossfade/afade), -14 LUFS, true peak <= -1.5 dBTP
//   node sound.mjs render --plan plan.json --out bed.wav --loop [--loop-xfade 0.35]      (idea from awesome-opus5-5-videos; our code)
//   node sound.mjs loop-bed --plan plan.json --in bed.wav --out loop.wav [--loop-xfade 0.35]
//       -> a declared loop (--loop, or plan.loop: true): the bed is cut at the last bar line L that leaves room for the crossfade,
//          and the music that follows L (L to L + x, x = 0.25 to 0.5 s, default 0.35) is mixed under the head with an equal-power
//          (quarter-sine) fade, so the tail runs into the head in the same bar phase and the audio seam is clean. The loop is L long:
//          set the film's loop length to loop_s. Reported as {loop: {loop_s, cut_at_bar, xfade_s, ...}}
//   node sound.mjs sfx-plan --scenes scenes.json|timeline.json [--events events.json] [--narrated]
//        (--events also takes the derived film-event manifest from events.mjs export: its picture hits are the cues, stale ones are refused)
//        [--format reel] [--bed bed.wav] [--plan plan.json] [--words audio_meta.json] [--project <dir>]
//        [--pack glass|minimal|studio|soft|cinematic|scifi] [--no-library] [--library <dir>]
//       -> samples come from library/sfx (CC0, index.json) first: one uisfx pack per film for the UI sounds,
//          atomcut/Kenney for whoosh/riser/impact/stinger; --library <dir> or --no-library use the old
//          media-use files only. SFX cues for causal on-screen events only, inside the density budget (lib/audio.mjs SFX_BUDGET,
//          shared with slop.mjs; ranked across the whole film before it is spent, a typing burst = one cue per line, a declared
//          signature move's whoosh kept where the music hits), placed by each
//          sample's measured sync point, plus the audio_meta.json "sfx" entries
//        [--curves curves.json] [--pan [--width <px>]] [--no-generate] [--run <dir>]
//       -> wave 7: foley that sounds inside a spoken phrase (through its word gaps) is ducked 5 dB (--words); an event with on_word: true snaps to the
//          nearest word onset; cues inside a designed break of --bed are noted; --curves (or <project>/curves.json: {curves:[{id, kind, points:[[t,v]..]}]})
//          renders a texture bed per curve (camera air from zoom speed |d ln zoom/dt|^1.3, brush noise from stroke speed; silent when the picture is
//          still) into assets/sfx/rasa/texture-<id>.wav, listed in texture_beds and audio_meta_sfx, not counted in the SFX budget; --pan pans a cue
//          by its event's x (0 left .. 1 right, or px with --width) by baking a stereo file (HyperFrames has no pan node: see references/sound.md);
//          with no library sample, no media-use file and the user's own RASANAI_ELEVENLABS_API_KEY, a sample is generated (cached under assets/sfx/gen/),
//          else the cue has no file and a downgrade is logged
//   node sound.mjs check (--video <mp4> | --audio <file>) [--film <s>] [--vo <stem>] [--music <stem>]
//        [--sfx <sfx-plan.json|index.html>] [--silent-by-choice "<reason>"] [--plan plan.json] [--events events.json]
//        [--narrated] [--lufs -14] [--payoff <s>] [--score score.json]
//       -> measured loudness, true peak, head/tail, dropouts, loops, VO gap, SFX density; with --sfx, error
//          no-sfx when a film of 15 s or more has zero SFX cues (unless --silent-by-choice; without --sfx it is a warning);
//          warnings flat-dynamics (bed LRA under 2.0 LU) and ring-out-ending (the music still audible more than 1.0 s
//          after the logo / cta event from --plan or --events), flat-payoff (the payoff, found from --payoff, a reveal event or
//          plan reveal, else the logo, is under 2 dB louder than the 1.5 s before it and has no 6 dB break in the 2 s before)
//          and loudest-not-payoff (the loudest second sits elsewhere, 3 dB above the payoff; numbers in measures.payoff;
//          no payoff time = skipped with a note). The score's music_arc.payoff_at (--score, or the plan's) is the payoff when
//          nothing earlier names one, and is measured as measures.payoff.arc (warnings tagged "arc payoff") when it differs
//          from the one checked: the reveal and the director's payoff are both reported, no-breath (fewer than 2 designed breaks, 1 under 20 s: a 0.25 s+ stretch 10 dB
//          under the median level, outside the head and tail) and, narrated (--narrated, --vo or --words), no-split-edits (fewer than 2 J-cuts or L-cuts in 4+
//          cuts; cuts from --scenes / --plan / --events, phrases from --words or the --vo stem); numbers in measures.shape;
//          exit 2 with fixes when anything is off. Wave 7 warnings (uncalibrated, numbers in measures.sync): cut-onset-share (under 20% of the cuts within
//          80 ms of a sound onset, with the near misses 80-300 ms and the slide that fixes each), text-lands-before-word (events with a "word" and --words /
//          --scenes: the text must land 0-2 frames before the spoken word, 5 for a name), low-mud (0.5 s windows 80%+ under 300 Hz in 30% of the film or a 3 s
//          run), with --sfx: sfx-buried (a cue 26 dB or more under the music in its 0.3 s window; --music for a true reading), sfx-in-break (a film with
//          designed breaks and no sound in any) and sfx-on-word-onset (a cue within 150 ms of a spoken word's onset that was not placed there on purpose);
//          --locked [lock.json] (default <run>/sound-lock.json) warns audio-changed when the mix differs from the one `lock` hashed, unless --note-asked "<note>"
//   node sound.mjs lock (--video <mp4> | --audio <file>) [--run <dir>] [--out <lock.json>]
//       -> hashes the approved mix (sha256 of the decoded 48 kHz s16 PCM, plus a 100 ms level envelope) into <run>/sound-lock.json
//   node sound.mjs master (--video <mp4> | --audio <file>) --out <file> [--lufs -14]
//       -> the post-render fix for check's loudness/peak problems: static gain + true-peak limiter
//          (-1.5 dBTP, -2 for AAC/MP3), picture copied untouched
//   Plan 07 (all optional; a run without audio/direction.json behaves as before): --direction <file> (else <run>/audio/direction.json) gives sfx-plan the film's
//   silence windows (auto-fill never lands in one) and lets a film with sfx role "none" or a silent deliverable pass check without no-sfx; an event may carry
//   offset_s (the intended lead or lag of its accent, default +0.010 s); --profile <rasanai-house|ebu-r128|atsc-a85> sets the loudness target and true-peak limit
//   (lib/mix-receipt.mjs PROFILES; --lufs still wins; the house profile is the old -14 LUFS / -1.5 dBTP). The records live in soundplan.mjs (references/sound.md "Sound direction").
//   node sound.mjs probe <sfx files...>        -> sync point, lead silence, audible end, harshness
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs, die, readJSON, writeFile } from "./lib/common.mjs";
import { findSkill } from "./lib/hyperframes.mjs";
import { track } from "./lib/report.mjs";
import { gateValue, gateNotes } from "./lib/gate-lessons.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";
import { KEYS } from "./lib/music-lib.mjs";
import { isManifest, loadManifest, legacyEvents } from "./lib/film-events.mjs";
import { readSidecar, identityPlan } from "./lib/procedural-score.mjs";
import {
  analyzeTrack, publicAnalysis, summarize, fitTrack, renderPlan, masterFile, probeSfx, loudness, loudnessOver,
  decode, findRepeats, onsetProfile, onsetTimes, cutOnsetShare, lowShare, windowDb, audioFingerprint, compareFingerprint, renderTexture, SFX_BUDGET, sfxMode, sfxLimit, sfxOver, momentaryDb, designedBreaks, speechPhrases, phrasesFromWords, splitEdits, hasAudioStream, probeDuration, requireTools, r1, r3, SR,
} from "./lib/audio.mjs";
// Plan 07: the audio direction (intentional silence, a silent deliverable), cue offsets and destination profiles. All optional: a run without audio/direction.json behaves as before.
import { readDirection, sfxExpectation, silenceWindows } from "./lib/audio-direction.mjs";
import { dropInSilence } from "./lib/cues.mjs";
import { resolveProfile } from "./lib/mix-receipt.mjs";
import { fitGuard, labelEstimates } from "./lib/music-fit.mjs";

const args = parseArgs();
const cmd = args._[0];
const out = (o) => console.log(JSON.stringify(o, null, 2));
// the audio direction: --direction <file>, else <run>/audio/direction.json; null for a legacy run
function audioDirection() {
  try {
    if (args.direction && args.direction !== true) return JSON.parse(fs.readFileSync(path.resolve(String(args.direction)), "utf8"));
    if (args.run && args.run !== true) return readDirection(String(args.run)).direction;
  } catch {}
  return null;
}
// --lufs wins; else --profile <id> (lib/mix-receipt.mjs PROFILES; "rasanai-house" = the old -14 LUFS / -1.5 dBTP default); else the house default
const profileOf = () => resolveProfile(args.profile && args.profile !== true ? String(args.profile) : "rasanai-house");
const targetLufs = () => (args.lufs != null ? Number(args.lufs) : profileOf().integrated_lufs);
const limitTp = () => profileOf().true_peak_limit_db;
const need = (k, hint) => {
  if (args[k] == null || args[k] === true) die(`--${k} ${hint} required`);
  return String(args[k]);
};
const exists = (p, what) => {
  if (!fs.existsSync(p)) die(`${what} not found: ${p}`);
  return p;
};
try {
  requireTools();
} catch (e) {
  die(e.message);
}

// scenes.json (durations) or timeline.json (start_s/duration_s) -> [{n,title,type,start,duration,...}]
function readScenes(file) {
  const S = readJSON(exists(path.resolve(file), "scenes file"));
  const list = S.scenes || [];
  let t = 0;
  const scenes = list.map((s, i) => {
    const start = s.start_s != null ? Number(s.start_s) : t;
    const duration = Number(s.duration ?? s.duration_s) || 0;
    t = start + duration;
    return { n: s.n ?? i + 1, title: s.title || `Scene ${i + 1}`, type: s.type || "", start, duration, transition_in: s.transition_in || (i ? S.transition_default || "cut" : "cut"), text: [s.visual, s.on_screen, s.notes, s.beat, s.title].filter(Boolean).join(" "), voiceover: s.voiceover || "", events: s.events || null };
  });
  const narrated = S.narrated != null ? !!S.narrated : S.narration !== false && list.some((s) => s.voiceover && String(s.voiceover).trim());
  return { scenes, total: t, narrated, raw: S };
}

// ============================================================== SFX

// what gets a sound, how loud, and which sample (HyperFrames' bundled library by default)
const KINDS = {
  click: { cls: "ui", weight: 3, samples: ["click"], vol: 0.16 },
  type: { cls: "texture", weight: 3, samples: ["typing"], vol: 0.14 },
  key: { cls: "ui", weight: 3, samples: ["key-press"], vol: 0.12 },
  land: { cls: "mid", weight: 3, samples: ["pop"], vol: 0.2, rate: 0.9 },
  snap: { cls: "mid", weight: 3, samples: ["click"], vol: 0.24, rate: 0.85 },
  pop: { cls: "mid", weight: 2, samples: ["pop"], vol: 0.24 },
  toast: { cls: "tonal", weight: 2, samples: ["notification"], vol: 0.2 },
  count: { cls: "tonal", weight: 2, samples: ["ping"], vol: 0.18 },
  reveal: { cls: "hero", weight: 2, samples: ["impact-bass-1"], vol: 0.5 },
  logo: { cls: "hero", weight: 2, samples: ["impact-bass-2", "impact-bass-1"], vol: 0.45 },
  whoosh: { cls: "whoosh", weight: 1, samples: ["whoosh", "whoosh-cinematic"], vol: 0.35 },
  riser: { cls: "riser", weight: 1, samples: ["riser"], vol: 0.4 },
  glitch: { cls: "mid", weight: 2, samples: ["glitch-1"], vol: 0.22 },
  error: { cls: "tonal", weight: 2, samples: ["error"], vol: 0.22 },
};
const ALIAS = { tap: "click", press: "click", toggle: "click", select: "click", typing: "type", settle: "land", thud: "land", lock: "snap", align: "snap", appear: "pop", badge: "toast", notification: "toast", ping: "toast", success: "count", confirm: "count", hit: "reveal", impact: "reveal", transition: "whoosh", swipe: "whoosh" };
const SIZE = { small: 1, medium: 2, large: 3 };
const BUDGET = SFX_BUDGET; // one budget with slop.mjs (lib/audio.mjs)
const TYPE_GAP = 0.8, SPREAD = 3, SPREAD_PENALTY = 1.5; // sfx-plan: typing-burst gap, spread window (s), score lost per same-class neighbour
const VARIANTS = [{ rate: 1, gain_db: 0 }, { rate: 1.035, gain_db: -1.5 }, { rate: 0.965, gain_db: -0.8 }];

const DUCK_DB = 5; // foley that plays inside a spoken phrase

// generated SFX fallback (mortiflix idea; our code): ElevenLabs sound generation with the user's own key, only when a cue has no sample.
// Cached by prompt under <project>/assets/sfx/gen/. Sync call through curl so sfx-plan stays one straight pass; the key goes through a header file, never argv.
const GEN_PROMPTS = {
  click: ["a soft dry UI button click, very short, no reverb", 0.5], key: ["a single quiet keyboard key press, dry", 0.5], type: ["a few soft typing key taps, dry", 1.2],
  land: ["a soft low thud of a card landing on a desk, short", 0.8], snap: ["a crisp snap click as an object locks into place, short", 0.6], pop: ["a gentle soft pop, short", 0.5],
  toast: ["a short soft two-note notification chime, clean", 1.0], count: ["a single clean tick tone, short", 0.5], reveal: ["a deep cinematic impact hit with a short sub tail", 1.8],
  logo: ["a deep clean impact hit with a short tail, brand sting", 1.8], whoosh: ["a smooth airy whoosh, medium speed", 1.0], riser: ["a rising tension riser that peaks at the end, 4 seconds", 4],
  glitch: ["a short digital glitch stutter", 0.6], error: ["a short low soft error buzz tone", 0.7],
};
function genWhy(project) {
  return !process.env[KEYS.elevenlabs] ? `no library category fits and no ${KEYS.elevenlabs} in the environment, so no sample could be generated` : !project ? "no --project dir to keep a generated sample in" : args["no-generate"] ? "--no-generate" : "generation failed";
}
function genSfx(kind, project) {
  const key = process.env[KEYS.elevenlabs], g = GEN_PROMPTS[kind];
  if (!key || !project || !g || args["no-generate"]) return null;
  const dir = path.join(project, "assets", "sfx", "gen");
  const id = `gen-${kind}`, file = path.join(dir, `${id}.mp3`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) {
      const hdr = path.join(dir, `.h-${process.pid}`);
      fs.writeFileSync(hdr, `xi-api-key: ${key}\ncontent-type: application/json\n`, { mode: 0o600 });
      try { execFileSync("curl", ["-sS", "--fail", "-m", "90", "-X", "POST", "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", "-H", `@${hdr}`, "-d", JSON.stringify({ text: g[0], duration_seconds: g[1], prompt_influence: 0.5 }), "-o", file], { stdio: ["ignore", "pipe", "pipe"] }); }
      finally { fs.rmSync(hdr, { force: true }); }
    }
    return fs.existsSync(file) && fs.statSync(file).size > 1000 ? { id, file } : null;
  } catch { fs.rmSync(file, { force: true }); return null; }
}

function sfxLibrary() {
  const mu = findSkill("media-use");
  const dir = args.library ? path.resolve(String(args.library)) : mu ? path.join(mu, "audio", "assets", "sfx") : null;
  if (!dir || !fs.existsSync(dir)) return { dir: null, files: {} };
  const files = {};
  for (const f of fs.readdirSync(dir)) if (/\.(mp3|wav|ogg|m4a)$/i.test(f)) files[f.replace(/\.\w+$/, "")] = path.join(dir, f);
  return { dir, files };
}

// the bundled CC0 library (library/sfx/index.json): measured sync points, no per-run probing.
// cue kind -> library categories, best first; "ui" kinds use the film's one uisfx pack
const LIB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "library", "sfx");
const LIB_CATS = {
  click: ["click", "press", "select"], key: ["press", "tick", "click"], type: ["type", "tick"],
  land: ["drop", "land"], snap: ["snap", "drop"], pop: ["land", "select", "click"],
  toast: ["notification"], count: ["tick", "notification"], error: ["error"],
  reveal: ["impact"], logo: ["impact", "stinger"], whoosh: ["whoosh", "swipe"], riser: ["riser"], glitch: ["glitch"],
};
const UI_PACKS = ["glass", "minimal", "studio", "soft", "cinematic", "scifi"];
const FX_PACKS = ["atomcut-impacts-risers", "atomcut-motion-essentials", "kenney-impact-sounds", "kenney-interface-sounds"];
function rasanLibrary(filmKey) {
  if (args["no-library"] || args.library) return null;
  const f = path.join(LIB_DIR, "index.json");
  if (!fs.existsSync(f)) return null;
  const idx = readJSON(f);
  const byId = {};
  for (const e of idx.files || []) byId[e.id] = { ...e, abs: path.join(LIB_DIR, e.file) };
  let h = 0;
  for (const ch of String(filmKey)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const want = args.pack && args.pack !== true ? String(args.pack).replace(/^uisfx-/, "") : null;
  const uiPack = "uisfx-" + (UI_PACKS.includes(want) ? want : UI_PACKS[h % UI_PACKS.length]);
  return { byId, uiPack, entries: Object.values(byId) };
}
// pick the sample for a cue: the film's UI pack first for UI kinds, then the FX packs; never the
// file used last for this kind, nor one used in the last 3 cues of any kind
function pickRasan(RL, kind, cls, history) {
  const cats = LIB_CATS[kind];
  if (!RL || !cats) return null;
  const ui = !["hero", "whoosh", "riser"].includes(cls) && kind !== "glitch";
  const packOrder = ui ? [RL.uiPack, ...FX_PACKS, ...UI_PACKS.map((p) => "uisfx-" + p).filter((p) => p !== RL.uiPack)] : [...FX_PACKS, RL.uiPack];
  let stale = null;
  for (const cat of cats) {
    for (const pack of packOrder) {
      const pool = RL.entries.filter((e) => e.category === cat && e.pack === pack).sort((a, b) => (a.id < b.id ? -1 : 1));
      if (!pool.length) continue;
      const recent = history.slice(-3);
      const fresh = pool.filter((e) => !recent.includes(e.id));
      // the film's one UI pack keeps its sound even when its only file was just used (the pitch variants
      // keep repeats from sounding identical); other packs never stand in for a category it has
      if (!fresh.length && ui && pack === RL.uiPack) return pool[history.filter((id) => pool.some((e) => e.id === id)).length % pool.length];
      if (!fresh.length) { stale ||= pool[history.filter((id) => pool.some((e) => e.id === id)).length % pool.length]; continue; }
      return fresh[history.filter((id) => pool.some((e) => e.id === id)).length % fresh.length];
    }
  }
  return stale;
}

// events from the scene text when no events.json: estimates, marked so; real times come from
// the built composition (the settle/contact frame of each element)
function inferEvents(scenes, plan) {
  const ev = [];
  const last = scenes[scenes.length - 1];
  for (const s of scenes) {
    if (s.events) { for (const e of s.events) ev.push({ ...e, t: s.start + Number(e.at ?? e.t ?? 0), scene: s.n }); continue; }
    const tx = s.text.toLowerCase();
    const at = (f) => r3(s.start + f * s.duration);
    if (/product_intro/.test(s.type) || /\breveal/.test(tx)) ev.push({ t: plan?.moments?.reveal?.t ?? at(0), kind: "reveal", size: "large", scene: s.n, estimated: true });
    if (s === last && (/branding|cta/.test(s.type) || /\blogo\b/.test(tx))) ev.push({ t: plan?.moments?.logo?.t ?? at(0.2), kind: "logo", size: "large", scene: s.n, estimated: true });
    if (/\b(click|clicks|tap|taps|press|presses|toggle)\b/.test(tx)) ev.push({ t: at(0.5), kind: "click", size: "small", scene: s.n, estimated: true });
    if (/\b(type|types|typed|typing)\b/.test(tx)) ev.push({ t: at(0.25), kind: "type", size: "small", scene: s.n, estimated: true });
    if (/\b(lands?|settles?|drops? in|stacks?)\b/.test(tx)) ev.push({ t: at(0.35), kind: "land", size: "medium", scene: s.n, estimated: true });
    if (/\b(snaps?|locks? in|clicks? into place)\b/.test(tx)) ev.push({ t: at(0.4), kind: "snap", size: "medium", scene: s.n, estimated: true });
    if (/\b(notification|toast|badge|alert)\b/.test(tx)) ev.push({ t: at(0.4), kind: "toast", size: "small", scene: s.n, estimated: true });
    if (/\b(counts? up|counter|ticks? up|tallies)\b/.test(tx)) ev.push({ t: at(0.8), kind: "count", size: "medium", scene: s.n, estimated: true });
    if (/zoom-through/.test(s.transition_in) || (/push-slide/.test(s.transition_in) && /signature|fly|flies|travel/.test(tx))) ev.push({ t: r3(s.start), kind: "whoosh", size: "large", scene: s.n, estimated: true, signature: true });
  }
  return ev;
}

// "## Events" lines as the film builder and scene animators write them ("- t=3.65 selection lands on the beat (tick)";
// several "t=" in one line are several events) -> [{t, kind, what, signature}]; the kind is read from the words
const EVENT_WORDS = [
  [/\blogo\b|\bmark lands\b|blossom|end card lands/i, "logo"], [/\breveal|\bmeet\b|brand reveal/i, "reveal"],
  [/whoosh|push-through|flies|flight|zoom through|dives?\b|whip|swoops?/i, "whoosh"], [/riser|builds? to/i, "riser"],
  [/\bclick|\btaps?\b|\bpress(es)?\b|\btick(ed|s)? (the )?(box|row)|toggle|send\b|cursor (clicks|presses)/i, "click"],
  [/typ(es|ing)|key run|\bkeys?\b|backspace/i, "type"], [/counter|count(s|ing)? up|digit|rolls? to|\btick\b/i, "count"],
  [/notification|toast|badge|bubble (appears|lands)/i, "toast"], [/snaps?|locks?\b|aligns?/i, "snap"],
  [/lands?\b|settles?|drops? in|thud/i, "land"], [/appears?|pops?\b/i, "pop"], [/\bcut\b|seam|transition|match cut/i, "transition"],
];
function eventsFromLines(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const parts = line.split(/(?=\bt\s*=\s*\d)/).filter((p) => /^t\s*=\s*\d/.test(p.trim()));
    for (const p of parts) {
      const m = p.trim().match(/^t\s*=\s*([\d.]+)\s*s?\s*[:,-]?\s*(.*)$/);
      if (!m) continue;
      const what = m[2].replace(/[;,.\s]+$/, "");
      const hit = EVENT_WORDS.find(([re]) => re.test(what));
      out.push({ t: Number(m[1]), kind: hit ? hit[1] : "none", what, signature: /signature|hero|showreel|push-through/i.test(what) || undefined });
    }
  }
  return out;
}

// an events file's rows. A derived film-event manifest (events.mjs export; stale ones are refused) is read through legacyEvents;
// any other events.json is read exactly as before. cuesOnly: just the rows that can carry a sound (sfx-plan)
function eventRows(file, cuesOnly = false) {
  const raw = fs.readFileSync(file, "utf8");
  if (!/^\s*[[{]/.test(raw)) return eventsFromLines(raw);
  const E = JSON.parse(raw);
  if (isManifest(E)) {
    const r = loadManifest(file);
    if (!r.ok) die(`--events ${file}: ${r.error}`);
    return legacyEvents(r.manifest, { cuesOnly });
  }
  return Array.isArray(E) ? E : E.events || [];
}

function sfxPlan() {
  const sc = readScenes(need("scenes", "<scenes.json|timeline.json>"));
  const plan = args.plan ? readJSON(exists(path.resolve(String(args.plan)), "plan")) : null;
  const narrated = args.narrated ? true : args["no-narration"] ? false : sc.narrated;
  const mode = sfxMode({ format: args.format, narrated });
  const B = BUDGET[mode];
  const film = plan?.film_duration || sc.total;
  let events;
  if (args.events) {
    const ef = exists(path.resolve(String(args.events)), "events");
    events = eventRows(ef, true).map((e) => ({ ...e })); // a film-event manifest, an events.json, or the builders' "## Events" lines ("t=<film s> <what happens>")
  } else events = inferEvents(sc.scenes, plan);
  events = events.map((e, i) => {
    const kind = KINDS[e.kind] ? e.kind : ALIAS[e.kind] || null;
    const scene = e.scene ?? (sc.scenes.find((s) => e.t >= s.start - 1e-6 && e.t < s.start + s.duration) || sc.scenes[sc.scenes.length - 1]).n;
    return { id: e.id || `e${i + 1}`, ...e, kind, raw_kind: e.kind, scene, t: Number(e.t) };
  });
  const skipped = [];
  for (const e of events.filter((e) => !e.kind)) skipped.push({ event: e.id, t: e.t, why: `"${e.raw_kind}" is not a causal event with a sound (${Object.keys(KINDS).join(", ")})` });
  let cand = events.filter((e) => e.kind && Number.isFinite(e.t) && e.t >= 0 && e.t <= film);
  // staggered groups: only the first and the last element get a sound
  const groups = {};
  for (const e of cand) if (e.group) (groups[e.group] ||= []).push(e);
  for (const g of Object.values(groups)) {
    g.sort((a, b) => a.t - b.t);
    for (const e of g.slice(1, -1)) { skipped.push({ event: e.id, t: e.t, why: "inside a stagger: only the first and last items get a sound" }); e._drop = true; }
  }
  cand = cand.filter((e) => !e._drop);
  // whooshes only on signature transitions
  for (const e of cand) if (e.kind === "whoosh" && !e.signature) { skipped.push({ event: e.id, t: e.t, why: "whoosh on an ordinary transition: only signature spatial moves get one" }); e._drop = true; }
  cand = cand.filter((e) => !e._drop);
  // Plan 07 A1/A2: the audio direction can give effects no role (or choose a silent film) and can protect silence windows from auto-fill
  const direction = audioDirection();
  if (direction) {
    const expect = sfxExpectation(direction);
    if (expect.required === false) { for (const e of cand) skipped.push({ event: e.id, t: e.t, why: `audio direction: ${expect.why}` }); cand = []; }
    else {
      const win = silenceWindows(direction, events.map((e) => ({ id: e.id, t: e.t }))).windows;
      if (win.length) { const d = dropInSilence(cand, win); for (const x of d.dropped) skipped.push({ event: x.id, t: x.t, why: x.why }); cand = d.kept; }
    }
  }

  const bed = args.bed ? onsetProfile(exists(path.resolve(String(args.bed)), "bed")) : null;
  const words = [], wordSpans = [];
  if (args.words) {
    const M = readJSON(exists(path.resolve(String(args.words)), "audio meta"));
    for (const v of M.voices || []) {
      const s = sc.scenes.find((x) => x.n === Number(v.frame));
      if (!s) continue;
      for (const w of v.words || []) {
        const ws = s.start + Number(w.start);
        if (Number.isFinite(ws)) wordSpans.push({ s: ws, e: w.end != null ? s.start + Number(w.end) : ws + 0.2 });
        if (String(w.text || "").replace(/\W/g, "").length >= 4) words.push(ws);
      }
    }
  }

  const notes_tex = [];
  const maxCount = sfxLimit(mode, film);
  // the share cap is over ALL visual events: only an events file lists those (inferred events are
  // already the sound-worthy ones)
  const maxShare = args.events ? Math.max(1, Math.ceil(events.length * B.share)) : Infinity;
  const rank = (e) => (KINDS[e.kind].weight * (SIZE[e.size] || (KINDS[e.kind].cls === "hero" ? 3 : 1))) + (e.priority || 0);
  // a typing burst is one cue per line: key events less than TYPE_GAP s apart collapse to the first (kept: the loudest-ranked)
  const typed = cand.filter((e) => e.kind === "type").sort((a, b) => a.t - b.t);
  for (let i = 0, run = []; i <= typed.length; i++) {
    if (i < typed.length && (!run.length || typed[i].t - run[run.length - 1].t < TYPE_GAP)) { run.push(typed[i]); continue; }
    const keep = run.reduce((m, e) => (rank(e) > rank(m) ? e : m), run[0] || null);
    for (const e of run) if (e !== keep) { skipped.push({ event: e.id, t: e.t, kind: e.kind, why: "inside a typing burst: one cue per line" }); e._drop = true; }
    run = i < typed.length ? [typed[i]] : [];
  }
  cand = cand.filter((e) => !e._drop);
  // rank before spending, across the whole film: the best remaining candidate goes first, discounted for every cue of its
  // own class already placed within SPREAD s, so the budget spreads over the film instead of filling its first seconds
  const placed = [];
  const tonalScenes = new Set();
  const left = [...cand];
  const dyn = (e) => rank(e) - SPREAD_PENALTY * placed.filter((p) => KINDS[p.kind].cls === KINDS[e.kind].cls && Math.abs(p.t - e.t) < SPREAD).length;
  while (left.length) {
    left.sort((a, b) => dyn(b) - dyn(a) || a.t - b.t);
    const e = left.shift();
    const k = KINDS[e.kind];
    const why = (() => {
      if (placed.length >= maxCount) return `budget: ${mode} films get at most ${maxCount} SFX in ${r1(film)} s`;
      if (placed.length >= maxShare) return `budget: at most ${Math.round(B.share * 100)}% of the ${events.length} visual events get a sound (the most causal ones)`;
      if (k.cls === "hero" && e.kind === "logo" && plan?.ending?.kind === "natural" && plan.ending.film_hit != null && Math.abs(plan.ending.film_hit - e.t) < 0.12) return "the track's own ending hit lands the logo";
      if (placed.filter((p) => Math.abs(p.t - e.t) < 1).length + 1 > B.perWindow) return `more than ${B.perWindow} sounds within one second`;
      if (k.cls === "hero") {
        const heroes = placed.filter((p) => KINDS[p.kind].cls === "hero");
        if (heroes.length >= B.heroMax) return `hero hits: at most ${B.heroMax} per film`;
        if (heroes.some((p) => Math.abs(p.t - e.t) < B.heroEvery)) return `hero hits: one per ${B.heroEvery} s`;
      }
      if (k.cls === "whoosh" && placed.some((p) => KINDS[p.kind].cls === "whoosh" && Math.abs(p.t - e.t) < B.whooshEvery)) return `whooshes: one per ${B.whooshEvery} s, signature moves only`;
      if (k.cls === "riser" && placed.some((p) => p.kind === "riser") && film <= 45) return "one riser per film under 45 s";
      if (k.cls === "tonal" && tonalScenes.has(e.scene)) return "one tonal ping per scene";
      return null;
    })();
    if (why) { skipped.push({ event: e.id, t: e.t, kind: e.kind, why }); continue; }
    let gain = 0;
    const notes = [];
    if (bed) {
      const h = bed.strongAt(e.t);
      const signed = k.cls === "whoosh" && e.signature; // a declared signature move keeps its whoosh where the music hits
      if (h.strong && !signed && (k.cls === "hero" || k.cls === "whoosh" || k.cls === "tonal")) { skipped.push({ event: e.id, t: e.t, kind: e.kind, why: "the music already hits this moment" }); continue; }
      if (h.strong) { gain -= 3; notes.push("music hits here: 3 dB lower"); }
    }
    let t = e.t;
    if (e.on_word && wordSpans.length) {
      // a cue that is meant to land with a spoken word (the event says so): snap to the nearest word onset within 0.25 s, no clash move
      const o = wordSpans.reduce((b, w) => (Math.abs(w.s - t) < Math.abs(b.s - t) ? w : b), wordSpans[0]);
      if (Math.abs(o.s - t) <= 0.25) { if (Math.abs(o.s - t) > 0.005) notes.push(`on a word onset on purpose: moved ${Math.round((o.s - t) * 1000)} ms`); t = o.s; }
    } else if (words.length && k.cls !== "hero") {
      const clash = (x) => words.some((w) => Math.abs(w - x) < 0.15);
      if (clash(t)) {
        const later = [0.033, 0.066].map((d) => t + d).find((x) => !clash(x));
        if (later != null) { notes.push(`moved ${Math.round((later - t) * 1000)} ms later, off a stressed word`); t = later; }
        else { skipped.push({ event: e.id, t: e.t, kind: e.kind, why: "lands on a stressed voiceover word" }); continue; }
      }
    }
    if (k.cls === "tonal") tonalScenes.add(e.scene);
    placed.push({ ...e, t, gain, notes });
  }
  placed.sort((a, b) => a.t - b.t);

  // samples, variation (never the same file + pitch twice in a row within 2 s), sync points
  const lib = sfxLibrary();
  const RL = rasanLibrary(path.basename(String(args.scenes)) + "|" + Math.round(film * 10) + "|" + sc.scenes.length);
  const probes = {};
  const probe = (name) => (probes[name] ||= RL?.byId[name] ? { ...RL.byId[name], warnings: [] } : lib.files[name] ? probeSfx(lib.files[name]) : null);
  const history = [];
  const lastUse = {};
  const cues = [];
  const project = args.project ? path.resolve(String(args.project)) : null;
  const noSample = new Set();
  const phrases = wordSpans.length ? phrasesFromWords(wordSpans.map((w) => ({ start: w.s, end: w.e })), 0.25) : [];
  const breaks = bed ? designedBreaks(momentaryDb(decode(path.resolve(String(args.bed))), 0.1), 0.1).breaks : [];
  for (const e of placed) {
    const k = KINDS[e.kind];
    const uses = cues.filter((c) => c.kind === e.kind).length;
    const rl = pickRasan(RL, e.kind, k.cls, history);
    let sample = rl ? rl.id : k.samples[uses % k.samples.length];
    let generated = false;
    if (!rl && !lib.files[sample]) {
      // no library category and no media-use file: a generated sample when the user's own ElevenLabs key is in the environment
      const g = genSfx(e.kind, project);
      if (g) { lib.files[g.id] = g.file; sample = g.id; generated = true; }
      else if (!noSample.has(e.kind)) { noSample.add(e.kind); noteDowngrade({ run: args.run, what: `a sample for "${e.kind}" cues`, instead: "the cue has no file", why: genWhy(project) }); }
    }
    history.push(sample);
    const p = probe(sample);
    let v = VARIANTS[uses % VARIANTS.length];
    const lu = lastUse[sample];
    if (lu && e.t - lu.t < 2 && lu.v === v) v = VARIANTS[(VARIANTS.indexOf(v) + 1) % VARIANTS.length];
    lastUse[sample] = { t: e.t, v };
    const rate = (k.rate || 1) * (k.cls === "hero" || k.cls === "riser" ? 1 : v.rate);
    const sync = p ? p.sync_point / rate : 0;
    const off = Number.isFinite(Number(e.offset_s)) ? Number(e.offset_s) : 0.01; // the default: 10 ms after the picture reads as simultaneous. A cue event may carry its own intended offset (lib/cues.mjs): an intentional lead or lag is recorded, not corrected
    const start = Math.max(0, e.t - sync + off);
    const volume = r3(k.vol * Math.pow(10, (e.gain + (k.cls === "hero" ? 0 : v.gain_db)) / 20));
    const scene = sc.scenes.find((s) => s.n === e.scene) || sc.scenes[0];
    const dur = p ? (p.audible_end - (p.lead_silence > 0.05 ? 0 : 0)) / rate : 1;
    const cue = { event: e.id, kind: e.kind, class: k.cls, t: r3(e.t), intended_offset_s: r3(off), start: r3(start), scene: e.scene, sample, file: rl ? rl.abs : lib.files[sample] || null, source: rl ? "rasan-sfx" : "media-use", pack: rl ? rl.pack : null, rate: r3(rate), volume, duration_s: r3(dur), sync_point: p ? r3(sync) : null, estimated: !!e.estimated, notes: e.notes };
    if (p && p.warnings.some((w) => /harsh|piercing/.test(w))) cue.notes.push("harsh sample: lowpass 9 kHz applied when rendered");
    if (e.t - sync < 0) cue.notes.push("crest would fall before the film starts: trimmed");
    cue._scene_start = scene.start;
    if (generated) { cue.source = "elevenlabs-generated"; cue.notes = [...cue.notes, "generated sample (no library category fit): ElevenLabs sound generation, the user's own key"]; }
    // foley under speech: a cue that sounds inside a spoken phrase (through its word gaps too) is ducked 5 dB, unless it is on a word on purpose or a hero hit
    if (phrases.length && !e.on_word && k.cls !== "hero" && phrases.some(([a, b]) => a < start + dur && b > start)) {
      cue.volume = r3(cue.volume * Math.pow(10, -DUCK_DB / 20));
      cue.notes = [...cue.notes, `ducked ${DUCK_DB} dB: sounds inside a spoken phrase`];
    }
    const inBreak = breaks.find((b) => e.t >= b.from - 0.05 && e.t <= b.to + 0.05);
    if (inBreak) cue.notes = [...cue.notes, `inside the designed break ${inBreak.from}-${inBreak.to} s: the only sound there, so keep it clean and dry`];
    // pan: the on-screen x of the event (0 left .. 1 right, or px with --width); baked into the rendered stereo file (see the header)
    if (args.pan && e.x != null && Number.isFinite(Number(e.x))) {
      const w = Number(args.width) || 0, x = w > 0 && Number(e.x) > 1 ? Number(e.x) / w : Number(e.x);
      cue.pan = r3(Math.max(-0.7, Math.min(0.7, (Math.max(0, Math.min(1, x)) - 0.5) * 2 * 0.7)));
    }
    cues.push(cue);
  }
  // render variants into the project (pitch can't be varied at play time: data-playback-rate keeps pitch)
  if (project && cues.length) {
    const dir = path.join(project, "assets", "sfx", "rasa");
    fs.mkdirSync(dir, { recursive: true });
    for (const c of cues) {
      if (!c.file) continue;
      const p = probes[c.sample];
      const lead = Math.max(0, p.lead_silence - 0.005);
      const pan = c.pan != null && Math.abs(c.pan) >= 0.02 ? c.pan : null;
      const name = `${c.sample}${c.rate === 1 ? "" : `-r${Math.round(c.rate * 1000)}`}${pan == null ? "" : `-p${Math.round(pan * 100)}`}.wav`;
      const dest = path.join(dir, name);
      const harsh = p.warnings.some((w) => /harsh|piercing/.test(w));
      const lp = c.class === "hero" ? (harsh ? 9000 : null) : harsh ? 9000 : 11000;
      const af = [`atrim=start=${lead.toFixed(3)}:end=${p.audible_end.toFixed(3)}`, "asetpts=PTS-STARTPTS", c.rate !== 1 ? `asetrate=48000*${c.rate},aresample=48000` : null, lp ? `lowpass=f=${lp}` : null, c.class === "hero" || c.class === "riser" ? null : "highpass=f=100", "afade=t=out:st=0:d=0.001", `areverse,afade=t=in:d=0.02,areverse`, pan == null ? null : (() => { const a = ((pan + 1) * Math.PI) / 4; return `aformat=channel_layouts=mono,pan=stereo|c0=${(Math.SQRT2 * Math.cos(a)).toFixed(3)}*c0|c1=${(Math.SQRT2 * Math.sin(a)).toFixed(3)}*c0`; })()].filter(Boolean).join(",");
      if (!fs.existsSync(dest)) execFileSync("ffmpeg", ["-y", "-v", "error", "-i", c.file, "-ar", "48000", "-af", af, "-c:a", "pcm_s16le", dest]);
      c.sync_point = r3(Math.max(0, p.sync_point - lead) / c.rate);
      c.start = r3(Math.max(0, c.t - c.sync_point + (c.intended_offset_s ?? 0.01)));
      c.duration_s = r3((p.audible_end - lead) / c.rate);
      c.file = path.relative(project, dest).split(path.sep).join("/");
    }
  }
  // texture beds from the picture's continuous curves (score exports <project>/curves.json or --curves): camera air from zoom speed, brush noise from
  // stroke speed. Not cues: they are not counted in the SFX budget and play at 0.05-0.12 under everything else.
  const beds = [];
  const curvesFile = args.curves && args.curves !== true ? path.resolve(String(args.curves)) : project && fs.existsSync(path.join(project, "curves.json")) ? path.join(project, "curves.json") : null;
  if (curvesFile) {
    const C = readJSON(exists(curvesFile, "curves"));
    for (const [i, c] of (Array.isArray(C) ? C : C.curves || []).entries()) {
      const id = String(c.id || `${c.kind || "curve"}${i + 1}`).replace(/[^\w-]+/g, "-");
      const dest = project ? path.join(project, "assets", "sfx", "rasa", `texture-${id}.wav`) : path.join(os.tmpdir(), `rasanai-texture-${process.pid}-${id}.wav`);
      const r = renderTexture({ ...c, id }, dest);
      if (!r) { notes_tex.push(`curve "${id}" has under 3 points or under 0.2 s: no texture`); continue; }
      if (!project) fs.rmSync(dest, { force: true });
      const sc0 = sc.scenes.find((x) => r.start >= x.start - 1e-6 && r.start < x.start + x.duration) || sc.scenes[0];
      const vol = r3((r.texture === "brush" ? 0.08 : r.texture === "rumble" ? 0.12 : 0.1) * (narrated ? 0.7 : 1));
      beds.push({ id, curve: c.kind || null, texture: r.texture, start: r.start, duration_s: r.duration_s, active_share: r.active_share, volume: vol, scene: sc0.n, file: project ? path.relative(project, dest).split(path.sep).join("/") : null });
    }
  }
  const audio_meta_sfx = [...cues.filter((c) => c.file).map((c) => ({ frame: c.scene, file: c.file, offset_s: r3(c.start - c._scene_start), duration_s: c.duration_s, volume: c.volume })), ...beds.filter((b) => b.file).map((b) => ({ frame: b.scene, file: b.file, offset_s: r3(b.start - (sc.scenes.find((x) => x.n === b.scene) || sc.scenes[0]).start), duration_s: b.duration_s, volume: b.volume }))];
  cues.forEach((c) => delete c._scene_start);
  const est = cues.filter((c) => c.estimated).length;
  out({
    mode,
    film_duration: r3(film),
    budget: { max_sfx: maxCount, placed: cues.length, candidates: cand.length, per_window: B.perWindow, hero_every_s: B.heroEvery, whoosh_every_s: B.whooshEvery },
    cues,
    texture_beds: beds,
    skipped,
    audio_meta_sfx,
    library: RL ? { dir: LIB_DIR, ui_pack: RL.uiPack } : lib.dir,
    notes: [
      est ? `${est} cue time(s) are estimates from the scene text: pass --events with the real settle/contact times from the built composition before final mix` : null,
      !lib.dir && !RL ? "no SFX library found (library/sfx missing and media-use not installed): cues have no files; pass --library <dir>" : null,
      ...notes_tex,
      args.pan && !cues.some((c) => c.pan != null) ? "--pan: no event carries an x (0 left .. 1 right, or px with --width): nothing was panned" : null,
      !project ? "pass --project <dir> to render pitch variants, trimmed and filtered, into assets/sfx/rasa/" : null,
    ].filter(Boolean),
  });
}

// ============================================================== check

function sfxTimes(file) {
  const p = path.resolve(file);
  const txt = fs.readFileSync(exists(p, "sfx source"), "utf8");
  if (/\.html?$/i.test(p)) {
    const t = [];
    for (const m of txt.matchAll(/<audio[^>]*id="el-sfx-[^"]*"[^>]*>/g)) {
      const s = m[0].match(/data-start="([\d.]+)"/);
      if (s) t.push({ t: Number(s[1]), kind: (m[0].match(/src="[^"]*?([\w-]+)\.\w+"/) || [])[1] || "sfx", file: (m[0].match(/src="([^"]+)"/) || [])[1] || null, volume: Number((m[0].match(/data-volume="([\d.]+)"/) || [])[1] ?? 1), base: path.dirname(p) });
    }
    return t;
  }
  const J = JSON.parse(txt);
  if (Array.isArray(J.cues)) return J.cues.map((c) => ({ t: c.t ?? c.start, kind: c.kind || c.sample, file: c.file || null, volume: c.volume ?? 1, notes: c.notes || [], base: path.dirname(p) }));
  return [];
}

// ---- wave 7 sync helpers (cuts, events, spoken words in film seconds)
const normW = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
function cutTimes(dur) {
  let starts = null;
  if (args.scenes && args.scenes !== true) starts = readScenes(String(args.scenes)).scenes.map((s) => s.start);
  if (!starts && args.plan) { const pl = readJSON(exists(path.resolve(String(args.plan)), "plan")); if (Array.isArray(pl.scenes) && pl.scenes.length) starts = pl.scenes.map((s) => Number(s.start ?? s.start_s)).filter(Number.isFinite); }
  let cuts = starts ? starts.slice(1) : null;
  if (!cuts && args.events) cuts = eventList().filter((e) => /^(transition|cut|seam)/i.test(String(e.kind || e.id || "")) && Number.isFinite(Number(e.t))).map((e) => Number(e.t));
  return (cuts || []).filter((c) => c > 0.5 && c < dur - 0.5).sort((a, b) => a - b);
}
function eventList() {
  if (!args.events || args.events === true) return [];
  return eventRows(exists(path.resolve(String(args.events)), "events"));
}
function filmWords() {
  if (!args.words || args.words === true || !args.scenes || args.scenes === true) return [];
  const sc = readScenes(String(args.scenes)).scenes, M = readJSON(exists(path.resolve(String(args.words)), "audio meta")), out = [];
  for (const v of M.voices || []) { const st = sc.find((x) => x.n === Number(v.frame))?.start; if (st == null) continue; for (const w of v.words || []) out.push({ text: w.text, start: st + Number(w.start), end: w.end != null ? st + Number(w.end) : st + Number(w.start) + 0.2 }); }
  return out.filter((w) => Number.isFinite(w.start)).sort((a, b) => a.start - b.start);
}
// where the lock lives: --locked <file>, else <run>/sound-lock.json, else next to the audio
const lockPath = (file) => path.resolve(args.locked && args.locked !== true ? String(args.locked) : args.lock && args.lock !== true ? String(args.lock) : args.run && args.run !== true ? path.join(String(args.run), "sound-lock.json") : path.join(path.dirname(file), "sound-lock.json"));

function check() {
  const src = args.video || args.audio;
  if (!src) die("--video <mp4> or --audio <file> required");
  const file = exists(path.resolve(String(src)), "input");
  const directionX = audioDirection(), expectX = sfxExpectation(directionX);
  if (!hasAudioStream(file)) {
    // Plan 07 A1/A5: a silent deliverable chosen in the audio direction is complete; an audio failure is not
    if (directionX && directionX.deliverable && directionX.deliverable.state === "silent_by_choice") { out({ ok: true, silent_by_choice: directionX.deliverable.reason || "silent deliverable", note: "the audio direction chose a silent film; loudness targets do not apply" }); process.exit(0); }
    out({ ok: false, problems: [{ what: "no audio track", fix: "the render has no sound: check that audio_meta.json has the bed and the index mounts it" }] });
    process.exit(2);
  }
  const target = targetLufs();
  if (expectX.required === false && !(args["silent-by-choice"] && args["silent-by-choice"] !== true)) args["silent-by-choice"] = expectX.silent_by_choice; // the direction gave effects no role: zero cues is intended
  const problems = [], warnings = [];
  const P = (what, measured, target, fix) => problems.push({ what, measured, target, fix });
  const L = loudness(file);
  const dur = probeDuration(file);
  const y = decode(file);
  const win = (a, b) => {
    let z = 0, c = 0;
    for (let i = Math.max(0, Math.floor(a * SR)); i < Math.min(y.length, Math.floor(b * SR)); i++) { z += y[i] * y[i]; c++; }
    return c ? 10 * Math.log10(z / c + 1e-12) : -120;
  };
  // 50 ms level track
  const step = 0.05;
  const lv = [];
  for (let t = 0; t < y.length / SR; t += step) lv.push(win(t, t + step));
  const sorted = [...lv].filter((v) => v > -80).sort((a, b) => a - b);
  const body = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : -120;
  let fa = lv.findIndex((v) => v > -50);
  let la = lv.length - 1 - [...lv].reverse().findIndex((v) => v > -50);
  const first_audible = fa < 0 ? null : fa * step;
  const last_audible = fa < 0 ? null : (la + 1) * step;
  const first_second_db = win(0, 1);
  const last_30ms_db = win(dur - 0.03, dur);
  const measures = { duration: r3(dur), lufs: L.lufs, true_peak: L.true_peak, lra: L.lra, first_audible: r3(first_audible), last_audible: r3(last_audible), first_second_db: r1(first_second_db), body_level_db: r1(body), last_30ms_db: r1(last_30ms_db) };

  if (L.lufs == null || Math.abs(L.lufs - target) > 1) P("integrated loudness", `${L.lufs} LUFS`, `${target} LUFS +/-1`, `gain the master by ${r1(target - (L.lufs ?? target))} dB (static gain + a true-peak limiter at -1.5 dBTP; sound.mjs render does this for a bed)`);
  if (L.true_peak == null || L.true_peak > -1) P("true peak", `${L.true_peak} dBTP`, "<= -1.0 dBTP", "limit at -1.5 dBTP (4x oversampled) before AAC encoding, then re-check the encoded file");
  if (L.lra != null && L.lra < 2.0) warnings.push(`flat-dynamics: loudness range ${L.lra} LU is under 2.0 LU: the bed never moves (a soft intro, a drop on the reveal, a break before the payoff: references/sound.md, the arc; score music_arc)`);
  if (L.lra != null && L.lra > 11) warnings.push(`loudness range ${L.lra} LU is wide for a short film (target 4-9 LU): compress the VO or tame the loudest section`);
  if (first_audible != null && first_audible > 0.3) P("silent head", `${r1(first_audible)} s of silence`, "sound by 0.3 s", "start the bed at frame 0 (a strong phrase, 'already playing'); trim the file's lead silence");
  if (first_second_db < body - 8) P("quiet opening", `first second ${r1(first_second_db)} dB vs body ${r1(body)} dB`, "within 8 dB of the body", "start the music on a strong section, not its intro (sound.mjs fit picks one); premium styles may open soft on purpose: say so");
  if (last_audible != null && dur - last_audible > 1.5) P("dead air at the end", `${r1(dur - last_audible)} s of silence`, "<= 1.5 s", "backtime the music so its ending (or a button hit's tail) lands on the last frame, or trim the film");
  if (last_30ms_db > -40) P("abrupt ending", `last 30 ms at ${r1(last_30ms_db)} dBFS`, "< -40 dBFS (faded)", "end on the track's own ending or a button, with a 20-50 ms final fade to silence");
  // dropouts: silence >= 0.4 s inside the film
  const gaps = [];
  let run = 0;
  for (let i = fa; i <= la && fa >= 0; i++) {
    if (lv[i] < -50) run++;
    else { if (run * step >= 0.4) gaps.push([r1((i - run) * step), r1(i * step)]); run = 0; }
  }
  measures.silences = gaps;
  if (gaps.length) warnings.push(`silence inside the film at ${gaps.map((g) => `${g[0]}-${g[1]} s`).join(", ")}: fine if designed (a music stop before the reveal), otherwise the bed dropped out`);
  // audible loop: a verbatim repeat of the opening, or a long verbatim block
  const reps = findRepeats(y);
  measures.repeats = reps;
  for (const r of reps) {
    if (r.from < 2 && r.seconds >= 6) P("audible loop", `the opening ${r.seconds} s comes back verbatim at ${r.repeats_at} s`, "no restart of the track", "the bed was looped: fit a longer track (music.mjs --film) or use sound.mjs fit (it never loops)");
    else if (r.seconds >= 12 && r.lag_s >= 16) P("audible loop", `${r.from}-${r.to} s repeats verbatim at ${r.repeats_at} s`, "no verbatim repeat >= 12 s", "a section plays twice: pick a longer track or a head+tail edit (sound.mjs fit)");
  }
  if (args.film != null && Math.abs(dur - Number(args.film)) > 0.1) warnings.push(`audio is ${r3(dur)} s; the film is ${args.film} s`);
  // VO vs music gap from stems
  if (args.vo && args.music) {
    const vo = exists(path.resolve(String(args.vo)), "vo stem"), mu = exists(path.resolve(String(args.music)), "music stem");
    const vy = decode(vo);
    const spans = [];
    let s0 = null, lastOn = -9;
    for (let t = 0; t * SR < vy.length; t += 0.05) {
      let z = 0, c = 0;
      for (let i = Math.floor(t * SR); i < Math.min(vy.length, Math.floor((t + 0.05) * SR)); i++) { z += vy[i] * vy[i]; c++; }
      const on = 10 * Math.log10(z / Math.max(1, c) + 1e-12) > -45;
      if (on) { if (s0 == null || t - lastOn > 1.2) { if (s0 != null) spans.push([s0, lastOn + 0.05]); s0 = t; } lastOn = t; }
    }
    if (s0 != null) spans.push([s0, lastOn + 0.05]);
    const voL = loudness(vo).lufs;
    const muL = loudnessOver(mu, spans);
    const gap = voL != null && muL != null ? voL - muL : null;
    Object.assign(measures, { vo_lufs: voL, music_under_vo_lufs: muL, vo_music_gap_lu: r1(gap), vo_spans: spans.length });
    if (gap != null && (gap < 9 || gap > 15)) P("music vs voiceover", `music ${r1(gap)} LU under the VO`, "12 LU under (9-15)", gap < 9 ? `lower the bed under speech by ${r1(12 - gap)} dB (duck lane or the Voiceover carve)` : `raise the bed under speech by ${r1(gap - 12)} dB: it vanishes`);
  }
  // the ending: the music must stop on the logo / cta (a button), not ring out
  {
    let logoT = null;
    if (args.events) {
      const ts = eventRows(exists(path.resolve(String(args.events)), "events")).filter((e) => /^(logo|cta|end)/i.test(String(e.kind || e.id || "")) && Number.isFinite(Number(e.t))).map((e) => Number(e.t));
      if (ts.length) logoT = Math.max(...ts);
    }
    if (logoT == null && args.plan) {
      const pl = readJSON(exists(path.resolve(String(args.plan)), "plan"));
      const m = pl.moments?.logo?.t ?? pl.ending?.film_hit ?? null;
      if (m != null && Number.isFinite(Number(m))) logoT = Number(m);
    }
    if (logoT != null) {
      let musicLast = last_audible;
      if (args.music) {
        const my = decode(exists(path.resolve(String(args.music)), "music stem"));
        let ml = null;
        for (let t = 0; t * SR < my.length; t += step) { let z = 0, c = 0; for (let i = Math.floor(t * SR); i < Math.min(my.length, Math.floor((t + step) * SR)); i++) { z += my[i] * my[i]; c++; } if (10 * Math.log10(z / Math.max(1, c) + 1e-12) > -50) ml = t + step; }
        musicLast = ml;
      }
      measures.logo_at = r3(logoT);
      measures.music_last_audible = musicLast == null ? null : r3(musicLast);
      if (musicLast != null && musicLast - logoT > 1.0) warnings.push(`ring-out-ending: the music is still audible ${r1(musicLast - logoT)} s after the logo / cta at ${r1(logoT)} s (button endings preferred: a hard stop on the logo, sound.mjs fit --logo with the track's own ending or a button)`);
    }
  }
  // the payoff lands: silence (or a dip) before it, loudest on it. Measured in 100 ms windows on the music stem (--music) or the mix.
  {
    let payoffT = null, src = null;
    if (args.payoff != null && args.payoff !== true && Number.isFinite(Number(args.payoff))) { payoffT = Number(args.payoff); src = "--payoff"; }
    const evs = args.events ? eventRows(exists(path.resolve(String(args.events)), "events")) : [];
    const evT = (re) => evs.filter((e) => re.test(String(e.kind || e.id || "")) && Number.isFinite(Number(e.t))).map((e) => Number(e.t));
    const pl = args.plan ? readJSON(exists(path.resolve(String(args.plan)), "plan")) : null;
    // the score's music_arc.payoff_at (--score <score.json>, else the plan's own music_arc / score.music_arc)
    const scoreJ = args.score && args.score !== true ? readJSON(exists(path.resolve(String(args.score)), "score")) : null;
    const arcRaw = scoreJ?.music_arc?.payoff_at ?? pl?.music_arc?.payoff_at ?? pl?.score?.music_arc?.payoff_at;
    const arcT = arcRaw != null && Number.isFinite(Number(arcRaw)) ? Number(arcRaw) : null;
    if (payoffT == null) { const ts = evT(/^(reveal|payoff|brand)/i); if (ts.length) { payoffT = Math.max(...ts); src = "events"; } }
    if (payoffT == null && pl?.moments?.reveal?.t != null && Number.isFinite(Number(pl.moments.reveal.t))) { payoffT = Number(pl.moments.reveal.t); src = "plan reveal"; }
    if (payoffT == null) { const ts = evT(/^(logo|cta)/i); if (ts.length) { payoffT = Math.min(...ts); src = "events logo"; } }
    if (payoffT == null && pl?.moments?.logo?.t != null && Number.isFinite(Number(pl.moments.logo.t))) { payoffT = Number(pl.moments.logo.t); src = "plan logo"; }
    // payoff at time T (src = where it came from): the numbers, and the warnings (tagged when it is the score's arc payoff)
    const measurePayoff = (T, src, tag = "") => {
      if (T < 1.5 || T + 1.0 > dur + 0.05) return { skipped: `payoff at ${r1(T)} s has no 1.5 s before it or no 1.0 s after it in a ${r1(dur)} s film (the payoff check did not run)` };
      const my = args.music ? decode(exists(path.resolve(String(args.music)), "music stem")) : y;
      const W = 0.1, nW = Math.floor(my.length / SR / W);
      const en = [];
      for (let i = 0; i < nW; i++) { let z = 0; const a = Math.floor(i * W * SR), b = Math.floor((i + 1) * W * SR); for (let k = a; k < b; k++) z += my[k] * my[k]; en.push(z / Math.max(1, b - a)); }
      const toDb = (e) => 10 * Math.log10(e + 1e-12);
      const meanDb = (a, b) => { const i0 = Math.max(0, Math.round(a / W)), i1 = Math.min(nW, Math.round(b / W)); let z = 0; for (let i = i0; i < i1; i++) z += en[i]; return i1 > i0 ? toDb(z / (i1 - i0)) : -120; };
      const mom = en.map(toDb);
      const live = mom.filter((v) => v > -80).sort((a, b) => a - b);
      const median = live.length ? live[Math.floor(live.length / 2)] : -120;
      const after = meanDb(T, T + 1.0), before = meanDb(T - 1.5, T);
      const lift = after - before;
      const i0 = Math.max(0, Math.round((T - 2.0) / W)), i1 = Math.round(T / W);
      let deepest = 1e9;
      for (let i = i0; i < i1; i++) deepest = Math.min(deepest, mom[i]);
      const breakDb = median - deepest;
      let best = -1e9, bestAt = 0;
      for (let i = 0; i + 10 <= nW; i++) { const v = meanDb(i * W, i * W + 1.0); if (v > best) { best = v; bestAt = i * W; } }
      const loudAbove = best - after;
      const m = { at: r3(T), from: src, on: args.music ? "music stem" : "mix", payoff_db: r1(after), before_db: r1(before), lift_db: r1(lift), median_db: r1(median), deepest_break_db: r1(deepest), break_below_median_db: r1(breakDb), loudest_1s_at: r1(bestAt), loudest_1s_db: r1(best), loudest_above_payoff_db: r1(loudAbove) };
      const liftNeed = gateValue("sound.payoff_lift_db", 2), liftNotes = gateNotes(["sound.payoff_lift_db"]);
      if (liftNotes.length) m.lesson = liftNotes;
      if (lift < liftNeed && breakDb < 6) warnings.push(`${tag}flat-payoff: the payoff at ${r1(T)} s is ${r1(lift)} dB against the 1.5 s before it (needs +${liftNeed} dB${liftNotes.length ? ", " + liftNotes.join("; ") : ""}) and the 2 s before it have no break (deepest ${r1(breakDb)} dB under the film's median, needs 6 dB): pull the bed out (a stop or a filter dip) 0.3-0.8 s before the reveal and land the reveal on a hit; the payoff should be the loudest moment (references/sound.md)`);
      if (loudAbove > 3 && (bestAt + 1.0 < T - 0.5 || bestAt > T + 2)) warnings.push(`${tag}loudest-not-payoff: the loudest second of the film is at ${r1(bestAt)} s, ${r1(loudAbove)} dB above the payoff at ${r1(T)} s: the busiest moment is not the loudest; the payoff is (references/sound.md)`);
      return m;
    };
    if (payoffT == null && arcT != null) { payoffT = arcT; src = "score music_arc.payoff_at"; }
    if (payoffT == null) measures.payoff = { skipped: "no payoff time: pass --payoff <s>, or --plan / --events / --score with a reveal, logo or music_arc.payoff_at (the payoff check did not run)" };
    else {
      measures.payoff = measurePayoff(payoffT, src);
      // the director's own payoff (score music_arc.payoff_at) is measured too when it differs from the one checked: both are reported
      if (arcT != null && Math.abs(arcT - payoffT) > 0.25) measures.payoff.arc = measurePayoff(arcT, "score music_arc.payoff_at", `arc payoff (${r1(arcT)} s, the score's music_arc.payoff_at; the reveal is the one checked first): `);
    }
  }
  // the film's shape (lemo-opuscar: "at least two real silences; at least two J-cuts or L-cuts"): warnings only, numbers in measures.shape
  {
    const shape = {};
    const my = args.music ? decode(exists(path.resolve(String(args.music)), "music stem")) : y;
    const B = designedBreaks(momentaryDb(my, 0.1), 0.1);
    const needB = dur >= 20 ? 2 : 1;
    shape.breaks = { on: args.music ? "music stem" : "mix", median_db: B.median, found: B.breaks, need: needB };
    if (dur >= 6 && B.breaks.length < needB) warnings.push(`no-breath: ${B.breaks.length} designed break${B.breaks.length === 1 ? "" : "s"} in the ${args.music ? "music" : "mix"} of a ${r1(dur)} s film (needs ${needB}: a 0.25 s or longer stretch 10 dB under the median level, not in the first 0.5 s or the tail): the bed never lets go; stop it or dip it before the reveal and before a turn in the story so the next hit has room (references/sound.md, the arc)`);
    // split edits: narrated films (--narrated, --vo, or word timings given), cut times from --scenes, else the plan's scenes, else transition events; the VO's phrases from word timings or the stem
    if (args.narrated || args.vo || (args.words && args.words !== true)) {
      const sc = args.scenes ? readScenes(String(args.scenes)).scenes : null;
      let starts = sc ? sc.map((s) => s.start) : null;
      if (!starts && args.plan) { const pl = readJSON(exists(path.resolve(String(args.plan)), "plan")); if (Array.isArray(pl.scenes) && pl.scenes.length) starts = pl.scenes.map((s) => Number(s.start ?? s.start_s)).filter(Number.isFinite); }
      let cuts = starts ? starts.slice(1) : null;
      if (!cuts && args.events) { cuts = eventRows(exists(path.resolve(String(args.events)), "events")).filter((e) => /^(transition|cut|seam)/i.test(String(e.kind || e.id || "")) && Number.isFinite(Number(e.t))).map((e) => Number(e.t)); }
      cuts = (cuts || []).filter((c) => c > 0.5 && c < dur - 0.5).sort((a, b) => a - b);
      let phrases = null, from = null;
      if (args.words && sc) {
        const M = readJSON(exists(path.resolve(String(args.words)), "audio meta"));
        const ws = [];
        for (const v of M.voices || []) { const st = sc.find((x) => x.n === Number(v.frame))?.start; if (st == null) continue; for (const w of v.words || []) ws.push({ start: st + Number(w.start), end: w.end != null ? st + Number(w.end) : undefined }); }
        if (ws.length) { phrases = phrasesFromWords(ws); from = "word timings"; }
      }
      if (!phrases && args.vo) { phrases = speechPhrases(decode(exists(path.resolve(String(args.vo)), "vo stem"))); from = "vo stem"; }
      if (!phrases) shape.split_edits = { skipped: "no VO stem or word timings: pass --vo <stem> (or --words <audio_meta.json> with --scenes) (the split-edit check did not run)" };
      else if (cuts.length < 4) shape.split_edits = { skipped: `${cuts.length} cut${cuts.length === 1 ? "" : "s"} found (needs 4: pass --scenes, --plan with scenes, or --events with transitions) (the split-edit check did not run)`, phrases: phrases.length };
      else {
        const E = splitEdits(cuts, phrases);
        shape.split_edits = { from, cuts: cuts.length, phrases: phrases.length, j_cuts: E.j.map(r1), l_cuts: E.l.map(r1), count: E.count, need: 2 };
        if (E.count < 2) warnings.push(`no-split-edits: ${E.count} J-cut or L-cut in ${cuts.length} cuts (needs 2: a phrase starting 0.15-1.5 s before a cut and running past it, or ending 0.15-1.5 s after it): every cut lands with the voice, so the film steps instead of flows${E.fits.length ? `; a split edit would fit at ${E.fits.slice(0, 5).map((c) => r1(c) + " s").join(", ")}` : ""} (move the next line's start before the cut, or let the last line run over it; references/sound.md)`);
      }
    }
    measures.shape = shape;
  }
  // wave 7 sync checks: every one a WARNING, thresholds uncalibrated (numbers in measures.sync)
  {
    const sync = {};
    // cuts on sound onsets: pros land about 35% of their cuts within 80 ms of an onset; the near misses (80-300 ms) say how far to slide each cut
    try {
      const cuts = cutTimes(dur);
      if (cuts.length >= 4) {
        const my = args.music ? decode(exists(path.resolve(String(args.music)), "music stem")) : y;
        const on = onsetTimes(my), R = cutOnsetShare(cuts, on);
        sync.cut_onset = { on: args.music ? "music stem" : "mix", ...R, need: 0.2 };
        if (R.share != null && R.share < 0.2) warnings.push(`cut-onset-share: ${R.on_onset} of ${R.cuts} cuts (${Math.round(R.share * 100)}%) land within 80 ms of a sound onset (professional cuts about 35%, needs 20%)${R.near_misses.length ? `; near misses: ${R.near_misses.slice(0, 5).map((m) => `cut ${m.cut} s, onset ${m.off_ms > 0 ? "+" : ""}${m.off_ms} ms`).join("; ")}` : ""} (slide the cut onto the onset, or the sound onto the cut)`);
      } else sync.cut_onset = { skipped: `${cuts.length} cut(s) found (needs 4: --scenes, --plan with scenes or --events with transitions)` };
    } catch (e) { sync.cut_onset = { skipped: String(e.message).slice(0, 100) }; }
    // text lands 0-2 frames BEFORE the spoken word (5 for a name reveal): events with a "word" (kind text/title/label/name/caption/type)
    try {
      const ws = filmWords(), fps = Number(args.fps) || 30, rows = [];
      if (ws.length) {
        for (const e of eventList().filter((e) => e.word && /^(text|title|headline|label|name|caption|type|line)/i.test(String(e.kind || "")) && Number.isFinite(Number(e.t)))) {
          const t = Number(e.t), w = ws.filter((x) => normW(x.text) === normW(e.word) && Math.abs(x.start - t) <= 1.5).sort((a, b) => Math.abs(a.start - t) - Math.abs(b.start - t))[0];
          if (!w) continue;
          const lead = (w.start - t) * fps, max = e.name || /name/i.test(String(e.kind)) ? 5 : 2;
          rows.push({ event: e.id || null, word: e.word, text_at: r3(t), word_at: r3(w.start), lead_frames: r1(lead), max_frames: max });
          if (lead < -0.5 || lead > max + 0.5) warnings.push(`text-lands-before-word: "${e.word}" is on screen at ${r1(t)} s and spoken at ${r1(w.start)} s: the text lands ${r1(lead)} frames before the word (wanted 0 to ${max}): ${lead < 0 ? "it lands after the voice, so the viewer hears it first" : "it sits there too long before the voice says it"}`);
        }
        sync.text_before_word = { checked: rows.length, rows };
      } else sync.text_before_word = { skipped: "needs --words <audio_meta.json> with --scenes, and events that carry a word" };
    } catch (e) { sync.text_before_word = { skipped: String(e.message).slice(0, 100) }; }
    // low mud: the share of energy under 300 Hz per 0.5 s window of the mix
    try {
      const rows = lowShare(file), live = rows.length;
      if (live >= 6) {
        const mud = rows.map((r) => r.share >= 0.8);
        let run = 0, maxRun = 0;
        for (const m of mud) { run = m ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
        const frac = mud.filter(Boolean).length / live;
        sync.low_mud = { windows: live, mud_share: r3(frac), longest_run_s: maxRun * 0.5, median_low_share: r3([...rows].map((r) => r.share).sort((a, b) => a - b)[Math.floor(live / 2)]), need: "under 30% of windows, no run over 3 s" };
        if (frac >= 0.3 || maxRun >= 6) warnings.push(`low-mud: ${Math.round(frac * 100)}% of the mix's 0.5 s windows are 80% or more energy under 300 Hz (longest run ${maxRun * 0.5} s): the film is boomy and the voice and the SFX sit in the mud (high-pass the SFX at 100 Hz, cut the bed 2-3 dB around 200-300 Hz under speech, thin the low end of the music)`);
      }
    } catch (e) { sync.low_mud = { skipped: String(e.message).slice(0, 100) }; }
    // the approved mix must not change across fix rounds unless a note asked (sound.mjs lock)
    if (args.locked) {
      const lf = lockPath(file);
      if (!fs.existsSync(lf)) sync.lock = { skipped: `no lock at ${lf}: run sound.mjs lock after the audio is approved` };
      else {
        const L = readJSON(lf), R = compareFingerprint(L, audioFingerprint(file));
        sync.lock = { lock: lf, locked_at: L.locked_at || null, ...R };
        if (!R.identical && args["note-asked"] && args["note-asked"] !== true) sync.lock.allowed_by_note = String(args["note-asked"]);
        else if (!R.identical) warnings.push(`audio-changed: the approved mix changed since it was locked (${R.only_encoding ? "same levels, different encoding" : `${R.moved_windows} windows moved by over 0.5 dB${R.spans_s.length ? `, at ${R.spans_s.map((x) => x.join("-") + " s").join(", ")}` : ""}`}; length ${R.duration_was} s then, ${R.duration_now} s now): a fix round touched the sound and no note asked for it (re-render with the locked audio, or pass --note-asked "<the note>" if one did and re-run sound.mjs lock)`);
      }
    }
    measures.sync = sync;
  }
  // SFX density
  if (args.sfx) {
    const cues = sfxTimes(String(args.sfx)).sort((a, b) => a.t - b.t);
    const narrated = !!args.narrated || !!args.vo;
    const mode = sfxMode({ format: args.format, narrated }), B = BUDGET[mode];
    const maxWin = cues.reduce((m, c) => Math.max(m, cues.filter((d) => d.t >= c.t && d.t < c.t + 1).length), 0);
    const whooshes = cues.filter((c) => /whoosh/i.test(c.kind)).length;
    if (!cues.length && dur >= 15) {
      if (args["silent-by-choice"] && args["silent-by-choice"] !== true) measures.silent_by_choice = String(args["silent-by-choice"]);
      else P("no-sfx", `0 SFX cues in a ${r1(dur)} s film`, "cues on transitions, landings, taps, counters and the reveal", "run sound.mjs sfx-plan with the score's events and seams after the build and mount the cues (whoosh on moves through space, hit on landings, click on taps, tick on counters, impact on the reveal); or pass --silent-by-choice \"<reason>\" for a film that is silent on purpose");
    }
    // wave 7: SFX audibility (event-window RMS against the music), SFX in designed breaks, SFX on word onsets. Warnings.
    try {
      const sync = measures.sync || (measures.sync = {});
      const my = args.music ? decode(exists(path.resolve(String(args.music)), "music stem")) : y;
      const where = args.music ? "music stem" : "mix (the SFX are in it: the gap is understated; pass --music)";
      const resolveFile = (c) => { if (!c.file) return null; for (const b of [c.base, args.project && args.project !== true ? path.resolve(String(args.project)) : null, process.cwd()].filter(Boolean)) { const f = path.resolve(b, c.file); if (fs.existsSync(f)) return f; const up = path.resolve(b, "..", c.file); if (fs.existsSync(up)) return up; } return null; };
      const rows = [];
      for (const c of cues) {
        const f = resolveFile(c);
        if (!f) continue;
        const sy = decode(f, { duration: 2 });
        let i0 = 0; while (i0 < sy.length && Math.abs(sy[i0]) < 0.02) i0++;
        const sdb = windowDb(sy, i0 / SR, i0 / SR + 0.3) + 20 * Math.log10(Math.max(1e-4, Number(c.volume) || 1)), mdb = windowDb(my, c.t, c.t + 0.3);
        if (mdb > -60) rows.push({ t: r3(c.t), kind: c.kind, sfx_db: r1(sdb), music_db: r1(mdb), gap_db: r1(mdb - sdb) });
      }
      sync.sfx_audibility = { on: where, measured: rows.length, of: cues.length, buried_at_db: 26 };
      const buried = rows.filter((r) => r.gap_db >= 26);
      if (buried.length) warnings.push(`sfx-buried: ${buried.length} of ${rows.length} measured SFX sit 26 dB or more under the ${args.music ? "music" : "mix"} in their 0.3 s window (${buried.slice(0, 5).map((r) => `${r.kind} at ${r.t} s, ${r.gap_db} dB`).join("; ")}): nobody hears them (raise the cue 6-12 dB, dip the bed under it, or drop it)`);
      if (!rows.length) sync.sfx_audibility.skipped = "no cue file could be read (give --project, or an --sfx file whose cues carry their file and volume)";
      const br = designedBreaks(momentaryDb(my, 0.1), 0.1).breaks;
      sync.sfx_in_break = { breaks: br.length, empty: br.filter((b) => !cues.some((c) => c.t >= b.from - 0.1 && c.t <= b.to + 0.1)).map((b) => [b.from, b.to]) };
      if (br.length && cues.length && sync.sfx_in_break.empty.length === br.length) warnings.push(`sfx-in-break: none of the ${br.length} designed break${br.length === 1 ? "" : "s"} (${br.slice(0, 3).map((b) => b.from + "-" + b.to + " s").join(", ")}) carries a sound: the silence is empty, and one dry tick or hit inside it is what makes it read as designed`);
      const ws = filmWords().filter((w) => normW(w.text).length >= 4);
      if (ws.length) {
        const bad = cues.filter((c) => !(c.notes || []).some((n) => /on a word onset on purpose/.test(n)) && !/logo|reveal|impact|stinger|hit/i.test(String(c.kind)) && ws.some((w) => Math.abs(w.start - c.t) < 0.15));
        sync.sfx_on_word = { words: ws.length, clashing: bad.map((c) => r3(c.t)) };
        if (bad.length) warnings.push(`sfx-on-word-onset: ${bad.length} SFX land within 150 ms of a spoken word's onset (${bad.slice(0, 5).map((c) => r1(c.t) + " s " + c.kind).join(", ")}) without being placed there on purpose: they fight the word (sfx-plan --words moves them 1-2 frames, or mark the event on_word: true to land with the word)`);
      }
    } catch (e) { (measures.sync ||= {}).sfx_checks = { skipped: String(e.message).slice(0, 120) }; }
    Object.assign(measures, { sfx_count: cues.length, sfx_per_s: r3(cues.length / dur), sfx_max_in_1s: maxWin, whooshes });
    if (sfxOver(cues.length, mode, dur)) P("SFX density", `${cues.length} SFX in ${r1(dur)} s`, `<= ${sfxLimit(mode, dur)}`, "keep only causal events (clicks, lands, the reveal): sound.mjs sfx-plan enforces the budget");
    if (maxWin > B.perWindow) P("SFX pile-up", `${maxWin} sounds within one second`, `<= ${B.perWindow}`, "drop or spread the weakest cues");
    if (whooshes > Math.max(1, Math.ceil(dur / B.whooshEvery))) P("whoosh per cut", `${whooshes} whooshes`, `<= ${Math.max(1, Math.ceil(dur / B.whooshEvery))}`, "whooshes only on signature spatial transitions");
  }
  else if (dur >= 15 && !(args["silent-by-choice"] && args["silent-by-choice"] !== true)) warnings.push("no-sfx: no --sfx given, so no sound effects were measured (a film of 15 s or more needs cues: sound.mjs sfx-plan after the build, then --sfx <sfx-plan.json|index.html>)");
  const ok = problems.length === 0;
  out({ ok, file, measures, problems, warnings });
  if (!ok) process.exit(2);
}

// ============================================================== lock

// A bed that loops (a declared loop): cut on a bar line L, with the music after L (L .. L + x) faded out under the head
// (0 .. x) faded in, both quarter-sine so the power stays level. Both pieces are in the same bar phase, so the beat does not slip at the seam.
function loopBed(plan, input, output, xf) {
  const dur = probeDuration(input);
  const x = Math.min(0.5, Math.max(0.25, Number.isFinite(xf) ? xf : 0.35));
  const bars = ((plan.grid && plan.grid.downbeats) || []).map(Number).filter(Number.isFinite);
  const bs = Number(plan.bar_s) > 0 ? Number(plan.bar_s) : null;
  let L = null, how = "bar grid";
  const minL = Math.max(2 * (bs || 2), Math.min(6, dur * 0.5));
  for (const d of bars) if (d + x <= dur + 1e-6 && d >= minL && (L == null || d > L)) L = d;
  if (L == null && bs) { how = "bar length from the start (no film-time grid in the plan)"; L = Math.floor((dur - x) / bs) * bs; if (L < minL) L = null; }
  if (L == null) return { ok: false, note: "no bar line leaves room for the crossfade: render without --loop, or fit a longer track" };
  const f3 = (v) => v.toFixed(3);
  const g = `[0:a]asplit=3[a][b][c];[a]atrim=0:${f3(x)},asetpts=PTS-STARTPTS,afade=t=in:d=${f3(x)}:curve=qsin[h];[b]atrim=${f3(L)}:${f3(L + x)},asetpts=PTS-STARTPTS,afade=t=out:d=${f3(x)}:curve=qsin[t];[h][t]amix=inputs=2:normalize=0:duration=longest[m];[c]atrim=${f3(x)}:${f3(L)},asetpts=PTS-STARTPTS[body];[m][body]concat=n=2:v=0:a=1[out]`;
  const tmp = path.join(os.tmpdir(), `rasa-loop-${process.pid}-${Date.now()}.wav`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", input, "-filter_complex", g, "-map", "[out]", "-ar", "48000", "-c:a", "pcm_s24le", tmp]);
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.copyFileSync(tmp, output); fs.rmSync(tmp, { force: true });
  return { ok: true, out: path.resolve(output), loop_s: r3(probeDuration(output)), cut_at_bar: r3(L), cut_from: how, xfade_s: x, curve: "quarter-sine (equal power)", bed_s: r3(dur), dropped_tail_s: r3(dur - L - x), note: "the loop is loop_s long: make the film's loop length match so picture and sound wrap together" };
}

// sound.mjs lock (--video <mp4> | --audio <file>) [--run <dir>] [--out <lock.json>]: hash the approved mix so later fix rounds can prove they left it alone
function lock() {
  const src = exists(path.resolve(String(args.video || args.audio || need("audio", "<file> (or --video <mp4>)"))), "input");
  if (!hasAudioStream(src)) die("the file has no audio track to lock");
  const o = args.out && args.out !== true ? path.resolve(String(args.out)) : lockPath(src);
  const fp = audioFingerprint(src);
  writeFile(o, JSON.stringify({ locked_at: new Date().toISOString(), file: path.basename(src), ...fp }, null, 2) + "\n");
  out({ ok: true, lock: o, pcm_sha256: fp.pcm_sha256, duration: fp.duration, next: `after every fix round: sound.mjs check --video <new render> --locked ${path.relative(process.cwd(), o)} (a warning when the mix moved; --note-asked "<note>" when a note asked for it)` });
}

// ============================================================== dispatch (last: the tables above must exist)

if (cmd === "analyze") {
  track("Listening to the track: tempo, bars, sections, ending", "Track analysed");
  const f = exists(path.resolve(need("track", "<file>")), "track");
  const A = analyzeTrack(f);
  const o = publicAnalysis(A, { full: !!args.full });
  o.summary = summarize(A);
  o.estimates = labelEstimates(A); // Plan 07 A3: tempo detected | uncertain | undetected (bpm null when detection failed), meter assumed, sections estimated
  out(o);
} else if (cmd === "fit") {
  track("Fitting the music to the film on bar lines", "Music edit planned");
  const f = exists(path.resolve(need("track", "<file>")), "track");
  const sc = args.scenes ? readScenes(String(args.scenes)) : null;
  const film = args.film != null ? Number(args.film) : sc ? sc.total : NaN;
  if (!(film > 0)) die("--film <seconds> (or --scenes with durations) required");
  let reveal = args.reveal != null ? Number(args.reveal) : null;
  let logo = args.logo != null ? Number(args.logo) : null;
  if (sc && reveal == null) {
    const r = sc.scenes.find((s) => /product_intro|reveal/i.test(s.type) || /\breveal/i.test(s.title));
    if (r) reveal = r.start;
  }
  // an original procedural score (original-score.mjs) is already the film's length and built to its events: its own plan goes through the
  // same fit / render / check, never re-cut on bar lines (that would move its hits off the picture)
  const side = readSidecar(f);
  const exact = side && Math.abs(side.duration_s - film) <= 0.05 ? side : null;
  const A = exact ? null : analyzeTrack(f, { quick: true });
  const plan = exact ? { ...identityPlan(f, { duration_s: film, ending: exact.ending, hits: exact.hits }), track_summary: `original procedural score (${exact.key}, ${exact.bpm} BPM, seed ${exact.seed}), ${exact.sections.length} sections`, license: exact.license } : fitTrack(A, { film, reveal, logo, scenes: sc ? sc.scenes : null, flex: args.flex, softStart: !!args["soft-start"], xfade: args.xfade, preroll: args.preroll });
  if (!exact) plan.track_summary = summarize(A);
  // Plan 07 A3: label what is estimated, and refuse what is not a fit: a track too short for the film (no endless loop), a repeat nobody declared, and a trim of a music-led film nobody authorized (an exact original score is already the film's length)
  plan.estimates = exact ? [] : labelEstimates(A);
  plan.guard = exact ? { ok: true, errors: [], warnings: [], repeats: [], material_s: film, film_s: film } : fitGuard(plan, A, { music_led: !!args["music-led"], trim_authorized: !!args["trim-authorized"], loop_declared: !!args.loop || plan.loop === true, film_s: film, user_track: !!args["user-track"] });
  if (args.out) {
    writeFile(path.resolve(String(args.out)), JSON.stringify(plan, null, 2) + "\n");
    plan.render = `node ${path.relative(process.cwd(), process.argv[1])} render --plan ${args.out} --out <bed.wav>`;
  }
  if (args["write-scenes"] && sc && plan.scenes) {
    const S = JSON.parse(JSON.stringify(sc.raw));
    plan.scenes.forEach((p, i) => {
      if (!S.scenes[i]) return;
      if (S.scenes[i].duration_s != null) { S.scenes[i].duration_s = p.duration; S.scenes[i].start_s = p.start; }
      else S.scenes[i].duration = p.duration;
    });
    if (S.total_s != null) S.total_s = plan.film_duration;
    writeFile(path.resolve(String(args["write-scenes"])), JSON.stringify(S, null, 2) + "\n");
    plan.wrote_scenes = path.resolve(String(args["write-scenes"]));
  }
  out(plan);
  if (plan.needs_longer && !plan.segments.length) process.exit(2);
  if (!plan.guard.ok && !args["allow-guard"]) process.exit(2); // --allow-guard: the person saw the guard and wants the plan anyway
} else if (cmd === "render") {
  track("Cutting the music bed", "Music bed rendered");
  const plan = readJSON(exists(path.resolve(need("plan", "<plan.json>")), "plan"));
  const o = renderPlan(plan, String(need("out", "<bed.wav>")), { lufs: targetLufs(), tp: limitTp() });
  o.shape = plan.shape;
  o.film_duration = plan.film_duration;
  if (args.loop || plan.loop === true) o.loop = loopBed(plan, path.resolve(String(args.out)), path.resolve(String(args.out)), args["loop-xfade"] != null ? Number(args["loop-xfade"]) : NaN);
  // the bed sits at -14 LUFS: unnarrated it plays at 1.0; under a ~-16 LUFS VO it should sit
  // ~12 LU lower (-28 LUFS): volume 0.2. check --vo/--music measures the real gap.
  o.volume = { unnarrated: 1.0, under_voiceover: 0.2 };
  if (plan.button_sfx) o.button_sfx = plan.button_sfx;
  out(o);
} else if (cmd === "loop-bed") {
  track("Making the music bed loop", "Bed loops");
  const plan = readJSON(exists(path.resolve(need("plan", "<plan.json>")), "plan"));
  const src = exists(path.resolve(need("in", "<bed.wav>")), "bed");
  out(loopBed(plan, src, path.resolve(need("out", "<loop.wav>")), args["loop-xfade"] != null ? Number(args["loop-xfade"]) : NaN));
} else if (cmd === "master") {
  track("Mastering the sound to -14 LUFS", "Sound mastered");
  const src = exists(path.resolve(String(args.video || args.audio || need("audio", "<file> (or --video <mp4>)"))), "input");
  out(masterFile(src, String(need("out", "<file>")), { lufs: targetLufs(), tp: limitTp() }));
} else if (cmd === "probe") {
  const files = args._.slice(1);
  if (!files.length) die("usage: sound.mjs probe <sfx files...>");
  out(files.map((f) => probeSfx(exists(path.resolve(f), "sfx"))));
} else if (cmd === "sfx-plan") {
  track("Placing sound effects on causal moments only", "SFX planned");
  sfxPlan();
} else if (cmd === "lock") {
  track("Locking the approved mix", "Mix locked");
  lock();
} else if (cmd === "check") {
  track("Measuring the mix: loudness, peaks, loops, SFX density", "Audio checked");
  check();
} else {
  die("usage: sound.mjs analyze|fit|render|loop-bed|sfx-plan|check|lock|master|probe ... (see the header)");
}
