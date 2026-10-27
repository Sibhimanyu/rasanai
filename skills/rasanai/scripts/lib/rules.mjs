// Rule resolution. Each effective rule: { rule_id, scope, kind, source, version, applicability, override_reason }.
// kind: authorization | fact | brand | format | craft_preference | resource.
// Authorization and fact are checked independently first and nothing below them can override them.
export const RULE_KINDS = ["authorization", "fact", "brand", "format", "craft_preference", "resource"];
const BINDING = ["authorization", "fact", "brand", "format", "resource"];

export const makeRule = (r) => ({ rule_id: "", scope: "film", kind: "craft_preference", source: "", version: 1, applicability: null, override_reason: "", ...r });

// rules with the same scope + topic and different `value` conflict; topic defaults to rule_id
const topic = (r) => `${r.scope}::${(r.applicability && r.applicability.topic) || r.rule_id}`;
const same = (a, b) => JSON.stringify(a.value) === JSON.stringify(b.value);

function conflictsIn(group) {
  const byTopic = new Map();
  for (const r of group) { const k = topic(r); (byTopic.get(k) || byTopic.set(k, []).get(k)).push(r); }
  for (const rs of byTopic.values()) if (rs.length > 1 && !rs.every((r) => same(r, rs[0]))) return rs;
  return null;
}

// -> { conflict:false, rules:[...effective], dropped:[...] } or { conflict:true, rules:[the clashing binding rules], kind }
// a craft_preference loses to any binding rule on the same topic; two binding rules that disagree are a conflict, never a pick
export function resolve(rules) {
  const all = (Array.isArray(rules) ? rules : []).map(makeRule);
  for (const kind of ["authorization", "fact"]) {
    const c = conflictsIn(all.filter((r) => r.kind === kind));
    if (c) return { conflict: true, kind, rules: c };
  }
  const binding = all.filter((r) => BINDING.includes(r.kind));
  const c = conflictsIn(binding);
  if (c) return { conflict: true, kind: c[0].kind, rules: c };
  const bound = new Set(binding.map(topic));
  const dropped = all.filter((r) => r.kind === "craft_preference" && bound.has(topic(r)));
  const prefs = all.filter((r) => r.kind === "craft_preference" && !bound.has(topic(r)));
  const pc = conflictsIn(prefs); // preferences that disagree: the later version wins, and says so
  const kept = pc ? prefs.filter((r) => !pc.includes(r) || r === pc.reduce((a, b) => ((b.version || 0) >= (a.version || 0) ? b : a))) : prefs;
  return { conflict: false, rules: [...binding, ...kept], dropped: [...dropped, ...prefs.filter((r) => !kept.includes(r))] };
}

// One production policy, four separate axes (never one "quality" dial). Plan 08 K1.
//   creative:    how many Story / Look alternatives the person is shown. NOT changed by pace, budget or the direct build shape;
//                only an explicit choice (options.alternatives, a series that fixes the look) changes it. Fast = more concise
//                unchosen alternatives (alternative_detail "compact"), never fewer, never a different story type.
//   exploration: how deep research and critique go (limited | normal | expanded; `depth` keeps the older light|standard|deep words)
//   resources:   execution budget (token level, fix rounds, starting build workers, per-packet context budget, spend limit)
//   render:      rough | preview | delivery; a rough or preview is never relabelled delivery
// Readers: Swift FilmPace and crew.mjs --budget / --pace / --lean / --direct / --deep all land here (see fromLegacy / readPolicy):
//   FilmPace fast -> budget lean, standard -> standard, thorough -> full (when no budget is given)
//   --budget lean|standard|full wins over pace; --lean = --budget lean
//   directFilm() / --direct is the BUILD SHAPE (one builder writes the film): execution.build_shape "direct". It does not cut alternatives.
//   --deep = expanded exploration (the disclosed extra spend); also the older long-path override in directFilm()
// Numbers marked `basis: "proposed"` are configurable STARTING values, not measurements and not caps by character count; Plan 14 calibrates them.
const PACES = ["fast", "standard", "thorough"];
const BUDGETS = ["lean", "standard", "full"];
const PACE_BUDGET = { fast: "lean", standard: "standard", thorough: "full" };
const BUDGET_PACE = { lean: "fast", standard: "standard", full: "thorough" };
const LEGACY_DEPTH = { quick: "fast", standard: "standard", deep: "thorough" }; // Swift researchDepth (first version of the setting)
const RENDER_TIERS = ["rough", "preview", "delivery"];
const LEGACY_RENDER = { rough: "draft", preview: "standard", delivery: "high" };
const TABLE = {
  lean: { explore: "limited", legacy_depth: "light", fix_rounds: 1, build_workers: 2, research: { minutes: 2, source_limit: 6 } },
  standard: { explore: "normal", legacy_depth: "standard", fix_rounds: 2, build_workers: 3, research: { minutes: 5, source_limit: 15 } },
  full: { explore: "expanded", legacy_depth: "deep", fix_rounds: 3, build_workers: 4, research: { minutes: null, source_limit: null } },
};
// starting context budget per task class, in ESTIMATED tokens of the inline packet (the rest is by reference). A pressure signal, never a truncation point.
const PACKET_START = { gather: 12000, write: 24000, critique: 24000, build: 60000, direct: 60000 };
export const POLICY_REVISION = 2;
export const PACE_TO_BUDGET = Object.freeze({ ...PACE_BUDGET });
export const BUDGET_TO_PACE = Object.freeze({ ...BUDGET_PACE });

