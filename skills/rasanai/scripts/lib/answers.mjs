// Answerable craft warnings (crew.mjs answers; crew.mjs check --role film-builder|scene-animator).
// The grammar and craft checks are warnings, never errors ("budgets, not bans"). A warning is ANSWERED when the next draft no longer raises it, or when the score
// has a departures[] entry naming its rule with a real why (8 words or more, not generic). Unanswered warnings make the builder's check report status "unanswered"
// (exit 6) for at most 2 rounds; after that they go to the Final as open craft notes. Thresholds and severities are not touched here.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { launchBeatFindings } from "./launch-beats.mjs";
import { readShots, checkShots } from "./frames-lib.mjs";

export const ANSWER_ROLES = new Set(["film-builder", "scene-animator"]);
export const MAX_ANSWER_ROUNDS = 2;
export const WHY_MIN_WORDS = 8;
// which warnings are answerable: the grammar and craft ones (the measured defects and every error stay as they are)
const ANSWERABLE = /^(scene-|texture|transition-variety|hard-cuts|rhythm|carrier-overuse|cliche-|imagery-count|emphasis-monotone|type-treatment|slide-layout|ground-|ui-|holds-unchanged|text-load|layout-repeat|display-scale|no-imagery|imagery-|fluency)/;
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const S = (v) => (v == null ? "" : String(v).trim());
const GENERIC_PHRASE = /^(it'?s |this is |just |because it'?s |because )?(a |an |my |our |the )?(creative|artistic|design|stylistic|aesthetic|personal|deliberate|intentional|conscious)?\s*(choice|decision|preference|call|intent|reason|style|taste|vibe|look)s?\b/i;

