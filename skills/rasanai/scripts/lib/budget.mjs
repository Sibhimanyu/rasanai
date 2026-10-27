// Effect budgets: the hero effects AI video overuses are allowed a few times per film, on the hero, with a reason.
// A ban taught the pipeline that "not on everything" meant "never"; every reference film uses at least one of these
// once, with intent (Kinso: defocus, a halftone burst, an overshooting landing; Sovra: glow, a light comet, blur-in
// words). The tell is UNIFORM use: the same effect on every element or every line. That stays an error.
//
// The score (motion/score.json) carries the budget:
//   "budget": [{ "effect": "glow", "scene": 3, "target": "#send-button", "reason": "the one moment the answer lands" }]
// references/craft.md "Finish and budgets" is the reader-facing version of these rules.
import fs from "node:fs";
import path from "node:path";

// effect id -> words that name it in a score, a card or a selector
export const BUDGET_EFFECTS = {
  glow: /\bglow|bloom|halo\b/i,
  overshoot: /\bovershoot|back\.out|elastic|bounce/i,
  "blur-in": /\bblur[- ]?in\b/i,
  particles: /\bparticles?|sparkle|bokeh|confetti/i,
  "scale-pop": /\bscale[- ]?pop/i,
  "chromatic-split": /\bchromatic|rgb[- ]?split/i,
  "halftone-burst": /\bhalftone/i,
  "light-comet": /\blight[- ]?comet|border[- ]?light/i,
};

// at most this many budgeted uses of one effect per film: 2 under 30 s, 3 from 30 s
export const budgetLimit = (filmSeconds) => (Number(filmSeconds) > 0 && Number(filmSeconds) < 30 ? 2 : 3);

export function effectOf(s) {
  const t = String(s || "");
  if (BUDGET_EFFECTS[t]) return t;
  return Object.keys(BUDGET_EFFECTS).find((k) => BUDGET_EFFECTS[k].test(t)) || null;
}

// read the score's budget entries for a run (or a score object); unknown shapes give []
export function readBudget(runOrScore) {
  let sc = runOrScore;
  if (typeof runOrScore === "string") {
    const f = path.join(runOrScore, "motion", "score.json");
    try { sc = JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; }
  }
  const b = sc && Array.isArray(sc.budget) ? sc.budget : [];
  return b.filter((e) => e && typeof e === "object").map((e) => ({ ...e, effect: effectOf(e.effect) || String(e.effect || "") }));
}

// problems in the budget itself: unknown effect, no reason, no hero target, over the per-film limit
export function checkBudget(entries, filmSeconds) {
  const P = [], W = [], lim = budgetLimit(filmSeconds), per = {};
  for (const e of entries) {
    if (!BUDGET_EFFECTS[e.effect]) { W.push(`budget: "${e.effect}" is not a budgeted effect (${Object.keys(BUDGET_EFFECTS).join(", ")}); anything else needs no entry`); continue; }
    if (String(e.reason || "").trim().length < 12) P.push(`budget: ${e.effect}${e.scene ? ` in scene ${e.scene}` : ""} needs a reason (12+ characters: why this moment, on this hero)`);
    if (!String(e.target || e.hero || "").trim()) P.push(`budget: ${e.effect}${e.scene ? ` in scene ${e.scene}` : ""} needs a target (the hero element it is on; never "all" or a whole scene)`);
    else if (/^(all|every|\*|body|\.scene|scene)$/i.test(String(e.target || e.hero).trim())) P.push(`budget: ${e.effect} targets "${e.target || e.hero}": a budget is for the hero only, never every element`);
    per[e.effect] = (per[e.effect] || 0) + 1;
  }
  for (const [k, n] of Object.entries(per)) if (n > lim) P.push(`budget: ${k} is used ${n} times; at most ${lim} in a ${Math.round(filmSeconds) || "?"} s film (hero moments only)`);
  return { P, W, limit: lim, per };
}

export const budgetFor = (entries, effect) => entries.filter((e) => e.effect === effect);

// ======================================================================================================================================
// Creative budget and progressive commitment (v3 W10). Additive: everything above is the legacy effect budget and is unchanged.
// Pure functions: no I/O, no model, no provider, no tokenizer. Every figure is a PROPOSED starting value or an ESTIMATE; none is a measured saving or price.
// Consumers: crew.mjs brief/dispatch (lead wires), resource-pools.mjs creativeAdmission, packets.mjs (pressure wording). Error codes reuse creative-policy CREATIVE_ERROR_CODES.
// ======================================================================================================================================
export const CREATIVE_PHASES = Object.freeze(["development", "proof_assets", "production", "review", "repair"]);
// proposed starting shares of the person's allowance by phase and budget level; review and repair keep a floor so polish is never the only thing left to cut
const SHARES = Object.freeze({
  lean: { development: 0.15, proof_assets: 0.1, production: 0.5, review: 0.15, repair: 0.1 },
  standard: { development: 0.2, proof_assets: 0.12, production: 0.43, review: 0.15, repair: 0.1 },
  full: { development: 0.22, proof_assets: 0.14, production: 0.4, review: 0.14, repair: 0.1 },
});
const FLOOR = Object.freeze({ review: 0.1, repair: 0.05 });
const BUDGET_NAMES = ["lean", "standard", "full"];

