// Story treatment v2 (Plan 03 S2/S4/S6/S7): semantic fields with stable ids, a format-aware review that judges meaning (not banned strings),
// a coverage ledger, candidate comparison, and readers that keep every saved film parsing.
//   normalizeTreatment(raw)           -> a v2 shaped copy (never mutates; legacy field spellings accepted)
//   readTreatment(obj)                -> { ok, legacy, source, treatment } for a v2 treatment, a legacy pitch or a legacy intent; a legacy film is adapted, never rewritten
//   validateTreatment(t, ctx)         -> { ok, verdict, errors, concerns, craft, issues, ledger }   issues = [{ issue_id, beat, evidence, severity, fix, class }]
//   validateTreatmentSet(set, ctx)    -> per-candidate results + diversity + escalation advice
//   coverageLedger(t, ctx)            -> { rows, excluded, problems }   each required takeaway -> beat -> evidence / visual event
//   compareCandidates(list)           -> { pairs, distinct, insufficient }   by proof selection, order, perspective, premise; never by decoration
//   validateReview(review)            -> { ok, problems }   the editor's structured review file
//   toLegacyPitch(t) / toIntent(t)    -> the shapes the existing Story card, Moves pass and structure critic read
// Severity: error = mechanical or factual (blocks); major = creative concern that blocks acceptance (the editor says rewrite); minor = creative note;
// craft = an optional choice, assessed for purpose and never required or banned.
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";
import { STORY_GRAMMARS, OPTIONAL_TOOL_IDS } from "./story-grammars.mjs";
import { KIND_IDS } from "./communication.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : x == null ? d : String(x));
const T = (x) => str(x).trim();

export const STORY_FORMAT = "v2";
export const SEVERITIES = ["error", "major", "minor", "craft"];
export const ISSUE_CLASSES = ["mechanical", "creative", "craft"];
export const CHANNEL_MODES = ["split", "caption", "emphasis", "screen-only", "voice-only", "silent", "accessibility"];
export const RELATIONS_V2 = ["open", "because", "but", "so", "example", "escalation", "answer", "then", "contrast"];
export const TAGS = ["Sure", "Bold", "Wild"];

const STOP = new Set("a an the and or of to in on for with is are be it its this that your you we our as at by from into than then so but not no can will just about over under more most very".split(" "));
const ABSTRACT = new Set("desire possibility possibilities transformation transform potential imagination future journey unlock unleash endless limitless innovation inspire inspiration dream dreams vision magic wonder essence evolution reimagine reimagined beyond infinite".split(" "));
const words = (s) => T(s).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
const content = (s) => words(s).filter((w) => w.length > 2 && !STOP.has(w));
const slug = (s) => words(s).slice(0, 4).join("-") || "beat";
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return 1; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };

// ---- shapes ------------------------------------------------------------------------
export const defaultTreatmentBeat = (over = {}) => ({
  id: "", internal_beat_label: "", grammar_role: "", viewer_takeaway: "", on_screen: "", voiceover: null,
  visual_event: { before: "", change: "", after: "" }, evidence_refs: [], relation_to_previous: "", duration_provisional_s: 0,
  channel_role: { mode: "split", reason: "" }, camera_plan: null, ...over,
});
export const defaultTreatment = (over = {}) => ({
  schema_version: SCHEMA_VERSION, story_format: STORY_FORMAT, id: "", tag: null, treatment_title: "", premise: "", logline: "", communication_kind: "",
  proposition: "", viewer_takeaway: "", perspective: "", takeaways: [], beats: [], coverage: { ledger: [], excluded: [] }, claims: [], optional_tools: [], abstraction: null, ...over,
});

