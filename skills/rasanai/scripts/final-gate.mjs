#!/usr/bin/env node
// final-gate.mjs: the ONE blocking gate on the FINAL composition and the FINAL render. Nothing is handed to the person (console push render/final,
// the delivery folder) unless this passed on exactly that render. It only CALLS the existing gates (their rules are theirs); any error, any
// "could not run" and any skipped step blocks.
//
//   node final-gate.mjs --run <run> --project videos/<name> --video <final.mp4> [--kind launch|brand|explainer] [--end-hold 1.4 (4 on a launch film)] [--json]
//   node crew.mjs final-gate ...   (the same)
//
// Steps (all on <project>/index.html and the render, never on capture/ pages or a draft):
//   0 preflight  the planner's files exist (crew/plan.json, policy.json, motion/score.json) and no hand-made plan was logged; the render is not a
//                draft; no fix round is open (every crew member's latest ledger row is accepted; no fix-brief newer than the render)
//   1 frame-gate  2 motion-gate (end-hold, saved to <run>/motion/motion-gate.json)  3 slop (the film's index.html)  4 sound check  5 obey  6 mix-duck (audio/mix.mix.json: duck.measured_db and duck.music_under_vo_lu; no duck is the default and 0 dB passes)
//   2b launch-gates (launch/promo films: lib/launch-gates.mjs on the render at 4 fps: foreground coverage and display-scale type, ground variety and brand colour, meaningful stillness, hook length; waivable by rule name)
//   7 text-qa (spell-check of the on-screen words in the film's index.html and its sub-compositions (data-composition-src): doubled words, common typos, malformed contractions, number style; errors block)
//   8 music-sync (music-map.mjs check: cuts and big visual hits land within 150 ms of music events; a film with no voice needs 50%)
//   (all gates judge the film by its chosen style world: the atlas world's gate_profile (dimensional | flat | pixel | stepped | photographic | hand-made, lib/gate-profile.mjs) goes to frame-gate, motion-gate and slop as --gate-profile; the concept's grammar_waivers [{rule, why}] go down as --waive and turn the launch grammar's defaults into notes)
//  10 vo-scratch (WARNING + needs_you, never silent: the voice is the macOS `say` scratch track from vo.mjs)
//   9 earshot-tech (OPTIONAL, only when earshot is installed, see lib/earshot.mjs): critique's technical findings as WARNINGS only (true peak over -1 dBTP, dead air at the end, silent cuts, cuts missing accents); its verdict and score are never read; never blocks; a failure to run is a note
// Writes <run>/final-gate.json {ok, video, video_sha, steps}; exit 0 pass, 2 blocked. `verifyHandover(run, video)` is what console.mjs push calls.
import { openCraftNotes } from "./lib/answers.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { textQa } from "./lib/text-qa.mjs";
import * as earshot from "./lib/earshot.mjs";
import { runGateProfile, runWaivers, waiversArg } from "./lib/gate-profile.mjs";

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

// The failing findings as the Final shows them: {id, step, name, reason, waivable}. Derived from `blocked` (one string per finding: "<step>: <why>" or "<step> (<check>): <why>").
// NEVER waivable, whoever asks (references/workflows/final-and-delivery.md): the run's own structure (preflight, a missing/draft render, a different render than the one gated),
// the words on screen (text-qa: a typo or a false claim ships on every play) and anything about photosensitivity (flashing) or the claim being true. Everything else is a quality finding the person may waive.
const HARD_STEP = /^(preflight|--video|--project|text-qa|final-gate)\b/i;
const HARD_TEXT = /photosens|flash(ing|es)?\b|seizure|strobe|claim.?(truth|scope)|unsourced|fabricat|not true|false claim|product.?truth|rights|licen[cs]e|permission/i;
export function gateFindings(g) {
  if (!g) return [];
  const rows = Array.isArray(g.findings) && g.findings.length ? g.findings : (g.blocked || []).map((b) => ({ text: String(b) }));
  return rows.map((f) => {
    const text = String(f.text || [f.name, f.reason].filter(Boolean).join(": "));
    const m = text.match(/^([\w./-]+)(?:\s*\(([^)]*)\))?\s*:\s*([\s\S]*)$/);
    const step = f.step || (m ? m[1] : "gate"), check = m && m[2] ? m[2] : "";
    const reason = String(f.reason || (m ? m[3] : text)).replace(/\s+/g, " ").replace(/\(exit \d+\)\s*/g, "").replace(/^(failed|could not run \(never a pass\))\s*:?\s*/i, "").trim().slice(0, 180);
    const name = f.name || (check ? `${step}: ${check}` : step);
    const id = f.id || `${String(step).replace(/[^\w]+/g, "-")}-${crypto.createHash("sha1").update(text).digest("hex").slice(0, 6)}`;
    return { id, step, name, reason, waivable: f.waivable !== undefined ? !!f.waivable : !(HARD_STEP.test(step) || HARD_TEXT.test(text)) };
  });
}

