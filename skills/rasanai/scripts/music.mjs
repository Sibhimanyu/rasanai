#!/usr/bin/env node
// Music for the Music step: the user's own track first, then a track generated to the film's arc
// (when the user has a key), then a curated catalog of gated CC0 / CC BY and Mixkit tracks, then
// HeyGen's catalog, ccMixter and, last and strictest, Openverse. Every candidate is analysed
// (sound.mjs analyze), measured by the quality gate (sub bass, upper-mid harshness, bandwidth,
// stereo width, punch, loudness range: references/sound.md, "The quality gate") and fitted to the
// film (sound.mjs fit); `preview` is the fitted bed, so the user hears the edit the film gets.
//
//   node music.mjs --run <run dir> --film <seconds> [--arc <score.json | '{"drop_at":9,...}'>]
//        [--intents "one|two|three"] [--style "<visual style words>"] [--story "<arc / tone words>"]
//        [--format launch|explainer|reel|kinetic|brand|premium] [--narrated] [--count 3]
//        [--track <file or folder with stems> [--library artlist|epidemic|epidemic-connect|musicbed|...] [--declared "<where it is licensed>"] [--more]]
//        [--sources user,ai,catalog,heygen,ccmixter,openverse,procedural] [--no-ai] [--pick <catalog id>] [--no-preview]
//        [--procedural [--identity <file>] [--seed <n>]] [--silent-by-choice "<reason>"]
//        [--sound <sound-choices.json>] [--constraints '<json | file: {hard:{exclude_terms,...}, preferences:{...}}>'] [--recent "id,id"] [--allow-generation]
//   THE STORY GATE: the run needs <run>/story/chosen.json and an arc (a turn: drop_at, a break before the end card, payoff_at, button_at) from --arc, motion/score.json or the manifest's music cues,
//   else the script refuses (exit 2, JSON {refused, missing}); --unplanned "<reason>" is the one logged escape. With the gate, every candidate (as cut to the film) is measured against the arc
//   from its own audio (lib/audio.mjs arcFit: sparse intro, lift at the turn, break before the end card, peak between turn and payoff; under 55/100 is unusable) and ranked by it, not by style tags;
//   the original score (original-score.mjs) is tried right after --track and competes on the same measure (--no-procedural skips it). --track <file> is how the director or console passes the user's own track.
//   --sound: the film's sound choices (default: <run>/audio/sound-choices.json when it exists; none = the legacy behaviour, unchanged). Feeling, perceived energy (pace as
//   energy, never as BPM), narration space and music source shape the intents and the ranking; `music_source: none` makes no music and is never replaced; `user_track` is used first.
//   --constraints: HARD exclusions (the user's own) kept apart from ranking preferences. With neither flag the global cliche/instrument lists below apply exactly as before.
//   --allow-generation: the film's explicit consent to generated music (a key in the environment alone is not consent); the licensed/local catalog is tried first.
//   A shortlist (up to three genuinely different candidates with reasons and evidence state) is added to the JSON as `shortlist` and written to <run>/music/shortlist.json
//   whenever --sound, --constraints or a sound-choices file is present. node music.mjs revise --run <run> --text "warmer" [--track-id <id>] [--save-preference] re-ranks that file (no network, no audio).
//   procedural = an original score synthesised offline to the film's events (scripts/original-score.mjs, references/procedural-music.md): an explicit choice (--procedural,
//   or "procedural" in --sources: it comes right after the user's own track) and the offline fallback when nothing else was usable. The user's own track always wins;
//   --silent-by-choice makes no music at all.
//        [--hits "1.2,4.8,9.0" | --events <events.json>] [--no-hit-tempo]
//   The tempo comes from the picture when it has 3 or more hit times (--hits, --events, the score's hits/events/seams, or a real music_arc's drop, payoff and
//   button): 70-140 BPM is scanned and the tempo whose worst hit sits closest to a beat wins (ties go to the style's own range), instead of the style's
//   default. <run>/music/hits.json keeps the grid, the error per hit and each hit's treatment (direct / anticipation / aftermath / no-hit: references/sound.md).
//   -> {"options":[{id,title,mood,duration,file,preview,source,origin,license,attribution,credit,url,bpm,
//                   summary,ending,strong_from,score,quality,fit,usable,problems,warnings}],
//       "suggestions":[Mixkit cards, fetched only when picked: --pick <id>], "recommended", "chain", "arc", "credits", ...}
//   node music.mjs gate --track <file> [--family <id>] [--narrated]     the measured gate on one file
//   node music.mjs chain                                                 the source chain for this environment
//   node music.mjs verify [--deep] [--mixkit]                            maintainer: the catalog schema, then HEAD every file URL (audio/*); --deep also re-checks each SHA-256; Mixkit is skipped unless --mixkit
//   node music.mjs credits --run <run dir> --pick <option id> [--description <file>]   credits for the pick
//
// Keys come only from the user's own environment and each source drops out silently without one:
// RASANAI_ELEVENLABS_API_KEY (ElevenLabs Music), RASANAI_STABILITY_API_KEY (Stable Audio),
// RASANAI_EPIDEMIC_TOKEN (Epidemic Connect, used by the user in their own session). Nothing is
// shipped or borrowed. Never: Jamendo's API, Freesound's API at runtime, Bensound, scraping any
// paid library, Higgsfield seed_audio (a speech model). Licences and credits go to
// <run>/music/LICENSES.json, CREDITS.txt and description.txt.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseArgs, die } from "./lib/common.mjs";
import { findSkill } from "./lib/hyperframes.mjs";
import { track } from "./lib/report.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";
import { loadManifest, presentManifest, hitTimes as manifestHits } from "./lib/film-events.mjs";
import { editToPicture } from "./lib/music-edit.mjs";
import { analyzeTrack, summarize, fitTrack, renderPlan, toolsAvailable, bpmFromHits, treatHits, arcFit } from "./lib/audio.mjs";
import { resolveIdentity, renderScore, identityPlan, sidecarPath, readSidecar } from "./lib/procedural-score.mjs";
import { KEYS, PRIOR, sourceChain, licenceNote, findUserTrack, judge, readArc, buildPrompt, elevenPlan, loadCatalog, validateCatalog, pickFromCatalog, creditsText, styleExclusions } from "./lib/music-lib.mjs";
import { readSoundChoices, resolveSound } from "./lib/sound-choices.mjs";
import { KEY as SRC_KEY, CAVEATS, warn as warnLicence, aceStep, localGen, buildLocalPrompt } from "./lib/sound-sources.mjs";
import { normalizeConstraints, rankCandidates, pickThree, reviseShortlist, candidateFromOption, buildShortlistRecord, previewPlan } from "./lib/music-shortlist.mjs";

// the plain env names the vendors document work too (ELEVENLABS_API_KEY, STABILITY_API_KEY); the RASANAI_ names stay first
if (!process.env[KEYS.elevenlabs] && process.env.ELEVENLABS_API_KEY) process.env[KEYS.elevenlabs] = process.env.ELEVENLABS_API_KEY;
if (!process.env[KEYS.stable] && process.env.STABILITY_API_KEY) process.env[KEYS.stable] = process.env.STABILITY_API_KEY;
const args = parseArgs();
const mode = ["gate", "chain", "credits", "verify", "revise", "local-setup", "edit"].includes(args._[0]) ? args._[0] : "run";
const ws = process.cwd();
const rel = (p) => path.relative(ws, p) || p;

