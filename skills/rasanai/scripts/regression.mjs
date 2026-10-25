#!/usr/bin/env node
// regression.mjs: deterministic render regression for paused-timeline scenes (headless Chrome, no secrets, no network).
//
//   node regression.mjs check    [--manifest <file>] [--scene <id>] [--out <dir>] [--json]
//   node regression.mjs baseline [--manifest <file>] [--scene <id>]     write baseline PNGs; review them before committing
//   node regression.mjs help
//
// Default manifest: tests/fixtures/regression/manifest.json (synthetic shapes and one word, no product claim).
// Each scene is a page whose paused GSAP timelines are in window.__timelines. Per timestamp the report has
// scene, timestamp_s, repeat_identical, metric, threshold, console_errors, actual, baseline, status.
// status: ok | regression | nondeterministic | blank | clipped-text | missing-asset | missing-text | console-error | no-baseline | could-not-run
// Exit 0 pass, 2 a true regression, 1 could not run (a missing baseline or a scene that does not render is never a pass).
// Baselines hold the machine that made them (baselines/meta.json); on another platform the check warns that the metric is bounded, not exact.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/common.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// software GL by default: the same pixels run to run, and closer across machines than a GPU
process.env.RASANAI_GL = process.env.RASANAI_GL || "cpu";
const { checkScene, readManifest, verdict } = await import("./lib/regression.mjs");

const args = parseArgs();
const cmd = args._[0] || "help";
const HELP = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.replace(/^\/\/ ?/, "")).join("\n");
if (cmd === "help" || args.help) { console.log(HELP); process.exit(0); }
if (cmd !== "check" && cmd !== "baseline") { console.error(`unknown command "${cmd}"\n${HELP}`); process.exit(1); }

const manifestFile = path.resolve(args.manifest || path.join(HERE, "tests", "fixtures", "regression", "manifest.json"));
let loaded;
try { loaded = readManifest(manifestFile); } catch (e) { console.error(`cannot read manifest ${manifestFile}: ${e.message}`); process.exit(1); }
if (loaded.problems.length) { console.error(loaded.problems.join("\n")); process.exit(1); }
const { manifest, dir } = loaded;
const scenes = manifest.scenes.filter((s) => !args.scene || s.id === args.scene);
if (!scenes.length) { console.error(`no scene "${args.scene}" in the manifest`); process.exit(1); }
const baselinesDir = path.join(dir, "baselines");
const update = cmd === "baseline";
const metaFile = path.join(baselinesDir, "meta.json");
const here = { platform: `${process.platform}-${process.arch}`, node: process.version };
const warnings = [];
if (!update && fs.existsSync(metaFile)) {
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  if (meta.platform !== here.platform) warnings.push(`baselines were made on ${meta.platform}, this is ${here.platform}: pixels can differ by font and driver, so the check uses the bounded metric (threshold per scene), not byte identity`);
}
const rows = [];
for (const s of scenes) rows.push(...(await checkScene(s, { dir, width: manifest.width || 1280, height: manifest.height || 720, baselinesDir, update, outDir: args.out ? path.resolve(args.out) : null })));
if (update && !rows.some((r) => r.status === "could-not-run")) { fs.mkdirSync(baselinesDir, { recursive: true }); fs.writeFileSync(metaFile, JSON.stringify({ ...here, written: new Date().toISOString().slice(0, 10), manifest: path.basename(manifestFile) }, null, 2) + "\n"); }
const code = update ? (rows.some((r) => r.status !== "baseline-written") ? verdict(rows) || 1 : 0) : verdict(rows);
const report = { manifest: path.basename(manifestFile), platform: here.platform, warnings, exit: code, rows };
if (args.out) { fs.mkdirSync(path.resolve(args.out), { recursive: true }); fs.writeFileSync(path.join(path.resolve(args.out), "regression-report.json"), JSON.stringify(report, null, 2) + "\n"); }
if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  for (const w of warnings) console.error(`warning: ${w}`);
  for (const r of rows) console.log(`${r.status === "ok" || r.status === "baseline-written" ? "ok  " : "FAIL"}  ${r.scene} @ ${r.timestamp_s ?? "-"}s  ${r.status}${r.metric != null ? `  metric ${r.metric.toFixed(4)}/${r.threshold}` : ""}${r.detail ? `  ${r.detail}` : ""}`);
  console.log(code === 0 ? "regression: pass" : code === 2 ? "regression: REGRESSION" : "regression: could not run (not a pass)");
}
process.exit(code);
