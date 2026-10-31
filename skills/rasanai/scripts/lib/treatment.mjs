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
//   normalizeCreativeThinking(raw) / conceptRecord(t) / conceptActive(t, ctx)   -> v3 additive concept layer (extensions.creative_thinking, version 1)
//   validateConceptRecord(t, ctx)     -> { present, issues }   one candidate's concept record: observable occurrence, feasibility, product connection, kind mismatch
//   validateConceptContrast(set, ctx) -> { ok, applicable, records, pairs, shared_mechanisms, missing_alternatives, problems, notes }   structural checks plus editor hints; semantic judgement stays with the script editor
//   conceptCard(t)                    -> { title, premise, tag, detail }   additive plain-language card detail; cardLabel is unchanged
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
// The visual plan of a concept (creative-engine redesign): a concept is a sequence of SHOTS in a style world with one carrier, one signature moment and a sound mode;
// words are a layer on top. Carried through normalizeTreatment and toLegacyPitch so story.mjs check (gate GV) and the Studio card see it.
export const VISUAL_FIELDS = ["style_world", "style", "carrier", "signature_moment", "sound_mode", "product_truth", "first_watch"];
function visualPlan(r) {
  const o = {};
  for (const k of VISUAL_FIELDS) if (r[k] != null) o[k] = typeof r[k] === "object" ? r[k] : str(r[k]);
  if (isObj(o.style_world)) { const sw = o.style_world; o.style_world = str(sw.id || sw.name); if (!isObj(o.style) && (sw.palette || sw.font)) o.style = { ...(sw.palette ? { palette: sw.palette } : {}), ...(sw.font ? { font: sw.font } : {}) }; } // canonical: an id string + optional style {palette, font}
  if (Array.isArray(r.shots)) o.shots = r.shots.filter(isObj).map((sh, i) => ({ id: str(sh.id) || `s${String(i + 1).padStart(2, "0")}`, t: Number(sh.t) || 0, see: str(sh.see), style: str(sh.style), carrier_state: str(sh.carrier_state), move: str(isObj(sh.move) ? sh.move.id : sh.move), transition: str(sh.transition), words: str(sh.words), ...(str(sh.image) ? { image: str(sh.image) } : {}) }));
  return o;
}
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
  const ext = isObj(r.extensions) ? { extensions: { ...r.extensions, ...(isObj(r.extensions.creative_thinking) ? { creative_thinking: normalizeCreativeThinking(r.extensions.creative_thinking) } : {}) } } : {};
  return defaultTreatment({
    ...r, ...ext, id: T(r.id) || slug(r.treatment_title || r.title || r.tag), tag: TAGS.includes(r.tag) ? r.tag : TAGS.includes(r.label) ? r.label : null,
    treatment_title: T(r.treatment_title || r.title), premise: T(r.premise), logline: T(r.logline), communication_kind: T(r.communication_kind), proposition: T(r.proposition),
    viewer_takeaway: T(r.viewer_takeaway), perspective: T(r.perspective), takeaways: take, beats,
    coverage: { ledger: arr(r.coverage && r.coverage.ledger), excluded: arr(r.coverage && r.coverage.excluded) }, claims: arr(r.claims), optional_tools: arr(r.optional_tools),
    ...visualPlan(r),
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

  // --- the visual plan (not required on a legacy run: ctx.noVisualPlan, or story.mjs --no-visual-plan)
  if (!ctx.noVisualPlan && !t.legacy) {
    for (const k of ["style_world", "carrier", "signature_moment", "sound_mode"]) if (!T(isObj(t[k]) ? t[k].id || t[k].name || t[k].what : t[k])) add(`${k}-missing`, null, `${k} is missing: a concept names its style world, carrier, signature moment and sound mode`, "error", `name the ${k.replace("_", " ")} (see agents/concept-writer-*.md); words are a layer on top of the shot list`, "mechanical");
    if (!Array.isArray(t.shots) || t.shots.length < 3) add("shots-missing", null, `shots[] has ${Array.isArray(t.shots) ? t.shots.length : 0} entries (3 at least): the concept is a shot list: see, style, carrier_state, move, transition, words`, "error", "write the shots first, then the words", "mechanical");
  }
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

  // v3 concept layer: only when the treatment carries extensions.creative_thinking or the caller asks (ctx.concept === true); legacy treatments are untouched
  if (conceptActive(t, ctx)) for (const i of validateConceptRecord(t, { ...ctx, kind }).issues) issues.push(i);

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
  const contrast = list.some((t) => conceptActive(t, ctx)) ? validateConceptContrast(list, ctx) : null;
  if (contrast && !contrast.ok) for (const p of contrast.problems) problems.push(p.why);
  return { ok: !problems.length && results.every((r) => r.ok) && cmp.distinct, problems, results, comparison: cmp, ...(contrast ? { concept_contrast: contrast } : {}), escalation: { needed: escalate.length > 0, extra_writer: escalate.length > 0, reasons: escalate }, revision_rounds_default: 1 };
}

// ---- v3 concept layer (additive) ------------------------------------------------------------------
// extensions.creative_thinking = { version: 1, development, direction, commitments, continuity, review_requirements }. This file owns `development.concept`
// (one record per treatment); `direction` is the Look lane's, `commitments` the commitments lane's, `continuity` the continuity lane's: all preserved verbatim.
// Existing treatment fields, card labels and ids never change meaning. A treatment with no extensions.creative_thinking reads and validates exactly as before.
export const CREATIVE_THINKING_VERSION = 1;
// open vocabularies: suggestions for the writer, never a closed list or a quota (an unknown value is kept and judged by the editor)
export const CONCEPT_KINDS = ["product-documentary", "character", "material", "typographic", "formal-system", "editorial-rhythm", "explanatory-model", "testimonial-evidence", "atmospheric", "hybrid"];
export const VISUAL_REASONING_MODES = ["narrative", "demonstrative", "formal", "editorial", "atmospheric", "hybrid"];
export const FEASIBILITY_STATES = ["supported", "supported-with-risk", "needs-direction", "capability-blocked", "unknown"];
export const MECHANISM_STATUSES = ["exploratory", "writer-chosen", "brief-fixed", "user-fixed"];
const NARROW_KINDS = ["instructional-explainer", "workflow-demo", "single-feature-announcement"];
const CONCEPT_FIELDS = ["concept_kind", "organizing_idea", "organizing_mechanism", "visual_mechanism", "emotional_arc", "opening_question", "ending_answer", "provisional_medium_options", "product_connection", "evidence_plan", "feasibility", "continuity_scope", "creative_risks", "distinct_from", "visual_reasoning_mode", "explanation_model", "mechanism_status"];
const list2 = (x) => arr(x).map((v) => (isObj(v) ? v : T(v))).filter((v) => (isObj(v) ? true : v));
const arc = (a) => (isObj(a) ? { opening: T(a.opening || a.start), development: T(a.development || a.middle), ending: T(a.ending || a.end), movement: T(a.movement) } : { opening: "", development: "", ending: "", movement: T(a) });
const feas = (f) => { const o = isObj(f) ? f : { state: f }; const st = T(o.state || o.status).toLowerCase(); return { state: FEASIBILITY_STATES.includes(st) ? st : st ? "unknown" : "unknown", stated: !!st, needs: list2(o.needs || o.capabilities), risks: list2(o.risks), supported_alternative: T(o.supported_alternative || o.alternative), basis: T(o.basis || o.evidence) }; };
const dist = (d) => arr(isObj(d) ? d.from || d.ids : d).map((x) => (isObj(x) ? { id: T(x.id), how: T(x.how || x.difference || x.why), axes: arr(x.axes).map(String) } : { id: T(x), how: "", axes: [] })).filter((x) => x.id);

// the one concept record of a treatment: from extensions.creative_thinking.development.concept, else the same fields at the top level of the treatment
export function conceptRecord(raw) {
  const t = isObj(raw) ? raw : {};
  const ct = isObj(t.extensions) && isObj(t.extensions.creative_thinking) ? t.extensions.creative_thinking : null;
  const dev = ct && isObj(ct.development) ? ct.development : {};
  const src = isObj(dev.concept) ? dev.concept : Object.fromEntries(CONCEPT_FIELDS.filter((k) => t[k] !== undefined).map((k) => [k, t[k]]));
  const mech = T(src.organizing_mechanism || src.organizing_idea);
  const mode = T(src.visual_reasoning_mode || dev.visual_reasoning_mode).toLowerCase();
  const dfrom = dist(src.distinct_from);
  return {
    present: !!ct || Object.keys(src).length > 0,
    concept_kind: T(src.concept_kind), organizing_mechanism: mech, organizing_idea: T(src.organizing_idea || src.organizing_mechanism), visual_mechanism: T(src.visual_mechanism),
    emotional_arc: arc(src.emotional_arc), opening_question: T(src.opening_question), ending_answer: T(src.ending_answer), product_connection: T(src.product_connection),
    evidence_plan: list2(src.evidence_plan), provisional_medium_options: list2(src.provisional_medium_options), feasibility: feas(src.feasibility), continuity_scope: T(src.continuity_scope),
    creative_risks: list2(src.creative_risks), visual_reasoning_mode: VISUAL_REASONING_MODES.includes(mode) ? mode : mode ? "hybrid" : "",
    explanation_model: T(src.explanation_model), mechanism_status: MECHANISM_STATUSES.includes(T(src.mechanism_status)) ? T(src.mechanism_status) : "",
    distinct_from: dfrom, distinct_from_why: T(isObj(src.distinct_from) && !Array.isArray(src.distinct_from) ? src.distinct_from.why || src.distinct_from.difference : src.distinct_from_why),
  };
}

// version-1 envelope; unknown keys and other lanes' sections survive untouched. Never throws, never invents a concept.
export function normalizeCreativeThinking(raw) {
  const r = isObj(raw) ? raw : {};
  const dev = isObj(r.development) ? r.development : {};
  return {
    ...r, version: CREATIVE_THINKING_VERSION, development: dev, direction: isObj(r.direction) ? r.direction : {}, commitments: isObj(r.commitments) || Array.isArray(r.commitments) ? r.commitments : {},
    continuity: isObj(r.continuity) ? r.continuity : {}, review_requirements: isObj(r.review_requirements) || Array.isArray(r.review_requirements) ? r.review_requirements : {},
  };
}

// the concept layer runs only when a treatment carries the extension (or the caller opts in): legacy and revision-1 films are never judged by it
export const conceptActive = (t, ctx = {}) => (isObj(ctx) && ctx.concept === true) || (isObj(t) && isObj(t.extensions) && isObj(t.extensions.creative_thinking));

// an observable occurrence = something a viewer could see happen (a change, an action, an argument developing), not only a mood. Judged by meaning-bearing words, not a ban list.
const MOOD = new Set("feeling feels vibe mood atmosphere energy emotion emotional inspiring inspirational dynamic powerful beautiful sleek modern premium cinematic bold elegant magical seamless".split(" "));
const occurrence = (s) => { const c = content(s); const nonMood = c.filter((w) => !MOOD.has(w) && !ABSTRACT.has(w)); return { words: c.length, concrete: nonMood.length, moodShare: c.length ? Math.round((1 - nonMood.length / c.length) * 100) / 100 : 1 }; };

// one candidate: structural completeness and feasibility. Issues use the same shape as validateTreatment so the editor's review reads one vocabulary.
export function validateConceptRecord(raw, ctx = {}) {
  const t = normalizeTreatment(raw);
  const c = conceptRecord(t);
  const issues = [];
  const add = mk(issues);
  if (!c.present) return { present: false, issues };
  const kind = T(t.communication_kind) || T(ctx.kind);
  if (!c.organizing_mechanism) add("concept-mechanism-missing", null, "no organizing mechanism or idea", "major", "say in one sentence what organizes this film (the causal mechanism, perspective, temporal structure or picture-to-proof relation)", "creative");
  const occ = occurrence(c.visual_mechanism || c.organizing_mechanism);
  if ((c.visual_mechanism || c.organizing_mechanism) && (occ.concrete < 3 || occ.moodShare >= 0.5)) add("concept-no-observable-occurrence", null, `visual mechanism "${c.visual_mechanism || c.organizing_mechanism}" names a mood, not something a viewer sees happen`, "major", "name the observable action, change or developing argument (what appears, what changes, what it becomes), or the formal relationship that develops (scale, repetition, contrast) for a formal film", "creative");
  const formal = ["formal", "editorial", "atmospheric"].includes(c.visual_reasoning_mode);
  if (!c.product_connection && !(formal && T(kind) && !["whole-product-introduction", "single-feature-announcement", "workflow-demo", "performance-ad"].includes(kind))) add("concept-product-connection-missing", null, "no product connection", "minor", "say how this idea belongs to this product, audience or brief (an honest 'it is a demonstration' is a valid answer)", "creative");
  if (!c.emotional_arc.movement && !(c.emotional_arc.opening && c.emotional_arc.ending)) add("concept-arc-missing", null, "no emotional arc (where the viewer starts and where they end)", "minor", "state the movement in one phrase: from what to what", "creative");
  if (!c.feasibility.stated) add("concept-feasibility-undeclared", null, "feasibility is not stated", "minor", `set feasibility.state to one of ${FEASIBILITY_STATES.join(", ")} (use the capability sources the plan reads; unknown is honest)`, "creative");
  if (c.feasibility.state === "capability-blocked" && !c.feasibility.supported_alternative) add("concept-infeasible", null, "the idea needs a capability that is blocked and no supported direction is offered", "major", "offer the closest supported direction (feasibility.supported_alternative) or replace the candidate before the user is asked to choose it", "creative");
  else if (c.feasibility.state === "capability-blocked") add("concept-infeasible-disclosed", null, `blocked as written; supported direction: ${c.feasibility.supported_alternative}`, "minor", "present the supported direction in the card detail, not the blocked one as buildable", "creative");
  if (c.feasibility.state === "needs-direction" || c.feasibility.state === "supported-with-risk") add("concept-feasibility-tradeoff", null, `feasibility ${c.feasibility.state}: ${[...c.feasibility.risks, ...c.feasibility.needs].map((x) => (isObj(x) ? JSON.stringify(x) : x)).join("; ") || "unstated"}`, "craft", "disclose the tradeoff in the existing card detail", "craft");
  // a brief that fixes the kind or genre: a candidate of an unrelated concept kind is a mismatch to flag (never a diversity quota)
  const fixedKinds = arr(ctx.fixed_concept_kinds).map(String);
  if (fixedKinds.length && c.concept_kind && !fixedKinds.includes(c.concept_kind)) add("concept-kind-mismatch", null, `concept_kind "${c.concept_kind}" is outside what the brief fixes (${fixedKinds.join(", ")})`, "major", "write inside the format the brief fixed, or ask the owner whether the format may change", "creative");
  return { present: true, record: c, issues };
}

// The set. Structural checks are deterministic; "do these differ as FILMS" is the editor's judgement in the same bounded pass.
// ctx: { kind, proposal_mode, brief_mechanism, fixed_concept_kinds, choices }. Similarity numbers (compareCandidates) travel as hints and never decide ok.
export function validateConceptContrast(set, ctx = {}) {
  const ts = arr(isObj(set) ? set.treatments : set).map(normalizeTreatment);
  const records = ts.map((t) => ({ id: t.id, ...conceptRecord(t) }));
  const applicable = records.some((r) => r.present) || (isObj(ctx) && ctx.concept === true);
  const problems = [], notes = [];
  const note = (code, ids, why, severity = "minor") => notes.push({ code, ids, why, severity });
  const prob = (code, ids, why) => problems.push({ code, ids, why });
  if (!applicable) return { ok: true, applicable: false, records: [], pairs: [], shared_mechanisms: [], missing_alternatives: [], problems, notes };
  const kind = T(ctx.kind) || T(ts[0] && ts[0].communication_kind);
  const narrow = NARROW_KINDS.includes(kind);
  const idSet = new Set(ts.map((t) => t.id));
  for (const r of records) {
    if (!r.present) prob("concept-record-missing", [r.id], `${r.id}: no concept record while its siblings have one`);
    for (const d of r.distinct_from) if (!idSet.has(d.id)) prob("concept-distinct-unknown-id", [r.id, d.id], `${r.id}: distinct_from cites ${d.id}, which is not a candidate in this set`);
    if (ts.length > 1 && r.present && !r.distinct_from.length) prob("concept-distinct-missing", [r.id], `${r.id}: distinct_from is empty (cite sibling ids and say how the causal mechanism, perspective, temporal structure, emotional movement or picture-to-proof relation differs)`);
    if (r.present && r.distinct_from.length && !r.distinct_from_why && r.distinct_from.every((d) => !d.how)) prob("concept-distinct-unexplained", [r.id], `${r.id}: distinct_from names siblings but not how they differ`);
  }
  // a shared mechanism is a hint for the editor: identical normalised mechanism text across candidates (never token distance)
  const byMech = new Map();
  for (const r of records) { const k = words(r.organizing_mechanism).join(" "); if (k) byMech.set(k, [...(byMech.get(k) || []), r.id]); }
  const shared = [...byMech.entries()].filter(([, ids]) => ids.length > 1).map(([mechanism, ids]) => ({ mechanism, ids }));
  for (const s of shared) note("shared-mechanism", s.ids, `${s.ids.join(", ")} state the same organizing mechanism: the editor decides whether they are one film (reordered or re-skinned) and names the substantive alternative that is missing`, "major");
  // proposal mode: the proposal must not preselect the shared mechanism for every candidate
  if (ctx.proposal_mode === true || T(ctx.brief_mechanism)) {
    const bm = words(ctx.brief_mechanism).join(" ");
    const pre = records.filter((r) => r.present && r.mechanism_status !== "exploratory" && !["brief-fixed", "user-fixed"].includes(r.mechanism_status) && bm && words(r.organizing_mechanism).join(" ") === bm);
    if (pre.length > 1 && pre.length === records.length) prob("concept-mechanism-preselected", pre.map((r) => r.id), "every candidate adopts the mechanism that the proposal brief already contained; keep it exploratory (mechanism_status: exploratory) in at most one candidate and develop genuinely different mechanisms for the others");
    else if (pre.length && !bm) { /* no brief mechanism: nothing to preselect */ }
  }
  // the brief fixed the format: alternatives differ inside it (explanation model, point of view, evidence structure), never by a genre quota
  const fixed = arr(ctx.fixed_concept_kinds).length > 0 || narrow;
  const kinds = new Set(records.map((r) => r.concept_kind).filter(Boolean));
  if (fixed && kinds.size > 1 && arr(ctx.fixed_concept_kinds).length) for (const r of records) if (r.concept_kind && !arr(ctx.fixed_concept_kinds).includes(r.concept_kind)) note("concept-kind-mismatch", [r.id], `${r.id}: ${r.concept_kind} sits outside the format the brief fixed`, "major");
  const hints = ts.length > 1 ? compareCandidates(ts) : { pairs: [], distinct: true, insufficient: [] };
  const pairs = hints.pairs.map((p) => {
    const A = records.find((r) => r.id === p.a), B = records.find((r) => r.id === p.b);
    const sameMech = !!A.organizing_mechanism && words(A.organizing_mechanism).join(" ") === words(B.organizing_mechanism).join(" ");
    const sameModel = narrow && !!A.explanation_model && words(A.explanation_model).join(" ") === words(B.explanation_model).join(" ");
    const modelDiffers = narrow && !!A.explanation_model && !!B.explanation_model && !sameModel;
    const kindDiffers = !!A.concept_kind && !!B.concept_kind && A.concept_kind !== B.concept_kind;
    return { a: p.a, b: p.b, hints: p.similarity, axes_different: p.axes_different, shared_mechanism: sameMech, explanation_model_differs: narrow ? modelDiffers : null, concept_kind_differs: kindDiffers,
      needs_editor: sameMech || sameModel || p.axes_different < 2 };
  });
  for (const p of pairs) if (p.needs_editor && !p.shared_mechanism && !shared.some((s) => s.ids.includes(p.a) && s.ids.includes(p.b))) note("similar-structure", [p.a, p.b], `${p.a} and ${p.b} score close on proof/order/perspective/premise (hint only): confirm they differ in mechanism, perspective, temporal structure, emotional movement or picture-to-proof relation before they ship`, "minor");
  const missing = shared.map((s) => ({ ids: s.ids, shared: s.mechanism, ask: narrow ? "name a faithful alternative with a different explanation model, point of view or evidence structure" : "name a substantive alternative that differs in causal mechanism, perspective, temporal structure, emotional movement or picture-to-proof relation" }));
  return { ok: !problems.length, applicable: true, kind, narrow, records: records.map(({ id, present, concept_kind, organizing_mechanism, visual_reasoning_mode, mechanism_status, explanation_model, feasibility, distinct_from }) => ({ id, present, concept_kind, organizing_mechanism, visual_reasoning_mode, mechanism_status, explanation_model, feasibility: feasibility.state, distinct_from: distinct_from.map((d) => d.id) })),
    pairs, shared_mechanisms: shared, missing_alternatives: missing, problems, notes, editor_judges: "semantic contrast; hints and shared_mechanisms are retrieval aids, not a gate" };
}

// additive plain-language detail for the existing card summary/detail slots; cardLabel (title/premise/tag) is unchanged
export function conceptCard(raw) {
  const t = normalizeTreatment(raw);
  const c = conceptRecord(t);
  const bits = [];
  if (c.visual_mechanism || c.organizing_idea) bits.push(c.visual_mechanism || c.organizing_idea);
  if (c.emotional_arc.movement || (c.emotional_arc.opening && c.emotional_arc.ending)) bits.push(c.emotional_arc.movement || `from ${c.emotional_arc.opening} to ${c.emotional_arc.ending}`);
  const tradeoff = c.feasibility.state === "capability-blocked" ? c.feasibility.supported_alternative : [...c.feasibility.risks, ...c.creative_risks].map((x) => (isObj(x) ? T(x.risk || x.text) : x)).filter(Boolean).slice(0, 2).join("; ");
  return { ...cardLabel(t), detail: bits.join(". "), tradeoff, feasibility: c.feasibility.state, concept_kind: c.concept_kind };
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
    ...Object.fromEntries([...VISUAL_FIELDS, "shots"].filter((k) => t[k] != null).map((k) => [k, t[k]])),
    ...(isObj(t.extensions) && isObj(t.extensions.creative_thinking) ? { extensions: { creative_thinking: t.extensions.creative_thinking }, concept_card: conceptCard(t) } : {}),
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
