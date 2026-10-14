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
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs, die } from "./lib/common.mjs";
import { findSkill } from "./lib/hyperframes.mjs";
import { track } from "./lib/report.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";

const args = parseArgs();
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