if (mode === "local-setup") {
  // installs the local music generator (ACE-Step 1.5, MIT) into ~/.cache/rasanai/acestep-venv with uv on Python 3.12; never the system Python. About 9 GB on disk.
  if (args.status) { console.log(JSON.stringify(localGen.status(), null, 2)); process.exit(0); }
  const r = localGen.setup();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
if (mode === "edit") {
  // node music.mjs edit --track <take.wav> --film <s> --arc '<json | file>' [--bpm 120] --out <edited.wav>: cut one generated take onto the arc (lib/music-edit.mjs); prints arcFit before (fitted bed) and after
  if (!args.track || !args.film || !args.out) die("usage: music.mjs edit --track <take> --film <seconds> --arc <json|file> [--bpm <n>] [--lyrics <file>] --out <wav>");
  const filmS = Number(args.film), { arc: arcE } = readArc(args.arc, filmS);
  const trk = path.resolve(String(args.track)), outF = path.resolve(String(args.out));
  const A0 = analyzeTrack(trk, { quick: true });
  let before = null;
  try { const plan0 = fitTrack(A0, { film: filmS, reveal: arcE.drop_at, logo: arcE.button_at }); const pv = outF.replace(/\.[^.]+$/, "") + ".before.wav"; renderPlan(plan0, pv); before = { arc_fit: arcFit(pv, arcE, filmS), shape: plan0.shape }; fs.rmSync(pv, { force: true }); } catch (e) { before = { error: String(e.message).slice(0, 120) }; }
  const lyricsE = args.lyrics && args.lyrics !== true ? fs.readFileSync(path.resolve(String(args.lyrics)), "utf8") : "";
  const r = editToPicture({ file: trk, arc: arcE, film: filmS, bpm: args.bpm ? Number(args.bpm) : null, out: outF, lyrics: lyricsE });
  console.log(JSON.stringify({ ...r, arc: arcE, before: { arc_fit_score: before.arc_fit ? before.arc_fit.score : null, parts: before.arc_fit ? before.arc_fit.parts : null, error: before.error } , after: { arc_fit_score: r.arc_fit.score, parts: r.arc_fit.parts, problems: r.arc_fit.problems } }, null, 2));
  process.exit(0);
}
if (mode === "chain") {
  console.log(JSON.stringify(sourceChain(process.env, { user: !!args.track, noAi: !!args["no-ai"], generationConsent: !!args["allow-generation"], procedural: !!args.procedural, sources: args.sources ? String(args.sources).split(",").map((s) => s.trim()).map((s) => (s === "curated" ? "catalog" : s)) : null }), null, 2));
  process.exit(0);
}
if (mode === "gate") {
  if (!args.track) die("--track <file> required");
  // the quality gate measures the sound itself; the beat analysis only places the window, so a track too short or
  // too noisy to analyse is still judged
  let A = null;
  try { A = analyzeTrack(String(args.track), { quick: true }); } catch {}
  console.log(JSON.stringify({ track: args.track, ...judge(String(args.track), { kind: args.user ? "user" : "catalog", family: args.family, title: path.basename(String(args.track)), A, narrated: !!args.narrated }) }, null, 2));
  process.exit(0);
}
if (mode === "verify") {
  const { cat, file } = loadCatalog();
  const errs = validateCatalog(cat);
  const out = { catalog: rel(file), tracks: cat.tracks.length, schema_errors: errs, checked: 0, bad: [] };
  for (const t of cat.tracks) {
    if (t.fetch !== "auto" && !args.mixkit) continue;
    out.checked++;
    try {
      const res = await fetch(t.mirror_ok && t.mirror ? t.mirror : t.url, { method: "HEAD", redirect: "follow", headers: { "user-agent": "RasanAI-music/1" }, signal: AbortSignal.timeout(30000) });
      if (!res.ok || !/^audio\//.test(res.headers.get("content-type") || "")) out.bad.push({ id: t.id, why: `HTTP ${res.status} ${res.headers.get("content-type")}` });
      else if (args.deep && t.sha256) {
        const b = Buffer.from(await (await fetch(t.mirror_ok && t.mirror ? t.mirror : t.url, { headers: { "user-agent": "RasanAI-music/1" } })).arrayBuffer());
        if (crypto.createHash("sha256").update(b).digest("hex") !== t.sha256) out.bad.push({ id: t.id, why: "sha256 changed" });
      }
    } catch (e) {
      out.bad.push({ id: t.id, why: String(e.message).slice(0, 80) });
    }
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(errs.length || out.bad.length ? 2 : 0);
}
if (mode === "credits") {
  if (!args.run || !args.pick) die("--run and --pick <option id> required");
  const dirc = path.resolve(String(args.run), "music");
  const led = JSON.parse(fs.readFileSync(path.join(dirc, "LICENSES.json"), "utf8"));
  const it = led.find((l) => l.id === args.pick);
  if (!it) die(`no option "${args.pick}" in ${path.join(dirc, "LICENSES.json")}`);
  const t = creditsText(it);
  fs.writeFileSync(path.join(dirc, "CREDITS.txt"), t.credits);
  fs.writeFileSync(path.join(dirc, "description.txt"), t.description);
  if (args.description && t.description) {
    const f = path.resolve(String(args.description));
    const cur = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
    if (!cur.includes(t.description.trim())) fs.writeFileSync(f, `${cur}${cur && !cur.endsWith("\n") ? "\n" : ""}${cur ? "\n" : ""}${t.description}`);
  }
  console.log(JSON.stringify({ credits: rel(path.join(dirc, "CREDITS.txt")), description: rel(path.join(dirc, "description.txt")), requires_credit: !!t.description }, null, 2));
  process.exit(0);
}

if (mode === "revise") {
  // re-rank the stored shortlist from a request: no network, no audio, no provider; a like stays session-scoped unless --save-preference
  if (!args.run) die("--run required");
  const f = path.resolve(String(args.run), "music", "shortlist.json");
  if (!fs.existsSync(f)) die(`no ${rel(f)}: run the music step with --sound or --constraints first`);
  const prev = JSON.parse(fs.readFileSync(f, "utf8"));
  const rv = reviseShortlist({ ...prev, candidates: prev.candidates || [], rank_opts: prev.rank_opts || {} }, { text: args.text && args.text !== true ? String(args.text) : "", action: args.action && args.action !== true ? String(args.action) : undefined, track_id: args["track-id"] && args["track-id"] !== true ? String(args["track-id"]) : undefined, save_preference: !!args["save-preference"] });
  const picks = rv.rerank ? rv.rerank.picks : null;
  const next = { ...prev, ...buildShortlistRecord({ picks, ranked: rv.rerank, selected: rv.selected, revision: rv.revision, constraints: rv.constraints, film_s: prev.film_s, sound_digest: prev.sound_digest, prev_revision: prev.revision }), candidates: prev.candidates, rank_opts: prev.rank_opts, liked: rv.liked };
  fs.writeFileSync(f, JSON.stringify(next, null, 2) + "\n");
  console.log(JSON.stringify({ revision: rv.revision, actions: rv.actions, note: rv.note, selected: rv.selected, liked: rv.liked, section_request: rv.section_request, saved_preferences: rv.saved_preferences, needs_consent: rv.needs_consent, generation: rv.generation, shortlist: { options: picks ? picks.options.map((o) => ({ id: o.id, title: o.title, score: o.score, picked_for: o.picked_for, reasons: o.reasons.slice(0, 6), evidence_state: o.evidence_state })) : [], note: picks ? picks.note : null }, file: rel(f) }, null, 2));
  process.exit(0);
}

track("Finding music long enough for the film", "Music candidates ready");
if (!args.run) die("--run required");
const film = Number(args.film) || null;
const minLen = film ? film + 4 : 45;
const count = Math.max(2, Math.min(4, Number(args.count) || 3));
const dir = path.resolve(String(args.run), "music");
fs.mkdirSync(dir, { recursive: true });
const notes = [];
// the film's sound choices (audio/sound-choices.json or --sound): absent = the legacy behaviour, byte for byte
let SOUND = null;
try {
  let raw = null;
  if (args.sound && args.sound !== true) raw = JSON.parse(fs.readFileSync(path.resolve(String(args.sound)), "utf8"));
  else { const r = readSoundChoices(path.resolve(String(args.run))); if (r.ok) raw = r.record; }
  if (raw) {
    const rs = resolveSound({ choices: raw, format: args.format || undefined, narrated: args.narrated ? true : undefined, film_s: film });
    if (rs.legacy) notes.push("--sound held no usable choices: the legacy behaviour applies"); else SOUND = rs;
  }
} catch (e) { notes.push(`sound choices unreadable (${String(e.message).slice(0, 80)}): the legacy behaviour applies`); }
const SR = SOUND ? SOUND.resolved : null;
// hard constraints (the user's own) are separate from ranking preferences; with neither a direction nor constraints the global lists apply as before
let CONSTRAINTS = null;
if (args.constraints && args.constraints !== true) {
  try { const v = String(args.constraints); CONSTRAINTS = normalizeConstraints(/^\s*\{/.test(v) ? JSON.parse(v) : JSON.parse(fs.readFileSync(path.resolve(v), "utf8"))); }
  catch (e) { notes.push(`--constraints unreadable (${String(e.message).slice(0, 80)}): ignored`); }
}
const narrated = args.narrated ? true : SR ? SR.voice_role === "carrier" : false;
const DIRECTION = SR ? { feeling: SR.feeling, vocals_ok: SR.music_role === "led" && SR.voice_role !== "carrier", narrated } : null;
const EXCL = styleExclusions({ direction: DIRECTION, constraints: CONSTRAINTS });
// music_source: none is a decision, never silently replaced; user_track is used first when no --track was given
const trackArg = args.track || (SR && SR.user_track && SR.user_track.file && fs.existsSync(path.resolve(String(SR.user_track.file))) ? SR.user_track.file : null);
if (SR && SR.music_source === "user_track" && !trackArg) notes.push("you chose your own track, but no file was given or found (--track <file>): the options below are alternatives, not a replacement for it");
const chain = sourceChain(process.env, { user: !!trackArg, noAi: !!args["no-ai"], generationConsent: !!args["allow-generation"], procedural: !!args.procedural, sources: args.sources ? String(args.sources).split(",").map((s) => s.trim()).map((s) => (s === "curated" ? "catalog" : s)) : null });
// local ACE-Step lane (after the paid generators): on only when the person's own install is set up and the film consents to generation
{
  const aiLane = chain.find((c) => c.id === "ai");
  const cmd0 = SRC_KEY.acestep() ? String(SRC_KEY.acestep()).split(/\s+/)[0] : null;
  const ok = !!(localGen.available() || (cmd0 && fs.existsSync(cmd0)));
  const consent = !!args["allow-generation"] || !!(args.sources && String(args.sources).split(",").includes("acestep"));
  chain.splice(chain.indexOf(aiLane) + 1, 0, { id: "acestep", on: ok && consent && !args["no-ai"], consent, threshold: 65, why: ok ? (consent ? (localGen.available() ? "local-gen: ACE-Step 1.5 in its own uv venv, 2-3 candidates ranked by arc fit" : "local ACE-Step via ACESTEP_CMD, in its own process") : "a local generator is installed, but generation is off for this film: pass --allow-generation") : "no local generator: node scripts/music.mjs local-setup (about 9 GB), or ACESTEP_CMD" });
}
const on = (id) => (chain.find((c) => c.id === id) || {}).on;
const scoreFile = path.resolve(String(args.run), "motion", "score.json");
let { arc, derived: arcDerived } = readArc(args.arc || (fs.existsSync(scoreFile) ? scoreFile : null), film || 30);
if (arcDerived && film) notes.push("no music_arc given (--arc or motion/score.json): the brief uses a default arc for a " + film + " s film");

// ---------------------------------------------------------------- intents

// Words that pull stock libraries toward the "happy corporate" cliché (research R4 §2.3); per direction, not universal, once a sound direction exists
const BANNED = EXCL.banned_re; // the legacy list unless a sound direction or the user's constraints are present (music-lib styleExclusions)
const FAMILIES = [
  { id: "editorial", match: /swiss|editorial|minimal|grid|international|clean|mono|bauhaus|type/i, text: "dry minimal electronic, clean kick, sine bass, one synth arpeggio, tight staccato", bpm: "105-120", ov: ["electronic", "minimal"] },
  { id: "dark-tech", match: /dark|neon|terminal|cyber|code|hacker|glitch|developer|night/i, text: "dark synth electronic, analog bass, glitch percussion, filtered pad", bpm: "110-128", ov: ["synth", "electronic"] },
  { id: "playful", match: /playful|flat|pastel|illustrat|cartoon|friendly|toy|bouncy|kid|fun/i, text: "indie electronic, mallets and plucks, marimba, soft drums, bouncy", bpm: "105-120", ov: ["indie", "electronic"] },
  { id: "cinematic", match: /luxury|cinematic|premium|elegant|apple|serif|noir|keynote|restrain/i, text: "sparse cinematic ambient, warm pads, low strings, sub pulse, long tails", bpm: "70-90", ov: ["ambient", "cinematic"] },
  { id: "raw", match: /brutal|grunge|zine|punk|raw|collage|xerox/i, text: "breakbeat, distorted drums, bitcrushed texture, heavy bass, half-time feel", bpm: "130-170", ov: ["breakbeat", "electronic"] },
  { id: "retro", match: /retro|y2k|vapor|80s|90s|synthwave|arcade|chrome/i, text: "house groove, FM synths, shuffled drums, warm chords", bpm: "120-135", ov: ["house", "synth"] },
  { id: "organic", match: /organic|wellness|nature|calm|warm|craft|hand|paper|earth/i, text: "organic electronica, acoustic textures, warm pads, light percussion, honest space", bpm: "80-100", ov: ["acoustic", "ambient"] },
];
const FORMATS = {
  launch: { structure: "strong from the first bar, one clear lift, a real ending", bpm: null },
  explainer: { structure: "steady carpet, nothing melodic over the voice, small lifts, a real ending", bpm: "85-110" },
  reel: { structure: "hook in the first second, one drop, hard ending", bpm: "118-140" },
  kinetic: { structure: "steady rhythmic grid, builds into the last line, hard ending", bpm: "110-130" },
  brand: { structure: "long build to one climax, resolved ending", bpm: "70-95" },
  premium: { structure: "already playing at the first frame, few elements, one lift, resolved final chord", bpm: "80-100" },
};

function deriveIntents() {
  const fmt = FORMATS[String(args.format || "launch")] || FORMATS.launch;
  const words = `${args.style || ""} ${args.story || ""}`;
  const ranked = FAMILIES.map((f) => ({ f, hit: (words.match(new RegExp(f.match.source, "gi")) || []).length })).sort((a, b) => b.hit - a.hit);
  const picks = [];
  for (const r of ranked) if (r.hit && picks.length < 2) picks.push(r.f);
  const FEEL = { calm: ["organic", "cinematic", "editorial"], warm: ["organic", "editorial", "playful"], playful: ["playful", "editorial", "retro"], bold: ["raw", "dark-tech", "retro"], dramatic: ["cinematic", "dark-tech", "raw"] };
  const fallback = SR && FEEL[SR.feeling && SR.feeling.value] || { launch: ["editorial", "dark-tech", "organic"], explainer: ["organic", "editorial", "cinematic"], reel: ["retro", "raw", "dark-tech"], kinetic: ["editorial", "dark-tech", "raw"], brand: ["cinematic", "organic", "retro"], premium: ["cinematic", "editorial", "organic"] }[String(args.format || "launch")] || ["editorial", "organic", "cinematic"];
  for (const id of fallback) if (picks.length < count && !picks.some((p) => p.id === id)) picks.push(FAMILIES.find((f) => f.id === id));
  const voice = narrated ? ", sits under a voice" : "";
  // with a direction: pace is perceived energy and density (never a tempo), and "no vocals" is stated only where a bed needs it
  const mood = SR ? `${SR.energy.perceived} perceived energy, ${SR.energy.rhythmic_density} rhythm, ${SR.energy.development.replace(/_/g, " ")}` : "";
  const vocals = SR && SR.music_role === "led" && SR.voice_role !== "carrier" ? "instrumental" : "no vocals";
  return picks.slice(0, count).map((f) => ({ family: f, intent: SR ? `${f.text}, ${fmt.bpm || f.bpm} BPM, ${mood}, ${vocals}${voice}, ${fmt.structure}` : `${f.text}, ${fmt.bpm || f.bpm} BPM, no vocals${voice}, ${fmt.structure}` }));
}

let intents;
if (args.intents) {
  const derived = deriveIntents();
  intents = String(args.intents).split("|").map((s) => s.trim()).filter(Boolean).slice(0, 4).map((s, i) => {
    let clean = s.replace(BANNED, "").replace(/\s{2,}/g, " ");
    for (let k = 0; k < 3; k++) clean = clean.replace(/^[,\s]+|[,\s]+$/g, "").replace(/^(with|and|of|in)\b\s*/i, "").replace(/\s*\b(with|and|of|in)$/i, "");
    if (clean !== s) notes.push(`dropped ${EXCL.source === "legacy_default" ? "cliché" : "excluded"} words from "${s}" (${EXCL.source === "legacy_default" ? 'they pull libraries toward stock "happy corporate" tracks' : "stock-library markers or the exclusions you set"})`);
    if (clean.split(/[\s,]+/).filter((w) => w.length > 2).length < 3) {
      const d = derived[i % derived.length];
      notes.push(`"${s}" had too little left to search with: used "${d.intent}" instead`);
      return d;
    }
    const family = FAMILIES.find((f) => f.match.test(clean)) || FAMILIES[0];
    return { family, intent: /no vocals/i.test(clean) ? clean : `${clean}, no vocals` };
  });
} else intents = deriveIntents();

// ---------------------------------------------------------------- sources

const found = []; // {id,title,file,source,kind,origin,license,attribution,url,intent,...}
const seen = new Set();
const bannedIn = (s) => BANNED.test(String(s || "")) && ((BANNED.lastIndex = 0), true);
const UA = "RasanAI-music/1 (+https://github.com/Sibhimanyu/rasanai)";

// http(s) with an honest user agent, a local path or file:// (the offline fixtures), a Referer when a host wants one
async function download(url, dest, { referer, sha256 } = {}) {
  if (/^file:\/\//.test(url) || (!/^https?:\/\//.test(url) && fs.existsSync(url))) {
    fs.copyFileSync(url.startsWith("file://") ? new URL(url) : url, dest);
  } else {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, ...(referer ? { referer } : {}) }, signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  if (sha256) {
    const got = crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex");
    if (got !== sha256) {
      fs.rmSync(dest, { force: true });
      throw new Error(`checksum mismatch (the file at the URL changed): expected ${sha256.slice(0, 12)}, got ${got.slice(0, 12)}`);
    }
  }
  return dest;
}
const styleRange = (it) => {
  const m = String(it.intent).match(/(\d+)(?:-(\d+))?\s*BPM/i);
  return m ? [Number(m[1]), Number(m[2] || m[1])] : null;
};
// the picture's hit times: --hits, --events, the score's hits/events/seams, and a real (not derived) music_arc's drop, payoff and button
function pictureHits() {
  if (args["no-hit-tempo"]) return [];
  const rows = [], add = (t, kind) => { if (Number.isFinite(Number(t)) && Number(t) > 0) rows.push({ t: Number(t), kind: kind || "hit" }); };
  if (args.hits && args.hits !== true) String(args.hits).split(",").forEach((x) => add(x));
  const lists = [];
  // the derived film-event manifest (events.mjs export), when supplied (--events <events.json>, refused when stale) or present and fresh in the run:
  // its hit times are the picture's hit times; the tempo is still scanned from them and the tracks are chosen and fitted as before
  let fromManifest = null;
  if (args.events && args.events !== true) {
    const r = loadManifest(String(args.events), { run: String(args.run) });
    if (r.ok) fromManifest = r.manifest;
    else if (!r.notManifest) die(`--events: ${r.error}`);
  } else {
    const p = presentManifest(String(args.run));
    if (p.manifest) fromManifest = p.manifest;
    else if (p.reason) notes.push(`motion/events.json ignored (${p.reason}); the score's own hits are used`);
  }
  if (fromManifest) { eventsInput = fromManifest; for (const h of manifestHits(fromManifest)) add(h.t, h.kind); notes.push("picture hit times from the film-event manifest (motion/events.json)"); return rows.filter((r) => !film || r.t <= film); }
  try { if (args.events && args.events !== true) { const E = JSON.parse(fs.readFileSync(String(args.events), "utf8")); lists.push(Array.isArray(E) ? E : E.events || []); } } catch {}
  try { if (fs.existsSync(scoreFile)) { const S = JSON.parse(fs.readFileSync(scoreFile, "utf8")); for (const k of ["hits", "events", "seams"]) if (Array.isArray(S[k])) lists.push(S[k]); } } catch {}
  for (const l of lists) for (const e of l) if (e && typeof e === "object") add(e.t ?? e.at ?? e.start ?? e.start_s, e.kind || e.type || e.id);
  if (!arcDerived) { add(arc.drop_at, "drop"); add(arc.payoff_at, "payoff"); add(arc.button_at, "button"); if (arc.break) add(arc.break[1], "break-end"); }
  return rows.filter((r) => !film || r.t <= film);
}
let eventsInput = null; // the film-event manifest (or a list built from the picture's hits) the original score is scheduled from
const HITS = pictureHits();

// ---------------------------------------------------------------- the story gate
// Music is picked AFTER the story is chosen and its event map exists, and it is cut to the story (never the story to the music).
// Refused without: <run>/story/chosen.json, and an arc with a turn (drop_at), a payoff, a break before the end card and the end card (button_at),
// from --arc, motion/score.json's music_arc, or the film-event manifest's cues. --unplanned "<reason>" is the one logged escape (a downgrade the person sees).
const UNPLANNED = args.unplanned && args.unplanned !== true ? String(args.unplanned) : null;
function arcFromManifest(m) {
  if (!m || !Array.isArray(m.events)) return null;
  const cue = (n) => { const e = m.events.find((x) => x.kind === "music_cue" && x.cue === n); return e ? Number(e.at_s) : null; };
  const end = m.events.filter((e) => e.kind === "visual_hit" && /^(logo|cta|end)/i.test(String((e.attrs && e.attrs.cue_kind) || e.id || ""))).map((e) => Number(e.at_s)).sort((a, b) => b - a)[0];
  const drop = cue("drop_at"), payoff = cue("payoff_at"), button = cue("button_at") ?? end ?? null, b0 = cue("break_start"), b1 = cue("break_end");
  return drop > 0 && button > 0 ? { intro_until: drop * 0.7, drop_at: drop, break: b0 != null && b1 != null ? [b0, b1] : null, payoff_at: payoff ?? drop + (button - drop) * 0.6, button_at: button } : null;
}
const arcSpecProblems = (a) => {
  const P = [];
  if (!(a.drop_at > 0)) P.push("drop_at (the turn: where the lift or drop lands)");
  if (!(a.payoff_at > a.drop_at)) P.push("payoff_at after drop_at");
  if (!(a.button_at > (a.payoff_at || 0))) P.push("button_at (the end card) after payoff_at");
  if (!Array.isArray(a.break) || !(a.break[1] > a.break[0]) || a.break[1] > a.button_at + 1e-6) P.push("break: [from, to] before the end card");
  return P;
};
let arcGate = false;
if (!silentArgs()) {
  if (arcDerived) { const am = arcFromManifest(eventsInput); if (am) { arc = am; arcDerived = false; notes.push("arc taken from the film-event manifest's music cues"); } }
  const missing = [];
  if (!fs.existsSync(path.join(path.resolve(String(args.run)), "story", "chosen.json"))) missing.push("the chosen story (<run>/story/chosen.json): pick the music after the person chooses the script, never while they are still reading");
  if (arcDerived) missing.push("the story's event map: no music_arc (--arc or motion/score.json) and no music cues in motion/events.json");
  else for (const p of arcSpecProblems(arc)) missing.push(`arc needs ${p}`);
  if (!film) missing.push("--film <seconds>");
  if (missing.length && !UNPLANNED) {
    console.log(JSON.stringify({ refused: true, why: "music is picked after the story, to its events", missing, arc_spec: { intro_until: "quiet or sparse until here", drop_at: "the turn: a lift or drop lands", break: "[from, to] a break (bed pulled out) before the end card", payoff_at: "the payoff, the loudest moment", button_at: "the end card: the music button" }, example: "--arc '{\"intro_until\":6,\"drop_at\":12,\"break\":[30,31.4],\"payoff_at\":33,\"button_at\":41}' --film 45", note: "or pass --unplanned \"<reason>\" to go on without the gate (logged as a downgrade)" }, null, 2));
    process.exit(2);
  }
  if (missing.length) noteDowngrade({ run: args.run, severity: "needs-you", what: "the music's story gate (chosen story, event map, arc)", instead: "music picked without the full arc: " + UNPLANNED, why: missing.join("; ").slice(0, 300), impact: "the music may not follow the story's turn, payoff and break" });
  else arcGate = true;
}
function silentArgs() { return !!args["silent-by-choice"] || (SR && SR.music_source === "none"); }
const hitCache = new Map();
const hitPick = (it) => {
  if (HITS.length < 3) return null;
  const r = styleRange(it), key = r ? r.join("-") : "-";
  if (!hitCache.has(key)) hitCache.set(key, bpmFromHits(HITS.map((h) => h.t), { prefer: r }));
  return hitCache.get(key);
};
const tempoOf = (it) => {
  const hp = hitPick(it);
  if (hp) return hp.bpm;
  const m = String(it.intent).match(/(\d+)(?:-(\d+))?\s*BPM/i);
  return m ? (m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1])) : 112;
};
const rangeOf = (it) => { const hp = hitPick(it); return hp ? [hp.bpm * 0.92, hp.bpm * 1.08] : styleRange(it); };

// 0. the user's own track (a file, or a folder with the full mix and stems), with the licence notes of their library
let libraryNote = null;
async function fromUser() {
  const p = path.resolve(String(trackArg));
  if (!fs.existsSync(p)) {
    notes.push(`--track ${trackArg} does not exist`);
    return;
  }
  const lib = args.library || "other";
  libraryNote = licenceNote(lib);
  const t = findUserTrack(p);
  if (!t) {
    notes.push(`no audio file found in ${trackArg}`);
    return;
  }
  const base = path.basename(t.mix).replace(/\.[^.]+$/, "");
  const id = "user-" + base.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
  const f = { id, title: base, file: t.mix, source: "Your own track", kind: "user", origin: "user", license: `Your licence (${args.declared || libraryNote.library})`, attribution: null, url: null, intent: { family: { id: "your track" }, intent: "" }, declared: args.declared || libraryNote.library, library: libraryNote };
  if (Object.keys(t.stems).length) f.stems = Object.fromEntries(Object.entries(t.stems).map(([k, v]) => [k, v.map(rel)]));
  if (libraryNote.status === "block") {
    f.blocked = libraryNote.note;
    notes.push(`${libraryNote.library}: ${libraryNote.note}`);
  } else if (libraryNote.status === "warn") f.caveat = libraryNote.note;
  else notes.push(`${libraryNote.library}: ${libraryNote.note}`);
  found.push(f);
}

async function fromHeygen() {
  const mu = findSkill("media-use");
  const lib = mu && path.join(mu, "audio", "scripts", "lib", "heygen.mjs");
  let H = null;
  if (lib && fs.existsSync(lib)) {
    try {
      H = await import(pathToFileURL(lib).href);
    } catch {}
  }
  if (H) {
    let headers;
    try {
      headers = H.heygenAuthHeaders();
    } catch (e) {
      notes.push(`HeyGen catalog skipped: ${e.message.split("\n")[0]}`);
      return;
    }
    for (const it of intents) {
      if (found.length >= count * 2) break;
      let res = [];
      try {
        res = await H.searchSounds(it.intent.slice(0, 250), "music", headers, { limit: 30 });
      } catch (e) {
        notes.push(`HeyGen search failed for "${it.intent.slice(0, 40)}…": ${String(e.message).split("\n")[0]}`);
        continue;
      }
      const long = res.filter((r) => typeof r.duration === "number" && r.duration >= minLen && r.duration <= 360 && !bannedIn(r.description) && !seen.has(r.id));
      const shortest = res.length ? Math.max(...res.map((r) => r.duration || 0)) : 0;
      if (!long.length) {
        notes.push(`HeyGen had no track >= ${Math.round(minLen)} s for "${it.family.id}" (longest ${shortest} s)`);
        continue;
      }
      for (const r of long.slice(0, intents.length >= count ? 1 : 2)) {
        seen.add(r.id);
        const ext = (String(r.audio_url).split("?")[0].match(/\.(wav|mp3|m4a|ogg)$/i) || [, "mp3"])[1];
        const dest = path.join(dir, `heygen-${String(r.id).slice(0, 8)}.${ext}`);
        try {
          if (!fs.existsSync(dest)) await download(r.audio_url, dest);
          const desc = r.description || it.intent;
          found.push({ id: `hg-${String(r.id).slice(0, 8)}`, title: desc.charAt(0).toUpperCase() + desc.slice(1), file: dest, source: "HeyGen catalog via media-use", license: "HeyGen terms (commercial use with a HeyGen account)", attribution: null, url: null, intent: it });
        } catch (e) {
          notes.push(`HeyGen download failed: ${e.message}`);
        }
      }
    }
    return;
  }
  // media-use present only as the CLI: resolve one track per mood (length can't be requested)
  for (const it of intents) {
    try {
      const out = execFileSync("npx", ["--yes", "hyperframes", "media-use", "resolve", "--type", "bgm", "--intent", it.intent, "--project", dir, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000 });
      let r = null;
      for (const line of out.split("\n").reverse()) {
        try {
          r = JSON.parse(line);
          break;
        } catch {}
      }
      if (!r || !r.ok || !r.path) continue;
      const file = path.resolve(dir, r.path);
      if (found.some((f) => f.file === file)) continue;
      found.push({ id: r.id, title: r.description || it.intent, file, source: "HeyGen catalog via media-use", license: "HeyGen terms", attribution: null, url: null, intent: it });
    } catch (e) {
      notes.push(`media-use resolve failed: ${String(e.stderr || e.message).split("\n").filter(Boolean).slice(-1)[0] || "error"}`);
    }
  }
}


// 1. AI generation to the film's arc: ElevenLabs Music first, Stable Audio second, the user's own key only.
// One take per mood; every take is analysed, retimed to the exact BPM when it is within 3%, and fitted like any track.
// buildPrompt's additive inputs: none without a direction/constraints (the legacy text); with one, the film's own words instead of "SaaS launch film" / "not cinematic"
const FORMAT_SUBJECT = { launch: "launch film", explainer: "explainer film", reel: "reel", kinetic: "kinetic-type film", brand: "brand film", premium: "premium brand film" };
const promptExtras = () => (SR || CONSTRAINTS ? { subject: FORMAT_SUBJECT[String(args.format || "launch")] || "film", tone: SR ? [SR.feeling && SR.feeling.value !== "unset" && SR.feeling.value !== "custom" ? SR.feeling.value : null, `${SR.energy.perceived} energy`].filter(Boolean).join(", ") : "", exclusions: EXCL } : {});
async function aiElevenLabs(it, bpm, key) {
  warnLicence("elevenlabs");
  const p = buildPrompt({ film, bpm, family: it.family, arc, narrated, ...promptExtras() });
  const body = { composition_plan: elevenPlan(p, it.family, SR || CONSTRAINTS ? EXCL : null), model_id: "music_v1" };
  const res = await fetch(`${process.env.RASANAI_ELEVENLABS_API_BASE || "https://api.elevenlabs.io"}/v1/music?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json", "user-agent": UA }, body: JSON.stringify(body), signal: AbortSignal.timeout(600000) });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), ext: "mp3", prompt: p.text, vendor: "elevenlabs/music_v1", request: { sections: p.sections.map((s) => [s.name, s.duration_ms]) } };
}
async function aiStable(it, bpm, key) {
  const p = buildPrompt({ film, bpm, family: it.family, arc, narrated, ...promptExtras() });
  const form = new FormData();
  form.set("prompt", p.text.slice(0, 900));
  form.set("duration", String(Math.min(190, Math.ceil(p.sections.reduce((a, s) => a + s.duration_ms, 0) / 1000))));
  form.set("output_format", "mp3");
  const res = await fetch("https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio", { method: "POST", headers: { authorization: `Bearer ${key}`, accept: "audio/*", "user-agent": UA }, body: form, signal: AbortSignal.timeout(600000) });
  if (!res.ok) throw new Error(`Stable Audio HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), ext: "mp3", prompt: p.text, vendor: "stability/stable-audio-2", request: { duration: form.get("duration") } };
}
async function fromAI() {
  const c = chain.find((x) => x.id === "ai");
  let n = 0;
  for (const it of intents.slice(0, count)) {
    const bpm = Math.round(tempoOf(it));
    n++;
    let got = null;
    for (const v of c.vendors) {
      try {
        got = v === "elevenlabs" ? await aiElevenLabs(it, bpm, process.env[KEYS.elevenlabs]) : await aiStable(it, bpm, process.env[KEYS.stable]);
        break;
      } catch (e) {
        notes.push(`AI generation (${v}) failed for ${it.family.id}: ${String(e.message).slice(0, 200)}`);
      }
    }
    if (!got) continue;
    const id = `ai-${it.family.id}-${n}`;
    const file = path.join(dir, `${id}.${got.ext}`);
    fs.writeFileSync(file, got.bytes);
    found.push({ id, title: `Made to the cut: ${it.family.id.replace("-", " ")}, ${bpm} BPM`, file, source: `AI generation (${got.vendor})`, kind: "ai", origin: `ai:${got.vendor}`, license: "Commercial use under the vendor plan active at generation time", ...(got.vendor.startsWith("elevenlabs") ? { caveat: CAVEATS.elevenlabs } : {}), attribution: null, url: null, intent: it, targetBpm: bpm, generation: { vendor: got.vendor, prompt: got.prompt, request: got.request, date: new Date().toISOString(), plan_note: "the licence depends on the vendor plan at this date: record the plan" } });
  }
}

// a local ACE-Step install (ACESTEP_CMD), run as an isolated child process; generation consent applies exactly as for the paid vendors
// local-gen (ACE-Step 1.5): ONE model load, 2-3 candidates built from the film's arc, BPM, mood, style world and (song-lyric) lyrics; arcFit then ranks them with every other source
async function fromLocalGen() {
  const bpm = Math.round(tempoOf(intents[0]));
  let modeId = args.mode && args.mode !== true ? String(args.mode) : null, lyricsText = "";
  try { const mj = path.join(path.resolve(String(args.run)), "audio", "mode.json"); if (!modeId && fs.existsSync(mj)) modeId = JSON.parse(fs.readFileSync(mj, "utf8")).mode; } catch {}
  const lf = args.lyrics && args.lyrics !== true ? path.resolve(String(args.lyrics)) : path.join(path.resolve(String(args.run)), "audio", "lyrics.txt");
  if (fs.existsSync(lf)) lyricsText = fs.readFileSync(lf, "utf8");
  if (modeId === "song-lyric" && !lyricsText.trim()) { notes.push("song-lyric mode with no lyrics (--lyrics <file> or <run>/audio/lyrics.txt): an instrumental was made instead; write the lyric first (five acts, ending on the tagline)"); modeId = "instrumental-arc"; }
  const mood = SR ? [SR.feeling && SR.feeling.value !== "unset" && SR.feeling.value !== "custom" ? SR.feeling.value : null, `${SR.energy.perceived} energy`].filter(Boolean).join(", ") : "";
  const P = buildLocalPrompt({ arc, film: film || 30, bpm, mood, style: `${args.style || ""} ${intents[0].family.id.replace("-", " ")}`.trim(), lyrics: lyricsText, mode: modeId || "instrumental-arc", narrated, exclusions: EXCL && Array.isArray(EXCL.avoid) ? EXCL.avoid : [] });
  warnLicence("localgen");
  const name = "localgen";
  const r = localGen.generate({ caption: P.caption, lyrics: P.lyrics, instrumental: P.instrumental, bpm: P.bpm, duration: P.duration, timesignature: P.timesignature, language: P.language, count: Math.min(3, count), seed: Number(args.seed) || 1000, out_dir: dir, name, fade_out: 0 });
  fs.writeFileSync(path.join(dir, "localgen-prompt.json"), JSON.stringify({ ...P, runner: { load_s: r.load_s, gen_s: r.gen_s, thinking: r.thinking } }, null, 2) + "\n");
  notes.push(`local-gen (ACE-Step 1.5): ${r.files.length} candidates of ${P.duration} s (film + ${P.duration - (film || 30)} s to edit from) in ${r.gen_s} s (+${r.load_s} s model load), ${P.instrumental ? "instrumental" : "sung"}, ${P.bpm} BPM`);
  let n = 0;
  for (const f of r.files) {
    n++;
    const id = `localgen-${n}`;
    let lyricsJson = null;
    if (!P.instrumental) {
      // force-align the supplied lyrics to the sung audio (never trust a raw transcript): vo.mjs lyrics
      try {
        const od = path.join(dir, `${id}-lyrics`);
        const lfile = path.join(dir, `${id}.lyrics.txt`); fs.writeFileSync(lfile, lyricsText);
        const a = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "vo.mjs"), "lyrics", "--track", f.file, "--lyrics", lfile, "--out", od], { encoding: "utf8", timeout: 10 * 60 * 1000 });
        if (a.status === 0 && fs.existsSync(path.join(od, "lyrics.json"))) lyricsJson = path.relative(ws, path.join(od, "lyrics.json")); else notes.push(`lyrics alignment failed for ${id}: ${String(a.stderr || a.stdout).trim().split("\n").slice(-1)[0].slice(0, 160)}`);
      } catch (e) { notes.push(`lyrics alignment failed for ${id}: ${String(e.message).slice(0, 120)}`); }
    }
    found.push({ id, title: `Made locally to the arc: ${P.instrumental ? "instrumental" : "sung"} take ${n}, ${P.bpm} BPM`, file: f.file, source: "Local generation (ACE-Step 1.5)", kind: "ai", origin: "ai:ace-step/local", license: "MIT (ACE-Step 1.5 code and weights); model card: generated music may be used commercially", caveat: CAVEATS.localgen, attribution: null, url: null, intent: intents[0], targetBpm: P.bpm, lyrics_json: lyricsJson, generation: { vendor: "ace-step-1.5/turbo+lm-0.6B", seed: f.seed, prompt: P.caption, lyrics: P.lyrics, date: new Date().toISOString() } });
    // generate long, then edit to picture: the same take cut on downbeats onto the arc (lib/music-edit.mjs); it competes with the raw take and every other source on arcFit
    if (film && !args["no-edit"]) {
      try {
        const eo = path.join(dir, `${id}-edited.wav`);
        const E = editToPicture({ file: f.file, arc, film, bpm: P.bpm, out: eo, lyrics: P.instrumental ? "" : lyricsText });
        let eLyrics = null;
        if (!P.instrumental) {
          try {
            const od = path.join(dir, `${id}-edited-lyrics`), lfile = path.join(dir, `${id}.lyrics.txt`);
            const a = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "vo.mjs"), "lyrics", "--track", eo, "--lyrics", lfile, "--out", od], { encoding: "utf8", timeout: 10 * 60 * 1000 });
            if (a.status === 0 && fs.existsSync(path.join(od, "lyrics.json"))) eLyrics = path.relative(ws, path.join(od, "lyrics.json"));
          } catch {}
        }
        found.push({ id: `${id}-edited`, edited: true, edit: { drop_error_ms: E.drop_error_ms, clicks: E.clicks, shaping: E.shaping, break: E.break, button: E.button, stretched: E.stretched || null, pieces: E.pieces.length }, title: `Made locally and edited to the picture: ${P.instrumental ? "instrumental" : "sung"} take ${n}`, file: eo, source: "Local generation (ACE-Step 1.5), edited to the arc", kind: "ai", origin: "ai:ace-step/local", license: "MIT (ACE-Step 1.5 code and weights); model card: generated music may be used commercially", caveat: CAVEATS.localgen, attribution: null, url: null, intent: intents[0], targetBpm: null, lyrics_json: eLyrics, generation: { vendor: "ace-step-1.5/turbo+lm-0.6B", seed: f.seed, prompt: P.caption, lyrics: P.lyrics, edited_from: path.basename(f.file), date: new Date().toISOString() } });
      } catch (e) { notes.push(`edit to picture failed for ${id}: ${String(e.message).slice(0, 160)}`); }
    }
  }
}
async function fromAceStep() {
  if (localGen.available()) { try { return await fromLocalGen(); } catch (e) { notes.push(`local-gen failed: ${String(e.message).slice(0, 240)}${SRC_KEY.acestep() ? "; trying ACESTEP_CMD" : ""}`); if (!SRC_KEY.acestep()) return; } }
  let n = 0;
  for (const it of intents.slice(0, count)) {
    const bpm = Math.round(tempoOf(it));
    n++;
    const p = buildPrompt({ film, bpm, family: it.family, arc, narrated, ...promptExtras() });
    const id = `acestep-${it.family.id}-${n}`;
    const file = path.join(dir, `${id}.wav`);
    try {
      warnLicence("acestep");
      const r = await aceStep({ prompt: p.text, seconds: Math.ceil(p.sections.reduce((a, s) => a + s.duration_ms, 0) / 1000), out: file });
      found.push({ id, title: `Made locally to the cut: ${it.family.id.replace("-", " ")}, ${bpm} BPM`, file, source: "Local generation (ACE-Step)", kind: "ai", origin: "ai:ace-step/local", license: r.licence, caveat: r.caveat, attribution: null, url: null, intent: it, targetBpm: bpm, generation: { vendor: r.vendor, prompt: r.prompt, date: r.date } });
    } catch (e) {
      notes.push(`ACE-Step failed for ${it.family.id}: ${String(e.message).slice(0, 200)}`);
    }
  }
}

