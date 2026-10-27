// Effective creative policy (v3, W01). One PURE resolver: no network, no model, no CLI, no file I/O, no clock.
//
//   resolveCreativePolicy({ settings, constraints, communicationKind, approvedRefs, capabilities })
//        -> { status, policy, fields, rules, conflicts, reasons, digest }
//   policyDigest(policy) / explainPolicy(policy) / effectivePolicyDoc(resolution) / checkPolicyDigest(plan, sidecar)
//   CREATIVE_ERROR_CODES                the 14 stable codes every other v3 lane imports
//   SUPPORTED_POLICY_REVISIONS, policyRevisionOf(plan), creativePolicyOn(plan)   explicit revision reader (1 legacy, 2 v3)
//   INTEGRATION_PROPOSALS               exact entrypoint + native prompt replacement text for the lead / INT workers (data only)
//
// It EXTENDS the existing production policy (rules.mjs productionPolicy/fromLegacy); it is not a second planner.
// Revision 1 returns the legacy production policy unchanged (no creative section). Revision 2 adds `policy.creative_v3`.
// Consumers: INT-ENGINE-A (crew.mjs `plan` writes crew/plan.json + creative/effective-policy.json; creative-run.mjs reads the revision),
// packet assembly (applicable rules + provenance), receipts (digest), INT-NATIVE (INTEGRATION_PROPOSALS text). Not wired by this file.
import { createHash } from "node:crypto";
import { productionPolicy, fromLegacy, PACE_TO_BUDGET } from "./rules.mjs";

export const CREATIVE_ERROR_CODES = Object.freeze({
  policy_conflict: "policy_conflict",
  unsupported_policy: "unsupported_policy",
  required_commitment_unbound: "required_commitment_unbound",
  intentional_absence_unresolved: "intentional_absence_unresolved",
  owner_missing: "owner_missing",
  continuity_cycle: "continuity_cycle",
  medium_unresolved: "medium_unresolved",
  capability_unavailable: "capability_unavailable",
  stale_input: "stale_input",
  temporal_evidence_missing: "temporal_evidence_missing",
  material_deviation: "material_deviation",
  approval_missing: "approval_missing",
  budget_exhausted: "budget_exhausted",
  not_assessable: "not_assessable",
});

export const SUPPORTED_POLICY_REVISIONS = Object.freeze([1, 2]);
export const POLICY_SECTION_VERSION = 1;
export const APPROVAL_STAGES = Object.freeze(["brief", "story", "look", "storyboard", "build", "final"]);
export const COMMUNICATION_KINDS = Object.freeze(["launch", "explainer", "brand", "formal", "documentary", "reel", "music", "title", "other"]);

// layers, highest authority first (02_EFFECTIVE_POLICY)
export const LAYERS = Object.freeze({ safety_and_facts: 0, user_explicit: 1, approved_artifact: 2, identity_rights: 3, inferred_need: 4, medium_craft: 5, history_default: 6 });
const LAYER_NAME = Object.freeze(Object.keys(LAYERS));

// fields an approved artifact pins: a later explicit change is reported, never applied retroactively
const PINNED = new Set(["medium.selected", "language.register", "ambition.level"]);
// fields no lower layer may change (permissions, truthfulness, protocol)
const PROTECTED = new Set(["approval.stages", "permissions.install", "permissions.cli", "console.protocol", "resume.behavior", "claims.unsupported_allowed", "rights.missing_granted"]);
const MATERIAL_ENGINE_FIELDS = ["pace", "budget", "model.choice", "build_workers"];

// ------------------------------------------------------------------ canonical identity
const canon = (v) => {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canon(v[k])]));
  return v;
};
const canonJson = (v) => JSON.stringify(canon(v));
const eq = (a, b) => canonJson(a) === canonJson(b);
export const policyDigest = (policy) => "sha256:" + createHash("sha256").update(canonJson(policy == null ? null : policy)).digest("hex");

// ------------------------------------------------------------------ field table
const get = (o, path) => path.split(".").reduce((x, k) => (x && typeof x === "object" ? x[k] : undefined), o);
const setPath = (o, path, value) => { const ks = path.split("."); let x = o; ks.slice(0, -1).forEach((k) => { if (!x[k] || typeof x[k] !== "object" || Array.isArray(x[k])) x[k] = {}; x = x[k]; }); x[ks[ks.length - 1]] = value; };

