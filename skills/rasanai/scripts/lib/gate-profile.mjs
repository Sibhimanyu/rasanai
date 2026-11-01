// Gate profiles and grammar waivers (audit P0-4, P1-5). One PURE-ish reader (file reads only) the final gate, frame-gate and motion-gate share.
//   gate_profile (library/styles/atlas/<world>.json): dimensional | flat | pixel | stepped | photographic | hand-made. The gates judge a film by the world it chose:
//     dimensional + photographic keep the depth / ground / scale craft as errors; flat | pixel | stepped | hand-made turn those into `review`; pixel + stepped also accept stepped motion.
//   grammar_waivers (concept or motion/score.json): [{ rule, why }]. The launch grammar is a default; a waived rule is a note, never an error. Rules: WAIVABLE.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const GATE_PROFILES = ["dimensional", "flat", "pixel", "stepped", "photographic", "hand-made"];
export const WAIVABLE = {
  "full-frame-type": "the launch grammar's full-frame type scale (launch-grammar shot-scale-mix)",
  "hook-address": "the first 3 s address the viewer or show a problem",
  "hook-object": "an object enters within 2 s",
  "hook-logo": "no brand before 3 s",
  "median-shot": "the median shot is 3.5 s or less (frame-gate shot-length error)",
  "hard-cuts": "more than 2 plain cuts (launch-beats hard-cuts)",
  "carrier": "a carrier motif in 60% of the beats (launch-beats carrier)",
  "rhythm": "two dense/sparse alternations (launch-beats rhythm)",
};
const ALIAS = { "hook-3s": ["hook-address"], "object-by-2s": ["hook-object"], "no-brand-before-3s": ["hook-logo"], "hook": ["hook-address", "hook-object", "hook-logo"], "shot-length": ["median-shot"], "plain-cuts": ["hard-cuts"], "cuts": ["hard-cuts"], "carrier-share": ["carrier"], "dense-sparse": ["rhythm"], "median-shot-length": ["median-shot"], "type-full": ["full-frame-type"] };
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const S = (v) => (v == null ? "" : String(v).trim());
const worldIdOf = (c) => { const sw = c && c.style_world; return S(isObj(sw) ? sw.id || sw.name : sw); };

// an atlas world id -> its gate_profile (null when unknown or unset)
export function gateProfileOf(worldId) {
  const id = S(worldId).toLowerCase();
  if (!id) return null;
  const d = readJ(path.join(SKILL_DIR, "library", "styles", "atlas", `${id}.json`));
  const p = d && S(d.gate_profile).toLowerCase();
  return p && GATE_PROFILES.includes(p) ? p : null;
}

// the world a run chose: story/chosen.json (or chosen-treatment.json), motion/score.json, story/jury.json's first pick -> ideas pool, look/system.json, look/blend. First hit wins.
export function chosenWorld(run) {
  if (!run) return null;
  const R = (...a) => path.join(run, ...a);
  const cands = [readJ(R("story", "chosen-treatment.json")), readJ(R("story", "chosen.json")), readJ(R("motion", "score.json")), readJ(R("look", "system.json")), readJ(R("look", "blend.json")), readJ(R("concept.json"))];
  for (const c of cands) { const id = worldIdOf(c); if (id) return id; }
  const jury = readJ(R("story", "jury.json")), pick = jury && Array.isArray(jury.picks) ? jury.picks[0] : null;
  const pid = pick && S(pick.id || pick.idea);
  if (pick && worldIdOf(pick)) return worldIdOf(pick);
  if (pid) for (const w of ["story", "style", "wild"]) { const f = readJ(R("story", `ideas-${w}.json`)); const x = f && (f.ideas || []).find((i) => i && S(i.id) === pid); if (x && worldIdOf(x)) return worldIdOf(x); }
  return null;
}

// the run's gate profile: its chosen world's gate_profile; else the older look/medium.json contract (a stepped / still temporal mode, or a multi-plane-depth-free medium); else null (= judged as dimensional, as before)
export function runGateProfile(run) {
  const world = chosenWorld(run), p = gateProfileOf(world);
  if (p) return { profile: p, world, source: "style_world" };
  const mc = run && readJ(path.join(run, "look", "medium.json"));
  if (mc && mc.format === "medium-contract@1") {
    const tm = mc.motion_policy && mc.motion_policy.temporal_mode;
    if (tm === "stepped") return { profile: "stepped", world, source: "look/medium.json" };
    const dims = JSON.stringify(mc).match(/multi-plane-depth/) ? "flat" : null;
    if (dims) return { profile: "flat", world, source: "look/medium.json" };
  }
  return { profile: null, world, source: null };
}

