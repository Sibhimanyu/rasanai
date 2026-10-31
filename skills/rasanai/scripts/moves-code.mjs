#!/usr/bin/env node
// Writes `code: {fn, example}` into every library/moves/<id>.json and into its entry in library/moves/index.json, from the
// registry in runtime/rasan-moves.js (RasanMoves.examples()). Run it after adding or changing a move there.
//   node scripts/moves-code.mjs          write
//   node scripts/moves-code.mjs --check  exit 2 when any json is missing its code block or has a different one
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SKILL_DIR } from "./lib/common.mjs";

const require = createRequire(import.meta.url);
globalThis.self = globalThis;
const M = require(path.join(SKILL_DIR, "runtime", "rasan-moves.js"));
const ex = M.examples(), dir = path.join(SKILL_DIR, "library", "moves");
const idxFile = path.join(dir, "index.json"), idx = JSON.parse(fs.readFileSync(idxFile, "utf8"));
const check = process.argv.includes("--check");
let bad = 0;
for (const m of idx.moves) {
  const e = ex[m.id];
  if (!e) { console.error("no RasanMoves function for " + m.id); bad++; continue; }
  const code = { runtime: "runtime/rasan-moves.js", fn: e.fn, example: e.example, params: Object.keys(e.params || {}) };
  const f = path.join(dir, m.file), j = JSON.parse(fs.readFileSync(f, "utf8"));
  if (JSON.stringify(j.code) !== JSON.stringify(code) || JSON.stringify(m.code) !== JSON.stringify({ fn: e.fn, example: e.example })) bad++;
  if (check) continue;
  j.code = code; fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  m.code = { fn: e.fn, example: e.example };
}
if (check) { console.log(bad ? `${bad} moves out of date` : "ok"); process.exit(bad ? 2 : 0); }
idx.note = idx.note.replace(/ Every move also has code:.*$/, "") + " Every move also has code: {fn, example} (runtime/rasan-moves.js); a builder calls RasanMoves.<fn> and adapts the params.";
fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2) + "\n");
console.log(`wrote code for ${idx.moves.length} moves`);
