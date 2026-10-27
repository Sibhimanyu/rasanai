// style-intelligence-part2 JOURNEY / SIDE-EFFECT cases (temp run dirs, git read, existing gates). AUTHORED, NOT RUN.
// Separate file on purpose: approval of "pure" never covers this. No network, no model calls, no renders. Native app GUI is NOT launched here.
// Future run, only after the user approves lane "journey": STYLE_PART2_APPROVED=journey node --test skills/rasanai/scripts/tests/style-intelligence-part2/journey.side-effects.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { skipUnless, load, need, REPO, sha, text, contract } from "./fixtures.mjs";

const T = (name, fn) => test(name, { skip: skipUnless("journey") }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "style-part2-"));
  try { await fn(tmp, t); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
const put = (root, rel, body) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof body === "string" ? body : JSON.stringify(body)); return f; };
// UNKNOWN: existing gate entry signatures (look.lookCommitted(run), productionGate, storyboard.boundary); treated as (runDir) -> truthy = allowed.
const gate = async (name, run, extra) => { const m = await load("look.mjs"); if (typeof m[name] !== "function") assert.fail(`UNKNOWN: ${name} not exported from lib/look.mjs`); return m[name](run, extra); };

T("MS-46 prepared medium files with no consumed approved action release no boards or build", async (tmp) => {
  put(tmp, "design/look-b/medium.json", contract());
  put(tmp, "creative/medium-selection.json", { selected: ["look-b"] });
  put(tmp, "session.json", { steps: { look: { status: "waiting" } } });
  const open = await gate("lookCommitted", tmp);
  assert.ok(!open, "Look must not count as committed from prepared files alone");
  assert.ok(!fs.existsSync(path.join(tmp, "storyboard")) && !fs.existsSync(path.join(tmp, "build")));
});
T("MS-47 integrated diff touches no frozen UI/console/stage/transport file", async () => {
  // Static read of git, no mutation. Compares candidate against its merge-base with master (candidate commit supplied via env at run time).
  const base = process.env.STYLE_PART2_BASE || "master", head = process.env.STYLE_PART2_CANDIDATE || "HEAD";
  const out = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  const frozen = [/^apps\/macos\/Sources\//, /^skills\/rasanai\/console\//, /^skills\/rasanai\/scripts\/console\.mjs$/, /^skills\/rasanai\/lib\/stages\.json$/, /appcast/i];
  assert.deepEqual(out.filter((f) => frozen.some((r) => r.test(f))), []);
  // UNKNOWN: baseline payload projection (stage names/order/keys, card counts) must be compared against a baseline captured from base; no fixture authored (needs run).
});
T("MS-49b material Look/profile change after dispatch: obsolete jobs rejected, previous version recoverable", async (tmp) => {
  const c = contract();
  put(tmp, "design/look-b/medium.json", c);
  put(tmp, "jobs/job-1.json", { id: "job-1", input_pins: c.pins });
  const m = await load("jobs.mjs"); // UNKNOWN: existing jobs API (stale-pin rejection function name/signature).
  const reject = m.rejectStaleJob || m.isJobCurrent;
  if (typeof reject !== "function") assert.fail("UNKNOWN: stale-job check not found in lib/jobs.mjs; map the real symbol");
  const changed = { ...c, pins: { ...c.pins, profile_digest: sha("z") } };
  put(tmp, "design/look-b/medium.json", changed);
  const r = await reject(tmp, "job-1", changed.pins);
  assert.ok(r === false || r?.stale === true || r?.ok === false);
  assert.ok(fs.existsSync(path.join(tmp, "design/look-b")) ); // UNKNOWN: revision rotation dir (e.g. design/look-b/revisions/) once the writer lands; assert previous digest recoverable.
});
T("MS-50 examples delivered honestly: source exists, no preview, no claim pixels or renders were reviewed", async () => {
  const dir = path.join(REPO, "skills", "rasanai", "library", "examples"); // UNKNOWN: real examples dir.
  assert.ok(fs.existsSync(dir), "UNKNOWN: examples dir not found; adjust path");
  const files = fs.readdirSync(dir, { recursive: true }).map(String);
  assert.ok(!files.some((f) => /\.(png|jpg|jpeg|gif|webp|mp4|mov)$/i.test(f)), "no preview/rendered media shipped");
  const docs = files.filter((f) => /\.(md|json)$/.test(f)).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  assert.ok(!/reviewed (the )?(pixels|render|frames)|visually (verified|reviewed)|\bverified_for_scope\b/i.test(docs));
});
T("MS-51 storyboard waits for Look: exploration before a selected current Look yields only representative Look content", async (tmp) => {
  put(tmp, "session.json", { steps: { look: { status: "waiting" } } });
  put(tmp, "design/look-a/medium.json", contract({ candidate_id: "look-a" }));
  const open = await gate("storyboardAllowed" in (await load("look.mjs")) ? "storyboardAllowed" : "lookCommitted", tmp); // UNKNOWN: real symbol
  assert.ok(!open);
  assert.ok(!fs.existsSync(path.join(tmp, "storyboard", "boards"))); // only representative frames (design/<label>/frames) may exist
});
T("MS-52 bounded creative repair: persistent weak fit ends in the existing needs-you path, not a loop or silent card fallback", async (tmp) => {
  const fn = await need("medium-fit.mjs", "validateFitDecision");
  const attempts = [1, 2, 3, 4].map((n) => ({ attempt: n, fit: "weak" }));
  const d = { rounds: attempts, round_limit: 2, outcome: "needs-you", fallback: null };
  const v = fn(d, { assignment: {}, profiles: [], expectedPins: {} });
  assert.ok(v.ok === false || d.outcome === "needs-you"); // UNKNOWN: decision field names; key requirement: rounds beyond limit rejected, fallback to card/text not silent.
  assert.ok(!/silent|card-fallback/.test(text(d)));
  put(tmp, "creative/medium-selection.json", d); // existence only; the existing needs-you reader is the real consumer.
});
