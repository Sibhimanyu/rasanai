#!/usr/bin/env node
// "What are you making?": the brief's format picker (library/formats.json, the single source of truth for the console,
// RasanAI Studio and the Director). It asks WHAT the user is making, never how: the pick sets the route, the inputs to
// ask for, the source mode and case, the research, the story pass and the allowed story shapes.
//   node formats.mjs list [--full]                                   -> JSON for UIs: tiles, their options, status, input slot
//   node formats.mjs match --request "<the user's words>" [--paths "<p1>,<p2>"]
//        -> {tile, option, why, confidence, status, say?, alternatives}: the pre-selected chip (names and sizes only, never content)
//   node formats.mjs resolve --id <option> [--scope universal|category|single-task]
//        -> route, source mode and case, inputs (with their prompts), research, story pass, story_shapes (ranked; Sure, Bold,
//           Wild take the first three), forbidden_shapes, scope, length, aspect; a soon option says so (soon, nearest, say)
//   node formats.mjs check                                           -> schema; every ready or partial option maps to a real route
// Exit 0 ok, 2 check failed or no such option, 1 bad input.
import { parseArgs, die } from "./lib/common.mjs";
import { listFormats, matchFormat, resolveFormat, checkFormats } from "./lib/formats.mjs";

const args = parseArgs();
const cmd = args._[0];
const out = (o) => console.log(JSON.stringify(o, null, 2));
const list = (v) => (v && v !== true ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);

if (cmd === "list") out(listFormats({ full: !!args.full }));
else if (cmd === "match") {
  const request = args.request && args.request !== true ? String(args.request) : "";
  const paths = [...list(args.paths), ...args._.slice(1)];
  if (!request && !paths.length) die("match needs --request \"<the user's words>\" and/or --paths <files or folders>");
  out({ ok: true, ...matchFormat(request, paths) });
} else if (cmd === "resolve") {
  if (!args.id || args.id === true) die("resolve needs --id <option id> (formats.mjs list shows them)");
  const r = resolveFormat(String(args.id), { scope: args.scope && args.scope !== true ? String(args.scope) : null });
  if (!r) { out({ ok: false, error: `no option "${args.id}"` }); process.exit(2); }
  out({ ok: true, ...r });
} else if (cmd === "check") {
  const r = checkFormats();
  out(r);
  process.exit(r.ok ? 0 : 2);
} else die("usage: formats.mjs list [--full] | match --request \"...\" [--paths a,b] | resolve --id <option> [--scope s] | check");
