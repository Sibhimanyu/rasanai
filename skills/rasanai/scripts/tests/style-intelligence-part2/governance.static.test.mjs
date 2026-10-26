// style-intelligence-part2 GOVERNANCE / STATIC cases (MS-59..MS-64). AUTHORED, NOT RUN.
// Read-only: reads repo files and the case registry; spawns nothing, writes nothing, no network. MS-63/MS-64 are cases whose real
// evidence needs a separately authorized comparison; here they only verify the protocol is in place and stay blocked until approved.
// Future run, only after the user approves lane "static": STYLE_PART2_APPROVED=static node --test skills/rasanai/scripts/tests/style-intelligence-part2/governance.static.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { skipUnless, REPO, SKILL, HERE } from "./fixtures.mjs";

const T = (name, fn) => test(name, { skip: skipUnless("static") }, fn);
const rd = (...p) => fs.readFileSync(path.join(...p), "utf8");
const registry = () => JSON.parse(rd(REPO, "docs", "plans", "style-intelligence-part2", "CASE_REGISTRY.json"));
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === ".git") continue; const f = path.join(dir, e.name); e.isDirectory() ? walk(f, out) : out.push(f); } return out; };

T("MS-59 no testing under another name: no hook, CI job, package script or background worker launches these cases", async () => {
  const needle = /style-intelligence-part2|STYLE_PART2_APPROVED/;
  const hits = [];
  for (const rel of [".github/workflows", ".husky", ".githooks", "scripts"]) { const d = path.join(REPO, rel); if (fs.existsSync(d)) for (const f of walk(d)) if (needle.test(rd(f))) hits.push(path.relative(REPO, f)); }
  for (const f of ["package.json", path.join("skills", "rasanai", "package.json"), "lefthook.yml", ".pre-commit-config.yaml"]) { const p = path.join(REPO, f); if (fs.existsSync(p) && needle.test(rd(p))) hits.push(f); }
  const hooks = path.join(REPO, ".git", "hooks"); // worktree .git may be a file; skip silently then (UNKNOWN: use `git rev-parse --git-path hooks` at run time).
  if (fs.existsSync(hooks) && fs.statSync(hooks).isDirectory()) for (const f of fs.readdirSync(hooks)) if (!f.endsWith(".sample") && needle.test(rd(hooks, f))) hits.push(`.git/hooks/${f}`);
  assert.deepEqual(hits, []);
  assert.equal(registry().testing_authorized, false);
});
T("MS-60 approval is scope and candidate bound: request template requires candidate, case IDs, commands, data, provider, budget, repair; records no grant", async () => {
  const doc = rd(REPO, "docs", "plans", "style-intelligence-part2", "TEST_APPROVAL_REQUEST.md");
  for (const k of [/candidate/i, /diff digest/i, /case IDs/i, /commands/i, /provider/i, /budget|allowance/i, /repair/i, /revok|withdraw/i, /pure.*(does not|not).*(render|film|provider)|unit-only/is]) assert.ok(k.test(doc), `missing ${k}`);
  assert.ok(/awaiting_test_approval/.test(doc));
  const r = registry();
  assert.ok(r.cases.every((c) => c.approval_ref === null));
  assert.equal(r.approval.granted, false);
  assert.ok(Object.values(r.lanes).every((l) => l.approved_scope === null)); // a lane approval must name case IDs; none present
});
T("MS-61 no fake capability promotion: compiled code and examples leave every state implemented_unvalidated, every case not_run, verification empty", async () => {
  const r = registry();
  assert.equal(r.cases.length, 64);
  for (const c of r.cases) { assert.equal(c.status === "not_run" || c.status === "blocked_until_separate_approval", true, c.id); assert.equal(c.observed, null, c.id); assert.deepEqual(c.evidence, [], c.id); }
  const metaDir = path.join(SKILL, "library", "styles", "meta"); // UNKNOWN: final metadata location (01_CONTRACTS allows an equivalent).
  if (fs.existsSync(metaDir)) for (const f of fs.readdirSync(metaDir).filter((x) => x.endsWith(".json"))) {
    const p = JSON.parse(rd(metaDir, f));
    assert.notEqual(p.evidence?.basis, "verified_for_scope", f);
    assert.deepEqual(p.evidence?.receipt_refs ?? [], [], f);
  }
});
T("MS-62 every live edge is wired: each profile runtime_ref exists and has a non-test importer (no helper-only completion)", async () => {
  const metaDir = path.join(SKILL, "library", "styles", "meta");
  assert.ok(fs.existsSync(metaDir), "UNKNOWN: profile metadata dir missing; M01 location to be mapped");
  const sources = walk(path.join(SKILL, "scripts")).filter((f) => /\.(mjs|js)$/.test(f) && !f.includes(`${path.sep}tests${path.sep}`));
  const body = sources.map((f) => [f, rd(f)]);
  const receipts = [];
  for (const f of fs.readdirSync(metaDir).filter((x) => x.endsWith(".json"))) {
    const p = JSON.parse(rd(metaDir, f));
    for (const ref of p.runtime_refs ?? []) {
      const abs = path.join(SKILL, ref); assert.ok(fs.existsSync(abs), `${p.id}: runtime ref missing ${ref}`);
      const base = path.basename(ref);
      const importers = body.filter(([file, src]) => file !== abs && src.includes(base)).map(([file]) => path.relative(SKILL, file));
      assert.ok(importers.length >= 1, `${p.id}: ${ref} has no non-test importer`);
      receipts.push({ profile: p.id, ref, importers });
    }
  }
  assert.ok(receipts.length >= 1); // producer/caller receipts for the lead's static wiring report
});
T("MS-63 quality measured beyond effect count: blind-comparison protocol includes quiet and high-energy briefs and forbids effect-count scoring (case stays blocked until authorized)", async () => {
  const c = registry().cases.find((x) => x.id === "MS-63");
  assert.equal(c.status, "blocked_until_separate_approval");
  const doc = rd(REPO, "docs", "plans", "style-intelligence-part2", "TEST_APPROVAL_REQUEST.md");
  assert.ok(/quiet/i.test(doc) && /high-energy/i.test(doc) && /human/i.test(doc));
  assert.ok(/not.*effect count|effect count.*not/i.test(doc));
});
T("MS-64 cost and speed measured separately: protocol names token categories, waiting/render time, cold vs warm, matched baseline; no invented savings (blocked until authorized)", async () => {
  const c = registry().cases.find((x) => x.id === "MS-64");
  assert.equal(c.status, "blocked_until_separate_approval");
  const doc = rd(REPO, "docs", "plans", "style-intelligence-part2", "TEST_APPROVAL_REQUEST.md");
  for (const k of [/token/i, /render time/i, /cold/i, /warm/i, /baseline/i, /no (invented|estimated) savings|not.*invent/i]) assert.ok(k.test(doc), `missing ${k}`);
});
