// Blind comparison and human calibration (Plan 13 Q4). Extends the existing blind A/B in crew.mjs (`crew.mjs ab`: seeded X/Y order, mapping kept in crew/ab-<k>.json)
// with matched sheets, an enforced separation between the judge packet and the key, order-swapped sampling, baseline provenance rules and a human field that
// a model can never fill. Nothing here runs a model or renders anything.
import crypto from "node:crypto";
import { agentContext } from "./test-approval.mjs";

export const HUMAN_PENDING = "pending_human_review";
const sha = (x) => crypto.createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");
// deterministic PRNG from a seed so a sheet's order is reproducible from the key but not guessable from the packet
function bit(seed, salt) { return parseInt(sha(`${seed}|${salt}`).slice(0, 8), 16) & 1; }

// variants: { a: { label, version, model, media, conditions }, b: {...} } where a = baseline, b = candidate (or any pair). `media` is a path or opaque id.
// shared: { brief, spec, evidence } must be identical for both (the packet carries it once).
// Returns { packet (goes to the judge), key (stored OUTSIDE the judge's reach) }.
export function makeSheet({ id, seed, shared = {}, variants = {}, order = null } = {}) {
  const errors = [];
  if (!id) errors.push("id");
  if (!seed) errors.push("seed");
  for (const s of ["brief", "spec"]) if (shared[s] == null) errors.push(`shared.${s} (the same brief and spec for both sides)`);
  const A = variants.a, B = variants.b;
  if (!A || !B || !A.media || !B.media) errors.push("two variants with media");
  if (errors.length) return { ok: false, errors };
  const first = order ? (order === "ab" ? "a" : "b") : (bit(seed, id) ? "b" : "a"); // order override is for the swapped twin
  const second = first === "a" ? "b" : "a";
  const side = { left: variants[first], right: variants[second] };
  const differ = differingConditions(A.conditions, B.conditions);
  const packet = { schema_version: 1, sheet_id: id, brief: shared.brief, spec: shared.spec, evidence: shared.evidence ?? null, options: { X: { media_ref: `${id}/X`, media: side.left.media }, Y: { media_ref: `${id}/Y`, media: side.right.media } }, rubric_note: "Judge X and Y on the same brief. You are not told which is newer, which model made either, or how they were made." };
  const key = { schema_version: 1, sheet_id: id, seed, mapping: { X: first, Y: second }, labels: { a: pick(A), b: pick(B) }, conditions_differ: differ, record_note: "keep this file outside the judge packet and outside the judge's working directory", packet_digest: sha(packet) };
  const leak = leaks(packet, key);
  if (leak.length) return { ok: false, errors: [`blind packet leaks: ${leak.join(", ")}`] };
  return { ok: true, packet, key };
}
const pick = (v) => ({ label: v.label || null, version: v.version || null, model: v.model || null, conditions: v.conditions || {} });

// condition keys whose values differ between sides (recorded so a comparison that changed several things cannot be attributed to one)
export function differingConditions(a = {}, b = {}) {
  return [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k])).sort();
}

// identifiers that must not appear anywhere in the judge packet
export function leaks(packet, key) {
  const text = JSON.stringify(packet).toLowerCase();
  const secrets = [];
  for (const s of ["a", "b"]) { const l = key.labels[s]; for (const v of [l.label, l.version, l.model]) if (v && String(v).length >= 3) secrets.push(String(v)); }
  const found = secrets.filter((s) => text.includes(s.toLowerCase()));
  if (/\b(baseline|candidate|old version|new version|previous version|before|after)\b/.test(JSON.stringify(packet.options || {}).toLowerCase())) found.push("version word in options");
  if (/(claude-|opus|sonnet|haiku|gpt-|gemini|v\d+\.\d+\.\d+)/i.test(JSON.stringify(packet.options || {}))) found.push("model or version string in options");
  return [...new Set(found)];
}
export const assertBlind = (packet, key) => { const l = leaks(packet, key); if (l.length) throw new Error(`judge packet is not blind: ${l.join(", ")}`); return true; };

// order-swapped sampling: every pair is judged in both orders so a positional effect can be seen
export function swappedPair({ id, seed, shared, variants }) {
  const one = makeSheet({ id: `${id}-ab`, seed, shared, variants, order: "ab" });
  const two = makeSheet({ id: `${id}-ba`, seed, shared, variants, order: "ba" });
  if (!one.ok) return one;
  if (!two.ok) return two;
  return { ok: true, sheets: [one, two] };
}
// results: [{ sheet_id, chose: "X"|"Y"|"tie"|"unknown", key }] -> positional effect and a consistency table. n small => `insufficient` (no conclusion).
export function positionalEffect(results = []) {
  const rows = results.filter((r) => ["X", "Y"].includes(r.chose));
  if (rows.length < 4) return { status: "insufficient_samples", n: rows.length };
  const first = rows.filter((r) => r.chose === "X").length / rows.length;
  const byPair = new Map();
  for (const r of rows) { const base = String(r.sheet_id).replace(/-(ab|ba)$/, ""); const w = r.key.mapping[r.chose]; (byPair.get(base) || byPair.set(base, []).get(base)).push(w); }
  const both = [...byPair.values()].filter((v) => v.length === 2);
  const consistent = both.filter((v) => v[0] === v[1]).length;
  return { status: Math.abs(first - 0.5) >= 0.2 ? "positional_effect_suspected" : "no_strong_positional_effect", first_position_rate: Math.round(first * 100) / 100, n: rows.length, pairs_judged_both_orders: both.length, order_consistent_pairs: consistent };
}

