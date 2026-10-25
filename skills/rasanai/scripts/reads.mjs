#!/usr/bin/env node
// reads.mjs: the timed "reads" of a scene (references/reads.md): check the score's reads[] and make the review sheets.
//
//   node reads.mjs check --run <RUN> [--score <score.json>] [--json]
//        -> validates the optional per-scene reads[] in motion/score.json (kinds, scene-local bounds, order, overlaps, text holds, payoff hold).
//           Exit 0 pass (warnings are printed, never failures), 2 invalid reads[], 1 could not run (no score, not JSON).
//           A machine check of STRUCTURE and measured text time: it never claims a viewer understood the shot.
//   node reads.mjs sheet --run <RUN> --scene <id|n> (--file <scene.html | draft.mp4> | --project <dir>) [--offset s] [--out <png>]
//        -> RUN/review/reads/<scene>-sheet.png (entry, action, reaction, hold: four labelled positions) and
//           <scene>-strip.png (a short strip around the key transition), through crew.mjs strip and frames-lib's labelled grid.
//           --file with a composition: times are scene-local; with a video or --project: scene start (or --offset) is added.
//           Exit 1 when the frames cannot be rendered (never a pass).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, chromeScreenshot } from "./lib/common.mjs";
import { readsChecks, readPositions, keyTransition, durationOf } from "./lib/reads.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const cmd = args._[0] || "help";
const HELP = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.replace(/^\/\/ ?/, "")).join("\n");
if (cmd === "help" || args.help) { console.log(HELP); process.exit(0); }
const fail = (m, code = 1) => { console.error(`reads: ${m}`); process.exit(code); };
if (cmd !== "check" && cmd !== "sheet") fail(`unknown command "${cmd}"\n${HELP}`);
if (!args.run || args.run === true) fail("--run <RUN> required");
const run = path.resolve(String(args.run));
if (!fs.existsSync(run)) fail(`run folder not found: ${run}`);
const scorePath = args.score && args.score !== true ? path.resolve(String(args.score)) : path.join(run, "motion", "score.json");
if (!fs.existsSync(scorePath)) fail(`score not found: ${scorePath}`);
let score;
try { score = JSON.parse(fs.readFileSync(scorePath, "utf8")); } catch (e) { fail(`score is not valid JSON: ${e.message}`); }
const rel = (p) => path.relative(process.cwd(), p) || ".";

if (cmd === "check") {
  const r = readsChecks(score, { run });
  const code = r.P.length ? 2 : 0;
  if (args.json) {
    console.log(JSON.stringify({ ok: !r.P.length, status: r.P.length ? "invalid" : r.W.length ? "warnings" : "pass", enabled: r.enabled, reads_required: r.required, scenes: r.scenes, problems: r.P, warnings: r.W, findings: r.findings, note: "structure and measured text time only; whether a viewer understands the shot is a subjective review of the renders (agents/critic.md, agents/frame-juror.md)" }, null, 2));
  } else {
    if (!r.enabled) console.log("reads: no scene writes reads[] (legacy score): nothing to check");
    else console.log(`reads: ${r.scenes.filter((s) => s.reads).length} of ${r.scenes.length} scenes write reads[]${r.required ? " (required for this film)" : ""}`);
    for (const p of r.P) console.log(`INVALID  ${p}`);
    for (const w of r.W) console.log(`warning  ${w}`);
    console.log(r.P.length ? "reads: invalid" : r.W.length ? `reads: pass with ${r.W.length} warning(s) (uncalibrated, not blocking)` : "reads: pass");
  }
  process.exit(code);
}