// the original score: synthesised offline, in Node, from the film-event manifest (or the picture's own hit times and the arc's cues)
async function fromProcedural() {
  if (!film) { notes.push("an original procedural score needs --film <seconds>"); return; }
  try {
    const withBreak = (m) => { if (!m || arcDerived || !arc.break) return m; const has = (c) => m.events.some((x) => x.kind === "music_cue" && x.cue === c); const add = [["break_start", arc.break[0]], ["break_end", arc.break[1]]].filter(([c]) => !has(c)).map(([cue, t]) => ({ id: `music-${cue.replace("_", "-")}`, at_s: Number(t), kind: "music_cue", cue })); return add.length ? { ...m, events: [...m.events, ...add] } : m; };
    const input = withBreak(eventsInput) || { duration_s: film, events: [...HITS.map((h, i) => ({ id: `hit-${i + 1}`, t: h.t, kind: h.kind })), ...(arcDerived ? [] : [["drop_at", arc.drop_at], ["payoff_at", arc.payoff_at], ["button_at", arc.button_at], ["break_start", arc.break && arc.break[0]], ["break_end", arc.break && arc.break[1]]].filter(([, t]) => Number.isFinite(Number(t)) && Number(t) > 0).map(([cue, t]) => ({ id: `music-${cue.replace(/_at$/, "")}`, at_s: Number(t), kind: "music_cue", cue })))] };
    const identity = resolveIdentity(args.identity && args.identity !== true ? path.resolve(String(args.identity)) : null, { look: args.style, story: args.story, seed: args.seed, narrated: narrated || null });
    const r = renderScore(input, identity, { duration: film });
    const id = `procedural-${identity.family}`;
    const file = path.join(dir, `${id}.wav`);
    fs.writeFileSync(file, r.wav);
    const prov = r.provenance;
    fs.writeFileSync(sidecarPath(file), JSON.stringify({ schema_version: 1, origin: "procedural", wav: path.basename(file), sha256: crypto.createHash("sha256").update(r.wav).digest("hex"), sr: r.plan.sr, duration_s: r.plan.duration_s, fps: r.plan.fps, bpm: r.plan.bpm, key: r.plan.key, seed: r.plan.seed, identity: r.plan.identity, sections: r.plan.sections, hits: r.plan.hits, pause: r.plan.pause, gates: r.plan.gates, ending: r.plan.ending, foley: r.plan.foley, samples_used: [], license: prov, quality_downgrade: prov.quality_downgrade }, null, 2) + "\n");
    noteDowngrade({ run: args.run, what: "sampled instruments in the original score", instead: "synthesised sine / triangle / noise voices", why: "no licence-verified instrument sample library ships with the skill", impact: "thinner than a produced track; pass --track <file> to use a real one" });
    notes.push(`original score: ${identity.family}, ${r.plan.bpm} BPM, ${r.plan.key}, seed ${r.plan.seed}; peak hit ${r.plan.hits[0] ? `${r.plan.hits[0].id} at ${r.plan.hits[0].at_s} s` : "none (no drop cue or hit to build on)"}; quality downgrade recorded (synthesised voices, not sampled instruments)`);
    found.push({ id, title: `Original score: ${identity.family.replace("-", " ")}, ${r.plan.bpm} BPM, ${r.plan.key}`, file, source: "Original score (RasanAI, generated offline)", kind: "procedural", prior: procChain.explicit ? "ai" : "procedural", origin: "procedural", license: "Original work generated from code; no third-party material", requires_credit: false, attribution: null, url: null, intent: { family: { id: identity.family }, intent: "original score to the film's events" }, samples_used: [] });
  } catch (e) {
    notes.push(`original score failed: ${String(e.message).slice(0, 200)}`);
  }
}

