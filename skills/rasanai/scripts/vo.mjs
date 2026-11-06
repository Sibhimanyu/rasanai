#!/usr/bin/env node
// Voiceover from a script, with word timings so on-screen type can follow the voice word by word; and timed lyrics for a song the user supplies.
// Node + ffmpeg + whisper-cli only (no Python audio libraries: librosa/numba crash this Mac).
//
//   node vo.mjs make --script <lines.txt | lines.json> --out <dir> [--provider auto|elevenlabs|openai|heygen|kokoro|edge|say] [--voice <id|name>] [--lang en]
//        [--gap <s, flat>] [--speed 1] [--pace auto|off] [--tone "warm, confident"] [--no-align]
//     script: a text file (one spoken line per line; blank lines skipped; a [marker] line starts a new beat: the gap before the next line is longer) or JSON
//     ["line", ...] / [{text, at?, gap_after?, speed?|rate?, beat?}] where `at` is the second the line starts in the film. Gaps come from the script:
//     explicit gap_after, else by punctuation (comma short, sentence medium, ellipsis long) and a beat change longest; --gap <s> forces one flat gap instead.
//     A line of two sentences is spoken as two clips (own contour, short gap between). Per-line speed (1 = the voice's own pace); --pace auto (default) re-speaks a
//     clip once at a corrected speed on the free engines (say, edge) when it runs outside 2.3-2.7 words/s. --text "one line" works instead of --script.
//     -> <dir>/vo.wav (48 kHz stereo), <dir>/words.json {words:[{w,start,end,line}], lines:[{i,text,start,end}], provider, voice, duration, notes}, <dir>/vo-lines/*.wav
//     Providers, one ladder shared with voice.mjs (lib/voice-engines.mjs): ElevenLabs (ELEVENLABS_API_KEY) > OpenAI TTS (OPENAI_API_KEY) > HeyGen (media-use + heygen CLI;
//     a quota error stops it and the next engine speaks) > Kokoro (model on disk) > edge-tts (CLI on PATH, or uvx / pipx) > macOS `say` (scratch quality: timing and
//     rhythm only). --provider pins one. Every clip is trimmed of lead/tail silence and kept <= -3 dBTP; the source's own sample rate is kept until the 48 kHz assembly. Word times: whisper-cli (word-level DTW) on the assembled vo.wav, matched to the script's own words.
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
import { engineLadder, synthRaw, conditionClip, isQuotaError, errText, countWords, splitSentences, gapAfter, paceFix, PACE } from "./lib/voice-engines.mjs";
import { alignLyrics, parseLyricsText, listModels, findWhisper, norm } from "./lib/lyrics.mjs";

const keyOf = (...names) => names.map((n) => process.env[n]).find((v) => v && String(v).trim()) || null;
export const providers = () => engineLadder().map(({ id, ok, why, note }) => ({ id, on: ok, why, note }));
// the ladder's first engine that is on (or the pinned one); `skip` = engines that already failed this run (quota, errors)
const pick = (want, skip = []) => {
  const all = engineLadder();
  if (want && want !== "auto") { const p = all.find((x) => x.id === want); if (!p || !p.ok) throw new Error(`provider ${want} is not available here (${p ? p.why : "unknown"})`); return p; }
  const p = all.find((x) => x.ok && !skip.includes(x.id));
  if (!p) throw new Error("no voice provider: set ELEVENLABS_API_KEY or OPENAI_API_KEY, sign in to HeyGen, install edge-tts (pipx install edge-tts), or run on macOS for `say`");
  return p;
};

// ---------------------------------------------------------------- script

export function readScript(file, text) {
  if (text) return [{ text: String(text).trim() }];
  const raw = fs.readFileSync(file, "utf8");
  if (/\.json$/i.test(file)) {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j : j.lines || j.vo || [];
    return arr.map((x) => {
      if (typeof x === "string") return { text: x };
      const sp = Number(x.speed ?? x.rate), gp = Number(x.gap_after ?? x.gap);
      return { text: String(x.text || x.line || ""), ...(x.at != null ? { at: Number(x.at) } : {}), ...(Number.isFinite(gp) && (x.gap_after != null || x.gap != null) ? { gap_after: gp } : {}), ...(Number.isFinite(sp) && sp > 0 ? { speed: sp } : {}), ...(x.beat != null ? { beat: String(x.beat) } : {}) };
    }).filter((x) => x.text.trim());
  }
  // a [marker] line on its own is a beat boundary: the next line is flagged, so the gap before it is the long one
  const out = [];
  let brk = false;
  for (const l of raw.split(/\r?\n/).map((x) => x.trim())) {
    if (!l) continue;
    if (/^\[[^\]]*\]$/.test(l)) { brk = out.length > 0; continue; }
    out.push({ text: l, ...(brk ? { beat_break: true } : {}) });
    brk = false;
  }
  return out;
}