// accept the writer's spellings (title, vo, id-less beats) and give every beat a stable id; never mutates the input
export function normalizeTreatment(raw) {
  const r = isObj(raw) ? raw : {};
  const used = new Set();
  const beats = arr(r.beats).map((b0, i) => {
    const b = isObj(b0) ? b0 : {};
    const ve = isObj(b.visual_event) ? b.visual_event : { before: "", change: str(b.visual), after: "" };
    let id = T(b.id) || `beat-${slug(b.internal_beat_label || b.name || b.viewer_takeaway || String(i + 1))}`;
    if (used.has(id)) id = `${id}-${i + 1}`;
    used.add(id);
    const cr = isObj(b.channel_role) ? b.channel_role : { mode: str(b.channel_role), reason: "" };
    return defaultTreatmentBeat({
      ...b, id, internal_beat_label: T(b.internal_beat_label || b.name), viewer_takeaway: T(b.viewer_takeaway || b.buys), on_screen: str(b.on_screen),
      voiceover: b.voiceover != null ? str(b.voiceover) : b.vo != null ? str(b.vo) : null, visual_event: { before: T(ve.before), change: T(ve.change), after: T(ve.after) },
      evidence_refs: arr(b.evidence_refs).map(String), relation_to_previous: T(b.relation_to_previous || b.relation), duration_provisional_s: Number(b.duration_provisional_s ?? b.duration_s) || 0,
      channel_role: { mode: T(cr.mode) || "split", reason: T(cr.reason) },
    });
  });
  const take = arr(r.takeaways).map((x, i) => (isObj(x) ? { id: T(x.id) || `t${i + 1}`, text: T(x.text), required: x.required !== false } : { id: `t${i + 1}`, text: T(x), required: true }));
  return defaultTreatment({
    ...r, id: T(r.id) || slug(r.treatment_title || r.title || r.tag), tag: TAGS.includes(r.tag) ? r.tag : TAGS.includes(r.label) ? r.label : null,
    treatment_title: T(r.treatment_title || r.title), premise: T(r.premise), logline: T(r.logline), communication_kind: T(r.communication_kind), proposition: T(r.proposition),
    viewer_takeaway: T(r.viewer_takeaway), perspective: T(r.perspective), takeaways: take, beats,
    coverage: { ledger: arr(r.coverage && r.coverage.ledger), excluded: arr(r.coverage && r.coverage.excluded) }, claims: arr(r.claims), optional_tools: arr(r.optional_tools),
  });
}

// ---- the legacy reader -------------------------------------------------------------
// A saved film keeps parsing: a legacy pitch (beats name / on_screen / vo / visual / buys) or a legacy intent (villain, turn, peak) is adapted into a
// v2 VIEW flagged legacy:true. Nothing is validated against v2 rules and nothing is written back.
export function readTreatment(obj) {
  if (!isObj(obj)) return { ok: false, error: "not an object" };
  if (obj.story_format === STORY_FORMAT) return { ok: true, legacy: false, source: "v2", treatment: normalizeTreatment(obj) };
  if (Array.isArray(obj.beats)) {
    const legacyIntent = obj.villain !== undefined || obj.ending_first !== undefined || obj.page !== undefined;
    const t = normalizeTreatment({
      ...obj, id: T(obj.id) || T(obj.label), treatment_title: obj.treatment_title || obj.title || obj.label, logline: obj.logline || (isObj(obj.aim) ? obj.aim.takeaway : ""),
      proposition: obj.proposition || obj.angle || "", viewer_takeaway: isObj(obj.aim) ? str(obj.aim.takeaway) : "", premise: obj.device ? `device: ${str(obj.device)}` : "",
      communication_kind: obj.communication_kind || "", coverage: undefined, story_format: undefined,
    });
    return { ok: true, legacy: true, source: legacyIntent ? "legacy-intent" : "legacy-pitch", treatment: { ...t, story_format: "legacy" } };
  }
  return { ok: false, error: "no beats: not a treatment, pitch or intent" };
}

