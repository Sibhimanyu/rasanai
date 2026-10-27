#!/usr/bin/env node
// quick-preview: an OPT-IN fast prototype of a simple 10-40 s film as ONE HTML composition (PROJECT/compositions/quick/index.html),
// rendered through headless Chrome (lib/cdp.mjs) and ffmpeg, then handed to the normal workflow. It does not change the five calls,
// crew.mjs --budget lean|standard|full, the direct path or "Just make it". references/quick-film.md; agents/quick-builder.md.
//
//   node quick-film.mjs scaffold --run <RUN> --project <PROJECT> [--duration 30] [--brief <quick brief.json>] [--offline]
//        reads the run's quick brief (<RUN>/quick/brief.json) and approved Look; writes quick.json, the composition (with its virtual-time
//        adapter), a HyperFrames host index.html and vendored GSAP. Out of scope (over 40 s, more than 4 steps, regulated claims,
//        footage / 3D / series) exits 2 "needs-full-crew" and logs an upgrade: never a silent incomplete preview.
//        scaffold --print-brief-template   prints the quick brief to fill
//   node quick-film.mjs check   --project <PROJECT> [--json]
//        console errors, missing assets / fonts, visible text at fixed timestamps, blank frames, bounded duration, A-B-A and cold seek,
//        text readability (lib/reading.mjs, a warning); refuses remote scripts / iframes / unapproved images / audio+video tags /
//        unseeded randomness / wall-clock time / secrets BEFORE anything runs. Exit 0 pass, 2 findings, 1 could not run.
//   node quick-film.mjs render  --project <PROJECT> --out <mp4> [--fps 30] [--engine cdp|hyperframes] [--no-check]
//        runs the check first (a failing check renders nothing), then seeks every frame and encodes with ffmpeg (music + sfx from quick.json).
//   node quick-film.mjs promote --run <RUN> --project <PROJECT> [--reason "<why>"] [--budget lean|standard|full]
//        records the draft as the film's origin (<RUN>/quick/origin.json), saves storyboard / score seed / Look inputs / the preview,
//        logs the upgrade, lists the music credit for deliver.mjs, and prints the normal next steps (nothing restarts).
//   node quick-film.mjs bench   --brief <quick brief.json> [--fps 30] [--out <dir>]
//        measures time to first draft and the model-visible text of this path against a lean crew plan; see references/quick-film.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die } from "./lib/common.mjs";
import { finalCompletion } from "./lib/final-label.mjs";
import { scaffold, check, render, promote, briefTemplate, QUICK } from "./lib/quick-film.mjs";

// software GL by default: the same pixels run to run (as regression.mjs and custom-style.mjs)
process.env.RASANAI_GL = process.env.RASANAI_GL || "cpu";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.join(HERE, "..");
const args = parseArgs();
const cmd = args._[0];
const COMMANDS = ["scaffold", "check", "render", "promote", "bench"];
const val = (k) => (args[k] && args[k] !== true ? String(args[k]) : null);
const need = (k) => { const v = val(k); if (!v) die(`--${k} required (quick-film.mjs ${cmd})`); return v; };
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
if (!cmd || !COMMANDS.includes(cmd)) die(`usage: quick-film.mjs ${COMMANDS.join("|")} ... (see the header)`);
const exitFor = (r) => (r.ok ? 0 : r.could_not_run || r.status === "could-not-run" ? 1 : 2);

