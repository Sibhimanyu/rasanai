#!/usr/bin/env node
// Evaluation harness entrypoint (Plan 13). The ONE command surface for the case registry, the proposed test inventory, the testing-approval gate and the
// structural/semantic fixture check. It extends selftest.mjs / crew.mjs usage / lessons.mjs; it is not a second benchmark and reports no quality score.
//
//   node eval.mjs registry [--plan 05] [--json]   every deferred case id, its authored fixture paths, `fixture_pending` where none, status always
//                                                 pending_implementation_and_user_approved_validation (read-only; no gate)
//   node eval.mjs inventory [--json]              the exact proposed test inventory grouped unit -> integration -> render -> gui -> provider -> grader -> agent_film,
//                                                 with the candidate commit + uncommitted digest (read-only; NOT an approval)
//   node eval.mjs approval status|check|withdraw [--reason ...]
//   node eval.mjs approval record --wording "<the user's words>" [--message-ref <ref>] --kinds unit,... --cases plan13/Q01,... --commands "<exact>;;<exact>"
//                  [--providers none] [--paid false] [--max-wall-s N] [--repairs true|false]   (a person at a terminal only; refuses agents, CI and pipes)
//   node eval.mjs fixtures check [--plan 13]      GATED (kind unit): parses every authored fixture; runs the Plan 13 / Plan 14 case scenarios against lib/*. Refuses at
//                                                 the start without an approval record covering these cases and this exact command.
//   node eval.mjs corpus check                    GATED (kind unit): validates tests/fixtures/plan13/corpus.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, die } from "./lib/common.mjs";
import { registry, inventory, CASES, INITIAL_STATUS, FIXTURE_ROOT } from "./lib/case-registry.mjs";
import * as TA from "./lib/test-approval.mjs";
import { validateCorpus, generalizationEvidence, scanLeakage } from "./lib/eval-corpus.mjs";
import * as RUB from "./lib/rubrics.mjs";
import * as BR from "./lib/blind-review.mjs";
import * as EM from "./lib/eval-metrics.mjs";
import * as LS from "./lib/lessons-scope.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const out = (o) => console.log(JSON.stringify(o, null, 2));
const csv = (x) => (x && x !== true ? String(x).split(",").map((s) => s.trim()).filter(Boolean) : []);

// -- scenario runner for the Plan 13 / 14 fixtures: { call, input, expect } with partial-match expectations -------------------------------------
const deepGet = (o, k) => (o == null ? undefined : o[k]);
export function matches(actual, expect, at = "$") {
  if (expect === "$present") return actual != null ? [] : [`${at}: expected a value`];
  if (expect === "$absent") return actual == null ? [] : [`${at}: expected nothing, got ${JSON.stringify(actual).slice(0, 80)}`];
  if (typeof expect === "string" && expect.startsWith("~")) return String(JSON.stringify(actual)).toLowerCase().includes(expect.slice(1).toLowerCase()) ? [] : [`${at}: expected to contain "${expect.slice(1)}"`];
  if (Array.isArray(expect)) { if (!Array.isArray(actual)) return [`${at}: expected an array`]; return expect.flatMap((e, i) => matches(actual[i], e, `${at}[${i}]`)); }
  if (expect && typeof expect === "object") {
    const errs = [];
    for (const [k, v] of Object.entries(expect)) {
      if (k === "$len") { if (!Array.isArray(actual) || actual.length !== v) errs.push(`${at}: expected length ${v}`); continue; }
      if (k === "$none_of") { const txt = JSON.stringify(actual); for (const bad of v) if (txt.includes(bad)) errs.push(`${at}: must not contain "${bad}"`); continue; }
      errs.push(...matches(deepGet(actual, k), v, `${at}.${k}`));
    }
    return errs;
  }
  return actual === expect ? [] : [`${at}: expected ${JSON.stringify(expect)}, got ${JSON.stringify(actual)}`];
}

const load = (rel) => JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, rel), "utf8"));
const corpusOf = () => load("plan13/corpus.json");
const resolveRefs = (v) => (typeof v === "string" && v === "$corpus" ? corpusOf() : Array.isArray(v) ? v.map(resolveRefs) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveRefs(x)])) : v);