const alt = (n, d) => (Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 6 ? Number(n) : d);
export function productionPolicy({ pace, budget, direct = false, deep = false, alternatives = null, render = null, spend_limit = null, model_choice = null, packet_budget = null, build_workers = null } = {}) {
  const p = PACES.includes(pace) ? pace : BUDGETS.includes(budget) ? BUDGET_PACE[budget] : "standard";
  const b = BUDGETS.includes(budget) ? budget : PACE_BUDGET[p];
  const t = TABLE[b];
  const n = alt(alternatives, 3);
  const tier = RENDER_TIERS.includes(render) ? render : "delivery";
  const workers = direct ? 1 : Math.max(1, Math.min(8, Number(build_workers) || t.build_workers));
  return {
    schema_version: 1,
    policy_revision: POLICY_REVISION,
    status: "proposed_starting_values", // calibrated in Plan 14; edit freely
    pace: p,
    budget: b,
    creative: {
      alternatives: n, story_alternatives: n, look_alternatives: n, source: alternatives == null ? "default" : "user",
      alternative_detail: b === "lean" ? "compact" : "standard", // save first by making the unchosen ones concise
      story_look_distinct: true, story_type_changes_with_pace: false,
      direct: !!direct, // legacy field: the build shape, not a creative cut
    },
    exploration: { level: deep ? "expanded" : t.explore, depth: deep ? "deep" : t.legacy_depth, deep: !!deep, research: { ...t.research, mirrors: "StudioCore/ResearchBudget.swift FilmPace" }, extra_spend_disclosed: !!deep || b === "full" },
    resources: {
      budget: b, fix_rounds: t.fix_rounds,
      parallel_workers: workers, // legacy key = starting ready build workers (Plan 09 raises or lowers it from capacity and throughput)
      build_workers: { start: workers, basis: "proposed", note: "a simple sting or direct film uses one builder; expand only for ready independent tasks" },
      context_budget: { unit: "estimated_tokens", per_packet_start: { ...PACKET_START, ...(packet_budget && typeof packet_budget === "object" ? packet_budget : {}) }, basis: "proposed", on_pressure: "report; mandatory facts, qualifiers and privacy are never truncated; optional material moves to by-reference" },
      spend_limit: spend_limit && typeof spend_limit === "object" ? spend_limit : null, // {tokens, usd}: the person's own limit; null = none set
      model: { choice: model_choice || null, respect_user_choice: true, silent_downgrade_for: [], effort: "by task: no maximum effort for bookkeeping" },
    },
    execution: { build_shape: direct ? "direct" : "scene-fanout", unit_of_policy_change: "pace and budget never change communication kind or story type" },
    render: { tier, quality: LEGACY_RENDER[tier], relabel_rough_as_delivery: false },
  };
}

// Normalise any older settings shape (Swift FilmPace / researchDepth, crew plan with budget|lean|pace|direct, or a policy object) to a policy.
export function fromLegacy(src = {}) {
  const s = src && typeof src === "object" ? src : {};
  if (s.policy_revision && s.creative && s.resources) return s;
  if (s.policy && s.policy.policy_revision) return s.policy;
  const pace = PACES.includes(s.pace) ? s.pace : LEGACY_DEPTH[s.researchDepth] || undefined;
  const budget = BUDGETS.includes(s.budget) ? s.budget : s.lean === true ? "lean" : undefined;
  const alternatives = s.creative && s.creative.alternatives != null ? s.creative.alternatives : s.alternatives;
  return productionPolicy({ pace, budget, direct: !!(s.direct || (s.creative && s.creative.direct)), deep: !!(s.deep || (s.exploration && s.exploration.deep)), alternatives: alternatives ?? null });
}
export const readPolicy = fromLegacy;

// does this policy ask for ONE story and ONE look? Only an explicit user choice (or a series) does; pace and budget never do.
export const collapsesAlternatives = (policy) => !!policy && !!policy.creative && Number(policy.creative.alternatives) === 1;

// ---- V3 W08 (additive): authority split and scoped applicability --------------------------------------------------------------------------------
// resolve() above is unchanged. Binding kinds are FACTUAL authority; craft_preference is TASTE authority. No import of medium-rules (creative-policy imports this file).
// A taste rule may carry applicability { languages?:[], layers?:[], scenes?:[], intervals?:[{t0_s,t1_s}] }; a fact is never scoped away.
export const authorityOf = (rule) => (rule && BINDING.includes(rule.kind) ? "factual" : "taste");
export const splitAuthority = (rules) => {
  const all = (Array.isArray(rules) ? rules : []).map(makeRule);
  return { factual: all.filter((r) => authorityOf(r) === "factual"), taste: all.filter((r) => authorityOf(r) === "taste") };
};
const listHas = (list, v) => !Array.isArray(list) || list.length === 0 || (v != null && list.includes(v));
// ctx: { language, layerId, sceneId, t_s } -> true when the rule governs this point. A rule without applicability governs everywhere (legacy).
export function ruleApplies(rule, ctx = {}) {
  const r = makeRule(rule || {});
  if (authorityOf(r) === "factual") return true;
  const a = r.applicability;
  if (!a || typeof a !== "object") return true;
  if (!listHas(a.languages, ctx.language) || !listHas(a.layers, ctx.layerId) || !listHas(a.scenes, ctx.sceneId)) return false;
  if (Array.isArray(a.intervals) && a.intervals.length) {
    const t = Number(ctx.t_s);
    if (!Number.isFinite(t)) return false;
    return a.intervals.some((i) => t >= Number(i.t0_s) && t < Number(i.t1_s));
  }
  return true;
}
// resolve() over only the rules that govern ctx; the out-of-scope taste rules are returned as `out_of_scope`, never silently deleted
export function resolveScoped(rules, ctx = {}) {
  const all = (Array.isArray(rules) ? rules : []).map(makeRule);
  const inScope = all.filter((r) => ruleApplies(r, ctx));
  return { ...resolve(inScope), out_of_scope: all.filter((r) => !inScope.includes(r)) };
}