// ---- channel roles (S2) --------------------------------------------------------------
// Replaces "the voice never repeats the screen". Repetition is a decision: a caption mirrors speech on purpose, emphasis repeats one key phrase,
// accessibility describes what is seen. Unstated repetition is a creative concern, not an error.
export function channelRole(beat) {
  const b = isObj(beat) ? beat : {};
  const on = content(b.on_screen), vo = content(b.voiceover);
  const both = on.length > 0 && vo.length > 0;
  const overlap = both ? jaccard(on, vo) : 0;
  const mode = T(b.channel_role && b.channel_role.mode) || (!on.length && !vo.length ? "silent" : !vo.length ? "screen-only" : !on.length ? "voice-only" : "split");
  const repeats = both && overlap >= 0.6;
  const declared = ["caption", "emphasis", "accessibility"].includes(mode) && !!T(b.channel_role && b.channel_role.reason || (mode === "caption" ? "caption" : ""));
  return { mode, overlap: Math.round(overlap * 100) / 100, repeats, decided: !repeats || declared };
}

// ---- helpers for issues ----------------------------------------------------------------
const mk = (list) => (id, beat, evidence, severity, fix, cls) => list.push({ issue_id: id, beat: beat || null, evidence: T(evidence), severity, fix: T(fix), class: cls });

// an internal label or strategy marker appearing in text the viewer would read or hear
const STRATEGY_MARKER = /\b(beat\s*\d+|hook:|turn:|peak:|payoff:|slot:|internal|grammar_role|sure\s*\/\s*bold|(?:the\s+)?(?:sure|bold|wild)\s+(?:version|option|script))\b/i;
function leaks(t) {
  const out = [];
  for (const b of t.beats) {
    const lab = T(b.internal_beat_label).toLowerCase();
    for (const [field, text] of [["on_screen", b.on_screen], ["voiceover", b.voiceover]]) {
      const s = T(text).toLowerCase();
      if (!s) continue;
      if (lab && lab.split(/\s+/).length >= 2 && s.includes(lab)) out.push({ beat: b.id, field, why: `contains the internal label "${b.internal_beat_label}"` });
      else if (lab && s === lab) out.push({ beat: b.id, field, why: `is exactly the internal label "${b.internal_beat_label}"` });
      else if (STRATEGY_MARKER.test(s)) out.push({ beat: b.id, field, why: "contains a strategy marker (a beat number, slot or craft label)" });
    }
  }
  return out;
}

// a beat that says nothing a viewer could hold: its words are mostly abstract nouns AND nothing concrete backs it (no evidence, no before/after change)
function labelOnly(b) {
  const text = [b.on_screen, b.viewer_takeaway].join(" ");
  const cw = content(text);
  const abstractShare = cw.length ? cw.filter((w) => ABSTRACT.has(w)).length / cw.length : 0;
  const ve = b.visual_event || {};
  const concreteEvent = content(ve.before).length >= 2 && content(ve.after).length >= 2 && T(ve.before).toLowerCase() !== T(ve.after).toLowerCase();
  const evidenced = arr(b.evidence_refs).length > 0;
  const thinTakeaway = content(b.viewer_takeaway).length < 3;
  return { label_only: (abstractShare >= 0.5 || thinTakeaway) && !evidenced && !concreteEvent, abstractShare: Math.round(abstractShare * 100) / 100, concreteEvent, evidenced };
}