// 2. the curated catalog: CC0 / CC BY files fetched on demand (checksummed), Mixkit only when the user picks it
const suggestions = [];
const FAM_ALIAS = { editorial: ["editorial", "chill", "indie-electronic"], "dark-tech": ["dark-tech"], playful: ["playful", "indie-electronic"], cinematic: ["cinematic", "ambient-pop", "organic"], raw: ["raw", "dark-tech", "reel"], retro: ["retro"], organic: ["organic", "lo-fi", "ambient-pop"] };
const recentUse = args.recent && args.recent !== true ? String(args.recent).split(",").map((x) => x.trim()).filter(Boolean) : [];
const shortlistOpts = () => ({ resolved: SR, brief_style: `${args.style || ""} ${args.story || ""}`.trim(), film_s: film, narrated, recent_use: recentUse, constraints: CONSTRAINTS });
async function fromCatalog() {
  let cat;
  try {
    cat = loadCatalog().cat;
  } catch (e) {
    notes.push(`catalog unavailable: ${e.message}`);
    return;
  }
  const errs = validateCatalog(cat);
  if (errs.length) {
    notes.push(`catalog.json is invalid (${errs.length} problem(s), first: ${errs[0]}): skipped`);
    return;
  }
  const artists = new Set();
  const take = async (t, it) => {
    seen.add(t.id);
    artists.add(t.artist);
    const dest = path.join(dir, `${t.id}.mp3`);
    try {
      if (!fs.existsSync(dest) || (t.sha256 && crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex") !== t.sha256)) await download(t.mirror_ok && t.mirror ? t.mirror : t.url, dest, { sha256: t.sha256 || null });
      found.push({ id: t.id, title: `${t.title} (${t.artist})`, bare_title: t.title, file: dest, source: `Curated catalog: ${t.source}`, kind: "catalog", prior: t.source === "mixkit" ? "mixkit" : "catalog", origin: "catalog", license: t.licence, licence_url: t.licence_url, requires_credit: t.requires_credit, credit: t.credit, attribution: t.credit, artist: t.artist, url: t.page, sha256: t.sha256 || null, commercial_ok: t.commercial_ok, ads_ok: t.ads_ok, content_id_risk: t.content_id_risk, restrictions: t.restrictions || null, intent: it, row: t, listened: !!t.listened, caveat: t.listened ? null : "catalog track not yet auditioned by a person: listen before you commit" });
    } catch (e) {
      notes.push(`${t.id} download failed: ${e.message}`);
    }
  };
  // with a sound direction or constraints the whole catalog is ranked on fit (feeling, perceived energy, narration space, rights, evidence, recent reuse) and up to
  // `count` genuinely different tracks are taken; nothing is downloaded for a track that is not picked. Without either, the long-standing per-intent pick below runs unchanged.
  if (SR || CONSTRAINTS) {
    const rk = rankCandidates(cat.tracks, shortlistOpts());
    const picks = pickThree(rk.ranked.filter((r) => (cat.tracks.find((t) => t.id === r.id) || {}).fetch === "auto"), { max: Math.min(3, count) });
    for (const r of picks.options) {
      const t = cat.tracks.find((x) => x.id === r.id);
      if (t && !seen.has(t.id)) await take(t, intents.find((it) => (FAM_ALIAS[it.family.id] || []).some((f) => t.family.includes(f))) || intents[0]);
    }
    if (picks.note) notes.push(`catalog: ${picks.note}`);
    for (const r of rk.ranked) {
      const x = cat.tracks.find((q) => q.id === r.id);
      if (x && x.fetch === "on-pick" && suggestions.length < 2 && !found.some((f) => f.id === x.id)) suggestions.push({ id: x.id, title: x.title, artist: x.artist, mood: r.families[0] || null, bpm: x.bpm, duration: x.duration, ending: x.ending, license: x.licence, page: x.page, note: x.notes, needs_pick: true, how: `Mixkit tracks are fetched only when you pick one: node music.mjs --run <run> --film ${film || "<s>"} --pick ${x.id} (or download it yourself from ${x.page})` });
    }
    if (args.pick && !found.some((f) => f.id === args.pick)) {
      const t = cat.tracks.find((x) => x.id === args.pick);
      if (t && t.fetch === "on-pick") await take(t, intents.find((it) => (FAM_ALIAS[it.family.id] || []).some((f) => t.family.includes(f))) || intents[0]);
      else if (!t) notes.push(`--pick ${args.pick}: not in the catalog`);
    }
    return;
  }
  for (const it of intents) {
    const fams = FAM_ALIAS[it.family.id] || [it.family.id];
    const ranked = pickFromCatalog(cat, { families: fams, film, bpmRange: rangeOf(it), count: 12 }).filter((t) => !seen.has(t.id));
    const auto = ranked.filter((t) => t.fetch === "auto");
    const pickd = ranked.find((t) => t.fetch === "on-pick" && args.pick === t.id);
    const t = pickd || auto.find((x) => !artists.has(x.artist)) || auto[0];
    if (t) await take(t, it);
    const sug = ranked.find((x) => x.fetch === "on-pick" && x.id !== (t && t.id) && !suggestions.some((s) => s.id === x.id));
    if (sug && !found.some((f) => f.id === sug.id)) suggestions.push({ id: sug.id, title: sug.title, artist: sug.artist, mood: it.family.id, bpm: sug.bpm, duration: sug.duration, ending: sug.ending, license: sug.licence, page: sug.page, note: sug.notes, needs_pick: true, how: `Mixkit tracks are fetched only when you pick one: node music.mjs --run <run> --film ${film || "<s>"} --pick ${sug.id} (or download it yourself from ${sug.page})` });
  }
  if (args.pick && !found.some((f) => f.id === args.pick)) {
    const t = cat.tracks.find((x) => x.id === args.pick);
    if (t && t.fetch === "on-pick") await take(t, intents.find((it) => (FAM_ALIAS[it.family.id] || []).some((f) => t.family.includes(f))) || intents[0]);
    else if (!t) notes.push(`--pick ${args.pick}: not in the catalog`);
  }
}

// 4. ccMixter: query API, rank-sorted, CC BY, instrumental, BPM within 8% of the target
const parseLen = (ps) => {
  const m = String(ps || "").match(/^(?:(\d+):)?(\d+):(\d+)$/);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};
async function fromCcmixter() {
  const tagsFor = (it) => (FAM_ALIAS[it.family.id] || [it.family.id]).concat(it.family.ov || []).filter((x) => /^[a-z]+$/.test(x)).slice(0, 3).join(",");
  for (const it of intents) {
    if (found.filter((f) => f.kind === "ccmixter").length >= count) break;
    const target = tempoOf(it);
    let j;
    try {
      const res = await fetch(`http://ccmixter.org/api/query?f=json&reqtags=instrumental&tags=${encodeURIComponent(tagsFor(it))}&type=any&sort=rank&lic=by&limit=20`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) });
      j = await res.json();
    } catch (e) {
      notes.push(`ccMixter unavailable: ${String(e.message).slice(0, 100)}`);
      return;
    }
    const ok = (Array.isArray(j) ? j : []).filter((u) => {
      const bpm = Number(u.upload_extra && u.upload_extra.bpm);
      const tags = String((u.upload_extra && u.upload_extra.usertags) || u.upload_tags || "");
      const lic = String(u.license_url || "");
      const dur = parseLen(u.files && u.files[0] && u.files[0].file_format_info && u.files[0].file_format_info.ps);
      return /\/by\//.test(lic) && !/-(nc|nd|sa)\b|\/(nc|nd|sa)\b/.test(lic) && !/vocals/i.test(tags) && u.files && u.files[0] && u.files[0].download_url && dur && dur >= minLen && [bpm, bpm / 2, bpm * 2].some((b) => b && Math.abs(b - target) / target <= 0.08) && !bannedIn(u.upload_name) && !seen.has("cc-" + u.upload_id);
    });
    for (const u of ok.slice(0, 1)) {
      seen.add("cc-" + u.upload_id);
      const dest = path.join(dir, `ccmixter-${u.upload_id}.mp3`);
      try {
        if (!fs.existsSync(dest)) await download(u.files[0].download_url, dest, { referer: u.file_page_url || "https://ccmixter.org/" });
        found.push({ id: `cc-${u.upload_id}`, title: `${u.upload_name} (${u.user_name})`, file: dest, source: "ccMixter", kind: "ccmixter", origin: "ccmixter", license: "CC BY", licence_url: u.license_url, requires_credit: true, credit: `Music: "${u.upload_name}" by ${u.user_name} (${u.file_page_url}), licensed under CC BY (${u.license_url})`, attribution: `"${u.upload_name}" by ${u.user_name} (${u.license_url})`, url: u.file_page_url, intent: it });
      } catch (e) {
        notes.push(`ccMixter download failed (${u.upload_name}): ${e.message}`);
      }
    }
  }
}

