// Case registry: every deferred verification id of Plans 01-14 (the DEFERRED_TEST_MATRIX), mapped to the authored fixtures under
// scripts/tests/fixtures/planNN/. Status is ALWAYS `pending_implementation_and_user_approved_validation` here: results live in an evidence ledger written by
// approved runs, never in this file. No case is ever reported passed by this module. A case with no authored fixture is `fixture_pending`.
// Mapping order: (1) the plan's cases.json (`cases[].id` -> `fixtures[]`), (2) the explicit INFERRED table (plans 02/03, whose fixtures were named by topic,
// not by case id; marked `inferred`), (3) the numeric file prefix by naming convention (`NN-*.json`, NN = the case's ordinal), else (4) pending.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const INITIAL_STATUS = "pending_implementation_and_user_approved_validation";
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ROOT = path.resolve(HERE, "..", "tests", "fixtures");
// kind = the cheapest honest way to verify: unit (pure/schema), integration (scripts, sessions, no film), render (real renders/encodes/audio),
// gui (native app or editor), provider (live optional provider), grader (model or human review), agent_film (a real crew film trial)
const T = `
plan01 F01 unit Legacy stage mapping
plan01 F02 unit Approval invalidation
plan01 F03 integration Single session writer
plan01 F04 unit Schema migration
plan01 F05 unit Artifact version binding
plan01 F06 integration Reversible adoption
plan01 F07 unit Conflicting rule scopes
plan01 F08 integration Cross-stage interface closure
plan01 F09 unit Public-source non-direct policy branch
plan02 B01 unit Communication route
plan02 B02 unit Ambiguous launch
plan02 B03 unit Evidence integrity
plan02 B04 unit Brand authority
plan02 B05 unit Reference boundary
plan02 B06 unit Audience profile
plan02 B07 unit Protected proof and qualifier
plan02 B08 unit Fixture versus live product evidence
plan03 S01 agent_film Format contrast
plan03 S02 unit Copy versus label
plan03 S03 unit Conditional drama
plan03 S04 unit Proof scope
plan03 S05 unit Meaningful visual events
plan03 S06 integration Coherent alternatives
plan03 S07 grader Truth-preserving review
plan03 S08 agent_film ChatGPT regression
plan03 S09 unit Rule migration closure
plan03 S10 agent_film Meaningful alternative treatments
plan04 L01 render Comparable specimens
plan04 L02 integration Progressive commitment
plan04 L03 integration Visual propagation
plan04 L04 unit Continuity meaning
plan04 L05 render Brand-faithful variation
plan04 L06 integration Look revision
plan04 L07 unit Recipe rate and size conversion
plan04 L08 unit Valid restrained visual treatment
plan05 E01 integration Stage boundary
plan05 E02 unit Panels and actions
plan05 E03 unit Timing authority
plan05 E04 unit Reading time
plan05 E05 unit Editorial relationship
plan05 E06 integration Audio reconciliation
plan05 E07 render Animatic fidelity
plan05 E08 integration Structural revision
plan05 E09 integration Scratch to actual narration
plan05 E10 unit Retimed note and media ranges
plan06 V01 integration Runtime primitives
plan06 V02 render Seek behavior
plan06 V03 render Offline render
plan06 V04 unit Generated-plate provenance
plan06 V05 provider Provider uncertainty
plan06 V06 unit Tracking distinction
plan06 V07 render Screen replacement
plan06 V08 render Occlusion
plan06 V09 render Character canon
plan06 V10 integration Optional capability
plan06 V11 integration Regeneration preserves user edits
plan06 V12 unit Readiness and pinned dependencies
plan07 A01 unit Intentional sound
plan07 A02 unit Shared event timing
plan07 A03 render Offsets and tails
plan07 A04 render Voice fidelity
plan07 A05 render Local regeneration
plan07 A06 render Mix integrity
plan07 A07 render Stem and silence delivery
plan07 A08 render Local voice edit continuity
plan07 A09 unit Mix receipt matches current inputs
plan08 K01 integration Actual injected context
plan08 K02 unit Selective retrieval
plan08 K03 unit Mandatory facts preserved
plan08 K04 unit Artifact reuse
plan08 K05 unit Cache isolation
plan08 K06 integration Model/setting mapping
plan08 K07 unit Honest telemetry
plan08 K08 agent_film Efficiency comparison
plan08 K09 integration Actual context injection
plan08 K10 integration Speculation is useful and authorized
plan09 P01 unit Dependency readiness
plan09 P02 integration Useful parallelism
plan09 P03 integration Resource limits
plan09 P04 unit Lease fencing
plan09 P05 unit Transitive keys
plan09 P06 unit Atomic cache
plan09 P07 render Boundary handles
plan09 P08 render Media assembly
plan09 P09 integration Fallback truth
plan09 P10 agent_film Measured throughput
plan09 P11 integration Slot failure and memory timeout
plan09 P12 unit Concurrent budget reservation
plan09 P13 unit Resource bundle deadlock and stale owner
plan09 P14 unit Cache reuse is not creative approval
plan10 U01 gui Five-call journey
plan10 U02 gui Back navigation
plan10 U03 gui Stable panels
plan10 U04 integration Revision intent
plan10 U05 gui Pointer transform
plan10 U06 unit Stale edits
plan10 U07 integration Undo and redo
plan10 U08 gui Progress truth
plan10 U09 gui Accessibility
plan10 U10 gui Resume and optional states
plan10 U11 integration Undo earlier edit after newer edit
plan10 U12 unit Idempotency collision
plan10 U13 integration Stale preview and pointer identity
plan11 R01 integration Crash recovery
plan11 R02 integration Sleep and lease change
plan11 R03 unit External timeout
plan11 R04 unit Budget and throttling
plan11 R05 integration Disk/log faults
plan11 R06 integration File containment
plan11 R07 unit Instruction isolation
plan11 R08 unit Privacy and network
plan11 R09 unit Claims across revisions
plan11 R10 unit License inventory
plan11 R11 integration Source/log/media interrupted transaction
plan11 R12 integration Renderer credential and rights boundary
plan12 D01 unit Profile provenance
plan12 D02 render Aspect adaptation
plan12 D03 unit Variant semantics
plan12 D04 render Locale layout
plan12 D05 unit Caption timing
plan12 D06 unit Accessible alternatives
plan12 D07 integration Safe export package
plan12 D08 integration OTIO relinking
plan12 D09 gui Editor compatibility
plan12 D10 integration Export dependency closure
plan12 D11 unit Interchange loss report
plan13 Q01 unit Case provenance
plan13 Q02 unit Format rubrics
plan13 Q03 unit Grader failure sensitivity
plan13 Q04 unit Blind review
plan13 Q05 unit Human distinction
plan13 Q06 unit Fair baseline
plan13 Q07 unit Metrics completeness
plan13 Q08 unit Scoped learning
plan13 Q09 grader Held-out valid calm films
plan13 Q10 unit Controlled comparison attribution
plan14 G01 unit Missing or agent-created testing permission
plan14 G02 unit Narrow approval and revision lineage
plan14 G03 unit Indirect testing and revocation
`;
export const CASES = T.trim().split("\n").map((l) => { const [plan, code, kind, ...n] = l.split(" "); return { id: `${plan}/${code}`, plan, code, kind, name: n.join(" "), ordinal: Number(code.slice(1)) }; });
export const GROUPS = ["unit", "integration", "render", "gui", "provider", "grader", "agent_film"];

