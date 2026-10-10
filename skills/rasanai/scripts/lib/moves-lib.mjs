// The Moves pass, the checks. Zero dependencies (Node >= 20). Used by scripts/moves.mjs and scripts/crew.mjs.
// The method is references/moves.md; the files are story/moves-<L>.json (the move-inventor's) and
// story/moves-verdict.json (the move-juror's).
//
//   isLabelOnly(text)        true when the text names a technique and nothing else ("match cut to scene 3"):
//                            fewer than 3 content words once technique terms and function words are removed
//   contentWords(text)       the words that remain (lower case, letters, 2+ characters)
//   TECHNIQUE_TERMS          seam kinds, entrance types, the term names of references/vocabulary.md and the generic
//                            transition words (cut, wipe, morph, zoom, reveal, fade...)
//   validateMoves(obj, {beats, productFirst, uiLabels, productName, pack})  -> {errors[], warnings[]}
//   validateVerdict(obj, movesByLabel)                                     -> {errors[], warnings[]}
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const MOVE_LABELS = ["Sure", "Bold", "Wild"];
const SEAM_KINDS = ["cut", "match-cut", "shared-element", "carried-object", "flood", "iris", "mask", "push-through", "mask-line", "flat-to-depth", "depth-to-flat", "camera-through", "signature", "whip", "zoom-through", "smash-cut", "dissolve"];
const ENTRANCES = ["mask-rise", "scale-from-origin", "draw-on", "clip-reveal", "cut-in", "type-on", "count-up", "morph", "stream", "slide", "push"];
const GENERIC_TECH = ["transition", "transitions", "cut", "cuts", "wipe", "wipes", "morph", "morphs", "zoom", "zooms", "reveal", "reveals", "fade", "fades", "dissolve", "swipe", "slide", "push", "pan", "tilt", "whip", "iris", "flash", "blur"];
// words that carry no idea: connectives, and the words a label wraps around itself ("scene 3", "the next shot")
const FUNCTION_WORDS = ["to", "into", "onto", "the", "a", "an", "with", "on", "of", "and", "or", "in", "at", "by", "for", "from", "is", "it", "its", "then", "as", "this", "that", "next", "previous", "scene", "scenes", "shot", "shots", "beat", "beats", "frame", "frames", "between", "using", "via", "style", "type", "kind", "effect", "effects", "animation", "animated", "cinematic", "smooth", "smoothly", "seamless", "seamlessly", "nice", "cool"];

// every term name in references/vocabulary.md tables ("Push-in / dolly-in", "Zoom (optical)"), parsed once
let vocabTerms = null;
function vocabularyTerms() {
  if (vocabTerms) return vocabTerms;
  vocabTerms = [];
  try {
    const md = fs.readFileSync(path.join(SKILL_DIR, "references", "vocabulary.md"), "utf8");
    for (const line of md.split("\n")) {
      const m = line.match(/^\|\s*([^|]+?)\s*\|/);
      if (!m || m[1] === "Term" || /^[-\s:]+$/.test(m[1])) continue;
      for (const part of m[1].replace(/\([^)]*\)/g, " ").split("/")) {
        const t = norm(part);
        if (t && t.length >= 3) vocabTerms.push(t);
      }
    }
  } catch {}
  return vocabTerms;
}

const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[‘’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

// phrases (two or more words) are stripped as phrases, longest first; single words as words
let techCache = null;
function technique() {
  if (techCache) return techCache;
  const all = new Set([...SEAM_KINDS, ...ENTRANCES, ...vocabularyTerms()].map(norm).filter(Boolean));
  const phrases = [...all].filter((t) => t.includes(" ")).sort((a, b) => b.length - a.length);
  const singles = new Set([...[...all].filter((t) => !t.includes(" ")), ...GENERIC_TECH, ...FUNCTION_WORDS]);
  techCache = { phrases, singles };
  return techCache;
}
// a read-only view for callers that want to show or test the list
export const TECHNIQUE_TERMS = [...new Set([...SEAM_KINDS, ...ENTRANCES, ...GENERIC_TECH])];

export function contentWords(text) {
  let t = ` ${norm(text)} `;
  const { phrases, singles } = technique();
  for (const p of phrases) t = t.split(` ${p} `).join("  ");
  return t.split(/\s+/).filter((w) => w.length >= 2 && /[a-z]/.test(w) && !singles.has(w));
}
export const isLabelOnly = (text) => contentWords(text).length < 3;

// conceit words that cannot carry a product film (a local copy of story.mjs CONCEIT_RE: story.mjs is a CLI and is not importable)
export const CONCEIT_RE = /\b(museums?|galler(?:y|ies)|exhibit(?:s|ion|ions)?|plinths?|under glass|dioramas?|parables?|fables?|allegor\w*|cover version|invented world|a world where|time capsule|archaeolog\w*|courtroom|trial of|funeral|obituary|eulogy|haunted|safari|odyssey|kingdom|ancient ruins?|natural history)\b/i;

const arr = (v) => (Array.isArray(v) ? v : []);
const CARD_FIELDS = ["frame_a", "move", "frame_b", "bridge", "handoff", "says", "origin"];

const sameIdea = (a, b) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 8 && (x.includes(y) || y.includes(x)));
};