// 5. Openverse, last: two or more tags (never a title word), long tracks only, the strictest threshold
async function fromOpenverse() {
  for (const it of intents) {
    if (found.filter((f) => f.kind === "openverse").length >= count) break;
    const tags = [...new Set([...(it.family.ov || []).slice(0, 1), "instrumental"])];
    if (tags.length < 2) tags.push("electronic");
    let j;
    try {
      const res = await fetch(`https://api.openverse.org/v1/audio/?tags=${encodeURIComponent(tags.join(","))}&category=music&license=by,cc0&length=medium,long&page_size=20`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) });
      j = await res.json();
    } catch (e) {
      notes.push(`Openverse unavailable: ${e.message}`);
      return;
    }
    const ok = (j.results || []).filter((r) => r.duration >= minLen * 1000 && r.duration <= 360000 && r.url && /^(by|cc0)$/.test(r.license) && !r.mature && !bannedIn(r.title) && !/vocal|vox|feat\.|remix|song|\bmix\b|\bdj\b/i.test(r.title) && !seen.has(r.id));
    for (const r of ok.slice(0, 2)) {
      seen.add(r.id);
      const dest = path.join(dir, `openverse-${String(r.id).slice(0, 8)}.mp3`);
      try {
        if (!fs.existsSync(dest)) await download(r.url, dest);
        const cr = `Music: "${r.title}" by ${r.creator} (${r.foreign_landing_url || r.url}), licensed under CC ${r.license.toUpperCase()} ${r.license_version || ""} (${r.license_url || "https://creativecommons.org/"})`.replace(/\s+\)/, ")");
        found.push({ id: `ov-${String(r.id).slice(0, 8)}`, title: `${r.title} (${r.creator})`, file: dest, source: `Openverse / ${r.source}`, kind: "openverse", origin: "openverse", license: `CC ${r.license.toUpperCase()} ${r.license_version || ""}`.trim(), licence_url: r.license_url || null, requires_credit: r.license !== "cc0", credit: r.license === "cc0" ? null : cr, attribution: r.attribution || cr, url: r.foreign_landing_url || r.url, intent: it, caveat: r.source === "jamendo" ? "Jamendo via Openverse: the artist's CC licence holds, but keep the licence URL and check Content ID" : null });
      } catch (e) {
        notes.push(`Openverse download failed (${r.title}): ${e.message}`);
      }
    }
  }
}

