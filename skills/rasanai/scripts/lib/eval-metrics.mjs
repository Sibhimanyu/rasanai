// Fair cost and speed instrumentation, three-dimension acceptance and pre-registration (Plan 13 Q1, Q5, Q7). Extends lib/usage.mjs (token counters, never 0 for
// unreported, API-equivalent separate from billing) and lib/perf-evidence.mjs (critical path, cold/warm, failure cost, throughput). It adds the environment
// record, phase timings, sample labelling and the guards against unfair comparisons. It measures nothing itself and promises no percentage.
import os from "node:os";
import crypto from "node:crypto";
import { usageRecord, summarize as summarizeUsage } from "./usage.mjs";

const sha = (x) => crypto.createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");
const nn = (x) => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x));

// Q1: three dimensions, reported separately, evidence retained. There is no merged number: a merged key is refused.
export const DIMENSIONS = ["technical_correctness", "communication_and_craft", "efficiency"];
const MERGED = /^(overall|score|total|total_score|quality_score|composite|grade|rating|combined)$/i;
export function dimensionReport(input = {}) {
  const bad = Object.keys(input).filter((k) => MERGED.test(k));
  if (bad.length) throw new Error(`no merged score: ${bad.join(", ")} is not allowed; report the three dimensions separately`);
  const out = {};
  for (const d of DIMENSIONS) {
    const v = input[d] || {};
    const evidence = Array.isArray(v.evidence) ? v.evidence : [];
    const status = ["pass", "fail", "mixed", "not_run", "invalid_evidence", "pending_human_review"].includes(v.status) ? v.status : "not_run";
    if (["pass", "fail", "mixed"].includes(status) && !evidence.length) throw new Error(`${d}: a ${status} needs retained evidence (paths or digests)`);
    if (Object.keys(v).some((k) => MERGED.test(k))) throw new Error(`${d}: no merged score inside a dimension either`);
    out[d] = { status, findings: v.findings || [], evidence, graded_by: v.graded_by || null };
  }
  out.note = "a cheaper bad film is not a win; a clean encode is not proof of persuasion; a model judge is not a human preference";
  return out;
}

// Q5: the environment of a measurement. Pass what the harness actually observed; unknown stays null and is listed in `unknown`.
export function captureEnvironment(extra = {}) {
  const cpu = os.cpus() || [];
  const env = { hardware: { model: extra.hardware_model ?? null, cpu: cpu[0] ? cpu[0].model : null, cores: cpu.length || null, memory_gb: Math.round((os.totalmem() / 2 ** 30) * 10) / 10 }, os: `${os.platform()} ${os.release()}`, arch: os.arch(), node: process.version, renderer: extra.renderer ?? null, ffmpeg: extra.ffmpeg ?? null, model_identity: extra.model_identity ?? null, runtime_versions: extra.runtime_versions ?? null, candidate_commit: extra.candidate_commit ?? null, resource_limits: extra.resource_limits ?? null, cache_state: extra.cache_state ?? null };
  env.unknown = ["renderer", "ffmpeg", "model_identity", "candidate_commit", "resource_limits", "cache_state"].filter((k) => env[k] == null);
  return env;
}

export const PHASES = ["time_to_treatment_s", "time_to_board_s", "time_to_first_draft_s", "final_render_s", "revision_turnaround_s"];
export const CACHE_STATES = ["cold", "warm", "mixed", "unknown"];
const REQ_TOP = ["task_hash", "asset_hashes", "dimensions", "fps", "quality", "cache_state", "environment", "candidate_commit"];

// m: one measurement. Required context first; missing -> listed, never filled in.
export function validateMeasurement(m = {}) {
  const miss = REQ_TOP.filter((k) => m[k] == null || m[k] === "");
  const env = m.environment || {};
  for (const k of ["os", "node", "hardware"]) if (!env[k]) miss.push(`environment.${k}`);
  if (m.cache_state && !CACHE_STATES.includes(m.cache_state)) miss.push("cache_state (cold|warm|mixed|unknown)");
  if (!Array.isArray(m.failures)) miss.push("failures (an array, empty when none)");
  const time = m.time || {};
  if (!("user_wait_s" in time) || !("active_compute_s" in time)) miss.push("time.user_wait_s and time.active_compute_s (kept apart; null when unmeasured)");
  const bad = [];
  for (const p of PHASES) if (p in (m.phases || {}) && m.phases[p] != null && !nn(m.phases[p])) bad.push(p);
  if (m.provider_counters != null && m.billing_estimate != null && m.provider_counters === m.billing_estimate) bad.push("provider counters and billing estimates must be separate records");
  if (m.label && !["measurement", "sample"].includes(m.label)) bad.push("label");
  return { ok: !miss.length && !bad.length, missing: miss, invalid: bad };
}

// usage rows include failed, retried and rejected work (usage.mjs summarize keeps every row); provider counters and billing stay separate
export function totalUsage(rows = []) {
  const all = (Array.isArray(rows) ? rows : []).map((r) => usageRecord(r || {}));
  const sum = summarizeUsage(all);
  return { provider_counters: sum, billing: { estimate_rows: all.filter((r) => r.api_equivalent).length, billed_rows: all.filter((r) => r.billed).length, note: "API-equivalent estimates and billed amounts are never added to provider counters" }, retries_included: true, rejected_included: !!(sum.by_purpose && sum.by_purpose.rejected_alternative) || all.every((r) => r.purpose !== "rejected_alternative") };
}