try {
  if (cmd === "scaffold") {
    if (args["print-brief-template"]) out(briefTemplate());
    const r = await scaffold({ run: need("run"), project: need("project"), duration: val("duration"), briefFile: val("brief"), offline: !!args.offline });
    out(r, exitFor(r));
  } else if (cmd === "check") {
    const r = await check(path.resolve(need("project")));
    if (args.json) out(r, exitFor(r));
    const lines = [`quick-film check: ${r.status} (${r.elapsed_s}s)`];
    for (const e of r.errors) lines.push(`  ERROR ${e.code}${e.at != null ? ` @${e.at}s` : ""}: ${e.msg}`);
    for (const w of r.warnings) lines.push(`  warn  ${w.code}${w.at != null ? ` @${w.at}s` : ""}: ${w.msg}`);
    if (r.could_not_run) lines.push(`  ${r.could_not_run}`);
    console.log(lines.join("\n"));
    process.exit(exitFor(r));
  } else if (cmd === "render") {
    const pj = path.resolve(need("project"));
    const r = await render(pj, need("out"), { fps: val("fps") ? Number(val("fps")) : undefined, check: !args["no-check"], engine: val("engine") || "cdp", log: (m) => process.stderr.write(`${m}\n`) });
    out({ ...r, completion_label: "draft" }, exitFor(r)); // a quick preview is a draft, never a reviewed claim
  } else if (cmd === "promote") {
    const r = promote({ run: need("run"), project: need("project"), reason: val("reason"), budget: val("budget") });
    out({ ...r, completion_label: "draft", ...(((c) => (c ? { completion: c } : {}))(finalCompletion(val("run"), null))), completion_note: "promoting a preview carries no reviewed claim; the full film is assessed at its Final" }, exitFor(r));
  } else if (cmd === "bench") {
    const briefFile = path.resolve(need("brief"));
    const dir = val("out") ? path.resolve(val("out")) : fs.mkdtempSync(path.join(os.tmpdir(), "quick-bench-"));
    const run = path.join(dir, "run"), pj = path.join(dir, "project");
    fs.mkdirSync(path.join(run, "quick"), { recursive: true });
    fs.copyFileSync(briefFile, path.join(run, "quick", "brief.json"));
    const t = {}, T = () => Date.now();
    let t0 = T();
    const sc = await scaffold({ run, project: pj, offline: true });
    t.scaffold_s = (T() - t0) / 1000;
    if (!sc.ok) out({ ok: false, scaffold: sc }, 2);
    t0 = T();
    const ck = await check(pj);
    t.check_s = (T() - t0) / 1000;
    t0 = T();
    const rd = ck.ok ? await render(pj, path.join(pj, "renders", "quick-preview.mp4"), { fps: val("fps") ? Number(val("fps")) : undefined, check: false }) : { ok: false };
    t.render_s = (T() - t0) / 1000;
    const bytes = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
    const tok = (n) => Math.ceil(n / 4); // chars / 4: an ESTIMATE, labelled as one
    const briefB = bytes(briefFile), compB = bytes(path.join(pj, "compositions", "quick", "index.html"));
    const readB = bytes(path.join(SKILL, "agents", "quick-builder.md")) + bytes(path.join(SKILL, "references", "quick-film.md")) + briefB;
    const quick = { model_dispatches: 1, model_reads_tokens_est: tok(readB), model_writes_tokens_est_scaffold_path: tok(briefB), model_writes_tokens_est_hand_authored_html: tok(compB), note: "scaffold path: the model writes only the brief; the composition is generated by code. hand-authored: the model would write the whole HTML." };
    const lr = path.join(dir, "lean-run");
    fs.mkdirSync(lr, { recursive: true });
    const lp = spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), "plan", "--run", lr, "--route", "general-video", "--subject", "Synthetic benchmark film", "--length", String(JSON.parse(fs.readFileSync(briefFile, "utf8")).duration_s || 30), "--budget", "lean", "--project", path.join(dir, "lean-project")], { encoding: "utf8" });
    let lean = { error: "crew.mjs plan did not run" };
    try {
      const j = JSON.parse(lp.stdout), plan = JSON.parse(fs.readFileSync(path.join(lr, "crew", "plan.json"), "utf8"));
      const roles = new Set();
      for (const ph of j.phases || []) for (const m of ph.members || []) roles.add(String(m).split(" ")[0]);
      let rb = 0; for (const r of roles) rb += bytes(path.join(SKILL, "agents", `${r}.md`));
      const num = (s) => { const m = String(s).match(/([\d.]+)\s*([MkK]?)/); return m ? Number(m[1]) * (m[2].toLowerCase() === "m" ? 1e6 : m[2].toLowerCase() === "k" ? 1e3 : 1) : null; };
      lean = { model_dispatches: j.dispatches, phases: (j.phases || []).length, planned_tokens_total: num(j.estimate && j.estimate.total), planned_total_label: j.estimate && j.estimate.total, role_files_read_tokens_est: tok(rb), source: "crew.mjs plan --budget lean (the crew's own planning table; the actual spend is recorded by crew.mjs check --tokens)", plan_ok: !!plan };
    } catch (e) { lean = { error: e.message, stderr: (lp.stderr || "").slice(0, 200) }; }
    const res = {
      ok: !!rd.ok, brief: briefFile, dir, size: rd.size, duration_s: rd.duration_s, fps: rd.fps, engine: "cdp", gl: process.env.RASANAI_GL,
      quick: { ...t, total_s: +(t.scaffold_s + t.check_s + t.render_s).toFixed(2), ...quick },
      lean,
      comparison: {
        dispatches: `${quick.model_dispatches} (quick) vs ${lean.model_dispatches} (lean)`,
        planned_tokens: lean.planned_tokens_total ? `${(quick.model_reads_tokens_est + quick.model_writes_tokens_est_scaffold_path).toLocaleString()} read+written (est.) vs ${lean.planned_tokens_total.toLocaleString()} planned` : "lean not measured",
        lean_time_to_first_draft: "not measurable offline: it is model-bound (12 sequential dispatches before the first draft render); only the machine half of quick is measured",
      },
    };
    out(res, res.ok ? 0 : 2);
  }
} catch (e) {
  die(e.message);
}
void QUICK;
