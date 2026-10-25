// Testing approval gate (Plan 13 handoff; Plan 14 T0). Refuses to dispatch any test, render, provider, GUI, grader or benchmark job unless a real
// user-approval record exists and the request is inside its scope. Nothing here runs a test; it only decides whether one may start.
//
//  - A record lives OUTSIDE the repo ($RASANAI_TEST_APPROVAL_DIR or <state dir>/test-approval/approval.json) and is sealed (HMAC with a key created
//    when a person records it). Agent-written JSON has no valid seal, so it is not consent. It must also carry the user's wording or a message reference.
//  - Recording needs an interactive terminal and a typed confirmation that names the candidate digest. It refuses inside an agent process (Claude Code,
//    Conductor, Codex, CI) and when there is no TTY. HONEST LIMIT: the seal key sits in the same account, so this stops accidental dispatch and agent
//    shortcuts, not a determined local process that reads the key.
//  - Scope never grows: kinds, case ids and commands are explicit lists (no wildcards). A different candidate (commit + uncommitted diff digest)
//    needs a new approval unless the approval says repairs are included and the approved commit is still an ancestor of HEAD.
//  - Withdrawal stops new dispatch at once (`withdraw` needs no TTY: stopping is always allowed). Already-owned active work is the caller's to stop;
//    `isWithdrawn()` is the check a long-running owner polls.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { STATE_DIR } from "./common.mjs";

export const SCHEMA_VERSION = 1;
export const KINDS = ["unit", "integration", "render", "gui", "provider", "grader", "agent_film", "benchmark"];
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export const approvalDir = () => process.env.RASANAI_TEST_APPROVAL_DIR || path.join(STATE_DIR, "test-approval");
const fileOf = (n) => path.join(approvalDir(), n);
const sha = (x) => crypto.createHash("sha256").update(x).digest("hex");

// agent / CI / hook contexts may never record consent
export function agentContext(env = process.env) {
  const hit = Object.keys(env).filter((k) => /^(CLAUDECODE|CLAUDE_CODE_|CONDUCTOR_|CODEX_|CI$|GITHUB_ACTIONS$)/.test(k) && env[k]);
  return hit.length ? hit : null;
}

function git(args, cwd = REPO) { return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); }

// candidate = HEAD commit + digest of tracked changes + names/hashes of untracked files (read-only git; nothing executes)
export function candidate(repo = REPO) {
  let commit = null, diff = "", untracked = [];
  try { commit = git(["rev-parse", "HEAD"], repo).trim(); } catch {}
  try { diff = git(["diff", "HEAD", "--binary"], repo); } catch {}
  try { untracked = git(["ls-files", "--others", "--exclude-standard"], repo).split("\n").filter(Boolean).sort(); } catch {}
  const h = crypto.createHash("sha256"); h.update(diff);
  for (const f of untracked) {
    h.update("\0" + f + "\0");
    try { const p = path.join(repo, f); const st = fs.statSync(p); h.update(st.size <= 5 * 1024 * 1024 ? fs.readFileSync(p) : `size:${st.size}`); } catch {}
  }
  return { commit, uncommitted_diff_sha256: sha(diff), digest: h.digest("hex"), untracked_count: untracked.length };
}

const canonical = (o) => JSON.stringify(o, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v));
function keyBytes(create) {
  const f = fileOf(".seal-key");
  try { return fs.readFileSync(f); } catch {}
  if (!create) return null;
  fs.mkdirSync(approvalDir(), { recursive: true });
  const k = crypto.randomBytes(32); fs.writeFileSync(f, k, { mode: 0o600 }); return k;
}
const seal = (body, key) => crypto.createHmac("sha256", key).update(canonical(body)).digest("hex");

