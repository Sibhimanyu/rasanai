#!/usr/bin/env node
// Plan 11 R7: a READ-ONLY diagnostic. It inspects state and prints what is wrong, what is unknown and what the owner can do. It launches no model, no render, no provider call and no network
// request, takes no lock, writes no file and changes no project (the one external process it runs is `ps`, to read the process table).
//
//   node scripts/diagnose.mjs [--run <run folder>] [--json]
//
//   host            tools found on PATH (file-system lookups), isolation records, the reviewed boundary (static)
//   licences        the register checked against the vendored files, unresolved records, open distribution blockers
//   run             (with --run) jobs as recovery states, interrupted / unknown-outcome / stale work, what resume would pick, torn JSONL tails, abandoned temp files, unfinished publication
//                   intents, a second director, the migration plan, rate limits with their source
// Unknown stays unknown: a fact that cannot be read is printed as "unknown", never as healthy.
// Repairs live in `crew.mjs recover` (explicit, owner-run) and are never started from here.
import fs from "node:fs";
import path from "node:path";
import { probeHost } from "./lib/capabilities.mjs";
import { renderIsolation, boundaryReview } from "./lib/containment.mjs";
import { loadRegister, inventory, unresolved, distributionGate } from "./lib/license-register.mjs";
import { reconcileRun, readJsonl, sweepTemps, directorOwnership, migrationPlan, rateLimitReport, diskGuard, FAILURE_CATEGORIES, nextStep, repeatedFailure } from "./lib/recovery.mjs";
import { recover as txnRecover } from "./lib/publish-txn.mjs";
import { listJobs } from "./lib/jobs.mjs";
import { redact } from "./lib/redact.mjs";

const argv = process.argv.slice(2);
if (argv.some((a) => /^--(apply|fix|repair|migrate)$/.test(a))) { console.error("diagnose never changes anything. To repair, run `crew.mjs recover --run <run> --apply` yourself."); process.exit(2); }
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
const run = opt("run") ? path.resolve(opt("run")) : null;

const findings = []; // { level: "problem"|"attention"|"info"|"unknown", area, what, do }
const add = (level, area, what, doThis = null) => findings.push({ level, area, what: redact(what), ...(doThis ? { do: doThis } : {}) });

// ---- host -------------------------------------------------------------------------------------------------------------------------------
const host = probeHost();
for (const [k, label] of [["ffmpeg", "ffmpeg"], ["ffprobe", "ffprobe"], ["chrome", "Chrome or Chromium"]]) if (!host[k]) add("attention", "host", `${label} was not found by a file-system lookup`, `install ${label} yourself (RasanAI never installs it for you); some stages cannot run without it`);
const isolation = renderIsolation();
add("info", "host", isolation.honest_summary);
const boundary = boundaryReview();
for (const s of boundary.surfaces.filter((x) => x.enforcement === "unavailable")) add("attention", "boundary", `${s.id}: ${s.gap}`);

// ---- licences ------------------------------------------------------------------------------------------------------------------------------
const reg = loadRegister();
if (!reg.ok) for (const p of reg.problems) add("problem", "licences", p);
const inv = inventory(undefined, reg.register ? reg : null);
for (const f of inv.findings) add("attention", "licences", f.problem);
const un = unresolved(reg.register ? reg : null);
for (const b of un.blockers) add("problem", "licences", `open distribution blocker ${b.id}: ${b.scope}`, b.cleared_by);
for (const r of un.records.filter((x) => !x.blocker)) add("attention", "licences", `${r.id} (${r.kind}) is ${r.status}`, r.action);
const gate = distributionGate(reg.register ? reg : null);