// ---------------------------------------------------------------- analyse, gate and fit each

const tools = toolsAvailable();
const options = [];
const retime = (f, A) => {
  // a generated take is within a few percent of the BPM asked for: stretch it onto the exact grid (atempo, within 3%)
  if (!f.targetBpm || !A.bpm) return null;
  const ratio = f.targetBpm / A.bpm;
  if (Math.abs(ratio - 1) < 0.004 || Math.abs(ratio - 1) > 0.03) return null;
  const out = f.file.replace(/\.[^.]+$/, "") + ".retimed.wav";
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", f.file, "-filter:a", `atempo=${ratio.toFixed(5)}`, out], { encoding: "utf8" });
  return r.status === 0 ? { out, from: A.bpm, to: f.targetBpm, ratio: Math.round(ratio * 10000) / 10000 } : null;
};
const analysisCache = new Map(); // id -> analyzeTrack output, for the shortlist (never serialized into the options)
const analyzeOne = (f) => {
  const family = f.intent.family.id;
  const o = { id: f.id, title: f.title, mood: family, duration: null, file: rel(f.file), preview: null, source: f.source, origin: f.origin, license: f.license, attribution: f.attribution, url: f.url };
  for (const k of ["credit", "requires_credit", "licence_url", "artist", "sha256", "commercial_ok", "ads_ok", "content_id_risk", "restrictions", "stems", "declared", "listened"]) if (f[k] !== undefined && f[k] !== null) o[k] = f[k];
  if (f.library) o.library = f.library;
  if (f.caveat) o.caveat = f.caveat;
  if (f.blocked) {
    o.usable = false;
    o.blocked = true;
    o.problems = [f.blocked];
    return o;
  }
  if (!tools.ffmpeg || !tools.ffprobe) {
    o.usable = null;
    o.problems = ["ffmpeg/ffprobe not installed: not analysed"];
    return o;
  }
  try {
    let A = analyzeTrack(f.file, { quick: true });
    const rt = retime(f, A);
    if (rt) {
      f.file = rt.out;
      o.file = rel(rt.out);
      o.retimed = { from_bpm: Math.round(rt.from * 10) / 10, to_bpm: rt.to, ratio: rt.ratio };
      A = analyzeTrack(f.file, { quick: true });
    }
    analysisCache.set(f.id, A);
    o.duration = Math.round(A.duration);
    o.bpm = A.bpm;
    o.summary = summarize(A);
    o.ending = { natural: A.ending.natural, type: A.ending.type, at: A.ending.hit ?? A.ending.fade_start ?? null };
    o.strong_from = A.strong_sections[0] ? A.strong_sections[0].t0 : null;
    o.sections = A.sections.map((s) => ({ t0: s.t0, t1: s.t1, tier: s.tier, label: s.label }));
    o.problems = [...A.problems];
    o.warnings = [...A.warnings];
    if (f.kind === "procedural") {
      // the generator knows its own tempo and grid, and the track is never re-cut on bar lines: the beat tracker's drift reading is not a defect here
      const ps = readSidecar(f.file);
      if (ps) o.bpm = ps.bpm;
      o.problems = o.problems.filter((p) => !/^tempo is not steady/.test(p));
      o.warnings.push("synthesised voices (sine / triangle / noise), not sampled instruments: a recorded quality downgrade; the user's own track always wins");
    }
    let plan = null;
    if (film) {
      // a procedural score is already the film's length and built to its events: its own plan, never re-cut on bar lines (that would move its hits)
      const ps = f.kind === "procedural" ? readSidecar(f.file) : null;
      plan = f.edited ? { track: path.resolve(f.file), shape: "edited-to-picture", film_duration: film, segments: [{ src_in: 0, src_out: film, film_start: 0, film_end: film }], joins: [], why: "cut to the arc on downbeats (lib/music-edit.mjs): already the film's length, never re-cut", origin: "edited", cost: 0, moments: { reveal: { t: arc.drop_at }, logo: { t: arc.button_at } } } : ps ? { ...identityPlan(f.file, { duration_s: film, ending: ps.ending, hits: ps.hits }), cost: 0 } : fitTrack(A, { film, ...(arcDerived ? {} : { reveal: arc.drop_at, logo: arc.button_at }) });
      const planFile = path.join(dir, `plan-${f.id}.json`);
      fs.writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n");
      o.fit = { shape: plan.shape, film_duration: plan.film_duration, needs_longer: !!plan.needs_longer, cost: plan.cost ?? null, why: plan.why, plan: rel(planFile) };
      if (plan.needs_longer) o.problems.push(`too short for a ${film} s film without repeating a section`);
      if (f.edited) o.preview = rel(f.file);
      else if (!args["no-preview"] && plan.segments && plan.segments.length) {
        const pv = path.join(dir, `fitted-${f.id}.wav`);
        renderPlan(plan, pv);
        o.preview = rel(pv);
      }
    }
    // the measured quality gate (a user's own track only warns)
    try {
      const J = judge(f.file, { kind: f.kind, family, title: f.title, A, plan, narrated, vocals: f.vocals });
      o.quality = J.quality;
      o.score = J.score;
      o.rank = Math.round(J.score * (PRIOR[f.prior || f.kind] ?? 0.5));
      o.problems.push(...J.problems);
      o.warnings.push(...J.warnings);
    } catch (e) {
      o.warnings.push(`quality gate not run: ${String(e.message).slice(0, 120)}`);
      o.rank = 0;
    }
    // the arc gate: the bed as the film will get it, measured against the story's arc (a sparse intro, a lift at the turn, a break before the end card, the peak between turn and payoff)
    if (arcGate && film) {
      try {
        let src = o.preview ? path.resolve(ws, o.preview) : f.kind === "procedural" ? f.file : null, tmp = null;
        if (f.edited) o.edit = f.edit;
        if (!src && plan && plan.segments && plan.segments.length) { tmp = path.join(dir, `arcfit-${f.id}.wav`); renderPlan(plan, tmp); src = tmp; }
        if (src) {
          const AF = arcFit(src, arc, film);
          o.arc_fit = AF;
          if (AF.score < 55) (f.kind === "user" ? o.warnings : o.problems).push(`arc fit ${AF.score}/100 (needs 55): ${AF.problems.join("; ")}`);
          else if (AF.problems.length) o.warnings.push(...AF.problems);
          o.rank = Math.round(0.35 * (o.rank ?? 0) + 0.65 * AF.score);
        } else o.warnings.push("arc fit not measured: no fitted bed to measure");
        if (tmp) fs.rmSync(tmp, { force: true });
      } catch (e) { o.warnings.push(`arc fit not measured: ${String(e.message).slice(0, 100)}`); }
    }
    o.usable = o.problems.length === 0;
    // one line the console card can show as-is
    o.mood = [family.replace("-", " "), `${Math.round(A.bpm)} BPM`, A.ending.natural ? "real ending" : A.ending.type === "fade" ? "fades out" : "no ending", o.arc_fit ? `arc fit ${o.arc_fit.score}/100` : null, o.fit ? `${o.fit.shape === "backtimed" ? "plays straight to its ending" : o.fit.shape === "head+tail" ? "one bar-line edit" : o.fit.shape} for ${film} s` : null].filter(Boolean).join(" · ");
    o.badge = f.kind === "user" ? "Your licence" : f.kind === "ai" ? "AI, made to the cut" : f.requires_credit ? "Credit needed" : f.requires_credit === false ? "No credit" : "See licence";
  } catch (e) {
    o.usable = false;
    o.problems = [`analysis failed: ${e.message}`];
  }
  return o;
};