// what console.mjs push calls before a film reaches the person: {ok, why[]}
// { allowGateFailed: true } (push --waiver-payload) lets a render whose final-gate FAILED reach the Final, but only when every failing finding is waivable: the Final then shows them
// ({gate_failed, findings}) and the film stays "not passed" until the person fixes or waives each one. A hard finding, a different render, an open round or a draft still refuse.
export function verifyHandover(run, video, { allowGateFailed = false } = {}) {
  const why = [...preflight(run, video)];
  const g = jr(path.join(run, "final-gate.json"));
  let gateFailed = null;
  if (!video || !ex(video)) why.push("no final render to hand over");
  else if (!g) why.push("final-gate.mjs has not run (node crew.mjs final-gate --run <run> --project <dir> --video <render>)");
  else {
    if (g.ok !== true) {
      const fs_ = gateFindings(g), hard = fs_.filter((f) => !f.waivable);
      if (allowGateFailed && fs_.length && !hard.length && g.video_sha === sha(video)) gateFailed = fs_;
      else why.push(`final-gate did not pass: ${(g.blocked || []).slice(0, 4).join("; ")}${allowGateFailed && hard.length ? ` (never waivable: ${hard.map((f) => f.name).join(", ")}; fix ${hard.length > 1 ? "these" : "this"})` : ""}`);
    }
    if (g.video_sha !== sha(video)) why.push("final-gate passed a different render than this one: run it again on this file");
  }
  return { ok: why.length === 0, why, gate_failed: why.length === 0 ? gateFailed : null, warnings: (g && g.warnings) || [], needs_you: (g && g.needs_you) || [] };
}