const CALLS = {
  validateCorpus: (i) => validateCorpus(i.corpus, i.options || {}),
  generalizationEvidence: (i) => generalizationEvidence(i.items.fixtures || i.items, i.taught || []),
  rubricFor: (i) => RUB.rubricFor(i.kind),
  rubricCoverage: () => ({ uncovered: RUB.uncoveredKinds(), count: RUB.allRubrics().length }),
  assertNoFormula: (i) => RUB.assertNoFormula(i.rubric),
  makeFinding: (i) => RUB.makeFinding(i),
  resolveFindings: (i) => RUB.resolveFindings(i.findings, i.options || {}),
  sensitivityCheck: (i) => RUB.sensitivityCheck(i),
  densityBias: (i) => RUB.densityBias(i.pairs),
  makeSheet: (i) => { const r = BR.makeSheet(i); return r.ok ? { ok: true, packet_keys: Object.keys(r.packet), has_mapping_in_packet: JSON.stringify(r.packet).includes("mapping"), key_mapping: r.key.mapping, conditions_differ: r.key.conditions_differ, leaks: BR.leaks(r.packet, r.key) } : r; },
  swappedOrders: (i) => { const r = BR.swappedPair(i); return r.ok ? { ok: true, orders: r.sheets.map((s) => s.key.mapping.X) } : r; },
  positionalEffect: (i) => BR.positionalEffect(i.results),
  reviewFlow: (i) => {
    let rec = BR.newReviewRecord("s1");
    const steps = [];
    for (const s of i.steps) {
      try {
        if (s.do === "model") rec = BR.recordModelReview(rec, s.input);
        if (s.do === "human") rec = BR.recordHumanReview(rec, s.input, s.env || {});
        steps.push({ ok: true });
      } catch (e) { steps.push({ ok: false, error: e.message }); }
    }
    return { rec, steps, human_pending: BR.humanPending(rec) };
  },
  checkBaseline: (i) => BR.checkBaseline(i),
  validateMeasurement: (i) => EM.validateMeasurement(i),
  dimensionReport: (i) => EM.dimensionReport(i),
  totalUsage: (i) => EM.totalUsage(i.rows),
  describeSample: (i) => EM.describeSample(i.values),
  preregister: (i) => { const r = EM.preregister(i); return r.ok ? { ok: true, has_digest: !!r.record.digest } : r; },
  attributable: (i) => EM.attributable(i),
  checkReport: (i) => EM.checkReport(i.prereg, i.report),
  classifyOutcome: (i) => ({ class: EM.classifyOutcome(i) }),
  failureRepairCost: (i) => { const r = EM.failureRepairCost(i.rows, i.repairs || []); return { n: r.usage.n, failed: r.usage.failed, output: r.usage.output, repair_time_s: r.repair_time_s, repairs: r.repairs }; },
  buildLesson: (i) => { const r = LS.buildLesson(i); return r.ok ? { ok: true, scope: r.lesson.scope, expires: r.lesson.expires ? "set" : null, status: r.lesson.status } : r; },
  applicableLessons: (i) => LS.applicable(i.rows, i.context, new Date(i.now || Date.now())).map((r) => r.id),
  resolveAgainstInstruction: (i) => LS.resolveAgainstInstruction(i.lessons, i.instruction),
  dedupe: (i) => { const r = LS.dedupe(i.rows); return { n: r.rows.length, seen: r.rows.map((x) => x.seen) }; },
  sweep: (i) => { const r = LS.sweep(i.rows, new Date(i.now)); return { kept: r.keep.map((x) => x.id), expired: r.expired.map((x) => x.id), review_due: r.review_due }; },
  agentContext: (i) => ({ agent: TA.agentContext(i.env) }),
  gate: (i) => gateScenario(i),
};

function gateScenario(s) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-gate-"));
  const prev = process.env.RASANAI_TEST_APPROVAL_DIR;
  process.env.RASANAI_TEST_APPROVAL_DIR = dir;
  try {
    const body = s.approval ? { schema_version: 1, consent: s.approval.consent, candidate: s.approval.candidate, kinds: s.approval.kinds, cases: s.approval.cases, commands: s.approval.commands || [], limits: { providers: [], paid_allowed: false, max_wall_s_total: null, max_parallel: 1, ...(s.approval.limits || {}) }, repairs_included: !!s.approval.repairs_included, expires_at: s.approval.expires_at || null } : null;
    TA.writeSealedForTest(dir, body, { forged: s.seal === "forged", withdrawn: !!s.withdrawn });
    if (s.seal === "none") fs.rmSync(path.join(dir, ".seal-key"), { force: true });
    const r = TA.authorize(s.request, { cand: s.current_candidate, isAncestor: () => !!s.ancestor, dryRun: true });
    return { allowed: r.allowed, reason: r.reason || null, lineage: r.lineage || null };
  } finally { if (prev === undefined) delete process.env.RASANAI_TEST_APPROVAL_DIR; else process.env.RASANAI_TEST_APPROVAL_DIR = prev; fs.rmSync(dir, { recursive: true, force: true }); }
}

function runScenario(sc) {
  const fn = CALLS[sc.call];
  if (!fn) return { ok: false, errors: [`unknown call ${sc.call}`] };
  let got;
  try { got = fn(resolveRefs(sc.input || {})); } catch (e) {
    if (sc.expect && sc.expect.throws) return { ok: String(e.message).toLowerCase().includes(String(sc.expect.throws).toLowerCase()), errors: String(e.message).toLowerCase().includes(String(sc.expect.throws).toLowerCase()) ? [] : [`threw "${e.message}", expected "${sc.expect.throws}"`] };
    return { ok: false, errors: [`threw: ${e.message}`] };
  }
  if (sc.expect && sc.expect.throws) return { ok: false, errors: [`expected a throw containing "${sc.expect.throws}"`] };
  const errs = matches(got, sc.expect || {});
  return { ok: !errs.length, errors: errs };
}