// ---- coverage ledger (S7) -----------------------------------------------------------------
// ctx.required: [{id, text}] takeaways the brief needs (else t.takeaways with required !== false). A row maps takeaway -> beat -> evidence / visual event.
export function coverageLedger(t, ctx = {}) {
  const tr = normalizeTreatment(t);
  const required = (arr(ctx.required).length ? arr(ctx.required) : tr.takeaways.filter((x) => x.required !== false)).map((x, i) => (isObj(x) ? { id: T(x.id) || `t${i + 1}`, text: T(x.text) } : { id: `t${i + 1}`, text: T(x) }));
  const rows = [], problems = [];
  const stated = new Map(arr(tr.coverage.ledger).map((r) => [T(r && r.takeaway_id), r]));
  for (const req of required) {
    const row = stated.get(req.id);
    const beat = row ? tr.beats.find((b) => b.id === row.beat_id) : tr.beats.find((b) => jaccard(content(b.viewer_takeaway), content(req.text)) >= 0.25);
    const out = { takeaway_id: req.id, takeaway: req.text, beat_id: beat ? beat.id : null, evidence_refs: beat ? arr(beat.evidence_refs) : [], visual_event: beat ? T(beat.visual_event.change) : "", mapped_by: row ? "stated" : beat ? "inferred" : "none" };
    // a claim id beside a vague title is not coverage: the beat's own takeaway must say the thing
    const says = beat ? jaccard(content(beat.viewer_takeaway), content(req.text)) >= 0.2 || content(req.text).some((w) => content(beat.on_screen + " " + beat.voiceover + " " + beat.viewer_takeaway).includes(w)) : false;
    if (!beat) problems.push({ takeaway_id: req.id, why: "no beat communicates this required takeaway; map it or record why it is excluded" });
    else if (!says) problems.push({ takeaway_id: req.id, beat_id: beat.id, why: "the mapped beat never says the takeaway: an id beside a vague beat is not coverage" });
    else if (!out.evidence_refs.length && !out.visual_event) problems.push({ takeaway_id: req.id, beat_id: beat.id, why: "the beat carries neither evidence nor a visual event" });
    rows.push({ ...out, says: !!says });
  }
  const excluded = arr(tr.coverage.excluded).map((x) => ({ item: T(x && (x.item || x.id)), why: T(x && x.why) }));
  for (const x of excluded) if (!x.why) problems.push({ takeaway_id: x.item, why: "excluded material needs a reason" });
  return { rows, excluded, problems };
}

// ---- candidate comparison (S7) --------------------------------------------------------------
// Differences that count: which proof is chosen, in what order the information arrives, whose point of view it takes, what the premise is.
// Decorative differences (a synonym, an intensity word, a visual device name) are not looked at.
export function compareCandidates(list) {
  const ts = arr(list).map(normalizeTreatment);
  const pairs = [];
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const a = ts[i], b = ts[j];
    const pa = [...new Set(a.beats.flatMap((x) => x.evidence_refs))], pb = [...new Set(b.beats.flatMap((x) => x.evidence_refs))];
    const proof = pa.length || pb.length ? jaccard(pa, pb) : 1;
    const seqA = a.beats.map((x) => x.grammar_role || x.evidence_refs[0] || "").filter(Boolean), seqB = b.beats.map((x) => x.grammar_role || x.evidence_refs[0] || "").filter(Boolean);
    const order = seqA.length && seqB.length ? lcs(seqA, seqB) / Math.max(seqA.length, seqB.length) : 1;
    const persp = T(a.perspective).toLowerCase() === T(b.perspective).toLowerCase() ? 1 : jaccard(content(a.perspective), content(b.perspective));
    const prem = jaccard(content(a.premise + " " + a.proposition), content(b.premise + " " + b.proposition));
    const differs = { proof_selection: proof <= 0.6, information_order: order <= 0.7, perspective: persp <= 0.5, premise: prem <= 0.45 };
    pairs.push({ a: a.id, b: b.id, similarity: { proof_selection: r2(proof), information_order: r2(order), perspective: r2(persp), premise: r2(prem) }, differs, axes_different: Object.values(differs).filter(Boolean).length });
  }
  const insufficient = pairs.filter((p) => p.axes_different < 2).map((p) => [p.a, p.b]);
  return { pairs, distinct: !insufficient.length && ts.length >= 2, insufficient };
}
const r2 = (x) => Math.round(x * 100) / 100;
function lcs(a, b) { const m = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = a[i - 1] === b[j - 1] ? m[i - 1][j - 1] + 1 : Math.max(m[i - 1][j], m[i][j - 1]); return m[a.length][b.length]; }