// the film's markup: index.html plus every sub-composition it mounts (data-composition-src) and the files in compositions/: a film built from
// sub-compositions keeps all its words there, so reading index.html alone found 0 words (26keys-launch, 1.36)
export function filmHtml(project) {
  const root = path.resolve(project), seen = new Set(), parts = [];
  const add = (f) => { const p = path.resolve(f); if (seen.has(p) || !ex(p) || !/\.html?$/i.test(p)) return; seen.add(p); let h = ""; try { h = fs.readFileSync(p, "utf8"); } catch { return; } parts.push(h); for (const m of h.matchAll(/data-composition-src\s*=\s*["']([^"']+)["']/g)) add(path.resolve(path.dirname(p), m[1])); };
  add(path.join(root, "index.html"));
  try { for (const f of fs.readdirSync(path.join(root, "compositions")).sort()) add(path.join(root, "compositions", f)); } catch {}
  return parts.join("\n");
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
  const blocked = [], steps = [], warnings = [], needs_you = [];
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
    // the film's gate profile (its chosen world's atlas gate_profile, else the older look/medium.json contract) and the concept's grammar waivers
    const gp = runGateProfile(run), wv = runWaivers(run);
    const launchKind = /^(launch|promo)/i.test(String(kind || "")), effProfile = gp.profile || (launchKind ? "flat" : null); // the default launch grammar is judged flat: no depth or ground demands
    const profArgs = effProfile ? ["--gate-profile", effProfile] : [], waiveArgs = Object.keys(wv.waived).length ? ["--waive", waiversArg(wv.waived)] : [];
    steps.push({ step: "gate-profile", ok: true, profile: effProfile, world: gp.world, source: gp.profile ? gp.source : launchKind ? "launch default (flat)" : gp.source, ...(Object.keys(wv.waived).length ? { grammar_waivers: wv.waived } : {}), ...(wv.ignored.length ? { ignored_waivers: wv.ignored } : {}) });
    if (!gp.profile && !launchKind) warnings.push(`gate-profile: no gate_profile found for this film's style world${gp.world ? ` "${gp.world}"` : " (no style_world in story/chosen.json, motion/score.json or look/system.json)"}: judged as a dimensional film`);
    for (const x of wv.ignored) warnings.push(`grammar_waivers: ${x}`);
    const rec = (step, r, extra = {}) => {
      const jOk = r.json ? r.json.ok !== false : true;
      const ok = r.code === 0 && jOk;
      steps.push({ step, ok, exit: r.code, ...extra });
      // say WHY: the first blocking findings of the gate itself (a bare exit code tells the person nothing)
      const why = (() => { const j = r.json || {}, one = (f) => typeof f === "string" ? f : [f.check || f.rule || f.id || f.code || f.what, f.where || f.message || f.msg || f.why || f.measured].filter(Boolean).join(": "); const L = [...(Array.isArray(j.findings) ? j.findings.filter((f) => f && (f.severity === "error" || f.level === "error")) : []), ...(Array.isArray(j.problems) ? j.problems : []), ...(Array.isArray(j.errors) ? j.errors : [])].map((f) => one(f).replace(/\s+/g, " ").slice(0, 120)).filter(Boolean); return L.length ? ` [${L.slice(0, 3).join(" | ")}${L.length > 3 ? ` | +${L.length - 3} more` : ""}]` : ""; })();
      if (!ok) blocked.push(`${step}: ${r.code === 1 ? "could not run (never a pass)" : "failed"} (exit ${r.code})${why}${r.stderr ? " " + r.stderr.replace(/\s+/g, " ").slice(-200) : ""}`);
      return ok;
    };
    const fg = run1("frame-gate.mjs", ["--video", video, "--project", project, ...(hasScore ? ["--plan", score] : []), ...(kind ? ["--kind", kind] : []), ...profArgs, ...waiveArgs, "--json"]);
    rec("frame-gate", fg);
    const mg = run1("motion-gate.mjs", ["--video", video, "--project", project, ...(hasScore ? ["--plan", score] : []), "--end-hold", String(args["end-hold"] || (launchKind ? 4 : 1.4)), ...(kind ? ["--kind", kind] : []), "--run", run, ...profArgs, ...waiveArgs, "--json"]);
    try { fs.mkdirSync(path.join(run, "motion"), { recursive: true }); fs.writeFileSync(path.join(run, "motion", "motion-gate.json"), mg.json ? JSON.stringify(mg.json, null, 2) : JSON.stringify({ ok: false, exit: mg.code, stdout: mg.stdout.slice(0, 4000) })); } catch {}
    rec("motion-gate", mg, { saved: "motion/motion-gate.json" });
    // launch gates on the rendered video (lib/launch-gates.mjs): scale, ground variety, meaningful stillness, hook length. Text size reuses frame-gate's DOM rows.
    if (launchKind) {
      const rowsF = path.join(run, "motion", "launch-text-rows.json");
      const rows = ((fg.json && fg.json.frames) || []).filter((f) => f && typeof f.t === "number" && typeof f.bigPct === "number").map((f) => ({ t: f.t, bigPct: f.bigPct, ...(f.blocks ? { blocks: f.blocks } : {}) }));
      try { fs.mkdirSync(path.dirname(rowsF), { recursive: true }); fs.writeFileSync(rowsF, JSON.stringify(rows)); } catch {}
      const lg = run1("lib/launch-gates.mjs", ["--video", video, ...(rows.length ? ["--text-rows", rowsF] : ["--project", project]), ...(hasScore ? ["--score", score] : []), "--end-hold", String(args["launch-end-hold"] || 4)]);
      const fnd = (lg.json && lg.json.findings) || [];
      if (!lg.json) { steps.push({ step: "launch-gates", ok: false, exit: lg.code }); blocked.push(`launch-gates: could not run (never a pass) ${lg.stderr.replace(/\s+/g, " ").slice(-200)}`); }
      else {
        const waived = (f) => wv.waived && Object.prototype.hasOwnProperty.call(wv.waived, f.check);
        const errs = fnd.filter((f) => f.severity === "error" && !waived(f));
        steps.push({ step: "launch-gates", ok: !errs.length, measured: lg.json.measured });
        for (const f of errs) blocked.push(`launch-gates (${f.check}): ${f.message}`);
        for (const f of fnd.filter((f) => f.severity !== "error" || waived(f))) warnings.push(`launch-gates (${f.check})${waived(f) ? " [waived]" : ""}: ${f.message}`);
      }
    }
    const runScenes = path.join(run, "scenes.json");
    const sl = run1("slop.mjs", ["--project", project, "--video", video, "--run", run, ...(ex(runScenes) ? ["--scenes", runScenes] : []), ...(hasScore ? ["--score", score] : []), ...profArgs, "--json"]);
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
      const html = filmHtml(project);
      const brand = String((jr(path.join(run, "brief.json")) || {}).name || (jr(path.join(run, "brief.json")) || {}).product || "");
      const q = textQa(html, { allow: brand.split(/\W+/).filter(Boolean) });
      steps.push({ step: "text-qa", ok: q.ok, words: q.words, errors: q.errors.length, warnings: q.warnings.length });
      { const bz = [...new Set(q.buzzwords || [])]; if (bz.length) warnings.push(`text-qa (buzzword): the film's on-screen text uses ${bz.map((b) => `"${b}"`).join(", ")}: say the specific thing it does (references/launch-grammar.md section 14)`); }
      if (!q.ok) blocked.push(`text-qa: ${q.errors.slice(0, 6).map((e) => `${e.kind} "${e.word}" (${e.context})`).join("; ")}: fix the words in index.html`);
    } catch (e) { steps.push({ step: "text-qa", ok: false }); blocked.push(`text-qa: could not run (${String(e.message).slice(0, 120)})`); }
  }
  // 8 music-sync: cuts land on music events within 150 ms, measured on the final render
  if (video && ex(video) && !blocked.some((b) => /^(preflight|--video)/.test(b))) {
    const ms = run1("music-map.mjs", ["check", "--video", video, "--run", run]);
    steps.push({ step: "music-sync", ok: ms.code === 0, ...(ms.json ? { measured: ms.json.measured, warnings: ms.json.warnings } : {}) });
    if (ms.code !== 0) blocked.push(`music-sync: ${ms.json && ms.json.errors && ms.json.errors.length ? ms.json.errors.join("; ") : `could not run (exit ${ms.code}) ${ms.stderr.replace(/\s+/g, " ").slice(-160)}`}`);
  }
  // 10 vo-scratch: a voice made by the macOS `say` fallback (vo.mjs) is a timing track, not a finished voice: never ship it silently (a visible warning and a needs-you; the person decides)
  {
    const vf = [path.join(run, "audio", "vo", "words.json"), path.join(run, "audio", "words.json"), path.join(run, "audio", "vo.json"), path.join(run, "audio", "vo", "vo.json")];
    const scratch = vf.map((f) => ({ f, j: jr(f) })).find((x) => x.j && String(x.j.provider || "").toLowerCase() === "say");
    if (scratch) {
      const msg = "the voice-over is the macOS `say` scratch voice (no ElevenLabs or OpenAI key was available): it is robotic, a timing track and not a finished voice";
      warnings.push(`vo-scratch: ${msg}`);
      needs_you.push(`${msg}. Set ELEVENLABS_API_KEY or OPENAI_API_KEY and re-run vo.mjs make, or confirm you want to ship the scratch voice (${path.relative(run, scratch.f)}).`);
      steps.push({ step: "vo-scratch", ok: true, warning: true, file: path.relative(run, scratch.f) });
    }
  }
  // 9 earshot-tech: warnings only, never a block, never the verdict
  if (video && ex(video) && earshot.available()) {
    try {
      const warnings = earshot.techFindings(earshot.critique(video, { video, fast: true })).map((w) => `earshot-${w.kind}: ${w.text}`);
      steps.push({ step: "earshot-tech", ok: true, optional: true, warnings });
    } catch (e) { steps.push({ step: "earshot-tech", ok: true, optional: true, warnings: [], note: `could not run (${String(e.message).slice(0, 120)}); skipped` }); }
  }
  // open craft notes: grammar and craft warnings the builder neither fixed nor answered in 2 rounds (crew.mjs answers). Not errors, no waiver needed: the Final shows them.
  let open_craft_notes = [];
  try { open_craft_notes = openCraftNotes(run); for (const n of open_craft_notes) warnings.push(`open craft note (${n.rule}): ${n.note}`); } catch { /* none */ }
  const res = { ok: blocked.length === 0, t: new Date().toISOString(), video: video || null, video_sha: video && ex(video) ? sha(video) : null, project, steps, blocked, warnings, needs_you, ...(open_craft_notes.length ? { open_craft_notes } : {}) };
  res.findings = gateFindings({ blocked });
  try { fs.writeFileSync(path.join(run, "final-gate.json"), JSON.stringify(res, null, 2)); } catch {}
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { parseArgs } = await import("./lib/common.mjs");
  const res = main(parseArgs());
  process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  process.exit(res.ok ? 0 : 2);
}
