// Bounded learning (Plan 13 Q6). Extends lessons.mjs (the ONE rules store, lessons.jsonl) with scope, source observation, rationale, confidence, expiry and review.
// Old rows (no `scope`) still read: they are `legacy_unscoped` user notes and keep working exactly as before.
//   - fact/safety constraints are kept apart from style preferences; style expires or is reviewed, safety is reviewed, never silently dropped
//   - a taste preference is scoped to the user, brand, series or format that gave it; "I disliked one speech bubble" is not a global ban
//   - a deterministic issue is better as a corrective test or helper: the lesson then points at it (`corrective_artifact`)
//   - a global craft change needs evidence and a human review, cannot override a new user instruction, and retrieved content is never an authority
import crypto from "node:crypto";

export const SCOPES = ["user", "brand", "series", "format"];
export const NATURES = ["fact_safety", "style", "deterministic"];
export const SOURCE_TYPES = ["user_note", "gate_failure", "human_review", "self_observation"]; // retrieved web/transcript/README content is NOT a source type
export const CONFIDENCE = ["low", "medium", "high"];
export const STYLE_TTL_DAYS = 180;
export const REVIEW_AFTER_DAYS = 365;
export const MAX_HARD_RULES_PER_SCOPE = 12;
const DAY = 86400000;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// o: { rule, observation: { text, source_type, quote?, run?, at? }, scope: { type, id }, rationale, confidence, nature, corrective_artifact?, evidence?:[], human_review?:{...} }
export function buildLesson(o = {}, now = new Date()) {
  const errors = [];
  const obs = o.observation || {};
  if (!String(o.rule || "").trim()) errors.push("rule");
  if (!String(obs.text || obs.quote || "").trim()) errors.push("observation.text (the source observation)");
  if (!SOURCE_TYPES.includes(obs.source_type)) errors.push(`observation.source_type must be ${SOURCE_TYPES.join(", ")} (retrieved content is not a source)`);
  if (!String(o.rationale || "").trim()) errors.push("rationale");
  if (!CONFIDENCE.includes(o.confidence)) errors.push(`confidence must be ${CONFIDENCE.join(", ")}`);
  if (!NATURES.includes(o.nature)) errors.push(`nature must be ${NATURES.join(", ")}`);
  const scopeType = o.scope && o.scope.type;
  const global = scopeType === "global_craft";
  if (!global && (!SCOPES.includes(scopeType) || !String((o.scope || {}).id || "").trim())) errors.push(`scope must be one of ${SCOPES.join(", ")} with an id (or global_craft with evidence and a human review)`);
  if (o.nature === "deterministic" && !o.corrective_artifact) errors.push("a deterministic issue should become a corrective test or helper: name it in corrective_artifact");
  if (global) {
    const ev = Array.isArray(o.evidence) ? o.evidence.filter((e) => e && (e.ref || e.path)) : [];
    if (ev.length < 2) errors.push("a global craft change needs at least two pieces of evidence");
    const hr = o.human_review;
    if (!hr || hr.reviewer_type !== "person" || !hr.reviewer || hr.decision !== "approved") errors.push("a global craft change needs an approving human review before it applies");
  }
  if (errors.length) return { ok: false, errors };
  const t = now.toISOString();
  return { ok: true, lesson: { id: crypto.createHash("sha1").update(norm(o.rule) + JSON.stringify(o.scope) + t).digest("hex").slice(0, 8), rule: String(o.rule).trim(), observation: { text: String(obs.text || obs.quote), source_type: obs.source_type, quote: obs.quote || null, run: obs.run || null, at: obs.at || t }, scope: global ? { type: "global_craft", id: "all" } : { type: scopeType, id: String(o.scope.id) }, rationale: String(o.rationale), confidence: o.confidence, nature: o.nature, corrective_artifact: o.corrective_artifact || null, evidence: o.evidence || [], human_review: o.human_review || null, status: global ? "approved_global" : "active", first: t, last: t, seen: 1, expires: o.nature === "style" ? new Date(now.getTime() + STYLE_TTL_DAYS * DAY).toISOString() : null, review_after: new Date(now.getTime() + REVIEW_AFTER_DAYS * DAY).toISOString() } };
}

