#!/usr/bin/env node
// Two separate stores (see SKILL.md "Memory"; location: $RASANAI_HOME or ~/.rasanai):
//   history.jsonl  every pick, auto or confirmed. Used ONLY for rotation.
//   confirmed picks are history rows with mode:"confirmed". They only pre-select
//   the recommended option when the user is actively choosing.
//
// usage:
//   node memory.mjs record --step motion --value editorial-mask --mode confirmed|auto [--project x]
//   node memory.mjs recent --step motion [--n 3]          -> last n values (any mode)
//   node memory.mjs recommend --step motion              -> most-confirmed value in the last 10 confirmed picks, with receipt
//   node memory.mjs record-film --run <run>              -> on delivery: store the film's shape (motion/score.json) + title + date (step "film")
//   node memory.mjs recent-films [--n 3]                 -> [{title, date, shape}], newest last: the next film must differ in 4 of 6 aspects
//   node memory.mjs dump
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, die, STATE_DIR } from "./lib/common.mjs";
import { shapeProblems } from "./lib/film-shape.mjs";

const STEPS = ["route", "concept", "look", "motion", "transitions", "voice", "keyframes", "aspect", "music"];
const HISTORY = path.join(STATE_DIR, "history.jsonl");

export function readHistory() {
  if (!fs.existsSync(HISTORY)) return [];
  return fs
    .readFileSync(HISTORY, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function recent(step, n = 3) {
  return readHistory()
    .filter((r) => r.step === step)
    .slice(-n)
    .map((r) => r.value);
}

export function recommend(step) {
  const confirmed = readHistory().filter((r) => r.step === step && r.mode === "confirmed").slice(-10);
  if (!confirmed.length) return null;
  const counts = {};
  confirmed.forEach((r) => (counts[r.value] = (counts[r.value] || 0) + 1));
  const [value, count] = Object.entries(counts).sort((a, b) => b[1] - a[1] || 0)[0];
  return { value, count, of: confirmed.length, receipt: `you picked ${value} in ${count} of your last ${confirmed.length} confirmed ${step} choices` };
}

// the films delivered so far: history rows of step "film" -> [{title, date, shape, project}]
export function recentFilms(n = 3) {
  return readHistory().filter((r) => r.step === "film" && r.shape).slice(-n).map((r) => ({ title: r.title || r.value, date: r.date || r.ts, shape: r.shape, project: r.project || null }));
}

function main() {
  const args = parseArgs();
  const cmd = args._[0];
  if (cmd === "record") {
    if (!STEPS.includes(args.step)) die(`--step must be one of ${STEPS.join(", ")}`);
    if (!args.value) die("--value required");
    if (!["confirmed", "auto"].includes(args.mode)) die("--mode must be confirmed or auto");
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const row = { ts: new Date().toISOString(), step: args.step, value: String(args.value), mode: args.mode, project: args.project || null };
    fs.appendFileSync(HISTORY, JSON.stringify(row) + "\n");
    console.log(JSON.stringify(row));
  } else if (cmd === "record-film") {
    if (!args.run || args.run === true) die("--run <run dir> required");
    const run = path.resolve(String(args.run));
    let score = null, brief = null;
    try { score = JSON.parse(fs.readFileSync(path.join(run, "motion", "score.json"), "utf8")); } catch {}
    try { brief = JSON.parse(fs.readFileSync(path.join(run, "brief.json"), "utf8")); } catch {}
    if (!score) die(`${run}/motion/score.json is missing or not JSON`);
    const bad = shapeProblems(score.shape);
    if (bad.length) die(`the score has no valid shape, so the film can't be recorded: ${bad.join("; ")}`);
    const f = (brief && (brief.fields || brief)) || {};
    const title = String(args.title && args.title !== true ? args.title : score.title || score.brand || f.title || f.subject || path.basename(run));
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const row = { ts: new Date().toISOString(), step: "film", value: title, mode: "auto", project: args.project || null, title, date: new Date().toISOString().slice(0, 10), shape: score.shape };
    fs.appendFileSync(HISTORY, JSON.stringify(row) + "\n");
    console.log(JSON.stringify(row));
  } else if (cmd === "recent-films") {
    console.log(JSON.stringify(recentFilms(Number(args.n || 3))));
  } else if (cmd === "recent") {
    console.log(JSON.stringify(recent(args.step, Number(args.n || 3))));
  } else if (cmd === "recommend") {
    console.log(JSON.stringify(recommend(args.step)));
  } else if (cmd === "dump") {
    console.log(JSON.stringify(readHistory(), null, 2));
  } else {
    die("usage: memory.mjs record|record-film|recent|recent-films|recommend|dump ...");
  }
}

// run as a CLI only when executed directly (realpath: the skill is usually installed via symlink)
const isMain = (() => {
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isMain) main();