// ---------------------------------------------------------------- providers

async function synthElevenLabs(text, out, { voice, lang, speed = 1 }) {
  const id = voice || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const res = await fetch(`${process.env.RASANAI_ELEVENLABS_API_BASE || "https://api.elevenlabs.io"}/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": keyOf("RASANAI_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY"), "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", ...(lang && lang !== "en" ? { language_code: lang } : {}), voice_settings: { stability: 0.5, similarity_boost: 0.75, ...(speed !== 1 ? { speed: Math.max(0.7, Math.min(1.2, speed)) } : {}) } }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  return id;
}
async function synthOpenAI(text, out, { voice, tone, speed = 1 }) {
  const v = voice || process.env.OPENAI_TTS_VOICE || "onyx";
  const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com"}/v1/audio/speech`, {
    method: "POST",
    headers: { authorization: `Bearer ${keyOf("OPENAI_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: v, input: text, response_format: "wav", ...(speed !== 1 ? { speed: Math.max(0.25, Math.min(4, speed)) } : {}), ...(tone ? { instructions: `Speak in a ${tone} tone, as a film narrator.` } : {}) }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  return v;
}
// one clip from any engine on the ladder: synth to a raw file, then trim and headroom into `out` (48 kHz stereo, the mix's rate; a higher source rate is never cut before this point)
async function synthClip(P, text, out, { voice, lang, tone, speed }) {
  const raw = out + ".raw";
  try {
    let used = voice || null;
    if (P.id === "elevenlabs") used = await synthElevenLabs(text, raw, { voice, lang, speed });
    else if (P.id === "openai") used = await synthOpenAI(text, raw, { voice, tone, speed });
    else synthRaw(P, text, raw, { voice, lang, speed });
    const info = conditionClip(raw, out, { rate: 48000, channels: 2, tempo: P.id === "say" ? speed : 1 });
    return { voice: used, ...info };
  } finally { fs.rmSync(raw, { force: true }); }
}

// ---------------------------------------------------------------- assemble and align

// clips: [{file, dur, at?, gap}] (gap = silence after the clip) -> placed {start,end}; vo.wav = every clip delayed to its start
function assemble(clips, out) {
  let t = 0;
  for (const l of clips) {
    l.start = l.at != null ? l.at : t;
    if (l.start < t) l.start = t; // never overlap the previous clip
    l.end = l.start + l.dur;
    t = l.end + l.gap;
  }
  const argv = ["-y", "-loglevel", "error", "-nostdin"];
  clips.forEach((l) => argv.push("-i", l.file));
  const parts = clips.map((l, i) => `[${i}:a]adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`);
  const tail = clips.length > 1 ? `${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:duration=longest[o]` : `[a0]anull[o]`;
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

export async function makeVO({ script, out, provider = "auto", voice, lang = "en", gap = null, speed = 1, pace = "auto", tone, align = true }) {
  requireTools();
  fs.mkdirSync(out, { recursive: true });
  const dirLines = path.join(out, "vo-lines");
  fs.mkdirSync(dirLines, { recursive: true });
  const pinned = provider && provider !== "auto";
  let P = pick(provider);
  const first = P.id, failed = [];
  const notes = [];
  let used = voice || null;
  const clips = [];
  const nn = (i) => String(i + 1).padStart(2, "0");
  for (let i = 0; i < script.length; i++) {
    const ln = script[i], next = script[i + 1];
    const parts = splitSentences(ln.text);
    const beatChange = !!next && (!!next.beat_break || (ln.beat != null && next.beat != null && ln.beat !== next.beat));
    for (let j = 0; j < parts.length; j++) {
      const f = path.join(dirLines, `line-${nn(i)}${parts.length > 1 ? `-${String.fromCharCode(97 + j)}` : ""}.wav`);
      const text = parts[j], lastOfLine = j === parts.length - 1;
      let sp = ln.speed || speed || 1;
      // an engine that is out of quota or errors is dropped for the rest of the run and the next on the ladder speaks (never the same text again to the same engine)
      for (;;) {
        try {
          const r = await synthClip(P, text, f, { voice: P.id === first ? voice : undefined, lang, tone, speed: sp });
          used = r.voice || used;
          break;
        } catch (e) {
          const why = errText(e).split("\n").filter(Boolean).pop() || String(e.message);
          if (pinned) throw e;
          failed.push(P.id);
          notes.push(isQuotaError(errText(e)) ? `${P.id}: voice quota or credit is used up (${String(why).slice(0, 100)}); stopped using it and moved to the next engine` : `${P.id} failed (${String(why).slice(0, 100)}); moved to the next engine`);
          P = pick("auto", failed);
        }
      }
      // pace: the script rule is 2.3-2.7 words/s; the free engines are fast, so a clip outside the range is re-spoken (up to twice, free engines only) at a corrected speed (changed input, so not a blind retake)
      let d = probeDuration(f);
      if (pace !== "off" && !ln.speed && (P.id === "say" || P.id === "edge" || P.id === "kokoro")) {
        for (let pass = 0; pass < 2; pass++) { // free engines only (no cost per pass); each pass changes the speed, so never an identical resend
          const fix = paceFix(countWords(text), d, sp);
          if (!fix || fix === sp) break;
          try { await synthClip(P, text, f, { voice: P.id === first ? voice : undefined, lang, tone, speed: fix }); sp = fix; d = probeDuration(f); } catch { break; }
        }
      }
      const inside = !lastOfLine;
      const g = gapAfter(text, { explicit: lastOfLine && ln.gap_after != null ? ln.gap_after : gap != null ? gap : undefined, beatChange: lastOfLine && beatChange, inside });
      clips.push({ line: i, text, file: f, dur: d, speed: sp, words: countWords(text), at: j === 0 ? ln.at : undefined, gap: g });
    }
  }
  if (P.id === "say") notes.push("macOS `say` is a scratch voice: use it for timing and rhythm, then re-run with a better engine (ElevenLabs, OpenAI, HeyGen, edge-tts) for the finished film");
  if (P.id !== first) notes.push(`engine moved from ${first} to ${P.id}: the voice may differ from the one asked for`);
  const wav = path.join(out, "vo.wav");
  assemble(clips, wav);
  const lines = script.map((ln, i) => { const cs = clips.filter((c) => c.line === i); return { ...ln, clips: cs.length, start: cs[0].start, end: cs[cs.length - 1].end, gap_after: cs[cs.length - 1].gap }; });
  const speech = clips.reduce((a2, c) => a2 + c.dur, 0), nw = clips.reduce((a2, c) => a2 + c.words, 0);
  const wps = speech > 0 ? r3(nw / speech) : null;
  if (wps != null && (wps > PACE.hi + 0.15 || wps < PACE.lo - 0.15)) notes.push(`speech rate ${wps} words/s is outside the launch-VO target ${PACE.lo}-${PACE.hi}: set per-line speed in the script, or pick another voice`);
  const result = { provider: P.id, voice: used, lang, duration: r3(probeDuration(wav)), words_per_s: wps, lines: lines.map((l, i) => ({ i, text: l.text, start: r3(l.start), end: r3(l.end), clips: l.clips, gap_after: r3(l.gap_after) })), clips: clips.map((c) => ({ line: c.line, text: c.text, start: r3(c.start), end: r3(c.end), speed: c.speed, gap_after: r3(c.gap) })), words: [], notes };
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
      const r = await makeVO({ script, out: path.resolve(need("out")), provider: String(args.provider || "auto"), voice: args.voice && args.voice !== true ? String(args.voice) : undefined, lang: String(args.lang || "en"), gap: args.gap != null && args.gap !== true ? Number(args.gap) : null, speed: args.speed && args.speed !== true ? Number(args.speed) : 1, pace: String(args.pace || "auto"), tone: args.tone && args.tone !== true ? String(args.tone) : undefined, align: !args["no-align"] });
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
