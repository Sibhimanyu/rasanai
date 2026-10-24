#!/usr/bin/env node
// Edit transactions for the Motion Studio: <run>/motion/edits.jsonl (append-only; latest line per id wins). Never calls a model.
//
//   node editor-patch.mjs record      --run <dir> --json '<edit>' | --file <edit.json>   append a requested line (idempotent on id)
//   node editor-patch.mjs propose     --run <dir> --id <id>      compact packet for an authorised agent -> <run>/motion/packets/<id>.md
//   node editor-patch.mjs checkpoint  --run <dir> --id <id> [--file <project-relative>]...   copy authored files + sha256 manifest
//   node editor-patch.mjs apply-simple --run <dir> --id <id>     deterministic text/color/position/scale/retime patch (no model)
//   node editor-patch.mjs mark        --run <dir> --id <id> --status accepted|applied|rendered|failed|reverted [--note ..] [--preview <file>]
//   node editor-patch.mjs undo        --run <dir> --id <id>      restore from the checkpoint, status reverted
//   node editor-patch.mjs check       --run <dir> --id <id>      is the edit's recorded state true on disk?
//   node editor-patch.mjs status      --run <dir> [--id <id>]    latest line per id
//   (all take [--project <dir>]; default: console.json root, else the dir above .rasanai/, else cwd)
// JSON to stdout. Exit 0 ok · 1 failed check/refused · 2 usage error.
import fs from "node:fs";
import * as ep from "./lib/editor-patch/index.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const args = { _: [], file: [] };
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) { args._.push(a); continue; }
  const k = a.slice(2);
  const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  if (k === "file") args.file.push(v); else args[k] = v;
}
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const usage = (m) => { console.error(`editor-patch: ${m}\n(see the header of editor-patch.mjs)`); process.exit(2); };
if (!cmd || cmd === "--help") usage("command required");
if (!args.run || args.run === true) usage("--run <run dir> is required");
const need = (k) => (typeof args[k] === "string" && args[k] ? args[k] : usage(`--${k} is required`));
const opts = { project: typeof args.project === "string" ? args.project : undefined };

try {
  const run = need("run");
  const R = (await import("node:path")).resolve(run);
  switch (cmd) {
    case "record": {
      let edit;
      try { edit = args.json ? JSON.parse(need("json")) : JSON.parse(fs.readFileSync(args.file[0], "utf8")); } catch (e) { usage(`edit JSON unreadable: ${e.message}`); }
      out(ep.record(R, edit, opts));
      break;
    }
    case "propose": { const r = ep.propose(R, need("id"), opts); out({ ...r, markdown: undefined }); break; }
    case "checkpoint": out(ep.checkpoint(R, need("id"), { ...opts, extra: args.file.filter((x) => typeof x === "string") })); break;
    case "apply-simple": { const r = ep.applySimple(R, need("id"), opts); out(r, r.ok ? 0 : 1); break; }
    case "mark": out(ep.mark(R, need("id"), need("status"), { ...opts, note: args.note, preview: args.preview })); break;
    case "undo": out(ep.undo(R, need("id"), opts)); break;
    case "check": { const r = ep.check(R, need("id"), opts); out(r, r.ok ? 0 : 1); break; }
    case "status": out(ep.status(R, typeof args.id === "string" ? args.id : null)); break;
    default: usage(`unknown command ${cmd}`);
  }
} catch (e) {
  out({ ok: false, error: e.message }, 1);
}
