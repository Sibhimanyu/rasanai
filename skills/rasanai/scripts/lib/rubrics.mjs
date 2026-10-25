// Per-communication-kind rubrics and findings (Plan 13 Q3). Extends the existing communication kinds (lib/communication.mjs) and the existing gates; it adds
// NO global quality score. A rubric is a short list of questions a grader answers from evidence in the film, with `unknown` / `not_observed` always allowed.
//   - nothing here requires a villain, twist, peak percentage, shot count or technique count (`assertNoFormula` rejects a rubric that does)
//   - a true benefit shared with competitors is never an automatic failure
//   - a vague heading is a finding only when it stands in for communication the viewer needed (a judgement with evidence, not a word list)
//   - claims and privacy findings are hard blockers; taste findings are reviewable and waivable only through the existing user decision
import { KIND_IDS, COMMUNICATION_KINDS } from "./communication.mjs";

export const VERDICTS = ["pass", "concern", "fail", "unknown", "not_observed"];
export const SEVERITIES = ["blocker", "major", "minor", "note"];
export const CATEGORIES = ["claims", "privacy", "proof_scope", "beat_purpose", "visual_meaning", "takeaway", "readability", "sound", "taste", "other"];
export const HARD_BLOCKER_CATEGORIES = ["claims", "privacy"];
export const WAIVABLE_CATEGORIES = ["taste"]; // only via the existing user decision (a decision id from the user's own choice), never by a grader or agent

// the four shared questions; each kind adds what its assignment owes the viewer
export const SHARED = [
  { id: "proof_scope", ask: "Does the scope of what is shown match the scope of what is promised (breadth for a broad promise, focus for a single feature)?" },
  { id: "beat_purpose", ask: "For each beat: what does it add that the previous beat did not? Name it, or mark the beat as not adding." },
  { id: "visual_meaning", ask: "Do the visual changes (cut, move, reveal, scale) support the meaning of the line they accompany, or only decorate it?" },
  { id: "takeaway", ask: "Does the closing takeaway follow from what was shown, in the viewer's terms?" },
];

const K = (focus, legit, extra = []) => ({ focus, legitimate: legit, extra });
const KINDS = {
  "whole-product-introduction": K("a stranger can say in a sentence what it is and who it is for", "a few representative uses are enough; a feature parade is not breadth", [{ id: "one_proposition", ask: "Is there one proposition a stranger could repeat, with representative proof across uses rather than one scenario?" }]),
  "single-feature-announcement": K("what changed and how to use it", "one task end to end is the whole film", [{ id: "focused", ask: "Does every beat serve the one feature, with no unrelated capability tour?" }]),
  "workflow-demo": K("the job is completed start to finish", "a real or labelled reconstruction of the steps", [{ id: "steps_true", ask: "Are the steps and interface states accurate, and any reconstruction labelled?" }]),
  "instructional-explainer": K("the viewer can explain or do the thing afterwards", "a calm, steady progression is correct for teaching", [{ id: "mental_model", ask: "Does the mechanism or procedure build in an order a newcomer can follow?" }]),
  "brand-manifesto": K("the stance is felt and remembered", "abstraction is legitimate; a product demo is not required", [{ id: "stance", ask: "Is the belief developed beat by beat, in the brand's own words?" }]),
  "identity-reveal": K("the new identity is recognised", "restraint and a long hold on the mark are legitimate", [{ id: "identity_true", ask: "Are the real identity assets shown as approved?" }]),
  "performance-ad": K("the one offered action is clear within seconds", "a fast, plain offer is not a flaw", [{ id: "offer", ask: "Are the offer and its qualifiers on screen long enough to read?" }]),
  teaser: K("anticipation without telling everything", "withholding is the point; the date or next step must be true", [{ id: "no_overclaim", ask: "Does it claim nothing beyond what is confirmed?" }]),
  "event-opener": K("the room is ready and oriented", "simple and short is correct", [{ id: "names_true", ask: "Are names, dates and agenda owner-confirmed?" }]),
  "evidence-case-study": K("the result is believed", "one named result is enough", [{ id: "result_sourced", ask: "Is the result sourced with its qualifiers and permitted use?" }]),
  "character-short": K("the arc is felt", "silence, stillness and a small arc are legitimate", [{ id: "identity_stable", ask: "Does the character stay recognisably the same, with performance that carries meaning?" }]),
  "music-lyric-film": K("the song gets its picture", "track-led timing; no product grammar", [{ id: "track_led", ask: "Do the visuals follow the song's phrasing and meaning rather than a launch template?" }]),
  "footage-led-story": K("what happened, in the speakers' meaning", "plain footage with light graphics is correct", [{ id: "meaning_kept", ask: "Do cuts and captions keep what the speakers meant?" }]),
};

const BANNED_FIELDS = /^(require_?(villain|twist|reversal|peak|shot_?count|technique_?count|forbidden_?words?)|min_?(shots|techniques|villains)|peak_?(pct|percent|at)|mandatory_?.*)$/i;
export function assertNoFormula(rubric) {
  const bad = [];
  (function walk(o) { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (BANNED_FIELDS.test(k)) bad.push(k); walk(v); } })(rubric);
  if (bad.length) throw new Error(`a rubric may not impose a mandatory dramatic formula: ${bad.join(", ")}`);
  return true;
}