// a why counts when it has 8+ words, 5+ distinct words, and is not just a generic phrase ("a creative choice, a deliberate decision")
export function whyProblem(why) {
  const text = S(why), w = text.toLowerCase().replace(/[^\p{L}\p{N}' -]/gu, " ").split(/\s+/).filter(Boolean);
  if (w.length < WHY_MIN_WORDS) return `the why has ${w.length} word(s); ${WHY_MIN_WORDS} or more are needed and it must say what this film gains`;
  const generic = new Set(["a", "an", "the", "it", "its", "is", "this", "just", "because", "my", "our", "creative", "artistic", "design", "stylistic", "aesthetic", "personal", "deliberate", "intentional", "conscious", "choice", "decision", "preference", "call", "intent", "reason", "style", "taste", "vibe", "look", "and", "or", "by", "on", "purpose", "for", "of", "to", "was", "made", "choose", "chosen", "we", "i", "so", "film", "overall", "always", "this", "that", "all", "way", "here", "still", "really", "very", "with", "in", "at", "as", "be", "are"]);
  const real = new Set(w.filter((x) => !generic.has(x)));
  if (new Set(w).size < 5 || real.size < 3 || (GENERIC_PHRASE.test(text) && real.size < 4)) return "the why is generic (a creative choice says nothing): name what this film gains and what the default would cost it";
  return null;
}

// every departure the score records: [{rule, why}] from departures[] / grammar_waivers[] (a list of {rule, why} or an object { rule: why })
export function departuresOf(score) {
  const out = [], push = (rule, why) => { if (S(rule)) out.push({ rule: S(rule).toLowerCase(), why: S(why) }); };
  for (const k of ["departures", "grammar_waivers"]) {
    const v = score && score[k];
    if (Array.isArray(v)) for (const d of v) { if (d && typeof d === "object") push(d.rule, d.why || d.reason); else push(d, ""); }
    else if (v && typeof v === "object") for (const [r, w] of Object.entries(v)) push(r, w);
  }
  return out;
}

const ruleIdOf = (f) => { const m = `${f.fix || ""} ${f.message || ""}`.match(/rule: "([a-z0-9-]+)"/i); return m ? m[1].toLowerCase() : String(f.check || "").toLowerCase(); };

// the warnings the run raises now, from the sources: [{rule, check, source, message, fix}]
export function collectWarnings(run) {
  const R = (...a) => path.join(run, ...a), found = [], seen = new Set();
  const add = (source, f) => {
    const check = String(f.check || "").toLowerCase();
    if (!ANSWERABLE.test(check) || f.severity !== "warning") return;
    const rule = ruleIdOf(f), key = `${rule}|${check}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ rule, check, source, message: String(f.message || "").slice(0, 300), fix: String(f.fix || "").slice(0, 300) });
  };
  const score = J(R("motion", "score.json"));
  // 1. launch-beats (the score)
  if (score) { try { const plan = score.imagegen ? score : { ...score, imagegen: (J(R("crew", "plan.json")) || {}).imagegen }; for (const f of launchBeatFindings({ plan })) add("launch-beats", f); } catch { /* the score check reports its own problems */ } }
  // 2. the render gates' reports: motion-gate (launch-gates: texture-nonsmooth-low, holds-unchanged; launch-grammar: layout-repeat; frame-gate: text-load) and the boards' frame gate
  for (const f of [R("crew", "motion-gate.json"), R("motion", "motion-gate.json")]) { const g = J(f); if (g && Array.isArray(g.findings)) { for (const x of g.findings) add("motion-gate", x); break; } }
  { const g = J(R("frames", "gate.json")); if (g && Array.isArray(g.findings)) for (const x of g.findings) add("frame-gate", x); }
  // 3. shots-check layout-repeat (frames/shots.json)
  try {
    const doc = readShots(R("frames", "shots.json"));
    if (doc && typeof doc === "object") for (const w of checkShots(doc, { duration: (score && Number(score.duration)) || null }).warnings || []) if (/^layout-repeat/.test(String(w))) add("shots-check", { check: "layout-repeat", severity: "warning", message: String(w), fix: 'vary where the headline and the UI sit, or record { rule: "layout-repeat", why } in score.departures' });
  } catch { /* no boards */ }
  return found;
}

// resolve the list against the score's departures: { open, answered }
export function resolveAnswers(run) {
  const score = J(path.join(run, "motion", "score.json")), deps = departuresOf(score), warnings = collectWarnings(run);
  const open = [], answered = [];
  for (const w of warnings) {
    const d = deps.filter((x) => x.rule === w.rule || x.rule === w.check);
    if (!d.length) { open.push({ ...w, need: `fix it, or add { rule: "${w.rule}", why } to score.departures with a why of ${WHY_MIN_WORDS}+ words that says what this film gains` }); continue; }
    const good = d.find((x) => !whyProblem(x.why));
    if (good) answered.push({ ...w, why: good.why });
    else open.push({ ...w, need: `a departure for "${w.rule}" exists but does not count: ${whyProblem(d[0].why)}` });
  }
  return { open, answered };
}

// rounds: one per distinct input state (score + gate reports), so re-running the check without changing anything does not spend a round
const stateFile = (run) => path.join(run, "crew", "answers.json");
export function inputSig(run) {
  const h = crypto.createHash("sha256");
  for (const f of [["motion", "score.json"], ["crew", "motion-gate.json"], ["motion", "motion-gate.json"], ["frames", "gate.json"], ["frames", "shots.json"]]) { try { h.update(fs.readFileSync(path.join(run, ...f))); } catch { h.update("-"); } }
  return h.digest("hex").slice(0, 16);
}
// status: "clear" | "unanswered" (rounds 1 and 2) | "open-craft-notes" (the third look at an unchanged-or-changed draft that still has them: they go to the Final)
export function answerRound(run, res) {
  const st = J(stateFile(run)) || { rounds: 0, sig: null, status: "clear" };
  if (!res.open.length) return { rounds: st.rounds, status: "clear", open_craft_notes: [] };
  const sig = inputSig(run);
  let rounds = st.rounds, capped;
  if (st.sig === sig) capped = st.status === "open-craft-notes";
  else if (st.rounds >= MAX_ANSWER_ROUNDS) capped = true;
  else { rounds = st.rounds + 1; capped = false; }
  const status = capped ? "open-craft-notes" : "unanswered";
  const notes = capped ? res.open.map((w) => ({ rule: w.rule, check: w.check, source: w.source, note: w.message })) : [];
  try { fs.mkdirSync(path.dirname(stateFile(run)), { recursive: true }); fs.writeFileSync(stateFile(run), JSON.stringify({ rounds, sig, status, updated: new Date().toISOString(), open_craft_notes: notes }, null, 2)); } catch { /* best effort */ }
  return { rounds, status, open_craft_notes: notes };
}
export function openCraftNotes(run) {
  const st = J(stateFile(run));
  return st && st.status === "open-craft-notes" && Array.isArray(st.open_craft_notes) ? st.open_craft_notes : [];
}
