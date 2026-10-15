#!/usr/bin/env node
// Voice samples for the Voice step: the video's own hook line spoken in 3-4
// candidate voices, so narration is chosen by ear. Uses media-use's HeyGen TTS
// helper (the same engine the workflows' audio step uses; needs the heygen CLI
// signed in). Prints console-ready options; the chosen `id` is passed to the
// workflow's audio step as --voice.
//
//   node voice.mjs --run <run dir> --line "Launch week, simplified." [--tone "warm,confident"] [--voices id1,id2] [--count 3] [--lang en]
//   -> {"options":[{"id","title","mood","file","source"}], "recommended", "provider":"heygen"}
// Unavailable (no heygen) -> {"options":[], "unavailable":"..."} and exit 0.
//
//   node voice.mjs verify --audio <vo.wav> --script <lines.json|lines.txt> [--names "Brand,Product"] [--lang en]
//        [--captions <captions.json> | --srt <file.srt> | --project <dir>] [--max-wer 0.2]
//   -> the narration, transcribed by whisper-cli (the model footage.mjs transcribe uses; no prompt, so a name the voice mangles is not
//      rescued), aligned word by word to the script: {lines:[{n,text,heard,wer,start,end}], names, captions, findings}.
//      error `line-wer`: a line's word error rate is over --max-wer (0.2); error `name-misheard`: a --names word was not heard as written
//      (the voice mispronounces it: respell it phonetically in the TTS text or pick another voice); warning: a line over 0.1.
//      Caption timing (captions from --captions / --srt / <project>/compositions/captions.html): error `caption-too-short` when a caption
//      is on screen for less than max(1.8 s, its speech + 0.6 s).
//      See-and-say and caption duplicates (WARNINGS, uncalibrated; with --project [--score <run>/motion/score.json] [--offset <s the audio starts in the film>] [--no-sync]; loads the built compositions headlessly):
//      `see-and-say`: a narration cue (a sentence, or a phrase ended by a 0.6 s pause, from the heard word times) with no on-screen event within 1.0 s (a score event, a beat start, a line of text appearing; captions never count);
//      `text-off-word`: a line of text that names a word the voice says elsewhere, not within 1.0 s of it; `caption-duplicates-text`: a caption and another on-screen line say the same words in the same window.
//      Exit 0 = clean (warnings allowed), 2 = findings, 1 = could not run (no whisper-cli / model / audio; logged as a downgrade). Prints JSON.
//
//   node voice.mjs verify --mix <final.mp4|wav> --script <lines> (--windows <json [{start,end}|[s,e]] one per line> | --meta <audio_meta.json> --scenes <scenes.json>)
//        [--max-wer 0.2] [--lang en]
//   -> the same check on the FINAL MIX, one transcription per line window (the window plus 0.25 s each side, a clip under 2 s padded with 0.6 s of silence so whisper
//      does not skip it): music, ducking and SFX can bury or smear a word that the clean VO stem still passes. Findings are warnings (mix-line-wer).
//
//   node voice.mjs refine --audio <vo.wav> [--words <words.json | audio_meta.json [--frame <n>]>] [--out <refined.json>] [--noise -35] [--min-gap 0.06]
//   -> snaps word times to the audible speech (ffmpeg silencedetect): a word that starts in silence moves to the next speech onset (within 0.3 s), one that starts
//      just after an onset snaps back to it (within 0.15 s), ends likewise. TTS word timings and whisper timings both run early or late by 50-200 ms; text that must
//      land 0-2 frames before its word needs the real onset. No --words: the clip is transcribed first (whisper-cli). {words, changes, speech_spans}.
//
//   node voice.mjs speak --run <run> --script <lines.json|lines.txt> [--voice <id>] [--engine auto|heygen|kokoro|edge] [--lang en] [--speed 1] [--retakes 3] [--match 0.92]
//        [--respell '{"Brand":"bray-nd"}'] [--out <dir>] [--names "Brand,Product"]
//   -> narration by take, transcribe, retake: each line is spoken, trimmed, transcribed back (verify's alignment) and kept when 92% of its words match, no 3 words are
//      dropped or added and no non-speech tag ("(laughs)") was heard; otherwise up to 3 retakes (from the second, --respell is applied) and the best take is kept.
//      A single-word line gets its vowel tail trimmed (TTS adds an "uh" after a lone word). Files: <dir>/line-NN.wav, speak.json. Engines, in order: HeyGen via media-use,
//      then Kokoro (the kokoro-tts CLI with its model files already on disk: RASANAI_KOKORO_DIR or the cwd) and edge-tts (online, no key) if installed; a model is
//      never downloaded here. Voice-prompt rules for a model that takes a description: describe the voice (age, pace, warmth), put IPA in quotes for a hard name, never SSML.
//      Exit 0 = every line matched, 2 = a line stayed under the match after its retakes (warnings, the best take is kept), 1 = could not run (no engine, or no whisper-cli
//      / model to listen with; logged as a downgrade).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs, die } from "./lib/common.mjs";
import { findSkill } from "./lib/hyperframes.mjs";
import { track } from "./lib/report.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";
import { decideLanguage, hasWhisperCli, whisperTranscribe } from "./lib/lang.mjs";