const silentByChoice = !!args["silent-by-choice"] || !!(SR && SR.music_source === "none");
if (args["silent-by-choice"]) notes.push(`--silent-by-choice${args["silent-by-choice"] !== true ? ` (${args["silent-by-choice"]})` : ""}: no music is looked for or made`);
else if (silentByChoice) notes.push("music source is None in the sound choices: no music is looked for or made, and nothing replaces it");
const usableCount = () => options.filter((o) => o.usable).length;
const mineFirst = () => !!trackArg && !args.more && options.some((o) => o.usable && o.origin === "user");
const runSource = async (name, fn) => {
  // generated lanes (paid vendors, local ACE-Step) always run when they are on, so every available source competes: ranking is by arc fit (lib/audio.mjs arcFit), not by who answered first
  const competes = name === "ai" || name === "acestep";
  if (!on(name) || (usableCount() >= count && !competes) || mineFirst()) return;
  if (silentByChoice) return;
  const before = found.length;
  await fn();
  for (const f of found.slice(before)) options.push(analyzeOne(f));
};
await runSource("user", fromUser);
const procChain = chain.find((c) => c.id === "procedural");
if (procChain.explicit) await runSource("procedural", fromProcedural);
// with an arc, the original score is tried right after the user's own track: it is built to the story's events, so it is the preferred path when it fits the arc (ranking decides)
else if (arcGate && !args["no-procedural"] && !args.sources) await runSource("procedural", fromProcedural);
// the chain is the one source of order: user, then the licensed/local catalog, then generation (only with the film's consent, unless a --sources list pins ai first), then the rest
const HANDLERS = { ai: fromAI, acestep: fromAceStep, catalog: fromCatalog, heygen: fromHeygen, ccmixter: fromCcmixter, openverse: fromOpenverse };
for (const c of chain) if (HANDLERS[c.id]) await runSource(c.id, HANDLERS[c.id]);
const aiLane = chain.find((c) => c.id === "ai");
if (aiLane && !aiLane.on && aiLane.vendors && aiLane.vendors.length && !aiLane.consent && !args["no-ai"] && !silentByChoice) notes.push("generated music is off: a key was found but this film has no generation consent (--allow-generation). The licensed and local library was used.");
if (procChain.fallback && usableCount() === 0 && !mineFirst() && !found.some((x) => x.kind === "procedural")) await runSource("procedural", fromProcedural);

