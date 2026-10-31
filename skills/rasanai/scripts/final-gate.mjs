#!/usr/bin/env node
// final-gate.mjs: the ONE blocking gate on the FINAL composition and the FINAL render. Nothing is handed to the person (console push render/final,
// the delivery folder) unless this passed on exactly that render. It only CALLS the existing gates (their rules are theirs); any error, any
// "could not run" and any skipped step blocks.
//
//   node final-gate.mjs --run <run> --project videos/<name> --video <final.mp4> [--kind launch|brand|explainer] [--end-hold 1.4] [--json]
//   node crew.mjs final-gate ...   (the same)
//
// Steps (all on <project>/index.html and the render, never on capture/ pages or a draft):
//   0 preflight  the planner's files exist (crew/plan.json, policy.json, motion/score.json) and no hand-made plan was logged; the render is not a
//                draft; no fix round is open (every crew member's latest ledger row is accepted; no fix-brief newer than the render)
//   1 frame-gate  2 motion-gate (end-hold, saved to <run>/motion/motion-gate.json)  3 slop (the film's index.html)  4 sound check  5 obey  6 mix-duck (audio/mix.mix.json: duck.measured_db and duck.music_under_vo_lu; no duck is the default and 0 dB passes)
//   7 text-qa (spell-check of the on-screen words in the film's index.html: doubled words, common typos, malformed contractions, number style; errors block)
//   8 music-sync (music-map.mjs check: cuts and big visual hits land within 150 ms of music events; a film with no voice needs 50%)
// Writes <run>/final-gate.json {ok, video, video_sha, steps}; exit 0 pass, 2 blocked. `verifyHandover(run, video)` is what console.mjs push calls.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { textQa } from "./lib/text-qa.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const jr = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const ex = (f) => { try { return fs.existsSync(f); } catch { return false; } };
const SCENE_ROUTES = new Set(["product-launch-video", "faceless-explainer", "pr-to-video", "general-video", "music-to-video", "character-cartoon"]);
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

export const isDraftRender = (file) => { const b = path.basename(String(file || "")); return /draft|rough|preview|animatic/i.test(b) && !/final|delivery|finish/i.test(b); };