class Book {
  constructor() { this.cands = []; this.rules = []; this.ruleIds = new Set(); }
  rule(r) { if (!this.ruleIds.has(r.id)) { this.ruleIds.add(r.id); this.rules.push({ scope: "film", ...r }); } return r.id; }
  add(field, value, layer, sub, ruleId, extra = {}) { this.cands.push({ field, value, rank: layer * 10 + sub, layer, rule: ruleId, ...extra }); }
}

const SRC = {
  rules: "skills/rasanai/scripts/lib/rules.mjs productionPolicy",
  resbudget: "apps/macos/Sources/StudioCore/ResearchBudget.swift",
  draft: "apps/macos/Sources/StudioCore/FilmDraft.swift",
  launch: "apps/macos/Sources/StudioCore/DirectorLaunch.swift",
  crewplan: "skills/rasanai/scripts/crew.mjs plan",
  self: "skills/rasanai/scripts/lib/creative-policy.mjs",
};

const normKind = (k) => (COMMUNICATION_KINDS.includes(k) ? k : k ? "other" : null);
const FORMAL_KINDS = new Set(["formal", "documentary", "title"]);
const MODEL_CHOICES = ["recommended", "opus", "sonnet", "settings"];

// explicit user constraint -> {field, value, id?, source?, reason?}; also accepts a plain object { "pace": "fast" }
function listConstraints(constraints) {
  if (!constraints) return [];
  if (Array.isArray(constraints)) return constraints.filter((c) => c && typeof c.field === "string");
  if (typeof constraints === "object") return Object.keys(constraints).sort().map((field) => ({ field, value: constraints[field] }));
  return [];
}