// ---- validation -------------------------------------------------------------------------------
// ctx: { kind, evidence:[{id, type, protected:{required_qualifiers}}], must_show:[{id, claim_ref}], duration_s, required:[{id,text}], approved_exclusions:[ids], brief }
export function validateTreatment(raw, ctx = {}) {
  const t = normalizeTreatment(raw);
  const issues = [];
  const add = mk(issues);
  const kind = T(t.communication_kind) || T(ctx.kind);
  const g = STORY_GRAMMARS[kind] || null;
  const evById = new Map(arr(ctx.evidence).map((e) => [e && e.id, e]));

  // --- mechanical / factual errors
  if (!T(t.treatment_title)) add("title-missing", null, "treatment_title is empty", "error", "write a title that helps a person choose this film (what it is, not a strategy label)", "mechanical");
  if (!kind || !KIND_IDS.includes(kind)) add("kind-unknown", null, `communication_kind ${JSON.stringify(kind)}`, "error", `set communication_kind to one of ${KIND_IDS.join(", ")}`, "mechanical");
  if (!T(t.proposition)) add("proposition-missing", null, "no proposition", "error", "state in one sentence what the film makes the viewer understand", "mechanical");
  if (!t.beats.length) add("no-beats", null, "beats is empty", "error", "add the beats", "mechanical");
  const ids = t.beats.map((b) => b.id);
  if (new Set(ids).size !== ids.length) add("beat-id-duplicate", null, "two beats share an id", "error", "make every beat id unique and keep it stable when beats move", "mechanical");
  if (g && t.beats.length && t.beats.length < g.min_beats) add("too-few-beats", null, `${t.beats.length} beats for ${kind} (starting logic suggests ${g.min_beats}+)`, "minor", "add a beat only if a required takeaway lacks one", "creative");
  let total = 0;
  t.beats.forEach((b, i) => {
    const at = b.id;
    if (!T(b.viewer_takeaway)) add("takeaway-missing", at, "viewer_takeaway empty", "error", "say what the viewer now understands after this beat", "mechanical");
    if (!T(b.visual_event.change)) add("visual-event-missing", at, "visual_event.change empty", "error", "state the meaningful change on screen (before -> change -> after)", "mechanical");
    if (b.duration_provisional_s < 0 || !Number.isFinite(b.duration_provisional_s)) add("duration-bad", at, `duration_provisional_s ${b.duration_provisional_s}`, "error", "use a positive number of seconds (it is provisional)", "mechanical");
    total += b.duration_provisional_s || 0;
    if (i === 0 ? false : !T(b.relation_to_previous)) add("relation-missing", at, "relation_to_previous empty", "minor", `say how this follows the beat before (${RELATIONS_V2.join(", ")})`, "creative");
    for (const ref of b.evidence_refs) if (arr(ctx.evidence).length && !evById.has(ref)) add("evidence-unknown", at, `evidence_ref ${ref} is not in the evidence packet`, "error", "cite an id from the briefing's evidence_refs or drop the claim", "mechanical");
    for (const ref of b.evidence_refs) { const e = evById.get(ref); if (e && (e.permitted_use === "none" || (e.type === "synthetic_example" && ctx.live === true))) add("evidence-not-permitted", at, `${ref} may not support this use`, "error", "use evidence whose permitted_use allows it, or label the beat illustrative", "mechanical"); }
    if (g && g.proof_roles.includes(b.grammar_role) && !b.evidence_refs.length) add("unsupported-demonstration", at, `a ${b.grammar_role} beat with no evidence_refs`, "error", "cite the proof this beat shows, or change what the beat claims", "mechanical");
    // protected qualifiers stay with the claim they qualify
    const shown = (b.on_screen + " " + (b.voiceover || "")).toLowerCase();
    for (const ref of b.evidence_refs) for (const q of arr(evById.get(ref) && evById.get(ref).protected && evById.get(ref).protected.required_qualifiers)) if (q && (b.on_screen || b.voiceover) && !shown.includes(String(q).toLowerCase()) && !arr(b.qualifier_notes).length) add("qualifier-missing", at, `evidence ${ref} requires the qualifier "${q}"`, "error", "keep the qualifier in the copy, or note where it is shown (qualifier_notes)", "mechanical");
  });
  for (const l of leaks(t)) add("internal-label-leak", l.beat, `${l.field} ${l.why}`, "error", "internal labels and strategy markers never reach rendered text: rewrite the line for the viewer", "mechanical");
  const wantS = Number(ctx.duration_s) || 0;
  if (wantS && total && Math.abs(total - wantS) / wantS > 0.15) add("duration-contradiction", null, `beats sum to ${r2(total)} s, the brief says ${wantS} s`, "error", "retime the provisional durations or say why the brief changed", "mechanical");
  // must-show coverage: required unless the owner approved dropping it
  const cited = new Set(t.beats.flatMap((b) => b.evidence_refs));
  for (const m of arr(ctx.must_show)) {
    const ref = T(m && (m.claim_ref || m.id));
    if (ref && !cited.has(ref) && !arr(ctx.approved_exclusions).includes(ref) && !arr(t.coverage.excluded).some((x) => T(x && (x.item || x.id)) === ref && T(x.why) && x.approved === true)) add("must-show-missing", null, `must_show ${ref} is on no beat`, "error", "put it on a beat, or ask the owner to approve leaving it out", "mechanical");
  }
  // decision-grade ledger problems
  const ledger = coverageLedger(t, ctx);
  for (const p of ledger.problems) add("coverage-" + (p.beat_id ? "vague" : "gap"), p.beat_id || null, p.why, p.beat_id ? "major" : "major", "map the takeaway to a beat that states it, with evidence or a visual event", "creative");

  // --- creative concerns (judged by meaning)
  const abstractOk = !!(g && g.abstraction_ok);
  const justification = T(t.abstraction && t.abstraction.justification);
  t.beats.forEach((b) => {
    const lo = labelOnly(b);
    if (lo.label_only) {
      if (abstractOk && justification && content(b.viewer_takeaway).length >= 3) add("abstraction-justified", b.id, `abstract beat accepted: ${justification}`, "craft", "none; keep the stated position visible", "craft");
      else add("beat-says-nothing", b.id, `viewer_takeaway "${b.viewer_takeaway}" and on_screen "${b.on_screen}" name no behavior, evidence or change (abstract share ${lo.abstractShare})`, "major", "say what the viewer sees happen and what they now understand, with the proof it rests on", "creative");
    }
    const cr = channelRole(b);
    if (cr.repeats && !cr.decided) add("channel-repeat-undecided", b.id, `voiceover and on_screen share ${Math.round(cr.overlap * 100)}% of their words with no stated channel role`, "minor", 'set channel_role {mode: "caption" | "emphasis" | "accessibility", reason} if the repeat is deliberate, else split the jobs', "creative");
  });
  if (g && g.promise === "broad" && ctx.scope !== "single-feature") {
    const proofBeats = t.beats.filter((b) => b.evidence_refs.length);
    if (proofBeats.length && new Set(proofBeats.flatMap((b) => b.evidence_refs)).size < 2) add("breadth-depth-mismatch", null, "a broad promise rests on one piece of evidence", "minor", "add a second, different demonstration or narrow the promise", "creative");
  }
  if (g && g.promise === "single-feature" && new Set(t.beats.flatMap((b) => b.evidence_refs)).size > 4) add("breadth-depth-mismatch", null, "a focused promise spreads over many pieces of evidence", "minor", "keep the evidence that shows the one thing", "creative");
  // a product film whose proof-bearing roles carry no shown behavior at all
  if (g && g.proof_roles.length && t.beats.length >= 2 && !t.beats.some((b) => b.evidence_refs.length && content(b.visual_event.change).length >= 3)) add("promise-not-shown", null, "no beat shows the promised behavior with evidence", "major", "give at least one beat the real behavior as a before -> change -> after tied to evidence", "creative");
  // optional craft tools are assessed for purpose, never required or banned
  for (const tool of t.optional_tools) {
    const id = T(isObj(tool) ? tool.tool : tool), why = T(isObj(tool) ? tool.purpose : "");
    if (!OPTIONAL_TOOL_IDS.includes(id)) add("craft-unknown", null, `optional tool ${JSON.stringify(id)}`, "craft", `known tools: ${OPTIONAL_TOOL_IDS.join(", ")}`, "craft");
    else add("craft-" + id, null, why ? `uses ${id}: ${why}` : `uses ${id} with no stated purpose`, "craft", why ? "none" : "state what this serves", "craft");
  }

  const errors = issues.filter((x) => x.severity === "error"), majors = issues.filter((x) => x.severity === "major");
  const concerns = issues.filter((x) => x.severity === "major" || x.severity === "minor"), craft = issues.filter((x) => x.severity === "craft");
  const verdict = errors.length || majors.length ? "rewrite" : "ship";
  return { ok: verdict === "ship", verdict, errors, concerns, craft, issues, ledger, total_s: r2(total), digest: canonicalDigest(t) };
}

