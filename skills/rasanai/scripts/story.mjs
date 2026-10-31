#!/usr/bin/env node
// Story: the concept engine. Keeps every film from telling the default launch story
// (hook -> problem -> "Introducing X" -> 3 features -> CTA) by starting from the product's truth,
// sampling narrative devices that differ from each other, and gating pitches against the cliche arc.
//   node story.mjs truth --out <truth.md> [--product "<name>"]
//        -> writes the truth-sheet template for Claude to fill (transformation, emotional truth, enemy,
//           the product's own objects/formats/words, proof, audience, the cliche version to avoid)
//   node story.mjs devices [--family f] [--fits <tag>] [--q "<text>"] [--id <id>] [--overused|--fresh]
//        -> list / search the device catalog (taxonomy/devices.json); --id prints one device in full
//   node story.mjs cliche
//        -> the default arc's 8 beats, stock openers, overused devices and visual cliches
//   node story.mjs pick --truth <truth.md|truth.json> [--count 3] [--seed s] [--recent ids] [--exclude ids]
//        [--like id] [--format launch|explainer|brand|social] [--tone t] [--product-first | --allow-conceit] [--shape ladder|pas|scenario] [--feature <name>]
//        -> a device menu and three slots ("Sure", "Bold", "Wild"), whose chosen devices must differ on >= 5 of 7 axes, with different family,
//           protagonist and visual world (the menu cards carry beats, pitfalls, an example; `fuse_pool` the product's own material)
//           THE MENU: no seeded draw. Rotation (--recent) REMOVES recent devices; what is left is ranked by plain fit and listed as `menu`; each script's writer
//           CHOOSES one with a reason (pitch.device_reason) and check holds the three to the distance rules. --seed is accepted and ignored. Each pick
//           slot carries a plot ENGINE with a turn (refrain-break | reversal | before-after): the pitch states engine + turn { line, reverses, payoff }.
//           The shapes come from SHAPES_BY_TYPE (video type x the truth sheet's Claim scope): a universal or category claim -> Sure ladder (engine refrain-break),
//           Bold pas (reversal), Wild before-after (the three plot engines, each with a turn, differing in where it sits and what it reverses, never in the claim);
//           a single-task claim -> scenario. --shape forces one, --scope overrides the sheet. pas = pain -> meet -> benefits -> proof -> cta.
//           A launch / promo / product / brand truth sheet without "## Claim scope" is refused (regenerate it). Product-first trios need not
//           differ on protagonist; a universal claim gets no user-protagonist device.
//           Source mode (--sources <sources.json>, --source-mode <spine>, or <truth dir>/../sources.json): a footage or existing-video spine is never product-first and gets no ladder/pas shape (references/sources.md).
//           Launch / promo / product films (format launch, or --product-first) are PRODUCT-FIRST: conceit devices
//           (museums, allegories, invented worlds, extended metaphors, cover versions) are never offered.
//   node story.mjs check --pitch <pitch.json | pitches.json> [--truth <truth.md|json>] [--footage] [--length <s>] [--narrated] [--product-first | --allow-conceit] [--sources <sources.json> | --source-mode <spine>] [--selects <selects.json>] [--brand-film <grammar.json>] [--calm] [--claims <claims.json>]
//        -> the rubric: 6 pass/fail gates (+ G7 product-first for launch / promo / product films, + G10 shape-aware: `shape` ladder (refrain verb, 3-8 rungs by length, distinct uses, increasing levels, a real UI cause and effect per rung, a close) or scenario (one feature, one task), + G12 viewer first for launch / promo films (and any `pas` pitch): not-viewer-first, reveal-too-early (pas), no-benefit, no-proof (against research/claims.json: --claims, else <truth dir>/../research/claims.json), weak-cta, sparse-lines (film s / on-screen lines > 3.0); warnings slogan-copy, toy-demos, + G8 the aim: takeaway, feel, action, approach, a title that names the idea, + G9 tempo for the same films: ideas per length, a change every ~2.5 s, hold limits, the brand's measured tempo with --brand-film, + G13 scope for product-first films: the story's scope matches the truth sheet's Claim scope: uses, areas of life (D), the largest scenario's share (S_max), persona callbacks (P), reach, the promise clauses, the retell; the portfolio fails two scripts that collapse onto one scenario) + the weighted 1-5 score (ship at >= 3.8, no dimension < 3).
//           Exit 0 = ship, 2 = rewrite (reasons in the JSON), 1 = bad input.
//   node story.mjs intent --intent <story/intent.json> [--length <s>] [--pitch <pitch.json>] [--write]
//        -> validates the film's argument (lib/intent.mjs, references/intent.md): proposition <= 12 words with no "and", every beat's buys / viewer_before / viewer_after /
//           relation word (because | but | so | example | escalation | answer; none = error) / importance 1-3 (<= 25% at 3, exactly one peak at 60-75% of the running time
//           (the pitch's durations with --pitch), a rest before it) / read with its reading time, ending_first, the turn; warnings: engine placement, payoff, buys wording.
//           --write adds the derived emphasis_curve. check also reads story/intent-<Label>.json beside the pitch (its findings are warnings there). Exit 0 = ok, 2 = errors.
//        AIRTIGHT (references/story.md): check also takes --plan <story/plan.json> (else plan.json beside the pitch): G14 Plan = the pitch's slot (label, device, shape, engine, turn_kind,
//           peak_kind, hook_kind (a warning), owned_claims as beat rows in its coverage); G15 Coverage on product-first films (the pitch's `coverage` rows: every Must-show feature and every Surprising-facts claim
//           id has a beat row or a cut with 4+ words: coverage-missing, coverage-beat, coverage-cut); new errors G4 number-unit ("50 phones" but c9 says "50 people"), G6 peak-not-longest /
//           end-short / beat-count (<= 12 s: 4 to 5 beats), G9 tempo-ideas (tempo.ideas must equal the intent's distinct beliefs; --intent <file>, else intent-<Label>.json, else intent.json
//           beside the pitch); the portfolio adds shared-line, shared-peak-kind, shared-turn-kind, same-order, cliche-order, coverage-dropped. The actor is exempt from the scope count only
//           for words that are the product's own surfaces (truth Native objects / words).
//           THE LEDGER: check on ONE pitch file records a run in story/check-ledger.json beside it ({label: {runs, last}}): 3 runs, +2 when story/edit-notes.json marks the label rewrite or
//           replace. Over the limit: no gates run, {ok:false, verdict:"escalate"}, exit 3 (hand back to the Director). --no-ledger skips recording (set checks never record).
//   node story.mjs plan --plan <story/plan.json> --picks <story/picks.json> --truth <truth.md> [--claims <claims.json>]
//        -> validates the story plan (agents/story-planner.md): plan-slots, plan-shape, plan-device, plan-turn-kind, plan-peak-kind, plan-angle, plan-swap, plan-claims, plan-coverage. Also: G4 continuity-claim, G7 system-ui-pose, G13 scope_waiver (portfolio range-short, waiver-count), G10 before-after pairs by length (2-3 at <=12 s, 2-4 at <=22 s).
//           { ok, problems, warnings }, exit 0 ok, 2 problems
//   node story.mjs sheet --length <s> [--engine refrain-break|reversal|before-after]
//        -> the beat sheet for that film length (BEAT_SHEETS: slot, from, to, note per beat; the 10 s sheets are exact) and the rules G6 holds it to
//   node story.mjs revise --notes <story/edit-notes.json>
//        -> { revise: [labels the editor marked rewrite | replace], notes: { label: [...] } }: what goes back to the writers (once)
//   node story.mjs validate
//        -> checks devices.json against its schema (vocabularies, ids, counts)
//   FORMAT-AWARE STORIES (Plan 03; the default balanced workflow, references/story.md "Format-aware treatments"):
//   node story.mjs grammar [--kind <communication kind>]       -> the starting narrative logic + required evidence for a kind (lib/story-grammars.mjs); no kind = the list. Villain, twist, peak and a reveal deadline are OPTIONAL tools.
//   node story.mjs treatments --set <story/treatments.json> [--evidence <research/evidence.json>] [--brief <brief.json>] [--choices <n>] [--split]
//        -> validates ONE writer's three compact treatments (lib/treatment.mjs): mechanical errors, creative concerns, optional craft, the coverage ledger, and the set's diversity by proof / order / perspective / premise.
//           --split writes story/pitch-<Label>.json (the legacy projection plus the full `treatment`) and intent-<Label>.json so crew.mjs pitches, the Story card and the structure critic keep working. Exit 0 ship, 2 rewrite.
//   node story.mjs treatment --treatment <file> [--evidence ...] [--brief ...]   -> the same for one treatment or ANY saved pitch/intent (a legacy film is read, not judged by v2 rules)
//   node story.mjs review --review <story/edit-notes.json>     -> validates the editor's structured review { issue_id, beat, evidence, severity, fix } (one focused revision by default)
//   node story.mjs refs --kind <communication kind> [--role <beat role>] [--limit n]   -> a few house examples with provenance for that kind and beat role (lib/story-refs.mjs)
//   `check` routes any pitch with story_format "v2" to the treatment validator instead of the legacy rubric; legacy pitches keep the rubric.
// Pitch format: references/story.md. Catalog schema: taxonomy/devices-SCHEMA.md.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, readJSON, writeFile, SKILL_DIR } from "./lib/common.mjs";
import { track } from "./lib/report.mjs";
import { isLabelOnly } from "./lib/moves-lib.mjs";
import { readSources, isFootageLed, productFirstApplies } from "./lib/sources.mjs";
import { formatShapesForRun } from "./lib/formats.mjs";
import { readTime } from "./lib/reading.mjs";
import { loadIntent, validateIntent } from "./lib/intent.mjs";
import { STORY_GRAMMARS, grammarBrief, grammarKinds, OPTIONAL_TOOLS } from "./lib/story-grammars.mjs";
import { normalizeTreatment, readTreatment, validateTreatment, validateTreatmentSet, validateReview, toLegacyPitch, toIntent, compareCandidates, conceptCard } from "./lib/treatment.mjs";
import { retrieveReferences } from "./lib/story-refs.mjs";

const args = parseArgs();
const cmd = args._[0];
track(
  { pick: "Picking three story devices that differ from each other", check: "Checking the pitches against the cliche arc" }[cmd],
  { pick: "Three story devices picked: Sure, Bold and Wild", check: "Pitches checked" }[cmd]
);
const CATALOG_PATH = path.join(SKILL_DIR, "taxonomy", "devices.json");
const CAT = readJSON(CATALOG_PATH);
const DEVICES = CAT.devices;
const AXES = Object.keys(CAT.axes);
const out = (o) => console.log(JSON.stringify(o, null, 2));
const list = (v) => (v == null || v === true ? [] : String(v).split(",").map((s) => s.trim()).filter(Boolean));
const norm = (s) => String(s || "").toLowerCase();
const HOUSE_CHANGE_EVERY_S = 2.5; // house tempo: something meaningful changes on screen at least this often
const r1d = (x) => Math.round(x * 10) / 10;
// a claim a viewer can believe: a number, adoption, a rating, named customers
const PROOF_CLAIM_RE = /\d|\b(trusted by|used by|loved by|adopted|adoption|rated|ratings?|stars?|customers? (include|like)|waitlist)\b/i;
const TITLE_STOP = ["just", "the", "a", "an", "can", "to", "of", "and", "you", "your", "with", "for"];
const nz8 = (x) => String(x || "").toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();

// a device by id, research code ("A5") or name
function findDevice(key) {
  const k = norm(key).trim();
  return DEVICES.find((d) => d.id === k || norm(d.code) === k || norm(d.name) === k) || null;
}


// Plan 03: context for treatment validation from --evidence (array or { evidence: [] }) and --brief (a FilmBrief or a briefing package { brief })
const TAGS_ORDER = ["Sure", "Bold", "Wild"];
function treatmentCtx(a) {
  const ctx = {};
  const rd = (f) => { try { return readJSON(path.resolve(String(f))); } catch (e) { die(`${f}: ${e.message}`); } };
  if (a.evidence && a.evidence !== true) { const e = rd(a.evidence); ctx.evidence = (Array.isArray(e) ? e : Array.isArray(e && e.evidence) ? e.evidence : Array.isArray(e && e.claims) ? e.claims : []).map((x, i) => (x && typeof x === "object" ? { ...x, id: String(x.id || `c${i + 1}`) } : { id: `c${i + 1}` })); }
  if (a.brief && a.brief !== true) {
    const j = rd(a.brief), b = j && j.brief ? j.brief : j || {};
    ctx.kind = b.communication_kind || undefined; ctx.must_show = Array.isArray(b.must_show) ? b.must_show : []; ctx.duration_s = Number(b.duration) || 0; ctx.scope = b.scope || undefined;
    // V3 W02: the concept layer runs only for creative policy revision 2 (revision 1 and legacy films are never judged by it); the brief's fixed format/mechanism travel into the validators
    const rev = Number(b.creative_policy_revision ?? (j && j.creative_policy_revision) ?? 0);
    if (rev >= 2) {
      ctx.concept = true;
      const cx = (b.extensions && b.extensions.creative_thinking) || (j && j.extensions && j.extensions.creative_thinking) || {};
      const fk = b.fixed_concept_kinds || cx.fixed_concept_kinds || (j && j.fixed_concept_kinds);
      if (Array.isArray(fk) && fk.length) ctx.fixed_concept_kinds = fk.map(String);
      const bm = b.brief_mechanism || b.mechanism || cx.brief_mechanism || (j && j.brief_mechanism);
      if (typeof bm === "string" && bm.trim()) { ctx.brief_mechanism = bm; ctx.proposal_mode = true; }
    }
    if (!ctx.evidence && Array.isArray(b.evidence_refs)) ctx.evidence = b.evidence_refs;
  }
  if (a.length && a.length !== true && !ctx.duration_s) ctx.duration_s = Number(a.length) || 0;
  if (a.kind && a.kind !== true) ctx.kind = String(a.kind);
  if (a["policy-revision"] && a["policy-revision"] !== true && Number(a["policy-revision"]) >= 2) ctx.concept = true; // explicit opt-in when no brief is passed
  return ctx;
}
// --- the truth sheet -----------------------------------------------------------
// Each section: its heading, the key it parses to, whether it's a list, and the hint Claude sees.
const TRUTH = [
  { h: "Product", key: "product", fields: ["name", "does"], hint: "name: <product name>\ndoes: <what it does, one plain sentence>" },
  { h: "Tags", key: "tags", list: true, hint: `- <product-type tags from: ${CAT.tags.products.filter((t) => t !== "any").join(", ")}>` },
  { h: "Format", key: "format", fields: ["format", "length", "aspect"], hint: "format: <launch | explainer | brand | social>\nlength: <seconds, e.g. 30>\naspect: <16:9 | 9:16 | 1:1>" },
  { h: "Claim scope", key: "claim_scope", fields: ["scope", "why", "clauses", "audience", "series"], hint: "scope: <universal | category | single-task>\nwhy: <the sentence that decides it, quoted from the feature's own page. universal: the promise is any / anything / everyday / whatever, or the official examples span 3+ areas of life (\"any question becomes a tool\"); category: one family of jobs (\"reviews every pull request\"); single-task: one job done well (\"sends the class a link mid-lesson\")>\nclauses: <the promise's own clauses, copied from the feature's page, separated by ; (\"everyday answers more visual; learning complex topics easier; tools to solve a task in the moment\")>\naudience: <mass | role | persona: who should recognise themselves>\nseries: <no | yes (this film is one spot in a declared series, which supplies the range)>" },
  { h: "Use moments", key: "use_domains", alias: ["Use domains"], list: true, hint: `- <life area>: "<a real everyday use or ask, verbatim from the research>" [<claim id>] (reach: <most | many | some | few> of the audience within a month; <asset path | prompt only>)\n- <8 to 12 rows, ranked: the most universal first. Seed them from the brand's OWN launch film and page first. Universal: 8+ rows across 4+ areas from: ${"learn, money, food-hosting, social-money, play, work, health, travel, home, creativity, shopping, other"}; category: 3+ uses (any sub-area names); single-task: the one task. Specific in detail (the exact prompt, the real label), common in situation>` },
  { h: "Tone", key: "tone", list: true, hint: `- <one or two of: ${CAT.tags.tones.join(", ")}>` },
  { h: "Audience", key: "audience", hint: "<who watches, where, what they already know and believe>" },
  { h: "Transformation", key: "transformation", hint: "from <the before, in the audience's words> to <the after>, written at the scope of the claim: for a universal or category claim the before every viewer shares (\"answers that arrive as paragraphs\"), never one diegetic moment" },
  { h: "Emotional truth", key: "emotional_truth", hint: "<the feeling under the task: the small shame, fear, longing or relief; not a feature. At the claim's scope: a feeling most of the audience has had (universal / category), one moment only for a single-task claim>" },
  { h: "Enemy", key: "enemy", list: true, hint: "- <the villain: a thing, a habit, a phrase, a deadline>" },
  { h: "Native objects", key: "objects", list: true, min: 8, hint: "- <at least 8 physical or digital objects, sounds and details from the product's world, specific in detail (the real label, the exact prompt, the number), common in situation; the product's own surfaces (its input, cursor, mark) first>" },
  { h: "Native formats", key: "forms", list: true, min: 5, hint: "- <at least 5 document or media formats that exist in this world (a chat thread, a changelog, a status page, a calendar invite)>" },
  { h: "Native words", key: "words", list: true, min: 3, hint: "- <the product's exact words: UI labels, button text, jargon, error messages, the name itself. Copy them from the site or screenshots; never invent them>" },
  { h: "Proof", key: "proof", list: true, hint: "- <each claim the film may make, with its source: \"Sorts a receipt in 2 s (site, /features)\". Only what is true>" },
  { h: "Surprising facts", key: "facts", list: true, hint: "- <at least one non-obvious truth about the product or its world, with its source>" },
  { h: "Must-show features", key: "features", list: true, hint: "- <at most 3; each will live inside the device, not in a list>" },
  { h: "Assets", key: "assets", list: true, hint: "- <what exists: screenshots, logo, UI captures, footage, product sounds, real data>" },
  { h: "Competitors", key: "competitors", list: true, hint: "- <1-3 names, for the swap test>" },
  { h: "The cliche version", key: "cliche", list: true, hint: "- <write the default-arc version in 6 lines (hook stat -> problem montage -> \"Introducing X\" -> feature 1/2/3 -> CTA). This is what the pitches must not be>" },
];

function truthTemplate(product) {
  const secs = TRUTH.map((s) => `## ${s.h}\n\n${s.hint}\n`).join("\n");
  return `# Truth sheet${product ? `: ${product}` : ""}

> Fill every section before any concept. Specificity comes from here: real objects, real words, real numbers.
> Replace each <placeholder>; lines still in <angle brackets> are ignored. Never invent claims, numbers or UI labels:
> anything the film shows as fact must be in Proof or Native words with a source.

${secs}`;
}

const headKey = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
// a line still holding a template placeholder ("<product name>", "from <the before> to <the after>") is unfilled
const isPlaceholder = (s) => /<[a-z][^<>]*\s[^<>]*>/i.test(s) || /^(todo|tbd|\.\.\.)$/i.test(s.trim()) || !s.trim();

function parseTruthMd(text) {
  const t = {};
  const sections = {};
  let cur = null;
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = raw.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const h = headKey(m[1]);
      const spec = TRUTH.find((s) => [s.h, ...(s.alias || [])].some((x) => h === headKey(x) || h.startsWith(headKey(x))));
      cur = spec ? spec.key : null;
      if (cur) sections[cur] = [];
      continue;
    }
    if (!cur || /^\s*>/.test(raw) || /^#\s/.test(raw)) continue;
    const line = raw.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+[.)]\s+/, "").trim();
    if (!isPlaceholder(line)) sections[cur].push(line);
  }
  for (const s of TRUTH) {
    const lines = sections[s.key] || [];
    if (s.fields) {
      const o = {};
      for (const l of lines) {
        const f = l.match(/^([a-z_ ]+):\s*(.*)$/i);
        if (f && !isPlaceholder(f[2])) o[norm(f[1]).trim()] = f[2].trim();
      }
      t[s.key] = o;
    } else if (s.list) t[s.key] = lines;
    else t[s.key] = lines.join(" ");
  }
  return t;
}

function loadTruth(p) {
  if (!p || p === true) return null;
  const f = path.resolve(String(p));
  if (!fs.existsSync(f)) die(`truth sheet not found: ${f}`);
  const text = fs.readFileSync(f, "utf8");
  let t;
  if (/\.json$/i.test(f)) {
    t = JSON.parse(text);
    if (typeof t.product === "string") t.product = { name: t.product };
    if (typeof t.format === "string") t.format = { format: t.format };
    for (const s of TRUTH) if (s.list && typeof t[s.key] === "string") t[s.key] = [t[s.key]];
  } else t = parseTruthMd(text);
  for (const s of TRUTH) if (s.list && !Array.isArray(t[s.key])) t[s.key] = [];
  t.product = t.product || {};
  t.format = t.format || {};
  if (typeof t.claim_scope === "string") t.claim_scope = { scope: t.claim_scope };
  t.claim_scope = t.claim_scope && typeof t.claim_scope === "object" ? t.claim_scope : {};
  if (!t.use_domains.length && Array.isArray(t.use_moments)) t.use_domains = t.use_moments;
  t.use_domains = t.use_domains.map((x) => (x && typeof x === "object" ? { domain: norm(x.domain || x.life_area).trim().replace(/\s+/g, "-"), text: String(x.prompt || x.text || x.use || ""), reach: REACH.includes(norm(x.reach).trim()) ? norm(x.reach).trim() : null } : parseDomainLine(String(x)))).filter((x) => x.domain);
  return t;
}

// --- the claim's scope (references/story.md §1, gate G13) -----------------------------
// universal: the promise is "any / anything", or the official examples span 3+ life domains: told as a ladder of range, never one scenario.
// category: one family of jobs (a ladder or a pas across 3+ uses). single-task: one job done well (a scenario).
const SCOPES = ["universal", "category", "single-task"];
const USE_DOMAINS = ["learn", "money", "food-hosting", "social-money", "play", "work", "health", "travel", "home", "creativity", "shopping", "other"];
const REACH = ["most", "many", "some", "few"]; // how many of the audience have done this use within a month
function parseDomainLine(s) {
  const m = String(s).match(/^\s*([a-z][a-z -]*?)\s*[:|]\s*(.*)$/i);
  const r = String(s).match(/\breach:?\s*(most|many|some|few)\b|\((most|many|some|few)\)/i);
  return { domain: m ? norm(m[1]).trim().replace(/\s+/g, "-") : "", text: m ? m[2].trim() : String(s), reach: r ? norm(r[1] || r[2]) : null };
}
const scopeOf = (t) => {
  if (!t) return null;
  const s = norm(t.claim_scope && t.claim_scope.scope).trim().replace(/[\s_]+/g, "-").replace(/^single$/, "single-task");
  return SCOPES.includes(s) ? s : null;
};
// the promise's own clauses ("everyday answers more visual; learning complex topics easier; ..."): every one must be shown (G13)
// the clause indexes a pitch's beats show (beat.clause: index or text)
const clausesShown = (clauses, beats) => {
  const covered = new Set();
  beats.forEach((b) => [].concat(b.clause == null ? [] : b.clause).forEach((c) => { const n = Number(c); if (Number.isInteger(n) && n >= 0 && n < clauses.length) covered.add(n); else { const k = clauses.findIndex((x) => nz8(x) === nz8(c)); if (k >= 0) covered.add(k); } }));
  return covered;
};
const clausesOf = (t) => { const c = t && t.claim_scope ? t.claim_scope.clauses : null; return (Array.isArray(c) ? c : String(c || "").split(/\s*;\s*/)).map((x) => String(x).trim()).filter(Boolean); };
// a single persona is allowed only when the audience is a role or a persona, or the film is one spot of a declared series (S1 D.2 rule 5)
const personaAllowed = (t, p = {}) => { const cs = (t && t.claim_scope) || {}; return ["role", "persona"].includes(norm(cs.audience).trim()) || /^(yes|true|series)/i.test(String(cs.series || "").trim()) || p.persona_arc === true; };
// does this film type carry a story shape (and so need the claim's scope)? launch / promo / product / brand films and any product-first film
const needsScope = (format, productFirst) => !!productFirst || ["launch", "promo", "product", "brand"].includes(format);
function scopeGaps(t) {
  const gaps = [];
  const sc = scopeOf(t);
  if (!sc) { gaps.push("Claim scope: missing (scope: universal | category | single-task, and why: the sentence that decides it). A truth sheet from before the scope fields must be regenerated (re-run the research lead, or add the two sections by hand)"); return gaps; }
  const doms = t.use_domains || [];
  if (sc === "universal") {
    const bad = doms.filter((d) => !USE_DOMAINS.includes(d.domain)).map((d) => d.domain);
    if (bad.length) gaps.push(`Use domains: unknown domain(s) ${[...new Set(bad)].join(", ")} (use: ${USE_DOMAINS.join(", ")})`);
    const n = new Set(doms.map((d) => d.domain).filter((d) => USE_DOMAINS.includes(d))).size;
    if (doms.length < 8 || n < 4) gaps.push(`Use moments: ${doms.length} uses across ${n} areas of life (a universal claim needs 8 to 12 grounded everyday uses across 4+ areas, ranked most universal first: the film is their range)`);
    if (doms.length && doms[0].reach && doms[0].reach !== "most") gaps.push(`Use moments: the first row is reach "${doms[0].reach}" (rank the uses most universal first: open on one most of the audience did this month)`);
    const few = doms.filter((d) => d.reach === "few");
    if (few.length) gaps.push(`Use moments: ${few.length} row(s) with reach "few" (${few.map((d) => d.text.slice(0, 40)).join("; ")}): a universal film never leans on a use few viewers have`);
    if (!clausesOf(t).length) gaps.push("Claim scope: clauses missing (copy the promise's own clauses from the feature's page, separated by ;)");
  } else if (sc === "category" && doms.length < 3) gaps.push(`Use moments: ${doms.length} (a category claim needs 3+ distinct real uses)`);
  return gaps;
}

function truthGaps(t, opts = {}) {
  const gaps = [];
  if (opts.scope) gaps.push(...scopeGaps(t));
  if (!t.product.name) gaps.push("Product: no name");
  for (const k of ["transformation", "emotional_truth"]) if (!String(t[k] || "").trim()) gaps.push(`${TRUTH.find((s) => s.key === k).h}: empty`);
  for (const s of TRUTH.filter((x) => x.list)) {
    const n = t[s.key].length;
    if (s.min && n < s.min) gaps.push(`${s.h}: ${n} of at least ${s.min}`);
    else if (!s.min && !n && ["enemy", "proof", "cliche", "competitors"].includes(s.key)) gaps.push(`${s.h}: empty`);
  }
  return gaps;
}