// the planner's files, a hand-made plan and an open fix round: pure reads
export function preflight(run, video) {
  const problems = [];
  const plan = jr(path.join(run, "crew", "plan.json"));
  if (ex(path.join(run, "crew", "plan-failed.json"))) problems.push("crew.mjs plan failed (crew/plan-failed.json): the director must stop and report the error, never plan by hand");
  if (!plan) problems.push("crew/plan.json is missing: the planner never ran, so the creative policy never attached (stop and report it; no hand-made plan)");
  else {
    if (!ex(path.join(run, "crew", "policy.json"))) problems.push("crew/policy.json is missing (written by crew.mjs plan)");
    if (SCENE_ROUTES.has(plan.route) && !ex(path.join(run, "motion", "score.json"))) problems.push("motion/score.json is missing: the Motion Director's score never ran (pace fast does not remove it)");
  }
  let rows = [];
  try { rows = fs.readFileSync(path.join(run, "downgrades.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
  for (const r of rows) {
    const w = `${r.what || ""} ${r.instead || ""}`;
    if (/crew\.mjs plan|crew planner/i.test(w) || /by hand/i.test(String(r.instead || ""))) problems.push(`a hand-made plan was logged (downgrades.jsonl: "${String(r.what || "").slice(0, 80)}"): a failed required stage stops the run`);
    else if (/moves pass|motion director|score\.json|a\/b juror|blind a\/b/i.test(String(r.what || "")) && /fast/i.test(String(r.why || ""))) problems.push(`a creative stage was dropped for Fast pace (downgrades.jsonl: "${String(r.what || "").slice(0, 80)}"): Fast only cuts revision rounds`);
  }
  if (video && isDraftRender(video)) problems.push(`${path.basename(video)} is a draft render: only the finished render is handed over`);
  // an open fix round: a crew member whose latest ledger row is not an accepted one, or a fix brief written after the render
  let led = [];
  try { led = fs.readFileSync(path.join(run, "crew", "ledger.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
  const last = new Map();
  for (const r of led) if (r.role && ["brief", "ok", "fail"].includes(r.event)) last.set(`${r.role}|${r.key || ""}`, r);
  const open = [...last.values()].filter((r) => r.event !== "ok").map((r) => `${r.role}${r.key ? ":" + r.key : ""}`);
  if (open.length) problems.push(`a round is still open (briefed or failed, not accepted by crew.mjs check): ${open.slice(0, 6).join(", ")}`);
  const fb = path.join(run, "crew", "fix-brief.md");
  if (video && ex(fb) && ex(video) && fs.statSync(fb).mtimeMs > fs.statSync(video).mtimeMs + 1000) problems.push("crew/fix-brief.md is newer than this render: a fix round was opened after it");
  return problems;
}

// what console.mjs push calls before a film reaches the person: {ok, why[]}
export function verifyHandover(run, video) {
  const why = [...preflight(run, video)];
  const g = jr(path.join(run, "final-gate.json"));
  if (!video || !ex(video)) why.push("no final render to hand over");
  else if (!g) why.push("final-gate.mjs has not run (node crew.mjs final-gate --run <run> --project <dir> --video <render>)");
  else {
    if (g.ok !== true) why.push(`final-gate did not pass: ${(g.blocked || []).slice(0, 4).join("; ")}`);
    if (g.video_sha !== sha(video)) why.push("final-gate passed a different render than this one: run it again on this file");
  }
  return { ok: why.length === 0, why };
}

function run1(name, argv, { json = true } = {}) {
  const r = spawnSync(process.execPath, [path.join(HERE, ...name.split("/")), ...argv], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" }, maxBuffer: 256 * 1024 * 1024 });
  let j = null;
  if (json) { try { j = JSON.parse(r.stdout); } catch { const m = String(r.stdout || "").match(/\{[\s\S]*\}\s*$/); try { j = m ? JSON.parse(m[0]) : null; } catch {} } }
  return { code: r.status ?? 1, json: j, stdout: r.stdout || "", stderr: String(r.stderr || "").slice(-600) };
}

export function main(args) {
  const run = path.resolve(String(args.run || ""));
  if (!args.run || !ex(run)) return { ok: false, blocked: ["--run <run dir> is required"] };
  const project = args.project ? path.resolve(String(args.project)) : null;
  const video = args.video ? path.resolve(String(args.video)) : null;
  const blocked = [], steps = [];
  if (!project || !ex(path.join(project, "index.html"))) blocked.push("--project must be the film's folder with its index.html (the final composition, not capture/)");
  if (project && /[\\/]capture[\\/]/.test(project + path.sep)) blocked.push("--project points into capture/: the gates run on the film's own index.html");
  if (!video || !ex(video)) blocked.push("--video must be the final render");
  for (const p of preflight(run, video)) blocked.push(`preflight: ${p}`);
  steps.push({ step: "preflight", ok: !blocked.length });
  if (project && video && ex(video) && ex(path.join(project, "index.html"))) {
    const plan = jr(path.join(run, "crew", "plan.json")) || {};
    const score = path.join(run, "motion", "score.json"), hasScore = ex(score);
    const briefKind = String((jr(path.join(run, "brief.json")) || {}).kind || "");
    const kind = args.kind || (/promo/i.test(plan.kind || briefKind) ? "promo" : /launch/i.test(plan.kind || briefKind) || plan.route === "product-launch-video" ? "launch" : /brand/i.test(plan.kind || briefKind) ? "brand" : null);
    const rec = (step, r, extra = {}) => {
      const jOk = r.json ? r.json.ok !== false : true;
      const ok = r.code === 0 && jOk;
      steps.push({ step, ok, exit: r.code, ...extra });
      if (!ok) blocked.push(`${step}: ${r.code === 1 ? "could not run (never a pass)" : "failed"} (exit ${r.code})${r.stderr ? " " + r.stderr.replace(/\s+/g, " ").slice(-200) : ""}`);
      return ok;
    };
    rec("frame-gate", run1("frame-gate.mjs", ["--video", video, "--project", project, ...(hasScore ? ["--plan", score] : []), ...(kind ? ["--kind", kind] : []), "--json"]));
    const mg = run1("motion-gate.mjs", ["--video", video, "--project", project, ...(hasScore ? ["--plan", score] : []), "--end-hold", String(args["end-hold"] || 1.4), ...(kind ? ["--kind", kind] : []), "--run", run, "--json"]);
    try { fs.mkdirSync(path.join(run, "motion"), { recursive: true }); fs.writeFileSync(path.join(run, "motion", "motion-gate.json"), mg.json ? JSON.stringify(mg.json, null, 2) : JSON.stringify({ ok: false, exit: mg.code, stdout: mg.stdout.slice(0, 4000) })); } catch {}
    rec("motion-gate", mg, { saved: "motion/motion-gate.json" });
    const runScenes = path.join(run, "scenes.json");
    const sl = run1("slop.mjs", ["--project", project, "--video", video, "--run", run, ...(ex(runScenes) ? ["--scenes", runScenes] : []), ...(hasScore ? ["--score", score] : []), "--json"]);
    if (sl.json && sl.json.scenes === 0 && ex(runScenes)) { steps.push({ step: "slop", ok: false, exit: sl.code }); blocked.push("slop: read 0 scenes (wrong file?): it must run on the film's own index.html"); }
    else rec("slop", sl);
    // the FINAL index.html is what is checked: a clip mounted there that is not in crew/sfx-plan.json is sfx-unplanned (an error)
    rec("sound-check", run1("sound.mjs", ["check", "--video", video, "--sfx", path.join(project, "index.html"), "--run", run, ...(hasScore ? ["--score", score] : []), ...(args["silent-by-choice"] ? ["--silent-by-choice", String(args["silent-by-choice"])] : [])].filter((x) => x !== undefined)));
    rec("obey", run1("obey.mjs", ["--project", project, "--run", run, "--json"]));
    // the stem mix's receipt (sound.mjs mix --out <run>/audio/mix.wav writes mix.mix.json): the music must really sit under the voice (references/sound.md: no duck by default; a duck, when one is used for VO intelligibility, is 0 to 9 dB measured)
    for (const mf of [path.join(run, "audio", "mix.mix.json"), path.join(run, "audio", "final-mix.mix.json")]) {
      const mj = jr(mf);
      if (!mj || !mj.duck) continue;
      const md = mj.duck.measured_db, lu = mj.duck.music_under_vo_lu, bad = [];
      // no duck is the default (the favourites keep the bed constant): 0 dB passes; only a duck deeper than 9 dB blocks
      if (typeof md === "number" && (md < 0 || md > 9)) bad.push(`the music ducks ${md} dB under the voice (0 to 9 dB; none is the default)`);
      if (Number(mj.duck.depth_set_db) > 0 && typeof lu === "number" && (lu < 9 || lu > 15)) bad.push(`the music sits ${lu} LU under the voice (9 to 15 LU)`);
      steps.push({ step: "mix-duck", ok: !bad.length, file: path.relative(run, mf), measured_db: md ?? null, music_under_vo_lu: lu ?? null });
      if (bad.length) blocked.push(`mix-duck: ${bad.join("; ")} (${path.relative(run, mf)}): re-mix with sound.mjs mix`);
    }
  }
  // 7 text-qa: the words on screen, from the FINAL index.html (a typo on screen is a defect the person sees on every play)
  if (project && ex(path.join(project, "index.html"))) {
    try {
      const html = fs.readFileSync(path.join(project, "index.html"), "utf8");
      const brand = String((jr(path.join(run, "brief.json")) || {}).name || (jr(path.join(run, "brief.json")) || {}).product || "");
      const q = textQa(html, { allow: brand.split(/\W+/).filter(Boolean) });
      steps.push({ step: "text-qa", ok: q.ok, words: q.words, errors: q.errors.length, warnings: q.warnings.length });
      if (!q.ok) blocked.push(`text-qa: ${q.errors.slice(0, 6).map((e) => `${e.kind} "${e.word}" (${e.context})`).join("; ")}: fix the words in index.html`);
    } catch (e) { steps.push({ step: "text-qa", ok: false }); blocked.push(`text-qa: could not run (${String(e.message).slice(0, 120)})`); }
  }
  // 8 music-sync: cuts land on music events within 150 ms, measured on the final render
  if (video && ex(video) && !blocked.some((b) => /^(preflight|--video)/.test(b))) {
    const ms = run1("music-map.mjs", ["check", "--video", video, "--run", run]);
    steps.push({ step: "music-sync", ok: ms.code === 0, ...(ms.json ? { measured: ms.json.measured, warnings: ms.json.warnings } : {}) });
    if (ms.code !== 0) blocked.push(`music-sync: ${ms.json && ms.json.errors && ms.json.errors.length ? ms.json.errors.join("; ") : `could not run (exit ${ms.code}) ${ms.stderr.replace(/\s+/g, " ").slice(-160)}`}`);
  }
  const res = { ok: blocked.length === 0, t: new Date().toISOString(), video: video || null, video_sha: video && ex(video) ? sha(video) : null, project, steps, blocked };
  try { fs.writeFileSync(path.join(run, "final-gate.json"), JSON.stringify(res, null, 2)); } catch {}
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { parseArgs } = await import("./lib/common.mjs");
  const res = main(parseArgs());
  process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  process.exit(res.ok ? 0 : 2);
}