const args = parseArgs();
function main() {
track("Recording your first line in a few voices", "Voice samples ready");
if (!args.run) die("--run required");
if (!args.line) die('--line "<the hook line>" required (a real line from the script)');
const count = Math.max(2, Math.min(4, Number(args.count || 3)));
const mediaUse = findSkill("media-use");
const tts = mediaUse && path.join(mediaUse, "audio", "scripts", "heygen-tts.mjs");
const out = (result) => {
  if (result.unavailable) noteDowngrade({ run: args.run, what: "voice samples", instead: "the workflow's default voice", why: String(result.unavailable).slice(0, 200) });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
};
if (!tts || !fs.existsSync(tts)) out({ options: [], unavailable: "media-use (HyperFrames) is not installed; run `npx hyperframes skills update`. The workflow will use its default voice." });

let list = [];
try {
  const txt = execFileSync("node", [tts, "--list"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
  // "<id>\t<Name - Style & Style>\t<Language>"
  list = txt
    .split("\n")
    .map((l) => l.split("\t"))
    .filter((c) => c.length >= 2 && /^[0-9a-f]{16,}$/.test(c[0]))
    .map(([id, name, lang]) => ({ id, name: name.trim(), lang: (lang || "").trim() }));
} catch (e) {
  out({ options: [], unavailable: `Could not list HeyGen voices (${String(e.stderr || e.message).split("\n").filter(Boolean).pop()}). Sign in with the heygen CLI, or the workflow uses its default voice.` });
}
const lang = String(args.lang || "en").toLowerCase();
const langName = { en: "english", fr: "french", de: "german", es: "spanish", hi: "hindi", ta: "tamil", ja: "japanese" }[lang] || lang;
let pool = list.filter((v) => !v.lang || v.lang.toLowerCase().includes(langName));
if (!pool.length) pool = list;

let chosen;
if (args.voices) {
  const ids = String(args.voices).split(",").map((s) => s.trim());
  chosen = ids.map((id) => pool.find((v) => v.id === id) || { id, name: id }).slice(0, 4);
} else {
  // match the tone words against the voice style names ("Warm & Friendly", "Firm & Measured"...)
  const tone = String(args.tone || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  const score = (v) => tone.filter((t) => v.name.toLowerCase().includes(t)).length;
  const ranked = pool.map((v, i) => ({ v, k: score(v) * 10 - i / 1000 })).sort((a, b) => b.k - a.k).map((x) => x.v);
  // spread across styles: don't offer three "Warm & Friendly" voices
  chosen = [];
  const seenStyle = new Set();
  for (const v of ranked) {
    const style = v.name.split("-").slice(1).join("-").trim().toLowerCase();
    if (seenStyle.has(style) && chosen.length < ranked.length - 1) continue;
    seenStyle.add(style);
    chosen.push(v);
    if (chosen.length === count) break;
  }
}

const dir = path.resolve(String(args.run), "voice");
fs.mkdirSync(dir, { recursive: true });
const ws = process.cwd();
const options = [];
const failures = [];
for (const v of chosen) {
  const file = path.join(dir, `${v.id.slice(0, 12)}.wav`);
  try {
    execFileSync("node", [tts, String(args.line), "-o", file, "--voice", v.id, "--lang", lang], { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
    const [nm, ...style] = v.name.split("-");
    options.push({ id: v.id, title: nm.trim(), mood: style.join("-").trim() || v.name, file: path.relative(ws, file), source: "HeyGen voice via media-use" });
  } catch (e) {
    failures.push(`${v.name}: ${String(e.stderr || e.message).split("\n").filter(Boolean).pop()}`);
  }
}
const result = { options, recommended: options[0] ? options[0].id : null, provider: "heygen" };
if (!options.length) result.unavailable = `No voice samples could be made (${failures.join("; ") || "no voices"}). The workflow will use its default voice unless you name one.`;
else if (failures.length) result.partial = failures;
out(result);
}

// ---------------------------------------------------------------- verify
const NUM = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" ");
const norm = (t) => String(t).toLowerCase().replace(/[\u2019\u2018]/g, "'").replace(/&/g, " and ").replace(/[-\u2013\u2014]/g, " ").replace(/(\d),(\d)/g, "$1$2").replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean).map((w) => (/^\d+$/.test(w) && Number(w) <= 20 ? NUM[Number(w)] : w));
const r2 = (v) => Math.round(v * 100) / 100;
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }

function readScript(file) {
  const t = fs.readFileSync(file, "utf8");
  let lines;
  try {
    const j = JSON.parse(t);
    const a = Array.isArray(j) ? j : Array.isArray(j.lines) ? j.lines : Array.isArray(j.script) ? j.script : null;
    if (!a) throw new Error("not a list");
    lines = a.map((x) => (typeof x === "string" ? x : x.text || x.line || x.vo || "")).map((x) => String(x).trim());
  } catch { lines = t.split("\n").map((l) => l.trim()); }
  return lines.filter(Boolean);
}
// captions [{text,start,end}] from a json list, an .srt, or the elements of compositions/captions.html that carry data-start + data-duration/data-end
function readCaptions() {
  const tc = (s) => { const m = String(s).trim().match(/^(\d+):(\d+):(\d+)[,.](\d+)$/); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number("0." + m[4]) : NaN; };
  if (args.captions && args.captions !== true) { const j = JSON.parse(fs.readFileSync(String(args.captions), "utf8")); return { from: String(args.captions), list: (Array.isArray(j) ? j : j.captions || []).map((c) => ({ text: c.text, start: Number(c.start), end: c.end != null ? Number(c.end) : Number(c.start) + Number(c.duration) })) }; }
  if (args.srt && args.srt !== true) return { from: String(args.srt), list: fs.readFileSync(String(args.srt), "utf8").split(/\n\s*\n/).map((b) => { const l = b.trim().split("\n"); const m = (l[1] || "").match(/(\S+)\s*-->\s*(\S+)/); return m ? { text: l.slice(2).join(" "), start: tc(m[1]), end: tc(m[2]) } : null; }).filter(Boolean) };
  if (args.project && args.project !== true) {
    for (const f of [path.join("compositions", "captions.html"), "captions.html"]) {
      const file = path.join(path.resolve(String(args.project)), f);
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, "utf8"), list = [], stack = [], VOID = /^(br|img|hr|input|meta|link|source)$/i;
      for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
        const [, close, tag, attrs, self] = m;
        if (close) { const i = stack.map((e) => e.tag).lastIndexOf(tag); if (i < 0) continue; const e = stack.splice(i)[0]; if (e.cap && !stack.some((x) => x.cap)) { const text = html.slice(e.at, m.index).replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); if (text) list.push({ text, start: e.start, end: e.end }); } }
        else if (!self && !VOID.test(tag)) {
          const st = attrs.match(/data-start="([\d.]+)"/), du = attrs.match(/data-duration="([\d.]+)"/), en = attrs.match(/data-end="([\d.]+)"/);
          const cap = !!st && (!!du || !!en) && /caption|cue|subtitle/i.test(attrs);
          stack.push({ tag, at: m.index + m[0].length, cap, start: st ? Number(st[1]) : 0, end: st ? (du ? Number(st[1]) + Number(du[1]) : Number(en[1])) : 0 });
        }
      }
      if (list.length) return { from: path.relative(process.cwd(), file), list };
    }
    return { from: null, list: [], why: "no captions in the project (no compositions/captions.html caption with data-start and data-duration)" };
  }
  return { from: null, list: [], why: "no --captions, --srt or --project given" };
}