// the lookup phrase of a native item: "thermal receipt (fades to blank)" -> "thermal receipt"
const itemKey = (s) => norm(s).split(/\s[(—-]\s?|[(:;,]/)[0].replace(/["'`]/g, "").trim();
function mentions(text, item) {
  const k = itemKey(item);
  if (!k || k.length < 3) return false;
  const tx = norm(text);
  if (tx.includes(k)) return true;
  // else its most distinctive word (the longest, 5+ letters), as a whole word or plural
  const head = k.split(/\s+/).filter((w) => /^[a-z]{5,}$/.test(w)).sort((a, b) => b.length - a.length)[0];
  return !!head && new RegExp(`\\b${head}(s|es)?\\b`).test(tx);
}


// --- launch-film structure (references/launch-film.md section 1): hook, reveal/hero, 2-4 uses, payoff, end card ----
// One idea per beat, plain words, the product or brand in every beat. Ranges are the template tables widened by about a
// quarter, per film length bucket (15 / 30 / 60 / 90 s). Tempo: the templates carry the house idea counts and holds (G9 below). role: beat.role, else its name, else its place (first = hook, last = cta).
const LF_RANGES = {
  15: { hook: [1, 2.5], statement: [1.5, 3], hero: [2.5, 4.5], demo: [1.5, 3], payoff: [1, 2.5], cta: [2, 4] },
  30: { hook: [1, 2.5], statement: [1.5, 4], hero: [3, 5], demo: [2, 4.5], payoff: [2, 4], cta: [2.5, 5] },
  60: { hook: [1.5, 4], statement: [2, 5], hero: [4, 6], demo: [3, 6.5], payoff: [3, 7], cta: [3, 7] },
  90: { hook: [2, 5], statement: [2.5, 6], hero: [5, 7.5], demo: [4, 8], payoff: [4, 10], cta: [3, 8] },
};
const lfBucket = (len) => (len <= 22 ? 15 : len <= 45 ? 30 : len <= 75 ? 60 : 90);
// One feature, one scenario (G10): hook = the viewer's before, proof = the task done in the real UI (the longest beat),
// turn = the after and the brand reveal, cta = one action. Its own timing ranges per length bucket.
const SC_RANGES = {
  15: { hook: [1, 3.5], proof: [3, 8], turn: [1.5, 4.5], cta: [1.5, 4] },
  30: { hook: [1.5, 6], proof: [4, 15], turn: [2.5, 6.5], cta: [2, 5.5] },
  60: { hook: [2, 8], proof: [8, 32], turn: [3, 10], cta: [3, 7] },
  90: { hook: [2, 10], proof: [12, 50], turn: [4, 14], cta: [3, 8] },
};
const uiOf = (b) => (Array.isArray(b.ui) ? b.ui.filter((u) => String(u || "").trim()) : []);
const isScenario = (p, beats) => !!(p.feature && typeof p.feature === "object") || beats.some((b) => /^(proof|turn)$/i.test(String(b.role || "")));
// Story shape: "ladder" (a refrain verb, one rung per distinct everyday use, escalating) or "scenario" (one feature, one viewer, one task).
// "pas" (viewer first: the viewer's pain, the brand meets it, benefits, proof, a concrete cta). Explicit p.shape wins; else meet/benefit beats mean pas; else a feature block or proof/turn beats mean scenario; a refrain or open/rung beats mean ladder; else "legacy" (the older hook/hero/demo/payoff structure, held to the scenario G10).
const PAS_ROLES = ["agitate", "meet", "benefit"];
const shapeOf = (p, beats) => { const s = norm(p.shape).trim(); return s === "ladder" || s === "scenario" || s === "pas" || Object.prototype.hasOwnProperty.call(STORY_SHAPES, s) ? s : beats.some((b) => /^(meet|benefit|agitate)$/i.test(String(b.role || ""))) ? "pas" : isScenario(p, beats) ? "scenario" : p.refrain || beats.some((b) => /^(open|rung|ways_in)$/i.test(String(b.role || ""))) ? "ladder" : "legacy"; };
const LADDER_ROLES = ["open", "rung", "ways_in", "close"];
// rungs per film length: <= 35 s 3-4, 36-60 s 4-6, > 60 s 6-8
const rungRange = (len) => (len <= 35 ? [3, 4] : len <= 60 ? [4, 6] : [6, 8]);
const USE_STOP = new Set(["the", "a", "an", "of", "for", "to", "and", "in", "on", "at", "your", "my", "with", "it", "its", "from", "by", "or", "as", "is", "this", "that", "some", "new", "find", "get", "make", "plan", "book", "buy", "shop", "ask", "do", "see", "show", "build", "write", "check", "compare", "choose", "pick", "use", "look", "up", "out", "me", "you", "go", "try", "start", "finish", "done"]);
const stem = (w) => w.replace(/['\u2019]s?$/, "").replace(/(ies)$/, "y").replace(/(es|s)$/, (m, g, off, str) => (str.length > 4 ? "" : m));
const useNouns = (u) => new Set(nz8(u).split(" ").filter((w) => w.length >= 3 && !USE_STOP.has(w)).map(stem));
// --- the story shapes (S1 §B): the catalogue pick hands to the writers and check holds them to -----------------------------
// ladder, pas and scenario have their own G10 branches below; every other shape is checked by its roles here (G10 generic):
// `roles` the beat roles it may use, `need` {role: [min, max]} at 30 s, `use` the use-bearing roles (G13 counts and measures them),
// `breadth` true when it can carry a universal claim, `persona` true when one person may carry it. `beats` is the timing at 30 s.
const STORY_SHAPES = {
  "ladder": { name: "Refrain ladder", breadth: true, use: ["rung"], beats: "refrain arrives (0-3 s) -> 3-4 rungs at 30 s (4-6 at 60 s), each a title with one highlighted word over one real UI demo of a different use, 3-6 s each, rising simple -> done-for-you -> \"<verb> anything\" -> logo" },
  "pas": { name: "Problem, agitate, solve", breadth: true, use: ["benefit"], beats: "pain in \"you\" language (0-20%) -> agitate -> meet the product (20-30%) -> 2-4 benefits, one UI behaviour each -> proof number -> cta" },
  "scenario": { name: "One hero demo (scenario)", use: ["proof"], persona: true, beats: "before (15%) -> the task done for real in the UI (50%) -> after plus brand (20%) -> cta; single-task claims, persona tools, one spot of a series" },
  "intercut": { name: "Intercut parallel uses", breadth: true, roles: ["enemy", "thread", "turn", "collage", "cta"], need: { thread: [3, 5], turn: [1, 1], cta: [1, 1] }, use: ["thread"], beats: "3-5 people in different areas of life each hit the same enemy (0-40%, role enemy, or the thread's first beat) -> one turn line about everyone (role turn) -> each thread resolved by the real UI (40-85%, role thread, domain each) -> a collage of more uses (role collage, domains[]) -> logo / cta. OpenAI's Intelligent UI film is this shape" },
  "montage": { name: "Montage of range", breadth: true, roles: ["shot", "claim", "cta"], need: { shot: [6, 12], claim: [0, 1], cta: [1, 1] }, use: ["shot"], beats: "6-12 shots of 1-3 s, each a different output, person or genre, cut on the beat (role shot, domain each) -> one claim line (role claim) -> logo / cta" },
  "hero-strip": { name: "Hero + range strip", breadth: true, roles: ["open", "hero", "strip", "cta"], need: { hero: [1, 1], strip: [4, 8], cta: [1, 1] }, use: ["hero", "strip"], heroCap: 0.45, beats: "one hero demo, the real UI start to finish (40-50%, role hero) -> a rapid strip of 4-8 other uses, 1-2 s each (20-30%, role strip, domain each) -> cta. The hero may take 45% only with 4+ strip uses" },
  "before-after": { name: "Before / after (comparison)", breadth: true, roles: ["open", "pair", "cta"], need: { pair: [3, 6], cta: [1, 1] }, use: ["pair"], beats: "paired lines, the old way then the product's way, over 3-6 everyday tasks (role pair, 3-6 s each, domain each) -> cta" },
  "claim-ladder": { name: "Claim ladder", breadth: true, roles: ["open", "claim", "cta"], need: { claim: [4, 6], cta: [1, 1] }, use: ["claim"], beats: "4-6 claim titles (\"Thinks deeply\", \"Answers quickly\"), each proven by one real demo from a different area of life (role claim, 4-6 s each, domain each) -> cta" },
  "manifesto": { name: "Manifesto / belief", breadth: true, roles: ["belief", "people", "enabler", "cta"], need: { belief: [1, 2], people: [2, 8], enabler: [1, 2], cta: [1, 1] }, use: ["people"], beats: "a belief line (role belief, 0-15%) -> people living it, a montage (role people) -> the product as the enabler (role enabler) -> sign-off (cta)" },
  "life-arc": { name: "Universal life arc", breadth: true, persona: true, roles: ["moment", "payoff", "cta"], need: { moment: [3, 8], payoff: [1, 1], cta: [0, 1] }, use: ["moment"], beats: "one person across a long span (months or years), each moment a different use (role moment, 3+, domain each) -> an archetypal payoff (love, memory, a child; role payoff). Only when the arc is archetypal AND passes through 3+ uses (Google \"Parisian Love\")" },
  "day-in-life": { name: "Day in the life (multi-moment)", persona: true, roles: ["moment", "cta"], need: { moment: [5, 8], cta: [1, 1] }, use: ["moment"], beats: "morning -> work -> evening, a different use at each of 5-8 moments (role moment, domain each) -> cta. For assistants and daily tools" },
  "what-if": { name: "\"What if\" / provocation", roles: ["question", "world", "real", "cta"], need: { question: [1, 1], world: [1, 3], real: [1, 3], cta: [1, 1] }, use: ["real"], beats: "a question (0-15%, role question) -> the imagined world (30%, role world) -> it's real now, the product (role real) -> cta" },
  "countdown": { name: "Countdown / teaser", roles: ["motif", "reveal", "date"], need: { motif: [1, 2], reveal: [2, 6], date: [1, 1] }, use: ["reveal"], beats: "a motif (role motif) -> partial reveals counting down (role reveal) -> the date (role date)" },
  "testimony": { name: "Testimony arc", persona: true, roles: ["who", "before", "turning", "after", "line"], need: { who: [1, 1], before: [1, 2], turning: [1, 1], after: [1, 2], line: [1, 1] }, use: ["after"], beats: "who I am (role who) -> the before (role before) -> the turning point (role turning) -> the after with a number (role after) -> my line (role line)" },
  "roundup": { name: "Roundup / N things", roles: ["open", "item", "finale"], need: { item: [3, 8], finale: [1, 1] }, use: ["item"], beats: "a title card per item, 3-8 s each, one consistent grammar (role item) -> finale (role finale)" },
  "strategic": { name: "Strategic narrative", roles: ["change", "stakes", "promised", "capability", "proof", "cta"], need: { change: [1, 1], stakes: [1, 2], promised: [1, 1], capability: [2, 4] }, use: ["capability"], beats: "a big change in the world (role change) -> winners and losers (role stakes) -> the promised land (role promised) -> capabilities that get you there (role capability) -> proof -> cta" },
  "data-journey": { name: "Data journey", roles: ["question", "reveal", "meaning", "cta"], need: { question: [1, 1], reveal: [3, 8], meaning: [1, 1] }, use: ["reveal"], beats: "a question (role question) -> the data revealed in rising order (role reveal) -> the human meaning (role meaning)" },
  "steps": { name: "Task steps / recipe", persona: true, roles: ["goal", "step", "result", "cta"], need: { goal: [1, 1], step: [2, 8], result: [1, 1] }, use: ["step"], beats: "the goal (role goal) -> steps 1-N in the real UI (role step) -> the result (role result)" },
  "abt": { name: "And, but, therefore", roles: ["and", "but", "therefore", "cta"], need: { and: [1, 2], but: [1, 2], therefore: [1, 3], cta: [1, 1] }, use: ["therefore"], beats: "and: the world as it is (role and) -> but: the problem (role but) -> therefore: what the product does about it (role therefore) -> cta" },
  "titles": { name: "Title sequence", roles: ["card", "footage", "end"], need: { card: [2, 10], end: [1, 1] }, use: ["footage"], beats: "title cards over the footage, one name or line each, on the music's phrases (role card / footage) -> end card" },
  "process": { name: "Process / making-of", roles: ["material", "step", "result", "end"], need: { step: [3, 8], result: [1, 1] }, use: ["step"], beats: "the raw material (role material) -> the making, step by step (role step) -> the finished thing (role result) -> end" },
  "acts": { name: "Three acts", roles: ["setup", "conflict", "resolution", "end"], need: { setup: [1, 3], conflict: [1, 3], resolution: [1, 3] }, use: ["conflict", "resolution"], beats: "act one, the setup (role setup) -> act two, the conflict (role conflict) -> act three, the resolution (role resolution) -> end" },
  "trailer": { name: "Trailer", roles: ["tease", "beat", "title", "date"], need: { tease: [1, 2], beat: [3, 8], title: [1, 1] }, use: ["beat"], beats: "a cold tease (role tease) -> rising beats on the music (role beat) -> the title (role title) -> the date or CTA (role date)" },
};
const SHAPE_IDS = Object.keys(STORY_SHAPES);
const SHAPE_ROLES = new Set(SHAPE_IDS.flatMap((s) => STORY_SHAPES[s].roles || []));
// the shape's beat text; at <= 12 s a before / after pair is 1.5-3 s (3-6 s pairs do not fit 10 s: 4-5 beats in all)
const shapeBeats = (s, len = 0) => (s === "before-after" && len > 0 && len <= 22 ? STORY_SHAPES[s].beats.replace("3-6 s each", len <= 12 ? "1.5-3 s each" : "2-4 s each").replace("over 3-6 everyday", len <= 12 ? "over 2-3 everyday" : "over 2-4 everyday") : STORY_SHAPES[s].beats);
const pairRange = (len) => (len > 0 && len <= 12 ? [2, 3] : len > 0 && len <= 22 ? [2, 4] : [3, 6]);
const shapeRule = (s, len = 0) => (STORY_SHAPES[s] ? `${STORY_SHAPES[s].name} (shape "${s}"): ${shapeBeats(s, len)}.` : undefined);

function lfRole(b, i, n, hero) {
  const r = String(b.role || "").toLowerCase();
  if (r === "proof" || r === "turn" || LADDER_ROLES.includes(r) || PAS_ROLES.includes(r) || SHAPE_ROLES.has(r)) return r;
  if (LF_RANGES[15][r]) return r;
  const nm = String(b.name || "").toLowerCase();
  if (i === 0) return "hook";
  if (i === n - 1) return "cta";
  if (/\b(hero|reveal)\b/.test(nm) || b.value === true && !/use/.test(nm) || (hero && hero.beat === i + 1)) return "hero";
  if (/\b(payoff|resolve|button)\b/.test(nm)) return "payoff";
  if (/\b(statement|promise|line|principle)\b/.test(nm)) return "statement";
  return "demo";
}

// --- scope measurements (G13, and the pas rules of G10) ---------------------------------------------
// A scenario cluster = beats that share a content noun (the receipt, the table, five), over on_screen + picture + use + benefit + the
// shows lines, across every role (hook and cta included). The product's own surfaces (the composer, the caret, the dot, the product
// name, the refrain verb, the actor) are not scenario nouns: every rung shares them. A beat that links to 3+ different uses is a recap
// (a breadth beat), never part of one scenario.
const SURFACE_STOP = new Set(("real every each with into from over under back then while when what whole just only also more most once again film shot frame screen line lines word words title card text type typed types typing tap taps tapped click clicks press presses drag drags drop drops send sends sent ask asks asked asking answer answers question questions prompt prompts composer caret cursor bubble bubbles green black white pale blue grey gray light dark dot dots box boxes pill field input window button buttons icon hint placeholder stream streams streaming streamed tool tools build builds built make makes made gets give gives turn turns land lands appear appears open opens slide slides arrive arrives become becomes rolls roll pull pulls push camera zoom zooms huge large largest small single final finally first last next same empty itself themselves your yours their there here this that these those viewer viewers people person someone everyone anyone count number numbers brand mark logo wordmark name proof weekly week cta end close open real thing things stays stay holds hold sits drawn draws ends start starts above below beside behind around across change changes changed move moves grow grows inside outside place places left right instead would could still away down along read reads reading show shows shown look looks watch watches sees seen seeing know knows find finds need needs want wants keep keeps says said tells told gain gains happen happens moment moments benefit benefits rung rungs hook beat beats scene scenes fold folds folded away".split(" ")).map((w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, (m, g, off, str) => (str.length > 4 ? "" : m))));
const FIRST_PERSON_RE = /(^|[^a-z'])(i|i'm|i've|i'd|i'll|me|my|mine|myself)(?![a-z'])/i;
const BREADTH_RE = /\b(any|anything|every|everything|whatever|all kinds|all sorts|many|range|different|everyday|all)\b/i;
const linesOf = (b) => { const sr = Array.isArray(b.shows) ? b.shows.map((r) => (r && typeof r === "object" ? String(r.line || "") : "")).filter((x) => x.trim()) : []; return sr.length ? sr : String(b.on_screen || "").trim() ? [String(b.on_screen)] : []; };
function sceneAnalysis(p, beats, roles, lengthS, truth) {
  const stop = new Set([...SURFACE_STOP]);
  const addStop = (s) => nz8(s).split(" ").filter(Boolean).forEach((w) => stop.add(stem(w)));
  addStop(truth?.product?.name || ""); addStop(p.product || ""); addStop((p.refrain && p.refrain.verb) || "");
  // the actor is exempt only for the product's own surfaces: a word that is in the truth sheet's Native objects or Native words (anything else counts as a scenario noun)
  if (p.actor && typeof p.actor === "object") {
    const nat = new Set(nz8([...(truth?.objects || []), ...(truth?.words || [])].join(" ")).split(" ").filter(Boolean).map(stem));
    for (const w of nz8(`${p.actor.what || ""} ${p.actor.does || ""}`).split(" ").filter(Boolean)) if (nat.has(stem(w))) stop.add(stem(w));
  }
  const nouns = (text) => new Set(nz8(text).replace(/'/g, " ").split(" ").filter((w) => w.length >= 4 && !/\d/.test(w)).map(stem).filter((w) => w.length >= 4 && !stop.has(w)));
  const tok = beats.map((b) => nouns([b.on_screen, b.picture, b.use, ...linesOf(b)].filter(Boolean).join(" ")));
  const shared = (A, B) => [...A].filter((w) => [...B].some((v) => v === w || (Math.min(w.length, v.length) >= 5 && Math.abs(w.length - v.length) <= 3 && (w.startsWith(v) || v.startsWith(w)))));
  // two uses are one scenario only when they share 2+ nouns (rungs may share an incidental word); any other beat joins on one
  const joins = (A, B, bothUse) => shared(A, B).length >= (bothUse ? 2 : 1);
  const sh0 = shapeOf(p, beats);
  const USE_ROLES = new Set(STORY_SHAPES[sh0] && !["ladder", "pas", "scenario"].includes(sh0) ? STORY_SHAPES[sh0].use : ["rung", "benefit", "demo", "hero"]);
  const isUse = (i) => USE_ROLES.has(roles[i]);
  const useIdx = beats.map((_, i) => i).filter(isUse);
  const linksUse = (i) => useIdx.filter((u) => u !== i && shared(tok[i], tok[u]).length);
  const recap = beats.map((_, i) => !isUse(i) && linksUse(i).length >= 3);
  const dur = (i) => Number(beats[i].duration_s) || 0;
  // seeds: every use beat and the opening pain (hook + agitate in a pas)
  const seeds = [...useIdx.map((i) => [i])];
  const hook = roles.indexOf("hook");
  if (hook >= 0) seeds.push([hook, ...roles.map((r, i) => (r === "agitate" ? i : -1)).filter((i) => i >= 0)]);
  let best = { share: 0, beats: [], nouns: [] };
  for (const seed of seeds) {
    const st = new Set(seed.flatMap((i) => [...tok[i]]));
    const members = new Set(seed), via = new Set();
    beats.forEach((_, j) => { if (members.has(j) || recap[j]) return; const sh = shared(st, tok[j]); if (joins(st, tok[j], isUse(j) && seed.every(isUse))) { members.add(j); sh.forEach((w) => via.add(w)); } });
    const share = [...members].reduce((a, i) => a + dur(i), 0) / (lengthS || 1);
    if (members.size >= 2 && share > best.share) best = { share, beats: [...members].sort((a, b) => a - b), nouns: [...via] };
    else if (!best.beats.length && share > best.share) best = { share, beats: [...members], nouns: [] };
  }
  // the largest single use (one rung or benefit on its own)
  const bigUse = useIdx.reduce((m, i) => (dur(i) > (m.d || 0) ? { i, d: dur(i) } : m), {});
  const sMax = Math.max(best.share, bigUse.d ? bigUse.d / (lengthS || 1) : 0);
  const cluster = best.share >= (bigUse.d || 0) / (lengthS || 1) ? best : { share: sMax, beats: bigUse.i != null ? [bigUse.i] : [], nouns: [] };
  // D: distinct domains on use beats, plus a declared breadth burst (domains[] on a ways_in / close / open beat)
  const domOf = (b) => norm(b.domain || b.life_area).trim().replace(/\s+/g, "-");
  const useDomains = useIdx.map((i) => domOf(beats[i]));
  const burst = beats.flatMap((b, i) => (isUse(i) ? [] : Array.isArray(b.domains) ? b.domains.map((d) => norm(d).trim().replace(/\s+/g, "-")) : []));
  const domains = [...useDomains, ...burst].filter(Boolean);
  // P: beats outside the uses that call the scenario back (the pain set-up, the cta's punchline), plus a chain of "I" lines
  const multi = cluster.beats.length >= 2 && cluster.beats.some(isUse);
  const callbacks = multi ? cluster.beats.filter((i) => !isUse(i)) : [];
  const fp = beats.map((b, i) => (linesOf(b).some((l) => FIRST_PERSON_RE.test(l)) ? i : -1)).filter((i) => i >= 0);
  const iChain = fp.length >= 2 ? fp : [];
  const last = beats.length - 1;
  const closeFp = fp.includes(last) && !iChain.includes(last) ? [last] : [];
  const P = callbacks.length + iChain.length + closeFp.length;
  return { tok, shared, useIdx, isUse, recap, sMax, cluster, multi, domains, useDomains, burst, D: new Set(domains).size, callbacks, iChain, closeFp, P, bigUse };
}

// --- product-first routes (launch, promo, product videos) ----------------------------
// Real launch films (Apple, OpenAI, Linear, Raycast, Arc, Notion) are product-led: the real UI is the hero from
// the first second. Conceit devices (a museum of the old way, an allegory, an invented world, a cover version)
// are never offered for these routes; an instant visual pun that resolves to the product in a second is a pitch
// detail (`visual_pun`), not a device.
const PF_CONTAINER_OK = new Set(["query-log", "chat-thread", "interface-world"]);
const PF_BANNED_IDS = new Set(["cosmos-zoom", "object-pov", "unexpected-protagonist", "letter-from-future", "mockumentary", "product-as-character", "problem-villain", "inner-monologue", "letter-to-someone", "mirror", "one-shape", "sound-first", "data-letter", "story-loop"]);
const pfBanned = (d) => d.family === "metaphor" || (d.family === "container" && !PF_CONTAINER_OK.has(d.id)) || PF_BANNED_IDS.has(d.id);
const CONCEIT_RE = /\b(museums?|galler(?:y|ies)|exhibit(?:s|ion|ions)?|plinths?|under glass|dioramas?|parables?|fables?|allegor\w*|cover version|invented world|a world where|time capsule|archaeolog\w*|courtroom|trial of|funeral|obituary|eulogy|haunted|safari|odyssey|kingdom|ancient ruins?|natural history)\b/i;
// Source mode (references/sources.md): product-first is for a film built from a product's web or code. A film cut from footage (spine footage or
// existing-video), a song, a document or a brand kit has no "product UI within 3 s" to promise: it gets the footage-first gate (GF) instead.
// --sources <sources.json> | --source-mode <spine>; else <truth dir>/../sources.json; none -> today's behaviour (the format decides). An explicit --product-first still wins.
function loadSource(args, truthPath) {
  if (args["source-mode"] && args["source-mode"] !== true) return { spine: String(args["source-mode"]), case: args.case && args.case !== true ? String(args.case) : null };
  const cands = [];
  if (args.sources && args.sources !== true) cands.push(String(args.sources));
  else if (truthPath && truthPath !== true) cands.push(path.resolve(path.dirname(String(truthPath)), "..", "sources.json"));
  for (const c of cands) { const j = readSources(c); if (j) return j; if (args.sources && args.sources !== true) die(`--sources is not readable JSON: ${c}`); }
  return null;
}
const isProductFirst = (format, args, src = null) => !args["allow-conceit"] && (!!args["product-first"] || (productFirstApplies(src) !== false && ["launch", "promo", "product"].includes(format)));
// the footage-first gate's selects: ids -> {rating, gold} from --selects or <truth dir>/../footage/selects.json
function loadSelects(args, truthPath) {
  const cands = [];
  if (args.selects && args.selects !== true) cands.push(String(args.selects));
  else if (truthPath && truthPath !== true) cands.push(path.resolve(path.dirname(String(truthPath)), "..", "footage", "selects.json"));
  for (const c of cands) {
    let j = null;
    try { j = readJSON(path.resolve(c)); } catch { if (args.selects && args.selects !== true) die(`--selects is not readable JSON: ${c}`); continue; }
    const m = new Map();
    for (const b of [...(j.bites || []), ...(j.moments || [])]) if (b && b.id) m.set(String(b.id), { rating: Number(b.rating) || 0, gold: b.gold === true });
    return m;
  }
  return null;
}

// --- device scoring and distance ------------------------------------------------
const distance = (a, b) => AXES.filter((k) => a.axes[k] !== b.axes[k]).length;
// product-first picks need not differ on protagonist: that rule forced a "one person's story" device into every launch trio (S3 diagnosis)
const hardDiffer = (a, b, pf = false) => a.axes.family !== b.axes.family && (pf || a.axes.protagonist !== b.axes.protagonist) && a.axes.visual_world !== b.axes.visual_world;
const trioOk = (trio, pf = false) => trio.every((a, i) => trio.every((b, j) => j <= i || (distance(a, b) >= (pf ? 4 : 5) && hardDiffer(a, b, pf))));

// --- video type -> claim scope -> the story shapes offered to Sure, Bold and Wild ----------------
// The one place pick decides shapes. A later pass (the formats picker) adds rows per video type (S1 C/E.2: intercut uses,
// hero + range strip, montage, manifesto...); today the shapes story.mjs can check are ladder, pas and scenario.
// A type without a row (explainer, social) gets no shape unless the film is product-first (then the launch row).
// the three plot engines (REBUILD 2): each HAS a turn the script states in one line (pitch.turn). refrain-break = a ladder of real uses that breaks at
// 60-75%; reversal = problem -> turn (the product reverses it) -> proof ladder -> payoff that answers the setup (pas; scenario for a single task);
// before-after = the old way against the new with the cause visible. A broad claim gets all three (they differ in where the turn sits and what it reverses).
const LAUNCH_SHAPES = { universal: ["ladder", "pas", "before-after"], category: ["ladder", "pas", "before-after"], "single-task": ["scenario", "scenario", "scenario"] };
// the shape -> engine table (references/story.md, Plot engines): a pitch's engine that does not match its shape is a warning
const ENGINE_OF_SHAPE = { pas: "reversal", intercut: "reversal", ladder: "refrain-break", montage: "refrain-break", "claim-ladder": "refrain-break", "hero-strip": "refrain-break", scenario: "before-after", "before-after": "before-after", steps: "before-after", process: "before-after" };
const ENGINES = {
  "refrain-break": "Refrain ladder with a break: one refrain verb, a rung per real use, and at 60-75% the rung that BREAKS the pattern (the plain answer, the unexpected use, the refrain turned on the viewer). The turn is the break.",
  reversal: "Problem, turn, proof ladder, payoff: the setup names a problem the viewer has, the turn is the product REVERSING it (something visibly flips), the proof is a short ladder of real uses, the payoff answers the setup (the setup's object or words return, changed).",
  "before-after": "Before / after with the cause visible: the old way, then the new way, and the one thing that makes the difference (the cause) is on screen at the turn, so the viewer sees WHY it changed, not only that it did.",
};
const TURN_RULE = "When your slot's engine has a turn (a turn is an OPTIONAL tool since Plan 03: a clear feature demonstration or a manifesto may have none), state it in the pitch: engine (refrain-break | reversal | before-after) and turn { line, reverses, payoff }: line = the one beat's words (that beat is marked turn: true and its intent relation is \"but\"), reverses = what flips (a belief, a situation, an object), payoff = what answers the setup (the \"answer\" beat). A turn you declare must reverse something and the payoff must answer the setup; no turn declared is fine.";
const SHAPES_BY_TYPE = {
  launch: LAUNCH_SHAPES,
  promo: LAUNCH_SHAPES,
  product: LAUNCH_SHAPES,
  brand: LAUNCH_SHAPES,
  explainer: null,
};
const PICK_LABELS = ["Sure", "Bold", "Wild"];
// -> { shapes: [Sure, Bold, Wild] | null, why }
function shapesFor({ format, scope, productFirst, footage, forced, oneFeature }) {
  if (forced) return { shapes: [forced, forced, forced], why: `--shape ${forced}` };
  if (footage) return { shapes: null, why: "a footage film: cut from the footage, no product shape" };
  const row = Object.prototype.hasOwnProperty.call(SHAPES_BY_TYPE, format) ? SHAPES_BY_TYPE[format] : undefined;
  const table = row === undefined ? (productFirst ? LAUNCH_SHAPES : null) : row === null && productFirst ? LAUNCH_SHAPES : row;
  if (!table) return { shapes: null, why: `no story shape for a ${format || "film"} of this type` };
  if (scope && table[scope]) return { shapes: table[scope], why: `${format || "product"} film, ${scope} claim` };
  // no claim scope (a legacy sheet off the product-first path): the old rule, one feature named -> scenario
  return { shapes: oneFeature ? ["scenario", "scenario", "scenario"] : ["ladder", "ladder", "ladder"], why: "no claim scope in the truth sheet: the old rule (one feature named -> scenario)" };
}
const BUILD_W = { 5: 1.1, 4: 1, 3: 0.8, 2: 0.4, 1: 0.15 };

function weigh(d, ctx) {
  const why = [];
  let w = 1;
  if (d.family === "container") { w *= 1.5; why.push("borrowed container x1.5"); }
  if (d.family === "metaphor") { w *= 1.3; why.push("metaphor x1.3"); }
  if (d.overused) { w *= 0.3; why.push("LLM-overused x0.3"); }
  if (ctx.recent.has(d.id)) { w *= 0.15; why.push("used recently x0.15"); }
  const prods = d.fits.products;
  if (ctx.tags.length) {
    if (prods.some((p) => ctx.tags.includes(p))) { w *= 1.5; why.push("fits the product x1.5"); }
    else if (prods.includes("any")) w *= 1.1;
    else { w *= 0.8; why.push("product fit weak x0.8"); }
  }
  if (ctx.format) {
    if (d.fits.formats.includes(ctx.format)) w *= 1.3;
    else { w *= 0.5; why.push(`not a ${ctx.format} format x0.5`); }
  }
  if (ctx.tones.length && d.fits.tones.some((t) => ctx.tones.includes(t))) { w *= 1.3; why.push("tone match x1.3"); }
  let bw = BUILD_W[d.build.score] ?? 1;
  if (d.needs === "footage" && ctx.footage) bw = 1; // footage supplied: the founder monologue is buildable
  if (bw !== 1) why.push(`buildability ${d.build.score}/5 x${bw}`);
  w *= bw;
  if (ctx.like && ctx.like.id !== d.id && AXES.filter((k) => ctx.like.axes[k] === d.axes[k]).length >= 3) { w *= 2; why.push(`like ${ctx.like.id} x2`); }
  return { w: Math.round(w * 1000) / 1000, why };
}

// product-first: the reach lives in craft (camera, joins, rhythm), never in a narrower or more personal story
const LABEL_MEANING_PF = {
  Sure: "the clearest product story: the most universal uses, plainly, in order",
  Bold: "the same claim at a faster, bolder rhythm: a different emphasis and order of real uses",
  Wild: "the reach in craft: an unexpected but true refrain, one continuous take, the boldest joins; never a narrower story",
};
const LABEL_MEANING = {
  Sure: "high feasibility, reads instantly: the safe recommendation",
  Bold: "high originality, still on the brief",
  Wild: "the reach: might be the best film, might not work",
};

const SCOPE_RULE = {
  universal: "Universal claim: the story is the claim's range. All three scripts are breadth shapes (a ladder of real uses from 4+ areas of life, most universal first); they differ in plot engine (refrain-break, reversal, before-after: where the turn sits and what it reverses), pacing, joins and which areas lead (lead_domains), never in which claim they tell. No persona, no recurring situation, no use over 35% of the film (aim 25%), every promise clause shown, the retell names the range. Specific in each use's details (the exact prompt, the real label), common in situation. G13 checks it.",
  category: "Category claim: 3+ distinct real uses of the one job family, no single use over 35% of the film, at most one callback to a scenario. G13 checks it.",
  "single-task": "Single-task claim: one viewer doing the one real task (the scenario): the viewer's before, the task in the real UI, the after with the brand, one action.",
};

// --- the cliche detector ---------------------------------------------------------
const CL = CAT.cliche;
function beatText(b) { return [b.name, b.on_screen, b.visual].filter(Boolean).join(" • "); }
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a signal matches at a word start ("hud" never matches "should"); stems like "frustrat" still match "frustrated"
const hasSignal = (text, sig) => (/^[a-z]/i.test(sig) ? new RegExp(`(^|[^a-z])${esc(sig.toLowerCase())}`).test(text) : text.includes(sig.toLowerCase()));
function detectDefaultBeat(b, i, n) {
  const all = norm(beatText(b)); // name + on screen + visual
  const said = norm([b.name, b.on_screen].filter(Boolean).join(" \u2022 ")); // what the beat is and what the viewer reads
  const hit = (id, t = said) => CL.beats.find((x) => x.id === id).signals.some((s) => hasSignal(t, s));
  if (hit("intro-reveal")) return "intro-reveal";
  if (hit("social-proof")) return "social-proof";
  if (i >= n - 2 && hit("cta")) return "cta";
  if (/\bfeatures?\b|\bbenefits?\b|capabilit/.test(said)) return "feature";
  if (i === 0 && (hit("hook-stat", all) || /^\s*\d[\d,.]*\s*%/.test(norm(b.on_screen)) || /\?\s*$/.test(String(b.on_screen || "").trim()))) return "hook-stat";
  if (i <= 2 && hit("problem-montage", all)) return "problem-montage";
  return "none";
}
// longest run of default beats appearing in the default order (a longest increasing subsequence)
function inOrder(nums) {
  const best = [];
  for (let i = 0; i < nums.length; i++) {
    best[i] = 1;
    for (let j = 0; j < i; j++) if (nums[j] < nums[i]) best[i] = Math.max(best[i], best[j] + 1);
  }
  return nums.length ? Math.max(...best) : 0;
}
function clicheMap(beats) {
  const n = beats.length;
  let featureN = 4;
  return beats.map((b, i) => {
    const declared = b.maps_to && b.maps_to !== "none" ? String(b.maps_to) : null;
    let det = detectDefaultBeat(b, i, n);
    let id = declared || det;
    if (id === "feature" || /^feature/.test(id)) { id = `feature-${Math.min(featureN, 6) - 3}`; featureN++; }
    const beat = CL.beats.find((x) => x.id === id);
    return { beat: i + 1, name: b.name, default_beat: beat ? beat.id : "none", n: beat ? beat.n : null, source: declared ? "declared" : det !== "none" ? "detected" : null };
  });
}
function visualCliches(texts) {
  const t = norm(texts.join(" • "));
  return CL.visuals.filter((v) => v.signals.some((s) => hasSignal(t, s))).map((v) => v.name);
}

// --- airtight story: the plan, the coverage map, the beat sheets (references/story.md) -------------------------------------
const TURN_KINDS = ["object-flips", "role-swap", "removal", "refrain-stops", "cause-lands", "rule-breaks"];
// idea from social-media-skills hook-writer (MIT); our code: how the first 2 s open, one mechanism per script (warnings only, old plans stay valid)
const HOOK_KINDS = ["villain-in-action", "outcome-flat", "felt-tension", "true-fact", "product-doing", "flash-forward", "transformation", "character-action"];
const PEAK_KINDS = ["scale-reveal", "pattern-break", "absence", "split-compare", "count-climb", "cause-close-up", "speed-ramp", "full-state"];
// beat sheets by length bucket (10, 15, 30, 45, 60) and engine: { slot, from, to, note } in seconds of the bucket's own length (sheet --length scales them to the film)
const SHEET_BUCKETS = [10, 15, 30, 45, 60];
const sheetBucket = (len) => (len <= 12 ? 10 : len <= 22 ? 15 : len <= 37 ? 30 : len <= 52 ? 45 : 60);
const S = (slot, from, to, note, extra = {}) => ({ slot, from, to, note, ...extra });
const REV_SHEETS = {
  10: [S("hook", 0, 2, "hook + the product on screen"), S("turn", 2, 3.5, "the turn: what visibly flips"), S("proof", 3.5, 5.8, "the proof, then a breath", { rest_after: true }), S("peak", 5.8, 8.2, "the peak: the LONGEST beat, >= 2.2 s, starts at 58-75%"), S("payoff", 8.2, 10, "payoff + end card: the end line IS the payoff line, >= 1.8 s")],
  15: [S("hook", 0, 2, "hook + product: real UI mid-action"), S("turn", 2, 4, "the turn by 5 s (a statement line, held only its reading time)"), S("proof", 4, 7.5, "the one proof, real UI changing every ~2 s"), S("rung", 7.5, 9.5, "a second use, then a breath", { rest_after: true }), S("peak", 9.5, 11.5, "the peak, the furthest use, at 60-75%"), S("payoff", 11.5, 13, "payoff line answering the hook"), S("end", 13, 15, "end card: >= 2 s")],
  30: [S("hook", 0, 2, "hook"), S("open", 2, 6, "setup"), S("turn", 6, 11, "the turn"), S("proof", 11, 18, "proofs, escalating, then a rest", { rest_after: true }), S("peak", 18, 22.5, "the peak"), S("payoff", 22.5, 27, "payoff"), S("end", 27, 30, "end card")],
  45: [S("hook", 0, 3, "hook"), S("open", 3, 9, "setup"), S("turn", 9, 14, "the turn"), S("proof", 14, 27, "proofs, escalating, then a rest", { rest_after: true }), S("peak", 27, 33, "the peak"), S("payoff", 33, 40, "payoff"), S("end", 40, 45, "end card")],
  60: [S("hook", 0, 3, "cold open"), S("open", 3, 12, "setup"), S("turn", 12, 18, "the turn"), S("proof", 18, 36, "three proofs, escalating, then a rest", { rest_after: true }), S("peak", 36, 45, "the peak"), S("payoff", 45, 54, "payoff"), S("end", 54, 60, "end card")],
};
const REFRAIN_SHEETS = {
  10: [S("open", 0, 2, "the refrain arrives, the product on screen"), S("rung", 2, 3.5, "a rung"), S("rung", 3.5, 5.8, "a rung, then a breath", { rest_after: true }), S("peak", 5.8, 8.2, "the break = the peak: the LONGEST beat, >= 2.2 s, starts at 58-75%"), S("close", 8.2, 10, "close: the end line, >= 1.8 s")],
  15: [S("open", 0, 2, "the refrain arrives, the product on screen"), S("rung", 2, 4.5, "a rung"), S("rung", 4.5, 7.5, "a rung"), S("rung", 7.5, 9.5, "a rung, then a breath", { rest_after: true }), S("peak", 9.5, 11.5, "the break = the peak, at 60-75%"), S("close", 11.5, 15, "close + end card: >= 2 s")],
  30: [S("open", 0, 2, "the refrain arrives"), S("rung", 2, 6, "rung"), S("rung", 6, 11, "rung"), S("rung", 11, 18, "rungs, escalating, then a rest", { rest_after: true }), S("peak", 18, 22.5, "the break = the peak"), S("close", 22.5, 30, "close + end card")],
  45: [S("open", 0, 3, "the refrain arrives"), S("rung", 3, 9, "rung"), S("rung", 9, 14, "rung"), S("rung", 14, 27, "rungs, escalating, then a rest", { rest_after: true }), S("peak", 27, 33, "the break = the peak"), S("close", 33, 45, "close + end card")],
  60: [S("open", 0, 3, "cold open: the refrain arrives"), S("rung", 3, 12, "rung"), S("rung", 12, 18, "rung"), S("rung", 18, 36, "rungs, escalating, then a rest", { rest_after: true }), S("peak", 36, 45, "the break = the peak"), S("close", 45, 60, "close + end card")],
};
const BEAT_SHEETS = Object.fromEntries(SHEET_BUCKETS.map((b) => [b, { reversal: REV_SHEETS[b], "before-after": REV_SHEETS[b], "refrain-break": REFRAIN_SHEETS[b] }]));
const END_MIN_S = (len) => (len <= 12 ? 1.8 : len <= 22 ? 2.0 : 2.5);
const peakWindowOf = (len) => (len <= 12 ? [0.58, 0.75] : [0.6, 0.75]);
function sheetFor(len, engine) {
  const b = sheetBucket(len), k = len / b;
  const one = (e) => BEAT_SHEETS[b][e].map((r) => ({ slot: r.slot, from_s: r1d(r.from * k), to_s: r1d(r.to * k), from_pct: Math.round((r.from / b) * 100), to_pct: Math.round((r.to / b) * 100), note: r.note, rest_after: r.rest_after || undefined }));
  const engines = engine ? [engine] : Object.keys(BEAT_SHEETS[b]);
  return { length_s: len, bucket: b, sheets: Object.fromEntries(engines.map((e) => [e, one(e)])), rules: { peak: `the peak beat is the longest in the film (peak-not-longest); it starts at ${peakWindowOf(len).map((x) => Math.round(x * 100)).join("-")}% of the running time`, end: `the last beat is at least ${END_MIN_S(len)} s (end-short)`, beats: len <= 12 ? "4 to 5 beats (beat-count)" : "see the bucket" } };
}
// the claim ids a truth sheet's Surprising facts cite: "[c8]" or "c8:" ("- c8: the jam keeps playing...")
const factClaimIds = (truth) => [...new Set((truth.facts || []).flatMap((f) => [...String(f).matchAll(/\[(c\d+)\]|(?<![\w])(c\d+)\s*:/gi)].map((m) => String(m[1] || m[2]).toLowerCase())))];
// what the story must account for: every Must-show feature and every claim id in Surprising facts
const requiredCoverage = (truth) => [...(truth.features || []).map((f) => ({ feature: f })), ...factClaimIds(truth).map((c) => ({ claim: c }))];
const covKey = (r) => (r.claim != null ? `claim:${String(r.claim).toLowerCase()}` : `feature:${nz8(r.feature)}`);
const covMatch = (row, req) => (req.claim != null ? row.claim != null && String(row.claim).toLowerCase() === String(req.claim).toLowerCase() : row.feature != null && (nz8(row.feature) === nz8(req.feature) || nz8(row.feature).includes(nz8(req.feature)) || nz8(req.feature).includes(nz8(row.feature))));
const covName = (r) => (r.claim != null ? String(r.claim) : `"${r.feature}"`);
const wordsN = (x) => String(x || "").trim().split(/\s+/).filter(Boolean).length;
// a person in the picture or the line: the viewer, a named role, a body, a voice
const PERSON_RE = /\b(you|your|you're|i|i'm|my|me|we|he|she|they|him|her|his|their|person|people|woman|man|boy|girl|kid|kids|founder|boss|manager|colleague|coworker|client|customer|student|teacher|designer|engineer|writer|speaker|presenter|someone|everyone|nobody|face|hands?|voice|mouth|speaks?|speaking|says?|said|talks?|asks?|stumbles?|freezes?|frozen)\b/i;
const STOP_CB = new Set("the a an and or of to in on at by for with from is it its this that as be are was you your we our i my me not no so but if then than into onto over up out all any one has have had will can just very".split(" "));
const cbWords = (t) => new Set(nz8(t).split(" ").filter((w) => w.length > 3 && !STOP_CB.has(w)));
const beatBlob = (b) => [b && b.on_screen, b && b.vo, b && b.visual, b && b.picture, ...(Array.isArray(b && b.shows) ? b.shows.map((r) => (r && typeof r === "object" ? r.line : "")) : [])].filter(Boolean).join(" ");
// a headline that is a feature label: no viewer voice, no felt moment, no payoff. "Get the why", "Write the better word", "Practice what you get wrong".
const FEATURE_VERB_RE = /^\s*(get|write|practice|practise|see|learn|track|build|find|create|use|try|discover|explore|improve|master|unlock|access|review|check|compare|save|organi[sz]e|manage|customi[sz]e|boost|enhance|streamline|analy[sz]e|search|browse)\b/i;
const VOICE_RE = /\b(you|your|you're|you'll|i|i'm|i've|my|me|we|nobody|everyone|someone)\b|[?!]|\.{3}/i;
const FELT_RE = /\b(never|again|finally|still|sorry|oops|wait|um+|uh+|didn't|don't|can't|couldn't|wasn't|froze|freeze|stuck|blank|late|spoke|said|says?|sounds?|heard|meant)\b/i;
function featureLabelOf(text) {
  const t = String(text || "").trim();
  if (!t || wordsN(t) > 8) return false;
  if (FEATURE_VERB_RE.test(t) && !/[?!]|\.{3}/.test(t) && !/^\s*\w+\s+(me|us)\b/i.test(t)) return true; // an imperative that names a feature ("Get the why", "Practice what you get wrong"), not a moment
  if (VOICE_RE.test(t)) return false; // the viewer's voice
  if (FELT_RE.test(t)) return false; // a felt moment
  return !/\b(is|are|was|were|be|am|has|have|had|do|does|did|can|will|would|they|he|she)\b|\w+(ing|ed)\b/i.test(t); // a bare noun phrase
}
// The recommendation for the console: the pitch that passes the bar, ranked by originality + memorability first.
// Never recommend a pitch with originality <= 3 when another passing pitch scores >= 4 on originality. The reason is shown in the console data.
function recommendPitch(results) {
  const rows = results.filter((r) => r && r.scores && r.scores.adjusted).map((r) => ({ label: r.label || r.pitch, ship: r.verdict === "ship", o: r.scores.adjusted.originality, m: r.scores.adjusted.memorability, total: r.scores.total, rank: Math.round(((r.scores.adjusted.originality * 1.5 + r.scores.adjusted.memorability * 1.25) * 100)) / 100 + r.scores.total / 10 }));
  if (!rows.length) return null;
  const pool = rows.some((r) => r.ship) ? rows.filter((r) => r.ship) : rows;
  const bold = pool.filter((r) => r.o >= 4);
  const eligible = bold.length ? bold : pool;
  const pick = [...eligible].sort((a, b) => b.rank - a.rank || b.total - a.total)[0];
  const skipped = pool.filter((r) => r !== pick && r.o <= 3 && pick.o >= 4);
  const why = skipped.length
    ? `${pick.label} (originality ${pick.o}, memorability ${pick.m}, weighted ${pick.total}) over ${skipped.map((r) => `${r.label} (originality ${r.o}, weighted ${r.total})`).join(", ")}: a pitch with originality 3 or less is not recommended while another passing pitch scores 4+ on originality`
    : `${pick.label}: highest originality + memorability among ${rows.some((r) => r.ship) ? "the pitches that pass the bar" : "the pitches (none passes the bar)"} (originality ${pick.o}, memorability ${pick.m}, weighted ${pick.total})`;
  return { recommended: pick.label, why, ranking: rows.map((r) => ({ label: r.label, originality: r.o, memorability: r.m, weighted: r.total, passes: r.ship })).sort((a, b) => b.originality + b.memorability - (a.originality + a.memorability) || b.weighted - a.weighted) };
}

const ANGLE_STOP = new Set("the a an and or of to in on at by for with from is it its this that as be are was you your we our i my me not no so but if then than into onto over up out all any one every each just get gets can will".split(" "));
const angleWords = (a) => new Set(nz8(a).split(" ").filter((w) => w.length >= 3 && !ANGLE_STOP.has(w)).map(stem));

// a swap_breaks line is anchored when it names a Native word, a claim id, or shares 3+ meaningful words with a claim's text
function swapAnchored(text, truth, claims) {
  const ids = new Set([...factClaimIds(truth), ...(claims || []).map((c) => String(c.id).toLowerCase())]);
  if ([...String(text).matchAll(/\bc\d+\b/gi)].some((m) => ids.has(m[0].toLowerCase()))) return true;
  if ((truth.words || []).some((w) => mentions(text, w))) return true;
  const sig = (x) => new Set(nz8(x).split(" ").filter((w) => w.length >= 4 && !ANGLE_STOP.has(w)).map(stem));
  const t = sig(text);
  return [...(truth.facts || []), ...(claims || []).map((c) => c.text)].some((c) => [...sig(c)].filter((w) => t.has(w)).length >= 3);
}
// the plan validator: story/plan.json against story/picks.json, the truth sheet and the claims
function planProblems(plan, picks, truth, claims) {
  const problems = [], warnings = [];
  const slots = plan && Array.isArray(plan.slots) ? plan.slots : [];
  const pickList = picks && Array.isArray(picks.picks) ? picks.picks : [];
  const labels = pickList.map((x) => x.label);
  const got = slots.map((s) => s.label);
  if (!slots.length) problems.push("plan-slots: the plan has no slots[]");
  else if (got.length !== labels.length || new Set(got).size !== got.length || !labels.every((l) => got.includes(l))) problems.push(`plan-slots: the plan has ${got.join(", ") || "none"}; the picks have ${labels.join(", ")}: exactly those labels, once each`);
  const menu = new Set(((picks && picks.menu) || []).map((m) => m.id));
  const pf = !!(picks && picks.product_first);
  for (const s of slots) {
    const pk = pickList.find((x) => x.label === s.label);
    if (pk) {
      if (pk.shape && s.shape !== pk.shape) problems.push(`plan-shape: ${s.label}: shape "${s.shape}" but the picks slot says "${pk.shape}" (copy it)`);
      if (pk.engine && s.engine !== pk.engine) problems.push(`plan-shape: ${s.label}: engine "${s.engine}" but the picks slot says "${pk.engine}" (copy it)`);
    }
    if (s.device != null && !menu.has(s.device)) problems.push(`plan-device: ${s.label}: device "${s.device}" is not on the picks menu`);
    if (s.device != null && !String(s.device_reason || "").trim()) warnings.push(`${s.label}: device_reason missing`);
    // Plan 03: a turn and a peak are OPTIONAL tools: a slot may declare none; a declared kind must still be a known one
    if (s.turn_kind && !TURN_KINDS.includes(s.turn_kind)) problems.push(`plan-turn-kind: ${s.label}: "${s.turn_kind}" is not one of ${TURN_KINDS.join(" | ")}`);
    if (s.peak_kind && !PEAK_KINDS.includes(s.peak_kind)) problems.push(`plan-peak-kind: ${s.label}: "${s.peak_kind}" is not one of ${PEAK_KINDS.join(" | ")}`);
    if (!s.hook_kind) warnings.push(`plan-hook-kind: ${s.label}: no hook_kind (one of ${HOOK_KINDS.join(" | ")})`);
    else if (!HOOK_KINDS.includes(s.hook_kind)) warnings.push(`plan-hook-kind: ${s.label}: "${s.hook_kind}" is not one of ${HOOK_KINDS.join(" | ")}`);
    const aw = wordsN(s.angle);
    if (!aw) problems.push(`plan-angle: ${s.label}: no angle (the proposition this script argues, <= 14 words)`);
    else if (aw > 14 || /\band\b/i.test(String(s.angle))) problems.push(`plan-angle: ${s.label}: "${s.angle}" ${aw > 14 ? `is ${aw} words (14 at most)` : 'has "and" (one idea)'}`);
    const sw = String(s.swap_breaks || "").trim();
    if (!sw) problems.push(`plan-swap: ${s.label}: no swap_breaks (what in this angle the main competitor cannot claim, 5+ words naming a Native word or a claim)`);
    else if (wordsN(sw) < 5) problems.push(`plan-swap: ${s.label}: swap_breaks "${sw}" is ${wordsN(sw)} words (5 at least)`);
    else if (truth && !swapAnchored(sw, truth, claims)) problems.push(`plan-swap: ${s.label}: swap_breaks "${sw}" names no Native word and no claim id or claim text of the truth sheet: say what only this product has`);
    // villain_picture, turn and peak are optional tools (Plan 03): no warning when a slot leaves them out
    if (claims) for (const c of s.owned_claims || []) if (!claims.some((x) => x.id === String(c))) problems.push(`plan-claims: ${s.label}: owned claim "${c}" is not in the claims`);
  }
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    const a = slots[i], b = slots[j];
    if (a.device != null && a.device === b.device) problems.push(`plan-device: ${a.label} and ${b.label} share the device "${a.device}"`);
    else if (a.device != null && b.device != null) { const da = findDevice(a.device), db = findDevice(b.device); if (da && db && !(hardDiffer(da, db, pf) && distance(da, db) >= (pf ? 4 : 5))) problems.push(`plan-device: ${a.label} (${da.id}) and ${b.label} (${db.id}) are too alike (differ on ${distance(da, db)} of 7 axes, ${pf ? 4 : 5} needed, and on family and visual_world)`); }
    if (TURN_KINDS.includes(a.turn_kind) && a.turn_kind === b.turn_kind) problems.push(`plan-turn-kind: ${a.label} and ${b.label} share the turn kind "${a.turn_kind}"`);
    if (PEAK_KINDS.includes(a.peak_kind) && a.peak_kind === b.peak_kind) problems.push(`plan-peak-kind: ${a.label} and ${b.label} share the peak kind "${a.peak_kind}"`);
    if (HOOK_KINDS.includes(a.hook_kind) && a.hook_kind === b.hook_kind) warnings.push(`plan-hook-kind: ${a.label} and ${b.label} share the hook kind "${a.hook_kind}"`);
    const wa = angleWords(a.angle), wb = angleWords(b.angle), m = Math.min(wa.size, wb.size);
    if (m && [...wa].filter((w) => wb.has(w)).length / m >= 0.6) problems.push(`plan-angle: ${a.label} and ${b.label} argue nearly the same angle ("${a.angle}" / "${b.angle}")`);
  }
  // coverage: every Must-show feature and every Surprising-facts claim id has a row (a slot that owns it, or a cut with a reason)
  const cov = plan && Array.isArray(plan.coverage) ? plan.coverage : [];
  if (truth) for (const req of requiredCoverage(truth)) if (!cov.some((r) => covMatch(r, req))) problems.push(`plan-coverage: ${covName(req)} (${req.claim != null ? "a Surprising fact" : "a Must-show feature"}) has no coverage row: give it a slot or cut it with a reason`);
  for (const r of cov) {
    if (r.cut != null && wordsN(r.cut) < 4) problems.push(`plan-coverage: ${covName(r)}: a cut needs a reason of 4+ words ("${r.cut}")`);
    if (r.cut == null && r.slot == null) problems.push(`plan-coverage: ${covName(r)}: a row needs a slot or a cut`);
    if (r.slot != null) {
      const sl = slots.find((s) => s.label === r.slot);
      if (!sl) problems.push(`plan-coverage: ${covName(r)}: slot "${r.slot}" is not a label of the plan`);
      else if (r.claim != null && !(sl.owned_claims || []).map(String).includes(String(r.claim))) problems.push(`plan-coverage: ${r.claim} is assigned to ${r.slot} but not in its owned_claims`);
    }
  }
  return { problems, warnings };
}
// a pitch's coverage rows in beat order: [{key, name, beat}]
const coverageSeq = (p) => (Array.isArray(p.coverage) ? p.coverage : []).filter((r) => r && r.cut == null && Number(r.beat) >= 1).map((r) => ({ key: covKey(r), name: covName(r), beat: Number(r.beat) })).sort((a, b) => a.beat - b.beat).map((x) => x.key).filter((k, i, a) => a.indexOf(k) === i);
const lcsLen = (a, b) => { const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]); return t[a.length][b.length]; };
// the plan beside a pitch (story/plan.json), or --plan
function loadPlan(args, pitchFile) {
  const f = args.plan && args.plan !== true ? path.resolve(String(args.plan)) : pitchFile ? path.join(path.dirname(pitchFile), "plan.json") : null;
  if (!f || !fs.existsSync(f)) { if (args.plan && args.plan !== true) die(`--plan not found: ${f}`); return null; }
  try { return readJSON(f); } catch (e) { die(`plan is not valid JSON: ${e.message}`); }
}

// --- commands -------------------------------------------------------------------
if (cmd === "truth") {
  if (!args.out || args.out === true) die("--out <truth.md> required");
  const f = path.resolve(String(args.out));
  if (fs.existsSync(f) && !args.force) die(`${f} exists (pass --force to overwrite)`);
  writeFile(f, truthTemplate(args.product && args.product !== true ? String(args.product) : ""));
  out({ ok: true, truth: f, sections: TRUTH.map((s) => s.h), next: `Fill it (every <placeholder>), then: node story.mjs pick --truth ${path.basename(f)}` });
} else if (cmd === "devices") {
  if (args.id) {
    const d = findDevice(args.id);
    if (!d) die(`unknown device "${args.id}". List: node story.mjs devices`);
    out(d);
  } else {
    let ds = DEVICES;
    if (args.family) {
      const f = norm(args.family);
      ds = ds.filter((d) => d.family === f || norm(CAT.families[d.family].code) === f);
      if (!ds.length) die(`unknown family "${args.family}". Families: ${Object.entries(CAT.families).map(([k, v]) => `${k} (${v.code})`).join(", ")}`);
    }
    if (args.fits) {
      const tags = list(args.fits).map(norm);
      ds = ds.filter((d) => tags.every((t) => [...d.fits.products, ...d.fits.tones, ...d.fits.formats].includes(t)));
    }
    if (args.overused) ds = ds.filter((d) => d.overused);
    if (args.fresh) ds = ds.filter((d) => !d.overused);
    if (args.q) {
      const words = norm(args.q).split(/\s+/).filter(Boolean);
      ds = ds.filter((d) => {
        const hay = norm([d.id, d.code, d.name, d.what, d.example, d.seen_in, ...d.fits.products, ...d.fits.tones, ...Object.values(d.axes)].join(" "));
        return words.every((w) => hay.includes(w));
      });
    }
    out({
      count: ds.length,
      devices: ds.map((d) => ({ id: d.id, code: d.code, name: d.name, family: d.family, what: d.what, build: d.build.score, overused: d.overused || undefined, fits: [...d.fits.products, ...d.fits.formats].join(", ") })),
      hint: "Full entry: node story.mjs devices --id <id>",
    });
  }
} else if (cmd === "cliche") {
  out({ ...CL, overused_devices: CL.overused_devices.map((id) => ({ id, name: findDevice(id)?.name })) });
} else if (cmd === "pick") {
  const truth = loadTruth(args.truth);
  if (!truth) die("--truth <truth.md|truth.json> required (write one with: node story.mjs truth --out truth.md)");
  const fmt0 = norm(args.format && args.format !== true ? args.format : truth.format.format || "").trim() || null;
  const src0 = loadSource(args, args.truth);
  const pf0 = isProductFirst(fmt0, args, src0);
  const scopeNeeded = needsScope(fmt0, pf0) && !isFootageLed(src0);
  if (args.scope && args.scope !== true) truth.claim_scope = { ...truth.claim_scope, scope: String(args.scope) };
  if (scopeNeeded && !scopeOf(truth)) die(`the truth sheet has no Claim scope (universal | category | single-task), so pick cannot choose the story shape. It was written before the scope rules: regenerate it (re-run the research lead, or add "## Claim scope" with scope, why, clauses, audience and "## Use moments": 8 to 12 everyday uses ranked most universal first; template: node story.mjs truth --out new.md), or pass --scope <s>.`);
  const gaps = truthGaps(truth, { scope: scopeNeeded });
  const filled = truth.objects.length + truth.forms.length + (truth.transformation ? 1 : 0) + (truth.emotional_truth ? 1 : 0);
  if (filled < 4) die(`the truth sheet is still empty (fill it first):\n- ${gaps.join("\n- ")}`);
  const count = Math.max(1, Math.min(3, Number(args.count || 3)));
  const format = norm(args.format && args.format !== true ? args.format : truth.format.format || "").trim() || null;
  if (format && !CAT.tags.formats.includes(format)) die(`unknown format "${format}". Use: ${CAT.tags.formats.join(", ")}`);
  const tones = (args.tone && args.tone !== true ? list(args.tone) : truth.tone).map(norm).filter((t) => CAT.tags.tones.includes(t));
  const tags = truth.tags.map(norm).filter((t) => CAT.tags.products.includes(t));
  const like = args.like ? findDevice(args.like) : null;
  if (args.like && !like) die(`unknown device for --like: "${args.like}"`);
  const recentIds = list(args.recent).map((r) => findDevice(r)?.id).filter(Boolean);
  const exclude = new Set(list(args.exclude).map((r) => findDevice(r)?.id).filter(Boolean));
  const src = loadSource(args, args.truth);
  const footage = !!args.footage || isFootageLed(src) || truth.assets.some((a) => /footage|video of|founder on camera/i.test(a));
  const ctx = { recent: new Set(recentIds), tags, format, tones, like, footage };
  const productFirst = isProductFirst(format, args, src);
  // a named feature (--feature, truth.feature) matters only on a legacy sheet with no Claim scope; with a scope, SHAPES_BY_TYPE decides
  const oneFeature = !!(args.feature && args.feature !== true) || !!(truth.feature && (typeof truth.feature !== "object" || truth.feature.name || Object.keys(truth.feature).length) );
  const scope = scopeOf(truth);
  let plan = shapesFor({ format, scope, productFirst, footage: isFootageLed(src), forced: SHAPE_IDS.includes(args.shape) ? args.shape : null, oneFeature });
  // the brief's format pick (formats.mjs resolve; --format-id, else the run's decisions.json format): its ranked story shapes, reported for the writers (W11 hook)
  // the scope: --scope, else the user's own answer in the brief (decisions.json format.scope), else the truth sheet's
  const briefScope = (() => { try { const d = readJSON(path.resolve(args.run && args.run !== true ? String(args.run) : path.join(path.dirname(String(args.truth)), ".."), "decisions.json")); const sc = d && d.format && typeof d.format === "object" ? norm(d.format.scope).trim() : ""; return SCOPES.includes(sc) ? sc : null; } catch { return null; } })();
  const formatShapes = formatShapesForRun({ formatId: args["format-id"] && args["format-id"] !== true ? args["format-id"] : null, scope: args.scope && args.scope !== true ? String(args.scope) : briefScope || scope, run: args.run && args.run !== true ? args.run : null, truthPath: args.truth });
  // the format pick ranks the shapes (library/formats.json via lib/formats.mjs): Sure, Bold and Wild take the first three it allows,
  // minus its forbidden shapes and any shape the claim's scope rules out (a universal claim: breadth shapes only)
  if (formatShapes && Array.isArray(formatShapes.shapes) && formatShapes.shapes.length && !SHAPE_IDS.includes(args.shape) && !isFootageLed(src)) {
    const fsc = formatShapes.scope || scope;
    const legal = (x) => STORY_SHAPES[x] && !(formatShapes.forbidden || []).includes(x) && (fsc !== "universal" || STORY_SHAPES[x].breadth) && (!fsc || fsc === "single-task" || x !== "scenario");
    const ranked = formatShapes.shapes.filter(legal);
    if (ranked.length) plan = { shapes: [0, 1, 2].map((k) => ranked[Math.min(k, ranked.length - 1)]), why: `format "${formatShapes.format}" (${formatShapes.title || ""}), ${scope || "no"} claim scope: its ranked story shapes` };
  }
  const shape = plan.shapes ? plan.shapes[0] : null;
  // a universal claim never gets a one-person device (a user protagonist: one person's query log, day, journey)
  const personaBan = (d) => productFirst && scope === "universal" && d.axes.protagonist === "user";
  const scored = DEVICES.filter((d) => !exclude.has(d.id) && !(productFirst && pfBanned(d)) && !personaBan(d)).map((d) => ({ d, ...weigh(d, ctx) }));

  // THE MENU (no seeded draw): every device that is eligible, ranked by plain fit (weigh), with rotation as a FILTER: a device used in
  // the recent films (--recent) is removed, never down-weighted into a lottery. The writer of each script chooses ONE device from the menu
  // and says why (pitch.device_reason); check holds the three to the distance rules. Same inputs, same menu, every time.
  // a universal or category claim fuses only with the product's own surfaces (its input, cursor, dot, stream, mark), never one demo's artifact
  const SURFACE_RE = /\b(composer|caret|cursor|dot|bubble|stream\w*|prompt|input|search (bar|box)|text box|field|window|menu|mark|logo|wordmark|button|placeholder|hint|toolbar|sidebar|tab|chat|thread|reply|send|answer|canvas|keyboard|shortcut)\b/i;
  const unbuildable = (d) => d.build.score <= 2 && !footage;
  const eligible = scored.filter((s) => !ctx.recent.has(s.d.id) && !unbuildable(s.d));
  const byFit = (a, b) => b.w - a.w || a.d.id.localeCompare(b.d.id);
  const menuList = [];
  for (const fam of Object.keys(CAT.families)) menuList.push(...eligible.filter((s) => s.d.family === fam).sort(byFit).slice(0, 3));
  menuList.sort(byFit);
  if (menuList.length < 6) die("fewer than 6 devices are eligible with these exclusions and this rotation; drop some --exclude / --recent ids");
  const native = ((brd) => [...truth.forms.map((x) => ({ kind: "format", item: x })), ...truth.objects.map((x) => ({ kind: "object", item: x }))].filter((n) => !brd || SURFACE_RE.test(n.item)))(productFirst && (scope === "universal" || scope === "category"));
  const menu = menuList.map((x) => { const d = x.d; return { id: d.id, code: d.code, name: d.name, family: `${CAT.families[d.family].code} ${CAT.families[d.family].name}`, what: d.what, axes: d.axes, beats: d.beats, pitfalls: d.pitfalls, example: d.example, build: d.build, needs: d.needs, overused: d.overused || undefined, fit: x.w, fit_why: x.why }; });
  const rotatedOut = scored.filter((s) => ctx.recent.has(s.d.id)).map((s) => s.d.id);
  const picks = PICK_LABELS.slice(0, count).map((label) => ({ label, ladder: (productFirst ? LABEL_MEANING_PF : LABEL_MEANING)[label], device: null, choose: "one device from `menu` (id) + a one-line device_reason; it must differ from the other two on family and visual_world" }));
  // the shapes come from SHAPES_BY_TYPE (type x claim scope), never from a coin flip
  const pickShape = (pk) => (plan.shapes ? plan.shapes[Math.max(0, PICK_LABELS.indexOf(pk.label))] : null);
  const mixed = !!plan.shapes && new Set(plan.shapes.slice(0, count)).size > 1;
  const LADDER_VARIANT = scope === "universal" && productFirst ? {
    Sure: "Sure: the product's own verb, straight; the most universal uses first (the Use moments' top rows), an even pace, one clear escalation from simple to done-for-you.",
    Bold: "Bold: shorter rungs, four rungs plus a burst of more asks (\"<verb> anything\"), a list-break rung (the plain answer when plain is best), the uses reordered for surprise; the same range, a different emphasis.",
    Wild: "Wild: the reach is in the camera and the joins, never in a narrower story: an unexpected but true refrain, or one continuous take in which the product's input never leaves the frame and the uses stack and clear around it. No persona, no recurring situation.",
  } : {
    Sure: "Sure: the product's own verb, straight; the obvious uses in the obvious order, an even pace, one clear escalation.",
    Bold: "Bold: a faster cut ladder (shorter rungs), a twist rung the viewer does not expect, the uses reordered for surprise.",
    Wild: "Wild: an unexpected but true refrain (a verb the product really does, said a new way); still real uses, still one ladder.",
  };
  const PAS_VARIANT = {
    Sure: "Sure: the viewer's plainest daily pain, named in their words; the reveal after 25%; three benefits, one UI behaviour each; one number as proof.",
    Bold: "Bold: the pain lands as a picture and a reaction line (\"Woah\"); a hard cut to the reveal; benefits as fast one-line behaviours; proof as a count.",
    Wild: "Wild: the pain is exaggerated into a picture the viewer recognises at once; the reveal is the relief; still true uses, still the real UI.",
  };
  if (productFirst && (scope === "universal" || scope === "category")) {
    PAS_VARIANT.Bold = "Bold: the category's pain every viewer has had (\"you asked, you got a wall of text\"), said as a picture and a reaction line; the reveal after 20%; 3+ benefits from different areas of life, each one real UI behaviour; proof as a count. Never one person's evening.";
    PAS_VARIANT.Wild = "Wild: the category's pain said bigger (a montage of the same letdown across 3+ areas of life), never one situation exaggerated; the reveal is the relief; benefits from different areas of life.";
  }
  // each pick leads with a different subset of the truth sheet's use moments, so the user chooses an emphasis, never a niche
  const doms = [...new Set((truth.use_domains || []).map((u) => u.domain))];
  const leadOf = (i) => (doms.length ? [...doms.slice(i % doms.length), ...doms.slice(0, i % doms.length)] : []);
  const broadClaim = productFirst && (scope === "universal" || scope === "category");
  picks.forEach((pk, i) => { if (broadClaim && doms.length) pk.lead_domains = leadOf(i).slice(0, 4); });
  const pickLen = Number(args.length) || Number(String(truth.format.length || "").replace(/[^\d.]/g, "")) || 0;
  for (const pk of picks) {
    pk.engine = ENGINE_OF_SHAPE[pickShape(pk)] || undefined; if (pk.engine) pk.engine_rule = ENGINES[pk.engine];
    const sh = pickShape(pk);
    if (sh === "ladder") { pk.structure = "ladder"; pk.shape = "ladder"; pk.ladder_variant = LADDER_VARIANT[pk.label]; pk.device_role = "the device is the ladder's rhythm (list that breaks, escalation, call and response, countdown), never a plot"; }
    else if (sh && sh !== "scenario" && sh !== "pas" && STORY_SHAPES[sh]) { pk.structure = sh; pk.shape = sh; pk.shape_rule = shapeRule(sh, pickLen); pk.device_role = `the device is the ${STORY_SHAPES[sh].name} shape's rhythm, never a plot${broadClaim ? "; the claim's range is the subject, no persona, no recurring situation" : ""}`; }
    if (sh === "pas") { pk.structure = "pas"; pk.shape = "pas"; pk.pas_variant = PAS_VARIANT[pk.label]; pk.device_role = broadClaim ? "the device is the story's rhythm (the pain, the reveal, the benefits as a run); the pain is the category's, one every viewer has had, and the range of real uses is the subject; never one person's evening" : "the device is the story's rhythm (the pain, the reveal, the benefits as a run); the viewer's day is the subject, never the product's features"; }
  }
  const shapesUsed = [...new Set(picks.map((x) => x.shape).filter(Boolean))];
  const LADDER_RULE = "Ladder: one refrain verb is the spine; each rung is a title card (one highlighted word) plus a real UI demo of a DIFFERENT everyday use, escalating from simple to done-for-you; creativity lives in the joins between rungs, never in a plot. Rungs: <= 35 s 3-4, 36-60 s 4-6, > 60 s 6-8. Sure, Bold and Wild differ in which uses, their order, pacing and the refrain's wording, all on the same ladder. Pitch fields: shape, refrain {verb, pattern}, beats with role open | rung | ways_in | close; rungs carry use, highlight, level, on_screen, picture, ui[], duration_s. See references/story.md.";
  const PAS_RULE = "Pas (viewer first): the film is about the VIEWER's day. Beats: hook (the viewer's pain as a picture), agitate (optional: the pain lands, a reaction line like \"Woah\" is welcome), meet (the brand reveal, not before 20% of the film), benefit x2-4 (each: what the viewer gains in one line, one real UI behaviour), proof (a real number, adoption, rating or named customers from research/claims.json), cta ({ line, action, where }). Second person, short lines, one line per 1.5-2.5 s. Pitch fields: shape pas, beats with role, benefit (<= 12 words, viewer language), proof { line, claim }, cta { line, action, where }. See references/script.md and references/story.md." + (broadClaim ? " For a universal or category claim the pain is the category's (one every viewer has had: \"you asked, you got a wall of text\"), never one situation; the benefits are different uses from different areas of life (each with domain and reach), no two share a scenario noun." : "");
  const ruleOf = (sh, used) => (used.includes("pas") ? PAS_RULE + (used.includes("ladder") ? " The picks marked shape ladder follow: " + LADDER_RULE : "") : sh === "ladder" ? LADDER_RULE : undefined);
  out({
    ok: true,
    product: truth.product.name || null,
    format, tones, tags,
    product_first: productFirst || undefined,
    source_spine: src ? src.spine : undefined,
    footage_led: isFootageLed(src) && !args["product-first"] ? "A footage film: the story is cut from the footage, not written from a product's UI. Product-first gates (G7, G9, G10, G11, G12) do not apply; the footage-first gate GF does (the hook is the strongest real moment, plays at once, no card before the first real footage). The writers are the footage writers (paper edits): references/sources.md." : undefined,
    product_first_rule: productFirst ? "Launch / promo / product film: the product UI is on screen within 3 s, one hero product moment, 2-4 real uses, short plain kinetic lines, the end line the largest type, a clean CTA. No conceit devices; Sure, Bold and Wild differ in structure, pacing and energy, never by leaving the product. See references/product-first.md." : undefined,
    shape: mixed && shapesUsed.length > 1 ? "mixed" : shapesUsed.length === 1 ? shapesUsed[0] : shape || undefined,
    shapes: mixed ? shapesUsed : undefined,
    shape_rule: [ruleOf(shape, shapesUsed), ...shapesUsed.filter((x) => !["ladder", "pas", "scenario"].includes(x)).map((x) => shapeRule(x, pickLen))].filter(Boolean).join(" ") || (shape === "scenario" ? "Scenario: one feature, one viewer, one task (G10 scenario rules)." : undefined),
    truth_gaps: gaps.length ? gaps : undefined,
    claim_scope: scope || undefined,
    scope_conflict: briefScope && scope && briefScope !== scope ? `the brief says the claim is ${briefScope}, the truth sheet says ${scope}: the shapes follow the brief; G13 checks the truth sheet's, so update the sheet's Claim scope (or ask the user)` : undefined,
    shapes_by: plan.shapes ? plan.why : undefined,
    format_shapes: formatShapes || undefined,
    scope_rule: productFirst && scope ? SCOPE_RULE[scope] : undefined,
    menu,
    rotated_out: rotatedOut.length ? rotatedOut : undefined,
    fuse_pool: native.map((n) => `${n.item} (${n.kind})`),
    engines: ENGINES,
    turn_rule: TURN_RULE,
    picks,
    distance: { axes: AXES, rule: productFirst ? "every pair differs on >= 4 of 7 axes, and on family and visual_world (a product film's protagonist is the product's range, so protagonist may repeat)" : "every pair differs on >= 5 of 7 axes, and on family, protagonist and visual_world" },
    avoid: {
      cliche_arc: CL.arc,
      stock_openers: "Meet X / Introducing X / What if...? / Tired of...? / Imagine... / The future of ___ is here / Say goodbye to...",
      visual_cliches: CL.visuals.map((v) => v.name),
    },
    next: "CHOOSE a device per pick from the menu (a reason each, pitch.device_reason: no seeded draw decided), then write one pitch per pick with its engine's turn (references/story.md: title, <= 12-word logline, timed beats with the peak at 60-75% and the turn where its engine puts it: reversal 15-45%, refrain-break = the break at 60-75%, before-after before the peak, three sketch frames) fusing the device with its fuse_with material, then: node story.mjs check --pitch <pitches.json> --truth <truth>",
  });
} else if (cmd === "check") {
  if (!args.pitch || args.pitch === true) die("--pitch <pitch.json> required");
  const pf = path.resolve(String(args.pitch));
  if (!fs.existsSync(pf)) die(`pitch not found: ${pf}`);
  let raw;
  try { raw = readJSON(pf); } catch (e) { die(`pitch is not valid JSON: ${e.message}`); }
  const pitches = Array.isArray(raw) ? raw : Array.isArray(raw.pitches) ? raw.pitches : [raw];
  // THE LEDGER: a check on ONE pitch file counts a run in story/check-ledger.json beside it; 3 runs (the first and two rewrites), +2 after the editor's rewrite / replace; a set never records
  const single = !Array.isArray(raw) && !Array.isArray(raw.pitches) && !!raw.label;
  const v2One = single && raw.story_format === "v2"; // Plan 03: a v2 treatment gets one focused revision (two runs), +1 after the editor's rewrite
  if (single && !args["no-ledger"]) {
    const lf = path.join(path.dirname(pf), "check-ledger.json"), lab = String(raw.label);
    let led = {}; try { led = readJSON(lf) || {}; } catch {}
    let notes = null; try { notes = readJSON(path.join(path.dirname(pf), "edit-notes.json")); } catch {}
    const marked = !!(notes && Array.isArray(notes.pitches) && notes.pitches.some((x) => x && x.label === lab && ["rewrite", "replace"].includes(x.verdict)));
    const limit = v2One ? 2 + (marked ? 1 : 0) : 3 + (marked ? 2 : 0), runs = Number(led[lab] && led[lab].runs) || 0;
    if (runs >= limit) { out({ ok: false, verdict: "escalate", reason: "rewrite limit: hand back to the Director", label: lab, runs, limit }); process.exit(3); }
    led[lab] = { runs: runs + 1, last: new Date().toISOString() };
    try { writeFile(lf, JSON.stringify(led, null, 2) + "\n"); } catch {}
  }
  const plan = loadPlan(args, pf);
  const truth = loadTruth(args.truth);
  const src = loadSource(args, args.truth);
  const footageLed = isFootageLed(src) && !args["product-first"];
  const footage = !!args.footage || isFootageLed(src) || !!(truth && truth.assets.some((a) => /footage|video of|founder on camera/i.test(a)));
  const opts = { length: Number(args.length) || 0, narrated: !!args.narrated, calm: !!args.calm, brandTempo: loadBrandTempo(args["brand-film"]), footageLed, productFirst: isProductFirst(truth?.format?.format ? norm(truth.format.format).trim() : (args.format && args.format !== true ? norm(args.format) : null), args, src), showStrict: !footageLed && ["launch", "promo", "brand"].includes(truth?.format?.format ? norm(truth.format.format).trim() : (args.format && args.format !== true ? norm(args.format) : null)) };
  if (footageLed) opts.selects = loadSelects(args, args.truth);
  const fmt = truth?.format?.format ? norm(truth.format.format).trim() : (args.format && args.format !== true ? norm(args.format) : null);
  opts.viewerFirst = !footageLed && productFirstApplies(src) !== false && ["launch", "promo"].includes(fmt);
  opts.claims = loadClaims(args.claims, args.truth);
  opts.plan = plan; opts.truth = truth;
  const intentFor = (p) => {
    if (p.story_format === "v2") return { sheet: null, errors: [], warnings: [] }; // a v2 pitch carries its own treatment; no intent sheet is required
    const dir = path.dirname(pf), lab = p.label || null;
    const cands = [args.intent && args.intent !== true ? path.resolve(String(args.intent)) : null, lab ? path.join(dir, `intent-${lab}.json`) : null, path.join(dir, "intent.json")].filter(Boolean);
    const f = cands.find((x) => fs.existsSync(x));
    if (!f) return { sheet: null, errors: [], warnings: [] };
    try { const data = loadIntent(f); const v = validateIntent(data, { lengthS: opts.length, durations: (p.beats || []).map((b) => Number(b.duration_s)) }); return { sheet: f, data, errors: v.errors, warnings: v.warnings }; } catch (e) { return { sheet: f, errors: [e.message], warnings: [] }; }
  };
  const intents = pitches.map(intentFor);
  const tctx = { ...(opts.claims ? { evidence: (Array.isArray(opts.claims) ? opts.claims : []).map((c) => ({ id: c.id, permitted_use: "claim" })) } : {}), duration_s: opts.length, kind: null };
  const results = pitches.map((p, i) => (p.story_format === "v2" ? checkV2(p, i, { ...tctx, ...treatmentCtx(args) }) : checkPitch(p, i, truth, footage, { ...opts, intent: intents[i] })));
  // the blind retell reads ONLY the beat list: story/beats-<label>.md = per beat on_screen, vo, visual (no aim, title, approach, intent, critique)
  pitches.forEach((p, i) => {
    if (!p.label || !Array.isArray(p.beats)) return;
    const md = [`# Beats: ${p.label}\n`, ...p.beats.map((b, k) => `${k + 1}. on screen: ${String(b.on_screen == null ? "" : b.on_screen).replace(/\n/g, " ")}\n   voice: ${String(b.vo == null ? "" : b.vo).replace(/\n/g, " ") || "(none)"}\n   picture: ${String(b.visual || b.picture || "").replace(/\n/g, " ")}`)].join("\n") + "\n";
    try { writeFile(path.join(path.dirname(pf), `beats-${p.label}.md`), md); } catch {}
    // the derived emphasis curve goes back into the sheet (never written by hand)
    const it = intents[i];
    if (it && it.sheet && it.data) { try { const v = validateIntent(it.data, { lengthS: opts.length, durations: p.beats.map((b) => Number(b.duration_s)) }); if (v.curve.length && JSON.stringify(it.data.emphasis_curve) !== JSON.stringify(v.curve)) writeFile(it.sheet, JSON.stringify({ ...it.data, emphasis_curve: v.curve }, null, 2) + "\n"); } catch {} }
  });
  const allV2 = pitches.every((p) => p.story_format === "v2");
  const portfolio = pitches.length > 1 ? (allV2 ? checkV2Portfolio(pitches) : checkPortfolio(pitches.filter((p) => p.story_format !== "v2"), results.filter((r, i) => pitches[i].story_format !== "v2"), opts)) : null;
  const ship = results.every((r) => r.verdict === "ship") && (!portfolio || portfolio.pass);
  const recommendation = pitches.length > 1 ? recommendPitch(results) : null;
  out(pitches.length === 1 && !portfolio ? results[0] : { ok: ship, verdict: ship ? "ship" : "rewrite", pitches: results, portfolio, recommendation });
  process.exitCode = results.some((r) => r.verdict === "invalid") ? 1 : ship ? 0 : 2; // exitCode, not exit(): a large report on a pipe must flush
} else if (cmd === "intent") {
  if (!args.intent || args.intent === true) die("--intent <story/intent.json> required");
  const f = path.resolve(String(args.intent));
  let it; try { it = loadIntent(f); } catch (e) { die(e.message); }
  if (!it) die(`intent not found: ${f}`);
  let durations = null;
  if (args.pitch && args.pitch !== true) { try { const pj = readJSON(path.resolve(String(args.pitch))); durations = (Array.isArray(pj.beats) ? pj.beats : []).map((b) => Number(b.duration_s)); } catch (e) { die(`--pitch is not readable JSON: ${e.message}`); } }
  const r = validateIntent(it, { lengthS: Number(args.length) || Number(it.length_s) || 0, durations });
  if (args.write && r.curve.length) writeFile(f, JSON.stringify({ ...it, emphasis_curve: r.curve }, null, 2) + "\n"); // the derived emphasis curve (never written by hand)
  out({ ...r, intent: f, proposition: it.proposition || null, wrote_emphasis_curve: args.write ? true : undefined });
  process.exitCode = r.ok ? 0 : 2;
} else if (cmd === "plan") {
  for (const k of ["plan", "picks", "truth"]) if (!args[k] || args[k] === true) die("usage: story.mjs plan --plan <story/plan.json> --picks <story/picks.json> --truth <truth.md> [--claims <claims.json>]");
  const rj = (k) => { const f = path.resolve(String(args[k])); if (!fs.existsSync(f)) die(`--${k} not found: ${f}`); try { return readJSON(f); } catch (e) { die(`--${k} is not valid JSON: ${e.message}`); } };
  const r = planProblems(rj("plan"), rj("picks"), loadTruth(args.truth), loadClaims(args.claims, args.truth));
  if (!loadClaims(args.claims, args.truth)) r.warnings.push("no research/claims.json found (--claims): owned claim ids were not checked");
  out({ ok: !r.problems.length, problems: r.problems, warnings: r.warnings });
  process.exitCode = r.problems.length ? 2 : 0;
} else if (cmd === "sheet") {
  const len = Number(args.length);
  if (!(len > 0)) die("--length <seconds> required");
  const eng = args.engine && args.engine !== true ? String(args.engine) : null;
  if (eng && !ENGINES[eng]) die(`--engine: ${Object.keys(ENGINES).join(" | ")}`);
  out({ ok: true, ...sheetFor(len, eng) });
} else if (cmd === "revise") {
  if (!args.notes || args.notes === true) die("--notes <story/edit-notes.json> required");
  let n; try { n = readJSON(path.resolve(String(args.notes))); } catch (e) { die(`--notes is not readable JSON: ${e.message}`); }
  const back = (n.pitches || []).filter((x) => x && ["rewrite", "replace"].includes(x.verdict));
  out({ revise: back.map((x) => x.label || x.id), notes: Object.fromEntries(back.map((x) => [x.label || x.id, x.notes || []])), verdicts: Object.fromEntries(back.map((x) => [x.label || x.id, x.verdict])), next: back.length ? "dispatch script-writer once per label (crew.mjs brief --role script-writer --key <label>: revise mode), then story.mjs check on the set; no second editor pass" : "nothing goes back" });
} else if (cmd === "grammar") {
  // Plan 03 S1: the starting narrative logic for a communication kind; no --kind lists them
  if (!args.kind || args.kind === true) out({ kinds: grammarKinds(), optional_tools: Object.keys(OPTIONAL_TOOLS), note: "grammars are starting logic, not formulas; optional tools are never required and never banned" });
  else { const g = grammarBrief(String(args.kind)); if (!g) die(`unknown communication kind "${args.kind}" (${grammarKinds().join(", ")})`); out(g); }
} else if (cmd === "refs") {
  if (!args.kind || args.kind === true) die("--kind <communication kind> required");
  out({ kind: String(args.kind), role: args.role && args.role !== true ? String(args.role) : null, references: retrieveReferences({ kind: String(args.kind), role: args.role && args.role !== true ? String(args.role) : null, limit: args.limit }) });
} else if (cmd === "review") {
  if (!args.review || args.review === true) die("--review <story/edit-notes.json> required");
  let rv; try { rv = readJSON(path.resolve(String(args.review))); } catch (e) { die(`review is not valid JSON: ${e.message}`); }
  const v = validateReview(rv);
  out(v); process.exitCode = v.ok ? 0 : 2;
} else if (cmd === "treatment" || cmd === "treatments") {
  // Plan 03 S2/S3/S4/S7: validate one treatment (or any saved pitch / intent through the legacy reader) or ONE writer's set of three
  const ctx = treatmentCtx(args);
  if (cmd === "treatment") {
    if (!args.treatment || args.treatment === true) die("--treatment <file> required");
    let raw; try { raw = readJSON(path.resolve(String(args.treatment))); } catch (e) { die(`not valid JSON: ${e.message}`); }
    const r = readTreatment(raw.treatment && typeof raw.treatment === "object" ? raw.treatment : raw);
    if (!r.ok) die(r.error);
    if (r.legacy) { out({ ok: true, legacy: true, source: r.source, note: "a saved film: read through the legacy reader, judged by its own rubric (story.mjs check / intent), not by v2 rules", treatment: r.treatment }); }
    else { const v = validateTreatment(r.treatment, ctx); out(v); process.exitCode = v.ok ? 0 : 2; }
  } else {
    if (!args.set || args.set === true) die("--set <story/treatments.json> required");
    const sf = path.resolve(String(args.set));
    let raw; try { raw = readJSON(sf); } catch (e) { die(`not valid JSON: ${e.message}`); }
    const list = (Array.isArray(raw) ? raw : Array.isArray(raw.treatments) ? raw.treatments : []).map((t) => normalizeTreatment({ communication_kind: raw.communication_kind, ...t }));
    if (!list.length) die("the set has no treatments[]");
    const v = validateTreatmentSet(list, { ...ctx, choices: args.choices && args.choices !== true ? Number(args.choices) : ctx.choices });
    // the tag falls back to the slot order only for the card's secondary label; the treatment_title is what a person chooses by
    if (args.split) {
      const dir = path.dirname(sf);
      list.forEach((t, i) => {
        const label = t.tag || TAGS_ORDER[i] || `T${i + 1}`;
        const full = { ...t, tag: t.tag || TAGS_ORDER[i] || null };
        writeFile(path.join(dir, `pitch-${label}.json`), JSON.stringify({ ...toLegacyPitch(full, { label }), ...(ctx.concept === true ? { concept_card: conceptCard(full) } : {}), treatment: full }, null, 2));
        writeFile(path.join(dir, `intent-${label}.json`), JSON.stringify(toIntent(full, {}), null, 2));
      });
      v.split = list.map((t, i) => `pitch-${t.tag || TAGS_ORDER[i] || `T${i + 1}`}.json`);
    }
    out(v); process.exitCode = v.ok ? 0 : 2;
  }
} else if (cmd === "validate") {
  const problems = [];
  const ids = new Set();
  const codes = new Set();
  for (const d of DEVICES) {
    if (ids.has(d.id)) problems.push(`duplicate id ${d.id}`);
    if (codes.has(d.code)) problems.push(`duplicate code ${d.code}`);
    ids.add(d.id); codes.add(d.code);
    for (const k of ["id", "code", "name", "family", "what", "example"]) if (!d[k]) problems.push(`${d.id}: missing ${k}`);
    if (!CAT.families[d.family]) problems.push(`${d.id}: unknown family ${d.family}`);
    if (d.code[0] !== CAT.families[d.family]?.code) problems.push(`${d.id}: code ${d.code} not in family ${d.family}`);
    for (const k of AXES) if (!CAT.axes[k].values.includes(d.axes?.[k])) problems.push(`${d.id}: axes.${k} "${d.axes?.[k]}" not in vocabulary`);
    if (d.axes.family !== d.family) problems.push(`${d.id}: axes.family != family`);
    for (const k of ["products", "tones", "formats"]) for (const t of d.fits?.[k] || []) if (!CAT.tags[k].includes(t)) problems.push(`${d.id}: fits.${k} "${t}" not in tags.${k}`);
    if (!(d.beats || []).length || d.beats.some((b) => !b.name || !b.purpose)) problems.push(`${d.id}: beats need name + purpose`);
    if (!(d.pitfalls || []).length) problems.push(`${d.id}: no pitfalls`);
    if (!(d.build?.score >= 1 && d.build.score <= 5)) problems.push(`${d.id}: build.score must be 1-5`);
    if (!(d.ambition >= 1 && d.ambition <= 5)) problems.push(`${d.id}: ambition must be 1-5`);
    if (typeof d.overused !== "boolean") problems.push(`${d.id}: overused must be boolean`);
  }
  for (const id of CL.overused_devices) if (!findDevice(id)?.overused) problems.push(`cliche.overused_devices: ${id} is not a device marked overused`);
  if (CL.beats.length !== 8) problems.push(`cliche.beats: ${CL.beats.length}, expected 8`);
  const byFam = Object.fromEntries(Object.keys(CAT.families).map((f) => [f, DEVICES.filter((d) => d.family === f).length]));
  out({ ok: !problems.length, devices: DEVICES.length, by_family: byFam, overused: DEVICES.filter((d) => d.overused).map((d) => d.id), problems });
  process.exit(problems.length ? 1 : 0);
} else {
  die("usage: story.mjs truth|devices|cliche|pick|check|plan|sheet|revise|intent|validate (see the header of scripts/story.mjs)");
}

// --- check -------------------------------------------------------------------------

// Plan 03: a v2 pitch (written by the format-aware writer, projected by `treatments --split`) is judged on meaning by lib/treatment.mjs; the legacy
// rubric (cliche arc, engine/turn, peak window, stock openers, G1-G15) does not apply to it. Provenance and factual checks are NOT weakened:
// unknown evidence, an unsupported demonstration, a missing qualifier and an uncovered must-show are errors there.
function checkV2(p, idx, ctx = {}) {
  const t = p.treatment && typeof p.treatment === "object" ? p.treatment : p;
  const v = validateTreatment(t, { ...ctx, kind: ctx.kind || t.communication_kind });
  const gates = [{ id: "V2", gate: "Format-aware treatment (mechanical and factual errors, then creative concerns)", pass: v.ok, reasons: [...v.errors, ...v.concerns.filter((c) => c.severity === "major")].map((x) => `${x.issue_id}${x.beat ? ` @${x.beat}` : ""}: ${x.evidence} -> ${x.fix}`) }];
  return { pitch: p.id || p.title || `pitch ${idx + 1}`, label: p.label || null, ok: v.ok, verdict: v.verdict, reasons: gates[0].reasons, gates, issues: v.issues, ledger: v.ledger, total_s: v.total_s,
    warnings: v.concerns.filter((c) => c.severity === "minor").map((c) => `${c.issue_id}${c.beat ? ` @${c.beat}` : ""}: ${c.evidence} -> ${c.fix}`), craft: v.craft.map((c) => `${c.issue_id}: ${c.evidence}`), story_format: "v2" };
}
function checkV2Portfolio(pitches) {
  const list = pitches.map((p) => (p.treatment && typeof p.treatment === "object" ? p.treatment : p));
  const cmp = compareCandidates(list), reasons = [];
  for (const [a, b] of cmp.insufficient) reasons.push(`too-alike: ${a} and ${b} differ on fewer than two of proof selection, information order, perspective and premise (a different decorative device does not count)`);
  const lineSet = (t) => new Set(normalizeTreatment(t).beats.flatMap((b) => [b.on_screen, b.voiceover || ""]).map(nz8).filter((l) => l.split(" ").filter(Boolean).length >= 2));
  const ls = list.map(lineSet);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) for (const l of [...ls[i]].filter((x) => ls[j].has(x))) reasons.push(`shared-line: "${l}" is in two treatments: every treatment says its own lines`);
  const titles = list.map((t) => nz8(t.treatment_title || t.title));
  if (new Set(titles).size !== titles.length) reasons.push("shared-title: two treatments have the same title");
  return { pass: !reasons.length, reasons, comparison: cmp };
}
function checkPitch(p, idx, truth, footage, opts = {}) {
  const name = p.id || p.title || `pitch ${idx + 1}`;
  const errors = [];
  const warnings = [];
  const gates = [];
  const gate = (id, title, reasons, extra = {}) => gates.push({ id, gate: title, pass: !reasons.length, reasons, ...extra });
  let ladderCardsOnly = false;

  // shape
  const deviceIds = (Array.isArray(p.device) ? p.device : [p.device]).filter(Boolean);
  const devices = deviceIds.map((d) => findDevice(d));
  // the fake-ui-takeover device names itself in its visuals: its own words are not an invented output screen (G10 bans the rest)
  const noDev = (t) => (deviceIds.includes("fake-ui-takeover") ? t.replace(/fake[- ]ui([- ]takeover)?|ui takeover/gi, " ") : t);
  if (!deviceIds.length) errors.push("device: missing (a device id from taxonomy/devices.json)");
  devices.forEach((d, i) => { if (!d) errors.push(`device: unknown "${deviceIds[i]}"`); });
  const dev = devices[0] || null;
  if (!p.title) errors.push("title: missing");
  const logWords = String(p.logline || "").trim().split(/\s+/).filter(Boolean).length;
  if (!p.logline) errors.push("logline: missing");
  else if (logWords > 12) errors.push(`logline: ${logWords} words (12 at most)`);
  if (p.title && String(p.title).trim().split(/\s+/).length > 5) warnings.push("title: keep it to 2-4 words");
  if (p.label && !["Sure", "Bold", "Wild"].includes(p.label)) warnings.push(`label "${p.label}": use Sure, Bold or Wild`);
  if (deviceIds.length && !String(p.device_reason || "").trim() && !(opts.intent && opts.intent.data && opts.intent.data.device && String(opts.intent.data.device.why || "").trim())) warnings.push("device_reason missing: pick offers a menu and the writer CHOOSES, so say in one line why this device fits this product's story");
  const beats = Array.isArray(p.beats) ? p.beats : [];
  if (beats.length < 3) errors.push(`beats: ${beats.length} (need 3-8, each {name, on_screen, visual, duration_s})`);
  if (beats.length > 9) warnings.push(`beats: ${beats.length}; more than 8 usually means a list, not a story`);
  beats.forEach((b, i) => {
    if (!b.name) errors.push(`beats[${i}]: name missing`);
    if (!(Number(b.duration_s) > 0)) errors.push(`beats[${i}] "${b.name || ""}": duration_s must be > 0`);
    if (b.visual == null) warnings.push(`beats[${i}] "${b.name || ""}": visual missing`);
  });
  const scores = p.scores || {};
  const DIMS = ["originality", "clarity", "fit", "memorability", "feasibility"];
  for (const k of DIMS) if (!(Number(scores[k]) >= 1 && Number(scores[k]) <= 5)) errors.push(`scores.${k}: a number 1-5 required (self-assessed)`);
  if (errors.length) return { pitch: name, ok: false, verdict: "invalid", errors, hint: "Pitch format: references/story.md (Pitch JSON)" };

  // timing and the turn
  let t = 0;
  const starts = beats.map((b) => { const s = t; t += Number(b.duration_s); return s; });
  const lengthS = t;
  const turnIdx = beats.findIndex((b) => b.turn === true);
  const turnAt = turnIdx >= 0 ? starts[turnIdx] / lengthS : null;
  if (turnIdx < 0) warnings.push("no beat marked \"turn\": true (-1 memorability): name the turn and place it at 60-75%");
  else if ((turnAt < 0.5 || turnAt > 0.85) && !["reversal", "before-after"].includes(String(p.engine || ENGINE_OF_SHAPE[shapeOf(p, beats)] || ""))) warnings.push(`the turn lands at ${Math.round(turnAt * 100)}% of the film; aim for 60-75%`);
  const targetLen = truth && Number(String(truth.format.length || "").replace(/[^\d.]/g, ""));
  if (targetLen && Math.abs(lengthS - targetLen) / targetLen > 0.25) warnings.push(`beats total ${lengthS} s; the brief says ${targetLen} s`);

  // G1: distance from the cliche arc
  const map = clicheMap(beats);
  const nums = map.filter((m) => m.n).map((m) => m.n);
  const order = inOrder(nums);
  const g1 = [];
  if (order >= 4) g1.push(`${order} default beats appear in the default order (${map.filter((m) => m.n).map((m) => m.default_beat).join(" -> ")}); 3 at most`);
  const featureRun = (() => { let run = 0, best = 0; for (const m of map) { run = /^feature/.test(m.default_beat) ? run + 1 : 0; best = Math.max(best, run); } return best; })();
  if (featureRun >= 3) g1.push(`${featureRun} feature beats in a row: features must live inside the device, not in a list`);
  const opener = [p.logline, beats[0]?.on_screen, p.title].filter(Boolean).map((s) => norm(s).trim());
  const stock = CL.stock_openers.find((re) => opener.some((o) => new RegExp(re, "i").test(o)));
  // Plan 03: "Meet X" / "Introducing X" are allowed when they serve the assignment; a stock opener is a note about specificity, not a gate
  if (stock) warnings.push(`stock opener (craft note): matches /${stock}/; fine when the viewer needs the name first, but the opening should also say something specific`);
  const vis = visualCliches([...beats.map((b) => `${b.visual || ""} ${b.on_screen || ""}`), ...(p.visual_motifs || []), p.signature_image || ""]);
  if (vis.length >= 2) g1.push(`${vis.length} visual cliches: ${vis.join(", ")}`);
  if (/\blogo\b/i.test(`${beats[0]?.visual || ""} ${beats[0]?.name || ""}`) && !/no logo/i.test(beats[0]?.visual || "")) g1.push("opens on the logo: the first 1.5-2 s must be the most striking image or line");
  gate("G1", "Distance from the cliche arc", g1, { beat_map: map, default_beats_in_order: order });

  // G2: swap test
  const g2 = [];
  const sw = p.swap_test || {};
  const product = truth?.product?.name || p.product || "<product>";
  const competitor = sw.competitor || truth?.competitors?.[0] || "<a competitor>";
  const verdict = norm(sw.result || (typeof p.swap_test === "string" ? p.swap_test : ""));
  if (!verdict) g2.push(`swap_test.result missing: answer the prompt below with "breaks" or "survives"`);
  else if (/surviv|still works|works/.test(verdict) && !/break/.test(verdict)) g2.push(`the concept survives swapping ${product} for ${competitor}: it isn't built from this product's material`);
  if (verdict && !/surviv/.test(verdict) && !sw.why && typeof p.swap_test !== "string") g2.push("swap_test.why missing: name the image or line that breaks");
  let own = null;
  if (truth) {
    const nat = [...truth.objects, ...truth.forms, ...truth.words];
    own = beats.map((b, i) => ({ beat: i + 1, uses: nat.filter((n) => mentions(`${b.on_screen || ""} ${b.visual || ""} ${b.name || ""}`, n)).map(itemKey) })).filter((x) => x.uses.length);
    if (!own.length) g2.push("no beat uses anything from the truth sheet's native objects, formats or words: the swap test will survive");
    else if (own.length < Math.ceil(beats.length / 3)) warnings.push(`only ${own.length} of ${beats.length} beats use the product's own material`);
  }
  gate("G2", "Swap test (only this product could make this film)", g2, {
    prompt: `Replace "${product}" with "${competitor}" in: "${p.logline}" and in every beat. Does the film still work? If it does, it fails. Name the image or line that breaks.`,
    own_material: own || undefined,
  });

  // G3: clear by second 4
  const g3 = [];
  const c4 = typeof p.clear_by_s4 === "object" && p.clear_by_s4 ? p.clear_by_s4 : { names_device: p.clear_by_s4, first_4s: p.first_4s };
  if (!String(c4.first_4s || "").trim()) g3.push("first_4s missing: describe in one line what seconds 0-4 show");
  if (c4.names_device !== true) g3.push("clear_by_s4 is not true: the first 4 s must make the device obvious (\"oh, it's a weather report\")");
  const early = beats.filter((b, i) => starts[i] < 4);
  if (early.some((b) => /\blogo\b|\btitle card\b|studio logos/i.test(`${b.visual || ""}`)) && !["movie-trailer", "cover-version"].includes(dev.id)) g3.push("seconds 0-4 spend time on a logo or title card");
  if (dev && c4.first_4s && !early.length) g3.push("no beat starts in the first 4 s");
  gate("G3", "Clarity by second 4", g3, { first_4s: c4.first_4s || null });

  // G4: honest demo and grounding
  const g4 = [];
  if (p.honest_demo === false) g4.push("honest_demo is false: never show a capability the product lacks");
  else if (p.honest_demo !== true) warnings.push("honest_demo not stated: set true once every capability shown is real");
  const claims = (p.grounded_claims || []).map((c) => (typeof c === "string" ? { claim: c } : c));
  claims.forEach((c, i) => { if (!c.source) g4.push(`grounded_claims[${i}] "${c.claim}": no source (site, docs, screenshot, the user)`); });
  const groundText = norm([...claims.map((c) => c.claim), ...(truth ? [...truth.proof, ...truth.facts, ...truth.words, ...truth.objects] : [])].join(" ")).replace(/,/g, "");
  const props = (p.props || []).map((x) => norm(x).replace(/,/g, ""));
  const propHits = [];
  const numRe = /(?<![\w.])\$?\d[\d,]*(?:\.\d+)?\s?(?:%|x\b|k\b|m\b|ms\b|s\b|sec|seconds?|min|minutes?|hours?|hrs?|days?)?/gi;
  const ungrounded = [];
  for (const b of beats) for (const m of String(b.on_screen || "").replace(/\b\d{1,2}:\d{2}(\s?[ap]\.?m\.?)?/gi, " ").match(numRe) || []) {
    const n = m.replace(/,/g, "").match(/\d+(?:\.\d+)?/)[0];
    const um = m.trim().match(/\d\s?(%|x|k|m|ms|s|sec|seconds?|min|minutes?|hours?|hrs?|days?)$/i);
    const unit = um ? um[1].toLowerCase() : "";
    if (/^(19|20)\d\d$/.test(n) || (/^0?\d$/.test(n) && !unit && !/^\$/.test(m.trim()))) continue; // years, times of day and bare single digits (step numbers) pass
    // whole numbers only ("2" is not in "#4127"); with a unit, the unit must match too ("2 days" is not "2 am")
    const stem = unit.length > 2 ? `\\s?${unit.slice(0, 3)}` : unit ? `\\s?${unit.replace("%", "(%|\\s?percent)")}` : "";
    const numIn = (text) => new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])${stem}`).test(text);
    if (numIn(groundText)) continue;
    if (props.some(numIn)) { propHits.push(m.trim()); continue; }
    ungrounded.push(`"${m.trim()}" in "${b.name}"`);
  }
  // number-unit: a grounded number's noun must be the claim's own ("50 phones" against "up to 50 people"), or one of the product's native words; props are exempt
  if (opts.claims && opts.claims.length) {
    const NU_STOP = new Set("the and for with from per are was has had not you your our out all any one two new off its his her who what when how why can will this that than then too very just also more most some into onto over under only each every same ago later left right".split(" "));
    const UNIT_RE = /^(s|ms|sec|secs|seconds?|min|mins|minutes?|hours?|hrs?|days?|weeks?|months?|years?|am|pm|percent|k|m|x)$/i;
    const sing = (w) => (/ies$/.test(w) ? w.replace(/ies$/, "y") : /[^s]s$/.test(w) ? w.slice(0, -1) : w);
    const nativeWords = new Set((truth ? truth.words : []).map((w) => sing(nz8(w))));
    const seen = new Set();
    for (const b of beats) for (const line of [String(b.on_screen || ""), ...linesOf(b)]) for (const m of line.replace(/,/g, "").matchAll(/(?<![\w.])(\d+(?:\.\d+)?)\s+([a-z][a-z'-]{2,})/gi)) {
      const n = m[1], noun = m[2].toLowerCase();
      if (NU_STOP.has(noun) || UNIT_RE.test(noun) || seen.has(m[0].toLowerCase())) continue;
      seen.add(m[0].toLowerCase());
      const numIn = (text) => new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])`).test(text);
      if (props.some(numIn)) continue;
      const cl = opts.claims.find((c) => numIn(`${c.text} ${c.value == null ? "" : c.value}`));
      if (!cl) continue;
      const ns = sing(noun);
      if (nz8(cl.text).split(" ").map(sing).includes(ns) || nativeWords.has(ns)) continue;
      const said = String(cl.text).match(new RegExp(`${n.replace(".", "\\.")}\\s+[a-z][a-z'-]*`, "i"));
      g4.push(`number-unit: "${m[0]}" but ${cl.id} says "${said ? said[0] : cl.text}"`);
    }
  }
  // continuity implies a claim: a carrier that runs unbroken across different places (a oner, one row of phones, one playhead) tells the viewer those places are one thing
  {
    const doms = new Set(beats.map((b) => norm(b.domain).trim()).filter(Boolean));
    const actorTxt = p.actor && typeof p.actor === "object" ? `${p.actor.what || ""} ${p.actor.does || ""}` : "";
    const carries = /without a cut|no cut|unbroken|one (unbroken )?(move|take|shot)|one (row|line|scrubber|playhead)[^.;]{0,20}(runs?|carries|moves|passes)|phone to phone|trucks?\b|carries? (the|from|across|on)|runs? (along|across|through|on)/i.test(actorTxt) && doms.size >= 2;
    if (deviceIds.includes("oner") || carries) {
      const c = p.continuity && typeof p.continuity === "object" ? p.continuity : null;
      const across = c ? norm(c.across).trim() : "";
      const cid = c ? String(c.claim || "").trim() : "";
      const why = deviceIds.includes("oner") ? "a oner" : "an actor that carries across different areas of life";
      if (!["places", "time", "one"].includes(across)) g4.push(`continuity-claim: ${why} runs unbroken, so the pitch must set continuity { across: "places" | "time" | "one", claim: "<claim id that makes it true>" }`);
      else if (across === "places" && !cid) g4.push("continuity-claim: continuity.across is places, so it needs a claim id that makes those places one thing (e.g. the sync claim); without one, cut the carrier between places");
      else if (across === "places" && opts.claims && opts.claims.length && !opts.claims.some((x) => x.id.toLowerCase() === cid.toLowerCase())) g4.push(`continuity-claim: continuity.claim "${cid}" is not a claim id in the claims (${opts.claims.map((x) => x.id).join(", ")})`);
    }
  }
  if (propHits.length) warnings.push(`numbers shown as story props, not claims: ${propHits.join(", ")}; make sure none reads as a product claim`);
  if (ungrounded.length) g4.push(`numbers on screen not in grounded_claims or the truth sheet (a claim needs a source; a story detail goes in "props"): ${ungrounded.join("; ")}`);
  const labels = p.ui_labels || [];
  if (labels.length && truth) {
    const words = truth.words.map((w) => norm(w));
    const bad = labels.filter((l) => !words.some((w) => w.includes(norm(l))));
    if (bad.length) g4.push(`UI labels not in the truth sheet's Native words (never invent them): ${bad.join(", ")}`);
  } else if (labels.length && !truth) warnings.push("ui_labels given without --truth: can't verify them");
  gate("G4", "Honest demo (grounded claims, numbers and UI labels)", g4);

  // G5: buildable
  const g5 = [];
  const bld = p.build || {};
  const needsFootage = bld.needs_live_action === true || dev.needs === "footage";
  if (needsFootage && !footage) g5.push(`${bld.needs_live_action ? "needs live action" : `${dev.name} needs footage`} and none is supplied: stylize it (type, illustration) or pick another device`);
  if (dev.needs && dev.needs !== "footage" && !(truth && truth.assets.some((a) => norm(a).includes(norm(dev.needs).split(" ").pop())))) warnings.push(`${dev.name} needs ${dev.needs}; confirm they exist`);
  if (!bld.hardest_shot) warnings.push("build.hardest_shot missing: name the hardest shot and how it's built");
  if (dev.build.score <= 2 && !footage) g5.push(`${dev.name} is buildability ${dev.build.score}/5 in code-built motion`);
  gate("G5", "Buildable in code-built motion graphics", g5, { device_build: `${dev.build.score}/5 (${dev.build.how.join(", ")})` });

  // G7: product-first (launch, promo and product films; references/product-first.md)
  if (opts.productFirst || p.product_first === true) {
    const g7 = [];
    const shape = shapeOf(p, beats);
    const isLadder = shape === "ladder";
    const isPas = shape === "pas";
    const isOther = !!STORY_SHAPES[shape] && !["ladder", "pas", "scenario"].includes(shape);
    const flagged = deviceIds.map((x, i) => devices[i]).filter((d) => d && pfBanned(d));
    if (flagged.length) g7.push(`${flagged.map((d) => d.name).join(", ")} is a conceit device (museum, allegory, invented world, extended metaphor, cover version, borrowed container): a product film is led by the product, pick a device that stays on the real UI`);
    const pun = p.visual_pun && typeof p.visual_pun === "object" ? p.visual_pun : null;
    const punOk = !!pun && Number(pun.resolves_in_s) <= 1;
    const conceitText = [p.title, p.logline, p.signature_image, ...(p.visual_motifs || []), ...beats.map((b) => `${b.name || ""} ${b.visual || ""} ${b.on_screen || ""}`)].join(" . ");
    const cm = conceitText.match(CONCEIT_RE);
    if (cm && !punOk) g7.push(`conceit word "${cm[0]}" in the title, logline or beats: an invented world or extended metaphor cannot carry a product film (an instant visual pun that resolves to the product within 1 s is allowed: set visual_pun {what, resolves_in_s})`);
    else if (cm) warnings.push(`conceit word "${cm[0]}" allowed only as the visual pun "${pun.what || ""}"`);
    // no system-UI imitation: a frame posing as the viewer's own OS (dialog, store sheet, notification shade) with no phone in a hand or on a surface around it
    const SYS_RE = /poses? as the viewer'?s?|posing as the viewer'?s?|full[- ]?frame (system|os)\b|app[- ]?store (sheet|dialog|page)|\bos (dialog|alert|prompt|sheet)|system (dialog|alert|prompt|sheet)|notification shade/i;
    const PHONE_IN_HAND_RE = /\b(phone|device|handset)\b[^.]{0,80}\b(in (a|the|his|her|their) hand|held|hand|thumb|on (a|the) (table|desk|counter|sofa|cushion|surface|speaker)|lies|lying|rests?|resting|propped)\b|\b(in (a|the|his|her|their) hand|hand holds?|held)\b[^.]{0,80}\b(phone|device|handset)\b/i;
    beats.forEach((b, i) => { const v = `${b.visual || ""} ${b.picture || ""}`; const m = v.match(SYS_RE); if (m && !PHONE_IN_HAND_RE.test(v)) g7.push(`system-ui-pose: beat ${i + 1} "${b.name || roles[i]}" says "${m[0]}": a full-frame system dialog or store sheet posing as the viewer's own phone is rejected by ad platforms. Open on the phone in a hand (or on a surface), then push in`); });
    // the product on screen within 3 s
    const prodName = truth?.product?.name || p.product || "";
    const uiWords = [...(truth ? truth.words : []), ...(p.ui_labels || [])];
    const early3 = beats.filter((b, i) => starts[i] < 3);
    const earlyText = early3.map((b) => `${b.on_screen || ""} ${b.visual || ""}`).join(" ");
    const seen = (prodName && mentions(earlyText, prodName)) || uiWords.some((w) => mentions(earlyText, w)) || /\b(real |the )?(ui|app window|interface|screenshot|screen capture|menu bar|product screen|the app|the window|composer|cursor)\b/i.test(earlyText);
    if (!seen && !isPas) g7.push("the product is not on screen within 3 s: beat 1 must show the real product UI (name it in the beat's visual, with its real labels)");
    const hero = p.hero_moment;
    const heroTxt = typeof hero === "string" ? hero : hero && (hero.what || hero.feature);
    if (isLadder || isPas || isOther) { /* a ladder's heroes are its rungs, a pas film's are its benefits (G10) */ }
    else if (!String(heroTxt || "").trim()) g7.push("hero_moment missing: {beat, what} the one product moment that shows the key feature for real");
    else if (hero && typeof hero === "object" && hero.beat != null && !(Number(hero.beat) >= 1 && Number(hero.beat) <= beats.length)) g7.push(`hero_moment.beat ${hero.beat} is not a beat of this script`);
    const uses = isLadder ? beats.filter((b) => String(b.role || "").toLowerCase() === "rung").map((b) => b.use).filter((u) => String(u || "").trim()) : Array.isArray(p.uses) ? p.uses.filter((u) => String(u || "").trim()) : [];
    if (!isLadder && !isPas && !isOther && (uses.length < 2 || uses.length > 4)) g7.push(`uses: ${uses.length} ${p.feature ? "steps of the one task" : "real use cases"} (2-4 required: ${p.feature ? "the real steps of the viewer's one task in the real UI" : "real people doing real things with the real UI"})`);
    if (!String(p.last_line || "").trim()) g7.push("last_line missing: the required end line (the call to action) is the largest type in the film");
    if (p.end_line_largest !== true) g7.push("end_line_largest is not true: the end line must be the largest type in the film on a clean CTA card");
    const longLines = beats.filter((b) => String(b.on_screen || "").trim().split(/\s+/).filter(Boolean).length > 6).length;
    if (longLines) g7.push(`${longLines} beat(s) carry more than 6 on-screen words: product films use short plain kinetic lines`);
    // launch-film structure (references/launch-film.md): hook, reveal/hero, 2-4 uses, payoff line, end card; timings in range; the product or brand in every beat
    const heroObj = hero && typeof hero === "object" ? hero : null;
    const scenario = !isPas && !isOther && isScenario(p, beats);
    const roles = beats.map((b, i) => lfRole(b, i, beats.length, heroObj));
    const rng = isPas || isOther ? {} : scenario ? { ...LF_RANGES[lfBucket(lengthS)], ...SC_RANGES[lfBucket(lengthS)] } : LF_RANGES[lfBucket(lengthS)];
    if (!scenario && !isLadder && !isPas && !isOther) {
      // the older launch structure (hook, hero, 2-4 demos, payoff, end card); a one-feature scenario film is held to G10 instead
      if (!roles.includes("hero")) g7.push("structure: no reveal / hero beat (name it \"Hero\" or set role: \"hero\"; references/launch-film.md section 1)");
      const nDemo = roles.filter((r) => r === "demo").length;
      const demoCap = ({ 15: 3, 30: 5, 60: 7, 90: 9 })[lfBucket(lengthS)];
      if (nDemo < 2 || nDemo > demoCap) g7.push(`structure: ${nDemo} feature-demo beats (2 to ${demoCap} for a ${Math.round(lengthS)} s film, one idea each; the hook, hero, payoff and end card are not demos)`);
      if (!String(p.payoff_line || "").trim() && !roles.includes("payoff")) g7.push("structure: payoff line missing (payoff_line, or a beat with role \"payoff\": one plain outcome sentence before the end card)");
    }
    const outOfRange = [];
    beats.forEach((b, i) => { const [lo, hi] = rng[roles[i]] || [0, 99]; const d = Number(b.duration_s); if (d < lo - 0.01 || d > hi + 0.01) outOfRange.push(`${b.name} (${roles[i]}) ${d} s, template ${lo}-${hi} s`); });
    if (outOfRange.length) g7.push(`timings outside the ${lfBucket(lengthS)} s launch template for a ${Math.round(lengthS)} s film: ${outOfRange.join("; ")}`);
    const bareBrand = /\b(ui|app|window|interface|screen|screenshot|cursor|composer|menu|logo|wordmark|mark|brand|cta|end card|canvas|product|dot|prompt)\b/i;
    const names = [prodName, truth?.product?.brand, p.brand, p.product, ...uiWords].filter(Boolean);
    const noProd = beats.map((b, i) => ({ b, i })).filter(({ i }) => !(isPas && (roles[i] === "hook" || roles[i] === "agitate"))).filter(({ b }) => { const t = `${b.name || ""} ${b.on_screen || ""} ${b.visual || ""} ${b.vo || ""}`; return !(bareBrand.test(t) || names.some((w) => mentions(t, w))); }).map(({ b, i }) => `${i + 1} ${b.name}`);
    if (noProd.length) g7.push(`beat(s) without the product or brand: ${noProd.join(", ")} (every beat shows the real UI, the mark or the brand's canvas; name it in the beat's visual)`);
    gate("G7", "Product-first (UI from the first seconds, hero moment, real uses, no conceit, launch-film structure and timings)", g7, { early_beats: early3.map((b) => b.name), hero_moment: heroTxt || null, uses, roles, template_s: lfBucket(lengthS) });

    // G9: tempo (references/launch-film.md, Tempo): enough ideas, something changes every ~2 s, no long holds
    {
      const g9 = [];
      const bucket = lfBucket(opts.length || lengthS);
      const minIdeas = ({ 15: 3, 30: 5, 60: 8, 90: 10 })[bucket];
      const heroMax = ({ 15: 3.5, 30: 4, 60: 5, 90: 6 })[bucket];
      const brand = opts.brandTempo || null;
      const houseEvery = HOUSE_CHANGE_EVERY_S, houseHold = 3;
      const everyMax = brand ? Math.min(houseEvery, brand.changeEveryS) : houseEvery;
      const holdMax = brand ? Math.min(houseHold, Math.max(1.5, brand.changeEveryS * 1.5)) : houseHold;
      const heroLimit = brand && brand.longestHoldS >= 2 ? Math.min(heroMax, brand.longestHoldS) : heroMax;
      const ideaRoles = new Set(["statement", "hero", "demo", "payoff", "proof", "turn", "open", "rung", "ways_in", "meet", "benefit"]);
      // in a one-feature film every UI step of the proof beyond its first is one more thing the viewer learns
      // the idea count is the number of distinct beliefs: the intent's beats with a distinct `buys` (without an intent sheet, the roles count as before)
      const II = opts.intent && opts.intent.data && Array.isArray(opts.intent.data.beats) ? opts.intent.data : null;
      const intentIdeas = II ? new Set(II.beats.map((b) => nz8(typeof (b && b.buys) === "object" ? JSON.stringify(b.buys) : b && b.buys)).filter(Boolean)).size : null;
      const ideas = intentIdeas != null ? intentIdeas : beats.filter((b, i) => b.idea === true || ideaRoles.has(roles[i])).length + beats.reduce((a, b, i) => a + (roles[i] === "proof" || roles[i] === "rung" || roles[i] === "benefit" ? Math.max(0, uiOf(b).length - 1) : 0), 0);
      const t = p.tempo && typeof p.tempo === "object" ? p.tempo : null;
      if (!t) g9.push("tempo missing: set tempo { ideas, change_every_s, longest_hold_s, source: \"brand film\" | \"house\" } (references/script.md pass 0)");
      else {
        if (!(Number(t.change_every_s) > 0)) g9.push("tempo.change_every_s missing: how often something changes on screen, in seconds");
        else if (Number(t.change_every_s) > everyMax + 0.01) g9.push(`tempo.change_every_s ${t.change_every_s} is slower than the target ${r1d(everyMax)} s (${brand ? "the brand film's measured tempo, capped at the house tempo" : "house tempo"})`);
        if (brand && !/brand/i.test(String(t.source || ""))) g9.push('tempo.source must be "brand film": a brand film card is measured for this film, write to its tempo');
        if (!t.source) g9.push('tempo.source missing ("brand film" or "house")');
      }
      if (!opts.calm && ideas < minIdeas) g9.push(`${ideas} ideas in a ${Math.round(opts.length || lengthS)} s film: at least ${minIdeas} (a promise, the hero, each use or proof, the payoff each count once; ${bucket === 30 ? "an idea is one beat's buys: 5 to 7 beliefs in 30 s" : "more is better"}). A calm film must be asked for in the brief`);
      const heroI = roles.indexOf("hero");
      // a hero-strip film's hero is a whole demo (40-50% of the film): it may run long when something changes inside it
      // at the film's tempo (its `changes`), since the cap is about a still hold, not about the demo's length
      const heroDemo = heroI >= 0 && p.shape === "hero-strip" && Array.isArray(beats[heroI].changes) && beats[heroI].changes.length >= Math.ceil(Number(beats[heroI].duration_s) / everyMax) - 1;
      const heroCapS = heroDemo ? 0.5 * (opts.length || lengthS) : heroLimit;
      if (heroI >= 0 && Number(beats[heroI].duration_s) > heroCapS + 0.01) g9.push(heroDemo ? `the hero demo runs ${beats[heroI].duration_s} s: half the film at most` :`the hero beat holds ${beats[heroI].duration_s} s: ${r1d(heroLimit)} s at most in a ${bucket} s film (the longest hold; show its UI states changing in less)`);
      const needChanges = [], long = [];
      beats.forEach((b, i) => {
        const r = roles[i], d = Number(b.duration_s);
        if (r === "cta" || r === "hero") return;
        if (d > holdMax + 0.01) {
          const need = Math.max(1, Math.ceil(d / 2) - 1), have = (Array.isArray(b.changes) ? b.changes.filter((c) => String(c || "").trim()).length : 0) + uiOf(b).length;
          if (have < need) needChanges.push(`${i + 1} ${b.name} (${d} s needs ${need} listed change${need > 1 ? "s" : ""} in \"changes\", has ${have})`);
        }
        if (r === "statement") {
          const w = String(b.on_screen || "").trim().split(/\s+/).filter(Boolean).length, read = readTime(w);
          if (d > read + 1 && !(Array.isArray(b.changes) && b.changes.length)) long.push(`${i + 1} ${b.name} (${d} s for a ${w}-word line, reading time ${r1d(read)} s)`);
        }
      });
      if (needChanges.length) g9.push(`beats longer than ${r1d(holdMax)} s must list what changes inside them (in "changes" or "ui"), roughly one change per 2 s: ${needChanges.join("; ")}`);
      if (long.length) g9.push(`a statement line holds only its reading time (0.6 s + 0.3 s per word): ${long.join("; ")}`);
      if (t && Number(t.ideas) && Number(t.ideas) !== ideas) (intentIdeas != null ? g9 : warnings).push(`${intentIdeas != null ? "tempo-ideas: " : ""}tempo.ideas says ${t.ideas}, ${intentIdeas != null ? "the intent's beats carry" : "the beats carry"} ${ideas}${intentIdeas != null ? " distinct beliefs (set tempo.ideas to that count)" : ""}`);
      gate("G9", "Tempo (ideas per film, a change every ~2 s, no long holds)", g9, { ideas, min_ideas: minIdeas, change_every_s_max: r1d(everyMax), longest_hold_s: r1d(holdMax), hero_hold_s_max: r1d(heroLimit), source: brand ? "brand film" : "house" });
    }

    // G10: one feature, one scenario (references/script.md pass 0): the viewer's before, the task done in the real UI,
    // the after with the brand, one action; every beat's picture and its UI cause and effect; the two-way read
    if (isOther) {
      // G10 for the S1 shapes: the roles the shape allows, each role's count, a picture per beat, a real UI cause and effect on each use beat
      const SH = STORY_SHAPES[shape], g10 = [];
      const allowed = new Set([...(SH.roles || []), "cta", "proof", "open", "close"]);
      const bad = beats.map((b, i) => (!allowed.has(roles[i]) ? `${i + 1} ${b.name} (${b.role || roles[i]})` : null)).filter(Boolean);
      if (bad.length) g10.push(`beat role(s) not in the ${SH.name} shape: ${bad.join(", ")} (roles: ${[...(SH.roles || [])].join(", ")})`);
      for (const [r, [lo0, hi0]] of Object.entries(SH.need || {})) {
        const [lo, hi] = shape === "before-after" && r === "pair" ? pairRange(opts.length || lengthS) : [lo0, hi0];
        const n = roles.filter((x) => x === r).length;
        if (n < lo || n > hi) g10.push(`${r}: ${n} beat(s) (${lo === hi ? lo : `${lo}-${hi}`} in a ${SH.name}: ${shapeBeats(shape, opts.length || lengthS)})`);
      }
      const noPic = beats.map((b, i) => (!String(b.picture || "").trim() ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (noPic.length) g10.push(`beat(s) without a picture (one sentence: what the viewer sees happen): ${noPic.join(", ")}`);
      const UI_RE = /→|->|:|\bthen\b|\bopens?\b|\bappears?\b|\blands?\b/i;
      const useB = beats.map((b, i) => (SH.use.includes(roles[i]) ? i : -1)).filter((i) => i >= 0);
      const noUi = useB.filter((i) => !uiOf(beats[i]).some((u) => UI_RE.test(u)) && !/^(footage|card)$/.test(roles[i])).map((i) => `${i + 1} ${beats[i].name}`);
      if (noUi.length && !["titles", "trailer", "countdown", "data-journey", "manifesto", "acts"].includes(shape)) g10.push(`use beat(s) without a real ui cause and effect in ui[]: ${noUi.join(", ")}`);
      if (SH.heroCap) { const hi = roles.indexOf("hero"); if (hi >= 0 && Number(beats[hi].duration_s) > SH.heroCap * lengthS + 0.01) g10.push(`the hero takes ${Math.round((Number(beats[hi].duration_s) / lengthS) * 100)}% of the film (${Math.round(SH.heroCap * 100)}% at most)`); }
      gate("G10", `${SH.name} (${shapeBeats(shape, opts.length || lengthS)})`, g10, { shape, uses: useB.length });
    } else if (isPas) {
      const g10 = [], w10 = [];
      const at = (r) => roles.map((x, i) => (x === r ? i : -1)).filter((i) => i >= 0);
      const hook = at("hook"), meet = at("meet"), ben = at("benefit"), ag = at("agitate"), pr = at("proof"), ct = at("cta");
      if (roles[0] !== "hook") g10.push("hook must be the first beat (role \"hook\": the viewer's pain as a picture, a stake they recognise)");
      if (hook.length > 1) g10.push(`hook: ${hook.length} beats (one)`);
      if (meet.length !== 1) g10.push(`meet: ${meet.length} beats (exactly one, role \"meet\": the brand reveal)`);
      if (ben.length < 2 || ben.length > 4) g10.push(`benefit beats: ${ben.length} (2-4, each one thing the viewer gains with one real UI behaviour)`);
      if (ag.length > 1) g10.push(`agitate: ${ag.length} beats (zero or one: the pain lands, a reaction line is welcome)`);
      if (ct.length !== 1 || roles[roles.length - 1] !== "cta") g10.push("one cta, last (role \"cta\": { line, action, where } on the pitch)");
      const proofOnBeat = (opts.length || lengthS) <= 15 && p.proof && typeof p.proof === "object" && String(p.proof.claim || "").trim() && (Array.isArray(p.coverage) ? p.coverage : []).some((r) => r && r.cut == null && Number(r.beat) >= 1 && String(r.claim).toLowerCase() === String(p.proof.claim).toLowerCase()); // a 10 s pas has no room for a proof beat
      if (!pr.length && !proofOnBeat) w10.push("no proof beat (role \"proof\": a real number, adoption, rating or named customers; G12 checks it against research/claims.json)");
      if (meet.length === 1) {
        if (ag.length && ag[0] > meet[0]) g10.push("agitate comes after the meet: the pain lands before the reveal");
        if (ben.some((i) => i < meet[0])) g10.push("a benefit comes before the meet: the brand is revealed first, then what it does for the viewer");
        if (pr.length && ben.length && Math.max(...ben) > Math.min(...pr)) g10.push("order: hook, agitate, meet, benefits, then proof, then cta");
      }
      const noPic = beats.map((b, i) => (!String(b.picture || "").trim() ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (noPic.length) g10.push(`beat(s) without a picture (one sentence: what the viewer sees happen): ${noPic.join(", ")}`);
      const noUi = ben.filter((i) => !uiOf(beats[i]).some((u) => /→|->|:|\bthen\b|\bopens?\b|\bappears?\b|\blands?\b/i.test(u))).map((i) => `${i + 1} ${beats[i].name}`);
      if (noUi.length) g10.push(`benefit beat(s) without a ui cause and effect in ui[] (one real UI behaviour each: "reply from the list → the thread clears"): ${noUi.join(", ")}`);
      // the ladder's own breadth rule: every benefit is a different use (no two share a scenario noun); G13 measures the scenario's share
      const S10 = sceneAnalysis(p, beats, roles, lengthS, truth);
      for (let a = 0; a < ben.length; a++) for (let c = a + 1; c < ben.length; c++) {
        const sh = S10.shared(S10.tok[ben[a]], S10.tok[ben[c]]);
        if (sh.length) g10.push(`benefits ${ben[a] + 1} and ${ben[c] + 1} share "${sh[0]}" ("${beats[ben[a]].name}" / "${beats[ben[c]].name}"): every benefit is a different use, not two steps of one scenario`);
      }
      const badUi = beats.flatMap((b) => uiOf(b)).filter((u) => !/→|->|:|\bthen\b|\bopens?\b|\bappears?\b|\blands?\b/i.test(u));
      if (badUi.length) g10.push(`ui entries need a cause and its effect: ${badUi.slice(0, 2).map((u) => `"${u}"`).join(", ")}`);
      const INVP = /\b(placeholder|generic (cards?|boxes|page|screen|output|result)|(grey|gray|purple|lavender|empty) boxes|boxes standing in|dummy (ui|screen|page|data)|fake (ui|screen|page|output)|invented (page|screen|output|ui)|lorem)\b/i;
      const invP = beats.map((b, i) => (INVP.test(noDev(`${b.visual || ""} ${b.picture || ""} ${uiOf(b).join(" ")}`)) ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (invP.length) g10.push(`invented output screen in beat(s) ${invP.join(", ")}: the result is the product's real UI`);
      if (meet.length === 1 && !/brand|logo|mark|wordmark|name/i.test(`${beats[meet[0]].visual || ""} ${beats[meet[0]].picture || ""} ${beats[meet[0]].on_screen || ""}`) && !p.brand_reveal) w10.push("the meet beat should carry the brand reveal (the mark or name lands once, here): say so in its picture");
      warnings.push(...w10);
      gate("G10", "Pas (the viewer's pain, the brand meets it, 2-4 benefits each a real UI behaviour, proof, one concrete cta)", g10, { shape: "pas", benefits: ben.length, meet_at_pct: meet.length === 1 ? Math.round((starts[meet[0]] / lengthS) * 100) : null });
    } else if (isLadder) {
      const g10 = [], w10 = [];
      const wc = (x) => String(x || "").trim().split(/\s+/).filter(Boolean).length;
      const verb = String((p.refrain && p.refrain.verb) || "").trim();
      if (!verb) g10.push("refrain.verb missing: { verb, pattern } (the one verb every title carries, e.g. { verb: \"Ask\", pattern: \"Ask <it to> <highlight>\" })");
      const hasVerb = (b) => new RegExp(`\\b${esc(verb.toLowerCase())}`, "i").test(String(b.on_screen || ""));
      const idx = (r) => beats.map((b, i) => (roles[i] === r ? i : -1)).filter((i) => i >= 0);
      const rungs = idx("rung").map((i) => ({ b: beats[i], i }));
      const [lo, hi] = rungRange(lengthS);
      if (rungs.length < lo || rungs.length > hi) g10.push(`rungs: ${rungs.length} for a ${Math.round(lengthS)} s film (${lo}-${hi} rungs: films up to 35 s 3-4, 36-60 s 4-6, over 60 s 6-8)`);
      if (!idx("open").length) w10.push("no open beat (role: \"open\": the refrain arrives, the product on screen within 3 s)");
      if (!idx("close").length) g10.push("close beat missing (role: \"close\": \"<verb> anything\" or the product's own line, then the logo / end line)");
      if (verb) {
        const noVerb = beats.map((b, i) => ({ b, i })).filter(({ b, i }) => ["open", "rung", "close"].includes(roles[i]) && !hasVerb(b) && b.break !== true).map(({ b, i }) => `${i + 1} ${b.name} ("${b.on_screen || ""}")`);
        if (noVerb.length) g10.push(`title without the refrain verb "${verb}": ${noVerb.join("; ")} (only the ways_in beat and the break rung may use other verbs: the break changes the structure or the verb)`);
      }
      const nouns = rungs.map(({ b }) => useNouns(b.use));
      rungs.forEach(({ b, i }) => {
        const u = String(b.use || "").trim();
        if (!u) g10.push(`rung ${i + 1} ${b.name}: use missing (a distinct everyday use, 2-6 words)`);
        else if (wc(u) < 2 || wc(u) > 6) w10.push(`rung ${i + 1} ${b.name}: use "${u}" is ${wc(u)} words (2-6)`);
      });
      for (let a = 0; a < rungs.length; a++) for (let c = a + 1; c < rungs.length; c++) {
        const shared = [...nouns[a]].filter((w) => nouns[c].has(w));
        if (shared.length) g10.push(`rungs ${rungs[a].i + 1} and ${rungs[c].i + 1} share the use noun "${shared[0]}" ("${rungs[a].b.use}" / "${rungs[c].b.use}"): every rung is a different everyday use`);
      }
      const lv = rungs.map(({ b }) => Number(b.level));
      if (rungs.length && (lv.some((x) => !Number.isFinite(x)) || lv.some((x, i) => i && x <= lv[i - 1]))) g10.push(`rung level must be a number, strictly increasing from simple to done-for-you (got ${lv.map((x) => (Number.isFinite(x) ? x : "?")).join(", ")})`);
      const big = rungs.filter(({ b }) => Number(b.duration_s) > 0.35 * lengthS).map(({ b, i }) => `${i + 1} ${b.name} (${b.duration_s} s of ${Math.round(lengthS)} s)`);
      if (big.length) g10.push(`rung over 35% of the film: ${big.join("; ")} (a ladder keeps moving)`);
      const noUi = rungs.filter(({ b }) => !uiOf(b).some((u) => /→|->|:|\bthen\b|\bopens?\b|\bappears?\b|\blands?\b/i.test(u))).map(({ b, i }) => `${i + 1} ${b.name}`);
      if (noUi.length) g10.push(`rung(s) without ui cause and effect in ui[] ("type the question → the answer builds line by line"): ${noUi.join(", ")}`);
      const badUi = beats.flatMap((b) => uiOf(b)).filter((u) => !/→|->|:|\bthen\b|\bopens?\b|\bappears?\b|\blands?\b/i.test(u));
      if (badUi.length) g10.push(`ui entries need a cause and its effect: ${badUi.slice(0, 2).map((u) => `"${u}"`).join(", ")}`);
      const noPic = beats.map((b, i) => (!String(b.picture || "").trim() ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (noPic.length) g10.push(`beat(s) without a picture (one sentence: what the viewer sees happen): ${noPic.join(", ")}`);
      const INV = /\b(placeholder|generic (cards?|boxes|page|screen|output|result)|(grey|gray|purple|lavender|empty) boxes|boxes standing in|dummy (ui|screen|page|data)|fake (ui|screen|page|output)|invented (page|screen|output|ui)|lorem)\b/i;
      const inv = beats.map((b, i) => (INV.test(noDev(`${b.visual || ""} ${b.picture || ""} ${uiOf(b).join(" ")}`)) ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (inv.length) g10.push(`invented output screen in beat(s) ${inv.join(", ")}: the result is the product's real UI`);
      rungs.forEach(({ b, i }) => {
        if (wc(b.on_screen) > 6) w10.push(`rung ${i + 1} ${b.name}: title "${b.on_screen}" is ${wc(b.on_screen)} words (6 at most)`);
        const h = String(b.highlight || "").trim();
        if (!h) w10.push(`rung ${i + 1} ${b.name}: highlight missing (the one word the title card emphasises)`);
        else if (!new RegExp(`\\b${esc(h.toLowerCase())}`).test(norm(b.on_screen))) w10.push(`rung ${i + 1} ${b.name}: highlight "${h}" is not in its title`);
      });
      warnings.push(...w10);
      if (!rungs.some(({ b }) => b.break === true)) warnings.push('ladder: no rung is "break": true (the rung at 60-75% where the pattern changes: the product finishes the line, the refrain stops, the format flips; not just the next use)');
      ladderCardsOnly = beats.length >= 3 && !beats.some((b) => PERSON_RE.test(String(b.on_screen || "") + " " + String(b.situation || "") + " " + String(b.picture || b.visual || "")) && !/\b(card|ui|screen|panel|window)\b/i.test(String(b.situation || ""))) && !(p.callback && typeof p.callback === "object") && !String(p.situation || "").trim();
      gate("G10", "Ladder (a refrain verb, distinct everyday uses that escalate, each a real UI cause and effect, a close)", g10, { shape: "ladder", refrain: verb || null, rungs: rungs.length, rung_range: [lo, hi] });
    } else {
      const g10 = [];
      const f = p.feature && typeof p.feature === "object" ? p.feature : null;
      if (!f) g10.push("feature missing: { name, url, viewer, task, before, after } for the ONE single-task feature this film is about (the user's named one, else the newest launch, else the core surface); a feature whose promise is breadth is a ladder even when it is the only feature, and a general product launch is a ladder too: set shape \"ladder\", a refrain {verb, pattern} and open / rung / close beats");
      else {
        for (const k of ["name", "url", "viewer", "task", "before", "after"]) if (!String(f[k] || "").trim()) g10.push(`feature.${k} missing`);
        if (/\s(and|&|\+)\s|,|\//i.test(String(f.name || ""))) g10.push(`feature.name "${f.name}" names more than one feature: a launch film is about ONE feature (pick the user's named one, else the newest launch)`);
        if (/\b(and then|as well as|plus|also)\b|;/i.test(String(f.task || ""))) g10.push(`feature.task "${f.task}" is more than one task: one viewer doing one real task`);
      }
      const order = ["hook", "proof", "turn", "cta"];
      const firstAt = order.map((r) => roles.indexOf(r));
      if (firstAt.some((x) => x < 0)) g10.push(`roles: the film needs hook, proof, turn and cta beats (has ${[...new Set(roles)].join(", ")}): hook = the viewer's before, proof = the task in the real UI, turn = the after and the brand reveal, cta = one action`);
      else if (!firstAt.every((x, i) => i === 0 || x > firstAt[i - 1])) g10.push("roles out of order: hook, then proof, then turn, then cta");
      if (roles.filter((r) => r === "cta").length > 1 || (roles.includes("cta") && roles[roles.length - 1] !== "cta")) g10.push("one cta, last");
      const noPic = beats.map((b, i) => (!String(b.picture || "").trim() ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (noPic.length) g10.push(`beat(s) without a picture (one sentence: what the viewer sees happen, proving the line): ${noPic.join(", ")}`);
      const proofs = beats.filter((b, i) => roles[i] === "proof");
      const steps = proofs.reduce((a, b) => a + uiOf(b).length, 0);
      if (proofs.length && steps < 2) g10.push(`the proof lists ${steps} UI step(s): list at least 2 in ui[] as cause and effect ("click Open: a new tab opens, the address changes, a toast says Saved")`);
      const badUi = beats.flatMap((b) => uiOf(b)).filter((u) => !/→|->|:|\bthen\b|\bopens?\b|\bappears?\b|\blands?\b/i.test(u));
      if (badUi.length) g10.push(`ui entries need a cause and its effect ("click Send → the message lands in the thread, the composer clears"): ${badUi.slice(0, 2).map((u) => `"${u}"`).join(", ")}`);
      const INVENTED = /\b(placeholder|generic (cards?|boxes|page|screen|output|result)|(grey|gray|purple|lavender|empty) boxes|boxes standing in|mock(ed)?[- ]up (page|output|result|screen)|dummy (ui|screen|page|data)|fake (ui|screen|page|output)|invented (page|screen|output|ui)|lorem)\b/i;
      const inv = beats.map((b, i) => (INVENTED.test(noDev(`${b.visual || ""} ${b.picture || ""} ${uiOf(b).join(" ")}`)) ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (inv.length) g10.push(`invented output screen in beat(s) ${inv.join(", ")}: the result is the product's real UI from the research (research/screens), never generic boxes standing in for it`);
      const tw = p.two_way && typeof p.two_way === "object" ? p.two_way : {};
      if (!String(tw.lines_alone || "").trim() || !String(tw.pictures_alone || "").trim()) g10.push("two_way missing: { lines_alone, pictures_alone }: read the lines with the pictures hidden, then the pictures with the lines hidden, and write the story each tells; they must be the same story");
      if (f && roles.includes("turn")) {
        const t = beats[roles.indexOf("turn")];
        if (!/brand|logo|mark|wordmark|name/i.test(`${t.visual || ""} ${t.picture || ""} ${t.on_screen || ""}`) && !p.brand_reveal) warnings.push("the turn should carry the brand reveal (the mark lands once, in the turn): say so in its picture");
      }
      gate("G10", "One feature, one scenario (the viewer's before, the task in the real UI, the after with the brand, one action)", g10, { feature: f ? f.name || null : null, ui_steps: steps });
    }

    // G13: the story's scope matches the claim's scope (references/story.md, Scope). Reads the truth sheet's Claim scope.
    if (!truth) warnings.push("G13 (scope) skipped: no --truth, so the claim's scope is unknown");
    else {
      const g13 = [], w13 = [];
      const sc = scopeOf(truth);
      const A = sceneAnalysis(p, beats, roles, lengthS, truth);
      const pct = (x) => `${Math.round(x * 100)}%`;
      const bl = (is) => is.map((i) => `${i + 1} ${beats[i].name || roles[i]}`).join(", ");
      const len = opts.length || lengthS;
      // one script may show fewer uses / areas than the claim scope asks when it declares scope_waiver { reason } and a plan is active (the set's union then carries the range)
      const sw = p.scope_waiver && typeof p.scope_waiver === "object" ? p.scope_waiver : null;
      const waived = !!sw && !!opts.plan && wordsN(sw.reason) >= 6;
      if (sw && !opts.plan) w13.push("scope-waiver ignored: no plan is active, so the range minimums stand");
      else if (sw && wordsN(sw.reason) < 6) g13.push(`waiver-reason: scope_waiver.reason is ${wordsN(sw.reason)} words (6 at least: say what claim the narrower range keeps honest)`);
      const rng = waived ? w13 : g13;
      const persona = personaAllowed(truth, p) || (shapeOf(p, beats) === "life-arc" && A.useIdx.length >= 3);
      const extra = { claim_scope: sc, D: A.D, S_max: Math.round(A.sMax * 100) / 100, cluster: A.cluster.beats.map((i) => i + 1), cluster_nouns: A.cluster.nouns.slice(0, 8), scenario_words: A.multi ? [...new Set(A.cluster.beats.flatMap((i) => [...A.tok[i]]))].slice(0, 40) : [], P: A.P, uses: A.useIdx.length, domains: [...new Set(A.domains)], min_D: null, waiver: waived };
      if (!sc) g13.push("claim-scope-missing: the truth sheet has no Claim scope (scope: universal | category | single-task). Regenerate it (re-run the research lead, or add ## Claim scope and ## Use moments): the story's scope must match the claim's");
      else if (sc !== "single-task") {
        const uni = sc === "universal";
        const sh = shapeOf(p, beats);
        const okShape = STORY_SHAPES[sh] && (STORY_SHAPES[sh].breadth || (!uni && sh !== "scenario") || (persona && STORY_SHAPES[sh].persona && sh !== "scenario"));
        if (!okShape) g13.push(`shape: a ${sc} claim is told as its range (${SHAPE_IDS.filter((x) => STORY_SHAPES[x].breadth).join(", ")}), never a ${sh === "scenario" ? "one-viewer, one-task scenario" : sh} film: "one viewer doing one real task" is only for a single-task claim`);
        if (uni && sh === "life-arc" && A.useIdx.length < 3) g13.push("shape: a life arc carries a universal claim only when it passes through 3+ different uses");
        // uses and areas of life
        const minUses = uni ? (len <= 35 ? 4 : len <= 50 ? 5 : 6) : 3;
        const nUses = A.useIdx.length + A.burst.length;
        if (nUses < minUses) rng.push(`use-count: ${nUses} uses for a ${Math.round(len)} s ${sc} film (${minUses} at least)`);
        const noDom = A.useIdx.filter((i) => !A.useDomains[A.useIdx.indexOf(i)]);
        if (noDom.length) g13.push(`domain missing on use beat(s) ${bl(noDom)}: every rung or benefit names its area of life in "domain"${uni ? ` (${USE_DOMAINS.join(", ")})` : ""}`);
        if (uni) { const bad = [...new Set(A.domains.filter((d) => !USE_DOMAINS.includes(d)))]; if (bad.length) g13.push(`domain(s) ${bad.join(", ")} not in the list: ${USE_DOMAINS.join(", ")}`); }
        const minD = uni ? (len <= 22 ? 3 : len <= 40 ? 4 : 5) : (len <= 22 ? 2 : len <= 40 ? 3 : 4);
        extra.min_D = minD;
        if (A.D < minD) rng.push(`areas: ${A.D} distinct area(s) of life (${[...new Set(A.domains)].join(", ") || "none"}) for a ${Math.round(len)} s ${sc} claim (${minD} at least): the film is the claim's range`);
        const byDom = {}; A.useDomains.filter(Boolean).forEach((d) => { byDom[d] = (byDom[d] || 0) + 1; });
        const topDom = Object.entries(byDom).sort((a, b) => b[1] - a[1])[0];
        if (uni && topDom && A.useDomains.length >= 3 && topDom[1] / A.useDomains.length > 0.5) g13.push(`areas: "${topDom[0]}" holds ${topDom[1]} of ${A.useDomains.length} uses (half at most)`);
        // dominance: no scenario over 35% of the film (a universal claim aims at 25% or less)
        const domCap = sh === "hero-strip" && roles.filter((r) => r === "strip").length >= 4 ? 0.45 : 0.35;
        if (A.sMax > domCap + 1e-9) g13.push(`dominance: one scenario takes ${pct(A.sMax)} of the film (beats ${bl(A.cluster.beats)}${A.cluster.nouns.length ? `, sharing "${A.cluster.nouns.slice(0, 5).join('", "')}"` : ""}): ${pct(domCap)} at most; tell the range, not one situation`);
        else if (uni && A.sMax > 0.25 + 1e-9 && domCap === 0.35) w13.push(`dominance: the largest scenario is ${pct(A.sMax)} of the film (beats ${bl(A.cluster.beats)}): a universal claim aims at 25% or less`);
        else if (uni && A.sMax > 0.2) w13.push(`dominance: the largest use is ${pct(A.sMax)} of the film (beats ${bl(A.cluster.beats)}), near the 25% aim`);
        // persona and callbacks
        if (!persona) {
          const maxP = uni ? 0 : 1;
          if (A.P > maxP) {
            const why = [];
            if (A.callbacks.length) why.push(`beat(s) ${bl(A.callbacks)} call the scenario of ${bl(A.cluster.beats.filter(A.isUse))} back`);
            if (A.iChain.length) why.push(`first-person lines chain one "I" through beats ${bl(A.iChain)}`);
            if (A.closeFp.length) why.push(`the last line is one person's ("${linesOf(beats[A.closeFp[0]]).join(" / ")}")`);
            g13.push(`persona: P = ${A.P} (${maxP} at most for a ${sc} claim): ${why.join("; ")}. Unite the uses with the product's verb or one shared enemy, never a shared character`);
          }
          const hk = roles.indexOf("hook");
          if (uni && hk >= 0) {
            const tied = A.useIdx.filter((u) => A.shared(A.tok[hk], A.tok[u]).length);
            if (tied.length && tied.length < 3) g13.push(`hook-scenario: the opening (beat ${hk + 1}) is the set-up of one use (beat ${bl(tied)}): a universal claim opens on the category's pain every viewer has had, or on a montage of 3+ asks`);
          }
          if (uni && A.cluster.beats.includes(beats.length - 1) && A.multi) g13.push(`close-scenario: the last beat resolves one scenario: a universal claim closes on the range ("<verb> anything", the product's own line)`);
        }
        // commonness of each use (reach: most | many | some | few)
        const reach = A.useIdx.map((i) => norm(beats[i].reach).trim());
        if (uni) {
          if (reach.some((r) => r && !REACH.includes(r))) g13.push(`reach must be one of ${REACH.join(" | ")}`);
          const few = A.useIdx.filter((i, k) => reach[k] === "few");
          if (few.length) g13.push(`reach: use beat(s) ${bl(few)} are "few": a universal film never leans on a use few viewers have`);
          if (reach.some((r) => !r)) w13.push(`reach missing on use beat(s) ${bl(A.useIdx.filter((i, k) => !reach[k]))} (most | many | some | few of the audience within a month)`);
          else {
            if (reach[0] && reach[0] !== "most") w13.push(`reach: the first use is "${reach[0]}": open on one most of the audience did this month`);
            if (reach.filter((r) => r === "most" || r === "many").length < reach.length / 2) w13.push("reach: fewer than half the uses are most or many");
          }
        }
        // the promise's own clauses, each shown by a use (clause: index or text on a use beat)
        const clauses = clausesOf(truth);
        if (clauses.length) {
          const covered = clausesShown(clauses, beats);
          const missing = clauses.filter((_, k) => !covered.has(k));
          // with a plan each script owns only some claims: its missing clauses are warnings here, and the portfolio's clause-dropped holds the set to all of them
          if (missing.length) (!opts.plan && A.useIdx.some((i) => beats[i].clause != null) ? g13 : w13).push(`coverage: the promise clause(s) ${missing.map((c) => `"${c}"`).join(", ")} are shown by no use (set clause: <index> on the use beat that shows each)`);
        }
        // the retell test: what is the film about, in a sentence? a universal claim's retell names the range, never one situation
        const retell = String((p.critique && p.critique.retell) || "").trim();
        if (!retell) w13.push("retell missing (critique.retell): say what the film is about in a sentence; it must name the range, not one situation");
        else if (uni) {
          const named = A.multi ? A.cluster.nouns.filter((w) => A.shared(new Set([w]), new Set(nz8(retell).split(" ").map(stem))).length) : [];
          if (!BREADTH_RE.test(retell) || named.length) g13.push(`retell: "${retell.slice(0, 110)}" ${named.length ? `names one situation ("${named.slice(0, 3).join('", "')}")` : "names no range (any, every, whatever...)"}: a universal claim retells as the range ("anything you ask comes back as a tool")`);
        }
        const hero = p.hero_moment && typeof p.hero_moment === "object" ? Number(p.hero_moment.beat) : NaN;
        if (uni && A.bigUse.i != null && hero === A.bigUse.i + 1 && A.useIdx.length >= 3) w13.push(`hero: the hero moment (beat ${hero}) is also the longest use: on a universal claim the range is the hero, no single use`);
      }
      warnings.push(...w13);
      if (opts.productFirst || p.product_first === true) gate("G13", "Scope matches the claim (uses, areas of life, dominance, persona, reach, the promise's clauses, the retell)", g13, extra);
      else warnings.push(...g13.map((r) => `G13 ${r}`));
    }
  }

  // GF: footage-first (references/sources.md), the footage films' own gate in place of G7/G9/G10/G11/G12: the hook is the strongest real moment and plays at
  // once, no card before the first real footage (unless a cold open says why), the film is mostly footage, cards are sparing, and every footage beat names its source.
  // A beat is footage when it names a bite, a moment or a clip (or kind: "footage"). With selects.json, the hook must be a rating 4+ bite or a gold moment.
  if (opts.footageLed) {
    const gf = [];
    const srcOf = (b) => String((b && (b.bite || b.moment || b.clip || b.footage)) || "").trim();
    const isFoot = (b) => !!srcOf(b) || /^(footage|bite|moment|interview|clip)$/i.test(String((b && (b.kind || b.source)) || ""));
    const first = beats[0];
    const cold = p.cold_open && typeof p.cold_open === "object" ? p.cold_open : null;
    if (!isFoot(first)) {
      if (!(cold && String(cold.why || "").trim().length >= 12 && Number(cold.duration_s || first.duration_s) <= 2)) gf.push("the film opens on a card, not on footage: the hook is the strongest real moment from the material (a rated 4+ bite or a gold moment) and it plays at once. A cold-open title is allowed only as cold_open { why, duration_s <= 2 }");
    } else {
      const id = srcOf(first);
      if (opts.selects && id) {
        const sel = opts.selects.get(id);
        if (!sel) gf.push(`the hook beat names "${id}", which is not in footage/selects.json`);
        else if (!(sel.rating >= 4 || sel.gold)) gf.push(`the hook beat "${id}" is rated ${sel.rating}: open on a rated 4+ bite or a gold moment (the strongest real thing in the material)`);
      } else if (!opts.selects) warnings.push("footage-first: no footage/selects.json to check the hook against (--selects): confirm the hook is a rated 4+ bite or a gold moment");
    }
    const footS = beats.reduce((a, b) => a + (isFoot(b) ? Number(b.duration_s) || 0 : 0), 0);
    const share = lengthS ? footS / lengthS : 0;
    if (share < 0.4) gf.push(`only ${Math.round(share * 100)}% of the film is footage (60% at least in a film cut from footage): cards carry what the footage can't, they don't replace it`);
    else if (share < 0.6) warnings.push(`footage is ${Math.round(share * 100)}% of the film (60% or more is the target)`);
    const cards = beats.filter((b) => !isFoot(b)).length;
    const cardCap = Math.max(1, Math.ceil(lengthS / 12));
    if (cards > cardCap) gf.push(`${cards} card beats in a ${Math.round(lengthS)} s film (one per 12 s at most, ${cardCap} here): the footage carries the film`);
    const unnamed = beats.map((b, i) => ({ b, i })).filter(({ b }) => isFoot(b) && !srcOf(b)).map(({ b, i }) => `${i + 1} ${b.name || ""}`);
    if (unnamed.length) gf.push(`footage beat(s) that name no bite, moment or clip: ${unnamed.join(", ")} (set bite, moment or clip to an id from footage/selects.json)`);
    gate("GF", "Footage-first (the hook is the strongest real moment, no card before footage, mostly footage, sparing cards, every beat names its source)", gf, { footage_share_pct: Math.round(share * 100), cards, hook: srcOf(first) || null });
  }

  // G6 the script itself (references/script.md): runs when the beats carry voiceover or a target length is given
  let script = null;
  const narrated = opts.narrated || beats.some((b) => String(b.vo || "").trim());
  if (narrated || opts.length) {
    const g6 = [];
    const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
    const nz = (s) => norm(s).replace(/-/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const BANNED = ["seamless", "unlock", "revolutioniz", "revolutionis", "game-changer", "game changer", "supercharge", "effortless", "cutting-edge", "cutting edge", "empower", "streamline", "the future of", "like never before", "next-level", "next level", "all-in-one", "say goodbye to", "harness the power", "elevate your", "reimagine"];
    if (opts.length && Math.abs(lengthS - opts.length) > Math.max(2, opts.length * 0.1)) g6.push(`runs ${lengthS} s for a ${opts.length} s film (within ${Math.max(2, Math.round(opts.length * 0.1))} s)`);
    if (Number(beats[0].duration_s) > 4) g6.push(`the hook beat runs ${beats[0].duration_s} s: land the hook in 1.5-2 s and move on by 4 s`);
    const valueIdx = beats.findIndex((b) => b.value === true);
    if (valueIdx > 1) g6.push(`the value lands in beat ${valueIdx + 1}: state what the viewer gets by beat 2, then prove it`);
    else if (valueIdx < 0) warnings.push("mark the beat that states the value with value: true (it must be beat 1 or 2)");
    const last = beats[beats.length - 1];
    const lenG6 = opts.length || lengthS;
    if (Number(last.duration_s) < END_MIN_S(lenG6) - 1e-9) g6.push(`end-short: the end beat runs ${last.duration_s} s: at least ${END_MIN_S(lenG6)} s in a ${Math.round(lenG6)} s film, so the name and call to action land (and at most 1.4 s still after the last one)`);
    if (lenG6 <= 12 && (beats.length < 4 || beats.length > 5)) g6.push(`beat-count: ${beats.length} beats in a ${Math.round(lenG6)} s film (4 to 5: story.mjs sheet --length ${Math.round(lenG6)} is the beat sheet)`);
    // the peak holds longest: the peak beat (peak: true, slot "peak", else the intent sheet's) is never shorter than another beat
    {
      const II = opts.intent && opts.intent.data && Array.isArray(opts.intent.data.beats) && opts.intent.data.beats.length === beats.length ? opts.intent.data : null;
      let pk = beats.findIndex((b) => b.peak === true);
      if (pk < 0) pk = beats.findIndex((b) => norm(b.slot).trim() === "peak");
      if (pk < 0 && II) pk = II.beats.findIndex((b) => b.peak === true);
      if (pk >= 0) { const shorter = beats.map((b, i) => ({ b, i })).filter(({ b, i }) => i !== pk && Number(b.duration_s) > Number(beats[pk].duration_s) + 1e-9); if (shorter.length) g6.push(`peak-not-longest: the peak (beat ${pk + 1} "${beats[pk].name || ""}", ${beats[pk].duration_s} s) is shorter than beat ${shorter.map(({ b, i }) => `${i + 1} "${b.name || ""}" (${b.duration_s} s)`).join(", ")}: the peak holds longest`); }
    }
    if (!String(last.on_screen || "").trim()) g6.push("the end beat has no on-screen line (the name and one call to action)");
    let vo = 0;
    beats.forEach((b, i) => {
      const nm = `beat ${i + 1} "${b.name || ""}"`, os = String(b.on_screen || ""), v = String(b.vo || ""), d = Number(b.duration_s), ow = words(os), vw = words(v);
      if (ow > 6) g6.push(`${nm}: ${ow} on-screen words (6 at most)`);
      if (ow && d < readTime(ow)) g6.push(`${nm}: ${ow} on-screen words need ${readTime(ow).toFixed(1)} s to read, it has ${d} s`);
      if (vw && vw / d > 2.7) g6.push(`${nm}: ${vw} voiceover words in ${d} s (${(vw / d).toFixed(1)} words/s; keep it under 2.7)`);
      v.split(/(?<=[.?!])\s+/).forEach((sen) => { if (words(sen) > 14) g6.push(`${nm}: a ${words(sen)}-word voiceover sentence (14 at most; say it aloud)`); });
      if (ow >= 3 && v && nz(v).includes(nz(os))) g6.push(`${nm}: the on-screen line repeats the voiceover; make the screen add a word, a number or an image`);
      const txt = `${os} ${v}`.toLowerCase();
      const hit = BANNED.find((w) => txt.includes(w));
      if (hit) g6.push(`${nm}: "${hit}" is stock launch copy; say the specific thing`);
      if (/\bnot (just )?(a |an |the )?[\w' -]{1,30}[,;:.—–-]+\s*(it'?s|it is|but|this is)\b/i.test(txt)) g6.push(`${nm}: "not X, it's Y" is the signature AI line; state Y`);
      if (/!/.test(txt)) g6.push(`${nm}: exclamation marks read as hype`);
      if (/—/.test(os)) g6.push(`${nm}: an em dash in on-screen text`);
      vo += vw;
    });
    if (narrated && vo > 2.5 * lengthS * 0.85) g6.push(`${vo} voiceover words for ${lengthS} s: leave music-only moments (about ${Math.round(2.5 * lengthS * 0.8)} words at most)`);
    const ds = beats.map((b) => Number(b.duration_s)), mean = ds.reduce((a, b) => a + b, 0) / ds.length, cv = Math.sqrt(ds.reduce((a, b) => a + (b - mean) ** 2, 0) / ds.length) / mean;
    const peakOk = lenG6 <= 12 && !g6.some((m) => m.startsWith("peak-not-longest")); // at <=12 s the peak rule already forces variation
    if (ds.length >= 4 && cv < 0.15 && !peakOk) g6.push(`every beat runs about ${mean.toFixed(1)} s: vary the rhythm (quick beats, then give the turn and the reveal the longest shots)`);
    gate("G6", "The script holds up (references/script.md)", g6);
    script = { narrated, vo_words: vo, words_per_s: Math.round((vo / lengthS) * 100) / 100, rhythm_cv: Math.round(cv * 100) / 100 };
  }

  // G8: the aim (references/script.md pass 0): what the film achieves, how it gets there, and a title that names the idea
  {
    const g8 = [];
    const wc = (x) => String(x || "").trim().split(/\s+/).filter(Boolean).length;
    const aim = p.aim && typeof p.aim === "object" ? p.aim : {};
    if (!String(aim.takeaway || "").trim()) g8.push("aim.takeaway missing: the one thing the viewer remembers, in plain words, as they'd say it to a friend");
    else if (wc(aim.takeaway) > 16) g8.push(`aim.takeaway is ${wc(aim.takeaway)} words (16 at most): say it the way a viewer would to a friend`);
    if (!String(aim.feel || "").trim()) g8.push("aim.feel missing: what the viewer should feel");
    if (!String(aim.action || "").trim()) g8.push("aim.action missing: what the viewer should do next");
    if (!String(p.approach || "").trim()) g8.push("approach missing: one plain sentence on how this story gets there");
    else if (wc(p.approach) > 25) g8.push(`approach is ${wc(p.approach)} words (25 at most)`);
    const title = String(p.title || "").trim();
    const tw = title.split(/\s+/).filter(Boolean);
    const lastW = (tw[tw.length - 1] || "").toLowerCase().replace(/[^a-z']/g, "");
    if (tw.length < 2 || tw.length > 5) g8.push(`title "${title}" is ${tw.length} word${tw.length === 1 ? "" : "s"}: name the story's idea in 2 to 5 words a person would use to refer to it`);
    if (TITLE_STOP.includes(lastW)) g8.push(`title "${title}" ends on "${lastW}": a title is a name, not a fragment of a line`);
    if (/[A-Z]/.test(title) && title === title.toUpperCase()) g8.push(`title "${title}" is ALL CAPS`);
    const nt = nz8(title);
    const lines = [...beats.map((b) => b.on_screen), p.last_line].map(nz8).filter(Boolean);
    const frag = nt && lines.find((l) => l === nt || l.startsWith(`${nt} `));
    if (frag) g8.push(`title "${title}" is the start of an on-screen line ("${frag}"): name the idea instead`);
    gate("G8", "The aim (what the film achieves, how it gets there, a title that names the idea)", g8);
  }


  // G11: every line shows (references/script.md "The show column"): each on-screen line has a motion that MEANS it, built from the
  // product's UI or the film's one actor; words and UI share the frame and touch; lines change in place. Errors on launch / promo /
  // brand films, warnings elsewhere.
  {
    const g11 = [];
    const strict = !!(opts.showStrict || opts.productFirst || p.product_first === true);
    const SW = new Set("the a an and or of to in on at by for with from is it its this that as be are was you your we our i my me not no so but if then than into onto over up out all any one".split(" "));
    const stem = (w) => w.replace(/(ing|ed|es|s)$/, "");
    const toks = (x) => norm(x).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !SW.has(w) && (w.length >= 3 || /\d/.test(w))).map(stem);
    const wc = (x) => String(x || "").trim().split(/\s+/).filter(Boolean).length;
    const BUILT = ["product ui", "actor", "type", "object", "photo"];
    const TOUCH_RE = /\b(through|splits?|strikes?|struck|pushes|pushed|wraps?|rides?|under|across|into|slices?|lights?|lit|crosses|cuts? through|swells?|lands? on|punch(?:es)?)\b/i;
    const SWAP_RE = /\b(swaps?|swapped|becomes?|turns? into|changes? to|replaced|in place)\b/i;
    const act = p.actor && typeof p.actor === "object" ? p.actor : null;
    if (!act || !String(act.what || "").trim() || !String(act.does || "").trim()) (strict ? g11 : warnings).push(`no-actor: pitch.actor { what, does } missing (the one persistent element that carries the film: an orb, the composer, a dot, the cursor, a pill)`);
    let rows = 0, product = 0, touch = false, swap = false;
    const lastBeatWithRow = (() => { for (let i = beats.length - 1; i >= 0; i--) if (Array.isArray(beats[i].shows) && beats[i].shows.length) return i; return -1; })();
    beats.forEach((b, i) => {
      const nm = `beat ${i + 1} "${b.name || ""}"`;
      const shows = Array.isArray(b.shows) ? b.shows : [];
      if (String(b.on_screen || "").trim() && !shows.length) { g11.push(`no-shows: ${nm} has on-screen words and no shows (one row per on-screen line: { line, show, built_from, handoff })`); return; }
      shows.forEach((r, j) => {
        const at = `${nm} shows[${j}]`;
        rows++;
        if (!r || typeof r !== "object") { g11.push(`show-incomplete: ${at} is not an object`); return; }
        const line = String(r.line || "").trim(), show = String(r.show || "").trim(), bf = norm(r.built_from).trim();
        if (!line) g11.push(`show-incomplete: ${at} has no line`);
        if (!show) g11.push(`show-incomplete: ${at} has no show`);
        if (!bf) g11.push(`show-incomplete: ${at} has no built_from (${BUILT.join(" | ")})`);
        else if (!BUILT.includes(bf)) g11.push(`show-incomplete: ${at} built_from "${r.built_from}" is not one of ${BUILT.join(" | ")}`);
        if (bf === "product ui" || bf === "actor") product++;
        if (show) {
          if (isLabelOnly(show)) g11.push(`show-label-only: ${at} "${show}" names a technique and nothing else: say what the element does and how the words and the UI touch`);
          else if (wc(show) < 8) g11.push(`show-short: ${at} is ${wc(show)} words (8 at least): say the element, the action and how the words and the UI touch`);
          const hi = String(r.highlight || b.highlight || "").trim();
          const lt = new Set(toks(line)), st = toks(show);
          const hit = st.some((w) => lt.has(w)) || (hi && toks(hi).some((w) => st.includes(w)));
          if (line && !hit) g11.push(`show-unbound: ${at} shares no word with its line "${line}" and does not name the highlight word: a show that fits any line is not this line's show`);
          if (TOUCH_RE.test(show)) touch = true;
          if (SWAP_RE.test(show)) swap = true;
        }
        const isLast = i === lastBeatWithRow && j === shows.length - 1;
        if (!String(r.handoff || "").trim() && !isLast) g11.push(`no-handoff: ${at} has no handoff (how it becomes the next line: what carries, what changes in place)`);
      });
    });
    if (rows && (opts.productFirst || p.product_first === true)) {
      if (product / rows < 0.6) g11.push(`show-off-product: ${product} of ${rows} shows are built from the product UI or the actor (60% at least on a product film): the type and the object may not carry the film`);
    }
    if (rows) {
      if (!touch) warnings.push("no-touch: no show has the words and the UI touching (use verbs like through, splits, strikes, pushes, wraps, rides, under, across, into)");
      if (!swap) warnings.push("no-swap: no show changes a line in place (swap, becomes, turns into, changes to)");
    }
    if (strict) gate("G11", "Every line shows (a motion that means the line, built from the product UI or the film's one actor, words and UI touching)", g11, { rows, product_or_actor: product });
    else for (const r of g11) warnings.push(r);
  }

  // G12: viewer first (references/script.md pass 0, "the viewer's day first"): launch / promo films and every pas pitch. The film is
  // about the viewer: second person early, the reveal not before 20% (pas), a benefit per benefit/rung beat, proof, a concrete cta, one line per 1.5-2.5 s.
  if (opts.viewerFirst || (shapeOf(p, beats) === "pas" && !opts.footageLed)) {
    const g12 = [];
    const shape12 = shapeOf(p, beats);
    const roles12 = beats.map((b, i) => lfRole(b, i, beats.length, null));
    const wc = (x) => String(x || "").trim().split(/\s+/).filter(Boolean).length;
    const VIEWER_RE = /\b(you|your|yours|yourself|you're|you'll|you've|you'd)\b|\bI\b|\b(my|me)\b/i;
    const VIEWER_VERBS = new Set("get gets save saves stop stops never skip skips see know find finds reply replies close closes win wins keep catch catches finish ship ships ask send read hear spend spare clear clears answer answers sort sorts go do make plan book decide miss no".split(" "));
    const hasViewerLanguage = (t) => VIEWER_RE.test(t) || nz8(t).split(" ").some((w) => VIEWER_VERBS.has(w));
    // the on-screen lines: one per shows row, else one per beat's on_screen
    const rows = [];
    beats.forEach((b, i) => {
      const sr = Array.isArray(b.shows) ? b.shows.filter((r) => r && typeof r === "object" && String(r.line || "").trim()) : [];
      if (sr.length) sr.forEach((r) => rows.push({ text: String(r.line), i, claim: r.claim }));
      else if (String(b.on_screen || "").trim()) rows.push({ text: String(b.on_screen), i });
    });
    const early = beats.map((b, i) => ({ b, i })).filter(({ i }) => starts[i] < 0.25 * lengthS);
    const earlyText = [...early.map(({ b }) => String(b.on_screen || "")), ...rows.filter((r) => starts[r.i] < 0.25 * lengthS).map((r) => r.text)];
    if (!earlyText.some((t) => VIEWER_RE.test(t))) g12.push("not-viewer-first: no on-screen line in the first 25% of the film addresses the viewer (you, your, you're, or a first-person viewer line like \"I ...\"): open on the viewer's own day, not on the product");
    const meet = roles12.indexOf("meet");
    if (shape12 === "pas" && meet >= 0 && starts[meet] / lengthS < 0.2 - 1e-9) warnings.push(`reveal-early (craft note, not a gate since Plan 03): the meet beat starts at ${Math.round((starts[meet] / lengthS) * 100)}% of the film; fine when the early product serves the claim, otherwise let the viewer's pain land first`);
    const bnf = beats.map((b, i) => ({ b, i })).filter(({ i }) => roles12[i] === "benefit" || roles12[i] === "rung");
    for (const { b, i } of bnf) {
      const t = String(b.benefit || "").trim();
      if (!t) g12.push(`no-benefit: beat ${i + 1} "${b.name || ""}" has no benefit (what the viewer gains, 12 words at most, in viewer language)`);
      else if (wc(t) > 12) g12.push(`no-benefit: beat ${i + 1} "${b.name || ""}" benefit is ${wc(t)} words (12 at most)`);
      else if (!hasViewerLanguage(t)) g12.push(`no-benefit: beat ${i + 1} "${b.name || ""}" benefit "${t}" is not in viewer language (say what YOU get: contains you / your or a verb the viewer does)`);
    }
    // proof: a proof beat (pas), pitch.proof, or a beat / line that carries a claim id
    const claims = opts.claims || null;
    const proofClaims = claims ? claims.filter((c) => PROOF_CLAIM_RE.test(c.text)) : [];
    const claimIds = [p.proof && typeof p.proof === "object" ? p.proof.claim : null, ...beats.map((b) => b.claim), ...rows.map((r) => r.claim)].filter((x) => x != null && String(x).trim()).map(String);
    const pp = p.proof && typeof p.proof === "object" ? p.proof : null;
    const hasProof = !!(pp && String(pp.line || "").trim()) || claimIds.length > 0 || (shape12 === "pas" && roles12.includes("proof"));
    if (!hasProof) {
      if (proofClaims.length) g12.push(`no-proof: the film has no proof (pitch.proof { line, claim }, or a proof beat / line carrying a claim id) and research/claims.json has ${proofClaims.length} claim(s) a viewer can believe (first: "${proofClaims[0].text.slice(0, 70)}" [${proofClaims[0].id}])`);
      else warnings.push(claims ? "no-proof: the film has no proof and research/claims.json holds no number, adoption, rating or named-customer claim: find one in research, or say the film has none" : "no-proof: the film has no proof (pitch.proof { line, claim }) and no research/claims.json was found to check it against (--claims)");
    } else if (claims && claimIds.length) {
      const unknown = claimIds.filter((id) => !claims.some((c) => c.id === id));
      if (unknown.length) warnings.push(`no-proof: claim id(s) ${unknown.join(", ")} are not in research/claims.json`);
    }
    // cta: a concrete action (verb) and where (URL, app, place)
    const cta = p.cta && typeof p.cta === "object" ? p.cta : null;
    const VAGUE = /^\s*(learn more|find out more|discover|explore|check (it|us) out|see more|click here|read more|get started)\s*\.?\s*$/i;
    if (!cta) g12.push("weak-cta: pitch.cta { line, action, where } missing (a concrete verb and where: \"Join the waitlist\", \"kinso.example/waitlist\")");
    else {
      const act = String(cta.action || "").trim(), where = String(cta.where || "").trim();
      if (!String(cta.line || "").trim()) g12.push("weak-cta: cta.line missing (the words on the end card)");
      if (!act || !/^[a-z]+/i.test(act) || VAGUE.test(act)) g12.push(`weak-cta: cta.action "${act}" is not a concrete verb (Join, Download, Start, Book ...)`);
      if (!where || !(/\w\.\w{2,}|https?:|\/|@/.test(where) || /\b(app store|play store|testflight|download|booth|stand|store|in the app|hall|room|stage|inbox)\b/i.test(where))) g12.push(`weak-cta: cta.where "${where}" names no URL, app or place`);
    }
    // density: one line per 1.5-2.5 s
    const secPerLine = rows.length ? lengthS / rows.length : null;
    if (secPerLine != null && secPerLine > 3.0 + 1e-9) g12.push(`sparse-lines: ${r1d(lengthS)} s over ${rows.length} on-screen line(s) is ${r1d(secPerLine)} s per line (3.0 at most; aim one line per 1.5-2.5 s, write the lines as shows rows)`);
    // warnings: slogan copy, toy demos
    const PRON = /\b(you|your|yours|you're|i|my|me|we|our|us|it|they|them|he|she)\b/i;
    const VERBISH = /\b(is|are|was|be|am|has|have|had|do|does|did|can|could|will|would|let|lets|get|got|make|makes|meet|join|try|start|stop|ask|send|read|find|see|know|need|want|take|give|keep|save|run|open|close|reply|solve|ship|win|build|write|check|book|buy|use|go|come|look|show|say|tell|think|feel|work|move|drag|tap|play|click|type|press|swipe|plan|pick|choose|sort|clear|catch|miss|spend|wait|watch|share|turn|bring|help|call|pay|fix|stay|put|set|add|drop|pull|push|hold|follow|land|grow|learn|love|hate|break|wake)\b|\w+(ing|ed)\b/i;
    const lineTexts = rows.map((r) => r.text);
    const slogan = lineTexts.filter((t) => !PRON.test(t) && !VERBISH.test(t)).length;
    if (lineTexts.length >= 4 && slogan / lineTexts.length > 0.6) warnings.push(`slogan-copy: ${slogan} of ${lineTexts.length} lines have no verb and no pronoun (noun-phrase slogans): talk to the viewer in sentences (you, questions, reactions)`);
    const uses = beats.filter((b) => String(b.use || "").trim());
    const LIFE_RE = /\b(inbox|morning|monday|friday|deal|boss|clients?|customers?|team|meeting|deadline|commute|weekend|family|kids?|night|\d+ ?(am|pm)|late|day|days|week|hours?|minutes?|before|while|when|every ?day|work|school|trip|home|office|invoice|launch|travel|inbox|chats?|threads?|messages?|tabs)\b|\d/i;
    if (uses.length && bnf.length && !bnf.some(({ b }) => LIFE_RE.test(String(b.benefit || "")))) warnings.push("toy-demos: every use is a demo and no benefit names a moment the viewer knows (a day, a deadline, a moment): tie each demo to a real moment, a different one per beat, and for a universal claim a moment most of the audience has had");
    // each benefit's moment is a different one: the same situation twice is one persona's day, not the claim's range
    const LIFE_G = new RegExp(LIFE_RE.source, "gi");
    const sit = bnf.map(({ b, i }) => ({ i, w: [...new Set((String(b.benefit || "").match(LIFE_G) || []).map((x) => x.toLowerCase()).filter((x) => !/^\d|^(before|while|when|day|days|week|hours?|minutes?|late)$/.test(x)))] }));
    for (let a = 0; a < sit.length; a++) for (let c = a + 1; c < sit.length; c++) { const same = sit[a].w.find((w) => sit[c].w.includes(w)); if (same) { warnings.push(`same-situation: benefits ${sit[a].i + 1} and ${sit[c].i + 1} both name "${same}": each benefit is a different moment of life, never one persona's day twice`); break; } }
    // headline critic: every on-screen line is the viewer's voice, a felt moment or a payoff, never a feature label
    {
      const closeRoles = new Set(["close", "cta", "proof", "end"]);
      const hl = rows.filter((r) => !closeRoles.has(roles12[r.i]) && String(beats[r.i].role || "").toLowerCase() !== "cta");
      const labels = hl.filter((r) => featureLabelOf(r.text));
      if (labels.length >= 2 && labels.length / Math.max(1, hl.length) >= 0.34) g12.push(`feature-label-headlines: ${labels.length} of ${hl.length} on-screen lines name a feature, not a moment (${labels.slice(0, 3).map((r) => `beat ${r.i + 1} "${r.text}"`).join("; ")}): write each as the viewer's own voice, a felt moment, or a payoff ("I know what I meant. Why does it sound wrong?"), never "Get the why" / "Write the better word"`);
      else if (labels.length) warnings.push(`feature-label-headline: ${labels.map((r) => `beat ${r.i + 1} "${r.text}"`).join("; ")} reads as a feature label: make it the viewer's voice, a felt moment, or a payoff`);
    }
    // callback: the human situation that opens the film returns at the payoff, with the person, resolved
    if (beats.length >= 3 && !opts.footageLed) {
      const cb = p.callback && typeof p.callback === "object" ? p.callback : null;
      const productWords = cbWords(String((truth && (truth.product || truth.name)) || p.product || ""));
      const openTxt = cb && String(cb.opening || "").trim() ? String(cb.opening) : beatBlob(beats[0]) + " " + (starts[1] < 0.2 * lengthS ? beatBlob(beats[1]) : "");
      const payIdx = beats.map((b, i) => i).filter((i) => starts[i] >= 0.7 * lengthS - 1e-9 || i >= beats.length - 2);
      const payTxt = cb && String(cb.payoff || "").trim() ? String(cb.payoff) : payIdx.map((i) => beatBlob(beats[i])).join(" ");
      const ow = [...cbWords(openTxt)].filter((w) => !productWords.has(w)), pw = cbWords(payTxt);
      if (!PERSON_RE.test(openTxt) || !/\b(situation|moment|meeting|call|room|desk|inbox|stumbl|freez|stuck|blank|can't|couldn't|trying|tries|try|wait|late|when|while|before|every)\b/i.test(openTxt)) g12.push("callback-open: the film does not open on a human situation (a person in a moment: who, where, what goes wrong); open on the viewer's own moment before any product");
      else if (!PERSON_RE.test(payTxt) || !ow.some((w) => pw.has(w))) g12.push(`callback-missing: the opening situation does not return at the payoff with the person, resolved (opening words: ${ow.slice(0, 6).join(", ")}); the last beats must show the same person in the same kind of moment, now going well (pitch.callback { opening, payoff, resolved }); a waveform, a card or the logo alone is not a callback`);
      else if (cb && !String(cb.resolved || "").trim()) warnings.push("callback: pitch.callback.resolved missing (one line: how the opening moment ends differently)");
    }
    gate("G12", "Viewer first (second person early, the reveal after the pain, a benefit per use, proof, a concrete cta, one line per 1.5-2.5 s)", g12, { shape: shape12, lines: rows.length, seconds_per_line: secPerLine == null ? null : r1d(secPerLine), proof: hasProof });
  }

  // G14: the pitch conforms to its slot in story/plan.json (the planner chose the device, the turn kind, the peak kind and the claims this script owns)
  if (opts.plan) {
    const g14 = [];
    const slot = (opts.plan.slots || []).find((x) => x.label === p.label);
    if (!slot) g14.push(`plan-slot: no slot "${p.label || ""}" in plan.json (${(opts.plan.slots || []).map((x) => x.label).join(", ")})`);
    else {
      if (slot.device != null && deviceIds[0] !== slot.device) g14.push(`plan-device: the pitch's device is "${deviceIds[0]}", the plan gives "${slot.device}"`);
      const sh = norm(p.shape).trim() || shapeOf(p, beats), en = String(p.engine || ENGINE_OF_SHAPE[shapeOf(p, beats)] || "");
      if (slot.shape && sh !== slot.shape) g14.push(`plan-shape: the pitch's shape is "${sh}", the plan gives "${slot.shape}"`);
      if (slot.engine && en !== slot.engine) g14.push(`plan-engine: the pitch's engine is "${en}", the plan gives "${slot.engine}"`);
      if (slot.turn_kind && p.turn_kind !== slot.turn_kind) g14.push(`plan-turn-kind: the pitch declares ${p.turn_kind ? `"${p.turn_kind}"` : "no turn_kind"}, the plan gives "${slot.turn_kind}"`);
      if (slot.peak_kind && p.peak_kind !== slot.peak_kind) g14.push(`plan-peak-kind: the pitch declares ${p.peak_kind ? `"${p.peak_kind}"` : "no peak_kind"}, the plan gives "${slot.peak_kind}"`);
      if (slot.hook_kind && p.hook_kind !== slot.hook_kind) warnings.push(`plan-hook-kind: the pitch declares ${p.hook_kind ? `"${p.hook_kind}"` : "no hook_kind"}, the plan gives "${slot.hook_kind}"`);
      const rows = Array.isArray(p.coverage) ? p.coverage : [];
      for (const c of slot.owned_claims || []) if (!rows.some((r) => r && r.cut == null && Number(r.beat) >= 1 && String(r.claim).toLowerCase() === String(c).toLowerCase())) g14.push(`plan-claims: the plan gives this script the claim ${c}: it needs a coverage row { claim: "${c}", beat: N } on a beat (a cut is not allowed)`);
    }
    gate("G14", "Plan (this pitch fills its slot in story/plan.json)", g14, { slot: slot ? slot.label : null });
  }

  // G15: the coverage map (pitch.coverage): every Must-show feature and every claim in the truth sheet's Surprising facts is on a beat, or cut with a reason
  if (truth && (opts.productFirst || p.product_first === true)) {
    const g15 = [];
    const rows = Array.isArray(p.coverage) ? p.coverage.filter((r) => r && typeof r === "object") : [];
    const missing = requiredCoverage(truth).filter((req) => !rows.some((r) => covMatch(r, req)));
    if (missing.length) g15.push(`coverage-missing: no coverage row for ${missing.map(covName).join(", ")} (pitch.coverage: { claim | feature, beat } or { claim | feature, cut: "<reason, 4+ words>" })`);
    rows.forEach((r, i) => {
      if (r.beat != null && !(Number.isInteger(Number(r.beat)) && Number(r.beat) >= 1 && Number(r.beat) <= beats.length)) g15.push(`coverage-beat: coverage[${i}] ${covName(r)} names beat ${r.beat}; this script has beats 1-${beats.length}`);
      if (r.cut != null && wordsN(r.cut) < 4) g15.push(`coverage-cut: coverage[${i}] ${covName(r)} is cut with "${r.cut}": a cut needs a reason of 4+ words`);
      if (r.beat == null && r.cut == null) g15.push(`coverage-beat: coverage[${i}] ${covName(r)} has neither a beat nor a cut`);
    });
    gate("G15", "Coverage (every must-show feature and surprising fact is on a beat or cut with a reason)", g15, { rows: rows.length });
  }

  // scores: self-assessed, then adjusted by rule
  const self = Object.fromEntries(DIMS.map((k) => [k, Number(scores[k])]));
  const adj = { ...self };
  const adjustments = [];
  const bump = (k, v, why) => { adj[k] += v; adjustments.push(`${v > 0 ? "+" : ""}${v} ${k}: ${why}`); };
  if (devices.some((d) => d && d.overused)) {
    // Plan 03: a twist is an optional tool, not a requirement; an overused device is a warning to justify, not a penalty
    if (!String(p.twist || "").trim()) warnings.push(`${devices.find((d) => d.overused).name} is an often-used device: say in device_reason why it serves this proposition (a twist is one optional way)`);
    else warnings.push(`overused device with a twist ("${p.twist}"): make sure the twist is the idea, not decoration`);
  }
  if (p.form_proves_claim === true) bump("originality", +1, "the form itself proves the claim");
  if (vis.length) bump("fit", -vis.length, `visual cliche${vis.length > 1 ? "s" : ""}: ${vis.join(", ")}`);
  if (turnIdx < 0 && (p.turn || p.engine)) bump("memorability", -1, "the pitch declares a turn or an engine but no beat is marked turn: true"); // a turn is optional (Plan 03); a declared one must be findable
  const featCap = Math.min(5, dev.build.score + 1);
  if (adj.feasibility > featCap) bump("feasibility", featCap - adj.feasibility, `${dev.name} is buildability ${dev.build.score}/5; self-score capped at ${featCap}`);
  if (order >= 3 && adj.originality > 3) bump("originality", 3 - adj.originality, `${order} default beats in order: originality capped at 3`);
  if (!gates.find((g) => g.id === "G3").pass && adj.clarity > 2) bump("clarity", 2 - adj.clarity, "the device isn't clear by second 4");
  for (const k of DIMS) adj[k] = Math.max(1, Math.min(5, adj[k]));
  // originality and memorability carry the most weight: a safe, clear script that nobody retells is the failure this scorer exists to catch
  const W = { originality: 0.3, memorability: 0.25, clarity: 0.15, fit: 0.15, feasibility: 0.15 };
  // ladder / feature-list shape: product cards must not be the whole film (the person and the situation carry it)
  if (ladderCardsOnly) { warnings.push("ladder-cards-only: every beat is a product rung and no beat shows a person in a situation: open on the human moment (a person, a place, the thing they stumble on) and return to them at the close; the cards are the answer, not the film"); bump("memorability", -1, "a ladder of product cards with no person or situation carrying the story"); }
  const total = Math.round(DIMS.reduce((s, k) => s + W[k] * adj[k], 0) * 100) / 100;
  const low = DIMS.filter((k) => adj[k] < 3);

  // the intent sheet (story/intent-<Label>.json beside the pitch: the engine, the turn, the beats' buys / relation / importance): its findings are warnings here
  // (uncalibrated; crew.mjs check --role script-writer makes the errors block)
  if (opts.intent) {
    if (!opts.intent.sheet) warnings.push("intent-missing: story/intent-<Label>.json (the argument written first: proposition, engine + turn, ending_first, beats with buys / relation / importance)");
    else { for (const e of opts.intent.errors) warnings.push(`intent: ${e}`); for (const e of opts.intent.warnings) warnings.push(`intent: ${e}`); }
  }

  // the plot engine's turn (REBUILD 2): stated in the pitch, it must reverse something, the turn beat is a "but" and the payoff answers the setup. Uncalibrated: warnings.
  {
    const engine = String(p.engine || "").trim() || ENGINE_OF_SHAPE[shapeOf(p, beats)] || "";
    const t = p.turn && typeof p.turn === "object" ? p.turn : null;
    if (engine === "problem-turn") warnings.push('engine "problem-turn": the engine is named "reversal"');
    else if (engine && !ENGINES[engine]) warnings.push(`engine "${engine}": use ${Object.keys(ENGINES).join(" | ")}`);
    if (p.engine && ENGINE_OF_SHAPE[shapeOf(p, beats)] && ENGINE_OF_SHAPE[shapeOf(p, beats)] !== (engine === "problem-turn" ? "reversal" : engine)) warnings.push(`engine ${engine} does not match the shape "${shapeOf(p, beats)}" (its engine is ${ENGINE_OF_SHAPE[shapeOf(p, beats)]}): change one`);
    if (!t && p.engine) warnings.push(`turn: missing pitch.turn { line, reverses, payoff }${engine ? ` (the ${engine} engine has a turn)` : ""}: one line naming what flips and what answers the setup`);
    else {
      if (!String(t.line || "").trim()) warnings.push("turn.line: missing (the one line where the story turns)");
      if (!String(t.reverses || "").trim()) warnings.push("turn.reverses: missing (what flips: a belief, a situation, an object); a turn that reverses nothing is not a turn");
      if (!String(t.payoff || "").trim()) warnings.push("turn.payoff: missing (what the ending does that answers the setup)");
      else {
        const setup = new Set(nz8([p.logline, ...beats.slice(0, 2).map(beatText)].join(" ")).split(" ").filter((w) => w.length > 3));
        if (!nz8(t.payoff).split(" ").some((w) => setup.has(w))) warnings.push("turn.payoff shares no word with the setup: a payoff that does not answer the setup reads as a new idea");
      }
    }
    if (engine === "refrain-break" && turnIdx >= 0 && (turnAt < 0.55 || turnAt > 0.8)) warnings.push(`turn-place: refrain-break: the break lands at ${Math.round(turnAt * 100)}% (60-75%)`);
    if (engine === "reversal" && turnIdx >= 0 && (turnAt < 0.15 || turnAt > 0.8)) warnings.push(`turn-place: reversal: the turn lands at ${Math.round(turnAt * 100)}% (the product arrives after the pain: 15-45% for a long setup, never after the peak)`);
    const I = opts.intent && opts.intent.data;
    if (I && Array.isArray(I.beats) && I.beats.length === beats.length && turnIdx >= 0) {
      if (String(I.beats[turnIdx].relation || "").toLowerCase() !== "but") warnings.push(`turn-not-but: the turn beat (${turnIdx + 1}) has relation "${I.beats[turnIdx].relation}" in the intent sheet: a turn is a "but"`);
      const pk = I.beats.findIndex((b) => b.peak === true), pay = I.beats.map((b) => String(b.relation || "").toLowerCase()).lastIndexOf("answer");
      if (pk >= 0 && pay < pk) warnings.push("payoff-not-answer: no \"answer\" beat at or after the peak in the intent sheet: the payoff must answer the setup");
      if (engine === "refrain-break" && pk >= 0 && turnIdx !== pk) warnings.push("turn-place: refrain-break: the turn beat IS the peak (the break in the pattern)");
      if (engine === "before-after" && pk >= 0 && turnIdx >= pk) warnings.push("turn-place: before-after: the turn (the cause made visible) comes before the peak");
    }
  }

  // the eight self-critique prompts
  const CRIT = { retell: "The party retell: \"It's the one where...\"", first_4s: "What does second 0-4 show?", turn: "What's the turn and when does it land?", own_material: "What's made of the product's own material?", swap: "Swap test result?", second_reading: "What's the hostile second reading?", default_beats: "Which of the 8 default beats does it contain?", hardest_shot: "What's the single hardest shot to build, and how?" };
  const crit = p.critique || {};
  const unanswered = Object.keys(CRIT).filter((k) => !String(crit[k] || "").trim());
  if (unanswered.length) warnings.push(`self-critique unanswered: ${unanswered.map((k) => CRIT[k]).join(" | ")}`);

  const failedGates = gates.filter((g) => !g.pass);
  const reasons = [...failedGates.map((g) => `${g.id} ${g.gate}: ${g.reasons.join("; ")}`)];
  if (total < 3.8) reasons.push(`score ${total} < 3.8`);
  if (low.length) reasons.push(`dimension${low.length > 1 ? "s" : ""} below 3: ${low.map((k) => `${k} ${adj[k]}`).join(", ")}`);
  const ship = !reasons.length;
  return {
    pitch: name,
    label: p.label || null,
    device: devices.filter(Boolean).map((d) => d.id),
    ok: ship,
    verdict: ship ? "ship" : "rewrite",
    reasons,
    gates,
    scores: { self, adjusted: adj, adjustments, weights: W, total, threshold: 3.8 },
    turn: turnIdx >= 0 ? { beat: turnIdx + 1, at_s: starts[turnIdx], at_pct: Math.round(turnAt * 100) } : null,
    length_s: lengthS,
    script,
    sketch_frames: {
      opening: { beat: 1, at_s: 0, caption: beats[0].on_screen || beats[0].name },
      turn: turnIdx >= 0 ? { beat: turnIdx + 1, at_s: starts[turnIdx], caption: beats[turnIdx].on_screen || beats[turnIdx].name } : null,
      close: { beat: beats.length, at_s: starts[beats.length - 1], caption: beats[beats.length - 1].on_screen || beats[beats.length - 1].name },
    },
    warnings,
    rewrite: ship ? undefined : "Push, in order: a more specific artifact from the truth sheet -> a sharper turn -> a stricter constraint. Two rewrites at most, then replace the device with the next candidate from pick.",
  };
}

// research/claims.json (an array or { claims: [] } of { id?, claim, source }): --claims, else <truth dir>/../research/claims.json; null when there is none
function loadClaims(c, truthPath) {
  const cands = [];
  if (c && c !== true) cands.push(path.resolve(String(c)));
  else if (truthPath && truthPath !== true) cands.push(path.resolve(path.dirname(String(truthPath)), "..", "research", "claims.json"));
  for (const f of cands) {
    if (!fs.existsSync(f)) { if (c && c !== true) die(`--claims not found: ${f}`); continue; }
    let j; try { j = readJSON(f); } catch (e) { die(`claims are not valid JSON: ${e.message}`); }
    const l = Array.isArray(j) ? j : Array.isArray(j.claims) ? j.claims : [];
    return l.map((x, i) => (typeof x === "string" ? { claim: x } : x)).map((x, i) => ({ ...x, id: String(x.id || `c${i + 1}`), text: String(x.claim || x.text || "") }));
  }
  return null;
}

// the brand film's measured tempo (brandfilm.mjs measure: grammar.json .measured.tempo, or a FILM-STYLE.json with .measured)
function loadBrandTempo(p) {
  if (!p || p === true) return null;
  let j; try { j = readJSON(path.resolve(String(p))); } catch (e) { die(`--brand-film is not readable JSON: ${e.message}`); }
  const t = (j.measured && j.measured.tempo) || j.tempo;
  return t && Number(t.changeEveryS) > 0 ? { changeEveryS: Number(t.changeEveryS), longestHoldS: Number(t.longestHoldS) || 0 } : null;
}

function checkPortfolio(pitches, results, opts = {}) {
  const reasons = [];
  const warnings = [];
  // the collapse test (S1 E.5): two scripts whose dominant scenario is the same situation are one film in two costumes; the later one is re-rolled
  const g13 = results.map((r) => (r.gates || []).find((g) => g.id === "G13") || null);
  for (let i = 0; i < g13.length; i++) for (let j = i + 1; j < g13.length; j++) {
    const a = g13[i], b = g13[j];
    if (!a || !b || !(a.S_max > 0.25 && b.S_max > 0.25)) continue;
    const common = (a.scenario_words || []).filter((w) => (b.scenario_words || []).includes(w));
    if (common.length >= 2) reasons.push(`collapse: "${pitches[i].title || i + 1}" and "${pitches[j].title || j + 1}" spend over 25% of their runtime on the same scenario ("${common.slice(0, 4).join("\", \"")}"): re-roll "${pitches[j].title || j + 1}" from the unused use moments`);
  }
  const tk = pitches.map((p) => nz8(p.aim && p.aim.takeaway));
  for (let i = 0; i < tk.length; i++) for (let j = i + 1; j < tk.length; j++) if (tk[i] && tk[i] === tk[j]) warnings.push(`"${pitches[i].title || i + 1}" and "${pitches[j].title || j + 1}" share the same takeaway: each story should aim at something different`);
  const ds = pitches.map((p) => findDevice(Array.isArray(p.device) ? p.device[0] : p.device)).filter(Boolean);
  for (let i = 0; i < ds.length; i++)
    for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i], b = ds[j];
      const pa = pitches[i].title || a.id, pb = pitches[j].title || b.id;
      if (a.family === b.family) reasons.push(`"${pa}" and "${pb}" share the ${a.family} family`);
      if (!opts.productFirst && a.axes.protagonist === b.axes.protagonist && a.axes.turn === b.axes.turn) reasons.push(`"${pa}" and "${pb}" share protagonist and turn type`);
      if (a.axes.visual_world === b.axes.visual_world) reasons.push(`"${pa}" and "${pb}" share the ${a.axes.visual_world} visual world`);
      if (distance(a, b) < (opts.productFirst ? 4 : 5)) reasons.push(`"${pa}" and "${pb}" differ on ${distance(a, b)} of 7 axes (${opts.productFirst ? 4 : 5} required)`);
      const ia = norm(pitches[i].signature_image), ib = norm(pitches[j].signature_image);
      if (ia && ia === ib) reasons.push(`"${pa}" and "${pb}" share a signature image`);
    }
  // airtight: no line, peak kind, turn kind or coverage order shared between scripts, and nothing the brief asked for dropped by all of them
  const nm = (p, i) => `"${p.title || p.label || i + 1}"`;
  const lineSet = (p) => new Set((p.beats || []).flatMap((b) => [String(b.on_screen || ""), ...linesOf(b)]).map(nz8).filter((l) => l.split(" ").filter(Boolean).length >= 2));
  const lines = pitches.map(lineSet);
  for (let i = 0; i < pitches.length; i++) for (let j = i + 1; j < pitches.length; j++) {
    const common = [...lines[i]].filter((l) => lines[j].has(l));
    for (const l of common) reasons.push(`shared-line: the on-screen line "${l}" is in ${nm(pitches[i], i)} and ${nm(pitches[j], j)}: every script says its own lines`);
    for (const [k, code] of [["peak_kind", "shared-peak-kind"], ["turn_kind", "shared-turn-kind"]]) if (pitches[i][k] && pitches[i][k] === pitches[j][k]) reasons.push(`${code}: ${nm(pitches[i], i)} and ${nm(pitches[j], j)} both declare ${k} "${pitches[i][k]}"`);
  }
  for (let i = 0; i < pitches.length; i++) for (let j = i + 1; j < pitches.length; j++) if (pitches[i].hook_kind && pitches[i].hook_kind === pitches[j].hook_kind) warnings.push(`shared-hook-kind: ${nm(pitches[i], i)} and ${nm(pitches[j], j)} both open with hook_kind "${pitches[i].hook_kind}"`);
  const seqs = pitches.map(coverageSeq);
  const sameOrder = [];
  for (let i = 0; i < pitches.length; i++) for (let j = i + 1; j < pitches.length; j++) if (seqs[i].length >= 3 && seqs[j].length >= 3 && lcsLen(seqs[i], seqs[j]) >= 3) { sameOrder.push([i, j]); reasons.push(`same-order: ${nm(pitches[i], i)} and ${nm(pitches[j], j)} cover the brief's claims and features in the same order (3+ in a row): reorder one`); }
  if (pitches.length >= 3 && sameOrder.length === (pitches.length * (pitches.length - 1)) / 2) reasons.push("cliche-order: all three scripts cover the claims and features in the same order: that order is the cliche version's");
  if (opts.truth && pitches.length > 1) {
    const cuts = ((opts.plan && opts.plan.coverage) || []).filter((r) => r && r.cut != null && wordsN(r.cut) >= 4);
    for (const req of requiredCoverage(opts.truth)) {
      const shown = pitches.some((p) => (p.coverage || []).some((r) => r && r.cut == null && r.beat != null && covMatch(r, req)));
      if (!shown && !cuts.some((r) => covMatch(r, req))) reasons.push(`coverage-dropped: ${covName(req)} is on no beat of any script and the plan does not cut it with a reason`);
    }
  }
  if (opts.truth && opts.plan && pitches.length > 1) {
    const cl = clausesOf(opts.truth);
    const shownBy = pitches.map((p) => clausesShown(cl, p.beats || []));
    cl.forEach((c, k) => { if (!shownBy.some((x) => x.has(k))) reasons.push(`clause-dropped: the promise clause "${c}" is shown by no script (set clause: ${k} on the use beat of the script that owns it)`); });
  }
  // range vs honesty: at most one waiver per set, and the set's union of areas of life meets the claim scope's D threshold
  const wv = g13.map((g, i) => (g && g.waiver ? i : -1)).filter((i) => i >= 0);
  if (wv.length > 1) reasons.push(`waiver-count: ${wv.map((i) => nm(pitches[i], i)).join(" and ")} each declare a scope_waiver: at most one script per set may show a narrower range`);
  if (wv.length) {
    const minD = Math.max(0, ...g13.map((g) => (g && g.min_D) || 0));
    const union = [...new Set(g13.flatMap((g) => (g && g.domains) || []))];
    if (minD && union.length < minD) reasons.push(`range-short: with a scope_waiver the set's scripts together show ${union.length} area(s) of life (${union.join(", ") || "none"}), ${minD} needed: another script must carry the areas the waived one drops`);
  }
  const adj = results.filter((r) => r.scores).map((r) => r.scores.adjusted);
  if (pitches.length >= 3) {
    if (!adj.some((s) => s.originality >= 4)) reasons.push("no pitch scores 4+ on originality (the brave one)");
    if (!adj.some((s) => s.feasibility >= 4)) reasons.push("no pitch scores 4+ on feasibility (the sure one)");
    const labels = pitches.map((p) => p.label).filter(Boolean);
    if (labels.length && new Set(labels).size !== labels.length) reasons.push(`labels repeat: ${labels.join(", ")}`);
  }
  return { pass: !reasons.length, reasons, warnings: warnings.length ? warnings : undefined };
}