async function main() {
  const cmd = args._[0], sub = args._[1];
  if (cmd === "registry") {
    let rows = registry();
    if (args.plan && args.plan !== true) rows = rows.filter((r) => r.plan === `plan${String(args.plan).padStart(2, "0")}`);
    if (args.json) return out({ status_default: INITIAL_STATUS, total: rows.length, fixture_pending: rows.filter((r) => r.fixture_state).map((r) => r.id), cases: rows });
    for (const r of rows) console.log(`${r.id.padEnd(12)} ${r.group.padEnd(11)} ${(r.fixture_state || r.fixtures.join(", ")).padEnd(40)} ${r.name}`);
    return console.log(`\n${rows.length} cases; none run; every status ${INITIAL_STATUS}`);
  }
  if (cmd === "inventory") {
    const inv = inventory();
    const o = { candidate: TA.candidate(), approval_state: TA.status().state, execution_token: null, note: "A proposal only. No approval is recorded by this command; recording needs the user's explicit approval at a terminal.", groups: inv };
    if (args.json) return out(o);
    console.log(`candidate ${o.candidate.commit}  uncommitted digest ${o.candidate.digest.slice(0, 16)}  approval: ${o.approval_state}`);
    for (const g of inv) console.log(`\n[${g.group}] ${g.count} cases${g.fixture_pending.length ? `, fixture_pending: ${g.fixture_pending.join(" ")}` : ""}\n  ${g.commands.join("\n  ")}`);
    return;
  }
  if (cmd === "approval") {
    if (sub === "status") return out(TA.status());
    if (sub === "withdraw") return out(TA.withdraw(args.reason === true ? "" : args.reason));
    if (sub === "check") { const r = TA.authorize({ kinds: csv(args.kinds), cases: csv(args.cases), command: args.command === true ? "" : args.command }, { dryRun: true }); return out(r); }
    if (sub === "record") {
      const r = await TA.recordApproval({ wording: args.wording === true ? "" : args.wording, message_ref: args["message-ref"] === true ? "" : args["message-ref"], kinds: csv(args.kinds), cases: csv(args.cases), commands: args.commands && args.commands !== true ? String(args.commands).split(";;").map((x) => x.trim()).filter(Boolean) : [], providers: csv(args.providers).filter((x) => x !== "none"), paid_allowed: String(args.paid) === "true", max_wall_s_total: args["max-wall-s"], repairs_included: String(args.repairs) === "true" });
      out(r); if (!r.ok) process.exit(2); return;
    }
    return die("usage: eval.mjs approval status|check|withdraw|record ...");
  }
  if (cmd === "fixtures" && sub === "check") {
    const rows = registry().filter((r) => r.fixtures.length && (!args.plan || args.plan === true || r.plan === `plan${String(args.plan).padStart(2, "0")}`));
    TA.requireApproval({ kinds: ["unit"], cases: rows.map((r) => r.id), command: TA.commandOf(import.meta.url) }); // refuses here, before any file is read for checking
    const res = [];
    for (const r of rows) {
      const per = { id: r.id, files: [], scenarios: [] };
      for (const f of r.fixtures) {
        let j; try { j = JSON.parse(fs.readFileSync(path.join(HERE, "tests", f), "utf8")); per.files.push({ file: f, parse: "ok" }); } catch (e) { per.files.push({ file: f, parse: "failed: " + e.message }); continue; }
        if (j && j.status === "passed") per.files.push({ file: f, problem: "a fixture may not claim passed" });
        if (r.plan === "plan13" || r.plan === "plan14") for (const sc of j.scenarios || []) per.scenarios.push({ name: sc.name, ...runScenario(sc) });
      }
      per.ok = per.files.every((x) => x.parse === "ok" && !x.problem) && per.scenarios.every((x) => x.ok);
      res.push(per);
    }
    out({ cases_checked: res.length, failed: res.filter((x) => !x.ok).map((x) => x.id), results: res });
    process.exit(res.every((x) => x.ok) ? 0 : 1);
  }
  if (cmd === "corpus" && sub === "check") {
    TA.requireApproval({ kinds: ["unit"], cases: ["plan13/Q01"], command: TA.commandOf(import.meta.url) });
    const c = corpusOf();
    const v = validateCorpus(c, { generatorExamples: c.generator_examples || [] });
    const leak = scanLeakage(c.fixtures, [path.join(HERE, "..", "agents"), path.join(HERE, "..", "references"), path.join(HERE, "..", "library")]);
    out({ validation: v, generalization: generalizationEvidence(c.fixtures, c.taught_writer || []), leakage: leak });
    process.exit(v.ok && leak.ok ? 0 : 1);
  }
  die("usage: eval.mjs registry|inventory|approval ...|fixtures check|corpus check");
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) await main();
