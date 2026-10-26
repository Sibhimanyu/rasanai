// Proof integrity for demonstrations (creative-recovery contract E, W04).
// A film that SHOWS a changed sentence, a correction, a calculation or an eligibility rule makes a
// claim about meaning. A proof contract names the source, the intended claim, what must not be lost
// (people, numbers, conditions) and what output is supported. Pure and import-safe: no file, network
// or model access; callers pass the evidence in.
//
// What this module can do: find missing evidence ids, missing contract fields, protected names,
// numbers and qualifiers that are absent from a shown output, an unlabeled illustrative example, and
// a claimed capability with no evidence. What it cannot do: decide whether two sentences MEAN the
// same thing. A literal match is not semantic equivalence and a literal miss may be a paraphrase, so
// every changed text goes to the independent script editor / grounding critic, and
// validateProofReview only checks that review is complete and current, never that it is right.
import { createHash } from "node:crypto";

export const TRANSFORMATION_KINDS = [
  "verbatim",           // the output is the source text itself
  "ui-capture",         // a real product screen; text comes from the capture
  "grammar-correction", // a supported correction (a redundant word may go; protected words may not)
  "rephrase",
  "summarize",
  "calculation",
  "reading-selection",  // one of several legitimate readings of an ambiguous source
  "illustrative-example", // a labeled fictional example
];
// Kinds a literal check cannot clear: meaning must be compared by a reviewer.
const SEMANTIC_KINDS = new Set(TRANSFORMATION_KINDS.filter((k) => k !== "verbatim" && k !== "ui-capture"));
export const REVIEW_STATUSES = ["pending", "reviewed", "not-needed"];
export const REVIEW_VERDICTS = ["equivalent", "not-equivalent", "needs-clarification"];

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const norm = (s) => str(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
// a protected item is a string or {text, aliases?[], optional_in_output?}
const itemOf = (x) => (x && typeof x === "object" ? { text: str(x.text), aliases: arr(x.aliases).map(str), optional: !!x.optional_in_output } : { text: str(x), aliases: [], optional: false });
const outputOf = (o, i) => (o && typeof o === "object" ? { id: str(o.id) || `out-${i + 1}`, text: str(o.text) } : { id: `out-${i + 1}`, text: str(o) });
const idSet = (v) => new Set(v instanceof Set ? [...v] : arr(v).map((x) => (x && typeof x === "object" ? x.id : x)).map(str));
const present = (hay, item) => [item.text, ...item.aliases].filter(Boolean).some((t) => norm(hay).includes(norm(t)));

// Stable digest of a contract plus the text it depends on: the review's `input_digest`.
export function proofDigest(contract) {
  const c = contract || {};
  const keys = ["id", "beat_id", "source_refs", "source_text", "intended_claim", "transformation_kind", "protected_entities", "protected_quantities", "protected_conditions", "supported_outputs", "illustrative", "readings"];
  const canon = JSON.stringify(keys.map((k) => [k, c[k] === undefined ? null : c[k]]));
  return createHash("sha256").update(canon).digest("hex");
}

// contract: {id, beat_id, source_refs, source_text, intended_claim, transformation_kind,
//            protected_entities, protected_quantities, protected_conditions, supported_outputs,
//            illustrative, review_status, [readings: [{id, text}]], [claimed_capability]}
// evidence (all optional, supplied by the caller):
//   known_ids          ids that exist (claims, screens, assets): every source_ref must be one of them
//   sources            { <id>: "<text of that source>" }, checked against contract.source_text
//   shown_outputs      the texts the film actually shows (default: contract.supported_outputs)
//   labeled_illustrative  true when the shot visibly says it is an example
//   capability_refs    evidence ids that show the product really does the claimed behavior
// -> {ok, mechanicalErrors, requiresSemanticReview, requiredReviewInputs}
export function validateProofContract(contract, evidence = {}) {
  const errors = [];
  const err = (code, message, extra = {}) => errors.push({ code, message, ...extra });
  const c = contract && typeof contract === "object" ? contract : null;
  if (!c) {
    return { ok: false, mechanicalErrors: [{ code: "no-contract", message: "no proof contract given" }], requiresSemanticReview: false, requiredReviewInputs: [] };
  }
  const ev = evidence || {};
  for (const k of ["id", "beat_id", "intended_claim", "transformation_kind"]) if (!str(c[k]).trim()) err("missing-field", `contract.${k} is empty`, { field: k });
  if (c.transformation_kind && !TRANSFORMATION_KINDS.includes(c.transformation_kind)) err("unknown-transformation", `transformation_kind "${c.transformation_kind}" is not one of ${TRANSFORMATION_KINDS.join(", ")}`);
  if (typeof c.illustrative !== "boolean") err("missing-field", "contract.illustrative must be true or false", { field: "illustrative" });
  if (c.review_status !== undefined && !REVIEW_STATUSES.includes(c.review_status)) err("bad-review-status", `review_status must be ${REVIEW_STATUSES.join("|")}`);

  // Source: a real, readable source unless the example is a labeled fiction.
  const refs = arr(c.source_refs).map(str).filter(Boolean);
  const sourceText = str(c.source_text);
  const illustrative = c.illustrative === true;
  if (!illustrative) {
    if (!refs.length) err("missing-evidence-id", "a real (non-illustrative) demonstration needs source_refs (evidence ids)", { field: "source_refs" });
    if (!sourceText.trim()) err("missing-source-text", "source_text is empty: the review has nothing to compare against", { field: "source_text" });
  }
  if (ev.known_ids !== undefined) {
    const known = idSet(ev.known_ids);
    for (const r of refs) if (!known.has(r)) err("unknown-evidence-id", `source_ref "${r}" is not a known claim, screen or asset id`, { ref: r });
  }
  if (ev.sources && typeof ev.sources === "object") {
    for (const r of refs) {
      const t = ev.sources[r];
      if (t !== undefined && sourceText.trim() && !norm(t).includes(norm(sourceText)) && !norm(sourceText).includes(norm(t))) {
        err("source-text-mismatch", `source_text does not match what "${r}" actually says`, { ref: r });
      }
    }
  }

  // Illustration honesty: a fiction must say so, and a fiction cannot prove a capability.
  if (illustrative && ev.labeled_illustrative !== true) err("illustrative-unlabeled", "an illustrative example must be visibly labeled as an example in the shot");
  const claimed = str(c.claimed_capability).trim();
  if (claimed && arr(ev.capability_refs).filter(Boolean).length === 0) {
    err("unsupported-capability", `the demonstration claims "${claimed}" but no evidence id shows the product does it: limit the copy or show a supported result`);
  }
  if (illustrative && claimed) err("fabricated-capability", "an illustrative example cannot be the proof of a product capability");

  // Protected people, numbers and conditions must be in the source, and in every shown output.
  const groups = [
    ["entity", arr(c.protected_entities)],
    ["quantity", arr(c.protected_quantities)],
    ["condition", arr(c.protected_conditions)],
  ];
  const outputs = (ev.shown_outputs !== undefined ? arr(ev.shown_outputs) : arr(c.supported_outputs)).map(outputOf);
  if (!outputs.length) err("no-output", "no supported_outputs / shown output to check");
  for (const [kind, list] of groups) {
    for (const raw of list) {
      const item = itemOf(raw);
      if (!item.text) continue;
      if (sourceText.trim() && !present(sourceText, item)) err("protected-not-in-source", `protected ${kind} "${item.text}" does not appear in source_text`, { kind, item: item.text });
      if (item.optional) continue;
      for (const o of outputs) {
        if (!present(o.text, item)) err("protected-dropped", `protected ${kind} "${item.text}" is absent from output ${o.id}; declare an alias if it is paraphrased, or fix the output`, { kind, item: item.text, output: o.id });
      }
    }
  }
  // Verbatim means verbatim.
  if (c.transformation_kind === "verbatim" && sourceText.trim()) {
    for (const o of outputs) if (norm(o.text) !== norm(sourceText)) err("not-verbatim", `output ${o.id} differs from source_text but the transformation is "verbatim"`, { output: o.id });
  }

  // Meaning is the reviewer's job: everything but a clean verbatim/capture goes to the editor.
  const requiresSemanticReview = SEMANTIC_KINDS.has(c.transformation_kind) || !!claimed;
  const requiredReviewInputs = requiresSemanticReview
    ? [{
        contract_id: str(c.id), beat_id: str(c.beat_id), input_digest: proofDigest(c),
        source_text: sourceText, intended_claim: str(c.intended_claim), transformation_kind: str(c.transformation_kind),
        readings: arr(c.readings).map((r, i) => outputOf(r, i)),
        outputs: outputs.map((o) => ({ id: o.id, text: o.text })),
        protected: { entities: arr(c.protected_entities).map((x) => itemOf(x).text), quantities: arr(c.protected_quantities).map((x) => itemOf(x).text), conditions: arr(c.protected_conditions).map((x) => itemOf(x).text) },
        claimed_capability: claimed || null,
        illustrative,
        question: "Does each output keep the source's meaning under the intended reading (all people, numbers, conditions), and is any claimed behavior actually shown?",
      }]
    : [];
  return { ok: errors.length === 0, mechanicalErrors: errors, requiresSemanticReview, requiredReviewInputs };
}

// review: {reviewer:{role, job_id, independent_of_builder}, input_digest, reviews:[{contract_id, verdict,
//          source_text_seen, outputs_checked:[output ids], protected_checked, rationale}], limitations:[]}
// expected: {contractIds:[...], digests?:{<contract id>: digest}, outputs?:{<contract id>: [output ids]}, reviewerRole?}
// -> {ok, errors, unresolved}: ok means COMPLETE and CURRENT, never that the verdicts are right.
// `unresolved` lists contracts the reviewer called not-equivalent or needs-clarification (the caller
// surfaces them through the existing review notes; they are not a schema failure).
export function validateProofReview(review, expected = {}) {
  const errors = [];
  const unresolved = [];
  const err = (code, message, extra = {}) => errors.push({ code, message, ...extra });
  const r = review && typeof review === "object" ? review : null;
  if (!r) return { ok: false, errors: [{ code: "no-review", message: "no proof review given" }], unresolved };
  const rv = r.reviewer || {};
  if (!str(rv.role).trim()) err("reviewer-missing", "review.reviewer.role is empty");
  if (rv.independent_of_builder !== true) err("not-independent", "the reviewer must be independent of the builder of the demonstration");
  if (expected.reviewerRole && rv.role && rv.role !== expected.reviewerRole) err("wrong-reviewer", `reviewer role is "${rv.role}", expected "${expected.reviewerRole}"`);
  const rows = arr(r.reviews);
  const byId = new Map();
  for (const row of rows) {
    const id = str(row && row.contract_id);
    if (!id) { err("review-row-no-id", "a review row has no contract_id"); continue; }
    if (byId.has(id)) err("duplicate-review", `contract "${id}" is reviewed twice`, { contract_id: id });
    byId.set(id, row);
  }
  const wanted = arr(expected.contractIds).map(str);
  for (const id of wanted) if (!byId.has(id)) err("contract-not-reviewed", `no review for contract "${id}"`, { contract_id: id });
  for (const id of byId.keys()) if (wanted.length && !wanted.includes(id)) err("unexpected-review", `review for unknown contract "${id}"`, { contract_id: id });
  for (const [id, row] of byId) {
    if (!REVIEW_VERDICTS.includes(row.verdict)) err("bad-verdict", `contract "${id}": verdict must be ${REVIEW_VERDICTS.join("|")}`, { contract_id: id });
    if (str(row.rationale).trim().split(/\s+/).filter(Boolean).length < 6) err("rationale-too-thin", `contract "${id}": say what you compared, in at least 6 words`, { contract_id: id });
    if (!str(row.source_text_seen).trim()) err("source-not-shown", `contract "${id}": source_text_seen is empty (the reviewer must quote the source it compared)`, { contract_id: id });
    if (row.protected_checked !== true) err("protected-not-checked", `contract "${id}": protected people, numbers and conditions were not checked`, { contract_id: id });
    const want = expected.outputs && expected.outputs[id];
    if (want) {
      const got = new Set(arr(row.outputs_checked).map(str));
      for (const o of arr(want).map(str)) if (!got.has(o)) err("output-not-checked", `contract "${id}": output "${o}" was not reviewed`, { contract_id: id, output: o });
    } else if (!arr(row.outputs_checked).length) err("output-not-checked", `contract "${id}": no outputs_checked`, { contract_id: id });
    const dig = expected.digests && expected.digests[id];
    if (dig && row.input_digest !== dig && r.input_digest !== dig) err("stale-review", `contract "${id}": the review was written for different content than the current contract`, { contract_id: id });
    if (row.verdict === "not-equivalent" || row.verdict === "needs-clarification") unresolved.push({ contract_id: id, verdict: row.verdict, rationale: str(row.rationale) });
  }
  return { ok: errors.length === 0, errors, unresolved };
}

// ---------------------------------------------------------------------------------------------
// Canonical regression data for W09 (authored here, never executed by this module).
// Synthetic eligibility: M = manager, E = employee, Y = 7+ years. Pure boolean sets, no semantics engine.

export const ELIGIBILITY_READINGS = {
  A: ({ M, E, Y }) => M || (E && Y), // M union (E intersect Y): all managers plus employees with 7+ years
  B: ({ M, E, Y }) => (M || E) && Y, // (M union E) intersect Y: managers and employees who each have 7+ years
};
const BOOLS = [false, true];
export const ELIGIBILITY_UNIVERSE = BOOLS.flatMap((M) => BOOLS.flatMap((E) => BOOLS.map((Y) => ({ M, E, Y }))));
const sameOn = (f, g, people) => people.every((p) => !!f(p) === !!g(p));

// candidate: ({M,E,Y}) => boolean. declaredPopulation: optional predicate for who the film says it is about.
// -> {status: "matches"|"fails"|"needs-clarification", matches: ["A"|"B"], note}
export function matchEligibilityReadings(candidate, declaredPopulation = null) {
  const universe = declaredPopulation ? ELIGIBILITY_UNIVERSE.filter((p) => declaredPopulation(p)) : ELIGIBILITY_UNIVERSE;
  const matches = Object.keys(ELIGIBILITY_READINGS).filter((k) => sameOn(candidate, ELIGIBILITY_READINGS[k], universe));
  if (matches.length) return { status: "matches", matches, note: declaredPopulation ? "equal on the declared population" : "equal on every combination" };
  if (!declaredPopulation) {
    const asked = ELIGIBILITY_UNIVERSE.filter((p) => p.M || p.E);
    const m2 = Object.keys(ELIGIBILITY_READINGS).filter((k) => sameOn(candidate, ELIGIBILITY_READINGS[k], asked));
    if (m2.length) return { status: "needs-clarification", matches: m2, note: "equal only if the population is exactly managers and employees: declare it or ask" };
  }
  return { status: "fails", matches: [], note: "equals neither stated reading" };
}

export const REGRESSION_CASES = [
  {
    id: "bonus-eligibility",
    source: "The bonus goes to managers and employees with 7+ years.",
    readings: [
      { id: "A", text: "all managers, plus employees with 7+ years", expr: "M union (E intersect Y)" },
      { id: "B", text: "managers and employees who each have 7+ years", expr: "(M union E) intersect Y" },
    ],
    protected_entities: ["managers", "employees"],
    protected_quantities: ["7+"],
    candidates: [
      { text: "Only managers with 7+ years", expect: "fails", why: "loses E and equals neither reading", fn: ({ M, Y }) => M && Y },
      { text: "Everyone with 7+ years", expect: "needs-clarification", why: "acceptable only when the declared population is exactly M union E", fn: ({ Y }) => Y, declared_population_ok: ({ M, E }) => M || E },
    ],
  },
  { id: "supported-deletion", source: "discuss about the plan", output: "discuss the plan", expect: "supported", why: "removing the redundant 'about' is a grammar correction, not a forbidden deletion of protected words" },
  { id: "very-tired", source: "very tired", output: "exhausted", expect: "writing-example-only", why: "shows a wording change; it does not prove learning or retention; a later exercise proves reuse only with evidence of that behavior" },
  { id: "rising-bars", expect: "not-proof-of-adaptation", why: "bars rising do not show exercises adapt: show an actual supported changed exercise/recommendation, or limit the copy" },
  { id: "fiction-vs-capability", expect: "labeled-fiction-ok-fabrication-not", why: "a clearly labeled fictional example may be shown; a fabricated real capability or testimonial may not" },
];
