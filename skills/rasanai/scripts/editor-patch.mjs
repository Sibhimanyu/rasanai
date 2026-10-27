#!/usr/bin/env node
// Edit transactions for the Motion Studio: <run>/motion/edits.jsonl (append-only; latest line per id wins). Never calls a model.
//
//   node editor-patch.mjs record      --run <dir> --json '<edit>' | --file <edit.json>   append a requested line (idempotent on id)
//   node editor-patch.mjs propose     --run <dir> --id <id>      compact packet for an authorised agent -> <run>/motion/packets/<id>.md
//   node editor-patch.mjs checkpoint  --run <dir> --id <id> [--file <project-relative>]...   copy authored files + sha256 manifest
//   node editor-patch.mjs apply-simple --run <dir> --id <id>     deterministic text/color/position/scale/retime patch (no model)
//   node editor-patch.mjs mark        --run <dir> --id <id> --status accepted|applied|preview_ready|rendered|failed|reverted|stale|conflicted [--note ..] [--receipt <file|revision id>] [--preview <rendered file>]
//        preview_ready / rendered (Plan 10 U8) need a RENDER RECEIPT that names this edit (edit_id, source digest, media settings, sha256 output_checksum) and whose output file hashes to
//        that checksum. Without --receipt the newest crew/revisions.jsonl event for this edit is used. A merely existing, nonempty MP4/PNG is refused.
//   node editor-patch.mjs undo        --run <dir> --id <id> [--as-new-version]   undo safely (Plan 10 U7): inverse semantic patch when the file moved on; whole-file restore only when the file still
//        equals the edit's recorded result; otherwise {"ok":false,"conflict":true,"options":["restore_as_new_version"]}. --as-new-version keeps the current state as a checkpoint first.
//   node editor-patch.mjs restore     --run <dir> --id <id>      restore the state from before <id> as a NEW version (<id>.restoreN); nothing later is lost
//   node editor-patch.mjs check       --run <dir> --id <id>      is the edit's recorded state true on disk?
//   node editor-patch.mjs status      --run <dir> [--id <id>]    latest line per id
//   node editor-patch.mjs describe    --run <dir> --element <id> --scene <id>   current values + element_digest + film_version/build_digest to send back with an edit
//   node editor-patch.mjs typed       --run <dir> --json '<edit>' | --file <edit.json>   record + checkpoint + apply a typed edit (no model)
//        typed ops (C6): operation transform (fields.kind move|resize|rotate) | property (recolor|text|reorder) | trim (nudge);
//        exact "original"/"proposed" values (x,y,scale,rotation,color,text,z,start,duration), optional element_digest/build_digest/film_version.
//        stale/changed element, film_version, build_digest or original -> {"ok":false,"conflict":true,"current":{..}} exit 1, nothing appended.
//   node editor-patch.mjs simple      --run <dir> --text "move headline 10% right" [--id <id>] [--time <s>]   parse a token phrase into a typed edit and apply it
//   node editor-patch.mjs redo        --run <dir> --id <id>      re-apply an undone typed edit as a NEW id (<id>.redoN)
//        undo of a typed edit appends an inverse record <id>.undoN (values, not file restore) and marks <id> reverted.
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
      // typed ops may answer {ok:false, conflict:true}; legacy ops never do

      let edit;
      try { edit = args.json ? JSON.parse(need("json")) : JSON.parse(fs.readFileSync(args.file[0], "utf8")); } catch (e) { usage(`edit JSON unreadable: ${e.message}`); }
      { const r = ep.record(R, edit, opts); out(r, r.ok ? 0 : 1); }
      break;
    }
    case "propose": { const r = ep.propose(R, need("id"), opts); out({ ...r, markdown: undefined }); break; }
    case "checkpoint": out(ep.checkpoint(R, need("id"), { ...opts, extra: args.file.filter((x) => typeof x === "string") })); break;
    case "apply-simple": { const r = ep.applySimple(R, need("id"), opts); out(r, r.ok ? 0 : 1); break; }
    case "describe": { const r = ep.describeElement(R, need("element"), typeof args.scene === "string" ? args.scene : undefined, opts); out(r, r.ok ? 0 : 1); break; }
    case "typed": {
      let edit;
      try { edit = args.json ? JSON.parse(need("json")) : JSON.parse(fs.readFileSync(args.file[0], "utf8")); } catch (e) { usage(`edit JSON unreadable: ${e.message}`); }
      const r = ep.typedEdit(R, edit, opts); out(r, r.ok ? 0 : 1); break;
    }
    case "simple": { const r = ep.simpleToken(R, need("text"), { ...opts, id: typeof args.id === "string" ? args.id : undefined, time_s: args.time }); out(r, r.ok ? 0 : 1); break; }
    case "redo": { const r = ep.redo(R, need("id"), opts); out(r, r.ok ? 0 : 1); break; }
    case "mark": out(ep.mark(R, need("id"), need("status"), { ...opts, note: args.note, preview: typeof args.preview === "string" ? args.preview : undefined, receipt: typeof args.receipt === "string" ? args.receipt : undefined })); break;
    case "undo": { const r = ep.undo(R, need("id"), { ...opts, asNewVersion: !!args["as-new-version"] }); out(r, r.ok ? 0 : 1); break; }
    case "restore": { const r = ep.restoreAsNewVersion(R, need("id"), opts); out(r, r.ok ? 0 : 1); break; }
    case "check": { const r = ep.check(R, need("id"), opts); out(r, r.ok ? 0 : 1); break; }
    case "status": out(ep.status(R, typeof args.id === "string" ? args.id : null)); break;
    default: usage(`unknown command ${cmd}`);
  }
} catch (e) {
  out({ ok: false, error: e.message }, 1);
}