// grammar_waivers from the score and the chosen concept: [{rule, why}] with canonical rule ids; a waiver with no why is NOT honoured (reported in `ignored`)
export function grammarWaivers(...docs) {
  const waived = new Map(), ignored = [];
  for (const d of docs) for (const w of (isObj(d) && Array.isArray(d.grammar_waivers) ? d.grammar_waivers : [])) {
    const rule = S(isObj(w) ? w.rule : w).toLowerCase(), why = S(isObj(w) ? w.why || w.reason : "");
    const ids = WAIVABLE[rule] ? [rule] : ALIAS[rule] || [];
    if (!ids.length) { ignored.push(`${rule || "(no rule)"}: not a waivable rule (${Object.keys(WAIVABLE).join(", ")})`); continue; }
    if (!why) { ignored.push(`${rule}: a waiver needs a stated why`); continue; }
    for (const id of ids) waived.set(id, why);
  }
  return { waived: Object.fromEntries(waived), ignored };
}
export function runWaivers(run) {
  if (!run) return { waived: {}, ignored: [] };
  return grammarWaivers(readJ(path.join(run, "story", "chosen-treatment.json")), readJ(path.join(run, "story", "chosen.json")), readJ(path.join(run, "motion", "score.json")));
}
// "rule:why;rule2:why2" (the CLI form final-gate passes down) <-> {rule: why}
export const waiversArg = (w) => Object.entries(w || {}).map(([k, v]) => `${k}:${String(v).replace(/[;\n]/g, ",")}`).join(";");
export const parseWaiversArg = (s) => Object.fromEntries(S(s).split(";").map((x) => x.split(/:(.*)/s)).filter((x) => x[0] && WAIVABLE[x[0]]).map((x) => [x[0], S(x[1]) || "waived"]));

// ---- world families (the concept pool's spread rule; crew.mjs check concept-writer-*, check script-editor --key jury) ----
// CALM: quiet, typographic or whitespace-led worlds that every launch film drifts to when nobody pushes (a calm film is allowed; a calm POOL is not).
// BOLD: worlds whose picture is made differently (pixel, dimensional, stepped, hand-made, photographic gate profiles, plus the loud flat ones). One list, here.
export const CALM_WORLDS = ["swiss-grid", "minimal-luxury", "editorial-magazine", "line-art", "kinetic-type-only", "data-story", "bauhaus"];
export const BOLD_PROFILES = ["pixel", "dimensional", "stepped", "hand-made", "photographic"];
export const BOLD_FLAT_WORLDS = ["sticker-maximal", "brutalist"];
export const isCalmWorld = (id) => CALM_WORLDS.includes(S(id).toLowerCase());
export const isBoldWorld = (id) => { const w = S(id).toLowerCase(); return !!w && !isCalmWorld(w) && (BOLD_PROFILES.includes(gateProfileOf(w)) || BOLD_FLAT_WORLDS.includes(w)); };
// Pool rules over a list of style world ids (one per idea): [problem strings]. `pool` = all three writers together, else one writer's lane.
export function worldSpreadProblems(worlds, { pool = false, lane = "", needBold = 0 } = {}) {
  const P = [], ids = worlds.map((w) => S(w).toLowerCase()).filter(Boolean), n = {};
  for (const w of ids) n[w] = (n[w] || 0) + 1;
  const over = Object.entries(n).filter(([, c]) => c > 2).map(([w, c]) => `${w} x${c}`);
  if (over.length) P.push(`${pool ? "the pool has" : `the ${lane} lane has`} more than 2 ideas in one style world (${over.join(", ")}): at most 2 per world; move the extras to other worlds`);
  if (pool) {
    if (Object.keys(n).length < 6) P.push(`the pool spans ${Object.keys(n).length} style world(s) (${Object.keys(n).join(", ")}): it needs at least 6 distinct worlds`);
    const calm = ids.filter(isCalmWorld);
    if (calm.length > 4) P.push(`${calm.length} ideas sit in the calm family (${[...new Set(calm)].join(", ")}): at most 4 across the pool; re-world the rest into bold families (${BOLD_PROFILES.join(", ")}, sticker, brutalist)`);
  }
  if (needBold) { const b = ids.filter(isBoldWorld).length; if (b < needBold) P.push(`the ${lane} lane has ${b} idea(s) in a bold world (pixel, dimensional, stepped, hand-made, photographic, sticker, brutalist): at least ${needBold} are required`); }
  return P;
}