// ---------------------------------------------------------------- a moves file
export function validateMoves(obj, opts = {}) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { errors: ["the moves file is not a JSON object"], warnings };
  const beats = arr(opts.beats);
  const N = beats.length;
  const pf = !!opts.productFirst;
  const filmSeconds = beats.reduce((a, b) => a + (Number(b && b.duration_s) || 0), 0);
  if (!N) E("the pitch has no beats to check the moves against (pass --pitch with a pitch that has beats[])");

  if (str(obj.thesis).split(/\s+/).filter(Boolean).length < 6) E('thesis is missing or short: "This film is about <...>; its one image is <...>" (6 words at least)');
  if (!str(obj.one_image)) E("one_image is missing (the single image the film is about)");

  const atoms = arr(obj.atoms).filter((a) => a && str(a.atom));
  if (atoms.length < 8) E(`atoms: ${atoms.length} (8 at least: the glyphs, nouns, verbs, numbers, names, UI parts and shapes the script is made of)`);
  const mining = arr(obj.mining).filter((m) => m && str(m.atom));
  if (mining.length < 5) E(`mining: ${mining.length} atoms mined (5 at least: what each looks like, has parts of, does, means, is the opposite of, scales to)`);

  // bridges: one per boundary between beats
  const bridges = arr(obj.bridges);
  if (N > 1) {
    if (bridges.length < N - 1) E(`bridges: ${bridges.length} (need one per boundary: ${N - 1})`);
    for (let i = 1; i < N; i++) {
      const b = bridges.find((x) => x && Number(x.from) === i && Number(x.to) === i + 1);
      if (!b) E(`bridges: the boundary ${i}>${i + 1} has no bridge`);
      else if (!str(b.what)) E(`bridges: the ${i}>${i + 1} bridge says nothing in "what"`);
    }
  }
  const car = obj.carrier;
  if (!car || typeof car !== "object" || !str(car.what)) E("carrier is missing (the one shape that travels: carrier.what, why, beats)");
  else {
    const cb = [...new Set(arr(car.beats).map(Number).filter((n) => n >= 1 && (!N || n <= N)))];
    if (N && cb.length / N < 0.5) E(`carrier.beats covers ${cb.length} of ${N} beats (it must carry at least half the film: it is the spine)`);
    if (!str(car.why)) W("carrier.why is empty (say what the carrier means)");
  }

  const obvious = arr(obj.obvious).map(str).filter(Boolean);
  if (arr(obj.obvious).length !== 3 || obvious.length !== 3) E(`obvious: ${arr(obj.obvious).length} entries (exactly 3: the first ideas that come to mind, now banned)`);
  const cands = arr(obj.candidates).filter((c) => c && str(c.title));
  if (cands.length < 20) E(`candidates: ${cands.length} (20 at least: overgenerate, then select)`);
  const bolder = arr(obj.bolder).filter((b) => b && str(b.was) && str(b.now) && str(b.changed));
  if (bolder.length < 8) E(`bolder: ${bolder.length} complete rows (8 at least: each is {was, now, changed}: rewrite the candidates bolder and show what you changed)`);

  // cards
  const cards = arr(obj.cards);
  if (cards.length < 6) E(`cards: ${cards.length} (6 at least)`);
  const ids = new Set();
  cards.forEach((c, i) => {
    const id = c && str(c.id) ? str(c.id) : `#${i + 1}`;
    const at = `card ${id}`;
    if (!c || typeof c !== "object") { E(`${at}: not an object`); return; }
    if (!str(c.id)) E(`card #${i + 1}: no id`);
    else if (ids.has(c.id)) E(`${at}: duplicate id`);
    else ids.add(c.id);
    if (!str(c.title)) E(`${at}: no title`);
    else if (str(c.title).split(/\s+/).length > 6) W(`${at}: the title is over 6 words`);
    for (const f of CARD_FIELDS) if (!str(c[f])) E(`${at}: missing ${f}`);
    if (!c.build || typeof c.build !== "object" || !str(c.build.route)) E(`${at}: missing build.route`);
    if (!c.build || !str(c.build.simplest)) E(`${at}: missing build.simplest (the simplest version that keeps the idea)`);
    if (str(c.move) && isLabelOnly(c.move)) E(`${at}: the move is only a label ("${str(c.move)}"): say what physically happens, to which element, in order`);
    if (str(c.bridge) && isLabelOnly(c.bridge)) E(`${at}: the bridge is only a label ("${str(c.bridge)}"): name the one frame where both states are true and the element in it`);
    if (!/^G\d{1,2}$/.test(str(c.generator))) W(`${at}: generator "${str(c.generator)}" is not G1..G20`);
    for (const o of obvious) if (sameIdea(c.title, o) || sameIdea(c.origin, o)) E(`${at}: repeats the banned obvious idea "${o}"`);
    if (c.beat != null && N && !(Number(c.beat) >= 1 && Number(c.beat) <= N)) E(`${at}: beat ${c.beat} is not a beat of this script (1-${N})`);
    if (pf) {
      const t = [c.title, c.origin, c.move, c.frame_a, c.frame_b, c.bridge, c.says].map(str).join(" . ");
      const m = t.match(CONCEIT_RE);
      if (m) E(`${at}: conceit word "${m[0]}" (a product film is led by the real product: no museums, allegories, invented worlds)`);
    }
  });
  // duplicate mechanisms
  const seen = new Map();
  for (const c of cards) {
    if (!c || !str(c.generator) || !str(c.origin)) continue;
    const k = `${str(c.generator)}|${norm(c.origin)}`;
    if (seen.has(k)) W(`cards ${seen.get(k)} and ${c.id} are the same mechanism (same generator and the same origin)`);
    else seen.set(k, c.id);
  }

  // heroes
  const heroes = arr(obj.heroes).map(str);
  if (heroes.length < 2 || heroes.length > 3) E(`heroes: ${heroes.length} (2 or 3 card ids)`);
  if (new Set(heroes).size !== heroes.length) E("heroes repeats a card id");
  for (const h of heroes) if (!ids.has(h)) E(`heroes: "${h}" is not a card id`);
  for (const h of heroes) {
    const c = cards.find((x) => x && x.id === h);
    if (!c) continue;
    const d = Number(c.duration_s);
    if (!(d > 0)) W(`hero ${h}: duration_s missing (the rough is 1.5 to 4.5 s)`);
    else if (d < 1.5 || d > 4.5) W(`hero ${h}: duration_s ${d} is outside the rough's 1.5 to 4.5 s`);
    if (pf) {
      const o = str(c.origin);
      const labels = arr(opts.uiLabels).map(str).filter((l) => l.length >= 2);
      const product = str(opts.productName);
      const hit = labels.some((l) => o.toLowerCase().includes(l.toLowerCase())) || (product && o.toLowerCase().includes(product.toLowerCase())) || /\b(brand|logo|cursor)\b/i.test(o);
      if (!hit) E(`hero ${h}: on a product film its origin must be a real UI label from the pitch's ui_labels, the product name, or the brand / logo / cursor (origin: "${o.slice(0, 70)}")`);
    }
  }

  // the chain ledger: one row per beat
  const ledger = arr(obj.ledger);
  if (N && ledger.length !== N) E(`ledger: ${ledger.length} rows for ${N} beats (one row per beat)`);
  ledger.forEach((r, i) => {
    const at = `ledger row ${i + 1}`;
    if (!r || typeof r !== "object") { E(`${at}: not an object`); return; }
    if (Number(r.beat) !== i + 1) E(`${at}: beat is ${r.beat} (rows go 1..N in order)`);
    if (!str(r.constant)) E(`${at}: constant is empty (what stays the same across the boundary: position, colour, silhouette, vector)`);
    if (!str(r.bridge)) E(`${at}: bridge is empty${i === ledger.length - 1 ? ' (the last beat may say "end")' : ""}`);
    if (!str(r.carrier_state)) W(`${at}: carrier_state is empty`);
    if (str(r.move) && !/^(null|none|-)$/i.test(str(r.move)) && !ids.has(str(r.move))) E(`${at}: move "${r.move}" is not a card id`);
  });
  for (const h of heroes) if (ids.has(h) && ledger.length && !ledger.some((r) => r && str(r.move) === h)) W(`hero ${h} is in no ledger row's move`);

  // warnings
  const pack = opts.pack;
  if (pack && Array.isArray(pack.exemplars)) {
    for (const c of cards) {
      if (!c) continue;
      const cw = new Set(contentWords(c.title));
      for (const ex of pack.exemplars) {
        const ew = contentWords(ex.title || ex.piece || ex.id || "");
        const common = ew.filter((w) => cw.has(w));
        if (common.length >= 3) { W(`card ${c.id}: its title shares ${common.length} content words (${common.join(", ")}) with the exemplar "${ex.title || ex.piece || ex.id}": invent, don't copy`); break; }
      }
    }
  }
  const puns = bridges.filter((b) => b && /pun/i.test(str(b.shared))).length;
  const budget = Math.max(1, Math.floor(filmSeconds / 10));
  if (puns > budget) W(`puns: ${puns} pun bridges in a ${Math.round(filmSeconds)} s film (${budget} at most: one per 10 s)`);
  return { errors, warnings };
}

