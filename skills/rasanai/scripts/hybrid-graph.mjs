#!/usr/bin/env node
// hybrid-graph.mjs: the derived edit graph of a hybrid film (contract C2) and its content-addressed cache (C3). Offline, zero dependencies.
//
//   node hybrid-graph.mjs compile  --run <run> [--film <film>] [--out <file>] [--no-events] [--dry-run]
//        reads motion/score.json (the authored truth), cut decisions, hybrid/sources.json, tracks, effects, events and applied edits, re-checks
//        motion/events.json (lib/timing.mjs eventsFresh; re-derives it with writeEvents when stale; never rewrites the score) and writes <film>/hybrid/edit-graph.json
//        (default film = run): nodes with content keys, dependencies and a status taken from the cache (ready|stale|rendering|failed).
//        A hand edit of the graph is detected by recompute and overwritten with a warning.
//   node hybrid-graph.mjs check    --run <run> [--film <film>]
//        the graph file is valid (acyclic, ids unique, deps exist), equals a fresh derivation, and its keys are the C3 key inputs.
//   node hybrid-graph.mjs diff     --a <graph.json|run> --b <graph.json|run>      nodes added, removed, changed; `cause` = the real edits
//   node hybrid-graph.mjs explain  --run <run> --node <id> [--film <film>]         the key inputs, dependency chain and cache state of one node
//   node hybrid-graph.mjs affected --run <run> [--film <film>] [--against <graph.json>]
//        which scenes need re-rendering: nodes whose key changed since the previous graph (default: the one on disk) plus everything downstream,
//        plus nodes with no valid cache entry. `scenes_to_render` is the answer; `nodes_reused` are cache hits.
//   node hybrid-graph.mjs cache stats|verify|purge|pin|unpin --film <film> [--max-mb <n>] [--all] [--dry-run] [--key <k>]
//        the cache (<film>/hybrid/cache): checksum/frame verification, LRU purge under a cap (pinned and in-use keys stay), pins.
//   node hybrid-graph.mjs help
//
// JSON on stdout, problems and warnings on stderr. Exit 0 ok (diff: identical), 1 unable (file missing, bad score, bad arguments),
// 2 failed check / invalid / stale (diff: they differ). Contracts: docs/plans/hybrid-film-contracts.md.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/common.mjs";
import { readInputs, compile, serialize, validate, withStatus, diff, affected, explain, graphPath, cacheDir } from "./lib/hybrid-graph/index.mjs";
import { openCache } from "./lib/render-cache/index.mjs";
import { eventsFresh, writeEvents } from "./lib/timing.mjs";

const args = parseArgs();
const cmd = args._[0] || "help";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HELP = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.replace(/^\/\/ ?/, "")).join("\n");
const str = (v) => (v && v !== true ? String(v) : null);
const done = (obj, code) => { console.log(JSON.stringify(obj, null, 2)); process.exit(code); };
const unable = (msg) => { console.error(`unable: ${msg}`); done({ ok: false, unable: msg }, 1); };
const problems = (list, extra = {}) => { for (const p of list) console.error(`problem: ${p}`); done({ ok: false, problems: list, ...extra }, 2); };
const warn = (m) => console.error(`warning: ${m}`);
if (cmd === "help" || args.help) { console.log(HELP); process.exit(0); }

const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
function dirs() {
  const run = str(args.run) ? path.resolve(str(args.run)) : null;
  const film = str(args.film) ? path.resolve(str(args.film)) : run;
  if (!film) unable("--run <run folder> (and optionally --film <film folder>) is required");
  if (run && !fs.existsSync(run)) unable(`run folder not found: ${run}`);
  if (!fs.existsSync(film)) unable(`film folder not found: ${film}`);
  return { run: run || film, film };
}
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmp, text); fs.renameSync(tmp, file);
}
// events.json freshness: motion/events.json is DERIVED from the score by lib/timing.mjs (eventsFresh / writeEvents; there is no separate events.mjs in this tree).
// Check it, and re-derive when stale (writes only motion/events.json, never the score).
function freshEvents(run) {
  if (args["no-events"] || !fs.existsSync(path.join(run, "motion", "score.json"))) return;
  const f = eventsFresh(run);
  if (f.fresh) return;
  const w = writeEvents(run);
  if (w.ok) warn(`motion/events.json was stale or missing (${f.reason}) and has been re-derived from the score`);
  else warn(`motion/events.json is stale and could not be re-derived (${w.error}); graph records its current bytes`);
}
function build(run, film) {
  const { graph, problems: P } = compile(readInputs(run, film, { project: str(args.project) }));
  if (!graph) unable(`cannot compile: ${P.join("; ")}`);
  return withStatus(graph, openCache(cacheDir(film)));
}
const loadGraph = (v, label) => {
  const p = path.resolve(String(v));
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? (fs.existsSync(graphPath(p)) ? graphPath(p) : null) : p;
  const g = f ? readJ(f) : null;
  if (!g) unable(`${label}: no graph at ${p}`);
  const P = validate(g);
  if (P.length) problems(P.map((x) => `${label}: ${x}`));
  return g;
};
// status is cache state, not an input: compare graphs without it
const bare = (g) => JSON.stringify({ ...g, nodes: g.nodes.map(({ status, ...n }) => n) });