const list = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
function ledger(row) { try { fs.mkdirSync(approvalDir(), { recursive: true }); fs.appendFileSync(fileOf("ledger.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n"); } catch {} }
export function readLedger() { try { return fs.readFileSync(fileOf("ledger.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } }

export function loadApproval() {
  let rec; try { rec = JSON.parse(fs.readFileSync(fileOf("approval.json"), "utf8")); } catch { return { record: null, why: "no_approval_record" }; }
  const key = keyBytes(false);
  if (!key || !rec || !rec.seal || !rec.body) return { record: null, why: "seal_missing: not a person-recorded approval (agent-created JSON is not consent)" };
  const ok = (() => { try { return crypto.timingSafeEqual(Buffer.from(rec.seal, "hex"), Buffer.from(seal(rec.body, key), "hex")); } catch { return false; } })();
  return ok ? { record: rec.body } : { record: null, why: "seal_invalid: the record was edited or not recorded by a person" };
}
export function isWithdrawn() { try { return !!JSON.parse(fs.readFileSync(fileOf("withdrawn.json"), "utf8")).at; } catch { return false; } }

// Validate and build the body a person is about to approve (pure; no I/O except candidate())
export function buildApproval({ wording = "", message_ref = "", cases = [], kinds = [], commands = [], providers = [], paid_allowed = false, max_wall_s_total = null, max_parallel = 1, repairs_included = false, expires_at = null, cand = candidate() } = {}) {
  const errors = [];
  if (!String(wording).trim() && !String(message_ref).trim()) errors.push("consent needs the user's exact wording or a conversation/message reference");
  const k = list(kinds), c = list(cases), cmd = list(commands);
  if (!k.length || k.some((x) => !KINDS.includes(x))) errors.push(`kinds must be a non-empty subset of ${KINDS.join(", ")}`);
  if (!c.length && !cmd.length) errors.push("approve explicit cases and/or exact commands");
  if ([...c, ...cmd].some((x) => /[*?]/.test(x))) errors.push("no wildcards: a narrow approval never expands");
  if (!cand.commit) errors.push("no candidate commit found");
  if (errors.length) return { ok: false, errors };
  return { ok: true, body: { schema_version: SCHEMA_VERSION, consent: { channel: "user_tty_confirmation", wording: String(wording), message_ref: String(message_ref), approved_at: new Date().toISOString() }, candidate: cand, kinds: k, cases: c, commands: cmd, limits: { providers: list(providers), paid_allowed: !!paid_allowed, max_wall_s_total: max_wall_s_total == null ? null : Number(max_wall_s_total), max_parallel: Number(max_parallel) || 1 }, repairs_included: !!repairs_included, expires_at } };
}

// Person-only recording: TTY + typed confirmation; refused for agents and CI
export async function recordApproval(opts, { input = process.stdin, output = process.stderr, env = process.env } = {}) {
  const agent = agentContext(env);
  if (agent) return { ok: false, errors: [`refused: running inside an agent/CI context (${agent.join(", ")}); only a person at a terminal can record consent`] };
  if (!input.isTTY) return { ok: false, errors: ["refused: needs an interactive terminal; a pipe or script is not a person approving"] };
  const b = buildApproval(opts);
  if (!b.ok) return b;
  const want = "APPROVE " + b.body.candidate.digest.slice(0, 8);
  output.write(`\nTest approval to record\n  candidate  ${b.body.candidate.commit.slice(0, 12)} + uncommitted ${b.body.candidate.digest.slice(0, 12)}\n  kinds      ${b.body.kinds.join(", ")}\n  cases      ${b.body.cases.length}\n  commands   ${b.body.commands.length}\n  limits     ${JSON.stringify(b.body.limits)}\nType exactly "${want}" to record: `);
  const rl = readline.createInterface({ input, output });
  const line = await new Promise((r) => rl.question("", r)); rl.close();
  if (String(line).trim() !== want) return { ok: false, errors: ["confirmation did not match; nothing recorded"] };
  const key = keyBytes(true);
  fs.mkdirSync(approvalDir(), { recursive: true });
  fs.writeFileSync(fileOf("approval.json"), JSON.stringify({ body: b.body, seal: seal(b.body, key) }, null, 2));
  try { fs.rmSync(fileOf("withdrawn.json"), { force: true }); } catch {}
  ledger({ event: "recorded", candidate: b.body.candidate.digest, cases: b.body.cases.length, kinds: b.body.kinds });
  return { ok: true, recorded: true, candidate: b.body.candidate };
}

export function withdraw(reason = "") {
  fs.mkdirSync(approvalDir(), { recursive: true });
  fs.writeFileSync(fileOf("withdrawn.json"), JSON.stringify({ at: new Date().toISOString(), reason: String(reason) }));
  ledger({ event: "withdrawn", reason: String(reason) });
  return { ok: true, note: "no new test, render, provider, GUI or benchmark job will dispatch; stop active owned work through its own owner" };
}

const gitAncestor = (a, repo = REPO) => { try { git(["merge-base", "--is-ancestor", a, "HEAD"], repo); return true; } catch { return false; } };

// req: { kinds:[...] (all must be approved), cases:[...], command:"", provider:null, paid:false, est_wall_s:0 }
export function authorize(req = {}, { repo = REPO, now = new Date(), cand = null, dryRun = false, isAncestor = gitAncestor } = {}) {
  const refuse = (reason) => { if (!dryRun) ledger({ event: "refused", reason, req: { kinds: req.kinds, cases: list(req.cases).length, command: req.command } }); return { allowed: false, reason }; };
  const { record: a, why } = loadApproval();
  if (!a) return refuse(why);
  try { if (JSON.parse(fs.readFileSync(fileOf("withdrawn.json"), "utf8")).at) return refuse("withdrawn: approval withdrawn; no new dispatch"); } catch {}
  if (a.schema_version !== SCHEMA_VERSION) return refuse("unsupported_approval_schema");
  if (!a.consent || !(a.consent.wording || a.consent.message_ref) || !a.consent.approved_at) return refuse("consent_incomplete");
  if (a.expires_at && new Date(a.expires_at) < now) return refuse("expired");
  const kinds = list(req.kinds); if (!kinds.length) return refuse("request names no kind");
  const bad = kinds.filter((k) => !a.kinds.includes(k)); if (bad.length) return refuse(`kind_not_approved: ${bad.join(", ")} (a narrow approval does not expand)`);
  const cases = list(req.cases), outside = cases.filter((c) => !a.cases.includes(c));
  if (outside.length) return refuse(`case_not_approved: ${outside.slice(0, 5).join(", ")}`);
  if (req.command && !a.commands.includes(String(req.command))) return refuse(`command_not_approved: ${req.command}`);
  if (!cases.length && !req.command) return refuse("request names neither approved cases nor an approved command");
  if (req.provider && !a.limits.providers.includes(String(req.provider))) return refuse(`provider_not_approved: ${req.provider}`);
  if (req.paid && !a.limits.paid_allowed) return refuse("paid_work_not_approved");
  if (a.limits.max_wall_s_total != null) {
    const used = readLedger().filter((r) => r.event === "dispatched" && r.since === a.consent.approved_at).reduce((s, r) => s + (Number(r.est_wall_s) || 0), 0);
    if (used + (Number(req.est_wall_s) || 0) > a.limits.max_wall_s_total) return refuse("resource_limit: approved wall-clock budget would be exceeded; ask again");
  }
  const cur = cand || candidate(repo);
  let lineage = null;
  if (cur.digest !== a.candidate.digest) {
    if (a.repairs_included && a.candidate.commit && isAncestor(a.candidate.commit, repo)) lineage = { approved: a.candidate.digest, current: cur.digest };
    else return refuse("candidate_changed: the commit or uncommitted diff differs from the approved candidate; a materially different implementation needs a new approval");
  }
  if (!dryRun) ledger({ event: "dispatched", since: a.consent.approved_at, kinds, cases, command: req.command || null, provider: req.provider || null, est_wall_s: Number(req.est_wall_s) || 0, lineage });
  return { allowed: true, lineage };
}

export const commandOf = (importMetaUrl, argv = process.argv.slice(2)) => ["node", path.relative(REPO, fileURLToPath(importMetaUrl)), ...argv].join(" ");

// Entrypoint guard: call first thing. Prints the refusal and exits 3 without doing any work.
export function requireApproval(req, opts) {
  const r = authorize(req, opts);
  if (r.allowed) return r;
  process.stderr.write(JSON.stringify({ ok: false, refused: true, gate: "testing approval", reason: r.reason, how: "Testing needs the user's explicit approval for this exact candidate, case and command. See docs/plans/AWAITING_TEST_APPROVAL.md. Nothing was run." }) + "\n");
  process.exit(3);
}

export function status({ repo = REPO } = {}) {
  const { record, why } = loadApproval();
  const w = (() => { try { return JSON.parse(fs.readFileSync(fileOf("withdrawn.json"), "utf8")); } catch { return null; } })();
  return { state: !record ? "awaiting_test_approval" : w ? "withdrawn" : "approved", why: record ? null : why, approval: record ? { approved_at: record.consent.approved_at, kinds: record.kinds, cases: record.cases.length, commands: record.commands, limits: record.limits, repairs_included: record.repairs_included } : null, current_candidate: candidate(repo), candidate_matches: record ? candidate(repo).digest === record.candidate.digest : null, host: { platform: os.platform(), node: process.version } };
}

// Fixture support ONLY (Plan 13 G01-G03 are run in a throwaway directory): seals a body into a directory under the OS temp folder. Refuses anywhere else, so it
// cannot be used to forge the real approval in the state directory.
export function writeSealedForTest(dir, body, { forged = false, withdrawn = false } = {}) {
  const d = path.resolve(dir);
  if (!d.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("test sealing is only allowed under the OS temp directory");
  fs.mkdirSync(d, { recursive: true });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(path.join(d, ".seal-key"), key, { mode: 0o600 });
  if (body) fs.writeFileSync(path.join(d, "approval.json"), JSON.stringify({ body, seal: forged ? "00".repeat(32) : seal(body, key) }));
  if (withdrawn) fs.writeFileSync(path.join(d, "withdrawn.json"), JSON.stringify({ at: new Date().toISOString() }));
  return d;
}