// ------------------------------------------------------------------ the resolver
export function resolveCreativePolicy({ settings = {}, constraints = null, communicationKind = null, approvedRefs = [], capabilities = {} } = {}) {
  const s = settings && typeof settings === "object" ? settings : {};
  const reasons = [];
  const conflicts = [];

  // revision: 1 legacy (unchanged), 2 v3 (opt-in, new plans). Unknown is never silently legacy.
  const rawRev = s.creative_policy_revision ?? s.revision ?? 1;
  const revision = Number(rawRev);
  if (!SUPPORTED_POLICY_REVISIONS.includes(revision)) {
    const c = { code: CREATIVE_ERROR_CODES.unsupported_policy, field: "creative_policy_revision", message: `creative_policy_revision ${JSON.stringify(rawRev)} is not supported (accepted: ${SUPPORTED_POLICY_REVISIONS.join(", ")}). Stop new production dispatch; an existing run keeps its original contract.`, repair_phase: "plan" };
    return { status: "conflict", policy: null, fields: {}, rules: [], conflicts: [c], reasons: [c.message], digest: policyDigest(null) };
  }

  const base = fromLegacy(s.production_policy || s.policy || s); // legacy production policy, reused as is
  const baseOut = productionPolicy({ pace: base.pace, budget: base.budget, direct: !!(base.creative && base.creative.direct), deep: !!(base.exploration && base.exploration.deep), alternatives: base.creative && base.creative.source === "user" ? base.creative.alternatives : null, render: base.render && base.render.tier, spend_limit: base.resources && base.resources.spend_limit, model_choice: base.resources && base.resources.model && base.resources.model.choice, build_workers: base.resources && base.resources.build_workers && base.resources.build_workers.basis === "user" ? base.resources.parallel_workers : null });
  if (revision === 1) {
    const policy = { ...baseOut, creative_policy_revision: 1 };
    return { status: "resolved", policy, fields: {}, rules: [], conflicts: [], reasons: [], digest: policyDigest(policy) };
  }

  const kind = normKind(communicationKind || s.communication_kind);
  const B = new Book();
  const cons = listConstraints(constraints);
  const refs = Array.isArray(approvedRefs) ? approvedRefs.filter((r) => r && typeof r === "object") : [];
  const caps = capabilities && typeof capabilities === "object" ? capabilities : {};
  const level = ["maximal", "balanced", "minimal"].includes(s.level || s.motion_level) ? (s.level || s.motion_level) : null;
  const b = baseOut.budget;
  const pace = baseOut.pace;

  // L0 operating safety and truthful constraints (never relaxed)
  const rSafe = B.rule({ id: "cp.safety.permissions", layer: "safety_and_facts", authority: "operating safety", applies_when: "always", reason: "Install restrictions, CLI construction, console protocol and resume behavior are unchanged by any creative choice.", source: SRC.resbudget });
  B.add("permissions.install", "unchanged", 0, 0, rSafe); B.add("permissions.cli", "unchanged", 0, 0, rSafe); B.add("console.protocol", "unchanged", 0, 0, rSafe); B.add("resume.behavior", "unchanged", 0, 0, rSafe);
  const rStages = B.rule({ id: "cp.safety.approval-stages", layer: "safety_and_facts", authority: "approval protocol", applies_when: "always", reason: "Brief > Story > Look > Storyboard/animatic > Build > Final; policy never adds, skips or auto-approves a stage.", source: SRC.crewplan });
  B.add("approval.stages", [...APPROVAL_STAGES], 0, 0, rStages);
  const rFacts = B.rule({ id: "cp.facts.claims", layer: "safety_and_facts", authority: "claims ledger", applies_when: "always", reason: "A treatment, metaphor or style cannot make an unsupported claim true; the existing claims ledger stays the factual authority.", source: "existing claims/truth records" });
  B.add("claims.unsupported_allowed", false, 0, 0, rFacts); B.add("claims.ledger_is_authority", true, 0, 0, rFacts);
  const rRights = B.rule({ id: "cp.rights.ledger", layer: "identity_rights", authority: "rights ledger", applies_when: "always", reason: "An approved aesthetic cannot grant missing rights; rights stay in the existing consent/rights records.", source: "existing consent resolver" });
  B.add("rights.missing_granted", false, 3, 0, rRights);

  // L6 history/defaults from the existing production policy (pace presets, budgets, model plan)
  const rPace = B.rule({ id: "cp.default.pace", layer: "history_default", authority: "pace preset", applies_when: "always", reason: `Pace ${pace} maps to budget ${b} with the existing research, fix-round and worker ceilings.`, source: SRC.rules });
  B.add("pace", pace, 6, 0, rPace); B.add("budget", b, 6, 0, rPace);
  B.add("research.minutes", baseOut.exploration.research.minutes, 6, 0, rPace); B.add("research.source_limit", baseOut.exploration.research.source_limit, 6, 0, rPace);
  B.add("review.fix_rounds", baseOut.resources.fix_rounds, 6, 0, rPace);
  B.add("review.critic_rounds", b === "lean" ? 1 : b === "standard" ? 2 : 3, 6, 0, rPace);
  B.add("build_workers", baseOut.resources.build_workers.start, 6, 0, rPace);
  B.add("exploration.alternatives", baseOut.creative.alternatives, 6, 0, rPace);
  B.add("exploration.level", baseOut.exploration.level, 6, 0, rPace);
  B.add("model.choice", baseOut.resources.model.choice || "recommended", 6, 0, rPace);
  B.add("spend_limit", baseOut.resources.spend_limit, 6, 0, rPace);

  const rRef = B.rule({ id: "cp.research.reference-work", layer: "history_default", authority: "pace preset", applies_when: "always", reason: "Every pace may use local indexed creative references and one bounded idea pass; web precedent searches consume the existing source and time allowance, and an exhausted allowance is reported (budget_exhausted), never silently widened.", source: SRC.resbudget });
  B.add("research.local_reference_retrieval", true, 6, 0, rRef); B.add("research.idea_pass", "bounded", 6, 0, rRef);
  B.add("research.precedent_work", b === "lean" ? "compact_within_allowance" : b === "standard" ? "compact_within_allowance" : "full", 6, 0, rRef);
  B.add("research.on_exhausted", "develop_from_available_and_report_limits", 6, 0, rRef);

  const direct = !!(baseOut.creative && baseOut.creative.direct);
  const rSched = B.rule({ id: "cp.schedule.continuity", layer: "history_default", authority: "continuity scheduler", applies_when: "always", reason: "Scheduling follows continuity ownership groups and ready jobs: independent groups run in parallel up to the worker cap, a dependent group waits for its owner, a continuous action has one owner. One agent per scene is a result of independence, not a fixed rule.", source: "existing jobs/job-control scheduler" });
  B.add("schedule.strategy", direct ? "single_owner" : "ownership_groups", 6, 0, rSched); B.add("schedule.per_scene_dispatch", direct ? "never" : "when_independent", 6, 0, rSched);
  B.add("schedule.parallel_cap", Math.max(1, Math.min(10, baseOut.resources.build_workers.start)), 6, 0, rSched);

  const rAmb = B.rule({ id: "cp.default.ambition", layer: "history_default", authority: "house style", applies_when: "always", reason: "Show-off is the default ambition; it means craft that serves the brief, not density, and a replayable moment is earned by the story (it may be quiet), not blanket.", source: SRC.draft });
  B.add("ambition.level", level || "maximal", 6, 0, rAmb); B.add("ambition.density_is_ambition", false, 6, 0, rAmb);
  B.add("ambition.spectacle", "earned", 6, 0, rAmb);
  B.add("language.register", "narrative", 6, 0, rAmb);
  B.add("language.metaphor", "allowed_with_proof", 6, 0, rAmb); B.add("language.formal_abstract_permitted", true, 6, 0, rAmb);

  // L5 medium-specific craft: capabilities
  const unavailable = Object.keys(caps).sort().filter((k) => caps[k] === "unavailable" || (caps[k] && caps[k].state === "unavailable"));
  if (unavailable.length) {
    const rCap = B.rule({ id: "cp.medium.capability", layer: "medium_craft", authority: "capability evidence", applies_when: "a capability state is unavailable", reason: `Unavailable capabilities (${unavailable.join(", ")}) are not promised; treatments that need them are reported as capability_unavailable.`, source: "existing capabilities/medium rules" });
    B.add("capabilities.unavailable", unavailable, 5, 0, rCap);
  }

  // L4 inferred communication need
  if (kind) {
    const rKind = B.rule({ id: "cp.infer.communication-kind", layer: "inferred_need", authority: "communication kind", applies_when: `communication kind is ${kind}`, reason: "The kind sets register and spectacle expectations; pace and budget never change communication kind or story type.", source: SRC.self });
    B.add("communication.kind", kind, 4, 0, rKind);
    if (FORMAL_KINDS.has(kind)) { B.add("language.register", "formal", 4, 0, rKind); B.add("ambition.spectacle", "none_required", 4, 0, rKind); }
  }

  // L2/L3 approved artifacts: {kind, ref, digest, fields: {"medium.selected": "...", ...}} (the fields they pin)
  refs.slice().sort((x, y) => String(x.ref || x.kind).localeCompare(String(y.ref || y.kind))).forEach((r) => {
    const id = `cp.approved.${String(r.kind || "artifact")}.${String(r.ref || "ref")}`;
    const rid = B.rule({ id, layer: "approved_artifact", authority: "approved artifact", applies_when: `${r.kind || "artifact"} ${r.ref || ""} is approved`, reason: "A current approved artifact beats defaults and cannot be changed retroactively by a later preference.", source: String(r.ref || r.kind || "approved artifact"), digest: r.digest || null });
    Object.keys(r.fields || {}).sort().forEach((f) => B.add(f, r.fields[f], 2, 0, rid, { pinned: true }));
    if (r.kind === "brand") B.add("brand.requirements", r.requirements || r.fields?.["brand.requirements"] || [], 2, 1, rid);
  });

  // L1 explicit user decisions: saved settings (sub 1) and per-film constraints (sub 0, more specific)
  const rSet = B.rule({ id: "cp.user.settings", layer: "user_explicit", authority: "user settings", applies_when: "the setting was chosen by the user", reason: "The pace, model plan, alternatives and motion level the user chose in Settings or on the New film chip.", source: SRC.launch });
  if (s.pace_chosen !== false && s.pace) { B.add("pace", pace, 1, 1, rSet); B.add("budget", PACE_TO_BUDGET[pace] || b, 1, 1, rSet); B.add("research.minutes", baseOut.exploration.research.minutes, 1, 1, rSet); B.add("research.source_limit", baseOut.exploration.research.source_limit, 1, 1, rSet); }
  const mc = s.model_plan || s.model_choice || (s.production_policy && s.production_policy.resources && s.production_policy.resources.model && s.production_policy.resources.model.choice);
  if (mc && MODEL_CHOICES.includes(mc)) B.add("model.choice", mc, 1, 1, rSet);
  else if (mc) reasons.push(`model plan ${JSON.stringify(mc)} is not one of ${MODEL_CHOICES.join("/")}; ignored`);
  if (level) B.add("ambition.level", level, 1, 1, rSet);
  if (s.alternatives != null && baseOut.creative.source === "user") B.add("exploration.alternatives", baseOut.creative.alternatives, 1, 1, rSet);
  if (s.build_workers != null) B.add("build_workers", baseOut.resources.build_workers.start, 1, 1, rSet);
  if (s.spend_limit) B.add("spend_limit", baseOut.resources.spend_limit, 1, 1, rSet);

  cons.forEach((c, i) => {
    const rid = B.rule({ id: c.id || `cp.user.constraint.${i + 1}.${c.field}`, layer: "user_explicit", authority: "explicit user decision", applies_when: "the user stated it for this film", reason: c.reason || "Stated by the user for this film.", source: c.source || "user constraint" });
    B.add(c.field, c.value, 1, 0, rid, { explicit: true });
    if (c.field === "ambition.level" || c.field === "language.register") { /* approved-artifact pin check happens in resolution */ }
    if (c.field === "ambition.level" && c.value === "minimal") B.add("ambition.spectacle", "none_required", 1, 0, rid);
    if (c.field === "ambition.treatment" && c.value === "quiet") B.add("ambition.spectacle", "earned_quiet_ok", 1, 0, rid);
  });
  // a quiet Maximal treatment: ambition stays Maximal, spectacle may be a quiet replayable moment
  const resolvedLevelHint = cons.find((c) => c.field === "ambition.level")?.value || level;
  if (resolvedLevelHint === "maximal" && cons.some((c) => c.field === "ambition.treatment" && c.value === "quiet")) reasons.push("quiet Maximal treatment permitted: ambition stays Maximal, spectacle is a quiet earned moment, no density added");

  // ---- resolve per field
  const byField = new Map();
  B.cands.forEach((c) => { (byField.get(c.field) || byField.set(c.field, []).get(c.field)).push(c); });
  const fields = {}; const policyCreative = {}; const overridden = [];
  Array.from(byField.keys()).sort().forEach((f) => {
    const list = byField.get(f).slice().sort((x, y) => x.rank - y.rank);
    const top = list[0];
    const tie = list.filter((c) => c.rank === top.rank && !eq(c.value, top.value));
    let win = top;
    if (tie.length) {
      conflicts.push({ code: CREATIVE_ERROR_CODES.policy_conflict, field: f, message: `two ${LAYER_NAME[top.layer]} rules disagree on ${f}: ${[top, ...tie].map((c) => `${c.rule}=${canonJson(c.value)}`).join(" vs ")}. Needs one current decision.`, rules: [top, ...tie].map((c) => c.rule), repair_phase: "plan", severity: "material" });
    }
    const lower = list.filter((c) => c !== top && !eq(c.value, top.value));
    if (PROTECTED.has(f)) {
      const bad = lower.filter((c) => c.layer > 0 || c.explicit);
      if (bad.length) conflicts.push({ code: CREATIVE_ERROR_CODES.policy_conflict, field: f, message: `${f} is protected (safety/truth/rights/protocol) and is kept as ${canonJson(top.value)}; ${bad.map((c) => c.rule).join(", ")} cannot change it.`, rules: bad.map((c) => c.rule), repair_phase: "plan", severity: "blocked" });
    }
    if (PINNED.has(f)) {
      const pinned = list.find((c) => c.pinned);
      const user = list.find((c) => c.explicit && c.layer === 1);
      if (pinned && user && !eq(pinned.value, user.value)) {
        win = pinned;
        conflicts.push({ code: CREATIVE_ERROR_CODES.policy_conflict, field: f, message: `approved artifact pins ${f}=${canonJson(pinned.value)} but a new instruction asks ${canonJson(user.value)}. The approved value stays until the owner revises deliberately (never retroactive).`, rules: [pinned.rule, user.rule], repair_phase: "revision", severity: "material" });
      }
    }
    list.filter((c) => c !== win && !eq(c.value, win.value)).forEach((c) => overridden.push({ field: f, rule: c.rule, value: c.value, by: win.rule }));
    fields[f] = { value: win.value, rule: win.rule, layer: LAYER_NAME[win.layer], supporting: list.filter((c) => c !== win && eq(c.value, win.value)).map((c) => c.rule) };
    setPath(policyCreative, f, win.value);
  });

  // model plan: a single-model choice wins over any role split (a coherent behavior for every pace)
  const modelChoice = fields["model.choice"] ? fields["model.choice"].value : "recommended";
  policyCreative.model = { ...(policyCreative.model || {}), choice: modelChoice, split: modelChoice === "recommended" ? (pace === "fast" ? "opus_decides_sonnet_builds" : "opus_decides_sonnet_builds_critics_opus") : "single_model", single_model_wins: modelChoice === "opus" || modelChoice === "sonnet", silent_downgrade: false };

  // brand requirements: required but no approved brand source -> missing_input
  const brandReq = cons.find((c) => c.field === "brand.required" && c.value);
  const brandRef = refs.find((r) => r.kind === "brand");
  if (brandReq && !brandRef) reasons.push("brand.required is set but no approved brand/Look record is available: add the brand source (brand compiler) before storyboard work");
  policyCreative.brand = { ...(policyCreative.brand || {}), required: !!brandReq, source: brandRef ? String(brandRef.ref || "brand") : null, observed_vs_required_split: true };
  const missing = !!(brandReq && !brandRef);

  // medium: required to be resolved but absent
  const mediumReq = cons.find((c) => c.field === "medium.required" && c.value);
  const mediumSel = fields["medium.selected"] && fields["medium.selected"].value;
  if (mediumReq && !mediumSel) { reasons.push("medium.required is set but no medium is selected, custom-supported or marked needs-direction"); conflicts.push({ code: CREATIVE_ERROR_CODES.medium_unresolved, field: "medium.selected", message: "a medium is required and none is resolved; choose or direct one at the Look stage", repair_phase: "look", severity: "material" }); }
  // required medium on an unavailable capability
  if (mediumSel && unavailable.includes(String(mediumSel))) conflicts.push({ code: CREATIVE_ERROR_CODES.capability_unavailable, field: "medium.selected", message: `selected medium ${mediumSel} is unavailable in this environment; report instead of promising it`, repair_phase: "look", severity: "material" });

  // native settings vs engine plan disagreement on a material promise: report exact fields, current user intent wins
  const eng = s.engine_plan && typeof s.engine_plan === "object" ? s.engine_plan : null;
  if (eng) {
    const engVals = { pace: eng.pace, budget: eng.budget, "model.choice": eng.model_choice ?? eng.model_plan, build_workers: eng.build_workers ?? (eng.resources && eng.resources.parallel_workers) };
    MATERIAL_ENGINE_FIELDS.forEach((f) => {
      const ev = engVals[f];
      if (ev == null || !fields[f]) return;
      if (!eq(ev, fields[f].value)) conflicts.push({ code: CREATIVE_ERROR_CODES.policy_conflict, field: f, message: `native settings say ${f}=${canonJson(fields[f].value)}, engine plan says ${canonJson(ev)}; current user intent (${fields[f].rule}) is used and the prompt carries one sentence only.`, rules: [fields[f].rule, "engine_plan"], repair_phase: "plan", severity: "notice", winner: fields[f].rule });
    });
  }

  // assemble: legacy production policy untouched + creative_v3 section
  const applicable = B.rules.map((r) => ({ ...r, applies: true })).sort((x, y) => LAYERS[x.layer] - LAYERS[y.layer] || x.id.localeCompare(y.id));
  const policy = {
    ...baseOut,
    creative_policy_revision: 2,
    creative_v3: { version: POLICY_SECTION_VERSION, communication_kind: kind, ...policyCreative, approval_stages: [...APPROVAL_STAGES], resolution_order: [...LAYER_NAME] },
  };
  const blocking = conflicts.filter((c) => c.severity === "blocked" || c.severity === "material");
  const status = blocking.length ? "conflict" : missing ? "missing_input" : "resolved";
  if (blocking.length) blocking.forEach((c) => reasons.push(`${c.code}: ${c.message}`));
  return { status, policy, fields, rules: applicable, overridden, conflicts, reasons, digest: policyDigest(policy) };
}