// the set: three compact candidates, one independent review, escalation only when diversity, clarity or evidence is insufficient
export function validateTreatmentSet(set, ctx = {}) {
  const list = arr(isObj(set) ? set.treatments : set).map(normalizeTreatment);
  const results = list.map((t) => ({ id: t.id, title: t.treatment_title, ...validateTreatment(t, { ...ctx, kind: t.communication_kind || ctx.kind }) }));
  const cmp = compareCandidates(list);
  const wantCount = Number(ctx.choices) > 0 ? Number(ctx.choices) : 3;
  const problems = [];
  if (list.length !== wantCount) problems.push(`${list.length} treatments: the user is offered ${wantCount} unless a series, "you decide" or a budget choice authorizes fewer`);
  const titles = list.map((t) => words(t.treatment_title).join(" "));
  if (new Set(titles).size !== titles.length) problems.push("two treatments share a title");
  const escalate = [];
  if (!cmp.distinct && list.length > 1) escalate.push({ reason: "diversity", detail: "candidates differ on fewer than two of: proof selection, information order, perspective, premise", pairs: cmp.insufficient });
  if (results.filter((r) => r.errors.some((e) => e.class === "mechanical" && /evidence|unsupported|must-show/.test(e.issue_id))).length >= 2) escalate.push({ reason: "evidence", detail: "two or more candidates lack supported proof" });
  if (results.filter((r) => r.concerns.some((c) => c.severity === "major")).length >= 2) escalate.push({ reason: "clarity", detail: "two or more candidates fail the meaning checks" });
  return { ok: !problems.length && results.every((r) => r.ok) && cmp.distinct, problems, results, comparison: cmp, escalation: { needed: escalate.length > 0, extra_writer: escalate.length > 0, reasons: escalate }, revision_rounds_default: 1 };
}