// the script's words (each with its line) against the heard words (each with its time), by Levenshtein alignment: per-line errors and the
// heard words and span of each line, the link of every script word to the heard one, and the longest run of dropped script words / added heard words
function align(lines, words) {
  const ref = [], hyp = [];
  lines.forEach((l, li) => norm(l).forEach((w) => ref.push({ w, li })));
  for (const x of words) for (const w of norm(x.text)) hyp.push({ w, start: x.start, end: x.end });
  const n = ref.length, m = hyp.length;
  const D = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 1; i <= n; i++) D[i][0] = i;
  for (let j = 1; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (ref[i - 1].w === hyp[j - 1].w ? 0 : 1));
  const per = lines.map(() => ({ N: 0, err: 0, heard: [], start: null, end: null }));
  let i = n, j = m;
  const link = new Array(n).fill(null);
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (ref[i - 1].w === hyp[j - 1].w ? 0 : 1)) { const same = ref[i - 1].w === hyp[j - 1].w; link[i - 1] = { j: j - 1, same }; if (!same) per[ref[i - 1].li].err++; i--; j--; }
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { link[i - 1] = { j: -1, same: false }; per[ref[i - 1].li].err++; i--; }
    else { per[ref[Math.min(Math.max(i, 1), n) - 1].li].err++; j--; } // heard a word the script does not have
  }
  ref.forEach((r, k) => { per[r.li].N++; const l = link[k]; if (l && l.j >= 0) { const h = hyp[l.j]; per[r.li].heard.push(h.w); per[r.li].start = per[r.li].start == null ? h.start : Math.min(per[r.li].start, h.start); per[r.li].end = Math.max(per[r.li].end ?? 0, h.end); } });
  const used = new Set(link.filter((l) => l && l.j >= 0).map((l) => l.j));
  const run = (flags) => { let c = 0, mx = 0; for (const f of flags) { c = f ? c + 1 : 0; mx = Math.max(mx, c); } return mx; };
  return { ref, hyp, link, per, n, m, maxDrop: run(link.map((l) => !l || l.j < 0)), maxAdd: run(hyp.map((_, k) => !used.has(k))) };
}