// ------------------------------------------------------------------ projections and readers
export function explainPolicy(policy) {
  if (!policy) return "no policy";
  const c = policy.creative_v3;
  if (!c) return `legacy revision ${policy.creative_policy_revision || 1} policy: pace ${policy.pace}, budget ${policy.budget}`;
  const lines = [
    `Creative policy revision ${policy.creative_policy_revision} (${policyDigest(policy).slice(0, 19)})`,
    `- pace ${c.pace}/${c.budget}: research ${c.research && c.research.minutes != null ? c.research.minutes + " min / " + c.research.source_limit + " sources" : "unbounded"}; local references and a bounded idea pass are allowed at every pace`,
    `- model plan: ${c.model.choice}${c.model.single_model_wins ? " (one model for every role; wins over any split)" : ""}`,
    `- scheduling: ${c.schedule.strategy}, per-scene dispatch ${c.schedule.per_scene_dispatch}, cap ${c.schedule.parallel_cap}`,
    `- review: ${c.review.critic_rounds} critic round(s), ${c.review.fix_rounds} fix round(s)`,
    `- ambition ${c.ambition.level}; spectacle ${c.ambition.spectacle}; density is not ambition`,
    `- language ${c.language.register}; metaphor ${c.language.metaphor}; formal and abstract language permitted`,
    `- approvals ${(c.approval_stages || []).join(" > ")} unchanged; permissions and console protocol unchanged`,
  ];
  return lines.join("\n");
}