// plans 02 and 03 were authored with topic file names, no case ids inside: this mapping is INFERRED from the file names (flagged, never silent)
const INFERRED = {
  "plan02/B01": ["footage-led.json"], "plan02/B02": ["ambiguous-launch.json"], "plan02/B03": ["conflicting-sources.json"], "plan02/B04": ["supplied-brand-kit.json"],
  "plan02/B06": ["multi-locale.json"], "plan02/B07": ["stale-product-claim.json"], "plan02/B08": ["synthetic-chatgpt-evidence.json"],
  "plan03/S01": ["02-valid-identity-abstraction.json", "03-valid-broad-multi-use.json", "01-valid-feature-demo-no-twist.json"], "plan03/S02": ["05-negative-vague-labels.json"],
  "plan03/S03": ["01-valid-feature-demo-no-twist.json"], "plan03/S04": ["03-valid-broad-multi-use.json"], "plan03/S06": ["07-chatgpt-synthetic-treatment-set.json"],
  "plan03/S07": ["05-negative-vague-labels.json"], "plan03/S08": ["07-chatgpt-synthetic-treatment-set.json", "evidence-synthetic.json"], "plan03/S09": ["01-valid-feature-demo-no-twist.json", "04-valid-simple-opening.json"],
  "plan03/S10": ["07-chatgpt-synthetic-treatment-set.json"],
};
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