async function verify() {
  if (args.mix && args.mix !== true) return verifyMix();
  track("Listening to the narration against the script", "Narration checked");
  const run = args.run && args.run !== true ? args.run : undefined;
  const cannot = (why) => { noteDowngrade({ run, what: "narration check by transcription", instead: "the voiceover was not verified against the script", why: String(why).slice(0, 200) }); process.stderr.write(`rasanai: could not run: ${why}\n`); process.exit(1); };
  if (!args.audio || args.audio === true || !fs.existsSync(String(args.audio))) die("--audio <vo.wav> is required (and must exist)");
  if (!args.script || args.script === true || !fs.existsSync(String(args.script))) die("--script <lines.json|lines.txt> is required (and must exist)");
  const lines = readScript(String(args.script));
  if (!lines.length) die("the script has no lines");
  const names = String(args.names && args.names !== true ? args.names : "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!hasWhisperCli()) cannot("whisper-cli is not installed (brew install whisper-cpp), and nothing else transcribes here");
  const dec = decideLanguage({ file: String(args.audio), lang: args.lang && args.lang !== true ? String(args.lang) : "en", duration: 0 });
  if (dec.blocked || !dec.model) cannot(dec.blocked || "no whisper model installed (hyperframes models install)");
  let tr;
  try { tr = whisperTranscribe(String(args.audio), { model: dec.model.file, lang: dec.lang }); } catch (e) { cannot(`transcription failed: ${String(e.message).split("\n").pop()}`); }
  const maxWer = Number(args["max-wer"] || 0.2);

  const { ref, hyp, link, per, n, m } = align(lines, tr.words);
  const findings = [];
  const outLines = lines.map((text, li) => {
    const p = per[li], wer = p.N ? p.err / p.N : 0;
    if (wer > maxWer) findings.push({ severity: "error", check: "line-wer", line: li + 1, message: `line ${li + 1} "${text.slice(0, 70)}": word error rate ${r2(wer)} (over ${maxWer}); the voice said "${p.heard.join(" ")}"`, fix: "re-record the line (a different voice, or respell the hard words phonetically in the TTS text) and check again" });
    else if (wer > 0.1) findings.push({ severity: "warning", check: "line-wer", line: li + 1, message: `line ${li + 1} "${text.slice(0, 70)}": word error rate ${r2(wer)}; heard "${p.heard.join(" ")}"` });
    return { n: li + 1, text, heard: p.heard.join(" "), wer: r2(wer), start: p.start == null ? null : r2(p.start), end: p.end == null ? null : r2(p.end) };
  });
  // names: every occurrence in the script must be heard exactly
  const nameRows = names.map((name) => {
    const toks = norm(name), hits = [];
    for (let k = 0; k + toks.length <= n; k++) if (toks.every((t, d) => ref[k + d].w === t)) hits.push(k);
    const row = { name, in_script: hits.length, misheard: [] };
    if (!toks.length) return row;
    if (!hits.length) { findings.push({ severity: "warning", check: "name-not-in-script", message: `"${name}" is not in the script, so its pronunciation was not checked` }); return row; }
    for (const k of hits) {
      const bad = toks.some((_, d) => !(link[k + d] && link[k + d].same));
      if (bad) { const heard = toks.map((_, d) => (link[k + d] && link[k + d].j >= 0 ? hyp[link[k + d].j].w : "(nothing)")).join(" "); row.misheard.push({ line: ref[k].li + 1, heard }); findings.push({ severity: "error", check: "name-misheard", line: ref[k].li + 1, message: `"${name}" in line ${ref[k].li + 1} was heard as "${heard}": the voice mispronounces it`, fix: `respell it phonetically in the TTS text (and keep the caption spelled right), or choose another voice` }); }
    }
    return row;
  });
  // captions: each on screen >= max(1.8 s, its speech + 0.6 s)
  let cap = { checked: false };
  try {
    const cs = readCaptions();
    if (!cs.list.length) cap = { checked: false, why: cs.why || "no captions found" };
    else {
      const rows = [];
      for (const c of cs.list) {
        const ct = norm(c.text);
        if (!ct.length || !Number.isFinite(c.start) || !Number.isFinite(c.end)) continue;
        let best = null;
        for (let k = 0; k + ct.length <= n; k++) { const d = lev(ct, ref.slice(k, k + ct.length).map((r) => r.w)); if (!best || d < best.d) best = { d, k }; }
        const shown = r2(c.end - c.start);
        if (!best || best.d > Math.ceil(ct.length / 2)) { rows.push({ text: c.text, start: c.start, shown, matched: false }); continue; }
        const hs = []; for (let d = 0; d < ct.length; d++) { const l = link[best.k + d]; if (l && l.j >= 0) hs.push(hyp[l.j]); }
        if (!hs.length) { rows.push({ text: c.text, start: c.start, shown, matched: false }); continue; }
        const speech = Math.max(...hs.map((h) => h.end)) - Math.min(...hs.map((h) => h.start)), need = Math.max(1.8, speech + 0.6);
        rows.push({ text: c.text, start: r2(c.start), shown, speech: r2(speech), need: r2(need), matched: true, ok: shown >= need - 0.01 });
        if (shown < need - 0.01) findings.push({ severity: "error", check: "caption-too-short", message: `caption "${String(c.text).slice(0, 60)}" at ${r2(c.start)} s is shown ${shown} s; it needs ${r2(need)} s (max of 1.8 s and its ${r2(speech)} s of speech + 0.6 s)`, fix: "hold it longer (until the next caption starts, or speech + 0.6 s), never speed the voice up" });
      }
      const un = rows.filter((r) => !r.matched).length;
      if (un) findings.push({ severity: "warning", check: "caption-not-in-script", message: `${un} caption(s) could not be matched to the script, so their timing was not checked` });
      cap = { checked: true, from: cs.from, captions: rows.length, short: rows.filter((r) => r.matched && !r.ok).length, rows };
    }
  } catch (e) { cap = { checked: false, why: `captions unreadable: ${e.message}` }; }

  // see-and-say + caption duplicates: the film's DOM text against the narration's word times (warnings)
  let sync = { checked: false, why: "give --project to compare the narration with the on-screen text" };
  if (args.project && args.project !== true && !args["no-sync"]) {
    try {
      const tf = await import("./lib/textfit.mjs"), r = await tf.textFit(path.resolve(String(args.project)));
      if (r.could_not_run.length) sync = { checked: false, why: r.could_not_run[0] };
      else {
        const off = Number(args.offset) || 0, words = tr.words.map((w) => ({ ...w, start: w.start + off, end: (w.end ?? w.start) + off })), evs = [];
        if (args.score && args.score !== true) {
          try {
            const sc = JSON.parse(fs.readFileSync(path.resolve(String(args.score)), "utf8")); let t0 = 0;
            for (const b of sc.beats || sc.scenes || []) {
              const st = Number.isFinite(Number(b.start)) && b.start != null && b.start !== "" ? Number(b.start) : t0, en = Number.isFinite(Number(b.end)) && b.end != null ? Number(b.end) : st + (Number(b.duration) || Number(b.duration_s) || 0);
              t0 = en; evs.push({ t: st, what: `beat ${b.id || ""} starts` });
              for (const e of Array.isArray(b.events) ? b.events : []) { const t = Number(e.t ?? e.at); if (Number.isFinite(t)) evs.push({ t: t <= en - st + 0.05 ? st + t : t, what: String(e.what || e.sound || "event").slice(0, 30) }); }
            }
          } catch {}
        }
        const cues = tf.cuesOf(words);
        for (const f of [...tf.seeAndSay(cues, evs, r.texts, words), ...tf.captionDupes(r.texts)]) findings.push({ severity: "warning", check: f.check, at: f.at, message: f.message, fix: f.fix });
        sync = { checked: true, cues: cues.length, events: evs.length, texts: r.texts.length, offset_s: off, score: evs.length ? "read" : "none (text appearances and beat starts only)" };
      }
    } catch (e) { sync = { checked: false, why: `could not compare with the on-screen text: ${String(e.message).slice(0, 120)}` }; }
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const total = lines.reduce((a, _, k) => a + per[k].err, 0);
  console.log(JSON.stringify({ ok: !errors, verdict: errors ? "findings" : findings.length ? "clean, warnings" : "clean", model: tr.model, language: tr.language, wer: r2(total / Math.max(1, n)), words: { script: n, heard: m }, lines: outLines, names: nameRows, captions: cap, sync, findings }, null, 2));
  process.exit(errors ? 2 : 0);
}


// ---------------------------------------------------------------- shared by refine / speak / verify --mix
const sh = (bin, argv, opts = {}) => spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
const probeDur = (f) => Number(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f]).stdout) || 0;
const runOf = () => (args.run && args.run !== true ? args.run : undefined);
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-voice-"));
const NONSPEECH = /^[\[(*♪]|[\])*♪]$/;