// LAUNCH films (references/launch-grammar.md): diversity is a different hook, carrier motif and signature transition, never a different art world.
// `ideas` = concept objects; returns [problem strings]. Lane: each lane's ideas differ; pool: all three writers together.
const _lw = (v) => S(v && typeof v === "object" ? v.what || v.name || v.id || v.kind : v).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const launchHookOf = (x) => _lw(Array.isArray(x && x.hook_lines) ? x.hook_lines[0] : x && (x.hook_lines || x.hook));
export const launchCarrierOf = (x) => _lw(x && x.carrier);
export const launchTransitionOf = (x) => _lw(x && x.signature_transition);
export function launchSpreadProblems(ideas, { pool = false, lane = "" } = {}) {
  const P = [], who = pool ? "the pool" : `the ${lane} lane`;
  for (const [name, f] of [["hook", launchHookOf], ["carrier motif", launchCarrierOf], ["signature transition", launchTransitionOf]]) {
    const ids = ideas.map(f).filter(Boolean), uniq = new Set(ids);
    const need = pool ? Math.min(6, ids.length) : Math.min(3, ids.length);
    if (ids.length && uniq.size < need) P.push(`${who} has only ${uniq.size} distinct ${name}(s) across ${ids.length} launch ideas (need ${need}+): launch-film diversity is a different hook, carrier motif and signature transition, not a different style world`);
    const n = {}; for (const i of ids) n[i] = (n[i] || 0) + 1;
    const over = Object.entries(n).filter(([, c]) => c > 2).map(([w, c]) => `${w} x${c}`);
    if (over.length) P.push(`${who} reuses one ${name} on more than 2 ideas (${over.join(", ")}): at most 2 per ${name}`);
  }
  return P;
}
// the jury's 3 picks on a launch film: different hook, carrier and signature transition; at most 1 non-default style world
export function launchJuryProblems(picks) {
  const P = [];
  for (const [name, f] of [["hook", launchHookOf], ["carrier motif", launchCarrierOf], ["signature transition", launchTransitionOf]]) {
    const v = picks.map(f).filter(Boolean);
    if (v.length === picks.length && new Set(v).size < picks.length) P.push(`the three picks do not differ in ${name}: on a launch film they must each have a different hook, carrier motif and signature transition`);
  }
  const nonDefault = picks.filter((x) => { const w = S(x && typeof x.style_world === "object" ? x.style_world.id || x.style_world.name : x && x.style_world).toLowerCase(); return w && w !== "kinetic-type-only" && w !== "kinetic-launch"; }).length;
  if (nonDefault > 1) P.push(`${nonDefault} of the three picks use a non-default style world: on a launch film at most 1 may (the default is the kinetic-launch grammar)`);
  return P;
}
// fields a launch-film concept must name (references/launch-grammar.md section 8): [problem strings]
export function launchConceptProblems(x, id) {
  const P = [], has = (v) => (Array.isArray(v) ? v.length > 0 : !!S(v && typeof v === "object" ? v.what || v.line || v.text || v.beat || v.see || v.cta || "" : v));
  const caps = Array.isArray(x && x.capabilities) ? x.capabilities : [];
  if (!has(x && x.hook_lines)) P.push(`concept ${id}: no hook_lines (2 to 4 lines, the viewer's problem)`);
  if (!has(x && x.turn_line)) P.push(`concept ${id}: no turn_line`);
  if (!has(x && x.meet)) P.push(`concept ${id}: no meet beat (the small, calm brand reveal)`);
  if (caps.length < 2 || caps.length > 3 || caps.some((c) => !c || !S(c.line) || !S(c.ui_proof))) P.push(`concept ${id}: capabilities needs 2 or 3 beats, each { line, ui_proof }`);
  if (!has(x && x.payoff)) P.push(`concept ${id}: no payoff / CTA`);
  if (!(x && x.carrier && typeof x.carrier === "object" && S(x.carrier.handoff))) P.push(`concept ${id}: carrier needs { what, kind, handoff } (how it hands off between beats)`);
  if (!has(x && x.signature_transition)) P.push(`concept ${id}: no signature_transition`);
  if (!["neutral", "brand-gradient", "dark"].includes(S(x && x.ground).toLowerCase())) P.push(`concept ${id}: ground is neutral, brand-gradient or dark`);
  if (!has(x && x.type_pairing)) P.push(`concept ${id}: no type_pairing`);
  return P;
}