// the readable sidecar creative/effective-policy.json: a projection of the plan policy, never a second authority
export function effectivePolicyDoc(resolution, meta = {}) {
  const r = resolution || {};
  return canon({ schema_version: 1, kind: "effective-policy", creative_policy_revision: r.policy ? r.policy.creative_policy_revision : null, status: r.status || "missing_input", digest: r.digest || null, policy_digest_basis: "sha256 of canonical crew/plan.json policy", communication_kind: r.policy && r.policy.creative_v3 ? r.policy.creative_v3.communication_kind : null, fields: r.fields || {}, rules: r.rules || [], overridden: r.overridden || [], conflicts: r.conflicts || [], reasons: r.reasons || [], ...meta });
}

// worker/receipt check: the sidecar digest must equal the digest of the plan's policy
export function checkPolicyDigest(planPolicy, sidecar) {
  const want = policyDigest(planPolicy);
  if (!sidecar || !sidecar.digest) return { ok: false, code: CREATIVE_ERROR_CODES.stale_input, message: "creative/effective-policy.json is missing or has no digest; regenerate it from the plan policy", want };
  if (sidecar.digest !== want) return { ok: false, code: CREATIVE_ERROR_CODES.stale_input, message: `creative/effective-policy.json digest ${sidecar.digest} does not match the plan policy ${want}; regenerate packets affected by the policy change`, want };
  return { ok: true, want };
}