// old rows: no scope. Read as the user's own legacy note; never expired automatically, never widened.
export const isLegacy = (r) => !r.scope;
export const effective = (r) => (isLegacy(r) ? { ...r, scope: { type: "user", id: "legacy_unscoped" }, nature: r.nature || (r.kind === "error" ? "fact_safety" : "style"), legacy: true } : r);

// dedupe by rule + scope; the same note again bumps `seen` and refreshes the expiry of a style lesson
export function dedupe(rows = []) {
  const m = new Map(), dropped = [];
  for (const r of rows) {
    const k = `${norm(r.rule)}|${r.scope ? r.scope.type + ":" + r.scope.id : "legacy"}`;
    const hit = m.get(k);
    if (!hit) { m.set(k, { ...r }); continue; }
    hit.seen = (hit.seen || 1) + (r.seen || 1); hit.last = [hit.last, r.last].filter(Boolean).sort().pop() || hit.last; dropped.push(r.id);
    if (hit.nature === "style" && hit.expires) hit.expires = new Date(Date.parse(hit.last) + STYLE_TTL_DAYS * DAY).toISOString();
  }
  return { rows: [...m.values()], merged: dropped };
}

// expire style lessons, flag everything past review_after; fact/safety is never auto-removed, only flagged for review
export function sweep(rows = [], now = new Date()) {
  const keep = [], expired = [], review_due = [];
  for (const r of rows) {
    if (r.nature === "style" && r.expires && new Date(r.expires) < now) { expired.push(r); continue; }
    if (r.review_after && new Date(r.review_after) < now) review_due.push(r.id);
    keep.push(r);
  }
  return { keep, expired, review_due };
}

// scope filter: a lesson applies only inside the scope that gave it. context: { user, brand, series, format }
export function applicable(rows = [], context = {}, now = new Date()) {
  return sweep(rows.map(effective), now).keep.filter((r) => {
    if (r.status && !["active", "approved_global"].includes(r.status)) return false;
    if (r.scope.type === "global_craft") return r.status === "approved_global" && !!r.human_review;
    if (r.legacy) return true;
    if (r.scope.type === "user" && context.user === "*") return true; // this machine's user: a user-scoped lesson applies to their films
    return context[r.scope.type] != null && String(context[r.scope.type]) === String(r.scope.id);
  });
}

// the current user instruction always wins; a lesson it contradicts is set aside for this film (not deleted)
// instruction: { text, overrides: [lesson ids or "*" ] } as parsed by the caller; retrieved content never counts as an instruction
export function resolveAgainstInstruction(lessons = [], instruction = null) {
  if (!instruction || instruction.source !== "user") return { applied: lessons, set_aside: [] };
  const o = new Set((instruction.overrides || []).map(String));
  const set_aside = lessons.filter((l) => o.has("*") || o.has(l.id));
  return { applied: lessons.filter((l) => !set_aside.includes(l)), set_aside: set_aside.map((l) => ({ id: l.id, why: "overridden by the current user instruction" })) };
}

// cap hard (fact/safety) rules per scope so lessons do not become a prompt monster; conflicts inside one scope are surfaced, never auto-resolved
export function pressure(rows = []) {
  const by = {};
  for (const r of rows.map(effective)) if (r.nature !== "style") (by[`${r.scope.type}:${r.scope.id}`] ||= []).push(r.id);
  const over = Object.entries(by).filter(([, ids]) => ids.length > MAX_HARD_RULES_PER_SCOPE).map(([scope, ids]) => ({ scope, count: ids.length, action: "review and merge; do not add more hard rules" }));
  return { over_limit: over, hard_rule_counts: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])) };
}
export function conflicts(rows = []) {
  const out = [], eff = rows.map(effective);
  for (let i = 0; i < eff.length; i++) for (let j = i + 1; j < eff.length; j++) {
    const a = eff[i], b = eff[j];
    if (`${a.scope.type}:${a.scope.id}` !== `${b.scope.type}:${b.scope.id}`) continue;
    if (a.topic && a.topic === b.topic && a.polarity && b.polarity && a.polarity !== b.polarity) out.push({ a: a.id, b: b.id, topic: a.topic, scope: a.scope });
  }
  return out;
}