// licence ledger: everything a credit or an audit needs
const ledgerFile = path.join(dir, "LICENSES.json");
let ledger = [];
try {
  ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
} catch {}
for (const o of options) {
  const f = found.find((x) => x.id === o.id) || {};
  const row = { id: o.id, file: o.file, title: f.bare_title || o.title, artist: o.artist || null, origin: o.origin, source: o.source, license: o.license, licence_url: o.licence_url || null, requires_credit: o.requires_credit ?? null, credit: o.credit || o.attribution || null, attribution: o.attribution, url: o.url, sha256: o.sha256 || null, commercial_ok: o.commercial_ok ?? null, ads_ok: o.ads_ok ?? "unknown", content_id_risk: o.content_id_risk || "unknown", declared: o.declared || null, library: o.library || null, ...(o.origin === "procedural" ? { samples_used: [] } : {}), generation: f.generation || null, checked_on: new Date().toISOString().slice(0, 10), fetched: new Date().toISOString() };
  const i = ledger.findIndex((l) => l.id === o.id);
  if (i >= 0) ledger[i] = row;
  else ledger.push(row);
}
fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + "\n");

// the user's track first; then usable before not, best ranked (score times the source's prior), best fit
options.sort((a, b) => (b.origin === "user" && b.usable === true) - (a.origin === "user" && a.usable === true) || (b.usable === true) - (a.usable === true) || (b.rank ?? 0) - (a.rank ?? 0) || (a.fit?.cost ?? 9) - (b.fit?.cost ?? 9));
// `count` options, one per mood first (different moods, not three takes of one), best first
const shown = [];
for (const o of options) if (shown.length < count && o.usable && !shown.some((x) => x.mood.split(" · ")[0] === o.mood.split(" · ")[0])) shown.push(o);
for (const o of options) if (shown.length < count && o.usable && !shown.includes(o)) shown.push(o);
for (const o of options) if (shown.length < count && !shown.includes(o)) shown.push(o);
const best = shown.find((o) => o.usable) || null;

// credits for the recommended track (re-run `credits --pick <id>` for the one the user picks)
const credits = creditsText(best ? { ...ledger.find((l) => l.id === best.id), license: best.license } : null);
fs.writeFileSync(path.join(dir, "CREDITS.txt"), credits.credits);
fs.writeFileSync(path.join(dir, "description.txt"), credits.description);

// the picture's hits, their grid and treatments (the spotting table in references/sound.md)
let hitsReport = null;
{
  const hp = intents.length ? hitPick(intents[0]) : null;
  if (hp) {
    hitsReport = { tempo_from: "the picture's hit times", ...hp, treatments: treatHits(HITS, hp), note: "a hit more than 60 ms off the grid carries nudge_ms: move the picture hit by that much, or let the music's own hit lead and give the picture hit an aftermath" };
    fs.writeFileSync(path.join(dir, "hits.json"), JSON.stringify(hitsReport, null, 2) + "\n");
    notes.push(`tempo ${hp.bpm} BPM chosen from ${hp.hits} picture hits (worst ${hp.max_err_ms} ms off a beat): <run>/music/hits.json`);
  } else if (!args["no-hit-tempo"]) notes.push(`tempo from the style's range: ${HITS.length} picture hit time(s) known, 3 are needed (--hits, --events, the score's hits/events/seams, or a music_arc)`);
}
// the shortlist: up to three genuinely different playable candidates with reasons and evidence state (only with a sound direction or constraints; otherwise the output is as before)
let shortlist = null;
if ((SR || CONSTRAINTS) && !silentByChoice) {
  const cands = options.map((o) => { const f = found.find((x) => x.id === o.id) || {}; const c = candidateFromOption(o, f.row || null, analysisCache.get(o.id) || null); if (f.kind === "ai") c.origin = "ai"; return c; });
  const ranked = rankCandidates(cands, shortlistOpts());
  const picks = pickThree(ranked, { max: Math.min(3, count) });
  const record = buildShortlistRecord({ picks, ranked, revision: 1, constraints: ranked.constraints, film_s: film, sound_digest: SOUND ? SOUND.digest : null });
  shortlist = { ...record, preview_plan: previewPlan(picks.options, { passage: arcDerived ? null : { start_s: arc.drop_at, end_s: arc.payoff_at } }), file: rel(path.join(dir, "shortlist.json")) };
  fs.writeFileSync(path.join(dir, "shortlist.json"), JSON.stringify({ ...record, candidates: cands.map((c) => ({ ...c, analysis: undefined })), rank_opts: shortlistOpts(), liked: [] }, null, 2) + "\n");
}
const result = { options: shown, ...(shortlist ? { shortlist } : {}), ...(hitsReport ? { hits: { bpm: hitsReport.bpm, max_err_ms: hitsReport.max_err_ms, file: rel(path.join(dir, "hits.json")) } } : {}), suggestions, recommended: best ? best.id : null, intents: intents.map((i) => i.intent), film_s: film, min_length_s: Math.round(minLen), arc: { ...arc, derived: arcDerived }, arc_gate: arcGate, chain: chain.map((c) => ({ id: c.id, on: c.on, why: c.why })), ...(SR ? { sound: { digest: SOUND.digest, music_source: SR.music_source, energy: SR.energy, feeling: SR.feeling.value, narrated } } : {}), licenses: rel(ledgerFile), credits: rel(path.join(dir, "CREDITS.txt")), description: rel(path.join(dir, "description.txt")), notes };
if (libraryNote) result.library_note = libraryNote;
if (!film) notes.push("pass --film <seconds> so each track is fitted to the film and gets a preview of the edit");
if (!shown.length) result.unavailable = `No music could be fetched (${notes.join("; ") || "no source answered"}). Check the network, or give your own track (--track <file>) or pick "No music". Signed in to HeyGen (\`npx hyperframes auth status\`) adds its catalog.`;
else if (!best) result.unavailable_note = (arcGate ? "No track fits the story's arc (arc_fit on each option says what is missing: sparse intro, lift at the turn, break before the end card). Bring your own track (--track <file>), or let the original score be built (it needs no key). " : "") + `None of the tracks passes the quality gate and fits a ${film} s film cleanly: ask for more (other moods), make one to the cut (an ElevenLabs or Stable Audio key in ${KEYS.elevenlabs} / ${KEYS.stable}), or bring your own track.`;
if (result.unavailable || result.unavailable_note) noteDowngrade({ run: args.run, what: "a curated music track", instead: "no track until one is chosen or supplied", why: String(result.unavailable || result.unavailable_note).slice(0, 200) });
console.log(JSON.stringify(result, null, 2));