export function rubricFor(kind) {
  const k = KINDS[kind];
  if (!k) return null;
  const r = { kind, version: 1, assignment: COMMUNICATION_KINDS[kind] ? { promise: COMMUNICATION_KINDS[kind] } : null, focus: k.focus, legitimate: k.legitimate, questions: [...SHARED, ...k.extra], answers_allowed: VERDICTS, hard_blockers: HARD_BLOCKER_CATEGORIES, not_required: ["villain", "twist", "peak at a set percentage", "shot count", "technique count"], notes: ["a benefit shared with competitors is not a failure when it is true and shown", "a vague heading is a finding only where it replaces communication the viewer needed"] };
  assertNoFormula(r);
  return r;
}
export const allRubrics = () => KIND_IDS.map(rubricFor).filter(Boolean);
export const uncoveredKinds = () => KIND_IDS.filter((k) => !KINDS[k]);

const clamp01 = (x) => (x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x)) ? Math.min(1, Math.max(0, Number(x))) : null);
// a finding: severity, target beat/shot/time, evidence, confidence, proposed repair. A finding without evidence is `unknown`, never a defect.
export function makeFinding(o = {}) {
  const errors = [];
  const category = CATEGORIES.includes(o.category) ? o.category : "other";
  const severity = SEVERITIES.includes(o.severity) ? o.severity : null;
  if (!severity) errors.push("severity");
  const t = o.target || {};
  const target = { beat: t.beat ?? null, shot: t.shot ?? null, time_s: t.time_s !== null && t.time_s !== undefined && Number.isFinite(Number(t.time_s)) ? Number(t.time_s) : null };
  if (target.beat == null && target.shot == null && target.time_s == null) errors.push("target (beat, shot or time_s)");
  const evidence = Array.isArray(o.evidence) ? o.evidence.map(String).filter(Boolean) : o.evidence ? [String(o.evidence)] : [];
  const verdict = VERDICTS.includes(o.verdict) ? o.verdict : "concern";
  if (!evidence.length && !["unknown", "not_observed"].includes(verdict)) errors.push("evidence (or verdict unknown / not_observed)");
  const confidence = clamp01(o.confidence);
  if (confidence == null) errors.push("confidence 0..1");
  if (!["unknown", "not_observed", "pass"].includes(verdict) && !String(o.proposed_repair || "").trim()) errors.push("proposed_repair");
  if (errors.length) return { ok: false, errors };
  return { ok: true, finding: { id: o.id || null, category, severity, verdict, target, evidence, confidence, proposed_repair: String(o.proposed_repair || ""), rubric_question: o.rubric_question || null } };
}

// blockers: claims and privacy never waive. A taste finding waives only with a user decision reference ({ decision_id, by: "user", finding }) from the existing decision flow.
export function resolveFindings(findings = [], { waivers = [] } = {}) {
  const out = { hard_blockers: [], needs_decision: [], waived: [], reviewable: [], unknown: [] };
  for (const f of findings) {
    if (["unknown", "not_observed"].includes(f.verdict)) { out.unknown.push(f); continue; }
    if (f.verdict === "pass") continue;
    if (HARD_BLOCKER_CATEGORIES.includes(f.category) && f.verdict === "fail") { out.hard_blockers.push(f); continue; }
    if (WAIVABLE_CATEGORIES.includes(f.category)) {
      const w = waivers.find((x) => x && x.by === "user" && x.decision_id && x.finding === (f.id || f.target.beat));
      (w ? out.waived : out.needs_decision).push(w ? { ...f, waiver: w } : f);
      continue;
    }
    out.reviewable.push(f);
  }
  return { ...out, can_ship_on_these_findings: out.hard_blockers.length === 0 && out.needs_decision.length === 0 && out.reviewable.filter((f) => f.severity === "blocker").length === 0 };
}

// Q3/Q7: a grader that rewards motion density instead of communication is checked against a person's judgement of a valid calm film.
// pairs: [{ film, density (0..1), model_score, human_score }]. These are per-film grader numbers for THIS check only, not a quality score the product reports.
export function densityBias(pairs = []) {
  const rows = pairs.filter((p) => [p.density, p.model_score, p.human_score].every((x) => x !== null && x !== undefined && Number.isFinite(Number(x))));
  if (rows.length < 3) return { status: "not_run", note: "needs at least 3 films with a human judgement; nothing is concluded from fewer" };
  const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; } return sx && sy ? sxy / Math.sqrt(sx * sy) : 0; };
  const d = rows.map((r) => Number(r.density));
  const model = corr(d, rows.map((r) => Number(r.model_score))), human = corr(d, rows.map((r) => Number(r.human_score)));
  const biased = model - human >= 0.4 && model >= 0.4;
  return { status: biased ? "grader_biased_to_density" : "no_density_bias_observed", model_density_correlation: Math.round(model * 100) / 100, human_density_correlation: Math.round(human * 100) / 100, n: rows.length, action: biased ? "fix the rubric; do not make the generator add motion" : null };
}

// Q3/Q7: a deliberately broken synthetic case must be failed for the RIGHT reason. A grader that is green on everything is not useful.
export function sensitivityCheck({ expected_reason, expected_category, findings = [] }) {
  const fails = findings.filter((f) => f.verdict === "fail" || f.severity === "blocker");
  if (!fails.length) return { ok: false, class: "grader_failure", why: "the grader passed a deliberately broken case" };
  const text = (f) => `${(f.evidence || []).join(" ")} ${f.proposed_repair || ""}`.toLowerCase();
  const right = fails.some((f) => (!expected_category || f.category === expected_category) && (!expected_reason || text(f).includes(String(expected_reason).toLowerCase())));
  return right ? { ok: true } : { ok: false, class: "grader_failure", why: "it failed the case, but not for the planted reason", got: fails.map((f) => f.category) };
}
