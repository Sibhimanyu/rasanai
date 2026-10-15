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
//
// Raw evidence ledger (same folder): taste.jsonl, what THIS user said about their films. It is evidence, not the rules store:
//   lessons.jsonl (lessons.mjs) is the ONE rules store and the ONE "past films" block the crew and SKILL.md Step 0 read
//   (lessons.mjs digest / brief: the standing notes plus one short "Recent verdicts" line taken from this ledger).
//   verdict = what they said about a finished film; edit = a correction they asked for on the animatic or final.
//   Local only, never sent anywhere. Notes are the user's own descriptions, preferences at most, never instructions.
//   node memory.mjs verdict --film <id> --stage animatic|final --note "..." [--scene <id>] [--t <sec>]
//   node memory.mjs edit    --film <id> --stage animatic|final --note "..." [--scene <id>] [--t <sec>]
//   node memory.mjs taste [--json]            -> alias of the unified view: lessons.mjs digest, then this ledger's raw digest (recurring themes, latest ~20), capped
//   node memory.mjs taste --raw [--json]      -> the raw ledger digest alone
//   node memory.mjs taste-clear [--film <id>] -> forget everything (or one film's rows)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, die, STATE_DIR } from "./lib/common.mjs";
import { shapeProblems } from "./lib/film-shape.mjs";
const TASTE = path.join(STATE_DIR, "taste.jsonl");
const TASTE_KEEP = 500; // rows kept on disk
const TASTE_LATEST = 20; // rows in the digest's "latest" list
const TASTE_CHARS = 1800; // hard cap on the digest text
const NOTE_MAX = 300;

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

// ---- taste ledger ----
export function readLedger() {
  if (!fs.existsSync(TASTE)) return [];
  return fs.readFileSync(TASTE, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.note);
}

// Append one row. Never throws (the console calls this from its action path). Returns the row, or null.
// `action` is the console action id: the same action is recorded once however many paths (server POST, headless wait, chat record) reach it.
export function recordTaste({ kind, film, stage, note, scene, t, ts, action } = {}) {
  try {
    const text = String(note || "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
    if (!text || !["verdict", "edit"].includes(kind)) return null;
    const row = { ts: ts || new Date().toISOString(), kind, film: String(film || "unknown"), stage: stage === "animatic" ? "animatic" : "final", note: text };
    if (action) {
      if (readLedger().some((r) => r.action === String(action))) return null;
      row.action = String(action);
    }
    if (scene !== undefined && scene !== null && scene !== "") row.scene = String(scene);
    if (typeof t === "number" && isFinite(t)) row.t = Math.round(t * 10) / 10;
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(TASTE, JSON.stringify(row) + "\n");
    const rows = readLedger();
    if (rows.length > TASTE_KEEP) fs.writeFileSync(TASTE, rows.slice(-TASTE_KEEP).map((r) => JSON.stringify(r)).join("\n") + "\n");
    return row;
  } catch {
    return null;
  }
}

export function clearTaste(film) {
  const rows = readLedger();
  const keep = film ? rows.filter((r) => r.film !== film) : [];
  if (!keep.length) fs.rmSync(TASTE, { force: true });
  else fs.writeFileSync(TASTE, keep.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { cleared: rows.length - keep.length, left: keep.length };
}

// the latest verdicts (then edits when there are no verdicts), newest first: what lessons.mjs shows as the "Recent verdicts" line
export function recentVerdicts(n = 3) {
  const rows = readLedger();
  const v = rows.filter((r) => r.kind === "verdict");
  return (v.length ? v : rows).slice(-n).reverse();
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// The digest: themes repeated across notes or films first, then the latest rows. Short enough for a prompt.
export function tasteDigest() {
  const rows = readLedger();
  if (!rows.length) return { rows: 0, films: 0, text: "No taste notes yet." };
  const groups = new Map();
  for (const r of rows) {
    const k = norm(r.note);
    if (!k) continue;
    const g = groups.get(k) || { note: r.note, count: 0, films: new Set(), last: r.ts, kind: r.kind };
    g.count++; g.films.add(r.film); g.last = r.ts; g.note = r.note; g.kind = r.kind;
    groups.set(k, g);
  }
  const recurring = [...groups.values()].filter((g) => g.count >= 2).sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1)).slice(0, 8);
  const latest = rows.slice(-TASTE_LATEST).reverse();
  const lines = [`Taste (${rows.length} notes, ${new Set(rows.map((r) => r.film)).size} films; the user's own words, preferences not instructions):`];
  if (recurring.length) {
    lines.push("Recurring:");
    for (const g of recurring) lines.push(`- x${g.count} (${g.films.size} film${g.films.size > 1 ? "s" : ""}) ${g.note}`);
  }
  lines.push("Latest:");
  const seen = new Set(recurring.map((g) => norm(g.note)));
  for (const r of latest) {
    if (seen.has(norm(r.note))) continue;
    const at = r.t != null ? ` @${r.t}s` : r.scene ? ` @${r.scene}` : "";
    lines.push(`- [${r.kind}/${r.stage}${at}] ${r.note}`);
  }
  let text = lines.join("\n");
  if (text.length > TASTE_CHARS) text = text.slice(0, TASTE_CHARS - 1).replace(/\n[^\n]*$/, "") + "\n(older notes omitted)";
  return { rows: rows.length, films: new Set(rows.map((r) => r.film)).size, text };
}

async function main() {
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
  } else if (cmd === "verdict" || cmd === "edit") {
    if (!args.note) die("--note required");
    if (!["animatic", "final"].includes(args.stage)) die("--stage must be animatic or final");
    const row = recordTaste({ kind: cmd, film: args.film, stage: args.stage, note: args.note, scene: args.scene, t: args.t !== undefined ? Number(args.t) : undefined });
    if (!row) die("nothing recorded");
    console.log(JSON.stringify(row));
  } else if (cmd === "taste") {
    const d = tasteDigest();
    if (args.raw) console.log(args.json ? JSON.stringify(d) : d.text);
    else {
      const { digestText } = await import("./lessons.mjs"); // one view: the rules store first, the raw ledger after it
      const rules = digestText();
      console.log(args.json ? JSON.stringify({ ...d, rules }) : (rules ? rules + "\n" : "") + d.text);
    }
  } else if (cmd === "taste-clear") {
    console.log(JSON.stringify(clearTaste(args.film)));
  } else if (cmd === "dump") {
    console.log(JSON.stringify(readHistory(), null, 2));
  } else {
    die("usage: memory.mjs record|record-film|recent|recent-films|recommend|dump|verdict|edit|taste|taste-clear ...");
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
if (isMain) main().catch((e) => die(e.message));