// model grading is triage; the human field stays pending until a person assesses. Records are plain objects the caller persists.
export function newReviewRecord(sheet_id) { return { sheet_id, model_review: null, human_review: { status: HUMAN_PENDING }, disagreement: null }; }
export function recordModelReview(rec, { reviewer = {}, chose, notes = "", context = {} } = {}) {
  if (!reviewer.id) throw new Error("model review needs a reviewer id");
  if (context.shares_creator_scratchpad) throw new Error("model grading must run in an independent review context, not the creator's scratchpad");
  return { ...rec, model_review: { reviewer: { id: reviewer.id, type: "model", model: reviewer.model || null }, chose, notes, independent_context: true, at: new Date().toISOString() }, human_review: rec.human_review }; // never touches human_review
}
export function recordHumanReview(rec, { reviewer = {}, chose, notes = "" } = {}, env = process.env) {
  if (reviewer.type !== "person" || !reviewer.name) throw new Error("a human review needs a named person (reviewer.type = person)");
  if (agentContext(env)) throw new Error("refused: a human review cannot be recorded from an agent or CI context");
  const human = { status: "assessed", reviewer: { type: "person", name: reviewer.name }, chose, notes, at: new Date().toISOString() };
  const m = rec.model_review;
  const disagreement = m && m.chose && chose && m.chose !== chose && !["tie", "unknown"].includes(m.chose) ? { model_chose: m.chose, human_chose: chose, kept: "both", note: "stored as is; not forced to agree" } : null;
  return { ...rec, human_review: human, disagreement };
}
export const humanPending = (rec) => rec.human_review && rec.human_review.status === HUMAN_PENDING;

// Baseline provenance: a real earlier version, or a baseline built in an isolated checkout during APPROVED Plan 14. Never a degraded candidate labelled old.
export function checkBaseline(b = {}) {
  const errors = [];
  if (!["earlier_version", "isolated_checkout"].includes(b.kind)) errors.push("kind must be earlier_version or isolated_checkout");
  if (!b.commit) errors.push("commit of the baseline system");
  if (b.degraded === true || b.derived_from_candidate === true || /degrad|disable|stripped|crippl/i.test(String(b.how_produced || ""))) errors.push("a degraded or derived-from-candidate output cannot be labelled the old system");
  if (b.kind === "isolated_checkout" && !(b.worktree_path && b.approval_ref)) errors.push("an isolated-checkout baseline needs the worktree path and the user's testing-approval reference");
  if (b.kind === "earlier_version" && !b.artifact_digest) errors.push("artifact digest of the real earlier output");
  if (b.runtime_class && b.compared_runtime_class && b.runtime_class !== b.compared_runtime_class) errors.push(`not like for like: ${b.runtime_class} vs ${b.compared_runtime_class} (e.g. a cheap derived operation versus a full generation)`);
  return errors.length ? { ok: false, errors } : { ok: true };
}

// ---- retell-first review (V3 W09; references/temporal-review.md) ------------------------------------------------------------------------
// The retell packet holds ONLY what a first-time viewer has: the output identity and the intervals to watch. It never carries the approved intent,
// the commitments' wording, the builder's notes or the production explanation. The comparison packet is built second, after the retell is recorded.
// Consumers: the film critic dispatch in crew.mjs (proposed patch) and creative-completion.assessCompletion (reads review.retell.before_intent).
export function retellPacket({ output = {}, intervals = [] } = {}) {
  const ivs = (Array.isArray(intervals) ? intervals : []).filter((i) => i && Number.isFinite(Number(i.start_s)) && Number.isFinite(Number(i.end_s))).map((i) => ({ id: i.id ?? null, start_s: Number(i.start_s), end_s: Number(i.end_s) }));
  return { kind: "retell_packet", output: { digest: output.digest || null, duration_s: output.duration_s ?? null, fps: output.fps ?? null }, watch_intervals: ivs, ask: "Describe what happens, in order, and what a first-time viewer could infer. Do not look for anything you were not shown.", withheld: ["approved intent", "commitment wording", "builder notes", "scene types"] };
}
// recorded after the reviewer's retell; `text` is the retell, `intent` the approved description it is then compared with
export function compareRetell({ retell = {}, intent = {}, order = {} } = {}) {
  const written = order.retell_at != null && order.intent_read_at != null ? Number(order.retell_at) <= Number(order.intent_read_at) : retell.before_intent === true;
  return { text: String(retell.text || "").trim(), before_intent: written === true, match: ["yes", "partly", "no"].includes(retell.match) ? retell.match : null, compared_with: intent && intent.id ? intent.id : null };
}
