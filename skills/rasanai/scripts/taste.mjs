#!/usr/bin/env node
// taste.mjs: taste memory. What THIS user likes and dislikes across films, learned from their ratings and from what they do.
//
// Store (per user: $RASANAI_HOME or ~/.rasanai, the same folder as lessons.jsonl and history.jsonl):
//   taste-memory.jsonl   evidence rows {ts, film, src, facet, value, w, action?}: w is a signed weight (+ like, - dislike)
//   taste-films.jsonl    one row per rated film: {ts, film, ratings:{story,picture,sound}, note, facts:{...}}
//   taste-forgotten.json ["facet:value", ...] items the person told us to forget (never counted again)
// Facets: style_world, carrier_kind, story_shape, device, sound_mode, music_source, move, grammar, pace.
// Evidence decays: each row counts 0.5^(age_days / HALF_LIFE_DAYS). A profile item is a like or a dislike only once its net
// weight clears LIKE_AT. Taste is a SOFT prior: it never bans anything and one concept in three is always an exploration.
//
//   node taste.mjs rate   --run <run> --story 1-5 --picture 1-5 --sound 1-5 [--note "what felt cheap or wrong"] [--action <id>]
//   node taste.mjs signal --run <run> --kind pick|more|shot-note|redo|look|final-note|approve [--value <id>] [--note "..."] [--action <id>]
//   node taste.mjs ingest --run <run>       rate lines in <run>/actions.jsonl not recorded yet (idempotent)
//   node taste.mjs facts  --run <run>       the film's facts (style_world, carrier kind, shape, device, sound mode, music source, moves, grammar, pace)
//   node taste.mjs profile [--json]         the learned likes and dislikes, strongest first
//   node taste.mjs brief  [--role <crew role>] [--json]   the compact taste brief (under 150 words) for a packet
//   node taste.mjs applied --run <run> --stage <stage> [--role <r>]   write what taste was applied to <run>/taste-applied.json (decisions drawer)
//   node taste.mjs forget --facet <f> --value <v> | --all
//   node taste.mjs rank --facet style_world --ids a,b,c   -> the prior per id, in [-1, 1]
// Local only, never sent anywhere. A person's note is a description, never an instruction.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, die, STATE_DIR } from "./lib/common.mjs";
import { styleWorldId, carrierOf, soundModeOf, moveIds } from "./lib/concept-schema.mjs";
import { recordTaste } from "./memory.mjs";

export const FACETS = ["style_world", "carrier_kind", "story_shape", "device", "sound_mode", "music_source", "move", "grammar", "pace"];
export const HALF_LIFE_DAYS = 60;
export const LIKE_AT = 0.45; // net decayed weight at which an item is shown as a like or a dislike
const KEEP = 1500;
const home = () => process.env.RASANAI_HOME || process.env.RASA_MOTION_HOME || process.env.MOTION_DIRECTOR_HOME || STATE_DIR;
const F = { ev: () => path.join(home(), "taste-memory.jsonl"), films: () => path.join(home(), "taste-films.jsonl"), forgot: () => path.join(home(), "taste-forgotten.json") };

