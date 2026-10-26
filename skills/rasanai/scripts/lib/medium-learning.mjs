// Evidence-grounded, scoped medium lessons (Part 2, M08). implemented_unvalidated.
// A thin metadata layer over the ONE rules store (scripts/lessons.mjs -> lessons.jsonl, scope rules in lib/lessons-scope.mjs). It makes and selects records; it never
// reads or writes lessons.jsonl, never calls a model, and there is no second memory file. The lead wires the existing reader/writer (see toLessonArgs).
// Rules (spec 03 section 5, guardrails): a human-preference lesson needs a real human feedback reference (a user note or a human review); an agent self-score cannot supply it.
// An accepted edit is a preference for that case, not causality or a law: no category bans from one rejected film, no cross-project private data, nothing that overrides
// facts, rights, the user's current instruction or a style's own constraints. A candidate is never approved here: the person confirms through the existing flow.
import { buildLesson, applicable, resolveAgainstInstruction, STYLE_TTL_DAYS } from "./lessons-scope.mjs";

export const MEDIUM_LESSON_FORMAT = "medium-lesson@1";
export const HUMAN_SOURCES = Object.freeze(["user_note", "human_review"]); // lessons-scope SOURCE_TYPES minus the machine ones
export const MEDIUM_SCOPES = Object.freeze(["film", "brand", "user", "series", "format", "communication-kind", "medium", "technical-defect"]);
// where each scope lives in lessons-scope (film cannot persist: it lives in the run; kind/medium ride a format-like key and stay filtered by the metadata below)
const STORE_SCOPE = { brand: "brand", user: "user", series: "series", format: "format" };
export const MAX_QUOTE = 280;
export const FOCUS_MAX = 160;
// repeated-evidence threshold before a lesson may reach beyond the brand/user/series that gave it
export const GENERALIZE_MIN_FILMS = 3;

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const arr = (x) => (Array.isArray(x) ? x : []);
const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "it", "that", "this", "one", "two", "into", "from", "as", "by"]);
const keyWords = (s) => words(s).filter((w) => w.length > 2 && !STOP.has(w));
const cut = (s, n) => { const t = str(s).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

const revisionOk = (x) => isObj(x) && str(x.artifact_ref).trim() && (str(x.revision).trim() || str(x.source_hash).trim());
const revisionOut = (x) => ({ artifact_ref: str(x.artifact_ref), revision: str(x.revision) || null, source_hash: str(x.source_hash) || null, mechanism: cut(x.mechanism, 200) });

// before / after: { artifact_ref, revision?, source_hash?, mechanism }  (old and new artifact + source revisions; mechanism = what actually changed in how the idea was shown)
// humanFeedback: { ref, source_type: "user_note"|"human_review", quote, at?, decision?: "accepted"|"preferred"|"rejected" }  (the person's own words or approval record)
// context: { film_id?, brand?, series?, user?, format?, medium (profile id), communication_kind?, problem, scope?: one of MEDIUM_SCOPES (default "film"), focus?, outcome?, films_seen? }
// evidence: [{ ref, kind }]  (gate reports, receipts, the artifact paths: supporting, never a substitute for humanFeedback)
// -> { ok, candidate, provenance, uncertainty, errors, requires_person: true }   No implied approval, no write.
export function extractMediumLesson({ before, after, humanFeedback, context = {}, evidence = [] } = {}) {
  const errors = [];
  if (!revisionOk(before)) errors.push("before: an artifact_ref and a revision or source_hash (old revision)");
  if (!revisionOk(after)) errors.push("after: an artifact_ref and a revision or source_hash (new revision)");
  if (revisionOk(before) && revisionOk(after) && str(before.artifact_ref) === str(after.artifact_ref) && str(before.revision) === str(after.revision) && str(before.source_hash) === str(after.source_hash)) errors.push("before and after are the same revision: nothing changed");
  if (!str(before && before.mechanism).trim() || !str(after && after.mechanism).trim()) errors.push("before.mechanism and after.mechanism: the actual changed mechanism");
  const hf = humanFeedback;
  if (!isObj(hf) || !str(hf.ref).trim()) errors.push("humanFeedback.ref: a real human feedback or approval reference is required; an agent self-score cannot supply it");
  else if (!HUMAN_SOURCES.includes(hf.source_type)) errors.push(`humanFeedback.source_type must be ${HUMAN_SOURCES.join(" or ")} (agent, gate or retrieved text is not human preference)`);
  else if (!str(hf.quote).trim() && !str(hf.decision).trim()) errors.push("humanFeedback needs the person's exact words (quote) or a recorded decision");
  const medium = str(context.medium).trim(), problem = str(context.problem).trim();
  if (!medium) errors.push("context.medium: the selected medium profile");
  if (!problem) errors.push("context.problem: the communication problem the change addressed");
  const scope = str(context.scope, "film");
  if (!MEDIUM_SCOPES.includes(scope)) errors.push(`context.scope must be one of ${MEDIUM_SCOPES.join(", ")}`);
  const scopeId = scopeIdFor(scope, context);
  if (!scopeId && scope !== "technical-defect" && scope !== "medium") errors.push(`context needs the ${scope} id for a ${scope}-scoped lesson (no unscoped lesson)`);
  if (errors.length) return { ok: false, candidate: null, provenance: null, uncertainty: null, errors, requires_person: true };

  const rejected = str(hf.decision) === "rejected";
  const quote = cut(hf.quote, MAX_QUOTE);
  const preference = rejected
    ? `for ${medium} on "${cut(problem, 100)}", the person did not accept: ${cut(before.mechanism, 120)}`
    : `for ${medium} on "${cut(problem, 100)}", the person preferred ${cut(after.mechanism, 120)} over ${cut(before.mechanism, 120)}`;
  const films = Math.max(1, Number(context.films_seen) || 1);
  const reasons = ["one accepted edit is a preference for this case, not proof of cause"];
  if (films < GENERALIZE_MIN_FILMS) reasons.push(`seen in ${films} film(s): stays inside its scope until ${GENERALIZE_MIN_FILMS}+ separate films agree`);
  if (!arr(evidence).length) reasons.push("no supporting artifacts attached");
  if (rejected) reasons.push("a rejection is about this solution here, never a ban on the medium or style");
  const level = films >= GENERALIZE_MIN_FILMS && arr(evidence).length ? "medium" : "low";
  const candidate = {
    format: MEDIUM_LESSON_FORMAT, status: "candidate", nature: "style",
    rule: cut(`In ${scopeLabel(scope, context)}, ${preference}.`, 300),
    focus: context.focus ? cut(context.focus, FOCUS_MAX) : null, // the compact /brag-style one-line creative assignment this lesson served, when there was one
    medium, problem: cut(problem, 200), communication_kind: str(context.communication_kind) || null, format_id: str(context.format) || null,
    scope: { type: scope, id: scopeId || null }, outcome: str(context.outcome) || (rejected ? "rejected-by-person" : "accepted-by-person"),
    before: revisionOut(before), after: revisionOut(after), changed_mechanism: { from: cut(before.mechanism, 200), to: cut(after.mechanism, 200) },
    persistable_in_store: !!STORE_SCOPE[scope] && !!scopeId, // film / medium / kind / defect scope: kept in the run or its packet, not in the user's lessons.jsonl
    overrides: [], // a lesson never overrides facts, rights, the current user instruction or a style's own constraints: stated, not configurable
    ttl_days: STYLE_TTL_DAYS,
  };
  const provenance = { human_feedback: { ref: str(hf.ref), source_type: hf.source_type, quote: quote || null, decision: str(hf.decision) || null, at: str(hf.at) || null }, run: str(context.film_id) || null, evidence: arr(evidence).filter((e) => isObj(e) && str(e.ref)).map((e) => ({ ref: str(e.ref), kind: str(e.kind) || "artifact" })), self_score_used: false };
  return { ok: true, candidate, provenance, uncertainty: { level, reasons }, errors: [], requires_person: true };
}

function scopeIdFor(scope, c) {
  const pick = { film: c.film_id, brand: c.brand, user: c.user || "*", series: c.series, format: c.format, "communication-kind": c.communication_kind, medium: c.medium, "technical-defect": c.defect_id || c.medium };
  return str(pick[scope]).trim();
}
const scopeLabel = (scope, c) => ({ film: "this film", brand: `brand ${str(c.brand)}`, user: "this user's films", series: "this series", format: `the ${str(c.format)} format`, "communication-kind": `${str(c.communication_kind)} films`, medium: `${str(c.medium)} work`, "technical-defect": `${str(c.medium)} work (technical defect)` })[scope];

// The exact arguments for the EXISTING store, for the lead to hand to lessons.mjs addLesson() AFTER the person confirms (the candidate itself is not approval).
// -> { ok, args } | { ok:false, why }   args match addLesson({ rule, quote, kind, area, run, scope, "scope-id", rationale, confidence, nature }); source is always "user" (a human reference is required to get here).
export function toLessonArgs(extracted, { personConfirmed = false } = {}) {
  if (!extracted || !extracted.ok) return { ok: false, why: "no valid candidate" };
  if (personConfirmed !== true) return { ok: false, why: "a person confirms the lesson through the existing flow first; extraction is never approval" };
  const c = extracted.candidate, p = extracted.provenance;
  if (!c.persistable_in_store) return { ok: false, why: `${c.scope.type}-scoped lessons are kept with the run/packet, not in the user's lesson store` };
  const probe = buildLesson({ rule: c.rule, observation: { text: p.human_feedback.quote || c.rule, quote: p.human_feedback.quote, source_type: p.human_feedback.source_type, run: p.run }, scope: { type: STORE_SCOPE[c.scope.type], id: c.scope.id }, rationale: `${c.changed_mechanism.to} was chosen over ${c.changed_mechanism.from} (${p.human_feedback.ref})`, confidence: extracted.uncertainty.level === "medium" ? "medium" : "low", nature: "style" });
  if (!probe.ok) return { ok: false, why: probe.errors.join("; ") };
  return { ok: true, args: { rule: c.rule, quote: p.human_feedback.quote || "", kind: "taste", area: "look", run: p.run || undefined, source: "user", scope: STORE_SCOPE[c.scope.type], "scope-id": c.scope.id, rationale: `${c.changed_mechanism.to} was chosen over ${c.changed_mechanism.from} (${p.human_feedback.ref})`, confidence: extracted.uncertainty.level === "medium" ? "medium" : "low", nature: "style" }, extra_metadata: { medium: c.medium, problem: c.problem, communication_kind: c.communication_kind, before: c.before, after: c.after, feedback_ref: p.human_feedback.ref } };
}

// records: lesson rows as the existing reader returns them, with the optional `medium_meta` the lead keeps beside them: { medium, problem, communication_kind, scope_type, film_id, status, superseded_by, contradicted_by }
// assignment: { problem, communication_kind?, film_id?, brand?, series?, format?, user?: "*" , style_constraints?:[words] }
// selectedProfile: the chosen medium profile id; instruction: optional { source:"user", overrides:[ids|"*"] }
// -> { selected (<= limit, default 3), excluded:[{id, reason}] }   No write, no model call. Filters run BEFORE any lesson reaches a packet.
export function selectMediumLessons({ records = [], assignment = {}, selectedProfile = "", limit = 3, instruction = null, now = new Date() } = {}) {
  const excluded = [];
  const cap = Math.max(1, Math.min(3, Number(limit) || 3));
  const ctx = { user: assignment.user || "*", brand: assignment.brand || null, series: assignment.series || null, format: assignment.format || null };
  const live = new Set(applicable(arr(records), ctx, now).map((r) => r.id)); // scope and expiry via the existing rules
  const want = new Set(keyWords(assignment.problem));
  const pool = [];
  for (const r of arr(records)) {
    const id = r.id || "?", m = r.medium_meta || r.medium || {};
    const meta = isObj(m) ? m : {};
    if (!meta.medium) { excluded.push({ id, reason: "no medium metadata: an ordinary lesson, loaded by the existing role blocks, not as a medium lesson" }); continue; }
    if (meta.medium !== selectedProfile) { excluded.push({ id, reason: `for ${meta.medium}, not ${selectedProfile || "the selected profile"}` }); continue; }
    if (["revoked", "contradicted", "superseded", "expired"].includes(str(r.status)) || meta.superseded_by || meta.contradicted_by) { excluded.push({ id, reason: "revoked, contradicted or superseded" }); continue; }
    if (!live.has(id) && !(meta.scope_type === "film" && meta.film_id && meta.film_id === assignment.film_id)) { excluded.push({ id, reason: "outside its scope or expired for this film" }); continue; }
    if (meta.scope_type === "film" && meta.film_id !== assignment.film_id) { excluded.push({ id, reason: "film-scoped to a different film: never carried across projects" }); continue; }
    if (meta.communication_kind && assignment.communication_kind && meta.communication_kind !== assignment.communication_kind) { excluded.push({ id, reason: `taught for ${meta.communication_kind} films` }); continue; }
    const constraint = arr(assignment.style_constraints).map((w) => String(w).toLowerCase());
    if (constraint.length && keyWords(r.rule).some((w) => constraint.includes(w) && /\b(avoid|never|not|instead)\b/i.test(r.rule))) { excluded.push({ id, reason: "conflicts with a constraint the selected style or brand states: constraints win" }); continue; }
    const hits = keyWords(meta.problem || r.rule).filter((w) => want.has(w)).length;
    if (!hits) { excluded.push({ id, reason: "same medium, different communication problem" }); continue; }
    pool.push({ r, s: hits * 2 + (r.seen || 1) + (r.confidence === "high" ? 2 : r.confidence === "medium" ? 1 : 0) });
  }
  pool.sort((a, b) => b.s - a.s || String(b.r.last || "").localeCompare(String(a.r.last || "")) || String(a.r.id).localeCompare(String(b.r.id)));
  const top = pool.slice(0, cap).map((x) => x.r);
  for (const x of pool.slice(cap)) excluded.push({ id: x.r.id, reason: `beyond the ${cap} lesson limit` });
  const { applied, set_aside } = resolveAgainstInstruction(top, instruction);
  for (const s of set_aside) excluded.push(s);
  return { selected: applied.map((r) => ({ id: r.id, rule: r.rule, scope: r.scope || { type: "user", id: "legacy_unscoped" }, confidence: r.confidence || "low", seen: r.seen || 1, advisory: true, note: "a lean from this person's own earlier choice: follow it when it fits, drop it when the story or the current instruction says otherwise" })), excluded };
}
