#!/usr/bin/env node
// Element index (Motion Studio contract C): which authored elements exist, when they are on screen and where.
// Scenes annotate elements with data-el="scene-2.hero-title" (+ data-el-label, data-el-editable, data-el-kind).
// Bounds come from a headless Chrome pass (lib/cdp.mjs) that seeks the paused GSAP timelines
// (window.__timelines[*].seek) and reads getBoundingClientRect; with no browser it falls back to a static parse
// (bounds_samples empty, noted in build.notes). Only reads inside the project; scenes loading remote code are not run.
//
//   node element-index.mjs build  --project <dir> [--samples 5] [--static]
//        -> writes <dir>/motion/element-index.json, prints a summary
//   node element-index.mjs check  --project <dir>
//        -> schema + stale detection (build_digest vs current scene sources); exit 1 when invalid or stale
//   node element-index.mjs lookup --project <dir> --time <s> --x <0..1> --y <0..1> [--view-w W --view-h H]
//        -> every element under the point at that time, topmost first (for the chooser). x,y are frame-normalised;
//           with --view-w/--view-h they are normalised to a letterboxed view and mapped to the frame first.
// Exit: 0 ok, 1 failed check, 2 usage error.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/common.mjs";
import { projectRoot, buildDigest, validateIndex, lookup, letterboxToFrameNorm } from "./lib/element-index/core.mjs";
import { buildIndex, indexPath } from "./lib/element-index/build.mjs";

export { letterboxToFrameNorm, lookup, validateIndex } from "./lib/element-index/core.mjs";
export { buildIndex } from "./lib/element-index/build.mjs";

const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const usage = (m) => { process.stderr.write(`element-index: ${m}\n`); process.exit(2); };

async function main() {
  const args = parseArgs();
  const cmd = args._[0];
  if (!["build", "check", "lookup"].includes(cmd)) usage("usage: build|check|lookup --project <dir> (see header)");
  let root;
  try { root = projectRoot(args.project); } catch (e) { usage(e.message); }
  if (cmd === "build") {
    try {
      const { index, path: p } = await buildIndex(root, { samples: args.samples, forceStatic: !!args.static });
      out({ ok: true, path: p, method: index.build.method, items: index.items.length, ids: index.items.map((i) => i.element_id), notes: index.build.notes });
    } catch (e) { out({ ok: false, error: e.message }, 1); }
  }
  const file = indexPath(root);
  if (!fs.existsSync(file)) {
    if (cmd === "check") out({ ok: false, status: "missing", reason: "no motion/element-index.json; run build" }, 1);
    out({ ok: false, error: "no motion/element-index.json; run build" }, 1);
  }
  let ix;
  try { ix = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { out({ ok: false, status: "invalid", errors: [`unreadable JSON: ${e.message}`] }, 1); }
  if (cmd === "check") {
    const errors = validateIndex(ix);
    if (errors.length) out({ ok: false, status: "invalid", errors }, 1);
    const now = buildDigest(root);
    if (now !== ix.build_digest) out({ ok: false, status: "stale", reason: "scene sources changed since the index was built", index_digest: ix.build_digest, current_digest: now }, 1);
    out({ ok: true, status: "fresh", items: ix.items.length, method: ix.build?.method ?? null });
  }
  // lookup
  const t = Number(args.time), x = Number(args.x), y = Number(args.y);
  if (![t, x, y].every(Number.isFinite)) usage("lookup needs --time <s> --x <0..1> --y <0..1>");
  let nx = x, ny = y, mapped = null;
  if (args["view-w"] && args["view-h"]) {
    const v = { w: Number(args["view-w"]), h: Number(args["view-h"]) };
    mapped = letterboxToFrameNorm(x * v.w, y * v.h, v, ix.frame_size);
    nx = mapped.x; ny = mapped.y;
    if (!mapped.inside) out({ ok: true, time_s: t, point: { x: nx, y: ny }, letterbox: "bar", candidates: [] });
  }
  const stale = buildDigest(root) !== ix.build_digest;
  const cands = lookup(ix, t, nx, ny).map((c) => ({ element_id: c.element_id, scene_id: c.scene_id, kind: c.kind, label: c.label, z: c.z, capability: c.capability, editable: c.editable, active_s: c.active_s, bounds_norm: c.bounds_norm, source_file: c.source_file }));
  out({ ok: true, time_s: t, point: { x: nx, y: ny }, stale, candidates: cands });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main();