if (cmd === "compile") {
  const { run, film } = dirs();
  freshEvents(run);
  const g = build(run, film), out = str(args.out) ? path.resolve(str(args.out)) : graphPath(film);
  const P = validate(g);
  if (P.length) problems(P);
  const prev = readJ(out);
  if (prev && validate(prev).length === 0 && bare(prev) !== bare(g)) {
    const d = diff(prev, g);
    if (d.cause.length === 0 && !d.added.length && !d.removed.length) warn(`${path.relative(film, out)} did not match a fresh derivation (hand edit?): overwritten`);
  } else if (prev && validate(prev).length) warn(`${path.relative(film, out)} was not a valid graph (hand edit?): overwritten`);
  if (!args["dry-run"]) writeAtomic(out, serialize(g));
  const count = (s) => g.nodes.filter((n) => n.status === s).length;
  done({ ok: true, wrote: args["dry-run"] ? null : out, source_digest: g.source_digest, nodes: g.nodes.length, ready: count("ready"), stale: count("stale"), rendering: count("rendering"), failed: count("failed") }, 0);
}

if (cmd === "check") {
  const { run, film } = dirs();
  const f = graphPath(film), disk = readJ(f);
  if (!disk) unable(`no graph at ${f}: run compile first`);
  const P = validate(disk);
  const g = build(run, film);
  if (!P.length && bare(disk) !== bare(g)) {
    const d = diff(disk, g);
    P.push(`graph is stale or hand-edited: ${d.cause.length ? `changed at ${d.cause.join(", ")}` : "differs from a fresh derivation"} (run compile)`);
  }
  if (P.length) problems(P);
  done({ ok: true, nodes: disk.nodes.length, source_digest: disk.source_digest }, 0);
}

if (cmd === "diff") {
  if (!str(args.a) || !str(args.b)) unable("--a and --b (graph files or run/film folders) are required");
  const d = diff(loadGraph(args.a, "a"), loadGraph(args.b, "b"));
  done({ ok: true, ...d }, d.identical ? 0 : 2);
}

if (cmd === "explain") {
  const { run, film } = dirs();
  if (!str(args.node)) unable("--node <node id> is required");
  const g = build(run, film), e = explain(g, str(args.node), openCache(cacheDir(film)));
  if (!e) unable(`no node "${args.node}" (ids: ${g.nodes.map((n) => n.id).join(", ")})`);
  done({ ok: true, ...e }, 0);
}

if (cmd === "affected") {
  const { run, film } = dirs();
  const g = build(run, film);
  const prev = str(args.against) ? loadGraph(args.against, "against") : readJ(graphPath(film));
  if (prev && validate(prev).length) warn("the graph on disk is invalid: treating every node as new");
  done({ ok: true, against: prev ? prev.source_digest : null, ...affected(g, prev && validate(prev).length === 0 ? prev : null, openCache(cacheDir(film))) }, 0);
}

if (cmd === "cache") {
  const sub = args._[1] || "stats";
  const { film } = dirs();
  const cache = openCache(cacheDir(film));
  if (sub === "stats") done({ ok: true, ...cache.stats() }, 0);
  if (sub === "verify") { const r = cache.verify(); const bad = r.filter((x) => !x.ok); if (bad.length) problems(bad.map((b) => `${b.key}: ${b.reason}`), { entries: r.length }); done({ ok: true, entries: r.length }, 0); }
  if (sub === "purge") {
    const mb = args["max-mb"] != null ? Number(args["max-mb"]) : null;
    if (mb !== null && !(mb >= 0)) unable("--max-mb must be a number");
    done({ ok: true, ...cache.purge({ maxBytes: mb === null ? undefined : mb * 1048576, all: !!args.all, dryRun: !!args["dry-run"] }) }, 0);
  }
  if (sub === "pin" || sub === "unpin") { if (!str(args.key)) unable("--key <cache key> is required"); cache[sub](str(args.key)); done({ ok: true, [sub]: str(args.key) }, 0); }
  unable(`unknown cache command "${sub}" (stats|verify|purge|pin|unpin)`);
}

console.error(`unknown command "${cmd}"`);
console.error(HELP);
process.exit(2);