// reservationPlan({ policy, limit_tokens? }) -> { basis, estimate:true, budget, phases:{ <phase>:{ share, reserved_tokens|null } }, limit_tokens, note }
// limit_tokens: the person's own limit (policy.resources.spend_limit.tokens) or null. With no limit, only shares are stated: nothing is invented.
export function reservationPlan({ policy = null, limit_tokens } = {}) {
  const b = policy && BUDGET_NAMES.includes(policy.budget) ? policy.budget : policy && policy.resources && BUDGET_NAMES.includes(policy.resources.budget) ? policy.resources.budget : "standard";
  const lim = limit_tokens !== undefined ? limit_tokens : policy && policy.resources && policy.resources.spend_limit ? policy.resources.spend_limit.tokens : null;
  const L = Number.isFinite(Number(lim)) && lim !== null && Number(lim) > 0 ? Number(lim) : null;
  const phases = Object.fromEntries(CREATIVE_PHASES.map((p) => [p, { share: SHARES[b][p], reserved_tokens: L === null ? null : Math.floor(L * SHARES[b][p]), spent_estimate_tokens: 0 }]));
  return { schema_version: 1, basis: "proposed_starting_values", estimate: true, budget: b, limit_tokens: L, phases, floors: { ...FLOOR }, note: "reservations are estimates drawn from the person's allowance; observed usage is recorded separately (lib/usage.mjs) and never overwrites them" };
}

// transferUnused(plan, { from, to, tokens }) -> { ok, plan } | { ok:false, code, reason }. Unused capacity may move only forward in the pipeline, never below the review/repair floors,
// never when no limit is set (nothing to move), and never above the person's own limit (the total is conserved).
export function transferUnused(plan, { from, to, tokens } = {}) {
  const fail = (reason) => ({ ok: false, code: "budget_exhausted", reason });
  if (!plan || !plan.phases || !plan.phases[from] || !plan.phases[to]) return fail("unknown phase");
  if (plan.limit_tokens === null) return fail("no spend limit is set: there is no reservation to move");
  const order = CREATIVE_PHASES, fi = order.indexOf(from), ti = order.indexOf(to);
  if (ti <= fi) return fail("unused capacity moves forward only (development -> proof -> production -> review -> repair)");
  const n = Math.floor(Number(tokens) || 0);
  if (n <= 0) return fail("nothing to transfer");
  const f = plan.phases[from], free = (f.reserved_tokens ?? 0) - (f.spent_estimate_tokens || 0);
  if (n > free) return fail(`${from} has ${Math.max(0, free)} unused estimated tokens, not ${n}`);
  const floor = FLOOR[from] != null ? Math.floor(plan.limit_tokens * FLOOR[from]) : 0;
  if ((f.reserved_tokens - n) < floor || (f.reserved_tokens - n) < (f.spent_estimate_tokens || 0)) return fail(`${from} keeps its floor`);
  const next = JSON.parse(JSON.stringify(plan));
  next.phases[from].reserved_tokens -= n; next.phases[to].reserved_tokens += n;
  next.transfers = [...(plan.transfers || []), { from, to, tokens: n }];
  return { ok: true, plan: next };
}

// ---- progressive commitment ----------------------------------------------------------------------------------------------------------
// request: { kind: concept | evidence | look_sample | defining_action | production | review | repair | render_final,
//            option: "pending" | "selected" | "rejected" | null, spend: "none"|"provider"|..., frames?: n }
// state:   { approvals: { story, look, storyboard, build: boolean } , authorization?: { scope: "sequence"|"film"|"asset", ids?: [], film?: bool } }
// -> { admit, code|null, defer:[reasons], note }. Approval order is Brief > Story > Look > Storyboard/animatic > Build > Final; nothing here adds a screen or skips one.
const NEEDS = { concept: [], evidence: [], look_sample: ["story"], defining_action: ["story", "look", "storyboard", "build"], production: ["story", "look", "storyboard", "build"], review: ["storyboard"], repair: ["build"], render_final: ["story", "look", "storyboard", "build"] };
export function commitmentGate(request = {}, state = {}) {
  const k = request.kind, ap = (state && state.approvals) || {};
  const defer = [];
  if (!(k in NEEDS)) return { admit: false, code: "not_assessable", defer: [`unknown work kind "${k}"`], note: "no spend is admitted for work this gate cannot classify" };
  if (request.option === "rejected" && !["concept", "evidence"].includes(k)) defer.push("a rejected option is not developed past its concept: exploration of it stays compact and nothing is animated or built");
  if (request.option === "pending" && !["concept", "evidence"].includes(k)) defer.push("an option still under choice gets concept and evidence work only, never full motion or production");
  if (k === "look_sample" && request.full_film === true) defer.push("a look direction is a compact representative sample, not a complete film in each style");
  for (const need of NEEDS[k]) if (!ap[need]) defer.push(`${need} is not approved yet`);
  if (!defer.length && ["defining_action", "production", "render_final"].includes(k)) {
    const a = state.authorization;
    if (a && a.scope === "sequence" && k !== "defining_action" && !(Array.isArray(a.ids) && request.sequence_id && a.ids.includes(request.sequence_id))) defer.push("the approved production authorization covers one sequence: it is not permission for the whole film or other sequences (EDGE-10)");
    if (a && a.scope === "asset" && k !== "defining_action") defer.push("the approved authorization covers named assets only");
  }
  if (defer.length) return { admit: false, code: defer.some((d) => /not approved/.test(d)) ? "approval_missing" : "budget_exhausted", defer, note: "deferred work keeps its place; outputs already made are preserved" };
  return { admit: true, code: null, defer: [], note: null };
}