// card label: the actual premise first, Sure / Bold / Wild only as a secondary tag
export const cardLabel = (t) => { const n = normalizeTreatment(t); return { title: n.treatment_title, premise: n.premise || n.logline, tag: n.tag }; };

// ---- the editor's structured review ---------------------------------------------------------------
// { treatments: [{ id, verdict: ship|rewrite|replace, issues:[{issue_id, beat, evidence, severity, fix, class?}] }], recommended, revision_rounds? }
export function validateReview(review) {
  const problems = [];
  if (!isObj(review)) return { ok: false, problems: ["review is not an object"] };
  const list = arr(review.treatments || review.pitches);
  if (!list.length) problems.push("review has no treatments[]");
  for (const r of list) {
    const who = r && (r.id || r.label);
    if (!["ship", "rewrite", "replace"].includes(r && r.verdict)) problems.push(`${who}: verdict must be ship, rewrite or replace`);
    const iss = arr(r && (r.issues || r.notes));
    if (r && r.verdict !== "ship" && !iss.length) problems.push(`${who}: a ${r.verdict} verdict needs issues`);
    iss.forEach((x, i) => {
      for (const k of ["issue_id", "evidence", "severity", "fix"]) if (!T(x && x[k] || (k === "issue_id" && x && x.id))) problems.push(`${who} issue ${i + 1}: ${k} is required`);
      if (x && x.severity && !SEVERITIES.includes(x.severity)) problems.push(`${who} issue ${i + 1}: severity must be one of ${SEVERITIES.join(", ")}`);
      if (x && !("beat" in x)) problems.push(`${who} issue ${i + 1}: beat is required (a beat id, or null for the whole treatment)`);
    });
    if (r && r.verdict === "rewrite" && iss.length && !iss.some((x) => ["error", "major"].includes(x && x.severity))) problems.push(`${who}: rewrite needs at least one error or major issue; minor and craft notes alone mean ship`);
  }
  if (Number(review.revision_rounds) > 1) problems.push("revision_rounds above 1: one focused revision by default; escalate unresolved communication issues instead of looping");
  return { ok: !problems.length, problems };
}