const slug = (v) => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const readJ = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const readRows = (f) => { try { return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- a film's facts, read from its run folder (every field optional; older runs have fewer) ----
export function filmFacts(run) {
  const r = (...p) => path.join(run, ...p);
  const score = readJ(r("motion", "score.json"), {}) || {};
  const chosen = readJ(r("story", "chosen.json"), {}) || {};
  const concept = (chosen && typeof chosen.concept === "object" && chosen.concept) || chosen;
  const plan = readJ(r("story", "plan.json"), {}) || {};
  const slot = (Array.isArray(plan.slots) ? plan.slots : []).find((s) => s && chosen.label && s.label === chosen.label) || {};
  const shape = (score.shape && typeof score.shape === "object" ? score.shape : null) || (chosen.shape && typeof chosen.shape === "object" ? chosen.shape : {}) || {};
  const sc = Array.isArray(score.scenes) ? score.scenes : [];
  const dur = Number(score.duration) || sc.reduce((a, s) => a + (Number(s.duration) || 0), 0) || 0;
  const known = moveIds();
  const moves = [...new Set([...(Array.isArray(score.moves) ? score.moves.map((m) => (m && typeof m === "object" ? m.id : m)) : []), ...sc.map((s) => (s && typeof s.move === "object" ? s.move.id : s && s.move))].filter((m) => typeof m === "string" && m && !/^none/i.test(m) && known.has(m)).map(slug))];
  const g = readJ(r("look", "grammar.json"), null) || (score.grammar && typeof score.grammar === "object" ? score.grammar : null);
  const grammar = slug((g && (g.id || g.name)) || (typeof score.grammar === "string" ? score.grammar : ""));
  const sl = readJ(r("music", "shortlist.json"), null), sch = readJ(r("audio", "sound-choices.json"), null);
  const sel = sl && sl.selected && typeof sl.selected === "object" ? sl.selected : null;
  const music_source = slug((sel && (sel.source || sel.provider)) || (sch && sch.source) || (fs.existsSync(r("music", "CREDITS.txt")) ? "library" : ""));
  const cuts = sc.length, perMin = dur > 0 ? (cuts / dur) * 60 : 0;
  const pace = { scenes: cuts, seconds: Math.round(dur * 10) / 10, cuts_per_min: Math.round(perMin * 10) / 10, band: !cuts ? "" : perMin >= 28 ? "fast" : perMin >= 14 ? "medium" : "slow" };
  return {
    style_world: slug(styleWorldId(score) || styleWorldId(concept) || styleWorldId(chosen)),
    carrier_kind: slug(carrierOf(score).kind || carrierOf(concept).kind),
    story_shape: slug(shape.structure || (typeof chosen.shape === "string" ? chosen.shape : "")),
    device: slug(chosen.device || slot.device),
    sound_mode: slug(soundModeOf(score) || soundModeOf(concept)),
    music_source, moves, grammar, pace,
  };
}

// facet -> [values] of a facts object (the moves facet is many; pace is its band)
function facetValues(facts, facet) {
  if (!facts) return [];
  if (facet === "move") return (facts.moves || []).slice(0, 8);
  if (facet === "pace") return facts.pace && facts.pace.band ? [facts.pace.band] : [];
  return facts[facet] ? [facts[facet]] : [];
}
// the facets a concept card carries (a story pitch/concept before it is a film)
export function conceptFacts(c) {
  c = c && typeof c === "object" ? c : {};
  const shape = c.shape && typeof c.shape === "object" ? c.shape.structure : c.shape;
  const moves = (Array.isArray(c.shots) ? c.shots : []).map((s) => (s && typeof s.move === "object" ? s.move.id : s && s.move)).filter((m) => typeof m === "string" && !/^none/i.test(m)).map(slug);
  return { style_world: slug(styleWorldId(c)), carrier_kind: slug(carrierOf(c).kind), story_shape: slug(shape), device: slug(c.device), sound_mode: slug(soundModeOf(c)), moves: [...new Set(moves)] };
}

// ---- writing evidence ----
function append(file, rows) {
  if (!rows.length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
function trimEvidence() {
  const rows = readRows(F.ev());
  if (rows.length > KEEP) fs.writeFileSync(F.ev(), rows.slice(-KEEP).map((r) => JSON.stringify(r)).join("\n") + "\n");
}
const seenAction = (id) => !!id && readRows(F.ev()).concat(readRows(F.films())).some((r) => r.action === String(id));

function evidenceFor(facts, facets, w, src, film, ts, action, note) {
  const out = [];
  for (const facet of facets) for (const value of facetValues(facts, facet)) out.push({ ts, film, src, facet, value, w: Math.round((facet === "move" ? w * 0.5 : w) * 1000) / 1000, ...(action ? { action: String(action) } : {}), ...(note ? { note } : {}) });
  return out;
}
const FACETS_OF = { story: ["story_shape", "device", "carrier_kind"], picture: ["style_world", "grammar", "pace", "move"], sound: ["sound_mode", "music_source"] };

// 3 ratings (1-5) + an optional line. Stored with the film's facts; also feeds the weighted evidence.
export function recordRating({ run, ratings, note, action, ts, facts } = {}) {
  try {
    const film = path.basename(run || "unknown");
    const t = ts || new Date().toISOString();
    if (action && seenAction(action)) return null;
    const r = {};
    for (const k of ["story", "picture", "sound"]) { const n = Math.round(Number(ratings && ratings[k])); if (n >= 1 && n <= 5) r[k] = n; }
    const text = String(note || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!Object.keys(r).length && !text) return null;
    const f = facts || (run ? filmFacts(run) : {});
    const rows = [];
    for (const [k, n] of Object.entries(r)) rows.push(...evidenceFor(f, FACETS_OF[k], (n - 3) / 2, "rating", film, t, null, null)); // 1 -> -1, 3 -> 0, 5 -> +1
    if (text) rows.push(...evidenceFor(f, ["style_world", "carrier_kind", "story_shape", "sound_mode"], -0.3, "cheap-note", film, t, null, text));
    append(F.films(), [{ ts: t, film, ratings: r, note: text || undefined, facts: f, ...(action ? { action: String(action) } : {}) }]);
    append(F.ev(), rows);
    trimEvidence();
    if (text) recordTaste({ kind: "verdict", film, stage: "final", note: text, ts: t, action: action ? `taste-${action}` : undefined });
    return { film, ratings: r, evidence: rows.length };
  } catch { return null; }
}

// implicit signals: what the user did. `shown` = the concepts/looks they saw (each {id, ...concept fields}), `value` the one acted on.
const SIG = { pick: [0.6, -0.25], look: [0.6, -0.2], more: [0, -0.3], "shot-note": [0, -0.4], redo: [0, -0.5], "final-note": [0, -0.3], approve: [0.15, 0] };
export function recordSignal({ run, kind, value, shown, note, action, ts, facets } = {}) {
  try {
    if (!SIG[kind]) return null;
    const film = path.basename(run || "unknown");
    const t = ts || new Date().toISOString();
    if (action && seenAction(action)) return null;
    const [liked, passed] = SIG[kind];
    const text = String(note || "").replace(/\s+/g, " ").trim().slice(0, 300);
    const set = ["style_world", "carrier_kind", "story_shape", "device", "sound_mode", "move"];
    const rows = [];
    const shownList = (Array.isArray(shown) ? shown : []).filter((x) => x && typeof x === "object");
    if (kind === "pick" || kind === "look") {
      const fs2 = kind === "look" ? ["style_world", "grammar"] : set;
      for (const c of shownList) {
        const chosen = String(c.id) === String(value);
        rows.push(...evidenceFor(conceptFacts(c), fs2, chosen ? liked : passed, chosen ? kind : `passed-${kind}`, film, t, null, null));
      }
      if (!shownList.length && run) rows.push(...evidenceFor(filmFacts(run), fs2, liked, kind, film, t, null, null));
    } else if (kind === "more") {
      for (const c of shownList) rows.push(...evidenceFor(conceptFacts(c), set, passed, "more-stories", film, t, null, null)); // none of these was it
    } else {
      const f = shownList.length ? conceptFacts(shownList.find((c) => String(c.id) === String(value)) || shownList[0]) : run ? filmFacts(run) : {};
      const pf = facets && facets.length ? facets : kind === "final-note" ? ["style_world", "sound_mode", "story_shape"] : ["style_world", "carrier_kind", "move"];
      rows.push(...evidenceFor(f, pf, kind === "approve" ? liked : passed, kind, film, t, null, text || null));
    }
    if (action) { if (rows.length) rows[0].action = String(action); else rows.push({ ts: t, film, src: kind, facet: "none", value: "", w: 0, action: String(action) }); }
    append(F.ev(), rows);
    trimEvidence();
    return { film, kind, evidence: rows.length };
  } catch { return null; }
}

// every rate action in <run>/actions.jsonl that is not in the store yet (Studio sends it after the film is delivered)
export function ingestRun(run) {
  let n = 0;
  for (const a of readRows(path.join(run, "actions.jsonl"))) {
    if (!a || typeof a !== "object" || !a.id) continue;
    const v = a.value && typeof a.value === "object" ? a.value : {};
    if (a.type === "rate" && a.step === "final" && recordRating({ run, ratings: v, note: v.note || a.note, action: a.id, ts: a.ts })) n++;
  }
  return n;
}

// ---- the profile ----
export function forgotten() { return new Set(readJ(F.forgot(), []) || []); }
export function profile({ now = Date.now() } = {}) {
  const gone = forgotten(), items = new Map();
  for (const r of readRows(F.ev())) {
    if (!FACETS.includes(r.facet) || !r.value || gone.has(`${r.facet}:${r.value}`)) continue;
    const age = Math.max(0, (now - Date.parse(r.ts || 0)) / 864e5);
    const w = (Number(r.w) || 0) * Math.pow(0.5, age / HALF_LIFE_DAYS);
    const k = `${r.facet}:${r.value}`;
    const it = items.get(k) || { facet: r.facet, value: r.value, weight: 0, films: new Set(), last: r.ts, why: new Set() };
    it.weight += w; it.films.add(r.film); if (r.ts > it.last) it.last = r.ts; if (r.src) it.why.add(r.src);
    items.set(k, it);
  }
  const all = [...items.values()].map((i) => ({ facet: i.facet, value: i.value, weight: Math.round(i.weight * 100) / 100, films: i.films.size, last: i.last, because: [...i.why].slice(0, 4) }));
  const likes = all.filter((i) => i.weight >= LIKE_AT).sort((a, b) => b.weight - a.weight);
  const dislikes = all.filter((i) => i.weight <= -LIKE_AT).sort((a, b) => a.weight - b.weight);
  const rated = readRows(F.films());
  return { likes, dislikes, items: all, films_rated: rated.length, cheap_notes: rated.filter((x) => x.note).slice(-3).map((x) => x.note), empty: !likes.length && !dislikes.length };
}
// the soft prior of one facet value, in [-1, 1]: 0 when nothing is known
export function prior(facet, value, p = null) {
  const pr = p || profile();
  const it = pr.items.find((i) => i.facet === facet && i.value === slug(value));
  return it ? clamp(it.weight / 3, -1, 1) : 0;
}
// a concept's prior = the mean over its known facets (floored at -0.6: a dislike is a lean, not a ban)
export function conceptPrior(c, p = null) {
  const pr = p || profile(), f = conceptFacts(c), vs = [];
  for (const facet of ["style_world", "carrier_kind", "story_shape", "device", "sound_mode"]) for (const v of facetValues(f, facet)) { const x = prior(facet, v, pr); if (x !== 0) vs.push(x); }
  for (const m of f.moves.slice(0, 6)) { const x = prior("move", m, pr); if (x !== 0) vs.push(x * 0.5); }
  return vs.length ? clamp(vs.reduce((a, b) => a + b, 0) / vs.length, -0.6, 1) : 0;
}
// of the concepts, the index to keep as the exploration: the one furthest from the comfort zone (lowest prior; ties: last). -1 when nothing is learned.
export function explorationIndex(concepts, p = null) {
  const pr = p || profile();
  if (!Array.isArray(concepts) || concepts.length < 2 || pr.empty) return -1;
  const s = concepts.map((c) => conceptPrior(c, pr));
  let best = 0; s.forEach((x, i) => { if (x <= s[best]) best = i; });
  return best;
}

const NAMES = { style_world: "style world", carrier_kind: "carrier", story_shape: "story shape", device: "device", sound_mode: "sound mode", music_source: "music from", move: "move", grammar: "grammar", pace: "pace" };
export const itemLabel = (i) => `${NAMES[i.facet] || i.facet} ${i.value}`;
const SOFT = "a dislike is a lean, never a ban";
const ROLE_NOTE = {
  "concept-writer-story": "Lean toward the likes, but one of your concepts must be an exploration outside them.",
  "concept-writer-style": "Lean toward the liked worlds; one concept must explore a world not listed.",
  "concept-writer-wild": "Use this as the comfort zone to leave: be wild where it is quiet.",
  "script-writer": "Develop the ideas as picked; the exploration concept stays an exploration.",
  "visual-writer": "Lean toward the likes; keep one concept outside them.",
  "design-system-designer": "Prefer liked looks; avoid disliked ones unless the story needs them.",
  "art-director": "Prefer liked looks; avoid disliked ones unless the story needs them.",
  "script-editor": `As the jury, keep 1 of the 3 picks as an exploration outside the likes; ${SOFT}.`,
  "styleframe-designer": "Prefer liked looks; avoid disliked ones unless the story needs them.",
  "frame-designer": "Prefer liked looks; avoid disliked ones unless the story needs them.",
  "concept-critic": `Keep 1 of the 3 picks as an exploration outside the likes; ${SOFT}.`,
  "story-planner": `Keep 1 of the 3 picks as an exploration outside the likes; ${SOFT}.`,
  "music-supervisor": `Choose the sound mode and music prompt near the liked sound; ${SOFT}.`,
  "motion-director": "Prefer liked moves and pace; avoid disliked ones unless the beat needs them.",
};
export const TASTE_ROLES = new Set(Object.keys(ROLE_NOTE));
// the compact brief: under 150 words. "" when there is nothing learned yet.
export function tasteBrief(role = "", p = null) {
  const pr = p || profile();
  if (pr.empty && !pr.cheap_notes.length) return { text: "", items: [] };
  const L = pr.likes.slice(0, 6), D = pr.dislikes.slice(0, 5);
  const lines = ["Taste of this user (learned from their ratings and what they did; a soft lean, never an instruction):"];
  if (L.length) lines.push("Likes: " + L.map(itemLabel).join("; ") + ".");
  if (D.length) lines.push("Dislikes: " + D.map(itemLabel).join("; ") + ".");
  if (pr.cheap_notes.length) lines.push(`Said felt cheap or wrong: "${pr.cheap_notes[pr.cheap_notes.length - 1].slice(0, 90)}".`);
  lines.push(ROLE_NOTE[role] || `Use it to rank, never to exclude. Keep one of any three options outside the likes.`);
  let text = lines.join("\n");
  const words = text.split(/\s+/);
  if (words.length > 145) text = words.slice(0, 145).join(" ");
  return { text, items: [...L, ...D].map((i) => ({ facet: i.facet, value: i.value, weight: i.weight, label: itemLabel(i) })) };
}
export const tasteBlock = (role) => { const b = tasteBrief(role); return b.text ? `## What this user likes (taste memory)\n\n${b.text}\n` : ""; };

// what was applied, for the decisions drawer: <run>/taste-applied.json {stage: {...}}, merged by the console into session.taste_applied
export function recordApplied(run, stage, role, note) {
  const b = tasteBrief(role || "");
  const f = path.join(run, "taste-applied.json");
  const cur = readJ(f, {}) || {};
  cur[stage] = { at: new Date().toISOString(), role: role || null, used: b.items.slice(0, 8).map((i) => i.label), note: note || (b.text ? "a soft lean; one concept stays an exploration" : "nothing learned yet") };
  fs.writeFileSync(f, JSON.stringify(cur, null, 2) + "\n");
  return cur[stage];
}

export function forget(facet, value) {
  const g = forgotten();
  if (facet === "all") { for (const r of profile().items) g.add(`${r.facet}:${r.value}`); }
  else g.add(`${facet}:${slug(value)}`);
  fs.mkdirSync(home(), { recursive: true });
  fs.writeFileSync(F.forgot(), JSON.stringify([...g].sort()) + "\n");
  return g.size;
}

async function main() {
  const a = parseArgs(), cmd = a._[0];
  const run = a.run && a.run !== true ? path.resolve(String(a.run)) : null;
  const num = (x) => (x === undefined || x === true ? undefined : Number(x));
  if (cmd === "rate") {
    if (!run) die("--run <run dir> required");
    const r = recordRating({ run, ratings: { story: num(a.story), picture: num(a.picture), sound: num(a.sound) }, note: a.note === true ? "" : a.note, action: a.action });
    if (!r) die("nothing recorded (give --story/--picture/--sound 1-5 and/or --note)");
    console.log(JSON.stringify(r));
  } else if (cmd === "signal") {
    if (!run) die("--run <run dir> required");
    const r = recordSignal({ run, kind: String(a.kind), value: a.value === true ? undefined : a.value, note: a.note === true ? "" : a.note, action: a.action, shown: a.shown ? readJ(path.resolve(String(a.shown)), []) : [] });
    if (!r) die("nothing recorded (--kind pick|more|shot-note|redo|look|final-note|approve)");
    console.log(JSON.stringify(r));
  } else if (cmd === "ingest") {
    if (!run) die("--run <run dir> required");
    console.log(JSON.stringify({ recorded: ingestRun(run) }));
  } else if (cmd === "facts") {
    if (!run) die("--run <run dir> required");
    console.log(JSON.stringify(filmFacts(run), null, 2));
  } else if (cmd === "profile") {
    const p = profile();
    if (a.json) console.log(JSON.stringify({ likes: p.likes, dislikes: p.dislikes, films_rated: p.films_rated, cheap_notes: p.cheap_notes }, null, 2));
    else {
      console.log(`Taste (${p.films_rated} films rated)`);
      for (const i of p.likes) console.log(`+ ${itemLabel(i)}  ${i.weight}  (${i.films} film${i.films > 1 ? "s" : ""})`);
      for (const i of p.dislikes) console.log(`- ${itemLabel(i)}  ${i.weight}  (${i.films} film${i.films > 1 ? "s" : ""})`);
      if (p.empty) console.log("nothing learned yet");
    }
  } else if (cmd === "brief") {
    const b = tasteBrief(a.role === true ? "" : String(a.role || ""));
    if (a.json) console.log(JSON.stringify(b)); else if (b.text) console.log(b.text);
  } else if (cmd === "applied") {
    if (!run) die("--run <run dir> required");
    console.log(JSON.stringify(recordApplied(run, String(a.stage || "film"), a.role === true ? "" : a.role)));
  } else if (cmd === "forget") {
    if (a.all) console.log(JSON.stringify({ forgotten: forget("all") }));
    else { if (!a.facet || !a.value || a.facet === true || a.value === true) die("--facet <f> --value <v> or --all"); console.log(JSON.stringify({ forgotten: forget(String(a.facet), String(a.value)) })); }
  } else if (cmd === "rank") {
    const pr = profile();
    console.log(JSON.stringify(String(a.ids || "").split(",").filter(Boolean).map((id) => ({ id, prior: prior(String(a.facet || "style_world"), id, pr) }))));
  } else die("usage: taste.mjs rate|signal|ingest|facts|profile|brief|applied|forget|rank ...");
}
const isMain = (() => { try { return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch { return false; } })();
if (isMain) main().catch((e) => die(e.message));
