#!/usr/bin/env node
// Lessons the user taught, carried to every next film (see SKILL.md "Memory"; location: $RASANAI_HOME or ~/.rasanai):
//   lessons.jsonl  one row per general rule distilled from a user's note ("the type is always too small",
//                  "stop ending on a logo fade"). history.jsonl (memory.mjs) is picks for rotation; this is rules.
//
// usage:
//   node lessons.mjs add --rule "<one line, imperative, general>" --quote "<the note, verbatim>" --kind error|taste
//        --area story|look|type|motion|pace|sound|brand [--run <run>] [--gate <key>=<number>]
//        (same rule again: bumps seen and last. --gate makes the rule a measured check: the gate's threshold tightens to
//         that number on every next film; keys and ranges: lib/gate-lessons.mjs, e.g. --gate text.statement_min_h=0.05)
//   node lessons.mjs list [--json]
//   node lessons.mjs drop --id <id>
//   node lessons.mjs brief --role <crew role> [--n 12]   -> the "Standing notes" markdown block for that role (nothing when empty)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs, die, STATE_DIR } from "./lib/common.mjs";
import { parseGate } from "./lib/gate-lessons.mjs";

export const KINDS = ["error", "taste"];
export const AREAS = ["story", "look", "type", "motion", "pace", "sound", "brand"];
// the areas each crew role works in; roles not listed get no block
export const ROLE_AREAS = {
  "script-writer": ["story", "pace"],
  "script-editor": ["story", "pace"],
  "treatment-writer": ["story", "pace"],
  "motion-director": ["motion", "pace", "look", "type", "sound"],
  "film-builder": ["motion", "pace", "look", "type", "sound"],
  "scene-animator": ["motion", "pace", "look", "type", "sound"],
  "frame-designer": ["look", "type", "brand"],
  "styleframe-designer": ["look", "type", "brand"],
  "design-system-designer": ["look", "type", "brand"],
  "art-director": ["look", "type", "brand"],
  critic: AREAS,
  "frame-juror": AREAS,
};

const file = () => path.join(process.env.RASANAI_HOME || process.env.RASA_MOTION_HOME || process.env.MOTION_DIRECTOR_HOME || STATE_DIR, "lessons.jsonl");

export function readLessons() {
  const f = file();
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, "utf8")
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

function writeLessons(rows) {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function addLesson({ rule, quote, kind, area, run, gate }) {
  rule = String(rule || "").trim();
  if (!rule) throw new Error("--rule required");
  if (!KINDS.includes(kind)) throw new Error(`--kind must be ${KINDS.join(" or ")}`);
  if (!AREAS.includes(area)) throw new Error(`--area must be one of ${AREAS.join(", ")}`);
  const g = gate == null || gate === false ? null : parseGate(gate === true ? "" : gate); // throws on a bad key, value or range
  const rows = readLessons();
  const now = new Date().toISOString();
  const hit = rows.find((r) => norm(r.rule) === norm(rule));
  if (hit) {
    if (g) hit.gate = g;
    hit.seen = (hit.seen || 1) + 1;
    hit.last = now;
    writeLessons(rows);
    return { ...hit, deduped: true };
  }
  const row = {
    id: crypto.createHash("sha1").update(norm(rule) + now + rows.length).digest("hex").slice(0, 8),
    rule,
    quote: quote ? String(quote) : "",
    kind,
    area,
    run: run && run !== true ? String(run) : null,
    first: now,
    last: now,
    seen: 1,
    ...(g ? { gate: g } : {}),
  };
  rows.push(row);
  writeLessons(rows);
  return row;
}

export function dropLesson(id) {
  const rows = readLessons();
  const left = rows.filter((r) => r.id !== id);
  if (left.length === rows.length) return false;
  writeLessons(left);
  return true;
}

// the markdown block for a crew role ("" when the role has no areas or there are no matching lessons)
export function lessonsBlock(role, n = 12) {
  const areas = ROLE_AREAS[role];
  if (!areas) return "";
  const rows = readLessons()
    .filter((r) => areas.includes(r.area))
    .sort((a, b) => (b.seen || 1) - (a.seen || 1) || String(b.last).localeCompare(String(a.last)))
    .slice(0, Math.max(1, Number(n) || 12));
  if (!rows.length) return "";
  const lines = rows.map((r) => `- **${r.area}, ${r.kind === "error" ? "a mistake" : "a taste"}${r.seen > 1 ? `, noted ${r.seen} times` : ""}:** ${r.rule}${r.gate ? ` (now measured: ${r.gate.key} = ${r.gate.value})` : ""}${r.quote ? ` (the user said: "${r.quote}")` : ""}`);
  return `## Standing notes from the user's past films\n\nThe user taught these on earlier films. They apply to this one: do not make them say it again. A mistake is a rule; a taste is a lean (follow it unless the story needs otherwise, and say so).\n\n${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs();
  const cmd = args._[0];
  if (cmd === "add") {
    try {
      console.log(JSON.stringify(addLesson(args)));
    } catch (e) {
      die(e.message);
    }
  } else if (cmd === "list") {
    const rows = readLessons();
    if (args.json) console.log(JSON.stringify(rows, null, 2));
    else if (!rows.length) console.log("no lessons yet");
    else for (const r of rows) console.log(`${r.id}  ${r.area}/${r.kind}  x${r.seen}  ${r.rule}${r.gate ? `  [gate ${r.gate.key} = ${r.gate.value}]` : ""}`);
  } else if (cmd === "drop") {
    if (!args.id || args.id === true) die("--id required");
    if (!dropLesson(String(args.id))) die(`no lesson ${args.id}`);
    console.log(JSON.stringify({ ok: true, dropped: String(args.id) }));
  } else if (cmd === "brief") {
    if (!args.role || args.role === true) die("--role required");
    const b = lessonsBlock(String(args.role), args.n === undefined ? 12 : Number(args.n));
    if (b) process.stdout.write(b);
  } else {
    die("usage: lessons.mjs add|list|drop|brief ...");
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
