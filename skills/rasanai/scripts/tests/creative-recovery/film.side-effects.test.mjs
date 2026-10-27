// creative-recovery SIDE-EFFECTING / host cases. AUTHORED, NOT RUN. Separate from pure.test.mjs on purpose so a narrow
// approval of "units" never covers this file. These create temp run dirs (os.tmpdir, removed afterwards) and some need the
// app/console/render host. Nothing here runs at import. No network, no model calls unless a case says so in manifest.json.
// Future run (only after the user approves lane "film"): CREATIVE_RECOVERY_APPROVED=film node --test skills/rasanai/scripts/tests/creative-recovery/film.side-effects.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { skipUnless, load, HERE, sha, brief, pin, mapping } from "./fixtures.mjs";

const S = { skip: skipUnless("film") };
const T = (name, fn, extra = {}) => test(name, { ...S, ...extra }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "creative-recovery-"));
  try { await fn(tmp, t); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
const put = (root, rel, body) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof body === "string" ? body : JSON.stringify(body)); return f; };
const CONSOLE = path.join(HERE, "..", "..", "console.mjs");
const look = () => load("look.mjs");

// UNKNOWN: the existing gate entry points' exact signatures (look.lookCommitted(run), productionGate, storyboard.boundary).
// These cases call them with (runDir) and treat a thrown/blocked result as "blocked"; adjust to the real signatures when reading HEAD.
const gate = async (name, run, extra) => { const m = await look(); const f = m[name]; if (typeof f !== "function") assert.fail(`UNKNOWN: ${name} not exported from lib/look.mjs`); return f(run, extra); };

T("C12b brief pin change preserves the previous accepted artifact on disk", async (tmp) => {
  put(tmp, "creative/brief.json", brief({ revision: 1 }));
  put(tmp, "story/accepted.json", { v: 1 });
  const c = await load("creative-contract.mjs");
  assert.ok(typeof c.creativePinsCurrent === "function");
  // UNKNOWN: the writer API that rotates revisions into creative/revisions/ (W03). Expectation: after a new revision, revisions/ holds r1 and story/accepted.json is untouched.
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "story/accepted.json"), "utf8")).v, 1);
});

T("C17 representative Look frame allowed after Story; full storyboard blocked before Look choice", async (tmp) => {
  put(tmp, "session.json", { steps: { story: { status: "done" }, look: { status: "waiting" } } });
  put(tmp, "look/DESIGN.md", "# candidate");
  const full = await gate("lookCommitted", tmp);
  assert.ok(!full || full.committed === false || full === false);
  // UNKNOWN: the API that permits ONE representative frame pre-Look (W05). Expect allowed; full boards remain blocked.
});

T("C18 Look current but no Storyboard approval -> build waits, no fake final gate", async (tmp) => {
  put(tmp, "session.json", { steps: { look: { status: "done" }, storyboard: { status: "waiting" } } });
  const g = await gate("productionGate", tmp);
  assert.ok(g && (g.ok === false || g.blocked === true || g.wait)); // UNKNOWN: result shape.
  assert.ok(!fs.existsSync(path.join(tmp, "final")));
});

T("C20 fast/lean/direct scheduling keeps choices, selected boards and independent review", async (tmp) => {
  // Needs productionPolicy() from the existing budget code. UNKNOWN module path; expected: alternatives counts equal the non-lean policy; board + review flags still true.
  const m = await load("budget.mjs");
  assert.ok(typeof m.productionPolicy === "function", "UNKNOWN: productionPolicy export");
  const base = m.productionPolicy({}), lean = m.productionPolicy({ pace: "fast" }); // UNKNOWN: arg shape
  assert.equal(lean.storyAlternatives ?? lean.story, base.storyAlternatives ?? base.story);
  assert.equal(lean.lookAlternatives ?? lean.look, base.lookAlternatives ?? base.look);
});

T("C21 legacy saved session (no new marker) opens read-only; no approval migration", async (tmp) => {
  const sess = { steps: { look: { status: "done" } } };
  const f = put(tmp, "session.json", sess);
  const before = fs.readFileSync(f, "utf8");
  const l = await look();
  const r = l.resolveStageConsent({ stage: "look", expectedDigest: sha("l"), session: sess, appliedActions: [], approvals: [], explicitDelegations: [] });
  assert.equal(r.confirmed, false);
  assert.equal(fs.readFileSync(f, "utf8"), before); // nothing rewritten
  assert.deepEqual(fs.readdirSync(tmp).sort(), ["session.json"]);
});

T("C22 native/browser payload compatibility: existing keys/actions unchanged, no new screen needed", async (tmp) => {
  // Host: snapshot of console payloads (RASANAI_CONSOLE_HEADLESS=1) compared with a stored pre-change baseline. UNKNOWN: baseline file; none exists yet -> case is BLOCKED until the lead captures one from the pre-change HEAD.
  const base = path.join(HERE, "baselines", "console-payload-keys.json");
  assert.ok(fs.existsSync(base), "UNKNOWN: no baseline payload key list captured at pre-change HEAD");
  const keys = JSON.parse(fs.readFileSync(base, "utf8"));
  assert.ok(Array.isArray(keys.sessionKeys) && Array.isArray(keys.actionKinds));
  assert.ok(fs.existsSync(CONSOLE));
  // Then: spawn console.mjs headless on a fixture run, assert keys superset of baseline and action kinds equal.
});

T("C35 installed bundled engine older than source -> report exact versions, not taste", async (tmp) => {
  // Host: reads skills/rasanai engine version vs the bundled engine in the installed Studio. UNKNOWN: both locations/version fields. Case is HOST-DEPENDENT.
  assert.fail("UNKNOWN: version sources not identified; run manually: compare engine version in repo vs /Applications Studio bundle, expect a mismatch report naming both.");
});

T("C36 unauthorized test/build/hook invocation -> handoff stops, permission not inferred", async (tmp) => {
  const doc = fs.readFileSync(path.join(HERE, "..", "..", "..", "..", "..", "docs", "plans", "creative-recovery", "TEST_APPROVAL_REQUEST.md"), "utf8");
  assert.match(doc, /awaiting_test_approval/);
  assert.match(doc, /No testing has been approved/i);
  // Also: no package.json/CI/hook file references creative-recovery (static scan).
  const root = path.join(HERE, "..", "..", "..", "..", "..");
  for (const f of ["package.json", ".github/workflows", ".husky"]) {
    const p = path.join(root, f); if (!fs.existsSync(p)) continue;
    const files = fs.statSync(p).isDirectory() ? fs.readdirSync(p).map((x) => path.join(p, x)) : [p];
    for (const x of files) if (fs.statSync(x).isFile()) assert.ok(!/creative-recovery/.test(fs.readFileSync(x, "utf8")), x);
  }
});
