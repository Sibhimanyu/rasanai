#!/usr/bin/env node
// Voiceover from a script, with word timings so on-screen type can follow the voice word by word; and timed lyrics for a song the user supplies.
// Node + ffmpeg + whisper-cli only (no Python audio libraries: librosa/numba crash this Mac).
//
//   node vo.mjs make --script <lines.txt | lines.json> --out <dir> [--provider auto|elevenlabs|openai|say] [--voice <id|name>] [--lang en]
//        [--gap 0.35] [--tone "warm, confident"] [--no-align]
//     script: a text file (one spoken line per line; blank lines and [markers] skipped) or JSON ["line", ...] / [{text, at?}] where `at` is the second the line starts
//     in the film (lines with no `at` follow the previous line after --gap seconds). --text "one line" works instead of --script.
//     -> <dir>/vo.wav (48 kHz stereo), <dir>/words.json {words:[{w,start,end,line}], lines:[{i,text,start,end}], provider, voice, duration, notes}, <dir>/vo-lines/*.wav
//     Providers: ElevenLabs if ELEVENLABS_API_KEY (or RASANAI_ELEVENLABS_API_KEY) is set, else OpenAI TTS if OPENAI_API_KEY is set, else macOS `say` (scratch quality:
//     timing and rhythm only). --provider pins one. Word times: whisper-cli (word-level DTW) on the assembled vo.wav, matched to the script's own words.
//   node vo.mjs lyrics --track <song> [--lyrics <lyrics.txt, one lyric line per line>] --out <dir> [--lang en] [--no-stems]
//     -> <dir>/lyrics.json {lines:[{i,text,start,end,words:[{w,start,end,conf}]}]} and <dir>/words.json (the flat word list), for kinetic lyric-video type.
//     The song is the person's own (opt-in song-lyric mode: scripts/lib/sound-mode.mjs); the licence they declare goes to LICENSES.json in the run, never here.
//   node vo.mjs providers      which providers this environment can use
//   node vo.mjs align --audio <wav> --script <lines> --out <words.json>     word times for an existing narration
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { parseArgs, die } from "./lib/common.mjs";
import { requireTools, probeDuration, r3 } from "./lib/audio.mjs";
import { alignLyrics, parseLyricsText, listModels, findWhisper, norm } from "./lib/lyrics.mjs";

const keyOf = (...names) => names.map((n) => process.env[n]).find((v) => v && String(v).trim()) || null;
export const providers = () => [
  { id: "elevenlabs", on: !!keyOf("RASANAI_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY"), why: "ELEVENLABS_API_KEY set", note: "paid; best quality. Disclose an AI voice where the platform asks." },
  { id: "openai", on: !!keyOf("OPENAI_API_KEY"), why: "OPENAI_API_KEY set", note: "paid; steerable with a tone instruction. Disclose an AI voice." },
  { id: "say", on: process.platform === "darwin" && !spawnSync("say", ["-v", "?"], { stdio: "ignore" }).error, why: "macOS say (free, offline)", note: "robotic: a scratch track for timing, not for a finished film" },
];
const pick = (want) => {
  const all = providers();
  if (want && want !== "auto") { const p = all.find((x) => x.id === want); if (!p || !p.on) throw new Error(`provider ${want} is not available here (${p ? p.why : "unknown"})`); return p; }
  const p = all.find((x) => x.on);
  if (!p) throw new Error("no voice provider: set ELEVENLABS_API_KEY or OPENAI_API_KEY, or run on macOS for `say`");
  return p;
};

// ---------------------------------------------------------------- script

export function readScript(file, text) {
  if (text) return [{ text: String(text).trim() }];
  const raw = fs.readFileSync(file, "utf8");
  if (/\.json$/i.test(file)) {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j : j.lines || j.vo || [];
    return arr.map((x) => (typeof x === "string" ? { text: x } : { text: String(x.text || x.line || ""), ...(x.at != null ? { at: Number(x.at) } : {}) })).filter((x) => x.text.trim());
  }
  return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^\[[^\]]*\]$/.test(l)).map((text) => ({ text }));
}

// ---------------------------------------------------------------- providers

const toWav = (inFile, out) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-nostdin", "-i", inFile, "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", out]);