// ---------------------------------------------------------------- the juror's verdict
// movesByLabel: {Sure: <moves obj>, Bold: ..., Wild: ...}
export function validateVerdict(obj, movesByLabel = {}) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { errors: ["the verdict is not a JSON object"], warnings };
  const pit = obj.pitches && typeof obj.pitches === "object" ? obj.pitches : null;
  if (!pit) return { errors: ["pitches{} is missing (one entry per label: Sure, Bold, Wild)"], warnings };
  for (const label of MOVE_LABELS) {
    const v = pit[label];
    if (!v || typeof v !== "object") { E(`${label}: missing from pitches{}`); continue; }
    const mv = movesByLabel[label];
    const cardIds = mv ? arr(mv.cards).map((c) => c && c.id).filter(Boolean) : null;
    const judged = arr(v.cards);
    const passed = new Set();
    const judgedIds = new Set();
    judged.forEach((j, i) => {
      if (!j || !str(j.id)) { E(`${label}: judged card #${i + 1} has no id`); return; }
      if (judgedIds.has(j.id)) E(`${label} ${j.id}: judged twice`);
      judgedIds.add(j.id);
      if (cardIds && !cardIds.includes(j.id)) E(`${label} ${j.id}: not a card of moves-${label}.json`);
      if (typeof j.pass !== "boolean") { E(`${label} ${j.id}: pass must be true or false`); return; }
      const fails = arr(j.fails).map(str);
      if (j.pass) {
        passed.add(j.id);
        if (fails.length) E(`${label} ${j.id}: passes but lists fails`);
        if (!str(j.evidence)) W(`${label} ${j.id}: no evidence quoted from the card`);
      } else {
        if (!fails.length || !fails.every((f) => /^G[1-5]\b/i.test(f))) E(`${label} ${j.id}: a fail needs at least one gate id (G1 to G5) in fails[]`);
        if (!str(j.evidence)) E(`${label} ${j.id}: a fail needs evidence (quoted from the card)`);
      }
    });
    if (cardIds) for (const id of cardIds) if (!judgedIds.has(id)) E(`${label}: card ${id} was not judged`);
    const ranking = arr(v.ranking).map(str);
    if (new Set(ranking).size !== ranking.length) E(`${label}: ranking repeats an id`);
    for (const id of ranking) if (!passed.has(id)) E(`${label}: ranking has "${id}", which did not pass (rank only passed cards)`);
    if (passed.size && !ranking.length) E(`${label}: ${passed.size} card(s) passed but the ranking is empty`);
    if (ranking.length) {
      if (str(v.hero) !== ranking[0]) E(`${label}: hero must be ranking[0] ("${ranking[0]}"), not "${str(v.hero)}"`);
      if (!str(v.why)) E(`${label}: why is empty (which concrete frame decided it)`);
    } else if (str(v.hero)) E(`${label}: hero "${v.hero}" with an empty ranking`);
    if (passed.size < 3 && !arr(v.denial).map(str).includes(label)) W(`${label}: only ${passed.size} card(s) passed; list "${label}" in denial[] so the Director runs the denial round`);
  }
  const best = obj.best_overall;
  if (!best || typeof best !== "object") E("best_overall is missing ({label, id, why})");
  else {
    const v = pit[best.label];
    if (!v) E(`best_overall.label "${best.label}" is not a label`);
    else if (!arr(v.ranking).includes(best.id)) E(`best_overall.id "${best.id}" is not in ${best.label}'s ranking`);
    if (!str(best.why)) E("best_overall.why is empty");
  }
  return { errors, warnings };
}