// ---- a run ---------------------------------------------------------------------------------------------------------------------------------
let runReport = null;
if (run) {
  if (!fs.existsSync(run)) add("problem", "run", `the run folder does not exist: ${run.split(path.sep).slice(-2).join("/")}`);
  else {
    const rec = reconcileRun(run, { apply: false });
    const byState = rec.by_state;
    for (const j of rec.jobs) {
      if (j.state === "interrupted") add("attention", "jobs", `job ${j.job_id} (${j.node}) was interrupted: its owner process is gone`, j.next);
      else if (j.state === "unknown-outcome") add("problem", "jobs", `job ${j.job_id} (${j.node}): a provider request may or may not have been accepted`, "reconcile it by client id; do not resubmit without deciding to accept a possible duplicate charge");
      else if (j.state === "stale") add("attention", "jobs", `job ${j.job_id} (${j.node}) is stale: ${j.why}`, j.next);
      else if (j.state === "waiting-for-approval") add("info", "jobs", `job ${j.job_id} (${j.node}) waits for you`, j.next);
    }
    const failedJobs = listJobs(run).filter((j) => j.state === "failed" || (j.failure && j.state === "retry_wait"));
    const cats = {};
    for (const j of failedJobs) { const c = (j.failure && j.failure.category) || "unknown"; cats[c] = (cats[c] || 0) + 1; const rep = repeatedFailure(j); const step = FAILURE_CATEGORIES.includes(c) ? nextStep(c) : null; add("attention", "failures", `job ${j.job_id} failed as ${c}${rep.repeated ? " (the same failure repeated with no progress)" : ""}${j.failure ? `: ${j.failure.error}` : ""}`, step ? step.owner_action || step.note || step.action : "no failure class was recorded for this job: unknown"); }
    if (!rec.jobs.length) add("info", "jobs", "no jobs are recorded for this run yet");
    // JSONL tails
    const torn = [];
    for (const rel of ["motion/edits.jsonl", "crew/ledger.jsonl", "crew/revisions.jsonl", "director-events.jsonl", "crew/rights.jsonl"]) { const f = path.join(run, rel); if (!fs.existsSync(f)) continue; const r = readJsonl(f); if (r.torn_tail) { torn.push(rel); add("attention", "logs", `${rel} ends in a torn line (an interrupted write); ${r.events.length} earlier events are intact and still read`, "crew.mjs recover --apply keeps a copy and trims the torn line"); } if (r.bad_lines) add("attention", "logs", `${rel} has ${r.bad_lines} unreadable line(s) in the middle; they are skipped when reading`); }
    // temp files
    const dirs = [run, path.join(run, "crew"), path.join(run, "crew", "jobs"), path.join(run, "crew", "txn"), path.join(run, "motion"), path.join(run, "hybrid", "renders")].filter((d) => fs.existsSync(d));
    const temps = sweepTemps(dirs, { apply: false });
    if (temps.length) add("attention", "files", `${temps.length} abandoned temporary file(s) from interrupted writes (${Math.round(temps.reduce((a, t) => a + t.bytes, 0) / 1024)} KB)`, "crew.mjs recover --apply removes them (single files only)");
    // publication intents
    const intents = txnRecover(run, { apply: false });
    for (const t of intents) add(t.plan === "conflict_newer" ? "problem" : "attention", "publication", `unfinished ${t.kind} transaction ${t.id}: plan ${t.plan}`, t.plan === "conflict_newer" ? "a newer revision exists; nothing will be overwritten. Review it" : "crew.mjs recover --apply finishes or rolls it back");
    // directors
    const own = directorOwnership(run);
    if (!own.ok) add("problem", "director", own.note, "stop one of them from Studio (Stop) before continuing");
    // migrations
    const mig = migrationPlan(run);
    for (const m of mig.pending) add("info", "migration", `pending migration ${m.id}: ${m.describe} (${m.files.length} file(s))`, "crew.mjs recover --migrate --apply; originals are copied aside first and can be restored");
    // rate limits and disk
    const rl = rateLimitReport(run);
    for (const r of rl) add("info", "rate_limit", `${r.pool}: ${r.reason}${r.retry_after_s != null ? `, about ${r.retry_after_s}s left (${r.source})` : ", no reset time was given by the provider"}`);
    const disk = diskGuard(run, 2 ** 30);
    add(disk.known ? (disk.ok ? "info" : "attention") : "unknown", "disk", disk.known ? `${Math.round(disk.free_bytes / 2 ** 30)} GB free${disk.ok ? "" : " (under 1 GB: a render may not finish)"}` : "free disk space is unknown", disk.ok ? null : "free some space; nothing is deleted for you");
    runReport = { run_name: path.basename(run), by_state: byState, resume: rec.resume, failure_categories: cats, torn_logs: torn, temp_files: temps.length, unfinished_transactions: intents.length, directors: own.drivers.length, migrations_pending: mig.pending.length };
  }
}

const order = { problem: 0, attention: 1, unknown: 2, info: 3 };
findings.sort((a, b) => order[a.level] - order[b.level]);
const report = { schema_version: 1, generated_at: new Date().toISOString(), read_only: true, summary: { problems: findings.filter((f) => f.level === "problem").length, attention: findings.filter((f) => f.level === "attention").length, unknown: findings.filter((f) => f.level === "unknown").length }, distribution: { ok: gate.ok, blockers: gate.blockers.map((b) => b.id) }, host: { platform: host.platform, node: process.version, ffmpeg: host.ffmpeg, ffprobe: host.ffprobe, chrome: host.chrome, os_sandbox: isolation.os_sandbox }, run: runReport, findings };
if (flag("json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`RasanAI diagnostic (read-only) ${report.generated_at}`);
  console.log(`problems ${report.summary.problems}, needs attention ${report.summary.attention}, unknown ${report.summary.unknown}; distribution ${gate.ok ? "clear" : "BLOCKED by " + gate.blockers.map((b) => b.id).join(", ")}`);
  for (const f of findings) console.log(`[${f.level}] ${f.area}: ${f.what}${f.do ? `\n        do: ${f.do}` : ""}`);
  if (runReport) console.log(`resume would continue with: ${runReport.resume.next.join(", ") || "nothing unfinished"} (never restarts at Brief)`);
}
process.exit(report.summary.problems ? 1 : 0);
