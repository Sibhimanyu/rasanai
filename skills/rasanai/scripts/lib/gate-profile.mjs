// Gate profiles and grammar waivers (audit P0-4, P1-5). One PURE-ish reader (file reads only) the final gate, frame-gate and motion-gate share.
//   gate_profile (library/styles/atlas/<world>.json): dimensional | flat | pixel | stepped | photographic | hand-made. The gates judge a film by the world it chose:
//     dimensional + photographic keep the depth / ground / scale craft as errors; flat | pixel | stepped | hand-made turn those into `review`; pixel + stepped also accept stepped motion.
//   grammar_waivers (concept or motion/score.json): [{ rule, why }]. The launch grammar is a default; a waived rule is a note, never an error. Rules: WAIVABLE.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";
import { buzzwordHits, buzzwordMessage, BUZZWORD_FIX, ctaProblems } from "./copy-lint.mjs";

export const GATE_PROFILES = ["dimensional", "flat", "pixel", "stepped", "photographic", "hand-made"];
export const WAIVABLE = {
  "full-frame-type": "the launch grammar's full-frame type scale (launch-grammar shot-scale-mix)",
  "hook-address": "the first 3 s address the viewer or show a problem",
  "hook-object": "an object enters within 2 s",
  "hook-logo": "no brand before 3 s",
  "median-shot": "the median shot is 3.5 s or less (frame-gate shot-length error)",
  "hard-cuts": "undeclared plain cuts (launch-beats hard-cuts; a cut on a music hit is fine)",
  "carrier": "a carrier in more than 40% of the beats (launch-beats carrier-overuse)",
  "scene-variety": "5+ scene types, none over 30% (launch-beats scene-variety)",
  "texture": "a stepped or flicker section, 15-40% non-smooth (launch-beats texture-mix)",
  "rhythm": "two dense/sparse alternations (launch-beats rhythm)",
  "transition-variety": "no designed transition family on more than 30% of the designed seams (launch-beats transition-variety)",
  "display-scale": "display-scale type: cap height 9% of the frame at least once (launch-gates scale-display-type, crew.mjs hero_scale)",
  "sfx-density": "the designed-SFX band per 10 s for the sound mode (sound.mjs, slop.mjs sfx-density)",
};
// The rules above are SOFT DEFAULTS (references/launch-grammar.md "Defaults you can leave"): no source supports a fixed count of scene types or transitions, a dense:sparse ratio,
// a minimum type size or an SFX-per-second target (.context/motion-craft-research.md). A film that leaves one records { rule, why } in score.departures (or grammar_waivers, the older name);
// without a why the finding stays a warning ("explain the change"), with one it is a note.
const ALIAS = { "scene-types": ["scene-variety"], "scene-share": ["scene-variety"], "transitions": ["transition-variety"], "hero-scale": ["display-scale"], "type-scale": ["display-scale"], "sfx": ["sfx-density"], "texture-share": ["texture"], "hook-3s": ["hook-address"], "object-by-2s": ["hook-object"], "no-brand-before-3s": ["hook-logo"], "hook": ["hook-address", "hook-object", "hook-logo"], "shot-length": ["median-shot"], "plain-cuts": ["hard-cuts"], "cuts": ["hard-cuts"], "carrier-share": ["carrier"], "dense-sparse": ["rhythm"], "median-shot-length": ["median-shot"], "type-full": ["full-frame-type"] };
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
  const listOf = (d) => [...(isObj(d) && Array.isArray(d.grammar_waivers) ? d.grammar_waivers : []), ...(isObj(d) && Array.isArray(d.departures) ? d.departures : []), ...(isObj(d) && isObj(d.departures) ? Object.entries(d.departures).map(([rule, why]) => ({ rule, why })) : [])];
  for (const d of docs) for (const w of listOf(d)) {
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

// LAUNCH films (references/launch-grammar.md): diversity is a different hook, scene plan and signature transition, never a different art world (a carrier is optional and local).
// `ideas` = concept objects; returns [problem strings]. Lane: each lane's ideas differ; pool: all three writers together.
const _lw = (v) => S(v && typeof v === "object" ? v.what || v.name || v.id || v.kind : v).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const launchHookOf = (x) => _lw(Array.isArray(x && x.hook_lines) ? x.hook_lines[0] : x && (x.hook_lines || x.hook));
export const launchCarrierOf = (x) => _lw(x && x.carrier);
// the scene plan as a signature: the ordered scene types of the concept (scene_plan[].scene_type)
export const scenePlanTypes = (x) => (Array.isArray(x && x.scene_plan) ? x.scene_plan : []).map((b) => _lw(b && typeof b === "object" ? b.scene_type || b.type : b).replace(/ /g, "-")).filter(Boolean);
export const launchScenePlanOf = (x) => scenePlanTypes(x).join(">");
export const launchTransitionOf = (x) => _lw(x && x.signature_transition);
export function launchSpreadProblems(ideas, { pool = false, lane = "" } = {}) {
  const P = [], who = pool ? "the pool" : `the ${lane} lane`;
  for (const [name, f] of [["hook", launchHookOf], ["scene plan", launchScenePlanOf], ["signature transition", launchTransitionOf]]) {
    const ids = ideas.map(f).filter(Boolean), uniq = new Set(ids);
    const need = pool ? Math.min(6, ids.length) : Math.min(3, ids.length);
    if (ids.length && uniq.size < need) P.push(`${who} has only ${uniq.size} distinct ${name}(s) across ${ids.length} launch ideas (need ${need}+): launch-film diversity is a different hook, scene plan and signature transition, not a different style world`);
    const n = {}; for (const i of ids) n[i] = (n[i] || 0) + 1;
    const over = Object.entries(n).filter(([, c]) => c > 2).map(([w, c]) => `${w} x${c}`);
    if (over.length) P.push(`${who} reuses one ${name} on more than 2 ideas (${over.join(", ")}): at most 2 per ${name}`);
  }
  return P;
}
// the jury's 3 picks on a launch film: different hook, scene plan and signature transition; at most 1 non-default style world
export function launchJuryProblems(picks) {
  const P = [];
  for (const [name, f] of [["hook", launchHookOf], ["scene plan", launchScenePlanOf], ["signature transition", launchTransitionOf]]) {
    const v = picks.map(f).filter(Boolean);
    if (v.length === picks.length && new Set(v).size < picks.length) P.push(`the three picks do not differ in ${name}: on a launch film they must each have a different hook, scene plan and signature transition`);
  }
  const nonDefault = picks.filter((x) => { const w = S(x && typeof x.style_world === "object" ? x.style_world.id || x.style_world.name : x && x.style_world).toLowerCase(); return w && w !== "kinetic-type-only" && w !== "kinetic-launch"; }).length;
  if (nonDefault > 1) P.push(`${nonDefault} of the three picks use a non-default style world: on a launch film at most 1 may (the default is the kinetic-launch grammar)`);
  return P;
}
// fields a launch-film concept must name (references/launch-grammar.md section 8): [problem strings]
export function launchConceptProblems(x, id) {
  const P = [], has = (v) => (Array.isArray(v) ? v.length > 0 : !!S(v && typeof v === "object" ? v.what || v.line || v.text || v.beat || v.see || v.cta || "" : v));
  const caps = Array.isArray(x && x.capabilities) ? x.capabilities : [];
  // the hook > turn > meet > capabilities > payoff arc is the default structure; another declared structure (sung-script, teaser-reveal, ...) brings its own beats in scene_plan[]
  const st = x && x.structure, skind = _lw(st && typeof st === "object" ? st.kind || st.id || st.name : st).replace(/ /g, "-"), arc = !skind || skind === "hook-turn-meet";
  if (arc) {
    if (!has(x && x.hook_lines)) P.push(`concept ${id}: no hook_lines (2 to 4 lines, the viewer's problem)`);
    if (!has(x && x.turn_line)) P.push(`concept ${id}: no turn_line`);
    if (!has(x && x.meet)) P.push(`concept ${id}: no meet beat (the small, calm brand reveal)`);
    if (caps.length < 2 || caps.length > 3 || caps.some((c) => !c || !S(c.line) || !S(c.ui_proof))) P.push(`concept ${id}: capabilities needs 2 or 3 beats, each { line, ui_proof }`);
  } else if (caps.length && caps.some((c) => !c || !S(c.line) || !S(c.ui_proof))) P.push(`concept ${id}: each capability needs { line, ui_proof }`);
  if (!has(x && x.payoff)) P.push(`concept ${id}: no payoff / CTA`);
  // a carrier is OPTIONAL and local (a few neighbouring beats, at most 40%); when one is named it says where it lives and how it hands off
  if (x && x.carrier && (typeof x.carrier !== "object" || S(x.carrier.what || x.carrier.name)) && !(typeof x.carrier === "object" && S(x.carrier.handoff))) P.push(`concept ${id}: a named carrier needs { what, kind, beats, handoff } (which 2 or 3 beats it links, and how it hands off); or drop it: carriers are optional`);
  // the scene plan (references/launch-grammar.md section 2): the backbone of a launch film
  { const plan = Array.isArray(x && x.scene_plan) ? x.scene_plan : [], types = scenePlanTypes(x);
    if (plan.length < (arc ? 5 : 3) || types.length < plan.length) P.push(`concept ${id}: scene_plan needs one entry per beat ({beat, scene_type, texture, move?, imagery?}, ${arc ? 5 : 3} or more beats)`);
    else {
      /* scene variety, the 30% share and a texture accent are soft defaults (launchConceptWarnings) */
    } }
  if (!has(x && x.signature_transition)) P.push(`concept ${id}: no signature_transition`);
  if (!["neutral", "brand-gradient", "dark"].includes(S(x && x.ground).toLowerCase())) P.push(`concept ${id}: ground is neutral, brand-gradient or dark`);
  if (!has(x && x.type_pairing)) P.push(`concept ${id}: no type_pairing`);
  return P;
}

// the launch structures a concept may declare (references/launch-grammar.md section 16); the first is the default candidate, not the only one
export const STRUCTURES = ["hook-turn-meet", "sung-script", "teaser-reveal", "parts-assembly", "before-after", "feature-led", "medium-as-proof"];

// Launch-concept WARNINGS (references/launch-grammar.md sections 8 and 14): clarity, one message, CTA shape, buzzwords in the copy. [warning strings]
export function launchConceptWarnings(x, id) {
  const W = [], t = (v) => (v && typeof v === "object" && !Array.isArray(v) ? S(v.line || v.text || v.what || v.cta || "") : S(v));
  const cl = x && x.clarity && typeof x.clarity === "object" ? x.clarity : null;
  if (!cl || !S(cl.category) || !S(cl.audience) || !S(cl.beat)) W.push(`concept ${id}: no clarity {category, audience, beat}: say what the product is and who it is for in the hook or the turn, before the logo (launch-grammar.md section 14)`);
  if (!S(x && x.one_message)) W.push(`concept ${id}: no one_message (the film's one sentence; launch-grammar.md section 14)`);
  const payoff = x && x.payoff, cta = x && (x.cta || (payoff && typeof payoff === "object" ? payoff.cta : null));
  if (!S(typeof cta === "object" && cta ? cta.text : cta)) W.push(`concept ${id}: no cta (a verb plus a destination, held 2 s or more: "Download for macOS")`);
  else for (const p of ctaProblems(typeof cta === "object" ? cta : { text: cta })) W.push(`concept ${id}: ${p}`);
  const lines = [...(Array.isArray(x && x.hook_lines) ? x.hook_lines : [x && x.hook_lines]), x && x.turn_line, x && x.meet, ...(Array.isArray(x && x.capabilities) ? x.capabilities.map((c) => c && c.line) : []), payoff, x && x.one_message].map(t).filter(Boolean);
  // soft defaults: say why when the plan leaves them (concept.departures [{rule, why}])
  { const dep = grammarWaivers(x).waived, plan = Array.isArray(x && x.scene_plan) ? x.scene_plan : [], types = scenePlanTypes(x), soft = (rule, msg) => { if (!dep[rule]) W.push(`concept ${id}: ${msg} (a default, not a law: keep it and record { rule: "${rule}", why } in departures)`); };
    if (plan.length >= 5) {
      const distinct = new Set(types); if (distinct.size < 5) soft("scene-variety", `scene_plan has ${distinct.size} scene type(s) (5 or more is the default in a 45 s film: type-slate, type-collage, ui-proof, ui-collage, cinematic-image, diagram, data, kinetic-list, object-shot, typed-prompt, footage, logo-end)`);
      const cnt = {}; types.forEach((t) => { cnt[t] = (cnt[t] || 0) + 1; }); const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] / types.length > 0.34) soft("scene-variety", `scene type "${top[0]}" is ${top[1]} of ${types.length} beats (about 30% is the default ceiling)`);
      const tx = plan.map((b) => _lw(b && b.texture)); if (!tx.some((t) => /step|flicker|glitch/.test(t)) && !(Array.isArray(x.texture_accents) && x.texture_accents.length)) soft("texture", "no stepped, flicker or glitch accent (texture_accents[] or scene_plan[].texture): an all-smooth film is a choice to explain");
    }
    // the structure: the hook > turn > meet > capabilities > payoff arc is the default candidate, one of several (references/launch-grammar.md section 16)
    const st = x && x.structure, kind = _lw(st && typeof st === "object" ? st.kind || st.id || st.name : st).replace(/ /g, "-"), why = S(st && typeof st === "object" ? st.why || st.reason : "");
    if (!kind) W.push(`concept ${id}: no structure { kind, why } (${STRUCTURES.join(" | ")}): name the structure and say why it fits the product and its distribution (launch-grammar.md section 16)`);
    else { if (!STRUCTURES.includes(kind)) W.push(`concept ${id}: structure "${kind}" is not one of ${STRUCTURES.join(", ")}`); if (why.length < 15) W.push(`concept ${id}: structure "${kind}" has no why: say why it fits the product and where the film is shown`); }
  }
  const hits = [...new Set(lines.flatMap(buzzwordHits))];
  if (hits.length) W.push(`concept ${id}: ${buzzwordMessage("the copy", hits)}; ${BUZZWORD_FIX}`);
  return W;
}
