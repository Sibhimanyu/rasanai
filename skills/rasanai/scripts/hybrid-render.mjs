#!/usr/bin/env node
// hybrid-render.mjs: incremental, scene-fragment rendering of a film (plan section 5). Offline, zero dependencies, HyperFrames stays the renderer.
//
//   node hybrid-render.mjs preview  --run <run> [--film <film>] [--project <hyperframes dir>] [--scene <id>] [--audio <file>] [--out <mp4>] [--dry-run]
//        draft-quality: compiles the edit graph (hybrid-graph.mjs, W1), renders ONLY the scene-render nodes whose cache entry is missing (the
//        selected --scene first), reuses cached scene clips (lib/render-cache, W1), concatenates the clips frame-exactly with ffmpeg (video
//        stream copy, no re-encode) and muxes the film's audio. Output default: <film>/hybrid/renders/preview.mp4
//   node hybrid-render.mjs delivery --run <run> ...      same at delivery quality; the delivered clips are pinned in the cache
//   node hybrid-render.mjs status   --run <run> ...      per scene and mode: ready | stale | rendering | failed, cache size
//   node hybrid-render.mjs purge    --run <run> (--all | --max-mb <n>) [--dry-run]    LRU purge (pinned = delivered and in-use clips stay)
//   node hybrid-render.mjs bench    --run <run> [--mode preview|delivery] [--scene <id>] [--keep]
//        cold vs warm vs one-scene-change wall times on a throw-away cache and a shadow copy of the film (the film itself is not edited)
//
// HyperFrames cannot render a time range, so one scene is rendered as a standalone scene host (lib/hybrid-render/PROBE.md); a scene is a
// sub-composition (data-composition-src) of the project's index.html. Heavy work runs inside the render slot (lib/slot.mjs).
// Any --cache-dir <dir> moves the cache. JSON on stdout, progress on stderr. Exit 0 ok, 1 failed or unable, 2 usage error.
import { parseArgs } from "./lib/common.mjs";
import * as R from "./lib/hybrid-render/index.mjs";

const args = parseArgs();
const cmd = args._[0];
const CMDS = { preview: () => R.renderFilm({ args, mode: "preview" }), delivery: () => R.renderFilm({ args, mode: "delivery" }), status: () => R.status(args), purge: () => R.purge(args), bench: () => R.bench(args) };
if (!CMDS[cmd]) { process.stderr.write("usage: hybrid-render.mjs preview|delivery|status|purge|bench --run <run> [--film <film>] (see the header of this file)\n"); process.exit(2); }
try {
  const out = await CMDS[cmd]();
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok === false ? 1 : 0);
} catch (e) {
  console.error(`${e.unable ? "unable" : "failed"}: ${e.message}`);
  console.log(JSON.stringify({ ok: false, [e.unable ? "unable" : "error"]: e.message }, null, 2));
  process.exit(e.message.startsWith("--") ? 2 : 1);
}