// BUD-06: when one required sequence is uncertain, run a bounded defining action first, inside the approved scope; later dependent work waits, independent ready work is not starved.
// jobs: [{ id, uncertain?:bool, defining?:bool, depends_on?:[ids], ready?:bool, in_scope?:bool, bound?:{ attempts?, review_rounds? } }]
export function orderDefiningAction(jobs = []) {
  const J = (Array.isArray(jobs) ? jobs : []).filter((j) => j && j.id);
  const def = J.find((j) => j.defining && j.uncertain !== false && j.in_scope !== false) || J.find((j) => j.uncertain && j.in_scope !== false) || null;
  if (!def) return { first: null, order: J.map((j) => j.id), held: [], note: "no uncertain defining action in scope: normal dependency order" };
  const dependents = new Set([def.id]); let grew = true;
  while (grew) { grew = false; for (const j of J) if (!dependents.has(j.id) && (j.depends_on || []).some((d) => dependents.has(d))) { dependents.add(j.id); grew = true; } }
  const held = J.filter((j) => j.id !== def.id && dependents.has(j.id)).map((j) => j.id);
  const rest = J.filter((j) => j.id !== def.id && !dependents.has(j.id)).map((j) => j.id);
  return { first: def.id, order: [def.id, ...rest, ...held], held, bound: { attempts: (def.bound && def.bound.attempts) || 1, review_rounds: (def.bound && def.bound.review_rounds) || 1, rule: "one bounded attempt and one review round before dependent production is released; a failure is reported, not retried silently" }, note: "the defining action is within the approved production scope; it does not widen it" };
}

// BUD-02 / EDGE-09: spend or external transmission beyond what the person authorized is disclosed and waits for the existing authorization. Never a silent downgrade.
// need: { tokens?, provider?: string|null, transmits?: bool }, auth: { limit_tokens, providers:[ids], transmission:boolean }
export function spendDisclosure(need = {}, auth = {}) {
  const issues = [];
  const provider = need.provider || null;
  if (provider && !(Array.isArray(auth.providers) && auth.providers.includes(provider))) issues.push({ code: "approval_missing", what: `provider "${provider}" is not authorized for this run: it stays optional and waits for authorization` });
  if (need.transmits === true && auth.transmission !== true) issues.push({ code: "approval_missing", what: "this would send the person's material outside the machine without applicable authorization" });
  const lim = Number.isFinite(Number(auth.limit_tokens)) && auth.limit_tokens !== null ? Number(auth.limit_tokens) : null;
  if (lim !== null && Number(need.tokens) > lim) issues.push({ code: "budget_exhausted", what: `estimated ${Number(need.tokens)} tokens exceed the person's limit of ${lim}` });
  return { admit: issues.length === 0, issues, silent_downgrade: false, estimate: true, action: issues.length ? "disclose the tradeoff (budgetTradeoff) and ask through the existing authorization; do not spend, switch provider or lower quality meanwhile" : null };
}

// What an actual shortfall costs the film, in plain terms. The central mechanism and its truthful proof are kept; cheaper cards never keep the ambitious label.
export function budgetTradeoff({ shortfall = true, mechanism = null, options = null } = {}) {
  if (!shortfall) return null;
  const choices = options && options.length ? options : ["fewer independent locations", "simplified acting", "a shorter continuous sequence", "deferred polish"];
  return { preserved: { mechanism: mechanism || "the approved central mechanism", proof: "truthful proof of every required event" }, choices, relabel_rule: "if the central mechanism is dropped the film is relabelled as the simpler thing it became, with a limitation; it is never kept as the ambitious plan with cheaper cards", needs: "the person picks, or authorizes more spend, through the existing controls" };
}

// BUD-08: a faster pace or tight research allowance reduces exploration depth and redundancy, never creative development, approvals, or required evidence.
export function researchCapacityPlan({ pace = "standard", limited = false } = {}) {
  const cut = limited || pace === "fast";
  return { pace, reduce: cut ? ["web precedent breadth", "repeated research of the same source", "extra alternative detail (compact the unchosen)"] : [], keep: ["concept development", "all approvals", "required claims and proof", "the person's own references"], exhausted_code: "budget_exhausted", note: "an exhausted allowance is reported; it is never silently widened" };
}
