#!/usr/bin/env node
// Lessons the user taught, carried to every next film (see SKILL.md "Memory"; location: $RASANAI_HOME or ~/.rasanai):
//   lessons.jsonl  one row per general rule distilled from a user's note ("the type is always too small",
//                  "stop ending on a logo fade"). history.jsonl (memory.mjs) is picks for rotation; this is rules.
//
// usage:
//   node lessons.mjs add --rule "<one line, imperative, general>" --quote "<the note, verbatim>" --kind error|taste
//        --area story|look|type|motion|pace|sound|brand [--run <run>] [--gate <key>=<number>] [--source user|self]
//        (--source self: a note Claude wrote itself after a film (the retrospective role); default user. Self notes are listed apart in `brief`
//         as "Claude's own notes from past films", rank below the user's, never become a --gate check, and are dropped like any other. The same
//         rule from the user later makes the row the user's)
//        (same rule again: bumps seen and last. --gate makes the rule a measured check: the gate's threshold tightens to
//         that number on every next film; keys, ranges and which way each tightens (a floor: larger is stricter; a ceiling: smaller is
//         stricter): lib/gate-lessons.mjs, e.g. --gate text.statement_min_h=0.05, or motion.end_hold_min_s=1.0 for "the ending flashes by")
//   node lessons.mjs list [--json]   (shows the source: user or self)
//   node lessons.mjs drop --id <id>
//   node lessons.mjs brief --role <crew role> [--n 12]   -> the "Standing notes" markdown block for that role (nothing when empty)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs, die, STATE_DIR } from "./lib/common.mjs";
import { parseGate, wayOf } from "./lib/gate-lessons.mjs";

export const KINDS = ["error", "taste"];
export const SOURCES = ["user", "self"];
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

export function addLesson({ rule, quote, kind, area, run, gate, source }) {
  rule = String(rule || "").trim();
  if (!rule) throw new Error("--rule required");
  if (!KINDS.includes(kind)) throw new Error(`--kind must be ${KINDS.join(" or ")}`);
  if (!AREAS.includes(area)) throw new Error(`--area must be one of ${AREAS.join(", ")}`);
  source = source == null || source === true ? "user" : String(source);
  if (!SOURCES.includes(source)) throw new Error(`--source must be ${SOURCES.join(" or ")}`);
  if (source === "self" && gate != null && gate !== false) throw new Error("a self lesson never becomes a gate check: --gate is for the user's notes");
  const g = gate == null || gate === false ? null : parseGate(gate === true ? "" : gate); // throws on a bad key, value or range
  const rows = readLessons();
  const now = new Date().toISOString();
  const hit = rows.find((r) => norm(r.rule) === norm(rule));
  if (hit) {
    if (g) hit.gate = g;
    if (source === "user" && hit.source === "self") { hit.source = "user"; if (quote) hit.quote = String(quote); } // the user says it too: it is theirs now
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
    source,
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

const isSelf = (r) => r.source === "self";

// the markdown block for a crew role ("" when the role has no areas or there are no matching lessons): the user's notes first,
// then, apart and lower, Claude's own notes from past films (advisory: never a finding, never a gate; the lessons.mjs drop line removes one)
export function lessonsBlock(role, n = 12) {
  const areas = ROLE_AREAS[role];
  if (!areas) return "";
  const all = readLessons()
    .filter((r) => areas.includes(r.area))
    .sort((a, b) => (b.seen || 1) - (a.seen || 1) || String(b.last).localeCompare(String(a.last)));
  const cap = Math.max(1, Number(n) || 12);
  const rows = all.filter((r) => !isSelf(r)).slice(0, cap);
  const own = all.filter(isSelf).slice(0, 4);
  let md = "";
  if (rows.length) {
    const lines = rows.map((r) => `- **${r.area}, ${r.kind === "error" ? "a mistake" : "a taste"}${r.seen > 1 ? `, noted ${r.seen} times` : ""}:** ${r.rule}${r.gate ? ` (now measured: ${r.gate.key} = ${r.gate.value}) (${wayOf(r.gate.key)})` : ""}${r.quote ? ` (the user said: "${r.quote}")` : ""}`);
    md += `## Standing notes from the user's past films\n\nThe user taught these on earlier films. They apply to this one: do not make them say it again. A mistake is a rule; a taste is a lean (follow it unless the story needs otherwise, and say so).\n\n${lines.join("\n")}\n`;
  }
  if (own.length) {
    const lines = own.map((r) => `- **${r.area}:** ${r.rule}${r.seen > 1 ? ` (seen again ${r.seen} times)` : ""}`);
    md += `${md ? "\n" : ""}## Claude's own notes from past films\n\nWritten by Claude after earlier films, not by the user: leans, ranked below the user's notes above, never a reason to fail a film. Follow one when it fits this story; drop it when it does not (\`lessons.mjs drop --id <id>\` removes a bad one).\n\n${lines.join("\n")}\n`;
  }
  return md;
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
    else for (const r of rows) console.log(`${r.id}  ${r.source === "self" ? "self" : "user"}  ${r.area}/${r.kind}  x${r.seen}  ${r.rule}${r.gate ? `  [gate ${r.gate.key} = ${r.gate.value}, ${wayOf(r.gate.key)}]` : ""}`);
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
