#!/usr/bin/env node
// events.mjs: the derived film-event timeline (picture hits, seams, foley, music cues, spoken words) in film seconds. Offline: no network, no API.
//
//   node events.mjs export --run <run> [--score <file>] [--out <file>] [--fps <n>] [--audio-meta <file>] [--sfx <sfx-plan.json>]
//        reads motion/score.json (the authored truth), the run's audio_meta.json word times and sfx-plan.json when they exist
//        (motion/, run root or audio/; a missing one is recorded as missing, never invented) and writes <run>/motion/events.json:
//        stable ids, sorted by time, kind precedence, id; scene-local times converted to film time once; frame = round(at_s * fps).
//        A hand edit of events.json is overwritten (a warning says so): edit the score and export again.
//   node events.mjs check --run <run> [--events <file>]
//        the manifest is valid, its sources (sha256) are unchanged, it equals a fresh derivation; picture/foley/word sync diagnostics.
//   node events.mjs diff --a <file> --b <file>      events added, removed and moved between two manifests
//   node events.mjs help
//
// JSON on stdout, problems and warnings on stderr. Exit 0 pass (diff: identical), 2 invalid / stale / hand-edited (diff: they differ),
// 1 unable (a file missing, bad arguments). Method and consumers: references/film-events.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/common.mjs";
import { exportRun, readSources, derive, serialize, validate, freshness, diff, eventsPath, isManifest } from "./lib/film-events.mjs";

const args = parseArgs();
const cmd = args._[0] || "help";
const HELP = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.replace(/^\/\/ ?/, "")).join("\n");
const str = (v) => (v && v !== true ? String(v) : null);
const done = (obj, code) => { console.log(JSON.stringify(obj, null, 2)); process.exit(code); };
const unable = (msg) => { console.error(`unable: ${msg}`); done({ ok: false, unable: msg }, 1); };
const problems = (list, extra = {}) => { for (const p of list) console.error(`problem: ${p}`); done({ ok: false, problems: list, ...extra }, 2); };
const warn = (list) => { for (const w of list) console.error(`warning: ${w}`); };

if (cmd === "help" || args.help) { console.log(HELP); process.exit(0); }
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return { __err: e.code === "ENOENT" ? "not found" : "not valid JSON" }; } };
const opts = () => ({ score: str(args.score), audioMeta: str(args["audio-meta"]), sfx: str(args.sfx), fps: args.fps != null ? str(args.fps) : undefined });

function runOf() {
  if (!str(args.run)) unable("--run <run folder> is required");
  const run = path.resolve(String(args.run));
  if (!fs.existsSync(run)) unable(`run folder not found: ${run}`);
  return run;
}
// a failed read becomes exit 1 (unable) or 2 (a file that is there but not valid)
function guard(fn) { try { return fn(); } catch (e) { if (e.unable) unable(e.message); if (e.invalid) problems([e.message]); throw e; } }

if (cmd === "export") {
  const run = runOf();
  const out = path.resolve(str(args.out) || eventsPath(run));
  const r = guard(() => exportRun(run, opts()));
  if (!r.manifest) problems(r.problems, { warnings: r.warnings });
  const warnings = [...r.warnings];
  if (fs.existsSync(out)) {
    const had = fs.readFileSync(out, "utf8");
    if (had !== r.text) {
      let prev = null; try { prev = JSON.parse(had); } catch {}
      const edited = !prev || !isManifest(prev) || validate(prev).length > 0 || freshness(run, prev).state !== "stale"; // same sources, different bytes = edited
      if (edited) warnings.push(`${path.relative(run, out) || out} did not match the derivation of its sources (a hand edit, or a damaged file): it was overwritten. events.json is derived; edit motion/score.json and run events.mjs export`);
    }
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.text);
  warn(warnings);
  done({ ok: true, out: path.relative(run, out).startsWith("..") ? path.basename(out) : path.relative(run, out), events: r.manifest.events.length, duration_s: r.manifest.duration_s, fps: r.manifest.fps, source: r.manifest.source, sync: r.manifest.sync, warnings }, 0);
}

if (cmd === "check") {
  const run = runOf();
  const file = path.resolve(str(args.events) || eventsPath(run));
  if (!fs.existsSync(file)) unable(`no manifest at ${file}: run events.mjs export --run <run>`);
  const m = readJ(file);
  if (m.__err) problems([`${file}: ${m.__err}`]);
  const bad = validate(m);
  if (bad.length) problems(bad);
  const fr = freshness(run, m);
  if (fr.state === "stale") problems(fr.reasons.map((x) => `stale: ${x}; run events.mjs export --run <run> (outdated timing is refused)`), { freshness: "stale" });
  const warnings = [];
  if (fr.state === "unverified") warnings.push("unverified: the sources recorded in the manifest could not be found to compare their sha256");
  const fresh = guard(() => derive({ ...readSources(run, { score: str(args.score) }), fps: m.fps }));
  if (!fresh.manifest) problems(fresh.problems.map((p) => `score: ${p}`));
  if (serialize(fresh.manifest) !== fs.readFileSync(file, "utf8")) problems([`${path.basename(file)} differs from a fresh derivation of its (unchanged) sources: it was edited by hand. Edit motion/score.json and run events.mjs export to overwrite it`], { freshness: "fresh" });
  warnings.push(...fresh.warnings);
  warn(warnings);
  done({ ok: true, events: m.events.length, freshness: fr.state, source: m.source, sync: m.sync, warnings }, 0);
}

if (cmd === "diff") {
  if (!str(args.a) || !str(args.b)) unable("--a <file> and --b <file> are required");
  const a = readJ(path.resolve(String(args.a))), b = readJ(path.resolve(String(args.b)));
  for (const [n, x] of [["a", a], ["b", b]]) if (x.__err) unable(`--${n}: ${x.__err}`);
  for (const [n, x] of [["a", a], ["b", b]]) { const bad = validate(x); if (bad.length) problems(bad.map((p) => `--${n}: ${p}`)); }
  const d = diff(a, b);
  if (!d.identical) console.error(`problem: the manifests differ: ${d.added.length} added, ${d.removed.length} removed, ${d.moved.length} moved, ${d.changed.length} changed${d.meta.length ? ", " + d.meta.map((m) => m.field).join("/") + " differ" : ""}`);
  done({ ok: d.identical, ...d }, d.identical ? 0 : 2);
}

console.error(`unknown command "${cmd}"\n${HELP}`);
process.exit(1);