// transcribe a clip; a clip under 2 s is padded with 0.6 s of silence each side (whisper skips very short clips), the padding taken off the times again
function listen(file, { model, lang, start = 0, dur = 0 }) {
  const t = tmpDir();
  try {
    const src = path.join(t, "src.wav");
    const win = dur > 0 ? dur : probeDur(file) - start;
    const pad = win < 2 ? 0.6 : 0;
    const argv = ["-v", "error", "-y", ...(start > 0 ? ["-ss", String(start)] : []), "-i", file, ...(dur > 0 ? ["-t", String(dur)] : []), "-vn", "-ac", "1", "-ar", "16000"];
    if (pad) argv.push("-af", `adelay=${pad * 1000}:all=1,apad=pad_dur=${pad}`);
    argv.push("-c:a", "pcm_s16le", src);
    if (sh("ffmpeg", argv).status !== 0) throw new Error("ffmpeg could not read the audio");
    const tr = whisperTranscribe(src, { model, lang, tmp: path.join(t, "w") });
    const words = tr.words.map((w) => ({ ...w, start: w.start - pad + start, end: w.end - pad + start })).filter((w) => w.end > start - 0.01);
    return { words, tags: words.filter((w) => NONSPEECH.test(w.text.trim())).map((w) => w.text), padded: !!pad };
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
}
// whisper + its model, or a "could not run" exit
function needListener(what) {
  const cannot = (why) => { noteDowngrade({ run: runOf(), what, instead: "no listening check", why: String(why).slice(0, 200) }); process.stderr.write(`rasanai: could not run: ${why}\n`); process.exit(1); };
  if (!hasWhisperCli()) cannot("whisper-cli is not installed (brew install whisper-cpp), and nothing else transcribes here");
  const dec = decideLanguage({ file: String(args.audio || args.mix || args.script || ""), lang: args.lang && args.lang !== true ? String(args.lang) : "en", duration: 0 });
  if (dec.blocked || !dec.model) cannot(dec.blocked || "no whisper model installed (hyperframes models install)");
  return { model: dec.model.file, lang: dec.lang, cannot };
}
const wordList = (j, frame) => (Array.isArray(j) ? j : Array.isArray(j.words) ? j.words : (j.voices || []).filter((v) => frame == null || Number(v.frame) === Number(frame)).flatMap((v) => v.words || [])).map((w) => ({ ...w, text: w.text, start: Number(w.start), end: w.end != null ? Number(w.end) : Number(w.start) + 0.2 })).filter((w) => Number.isFinite(w.start));

// ---------------------------------------------------------------- refine
function refine() {
  track("Snapping word times to the audible speech", "Word times refined");
  if (!args.audio || args.audio === true || !fs.existsSync(String(args.audio))) die("--audio <vo.wav> is required (and must exist)");
  const audio = String(args.audio), dur = probeDur(audio), noise = Number(args.noise ?? -35), minGap = Number(args["min-gap"] ?? 0.06);
  let words;
  if (args.words && args.words !== true) { if (!fs.existsSync(String(args.words))) die("--words file not found"); words = wordList(JSON.parse(fs.readFileSync(String(args.words), "utf8")), args.frame); }
  else { const L = needListener("word times snapped to speech"); words = listen(audio, L).words; }
  if (!words.length) die("no words to refine");
  const r = sh("ffmpeg", ["-hide_banner", "-nostats", "-i", audio, "-vn", "-af", `silencedetect=noise=${noise}dB:d=${minGap}`, "-f", "null", "-"]);
  if (r.status !== 0) { noteDowngrade({ run: runOf(), what: "word times snapped to speech", instead: "the word times as given", why: "ffmpeg silencedetect failed" }); process.stderr.write("rasanai: could not run: ffmpeg silencedetect failed\n"); process.exit(1); }
  const sil = [];
  let cur = null;
  for (const m of String(r.stderr).matchAll(/silence_(start|end): (-?[\d.]+)/g)) { if (m[1] === "start") cur = Math.max(0, Number(m[2])); else if (cur != null) { sil.push([cur, Number(m[2])]); cur = null; } }
  if (cur != null) sil.push([cur, dur]);
  const spans = [];
  let at = 0;
  for (const [a, b] of sil) { if (a - at > 0.02) spans.push([at, a]); at = b; }
  if (dur - at > 0.02) spans.push([at, dur]);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const inSpan = (t) => spans.find(([a, b]) => t >= a && t <= b);
  const out = [], changes = [];
  words.sort((a, b) => a.start - b.start);
  words.forEach((w, i) => {
    const prevEnd = i ? out[i - 1].end : 0, nextStart = i + 1 < words.length ? words[i + 1].start : dur;
    let s0 = w.start, e0 = w.end;
    if (!inSpan(s0)) { const nx = spans.find(([a]) => a >= s0 && a - s0 <= 0.3); if (nx) s0 = nx[0]; }
    else { const sp = spans.find(([a]) => a >= s0 - 0.15 && a < s0 && a >= prevEnd - 0.01); if (sp) s0 = sp[0]; }
    if (!inSpan(e0)) { const pv = [...spans].reverse().find(([, b]) => b <= e0 && e0 - b <= 0.3 && b > s0); if (pv) e0 = pv[1]; }
    else { const sp = spans.find(([, b]) => b > e0 && b - e0 <= 0.15 && b <= nextStart + 0.01); if (sp) e0 = sp[1]; }
    if (e0 <= s0) { s0 = w.start; e0 = w.end; }
    out.push({ ...w, start: r3(s0), end: r3(e0) });
    if (Math.abs(s0 - w.start) > 0.004 || Math.abs(e0 - w.end) > 0.004) changes.push({ word: w.text, start_ms: Math.round((s0 - w.start) * 1000), end_ms: Math.round((e0 - w.end) * 1000) });
  });
  const res = { audio, noise_db: noise, words: out, changes: changes.length, moved: changes.slice(0, 40), speech_spans: spans.map(([a, b]) => [r3(a), r3(b)]), median_start_shift_ms: changes.length ? [...changes].map((c) => Math.abs(c.start_ms)).sort((a, b) => a - b)[Math.floor(changes.length / 2)] : 0 };
  if (args.out && args.out !== true) fs.writeFileSync(path.resolve(String(args.out)), JSON.stringify(res.words, null, 2) + "\n");
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- verify --mix
function verifyMix() {
  track("Listening to each line in the final mix", "Final mix checked");
  const mix = String(args.mix);
  if (!fs.existsSync(mix)) die("--mix file not found");
  if (!args.script || args.script === true || !fs.existsSync(String(args.script))) die("--script <lines.json|lines.txt> is required (and must exist)");
  const lines = readScript(String(args.script));
  let windows = null;
  if (args.windows && args.windows !== true) windows = JSON.parse(fs.readFileSync(String(args.windows), "utf8")).map((w) => (Array.isArray(w) ? { start: w[0], end: w[1] } : w));
  else if (args.meta && args.scenes && args.meta !== true && args.scenes !== true) {
    const S = JSON.parse(fs.readFileSync(String(args.scenes), "utf8")), M = JSON.parse(fs.readFileSync(String(args.meta), "utf8"));
    let t = 0;
    const starts = Object.fromEntries((S.scenes || []).map((s, i) => { const st = s.start_s != null ? Number(s.start_s) : t; t = st + (Number(s.duration ?? s.duration_s) || 0); return [s.n ?? i + 1, st]; }));
    windows = (M.voices || []).map((v) => { const ws = wordList({ words: v.words || [] }), st = starts[Number(v.frame)]; return ws.length && st != null ? { start: st + ws[0].start, end: st + Math.max(...ws.map((w) => w.end)) } : null; });
  }
  if (!windows) die("--windows <json> or --meta <audio_meta.json> with --scenes <scenes.json> is required: the window of each line in the film");
  const L = needListener("per-line check of the final mix");
  const maxWer = Number(args["max-wer"] || 0.2), findings = [], rows = [];
  lines.forEach((text, i) => {
    const w = windows[i];
    if (!w || !Number.isFinite(w.start) || !Number.isFinite(w.end)) { rows.push({ n: i + 1, text, skipped: "no window for this line" }); return; }
    const a = Math.max(0, w.start - 0.25), d = w.end - w.start + 0.5;
    let heard;
    try { heard = listen(mix, { ...L, start: a, dur: d }); } catch (e) { rows.push({ n: i + 1, text, skipped: String(e.message).split("\n").pop() }); return; }
    const A = align([text], heard.words), p = A.per[0], wer = p.N ? p.err / p.N : 0;
    rows.push({ n: i + 1, text, window: [Math.round(w.start * 100) / 100, Math.round(w.end * 100) / 100], heard: p.heard.join(" "), wer: r2(wer), padded: heard.padded });
    if (wer > maxWer) findings.push({ severity: "warning", check: "mix-line-wer", line: i + 1, message: `line ${i + 1} "${text.slice(0, 70)}" in the final mix: word error rate ${r2(wer)} (over ${maxWer}); heard "${p.heard.join(" ")}"`, fix: "the music, a duck that is too shallow or an SFX is covering the line: lower the bed under it, move the SFX off it, or check it against the VO stem (verify --audio)" });
  });
  console.log(JSON.stringify({ ok: true, verdict: findings.length ? "clean, warnings" : "clean", mix, model: L.model && path.basename(L.model), lines: rows, findings }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- speak
const KOKORO_DIR = () => [process.env.RASANAI_KOKORO_DIR, process.cwd()].filter(Boolean).find((d) => fs.existsSync(path.join(d, "kokoro-v1.0.onnx")) && fs.existsSync(path.join(d, "voices-v1.0.bin"))) || null;
const have = (bin) => sh("which", [bin]).status === 0;
function engineList() {
  const mu = findSkill("media-use"), tts = mu && path.join(mu, "audio", "scripts", "heygen-tts.mjs");
  return [
    { id: "heygen", ok: !!(tts && fs.existsSync(tts) && have("heygen")), why: "needs media-use and the heygen CLI signed in", tts },
    { id: "kokoro", ok: have("kokoro-tts") && !!KOKORO_DIR(), why: have("kokoro-tts") ? "the kokoro-tts CLI is installed but kokoro-v1.0.onnx and voices-v1.0.bin are not on disk (RASANAI_KOKORO_DIR or the cwd); they are not downloaded here (Apache-2.0 weights, ~330 MB: ask first)" : "the kokoro-tts CLI is not installed" },
    { id: "edge", ok: have("edge-tts"), why: "the edge-tts CLI is not installed (it also needs the network: Microsoft's online voices, no key)" },
  ];
}
function synth(eng, text, out, { voice, lang, speed }) {
  const t = tmpDir(), raw = path.join(t, "raw.wav");
  try {
    if (eng.id === "heygen") execFileSync("node", [eng.tts, text, "-o", raw, ...(voice ? ["--voice", voice] : []), "--lang", lang], { stdio: ["ignore", "pipe", "pipe"], timeout: 180000 });
    else if (eng.id === "kokoro") {
      const inp = path.join(t, "in.txt"); fs.writeFileSync(inp, text);
      execFileSync("kokoro-tts", [inp, raw, "--voice", voice || "af_sarah", "--speed", String(speed), "--lang", lang === "en" ? "en-us" : lang], { cwd: KOKORO_DIR(), stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });
    } else {
      const mp3 = path.join(t, "raw.mp3"), pct = Math.round((speed - 1) * 100);
      execFileSync("edge-tts", ["--text", text, "--voice", voice || ({ en: "en-US-AriaNeural", fr: "fr-FR-DeniseNeural", de: "de-DE-KatjaNeural", es: "es-ES-ElviraNeural", hi: "hi-IN-SwaraNeural", ta: "ta-IN-PallaviNeural", ja: "ja-JP-NanamiNeural" }[lang] || "en-US-AriaNeural"), `--rate=${pct >= 0 ? "+" : ""}${pct}%`, "--write-media", mp3], { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-ar", "24000", "-ac", "1", raw]);
    }
    // trim the silence at both ends (keeps 40 ms before and 80 ms after the speech)
    const r = sh("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse", "-ar", "24000", "-ac", "1", out]);
    if (r.status !== 0) throw new Error("ffmpeg could not trim the take");
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
}
function speak() {
  track("Speaking each line and listening back", "Narration recorded");
  if (!args.script || args.script === true || !fs.existsSync(String(args.script))) die("--script <lines.json|lines.txt> is required (and must exist)");
  const raw = fs.readFileSync(String(args.script), "utf8");
  let rates = [];
  try { const j = JSON.parse(raw); const a = Array.isArray(j) ? j : j.lines || j.script || []; rates = a.map((x) => (x && typeof x === "object" && x.rate ? Number(x.rate) : null)); } catch {}
  const lines = readScript(String(args.script));
  if (!lines.length) die("the script has no lines");
  const lang = String(args.lang || "en").toLowerCase(), retakes = Math.max(0, Math.min(3, args.retakes != null ? Number(args.retakes) : 3)), match = Number(args.match || 0.92);
  const respell = args.respell && args.respell !== true ? JSON.parse(String(args.respell)) : {};
  const names = String(args.names && args.names !== true ? args.names : "").split(",").map((x) => x.trim()).filter(Boolean);
  const engines = engineList(), want = String(args.engine || "auto");
  const pool = engines.filter((e) => e.ok && (want === "auto" || e.id === want));
  const cannot = (why) => { noteDowngrade({ run: runOf(), what: "narration by take, transcribe, retake", instead: "no narration was recorded", why: String(why).slice(0, 220) }); process.stderr.write(`rasanai: could not run: ${why}\n`); process.exit(1); };
  if (!pool.length) cannot(`no speech engine (${engines.filter((e) => want === "auto" || e.id === want).map((e) => `${e.id}: ${e.why}`).join("; ")})`);
  const L = needListener("narration retake loop");
  const dir = path.resolve(args.out && args.out !== true ? String(args.out) : path.join(String(args.run || "."), "voice", "narration"));
  fs.mkdirSync(dir, { recursive: true });
  const nn = (i) => String(i + 1).padStart(2, "0");
  const apply = (text, k) => (k < 2 ? text : Object.entries(respell).reduce((t, [a, b]) => t.split(a).join(b), text));
  let eng = pool[0];
  const rows = [], findings = [];
  lines.forEach((text, i) => {
    const takes = [];
    for (let k = 1; k <= 1 + retakes; k++) {
      const f = path.join(dir, `line-${nn(i)}-take${k}.wav`);
      const speed = (rates[i] || Number(args.speed) || 1) * (k > 1 && eng.id !== "heygen" ? 1 + (k % 2 ? -0.03 : 0.03) : 1);
      let spoke = false;
      for (const e of [eng, ...pool.filter((p) => p !== eng)]) { try { synth(e, apply(text, k), f, { voice: args.voice && args.voice !== true ? String(args.voice) : undefined, lang, speed }); eng = e; spoke = true; break; } catch (err) { takes.push({ take: k, engine: e.id, error: String(err.stderr || err.message).split("\n").filter(Boolean).pop().slice(0, 140) }); } }
      if (!spoke) continue;
      const h = listen(f, L), A = align([text], h.words), p = A.per[0], wer = p.N ? p.err / p.N : 0;
      const bad = h.tags.length > 0 || A.maxDrop >= 3 || A.maxAdd >= 3;
      const row = { take: k, engine: eng.id, file: f, wer: r2(wer), heard: p.heard.join(" "), tags: h.tags, dropped_run: A.maxDrop, added_run: A.maxAdd, score: wer + (bad ? 1 : 0), word: h.words.length ? { start: h.words[0].start, end: h.words[h.words.length - 1].end } : null, ok: 1 - wer >= match && !bad };
      takes.push(row);
      if (row.ok) break;
    }
    const good = takes.filter((t) => t.file);
    if (!good.length) { rows.push({ n: i + 1, text, takes, ok: false, error: "no engine could speak this line" }); findings.push({ severity: "error", check: "line-not-spoken", line: i + 1, message: `line ${i + 1} could not be spoken: ${takes.map((t) => t.error).filter(Boolean).join("; ")}` }); return; }
    const best = good.reduce((b, t) => (t.score < b.score ? t : b), good[0]);
    const final = path.join(dir, `line-${nn(i)}.wav`);
    // a lone word gets a vowel tail from most voices ("uh"): cut the clip 120 ms after the heard word ends
    if (norm(text).length === 1 && best.word && Number.isFinite(best.word.end) && probeDur(best.file) - best.word.end > 0.18) {
      sh("ffmpeg", ["-v", "error", "-y", "-i", best.file, "-t", String(Math.max(0.2, best.word.end + 0.12)), "-af", "afade=t=out:st=" + Math.max(0, best.word.end + 0.12 - 0.05).toFixed(3) + ":d=0.05", final]);
      best.tail_trimmed = true;
    } else fs.copyFileSync(best.file, final);
    if (!best.ok) findings.push({ severity: "warning", check: "line-match", line: i + 1, message: `line ${i + 1} "${text.slice(0, 60)}": the best of ${good.length} take(s) matches ${Math.round((1 - best.wer) * 100)}% (needs ${Math.round(match * 100)}%)${best.tags.length ? `, heard a non-speech tag ${best.tags.join(" ")}` : ""}${best.dropped_run >= 3 || best.added_run >= 3 ? `, a run of ${Math.max(best.dropped_run, best.added_run)} words dropped or added` : ""}; heard "${best.heard}"`, fix: "respell the hard words (--respell), another voice, or rewrite the line" });
    for (const nm of names) if (norm(text).join(" ").includes(norm(nm).join(" ")) && !norm(best.heard).join(" ").includes(norm(nm).join(" "))) findings.push({ severity: "warning", check: "name-misheard", line: i + 1, message: `"${nm}" in line ${i + 1} was heard as "${best.heard}"`, fix: "respell it phonetically for the retake (--respell)" });
    rows.push({ n: i + 1, text, file: final, kept_take: best.take, ok: best.ok, wer: best.wer, takes: takes.map(({ word, ...t }) => t) });
  });
  const res = { ok: true, engine: eng.id, model: path.basename(L.model), dir, match, lines: rows, findings };
  fs.writeFileSync(path.join(dir, "speak.json"), JSON.stringify(res, null, 2) + "\n");
  if (eng.id !== "heygen") noteDowngrade({ run: runOf(), what: "the planned narration voice", instead: `${eng.id} (${eng.id === "kokoro" ? "offline, Apache-2.0 weights" : "Microsoft online voices, no key"})`, why: "the HeyGen voice was not available", impact: "the voice differs from the one the options offered" });
  console.log(JSON.stringify(res, null, 2));
  process.exit(findings.some((f) => f.severity === "error" || f.severity === "warning") ? 2 : 0);
}

if (args._[0] === "verify") await verify();
else if (args._[0] === "refine") refine();
else if (args._[0] === "speak") speak();
else main();
