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
//      Exit 0 = clean (warnings allowed), 2 = findings, 1 = could not run (no whisper-cli / model / audio; logged as a downgrade). Prints JSON.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

async function verify() {
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

  // reference words (with their line) and heard words (with their time), then a Levenshtein alignment
  const ref = [], hyp = [];
  lines.forEach((l, li) => norm(l).forEach((w) => ref.push({ w, li })));
  for (const x of tr.words) for (const w of norm(x.text)) hyp.push({ w, start: x.start, end: x.end });
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

  const errors = findings.filter((f) => f.severity === "error").length;
  const total = lines.reduce((a, _, k) => a + per[k].err, 0);
  console.log(JSON.stringify({ ok: !errors, verdict: errors ? "findings" : findings.length ? "clean, warnings" : "clean", model: tr.model, language: tr.language, wer: r2(total / Math.max(1, n)), words: { script: n, heard: m }, lines: outLines, names: nameRows, captions: cap, findings }, null, 2));
  process.exit(errors ? 2 : 0);
}

if (args._[0] === "verify") await verify();
else main();