// A single run is a measurement; label sample size and spread. No claim of a general speedup from n < 3.
export function describeSample(values = [], { unit = "s" } = {}) {
  const v = values.filter(nn).map(Number);
  const n = v.length;
  if (!n) return { n: 0, label: "not_run", unit };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return { n, label: n === 1 ? "measurement" : "sample", mean: round(mean), min: Math.min(...v), max: Math.max(...v), stdev: sd == null ? null : round(sd), unit, general_claim_allowed: n >= 3 && sd != null, note: n === 1 ? "one run is a measurement, not a reliable general figure" : n < 3 ? "too few runs for a general claim; variability is shown as measured" : "variability shown; this still describes this task set and host only" };
}
const round = (x) => Math.round(x * 1000) / 1000;

// Q5/Q7: comparisons and criteria are declared BEFORE running, with the one change under test. The digest is stored so a later report can show it matches.
export const FACTORS = ["story_policy", "context_packaging", "concurrency", "caching"];
export function preregister({ id, cases = [], comparisons = [], criteria = {}, budget = {}, registered_by = null } = {}) {
  const errors = [];
  if (!id) errors.push("id");
  if (!cases.length) errors.push("cases (matched, chosen before running)");
  if (!comparisons.length) errors.push("comparisons");
  if (!criteria.quality && !criteria.correctness) errors.push("criteria.quality or criteria.correctness (predeclared)");
  if (budget.max_runs == null) errors.push("budget.max_runs (no silent factorial benchmark)");
  const checked = comparisons.map((c) => ({ ...c, attribution: attributable(c) }));
  const factorial = checked.filter((c) => c.attribution.status === "not_attributable");
  if (factorial.length && !criteria.allow_multi_factor_exploratory) errors.push(`comparison(s) change more than one factor: ${factorial.map((c) => c.id).join(", ")}`);
  const runs = cases.length * comparisons.length * 2;
  if (budget.max_runs != null && runs > Number(budget.max_runs)) errors.push(`cases x comparisons x 2 sides = ${runs} exceeds budget.max_runs ${budget.max_runs}`);
  if (/\b\d+\s*%/.test(JSON.stringify(criteria)) && !criteria.baseline_ref) errors.push("a numerical target needs an actual baseline reference, not a theoretical percentage");
  if (errors.length) return { ok: false, errors };
  const body = { schema_version: 1, id, cases: cases.map(String), comparisons: checked, criteria, budget, registered_by };
  return { ok: true, record: { ...body, digest: sha(body), registered_at: new Date().toISOString() } };
}

// Q7: one meaningful change per comparison. `changes` lists which of FACTORS differ between side A and side B.
export function attributable(c = {}) {
  const changed = (Array.isArray(c.changes) ? c.changes : []).filter((x) => FACTORS.includes(x));
  const unknown = (Array.isArray(c.changes) ? c.changes : []).filter((x) => !FACTORS.includes(x));
  if (unknown.length) return { status: "invalid", unknown_factors: unknown };
  if (changed.length === 1) return { status: "attributable", factor: changed[0] };
  if (!changed.length) return { status: "no_change_declared" };
  return { status: "not_attributable", factors: changed, note: "a result cannot be credited to any one of these (for example parallelism alone)" };
}

// a report may include only predeclared comparisons and must list the ones that were not run; selective winners are refused
export function checkReport(prereg, report = {}) {
  const planned = new Set((prereg.comparisons || []).map((c) => c.id));
  const reported = new Set((report.results || []).map((r) => r.comparison));
  const extra = [...reported].filter((x) => !planned.has(x));
  const notRun = [...planned].filter((x) => !reported.has(x));
  const declared = new Set((report.not_run || []).map(String));
  const silent = notRun.filter((x) => !declared.has(x));
  const errors = [];
  if (prereg.digest && report.prereg_digest !== prereg.digest) errors.push("report does not carry the pre-registration digest");
  if (extra.length) errors.push(`unplanned comparisons reported: ${extra.join(", ")}`);
  if (silent.length) errors.push(`planned comparisons neither reported nor listed as not_run: ${silent.join(", ")}`);
  const pct = JSON.stringify(report.summary || "").match(/\b\d+(\.\d+)?\s*%/);
  if (pct && !(report.results || []).some((r) => r.baseline_ref)) errors.push("a percentage appears without an actual baseline measurement");
  return { ok: !errors.length, errors, not_run: notRun };
}

// Q7: outcome classes are separate; a missing result is never a pass and a broken grader is never a production failure.
export const OUTCOME_CLASSES = ["pass", "fail", "not_run", "invalid_evidence", "grader_failure", "production_failure"];
export function classifyOutcome({ ran = false, evidence_valid = true, grader_ok = true, produced = true, passed = null } = {}) {
  if (!ran) return "not_run";
  if (!evidence_valid) return "invalid_evidence";
  if (!grader_ok) return "grader_failure";
  if (!produced) return "production_failure";
  return passed === true ? "pass" : passed === false ? "fail" : "invalid_evidence";
}
// failure and repair cost count as well as successes (usage rows with purpose repair/retry and the elapsed repair time)
export function failureRepairCost(rows = [], repairs = []) {
  const u = totalUsage(rows.filter((r) => r && (["repair", "retry"].includes(r.purpose) || r.outcome === "failed")));
  return { usage: u.provider_counters, repair_time_s: repairs.filter((r) => nn(r.elapsed_s)).reduce((a, r) => a + Number(r.elapsed_s), 0) || null, repairs: repairs.length };
}