export function fixturesFor(c, root = FIXTURE_ROOT) {
  const dir = path.join(root, c.plan);
  if (!fs.existsSync(dir)) return { fixtures: [], how: "fixture_pending" };
  const have = new Set(fs.readdirSync(dir).filter((f) => f.endsWith(".json")));
  const idx = readJ(path.join(dir, "cases.json"));
  const hit = idx && Array.isArray(idx.cases) ? idx.cases.find((x) => x.id === c.id) : null;
  if (hit) { const fx = (hit.fixtures || []).filter((f) => have.has(f)); if (fx.length) return { fixtures: fx.map((f) => path.join("scripts/tests/fixtures", c.plan, f)), how: "cases.json" }; }
  if (INFERRED[c.id]) { const fx = INFERRED[c.id].filter((f) => have.has(f)); if (fx.length) return { fixtures: fx.map((f) => path.join("scripts/tests/fixtures", c.plan, f)), how: "inferred_from_filename" }; }
  const pre = String(c.ordinal).padStart(2, "0") + "-";
  if (!INFERRED[c.id] && !["plan02", "plan03"].includes(c.plan)) { const fx = [...have].filter((f) => f.startsWith(pre)); if (fx.length) return { fixtures: fx.map((f) => path.join("scripts/tests/fixtures", c.plan, f)), how: "naming_convention" }; }
  return { fixtures: [], how: "fixture_pending" };
}

export function registry({ root = FIXTURE_ROOT } = {}) {
  return CASES.map((c) => { const m = fixturesFor(c, root); return { id: c.id, plan: c.plan, name: c.name, group: c.kind, status: INITIAL_STATUS, fixtures: m.fixtures, fixture_mapping: m.how, ...(m.fixtures.length ? {} : { fixture_state: "fixture_pending" }) }; });
}
export const pending = (o) => registry(o).filter((r) => r.fixture_state === "fixture_pending").map((r) => r.id);

// exact proposed test inventory by group (unit/schema first); the commands are the real entrypoints found in this checkout.
// `fixtures check` is the structural fixture check in scripts/eval.mjs; per-case execution of data fixtures has no other runner here and is written under approval.
export const COMMAND_HINTS = {
  unit: ["node skills/rasanai/scripts/eval.mjs fixtures check", "cd apps/macos && swift test (StudioCore unit tests, incl. Plan10Tests)"],
  integration: ["node skills/rasanai/scripts/selftest.mjs --quick"],
  render: ["node skills/rasanai/scripts/selftest.mjs"],
  gui: ["manual native Studio journey on a built app in a disposable library (no command)"],
  provider: ["per-provider minimal authorized sample (no command until a provider is approved)"],
  grader: ["blind review packets from lib/blind-review.mjs, graded in an independent context, then a person"],
  agent_film: ["bounded crew film trials per Plan 14 T6/T9 (pre-registered; no command until scoped)"],
};
export function inventory(o) {
  const reg = registry(o);
  return GROUPS.map((g) => { const rows = reg.filter((r) => r.group === g); return { group: g, count: rows.length, cases: rows.map((r) => r.id), fixture_pending: rows.filter((r) => r.fixture_state).map((r) => r.id), commands: COMMAND_HINTS[g] }; });
}