// ---- sheet
if (!args.scene || args.scene === true) fail("--scene <id|n> required");
const S = Array.isArray(score.scenes) ? score.scenes : [];
const scene = S.find((s) => s && (String(s.id) === String(args.scene) || String(s.n) === String(args.scene)));
if (!scene) fail(`scene "${args.scene}" not in the score (${S.map((s) => s.id ?? s.n).join(", ")})`);
if (!Array.isArray(scene.reads) || !scene.reads.length) fail(`scene ${args.scene} has no reads[] to sheet`);
const chk = readsChecks({ ...score, scenes: [scene] }, { run });
if (chk.P.length) fail(`reads[] of scene ${args.scene} is invalid (run reads.mjs check): ${chk.P[0]}`, 2);
const src = args.file && args.file !== true ? path.resolve(String(args.file)) : args.project && args.project !== true ? path.resolve(String(args.project)) : fail("--file <scene composition | video> or --project <dir> required");
if (!fs.existsSync(src)) fail(`not found: ${src}`);
const isVideo = /\.(mp4|mov|webm|m4v|mkv)$/i.test(src);
const offset = args.offset !== undefined && args.offset !== true ? Number(args.offset) : isVideo || args.project ? Number(scene.start) || 0 : 0;
const outDir = path.join(run, "review", "reads");
fs.mkdirSync(outDir, { recursive: true });
const tag = String(scene.id ?? scene.n).replace(/[^\w.-]+/g, "_");
const sheetPng = args.out && args.out !== true ? path.resolve(String(args.out)) : path.join(outDir, `${tag}-sheet.png`);
const stripPng = path.join(path.dirname(sheetPng), `${tag}-strip.png`);
const dur = durationOf(scene) ?? 0;
const pos = readPositions(scene);
const key = keyTransition(scene);
const source = args.project && args.project !== true ? ["--project", src] : ["--file", src];
const strip = (extra, out) => spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), "strip", ...source, ...extra, "--out", out], { encoding: "utf8", timeout: 600000, env: { ...process.env, RASANAI_QUIET: "1" } });
const lastLine = (r) => String(r.stderr || r.stdout || "").trim().split("\n").pop();

const r1 = strip(["--at", pos.map((p) => Math.round((p.t + offset) * 1000) / 1000).join(","), "--cols", "4"], sheetPng);
if (r1.status !== 0 || !fs.existsSync(sheetPng)) fail(`could not render the four positions: ${lastLine(r1)}`);
// a labelled version (position, read kind, scene-local time, visual cue) over the same frames
let labelled = false;
try {
  const { gridSheet } = await import("./lib/frames-lib.mjs");
  const dir = sheetPng.replace(/\.png$/i, "");
  const cells = pos.map((p) => {
    const f = path.join(dir, `t${(Math.round((p.t + offset) * 1000) / 1000).toFixed(3)}.png`);
    return { image: f, label: `${p.position} ${p.t.toFixed(2)} s | ${p.kind}: ${String(p.cue || "").slice(0, 70)}`, ours: false };
  }).filter((c) => fs.existsSync(c.image));
  if (cells.length === pos.length) {
    gridSheet([cells], sheetPng, { cellW: 480, title: `scene ${scene.id ?? scene.n}: reads (entry, action, reaction, hold), ${dur.toFixed(1)} s`, screenshot: (u, o, w, h, b) => chromeScreenshot(u, o, w, h, b) });
    labelled = true;
  }
} catch { /* the crew strip sheet stands: times only */ }
let stripOk = false;
if (key !== null) {
  const a = Math.max(0, key - 0.5), b = Math.min(Math.max(0.1, dur - 0.04), key + 0.7);
  const r2s = strip(["--from", String(Math.round((a + offset) * 1000) / 1000), "--to", String(Math.round((b + offset) * 1000) / 1000), "--fps", "6", "--cols", "6"], stripPng);
  stripOk = r2s.status === 0 && fs.existsSync(stripPng);
}
const sidecar = { scene: scene.id ?? scene.n, source: rel(src), offset_s: offset, positions: pos, key_transition_s: key, sheet: rel(sheetPng), strip: stripOk ? rel(stripPng) : null, labelled, note: "contact sheets for a human or critic to read; the check never claims they prove comprehension" };
fs.writeFileSync(sheetPng.replace(/\.png$/i, ".json"), JSON.stringify(sidecar, null, 2));
console.log(JSON.stringify({ ok: true, ...sidecar }, null, 2));