async function synthElevenLabs(text, out, { voice, lang }) {
  const id = voice || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const res = await fetch(`${process.env.RASANAI_ELEVENLABS_API_BASE || "https://api.elevenlabs.io"}/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": keyOf("RASANAI_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY"), "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", ...(lang && lang !== "en" ? { language_code: lang } : {}), voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  const tmp = out + ".mp3";
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  toWav(tmp, out);
  fs.rmSync(tmp, { force: true });
  return id;
}
async function synthOpenAI(text, out, { voice, tone }) {
  const v = voice || process.env.OPENAI_TTS_VOICE || "onyx";
  const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com"}/v1/audio/speech`, {
    method: "POST",
    headers: { authorization: `Bearer ${keyOf("OPENAI_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: v, input: text, response_format: "wav", ...(tone ? { instructions: `Speak in a ${tone} tone, as a film narrator.` } : {}) }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  const tmp = out + ".src.wav";
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  toWav(tmp, out);
  fs.rmSync(tmp, { force: true });
  return v;
}
function synthSay(text, out, { voice }) {
  const v = voice || process.env.RASANAI_SAY_VOICE || "Samantha";
  const tmp = out + ".src.wav";
  const r = spawnSync("say", ["-v", v, "-o", tmp, "--file-format=WAVE", "--data-format=LEF32@48000", text], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`say failed: ${(r.stderr || "").trim().slice(0, 120)}`);
  toWav(tmp, out);
  fs.rmSync(tmp, { force: true });
  return v;
}

// ---------------------------------------------------------------- assemble and align

// lines: [{text, file, dur, at?}] -> placed {start,end}; vo.wav = every line delayed to its start
function assemble(lines, out, gap) {
  let t = 0;
  for (const l of lines) {
    l.start = l.at != null ? l.at : t;
    if (l.start < t) l.start = t; // never overlap the previous line
    l.end = l.start + l.dur;
    t = l.end + gap;
  }
  const argv = ["-y", "-loglevel", "error", "-nostdin"];
  lines.forEach((l) => argv.push("-i", l.file));
  const parts = lines.map((l, i) => `[${i}:a]adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`);
  const tail = lines.length > 1 ? `${lines.map((_, i) => `[a${i}]`).join("")}amix=inputs=${lines.length}:normalize=0:duration=longest[o]` : `[a0]anull[o]`;
  argv.push("-filter_complex", `${parts.join(";")};${tail}`, "-map", "[o]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", out);
  execFileSync("ffmpeg", argv);
}

export function alignWords(wav, scriptLines, { lang = "en", work } = {}) {
  const text = scriptLines.map((l) => l.text).join("\n");
  const r = alignLyrics(wav, { lyricsText: text, lang, noStems: true, maxModels: 1, dual: false, work, log: () => {} });
  const words = [];
  r.lines.forEach((l, i) => l.words.forEach((w) => words.push({ w: w.w, start: w.start, end: w.end, line: i, conf: w.conf })));
  return { words, lines: r.lines.map((l) => ({ i: l.i, text: l.text, start: l.start, end: l.end })), method: r.method, stats: r.stats };
}

export async function makeVO({ script, out, provider = "auto", voice, lang = "en", gap = 0.35, tone, align = true }) {
  requireTools();
  fs.mkdirSync(out, { recursive: true });
  const dirLines = path.join(out, "vo-lines");
  fs.mkdirSync(dirLines, { recursive: true });
  const P = pick(provider);
  const notes = [];
  if (P.id === "say") notes.push("macOS `say` is a scratch voice: use it for timing and rhythm, then re-run with ELEVENLABS_API_KEY or OPENAI_API_KEY for the finished film");
  let used = voice || null;
  const lines = [];
  for (let i = 0; i < script.length; i++) {
    const f = path.join(dirLines, `line-${String(i + 1).padStart(2, "0")}.wav`);
    const text = script[i].text;
    used = P.id === "elevenlabs" ? await synthElevenLabs(text, f, { voice, lang }) : P.id === "openai" ? await synthOpenAI(text, f, { voice, tone }) : synthSay(text, f, { voice });
    lines.push({ ...script[i], file: f, dur: probeDuration(f) });
  }
  const wav = path.join(out, "vo.wav");
  assemble(lines, wav, gap);
  const result = { provider: P.id, voice: used, lang, duration: r3(probeDuration(wav)), lines: lines.map((l, i) => ({ i, text: l.text, start: r3(l.start), end: r3(l.end) })), words: [], notes };
  if (align) {
    try {
      const a = alignWords(wav, script, { lang, work: path.join(out, ".align") });
      // a legato word starts on the previous word's end: never earlier than its own line's placed start
      result.words = a.words.map((w) => { const L = result.lines[w.line]; return { ...w, start: r3(Math.max(w.start, L.start)), end: r3(Math.min(Math.max(w.end, L.start + 0.02), L.end)) }; });
      result.align = { method: a.method, stats: a.stats };
      // the line spans from the heard words are tighter than the synthesised files' padded ends
      for (const l of result.lines) { const ws = result.words.filter((w) => w.line === l.i); if (ws.length) { l.speech_start = ws[0].start; l.speech_end = ws[ws.length - 1].end; } }
    } catch (e) {
      notes.push(`word timings not made: ${String(e.message).slice(0, 220)}`);
      // an even spread inside each line keeps the type moving; flagged so nothing trusts it as heard
      for (const l of result.lines) { const ws = l.text.split(/\s+/).filter(Boolean); ws.forEach((w, k) => result.words.push({ w, start: r3(l.start + ((l.end - l.start) * k) / ws.length), end: r3(l.start + ((l.end - l.start) * (k + 1)) / ws.length), line: l.i, estimated: true })); }
    }
  }
  fs.writeFileSync(path.join(out, "words.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}

export function makeLyrics({ track, lyricsText, out, lang = "en", noStems = false }) {
  requireTools();
  fs.mkdirSync(out, { recursive: true });
  const r = alignLyrics(track, { lyricsText, lang, noStems, work: path.join(out, ".align") });
  fs.writeFileSync(path.join(out, "lyrics.json"), JSON.stringify(r, null, 2) + "\n");
  const words = [];
  r.lines.forEach((l) => l.words.forEach((w) => words.push({ w: w.w, start: w.start, end: w.end, line: l.i, conf: w.conf })));
  fs.writeFileSync(path.join(out, "words.json"), JSON.stringify({ words, lines: r.lines.map((l) => ({ i: l.i, text: l.text, start: l.start, end: l.end })), source: r.source, stats: r.stats }, null, 2) + "\n");
  return { lines: r.lines.length, words: words.length, stats: r.stats, out };
}

// ---------------------------------------------------------------- cli

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = parseArgs();
  const cmd = args._[0];
  const need = (k) => (args[k] && args[k] !== true ? String(args[k]) : die(`--${k} is required`));
  try {
    if (!cmd || cmd === "help" || args.help) console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
    else if (cmd === "providers") console.log(JSON.stringify({ providers: providers(), whisper: findWhisper(), models: listModels(String(args.lang || "en")).map((m) => m.name) }, null, 2));
    else if (cmd === "make") {
      const script = readScript(args.script ? path.resolve(String(args.script)) : null, args.text && args.text !== true ? args.text : null);
      if (!script.length) die("the script has no lines");
      const r = await makeVO({ script, out: path.resolve(need("out")), provider: String(args.provider || "auto"), voice: args.voice && args.voice !== true ? String(args.voice) : undefined, lang: String(args.lang || "en"), gap: args.gap != null ? Number(args.gap) : 0.35, tone: args.tone && args.tone !== true ? String(args.tone) : undefined, align: !args["no-align"] });
      console.log(JSON.stringify({ provider: r.provider, voice: r.voice, duration: r.duration, lines: r.lines.length, words: r.words.length, notes: r.notes, vo: path.join(path.resolve(String(args.out)), "vo.wav"), words_json: path.join(path.resolve(String(args.out)), "words.json") }, null, 2));
    } else if (cmd === "lyrics") {
      const lt = args.lyrics && args.lyrics !== true ? fs.readFileSync(path.resolve(String(args.lyrics)), "utf8") : undefined;
      console.log(JSON.stringify(makeLyrics({ track: path.resolve(need("track")), lyricsText: lt, out: path.resolve(need("out")), lang: String(args.lang || "en"), noStems: !!args["no-stems"] }), null, 2));
    } else if (cmd === "align") {
      const script = readScript(path.resolve(need("script")), null);
      const a = alignWords(path.resolve(need("audio")), script, { lang: String(args.lang || "en"), work: fs.mkdtempSync(path.join(os.tmpdir(), "rasan-vo-")) });
      fs.writeFileSync(path.resolve(need("out")), JSON.stringify(a, null, 2) + "\n");
      console.log(JSON.stringify({ words: a.words.length, out: path.resolve(String(args.out)) }));
    } else die("usage: vo.mjs make|lyrics|align|providers (see the header)");
  } catch (e) {
    die(String(e.message || e));
  }
}
void norm; void parseLyricsText;