// explicit revision reader: replaces `plan.creative_policy_revision === 1` equality checks (INT-ENGINE-A/B; W11 inventories readers)
export const policyRevisionOf = (plan) => (plan && plan.creative_policy_revision != null ? Number(plan.creative_policy_revision) : 0); // 0 = legacy plan (no marker)
export const creativePolicyOn = (plan) => SUPPORTED_POLICY_REVISIONS.includes(policyRevisionOf(plan));
export const creativePolicyUnsupported = (plan) => (plan && plan.creative_policy_revision != null && !SUPPORTED_POLICY_REVISIONS.includes(policyRevisionOf(plan)) ? { code: CREATIVE_ERROR_CODES.unsupported_policy, message: `creative_policy_revision ${JSON.stringify(plan.creative_policy_revision)} is not supported; stop new production dispatch before any packet is written` } : null);

// ------------------------------------------------------------------ integration proposals (DATA; applied by the lead / INT workers)
export const INTEGRATION_PROPOSALS = Object.freeze({
  status: "proposed_not_wired",
  crew_plan: {
    file: "skills/rasanai/scripts/crew.mjs",
    anchor: "plan command, near `creative_policy_revision` assignment (~3619-3622), after pace/budget/direct/model are known and before plan.json is written",
    steps: [
      "import { resolveCreativePolicy, effectivePolicyDoc, creativePolicyOn, creativePolicyUnsupported, CREATIVE_ERROR_CODES } from './lib/creative-policy.mjs'",
      "unsupported = creativePolicyUnsupported(prev plan); if set, die(unsupported.message) before any dispatch",
      "revision 2 only for a NEW eligible plan (or --creative-policy 2); a saved plan keeps its revision; --creative-policy 1 keeps legacy behaviour",
      "res = resolveCreativePolicy({ settings: { pace, budget, direct, deep, alternatives, model_plan, level, creative_policy_revision, engine_plan: prevPlan }, constraints: user constraints from the brief/console, communicationKind: brief kind, approvedRefs: approvalPins(run) mapped to {kind,ref,digest,fields}, capabilities: medium capability states })",
      "if res.status === 'conflict' with severity blocked/material, die with res.reasons; 'missing_input' prints the reason and writes the plan with status noted",
      "plan.policy = res.policy (crew/plan.json); write creative/effective-policy.json = effectivePolicyDoc(res); creativeOn() becomes creativePolicyOn() (rev 1 and 2 both true); the existing `=== 1` readers (crew.mjs 119/346/811/915/919/2171/2261/2687/3499/3621, scripts/storyboard.mjs:44, skill-map.mjs:70) are replaced by the explicit reader",
      "worker receipts record res.digest; the packet compiler includes only rules whose applies is true, with their ids",
    ],
  },
  native_prompt_replacements: {
    note: "Edit Swift and scripts/lib/director-prompt-data.json identically. Existing limits (2 min/6 sources, 5 min/15 sources), model choices, review-round bounds, install restrictions, console protocol and resume stay as they are.",
    fast_research: {
      file: "apps/macos/Sources/StudioCore/ResearchBudget.swift (.fast launchSection, lines ~43-45)",
      replace_sentence_a: "overrides the engine's research defaults (the shared-contract rule 13, the crew plan, the precedent researcher).",
      with_a: "overrides the engine's research defaults (the shared-contract rule 13, the crew plan) for time and source count only.",
      replace_bullet: "- Do not analyse other companies' launch films or past promo videos. Do not run the precedent researcher and do not pass --public to crew.mjs plan.",
      with_bullet: "- Use the local indexed creative references and one bounded idea pass for precedent work; they cost no web sources. Web precedent searches count toward the 6-source and 2-minute allowance. Do not do shot-by-shot analysis of other companies' films, and do not pass --public to crew.mjs plan. If the allowance runs out, develop concepts from the material you have and say which references were not reached.",
      standard_matching_line: "- Do not do shot-by-shot analysis of other companies' launch films. Do not pass --public to crew.mjs plan.  (unchanged; add: Local indexed creative references and one bounded idea pass are allowed.)",
    },
    fixed_agent_per_scene: {
      file: "apps/macos/Sources/StudioCore/ResearchBudget.swift (buildSection, lines ~73-74)",
      replace_key_frames: "- Key frames: one agent per scene, all launched at once in the background (cap 10 at a time; with more scenes launch the rest as soon as one finishes). Never two scenes to one agent and never a sequential batch.",
      with_key_frames: "- Key frames: follow the plan's continuity ownership groups (creative/effective-policy.json schedule). Scenes that are independent run as separate agents launched at once in the background (cap 10 at a time; launch the rest as soon as one finishes). Scenes that share one continuous action go to that action's single owner, in order. Never a sequential batch of independent scenes.",
      replace_animation: "- Animation: one agent per scene, all launched at once, starting immediately from the contract. No animator waits for a shared-world build. If a shared asset is needed, one extra agent builds it at the same time while the scenes use the contract's placeholders, and it is swapped in afterwards.",
      with_animation: "- Animation: independent scenes start at once from the contract; no animator waits for a shared-world build. A continuous action that spans scenes has one owner who builds it across them. If a shared asset is needed, one extra agent builds it at the same time while the scenes use the contract's placeholders, and it is swapped in afterwards.",
    },
    blanket_spectacle: {
      files: ["apps/macos/Sources/StudioCore/DirectorLaunch.swift:41", "apps/macos/Sources/StudioCore/FilmDraft.swift levelText maximal (~244)", "apps/macos/Sources/StudioCore/FilmDraft.swift levelText balanced (~247, 'Keep one spectacle moment.')"],
      replace_launch: "Show off. This is a portfolio piece: choreographed motion, layered typography, designed transitions, and at least one spectacle moment. Ambition means craft, not clutter or random effects; every element is timed, aligned and purposeful.",
      with_launch: "Show off. This is a portfolio piece: choreographed motion, designed typography and transitions, and a moment people will replay where the story earns one (it can be loud or quiet, and a restrained or formal film may be all the more deliberate). Ambition means craft, not clutter or density; every element is timed, aligned and purposeful.",
      replace_maximal: "Build at least one spectacle moment people will replay. This is the full ambition of the house style.",
      with_maximal: "Build the moment people will replay where the story earns it; it may be a quiet, precisely timed beat rather than a loud one. This is the full ambition of the house style.",
      replace_balanced: "Keep one spectacle moment.",
      with_balanced: "Keep one earned standout moment where the story supports it.",
    },
  },
});