// ---- projections for the existing pipeline ---------------------------------------------------------
const evText = (ve) => [ve.before && `before: ${ve.before}`, ve.change && `change: ${ve.change}`, ve.after && `after: ${ve.after}`].filter(Boolean).join(" | ");
export function toLegacyPitch(raw, { label = null } = {}) {
  const t = normalizeTreatment(raw);
  return {
    story_format: STORY_FORMAT, treatment_id: t.id, label: label || t.tag || t.id, angle: t.tag || "", title: t.treatment_title, treatment_title: t.treatment_title, premise: t.premise,
    logline: t.logline, proposition: t.proposition, communication_kind: t.communication_kind, aim: { takeaway: t.viewer_takeaway || t.proposition, feel: "", action: "", audience: "" },
    perspective: t.perspective, coverage_ledger: coverageLedger(t).rows,
    beats: t.beats.map((b) => ({ id: b.id, name: b.internal_beat_label || b.id, on_screen: b.on_screen, vo: b.voiceover == null ? "" : b.voiceover, visual: evText(b.visual_event), picture: b.visual_event.change,
      duration_s: b.duration_provisional_s, buys: b.viewer_takeaway, viewer_takeaway: b.viewer_takeaway, viewer_before: b.visual_event.before, viewer_after: b.visual_event.after,
      relation: b.relation_to_previous, role: b.grammar_role, evidence_refs: b.evidence_refs, channel_role: b.channel_role })),
  };
}

// an intent sheet the structure critic, scenes.mjs and the Motion Director can read. Villain, turn, peak and ending_first appear only when the
// treatment really has them (optional_tools); lib/intent.mjs no longer requires any of them.
export function toIntent(raw, { page = {} } = {}) {
  const t = normalizeTreatment(raw);
  const used = new Set(t.optional_tools.map((x) => T(isObj(x) ? x.tool : x)));
  const rel = (r, i) => (i === 0 ? "open" : ["because", "but", "so", "example", "escalation", "answer"].includes(r) ? r : r === "contrast" ? "but" : "so");
  const intent = {
    story_format: STORY_FORMAT, label: t.tag || t.id, proposition: t.proposition, communication_kind: t.communication_kind,
    page: { problem: str(page.problem) || t.premise || t.logline, audience: str(page.audience) || t.perspective || "the viewer", goal: str(page.goal) || t.viewer_takeaway || t.proposition, emotion: str(page.emotion) || "from unsure to clear" },
    muted_hook: T(t.beats[0] && (t.beats[0].on_screen || t.beats[0].visual_event.change)),
    beats: t.beats.map((b, i) => ({ id: b.id, name: b.internal_beat_label || b.id, buys: /^the viewer now /i.test(b.viewer_takeaway) ? b.viewer_takeaway : `The viewer now sees ${T(b.viewer_takeaway).replace(/^[A-Z]/, (c) => c.toLowerCase())}`,
      viewer_before: b.visual_event.before || "has not seen this yet", viewer_after: b.visual_event.after || b.viewer_takeaway, relation: rel(b.relation_to_previous, i), importance: 2,
      read: { text: T(b.on_screen) || T(b.visual_event.change), kind: T(b.on_screen) ? "text" : "picture", s: b.duration_provisional_s || 2 }, duration_s: b.duration_provisional_s })),
  };
  if (used.has("villain") && isObj(t.villain)) intent.villain = t.villain;
  return intent;
}
